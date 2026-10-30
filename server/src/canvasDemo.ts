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

export interface DemoCard { key: string; name: string; workflow: string; prompt: string; col: number; row: number; from?: string[]; settings?: Record<string, string> }
export interface DemoPhase { frame: string; say: string; cards: DemoCard[]; note: string; done: string; /** what the cards are, plural ("key frames"), for the agent's words when some fail */ what?: string; /** after the run: ask the user to pick one of these cards */ pick?: string }
export interface DemoPlan { id: string; title: string; /** the sticky note the agent starts with: the idea in a few words */ idea: string; intro: string; steps: string[]; phases: DemoPhase[]; outro: string }

/** The dock's starter chips. `prompt` is what the chip sends; the user can also type anything. */
export const DEMO_STARTERS = [
  { id: 'short', label: 'Short film from idea', prompt: 'A short film: on the night the town turns off the last harbor lamp, a girl sets a paper boat on the water, and every dark window answers.' },
  { id: 'film', label: 'Make a 30s film', prompt: 'Make a 30s film: a lighthouse keeper finds a glowing bottle on the shore at dawn.' },
  { id: 'product', label: 'Product shots', prompt: 'Product shots for a matte orange water bottle: hero, lifestyle, detail and flat lay.' },
  { id: 'storyboard', label: 'Storyboard from a script', prompt: 'Storyboard from a script:\nINT. NIGHT MARKET – A girl buys a paper lantern. It lifts her off the ground. She floats over the stalls, laughing, and lands on a rooftop where an old man is waiting with tea.' },
  { id: 'mood', label: 'Mood board', prompt: 'A mood board for a desert sci-fi short: palette, wardrobe, set and light.' },
] as const;
export type DemoStarterId = (typeof DEMO_STARTERS)[number]['id'];

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
/** What the user asked for, without the starter's lead-in ("Make a 30s film: …" → "…"). */
function subjectOf(prompt: string, fallback: string): string {
  const s = clean(prompt.replace(/^(make|create|build|do)?\s*(a|an|the)?\s*(30\s*s(ec(ond)?s?)?|thirty[- ]second)?\s*(film|movie|short|trailer|product shots?|storyboard( from a script)?|mood ?board)\s*(for|of|about)?\s*[:,-]?\s*/i, ''));
  /* "a water bottle: hero, lifestyle, detail" → the subject is before the colon; the list after it is the plan's own job */
  const c = s.indexOf(':'); const subject = c > 0 && s.slice(c + 1).includes(',') ? s.slice(0, c) : s;
  return (subject.trim() || fallback).replace(/[.\s]+$/, '').slice(0, 220);
}
/** The starter a prompt matches (a chip sends its id; typed text is matched by its words). */
export function detectStarter(prompt: string, starter?: string | null): DemoStarterId | 'free' {
  if (starter && DEMO_STARTERS.some((s) => s.id === starter)) return starter as DemoStarterId;
  const p = prompt.toLowerCase();
  if (/\bshort film\b|\bfilm from (an |my )?idea\b|\bfrom (an|my) idea\b/.test(p)) return 'short'; /* the flagship (shortFilmPlan) */
  if (/\bstoryboard\b|\bscript\b|\bint\.|\bext\./.test(p)) return 'storyboard'; /* whole words: "description" is not a script */
  if (/\bfilm\b|movie|trailer|\bshort\b|\bscene/.test(p)) return 'film';
  if (/product|packshot|bottle|sneaker|e-?commerce/.test(p)) return 'product';
  if (/mood ?board|palette|look ?book/.test(p)) return 'mood';
  return 'free';
}
/** Script → panels: one per sentence (at most six), so the storyboard follows the beats the user wrote. */
function beatsOf(script: string): string[] {
  const body = script.replace(/^storyboard( from a script)?\s*:?/i, '').replace(/^(INT|EXT)\.[^–-]*[–-]\s*/m, '');
  const scene = (script.match(/(INT|EXT)\.\s*([^–\n-]+)/) ?? [])[2]?.trim();
  const out = clean(body).split(/(?<=[.!?])\s+/).map((x) => x.replace(/[.!?]+$/, '').trim()).filter((x) => x.length > 3).slice(0, 6);
  return (out.length ? out : ['The hero arrives', 'Something unexpected happens', 'The hero reacts', 'The ending']).map((b) => (scene ? `${b}, ${scene.toLowerCase()}` : b));
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
  const kind = detectStarter(prompt, starter);
  if (kind === 'film' || kind === 'short') { /* 'short' plays shortFilmPlan (canvasAgent.runShortFilm); this is its classic fallback */
    const subject = subjectOf(prompt, 'a lighthouse keeper finds a glowing bottle on the shore at dawn');
    const frames: DemoCard[] = FILM_SHOTS.map(([name, look], i) => ({ key: `f${i}`, name, workflow: 'create', prompt: `${subject}. ${look}`, col: i, row: 0 }));
    const clips: DemoCard[] = FILM_SHOTS.map(([name], i) => ({ key: `c${i}`, name: `${name} · clip`, workflow: 'video', prompt: `${subject}. ${name.toLowerCase()}, slow cinematic camera move, 6 seconds`, col: i, row: 1, from: [`f${i}`] }));
    return { id: 'film', title: 'A 30 second film', idea: ideaOf(subject), steps: ['Key frames for five shots', 'Five 6 s clips and a music bed', 'Ready to cut'],
      intro: `Here’s the plan for a 30 second film: ${subject}. Five shots of about 6 seconds. I’ll set up a key frame per shot first, then turn each into a clip and add music. Every run waits for your Go.`,
      phases: [
        { frame: 'Key frames', say: 'Setting up five key frames, one per shot.', cards: frames, note: 'Five key frames, one per shot', what: 'key frames', done: 'Key frames are in. Re-roll any shot that misses before we animate.' },
        { frame: 'Clips and music', say: 'Now the clips: each one starts from its key frame, plus a music bed.', cards: [...clips, { key: 'm', name: 'Music bed', workflow: 'music', prompt: `Cinematic score for a 30 second short film: ${subject}. Gentle piano, rising strings, hopeful ending`, col: 5, row: 1, settings: MUSIC_30S }], note: 'Five clips and the music', what: 'cards', done: 'All five clips and the music are on the board.' },
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
        { frame: 'Product shots', say: 'Placing the four shots.', cards: shots.map(([name, look], i) => ({ key: `p${i}`, name, workflow: 'create', prompt: `${subject}, ${look}`, col: i % 2, row: Math.floor(i / 2) })), note: 'Four product shots', what: 'product shots', done: 'Four shots are ready.', pick: 'Pick your hero shot. Click the one you like on the board.' },
        { frame: 'Spin clip', say: 'A 6 second turntable clip from your pick.', cards: [{ key: 'v', name: 'Spin clip', workflow: 'video', prompt: `${subject} slowly rotating on a turntable, studio light, seamless backdrop, 6 seconds`, col: 2, row: 0, from: ['@pick'] }], note: 'A spin clip from your pick', what: 'clips', done: 'The spin clip is done.' },
      ],
      outro: 'The product set is on the board. Open any shot in Create Image to tweak it.' };
  }
  if (kind === 'storyboard') {
    const beats = beatsOf(prompt);
    return { id: 'storyboard', title: 'Storyboard', idea: ideaOf(beats[0] ?? 'Storyboard'), steps: [`${beats.length} panels, one per beat`, 'Pick the key moment', 'Animate it'],
      intro: `I read ${beats.length} beats in your script. One panel per beat, in a consistent hand-drawn storyboard style. Then you pick the moment to animate.`,
      phases: [
        { frame: 'Storyboard', say: 'Drawing the panels in story order.', cards: beats.map((b, i) => ({ key: `s${i}`, name: `Panel ${i + 1}`, workflow: 'create', prompt: `${b}. Pencil and grey marker storyboard sketch, cinematic framing, consistent characters`, col: i % 3, row: Math.floor(i / 3) })), note: `${beats.length} storyboard panels`, what: 'panels', done: 'The panels are in order on the board.', pick: 'Pick the moment to animate. Click its panel on the board.' },
        { frame: 'Animatic', say: 'Animating your pick as a 6 second animatic.', cards: [{ key: 'a', name: 'Animatic', workflow: 'video', prompt: 'Animatic: {pick}. Gentle camera move, storyboard style, 6 seconds', col: 3, row: 0, from: ['@pick'] }], note: 'An animatic of your pick', what: 'clips', done: 'The animatic is ready.' },
      ],
      outro: 'Your storyboard is laid out left to right, top to bottom. Use it as the shot list for a film.' };
  }
  if (kind === 'mood') {
    const subject = subjectOf(prompt, 'a desert sci-fi short');
    const tiles = [['Palette', 'colour palette swatch board, dusty ochre, teal shadows, sun-bleached whites'], ['Wardrobe', 'wardrobe study, layered linen, worn leather, utilitarian gear'],
      ['Set', 'set design, half-buried brutalist structures in dunes, haze'], ['Light', 'lighting reference, low sun, long shadows, heat shimmer'], ['Props', 'prop sheet, weathered tech, hand-made tools'], ['Hero frame', 'hero still, lone figure crossing the dunes at golden hour, epic scale']];
    return { id: 'mood', title: 'Mood board', idea: ideaOf(subject), steps: ['Six mood tiles and a sound bed', 'Ready to share'],
      intro: `A mood board for ${subject}: palette, wardrobe, set, light, props and a hero frame, plus a sound bed to set the tone.`,
      phases: [{ frame: 'Mood board', say: 'Filling the board.', cards: [...tiles.map(([name, look], i) => ({ key: `t${i}`, name, workflow: 'create', prompt: `${subject}, ${look}`, col: i % 3, row: Math.floor(i / 3) })), { key: 'snd', name: 'Sound bed', workflow: 'music', prompt: `Ambient sound bed for ${subject}: wind, low synth drones, distant metal`, col: 3, row: 0, settings: MUSIC_30S }], note: 'Six tiles and a sound bed', what: 'cards', done: 'The mood board is complete.' }],
      outro: 'The mood board is ready. Keep the tiles that fit and Re-roll the rest.' };
  }
  const subject = subjectOf(prompt, 'something beautiful');
  return { id: 'free', title: 'Explore an idea', idea: ideaOf(subject), steps: ['Three versions of the idea', 'Pick one', 'A short clip from your pick'],
    intro: `Let’s explore “${short(subject, 120)}”: three different looks as images. You pick one, and I turn it into a short clip. You approve each run.`,
    phases: [
      { frame: 'Three versions', say: 'Three versions, three different looks.', cards: [['Cinematic', 'cinematic photo, dramatic light'], ['Painterly', 'painterly illustration, rich colour'], ['Poster', 'minimal graphic poster, bold shapes']].map(([name, look], i) => ({ key: `i${i}`, name, workflow: 'create', prompt: `${subject}, ${look}`, col: i, row: 0 })), note: 'Three versions', what: 'versions', done: 'Three versions are on the board.', pick: 'Pick the one you like. Click it on the board.' },
      { frame: 'Clip', say: 'A 6 second clip from your pick.', cards: [{ key: 'v', name: 'Clip', workflow: 'video', prompt: `${subject}, slow cinematic camera move, 6 seconds`, col: 0, row: 1, from: ['@pick'] }], note: 'A clip from your pick', what: 'clips', done: 'The clip is done.' },
    ],
    outro: 'That’s a first pass. Tell me what to change, or open any card in its workflow.' };
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
export interface ShortPlan { id: 'short'; title: string; idea: string; subject: string; intro: string; beats: ShortBeat[]; cast: DemoCard[]; outro: string; videoOff: string }

/** "Opening: the place, quiet and wide…" as a note; the number goes on the card, not in the note. */
export const beatNote = (b: Pick<ShortBeat, 'name' | 'line'>) => `${b.name}: ${b.line}`;
/** A note's text back as a beat: "Name: line" (an edited or new note without a colon is all line). */
export function beatOfNote(text: string, i: number): ShortBeat {
  const t = clean(text); const c = t.indexOf(':'); const name = c > 0 && c <= 32 ? t.slice(0, c).trim() : `Beat ${i + 1}`; const line = c > 0 && c <= 32 ? t.slice(c + 1).trim() : t;
  return { name, line, text: t };
}
export function shortFilmPlan(prompt: string): ShortPlan {
  const subject = subjectOf(prompt.replace(/^(a\s+)?short film( from (an|my) idea)?\s*[:,-]?\s*/i, ''), 'a girl sets a paper boat on the dark harbor and every window answers');
  const words = subject.split(/\s+/).length; const pick = words > 18 ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1, 2, 4, 5, 7];
  const beats = pick.map((k) => { const [name, line] = BEAT_SHAPES[k]; return { name, line, text: beatNote({ name, line }) }; });
  const cast: DemoCard[] = [
    { key: 'hero', name: 'Main character', workflow: 'create', col: 0, row: 0,
      prompt: `Character reference sheet of the main character of this story: ${subject}. Three panels on a plain grey backdrop: front full body, back full body, face close-up. Same person in every panel, soft even light, no text` },
    { key: 'place', name: 'The place', workflow: 'create', col: 1, row: 0, prompt: `Location plate with no people, the main setting of this story: ${subject}. Wide, ${SHORT_LOOK}` },
  ];
  return { id: 'short', title: 'Short film from idea', idea: ideaOf(subject), subject, beats, cast,
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
