/**
 * The canvas demo agent's plans (2026-10-26): a scripted, local "agent" for the canvas AI dock, so a fresh clone, a sandbox or a judge
 * sees the board build itself without connecting an MCP client. It is pure data: canvasAgent.ts plays a plan through the SAME ops an
 * MCP client sends (add_note, add_frame, add_card, move_into, propose_run, ask_pick) and the SAME proposal flow, so every paid step
 * still shows its quote and waits for Go.
 *
 * A plan is an idea note, then phases. Each phase opens a named frame ("Key frames", "Spin clip"), adds its cards in that frame (a grid
 * position, a shot name, optional arrows from earlier cards), then proposes them as ONE run and waits for the user's Go; the next phase
 * starts only after those cards finish (a clip needs its key frame first). A phase with `pick` then waits for the user to click the
 * version they like: `from: ['@pick']` in a later phase is that card, so only the pick goes on (less is spent).
 */

export interface DemoCard { key: string; name: string; workflow: string; prompt: string; col: number; row: number; from?: string[]; settings?: Record<string, string>; /** the demo media it shows on the sample server (shared/demoMedia.ts) */ ref?: string }
export interface DemoPhase { frame: string; say: string; cards: DemoCard[]; note: string; done: string; /** after the run: ask the user to pick one of these cards */ pick?: string }
export interface DemoPlan { id: string; title: string; /** the sticky note the agent starts with: the idea in a few words */ idea: string; intro: string; steps: string[]; phases: DemoPhase[]; outro: string }

/** The dock's starter chips. `prompt` is what the chip sends; the user can also type anything. A chip's own board (chipPlan) shows the
 *  maintainer's real runs on the sample server (shared/demoMedia.ts); typed words get the general plans below. Same list: web agentDockModel.ts. */
export const DEMO_STARTERS = [
  { id: 'short', label: 'Short film from idea', prompt: 'A girl chalks a whale on a stormy harbour rooftop, and the sea answers by lighting the city.' },
  { id: 'film', label: 'Make a 30s film', prompt: 'Make a 30s film: a lighthouse keeper finds a glowing bottle on the shore at dawn.' },
  { id: 'product', label: 'Product ad', prompt: 'A 15 second ad for a blue glass perfume: four moody shots on black sand at night.' },
  { id: 'animate', label: 'Make a clip longer', prompt: 'A boy cups a paper lantern in a rainy alley and it becomes a glowing koi. Then keep the shot going as the koi swims up to the moon.' },
  { id: 'takes', label: 'One picture, three takes', prompt: 'A glass whale over the desert: one picture, then three video takes from it with different models.' },
  { id: 'free', label: 'Explore an idea', prompt: 'A woman in a red coat walking down a city street, in three looks.' },
] as const;
/** The chip itself (its id and its own words, unedited): only then does the board show the chip's real runs. */
export const isChip = (starter: string | null | undefined, prompt: string) => !!starter && DEMO_STARTERS.some((s) => s.id === starter && clean(s.prompt) === clean(prompt));
export type DemoStarterId = (typeof DEMO_STARTERS)[number]['id'];

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
/** What the user asked for, without the starter's lead-in ("Make a 30s film: …" → "…"). */
function subjectOf(prompt: string, fallback: string): string {
  const s = clean(prompt.replace(/^(make|create|build|do)?\s*(a|an|the)?\s*(30\s*s(ec(ond)?s?)?|thirty[- ]second)?\s*(film|movie|short|trailer|product shots?)\s*(for|of|about)?\s*[:,-]?\s*/i, ''));
  /* "a water bottle: hero, lifestyle, detail" → the subject is before the colon; the list after it is the plan's own job */
  const c = s.indexOf(':'); const subject = c > 0 && s.slice(c + 1).includes(',') ? s.slice(0, c) : s;
  return (subject.trim() || fallback).replace(/[.\s]+$/, '').slice(0, 220);
}
/** The starter a prompt matches (a chip sends its id; typed text is matched by its words). */
export function detectStarter(prompt: string, starter?: string | null): DemoStarterId | 'free' {
  if (starter && DEMO_STARTERS.some((s) => s.id === starter)) return starter as DemoStarterId;
  const p = prompt.toLowerCase();
  if (/\bshort film\b|\bfilm from (an |my )?idea\b|\bfrom (an|my) idea\b/.test(p)) return 'short'; /* the flagship (shortFilmPlan) */
  if (/\bextend\b|make (it|the clip|a clip|my clip) longer|keep the shot going/.test(p)) return 'animate';
  if (/\bfilm\b|movie|trailer|\bshort\b|\bscene/.test(p)) return 'film';
  if (/product|packshot|bottle|sneaker|e-?commerce/.test(p)) return 'product';
  return 'free';
}
/** A demo plays only from its chip (a starter id). */
export const isStarterId = (starter: string | null | undefined): starter is DemoStarterId => !!starter && DEMO_STARTERS.some((s) => s.id === starter);
/** What the built-in demo says to typed words (2026-10-31): it can't chat, so it says so and never builds or prices anything.
 *  `waiting`: what a running demo waits for. `suggest`: the chip whose words match (never the catch-all 'free'). */
