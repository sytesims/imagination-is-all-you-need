/**
 * Workflows page (2026-10-22): the workflow credit for every (app tool, model) pair, so each card can say where its graph comes from.
 *  - Image apps (Relight, Face Swap, …) use the image grid credit (shared/imageFeatures.ts workflowFor).
 *  - Photo FX / Orbit Shot on Comfy Router use the Router credit (shared/videoAppWorkflows.ts).
 *  - Other workflow provenance is recorded below for each app/model pair.
 * A pair the grid marks "missing" (no ComfyUI workflow) is left out: no invented source.
 */
import type { WorkflowSource } from './workflowSources.js';
import { IMAGE_FEATURES, workflowFor } from './imageFeatures.js';
import { videoAppWorkflow } from './videoAppWorkflows.js';
import { LTX_DFR_TEMPLATE, LTX_DFR_MODEL, ltxDfrRuns } from './ltxDfr.js';

const T = 'https://github.com/Comfy-Org/workflow_templates/blob/main/templates/';
const COMFY_LICENCE = 'MIT (Comfy-Org/workflow_templates)';
const official = (id: string, name: string, file?: string, author = 'Comfy Org'): WorkflowSource =>
  ({ source: 'official', name: `${name} (${id})`, url: `${T}${id}.json`, author, licence: COMFY_LICENCE, ...(file ? { file } : {}) });
const ours = (file: string): WorkflowSource => ({ source: 'ours', name: file, url: null, author: 'Imagination Is All You Need', licence: 'AGPL-3.0 (this repo)', file });

const SEEDVR2 = (file: string) => official('utility_seedvr2_video_upscale', 'Video Upscale: SeedVR2', file);
const FLUX_VUP = official('api_bfl_flux_video_upscale', 'Video Upscale: FLUX 3');
const H3_R2V_LOCAL = official('video_minimax_h3_r2v', 'MiniMax H3: Reference to Video', 'h3-r2v-api.json');
/** Local music graphs (2026-10-23). Cover a song = the user's own working copy of the official cover template. */
export const YUE2_SONG = official('audio_yue2_text2music', 'YuE2: Text to Music', 'audio-yue2-song-api.json');
export const YUE2_COVER = official('audio_yue2_music_cover', 'YuE2: Music Cover', 'audio-yue2-cover-api.json');
export const MINIMAX_MUSIC3_LOCAL = official('audio_minimax_music_3', 'MiniMax Music 3: Text to Music', 'audio-minimax-music3-local-api.json');
/** Wan 2.2 TI2V 5B, Generate Video local route (text and image to video in one graph). */
export const WAN22_5B_TI2V = official('video_wan2_2_5B_ti2v', 'Wan 2.2 5B Video Generation', 'wan22-ti2v-5b-api.json');
/** LTX-2.5 22B, Generate Video local route: text + image to video from video_ltx2_5_i2v; first + last frame (ltx25-flf-api.json) from video_ltx2_5_flf2v. */
export const LTX25_TI2V = official('video_ltx2_5_i2v', 'LTX-2.5: Image to Video (also text to video; first + last frame from video_ltx2_5_flf2v)', 'ltx25-ti2v-api.json');
/** LTX-2.5 22B DFR quality (2026-10-29, comfy/ltx25Dfr.ts): image to video on the official DFR template (local and Comfy Cloud share the graph). */
export const LTX25_DFR = official(LTX_DFR_TEMPLATE, 'LTX-2.5 DFR: Image to Video', 'ltx25-dfr-i2v-api.json');
/** Job view `feature` for a DFR run ("Create Video · LTX-2.5 22B · DFR" + the DFR template credit), like featureOfJob for images. null = not a DFR run. */
export function ltxDfrFeatureOfJob(j: { toolId: string; provider?: string | null; input?: Record<string, any> | null }) {
  if (j.toolId !== 'h3-video' || !['comfy-ltx25-video', 'cloud-ltx25-video'].includes(String(j.provider ?? '')) || !ltxDfrRuns(j.input ?? null)) return null;
  return { id: 'h3-video', name: 'Create Video', model: LTX_DFR_MODEL, label: `Create Video · ${LTX_DFR_MODEL}`, workflow: LTX25_DFR };
}
/** LTX-2.5 22B first + last frame (ltx25-flf-api.json): Generate Video's start + end frame and Loop, and Transitions' morph (2026-10-26). */
export const LTX25_FLF = official('video_ltx2_5_flf2v', 'LTX-2.5: FLF2V', 'ltx25-flf-api.json');
/** InfiniteTalk (Wan 2.1) · Comfy Cloud (voice lipsync, 2026-10-27): the official template, flattened and repeated per 3.24 s window. */
export const INFINITETALK = official('video_wan2_1_infinitetalk', 'Wan 2.1 InfiniteTalk', 'cloud/wan21-infinitetalk-api.json');
/** LTX-2.5 Talking Photo (voice lipsync, 2026-10-26): the core audio-to-video path of Lightricks' A2V example, speech prepared with the QuokkaiLab recipe. */
export const LTX25_A2V: WorkflowSource = { source: 'community', name: 'LTX-2.5 A2V Two Stage Distilled (Lightricks) + QuokkaiLab lip-sync fix (sducly)', url: 'https://github.com/Lightricks/ComfyUI-LTXVideo/blob/master/example_workflows/2.5/LTX-2.5_A2V_Two_Stage_Distilled.json', author: 'Lightricks · sducly (https://github.com/sducly/quokkai-lab-ltx25-lipsync-fix)', licence: 'LTX-2 Community License (ComfyUI-LTXVideo) · MIT (QuokkaiLab)', file: 'ltx25-a2v-api.json' };
const CHATTERBOX_VC = official('audio-chatterbox_vc', 'Chatter Box: Voice Cloning Audio Conversion', 'voice-chatterbox-vc-api.json', '@PurzBeats');

