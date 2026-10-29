// Direct a Shot (id plan-a-shot), 2026-10-24 (shared/previzTemplates.ts, tools/previz.ts, the 3D workflow row in shared/threeD.ts).
// Covers: the preset registry (5 presets, own restyle prompts), the one PlanShot object (normalise, defaults, clamps),
// a deterministic camera (same t → the same camera matrix; eased start and end), the import contract and the HTML check, and against its own
// mock server: a recorded MJPEG stream → a free MP4 job with the right duration, fps and size (ffprobe), two views → two outputs, and refusals.
// Run: npx tsx test/previz.test.ts   (own mock server :9243, temp data dir, no keys, no network)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'previz-')); process.env.OPENHIGGSFIELD_DATA_DIR ||= path.join(D, 'pure');
const P = await import('../src/shared/previzTemplates.ts');
const T = await import('../src/shared/threeD.ts');
const { getTool } = await import('../src/tools/registry.ts');
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9243); const B = `http://localhost:${PORT}`;
const ok = (m: string) => console.log('ok ' + m);

// ---- 1. registry ----
assert.deepEqual(P.PREVIZ_TEMPLATES.map((t) => t.id), ['walk-by', 'product-hero', 'walkthrough', 'diorama', 'establishing', 'open-city', 'open-city-golden', 'open-city-night']);
for (const t of P.PREVIZ_TEMPLATES) {
  assert.ok(t.name && t.tagline && t.build.length > 120, `${t.id}: name, tagline, build prompt`);
  assert.ok(t.restyle.long.length > t.restyle.short.length && t.restyle.short.length > 30, `${t.id}: long and short restyle`);
  assert.ok(t.restyle.long.includes('{colour}') && t.restyle.short.includes('{colour}'), `${t.id}: the colour goes into the restyle`);
  assert.doesNotMatch(t.restyle.short, /\b(clay|3D|blockout|previz)\b/i, `${t.id}: the short prompt describes the finished look only`);
  assert.ok(t.defaults.seconds >= 3 && t.defaults.seconds <= 10, `${t.id}: default length`);
}
const w = T.threeDWorkflowById('plan-a-shot')!; assert.equal(w.name, 'Direct a Shot'); assert.equal(w.status, 'ready'); assert.equal(w.category, 'video');
const tool = getTool('plan-a-shot')! as any; assert.equal(tool.listed, false); assert.equal(tool.media, '3d'); assert.ok(tool.presets.some((p: any) => p.id === w.mode));
assert.equal(T.threeDRedirectTarget('/tools/plan-a-shot', ''), '/tools/3d?workflow=plan-a-shot');
ok('registry: 5 presets with restyle prompts; Direct a Shot is a ready 3D workflow on its own hidden tool');

// ---- 2. the shot object ----
const d = P.defaultPlanShot('product-hero'); assert.equal(d.move, 'push-in'); assert.equal(d.aspect, '9:16'); assert.equal(d.note, '');
const n = P.normalizePlanShot({ template: 'diorama', colour: 'nope', move: 'zoom', speed: 'fast', seconds: 42, aspect: '4:3', fps: '30', seed: -1, note: 'x'.repeat(900) });
assert.deepEqual({ ...n, note: n.note.length }, { template: 'diorama', colour: 'orange', move: 'orbit', speed: 'fast', seconds: 10, aspect: '16:9', fps: 30, seed: 7, note: 600 });
assert.equal(P.normalizePlanShot(null).template, 'walk-by'); assert.equal(P.normalizePlanShot({ seconds: 1 }).seconds, 3);
assert.deepEqual(P.normalizePlanShot(JSON.parse(JSON.stringify(d))), d, 'round-trips through JSON');
assert.match(P.restylePromptFor({ ...d, colour: 'red' }, 'short'), /brick red/);
assert.match(P.buildPromptFor(d), /window\.previz/); assert.match(P.buildPromptFor(d), /three@0\.183\.2/);
ok('PlanShot: defaults per preset, unknown values fall back, lengths clamp to 3–10 s, JSON round-trip, colour words in the prompts');

