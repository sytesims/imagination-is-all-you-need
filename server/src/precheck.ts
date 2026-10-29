/**
 * Pre-run checks (per spec: a static source gives a static result, Object Swap fails when the stand-in prop
 * differs in size or shape, start-frame eligibility check). Advisory only: returns warnings, never blocks a run.
 * POST /api/precheck (multipart): video?, refs[]?, image? (start frame), toolId?, bbox? "x,y,w,h" (0..1), point? "x,y[,t]",
 * aspect? target aspect for i2v ("16:9" | "9:16" | "1:1" …), refs[]/photos[] (reference photos, any tool incl. toolId=soul),
 * audio[]/samples[] (voice samples; minSeconds? default 3). blocking=true (ok=false) only when a file can't be used at all:
 * unreadable, all-black, too_short or silent audio. Everything else is advisory.
 */
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { DATA_DIR } from './config.js';
import { probe } from './media.js';
import { checkAudio, checkImage } from './mediaCheck.js';

const AUD = /\.(wav|mp3|m4a|aac|ogg|flac|opus)$/i;
/** Fields whose files are checked as images (refs, Soul reference photos, characters) or audio (voice samples). */
const IMAGE_FIELDS = ['refs', 'ref', 'photos', 'characters', 'character', 'faces', 'reference'];
const AUDIO_FIELDS = ['audio', 'samples', 'voiceSamples', 'voiceSample', 'sample'];

export interface PrecheckWarning { code: 'static_clip' | 'prop_aspect' | 'prop_size' | 'low_res' | 'aspect_mismatch' | 'blurry' | 'dark' | 'unreadable' | 'too_short' | 'too_long' | 'silent'; field: string; severity: 'info' | 'warn'; message: string }

