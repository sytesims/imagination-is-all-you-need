/**
 * Wan Animate 2 · Comfy Cloud (2026-10-27, official Comfy template "Wan Animate 2: Motion Transfer", comfy.org/workflows 9394f9968da3,
 * video_wan_animate2; docs.comfy.org/tutorials/video/wan/wan-animate-2). Motion Control: the character in your image does the motion of your clip.
 * Open weights (Comfy-Org/Wan-Animate-2 on Hugging Face, Apache-2.0; upstream Wan-AI/Wan2.2-Animate-2-14B) on Comfy's GPUs, core nodes only.
 *
 * Every class and model file below is on Comfy Cloud (full object_info copy 2026-10-26):
 * WanAnimate2ToVideo, WanAnimate2Cache, wan_animate_2_int8_convrot, lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16, umt5_xxl_fp8_e4m3fn_scaled,
 * clip_vision_h, Wan2_1_VAE_bf16 (test fixture: test/fixtures/object-info-comfy-cloud-featured-2026-10-26.json; test/comfy-featured.test.ts).
 *
 * Graph = the template's "Motion Transfer (Wan Animate 2)" subgraph flattened to API format, with the template's settings: context windows off
 * (its switch is off), WanAnimate2Cache gpu / int8, ModelSamplingSD3 shift 5, 6 steps lcm / simple, cfg 1, pose and reference strength 1.
 * One window = 81 frames (the template's fragment_length). Longer clips chain windows the way the template's second (copied) subgraph does:
 * continue_motion = the previous window's frames, video_frame_offset = its offset output, and the repeated first frame dropped; the windows are
 * joined (BatchImagesNode) and cut to the clip's frame count. We run at 24 fps (the driving clip is conformed first, a free local step), so
 * one window covers 3.33 s and the third ends at 10 s: Wan Animate 2 here takes clips up to 10 s.
 * Size: 480p, the template's tier (832 × 480, 480 × 832 or 624 × 624 by the clip's shape; multiples of 16 as WanAnimate2ToVideo asks).
 * Price: Comfy Cloud bills GPU time; not measured yet, so the route is held (priceUnmeasured) until a measured run sets it.
 */
import path from 'node:path';
import { DATA_DIR } from '../config.js';
import { runFfmpeg, videoSize } from '../ffmpeg.js';
import type { Plan } from './plans.js';

export const WA2_PROVIDER = 'cloud-wan-animate2';
export const WA2_ROUTE = `comfy-cloud:${WA2_PROVIDER}`;
export const WA2_NAME = 'Wan Animate 2';
export const WA2_TEMPLATE = 'video_wan_animate2';
export const WA2_TEMPLATE_URL = 'https://comfy.org/workflows/9394f9968da3-9394f9968da3/';
export const WA2_DOC = 'https://docs.comfy.org/tutorials/video/wan/wan-animate-2';
/** A reference copy of the one-window graph (what comfyCloudOpen reads; test/comfy-featured.test.ts keeps it equal to wa2Graph's). */
export const WA2_GRAPH_FILE = 'cloud-featured/wan-animate2-api.json';
export const WA2_FPS = 24; export const WA2_WINDOW = 81; export const WA2_MAX_WINDOWS = 3;
export const WA2_MAX_SECONDS = 10; export const WA2_MIN_SECONDS = 1;
export const WA2_FILES = { unet: 'wan_animate_2_int8_convrot.safetensors', lora: 'lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors', clip: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
  vision: 'clip_vision_h.safetensors', vae: 'Wan2_1_VAE_bf16.safetensors' } as const;
