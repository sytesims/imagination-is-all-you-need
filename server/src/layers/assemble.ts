/**
 * Layers: the finish step on this computer (runs after ComfyUI or Comfy Cloud, and after the sample on the mock backend). From the raw model
 * outputs (per-frame mattes, soft edges, depth, the Vanish clip) it makes, in the data folder:
 *  - one see-through preview per object (VP9 WebM with alpha: the clip's own colours, the object's matte) and its black-and-white matte (MP4);
 *  - the clean background: the Vanish clip pasted ONLY inside the objects' area (grown, feathered); everywhere else it is your own footage;
 *  - depth: a 16-bit PNG sequence (normalised over the clip; kept for the export) and a grey preview clip;
 *  - an overview clip (each object tinted in its colour) for the feed card;
 *  - layers.json (manifest.ts).
 * The ProRes 4444 export is made on request (exportZip.ts), from the lossless mattes kept in the work folder.
 */
import path from 'node:path';
import { mkdir, rename, writeFile, readdir, rm } from 'node:fs/promises';
import { DATA_DIR } from '../config.js';
import { LAYERS_MODELS, CLOUD_PLATE_NOTE } from './constants.js';
import { bandPx, combineArgs, occludeArgs, ff } from './masks.js';
import { grabGrey, clipRange, objectDepths, layerOrder, coverage, depth16Args, depthPreviewArgs } from './depth.js';
import { buildManifest, colourOf, type LayersManifest } from './manifest.js';
import { maskNode, EDGES_NODE, DEPTH_NODE, pieces } from './graph.js';
import { stitchPieces } from './stitch.js';

export const workDir = (jobId: string) => path.join(DATA_DIR, 'layers-work', jobId.replace(/[^\w-]/g, ''));
export const manifestPath = (jobId: string) => path.join(DATA_DIR, `${jobId.replace(/[^\w-]/g, '')}-layers.json`);
const fileUrl = (f: string) => `/files/${path.basename(f)}`;

/** What the job carries for the finish step (tool.ts parseInput). */
export interface LayersJobInput {
  objects: string[]; edges: boolean; depth: boolean; background: boolean;
  /** the conformed clip (analysis copy) */ videoPath: string; width: number; height: number; fps: number; frames: number;
  plate?: { footageFx?: { plan?: { seconds?: number } } } | null;
}
/** The raw model outputs, as frame folders (NNNNN.png) and one plate clip. */
export interface RawSet { masks: string[]; edges: string | null; depth: string | null; plate: string | null; /** plain notes for the job (a name not found at a piece's start) */ notes?: string[] }

/** runNative's files of the analysis pass → one frame folder per output node (files are named <job>-p0-<node>[-k].png, k = frame). */
export async function rawFromOuts(jobId: string, i: LayersJobInput, outs: string[][]): Promise<RawSet> {
  const dir = path.join(workDir(jobId), 'raw'); await mkdir(dir, { recursive: true });
  const byNode = new Map<string, { k: number; f: string }[]>();
  for (const f of outs[0] ?? []) {
    const m = new RegExp(`-p0-(\\d+)(?:-(\\d+))?\\.png$`).exec(path.basename(f)); if (!m) continue;
    (byNode.get(m[1]) ?? byNode.set(m[1], []).get(m[1])!).push({ k: Number(m[2] ?? 0), f });
  }
  const folder = async (node: string, name: string) => {
    const list = (byNode.get(node) ?? []).sort((a, b) => a.k - b.k); if (!list.length) return null;
    const d = path.join(dir, name); await mkdir(d, { recursive: true });
    for (const [n, x] of list.entries()) await rename(x.f, path.join(d, `${String(n + 1).padStart(5, '0')}.png`));
    return d;
  };
  const ps = pieces(i.frames); const perPiece: string[][] = [];
  for (let k = 0; k < i.objects.length; k++) {
    const dirs: string[] = [];
    for (let p = 0; p < ps.length; p++) { const d = await folder(maskNode(k, p), `mask${k}p${p}`); if (!d) throw new Error(`Video to layers: no matte came back for “${i.objects[k]}” (piece ${p + 1})`); dirs.push(d); }
    perPiece.push(dirs);
  }
  const { masks, notes } = await joinPieces(jobId, i, perPiece);
  return { masks, notes, edges: i.edges ? await folder(EDGES_NODE, 'edges') : null, depth: i.depth ? await folder(DEPTH_NODE, 'depth') : null, plate: outs[1]?.[0] ?? null };
}
/** Each name's pieces joined into one frame folder (stitch.ts), with a note for every piece that starts without that name. */
export async function joinPieces(jobId: string, i: Pick<LayersJobInput, 'objects' | 'frames' | 'fps'>, perPiece: string[][]): Promise<{ masks: string[]; notes: string[] }> {
  const ps = pieces(i.frames); const masks: string[] = []; const notes: string[] = [];
  for (const [k, dirs] of perPiece.entries()) {
    const out = path.join(workDir(jobId), 'raw', `mask${k}`); const missing = await stitchPieces(dirs, ps, out); masks.push(out);
    if (missing.length) notes.push(`“${i.objects[k]}” wasn’t found at ${missing.map((f) => `${(f / i.fps).toFixed(1)} s`).join(', ')}, so its layer is empty until it is found again.`);
  }
  return { masks, notes };
}

