// Open city (2026-10-26; shared/world/*: worldSpec, cityGen, terrain, openCity, kitCatalog + the hooks in previzTemplates / previzActor).
// Covers: the generator is deterministic (same seed → the same placement, piece for piece; another seed → other details, same streets),
// no solid footprints overlap (three seeds), every solid piece has a collider, the validator catches bad specs (unknown piece, bad turn,
// off-grid and stacked tiles, overlaps, outside the map, empty), normalizeWorldSpec, the physics (ground on road / pavement / hills / pier,
// buildings, the pond and the sea push the person out, the camera stays outside boxes, the follow camera pulls in front of a wall), the
// traffic (deterministic, on the road), city life (signals, cars stopping at red and queueing, people on the pavements: deterministic,
// continuous, off the carriageway and round the posts), spawn points are clear, the three presets are wired in, and the shipped files stay small.
// Run: npx tsx test/open-city.test.ts   (pure: no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const G = await import('../src/shared/world/cityGen.ts');
const W = await import('../src/shared/world/worldSpec.ts');
const O = await import('../src/shared/world/openCity.ts');
const K = await import('../src/shared/world/kitCatalog.ts');
const P = await import('../src/shared/previzTemplates.ts');
const A = await import('../src/shared/previzActor.ts');
const ok = (m: string) => console.log('ok ' + m);

// ---- 1. determinism ----
const a = G.generateCity({ seed: 7 }), b = G.generateCity({ seed: 7 }), c = G.generateCity({ seed: 8 });
assert.deepEqual(a, b, 'same seed → the same spec'); assert.equal(JSON.stringify(a), JSON.stringify(b));
assert.notDeepEqual(a.pieces, c.pieces, 'another seed → other details');
const roads = (s: typeof a) => s.pieces.filter((p) => p.k.startsWith('kk.road')).map((p) => `${p.x},${p.z}`).join('|');
assert.equal(roads(a), roads(c), 'the street plan is the same for every seed');
assert.ok(a.pieces.length > 5000 && a.pieces.length < 30000, `a big city (${a.pieces.length} pieces)`);
const xs = a.pieces.map((p) => p.x), zs = a.pieces.map((p) => p.z); assert.ok(Math.max(...xs) - Math.min(...xs) > 600 && Math.max(...zs) - Math.min(...zs) > 600, 'about 600–1000 m across');
ok('the generator is deterministic and big');

// ---- 2. no overlaps, colliders present ----
for (const seed of [1, 7, 42]) { const s = G.generateCity({ seed }); const v = W.validateWorld(s); assert.ok(v.ok, `seed ${seed}: ${v.problems.slice(0, 3).join(' / ')}`); assert.equal(v.counts.overlaps, 0); }
const boxes = W.collidersOf(a); const solid = a.pieces.filter(W.isSolid);
assert.equal(boxes.length, solid.length, 'every solid piece has a collider'); assert.ok(boxes.length > 3000);
assert.ok(boxes.every((x) => x.x1 > x.x0 && x.z1 > x.z0 && x.y1 > x.y0), 'colliders have a size');
for (const p of a.pieces) assert.ok(K.KIT[p.k], `${p.k} is in the kit catalogue`);
const kinds = new Set(a.pieces.map((p) => K.KIT[p.k].kind)); for (const k of ['tile', 'building', 'prop', 'tree', 'car', 'deco']) assert.ok(kinds.has(k as any), `the city has ${k} pieces`);
const ids = a.districts.map((d) => d.id); assert.deepEqual(ids, ['downtown', 'midtown', 'avenue', 'oldtown', 'park', 'suburbs', 'beach', 'hills']);
ok('no overlapping footprints (3 seeds), colliders for every solid piece, 8 districts');

// ---- 3. the validator ----
const base = { ...a, pieces: [] as typeof a.pieces };
assert.ok(W.validateWorld(base).ok, 'an empty world is valid');
const bad = W.validateWorld({ ...base, pieces: [
  { k: 'no.such', x: 0, z: 0, y: 0, r: 0 }, { k: 'kk.base', x: 3, z: 5, y: 0, r: 0 }, { k: 'kk.base', x: 5, z: 5, y: 0, r: 0 }, { k: 'kk.base', x: 5, z: 5, y: 0, r: 0 },
  { k: 'kk.bench', x: 0, z: 0, y: 0, r: 5 as any }, { k: 'kk.building_A', x: 100, z: 100, y: 0, r: 0 }, { k: 'kk.building_B', x: 101, z: 100, y: 0, r: 1 }, { k: 'kk.bench', x: 9000, z: 0, y: 0, r: 0 },
  { k: 'kk.bench', x: NaN, z: 0, y: 0, r: 0 }] });
