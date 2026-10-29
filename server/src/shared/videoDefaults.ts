/**
 * Default models for the Video tab. Same shape and resolution as shared/imageDefaults.ts:
 * the tool names the model it starts on, one for a local GPU and one for a hosted key, with a short line on why. routing/defaults.ts resolves
 * it (saved pick > this default for the active setup, if it runs > the first model that runs) and the web marks it "Default" in the model menu.
 *
 * Every id here must be a provider that h3-video really offers (media.ts `h3VideoTool.providers`); test/video-defaults.test.ts checks that.
 *  Explore rework (2026-10-26): LTX-2.5 first.
 *  - local and localApple: `comfy-ltx25-video` (LTX-2.5 22B, free, with its own sound; runs on Apple Silicon too, slowly).
 *  - hosted: shared/cloudDefaults.ts (sponsors first, 2026-10-27: LTX-2.5 Pro on the Comfy key; references: MiniMax H3).
 *  Cloud first (2026-10-27): the hosted model comes from shared/cloudDefaults.ts. The keyless sample server no longer opens on the local pick
 *  (sampleLocal is off): a first install with nothing downloaded starts on the cloud default, as it does once the Comfy key is added.
 */
import type { WorkflowDefaults } from './imageDefaults.js';
import { cloudModel } from './cloudDefaults.js';

export const VIDEO_DEFAULTS: Record<string, WorkflowDefaults> = {
  'h3-video': {
    local: 'comfy-ltx25-video',
    localApple: 'comfy-ltx25-video',
    hosted: cloudModel('h3-video'),
    why: {
      local: 'Video with its own sound, free on your computer',
      hosted: 'LTX-2.5 Pro: sharp video with its own sound',
    },
    whyApple: 'Free video with sound on your computer. Start with 2 s; it takes a few minutes.',
  },
  // Video Upscale (2026-10-26, shared/videoUpscale.ts): Real-ESRGAN x2 locally (any machine; about 53 s per clip second on an M1 Max). Cloud (2026-10-27):
  // Topaz Starlight Fast on Comfy Cloud (one Comfy key; SeedVR2 on fal, $0.25 for 5 s at 1080p, when only a fal key is set). SeedVR2 locally is NVIDIA-only, so it is never the local default.
  upscale: {
    local: 'comfy-video-esrgan', localApple: 'comfy-video-esrgan', hosted: cloudModel('video-upscale'), hostedFallback: 'comfy-seedvr2' /* SeedVR2 on fal, when only a fal key is set */,
    why: { local: 'Free on your computer and the best balance of speed and sharpness', hosted: 'The lowest-priced upscale on the Comfy key' },
    whyApple: 'Free on your computer: about 5 minutes for a 5 s clip.',
  },
};
VIDEO_DEFAULTS['app-video-upscale'] = VIDEO_DEFAULTS.upscale;
