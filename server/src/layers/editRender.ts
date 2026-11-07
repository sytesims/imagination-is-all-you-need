/**
 * Video to layers: renders a changed split as a new result, on this computer with ffmpeg (free, no model). For each layer that stays:
 *  - its colour footage: the clip (or the split's own per-layer footage) recoloured, then scaled and moved → src<id>.mkv (lossless);
 *  - its matte: the split's matte, scaled and moved the same way → matte<id>.mkv;
 * each text: the browser's transparent picture → src / matte (ids 100 + k). Then the composite over the clean background (or, without one, the
 * clip itself), the per-layer previews, and a layers.json, so the new result opens in the same viewer and exports the edited layers.
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { DATA_DIR } from '../config.js';
import { ff } from './masks.js';
import { workDir, manifestPath } from './assemble.js';
import { colourFilter, placeFilter, stackOrder, isChanged, type LayersEditSpec } from './edit.js';
import type { LayersManifest, LayerEntry } from './manifest.js';

export const TEXT_ID = (k: number) => 100 + k;
const fileOf = (url: string) => path.join(DATA_DIR, path.basename(url));
/** A split's colour footage for one layer: its own (an edited split) or the clip's. */
export const layerSource = (jobId: string, m: Pick<LayersManifest, 'sourceUrl'>, id: number) => { const own = path.join(workDir(jobId), `src${id}.mkv`); return existsSync(own) ? own : fileOf(m.sourceUrl); };