assert.ok(!bad.ok); const say = bad.problems.join('\n');
for (const re of [/not in the kit catalogue/, /off the 10 m grid/, /share the grid square/, /turn r must be/, /overlaps/, /outside the map/, /not a number/]) assert.match(say, re);
const many = W.validateWorld({ ...base, pieces: Array.from({ length: 500 }, () => ({ k: 'kk.dumpster', x: 0, z: 0, y: 0, r: 0 as const })) });
assert.equal(many.problems.length, 40, 'problems are capped'); assert.ok(many.counts.overlaps > 1000, 'every clash is counted');
assert.equal(W.normalizeWorldSpec(null), null); assert.equal(W.normalizeWorldSpec({ pieces: 'x' }), null);
const norm = W.normalizeWorldSpec(JSON.parse(JSON.stringify({ ...a, pieces: [...a.pieces.slice(0, 50), { k: 'evil', x: 1 }, { k: 'kk.bench', x: '3', z: 1, r: 7, s: 99 }] })))!;
assert.equal(norm.pieces.length, 51, 'unknown pieces dropped'); assert.deepEqual(norm.pieces[50], { k: 'kk.bench', x: 3, z: 1, y: 0, r: 3, s: 4 }, 'numbers cleaned, turn wrapped, scale capped');
ok('validateWorld names the problems; normalizeWorldSpec cleans agent JSON');

// ---- 4. physics ----
const w = O.openCityWorld(); assert.equal(w, O.openCityWorld(), 'built once');
const roadTile = w.spec.pieces.find((p) => p.k === 'kk.road_straight')!; assert.equal(w.groundAt(roadTile.x, roadTile.z), 0, 'the road surface is at 0');
const baseTile = w.spec.pieces.find((p) => p.k === 'kk.base')!; assert.equal(w.groundAt(baseTile.x, baseTile.z), 0.15, 'the pavement is 0.15 m up');
assert.ok(w.groundAt(0, -390) > 8, 'hills rise to the north'); assert.ok(w.groundAt(0, 360) < w.spec.terrain.water, 'the sea floor is under water');
assert.ok(Math.abs(w.groundAt(135, 300) - G.PIER.deck) < 1e-9, 'the pier deck'); assert.ok(w.groundAt(135, 246) > 0.15 && w.groundAt(135, 246) < G.PIER.deck, 'the ramp up to the pier');
const house = w.spec.pieces.find((p) => p.k.startsWith('kc.building-skyscraper'))!; const hb = W.pieceBox(house)!; const mid: [number, number] = [(hb.x0 + hb.x1) / 2, (hb.z0 + hb.z1) / 2];
const out = w.clampActor(mid[0], mid[1]); assert.ok(out[0] <= hb.x0 - 0.29 || out[0] >= hb.x1 + 0.29 || out[2] <= hb.z0 - 0.29 || out[2] >= hb.z1 + 0.29, 'a person inside a tower is pushed out');
const edge = w.clampActor(hb.x0 - 0.1, mid[1]); assert.ok(edge[0] <= hb.x0 - 0.29, 'and kept a body width from its wall');
const [px, pz, pr] = w.spec.ponds[0]; const wet = w.clampActor(px + 1, pz); assert.ok(Math.hypot(wet[0] - px, wet[2] - pz) >= pr + 0.29, 'out of the pond');
const sea = w.clampActor(-200, 360); assert.ok(sea[1] >= w.spec.terrain.water - 0.26 && sea[2] < 360, 'no walking out to sea');
const pier = w.clampActor(135, 380); assert.ok(Math.abs(pier[2] - 380) < 1e-9 && pier[1] === G.PIER.deck, 'the pier is walkable over the sea');
const far = w.clampActor(5000, -5000); assert.ok(Math.abs(far[0]) <= 430 && Math.abs(far[2]) <= 430, 'inside the map');
const cam = w.clampCamera([mid[0], 5, mid[1]]); assert.ok(cam[0] < hb.x0 || cam[0] > hb.x1 || cam[2] < hb.z0 || cam[2] > hb.z1 || cam[1] > hb.y1, 'the camera never ends up inside a building');
const low = w.clampCamera([0, -50, -390]); assert.ok(low[1] >= w.groundAt(0, -390) + 0.14, 'the camera stays above the hills');
const seaCam = w.clampCamera([0, -5, 380]); assert.ok(seaCam[1] >= w.spec.terrain.water, 'and above the water');
const from: [number, number, number] = [hb.x0 - 3, 1.3, mid[1]]; const to: [number, number, number] = [hb.x1 + 3, 1.3, mid[1]]; const occ = w.occlude(from, to);
assert.ok(occ[0] < hb.x0, 'the follow camera comes in front of a wall'); assert.deepEqual(w.occlude([0, 400, 0], [0, 410, 0]), [0, 410, 0], 'a clear view stays put');
ok('ground, collisions, the pond, the sea, the pier, the camera clamp and the follow camera');

