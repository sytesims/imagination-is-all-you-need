// Direct a Shot, Add props build mode (2026-10-27; shared/previzPlace.ts): the pure rules behind the ghost, the drag and undo.
// Covers: a floor ray stops at the first wall or building (the shop fronts, the house's walls, the city's buildings) and finds the floor
// otherwise (hills, the diorama's plinth); a spot is pushed clear of walls and kept on the set, and one that had to move far is "not here";
// the open city says when a spot is on the road; a new footprint steps clear of what is placed; turn and size steps; the undo stack
// (undo, redo, quick repeats merged into one step, a new change clears redo, the cap); everything is deterministic.
// Run: npx tsx test/previz-place.test.ts   (pure: no server, no network)
import assert from 'node:assert/strict';
const L = await import('../src/shared/previzPlace.ts');
const P = await import('../src/shared/previzTemplates.ts');
const { openCityWorld } = await import('../src/shared/world/openCity.ts');
const { isRoadTile, tileOf } = await import('../src/shared/world/cityGen.ts');
const ok = (m: string) => console.log('ok ' + m);
const near = (a: number, b: number, e = 1e-3) => Math.abs(a - b) <= e;

// ---- 1. the floor ray ----
{ /* walk-by: looking at the shop fronts from the street, the ray stops on the pavement in front of them, never behind */
  const h = L.rayToGround('walk-by', [-5.12, 1.5, 6.5], [1.68, -0.9, -6.5]); assert.ok(h); assert.equal(h!.wall, true); assert.ok(h!.z > -2.71, `in front of the shops: ${h!.z}`);
  /* looking down at the road: the floor */
  const g = L.rayToGround('walk-by', [0, 1.5, 6], [0, -1, -1]); assert.ok(g && !g.wall); assert.ok(near(g!.z, 4.5, 0.02), `floor hit ${g!.z}`);
  /* at the sky: nothing */ assert.equal(L.rayToGround('walk-by', [0, 1.5, 6], [0, 1, 0.3]), null);
  /* the house: a ray at the side wall stops inside the house */
  const w = L.rayToGround('walkthrough', [0, 1.5, 2], [-1, -0.05, -0.3]); assert.ok(w); assert.ok(Math.abs(w!.x) <= 2.45, `inside: ${w!.x}`);
  /* through the living-room door (|x| < 0.75) the floor beyond the inner wall is reachable */
  const d = L.rayToGround('walkthrough', [0, 1.5, 2], [0, -0.35, -1]); assert.ok(d && !d.wall && d.z < 0, `through the door: ${JSON.stringify(d)}`);
  /* the diorama's plinth top (0.32) and the establishing hills: the hit stands on the floor */
  const p = L.rayToGround('diorama', [0, 4, 6], [0, -1, -1.5])!; assert.ok(near(P.groundAt('diorama', p.x, p.z), 0.32)); 
  const e = L.rayToGround('establishing', [0, 6, 12], [0, -0.5, -1])!; assert.ok(e && !e.wall);
  /* the city: the default camera looks along the plaza; a ray down to the pavement finds the floor, one into a building stops in front of it */
  const W = openCityWorld(); const c = P.cameraAt(P.normalizePlanShot({ template: 'open-city' }), 0);
  const f = L.rayToGround('open-city', c.pos, [0, -0.3, -1])!; assert.ok(f && !f.wall); assert.ok(near(f.z, c.pos[2] - c.pos[1] / 0.3, 1.5));
  const b = W.boxes.find((x) => x.y1 - x.y0 > 6 && x.x1 - x.x0 > 4)!; const mid: [number, number, number] = [(b.x0 + b.x1) / 2, 2, b.z1 + 10];
  const hb = L.rayToGround('open-city', mid, [0, -0.02, -1])!; assert.ok(hb.wall, 'a building stops the ray'); assert.ok(hb.z >= b.z1 - 1e-3, `in front of the building: ${hb.z} vs ${b.z1}`);
  ok('floor ray: stops at shop fronts, house walls and buildings; finds the floor, plinth and hills; null at the sky'); }

// ---- 2. fitting a spot ----
{ /* the house: a footprint against the side wall is pushed in (ok); far outside it is "not here" */
  const a = L.fitSpot('walkthrough', 2.4, -3, 0.5); assert.ok(a.ok); assert.ok(near(a.x, 1.94)); 
  const b = L.fitSpot('walkthrough', 6, -3, 0.5); assert.equal(b.ok, false); assert.ok(b.why);
  /* the inner wall: it steps to the side it was on, unless it fits the door */
  const c = L.fitSpot('walkthrough', 1.6, 0.1, 0.4); assert.ok(c.z >= 0.46 - 1e-3, `hall side: ${c.z}`);
  const d = L.fitSpot('walkthrough', 0, 0.02, 0.3); assert.ok(near(d.z, 0.02), 'fits through the door');
  /* the diorama: pulled onto the plinth; far off it is red */
  const e = L.fitSpot('diorama', 3.9, 0, 0.1); assert.ok(e.ok && e.x <= 3.85 + 1e-3);
  const f = L.fitSpot('diorama', 6, 0, 0.1); assert.equal(f.ok, false); assert.ok(Math.hypot(f.x, f.z) <= 3.95);
  /* walk-by: never inside the shops */
  const g = L.fitSpot('walk-by', 0, -4, 0.6); assert.ok(g.z >= -2.62 + 0.6 - 1e-3); assert.equal(g.ok, false); assert.ok(L.fitSpot('walk-by', 0, -2.3, 0.6).ok);
  /* the city: inside a building is pushed out; deep inside is "not here"; a road tile says so */
  const W = openCityWorld(); const bx = W.boxes.find((x) => x.x1 - x.x0 > 8 && x.z1 - x.z0 > 8)!; const cx = (bx.x0 + bx.x1) / 2, cz = (bx.z0 + bx.z1) / 2;
  const h = L.fitSpot('open-city', cx, cz, 0.5); assert.equal(h.ok, false); assert.ok(h.x <= bx.x0 || h.x >= bx.x1 || h.z <= bx.z0 || h.z >= bx.z1, 'pushed out of the box');
  const edge = L.fitSpot('open-city', bx.x0 + 0.2, cz, 0.5); assert.ok(edge.ok, 'just inside the wall: slides out'); assert.ok(edge.x <= bx.x0 + 1e-3);
  const roads = W.spec.pieces.filter((p) => p.k.startsWith('kk.road') && isRoadTile(...tileOf(p.x, p.z)));
  const clear = roads.map((p) => L.fitSpot('open-city', p.x, p.z, 0.4)).filter((x) => x.ok && x.moved === 0); assert.ok(clear.length > 10, 'open road tiles');
  assert.ok(clear.every((x) => x.road === true), 'the middle of a road says so');
  const pave = L.fitSpot('open-city', -30, -100, 0.4); assert.ok(pave.ok);
  /* same in → same out */ assert.deepEqual(L.fitSpot('open-city', cx, cz, 0.5), h); assert.deepEqual(L.fitSpot('walkthrough', 2.4, -3, 0.5), a);
  ok('fit spot: pushed clear of walls, onto the set; far = not here; road flagged; deterministic'); }

