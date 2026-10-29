/**
 * Create Image per-model capabilities + per-image price matrix (COMPOSER-SPEC behaviour: chips per model).
 * Isomorphic: imports only the isomorphic price table. Web can import it like shared/pricing.ts.
 * Sources: local = what OUR workflows wire (workflows/create-image-*-api.json + comfy/plans.ts image());
 * hosted = docs.comfy.org partner-node pricing page (2026-10-16), which lists per-resolution / per-tier rates.
 * Anything not stated by a source is listed in `unverified` (field names) — never assumed as a feature.
 */
import { HOSTED_BY_ID, usdToCredits } from './hostedPrices.js';
import { closestAspect } from './imageSnap.js';
import { nearestTier, snapNote } from './snap.js';
import { GPT_IMAGE_ASPECTS, GPT_IMAGE_RESOLUTIONS, GPT_SIZES_SOURCE, GPT15_ASPECTS, GPT15_RESOLUTIONS, GPT15_SIZES_SOURCE } from './gptImageSizes.js';
import { ROUTER_SIZE_ASPECTS, ROUTER_SIZE_RULES, routerSizeResolutions } from './routerImageSizes.js';
import { LUMA_OPTIONS, RECRAFT_OPTIONS, FIBO_OPTIONS, type ModelOptions } from './imageOptions.js';
import { IDEOGRAM_ASPECTS, RECRAFT_ASPECTS, LUMA_ASPECTS, KLING_IMAGE_ASPECTS, KREA_ASPECTS, RUNWAY_RATIOS, GROK_IMAGE_ASPECTS, GROK_EDIT_ASPECTS, FLUX3_ASPECTS, FIBO_ASPECTS, FLUX2_ASPECTS, MINIMAX_IMAGE_ASPECTS } from './hostedAspects.js';

/** 0.75K and 1.5K: FLUX 3 Image only (its resolution classes 768sq / 1.5k, about 0.6 and 2.4 MP at any shape). */
export type ImageRes = '0.75K' | '1K' | '1.5K' | '2K' | '4K';
export type Tier = 'low' | 'med' | 'high';
export const ALL_ASPECTS = ['1:1', '3:2', '2:3', '16:9', '9:16', '4:3', '3:4', '21:9'] as const;
export const RES_PX: Record<ImageRes, number> = { '0.75K': 768, '1K': 1024, '1.5K': 1536, '2K': 2048, '4K': 4096 };
export interface ImageCaps {
  aspects: string[]; allowAuto: boolean; defaultAspect: string;
  /** Auto is the model's own choice (the API's auto, or the shape field left out): a run on Auto keeps aspect 'auto' instead of the default shape. */
  nativeAuto?: boolean;
  /** [] = the model has no quality tier (UI hides the chip; only the default `med` is accepted). */
  qualityTiers: Tier[]; defaultTier: Tier | null;
  /** The model's own words for its tiers when they aren't plain quality (Krea 3: thinking modes Fast / Think more / Think most). A model with
   *  its own names starts on its default tier when picked (another model's "high" isn't its "high"). */
  tierNames?: Partial<Record<Tier, { label: string; hint: string }>>;
  /** Tiers that run only at some resolutions (Krea 3: ultra thinking needs 2K). */
  tierNeedsRes?: Partial<Record<Tier, ImageRes[]>>;
  resolutions: ImageRes[]; defaultResolution: ImageRes;
  maxBatch: number;
  supports: { refs: boolean; maxRefs: number; elements: boolean; draw: boolean };
  /** Field names whose value is NOT confirmed by a source (UI may show them; treat as best effort). */
  unverified: string[]; verified: boolean; source: string;
  /** Model-level features (UI chips), e.g. FLUX 3 Klein: edit, layout boxes, text rendering, refs the model accepts on its best route. */
  features?: { edit?: boolean; layoutBoxes?: boolean; textRendering?: boolean; native4K?: boolean; modelMaxRefs?: number; maxRefsByRoute?: Record<string, number>; featureSource?: string };
  /** What an EDIT run (a photo attached) really honours, when it differs from text-to-image (local graphs: comfy/plans.ts editSize).
   *  aspects [] = the output follows the photo's shape (only Auto); resolutions = the sizes the edit graph really renders. */
  edit?: { aspects: string[]; allowAuto: boolean; resolutions: ImageRes[]; note: string };
  /** Extra request options the model documents (shown in the bar's Settings fold; the API takes the same fields): negativePrompt = a "leave this out" text
   *  (sent as negative_prompt, up to NEG_PROMPT_MAX characters); promptRewrite = the model's own prompt rewriting (prompt_extend), off unless turned on. */
  extras?: { negativePrompt?: boolean; promptRewrite?: boolean; /** the model rewrites unless told not to (FLUX.2: prompt_upsampling defaults to true) */ promptRewriteDefault?: boolean; source: string };
  /** Other documented request fields (shared/imageOptions.ts): a small group in Settings, sent as job.input.options. They don't change the price. */
  options?: ModelOptions;
}
/** Longest negative prompt we send (the Router pages give no limit; Alibaba's Model Studio docs cap it at 500 characters). */
export const NEG_PROMPT_MAX = 500;
/** Edit-mode caps: Auto = the photo's shape. */
const followsPhoto = (res: ImageRes[], note: string): NonNullable<ImageCaps['edit']> => ({ aspects: [], allowAuto: true, resolutions: res, note });
const editAny = (res: ImageRes[], note: string, aspects: readonly string[] = ALL_ASPECTS): NonNullable<ImageCaps['edit']> => ({ aspects: [...aspects], allowAuto: true, resolutions: res, note });
const LOCAL_SRC = 'workflows/create-image-*-api.json + server/src/comfy/plans.ts image() (latent width/height/batch_size)';
const CP = 'https://docs.comfy.org/tutorials/partner-nodes/pricing';
const local = (o: { res: ImageRes[]; refs: boolean; draw: boolean; unverified?: string[]; maxRefs?: number; features?: ImageCaps['features']; edit?: ImageCaps['edit'] }): ImageCaps => ({
  aspects: [...ALL_ASPECTS], allowAuto: true, defaultAspect: '1:1', qualityTiers: [], defaultTier: null,
  resolutions: o.res, defaultResolution: '1K', maxBatch: 4,
  supports: { refs: o.refs, maxRefs: o.refs ? o.maxRefs ?? 1 : 0, elements: false, draw: o.draw },
  unverified: ['elements', ...(o.unverified ?? [])], verified: false, source: LOCAL_SRC, ...(o.features ? { features: o.features } : {}), ...(o.edit ? { edit: o.edit } : {}),
});
/** Hosted: only resolutions/tiers the pricing page lists are verified; aspects, batch and ref limits are not on that page. */
const hosted = (o: { res?: ImageRes[]; tiers?: Tier[]; refs: boolean; draw: boolean; resVerified?: boolean; maxRefs?: number }): ImageCaps => ({
  aspects: ['1:1', '16:9', '9:16', '4:3', '3:4'], allowAuto: false, defaultAspect: '1:1',
  qualityTiers: o.tiers ?? [], defaultTier: o.tiers?.length ? (o.tiers.includes('med') ? 'med' : o.tiers[0]) : null,
  resolutions: o.res ?? ['1K'], defaultResolution: (o.res ?? ['1K'])[0], maxBatch: 4 /* routing/run.ts sends one request per image */,
  supports: { refs: o.refs, maxRefs: o.refs ? o.maxRefs ?? 1 : 0, elements: false, draw: o.draw },
  unverified: ['aspects', 'allowAuto', ...(o.maxRefs ? [] : ['maxRefs']), 'elements', ...(o.resVerified ? [] : ['resolutions'])], verified: false, source: CP,
});
/** Nano Banana (Vertex Gemini image models on Comfy Router; checked 2026-10-24). The Router doc (DOC google/<model>) types
 *  generationConfig.imageConfig.aspectRatio as a plain string with no list, so the list is what the model itself takes:
 *  - Nano Banana 2.1 (gemini-nano-banana-2.1) and Nano Banana 2 (gemini-3.1-flash-image): 14 aspects. Vertex model pages ("Supported aspect ratios"),
 *    Google's image guide tables and the Comfy partner node GeminiNanoBanana2V2 (comfy_api_nodes/nodes_gemini.py, the same Vertex proxy) all list them.
 *  - Nano Banana Pro (gemini-3-pro-image): 10. The image guide table and the Comfy partner node GeminiImage2 list 10; the Vertex page lists 14,
 *    so the 4 long shapes stay off until a run proves them.
 *  Auto: aspectRatio left out. Google: "By default, the model matches the output image size to that of your input image, or otherwise generates
 *  1:1 squares"; the partner node says "if no image is provided, a 16:9 square is usually generated". The prompt-only default is unclear, so
 *  Auto is offered for edits only (the result keeps the photo's shape). Every aspect costs the same: Google bills by image size (same tokens per row). */
