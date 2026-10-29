/**
 * Prompt Edit · Bernini-R · Comfy Cloud (2026-10-27, official Comfy template "Bernini-R: Video Editing", video_bernini_r_video_editing;
 * docs.comfy.org/tutorials/video/bytedance/bernini-r). Edit Video › Prompt Edit: your clip + one sentence ("make it night", "remove the cup")
 * → the same clip with that change, motion and framing kept. Open weights (Comfy-Org/Bernini-R on Hugging Face, ByteDance, Apache-2.0) on
 * Comfy's GPUs, core nodes only.
 *
 * Graph: workflows/cloud/bernini-r-edit-api.json = the template with its "Video Edit (Bernini-R)" subgraph flattened (template node ids kept,
 * the subgraph's as "298:<id>"). Flattened with the template's own defaults:
 *  - Turbo on (its default): the lightx2v T2V distill LoRA on both experts (high 3.0, low 1.5), 6 steps res_multistep / simple split 3 + 3, cfg 1;
 *    the switches and primitives that pick these are resolved, the 40-step branch (turbo off) is not in the graph.
 *  - Task type: the template's default, "Video Editing (Content Propagation)". Its "Select Per-Line Text by Index" subgraph is resolved to that
 *    line, which Prompt Construction (StringConcatenate, no delimiter, as the template) puts in front of the instruction.
 *  - Source video only (the v2v task): the reference image / reference video inputs stay unconnected, as the template ships them.
 *  - No file swap: every class and model file is on Comfy Cloud (object_info 2026-10-26: BerniniConditioning, wan2.2_bernini_r_high/low_noise_fp8_scaled,
 *    lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank64_bf16, umt5_xxl_fp8_e4m3fn_scaled, Wan2_1_VAE_bf16; test fixture
 *    test/fixtures/object-info-bernini-cloud-2026-10-26.json; test/bernini-edit.test.ts).
 * Per job: the clip (conformed by our ffmpeg first, a free local step: 16 fps, the 480p canvas by its shape, 4n + 1 frames), Video Slice's length,
 * the instruction, the seed, BerniniConditioning's size, and the clip's own sound (or none).
 * Limits (the model's own, from the template's notes): 81 frames at 16 fps (≈ 5 s) at 480p (832 × 480 / 480 × 832; 624 × 624 for square clips);
 * the template's Video Slice keeps the first 5 s, and so do we. Output 16 fps, the clip's sound kept.
 * Price: an estimate from GPU time (hostedPrices.ts cloud-bernini-r, priceUnmeasured) until one measured run sets it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, WORKFLOWS_DIR } from '../config.js';
import { runFfmpeg } from '../ffmpeg.js';
import type { Plan } from './plans.js';

export const BERNINI_PROVIDER = 'cloud-bernini-r';
export const BERNINI_ROUTE = `comfy-cloud:${BERNINI_PROVIDER}`;
export const BERNINI_NAME = 'Bernini-R';
export const BERNINI_TEMPLATE = 'video_bernini_r_video_editing';
export const BERNINI_TEMPLATE_URL = 'https://github.com/Comfy-Org/workflow_templates/blob/main/templates/video_bernini_r_video_editing.json';
export const BERNINI_DOC = 'https://docs.comfy.org/tutorials/video/bytedance/bernini-r';
export const BERNINI_LICENSE_URL = 'https://huggingface.co/Comfy-Org/Bernini-R';
export const BERNINI_GRAPH_FILE = 'cloud/bernini-r-edit-api.json';
/** The template's notes: 81 frames at 16 fps, 4n + 1. */
export const BERNINI_FPS = 16; export const BERNINI_MAX_FRAMES = 81; export const BERNINI_MIN_FRAMES = 17;
export const BERNINI_MAX_SECONDS = 5; export const BERNINI_MIN_SECONDS = 1;
export const BERNINI_RESOLUTION = '480p';
/** The longest instruction we send (umt5 reads 512 tokens; the system line takes a few). */
export const BERNINI_MAX_CHARS = 1500;
/** Node ids in the graph (template ids; "298:" = the flattened subgraph). */
export const BERNINI_NODES = { load: '47', slice: '109', prompt: '298:284', cond: '298:278', seed: '298:275', video: '298:274', out: '46' } as const;
export const BERNINI_FILES = { high: 'wan2.2_bernini_r_high_noise_fp8_scaled.safetensors', low: 'wan2.2_bernini_r_low_noise_fp8_scaled.safetensors',
  lora: 'lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank64_bf16.safetensors', clip: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', vae: 'Wan2_1_VAE_bf16.safetensors' } as const;

const load = () => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, BERNINI_GRAPH_FILE), 'utf8')) as Record<string, any>;
/** What Comfy Cloud must have: every class in the graph and every model file a loader names (read from the graph itself). */
export const BERNINI_REQUIRES = (() => {
  const g = load(); const nodes = new Set<string>(); const models = new Map<string, { loader: string; field: string; file: string }>();
  for (const n of Object.values<any>(g)) { nodes.add(String(n.class_type));
    for (const [k, v] of Object.entries<any>(n.inputs ?? {})) if (typeof v === 'string' && /\.safetensors$/.test(v)) models.set(`${n.class_type}.${k}=${v}`, { loader: String(n.class_type), field: k, file: v }); }
  return { nodes: [...nodes].sort(), models: [...models.values()] };
})();

