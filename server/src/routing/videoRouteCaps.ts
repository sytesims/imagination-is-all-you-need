/**
 * videoCaps for every non-H3 video model route (H3 routes keep tools/h3/videoCaps.ts). One shape for the UI:
 *   { durations: number[] | null, minSeconds, maxSeconds, aspects: string[] | null, resolutions: string[] | null, audio: {supported, toggle, default, passthrough} | null,
 *     refKinds: string[], refMax: {image?, video?, audio?}, inputLimits?, sourceUrl, checkedAt, verified }
 * Only what the official page states; anything the page doesn't state is null (never guessed). Processing routes (upscale, interpolation, matting, reframe)
 * take one source video and keep its length, so durations=null and the limit (if documented) is maxSeconds / inputLimits.
 */
import { VIDEO_LIMITS } from '../tools/h3/videoCaps.js';
import { RAY32_ASPECTS, RAY32_REFRAME_MAX_SEC } from './routerModels.js';
export interface RouteVideoCaps {
  durations: number[] | null; minSeconds: number | null; maxSeconds: number | null; aspects: string[] | null; resolutions: string[] | null;
  audio: { supported: boolean; toggle: boolean; default: boolean | null; passthrough: boolean | null } | null; refKinds: string[]; refMax: { image?: number; video?: number; audio?: number };
  inputLimits?: Record<string, unknown>; sourceUrl: string; checkedAt: string; verified: boolean; note?: string;
}
const D = '2026-10-17';
const fromLimits = (id: string, note?: string): RouteVideoCaps => { const L = VIDEO_LIMITS[id];
  return { durations: L.durations, minSeconds: L.minSeconds, maxSeconds: L.maxSeconds, aspects: L.aspects, resolutions: L.resolutions,
    audio: { supported: L.audio.supported, toggle: L.audio.toggle, default: L.audio.default, passthrough: false }, refKinds: Object.keys(L.refKinds), refMax: L.refKinds,
    ...(L.refVideoSeconds ? { inputLimits: { refVideoSeconds: L.refVideoSeconds } } : {}), sourceUrl: L.source.match(/https?:\/\/\S+/)?.[0] ?? L.source, checkedAt: D, verified: L.verified, ...(note ? { note } : {}) }; };
const proc = (o: Partial<RouteVideoCaps> & { sourceUrl: string }): RouteVideoCaps => ({ durations: null, minSeconds: null, maxSeconds: null, aspects: null, resolutions: null, audio: null,
  refKinds: ['video'], refMax: { video: 1 }, checkedAt: D, verified: true, ...o });
