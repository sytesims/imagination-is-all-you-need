/**
 * Layers: the shared tables it adds itself (imported once, when the layers plugin loads): its two places (your computer, Comfy Cloud), the
 * Comfy Cloud workflow entry and its runner route, the Comfy Cloud price row (an estimate until one measured run: priceUnmeasured, the same
 * gate every Comfy Cloud workflow follows, routing/cloudRun.ts), model names, and licences.
 */
import { registerProvider } from '../providers.js';
import { registerWorkflowLicense, registerLicenseComponents, LICENSES } from '../licenses.js';
import { registerModelInfo } from '../models.js';
import { MODEL_CATALOG } from '../shared/modelCatalog.js';
import { CLOUD_WORKFLOWS } from '../comfy/cloudWorkflows.js';
import { VFX_CLOUD_REQUIRES, VFX_CLOUD_GRAPHS } from '../comfy/ltx23VfxCloud.js';
import { CLOUD_RUNNER_ROUTES } from '../routing/runnable.js';
import { NATIVE_DIRECT } from '../routing/directRoutes.js';
import { addTwin } from '../routing/routes.js';
import { HOSTED_PRICES, HOSTED_BY_ID, cloudGpuUsd, type HostedPrice } from '../shared/hostedPrices.js';
import { FOOTAGE_FX_WORKFLOW } from '../shared/footageFx.js';
import { LAYERS_LOCAL, LAYERS_CLOUD, LAYERS_CLOUD_ROUTE, LAYERS_TOOL, LAYERS_WORKFLOW, LAYERS_MAX_SECONDS, LAYERS_PLATE_SECONDS, LAYERS_MODEL_LINE, layersMode } from './constants.js';
import { layersPlan } from './plan.js';

/** Comfy Cloud: an estimate of GPU-seconds per second of clip until a measured run sets it. */
export const LAYERS_GPU_SEC = { analysis: 4, plate: 9 } as const;
/** The seconds the Comfy Cloud price counts: every second of the clip (analysis) plus the plate's seconds, weighted by its heavier work. */
export function layersBillSeconds(i: Record<string, any>): number {
  const sec = Math.min(LAYERS_MAX_SECONDS, Math.max(0.5, Number(i.duration) || 5));
  const plate = layersMode(i) === 'with-plate' ? Math.min(LAYERS_PLATE_SECONDS, sec) * (LAYERS_GPU_SEC.plate / LAYERS_GPU_SEC.analysis) : 0;
  return Math.round((sec + plate) * 100) / 100;
}

const SAM = { model: 'SAM 3.1 (sam3.1_multiplex_fp16, Comfy-Org/sam3.1) · finds and tracks each object', license: 'SAM License', commercial: 'restricted' as const, url: 'https://github.com/facebookresearch/sam3/blob/main/LICENSE', licenseId: 'sam-license' };
const PARTS = [
  { ...SAM, terms: LICENSES['sam-license']?.terms },
  { model: 'BiRefNet (birefnet.safetensors, Comfy-Org/BiRefNet; ZhengPeng7/BiRefNet) · soft edges', license: 'MIT', commercial: 'yes' as const, url: 'https://huggingface.co/ZhengPeng7/BiRefNet', licenseId: 'mit' },
  { model: 'Depth Anything 3 Small (depth_anything_3_small.safetensors, Comfy-Org/Depth-Anything-3; ByteDance-Seed) · depth and layer order', license: 'Apache-2.0', commercial: 'yes' as const, url: 'https://huggingface.co/Comfy-Org/Depth-Anything-3', licenseId: 'apache-2.0' },
  { model: 'Clean background: Footage Effects Vanish (LTX-2.5 + Clean Plate IC-LoRA on your computer, LTX-2.3 on Comfy Cloud; Lightricks)', license: 'LTX-2.x Community License', commercial: 'restricted' as const, url: 'https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x', licenseId: 'ltx-2x-community' },
  { model: 'Layers graph (workflows/layers-split-api.json): our own, core ComfyUI nodes, after the official Comfy-Org templates (SAM 3 video segmentation, BiRefNet remove background, Depth Anything 3 video depth)', license: 'MIT', commercial: 'yes' as const, url: 'https://github.com/Comfy-Org/workflow_templates', licenseId: 'mit' },
];

registerWorkflowLicense(LAYERS_WORKFLOW, ['sam-license', 'mit', 'apache-2.0']);
registerLicenseComponents(LAYERS_TOOL, PARTS as any);
registerProvider({ id: LAYERS_LOCAL, name: LAYERS_MODEL_LINE, kind: 'open-weights', via: `local ComfyUI, workflows/${LAYERS_WORKFLOW} (+ Footage Effects Vanish for the clean background)`,
  workflows: [LAYERS_WORKFLOW, FOOTAGE_FX_WORKFLOW], docUrl: 'https://docs.comfy.org/tutorials/utility/video-segment-sam3', licenseParts: ['sam-license', 'mit', 'apache-2.0'],
  nodes: ['SAM3_Detect', 'SAM3_VideoTrack', 'SAM3_TrackToMask', 'RemoveBackground', 'DA3Inference', 'DA3Render'] } as any);
registerProvider({ id: LAYERS_CLOUD, name: `${LAYERS_MODEL_LINE} · Comfy Cloud`, kind: 'hosted', license: 'sam-license', licenseUrl: SAM.url, docUrl: 'https://docs.comfy.org/tutorials/utility/video-segment-sam3',
  via: `Comfy Cloud workflow job (API v2): our own graph workflows/${LAYERS_WORKFLOW}, core nodes only, + Footage Effects Vanish (LTX-2.3); price not measured yet: an estimate`,
  workflows: [LAYERS_WORKFLOW], stages: [['uploading', 'Uploading your clip'], ['submitted', 'Submitted to Comfy Cloud'], ['rendering', 'Splitting on Comfy Cloud'], ['downloading', 'Downloading the layers']] } as any);