type In = Record<string, any>;
/** Frames we render for a clip of that many seconds: its first 5 s at 16 fps, on Wan's 4n + 1 grid (17–81). */
export const berniniFrames = (seconds: number): number => { const f = Math.round(Math.max(0, Number(seconds) || 0) * BERNINI_FPS);
  return Math.min(BERNINI_MAX_FRAMES, Math.max(BERNINI_MIN_FRAMES, Math.floor(f / 4) * 4 + 1)); };
/** Seconds billed and made: the rendered frames at 16 fps (≤ 5.06 s). */
export const berniniSeconds = (i: In): number => Math.round((berniniFrames(Number(i.duration) || BERNINI_MAX_SECONDS) / BERNINI_FPS) * 100) / 100;
/** The 480p canvas by the clip's shape (multiples of 16, as BerniniConditioning asks). */
export const berniniSize = (w?: number, h?: number): [number, number] => (!w || !h ? [832, 480] : Math.abs(w / h - 1) < 0.15 ? [624, 624] : w > h ? [832, 480] : [480, 832]);

/** What this route can't take (null = fine). Same check on the quote, the submit and the plan. Reads only what the quote also has. */
export function berniniIssue(i: In): string | null {
  const d = Number(i.duration); if (d && d < BERNINI_MIN_SECONDS) return `${BERNINI_NAME} needs a clip of at least ${BERNINI_MIN_SECONDS} s`;
  if (String(i.finalPrompt ?? i.prompt ?? '').length > BERNINI_MAX_CHARS) return `Keep the instruction under ${BERNINI_MAX_CHARS} characters`;
  return null;
}
const refuse = (msg: string) => Object.assign(new Error(`${msg}. Nothing was sent or charged`), { reasonCode: 'input_blocked', errorType: 'validation' });
const seedOf = (s: unknown) => (Number.isFinite(Number(s)) ? Math.abs(Math.floor(Number(s))) % 2 ** 50 : 42);

