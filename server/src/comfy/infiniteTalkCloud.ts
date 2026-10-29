/**
 * InfiniteTalk (Wan 2.1) · Comfy Cloud (2026-10-27): Lip Sync's long talking-video engine. A photo of one person + a speech clip (up to 60 s) →
 * a talking video as long as the speech, with the speech as its sound. Provider cloud-infinitetalk, route comfy-cloud:cloud-infinitetalk, a
 * standalone entry in comfy/cloudWorkflows.ts (no local twin), offered on the voice tool's lipsync mode (Video → Lip Sync, "Make it talk").
 *
 * Source: the official Comfy template video_wan2_1_infinitetalk (github.com/Comfy-Org/workflow_templates, MIT), docs.comfy.org
 * tutorials/video/wan/wan-infinitetalk. Graph: workflows/cloud/wan21-infinitetalk-api.json, the template's subgraph "InfiniteTalk (Base Generation)"
 * flattened into core nodes with the template's own files and settings: Wan 2.1 I2V 14B 480p fp8 scaled (Kijai) + lightx2v I2V 480p step-distill
 * LoRA rank 64 at 1.0, InfiniteTalk model patch, wav2vec2 chinese base audio encoder, umt5 xxl fp8 text encoder, Wan 2.1 VAE bf16;
 * WanInfiniteTalkToVideo (81 frames, motion 9, audio_scale 1), euler / normal, 6 steps, cfg 1, negative = the prompt zeroed; 25 fps.
 * Every class and file is on Comfy Cloud's object_info of 2026-10-26.
 *
 * Length: the template makes 81 frames (3.24 s) per window and its "Video Extend" group is copied by hand for longer speech. Here the plan
 * repeats it: window 1 as saved (nodes 101–107), windows 2..n cloned from the saved window 2 (nodes k01–k08, k = window number).
 *  - WanInfiniteTalkToVideo reads the speech from frame (previous_frames − motion frames). Each window k ≥ 2 takes the previous window's 81 frames
 *    as previous_frames (as the template wires window 2) and the speech from the previous window's start (TrimAudioDuration), so the offset
 *    lands on its own start (72 (k − 1) frames). Passing only the previous window keeps memory flat instead of the whole clip so far.
 *  - Each window after the first re-draws the 9 motion frames it continues from; they are dropped (ImageFromBatch 9 + 72, the node's
 *    trim_image), so the joined clip has no repeats and stays on the speech: 81 + 72 (n − 1) frames, cut to the speech (ceil(seconds × 25)).
 * Single speaker only (the single model patch). Two speakers need a mask per person (the template paints them by hand): a follow-up.
 * 480p only (the 480p model + the 480p lightx2v LoRA, as the template): the photo's shape picks 832×480, 480×832 or 640×640.
 * Price: an estimate from GPU time per rendered window (hostedPrices.ts cloud-infinitetalk, priceUnmeasured) until one measured run sets it.
 * Pure (no network): tests check it against object_info.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORKFLOWS_DIR } from '../config.js';
import { imageDimsOfFile } from '../imageDims.js';
import type { Plan } from './plans.js';
import { TV_MAX_SECONDS, TV_FADE, planTalkChunks, talkPartSpans, talkIssue, talkSummary, isOn, type TalkPart } from '../shared/talkingVideo.js';

export const IT_PROVIDER = 'cloud-infinitetalk';
export const IT_ROUTE = `comfy-cloud:${IT_PROVIDER}`;
export const IT_NAME = 'InfiniteTalk (Wan 2.1)';
export const IT_GRAPH = 'cloud/wan21-infinitetalk-api.json';
export const IT_FPS = 25;
/** Frames per window (the template's length), motion frames each window continues from, new frames per window after the first. */
export const IT_WINDOW = 81; export const IT_MOTION = 9; export const IT_STEP = IT_WINDOW - IT_MOTION;
export const IT_MAX_SECONDS = 60; export const IT_MIN_SECONDS = 1;
/** BatchImagesNode takes up to 50 inputs: 60 s needs 21 windows. */
export const IT_MAX_WINDOWS = 50;
export const IT_SIZES = { '16:9': { width: 832, height: 480 }, '9:16': { width: 480, height: 832 }, '1:1': { width: 640, height: 640 } } as const;
export type ItAspect = keyof typeof IT_SIZES;
export const IT_ASPECTS = ['auto', ...Object.keys(IT_SIZES)] as const;
/** The model files (all in Comfy Cloud's shared library, object_info 2026-10-26; the template's own files). */
export const IT_FILES = {
  unet: 'Wan2_1-I2V-14B-480p_fp8_e4m3fn_scaled_KJ.safetensors',
  lora: 'lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors',
  patch: 'wan2.1_infiniteTalk_single_fp16.safetensors',
  textEncoder: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
  vae: 'Wan2_1_VAE_bf16.safetensors',
  audioEncoder: 'wav2vec2-chinese-base_fp16.safetensors',
} as const;
const load = () => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, IT_GRAPH), 'utf8')) as Record<string, any>;
export const IT_REQUIRES = {
  nodes: [...new Set(Object.values<any>(load()).map((n) => String(n.class_type)))].sort(),
  models: [
    { loader: 'UNETLoader', field: 'unet_name', file: IT_FILES.unet },
    { loader: 'LoraLoaderModelOnly', field: 'lora_name', file: IT_FILES.lora },
    { loader: 'ModelPatchLoader', field: 'name', file: IT_FILES.patch },
    { loader: 'CLIPLoader', field: 'clip_name', file: IT_FILES.textEncoder },
    { loader: 'VAELoader', field: 'vae_name', file: IT_FILES.vae },
    { loader: 'AudioEncoderLoader', field: 'audio_encoder_name', file: IT_FILES.audioEncoder },
  ],
};