export const ROUTE_VIDEO_CAPS: Record<string, RouteVideoCaps> = {
  // Generative (docs.comfy.org partner-node pages, same text as VIDEO_LIMITS)
  'comfy-router:router-kling': fromLimits('router-kling'),
  'comfy-router:router-wan3': fromLimits('router-wan3'), // Wan 3.0, 2026-10-25
  'comfy-router:router-veo': fromLimits('router-veo'),
  'comfy-router:router-seedance': fromLimits('router-seedance'),
  'comfy-cloud:cloud-ltx25-pro-api': fromLimits('cloud-ltx25-pro-api'), 'comfy-cloud:cloud-ltx25-fast-api': fromLimits('cloud-ltx25-fast-api'), // LTX-2.5 partner node on Comfy Cloud (image jobs), 2026-10-27
  'comfy-router:router-ltx-25-pro': fromLimits('router-ltx-25-pro'), 'comfy-router:router-flux3-video': fromLimits('router-flux3-video'), // Router places of LTX-2.5 Pro / FLUX 3 Video, 2026-10-25
  // Comfy Router places of Seedance 2.5 / 2.0 Fast / 2.0 Mini and Veo 3.1 Fast (2026-10-25)
  'comfy-router:router-kling-edit': fromLimits('router-kling-edit'), 'comfy-router:router-seedance-25-edit': fromLimits('router-seedance-25-edit'), // Video Swap (2026-10-25)
  'comfy-router:router-seedance-25': fromLimits('router-seedance-25'), 'comfy-router:router-seedance-20-fast': fromLimits('router-seedance-20-fast'),
  'comfy-router:router-seedance-20-mini': fromLimits('router-seedance-20-mini'), 'comfy-router:router-veo-fast': fromLimits('router-veo-fast'),
  // Comfy Router video models (2026-10-31)
  'comfy-router:router-veo-lite': fromLimits('router-veo-lite'), 'comfy-router:router-wan3-prime': fromLimits('router-wan3-prime'),
  'comfy-router:router-pvideo2': fromLimits('router-pvideo2'), 'comfy-router:router-grok-video-lite': fromLimits('router-grok-video-lite'),
  // Processing routes (fal model API tabs)
  'fal:fal-ai/seedvr/upscale/video': proc({ sourceUrl: 'https://fal.ai/models/fal-ai/seedvr/upscale/video/api', resolutions: ['720p', '1080p', '1440p', '2160p'],
    inputLimits: { upscale_mode: ['factor', 'target'], upscale_factor: { default: 2 }, target_resolution: ['720p', '1080p', '1440p', '2160p'], output_format: ['X264 (.mp4)', 'VP9 (.webm)', 'PRORES4444 (.mov)', 'GIF (.gif)'] },
    note: 'No duration or audio limit stated on the page.' }),
  'fal:fal-ai/rife/video': proc({ sourceUrl: 'https://fal.ai/models/fal-ai/rife/video/api', inputLimits: { num_frames: { default: 1 }, fps: { default: 8 }, use_calculated_fps: true, use_scene_detection: true, loop: true },
    note: 'No duration, resolution or audio limit stated on the page.' }),
  'fal:bria/video/background-removal': proc({ sourceUrl: 'https://fal.ai/models/bria/video/background-removal/api', maxSeconds: 30,
    audio: { supported: true, toggle: true, default: true, passthrough: true }, inputLimits: { maxWidth: 4000, maxHeight: 4000, maxSecondsExclusive: 30, background_color: ['Transparent', 'Black', 'White', 'Gray', 'Red', 'Green', 'Blue', 'Yellow', 'Cyan', 'Magenta', 'Orange'],
      output_container_and_codec: ['mp4_h265', 'mp4_h264', 'webm_vp9', 'mov_h265', 'mov_proresks', 'mkv_h265', 'mkv_h264', 'mkv_vp9', 'gif'] }, note: 'Page: size < 4000×4000 and duration < 30 s; preserve_audio default true.' }),
  'fal:luma/agent/ray/v3.2/reframe': proc({ sourceUrl: 'https://fal.ai/models/luma/agent/ray/v3.2/reframe/api', checkedAt: '2026-10-31', maxSeconds: RAY32_REFRAME_MAX_SEC, aspects: RAY32_ASPECTS, resolutions: ['540p', '720p', '1080p'],
    inputLimits: { prompt: 'required', duration: ['5s', '10s'] }, note: 'prompt, video_url and aspect_ratio required; source 10 s or less; resolution default 540p (we send 720p High, 540p Fast).' }),
  // BFL direct (limits already read for UPSCALE_BFL: docs.bfl.ai flux_video_upscale)
  'direct:direct-flux3-upscale': proc({ sourceUrl: 'https://docs.bfl.ai/flux_tools/flux_video_upscale', maxSeconds: 20, audio: { supported: true, toggle: false, default: true, passthrough: true },
    inputLimits: { maxSource: '2560x1440', maxMB: 50, scales: [1.5, 2, 3], mode: ['precise', 'creative'] } }),
};
ROUTE_VIDEO_CAPS['direct:bfl/flux-3-upscaler'] = ROUTE_VIDEO_CAPS['direct:direct-flux3-upscale'];
/** Local ComfyUI video routes: limits depend on our workflow + GPU; no official page states them, so every field is null (verified=false) until real ComfyUI verification. */
export const localVideoCaps = (routeId: string, workflow: string): RouteVideoCaps => ({ durations: null, minSeconds: null, maxSeconds: null, aspects: null, resolutions: null, audio: null,
  refKinds: [], refMax: {}, sourceUrl: workflow, checkedAt: D, verified: false, note: `${routeId}: no official limits page; waits for real ComfyUI verification` });
