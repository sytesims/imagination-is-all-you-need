/**
 * The model catalogue (MODEL-PICKER-REVIEW §4.6 / §5.1, task 2): what a picker shows about a MODEL (shared/modelIds.ts MODELS key), written once.
 * Isomorphic (no imports), so the web can read the same table later. The server adds maker, release date and a capability summary
 * (routing/modelRegistry.ts catalogueFields) and sends it on GET /api/tools models[] and GET /api/models/registry.
 * Not to be confused with shared/modelCatalog.ts, which holds the ENGINE cards (provider ids).
 *
 * Fields
 *  - displayName  the maker's name plus version ("Seedance 2.0", "Veo 3.1"). Pickers show it instead of MODELS[].name.
 *  - bestFor      one line, at most 42 characters, plain words: what the model is good at. Never the app's state ("Default for…"),
 *                 the place it runs, its price or its licence (test/model-catalogue.test.ts checks this).
 *  - rank         per medium (image / video / audio), unique, lower = higher in the list. API models first, local (Local) models from 30 on (image: 60 on).
 *  - home         'api' = it belongs with the hosted models (any Comfy or other API route); 'gpu' = its best place is your own computer.
 *                 Every 'api' model ranks above every 'gpu' model of its medium (tested).
 *  - featured     editorial, API only, at most 5 per medium: the Featured rows of the pickers and the first entries of the header menu.
 *  - popular      editorial (Comfy publishes no popularity data, ROUTER-AUDIT §4): the best-known model of its kind in public galleries
 *                 and partner pages. Reason per flag in the ranking table below.
 *  - aliases      extra search words (short names, maker names, old names).
 *  - variantOf    the model this one is a version / recipe of (Z-Image → Z-Image-Turbo). The server adds the reverse list (variants).
 *  - kind         audio only: what it makes (music, voice, sfx…), for the capability summary.
 *
 * Ranking (newest and most popular API first, local at the bottom). Mapped models only; the models ROUTER-AUDIT §4 lists as "not mapped yet"
 * (GPT Image 2.5, Nano Banana 2.1 / Pro, Seedance 2.5, Kling V3 Omni…) get their review rank when they are wired. Re-rank when ROUTER-AUDIT changes.
 *
 *   Image  1 GPT Image 2.5 Flare (featured: OpenAI's current image model, Sept 2026; OpenAI points new integrations to 2.5)
 *          2 Nano Banana 2.1 (featured: Google's newest image model, Oct 2026)
 *          3 GPT Image 2 (featured, popular: most-used edit model on partner pages), 4 Nano Banana 2 (featured, popular), 5 Seedream 5.0 Pro (featured, popular)
 *          6–9 Nano Banana Pro, GPT Image 2.5 Sunburst, FLUX 3 Image, FLUX.2 [max]
 *          10–25 FLUX.2 [pro], Qwen Image 3.0 Pro / 3.0, Ideogram 4.5 / V4, Seedream 5.0 Flash, Kling Image O1, Recraft V4.1 Pro / V4.1 / V4,
 *                Luma UNI-1 Max / UNI-1, Grok Imagine Image 2.0, Krea 3, Runway Gen-4 Image, Wan 2.5 Image
 *          26 FLUX 3 Klein (newest small FLUX: BFL / fal and Local), 27–29 HY Image 3.5, Muse Image 1.0, FLUX.2 [flex] (not runnable yet), 30–33 hosted upscalers,
 *          34–36 fal-only tools (Topaz Bloom 2, Bria Increase Resolution, Bria GenFill)
 *          49–51 GPT Image 1.5, Seedream 4.5, Grok Imagine Image Pro (Comfy Router image batch, 2026-10-25)
 *          52 FIBO 2.0 (Bria, Comfy Router, 2026-10-26)
 *          60+ Local: Qwen Image 2.1, Qwen Image 2.1 Turbo, Z-Image-Turbo, Qwen-Image, FLUX.2 [klein] 4B, MOSS-Image, FLUX.2 [dev], base models, edit and upscale models
 *   Video  3 Seedance 2.0 (featured, popular: the Router's flagship video model), 4 Kling v3 (featured), 8 MiniMax H3 (featured, popular: also locally),
 *          9–13 hosted tool models (H3 Max Extend, Bria, Luma Reframe), 19 Veo 3.1
 *          17–18, 30–34 Video Upscale (SeedVR2 on fal, Topaz, FLUX Video Upscale, Crystal; 2026-10-26; rank = the Upscale menu order)
 *          40 Wan 3.0 Prime, 41 Veo 3.1 Lite, 42 P-Video-2, 43 Grok Imagine Video 1.5 Lite (Comfy Router, 2026-10-31)
 *          50+ Local (moved up by 10 on 2026-10-31 to make room): LTX-2 19B, Wan 2.x, H3 recipes, SeedVR2 3B, Real-ESRGAN x2, 4x-UltraSharp, RIFE, BiRefNet, Depth Anything, ffmpeg HDR10
 *   Audio  1 ElevenLabs v4 (featured, popular: the best-known voiceover model), 2 MiniMax Music 3 (featured, popular), 3 ElevenLabs Sound Effects (featured),
 *          4–9 Seed Audio, MiniMax Speech 2.8 HD, Sonilo, HeyGen Voice, Fish Audio S2.1 Pro, 11 MiniMax Speech 2.8 Turbo,
 *          12–13 ElevenLabs v3, ElevenLabs v4 Turbo (2026-10-25)
 *          30+ Local: ACE-Step 1.5, Chatterbox, Stable Audio Open, MMAudio, Fish Audio Drama 3, F5-TTS, voice change and translate pipelines, 39 Qwen3 TTS 1.7B (2026-10-27)
 */
