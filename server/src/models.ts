import { routesFor } from './routing/routes.js';
import { LTX_DFR_MODEL, ltxDfrRuns } from './shared/ltxDfr.js';
import { VUP_MODELS, VUP_TOOLS } from './shared/videoUpscale.js';
import { weightsHere } from './hardware/variants.js';
import { releaseInfo } from './releaseDates.js';
import { limitsFor, videoCapsBlock } from './tools/h3/videoCaps.js';
/**
 * Model picker data (GET /api/models): one card per usable provider for a tool, with model name, licence,
 * speed/quality hints and the open-weights flag. Built on toolProviders(), so open-weights-only mode applies.
 */
import type { ToolDef } from './tools/types.js';
import { toolProviders, providerLicense, providerWorkflows, providerOpenWeights } from './providers.js';
import { PROVIDER_FACTORS } from './shared/pricing.js';
import { POSTER_STAND_IN } from './tools/shots.js';
import { examplesFileOf } from './interimTiles.js';
import { capsFor, priceMatrix } from './shared/imageCaps.js';
import { catalogFor, cleanName } from './shared/modelCatalog.js';
/** Family fallback for entries outside the catalog: first word of the name. */
const familyOf = (n: string) => n.split(/[\s.\-]/)[0] || n;
import { userLabel, isMockOnly } from './shared/userText.js';
import { footageEffect, footageFxModelName, footageCloudModelName } from './shared/footageFx.js';
import { LTX_LORAS } from './shared/ltxLoras.js';

