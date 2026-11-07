/**
 * Layers: the export ZIP, made on request (GET /api/layers/:id/export.zip) and kept for the next download. Every file is ready for an editor:
 *  - layers/NN-<name>.mov: ProRes 4444 with alpha (yuva444p10le, 16-bit alpha), the clip's own colours (straight, not premultiplied);
 *  - mattes/NN-<name>-matte.mp4: the same matte in black and white, for editors that prefer a matte to alpha;
 *  - depth/depth_NNNNN.png: 16-bit depth, near = white, normalised over the whole clip;
 *  - background/clean-background.mov: ProRes 422 HQ;
 *  - layers.json: names, order (bottom first), frame size, fps, models and licences.
 * NN is the stacking position (01 = bottom).
 */
import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readdir, rm, readFile } from 'node:fs/promises';
import { DATA_DIR } from '../config.js';
import { ff } from './masks.js';
import { workDir, manifestPath } from './assemble.js';
import { exportManifest, type LayersManifest, type LayerEntry } from './manifest.js';
import { writeZip } from './zipStream.js';
import { layerSource } from './editRender.js';

/** A file-safe slug of a layer name. */
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'layer';
export const stem = (e: Pick<LayerEntry, 'order' | 'name'>) => `${String(e.order + 1).padStart(2, '0')}-${slug(e.name)}`;

/** ProRes 4444 with alpha from the clip and one matte. */
export function proresArgs(o: { source: string; matte: string; frames: number; out: string }): string[] {
  return ['-y', '-v', 'error', '-i', o.source, '-i', o.matte, '-filter_complex', '[0:v]format=rgb24[v];[1:v]format=gray[a];[v][a]alphamerge[o]', '-map', '[o]', '-frames:v', String(o.frames),
    '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', '-vendor', 'apl0', '-an', o.out];
}
/** ProRes 422 HQ (the clean background). */
export function prores422Args(o: { source: string; out: string }): string[] {
  return ['-y', '-v', 'error', '-i', o.source, '-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-vendor', 'apl0', '-an', o.out];
}

export const zipPath = (jobId: string) => path.join(DATA_DIR, `${jobId.replace(/[^\w-]/g, '')}-layers-export.zip`);
const fromUrl = (u: string) => path.join(DATA_DIR, path.basename(u));

export async function readManifest(jobId: string): Promise<LayersManifest | null> {
  try { return JSON.parse(await readFile(manifestPath(jobId), 'utf8')) as LayersManifest; } catch { return null; }
}

const building = new Map<string, Promise<string>>();
/** The export for a finished split (made once, then reused). Throws when its files are gone. */
export function buildExport(jobId: string): Promise<string> {
  const z = zipPath(jobId); if (existsSync(z) && statSync(z).size > 0) return Promise.resolve(z);
  const run = building.get(jobId) ?? make(jobId, z).finally(() => building.delete(jobId)); building.set(jobId, run); return run;
}
async function make(jobId: string, z: string): Promise<string> {
  const m = await readManifest(jobId); if (!m) throw new Error('This split has no layers to export');
  const w = workDir(jobId); const ex = path.join(w, 'export'); await rm(ex, { recursive: true, force: true }); await mkdir(ex, { recursive: true });
  const src = fromUrl(m.sourceUrl); const files: { name: string; path?: string; data?: Buffer }[] = [];
  const names = new Map<number, { prores: string; matte: string }>();
  for (const e of m.layers) {
    const matte = path.join(w, `matte${e.id}.mkv`); if (!existsSync(matte)) throw new Error('This split’s mattes are no longer on this computer');
    const mov = path.join(ex, `${stem(e)}.mov`); await ff(proresArgs({ source: layerSource(jobId, m, e.id), matte, frames: m.frames, out: mov }), 'ProRes 4444'); // an edited split: each layer's own footage
    const n = { prores: `layers/${stem(e)}.mov`, matte: `mattes/${stem(e)}-matte.mp4` }; names.set(e.id, n);
    files.push({ name: n.prores, path: mov }, { name: n.matte, path: fromUrl(e.matteUrl) });
  }
  let bg: string | null = null;
  if (m.background.url) { const mov = path.join(ex, 'clean-background.mov'); await ff(prores422Args({ source: fromUrl(m.background.url), out: mov }), 'ProRes 422 HQ'); bg = 'background/clean-background.mov'; files.push({ name: bg, path: mov }); }
  let depth: string | null = null; const d16 = path.join(w, 'depth16');
  if (m.depth.url && existsSync(d16)) { depth = 'depth/'; for (const f of (await readdir(d16)).filter((x) => x.endsWith('.png')).sort()) files.push({ name: `depth/depth_${f}`, path: path.join(d16, f) }); }
  const json = exportManifest(m, { layer: (e) => names.get(e.id)!, depth, background: bg });
  files.unshift({ name: 'layers.json', data: Buffer.from(JSON.stringify(json, null, 1)) });
  const tmp = `${z}.part`; await writeZip(tmp, files); await (await import('node:fs/promises')).rename(tmp, z);
  await rm(ex, { recursive: true, force: true });
  return z;
}
