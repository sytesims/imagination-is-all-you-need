/**
 * Explore v3 (2026-10-26, from the approved mockups): the data behind the page's showcase sections, so Home.tsx stays layout only and the tests
 * can check every file and link. Isomorphic: no server-only imports.
 *  - EXPLORE_HERO: the full-bleed header's one clip, looping with sound (the LTX-2.5 Pro painter, 2026-10-27). Its video file is the featured entry's
 *    `out` (shared/featured.ts, key 'ltx-pro-painter'): swap that file (or that entry) to change the hero, nothing else.
 *  - EXPLORE_STILL: "From one still": one still becomes a moving shot with sound (LTX-2.5 Pro image to video, Comfy Cloud), one take (Glide).
 *    Its clip, prompt, price and Recreate are its featured entry's (shared/featured.ts).
 *  - EXPLORE_KOI: "Make your own cartoon." (was "One lantern, one take") (Variation C, letterbox moment): a MiniMax H3 take extended by H3 Extend into one 20 s take. Its clip is
 *    the featured entry's `out` (shared/featured.ts, key 'h3-koi-take'): swap that file to change it.
 *  - EXPLORE_SEEDANCE: retained lighthouse run / finished-cut metadata; the film now lives in EXPLORE_FILMS, not a standalone section.
 *  - EXPLORE_FILMS: "IIAYN FILMS" (our film label): 엄마 · MUM, Episode 1 and the films coming next, with how each was made.
 *  - EXPLORE_TAGLINE: the hero's centre line and subline (EXPLORE_TAGLINES holds the copy options; pick one by index).
 *  - EXPLORE_SWAP: chapter 1, "Same dance. Two new casts." (two swaps of one dance, H3 Character Swap and Kling 3.0 Omni Edit, side by side in step).
 *  - EXPLORE_LAYERS: chapter 2, "One picture. Every layer." (an Image to layers run: the animation, three steps, input → its 13 layers).
 *  - EXPLORE_SHEETS: "One character. Every angle." (four GPT Image 2.5 Flare character sheets, the highlight stepping across each sheet's real
 *    panels; Mossbun also as a Tripo 3.1 model to spin).
 *  - EXPLORE_BOARD: the actual Canvas built-in demo recording (scripted, sample results, no paid runs).
 *  - EXPLORE_LOOKS: "One idea. Every look." (one prompt in twelve looks, each credited with its model: a big frame and twelve tiles).
 *  - EXPLORE_YOUR_TURN: "Now it's your turn." (the page's last section: a prompt box over a drifting wall of things made here).
 *  - EXPLORE_MOODS: the Audio dancer showcase (the words that pick SyteSim's dance style, a tempo for the demo beat).
 *  - EXPLORE_FILM: "Mockup to film" (Direct a Shot made real: the mockup, its first frame painted into a photo, the film; replaces the Worlds tiles).
 *  - EXPLORE_VFX: "VFX with LTX-2.5" (Footage Effects: Lightricks' official LTX-2.5 IC-LoRAs on your own clip, free on your computer; plus Layout to Render).
 *  - EXPLORE_WORK: "Made for your work" (2026-11-01): real results for shops and brands (Material Swap, Ad Pack, Image to layers), each with its
 *    model, where it ran, its real price and "Make your own" (the workflow opened as Recreate, the example's photos in).
 *  - EXPLORE_SCRIPT: the K-drama beat's script (shots, lines, measured times). Its Explore section left the page on 2026-10-28; the beat is now
 *    a film in IIAYN FILMS (EXPLORE_FILMS.comedy, 그래요? · IS THAT SO?) and its subtitles use these timings.
 */
import { IMAGE_PAGE, AUDIO_PAGE, THREE_D_PAGE } from './pages.js';
import { featuredByKey, featuredRecreateHref, MOSSBUN_3D_RUN, SHOP_SWAP_RUNS, SHOP_ADS } from './featured.js';
import { threeDRoute } from './threeD.js';
import { VIDEO_PAGE, videoWorkflowHref } from './videoWorkflows.js';
import { audioRoute } from './audioWorkflows.js';
import { FOOTAGE_FX_TOOL, footageEffect, footageFxModelName } from './footageFx.js';
import { LTX_LORAS } from './ltxLoras.js';
import { LAYOUT_LORA_REPO } from './makeItReal.js';
import { chipOfFeatured, chipUsd, type RunChipData } from './runChip.js';
import { LOCAL_LABEL } from './modelIds.js';

// ---------------------------------------------------------------- header clip
export interface ReelShot {
  /** featured.ts key: its clip plays, Recreate opens it */ key: string;
  /** the card's name */ name: string; /** the big title (uppercase in the page) */ title: string; line: string;
  /** model as shown (the real one) */ model: string; /** what made it, under the card name */ sub: string; facts: string[];
  /** full-frame poster (a WebP of frame 0); the featured 480 px poster is the card's */ poster: string;
  /** credits for what was added here, after the price chip (e.g. a score made in Audio) */ after?: string[];
}
const P = (f: string) => `/showcase/${f}`;
/** The header: one clip, looping, sound on. Its .mp4 comes from the featured entry (shared/featured.ts, same key): swap the file there. */
export const EXPLORE_HERO: ReelShot =
  { key: 'ltx-pro-painter', name: 'A drawing comes alive', title: 'Remember being a kid?', line: 'Every drawing you made was alive.', model: 'LTX-2.5 Pro', sub: 'Create Video',
    facts: ['10 s'], poster: P('ltx-pro-painter.webp'),
    /** the score was made here (featured.ts note on 'ltx-pro-painter'): credited after the picture's price */ after: ['Music · YuE2 · Free'] };

// ---------------------------------------------------------------- Made for your work (business value, real runs)
/** One look a workflow made: its featured key (file, model, price, Recreate), its name, and the small picture that picks it (a material swatch). */
export interface WorkVariant { key: string; label: string; url: string; thumb: string; swatch?: string }
export interface WorkItem {
  id: string; /** the audience tab it sits under */ tab: string; /** the workflow, as the app names it */ flow: string;
  title: string; line: string; /** how the price reads: "each" (one run per look) or "for 3" (one run, every look) */ per: string;
  /** before → after on a slider (same framing), or the before as a small "From this photo" picture */ compare: boolean;
  /** what it started from (shown as "before") */ before: { url: string; label: string };
  variants: WorkVariant[]; /** a clip instead of stills (Image to layers: the run's animation) */ film?: { url: string; poster: string; label: string };
  /** the model as the card names it, when the featured entry's name is longer (a hosted route's full name) */ model?: string;
  /** the price shown is the sum of these runs (one key) or one run's (every variant shares it) */ priceKey: string;
}
const shopSwap: WorkVariant[] = SHOP_SWAP_RUNS.map(([id, label]) => ({ key: `shop-swap-${id}`, label, url: P(`shop-armchair-${id}.webp`), thumb: P(`shop-armchair-${id}-480.webp`), swatch: P(`shop-material-${id}-160.webp`) }));
const shopAds: WorkVariant[] = SHOP_ADS.map(([id, label]) => ({ key: 'shop-ad-pack', label, url: P(`shop-ad-${id}.webp`), thumb: P(`shop-ad-${id}-480.webp`) }));
/** "Made for your work" (user pick 2026-11-01: lead with what people and businesses get). Real runs of a made-up brand, nothing staged: every
 *  picture is what the run returned. Shown as audience tabs (web/src/ui/explore/ExploreWork.tsx). */
export const EXPLORE_WORK = {
  eyebrow: 'Made for your work', title: ['Made for', 'your work.'],
  line: 'Real results for shops and brands, made right here. Pick one, drop in your own photo and make yours.',
  tabs: [{ id: 'shop', label: 'Shop' }, { id: 'ads', label: 'Ads' }, { id: 'design', label: 'Design' }],
  items: [
    { id: 'material-swap', tab: 'shop', flow: 'Material Swap', title: 'One chair. Every material.', line: 'Show a product in every finish before you make a single one. One photo of it, one photo of the material.',
      per: 'each', compare: true, before: { url: P('shop-armchair-in.webp'), label: 'Your photo' }, variants: shopSwap, priceKey: 'shop-swap-velvet' },
    { id: 'ad-pack', tab: 'ads', flow: 'Ad Pack', title: 'One photo. Three ready ads.', line: 'A product photo and your offer become finished ads for the feed, with your headline and offer set in and your logo in the corner.',
      per: 'for 3', compare: false, before: { url: P('shop-perfume-in-480.webp'), label: 'Product photo' }, variants: shopAds, priceKey: 'shop-ad-pack' },
    { id: 'image-layers', tab: 'design', flow: 'Image to layers', title: 'One poster. Every layer.', line: 'Drop in a finished design and get every part back on its own layer: the dogs, the title, the logo. Download it as a layered PSD for Photoshop.',
      per: '', compare: false, model: 'Seedream 5.0 Flash', before: { url: P('image-layers-paw-in-480.webp'), label: 'Your design' },
      film: { url: P('image-layers-paw.mp4'), poster: P('image-layers-paw.webp'), label: 'The poster coming apart into its 13 layers' },
      variants: [{ key: 'image-layers-paw', label: '13 layers', url: P('image-layers-paw.webp'), thumb: P('image-layers-paw-480.webp') }], priceKey: 'image-layers-paw' },
  ] as WorkItem[],
  /** the button on every card: the workflow opened as Recreate, the example's photos and words already in */ cta: 'Make your own',
};
/** Where "Make your own" opens for a look: its featured Recreate (the workflow with the example's photos in), else the workflow. */
export const workHref = (v: WorkVariant) => featuredRecreateHref(v.key) ?? IMAGE_PAGE;