export function demoReply(prompt: string, o: { running: boolean; waiting?: 'go' | 'pick' | 'ok' | null }): { text: string; suggest: DemoStarterId | null } {
  const connect = 'Connect Claude (the plug icon) to talk about your board';
  if (o.running) {
    const next = o.waiting === 'go' ? 'Press Go or Cancel on the card above to continue, or Stop the demo.' : o.waiting === 'pick' ? 'Click the one you like on the board to continue, or Stop the demo.'
      : o.waiting === 'ok' ? 'Press Looks good above to continue, or Stop the demo.' : 'It carries on by itself, and every run waits for your Go. Stop the demo any time.';
    return { text: `I’m the built-in demo, so I can’t answer questions yet. ${next} ${connect}.`, suggest: null };
  }
  const k = detectStarter(prompt); const suggest = k === 'free' ? null : k;
  return { text: `I’m the built-in demo, so I can’t chat yet. ${connect}, or try a demo:`, suggest };
}
const FILM_SHOTS = [
  ['Wide establishing shot', 'wide establishing shot, misty coastline at dawn, cinematic, anamorphic'],
  ['Hero close-up', 'close-up of the main character, soft rim light, shallow depth of field'],
  ['The discovery', 'macro detail shot of the key object, glowing, wet sand, morning light'],
  ['The turn', 'medium shot, the character reacts in awe, wind in the hair, golden hour'],
  ['Closing shot', 'slow pull-back wide shot, silhouette against the sea, warm haze, end frame'],
] as const;
/** A music card the default model can make: MiniMax Music 3 and YuE2 take 30 s or more (server/src/tools/media.ts AUDIO_LENGTHS). */
const MUSIC_30S = { duration: '30' };
const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
/** The idea note's text: short, starting with a capital. */
const ideaOf = (s: string) => { const t = short(s, 90); return t.charAt(0).toUpperCase() + t.slice(1); };

