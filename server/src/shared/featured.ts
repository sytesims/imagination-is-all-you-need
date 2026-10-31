/**
 * Featured generations (2026-10-26, replaces the Examples shelf). ONE list of the app's own real outputs that ship with it: our LTX-2.5 renders
 * (Direct a Shot Mockup → Render, multi-shot text to video, Loop, Morph) and the Image showcase (server/src/shared/showcase.ts). Each one is
 * seeded as a finished job marked Featured (server/src/featuredSeed.ts), so:
 *  - an empty Image / Video / 3D tab shows them in its normal feed, tagged "Example", each with Recreate;
 *  - the feed's "Featured" chip lists them next to the results you starred yourself (POST /api/jobs/:id/feature);
 *  - the sample server ("Just try it") renders from these files instead of test patterns (tools/shared.ts mockResultFor);
 *  - Explore (web/src/ui/Home.tsx) shows the same media and opens the same Recreate links.
 * Files: web/public/showcase/ (H.264 + AAC, metadata stripped; WebP posters); Explore 3D's hero film in web/public/examples/showcase-3d/. Isomorphic: no server-only imports.
 */
import { SHOWCASE, SHOWCASE_GALLERY, showcaseById, type ShowcaseItem } from './showcase.js';
import { threeDRoute } from './threeD.js';
import { VIDEO_PAGE, toolPage, videoWorkflowHref, videoWorkflowOfTool } from './videoWorkflows.js';
import { audioRoute } from './audioWorkflows.js';
import { placeOf } from './modelIds.js';
/** Where one of our own runs happened, in run chips (copy wave 1: never the brand of computer). Compare with isOurComputer, never the words. */
export const OUR_COMPUTER = 'on our computer';
export const isOurComputer = (place?: string | null) => place === OUR_COMPUTER;

export type FeaturedTab = 'image' | 'video' | '3d' | 'audio';
/** `poster` is '' for a sound (the shared AudioCard draws its own cover); width / height are 0 for a sound. */
export interface FeaturedMedia { url: string; poster: string; width: number; height: number; /** clip / sound length (s); absent for a still */ sec?: number; sound?: boolean }
export interface FeaturedItem {
  /** stable key: the seeded job id is derived from it (featuredSeed.ts) */ key: string;
  tab: FeaturedTab; /** also listed on these tabs (a Direct a Shot render: 3D and Video) */ alsoOn?: FeaturedTab[];
  title: string; toolId: string; provider: string; /** model key (shared/modelIds.ts) */ modelKey: string; /** the model as shown */ model: string;
  /** the flow it shows, as the app names it */ flow: string;
  prompt: string; /** the job input the seed carries (Recreate reads it): mode, duration, aspect, loop… (no file paths) */ input: Record<string, unknown>;
  out: FeaturedMedia; /** what it started from: a Mockup clip, a start frame, an input photo */ before?: FeaturedMedia & { label: string };
  /** a second input (Morph's end frame) */ end?: FeaturedMedia & { label: string };
  /** Billing group: local = creator's computer; comfy-cloud = Comfy account (workflow or Router). Read route for the actual place. */ runOn: 'local' | 'comfy-cloud';
  /** the route the seeded job carries (default local:<provider>) */ route?: string; /** a cloud run's real cost (USD) */ costUsd?: number; /** true when only the run estimate was recorded */ costEstimated?: boolean;
  /** measured render time on the maintainer's Mac (M1 Max), when known */ runMs?: number | null;
  /** where Recreate opens (the bar filled, nothing runs); default: the tool's ?recreate=<seed id> */ recreateHref?: string;
  /** an Image to layers run: every layer (bottom first), each a full-canvas transparent WebP with its label and its content box [l, t, r, b] in
   *  canvas pixels (measured at build time), so the seeded job is a real layered job (viewer, PSD, composite poster) and tiles can crop to the box */
  layers?: FeaturedLayer[];
  /** an upscale of `out` that Explore can play instead (Original / Sharper): the same shot and framing, its own run, model, place and price */
  sharp?: FeaturedSharp;
  /** the run that made `out` (its job id; with sharp.inOut, the run that was upscaled): "Made here" needs it */ jobId?: string;
  /** earlier runs the shipped result builds on (Extend's source take), oldest first */ from?: FeaturedRun[];
  /** the size the run rendered at, when `out` ships rescaled to line up with its before clip (the job record's output size) */ rendered?: { width: number; height: number };
  /** false = Explore only (2026-10-28, the user's starter-pack picks): Explore, Workflows and the header menus still show it and open its Recreate
   *  (its job is seeded, never featured), but it is not in the starter pack: no tab's feed, Featured chip or references list shows it. */
  starter?: false;
}
/** `inOut`: `out` already IS this upscale (the original isn't shipped), so its run is part of what the example cost */
export interface FeaturedSharp extends FeaturedMedia { model: string; place: string; route: string; costUsd: number; jobId: string; inOut?: boolean }
/** One real run of ours: its job id, the model as shown, where it ran and what it cost (USD; `est`: the estimate, no receipt recorded). */
export interface FeaturedRun { jobId: string; model: string; place: string; costUsd: number; est?: boolean }
export interface FeaturedLayer { url: string; label: string; box: [number, number, number, number] }

const S = (f: string) => `/showcase/${f}`;
const clip = (name: string, width: number, height: number, sec: number): FeaturedMedia => ({ url: S(`${name}.mp4`), poster: S(`${name}-480.webp`), width, height, sec, sound: true });
const still = (name: string, width: number, height: number): FeaturedMedia => ({ url: S(`${name}.webp`), poster: S(`${name}-480.webp`), width, height });

export const LTX_LOCAL = 'LTX-2.5 22B';
export const LTX_LAYOUT = 'LTX-2.5 + Layout to Render';
export const XMAS_VIDEO_PROMPT = 'A slow push-in on a cosy miniature Christmas village on a round wooden base at night, snowy roofs and warm glowing windows, string lights along the raised circular track as the little red toy train runs around it, soft snow falling. Soft room ambience and a faint music-box hum.';
export const STREET_VIDEO_PROMPT = 'A slow side-tracking shot following a person in a long dark winter coat and knitted scarf as they walk along a snowy pavement on a Christmas evening, past glowing shop windows with decorated trees, warm fairy lights overhead, soft snow falling. Gentle street ambience, soft footsteps in the snow, distant sleigh bells.';
/** The fox showcase (Explore's big clip under the hero): the maintainer's own LTX-2.5 22B text-to-video runs, free on a Mac, 5 s with sound.
 *  Take 1 (job cebc7f7a) cuts close-up → wide; take 2 (job 18dd879f) is one slow push-in. Prompts and settings as they ran. */
export const FOX_PROMPT = "A heartwarming 3D animated feature-film scene in a golden mountain meadow at sunset. Close-up: a young boy with dark hair crouches in tall golden grass and gently reaches toward a small fox with bright, expressive eyes, which steps closer and touches his hand with its nose. Cut to a wide shot: the boy stands on a winding mountain path as the little fox trots beside him, endless golden meadows and hazy blue mountains glowing in warm light. Soft wind, rustling grass, a gentle orchestral swell. Polished 3D animation, realistic fur, rich warm colours, consistent characters.";
export const FOX_CLOSE_PROMPT = "A heartwarming 3D animated feature-film shot in a mountain meadow at golden hour. A young boy with dark hair kneels in tall golden grass and gently reaches out his hand; a small fox with bright, expressive eyes steps closer through the grass and sniffs his fingers, and the boy smiles softly. The camera slowly pushes in at eye level as warm sunlight glows through the fox's fur and the grass sways in the breeze, with hazy blue mountains behind them. Soft wind through the grass, a gentle rustle, a quiet happy breath from the boy, warm orchestral swell. Polished 3D animation, rich warm colours, realistic fur, natural movement, shallow depth of field.";
const RAIN_PROMPT = 'A wide shot frames a rainy city intersection at dusk, neon signs reflecting on wet asphalt. A young woman in a yellow raincoat walks toward camera, gripping a folded newspaper, while cars hiss past behind her. Soft synth music and distant traffic fill the air. A hard cut transitions to a medium close-up of her face under the hood, raindrops catching the neon as she looks off-screen left; the synth score continues across the cut, traffic muffled. She whispers, “He’s late.” Another hard cut jumps to a low-angle shot of a man’s scuffed boots stepping into a puddle at the curb; the music drops to a low drone. He lifts his head into frame — short dark hair, soaked jacket — and smiles toward her off-screen as a bus rumbles past.';
const LIGHTHOUSE_PROMPT = 'A lighthouse on a rocky coast at dusk, waves crash against the rocks, gulls circle, the beam sweeps slowly. Sound of waves and gulls.';
const LOOP_PROMPT = 'A cosy miniature Christmas village at night, soft snow falls gently, warm windows flicker, the little toy train glows. Quiet wind and soft bells.';
/** Motion Control (Video › Motion Transfer), the maintainer's own Comfy Router run (job dc114104): two made-up people swapped into a dance clip,
 *  every move kept. Kling 3.0 Omni Edit, 720p, 8 s, sound kept; cost $1.01. Prompt and settings as they ran. */
export const DANCE_SWAP_PROMPT = 'In @video1, replace the whole man on the left with the man in @image1: his face, hair and his full outfit. Replace the whole woman on the right with the woman in @image2: her face, her short layered dark hair with a fringe, and her full outfit. Keep every dance move, gesture, expression and the timing of @video1 exactly, plus the camera and the pastel set.';
/** Explore's hero (2026-10-27): the maintainer's own LTX-2.5 Pro text-to-video run on Comfy Router (job 67a125ec), a painter in an attic whose drawn
 *  whale comes alive. 720p, 16:9, 10 s with sound; cost $1.72. Prompt and settings as they ran. */
export const PAINTER_PROMPT = 'A slow push-in frames a young woman with a messy auburn bun and paint-stained denim overalls sitting cross-legged on the wooden floor of a small, dim attic studio, sketching on a large sheet of paper by the light of a single desk lamp. She draws a quick pencil outline of a whale, taps it twice with her pencil, and leans back with a curious half-smile. The pencil lines lift off the paper and glow soft blue, swelling into a translucent whale made of drifting light and paper scraps that rises past her face and swims slowly around the rafters. Her eyes widen and she laughs as the whale\'s tail brushes the hanging lightbulbs, setting them swaying and scattering warm reflections across the walls. The camera keeps pushing in and tilts up to follow the whale as it glides toward the round attic window, where the night sky fills with faint glowing sketches of birds and boats. A soft piano melody builds with a low, warm whale call and paper rustling, and she whispers, "Imagination is all you need."';
/** "Made with LTX-2.5" (Explore, 2026-10-27): two more of the maintainer's own LTX-2.5 Pro text-to-video runs on Comfy Router, 720p, 16:9, 10 s with
 *  sound, prompts and settings exactly as they ran. Fox (job f61dcff6): three shots from one prompt, the same boy and fox across the cuts. Koi
 *  (job 71f42559): a paper lantern opens into a koi in the rain. Each billed 363 Comfy credits ($1.716; the fox run's own receipt wasn't recorded,
 *  so it carries the same settings' billed price). (The duet, job 6b9eb153, left the app with the starter-pack picks, 2026-10-28.) */
