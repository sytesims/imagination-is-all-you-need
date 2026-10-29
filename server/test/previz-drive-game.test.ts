// Direct a Shot, Drive mode's game layer (2026-10-27): the pure rules in web/src/shared/previz/driveGame.ts (red lights, near misses, bumps,
// the clean streak, park bays, the emitter), the cue tables in previz/sound.ts, and the car scale (cityGen.carScale).
// Run: npx tsx test/previz-drive-game.test.ts   (no server, no network, no audio)
import assert from 'node:assert/strict';
import { driveStep, driveGameStart, createDriveGame, onDriveEvent, junctionNear, pickBay, inBay, segDist, carGap, DRIVE, type DriveFrame, type DriveEvent, type DriveCar } from '../../web/src/shared/previz/driveGame.ts';
import { CUES } from '../../web/src/shared/previz/sound.ts';
import { openCityWorld, type CarAt } from '../src/shared/world/openCity.ts';
import { carScale, CAR_SCALE } from '../src/shared/world/cityGen.ts';
import { RIDES, rideOf } from '../src/shared/previzVehicle.ts';
import { KIT } from '../src/shared/world/kitCatalog.ts';
const ok = (m: string) => console.log('ok ' + m);
const w = openCityWorld();
const types = (ev: DriveEvent[]) => ev.map((e) => e.type);

// ---- geometry
assert.equal(segDist([0, 0], [1, 0], [0, 2], [1, 2]), 2); assert.equal(segDist([0, 0], [1, 0], [3, 0], [4, 0]), 2); assert.ok(segDist([0, -1], [0, 1], [-1, 0], [1, 0]) < 1e-9);
assert.equal(segDist([0, 0], [0, 0], [3, 4], [3, 4]), 5); ok('segment distances');

// ---- car scale: the kits' toy cars are drawn and collide at a person's scale
assert.equal(carScale('kv.taxi'), CAR_SCALE.kv); assert.equal(carScale('kk.car_sedan'), CAR_SCALE.kk); assert.equal(carScale('kk.bench'), 1); assert.equal(carScale('kn.tree_oak'), 1);
for (const r of RIDES) { assert.ok(r.width > 1.5 && r.width < 1.8, `${r.id} is ${r.width.toFixed(2)} m wide`); assert.ok(r.length > 3.3 && r.length < 4.5, `${r.id} is ${r.length.toFixed(2)} m long`); }
assert.ok(KIT['kv.taxi'].h * carScale('kv.taxi') < 2.1, 'a taxi (with its roof sign) stands about a person tall');
const parked = w.spec.pieces.filter((p) => KIT[p.k]?.kind === 'car'); assert.ok(parked.length > 10, `${parked.length} parked cars`);
for (const p of parked) assert.equal(p.s, Math.round(carScale(p.k) * 1e4) / 1e4, 'parked cars carry the car scale');
for (const c of w.carsAt(5)) assert.ok(Math.abs(c.y + (KIT[c.k]?.y0 ?? 0) * carScale(c.k)) < 1e-9, 'traffic wheels on the road at scale');
ok('cars are scaled (rides, parked, traffic)');

// ---- helpers: frames for a car
let now = 0; const DT = 1 / 30;
const frame = (car: DriveCar | null, sceneT: number, traffic: CarAt[] | null = null, bays = false): DriveFrame => { now += DT; return { now, dt: DT, sceneT, car, traffic, bays }; };
const car = (x: number, z: number, heading: number, speed: number, inside = true): DriveCar => ({ k: 'kv.taxi', pos: [x, 0, z], heading, speed, inside });