// ---------------------------------------------------------------- From one still (MiniMax H3 image to video on Comfy Cloud)
export interface StillTake {
  /** featured.ts key: its clip, still, prompt, price and Recreate */ key: string;
  /** object-position in the wide frame (the still and the clip share it) */ pos: string;
  /** the clip ships trimmed to this many seconds (the run was longer: its full price is still shown) */ trimmedTo?: number;
  /** what happens in the take, in our own words (shown while the prompt is closed, never the raw prompt) */ line: string;
}
/** "From one still" (2026-10-27, the approved mockup, ideas 1 + 2 merged): a wide film frame opens on the still, an orange line sweeps across and the
 *  still becomes the moving clip with sound (drag the line to compare). One take since 2026-10-28 (user: Take 2 · Dive left this section; its
 *  featured entry 'ltx-pro-whale-dive' and files stay, the featured feed and its seeded job still use them). On 2026-10-29 the user replaced
 *  the displayed take with MiniMax H3 job d71d11f6; both earlier LTX examples stay available. */
export const EXPLORE_STILL = {
  eyebrow: 'Bring a picture to life', title: 'What if it could move?', line: 'A whale made of glass. A sea made of sand. One still becomes a moving scene, complete with sound.',
  maker: 'MiniMax', place: 'Comfy Cloud', sound: 'Sound made with the shot',
  /** the wipe's labels */ stillLabel: 'The still', clipLabel: 'Motion + sound',
  take: { key: 'h3-glass-whale', pos: '50% 50%', line: 'The glass whale glides over the rider, then dives into the dunes in a burst of sand and rainbow light.' } as StillTake,
};

// ---------------------------------------------------------------- Make your own cartoon (MiniMax H3 + H3 Extend on Comfy Cloud)
/** "Make your own cartoon." (was "One lantern, one take", the approved letterbox presentation): one 20 s take, shown wide in a letterbox whose bars carry the
 *  timecode, the models and a progress line with a notch at the join. The take, its first 10 s, the extend's price and Recreate come from the
 *  featured entry (key 'h3-koi-take'); the first 10 s' own run (job 42ceb1af: MiniMax H3 text to video, 10 s, 768p, Comfy Cloud, 80 credits) is here. */
export const EXPLORE_KOI = {
  key: 'h3-koi-take', eyebrow: 'Made with MiniMax H3', title: 'Make your own cartoon.',
  line: "A boy in the rain, a paper lantern, a wish. Write the scene the way you'd tell it, and watch it come alive, then let it keep going for as long as your story needs.",
  /** the first 10 s: its model, where it ran and what it cost */ first: { model: 'MiniMax H3', place: 'Comfy Cloud', usd: 0.8 },
  /** the extend: where it ran (its model and price are the featured entry's) */ place: 'Comfy Cloud',
  /** a frame from the new 10 s (the first 10 s' frame is the featured entry's `before` poster) */ newFrame: P('h3-koi-take-new-480.webp'),
  /** Explore only (2026-10-28): the take with an ending made here for free (ffmpeg + PIL, no generation): its last frame held 3 s while it fades
   *  (the take's own sound fading under it), a 4 s end card ("What will you bring to life?" / Imagination is all you need) and the 3 s end mark; 30.13 s, -15 LUFS, poster = the featured one.
   *  The featured entry's `out` stays the plain 20 s take (Extend page, feeds, Recreate). The readout and line count this file; the
   *  "10 s + 10 s = one 20 s take" sum and the pills stay the generated take. */
  ending: { url: P('h3-koi-take-ending.mp4'), sec: 30.13, label: 'Ending · made with Imagination · Free' },
  /** Video with MiniMax H3 picked */ cta: { label: 'Start your scene', href: `${VIDEO_PAGE}?model=minimax-h3` },
};

// ---------------------------------------------------------------- Made with Seedance 2.0 (Comfy Router)
export interface SeedanceShot { /** the chip's word */ name: string; /** where the cut lands (s, measured: ffmpeg scene detection + a look) */ t0: number }
/** "Made with Seedance 2.0" (2026-10-27, the approved cinema strip; 2026-10-29 a letterboxed cinema frame with a title card and film credits):
 *  the maintainer's own Seedance 2.0 lighthouse run on Comfy Router. Its clip, prompt, price and Recreate come from the featured entry
 *  (shared/featured.ts key 'seedance-lighthouse'). Headline and line are the user's copy (2026-10-27), set like the Explore hero: plain words,
 *  no machine or place names (model names sit in the credits). One clip has sound at a time (the page's sound director). */
export const EXPLORE_SEEDANCE = {
  strip: { key: 'seedance-lighthouse', title: 'A star to steer by.', line: 'Nine words became the picture. A poem, a lullaby and a final line made it a film.',
    shots: [{ name: 'Waves', t0: 0 }, { name: 'Cliff', t0: 2.6 }, { name: 'Light', t0: 8 }, { name: 'Wide', t0: 11.2 }] as SeedanceShot[],
    /** the finished cut shown here (user, 2026-10-27): the run's picture as it came back (2.39:1 inside a 16:9 file), then finished in the app for
     *  free: a narrator, a lullaby, captions, letterbox and end cards. The featured entry (and Recreate) stays the raw Seedance run. */
    cut: { url: '/examples/showcase-seedance/lighthouse-finished.mp4', poster: '/examples/showcase-seedance/lighthouse-premiere.jpg', sec: 21.3,
      /** the film credits (the hero's credit block): where the picture ran (its model is the featured entry's), then what was added here, free */
      picturePlace: 'Comfy Router',
      credits: [['Voice', ['Qwen3 TTS', 'Free']], ['Music', ['YuE2', 'Free']], ['Poem', ['“Sea-Fever”, John Masefield (1902)']], ['Quote', ['Albert Einstein (1929)']]] as [string, string[]][] } },
  /** Video with Seedance 2.0 picked (an empty bar) */ make: { label: 'Make your own', href: `${VIDEO_PAGE}?model=seedance-2.0` },
};

// ---------------------------------------------------------------- IIAYN FILMS (our film label)
export interface FilmsShot { key: string; /** the shot's name */ name: string; /** what happens, a few words */ what: string; /** where it starts in the film (s, measured: ffmpeg scene detection) */ t0: number;
  /** the frame it started from */ start: string; /** a frame from the clip as cut */ frame: string; model: string; /** seconds in the cut */ sec: number }
export interface FilmsNext { key: string; title: string; genre: string; line: string }
export interface FilmsStep { name: string; what: string }
const IF = (f: string) => `/examples/iiayn-films/${f}`;
/** the films' "Make a film" links: Video › Stitch (the Editor tab is hidden, 2026-11-01) */ const STITCH_HREF = videoWorkflowHref('stitch');
/** "IIAYN FILMS" (2026-10-27, options behind ?films= for the user to pick from): our own finished films, made start to end in the app.
 *  Now: 엄마 · MUM, Episode 1 (77 s with the new end card, 2026-10-28; Korean with English subtitles), 그래요? · IS THAT SO? and The Airport Run. The web copy is 1280×720 H.264 with sound; the poster is Mum's close-up; the
 *  loop is 6.5 s of it, silent (card hover). Four layouts for the user (2026-10-27, round 2): ?films=1a|1b|2a|2b. The shots' start frames and cut points are the film's own (research folder shots.json + README). */