// ---- 2b. the brand look + Add props (2026-10-26) ----
{ for (const t of P.PREVIZ_TEMPLATES) assert.equal(P.defaultPlanShot(t.id).colour, 'orange', `${t.id} starts orange`);
  assert.equal(P.colourOf('orange').hex, '#FF7A1A', 'the brand orange');
  const base = P.defaultPlanShot('walkthrough'); assert.equal(P.normalizePlanShot(base).props, undefined, 'no props by default');
  const raw = { ...base, props: [{ k: 'fu.couch', x: 1.23456, z: -3, r: 7, s: 2 }, { k: 'kk.bench', x: 9999, z: '2', r: 'x', s: 99 }, { k: 'nope.piece', x: 0, z: 0 }, { k: 'wb.bottle', x: NaN, z: null, s: 0 }, null, 'x', { k: '__proto__' }] };
  const n = P.normalizePlanShot(raw); assert.equal(n.props!.length, 3, 'unknown pieces and junk dropped');
  assert.deepEqual(n.props![0], { k: 'fu.couch', x: 1.235, z: -3, r: P.normalizePlanShot({ ...base, props: [{ k: 'fu.couch', x: 0, z: 0, r: 7, s: 1 }] }).props![0].r, s: 2 });
  assert.ok(Math.abs(n.props![0].r - (7 - Math.PI * 2)) < 1e-3, 'turn wrapped to ±π');
  assert.deepEqual(n.props![1], { k: 'kk.bench', x: P.KEY_MAX, z: 2, r: 0, s: P.PROP_SCALE_MAX }, 'clamped: position, size; bad turn → 0');
  assert.deepEqual(n.props![2], { k: 'wb.bottle', x: 0, z: 0, r: 0, s: P.PROP_SCALE_MIN });
  const many = P.normalizePlanShot({ ...base, props: Array.from({ length: 60 }, (_, i) => ({ k: 'fu.chair_A', x: i, z: 0, r: 0, s: 1 })) }); assert.equal(many.props!.length, P.PROPS_MAX, 'at most PROPS_MAX');
  assert.deepEqual(P.normalizePlanShot(JSON.parse(JSON.stringify(n))), n, 'JSON round-trip'); assert.deepEqual(P.shotForJob(n).props, n.props, 'props go with the recording');
  assert.equal(P.normalizePlanShot({ ...base, props: [] }).props, undefined, 'empty list → none'); }
ok('brand look + props: every preset starts orange; props normalised (known pieces, clamps, wrap, cap, round-trip, job)');

// ---- 3. deterministic camera ----
const matrix = (s: any, t: number) => { const c = P.cameraAt(s, t); return JSON.stringify([c.pos, c.look, c.fov].flat().map((x) => Math.round(x * 1e9) / 1e9)); };
for (const tpl of P.PREVIZ_TEMPLATES) for (const move of P.PREVIZ_MOVES.map((m) => m.id)) {
  const s = { ...P.defaultPlanShot(tpl.id), move } as any;
  for (const t of [0, 1.234, s.seconds / 2, s.seconds]) assert.equal(matrix(s, t), matrix(s, t), `${tpl.id}/${move} t=${t}: same camera`);
  assert.notEqual(matrix(s, 0), matrix(s, s.seconds), `${tpl.id}/${move}: the camera moves`);
  const eps = 1e-3; const v0 = Math.hypot(...P.cameraAt(s, eps).pos.map((x, i) => x - P.cameraAt(s, 0).pos[i])); if (tpl.id !== 'walk-by' /* follows a figure already walking */) assert.ok(v0 < 1e-4, `${tpl.id}/${move}: starts at rest`);
  for (const p of P.cameraPath(s, 24)) assert.ok(p.every(Number.isFinite), 'finite path');
  for (let i = 0; i <= 20; i++) { const c = P.cameraAt(s, (s.seconds * i) / 20); const dx = c.look[0] - c.pos[0], dy = c.look[1] - c.pos[1], dz = c.look[2] - c.pos[2]; assert.ok(Math.abs(dy) / Math.hypot(dx, dy, dz) < 0.97, `${tpl.id}/${move}: never straight down`); }
}
const r1 = P.rng(42), r2 = P.rng(42); assert.deepEqual([r1(), r1(), r1()], [r2(), r2(), r2()], 'seeded generator repeats');
assert.equal(P.cameraAt({ ...d, aspect: '9:16' }, 0).fov > P.cameraAt({ ...d, aspect: '16:9' }, 0).fov, true, 'tall frames open the lens');
ok('camera: same t → same matrix for every preset and move; moves start at rest, never point straight down; seeded randomness repeats');

