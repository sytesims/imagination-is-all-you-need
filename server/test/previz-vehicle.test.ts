// Direct a Shot, Drive mode (2026-10-27; shared/previzVehicle.ts + the ride on the actor track in shared/previzActor.ts).
// Covers: carStep (throttle, top speed, coasting, brake then reverse, handbrake, steering that softens with speed, determinism),
// building collisions at speed (never inside a box, the speed into the wall is taken away), carSpot / exitSpot / nearCar beside walls,
// the chase camera (swings in behind, orbit eases back, lens widens with speed, above the ground), and the ride on a take (normalise,
// JSON round-trip, actorAt at the wheel / parked, the Render prompt's drive wording).
// Run: npx tsx test/previz-vehicle.test.ts   (pure: no server, no network)
import assert from 'node:assert/strict';
const P = await import('../src/shared/previzTemplates.ts');
const A = await import('../src/shared/previzActor.ts');
const V = await import('../src/shared/previzVehicle.ts');
const C = await import('../src/shared/world/openCity.ts');
const ok = (m: string) => console.log('ok ' + m);
const TPL = 'open-city' as const; const world = C.openCityWorld(); const taxi = V.rideOf('kv.taxi');
type S = ReturnType<typeof V.carStep>;
const run = (s: S, inp: Partial<Parameters<typeof V.carStep>[1]>, secs: number, dt = 1 / 60) => { let x = s; for (let i = 0; i < Math.round(secs / dt); i++) x = V.carStep(x, { throttle: 0, brake: 0, steer: 0, handbrake: false, ...inp }, dt, TPL, taxi); return x; };
/** a car pose overlaps a solid box (its three footprint circles, a little inside the radius) */
const inside = (s: { pos: number[]; heading: number }) => { const r = taxi.width / 2 * 0.92 - 0.15; /* 15 cm of contact skin, like the physics world */ const half = taxi.length / 2 - taxi.width / 2 * 0.92;
  return [-half, 0, half].some((o) => { const x = s.pos[0] + Math.sin(s.heading) * o, z = s.pos[2] + Math.cos(s.heading) * o;
    return world.boxes.some((b) => Math.hypot(x - Math.max(b.x0, Math.min(b.x1, x)), z - Math.max(b.z0, Math.min(b.z1, z))) < r); }); };

// ---- 1. handling on the open avenue ----
const sp = C.districtSpawn('avenue'); const spot = V.carSpot(TPL, sp.actor, sp.heading, taxi);
assert.ok(!inside({ pos: spot.pos, heading: spot.heading }), 'carSpot finds a free spot beside the avenue spawn');
assert.ok(V.carDistance(sp.actor, spot, taxi) > 0.3 && V.nearCar(sp.actor, spot, taxi), 'the car stands beside the person, within reach, not on them');
const s0: S = { pos: spot.pos, heading: spot.heading, speed: 0, steer: 0, d: 0 };
const g1 = run(s0, { throttle: 1 }, 1); assert.ok(g1.speed > 6 && g1.speed < 10, `one second of throttle: ${g1.speed.toFixed(2)} m/s`);
assert.ok(g1.d > 2 && Math.abs(g1.d - Math.hypot(g1.pos[0] - s0.pos[0], g1.pos[2] - s0.pos[2])) < 0.5, 'distance driven follows the moves');
const coast = run({ ...s0, speed: 15 }, {}, 1); assert.ok(coast.speed < 15 && coast.speed > 8, 'coasting slows the car gently');
assert.equal(run({ ...s0, speed: 3 }, {}, 6).speed, 0, 'coasting comes to a stop, never past 0');
const br = run({ ...s0, speed: 15 }, { brake: 1 }, 0.5); assert.ok(br.speed < 8.5, 'the brake bites');
const rev = run({ ...s0, speed: 0 }, { brake: 1 }, 2); assert.ok(rev.speed < -3 && rev.speed >= -V.CAR.reverse, 'stopped + brake reverses, up to the reverse limit');
const hb = run({ ...s0, speed: 15 }, { handbrake: true }, 0.5); const cs = run({ ...s0, speed: 15 }, {}, 0.5); assert.ok(hb.speed < cs.speed - 3, 'the handbrake slows far more than coasting');
const fast = { ...s0, speed: 18 }; const right = V.carStep(fast, { throttle: 0, brake: 0, steer: 1, handbrake: false }, 0.1, TPL, taxi);
assert.ok(right.heading < fast.heading && right.steer > 0, 'steer right turns the heading clockwise (down), the wheels turn right');
assert.ok(V.steerLimit(18) < V.steerLimit(2) / 2, 'steering softens with speed');
const left = V.carStep({ ...s0, speed: 5 }, { throttle: 0, brake: 0, steer: -1, handbrake: false }, 0.1, TPL, taxi); assert.ok(left.heading > s0.heading, 'steer left turns the heading up');
assert.deepEqual(run(s0, { throttle: 1, steer: 0.4 }, 2), run(s0, { throttle: 1, steer: 0.4 }, 2), 'pure: the same inputs give the same drive');
const capped = V.carStep(s0, { throttle: 1, brake: 0, steer: 0, handbrake: false }, 5, TPL, taxi); assert.ok(capped.speed <= V.CAR.accel * 0.1 + 1e-9, 'a long frame is capped at 0.1 s');
const top = run(s0, { throttle: 1 }, 25); assert.ok(top.speed <= taxi.top + 1e-9, 'never past top speed');
const nan = V.carStep({ ...s0, speed: NaN }, { throttle: NaN, brake: 0, steer: NaN, handbrake: false }, NaN, TPL, taxi); assert.ok(Number.isFinite(nan.speed) && nan.pos.every(Number.isFinite), 'NaN input is harmless');
ok('handling: throttle, coast, brake → reverse, handbrake, steering by speed, caps, pure');