export const EXPLORE_FILMS = {
  label: 'IIAYN FILMS', title: 'Made with Imagination.', line: 'Short films where every picture, voice and cut came out of this app. Press play, then make your own.',
  feature: {
    key: 'mum-ep1', ko: '엄마', en: 'MUM', episode: 'Episode 1', genre: 'Korean drama', sec: 78, lang: 'Korean · English subtitles',
    logline: 'A snowy bus stop at dawn. A daughter in a hurry, a mother with a lunchbox, and a note she finds on the bus.',
    url: IF('mum-ep1.mp4'), poster: IF('mum-ep1.jpg'), alt: IF('mum-ep1-bus.jpg'), loop: IF('mum-ep1-loop.mp4'),
    /** 2:3 poster (Mum's close-up from the 1080p master) */ tall: IF('mum-ep1-tall.jpg'),
    /** a silent 10 s trailer: Mum, the bus door, the bus pulling away, the tears (four cuts, no subtitles) */ trailer: IF('mum-ep1-trailer.mp4'),
    /** the IIAYN FILMS opener (open-A, 5.58 s since 2026-10-28) ends here: previews start after it, full playback keeps it */ identEnd: 5.58,
    credit: 'Pictures: GPT Image 2.5 Flare. Video: MiniMax H3, open weights, on Comfy Cloud. Camera move: LTX-2.5 22B, open weights, on Comfy Cloud. Subtitles: Whisper, open source. Directed by SyteSim × AI. Edit and sound: AI.',
    cost: 'About $4 of Comfy Cloud credit, unused takes included.',
    /** the run chip (shared/runChip.ts): the clips' model, the other models as "+N", the cost line's total */
    chip: { model: 'MiniMax H3', also: ['GPT Image 2.5 Flare (stills) · Comfy Cloud', 'LTX-2.5 22B (camera move) · Comfy Cloud'], place: 'Comfy Cloud', price: chipUsd(4, true) } as RunChipData,
    shots: [
      { key: 'argument', name: 'The argument', what: 'Kimbap, a scarf, and a fight', t0: 5.6, sec: 15, model: 'MiniMax H3', start: IF('still-01.jpg'), frame: IF('shot-argument.jpg') },
      { key: 'bridge', name: 'The pull-back', what: 'From Mum’s face back to the two of them', t0: 20.6, sec: 2, model: 'LTX-2.5 22B', start: IF('still-bridge.jpg'), frame: IF('shot-bridge.jpg') },
      { key: 'leaves', name: 'She leaves', what: 'The bus comes, Mum calls after her', t0: 22.6, sec: 15, model: 'MiniMax H3', start: IF('still-01.jpg'), frame: IF('shot-leaves.jpg') },
      { key: 'bus', name: 'The bus pulls away', what: 'Mum waves in the snow', t0: 37.6, sec: 4.6, model: 'MiniMax H3', start: IF('still-04.jpg'), frame: IF('shot-bus.jpg') },
      { key: 'lunchbox', name: 'The lunchbox', what: 'Money, a note, and tears', t0: 42.2, sec: 15, model: 'MiniMax H3', start: IF('still-02.jpg'), frame: IF('shot-lunchbox.jpg') },
    ] as FilmsShot[],
    /** title and credits from here to the end (v2, 2026-10-28: 2 s shorter after the jump cut at 22.7 s) */ endAt: 59.2,
  },
  /** a second film (2026-10-28): the 15 s MiniMax H3 K-drama beat (featured 'h3-kdrama-script', job fb0b44ca), with a post pass in code: the
   *  IIAYN FILMS ident, a light grade, English subtitles on every spoken line, timed to the speech (Whisper large-v3-turbo word timings, 2026-10-28; the whisper in italics), a beat on the sky, the title card and
   *  closing credits and the IIAYN FILMS end card (2026-10-28, the ring draws itself); its own sound, at -15 LUFS. 1280×720, 34.7 s. Built by a script in the research folder (wire/explore-halloween/kdrama). */
  comedy: {
    key: 'is-that-so', ko: '그래요?', en: 'IS THAT SO?', episode: 'A short comedy', genre: 'Korean comedy', sec: 37, lang: 'Korean · English subtitles',
    logline: 'He knocks her papers flying and won’t say sorry. She asks one quiet question. He leaves by the sky.',
    url: IF('is-that-so.mp4'), poster: IF('is-that-so.jpg'), alt: IF('is-that-so.jpg'), loop: IF('is-that-so-loop.mp4'),
    /** 2:3 poster: her, arms crossed, the white trail going up */ tall: IF('is-that-so-tall.jpg'),
    /** no separate trailer: the loop (the whisper and the rocket) */ trailer: IF('is-that-so-loop.mp4'),
    identEnd: 5.58,
    credit: 'Picture and voices: MiniMax H3, text to video, on Comfy Cloud: one 15 s take from a four-shot script with three lines of Korean. Subtitles: English, from the script. Directed by SyteSim × AI. Edit and sound: AI.',
    cost: 'One run: $1.20 of Comfy Cloud credit.',
    chip: chipOfFeatured(featuredByKey('h3-kdrama-script')!),
    shots: [] as FilmsShot[], endAt: 22.1,
    steps: [
      { name: 'Script', what: 'Four shots and three lines of Korean, written as one prompt.' },
      { name: 'Clip', what: 'One 15 s take with MiniMax H3, the voices and the whoosh included.' },
      { name: 'Subtitles', what: 'English lines timed to the Korean voices, as in a cinema release; the whisper in italics.' },
      { name: 'Ending', what: 'A beat on the empty sky, the title card, the credits and the IIAYN FILMS end card.' },
    ] as FilmsStep[],
    editor: { label: 'Make a film', href: STITCH_HREF },
  },
  /** a third film (2026-10-28): Mira's teaser for "The Airport Run", episode 1 of a short comedy. One MiniMax H3 clip of the corridor run, a
   *  voice-over by ElevenLabs v3 (Bella), edit and sound by AI: the freeze, the cards, a made-up score and the IIAYN FILMS end card (no rewind since round 2).
   *  No Korean title; the IIAYN FILMS opener, then the run. 1280×720 web copy of the 16:9 cut, 18.3 s (the freeze holds to the end of the VO; one TO BE CONTINUED card, no end card). */
  teaser: {
    key: 'airport-run', ko: '', en: 'The Airport Run', episode: 'Episode 1 teaser', genre: 'A short comedy', sec: 18, lang: 'English',
    logline: 'Midnight, an empty office, and the big airport run with nobody waiting at the end. Then the floor wins.',
    url: IF('airport-run.mp4'), poster: IF('airport-run.jpg'), alt: IF('airport-run.jpg'), loop: IF('airport-run-loop.mp4'),
    /** 2:3 poster: Mira, just before she runs */ tall: IF('airport-run-tall.jpg'),
    /** no separate trailer: the loop (the run and the faceplant) */ trailer: IF('airport-run-loop.mp4'),
    /** the IIAYN FILMS opener (open-A, 2026-10-28) ends here: previews start on the run */ identEnd: 5.58,
    credit: 'Video: MiniMax H3, open weights, on Comfy Cloud. Voice-over: ElevenLabs v3. Directed by SyteSim × AI. Edit and sound: AI.',
    /** job e28e7eba (H3, 4 s 480p, $0.12) + three ElevenLabs v3 takes (Rachel, Elli, Bella; $0.0218 each) */ cost: 'About $0.19 of Comfy Cloud credit: one 4 s clip and three voice takes.',
    chip: { model: 'MiniMax H3', also: ['ElevenLabs v3 (voice-over, three takes) · Comfy Cloud · $0.07'], place: 'Comfy Cloud', price: chipUsd(0.12 + 3 * 0.0218) } as RunChipData,
    shots: [] as FilmsShot[], endAt: 13.4,
    steps: [
      { name: 'Clip', what: 'One MiniMax H3 take: Mira looks round, runs down the corridor, arms out, and faceplants.' },
      { name: 'Freeze', what: 'The picture stops on the landing with a small zoom and a record scratch.' },
      { name: 'Voice-over', what: 'Two dry lines from Mira, voiced with ElevenLabs v3, with captions timed to them.' },
      { name: 'Ending', what: 'One “to be continued” card with the IIAYN FILMS mark.' },
    ] as FilmsStep[],
    editor: { label: 'Make a film', href: STITCH_HREF },
  },
  /** a fourth film (2026-10-28): the teaser for LE SEPTIÈME, our French horror short. Cut for free from the film's existing takes (round 5):
   *  Camille on the phone with Maman in the cage lift, the stop at a dark 7, Maman's voice from far down the corridor, the call from home,
   *  one straight run at the gate, the fingers on the bars, the face in the lens, then TO BE CONTINUED. Maman's lines: Qwen3 TTS (Serena), local.
   *  1280×720 web copy of the 16:9 cut, 35.4 s (round 7: Camille's scream on the face; no phone-screen insert). */
  horror: {
    key: 'le-septieme', ko: '', en: 'LE SEPTIÈME', episode: 'Episode 1 teaser', genre: 'French horror', sec: 35, lang: 'French · English subtitles',
    logline: 'Coming home late, Camille’s old cage lift stops at a seventh floor. Her mother calls from the dark landing, while her mother is on the phone at home.',
    url: IF('le-septieme.mp4'), poster: IF('le-septieme.jpg'), alt: IF('le-septieme.jpg'), loop: IF('le-septieme-loop.mp4'),
    /** 2:3 poster */ tall: IF('le-septieme-tall.jpg'),
    /** no separate trailer: the loop */ trailer: IF('le-septieme-loop.mp4'),
    /** the IIAYN FILMS opener (open-A) ends here: previews start in the lift */ identEnd: 5.58,
    credit: 'Video: MiniMax H3 on Comfy Cloud. Stills: GPT Image 2.5 Flare. Maman’s voice: Qwen3 TTS, free on your computer. Directed by SyteSim × AI. Edit and sound: AI.',
    cost: 'About $6.70 of Comfy Cloud credit, unused takes included.',
    chip: { model: 'MiniMax H3', also: ['GPT Image 2.5 Flare (stills) · Comfy Cloud', `Qwen3 TTS (voice) · ${LOCAL_LABEL} · Free`], place: 'Comfy Cloud', price: chipUsd(6.7, true) } as RunChipData,
    shots: [] as FilmsShot[], endAt: 30.58,
    steps: [
      { name: 'Stills', what: 'Start frames and inserts with GPT Image 2.5 Flare: the lift, the gate, the dark seventh floor.' },
      { name: 'Clips', what: 'Each shot a short MiniMax H3 take; only the takes that look real made the cut.' },
      { name: 'Maman', what: 'Her lines in a warm French voice with Qwen3 TTS; from the dark, pushed far down the corridor.' },
      { name: 'Sound', what: 'A low drone, a faint heartbeat, creaks and nails on brass, and silence before every scare.' },
      { name: 'Ending', what: 'One “to be continued” card with the IIAYN FILMS mark.' },
    ] as FilmsStep[],
    editor: { label: 'Make a film', href: STITCH_HREF },
  },
  /** Approved TO BE CONTINUED cut (2026-10-29). Original job 415c2ab2; finishing adds no generated footage. */
  counterOffer: {
    key: 'counter-offer', ko: '', en: 'The Counter-Offer', episode: 'A short comedy', genre: 'Korean comedy', sec: 20, lang: 'Korean · English subtitles',
    logline: 'Two women meet over tea. One brings an envelope to end a relationship. The other has a bigger proposal.',
    url: IF('counter-offer.mp4'), poster: IF('counter-offer.jpg'), alt: IF('counter-offer.jpg'), loop: IF('counter-offer-loop.mp4'),
    tall: IF('counter-offer-tall.jpg'), trailer: IF('counter-offer-loop.mp4'), identEnd: 1.25,
    credit: 'Picture and Korean voices: MiniMax H3 on Comfy Cloud. English subtitles: script translation, checked against Whisper small timings. Directed by SyteSim × AI. Edit and sound: AI.',
    cost: 'Original run: estimated $1.20 / 254 Comfy credits, billed by GPU time. Actual provider charge unavailable. No new generation for this edit.',
    chip: { model: 'MiniMax H3', place: 'Comfy Cloud', price: chipUsd(1.2, true) } as RunChipData,
    shots: [] as FilmsShot[], endAt: 17.083333,
    steps: [
      { name: 'Script', what: 'One prompt describes four shots, two women at a hotel lounge table and three lines of Korean dialogue.' },
      { name: 'Clip', what: 'One MiniMax H3 text-to-video run on Comfy Cloud: 15 s requested at 480p, seed 744799. The complete 15.083 s scene is retained.' },
      { name: 'Sound', what: 'The original voices, ambience and musical sting stay together. A constant gain lift and short edge fades finish the sound; no new voice or music.' },
      { name: 'Subtitles', what: 'English translations from the script, timed with cached Whisper small, the audio and mouth movements: “Take this and stay away from my son.” “Then let me have your son.” “How much is in there?”' },
      { name: 'Ending', what: 'A short IIAYN FILMS ident, the full scene and a reaction hold, then three seconds of TO BE CONTINUED and credits. The 720p delivery is resized from 864×480 footage, not newly generated detail.' },
    ] as FilmsStep[],
    editor: { label: 'Make a film', href: STITCH_HREF },
  },
  /** Existing finished lighthouse cut moved into the catalogue, without re-encoding its picture or soundtrack.
   * The silent hover loop and tall poster are small derivatives of the original run, not new generations. */
  lighthouse: {
    key: 'star-to-steer-by', ko: '', en: 'A Star to Steer By', episode: 'A short film', genre: 'Poetry', sec: 21, lang: 'English',
    logline: EXPLORE_SEEDANCE.strip.line,
    url: EXPLORE_SEEDANCE.strip.cut.url, poster: EXPLORE_SEEDANCE.strip.cut.poster, alt: EXPLORE_SEEDANCE.strip.cut.poster,
    loop: IF('lighthouse-loop.mp4'), tall: IF('lighthouse-tall.jpg'), trailer: IF('lighthouse-loop.mp4'),
    /** No IIAYN FILMS opener was added to this existing cut. Play starts at its actual beginning. */
    identEnd: 0, endAt: EXPLORE_SEEDANCE.strip.cut.sec,
    credit: 'Picture: Seedance 2.0 on Comfy Router. Voice: Qwen3 TTS, free. Music: YuE2, free. Poem: “Sea-Fever”, John Masefield (1902). Quote: Albert Einstein (1929).',
    cost: 'Original picture run: $3.25 on Comfy Router. Voice, music and finishing were added for free; no new generation for this move.',
    chip: { ...chipOfFeatured(featuredByKey('seedance-lighthouse')!), also: [`Qwen3 TTS (voice) · ${LOCAL_LABEL} · Free`, `YuE2 (music) · ${LOCAL_LABEL} · Free`] } as RunChipData,
    shots: [] as FilmsShot[],
    steps: [
      { name: 'Prompt', what: 'Nine words: “A lighthouse on a cliff at dusk, waves crashing”.' },
      { name: 'Picture', what: 'One 15 s Seedance 2.0 run on Comfy Router, requested at 720p. The original saved run is available through Recreate picture.' },
      { name: 'Sound', what: 'The existing finished cut adds Qwen3 TTS narration and a YuE2 lullaby, both free.' },
      { name: 'Words and finish', what: 'Lines from John Masefield’s “Sea-Fever” (1902), a final Albert Einstein quote (1929), captions, letterbox and end cards make the existing 21.3 s cut. Recreate picture opens the original generation, not a saved edit of this finished film.' },
    ] as FilmsStep[],
    editor: { label: 'Recreate picture', href: featuredRecreateHref(EXPLORE_SEEDANCE.strip.key)! },
    make: EXPLORE_SEEDANCE.make,
  },
  /** coming next: placeholders, no media yet (none right now) */
  next: [] as FilmsNext[],
  /** the last card: an invitation to make one */ yours: { title: 'Your film here', line: 'Join your clips in Stitch, with music and a voice.', label: 'Make a film', href: STITCH_HREF },
  /** "How it was made": the steps, in plain words (the film-making skill has the full recipe) */
  steps: [
    { name: 'Stills', what: 'Four start frames with GPT Image 2.5 Flare, about $0.06 each.' },
    { name: 'Clips', what: 'One 15 s clip per scene with MiniMax H3, the voices and street sound included.' },
    { name: 'Continue', what: 'The pull-back starts on the argument’s last frame, so the cut doesn’t jump.' },
    { name: 'Bridge', what: 'A short LTX-2.5 22B shot carries Mum’s face into the next scene.' },
    { name: 'L-cut', what: 'Mum’s call runs on over the next shot, so her goodbye lands.' },
    { name: 'Sound beds', what: 'A snowy street and a bus hum sit under the cuts and smooth them over.' },
    { name: 'Subtitles', what: 'Whisper, an open-source model, writes the English lines.' },
    { name: 'Ending', what: 'The credits, then the IIAYN FILMS end card: the ring draws itself.' },
  ] as FilmsStep[],
  /** Video › Stitch: join clips, music and a voice into a film (the Editor tab is hidden, 2026-11-01; /film still opens) */ editor: { label: 'Make your own', href: STITCH_HREF },
  make: { label: 'Make your own', href: STITCH_HREF },
};

