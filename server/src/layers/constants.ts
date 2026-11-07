/**
 * Layers (2026-11-07): split a video into separate layers, one per object you name, plus depth and a clean background.
 * The ids, limits and plain names every Layers file shares. Isomorphic: no server imports, so the web reads the same words.
 *
 * Built only from official ComfyUI pieces (core nodes and Comfy-Org model repacks) and our own code:
 *  - SAM 3.1 (Meta, SAM License) finds each named object on the first frame and tracks it through the clip;
 *  - BiRefNet (MIT) gives soft edges, kept only in a thin band around each object's matte (our own combine, ffmpeg);
 *  - Depth Anything 3 Small (Apache-2.0) gives depth, normalised over the whole clip by our own code, and sets the layer order;
 *  - the clean background is Footage Effects' Vanish (LTX-2.5 on your computer, LTX-2.3 on Comfy Cloud), pasted only inside the objects' area.
 */

export const LAYERS_TOOL = 'layers';
export const LAYERS_PLUGIN = 'layers';
/** Your computer (your ComfyUI). */
export const LAYERS_LOCAL = 'comfy-layers';
/** Comfy Cloud (the same graph through the v2 jobs API). */
export const LAYERS_CLOUD = 'cloud-layers';
export const LAYERS_CLOUD_ROUTE = `comfy-cloud:${LAYERS_CLOUD}`;
export const LAYERS_WORKFLOW = 'layers-split-api.json';

export const LAYERS_MAX_SECONDS = 15;
export const LAYERS_MIN_SECONDS = 0.5;
export const LAYERS_MAX_OBJECTS = 4;
export const LAYERS_MAX_NAME = 40;
/** The analysis copy: at most this many frames per second and this long side (memory: every frame is held as floats in ComfyUI). */
export const LAYERS_FPS = 24;
export const LAYERS_LONG_SIDE = 1024;

/** The models, as every result and quote names them. */
export const LAYERS_MODELS = {
  sam: 'SAM 3.1',
  edges: 'BiRefNet',
  depth: 'Depth Anything 3 Small',
  plateLocal: 'LTX-2.5 Clean Plate',
  plateCloud: 'LTX-2.3 Vanish',
} as const;
export const LAYERS_MODEL_LINE = `${LAYERS_MODELS.sam} + ${LAYERS_MODELS.edges} + ${LAYERS_MODELS.depth}`;

/** One colour tag per layer (chip order), the same in the bar, the overview clip and the viewer. */
export const LAYER_COLOURS = ['#ff7a1a', '#3fa7ff', '#5fd068', '#c879ff'] as const;

/** The options (form fields '1' / '0'); all on by default. */
export const LAYERS_OPTIONS = [
  { field: 'edges', label: 'Clean edges', hint: 'Soft hair and fur edges from BiRefNet, kept close to each object' },
  { field: 'depth', label: 'Depth', hint: 'A depth pass from Depth Anything 3; it also puts the layers in order' },
  { field: 'background', label: 'Clean background', hint: 'The scene with the objects taken out (Vanish), first 5 s' },
] as const;
export type LayersOption = (typeof LAYERS_OPTIONS)[number]['field'];

/** The clean background covers at most this many seconds (Footage Effects runs up to 5 s at a time). */
export const LAYERS_PLATE_SECONDS = 5;

/** A chip's words, tidied: one line, no commas or colons (SAM reads "a, b" as two prompts and "a:2" as a count). */
export const cleanObjectName = (s: unknown): string => String(s ?? '').replace(/[,:;\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LAYERS_MAX_NAME);

/** The chips from a form value: a JSON list, or words split on commas / new lines. Empty names and repeats are dropped. */
export function objectNames(raw: unknown): string[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string' && raw.trim().startsWith('[')) { try { const v = JSON.parse(raw); list = Array.isArray(v) ? v : []; } catch { list = []; } }
  else if (typeof raw === 'string') list = raw.split(/[,\n]/);
  const out: string[] = [];
  for (const x of list) {
    const n = cleanObjectName(x);
    if (n && !out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n);
  }
  return out;
}

/** An option is on unless the form says 0 / false / off / no. */
export const optionOn = (v: unknown) => !/^(0|false|off|no)$/i.test(String(v ?? ''));
