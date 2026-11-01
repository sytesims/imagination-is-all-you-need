import { config } from './config.js';
import { apiNodesIn } from './apiNodes.js';
import type { Job } from './jobs.js';
import type { ToolDef } from './tools/types.js';
import { mockRun } from './tools/shared.js';
import { directRun } from './routing/state.js';

/** A backend that can execute a tool's job. All hosted providers are MOCK-ONLY for now (no network calls). */
export interface ProviderDef {
  id: string;
  name: string;
  /** hosted = Comfy partner node / Router / Cloud; hosted-direct = vendor API fallback (no Comfy node), own API-key env var. */
  kind: 'open-weights' | 'hosted' | 'hosted-direct';
  /** hosted-direct: env var holding the vendor API key (mock ignores it). */
  apiKeyEnv?: string;
  /** How it would be reached for real. */
  via: string;
  /** Progress stages when this provider runs (undefined = the tool's own stages). */
  stages?: [string, string][];
  /** Run a job for a tool. Undefined = use the tool's own run() (the open-weights Comfy workflow path). */
  run?: (job: Job, tool: ToolDef) => Promise<void>;
  /** Workflow files this provider runs (intersected with tool.workflows). Omit = legacy rule below. */
  workflows?: string[];
  /** Licence id for hosted providers (default 'proprietary'); open-weights use their workflow's licence. */
  license?: string;
  /** Licence/terms URL shown under the option (hosted: vendor terms). */
  licenseUrl?: string;
  /** Where this provider is documented (Comfy partner-node page, model card…). */
  docUrl?: string;
  /** Open-weights provider without a built workflow yet (custom node pack): its licence parts. */
  licenseParts?: string[];
  /** ComfyUI node class(es) it maps to. */
  nodes?: string[];
  /** Oldest ComfyUI release whose core has every node/loader type this provider's graphs need (e.g. MOSS-Image: '0.41.3'). Unset = any supported release. */
  minComfyVersion?: string;
}

import { OPEN_WEIGHTS_ONLY, openWeightsOnly, LICENSES, workflowLicense } from './licenses.js';
import { bfsSwapFor } from './comfy/bfsSwap.js';
export { OPEN_WEIGHTS_ONLY, openWeightsOnly };
/** Workflow variants a provider runs for a tool (first = primary). Hosted providers run none locally. */
export function providerWorkflows(tool: ToolDef, p: ProviderDef): string[] {
  const bfs = bfsSwapFor(tool.id, p.id); if (bfs) return [bfs.workflowFile]; // Face Swap / Person Swap on Qwen 2.1: base model + BFS LoRA (weights, Ready, downloads)
  if (p.workflows) return tool.workflows.filter((w) => p.workflows!.includes(w));
  if (p.kind !== 'open-weights') return [];
  if (p.id === 'comfy-funcamera') return tool.workflows.filter((w) => w === 'reshoot-funcamera-api.json');
  return tool.workflows.filter((w) => w !== 'reshoot-funcamera-api.json');
}
/** Licence badge for a provider on a tool = licence of its primary workflow (hosted = proprietary). */
export function providerLicense(tool: ToolDef, p: ProviderDef) {
  if (p.kind !== 'open-weights') { const l = { ...(LICENSES[p.license ?? 'proprietary'] ?? LICENSES.proprietary), url: p.licenseUrl ?? p.docUrl ?? null }; return { ...l, parts: [l] }; }
  if (p.licenseParts) { const parts = p.licenseParts.map((x) => LICENSES[x]).filter(Boolean); const gov = parts.find((l) => !l.osi) ?? parts[0]; return { ...gov, parts }; }
  const w = providerWorkflows(tool, p)[0];
  return w ? workflowLicense(w) : { ...LICENSES['apache-2.0'], parts: [LICENSES['apache-2.0']] };
}

const hostedStages = (label: string): [string, string][] => [['uploading', 'Uploading'], ['submitted', `Submitted to ${label}`], ['rendering', `${label} rendering`], ['downloading', 'Downloading result'], ['muxing', 'Muxing audio']];
const hostedMock = (label: string) => (job: Job, tool: ToolDef) => {
  if (!job.input.videoPath || job.input.outKind) return tool.run(job); // image-input apps + media tools (own mock render): tool renders the still first (mock)
  const stages = hostedStages(label);
  const labels = Array.isArray(job.input.angles) ? ['Multi-angle cut', ...(job.input.fullClip ? job.input.angles.map((a: any) => a.angle) : [])] : ['Result'];
  return mockRun(job, stages, labels, 5000 + 1500 * (labels.length - 1));
};

const providers = new Map<string, ProviderDef>();
export function registerProvider(p: ProviderDef) {
  if (providers.has(p.id)) throw new Error(`duplicate provider ${p.id}`);
  providers.set(p.id, p);
}
/** Comfy Cloud running an open-weight workflow counts as open weights: a cloud-* provider that ships its own workflow
 *  and carries the model's weights licence, and whose graphs contain no API/partner nodes (B5, apiNodes.ts; e.g. cloud-h3-wf). Comfy Cloud API nodes
 *  (cloud-h3's ComfyCloudMiniMaxH3*Node) stay hosted, so open-weights-only mode hides them. */
export const comfyCloudOpen = (p?: ProviderDef) => !!p && p.id.startsWith('cloud-') && !!p.license && p.license !== 'proprietary' && (p.workflows?.length ?? 0) > 0
  && p.workflows!.every((f) => apiNodesIn(f).length === 0); // B5: a graph with API/partner nodes (e.g. ComfyCloudMiniMaxH3*Node) is hosted, not open weights
/** Open-weights marker (badge) for a provider: open-weights kind, or a Comfy Cloud workflow whose graphs have no API nodes (B5: cloud-h3-wf true, cloud-h3 false).
 *  Same value on /api/tools providers[].openWeights, /api/models entries and /api/routes routes. */
export const providerOpenWeights = (p?: ProviderDef) => !!p && (p.kind === 'open-weights' || comfyCloudOpen(p));
/** Open-weights-only mode hides hosted providers (partner/API nodes, hosted model APIs) only; Comfy Cloud open-weight workflows stay. Licences never filter. */
export const allowed = (p: ProviderDef) => !openWeightsOnly() || p.kind === 'open-weights' || comfyCloudOpen(p);
/** Allowed for this tool: same as allowed(p) (no licence check, K1). */
export const allowedFor = (_tool: ToolDef, p: ProviderDef) => allowed(p); // Open-weights-only hides hosted providers; licences are documented, not used as filters.
export const getProvider = (id: string) => providers.get(id);
/** Providers a tool can use right now (respects open-weights-only mode), default first. */
export const toolProviders = (tool: ToolDef) => tool.providers.map((id) => providers.get(id)).filter((p): p is ProviderDef => !!p && allowedFor(tool, p));