// ---------------------------------------------------------------- the tagline and headline
export interface Tagline { /** one line per entry (the page breaks between them) */ title: string[]; line: string }
/** Copy options for the hero's centre. Swap EXPLORE_TAGLINE's index to change it. */
export const EXPLORE_TAGLINES: Tagline[] = [
  { title: ['Image, video, music, 3D.', 'One open studio.'], line: 'Run open models free on your computer, or reach for the cloud. Every workflow is open and credited.' },
  { title: ['Everything you imagine,', 'made in one app.'], line: 'Images, video, music and 3D worlds. Free on your computer, the cloud when you want more.' },
  { title: ['Your studio.', 'Open all the way down.'], line: 'See the exact workflow behind every frame, and run it free on your computer.' },
];
export const EXPLORE_TAGLINE: Tagline = EXPLORE_TAGLINES[0];

/** The hero's big top-left title (user pick, 2026-10-27); the clip's own name moves into the line under it. */
export const EXPLORE_HEADLINE = 'Bring your ideas to life';


// ---------------------------------------------------------------- Chapter 1: swap a character (two models, one dance, on Comfy Cloud)
/** Chapter 1 (2026-10-28, the user's pick "C · Dance-off"; before it: one H3 run in a clip → result wipe): the same pink-stage dance swapped twice,
 *  side by side in step, each a before / after slider over the original. H3 Character Swap (featured 'h3-char-swap', job 1f0cf6a2): the girl, from one photo.
 *  Kling 3.0 Omni Edit (featured 'kling-dance-swap', Motion Control, job dc114104): both dancers, from two photos (the same girl's photo as H3's,
 *  plus his). Both play their Topaz upscale (`sharp`); the two source clips are the same 8 s take frame for frame, so all four clips play in step.
 *  Models, places and prices on screen come from the featured entries. */
