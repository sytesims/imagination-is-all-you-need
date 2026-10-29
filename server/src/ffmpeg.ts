import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';

/** Remux video from `videoPath` with audio from `audioSourcePath` (withSource=false → video only). Falls back to video only if no audio track. */
export async function remuxAudio(videoPath: string, audioSourcePath: string, outPath: string, withSource = true): Promise<void> {
  await access(videoPath);
  await access(audioSourcePath);
  const withAudio = withSource ? await runFfmpeg([
    '-y', '-i', videoPath, '-i', audioSourcePath, '-map', '0:v:0', '-map', '1:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', outPath,
  ]) : 1;
  if (withAudio === 0) return;
  return videoOnlyRemux(videoPath, outPath);
}
async function videoOnlyRemux(videoPath: string, outPath: string): Promise<void> {
  const videoOnly = await runFfmpeg(['-y', '-i', videoPath, '-map', '0:v:0', '-c:v', 'copy', '-an', '-movflags', '+faststart', outPath]);
  if (videoOnly !== 0) throw new Error(`ffmpeg remux failed (exit ${videoOnly})`);
}

export function runFfmpeg(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr?.on('data', (d: Buffer) => {
      err += d.toString();
      if (err.length > 4000) err = err.slice(-4000);
    });
    child.on('error', () => resolve(127));
    child.on('close', (code) => {
      if (code !== 0 && err) {
        // keep last lines available for callers via process log if needed
        console.warn('[ffmpeg]', err.split('\n').slice(-8).join('\n'));
      }
      resolve(code ?? 1);
    });
  });
}

/** Run a probe binary and capture stdout+stderr (used for duration / brightness). */
function capture(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    const c = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] }); let out = '';
    c.stdout?.on('data', (d: Buffer) => { out += d; }); c.stderr?.on('data', (d: Buffer) => { out += d; if (out.length > 20000) out = out.slice(-20000); });
    c.on('error', () => resolve('')); c.on('close', () => resolve(out));
  });
}
/** Exact frame count of the first video stream (decodes it); 0 when unreadable. LTX Extend and the frame grab (videoFrame.ts) use it. */
export function countFrames(file: string): Promise<number> {
  return new Promise((ok) => { const p = spawn('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', file]); let o = '';
    p.stdout.on('data', (d) => (o += d)); p.on('close', () => ok(Number.parseInt(o.trim(), 10) || 0)); p.on('error', () => ok(0)); });
}
export async function mediaDuration(file: string): Promise<number> {
  const s = await capture('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  const d = parseFloat(s); return Number.isFinite(d) && d > 0 ? d : 0;
}
/** Width × height of the first video stream (null when unreadable). */
export async function videoSize(file: string): Promise<{ width: number; height: number } | null> {
  const s = await capture('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', file]);
  const m = s.trim().match(/^(\d+)x(\d+)/); return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}
/** Does the file have an audio stream? */
export async function hasAudio(file: string): Promise<boolean> {
  return /audio/.test(await capture('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', file]));
}
/** EBU R128 loudness of a file's first audio stream (ffmpeg ebur128, the meter streaming services use): integrated LUFS, loudness range and
 *  true peak (dBTP). null when unreadable; i = -Infinity for silence. */
export async function loudnessOf(file: string): Promise<{ i: number; lra: number; tp: number } | null> {
  const s = await capture('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const sum = s.slice(s.lastIndexOf('Summary:')); if (!/Integrated loudness/.test(sum)) return null;
  const num = (re: RegExp) => { const m = sum.match(re); if (!m) return -Infinity; const v = Number(m[1]); return Number.isFinite(v) ? v : -Infinity; };
  return { i: num(/I:\s+(-?[\d.]+|-inf) LUFS/), lra: Math.max(0, num(/LRA:\s+(-?[\d.]+) LU/)), tp: num(/Peak:\s+(-?[\d.]+|-inf) dBFS/) };
}
/** Pixel format of the first video/image stream (e.g. 'rgba', 'rgb24'), '' when unreadable. */
export async function pixFmt(file: string): Promise<string> {
  return (await capture('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt', '-of', 'default=nw=1:nk=1', file])).trim().split('\n')[0] ?? '';
}
/** Pixel formats that can carry an alpha channel (pal8 may have a tRNS chunk). */
export const hasAlphaFmt = (fmt: string) => /^(rgba|bgra|argb|abgr|ya|yuva|gbrap|pal8)/.test(fmt);
/**
 * Item 11: store photo outputs fully opaque. ComfyUI sometimes saves an RGBA PNG with alpha 253–255 (slightly see-through on a dark page).
 * An image with an alpha channel is rewritten without it (rgb24, or rgb48 for 16-bit; colours unchanged); an opaque one is copied as is.
 * Falls back to a plain copy if ffmpeg is missing or fails, so a result is never lost.
 */
export async function flattenAlpha(src: string, dest: string): Promise<boolean> {
  const { copyFile, rename, unlink } = await import('node:fs/promises');
  const fmt = await pixFmt(src);
  if (!fmt || !hasAlphaFmt(fmt)) { if (src !== dest) await copyFile(src, dest); return false; }
  const tmp = `${dest}.opaque${/\.webp$/i.test(dest) ? '.webp' : '.png'}`;
  const code = await runFfmpeg(['-y', '-v', 'error', '-i', src, '-vf', /64|48/.test(fmt) ? 'format=rgb48be' : 'format=rgb24', '-frames:v', '1', '-update', '1', tmp]);
  if (code !== 0) { await unlink(tmp).catch(() => undefined); if (src !== dest) await copyFile(src, dest); return false; }
  await rename(tmp, dest); return true;
}
/** Mean luma (0–255) of an image file. */
export async function meanLuma(img: string): Promise<number> {
  const s = await capture('ffmpeg', ['-i', img, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-']);
  const m = s.match(/YAVG=([\d.]+)/); return m ? Number(m[1]) : 0;
}
/** Poster still: frame near 50% of the clip, skipping near-black frames (tries 50/40/60/30/70/20/80%). Returns exit code. */
export async function posterFrame(src: string, out: string, opts: { minLuma?: number; scale?: string } = {}): Promise<number> {
  const dur = await mediaDuration(src); const min = opts.minLuma ?? 24; const vf = `scale=${opts.scale ?? '640:-2'}`;
  if (!dur) return runFfmpeg(['-y', '-i', src, '-frames:v', '1', '-vf', vf, '-q:v', '4', out]); // still image
  let best = { y: -1, t: dur / 2 };
  for (const f of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
    const t = Math.round(dur * f * 100) / 100;
    if (await runFfmpeg(['-y', '-ss', String(t), '-i', src, '-frames:v', '1', '-vf', vf, '-q:v', '4', out]) !== 0) continue;
    const y = await meanLuma(out); if (y >= min) return 0;
    if (y > best.y) best = { y, t };
  }
  // Whole clip is dark: use the brightest candidate, lifted so the tile isn't black.
  return best.y < 0 ? 1 : runFfmpeg(['-y', '-ss', String(best.t), '-i', src, '-frames:v', '1', '-vf', `${vf},eq=gamma=2.6:brightness=0.08`, '-q:v', '4', out]);
}