export function demoPlan(prompt: string, starter?: string | null): DemoPlan {
  const chip = isChip(starter, prompt) ? chipPlan(starter!) : null; if (chip) return chip;
  const kind = detectStarter(prompt, starter);
  if (kind === 'film' || kind === 'short') { /* 'short' plays shortFilmPlan (canvasAgent.runShortFilm); this is its classic fallback */
    const subject = subjectOf(prompt, 'a lighthouse keeper finds a glowing bottle on the shore at dawn');
    const frames: DemoCard[] = FILM_SHOTS.map(([name, look], i) => ({ key: `f${i}`, name, workflow: 'create', prompt: `${subject}. ${look}`, col: i, row: 0 }));
    const clips: DemoCard[] = FILM_SHOTS.map(([name], i) => ({ key: `c${i}`, name: `${name} · clip`, workflow: 'video', prompt: `${subject}. ${name.toLowerCase()}, slow cinematic camera move, 6 seconds`, col: i, row: 1, from: [`f${i}`] }));
    return { id: 'film', title: 'A 30 second film', idea: ideaOf(subject), steps: ['Key frames for five shots', 'Five 6 s clips and a music bed', 'Ready to cut'],
      intro: `Here’s the plan for a 30 second film: ${subject}. Five shots of about 6 seconds. I’ll set up a key frame per shot first, then turn each into a clip and add music. Every run waits for your Go.`,
      phases: [
        { frame: 'Key frames', say: 'Setting up five key frames, one per shot.', cards: frames, note: 'Five key frames, one per shot', done: 'Key frames are in. Re-roll any shot that misses before we animate.' },
        { frame: 'Clips and music', say: 'Now the clips: each one starts from its key frame, plus a music bed.', cards: [...clips, { key: 'm', name: 'Music bed', workflow: 'music', prompt: `Cinematic score for a 30 second short film: ${subject}. Gentle piano, rising strings, hopeful ending`, col: 5, row: 1, settings: MUSIC_30S }], note: 'Five clips and the music', done: 'All five clips and the music are on the board.' },
      ],
      outro: 'Your 30 second film is laid out shot by shot. Open any clip in its workflow to fine-tune it.' };
  }
  if (kind === 'product') {
    const subject = subjectOf(prompt, 'a matte orange water bottle');
    const shots = [['Hero', 'hero product shot on a seamless warm grey backdrop, studio softbox, crisp reflections'], ['Lifestyle', 'lifestyle shot in use outdoors, natural light, candid, shallow depth of field'],
      ['Detail', 'macro detail of the material and logo, raking light, texture'], ['Flat lay', 'top-down flat lay with complementary props, clean composition, soft shadows']];
    return { id: 'product', title: 'Product shots', idea: ideaOf(subject), steps: ['Four product shots', 'Pick your hero', 'A spin clip from your pick'],
      intro: `Product set for ${subject}: hero, lifestyle, detail and flat lay. You pick the hero, then I make a short spin clip from it. Nothing runs until you press Go.`,
      phases: [
        { frame: 'Product shots', say: 'Placing the four shots.', cards: shots.map(([name, look], i) => ({ key: `p${i}`, name, workflow: 'create', prompt: `${subject}, ${look}`, col: i % 2, row: Math.floor(i / 2) })), note: 'Four product shots', done: 'Four shots are ready.', pick: 'Pick your hero shot. Click the one you like on the board.' },
        { frame: 'Spin clip', say: 'A 6 second turntable clip from your pick.', cards: [{ key: 'v', name: 'Spin clip', workflow: 'video', prompt: `${subject} slowly rotating on a turntable, studio light, seamless backdrop, 6 seconds`, col: 2, row: 0, from: ['@pick'] }], note: 'A spin clip from your pick', done: 'The spin clip is done.' },
      ],
      outro: 'The product set is on the board. Open any shot in Create Image to tweak it.' };
  }
  if (kind === 'animate') {
    const subject = subjectOf(prompt, 'a paper lantern becomes a glowing koi in a rainy alley');
    return animatePlan(subject, `${subject}, slow cinematic camera move, 10 seconds`, 'Keep the shot going: the same action at the same pace, same camera');
  }
  const subject = subjectOf(prompt, 'something beautiful');
  return { id: 'free', title: 'Explore an idea', idea: ideaOf(subject), steps: ['Three versions of the idea', 'Pick one', 'A short clip from your pick'],
    intro: `Let’s explore “${short(subject, 120)}”: three different looks as images. You pick one, and I turn it into a short clip. You approve each run.`,
    phases: [
      { frame: 'Three versions', say: 'Three versions, three different looks.', cards: [['Cinematic', 'cinematic photo, dramatic light'], ['Painterly', 'painterly illustration, rich colour'], ['Poster', 'minimal graphic poster, bold shapes']].map(([name, look], i) => ({ key: `i${i}`, name, workflow: 'create', prompt: `${subject}, ${look}`, col: i, row: 0 })), note: 'Three versions', done: 'Three versions are on the board.', pick: 'Pick the one you like. Click it on the board.' },
      { frame: 'Clip', say: 'A 6 second clip from your pick.', cards: [{ key: 'v', name: 'Clip', workflow: 'video', prompt: `${subject}, slow cinematic camera move, 6 seconds`, col: 0, row: 1, from: ['@pick'] }], note: 'A clip from your pick', done: 'The clip is done.' },
    ],
    outro: 'That’s a first pass. Tell me what to change, or open any card in its workflow.' };
}

/** Make a clip longer: a clip, then Extend on it (two steps, each waits for Go). */
function animatePlan(idea: string, clipPrompt: string, extendPrompt: string, refs?: { clip: string; extend: string }): DemoPlan {
  return { id: 'animate', title: 'Make a clip longer', idea: ideaOf(idea), steps: ['A 10 s clip', '10 s more with Extend'],
    intro: 'Two steps: a 10 second clip from your words, then Extend keeps the same shot going for 10 seconds more. Each run waits for your Go.',
    phases: [
      { frame: 'The clip', say: 'First the clip.', cards: [{ key: 'v', name: 'The clip', workflow: 'video', prompt: clipPrompt, col: 0, row: 0, settings: { duration: '10' }, ref: refs?.clip }], note: 'A 10 second clip', done: 'The clip is in.' },
      { frame: 'Extend', say: 'Now Extend picks up from the last frame of that clip.', cards: [{ key: 'e', name: '10 s more', workflow: 'extend', prompt: extendPrompt, col: 1, row: 0, from: ['v'], ref: refs?.extend }], note: 'Extend the clip by 10 seconds', done: 'Extended: one 20 second take.' },
    ],
    outro: 'One take, twice as long. Extend it again from the new card, or open it in Video.' };
}