export const WA2_REQUIRES = { nodes: ['LoadImage', 'LoadVideo', 'GetVideoComponents', 'ResizeImageMaskNode', 'ImageFromBatch', 'UNETLoader', 'LoraLoaderModelOnly', 'WanAnimate2Cache', 'ModelSamplingSD3',
  'BasicScheduler', 'KSamplerSelect', 'CLIPLoader', 'CLIPTextEncode', 'CLIPVisionLoader', 'CLIPVisionEncode', 'VAELoader', 'WanAnimate2ToVideo', 'SamplerCustom', 'TrimVideoLatent', 'VAEDecode',
  'BatchImagesNode', 'CreateVideo', 'SaveVideo'],
  models: [{ loader: 'UNETLoader', field: 'unet_name', file: WA2_FILES.unet }, { loader: 'LoraLoaderModelOnly', field: 'lora_name', file: WA2_FILES.lora },
    { loader: 'CLIPLoader', field: 'clip_name', file: WA2_FILES.clip }, { loader: 'CLIPVisionLoader', field: 'clip_name', file: WA2_FILES.vision }, { loader: 'VAELoader', field: 'vae_name', file: WA2_FILES.vae }] };
/** Wan's usual negative prompt, as the template (and our local Wan 2.2 Animate graph) carries it. */
const NEGATIVE = '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走';

type In = Record<string, any>;
/** Seconds the job covers (the swap range, else the clip), to 0.01 s. */
export const wa2Seconds = (i: In): number => Math.round((Number(i.duration) || 0) * 100) / 100;
/** Frames rendered for that many seconds at 24 fps (the start frame included). */
export const wa2Frames = (seconds: number) => Math.max(1, Math.round(seconds * WA2_FPS)) + 1;
/** 81-frame windows needed (each extra window adds 80 new frames). */
export const wa2Windows = (seconds: number) => Math.max(1, Math.ceil((wa2Frames(seconds) - 1) / (WA2_WINDOW - 1)));
/** The 480p canvas by the clip's shape. */
export const wa2Size = (w?: number, h?: number): [number, number] => (!w || !h ? [832, 480] : Math.abs(w / h - 1) < 0.15 ? [624, 624] : w > h ? [832, 480] : [480, 832]);

/** What this route can't take (null = fine). Same check on the quote, the submit and the plan. */
export function wa2Issue(i: In): string | null {
  const s = wa2Seconds(i); if (s > WA2_MAX_SECONDS + 0.01) return `${WA2_NAME} on Comfy Cloud takes up to ${WA2_MAX_SECONDS} s; trim the clip to ${WA2_MAX_SECONDS} s or less`;
  if (i.draft) return `${WA2_NAME} has no draft mode`;
  // the swap tools send their own quality (720p by default): Wan Animate 2 always renders 480p (its template's tier), and the quote is billed at 480p
  return null;
}
const refuse = (msg: string) => Object.assign(new Error(`${msg}. Nothing was sent or charged`), { reasonCode: 'input_blocked', errorType: 'validation' });

/** The positive prompt (who and where), in the template's two-part shape; the pose prompt describes the motion. */
export const wa2Prompts = (i: In) => { const p = String(i.finalPrompt || i.prompt || '').trim();
  return { positive: `Character description: ${p || 'the character in the reference image, exactly as shown'}\nBackground description: ${p ? 'as described above' : 'a clean, simple background'}`,
    pose: 'A person following the motion of the reference video, background stationary' }; };

