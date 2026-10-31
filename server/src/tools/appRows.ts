/**
 * LOW-ROWS-SPEC (Oct 18): data for the app rows Product Shot, Transitions, UGC Ad, Orbit Shot, Relight, Change Voice and
 * Translate Video. All ids, labels and prompt fragments are our own wording. Posters / preview loops are null until our own media exists
 * (procedural placeholders or the Oct 26–29 real run); DP shows its placeholder tile when `poster` is null.
 */
export interface AppOption { value: string; label: string; prompt?: string; tag?: string; poster?: string | null; preview?: string | null; [k: string]: unknown }
export interface AppField {
  name: string; label: string; kind: 'select' | 'number' | 'color' | 'json' | 'text'; options?: AppOption[]; default?: string;
  /** kind 'text': a short free-text field (Material Swap: what the object is); spaces collapsed, longer than this is a 400 too_long. */
  maxLength?: number; placeholder?: string;
  /** kind 'json': checks and normalises the text (Relight's light sphere rig); an error is a 400 with code format. */
  parse?: (raw: string) => { value: string } | { error: string };
  min?: number; max?: number; step?: number; pattern?: string; help?: string;
  /** Which picker DP renders: tiles (poster grid), segmented, slider, swatches (+ hex field), pad. */
  control?: 'tiles' | 'segmented' | 'slider' | 'swatches' | 'grid' | 'pad' | 'sphere';
  /** Optional field: blank means "not used" (no default fragment). */
  optional?: boolean;
}
const opt = (value: string, label: string, prompt: string, extra: Partial<AppOption> = {}): AppOption => ({ value, label, prompt, poster: null, preview: null, ...extra });

// ---- T23 Product Shot: scene presets (prompt modifiers) ----
export const PRODUCT_SCENES: AppOption[] = [
  opt('studio-white', 'Clean studio', 'on a seamless white studio backdrop, soft even key light, gentle floor shadow'),
  opt('studio-colour', 'Colour backdrop', 'on a single-colour paper backdrop in a muted tone, soft studio light'),
  opt('marble', 'Stone counter', 'on a polished stone counter, soft window light, shallow depth of field'),
  opt('kitchen', 'Kitchen bench', 'on a wooden kitchen bench with a few blurred props behind, warm morning light'),
  opt('outdoor-sun', 'Outdoor sunlight', 'outdoors in bright natural sunlight, crisp shadows, a softly blurred garden behind'),
  opt('bar-night', 'Evening bar', 'on a bar top at night, warm practical lights and soft bokeh behind'),
  opt('flat-lay', 'Top-down flat lay', 'top-down flat lay on a textured surface with a few small complementary props'),
  opt('podium', 'Display podium', 'standing on a simple round display podium, clean backdrop, studio spot light'),
];
export const PRODUCT_KEEP = "keep the product's shape, label text and colours exactly";

// ---- Character Sheet layouts (2026-10-25, our own wording) ----
/** One layout = how the sheet is split into panels (`prompt`), the frame shape it asks for (`aspect`, snapped to the model's nearest shape
 *  on the run) and what the "keep" block checks across panels. Classic is the Oct 22 sheet word for word, so older jobs still match. */
export interface CharacterLayout extends AppOption { prompt: string; aspect: string; description: string;
  /** The same panels in few words, for models with a small prompt cap (Wan 2.5 Image: 800 characters; apps.ts characterSheetPrompt). */
  short: string;
  keep: { /** "all three views" */ views: string; /** full-body panels: feet in frame and no body cropping (null = close-ups only) */ fullBody: string | null; /** what else must hold */ extra?: string } }