// ---- 2. into a building at full speed ----
const tall = world.boxes.filter((b) => b.y1 > 6 && b.x1 - b.x0 > 6 && b.z1 - b.z0 > 6);
assert.ok(tall.length > 20, 'the city has buildings to hit');
let hits = 0; let runs = 0;
for (const b of tall) { if (runs >= 40) break; const cz = (b.z0 + b.z1) / 2; const start = V.carClamp(TPL, b.x0 - 14, cz, Math.PI / 2, taxi);
  if (inside({ pos: start.pos, heading: Math.PI / 2 })) continue; /* no room for a car out there (a narrow gap): try the next building */ runs++;
  let s: S = { pos: start.pos, heading: Math.PI / 2, speed: 20, steer: 0, d: 0 }; let minSpeed = 20;
  for (let i = 0; i < 120; i++) { s = V.carStep(s, { throttle: 1, brake: 0, steer: 0, handbrake: false }, 1 / 30, TPL, taxi); assert.ok(!inside(s), 'never inside a box'); minSpeed = Math.min(minSpeed, s.speed); }
  if (minSpeed < 5) hits++; }
assert.ok(runs === 40 && hits >= 10, `a wall stops the car (${hits} of ${runs} runs hit a wall head-on)`);
ok('collisions: full speed into 40 buildings, never inside one, the speed into the wall taken away');

// ---- 3. getting in and out beside walls ----
for (const b of tall.slice(0, 30)) { const at = world.clampActor(b.x0 - 0.35, (b.z0 + b.z1) / 2); for (const h of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
  const c = V.carSpot(TPL, at, h, taxi); assert.ok(!inside(c) || V.carClamp(TPL, c.pos[0], c.pos[2], h, taxi).push.every((x) => Math.abs(x) < 0.05), 'the car is never put inside a wall');
  assert.ok(V.carDistance(at, c, taxi) > 0.2, 'never on top of the person');
  const out = V.exitSpot((x, z) => world.clampActor(x, z), c, taxi); const q = world.clampActor(out[0], out[2]); assert.ok(Math.hypot(q[0] - out[0], q[2] - out[2]) < 1e-6, 'the person steps out onto free ground'); } }
assert.ok(!V.nearCar([spot.pos[0] + 30, 0, spot.pos[2]], spot, taxi) && !V.nearCar(sp.actor, null), 'out of reach / no car');
ok('carSpot / exitSpot beside walls: free spots, never on the person, out onto free ground');

