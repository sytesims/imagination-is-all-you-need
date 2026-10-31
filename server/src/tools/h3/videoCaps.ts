/**
 * Generate Video (h3-video) per-model limits + per-route checks (Design Planner page 4, New Agent scope 2026-10-17).
 * Sources: MiniMax H3 fal model pages (minimax/h3/{text,image,reference}-to-video, 2026-10-17: duration, aspect_ratio, reference_{image,video,audio}_urls ≤9/3/3),
 * Replicate minimax/h3 (duration 4–15, ratio, reference_*_urls), our local graphs (ResolutionSelector 16:9 / 9:16 / 1:1, frames on the 17n+5 grid at 24 fps).
 * Models whose duration/aspect limits we haven't read from their docs keep our previous accepted set (6/10/15 s, Auto) with verified:false.
 * Bitrate = OUR final encode after download/render (ffmpeg crf), no price effect: no provider here exposes a bitrate input.
 * Audio off = audio removed in that same post-encode, unless the provider prices audio separately (Kling, Veo: audio price row).
 */
import path from 'node:path';
import { DATA_DIR } from '../../config.js';
import { runFfmpeg } from '../../ffmpeg.js';
import { nearestNumber, nearestTier, snapNote, addAdjustNote } from '../../shared/snap.js';
import { H3KF_CAPS, type KeyframeCaps } from '../../shared/h3Keyframes.js';
import { LTX_DFR, LTX_DFR_LABEL, LTX_DFR_HINT, LTX_DFR_SMOOTH_FIELD, LTX_DFR_SMOOTH_LABEL, LTX_DFR_SMOOTH_HINT } from '../../shared/ltxDfr.js';

export const VIDEO_ASPECTS = ['auto', '16:9', '9:16', '4:3', '3:4', '1:1', '21:9', '9:21'] as const;
export const BITRATES = [{ value: 'standard', label: 'Standard', crf: 23 }, { value: 'high', label: 'High', crf: 17 }] as const;
export type RefKinds = { image?: number; video?: number; audio?: number };
export interface DurationSpec { min: number; max: number; step: number; values?: number[] }
export interface VideoLimits {
  maxResolution: string; resolutions: string[]; /** Default seconds when none is asked (else the first duration ≥ 4). */ defaultSeconds?: number; minSeconds: number; maxSeconds: number; durationStep: number; durations: number[];
  aspects: string[]; audio: { supported: boolean; toggle: boolean; default: boolean; priceAffects: boolean; off: 'strip' | 'provider' };
  refKinds: RefKinds; refVideoSeconds?: { minEach: number; maxEach?: number; maxTotal: number; billed: string; /** frame-rate range a reference clip must have */ fps?: [number, number] };
  /** Reference audio clips: per-clip and total length (seconds). */ refAudioSeconds?: { minEach: number; maxEach?: number; maxTotal: number };
  /** File types each reference kind takes (extensions); unset = any the upload takes. */ refFormats?: { video?: string[]; audio?: string[] };
  /** Reference audio needs at least one reference image or video next to it (no audio-only job). */ audioNeedsVisualRef?: boolean;
  bitrate: string[]; bitratePriceAffects: false; verified: boolean; source: string;
  /** When a length from another model doesn't fit, start at defaultSeconds instead of the nearest length (slow local models: short drafts first). */ startShort?: boolean;
  /** Lengths allowed at one resolution only (narrower than `durations`; Veo 3.1 1080p = 8 s). Same rule on quote, submit and the bar. */ durationsByResolution?: Record<string, number[]>;
  /** No Fast / Best setting: the model runs fixed steps (LTX-2.5 22B local: 8 + 3 distilled steps; Draft / Sharper is its size choice). The bar hides the toggle. */ qualityOff?: boolean;
  /** Loop switch (start frame at both ends, the repeated frame cut): LTX-2.5 22B local. The bar shows it with a start frame and no end frame. */ loop?: boolean;
  /** What the bar shows for a resolution value when the value isn't a pixel tier to the user (Kling v3: 720p / 1080p = Standard / Pro mode). */ resolutionLabels?: Record<string, string>;
  /** One line per quality value, shown under its label in the picker (LTX-2.5 22B DFR). */ resolutionHints?: Record<string, string>;
  /** Keyframes mode (2026-10-31): how many frames this model takes and whether each has a time (shared/h3Keyframes.ts KeyframeCaps). Unset = no Keyframes mode. */ keyframes?: KeyframeCaps;
  /** A switch shown only at one quality and mode (LTX-2.5 DFR's third stage, Smooth motion 48 fps): sent as `field` = 1 / 0. */ stageToggle?: { field: string; label: string; hint: string; resolution: string; modes: string[]; default: boolean };
}
const range = (min: number, max: number, step = 1) => Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, k) => min + k * step);
const H3_SRC = 'https://fal.ai/models/minimax/h3/text-to-video/api, https://replicate.com/minimax/h3/api (2026-10-17)';
const h3 = (o: Partial<VideoLimits>): VideoLimits => ({ maxResolution: '768p', resolutions: ['768p', '480p'], minSeconds: 4, maxSeconds: 15, durationStep: 1, durations: range(4, 15),
  aspects: ['auto', '16:9', '9:16', '4:3', '3:4', '1:1', '21:9'], audio: { supported: true, toggle: true, default: true, priceAffects: false, off: 'strip' },
  refKinds: { image: 9, video: 3, audio: 3 }, bitrate: BITRATES.map((b) => b.value), bitratePriceAffects: false, verified: true, source: H3_SRC, ...o });
const legacy = (o: Partial<VideoLimits>): VideoLimits => ({ ...h3({}), maxResolution: '768p', minSeconds: 6, maxSeconds: 15, durationStep: 0, durations: [6, 10, 15], aspects: ['auto'], refKinds: { image: 1 },
  verified: false, source: 'previous accepted set; this model\'s docs not read for duration/aspect yet', ...o });
const ltx = (o: Partial<VideoLimits>): VideoLimits => h3({ maxResolution: '4K', resolutions: ['1080p', '720p', '1440p', '4K'], minSeconds: 6, maxSeconds: 20, durationStep: 2, durations: range(6, 20, 2), defaultSeconds: 6,
  aspects: ['auto', '16:9', '9:16', '1:1'], refKinds: {}, audio: { supported: true, toggle: true, default: true, priceAffects: false, off: 'provider' }, ...o });
