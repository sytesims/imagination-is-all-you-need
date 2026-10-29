/**
 * Grid thumbnails (performance, MODEL-PICKER-REVIEW task 11): GET /api/media/thumb?url=<image or poster url>&w=<px>.
 * Grids (Create Image, Assets, Community, pickers) show results a few hundred pixels wide; real outputs are often 2–4K PNGs.
 * With `w`, the thumb route answers a copy scaled down to `w` px wide (cached in DATA_DIR/thumbs, rendered once, 4 at a time):
 *  - images under /files, /samples, /examples (png/jpg/webp): JPEG, or PNG when the source has an alpha channel (cut-outs stay transparent);
 *  - video posters (/api/media/poster?url=<video>): the same first frame as the full-size poster, scaled.
 * A source already ≤ w wide is served as is. Anything else (or an ffmpeg failure) → null, and the route redirects to the original,
 * so a thumb URL always shows the picture. Without `w` the route behaves exactly as before (video frame thumbnails).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { runFfmpeg } from './ffmpeg.js';
import { kindOfUrl, localFileOf, renderPoster } from './outputMeta.js';

export const THUMB_WIDTHS = [160, 240, 320, 480, 640, 960, 1280];
/** Round a requested width up to a cached bucket (bounded cache, stable URLs). */
export const thumbWidth = (w: number) => THUMB_WIDTHS.find((x) => x >= w) ?? THUMB_WIDTHS[THUMB_WIDTHS.length - 1];

function probe(file: string): Promise<{ width: number; alpha: boolean } | null> {
  return new Promise((res) => {
    const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,pix_fmt', '-of', 'json', file]); let out = '';
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', () => undefined); p.on('error', () => res(null));
    p.on('close', (code) => { if (code !== 0) return res(null); try { const st = JSON.parse(out).streams?.[0];
      res(st?.width ? { width: Number(st.width), alpha: /^(rgba|bgra|argb|abgr|ya8|ya16|yuva|gbrap|pal8)/.test(String(st.pix_fmt ?? '')) } : null); } catch { res(null); } });
  });
}
let running = 0; const waiters: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 4) await new Promise<void>((r) => waiters.push(r)); running++;
  try { return await fn(); } finally { running--; waiters.shift()?.(); }
}
const inflight = new Map<string, Promise<string | null>>();

/** The source file a thumb URL points at: a local image, or a video's full-size poster. */
async function sourceOf(url: string): Promise<string | null> {
  const pm = /^\/api\/media\/poster\?url=([^&]+)$/.exec(url);
  if (pm) { const v = decodeURIComponent(pm[1]); return kindOfUrl(v) === 'video' ? renderPoster(v) : null; }
  if (kindOfUrl(url) !== 'image' || /\.gif(\?|$)/i.test(url)) return null; // GIFs keep their animation
  return localFileOf(url);
}

/** Path of a ≤ w px wide copy of `url` (or the source itself when it's already small), else null. */
export async function gridThumb(url: string, wanted: number): Promise<string | null> {
  if (!url || url.length > 2000) return null;
  const w = thumbWidth(Math.max(1, Math.round(wanted)));
  const src = await sourceOf(url); if (!src) return null;
  let mtime = 0; try { mtime = statSync(src).mtimeMs; } catch { return null; }
  const key = createHash('sha1').update(`${src}|${mtime}|${w}`).digest('hex').slice(0, 20);
  const dir = path.join(DATA_DIR, 'thumbs');
  for (const ext of ['jpg', 'png']) { const f = path.join(dir, `g${w}-${key}.${ext}`); if (existsSync(f)) return f; }
  const smallMark = path.join(dir, `g${w}-${key}.orig`); if (existsSync(smallMark)) return src;
  const had = inflight.get(key); if (had) return had;
  const run = limited(async () => {
    const info = await probe(src); if (!info) return null;
    mkdirSync(dir, { recursive: true });
    if (info.width <= w) { try { writeFileSync(smallMark, ''); } catch { /* cache only */ } return src; }
    const out = path.join(dir, `g${w}-${key}.${info.alpha ? 'png' : 'jpg'}`); const tmp = out.replace(/(\.\w+)$/, `.tmp$1`);
    const code = await runFfmpeg(['-y', '-v', 'error', '-i', src, '-frames:v', '1', '-vf', `scale=${w}:-2:flags=lanczos`, ...(info.alpha ? [] : ['-q:v', '3']), tmp]);
    if (code !== 0 || !existsSync(tmp)) return null;
    renameSync(tmp, out); return out;
  }).finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}