function ff(args: string[], ms = 20000): Promise<string> {
  return new Promise((resolve) => {
    const c = spawn('ffmpeg', ['-hide_banner', '-nostats', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; const t = setTimeout(() => c.kill('SIGKILL'), ms);
    c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; if (out.length > 400_000) out = out.slice(-200_000); });
    c.on('close', () => { clearTimeout(t); resolve(out); }); c.on('error', () => { clearTimeout(t); resolve(''); });
  });
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Motion score = mean absolute luma difference between frames sampled at 4 fps (0..255, small frames). */
export const STATIC_THRESHOLD = 1.5;
export async function motionScore(file: string): Promise<number | null> {
  const out = await ff(['-t', '15', '-i', file, '-an', '-vf', 'fps=4,scale=160:-2,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-']);
  const ys = [...out.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => Number(m[1])).slice(1); // first blend is vs. nothing
  return ys.length ? Math.round(mean(ys) * 100) / 100 : null;
}
/** Bounding box of opaque pixels in a cutout PNG (null when fully opaque / no alpha). Normalized 0..1. */
async function alphaBox(file: string, w: number, h: number): Promise<{ w: number; h: number } | null> {
  const out = await ff(['-i', file, '-vf', 'alphaextract,cropdetect=limit=0.1:round=1:reset=0', '-frames:v', '2', '-f', 'null', '-']);
  const m = [...out.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].at(-1);
  if (!m) return null; const cw = Number(m[1]), ch = Number(m[2]);
  return cw > 0 && ch > 0 && (cw < w * 0.98 || ch < h * 0.98) ? { w: cw / w, h: ch / h } : null;
}
/** Sharpness: blurdetect (0 = sharp … higher = blurrier) + mean luma. */
async function frameStats(file: string): Promise<{ blur: number | null; luma: number | null }> {
  const out = await ff(['-i', file, '-frames:v', '1', '-vf', 'format=gray,blurdetect,signalstats,metadata=print', '-f', 'null', '-']);
  const b = /lavfi\.blur=([\d.]+)/.exec(out); const y = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(out);
  return { blur: b ? Number(b[1]) : null, luma: y ? Number(y[1]) : null };
}
const parseBox = (v?: string) => { if (!v) return null; const [x, y, w, h] = v.split(',').map(Number); return [x, y, w, h].every((n) => n >= 0 && n <= 1) && w > 0 && h > 0 ? { x, y, w, h } : null; };
const ASPECTS: Record<string, number> = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:3': 4 / 3, '3:4': 3 / 4, '21:9': 21 / 9 };

export async function runPrecheck(fields: Record<string, string>, files: Record<string, string[]>) {
  const f = files; const warnings: PrecheckWarning[] = []; const checks: Record<string, any> = {};
  const w = (x: PrecheckWarning) => warnings.push(x); let blocking = false; // true only for files that can't be used at all (unreadable, all-black, too short, silent)
  const video = f.video?.[0] ? path.join(DATA_DIR, f.video[0]) : null;
  let vp: Awaited<ReturnType<typeof probe>> = null;
  if (video) {
    vp = await probe(video);
    const score = vp ? await motionScore(video) : null;
    const isStatic = score != null && score < STATIC_THRESHOLD;
    checks.motion = { score, threshold: STATIC_THRESHOLD, static: isStatic };
    if (!vp) w({ code: 'unreadable', field: 'video', severity: 'warn', message: "Couldn't read this video." });
    else if (isStatic) w({ code: 'static_clip', field: 'video', severity: 'warn', message: 'This clip has very little motion. A static source gives a static result: try a clip with camera or subject movement.' });
  }
  // Prop fit (Object Swap): reference shape vs the clicked mask / bounding box on the frame.
  const box = parseBox(fields.bbox || fields.mask);
  const ref = f.refs?.[0] ?? f.image?.[0];
  if (box && ref && video && vp) {
    const rp = await probe(path.join(DATA_DIR, ref));
    if (rp) {
      const ab = await alphaBox(path.join(DATA_DIR, ref), rp.width, rp.height);
      const refAspect = ab ? (ab.w * rp.width) / (ab.h * rp.height) : rp.width / rp.height;
      const boxAspect = (box.w * vp.width) / (box.h * vp.height);
      const ratio = Math.max(refAspect, boxAspect) / Math.min(refAspect, boxAspect);
      const area = box.w * box.h;
      checks.prop = { refAspect: +refAspect.toFixed(3), boxAspect: +boxAspect.toFixed(3), aspectRatio: +ratio.toFixed(2), boxArea: +area.toFixed(4), refCutout: !!ab };
      if (ratio > 1.6) w({ code: 'prop_aspect', field: 'refs[0]', severity: 'warn', message: `The reference is ${refAspect > boxAspect ? 'wider' : 'taller'} than the object you picked (shape differs ${ratio.toFixed(1)}×). Swaps work best when the stand-in and the reference have a similar size and shape.` });
      if (area < 0.005) w({ code: 'prop_size', field: 'bbox', severity: 'warn', message: 'The selected object is very small in frame; detail from the reference may be lost.' });
      else if (area > 0.6) w({ code: 'prop_size', field: 'bbox', severity: 'info', message: 'The selected area covers most of the frame; the swap may change the whole scene.' });
    }
  } else if (fields.point && !box) checks.prop = { skipped: 'send bbox "x,y,w,h" (0..1) to compare shapes' };
  // Start frame (i2v): resolution, aspect, blur, exposure. Faces: not checked (no face model; see CLEANROOM decisions).
  const sf = f.image?.[0] ?? f.startFrame?.[0];
  if (sf) {
    const sfc = await checkImage(path.join(DATA_DIR, sf), 'image');
    const p = sfc.issues.some((i) => i.code === 'unreadable') ? null : await probe(path.join(DATA_DIR, sf));
    if (sfc.issues.some((i) => i.code === 'dark' && i.severity === 'block')) blocking = true;
    if (!p) { blocking = true; w({ code: 'unreadable', field: 'image', severity: 'warn', message: "Couldn't read this image." }); checks.startFrame = { usable: false }; }
    else {
      const px = p.width * p.height; const st = await frameStats(path.join(DATA_DIR, sf));
      const aspect = p.width / p.height; const want = ASPECTS[fields.aspect || ''] ?? null;
      const lowRes = px < 409_600; const blurry = st.blur != null && st.blur > 15; const dark = st.luma != null && (st.luma < 20 || st.luma > 240);
      const mismatch = want != null && Math.max(aspect, want) / Math.min(aspect, want) > 1.15;
      if (lowRes) w({ code: 'low_res', field: 'image', severity: 'warn', message: `Start frame is ${p.width}×${p.height}; at least 854×480 (409,600 px) is recommended.` });
      if (mismatch) w({ code: 'aspect_mismatch', field: 'image', severity: 'info', message: `Start frame is ${aspect.toFixed(2)}:1 but the output is ${fields.aspect}; it will be cropped or padded.` });
      if (blurry) w({ code: 'blurry', field: 'image', severity: 'warn', message: 'Start image looks blurry; a sharper start image gives a sharper result.' });
      if (dark) w({ code: 'dark', field: 'image', severity: 'info', message: st.luma! < 20 ? 'Start frame is very dark.' : 'Start frame is very bright / washed out.' });
      checks.startFrame = { width: p.width, height: p.height, aspect: +aspect.toFixed(3), targetAspect: fields.aspect || null, blur: st.blur, luma: st.luma, faces: null, usable: !lowRes && !blurry };
    }
  }
  // Reference images (Create Image refs, OpenSoul reference photos, characters): unreadable / low_res / dark.
  for (const fld of IMAGE_FIELDS) for (const [k, name] of (f[fld] ?? []).entries()) {
    if (AUD.test(name)) continue; // audio refs are checked below
    const c = await checkImage(path.join(DATA_DIR, name), `${fld}[${k}]`);
    (checks.refs ??= []).push({ field: `${fld}[${k}]`, width: c.width ?? null, height: c.height ?? null, luma: c.luma ?? null, usable: c.ok });
    for (const i of c.issues) { if (i.severity === 'block') blocking = true; w({ code: i.code as PrecheckWarning['code'], field: i.field, severity: i.severity === 'info' ? 'info' : 'warn', message: i.message }); }
  }
  // Audio (voice samples, audio refs): unreadable / too_short / silent.
  for (const fld of [...AUDIO_FIELDS, ...IMAGE_FIELDS]) for (const [k, name] of (f[fld] ?? []).entries()) {
    if (IMAGE_FIELDS.includes(fld) && !AUD.test(name)) continue;
    const c = await checkAudio(path.join(DATA_DIR, name), `${fld}[${k}]`, Number(fields.minSeconds) > 0 ? Number(fields.minSeconds) : undefined);
    (checks.audio ??= []).push({ field: `${fld}[${k}]`, duration: c.duration ?? null, maxVolumeDb: c.maxVolumeDb ?? null, usable: c.ok });
    for (const i of c.issues) { if (i.severity === 'block') blocking = true; w({ code: i.code as PrecheckWarning['code'], field: i.field, severity: i.severity === 'info' ? 'info' : 'warn', message: i.message }); }
  }
  if (fields.toolId) checks.toolId = fields.toolId;
  return { ok: !blocking, blocking, warnings, checks };
}

/** BH4 #4 (G10): precheck temp files are DATA_DIR/pre-<8 hex>.<ext>. Each request removes its own when it ends; this sweep removes
 *  stale ones left by older builds or a crash (older than maxAgeMs). Only that exact pattern, only directly under DATA_DIR (never /tmp). */
export const PRE_RE = /^pre-[0-9a-f]{8}\.[a-z0-9]{1,8}$/;
export function sweepPrecheckTemps(maxAgeMs = 3600_000, now = Date.now()) {
  let files = 0, bytes = 0;
  try { for (const f of readdirSync(DATA_DIR)) { if (!PRE_RE.test(f)) continue; const p = path.join(DATA_DIR, f);
    try { const st = statSync(p); if (!st.isFile() || now - st.mtimeMs < maxAgeMs) continue; rmSync(p, { force: true }); files++; bytes += st.size; } catch { /* gone */ } } } catch { /* no dir yet */ }
  return { files, bytes };
}
export function registerPrecheck(app: FastifyInstance) {
  { const r = sweepPrecheckTemps(); if (r.files) app.log.info(r, 'removed stale precheck temp files'); }
  setInterval(() => sweepPrecheckTemps(), 3600_000).unref();
  app.post('/api/precheck', async (req, reply) => {
    const fields: Record<string, string> = {}; const files: Record<string, string[]> = {};
    mkdirSync(DATA_DIR, { recursive: true });
    try {
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const ext = (path.extname(part.filename || '') || '.bin').toLowerCase().replace(/[^.a-z0-9]/g, '');
        const name = `pre-${randomUUID().slice(0, 8)}${ext}`;
        (files[part.fieldname] ??= []).push(name); // recorded before the write so a failed stream is cleaned up too
        await pipeline(part.file, createWriteStream(path.join(DATA_DIR, name)));
      } else fields[part.fieldname] = String(part.value);
    }
    if (!Object.keys(files).length) return reply.code(400).send({ error: 'Send a file to check: video (swap tools), image (start frame), refs (reference photos, e.g. toolId=soul) or audio (voice samples).', errorType: 'validation' });
    return await runPrecheck(fields, files);
    } finally { for (const n of Object.values(files).flat()) if (PRE_RE.test(n)) rmSync(path.join(DATA_DIR, n), { force: true }); } // temps never outlive the request
  });
}
