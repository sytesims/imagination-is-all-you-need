/**
 * Layers: layers.json, the one description of a split (the viewer reads it from GET /api/layers/:id; the export ZIP carries it as layers.json).
 * Isomorphic and pure: the web reads the same types.
 */
import { LAYER_COLOURS, LAYERS_MODELS } from './constants.js';

export interface LayerEntry {
  /** chip order (0 = the first chip) */ id: number; name: string; colour: string;
  /** stacking position, 0 = bottom (just above the background) */ order: number;
  /** median depth 0–1 (near = 1), null without depth or when never seen */ depth: number | null;
  /** share of frames where it shows (0–1) */ coverage: number;
  /** the in-app preview: the clip's colours with this layer's alpha (VP9 WebM) */ previewUrl: string;
  /** black-and-white matte preview (H.264) */ matteUrl: string;
}
export interface LayersManifest {
  schema: 1; app: 'Imagination Is All You Need'; kind: 'video-layers'; jobId: string;
  width: number; height: number; fps: number; frames: number; seconds: number;
  /** bottom first */ layers: LayerEntry[];
  background: { url: string | null; seconds: number; model: string | null; note: string | null };
  depth: { url: string | null; bits: 16 | null; range: { lo: number; hi: number } | null; nearIs: 'white'; model: string | null };
  overviewUrl: string; sourceUrl: string;
  models: { name: string; role: string; licence: string; url: string }[];
  where: 'your-computer' | 'comfy-cloud' | 'sample';
}

export const LAYERS_LICENCES = [
  { name: LAYERS_MODELS.sam, role: 'finds and tracks each object', licence: 'SAM License (Meta; restricted)', url: 'https://huggingface.co/Comfy-Org/sam3.1' },
  { name: LAYERS_MODELS.edges, role: 'soft edges', licence: 'MIT', url: 'https://huggingface.co/Comfy-Org/BiRefNet' },
  { name: LAYERS_MODELS.depth, role: 'depth and layer order', licence: 'Apache-2.0', url: 'https://huggingface.co/Comfy-Org/Depth-Anything-3' },
] as const;
export const PLATE_LICENCE = { role: 'clean background', licence: 'LTX-2.x Community License', url: 'https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x' } as const;

export const colourOf = (id: number) => LAYER_COLOURS[id % LAYER_COLOURS.length];

/** The manifest from what assemble.ts made. order = object ids bottom first. */
export function buildManifest(o: {
  jobId: string; width: number; height: number; fps: number; frames: number; names: string[]; order: number[];
  depths: (number | null)[] | null; coverage: number[]; urls: { preview: string[]; matte: string[]; overview: string; source: string; depth: string | null; background: string | null };
  range: { lo: number; hi: number } | null; plate: { seconds: number; model: string } | null; edges: boolean; where: LayersManifest['where'];
}): LayersManifest {
  const layers: LayerEntry[] = o.order.map((id, pos) => ({
    id, name: o.names[id], colour: colourOf(id), order: pos,
    depth: o.depths && o.depths[id] != null ? Math.round((o.depths[id]! / 255) * 1000) / 1000 : null,
    coverage: Math.round((o.coverage[id] ?? 0) * 1000) / 1000, previewUrl: o.urls.preview[id], matteUrl: o.urls.matte[id],
  }));
  const seconds = Math.round((o.frames / o.fps) * 100) / 100;
  const models: LayersManifest['models'] = LAYERS_LICENCES.filter((m) => (m.name !== LAYERS_MODELS.edges || o.edges) && (m.name !== LAYERS_MODELS.depth || !!o.urls.depth)).map((m) => ({ ...m }));
  if (o.where === 'comfy-cloud') for (const m of models) if (m.name === LAYERS_MODELS.depth) Object.assign(m, { name: LAYERS_MODELS.depthCloud, licence: 'Apache-2.0 (Hugging Face tag)' }); // the Cloud template's default
  if (o.plate) models.push({ name: o.plate.model, ...PLATE_LICENCE });
  return {
    schema: 1, app: 'Imagination Is All You Need', kind: 'video-layers', jobId: o.jobId,
    width: o.width, height: o.height, fps: o.fps, frames: o.frames, seconds, layers,
    background: { url: o.urls.background, seconds: o.plate ? Math.min(o.plate.seconds, seconds) : 0, model: o.plate?.model ?? null,
      note: !o.plate ? null : o.plate.seconds + 0.5 < seconds ? `The clean background covers the first ${o.plate.seconds} s; after that it holds its last frame.` : null },
    depth: { url: o.urls.depth, bits: o.urls.depth ? 16 : null, range: o.range, nearIs: 'white', model: o.urls.depth ? LAYERS_MODELS.depth : null },
    overviewUrl: o.urls.overview, sourceUrl: o.urls.source, models, where: o.where,
  };
}

/** layers.json inside the export: the manifest with the file names of the ZIP instead of app links. */
export function exportManifest(m: LayersManifest, files: { layer: (e: LayerEntry) => { prores: string; matte: string }; depth: string | null; background: string | null }) {
  return {
    schema: m.schema, app: m.app, kind: m.kind, width: m.width, height: m.height, fps: m.fps, frames: m.frames, seconds: m.seconds,
    order: 'bottom first (the first entry sits just above the background)',
    layers: m.layers.map((e) => ({ name: e.name, colour: e.colour, order: e.order, depth: e.depth, coverage: e.coverage, ...files.layer(e) })),
    background: files.background ? { file: files.background, seconds: m.background.seconds, note: m.background.note } : null,
    depth: files.depth ? { folder: files.depth, bits: 16, nearIs: 'white', normalised: 'over the whole clip (1st–99th percentile)' } : null,
    models: m.models,
  };
}