const frameCount = async (dir: string) => (await readdir(dir)).filter((f) => f.endsWith('.png')).length;
const small = (w: number, h: number) => { const sw = 96; const sh = Math.max(2, Math.round((sw * h) / w / 2) * 2); return { sw, sh }; };

/** The whole finish step. Returns the job's results, finished in place (runNative lists them as they are). */
export async function assembleLayers(job: { id: string; input: Record<string, any> }, raw: RawSet, where: LayersManifest['where']): Promise<{ label: string; file: string; ready: true }[]> {
  const i = job.input as LayersJobInput; const w = workDir(job.id); await mkdir(w, { recursive: true });
  const { width: W, height: H, fps } = i; const n = i.objects.length;
  const frames = Math.min(i.frames || Infinity, ...(await Promise.all(raw.masks.map(frameCount))));
  const out = (name: string) => path.join(DATA_DIR, `${job.id}-${name}`);
  // 1 each object's matte: SAM core + BiRefNet in the edge band
  const band = bandPx(W, H); const combined: string[] = [];
  for (let k = 0; k < n; k++) { const f = path.join(w, `combined${k}.mkv`); await ff(combineArgs({ sam: raw.masks[k], edges: raw.edges, fps, ...band, out: f }), 'edge combine'); combined.push(f); }
  // 2 depth over the clip, and the order
  const { sw, sh } = small(W, H); const px = sw * sh;
  const maskBytes = await Promise.all(raw.masks.map((d) => grabGrey({ dir: d, fps }, sw, sh)));
  const cov = maskBytes.map((m) => coverage(m, px));
  let depths: (number | null)[] | null = null; let range: { lo: number; hi: number } | null = null;
  if (raw.depth) { const d = await grabGrey({ dir: raw.depth, fps }, sw, sh); range = clipRange(d); depths = objectDepths(d, maskBytes, px); }
  const order = layerOrder(n, depths);
  // 3 overlaps go to the nearer layer; the final lossless mattes
  const mattes: string[] = new Array(n);
  for (const [pos, id] of order.entries()) {
    const front = order.slice(pos + 1).map((x) => raw.masks[x]); const f = path.join(w, `matte${id}.mkv`);
    await ff(occludeArgs({ matte: combined[id], front, fps, out: f }), 'overlap'); mattes[id] = f;
  }
  // 4 previews: alpha WebM + B/W matte per object
  const preview: string[] = []; const matteUrl: string[] = [];
  for (let k = 0; k < n; k++) {
    const p = out(`layer${k + 1}.webm`); const m = out(`matte${k + 1}.mp4`);
    await ff(['-y', '-v', 'error', '-i', i.videoPath, '-i', mattes[k], '-filter_complex', '[0:v]format=yuva420p[v];[1:v]format=gray[a];[v][a]alphamerge,format=yuva420p[o]', '-map', '[o]', '-frames:v', String(frames),
      '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '30', '-deadline', 'realtime', '-cpu-used', '8', '-an', p], 'layer preview');
    await ff(['-y', '-v', 'error', '-i', mattes[k], '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-movflags', '+faststart', m], 'matte preview');
    preview.push(fileUrl(p)); matteUrl.push(fileUrl(m));
  }
  // 5 depth: 16-bit frames (export) + grey preview
  let depthUrl: string | null = null;
  if (raw.depth && range) {
    const d16 = path.join(w, 'depth16'); await rm(d16, { recursive: true, force: true }); await mkdir(d16, { recursive: true });
    await ff(depth16Args({ dir: raw.depth, fps, range, outDir: d16 }), 'depth 16-bit');
    const dp = out('depth.mp4'); await ff(depthPreviewArgs({ dir: raw.depth, fps, range, out: dp, width: W, height: H }), 'depth preview'); depthUrl = fileUrl(dp);
  }
  // 6 clean background: the plate only inside the objects' area (grown + feathered), your footage everywhere else
  let bgUrl: string | null = null; let plate: { seconds: number; model: string } | null = null;
  if (raw.plate) {
    const bg = out('background.mp4'); const grow = Math.max(4, band.outer * 2); const ins = mattes.flatMap((f) => ['-i', f]);
    const hole = mattes.map((_, k) => `[${k + 2}:v]format=gray[h${k}]`); let cur = '[h0]';
    for (let k = 1; k < n; k++) { hole.push(`${cur}[h${k}]blend=all_mode=lighten[u${k}]`); cur = `[u${k}]`; }
    const fc = [...hole, `${cur}${Array.from({ length: Math.min(grow, 24) }, () => 'dilation').join(',')},gblur=sigma=${Math.max(2, grow / 2)},format=gray[hole]`,
      `[1:v]scale=${W}:${H}:flags=lanczos,fps=${fps},tpad=stop_mode=clone:stop=-1,format=yuv420p[pl]`, '[0:v]format=yuv420p[src]', '[src][pl][hole]maskedmerge,format=yuv420p[o]'].join(';');
    await ff(['-y', '-v', 'error', '-i', i.videoPath, '-i', raw.plate, ...ins, '-filter_complex', fc, '-map', '[o]', '-frames:v', String(frames), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-movflags', '+faststart', bg], 'clean background');
    bgUrl = fileUrl(bg);
    plate = { seconds: Number(i.plate?.footageFx?.plan?.seconds) || 5, model: where === 'comfy-cloud' ? LAYERS_MODELS.plateCloud : LAYERS_MODELS.plateLocal };
  }
  // 7 the overview: each object tinted in its colour, for the card
  const ov = out('overview.mp4'); const tints: string[] = []; let base = '[0:v]';
  for (let k = 0; k < n; k++) {
    tints.push(`color=c=${colourOf(k).replace('#', '0x')}:s=${W}x${H}:r=${fps}[c${k}]`, `[${k + 1}:v]format=gray,lut=c0='val*0.5'[a${k}]`, `[c${k}][a${k}]alphamerge[t${k}]`, `${base}[t${k}]overlay=shortest=1[b${k}]`);
    base = `[b${k}]`;
  }
  await ff(['-y', '-v', 'error', '-i', i.videoPath, ...mattes.flatMap((f) => ['-i', f]), '-filter_complex', `${tints.join(';')};${base}format=yuv420p[o]`, '-map', '[o]', '-frames:v', String(frames),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-movflags', '+faststart', ov], 'overview');
  // 8 layers.json
  const m = buildManifest({ jobId: job.id, width: W, height: H, fps, frames, names: i.objects, order, depths, coverage: cov, range, plate, edges: !!raw.edges, where,
    urls: { preview, matte: matteUrl, overview: fileUrl(ov), source: fileUrl(i.videoPath), depth: depthUrl, background: bgUrl } });
  await writeFile(manifestPath(job.id), JSON.stringify(m, null, 1));
  if (raw.notes?.length) ((job as any).warnings ??= []).push(...raw.notes);
  if (where === 'comfy-cloud' && i.background) ((job as any).warnings ??= []).push(CLOUD_PLATE_NOTE);
  const warn = order.filter((id) => cov[id] < 0.05).map((id) => `“${i.objects[id]}” was hardly found in the clip. Try other words, or check it is in the first frame.`);
  if (warn.length) ((job as any).warnings ??= []).push(...warn);
  return [
    { label: 'Overview', file: ov, ready: true },
    ...[...order].reverse().map((id) => ({ label: i.objects[id], file: path.join(DATA_DIR, path.basename(preview[id])), ready: true as const })),
    ...(bgUrl ? [{ label: 'Clean background', file: out('background.mp4'), ready: true as const }] : []),
    ...(depthUrl ? [{ label: 'Depth', file: out('depth.mp4'), ready: true as const }] : []),
  ];
}