export interface SwapRun { key: string; who: string; photos: string; cta: { label: string; href: string };
  /** the original's poster at the same moment as this run's poster (default: the original's own), so the two sides match before the clips play and under reduced motion */ originalPoster?: string }
/** Object Swap with H3 Character Swap picked */ const SWAP_H3_CTA = { label: 'Swap a character', href: `${videoWorkflowHref('object-swap')}&model=minimax-h3-character-swap` };
export const EXPLORE_SWAP = {
  key: 'h3-char-swap', eyebrow: 'Chapter 1 · Swap a character', title: ['Same dance.', 'Two new casts.'],
  line: 'One clip went in. One model swapped her, the other swapped them both. Not a step out of time.',
  /** the original: the clip both runs started from (H3’s copy of it; Omni Edit’s is the same take), left of each slider’s line */ original: { label: 'Original', url: P('h3-char-swap-in.mp4'), poster: P('h3-char-swap-in.webp') },
  runs: [
    { key: 'h3-char-swap', who: 'She changes', photos: 'One photo', cta: SWAP_H3_CTA },
    { key: 'kling-dance-swap', who: 'They both change', photos: 'Two photos', originalPoster: P('h3-char-swap-in-5s.webp'), cta: { label: 'Swap the whole cast', href: `${videoWorkflowHref('motion-control')}&model=kling-v3-omni-edit` } },
  ] as SwapRun[],
  cta: SWAP_H3_CTA,
};

// ---------------------------------------------------------------- Chapter 2: image to layers (Seedream 5.0 Flash on Comfy Router)
/** Chapter 2 (2026-10-27, from the approved mockup, option A): one real Image to layers run (featured 'image-layers-paw', job 829b6ef1). Copy left,
 *  the animation right (our own 16.7 s motion piece of that run, no sound: it plays muted on a loop), then the input → all 13 layers below. The
 *  layers, the input, the model and the price live in the featured entry. */
export const EXPLORE_LAYERS = {
  key: 'image-layers-paw', eyebrow: 'Chapter 2 · Image to layers', title: ['One picture.', 'Every layer.'],
  line: 'Drop in a finished design and get each part back on its own transparent layer: the dogs, the title, the logo, the box panels. Ready to move, recolour or animate. Download it as a layered PSD for Photoshop.',
  steps: [
    { n: 1, name: 'Picture', line: 'Any poster, ad or photo' },
    { n: 2, name: 'Split', line: 'Each object and text block becomes a layer' },
  ],
  /** step 3 is the run itself: "<n> layers", its model, where it ran and its real price (from the featured entry) */ model: 'Seedream 5.0 Flash', via: 'Comfy Cloud',
  /** the animation (H.264 720p; AAC sound designed in code for this clip, played only when the viewer turns it on): its full-frame poster (frame at 5 s, the layers apart) and a 480 px thumb */
  film: { url: P('image-layers-paw.mp4'), poster: P('image-layers-paw.webp'), thumb: P('image-layers-paw-480.webp'), label: 'The poster coming apart into its 13 layers', /** it has an audio track: the shared sound button shows */ sound: true },
  input: 'Input',
  /** the strip's tile order (layer index): the subjects and the type first, the plates last */ order: [12, 11, 8, 5, 2, 3, 4, 6, 7, 9, 10, 1, 0],
  /** Create Image with Image to layers picked */ cta: { label: 'Split an image', href: `${IMAGE_PAGE}?workflow=image-layers` },
};

// ---------------------------------------------------------------- the agent builds the board
export const EXPLORE_BOARD = {
  eyebrow: 'Canvas', title: 'Your idea. Your agent. One canvas.', line: 'Describe what you want to make. Your agent builds the workflow—you review, choose and give the go-ahead.',
  /** User-selected Option A v3 replacement, 2026-10-30: product-shots Canvas workflow.
   * The encoded 1440×900 picture is unchanged; only the soundtrack differs, so the poster stays.
   * Supplied media is copied without retiming or re-encoding. Voice-model provenance is not encoded in the file.
   * Recorded model labels and prices describe the walkthrough, not new runs started by playback. */
  recording: {
    url: '/showcase/canvas-demo.mp4', poster: '/showcase/canvas-demo.jpg',
    sec: 27.413,
    caption: 'Canvas demo · product shots',
    disclosure: 'Recorded Canvas workflow demonstration. Playback does not run models or spend credits; model labels and prices are part of the recorded walkthrough.',
  },
  cta: { label: 'Open Canvas', href: '/canvas' },
};

// ---------------------------------------------------------------- One idea. Every look.
/** Twelve free FLUX.2 [klein] 4B runs on this computer: one prompt (a red coat on a city street), a different look added each time.
 *  Each look ships as a 1024 px frame (`look-<id>.webp`) and a 480 px tile (`look-<id>-480.webp`), metadata stripped. */
const KLEIN_LOOKS: [id: string, name: string][] = [['golden-hour', 'Golden hour'], ['film-noir', 'Film noir'], ['neon-rain', 'Neon rain'], ['teal-orange', 'Teal & orange'],
  ['35mm', '35mm'], ['documentary', 'Documentary'], ['studio-white', 'Studio white'], ['spotlight', 'Spotlight'], ['pastel', 'Pastel'], ['anime', 'Anime'], ['watercolour', 'Watercolour'], ['clay', 'Clay']];
/** Looks remade with Qwen Image 2.1 (same prompt and seed; sharper faces); the rest are FLUX.2 [klein] 4B. */
const QWEN_LOOKS = new Set(['golden-hour', 'neon-rain', 'teal-orange', '35mm', 'studio-white', 'spotlight', 'pastel']);
export const EXPLORE_LOOKS = {
  eyebrow: 'Image · one prompt, twelve looks', title: ['One idea.', 'Every look.'],
  line: 'Write it once. Then change the light, the film, the whole art style. Same scene, same coat, twelve different worlds.',
  model: 'FLUX.2 [klein] 4B', place: 'Free on your computer', /** the look shown first (Anime) */ start: 9,
  looks: KLEIN_LOOKS.map(([id, name]) => ({ id, name, url: P(`look-${id}.webp`), thumb: P(`look-${id}-480.webp`), model: QWEN_LOOKS.has(id) ? 'Qwen Image 2.1' : 'FLUX.2 [klein] 4B' })),
  cta: { label: 'Try your own look', href: `${IMAGE_PAGE}?model=flux-2-klein-4b` },
};

