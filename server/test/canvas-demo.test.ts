// The canvas demo agent's plans (server/src/canvasDemo.ts): starters are matched, every card uses a canvas workflow, arrows only point
// back to cards of an earlier phase, and the grid never stacks two cards. Pure functions, no server.
// Run: cd server && npx tsx test/canvas-demo.test.ts
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { DEMO_STARTERS, demoPlan, chipPlan, isChip, detectStarter, demoCardAt, demoPlanSize, demoFrameOf, demoNoteAt, demoGridOffset, shortFilmPlan, shortLayout, beatOfNote, keyFramePrompt, stitchBody, shortFilmVideoOn, SHORT_STEPS, CHALK_WHALE } from '../src/canvasDemo.ts';
import { DEMO_MEDIA, demoMediaOf, demoLabel, tagDemoCard, demoRefFor } from '../src/shared/demoMedia.ts';
const ok = (m: string) => console.log('ok ' + m);
const WORKFLOWS = new Set(['create', 'video', 'music', 'extend']);

assert.equal(detectStarter('anything', 'film'), 'film');
assert.equal(detectStarter('Make a short trailer about owls'), 'film');
assert.equal(detectStarter('INT. KITCHEN – She opens the fridge.'), 'free', 'no storyboard plan (2026-10-31)');
assert.equal(detectStarter('a fox in the snow, then extend it'), 'animate'); assert.equal(detectStarter('anything', 'animate'), 'animate');
assert.equal(detectStarter('packshots for my sneaker brand'), 'product');
assert.equal(detectStarter('a mood board for autumn'), 'free', 'no mood board plan (2026-10-31)');
assert.equal(detectStarter('a cat in space'), 'free');
assert.equal(detectStarter('a cat astronaut, with a long description of the light'), 'free', '"description" is not a script');
assert.equal(detectStarter('a cat', 'not-a-starter'), 'free');
ok('starters are matched by id or by the words typed');

