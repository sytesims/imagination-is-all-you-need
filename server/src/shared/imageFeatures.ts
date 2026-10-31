/**
 * Images, radical transparency. One isomorphic source of truth for the image features:
 *  - Feature = what you want done, with its approved plain name (step 3) and URL. Internal tool ids stay as they were (saved jobs keep working).
 *  - Model = what does it, always shown by its real name ("Relight · Nano Banana 2").
 *  - Workflow = how it is done: the ComfyUI workflow each feature + model pair is credited with (shared/workflowSources.ts, generated from the image grid).
 *  - Supports = what that pair allows (aspects, resolutions, reference images, mask, seed, count), so the UI shows only those options.
 * Only models that really work for a feature are listed (grid support native / chained AND a route this app wires today).
 * Edit Image is not a menu item: like the reference, editing lives inside Create Image (add an image or pick an edit model);
 * the label "Edit Image · <Model>" still names edit runs.
 * Web imports this file (web/src/shared/imageFeatures.ts re-exports it).
 */
import { IMAGE_PAGE, OLD_IMAGE_PAGE } from './pages.js';
import { IMAGE_CAPS, type ImageRes, type Tier } from './imageCaps.js';
import { GRID_MODELS, GRID_WORKFLOWS, type WorkflowSource } from './workflowSources.js';
import { UPSCALE_ORDER, UPSCALE_MODELS, UPSCALE_MODEL_NAMES, UPSCALE_WORKFLOWS } from './imageUpscale.js';
import { defaultsOfFeature } from './imageDefaults.js';
import { LAYER_MODELS, LAYERS_FLASH, LAYERS_PRO, LAYERS_LOCAL, QWEN_LAYERED_TEMPLATE } from './imageLayers.js';

export type { WorkflowSource } from './workflowSources.js';
export type ImageFeatureId = 'create-image' | 'edit-image' | 'upscale' | 'relight' | 'face-swap' | 'person-swap' | 'camera-angles' | 'camera-lens' | 'brush-edit' | 'character-sheet' | 'product-shot' | 'remove-bg' | 'expand' | 'erase' | 'try-on' | 'image-layers' | 'material-swap' | 'ad-pack';
type Mode = 'generate' | 'edit' | 'inpaint' | 'upscale';

export interface ImageFeature {
  id: ImageFeatureId; name: string;
  /** The server tool that runs it (stable id; saved jobs and the API keep using it). */ toolId: string;
  /** The page URL (plain name). */ route: string;
  /** Shown in the Image menu, drawer, /image page and search (Edit Image is not: it lives inside Create Image). */ inMenu: boolean;
  /** The mode it runs in on the base tool. */ mode: Mode;
  /** Image inputs [min, max]; 'model' = up to what the model takes. */ images: [number, number | 'model'];
  /** The feature exposes aspect / resolution choices (apps that follow the photo don't). */ aspects: boolean; resolutions: boolean;
  /** Most outputs per run ('model' = the model's batch size). */ count: number | 'model';
  /** Which grid feature's workflow a model runs for this feature (the workflow that really runs, not an upgrade we haven't wired). */ grid: string;
  /** What we add on top of the workflow, in plain words (null = nothing). */ recipe: string | null;
  tagline: string; description: string;
  /** Old names and URLs (they redirect here). */ was: string; oldRoutes: string[];
  /** Models that really work here, in quality order (provider ids). */ providers: string[];
}

/** Text-to-image models with a wired route today. Not listed (not runnable here): FLUX.2 [flex] (BFL route not wired), HY Image 3.5 and Muse (not on Comfy Router). */
export const GENERATE_MODELS = ['api-nano-banana', 'api-gpt-image', 'comfy-flux3-klein', 'api-seedream', 'api-flux2', 'api-ideogram', 'api-recraft', 'api-luma-image', 'api-kling-image', 'api-krea',
  'api-runway-image', 'api-grok-image', 'api-qwen-image', 'api-wan-image',
  // added 2026-10-22 (model-catalog pass): newest hosted models, each with a priced Comfy Router route (FLUX 3 Image also on BFL, FLUX.2 [max] on fal, Nano Banana Pro on Replicate)
  'api-gpt-image-25-flare', 'api-gpt-image-25-sunburst', 'api-nano-banana-21', 'api-nano-banana-pro', 'api-flux3-image', 'api-flux2-max', 'api-seedream-flash', 'api-ideogram-45', 'api-qwen-image-pro',
  'api-recraft-41', 'api-recraft-41-pro', 'api-luma-uni1-max',
  // added 2026-10-25 (Comfy Router image batch)
  'api-gpt-image-15', 'api-seedream-45', 'api-grok-image-pro', 'direct-gemini-nb2-lite' /* Gemini API + Comfy Router */,
  'api-bria-fibo2' /* 2026-10-26: Bria FIBO 2.0 on Comfy Router (bria/image) */,
  // official lab APIs (2026-10-23): BFL FLUX.2 [flex] / [klein] 9B, MiniMax image-01
  'direct-flux2-flex', 'direct-flux2-klein-9b', 'direct-minimax-image',
  'comfy-qwen21', 'comfy-qwen21-turbo', 'comfy-qwen-image', 'comfy-zimage-turbo', 'comfy-zimage', 'comfy-klein4b', 'comfy-flux2dev', 'comfy-moss-image', 'comfy-moss-image-base'];
