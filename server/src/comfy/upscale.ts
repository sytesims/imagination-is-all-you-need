import { VUP_MODELS, VUP_TARGET_SHORT, VUP_DEFAULT_TARGET, vupTarget } from '../shared/videoUpscale.js';
/** Upscale mode → workflow (OPENHIGGSFIELD_BACKEND=comfy only). RIFE multiplier picked so the result lands near 60 fps.
 *  Legacy: the numz SeedVR2 graphs (custom node SeedVR2LoadDiTModel, fp8 on cuda:0) only old comfy-open jobs still name. New jobs run the
 *  engines in shared/videoUpscale.ts through vupGraph below. */
export const UPSCALE_WORKFLOWS: Record<string, string> = { precise: 'upscale-api.json', creative: 'upscale-creative-api.json', smooth60: 'upscale-60fps-api.json' };
export function patchUpscale60(graph: Record<string, any>, srcFps: number) {
  const g = structuredClone(graph); const mult = Math.max(2, Math.ceil(60 / (srcFps || 30) - 1e-6));
  g['400'].inputs.multiplier = mult; g['16'].inputs.fps = Math.min(120, (srcFps || 30) * mult);
  return g;
}
/** The short side this job's output gets (the job's outputSize, else its target). */
export const vupShortSide = (i: { outputSize?: { width: number; height: number } | null; maxOutput?: string | null }) =>
  i.outputSize?.width && i.outputSize?.height ? Math.min(i.outputSize.width, i.outputSize.height) : VUP_TARGET_SHORT[vupTarget(i.maxOutput) ?? VUP_DEFAULT_TARGET];
/** Local video upscale graphs (shared/videoUpscale.ts):
 *  - Real-ESRGAN x2 / 4x-UltraSharp: workflows/upscale-esrgan-api.json, the model file swapped in node 15:2, the frames resized (lanczos) so the
 *    short side is the target (15:5), source frame rate kept (CreateVideo fps from GetVideoComponents); audio muxed back by the plan.
 *  - SeedVR2 3B (CUDA only): workflows/upscale-seedvr2-native-api.json (core SeedVR2 nodes), frames resized to the target first (15:5), one step.
 *  Node 18 = LoadVideo (file), node 17 = SaveVideo (the output). */
export function vupGraph(provider: string, graph: Record<string, any>, o: { file: unknown; short: number; seed?: number }) {
  const g = structuredClone(graph); const m = VUP_MODELS[provider];
  g['18'].inputs.file = o.file; g['15:5'].inputs['resize_type.shorter_size'] = o.short;
  if (m?.file && g['15:2']?.class_type === 'UpscaleModelLoader') g['15:2'].inputs.model_name = m.file;
  if (g['15:4']?.class_type === 'KSampler' && o.seed != null) g['15:4'].inputs.seed = o.seed;
  return g;
}