/** toolId → providerId → credit (per-feature tables). */
const RECORDED: Record<string, Record<string, WorkflowSource>> = {
  'photo-fx': { 'comfy-open': official('video_wan2_2_14B_i2v', 'Wan 2.2 14B Image to Video', 'photo-fx-api.json'), 'comfy-ltx25-video': LTX25_TI2V /* + the effect's LoRA (shared/ltxLoras.ts) */ },
  // Generate Video's local Wan 2.2 5B (2026-10-24): the official 5B template, with the fp16 text encoder and euler for Apple Silicon
  'h3-video': { 'comfy-wan22-5b': WAN22_5B_TI2V, 'comfy-ltx25-video': LTX25_TI2V, 'cloud-h3-keyframes': official('video_minimax_h3_multiframe_reference', 'MiniMax H3: Multiframe Reference', 'cloud/h3-multiframe-api.json'), 'cloud-h3-fast': official('video_fastvideo_fasth3_i2v', 'FastVideo FastH3: Image to Video', undefined, 'Comfy Org · FastVideo') /* + video_fastvideo_fasth3_t2v for text */, 'comfy-h3-pika': official('video_pika_h3_flex_fl2va', 'Pika H3 Flex: FL2VA', 'pika-h3-flex-fl2va-api.json', 'Comfy Org · Pika'), 'cloud-h3-pika': official('video_pika_h3_flex_fl2va', 'Pika H3 Flex: FL2VA', 'cloud/pika-h3-flex-fl2va-api.json', 'Comfy Org · Pika') /* + video_pika_h3_flex_t2v for text */ },
  upscale: { 'comfy-seedvr2': SEEDVR2('upscale-api.json'), 'comfy-open': SEEDVR2('upscale-api.json'), 'direct-flux3-upscale': FLUX_VUP },
  'app-video-upscale': { 'comfy-seedvr2': SEEDVR2('upscale-api.json'), 'comfy-open': SEEDVR2('upscale-api.json'), 'direct-flux3-upscale': FLUX_VUP },
  // Transitions: our start + end frame graph, built on the official H3 i2v graph with an end-frame guide
  'app-transition': { 'comfy-h3': ours('h3-flf-api.json'), 'comfy-ltx25-video': LTX25_FLF },
  'app-ugc-ad': {
    'comfy-h3': H3_R2V_LOCAL, 'api-minimax-h3': official('api_minimax_h3_r2v', 'MiniMax H3: Reference to Video'),
    'router-seedance': official('api_seedance2_0_r2v', 'Seedance 2.0: Reference to Video'), 'router-kling': official('api_kling_v3_video', 'Kling 3.0: Video Generation'),
  },
  'app-orbit-shot': { 'comfy-open': ours('camera-ltx-api.json'), 'comfy-funcamera': ours('reshoot-funcamera-api.json') },
  'app-anime-restyle': {
    'comfy-open': official('video_wan_vace_14B_v2v', 'Wan2.1 VACE Control Video', 'restyle-api.json'),
    'comfy-h3-restyle': { source: 'community', name: 'Minimax-H3-ComfyUI style_transfer LoRA', url: 'https://huggingface.co/Alissonerdx/Minimax-H3-ComfyUI', author: 'Alissonerdx', licence: 'other (mixed-asset-licenses)', file: 'h3-style-transfer-api.json' },
  },
  'app-change-voice': { 'comfy-chatterbox-vc': CHATTERBOX_VC },
  voice: { 'comfy-ltx25-lipsync': LTX25_A2V, 'cloud-infinitetalk': INFINITETALK },
  'h3-extend': { 'comfy-ltx25-extend': LTX25_TI2V /* the source's last frames as the guide, joined after (comfy/ltx25Extend.ts) */ },
  'app-translate-video': { 'local-whisper-nllb-chatterbox': ours('voice-chatterbox-ml-api.json'), 'local-whisper-nllb-f5': ours('voice-f5tts-api.json') },
  // Local music (2026-10-23): official Comfy templates, flattened to API graphs in workflows/
  audio: { 'comfy-yue2': YUE2_SONG, 'comfy-minimax-music3': MINIMAX_MUSIC3_LOCAL, 'comfy-acestep': official('audio_ace_step_1_5_split', 'ACE-Step 1.5 Music Generation Workflow', 'audio-music-api.json') },
  soundtrack: { 'comfy-yue2': YUE2_SONG, 'comfy-minimax-music3': MINIMAX_MUSIC3_LOCAL, 'comfy-acestep': official('audio_ace_step_1_5_split', 'ACE-Step 1.5 Music Generation Workflow', 'soundtrack-music-api.json') },
  'app-music-bed': {
    'comfy-yue2': YUE2_SONG, 'comfy-minimax-music3': MINIMAX_MUSIC3_LOCAL,
    'api-seed-audio': official('api_bytedance_seed_audio1_0_t2a', 'Seed Audio 1.0: Text to Audio'),
    'comfy-acestep': official('audio_ace_step_1_5_split', 'ACE-Step 1.5 Music Generation Workflow', 'soundtrack-music-api.json'),
    'cloud-minimax-music': official('audio_minimax_music_3', 'MiniMax Music 3: Text to Music'), 'api-sonilo-music': official('api_sonilo_t2m', 'Sonilo: Text to Music Generation'),
  },
};