/** Edit models whose route really sends the image. Not listed: Ideogram V4, Krea 3, Recraft V4 / V4.1 (their Comfy Router body sends no image).
 *  Runway Gen-4 Image (2026-10-24): its photos guide the picture (referenceImages, up to 3). */
export const EDIT_MODELS = ['api-nano-banana', 'api-gpt-image', 'comfy-flux3-klein', 'api-seedream', 'api-flux2', 'api-luma-image', 'api-kling-image',
  'api-gpt-image-25-flare', 'api-gpt-image-25-sunburst', 'api-nano-banana-21', 'api-nano-banana-pro', 'api-flux3-image', 'api-flux2-max', 'api-seedream-flash', 'api-ideogram-45', 'api-qwen-image-pro', 'api-qwen-image', 'api-luma-uni1-max',
  'comfy-qwen21', 'comfy-qwen21-turbo', 'comfy-qwen-image', 'comfy-klein4b', 'comfy-flux2dev',
  'direct-flux2-flex', 'direct-flux2-klein-9b' /* BFL API edit routes (up to 8 / 4 images) */,
  // fal image pass (2026-10-22): Grok Imagine Image 2.0 edits on its fal route (xai/grok-imagine-image/v2.0/edit, up to 5 images)
  'api-grok-image', 'api-runway-image',
  'api-gpt-image-15', 'api-seedream-45', 'direct-gemini-nb2-lite' /* 2026-10-25: Router edits (up to 16 / 14 / 14 images; Nano Banana 2 Lite also on the Gemini API) */,
  'api-bria-fibo2' /* 2026-10-26: FIBO 2.0 edits one photo (Router bria/fibo) */];
/** Two-image edits (target + face / person): models whose route takes at least 2 images. Qwen Image 2.1 = the official edit template's two inputs
 * (grid finding 4, wired 2026-10-22). Not listed: FLUX.2 [klein] 4B (1 image wired), Qwen Image 2.1 Turbo (its official edit template takes one image). */
export const TWO_IMAGE_MODELS = ['comfy-qwen-image', 'api-nano-banana', 'comfy-flux3-klein', 'api-gpt-image', 'api-seedream', 'api-flux2', 'api-luma-image', 'api-kling-image', 'comfy-qwen21'];
/** Material Swap (2026-10-31): local Qwen Image 2.1 first (free, its official edit template's two inputs), then hosted edit models whose route takes
 *  2+ images and whose prompt rules we word for (tools/apps.ts materialSwapPrompt): Nano Banana 2, GPT Image, Seedream 5.0, Qwen Image 3.0. */
export const MATERIAL_SWAP_MODELS = ['comfy-qwen21', 'api-nano-banana', 'api-gpt-image', 'api-seedream', 'api-qwen-image'];
/** Ad Pack (2026-10-31): edit models that take the product photo plus up to two more and draw clean words (shared/adPack.ts wording per family):
 *  GPT Image first (the cloud default: best text, user 2026-10-31), Nano Banana 2, local Qwen Image 2.1 (free; its edit template takes two photos), then Seedream 5.0, FLUX.2, FLUX 3 Klein. */
export const AD_PACK_MODELS = ['api-gpt-image', 'api-nano-banana', 'comfy-qwen21', 'api-seedream', 'api-flux2', 'comfy-flux3-klein'];
/** Mask (inpaint) models: only routes that take a mask. Not listed: Nano Banana 2 and Ideogram V4 (no mask on their routes). Ideogram 4.5 inpaints on fal only. */
export const MASK_MODELS = ['api-gpt-image', 'api-gpt-image-25-flare', 'api-gpt-image-25-sunburst', 'api-gpt-image-15' /* 2026-10-25 */, 'api-bria-fibo2' /* 2026-10-26 */, 'comfy-flux3-klein', 'comfy-qwen-image',
  // fal image pass (2026-10-22): Ideogram 4.5 (mask on ideogram/v4.5/edit) and Bria GenFill (fal-ai/bria/genfill, a Brush Edit-only model)
  'api-ideogram-45', 'fal-bria-genfill'];
const TPL_URL = 'https://github.com/Comfy-Org/workflow_templates/blob/main/templates/';
/** Our request to a fal endpoint, built from its published schema (no ComfyUI template exists for that model). A hosted model (2026-10-28):
 *  credited to fal and the model's maker under their terms; only our request code is AGPL. */
