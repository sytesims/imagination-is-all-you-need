/**
 * Object Swap mask preview:
 *   GET  /api/tools/object-swap/mask-preview  → {available, backend, engine, reason}  (lets the UI hide the preview cleanly)
 *   POST /api/tools/object-swap/mask-preview  multipart: video (file) | videoUrl (/files|/samples), firstFrame (image, optional: used instead of the
 *        video frame), matte (mask video, maskMode=upload), swapType person|object, maskMode text|point|upload|none, maskPrompt (≤ 32 tokens),
 *        point "x,y[,t]" (0–1 normalised), t (s), maskGrow tight|normal|loose|box
 *     → {maskUrl (frame t with the area tinted), matteUrl (white = replace), frameUrl, count, bboxes[{x,y,width,height,score}], width, height, t,
 *        maskMode, maskGrow, growPx, credits: 0, free: true, backend, engine, mock}
 * Always free (0 credits, never charged, no job). Mock backend: a plausible ellipse/box mask at the click point (or centre).
 * comfy backend: one-frame SAM 3.1 (core SAM3_Detect) on the local ComfyUI when it has the node; otherwise 503 mask_preview_unavailable
 * (the UI hides the preview and the mask is computed inside the job). Rate-limited per caller.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { comfyAuthFor } from './security/keyHosts.js';
import { createWriteStream, existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { DATA_DIR, SAMPLES_DIR, config } from './config.js';
import { probe } from './media.js';
import { runFfmpeg } from './ffmpeg.js';

import { MASK_GROW_PX, type MaskGrow as Grow } from './comfy/objectSwap.js';
export { MASK_GROW_PX };
const MODES = ['text', 'point', 'upload', 'none'] as const;
const PREVIEW_LONG = 832; // same long side as the Wan 480p swap grid
const SAM3_CKPT = 'sam3.1_multiplex_fp16.safetensors';
const NC = { credits: 0, charged: false, note: 'Mask preview is free; nothing was charged.' };
const bad = (reply: FastifyReply, field: string, message: string, code = 'invalid', status = 400) =>
  reply.code(status).send({ error: message, errorType: status === 503 ? 'unavailable' : status === 429 ? 'rate_limited' : 'validation', code, issues: [{ code, field, message }], ...NC });
/** ≤ 32 tokens (SAM 3.1 prompt limit): words and punctuation, roughly what the CLIP tokenizer counts. */
export const maskPromptTokens = (s: string) => (s.match(/[A-Za-z0-9]+|[^\sA-Za-z0-9]/g) ?? []).length;

// ---- rate limit: 20 previews / minute per caller, 2 at a time overall ----
const hits = new Map<string, number[]>(); let running = 0;
function limited(key: string): boolean {
  const now = Date.now(); const xs = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (xs.length >= 20 || running >= 2) { hits.set(key, xs); return true; }
  xs.push(now); hits.set(key, xs); return false;
}

function capture(bin: string, args: string[]): Promise<string> {
  return new Promise((ok) => { const c = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] }); let o = ''; c.stdout?.on('data', (d) => (o += d)); c.stderr?.on('data', (d) => { o += d; if (o.length > 40000) o = o.slice(-40000); }); c.on('error', () => ok('')); c.on('close', () => ok(o)); });
}
/** Bounding box of the white area of a mask PNG (ffmpeg bbox filter), null when empty. */
async function maskBox(mask: string) {
  const s = await capture('ffmpeg', ['-hide_banner', '-i', mask, '-vf', 'bbox=min_val=128', '-f', 'null', '-']);
  const m = s.match(/x1:(\d+) x2:(\d+) y1:(\d+) y2:(\d+) w:(\d+) h:(\d+)/); if (!m) return null;
  const [x1, , y1, , w, h] = m.slice(1).map(Number); return w > 1 && h > 1 ? { x: x1, y: y1, width: w, height: h } : null;
}
const tinted = (frame: string, mask: string, out: string, w: number, h: number) => runFfmpeg(['-y', '-v', 'error', '-i', frame, '-i', mask, '-filter_complex',
  `color=c=0xff3355:s=${w}x${h},format=rgba[c];[1:v]scale=${w}:${h},format=gray[m];[c][m]alphamerge,colorchannelmixer=aa=0.5[o];[0:v][o]overlay=format=auto:shortest=1`, '-frames:v', '1', out]);