const sheet = (value: string, label: string, description: string, aspect: string, prompt: string, keep: CharacterLayout['keep'], short: string): CharacterLayout => ({ ...opt(value, label, prompt), prompt, description, aspect, keep, short });
const FOUR_SHORT = 'front, three-quarter, side profile and back';
const FOUR_VIEWS = 'front view facing the camera, three-quarter view turned 45 degrees to the left, side profile facing left, and back view facing away from the camera';
export const CHARACTER_LAYOUTS: CharacterLayout[] = [
  sheet('classic', 'Classic', 'Front, back and a face close-up', '4:3',
    'one image split into three equal vertical panels side by side, separated by thin dark divider lines. Left panel: full-body front view from head to toe with the shoes fully in frame, standing straight, arms relaxed at the sides, facing the camera. Centre panel: full-body back view from head to toe in the same pose, facing away from the camera. Right panel: tight close-up of the face and shoulders, looking straight into the lens',
    { views: 'all three views', fullBody: 'feet visible in both full-body panels' }, 'three panels side by side: full-body front view head to toe, full-body back view, face close-up'),
  sheet('turnaround', 'Turnaround', 'Four views, head to toe', '16:9',
    `one image split into four equal vertical panels side by side, separated by thin dark divider lines. Every panel shows the full body from head to toe with the feet fully in frame, in the same relaxed standing pose and at the same scale, the head and feet at the same height in every panel. Left to right: ${FOUR_VIEWS}`,
    { views: 'all four views', fullBody: 'feet visible in every panel' }, `four panels side by side, full body head to toe, same pose and scale: ${FOUR_SHORT}`),
  sheet('turnaround-face', 'Turnaround + face', 'Four views and a face close-up', '21:9',
    `one wide image split into five equal vertical panels side by side, separated by thin dark divider lines. The first four panels show the full body from head to toe with the feet fully in frame, in the same relaxed standing pose and at the same scale, left to right: ${FOUR_VIEWS}. Last panel: head-and-shoulders close-up of the face, looking straight into the lens`,
    { views: 'all five panels', fullBody: 'feet visible in every full-body panel' }, `five panels side by side: four full-body views head to toe (${FOUR_SHORT}), then a face close-up`),
  sheet('expressions', 'Expressions', 'Six faces, one per mood', '3:2',
    'one image laid out as a grid of six equal panels, three across and two down, separated by thin dark divider lines. Every panel is a head-and-shoulders close-up from the same straight-on angle, at the same size and in the same light. Top row, left to right: neutral, a gentle smile, laughing. Bottom row, left to right: angry, sad, surprised',
    { views: 'all six panels', fullBody: null, extra: 'only the facial expression changes from panel to panel' }, 'a grid of six head-and-shoulders close-ups, three across and two down, same angle: neutral, smile, laughing, angry, sad, surprised'),
  sheet('full-sheet', 'Full sheet', 'Four views and four faces', '16:9',
    `one image in two rows, every panel separated by thin dark divider lines. Top row: four equal panels showing the full body from head to toe with the feet fully in frame, in the same relaxed standing pose and at the same scale, left to right: ${FOUR_VIEWS}. Bottom row: four equal head-and-shoulders close-ups from the front, left to right: neutral, smiling, surprised, angry`,
    { views: 'all eight panels', fullBody: 'feet visible in every full-body panel' }, `two rows: four full-body views head to toe (${FOUR_SHORT}), then four face close-ups: neutral, smiling, surprised, angry`),
];
export const CHARACTER_LAYOUT_DEFAULT = 'classic';

// ---- T26 Transitions: transition types (prompt modifiers on MiniMax H3 start + end frame) ----
export const TRANSITION_TYPES: AppOption[] = [
  opt('morph', 'Morph', 'the first scene smoothly morphs into the second scene'),
  opt('zoom-through', 'Zoom through', 'the camera zooms forward through the first scene and comes out in the second scene'),
  opt('whip', 'Whip pan', 'a fast whip pan with motion blur carries the view from the first scene to the second scene'),
  opt('match-cut', 'Match cut', 'shapes and positions line up so the first scene cuts cleanly into the matching second scene'),
  opt('dissolve', 'Soft dissolve', 'the first scene slowly dissolves into the second scene'),
  opt('spin', 'Spin', 'the camera spins around its axis and lands on the second scene'),
  opt('light-leak', 'Light flash', 'a warm flash of light fills the frame and fades to reveal the second scene'),
  opt('ink', 'Ink spread', 'dark ink spreads across the first scene and recedes to reveal the second scene'),
  opt('glitch', 'Glitch', 'a short digital glitch breaks up the first scene and resolves into the second scene'),
];