// ---------------------------------------------------------------- Now it's your turn.
/** One tile on the closing wall: a picture made in this app and the model that made it. */
export interface WallTile { src: string; model: string; star?: boolean }
const wallOf = (key: string): WallTile | null => { const f = featuredByKey(key); return f?.out.poster ? { src: f.out.poster, model: f.model } : null; };
const look = (id: string): WallTile => ({ src: P(`look-${id}-480.webp`), model: EXPLORE_LOOKS.looks.find((l) => l.id === id)?.model ?? EXPLORE_LOOKS.model });
const GPT = 'GPT Image 2.5 Flare', ZIT = 'Z-Image-Turbo', KLEIN = 'FLUX.2 [klein] 4B';
export const EXPLORE_YOUR_TURN = {
  eyebrow: 'Everything above was made in this app', title: ['Now it’s', 'your turn.'],
  line: 'Imagination is all you need. Describe it and make it real: a picture, a film, a song, a world.',
  placeholder: 'A lighthouse inside a glass jar, in a thunderstorm',
  make: 'Make it', note: 'Free on your own computer · open source · yours to keep',
  /** the other places to start */ tabs: [{ label: 'Image', href: IMAGE_PAGE }, { label: 'Video', href: VIDEO_PAGE }, { label: 'Audio', href: AUDIO_PAGE },
    { label: '3D', href: THREE_D_PAGE }, { label: 'Canvas', href: '/canvas' }],
  /** the drifting wall behind it: six columns, top to bottom. The tortoise village sits in the fifth column (right of the words, in view first), spotlit. */
  wall: ([
    [wallOf('ltx-pro-painter'), { src: P('wall-ramen-stall.webp'), model: 'Qwen Image 2.1' }, look('neon-rain'), wallOf('sheet-kaito'), { src: P('wall-cherry-dune.webp'), model: ZIT }],
    [{ src: P('wall-lighthouse-jar.webp'), model: ZIT }, wallOf('h3-koi-take'), { src: P('wall-storm-whale.webp'), model: GPT }, look('anime'), wallOf('ltx-fox-meadow')],
    [{ src: P('wall-jellyfish-bamboo.webp'), model: GPT }, wallOf('sheet-mossbun'), { src: P('wall-salt-flat.webp'), model: KLEIN }, wallOf('ltx-rain-city'), wallOf('h3-glass-whale')],
    [{ src: P('wall-orange-jacket.webp'), model: KLEIN }, { src: P('wall-knit-farm.webp'), model: ZIT }, look('clay'), { src: P('wall-rooftop-whale.webp'), model: GPT }, { src: P('x3d-city.webp'), model: '3D city · KayKit & Kenney' }],
    [{ src: P('wall-glowing-city.webp'), model: GPT }, wallOf('kling-dance-swap'), { src: P('wall-tortoise-village.webp'), model: GPT, star: true }, { src: P('wall-aurora-dome.webp'), model: ZIT }, wallOf('mossbun-golden-hour')],
    [{ src: P('wall-christmas-village.webp'), model: GPT }, wallOf('ltx-pro-whale-glide'), { src: P('wall-harbour-storm.webp'), model: GPT }, wallOf('sc-98ba27ae'), wallOf('ltx-lighthouse')],
  ] as (WallTile | null)[][]).map((col) => col.filter((t): t is WallTile => !!t)),
};
/** Create Image with this prompt in the bar (shared/usePrefill reads ?prompt=); nothing runs until Generate. */
export const yourTurnHref = (prompt: string): string => `${IMAGE_PAGE}?${new URLSearchParams({ prompt: prompt.trim() || EXPLORE_YOUR_TURN.placeholder })}`;

// ---------------------------------------------------------------- Audio: SyteSim dances
export interface Mood { id: string; label: string; /** the words that pick the dancer's style (beanStyle.ts detectStyle) */ words: string; bpm: number; /** the demo beat's feel */ feel: 'boom' | 'four' | 'rock' | 'lofi' | 'ballad' }
export const EXPLORE_MOODS: Mood[] = [
  { id: 'rap', label: 'Hip-hop', words: 'boom bap hip hop rap beat', bpm: 92, feel: 'boom' },
  { id: 'edm', label: 'EDM', words: 'EDM festival dance drop', bpm: 126, feel: 'four' },
  { id: 'rock', label: 'Rock', words: 'rock anthem electric guitar drums', bpm: 138, feel: 'rock' },
  { id: 'lofi', label: 'Lo-fi', words: 'lo-fi chill beat, soft piano, rainy night', bpm: 78, feel: 'lofi' },
  { id: 'love', label: 'Love song', words: 'slow love song ballad', bpm: 68, feel: 'ballad' },
];
export const EXPLORE_DANCE = {
  eyebrow: 'Audio', title: 'Make a track. Watch it dance.', line: 'Every song you make in Audio gets SyteSim, a little dancer who listens to it and moves to the beat: bouncy for hip-hop, wild for EDM, slow for a love song.',
  note: 'This beat is a quick demo made in your browser. Make music writes a real song with YuE2, free on your computer.',
  cta: { label: 'Make music', href: audioRoute('music') },
};

// ---------------------------------------------------------------- Our song, and SyteSim dancing to it (2026-11-02)
/** "Dream It Up": a song made in Audio › Music with YuE2 on the maintainer's own computer through local ComfyUI ($0; seed 12310, our own lyrics,
 *  a 72 min render). The file is the take's first 55.7 s, ending on its own short break with a 1.8 s fade (the raw take stops mid-bar at 68 s),
 *  loudness-normalised, 128 kbps, tags stripped. SyteSim's "happy bounce" (5.17 s loop, 480×864, green keyed out) ships twice with its alpha:
 *  VP9 WebM for Chrome and Firefox, HEVC with alpha for Safari, plus a still (its first frame) for reduced motion and before he moves.
 *  The section's layout is still being picked (?songsection=a: a wide band in the middle, b: a compact card near the end). */
const SONG_STYLE = 'English, hip-hop electro-pop, 122 BPM, D major, punchy 808s, bouncy hip-hop groove, shiny electro-pop synths, claps, energetic chant vocal, group chant, upbeat, fun, playful';
export const EXPLORE_SONG = {
  eyebrow: 'Music',
  title: ['Write a song.', 'Watch it dance.'],
  line: 'We wrote the words, picked a style and pressed go. Audio made the whole song, free on our own computer. Press play and SyteSim dances along.',
  song: { url: '/showcase/song-imagination.mp3', title: 'Dream It Up', about: 'Electro-pop · 122 BPM', sec: 55.7, model: 'YuE2', modelKey: 'yue2',
    style: SONG_STYLE,
    lyric: 'Imagination is all you need. Dream it up and press go.' },
  dancer: { webm: '/showcase/mascot-dance.webm', mov: '/showcase/mascot-dance.mov', still: '/showcase/mascot-dance-still.webp', width: 480, height: 864, name: 'SyteSim' },
  /** Audio › Music with YuE2 and this song's style in the box (the lyrics are yours to write) */
  cta: { label: 'Make your own', href: `${audioRoute('music')}&${new URLSearchParams({ model: 'yue2', prompt: SONG_STYLE })}` },
};

// ---------------------------------------------------------------- One character. Every angle. (GPT Image 2.5 Flare on Comfy Router)
/** A sheet's panels in the image's own pixels: [label, x, y, w, h] (measured from each sheet; the highlight steps across them). */
export type SheetPanel = [string, number, number, number, number];
export interface SheetCast {
  /** featured.ts key: the sheet, its prompt, price and Recreate */ key: string; /** the switch's short name, and the full one */ name: string; full: string; style: string;
  /** a 96 px face crop for the switch */ face: string; panels: SheetPanel[];
  /** the same character as a 3D model (Mossbun): a web copy of the run's GLB, decimated and compressed, with the run's model, place and price */
  threeD?: { url: string; model: string; place: string; usd: number; jobId: string; faces: number; sourceFaces: number; sourceMB: number; /** Direct a Shot: the words the Render uses for it, and its front (radians) */ desc?: string; front?: number };
}
/** "One character. Every angle." (2026-10-27, the approved mockup v2): the whole sheet, never cropped, in a letterbox frame; a highlight steps across
 *  its real panels (Whole sheet first), a cast switch, Recreate (Create Image with the prompt and model) and Pause. Mossbun also spins in 3D. */