// ---- 4. the chase camera ----
let rig = V.chaseStart(0); const car = { heading: 1.2, speed: 12 };
for (let i = 0; i < 240; i++) rig = V.chaseRig(rig, car, [0, 0], 1, 1 / 60);
const behind = car.heading + Math.PI; assert.ok(Math.abs(Math.atan2(Math.sin(rig.yaw - behind), Math.cos(rig.yaw - behind))) < 0.02, 'the arm swings in behind the car');
let orb = V.chaseRig(rig, car, [0.8, 0], 1, 1 / 60); assert.ok(Math.abs(orb.off + 0.8) < 1e-9, 'the mouse orbits the arm');
for (let i = 0; i < 300; i++) orb = V.chaseRig(orb, car, [0, 0], 1, 1 / 60); assert.ok(Math.abs(orb.off) < 0.05, 'the orbit eases back behind after a moment');
const pose0 = V.chaseCamera({ pos: spot.pos, speed: 0 }, rig, TPL, 40, taxi), poseF = V.chaseCamera({ pos: spot.pos, speed: 19 }, rig, TPL, 40, taxi);
assert.equal(pose0.fov, 40); assert.ok(poseF.fov > 48, 'the lens widens with speed');
assert.ok(pose0.pos[1] > world.groundAt(pose0.pos[0], pose0.pos[2]) + 0.1 && pose0.pos[1] > spot.pos[1] + 1, 'above the car and the ground');
assert.ok(Math.hypot(poseF.pos[0] - spot.pos[0], poseF.pos[2] - spot.pos[2]) >= Math.hypot(pose0.pos[0] - spot.pos[0], pose0.pos[2] - spot.pos[2]) - 0.5, 'the arm stretches at speed (unless a wall pulls it in)');
assert.equal(V.kmh(-5), 18); assert.equal(V.kmh(0), 0);
ok('chase camera: swings behind, orbit eases back, lens widens with speed, above the ground');

// ---- 5. the ride on a take ----
const keys: { t: number; pos: [number, number, number]; heading: number; v: number; d: number }[] = []; let st: S = s0; let walkD = 0;
for (let i = 0; i <= 240; i++) { const t = i / 30;
  if (t < 2) { walkD = t * 1.2; keys.push({ t, pos: [sp.actor[0] + 0.01 * i, sp.actor[1], sp.actor[2]], heading: sp.heading, v: 1.2, d: walkD }); continue; }
  st = V.carStep(st, { throttle: t < 6 ? 1 : 0, brake: t >= 6 ? 1 : 0, steer: 0, handbrake: false }, 1 / 30, TPL, taxi); keys.push({ t, pos: st.pos, heading: st.heading, v: Math.abs(st.speed), d: st.d }); }
const ride = { car: 'kv.taxi', spans: [[2, 7]], park: [spot.pos[0], spot.pos[1], spot.pos[2], spot.heading] };
const base = P.defaultPlanShot(TPL); const camKeys = keys.map((k) => ({ t: k.t, pos: [k.pos[0], k.pos[1] + 3, k.pos[2]] as [number, number, number], yaw: 0, pitch: 0, fov: 40 }));
const shot = P.normalizePlanShot({ ...base, seconds: 8, cameraPath: { chosen: 'a', takes: [{ id: 'a', keys: camKeys, smooth: 0, actor: { keys, beats: A.moveBeats(keys.map((k) => (k.t >= 2 && k.t <= 7 ? { ...k, v: 0 } : k))), ride } }] } });
const tr = shot.cameraPath!.takes[0].actor!; assert.ok(tr.ride && tr.ride.car === 'kv.taxi' && tr.ride.spans.length === 1, 'the take keeps its ride');
assert.deepEqual(P.normalizePlanShot(JSON.parse(JSON.stringify(shot))), shot, 'a take with a ride round-trips through JSON');
assert.equal(A.normalizeRide({ car: 'kk.bench', spans: [[0, 1]], park: [0, 0, 0, 0] }, 0, 5), null, 'only known cars');
assert.equal(A.normalizeRide({ car: 'kv.taxi', spans: [[0, 1]], park: [0, 'x', 0, 0] }, 0, 5), null, 'park must be numbers');
assert.deepEqual(A.normalizeRide({ car: 'kv.van', spans: [[3, 2], [1, 2.5], [9, 99], ['a', 1]], park: [1, 0, 1, 0] }, 0, 5)!.spans, [[1, 3]], 'spans sorted, merged, inside the take');
const pIn = A.actorAt(tr, 4); assert.ok(pIn.car && pIn.car.inside && pIn.car.k === 'kv.taxi' && pIn.car.v > 3, 'at the wheel at 4 s'); assert.equal(pIn.beat, null);
const pBefore = A.actorAt(tr, 1); assert.ok(pBefore.car && !pBefore.car.inside && Math.abs(pBefore.car.pos[0] - spot.pos[0]) < 1e-3, 'parked where the take started, before getting in');
const pAfter = A.actorAt(tr, 7.5); const k7 = tr.keys.find((k) => Math.abs(k.t - 7) < 1e-3)!; assert.ok(pAfter.car && !pAfter.car.inside && Math.abs(pAfter.car.pos[0] - k7.pos[0]) < 1e-3, 'parked where the drive ended');
const edge = A.actorAt(tr, 2 - 1 / 60); assert.ok(Math.hypot(edge.pos[0] - keys[59].pos[0], edge.pos[2] - keys[59].pos[2]) < 0.05, 'no blend between the person and the car at the moment they get in');
assert.equal(A.actorAt({ keys: tr.keys, beats: [] }, 4).car, undefined, 'no ride: no car');
const line = A.actionPromptFor(shot); console.log('  prompt:', line);
assert.match(line, /gets into a taxi and drives it/); assert.match(line, /along the main avenue|through/); assert.match(line, /7 s gets out/); assert.doesNotMatch(line, /runs/, 'the car speed is not read as running');
const whole = P.normalizePlanShot({ ...base, seconds: 8, cameraPath: { chosen: 'a', takes: [{ id: 'a', keys: camKeys, smooth: 0, actor: { keys, beats: [], ride: { ...ride, spans: [[0, 8]] } } }] } });
assert.match(A.actionPromptFor(whole), /The person: 0–8 s drives a taxi/, 'a take that starts at the wheel says "drives"');
ok('ride on a take: normalise, round-trip, at the wheel / parked, no blend at the door, the prompt says the drive');