// ---------------------------------------------------------------- the chips' own boards (2026-10-31)
/* A chip shows what really happened in the maintainer's runs, card by card (shared/demoMedia.ts): each card is the step that made its media,
   wired from the inputs that run really had, with a plain prompt that matches it. On the sample server every card plays that media; with a
   key or a GPU the same cards run for real. 'short' is the flagship flow (shortFilmPlan + CHALK_WHALE). */
const R = (recipe: string) => (key: string) => `${recipe}:${key}`;
export function chipPlan(starter: string): DemoPlan | null {
  if (starter === 'film') { /* a real run of the 30s film recipe: shots 3–5 were never animated, so only shots 1–2 have clips */
    const plan = demoPlan(DEMO_STARTERS[1].prompt, null); const r = R('film');
    plan.phases[0].cards.forEach((c) => { c.ref = r(c.key); });
    const p2 = plan.phases[1]; p2.cards = p2.cards.filter((c) => c.key === 'c0' || c.key === 'c1' || c.key === 'm').map((c) => ({ ...c, ref: r(c.key), ...(c.key === 'm' ? { col: 2 } : {}) }));
    p2.say = 'Now the clips for the first two shots, each from its key frame, plus a music bed.'; p2.note = 'Two clips and the music'; p2.done = 'The two clips and the music are on the board.';
    plan.steps = ['Key frames for five shots', 'Clips for shots 1 and 2, and a music bed', 'Ready to cut'];
    plan.outro = 'Your 30 second film is laid out shot by shot. Shots 3 to 5 are key frames only in this demo: add a Create Video card from any of them.';
    return plan;
  }
  if (starter === 'product') { const r = R('product');
    return { id: 'product', title: 'Product ad', idea: 'A blue glass perfume, a 15 s ad', steps: ['One prompt, shot by shot', 'One 15 s ad with sound'],
      intro: 'One prompt, one run: a 15 second ad in four shots, with sound. It waits for your Go.',
      phases: [{ frame: 'The ad', say: 'Writing the ad as one prompt, shot by shot.', cards: [{ key: 'ad', name: '15 s ad', workflow: 'video', col: 0, row: 0, settings: { duration: '15' }, ref: r('ad'),
        prompt: 'Luxury fragrance ad, 15 seconds, four shots: a faceted glass perfume bottle on wet black sand at night, blue light blooming inside the glass, moody teal and black, slow elegant motion.' }],
        note: 'One 15 second ad', done: 'The ad is ready.' }],
      outro: 'The ad is on the board. Re-roll it, or open it in Video to change a shot.' };
  }
  if (starter === 'animate') { const r = R('animate');
    return animatePlan('A paper lantern becomes a glowing koi',
      'Night, a narrow rainy stone alley: a boy in a navy raincoat cups a glowing paper lantern, and it slowly unfolds into a glowing koi that rises into the rain. 10 seconds.',
      'Keep the shot going: the koi circles once above the rooftops, then swims up toward the moonlit clouds.', { clip: r('clip'), extend: r('extend') });
  }
  if (starter === 'takes') { const r = R('takes'); /* one picture, then three image-to-video takes from that exact picture (two models) */
    const picture = 'A massive translucent glass whale floats above red desert dunes at golden hour, rainbow light refracting onto the sand, a lone camel rider below for scale, cinematic photograph.';
    const takes: [string, string, string, string][] = [
      ['glide', 'LTX-2.5 Pro · 6 s', '6', 'The whale glides slowly overhead, its tail sweeping once; rainbow light ripples across the dunes and over the rider; the camera tilts up slowly. With sound.'],
      ['dive', 'LTX-2.5 Pro · 7 s', '10', 'The whale zooms past the rider, its tail sweeping, a sand storm brewing near the rider; rainbow light ripples across the dunes.'],
      ['dunes', 'LTX-2.5 22B · 5 s', '5', 'The glass whale glides low over the camel rider, then dives nose-first into the dunes; golden sand bursts up in a glowing wave.']];
    return { id: 'takes', title: 'One picture, three takes', idea: 'A glass whale over the desert', steps: ['One picture', 'Three video takes from it, two models'],
      intro: 'One picture, then three video takes that all start from it, on two video models, so you can compare them side by side. Each step waits for your Go.',
      phases: [
        { frame: 'The picture', say: 'First the picture: every take starts from it.', cards: [{ key: 'picture', name: 'The picture', workflow: 'create', prompt: picture, col: 0, row: 0, ref: r('picture') }], note: 'One picture', done: 'The picture is in.' },
        { frame: 'Three takes', say: 'Now three takes from that picture: two on LTX-2.5 Pro, one on LTX-2.5 22B.', cards: takes.map(([k, name, duration, prompt], i): DemoCard => ({ key: k, name, workflow: 'video', prompt, col: i, row: 1, from: ['picture'], settings: { duration }, ref: r(k) })),
          note: 'Three takes from the picture', done: 'Three takes from one picture, side by side.' },
      ],
      outro: 'Same picture, three takes. Keep the one you like, or Re-roll any take on another model.' };
  }
  if (starter === 'free') { const r = R('free'); const base = 'a woman in a red coat walking down a city street, medium shot.';
    const looks: [string, string][] = [['Golden hour', 'golden hour, low warm sun, long shadows, rim light, soft haze'], ['Watercolour', 'loose watercolour painting, paper texture'], ['Anime', 'cel-shaded anime illustration, clean line art']];
    return { id: 'free', title: 'Explore an idea', idea: 'A woman in a red coat on a city street', steps: ['One prompt', 'Three looks of it'],
      intro: 'Let’s explore one idea in three looks: the same prompt, a different look added each time. It waits for your Go.',
      phases: [{ frame: 'Three looks', say: 'Three looks, one prompt.', cards: looks.map(([name, look], i) => ({ key: `i${i}`, name, workflow: 'create', prompt: `${base} ${look}`, col: i, row: 0, ref: r(`i${i}`) })), note: 'Three looks', done: 'Three looks are on the board.' }],
      outro: 'Three looks, one idea. Open any card in Create Image, or add a Create Video card from your favourite.' };
  }
  return null;
}