export const LTX_PRO_FOX_PROMPT = "A heartwarming 3D animated feature-film sequence in a golden mountain meadow at sunset, polished Pixar-quality animation, rich warm colours, soft atmospheric haze, consistent characters throughout.\n\nShot 1, close-up: a young boy with short dark hair, a soft grey t-shirt and dark trousers crouches in tall golden grass that sways in the evening breeze. He slowly reaches out his open hand, smiling gently. A small red fox with bright amber eyes, white chest fur and a fluffy white-tipped tail creeps out of the grass, hesitates, then steps closer and touches his fingertips with its nose. The boy's eyes light up and he laughs softly. Warm backlight glows through the fox's fur, shallow depth of field.\n\nShot 2, medium shot from behind them: the boy stands up and the fox circles his feet playfully, both silhouetted against a glowing low sun, golden pollen drifting in the air.\n\nShot 3, wide aerial shot: the camera rises slowly as the boy walks along a winding dirt path through endless golden meadows, the little fox trotting happily beside him, hazy blue mountains layered into the distance under a pink and amber sky.\n\nSound: soft wind through the grass, gentle rustling, a quiet giggle from the boy, a tiny fox chirp, and a warm orchestral score that swells gently into the wide shot. No dialogue, no text, no subtitles, no logos.";
export const LTX_PRO_KOI_PROMPT = "A medium close-up at night in a narrow stone alley where rain drips from paper eaves. A boy cups a small folded paper lantern in both hands, and its candle flickers, swells and peels the paper open into a glowing amber koi that slips free and swims through the falling raindrops. He is about nine, with damp black hair, wearing a navy raincoat with the hood down and rubber boots. His mouth opens and he whispers, \"Wait for me,\" as the koi circles his head once and drifts upward. Warm lantern light paints his face while cool blue moonlight fills the wet alley behind him. The view slowly tilts up with the koi and settles on the koi gliding above the rooftops against a moonlit sky, the boy's upturned face small at the bottom of the frame. Steady rain patters on tiles, a soft bell-like shimmer rings out as the koi forms, and his whisper is barely audible over the rain.";
/** "From one still" (Explore, 2026-10-27): two of the maintainer's own LTX-2.5 Pro image-to-video runs on Comfy Cloud from the same still (a glass whale
 *  over a camel rider, 1344×1008, cropped to 16:9 by the app) and seed 116459, 1080p, 16:9, sound on. Take 1, Glide (job 530ab5eb): 6 s, 146 credits ($1.46).
 *  Take 2, Dive (job 33be70a9): 10 s, 244 credits ($2.44); it ships trimmed to its first 7.4 s (after that the whale stops reading and the rider melts).
 *  Prompts exactly as they ran (the app adds "animate the image." in front when it sends them). */
export const WHALE_GLIDE_PROMPT = 'The whale glides slowly overhead, its tail sweeping once; rainbow light ripples across the dunes and over the rider; the camera tilts up slowly. Sound: low whale song, soft desert wind.';
/** The still both takes start from (job d4ab9018, GPT Image 2.5 Flare text to image on Comfy Router, billed $0.0159). */
const WHALE_STILL_RUN: FeaturedRun = { jobId: 'd4ab9018', model: 'GPT Image 2.5 Flare', place: 'Comfy Cloud', costUsd: 0.0159 };
export const WHALE_DIVE_PROMPT = 'The whale zooms past the rider, its tail sweeping beautifully and the sand storm brewing near the rider; rainbow light ripples across the dunes and over the rider. Sound: slow beautiful matched with the whales speed';
/** The koi take's second half (H3 Extend, job 50d2a3a0), the prompt exactly as it ran. */
export const H3_KOI_EXTEND_PROMPT = 'Continue the same action at the same pace, same camera: the glowing koi circles once above the rooftops, then swims higher into the rain as the camera keeps tilting up toward the moonlit clouds. Steady rain on tiles and a soft shimmer continue. continue the action naturally';
/** Explore "Mockup to film" (2026-10-27): the maintainer's own Direct a Shot run in three passes. The mockup (job a1a50672: Open city, a crane move
 *  over the actor, 8 s, drawn in the browser, free); its first frame painted into a golden-hour photo (job 645de70d: GPT Image 2.5 Flare edit on
 *  Comfy Router, 1536×864, billed $0.0238, quoted $0.04); then the film (job 1a1a33c6: LTX-2.5 22B distilled + Lightricks' Layout to Render LoRA on
 *  Comfy Cloud, 1280×720, 8.04 s with sound, seed 42, est. $0.28 = 60 Comfy credits). Prompts as they ran. */
export const MOCKUP_FILM_PROMPT = 'A young woman in a burnt-orange jacket walks through a sunlit coastal city intersection at golden hour as a green box truck and a small car wait behind her, palm trees swaying. Cinematic 35mm film, warm natural light, real textures, gentle lens flare.';
export const MOCKUP_FIRST_FRAME_PROMPT = 'Turn this 3D blockout into a real photograph taken on a sunny coastal city street at golden hour. Keep EXACTLY the same 16:9 framing, camera angle, lens and composition: the road layout, lane markings and curb lines in the same places, the green box truck top-left and the small car behind it in the same positions and sizes, and the figure in the same place, size and pose walking away from the camera, centred slightly right. Replace every flat grey surface with real materials: weathered asphalt with real road paint, concrete sidewalks, real storefronts and apartment buildings, tall palm trees, real plants. The figure becomes a young woman in a burnt-orange jacket and dark jeans. Warm low sun, long soft shadows, natural colour, cinematic 35mm photo, photoreal.';
/** Explore "Script → Screen" (2026-10-27): the maintainer's own MiniMax H3 text-to-video run on Comfy Cloud (job fb0b44ca, route comfy-cloud:cloud-h3-wf):
 *  a K-drama comedy beat written as a timed shot list with Korean dialogue, 768p, 16:9, 15 s with native sound, seed 856385; cost 120 credits ($1.20).
 *  Prompt exactly as it ran (line breaks normalised). */
export const H3_KDRAMA_PROMPT = 'Korean drama comedy scene, 15 seconds, cinematic, soft contrast, warm skin tones, teal shadows. Seoul office plaza at noon, glass towers.\n\nCharacters (keep identical throughout): a woman in her late twenties with a short black bob, beige trench coat and mustard scarf; a man around thirty with swept-back dark hair, navy three-piece suit and silver tie pin.\n\n0–4s: Wide shot. The man walks fast out of a glass revolving door, eyes on his phone, and shoulder-checks the woman. Her papers scatter. Street ambience, paper rustle.\n4–8s: Close two-shot. She glares at him and says in Korean, angry: "부딪쳤으면 사과는 해야죠." He shrugs and says coldly: "내가 왜?"\n8–11s: Extreme close-up of her eyes. Her face turns calm and dangerous. She whispers in Korean: "그래요?" A low rumble builds and wind lifts her hair.\n11–15s: Low-angle wide. The man shoots straight up into the sky like a rocket with a white trail as she watches, arms crossed. Wind roar, comedic whoosh, camera tilts up the tower.\n\nNatural Korean voices, clear lip sync. No subtitles, no text, no watermark.';
/** Explore 3D's hero film (2026-10-27): Mossbun, from one drawing to a film. The maintainer's own runs, oldest first: the character sheet (job 9564386e,
 *  GPT Image 2.5 Flare on Comfy Router, billed $0.0087); the 3D model (job 092abb03, Tripo 3.1 on Comfy Cloud, est. $0.30 = 64 Comfy credits; its web
 *  copy is /showcase/char-mossbun-3d.glb); Direct a Shot with Mossbun as the actor in the open city, the Low hero angle Shot Recipe, recorded in the
 *  browser (job 13aca5cc, free); its first frame painted free on the Mac (job ea410812, FLUX.2 [klein] 4B), then re-lit to golden hour with every
 *  sign removed (job b688b9c3, GPT Image 2.5 Flare edit on Comfy Router, billed $0.0245, quoted $0.04); then the film (job a11a0c78, LTX-2.5 Pro
 *  image to video on Comfy Cloud from that painted frame, 6 s, 1080p, sound, seed 1200080632, recorded estimate 146 credits = $1.46). Prompt as it ran (the app adds
 *  "animate the image." in front when it sends it). The film is image to video: it does not follow the mockup's camera (that is Layout to Render). */
export const MOSSBUN_FILM_PROMPT = 'Golden hour on a palm-lined city avenue, sunlight flaring through the palms. The small mossy forest creature hops toward the camera along the centre line, its long leaf-ears bouncing, the lantern on the tip of its tail flickering warm orange. The camera glides low and backward in a smooth tracking shot, keeping it centred, as cars pass in soft motion blur on both sides. It stops, looks up into the lens with wide shining eyes, and the lantern blooms brighter, bathing its fur in warm golden light. Sound: soft city ambience, distant traffic, light padded footsteps, then a gentle magical chime as the lantern glows.';
export const MOSSBUN_SHEET_RUN: FeaturedRun = { jobId: '9564386e', model: 'GPT Image 2.5 Flare', place: 'Comfy Router', costUsd: 0.0087 };
export const MOSSBUN_3D_RUN: FeaturedRun = { jobId: '092abb03', model: 'Tripo 3.1', place: 'Comfy Cloud', costUsd: 0.3, est: true };
/** the city step: the mockup, the free paint, the golden-hour edit */
export const MOSSBUN_CITY_RUNS: FeaturedRun[] = [{ jobId: '13aca5cc', model: 'Mockup', place: 'in your browser', costUsd: 0 }, { jobId: 'ea410812', model: 'FLUX.2 [klein] 4B', place: OUR_COMPUTER, costUsd: 0 },
  { jobId: 'b688b9c3', model: 'GPT Image 2.5 Flare', place: 'Comfy Router', costUsd: 0.0245 }];
/** Explore "Made with Seedance 2.0" (2026-10-27, the approved cinema strip): two of the maintainer's own Seedance 2.0 runs on Comfy Router.
 *  Lighthouse (job 5b612365, route comfy-router:router-seedance): text to video from nine words, 15 s, 720p (1280×720), sound, seed 222982; the model
 *  cut it into four shots by itself. Billed 690 Comfy credits = $3.2522 (quoted $3.27). Fashion (job 4bb53e5b): image to video from a still, 5 s, 720p,
 *  9:16 (720×1280), sound, seed 963900; billed 230 credits = $1.0901. Its still (job ab863543): Qwen Image 2.1 text to image, free on the Mac, 9:16, 2K.
 *  Prompts and settings as they ran (GET /api/jobs/<id>; the app adds "animate the image." in front of an image-to-video prompt when it sends it). */
export const SEEDANCE_LIGHTHOUSE_PROMPT = 'A lighthouse on a cliff at dusk, waves crashing';
export const SEEDANCE_FASHION_PROMPT = 'Fashion editorial reel, one continuous shot. The model from the image holds a fierce pose, then turns her head toward the camera as the wind lifts her hair and the chrome fabric ripples and catches the light; she takes two slow, confident steps forward while a wave breaks behind her. The camera pushes in slowly from a low angle, with a brief flash-like flicker of light on the metal. Glossy, cinematic, shallow depth of field, natural motion. Keep her face, outfit and the scene exactly as in the image. No text, no logos.';
export const SEEDANCE_STILL_RUN: FeaturedRun = { jobId: 'ab863543', model: 'Qwen Image 2.1', place: OUR_COMPUTER, costUsd: 0 };
/** Explore's Seedance media folder (web/public/showcase is at its cap) */
const SD = (f: string) => `/examples/showcase-seedance/${f}`;
/** Explore 3D's own media folder (web/public/showcase is at its cap) */
const E3 = (f: string) => `/examples/showcase-3d/${f}`;
const MORPH_PROMPT = 'The miniature village magically grows into a real snowy street, toy houses unfold into shopfronts, warm lights bloom. Magical shimmer sound.';

/** Direct a Shot (3D tab): Stage → Mockup → Render. Recreate opens Direct a Shot on the same preset with the Render prompt waiting. */
const directHref = (preset: string, prompt: string) => `${threeDRoute('plan-a-shot')}&preset=${encodeURIComponent(preset)}&realPrompt=${encodeURIComponent(prompt)}`;
const takeInput = (presetName: string, prompt: string, plan: string) => ({ types: ['make-it-real'], mode: 'make-it-real', outKind: 'video', prompt, duration: 5, resolution: '448p', aspect: '16:9', width: 768, height: 448, fps: 24, outputLabel: 'Render',
  makeReal: { planUrl: S(`${plan}.mp4`), planLabel: 'Simple view', presetName, prompt, firstFrame: true, plan: { width: 768, height: 448, frames: 121, seconds: 5, fps: 24, aspect: '16:9', size: 'quick' } } });