export const GEMINI_ASPECTS_10 = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const;
export const GEMINI_ASPECTS_14 = [...GEMINI_ASPECTS_10, '1:4', '4:1', '1:8', '8:1'] as const;
const NB_SRC = 'https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini (Supported aspect ratios) + https://ai.google.dev/gemini-api/docs/image-generation (Aspect ratios and image size) + Comfy partner nodes GeminiNanoBanana2V2 / GeminiImage2 (github.com/comfyanonymous/ComfyUI comfy_api_nodes/nodes_gemini.py), read 2026-10-24';
const nanoBanana = (aspects: readonly string[], maxRefs: number): ImageCaps => {
  const h = hosted({ res: ['1K', '2K', '4K'], resVerified: true, refs: true, draw: false, maxRefs });
  return { ...h, aspects: [...aspects], allowAuto: false, defaultAspect: '1:1', unverified: h.unverified.filter((f) => f !== 'aspects' && f !== 'allowAuto'), verified: true, source: `${NB_SRC}; prices ${CP}`,
    edit: editAny(['1K', '2K', '4K'], 'Match photo keeps your photo\'s shape; a picked aspect renders that shape', aspects) };
};
/** A hosted model with its own shape list (shared/hostedAspects.ts: the list, its docs page and the value each shape is sent as).
 *  auto = the API has its own Auto (an enum value, or the field left out), offered first; the run then keeps aspect 'auto'. */
const RM = (p: string) => `docs.comfy.org/development/comfy-router/models/${p}`;
const shaped = (h: ImageCaps, aspects: readonly string[], o: { auto?: boolean; src: string; edit?: ImageCaps['edit'] }): ImageCaps => ({ ...h, aspects: [...aspects], allowAuto: !!o.auto, ...(o.auto ? { nativeAuto: true } : {}),
  defaultAspect: aspects.includes('1:1') ? '1:1' : [...aspects].sort((x, y) => Math.abs(Math.log(ratioOf(x) ?? 1)) - Math.abs(Math.log(ratioOf(y) ?? 1)))[0] /* Runway: 1024:1024 */, unverified: h.unverified.filter((f) => f !== 'aspects' && f !== 'allowAuto'), source: `${o.src} (shapes, read 2026-10-24); prices ${h.source}`, ...(o.edit ? { edit: o.edit } : {}) });
