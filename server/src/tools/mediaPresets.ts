/** Style presets for Create Image (our own names; spec: "preset selector ~20 styles" changing grade/grain/composition from an unchanged prompt).
 *  Applied as a prompt suffix; `lora` (optional) names a LoRA the comfy backend loads when the file is present — none ship by default. */
export const STYLE_PRESETS = [
  ['warm-ambient', 'Warm ambient', 'warm ambient light, golden tones, soft haze'],
  ['street-2000s', '2000s street', 'early-2000s street snapshot, direct flash, saturated colour, slight motion blur'],
  ['mono', 'Black & white', 'black and white, deep contrast, fine film grain'],
  ['stage-light', 'Stage light', 'theatrical spotlight, dark surroundings, dramatic shadows'],
  ['film-35', '35mm film', 'shot on 35mm film, natural grain, gentle halation'],
  ['editorial', 'Editorial', 'fashion editorial, clean studio backdrop, crisp key light'],
  ['neon-night', 'Neon night', 'night city, neon reflections, wet pavement, cyan and magenta'],
  ['pastel', 'Soft pastel', 'pastel palette, airy light, low contrast'],
  ['noir', 'Noir', 'film noir, venetian-blind shadows, hard light'],
  ['product', 'Product shot', 'studio product photography, seamless background, softbox reflections'],
  ['anime-cel', 'Anime cel', 'cel-shaded anime illustration, clean line art'],
  ['watercolor', 'Watercolour', 'loose watercolour painting, paper texture'],
  ['clay-3d', 'Clay 3D', 'soft clay 3D render, rounded forms, studio light'],
  ['vintage-polaroid', 'Instant photo', 'instant-camera photo, faded colours, white border'],
  ['cinematic-teal', 'Teal & orange', 'cinematic teal and orange grade, anamorphic flare'],
  ['documentary', 'Documentary', 'documentary photo, available light, candid'],
  ['flat-light', 'Flat light sheet', 'character sheet, plain grey background, flat even light, full body and close-up'],
  ['golden-hour', 'Golden hour', 'low sun, long shadows, rim light'],
  ['high-key', 'High key', 'high-key bright white, minimal shadows'],
  ['low-key', 'Low key', 'low-key lighting, single source, deep blacks'],
].map(([id, label, prompt]) => ({ id, label, prompt, group: 'Style', posterUrl: `/samples/presets/create-image-style-${id}.jpg` as string | null, lora: null as null | { name: string; strength: number; license: string } }));

/** Voice Studio voices (mock library; real runs map to the provider's built-in or a cloned sample). */
export const VOICE_LIBRARY = [
  { id: 'narrator-warm', label: 'Warm narrator' }, { id: 'narrator-crisp', label: 'Crisp narrator' }, { id: 'young-bright', label: 'Young, bright' },
  { id: 'deep-calm', label: 'Deep, calm' }, { id: 'energetic-host', label: 'Energetic host' }, { id: 'whisper-soft', label: 'Soft' }, { id: 'clone', label: 'My cloned voice (upload sample)' },
];
/** 16 target languages (spec: "Translate: 16 languages"). */
export const VOICE_LANGUAGES = [
  ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['ar', 'Arabic'], ['hi', 'Hindi'],
  ['zh', 'Chinese'], ['ja', 'Japanese'], ['ko', 'Korean'], ['ru', 'Russian'], ['tr', 'Turkish'], ['nl', 'Dutch'], ['pl', 'Polish'], ['id', 'Indonesian'],
].map(([code, label]) => ({ code, label }));
