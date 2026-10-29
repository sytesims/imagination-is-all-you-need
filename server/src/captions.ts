/**
 * Captions + SRT (roadmap-10 #2). Whisper's timed segments (voiceRunner.transcribeSegments, local and free) become subtitle cues: about 42
 * characters a line and at most 2 lines a cue, written as SRT and WebVTT. A Translate Video result uses the exact translated words, timed over
 * the speech Whisper hears in the result. Burn-in follows shareExport.ts (this ffmpeg has no drawtext or subtitles): the browser draws one
 * transparent PNG strip per cue and ffmpeg overlays each with enable='between(t,a,b)' into a new job in Assets ($0, like Stitch).
 *  GET  /api/captions/status                 { ready, model, steps } (is the voice runner set up here; never installs anything)
 *  GET  /api/jobs/:id/captions?out=0         { state: ready | nospeech | none | setup | nomedia, defaultOn, language, cues, srt, vtt }
 *  POST /api/jobs/:id/captions {out, force}  makes (or reuses) <DATA_DIR>/captions/<id>.srt / .vtt (out > 0: <id>-o<out>.*)
 *  GET  /api/jobs/:id/captions.srt | .vtt    the files (?out=, ?download=1 for an attachment)
 *  POST /api/jobs/:id/captions/burn          multipart: cues (JSON [{start, end, y}]), cue0…cueN (PNG strips, the video's width) → a new job
 */
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { jobs, persistJob, type Job } from './jobs.js';
import * as lib from './library.js';
import { ownerOf, LOCAL_OWNER } from './owner.js';
import { hasAudio, mediaDuration, runFfmpeg, videoSize } from './ffmpeg.js';
import { dataFileOf, VIDEO_RE, AUDIO_RE } from './cleanMedia.js';
import { pngSize } from './shareExport.js';
import { recordSpend, settleSpend } from './billing.js';
import { transcribeSegments, voiceRunnerReady, type Segment } from './voiceRunner.js';

export const LINE_MAX = 42, MAX_LINES = 2;
export type Cue = { start: number; end: number; lines: string[] };