/** GPT Image 2 / 2.5 Flare / 2.5 Sunburst (checked 2026-10-24, shared/gptImageSizes.ts): the API takes an exact WIDTHxHEIGHT; we offer 10 shapes ×
 *  1K / 2K / 4K, each mapped to one exact size (the table there), quality low / medium / high (2.5's xhigh / max not offered). No Auto: the API's
 *  size "auto" lets the model pick the size, so neither the shape nor the price would be known before the run; an edit uses a picked shape too. */
const gptImage = (): ImageCaps => { const h = hosted({ res: [...GPT_IMAGE_RESOLUTIONS], resVerified: true, tiers: ['low', 'med', 'high'], refs: true, draw: true, maxRefs: 16 });
  return { ...h, aspects: [...GPT_IMAGE_ASPECTS], allowAuto: false, defaultAspect: '1:1', unverified: h.unverified.filter((f) => f !== 'aspects' && f !== 'allowAuto'), verified: true, source: `${GPT_SIZES_SOURCE}; prices ${CP}`,
    edit: { aspects: [...GPT_IMAGE_ASPECTS], allowAuto: false, resolutions: [...GPT_IMAGE_RESOLUTIONS], note: 'The result has the shape and size you pick' } }; };
/** GPT Image 1.5 (2026-10-25, shared/gptImageSizes.ts GPT15_*): the three fixed sizes (1:1, 2:3, 3:2 at 1K), quality low / medium / high, edit with
 *  up to 16 images ("gpt-image-1 and later take up to 16") and a mask (Brush Edit). No Auto (size "auto" leaves the size, so the price, unknown). */
const gptImage15 = (): ImageCaps => { const h = hosted({ res: [...GPT15_RESOLUTIONS], resVerified: true, tiers: ['low', 'med', 'high'], refs: true, draw: true, maxRefs: 16 });
  return { ...h, aspects: [...GPT15_ASPECTS], allowAuto: false, defaultAspect: '1:1', unverified: h.unverified.filter((f) => f !== 'aspects' && f !== 'allowAuto'), verified: true, source: `${GPT15_SIZES_SOURCE}; prices https://docs.comfy.org/development/comfy-router/pricing`,
    edit: { aspects: [...GPT15_ASPECTS], allowAuto: false, resolutions: [...GPT15_RESOLUTIONS], note: 'The result has the shape you pick' } }; };
/** Seedream 5.0 Pro / Flash, Qwen Image 3.0 / Pro, Wan 2.5 on Comfy Router (checked 2026-10-24, shared/routerImageSizes.ts): 10 shapes, each sent as one exact
 *  WIDTH×HEIGHT at 1K / 2K (Wan: one size per shape, its pixel range is 1280²…1440²). Edits (Seedream, Qwen): Match photo = the photo's own shape at
 *  the picked size, or a picked shape. No Auto without a photo (the API would pick its own default size). */
const routerSized = (provider: string, o: { maxRefs: number; extras?: Omit<NonNullable<ImageCaps['extras']>, 'source'> }): ImageCaps => {
  const res = routerSizeResolutions(provider) as ImageRes[]; const h = hosted({ res, resVerified: true, refs: o.maxRefs > 0, draw: false, maxRefs: o.maxRefs || undefined });
  const src = ROUTER_SIZE_RULES[provider].source;
  return { ...h, aspects: [...ROUTER_SIZE_ASPECTS], allowAuto: false, defaultAspect: '1:1', unverified: h.unverified.filter((f) => f !== 'aspects' && f !== 'allowAuto' && f !== 'maxRefs'), verified: true, source: `${src} (size, images), read 2026-10-24; prices ${CP} + https://docs.comfy.org/development/comfy-router/pricing`,
    ...(o.maxRefs ? { edit: editAny(res, 'Match photo keeps your photo\'s shape at the size you pick; a picked aspect renders that shape', ROUTER_SIZE_ASPECTS) } : {}),
    ...(o.extras ? { extras: { ...o.extras, source: src } } : {}) };
};
/** Luma UNI-1 / Max edits: on Comfy Router a picked shape is sent (aspect_ratio) and Match photo leaves it out; the fal edit route always keeps the photo's shape. */
const lumaEdit = editAny(['1K'], 'Match photo keeps your photo\'s shape; a picked aspect renders that shape (Comfy Cloud)', LUMA_ASPECTS);
/** Nano Banana 2 Lite on the Gemini API: the 10 shapes of providers/gemini.ts GEMINI_MODELS (same image guide table as Nano Banana Pro), 1K only. */
const nanoBananaLite = (): ImageCaps => { const h = hosted({ res: ['1K'], resVerified: true, refs: true, draw: false, maxRefs: 14 });
  return { ...h, aspects: [...GEMINI_ASPECTS_10], unverified: h.unverified.filter((f) => f !== 'aspects' && f !== 'allowAuto'), source: `https://ai.google.dev/gemini-api/docs/image-generation (Aspect ratios); prices ${CP}`,
    edit: editAny(['1K'], 'Match photo keeps your photo\'s shape; a picked aspect renders that shape', GEMINI_ASPECTS_10) }; };