const falRequest = (slug: string): WorkflowSource => ({ source: 'ours', name: `${slug} on fal`, url: `https://fal.ai/models/${slug}/api`, author: 'Run by fal; our request code', licence: 'fal and model maker terms (hosted model) · our request code: AGPL-3.0 (this repo)' });
/** Photo tools (2026-10-23): fal-only models, one workflow each (quality / default first). */
export const REMOVE_BG_MODELS = ['fal-bria-rmbg', 'fal-ideogram-rmbg'];
export const EXPAND_MODELS = ['fal-bria-expand', 'fal-ideogram-reframe'];
export const ERASE_MODELS = ['fal-bria-eraser', 'fal-object-removal'];
export const TRYON_MODELS = ['fal-fashn-tryon', 'router-bria-tryon' /* Comfy Router (one key runs everything, 2026-10-27) */];
/** Tool models that are not in the image grid (fal-only, one feature each): their real name and the workflow they are credited with. */
export const TOOL_MODELS: Record<string, { name: string; source: WorkflowSource }> = {
  'fal-bria-genfill': { name: 'Bria GenFill', source: { source: 'official', name: 'Bria: GenFill (api_bria_genfill)', url: 'https://github.com/Comfy-Org/workflow_templates/blob/main/templates/api_bria_genfill.json', author: 'Comfy Org', licence: 'MIT (Comfy-Org/workflow_templates)' } },
  // photo tools (2026-10-23, tools/imageFalApps.ts): Bria's three have an official Comfy partner template (same Bria API); the others credit our fal request
  'fal-bria-rmbg': { name: 'Bria RMBG 2.0', source: { source: 'official', name: 'Bria: Remove Image Background (utility_bria_remove_image_background)', url: `${TPL_URL}utility_bria_remove_image_background.json`, author: 'Comfy Org', licence: 'MIT (Comfy-Org/workflow_templates)' } },
  'fal-ideogram-rmbg': { name: 'Ideogram Remove Background', source: falRequest('fal-ai/ideogram/remove-background') },
  'fal-bria-expand': { name: 'Bria Expand', source: { source: 'official', name: 'Bria: Expand Image (api_bria_expand_image)', url: `${TPL_URL}api_bria_expand_image.json`, author: 'Comfy Org', licence: 'MIT (Comfy-Org/workflow_templates)' } },
  'fal-ideogram-reframe': { name: 'Ideogram 3.0 Reframe', source: falRequest('fal-ai/ideogram/v3/reframe') },
  'fal-bria-eraser': { name: 'Bria Eraser', source: { source: 'official', name: 'Bria: Eraser (api_bria_eraser)', url: `${TPL_URL}api_bria_eraser.json`, author: 'Comfy Org', licence: 'MIT (Comfy-Org/workflow_templates)' } },
  'fal-object-removal': { name: 'fal Object Removal', source: falRequest('fal-ai/object-removal/mask') },
  'fal-fashn-tryon': { name: 'FASHN Virtual Try-On v1.6', source: falRequest('fal-ai/fashn/tryon/v1.6') },
  /* a hosted model (2026-10-28, transparency audit): Bria's model, run by Comfy Router under Bria's terms; only our request code is AGPL */
  'router-bria-tryon': { name: 'Bria Virtual Try-On', source: { source: 'ours', name: 'Bria Product Virtual Try-On (bria/image-edit-product-virtual-tryon) on Comfy Router', url: 'https://docs.comfy.org/development/comfy-router/models/bria/image-edit-product-virtual-tryon/code', author: 'Bria, run by Comfy Router; our request code', licence: 'Bria terms (hosted model) · our request code: AGPL-3.0 (this repo)' } },
  // Image to layers (2026-10-24, shared/imageLayers.ts): Seedream 5.0 layer separation (the official Comfy partner template, same API on Comfy Router) and the
  // local Qwen-Image-Layered template (listed with its download size; not downloaded)
  [LAYERS_FLASH]: { name: 'Seedream 5.0 Flash', source: { source: 'official', name: 'ByteDance Seedream 5.0: Layer Separation (api_bytedance_seedream_5_0_layer_separation)', url: `${TPL_URL}api_bytedance_seedream_5_0_layer_separation.json`, author: 'Comfy Org', licence: 'MIT (Comfy-Org/workflow_templates)' } },
  [LAYERS_PRO]: { name: 'Seedream 5.0 Pro', source: { source: 'official', name: 'ByteDance Seedream 5.0: Layer Separation (api_bytedance_seedream_5_0_layer_separation)', url: `${TPL_URL}api_bytedance_seedream_5_0_layer_separation.json`, author: 'Comfy Org', licence: 'MIT (Comfy-Org/workflow_templates)' } },
  [LAYERS_LOCAL]: { name: 'Qwen-Image-Layered', source: { source: 'official', name: 'Qwen-Image-Layered Decomposition (image_qwen_image_layered)', url: QWEN_LAYERED_TEMPLATE, author: 'Comfy Org', licence: 'MIT (Comfy-Org/workflow_templates); model Apache-2.0' } },
};