/** Swap tools batch their own ref groups and reach ComfyUI through pipeline.startJob. */
const SELF_BATCHED = new Set(['object-swap', 'motion-transfer', 'restyle']);
export async function runWithProvider(job: Job, tool: ToolDef) {
  if (job.input?.voiceFields && (!job.routing || directRun.has(job.id))) { // Voice controls (tools/voice/voiceControls.ts): native params for the provider that actually runs, ffmpeg post after (0 credits)
    const vc = await import('./tools/voice/voiceControls.js'); const { DATA_DIR } = await import('./config.js');
    if (!(await vc.voicePre(job, DATA_DIR))) return; await runWithProviderInner(job, tool); return vc.voicePostRun(job, DATA_DIR);
  }
  await runWithProviderInner(job, tool);
  if (job.input?.adLogo) await (await import('./adPackLogo.js')).stampAdLogos(job); // Ad Pack: the brand's logo onto each finished ad (free, our code)
}
async function runWithProviderInner(job: Job, tool: ToolDef) {
  if (job.routing && !directRun.has(job.id)) { await (await import('./routing/run.js')).runRouted(job, tool); if (job.input?.voiceFields) { const vc = await import('./tools/voice/voiceControls.js'); await vc.voicePostRun(job, (await import('./config.js')).DATA_DIR); } return; } // multi-provider routing (routing/run.ts)
  const p = providers.get(job.provider);
  if (config.backend === 'comfy' && p?.kind === 'open-weights' && (!SELF_BATCHED.has(tool.id) || /^comfy-h3-(restyle|vfx)$/.test(p.id))) { // H3 restyle/VFX: single-pass native plan (tools/h3/plan.ts)
    const { nativeMode, runNativeSafe } = await import('./comfy/runNative.js'); const { hasPlan } = await import('./comfy/plans.js');
    if (nativeMode() && hasPlan(job as any)) return runNativeSafe(job);
  }
  // Hosted providers bypass tool.run, so run chunked ref groups here too (each group was priced; each gives its own output).
  if (p?.run && (job.input.refBatches?.length ?? 0) > 1) { const { runRefBatches } = await import('./tools/shared.js'); return runRefBatches(job, (j) => p.run!(j, tool)); }
  return p?.run ? p.run(job, tool) : tool.run(job);
}

// ---- Registered providers ----
registerProvider({ id: 'comfy-open', name: 'Open weights (ComfyUI workflow)', kind: 'open-weights', via: 'local ComfyUI / comfy-api-proxy, workflows/*.json (mock unless OPENHIGGSFIELD_BACKEND=comfy)' });
registerProvider({ id: 'comfy-funcamera', name: 'Open weights · Wan Fun Camera (fallback)', kind: 'open-weights', via: 'ComfyUI workflows/reshoot-funcamera-api.json (mock unless OPENHIGGSFIELD_BACKEND=comfy)' });
registerProvider({ id: 'router-kling', name: 'Kling (hosted)', kind: 'hosted', via: 'Comfy Router kling/kling-v3-omni (routing/routerModels.ts; sample output without a key)', stages: hostedStages('Kling'), run: hostedMock('Kling') });
// 2026-10-25: Wan 3.0 (new model) and the Comfy Router places of LTX-2.5 Pro / FLUX 3 Video (same models as direct-ltx-25-pro / direct-flux3-video: shared/modelIds.ts ENGINE_MODEL)
registerProvider({ id: 'router-wan3', name: 'Wan 3.0 (hosted)', kind: 'hosted', via: 'Comfy Router wan/wan3.0-video (routing/routerModels.ts; sample output without a key)', stages: hostedStages('Wan'), run: hostedMock('Wan') });
registerProvider({ id: 'router-veo', name: 'Veo (hosted)', kind: 'hosted', via: 'Comfy Router veo/veo-3.1-generate-001 (routing/routerModels.ts; sample output without a key)', stages: hostedStages('Veo'), run: hostedMock('Veo') });
registerProvider({ id: 'router-ltx-25-pro', name: 'LTX-2.5 Pro (hosted)', kind: 'hosted', via: 'Comfy Router ltx/ltx-2-5-pro (routing/routerModels.ts; sample output without a key)', stages: hostedStages('LTX'), run: hostedMock('LTX') });
// 2026-10-27: the Comfy Cloud place of the LTX-2.5 Pro / Fast cards for image to video and first + last frame: the LTX-2.5 partner node
// LtxApi25ImageToVideo as a Comfy Cloud workflow job (official templates api_ltx2_5_i2v / api_ltx2_5_flf2v; comfy/ltx25ApiCloud.ts). Router stays text to video.
for (const [id, name, model] of [['cloud-ltx25-pro-api', 'LTX-2.5 Pro · Comfy Cloud', 'LTX-2.5 (Pro)'], ['cloud-ltx25-fast-api', 'LTX-2.5 Fast · Comfy Cloud', 'LTX-2.5 (Fast)']] as const)
  registerProvider({ id, name, kind: 'hosted', via: `Comfy partner node LtxApi25ImageToVideo (model "${model}") on Comfy Cloud, Comfy key in extra_data; graph from the official templates api_ltx2_5_i2v / api_ltx2_5_flf2v (comfy/ltx25ApiCloud.ts); sample output without a key`,
    stages: hostedStages('Comfy Cloud'), run: hostedMock('Comfy Cloud'), nodes: ['LtxApi25ImageToVideo'], docUrl: 'https://docs.comfy.org/tutorials/partner-nodes/lightricks/ltx-2-5' } as any);
registerProvider({ id: 'router-flux3-video', name: 'FLUX 3 Video (hosted)', kind: 'hosted', via: 'Comfy Router bfl/flux-3-video (routing/routerModels.ts; sample output without a key)', stages: hostedStages('FLUX'), run: hostedMock('FLUX') });
// 2026-10-25: Comfy Router places of models that also run on BytePlus / Google (same model card; shared/modelIds.ts ENGINE_MODEL).
registerProvider({ id: 'router-seedance-25', name: 'Seedance 2.5 (hosted)', kind: 'hosted', via: 'Comfy Router byteplus/dreamina-seedance-2-5-260628 (routing/routerModels.ts; sample output without a key)', stages: hostedStages('Seedance'), run: hostedMock('Seedance') });
registerProvider({ id: 'router-seedance-20-fast', name: 'Seedance 2.0 Fast (hosted)', kind: 'hosted', via: 'Comfy Router byteplus/dreamina-seedance-2-0-fast-260128 (routing/routerModels.ts; sample output without a key)', stages: hostedStages('Seedance'), run: hostedMock('Seedance') });
registerProvider({ id: 'router-seedance-20-mini', name: 'Seedance 2.0 Mini (hosted)', kind: 'hosted', via: 'Comfy Router byteplus/dreamina-seedance-2-0-mini (routing/routerModels.ts; sample output without a key)', stages: hostedStages('Seedance'), run: hostedMock('Seedance') });
registerProvider({ id: 'router-veo-fast', name: 'Veo 3.1 Fast (hosted)', kind: 'hosted', via: 'Comfy Router veo/veo-3.1-fast-generate-001 (routing/routerModels.ts; sample output without a key)', stages: hostedStages('Veo'), run: hostedMock('Veo') });
// 2026-10-31: four more Comfy Router video models (routing/routerModels.ts): Veo 3.1 Lite, Wan 3.0 Prime, Pruna P-Video-2, Grok Imagine Video 1.5 Lite
registerProvider({ id: 'router-veo-lite', name: 'Veo 3.1 Lite (hosted)', kind: 'hosted', via: 'Comfy Router veo/veo-3.1-lite-generate-001 (routing/routerModels.ts; sample output without a key)', stages: hostedStages('Veo'), run: hostedMock('Veo') });
registerProvider({ id: 'router-wan3-prime', name: 'Wan 3.0 Prime (hosted)', kind: 'hosted', via: 'Comfy Router wan/wan3.0-video-prime (routing/routerModels.ts; sample output without a key)', stages: hostedStages('Wan'), run: hostedMock('Wan') });
registerProvider({ id: 'router-pvideo2', name: 'P-Video-2 (hosted)', kind: 'hosted', via: 'Comfy Router pruna/p-video-2 (routing/routerModels.ts; sample output without a key)', stages: hostedStages('Pruna'), run: hostedMock('Pruna') });
registerProvider({ id: 'router-grok-video-lite', name: 'Grok Imagine Video 1.5 Lite (hosted)', kind: 'hosted', via: 'Comfy Router xai/grok-imagine-video-1.5-lite (routing/routerModels.ts; sample output without a key)', stages: hostedStages('Grok'), run: hostedMock('Grok') });
// Video Swap on Comfy Router (2026-10-25): cloud person swap / motion transfer (routing/routerModels.ts swapSpec, shared/cloudSwap.ts). Separate engines from the
// Generate Video ones: other Router tasks (video edit), other prices, other limits.
registerProvider({ id: 'router-kling-edit', name: 'Kling 3.0 Omni Edit (hosted)', kind: 'hosted', via: 'Comfy Router kling/kling-v3-omni, video edit (routing/routerModels.ts; sample output without a key)', docUrl: 'https://docs.comfy.org/development/comfy-router/models/kling/kling-v3-omni/code', stages: hostedStages('Kling'), run: hostedMock('Kling') });
registerProvider({ id: 'router-seedance-25-edit', name: 'Seedance 2.5 Edit (hosted)', kind: 'hosted', via: 'Comfy Router byteplus/dreamina-seedance-2-5-260628, video edit (routing/routerModels.ts; sample output without a key)', docUrl: 'https://docs.comfy.org/development/comfy-router/models/byteplus/dreamina-seedance-2-5-260628/code', stages: hostedStages('Seedance'), run: hostedMock('Seedance') });
// Render (Direct a Shot step 3, 2026-10-26): Runway Aleph 2 and Luma Ray 3.2 video edit (routing/routerModels.ts renderSpec, shared/renderModels.ts).
registerProvider({ id: 'router-aleph2', name: 'Runway Aleph 2 (hosted)', kind: 'hosted', via: 'Comfy Router runway/aleph2, video to video (routing/routerModels.ts; sample output without a key)', docUrl: 'https://docs.comfy.org/development/comfy-router/models/runway/aleph2/code', stages: hostedStages('Runway'), run: hostedMock('Runway') });
registerProvider({ id: 'router-ray32-edit', name: 'Luma Ray 3.2 Edit (hosted)', kind: 'hosted', via: 'Comfy Router luma_2/ray-3.2, video edit (routing/routerModels.ts; sample output without a key)', docUrl: 'https://docs.comfy.org/development/comfy-router/models/luma_2/ray-3-2/code', stages: hostedStages('Luma'), run: hostedMock('Luma') });
registerProvider({ id: 'router-seedance', name: 'Seedance (hosted)', kind: 'hosted', via: 'Comfy Router byteplus/dreamina-seedance-2-0-260128 (routing/routerModels.ts; sample output without a key)', stages: hostedStages('Seedance'), run: hostedMock('Seedance') });

