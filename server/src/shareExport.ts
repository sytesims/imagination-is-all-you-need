/**
 * Branded video export. The browser draws the badge or strip as a transparent PNG at the video's exact
 * size, plus a 1080p end card, and posts them here; ffmpeg (no drawtext on this build, so PNG overlays only) burns the overlay in and adds
 * the end card as a 1.5 s still with a 0.3 s fade-in. Silent audio is added when the source has none, so every export is H.264 + AAC.
 *  POST /api/jobs/:id/share/export  multipart: style, toggles (JSON), endCard ("1"/"0"), overlay (PNG, video size), endcard (PNG, optional)
 *    → { ok, url: /api/jobs/:id/share/export/<file>, cached, bytes, duration }
 *  GET  /api/jobs/:id/share/export/:file  the MP4 (owner only; attachment)
 * Reframe (2026-10-24, Instagram and TikTok): `frame` 4:5 | 1:1 | 9:16 makes a 1080-wide video in that shape. `fit` (default) keeps the whole
 * picture centred on a blurred, darkened copy of itself; `fill` crops to cover. The overlay PNG is then the frame's size (web shareFrame.ts).
 *  POST /api/jobs/:id/share/clip    a short video from a still or a recorded clip (the sheet's 9:16 version of an image, or Image to layers'
 *    "layers video" recorded in the browser): multipart still (PNG/JPEG at the frame size) or clip (WebM/MP4), seconds (still: 3–15, default 6),
 *    endCard + endcard (PNG) → H.264 + AAC (silent) MP4, so Instagram and TikTok take it. A still gets a slow 4% push-in.
 * Output: <DATA_DIR>/share-exports/<jobId>-<hash>.mp4, cached by the hash of the options and both PNGs. The original is never modified.
 * Removed when the job is trashed (library.trashHooks) or purged (routesEdge.dropDerived).
 */
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DATA_DIR } from './config.js';
import { jobs } from './jobs.js';
import * as lib from './library.js';
import { ownerOf, LOCAL_OWNER } from './owner.js';
import { hasAudio, mediaDuration, runFfmpeg, videoSize } from './ffmpeg.js';
import { dataFileOf, VIDEO_RE } from './cleanMedia.js';