/** Per model (provider id) on Generate Video = the union over its routes; each route narrows it (ROUTE_LIMITS). */
export const VIDEO_LIMITS: Record<string, VideoLimits> = {
  'comfy-h3': h3({ keyframes: H3KF_CAPS /* its Keyframes mode runs on the Comfy Cloud twin below */ }),
  // Wan 2.2 TI2V 5B, local only (2026-10-24): one graph from the official template video_wan2_2_5B_ti2v (workflows/wan22-ti2v-5b-api.json). 24 fps, frames on
  // Wan's 4n+1 grid (2 s = 49 frames). 704p = the template's 1280×704 (the model's native size), 480p = 832×480 for quicker drafts. Short clips only: on an
  // M1 Max a 2 s clip at 704p takes about 9 min and 5 s over 30 min (research brief, 2026-10-24), so 2–5 s and 2 s by default. No sound track.
  'comfy-wan22-5b': h3({ maxResolution: '704p', resolutions: ['704p', '480p'], minSeconds: 2, maxSeconds: 5, durationStep: 1, durations: [2, 3, 4, 5], defaultSeconds: 2, startShort: true,
    aspects: ['auto', '16:9', '9:16', '1:1'], audio: { supported: false, toggle: false, default: false, priceAffects: false, off: 'strip' }, refKinds: { image: 1 },
    source: 'workflows/wan22-ti2v-5b-api.json from the official Comfy template video_wan2_2_5B_ti2v (https://docs.comfy.org/tutorials/video/wan/wan2_2): Wan22ImageToVideoLatent width/height step 32, length step 4; 24 fps' }),
  // LTX-2.5 22B, local only (2026-10-25): workflows/ltx25-ti2v-api.json + ltx25-flf-api.json from the official Comfy templates video_ltx2_5_i2v / video_ltx2_5_flf2v.
  // 24 fps, frames = seconds × 24 + 1 (8n + 1). Two Mac-friendly sizes, the ones Direct a Shot’s Render step uses: Draft (448p value: 768×448 / 448×768 / 512×512) and
  // Sharper (576p value: 1024×576 / 576×1024 / 768×768). 2–5 s, 3 s by default: a 5 s Draft clip took about 19 min on an M1 Max. LTX's own sound, on by default;
  // Sound off removes it in our final encode (no price effect, the run is free).
  // DFR (2026-10-29, shared/ltxDfr.ts): the official DFR template, image to video only: 720p-class output (1280×704), optional third stage to 48 fps.
  'comfy-ltx25-video': h3({ maxResolution: '720p', resolutions: ['448p', '576p', '720p', LTX_DFR] /* 720p: Comfy Cloud route only (ROUTE_LIMITS); DFR: Comfy Cloud, or local with its files */, resolutionLabels: { '448p': 'Draft', '576p': 'Sharper', '720p': '720p', [LTX_DFR]: LTX_DFR_LABEL },
    resolutionHints: { [LTX_DFR]: LTX_DFR_HINT }, stageToggle: { field: LTX_DFR_SMOOTH_FIELD, label: LTX_DFR_SMOOTH_LABEL, hint: LTX_DFR_SMOOTH_HINT, resolution: LTX_DFR, modes: ['i2v'], default: true }, qualityOff: true, loop: true, minSeconds: 2, maxSeconds: 5, durationStep: 1, durations: [2, 3, 4, 5], defaultSeconds: 3, startShort: true,
    aspects: ['auto', '16:9', '9:16', '1:1'], audio: { supported: true, toggle: true, default: true, priceAffects: false, off: 'strip' }, refKinds: { image: 1 },
    source: 'workflows/ltx25-ti2v-api.json + ltx25-flf-api.json from the official Comfy templates video_ltx2_5_i2v / video_ltx2_5_flf2v (https://docs.comfy.org/tutorials/video/ltx/ltx-2-5): EmptyLTXVLatentVideo width/height step 32 (stage 1 = half size), length 8n + 1; 24 fps' }),
  // ComfyCloudMiniMaxH3*Node duration_seconds accepts 5–15 s (validator object_info); default stays 6 s (48 cr quoted before).
  // B1: our own H3 graph as a Comfy Cloud workflow job: the graph takes 2–15 s (the cloud-h3 API-node 5–15 s rule does not apply); t2v/i2v only.
  // DP 6d: Comfy Cloud workflow offered at 768p / 480p, 5 s or 10 s only (the graph takes 2–15 s, but the picker and the placeholder price are set for these two lengths).
  // Discrete set: resolveSeconds refuses anything else on quote AND submit (a UI 15 s job was charged 120 on :8797), so quote = charge.
  'cloud-h3-wf': h3({ minSeconds: 5, maxSeconds: 10, durationStep: 5, durations: [5, 10], defaultSeconds: 5, refKinds: { image: 1 }, verified: false, source: 'workflows/cloud/h3-*-api.json (our local H3 graph, fp16 VAE); offered at 5 s / 10 s, 768p / 480p (DP 6d, 2026-10-18)' }),
  // MiniMax H3 Fast · Comfy Cloud (2026-10-27): the official FastVideo FastH3 templates (comfy/h3FastCloud.ts). 2–10 s on H3's 17k + 5 grid at 24 fps, 768p (≈ 1.0 MP) or
  // 480p (the template's 0.4 MP), text or a start frame (the distilled checkpoint has no reference mode), its own sound.
  'cloud-h3-fast': h3({ minSeconds: 2, maxSeconds: 10, durationStep: 1, durations: range(2, 10), defaultSeconds: 5, aspects: ['auto', '16:9', '9:16', '1:1'], refKinds: { image: 1 }, qualityOff: true, verified: false,
    source: 'workflows/cloud/h3-fast-{t2v,i2v}-api.json from the official Comfy templates video_fastvideo_fasth3_t2v / _i2v (https://docs.comfy.org/tutorials/video/minimax/minimax-h3-fastvideo): ComfyMathExpression 17k + 5 frames at 24 fps, ResolutionSelector / ImageScaleToTotalPixels megapixels, 8 fixed steps' }),
  // MiniMax H3 Keyframes · Comfy Cloud (2026-10-27): the official multiframe template (comfy/h3KeyframesCloud.ts), the H3 card's Keyframes place. 5–15 s on H3's
  // 17k + 5 grid at 24 fps (its trained range), 768p (0.98 MP) or 480p (0.4 MP), ResolutionSelector shapes, 2–5 frames, its own sound.
  'cloud-h3-keyframes': h3({ minSeconds: 5, maxSeconds: 15, durationStep: 1, durations: range(5, 15), defaultSeconds: 5, aspects: ['auto', '16:9', '9:16', '4:3', '3:4', '1:1', '21:9'], refKinds: { image: 5 }, keyframes: H3KF_CAPS, verified: false,
    source: 'workflows/cloud/h3-multiframe-api.json from the official Comfy template video_minimax_h3_multiframe_reference (https://docs.comfy.org/tutorials/video/minimax/minimax-h3-multiframe): ComfyMathExpression 17k + 5 frames at 24 fps, Add Guide frame_idx = round(s × 24)' }),
  'cloud-h3': legacy({ minSeconds: 5, maxSeconds: 15, durationStep: 1, durations: range(5, 15), defaultSeconds: 6, source: 'ComfyCloudMiniMaxH3 nodes: duration_seconds 5–15 (object_info on :8190, 2026-10-18)' }),
  // Read from docs.comfy.org built-in node pages on 2026-10-17. Provider "adaptive" ratio = our 'auto'. Resolutions = the tiers we have a price row for.
  // Reference videos / audio (2026-10-24): Comfy Router takes them as video_url / audio_url content (reference_video / reference_audio, URL or data URI;
  // docs.comfy.org/development/comfy-router/models/minimax/minimax-h3/code). Limits from MinimaxHailuo03ReferenceNode: ≤3 clips each, 2–15 s per clip, 15 s in
  // total, video 23.976–60 fps, audio only next to an image or video reference. Reference video seconds bill at the output rate (Router pricing: "output
  // plus reference-video duration"). The formats aren't documented for H3: MP4 / MOV and MP3 / WAV only (what Seedance documents), so nothing odd is sent.
  // 4–15 s (2026-10-28): the Router's duration field takes 4 to 15 and refuses only outside it (comfy-docs pages/development/comfy-router/models/minimax/minimax-h3/code.md,
  // "duration"; built-in-nodes/MinimaxHailuo03ReferenceNode.md: 4–15). Default stays 5 s.
  'api-minimax-h3': h3({ maxResolution: '2K', resolutions: ['768p', '2K'], minSeconds: 4, durations: range(4, 15), defaultSeconds: 5, aspects: ['auto', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'], refKinds: { image: 9, video: 3, audio: 3 },
    refVideoSeconds: { minEach: 2, maxEach: 15, maxTotal: 15, billed: 'per second at the output rate', fps: [23.976, 60] }, refAudioSeconds: { minEach: 2, maxEach: 15, maxTotal: 15 },
    refFormats: { video: ['mp4', 'mov'], audio: ['mp3', 'wav'] }, audioNeedsVisualRef: true,
    source: 'https://docs.comfy.org/development/comfy-router/models/minimax/minimax-h3/code + https://docs.comfy.org/built-in-nodes/MinimaxHailuo03ReferenceNode (MiniMax H3: 4–15 s on Comfy Router, 768P/2K, 6 ratios + adaptive, refs 9 images / 3 videos / 3 audio, clips 2–15 s each and 15 s in total; 2026-10-24)' }),
  // The "1080p" tier is Kling's mode: pro (720p = mode: std; routerModels.ts router-kling), so the bar labels them Standard / Pro (2026-10-25).
  // Values stay 720p / 1080p: saved settings, the price rows (hostedPrices) and the job field keep working.
  // Kling 3.0 Omni (2026-10-25): text, first frame, first + end frame, or up to 7 reference images (KlingOmniProImageToVideoNode); aspect only without a frame.
  'router-kling': h3({ maxResolution: '1080p', resolutions: ['720p', '1080p'], resolutionLabels: { '720p': 'Standard', '1080p': 'Pro' }, minSeconds: 3, maxSeconds: 15, durations: range(3, 15), aspects: ['auto', '16:9', '9:16', '1:1'], refKinds: { image: 7 },
    audio: { supported: true, toggle: true, default: true, priceAffects: true, off: 'provider' },
    source: 'https://docs.comfy.org/development/comfy-router/models/kling/kling-v3-omni/code + https://docs.comfy.org/built-in-nodes/KlingOmniProImageToVideoNode (kling-v3-omni: duration 3–15 s, mode std / pro (720p / 1080p), aspect 16:9 / 9:16 / 1:1 without a first frame, first / end frame, up to 7 reference images, sound on / off; 2026-10-25)' }),
  // Wan 3.0 on Comfy Router (2026-10-25): 480P / 720P / 1080P, 2–30 s, ratio adaptive / 16:9 / 9:16 / 1:1 / 4:3 / 3:4, first (+ last) frame or up to 10 reference
  // images, sound on / off (parameters.audio, default true; the price doesn't change with it). Reference videos / audio need a public link: not offered.
  'router-wan3': h3({ maxResolution: '1080p', resolutions: ['720p', '480p', '1080p'], minSeconds: 2, maxSeconds: 30, durations: range(2, 30), defaultSeconds: 5, aspects: ['auto', '16:9', '9:16', '1:1', '4:3', '3:4'], refKinds: { image: 10 },
    audio: { supported: true, toggle: true, default: true, priceAffects: false, off: 'provider' },
    source: 'https://docs.comfy.org/development/comfy-router/models/wan/wan3-0-video/code (wan3.0-video: duration 2–30 s, 480P/720P/1080P, ratio adaptive + 5, media first_frame / last_frame or reference_image ≤10, audio default true; 2026-10-25)' }),
  // 1080p is 8 s only (2026-10-25): Google's Veo 3.1 takes 1080p at durationSeconds 8 (docs.comfy.org/development/comfy-router/models/veo/veo-3-1-generate-001).
  // 4K (2026-10-28): the Router's resolution field takes 720p / 1080p / 4k (comfy-docs pages/development/comfy-router/models/veo/veo-3-1-generate-001/code.md) and
  // 4K now has a rate (pages/development/comfy-router/pricing.md, Veo table: 4K column). Like 1080p, Google makes 4K at 8 s only.
  'router-veo': h3({ maxResolution: '4K', resolutions: ['720p', '1080p', '4K'], minSeconds: 4, maxSeconds: 8, durationStep: 2, durations: [4, 6, 8], durationsByResolution: { '1080p': [8], '4K': [8] }, aspects: ['auto', '16:9', '9:16'], refKinds: { image: 1 },
    audio: { supported: true, toggle: true, default: false, priceAffects: true, off: 'provider' },
    source: 'https://docs.comfy.org/built-in-nodes/Veo3VideoGenerationNode (veo-3.1-generate: duration_seconds 4–8 step 2, aspect 16:9/9:16, 720p/1080p/4k (4k priced on the Router pricing page, 2026-10-28), one image, generate_audio default false; 2026-10-17)' }),
  // Seedance 2.0 (2026-10-24): Router ratio enum adds 9:21; reference video = video_url (a public URL: the Router schema takes no base64 for video, mp4 / mov),
  // reference audio = audio_url (URL or data:audio/<format>, wav / mp3), never audio alone (docs.comfy.org/development/comfy-router/models/byteplus/
  // dreamina-seedance-2-0-260128/code). Counts and lengths from ByteDance2ReferenceNode: 9 / 3 / 3, every clip ≥ 1.8 s, videos and audio each ≤ 15.1 s in total.
  // 1080p kept: the Router schema's "2.0 does not support 1080p" note contradicts the same model's Router 1080p rate, Comfy's own Seedance 2.0 node
  // (480p/720p/1080p/4k) and BytePlus' 2.0 size table (byteplus.ts SIZES_20); it is true of 2.0 Fast / Mini only.
  'router-seedance': h3({ maxResolution: '1080p', resolutions: ['720p', '480p', '1080p'], aspects: ['auto', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9', '9:21'], refKinds: { image: 9, video: 3, audio: 3 },
    refVideoSeconds: { minEach: 1.8, maxTotal: 15.1, billed: 'input tokens' }, // video refs priced by their ffprobe length (videoInput rate)
    refAudioSeconds: { minEach: 1.8, maxTotal: 15.1 }, refFormats: { video: ['mp4', 'mov'], audio: ['mp3', 'wav'] }, audioNeedsVisualRef: true,
    audio: { supported: true, toggle: true, default: true, priceAffects: false, off: 'provider' },
    source: 'https://docs.comfy.org/development/comfy-router/models/byteplus/dreamina-seedance-2-0-260128/code + https://docs.comfy.org/built-in-nodes/ByteDance2ReferenceNode (Seedance 2.0: 4–15 s, 480p/720p/1080p (4k not priced), 7 ratios + adaptive, refs 9 images / 3 videos / 3 audio, clips ≥ 1.8 s, ≤ 15.1 s in total, generate_audio default true; 2026-10-24)' }),
  // Official lab APIs (batch 1, read 2026-10-23). LTX: docs.ltx.io/models/ltx-2-5 + ltx-2-3 (24 fps: Fast 6–20 s in steps of 2 at 720p/1080p, 6/8/10 s at 1440p/4K;
  // Pro 6/8/10 s; 2.5 aspects 16:9/9:16/1:1/3:2/2:3, 2.3 16:9/9:16; generate_audio on by default → off is sent to LTX). FLUX 3 Video: docs.bfl.ml/flux_3/flux3_video.
  // LTX API place: re-read docs.ltx.io/models/ltx-2-5 on 2026-10-28 and it still lists 6 / 8 / 10 s for ltx-2-5-pro, so this place keeps them (a provider rule).
  'direct-ltx-25-pro': ltx({ durations: [6, 8, 10], source: 'https://docs.ltx.io/models/ltx-2-5 (ltx-2-5-pro: 6/8/10 s at every resolution, 24 fps; read 2026-10-23, re-checked 2026-10-28)' }),
  // LTX-2.5 Pro on Comfy Router (2026-10-25): text to video only, 1280x720 / 720x1280 / 1920x1080 / 1080x1920 (ltx-2-5-pro in the Router schema).
  // Lengths (2026-10-28): 2, 3, 4, 5, 6, 8 or 10 s. The Router's duration enum lists 2–6, 8, 10, 12…20 (comfy-docs pages/development/comfy-router/models/ltx/
  // ltx-2-5-pro/code.md) and the partner-node guide caps Pro at 10 s (pages/tutorials/partner-nodes/lightricks/ltx-2-5.md). 7 and 9 are not in the enum.
  'router-ltx-25-pro': ltx({ maxResolution: '1080p', resolutions: ['1080p', '720p'], minSeconds: 2, maxSeconds: 10, durationStep: 1, durations: [2, 3, 4, 5, 6, 8, 10], aspects: ['auto', '16:9', '9:16'],
    source: 'https://docs.comfy.org/development/comfy-router/models/ltx/ltx-2-5-pro/code (ltx-2-5-pro: prompt only, 720p / 1080p at 16:9 or 9:16, duration 2–6 / 8 / 10 s, generate_audio default true) + https://docs.comfy.org/tutorials/partner-nodes/lightricks/ltx-2-5 (Pro: 2–10 s); 2026-10-28' }),
  // LTX-2.5 Pro / Fast partner node on Comfy Cloud (2026-10-27, comfy/ltx25ApiCloud.ts): image to video and first + last frame, LtxApi25ImageToVideo's own lists
  // (Comfy Cloud object_info 2026-10-26): Pro 2–6 / 8 / 10 s at 720p / 1080p; Fast adds 12–20 s (720p / 1080p only) and 1440p / 4K; 16:9 or 9:16; sound on by default.
  'cloud-ltx25-pro-api': ltx({ maxResolution: '1080p', resolutions: ['1080p', '720p'], minSeconds: 2, maxSeconds: 10, durationStep: 1, durations: [2, 3, 4, 5, 6, 8, 10], aspects: ['auto', '16:9', '9:16'], refKinds: { image: 1 },
    source: 'https://docs.comfy.org/tutorials/partner-nodes/lightricks/ltx-2-5 + Comfy Cloud object_info LtxApi25ImageToVideo (LTX-2.5 (Pro): 2–10 s, 1280x720 / 720x1280 / 1920x1080 / 1080x1920, 24 / 25 / 50 fps; 2026-10-27)' }),
  'cloud-ltx25-fast-api': ltx({ minSeconds: 2, maxSeconds: 20, durationStep: 1, durations: [2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20], aspects: ['auto', '16:9', '9:16'], refKinds: { image: 1 },
    source: 'https://docs.comfy.org/tutorials/partner-nodes/lightricks/ltx-2-5 + Comfy Cloud object_info LtxApi25ImageToVideo (LTX-2.5 (Fast): 2–20 s, over 10 s at 720p / 1080p and 24 / 25 fps, up to 3840x2160; 2026-10-27)' }),
  'direct-ltx-25-fast': ltx({ source: 'https://docs.ltx.io/models/ltx-2-5 (ltx-2-5-fast: 6–20 s at 720p/1080p, 6/8/10 s at 1440p/4K, 24 fps; read 2026-10-23)' }),
  'direct-ltx-23-fast': ltx({ aspects: ['auto', '16:9', '9:16'], source: 'https://docs.ltx.io/models/ltx-2-3 (ltx-2-3-fast: 16:9 / 9:16, 6–20 s at 720p/1080p, 6/8/10 s at 1440p/4K; read 2026-10-23)' }),
  'direct-flux3-video': h3({ maxResolution: '4K', resolutions: ['1080p', '720p', '1440p', '4K'], minSeconds: 5, maxSeconds: 20, durations: range(5, 20), defaultSeconds: 5, aspects: ['auto', '16:9', '9:16', '4:3', '3:4', '1:1', '21:9'], refKinds: {},
    audio: { supported: true, toggle: true, default: true, priceAffects: false, off: 'provider' }, source: 'https://docs.bfl.ml/flux_3/flux3_video (t2v / i2v keyframes, 5–20 s, hd/fhd/qhd/uhd, aspect_ratio, generate_audio default true; read 2026-10-23)' }),
  // FLUX 3 Video on Comfy Router (2026-10-25): the BFL schema; no draft, no reference images. 1440p / 4K added 2026-10-28: the Router's resolution field takes
  // hd / fhd / qhd / uhd (comfy-docs pages/development/comfy-router/models/black-forest-labs/flux-3-video/code.md); rates in hostedPrices (estimated).
  'router-flux3-video': h3({ maxResolution: '4K', resolutions: ['1080p', '720p', '1440p', '4K'], minSeconds: 5, maxSeconds: 20, durations: range(5, 20), defaultSeconds: 5, aspects: ['auto', '16:9', '9:16', '4:3', '3:4', '1:1', '21:9'], refKinds: {},
    audio: { supported: true, toggle: true, default: true, priceAffects: false, off: 'provider' }, source: 'https://docs.comfy.org/development/comfy-router/models/black-forest-labs/flux-3-video/code (mode t2v / i2v keyframes, 5–20 s, hd / fhd / qhd / uhd, aspect_ratio, generate_audio default true; 2026-10-25)' }),
};
// Comfy Router places of Seedance 2.5 / 2.0 Fast / 2.0 Mini and Veo 3.1 Fast (2026-10-25). The same models as the BytePlus routes (direct-seedance-*),
// another Run on place. All four Seedance Router pages serve ONE BytePlus schema (router-schemas audit: request bodies identical); the limits live in the
// field text and in ByteDance2ReferenceNode. Default 5 s like the BytePlus place of the same model, so switching place keeps the length.
//  - 2.0 Fast / Mini: Seedance 2.0's set minus 1080p ("2.0, 2.0 fast & 2.0 mini do not support 1080p"; the node: "resolution is limited to 480p and
//    720p"); refs 9 images / 3 videos / 3 audio, clips ≥ 1.8 s, ≤ 15.1 s in total, no audio alone.
//  - 2.5: 4–30 s, 480p/720p/1080p, refs 30 images / 10 audio (audio alone allowed). Reference videos are not offered: 2.5 takes up to 10, but no total
//    length is published for 2.5 (only "the model's limit"; 15.1 s is the 2.0 figure), so a job could not be checked or quoted ahead.
//  - Veo 3.1 Fast: Veo 3.1's set (4 / 6 / 8 s, 1080p is 8 s only, 16:9 / 9:16, one image), docs.comfy.org/development/comfy-router/models/veo/veo-3-1-fast-generate-001.
const SD_ROUTER_DOC = (m: string) => `https://docs.comfy.org/development/comfy-router/models/byteplus/${m}/code + https://docs.comfy.org/built-in-nodes/ByteDance2ReferenceNode`;
VIDEO_LIMITS['router-seedance-20-fast'] = { ...VIDEO_LIMITS['router-seedance'], maxResolution: '720p', resolutions: ['720p', '480p'], defaultSeconds: 5,
  source: `${SD_ROUTER_DOC('dreamina-seedance-2-0-fast-260128')} (Seedance 2.0 Fast: 4–15 s, 480p/720p, 7 ratios + adaptive, refs 9 images / 3 videos / 3 audio, clips ≥ 1.8 s, ≤ 15.1 s in total; 2026-10-25)` };
VIDEO_LIMITS['router-seedance-20-mini'] = { ...VIDEO_LIMITS['router-seedance-20-fast'],
  source: `${SD_ROUTER_DOC('dreamina-seedance-2-0-mini')} (Seedance 2.0 Mini: 4–15 s, 480p/720p, 7 ratios + adaptive, refs 9 images / 3 videos / 3 audio, clips ≥ 1.8 s, ≤ 15.1 s in total; 2026-10-25)` };
VIDEO_LIMITS['router-seedance-25'] = h3({ maxResolution: '1080p', resolutions: ['720p', '480p', '1080p'], defaultSeconds: 5, maxSeconds: 30, durations: range(4, 30), aspects: [...VIDEO_LIMITS['router-seedance'].aspects],
  refKinds: { image: 30, audio: 10 }, refFormats: { audio: ['mp3', 'wav'] }, audio: { supported: true, toggle: true, default: true, priceAffects: false, off: 'provider' },
  source: `${SD_ROUTER_DOC('dreamina-seedance-2-5-260628')} (Seedance 2.5: 4–30 s, 480p/720p/1080p, 7 ratios + adaptive (first-frame jobs: adaptive only), refs 30 images / 10 audio, audio alone allowed; 2026-10-25)` });
// Video Swap on Comfy Router (2026-10-25, shared/cloudSwap.ts): the swap range is the job's length. Kling edits ≤ 10 s a request (longer ranges run as joined
// passes), so 4–30 s in all; Seedance 2.5 edits up to 30 s of input in one pass. Qualities: Kling std / pro (720p / 1080p), Seedance 480p / 720p / 1080p.
VIDEO_LIMITS['router-kling-edit'] = h3({ maxResolution: '1080p', resolutions: ['720p', '1080p'], resolutionLabels: { '720p': 'Standard', '1080p': 'Pro' }, minSeconds: 4, maxSeconds: 30, durations: range(4, 30), defaultSeconds: 8,
  aspects: ['auto'], refKinds: { image: 1 }, audio: { supported: true, toggle: true, default: true, priceAffects: false, off: 'strip' },
  source: 'https://docs.comfy.org/development/comfy-router/models/kling/kling-v3-omni/code + https://docs.comfy.org/built-in-nodes/KlingOmniProEditVideoNode (video edit: clip 3–10.05 s, 720–2160 px, 24–60 fps, ≤ 4 images, output = clip length; std / pro; 2026-10-25)' });
VIDEO_LIMITS['router-seedance-25-edit'] = h3({ maxResolution: '1080p', resolutions: ['720p', '480p', '1080p'], minSeconds: 4, maxSeconds: 30, durations: range(4, 30), defaultSeconds: 8, aspects: ['auto'],
  refKinds: { image: 1 }, audio: { supported: true, toggle: true, default: true, priceAffects: false, off: 'strip' },
  source: `${SD_ROUTER_DOC('dreamina-seedance-2-5-260628')} (video edit: reference video ≥ 2 s, input ≤ 30 s in total, duration -1, public URL only; 480p/720p/1080p; 2026-10-25)` });
VIDEO_LIMITS['router-veo-fast'] = { ...VIDEO_LIMITS['router-veo'],
  source: 'https://docs.comfy.org/development/comfy-router/models/veo/veo-3-1-fast-generate-001/code (veo-3.1-fast-generate-001: durationSeconds 4 / 6 / 8, 1080p and 4K at 8 s only (Google), aspect 16:9/9:16, 720p/1080p/4K, one image, priced by sound on/off; 2026-10-25)' };
// Comfy Router video models (2026-10-31). Each from its Router page's "Schema → Input" (docs.comfy.org/development/comfy-router/models/<id>/code) and the
// Router pricing page (resolutions = the tiers with a rate). 1 s is not offered on P-Video-2 / Grok Lite: Generate Video's length list starts at 2 s.
//  - Veo 3.1 Lite: Veo 3.1's schema; 720p / 1080p (no 4K rate; Google's launch post: 720p and 1080p, 4 / 6 / 8 s, 16:9 / 9:16); 1080p at 8 s, as Veo 3.1.
//  - Wan 3.0 Prime: Wan 3.0's schema and limits.
//  - P-Video-2: duration 1–20 s, 720p / 1080p, aspect 16:9 / 9:16 / 4:3 / 3:4 / 1:1 (+ 3:2 / 2:3, not on our list; ignored with an image), first + last
//    frame, sound kept or not (save_audio; the price doesn't change). Audio-driven input and Draft are not offered (routerModels.ts).
//  - Grok Imagine Video 1.5 Lite: duration 1–15 s, 480p / 720p / 1080p (pricing rows), aspect 1:1 / 16:9 / 9:16 / 4:3 / 3:4 (+ 3:2 / 2:3), one start image;
//    sound always on: a real run (2026-10-31) returned an audio stream and the schema has no audio switch, so there is no Sound toggle (same price).
VIDEO_LIMITS['router-veo-lite'] = { ...VIDEO_LIMITS['router-veo'], maxResolution: '1080p', resolutions: ['720p', '1080p'], durationsByResolution: { '1080p': [8] },
  source: 'https://docs.comfy.org/development/comfy-router/models/veo/veo-3-1-lite-generate-001/code (veo-3.1-lite-generate-001: Veo 3.1 schema; 720p / 1080p priced, no 4K; durationSeconds 4 / 6 / 8, 1080p at 8 s; aspect 16:9 / 9:16; one image; priced by sound on/off) + https://blog.google/innovation-and-ai/technology/ai/veo-3-1-lite/ (2026-10-31)' };
VIDEO_LIMITS['router-wan3-prime'] = { ...VIDEO_LIMITS['router-wan3'],
  source: 'https://docs.comfy.org/development/comfy-router/models/wan/wan3-0-video-prime/code (wan3.0-video-prime: the Wan 3.0 schema, duration 2–30 s, 480P/720P/1080P, ratio adaptive + 5, media first_frame / last_frame or reference_image ≤10, audio default true; 2026-10-31)' };
VIDEO_LIMITS['router-pvideo2'] = h3({ maxResolution: '1080p', resolutions: ['720p', '1080p'], minSeconds: 2, maxSeconds: 20, durations: range(2, 20), defaultSeconds: 5, aspects: ['auto', '16:9', '9:16', '4:3', '3:4', '1:1'], refKinds: { image: 1 },
  audio: { supported: true, toggle: true, default: true, priceAffects: false, off: 'provider' },
  source: 'https://docs.comfy.org/development/comfy-router/models/pruna/p-video-2/code (p-video-2: duration 1–20 s, 720p / 1080p, aspect_ratio 7 values, image + last_frame_image, save_audio default true, fps 24 / 48; 2026-10-31)' });
VIDEO_LIMITS['router-grok-video-lite'] = h3({ maxResolution: '1080p', resolutions: ['720p', '480p', '1080p'], minSeconds: 2, maxSeconds: 15, durations: range(2, 15), defaultSeconds: 5, aspects: ['auto', '16:9', '9:16', '4:3', '3:4', '1:1'], refKinds: { image: 1 },
  audio: { supported: true, toggle: false, default: true, priceAffects: false, off: 'provider' },
  source: 'https://docs.comfy.org/development/comfy-router/models/xai/grok-imagine-video-1-5-lite/code (grok-imagine-video-1.5-lite: duration 1–15 s, aspect_ratio 7 values, image (data URI ok), no audio field; a real run returned sound) + https://docs.comfy.org/development/comfy-router/pricing (480p / 720p / 1080p rates; 2026-10-31)' });
/** Route-level narrowing for comfy-h3 routes (routeId → limits). Aspect applies to text-to-video; image modes follow the frame ('auto'). */
export const ROUTE_LIMITS: Record<string, Partial<VideoLimits>> = {
  // 2026-10-27: the Comfy Cloud twin (comfy/ltx25Cloud.ts) adds 720p (1280×704 / 704×1280 / 960×960); the Mac keeps Draft / Sharper.
  'comfy-cloud:cloud-ltx25-video': { aspects: ['auto', '16:9', '9:16', '1:1'], refKinds: { image: 1 }, resolutions: ['448p', '576p', '720p', LTX_DFR], maxResolution: '720p', source: 'workflows/cloud/ltx25-{ti2v,flf}-api.json (official template files on Comfy Cloud; 720p = 1280×704 on the 64 grid)' },
  'local:comfy-ltx25-video': { aspects: ['auto', '16:9', '9:16', '1:1'], refKinds: { image: 1 }, resolutions: ['448p', '576p', LTX_DFR] /* DFR: when its files are here (the weights gate) */, maxResolution: '576p', source: 'workflows/ltx25-ti2v-api.json + ltx25-flf-api.json (16:9 / 9:16 / 1:1 sizes; with a start frame, Auto follows its shape)' },
  'local:comfy-wan22-5b': { aspects: ['auto', '16:9', '9:16', '1:1'], refKinds: { image: 1 }, source: 'workflows/wan22-ti2v-5b-api.json (16:9 / 9:16 / 1:1 sizes; image to video follows the start frame)' },
  'local:comfy-h3': { aspects: ['auto', '16:9', '9:16', '1:1'], refKinds: { image: 2 }, source: 'workflows/h3-*-api.json (ResolutionSelector 16:9/9:16/1:1; h3-r2v has 2 ref_images slots)' },
  // fal's H3 input schemas take duration 5–15 (minimum 5; fal.ai/api/openapi/queue/openapi.json?endpoint_id=minimax/h3/*, read 2026-10-26): a 4 s job goes to another place.
  'fal:minimax/h3/text-to-video': { aspects: ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], refKinds: {}, durations: range(5, 15) },
  'fal:minimax/h3/image-to-video': { aspects: ['auto'], refKinds: { image: 2 }, durations: range(5, 15) },
  'fal:minimax/h3/reference-to-video': { aspects: ['auto'], refKinds: { image: 9, video: 3, audio: 3 }, durations: range(5, 15) },
  // MiniMax direct v2 (comfy-h3 engine; platform.minimax.io video-generation-v2-create, 2026-10-23): reference images ≤9 and audio ≤3; reference videos are not offered here (billed per input second, no rate published).
  'direct:minimax/h3': { aspects: ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], refKinds: { image: 9, audio: 3 } },
  'replicate:minimax/h3': { aspects: ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], resolutions: ['768p'], refKinds: { image: 9, video: 3, audio: 3 } },
};
export const limitsFor = (providerId: string) => VIDEO_LIMITS[providerId] ?? null;
/** Resolution as asked by `resolution` or `quality` (quality is also H3's fast/quality speed, so only a tier-looking value counts),
 *  matched case-insensitively to the model's own tiers ('1080P' → '1080p', '2k' → '2K'). undefined = not asked; null = asked but not a tier of this model. */