/** Grid → page point (centre of a card). Cards are 340 × 430; frames get `pad` around their cards, and the gap between rows leaves room
 *  for the frame headings and the arrows. The idea note sits in a column left of the grid. */
export const DEMO_GRID = { colW: 440, rowH: 620, cardW: 340, cardH: 430, pad: 36, noteW: 300 };
export function demoCardAt(origin: { x: number; y: number }, col: number, row: number) {
  return { x: Math.round(origin.x + col * DEMO_GRID.colW + DEMO_GRID.cardW / 2), y: Math.round(origin.y + row * DEMO_GRID.rowH + DEMO_GRID.cardH / 2) };
}
/** The frame around a phase's cards (top-left + size, page px). */
export function demoFrameOf(origin: { x: number; y: number }, phase: Pick<DemoPhase, 'cards'>) {
  const cols = phase.cards.map((c) => c.col); const rows = phase.cards.map((c) => c.row); const { colW, rowH, cardW, cardH, pad } = DEMO_GRID;
  const c0 = Math.min(...cols), c1 = Math.max(...cols), r0 = Math.min(...rows), r1 = Math.max(...rows);
  return { x: Math.round(origin.x + c0 * colW - pad), y: Math.round(origin.y + r0 * rowH - pad), w: (c1 - c0) * colW + cardW + 2 * pad, h: (r1 - r0) * rowH + cardH + 2 * pad };
}
/** Where the idea note goes: left of the grid, level with the first row. Centre point. */
export function demoNoteAt(origin: { x: number; y: number }) { return { x: Math.round(origin.x - DEMO_GRID.pad - 80 - DEMO_GRID.noteW / 2), y: Math.round(origin.y + DEMO_GRID.noteW / 2 - DEMO_GRID.pad) }; }
/** The whole plan's footprint, the note column included (the page finds a free area this big). */
export function demoPlanSize(plan: DemoPlan) {
  const cards = plan.phases.flatMap((p) => p.cards); const cols = Math.max(1, ...cards.map((c) => c.col + 1)); const rows = Math.max(1, ...cards.map((c) => c.row + 1));
  return { w: (cols - 1) * DEMO_GRID.colW + DEMO_GRID.cardW + 2 * DEMO_GRID.pad + DEMO_GRID.noteW + 80, h: (rows - 1) * DEMO_GRID.rowH + DEMO_GRID.cardH + 2 * DEMO_GRID.pad };
}
/** Left edge of the grid inside a free area of demoPlanSize (the note column comes first). */
export const demoGridOffset = () => ({ x: DEMO_GRID.noteW + 80 + DEMO_GRID.pad, y: DEMO_GRID.pad });

