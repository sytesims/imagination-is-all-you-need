// The canvas demo agent's plans (server/src/canvasDemo.ts): starters are matched, every card uses a canvas workflow, arrows only point
// back to cards of an earlier phase, and the grid never stacks two cards. Pure functions, no server.
// Run: cd server && npx tsx test/canvas-demo.test.ts
import assert from 'node:assert/strict';
import { DEMO_STARTERS, demoPlan, detectStarter, demoCardAt, demoPlanSize, demoFrameOf, demoNoteAt, demoGridOffset, shortFilmPlan, shortLayout, beatOfNote, keyFramePrompt, stitchBody, shortFilmVideoOn, SHORT_STEPS } from '../src/canvasDemo.ts';
const ok = (m: string) => console.log('ok ' + m);
const WORKFLOWS = new Set(['create', 'video', 'music']);

assert.equal(detectStarter('anything', 'film'), 'film');
assert.equal(detectStarter('Make a short trailer about owls'), 'film');
assert.equal(detectStarter('INT. KITCHEN – She opens the fridge.'), 'storyboard');
assert.equal(detectStarter('packshots for my sneaker brand'), 'product');
assert.equal(detectStarter('a mood board for autumn'), 'mood');
assert.equal(detectStarter('a cat in space'), 'free');
assert.equal(detectStarter('a cat astronaut, with a long description of the light'), 'free', '"description" is not a script');
assert.equal(detectStarter('a cat', 'not-a-starter'), 'free');
ok('starters are matched by id or by the words typed');

for (const prompt of [...DEMO_STARTERS.map((s) => s.prompt), 'a cat in space', '   ', 'x'.repeat(4000)]) {
  const plan = demoPlan(prompt); const seen = new Set<string>(); const cells = new Set<string>();
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

const film = demoPlan(DEMO_STARTERS.find((s) => s.id === 'film')!.prompt, 'film');
assert.equal(film.phases[0].cards.length, 5); assert.equal(film.phases[1].cards.filter((c) => c.workflow === 'video').length, 5);
assert.ok(film.phases[1].cards.some((c) => c.workflow === 'music'));
assert.match(film.phases[0].cards[0].prompt, /lighthouse keeper/); assert.doesNotMatch(film.phases[0].cards[0].prompt, /Make a 30s film/);
assert.equal(film.phases[0].cards[0].name, 'Wide establishing shot'); assert.doesNotMatch(film.phases[0].cards[0].prompt, /^Wide establishing shot:/, 'the shot name is on the card, not in the prompt');
for (const id of ['product', 'storyboard', 'free'] as const) { const pl = demoPlan(DEMO_STARTERS.find((x) => x.id === id)?.prompt ?? 'a cat in space', id === 'free' ? null : id);
  assert.ok(pl.phases[0].pick, `${id}: the versions wait for your pick`); assert.deepEqual(pl.phases[1].cards[0].from, ['@pick'], `${id}: only your pick goes on`); }
assert.ok(!film.phases.some((p) => p.pick), 'the film animates every shot (no pick)');
const sb = demoPlan('Storyboard from a script:\nINT. ROOF – A. B goes. C runs! D sits. E. F waves. G laughs. H ends.', 'storyboard');
assert.ok(sb.phases[0].cards.length <= 6 && sb.phases[0].cards.length >= 4, 'at most six panels');
assert.match(demoPlan('Product shots for a matte orange water bottle: hero, lifestyle, detail and flat lay.').intro, /for a matte orange water bottle: hero, lifestyle/);
assert.doesNotMatch(demoPlan('Product shots for a red kettle: hero, detail').phases[0].cards[0].prompt, /hero, detail/);
ok('film: five key frames, five clips from them and music; storyboard: one panel per beat, at most six; product, storyboard and free wait for a pick');

assert.deepEqual(demoCardAt({ x: 0, y: 0 }, 0, 0), { x: 170, y: 215 }); // cards are 340 × 430
assert.deepEqual(demoFrameOf({ x: 0, y: 0 }, { cards: [{ col: 0, row: 0 }, { col: 1, row: 0 }] as any }), { x: -36, y: -36, w: 440 + 340 + 72, h: 430 + 72 });
const size = demoPlanSize(film); assert.ok(size.w > 5 * 340 && size.h > 2 * 430);
ok('grid positions and plan size');

// ---- Short film from idea (the flagship) ----
assert.equal(DEMO_STARTERS[0].id, 'short', 'the flagship is the first starter');
assert.equal(detectStarter('A short film: a fox finds a lantern'), 'short'); assert.equal(detectStarter('Make a film from my idea: two kites'), 'short'); assert.equal(detectStarter('Make a 30s film: a cat'), 'film');
assert.deepEqual([...SHORT_STEPS], ['Beats', 'Cast', 'Key frames', 'Film']);
const sp = shortFilmPlan(DEMO_STARTERS[0].prompt); assert.equal(sp.beats.length, 8, 'the starter is a long line: eight beats'); assert.equal(shortFilmPlan('A short film: a robot learns to whistle').beats.length, 6, 'a short idea: six beats'); assert.doesNotMatch(sp.subject, /^a short film/i); assert.match(sp.subject, /paper boat/);
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
console.log('canvas-demo: all ok');