registerModelInfo(LAYERS_LOCAL, { name: `${LAYERS_MODEL_LINE}`, speed: 'medium', quality: 'good', hint: 'Free on your computer · up to 15 s, up to 4 objects', badges: ['new'] } as any);
registerModelInfo(LAYERS_CLOUD, { name: `${LAYERS_MODEL_LINE} · Comfy Cloud`, speed: 'fast', quality: 'good', hint: 'On rented graphics cards · up to 15 s, up to 4 objects', badges: ['new'] } as any);
for (const id of [LAYERS_LOCAL, LAYERS_CLOUD]) MODEL_CATALOG[id] = { name: LAYERS_MODEL_LINE, family: 'Layers',
  description: 'SAM 3.1 finds and tracks each thing you name, BiRefNet cleans the edges, Depth Anything 3 measures depth and orders the layers, and Footage Effects’ Vanish makes the clean background.',
  tech: 'SAM3_Detect on the first frame → one SAM3_VideoTrack (one object per name) → BiRefNet band refine (our own ffmpeg step) → DA3 Small depth, normalised over the clip → layers in depth order.' } as any;

const D = '2026-11-06' as HostedPrice['checkedAt'];
if (!HOSTED_BY_ID[LAYERS_CLOUD]) {
  const row: HostedPrice = { providerId: LAYERS_CLOUD, model: `Layers (${LAYERS_MODEL_LINE}) on Comfy Cloud`, unit: 'second', usd: cloudGpuUsd(LAYERS_GPU_SEC.analysis), sourceUrl: 'https://www.comfy.org/cloud/pricing',
    checkedAt: D, estimated: true, priceUnmeasured: true,
    note: `Price not measured yet: an estimate. Comfy Cloud bills active GPU time (0.39 credits per GPU-second, 211 credits = $1), model load included. Guessed at about ${LAYERS_GPU_SEC.analysis} GPU-seconds per second of clip for SAM 3.1 tracking, BiRefNet and Depth Anything 3 Small at up to 1024 px, plus the clean background (LTX-2.3 Vanish, about ${LAYERS_GPU_SEC.plate} GPU-seconds per second for up to ${LAYERS_PLATE_SECONDS} s). One measured run sets the real rate.` };
  HOSTED_PRICES.push(row); HOSTED_BY_ID[LAYERS_CLOUD] = row;
}
NATIVE_DIRECT[LAYERS_CLOUD] = { label: 'Comfy Cloud', sourceUrl: 'https://docs.comfy.org/tutorials/utility/video-segment-sam3', checkedAt: '2026-11-07', typicalLatencySec: 180, latencyEstimated: true, latencySource: 'estimated', output: 'video',
  priceInput: (i: Record<string, any>) => ({ ...i, duration: layersBillSeconds(i) }), caps: { maxSeconds: LAYERS_MAX_SECONDS, objects: 4 } } as any;
CLOUD_WORKFLOWS[LAYERS_CLOUD_ROUTE] = { routeId: LAYERS_CLOUD_ROUTE, provider: LAYERS_CLOUD, standalone: true, target: 'cloud', label: 'Layers · Comfy Cloud',
  graphs: [LAYERS_WORKFLOW, VFX_CLOUD_GRAPHS.vanish.graph /* the clean background: Footage Effects' Vanish graph */],
  requires: { nodes: [...new Set(['LoadVideo', 'GetVideoComponents', 'CheckpointLoaderSimple', 'ImageFromBatch', 'CLIPTextEncode', 'SAM3_Detect', 'MaskToImage', 'BatchImagesNode', 'ImageToMask', 'SAM3_VideoTrack',
    'SAM3_TrackToMask', 'SaveImage', 'LoadBackgroundRemovalModel', 'RemoveBackground', 'LoadDA3Model', 'DA3Inference', 'DA3Render', ...VFX_CLOUD_REQUIRES.nodes])],
    models: [{ loader: 'CheckpointLoaderSimple', field: 'ckpt_name', file: 'sam3.1_multiplex_fp16.safetensors' }, { loader: 'LoadBackgroundRemovalModel', field: 'bg_removal_name', file: 'birefnet.safetensors' },
      { loader: 'LoadDA3Model', field: 'model_name', file: 'depth_anything_3_small.safetensors' }, ...VFX_CLOUD_REQUIRES.models] },
  plan: (j) => layersPlan(j, 'cloud') };
CLOUD_RUNNER_ROUTES.add(LAYERS_CLOUD_ROUTE);
/** One card, two places: Comfy Cloud is a place of the local model (like Footage Effects), with its own price rule; held while unmeasured
 *  only when OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD=0 (the shared gate, routing/select.ts). */
addTwin({ model: LAYERS_LOCAL, twin: LAYERS_CLOUD, tools: [LAYERS_TOOL], aliasOk: true, heldUntilMeasured: true, priceInput: (i) => ({ ...i, duration: layersBillSeconds(i) }),
  caps: { localOnly: false, maxSeconds: LAYERS_MAX_SECONDS, objects: 4, note: 'SAM 3.1, BiRefNet and Depth Anything 3 on Comfy Cloud, with the clean background from LTX-2.3 Vanish. Up to 15 s, up to 4 objects.' } });