export const END_CARD_S = 1.5, FADE_S = 0.3;
export const EXPORT_DIR = () => path.join(DATA_DIR, 'share-exports');
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Width × height of a PNG (null when it isn't one). */
export const pngSize = (b: Buffer) => b.length > 24 && b.subarray(0, 8).equals(PNG_SIG) && b.toString('latin1', 12, 16) === 'IHDR' ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : null;
async function frameRate(file: string): Promise<number> {
  const out = await new Promise<string>((res) => { const c = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate,r_frame_rate', '-of', 'csv=p=0', file], { stdio: ['ignore', 'pipe', 'ignore'] }); let s = ''; c.stdout.on('data', (d) => { s += d; }); c.on('close', () => res(s)); c.on('error', () => res('')); });
  for (const f of out.trim().split(/[,\n]/)) { const [n, d] = f.split('/').map(Number); const r = d ? n / d : n; if (Number.isFinite(r) && r > 1 && r <= 120) return Math.round(r * 1000) / 1000; }
  return 30;
}
/** Frame sizes for Instagram and TikTok (web sharePlatforms.ts FRAME_PX; sources there). */
export const FRAMES: Record<string, readonly [number, number]> = { '4:5': [1080, 1350], '1:1': [1080, 1080], '9:16': [1080, 1920] };
export type FrameSpec = { W: number; H: number; fit: 'fit' | 'fill' } | null;
export const frameOf = (frame?: string, fit?: string): FrameSpec => (frame && FRAMES[frame] ? { W: FRAMES[frame][0], H: FRAMES[frame][1], fit: fit === 'fill' ? 'fill' : 'fit' } : null);
/** The filter that puts input 0 into a W × H frame as [src]: fit = centred over a blurred, darkened cover copy; fill = cover crop. */
export function frameFilter(f: NonNullable<FrameSpec>, input = '[0:v]') {
  const { W, H } = f; if (f.fit === 'fill') return `${input}scale=${W}:${H}:force_original_aspect_ratio=increase:flags=bicubic,crop=${W}:${H},setsar=1[src]`;
  const bw = Math.round(W / 10 / 2) * 2, bh = Math.round(H / 10 / 2) * 2;
  return `${input}split=2[fa][fb];[fa]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},boxblur=6:2,scale=${W}:${H}:flags=bicubic,eq=brightness=-0.13:saturation=0.9,setsar=1[bg];`
    + `[fb]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=bicubic,setsar=1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[src]`;
}
export interface ExportOpts { overlay: Buffer; endCard: Buffer | null; key: string; frame?: FrameSpec; /** where the MP4 goes (default share-exports/) */ dir?: string; /** end card fill and fade colour, '0xRRGGBB' (default 0x0F1113) */ endColor?: string }
/** The ffmpeg args for one export (exported for tests and for the encoder fallback). */
export function exportArgs(src: string, ov: string, end: string | null, out: string, p: { w: number; h: number; fps: number; dur: number; audio: boolean; frame?: FrameSpec; endColor?: string }, encoder: 'libx264' | 'h264_videotoolbox' = 'libx264') {
  const fr = p.frame ?? null; const W = fr ? fr.W : p.w - (p.w % 2), H = fr ? fr.H : p.h - (p.h % 2); const total = p.dur + (end ? END_CARD_S : 0);
  const inputs = ['-i', src, '-i', ov]; let n = 2; const endIx = end ? n++ : -1; if (end) inputs.push('-loop', '1', '-framerate', String(p.fps), '-t', String(END_CARD_S), '-i', end);
  const silIx = n++; inputs.push('-f', 'lavfi', '-t', String(total + 0.5), '-i', 'anullsrc=r=48000:cl=stereo');
  const fmt = `fps=${p.fps},scale=${W}:${H}:flags=bicubic,setsar=1,format=yuv420p,settb=AVTB`;
  const f: string[] = fr ? [frameFilter(fr), `[src][1:v]overlay=0:0:eof_action=repeat:format=auto,${fmt},trim=duration=${p.dur.toFixed(3)},setpts=PTS-STARTPTS[mv]`]
    : [`[0:v][1:v]overlay=0:0:eof_action=repeat:format=auto,${fmt},trim=duration=${p.dur.toFixed(3)},setpts=PTS-STARTPTS[mv]`];
  const aFmt = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
  f.push(p.audio ? `[0:a]${aFmt},apad,atrim=duration=${p.dur.toFixed(3)},asetpts=PTS-STARTPTS[ma]` : `[${silIx}:a]${aFmt},atrim=duration=${p.dur.toFixed(3)},asetpts=PTS-STARTPTS[ma]`);
  if (end) {
    const ec = p.endColor && /^0x[0-9A-Fa-f]{6}$/.test(p.endColor) ? p.endColor : '0x0F1113';
    f.push(`[${endIx}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${ec},${fmt},fade=t=in:st=0:d=${FADE_S}:color=${ec},trim=duration=${END_CARD_S},setpts=PTS-STARTPTS[ev]`);
    f.push(`aevalsrc=0:s=48000:c=stereo:d=${END_CARD_S},${aFmt}[ea]`);
    f.push('[mv][ma][ev][ea]concat=n=2:v=1:a=1[v][a]');
  } else f.push('[mv]null[v]', '[ma]anull[a]');
  const venc = encoder === 'libx264' ? ['-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast'] : ['-c:v', 'h264_videotoolbox', '-b:v', `${Math.max(2, Math.round((W * H) / 250_000))}M`, '-allow_sw', '1'];
  return ['-y', '-v', 'error', ...inputs, '-filter_complex', f.join(';'), '-map', '[v]', '-map', '[a]', ...venc, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k',
    '-map_metadata', '-1', '-map_chapters', '-1', '-fflags', '+bitexact', '-metadata:s', 'handler_name=', '-metadata:s', 'vendor_id=', '-movflags', '+faststart', '-t', total.toFixed(3), out];
}
const running = new Map<string, Promise<string>>();
/** Make (or reuse) the branded MP4 for a source video. Returns the output path. */
export async function brandVideo(jobId: string, src: string, o: ExportOpts): Promise<{ file: string; cached: boolean }> {
  const st = statSync(src);
  const hash = createHash('sha1').update(o.key).update(JSON.stringify(o.frame ?? null)).update(o.endColor ?? '').update(`|${src}|${st.size}|${st.mtimeMs}|`).update(o.overlay).update(o.endCard ?? Buffer.alloc(0)).digest('hex').slice(0, 12);
  const dir = o.dir ?? EXPORT_DIR(); const out = path.join(dir, `${jobId}-${hash}.mp4`); if (existsSync(out)) return { file: out, cached: true };
  const busy = running.get(out); if (busy) return { file: await busy, cached: true };
  const job = (async () => {
    mkdirSync(dir, { recursive: true }); const tmp = path.join(dir, `.${jobId}-${hash}`); const ov = `${tmp}-ov.png`, end = o.endCard ? `${tmp}-end.png` : null, part = `${tmp}.part.mp4`;
    writeFileSync(ov, o.overlay); if (end) writeFileSync(end, o.endCard!);
    try {
      const [size, dur, audio, fps] = await Promise.all([videoSize(src), mediaDuration(src), hasAudio(src), frameRate(src)]);
      if (!size || !dur) throw Object.assign(new Error('Could not read this video.'), { status: 422 });
      const want = o.frame ? { width: o.frame.W, height: o.frame.H } : size;
      const ovSize = pngSize(o.overlay); if (!ovSize || ovSize.width !== want.width || ovSize.height !== want.height) throw Object.assign(new Error(`The overlay must be a PNG of ${want.width}×${want.height}.`), { status: 400 });
      const p = { w: size.width, h: size.height, fps: Math.min(60, Math.max(23, fps)), dur, audio, frame: o.frame ?? null, endColor: o.endColor };
      let code = await runFfmpeg(exportArgs(src, ov, end, part, p, 'libx264'));
      if (code !== 0) code = await runFfmpeg(exportArgs(src, ov, end, part, p, 'h264_videotoolbox'));
      if (code !== 0) throw Object.assign(new Error('ffmpeg could not make the branded video.'), { status: 500 });
      renameSync(part, out); return out;
    } finally { for (const f of [ov, end, part]) if (f) rmSync(f, { force: true }); }
  })().finally(() => running.delete(out));
  running.set(out, job); return { file: await job, cached: false };
}
/** Remove every branded export of a job (trash / purge). */
export function dropExports(jobId: string) { const dir = EXPORT_DIR(); if (!existsSync(dir)) return; for (const f of readdirSync(dir)) if (f.startsWith(`${jobId}-`)) rmSync(path.join(dir, f), { force: true }); }
lib.trashHooks.push(dropExports);

/** The ffmpeg args for a short clip: a still (`kind` still, looped for `secs` with a slow push-in) or a recorded clip (re-encoded as is),
 *  both at W × H with silent AAC audio and an optional end card. Exported for tests. */
export function clipArgs(src: string, kind: 'still' | 'clip', end: string | null, out: string, p: { W: number; H: number; secs: number; fps?: number }, encoder: 'libx264' | 'h264_videotoolbox' = 'libx264') {
  const { W, H } = p; const fps = p.fps ?? 30; const dur = p.secs; const total = dur + (end ? END_CARD_S : 0); const n = Math.max(1, Math.round(dur * fps));
  const inputs = kind === 'still' ? ['-loop', '1', '-framerate', String(fps), '-t', String(dur), '-i', src] : ['-i', src];
  let ix = 1; const endIx = end ? ix++ : -1; if (end) inputs.push('-loop', '1', '-framerate', String(fps), '-t', String(END_CARD_S), '-i', end);
  const fmt = `fps=${fps},format=yuv420p,setsar=1,settb=AVTB`; const aFmt = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
  // the push-in: draw at 2× and zoom from 1 to 1.04 around the centre (zoompan at 2× keeps the motion smooth)
  const v = kind === 'still' ? `[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W * 2}:${H * 2},zoompan=z='1+0.04*on/${n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${fps},${fmt},trim=duration=${dur.toFixed(3)},setpts=PTS-STARTPTS[mv]`
    : `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=bicubic,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0F1113,${fmt},trim=duration=${dur.toFixed(3)},setpts=PTS-STARTPTS[mv]`;
  const f = [v, `aevalsrc=0:s=48000:c=stereo:d=${dur.toFixed(3)},${aFmt}[ma]`];
  if (end) { f.push(`[${endIx}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0F1113,${fmt},fade=t=in:st=0:d=${FADE_S}:color=0x0F1113,trim=duration=${END_CARD_S},setpts=PTS-STARTPTS[ev]`,
    `aevalsrc=0:s=48000:c=stereo:d=${END_CARD_S},${aFmt}[ea]`, '[mv][ma][ev][ea]concat=n=2:v=1:a=1[v][a]'); } else f.push('[mv]null[v]', '[ma]anull[a]');
  const venc = encoder === 'libx264' ? ['-c:v', 'libx264', '-crf', '19', '-preset', 'veryfast'] : ['-c:v', 'h264_videotoolbox', '-b:v', `${Math.max(4, Math.round((W * H) / 200_000))}M`, '-allow_sw', '1'];
  return ['-y', '-v', 'error', ...inputs, '-filter_complex', f.join(';'), '-map', '[v]', '-map', '[a]', ...venc, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
    '-map_metadata', '-1', '-map_chapters', '-1', '-fflags', '+bitexact', '-metadata:s', 'handler_name=', '-metadata:s', 'vendor_id=', '-movflags', '+faststart', '-t', total.toFixed(3), out];
}
/** Make (or reuse) a clip for a job: a still or a recorded clip → MP4. */
export async function makeClip(jobId: string, o: { media: Buffer; kind: 'still' | 'clip'; ext: string; endCard: Buffer | null; secs: number; W: number; H: number }): Promise<{ file: string; cached: boolean }> {
  const hash = createHash('sha1').update(JSON.stringify({ k: o.kind, s: o.secs, W: o.W, H: o.H })).update(o.media).update(o.endCard ?? Buffer.alloc(0)).digest('hex').slice(0, 12);
  const dir = EXPORT_DIR(); const out = path.join(dir, `${jobId}-${hash}.mp4`); if (existsSync(out)) return { file: out, cached: true };
  const busy = running.get(out); if (busy) return { file: await busy, cached: true };
  const job = (async () => {
    mkdirSync(dir, { recursive: true }); const tmp = path.join(dir, `.${jobId}-${hash}`); const src = `${tmp}-src.${o.ext}`, end = o.endCard ? `${tmp}-end.png` : null, part = `${tmp}.part.mp4`;
    writeFileSync(src, o.media); if (end) writeFileSync(end, o.endCard!);
    try {
      let secs = o.secs; if (o.kind === 'clip') { const d = await mediaDuration(src); if (!d) throw Object.assign(new Error('Could not read the recorded clip.'), { status: 422 }); secs = Math.min(d, 60); }
      const p = { W: o.W, H: o.H, secs };
      let code = await runFfmpeg(clipArgs(src, o.kind, end, part, p, 'libx264'));
      if (code !== 0) code = await runFfmpeg(clipArgs(src, o.kind, end, part, p, 'h264_videotoolbox'));
      if (code !== 0) throw Object.assign(new Error('ffmpeg could not make the video.'), { status: 500 });
      renameSync(part, out); return out;
    } finally { for (const f of [src, end, part]) if (f) rmSync(f, { force: true }); }
  })().finally(() => running.delete(out));
  running.set(out, job); return { file: await job, cached: false };
}
const isJpg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8;

const MAX_PNG = 40 * 1024 * 1024; const MAX_CLIP = 120 * 1024 * 1024;
export function registerShareExport(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>('/api/jobs/:id/share/export', async (req, reply) => {
    const j = jobs.get(req.params.id); if (!j || lib.metaOf(j.id).deletedAt) return reply.code(404).send({ error: 'not found', errorType: 'not_found' });
    if (ownerOf(j) !== LOCAL_OWNER) return reply.code(403).send({ error: 'Only the owner can export this.', errorType: 'forbidden' });
    const out = j.outputs.find((x) => VIDEO_RE.test(x.url.split('?')[0])); const src = out ? dataFileOf(out.url) : null;
    if (!src) return reply.code(409).send({ error: 'This result has no video to brand.', errorType: 'validation', code: 'no_video' });
    const fields: Record<string, string> = {}; const files: Record<string, Buffer> = {};
    try { for await (const part of (req as any).parts()) { if (part.type === 'file') { const b: Buffer = await part.toBuffer(); if (b.length > MAX_PNG) return reply.code(413).send({ error: 'PNG too large.', errorType: 'validation' }); files[part.fieldname] = b; } else fields[part.fieldname] = String(part.value ?? ''); } }
    catch { return reply.code(400).send({ error: 'Send multipart form data: overlay (PNG) and optional endcard (PNG).', errorType: 'validation' }); }
    /* the copy with your logo (routesStamp.ts) instead of the output, when the sheet shares that one */
    const own = fields.source && /^\/files\/stamps\/[\w-]+\.mp4$/.test(fields.source) && path.basename(fields.source).startsWith(`${j.id}-`) ? dataFileOf(fields.source) : null;
    if (fields.source && !own) return reply.code(400).send({ error: 'source must be this result\'s copy with your logo.', errorType: 'validation', issues: [{ code: 'invalid', field: 'source', message: '/files/stamps/<jobId>-….mp4' }] });
    const style = fields.style ?? 'badge'; if (!['badge', 'strip', 'clean'].includes(style)) return reply.code(400).send({ error: 'style must be badge, strip or clean for video.', errorType: 'validation', issues: [{ code: 'invalid', field: 'style', message: 'badge | strip | clean' }] });
    let toggles: unknown = {}; try { toggles = JSON.parse(fields.toggles || '{}'); } catch { return reply.code(400).send({ error: 'toggles must be JSON.', errorType: 'validation' }); }
    const wantEnd = /^(1|true|on|yes)$/i.test(fields.endCard ?? '1');
    if (!files.overlay || !pngSize(files.overlay)) return reply.code(400).send({ error: 'overlay must be a PNG.', errorType: 'validation', issues: [{ code: 'invalid', field: 'overlay', message: 'PNG at the video size' }] });
    if (wantEnd && (!files.endcard || !pngSize(files.endcard))) return reply.code(400).send({ error: 'endcard must be a PNG when endCard is on.', errorType: 'validation', issues: [{ code: 'invalid', field: 'endcard', message: 'PNG' }] });
    try {
      if (fields.frame && fields.frame !== 'original' && !FRAMES[fields.frame]) return reply.code(400).send({ error: 'frame must be original, 4:5, 1:1 or 9:16.', errorType: 'validation', issues: [{ code: 'invalid', field: 'frame', message: 'original | 4:5 | 1:1 | 9:16' }] });
      const r = await brandVideo(j.id, own ?? src, { overlay: files.overlay, endCard: wantEnd ? files.endcard : null, key: JSON.stringify({ style, toggles, wantEnd }), frame: frameOf(fields.frame, fields.fit) });
      return { ok: true, url: `/api/jobs/${j.id}/share/export/${path.basename(r.file)}`, cached: r.cached, bytes: statSync(r.file).size, duration: await mediaDuration(r.file) };
    } catch (e: any) { return reply.code(e?.status ?? 500).send({ error: e?.message ?? 'Export failed.', errorType: e?.status === 400 ? 'validation' : 'internal' }); }
  });
  app.post<{ Params: { id: string } }>('/api/jobs/:id/share/clip', async (req, reply) => {
    const j = jobs.get(req.params.id); if (!j || lib.metaOf(j.id).deletedAt) return reply.code(404).send({ error: 'not found', errorType: 'not_found' });
    if (ownerOf(j) !== LOCAL_OWNER) return reply.code(403).send({ error: 'Only the owner can export this.', errorType: 'forbidden' });
    const fields: Record<string, string> = {}; const files: Record<string, Buffer> = {};
    try { for await (const part of (req as any).parts()) { if (part.type === 'file') { const b: Buffer = await part.toBuffer(); if (b.length > MAX_CLIP) return reply.code(413).send({ error: 'File too large.', errorType: 'validation' }); files[part.fieldname] = b; } else fields[part.fieldname] = String(part.value ?? ''); } }
    catch { return reply.code(400).send({ error: 'Send multipart form data: still (PNG or JPEG) or clip (video), and an optional endcard (PNG).', errorType: 'validation' }); }
    const still = files.still, clip = files.clip; if (!still === !clip) return reply.code(400).send({ error: 'Send one of still or clip.', errorType: 'validation', issues: [{ code: 'invalid', field: 'still', message: 'still or clip' }] });
    let W = 0, H = 0; if (still) { const sz = pngSize(still); if (!sz && !isJpg(still)) return reply.code(400).send({ error: 'still must be a PNG or JPEG.', errorType: 'validation', issues: [{ code: 'invalid', field: 'still', message: 'PNG or JPEG' }] }); }
    const fr = frameOf(fields.frame || '9:16'); if (!fr) return reply.code(400).send({ error: 'frame must be 4:5, 1:1 or 9:16.', errorType: 'validation', issues: [{ code: 'invalid', field: 'frame', message: '4:5 | 1:1 | 9:16' }] }); W = fr.W; H = fr.H;
    const secs = Math.max(3, Math.min(15, Number(fields.seconds) || 6)); const wantEnd = /^(1|true|on|yes)$/i.test(fields.endCard ?? '0');
    if (wantEnd && (!files.endcard || !pngSize(files.endcard))) return reply.code(400).send({ error: 'endcard must be a PNG when endCard is on.', errorType: 'validation', issues: [{ code: 'invalid', field: 'endcard', message: 'PNG' }] });
    try {
      const r = await makeClip(j.id, { media: still ?? clip!, kind: still ? 'still' : 'clip', ext: still ? (isJpg(still) ? 'jpg' : 'png') : (clip!.subarray(4, 8).toString('latin1') === 'ftyp' ? 'mp4' : 'webm'), endCard: wantEnd ? files.endcard : null, secs, W, H });
      return { ok: true, url: `/api/jobs/${j.id}/share/export/${path.basename(r.file)}`, cached: r.cached, bytes: statSync(r.file).size, duration: await mediaDuration(r.file), width: W, height: H };
    } catch (e: any) { return reply.code(e?.status ?? 500).send({ error: e?.message ?? 'Export failed.', errorType: e?.status === 400 ? 'validation' : 'internal' }); }
  });
  app.get<{ Params: { id: string; file: string }; Querystring: { name?: string } }>('/api/jobs/:id/share/export/:file', async (req, reply) => {
    const j = jobs.get(req.params.id); const f = req.params.file;
    if (!j || lib.metaOf(j.id).deletedAt || !f.startsWith(`${j.id}-`) || !/^[\w-]+\.mp4$/.test(f)) return reply.code(404).send({ error: 'not found', errorType: 'not_found' });
    if (ownerOf(j) !== LOCAL_OWNER) return reply.code(403).send({ error: 'forbidden', errorType: 'forbidden' });
    const p = path.join(EXPORT_DIR(), f); if (!existsSync(p)) return reply.code(404).send({ error: 'This export is gone. Make it again.', errorType: 'not_found' });
    const name = req.query.name && /^[\w.\-]{1,120}$/.test(req.query.name) ? req.query.name : f;
    return reply.type('video/mp4').header('content-length', String(statSync(p).size)).header('content-disposition', `attachment; filename="${name}"`).send(createReadStream(p));
  });
}