// ---- 3b. regressions from the beginner audit ----
{ // t outside the clip clamps: before 0 is the first frame, after the end is the last (no jump at t = 0 or at the loop seam)
  for (const tpl of P.PREVIZ_TEMPLATES) for (const move of P.PREVIZ_MOVES.map((m) => m.id)) { const s = { ...P.defaultPlanShot(tpl.id), move } as any;
    assert.equal(matrix(s, -1), matrix(s, 0), `${tpl.id}/${move}: t < 0 is the first frame`); assert.equal(matrix(s, s.seconds + 3), matrix(s, s.seconds), `${tpl.id}/${move}: t > end is the last frame`);
    assert.deepEqual(P.subjectAt(s, -1), P.subjectAt(s, 0)); assert.deepEqual(P.subjectAt(s, s.seconds + 3), P.subjectAt(s, s.seconds));
    // the Depth view's range is fixed for the whole shot and sensible (it used to be re-fitted each frame, so the guide breathed)
    const r = P.depthRangeFor(s); assert.ok(Number.isFinite(r.near) && Number.isFinite(r.far) && r.near > 0 && r.far >= r.near + 1, `${tpl.id}/${move}: depth range ${r.near}–${r.far}`);
    assert.ok(r.far <= tpl.stage.depthFar + 1e-9, `${tpl.id}/${move}: depth far within the preset`); }
}
{ // the player's clock: never negative, a clamped step, the end holds, then wraps to exactly 0
  assert.equal(P.previzTime(-0.016), '0:00.0'); assert.equal(P.previzTime(NaN), '0:00.0'); assert.equal(P.previzTime(6), '0:06.0'); assert.equal(P.previzTime(65.25), '1:05.3');
  assert.deepEqual(P.previzPlayStep(0, 0, -0.02, 6), { t: 0, hold: 0, wrapped: false }, 'a first rAF stamp before the start never goes negative');
  assert.equal(P.previzPlayStep(1, 0, 5, 6).t, 1.1, 'a hidden tab or a long frame moves at most 0.1 s');
  assert.deepEqual(P.previzPlayStep(5.95, 0, 0.1, 6), { t: 6, hold: P.PREVIZ_HOLD_END, wrapped: false }, 'the end holds on the last frame');
  let st = { t: 0, hold: 0, wrapped: false }; let wraps = 0; const seen: number[] = [];
  for (let i = 0; i < 2000; i++) { st = P.previzPlayStep(st.t, st.hold, [0.016, 0.033, 0.008, 0.25][i % 4], 6); seen.push(st.t); if (st.wrapped) { wraps++; assert.equal(st.t, 0, 'wraps to exactly 0'); } }
  assert.ok(seen.every((x) => x >= 0 && x <= 6), 'the playhead stays inside the clip'); assert.ok(wraps >= 2, 'it loops');
}
{ // walk-by: the figure walks ON the pavement; the lower foot touches it exactly in every phase (no sinking, no floating)
  const s = P.defaultPlanShot('walk-by'); for (const t of [0, 1.3, 3, 6]) assert.equal(P.subjectAt(s, t).pos[1], P.WALK_FLOOR_Y, 'on the pavement');
  for (let i = 0; i <= 200; i++) { const pose = P.walkPose(i / 200); const soles = pose.legs.map((l) => pose.hipY - P.footDrop(l.thigh, l.shin));
    assert.ok(Math.min(...soles) > -1e-9 && Math.min(...soles) < 1e-9, `phase ${i / 200}: the lower foot is on the floor (${Math.min(...soles)})`); assert.ok(pose.hipY > 0.8 && pose.hipY < 1.05, 'hips at a human height'); }
  assert.deepEqual(P.walkPose(0.3), P.walkPose(0.3), 'pure');
  // the diorama train runs on the rail top
  const dz = P.defaultPlanShot('diorama'); assert.equal(P.subjectAt(dz, 2).pos[1], P.TRAIN_Y); assert.ok(Math.abs(Math.hypot(P.subjectAt(dz, 2).pos[0], P.subjectAt(dz, 2).pos[2]) - P.TRACK_R) < 1e-9);
}
{ // normalize: odd input falls back to the preset's own defaults, not a global number
  assert.equal(P.normalizePlanShot({ template: 'diorama', seconds: 'abc' }).seconds, 8, 'unreadable length → the preset default');
  assert.equal(P.normalizePlanShot({ template: 'diorama', seconds: '' }).seconds, 8); assert.equal(P.normalizePlanShot({ seconds: 3.6 }).seconds, 4, 'rounds');
  assert.equal(P.normalizePlanShot({ fps: '24' }).fps, 24); assert.equal(P.normalizePlanShot({ seed: 2.5 }).seed, 7); assert.equal(P.normalizePlanShot({ seed: 2147483650 }).seed, 3);
  assert.equal(P.normalizePlanShot({ aspect: '9:16', template: 'walk-by' }).aspect, '9:16');
}
ok('regressions: clamps at t < 0 and past the end, fixed depth range, the player clock (no negative time, hold + clean wrap), feet on the floor, train on the rail, normalize falls back per preset');

