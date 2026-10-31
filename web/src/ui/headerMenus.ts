/**
 * Header menu content (Image / Video / Audio mega panel, Studio menu). Data only, so it is easy to edit:
 *  - FEATURED_MODELS: per medium, the tool a model's header link opens (tool id + MODEL KEY, /api/tools models[].key, e.g. reshoot +
 *    ltx-2-19b). The column's ORDER is the server's (models[].section, then catalogue rank), the same as the pickers (Shell mediaModels);
 *    Pricing's chips also read this list.
 *  - A model description is the server catalogue bestFor line (server shared/modelRank.ts); no name-keyed table here.
 *    A model the server marks lifecycle 'retiring' (e.g. Veo 3.1) is never featured: not listed here and
 *    never used to top up the column (provider audit, 2026-10-21).
 *  - TOOL_TAGLINE: one short line per tool (~45 characters max); a tool without one falls back to the first
 *    sentence of its registry description.
 */
export type Medium = 'image' | 'video' | 'audio' | '3d';
export const MAX_MODELS = 10;
/** Canvas (2026-10-24): a plain header tab after 3D (no mega panel); the page itself is web/src/canvas, its own lazy chunk. */
export const CANVAS_NAV = { to: '/canvas', label: 'Canvas', desc: 'An infinite board to sketch and arrange your results' } as const;
/** Film (2026-10-27): a plain header tab after Canvas; shot cards in a row, joined into one film (web/src/ui/film, its own lazy chunk). */
export const FILM_NAV = { to: '/film', label: 'Editor', desc: 'Shot cards in a row, joined into one film' } as const;

/** Models the header column shows first, whatever their catalogue rank (Video: LTX-2.5 22B, the free local model with sound that the tab opens on). */
export const MENU_MODELS_FIRST: Partial<Record<Medium, string[]>> = { video: ['ltx-2.5-22b'] };
export const FEATURED_MODELS: Record<Medium, [toolId: string, modelKey: string][]> = {
  image: [
    ['create-image', 'gpt-image'],
    ['create-image', 'nano-banana-2'],
    ['create-image', 'seedream-5.0-pro'],
    ['create-image', 'flux-2-pro'],
    ['create-image', 'flux-3-klein'],
    ['create-image', 'qwen-image'],
    ['create-image', 'z-image-turbo'],
    ['create-image', 'flux-2-klein-4b'],
    ['create-image', 'moss-image'],
  ],
  video: [
    ['h3-video', 'ltx-2.5-22b'],
    ['h3-video', 'seedance-2.0-mini'],
    ['h3-video', 'seedance-2.0'],
    ['h3-video', 'kling-v3'],
    ['h3-video', 'minimax-h3'],
    ['reshoot', 'ltx-2-19b'],
    ['object-swap', 'wan-2.2-animate-14b'],
    ['camera', 'wan-2.2-fun-camera-14b'],
    ['restyle', 'wan-2.1-vace-14b'],
    ['photo-fx', 'wan-2.2-i2v-14b'],
    ['upscale', 'seedvr2'],
  ],
  audio: [
    ['audio', 'elevenlabs-v4'],
    ['audio', 'minimax-music-3'],
    ['audio', 'elevenlabs-sound-effects'],
    ['audio', 'minimax-speech-2.8-hd'],
    ['audio', 'ace-step-1.5'],
    ['audio', 'chatterbox'],
    ['audio', 'stable-audio-open-1.0'],
    ['soundtrack', 'mmaudio'],
    ['audio', 'fish-audio-drama-3'],
    ['audio', 'f5-tts'],
  ],
  /* 3D (2026-10-23): the models of the three-d tool (model key = its engine id) */
  '3d': [
    ['three-d', 'cloud-tripo-31'],
    ['three-d', 'fal-trellis2'],
    ['three-d', 'fal-hunyuan3d-31'],
  ],
};