// ---- T27 UGC Ad: presenters (our own descriptions; no real-person likeness) + hooks ----
const pres = (value: string, label: string, setting: string, framing: string, prompt: string): AppOption =>
  opt(value, label, prompt, { setting, framing, refImage: null, licence: 'generated, ours' });
export const UGC_PRESENTERS: AppOption[] = [
  pres('home-sofa', 'Sofa chat', 'home', 'selfie', 'a friendly presenter in their late twenties on a living-room sofa, holding the phone at arm\'s length'),
  pres('home-kitchen', 'Kitchen counter', 'home', 'desk', 'a cheerful presenter leaning on a kitchen counter, phone propped up in front of them'),
  pres('home-mirror', 'Bedroom mirror', 'home', 'selfie', 'a relaxed presenter filming in a bedroom mirror in casual clothes'),
  pres('street-walk', 'Street walk', 'street', 'walking', 'an energetic presenter walking down a sunny city street, talking to the phone camera'),
  pres('street-crossing', 'Corner stop', 'street', 'selfie', 'a presenter stopped at a street corner, city noise and traffic behind them'),
  pres('cafe-table', 'Café table', 'cafe', 'desk', 'a presenter at a small café table with a coffee cup, phone propped against a glass'),
  pres('cafe-window', 'Café window', 'cafe', 'selfie', 'a presenter by a café window seat, soft daylight on their face'),
  pres('gym-floor', 'Gym floor', 'gym', 'selfie', 'a sporty presenter in workout clothes on a gym floor, slightly out of breath'),
  pres('gym-locker', 'Locker room', 'gym', 'desk', 'a presenter sitting on a locker-room bench with a water bottle'),
  pres('office-desk', 'Office desk', 'office', 'desk', 'a presenter at a tidy office desk with a laptop, speaking straight to camera'),
  pres('office-hall', 'Office hallway', 'office', 'walking', 'a presenter walking through a bright office hallway holding the phone'),
  pres('car-seat', 'Parked car', 'car', 'selfie', 'a presenter in the driver\'s seat of a parked car, phone on the dashboard mount'),
];
export const UGC_SETTINGS = ['home', 'street', 'cafe', 'gym', 'office', 'car'];
export const UGC_FRAMINGS = ['selfie', 'desk', 'walking'];
export const UGC_HOOKS: AppOption[] = [
  opt('question', 'Question', 'opens by asking the viewer a direct question about the problem the product solves'),
  opt('bold-claim', 'Bold claim', 'opens with a bold, confident claim about what the product does'),
  opt('before-after', 'Before / after', 'opens by showing the problem before the product, then the result after'),
  opt('unboxing', 'Unboxing', 'opens by unboxing the product on camera with a genuine first reaction'),
  opt('testimonial', 'Testimonial', 'opens as a personal testimonial about using the product every day'),
];

// ---- T28 Orbit Shot: orbit types → Director prompt tags (cinema/timeline.ts CAMERA_MOVES) ----
export const ORBIT_TYPES: AppOption[] = [
  opt('arc-left', 'Arc left', '', { tag: '#orbit-l' }), opt('arc-right', 'Arc right', '', { tag: '#orbit-r' }), opt('full', 'Full turn', '', { tag: '#orbit-360' }),
  opt('spin', 'Object spin', '', { tag: '#spin-3d' }), opt('freeze', 'Frozen moment', '', { tag: '#time-freeze' }),
];
export const ORBIT_BACKDROPS: AppOption[] = [
  opt('keep', 'Keep original', ''), opt('light', 'Plain light', 'on a plain light seamless backdrop'), opt('dark', 'Plain dark', 'on a plain dark seamless backdrop'),
];