// ---- Model additions: Create Image, Generate Video (MiniMax H3), Audio, Add soundtrack ----
const local = (id: string, name: string, workflows: string[], docUrl: string, nodes?: string[], licenseParts?: string[], extra?: Pick<ProviderDef, 'minComfyVersion'>) =>
  registerProvider({ id, name, kind: 'open-weights', via: workflows.length ? `local ComfyUI, workflows/${workflows[0]} (mock unless OPENHIGGSFIELD_BACKEND=comfy)` : `local ComfyUI + custom node pack ${docUrl} (mock only: no workflow built yet, pack not on the validator)`, workflows, docUrl, nodes, licenseParts, ...extra });
const D = 'https://docs.comfy.org/built-in-nodes/';
/** Hosted partner node (Comfy API, mock only). Only nodes listed in Comfy's partner-node docs AND present in ComfyUI 0.41's object_info. */
const hosted = (id: string, name: string, node: string, licenseUrl?: string) =>
  registerProvider({ id, name, kind: 'hosted', via: `Comfy partner node ${node}; runs on Comfy Router with a Comfy key where routing/routerModels.ts maps it (sample output without a key)`, stages: hostedStages(name), run: hostedMock(name), docUrl: D + node, nodes: [node], licenseUrl: licenseUrl ?? D + node });
// Create Image (open weights)
local('comfy-qwen21', 'Qwen Image 2.1 (open weights, research licence)', ['create-image-qwen21-t2i-api.json', 'create-image-qwen21-edit-api.json'], 'https://huggingface.co/Qwen/Qwen-Image-2.1');
// Qwen Image 2.1 Turbo: the official Turbo templates (8 steps; edit takes ONE image), same text encoder + VAE as Qwen Image 2.1
local('comfy-qwen21-turbo', 'Qwen Image 2.1 Turbo (open weights, research licence)', ['create-image-qwen21-turbo-t2i-api.json', 'create-image-qwen21-turbo-edit-api.json'], 'https://huggingface.co/Comfy-Org/Qwen-Image-2.1');
local('comfy-qwen-image', 'Qwen-Image / Qwen-Image-Edit-2509 (Apache-2.0)', ['create-image-qwen-t2i-api.json', 'create-image-qwen-edit2509-api.json', 'create-image-qwen-edit2509-inpaint-api.json', 'create-image-qwen-edit2509-multiref-api.json'], 'https://huggingface.co/Qwen/Qwen-Image');
// Shots only (app-shots, optional route): Qwen-Image-Edit-2509 + the multiple-angles LoRA (dx8152/Qwen-Edit-2509-Multiple-angles, Apache-2.0, 236 MB extra)
local('comfy-qwen-angles', 'Qwen-Image-Edit-2509 + Multiple-angles LoRA (Apache-2.0)', ['shots-qwen-edit2509-angles-api.json'], 'https://huggingface.co/dx8152/Qwen-Edit-2509-Multiple-angles');
// Create Image (hosted partner nodes)
([['api-flux2', 'BFL Flux.2', 'Flux2ImageNode'], ['api-gpt-image', 'OpenAI GPT Image', 'OpenAIGPTImageNodeV2'], ['api-nano-banana', 'Google Nano Banana 2', 'GeminiNanoBanana2'],
  ['api-seedream', 'ByteDance Seedream', 'ByteDanceSeedreamNodeV3'], ['api-ideogram', 'Ideogram V4', 'IdeogramV4'], ['api-recraft', 'Recraft V4', 'RecraftV4TextToImageNode'],
  ['api-luma-image', 'Luma Image', 'LumaImageNode2'], ['api-kling-image', 'Kling Omni Image', 'KlingOmniProImageNode'], ['api-krea', 'Krea 3', 'Krea3ImageNode'],
  /* Reve removed 2026-10-21: its API closed (shared/lifecycle.ts RETIRED_MODELS) */ ['api-runway-image', 'Runway Image', 'RunwayTextToImageNode'], ['api-grok-image', 'Grok Image', 'GrokImageNode'],
  ['api-qwen-image', 'Qwen Image (Alibaba API)', 'QwenImageTextToImageApi'], ['api-wan-image', 'Wan Image (Alibaba API)', 'WanTextToImageApi'],
  ['api-hunyuan-image', 'Tencent Hunyuan Image', 'HunyuanImageTextToImageApi'], ['api-meta-muse', 'Meta Muse Image', 'MetaMuseImageTextToImageApi'],
  // 2026-10-22 (model-catalog pass): node classes from the official Comfy partner templates (api_openai_gpt_image_25_*, api_nano_banana_2_1_*, api_nano_banana_pro,
  // api_bfl_flux3_*, api_bfl_flux2_max_sofa_swap, api_bytedance_seedream_5_0_flash_*, api_ideogram_v4_5_*, api_qwen3_*, api_recraft_v4_1_t2i, api_luma_uni_1_image_create)
  ['api-gpt-image-25-flare', 'OpenAI GPT Image 2.5 Flare', 'OpenAIGPTImageNodeV2'], ['api-gpt-image-25-sunburst', 'OpenAI GPT Image 2.5 Sunburst', 'OpenAIGPTImageNodeV2'],
  ['api-nano-banana-21', 'Google Nano Banana 2.1', 'GeminiNanoBanana2V2'], ['api-nano-banana-pro', 'Google Nano Banana Pro', 'GeminiImage2Node'],
  ['api-flux3-image', 'BFL FLUX 3 Image', 'Flux3ImageNode'], ['api-flux2-max', 'BFL Flux.2 [max]', 'Flux2ImageNode'], ['api-seedream-flash', 'ByteDance Seedream 5.0 Flash', 'ByteDanceSeedreamNodeV3'],
  ['api-ideogram-45', 'Ideogram 4.5', 'IdeogramTextToImageApi'], ['api-qwen-image-pro', 'Qwen Image 3.0 Pro (Alibaba API)', 'QwenImageTextToImageApi'],
  ['api-recraft-41', 'Recraft V4.1', 'RecraftV4TextToImageNode'], ['api-recraft-41-pro', 'Recraft V4.1 Pro', 'RecraftV4TextToImageNode'], ['api-luma-uni1-max', 'Luma UNI-1 Max', 'LumaImageNode2'],
  // 2026-10-25 (Comfy Router image batch): the partner nodes that run these models (docs.comfy.org/built-in-nodes: OpenAIGPTImage1 model gpt-image-1.5,
  // ByteDanceSeedreamNode model seedream-4-5-251128, GrokImageNode model grok-imagine-image-pro)
  ['api-gpt-image-15', 'OpenAI GPT Image 1.5', 'OpenAIGPTImage1'], ['api-seedream-45', 'ByteDance Seedream 4.5', 'ByteDanceSeedreamNode'], ['api-grok-image-pro', 'Grok Imagine Image Pro', 'GrokImageNode'],
  // 2026-10-26: Bria FIBO 2.0 (partner nodes BriaImageGenerate "Bria FIBO 2.0 Image Generate" and BriaImageEditNode "Bria FIBO 2.0 Image Edit")
  ['api-bria-fibo2', 'Bria FIBO 2.0', 'BriaImageGenerate']] as const)
  .forEach(([id, n, node]) => hosted(id, `${n} (hosted)`, node));
