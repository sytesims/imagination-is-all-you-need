// Families in the open city and the graphics quality presets (2026-10-27; shared/world/openCity.ts groups, web previz/world/crowd.ts,
// web previz/quality.ts). Covers: groups are a pure function of t (same t → same people, a fresh world agrees, seeking back and forth gives
// the same numbers as going straight there), members stay together and keep their spacing, children are smaller, couples / families /
// dogs all appear, a group waits at a signalised corner together and only while its lights are not green, the crowd picks whole groups,
// clothes are seeded, and the four quality levels (Low = the old look, caps for WebGL1, the first-load pick).
// Run: npx tsx test/previz-families.test.ts   (pure: no server, no network)
import assert from 'node:assert/strict';
const O = await import('../src/shared/world/openCity.ts');
const G = await import('../src/shared/world/cityGen.ts');
const Q = await import('../../web/src/shared/previz/quality.ts');
const C = await import('../../web/src/shared/previz/world/crowd.ts');
const ok = (m: string) => console.log('ok ' + m);

const w = O.openCityWorld(); const fresh = new O.CityWorld(G.generateCity({ seed: O.OPEN_CITY_SEED }));
// ---- 1. deterministic, whichever way you seek ----
for (const t of [0, 3.3, 47.5, 130.25]) assert.deepEqual(w.pedsAt(t), fresh.pedsAt(t), `a fresh world agrees at t ${t}`);
const straight = new O.CityWorld(G.generateCity({ seed: O.OPEN_CITY_SEED })).pedsAt(90.5);
const zig = new O.CityWorld(G.generateCity({ seed: O.OPEN_CITY_SEED })); for (const t of [10, 200, 30, 90.4, 5, 90.5]) zig.pedsAt(t);
assert.deepEqual(zig.pedsAt(90.5), straight, 'seeking back and forth gives exactly the numbers of going straight to t');
ok('groups are a pure function of t (fresh world, seek back and forth)');

// ---- 2. who walks together ----
const all = w.pedsAt(12); const groups = new Map<number, typeof all>(); for (const p of all) { const g = groups.get(p.group); if (g) g.push(p); else groups.set(p.group, [p]); }
const shape = (g: typeof all) => { const a = g.filter((p) => p.kind === 'adult').length, c = g.filter((p) => p.kind === 'child').length, d = g.filter((p) => p.kind === 'dog').length; return a === 1 && !c && !d ? 'alone' : a === 2 && !c && !d ? 'couple' : c ? 'family' : d ? 'dog' : 'other'; };
const count: Record<string, number> = {}; for (const g of groups.values()) count[shape(g)] = (count[shape(g)] ?? 0) + 1;
assert.equal(count.other ?? 0, 0, 'every group is alone, a couple, a family or someone with a dog');
const n = groups.size; for (const [k, share] of [['couple', O.GROUPS.couple], ['family', O.GROUPS.family], ['dog', O.GROUPS.dog]] as const) assert.ok(Math.abs(count[k] / n - share) < 0.05, `${k}: ${count[k]} of ${n}`);
assert.equal(w.groupCount, n); assert.equal(w.peopleCount, all.length);
for (const p of all) { if (p.kind === 'child') assert.ok(p.scale >= 0.55 && p.scale <= 0.72, `a child is smaller (${p.scale})`); else if (p.kind === 'adult') assert.equal(p.scale, 1); }
for (const g of groups.values()) { if (g.length < 2) continue; const v = g[0].v; assert.ok(g.every((p) => p.v === v && p.rank === g[0].rank), 'a group shares its pace and its rank (Some shows it whole or not at all)'); }
ok(`${n} groups: ${count.alone} alone, ${count.couple} couples, ${count.family} families, ${count.dog} with a dog; children at 0.55–0.72 size`);

// ---- 3. they keep together, over a minute ----
let spread = 0, nearest = Infinity;
for (let t = 0; t <= 60; t += 0.5) { const ps = w.pedsAt(t); const by = new Map<number, typeof ps>(); for (const p of ps) { const g = by.get(p.group); if (g) g.push(p); else by.set(p.group, [p]); }
  for (const g of by.values()) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) { const d = Math.hypot(g[i].x - g[j].x, g[i].z - g[j].z); spread = Math.max(spread, d); nearest = Math.min(nearest, d); } }
assert.ok(spread < 3.6, `members stay within ${spread.toFixed(2)} m of each other`); assert.ok(nearest > 0.2, `and never stand inside each other (${nearest.toFixed(2)} m)`);
ok(`groups keep together (at most ${spread.toFixed(2)} m apart, at least ${nearest.toFixed(2)} m)`);

