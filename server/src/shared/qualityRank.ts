/**
 * Our own image quality order: the model menu's "Best quality" sort (web/src/shared/ModelMenu.tsx, modelMenuSort.ts).
 *
 * Editorial, written by us: our judgement of how good each model's pictures are, from public release notes, our own test runs
 * (image QA, workflow and upscale passes) and everyday use. It is not taken from any leaderboard, and it isn't a score: just an order.
 * Two lists, because a model that draws well from a prompt isn't always the one that edits a photo best:
 *  - generate: no photo attached (text to image)
 *  - edit:     a photo is attached (the menu switches to this order)
 * Keys are model keys (shared/modelIds.ts MODELS); test/model-menu-sort.test.ts checks each one is real. Models that aren't listed
 * (upscalers, fill tools, base models) sort last in the recommended order. Re-check the order when a new image model is wired.
 *
 * Generate, top to bottom (why):
 *   GPT Image 2.5 Flare      follows long prompts closely, clean text, polished finish
 *   Nano Banana 2.1          very steady text and characters, sharp at 4K
 *   Nano Banana Pro          rich, complex scenes; slower but high fidelity
 *   GPT Image 2              still one of the most reliable prompt followers
 *   Seedream 5.0 Pro         natural photoreal light and skin at 4K
 *   FLUX 3 Image             fine photographic detail and texture
 *   Nano Banana 2            strong all-rounder, a step behind 2.1
 *   FLUX.2 [max]             the most detailed FLUX.2
 *   Qwen Image 3.0 Pro       dense text and posters, good layouts
 *   Ideogram 4.5             best for typography and graphic design
 *   Kling Image O1           cinematic stills, good at 4K
 *   HY Image 3.5             detailed 4K output, still a preview
 *   Recraft V4.1 Pro         clean design-grade images
 *   FLUX.2 [pro]             sharp and dependable, less detail than max
 *   Luma UNI-1 Max           rich detail, best with references
 *   Qwen Image 3.0           strong text, plainer finish than Pro
 *   Ideogram V4              typography, a step behind 4.5
 *   Seedream 5.0 Flash       good quality for a quick model
 *   Grok Imagine Image 2.0   lively quick stills, less control
 *   Recraft V4.1             brand graphics more than photos
 *   Krea 3                   lovely stylised looks, weaker realism
 *   Muse Image 1.0           decent general images
 *   Runway Gen-4 Image       moody cinematic stills, softer detail
 *   Luma UNI-1               follows references, softer on its own
 *   Qwen Image 2.1           the best of the local models in our tests
 *   FLUX.2 [dev]             high local detail, slow
 *   Recraft V4               older Recraft
 *   FLUX 3 Klein             fast and cheap, good for drafts
 *   FLUX.2 [klein] 9B        fast drafts
 *   Z-Image-Turbo            8-step local drafts, surprisingly good
 *   Wan 2.5 Image            simple stills
 *   MiniMax image-01         quick stills, plain finish
 *   Nano Banana 2 Lite       light and quick at 1K
 *   Qwen-Image               older local model, good text
 *   FLUX.2 [klein] 4B        smallest local FLUX
 *   MOSS-Image               legible text, simpler pictures
 *
 * Edit, top to bottom (why):
 *   GPT Image 2.5 Sunburst   made for precise edits that keep the rest of the photo
 *   Nano Banana 2.1          keeps faces and characters steady across edits
 *   Nano Banana Pro          handles many references and complex changes
 *   GPT Image 2.5 Flare      good edits, a little looser than Sunburst
 *   GPT Image 2              precise masked edits
 *   Seedream 5.0 Pro         steady relights and character edits
 *   FLUX 3 Image             photoreal edits from up to 10 images
 *   Nano Banana 2            strong edits from up to 4 images
 *   FLUX.2 [max]             detailed reference edits
 *   Qwen Image 3.0 Pro       edits that keep text right
 *   Kling Image O1           good edits up to 4K
 *   FLUX.2 [pro]             dependable reference edits
 *   Luma UNI-1 Max           follows references closely
 *   Qwen Image 2.1           the best local editor in our tests
 *   Ideogram 4.5             edits with text and design
 *   Seedream 5.0 Flash       quick edits, decent hold on the photo
 *   Muse Image 1.0           plain edits
 *   Qwen-Image-Edit-2509     local prompted edits, faces and angles
 *   Qwen Image 2.1 Turbo     fast local edits
 *   FLUX.2 [dev]             local edits, slow
 *   FLUX 3 Klein             quick edits and inpaint
 *   FLUX.2 [klein] 9B        quick edits
 *   Luma UNI-1               reference edits, softer
 *   FLUX.2 [klein] 4B        smallest local editor
 */
export type QualityMode = 'generate' | 'edit';

export const QUALITY_ORDER: Record<QualityMode, readonly string[]> = {
  generate: [
    'gpt-image-2.5-flare', 'nano-banana-2.1', 'nano-banana-pro', 'gpt-image', 'seedream-5.0-pro', 'flux-3-image', 'nano-banana-2', 'flux-2-max',
    'qwen-image-3-pro', 'ideogram-4.5', 'kling-image-o1', 'hunyuan-image-3.5', 'recraft-v4.1-pro', 'flux-2-pro', 'luma-uni-1-max', 'qwen-image-3',
    'ideogram-v4', 'seedream-5.0-flash', 'grok-imagine-image', 'recraft-v4.1', 'krea', 'meta-muse-image', 'runway-gen4-image', 'luma-image',
    'qwen-image-2.1', 'flux-2-dev', 'recraft-v4', 'flux-3-klein', 'flux-2-klein-9b', 'z-image-turbo', 'wan-image-2.5', 'minimax-image-01',
    'nano-banana-2-lite', 'qwen-image', 'flux-2-klein-4b', 'moss-image',
  ],
  edit: [
    'gpt-image-2.5-sunburst', 'nano-banana-2.1', 'nano-banana-pro', 'gpt-image-2.5-flare', 'gpt-image', 'seedream-5.0-pro', 'flux-3-image', 'nano-banana-2',
    'flux-2-max', 'qwen-image-3-pro', 'kling-image-o1', 'flux-2-pro', 'luma-uni-1-max', 'qwen-image-2.1', 'ideogram-4.5', 'seedream-5.0-flash',
    'meta-muse-image', 'qwen-image-edit-2509', 'qwen-image-2.1-turbo', 'flux-2-dev', 'flux-3-klein', 'flux-2-klein-9b', 'luma-image', 'flux-2-klein-4b',
  ],
};

const RANKS: Record<QualityMode, Map<string, number>> = {
  generate: new Map(QUALITY_ORDER.generate.map((k, i) => [k, i + 1])),
  edit: new Map(QUALITY_ORDER.edit.map((k, i) => [k, i + 1])),
};
/** 1 = best; null = not in our order (sorted last). */
export const qualityRank = (key: string, mode: QualityMode): number | null => RANKS[mode].get(key) ?? null;