const CASES: [string, string | null][] = [...DEMO_STARTERS.map((s): [string, string | null] => [s.prompt, null]), ...DEMO_STARTERS.filter((s) => s.id !== 'short').map((s): [string, string | null] => [s.prompt, s.id]), ['a cat in space', null], ['   ', null], ['x'.repeat(4000), null]];
for (const [prompt, starter] of CASES) {
  const plan = demoPlan(prompt, starter); const seen = new Set<string>(); const cells = new Set<string>();
  assert.ok(plan.steps.length >= 2 && plan.phases.length >= 1 && plan.intro && plan.outro);
  assert.ok(plan.idea.length > 0 && plan.idea.length <= 90, `${plan.id}: the idea note is short`);
  let picked = false;
  for (const ph of plan.phases) {
    const before = new Set(seen); assert.ok(ph.frame.length > 1 && ph.frame.length <= 40, `${plan.id}: every phase has a frame name`);
    for (const c of ph.cards) {
      assert.ok(WORKFLOWS.has(c.workflow), `${plan.id}: ${c.workflow}`); assert.ok(c.prompt.length > 10 && c.prompt.length < 4000); assert.ok(c.name && c.name.length <= 40, `${plan.id}: ${c.key} has a shot name`);
      for (const f of c.from ?? []) assert.ok(f === '@pick' ? picked : before.has(f), `${plan.id}: ${c.key} feeds from ${f}, which is not from an earlier phase (or no pick came before)`);
      if (c.workflow === 'music') assert.ok(Number(c.settings?.duration) >= 30, `${plan.id}: the music card asks for 30 s or more (MiniMax Music 3 / YuE2)`);
      const cell = `${c.col}:${c.row}`; assert.ok(!cells.has(cell), `${plan.id}: two cards at ${cell}`); cells.add(cell); seen.add(c.key);
    }
    if (ph.pick) { assert.ok(ph.cards.length >= 2, `${plan.id}: a pick needs at least two versions`); picked = true; }
  }
  /* frames of different phases never overlap, and the idea note sits left of the grid */
  const o = { x: 0, y: 0 }; const fr = plan.phases.map((ph) => demoFrameOf(o, ph));
  for (let i = 0; i < fr.length; i++) for (let j = i + 1; j < fr.length; j++) { const a = fr[i], b = fr[j];
    assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${plan.id}: frames ${i} and ${j} overlap`); }
  assert.ok(demoNoteAt(o).x + 130 < Math.min(...fr.map((f) => f.x)), `${plan.id}: the note is left of the frames`);
  assert.ok(demoPlanSize(plan).w >= Math.max(...fr.map((f) => f.x + f.w)) + demoGridOffset().x - 1, `${plan.id}: the plan size holds the note and every frame`);
}
ok('every plan: an idea note, a named frame per phase, shot names, inputs from earlier phases or the pick, music ≥ 30 s, frames never overlap');

const film = demoPlan(DEMO_STARTERS.find((s) => s.id === 'film')!.prompt); // typed: the general plan (the chip's own is below)
assert.equal(film.phases[0].cards.length, 5); assert.equal(film.phases[1].cards.filter((c) => c.workflow === 'video').length, 5);
assert.ok(film.phases[1].cards.some((c) => c.workflow === 'music'));
assert.match(film.phases[0].cards[0].prompt, /lighthouse keeper/); assert.doesNotMatch(film.phases[0].cards[0].prompt, /Make a 30s film/);
assert.equal(film.phases[0].cards[0].name, 'Wide establishing shot'); assert.doesNotMatch(film.phases[0].cards[0].prompt, /^Wide establishing shot:/, 'the shot name is on the card, not in the prompt');
for (const prompt of ['Product shots for a red kettle: hero, detail', 'a cat in space']) { const pl = demoPlan(prompt);
  assert.ok(pl.phases[0].pick, `${pl.id}: the versions wait for your pick`); assert.deepEqual(pl.phases[1].cards[0].from, ['@pick'], `${pl.id}: only your pick goes on`); }
assert.deepEqual(demoPlan('make it longer: a fox in the snow').phases[1].cards[0].from, ['v'], 'animate: Extend runs on the clip');
assert.ok(!film.phases.some((p) => p.pick), 'the film animates every shot (no pick)');
assert.match(demoPlan('Product shots for a matte orange water bottle: hero, lifestyle, detail and flat lay.').intro, /for a matte orange water bottle: hero, lifestyle/);
assert.doesNotMatch(demoPlan('Product shots for a red kettle: hero, detail').phases[0].cards[0].prompt, /hero, detail/);
ok('film: five key frames, five clips from them and music; typed product and free wait for a pick; a clip, then Extend on it');

assert.deepEqual(demoCardAt({ x: 0, y: 0 }, 0, 0), { x: 170, y: 215 }); // cards are 340 × 430
assert.deepEqual(demoFrameOf({ x: 0, y: 0 }, { cards: [{ col: 0, row: 0 }, { col: 1, row: 0 }] as any }), { x: -36, y: -36, w: 440 + 340 + 72, h: 430 + 72 });
const size = demoPlanSize(film); assert.ok(size.w > 5 * 340 && size.h > 2 * 430);
ok('grid positions and plan size');

// ---- Short film from idea (the flagship) ----
assert.equal(DEMO_STARTERS[0].id, 'short', 'the flagship is the first starter');
assert.equal(detectStarter('A short film: a fox finds a lantern'), 'short'); assert.equal(detectStarter('Make a film from my idea: two kites'), 'short'); assert.equal(detectStarter('Make a 30s film: a cat'), 'film');
assert.deepEqual([...SHORT_STEPS], ['Beats', 'Cast', 'Key frames', 'Film']);
const sp = shortFilmPlan('A short film: on the night the town turns off the last harbor lamp, a girl sets a paper boat on the water, and every dark window answers.'); assert.equal(sp.beats.length, 8, 'a long line: eight beats'); assert.equal(shortFilmPlan('A short film: a robot learns to whistle').beats.length, 6, 'a short idea: six beats'); assert.doesNotMatch(sp.subject, /^a short film/i); assert.match(sp.subject, /paper boat/);
assert.equal(shortFilmPlan(`A short film: ${'the old clockmaker and the girl who keeps time walk the flooded city at night looking for the bell that stopped ringing when the river rose'}`).beats.length, 8, 'a longer idea gets eight beats');
assert.ok(sp.beats.every((b) => b.name && b.line && b.text.startsWith(`${b.name}:`))); assert.equal(sp.cast.length, 2); assert.ok(sp.cast.every((c) => c.workflow === 'create'));
assert.deepEqual(beatOfNote('The turn: the lamp dies', 4), { name: 'The turn', line: 'the lamp dies', text: 'The turn: the lamp dies' });
assert.deepEqual(beatOfNote('she laughs at the rain', 2), { name: 'Beat 3', line: 'she laughs at the rain', text: 'she laughs at the rain' }, 'a note without a name is all line');
assert.match(keyFramePrompt(sp.subject, beatOfNote('The turn: the lamp dies', 4)), /the lamp dies.*character sheet/);
const lay = shortLayout({ x: 0, y: 0 }, 6); const fr2 = Object.values(lay.frames);
for (let i = 0; i < fr2.length; i++) for (let j = i + 1; j < fr2.length; j++) { const a = fr2[i], b = fr2[j]; assert.ok(a.y + a.h <= b.y || b.y + b.h <= a.y, `short film rows ${i} and ${j} overlap`); }
assert.ok(lay.key(0).y > lay.cast(0).y && lay.clip(0).y > lay.key(0).y && lay.key(3).x === lay.clip(3).x && lay.beat(3).x === lay.key(3).x, 'beats, cast, key frames, film top to bottom; each shot in its own column');
assert.ok(lay.size.w >= lay.frames.film.x + lay.frames.film.w && lay.size.h >= lay.frames.film.y + lay.frames.film.h, 'the free area holds every frame');
assert.equal(stitchBody(['j1', null], 'm', 'v', 'x'), null, 'no stitch while a clip is missing'); assert.equal(stitchBody([], null, null, 'x'), null);
assert.deepEqual(stitchBody(['j1', 'j2'], 'm', null, 'Harbor'), { clips: ['j1', 'j2'], audio: 'm', title: 'Harbor', fadeOutSec: 1.2, videoFade: true }, 'clips in shot order, music bed, title');
assert.equal(shortFilmVideoOn({}), false, 'video runs are off by default'); assert.equal(shortFilmVideoOn({ OPENHIGGSFIELD_CANVAS_VIDEO: '1' }), true);
ok('short film: the flagship starter, 6 or 8 beats, notes read back as beats, rows never overlap, stitch only with every clip, video off by default');

// ---- The chips' own boards: the maintainer's real runs (shared/demoMedia.ts) ----
const PUB = path.resolve(import.meta.dirname, '../../web/public');
for (const [recipe, cards] of Object.entries(DEMO_MEDIA)) for (const [key, m] of Object.entries(cards)) {
  assert.ok(existsSync(path.join(PUB, m.url)), `${recipe}:${key}: ${m.url} ships`); if (m.poster) assert.ok(existsSync(path.join(PUB, m.poster)), `${recipe}:${key}: poster ${m.poster} ships`);
  assert.ok(m.model && m.place && m.costUsd >= 0, `${recipe}:${key}: credited`); assert.doesNotMatch(m.url, /[0-9a-f]{8}/, `${recipe}:${key}: no job id in the file name`); }
assert.equal(demoLabel(DEMO_MEDIA.short.c1), 'Sample · made with LTX-2.5 22B'); assert.equal(demoLabel(DEMO_MEDIA.takes.dive), 'Sample · made with LTX-2.5 Pro');
assert.equal(demoMediaOf('short:nope'), null); assert.equal(demoMediaOf('x'), null);
for (const s of DEMO_STARTERS.filter((x) => x.id !== 'short')) { const pl = chipPlan(s.id)!; assert.ok(pl, `${s.id}: a chip plan`); const prompts = new Set<string>();
  for (const c of pl.phases.flatMap((p) => p.cards)) { assert.ok(c.ref && demoMediaOf(c.ref), `${s.id}: ${c.key} shows a real run`); assert.ok(!prompts.has(c.prompt), `${s.id}: prompts tell the cards apart`); prompts.add(c.prompt); } }
assert.deepEqual(chipPlan('film')!.phases[1].cards.map((c) => c.key), ['c0', 'c1', 'm'], 'the 30s film: only shots 1 and 2 were animated');
{ const t = chipPlan('takes')!; assert.deepEqual(t.phases.flatMap((p) => p.cards).map((c) => c.workflow), ['create', 'video', 'video', 'video'], 'one picture, three takes, no sound card');
  assert.deepEqual(t.phases[1].cards.map((c) => c.from), [['picture'], ['picture'], ['picture']], 'every take starts from the picture');
  assert.deepEqual(t.phases[1].cards.map((c) => c.name), t.phases[1].cards.map((c) => `${demoMediaOf(c.ref)!.model} · ${Math.round(demoMediaOf(c.ref)!.sec!)} s`), 'each take is named by its real model and length'); }
assert.equal(chipPlan('nope'), null);
const chalk = shortFilmPlan(DEMO_STARTERS[0].prompt, true); assert.equal(chalk.beats.length, CHALK_WHALE.demo.keys.length); assert.deepEqual(chalk.cast.map((c) => c.ref), ['short:place', 'short:whale']);
for (const c of CHALK_WHALE.demo.clips) { assert.ok(demoMediaOf(`short:${c.key}`), c.key); for (const f of c.from) assert.ok(/^k[0-5]$/.test(f) || chalk.cast.some((x) => x.key === f), `${c.key} from ${f}`); }
assert.ok(CHALK_WHALE.demo.keys.every((k, i) => demoMediaOf(`short:k${i}`) && k.from.every((f) => f === 'place' || f === 'whale' || Number(f.slice(1)) < i)), 'key frames wire only from the cast or an earlier shot');
assert.equal(shortFilmPlan(DEMO_STARTERS[0].prompt).demo, undefined, 'typed words: the general plan');
tagDemoCard('brd_a', ' A  harbour ', 'short:place'); assert.equal(demoRefFor('brd_a', 'A harbour'), 'short:place'); assert.equal(demoRefFor('brd_b', 'A harbour'), null); assert.equal(demoRefFor('brd_a', 'A harbour, edited'), null);
tagDemoCard('brd_a', 'x', 'short:nope'); assert.equal(demoRefFor('brd_a', 'x'), null);
assert.ok(isChip('takes', DEMO_STARTERS[4].prompt) && !isChip('takes', 'A glass whale, three takes') && !isChip(null, DEMO_STARTERS[4].prompt), 'only the chip itself, unedited');
assert.equal(demoPlan('Product shots for a red kettle', 'product').id, 'product'); assert.ok(demoPlan('Product shots for a red kettle', 'product').phases[0].pick, 'a chip id with other words: the general plan');
/* the demo media folder stays small: stills ≤ 400 KB, clips ≤ 3 MB, the folder ≤ 12 MB */
const DIR = path.join(PUB, 'examples/demo'); let total = 0;
for (const r of readdirSync(DIR)) for (const f of readdirSync(path.join(DIR, r))) { const n = statSync(path.join(DIR, r, f)).size; total += n;
  assert.ok(n < (f.endsWith('.mp4') ? 3_000_000 : 400_000), `examples/demo/${r}/${f}: ${n} B`); }
assert.ok(total < 12_000_000, `examples/demo: ${total} B`);
ok('chips: every card shows a shipped real run with its model; wiring only from real inputs; a changed prompt is no longer the demo');
console.log('canvas-demo: all ok');