export const RES_LIKE = /^(\d{3,4}p|\dk)$/i;
export function resolveResolution(L: VideoLimits, resolution?: string, quality?: string): string | null | undefined {
  const asked = (resolution && String(resolution).trim()) || (quality && RES_LIKE.test(String(quality).trim()) ? String(quality).trim() : '');
  if (!asked) return undefined; return L.resolutions.find((r) => r.toLowerCase() === asked.toLowerCase()) ?? (resolutionMap(L, asked)?.to ?? null);
}
/** D5 (2026-10-28): a resolution tier the model doesn't make → the nearest one it does, with a note. null = nothing to snap (asked a tier it has,
 *  asked nothing, or nothing comparable). Used where resolveResolution says null (quote and submit). */
export function snapResolution(L: VideoLimits, resolution?: string, quality?: string): { to: string; note: string } | null {
  const asked = (resolution && String(resolution).trim()) || (quality && RES_LIKE.test(String(quality).trim()) ? String(quality).trim() : '');
  if (!asked || resolveResolution(L, resolution, quality) !== null) return null;
  const to = nearestTier(L.resolutions, asked); return to ? { to, note: snapNote('size', asked, to) } : null;
}
/** 720p asked on a model whose tiers are 768p/480p (MiniMax H3: Comfy Cloud workflow, local, partner): run and bill it as 768p, and say so. */
export function resolutionMap(L: VideoLimits, resolution?: string, quality?: string): { from: string; to: string; message: string } | null {
  const asked = String((resolution && String(resolution).trim()) || (quality && RES_LIKE.test(String(quality).trim()) ? String(quality).trim() : '')).toLowerCase();
  const to = L.resolutions.includes('768p') ? '768p' : L.resolutions.includes('704p') ? '704p' : null; // MiniMax H3 768p, Wan 2.2 5B 704p
  if (asked !== '720p' || L.resolutions.some((r) => r.toLowerCase() === '720p') || !to) return null;
  return { from: '720p', to, message: `This model has no 720p tier: 720p was mapped to ${to} (quoted and charged as ${to}). Send resolution=${to} to set it directly.` };
}
/** UI caps block for /api/models and route caps. */
export const videoCapsBlock = (l: VideoLimits) => ({ maxResolution: l.maxResolution, resolutions: l.resolutions, minSeconds: l.minSeconds, maxSeconds: l.maxSeconds,
  duration: { min: l.minSeconds, max: l.maxSeconds, step: l.durationStep, values: l.durations } as DurationSpec, durations: l.durations, aspects: l.aspects, audio: l.audio,
  refKinds: Object.keys(l.refKinds), refMax: l.refKinds, ...(l.refVideoSeconds ? { refVideoSeconds: l.refVideoSeconds } : {}), ...(l.refAudioSeconds ? { refAudioSeconds: l.refAudioSeconds } : {}),
  ...(l.refFormats ? { refFormats: l.refFormats } : {}), ...(l.durationsByResolution ? { durationsByResolution: l.durationsByResolution } : {}), ...(l.resolutionLabels ? { resolutionLabels: l.resolutionLabels } : {}), ...(l.resolutionHints ? { resolutionHints: l.resolutionHints } : {}), ...(l.stageToggle ? { stageToggle: l.stageToggle } : {}), ...(l.keyframes ? { keyframes: l.keyframes } : {}), ...(l.qualityOff ? { quality: false } : {}), ...(l.loop ? { loop: true } : {}), ...(l.audioNeedsVisualRef ? { audioNeedsVisualRef: true } : {}), bitrate: l.bitrate, bitratePriceAffects: false, verified: l.verified, source: l.source, ...(l.startShort ? { defaultSeconds: defaultSecondsFor(l), startShort: true } : {}) });
