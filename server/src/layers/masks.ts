/**
 * Layers: each object's final matte, made on this computer with ffmpeg (our own steps; no model).
 *
 * Edge band (when Clean edges is on): SAM 3.1's matte is hard-edged; BiRefNet's is soft but covers whatever stands out in the frame. So:
 *   core  = the SAM matte shrunk a few pixels (always fully inside the object),
 *   outer = the SAM matte grown a little more (nothing of this object lies beyond it),
 *   final = max(core, min(BiRefNet, outer)): BiRefNet's soft values only inside the band, never another object, never a hole in the middle.
 * Without Clean edges the SAM matte is used as it is, lightly softened.
 *
 * Overlaps: a pixel two objects claim goes to the nearer one (depth order): each layer is cut by the SAM mattes of the layers in front of it.
 * Mattes are stored lossless (FFV1, 8-bit grey) so the export and the previews read the same pixels.
 */
import { runFfmpeg } from '../ffmpeg.js';

export const seq = (dir: string) => `${dir}/%05d.png`;
/** Shrink / grow sizes in pixels for a frame: about 3 px and 8 px at 720p, at least 1 and 2. */
export function bandPx(width: number, height: number): { core: number; outer: number } {
  const s = Math.min(width, height); const core = Math.max(1, Math.round(s / 240));
  return { core, outer: Math.max(core + 1, Math.round(core * 2.6)) };
}
const rep = (f: string, n: number) => Array.from({ length: n }, () => f).join(',');

/** ffmpeg filter for one object's matte. Inputs: [0] the SAM matte frames, [1] the BiRefNet frames (when edges). Output label [m]. */
export function combineFilter(o: { edges: boolean; core: number; outer: number }): string {
  if (!o.edges) return '[0:v]format=gray,gblur=sigma=0.7[m]';
  return [
    '[0:v]format=gray,split[a][b]',
    `[a]${rep('erosion', o.core)}[core]`,
    `[b]${rep('dilation', o.outer)}[outer]`,
    '[1:v]format=gray[soft]',
    '[outer][soft]blend=all_mode=darken[band]',
    '[core][band]blend=all_mode=lighten,format=gray[m]',
  ].join(';');
}
/** The arguments that write one object's matte (lossless FFV1 grey). */
export function combineArgs(o: { sam: string; edges?: string | null; fps: number; core: number; outer: number; out: string }): string[] {
  const ins = ['-framerate', String(o.fps), '-i', seq(o.sam), ...(o.edges ? ['-framerate', String(o.fps), '-i', seq(o.edges)] : [])];
  return ['-y', '-v', 'error', ...ins, '-filter_complex', combineFilter({ edges: !!o.edges, core: o.core, outer: o.outer }), '-map', '[m]', '-c:v', 'ffv1', '-pix_fmt', 'gray', o.out];
}

/** Cut a matte by the objects in front of it: matte × (1 − union of their SAM mattes). front = SAM frame dirs of the nearer layers. */
export function occludeArgs(o: { matte: string; front: string[]; fps: number; out: string }): string[] {
  if (!o.front.length) return ['-y', '-v', 'error', '-i', o.matte, '-c:v', 'ffv1', '-pix_fmt', 'gray', o.out];
  const ins = o.front.flatMap((d) => ['-framerate', String(o.fps), '-i', seq(d)]);
  const f: string[] = o.front.map((_, k) => `[${k + 1}:v]format=gray[f${k}]`);
  let cur = '[f0]';
  for (let k = 1; k < o.front.length; k++) { f.push(`${cur}[f${k}]blend=all_mode=lighten[u${k}]`); cur = `[u${k}]`; }
  f.push(`${cur}negate[keep]`, '[0:v]format=gray[me]', '[me][keep]blend=all_mode=multiply,format=gray[m]');
  return ['-y', '-v', 'error', '-i', o.matte, ...ins, '-filter_complex', f.join(';'), '-map', '[m]', '-c:v', 'ffv1', '-pix_fmt', 'gray', o.out];
}

export async function ff(args: string[], what: string): Promise<void> {
  const c = await runFfmpeg(args);
  if (c !== 0) throw new Error(`Layers: ${what} failed (ffmpeg ${c})`);
}