// ---- 4. waiting at the lights, together ----
let waited = 0;
for (let t = 1; t < 120; t += 1) { const now = w.pedsAt(t); for (const p of now) { if (!p.wait || p.kind !== 'adult') continue; assert.equal(p.v, 0, 'a waiting group stands still');
  const J = w.junctions.map((q, j) => ({ d: Math.hypot(q.x - p.x, q.z - p.z), j })).sort((a, b) => a.d - b.d)[0]; assert.ok(J.d < 11, `waiting by a junction (${J.d.toFixed(1)} m)`);
  const mates = now.filter((q) => q.group === p.group); assert.ok(mates.every((q) => q.wait && q.v === 0), 'the whole group waits');
  const ns = Math.abs(Math.cos(p.heading)) > Math.abs(Math.sin(p.heading)); const lamp = w.signalAt(J.j, t)[ns ? 'ns' : 'ew'];
  const amberOrLate = lamp !== 'green' || w.signalAt(J.j, t + 2.6)[ns ? 'ns' : 'ew'] !== 'green' || w.signalAt(J.j, t - 0.6)[ns ? 'ns' : 'ew'] !== 'green';
  assert.ok(amberOrLate, `a group waits at a green light (t ${t})`); waited++; } }
assert.ok(waited > 20, `${waited} waits seen at signalised corners`);
ok(`groups wait at signalised corners only while their lights say no (${waited} waits checked)`);

// ---- 5. the crowd draws whole groups ----
const near = w.pedsNear(12, 150, -250, 60, 1, 160); const ahead = () => true;
for (const cap of [1, 5, 10, 24, 32]) { const got = C.pickGroups(near, cap, ahead); const humans = got.filter((p) => p.kind !== 'dog').length; assert.ok(humans <= cap, `at most ${cap} people`);
  const ids = new Set(got.map((p) => p.group)); for (const g of ids) assert.equal(got.filter((p) => p.group === g).length, near.filter((p) => p.group === g).length, 'a group is never split'); }
assert.deepEqual(C.wearOf(123, 'adult'), C.wearOf(123, 'adult')); assert.notDeepEqual(C.wearOf(123, 'adult'), C.wearOf(124, 'adult'));
assert.ok(C.WEAR.kid.includes(C.wearOf(5, 'child').top), 'children wear the children’s tops');
const tops = new Set(all.filter((p) => p.kind === 'adult').map((p) => C.wearOf(p.tint, 'adult').top)); assert.ok(tops.size >= 12, `${tops.size} different tops`);
ok('the crowd picks whole groups under its cap; clothes are seeded per person');

// ---- 6. quality presets ----
assert.deepEqual(Q.QUALITIES, ['low', 'medium', 'high', 'ultra']);
const L = Q.QUALITY.low; assert.ok(!L.pbr && !L.sky && L.shadowMap === 2048 && L.ao === 0 && !L.bloom && L.msaa === 0, 'Low is the look from before (no PBR, no sky shader, 2048 shadows, no post)');
assert.deepEqual(L.dist, { far: 760, detail: 260, trees: 470, shadow: 150, box: 95 }, 'Low keeps the old distances'); assert.equal(L.crowd, 24, 'and the old head count');
assert.ok(Q.QUALITY.medium.pbr && !Q.QUALITY.medium.ao && !Q.QUALITY.medium.bloom, 'Medium: materials and sky, no post (Explore uses it)');
assert.ok(Q.QUALITY.high.ao > 0 && Q.QUALITY.high.bloom && Q.QUALITY.ultra.ao >= Q.QUALITY.high.ao && Q.QUALITY.ultra.dist.far > Q.QUALITY.high.dist.far && Q.QUALITY.ultra.crowd > Q.QUALITY.high.crowd, 'High adds post, Ultra goes further');
assert.equal(Q.capQuality('ultra', { webgl2: false, maxTexture: 8192 }), 'medium', 'WebGL1-class: Medium at most'); assert.equal(Q.capQuality('high', { webgl2: true, maxTexture: 2048 }), 'low', 'small textures: Low');
assert.equal(Q.capQuality('ultra', { webgl2: true, maxTexture: 16384 }), 'ultra'); assert.equal(Q.capQuality('low', { webgl2: false, maxTexture: 1024 }), 'low');
let last = 3; for (const ms of [2, 9, 10, 18, 19, 30, 31, 80]) { const i = Q.QUALITIES.indexOf(Q.pickQuality(ms)); assert.ok(i <= last, 'slower frames never pick a higher level'); last = i; }
assert.equal(Q.pickQuality(5), 'ultra'); assert.equal(Q.pickQuality(14), 'high'); assert.equal(Q.pickQuality(25), 'medium'); assert.equal(Q.pickQuality(40), 'low');
assert.equal(Q.previzQuality(), 'medium', 'nothing stored (no browser here): Medium until the first pick');
ok('quality presets: Low = the old look, caps for small GPUs, the first-load pick is monotone');
console.log('all families + quality tests passed');
