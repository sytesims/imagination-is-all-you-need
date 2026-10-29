/**
 * Shared clip helpers for video-to-video swaps (Video Swap Person swap / Motion transfer; any cloud or local route):
 *  - cutRange: the swap range the user trimmed, cut from the upload (re-encoded, frame-accurate, sound kept).
 *  - preparePass: one pass of a cut clip in the shape a hosted edit model accepts (side limits, frame rate), e.g. Kling ≤ 10 s, ≥ 720 px a side.
 *  - joinPasses: passes back into one clip (same size / rate), then the source clip's own sound put back (or none).
 * ffmpeg only; every helper throws one plain sentence on failure.
 */
import { access } from 'node:fs/promises';
import { runFfmpeg, remuxAudio } from './ffmpeg.js';
import { probe } from './media.js';

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const exists = (p: string) => access(p).then(() => true, () => false);

/** Cut [start, start + dur) seconds of `src` into `dst` (H.264 / AAC, sound kept when there is one). */
export async function cutRange(src: string, dst: string, start: number, dur: number): Promise<void> {
  const code = await runFfmpeg(['-v', 'error', '-y', '-ss', String(start), '-i', src, '-t', String(dur), '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', dst]);
  if (code !== 0) throw new Error(`the clip could not be cut to ${start}–${start + dur} s`);
}

/** Frame size that fits a model's side limits, keeping the shape: scaled up until the short side reaches minSide (Kling: 720), down until the long side
 *  is ≤ maxSide (2160). Even numbers. */
export function fitSides(w: number, h: number, minSide: number, maxSide: number, px?: [number, number]): { width: number; height: number } {
  let k = 1; if (Math.min(w, h) * k < minSide) k = minSide / Math.min(w, h); if (Math.max(w, h) * k > maxSide) k = maxSide / Math.max(w, h);
  if (px) { const a = w * h * k * k; if (a < px[0]) k *= Math.sqrt(px[0] / a) * 1.01; else if (a > px[1]) k *= Math.sqrt(px[1] / a) * 0.99; } // pixel budget (Seedance reference videos)
  return { width: even(w * k), height: even(h * k) };
}

/** One pass of `src` ([start, start + dur)) shaped for a hosted model; reused when it already exists (the same pass for several versions). */
export async function preparePass(src: string, dst: string, start: number, dur: number, o: { minSide?: number; maxSide?: number; fps?: [number, number]; pixels?: [number, number] } = {}): Promise<string> {
  if (await exists(dst)) return dst;
  const p = await probe(src); if (!p) throw new Error('the clip could not be read');
  const { width, height } = fitSides(p.width, p.height, o.minSide ?? 1, o.maxSide ?? 8192, o.pixels);
  const vf = [`scale=${width}:${height}:flags=lanczos`, 'setsar=1', ...(o.fps ? [`fps='max(${o.fps[0]},min(${o.fps[1]},source_fps))'`] : [])].join(',');
  let code = await runFfmpeg(['-v', 'error', '-y', '-ss', String(start), '-i', src, '-t', String(dur), '-map', '0:v:0', '-map', '0:a:0?', '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', dst]);
  if (code !== 0 && o.fps) code = await runFfmpeg(['-v', 'error', '-y', '-ss', String(start), '-i', src, '-t', String(dur), '-map', '0:v:0', '-map', '0:a:0?', '-vf', `scale=${width}:${height}:flags=lanczos,setsar=1,fps=24`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', dst]); // older ffmpeg: no source_fps in fps=
  if (code !== 0) throw new Error(`pass ${start}–${start + dur} s could not be prepared`);
  return dst;
}

/** Join passes (in order) into `out` at the first pass's size and frame rate, then put `audioSrc`'s sound back (keepAudio) or leave it silent. */
export async function joinPasses(parts: string[], out: string, audioSrc: string | null, keepAudio = true): Promise<void> {
  if (!parts.length) throw new Error('no passes to join');
  const silent = `${out}.video.mp4`;
  if (parts.length === 1) {
    const c = await runFfmpeg(['-v', 'error', '-y', '-i', parts[0], '-map', '0:v:0', '-c:v', 'copy', '-an', '-movflags', '+faststart', silent]); if (c !== 0) throw new Error('the result could not be read');
  } else {
    const p = await probe(parts[0]); if (!p) throw new Error('the first pass could not be read');
    const W = even(p.width), H = even(p.height);
    const chains = parts.map((_, k) => `[${k}:v:0]scale=${W}:${H}:flags=lanczos,setsar=1,fps=24,format=yuv420p[v${k}]`).join(';');
    const code = await runFfmpeg(['-v', 'error', '-y', ...parts.flatMap((x) => ['-i', x]), '-filter_complex', `${chains};${parts.map((_, k) => `[v${k}]`).join('')}concat=n=${parts.length}:v=1:a=0[v]`,
      '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-an', '-movflags', '+faststart', silent]);
    if (code !== 0) throw new Error(`the ${parts.length} passes could not be joined`);
  }
  if (keepAudio && audioSrc) await remuxAudio(silent, audioSrc, out, true);
  else { const c = await runFfmpeg(['-v', 'error', '-y', '-i', silent, '-c', 'copy', '-an', '-movflags', '+faststart', out]); if (c !== 0) throw new Error('the result could not be written'); }
}