// Generate Video: MiniMax H3 local + Comfy Cloud (mock placeholder)
// Object Swap backup (non-default): H3 Character Swap LoRA v1.5 on MiniMax H3 Ref2VA, workflows/object-swap-h3-charswap-api.json
local('comfy-h3-charswap', 'H3 Character Swap LoRA v1.5', ['object-swap-h3-charswap-api.json'], 'https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA', ['MiniMaxH3ReferenceToVideo', 'LoraLoaderModelOnly'], ['minimax-community-akatz-charswap']);
local('comfy-h3', 'MiniMax H3', ['h3-t2v-api.json', 'h3-i2v-api.json', 'h3-r2v-api.json'], 'https://huggingface.co/MiniMaxAI/MiniMax-H3');
// Wan 2.2 TI2V 5B (2026-10-24): free local text/image to video that runs on Apple Silicon (fp16 files, no fp8). One graph from the official
// template video_wan2_2_5B_ti2v (workflows/wan22-ti2v-5b-api.json; plan: comfy/plans.ts wan22ti2v). Core nodes only. Apache-2.0.
// LTX-2.5 22B (2026-10-25): free local text / image / first + last frame to video WITH its own sound, on Apple Silicon (GGUF Q4_K_M, bf16 files; the same
// files as Direct a Shot’s Render step). Graphs from the official templates video_ltx2_5_i2v / video_ltx2_5_flf2v (workflows/ltx25-ti2v-api.json, ltx25-flf-api.json; plan: comfy/ltx25Video.ts).
local('comfy-ltx25-video', 'LTX-2.5 22B', ['ltx25-ti2v-api.json', 'ltx25-flf-api.json'], 'https://docs.comfy.org/tutorials/video/ltx/ltx-2-5',
  ['UnetLoaderGGUF', 'CLIPLoader', 'VAELoader', 'LatentUpscaleModelLoader', 'LTXVImgToVideoInplace', 'LTXVAddGuide', 'LTXVCropGuides', 'LTXVLatentUpsampler', 'LTXVDualCFGGuider', 'SamplerCustomAdvanced', 'LTXVAudioVAEDecode', 'CreateVideo', 'SaveVideo'], ['ltx-2x-community', 'apache-2.0']);
// LTX-2.5 Talking Photo (2026-10-26): Voice → Talking photo on the same local files; graph from Lightricks' LTX-2.5 A2V example (core audio-to-video path),
// speech prepared by audio/lipDriver.ts (QuokkaiLab recipe, sducly, MIT). Plan: comfy/ltx25Lipsync.ts.
local('comfy-ltx25-lipsync', 'LTX-2.5 Talking Photo', ['ltx25-a2v-api.json'], 'https://github.com/Lightricks/ComfyUI-LTXVideo/tree/master/example_workflows/2.5',
  ['UnetLoaderGGUF', 'CLIPLoader', 'VAELoader', 'LatentUpscaleModelLoader', 'LoadAudio', 'TrimAudioDuration', 'LTXVAudioVAEEncode', 'SolidMask', 'SetLatentNoiseMask', 'LTXVImgToVideoInplace', 'LTXVLatentUpsampler', 'LTXVDualCFGGuider', 'SamplerCustomAdvanced', 'CreateVideo', 'SaveVideo'], ['ltx-2x-community', 'apache-2.0']);
// LTX-2.5 Extend (2026-10-26): Extend from the source's last frames on the same local files and the same image to video graph; joined by our ffmpeg (comfy/ltx25Extend.ts).
local('comfy-ltx25-extend', 'LTX-2.5 22B', ['ltx25-ti2v-api.json'], 'https://docs.comfy.org/tutorials/video/ltx/ltx-2-5',
  ['UnetLoaderGGUF', 'CLIPLoader', 'VAELoader', 'LatentUpscaleModelLoader', 'LoadVideo', 'GetVideoComponents', 'LTXVImgToVideoInplace', 'LTXVLatentUpsampler', 'LTXVDualCFGGuider', 'SamplerCustomAdvanced', 'LTXVAudioVAEDecode', 'ColorTransfer', 'CreateVideo', 'SaveVideo'], ['ltx-2x-community', 'apache-2.0']);
local('comfy-wan22-5b', 'Wan 2.2 5B', ['wan22-ti2v-5b-api.json'], 'https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B',
  ['UNETLoader', 'CLIPLoader', 'VAELoader', 'ModelSamplingSD3', 'CLIPTextEncode', 'Wan22ImageToVideoLatent', 'KSampler', 'VAEDecode', 'CreateVideo', 'SaveVideo', 'LoadImage'], ['apache-2.0']);
registerProvider({ id: 'cloud-h3', name: 'MiniMax H3 · Comfy Cloud', kind: 'hosted', via: 'Comfy Cloud API nodes ComfyCloudMiniMaxH3TextToVideoNode / ComfyCloudMiniMaxH3ImageToVideoNode (hosted: hidden in open-weights-only mode), workflows/h3-cloud-{t2v,i2v}-api.json (mock placeholder, no network calls)', stages: hostedStages('Comfy Cloud'), run: hostedMock('Comfy Cloud'),
  workflows: ['h3-cloud-t2v-api.json', 'h3-cloud-i2v-api.json'], license: 'minimax-community', licenseUrl: 'https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE', docUrl: 'https://docs.comfy.org/tutorials/video/minimax/minimax-h3', nodes: ['ComfyCloudMiniMaxH3TextToVideoNode', 'ComfyCloudMiniMaxH3ImageToVideoNode'] });