// ---- traffic lights: wait at red, green go, cross clean; run a red
const j0 = 0; const J = w.junctions[j0];
/* driving north (heading π faces −z) up the lane 1.5 m right of the centre, 12 m short of the junction's centre */
const appX = J.x + 1.5, appZ = J.z + 12; const q0 = junctionNear(w, appX, appZ, Math.PI); assert.ok(q0 && q0.j === j0 && !q0.inBox && q0.ns, 'the approach is found, north–south');
assert.equal(junctionNear(w, appX, J.z + 40, Math.PI)?.j === j0, false, 'too far back: not approaching');
assert.equal(junctionNear(w, appX, appZ, 0)?.j === j0, false, 'driving away: not approaching');
assert.ok(junctionNear(w, J.x, J.z, 1.2)?.inBox, 'in the square');
/* find a moment the north–south lights turn red and stay red a while */
let tRed = -1; for (let t = 0; t < 60; t += 0.05) if (w.signalAt(j0, t).ns === 'red' && w.signalAt(j0, t - 0.05).ns === 'amber') { tRed = t + 0.2; break; } assert.ok(tRed >= 0, 'a red phase');
let tGreen = -1; for (let t = tRed; t < tRed + 30; t += 0.05) if (w.signalAt(j0, t).ns === 'green') { tGreen = t; break; } assert.ok(tGreen > tRed + 5, 'red lasts');
{ const st = driveGameStart(); const ev: DriveEvent[] = [];
  for (let t = tRed; t < tGreen + 0.5; t += DT) ev.push(...driveStep(w, st, frame(car(appX, appZ, Math.PI, 0), t)));
  assert.deepEqual(types(ev), ['enter', 'stopped-at-red', 'green-go'], 'waits at red once, then green go once');
  /* drive through on green */ const ev2: DriveEvent[] = []; let z = appZ; let t = tGreen + 0.5; while (z > J.z - 12) { z -= 8 * DT; t += DT; ev2.push(...driveStep(w, st, frame(car(appX, z, Math.PI, 8), t))); }
  assert.deepEqual(types(ev2), ['crossed'], 'crossing on green: clean'); assert.equal(ev2[0].clean, true); assert.ok(st.style > 0, 'patience and a clean crossing fill the style meter'); }
{ const st = driveGameStart(); st.streak = 42; const ev: DriveEvent[] = []; let z = J.z + 20; let t = tRed;
  while (z > J.z - 12) { z -= 10 * DT; t += DT; ev.push(...driveStep(w, st, frame(car(appX, z, Math.PI, 10), t))); }
  const red = ev.find((e) => e.type === 'ran-red'); assert.ok(red, 'running the red is seen'); assert.equal(red!.junction, j0); assert.ok(red!.streak! >= 42, 'it ends the streak it broke');
  assert.equal(ev.find((e) => e.type === 'crossed')?.clean, false); assert.ok(st.streak < 3, 'the streak starts again'); assert.equal(ev.filter((e) => e.type === 'stopped-at-red').length, 0, 'rolling through is not waiting'); }
{ /* on foot or getting out mid-junction: nothing counts, and the next drive starts fresh */ const st = driveGameStart(); driveStep(w, st, frame(car(J.x, J.z, Math.PI, 3), tRed));
  const out = driveStep(w, st, frame(car(J.x, J.z, Math.PI, 0, false), tRed + DT)); assert.deepEqual(types(out), ['exit'], 'leaving the car mid-junction: just exit'); assert.equal(st.jx, null); }
ok('red lights: stopped at red, green go, clean crossing, ran a red, leaving the car mid-junction');

