// Direct a Shot sound (2026-10-27): the pure timing and level maths behind web/src/shared/previz/sound.ts.
// Run: npx tsx test/previz-sound.test.ts   (no server, no network, no audio)
import assert from 'node:assert/strict';
import { footfalls, gaitFor, strideFor, stepLevel, engineParams, doppler, passLevel, panFor, nearestCars, carsWithVelocity, seaNearness, ambienceLevels, eventGap, dbToGain, MASTER_DB } from '../../web/src/shared/previz/sound.ts';
import { STRIDE } from '../src/shared/previzActor.ts';
const ok = (m: string) => console.log('ok ' + m);
const near = (a: number, b: number, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);

// ---- footsteps: one per half stride of distance walked
assert.deepEqual(footfalls(0, 0.64, 1.3), [], 'under half a stride: none');
assert.deepEqual(footfalls(0, 0.65, 1.3), [1], 'exactly on a footfall: at the frame end');
const f = footfalls(0.5, 1.5, 1.3); assert.equal(f.length, 2); near(f[0], (0.65 - 0.5) / 1); near(f[1], (1.3 - 0.5) / 1); ok('footfalls land every half stride, placed within the frame');
let n = 0; for (let d = 0; d < 13; d += 0.0213) n += footfalls(d, d + 0.0213, STRIDE.walk).length; assert.ok(n >= 19 && n <= 20, `20 steps in 13 m of walking (got ${n})`);
assert.deepEqual(footfalls(2, 1, 1.3), [], 'backwards: none'); assert.deepEqual(footfalls(1, 1, 1.3), [], 'standing: none');
assert.deepEqual(footfalls(0, 50, 1.3), [], 'a teleport jump: none'); assert.deepEqual(footfalls(0, 1, 0), [], 'zero stride: none'); assert.deepEqual(footfalls(NaN, 1, 1.3), [], 'NaN: none');
ok('no steps backwards, standing, after a teleport or with bad input');
assert.equal(gaitFor(0), 'idle'); assert.equal(gaitFor(1.25), 'walk'); assert.equal(gaitFor(3.6), 'jog'); assert.equal(gaitFor(6), 'sprint');
assert.equal(strideFor(1.25), STRIDE.walk); assert.equal(strideFor(3.6), STRIDE.jog); assert.equal(strideFor(7), STRIDE.sprint);
ok('stride follows the same gait the actor clips show');
const w = stepLevel(1.25), r = stepLevel(3.6); assert.ok(r.gain > w.gain && r.freq < w.freq && r.thump > w.thump, 'running is harder and darker'); assert.ok(stepLevel(99).gain <= 1);
ok('walking is soft, running hard');

// ---- engine
const e0 = engineParams(0), e1 = engineParams(10), e2 = engineParams(30); assert.ok(e0.gain > 0 && e0.freq > 20, 'idle rumble at 0');
assert.ok(e1.gain > e0.gain && e2.gain > e1.gain && e2.cutoff > e1.cutoff, 'louder and brighter with speed'); assert.ok(engineParams(500).freq < 200 && engineParams(-10).gain === e1.gain, 'clamped; reversing = same note');
ok('engine pitch / brightness / level follow the speed');

// ---- traffic
near(doppler([10, 0, 0], [0, 0, 0], [0, 0, 0]), 1); assert.ok(doppler([10, 0, 0], [-15, 0, 0], [0, 0, 0]) > 1, 'approaching: higher'); assert.ok(doppler([10, 0, 0], [15, 0, 0], [0, 0, 0]) < 1, 'leaving: lower');
near(doppler([10, 0, 0], [-15, 0, 0], [0, 0, 0]), 343 / 328); assert.ok(doppler([1, 0, 0], [-1e6, 0, 0], [0, 0, 0]) <= 1.4 && doppler([0, 0, 0], [5, 0, 0], [0, 0, 0]) > 0, 'clamped; same spot is safe');
ok('doppler: up when coming, down when going');
assert.equal(passLevel(1), 1); assert.equal(passLevel(4), 1); assert.ok(passLevel(20) < passLevel(8)); assert.equal(passLevel(70), 0); assert.equal(passLevel(1000), 0);
ok('pass-by level by distance, silent past 70 m');
assert.ok(panFor([5, 0, 0], [0, 0, 0], 0) > 0.8, 'yaw 0 looks down −z: +x is right'); assert.ok(panFor([-5, 0, 0], [0, 0, 0], 0) < -0.8); near(panFor([0, 0, -5], [0, 0, 0], 0), 0);
assert.ok(panFor([0, 0, -5], [0, 0, 0], Math.PI / 2) > 0.8, 'turned left (yaw +90°, facing −x): what was ahead (−z) is now on the right');
ok('panning follows the camera yaw');
const cars = [{ pos: [30, 0, 0], vel: [0, 0, 0] }, { pos: [5, 0, 0], vel: [1, 0, 0] }, { pos: [100, 0, 0], vel: [0, 0, 0] }, { pos: [0, 0, 10], vel: [0, 0, 0] }] as any;
const nc = nearestCars(cars, [0, 0, 0], 3); assert.deepEqual(nc.map((c) => c.r), [5, 10, 30]); assert.deepEqual(nearestCars([], [0, 0, 0]), []);
ok('nearest cars first, at most n, empty is fine');
const cv = carsWithVelocity([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }], [{ x: 1, y: 0, z: 0 }, { x: 50, y: 0, z: 0 }], 0.1); assert.deepEqual(cv[0].vel, [10, 0, 0]); assert.deepEqual(cv[1].vel, [0, 0, 0], 'a loop wrap jump: no velocity');
ok('car velocity from two traffic samples');

// ---- ambience
assert.equal(seaNearness(0), 0); assert.equal(seaNearness(300), 1); assert.ok(seaNearness(230) > 0 && seaNearness(230) < 1);
const day = ambienceLevels({ night: false }), night = ambienceLevels({ night: true }), beachNight = ambienceLevels({ night: true, sea: 1 }), beachDay = ambienceLevels({ night: false, sea: 1 });
assert.ok(night.bed < day.bed && night.birds === 0 && night.horns < day.horns, 'night: quieter, no birds'); assert.equal(day.surf, 0, 'no surf inland');
assert.ok(beachNight.surf > beachDay.surf && beachNight.surf > 0.5, 'surf strongest at night by the sea'); assert.ok(beachNight.bed < night.bed, 'the city fades at the beach');
const indoor = ambienceLevels({ ambience: 'indoor', night: true, sea: 1 }); assert.ok(indoor.room > 0 && indoor.bed === 0 && indoor.surf === 0 && indoor.horns === 0); assert.equal(ambienceLevels({ ambience: 'none', night: false }).room, 0);
assert.equal(eventGap(0, 9), Infinity); near(eventGap(0.5, 9), 18);
ok('city bed, surf, indoor room tone');
assert.ok(dbToGain(MASTER_DB) < 0.4 && dbToGain(0) === 1); ok('gentle master level');
console.log('previz-sound: all ok');