// B1: MiniMax H3 as an ordinary Comfy Cloud workflow job: our own core-node graphs (workflows/cloud/h3-*-api.json, no API nodes) → open weights
// on Comfy's GPUs (comfyCloudOpen). BH9 (f): real Comfy Cloud v2 run via routing/cloudRun.ts (plain REST); price = placeholder until B6 (GPU-time pricing).
registerProvider({ id: 'cloud-h3-wf', name: 'MiniMax H3 · Comfy Cloud workflow', kind: 'hosted', via: 'Comfy Cloud workflow job (API v2): workflows/cloud/h3-{t2v,i2v}-api.json, core nodes only (real run with a Comfy Cloud key on the comfy backend, in filming mode or with ROUTING_LIVE=1; demo without a key)', stages: hostedStages('Comfy Cloud'), run: hostedMock('Comfy Cloud'),
  workflows: ['cloud/h3-t2v-api.json', 'cloud/h3-i2v-api.json'], license: 'minimax-community', licenseUrl: 'https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE', docUrl: 'https://huggingface.co/MiniMaxAI/MiniMax-H3' });
// Oct 27: MiniMax H3 Fast · Comfy Cloud: the official Comfy FastVideo FastH3 templates (text / image to video, 8 steps) as a Comfy Cloud job, comfy/h3FastCloud.ts
registerProvider({ id: 'cloud-h3-fast', name: 'MiniMax H3 Fast · Comfy Cloud', kind: 'hosted', via: 'Comfy Cloud workflow job (API v2): the official Comfy templates video_fastvideo_fasth3_t2v / video_fastvideo_fasth3_i2v as workflows/cloud/h3-fast-{t2v,i2v}-api.json (FastVideo FastH3 8-Step V2; a free check for the checkpoint before any upload)', stages: hostedStages('Comfy Cloud'), run: hostedMock('Comfy Cloud'),
  workflows: ['cloud/h3-fast-t2v-api.json', 'cloud/h3-fast-i2v-api.json'], license: 'minimax-community', licenseUrl: 'https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE', docUrl: 'https://docs.comfy.org/tutorials/video/minimax/minimax-h3-fastvideo' });
// Oct 27: MiniMax H3 Keyframes · Comfy Cloud: the official Comfy template video_minimax_h3_multiframe_reference (2–5 stills at chosen times → one shot), comfy/h3KeyframesCloud.ts
registerProvider({ id: 'cloud-h3-keyframes', name: 'MiniMax H3 Keyframes · Comfy Cloud', kind: 'hosted', via: 'Comfy Cloud workflow job (API v2): the official Comfy template video_minimax_h3_multiframe_reference as workflows/cloud/h3-multiframe-api.json (MiniMax H3 Ref2VA + Add Guide per frame, fp16 video VAE)', stages: hostedStages('Comfy Cloud'), run: hostedMock('Comfy Cloud'),
  workflows: ['cloud/h3-multiframe-api.json'], license: 'minimax-community', licenseUrl: 'https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE', docUrl: 'https://docs.comfy.org/tutorials/video/minimax/minimax-h3-multiframe' });
// B1 twin for Camera Moves: the LTX-2 camera-LoRA graph (workflows/cloud/camera-ltx-api.json, core nodes only, all 7 model files on the public Comfy Cloud list)
// as a Comfy Cloud workflow job → open weights on Comfy's GPUs (comfyCloudOpen). LTX camera presets only. Mock run until the runner lands (B2, Oct 23); placeholder price.
registerProvider({ id: 'cloud-ltx-camera', name: 'LTX-2 19B camera · Comfy Cloud workflow', kind: 'hosted', via: 'Comfy Cloud workflow job (API v2): workflows/cloud/camera-ltx{,-flf}-api.json, core nodes only (real run with a Comfy Cloud key on a live backend; B2 runner)', stages: hostedStages('Comfy Cloud'), run: hostedMock('Comfy Cloud'),
  workflows: ['cloud/camera-ltx-api.json'], license: 'ltx-2-community', licenseUrl: 'https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2', docUrl: 'https://huggingface.co/Lightricks/LTX-2' });
// Re-shoot twin (prep for the Oct 23 runner): our own reshoot-api.json graph (LTX-2 pose IC-LoRA + camera-control LoRA) as a Comfy Cloud workflow job,
// workflows/cloud/reshoot-cloud-api.json. All model files are on the public Comfy Cloud list and DWPreprocessor (comfyui_controlnet_aux) is on Cloud.
// Open weights on Comfy's GPUs (comfyCloudOpen) → visible in open-weights-only mode. Mock run until the runner lands; estimated placeholder price.
registerProvider({ id: 'cloud-reshoot', name: 'LTX-2 19B re-shoot · Comfy Cloud workflow', kind: 'hosted', via: 'Comfy Cloud workflow job (API v2): workflows/cloud/reshoot-cloud-api.json (real run with a Comfy Cloud key on a live backend; B2 runner)', stages: hostedStages('Comfy Cloud'), run: hostedMock('Comfy Cloud'),
  workflows: ['cloud/reshoot-cloud-api.json'], license: 'ltx-2-community', licenseUrl: 'https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2', docUrl: 'https://huggingface.co/Lightricks/LTX-2' });
// H3 runner Step 3 (Oct 26): Comfy's Reshoot recipe (MiniMax H3 + CrossView-Warp v1 LoRA + MoGe-2 depth warp) on the user's OWN Comfy API deployment
// (route comfy-deploy:cloud-h3-crossview, comfy/crossview.ts). Graph workflows/deploy/h3-crossview-api.json adapted from Comfy-Org/comfy-reshoot (MIT).
registerProvider({ id: 'cloud-h3-crossview', name: 'New angle · H3 CrossView · cloud', kind: 'hosted', via: 'Your Comfy deployment (Comfy API v2): workflows/deploy/h3-crossview-api.json: MiniMax H3 Ref2VA + CrossView-Warp v1 LoRA, MoGe-2 depth warp (CrossViewWarp nodes, comfyrob fork, Apache-2.0)', stages: hostedStages('Your Comfy deployment'), run: hostedMock('Your Comfy deployment'),
  workflows: ['deploy/h3-crossview-api.json'], license: 'minimax-community', licenseUrl: 'https://huggingface.co/Cseti/MiniMax-H3_Ref2VA-LoRA-CrossView-Warp_v1', docUrl: 'https://github.com/Comfy-Org/comfy-reshoot' });
// Oct 26: H3 Character Swap · Comfy Cloud: the H3 Character Swap recipe (MiniMax H3 Ref2VA + Akatz Character Swap LoRA v1.5), after Comfy's Openjutsu app (github.com/Comfy-Org/comfy-openjutsu, MIT) and Akatz Labs' H3 Character Swap workflow (github.com/akatz-labs/h3-character-swap-tool, MIT),
// as a shared Comfy Cloud workflow job with
// the LoRA the user imported into their Comfy Cloud model library (Creator plan). Shown as the Comfy Cloud route of the H3 Character Swap card (B6 twin).
registerProvider({ id: 'cloud-h3-charswap', name: 'H3 Character Swap · Comfy Cloud', kind: 'hosted', via: 'Comfy Cloud workflow job (API v2): workflows/cloud/h3-charswap-api.json, core nodes only, recipe after Comfy\'s Openjutsu app (github.com/Comfy-Org/comfy-openjutsu, MIT) and Akatz Labs\' H3 Character Swap workflow (MIT), Sharper (768p) or Faster and cheaper (480p): MiniMax H3 Ref2VA int8 + fl2v turbo 8-step (the 768p build when imported) + H3 Character Swap LoRA v1.5 (imported into your Comfy Cloud model library), SAM 3.1 edit mask on the video latent (Person swap)', stages: hostedStages('Comfy Cloud'), run: hostedMock('Comfy Cloud'),
  workflows: ['cloud/h3-charswap-api.json'], license: 'minimax-community-akatz-charswap', licenseUrl: 'https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA', docUrl: 'https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA' });