// ---- 6. the live drive's physics world (Rapier, web/src/shared/previz/drivePhysics.ts): full speed into buildings, never through ----
let PH: typeof import('../../web/src/shared/previz/drivePhysics.ts') | null = null;
try { PH = await import('../../web/src/shared/previz/drivePhysics.ts'); await PH.loadRapier(); } catch (e) { PH = null; console.log('skip physics world: Rapier not installed here (' + String(e).slice(0, 80) + ')'); }
if (PH) {
  const ph = await PH.createDrivePhysics(TPL, []);
  /* how deep the car's rectangle reaches into a solid box at its height (sampled points; 0 = clear) */
  const depth = (s: { pos: number[]; heading: number }) => { const hx = taxi.width / 2 * 0.96, hz = taxi.length / 2 * 0.97; const c = Math.cos(s.heading), sn = Math.sin(s.heading); let worst = 0;
    for (const b of world.boxes) { if (Math.abs((b.x0 + b.x1) / 2 - s.pos[0]) > 25 || Math.abs((b.z0 + b.z1) / 2 - s.pos[2]) > 25 || b.y1 < s.pos[1] + 0.25 || b.y0 > s.pos[1] + 1.45) continue;
      for (let i = -4; i <= 4; i++) for (let j = -2; j <= 2; j++) { const lx = (hx * j) / 2, lz = (hz * i) / 4; const x = s.pos[0] + lx * c + lz * sn, z = s.pos[2] - lx * sn + lz * c;
        if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) worst = Math.max(worst, Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z)); } }
    return worst; };
  let n = 0, stopped = 0, worst = 0;
  for (const b of tall) { if (n >= 30) break; const cz = (b.z0 + b.z1) / 2; const st = V.carClamp(TPL, b.x0 - 16, cz, Math.PI / 2, taxi); let s: S = { pos: st.pos, heading: Math.PI / 2, speed: 19, steer: 0, d: 0 }; if (depth(s) > 0) continue; n++; ph.place(s, taxi);
    let m = 99; for (let i = 0; i < 90; i++) { s = ph.step(s, { throttle: 1, brake: 0, steer: 0, handbrake: false }, 1 / 30, 0); const dp = depth(s); worst = Math.max(worst, dp); assert.ok(dp < 0.3, `physics: never through a wall (${dp.toFixed(2)} m in at ${i})`); m = Math.min(m, s.speed); } if (m < 3) stopped++; }
  assert.ok(n === 30 && stopped >= 25, `physics: walls stop the car (${stopped} of ${n})`); console.log(`  deepest contact at 68 km/h: ${(worst * 100).toFixed(0)} cm (the solver's contact skin)`);
  /* glancing: along a wall at a shallow angle the car slides on instead of sticking */
  const b0 = tall[0]; let g: S = { pos: V.carClamp(TPL, b0.x0 - 3, b0.z0 - 8, 0.15, taxi).pos, heading: 0.15, speed: 12, steer: 0, d: 0 }; ph.place(g, taxi);
  for (let i = 0; i < 60; i++) g = ph.step(g, { throttle: 1, brake: 0, steer: 0, handbrake: false }, 1 / 30, 0); assert.ok(depth(g) < 0.15 && g.d > 8, 'a glancing hit slides along the wall');
  ph.dispose(); ok('physics world: 30 full-speed runs into buildings, never through, stopped; glancing hits slide');
}