/** The API-format graph. `image` / `video` are upload placeholders ({__file}) or Cloud asset refs. */
export function wa2Graph(i: In, files: { image: unknown; video: unknown }, o: { size?: [number, number]; seconds?: number } = {}): Record<string, any> {
  const [W, H] = o.size ?? wa2Size(i.width, i.height); const secs = o.seconds ?? (wa2Seconds(i) || 81 / WA2_FPS); const frames = wa2Frames(secs); const n = Math.min(WA2_MAX_WINDOWS, wa2Windows(secs));
  const seed = Number.isFinite(Number(i.seed)) ? Math.abs(Math.floor(Number(i.seed))) : 42; const pr = wa2Prompts(i);
  const resize = (input: [string, number]) => ({ class_type: 'ResizeImageMaskNode', inputs: { input, resize_type: 'scale dimensions', 'resize_type.width': W, 'resize_type.height': H, 'resize_type.crop': 'center', scale_method: 'area' } });
  const g: Record<string, any> = {
    '1': { class_type: 'LoadImage', inputs: { image: files.image } },
    '2': { class_type: 'LoadVideo', inputs: { file: files.video } },
    '3': { class_type: 'GetVideoComponents', inputs: { video: ['2', 0] } },
    '4': resize(['3', 0]), '5': resize(['1', 0]),
    '6': { class_type: 'ImageFromBatch', inputs: { image: ['4', 0], batch_index: 0, length: 1 } },
    '10': { class_type: 'UNETLoader', inputs: { unet_name: WA2_FILES.unet, weight_dtype: 'default' } },
    '11': { class_type: 'LoraLoaderModelOnly', inputs: { model: ['10', 0], lora_name: WA2_FILES.lora, strength_model: 1 } },
    '12': { class_type: 'WanAnimate2Cache', inputs: { model: ['11', 0], device: 'gpu', dtype: 'int8' } },
    '13': { class_type: 'ModelSamplingSD3', inputs: { model: ['12', 0], shift: 5 } },
    '14': { class_type: 'BasicScheduler', inputs: { model: ['12', 0], scheduler: 'simple', steps: 6, denoise: 1 } },
    '15': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'lcm' } },
    '16': { class_type: 'CLIPLoader', inputs: { clip_name: WA2_FILES.clip, type: 'wan', device: 'default' } },
    '17': { class_type: 'CLIPTextEncode', inputs: { clip: ['16', 0], text: pr.positive } },
    '18': { class_type: 'CLIPTextEncode', inputs: { clip: ['16', 0], text: NEGATIVE } },
    '19': { class_type: 'CLIPTextEncode', inputs: { clip: ['16', 0], text: pr.pose } },
    '20': { class_type: 'CLIPVisionLoader', inputs: { clip_name: WA2_FILES.vision } },
    '21': { class_type: 'CLIPVisionEncode', inputs: { clip_vision: ['20', 0], image: ['5', 0], crop: 'none' } },
    '22': { class_type: 'CLIPVisionEncode', inputs: { clip_vision: ['20', 0], image: ['6', 0], crop: 'none' } },
    '23': { class_type: 'VAELoader', inputs: { vae_name: WA2_FILES.vae } },
  };
  const parts: [string, number][] = [];
  for (let k = 0; k < n; k++) { const b = 100 + k * 10; const id = (x: number) => String(b + x); const prev = 100 + (k - 1) * 10;
    g[id(0)] = { class_type: 'WanAnimate2ToVideo', inputs: { positive: ['17', 0], negative: ['18', 0], vae: ['23', 0], reference_image: ['5', 0], pose_video: ['4', 0], clip_vision_output: ['21', 0],
      positive_pose: ['19', 0], clip_vision_output_pose: ['22', 0], ...(k ? { continue_motion: [String(prev + 3), 0] } : {}), width: W, height: H, length: WA2_WINDOW, batch_size: 1,
      video_frame_offset: k ? [String(prev), 5] : 0, pose_strength: 1, pose_start_percent: 0, pose_end_percent: 1, reference_image_strength: 1 } };
    g[id(1)] = { class_type: 'SamplerCustom', inputs: { model: ['13', 0], add_noise: true, noise_seed: seed, cfg: 1, positive: [id(0), 0], negative: [id(0), 1], sampler: ['15', 0], sigmas: ['14', 0], latent_image: [id(0), 2] } };
    g[id(2)] = { class_type: 'TrimVideoLatent', inputs: { samples: [id(1), 0], trim_amount: [id(0), 3] } };
    g[id(3)] = { class_type: 'VAEDecode', inputs: { samples: [id(2), 0], vae: ['23', 0] } };
    if (k) { g[id(4)] = { class_type: 'ImageFromBatch', inputs: { image: [id(3), 0], batch_index: 1, length: 4096 } }; parts.push([id(4), 0]); } else parts.push([id(3), 0]);
  }
  g['90'] = { class_type: 'BatchImagesNode', inputs: Object.fromEntries(parts.map((p, k) => [`images.image${k}`, p])) };
  g['91'] = { class_type: 'ImageFromBatch', inputs: { image: ['90', 0], batch_index: 0, length: Math.min(frames, WA2_WINDOW + (n - 1) * (WA2_WINDOW - 1)) } };
  g['92'] = { class_type: 'CreateVideo', inputs: { images: ['91', 0], fps: WA2_FPS, audio: ['3', 1] } };
  g['93'] = { class_type: 'SaveVideo', inputs: { video: ['92', 0], filename_prefix: 'video/openhiggsfield-wan-animate2', format: 'auto', 'format.codec': 'auto' } };
  return g;
}
/** Free local prep before any upload: the driving clip conformed to 24 fps, cut to the job's seconds and padded with its last frame so every
 *  window has pose frames (Wan reads 81 per window). Writes input.wa2 { video, size, seconds }. */