export const FEATURED_VIDEO: FeaturedItem[] = [
  /* Explore's two portrait remixes (2026-10-29). The user's completed Comfy Cloud jobs, bundled as metadata-stripped 720px viewing copies;
     Explore-only so adding this section does not change the Examples project's hand-picked starter pack. Inputs ship too: Recreate works on a fresh install. */
  { key: 'trend-mic', tab: 'video', starter: false, title: 'Same mic. New energy.', toolId: 'object-swap', provider: 'comfy-h3-charswap', modelKey: 'minimax-h3-character-swap', model: 'H3 Character Swap', flow: 'Object Swap',
    prompt: '', input: { mode: 'object_swap', swapType: 'person', preset: 'right-person', target: 'person on the right', resolution: '720p', seed: 741261, keepAudio: true, fit: 'pad', count: 1, point: null, mentions: [],
      duration: 11, width: 406, height: 720, hasAudio: true, fps: 24, videoFormat: 'mp4', trim: { start: 0, end: 11 },
      videoUrl: S('trend-mic-original.mp4'), refUrls: [S('trend-mic-person.jpg')], refBatches: [[S('trend-mic-person.jpg')]], refGroupLabels: ['Refs 1–1'] },
    out: { url: S('trend-mic-result.mp4'), poster: S('trend-mic-result.jpg'), width: 394, height: 720, sec: 11.04, sound: true },
    before: { url: S('trend-mic-original.mp4'), poster: S('trend-mic-original.jpg'), width: 406, height: 720, sec: 11, sound: true, label: 'Original clip' },
    runOn: 'comfy-cloud', route: 'comfy-cloud:cloud-h3-charswap', costUsd: 0.58, jobId: '32072a07', rendered: { width: 736, height: 1344 } },
  { key: 'trend-dance', tab: 'video', starter: false, title: 'Same moves. New cast.', toolId: 'two-person-swap', provider: 'cloud-h3-two-swap', modelKey: 'minimax-h3-character-swap', model: 'H3 Character Swap', flow: 'Swap Two People',
    prompt: '', input: { mode: 'two-person-swap', outKind: 'video', resolution: '768p', seed: 875972, keepAudio: true, fit: 'pad', duration: 10, width: 540, height: 720, hasAudio: true,
      cast: [{ point: { x: 0.3727, y: 0.4864 }, who: 'man on the left, dark red tie' }, { point: { x: 0.7303, y: 0.5045 }, who: 'man on the right, blue tie' }],
      pointA: '0.3727,0.4864', pointB: '0.7303,0.5045', whoA: 'man on the left, dark red tie', whoB: 'man on the right, blue tie',
      videoUrl: S('trend-dance-original.mp4'), compareUrl: S('trend-dance-original.mp4'), refUrls: [S('trend-dance-person-a.jpg'), S('trend-dance-person-b.jpg')],
      personAUrl: S('trend-dance-person-a.jpg'), personBUrl: S('trend-dance-person-b.jpg'), trim: { start: 0, end: 10 } },
    out: { url: S('trend-dance-result.mp4'), poster: S('trend-dance-result.jpg'), width: 540, height: 720, sec: 10, sound: true },
    before: { url: S('trend-dance-original.mp4'), poster: S('trend-dance-original.jpg'), width: 540, height: 720, sec: 10, sound: true, label: 'Original clip' },
    runOn: 'comfy-cloud', route: 'comfy-cloud:cloud-h3-two-swap', costUsd: 1.06, jobId: '84505322', rendered: { width: 864, height: 1152 } },
  { key: 'ltx-christmas-take', starter: false, tab: '3d', alsoOn: ['video'], title: 'Christmas village, Mockup to Render', toolId: 'make-it-real', provider: 'comfy-ltx25-layout', modelKey: 'ltx-2.5-22b', model: LTX_LAYOUT, flow: 'Direct a Shot',
    prompt: XMAS_VIDEO_PROMPT, input: takeInput('Diorama world', XMAS_VIDEO_PROMPT, 'ltx-christmas-plan'),
    out: { ...clip('ltx-christmas-real', 768, 448, 5), poster: S('ltx-christmas-real-480.webp') }, before: { ...clip('ltx-christmas-plan', 768, 448, 5), sound: false, label: 'Mockup · Diorama world' },
    runOn: 'local', jobId: 'f6281093', recreateHref: directHref('diorama', XMAS_VIDEO_PROMPT) },
  { key: 'ltx-street-take', starter: false, tab: '3d', alsoOn: ['video'], title: 'Christmas street walk-by, Mockup to Render', toolId: 'make-it-real', provider: 'comfy-ltx25-layout', modelKey: 'ltx-2.5-22b', model: LTX_LAYOUT, flow: 'Direct a Shot',
    prompt: STREET_VIDEO_PROMPT, input: takeInput('Walk-by', STREET_VIDEO_PROMPT, 'ltx-street-plan'),
    out: clip('ltx-street-real', 768, 448, 5), before: { ...clip('ltx-street-plan', 1280, 720, 5), sound: false, label: 'Mockup · Walk-by' },
    runOn: 'local', recreateHref: directHref('walk-by', STREET_VIDEO_PROMPT) },
  { key: 'ltx-fox-meadow', tab: 'video', title: 'A boy and a fox, golden meadow', toolId: 'h3-video', provider: 'comfy-ltx25-video', modelKey: 'ltx-2.5-22b', model: LTX_LOCAL, flow: 'Make a video',
    prompt: FOX_PROMPT, input: { types: ['t2v'], mode: 't2v', outKind: 'av-video', duration: 5, resolution: '576p', aspect: '16:9', audio: true, quality: 'quality', seed: 262380, steps: 11, frames: 121, fps: 24 },
    out: clip('ltx-fox-meadow', 1024, 576, 5), runOn: 'local', jobId: 'cebc7f7a' },
  { key: 'ltx-fox-meadow-close', starter: false, tab: 'video', title: 'A boy and a fox, one slow push-in', toolId: 'h3-video', provider: 'comfy-ltx25-video', modelKey: 'ltx-2.5-22b', model: LTX_LOCAL, flow: 'Make a video',
    prompt: FOX_CLOSE_PROMPT, input: { types: ['t2v'], mode: 't2v', outKind: 'av-video', duration: 5, resolution: '576p', aspect: '16:9', audio: true, quality: 'quality', seed: 710001, steps: 11, frames: 121, fps: 24 },
    out: clip('ltx-fox-meadow-close', 1024, 576, 5), runOn: 'local', jobId: '18dd879f' },
  { key: 'ltx-rain-city', starter: false, tab: 'video', title: 'Rainy city, three shots with sound', toolId: 'h3-video', provider: 'comfy-ltx25-video', modelKey: 'ltx-2.5-22b', model: LTX_LOCAL, flow: 'Make a video',
    prompt: RAIN_PROMPT, input: { types: ['t2v'], mode: 't2v', outKind: 'av-video', duration: 5, resolution: '576p', aspect: '16:9', audio: true, seed: 792961, steps: 11, frames: 121, fps: 24 },
    out: clip('ltx-rain-city', 1024, 576, 5), runOn: 'local', jobId: '7f3fbfa8' },
  { key: 'ltx-lighthouse', starter: false, tab: 'video', title: 'Lighthouse at dusk', toolId: 'h3-video', provider: 'comfy-ltx25-video', modelKey: 'ltx-2.5-22b', model: LTX_LOCAL, flow: 'Make a video',
    prompt: LIGHTHOUSE_PROMPT, input: { types: ['t2v'], mode: 't2v', outKind: 'av-video', duration: 2, resolution: '448p', aspect: '16:9', audio: true, seed: 42, steps: 11, frames: 49, fps: 24 },
    out: clip('ltx-lighthouse', 768, 448, 2), runOn: 'local' },
  { key: 'ltx-village-loop', starter: false, tab: 'video', title: 'Snow village, on a loop', toolId: 'h3-video', provider: 'comfy-ltx25-video', modelKey: 'ltx-2.5-22b', model: LTX_LOCAL, flow: 'Loop',
    prompt: LOOP_PROMPT, input: { types: ['i2v'], mode: 'i2v', outKind: 'av-video', duration: 2, resolution: '448p', aspect: 'auto', audio: true, loop: true, seed: 2077090979, steps: 11, frames: 48, fps: 24,
      imageUrl: S('ltx-village-start.jpg'), refUrls: [S('ltx-village-start.jpg')] },
    out: clip('ltx-village-loop', 768, 448, 2), before: { ...still('ltx-village-start', 1024, 576), label: 'Start frame' }, runOn: 'local', jobId: 'a248c74f' },
  { key: 'ltx-morph', starter: false, tab: 'video', title: 'Toy village grows into a real street', toolId: 'app-transition', provider: 'comfy-ltx25-video', modelKey: 'ltx-2.5-22b', model: LTX_LOCAL, flow: 'Morph',
    prompt: MORPH_PROMPT, input: { types: ['flf'], mode: 'flf', outKind: 'av-video', duration: 2, resolution: '448p', aspect: 'auto', audio: true, seed: 1749491819, steps: 11, frames: 49, fps: 24,
      transition: 'morph', appFields: { transition: 'morph' }, appPrompt: MORPH_PROMPT, appId: 'transition', baseTool: 'h3-video',
      imageUrl: S('ltx-village-start.jpg'), lastFrameUrl: S('ltx-morph-end.jpg'), refUrls: [S('ltx-village-start.jpg'), S('ltx-morph-end.jpg')] },
    out: clip('ltx-morph', 768, 448, 2), before: { ...still('ltx-village-start', 1024, 576), label: 'Start frame' }, end: { ...still('ltx-morph-end', 1024, 572), label: 'End frame' }, runOn: 'local', jobId: '474b596d' },
  { key: 'kling-dance-swap', tab: 'video', title: 'Same dance, new cast', toolId: 'motion-transfer', provider: 'router-kling-edit', modelKey: 'kling-v3-omni-edit', model: 'Kling 3.0 Omni Edit', flow: 'Motion Control',
    prompt: DANCE_SWAP_PROMPT, input: { mode: 'motion_transfer', outKind: 'video', duration: 8, width: 1280, height: 720, hasAudio: true, keepAudio: true, resolution: '720p', seed: 970112, mentions: [1, 2], trim: { start: 0, end: 8 },
      videoUrl: S('kling-dance-swap-in.mp4'), refUrls: [S('kling-dance-swap-ref1.jpg'), S('kling-dance-swap-ref2.jpg')], refBatches: [[S('kling-dance-swap-ref1.jpg'), S('kling-dance-swap-ref2.jpg')]] },
    out: clip('kling-dance-swap', 1920, 1080, 8), before: { ...clip('kling-dance-swap-in', 1280, 720, 8), label: 'Motion clip' },
    runOn: 'comfy-cloud', route: 'comfy-router:router-kling-edit', costUsd: 1.01, jobId: 'dc114104',
    /* the shipped clip IS the upscale (job 1c5974e8, Upscale: Topaz Starlight Precise 2.5 on Comfy Cloud, 1280×720 → 1920×1080, 64 credits = $0.64);
       the 720p original isn't shipped, so `sharp` points at the same file (inOut) and its run counts in what the example cost */
    sharp: { ...clip('kling-dance-swap', 1920, 1080, 8), model: 'Topaz Starlight Precise 2.5', place: 'Comfy Cloud', route: 'comfy-cloud:cloud-topaz-precise', costUsd: 0.64, jobId: '1c5974e8', inOut: true } },
  /* the Explore hero: picture as it ran; sound finished here (user, 2026-10-27): its spoken line taken out, a wordless music-box score
     (YuE2, free on our computer, job 1e02b68e) over the room's own ambience, so "Imagination is all you need" lands once, on the lighthouse film */
  { key: 'ltx-pro-painter', tab: 'video', title: 'A drawing comes alive', toolId: 'h3-video', provider: 'router-ltx-25-pro', modelKey: 'ltx-2.5-pro', model: 'LTX-2.5 Pro', flow: 'Create Video',
    prompt: PAINTER_PROMPT, input: { types: ['t2v'], mode: 't2v', outKind: 'av-video', duration: 10, resolution: '720p', aspect: '16:9', audio: true, quality: 'quality', bitrate: 'high', seed: 136952, n: 1 },
    out: clip('ltx-pro-painter', 1280, 720, 10), runOn: 'comfy-cloud', route: 'comfy-router:router-ltx-25-pro', costUsd: 1.716, jobId: '67a125ec' },
  /* Explore chapter 1 (2026-10-27): the maintainer's own Object Swap run on Comfy Cloud (job 1f0cf6a2, 8 s; first shown as the 5 s run d39ac752), H3 Character Swap (open weights), the
     woman on the right swapped for the photo; motion, stage, the man on the left and the sound kept. 1080p asked (renders at the 768p tier), 8 s; cost 42 credits ($0.42). Input as
     it ran (no prompt: the target and the photo drive it). The result rendered at 1344×736; it ships scaled to the source clip's 1280×720 so the wipe lines up. */
  { key: 'h3-char-swap', tab: 'video', title: 'Swap the dancer on the right', toolId: 'object-swap', provider: 'comfy-h3-charswap', modelKey: 'minimax-h3-character-swap', model: 'H3 Character Swap', flow: 'Object Swap',
    prompt: '', input: { mode: 'object_swap', swapType: 'person', preset: 'right-person', target: 'the woman on the right', resolution: '1080p', seed: 737688, keepAudio: true, fit: 'pad', count: 1, point: null, mentions: [],
      duration: 8, width: 1280, height: 720, hasAudio: true, fps: 24, videoFormat: 'mp4', trim: { start: 0, end: 8 },
      videoUrl: S('h3-char-swap-in.mp4'), refUrls: [S('h3-char-swap-face.jpg')], refBatches: [[S('h3-char-swap-face.jpg')]], refGroupLabels: ['Refs 1–1'] },
    out: clip('h3-char-swap', 1280, 720, 8), before: { ...clip('h3-char-swap-in', 1280, 720, 8), label: 'Your clip' },
    runOn: 'comfy-cloud', route: 'comfy-cloud:cloud-h3-charswap', costUsd: 0.42, jobId: '1f0cf6a2', rendered: { width: 1344, height: 736 },
    /* the same result upscaled (job 859d8b97, Upscale: Topaz Starlight Precise 2.5 on Comfy Cloud, 1344×736 → 1918×1050, 8 s, sound; 64 credits = $0.64). Ships
       stretched to 1920×1080 exactly as `out` was to 1280×720 (from 1344×736), so the wipe still lines up with the before clip. Explore plays it by default. */
    sharp: { url: S('h3-char-swap-sharp.mp4'), poster: S('h3-char-swap.webp'), width: 1920, height: 1080, sec: 8, sound: true,
      model: 'Topaz Starlight Precise 2.5', place: 'Comfy Cloud', route: 'comfy-cloud:cloud-topaz-precise', costUsd: 0.64, jobId: '859d8b97' } },
  /* "Made with LTX-2.5" (Explore): LTX-2.5 Pro text-to-video on Comfy Router, as they ran (prompts above) */
  ...([['ltx-pro-fox', 'A boy meets a fox, in three shots', LTX_PRO_FOX_PROMPT, 658873, 'f61dcff6'], ['ltx-pro-koi', 'A lantern becomes a koi', LTX_PRO_KOI_PROMPT, 581498, '71f42559']] as const).map(([key, title, prompt, seed, jobId]): FeaturedItem => ({ key, tab: 'video', title, toolId: 'h3-video', provider: 'router-ltx-25-pro', modelKey: 'ltx-2.5-pro',
    model: 'LTX-2.5 Pro', flow: 'Create Video', prompt, input: { types: ['t2v'], mode: 't2v', outKind: 'av-video', duration: 10, resolution: '720p', aspect: '16:9', audio: true, quality: 'quality', bitrate: 'high', seed, n: 1 },
    out: clip(key, 1280, 720, 10), runOn: 'comfy-cloud', route: 'comfy-router:router-ltx-25-pro', costUsd: 1.716, jobId })),
  /* Explore "From one still": LTX-2.5 Pro image to video on Comfy Cloud, the same still and seed, settings as they ran (prompts above). The still
     Recreate attaches is the run's input as it was (1344×1008); `before` is that still cropped to 16:9 the way the app cropped it, so it lines up with frame 1. */
  ...([['ltx-pro-whale-glide', 'A glass whale glides over the dunes', WHALE_GLIDE_PROMPT, 6, 1.46, clip('ltx-pro-whale-glide', 1920, 1080, 6.04), '530ab5eb'],
    ['ltx-pro-whale-dive', 'A glass whale dives past the rider', WHALE_DIVE_PROMPT, 10, 2.44, clip('ltx-pro-whale-dive', 1280, 720, 7.42), '33be70a9']] as const).map(([key, title, prompt, duration, costUsd, out, jobId]): FeaturedItem => ({
    key, tab: 'video', title, toolId: 'h3-video', provider: 'router-ltx-25-pro', modelKey: 'ltx-2.5-pro', model: 'LTX-2.5 Pro', flow: 'Create Video', prompt,
    input: { types: ['i2v'], mode: 'i2v', outKind: 'av-video', duration, resolution: '1080p', aspect: '16:9', audio: true, quality: 'quality', bitrate: 'high', seed: 116459, n: 1,
      imageUrl: S('ltx-pro-whale-in.jpg'), refUrls: [S('ltx-pro-whale-in.jpg')] },
    out, before: { ...still('ltx-pro-whale-still', 1344, 756), label: 'The still' }, runOn: 'comfy-cloud', route: 'comfy-cloud:cloud-ltx25-pro-api', costUsd, jobId,
    /* the still itself: our GPT Image 2.5 Flare text-to-image run on Comfy Router (job d4ab9018), billed 7 Comfy credits = $0.0159 (quoted $0.03) */
    from: [WHALE_STILL_RUN] })),
  /* Explore whale replacement: MiniMax H3 run d71d11f6, original input/settings; previous LTX examples stay available. */
  {
    "key": "h3-glass-whale",
    "tab": "video",
    "title": "A glass whale dives into the dunes",
    "toolId": "h3-video",
    "provider": "comfy-h3",
    "modelKey": "minimax-h3",
    "model": "MiniMax H3",
    "flow": "Create Video",
    "prompt": "Realistic cinematic image-to-video, one continuous shot. Use the image as the exact first frame. Keep the clear glass humpback whale, the low sun on the right, the orange dunes, the mesas and the small camel rider unchanged.\r\n[00:00–00:03] The glass whale glides slowly to the right, its long pectoral fins sweeping down once. Rainbow caustics ripple across the sand beneath it. The camera pushes in slowly, small amplitude, steady speed [Push in].\r\n[00:03–00:06] The whale arches, tips its head down and dives into the dune ahead of the rider as if the sand were water. A towering curtain of orange sand bursts up, glittering with refracted rainbow light, and a ring-shaped sand wave rolls out across the dunes. The camel startles and takes one step back; the rider stays seated. Brief camera shake on impact [Shake].\r\n[00:06–00:10] Only the huge glass tail rises from the sand. It catches the sun, throws a sweep of rainbow light over the rider and camel, then slaps down and sinks. Sand rains down in slow motion, glowing gold. The camera settles and holds wide [Static shot].\r\nRealistic glass refraction and caustics, heavy believable sand physics, warm low sunlight from the right, light lens flare, fine film grain.\r\nAudio: desert wind, one deep whale call, a heavy thump of sand, sand hissing as it falls, a camel snort; low swelling strings under it.\r\nOne continuous shot, no cuts. No text, no extra people. The whale stays clear glass throughout.",
    "input": {
      "types": [
        "i2v"
      ],
      "mode": "i2v",
      "outKind": "av-video",
      "duration": 10,
      "resolution": "768p",
      "aspect": "16:9",
      "audio": true,
      "quality": "quality",
      "bitrate": "high",
      "seed": 303988,
      "n": 1,
      "imageUrl": "/showcase/h3-glass-whale-in.jpg",
      "refUrls": [
        "/showcase/h3-glass-whale-in.jpg"
      ]
    },
    "out": {
      "url": "/showcase/h3-glass-whale.mp4",
      "poster": "/showcase/h3-glass-whale-480.jpg",
      "width": 1376,
      "height": 768,
      "sec": 10.125,
      "sound": true
    },
    "before": {
      "url": "/showcase/h3-glass-whale-still.jpg",
      "poster": "/showcase/h3-glass-whale-still.jpg",
      "width": 1344,
      "height": 750,
      "label": "The still"
    },
    "runOn": "comfy-cloud",
    "route": "comfy-cloud:cloud-h3-wf",
    "costUsd": 0.8,
    "costEstimated": true,
    "jobId": "d71d11f6",
    "starter": false
  },
  /* Explore "Make your own cartoon." (was "One lantern, one take", letterbox presentation): the maintainer's own H3 Extend run on Comfy Cloud (job 50d2a3a0,
     route comfy-cloud:cloud-h3-extend): +10 s on top of a MiniMax H3 text-to-video take (job 42ceb1af, 10 s, 768p, Comfy Cloud, $0.80), one 20.13 s
     take with sound, 1376×768; cost 52 credits ($0.52). Prompt and settings as they ran. Both clips ship scaled to 1280×714 (H.264 + AAC); `before` is
     the first 10 s, the clip Recreate loads into Extend. THE CLIP LIVES HERE ONLY: to ship an upscaled take, swap `out` (and its posters), nothing else.
     Explore plays a version with an ending added (EXPLORE_KOI.ending); `out` stays the plain take everywhere else. */
  { key: 'h3-koi-take', tab: 'video', title: 'A lantern becomes a koi, one 20 s take', toolId: 'h3-extend', provider: 'comfy-h3-extend', modelKey: 'minimax-h3-extend', model: 'H3 Extend', flow: 'Extend',
    prompt: H3_KOI_EXTEND_PROMPT, input: { mode: 'extend', types: ['extend'], outKind: 'av-video', extendSeconds: 10, direction: 'forward', resolution: '768p', seed: 1517254433, keepAudio: true, audio: true, audioOff: 'strip',
      bitrate: 'standard', fit: 'pad', preset: '', target: '', mentions: [], duration: 10, sourceSeconds: 10.125, outputDuration: 20.13, width: 1280, height: 714, hasAudio: true, fps: 24, videoFormat: 'mp4',
      videoUrl: S('h3-koi-take-in.mp4'), refUrls: [], refBatches: [[]] },
    out: clip('h3-koi-take', 1280, 714, 20.13), before: { ...clip('h3-koi-take-in', 1280, 714, 10.125), label: 'First 10 s · MiniMax H3' },
    runOn: 'comfy-cloud', route: 'comfy-cloud:cloud-h3-extend', costUsd: 0.52, jobId: '50d2a3a0',
    from: [{ jobId: '42ceb1af', model: 'MiniMax H3', place: 'Comfy Cloud', costUsd: 0.8 }],
    recreateHref: `${VIDEO_PAGE}?workflow=extend&recreate=2fb5ac80` },
  /* Explore "Mockup to film": the film (job 1a1a33c6), its mockup as `before` (job a1a50672). Both ship trimmed, in step, to the first shot (frames
     0–94, 3.96 s: they end two frames before the mockup's camera jump at 4.04 s), the film's sound faded out over its last 0.3 s. Recreate opens Direct a Shot on Open city with the
     Render prompt waiting (the sheet loads the plan you record; the painted first frame is credited in Explore). */
  { key: 'ltx-mockup-film', tab: '3d', alsoOn: ['video'], title: 'Golden-hour walk, Mockup to Film', toolId: 'make-it-real', provider: 'comfy-ltx25-layout', modelKey: 'ltx-2.5-22b', model: LTX_LAYOUT, flow: 'Direct a Shot',
    prompt: MOCKUP_FILM_PROMPT, input: { types: ['make-it-real'], mode: 'make-it-real', outKind: 'video', prompt: MOCKUP_FILM_PROMPT, duration: 8, resolution: '720p', aspect: '16:9', width: 1280, height: 720, fps: 24, seed: 42, outputLabel: 'Render', place: 'cloud',
      makeReal: { planUrl: S('ltx-mockup-film-plan.mp4'), planLabel: 'Simple view', presetName: 'Open city · Performance 1', prompt: MOCKUP_FILM_PROMPT, firstFrame: true, place: 'cloud',
        plan: { width: 1280, height: 704, frames: 193, seconds: 8, fps: 24, aspect: '16:9', size: 'hd', tier: '720p' } } },
    out: clip('ltx-mockup-film', 1280, 720, 3.96), before: { ...clip('ltx-mockup-film-plan', 1280, 720, 3.96), sound: false, label: 'Mockup · Open city' },
    runOn: 'comfy-cloud', route: 'comfy-cloud:cloud-ltx25-layout', costUsd: 0.28, jobId: '1a1a33c6',
    from: [{ jobId: 'a1a50672', model: 'Mockup', place: 'in your browser', costUsd: 0 }, { jobId: '645de70d', model: 'GPT Image 2.5 Flare', place: 'Comfy Cloud', costUsd: 0.0238 }], recreateHref: directHref('open-city', MOCKUP_FILM_PROMPT) },
  /* Explore "Script → Screen": the K-drama scene (job fb0b44ca, H3_KDRAMA_PROMPT above). Ships re-encoded to 2.1 MB (H.264 High 1280×714, AAC, faststart), JPG posters. */
  { key: 'h3-kdrama-script', tab: 'video', title: 'Sorry, not sorry: a K-drama scene from a script', toolId: 'h3-video', provider: 'comfy-h3', modelKey: 'minimax-h3', model: 'MiniMax H3', flow: 'Create Video',
    prompt: H3_KDRAMA_PROMPT, input: { types: ['t2v'], mode: 't2v', outKind: 'av-video', duration: 15, resolution: '768p', aspect: '16:9', audio: true, quality: 'quality', bitrate: 'high', seed: 856385, n: 1 },
    out: { ...clip('h3-kdrama-script', 1280, 714, 15.08), poster: S('h3-kdrama-script-480.jpg') }, runOn: 'comfy-cloud', route: 'comfy-cloud:cloud-h3-wf', costUsd: 1.2, jobId: 'fb0b44ca' },
  /* Explore 3D's hero (MOSSBUN_FILM_PROMPT above): ships re-encoded to H.264 High 1920×1080 (CRF 28, AAC 128k, faststart, 2.3 MB); the poster is the lantern
     close-up near the end. `before` (and the still Recreate attaches) is the painted city frame the run started from, 1536×864. */
  { key: 'mossbun-golden-hour', tab: 'video', title: 'Mossbun at golden hour', toolId: 'h3-video', provider: 'router-ltx-25-pro', modelKey: 'ltx-2.5-pro', model: 'LTX-2.5 Pro', flow: 'Create Video',
    prompt: MOSSBUN_FILM_PROMPT, input: { types: ['i2v'], mode: 'i2v', outKind: 'av-video', duration: 6, resolution: '1080p', aspect: '16:9', audio: true, quality: 'quality', bitrate: 'standard', seed: 1200080632, n: 1,
      imageUrl: E3('mossbun-golden-hour-in.jpg'), refUrls: [E3('mossbun-golden-hour-in.jpg')] },
    out: { url: E3('mossbun-golden-hour.mp4'), poster: E3('mossbun-golden-hour-480.webp'), width: 1920, height: 1080, sec: 6.04, sound: true },
    before: { url: E3('mossbun-golden-hour-in.jpg'), poster: E3('mossbun-city-painted-480.webp'), width: 1536, height: 864, label: 'Painted city frame' },
    runOn: 'comfy-cloud', route: 'comfy-cloud:cloud-ltx25-pro-api', costUsd: 1.46, costEstimated: true, jobId: 'a11a0c78', from: [MOSSBUN_SHEET_RUN, MOSSBUN_3D_RUN, ...MOSSBUN_CITY_RUNS] },
  /* Explore "Made with Seedance 2.0" (prompts above): both ship as they came back (H.264 + AAC, faststart, metadata stripped); the fashion clip cropped
     to lose a made-up "JP" mark the still's prompt asked for (kept at 720×1280). `before` is the still (WebP), the
     still Recreate attaches is its JPG. */
  { key: 'seedance-lighthouse', tab: 'video', title: 'A lighthouse at dusk, four shots from nine words', toolId: 'h3-video', provider: 'router-seedance', modelKey: 'seedance-2.0', model: 'Seedance 2.0', flow: 'Create Video',
    prompt: SEEDANCE_LIGHTHOUSE_PROMPT, input: { types: ['t2v'], mode: 't2v', outKind: 'av-video', duration: 15, resolution: '720p', aspect: 'auto', audio: true, quality: 'quality', bitrate: 'standard', seed: 222982, n: 1 },
    out: { url: SD('lighthouse.mp4'), poster: SD('lighthouse.webp'), width: 1280, height: 720, sec: 15.04, sound: true },
    runOn: 'comfy-cloud', route: 'comfy-router:router-seedance', costUsd: 3.2522, jobId: '5b612365' },
  { key: 'seedance-fashion', starter: false, tab: 'video', title: 'Silver in the storm, a still set moving', toolId: 'h3-video', provider: 'router-seedance', modelKey: 'seedance-2.0', model: 'Seedance 2.0', flow: 'Create Video',
    prompt: SEEDANCE_FASHION_PROMPT, input: { types: ['i2v'], mode: 'i2v', outKind: 'av-video', duration: 5, resolution: '720p', aspect: 'auto', audio: true, quality: 'quality', bitrate: 'standard', seed: 963900, n: 1,
      imageUrl: SD('fashion-still.jpg'), refUrls: [SD('fashion-still.jpg')] },
    out: { url: SD('fashion.mp4'), poster: SD('fashion.webp'), width: 720, height: 1280, sec: 5.04, sound: true },
    before: { url: SD('fashion-still.webp'), poster: SD('fashion-still.webp'), width: 576, height: 1024, label: 'Still' },
    runOn: 'comfy-cloud', route: 'comfy-router:router-seedance', costUsd: 1.0901, jobId: '4bb53e5b', from: [SEEDANCE_STILL_RUN] },
];