/** Route caps keep `audio` boolean (native audio track, "Audio on" badge); the on/off toggle detail is `audioToggle`. */
export const routeCaps = (routeId: string, base: VideoLimits) => { const rl = ROUTE_LIMITS[routeId] ?? {}; const c: any = videoCapsBlock({ ...base, ...rl, ...(rl.durations ? { minSeconds: Math.min(...rl.durations), maxSeconds: Math.max(...rl.durations) } : {}) } as VideoLimits); return { ...c, audio: !!c.audio?.supported, audioToggle: c.audio }; };
/** Why this route can't serve the job's aspect / reference kinds (null = fine). */
export function routeVideoReason(routeId: string, i: Record<string, any>): string | null {
  const r = ROUTE_LIMITS[routeId]; if (!r) return null;
  if (r.aspects && i.aspect && i.aspect !== 'auto' && !r.aspects.includes(i.aspect)) return `This route doesn't do ${i.aspect}; it does ${r.aspects.join(', ')}`;
  // a route narrower than its model on length (fal H3: 5–15 s): refused here, so Auto picks another place instead of sending a body the provider refuses
  if (r.durations && i.duration != null && Number.isFinite(Number(i.duration)) && !r.durations.includes(Number(i.duration))) return `This route doesn't do ${i.duration} s; it does ${r.durations[0]}–${r.durations[r.durations.length - 1]} s`;
  const k = r.refKinds; if (k) for (const [kind, n] of [['image', (i.refPaths ?? []).length], ['video', (i.refVideoPaths ?? []).length], ['audio', (i.refAudioPaths ?? []).length]] as const) {
    if (kind === 'image' && i.mode !== 'r2v') continue; if (n > ((k as any)[kind] ?? 0)) { const max = (k as any)[kind] ?? 0; return max ? `This route takes up to ${max} ${kind} reference${max === 1 ? '' : 's'}; you added ${n}` : `This route doesn't take ${kind} references`; } }
  return null;
}
/** Our final encode: bitrate (crf) and/or audio off. Rewrites each mp4 output in place. No price effect. */
export async function postEncode(job: { id: string; input: Record<string, any>; outputs: { url: string }[] }) {
  const i = job.input; const strip = i.audio === false && i.audioOff === 'strip'; const b = BITRATES.find((x) => x.value === i.bitrate);
  if ((!b && !strip) || (job as any)._encoded) return; (job as any)._encoded = true; (i.notes ??= []); const J = job as any; const was = J.status; if (was === 'done') { J.status = 'running'; J.stage = 'encoding'; J.progress = 99; }
  try {
  for (const o of job.outputs ?? []) {
    if (!/\.mp4$/i.test(o.url)) continue; const src = path.join(DATA_DIR, path.basename(o.url)); const tmp = src.replace(/\.mp4$/i, '.enc.mp4');
    const args = ['-y', '-v', 'error', '-i', src, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(b?.crf ?? 23), '-pix_fmt', 'yuv420p', ...(strip ? ['-an'] : ['-c:a', 'copy']), '-movflags', '+faststart', tmp];
    if ((await runFfmpeg(args)) === 0) { await (await import('node:fs/promises')).rename(tmp, src); i.notes.push(`encoded: ${b?.value ?? 'standard'} (crf ${b?.crf ?? 23})${strip ? ', audio removed' : ''}`); }
  }
  } finally { if (was === 'done') { J.status = 'done'; J.stage = 'done'; J.progress = 100; } }
}