// Oct 27: LTX-2.5 22B · Comfy Cloud: the open LTX-2.5 22B on shared Comfy Cloud (official template files: int8 ConvRot transformer + Gemma 4), the Comfy Cloud
// place of the LTX-2.5 22B cards on Generate Video / Transitions (cloud-ltx25-video) and Extend (cloud-ltx25-extend, picture-and-sound continuation). comfy/ltx25Cloud.ts.
registerProvider({ id: 'cloud-ltx25-video', name: 'LTX-2.5 22B · Comfy Cloud', kind: 'hosted', via: 'Comfy Cloud workflow job (API v2): workflows/cloud/ltx25-{ti2v,flf}-api.json, core nodes only (official templates video_ltx2_5_i2v / video_ltx2_5_flf2v, int8 ConvRot files); DFR quality: cloud/ltx25-dfr-i2v-api.json (official template video_ltx2_5_dfr_i2v)', stages: hostedStages('Comfy Cloud'), run: hostedMock('Comfy Cloud'),
  workflows: ['cloud/ltx25-ti2v-api.json', 'cloud/ltx25-flf-api.json', 'cloud/ltx25-dfr-i2v-api.json'], license: 'ltx-2x-community', licenseUrl: 'https://huggingface.co/Lightricks/LTX-2.5', docUrl: 'https://docs.comfy.org/tutorials/video/ltx/ltx-2-5' });
registerProvider({ id: 'cloud-ltx25-extend', name: 'LTX-2.5 22B · Comfy Cloud', kind: 'hosted', via: 'Comfy Cloud workflow job (API v2): workflows/cloud/ltx25-continue-api.json (picture-and-sound continuation, LTX Desktop method in core nodes) or ltx25-ti2v-api.json (last-frames guide); joined by our ffmpeg', stages: hostedStages('Comfy Cloud'), run: hostedMock('Comfy Cloud'),
  workflows: ['cloud/ltx25-continue-api.json', 'cloud/ltx25-ti2v-api.json'], license: 'ltx-2x-community', licenseUrl: 'https://huggingface.co/Lightricks/LTX-2.5', docUrl: 'https://docs.comfy.org/tutorials/video/ltx/ltx-2-5' });
// Oct 27: Render · LTX-2.5 + Layout to Render · Comfy Cloud (Direct a Shot step 3): the Comfy Cloud place of the local Render route comfy-ltx25-layout,
// with the user's imported Layout to Render LoRA (comfy/ltx25LayoutCloud.ts).
registerProvider({ id: 'cloud-ltx25-layout', name: 'LTX-2.5 + Layout to Render · Comfy Cloud', kind: 'hosted', via: 'Comfy Cloud workflow job (API v2): workflows/cloud/ltx25-layout-to-render-api.json, core nodes only (official LTX-2.5 22B int8 ConvRot files) + Lightricks\' Layout to Render IC-LoRA imported into your Comfy Cloud model library', stages: hostedStages('Comfy Cloud'), run: hostedMock('Comfy Cloud'),
  workflows: ['cloud/ltx25-layout-to-render-api.json'], license: 'ltx-2x-community', licenseUrl: 'https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x', docUrl: 'https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render' });
// Oct 27: Footage Effects · Comfy Cloud: four official Comfy LTX-2.3 IC-LoRA templates (restore, remove an object, remove subtitles, extend the frame), comfy/ltx23VfxCloud.ts
registerProvider({ id: 'cloud-ltx23-vfx', name: 'LTX-2.3 22B + IC-LoRA · Comfy Cloud', kind: 'hosted', via: 'Comfy Cloud workflow job (API v2): the official Comfy templates template_ltx2_3_lora_restore_archival_footage, template_ltx2_3_obscura_remova_lora_remove_object_from_video, template_ltx2_3_lora_remove_subtitles_from_video and template_ltx2_3_lora_video_outpainting as workflows/cloud/ltx23-*-api.json (every LoRA in Comfy Cloud\'s shared library)', stages: hostedStages('Comfy Cloud'), run: hostedMock('Comfy Cloud'),
  workflows: ['cloud/ltx23-restore-footage-api.json', 'cloud/ltx23-remove-object-api.json', 'cloud/ltx23-remove-subtitles-api.json', 'cloud/ltx23-outpaint-api.json'], license: 'ltx-2x-community', licenseUrl: 'https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x', docUrl: 'https://docs.comfy.org/tutorials/video/ltx/ltx-2-3' });
// Oct 27: H3 Extend · Comfy Cloud: the Comfy Cloud twin of the local H3 Extend graph (open MiniMax H3, the last 22 frames of picture and sound as context,
// joined by the shared Extend join). The Comfy Cloud place of the H3 Extend card (routing/routes.ts TWINS); comfy/h3ExtendCloud.ts.
registerProvider({ id: 'cloud-h3-extend', name: 'H3 Extend · Comfy Cloud', kind: 'hosted', via: 'Comfy Cloud workflow job (API v2): workflows/cloud/h3-extend-api.json, core nodes only: MiniMax H3 fl2va int8 (Ref2VA with a character photo) + fl2v turbo 8-step, the last 22 frames of picture and sound anchored at frame 0 (MiniMaxH3AddGuide); joined by our ffmpeg', stages: hostedStages('Comfy Cloud'), run: hostedMock('Comfy Cloud'),
  workflows: ['cloud/h3-extend-api.json'], license: 'minimax-community', licenseUrl: 'https://huggingface.co/Comfy-Org/MiniMax-H3', docUrl: 'https://docs.comfy.org/tutorials/video/minimax/minimax-h3' });
// Oct 27: InfiniteTalk (Wan 2.1) · Comfy Cloud: Lip Sync's long talking video (a photo + up to 60 s of speech), the official template
// video_wan2_1_infinitetalk flattened into core nodes and repeated per 3.24 s window (comfy/infiniteTalkCloud.ts). Open weights on Comfy's GPUs (comfyCloudOpen).
registerProvider({ id: 'cloud-infinitetalk', name: 'InfiniteTalk (Wan 2.1) · Comfy Cloud', kind: 'hosted', via: 'Comfy Cloud workflow job (API v2): workflows/cloud/wan21-infinitetalk-api.json, core nodes only (official template video_wan2_1_infinitetalk: Wan 2.1 I2V 14B 480p fp8 + lightx2v 480p LoRA + InfiniteTalk single-speaker patch + wav2vec2), one 81-frame window per 3.24 s of speech', stages: hostedStages('Comfy Cloud'), run: hostedMock('Comfy Cloud'),
  workflows: ['cloud/wan21-infinitetalk-api.json'], license: 'apache-2.0', licenseUrl: 'https://github.com/MeiGen-AI/InfiniteTalk/blob/main/LICENSE.txt', docUrl: 'https://docs.comfy.org/tutorials/video/wan/wan-infinitetalk' });
registerProvider({ id: 'api-minimax-h3', name: 'MiniMax H3 · partner API', kind: 'hosted', via: 'Comfy Router / partner node MinimaxHailuo03*Node (mock only)', stages: hostedStages('MiniMax'), run: hostedMock('MiniMax'),
  licenseUrl: 'https://www.minimax.io/platform/protocol/terms-of-service', docUrl: 'https://docs.comfy.org/built-in-nodes/MinimaxHailuo03TextToVideoNode', nodes: ['MinimaxHailuo03TextToVideoNode', 'MinimaxHailuo03FirstLastFrameNode', 'MinimaxHailuo03ReferenceNode'] });
