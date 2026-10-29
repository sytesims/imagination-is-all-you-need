// Direct a Shot, cinematic camera (2026-10-27; shared/previzCamera.ts + roll / focus / lens / size / shake in shared/previzTemplates.ts).
// Covers: roll and focus default to 0 and leave every existing camera exactly as it was (a golden hash of the camera before this change);
// the Shot Recipes use the Camera Moves catalogue's ids and labels; every recipe on every preset bakes to a normal take that is finite,
// deterministic (same shot → same keys), lasts the shot (3 s and 10 s), records at TAKE_HZ, stays level unless it is the Dutch tilt, keeps
// inside the walkthrough's rooms and out of the city's buildings; a recipe on a performance is an angle that replays the person; re-baking with
// a new lens / size keeps the take's id; the 9:16 and 1:1 frames open the lens like the presets do.
// Run: npx tsx test/previz-camera.test.ts   (pure: no server, no network)
import assert from 'node:assert/strict'; import { createHash } from 'node:crypto';
const P = await import('../src/shared/previzTemplates.ts');
const C = await import('../src/shared/previzCamera.ts');
const { CAMERA_CATALOG } = await import('../src/cinema/cameraCatalog.ts');
const { openCityWorld } = await import('../src/shared/world/openCity.ts');
const W = await import('../src/shared/world/worldSpec.ts');
const ok = (m: string) => console.log('ok ' + m);
const finite = (c: { pos: number[]; look: number[]; fov: number; roll: number }) => [...c.pos, ...c.look, c.fov, c.roll].every(Number.isFinite);

// ---- 1. roll / focus default to 0: the camera is exactly what it was before they existed ----
{ const rows: number[] = [];
  for (const tpl of P.PREVIZ_TEMPLATES) for (const move of P.PREVIZ_MOVES.map((m) => m.id)) for (const aspect of ['16:9', '9:16']) {
    const s = { ...P.defaultPlanShot(tpl.id), move, aspect, place: { cam: [1, -0.5], aim: [0.4, 0.3] } } as any;
    for (let i = 0; i <= 12; i++) { const c = P.cameraAt(s, (s.seconds * i) / 12); assert.equal(c.roll, 0, 'presets stay level'); rows.push(...c.pos, ...c.look, c.fov); } }
  const keys = Array.from({ length: 40 }, (_, i) => ({ t: i / 10, pos: [Math.sin(i / 5) * 3, 1.5 + i * 0.01, 4 - i * 0.1], yaw: i * 0.03, pitch: -0.1, fov: 38 + i * 0.1 }));
  for (const smooth of [0, 0.35, 1]) { const s = P.normalizePlanShot({ ...P.defaultPlanShot('walk-by'), cameraPath: { takes: [{ id: 'take-1', keys, smooth }], chosen: 'take-1' } });
    for (let i = 0; i <= 30; i++) { const c = P.cameraAt(s, (s.seconds * i) / 30); assert.equal(c.roll, 0); rows.push(...c.pos, ...c.look, c.fov); } }
  /* computed on main (4c38b760) before roll, focus, lens, size and shake were added */
  assert.equal(createHash('sha1').update(rows.map((x) => x.toFixed(9)).join(',')).digest('hex'), '846025d67834d52627a5ec25de5b5ff417ae0b3d', 'cameraAt is unchanged for every preset, move, aspect, map drag and flown take');
  const zero = keys.map((k) => ({ ...k, roll: 0, focus: 0 })); assert.deepEqual(P.normalizeKeys(zero), P.normalizeKeys(keys), 'roll 0 / focus 0 are not written: the take reads back the same');
  assert.equal('roll' in P.normalizeKeys(keys)![0], false);
  const rolled = P.normalizeKeys(keys.map((k, i) => ({ ...k, roll: i * 0.1, focus: 3 })))!; assert.equal(rolled[39].roll, Math.round(C.ROLL_MAX * 1e4) / 1e4, 'roll clamps to ±30°'); assert.equal(rolled[5].focus, 3);
  assert.deepEqual(P.normalizeKeys(JSON.parse(JSON.stringify(rolled))), rolled, 'JSON round-trip with roll and focus');
  const rs = P.resampleKeys(rolled.slice(0, 5)); assert.ok(rs.some((k) => (k.roll ?? 0) > 0) && rs.every((k) => k.focus === 3), 'resampling keeps roll and focus');
  const s = P.normalizePlanShot({ ...P.defaultPlanShot('walk-by'), cameraPath: { takes: [{ id: 'take-1', keys: rolled }], chosen: 'take-1' } }); assert.ok(P.cameraAt(s, 3).roll > 0, 'a rolled take rolls the camera'); }
