// Direct a Shot, Perform, then shoot (2026-10-26; shared/previzActor.ts perfStep / shootTake / performanceGroups + the take's shoot field in
// shared/previzTemplates.ts). Covers: a performance recorded from live frames (uneven frame times) keeps the person's full track; replaying it
// with perfStep at 1× and 0.5× (any frame timing) puts the person where they were when played, within tolerance, and two replays with different
// frame timings agree exactly; a camera flown during the replay becomes an angle that replays the person exactly (same track, trim and speed),
// lasts the performance's real length even when shot in slow motion, and carries the same beats into the Render prompt; grouping, names,
// angle numbers, the replay clock's loop / hold / end, normalisation (JSON round-trip, bad links dropped) and shotForJob.
// Run: npx tsx test/previz-shoot.test.ts   (pure: no server, no network)
import assert from 'node:assert/strict';
const P = await import('../src/shared/previzTemplates.ts');
const A = await import('../src/shared/previzActor.ts');
const ok = (m: string) => console.log('ok ' + m);

// ---- 1. record a performance from live frames (as the player does: actorStep per frame, states stamped with wall time) ----
const base = P.defaultPlanShot('walk-by');
const rig = { yaw: -Math.PI / 2, pitch: -0.2, dist: 4 }; /* the camera looks towards +x: W walks along the street */
const frames = [1 / 60, 1 / 30, 1 / 144, 1 / 45, 0.05]; /* uneven screen frames */
let live: any = { pos: A.actorStart(base).pos, heading: Math.PI / 2, v: 0, d: 0, vel: [0, 0], beat: null };
const raw: { t: number; pos: [number, number, number]; heading: number; v: number; d: number }[] = []; const acting: { t: number; kind: any }[] = [];
let now = 100; let i = 0; /* the take starts 100 s into the page's clock: the track starts at 0 anyway */
while (now - 100 < 6) {
  const t = now - 100; const run = t > 2 && t < 3.5; const fwd = t < 4.4 ? 1 : 0;
  if (Math.abs(t - 4.6) < 0.02 && !acting.length) { live = { ...live, beat: { kind: 'wave', start: now } }; acting.push({ t, kind: 'wave' }); }
  const dt = frames[i++ % frames.length]; now += dt; /* like the frame loop: step by the time since the last frame, stamp with now */
  live = A.actorStep(live, { fwd, right: t > 1 && t < 1.6 ? 0.6 : 0, run, look: [0, 0], zoom: 0 }, rig, dt, now, 'walk-by');
  raw.push({ t: now, pos: live.pos, heading: live.heading, v: live.v, d: live.d });
}
const ks = A.resampleActor(raw); const actor = { keys: ks, beats: A.mergeBeats(A.moveBeats(ks), acting) };
const camKeys = ks.map((k) => ({ t: k.t, pos: [k.pos[0] - 3, 1.6, 4] as [number, number, number], yaw: 0, pitch: 0, fov: 38 }));
const perf = P.normalizeTake({ id: 'take-1', name: A.nextPerformanceName([]), keys: P.resampleKeys(camKeys), actor }, 0)!;
assert.ok(perf && perf.actor && perf.actor.keys.length > 150, 'the performance keeps the person’s track');
assert.equal(perf.name, 'Performance 1'); assert.ok(A.isPerformance(perf), 'a played take is a performance');
assert.deepEqual(perf.actor.beats.map((b) => b.kind), ['walk', 'run', 'walk', 'wave', 'stand'], 'beats: walk, run, walk, wave, then stand');
/* the live position at wall time t (between two recorded frames) */
const liveAt = (t: number) => { const r = raw.map((x) => ({ ...x, t: x.t - raw[0].t })); let j = 0; while (j < r.length - 2 && r[j + 1].t < t) j++; const a = r[j], b = r[j + 1]; const k = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
  return [0, 1, 2].map((n) => a.pos[n] + (b.pos[n] - a.pos[n]) * k); };