type Speed = 'fast' | 'balanced' | 'slow';
type Quality = 'draft' | 'good' | 'best';
export interface Info { name: string; speed: Speed; quality: Quality; hint: string; badges?: ('new' | 'premium')[]; /** N2: technical detail (LoRA names, precisions, transport) kept out of hint/description */ tech?: string }
/** `<toolId>:<providerId>` first, then `<providerId>`. */
const INFO: Record<string, Info> = {
  'object-swap:comfy-open': { name: 'Wan 2.2 Animate 14B', speed: 'slow', quality: 'best', hint: 'Swaps the picked subject; motion, light and audio kept' },
  'object-swap:comfy-h3-charswap': { name: 'H3 Character Swap v1.5', speed: 'balanced', quality: 'good', hint: 'Backup for people and characters, 24 fps. Experimental', tech: 'MiniMax H3 Ref2VA + H3 Character Swap LoRA v1.5, 8-step turbo LoRA' },
  'motion-transfer:comfy-h3-charswap': { name: 'H3 Character Swap v1.5', speed: 'balanced', quality: 'good', hint: 'Backup: same swap recipe, driving clip as motion reference, 24 fps. Experimental' },
  'comfy-soul': { name: 'Z-Image-Turbo + Realism LoRA', speed: 'balanced', quality: 'good', hint: 'Realistic photos on Z-Image-Turbo with one of 22 looks (legacy look recipe)', tech: 'Z-Image-Turbo + Realism LoRA and community look LoRAs; references via PuLID, InfiniteYou, ACE++ or Qwen-Image-Edit-2511' },
  'comfy-ltx25-lipsync': { name: 'LTX-2.5 Talking Photo', speed: 'slow', quality: 'good', hint: 'Free on your computer: a photo (or just text) plus speech up to about 4.7 s into a talking clip with your speech as the sound. Can be very slow on your computer: a 2 s Draft takes about 8 min, 4.7 s about 19 min', tech: 'LTX-2.5 22B distilled GGUF Q4_K_M · Gemma 4 12B bf16 · LTX-2.5 video + audio VAEs · x2 latent upscaler · QuokkaiLab lip driver (our server)', badges: ['new'] },
  'comfy-h3-lipsync': { name: 'H3 Talking Photo', speed: 'balanced', quality: 'good', hint: 'Portrait + 2–15 s speech → lip-synced video with sound', badges: ['new'] },
  'comfy-ltx25-extend': { name: 'LTX-2.5 22B', speed: 'slow', quality: 'good', hint: 'Free on your computer. Continues your clip from its last frames, +2–5 s per pass, joined seamlessly with the sound carried on. Can be very slow on your computer: about 8 min per +2 s Draft on an M1 Max', tech: 'LTX-2.5 22B distilled GGUF Q4_K_M · Gemma 4 12B bf16 · LTX-2.5 video + audio VAEs · x2 latent upscaler · last 9 frames as the guide · ColorTransfer + ffmpeg join', badges: ['new'] },
  'comfy-h3-extend': { name: 'H3 Extend', speed: 'slow', quality: 'good', hint: 'Seamless long takes: +2–14 s per segment on Comfy Cloud, picture and sound continue', badges: ['new'] },
  'comfy-h3-camera': { name: 'H3 Camera Motion', speed: 'slow', quality: 'best', hint: '7 camera moves, Slow or Aggressive', badges: ['new'] },
  'comfy-h3-restyle': { name: 'H3 Style Transfer', speed: 'balanced', quality: 'good', hint: 'Style image or text, motion and sound kept. Local only' },
  'comfy-h3-vfx': { name: 'H3 VFX Edit', speed: 'balanced', quality: 'good', hint: 'Describe the effect; the source guides the result. Local only' },
  'motion-transfer:comfy-open': { name: 'Wan 2.2 Animate 14B', speed: 'slow', quality: 'best', hint: 'Rebuilds the scene from your references, same motion' },
  'restyle:comfy-open': { name: 'Wan 2.1 VACE 14B · 4-step', speed: 'balanced', quality: 'good', hint: 'Whole-clip restyle, 5 s passes blended' },
  'reshoot:comfy-open': { name: 'LTX-2 19B', speed: 'balanced', quality: 'best', hint: 'New camera angles from one take', tech: 'LTX-2 19B dev (fp8) + pose IC-LoRA + camera-control LoRA + distilled LoRA', badges: ['new'] }, // N5: the model the graph loads
  'reshoot:comfy-funcamera': { name: 'Wan 2.2 Fun Camera 14B', speed: 'slow', quality: 'good', hint: 'Fully Apache-2.0 fallback' },
  'camera:comfy-open': { name: 'Wan 2.2 Fun Camera 14B', speed: 'slow', quality: 'good', hint: '20 camera presets; LTX presets on LTX-2 19B' },
  'photo-fx:comfy-ltx25-video': { name: 'LTX-2.5 22B', speed: 'slow', quality: 'good', hint: 'Free on your computer, with its own sound. Every effect, plus Exploded view (XPLDV). Can be very slow on your computer: a 2 s Draft clip takes about 8 min, 5 s about 19 min', tech: 'LTX-2.5 22B distilled GGUF Q4_K_M · Gemma 4 12B bf16 · XPLDV LoRA for Exploded view', badges: ['new'] },
  'photo-fx:comfy-open': { name: 'Wan 2.2 I2V 14B · 4-step', speed: 'fast', quality: 'good', hint: 'Animate a still with an effect' },
  'app-video-upscale:comfy-open': { name: 'SeedVR2 3B', speed: 'balanced', quality: 'best', hint: 'Precise 3B: 480p draft → 1080p, content unchanged' },
  'upscale:comfy-open': { name: 'SeedVR2 3B / 7B (+ RIFE)', speed: 'balanced', quality: 'best', hint: 'Precise 3B · Creative 7B · 60 fps via RIFE' },
  'comfy-qwen21': { name: 'Qwen Image 2.1', speed: 'balanced', quality: 'best', hint: 'Default. Edits (up to 2 images) and creates. Research licence: you download the weights yourself', badges: ['new'] },
  'comfy-qwen21-turbo': { name: 'Qwen Image 2.1 Turbo', speed: 'fast', quality: 'good', hint: '8-step Qwen Image 2.1: fast local edits, one image', badges: ['new'] },
  'comfy-qwen-image': { name: 'Qwen-Image / Qwen-Image-Edit-2509', speed: 'balanced', quality: 'good', hint: 'Text-to-image + Qwen-Image-Edit-2509 editing' },
  'comfy-qwen-angles': { name: 'Qwen Edit + Angles', speed: 'balanced', quality: 'good', hint: 'Qwen-Image-Edit-2509 with a camera-angles add-on (+236 MB)' },
  'comfy-zimage-turbo': { name: 'Z-Image-Turbo', speed: 'fast', quality: 'good', hint: '8-step distilled; Apache-2.0' },
  'comfy-zimage': { name: 'Z-Image (base)', speed: 'balanced', quality: 'good', hint: 'Apache-2.0 base model' },
  'comfy-klein4b': { name: 'FLUX.2 [klein] 4B', speed: 'fast', quality: 'good', hint: 'Generate + edit; Apache-2.0' },
  'comfy-moss-image': { name: 'MOSS-Image', speed: 'balanced', quality: 'good', hint: 'Text and posters; Apache-2.0' },
  'comfy-moss-image-base': { name: 'MOSS-Image Base', speed: 'balanced', quality: 'good', hint: 'Base release, for comparison; Apache-2.0' },
  'comfy-flux2dev': { name: 'FLUX.2 [dev]', speed: 'slow', quality: 'best', hint: 'Weights non-commercial (outputs usable)' },
  'comfy-h3': { name: 'MiniMax H3', speed: 'slow', quality: 'best', hint: '768p, up to ~15 s at 24 fps, with audio. Builds for several GPU memory sizes', tech: 'BF16 / INT8 / FP8-scaled / W6A8 repacks', badges: ['new'] },
  'comfy-ltx25-video': { name: 'LTX-2.5 22B', speed: 'slow', quality: 'good', hint: 'Free on your computer, with its own sound. Text, start frame (or a seamless loop), or first + last frame (also Morph in Transitions), 2–5 s. Can be very slow on your computer: a 5 s Draft clip took about 19 min on an M1 Max', tech: 'LTX-2.5 22B distilled GGUF Q4_K_M · Gemma 4 12B bf16 · LTX-2.5 video + audio VAEs · x2 latent upscaler', badges: ['new'] },
  'comfy-ltx25-iclora': { name: 'LTX-2.5 22B + Lightricks IC-LoRA', speed: 'slow', quality: 'good', hint: 'Free on your computer. Official Lightricks effects on your own clip, up to 5 s, your sound kept. Can be very slow on your computer: about 8 min per 2 s Draft on an M1 Max', tech: 'LTX-2.5 22B distilled GGUF Q4_K_M · Gemma 4 12B bf16 · Lightricks IC-LoRAs (Clean Plate, Day to Night, Water Simulation, Alpha Gen) · x2 latent upscaler', badges: ['new'] },
  'comfy-wan22-5b': { name: 'Wan 2.2 5B', speed: 'slow', quality: 'good', hint: 'Free on your computer, runs on Apple Silicon. Text or photo to video, 2–5 s, no sound. Slow: minutes per clip', tech: 'Wan2.2-TI2V-5B fp16 · umt5-xxl fp16 · Wan 2.2 VAE', badges: ['new'] },
  'cloud-reshoot': { name: 'LTX-2 19B re-shoot · Comfy Cloud workflow', speed: 'fast', quality: 'best', hint: 'Runs on Comfy Cloud with open weights', tech: 'our own LTX-2 workflow as a Comfy Cloud job' },
  'cloud-h3-crossview': { name: 'New angle · H3 CrossView · cloud', speed: 'slow', quality: 'best', hint: 'A true new camera angle on the same moment (depth warp + MiniMax H3), on your Comfy deployment', tech: 'MiniMax H3 Ref2VA int8 · CrossView-Warp v1 LoRA · 8-step turbo LoRA · MoGe-2 depth', badges: ['new'] },
  'cloud-infinitetalk': { name: 'InfiniteTalk (Wan 2.1) · Comfy Cloud', speed: 'balanced', quality: 'good', hint: 'Runs on Comfy Cloud with open weights: a photo of one person plus speech up to 60 s into a talking video as long as the speech (480p). Billed per 3.24 s window', tech: 'Wan 2.1 I2V 14B 480p fp8 · lightx2v 480p LoRA · InfiniteTalk single-speaker patch · wav2vec2 (official Comfy template) as a Comfy Cloud job', badges: ['new'] },
  'cloud-ltx25-video': { name: 'LTX-2.5 22B · Comfy Cloud', speed: 'fast', quality: 'good', hint: 'Runs on Comfy Cloud with open weights, with its own sound. Text, start frame (or a loop), first + last frame; Draft, Sharper or 720p', tech: 'LTX-2.5 22B distilled int8 ConvRot · Gemma 4 12B int8 · x2 latent upscaler (official Comfy templates) as a Comfy Cloud job' },
  'cloud-h3-extend': { name: 'H3 Extend · Comfy Cloud', speed: 'fast', quality: 'best', hint: 'Runs on Comfy Cloud with open weights. Seamless long takes: each segment continues from the last 22 frames of picture and sound, +2–14 s, joined without a gap', tech: 'MiniMax H3 int8 · fl2v turbo 8-step · context guide at frame 0 (picture + sound) · optional character photo (Ref2VA)', badges: ['new'] },
  'cloud-ltx25-extend': { name: 'LTX-2.5 22B · Comfy Cloud', speed: 'fast', quality: 'good', hint: 'Runs on Comfy Cloud with open weights. Continues your clip from its last 5 s of picture and sound, +2–5 s, up to 720p', tech: 'LTX-2.5 22B distilled int8 ConvRot · context frozen (picture + sound), new seconds generated, 16-frame fade, sound cut at the edit' },
  'cloud-ltx25-layout': { name: 'LTX-2.5 + Layout to Render · Comfy Cloud', speed: 'fast', quality: 'good', hint: 'Render on Comfy Cloud with open weights and Lightricks’ Layout to Render LoRA (your Comfy Cloud import): Draft, Sharper or 720p, 2–10 s, with its own sound', tech: 'LTX-2.5 22B distilled int8 ConvRot · Gemma 4 12B int8 · Layout to Render IC-LoRA 1.0 (Lightricks) as a Comfy Cloud job' },
  'cloud-ltx23-vfx': { name: 'LTX-2.3 22B + IC-LoRA · Comfy Cloud', speed: 'fast', quality: 'good', hint: 'Footage Effects on Comfy Cloud: remove people, day to night, rain, flood, restore old footage, remove an object or subtitles, or extend the frame. Up to 5 s, your sound kept', tech: 'LTX-2.3 22B dev · official Comfy LTX-2.3 IC-LoRA templates (and our graph derived from the restore one) as a Comfy Cloud job' },
  'cloud-ltx-camera': { name: 'LTX-2 19B camera · Comfy Cloud workflow', speed: 'fast', quality: 'good', hint: 'Runs on Comfy Cloud with open weights (LTX camera presets)', tech: 'our own LTX-2 workflow as a Comfy Cloud job' },
  'cloud-h3-wf': { name: 'MiniMax H3 · Comfy Cloud workflow', speed: 'balanced', quality: 'best', hint: 'Runs on Comfy Cloud with open weights', tech: 'our own MiniMax H3 workflow (core nodes) as a Comfy Cloud job' },
  'cloud-h3-keyframes': { name: 'MiniMax H3 Keyframes · Comfy Cloud', speed: 'balanced', quality: 'best', hint: 'Runs on Comfy Cloud with open weights: 2–5 frames, each at its own time, joined into one shot with sound', tech: 'official Comfy template MiniMax H3: Multiframe Reference as a Comfy Cloud job' },
  'cloud-h3-fast': { name: 'MiniMax H3 Fast · Comfy Cloud', speed: 'fast', quality: 'good', hint: 'MiniMax H3 in 8 steps on Comfy Cloud: text or a start frame, 2–10 s, with its own sound. Quicker and cheaper than full H3, a little less motion detail', tech: 'FastVideo FastH3 8-Step V2 (DMD2-distilled MiniMax H3) · official Comfy templates as a Comfy Cloud job' },
  'cloud-h3': { name: 'MiniMax H3 · Comfy Cloud', speed: 'fast', quality: 'best', hint: 'Comfy Cloud' },
  'comfy-acestep': { name: 'ACE-Step 1.5', speed: 'fast', quality: 'good', hint: 'Music with vocals/lyrics; MIT' },
  'comfy-yue2': { name: 'YuE2', speed: 'slow', quality: 'best', hint: 'Full songs from lyrics and a style, or a cover of your song; weights CC BY-NC' },
  'comfy-minimax-music3': { name: 'MiniMax Music 3', speed: 'balanced', quality: 'best', hint: 'Songs up to 6 min from a caption and lyrics, locally' },
  'comfy-stable-audio': { name: 'Stable Audio Open 1.0', speed: 'fast', quality: 'good', hint: 'SFX and short loops (≤47 s)' },
  'comfy-mmaudio': { name: 'MMAudio', speed: 'balanced', quality: 'best', hint: 'Foley synced to the video; weights CC BY-NC' },
  'comfy-chatterbox': { name: 'Chatterbox', speed: 'fast', quality: 'good', hint: 'Open TTS with voice cloning; MIT weights' },
  'comfy-f5tts': { name: 'F5-TTS', speed: 'fast', quality: 'good', hint: 'Open TTS; weights CC BY-NC' },
  'comfy-qwen3tts': { name: 'Qwen3 TTS 1.7B', speed: 'slow', quality: 'good', hint: 'Free on your computer. 9 preset voices, 10 languages, a Style line; Apache-2.0. Can be slow on your computer: about 10 s per second of speech' },
  'router-kling': { name: 'Kling (hosted)', speed: 'fast', quality: 'best', hint: 'Hosted API', badges: ['premium'] },
  'router-wan3': { name: 'Wan 3.0 (hosted)', speed: 'balanced', quality: 'best', hint: 'Hosted API', badges: ['premium'] },
  'router-ltx-25-pro': { name: 'LTX-2.5 Pro (hosted)', speed: 'balanced', quality: 'best', hint: 'Hosted API', badges: ['premium'] },
  'router-flux3-video': { name: 'FLUX 3 Video (hosted)', speed: 'balanced', quality: 'best', hint: 'Hosted API', badges: ['premium'] },
  'router-veo': { name: 'Veo (hosted)', speed: 'fast', quality: 'best', hint: 'Hosted API', badges: ['premium'] },
  'router-seedance': { name: 'Seedance (hosted)', speed: 'fast', quality: 'good', hint: 'Hosted API', badges: ['premium'] },
  'router-seedance-25': { name: 'Seedance 2.5', speed: 'balanced', quality: 'best', hint: 'Hosted API', badges: ['premium'] },
  'router-seedance-20-fast': { name: 'Seedance 2.0 Fast', speed: 'fast', quality: 'good', hint: 'Hosted API', badges: ['premium'] },
  'router-seedance-20-mini': { name: 'Seedance 2.0 Mini', speed: 'fast', quality: 'good', hint: 'Hosted API', badges: ['premium'] },
  'router-veo-fast': { name: 'Veo 3.1 Fast', speed: 'fast', quality: 'good', hint: 'Hosted API', badges: ['premium'] },
  'router-veo-lite': { name: 'Veo 3.1 Lite', speed: 'fast', quality: 'good', hint: 'Hosted API', badges: ['premium'] },
  'router-wan3-prime': { name: 'Wan 3.0 Prime', speed: 'fast', quality: 'best', hint: 'Hosted API', badges: ['premium'] },
  'router-pvideo2': { name: 'P-Video-2', speed: 'fast', quality: 'good', hint: 'Hosted API', badges: ['premium'] },
  'router-grok-video-lite': { name: 'Grok Imagine Video 1.5 Lite', speed: 'fast', quality: 'good', hint: 'Hosted API', badges: ['premium'] },
  'router-kling-edit': { name: 'Kling 3.0 Omni Edit', speed: 'fast', quality: 'best', hint: 'Swaps the person or object you describe; motion, light and sound kept · up to 10 s a pass', badges: ['premium'] },
  'router-aleph2': { name: 'Runway Aleph 2', speed: 'fast', quality: 'best', hint: 'Render: real video from your mockup, first frame optional', badges: ['premium'] },
  'router-ray32-edit': { name: 'Luma Ray 3.2 Edit', speed: 'fast', quality: 'good', hint: 'Render: keeps the mockup’s structure; billed as 5 s or 10 s', badges: ['premium'] },
  'router-seedance-25-edit': { name: 'Seedance 2.5 Edit', speed: 'balanced', quality: 'best', hint: 'Often refuses photos of real people; up to 30 s in one pass', badges: ['premium'] },
};
/** Plugins: model card info for `<toolId>:<providerId>`. */
export const registerModelInfo = (key: string, info: Info) => { INFO[key] = info; };
export interface ModelCard {
  id: string; providerId: string; toolId: string; name: string; providerName: string; family: string; featured: boolean; description: string; isDefault: boolean; kind: 'open-weights' | 'hosted' | 'hosted-direct'; openWeights: boolean;
  license: ReturnType<typeof providerLicense>; speed: Speed; quality: Quality; hint: string; badges: string[]; priceFactor: number; workflows: string[]; default: boolean; docUrl: string | null; nodes: string[]; modes: string[] | null;
  /** Poster still for the picker card (DESIGN-NOTES 19); per-model art can override via INFO later. */
  posterUrl: string; licenseName: string | null; requirementNote: string | null; tech: string | null;
}
const comfyCloudOpenish = (p: { via: string }) => /Comfy Cloud/i.test(p.via) && !/partner/i.test(p.via);
/** Item 3: the fallback blurb is plain text with the model name, never p.via (node class names like MinimaxHailuo03*Node, 'mock only'). */
function plainBlurb(p: { name: string; kind: string; via: string }, catName?: string): string {
  const n = cleanName(userLabel(p.name)) || catName || p.name;
  return p.kind === 'open-weights' ? `${n}, open weights` : p.kind === 'hosted-direct' ? `${n} through its vendor API`
    : /Comfy Cloud/i.test(p.via) && !/partner/i.test(p.via) ? `${n} on Comfy Cloud` : "In the cloud; priced before you run."; // N2: plain words; the transport (Comfy partner node) goes in tech
}
/** BH9 P1-4: the model that actually runs for this input. Camera Moves 'comfy-open' runs two graphs: classic presets on Wan 2.2 Fun Camera,
 *  LTX presets (ids ltx-*) on LTX-2, so a job / route listing with an LTX preset is named LTX-2. */