// ---- 5. traffic ----
const t1 = w.carsAt(3.5), t2 = w.carsAt(3.5); assert.deepEqual(t1, t2, 'the same t → the same traffic'); assert.ok(t1.length >= 40, `${t1.length} cars`);
assert.notDeepEqual(w.carsAt(0)[0], w.carsAt(1)[0], 'cars move');
for (const car of t1) { assert.ok(Number.isFinite(car.x + car.z + car.heading)); assert.ok(Math.abs(car.x) < 400 && Math.abs(car.z) < 400); assert.ok(car.y >= 0 && car.y < 0.5, 'wheels on the road'); }
const t3 = w.carsAt(3.6); const sps = t3.map((c1, i) => Math.hypot(c1.x - t1[i].x, c1.z - t1[i].z) / 0.1); const top = Math.max(...sps);
assert.ok(top > 8 && top < 14, `cars drive at a city speed (${top.toFixed(1)} m/s at most)`); assert.ok(sps.every((x) => x < 14.5), 'nobody speeds or jumps');
ok('ambient traffic is deterministic and on the road');

// ---- 6. spawns and the presets ----
const clear = (x: number, z: number) => !w.boxes.some((q) => x > q.x0 - 0.3 && x < q.x1 + 0.3 && z > q.z0 - 0.3 && z < q.z1 + 0.3);
for (const d of w.spec.districts) { const s = O.districtSpawn(d.id); assert.ok(clear(s.actor[0], s.actor[2]), `${d.id}: the spawn point is clear`); assert.ok(clear(s.cam[0], s.cam[2]) || s.cam[1] > 3, `${d.id}: the camera behind it too`);
  const [x0, x1, z0, z1] = [Math.min(...d.rects.map((r) => r[0])), Math.max(...d.rects.map((r) => r[1])), Math.min(...d.rects.map((r) => r[2])), Math.max(...d.rects.map((r) => r[3]))];
  assert.ok(s.actor[0] >= x0 - 20 && s.actor[0] <= x1 + 20 && s.actor[2] >= z0 - 20 && s.actor[2] <= z1 + 20, `${d.id}: the spawn is in (or at the edge of) its district`); }
for (const id of O.CITY_IDS) { const t = P.previzTemplate(id)!; assert.ok(t && t.restyle.long.includes('{colour}'), id); assert.ok(A.actorAllowed(id), `${id}: you can play the actor`);
  const shot = P.defaultPlanShot(id); const st = A.actorStart(shot); assert.ok(clear(st.pos[0], st.pos[2]), `${id}: the actor starts clear`);
  assert.equal(P.groundAt(id, roadTile.x, roadTile.z), 0); for (let i = 0; i <= 8; i++) { const c0 = P.cameraAt(shot, (shot.seconds * i) / 8).pos; assert.ok(c0[1] >= P.groundAt(id, c0[0], c0[2]), `${id}: the preset camera stays above the ground`); } }