ok('performance: recorded from uneven live frames, full track at TAKE_HZ, beats from speeds + acting keys, named Performance 1');

// ---- 2. replay determinism ----
const replay = (rate: number, dts: number[]) => { const out: { u: number; pos: number[] }[] = []; let c = { u: perf.trimStart, hold: 0 }; let n = 0;
  while (true) { const s = A.perfStep(c, dts[n++ % dts.length], rate, perf.trimStart, perf.trimEnd, false); c = { u: s.u, hold: s.hold }; out.push({ u: s.u, pos: A.performanceAt(perf, s.u)!.pos }); if (s.ended) break; if (n > 1e5) throw new Error('never ended'); }
  return out; };
let worst = 0;
for (const [rate, dts] of [[1, [1 / 60]], [1, [1 / 30, 1 / 144, 0.04]], [0.5, [1 / 60, 1 / 25]]] as [number, number[]][]) {
  const r = replay(rate, dts); assert.ok(Math.abs(r[r.length - 1].u - perf.trimEnd) < 1e-9, 'the replay ends at the end of the performance');
  for (const f of r) { const want = liveAt(f.u); const err = Math.hypot(f.pos[0] - want[0], f.pos[2] - want[2]); worst = Math.max(worst, err); }
  const wall = r.length * dts.reduce((a, b) => a + b, 0) / dts.length; assert.ok(Math.abs(wall * rate - (perf.trimEnd - perf.trimStart)) < 0.15, `${rate}× takes ${(1 / rate).toFixed(0)}× the wall time`);
}
assert.ok(worst < 0.01, `replayed positions match the live performance within 1 cm (worst ${(worst * 100).toFixed(2)} cm)`);
{ const ra = replay(1, [1 / 60]), rb = replay(0.5, [1 / 23, 1 / 90]); /* different rates and frame timings meet at the same clock values: same pose */
  const shared = ra.filter((x) => rb.some((y) => Math.abs(y.u - x.u) < 1e-12)); assert.ok(shared.length >= 1);
  for (const x of shared) { const y = rb.find((q) => Math.abs(q.u - x.u) < 1e-12)!; assert.ok(x.pos.every((v, n) => Math.abs(v - y.pos[n]) < 1e-9), 'the pose depends on the replay clock alone'); } }
assert.deepEqual(A.performanceAt(perf, 4.7)!.beat?.kind, 'wave', 'the wave replays at its moment');
assert.equal(A.perfStep({ u: 1, hold: 0 }, 5, 1, 0, 6, true).u, 1.1, 'a long frame moves the replay at most 0.1 s');
const end = A.perfStep({ u: 6, hold: 0 }, 0.1, 1, 0, 6, true); assert.deepEqual([end.u, end.ended], [6, false], 'looping: the end holds');
let h = { u: 6, hold: 0 }; for (let n = 0; n < 6; n++) h = A.perfStep(h, 0.1, 1, 0, 6, true); assert.equal(h.u, 0, `then starts again after ${A.PERF_HOLD} s`);
assert.deepEqual(A.perfStep({ u: 5.95, hold: 0 }, 0.1, 1, 0, 6, false), { u: 6, hold: 0, ended: true }, 'recording: stops at the end');
assert.equal(A.perfStep({ u: -3, hold: 0 }, 0, 1, 1, 6, false).u, 1, 'the clock stays inside the trim'); assert.equal(A.perfStep({ u: NaN, hold: 0 }, NaN, NaN, 1, 6, true).u, 1);
ok(`replay: perfStep at 1× and 0.5× with uneven frames puts the person where they were (worst ${(worst * 100).toFixed(2)} cm); loop, hold, end, caps`);