/** Card name for tool+provider: catalog name, else the INFO name (e.g. Camera Moves comfy-open = Wan 2.2 Fun Camera 14B), cleaned; never the generic provider name. */
export const cardName = (toolId: string, providerId: string): string | null => { const cat = catalogFor(toolId, providerId)?.name; if (cat) return cat; const n = (INFO[`${toolId}:${providerId}`] ?? INFO[providerId])?.name; return n ? cleanName(userLabel(n)) : null; }; // same rule as modelsFor
export const LTX_CAMERA_MODEL = 'LTX-2 19B';
/** OpenSoul default stack: Z-Image-Turbo base + the Z-Image-Turbo Realism LoRA at 0.5 (tools/soul/presets.ts REALISM.zit). */
export const SOUL_DEFAULT_MODEL = 'Z-Image-Turbo + Realism LoRA';
export function modelNameForRun(toolId: string, providerId: string, input: Record<string, any> = {}, routeId?: string | null): string | null {
  const t0 = Array.isArray(input.types) ? String(input.types[0] ?? '') : String(input.preset ?? input.mode ?? '');
  if (toolId === 'camera' && providerId === 'comfy-open' && /^ltx-/.test(t0)) return LTX_CAMERA_MODEL;
  if (VUP_TOOLS.has(toolId) && VUP_MODELS[providerId] && providerId !== 'comfy-seedvr2') return VUP_MODELS[providerId].name; // Video Upscale: the model that really runs (SeedVR2: per route, fal vs local 3B)
  if (toolId === 'footage-fx' && (providerId === 'comfy-ltx25-iclora' || providerId === 'cloud-ltx23-vfx')) { const e = footageEffect(t0); if (e?.cloud && (!e.lora || providerId === 'cloud-ltx23-vfx' || routeId === 'comfy-cloud:cloud-ltx23-vfx')) return footageCloudModelName(e); /* Vanish, Day to night, Rain, Flood: LTX-2.3 on Comfy Cloud, LTX-2.5 on your computer */ const l = e ? LTX_LORAS[e.lora] : null; if (l) return footageFxModelName(l.label); } // the IC-LoRA the effect runs
  if (toolId === 'h3-video' && (providerId === 'comfy-ltx25-video' || providerId === 'cloud-ltx25-video') && ltxDfrRuns(input)) return LTX_DFR_MODEL; // the DFR recipe, named (transparency)
  if (toolId === 'soul' && providerId === 'comfy-soul' && !input.stack) return SOUL_DEFAULT_MODEL; // BH P2: listings / quotes name the default engine, never 'OpenSoul' (a job names its own stack: engineName.ts)
  return null;
}
/** 'Needs ComfyUI 0.41.3 or newer.' for a model with a minimum ComfyUI version, else null. */
export const requirementNote = (v?: string | null) => (v ? `Needs ComfyUI ${v} or newer.` : null);
/** B6: routing/defaults.ts registers the tool default (saved pin, else first runnable in quality order, else the cloud default) and the twin-card filter. */
let defaultOf: ((tool: ToolDef) => string | null) | null = null; let hiddenTwin: ((tool: ToolDef, id: string) => boolean) | null = null;
export const setModelDefaults = (d: typeof defaultOf, h: typeof hiddenTwin) => { defaultOf = d; hiddenTwin = h; };
export function modelsFor(tool: ToolDef): ModelCard[] {
  const listed = toolProviders(tool); const defId = defaultOf?.(tool) ?? listed[0]?.id; let rank = 0;
  return listed.map((p) => { const twin = !!hiddenTwin?.(tool, p.id); const qualityRank = twin ? null : ++rank;
    const cat = catalogFor(tool.id, p.id);
    const info = INFO[`${tool.id}:${p.id}`] ?? INFO[p.id] ?? { name: p.name, speed: 'balanced' as Speed, quality: 'good' as Quality, hint: plainBlurb(p, cat?.name) }; const name = cat?.name ?? cleanName(userLabel(info.name));
    return {
      /** Short display name (no hosting/licence/default tags: see kind, route, license, isDefault). */
      name, family: cat?.family ?? familyOf(name), featured: !!cat?.featured, experimental: !!cat?.experimental, localOnly: !!cat?.localOnly, description: cat?.description ?? cleanName(userLabel(info.hint)), isDefault: p.id === defId, qualityRank, ...(twin ? { twinAlias: true } : {}),
      /** N2: technical detail for a 'details' line (null when none); description/hint stay plain. */ tech: cat?.tech ?? info.tech ?? (p.kind === 'hosted' && !comfyCloudOpenish(p) ? 'Comfy partner node (API)' : null),
      id: p.id, providerId: p.id, toolId: tool.id, providerName: cat?.name ?? cleanName(userLabel(p.name)), kind: p.kind, mockOnly: isMockOnly(p.via), openWeights: providerOpenWeights(p),
      license: providerLicense(tool, p), speed: info.speed, quality: info.quality, hint: userLabel(info.hint), badges: [...new Set([...(info.badges ?? []).filter((b) => b !== 'new') /* 'new' only from a sourced releasedAt */, ...(releaseInfo(p.id).isNew ? ['new'] : [])])], releasedAt: releaseInfo(p.id).releasedAt, releaseSource: releaseInfo(p.id).releaseSource,
      priceFactor: tool.pricing?.providerFactors?.[p.id] ?? PROVIDER_FACTORS[p.id] ?? 1, workflows: providerWorkflows(tool, p), /** DP #20.8: weight files for the local workflows (name, folder, exact size, download link; public metadata). */ weights: weightsHere(providerWorkflows(tool, p)), default: p.id === defId,
      docUrl: p.docUrl ?? null, nodes: p.nodes ?? [], modes: (tool.app as any)?.providerModes?.[p.id] ?? null, minComfyVersion: p.minComfyVersion ?? null,
      /** P2 3b: plain licence name and requirement note for the card and the model page (the version note lives here only, not in description). */
      licenseName: providerLicense(tool, p)?.name ?? null, requirementNote: requirementNote(p.minComfyVersion),
      posterUrl: (info as any).posterUrl ?? (POSTER_STAND_IN.has(tool.id) && !examplesFileOf(`tools/${tool.id}.jpg`) ? '' /* stand-in art: no poster file yet */ : `/api/posters/${tool.id}.jpg`),
      /** Non-H3 video routes: per-route videoCaps (routing/videoRouteCaps.ts) keyed by routeId; null when the model has none. */
      routeVideoCaps: (() => { const m = Object.fromEntries(routesFor(p.id, tool).filter((r) => r.caps?.videoCaps).map((r) => [r.routeId, r.caps!.videoCaps])); return Object.keys(m).length ? m : null; })(),
      /** Create Image: per-model capabilities + per-image credits by tier × resolution (total = cell × n; local = 0). */
      ...(tool.id === 'create-image' ? { capabilities: capsFor(p.id), priceMatrix: priceMatrix(p.id) } : {}),
      /** Generate Video: per-model limits (tools/h3/videoCaps.ts): maxResolution, minSeconds, maxSeconds, duration{min,max,step}, durations, aspects, audio, refKinds/refMax, bitrate. */
      ...(tool.id === 'h3-video' && limitsFor(p.id) ? { capabilities: videoCapsBlock(limitsFor(p.id)!), videoLimits: videoCapsBlock(limitsFor(p.id)!), resolutions: limitsFor(p.id)!.resolutions, defaultResolution: limitsFor(p.id)!.resolutions[0] } : {}),
    };
  });
}