local('comfy-zimage-turbo', 'Z-Image-Turbo', ['create-image-zimage-turbo-api.json'], 'https://huggingface.co/Tongyi-MAI/Z-Image-Turbo');
local('comfy-zimage', 'Z-Image (base)', ['create-image-zimage-api.json'], 'https://huggingface.co/Tongyi-MAI/Z-Image');
local('comfy-klein4b', 'FLUX.2 [klein] 4B', ['create-image-klein4b-t2i-api.json', 'create-image-klein4b-edit-api.json'], 'https://huggingface.co/black-forest-labs/FLUX.2-klein-4B');
local('comfy-flux3-klein', 'FLUX 3 Image Klein', ['create-image-flux3klein-t2i-api.json', 'create-image-flux3klein-edit-api.json', 'create-image-flux3klein-inpaint-api.json', 'create-image-flux3klein-multiref-api.json'], 'https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy');
// MOSS-Image (OpenMOSS, Apache-2.0): 5B text-rendering DiT, core ComfyUI support from 0.41.3 (PR #17095; CLIPLoader type 'moss_image', FLUX.2 small VAE).
// MOSS-Image = tuned release (templates image_moss_image_t2i); MOSS-Image Base = base release for side-by-side comparison (image_moss_image_base_t2i, SLG layer 22). No training here.
// Not on Comfy Cloud yet ("Cloud will update after ComfyUI stable release", docs.comfy.org 2026-10-18), so local only, 0 credits.
local('comfy-moss-image', 'MOSS-Image', ['create-image-moss-image-api.json'], 'https://huggingface.co/OpenMOSS-Team/MOSS-Image-SFT', ['UNETLoader', 'CLIPLoader', 'EmptyFlux2LatentImage'], undefined, { minComfyVersion: '0.41.3' });
local('comfy-moss-image-base', 'MOSS-Image Base', ['create-image-moss-image-base-api.json'], 'https://huggingface.co/OpenMOSS-Team/MOSS-Image-Base', ['UNETLoader', 'CLIPLoader', 'EmptyFlux2LatentImage', 'SkipLayerGuidanceDiTSimple'], undefined, { minComfyVersion: '0.41.3' });
local('comfy-flux2dev', 'FLUX.2 [dev]', ['create-image-flux2dev-api.json'], 'https://huggingface.co/black-forest-labs/FLUX.2-dev');
/** Direct vendor APIs (no Comfy node or Router id). Key from apiKeyEnv; engines in routing/directRoutes.ts NATIVE_DIRECT run live, the rest are mock only. */
const direct = (id: string, name: string, apiKeyEnv: string, endpoint: string, docUrl: string, licenseUrl: string) =>
  registerProvider({ id, name, kind: 'hosted-direct', via: `direct vendor API ${endpoint} (key in ${apiKeyEnv})`, stages: hostedStages(name), run: hostedMock(name), apiKeyEnv, docUrl, licenseUrl });
direct('direct-minimax-speech', 'MiniMax Speech 2.8 HD (direct API)', 'OPENHIGGSFIELD_MINIMAX_API_KEY', 'POST https://api.minimax.io/v1/t2a_v2 (model speech-2.8-hd, Bearer)', 'https://platform.minimax.io/docs/api-reference/speech-t2a-http', 'https://www.minimax.io/platform/protocol/terms-of-service');
// direct-qwen3-tts (Alibaba Model Studio, paid, never priced) retired 2026-10-27: Qwen3 TTS runs locally from its open weights (comfy-qwen3tts below; shared/lifecycle.ts RETIRED_MODELS).
direct('direct-flux2-flex', 'FLUX.2 [flex] (BFL direct API)', 'OPENHIGGSFIELD_BFL_API_KEY', 'POST https://api.bfl.ai/v1/flux-2-flex (x-key; live with a key: routing/directRoutes.ts)', 'https://docs.bfl.ml/api-reference/models/generate-or-edit-an-image-with-flux2-[flex]', 'https://bfl.ai/legal/terms-of-service');
// Official lab APIs, batch 1 (2026-10-23): live with the lab's key on a live backend (routing/directRoutes.ts + providers/direct.ts); the mock backend renders a sample.
direct('direct-minimax-speech-turbo', 'MiniMax Speech 2.8 Turbo (direct API)', 'OPENHIGGSFIELD_MINIMAX_API_KEY', 'POST https://api.minimax.io/v1/t2a_v2 (model speech-2.8-turbo, Bearer)', 'https://platform.minimax.io/docs/api-reference/speech-t2a-http', 'https://www.minimax.io/platform/protocol/terms-of-service');
direct('direct-minimax-image', 'MiniMax image-01 (direct API)', 'OPENHIGGSFIELD_MINIMAX_API_KEY', 'POST https://api.minimax.io/v1/image_generation (model image-01, Bearer)', 'https://platform.minimax.io/docs/api-reference/image-generation-t2i', 'https://www.minimax.io/platform/protocol/terms-of-service');
direct('direct-ltx-25-pro', 'LTX-2.5 Pro (LTX API)', 'OPENHIGGSFIELD_LTX_API_KEY', 'POST https://api.ltx.io/v2/text-to-video | image-to-video (model ltx-2-5-pro, Bearer)', 'https://docs.ltx.io/models/ltx-2-5', 'https://docs.ltx.io/');
direct('direct-ltx-25-fast', 'LTX-2.5 Fast (LTX API)', 'OPENHIGGSFIELD_LTX_API_KEY', 'POST https://api.ltx.io/v2/text-to-video | image-to-video (model ltx-2-5-fast, Bearer)', 'https://docs.ltx.io/models/ltx-2-5', 'https://docs.ltx.io/');
direct('direct-ltx-23-fast', 'LTX-2.3 Fast (LTX API)', 'OPENHIGGSFIELD_LTX_API_KEY', 'POST https://api.ltx.io/v2/text-to-video | image-to-video (model ltx-2-3-fast, Bearer)', 'https://docs.ltx.io/models/ltx-2-3', 'https://docs.ltx.io/');
direct('direct-flux3-video', 'FLUX 3 Video (BFL direct API)', 'OPENHIGGSFIELD_BFL_API_KEY', 'POST https://api.bfl.ai/v1/flux-3-video (x-key)', 'https://docs.bfl.ml/flux_3/flux3_video', 'https://bfl.ai/legal/terms-of-service');
direct('direct-flux2-klein-9b', 'FLUX.2 [klein] 9B (BFL direct API)', 'OPENHIGGSFIELD_BFL_API_KEY', 'POST https://api.bfl.ai/v1/flux-2-klein-9b (x-key)', 'https://docs.bfl.ml/api-reference/models/generate-or-edit-an-image-with-flux2-[klein]-9b', 'https://bfl.ai/legal/terms-of-service');
// Official lab APIs, batch 2 (2026-10-23): Google Gemini API (Nano Banana 2 Lite) and BytePlus ModelArk (Seedance 2.0 Fast / Mini, 2.5).
direct('direct-gemini-nb2-lite', 'Nano Banana 2 Lite (Gemini API)', 'OPENHIGGSFIELD_GEMINI_API_KEY', 'POST https://generativelanguage.googleapis.com/v1beta/interactions (model gemini-3.1-flash-lite-image, x-goog-api-key)', 'https://ai.google.dev/gemini-api/docs/image-generation', 'https://ai.google.dev/gemini-api/terms');
direct('direct-seedance-20-fast', 'Seedance 2.0 Fast (BytePlus ModelArk)', 'OPENHIGGSFIELD_ARK_API_KEY', 'POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks (model dreamina-seedance-2-0-fast-260128, Bearer)', 'https://docs.byteplus.com/en/docs/ModelArk/1520757', 'https://docs.byteplus.com/en/docs/legal/docs-terms-of-service');
direct('direct-seedance-20-mini', 'Seedance 2.0 Mini (BytePlus ModelArk)', 'OPENHIGGSFIELD_ARK_API_KEY', 'POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks (model dreamina-seedance-2-0-mini-260615, Bearer)', 'https://docs.byteplus.com/en/docs/ModelArk/1520757', 'https://docs.byteplus.com/en/docs/legal/docs-terms-of-service');
direct('direct-seedance-25', 'Seedance 2.5 (BytePlus ModelArk)', 'OPENHIGGSFIELD_ARK_API_KEY', 'POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks (model dreamina-seedance-2-5-260628, Bearer)', 'https://docs.byteplus.com/en/docs/ModelArk/1520757', 'https://docs.byteplus.com/en/docs/legal/docs-terms-of-service');
// Upscale: FLUX 3 Upscaler = BFL FLUX Video Upscale (approved 2026-10-17). Live on the BFL direct route (routing/routes.ts + providers/bfl.ts); fal/Replicate stay coming-soon stubs.
registerProvider({ id: 'direct-flux3-upscale', name: 'FLUX Video Upscale', kind: 'hosted-direct', via: 'BFL direct API POST https://api.bfl.ai/v1/flux-tools/video-upscale-v1 (key in OPENHIGGSFIELD_BFL_API_KEY; mock backend renders a sample)', stages: hostedStages('BFL'), run: hostedMock('BFL'),
  apiKeyEnv: 'OPENHIGGSFIELD_BFL_API_KEY', docUrl: 'https://docs.bfl.ai/flux_tools/flux_video_upscale', licenseUrl: 'https://bfl.ai/legal/terms-of-service' });