/* ---- The starter pack's new picks (user, 2026-10-28) ----
   The maintainer's own runs in the live app, hand-picked from the starter-pack contact sheet. Prompts, models, places, settings and costs as the
   job records hold them (GET /api/jobs/<id>: input, modelName, route, spend.countedUsd; an estimate where no receipt was recorded). Web copies in
   web/public/examples/starter/ (WebP stills up to 1600 px with 480 px posters, H.264 + AAC clips with faststart, MP3 sounds; every file's metadata
   stripped). Recreate opens the tab and workflow that made each one, its prompt, model and settings (and its input clip or frames) in the bar. */
const ST = (f: string) => `/examples/starter/${f}`;
const stStill = (name: string, width: number, height: number): FeaturedMedia => ({ url: ST(`${name}.webp`), poster: ST(`${name}-480.webp`), width, height });
const stClip = (name: string, width: number, height: number, sec: number, sound = true): FeaturedMedia => ({ url: ST(`${name}.mp4`), poster: ST(`${name}-480.webp`), width, height, sec, sound });
/** a sound: no poster (the shared AudioCard draws its cover), no frame size */
const stSound = (name: string, sec: number): FeaturedMedia => ({ url: ST(`${name}.mp3`), poster: '', width: 0, height: 0, sec, sound: true });
/** a start frame (or portrait) Recreate attaches: the JPG the bar accepts, its 480 px poster */
const stFrame = (name: string, width: number, height: number, label: string) => ({ url: ST(`${name}.jpg`), poster: ST(`${name}-480.webp`), width, height, label });
/** The talking presenter's earlier steps: the portrait, its logo edit, the voice (jobs df027961, 160c5f7a, 952f0862). */
export const PRESENTER_RUNS: FeaturedRun[] = [{ jobId: 'df027961', model: 'GPT Image 2.5 Flare', place: 'Comfy Cloud', costUsd: 0.0127 },
  { jobId: '160c5f7a', model: 'GPT Image 2.5 Flare', place: 'Comfy Cloud', costUsd: 0.0461 }, { jobId: '952f0862', model: 'Qwen3 TTS 1.7B', place: OUR_COMPUTER, costUsd: 0 }];
