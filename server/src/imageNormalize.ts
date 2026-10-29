/**
 * WebP pictures in, PNG out (2026-10-29): every picture slot takes WebP (shared/mediaAccept.ts), but many routes only take PNG / JPEG
 * (MiniMax H3's frames, Veo, Kling, LTX, image edits). A submitted .webp is converted once, on upload, so every route and model gets a
 * PNG and the per-tool checks (/\.(png|jpe?g)$/) pass. Alpha is kept. A file that won't convert stays as it was (the tool's own check speaks).
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { runFfmpeg } from './ffmpeg.js';

const CONVERT = /\.webp$/i;
export const needsPng = (name: string) => CONVERT.test(name);

/** Converts `dir/name` (a .webp) to `dir/<stem>.png`; returns the new name, or the old one when nothing needed (or could be) done. */
export async function toPngIfNeeded(dir: string, name: string): Promise<string> {
  if (!needsPng(name)) return name;
  const out = `${name.slice(0, -path.extname(name).length)}.png`;
  const code = await runFfmpeg(['-v', 'error', '-y', '-i', path.join(dir, name), '-frames:v', '1', path.join(dir, out)]);
  return code === 0 && existsSync(path.join(dir, out)) ? out : name;
}

/** Every uploaded picture in a job's files, WebP → PNG (names replaced in place); returns old name → new name for the ones converted. */
export async function normalizeImageFiles(dir: string, files: Record<string, string[]>): Promise<Map<string, string>> {
  const moved = new Map<string, string>();
  // A library image can fill several slots. Convert each unique input once, serially, so reference sets don't launch many ffmpeg processes.
  const converted = new Map<string, string>();
  for (const k of Object.keys(files)) {
    const normalized: string[] = [];
    for (const n of files[k]) {
      if (!converted.has(n)) converted.set(n, await toPngIfNeeded(dir, n));
      const m = converted.get(n)!; if (m !== n) moved.set(n, m); normalized.push(m);
    }
    files[k] = normalized;
  }
  return moved;
}