/** FLUX.2 [pro] / [max]: prompt_upsampling, "Automatically modify prompt for generation", default true (models/black-forest-labs/flux-2-pro and -max). */
const flux2Extras = (p: string): NonNullable<ImageCaps['extras']> => ({ promptRewrite: true, promptRewriteDefault: true, source: RM(p) });
/** Keyed by provider id (create-image providers). refs/draw mirror tools/media.ts providerModes (edit / inpaint). */
export const IMAGE_CAPS: Record<string, ImageCaps> = {
  // local: plans.ts sets latent width/height + batch_size for any aspect. Edit: the official template's two image inputs
  // (TextEncodeQwenImage21 images.image_1 / image_2 + the prompt enhancer's BatchImagesNode): image 1 = the image to edit, image 2 = a reference
  'comfy-qwen21': local({ res: ['1K', '2K'], refs: true, draw: false, maxRefs: 2, unverified: ['resolutions'], edit: editAny(['1K', '2K'], 'Auto follows your photo; 1K / 2K set the encoder size; a picked aspect renders that shape') }),
  // Qwen Image 2.1 Turbo: the official Turbo edit template has ONE image input (8 steps, CFGGuider cfg 8), so one image only (no swaps)
  'comfy-qwen21-turbo': local({ res: ['1K', '2K'], refs: true, draw: false, maxRefs: 1, unverified: ['resolutions'], edit: editAny(['1K', '2K'], 'Auto follows your photo; 1K / 2K set the encoder size; a picked aspect renders that shape') }),
  // Qwen-Image-Edit-2509 takes up to 3 images (TextEncodeQwenImageEditPlus image1–3): workflows/create-image-qwen-edit2509-multiref-api.json (Face Swap = target + face)
  'comfy-qwen-image': local({ res: ['1K', '2K'], refs: true, draw: true, maxRefs: 3, unverified: ['resolutions'], edit: followsPhoto(['1K'], 'Qwen-Image-Edit-2509 scales the photo to about 1 MP (FluxKontextImageScale) and keeps its shape') }),
  // Shots only: Qwen-Image-Edit-2509 + the multiple-angles LoRA (workflows/shots-qwen-edit2509-angles-api.json), one image in
  'comfy-qwen-angles': local({ res: ['1K'], refs: true, draw: false, unverified: ['resolutions'], edit: followsPhoto(['1K'], 'Qwen-Image-Edit-2509 scales the photo to about 1 MP and keeps its shape') }),
  'comfy-zimage-turbo': local({ res: ['1K', '2K'], refs: false, draw: false, unverified: ['resolutions'] }),
  'comfy-zimage': local({ res: ['1K', '2K'], refs: false, draw: false, unverified: ['resolutions'] }),
  // MOSS-Image: trained 1–2 MP, multiples of 16 (docs.comfy.org MOSS-Image tutorial); text-to-image only in our graphs
  'comfy-moss-image': local({ res: ['1K', '2K'], refs: false, draw: false, unverified: ['resolutions'] }),
  'comfy-moss-image-base': local({ res: ['1K', '2K'], refs: false, draw: false, unverified: ['resolutions'] }),
  // FLUX 3 Image Klein: native 4K, edit, multi-reference (BFL API up to 10), bounding-box layout, text rendering (docs.bfl.ml/flux_3/flux3_image_klein + ComfyUI, 2026-10-17).
  // maxRefs 10: local multi-reference graph (workflows/create-image-flux3klein-multiref-api.json) and the BFL route; inpaint uses the first image only; fal is text-to-image.
  'comfy-flux3-klein': { ...local({ res: ['1K', '2K', '4K'], refs: true, draw: true, maxRefs: 10, features: { edit: true, layoutBoxes: true, textRendering: true, native4K: true, modelMaxRefs: 10,
    maxRefsByRoute: { 'local:comfy-flux3-klein': 10, 'direct:bfl/flux-3-image-klein': 10, 'fal:blackforestlabs/flux-3/klein/text-to-image': 0 }, featureSource: 'https://docs.bfl.ml/flux_3/flux3_image_klein' },
    edit: followsPhoto(['1K', '2K', '4K'], 'ReferenceMultiLatent renders the first photo\'s shape at 1, 4 or 16 MP') }),
    // 2026-10-27: the prompt upsampler (Qwen3.5 9B) on the local route, on by default as BFL advises; promptRewrite=0 runs the raw prompt without it (comfy/flux3Klein.ts)
    extras: { promptRewrite: true, promptRewriteDefault: true, source: 'https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy (prompt upsampler)' } },
  'comfy-klein4b': local({ res: ['1K', '2K'], refs: true, draw: false, unverified: ['resolutions'], edit: followsPhoto(['1K', '2K'], 'The latent is the photo scaled to 1 MP (1K) or 4 MP (2K), same shape') }),
  'comfy-flux2dev': local({ res: ['1K', '2K'], refs: true, draw: false, unverified: ['resolutions'], edit: followsPhoto(['1K', '2K'], 'The latent is the photo scaled to 1 MP (1K) or 4 MP (2K), same shape') }),
  // hosted (pricing page lists the resolution / tier rows used below)
  // maxRefs = what our route really sends (Comfy Router body limits in routing/routerModels.ts; image grid finding 1, 2026-10-22)
  'api-seedream': routerSized('api-seedream', { maxRefs: 10 }), // Seedream has no negative prompt; Pro's prompt optimisation takes only its default (standard)
  'api-kling-image': shaped(hosted({ res: ['1K', '2K', '4K'], resVerified: true, refs: true, draw: false, maxRefs: 4 }), KLING_IMAGE_ASPECTS, { auto: true, src: RM('kling/kling-image-o1') }), // fal edit route: same 8 + auto
  'api-qwen-image': routerSized('api-qwen-image', { maxRefs: 3, extras: { negativePrompt: true, promptRewrite: true } }), // Router edit: 1–3 images
  // Added 2026-10-22 (model-catalog pass): limits from each Router schema / vendor docs; resolutions and tiers = the priced ones
  'api-gpt-image-25-flare': gptImage(),
  'api-gpt-image-25-sunburst': gptImage(),
  'api-nano-banana-21': nanoBanana(GEMINI_ASPECTS_14, 14),
  'api-nano-banana-pro': nanoBanana(GEMINI_ASPECTS_10, 14),
  // FLUX 3 Image: resolution 768sq / 1k / 1.5k / 2k / 4k (models/black-forest-labs/flux-3-image); 0.75K and 1.5K run on Comfy Router only (the BFL route sends 1k / 2k / 4k)
  'api-flux3-image': { ...shaped(hosted({ res: ['0.75K', '1K', '1.5K', '2K', '4K'], resVerified: true, refs: true, draw: false, maxRefs: 10 }), FLUX3_ASPECTS, { auto: true, src: RM('black-forest-labs/flux-3-image'), // BFL direct route: same enum
    edit: editAny(['0.75K', '1K', '1.5K', '2K'], 'Auto follows your first photo; BFL caps outputs at 4 MP when reference images are sent, so edits go up to 2K', FLUX3_ASPECTS) }), defaultResolution: '1K' },
  'api-flux2-max': { ...shaped(hosted({ res: ['1K', '2K'], resVerified: true, refs: true, draw: false, maxRefs: 9 }), FLUX2_ASPECTS, { src: RM('black-forest-labs/flux-2-max') }), extras: flux2Extras('black-forest-labs/flux-2-max') }, // width × height per shape: hostedAspects.ts flux2Size
  'api-seedream-flash': routerSized('api-seedream-flash', { maxRefs: 10 }),
  'api-ideogram-45': shaped(hosted({ tiers: ['low', 'med', 'high'], refs: true, draw: true, maxRefs: 5 }), IDEOGRAM_ASPECTS, { auto: true, src: RM('ideogram/ideogram-4-5'),
    edit: editAny(['1K'], 'Match photo keeps your photo\'s size (size "source"); a picked aspect renders that shape', IDEOGRAM_ASPECTS) }), // draw: the mask goes on its fal route (ideogram/v4.5/edit mask_url); the Router body takes none
  'api-qwen-image-pro': routerSized('api-qwen-image-pro', { maxRefs: 3, extras: { negativePrompt: true, promptRewrite: true } }),
  'api-recraft-41': { ...shaped(hosted({ refs: false, draw: false }), RECRAFT_ASPECTS, { src: `${RM('recraft/recraftv4-1')} + recraft.ai/docs/api-reference/appendix` }), options: RECRAFT_OPTIONS },
  'api-recraft-41-pro': { ...shaped(hosted({ res: ['2K'], resVerified: true, refs: false, draw: false }), RECRAFT_ASPECTS, { src: `${RM('recraft/recraftv4-1-pro')} + recraft.ai/docs/api-reference/appendix` }), options: RECRAFT_OPTIONS },
  'api-luma-uni1-max': { ...shaped(hosted({ refs: true, draw: false, maxRefs: 9 }), LUMA_ASPECTS, { src: RM('luma_2/uni-1-max'), edit: lumaEdit }), options: LUMA_OPTIONS },
  'api-hunyuan-image': hosted({ res: ['1K', '2K', '4K'], resVerified: true, refs: false, draw: false }),
  // Added 2026-10-25 (Comfy Router image batch): GPT Image 1.5, Seedream 4.5 (2K / 4K, up to 14 images), Grok Imagine Image Pro (prompt only on Router:
  // its schema takes no image, so no photo button, like Grok 2.0 on Router)
  'api-gpt-image-15': gptImage15(),
  'api-seedream-45': routerSized('api-seedream-45', { maxRefs: 14 }),
  // Bria FIBO 2.0 (2026-10-26): new images in 21 shapes at 1K (1MP) / 4K (4MP) on bria/image; an edit takes ONE photo (+ optional mask) on bria/fibo and keeps its shape
  'api-bria-fibo2': { ...shaped(hosted({ res: ['1K', '4K'], resVerified: true, refs: true, draw: true, maxRefs: 1 }), FIBO_ASPECTS, { src: `${RM('bria/image')} + ${RM('bria/fibo')}`,
    edit: followsPhoto(['1K'], 'The result keeps your photo\'s shape and size') }), options: FIBO_OPTIONS },
  'api-grok-image-pro': shaped(hosted({ res: ['1K', '2K'], resVerified: true, refs: false, draw: false }), GROK_IMAGE_ASPECTS, { auto: true, src: RM('xai/grok-imagine-image-pro') }),
  'api-grok-image': shaped(hosted({ res: ['1K', '2K'], resVerified: true, tiers: ['low', 'med'], refs: true, draw: false, maxRefs: 5 }), GROK_IMAGE_ASPECTS, { auto: true, src: RM('xai/grok-imagine-image-2-0'),
    edit: editAny(['1K', '2K'], 'Edits run on fal: Match photo keeps your photo\'s shape; 9 shapes there', GROK_EDIT_ASPECTS) }), // edits run on fal (xai/grok-imagine-image/v2.0/edit, up to 5 images); the Router body sends no image
  // fal image pass (2026-10-22): Bria GenFill (Brush Edit only): the photo + a mask, one output per request (tools/imageFalModels.ts)
  'fal-bria-genfill': hosted({ refs: true, draw: true, maxRefs: 1 }),
  // photo tools (2026-10-23, tools/imageFalApps.ts): fal-only models, each in one workflow; the photo (and Try-On's garment) in, one image out
  'fal-bria-rmbg': hosted({ refs: true, draw: false, maxRefs: 1 }), 'fal-ideogram-rmbg': hosted({ refs: true, draw: false, maxRefs: 1 }),
  'fal-bria-expand': hosted({ refs: true, draw: false, maxRefs: 1 }), 'fal-ideogram-reframe': hosted({ refs: true, draw: false, maxRefs: 1 }),
  'fal-bria-eraser': hosted({ refs: true, draw: true, maxRefs: 1 }), 'fal-object-removal': hosted({ refs: true, draw: true, maxRefs: 1 }),
  'fal-fashn-tryon': hosted({ refs: true, draw: false, maxRefs: 2 }), 'router-bria-tryon': hosted({ refs: true, draw: false, maxRefs: 2 }) /* Comfy Router, 2026-10-27 */,
  'api-gpt-image': gptImage(),
  'api-ideogram': shaped(hosted({ tiers: ['low', 'med', 'high'], refs: false, draw: false }), IDEOGRAM_ASPECTS, { auto: true, src: RM('ideogram/ideogram-v4') }), // our Router id takes no image and no mask (grid finding 2)
  'api-flux2': { ...shaped(hosted({ res: ['1K', '2K'], resVerified: true, refs: true, draw: false, maxRefs: 9 }), FLUX2_ASPECTS, { src: RM('black-forest-labs/flux-2-pro') }), extras: flux2Extras('black-forest-labs/flux-2-pro') }, // Replicate route: 5 shapes (route caps)
  'api-nano-banana': nanoBanana(GEMINI_ASPECTS_14, 4), // Router body sends imageConfig.imageSize 1K / 2K / 4K (routerModels.ts) // up to 4 images (Comfy Router body and the fal edit route); no mask on either route
  'api-recraft': { ...shaped(hosted({ refs: false, draw: false }), RECRAFT_ASPECTS, { src: `${RM('recraft/recraftv4')} + recraft.ai/docs/api-reference/appendix` }), options: RECRAFT_OPTIONS },
  'api-luma-image': { ...shaped(hosted({ refs: true, draw: false, maxRefs: 9 }), LUMA_ASPECTS, { src: RM('luma_2/uni-1'), edit: lumaEdit }), options: LUMA_OPTIONS },
  // Krea 3: resolution 1k / 2k and thinking_mode fast / high / ultra ("Ultra needs resolution 2k"), models/krea/krea-3; prices per mode × size on
  // development/comfy-router/pricing (Per generation by resolution). Our tiers low / med / high carry the three modes.
  'api-krea': { ...shaped(hosted({ res: ['1K', '2K'], resVerified: true, tiers: ['low', 'med', 'high'], refs: false, draw: false }), KREA_ASPECTS, { auto: true, src: RM('krea/krea-3') }), defaultTier: 'low',
    tierNames: { low: { label: 'Fast', hint: 'Quickest, the usual pick' }, med: { label: 'Think more', hint: 'Plans the picture first, slower' }, high: { label: 'Think most', hint: 'Plans in the most detail' } },
    tierNeedsRes: { high: ['2K'] } },
  // Runway Gen-4 Image: referenceImages[].uri = "A HTTPS URL or data URI" (models/runway/gen4-image), so photos go inline (no public link needed).
  // Up to 3: Runway's API reference (docs.dev.runwayml.com, text_to_image referenceImages); the Router page gives no count. Same price with photos.
  'api-runway-image': shaped(hosted({ refs: true, draw: false, maxRefs: 3 }), RUNWAY_RATIOS, { src: RM('runway/gen4-image'), // Runway's own pixel ratios, sent as they are
    edit: { aspects: [...RUNWAY_RATIOS], allowAuto: false, resolutions: ['1K'], note: 'The result has the ratio you pick; your photos guide it' } }),
  'api-wan-image': routerSized('api-wan-image', { maxRefs: 0, extras: { negativePrompt: true, promptRewrite: true } }),
  'api-meta-muse': hosted({ refs: false, draw: false }), // coming soon (not on Comfy Router): keeps the default five
  // BFL direct (FLUX.2 [flex] / [klein]): free width × height (≥ 64, docs.bfl.ml FLUX.2 [flex] / [klein] API reference); hostedRequests.ts oneMp sends ≤ 1 MP at the shape
  'direct-flux2-flex': shaped(hosted({ refs: true, draw: false, maxRefs: 8 }), FLUX2_ASPECTS, { src: 'https://docs.bfl.ml/api-reference/models/generate-or-edit-an-image-with-flux2-[flex]' }), // input_image … input_image_8
  'direct-flux2-klein-9b': shaped(hosted({ refs: true, draw: false, maxRefs: 4 }), FLUX2_ASPECTS, { src: 'https://docs.bfl.ml/api-reference/models/generate-or-edit-an-image-with-flux2-[klein]-4b' }),
  'direct-minimax-image': shaped(hosted({ refs: false, draw: false }), MINIMAX_IMAGE_ASPECTS, { src: 'https://platform.minimax.io/docs/api-reference/image-generation-t2i' }),
  'direct-gemini-nb2-lite': nanoBananaLite(), // Gemini API: 1K only, up to 14 images (ai.google.dev image guide, 2026-10-23)
  // Image to layers (2026-10-24, shared/imageLayers.ts): one photo in, layers out; size 1K / 2K (Router layer mode); the local Qwen-Image-Layered is listed only (needs a download)
  'api-seedream-layers-flash': hosted({ res: ['1K', '2K'], resVerified: true, refs: true, draw: false, maxRefs: 1 }),
  'api-seedream-layers-pro': hosted({ res: ['1K', '2K'], resVerified: true, refs: true, draw: false, maxRefs: 1 }),
  'comfy-qwen-image-layered': local({ res: ['1K'], refs: true, draw: false, maxRefs: 1, unverified: ['resolutions'] }),
};
/** BH #28: the default tier must be one that has a price. GPT Image's Comfy route prices only `low` (med/high unpublished), so a bare quote
 * (and a submit with no quality) defaulted to the unpriced `med` and 400'd. Default = the model's usual tier when priced, else its first priced tier. */
