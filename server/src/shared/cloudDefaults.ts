/**
 * Cloud-first defaults (2026-10-27, user: "default models for everything cloud first … safe to run for all via one api key"). THE one table of
 * the model each tool or workflow starts on when nothing is downloaded: a Comfy Cloud or Comfy Router model, so one Comfy API key runs every
 * tool that has a cloud model at all. The per-workflow tables (imageDefaults.ts, videoDefaults.ts, audioDefaults.ts, threeDDefaults.ts) read
 * their `hosted` model from here; routing/defaults.ts resolves it for tools that have no workflow table.
 *
 * Keys ("slots"): an image feature id (shared/imageFeatures.ts), an Audio workflow id (shared/audioWorkflows.ts), a 3D workflow id, the video
 * slots 'h3-video' and 'video-upscale', else a tool id, or `toolId:mode` for one mode of a tool.
 *
 * Order a tool starts on (routing/defaults.ts): the user's own default (★ Make default in the model menu, routing/prefs.ts favourites) >
 * a saved route pin > with Use local ComfyUI on, the local default when it runs > this cloud default > the first model that runs.
 *  - `model: null` = the tool has no cloud model (free tools on your computer: ffmpeg, previz, local-only models). They stay as they are.
 *  - `comfyKey: false` = the only cloud model wired today needs another key (fal); the Comfy Router model that would replace it is named in
 *    `next` (not wired yet: building its request is its own step).
 *  - `cents` = the list price of one typical run in US cents (the app's own price tables, checked against docs.comfy.org pricing), for the docs and
 *    tests only: the live quote is what the user sees and agrees to before anything runs.
 *  - Sponsors first (user, 2026-10-27): where a challenge sponsor's model (Lightricks LTX, MiniMax, Black Forest Labs FLUX) runs on the Comfy key and
 *    does the job well, it is the default (`sponsor`). Where none does (sound effects, 3D, upscales) or one isn't runnable on the Comfy key yet
 *    (MiniMax Music 3 waits for a measured Comfy Cloud price; MiniMax Speech needs MiniMax's own key), the pick says why in `note`.
 */
export interface CloudDefault {
  /** Provider id the slot starts on (null = no cloud model). */ model: string | null;
  /** Runs on the Comfy key alone (Comfy Cloud or Comfy Router). */ comfyKey: boolean;
  /** Where it runs. */ place: 'Comfy Router' | 'Comfy Cloud' | 'fal' | null;
  /** List price of a typical run, US cents (null = free or not published). */ cents: number | null;
  /** What a typical run is ("1 image, 1K", "5 s, 720p"). */ typical: string;
  /** Why this one, in a few words. */ why: string;
  /** The Comfy Router model that would put this slot on the Comfy key (comfyKey false only). */ next?: string;
  /** The challenge sponsor behind the model, if any. */ sponsor?: Sponsor;
  /** Why a sponsor model isn't the default here (or another note for the docs). */ note?: string;
}
export type Sponsor = 'Lightricks' | 'MiniMax' | 'Black Forest Labs' | 'NVIDIA' | 'Runpod';

const R = 'Comfy Router' as const; const C = 'Comfy Cloud' as const; const BFL = 'Black Forest Labs' as const;
const NANO_KEEP = 'FLUX 3 Image isn’t offered here (or untested for this job: no paid runs), so Nano Banana stays';
const none = (why: string): CloudDefault => ({ model: null, comfyKey: false, place: null, cents: null, typical: '', why });

