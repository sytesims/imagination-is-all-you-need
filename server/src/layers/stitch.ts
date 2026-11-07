/**
 * Layers: joins one name's mattes from the 2-second pieces (graph.ts pieces) into one frame folder for the whole clip (our own step, ffmpeg).
 *  - Outside the overlaps each frame comes from its own piece.
 *  - In the 4 overlapping frames the two pieces are crossfaded (the later piece weighs 1/5, 2/5, 3/5, 4/5), so a matte never jumps at a join.
 *  - A piece whose first frame has nothing for a name (SAM didn't find it there) is reported, with its time, so the result can say so.
 */
import path from 'node:path';
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { ff } from './masks.js';
import type { Piece } from './graph.js';

const frameName = (n: number) => `${String(n + 1).padStart(5, '0')}.png`;

/** The crossfade weight of the later piece on overlap frame j of `overlap` (0-based): 1/(o+1) … o/(o+1). */
export const fadeWeight = (j: number, overlap: number) => (j + 1) / (overlap + 1);
/** ffmpeg arguments that write A × (1 − w) + B × w (grey frames). */
export function fadeArgs(a: string, b: string, w: number, out: string): string[] {
  return ['-y', '-v', 'error', '-i', a, '-i', b, '-filter_complex', `[0:v]format=gray[a];[1:v]format=gray[b];[a][b]blend=all_expr='A*${(1 - w).toFixed(4)}+B*${w.toFixed(4)}',format=gray[o]`, '-map', '[o]', '-frames:v', '1', '-update', '1', out];
}
/** Where each clip frame comes from: [piece, frame in piece] (and a second source to fade with in an overlap). */
export function frameSources(ps: Piece[]): { from: [number, number]; fade?: { with: [number, number]; w: number } }[] {
  const total = ps.length ? ps[ps.length - 1].start + ps[ps.length - 1].length : 0; const out: ReturnType<typeof frameSources> = [];
  for (let f = 0; f < total; f++) {
    const p = ps.findIndex((x) => f >= x.start && f < x.start + x.length);
    const next = ps[p + 1]; const ov = next ? ps[p].start + ps[p].length - next.start : 0;
    if (next && f >= next.start) { const j = f - next.start; out.push({ from: [p, f - ps[p].start], fade: { with: [p + 1, j], w: fadeWeight(j, ov) } }); }
    else out.push({ from: [p, f - ps[p].start] });
  }
  return out;
}

/** Is a grey PNG all black (nothing found)? */
function blank(file: string): Promise<boolean> {
  return new Promise((ok) => {
    const c = spawn('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=64:-2:flags=area,format=gray', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let any = false; c.stdout.on('data', (d: Buffer) => { if (!any && d.some((v) => v > 127)) any = true; });
    c.on('error', () => ok(false)); c.on('close', () => ok(!any));
  });
}

/** Joins the pieces of one name (dirs[p] = that piece's frame folder) into `out`. Returns the pieces (start frames) where the name wasn't on the piece's first frame. */
export async function stitchPieces(dirs: string[], ps: Piece[], out: string): Promise<number[]> {
  await rm(out, { recursive: true, force: true }); await mkdir(out, { recursive: true });
  const lists = await Promise.all(dirs.map(async (d) => (await readdir(d)).filter((f) => f.endsWith('.png')).sort()));
  const at = ([p, j]: [number, number]) => { const l = lists[p]; return path.join(dirs[p], l[Math.min(j, l.length - 1)]); };
  for (const [f, s] of frameSources(ps).entries()) {
    if (!s.fade) await copyFile(at(s.from), path.join(out, frameName(f)));
    else await ff(fadeArgs(at(s.from), at(s.fade.with), s.fade.w, path.join(out, frameName(f))), 'piece join');
  }
  const missing: number[] = [];
  for (const [p, pc] of ps.entries()) if (lists[p].length && (await blank(path.join(dirs[p], lists[p][0])))) missing.push(pc.start);
  return missing;
}