// Official Comfy templates from comfy.org/workflows "Most popular" (2026-10-27, server tools/comfyFeatured.ts): run on Comfy Cloud from the template graphs.
Object.assign((RECORDED['h3-video'] ??= {}), { 'cloud-gemini-omni': official('api_google_gemini_omni_flash_1_1_i2v', 'Gemini Omni 1.1 Flash: Image to Video (also text to video and start + end frame)') });
Object.assign((RECORDED['h3-video'] ??= {}), { 'cloud-flux3-max': official('api_flux3_max_i2v', 'FLUX 3 Max: Image to Video (also FLUX 3 Max: Text to Video)') });
Object.assign((RECORDED['h3-video'] ??= {}), { 'cloud-kling4': official('api_kling4_i2v', 'Kling 4.0: Image to Video (also Kling 4.0: Text to Video and Reference to Video)') });
Object.assign((RECORDED['motion-transfer'] ??= {}), { 'cloud-wan-animate2': official('video_wan_animate2', 'Wan Animate 2: Motion Transfer', 'cloud-featured/wan-animate2-api.json') });
Object.assign((RECORDED['two-person-swap'] ??= {}), { 'cloud-h3-two-swap': ours('cloud/h3-two-person-swap-api.json') }); // our own two-pass recipe on the H3 Character Swap LoRA
Object.assign((RECORDED['prompt-edit'] ??= {}), { 'cloud-bernini-r': official('video_bernini_r_video_editing', 'Bernini-R: Video Editing', 'cloud/bernini-r-edit-api.json') });
Object.assign((RECORDED['image-upscale'] ??= {}), { 'cloud-topaz-bloom2': official('api_topaz_image_enhance_bloom2', 'Topaz: Image Enhance Bloom 2') });