// ---- 3. shoot an angle (in slow motion) ----
const shotRaw: { t: number; pos: [number, number, number]; yaw: number; pitch: number; fov: number }[] = [];
{ let c = { u: perf.trimStart, hold: 0 }; let n = 0; while (true) { const s = A.perfStep(c, [1 / 60, 1 / 40][n++ % 2], 0.5, perf.trimStart, perf.trimEnd, false); c = s;
  const p = A.performanceAt(perf, s.u)!.pos; shotRaw.push({ t: s.u, pos: [p[0] + 2 * Math.cos(s.u), 1.2 + s.u * 0.2, p[2] + 2 * Math.sin(s.u)], yaw: s.u, pitch: -0.1, fov: 32 }); if (s.ended) break; } }
const angle = P.normalizeTake(A.shootTake(perf, shotRaw, { id: 'take-2', angle: A.nextAngle([perf], perf.id), rate: 0.5 }), 1)!;
assert.ok(angle?.shoot && angle.shoot.of === 'take-1' && angle.shoot.angle === 1 && angle.shoot.rate === 0.5, 'the angle links to its performance');
assert.equal(angle.name, 'Performance 1 · Angle 1'); assert.ok(!A.isPerformance(angle), 'an angle is not a performance');
assert.ok(Math.abs(P.takeShotSeconds(angle) - P.takeShotSeconds(perf)) < 0.05, 'shot in slow motion, it still lasts the performance’s real length');
const shot = P.normalizePlanShot({ ...base, seconds: 6, cameraPath: { takes: [perf, angle], chosen: angle.id } });
const perfShot = { ...shot, cameraPath: { ...shot.cameraPath!, chosen: perf.id } };
for (let n = 0; n <= 60; n++) { const t = (6 * n) / 60; const k = shot.cameraPath!.takes[1]; const pk = shot.cameraPath!.takes[0];
  assert.deepEqual(A.actorAt(k.actor!, P.takeTimeAt(k, t), t), A.actorAt(pk.actor!, P.takeTimeAt(pk, t), t), `the angle replays the person exactly at ${t} s`); }
const mid = P.cameraAt(shot, 3); const want = shotRaw.reduce((b, x) => (Math.abs(x.t - 3) < Math.abs(b.t - 3) ? x : b));
assert.ok(Math.hypot(mid.pos[0] - want.pos[0], mid.pos[2] - want.pos[2]) < 0.25, 'the camera is where it was flown at that moment of the performance');
assert.equal(A.actionPromptFor(shot), A.actionPromptFor(perfShot), 'the angle has the same beats in the Render prompt'); assert.match(A.actionPromptFor(shot), /waves/);
assert.deepEqual(P.normalizePlanShot(JSON.parse(JSON.stringify(shot))), shot, 'an angle round-trips through JSON');
assert.equal(P.shotForJob(shot).cameraPath!.takes[0].shoot?.of, 'take-1', 'a mockup keeps the angle with its person'); assert.ok(P.shotForJob(shot).cameraPath!.takes[0].actor);
assert.equal(A.shootTake(perf, shotRaw.slice(0, 3), { id: 'x', angle: 1, rate: 1 }), null, 'a moment is too short to keep');
assert.equal(A.shootTake({ ...perf, actor: undefined }, shotRaw, { id: 'x', angle: 1, rate: 1 }), null, 'a camera-only take has nothing to shoot');
ok('angle: same person at every shot time (exact), real-speed length after slow motion, camera as flown, same Render beats, JSON + job round-trip');