/** Video preset library (GET /api/video-presets): the camera_motion_h3 moves (prompt-only on Generate Video; the LoRA itself runs in Camera Moves, local)
 * plus the 12 Style looks (videoLooks.ts). Camera posters: own procedural art (scripts/gen-example-media.py --video-presets → samples/presets/video-<cameraId>.jpg);
 * Style covers: real local stills of each look (examples/covers/video-looks). Sent as job field `videoPreset`; removed look ids are `aliases` of the kept one. */
import { H3_CAMERA_MOVES, cameraPrompt, H3_INTENSITY } from './catalog.js';
import { VIDEO_LOOKS, VIDEO_LOOK_ALIASES, VIDEO_LOOK_COVER_MODEL, videoLookCover, videoLookId } from './videoLooks.js';
export function videoPresets() {
  const camera = H3_CAMERA_MOVES.map(([id, label, move]) => ({ id, kind: 'camera', label, prompt: cameraPrompt(move, 'slow'), intensities: Object.keys(H3_INTENSITY), posterUrl: `/samples/presets/video-${id}.jpg`,
    loraTool: { toolId: 'camera', provider: 'comfy-h3-camera', note: 'the camera_motion_h3 LoRA version runs locally in Camera Moves' } }));
  const style = VIDEO_LOOKS.map((s) => { const aliases = Object.keys(VIDEO_LOOK_ALIASES).filter((a) => VIDEO_LOOK_ALIASES[a] === s.id).map((a) => `style-${a}`);
    return { id: `style-${s.id}`, kind: 'style', label: s.label, description: s.description, prompt: s.prompt, posterUrl: videoLookCover(s.id), posterNote: `Preview still made with ${VIDEO_LOOK_COVER_MODEL}`, ...(aliases.length ? { aliases } : {}) }; });
  return [...camera, ...style];
}
/** By id, or by a removed look's old id (VIDEO_LOOK_ALIASES): old jobs, Recreate and MCP calls keep working on the kept look. */
export const videoPresetById = (id: string) => { const k = videoLookId(String(id ?? '').trim()); return videoPresets().find((p) => p.id === k) ?? null; };
/** Default clip length when the caller sends none: used by the H3 job parser AND the price quote (quote = charge). */
export const defaultSecondsFor = (L: { durations: number[]; defaultSeconds?: number }) => L.defaultSeconds ?? L.durations.find((d) => d >= 4) ?? L.durations[0];
/** ONE duration rule for quote AND submit (quote = charge). Allowed clip lengths per tool × model:
 *  - a model with a videoCaps row (VIDEO_LIMITS: Veo 4/6/8, Kling 3–15, Seedance 4–15, H3 4–15, cloud-h3-wf 5/10 …) → its `durations`;
 *  - Director (cinema) on its local models (LTX-2 comfy-open, Wan Fun Camera) → CINEMA_LOCAL_DURATIONS;
 *  - anything else → null (no table: any 1–60 s is accepted).
 *  Exposed on /api/routes (routes[].durations), /api/tools providers[].durations and Director app.capabilities.durationsByProvider. */