// ---- near misses and touches (a quiet spot with no junction near)
let qx = 0, qz = 0; outer: for (let x = -300; x < 300; x += 10) for (let z = -300; z < 200; z += 10) { if (!junctionNear(w, x, z, Math.PI / 2) && !junctionNear(w, x, z, 0) && w.junctions.every((J1) => Math.hypot(J1.x - x, J1.z - z) > 40)) { qx = x; qz = z; break outer; } }
const other = (lat: number): CarAt => ({ k: 'kk.car_sedan', x: qx, y: 0, z: qz + lat, heading: Math.PI / 2, v: 0 });
const me = rideOf('kv.taxi'); const them = (KIT['kk.car_sedan'].w * carScale('kk.car_sedan') * 0.9) / 2;
const pass = (lat: number, speed: number) => { const st = driveGameStart(); const ev: DriveEvent[] = []; for (let x = qx - 20; x < qx + 20; x += speed * DT) ev.push(...driveStep(w, st, frame(car(x, qz, Math.PI / 2, speed), 100, [other(lat)]))); return { ev, st }; };
{ const gap = 0.6; const { ev } = pass(me.width / 2 + them + gap, 12); const nm = ev.filter((e) => e.type === 'near-miss'); assert.equal(nm.length, 1, 'one near miss per pass'); assert.ok(Math.abs(nm[0].gap! - gap) < 0.05, `the gap is measured (${nm[0].gap})`); }
assert.equal(pass(me.width / 2 + them + 0.6, 4).ev.filter((e) => e.type === 'near-miss').length, 0, 'crawling past is not a near miss');
assert.equal(pass(me.width / 2 + them + 2, 12).ev.filter((e) => e.type === 'near-miss').length, 0, 'a wide berth is not a near miss');
{ const { ev } = pass(me.width / 2 + them - 0.2, 12); assert.equal(ev.filter((e) => e.type === 'bump').length, 1, 'touching is one bump'); assert.equal(ev.filter((e) => e.type === 'near-miss').length, 0, 'and never a near miss'); }
assert.ok(Math.abs(carGap({ pos: [0, 0, 0], heading: 0, k: 'kv.taxi' }, { k: 'kk.car_sedan', x: 0, y: 0, z: 10, heading: 0, v: 0 }) - (10 - me.length / 2 - (KIT['kk.car_sedan'].d * carScale('kk.car_sedan')) / 2)) < 1e-6, 'nose to tail gap');
{ /* a hard stop the brakes can't explain */ const st = driveGameStart(); driveStep(w, st, frame(car(qx, qz, 0, 12), 0)); const ev = driveStep(w, st, frame(car(qx, qz + 0.2, 0, 0.5), 0)); assert.deepEqual(types(ev), ['bump']);
  const brake = driveGameStart(); let v = 12; const evs: DriveEvent[] = []; while (v > 0) { v = Math.max(0, v - 27 * DT); evs.push(...driveStep(w, brake, frame(car(qx, qz, 0, v), 0))); } assert.ok(!types(evs).includes('bump'), 'full brakes plus handbrake are not a bump'); }
ok('near misses, touches and hits');

// ---- the clean streak
{ const st = driveGameStart(); const ev: DriveEvent[] = []; for (let i = 0; i < 31 / DT; i++) ev.push(...driveStep(w, st, frame(car(qx, qz, 0, 5), 0)));
  const s = ev.filter((e) => e.type === 'streak'); assert.equal(s.length, 1); assert.equal(s[0].streak, DRIVE.milestones[0]); assert.ok(st.best >= 30); }
{ const st = driveGameStart(); for (let i = 0; i < 20 / DT; i++) driveStep(w, st, frame(car(qx, qz, 0, 0.2), 0)); assert.equal(st.streak, 0, 'standing still does not count'); }
ok('clean streak milestones');