assert.ok(!O.isCityTemplate('walk-by') && O.isCityTemplate('open-city-night'));
const live = A.actorStep({ pos: [hb.x0 - 0.5, 0, mid[1]], heading: 0, v: 0, d: 0, vel: [3, 0], beat: null }, { fwd: 0, right: 1, run: true, look: [0, 0], zoom: 0 }, { yaw: 0, pitch: 0, dist: 4 }, 0.1, 1, 'open-city');
assert.ok(live.pos[0] <= hb.x0 - 0.29, 'walking into a tower stops at its wall');
const fc = A.followCamera([hb.x0 - 1, 0.15, mid[1]], { yaw: Math.PI / 2, pitch: 0, dist: 8 }, 'open-city', 40); assert.ok(fc.pos[0] < hb.x0, 'the follow camera never goes behind the wall');
assert.equal(P.normalizeKeys([{ t: 0, pos: [600, 2, -600], yaw: 0, pitch: 0, fov: 40 }, { t: 1, pos: [0, 2, 0], yaw: 0, pitch: 0, fov: 40 }])![0].pos[0], 600, 'takes keep far-away keys');
ok('spawns are clear, the three presets are wired (ground, camera, actor, collisions)');

// ---- 7. city life: traffic lights, cars stopping at red, people on the pavements (all pure functions of t) ----
assert.ok(w.junctions.length >= 20, `${w.junctions.length} signalised junctions`);
const ph = (t: number) => O.signalPhase(0, t); assert.deepEqual(ph(0), { ns: 'green', ew: 'red' }); assert.equal(ph(10).ns, 'amber'); assert.deepEqual(ph(13), { ns: 'red', ew: 'green' }); assert.equal(ph(22).ew, 'amber'); assert.deepEqual(ph(24), ph(0), 'a fixed cycle');
for (let t = 0; t < 48; t += 0.25) { const s1 = w.signalAt(3, t); assert.ok(s1.ns === 'red' || s1.ew === 'red', 'never green both ways'); assert.deepEqual(s1, w.signalAt(3, t)); }
assert.deepEqual(O.signalPhase(5, -3), O.signalPhase(5, 21), 'negative t wraps');
// determinism: the same t gives the same traffic, whatever was asked before (forwards, backwards, a fresh world)
const fresh = new O.CityWorld(G.generateCity({ seed: O.OPEN_CITY_SEED }));
const late = w.carsAt(37.3); w.carsAt(2); w.carsAt(80); assert.deepEqual(w.carsAt(37.3), late, 'seeking back and forth'); assert.deepEqual(fresh.carsAt(37.3), late, 'a fresh world agrees');
assert.deepEqual(fresh.carsAt(12.0625), w.carsAt(12.0625));
// continuity: no jumps between frames (60 fps over 40 s), and cars stop and queue
let stoppedMax = 0, queued = 0, prev = w.carsAt(0); let worst = 0;
for (let f = 1; f <= 40 * 60; f++) { const t = f / 60; const cur = w.carsAt(t); for (let i = 0; i < cur.length; i++) worst = Math.max(worst, Math.hypot(cur[i].x - prev[i].x, cur[i].z - prev[i].z));
  if (f % 30 === 0) { const st = cur.filter((c1) => c1.v < 0.2); stoppedMax = Math.max(stoppedMax, st.length);
    for (const a1 of st) if (st.some((b1) => b1 !== a1 && Math.abs(b1.heading - a1.heading) < 0.1 && Math.hypot(b1.x - a1.x, b1.z - a1.z) < 9)) queued++; }
  prev = cur; }
assert.ok(worst < 14.5 / 60 + 1e-6, `continuous: at most ${(worst * 60).toFixed(1)} m/s between frames`);
assert.ok(stoppedMax >= 8, `cars wait at red lights (${stoppedMax} at once)`); assert.ok(queued > 0, 'and queue behind each other');
// a car stopped at a red light really is facing red
{ let checked = 0; for (const t of [6, 14, 25, 33]) for (const car of w.carsAt(t)) if (car.v < 0.05) { const near = w.junctions.map((J, j) => [Math.hypot(J.x - car.x, J.z - car.z), j]).sort((p1, q1) => p1[0] - q1[0])[0];
  if (near[0] > 9.5) continue; const ns = Math.abs(Math.cos(car.heading)) > Math.abs(Math.sin(car.heading)); const ax = ns ? 'ns' : 'ew'; const lamp = w.signalAt(near[1], t)[ax]; assert.ok(lamp !== 'green' || w.signalAt(near[1], t - 0.75)[ax] !== 'green', `a car waits at a green light (t ${t})`); /* (or it only just turned green) */ checked++; }
  assert.ok(checked > 3, `${checked} cars checked at their lights`); }
