/**
 * H3 runner Step 3 (Oct 26): "New angle · H3 CrossView · cloud" on the user's own Comfy API deployment (comfy/deploy.ts), a standalone entry in
 * comfy/cloudWorkflows.ts. Graph: workflows/deploy/h3-crossview-api.json, our API graph of Comfy's Reshoot recipe, adapted from the MIT graph in
 * Comfy-Org/comfy-reshoot (workflows/generate.api.json; credit in docs/CONFIGURATION.md and workflows/LICENSES.md):
 *   LoadVideo → CrossViewPrepareClip (24 fps, 17k+5 frames, 0.4 / 1.0 MP, source shape) → MoGe-2 depth → CrossViewWarp (az / el / distance)
 *   MiniMax H3 Ref2VA int8 → 8-step turbo LoRA → sigma shift 12/3 → attention → CrossView-Warp v1 LoRA 0.8; the take as reference video, prompt
 *   "crossview." (+ what the new view reveals), the warp as guide from frame 0; res_multistep, simple, 8 steps, cfg 1.
 *   Outputs: the new angle with the take's own sound (default) or with H3's generated sound, plus the warp guide.
 * Node packs: CrossViewPrepareClip + CrossViewWarp from comfyrob/ComfyUI-CrossViewWarp @ fbb1e93 (Apache-2.0; installed from source in the Build,
 * never copied here). Everything else is core ComfyUI (v0.37.0 or later: MoGe + MiniMax H3 nodes).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORKFLOWS_DIR } from '../config.js';
import { pruneUnreachable, setIn, type Plan } from './plans.js';
import { lastProbeState } from './deployProbeState.js';
import { CROSSVIEW_AZ, CROSSVIEW_DIST, CROSSVIEW_EL, CROSSVIEW_PROVIDER, CROSSVIEW_SECONDS, CROSSVIEW_SIZES, type CrossViewSize } from '../shared/crossview.js';

export const CROSSVIEW_GRAPH = 'deploy/h3-crossview-api.json';
export const CROSSVIEW_NODES = { video: '1', prep: '2', warp: '5', cond: '20', seed: '30', outOriginal: '41', outGenerated: '43', outWarp: '45' } as const;
const load = () => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, CROSSVIEW_GRAPH), 'utf8')) as Record<string, any>;

/** What the deployment's Build must hold (the probe checks these against object_info; docs list repos, commits, links and sizes). */
export const CROSSVIEW_REQUIRES = {
  nodes: [...new Set(Object.values<any>(load()).map((n) => String(n.class_type)))].sort(),
  models: [
    { loader: 'UNETLoader', field: 'unet_name', file: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors' },
    { loader: 'LoraLoaderModelOnly', field: 'lora_name', file: 'minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors' },
    { loader: 'LoraLoaderModelOnly', field: 'lora_name', file: 'MiniMax-H3_Ref2VA-LoRA-CrossView-Warp_v1_3500.safetensors' },
    { loader: 'CLIPLoader', field: 'clip_name', file: 'qwen3vl_32b_minimax_h3_int8_convrot.safetensors' },
    { loader: 'VAELoader', field: 'vae_name', file: 'minimax_h3_video_vae_int8_convrot.safetensors' },
    { loader: 'VAELoader', field: 'vae_name', file: 'minimax_h3_audio_vae_fp32.safetensors' },
    { loader: 'LoadMoGeModel', field: 'model_name', file: 'moge_2_vitl_normal_fp16.safetensors' },
  ],
};
/** The Build contents for docs and the Settings card: node packs (repo + commit) and model files (Hugging Face link + size). */
export const CROSSVIEW_BUILD = {
  comfyui: { version: 'v0.37.0 or later', commit: '2255709aa0', note: 'has the MiniMax H3 and MoGe core nodes' },
  nodePacks: [{ name: 'ComfyUI-CrossViewWarp (comfyrob fork)', repo: 'https://github.com/comfyrob/ComfyUI-CrossViewWarp', commit: 'fbb1e93c7193329ff3ce7c17f95166b539687876', license: 'Apache-2.0',
    classes: ['CrossViewPrepareClip', 'CrossViewWarp'], upstream: 'https://github.com/cseti007/ComfyUI-CrossViewWarp' }],
  models: [
    { file: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', folder: 'diffusion_models', bytes: 20_970_379_616, url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/blob/main/diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors', license: 'MiniMax H3 Community License' },
    { file: 'qwen3vl_32b_minimax_h3_int8_convrot.safetensors', folder: 'text_encoders', bytes: 27_141_342_152, url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/blob/main/text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors', license: 'MiniMax H3 Community License' },
    { file: 'minimax_h3_video_vae_int8_convrot.safetensors', folder: 'vae', bytes: 2_811_065_184, url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/blob/main/vae/minimax_h3_video_vae_int8_convrot.safetensors', license: 'MiniMax H3 Community License' },
    { file: 'minimax_h3_audio_vae_fp32.safetensors', folder: 'vae', bytes: 605_254_808, url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/blob/main/vae/minimax_h3_audio_vae_fp32.safetensors', license: 'MiniMax H3 Community License' },
    { file: 'minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors', folder: 'loras', bytes: 1_956_193_000, url: 'https://huggingface.co/lightx2v/Minimax-h3-Turbo/blob/main/minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors', license: 'no licence tag on the card (repository licence applies)' },
    { file: 'MiniMax-H3_Ref2VA-LoRA-CrossView-Warp_v1_3500.safetensors', folder: 'loras', bytes: 596_452_584, url: 'https://huggingface.co/Cseti/MiniMax-H3_Ref2VA-LoRA-CrossView-Warp_v1/blob/main/MiniMax-H3_Ref2VA-LoRA-CrossView-Warp_v1_3500.safetensors', license: 'MiniMax H3 Community License' },
    { file: 'moge_2_vitl_normal_fp16.safetensors', folder: 'geometry_estimation', bytes: 661_859_924, url: 'https://huggingface.co/Comfy-Org/MoGe/blob/main/geometry_estimation/moge_2_vitl_normal_fp16.safetensors', license: 'MIT' },
  ],
};
export const CROSSVIEW_BUILD_GB = Math.round(CROSSVIEW_BUILD.models.reduce((a, m) => a + m.bytes, 0) / 1e8) / 10;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Plan for one CrossView run (one job on the deployment). Refuses before anything is uploaded when the last free check found missing parts. */
export function crossviewPlan(j: { id: string; toolId: string; provider: string; input: Record<string, any>; reasonCode?: string }): Plan {
  const i = j.input; const cv = i.crossview;
  if (!i.videoPath || !cv) throw new Error('H3 CrossView needs a take and a camera angle');
  const pr = lastProbeState(); const rec = pr?.nodes.checked ? pr.recipes.find((r) => r.id === CROSSVIEW_PROVIDER) : null;
  if (rec && rec.ready === false) throw Object.assign(new Error(`Your Comfy deployment is missing what H3 CrossView needs: ${[...rec.missingNodes, ...rec.missingModels].join(', ')}. Add them to its Build (Settings → Connections lists them), then check again`),
    { reasonCode: 'deploy_incomplete', errorType: 'validation' });
  const size: CrossViewSize = i.crossviewSize === '768p' ? '768p' : '480p';
  const g = load();
  setIn(g, CROSSVIEW_NODES.video, 'file', { __file: i.videoPath });
  const secs = clamp(Number(i.duration) || CROSSVIEW_SECONDS.min, CROSSVIEW_SECONDS.min, CROSSVIEW_SECONDS.max);
  Object.assign(g[CROSSVIEW_NODES.prep].inputs, { duration: Math.round(secs * 10) / 10, aspect_ratio: 'source', megapixels: CROSSVIEW_SIZES[size] });
  Object.assign(g[CROSSVIEW_NODES.warp].inputs, { azimuth: clamp(Number(cv.azimuth), CROSSVIEW_AZ.min, CROSSVIEW_AZ.max), elevation: clamp(Number(cv.elevation), CROSSVIEW_EL.min, CROSSVIEW_EL.max),
    distance: clamp(Number(cv.distance) || 1, CROSSVIEW_DIST.min, CROSSVIEW_DIST.max), keep_source_aim: true });
  const reveal = String(i.prompt ?? '').trim().slice(0, 500);
  setIn(g, CROSSVIEW_NODES.cond, 'prompt', reveal ? `crossview. ${reveal}` : 'crossview.');
  setIn(g, CROSSVIEW_NODES.seed, 'noise_seed', Math.max(0, Math.floor(Number(i.seed) || 0)));
  const generated = i.crossviewAudio === 'generated';
  const out = generated ? CROSSVIEW_NODES.outGenerated : CROSSVIEW_NODES.outOriginal;
  pruneUnreachable(g, [out, CROSSVIEW_NODES.outWarp]); const graph = g;
  const label = `New angle (${cv.azimuth > 0 ? '+' : ''}${Math.round(cv.azimuth)}°, ${cv.elevation > 0 ? '+' : ''}${Math.round(cv.elevation)}°)`;
  return { tool: j.toolId, passes: [{ label, workflow: CROSSVIEW_GRAPH, graph, output: out, extraOutputs: [{ node: CROSSVIEW_NODES.outWarp, label: 'Warp guide (what steered the new angle)' }],
    expect: { azimuth: cv.azimuth, elevation: cv.elevation, distance: cv.distance, size, audio: generated ? 'generated' : 'original', seconds: secs } }],
    post: { kind: 'each' }, outKind: 'video', muxSourceAudio: false, labels: [label],
    notes: [`H3 CrossView: ${size}, ${secs} s, ${generated ? 'generated sound' : 'the take’s own sound'}`] };
}