/** Grow (dilate) a mask by px, or fill its bounding box (maskGrow=box). */
async function growMask(src: string, out: string, px: number, box: boolean, w: number, h: number) {
  const b = box ? await maskBox(src) : null;
  if (box && b) return runFfmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=black:s=${w}x${h}:d=1,format=gray,geq=lum='if(between(X\\,${Math.max(0, b.x - px)}\\,${b.x + b.width + px})*between(Y\\,${Math.max(0, b.y - px)}\\,${b.y + b.height + px})\\,255\\,0)'`, '-frames:v', '1', out]);
  const r = Math.max(1, Math.round(px)); // each 3x3 dilation grows the area by 1 px
  return runFfmpeg(['-y', '-v', 'error', '-i', src, '-vf', `format=gray,${Array.from({ length: r }, () => 'dilation').join(',')},lut=y='if(gte(val\\,128)\\,255\\,0)'`, '-frames:v', '1', out]);
}
/** Mock SAM: an ellipse around the click point (or a little below centre for "describe it"), roughly object-sized; box mode → its rectangle. */
async function mockMask(out: string, w: number, h: number, pt: { x: number; y: number } | null, swapType: string) {
  const cx = Math.round((pt?.x ?? 0.5) * w), cy = Math.round((pt?.y ?? 0.55) * h);
  const rx = Math.round(w * (swapType === 'person' ? 0.12 : 0.16)), ry = Math.round(h * (swapType === 'person' ? 0.36 : 0.22));
  return runFfmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=black:s=${w}x${h}:d=1,format=gray,geq=lum='if(lte(pow((X-${cx})/${rx}\\,2)+pow((Y-${cy})/${ry}\\,2)\\,1)\\,255\\,0)'`, '-frames:v', '1', out]);
}

/** Local ComfyUI with the core SAM3_Detect node? (comfy backend, native API only; Comfy Cloud runner waits for the Oct 23 slot.) */
async function samStatus(): Promise<{ available: boolean; engine: 'mock' | 'sam3.1'; reason: string | null }> {
  if (config.backend === 'mock') return { available: true, engine: 'mock', reason: null };
  try {
    const { nativeMode } = await import('./comfy/runNative.js'); if (!nativeMode()) return { available: false, engine: 'sam3.1', reason: 'Mask preview needs a local ComfyUI (Comfy Cloud preview is not wired yet). The mask is found when you press Generate.' };
    const { ComfyNative } = await import('./comfy/native.js'); const c = new ComfyNative(config.comfyBaseUrl, comfyAuthFor(config.comfyBaseUrl, config.comfyApiKey));
    const info = await c.objectInfo(); if (!info.SAM3_Detect) return { available: false, engine: 'sam3.1', reason: 'This ComfyUI has no SAM3_Detect node (update ComfyUI and add sam3.1_multiplex_fp16.safetensors). The mask is found when you press Generate.' };
    return { available: true, engine: 'sam3.1', reason: null };
  } catch { return { available: false, engine: 'sam3.1', reason: 'ComfyUI isn’t running on your computer. The mask is found when you press Generate.' }; }
}
/** One-frame SAM 3.1 on the local ComfyUI (node inputs per the built-in docs, NOT yet run on a real install). */
async function samMask(frame: string, out: string, o: { prompt: string; point: { x: number; y: number } | null; w: number; h: number }) {
  const { ComfyNative } = await import('./comfy/native.js'); const c = new ComfyNative(config.comfyBaseUrl, comfyAuthFor(config.comfyBaseUrl, config.comfyApiKey));
  const img = await c.upload(frame);
  const g: Record<string, any> = {
    1: { class_type: 'LoadImage', inputs: { image: img } },
    2: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: SAM3_CKPT } },
    4: { class_type: 'SAM3_Detect', inputs: { model: ['2', 0], image: ['1', 0], threshold: 0.5, refine_iterations: 2, individual_masks: false } },
    6: { class_type: 'MaskToImage', inputs: { mask: ['4', 0] } },
    7: { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'oh_maskpreview' } },
  };
  if (o.prompt) { g[3] = { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 1], text: o.prompt } }; g[4].inputs.conditioning = ['3', 0]; }
  if (o.point) g[4].inputs.positive_coords = JSON.stringify([{ x: Math.round(o.point.x * o.w), y: Math.round(o.point.y * o.h) }]);
  const res = await c.run(g, { timeoutMs: 120_000 }); const f = res.outputs['7']?.[0]; if (!f) throw new Error('SAM 3.1 returned no mask');
  await c.download(f, out);
}