// ---- 3c. Fly the camera: takes (cameraPath), clean-up, ground clamp, map drags ----
{ const base = P.defaultPlanShot('walk-by');
  const mk = (n: number, f: (i: number) => any) => Array.from({ length: n }, (_, i) => f(i));
  const keys = mk(91, (i) => ({ t: i / 30, pos: [i * 0.05, 1.5, 6], yaw: 0, pitch: 0, fov: 38 })); /* 3 s, sliding right */
  // normalise: bad keys dropped, sorted, shifted to t = 0, angles clamped, yaw unwrapped, limits on count and length
  const messy = [{ t: 2, pos: [1, 1, 1], yaw: 3.1, pitch: 9, fov: 500 }, { t: 1, pos: [0, 1, 1], yaw: -3.1, pitch: 0, fov: 2 }, { t: 'x', pos: [0, 0, 0] }, { t: 1.5, pos: [NaN, 0, 0] }, null, { t: 3, pos: [2, 1, 1e6] }];
  const nk = P.normalizeKeys(messy)!; assert.deepEqual(nk.map((k) => k.t), [0, 1, 2]); assert.equal(nk[0].fov, P.FOV_MIN); assert.equal(nk[1].fov, P.FOV_MAX); assert.equal(nk[1].pitch, P.PITCH_MAX); assert.equal(nk[2].pos[2], P.KEY_MAX);
  assert.ok(Math.abs(nk[1].yaw - nk[0].yaw) < 0.2, `yaw unwrapped across ±180° (${nk[0].yaw} → ${nk[1].yaw})`);
  assert.equal(P.normalizeKeys([{ t: 0, pos: [0, 0, 0] }]), null, 'one key is not a take'); assert.equal(P.normalizeKeys('nope'), null);
  const long = P.normalizeKeys(mk(5000, (i) => ({ t: i / 60, pos: [0, 1, 0], yaw: 0, pitch: 0, fov: 40 })))!; assert.ok(long.length <= P.TAKE_MAX_SECONDS * P.TAKE_HZ + 1 && P.takeLength({ keys: long }) <= P.TAKE_MAX_SECONDS, 'long takes are cut at 30 s and thinned');
  const raw = { cameraPath: { chosen: 'b', takes: [{ id: 'a', keys }, { id: 'a', keys, smooth: 7, speed: 99, trimStart: -2, trimEnd: 99 }, { id: 'BAD ID', keys: [] }, ...mk(12, () => ({ keys }))] } };
  const s1 = P.normalizePlanShot({ ...base, ...raw }); const cp = s1.cameraPath!;
  assert.equal(cp.takes.length, P.TAKE_MAX, `at most ${P.TAKE_MAX} takes`); assert.notEqual(cp.takes[0].id, cp.takes[1].id, 'ids made unique'); assert.equal(cp.chosen, null, 'an unknown chosen id → the preset move');
  const t1 = cp.takes[1]; assert.deepEqual([t1.smooth, t1.speed, t1.trimStart, t1.trimEnd], [1, P.TAKE_SPEED_MAX, 0, 3], 'clean-up values clamp'); assert.equal(cp.takes[0].smooth, P.TAKE_SMOOTH_DEFAULT, 'gently smoothed by default');
  assert.deepEqual(P.normalizePlanShot(JSON.parse(JSON.stringify(s1))), s1, 'a shot with takes round-trips through JSON');
  assert.equal('cameraPath' in P.normalizePlanShot({ ...base, cameraPath: { takes: [] } }), false, 'no takes → no cameraPath');
  // exact replay: a chosen take drives the camera, the preset move comes back when none is chosen
  const take = (o: any = {}) => P.normalizePlanShot({ ...base, cameraPath: { chosen: 'a', takes: [{ id: 'a', keys, ...o }] } });
  const sr = take({ smooth: 0 }); for (const t of [0, 1, 2.5, 3]) { const c = P.cameraAt(sr, t); assert.ok(Math.abs(c.pos[0] - t * 1.5) < 1e-6 && c.pos[1] === 1.5, `raw take at t=${t}: x ${c.pos[0]}`); }
  assert.deepEqual(P.cameraAt(sr, 5).pos, P.cameraAt(sr, 3).pos, 'a take shorter than the shot holds its last pose');
  assert.notDeepEqual(P.cameraAt({ ...sr, cameraPath: { ...sr.cameraPath!, chosen: null } }, 1).pos, P.cameraAt(sr, 1).pos, 'no chosen take → the preset move');
  // smoothing: deterministic, 0 keeps the shake, more smoothing removes it
  const shaky = mk(181, (i) => ({ t: i / 30, pos: [i * 0.02, 1.5 + (i % 2 ? 0.08 : -0.08), 6], yaw: (i % 3) * 0.05, pitch: 0, fov: 38 }));
  const sh = (smooth: number) => take({ keys: shaky, smooth }); const jit = (s: any) => { let j = 0; for (let i = 1; i < 120; i++) j += Math.abs(P.cameraAt(s, i / 24).pos[1] - P.cameraAt(s, (i - 1) / 24).pos[1]); return j; };
  assert.ok(jit(sh(0)) > 5 * jit(sh(P.TAKE_SMOOTH_DEFAULT)), `smoothing removes the shake (${jit(sh(0)).toFixed(3)} → ${jit(sh(P.TAKE_SMOOTH_DEFAULT)).toFixed(3)})`);
  assert.ok(jit(sh(P.TAKE_SMOOTH_DEFAULT)) >= jit(sh(1)), 'more smoothing, less shake');
  for (const sm of [0, 0.35, 1]) for (const t of [0, 0.77, 3.3, 6]) assert.equal(matrix(sh(sm), t), matrix(P.normalizePlanShot(JSON.parse(JSON.stringify(sh(sm)))), t), `smooth ${sm} t=${t}: same takes + settings = same camera`);
  // trim and speed: shot t → take t
  const tk = take({ trimStart: 1, trimEnd: 2.5, speed: 0.5 }).cameraPath!.takes[0];
  assert.equal(P.takeTimeAt(tk, 0), 1); assert.equal(P.takeTimeAt(tk, 2), 2); assert.equal(P.takeTimeAt(tk, 9), 2.5, 'held at the trim end'); assert.equal(P.takeShotSeconds(tk), 3);
  assert.equal(P.fitTakeSpeed(tk, 6), 0.25); assert.equal(P.fitTakeSpeed({ ...tk, trimStart: 0, trimEnd: 3 }, 6), 0.5); assert.equal(P.fitTakeSpeed({ ...tk, trimStart: 0, trimEnd: 3 }, 0.5), P.TAKE_SPEED_MAX);
  const ts = take({ smooth: 0, trimStart: 1, trimEnd: 2.5, speed: 0.5 }); assert.ok(Math.abs(P.cameraAt(ts, 2).pos[0] - 2 * 1.5) < 1e-6, 'trim + speed move the camera along the take');
  // resampling a screen-rate recording to 30 keys a second
  const uneven = [0, 0.013, 0.05, 0.051, 0.2, 0.31, 0.5].map((t) => ({ t: t + 10, pos: [t * 2, 1, 0] as [number, number, number], yaw: t < 0.3 ? 3.1 : -3.1, pitch: 0, fov: 40 }));
  const rs = P.resampleKeys(uneven); assert.equal(rs.length, 16); assert.equal(rs[0].t, 0); assert.ok(Math.abs(rs[15].t - 0.5) < 1e-9); assert.ok(rs.every((k, i) => Math.abs(k.pos[0] - k.t * 2) < 1e-9), 'linear in between'); assert.ok(Math.abs(rs[15].yaw - 3.1) < 0.2, 'yaw unwrapped');
  // ground clamp: never below the ground or floor, never through the ceiling indoors
  const under = mk(31, (i) => ({ t: i / 10, pos: [0, 2 - i * 0.3, 0.5], yaw: 0, pitch: -0.4, fov: 38 }));
  for (const tpl of P.PREVIZ_TEMPLATES) { const s = P.normalizePlanShot({ ...P.defaultPlanShot(tpl.id), cameraPath: { chosen: 'a', takes: [{ id: 'a', keys: under, smooth: 0 }] } });
    for (let i = 0; i <= 30; i++) { const c = P.cameraAt(s, (s.seconds * i) / 30); assert.ok(c.pos[1] >= P.groundAt(tpl.id, c.pos[0], c.pos[2]) + P.CAM_CLEARANCE - 1e-9, `${tpl.id}: above the ground (${c.pos[1]})`); } }
  assert.equal(P.clampCamera('walkthrough', [0, 9, -4])[1], 2.7 - P.CAM_CLEARANCE, 'under the ceiling'); assert.equal(P.clampCamera('diorama', [0, 0, 0])[1], 0.32 + P.CAM_CLEARANCE, 'above the diorama base');
  assert.ok(P.clampCamera('establishing', [0, 0, -4])[1] > 1.9, 'above the hill'); assert.equal(P.hillHeight(0, -4), 1.9);
  // map drags: the subject and the camera move, clamped per preset; the figure stays on the pavement
  const pl = P.normalizePlanShot({ ...base, place: { aim: [2, 9], cam: [-1, 0] } }); assert.deepEqual(pl.place, { aim: [2, 8], cam: [-1, 0] });
  assert.equal(P.subjectAt(pl, 3).pos[2], 0.8, 'the walk-by figure stays on the pavement'); assert.ok(Math.abs(P.subjectAt(pl, 3).pos[0] - (P.subjectAt(base, 3).pos[0] + 2)) < 1e-9);
  const c0 = P.cameraAt(base, 2), c1 = P.cameraAt(pl, 2); assert.ok(Math.abs(c1.pos[0] - c0.pos[0] - 1) < 1e-9 && Math.abs(c1.pos[2] - c0.pos[2] - 0.8) < 1e-9, 'the camera follows the subject, plus its own drag');
  assert.ok(Math.abs(c1.look[0] - c0.look[0] - 2) < 1e-9, 'the aim follows the subject');
  assert.equal('place' in P.normalizePlanShot({ ...base, place: { aim: [0, 0], cam: [0, 0] } }), false, 'no drag → no place');
  const wt = P.normalizePlanShot({ ...P.defaultPlanShot('walkthrough'), place: { cam: [8, 8], aim: [8, 8] } }); for (let i = 0; i <= 10; i++) { const c = P.cameraAt(wt, (wt.seconds * i) / 10); assert.ok(c.pos[1] <= 2.55 + 1e-9); }
  // the Depth range of a flown take is measured to the subject (sensible), and the job keeps only the chosen take
  const dr = P.depthRangeFor(sr); assert.ok(dr.near > 0.3 && dr.far > dr.near + 1, `depth range for a take ${dr.near}–${dr.far}`);
  const j = P.shotForJob(take()); assert.equal(j.cameraPath!.takes.length, 1); assert.equal('cameraPath' in P.shotForJob(base), false);
  const many = P.normalizePlanShot({ ...base, cameraPath: { chosen: 'b', takes: [{ id: 'a', keys }, { id: 'b', keys: shaky }] } }); assert.deepEqual(P.shotForJob(many).cameraPath!.takes.map((k) => k.id), ['b']);
  assert.notEqual(P.cameraKeyOf(sr), P.cameraKeyOf(sh(0.5)));
  { const M = await import('../src/mediaPaths.ts'); const row = { input: { previz: { shot: take() }, refPaths: ['a.png'] } } as any; const back = M.toAbsDeep(M.toRelDeep(row, '/tmp/d'), '/tmp/d');
    assert.equal(back.input.previz.shot.cameraPath.takes[0].id, 'a', 'take ids are not media paths (stored rows keep them as they are)'); assert.equal(back.input.refPaths[0], '/tmp/d/a.png', 'real path fields still resolve'); }
  assert.ok(JSON.stringify(P.normalizePlanShot({ ...base, cameraPath: { chosen: null, takes: mk(8, () => ({ keys: long })) } })).length < 600_000, 'eight 30 s takes stay under 600 KB');
}
ok('fly the camera: takes normalise (bad keys, limits, unique ids, clamps, JSON round-trip), a chosen take drives the camera exactly, smoothing is deterministic and removes shake, trim/speed/fit, resampling, ground and ceiling clamp, map drags clamp per preset, jobs keep only the chosen take');

