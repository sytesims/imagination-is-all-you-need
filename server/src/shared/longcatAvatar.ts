/**
 * Talking Video, Phase B (2026-10-27): LongCat-Video-Avatar 1.5 (Meituan, MIT) as a second talking-video model. OFF by default
 * (OPENHIGGSFIELD_LONGCAT=1 shows what it needs; nothing runs yet). Pure (no node:*): the free check, the window maths and the Build list.
 *
 * Where it can run (checked 2026-10-27 against our full Comfy Cloud object_info copy of 2026-10-26, 3,835 node classes):
 *  - Shared Comfy Cloud: NO. Its WanVideoWrapper build has the v1.0 LongCat nodes (WanVideoLongCatAvatarExtendEmbeds without prev_images / vae,
 *    MultiTalkWav2VecEmbeds) but not the v1.5 audio node LongCatAvatarWhisperEmbeds, and no LongCat-Avatar weights. A model import alone can't add a
 *    node, so 1.5 needs a Comfy deployment (like H3 CrossView): ComfyUI-WanVideoWrapper at 088128b224 or later plus the files below.
 *    (LongCat-Avatar v1.0 could run on shared Cloud after a one-time import of its two files; not wired, 1.5 is the one worth having.)
 *  - This computer: NVIDIA only (CUDA), 24 GB VRAM and 64 GB RAM or more; not on a Mac.
 * The graph is not built: it needs the v1.5 node's inputs from a real object_info (a deployment's), so it can be checked before it is used.
 * probeLongCatCloud reads an object_info (free) and says what is missing; the engine choice shows LongCat only when it says ok.
 */
export const LONGCAT_PROVIDER = 'deploy-longcat-avatar';
export const LONGCAT_NAME = 'LongCat-Video-Avatar 1.5';
/** Feature flag: off unless OPENHIGGSFIELD_LONGCAT=1 (read by the server; the web only sees what the server lists). */
export const longcatFlagOn = (env: Record<string, string | undefined>) => /^(1|true|on|yes)$/i.test(String(env.OPENHIGGSFIELD_LONGCAT ?? ''));
export const LONGCAT_FPS = 25; export const LONGCAT_WINDOW = 93; export const LONGCAT_OVERLAP = 13; export const LONGCAT_STEP = LONGCAT_WINDOW - LONGCAT_OVERLAP; // 80 new frames (3.2 s) per extend
export const LONGCAT_SIZES = { '16:9': { width: 832, height: 480 }, '9:16': { width: 480, height: 832 }, '1:1': { width: 640, height: 640 } } as const;
/** Windows for a speech length: frames = ceil(s × 25); 93 frames, then 80 new frames per extend. */
export function longcatWindows(speechSeconds: number): { frames: number; windows: number } {
  const frames = Math.max(1, Math.ceil(Math.round(Math.max(0, speechSeconds) * 100) / 100 * LONGCAT_FPS - 1e-6));
  return { frames, windows: 1 + Math.ceil(Math.max(0, frames - LONGCAT_WINDOW) / LONGCAT_STEP) };
}
/** The node classes the graph needs that core ComfyUI doesn't have, and the main model file (only reaches Comfy through a deployment / import). */
export const LONGCAT_NODES = ['LongCatAvatarWhisperEmbeds', 'WanVideoLongCatAvatarExtendEmbeds', 'WhisperModelLoader', 'WanVideoModelLoader', 'WanVideoSamplerv2'] as const;
export const LONGCAT_MODEL = 'LongCat/LongCat-Avatar-15_bf16.safetensors';
const optionsOf = (spec: any): string[] => (Array.isArray(spec?.[0]) ? spec[0] : Array.isArray(spec?.[1]?.options) ? spec[1].options : []).map(String);
/** Free check on an object_info: ok only with both v1.5 LongCat nodes and the bf16 model in the wrapper's model loader. */
export function probeLongCatCloud(objectInfo: Record<string, any> | null | undefined): { ok: boolean; missing: string[] } {
  const oi = objectInfo ?? {}; const missing: string[] = LONGCAT_NODES.filter((n) => !oi[n]).map((n) => `node ${n}`);
  const files = optionsOf(oi.WanVideoModelLoader?.input?.required?.model);
  if (!files.some((f) => f.replace(/\\/g, '/') === LONGCAT_MODEL || f.endsWith('LongCat-Avatar-15_bf16.safetensors'))) missing.push(`model ${LONGCAT_MODEL}`);
  return { ok: missing.length === 0, missing };
}
/** Price guess (not measured): about 30 GPU-seconds per output second on Comfy GPUs. */
export const LONGCAT_GPU_SECONDS_PER_SECOND = 30;
export const LONGCAT_REQUIREMENTS = 'Needs an NVIDIA graphics card with 24 GB or more of VRAM and 64 GB or more of RAM (measured on a 4090: about 10 minutes per 5 s at 480p).';
/** What a deployment's Build needs (docs/COMFY-CLOUD-SETUP.md lists the same). */
export const LONGCAT_BUILD = {
  nodePacks: [{ name: 'ComfyUI-WanVideoWrapper (kijai)', repo: 'https://github.com/kijai/ComfyUI-WanVideoWrapper', commit: '088128b224', license: 'Apache-2.0', classes: [...LONGCAT_NODES] }],
  models: [
    { file: 'LongCat-Avatar-15_bf16.safetensors', folder: 'diffusion_models/LongCat', gb: 31.71, url: 'https://huggingface.co/Kijai/WanVideo_comfy/blob/main/LongCat/LongCat-Avatar-15_bf16.safetensors', license: 'MIT' },
    { file: 'LongCat-Avatar-15_dmd_distill_lora_rank128_bf16.safetensors', folder: 'loras', gb: 1.26, url: 'https://huggingface.co/Kijai/WanVideo_comfy/blob/main/LongCat/LongCat-Avatar-15_dmd_distill_lora_rank128_bf16.safetensors', license: 'MIT' },
    { file: 'whisper_large_v3_fp16.safetensors', folder: 'audio_encoders', gb: 1.3, url: 'https://huggingface.co/openai/whisper-large-v3', license: 'Apache-2.0', note: 'already on shared Comfy Cloud' },
    { file: 'Wan2_1_VAE_bf16.safetensors', folder: 'vae', gb: 0.25, url: 'https://huggingface.co/Kijai/WanVideo_comfy/blob/main/Wan2_1_VAE_bf16.safetensors', license: 'Apache-2.0' },
    { file: 'umt5-xxl-enc-bf16.safetensors', folder: 'text_encoders', gb: 11, url: 'https://huggingface.co/Kijai/WanVideo_comfy/blob/main/umt5-xxl-enc-bf16.safetensors', license: 'Apache-2.0' },
  ],
  source: { code: 'https://github.com/meituan-longcat/LongCat-Video', weights: 'https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5', license: 'MIT' },
};