export type CatalogueHome = 'api' | 'gpu';
export type AudioKind = 'music' | 'voice' | 'sfx' | 'score' | 'voice-change' | 'translate';
export interface CatalogueEntry {
  displayName: string;
  bestFor: string;
  rank: number;
  home: CatalogueHome;
  featured?: boolean;
  popular?: boolean;
  aliases?: string[];
  variantOf?: string;
  kind?: AudioKind;
  /** Every audio job the model makes, when it is more than one (Seed Audio: speech, music and sound effects); `kind` stays the first. */
  kinds?: AudioKind[];
}
const e = (displayName: string, rank: number, home: CatalogueHome, bestFor: string, extra: Partial<CatalogueEntry> = {}): CatalogueEntry => ({ displayName, rank, home, bestFor, ...extra });

/** Keyed by model key (MODELS). Every model the app offers has an entry (test/model-catalogue.test.ts). */
export const CATALOGUE: Record<string, CatalogueEntry> = {
  // ---------------------------------------------------------------- Image
  // Added 2026-10-22 (model-catalog pass): newest hosted image models on Comfy Router (and BFL / fal / Replicate where listed)
  'gpt-image-2.5-flare': e('GPT Image 2.5 Flare', 1, 'api', 'Fast, polished images and edits', { featured: true, aliases: ['openai', 'gpt', 'gpt image', 'gpt 2.5', 'flare', 'chatgpt'] }),
  'nano-banana-2.1': e('Nano Banana 2.1', 2, 'api', 'Clear text, steady characters, 4K', { featured: true, aliases: ['nb2.1', 'nano banana', 'gemini', 'google'] }),
  'nano-banana-pro': e('Nano Banana Pro', 6, 'api', 'Complex scenes from many references', { aliases: ['nano banana', 'gemini', 'gemini 3 pro', 'google', 'pro'] }),
  'gpt-image-2.5-sunburst': e('GPT Image 2.5 Sunburst', 7, 'api', 'Precise edits that keep the rest', { aliases: ['openai', 'gpt', 'gpt 2.5', 'sunburst'], variantOf: 'gpt-image-2.5-flare' }),
  'flux-3-image': e('FLUX 3 Image', 8, 'api', 'Photoreal detail, edits from 10 images', { aliases: ['flux', 'flux 3', 'bfl', 'black forest labs'] }),
  'flux-2-max': e('FLUX.2 [max]', 9, 'api', 'Top FLUX.2 detail, up to 9 references', { aliases: ['flux', 'flux 2', 'max', 'bfl'], variantOf: 'flux-2-pro' }),
  'qwen-image-3-pro': e('Qwen Image 3.0 Pro', 11, 'api', 'Text-heavy posters and edits', { aliases: ['qwen', 'alibaba', 'qwen 3', 'pro'], variantOf: 'qwen-image-3' }),
  'ideogram-4.5': e('Ideogram 4.5', 13, 'api', 'Typography and edits from 5 images', { aliases: ['ideogram', 'text', 'logo', 'typography'] }),
  'seedream-5.0-flash': e('Seedream 5.0 Flash', 15, 'api', 'Quick, low-cost generate and edit', { aliases: ['seedream', 'bytedance', 'flash'], variantOf: 'seedream-5.0-pro' }),
  'recraft-v4.1-pro': e('Recraft V4.1 Pro', 17, 'api', 'Design-grade images at 2K', { aliases: ['recraft', 'illustration', 'design', 'pro'], variantOf: 'recraft-v4.1' }),
  'recraft-v4.1': e('Recraft V4.1', 18, 'api', 'Brand graphics and clean design', { aliases: ['recraft', 'vector', 'illustration'] }),
  'luma-uni-1-max': e('Luma UNI-1 Max', 20, 'api', 'Richer detail from your references', { aliases: ['luma', 'uni-1', 'uni 1', 'max'], variantOf: 'luma-image' }),
  'gpt-image': e('GPT Image 2', 3, 'api', 'Precise edits, masks, long prompts', { featured: true, popular: true, aliases: ['openai', 'gpt', 'gpt image', 'chatgpt'] }),
  'nano-banana-2': e('Nano Banana 2', 4, 'api', 'Strong edits from up to 4 images', { featured: true, popular: true, aliases: ['nb2', 'nano banana', 'gemini', 'google', 'gemini image'] }),
  'seedream-5.0-pro': e('Seedream 5.0 Pro', 5, 'api', 'Character sheets, relight, steady edits', { featured: true, popular: true, aliases: ['seedream', 'bytedance', 'dreamina'] }),
  'flux-2-pro': e('FLUX.2 [pro]', 10, 'api', 'Sharp photoreal detail', { aliases: ['flux', 'flux 2', 'bfl', 'black forest labs'] }),
  'qwen-image-3': e('Qwen Image 3.0', 12, 'api', 'Text inside images', { aliases: ['qwen', 'alibaba', 'qwen 3'] }),
  'ideogram-v4': e('Ideogram V4', 14, 'api', 'Typography, logos, posters', { aliases: ['ideogram', 'text', 'logo'] }),
  'kling-image-o1': e('Kling Image O1', 16, 'api', 'Generate and edit up to 4K', { aliases: ['kling', 'kuaishou', 'o1'] }),
  'recraft-v4': e('Recraft V4', 19, 'api', 'Brand graphics, clean illustration', { aliases: ['recraft', 'vector', 'illustration'] }),
  'luma-image': e('Luma UNI-1', 21, 'api', 'Closely follows your references', { aliases: ['luma', 'uni-1', 'uni 1'] }),
  'grok-imagine-image': e('Grok Imagine Image 2.0', 22, 'api', 'Quick stills at 1K or 2K', { aliases: ['grok', 'xai', 'imagine'] }),
  krea: e('Krea 3', 23, 'api', 'Stylised, painterly looks', { aliases: ['krea'] }),
  'runway-gen4-image': e('Runway Gen-4 Image', 24, 'api', 'Cinematic stills', { aliases: ['runway', 'gen-4', 'gen4'] }),
  'wan-image-2.5': e('Wan 2.5 Image', 25, 'api', 'Simple stills from a prompt', { aliases: ['wan', 'alibaba'] }),
  'flux-3-klein': e('FLUX 3 Klein', 26, 'api', 'Fast generate, edit and inpaint', { aliases: ['flux', 'flux 3', 'klein', 'bfl', 'black forest labs'] }),
  'hunyuan-image-3.5': e('HY Image 3.5 (preview)', 27, 'api', 'Up to 4K from a prompt', { aliases: ['hunyuan', 'hy image', 'tencent'] }),
  'meta-muse-image': e('Muse Image 1.0', 28, 'api', 'Images and edits from a prompt', { aliases: ['muse', 'meta'] }),
  'flux-2-flex': e('FLUX.2 [flex]', 29, 'api', 'Tunable steps and guidance', { aliases: ['flux', 'flex', 'bfl'], variantOf: 'flux-2-pro' }),
  // Official lab APIs, batch 1 (2026-10-23)
  'minimax-image-01': e('MiniMax image-01', 37, 'api', 'Quick stills in eight aspect ratios', { aliases: ['minimax', 'image-01', 'hailuo'] }),
  'flux-2-klein-9b': e('FLUX.2 [klein] 9B', 38, 'api', 'Fast generate and edit from 4 images', { aliases: ['flux', 'klein', 'klein 9b', 'bfl'], variantOf: 'flux-2-klein-4b' }),
  'nano-banana-2-lite': e('Nano Banana 2 Lite', 39, 'api', 'Light, quick Nano Banana at 1K', { aliases: ['nano banana', 'nb2 lite', 'gemini', 'google', 'lite'], variantOf: 'nano-banana-2' }),
  // Upscale models (2026-10-22): hosted ones after the image makers, ranks 30–33
  'seedvr2-image': e('SeedVR2', 30, 'api', 'Upscales with real texture, content kept', { aliases: ['seedvr', 'seedvr2', 'bytedance', 'wavespeed', 'upscale'] }),
  'crystal-upscaler': e('Crystal Upscaler', 31, 'api', 'Upscales faces and products cleanly', { aliases: ['crystal', 'clarity', 'upscale'] }),
  'topaz-wonder-3.5': e('Topaz Wonder 3.5', 32, 'api', 'Rebuilds detail in soft photos', { aliases: ['topaz', 'wonder', 'upscale'] }),
  'topaz-standard-v2': e('Topaz Standard V2', 33, 'api', 'Sharp, faithful upscale', { aliases: ['topaz', 'precision', 'standard', 'upscale'] }),
  // fal image pass (2026-10-22): fal-only tool models, after the hosted upscalers
  'topaz-bloom-2': e('Topaz Bloom 2', 34, 'api', 'Creative upscale that adds fine detail', { aliases: ['topaz', 'bloom', 'creative', 'upscale'] }),
  'bria-increase-resolution': e('Bria Increase Resolution', 35, 'api', 'Larger images, content unchanged', { aliases: ['bria', 'increase resolution', 'upscale'] }),
  'bria-genfill': e('Bria GenFill', 36, 'api', 'Fills a painted area from a prompt', { aliases: ['bria', 'genfill', 'inpaint', 'fill'] }),
  // photo tools (2026-10-23): fal-only models for Remove Background, Expand, Erase Object and Virtual Try-On
  'bria-rmbg-2.0': e('Bria RMBG 2.0', 40, 'api', 'Clean cut-outs on a transparent background', { aliases: ['bria', 'rmbg', 'remove background', 'remove bg', 'cutout'] }),
  'ideogram-remove-background': e('Ideogram Remove Background', 41, 'api', 'Quick cut-outs, transparent PNG', { aliases: ['ideogram', 'remove background', 'remove bg', 'cutout'] }),
  'bria-expand': e('Bria Expand', 42, 'api', 'Adds room around a photo to a new shape', { aliases: ['bria', 'expand', 'outpaint', 'uncrop'] }),
  'ideogram-3-reframe': e('Ideogram 3.0 Reframe', 43, 'api', 'Reframes a photo to a new shape', { aliases: ['ideogram', 'reframe', 'expand', 'outpaint'] }),
  'bria-eraser': e('Bria Eraser', 44, 'api', 'Removes a painted object, fills the gap', { aliases: ['bria', 'eraser', 'erase', 'remove object'] }),
  'fal-object-removal': e('fal Object Removal', 45, 'api', 'Removes a painted object and its shadow', { aliases: ['object removal', 'erase', 'remove object'] }),
  'bria-virtual-tryon': e('Bria Virtual Try-On', 53, 'api', 'Puts up to three garments on a person', { aliases: ['bria', 'try on', 'try-on', 'vto', 'garment', 'clothes'] }),
  'fashn-tryon-1.6': e('FASHN Virtual Try-On v1.6', 46, 'api', 'Puts a garment on a person', { aliases: ['fashn', 'try on', 'try-on', 'vto', 'garment'] }),
  // Image to layers (2026-10-24): Seedream 5.0 Flash / Pro in layer mode (their own rows here, so the menu says what they do in this workflow)
  'seedream-5.0-flash-layers': e('Seedream 5.0 Flash', 47, 'api', 'Splits a photo into clean layers, fast', { aliases: ['seedream', 'bytedance', 'flash', 'layers', 'layer separation'] }),
  'seedream-5.0-pro-layers': e('Seedream 5.0 Pro', 48, 'api', 'Finer layer splits, up to 2K', { aliases: ['seedream', 'bytedance', 'pro', 'layers', 'layer separation'] }),
  // Comfy Router image batch (2026-10-25): after the hosted tool models; local image models moved to 60+ to make room
  'gpt-image-1.5': e('GPT Image 1.5', 49, 'api', 'Clean edits and masks in three shapes', { aliases: ['openai', 'gpt', 'gpt image', 'gpt 1.5', 'chatgpt'], variantOf: 'gpt-image' }),
  'seedream-4.5': e('Seedream 4.5', 50, 'api', 'Sharp 2K and 4K, edits from 14 photos', { aliases: ['seedream', 'bytedance', 'seedream 4', '4k'], variantOf: 'seedream-5.0-pro' }),
  'grok-imagine-image-pro': e('Grok Imagine Image Pro', 51, 'api', 'Detailed stills from a prompt', { aliases: ['grok', 'xai', 'imagine', 'pro'], variantOf: 'grok-imagine-image' }),
  'fibo-2.0': e('FIBO 2.0', 52, 'api', 'Precise edits; light, camera and text held', { aliases: ['bria', 'fibo', 'fibo 2', 'structured', 'json prompt'] }),
  'qwen-image-2.1': e('Qwen Image 2.1', 60, 'gpu', 'Edits and creates; clear text in images', { aliases: ['qwen', 'alibaba', 'qwen 2.1'] }),
  'qwen-image-2.1-turbo': e('Qwen Image 2.1 Turbo', 61, 'gpu', 'Fast local edits', { aliases: ['qwen', 'alibaba', 'qwen 2.1', 'turbo', 'qwen turbo'], variantOf: 'qwen-image-2.1' }),
  'z-image-turbo': e('Z-Image-Turbo', 62, 'gpu', '8-step drafts in seconds', { aliases: ['z-image', 'zit', 'tongyi', 'turbo'] }),
  'qwen-image': e('Qwen-Image', 63, 'gpu', 'Creates and edits; text-heavy images', { aliases: ['qwen', 'alibaba', 'qwen image 20b'] }),
  'flux-2-klein-4b': e('FLUX.2 [klein] 4B', 64, 'gpu', 'Small and fast, generate and edit', { aliases: ['flux', 'klein', 'bfl'] }),
  'moss-image': e('MOSS-Image', 65, 'gpu', 'Legible text and posters', { aliases: ['moss', 'openmoss'] }),
  'flux-2-dev': e('FLUX.2 [dev]', 66, 'gpu', 'High detail, generate and edit', { aliases: ['flux', 'dev', 'bfl'] }),
  'z-image': e('Z-Image (base)', 67, 'gpu', 'Base model for tests and tuning', { aliases: ['z-image base', 'tongyi'], variantOf: 'z-image-turbo' }),
  'moss-image-base': e('MOSS-Image Base', 68, 'gpu', 'Base model for tests and tuning', { aliases: ['moss', 'openmoss'], variantOf: 'moss-image' }),
  'qwen-image-edit-2509': e('Qwen-Image-Edit-2509', 69, 'gpu', 'Prompted edits, faces and angles', { aliases: ['qwen', 'qwen edit', 'alibaba'], variantOf: 'qwen-image' }),
  'qwen-image-edit-2509-angles': e('Qwen-Image-Edit-2509 + Multiple-angles LoRA', 70, 'gpu', 'New camera angles of one photo', { aliases: ['qwen', 'angles', 'lora'], variantOf: 'qwen-image-edit-2509' }),
  opensoul: e('Z-Image-Turbo + look LoRAs', 71, 'gpu', 'Consistent looks for one character', { aliases: ['soul', 'opensoul', 'z-image', 'lora'], variantOf: 'z-image-turbo' }),
  'seedvr2-3b-image': e('SeedVR2 3B', 72, 'gpu', 'Upscales with real texture, content kept', { aliases: ['seedvr', 'seedvr2', 'bytedance', 'upscale'] }),
  'z-image-turbo-2k-upscaler': e('Z-Image-Turbo 2K upscaler', 73, 'gpu', 'Re-details an image up to 2K', { aliases: ['z-image', 'zit', 'upscale', '2k'] }),
  '4x-nomos2': e('4x Nomos2 DAT2', 74, 'gpu', 'Clean, faithful 4x upscale', { aliases: ['nomos', 'nomos2', 'dat', 'phhofm', 'upscale'] }),
  'real-esrgan': e('Real-ESRGAN', 75, 'gpu', 'Sharper, larger photos', { aliases: ['esrgan', 'upscale'] }),
  '4x-ultrasharp': e('4x-UltraSharp', 76, 'gpu', 'Crisp detail when upscaling', { aliases: ['ultrasharp', 'upscale'] }),
  'qwen-image-layered': e('Qwen-Image-Layered', 77, 'gpu', 'Needs download (30.1 GB) · free layers locally' /* = imageLayers.ts QWEN_LAYERED_NEEDS; image-layers test checks */, { aliases: ['qwen', 'layers', 'layered', 'alibaba'] }), // Image to layers (2026-10-24): listed for Local, needs a download
  // ---------------------------------------------------------------- Video
  'seedance-2.0': e('Seedance 2.0', 3, 'api', 'Text or photo to video, camera moves', { featured: true, popular: true, aliases: ['seedance', 'bytedance', 'dreamina'] }),
  'kling-v3': e('Kling 3.0 Omni', 4, 'api', 'Text, photo or references to video', { featured: true, aliases: ['kling', 'kuaishou', 'kling 3', 'kling v3', 'omni'] }), // Kling 3.0 Omni on every mode (2026-10-25)
  // Video Swap cloud person swap (2026-10-25, shared/cloudSwap.ts): hosted video edits, the only person-swap models in the Video Swap list besides the local ones
  'kling-v3-omni-edit': e('Kling 3.0 Omni Edit', 22, 'api', 'Swaps one person, keeps motion and sound', { aliases: ['kling', 'kuaishou', 'omni', 'edit', 'swap'] }),
  'seedance-2.5-edit': e('Seedance 2.5 Edit', 23, 'api', 'Swaps one person, up to 30 s in one pass', { aliases: ['seedance', 'bytedance', 'edit', 'swap'] }),
  'runway-aleph-2': e('Runway Aleph 2', 25, 'api', 'Edits a clip, keeps motion and timing', { aliases: ['runway', 'aleph', 'edit', 'render'] }),
  'luma-ray-3.2-edit': e('Luma Ray 3.2 Edit', 26, 'api', 'Re-renders a clip, keeps its structure', { aliases: ['luma', 'ray', 'edit', 'render'] }),
  'wan-3.0': e('Wan 3.0', 21, 'api', 'Up to 30 s at 1080p with sound', { aliases: ['wan', 'alibaba', 'wan 3', 'wan3'] }),
  // Official lab APIs, batch 1 (2026-10-23): LTX-2.5 / 2.3 on the LTX API, FLUX 3 Video on the BFL API
  'ltx-2.5-pro': e('LTX-2.5 Pro', 5, 'api', 'Cinematic clips with their own sound', { aliases: ['ltx', 'lightricks', 'ltx 2.5', 'pro'] }),
  'ltx-2.5-fast': e('LTX-2.5 Fast', 6, 'api', 'Clips up to 20 s with sound', { aliases: ['ltx', 'lightricks', 'ltx 2.5', 'fast'], variantOf: 'ltx-2.5-pro' }),
  'flux-3-video': e('FLUX 3 Video', 7, 'api', 'Text or photo to video up to 4K', { aliases: ['flux', 'flux 3', 'bfl', 'black forest labs', 'video'] }),
  'ltx-2.3-fast': e('LTX-2.3 Fast', 13, 'api', 'Quick drafts in 16:9 or 9:16', { aliases: ['ltx', 'lightricks', 'ltx 2.3', 'fast'], variantOf: 'ltx-2.5-pro' }),
  // Official lab APIs, batch 2 (2026-10-23): new Seedance models on BytePlus ModelArk
  'seedance-2.5': e('Seedance 2.5', 14, 'api', 'Up to 30 s at 1080p with sound', { aliases: ['seedance', 'bytedance', 'dreamina', 'seedance 2.5'], variantOf: 'seedance-2.0' }),
  'seedance-2.0-fast': e('Seedance 2.0 Fast', 15, 'api', 'Quicker Seedance at up to 720p', { aliases: ['seedance', 'bytedance', 'dreamina', 'fast'], variantOf: 'seedance-2.0' }),
  'seedance-2.0-mini': e('Seedance 2.0 Mini', 16, 'api', 'Light Seedance for quick drafts', { aliases: ['seedance', 'bytedance', 'dreamina', 'mini'], variantOf: 'seedance-2.0' }),
  'minimax-h3': e('MiniMax H3', 8, 'api', 'Clips with voices, music and effects', { featured: true, popular: true, aliases: ['h3', 'minimax', 'hailuo'] }),
  'minimax-h3-max-extend': e('H3 Max Extend', 9, 'api', 'Longer, sharper continuations', { aliases: ['h3 max', 'minimax', 'extend'] }),
  'flux-3-upscaler': e('FLUX Video Upscale', 31, 'api', 'Sharper, larger clips, precise or creative', { aliases: ['flux', 'bfl', 'upscale', 'flux 3 upscaler'] }),
  // Video Upscale (2026-10-26, shared/videoUpscale.ts)
  'topaz-starlight-fast': e('Topaz Starlight Fast', 18, 'api', 'Clean, faithful upscale to 1080p or 4K', { aliases: ['topaz', 'starlight', 'astra', 'fast', 'upscale'] }),
  'topaz-starlight-precise-2.5': e('Topaz Starlight Precise 2.5', 30, 'api', 'Most faithful Topaz upscale', { aliases: ['topaz', 'starlight', 'precise', 'upscale'] }),
  'topaz-astra-2': e('Topaz Astra 2', 32, 'api', 'Rebuilds texture in soft AI video', { aliases: ['topaz', 'astra', 'creative', 'upscale'] }),
  'topaz-starlight-creative': e('Topaz Starlight Creative', 33, 'api', 'Strongest re-imagined detail', { aliases: ['topaz', 'starlight', 'creative', 'upscale'] }),
  'crystal-video-upscaler': e('Crystal Video Upscaler', 34, 'api', 'Faithful clip upscale, sound kept', { aliases: ['crystal', 'clarity', 'upscale'] }),
  'bria-video-background-removal': e('Bria Video Background Removal', 11, 'api', 'Subject cut out of a clip', { aliases: ['bria', 'background', 'remove bg'] }),
  'luma-ray-2-reframe': e('Luma Ray 3.2 Reframe', 12, 'api', 'New aspect ratio, edges filled in', { aliases: ['luma', 'ray 3.2', 'ray 2', 'reframe'] }),
  'veo-3.1': e('Veo 3.1', 19, 'api', 'Text or photo to video with sound', { aliases: ['veo', 'google', 'gemini'] }),
  'veo-3.1-fast': e('Veo 3.1 Fast', 20, 'api', 'Quicker Veo, text or photo with sound', { aliases: ['veo', 'google', 'gemini', 'fast'], variantOf: 'veo-3.1' }), // Comfy Router (2026-10-25)
  // Comfy Router (2026-10-31): affordable and fast tiers; ranks are unique per medium and API ranks stay below Local (local video moved to 50+)
  'veo-3.1-lite': e('Veo 3.1 Lite', 41, 'api', 'Lowest-cost Veo, text or photo with sound', { aliases: ['veo', 'google', 'gemini', 'lite'], variantOf: 'veo-3.1' }),
  'wan-3.0-prime': e('Wan 3.0 Prime', 40, 'api', 'Faster Wan 3.0, up to 30 s at 1080p', { aliases: ['wan', 'alibaba', 'wan 3', 'wan3', 'prime'], variantOf: 'wan-3.0' }),
  'p-video-2': e('P-Video-2', 42, 'api', 'Quick, low-cost clips with sound', { aliases: ['pruna', 'p-video', 'p video', 'cheap'] }),
  'grok-imagine-video-1.5-lite': e('Grok Imagine Video 1.5 Lite', 43, 'api', 'Quick, low-cost clips from text or photo', { aliases: ['grok', 'xai', 'imagine', 'lite'] }),
  'ltx-2-19b': e('LTX-2 19B', 50, 'gpu', 'New angles, camera moves, directed shots', { aliases: ['ltx', 'ltx-2', 'lightricks'] }),
  'wan-2.2-fun-camera-14b': e('Wan 2.2 Fun Camera 14B', 51, 'gpu', 'Camera moves from one still', { aliases: ['wan', 'fun camera', 'alibaba'] }),
  'wan-2.2-animate-14b': e('Wan 2.2 Animate 14B', 52, 'gpu', 'Subject swap that keeps the motion', { aliases: ['wan', 'animate', 'alibaba'] }),
  'wan-2.1-vace-14b': e('Wan 2.1 VACE 14B', 53, 'gpu', 'Whole-clip restyle', { aliases: ['wan', 'vace', 'alibaba'] }),
  'wan-2.2-i2v-14b': e('Wan 2.2 I2V 14B', 54, 'gpu', 'Animates a photo with an effect', { aliases: ['wan', 'i2v', 'alibaba'] }),
  'minimax-h3-camera-motion': e('H3 Camera Motion', 55, 'gpu', 'Seven camera moves, slow or aggressive', { aliases: ['h3', 'minimax', 'camera'], variantOf: 'minimax-h3' }),
  'minimax-h3-talking-photo': e('H3 Talking Photo', 56, 'gpu', 'Portrait plus speech into a talking clip', { aliases: ['h3', 'minimax', 'lip sync', 'lipsync'], variantOf: 'minimax-h3' }),
  'minimax-h3-extend': e('H3 Extend', 57, 'gpu', 'Continues a clip by 5 or 10 s', { aliases: ['h3', 'minimax', 'extend'], variantOf: 'minimax-h3' }),
  'minimax-h3-crossview': e('H3 CrossView', 24, 'api', 'Re-shoots a take from a new angle', { aliases: ['h3', 'minimax', 'crossview', 'new angle', 'reshoot'], variantOf: 'minimax-h3' }),
  'minimax-h3-fast': e('MiniMax H3 Fast', 29, 'api', 'H3 in 8 steps: quick drafts with sound', { aliases: ['h3', 'minimax', 'fasth3', 'fastvideo', 'fast'], variantOf: 'minimax-h3' }),
  'minimax-h3-character-swap': e('H3 Character Swap', 58, 'gpu', 'Character swap, motion kept', { aliases: ['h3', 'minimax', 'swap'], variantOf: 'minimax-h3' }),
  'minimax-h3-style-transfer': e('H3 Style Transfer', 59, 'gpu', 'Restyle from an image or text', { aliases: ['h3', 'minimax', 'restyle'], variantOf: 'minimax-h3' }),
  'minimax-h3-vfx-edit': e('H3 VFX Edit', 60, 'gpu', 'Prompt-directed effects', { aliases: ['h3', 'minimax', 'vfx'], variantOf: 'minimax-h3' }),
  seedvr2: e('SeedVR2', 17, 'api', 'Real texture, content kept, 720p to 4K', { aliases: ['seedvr', 'bytedance', 'upscale'] }),
  'seedvr2-3b-video': e('SeedVR2 3B', 71, 'gpu', 'Real texture on NVIDIA GPUs', { aliases: ['seedvr', 'seedvr2', 'bytedance', 'upscale'] }),
  'real-esrgan-x2-video': e('Real-ESRGAN x2', 69, 'gpu', 'Sharper clips, quickly', { aliases: ['esrgan', 'realesrgan', 'upscale'] }),
  '4x-ultrasharp-video': e('4x-UltraSharp', 70, 'gpu', 'Sharper still; fine texture may shimmer', { aliases: ['ultrasharp', 'upscale'] }),
  'rife-4.9': e('RIFE 4.9', 62, 'gpu', 'Smoother motion at 48 or 60 fps', { aliases: ['rife', 'interpolation', 'fps'] }),
  birefnet: e('BiRefNet', 63, 'gpu', 'Clean subject cut-outs', { aliases: ['background', 'remove bg', 'matte'] }),
  'depth-anything-v2-small': e('Depth Anything V2 Small', 64, 'gpu', 'Depth video from a clip', { aliases: ['depth'] }),
  'ffmpeg-hdr10': e('ffmpeg HDR10 conversion', 65, 'gpu', 'SDR footage to HDR10', { aliases: ['hdr', 'ffmpeg'] }),
  'infinitetalk-wan-2.1': e('InfiniteTalk (Wan 2.1)', 10, 'api', 'Photo plus long speech into a talking clip', { aliases: ['infinitetalk', 'infinite talk', 'wan', 'meigen', 'lip sync', 'lipsync', 'talking photo', 'talking head', 'comfy cloud'] }),
  'ltx-2.5-talking-photo': e('LTX-2.5 Talking Photo', 68, 'gpu', 'Photo plus speech into a talking clip', { aliases: ['ltx', 'lightricks', 'lip sync', 'lipsync', 'talking photo', 'local', 'mac'], variantOf: 'ltx-2.5-22b' }),
  'ltx-2.5-22b': e('LTX-2.5 22B', 67, 'gpu', 'Clips with their own sound', { aliases: ['ltx', 'lightricks', 'ltx 2.5', '22b', 'local', 'mac', 'open weights'] }),
  'wan-2.2-ti2v-5b': e('Wan 2.2 5B', 66, 'gpu', 'Runs on most computers, in minutes', { aliases: ['wan', 'ti2v', '5b', 'alibaba', 'mac'] }),
  // ---------------------------------------------------------------- Audio
  'elevenlabs-v4': e('ElevenLabs v4', 1, 'api', 'Natural voiceover from a script', { featured: true, popular: true, kind: 'voice', aliases: ['elevenlabs', 'eleven', '11labs', 'tts'] }),
  // 2026-10-27: one card for the open MiniMax Music 3 (Local + Comfy Cloud); the old 'minimax-music-3-open' variant row is gone.
  'minimax-music-3': e('MiniMax Music 3', 2, 'api', 'Full songs from your lyrics', { featured: true, popular: true, kind: 'music', aliases: ['minimax', 'music', 'song', 'open weights', 'local'] }),
  'elevenlabs-sound-effects': e('ElevenLabs Sound Effects', 3, 'api', 'Sound effects from a prompt', { featured: true, kind: 'sfx', aliases: ['elevenlabs', 'eleven', 'sfx'] }),
  'seed-audio': e('Seed Audio 1.0 Multilingual', 4, 'api', 'Speech, music and sound effects', { kind: 'voice', kinds: ['voice', 'music', 'sfx'], aliases: ['bytedance', 'seed', 'tts', 'multilingual', 'music', 'sound effects', 'sfx'] }), // speech since 2026-10-24; music + sound effects again 2026-10-27 (tools/media.ts)
  'minimax-speech-2.8-hd': e('MiniMax Speech 2.8 HD', 5, 'api', 'HD speech in many voices', { kind: 'voice', aliases: ['minimax', 'speech', 'tts'] }),
  'sonilo-music': e('Sonilo Music', 6, 'api', 'Music from a prompt', { kind: 'music', aliases: ['sonilo'] }),
  'sonilo-video-to-music': e('Sonilo Video-to-Music', 7, 'api', 'A score that follows your clip', { kind: 'score', aliases: ['sonilo'], variantOf: 'sonilo-music' }),
  'heygen-voice': e('HeyGen Voice', 8, 'api', 'Presenter-style stock voices', { kind: 'voice', aliases: ['heygen', 'starfish', 'tts'] }),
  'fish-audio-s2.1-pro': e('Fish Audio S2.1 Pro', 9, 'api', 'Lifelike, expressive speech', { kind: 'voice', aliases: ['fish', 'fish audio', 'tts'] }),
  'qwen3-tts': e('Qwen3 TTS 1.7B', 39, 'gpu', 'Nine voices, ten languages, a style line', { kind: 'voice', aliases: ['qwen', 'alibaba', 'tts', 'open weights', 'local'] }),
  'elevenlabs-v3': e('ElevenLabs v3', 12, 'api', 'Acted voiceover with audio tags', { kind: 'voice', aliases: ['elevenlabs', 'eleven', '11labs', 'tts', 'v3', 'tags'] }),
  'elevenlabs-v4-turbo': e('ElevenLabs v4 Turbo', 13, 'api', 'Fast voiceover from a script', { kind: 'voice', aliases: ['elevenlabs', 'eleven', '11labs', 'tts', 'turbo'], variantOf: 'elevenlabs-v4' }),
  'minimax-speech-2.8-turbo': e('MiniMax Speech 2.8 Turbo', 11, 'api', 'Fast speech in many voices', { kind: 'voice', aliases: ['minimax', 'speech', 'tts', 'turbo'], variantOf: 'minimax-speech-2.8-hd' }),
  yue2: e('YuE2', 28, 'gpu', 'Songs from lyrics, or a cover of a song', { kind: 'music', aliases: ['yue', 'yue2', 'cover', 'song', 'music'] }),
  'ace-step-1.5': e('ACE-Step 1.5', 30, 'gpu', 'Songs with vocals and lyrics', { kind: 'music', aliases: ['ace', 'ace step', 'music'] }),
  chatterbox: e('Chatterbox', 31, 'gpu', 'Speech with voice cloning', { kind: 'voice', aliases: ['resemble', 'tts', 'clone'] }),
  'stable-audio-open-1.0': e('Stable Audio Open 1.0', 32, 'gpu', 'Sound effects and loops up to 47 s', { kind: 'sfx', aliases: ['stability', 'stable audio', 'sfx'] }),
  mmaudio: e('MMAudio', 33, 'gpu', 'Foley synced to your clip', { kind: 'score', aliases: ['foley', 'sfx'] }),
  'fish-audio-drama-3': e('Fish Audio Drama 3', 34, 'gpu', 'Voices with inline control tags', { kind: 'voice', aliases: ['fish', 'drama', 'tts'] }),
  'f5-tts': e('F5-TTS', 35, 'gpu', 'Speech in a cloned voice', { kind: 'voice', aliases: ['f5', 'tts', 'clone'] }),
  'chatterbox-voice-changer': e('Chatterbox Voice Changer', 36, 'gpu', 'New voice, original timing kept', { kind: 'voice-change', aliases: ['resemble', 'voice change'], variantOf: 'chatterbox' }),
  'translate-chatterbox': e('Translate with Chatterbox', 37, 'gpu', 'Transcribe, translate and re-voice', { kind: 'translate', aliases: ['translate', 'dub', 'whisper'], variantOf: 'chatterbox' }),
  'translate-f5-tts': e('Translate with F5-TTS', 38, 'gpu', 'Re-voiced in the speaker’s own voice', { kind: 'translate', aliases: ['translate', 'dub', 'whisper'], variantOf: 'f5-tts' }),
};
// Official Comfy templates (2026-10-27, server tools/comfyFeatured.ts): both run on Comfy Cloud only, so they rank with the API models.
Object.assign(CATALOGUE, {
  'flux-3-max': e('FLUX 3 Max', 27, 'api', 'Up to 10 keyframes to one shot with sound', { aliases: ['flux', 'flux 3', 'flux max', 'bfl', 'black forest labs', 'keyframes', 'video'] }),
  'gemini-omni-1.1-flash': e('Gemini Omni 1.1 Flash', 36, 'api', 'Text or frames to video with sound, to 4K', { aliases: ['gemini', 'omni', 'google', 'veo'] }),
  'wan-animate-2': e('Wan Animate 2', 37, 'api', 'Your character does the clip’s moves', { aliases: ['wan', 'animate', 'motion', 'alibaba', 'dance'] }),
  'bernini-r': e('Bernini-R', 38, 'api', 'Edit a clip with one line, motion kept', { aliases: ['bernini', 'bytedance', 'wan', 'prompt edit', 'edit'] }), // Prompt Edit (2026-10-27)
});
/** Models that list this one as their variantOf (Z-Image-Turbo → [z-image, opensoul]). */
export const variantsOf = (key: string): string[] => Object.keys(CATALOGUE).filter((k) => CATALOGUE[k].variantOf === key);
/** Sort helper: rank, then name. Models without an entry (plugins) go last. */
export const rankOf = (key: string): number => CATALOGUE[key]?.rank ?? 999;