const FOX_EXTEND_PROMPT = "Continue the same action at the same pace, same camera: the fox nuzzles the boy's open hand as he laughs, then it hops playfully around him in the golden meadow. continue the action naturally";
const PRESENTER_PROMPT = 'A friendly presenter talking warmly to camera, natural small head movements and blinks';
const LIFT_GHOST_PROMPT = 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\nintegrated_multimodal_description: [Shot 1] Live-action French horror film, photorealistic, the view from a phone lying face-up on the floor of a dark iron cage lift, its torch lighting the ceiling. Static wide-angle view looking straight up. The face of the gaunt pale woman with grey-white skin, wide dead eyes, long straight dark wet hair and a faded grey nightgown, upside down at the top of the frame, slowly leans closer and closer to the lens until it fills the frame';
const HOTEL_LOUNGE_PROMPT = 'Korean drama scene, 15 seconds, live-action, cinematic, soft contrast, warm skin tones, teal shadows. A hushed upscale hotel lounge in Seoul in the afternoon, tall windows with soft daylight, a white marble table with two white teacups.\n\nCharacters (keep identical throughout): on the left, an elegant woman in her late fifties with a silver-streaked low bun, cream tweed jacket and pearl necklace; on the right, a woman in her late twenties with long straight black hair tucked behind her ears, olive-green knit cardigan over a white T-shirt, small gold hoop earrings.\n\n0–4s: Medium two-shot at table height, slow push-in. The older woman slides a thin white envelope across the marble with two fingers and says in Korean, slow and cold, in a deep voice: "이거 받고 내 아들한테서 떨어져." Soft lounge ambience, the envelope scrapes on marble.\n4–7s: Close-up of the young woman, static. She looks down at the envelope, then up, and slowly smiles. She lifts a much thicker brown envelope from her lap and places it on the table with a heavy thud. A low cello drone stops into silence.\n7–11s: Over-the-shoulder shot from behind the older woman. The young woman slides the brown envelope across, leans in, and says in Korean, calm and sweet, in a clear younger voice: "이걸로 아드님 저 주세요."\n11–15s: Close-up of the older woman, slow push-in. Her teacup stops halfway to her lips, her eyes widen, she glances down at the brown envelope and back up, and says quietly in Korean: "얼마 들었니?" The teacup rattles on its saucer, a single bright plucked note and a light comic piano sting.\n\nNatural Korean voices, clear lip sync, two clearly different voices. No subtitles, no text, no watermark.';
const STORM_WHALE_PROMPT = 'Use the provided start image as the first frame. The whale, a colossal humpback whale, dark slate skin with pale barnacle scars, long white pectoral fins, a pale ridged throat, a scarred left eye, slowly glides past the rooftop';
const MOSSBUN_MOCKUP_PROMPT = 'A real sunny coastal city, palm-lined avenue and glass towers, cars passing, Mossbun, a small round forest creature with soft moss-green fur, a cream belly, long floppy leaf-tipped ears, big amber eyes and a fluffy tail ending in a glowing orange lantern bulb, natural light, no text or logos.';
const I2V = (seed: number, duration: number, resolution: string, imageUrl: string) => ({ types: ['i2v'], mode: 'i2v', outKind: 'av-video', duration, resolution, aspect: '16:9', audio: true, quality: 'quality', bitrate: 'standard', seed, n: 1, imageUrl, refUrls: [imageUrl] });
/** Video and Direct a Shot (3D) picks. */
export const FEATURED_STARTER_VIDEO: FeaturedItem[] = [
  /* Extend (job 3d6090c8, H3 Extend on Comfy Router, est. 138 credits = $0.65): +5 s from the exact last frame of a 5 s boy-and-fox clip, one 10.17 s take.
     `before` (and the clip Recreate loads into Extend) is that first 5 s. */
  { key: 'h3-fox-extend', tab: 'video', title: 'The fox comes closer, five seconds more', toolId: 'h3-extend', provider: 'comfy-h3-extend', modelKey: 'minimax-h3-extend', model: 'H3 Extend', flow: 'Extend',
    prompt: FOX_EXTEND_PROMPT, input: { mode: 'extend', types: ['extend'], outKind: 'av-video', extendSeconds: 5, direction: 'forward', resolution: '768p', seed: 278642976, keepAudio: true, audio: true, audioOff: 'strip',
      bitrate: 'standard', fit: 'pad', preset: '', target: '', mentions: [], duration: 5, sourceSeconds: 5.041667, width: 1024, height: 576, hasAudio: true, fps: 24, videoFormat: 'mp4',
      videoUrl: ST('fox-extend-in.mp4'), refUrls: [], refBatches: [[]] },
    out: stClip('fox-extend', 1024, 576, 10.17), before: { ...stClip('fox-extend-in', 1024, 576, 5.04), label: 'First 5 s' },
    runOn: 'comfy-cloud', route: 'comfy-router:comfy-h3-extend', costUsd: 0.65, jobId: '3d6090c8' },
  /* Lip Sync (job 3f3fa8b8, InfiniteTalk (Wan 2.1) on Comfy Cloud, est. 79 credits = $0.37): our AI presenter (in the app's own hoodie) speaks a 10.6 s
     line. Recreate opens Video › Lip Sync with the portrait and the speech attached. */
  { key: 'presenter-talk', tab: 'video', title: 'A presenter, talking to camera', toolId: 'voice', provider: 'cloud-infinitetalk', modelKey: 'infinitetalk-wan-2.1', model: 'InfiniteTalk (Wan 2.1)', flow: 'Lip Sync',
    prompt: PRESENTER_PROMPT, input: { types: ['lipsync'], mode: 'lipsync', outKind: 'av-video', aspect: '1:1', resolution: '480p', duration: 10.6, width: 640, height: 640, fps: 25, n: 1,
      imageUrl: ST('presenter-talk-in.jpg'), refUrls: [ST('presenter-talk-in.jpg')], speechUrl: ST('presenter-talk-speech.mp3') },
    out: stClip('presenter-talk', 640, 640, 10.6), before: stFrame('presenter-talk-in', 1024, 1024, 'Portrait'),
    runOn: 'comfy-cloud', route: 'comfy-cloud:cloud-infinitetalk', costUsd: 0.37, jobId: '3f3fa8b8', from: PRESENTER_RUNS, recreateHref: `${videoWorkflowHref('lip-sync')}&recreate=af93a883` },
  /* Video Upscale (job 000435b6, Topaz Starlight Fast on Comfy Cloud, est. 157 credits = $0.74): a 480p MiniMax H3 take (job 11fb5eb1, Comfy Cloud,
     est. $1.20) to 1918×1066, sound kept. Ships at 1920×1068; `before` is the 480p original (the clip Recreate loads). */
  { key: 'bus-stop-sharp', tab: 'video', title: 'A snowy bus stop, made sharper', toolId: 'upscale', provider: 'cloud-topaz-starlight-fast', modelKey: 'topaz-starlight-fast', model: 'Topaz Starlight Fast', flow: 'Video Upscale',
    prompt: '', input: { mode: 'upscale', types: ['precise'], typePrompt: 'faithful upscale', resolution: '1080p', maxOutput: '1080p', scale: 2, scene: 'auto', seed: 270862, keepAudio: true, fit: 'pad', mentions: [],
      duration: 15.083333, width: 864, height: 480, hasAudio: true, fps: 24, videoFormat: 'mp4', videoUrl: ST('bus-stop-in.mp4'), refUrls: [], refBatches: [[]] },
    out: stClip('bus-stop-sharp', 1920, 1068, 15.08), before: { ...stClip('bus-stop-in', 864, 480, 15.08), label: 'Original · 480p' },
    runOn: 'comfy-cloud', route: 'comfy-cloud:cloud-topaz-starlight-fast', costUsd: 0.74, jobId: '000435b6', rendered: { width: 1918, height: 1066 },
    from: [{ jobId: '11fb5eb1', model: 'MiniMax H3', place: 'Comfy Cloud', costUsd: 1.2, est: true }] },
  /* Shots from three films, shipped as plain generations (not in Explore's Films row): MiniMax H3 image to video (job 66efae75, est. $0.48), MiniMax H3
     text to video (job 415c2ab2, est. $1.20) and LTX-2.5 22B image to video on Comfy Cloud (job 9a79ed7a, est. $0.14). `before` is the start frame Recreate attaches. */
  { key: 'h3-lift-ghost', tab: 'video', title: 'Something in the lift', toolId: 'h3-video', provider: 'comfy-h3', modelKey: 'minimax-h3', model: 'MiniMax H3', flow: 'Create Video',
    prompt: LIFT_GHOST_PROMPT, input: I2V(1444537043, 6, '768p', ST('lift-ghost-in.jpg')),
    out: stClip('lift-ghost', 1280, 714, 6.58), before: stFrame('lift-ghost-in', 1536, 864, 'Start frame'),
    runOn: 'comfy-cloud', route: 'comfy-cloud:cloud-h3-wf', costUsd: 0.48, jobId: '66efae75', rendered: { width: 1376, height: 768 } },
  { key: 'h3-hotel-lounge', tab: 'video', title: 'The counter-offer, a K-drama scene', toolId: 'h3-video', provider: 'comfy-h3', modelKey: 'minimax-h3', model: 'MiniMax H3', flow: 'Create Video',
    prompt: HOTEL_LOUNGE_PROMPT, input: { types: ['t2v'], mode: 't2v', outKind: 'av-video', duration: 15, resolution: '480p', aspect: '16:9', audio: true, quality: 'quality', bitrate: 'high', seed: 744799, n: 1 },
    out: stClip('hotel-lounge', 864, 480, 15.08), runOn: 'comfy-cloud', route: 'comfy-cloud:cloud-h3-wf', costUsd: 1.2, jobId: '415c2ab2' },
  { key: 'ltx-storm-whale', tab: 'video', title: 'Eye to eye with the whale', toolId: 'h3-video', provider: 'comfy-ltx25-video', modelKey: 'ltx-2.5-22b', model: 'LTX-2.5 22B', flow: 'Create Video',
    prompt: STORM_WHALE_PROMPT, input: { ...I2V(776205211, 5, '720p', ST('storm-whale-in.jpg')), steps: 11, frames: 121, fps: 24 },
    out: stClip('storm-whale', 1280, 704, 5.04), before: stFrame('storm-whale-in', 1536, 864, 'Start frame'),
    runOn: 'comfy-cloud', route: 'comfy-cloud:cloud-ltx25-video', costUsd: 0.14, jobId: '9a79ed7a' },
  /* Direct a Shot (job 27fbd25c, LTX-2.5 22B distilled + Layout to Render on Comfy Cloud, est. 60 credits = $0.28): Mossbun in the open city, from the
     browser mockup (job 13aca5cc, free) and its first frame painted free on our computer (job ea410812). `before` is the mockup. */
  { key: 'mossbun-mockup-film', tab: '3d', alsoOn: ['video'], title: 'Mossbun on the avenue, Mockup to Film', toolId: 'make-it-real', provider: 'comfy-ltx25-layout', modelKey: 'ltx-2.5-22b', model: LTX_LAYOUT, flow: 'Direct a Shot',
    prompt: MOSSBUN_MOCKUP_PROMPT, input: { types: ['make-it-real'], mode: 'make-it-real', outKind: 'video', prompt: MOSSBUN_MOCKUP_PROMPT, duration: 8, resolution: '720p', aspect: '16:9', width: 1280, height: 720, fps: 24, seed: 42, outputLabel: 'Render', place: 'cloud',
      makeReal: { planUrl: ST('mossbun-mockup-plan.mp4'), planLabel: 'Simple view', presetName: 'Open city', prompt: MOSSBUN_MOCKUP_PROMPT, firstFrame: true, place: 'cloud',
        plan: { width: 1280, height: 704, frames: 193, seconds: 8, fps: 24, aspect: '16:9', size: 'hd', tier: '720p' } } },
    out: stClip('mossbun-mockup-film', 1280, 720, 8.04), before: { ...stClip('mossbun-mockup-plan', 1280, 720, 8, false), label: 'Mockup · Open city' },
    runOn: 'comfy-cloud', route: 'comfy-cloud:cloud-ltx25-layout', costUsd: 0.28, jobId: '27fbd25c', from: MOSSBUN_CITY_RUNS.slice(0, 2), recreateHref: directHref('open-city', MOSSBUN_MOCKUP_PROMPT) },
];
/** Image picks: Create Image runs, free on our computer or on Comfy Router (billed). */
const stImage = (key: string, title: string, jobId: string, provider: string, modelKey: string, model: string, prompt: string, settings: Record<string, unknown>, out: FeaturedMedia,
  run: { costUsd: number; route: string } | { runMs: number }): FeaturedItem => ({
  key, tab: 'image', title, toolId: 'create-image', provider, modelKey, model, flow: 'Create Image', prompt, input: { types: ['generate'], mode: 'generate', outKind: 'image', quality: 'med', imageResolution: '1K', n: 1, ...settings }, out, jobId,
  ...('runMs' in run ? { runOn: 'local' as const, route: `local:${provider}`, runMs: run.runMs } : { runOn: 'comfy-cloud' as const, route: run.route, costUsd: run.costUsd }) });