// ---- 4. a trimmed, sped-up performance; groups, names, numbers, normalisation ----
const trimmed = { ...perf, trimStart: 1, trimEnd: 5, speed: 2 }; const late = shotRaw.filter((k) => k.t >= 1 && k.t <= 5);
const a2 = P.normalizeTake(A.shootTake(trimmed, late, { id: 'take-3', angle: 2, rate: 1 }), 2)!;
assert.deepEqual([a2.trimStart, a2.speed], [1, 2], 'the angle takes the performance’s trim and speed');
for (const t of [0, 0.7, 1.4, 2]) assert.deepEqual(A.actorAt(a2.actor!, P.takeTimeAt(a2, t)).pos, A.actorAt(trimmed.actor!, P.takeTimeAt(trimmed, t)).pos, 'trim + speed: same person');
assert.ok(P.takePoseAt(a2, 1).pos.every(Number.isFinite) && a2.keys[0].t === 0, 'the camera holds its first pose before its first key');
const takes = [perf, angle, a2, P.normalizeTake({ id: 'take-4', keys: camKeys }, 3)!];
const g = A.performanceGroups(takes); assert.equal(g.length, 1); assert.deepEqual(g[0].angles.map((k) => k.id), ['take-2', 'take-3'], 'angles grouped under their performance');
assert.equal(A.nextAngle(takes, 'take-1'), 3, 'the next angle number'); assert.equal(A.nextPerformanceName(takes), 'Performance 2');
assert.equal(A.nextPerformanceName([{ ...perf, name: 'Performance 7' }]), 'Performance 8', 'names never repeat');
assert.equal(P.normalizeTake({ ...angle, actor: undefined }, 0)!.shoot, undefined, 'an angle without its person is a plain take');
assert.equal(P.normalizeTake({ ...angle, shoot: { of: 'BAD ID', angle: 1 } }, 0)!.shoot, undefined, 'a broken link is dropped');
assert.equal(P.normalizeTake({ ...angle, shoot: { of: 'take-2', angle: 1 } }, 0)!.shoot, undefined, 'a take can’t be an angle of itself');
assert.deepEqual(P.normalizeTake({ ...angle, shoot: { of: 'take-1', angle: 400, rate: 0.01 } }, 0)!.shoot, { of: 'take-1', angle: 99, rate: 0.25 }, 'number and rate clamp');
const orphan = A.performanceGroups([angle]); assert.equal(orphan.length, 0, 'an angle whose performance was deleted stands alone (keeps its person)');
assert.equal(P.TAKE_MAX, 12, 'room for a performance and its angles');
ok('trim + speed carried to angles; groups, angle numbers, performance names; links normalised (missing person, bad id, self, clamps)');

// ---- the open city: a performance far from the centre (beyond the presets' 200 m) shoots and saves an angle there too ----
{ const off = 420; const cityKs = ks.map((k) => ({ ...k, pos: [k.pos[0] + off, k.pos[1], k.pos[2] - off] as [number, number, number] }));
  const cityPerf = P.normalizeTake({ id: 'take-1', name: 'Performance 1', keys: P.resampleKeys(camKeys.map((k) => ({ ...k, pos: [k.pos[0] + off, k.pos[1], k.pos[2] - off] as [number, number, number] }))), actor: { keys: cityKs, beats: actor.beats } }, 0)!;
  assert.ok(cityPerf.actor && Math.abs(cityPerf.actor.keys[0].pos[0] - (ks[0].pos[0] + off)) < 1e-3, 'the person keeps a city position');
  const cityCam = cityKs.filter((_, n) => n % 3 === 0).map((k) => ({ t: k.t, pos: [k.pos[0] + 2, 1.7, k.pos[2] + 3] as [number, number, number], yaw: 0.3, pitch: -0.1, fov: 35 }));
  const cityAngle = P.normalizeTake(A.shootTake(cityPerf, cityCam, { id: 'take-2', angle: 1, rate: 1 }), 1)!;
  assert.ok(cityAngle && cityAngle.shoot?.of === 'take-1', 'an angle of a city performance');
  assert.ok(Math.abs(cityAngle.keys[3].pos[0] - cityCam[1].pos[0]) < 3 && cityAngle.keys.every((k) => Math.abs(k.pos[0]) <= P.KEY_MAX), 'the angle stays where it was shot (KEY_MAX, not 200)');
  const shot = { ...P.defaultPlanShot('open-city'), cameraPath: { takes: [cityPerf, cityAngle], chosen: 'take-2' } } as any;
  assert.deepEqual(JSON.parse(JSON.stringify(P.normalizePlanShot(shot))).cameraPath.takes.length, 2);
  ok('open city: a performance far from the centre shoots an angle that keeps its place'); }