/** Create Image's page: /image (shared/pages.ts). Every image feature opens it, with its workflow picked. */
export { IMAGE_PAGE, OLD_IMAGE_PAGE };
export const IMAGE_FEATURES: ImageFeature[] = [
  { id: 'create-image', name: 'Create Image', toolId: 'create-image', route: IMAGE_PAGE, inMenu: true, mode: 'generate', images: [0, 'model'], aspects: true, resolutions: true, count: 'model', grid: 'create-image', recipe: null,
    tagline: 'Text to image, or edit a photo with a prompt', description: 'Describe a picture and pick the model that makes it. Add an image to edit it instead.', was: 'Create Image + OpenSoul page', oldRoutes: ['/soul', '/tools/soul', '/tools/opensoul', OLD_IMAGE_PAGE], providers: GENERATE_MODELS },
  { id: 'edit-image', name: 'Edit Image', toolId: 'create-image', route: `${IMAGE_PAGE}?mode=edit`, inMenu: false, mode: 'edit', images: [1, 'model'], aspects: true, resolutions: true, count: 'model', grid: 'edit-image', recipe: null,
    tagline: 'Change a photo with a prompt', description: 'Inside Create Image: add an image and describe the change.', was: 'Create Image edit mode', oldRoutes: ['/tools/edit-image'], providers: EDIT_MODELS },
  { id: 'upscale', name: 'Upscale', toolId: 'image-upscale', route: `${IMAGE_PAGE}?workflow=upscale` /* Create Image's bar (unified Create, 2026-10-22); the old page redirects */, inMenu: true, mode: 'upscale', images: [1, 1], aspects: false, resolutions: false, count: 1, grid: 'upscale', recipe: null,
    tagline: 'Sharper, larger images: 2x, 4x or 8x', description: 'Make an image 2x, 4x or 8x larger and sharper: SeedVR2, Crystal, Topaz, Bria, Z-Image-Turbo 2K, 4x Nomos2 or the classic Real-ESRGAN and 4x-UltraSharp.', was: 'Image Upscale', oldRoutes: ['/tools/image-upscale'], providers: [...UPSCALE_ORDER] },
  { id: 'relight', name: 'Relight', toolId: 'app-relight', route: `${IMAGE_PAGE}?workflow=relight` /* Create Image's bar with this workflow picked (unified Create); the old page redirects */, inMenu: true, mode: 'edit', images: [1, 1], aspects: false, resolutions: false, count: 1, grid: 'edit-image',
    recipe: 'Our light recipe: direction, softness, brightness and colour become one edit prompt.', tagline: 'Move and recolour the light in a photo', description: 'Change where the light comes from, how hard, how bright and what colour; the subject, pose and framing stay.', was: 'Relight', oldRoutes: ['/tools/app-relight'], providers: EDIT_MODELS },
  { id: 'face-swap', name: 'Face Swap', toolId: 'app-face-swap', route: `${IMAGE_PAGE}?workflow=face-swap` /* Create Image's bar with this workflow picked (unified Create); the old page redirects */, inMenu: true, mode: 'edit', images: [2, 2], aspects: false, resolutions: false, count: 1, grid: 'face-swap',
    recipe: 'Our two-image swap prompt: image 1 is the target photo, image 2 the face.', tagline: 'A face from one photo onto another', description: 'Put the face from one photo onto the person in another. Pose, light, hair and background stay as they were.', was: 'Face Swap', oldRoutes: ['/tools/app-face-swap'], providers: TWO_IMAGE_MODELS },
  { id: 'person-swap', name: 'Person Swap', toolId: 'app-person-swap', route: `${IMAGE_PAGE}?workflow=person-swap` /* Create Image's bar with this workflow picked (unified Create); the old page redirects */, inMenu: true, mode: 'edit', images: [2, 2], aspects: false, resolutions: false, count: 1, grid: 'character-swap',
    recipe: 'Our two-image prompt: the whole person from image 2 replaces the person in image 1.', tagline: 'Put a whole person into another photo', description: 'Replace the person in a photo with the person from another photo: face, hair, body and outfit. Pose, framing and the scene stay.', was: 'new for images (video Object Swap only)', oldRoutes: ['/tools/person-swap', '/tools/app-person-swap', '/tools/character-swap'], providers: TWO_IMAGE_MODELS },
  { id: 'camera-angles', name: 'Camera Angles', toolId: 'app-shots', route: `${IMAGE_PAGE}?workflow=camera-angles` /* Create Image's bar with this workflow picked (unified Create, 2026-10-23); the old page redirects */, inMenu: true, mode: 'edit', images: [1, 1], aspects: false, resolutions: false, count: 9, grid: 'edit-image',
    recipe: 'One edit per angle, each with our angle prompt.', tagline: 'Up to nine new viewpoints from one photo', description: 'One photo becomes up to nine camera angles of the same subject: front, three-quarter, side, back, low, high, close-up and wide.', was: 'Shots', oldRoutes: ['/tools/camera-angles', '/tools/app-shots', '/tools/shots'],
    providers: ['comfy-qwen-image', 'api-nano-banana', 'comfy-flux3-klein', 'comfy-qwen-angles', 'api-gpt-image', 'api-seedream', 'api-flux2', 'api-luma-image', 'api-kling-image', 'comfy-qwen21', 'comfy-qwen21-turbo', 'comfy-klein4b', 'comfy-flux2dev'] },
  { id: 'camera-lens', name: 'Camera & Lens', toolId: 'create-image', route: `${IMAGE_PAGE}?workflow=camera-lens` /* Create Image's bar with this workflow picked (unified Create, 2026-10-23); the old page redirects */, inMenu: true, mode: 'generate', images: [0, 'model'], aspects: true, resolutions: true, count: 'model', grid: 'create-image',
    recipe: 'Our camera recipe: body, lens, focal length and aperture become one camera sentence added to your prompt. A prompt-driven look, not a physical simulation.', tagline: 'Pick a camera body, lens, focal length and aperture', description: 'Create Image with a camera rig: pick the body, lens, focal length and aperture; works on any Create Image model.', was: 'part of OpenSoul (looks)', oldRoutes: ['/tools/camera-lens'], providers: GENERATE_MODELS },
  { id: 'brush-edit', name: 'Brush Edit', toolId: 'app-inpaint', route: `${IMAGE_PAGE}?workflow=brush-edit` /* Create Image's bar with this workflow picked (unified Create, 2026-10-23); the old page redirects */, inMenu: true, mode: 'inpaint', images: [1, 1], aspects: false, resolutions: false, count: 1, grid: 'inpaint', recipe: null,
    tagline: 'Paint over an area, describe the change', description: 'Paint over the area to change and describe it; everything else stays as it was.', was: 'Inpaint', oldRoutes: ['/tools/brush-edit', '/tools/app-inpaint', '/tools/inpaint'], providers: MASK_MODELS },
  // Photo tools (2026-10-23): hosted on fal (tools/imageFalApps.ts), each in Create Image's bar; no local model for them is installed.
  { id: 'remove-bg', name: 'Remove Background', toolId: 'app-remove-bg', route: `${IMAGE_PAGE}?workflow=remove-bg`, inMenu: true, mode: 'edit', images: [1, 1], aspects: false, resolutions: false, count: 1, grid: 'remove-bg', recipe: null,
    tagline: 'Cut out the subject on a transparent background', description: 'Keeps the subject and makes everything else transparent: a PNG you can drop on any background.', was: 'new', oldRoutes: ['/tools/app-remove-bg'] /* /tools/remove-bg is the video tool */, providers: REMOVE_BG_MODELS },
  { id: 'expand', name: 'Expand', toolId: 'app-expand', route: `${IMAGE_PAGE}?workflow=expand`, inMenu: true, mode: 'edit', images: [1, 1], aspects: false, resolutions: false, count: 1, grid: 'expand', recipe: null,
    tagline: 'Add room around a photo to fit a new shape', description: 'Pick a new shape; the model paints the missing area around your photo, which stays as it was.', was: 'new', oldRoutes: ['/tools/expand', '/tools/app-expand'], providers: EXPAND_MODELS },
  { id: 'erase', name: 'Erase Object', toolId: 'app-erase', route: `${IMAGE_PAGE}?workflow=erase`, inMenu: true, mode: 'inpaint', images: [1, 1], aspects: false, resolutions: false, count: 1, grid: 'erase', recipe: null,
    tagline: 'Paint over something to remove it', description: 'Paint over a person, object or text; it disappears and the background is filled in. No prompt needed.', was: 'new', oldRoutes: ['/tools/erase', '/tools/app-erase'], providers: ERASE_MODELS },
  { id: 'try-on', name: 'Virtual Try-On', toolId: 'app-try-on', route: `${IMAGE_PAGE}?workflow=try-on`, inMenu: true, mode: 'edit', images: [2, 2], aspects: false, resolutions: false, count: 1, grid: 'try-on', recipe: null,
    tagline: 'Put a garment from one photo on a person', description: 'A photo of a person and a photo of a top, bottom or one-piece: the person wears it, pose and face kept.', was: 'new', oldRoutes: ['/tools/try-on', '/tools/app-try-on'], providers: TRYON_MODELS },
  { id: 'material-swap', name: 'Material Swap', toolId: 'app-material-swap', route: `${IMAGE_PAGE}?workflow=material-swap`, inMenu: true, mode: 'edit', images: [2, 2], aspects: false, resolutions: false, count: 1, grid: 'edit-image',
    recipe: 'Our material prompt: the object in image 1 takes the material and texture of image 2, everything else kept; worded for each model.', tagline: 'Give an object the material from another photo',
    description: 'A photo of an object and a photo of a material: the object takes that material, its shape, light and scene kept.', was: 'new', oldRoutes: ['/tools/material-swap', '/tools/app-material-swap'], providers: MATERIAL_SWAP_MODELS },
  { id: 'ad-pack', name: 'Ad Pack', toolId: 'app-ad-pack', route: `${IMAGE_PAGE}?workflow=ad-pack`, inMenu: true, mode: 'edit', images: [1, 3], aspects: false, resolutions: false, count: 5, grid: 'edit-image',
    recipe: 'Our ad prompts: one per style, worded for each model, with your headline, offer and brand colours; your logo added after by code.', tagline: 'Finished ads from one product photo',
    description: 'A product photo and your offer: finished ads in several styles, sized for the platform, with your logo added.', was: 'new', oldRoutes: ['/tools/ad-pack', '/tools/app-ad-pack'], providers: AD_PACK_MODELS },
  // Image to layers (2026-10-24): Seedream 5.0 layer separation on Comfy Router (Flash default, Pro), Qwen-Image-Layered listed for Local (needs a download)
  { id: 'image-layers', name: 'Image to layers', toolId: 'app-image-layers', route: `${IMAGE_PAGE}?workflow=image-layers`, inMenu: true, mode: 'edit', images: [1, 1], aspects: false, resolutions: true, count: 1, grid: 'image-layers', recipe: null,
    tagline: 'Split a photo into separate transparent layers', description: 'One photo in: the background and each element (people, objects, text) come back as their own transparent PNG layers, ready to move or edit.', was: 'new', oldRoutes: ['/tools/image-layers', '/tools/app-image-layers'], providers: LAYER_MODELS },
  { id: 'character-sheet', name: 'Character Sheet', toolId: 'app-character-sheet', route: `${IMAGE_PAGE}?workflow=character-sheet` /* Create Image's bar with this workflow picked (unified Create); the old page redirects */, inMenu: true, mode: 'generate', images: [0, 1], aspects: false, resolutions: false, count: 'model', grid: 'create-image',
    recipe: 'Our character-sheet prompt: pick a layout (Classic front, back and face; a four-view turnaround, with or without a face close-up; six expressions; or the full sheet) on one grey studio backdrop, in the shape that layout needs; with your photo it runs as an edit that keeps the same person and outfit.', tagline: 'One character, many panels, flat backdrop', description: 'One image, same person in several panels on a flat background: a reusable reference.', was: 'Character Sheet', oldRoutes: ['/tools/app-character-sheet'], providers: GENERATE_MODELS },
  { id: 'product-shot', name: 'Product Shot', toolId: 'app-product-shot', route: `${IMAGE_PAGE}?workflow=product-shot` /* Create Image's bar with this workflow picked (unified Create); the old page redirects */, inMenu: true, mode: 'generate', images: [0, 1], aspects: true, resolutions: true, count: 'model', grid: 'create-image',
    recipe: 'Our product scene prompts (studio, lifestyle…); with a product photo it runs as an edit that keeps the product.', tagline: 'Studio or lifestyle shots of a product', description: 'Turn a product photo into a clean studio or lifestyle shot; the product stays as it is.', was: 'Product Shot', oldRoutes: ['/tools/app-product-shot'], providers: GENERATE_MODELS },
];
export const featureById = (id: string): ImageFeature | undefined => IMAGE_FEATURES.find((f) => f.id === id);
/** The 854×480 photo floor is a video start-frame rule: an image tool (Create / Edit Image, Upscale, Relight, Face Swap…) takes a photo of any size. */
export const minPhotoPixelsFor = (toolId: string, videoFloor: number): number => (IMAGE_FEATURES.some((f) => f.toolId === toolId) ? 0 : videoFloor);
/** Menu order (Image menu, mobile drawer, /image page, search): the approved list without Edit Image. */
export const MENU_FEATURES = IMAGE_FEATURES.filter((f) => f.inMenu);
/** Old URL → new URL (e.g. /soul and /tools/create-image → /image, /tools/app-shots → /image?workflow=camera-angles). */
export const IMAGE_REDIRECTS: Record<string, string> = Object.fromEntries(IMAGE_FEATURES.flatMap((f) => f.oldRoutes.map((r) => [r, f.route])));
/** A URL path → the feature whose page it is (/tools/camera-lens → Camera & Lens). */
export const featureForPath = (pathname: string): ImageFeature | undefined => IMAGE_FEATURES.find((f) => f.inMenu && f.route === pathname.replace(/\/+$/, ''));