for (const [id, c] of Object.entries(IMAGE_CAPS)) if (c.qualityTiers.length && usdPerImage(id, c.defaultTier, c.defaultResolution) == null) {
  const priced = c.qualityTiers.find((t) => usdPerImage(id, t, c.defaultResolution) != null); if (priced) c.defaultTier = priced; }
export const capsFor = (providerId: string): ImageCaps | null => IMAGE_CAPS[providerId] ?? null;
/** Every shape some image model takes (the Create Image tool's aspect options and allowlist): the common ones first, then the rest from widest to tallest. */
const COMMON = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '5:4', '4:5', '4:1', '1:4', '8:1', '1:8'];
export const ALL_IMAGE_ASPECTS: string[] = [...COMMON, ...[...new Set(Object.values(IMAGE_CAPS).flatMap((c) => [...c.aspects, ...(c.edit?.aspects ?? [])]))]
  .filter((a) => !COMMON.includes(a)).sort((x, y) => (ratioOf(y) ?? 1) - (ratioOf(x) ?? 1))];

export interface CapsIssue { code: 'unsupported'; field: string; message: string }
/** Validate a raw Create Image request against the model. Missing fields take the model's defaults. */
/** "4:3", "1600:1200", "1600x1200" or "1.333" → width / height (null when it isn't one). */
export function ratioOf(a?: string | null): number | null {
  const s = String(a ?? '').trim(); const m = /^(\d+(?:\.\d+)?)\s*[:x×]\s*(\d+(?:\.\d+)?)$/i.exec(s); if (m) { const w = Number(m[1]), h = Number(m[2]); return w > 0 && h > 0 ? w / h : null; }
  const r = Number(s); return s && Number.isFinite(r) && r > 0 ? r : null;
}
/** The photo already has this shape (1% either way: a fitted / cropped photo is rounded to whole pixels). */
export const sameShape = (photo?: string | null, aspect?: string | null, tol = 0.01): boolean => { const a = ratioOf(photo), b = ratioOf(aspect); return !!a && !!b && Math.abs(a / b - 1) <= tol; };
/** Validate a raw Create Image request against the model. Missing fields take the model's defaults.
 *  photoAspect (2026-10-23, input prep): the shape of the photo being edited. A model whose edits follow the photo can still deliver a picked
 *  aspect when the photo already has it (the bar fits or crops it first): ok, with followsPhoto true (the run renders the photo's own shape). */