// ---- T25 Relight: light controls → prompt fragments ----
export const RELIGHT_DIRECTIONS: AppOption[] = [
  opt('top', 'Above', 'light from directly above the subject'), opt('front', 'Front', 'light from the front, facing the subject'),
  opt('right', 'Right', 'light from the right side of the frame'), opt('left', 'Left', 'light from the left side of the frame'),
  opt('back', 'Behind (rim)', 'strong rim light from behind the subject'), opt('bottom', 'Below', 'light from below the subject'),
];
export const RELIGHT_QUALITY: AppOption[] = [opt('soft', 'Soft', 'soft diffused light, gentle shadows'), opt('hard', 'Hard', 'hard direct light, crisp shadows')];
export const RELIGHT_COLOUR_PRESETS: AppOption[] = [
  opt('#FFFFFF', 'White', ''), opt('#FFC98A', 'Warm', ''), opt('#FFB347', 'Golden', ''), opt('#BFD9FF', 'Cool', ''), opt('#5FD3C6', 'Teal', ''), opt('#E05AD8', 'Magenta', ''),
];
/**
 * Relight looks (2026-10-23): named lighting setups. Picking one sets the four controls to its defaults (`sets`; the user can still change
 * them) and adds a rich description of the setup to the prompt. All wording is our own. The descriptions leave out direction and colour on
 * purpose: those come from the controls, so moving the light never contradicts the look. `tone` (the look's colour temperature) is only
 * added while the colour is still the look's own. `custom` = no look: today's prompt, unchanged.
 * Names describe common photographic lighting setups and the Camera & Lens LIGHTING list
 * (server/src/shared/cameraLens.ts). Required third-party code/asset notices are retained separately.
 */
export interface RelightLook extends AppOption {
  /** the setup's name in the prompt ("golden-hour sunlight") */ light: string;
  /** colour temperature and tint, only while the colour is the look's own */ tone: string;
  /** what picking the look sets */ sets: { direction: string; lightQuality: string; brightness: string; color: string };
  /** tile swatch (CSS background) */ swatch: string;
  /** explanatory source note shown in the tile's tooltip; not a substitute for licence notices */ credit: string;
}
const look = (value: string, label: string, light: string, prompt: string, tone: string, sets: RelightLook['sets'], swatch: string, credit: string): RelightLook =>
  ({ ...opt(value, label, prompt), light, tone, sets, swatch, credit });