ok('roll and focus: default 0, not written when 0, clamped, round-trip; cameraAt matches the golden hash from before');

// ---- 2. the recipes share the Camera Moves vocabulary ----
assert.ok(C.SHOT_RECIPES.length >= 12);
for (const r of C.SHOT_RECIPES) { const e = CAMERA_CATALOG.find((x) => x.id === r.id); assert.ok(e, `${r.id} is a Camera Moves id`); assert.equal(r.label, e!.label, `${r.id}: same label as Video's Camera Moves`);
  assert.ok(r.hint.length > 20 && C.isLens(r.lens) && C.isShotSize(r.size)); }
ok(`recipes: ${C.SHOT_RECIPES.length} recipes, every id and label from the Camera Moves catalogue`);

// ---- 3. every recipe on every preset: a normal, deterministic take ----
const inBox = (p: number[], b: { x0: number; x1: number; z0: number; z1: number; y0?: number; y1: number }) => p[0] > b.x0 && p[0] < b.x1 && p[2] > b.z0 && p[2] < b.z1 && p[1] < b.y1;
for (const tpl of P.PREVIZ_TEMPLATES) for (const seconds of [3, 10]) for (const aspect of ['16:9', '9:16', '1:1'] as const) {
  if (aspect !== '16:9' && seconds === 3) continue;
  const s = { ...P.defaultPlanShot(tpl.id), seconds, aspect };
  for (const r of C.SHOT_RECIPES) { const rec = { id: r.id, lens: r.lens, size: r.size };
    const tk = C.recipeTake(s, rec, { id: 'take-1', index: 0 })!; assert.ok(tk, `${tpl.id}/${r.id}: a take`);
    assert.deepEqual(C.recipeTake(s, rec, { id: 'take-1', index: 0 }), tk, `${tpl.id}/${r.id}: the same shot bakes the same keys`);
    assert.deepEqual(P.normalizeTake(JSON.parse(JSON.stringify(tk)), 0), tk, `${tpl.id}/${r.id}: normalised and JSON-safe`);
    assert.deepEqual(tk.recipe, rec); assert.equal(tk.keys.length, seconds * P.TAKE_HZ + 1, 'one key per 1/30 s'); assert.ok(Math.abs(P.takeLength(tk) - seconds) < 1e-6, 'lasts the shot');
    assert.equal(tk.smooth === 0 || r.id !== 'whip', true, 'the whip is never smoothed');
    const sh = { ...s, cameraPath: { takes: [tk], chosen: tk.id } }; const cams = Array.from({ length: 21 }, (_, i) => P.cameraAt(sh, (seconds * i) / 20));
    assert.ok(cams.every(finite), `${tpl.id}/${r.id}: finite`);
    if (!r.dutch) assert.ok(cams.every((c) => c.roll === 0), `${tpl.id}/${r.id}: level horizon`); else assert.ok(Math.abs(cams[20].roll - (12 * Math.PI) / 180) < 1e-3, 'Dutch tilt ends at 12°');
    if (aspect === '16:9' && !r.ownLens) assert.ok(Math.abs(cams[10].fov - C.lensFov(r.lens)) < 0.05, `${tpl.id}/${r.id}: the recipe's lens`);
    if (aspect === '9:16') assert.ok(Math.abs(cams[10].fov - P.fovFor(tk.keys[Math.round(tk.keys.length / 2)].fov, '9:16')) < 0.5, 'tall frames open the lens like the presets');
    if (tpl.id === 'walkthrough') for (const c of cams) assert.ok(Math.abs(c.pos[0]) <= 2.2 + 1e-6 && c.pos[2] <= 2.8 + 1e-6 && c.pos[2] >= -10.6 - 1e-6 && c.pos[1] <= 2.55, `walkthrough/${r.id}: stays in the rooms`);
    for (const c of cams) assert.ok(c.pos[1] >= P.groundAt(tpl.id, c.pos[0], c.pos[2]) + P.CAM_CLEARANCE - 1e-6, `${tpl.id}/${r.id}: above the ground`); } }