export const CLOUD_DEFAULTS: Record<string, CloudDefault> = {
  // ---------------- Image (slot = image feature id)
  'create-image': { model: 'api-flux3-image', comfyKey: true, place: R, cents: 7, typical: '1 image, 1K', why: 'FLUX 3: sharp detail and clean text, up to 4K', sponsor: BFL },
  'edit-image': { model: 'api-flux3-image', comfyKey: true, place: R, cents: 7, typical: '1 edit, 1K', why: 'FLUX 3 edits with up to 10 reference images', sponsor: BFL },
  'brush-edit': { model: 'api-gpt-image-25-sunburst', comfyKey: true, place: R, cents: 3, typical: '1 masked edit, low quality', why: 'Cleanest masked edits, low price',
    note: 'No FLUX model takes a mask on the Comfy key here (FLUX Fill on Comfy Router isn’t wired; FLUX 3 Klein masks run on your computer)' },
  'camera-lens': { model: 'api-gpt-image-25-flare', comfyKey: true, place: R, cents: 3, typical: '1 image', why: 'Follows camera and lens wording closely',
    note: 'Kept: the camera and lens recipe is tuned on it and it costs less than half of FLUX 3 Image ($0.07)' },
  upscale: { model: 'router-seedvr2-upscale', comfyKey: true, place: R, cents: 1, typical: '1 photo, 2x', why: 'Most added detail per dollar, up to 8x', note: 'No sponsor image upscaler on the Comfy key' },
  relight: { model: 'api-flux3-image', comfyKey: true, place: R, cents: 7, typical: '1 image', why: 'FLUX 3 relights from your words and keeps the subject', sponsor: BFL },
  'face-swap': { model: 'api-nano-banana', comfyKey: true, place: R, cents: 9, typical: '1 image', why: 'Keeps the face and the scene most reliably', note: NANO_KEEP },
  'person-swap': { model: 'api-nano-banana', comfyKey: true, place: R, cents: 9, typical: '1 image', why: 'Keeps the person and the scene most reliably', note: NANO_KEEP },
  'camera-angles': { model: 'api-nano-banana', comfyKey: true, place: R, cents: 9, typical: '1 angle', why: 'Holds the subject steady across angles', note: NANO_KEEP },
  'character-sheet': { model: 'api-nano-banana-21', comfyKey: true, place: R, cents: 8, typical: '1 sheet', why: 'Keeps one character the same across panels',
    note: 'Kept: the sheet layouts and their examples are made on it; FLUX 3 Image is offered in the menu but untested for multi-panel sheets (no paid runs)' },
  'product-shot': { model: 'api-flux3-image', comfyKey: true, place: R, cents: 7, typical: '1 image', why: 'FLUX 3 keeps the product exact in a new scene', sponsor: BFL },
  'image-layers': { model: 'api-seedream-layers-flash', comfyKey: true, place: R, cents: 44, typical: '1 photo into layers', why: 'Fast, low-cost layer splits', note: 'No sponsor model splits layers' },
  'remove-bg': { model: 'fal-bria-rmbg', comfyKey: true, place: R, cents: 2, typical: '1 photo', why: 'Clean cut-outs, made for this job', note: 'No partner model removes backgrounds' },
  expand: { model: 'fal-bria-expand', comfyKey: true, place: R, cents: 3, typical: '1 photo', why: 'Made for extending photos', note: 'No partner model extends photos' },
  erase: { model: 'fal-bria-eraser', comfyKey: true, place: R, cents: 3, typical: '1 photo', why: 'Made for removing objects', note: 'No partner model erases objects' },
  'material-swap': { model: 'api-nano-banana', comfyKey: true, place: R, cents: 9, typical: '1 image', why: 'Keeps the object and the scene while the material changes', note: NANO_KEEP },
  'ad-pack': { model: 'api-gpt-image', comfyKey: true, place: R, cents: 8, typical: '1 ad', why: 'Cleanest words on the picture, keeps the product as it is', note: 'Picked for its text (user, 2026-10-31); Nano Banana 2 and the others stay in the menu' },
  'try-on': { model: 'router-bria-tryon', comfyKey: true, place: R, cents: 6, typical: '1 try-on', why: 'Made for trying on clothes', note: 'No partner model does try-on' },
  soul: { model: 'comfy-soul', comfyKey: false, place: 'fal', cents: 1, typical: '1 image', why: 'Photo Looks run their LoRA on fal' },

  // ---------------- Video
  'h3-video': { model: 'router-ltx-25-pro', comfyKey: true, place: R, cents: 172, typical: '10 s, 720p, with sound (the Video page’s starting length; 6 s: $1.03 at 720p, $1.46 at 1080p)', why: 'LTX-2.5 Pro: sharp video with its own sound', sponsor: 'Lightricks',
    note: 'Text to video on Comfy Router, image and first-last frame on Comfy Cloud. LTX-2.5 Fast ($1.12 for 6 s 1080p) only runs image to video on the Comfy key, so Pro covers every mode' },
  'h3-video:r2v': { model: 'api-minimax-h3', comfyKey: true, place: R, cents: 78, typical: '6 s, 768p, with sound', why: 'MiniMax H3 keeps your reference people and things', sponsor: 'MiniMax', note: 'LTX-2.5 Pro takes no reference images' },
  'video-upscale': { model: 'cloud-topaz-starlight-fast', comfyKey: true, place: C, cents: 40, typical: '5 s clip', why: 'The lowest-priced upscale on the Comfy key',
    note: 'No NVIDIA upscaler is on Comfy Cloud or Router. The sponsor option, FLUX Video Upscale (Black Forest Labs, Comfy Router), costs about $0.81, twice as much' },
  'h3-extend': { model: 'comfy-h3-extend', comfyKey: true, place: R, cents: 65, typical: '+5 s', why: 'MiniMax H3 carries the shot on, with sound', sponsor: 'MiniMax' },
  'object-swap': { model: 'router-kling-edit', comfyKey: true, place: R, cents: 101, typical: '5 s clip', why: 'Swaps people and objects, keeps the motion', note: 'MiniMax H3 character swap on Comfy Cloud waits for a measured price' },
  'motion-transfer': { model: 'router-kling-edit', comfyKey: true, place: R, cents: 101, typical: '5 s clip', why: 'Moves your character like the clip', note: 'No sponsor model does motion transfer on the Comfy key' },
  'make-it-real': { model: 'router-kling-edit', comfyKey: true, place: R, cents: 101, typical: '5 s render', why: 'The lowest-priced cloud render of a mockup', note: 'LTX-2.5 Layout to Render on Comfy Cloud waits for a measured price' },
  camera: { model: 'api-minimax-h3', comfyKey: true, place: R, cents: 65, typical: '5 s, 768p, with sound', why: 'MiniMax H3 has camera moves built in', sponsor: 'MiniMax' },
  'photo-fx': { model: 'api-minimax-h3', comfyKey: true, place: R, cents: 65, typical: '5 s, 768p, with sound', why: 'Brings a photo to life with sound, for less', sponsor: 'MiniMax' },
  'app-transition': { model: 'api-minimax-h3', comfyKey: true, place: R, cents: 65, typical: '5 s, 768p', why: 'First-to-last-frame moves with sound', sponsor: 'MiniMax' },
  'app-ugc-ad': { model: 'api-minimax-h3', comfyKey: true, place: R, cents: 194, typical: '15 s, 768p, with speech', why: 'Natural people talking, like a drama scene', sponsor: 'MiniMax' },
  'app-orbit-shot': { model: 'api-minimax-h3', comfyKey: true, place: R, cents: 65, typical: '5 s orbit', why: 'Holds the subject through the turn', sponsor: 'MiniMax' },
  'footage-fx': { model: 'comfy-ltx25-iclora', comfyKey: true, place: C, cents: 23, typical: '5 s clip', why: 'Restore, remove and extend run on Comfy Cloud; Vanish runs on your computer', sponsor: 'Lightricks' },
  'remove-bg-video': { model: 'comfy-birefnet-video', comfyKey: true, place: R, cents: 25, typical: '5 s clip', why: 'Clean video cut-outs', note: 'No partner model cuts out video' },
  reframe: { model: 'router-ray32-edit', comfyKey: true, place: R, cents: 60, typical: '5 s clip', why: 'Made for changing a clip’s shape', note: 'No partner model reframes clips' },
  restyle: none('No cloud model is wired for restyles yet: free on your computer'),
  'app-anime-restyle': none('No cloud model is wired for restyles yet: free on your computer'),
  cinema: none('Director’s cloud routes are not wired yet: free on your computer'),
  'app-orbit-shot:image': { model: 'api-minimax-h3', comfyKey: true, place: R, cents: 65, typical: '1 image', why: 'The start frame for the orbit', sponsor: 'MiniMax' },
  reshoot: none('Re-shoot needs its own Comfy deployment or your computer'),
  'fps-boost': none('Free on your computer'),
  'depth-map': none('Free on your computer'),
  cutout: none('Free on your computer'),
  'sdr-hdr': none('Free on your computer'),
  finish: none('Free on your computer (ffmpeg)'),

  // ---------------- Audio (slot = Audio workflow id; lip sync is a mode of Voice Studio)
  music: { model: 'api-seed-audio', comfyKey: true, place: R, cents: 43, typical: 'up to 2 min, no lyrics', why: 'The music model on the Comfy key',
    note: 'MiniMax Music 3 on Comfy Cloud bills GPU time with no published price; it becomes the default once one measured run sets its price' },
  sfx: { model: 'api-eleven-sfx', comfyKey: true, place: R, cents: 2, typical: '5 s', why: 'Clean sound effects from a few words', note: 'No sponsor sound-effects model' },
  voiceover: { model: 'api-eleven-tts', comfyKey: true, place: R, cents: 12, typical: 'a short script', why: 'ElevenLabs: the most natural voices',
    note: 'MiniMax Speech 2.8 is not on Comfy Cloud or Router: it needs MiniMax’s own key, so it is the fallback when that key is set' },
  'soundtrack-music': { model: 'api-seed-audio', comfyKey: true, place: R, cents: 43, typical: 'up to 2 min', why: 'The music model on the Comfy key', note: 'MiniMax Music 3 waits for a measured Comfy Cloud price' },
  'soundtrack-sound': none('Sound that follows the picture runs on your computer (MMAudio)'),
  'change-voice': none('Free on your computer'),
  translate: none('Free on your computer'),
  cover: none('Covers need lyrics and the melody: free on your computer'),
  'voice:lipsync': { model: 'comfy-h3-lipsync', comfyKey: true, place: R, cents: 65, typical: 'a 5 s talking photo', why: 'A talking photo with MiniMax H3', sponsor: 'MiniMax' },

  // ---------------- 3D
  'image-to-3d': { model: 'cloud-tripo-31', comfyKey: true, place: C, cents: 30, typical: '1 model, textured', why: 'Clean, textured models with PBR maps', note: 'No sponsor 3D model' },
  'text-to-3d': { model: 'cloud-tripo-31', comfyKey: true, place: C, cents: 20, typical: '1 model, textured', why: 'A textured model from your description' },
  'multiview-to-3d': { model: 'cloud-tripo-31', comfyKey: true, place: C, cents: 30, typical: '1 model from 2–4 views, textured', why: 'Combine front, side and back views' },
  turntable: none('Free on your computer'),
  'plan-a-shot': none('Free on your computer'),
};