/**
 * Model FAMILIES (2026-10-24): one short plain line per family (MODELS[].family) for the model menu's family rows ("Nano Banana ›").
 * At most 50 characters, our own words, the same rules as bestFor (no place, price or licence). Keyed by family; `<medium>:<family>` wins
 * when a family name spans media (MiniMax makes images, video and audio). A family without a line shows its first version's bestFor.
 */
export const FAMILY_BLURB: Record<string, string> = {
  'Nano Banana': 'Google image models: edits, clear text, up to 4K',
  'GPT Image': 'OpenAI image models: precise edits, long prompts',
  FLUX: 'Black Forest Labs: sharp, photoreal detail',
  'video:FLUX': 'FLUX 3 video and clip upscaling',
  Seedream: 'ByteDance stills: steady edits, quick drafts',
  Qwen: 'Alibaba image models: clear text, strong edits',
  'audio:Qwen': 'Speech in many languages',
  Ideogram: 'Typography, logos, reframes and cut-outs',
  Recraft: 'Brand graphics and clean design',
  Luma: 'Images that follow your references closely',
  'MOSS-Image': 'Posters and legible lettering',
  'Z-Image': 'Fast drafts and consistent character looks',
  Bria: 'Photo clean-up: cut-outs, expand, erase, fill',
  Topaz: 'Upscales that rebuild fine detail',
  SeedVR2: 'Upscales with real texture, content kept',
  LTX: 'Lightricks video with sound and camera moves',
  'image:MiniMax': 'Quick stills in eight shapes',
  'video:MiniMax': 'H3 video with sound, plus edit recipes',
  'audio:MiniMax': 'Songs with vocals and HD speech',
  Seedance: 'ByteDance video with sound, up to 30 s',
  Wan: 'Open video models: camera moves, swaps, restyle',
  ElevenLabs: 'Voiceover and sound effects',
  'F5-TTS': 'Speech in a cloned voice, and dubbing',
  'Fish Audio': 'Expressive, acted speech',
  'Resemble AI': 'Chatterbox speech, voice change and dubbing',
  Sonilo: 'Music from a prompt or a clip',
};
/** 3D models (shared/threeD.ts ids; they are not MODELS keys, so they have no CATALOGUE entry): the same short best-for line. */
export const THREE_D_BEST_FOR: Record<string, string> = {
  'cloud-tripo-31': 'Clean, textured models from one photo',
  'fal-trellis2': 'Detailed shapes with crisp textures',
  'fal-hunyuan3d-31': 'High-poly models with PBR materials',
  'comfy-pixal3d-trellis2': 'Models that line up with your photo',
  'local-turntable': 'A spinning showcase clip of your model',
};
export const familyBlurb =(family: string | null | undefined, medium?: string | null): string | null =>
  !family ? null : FAMILY_BLURB[`${medium}:${family}`] ?? FAMILY_BLURB[family] ?? null;
