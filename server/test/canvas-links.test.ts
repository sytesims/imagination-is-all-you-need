// How connections look (web/src/canvas/links.ts): neighbours get a notch and no wire, the magnetic snap (distance, compatibility, where
// it lands), pulling a snapped pair apart unlinks it, threads route around cards, Tidy turns chains into rows, and the reduced-motion
// look. Tidy's single Undo is checked with a stub editor (tidyBoard). Run: cd server && npx tsx test/canvas-links.test.ts
import assert from 'node:assert/strict';
import { isNeighbour, notchAt, snapTarget, pulledApart, routeThread, threadPath, tidyLayout, linkLook, SNAP_PX, SNAP_GAP, UNLINK_PX, type LBox } from '../../web/src/canvas/links.ts';
import { tidyBoard } from '../../web/src/canvas/tidy.ts';
const ok = (m: string) => console.log('ok ' + m);
const C = (id: string, x: number, y: number, w = 340, h = 430): LBox => ({ id, x, y, w, h });

// ---- neighbours: side by side in a row, a small gap, nothing in between → a notch, no wire ----
const a = C('a', 0, 0), b = C('b', 440, 0), far = C('far', 1400, 0), low = C('low', 440, 600), mid = C('mid', 345, 100, 90, 90);
assert.equal(isNeighbour(a, b), true, '100 px apart in a row'); assert.equal(isNeighbour(b, a), false, 'flow reads left to right');
assert.equal(isNeighbour(a, far), false, 'too far: a thread'); assert.equal(isNeighbour(a, low), false, 'another row: a thread');
assert.equal(isNeighbour(a, b, [mid]), false, 'something in between: a thread'); assert.equal(isNeighbour(a, C('b2', 440, 120)), true, 'a little offset still reads as a row');
assert.deepEqual(notchAt(a, b), { x: 390, y: 215, x1: 340, x2: 440 });
ok('neighbours: side by side, left to right, nothing between → notch; otherwise a thread');

// ---- magnetic snap ----
const can = (f: string, t: string) => !(f === 'music' || t === 'pic2' && f === 'clip');
const target = C('t', 0, 0);
const near = snapTarget(C('d', 340 + SNAP_GAP + 40, 30), [target], can); assert.deepEqual(near && { from: near.from, to: near.to, x: near.x, y: near.y }, { from: 't', to: 'd', x: 440, y: 0 }, 'dropped 40 px off: it clicks in beside, fed by the left card');
assert.equal(snapTarget(C('d', 340 + SNAP_GAP + SNAP_PX + 5, 0), [target], can), null, `more than ${SNAP_PX} px off: no snap`);
const left = snapTarget(C('d', -340 - SNAP_GAP - 20, 0), [target], can); assert.deepEqual(left && { from: left.from, to: left.to, x: left.x }, { from: 'd', to: 't', x: -440 }, 'on the left: it feeds the card');
assert.equal(snapTarget(C('music', 340 + SNAP_GAP, 0), [C('pic', 0, 0)], (f) => f !== 'music' && false), null, 'incompatible (typed ports say no): no snap');
assert.equal(snapTarget(C('d', 440, 900), [target], can), null, 'not level with it: no snap');
const two = snapTarget(C('d', 440 + 10, 0), [C('t1', 0, 0), C('t2', 0 + 900, 0)], can); assert.equal(two?.id, 't1', 'the nearest side wins');
assert.equal(pulledApart(C('f', 0, 0), C('g', 440, 0)), false); assert.equal(pulledApart(C('f', 0, 0), C('g', 340 + UNLINK_PX + 20, 0)), true, 'pulled apart: the snapped link lets go');
assert.equal(pulledApart(C('f', 0, 0), C('g', 440, 700)), true, 'dragged to another row: lets go');
ok('snap: within 60 px of a compatible side, lands 100 px beside it, nearest wins; pulled apart → unlink');