ok('every recipe × preset × (3 s, 10 s) × (16:9, 9:16, 1:1): a deterministic, JSON-safe take at 30 Hz; level unless Dutch; the lens; in the rooms; above ground');

// ---- 4. recipes on a performance: angles that replay the person, in front of the city's walls ----
{ const w = openCityWorld(); const house = w.spec.pieces.find((p) => p.k.startsWith('kc.building-skyscraper'))!; const hb = W.pieceBox(house)!;
  /* a person walking along the tower's wall, 1 m from it */
  const x0 = hb.x0 - 1; const ak = Array.from({ length: 121 }, (_, i) => ({ t: i / 20, pos: [x0, w.groundAt(x0, hb.z0 + i * 0.1), hb.z0 + i * 0.1] as [number, number, number], heading: 0, v: 2, d: i * 0.1 }));
  const cam = ak.map((k) => ({ t: k.t, pos: [k.pos[0] - 3, k.pos[1] + 2, k.pos[2] - 3] as [number, number, number], yaw: 0, pitch: -0.2, fov: 42 }));
  const perf = P.normalizeTake({ id: 'take-1', name: 'Performance 1', keys: cam, actor: { keys: ak, beats: [] } }, 0)!; assert.ok(perf.actor);
  const s = P.normalizePlanShot({ ...P.defaultPlanShot('open-city'), seconds: 6, cameraPath: { takes: [perf], chosen: perf.id } });
  assert.equal(C.recipeSubject(s)?.id, perf.id, 'the chosen performance is what recipes film');
  const boxes = w.spec.pieces.map((p) => W.pieceBox(p)).filter((b): b is NonNullable<typeof b> => !!b && b.y1 > 3);
  for (const r of C.SHOT_RECIPES) { const tk = C.recipeTake(s, { id: r.id, lens: r.lens, size: r.size }, { id: 'take-2', index: 1, perf })!;
    assert.ok(tk.shoot && tk.shoot.of === perf.id && tk.actor, `${r.id}: an angle of the performance`); assert.equal(tk.name, `Performance 1 · ${r.label}`.slice(0, 40));
    const sh = { ...s, cameraPath: { takes: [perf, tk], chosen: tk.id } };
    for (let i = 0; i <= 12; i++) { const t = (6 * i) / 12; const c = P.cameraAt(sh, t); assert.ok(finite(c));
      const near = boxes.filter((b) => Math.abs((b.x0 + b.x1) / 2 - c.pos[0]) < 60 && Math.abs((b.z0 + b.z1) / 2 - c.pos[2]) < 60);
      assert.ok(!near.some((b) => inBox(c.pos, { ...b, x0: b.x0 + 0.05, x1: b.x1 - 0.05, z0: b.z0 + 0.05, z1: b.z1 - 0.05, y1: b.y1 - 0.05 })), `${r.id} t=${t}: the camera is never inside a building`);
      const a = P.aimAt(sh, t); const p = tk.actor!.keys; void p; assert.ok(Math.hypot(a[0] - x0, a[2] - (hb.z0 + Math.min(6, t) * 2)) < 0.6, 'the person replays exactly'); } }
  /* re-bake with another lens and size: same id and angle number */
  const tk = C.recipeTake(s, { id: 'orbit-r', lens: 35, size: 'ms' }, { id: 'take-2', index: 1, perf })!; const s2 = { ...s, cameraPath: { takes: [perf, tk], chosen: tk.id } };
  const re = C.rebakeTake(s2, tk, { id: 'orbit-r', lens: 85, size: 'cu' })!; assert.equal(re.id, tk.id); assert.deepEqual(re.shoot, tk.shoot); assert.notDeepEqual(re.keys, tk.keys); assert.deepEqual(re.recipe, { id: 'orbit-r', lens: 85, size: 'cu' }); }