// ================================================================ "Short film from idea" (2026-10-27), the flagship starter
/* One line in, a short film laid out on the board in four steps the user can follow and take over at any point:
 *   1 Beats      the agent posts a beat sheet as sticky notes (6, or 8 for a longer idea) and waits for "Looks good" or an edit;
 *   2 Cast       a character sheet and a location plate (pictures), quoted, run on Go;
 *   3 Key frames one picture per beat, wired from the cast so the same person shows up; quoted, run on Go; then you pick a version per shot;
 *   4 Film       a clip card per shot wired from your pick, a voice card and a music card, all quoted. Voice and music run on Go and the
 *                clips are stitched into one film. While video runs are switched off (SHORT_FILM_VIDEO), the clip cards stay priced drafts.
 * The beats are read back from the board before the key frames are made, so the user's edits on the notes are what gets drawn, and a beat
 * edited after its key frame exists rewrites that card's prompt (its versions stay). Shape of the chain: docs (research) long-form-story
 * WORKFLOWS #1 and EXAMPLE-SHORT; the stitch is POST /api/compose (agentBudget.ts). */
export const SHORT_STEPS = ['Beats', 'Cast', 'Key frames', 'Film'] as const;
/** Video runs in the short film flow: off unless OPENHIGGSFIELD_CANVAS_VIDEO=1 (the clip cards are still added, wired and priced). */
export const shortFilmVideoOn = (env: Record<string, string | undefined> = process.env) => env.OPENHIGGSFIELD_CANVAS_VIDEO === '1';
export const SHORT_STARTER = DEMO_STARTERS[0];
const BEAT_SHAPES: [string, string][] = [
  ['Opening', 'the place, quiet and wide, before anything happens'],
  ['The hero', 'who we follow, and what they want'],
  ['The spark', 'the moment that sets the story going'],
  ['The way there', 'the hero moves toward it'],
  ['The turn', 'something changes, or goes wrong'],
  ['The big moment', 'the heart of the story'],
  ['The answer', 'the world answers back'],
  ['Final image', 'a wide shot that mirrors the opening'],
];
/** The look line every picture shares (one film, one look). */
export const SHORT_LOOK = 'cinematic still, soft 35 mm grain, natural light, consistent colour palette, no text in frame';
export interface ShortBeat { name: string; line: string; text: string }
export interface ShortPlan { id: 'short'; title: string; idea: string; subject: string; intro: string; beats: ShortBeat[]; cast: DemoCard[]; outro: string; videoOff: string; /** the chip's real runs (CHALK_WHALE) */ demo?: ShortDemo }
/** A short film's real runs (the chip): per shot its key frame prompt and inputs, the clips that were really made and what each one started
 *  (and ended) on, the voice line. Keys: cast keys, k0…, c0… (refs short:<key> in shared/demoMedia.ts). A shot keeps its demo wiring only while
 *  its beat note reads as written here; an edited beat is yours, and its cards get the general prompts and plain samples. */