export function checkImageCaps(providerId: string, f: { aspect?: string; quality?: string; imageResolution?: string; n?: string | number; refs?: number; mode?: string; photoAspect?: string }):
  { ok: true; aspect: string; tier: Tier | null; imageResolution: ImageRes; n: number; followsPhoto?: boolean; /** D5: settings snapped to the nearest allowed value */ notes?: string[] } | { ok: false; issues: CapsIssue[] } {
  const c = capsFor(providerId); const issues: CapsIssue[] = []; const notes: string[] = [];
  const bad = (field: string, message: string) => issues.push({ code: 'unsupported', field, message });
  if (!c) return { ok: true, aspect: f.aspect && f.aspect !== 'auto' ? f.aspect : '1:1', tier: null, imageResolution: '1K', n: Number(f.n) || 1 };
  const ed = f.mode === 'edit' ? c.edit : undefined; const aspects = ed ? ed.aspects : c.aspects; const allowAuto = ed ? ed.allowAuto : c.allowAuto;
  let aspect = f.aspect || 'auto'; let viaPhoto = false;
  if (aspect !== 'auto' && ed && !ed.aspects.length && !aspects.includes(aspect) && sameShape(f.photoAspect, aspect)) viaPhoto = true; // the photo is already that shape
  /* Auto means "the app picks" (2026-10-27: Product Shot and other Auto workflows showed every cloud model as "Not for these settings"): a model
   *  with its own Auto gets it; any other takes the listed shape closest to the photo, else its default. Never an error. */
  else if (aspect === 'auto') aspect = allowAuto && c.nativeAuto ? 'auto' /* the API's own Auto: the route sends its auto value (or leaves the shape out) */
    : closestAspect(aspects, ratioOf(f.photoAspect)) ?? c.defaultAspect;
  else if (!aspects.includes(aspect)) { // D5 (2026-10-28): the closest shape this model makes, with a note (never refused)
    const asked = aspect; const to = closestAspect(aspects, ratioOf(asked)) ?? (allowAuto && c.nativeAuto ? 'auto' : closestAspect(aspects, ratioOf(f.photoAspect)) ?? c.defaultAspect);
    if (!ratioOf(asked)) bad('aspect', `Aspect ${asked} isn't a shape. Use one like 16:9.`);
    else { aspect = to; notes.push(aspects.length ? snapNote('shape', asked, to) : `Made in your photo's shape: this model keeps it when editing (you picked ${asked}).`); } }
  let tier: Tier | null = c.defaultTier;
  const tierWord = (t: string) => c.tierNames?.[t as Tier]?.label ?? ({ low: 'Low', med: 'Medium', high: 'High' } as Record<string, string>)[t] ?? t;
  if (f.quality) { if (c.qualityTiers.length) { if (!c.qualityTiers.includes(f.quality as Tier)) notes.push(snapNote('quality', tierWord(f.quality), tierWord(String(tier)))); /* D5: the model's usual quality */ else tier = f.quality as Tier; }
    else if (f.quality !== 'med') notes.push(`This model has no quality setting, so ${tierWord(f.quality)} was left out.`); }
  const resList = ed ? ed.resolutions : c.resolutions; let res = (f.imageResolution || (resList.includes(c.defaultResolution) ? c.defaultResolution : resList[0])) as ImageRes;
  if (!resList.includes(res)) { const to = (nearestTier(resList, res) ?? resList[0]) as ImageRes; if (to) { notes.push(snapNote('size', res, to, ed ? 'when editing' : undefined)); res = to; } else bad('imageResolution', `Resolution must be one of ${resList.join(', ')} for this model${ed ? ' when editing' : ''}.`); } // D5: the nearest size
  if (tier && c.tierNeedsRes?.[tier] && !c.tierNeedsRes[tier]!.includes(res)) { const ok = c.tierNeedsRes[tier]!.filter((x) => resList.includes(x as ImageRes)); const to = (nearestTier(ok, res) ?? ok[0]) as ImageRes | undefined;
    if (to) { notes.push(`${tierWord(tier)} needs ${c.tierNeedsRes[tier]!.join(' or ')}, so it was made at ${to} (you picked ${res}).`); res = to; } else bad('quality', `${tierWord(tier)} needs ${c.tierNeedsRes[tier]!.join(' or ')}; pick that size or another mode.`); } // D5
  const n = Number(f.n ?? 1) || 1;
  if (n > c.maxBatch) bad('n', `This model makes at most ${c.maxBatch} image${c.maxBatch > 1 ? 's' : ''} per run.`);
  const refs = f.refs ?? 0; const imgs = (k: number) => `${k} image${k === 1 ? '' : 's'}`; // the menu's hover card and Generate show these as-is
  if (refs > c.supports.maxRefs) bad('refs', c.supports.maxRefs ? `Takes up to ${imgs(c.supports.maxRefs)}; you have ${refs}.` : `Takes no images; you have ${refs}.`);
  if (f.mode === 'inpaint' && !c.supports.draw) bad('mode', 'Can’t edit with a mask; remove the mask or pick a model that can.');
  return issues.length ? { ok: false, issues } : { ok: true, aspect, tier, imageResolution: res, n, ...(viaPhoto ? { followsPhoto: true } : {}), ...(notes.length ? { notes } : {}) };
}