const FLARE = ['api-gpt-image-25-flare', 'gpt-image-2.5-flare', 'GPT Image 2.5 Flare'] as const; const FLARE_ROUTE = 'comfy-router:api-gpt-image-25-flare';
export const FEATURED_STARTER_IMAGE: FeaturedItem[] = [
  stImage('img-jellyfish-bamboo', 'Jellyfish lanterns in the bamboo', '2caba396', ...FLARE, 'Giant glowing jellyfish drift between tall bamboo at blue hour, their tentacles trailing soft amber light, a child in a yellow raincoat on a stone path below holding up a paper lantern, light mist, magical realism photograph.',
    { aspect: '4:3', tier: 'med', imageResolution: '4K', seed: 585628 }, stStill('jellyfish-bamboo', 1600, 1200), { costUsd: 0.0467, route: FLARE_ROUTE }),
  stImage('img-knit-farm', 'Tiny farmers on knitted hills', 'cbd50d18', 'comfy-klein4b', 'flux-2-klein-4b', 'FLUX.2 [klein] 4B', 'Tiny farmers working on a giant green knitted fabric as if it were terraced fields',
    { aspect: '1:1', seed: 647674778 }, stStill('knit-farm', 1024, 1024), { runMs: 71279 }),
  stImage('img-glass-whale', 'A glass whale over the dunes', WHALE_STILL_RUN.jobId, ...FLARE, 'A massive translucent glass whale floats above red desert dunes at golden hour, sunlight refracting through its body into rainbow caustics on the sand, a lone camel rider below for scale, clear sky, cinematic photograph.',
    { aspect: '4:3', tier: 'med', seed: 585628 }, stStill('glass-whale', 1344, 1008), { costUsd: WHALE_STILL_RUN.costUsd, route: FLARE_ROUTE }),
  stImage('img-aurora-dome', 'A glowing dome under the aurora', 'f3f84853', 'comfy-zimage-turbo', 'z-image-turbo', 'Z-Image-Turbo', 'Cinematic night scene: futuristic greenhouse dome glowing warm amber in a snowy mountain valley under aurora borealis, tiny silhouette at entrance, deep blues and teals with warm accent, ultra-detailed, wide establishing shot, dark sky for text',
    { aspect: '1:1', seed: 424261259 }, stStill('aurora-dome', 1024, 1024), { runMs: 171125 }),
  stImage('img-whale-sheet', 'Humpback whale, creature sheet', 'b8b83ca4', ...FLARE, 'Creature reference sheet for a live-action film: a colossal humpback whale, dark slate skin with pale barnacle scars, long white pectoral fins, a pale ridged throat, a scarred left eye. Five views on one sheet: full side profile, from below showing the ridged throat and long fins, from the front, the tail fluke raised, and a close-up of the scarred left eye. Photorealistic, natural ocean creature, wet skin, plain dark slate-grey backdrop, soft even studio light. No text, no labels, no logos, no watermark.',
    { aspect: '16:9', quality: 'high', tier: 'high', seed: 891166853 }, stStill('whale-sheet', 1536, 864), { costUsd: 0.0472, route: FLARE_ROUTE }),
  stImage('img-red-bicycle', 'A red bicycle in the sun', '032fa369', 'comfy-qwen21', 'qwen-image-2.1', 'Qwen Image 2.1', 'A red vintage bicycle leaning against a sunlit Mediterranean wall with bougainvillea, photograph',
    { aspect: '1:1', seed: 1946203726 }, stStill('red-bicycle', 1024, 1024), { runMs: 632201 }),
];
/** Audio picks (the first sounds the app ships): Music and Sound effects runs. Recreate opens Audio on the same workflow with the prompt, lyrics and model. */
const STARTER_AUDIO_SEED: Record<string, string> = { 'audio-last-train': '636e4c29', 'audio-music-box': 'd81659f2', 'audio-choir-score': '57328be7', 'audio-sea-lullaby': '39f77d24', 'audio-lofi-piano': 'ac108940', 'audio-rain-roof': '4247493a' };
const stAudio = (key: string, title: string, jobId: string, name: string, sec: number, prompt: string, settings: Record<string, unknown>, engine: { provider: string; modelKey: string; model: string },
  run: { costUsd: number; route: string } | { runMs: number }, kind: 'music' | 'sfx' = 'music'): FeaturedItem => ({
  key, tab: 'audio', title, toolId: 'audio', ...engine, flow: kind === 'music' ? 'Music' : 'Sound effects', prompt,
  input: { types: [kind], mode: kind, audioKind: kind, outKind: 'audio', resolution: 'standard', n: 1, ...settings }, out: stSound(name, sec), jobId,
  ...('runMs' in run ? { runOn: 'local' as const, route: `local:${engine.provider}`, runMs: run.runMs } : { runOn: 'comfy-cloud' as const, route: run.route, costUsd: run.costUsd }),
  recreateHref: `${audioRoute(kind)}&recreate=${STARTER_AUDIO_SEED[key]}` });
