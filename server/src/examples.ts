/**
 * "Recreate" examples: our own demo setups (local sample media in server/samples, served at /samples/).
 * A web "Recreate" opens `<tool route>?example=<id>` and prefills preset, prompt, source and references.
 */
export interface Example {
  id: string; toolId: string; title: string; preset?: string; types?: string[]; prompt?: string; video?: string; image?: string; refs?: string[]; previewUrl?: string | null;
  /** Still poster for the example card (generated from repo samples by scripts/gen-example-media.py). */
  posterUrl?: string | null;
  /** Recreate prefill (batch 1): quality, provider (falls back to the tool default if not usable), toggles. */
  quality?: string; provider?: string; toggles?: Record<string, boolean | number | string>;
  /** DP #21: true only for a real render of this setup. Every example today is a procedural placeholder (scripts/gen-example-media.py from repo samples). */
  real?: boolean;
  /** = !real: the card shows a placeholder label until a real render replaces the media. */
  placeholder?: boolean;
}
const BASE_EXAMPLES: Example[] = [
  { id: 'ex-outfit', toolId: 'object-swap', title: 'New jacket, same take', preset: 'outfit', prompt: 'swap the jacket for the one in @image1', video: '/samples/sample-take.mp4', refs: ['/samples/sample-character.png'], quality: '720p' },
  { id: 'ex-recast', toolId: 'motion-transfer', title: 'Recast the dancer', preset: 'new-cast', prompt: '@image1 performs the same moves', video: '/samples/sample-take.mp4', refs: ['/samples/sample-character.png'], quality: '720p' },
  { id: 'ex-pattern', toolId: 'restyle', title: 'Watercolor pass', preset: 'watercolor', prompt: 'soft watercolor washes, keep the motion', video: '/samples/sample-pattern.mp4', quality: '720p' },
  // Per-tool galleries (audit 04-06 P1): each swap tool gets its own set matching its inputs.
  { id: 'ex-product', toolId: 'object-swap', title: 'Swap the product in hand', preset: 'product', prompt: 'replace the held item with @image1, keep the hand pose', video: '/samples/sample-take.mp4', refs: ['/samples/sample-product.png'], quality: '720p' },
  { id: 'ex-recast-character', toolId: 'object-swap', title: 'Recast the lead', preset: 'main-person', prompt: 'replace the person with @image1', video: '/samples/sample-take.mp4', refs: ['/samples/sample-character.png'], quality: '1080p' },
  { id: 'ex-dance', toolId: 'motion-transfer', title: 'Same dance, new dancer', preset: 'new-cast', prompt: '@image1 dances the same routine, same timing', video: '/samples/sample-take.mp4', refs: ['/samples/sample-character.png'], quality: '720p' },
  { id: 'ex-action', toolId: 'motion-transfer', title: 'Action beat recast', preset: 'new-cast', prompt: '@image1 performs the same action beat', video: '/samples/sample-take.mp4', refs: ['/samples/sample-keyframe.png'], quality: '480p' },
  { id: 'ex-claymation', toolId: 'restyle', title: 'Claymation pass', preset: 'claymation', prompt: 'stop-motion clay look, keep the motion', video: '/samples/sample-take.mp4', quality: '720p' },
  { id: 'ex-anime', toolId: 'restyle', title: 'Anime cel pass', preset: 'anime-cel', prompt: 'flat cel shading, clean lines', video: '/samples/sample-pattern.mp4', quality: '720p' },
  { id: 'ex-two-angles', toolId: 'reshoot', title: 'Two new angles', preset: 'low-angle', prompt: 'keep the actor centered', video: '/samples/sample-take.mp4', quality: '720p', toggles: { fullClip: false } },
  { id: 'ex-orbit', toolId: 'camera', title: 'Orbit reveal', types: ['orbit', 'push-in'], prompt: 'slow reveal', image: '/samples/sample-keyframe.png', quality: '720p', toggles: { enhance: true, duration: 5 } },
  { id: 'ex-float', toolId: 'photo-fx', title: 'Zero gravity', types: ['float'], prompt: 'drifting gently upward', image: '/samples/sample-character.png', quality: '720p', toggles: { enhance: true } },
  { id: 'ex-upscale', toolId: 'upscale', title: 'Sharpen a clip', types: ['precise'], video: '/samples/sample-pattern.mp4', quality: '1080p' },
];