export const TOOL_TAGLINE: Record<string, string> = {
  // Image
  // Image: the menu uses the feature taglines in shared/imageFeatures.ts (one source with the server); these cover other lists
  'create-image': 'Text to image, or edit a photo with a prompt',
  'image-upscale': 'Sharper, larger images: 2x, 4x or 8x',
  'app-character-sheet': 'One character, many panels, flat backdrop',
  'app-product-shot': 'Studio or lifestyle shots of a product',
  'app-inpaint': 'Paint over an area, describe the change',
  'app-relight': 'Move and recolour the light in a photo',
  'app-face-swap': 'A face from one photo onto another',
  'app-person-swap': 'Put a whole person into another photo',
  'app-shots': 'Up to nine new viewpoints from one photo',
  'app-remove-bg': 'Cut out the subject on a transparent background',
  'app-expand': 'Add room around a photo to fit a new shape',
  'app-erase': 'Paint over something to remove it',
  'app-try-on': 'Put a garment from one photo on a person',
  'app-image-layers': 'Split a photo into separate transparent layers',
  // Video
  'h3-video': 'Video with sound, from text or an image',
  'h3-extend': 'Continue a clip from its last frame',
  'object-swap': 'Replace a product, person or place in a clip',
  'motion-transfer': 'Keep the motion, rebuild cast and look',
  restyle: 'Redraw a whole clip in a new style',
  reshoot: 'New camera angles from a single take',
  camera: 'One still into a shot with a camera move',
  'photo-fx': 'Animate a photo with an effect',
  upscale: 'Sharper, larger clips, audio kept',
  cutout: 'Subject on a clean plate, plus alpha matte',
  reframe: 'Change aspect ratio, fill the new edges',
  'remove-bg': 'Cut the subject out of a clip',
  'sdr-hdr': 'Convert SDR footage to HDR10',
  'fps-boost': 'Smoother motion at 48 or 60 fps',
  'depth-map': 'Turn a clip into a depth video',
  'footage-fx': 'Vanish, night, rain, flood or a matte on your own clip',
  finish: 'One-click polish: grain, glow, light leak, glitch and more',
  'app-transition': 'Animate from a start to an end image',
  'two-person-swap': 'Swap two people in a clip at once',
  'prompt-edit': 'Describe a change, the rest of the clip stays',
  'app-ugc-ad': 'Phone-style ad with a talking presenter',
  'app-orbit-shot': 'Camera circles your subject from one photo',
  'app-anime-restyle': 'Turn a clip into cel-shaded anime',
  'app-video-upscale': 'Lift a 480p draft to 1080p',
  // Audio
  audio: 'Music, sound effects or voice from a prompt',
  soundtrack: 'Music or matched sound, mixed onto a clip',
  voice: 'Voiceover, voice change or translation',
  'app-change-voice': 'New voice, same clip, lips in sync',
  'app-translate-video': 'Re-voice a clip in another language',
  'app-music-bed': 'Music under a clip, original audio kept',
  // 3D
  'three-d': 'One picture in, a textured 3D model out',
};

/** Features column of the Image / Video / Audio mega panel: at most MAX_FEATURES rows, so it stands about as tall as the Models column
 *  and the panel fits the window. MENU_FEATURE_ORDER is the hand-picked order (most useful first), by row key: image feature ids
 *  (shared/imageFeatures.ts) and video workflow ids (shared/videoWorkflows.ts). An id the server no longer has is skipped quietly; a
 *  medium with no list (Audio) keeps its own order. The column's "See all N ›" counts every row, capped or not. */
export const MAX_FEATURES = 10;
export const MENU_FEATURE_ORDER: Record<Medium, string[] | null> = {
  image: ['create-image', 'edit-image', 'upscale', 'relight', 'character-sheet', 'face-swap', 'product-shot', 'camera-angles'],
  /* Explore rework (2026-10-26): the real flows first: LTX-2.5 Create, Direct a Shot, Loop, Morph, Exploded view, New angle, then the swaps and Lip Sync */
  video: ['create', 'direct-a-shot', 'loop', 'morph', 'exploded-view', 'new-angle', 'motion-control', 'object-swap', 'lip-sync', 'extend'],
  audio: null,
  '3d': ['plan-a-shot', 'image-to-3d', 'turntable'], // 3D workflows (server shared/threeD.ts); Direct a Shot first; roadmap rows stay in the picker (flagged Coming soon), not the menu
};
/** The rows the Features column shows: the medium's order (unknown ids skipped), else the list as given; capped at MAX_FEATURES. */
export function menuFeatureRows<T extends { key: string }>(medium: Medium, rows: T[]): T[] {
  const order = MENU_FEATURE_ORDER[medium];
  const picked = order ? order.flatMap(id => rows.filter(r => r.key === id).slice(0, 1)) : rows;
  return picked.slice(0, MAX_FEATURES);
}
