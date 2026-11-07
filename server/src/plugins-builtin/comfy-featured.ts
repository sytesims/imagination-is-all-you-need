/**
 * comfy-featured: the official Comfy templates the app was missing (tools/comfyFeatured.ts), wired as models on the tabs that already do the
 * job: Gemini Omni 1.1 Flash, FLUX 3 Max and Kling 4.0 (Create Video), Topaz Bloom 2 (Image Upscale), Wan Animate 2 (Motion Control).
 * First in the profile, so the models are in the shared tables before any place or studio reads them (as when it ran at import).
 * Off: leave it out of the profile and those models are not in the app. It can't be switched off while the server runs (the wiring writes
 * into the shared model tables); disposing it leaves them in until the next start.
 */
import { definePlugin } from '../kernel/index.js';

export default definePlugin({
  name: 'comfy-featured',
  async apply() { (await import('../tools/comfyFeatured.js')).wireComfyFeatured(); },
});