export const CINEMA_LOCAL_DURATIONS = [5, 10, 15, 20, 30];
/** Tool-level lengths for the models WITHOUT a videoCaps row (local graphs): toolId → {durations, default}. Director registers here;
 *  so does every image→video app with `durations` (Camera Moves 3/5 s on Wan Fun Camera, LTX-2, H3 camera LoRA; Photo FX 5 s on Wan I2V).
 *  Hosted models in the same tool always use their own videoCaps row (Veo 4/6/8, Kling 3–15, Seedance 4–15). */
const TOOL_DURATIONS = new Map<string, { durations: number[]; def: number }>([['cinema', { durations: CINEMA_LOCAL_DURATIONS, def: 5 }]]);
export const registerToolDurations = (toolId: string, durations: number[], def = durations[durations.length - 1]) => { TOOL_DURATIONS.set(toolId, { durations: [...durations], def }); };
export const hasToolDurations = (toolId: string | undefined) => !!toolId && TOOL_DURATIONS.has(toolId);
/** One tool's per-model lengths (2026-10-27: the Audio tool's music / sound models, tools/media.ts AUDIO_LENGTHS). Scoped to that tool, so the same
 *  model elsewhere (Add soundtrack: the clip's own length) keeps its rule. An empty list = no length field (not checked here). */