ok('recipes on a performance: angles that replay the person, never inside a city building beside a wall; re-baking keeps the id and angle');

// ---- 5. lens and size maths ----
assert.ok(Math.abs(C.lensFov(50) - 22.9) < 0.1 && Math.abs(C.lensMmOf(C.lensFov(85)) - 85) < 1e-9, 'lens ↔ field of view');
const dMs = C.sizeDistance('ms', C.lensFov(35)); assert.ok(Math.abs(2 * dMs * Math.tan((C.lensFov(35) * Math.PI) / 360) - 1) < 1e-9, 'a medium shot frames 1 m at the subject');
assert.ok(C.sizeDistance('cu', 30) < C.sizeDistance('ms', 30) && C.sizeDistance('ms', 30) < C.sizeDistance('ews', 30), 'tighter sizes are closer');
assert.equal(C.normalizeTakeRecipe({ id: 'nope' }), null); assert.deepEqual(C.normalizeTakeRecipe({ id: 'whip', lens: 7, size: 'x' }), { id: 'whip', lens: 35, size: 'ms' }, 'bad lens / size → the recipe default');
ok('lens and size: focal length ↔ field of view, size → distance, recipe fields normalised');

// ---- 6. lens and size on the preset move; recipe takes re-baked by the kit ----
{ for (const tpl of P.PREVIZ_TEMPLATES) { const base = P.defaultPlanShot(tpl.id);
    const n = P.normalizePlanShot({ ...base, lens: 85, size: 'cu' }); assert.equal(n.lens, 85); assert.equal(n.size, 'cu'); assert.deepEqual(P.normalizePlanShot(JSON.parse(JSON.stringify(n))), n, `${tpl.id}: lens and size round-trip`);
    assert.equal(P.normalizePlanShot({ ...base, lens: 70, size: 'huge' }).lens, undefined, 'unknown lens / size dropped');
    assert.notEqual(P.cameraKeyOf(n), P.cameraKeyOf(base), 'the depth range refits when they change');
    for (const aspect of ['16:9', '9:16', '1:1'] as const) { const s = { ...n, aspect }; const c = P.cameraAt(s, s.seconds / 2); assert.ok(finite(c));
      assert.ok(Math.abs(c.fov - P.fovFor(C.lensFov(85), aspect)) < 1e-9, `${tpl.id} ${aspect}: the lens sets the field of view`); }
    const mid = P.cameraAt({ ...base, size: 'ms' }, base.seconds / 2); const d = Math.hypot(mid.pos[0] - mid.look[0], mid.pos[1] - mid.look[1], mid.pos[2] - mid.look[2]);
    if (tpl.stage.interior) assert.deepEqual(P.cameraAt({ ...base, size: 'ms' }, 1), P.cameraAt(base, 1), 'indoors the size leaves the glide alone');
    else if (mid.pos[1] > P.groundAt(tpl.id, mid.pos[0], mid.pos[2]) + 0.2) assert.ok(Math.abs(d - C.sizeDistance('ms', tpl.stage.fov, C.subjectHeight(tpl.id, tpl.id === 'walk-by'))) < 0.05, `${tpl.id}: MS sets the distance by maths`); } }
ok('lens and size on the preset move: normalised, round-trip, the lens sets the fov on every frame shape, the size the distance (not indoors)');