// ---------------- models ----------------
/** Provider id → grid model id. comfy-qwen-image runs Qwen-Image for text-to-image and Qwen-Image-Edit-2509 for edits. */
const GRID_MODEL: Record<string, string> = {
  'api-nano-banana': 'nano-banana-2', 'api-gpt-image': 'gpt-image', 'api-seedream': 'seedream-5.0-pro', 'api-flux2': 'flux-2-pro', 'direct-flux2-flex': 'flux-2-flex', 'direct-flux2-klein-9b': 'flux-2-klein-9b', 'direct-minimax-image': 'minimax-image-01', 'api-ideogram': 'ideogram-v4',
  'api-recraft': 'recraft-v4', 'api-luma-image': 'luma-image', 'api-kling-image': 'kling-image-o1', 'api-krea': 'krea', 'api-runway-image': 'runway-gen4-image', 'api-grok-image': 'grok-imagine-image',
  'api-qwen-image': 'qwen-image-3', 'api-wan-image': 'wan-image-2.5', 'api-gpt-image-25-flare': 'gpt-image-2.5-flare', 'api-gpt-image-25-sunburst': 'gpt-image-2.5-sunburst', 'api-nano-banana-21': 'nano-banana-2.1',
  'api-nano-banana-pro': 'nano-banana-pro', 'api-flux3-image': 'flux-3-image', 'api-flux2-max': 'flux-2-max', 'api-seedream-flash': 'seedream-5.0-flash', 'api-ideogram-45': 'ideogram-4.5', 'api-qwen-image-pro': 'qwen-image-3-pro',
  'api-recraft-41': 'recraft-v4.1', 'api-recraft-41-pro': 'recraft-v4.1-pro', 'api-luma-uni1-max': 'luma-uni-1-max',
  'api-gpt-image-15': 'gpt-image-1.5', 'api-seedream-45': 'seedream-4.5', 'api-grok-image-pro': 'grok-imagine-image-pro', 'direct-gemini-nb2-lite': 'nano-banana-2-lite' /* 2026-10-25 */, 'api-bria-fibo2': 'fibo-2.0' /* 2026-10-26 */, 'api-hunyuan-image': 'hunyuan-image-3.5', 'api-meta-muse': 'meta-muse-image', 'comfy-flux3-klein': 'flux-3-klein', 'comfy-qwen21': 'qwen-image-2.1', 'comfy-qwen21-turbo': 'qwen-image-2.1-turbo',
  'comfy-qwen-angles': 'qwen-image-edit-2509-angles', 'comfy-zimage-turbo': 'z-image-turbo', 'comfy-zimage': 'z-image', 'comfy-klein4b': 'flux-2-klein-4b', 'comfy-flux2dev': 'flux-2-dev',
  'comfy-moss-image': 'moss-image', 'comfy-moss-image-base': 'moss-image-base', 'comfy-soul': 'opensoul', 'comfy-realesrgan': 'real-esrgan', 'comfy-ultrasharp': '4x-ultrasharp',
};
export const gridModelOf = (providerId: string, mode: string = 'generate'): string | null =>
  providerId === 'comfy-qwen-image' ? (mode === 'generate' ? 'qwen-image' : 'qwen-image-edit-2509') : GRID_MODEL[providerId] ?? null;