/** The API graph for one job. `video` = an upload placeholder ({__file}) or a Cloud asset ref. */
export function berniniGraph(i: In, video: unknown, o: { size?: [number, number]; frames?: number; keepAudio?: boolean } = {}): Record<string, any> {
  const g = load(); const N = BERNINI_NODES; const [W, H] = o.size ?? berniniSize(i.width, i.height); const frames = o.frames ?? berniniFrames(Number(i.duration) || BERNINI_MAX_SECONDS);
  g[N.load].inputs.file = video;
  // the clip is already cut to `frames` at 16 fps; the half frame keeps the last one whichever way Video Slice rounds
  Object.assign(g[N.slice].inputs, { start_time: 0, duration: Math.round(((frames + 0.5) / BERNINI_FPS) * 1000) / 1000, strict_duration: false });
  g[N.prompt].inputs.string_b = String(i.finalPrompt ?? i.prompt ?? '').trim();
  Object.assign(g[N.cond].inputs, { width: W, height: H });
  g[N.seed].inputs.noise_seed = seedOf(i.seed);
  if (o.keepAudio === false) delete g[N.video].inputs.audio;
  g[N.out].inputs.filename_prefix = 'video/openhiggsfield-bernini-r';
  return g;
}

/** Free local prep before any upload: the clip's first 5 s conformed to 16 fps on the 480p canvas (cover + centre crop), exactly `frames`
 *  frames (the last one held if the clip is a frame short). Writes input.bernini { video, size, frames }. */
export async function prepareBerniniCloud(job: { id: string; input: In }) {
  const i = job.input; const bad = berniniIssue(i); if (bad) throw refuse(bad);
  if (!i.videoPath) throw refuse(`${BERNINI_NAME} needs a clip`);
  const frames = berniniFrames(Number(i.duration) || BERNINI_MAX_SECONDS); const size = berniniSize(i.width, i.height); const [W, H] = size;
  const out = path.join(DATA_DIR, `${job.id}-bernini-src.mp4`); const secs = (frames + 1) / BERNINI_FPS;
  const vf = `fps=${BERNINI_FPS},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,tpad=stop_mode=clone:stop=2`;
  const keepAudio = i.keepAudio !== false && i.hasAudio !== false;
  const args = ['-y', '-v', 'error', '-t', String(secs), '-i', String(i.videoPath), '-vf', vf, '-frames:v', String(frames), '-c:v', 'libx264', '-crf', '14', '-pix_fmt', 'yuv420p',
    ...(keepAudio ? ['-c:a', 'aac', '-t', String(frames / BERNINI_FPS)] : ['-an']), out];
  if ((await runFfmpeg(args)) !== 0) throw refuse(`That clip could not be prepared for ${BERNINI_NAME}. Try another clip`);
  i.bernini = { video: out, size, frames, keepAudio };
}

/** The plan (comfy/cloudWorkflows.ts standalone entry): one pass. */
export function berniniCloudPlan(j: { id: string; toolId: string; provider: string; input: In }): Plan {
  const i = j.input; const bad = berniniIssue(i); if (bad) throw refuse(bad);
  if (!String(i.finalPrompt ?? i.prompt ?? '').trim()) throw refuse('Say what to change, e.g. make it night');
  const x = i.bernini as { video: string; size: [number, number]; frames: number; keepAudio: boolean } | undefined;
  const src = x?.video ?? i.videoPath; if (!src) throw refuse(`${BERNINI_NAME} needs a clip`);
  const graph = berniniGraph(i, { __file: String(src) }, { size: x?.size, frames: x?.frames, keepAudio: x?.keepAudio ?? (i.keepAudio !== false && i.hasAudio !== false) });
  const { width: W, height: H } = graph[BERNINI_NODES.cond].inputs; const frames = x?.frames ?? berniniFrames(Number(i.duration) || BERNINI_MAX_SECONDS);
  return { tool: j.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false,
    notes: [`${BERNINI_NAME} on Comfy Cloud (official template ${BERNINI_TEMPLATE}, turbo): ${W}×${H}, ${frames} frames at ${BERNINI_FPS} fps (${(frames / BERNINI_FPS).toFixed(2)} s)`],
    passes: [{ label: 'Edited', workflow: BERNINI_GRAPH_FILE, graph, output: BERNINI_NODES.out, expect: { width: W, height: H, frames } }] };
}