/** Speech seconds as both the quote and the job read them (rounded to 0.01 s, as the bar sends it). */
const secs = (s: unknown) => Math.round((Number(s) || 0) * 100) / 100;
/** The windows a speech length needs: output frames (the speech at 25 fps), windows, frames the model renders and their seconds. */
export function itWindows(speechSeconds: number): { frames: number; windows: number; renderedFrames: number; renderSeconds: number; seconds: number } {
  const s = Math.max(secs(speechSeconds), 1 / IT_FPS); const frames = Math.max(1, Math.ceil(s * IT_FPS - 1e-6));
  const windows = frames <= IT_WINDOW ? 1 : 1 + Math.ceil((frames - IT_WINDOW) / IT_STEP);
  return { frames, windows, renderedFrames: windows * IT_WINDOW, renderSeconds: Math.round((windows * IT_WINDOW / IT_FPS) * 100) / 100, seconds: frames / IT_FPS };
}
/** Seconds a job bills on Comfy Cloud: the frames the model renders (every window is 81 frames), read from the speech length only, so the quote
 *  (the bar's speechSeconds) and the charge (parseInput's measured speechSeconds) price the same windows. */
export const itBillSeconds = (i: Record<string, any>) => { const s = Number(i?.speechSeconds ?? i?.duration) || IT_WINDOW / IT_FPS;
  if (!isOn(i?.split) || s <= IT_MAX_SECONDS + 0.05) return itWindows(s).renderSeconds;
  return talkRenderSeconds(s); };
/** Talking Video, long speech (split=1, shared/talkingVideo.ts): the rendered seconds of every part, each part as its own job (its span plus the
 *  0.24 s crossfade into the next). Priced on the even split (length only, so quote = charge); the cuts the server moves to pauses shift a part by
 *  a few seconds at most, a window either way. */
