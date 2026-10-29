/**
 * Topaz Bloom 2 · Comfy Cloud (2026-10-27, official Comfy template "Topaz: Image Enhance Bloom 2", comfy.org/workflows 1c0a3a9faad3,
 * api_topaz_image_enhance_bloom2): Topaz's TopazImageEnhanceV2 partner node (model "Bloom 2") as an ordinary Comfy Cloud workflow job, the
 * Comfy key once in extra_data.api_key_comfy_org, the way Topaz Video Enhance already runs (tools/videoUpscaleModels.ts).
 *
 * Graph (API format) = the template: LoadImage → TopazImageEnhanceV2 → SaveImageAdvanced (PNG 8-bit sRGB). The template's ImageCompare is a
 * preview only and is left out. Node inputs as Comfy Cloud's object_info lists them (full copy 2026-10-26): `model` is a dynamic combo, so
 * "Bloom 2" adds model.prompt ("" = Topaz writes its own), model.creativity 1–9 (template 3), model.seed 1–2000, model.color_preservation,
 * model.grain (off) and its four grain settings; output_width / output_height (optional, 0 = automatic; "Bloom 2 … preserve the input aspect
 * ratio and treat the requested size as a target"). We ask for source × factor on the long side and leave the other at 0.
 * Price: "Topaz Image Enhance (current node) charges per 8 megapixels of output (approximate)": Bloom 2 96.55 credits per 8 MP
 * (docs.comfy.org/tutorials/partner-nodes/pricing › Topaz › Image). Row cloud-topaz-bloom2 in shared/hostedPrices.ts (per started 8 MP block).
 */
import type { Plan } from './plans.js';
import { upscaleBlock, upscaleOutSize } from '../shared/imageUpscale.js';

export const BLOOM_PROVIDER = 'cloud-topaz-bloom2';
export const BLOOM_ROUTE = `comfy-cloud:${BLOOM_PROVIDER}`;
export const BLOOM_NODE = 'TopazImageEnhanceV2';
export const BLOOM_TEMPLATE = 'api_topaz_image_enhance_bloom2';
export const BLOOM_TEMPLATE_URL = 'https://comfy.org/workflows/1c0a3a9faad3-1c0a3a9faad3/';
export const BLOOM_DOC = 'https://docs.comfy.org/tutorials/partner-nodes/topaz/image-enhance-bloom-2';
/** The template's own settings (creativity 3, colours kept, no grain). */
export const BLOOM_DEFAULTS = { creativity: 3, color_preservation: true, grain: false, grain_model: 'silver', grain_strength: 0.5, grain_size: 1, grain_density: 0.5 } as const;

type In = Record<string, any>;
const scaleOf = (i: In) => { const s = Number(i.scale) || Number(String(i.mode ?? '').replace(/^x/i, '')) || 2; return Number.isFinite(s) ? s : 2; };
const seed2000 = (s: unknown) => (Number.isFinite(Number(s)) ? (Math.abs(Math.floor(Number(s))) % 2000) + 1 : 2);
const refuse = (msg: string) => Object.assign(new Error(`${msg} Nothing was sent or charged.`), { reasonCode: 'input_blocked', errorType: 'validation' });

/** The target size the node is asked for: source × factor on the long side (0 on the other = keep the shape). Without a size: 0 / 0 (automatic). */
export function bloomTarget(i: In): { output_width: number; output_height: number } {
  const s = i.sourceSize as { width: number; height: number } | null | undefined; if (!s?.width || !s?.height) return { output_width: 0, output_height: 0 };
  const o = upscaleOutSize(s.width, s.height, scaleOf(i)); return s.width >= s.height ? { output_width: o.width, output_height: 0 } : { output_width: 0, output_height: o.height };
}
/** The API-format graph. `image` is an upload placeholder ({__file}) or a Cloud asset ref. */
export function bloomGraph(i: In, image: unknown): Record<string, any> {
  const b = BLOOM_DEFAULTS; const prompt = String(i.prompt ?? '').trim();
  return {
    '3': { class_type: 'LoadImage', inputs: { image } },
    '2': { class_type: BLOOM_NODE, inputs: { image: ['3', 0], model: 'Bloom 2', 'model.prompt': prompt, 'model.creativity': b.creativity, 'model.seed': seed2000(i.seed),
      'model.color_preservation': b.color_preservation, 'model.grain': b.grain, 'model.grain_model': b.grain_model, 'model.grain_strength': b.grain_strength, 'model.grain_size': b.grain_size,
      'model.grain_density': b.grain_density, ...bloomTarget(i) } },
    '4': { class_type: 'SaveImageAdvanced', inputs: { images: ['2', 0], filename_prefix: 'openhiggsfield-topaz-bloom2', format: 'png', 'format.bit_depth': '8-bit', 'format.input_color_space': 'sRGB' } },
  };
}
/** The plan (comfy/cloudWorkflows.ts standalone entry): one pass, the factor checked like every upscale model (×2 / ×4, 8192 px cap). */
export function bloomCloudPlan(j: { id: string; toolId: string; provider: string; input: In }): Plan {
  const i = j.input; if (!i.imagePath) throw refuse('Topaz Bloom 2 needs a photo.');
  const b = upscaleBlock(BLOOM_PROVIDER, scaleOf(i), i.sourceSize ?? null); if (b) throw refuse(b.message);
  const graph = bloomGraph(i, { __file: String(i.imagePath) }); const t = graph['2'].inputs;
  return { tool: j.toolId, outKind: 'image', post: { kind: 'each' }, muxSourceAudio: false, labels: [`x${scaleOf(i)} upscale`],
    notes: [`Topaz Bloom 2 partner node (${BLOOM_NODE}) on Comfy Cloud: ×${scaleOf(i)}, target ${t.output_width || 'auto'} × ${t.output_height || 'auto'}, creativity ${t['model.creativity']}`],
    passes: [{ label: `x${scaleOf(i)} upscale`, workflow: `template:${BLOOM_TEMPLATE}`, graph, output: '4', expect: { model: 'Bloom 2' } }] };
}