// ---- 4. import contract ----
const fn = () => undefined;
assert.equal(P.validatePrevizContract({ duration: 6, seek: fn, setPass: fn }).ok, true);
assert.equal(P.validatePrevizContract({ duration: 6, seek: fn, setPass: fn, passes: ['clay', 'depth'] }).passes.join(), 'clay,depth');
assert.equal(P.validatePrevizContract(undefined).ok, false);
assert.match(P.validatePrevizContract({ duration: 'x', seek: fn, setPass: fn }).problems.join(), /duration/);
assert.match(P.validatePrevizContract({ duration: 5, setPass: fn }).problems.join(), /seek/);
assert.match(P.validatePrevizContract({ duration: 5, seek: fn }).problems.join(), /setPass/);
assert.match(P.validatePrevizContract({ duration: 5, seek: fn, setPass: fn, passes: ['normal'] }).problems.join(), /passes/);
assert.match(P.validatePrevizContract({ duration: 90, seek: fn, setPass: fn }).problems.join(), /60 s/);
assert.deepEqual(P.checkSceneHtml('<html><script>window.previz = {}</script></html>'), []);
assert.match(P.checkSceneHtml('').join(), /empty/); assert.match(P.checkSceneHtml('hello').join(), /HTML/); assert.match(P.checkSceneHtml('<canvas></canvas>').join(), /previz/);
assert.match(P.checkSceneHtml('<html>previz', 6e6).join(), /5 MB/);
const sample = fs.readFileSync(path.resolve(ROOT, '..', 'docs', 'plan-a-shot', 'sample-scene.html'), 'utf8'); assert.deepEqual(P.checkSceneHtml(sample), [], 'the sample scene passes the check');
ok('import contract: duration, seek, setPass and passes checked; the HTML check refuses empty, non-HTML, huge and contract-less files');