// Workflows page picks (2026-10-28, transparency audit): the graphs the README lists for these models, credited where the page showed none.
/** A hosted model we call with our own request: the model's maker and the service that runs it, under their terms; only the app’s request code is ours. */
export const hostedRequest = (model: string, service: string, url: string, maker: string): WorkflowSource =>
  ({ source: 'ours', name: `${model} on ${service}`, url, author: `${maker}, run by ${service}; the app’s request code`, licence: `${maker} terms (hosted model) · the app’s request code: AGPL-3.0 (this repo)` });
Object.assign((RECORDED['h3-video'] ??= {}), {
  'comfy-h3': official('video_minimax_h3_t2v', 'MiniMax H3: Text to Video (image to video: video_minimax_h3_i2v)', 'h3-t2v-api.json'),
  'direct-ltx-25-pro': official('api_ltx2_5_i2v', 'LTX-2.5: Image to Video, partner node'), 'router-ltx-25-pro': official('api_ltx2_5_i2v', 'LTX-2.5: Image to Video, partner node'),
});
Object.assign((RECORDED['h3-extend'] ??= {}), { 'comfy-h3-extend': { ...ours('h3-extend-api.json'), name: 'H3 Extend: the last frames of picture and sound anchored with MiniMaxH3AddGuide' } });
Object.assign((RECORDED['object-swap'] ??= {}), { 'comfy-h3-charswap': { source: 'community', name: "MiniMax H3 Character Swap · after Comfy's Openjutsu app", url: 'https://github.com/Comfy-Org/comfy-openjutsu', author: "Comfy Org (Openjutsu app) and Akatz Labs (H3 Character Swap workflow and LoRA)", licence: 'MIT (recipe) · MiniMax H3 Community (models)', file: 'object-swap-h3-charswap-api.json' } });
Object.assign((RECORDED['motion-transfer'] ??= {}), { 'router-kling-edit': hostedRequest('Kling 3.0 Omni (kling/kling-v3-omni)', 'Comfy Router', 'https://docs.comfy.org/development/comfy-router/models/kling/kling-v3-omni/code', 'Kuaishou Kling') });
/** Direct a Shot's Render: Lightricks' Layout to Render IC-LoRA recipe on the official LTX-2.5 image-to-video template. */
export const LTX25_LAYOUT: WorkflowSource = { source: 'community', name: 'LTX-2.5 Layout to Render IC-LoRA (Lightricks recipe on video_ltx2_5_i2v + video_ltx2_3_ic_lora)', url: 'https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render', author: 'Lightricks', licence: 'LTX-2.x Community', file: 'ltx25-layout-to-render-api.json' };
Object.assign((RECORDED['plan-a-shot'] ??= {}), { 'local-previz': LTX25_LAYOUT });
Object.assign((RECORDED['make-it-real'] ??= {}), { 'comfy-ltx25-layout': LTX25_LAYOUT });

/** The workflow a (tool, provider) pair is credited with; null = none recorded (the Workflows page lists it under All only). */
export function appWorkflowFor(toolId: string, providerId: string): WorkflowSource | null {
  const v = videoAppWorkflow(toolId, providerId); if (v) return v;
  const f = IMAGE_FEATURES.find((x) => x.toolId === toolId && x.inMenu && toolId !== 'create-image');
  if (f) { const w = workflowFor(f.id, providerId); if (w) { const { recipe: _r, ...rest } = w; return rest; } }
  return RECORDED[toolId]?.[providerId] ?? null;
}