// ---- threads route around cards ----
const blockers = [C('x1', 600, -100, 340, 700), C('x2', 1100, 500)];
for (const [f, t] of [[C('s', 0, 0), C('e', 1600, 0)], [C('s', 0, 0), C('e', 1600, 900)], [C('s', 1600, 0), C('e', 0, 600)]] as [LBox, LBox][]) {
  const pts = routeThread(f, t, [f, t, ...blockers]);
  assert.deepEqual(pts[0], { x: f.x + f.w, y: f.y + f.h / 2 }); assert.deepEqual(pts.at(-1), { x: t.x, y: t.y + t.h / 2 });
  for (let i = 1; i < pts.length; i++) { const p = pts[i - 1], q = pts[i]; assert.ok(p.x === q.x || p.y === q.y, 'right angles only');
    for (const o of blockers) { const seg = { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(q.x - p.x) || 1, h: Math.abs(q.y - p.y) || 1 };
      assert.ok(!(seg.x < o.x + o.w && seg.x + seg.w > o.x && seg.y < o.y + o.h && seg.y + seg.h > o.y), `segment ${i} crosses ${o.id}`); } }
  assert.match(threadPath(pts), /^M .* Q .* L /, 'rounded corners');
}
ok('threads: right angles with rounded corners, never through a card (also backwards and across rows)');

// ---- Tidy: chains become rows (every link a neighbour); a single Undo puts it back ----
const cards = [C('k1', 900, 800), C('c1', 0, 0), C('k2', 300, 1500), C('c2', 1800, 2200), C('m', 2600, 40), C('lone', 50, 3000)];
const links = [{ id: 'l1', from: 'k1', to: 'c1' }, { id: 'l2', from: 'c1', to: 'm' }, { id: 'l3', from: 'k2', to: 'c2' }, { id: 'l4', from: 'k1', to: 'k2' }];
const pos = tidyLayout(cards, links); const moved = cards.map((c) => ({ ...c, ...pos[c.id] }));
const by = Object.fromEntries(moved.map((c) => [c.id, c]));
assert.ok(isNeighbour(by.k1, by.c1, moved) && isNeighbour(by.c1, by.m, moved), 'first chain: one row, left to right');
assert.ok(isNeighbour(by.k2, by.c2, moved), 'the branch: a row of its own');
assert.ok(by.k2.y > by.k1.y && by.lone.y > by.k2.y, 'rows stack downward; a card with no links gets its own row');
for (let i = 0; i < moved.length; i++) for (let j = i + 1; j < moved.length; j++) { const p = moved[i], q = moved[j]; assert.ok(!(p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y), `${p.id} and ${q.id} overlap`); }
assert.deepEqual(tidyLayout(cards, links), pos, 'the same board tidies the same way');
const marks: string[] = []; const updates: any[] = [];
const ed: any = { markHistoryStoppingPoint: (n: string) => { marks.push(n); return 'm'; }, run: (f: () => void) => f(), updateShapes: (u: any[]) => updates.push(...u) };
const n = tidyBoard(ed, cards.map((c) => ({ ...c, type: 'ohf-gen' })), links); assert.equal(n, Object.keys(pos).filter((id) => pos[id].x !== cards.find((c) => c.id === id)!.x || pos[id].y !== cards.find((c) => c.id === id)!.y).length);
assert.deepEqual(marks, ['tidy'], 'one history mark: one Undo puts the board back'); assert.ok(updates.every((u) => pos[u.id] && u.x === pos[u.id].x && u.y === pos[u.id].y));
ok('Tidy: chains become rows of neighbours, branches below, nothing overlaps, deterministic, one Undo');

// ---- reduced motion ----
assert.deepEqual(linkLook({ reduced: true, lit: false, flowing: true, running: true }), { opacity: 0.32, pulse: false, dust: false }, 'reduced motion: no pulse, no dust, a calm fixed opacity');
assert.deepEqual(linkLook({ reduced: true, lit: true, flowing: false, running: false }).pulse, false);
assert.deepEqual(linkLook({ reduced: false, lit: false, flowing: false, running: false }), { opacity: 0.15, pulse: false, dust: false }, 'idle: a nearly invisible thread, never dust');
assert.equal(linkLook({ reduced: false, lit: false, flowing: false, running: true }).dust, true, 'dust only while a run passes media');
assert.equal(linkLook({ reduced: false, lit: false, flowing: true, running: false }).pulse, true, 'a pulse when media flows');
ok('look: idle threads at 15%, pulses when media flows or the chain is lit, dust only during runs; reduced motion: none of it');
console.log('canvas-links: all ok');
process.exit(0);