export const EXPLORE_SHEETS = {
  eyebrow: 'Made with GPT Image 2.5 Flare', title: 'One character. Every angle.',
  line: 'Describe someone once and get the whole model sheet in one image: every view, the faces, the colours. The same character in every panel, ready to hand to Video as a reference.',
  model: 'GPT Image 2.5 Flare', via: 'Comfy Cloud', /** ms per panel */ dwell: 1800,
  cast: [
    { key: 'sheet-kaito', name: 'Kaito', full: 'Kaito Vey', style: 'Anime', face: P('char-kaito-face.webp'),
      panels: [['Front', 10, 10, 378, 632], ['Three-quarter', 388, 10, 380, 632], ['Side', 768, 10, 379, 632], ['Back', 1147, 10, 379, 632], ['Expressions', 10, 654, 1212, 360], ['Palette', 1222, 654, 304, 360]] },
    { key: 'sheet-mossbun', name: 'Mossbun', full: 'Mossbun', style: '3D feature', face: P('char-mossbun-face.webp'),
      panels: [['Front', 12, 18, 349, 354], ['Three-quarter', 361, 18, 364, 354], ['Side', 725, 18, 367, 354], ['Back', 1092, 18, 352, 354], ['Expressions', 12, 372, 1241, 236], ['Palette', 1253, 372, 191, 236]],
      /* job 092abb03: Tripo 3.1 image to 3D on Comfy Cloud (standard detail, PBR), est. $0.30; its 44 MB, 1.4M-face GLB ships as a 3.3 MB web copy
         (gltf-transform: simplified to 127k faces, quantized, 1K WebP textures; no decoder needed) */
      threeD: { url: P('char-mossbun-3d.glb'), model: 'Tripo 3.1', place: 'Comfy Cloud', usd: 0.3, jobId: '092abb03', faces: 127_504, sourceFaces: 1_416_723, sourceMB: 44,
        /* Direct a Shot's words for it (the Render prompt) and its front (this file faces glTF's +z) */
        desc: 'Mossbun, a small round forest creature with soft moss-green fur, a cream belly, long floppy leaf-tipped ears, big amber eyes and a fluffy tail ending in a glowing orange lantern bulb', front: 0 } },
    { key: 'sheet-mechanic', name: 'Mechanic', full: 'Harbour mechanic', style: 'Photoreal', face: P('char-mechanic-face.webp'),
      panels: [['Face', 0, 0, 320, 1024], ['Front', 320, 0, 308, 1024], ['Left profile', 628, 0, 286, 1024], ['Back', 914, 0, 304, 1024], ['Right profile', 1218, 0, 318, 1024]] },
    { key: 'sheet-kip', name: 'Kip', full: 'Kip Rally', style: 'Vinyl toy', face: P('char-kip-face.webp'),
      panels: [['Front', 0, 8, 330, 672], ['Three-quarter', 330, 8, 332, 672], ['Side', 662, 8, 333, 672], ['Back', 995, 8, 349, 672], ['Expressions', 0, 700, 915, 300], ['Colour swatch', 915, 700, 429, 300]] },
  ] as SheetCast[],
};

// ---------------------------------------------------------------- Mockup to film (Direct a Shot made real; replaces the Worlds tiles)
export interface FilmBeat { n: 1 | 2 | 3; step: string; model: string; place: string; /** USD, 0 = free */ usd: number; note: string; /** the price's detail (a tooltip) */ tip: string; /** the run */ jobId: string }
/** "Mockup to film" (2026-10-27, the approved mockup, option A "synced wipe"): the mockup clip, the line sweeps it into the painted first frame,
 *  then the film and the mockup play in step under the line (shared HeroReel, reveal with a before clip). Its clips are the featured entry's
 *  (shared/featured.ts 'ltx-mockup-film', trimmed to the first shot, looping); the three passes, their models and real prices are here. */
export const EXPLORE_FILM = {
  key: 'ltx-mockup-film', eyebrow: 'Direct a Shot · made real', title: 'Block it in 3D. Film it for real.',
  line: 'Stage the walk and the camera in your browser. The first frame becomes a photo, then the whole move is filmed, shot for shot.',
  beats: [
    { n: 1, step: 'Mockup', model: 'Direct a Shot', place: 'drawn in your browser', usd: 0, note: '', tip: 'Recorded in your browser, nothing billed', jobId: 'a1a50672' },
    { n: 2, step: 'First frame', model: 'GPT Image 2.5 Flare', place: 'Comfy Cloud', usd: 0.0238, note: '', tip: 'Billed $0.024 (quoted $0.04)', jobId: '645de70d' },
    { n: 3, step: 'Film', model: 'LTX-2.5 22B + Layout to Render', place: 'Comfy Cloud', usd: 0.28, note: '8 s run · first shot shown', tip: 'Estimate: 60 Comfy credits for the 8 s run. The first shot (4 s, with sound) plays here.', jobId: '1a1a33c6' },
  ] as FilmBeat[],
  /** the painted first frame (job 645de70d, 1536×864, shown at 1280×720) */ first: { url: P('ltx-mockup-film-first.webp'), thumb: P('ltx-mockup-film-first-480.webp') },
  /** where the line rests while the film plays (the mockup's share) */ parkAt: 0.42,
  /** the wipe's labels */ labels: { mockup: 'Mockup', first: 'First frame', film: 'Film' },
  credit: 'Mockup: Direct a Shot, in your browser. First frame: GPT Image 2.5 Flare edit, Comfy Cloud. Film: LTX-2.5 22B with Lightricks’ Layout to Render LoRA, Comfy Cloud.',
  /** Direct a Shot on the same Open city preset */ cta: { label: 'Open Direct a Shot', href: `${threeDRoute('plan-a-shot')}&preset=open-city` },
};

// ---------------------------------------------------------------- VFX with LTX-2.5 (Footage Effects + Layout to Render, our LTX bonus)
/** One effect tile: a Footage Effects pick (shared/footageFx.ts id). `key` names its featured before / after once one is rendered and shipped
 *  (shared/featured.ts, toolId footage-fx, `before` = the conformed source clip): the tile then plays the shared wipe; until then it says
 *  plainly that the example is coming, never a stand-in clip. */
export interface VfxEffect { effect: string; key?: string }
export interface VfxTile { id: string; label: string; tagline: string; lora: string; model: string; maker: string; sourceUrl: string; key?: string; href: string }
/** A tile's words and links, read from the tool's own rules (shared/footageFx.ts) and the LoRA registry (shared/ltxLoras.ts), nothing typed twice. */
export function vfxTile(v: VfxEffect): VfxTile | null {
  const e = footageEffect(v.effect); const l = e ? LTX_LORAS[e.lora] : undefined; if (!e || !l) return null;
  return { id: e.id, label: e.label, tagline: e.tagline, lora: l.label, model: footageFxModelName(l.label), maker: 'Lightricks', sourceUrl: l.sourceUrl, key: v.key,
    /* Video › Footage Effects with this effect picked (the bar's ?preset= deep link) */ href: `${videoWorkflowHref(FOOTAGE_FX_TOOL)}&preset=${encodeURIComponent(e.id)}` };
}
/** "VFX with LTX-2.5" (2026-10-27): what LTX does to footage, not just from a prompt. Four official Lightricks IC-LoRAs on the open LTX-2.5 22B
 *  (Footage Effects, free and local), then Layout to Render (a grey 3D blockout filmed for real: the Mockup to film clip, shipped once, reused). */
export const EXPLORE_VFX = {
  eyebrow: 'VFX with LTX-2.5', title: 'Shoot it once. Change everything else.',
  line: 'Turn day into night, empty a street, flood it, or pull a clean matte from your own clip. The framing and the motion stay; only the world changes. Free on your computer.',
  place: 'Free · on your computer', pending: 'Example coming', pendingLine: 'A before / after is coming soon. Try it on your clip now.',
  effects: [{ effect: 'day-to-night' }, { effect: 'vanish' }, { effect: 'flood' }, { effect: 'alpha-matte' }] as VfxEffect[],
  /** Layout to Render: the Mockup to film run (shared/featured.ts 'ltx-mockup-film'); its model, place and price are the featured entry's */
  layout: { key: 'ltx-mockup-film', label: 'Layout to Render', tagline: 'A grey 3D blockout, filmed as a real shot: the same walk, the same camera move.', lora: 'Layout to Render IC-LoRA', maker: 'Lightricks', sourceUrl: LAYOUT_LORA_REPO,
    /** where this run happened vs where it can run (the price pill is the run's own) */ note: 'We made this one on Comfy Cloud. Direct a Shot can also make it free on your computer.',
    /** the full three-pass story sits in "Mockup to film" above */ more: { label: 'See how it was made', href: '#xp-film' } },
  cta: { label: 'Open Footage Effects', href: videoWorkflowHref(FOOTAGE_FX_TOOL) },
  credit: 'Footage Effects: Lightricks’ Clean Plate, Day to Night, Water Simulation and Alpha Gen IC-LoRAs on LTX-2.5 22B, free on your computer. Layout to Render: Lightricks’ IC-LoRA for LTX-2.5.',
};

// ---------------------------------------------------------------- Script → Screen (MiniMax H3, one prompt written as a shot list)
export interface ScriptLine { who: string; /** a stage note, e.g. "shrugging" */ note?: string; /** as it was written in the prompt */ ko: string; en: string; /** when it's spoken (s, measured) */ t0: number; t1: number }
export interface ScriptShot { /** the slug line */ slug: string; action: string; /** what you hear */ sfx?: string; lines?: ScriptLine[]; /** where the cut lands (s, measured) */ t0: number; t1: number }
/** The prompt (shared/featured.ts H3_KDRAMA_PROMPT) laid out as a script. Times are measured from the clip, not the prompt's 0–4 / 4–8 / 8–11 / 11–15 s:
 *  the cuts with ffmpeg's scene detection (6.54, 11.17, 13.17 s), each line from the sound track. The Korean is the prompt's own; the English is ours. */