// ---- 3. a free spot, turn and size steps ----
{ const taken = [{ x: 0, z: 0, r: 1 }]; const [x, z] = L.nearestFree(0, 0, 0.5, taken); assert.ok(Math.hypot(x, z) >= (1 + 0.5) * 0.8 - 1e-3);
  assert.deepEqual(L.nearestFree(5, 5, 0.5, taken), [5, 5], 'already free: unchanged');
  const [ox, oz] = L.nearestFree(0, 0, 0.5, taken, (px) => px < 0); assert.ok(ox < 0); void oz;
  assert.ok(near(L.turnBy(0, 1), Math.PI / 12, 1e-4)); assert.ok(near(L.turnBy(0, -1, true), -Math.PI / 36, 1e-4)); assert.ok(Math.abs(L.turnBy(Math.PI - 0.01, 1)) <= Math.PI, 'wrapped');
  assert.equal(L.sizeBy(1, L.sizeStep(1), 0.05, 4), 1.1); assert.equal(L.sizeBy(1, L.sizeStep(-1, true), 0.05, 4), 0.98); assert.equal(L.sizeBy(3.9, 2, 0.05, 4), 4); assert.equal(L.sizeBy(0.06, 0.1, 0.05, 4), 0.05);
  assert.equal(L.snapGrid(1.26, 0.5), 1.5); assert.equal(L.snapGrid(-0.24, 0.5), 0);
  ok('nearest free spot, turn and size steps, grid snap'); }

// ---- 4. undo / redo ----
{ const A = { props: [], models: [] }; const B = { props: [{ k: 'kk.bench', x: 1, z: 2, r: 0, s: 1 }], models: [] };
  const C = { props: [{ k: 'kk.bench', x: 3, z: 2, r: 0, s: 1 }], models: [] };
  let st = L.emptyUndo(); assert.equal(L.undoStep(st, A).snap, null, 'nothing to undo');
  st = L.recordUndo(st, A, 'place', 0); /* now B */ st = L.recordUndo(st, B, 'move', 100); /* now C */
  let u = L.undoStep(st, C); assert.deepEqual(u.snap, B); st = u.stack; u = L.undoStep(st, B); assert.deepEqual(u.snap, A); st = u.stack;
  assert.equal(L.undoStep(st, A).snap, null);
  let r = L.redoStep(st, A); assert.deepEqual(r.snap, B); st = r.stack; r = L.redoStep(st, B); assert.deepEqual(r.snap, C); st = r.stack; assert.equal(L.redoStep(st, C).snap, null);
  /* a new change after an undo clears redo */
  u = L.undoStep(st, C); st = L.recordUndo(u.stack, B, null, 500); assert.equal(st.future.length, 0);
  /* quick repeats with the same key are one step; a pause or another key starts a new one */
  let q = L.emptyUndo(); q = L.recordUndo(q, A, 'turn:prop:0', 1000); q = L.recordUndo(q, B, 'turn:prop:0', 1300); q = L.recordUndo(q, C, 'turn:prop:0', 1600);
  assert.equal(q.past.length, 1); assert.deepEqual(q.past[0], A, 'one undo goes back to before the first turn');
  q = L.recordUndo(q, C, 'turn:prop:0', 1600 + L.UNDO_MERGE_MS + 1); assert.equal(q.past.length, 2);
  q = L.recordUndo(q, B, 'turn:prop:1', 1600 + L.UNDO_MERGE_MS + 2); assert.equal(q.past.length, 3);
  /* the same snapshot twice is not two steps */ const same = L.recordUndo(L.recordUndo(L.emptyUndo(), A, null, 0), A, null, 5000); assert.equal(same.past.length, 1);
  /* the cap */ let big = L.emptyUndo(); for (let n = 0; n < L.UNDO_MAX + 25; n++) big = L.recordUndo(big, { props: [{ k: 'kk.bench', x: n, z: 0, r: 0, s: 1 }], models: [] }, null, n * 2000);
  assert.equal(big.past.length, L.UNDO_MAX); assert.equal(big.past[0].props[0].x, 25, 'the oldest steps drop off');
  ok('undo stack: undo, redo, merge quick repeats, new change clears redo, no duplicate steps, capped'); }