export const RELIGHT_LOOKS: RelightLook[] = [
  { ...opt('custom', 'Custom', ''), light: '', tone: '', sets: { direction: 'front', lightQuality: 'soft', brightness: '50', color: '#FFFFFF' },
    swatch: 'linear-gradient(135deg,#55555c,#1e1e22)', credit: 'Ours: your own direction, quality, brightness and colour' },
  look('studio-softbox', 'Studio softbox', 'a large studio softbox key light',
    'one big diffused softbox close to the subject at about 45 degrees and a little above eye level, with a gentle fill from the other side; smooth gradual falloff from highlight to shadow, soft-edged shadows under the nose and chin, even flattering skin with natural texture kept, clean highlights in the hair, one soft square catchlight in each eye, the background a touch darker than the subject',
    'neutral 5500K studio white', { direction: 'left', lightQuality: 'soft', brightness: '60', color: '#FFFFFF' },
    'radial-gradient(circle at 30% 30%,#ffffff,#c9c9cf 40%,#4a4a52 80%)', 'Common lighting term; Camera & Lens lighting list'),
  look('window', 'Window light', 'soft natural window light',
    'daylight from a large window just out of frame as the only source; the light wraps softly around the face and falls off quickly into a gentle shadow side that keeps its detail, a rectangular window catchlight in the eyes, soft highlights on the cheekbone and hair, the room behind dimmer and quietly shaded',
    'clean neutral daylight around 5600K', { direction: 'left', lightQuality: 'soft', brightness: '55', color: '#FFFFFF' },
    'linear-gradient(110deg,#f6f3ec 0 30%,#8c8a85 62%,#2a2927)', 'Common photographic lighting setup'),
  look('golden-hour', 'Golden hour', 'low golden-hour sunlight',
    'late-afternoon sun low near the horizon, raking across the scene at a shallow angle; long soft-edged shadows, a warm glowing edge on the hair and shoulders, honey-toned highlights on the skin, a light warm haze with slightly lifted shadows, warm bounce light on the background',
    'warm golden sunlight around 3200K against slightly cooler shadows', { direction: 'right', lightQuality: 'soft', brightness: '70', color: '#FFC98A' },
    'linear-gradient(160deg,#ffd58a,#e8823e 55%,#3a1d10)', 'Tested look: soft warm amber from the right on FLUX.2 klein 4B (2026-10-23); Camera & Lens lighting list'),
  look('blue-hour', 'Blue hour', 'cool blue-hour twilight',
    'the soft glow of the sky just after sunset with no direct sun; very low contrast and almost no hard shadows, smooth even light on the face, deep blue ambient light in the shadows and background, any lamps or lit windows already in the scene glowing small and warm against the blue, gentle cool catchlights',
    'cool blue twilight around 9000K', { direction: 'front', lightQuality: 'soft', brightness: '40', color: '#BFD9FF' },
    'linear-gradient(170deg,#9fb9e6,#3c5488 55%,#0e1528)', 'Common lighting term; Camera & Lens lighting list'),
  look('neon-night', 'Neon night', 'coloured neon light at night',
    'neon signs just out of frame as the only light at night; saturated colour spilling across one side of the face and clothes with a contrasting cyan glow on the opposite edge, deep near-black shadows, glossy coloured reflections on skin, hair and any shiny or wet surface, the background falling into darkness with small coloured highlights',
    'saturated magenta neon', { direction: 'right', lightQuality: 'hard', brightness: '65', color: '#E05AD8' },
    'linear-gradient(120deg,#ff2e88,#3a0d3d 50%,#00d0ff)', 'Common photographic lighting setup'),
  look('overcast', 'Overcast', 'soft overcast daylight',
    'a bright cloudy sky acting as one huge soft light from above; soft wrap-around light with almost no visible shadows, even exposure across the subject and background, gentle shading under the brow and chin, true-to-life skin tones, calm muted colours, broad soft catchlights',
    'slightly cool neutral daylight around 6500K', { direction: 'top', lightQuality: 'soft', brightness: '50', color: '#FFFFFF' },
    'linear-gradient(180deg,#eef1f5,#b6bcc4 60%,#7c828a)', 'Common lighting term; Camera & Lens lighting list'),
  look('rim', 'Rim / backlight', 'a strong backlight',
    'a bright light behind the subject aimed toward the camera; a glowing outline along the hair, shoulders and edges of the body, the hair lit almost translucent, the front of the subject in soft low-key shade with just enough fill to keep the face readable, the background darker so the outline clearly separates the subject, a soft glow where the light grazes the edges',
    'clean bright white edge light', { direction: 'back', lightQuality: 'hard', brightness: '75', color: '#FFFFFF' },
    'radial-gradient(circle at 50% 40%,#ffffff,#9fc6ff 22%,#1b2433 60%)', 'Common photographic lighting setup'),
  look('candlelight', 'Candlelight', 'warm candlelight',
    'a few small candle flames close to the subject, just below face height, as the only light; a tiny point source with fast falloff so the light fades into darkness within arm\'s length, a warm flickering glow on the face and hands, deep soft shadows, dark surroundings, tiny warm points of light reflected in the eyes, an intimate low-key mood',
    'very warm orange flame light around 1800K', { direction: 'front', lightQuality: 'soft', brightness: '25', color: '#FF9A3C' },
    'radial-gradient(circle at 50% 70%,#ffcf6b,#8a3b0a 32%,#0d0604 68%)', 'Common photographic lighting setup'),
];
export const relightLookOf = (v: string | undefined) => RELIGHT_LOOKS.find((l) => l.value === v && l.value !== 'custom');
/** Brightness and colour words live with the light sphere's rig (shared/lightRig.ts), one source for both. */
export { brightnessWord, colourName } from '../shared/lightRig.js';
/** Pad position (x, y in −1…1, y up) → a phrase like "light from upper left". */
export function padPhrase(x: number, y: number): string {
  const h = x < -0.33 ? 'left' : x > 0.33 ? 'right' : ''; const v = y > 0.33 ? 'upper' : y < -0.33 ? 'lower' : '';
  return `light from ${[v, h].filter(Boolean).join(' ') || 'the front'}`;
}

// ---- T32 Translate Video: native names (display only) ----
export const LANGUAGE_NATIVE: Record<string, string> = {
  en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', it: 'Italiano', pt: 'Português', ar: 'العربية', hi: 'हिन्दी',
  zh: '中文', ja: '日本語', ko: '한국어', ru: 'Русский', tr: 'Türkçe', nl: 'Nederlands', pl: 'Polski', id: 'Bahasa Indonesia',
};