/** Real model names (no house names). The look-LoRA recipe that was "OpenSoul" is named for what it runs. */
const NAME_OVERRIDE: Record<string, string> = { opensoul: 'Z-Image-Turbo + look LoRAs', 'flux-3-klein': 'FLUX 3 Klein', 'real-esrgan': 'Real-ESRGAN' };
export const modelNameOf = (providerId: string, mode: string = 'generate'): string | null => { const g = gridModelOf(providerId, mode); return g ? NAME_OVERRIDE[g] ?? GRID_MODELS[g]?.name ?? null : UPSCALE_MODEL_NAMES[providerId] ?? TOOL_MODELS[providerId]?.name ?? null; }; // upscale models added after the grid: shared/imageUpscale.ts

// ---------------- what each pair supports ----------------
export interface FeatureSupports {
  aspects: string[]; allowAuto: boolean; resolutions: ImageRes[]; qualityTiers: Tier[];
  /** Reference images this pair takes (0 = prompt only) and needs. */ maxImages: number; minImages: number;
  mask: boolean; strength: boolean; seed: boolean; maxCount: number;
}
/** Routes that pass a seed (local graphs, BFL, and the Router bodies that carry one: Nano Banana 2 / 2.1 / Pro, Seedream, FLUX.2 [pro] / [max], Krea, Qwen Image 3.0, Wan, Ideogram 4.5). */
const NO_SEED = new Set(['api-gpt-image', 'api-ideogram', 'api-recraft', 'api-luma-image', 'api-kling-image', 'api-runway-image', 'api-grok-image',
  'api-gpt-image-25-flare', 'api-gpt-image-25-sunburst', 'api-flux3-image', 'api-recraft-41', 'api-recraft-41-pro', 'api-luma-uni1-max', 'api-gpt-image-15', 'api-grok-image-pro']);