/** The cloud model for a slot (null = none, or no entry). */
export const cloudModel = (slot: string): string | null => CLOUD_DEFAULTS[slot]?.model ?? null;
/** The entry for a slot, else for the tool (a `tool:mode` slot falls back to the tool's own). */
export const cloudDefaultOf = (slot: string | null | undefined, toolId?: string | null): CloudDefault | null =>
  (slot ? CLOUD_DEFAULTS[slot] : undefined) ?? (toolId ? CLOUD_DEFAULTS[toolId] : undefined) ?? null;
/** Tool ids whose slot is not their own id (the per-workflow tables cover them) or that share another slot. */
export const TOOL_SLOT: Record<string, string> = { upscale: 'video-upscale', 'app-video-upscale': 'video-upscale', 'remove-bg': 'remove-bg-video', 'three-d-turntable': 'turntable' };

/* ---------------- Canvas cards (user, 2026-10-28: "Default models on canvas should be cloud models, defaults like GPT Image Flare and video
 * MiniMax, audio cloud based etc so it never errors"). THE one place a new Canvas card's model comes from: the tool rail, the agent's
 * canvas_add_card / canvas_batch with no model, Assets and quick actions, and the demo boards (server canvasAgent.ts). Isomorphic: the card
 * (web/src/shared/genFlows.ts flowSpec) and the server read the same table and the same pick.
 * Keys are Canvas flow ids (web/src/shared/genFlows.ts GEN_FLOWS), or `flow:mode` for one mode. A flow not listed here starts on its slot's
 * cloud default above (CANVAS_SLOT), so a card never opens on a local model (ComfyUI may not be installed) while a cloud model can start.
 *  - create: GPT Image 2.5 Flare on Comfy Router: fast, text-accurate, about $0.03 a picture, and takes references (edit mode too).
 *  - video / transition: MiniMax H3 through its Comfy Router partner node (api-minimax-h3), not the open Comfy Cloud workflow
 *    (comfy-cloud:cloud-h3-wf): the partner node has a published per-second price (27.16 credits/s at 768p) and runs every mode the card
 *    offers (text, start frame, first + last frame, references) with no one-time Comfy Cloud import; cloud-h3-wf is billed by GPU time with
 *    no measured price yet, does text and start frame only, and is a hidden twin route of the H3 card.
 *  - music: Seed Audio (MiniMax Music 3 on Comfy Cloud has no measured price yet). sfx: ElevenLabs Sound Effects. voice: ElevenLabs v3.
 * Saved cards keep the model they were saved with: only a card with no model of its own uses this. The user's own default (★ Make default)
 * and a saved route pin still win, as on every page. */