const YUE2 = { provider: 'comfy-yue2', modelKey: 'yue2', model: 'YuE2' };
export const FEATURED_AUDIO: FeaturedItem[] = [
  stAudio('audio-last-train', 'Hold the light, an indie folk song', 'd967cfc3', 'last-train', 10, 'indie folk, hushed tenor, nylon guitar, soft percussion, slow build',
    { duration: 10, seed: 26359, lyrics: '[Verse]\nRain on the platform, the last train is late\n[Chorus]\nHold the light, hold the light, we will not wait' }, YUE2, { runMs: 923829 }),
  stAudio('audio-music-box', 'Music box, a gentle film cue', 'd6d6bc65', 'music-box', 30, 'English, magical music box, celesta, soft felt piano, warm strings, whimsical, wonder, gentle, dreamy, childlike, film score, soft female humming',
    { duration: 30, seed: 365392185, lyrics: '[Verse]\nOoh, ooh, la la la\nOoh, ooh, la la la\nMm, mm, ooh' }, YUE2, { runMs: 1489654 }),
  stAudio('audio-choir-score', 'Strings and choir, a film score', '38d1d690', 'choir-score', 30, 'English, cinematic film score, soaring strings, soft choir, music box, celesta, wonder, grand, uplifting, warm, emotional, swelling, soft female humming',
    { duration: 30, seed: 365392185, lyrics: '[Chorus]\nAah, aah, ooh\nAah, aah, la la la\nOoh, mm' }, YUE2, { runMs: 1623829 }),
  stAudio('audio-sea-lullaby', 'A sea lullaby, sung low', 'ab300a92', 'sea-lullaby', 30, 'English, haunting lullaby, eerie soft female vocal, siren, music box, slow, minor key, dark ambient, reverb',
    { duration: 30, seed: 1031818954, lyrics: '[Verse]\nHush now, sailor, close your eyes\nThe sea is singing lullabies\nCome down, come down, where the cold lights glow\nSleep, my darling, down below' }, YUE2, { runMs: 1554774 }),
  stAudio('audio-lofi-piano', 'Lo-fi piano and vinyl crackle', 'd1e990b4', 'lofi-piano', 10, 'Upbeat lo-fi hip hop with warm piano chords and soft vinyl crackle',
    { duration: 10, seed: 1327800580, lyrics: '[Instrumental]' }, { provider: 'comfy-minimax-music3', modelKey: 'minimax-music-3', model: 'MiniMax Music 3' }, { costUsd: 0.08, route: 'comfy-cloud:cloud-minimax-music' }),
  stAudio('audio-rain-roof', 'Rain on a tin roof', 'b5626464', 'rain-roof', 21.55, 'Heavy rain on a tin roof with distant rolling thunder',
    { duration: 10, outputDuration: 21.55, seed: 1121486658 }, { provider: 'api-seed-audio', modelKey: 'seed-audio', model: 'Seed Audio 1.0 Multilingual' }, { costUsd: 0.43, route: 'comfy-router:api-seed-audio' }, 'sfx'),
];

/* Explore chapter 2 (2026-10-27): the maintainer's own Image to layers run on Comfy Router (job 829b6ef1), ByteDance Seedream 5.0 Flash layer
   separation, a pet-food poster split into 13 transparent layers. No prompt (auto layers), 1K; billed $0.3346 (quoted $0.03: the Router bills per
   layer). Input and settings as they ran; the layers ship as full-canvas 1024 px WebPs (alpha kept), each with its content box. */
const PAW_LAYERS: [string, [number, number, number, number]][] = [['Background', [0, 0, 1024, 1024]], ['Box bottom panel', [0, 470, 1024, 1024]],
  ['Subtitle description text', [260, 769, 742, 824]], ['Left bowl icon', [54, 863, 133, 927]], ['Left delivery description text', [156, 872, 312, 920]],
  ['Right PAW&CO brand logo', [730, 857, 970, 915]], ['Right store website text', [679, 927, 969, 935]], ['Bottom small slogan text', [331, 976, 680, 984]],
  ['Main title text', [188, 577, 653, 743]], ['Box left panel', [0, 0, 288, 853]], ['Box right panel', [769, 0, 1024, 853]],
  ['Left golden retriever', [107, 6, 517, 477]], ['Right brown and white dog', [507, 85, 921, 543]]];
export const FEATURED_LAYERS: FeaturedItem[] = [
  { key: 'image-layers-paw', tab: 'image', title: 'A poster, split into 13 layers', toolId: 'app-image-layers', provider: 'api-seedream-layers-flash', modelKey: 'seedream-5.0-flash-layers',
    model: 'ByteDance Seedream 5.0 Flash · layers (hosted)', flow: 'Image to layers', prompt: '',
    input: { types: ['edit'], mode: 'edit', outKind: 'image', appId: 'image-layers', baseTool: 'create-image', layers: true, transparent: true, outputLabel: 'Layers',
      imageResolution: '1K', appFields: { imageResolution: '1K' }, appPrompt: '', aspect: '1:1', aspectAuto: true, quality: 'med', seed: 522605, n: 1,
      sourceSize: { width: 1024, height: 1024 }, imageUrl: S('image-layers-paw-in.jpg'), refUrls: [S('image-layers-paw-in.jpg')] },
    out: { url: S('image-layers-paw-l0.webp'), poster: S('image-layers-paw-in-480.webp'), width: 1024, height: 1024 },
    before: { url: S('image-layers-paw-in.jpg'), poster: S('image-layers-paw-in-480.webp'), width: 1024, height: 1024, label: 'Input' },
    layers: PAW_LAYERS.map(([label, box], k) => ({ url: S(`image-layers-paw-l${k}.webp`), label, box })),
    runOn: 'comfy-cloud', route: 'comfy-router:api-seedream-layers-flash', costUsd: 0.3346, jobId: '829b6ef1', recreateHref: '/tools/create-image?workflow=image-layers&recreate=3e481a29' },
];

/* Explore "One character. Every angle." (2026-10-27): four of the maintainer's own character sheets, GPT Image 2.5 Flare text to image on Comfy
   Router, 1K, seed 397533, each one image from one run; prompts as they ran, costs as billed. Recreate opens Create Image with the prompt and model. */
const SHEET_SEED: Record<string, string> = { 'sheet-kaito': 'b5b82fcc', 'sheet-mossbun': '7793115c', 'sheet-mechanic': '224bbf14', 'sheet-kip': '8d939956' };
const sheet = (id: string, title: string, /** the run (job id) */ jobId: string, aspect: string, width: number, height: number, costUsd: number, prompt: string): FeaturedItem => ({
  key: `sheet-${id}`, tab: 'image', title, toolId: 'create-image', provider: 'api-gpt-image-25-flare', modelKey: 'gpt-image-2.5-flare', model: 'GPT Image 2.5 Flare', flow: 'Create Image', prompt,
  input: { types: ['generate'], mode: 'generate', outKind: 'image', aspect, quality: 'med', tier: 'med', imageResolution: '1K', seed: 397533, n: 1 },
  out: { url: S(`char-${id}.webp`), poster: S(`char-${id}-480.webp`), width, height }, runOn: 'comfy-cloud', route: 'comfy-router:api-gpt-image-25-flare', costUsd, jobId,
  recreateHref: `/tools/create-image?recreate=${SHEET_SEED[`sheet-${id}`]}` });
export const KAITO_SHEET_PROMPT = 'Professional anime character design sheet of an original 19-year-old storm courier named KAITO VEY, on a deep charcoal near-black background with thin light-grey hairline panel dividers and rounded corners. Spiky black hair with one vivid orange streak, bright amber eyes, determined half-smile, silver-and-black segmented armour over a dark flight suit, a long tattered orange scarf, armoured gloves, sleek boots, a short glowing baton on the hip. Top row: four full-body views (front, three-quarter, side, back) at identical scale. Bottom row: four head close-ups (calm, grin, shouting, focused) and a small colour palette strip. Crisp cel shading, clean line art, small white uppercase labels in a geometric sans-serif. No other text, no watermark.';
export const MOSSBUN_SHEET_PROMPT = 'Premium 3D animated-feature creature model sheet on a deep charcoal background with soft studio light and thin hairline panel dividers. An original small forest creature named MOSSBUN: rounded pear-shaped body the size of a rabbit, soft moss-green fur with a cream belly, long floppy ears with leaf-shaped tips, big warm amber eyes, a tiny pink nose, stubby legs, and exactly one long fluffy tail ending in a softly glowing orange lantern bulb that lights its fur. Top row: front, three-quarter, side and back views at identical scale. Bottom row: five expression heads (happy, sleepy, surprised, shy, giggling) and a small colour palette. Small white uppercase title "MOSSBUN". No other text, no watermark.';
export const MECHANIC_SHEET_PROMPT = 'Ultra-realistic character turnaround sheet of a fictional harbour mechanic in her early fifties, laid out as a production model sheet on a deep charcoal studio background with soft rim light. Five panels in a row separated by thin light-grey hairlines: face close-up, full-body front, left profile, back, right profile, same scale, feet in frame, a thin height scale beside each full-body view. Short grey-streaked dark hair, weathered tanned skin with fine lines, calm green eyes, faded navy work jacket over a cream henley, oil-stained canvas apron, dark work trousers, scuffed brown boots, one bright orange safety tag clipped to the apron. Natural skin texture, cinematic lighting, small white uppercase labels. No other text, no watermark.';
export const KIP_SHEET_PROMPT = 'Collectible designer vinyl toy turnaround sheet of an original lanky teenage skater named KIP RALLY, on a deep charcoal gradient backdrop with soft studio reflections. Stylised proportions with an oversized head and extra-long limbs, sleepy confident eyes, messy fluffy teal hair, an oversized bright orange hoodie with embroidered doodle patches, baggy faded cargo jeans with a hanging chain, chunky skate sneakers, retro headphones around the neck, a small skateboard beside him. Top row: front, three-quarter, side and back views at identical scale. Bottom row: three expression heads and a packaging-style colour swatch strip. Soft-touch matte vinyl, small white uppercase labels. No other text, no watermark.';
export const FEATURED_SHEETS: FeaturedItem[] = [
  sheet('kaito', 'Kaito Vey, anime character sheet', '492ddf3d', '3:2', 1536, 1024, 0.0159, KAITO_SHEET_PROMPT),
  sheet('mossbun', 'Mossbun, creature model sheet', MOSSBUN_SHEET_RUN.jobId, '21:9', 1456, 624, MOSSBUN_SHEET_RUN.costUsd, MOSSBUN_SHEET_PROMPT),
  sheet('mechanic', 'Harbour mechanic, photoreal turnaround', 'd5c4b1a5', '3:2', 1536, 1024, 0.0159, MECHANIC_SHEET_PROMPT),
  sheet('kip', 'Kip Rally, vinyl toy turnaround', 'a4084c61', '4:3', 1344, 1008, 0.0166, KIP_SHEET_PROMPT),
];