export interface ShortDemo { keys: { prompt: string; from: string[] }[]; clips: { key: string; col: number; name: string; from: string[]; prompt: string }[]; voice: string; music: string }
const WHALE = 'a colossal humpback whale with dark slate skin, barnacle scars and long white fins (the whale from the sheet)';
const STORM = 'a dense harbour city at night in a heavy storm, wet glass towers, rain, lightning';
export const CHALK_WHALE: { beats: [string, string][]; cast: DemoCard[]; demo: ShortDemo } = {
  beats: [['Opening', 'the city goes dark in the storm'], ['The hero', 'a girl chalks a whale on a rooftop'], ['The spark', 'the whale bursts out of the harbour'],
    ['The turn', 'a wave floods the avenue'], ['The big moment', 'the whale meets the girl at the roof’s edge'], ['Final image', 'every window in the city lights up']],
  cast: [
    { key: 'place', name: 'The harbour', workflow: 'create', col: 0, row: 0, ref: 'short:place', prompt: `Wide establishing shot of ${STORM}, seen from the water: two tall glass towers with black, choppy harbour water between them. Live-action film still` },
    { key: 'whale', name: 'The whale', workflow: 'create', col: 1, row: 0, ref: 'short:whale', prompt: 'Creature reference sheet: a colossal humpback whale, dark slate skin with pale barnacle scars, long white pectoral fins, a scarred left eye. Five views on one sheet, photorealistic' },
  ],
  demo: {
    keys: [
      { prompt: `Very wide aerial shot of ${STORM}: most windows dark after a power cut, black harbour water below. Live-action film still`, from: [] },
      { prompt: `High wide shot on a flat rooftop of ${STORM}: a girl in a yellow raincoat kneels, finishing a huge white chalk drawing of a whale. Live-action film still`, from: [] },
      { prompt: `The same shot as the harbour picture, but now ${WHALE} bursts straight up out of the water between the towers. Live-action film still`, from: ['place', 'whale'] },
      { prompt: `Low street-level shot down a long empty avenue of ${STORM}, the harbour far ahead. Live-action film still`, from: [] },
      { prompt: `The same rooftop and girl, now close over her shoulder at the roof’s edge: right beside her, the head of ${WHALE} rises out of the dark water. Live-action film still`, from: ['k1', 'whale'] },
      { prompt: 'The exact same aerial shot as the reference, but now every window in every tower is lit, warm gold, the harbour reflecting the light. Live-action film still', from: ['k0'] },
    ],
    clips: [
      { key: 'c0', col: 0, name: 'Shot 1 · clip', from: ['k0', 'k5'], prompt: 'From the dark city to the lit one: a deep whale song rolls across the harbour and the lights come on window by window, tower by tower. 5 seconds' },
      { key: 'c1', col: 1, name: 'Shot 2 · clip', from: ['k1'], prompt: 'The girl finishes the chalk whale and sits back; thunder cracks and the puddles shiver as something huge moves below. 5 seconds' },
      { key: 'c2', col: 2, name: 'The harbour · clip', from: ['place', 'k2'], prompt: 'From the harbour picture to the breach: the water between the towers heaves, then the whale bursts straight up into the air. 5 seconds' },
      { key: 'c3', col: 3, name: 'Shot 4 · clip', from: ['k3'], prompt: 'Far down the avenue a wall of white water surges toward the camera, cars lift and the street lights go dark. 5 seconds' },
      { key: 'c4', col: 4, name: 'Shot 5 · clip', from: ['k4'], prompt: 'The whale slowly glides past the rooftop, eye to eye with the girl. 5 seconds' },
    ],
    voice: 'Every drawing you made was alive.',
    music: 'Gentle film cue: a magical music box, celesta, soft felt piano and warm strings, dreamy, soft humming',
  },
};