const TOOL_PROVIDER_DURATIONS = new Map<string, Record<string, number[]>>();
export const registerToolProviderDurations = (toolId: string, byProvider: Record<string, number[]>) => { TOOL_PROVIDER_DURATIONS.set(toolId, Object.fromEntries(Object.entries(byProvider).filter(([, v]) => v.length).map(([k, v]) => [k, [...v]]))); };
/** Models with their own fixed lengths but no videoCaps row. cloud-ltx-camera mirrors the local LTX-2 camera graph (Camera Moves 3 / 5 s) on Comfy Cloud. */
export const PROVIDER_DURATIONS: Record<string, number[]> = { 'cloud-ltx-camera': [3, 5] };
/** `resolution` narrows a model's lengths where it has a per-resolution rule (durationsByResolution, Veo 3.1 1080p = 8 s). */
const byRes = (L: VideoLimits, resolution?: string) => { const r = resolution ? String(resolution).trim().toLowerCase() : ''; const k = r ? Object.keys(L.durationsByResolution ?? {}).find((x) => x.toLowerCase() === r) : undefined; return k ? L.durationsByResolution![k] : null; };
export function durationsFor(toolId: string | undefined, providerId: string | undefined, resolution?: string): number[] | null {
  const L = providerId ? VIDEO_LIMITS[providerId] : undefined; if (L) return [...(byRes(L, resolution) ?? L.durations)];
  const P = providerId ? PROVIDER_DURATIONS[providerId] : undefined; if (P) return [...P];
  const TP = toolId && providerId ? TOOL_PROVIDER_DURATIONS.get(toolId)?.[providerId] : undefined; if (TP) return [...TP];
  const T = toolId ? TOOL_DURATIONS.get(toolId) : undefined; return T ? [...T.durations] : null;
}
/** Default length when none is asked, same on quote and submit: the tool's default where the model allows it (Director 5 s, Camera Moves 5 s), else the model's own default. */
export function defaultDurationFor(toolId: string | undefined, providerId: string | undefined): number | undefined {
  const L = providerId ? VIDEO_LIMITS[providerId] : undefined; const d = durationsFor(toolId, providerId); const T = toolId ? TOOL_DURATIONS.get(toolId) : undefined;
  if (T && d?.includes(T.def)) return T.def;
  return L ? defaultSecondsFor(L) : d?.[0];
}
/** Per provider of a tool: {providerId: allowed lengths} and {providerId: default} (app.capabilities.durationsByProvider / defaultDurationByProvider). */
export const durationsByProvider = (toolId: string, providers: string[]) => Object.fromEntries(providers.map((p) => [p, durationsFor(toolId, p)]));
export const defaultDurationByProvider = (toolId: string, providers: string[]) => Object.fromEntries(providers.map((p) => [p, defaultDurationFor(toolId, p)]));
export type DurationError = { error: string; code: 'invalid_duration'; durations: number[] | null; min: number; max: number };
/** `seconds` (alias `duration`) on a price quote AND a job submit. undefined = not asked; a length the model does not offer snaps to the nearest one (with a note, D5); DurationError only for a non-number. */
export type DurationOk = { seconds: number; snapped?: { from: number; to: number; note: string } };
/** Apply a resolved length's snap note to a job / quote input (adjust notes + warnings). */
export const noteSnap = (input: Record<string, any>, r: DurationOk | DurationError | undefined) => { if (r && !('error' in r) && r.snapped) addAdjustNote(input, r.snapped.note); };
export function resolveDuration(toolId: string | undefined, providerId: string | undefined, raw: unknown, resolution?: string): DurationOk | DurationError | undefined {
  if (raw == null || raw === '') return undefined; const s = Number(raw); const list = durationsFor(toolId, providerId, resolution);
  const L = providerId ? VIDEO_LIMITS[providerId] : undefined; const at = L && byRes(L, resolution) ? ` at ${resolution}` : ''; // per-resolution rule: say which resolution limits it
  const min = list ? Math.min(...list) : 1, max = list ? Math.max(...list) : 60;
  if (!Number.isFinite(s) || s <= 0) return { error: list ? `Duration ${raw} s isn't available for this model${at}. Allowed: ${list.join(', ')} s.` : `Duration must be ${min}–${max} s.`, code: 'invalid_duration', durations: list, min, max };
  // D5 (user decision 2026-10-28): a length the model doesn't offer is made at the nearest one it does, with a note (never refused)
  if (list && !list.includes(s)) { const to = nearestNumber(list, s); return { seconds: to, snapped: { from: s, to, note: snapNote('length', `${Math.round(s * 100) / 100} s`, `${to} s`, at.trim() || undefined) } }; }
  if (s < min || s > max) { const to = Math.min(max, Math.max(min, s)); return { seconds: to, snapped: { from: s, to, note: snapNote('length', `${Math.round(s * 100) / 100} s`, `${to} s`) } }; }
  return { seconds: Math.round(s * 100) / 100 };
}
/** 400 body for an invalid duration (identical on quote and submit). */
export const durationErrorBody = (e: DurationError, field: 'seconds' | 'duration' = 'duration') => ({ error: e.error, errorType: 'validation', code: e.code, issues: [{ code: e.code, field, message: e.error }], durations: e.durations, allowedDurations: e.durations, minSeconds: e.min, maxSeconds: e.max });
/** Back-compat: model-only resolver (tool-agnostic callers). */
export const resolveSeconds = (providerId: string | undefined, raw: unknown) => resolveDuration(undefined, providerId, raw);