// ---- 7. guides never reach a recording: they are page elements over the stage, and the recorder draws only the engine's canvas ----
{ const fs = await import('node:fs'); const web = new URL('../../web/src/shared/', import.meta.url);
  const engine = fs.readFileSync(new URL('previz/engine.ts', web), 'utf8'), capture = fs.readFileSync(new URL('previz/capture.ts', web), 'utf8'), player = fs.readFileSync(new URL('PrevizPlayer.tsx', web), 'utf8'), kit = fs.readFileSync(new URL('previz/CameraKit.tsx', web), 'utf8');
  assert.doesNotMatch(engine + capture, /FrameGuides|pv-guides|CameraKit|GUIDES/, 'the engine and the recorder know nothing of the guides');
  assert.match(player, /\{!busy && ready && <FrameGuides /, 'the guides are hidden while recording'); assert.match(kit, /export function FrameGuides[\s\S]*?<div className="pv-guides" aria-hidden/, 'the guides are a DOM layer');
  assert.doesNotMatch(kit.slice(kit.indexOf('export function FrameGuides')), /canvas|getContext/, 'they never draw into a canvas'); }
ok('guides: a DOM layer over the stage, off while recording; the engine and the recorder never draw them');

// ---- 8. camera feel (shake): a pure function of (seed, t); tripod / strength 0 change nothing ----
{ const frames = (s: any) => Array.from({ length: s.seconds * s.fps + 1 }, (_, i) => P.cameraAt(s, i / s.fps));
  for (const tpl of ['walk-by', 'diorama', 'walkthrough', 'open-city'] as const) { const base = P.defaultPlanShot(tpl);
    for (const sh of C.SHAKES) { const s = P.normalizePlanShot({ ...base, shake: { p: sh.id, k: 0.8 } });
      if (sh.id === 'tripod') { assert.equal(s.shake, undefined, 'tripod is no shake'); continue; }
      const a = frames(s); assert.deepEqual(frames(P.normalizePlanShot(JSON.parse(JSON.stringify(s)))), a, `${tpl}/${sh.id}: the same seed gives the same frames`);
      /* out of order and repeated: still the same numbers (no state carried between frames) */
      const order = [...a.keys()].reverse(); for (const i of order) assert.deepEqual(P.cameraAt(s, i / s.fps), a[i]);
      const other = frames({ ...s, seed: s.seed + 1 }); assert.notDeepEqual(other, a, `${tpl}/${sh.id}: another seed shakes differently`);
      const still = frames(base); let moved = 0; a.forEach((c, i) => { moved = Math.max(moved, Math.hypot(c.look[0] - still[i].look[0], c.look[1] - still[i].look[1], c.look[2] - still[i].look[2])); assert.ok(finite(c) && Math.abs(c.roll) <= C.ROLL_MAX); });
      assert.ok(moved > 1e-4, `${tpl}/${sh.id}: it shakes`);
      for (const k of [0, -1, 'x']) { assert.equal(P.normalizePlanShot({ ...base, shake: { p: sh.id, k } }).shake?.k ?? 0, k === 'x' ? C.SHAKE_DEFAULT_K : 0, 'strength 0 → no shake'); }
      assert.deepEqual(frames({ ...base, shake: { p: sh.id, k: 0 } }), frames(base), `${tpl}/${sh.id}: strength 0 is identical to no shake`); } }
  assert.equal(C.shakeAt({ p: 'run', k: 0 }, 7, 1, 6), null); assert.equal(C.shakeAt(null, 7, 1, 6), null);
  const imp = C.impactTimes(7, 8); assert.deepEqual(C.impactTimes(7, 8), imp, 'impact hits from the seed'); assert.equal(imp.length, 3); assert.ok(imp.every((t) => t >= 1.6 && t <= 6.4));
  const s = P.normalizePlanShot({ ...P.defaultPlanShot('walk-by'), shake: { p: 'impact', k: 1 } }); const jolt = (t: number) => Math.abs(P.cameraAt(s, t).look[1] - P.cameraAt({ ...s, shake: undefined }, t).look[1]);
  assert.ok(jolt(C.impactTimes(s.seed, s.seconds)[0] + 0.03) > jolt(C.impactTimes(s.seed, s.seconds)[0] - 0.05) * 3, 'an impact jolts at its moment');
  /* the open city's live world clock is the player's only; the shot's camera with a shake is the same on every call */
  const city = P.normalizePlanShot({ ...P.defaultPlanShot('open-city'), shake: { p: 'walk', k: 0.6 } }); const c1 = P.cameraAt(city, 2.5); for (let i = 0; i < 50; i++) P.cameraAt(city, Math.random() * 8); assert.deepEqual(P.cameraAt(city, 2.5), c1);
  assert.notEqual(P.cameraKeyOf(city), P.cameraKeyOf({ ...city, shake: undefined }), 'the depth range refits with a shake'); }
ok('camera feel: same seed → same frames (any order), another seed differs, tripod and strength 0 identical to none, impact hits seeded, roll within ±30°');