/** ffmpeg args for one layer's edited colour footage and matte (two outputs). */
export function layerArgs(o: { src: string; matte: string; e: Parameters<typeof placeFilter>[1] & Parameters<typeof colourFilter>[0]; W: number; H: number; fps: number; frames: number; outSrc: string; outMatte: string }): string[] {
  const col = colourFilter(o.e);
  const fc = [placeFilter(`[0:v]${col ? `${col},` : ''}`, o.e, o.W, o.H, '[s]', o.fps, 'rgb24'), placeFilter('[1:v]', o.e, o.W, o.H, '[m]', o.fps, 'gray')].join(';');
  return ['-y', '-v', 'error', '-i', o.src, '-i', o.matte, '-filter_complex', fc, '-map', '[s]', '-frames:v', String(o.frames), '-c:v', 'ffv1', '-pix_fmt', 'bgr0', o.outSrc,
    '-map', '[m]', '-frames:v', String(o.frames), '-c:v', 'ffv1', '-pix_fmt', 'gray', o.outMatte];
}
/** ffmpeg args that turn a full-frame transparent PNG into a text layer's footage and matte for the clip's length. */
export function textArgs(o: { png: string; W: number; H: number; fps: number; frames: number; outSrc: string; outMatte: string }): string[] {
  return ['-y', '-v', 'error', '-loop', '1', '-framerate', String(o.fps), '-i', o.png, '-filter_complex', `[0:v]scale=${o.W}:${o.H},format=rgba,split[a][b];[a]format=rgb24[s];[b]alphaextract,format=gray[m]`,
    '-map', '[s]', '-frames:v', String(o.frames), '-c:v', 'ffv1', '-pix_fmt', 'bgr0', o.outSrc, '-map', '[m]', '-frames:v', String(o.frames), '-c:v', 'ffv1', '-pix_fmt', 'gray', o.outMatte];
}
/** ffmpeg args for the composite: the base, then each (footage, matte) pair over it in order. */
export function compositeArgs(o: { base: string; pairs: { src: string; matte: string }[]; W: number; H: number; frames: number; out: string }): string[] {
  const ins = ['-i', o.base, ...o.pairs.flatMap((p) => ['-i', p.src, '-i', p.matte])];
  const f: string[] = [`[0:v]scale=${o.W}:${o.H},format=yuv420p,format=rgb24[b0]`]; let cur = '[b0]';
  o.pairs.forEach((_, k) => { const s = 1 + 2 * k, m = 2 + 2 * k;
    f.push(`[${s}:v]format=rgba[s${k}]`, `[${m}:v]format=gray[m${k}]`, `[s${k}][m${k}]alphamerge[l${k}]`, `${cur}[l${k}]overlay=shortest=1[b${k + 1}]`); cur = `[b${k + 1}]`; });
  f.push(`${cur}format=yuv420p[o]`);
  return ['-y', '-v', 'error', ...ins, '-filter_complex', f.join(';'), '-map', '[o]', '-frames:v', String(o.frames), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-movflags', '+faststart', o.out];
}

/** The whole render. from = the split being changed (its id and layers.json); returns the new job's results. */
export async function renderEdit(o: { jobId: string; from: { id: string; m: LayersManifest }; spec: LayersEditSpec; textPngs: string[]; textNames: string[] }): Promise<{ label: string; file: string }[]> {
  const { m } = o.from; const W = m.width, H = m.height, fps = m.fps, frames = m.frames; const w = workDir(o.jobId); await mkdir(w, { recursive: true });
  const edits = new Map(o.spec.layers.map((e) => [e.id, e])); const out = (n: string) => path.join(DATA_DIR, `${o.jobId}-${n}`);
  const bottomUp = [...m.layers].sort((a, b) => a.order - b.order);
  const kept: LayerEntry[] = []; const pairs: { src: string; matte: string }[] = [];
  for (const it of stackOrder(bottomUp.map((l) => l.id), o.spec.texts)) {
    if (it.kind === 'layer') {
      const l = m.layers.find((x) => x.id === it.id)!; const e = edits.get(l.id) ?? { id: l.id }; if (e.hidden) continue;
      const pair = { src: path.join(w, `src${l.id}.mkv`), matte: path.join(w, `matte${l.id}.mkv`) };
      await ff(layerArgs({ src: layerSource(o.from.id, m, l.id), matte: path.join(workDir(o.from.id), `matte${l.id}.mkv`), e, W, H, fps, frames, outSrc: pair.src, outMatte: pair.matte }), 'layer change');
      pairs.push(pair); kept.push({ ...l, name: l.name, depth: isChanged(e) && (e.x || e.y || (e.scale ?? 1) !== 1) ? null : l.depth });
    } else {
      const t = o.spec.texts[it.index]; const id = TEXT_ID(it.index); const pair = { src: path.join(w, `src${id}.mkv`), matte: path.join(w, `matte${id}.mkv`) };
      await ff(textArgs({ png: o.textPngs[it.index], W, H, fps, frames, outSrc: pair.src, outMatte: pair.matte }), 'text');
      pairs.push(pair); kept.push({ id, name: o.textNames[it.index], colour: t.colour, order: 0, depth: null, coverage: 1, previewUrl: '', matteUrl: '' });
    }
  }
  const base = m.background.url ? fileOf(m.background.url) : fileOf(m.sourceUrl);
  const comp = out('composite.mp4'); await ff(compositeArgs({ base, pairs, W, H, frames, out: comp }), 'composite');
  const finals: { label: string; file: string }[] = [{ label: 'Your changes', file: comp }];
  for (const [k, l] of kept.entries()) {
    const p = out(`layer${k + 1}.webm`), mt = out(`matte${k + 1}.mp4`);
    await ff(['-y', '-v', 'error', '-i', pairs[k].src, '-i', pairs[k].matte, '-filter_complex', '[0:v]format=yuva420p[v];[1:v]format=gray[a];[v][a]alphamerge,format=yuva420p[o]', '-map', '[o]', '-frames:v', String(frames),
      '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '30', '-deadline', 'realtime', '-cpu-used', '8', '-an', p], 'layer preview');
    await ff(['-y', '-v', 'error', '-i', pairs[k].matte, '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-movflags', '+faststart', mt], 'matte preview');
    Object.assign(l, { order: k, previewUrl: `/files/${path.basename(p)}`, matteUrl: `/files/${path.basename(mt)}` });
  }
  for (const l of [...kept].reverse()) finals.push({ label: l.name, file: fileOf(l.previewUrl) });
  const manifest: LayersManifest = { ...m, jobId: o.jobId, layers: kept, overviewUrl: `/files/${path.basename(comp)}`, sourceUrl: m.sourceUrl };
  await writeFile(manifestPath(o.jobId), JSON.stringify(manifest, null, 1));
  return finals;
}