export function supportsFor(featureId: string, providerId: string): FeatureSupports | null {
  const f = featureById(featureId); if (!f || !f.providers.includes(providerId)) return null;
  const c = IMAGE_CAPS[providerId === 'comfy-qwen-angles' ? 'comfy-qwen-angles' : providerId];
  const modelMax = c ? c.supports.maxRefs : f.images[0];
  const maxImages = f.images[1] === 'model' ? modelMax : Math.min(f.images[1], Math.max(modelMax, f.mode === 'upscale' ? 1 : 0));
  const ed = f.mode === 'edit' && c?.edit ? c.edit : null; // per-model truth: what an edit run really honours (imageCaps edit)
  return {
    aspects: f.aspects && c ? (ed ? ed.aspects : c.aspects) : [], allowAuto: f.aspects && !!(ed ? ed.allowAuto : c?.allowAuto), resolutions: f.resolutions && c ? (ed ? ed.resolutions : c.resolutions) : [], qualityTiers: c?.qualityTiers ?? [],
    maxImages, minImages: f.images[0], mask: f.mode === 'inpaint', strength: false, seed: !NO_SEED.has(providerId),
    maxCount: f.count === 'model' ? c?.maxBatch ?? 1 : f.count,
  };
}

// ---------------- workflow credit ----------------
/** Our graph per (feature, provider) where the grid's cell names the official template we converted (`file`) or none. */
const FILE_OVERRIDE: Record<string, string> = { 'camera-angles:comfy-qwen-angles': 'shots-qwen-edit2509-angles-api.json' };
export interface FeatureWorkflow extends WorkflowSource { recipe: string | null }
export function workflowFor(featureId: string, providerId: string): FeatureWorkflow | null {
  const f = featureById(featureId); if (!f) return null;
  const gm = gridModelOf(providerId, f.mode);
  if (!gm && f.id === 'upscale' && UPSCALE_MODELS[providerId]) { // upscale models added 2026-10-22 (not in the image grid yet): the credit recorded in shared/imageUpscale.ts
    const x = UPSCALE_MODELS[providerId].source; const file = Object.values(UPSCALE_WORKFLOWS[providerId] ?? {})[0];
    return { source: x.kind, name: x.name, url: x.url, author: x.author, licence: x.kind === 'official' ? 'MIT (Comfy-Org/workflow_templates)' : 'AGPL-3.0 (this repo)', ...(file ? { file } : {}), recipe: f.recipe };
  }
  if (!gm && TOOL_MODELS[providerId]) return { ...TOOL_MODELS[providerId].source, recipe: f.recipe }; // fal-only tool models (not in the grid)
  if (!gm) return null;
  // Camera Angles on the multiple-angles LoRA runs the same graph as the official "1 click Multiple Scene Angles" template (grid: shots)
  const grid = f.id === 'camera-angles' && providerId === 'comfy-qwen-angles' ? 'shots' : f.grid;
  const w = GRID_WORKFLOWS[grid]?.[gm] ?? GRID_WORKFLOWS['edit-image']?.[gm] ?? null; if (!w) return null;
  const file = FILE_OVERRIDE[`${f.id}:${providerId}`] ?? w.file;
  const { support: _s, ...rest } = w;
  return { ...rest, ...(file ? { file } : {}), recipe: f.recipe };
}
/** One line: "Official Comfy template · Nano Banana 2: Image Edit" / "Community · BFS Best Face Swap by Alissonerdx" / "Ours · create-image-flux3klein-inpaint-api.json". */
export function workflowLine(w: WorkflowSource | null | undefined): string {
  if (!w) return '';
  const nm = w.name.replace(/\s*\([\w.-]+\)\s*$/, '');
  return w.source === 'official' ? `Official Comfy template · ${nm}${w.author && w.author !== 'Comfy Org' ? ` (by ${w.author})` : ''}`
    : w.source === 'community' ? `Community · ${nm} by ${w.author.replace(/^@/, '')}` : `Ours · ${w.file ?? nm}`;
}