/** USD per image for (tier, resolution) from HOSTED_BY_ID; null = no published price for that cell. Local/open = 0. */
export function usdPerImage(providerId: string, tier: Tier | null, res: ImageRes): number | null {
  const h = HOSTED_BY_ID[providerId]; if (!h) return 0;
  if (tier && h.usdByTierRes?.[`${tier}:${res}`] != null) return h.usdByTierRes[`${tier}:${res}`];
  if (h.usdByTierRes && tier && Object.keys(h.usdByTierRes).some((k) => k.startsWith(tier + ':'))) return null;
  if (tier && h.usdByTier && tier in h.usdByTier) return h.usdByTier[tier] ?? null;
  if (h.usdByResolution) return h.usdByResolution[res] ?? null;
  return h.usd;
}
/** Credits per image (rounded, min 1 when hosted) — the total is this × n (same as priceOf `count`). */
export const creditsPerImage = (providerId: string, tier: Tier | null, res: ImageRes): number | null => {
  const u = usdPerImage(providerId, tier, res); if (u == null) return null; if (!HOSTED_BY_ID[providerId]) return 0;
  return Math.max(1, usdToCredits(u)); // same rounding as priceOf (rounded up per image)
};
/** { [tier|'default']: { [res]: credits per image | null } } for the model's own tiers × resolutions. */
export function priceMatrix(providerId: string) {
  const c = capsFor(providerId); if (!c) return null;
  const tiers = c.qualityTiers.length ? c.qualityTiers : [null];
  return Object.fromEntries(tiers.map((t) => [t ?? 'default', Object.fromEntries(c.resolutions.map((r) => [r, creditsPerImage(providerId, t, r)]))]));
}

/** Pixel size for (aspect, resolution): long side = 1024/2048/4096, short side by aspect, both multiples of 16. */
export function imageSize(aspect: string, res: ImageRes) {
  const [a, b] = aspect.split(':').map(Number); const L = RES_PX[res] ?? 1024; if (!a || !b) return { width: L, height: L };
  const S = Math.round((L * Math.min(a, b)) / Math.max(a, b) / 16) * 16;
  return a >= b ? { width: L, height: S } : { width: S, height: L };
}