export async function prepareWa2Cloud(job: { id: string; input: In }) {
  const i = job.input; const bad = wa2Issue(i); if (bad) throw refuse(bad);
  if (!i.videoPath) throw refuse(`${WA2_NAME} needs a driving clip`); const img = i.imagePath || i.refPaths?.[0]; if (!img) throw refuse(`${WA2_NAME} needs a character image`);
  const secs = Math.max(WA2_MIN_SECONDS, wa2Seconds(i) || 3); const pad = wa2Windows(secs) * (WA2_WINDOW - 1) / WA2_FPS - secs + 0.2; const out = path.join(DATA_DIR, `${job.id}-wa2-drive.mp4`);
  const vf = `fps=${WA2_FPS},tpad=stop_mode=clone:stop_duration=${Math.max(0.1, Math.round(pad * 100) / 100)}`;
  if ((await runFfmpeg(['-y', '-v', 'error', '-t', String(secs) /* input option: cut first, then pad */, '-i', String(i.videoPath), '-vf', vf, '-c:v', 'libx264', '-crf', '14', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-af', `apad=pad_dur=${Math.max(0.1, Math.round(pad * 100) / 100)}`, out])) !== 0)
    throw refuse('That clip could not be prepared for Wan Animate 2. Try another clip');
  const s = await videoSize(String(i.videoPath)).catch(() => null); i.wa2 = { video: out, image: img, size: wa2Size(s?.width ?? i.width, s?.height ?? i.height), seconds: secs };
}
/** The plan (comfy/cloudWorkflows.ts standalone entry): one pass, the windows chained inside the graph. */
export function wa2CloudPlan(j: { id: string; toolId: string; provider: string; input: In }): Plan {
  const i = j.input; const bad = wa2Issue(i); if (bad) throw refuse(bad); const x = i.wa2 as { video: string; image: string; size: [number, number]; seconds: number } | undefined;
  const img = x?.image ?? i.imagePath ?? i.refPaths?.[0]; if (!img || !(x?.video ?? i.videoPath)) throw refuse(`${WA2_NAME} needs a character image and a driving clip`);
  const graph = wa2Graph(i, { image: { __file: String(img) }, video: { __file: String(x?.video ?? i.videoPath) } }, { size: x?.size, seconds: x?.seconds });
  const n = Object.values<any>(graph).filter((v) => v.class_type === 'WanAnimate2ToVideo').length; const { width: W, height: H } = graph['100'].inputs;
  return { tool: j.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false,
    notes: [`${WA2_NAME} on Comfy Cloud (official template ${WA2_TEMPLATE}): ${W}×${H}, 24 fps, ${n} window${n > 1 ? 's' : ''} of ${WA2_WINDOW} frames, the clip's own sound`],
    passes: [{ label: 'Result', workflow: WA2_GRAPH_FILE, graph, output: '93', expect: { windows: n } }] };
}