// ---------------- jobs ----------------
const modeOfInput = (i: Record<string, any>): string => {
  const t = i?.types; const first = Array.isArray(t) ? t[0] : typeof t === 'string' ? (() => { try { const x = JSON.parse(t); return Array.isArray(x) ? x[0] : x; } catch { return t.split(',')[0]; } })() : null;
  return String(first ?? i?.mode ?? 'generate');
};
/** The feature a job ran as (null = not an image feature). */
export function featureIdOfJob(j: { toolId: string; input?: Record<string, any> | null }): ImageFeatureId | null {
  const i = j.input ?? {};
  if (j.toolId === 'create-image') { if (i.camera) return 'camera-lens'; const m = modeOfInput(i); return m === 'inpaint' ? 'brush-edit' : m === 'edit' ? 'edit-image' : 'create-image'; }
  if (j.toolId === 'soul') return 'create-image';
  return IMAGE_FEATURES.find((f) => f.toolId === j.toolId)?.id ?? null;
}
export interface JobFeature { id: ImageFeatureId; name: string; model: string | null; label: string; workflow: FeatureWorkflow | null }
/** "<Feature> · <Model>" for a job, plus the workflow credit. `engineName` = the server's name for what ran (used when the model isn't in the grid). */
export function featureOfJob(j: { toolId: string; provider?: string | null; input?: Record<string, any> | null }, engineName?: string | null): JobFeature | null {
  const id = featureIdOfJob(j); if (!id) return null; const f = featureById(id)!;
  const p = String(j.provider ?? ''); const model = (j.toolId === 'soul' ? engineName : null) || modelNameOf(p, f.mode) || engineName || null;
  const wf = p ? workflowFor(id, p) : null; const ran = typeof j.input?.workflow === 'string' && /^image-upscale-[a-z0-9-]+-api\.json$/.test(j.input.workflow) ? j.input.workflow : null;
  // Upscale: the file that really ran for this job's factor (x2 / x4 / x8), not the model's default (x4) file
  return { id, name: f.name, model, label: model ? `${f.name} · ${model}` : f.name, workflow: wf && ran && wf.source === 'ours' ? { ...wf, name: ran, file: ran } : wf };
}
/** The feature listing (GET /api/image-features, the web pickers): every feature with its models, what each supports and its workflow. */
export const imageFeaturesPayload = () => IMAGE_FEATURES.map((f) => ({
  ...f, /** per-workflow default models {local, hosted, why} (shared/imageDefaults.ts) */ defaults: defaultsOfFeature(f.id), models: f.providers.map((p) => ({ providerId: p, model: modelNameOf(p, f.mode), gridModel: gridModelOf(p, f.mode), supports: supportsFor(f.id, p), workflow: workflowFor(f.id, p) })),
}));

// ---------------- model tags (Create Image's model menu) ----------------
/** What a Create Image model does with a photo: edits (up to N images, imageCaps maxRefs on the routes we wire) or text only. */
export function editTagOf(providerId: string): { edits: boolean; maxImages: number; label: string } {
  const n = IMAGE_CAPS[providerId]?.supports.maxRefs ?? 0; const edits = EDIT_MODELS.includes(providerId) && n > 0;
  return { edits, maxImages: edits ? n : 0, label: edits ? `Edits · up to ${n} image${n > 1 ? 's' : ''}` : 'Text only' };
}