// ---- 5. server: recording → MP4 ----
const data = path.join(D, 'srv'); fs.mkdirSync(data, { recursive: true });
const env = { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: data, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '200',
  FAL_KEY: '', COMFY_API_KEY: '', REPLICATE_API_TOKEN: '', OPENHIGGSFIELD_USE_LOCAL: '0' };
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'pipe'], detached: true }); let errs = ''; srv.stderr!.on('data', (c) => { errs += c; });
const stop = () => { try { process.kill(-srv.pid!); } catch { /* gone */ } };
/* an MJPEG stream like the browser sends: frames JPEG-encoded back to back */
const stream = (frames: number, w: number, h: number, file: string) => { execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=s=${w}x${h}:r=24`, '-frames:v', String(frames), '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '5', file]); return fs.readFileSync(file); };
const probe = (url: string) => { const f = path.join(data, url.replace('/files/', '')); const o = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames,codec_name:format=duration', '-of', 'json', f]).toString());
  return { w: o.streams[0].width, h: o.streams[0].height, fps: o.streams[0].r_frame_rate, frames: Number(o.streams[0].nb_read_frames), dur: Number(o.format.duration), codec: o.streams[0].codec_name }; };
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }
  const j = async (u: string, init?: RequestInit) => { const r = await fetch(B + u, init); return { status: r.status, body: await r.json().catch(() => ({})) as any }; };
  const done = async (id: string) => { for (let i = 0; i < 100; i++) { const b = (await j(`/api/jobs/${id}`)).body; if (!['queued', 'running'].includes(b.status)) return b; await new Promise((r) => setTimeout(r, 200)); } throw new Error(`job ${id} did not finish`); };
  const send = (shot: any, passes: string[], bufs: Buffer[], extra: Record<string, string> = {}) => { const fd = new FormData(); fd.append('types', '["plan-a-shot"]'); fd.append('shot', JSON.stringify(shot)); fd.append('passes', JSON.stringify(passes));
    for (const [k, v] of Object.entries({ frameCount: String(P.previzFrameCount(shot.seconds, shot.fps)), width: '320', height: '180', ...extra })) fd.append(k, v);
    bufs.forEach((b, i) => fd.append('streams', new Blob([b], { type: 'video/x-motion-jpeg' }), `${passes[i] ?? 'x'}.mjpeg`)); return j('/api/tools/plan-a-shot/jobs', { method: 'POST', body: fd }); };
  const q = (await j('/api/tools/plan-a-shot/price?types=plan-a-shot')).body; assert.equal(q.credits, 0, 'free');
  const wf = (await j('/api/3d-workflows')).body; assert.equal(wf.workflows.find((x: any) => x.id === 'plan-a-shot').runnable, true);
  // one view, 3 s at 24 fps = 72 frames
  const shot = { ...P.defaultPlanShot('walk-by'), seconds: 3, fps: 24 };
  const a = await send(shot, ['clay'], [stream(72, 320, 180, path.join(D, 'a.mjpeg'))]); assert.equal(a.status, 200, JSON.stringify(a.body).slice(0, 300)); assert.equal(a.body.cost, 0);
  const ab = await done(a.body.id); assert.equal(ab.status, 'done', ab.error); assert.equal(ab.outputs.length, 1); assert.equal(ab.outputs[0].kind, 'video'); assert.equal(ab.outputs[0].label, 'Clay view');
  const pa = probe(ab.resultUrl); assert.deepEqual([pa.w, pa.h, pa.fps, pa.frames, pa.codec], [320, 180, '24/1', 72, 'h264']); assert.ok(Math.abs(pa.dur - 3) < 0.05, `duration ${pa.dur}`);
  assert.equal(ab.input.previz.shot.template, 'walk-by'); assert.match(ab.input.previz.restyle.short, /warm orange/);
  { // a flown take travels with the job (only the chosen one) and comes back from GET /api/jobs/:id (a key ending in Path is not a host path here)
    const keys = Array.from({ length: 31 }, (_, i) => ({ t: i / 10, pos: [i * 0.1, 1.5, 6], yaw: 0, pitch: 0, fov: 38 }));
    const flown = { ...shot, cameraPath: { chosen: 'b', takes: [{ id: 'a', keys }, { id: 'b', keys, smooth: 0.5 }] } };
    const f = await send(flown, ['clay'], [stream(72, 320, 180, path.join(D, 'f.mjpeg'))]); assert.equal(f.status, 200, JSON.stringify(f.body).slice(0, 300));
    const fb = await done(f.body.id); const cp = fb.input.previz.shot.cameraPath; assert.ok(cp, 'the job keeps the take'); assert.deepEqual(cp.takes.map((k: any) => k.id), ['b']); assert.equal(cp.chosen, 'b'); assert.equal(cp.takes[0].keys.length, 31);
  }
  ok(`one view: 72 JPEG frames → MP4 320×180, 24 fps, 72 frames, ${pa.dur.toFixed(2)} s; free; the shot and restyle prompts kept for step 2`);
  // two views, 4 s at 30 fps = 120 frames each
  const s2 = { ...P.defaultPlanShot('diorama'), seconds: 4, fps: 30 }; const buf2 = stream(120, 320, 180, path.join(D, 'b.mjpeg'));
  const b = await send(s2, ['clay', 'depth'], [buf2, buf2]); assert.equal(b.status, 200, JSON.stringify(b.body).slice(0, 300));
  const bb = await done(b.body.id); assert.equal(bb.status, 'done', bb.error); assert.deepEqual(bb.outputs.map((o: any) => o.label), ['Clay view', 'Depth view']);
  for (const o of bb.outputs) { const p = probe(o.url); assert.deepEqual([p.fps, p.frames], ['30/1', 120]); assert.ok(Math.abs(p.dur - 4) < 0.05); }
  ok('two views: clay + depth → two MP4 outputs, 30 fps, 120 frames, 4 s each');
  // refusals
  assert.equal((await send(shot, ['clay'], [])).status, 400, 'no recording');
  assert.equal((await send(shot, ['clay'], [stream(72, 320, 180, path.join(D, 'c.mjpeg'))], { frameCount: '50' })).status, 400, 'wrong frame count');
  assert.equal((await send({ ...shot, seconds: 12 }, ['clay'], [stream(72, 320, 180, path.join(D, 'c.mjpeg'))])).status, 400, 'too long');
  assert.equal((await send({ ...shot, fps: 25 }, ['clay'], [stream(72, 320, 180, path.join(D, 'c.mjpeg'))])).status, 400, 'odd fps');
  assert.equal((await send(shot, ['normal'], [stream(72, 320, 180, path.join(D, 'c.mjpeg'))])).status, 400, 'unknown view');
  assert.equal((await send(shot, ['clay', 'depth'], [stream(72, 320, 180, path.join(D, 'c.mjpeg'))])).status, 400, 'one stream per view');
  assert.equal((await send(shot, ['clay'], [Buffer.from('tiny')])).status, 400, 'too small');
  assert.equal((await send(shot, ['clay'], [stream(72, 320, 180, path.join(D, 'c.mjpeg'))], { width: '321' })).status, 400, 'odd size');
  ok('refused: no recording, wrong frame count, too long, odd fps, unknown view, stream/view mismatch, a truncated stream, odd size');
} catch (e) { console.error(errs.slice(-2000)); throw e; } finally { stop(); }
console.log('all Direct a Shot tests passed');