// Audio (open weights). MMAudio / F5-TTS / Chatterbox need custom node packs (not on the validator).
local('comfy-acestep', 'ACE-Step 1.5 (MIT)', ['audio-music-api.json', 'soundtrack-music-api.json'], 'https://huggingface.co/ACE-Step/Ace-Step1.5');
// Local music (2026-10-23, core ComfyUI nodes): YuE2 songs from lyrics + style (official template audio_yue2_text2music) and covers of a song
// (audio_yue2_music_cover: SheetSage2 transcribes the melody); MiniMax Music 3 open weights (audio_minimax_music_3). Free, locally.
local('comfy-yue2', 'YuE2', ['audio-yue2-song-api.json', 'audio-yue2-cover-api.json'], 'https://huggingface.co/Comfy-Org/YuE2',
  ['CheckpointLoaderSimple', 'YuE2GenerateABC', 'YuE2GenerateMusic', 'EmptyYuE2LatentAudio', 'SheetSage2AudioToABC', 'AudioEncoderLoader', 'SaveAudioAdvanced'], ['yue2-weights']);
local('comfy-minimax-music3', 'MiniMax Music 3 (open weights)', ['audio-minimax-music3-local-api.json'], 'https://huggingface.co/MiniMaxAI/MiniMax-Music3',
  ['UNETLoader', 'CLIPLoader', 'VAELoader', 'MiniMaxMusic3TextEncode', 'EmptyMiniMaxMusic3LatentAudio', 'SaveAudioAdvanced'], ['minimax-music3-community']);
local('comfy-stable-audio', 'Stable Audio Open 1.0', ['audio-sfx-api.json', 'soundtrack-sfx-api.json'], 'https://huggingface.co/stabilityai/stable-audio-open-1.0');
local('comfy-mmaudio', 'MMAudio (video-to-sound)', ['soundtrack-mmaudio-api.json'], 'https://github.com/kijai/ComfyUI-MMAudio', ['MMAudioModelLoader', 'MMAudioFeatureUtilsLoader', 'MMAudioSampler'], ['mit', 'mmaudio-weights']);
local('comfy-chatterbox', 'Chatterbox TTS', ['voice-chatterbox-tts-api.json'], 'https://github.com/wildminder/ComfyUI-Chatterbox', ['ChatterboxTTS'], ['chatterbox']);
local('comfy-drama3', 'Fish Audio Drama 3', ['voice-drama3-tts-api.json', 'voice-drama3-clone-api.json'], 'https://huggingface.co/fishaudio/drama-3', ['Drama3Loader', 'Drama3CodecLoader', 'Drama3EncodeVoice', 'Drama3Generate', 'Drama3Decode', 'Qwen3ASRLoader', 'Qwen3ASRTranscribe'], ['fish-community']);
local('comfy-f5tts', 'F5-TTS', ['voice-f5tts-api.json'], 'https://github.com/niknah/ComfyUI-F5-TTS', ['F5TTSAudioInputs'], ['mit', 'f5-tts-weights']);
// Qwen3 TTS 1.7B CustomVoice (2026-10-27): open weights (Apache-2.0, Alibaba Qwen) via flybirdxx/ComfyUI-Qwen-TTS @374c2e0 (Apache-2.0); 9 preset voices, 10 languages,
// a style instruction. Free on your own ComfyUI. Runnable only when the node (FB_Qwen3TTSCustomVoice) and the model files are there (comfyNodes.ts, requirements.ts).
local('comfy-qwen3tts', 'Qwen3 TTS 1.7B', ['voice-qwen3tts-api.json'], 'https://github.com/flybirdxx/ComfyUI-Qwen-TTS', ['FB_Qwen3TTSCustomVoice'], ['apache-2.0']);
// Audio (hosted partner nodes)
hosted('api-eleven-tts', 'ElevenLabs TTS', 'ElevenLabsTextToSpeech', 'https://elevenlabs.io/terms-of-use');
// ElevenLabs v3 / v4 Turbo (2026-10-25): the same partner node with model eleven_v3 / eleven_v4_turbo; run on Comfy Router (routing/routerModels.ts elevenTts).
hosted('api-eleven-v3', 'ElevenLabs v3 TTS', 'ElevenLabsTextToSpeech', 'https://elevenlabs.io/terms-of-use');
hosted('api-eleven-v4-turbo', 'ElevenLabs v4 Turbo TTS', 'ElevenLabsTextToSpeech', 'https://elevenlabs.io/terms-of-use');
hosted('api-eleven-sfx', 'ElevenLabs Sound Effects', 'ElevenLabsTextToSoundEffects', 'https://elevenlabs.io/terms-of-use');
hosted('api-fish-tts', 'Fish Audio TTS', 'FishAudioTextToSpeech', 'https://fish.audio/terms');
hosted('api-heygen-tts', 'HeyGen TTS', 'HeyGenTextToSpeechNode', 'https://www.heygen.com/terms');
hosted('api-sonilo-music', 'Sonilo Music', 'SoniloTextToMusic', 'https://sonilo.ai/terms');
hosted('api-sonilo-v2m', 'Sonilo Video-to-Music', 'SoniloVideoToMusic', 'https://sonilo.ai/terms');
hosted('api-seed-audio', 'ByteDance Seed Audio', 'ByteDanceSeedAudio', 'https://www.byteplus.com/en/legal/terms-of-service');
// MiniMax Music 3 · Comfy Cloud (2026-10-27): the official template audio_minimax_music_3 (our local graph, byte for byte: every class and model file is
// on Comfy Cloud's object_info of 2026-10-26) as an ordinary Comfy Cloud workflow job, the twin of the local comfy-minimax-music3 (routing/routes.ts TWINS,
// comfy/cloudWorkflows.ts). Open weights on Comfy's GPUs (comfyCloudOpen), billed per GPU-second, so real runs wait for one measured run (hostedPrices.ts).
// It used to name the ComfyCloudMiniMaxMusic3TextToAudioNode node (mock only): that node runs the same model from a LOCAL ComfyUI, so it is not our path.
registerProvider({ id: 'cloud-minimax-music', name: 'MiniMax Music 3 · Comfy Cloud workflow', kind: 'hosted', via: 'Comfy Cloud workflow job (API v2): workflows/cloud/audio-minimax-music3-api.json (official template audio_minimax_music_3, core nodes only; real run with a Comfy Cloud key)', stages: hostedStages('Comfy Cloud'), run: hostedMock('Comfy Cloud'),
  workflows: ['cloud/audio-minimax-music3-api.json'], license: 'minimax-music3-community', licenseUrl: 'https://huggingface.co/MiniMaxAI/MiniMax-Music3/blob/main/LICENSE', docUrl: 'https://docs.comfy.org/tutorials/audio/minimax/minimax-music-3' });