// ---- park bays
const sp = w.spec.districts.find((d) => d.id === 'suburbs')!.spawn; const b1 = pickBay(w, sp.pos[0], sp.pos[1], sp.heading, 1)!; assert.ok(b1, 'a bay near the suburbs');
assert.deepEqual(pickBay(w, sp.pos[0], sp.pos[1], sp.heading, 1), b1, 'the same ask, the same bay'); const dist = Math.hypot(b1.x - sp.pos[0], b1.z - sp.pos[1]); assert.ok(dist >= DRIVE.bayMin - 8 && dist <= DRIVE.bayMax + 8, `${dist.toFixed(0)} m away`);
for (let n = 1; n <= 12; n++) { const b = pickBay(w, sp.pos[0], sp.pos[1], sp.heading, n); if (!b) continue; const q = w.clampActor(b.x, b.z, 1); assert.ok(Math.hypot(q[0] - b.x, q[2] - b.z) < 1e-6, 'every bay is clear of walls and parked cars'); assert.ok(w.junctions.every((J1) => Math.hypot(J1.x - b.x, J1.z - b.z) > 12), 'mid-block, never by a junction'); }
assert.ok(inBay(b1, [b1.x, 0, b1.z], b1.heading) && inBay(b1, [b1.x, 0, b1.z], b1.heading + Math.PI), 'either way round');
assert.ok(!inBay(b1, [b1.x + Math.cos(b1.heading) * 1.5, 0, b1.z - Math.sin(b1.heading) * 1.5], b1.heading), 'half out sideways is not parked'); assert.ok(!inBay(b1, [b1.x, 0, b1.z], b1.heading + Math.PI / 2), 'across the bay is not parked');
{ const st = driveGameStart(); const e0 = driveStep(w, st, frame(car(sp.pos[0], sp.pos[1], sp.heading, 3), 0, null, true)); assert.ok(types(e0).includes('bay') && st.bay, 'a bay is offered at the wheel');
  const b = st.bay!; const ev: DriveEvent[] = []; for (let i = 0; i < 0.5 / DT; i++) ev.push(...driveStep(w, st, frame(car(b.x, b.z, b.heading, 0.1), 0, null, true))); assert.ok(!types(ev).includes('parked'), 'a moment is not parked yet');
  for (let i = 0; i < 0.4 / DT; i++) ev.push(...driveStep(w, st, frame(car(b.x, b.z, b.heading, 0.1), 0, null, true)));
  const p = ev.find((e) => e.type === 'parked'); assert.ok(p && p.bay?.n === b.n, 'parked in it'); const nx = ev.filter((e) => e.type === 'bay'); assert.equal(nx.length, 1, 'then the next bay'); assert.equal(nx[0].bay!.n, b.n + 1);
  driveStep(w, st, frame(car(b.x, b.z, b.heading, 0), 0, null, false)); assert.equal(st.bay, null, 'hiding the game takes the bay away'); }
ok('park bays: placed clear, parked either way round, the next one appears');

// ---- determinism and the emitter
const script = () => { const st = driveGameStart(); now = 0; const ev: DriveEvent[] = []; let z = J.z + 20, t = tRed; while (z > J.z - 12) { z -= 9 * DT; t += DT; ev.push(...driveStep(w, st, frame(car(appX, z, Math.PI, 9), t, w.carsAt(t), true))); } return ev; };
assert.deepEqual(script(), script(), 'the same frames, the same events');
{ const g = createDriveGame(w); const seen: string[] = []; const all: string[] = []; const offA = g.on('ran-red', (e) => seen.push(e.type)); g.on('*', (e) => all.push(e.type)); const bus: string[] = []; const offB = onDriveEvent((e) => bus.push(e.type));
  g.on('*', () => { throw new Error('a broken listener'); });
  let z = J.z + 20, t = tRed; now = 0; while (z > J.z - 12) { z -= 10 * DT; t += DT; g.step(frame(car(appX, z, Math.PI, 10), t)); }
  g.horn(now, t, car(appX, z, Math.PI, 0)); assert.deepEqual(seen, ['ran-red']); assert.ok(all.includes('enter') && all.includes('crossed') && all.at(-1) === 'horn'); assert.deepEqual(bus, all, 'the page-wide bus hears the same');
  offA(); offB(); g.reset(); assert.equal(g.state.streak, 0); }
ok('deterministic; listeners by type, all, and the page-wide bus; a broken listener is harmless');

// ---- cues: small, soft and well-formed
for (const [k, c] of Object.entries(CUES)) { assert.ok(c.gain > 0 && c.gain <= 0.4, `${k} is soft`); assert.ok(c.notes.length > 0 && c.notes.every(([f, at, len]) => f > 20 && f < 8000 && at >= 0 && len > 0.05 && at + len < 1), `${k} is short`); }
ok('cue tables');
console.log('previz-drive-game: all ok');
