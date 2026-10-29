// Direct a Shot, game mode (2026-10-26; shared/previzActor.ts + the take's actor in shared/previzTemplates.ts + makeRealPrompt).
// Covers: the actor track (normalise, JSON round-trip, clamps, beats), resampling, move beats read back from speeds (with hysteresis),
// actorAt (between keys, past the end, the acting beat in force), actorStep (camera-relative WASD, run, pinned beats, the walkable area),
// followCamera (behind the person, above the ground, inside the house), the Render prompt line (trim + speed, notes as English, no person →
// nothing), makeRealPrompt weaving it in, and readPad (dead zone, triggers, buttons, presses).
// Run: npx tsx test/previz-actor.test.ts   (pure: no server, no network)
import assert from 'node:assert/strict';
const P = await import('../src/shared/previzTemplates.ts');
const A = await import('../src/shared/previzActor.ts');
const M = await import('../src/shared/makeItReal.ts');
const ok = (m: string) => console.log('ok ' + m);
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;

// ---- 1. the track ----
const camKeys = Array.from({ length: 181 }, (_, i) => ({ t: i / 30, pos: [i / 60, 1.6, 3] as [number, number, number], yaw: 0, pitch: 0, fov: 38 }));
const speedAt = (t: number) => (t < 2 ? 1.2 : t < 4 ? 3.5 : 0);
let dist = 0; const akeys = Array.from({ length: 181 }, (_, i) => { const t = i / 30; if (i) dist += speedAt(t) / 30; return { t, pos: [dist - 3, 0.14, 0] as [number, number, number], heading: Math.PI / 2, v: speedAt(t), d: dist }; });
const mv = A.moveBeats(akeys); assert.deepEqual(mv.map((b) => b.kind), ['walk', 'run', 'stand'], 'walk → run → stand read from the speeds');
assert.ok(near(mv[1].t, 2, 0.05) && near(mv[2].t, 4, 0.05), 'move beats start where the speed changed');
const flick = akeys.map((k, i) => ({ ...k, v: i % 4 === 1 ? 0.1 : 1 })); assert.deepEqual(A.moveBeats(flick).map((b) => b.kind), ['walk'], 'speed flicker under BEAT_MIN never makes a beat');
const setOff = akeys.map((k) => ({ ...k, v: k.t < 0.4 ? 0 : 1.2 })); assert.deepEqual(A.moveBeats(setOff).map((b) => [b.kind, b.t]), [['walk', 0]], 'the moment before the first step is not a beat');
const beats = A.mergeBeats(mv, [{ t: 0, kind: 'walk', note: 'nervously' }, { t: 3, kind: 'wave', note: 'laughs' }]);
assert.equal(beats.length, 4); assert.equal(beats[0].note, 'nervously', 'a note on the same beat is kept');
const base = P.defaultPlanShot('walk-by');
const shot = P.normalizePlanShot({ ...base, cameraPath: { chosen: 'a', takes: [{ id: 'a', keys: camKeys, smooth: 0, actor: { keys: akeys, beats } }] } });
const tr = shot.cameraPath!.takes[0].actor!; assert.ok(tr && tr.keys.length === 181 && tr.beats.length === 4, 'the take keeps its actor');
assert.deepEqual(P.normalizePlanShot(JSON.parse(JSON.stringify(shot))), shot, 'a take with an actor round-trips through JSON');
assert.equal(P.normalizePlanShot({ ...base, cameraPath: { chosen: 'a', takes: [{ id: 'a', keys: camKeys }] } }).cameraPath!.takes[0].actor, undefined, 'camera-only takes stay camera-only');
const dirty = A.normalizeActor({ keys: [{ t: 5, pos: [1e9, 0, 0], heading: 0, v: 99, d: -4 }, { t: 6, pos: [0, 0, 0], heading: 7, v: 1, d: 1 }, { t: 'x' }, null], beats: [{ t: 5.5, kind: 'wave', note: 'big "smile" <b>\nnow' + 'x'.repeat(200) }, { t: 5, kind: 'hack' }, { t: 99, kind: 'jump' }] })!;
assert.equal(dirty.keys[0].t, 0, 'keys start at 0'); assert.equal(dirty.keys[0].pos[0], 650, 'positions clamp (the open city reaches about ±600 m)'); assert.equal(dirty.keys[0].v, 20, 'speed clamps'); assert.ok(near(dirty.keys[1].heading, 7 - 2 * Math.PI, 1e-3), 'heading unwrapped');
assert.equal(dirty.beats.length, 2, 'unknown beat kinds dropped'); assert.equal(dirty.beats[0].t, 0.5, 'beats shift with the keys'); assert.equal(dirty.beats[1].t, 1, 'beats past the end clamp to it');
assert.ok(dirty.beats[0].note!.length <= A.NOTE_MAX && !/["<>\n]/.test(dirty.beats[0].note!), 'notes cleaned and capped');
assert.equal(A.normalizeActor({ keys: [{ t: 0, pos: [0, 0, 0] }] }), null, 'one key is not a track'); assert.equal(A.normalizeActor('nope'), null);
const rs = A.resampleActor([{ t: 10, pos: [0, 0, 0], heading: 3, v: 0, d: 0 }, { t: 10.5, pos: [1, 0, 0], heading: -3, v: 2, d: 1 }]);
assert.equal(rs.length, 16); assert.ok(rs[15].heading > 3, 'resampling unwraps the heading (no spin at ±180°)'); assert.ok(near(rs[8].pos[0], 8 / 15, 1e-9));
ok('actor track: move beats from speeds with hysteresis, merge with notes, normalise + clamp + clean, JSON round-trip, resample');

// ---- 2. actorAt / actorStep / followCamera ----
const p1 = A.actorAt(tr, 1); assert.ok(near(p1.pos[0], akeys[30].pos[0], 1e-3) && p1.v === 1.2 && p1.beat === null);
const p3 = A.actorAt(tr, 3.4); assert.equal(p3.beat?.kind, 'wave'); assert.ok(near(p3.beat!.local, 0.4, 1e-6), 'the wave plays from its start');
assert.equal(A.actorAt(tr, 9).v, 0, 'past the end they stand'); assert.deepEqual(A.actorAt(tr, 9).pos, tr.keys[tr.keys.length - 1].pos);
assert.equal(A.beatAt([{ t: 1, kind: 'dance' }, { t: 2, kind: 'jump' }], 2.5)?.kind, 'jump', 'a new beat cuts the one before');
assert.equal(A.beatAt([{ t: 1, kind: 'jump' }], 1 + A.beatSeconds('jump') + 0.01), null, 'a beat ends after its length');
const rig = { yaw: 0, pitch: -0.2, dist: 3.6 }; let s: any = { pos: A.clampActor('walk-by', 0, 0), heading: 0, v: 0, d: 0, vel: [0, 0], beat: null };
for (let i = 0; i < 40; i++) s = A.actorStep(s, { fwd: 1, right: 0, run: false, look: [0, 0], zoom: 0 }, rig, 1 / 30, i / 30, 'walk-by');
assert.ok(s.pos[2] < -0.8 && Math.abs(s.pos[0]) < 1e-6, 'W walks where the camera looks (−z at yaw 0)'); assert.ok(near(s.v, A.ACTOR_WALK, 0.05), 'walking speed'); assert.ok(Math.abs(Math.abs(s.heading) - Math.PI) < 0.05, 'turns to face the way it walks');
assert.ok(s.pos[2] >= -2.1 && near(s.pos[1], P.WALK_FLOOR_Y), 'stays on the pavement, feet on it');
let r: any = { ...s, pos: A.clampActor('walk-by', 0, 0), vel: [0, 0] }; for (let i = 0; i < 60; i++) r = A.actorStep(r, { fwd: 0, right: 1, run: true, look: [0, 0], zoom: 0 }, rig, 1 / 30, i / 30, 'walk-by');
assert.ok(r.pos[0] > 4 && near(r.v, A.ACTOR_RUN, 0.1), 'D + run strafes right at running speed'); assert.ok(r.d > 4, 'distance walked grows');
let sit: any = { ...r, vel: [0, 0], beat: { kind: 'sit', start: 0 } }; const x0 = sit.pos[0]; for (let i = 0; i < 30; i++) sit = A.actorStep(sit, { fwd: 1, right: 0, run: false, look: [0, 0], zoom: 0 }, rig, 1 / 30, i / 30, 'walk-by');
assert.ok(near(sit.pos[0], x0, 1e-3) && sit.beat?.kind === 'sit', 'sitting holds them in place');
const away = A.clampActor('walkthrough', 9, -40); assert.deepEqual([away[0], away[2]], [2.15, -10.6], 'the house keeps them inside');
const ped = A.clampActor('product-hero', 0.1, 0); assert.ok(Math.hypot(ped[0], ped[2]) >= 0.849, 'never through the pedestal');
assert.equal(A.actorAllowed('diorama'), false); assert.equal(A.actorAllowed('walk-by'), true);
const fc = A.followCamera([0, 0.14, 0], { yaw: 0, pitch: -0.3, dist: 4 }, 'walk-by', 38); assert.ok(fc.pos[2] > 3 && fc.pos[1] > 1.6, 'behind (+z at yaw 0) and above'); assert.equal(fc.fov, 38);
const low = A.followCamera([0, 0.14, 0], { yaw: 0, pitch: 0.5, dist: 9 }, 'walk-by', 38); assert.ok(low.pos[1] >= P.CAM_CLEARANCE, 'never under the ground');
const inside = A.followCamera([0, 0, 2.5], { yaw: 0, pitch: -0.2, dist: 9 }, 'walkthrough', 58); assert.ok(inside.pos[2] <= 2.95 && inside.pos[1] <= 2.7, 'inside the house');
const st = A.actorStart(base); assert.ok(st.pos[0] < 0 && near(st.heading, Math.PI / 2), 'walk-by starts where the scripted walk starts');
ok('actorAt between keys and past the end, beats in force; GTA-style step (camera-relative, run, pinned sit, walkable area); follow camera clamps');

// ---- 3. the Render prompt ----
const line = A.actionPromptFor(shot); assert.equal(line, 'The person: 0–2 s walks nervously, 2–4 s runs, 3 s waves and laughs, 4–6 s stands still.');
const fast = P.normalizePlanShot({ ...shot, cameraPath: { chosen: 'a', takes: [{ ...shot.cameraPath!.takes[0], trimStart: 1, speed: 2 }] } });
assert.match(A.actionPromptFor(fast), /^The person: 0–0\.5 s walks nervously, 0\.5–1\.5 s runs, 1 s waves and laughs, 1\.5–2\.5 s stands still\.$/, 'trim and speed map the beats to shot seconds');
assert.equal(A.actionPromptFor(base), '', 'the preset move has no person'); assert.equal(A.actionPromptFor(P.normalizePlanShot({ ...base, cameraPath: { chosen: 'a', takes: [{ id: 'a', keys: camKeys }] } })), '');
const sitShot = P.normalizePlanShot({ ...base, cameraPath: { chosen: 'a', takes: [{ id: 'a', keys: camKeys, smooth: 0, actor: { keys: akeys, beats: [...beats, { t: 4.2, kind: 'sit' }] } }] } });
assert.equal(A.actionPromptFor(sitShot), 'The person: 0–2 s walks nervously, 2–4 s runs, 3 s waves and laughs, 4 s sits down.', 'standing still while sitting is not said twice');
assert.equal(A.withNote('walks', 'nervous'), 'walks, nervous'); assert.equal(A.withNote('sits down', 'slowly'), 'sits down slowly'); assert.equal(A.withNote('dances', 'with joy.'), 'dances with joy');
assert.equal(A.withNote('waves', ''), 'waves');
const pv = { restyle: { short: 'A fictional adult walks down a sunny street.' }, shot: { note: 'golden hour' }, action: line };
assert.equal(M.makeRealPrompt(pv), `A fictional adult walks down a sunny street. Golden hour. ${line}`, 'the beats go after the scene and the note');
assert.equal(M.makeRealPrompt({ restyle: { short: 'Base.' }, shot: { note: '' } }), 'Base.', 'no beats → the prompt is unchanged');
assert.doesNotMatch(line, M.PROMPT_AVOID, 'the beats line never says mannequin or 3D');
ok('Render prompt: beats in shot seconds with notes as English, trim + speed applied, woven after the scene and note; nothing without a person');

// ---- 4. game controllers ----
assert.deepEqual(A.stick(0.1, 0.05), [0, 0], 'dead zone'); const full = A.stick(1, 0); assert.ok(near(full[0], 1) && full[1] === 0, 'full range at the rim');
const half = A.stick(0.58, 0)[0]; assert.ok(half > 0.45 && half < 0.55, 'rescaled from the dead zone edge');
const btn = (on: number[]) => Array.from({ length: 17 }, (_, i) => ({ pressed: on.includes(i), value: on.includes(i) ? 1 : 0 }));
const pad = A.readPad([0.2, -1, 0, 0.9], [...btn([0, 5, 12]).slice(0, 6), { pressed: false, value: 0.03 }, { pressed: false, value: 0.8 }, ...btn([12]).slice(8)]);
assert.ok(pad.move[1] < -0.85 && pad.look[1] > 0.8 && pad.lt === 0 && near(pad.rt, 0.8), 'sticks and analogue triggers (tiny trigger values read as rest)');
assert.ok(pad.buttons.a && pad.buttons.rb && pad.buttons.up && !pad.buttons.b, 'standard mapping: A, RB, d-pad up');
assert.deepEqual(A.padPressed(pad.buttons, { ...pad.buttons, a: false }), ['a'], 'a press acts once'); assert.deepEqual(A.padPressed(pad.buttons, pad.buttons), []);
const empty = A.readPad([], []); assert.deepEqual([empty.move, empty.look, empty.lt, empty.rt], [[0, 0], [0, 0], 0, 0], 'missing axes and buttons read as rest');
ok('readPad: round dead zone rescaled, triggers, standard buttons, presses fire once, a pad with missing parts is at rest');
