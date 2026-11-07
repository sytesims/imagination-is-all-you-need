/**
 * Layers: the sample (mock backend, free samples, or no model here). Nothing is sent anywhere and no model runs: it draws the raw outputs a real
 * run brings back (an oval matte per object that drifts a little, soft edges, a depth pass from the frame's height and brightness, a softened
 * Vanish clip), from YOUR clip, then runs the very same finish step (assemble.ts). So the viewer, the order, the toggles and the ProRes export can
 * be tried on any computer. Every view labels it Sample.
 */
import path from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { ff, seq } from './masks.js';
import { workDir, type RawSet, type LayersJobInput } from './assemble.js';

/** Where each sample oval sits (share of the frame): centre x / y, radius x / y. Later chips are smaller and higher (further away). */
export function sampleOval(k: number, n: number) {
  const cx = (k + 1) / (n + 1); const cy = 0.6 - k * 0.07; const rx = 0.16 - k * 0.025; const ry = 0.34 - k * 0.05;
  return { cx, cy, rx, ry };
}
const frames = (i: LayersJobInput) => ['-frames:v', String(i.frames)];

export async function sampleRaw(jobId: string, i: LayersJobInput): Promise<RawSet> {
  const dir = path.join(workDir(jobId), 'raw'); await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
  const { width: W, height: H, fps } = i; const n = i.objects.length; const src = ['-i', i.videoPath];
  const masks: string[] = [];
  for (let k = 0; k < n; k++) {
    const o = sampleOval(k, n); const d = path.join(dir, `mask${k}`); await mkdir(d);
    const cx = `(${W * o.cx}+${(W * 0.04).toFixed(1)}*sin(T*${1.3 + k * 0.4}))`; const cy = `${(H * o.cy).toFixed(1)}`;
    const e = `255*lte(pow((X-${cx})/${(W * o.rx).toFixed(1)}\\,2)+pow((Y-${cy})/${(H * o.ry).toFixed(1)}\\,2)\\,1)`;
    await ff(['-y', '-v', 'error', ...src, '-vf', `format=gray,geq=lum='${e}'`, ...frames(i), seq(d)], 'sample matte');
    masks.push(d);
  }
  let edges: string | null = null;
  if (i.edges) { edges = path.join(dir, 'edges'); await mkdir(edges);
    const inputs = masks.flatMap((m) => ['-framerate', String(fps), '-i', seq(m)]);
    const fc = masks.length === 1 ? '[0:v]format=gray,gblur=sigma=3[o]' : `${masks.map((_, k) => `[${k}:v]`).join('')}mix=inputs=${masks.length}:weights=${masks.map(() => '1').join(' ')}:normalize=0,format=gray,gblur=sigma=3[o]`;
    await ff(['-y', '-v', 'error', ...inputs, '-filter_complex', fc, '-map', '[o]', seq(edges)], 'sample edges'); }
  let depth: string | null = null;
  if (i.depth) { depth = path.join(dir, 'depth'); await mkdir(depth);
    await ff(['-y', '-v', 'error', ...src, '-vf', `format=gray,gblur=sigma=6,geq=lum='clip(0.65*255*Y/H+0.35*lum(X\\,Y)\\,0\\,255)'`, ...frames(i), seq(depth)], 'sample depth'); }
  let plate: string | null = null;
  if (i.background) { plate = path.join(dir, 'plate.mp4');
    await ff(['-y', '-v', 'error', ...src, '-t', '5', '-vf', 'boxblur=12:2,eq=saturation=0.6,format=yuv420p', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', plate], 'sample background'); }
  return { masks, edges, depth, plate };
}