/** Image: the Workflows showcase (our own local runs), strongest first. Recreate opens it the way the Workflows page does (shared/exampleLink.ts).
 *  SHOWCASE_GALLERY is the starter pack's share (user's picks, 2026-10-28); EXPLORE_ONLY_SHOWCASE are the ones that left the starter pack but that
 *  Explore (the Images rail and covers, Made here) or Workflows still show: they stay here as Explore-only entries (starter: false). */
const IMAGE_TOOL_OF: Record<string, string> = { 'create-image': 'create-image', 'character-sheet': 'app-character-sheet', upscale: 'image-upscale', relight: 'app-relight' };
const FLOW_OF: Record<string, string> = { 'create-image': 'Create Image', 'character-sheet': 'Character Sheet', upscale: 'Upscale', relight: 'Relight' };
const fromShowcase = (s: ShowcaseItem): FeaturedItem => ({
  key: `sc-${s.id}`, tab: 'image', title: s.name, toolId: IMAGE_TOOL_OF[s.workflow] ?? s.toolId, provider: s.provider, modelKey: s.provider, model: s.model, flow: FLOW_OF[s.workflow] ?? s.workflow,
  prompt: s.subject ?? s.prompt, input: { outKind: 'image', prompt: s.prompt, ...s.settings, workflow: s.workflow, showcase: s.id, ...(s.before ? { imageUrl: s.before.image } : {}) },
  out: { url: s.image, poster: s.thumb, width: s.width, height: s.height }, ...(s.before ? { before: { url: s.before.image, poster: s.before.thumb, width: s.width, height: s.height, label: s.before.label } } : {}),
  runOn: 'local', runMs: s.runMs, jobId: s.id, recreateHref: `/tools/create-image?${s.workflow !== 'create-image' ? `workflow=${encodeURIComponent(s.workflow)}&` : ''}showcase=${encodeURIComponent(s.id)}`,
});
export const EXPLORE_ONLY_SHOWCASE = ['0f1a0117', 'fad0bbe6', 'd3c80885', '016bdc27', '973c88f8', '31465e96', 'b718e875', 'f7699cd4', '7205edb3', 'fa96f109'];
export const FEATURED_IMAGE: FeaturedItem[] = [...SHOWCASE_GALLERY.map((id) => showcaseById(id)).filter((s): s is ShowcaseItem => !!s).map(fromShowcase),
  ...EXPLORE_ONLY_SHOWCASE.map((id) => showcaseById(id)).filter((s): s is ShowcaseItem => !!s).map((s): FeaturedItem => ({ ...fromShowcase(s), starter: false }))];

/** The seeded job id of each video featured generation (sha1 of the key, featuredSeed.ts featuredIdOf; the test checks they match), so a
 *  link can open one as Recreate without a lookup. */
export const FEATURED_SEED_IDS: Record<string, string> = { 'trend-mic': 'b7057f01', 'trend-dance': '211cf37e', 'ltx-christmas-take': '1c9e4758', 'ltx-street-take': 'f875f804', 'ltx-rain-city': 'de09f0cb', 'ltx-lighthouse': 'c1b41771', 'ltx-village-loop': 'e29ad72e', 'ltx-morph': 'a3c693af',
  'ltx-fox-meadow': '7964e9db', 'ltx-fox-meadow-close': '4781fc98', 'kling-dance-swap': '487a04e5', 'ltx-pro-painter': '8e4d7d98', 'h3-char-swap': 'bb7e11f4',
  'ltx-pro-fox': 'a6a363f1', 'ltx-pro-koi': 'c17b210d', 'image-layers-paw': '3e481a29', 'h3-koi-take': '2fb5ac80',
  'h3-glass-whale': '654bac59', 'ltx-pro-whale-glide': 'bc0005d7', 'ltx-pro-whale-dive': '39346ee1', 'ltx-mockup-film': '8ec31949', 'h3-kdrama-script': 'a82dd012', 'mossbun-golden-hour': '50c0d92b', 'seedance-lighthouse': '98183e01', 'seedance-fashion': 'eb7a9a47', ...SHEET_SEED,
  /* the starter pack's new picks (2026-10-28) */
  'h3-fox-extend': '0f0707ea', 'presenter-talk': 'af93a883', 'bus-stop-sharp': 'd47db426', 'h3-lift-ghost': '68f5f8fe', 'h3-hotel-lounge': '15146f2b', 'ltx-storm-whale': 'f201223c', 'mossbun-mockup-film': 'c1c2746d',
  'img-knit-farm': '60f274ad', 'img-jellyfish-bamboo': '07f63be4', 'img-glass-whale': '98073a1f', 'img-aurora-dome': '01a4a23c', 'img-whale-sheet': 'edb15a7c', 'img-red-bicycle': '0bf11f65', ...STARTER_AUDIO_SEED };
/** Where a featured generation opens as Recreate (the bar filled, its input frames attached, nothing runs): its own recreateHref, else its tool's
 *  page with ?recreate=<seed id> (Transitions, and a tool that is a Video workflow such as Motion Control, open on the Video page with the
 *  workflow picked). `extra` adds query params (Loop: loop=1). */
export function featuredRecreateHref(key: string, extra: Record<string, string> = {}): string | null {
  const f = featuredByKey(key); if (!f) return null; if (f.recreateHref) return f.recreateHref; const id = FEATURED_SEED_IDS[key]; if (!id) return null;
  const wf = f.toolId === 'two-person-swap' ? 'two-person-swap' /* history-only warning, never a lossy one-person prefill */ : f.toolId === 'app-transition' ? 'transitions' : f.toolId !== 'h3-video' ? videoWorkflowOfTool(f.toolId)?.id : undefined;
  const u = new URLSearchParams({ ...(wf ? { workflow: wf } : {}), recreate: id, ...extra });
  return `${wf ? VIDEO_PAGE : toolPage(f.toolId)}?${u}`;
}
/** Full-frame posters (WebP) for the clips Explore shows full width. */
export const FEATURED_BIG_POSTER: Record<string, string> = { 'h3-glass-whale': S('h3-glass-whale.jpg'), 'ltx-fox-meadow': S('ltx-fox-meadow.webp'), 'ltx-fox-meadow-close': S('ltx-fox-meadow-close.webp'), 'ltx-pro-painter': S('ltx-pro-painter.webp'), 'h3-char-swap': S('h3-char-swap.webp'),
  'ltx-pro-fox': S('ltx-pro-fox.webp'), 'ltx-pro-koi': S('ltx-pro-koi.webp'), 'h3-koi-take': S('h3-koi-take.webp'),
  'ltx-pro-whale-glide': S('ltx-pro-whale-glide.webp'), 'ltx-pro-whale-dive': S('ltx-pro-whale-dive.webp'), 'ltx-mockup-film': S('ltx-mockup-film.webp'), 'h3-kdrama-script': S('h3-kdrama-script.jpg'),
  'mossbun-golden-hour': E3('mossbun-golden-hour.webp'), 'seedance-lighthouse': SD('lighthouse.webp'), 'seedance-fashion': SD('fashion.webp') };
/** Every featured generation, video first (the starter pack's new picks lead their tab). Explore-only entries (starter: false) are in it too. */
export const FEATURED: FeaturedItem[] = [...FEATURED_STARTER_VIDEO, ...FEATURED_VIDEO, ...FEATURED_AUDIO, ...FEATURED_LAYERS, ...FEATURED_SHEETS, ...FEATURED_STARTER_IMAGE, ...FEATURED_IMAGE];
/** The starter pack: what a fresh install's tabs open with (the seeded jobs marked Featured, tagged "Example", with Recreate). */
export const STARTER: FeaturedItem[] = FEATURED.filter((f) => f.starter !== false);
export const isStarter = (f: FeaturedItem) => f.starter !== false;
export const featuredByKey = (key: string): FeaturedItem | undefined => FEATURED.find((f) => f.key === key);
/** Where a route ran, in words ("comfy-router:…" → Comfy Router; no route = a local run). */
/** The examples' own place line: 'on our computer' for local runs, else the shared place label (Comfy Cloud / Comfy Router / Comfy deployment / fal…). */
export const placeOfRoute = (route?: string | null): string => !route || route.startsWith('local') ? OUR_COMPUTER : placeOf({ route })?.label ?? route.split(':')[0];
/** Every run behind a featured result as shipped, oldest first: its source runs (`from`), its own run, then the upscale when `out` is it. */
export function featuredRuns(f: FeaturedItem): FeaturedRun[] {
  const own: FeaturedRun[] = f.jobId ? [{ jobId: f.jobId, model: f.model, place: placeOfRoute(f.runOn === 'local' ? null : f.route), costUsd: f.runOn === 'local' ? 0 : f.costUsd ?? 0, ...(f.costEstimated ? { est: true } : {}) }] : [];
  const up: FeaturedRun[] = f.sharp?.inOut ? [{ jobId: f.sharp.jobId, model: f.sharp.model, place: f.sharp.place, costUsd: f.sharp.costUsd }] : [];
  return [...(f.from ?? []), ...own, ...up];
}
/** Runs of ours that ship no media of their own but a multi-step chain names (workflowCatalog.ts WF_CHAINS steps[].jobs). Costs as billed
 *  (est: the estimate, no receipt recorded). Source: the job and spend records. */
export const OTHER_RUNS: FeaturedRun[] = [
  /* the talking presenter: portrait, logo edit, voice (its lip sync, job 3f3fa8b8, now ships: featured 'presenter-talk') */
  ...PRESENTER_RUNS,
  /* Mossbun's sheet (featured 'sheet-mossbun') into a 3D model */
  MOSSBUN_3D_RUN,
];
/** A run of ours by job id: a featured result's own, source or upscale run, a shipped image example (showcase.ts: local, free), or OTHER_RUNS. */
export function runByJob(jobId: string): FeaturedRun | undefined {
  for (const f of FEATURED) { const r = featuredRuns(f).find((x) => x.jobId === jobId); if (r) return r; }
  const sc = showcaseById(jobId); if (sc) return { jobId, model: sc.model, place: OUR_COMPUTER, costUsd: 0 };
  return OTHER_RUNS.find((r) => r.jobId === jobId);
}
export const featuredOn = (f: FeaturedItem, tab: FeaturedTab) => f.tab === tab || !!f.alsoOn?.includes(tab);
/** The tabs a seeded featured job belongs to, by media (GET /api/jobs?featured=1&media=video lists every featured clip, whatever its tool). */
export const FEATURED_TABS: FeaturedTab[] = ['image', 'video', '3d', 'audio'];
/** Real clips the sample server renders from (tools/shared.ts mockResultFor): wide shots first, then the rest. */
export const SAMPLE_CLIPS = ['ltx-rain-city', 'ltx-christmas-real', 'ltx-street-real', 'ltx-lighthouse', 'ltx-village-loop', 'ltx-morph'].map((n) => `showcase/${n}.mp4`);
/** Real stills the sample server crops for an image result (any aspect): the showcase's own images. */
export const SAMPLE_STILLS = SHOWCASE_GALLERY.slice(0, 12).map((id) => showcaseById(id)?.image).filter((u): u is string => !!u).map((u) => u.replace(/^\//, ''));
export { SHOWCASE };