export function talkRenderSeconds(total: number): number {
  const spans = talkPartSpans(planTalkChunks([], total), total);
  return Math.round(spans.reduce((a, p) => a + itWindows(p.end - p.start).renderSeconds, 0) * 100) / 100;
}
/** What this route can't take (null = fine). Read before any upload (the quote) and again on the job. */
export function itIssue(i: Record<string, any>): string | null {
  const s = Number(i?.speechSeconds);
  if (isOn(i?.split)) { const t = talkIssue(s, true); if (t) return t.message; } // long speech in parts (Talking Video): up to TV_MAX_SECONDS
  else if (s > IT_MAX_SECONDS + 0.05) return `InfiniteTalk takes speech up to ${IT_MAX_SECONDS} s; yours is ${Math.round(s * 10) / 10} s. Trim it to ${IT_MAX_SECONDS} s or less`;
  if (i?.aspect && !(IT_ASPECTS as readonly string[]).includes(String(i.aspect))) return 'InfiniteTalk makes 16:9, 9:16 or 1:1 (or the photo\'s shape)';
  return null;
}
/** The size: the picked shape, else the photo's (wide ≥ 1.2, tall ≤ 0.83, else square). */
export function itSize(aspect: string | undefined, dims: { width: number; height: number } | null): { aspect: ItAspect; width: number; height: number } {
  let a: ItAspect = '9:16';
  if (aspect && aspect !== 'auto' && aspect in IT_SIZES) a = aspect as ItAspect;
  else if (dims && dims.width > 0 && dims.height > 0) { const r = dims.width / dims.height; a = r >= 1.2 ? '16:9' : r <= 0.83 ? '9:16' : '1:1'; }
  return { aspect: a, ...IT_SIZES[a] };
}
/** Visual words only (no quoted dialogue). The user's words come first. */
export const IT_BASE_PROMPT = 'The person talks to the camera with natural lip and jaw movements in sync with the voice, natural blinks and small head movements.';
export const itPrompt = (user?: string) => { const u = String(user ?? '').replace(/["“”]/g, '').trim(); return u ? `${u.replace(/[.!?]*$/, '.')} ${IT_BASE_PROMPT}` : IT_BASE_PROMPT; };

type G = Record<string, any>;
const isLink = (v: any) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string';
const id = (k: number, x: number) => String(k * 100 + x);
const seedOf = (s: any) => Math.max(0, Math.floor(Number(s) || 0));
/** Fill the saved graph for one job: n windows, size, prompt, seeds, files. Throws (plain words) on a job it can't make. */
export function patchInfiniteTalk(g: G, i: Record<string, any>, seed: number): { graph: G; output: string; expect: Record<string, any> } {
  const issue = itIssue(i); if (issue) throw Object.assign(new Error(issue), { reasonCode: 'input_blocked', errorType: 'validation' });
  if (!i.imagePath) throw Object.assign(new Error('InfiniteTalk needs a photo of the person'), { reasonCode: 'input_blocked', errorType: 'validation' });
  if (!i.itSpeechPath) throw new Error('InfiniteTalk: the speech was not prepared');
  const audioSeconds = secs(i.speechSeconds); if (!(audioSeconds > 0)) throw new Error('InfiniteTalk: the speech length is unknown');
  const w = itWindows(audioSeconds); if (w.windows > IT_MAX_WINDOWS) throw new Error('InfiniteTalk: too many windows');
  const size = itSize(i.aspect, i.imageSize ?? imageDimsOfFile(i.imagePath));
  const prompt = String(i.finalPrompt ?? itPrompt(i.prompt));
  g['1'].inputs.image = { __file: i.imagePath }; g['2'].inputs.audio = { __file: i.itSpeechPath }; g['9'].inputs.text = prompt;
  const proto: G = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6', '7', '8'].map((x) => [x, g[id(2, Number(x))]]));
  for (const x of Object.keys(proto)) delete g[id(2, Number(x))];
  const batch: Record<string, any> = {};
  for (let k = 1; k <= w.windows; k++) {
    if (k >= 2) { // a copy of the saved window 2, rewired to window k − 1
      const re = (v: any) => (isLink(v) && Number(v[0]) >= 200 && Number(v[0]) < 300 ? [id(k, Number(v[0]) - 200), v[1]] : v);
      for (const [x, n] of Object.entries<any>(proto)) g[id(k, Number(x))] = { ...structuredClone(n), inputs: Object.fromEntries(Object.entries<any>(n.inputs).map(([f, v]) => [f, re(v)])),
        ...(n._meta ? { _meta: { title: String(n._meta.title).replace(/^Window \d+/, `Window ${k}`) } } : {}) };
      g[id(k, 2)].inputs.previous_frames = [id(k - 1, 7), 0];
      const start = Math.round(((k - 2) * IT_STEP / IT_FPS) * 100) / 100; // the previous window's start: the node's offset (81 − 9 = 72 frames) lands on this window's start
      Object.assign(g[id(k, 0)].inputs, { start_index: start, duration: Math.round((audioSeconds - start + 1) * 100) / 100 });
    }
    Object.assign(g[id(k, 2)].inputs, { width: size.width, height: size.height, length: IT_WINDOW, motion_frame_count: IT_MOTION, audio_scale: 1 });
    g[id(k, 5)].inputs.noise_seed = seed + k - 1;
    batch[`images.image${k - 1}`] = [id(k, k === 1 ? 7 : 8), 0];
  }
  g['90'].inputs = batch; g['91'].inputs.length = w.frames; g['92'].inputs.fps = IT_FPS;
  for (const [nid, n] of Object.entries<any>(g)) for (const [f, v] of Object.entries<any>(n.inputs)) if (isLink(v) && !g[v[0]]) throw new Error(`infinitetalk graph: ${nid}.${f} links to missing node ${v[0]}`);
  return { graph: g, output: '93', expect: { seed, prompt, fps: IT_FPS, frames: w.frames, seconds: w.seconds, windows: w.windows, renderedFrames: w.renderedFrames, renderSeconds: w.renderSeconds,
    audioSeconds, width: size.width, height: size.height, aspect: size.aspect, motionFrames: IT_MOTION, audioScale: 1, steps: 6, cfg: 1, soundtrack: 'input speech' } };
}
type J = { id: string; toolId: string; provider: string; input: Record<string, any> };
export function infiniteTalkPlan(j: J): Plan {
  const parts: { start: number; end: number; seconds: number; path: string }[] | undefined = Array.isArray(j.input.talkParts) && j.input.talkParts.length > 1 ? j.input.talkParts : undefined;
  if (parts) return talkingPlan(j, parts);
  if (isOn(j.input.split) && Number(j.input.speechSeconds) > IT_MAX_SECONDS + 0.05) throw Object.assign(new Error(`InfiniteTalk takes speech up to ${IT_MAX_SECONDS} s per part; this speech was not split`), { reasonCode: 'input_blocked', errorType: 'validation' });
  const { graph, output, expect } = patchInfiniteTalk(load(), j.input, seedOf(j.input.seed));
  const label = `Talking video (${expect.seconds.toFixed(1)} s)`;
  return { tool: j.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false, passes: [{ label, workflow: IT_GRAPH, graph, output, expect }],
    notes: [`${expect.windows} window(s) of ${IT_WINDOW} frames at ${IT_FPS} fps (${IT_MOTION} motion frames), ${expect.width}×${expect.height}`] };
}

/** Talking Video, long speech: one pass (one Comfy Cloud job) per part, the same photo, prompt and seed; then the parts joined with a 0.24 s video
 *  crossfade over the full original speech (post talkJoin, comfy/runNative.ts → talkJoinArgs). Each part's speech file was cut in parseInput. */
function talkingPlan(j: J, parts: { start: number; end: number; seconds: number; path: string }[]): Plan {
  const seed = seedOf(j.input.seed); const total = Number(j.input.speechSeconds);
  if (!(total > 0) || total > TV_MAX_SECONDS + 0.05) throw Object.assign(new Error(`Talking video takes speech up to ${TV_MAX_SECONDS / 60} minutes`), { reasonCode: 'input_blocked', errorType: 'validation' });
  const passes = parts.map((p, k) => { const { split: _s, talkParts: _t, ...rest } = j.input;
    const { graph, output, expect } = patchInfiniteTalk(load(), { ...rest, speechSeconds: p.seconds, itSpeechPath: p.path }, seed);
    return { label: `Part ${k + 1} of ${parts.length} (${p.start.toFixed(1)}–${p.end.toFixed(1)} s)`, workflow: IT_GRAPH, graph, output, expect: { ...expect, part: k + 1, parts: parts.length, partStart: p.start, partEnd: p.end } }; });
  const spans: TalkPart[] = parts.map((p) => ({ start: p.start, end: p.end }));
  return { tool: j.toolId, outKind: 'video', muxSourceAudio: false, labels: [`Talking video (${total.toFixed(1)} s)`], passes,
    post: { kind: 'talkJoin', parts: spans, fade: TV_FADE, fps: IT_FPS, audio: String(j.input.itSpeechPath), seconds: total },
    notes: [`${talkSummary(spans)}: ${parts.length} InfiniteTalk jobs (same photo, prompt and seed ${seed}), ${Math.round(TV_FADE * IT_FPS)}-frame video crossfades, the full speech as the sound`] };
}
/** ffmpeg arguments for the join: every part at 25 fps, crossfaded at the next part's start (each part but the last rendered 0.24 s past its end, so
 *  the crossfade shows two in-sync mouths), the original speech as the only sound, cut to its length. Pure (tests read it). */
export function talkJoinArgs(clips: string[], parts: TalkPart[], audio: string, out: string, fade = TV_FADE, fps = IT_FPS): string[] {
  if (!clips.length || clips.length !== parts.length) throw new Error('talking video join: one clip per part');
  const total = parts[parts.length - 1].end; const f: string[] = clips.map((_, k) => `[${k}:v]fps=${fps},settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[v${k}]`);
  let cur = 'v0';
  for (let k = 1; k < clips.length; k++) { const nx = `x${k}`; f.push(`[${cur}][v${k}]xfade=transition=fade:duration=${fade.toFixed(3)}:offset=${(parts[k].start - parts[0].start).toFixed(3)}[${nx}]`); cur = nx; }
  return ['-y', '-v', 'error', ...clips.flatMap((c) => ['-i', c]), '-i', audio, '-filter_complex', f.join(';'), '-map', `[${cur}]`, '-map', `${clips.length}:a:0`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-t', total.toFixed(3), '-movflags', '+faststart', out];
}