/** Pass 2: at least one example for every tool in /api/tools (own demo setups, repo samples only). */
const T = '/samples/sample-take.mp4', PAT = '/samples/sample-pattern.mp4', CH = '/samples/sample-character.png', KF = '/samples/sample-keyframe.png', PR = '/samples/sample-product.png';
const MORE_EXAMPLES: Example[] = [
  { id: 'ex-create-portrait', toolId: 'create-image', title: 'Studio portrait', preset: 'generate', prompt: 'studio portrait, soft key light, teal backdrop', quality: 'high' },
  { id: 'ex-create-edit', toolId: 'create-image', title: 'Edit: golden hour', preset: 'edit', prompt: 'same scene at golden hour', image: KF },
  { id: 'ex-h3-i2v', toolId: 'h3-video', title: 'Bring a still to life', preset: 'i2v', prompt: 'gentle wind, slow push in', image: KF },
  { id: 'ex-audio-music', toolId: 'audio', title: 'Lo-fi loop', preset: 'music', prompt: 'warm lo-fi beat, 80 bpm, vinyl crackle' },
  { id: 'ex-soundtrack', toolId: 'soundtrack', title: 'Score this clip', preset: 'v2s', prompt: 'hopeful strings that follow the motion', video: T },
  { id: 'ex-voiceover', toolId: 'voice', title: 'Narrate the take', preset: 'voiceover', prompt: 'A quiet morning, before anyone else is awake.', video: T },
  { id: 'ex-image-x4', toolId: 'image-upscale', title: '4x sharper product', preset: 'x4', image: PR },
  { id: 'ex-character-sheet', toolId: 'app-character-sheet', title: 'Turnaround sheet', prompt: 'a friendly explorer in a green coat, short curly hair' },
  { id: 'ex-product-shot', toolId: 'app-product-shot', title: 'Hero product shot', prompt: 'product on marble, soft shadows, top light' },
  { id: 'ex-inpaint', toolId: 'app-inpaint', title: 'Fill the corner', prompt: 'a potted plant in the corner', image: KF },
  { id: 'ex-relight', toolId: 'app-relight', title: 'Neon relight', prompt: 'magenta and cyan neon rim light', image: CH },
  { id: 'ex-transition', toolId: 'app-transition', title: 'Morph transition', prompt: 'smooth morph into the next shot', image: KF },
  { id: 'ex-ugc-ad', toolId: 'app-ugc-ad', title: 'Selfie-style ad', prompt: 'creator holds the product up to camera and smiles' },
  { id: 'ex-orbit-app', toolId: 'app-orbit-shot', title: 'Orbit the hero', prompt: '@image1 standing still, camera circles', refs: [CH] },
  { id: 'ex-anime-app', toolId: 'app-anime-restyle', title: 'One-click anime', preset: 'anime-cel', video: PAT },
  { id: 'ex-video-upscale-app', toolId: 'app-video-upscale', title: 'Upscale to 1080p', preset: 'precise', video: T },
  { id: 'ex-change-voice-app', toolId: 'app-change-voice', title: 'New voice, same words', preset: 'change-voice', video: T },
  { id: 'ex-translate-app', toolId: 'app-translate-video', title: 'Translate to Spanish', preset: 'translate', video: T },
  { id: 'ex-music-bed-app', toolId: 'app-music-bed', title: 'Add a music bed', preset: 'music', prompt: 'light acoustic guitar', video: T },
  { id: 'ex-cutout-green', toolId: 'cutout', title: 'Green-screen cutout', preset: 'green', video: T },
  // OpenSoul: poster + 3 s preview made from our own samples (server/samples/examples/ex-soul-*).
  { id: 'ex-soul-polaroid', toolId: 'soul', title: 'Polaroid afternoon', preset: 'polaroid', prompt: 'friends laughing on a rooftop at sunset', toggles: { aspect: '3:4', n: 1 } },
  { id: 'ex-soul-character', toolId: 'soul', title: 'Same face, flash editorial', preset: 'flash-editorial', prompt: 'portrait in a red coat on a city street at night', refs: [CH], toggles: { engine: 'auto', colourHex: '#b3202a,#1c1c24', colourStrength: 0.5, aspect: '3:4', n: 4 } },
];
export const EXAMPLES: Example[] = [...BASE_EXAMPLES, ...MORE_EXAMPLES].map((e) => ({
  ...e,
  posterUrl: e.posterUrl ?? `/samples/examples/${e.id}.jpg`,
  previewUrl: e.previewUrl ?? `/samples/examples/${e.id}.mp4`,
  real: e.real === true,
  placeholder: e.real !== true,
}));
/** DP #21: tools whose examples are all placeholders (need real renders: a GPU or provider keys). */
export const toolsWithoutRealExamples = () => [...new Set(EXAMPLES.map((e) => e.toolId))].filter((t) => !EXAMPLES.some((e) => e.toolId === t && e.real));
