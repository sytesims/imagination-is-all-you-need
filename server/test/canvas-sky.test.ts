// Constellations (web/src/canvas/skyMap.ts): far out, a big board draws as a night sky. The threshold, the deterministic grouping from
// frames and shots, the idea links, the gold film flag, and the click-to-zoom camera. Pure functions, no browser.
// Run: cd server && npx tsx test/canvas-sky.test.ts
import assert from 'node:assert/strict';
import { starMap, starsOn, zoomTarget, STAR_ZOOM, STAR_MIN, READABLE_ZOOM, type StarNode, type StarFrame } from '../../web/src/canvas/skyMap.ts';
const ok = (m: string) => console.log('ok ' + m);

// ---- the threshold ----
assert.equal(STAR_ZOOM, 0.35); assert.equal(STAR_MIN, 12);
assert.equal(starsOn(0.2, 13), true, 'far out on a big board: stars');
assert.equal(starsOn(0.2, 12), false, 'a small board keeps its cards and pills at any zoom');
assert.equal(starsOn(0.35, 100), false, 'at 35% and up: cards / pills');
assert.equal(starsOn(0.349, 13), true);
ok('threshold: below 35% zoom and more than 12 stars');

// ---- grouping: the short film board (an idea note, Beats / Cast / Key frames / Film frames, two loose shots, a loose card, the film) ----
const F = (id: string, name: string, y: number, order: string): StarFrame => ({ id, name, x: 400, y, w: 3600, h: 500, order });
const frames = [F('f:film', '4 · Film', 1800, 'a4'), F('f:beats', '1 · Beats', 0, 'a1'), F('f:cast', '2 · Cast', 600, 'a2'), F('f:keys', '3 · Key frames', 1200, 'a3')];
const N = (id: string, kind: StarNode['kind'], x: number, y: number, frameId: string | null, order: string, extra: Partial<StarNode> = {}): StarNode => ({ id, kind, x, y, w: 340, h: 430, frameId, order, ...extra });
const nodes: StarNode[] = [
  N('idea', 'text', 0, 400, null, 'a0', { idea: true, w: 260, h: 260 }),
  ...[0, 1, 2, 3].map((i) => N(`beat${i}`, 'text', 440 + i * 440, 20, 'f:beats', `b${i}`, { idea: true, w: 260, h: 260 })), /* agent notes in a frame are beats, not the idea */
  N('hero', 'image', 440, 640, 'f:cast', 'c0'), N('place', 'image', 880, 640, 'f:cast', 'c1'),
  ...[0, 1, 2, 3].map((i) => N(`key${i}`, 'image', 440 + i * 440, 1240, 'f:keys', `k${i}`, { name: `Shot ${i + 1} · beat` })),
  ...[0, 1, 2, 3].map((i) => N(`clip${i}`, 'video', 440 + i * 440, 1840, 'f:film', `m${i}`, { name: `Shot ${i + 1} · clip` })),
  N('voice', 'audio', 2200, 1840, 'f:film', 'm4'), N('film', 'video', 3100, 1840, 'f:film', 'm5', { film: true, name: 'Your film' }),
  N('s9a', 'image', 5000, 0, null, 'z1', { name: 'Shot 9 · wide' }), N('s9b', 'video', 5400, 0, null, 'z2', { name: 'Shot 9 · clip' }),
  N('loose', 'audio', 6000, 900, null, 'z3', { name: 'Music bed' }),
];
const sky = starMap(nodes, frames);
assert.deepEqual(sky.clusters.map((c) => c.label), ['1 · Beats', '2 · Cast', '3 · Key frames', '4 · Film', 'Shot 9'], 'frames in board order, then shot groups of loose cards');
assert.deepEqual(sky.clusters[0].stars.map((s) => s.id), ['beat0', 'beat1', 'beat2', 'beat3']);
assert.deepEqual(sky.clusters[3].stars.map((s) => s.kind), ['video', 'video', 'video', 'video', 'audio', 'video'], 'stars keep their media kind (the tint)');
assert.deepEqual(sky.clusters[3].stars.filter((s) => s.film).map((s) => s.id), ['film'], 'only the final film is ringed');
assert.deepEqual(sky.singles.map((s) => s.id), ['loose'], 'a card in no frame and no shot is a single star');
assert.deepEqual(sky.idea, { id: 'idea', x: 130, y: 530 }, 'the idea is the agent note outside the frames');
assert.equal(sky.links.length, 5, 'every cluster joins the idea'); assert.ok(sky.links.every((l) => l.x1 === 130 && l.y1 === 530));
const c = sky.clusters[1]; assert.equal(c.cx, Math.round((610 + 1050) / 2)); assert.ok(c.cy > 855 && c.cy < 855 + 0.3 * 500 + 1, 'a row of stars: the hub sits a little below the row (the hairlines fan out)');
assert.ok(c.labelY > c.box.y + c.box.h - 1, 'the frame name sits under the cluster');
assert.equal(sky.count, nodes.length);
/* deterministic: the same board in any order gives the same sky */
const shuffled = starMap([...nodes].reverse(), [...frames].reverse());
assert.deepEqual(shuffled, sky, 'same board, same sky');
assert.deepEqual(starMap(nodes.filter((n) => n.id !== 'idea'), frames).links, [], 'no idea note: no dashed links');
assert.equal(starMap([N('a', 'image', 0, 0, null, 'a', { name: 'Shot 2' })], []).clusters.length, 0, 'a shot with one card is a single star');
assert.equal(starMap([N('a', 'image', 0, 0, 'f:gone', 'a')], []).singles.length, 1, 'a card in a frame that is not on the board is a single star');
ok('grouping: frames and shots become clusters in a stable order, loose cards are single stars, the idea links every cluster, the film is flagged');

// ---- click to zoom: the frame at a readable zoom, its start when it is too big ----
const small = zoomTarget({ x: 0, y: 0, w: 800, h: 400 }, 1440, 900);
assert.equal(small.z, 1, 'a small frame: up to 100%'); assert.deepEqual(small.center, { x: 400, y: 200 }, 'centred on it');
assert.equal(small.x, 1440 / 2 - 400); assert.equal(small.y, 900 / 2 - 200);
const mid = zoomTarget({ x: 0, y: 0, w: 1600, h: 600 }, 1440, 900); assert.ok(mid.z >= READABLE_ZOOM && mid.z < 1, 'fits at a readable zoom');
const big = zoomTarget({ x: 400, y: 1200, w: 3600, h: 500 }, 1440, 900);
assert.equal(big.z, READABLE_ZOOM, 'never below 55%'); assert.ok(big.center.x < 400 + 3600 / 2, 'a frame too wide is entered at its start');
const viewLeft = -big.x; assert.ok(viewLeft < 400 && viewLeft > 400 - 200, 'the frame’s left edge is just inside the view'); assert.equal(big.center.y, 1450, 'fits vertically: centred');
ok('click to zoom: readable zoom (55–100%), centred, or the start of a frame too big to fit');
console.log('canvas-sky: all ok');