const assetPath = (u: string) => !/^\/(files|samples)\/[\w\-./]+$/.test(u) || u.includes('..') ? null : u.startsWith('/files/') ? path.join(DATA_DIR, u.slice(7)) : path.join(SAMPLES_DIR, u.slice(9));

export function registerMaskPreview(app: FastifyInstance) {
  app.get('/api/tools/object-swap/mask-preview', async () => { const s = await samStatus(); return { ...s, backend: config.backend, credits: 0, free: true, maskGrow: MASK_GROW_PX, maskModes: MODES, maxPromptTokens: 32 }; });
  app.post('/api/tools/object-swap/mask-preview', async (req: FastifyRequest, reply) => {
    const id = randomUUID().slice(0, 8); const fields: Record<string, string> = {}; const files: Record<string, string> = {}; const tmp: string[] = [];
    try {
      if (req.isMultipart()) for await (const part of req.parts()) {
        if (part.type === 'file') {
          const ext = path.extname(part.filename || '').toLowerCase(); const isImg = part.fieldname === 'firstFrame';
          const ok = isImg ? /^\.(png|jpe?g|webp)$/.test(ext) || /^image\//.test(part.mimetype) : ['video', 'matte'].includes(part.fieldname) && (/^\.(mp4|mov|webm|m4v)$/.test(ext) || /^video\//.test(part.mimetype));
          if (!ok) { part.file.resume(); return bad(reply, part.fieldname, `Unsupported file for ${part.fieldname}${ext ? ` (${ext})` : ''}.`, 'format'); }
          const name = `maskpv-${id}-${part.fieldname}${ext || (isImg ? '.png' : '.mp4')}`; const p = path.join(DATA_DIR, name); tmp.push(p);
          await pipeline(part.file, createWriteStream(p)); if ((part.file as any).truncated) return bad(reply, part.fieldname, 'File too large.', 'file_too_large');
          files[part.fieldname] = p;
        } else fields[part.fieldname] = String(part.value);
      } else Object.assign(fields, (req.body ?? {}) as Record<string, string>);
      const swapType = fields.swapType === 'person' ? 'person' : 'object';
      const maskMode = (fields.maskMode || (fields.point ? 'point' : files.matte ? 'upload' : 'text')) as typeof MODES[number];
      if (!(MODES as readonly string[]).includes(maskMode)) return bad(reply, 'maskMode', `maskMode must be one of ${MODES.join(', ')}.`);
      if (maskMode === 'none') return bad(reply, 'maskMode', "This model doesn't need a mask, so there is nothing to preview.", 'no_mask_needed');
      const grow = (fields.maskGrow || 'normal') as Grow; if (!(grow in MASK_GROW_PX)) return bad(reply, 'maskGrow', 'maskGrow must be tight, normal, loose or box.');
      const video = files.video ?? (fields.videoUrl || fields.mediaUrl ? assetPath(fields.videoUrl || fields.mediaUrl) : null);
      if (fields.videoUrl && (!video || !existsSync(video))) return bad(reply, 'videoUrl', 'videoUrl must be a /files/ or /samples/ video on this server.', 'not_found');
      if (!video && !files.firstFrame) return bad(reply, 'video', 'Add the source video (field video) to preview the mask.', 'required');
      let prompt = (fields.maskPrompt ?? '').trim();
      if (maskMode === 'text' && !prompt) { if (swapType === 'person') prompt = 'person'; else return bad(reply, 'maskPrompt', 'Name the object to find, like "red mug".', 'required'); }
      if (maskPromptTokens(prompt) > 32) return bad(reply, 'maskPrompt', "Keep it short, like 'red mug' (32 tokens max).", 'too_long');
      let pt: { x: number; y: number } | null = null; let t = Number(fields.t) || 0;
      if (fields.point) { const [x, y, pt3] = fields.point.split(',').map(Number); if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return bad(reply, 'point', 'point must be "x,y[,t]" with x and y between 0 and 1.'); pt = { x, y }; if (Number.isFinite(pt3) && !fields.t) t = pt3; }
      if (maskMode === 'point' && !pt) return bad(reply, 'point', 'Click the object on the frame first (field point).', 'required');
      if (maskMode === 'upload' && !files.matte) return bad(reply, 'matte', 'Upload the mask video (field matte, white = replace).', 'required');
      if (limited(String(req.ip ?? 'local'))) return bad(reply, 'video', 'Too many mask previews at once; wait a few seconds.', 'rate_limited', 429);
      const st = await samStatus(); if (!st.available && maskMode !== 'upload') return bad(reply, 'maskMode', st.reason ?? 'Mask preview is not available here.', 'mask_preview_unavailable', 503);
      running++;
      try {
        const vp = video ? await probe(video) : null; if (video && !vp) return bad(reply, 'video', "Couldn't read this video.", 'unreadable');
        if (vp && t > vp.duration) t = Math.max(0, vp.duration - 0.1);
        const frame = path.join(DATA_DIR, `maskpv-${id}-frame.png`); const scale = `scale=${PREVIEW_LONG}:${PREVIEW_LONG}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
        if (files.firstFrame) { const fp = await probe(files.firstFrame); if (!fp) return bad(reply, 'firstFrame', "Couldn't read this frame image.", 'unreadable');
          if (vp && (fp.width !== vp.width || fp.height !== vp.height)) return bad(reply, 'firstFrame', `Frame must match the video size (${vp.width}×${vp.height}).`, 'size_mismatch');
          if ((await runFfmpeg(['-y', '-v', 'error', '-i', files.firstFrame, '-frames:v', '1', '-vf', scale, frame])) !== 0) return bad(reply, 'firstFrame', "Couldn't read this frame image.", 'unreadable'); }
        else if ((await runFfmpeg(['-y', '-v', 'error', '-ss', String(t), '-i', video!, '-frames:v', '1', '-vf', scale, frame])) !== 0) return bad(reply, 'video', `Couldn't read a frame at ${t} s.`, 'frame_failed');
        const fs0 = await probe(frame); const w = fs0?.width ?? PREVIEW_LONG, h = fs0?.height ?? 468;
        const raw = path.join(DATA_DIR, `maskpv-${id}-raw.png`); tmp.push(raw); const matte = path.join(DATA_DIR, `maskpv-${id}-matte.png`); const over = path.join(DATA_DIR, `maskpv-${id}-mask.png`);
        if (maskMode === 'upload') { if ((await runFfmpeg(['-y', '-v', 'error', '-ss', String(t), '-i', files.matte, '-frames:v', '1', '-vf', `scale=${w}:${h},format=gray,lut=y='if(gte(val\\,128)\\,255\\,0)'`, raw])) !== 0) return bad(reply, 'matte', "Couldn't read the mask video.", 'unreadable'); }
        else if (st.engine === 'mock') { if ((await mockMask(raw, w, h, pt, swapType)) !== 0) throw new Error('mock mask render failed'); }
        else await samMask(frame, raw, { prompt: maskMode === 'text' ? prompt : '', point: pt, w, h });
        const before = await maskBox(raw);
        if (!before || /\[mocknone\]/i.test(prompt)) return { maskUrl: null, matteUrl: null, frameUrl: `/files/${path.basename(frame)}`, count: 0, bboxes: [], width: w, height: h, t, maskMode, maskGrow: grow, growPx: MASK_GROW_PX[grow],
          message: maskMode === 'text' ? `Couldn't find '${prompt}'. Try another word or click it.` : "Couldn't find anything there. Try another spot.", ...NC, free: true, backend: config.backend, engine: maskMode === 'upload' ? 'upload' : st.engine, mock: st.engine === 'mock' };
        if ((await growMask(raw, matte, MASK_GROW_PX[grow], grow === 'box', w, h)) !== 0) throw new Error('mask grow failed');
        if ((await tinted(frame, matte, over, w, h)) !== 0) throw new Error('mask overlay failed');
        // one combined mask per frame (SAM3 individual_masks=false): count = 1 area; the bbox is the ungrown detection
        return { maskUrl: `/files/${path.basename(over)}`, matteUrl: `/files/${path.basename(matte)}`, frameUrl: `/files/${path.basename(frame)}`, count: 1, countExact: false, bboxes: [{ ...before, score: st.engine === 'mock' ? 0.9 : null }],
          width: w, height: h, t, maskMode, maskGrow: grow, growPx: MASK_GROW_PX[grow], alt: 'First frame with 1 area(s) marked for replacement', ...NC, free: true, backend: config.backend, engine: maskMode === 'upload' ? 'upload' : st.engine, mock: st.engine === 'mock' && maskMode !== 'upload' };
      } finally { running--; }
    } catch (e: any) {
      return bad(reply, 'video', `Mask preview failed: ${e?.message ?? e}. Nothing was charged; the mask is still found when you press Generate.`, 'mask_preview_failed', 503);
    } finally { for (const p of tmp) if (!/-(frame|matte|mask)\.png$/.test(p)) await unlink(p).catch(() => undefined); }
  });
}