/** "Opening: the place, quiet and wide…" as a note; the number goes on the card, not in the note. */
export const beatNote = (b: Pick<ShortBeat, 'name' | 'line'>) => `${b.name}: ${b.line}`;
/** A note's text back as a beat: "Name: line" (an edited or new note without a colon is all line). */
export function beatOfNote(text: string, i: number): ShortBeat {
  const t = clean(text); const c = t.indexOf(':'); const name = c > 0 && c <= 32 ? t.slice(0, c).trim() : `Beat ${i + 1}`; const line = c > 0 && c <= 32 ? t.slice(c + 1).trim() : t;
  return { name, line, text: t };
}
export function shortFilmPlan(prompt: string, chip = false): ShortPlan {
  const subject = subjectOf(prompt.replace(/^(a\s+)?short film( from (an|my) idea)?\s*[:,-]?\s*/i, ''), 'a girl sets a paper boat on the dark harbor and every window answers');
  const words = subject.split(/\s+/).length; const pick = words > 18 ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1, 2, 4, 5, 7];
  const beats = chip ? CHALK_WHALE.beats.map(([name, line]) => ({ name, line, text: beatNote({ name, line }) })) : pick.map((k) => { const [name, line] = BEAT_SHAPES[k]; return { name, line, text: beatNote({ name, line }) }; });
  const cast: DemoCard[] = chip ? CHALK_WHALE.cast.map((c) => ({ ...c })) : [
    { key: 'hero', name: 'Main character', workflow: 'create', col: 0, row: 0,
      prompt: `Character reference sheet of the main character of this story: ${subject}. Three panels on a plain grey backdrop: front full body, back full body, face close-up. Same person in every panel, soft even light, no text` },
    { key: 'place', name: 'The place', workflow: 'create', col: 1, row: 0, prompt: `Location plate with no people, the main setting of this story: ${subject}. Wide, ${SHORT_LOOK}` },
  ];
  return { id: 'short', title: 'Short film from idea', idea: ideaOf(subject), subject, beats, cast, ...(chip ? { demo: CHALK_WHALE.demo } : {}),
    intro: `A short film from your idea: ${short(subject, 140)}. Four steps: beats, cast, key frames, film. You can edit or take over any of them, and every run waits for your Go.`,
    outro: 'That’s your short film, shot by shot. Change any beat, re-roll any shot, and Go again on just that card.',
    videoOff: 'Video runs are switched off, so they wait as drafts.' };
}
/** Prompts for the cards, from a beat (as it reads on the board now). */
export const keyFramePrompt = (subject: string, b: ShortBeat) => `${b.name}: ${b.line}. From the story: ${subject}. The same main character as the character sheet. ${SHORT_LOOK}`;
export const clipPrompt = (subject: string, b: ShortBeat) => `${b.name}: ${b.line}. From the story: ${subject}. Slow cinematic camera move, 5 seconds`;
export const narrationOf = (subject: string) => { const s = clean(subject).replace(/[.\s]+$/, ''); return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`; };
export const musicPrompt = (subject: string) => `Gentle cinematic score for a short film: ${short(subject, 160)}. Quiet start, a warm lift in the middle, hopeful end, no vocals`;
export const SHORT_MUSIC = MUSIC_30S;

/** Where everything goes (page px, card centres; origin = top-left of the grid). Rows: beats (notes), cast, key frames, film. */
export const SHORT_GRID = { colW: 440, noteSize: 260, cardW: 340, cardH: 430, gap: 170, pad: 36 };
export function shortLayout(origin0: { x: number; y: number }, nBeats: number) {
  const { colW, noteSize, cardW, cardH, gap, pad } = SHORT_GRID;
  /* the idea note sits in its own column left of the rows: the centre the zoomed-out sky joins every frame to */
  const IDEA_COL = noteSize + 140; const origin = { x: origin0.x + IDEA_COL, y: origin0.y };
  const yBeats = 0, yCast = noteSize + gap, yKeys = yCast + cardH + gap, yFilm = yKeys + cardH + gap;
  const at = (col: number, y: number, h: number) => ({ x: Math.round(origin.x + col * colW + cardW / 2), y: Math.round(origin.y + y + h / 2) });
  const box = (cols: number, y: number, h: number) => ({ x: Math.round(origin.x - pad), y: Math.round(origin.y + y - pad), w: (cols - 1) * colW + cardW + 2 * pad, h: h + 2 * pad });
  return {
    beat: (i: number) => at(i, yBeats, noteSize), cast: (i: number) => at(i, yCast, cardH), key: (i: number) => at(i, yKeys, cardH), clip: (i: number) => at(i, yFilm, cardH),
    voice: at(nBeats, yFilm, cardH), music: at(nBeats + 1, yFilm, cardH), film: at(nBeats + 2, yFilm, cardH),
    frames: { beats: box(Math.max(nBeats, 2), yBeats, noteSize), cast: box(2, yCast, cardH), keys: box(Math.max(nBeats, 2), yKeys, cardH), film: box(nBeats + 3, yFilm, cardH) },
    idea: { x: Math.round(origin0.x + noteSize / 2), y: Math.round(origin.y + (yKeys + cardH / 2) / 2) },
    size: { w: IDEA_COL + (nBeats + 2) * colW + cardW + 2 * pad, h: yFilm + cardH + 2 * pad },
  };
}
/** The stitch request for the finished film: the clips in shot order, the music bed, the voice. Clip job ids only; null when a clip is missing. */
export function stitchBody(clipJobs: (string | null | undefined)[], musicJob: string | null | undefined, voiceJob: string | null | undefined, title: string) {
  const clips = clipJobs.filter((x): x is string => !!x); if (!clips.length || clips.length !== clipJobs.length) return null;
  return { clips, ...(musicJob ? { audio: musicJob } : {}), ...(voiceJob ? { voice: voiceJob } : {}), title: title.slice(0, 80), fadeOutSec: 1.2, videoFade: true };
}