for (let t = 0; t < 60; t += 0.5) { const cs = w.carsAt(t); for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) if (Math.abs(cs[i].heading - cs[j].heading) < 0.05 && Math.hypot(cs[i].x - cs[j].x, cs[i].z - cs[j].z) < 3.5) assert.fail(`two cars in one lane overlap at t ${t}`); }
// people
assert.ok(w.peopleCount > 300, `${w.peopleCount} people`); const all = w.pedsAt(4.2); assert.equal(all.length, w.peopleCount); assert.deepEqual(w.pedsAt(4.2), all, 'the same t → the same people');
assert.deepEqual(fresh.pedsAt(4.2), all, 'a fresh world agrees');
for (const p1 of all) { assert.ok(Number.isFinite(p1.x + p1.z + p1.y + p1.heading + p1.d)); assert.ok(Math.abs(p1.x) < 400 && Math.abs(p1.z) < 400); assert.ok(p1.y >= -0.1 && p1.y <= 0.2, `on the pavement (y ${p1.y})`); }
const solidHit = all.filter((p1) => w.boxes.some((q) => p1.x > q.x0 - 0.1 && p1.x < q.x1 + 0.1 && p1.z > q.z0 - 0.1 && p1.z < q.z1 + 0.1)).length;
assert.ok(solidHit / all.length < 0.03, `people walk round posts and parked cars (${solidHit} of ${all.length} touch a box)`);
const roadHit = all.filter((p1) => { const [i, j] = G.tileOf(p1.x, p1.z); if (!G.isRoadTile(i, j)) return false; const lx = ((p1.x + 400) % 10 + 10) % 10 - 5, lz = ((p1.z + 400) % 10 + 10) % 10 - 5; return Math.max(Math.abs(lx), Math.abs(lz)) < 4.4; }).length;
assert.ok(roadHit / all.length < 0.02, `people keep off the carriageway and the parking lane (${roadHit} step off the kerb round an obstacle)`);
const walking = all.filter((p1) => p1.v > 0); assert.ok(walking.length > all.length * 0.8 && walking.every((p1) => p1.v <= 1.6) && walking.filter((p1) => p1.v >= 1).length > walking.length * 0.97, 'most walk, at a walking pace (a few ease in or out at a corner)');
let pw = 0; let pp = w.pedsAt(0); for (let f = 1; f <= 600; f++) { const cur = w.pedsAt(f / 60); for (let i = 0; i < cur.length; i++) if (cur[i].v > 0) pw = Math.max(pw, Math.hypot(cur[i].x - pp[i].x, cur[i].z - pp[i].z)); pp = cur; }
assert.ok(pw * 60 < 3.5, `people move smoothly (${(pw * 60).toFixed(2)} m/s at most between frames)`);
const near = w.pedsNear(4.2, 150, -250, 60, 1, 24); assert.ok(near.length === 24 && near.every((p1, i) => i === 0 || p1.dist >= near[i - 1].dist) && near.every((p1) => p1.dist <= 60), 'pedsNear: nearest first, within range, capped');
const some = w.pedsNear(4.2, 150, -250, 60, 0.4); const busy = w.pedsNear(4.2, 150, -250, 60, 1); assert.ok(some.length < busy.length * 0.6 && some.length > 0, `Some (${some.length}) < Busy (${busy.length})`);
assert.ok(some.every((p1) => busy.some((q) => q.id === p1.id && q.x === p1.x)), 'Some is a subset of Busy, in the same places');
ok(`city life: ${w.junctions.length} junctions on a ${O.SIGNAL.cycle} s cycle, up to ${stoppedMax} cars waiting at red, ${w.peopleCount} people; deterministic and continuous`);

// ---- 8. shipped files ----
const dir = path.resolve(import.meta.dirname, '../../web/public/models/open-city'); const files = fs.readdirSync(dir);
const total = files.reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0); assert.ok(files.includes('open-city.glb')); assert.ok(total < 40e6, `the city ships in ${(total / 1e6).toFixed(1)} MB`);
for (const v of ['day', 'golden', 'night']) assert.ok(files.includes(`thumb-${v}.jpg`), `thumbnail ${v}`);
ok(`shipped files: ${(total / 1e6).toFixed(2)} MB`);
console.log('all open city tests passed');