/** Greedy word wrap at `max` characters; a word longer than a line is cut. */
export function wrapLines(text: string, max = LINE_MAX): string[] {
  const out: string[] = []; let cur = '';
  for (let w of text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)) {
    while (w.length > max) { if (cur) { out.push(cur); cur = ''; } out.push(w.slice(0, max)); w = w.slice(max); }
    if (!w) continue;
    if (!cur) cur = w; else if (cur.length + 1 + w.length <= max) cur += ` ${w}`; else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur); return out;
}
/** Two lines that read evenly: the break nearest the middle (only when the text doesn't fit one line). */
function balance(text: string, max = LINE_MAX): string[] {
  if (text.length <= max) return [text];
  const ws = text.split(' '); let best: string[] | null = null, diff = Infinity;
  for (let i = 1; i < ws.length; i++) { const a = ws.slice(0, i).join(' '), b = ws.slice(i).join(' '); if (a.length > max || b.length > max) continue; const d = Math.abs(a.length - b.length); if (d < diff) { diff = d; best = [a, b]; } }
  return best ?? wrapLines(text, max);
}
/** Words split into n groups of about equal length (no one-word leftovers). */
function splitEven(words: string[], n: number): string[] {
  const total = words.reduce((s, w) => s + w.length + 1, 0); const out: string[][] = [[]]; let acc = 0;
  for (const w of words) { const mid = acc + (w.length + 1) / 2; if (out[out.length - 1].length && mid > (total * out.length) / n && out.length < n) out.push([]); out[out.length - 1].push(w); acc += w.length + 1; }
  return out.map((g) => g.join(' '));
}
/** Text over [start, end] → the fewest cues of at most MAX_LINES lines, evenly filled, each timed by its share of the characters. */
function chunk(text: string, start: number, end: number, max = LINE_MAX): Cue[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean); if (!words.length) return [];
  let groups: string[] = [words.join(' ')];
  for (let n = Math.max(1, Math.ceil(words.join(' ').length / (max * MAX_LINES))); n <= words.length; n++) { groups = splitEven(words, n); if (groups.every((g) => wrapLines(g, max).length <= MAX_LINES)) break; }
  /* a word longer than two lines: its cut pieces go two lines a cue */
  const parts = groups.flatMap((g) => { const ls = wrapLines(g, max); if (ls.length <= MAX_LINES) return [{ text: g, lines: balance(g, max) }]; const o = []; for (let i = 0; i < ls.length; i += MAX_LINES) o.push({ text: ls.slice(i, i + MAX_LINES).join(' '), lines: ls.slice(i, i + MAX_LINES) }); return o; });
  const total = parts.reduce((s, g) => s + g.text.length, 0) || 1; let t = start; const span = Math.max(0, end - start);
  return parts.map((g, i) => { const e = i === parts.length - 1 ? end : t + span * (g.text.length / total); const c = { start: t, end: e, lines: g.lines }; t = e; return c; });
}
const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** Whisper segments → cues (a long segment is split; cues never overlap). */
export function cuesFromSegments(segs: Segment[], max = LINE_MAX): Cue[] {
  const out = segs.flatMap((s) => chunk(s.text, s.start, s.end, max));
  for (let i = 0; i < out.length; i++) { out[i].start = r3(out[i].start); out[i].end = r3(Math.max(out[i].start + 0.2, out[i].end)); if (i > 0 && out[i].start < out[i - 1].end) out[i - 1].end = out[i].start; }
  return out.filter((c) => c.end > c.start);
}
/** The exact `text` (a translation) laid over the speech Whisper heard: each cue's place in the text maps to the same place in the speech time. */
export function alignText(text: string, speech: Segment[], max = LINE_MAX): Cue[] {
  const spans = speech.filter((s) => s.end > s.start); const talk = spans.reduce((s, x) => s + (x.end - x.start), 0); if (!text.trim() || !talk) return [];
  const at = (f: number) => { let left = f * talk; for (const s of spans) { const d = s.end - s.start; if (left <= d) return s.start + left; left -= d; } return spans[spans.length - 1].end; };
  const parts = chunk(text, 0, 1, max); return cuesFromSegments(parts.map((c) => ({ start: at(c.start), end: at(c.end), text: c.lines.join(' ') })), max);
}
const stamp = (s: number, sep: string) => { const ms = Math.max(0, Math.round(s * 1000)); const h = Math.floor(ms / 3_600_000), m = Math.floor(ms / 60_000) % 60, x = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}${sep}${String(ms % 1000).padStart(3, '0')}`; };
export const toSrt = (cues: Cue[]) => cues.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.lines.join('\n')}\n`).join('\n');
export const toVtt = (cues: Cue[]) => `WEBVTT\n\n${cues.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.lines.map((l) => l.replace(/-->/g, '->')).join('\n')}\n`).join('\n')}`;

/** Talking or voiced results get captions on by default (speech, lip sync, talking photos, dubbing, change voice, UGC ads). */
const VOICED_TOOLS = new Set(['voice', 'translate-video', 'change-voice', 'ugc-ad']);
export function captionsDefaultOn(j: { toolId?: string; input?: any }): boolean {
  const t = String(j.toolId ?? ''); const inp = j.input ?? {}; const types = String(inp.types ?? '');
  if (VOICED_TOOLS.has(t) || /talk|lip|speech|dub|narrat|tts|translate/i.test(t)) return true;
  if (/translate|lipsync|speech|tts|change-voice|talking/i.test(types)) return true;
  return ['speech', 'dialogue', 'script', 'voiceText', 'line'].some((k) => typeof inp[k] === 'string' && inp[k].trim().length > 0);
}
export const isTranslateJob = (j: { toolId?: string; input?: any }) => j.toolId === 'translate-video' || /translate/.test(String(j.input?.types ?? ''));

export const CAPTIONS_DIR = () => path.join(DATA_DIR, 'captions');
const base = (id: string, out: number) => path.join(CAPTIONS_DIR(), out > 0 ? `${id}-o${out}` : id);
type Stored = { state: 'ready' | 'nospeech'; language: string; cues: Cue[]; key: string; source: 'whisper' | 'translation' };
const keyOf = (file: string) => { const s = statSync(file); return `${path.basename(file)}|${s.size}|${Math.round(s.mtimeMs)}`; };
function readStored(id: string, out: number, file: string): Stored | null {
  try { const s = JSON.parse(readFileSync(`${base(id, out)}.json`, 'utf8')) as Stored; return s.key === keyOf(file) ? s : null; } catch { return null; }
}
/** The job's media at output `out` (video or audio on this computer), or null. */
export function mediaOf(j: Job, out = 0): string | null {
  const o = j.outputs[out] ?? (out === 0 && (j as any).resultUrl ? { url: (j as any).resultUrl } : null); if (!o) return null;
  const u = String(o.url).split('?')[0]; if (!VIDEO_RE.test(u) && !AUDIO_RE.test(u)) return null; return dataFileOf(u);
}
/** One Whisper run at a time (it uses every CPU core); the same request while running waits for the same result. */
const running = new Map<string, Promise<Stored>>(); let chain: Promise<unknown> = Promise.resolve();
export async function makeCaptions(j: Job, out: number, file: string, force = false): Promise<Stored> {
  if (!force) { const s = readStored(j.id, out, file); if (s) return s; }
  const k = `${j.id}:${out}`; const busy = running.get(k); if (busy) return busy;
  const run = async () => {
    const lang = isTranslateJob(j) ? String(j.input?.translatedText?.language ?? j.input?.language ?? '') || null : null;
    const tr = VIDEO_RE.test(file) && !(await hasAudio(file)) ? { text: '', language: lang ?? '', segments: [] as Segment[] } : await transcribeSegments(file, lang);
    const said = typeof j.input?.translatedText?.text === 'string' && isTranslateJob(j) ? String(j.input.translatedText.text) : '';
    const cues = said && tr.segments.length ? alignText(said, tr.segments) : cuesFromSegments(tr.segments);
    const s: Stored = { state: cues.length ? 'ready' : 'nospeech', language: lang ?? tr.language, cues, key: keyOf(file), source: said && tr.segments.length ? 'translation' : 'whisper' };
    mkdirSync(CAPTIONS_DIR(), { recursive: true }); const b = base(j.id, out);
    writeFileSync(`${b}.json`, JSON.stringify(s)); if (cues.length) { writeFileSync(`${b}.srt`, toSrt(cues)); writeFileSync(`${b}.vtt`, toVtt(cues)); } else { rmSync(`${b}.srt`, { force: true }); rmSync(`${b}.vtt`, { force: true }); }
    return s;
  };
  // the run starts only when the one before it ended (one Whisper at a time), and its failure is always handled here or by the caller
  const queued = chain.then(run, run); chain = queued.catch(() => 0);
  const p = queued.finally(() => running.delete(k)); running.set(k, p); return p;
}
/** Remove a job's captions (trash / purge). */
export function dropCaptions(jobId: string) { const dir = CAPTIONS_DIR(); if (!existsSync(dir)) return; for (const f of readdirSync(dir)) if (f.startsWith(`${jobId}.`) || f.startsWith(`${jobId}-o`)) rmSync(path.join(dir, f), { force: true }); }
lib.trashHooks.push(dropCaptions);

export const SETUP_STEPS = [
  'Install Python 3.10 or newer.',
  'From the app folder: python3 -m venv server/py/.venv',
  'Then: server/py/.venv/bin/pip install faster-whisper==1.2.1 av==16.1.0 (or the whole of server/py/requirements.txt)',
  'The first captions download the Whisper base model (about 145 MB) once. Nothing else is needed.',
];
export const captionsStatus = () => { const r = voiceRunnerReady(); return { ready: r.ready, model: process.env.OPENHIGGSFIELD_WHISPER_MODEL || 'base', steps: SETUP_STEPS }; };
const view = (j: Job, out: number, s: Stored | null, state?: string) => ({
  state: state ?? s?.state ?? 'none', defaultOn: captionsDefaultOn(j), language: s?.language ?? null, source: s?.source ?? null, cues: s?.cues ?? [],
  srt: s?.state === 'ready' ? `/api/jobs/${j.id}/captions.srt${out ? `?out=${out}` : ''}` : null, vtt: s?.state === 'ready' ? `/api/jobs/${j.id}/captions.vtt${out ? `?out=${out}` : ''}` : null });

const MAX_CUES = 400; const MAX_PNG = 8 * 1024 * 1024;
/** ffmpeg args: the source with each cue strip overlaid at (0, y) between its times. Exported for tests. */
export function burnArgs(src: string, strips: { file: string; start: number; end: number; y: number }[], out: string, p: { w: number; h: number; audio: boolean }) {
  const W = p.w - (p.w % 2), H = p.h - (p.h % 2); const inputs = ['-i', src, ...strips.flatMap((s) => ['-i', s.file])];
  const f: string[] = []; let last = `[0:v]scale=${W}:${H},setsar=1[b0]`; f.push(last); let cur = 'b0';
  strips.forEach((s, i) => { const nx = `b${i + 1}`; f.push(`[${cur}][${i + 1}:v]overlay=0:${Math.round(s.y)}:eof_action=repeat:enable='between(t,${s.start.toFixed(3)},${s.end.toFixed(3)})'[${nx}]`); cur = nx; });
  f.push(`[${cur}]format=yuv420p[v]`);
  return ['-y', '-v', 'error', ...inputs, '-filter_complex', f.join(';'), '-map', '[v]', ...(p.audio ? ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '160k'] : []), '-c:v', 'libx264', '-crf', '19', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out];
}

export function registerCaptions(app: FastifyInstance) {
  const outOf = (q: any) => Math.max(0, Math.min(63, Math.floor(Number(q?.out) || 0)));
  const jobOr404 = (id: string, reply: any) => { const j = jobs.get(id); if (!j || lib.metaOf(j.id).deletedAt) { reply.code(404).send({ error: 'not found', errorType: 'not_found' }); return null; } return j; };
  app.get('/api/captions/status', async () => captionsStatus());
  /** Captions for any sound or video on this computer (Stitch's voice track, which may be an upload): {url, jobId?} → {state, cues, source}.
   *  Whisper when it's set up here; without it, a voice made from a script (TTS: the job's text) gets that text timed evenly over the voice. */
  app.post<{ Body: { url?: unknown; jobId?: unknown } }>('/api/captions/file', async (req, reply) => {
    const u = String(req.body?.url ?? '').split('?')[0]; const file = /^\/files\/[^/]+$/.test(u) ? dataFileOf(u) : null;
    if (!file || !existsSync(file) || !(VIDEO_RE.test(file) || AUDIO_RE.test(file))) return reply.code(400).send({ error: 'url must be a /files/ sound or video on this computer.', errorType: 'validation', issues: [{ code: 'invalid', field: 'url', message: '/files/…' }] });
    const src = typeof req.body?.jobId === 'string' ? jobs.get(req.body.jobId) : undefined;
    const script = [src?.input?.text, src?.input?.script, src?.input?.speech, src?.input?.prompt].find((t) => typeof t === 'string' && t.trim().length > 0) as string | undefined;
    if (!captionsStatus().ready) {
      if (src && script && /voice|tts|speech|audio/i.test(String(src.toolId))) { const dur = await mediaDuration(file); const cues = dur > 0 ? cuesFromSegments([{ start: 0, end: dur, text: script }]) : [];
        return { state: cues.length ? 'ready' : 'nospeech', source: 'script', language: null, cues }; }
      return reply.code(503).send({ error: 'Captions need a one-time setup.', errorType: 'setup', code: 'captions_setup', steps: SETUP_STEPS, state: 'setup', cues: [] });
    }
    const id = `file-${path.basename(file).replace(/[^\w.-]/g, '').replace(/\./g, '_')}`; const pseudo = { id, toolId: src?.toolId ?? 'upload', input: {}, outputs: [] } as unknown as Job;
    try { const s = await makeCaptions(pseudo, 0, file); return { state: s.state, source: s.source, language: s.language, cues: s.cues }; }
    catch (e: any) { return reply.code(500).send({ error: `Couldn’t make captions: ${String(e?.message ?? e).slice(0, 300)}`, errorType: 'internal', code: 'captions_failed' }); }
  });
  app.get<{ Params: { id: string }; Querystring: { out?: string } }>('/api/jobs/:id/captions', async (req, reply) => {
    const j = jobOr404(req.params.id, reply); if (!j) return reply; const out = outOf(req.query); const file = mediaOf(j, out);
    if (!file) return view(j, out, null, 'nomedia');
    const s = readStored(j.id, out, file); if (s) return view(j, out, s);
    return view(j, out, null, captionsStatus().ready ? 'none' : 'setup');
  });
  app.post<{ Params: { id: string }; Body: { out?: unknown; force?: unknown } }>('/api/jobs/:id/captions', async (req, reply) => {
    const j = jobOr404(req.params.id, reply); if (!j) return reply; if (ownerOf(j) !== LOCAL_OWNER) return reply.code(403).send({ error: 'Only the owner can make captions for this.', errorType: 'forbidden' });
    const out = outOf(req.body); const file = mediaOf(j, out);
    if (!file) return reply.code(409).send({ error: 'This result has no video or sound on this computer to caption.', errorType: 'validation', code: 'no_media' });
    const force = req.body?.force === true || req.body?.force === 1 || req.body?.force === '1';
    if (!force) { const s = readStored(j.id, out, file); if (s) return { ...view(j, out, s), cached: true }; }
    if (!captionsStatus().ready) return reply.code(503).send({ error: 'Captions need a one-time setup.', errorType: 'setup', code: 'captions_setup', steps: SETUP_STEPS, ...view(j, out, null, 'setup') });
    try { return { ...view(j, out, await makeCaptions(j, out, file, force)), cached: false }; }
    catch (e: any) { return reply.code(500).send({ error: `Couldn’t make captions: ${String(e?.message ?? e).slice(0, 300)}`, errorType: 'internal', code: 'captions_failed' }); }
  });
  for (const ext of ['srt', 'vtt'] as const) app.get<{ Params: { id: string }; Querystring: { out?: string; download?: string } }>(`/api/jobs/:id/captions.${ext}`, async (req, reply) => {
    const j = jobOr404(req.params.id, reply); if (!j) return reply; const out = outOf(req.query); const f = `${base(j.id, out)}.${ext}`;
    if (!existsSync(f)) return reply.code(404).send({ error: 'No captions yet. Make them first.', errorType: 'not_found' });
    reply.type(ext === 'srt' ? 'application/x-subrip; charset=utf-8' : 'text/vtt; charset=utf-8').header('cache-control', 'no-cache');
    if (req.query.download) reply.header('content-disposition', `attachment; filename="${j.id}${out ? `-${out + 1}` : ''}.${ext}"`);
    return reply.send(readFileSync(f, 'utf8'));
  });
  app.post<{ Params: { id: string } }>('/api/jobs/:id/captions/burn', async (req, reply) => {
    const j = jobOr404(req.params.id, reply); if (!j) return reply; if (ownerOf(j) !== LOCAL_OWNER) return reply.code(403).send({ error: 'Only the owner can do this.', errorType: 'forbidden' });
    const fields: Record<string, string> = {}; const files: Record<string, Buffer> = {};
    try { for await (const part of (req as any).parts()) { if (part.type === 'file') { const b: Buffer = await part.toBuffer(); if (b.length > MAX_PNG) return reply.code(413).send({ error: 'A caption image is too large.', errorType: 'validation' }); files[part.fieldname] = b; } else fields[part.fieldname] = String(part.value ?? ''); } }
    catch { return reply.code(400).send({ error: 'Send multipart form data: cues (JSON) and one PNG per cue (cue0, cue1, …).', errorType: 'validation' }); }
    const out = outOf(fields); const src = mediaOf(j, out);
    if (!src || !VIDEO_RE.test(src)) return reply.code(409).send({ error: 'Burn in works on videos on this computer.', errorType: 'validation', code: 'no_video' });
    let cues: { start: number; end: number; y: number }[]; try { cues = JSON.parse(fields.cues || '[]'); } catch { return reply.code(400).send({ error: 'cues must be JSON.', errorType: 'validation' }); }
    if (!Array.isArray(cues) || !cues.length || cues.length > MAX_CUES) return reply.code(400).send({ error: `cues must list 1–${MAX_CUES} captions.`, errorType: 'validation', issues: [{ code: 'invalid', field: 'cues', message: `1–${MAX_CUES}` }] });
    const [size, dur, audio] = await Promise.all([videoSize(src), mediaDuration(src), hasAudio(src)]);
    if (!size || !dur) return reply.code(422).send({ error: 'Could not read this video.', errorType: 'validation' });
    const W = size.width - (size.width % 2), H = size.height - (size.height % 2);
    const id = randomUUID().slice(0, 8); const tmp = path.join(DATA_DIR, `.${id}-cc`); mkdirSync(tmp, { recursive: true });
    try {
      const strips = [] as { file: string; start: number; end: number; y: number }[];
      for (const [i, c] of cues.entries()) {
        const png = files[`cue${i}`]; const sz = png ? pngSize(png) : null; const start = Number(c?.start), end = Number(c?.end), y = Number(c?.y);
        if (!sz || sz.width !== W || sz.height > H) return reply.code(400).send({ error: `Caption ${i + 1} must be a PNG ${W} px wide.`, errorType: 'validation', issues: [{ code: 'invalid', field: `cue${i}`, message: `PNG, ${W} px wide` }] });
        if (!(end > start) || start < 0 || !Number.isFinite(y)) return reply.code(400).send({ error: `Caption ${i + 1} needs start < end and a y.`, errorType: 'validation' });
        const f = path.join(tmp, `c${i}.png`); writeFileSync(f, png); strips.push({ file: f, start, end: Math.min(end, dur), y: Math.max(0, Math.min(H - sz.height, y)) });
      }
      const outName = `${id}-cc.mp4`; const outFile = path.join(DATA_DIR, outName);
      const code = await runFfmpeg(burnArgs(src, strips, outFile, { w: size.width, h: size.height, audio }));
      if (code !== 0 || !existsSync(outFile)) { rmSync(outFile, { force: true }); return reply.code(500).send({ error: `ffmpeg could not burn in the captions (exit ${code}). Nothing was charged.`, errorType: 'server' }); }
      const now = Date.now(); const pr = String(j.input?.prompt ?? '').trim();
      const job: Job = { id, toolId: 'compose', provider: 'local-ffmpeg', status: 'done', stage: 'done', progress: 100, queuePos: 0, eta: 0, resultUrl: `/files/${outName}`, outputs: [{ label: 'Captioned video', url: `/files/${outName}` }],
        error: null, errorType: null, warnings: [], parentId: j.id, createdAt: now, startedAt: now, finishedAt: Date.now(), updatedAt: Date.now(), cost: 0, refunded: 0,
        input: { prompt: pr ? `Captions burned in: ${pr.slice(0, 180)}` : 'Captions burned in', captionsOf: j.id, clipUrls: [j.outputs[out]?.url ?? null].filter(Boolean), clipJobIds: [j.id], duration: dur, width: W, height: H },
        modelName: 'ffmpeg (local)', runOn: 'local' } as Job;
      jobs.set(id, job); persistJob(job); recordSpend(job, 0); settleSpend(job);
      return { ok: true, id, toolId: 'compose', status: 'done', outputs: job.outputs, resultUrl: job.resultUrl, cues: strips.length, cost: 0 };
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });
}