export const EXPLORE_SCRIPT = {
  key: 'h3-kdrama-script', eyebrow: 'Script to screen', title: 'Write the scene. Watch it play.',
  line: 'Four shots, two actors, three lines of Korean dialogue, one rocket. Everything you see came from the script beside it.',
  /** the clip's real length (s) */ duration: 15.08, place: 'Comfy Cloud', maker: 'MiniMax (Hailuo)',
  shots: [
    { slug: 'Ext. office plaza, Seoul · noon', action: 'He strides out of a glass revolving door, eyes on his phone, and clips her shoulder. Her papers go flying.', sfx: 'Street hum. Paper rustle.', t0: 0, t1: 6.54 },
    { slug: 'Close two-shot', action: 'She glares at him. He barely looks up.', t0: 6.54, t1: 11.17, lines: [
      { who: 'Her', ko: '부딪쳤으면 사과는 해야죠.', en: 'You knock into someone, you say sorry.', t0: 7.55, t1: 9.2 },
      { who: 'Him', note: 'shrugging', ko: '내가 왜?', en: 'Why should I?', t0: 10.45, t1: 11.1 }] },
    { slug: 'Extreme close-up · her eyes', action: 'Her face goes calm. Dangerously calm. Wind lifts her hair.', sfx: 'A low rumble builds.', t0: 11.17, t1: 13.17, lines: [
      { who: 'Her', note: 'a whisper', ko: '그래요?', en: 'Is that so?', t0: 12.15, t1: 12.8 }] },
    { slug: 'Low angle · wide', action: 'He shoots straight up into the sky like a rocket, a white trail behind him. She watches, arms crossed.', sfx: 'Wind roar. Whoosh.', t0: 13.17, t1: 15.08 },
  ] as ScriptShot[],
  credit: 'One prompt, written as a timed shot list with the dialogue in Korean. MiniMax H3 (Hailuo) text to video on Comfy Cloud: 768p, 15 s, voices and sound made with the picture. English subtitles added here.',
};

// ---------------------------------------------------------------- Your character, brought to life. (Mossbun: sheet → 3D → city → film)
const TRIPO = { model: MOSSBUN_3D_RUN.model, place: MOSSBUN_3D_RUN.place, usd: MOSSBUN_3D_RUN.costUsd } as const;
const IMAGE_TO_3D = `${threeDRoute('image-to-3d')}&model=cloud-tripo-31`;
/** One step card under the film: its name, its picture and the run that made it (job id; shared/featured.ts runByJob gives the real model and
 *  price, so nothing is typed twice). `tools`: the step's other runs, named in a small "+N tools" tip with their role. `before`: a small inset
 *  (the city: the grey Direct a Shot capture under the painted frame). `spin`: the card turns the GLB slowly while on screen. */
export interface X3dStep { step: string; job: string; thumb: string; alt: string; tools?: { job: string; role: string; tool?: string }[]; before?: string; spin?: string; caption?: string }
const E3 = (f: string) => `/examples/showcase-3d/${f}`;
/** The 3D section (rebuilt 2026-10-31): one headline, the finished film (featured 'mossbun-golden-hour'), then the four steps behind it and one
 *  bottom row (the whole chain's price, Recreate, Make your own, Credits). Free media only: Mossbun's GLB (Tripo 3.1, job 092abb03) and stills. */
export const EXPLORE_3D = {
  key: 'mossbun-golden-hour', title: ['Your character,', 'brought to life.'],
  line: 'Draw a friend. Watch it hop into 3D, explore a city and star in its very own film.',
  steps: [
    { step: 'Character sheet', job: '9564386e', thumb: P('char-mossbun-480.webp'), alt: 'Mossbun’s character sheet: four views and five faces' },
    { step: '3D model', job: '092abb03', thumb: P('x3d-mossbun.webp'), spin: P('char-mossbun-3d.glb'), alt: 'Mossbun as a 3D model, turning slowly' },
    /* the film starts from this frame: the golden-hour edit (job b688b9c3), featured 'mossbun-golden-hour' `before` (its 480 px poster) */
    { step: 'City frame', job: 'b688b9c3', thumb: E3('mossbun-city-painted-480.webp'), before: E3('mossbun-city-mockup-480.webp'), alt: 'Mossbun on a palm-lined avenue at golden hour: the frame the film starts from',
      tools: [{ job: '13aca5cc', role: 'staged in the 3D city', tool: 'Direct a Shot' }, { job: 'ea410812', role: 'first-frame paint' }] },
    { step: 'Film · 6 s with sound', job: 'a11a0c78', thumb: E3('mossbun-golden-hour-480.webp'), alt: 'Mossbun holding up a lantern, a frame from the film', caption: '…and we gave her a lantern.' },
  ] as X3dStep[],
  make: { label: 'Make your own', href: IMAGE_TO_3D }, recreate: 'Recreate this shot',
  /** the credits (the Credits tip on the bottom row): the CC0 kits the city is built from, and Mossbun */
  credit: 'City kits: KayKit by Kay Lousberg and Kenney, CC0 (free to use). Mossbun: made in this app with Tripo 3.1 on Comfy Cloud.',
  mossbun: { url: P('char-mossbun-3d.glb'), ...TRIPO, faces: 127_504 },
};

/** Every link on the showcase sections (the tests check each one opens a real page). */
export const EXPLORE_SHOWCASE_LINKS = (): string[] => [
  featuredRecreateHref('trend-mic') ?? '', featuredRecreateHref('trend-dance') ?? '',
  featuredRecreateHref(EXPLORE_HERO.key) ?? '', featuredRecreateHref(EXPLORE_STILL.take.key) ?? '', featuredRecreateHref(EXPLORE_KOI.key) ?? '', EXPLORE_KOI.cta.href, featuredRecreateHref(EXPLORE_SEEDANCE.strip.key) ?? '', EXPLORE_SEEDANCE.make.href, EXPLORE_FILMS.editor.href, EXPLORE_FILMS.make.href, EXPLORE_FILMS.yours.href, EXPLORE_SWAP.cta.href, featuredRecreateHref(EXPLORE_SWAP.key) ?? '', EXPLORE_LAYERS.cta.href, featuredRecreateHref(EXPLORE_LAYERS.key) ?? '', EXPLORE_BOARD.cta.href, EXPLORE_LOOKS.cta.href, ...EXPLORE_YOUR_TURN.tabs.map((t) => t.href), yourTurnHref(''),
  ...EXPLORE_SHEETS.cast.map((c) => featuredRecreateHref(c.key) ?? ''), featuredRecreateHref(EXPLORE_FILM.key) ?? '', EXPLORE_FILM.cta.href, featuredRecreateHref(EXPLORE_SCRIPT.key) ?? '',
  EXPLORE_3D.make.href, featuredRecreateHref(EXPLORE_3D.key) ?? '', EXPLORE_SONG.cta.href,
  EXPLORE_VFX.cta.href, ...EXPLORE_VFX.effects.map((v) => vfxTile(v)?.href ?? ''), featuredRecreateHref(EXPLORE_VFX.layout.key) ?? '',
];

// ---------------------------------------------------------------- made on your computer
/** "Made on your computer. Free." (2026-11-01): a rail of LTX-2.5 22B clips that ran on the user's own computer (job route local:…, $0).
 *  Each one was checked by eye: no real people, no brands or on-screen text, no visible artefacts. Left out: the rainy city (garbled shop signs,
 *  a smeared face), the Christmas street walk-by and the toy-village morph (both show a product name in a shop window).
 *  The clips live in shared/featured.ts; the rail keeps only local, finished clips (exploreLocalClips), so a cloud run can never slip in. */
export const EXPLORE_LOCAL = {
  eyebrow: 'Free video', title: 'Made on your computer. Free.',
  line: 'LTX-2.5 makes video with sound on your own computer. No credits, no queue. Hover to play, open one to make it again.',
  keys: ['ltx-fox-meadow', 'ltx-christmas-take', 'ltx-lighthouse', 'ltx-fox-meadow-close', 'ltx-village-loop'],
};
/** The rail's clips: featured entries that ran locally and are a video file. */
export const exploreLocalClips = () => EXPLORE_LOCAL.keys.map((k) => featuredByKey(k)).filter((f): f is NonNullable<typeof f> => !!f && f.runOn === 'local' && /\.mp4$/.test(f.out.url));