export const CANVAS_DEFAULTS: Record<string, string> = {
  create: 'api-gpt-image-25-flare',
  video: 'api-minimax-h3', transition: 'api-minimax-h3',
  music: 'api-seed-audio', sfx: 'api-eleven-sfx', voice: 'api-eleven-v3',
};
/** Canvas flows whose cloud-default slot (CLOUD_DEFAULTS key) is not the flow id; image recipe flows use their feature id (= flow id). */
export const CANVAS_SLOT: Record<string, string> = { video: 'h3-video', extend: 'h3-extend', 'video-upscale': 'video-upscale', 'add-sound': 'soundtrack-sound', 'lip-sync': 'voice:lipsync', voice: 'voiceover', transition: 'app-transition' };
/** The cloud model a new Canvas card of this flow (and mode) starts on, or null (no cloud model for it: the tool's own default stays). */
export const canvasCloudModel = (flowId: string, mode?: string | null): string | null =>
  (mode ? CANVAS_DEFAULTS[`${flowId}:${mode}`] : undefined) ?? CANVAS_DEFAULTS[flowId] ?? cloudModel(CANVAS_SLOT[flowId] ?? flowId);
/** A model's run status as /api/tools providers[] (web) or routing/defaults.ts ModelStatus (server) carry it. */
export interface CanvasModelState { runnable?: boolean; needsKey?: boolean; demo?: boolean; demoPreview?: boolean }
/** The model a new Canvas card starts on: the user's own default or saved route pin (`source` favourite | pin) first; else the flow's cloud
 *  model when the card offers it and it runs now, makes a sample, or only lacks the Comfy key (the card then shows the shared Add key
 *  state before Generate, never an error after it); else the tool's own default (`toolDefault`). */
export function canvasDefaultModel(flowId: string, mode: string | null | undefined, o: { source?: string | null; toolDefault: string | null | undefined; state: (id: string) => CanvasModelState | undefined }): string | null {
  const own = o.source === 'favourite' || o.source === 'pin';
  const c = own ? null : canvasCloudModel(flowId, mode); const s = c ? o.state(c) : undefined;
  return c && s && (s.runnable !== false || s.needsKey === true || s.demo === true || s.demoPreview === true) ? c : o.toolDefault ?? null;
}
