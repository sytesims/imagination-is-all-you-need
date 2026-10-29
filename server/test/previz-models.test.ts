// Direct a Shot, your 3D models (2026-10-27; shared/previzModels.ts + the model cases in previzTemplates / previzCamera / previzActor, routes3d glbProblem).
// Covers: the shot keeps only safe GLB paths, at most MODELS_MAX models and one actor, and reads back the same after JSON; a shot without models is
// exactly what it was; placement is deterministic (start size, facing the camera, carried to another preset); the actor's motion is a pure
// function of its inputs (same in → same out, finite at the extremes, hops land on the ground, leans into turns); the Shot Recipes frame the
// model's whole bounds (sizes measured on the model, the camera keeps its top and its feet in view); the Render prompt names the model; a GLB
// upload is checked (not a GLB, cut short, no meshes).
// Run: npx tsx test/previz-models.test.ts   (pure: no server, no network)
import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const P = await import('../src/shared/previzTemplates.ts');
const M = await import('../src/shared/previzModels.ts');
const C = await import('../src/shared/previzCamera.ts');
const A = await import('../src/shared/previzActor.ts');
const { glbProblem } = await import('../src/routes3d.ts');
const ok = (m: string) => console.log('ok ' + m);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOSS = { id: 'm1', src: '/showcase/char-mossbun-3d.glb', job: '092abb03', name: 'Mossbun', desc: 'Mossbun, a small round moss-green forest creature', x: -30, z: -94, r: Math.PI, h: 1.2, front: 0, fw: 1.149 };

// ---- 1. the shot keeps safe models only ----
{ assert.equal(M.normalizeModels(null), null); assert.equal(M.normalizeModels([]), null);
  for (const src of ['/files/../x.glb', 'http://evil/x.glb', '/files/x.gltf', '/files/a/b.glb', '/models/x.glb', 'C:/x.glb', '', 5]) assert.equal(M.normalizeModels([{ ...MOSS, src }]), null, `refused: ${src}`);
  assert.ok(M.isModelSrc('/files/up-0123456789abcdef.glb') && M.isModelSrc('/files/abc-out0.glb'));
  const many = M.normalizeModels(Array.from({ length: 9 }, (_, i) => ({ ...MOSS, id: 'm1', actor: 'hop', x: i })))!;
  assert.equal(many.length, M.MODELS_MAX, 'at most MODELS_MAX'); assert.equal(new Set(many.map((m) => m.id)).size, many.length, 'ids unique'); assert.equal(many.filter((m) => m.actor).length, 1, 'one actor');
  const odd = M.normalizeModels([{ ...MOSS, h: 999, r: 7, front: -9, fw: 0, actor: 'fly', name: 'Moss"bun<\n>', desc: 'x'.repeat(500), job: '../x', x: 1e9 }])![0];
  assert.equal(odd.h, M.MODEL_H_MAX); assert.ok(Math.abs(odd.r) <= Math.PI && Math.abs(odd.front) <= Math.PI); assert.equal(odd.actor, undefined); assert.equal(odd.name, 'Mossbun');
  assert.equal(odd.desc.length, M.MODEL_DESC_MAX); assert.equal(odd.job, undefined); assert.equal(odd.x, 650); assert.equal(odd.fw, 0.05);
  const s = P.normalizePlanShot({ ...P.defaultPlanShot('open-city'), models: [{ ...MOSS, actor: 'waddle' }] });
  assert.deepEqual(P.normalizePlanShot(JSON.parse(JSON.stringify(s))), s, 'JSON round-trip'); assert.equal(M.starOf(s)?.actor, 'waddle');
  assert.equal('models' in P.normalizePlanShot(P.defaultPlanShot('walk-by')), false, 'no models: the shot is as before');
  ok('the shot keeps safe models only'); }

// ---- 2. placement is deterministic ----
{ assert.equal(M.startHeight(0.8, 'open-city'), 1.2, 'a character-like model starts at 1.2 m'); assert.ok(M.startHeight(4, 'open-city') < 0.5, 'a wide one starts about 1.6 m across');
  assert.ok(M.startHeight(0.8, 'diorama') < 0.2, 'the diorama is a miniature'); for (const fw of [0.01, 0.5, 1, 3, 50]) for (const t of ['walk-by', 'diorama', 'product-hero', 'open-city']) { const h = M.startHeight(fw, t); assert.ok(h >= M.MODEL_H_MIN && h <= M.MODEL_H_MAX && h === M.startHeight(fw, t)); }
  const r = M.faceTowards(0, 0, 0, 5); assert.equal(r, 0, 'heading 0 faces +z (towards a camera at +z)'); assert.ok(Math.abs(M.faceTowards(0, 0, 5, 0) - Math.PI / 2) < 1e-4); assert.equal(M.faceTowards(1, 1, 1, 1), 0);
  const list = [{ ...MOSS, actor: 'hop' as const }, { ...MOSS, id: 'm2' }, { ...MOSS, id: 'm3' }];
  for (const tpl of ['open-city', 'walk-by', 'walkthrough', 'diorama'] as const) { const at = A.actorStart(P.defaultPlanShot(tpl)); const a = M.carryModels(list, tpl, at)!, b = M.carryModels(list, tpl, at)!;
    assert.deepEqual(a, b, `carried the same way every time (${tpl})`); assert.deepEqual([a[0].x, a[0].z], [Math.round(at.pos[0] * 1000) / 1000, Math.round(at.pos[2] * 1000) / 1000], 'the actor goes where a person starts');
    assert.ok(Math.hypot(a[1].x - a[2].x, a[1].z - a[2].z) > 0.5, 'the others stand apart'); }
  const shot = P.normalizePlanShot({ ...P.defaultPlanShot('open-city'), models: [{ ...MOSS, actor: 'hop' }] }); const st = A.actorStart(shot);
  assert.deepEqual([st.pos[0], st.pos[2], st.heading], [-30, -94, M.starOf(shot)!.r], 'Play the actor starts where your model stands');
  ok('placement is deterministic'); }

// ---- 3. the actor's motion is a pure function ----
{ for (const m of M.MODEL_MOTIONS.map((x) => x.id)) {
    for (const v of [0, 0.4, 1.25, 3.6, 40]) for (const h of [0.1, 1.2, 8]) for (let i = 0; i < 40; i++) { const p = { v, d: i * 0.137 + v, time: i / 24 };
      const a = M.modelMotionAt(m, h, p, (i - 20) / 10), b = M.modelMotionAt(m, h, { ...p }, (i - 20) / 10); assert.deepEqual(a, b, 'same in, same out');
      assert.ok(Object.values(a).every(Number.isFinite), 'finite'); assert.ok(a.lift >= 0 && a.lift < h, 'never below the ground, never flies off'); assert.ok(a.sx > 0.6 && a.sy > 0.6 && a.sx < 1.5 && a.sy < 1.5); }
    assert.ok(Object.values(M.modelMotionAt(m, 1, { v: NaN, d: Infinity, time: NaN }, NaN)).every(Number.isFinite), 'bad numbers stay finite'); }
  const L = 0.32 * 1.2 + 0.28; const land = M.modelMotionAt('hop', 1.2, { v: 1.25, d: 3 * L, time: 1 }); const mid = M.modelMotionAt('hop', 1.2, { v: 1.25, d: 3.5 * L, time: 1 });
  assert.ok(land.lift < 1e-9 && mid.lift > 0.15, 'a hop lands on the ground and rises between landings'); assert.ok(land.sy < 0.9 && mid.sy > 1, 'squashed on landing, stretched in the air');
  assert.equal(M.modelMotionAt('hop', 1.2, { v: 0, d: 3.5 * L, time: 1 }).lift, 0, 'standing still it doesn’t hop');
  assert.ok(M.modelMotionAt('waddle', 1, { v: 1.2, d: 0.2, time: 0 }, 1).lean !== 0); assert.ok(M.modelMotionAt('glide', 1, { v: 2, d: 0, time: 0 }, 1).lean < 0 && M.modelMotionAt('glide', 1, { v: 2, d: 0, time: 0 }, -1).lean > 0, 'leans into the turn');
  ok('the actor’s motion is a pure function of t'); }

// ---- 4. Shot Recipes frame the model's bounds ----
{ const vis = (cam: { pos: number[]; yaw: number; pitch: number; fov: number }, p: number[], aspect: number) => { const d = P.lookDir(cam.yaw, cam.pitch); const v = [p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]];
    const z = v[0] * d[0] + v[1] * d[1] + v[2] * d[2]; if (z <= 0) return false; const up0 = [0, 1, 0]; const r = [d[1] * up0[2] - d[2] * up0[1], d[2] * up0[0] - d[0] * up0[2], d[0] * up0[1] - d[1] * up0[0]]; const rl = Math.hypot(...r);
    const right = r.map((x) => x / rl); const up = [right[1] * d[2] - right[2] * d[1], right[2] * d[0] - right[0] * d[2], right[0] * d[1] - right[1] * d[0]];
    const y = v[0] * up[0] + v[1] * up[1] + v[2] * up[2]; const x = v[0] * right[0] + v[1] * right[1] + v[2] * right[2]; const th = Math.tan((cam.fov * Math.PI) / 360);
    return Math.abs(y / z) <= th * 1.001 && Math.abs(x / z) <= th * aspect * 1.001; };
  for (const tpl of ['open-city', 'walkthrough', 'product-hero'] as const) for (const aspect of ['16:9', '9:16'] as const) for (const h of [0.4, 1.2, 3]) {
    /* where a person would put it: the city's open plaza, the living room facing the kitchen, beside the pedestal */
    const [X, Z, R] = tpl === 'walkthrough' ? [0, -2.5, Math.PI] : tpl === 'product-hero' ? [0.4, 1.2, 0] : [0.4, -1, 0];
    const g = P.groundAt(tpl, X, Z); const shot = P.normalizePlanShot({ ...P.defaultPlanShot(tpl), aspect, models: [{ ...MOSS, x: X, z: Z, r: R, h, actor: 'hop' }] });
    const c = C.rigContext(shot); assert.equal(c.model, true); assert.equal(c.H, M.frameHeightOf(M.starOf(shot)!)); assert.deepEqual(c.base(0), [X, g, Z], 'the subject is the model where it stands');
    for (const id of ['low-hero', 'orbit-r', 'track-right', 'lead', 'aerial-pull'] as const) { const R = C.recipeOf(id)!; const take = C.recipeTake(shot, { id, lens: R.lens, size: 'ms' }, { id: 'take-1', index: 0 })!;
      const again = C.recipeTake(shot, { id, lens: R.lens, size: 'ms' }, { id: 'take-1', index: 0 })!; assert.deepEqual(take, again, 'deterministic');
      if (tpl === 'walkthrough' && (h > 2 || h < 0.5)) continue; /* indoors the camera stays 0.3 m over the floor and under the 2.7 m ceiling: a 3 m or a 0.4 m model can't always be framed whole */
      const k = take.keys[take.keys.length - 1]; const [aw, ah] = aspect.split(':').map(Number); const fov = P.fovFor(k.fov, aspect);
      const feet = [X, g + 0.02, Z], top = [X, g + h * 0.98, Z]; assert.ok(vis({ ...k, fov }, feet, aw / ah) && vis({ ...k, fov }, top, aw / ah), `${id} keeps the whole model in frame (${tpl}, ${aspect}, ${h} m)`); } }
  /* a person keeps the person's sizes: no model, no change */ const plain = C.rigContext(P.defaultPlanShot('open-city')); assert.equal(plain.model, false);
  /* the walk-by: the model walks the figure's walk and the depth range / map aim follow its height */ const wb = P.normalizePlanShot({ ...P.defaultPlanShot('walk-by'), models: [{ ...MOSS, h: 0.6, actor: 'glide' }] });
  assert.ok(Math.abs(P.aimAt(wb, 1)[1] - (P.WALK_FLOOR_Y + M.frameHeightOf(M.starOf(wb)!) * 0.55)) < 1e-9); assert.notEqual(P.cameraKeyOf(wb), P.cameraKeyOf(P.defaultPlanShot('walk-by')));
  ok('Shot Recipes frame the model’s bounds'); }

// ---- 5. the Render prompt names the model ----
{ const shot = P.normalizePlanShot({ ...P.defaultPlanShot('walk-by'), models: [{ ...MOSS, actor: 'hop' }, { ...MOSS, id: 'm2', name: 'Lamp', desc: 'a brass street lamp' }] });
  const short = M.castPromptFor(P.restylePromptFor(shot, 'short'), shot); assert.ok(short.startsWith('Mossbun, a small round moss-green forest creature walks'), short); assert.ok(!/fictional adult/.test(short)); assert.ok(/Also in the scene: a brass street lamp\.$/.test(short));
  const city = P.normalizePlanShot({ ...P.defaultPlanShot('open-city-night'), models: [{ ...MOSS, actor: 'hop' }] }); assert.ok(/Mossbun, a small round/.test(M.castPromptFor(P.restylePromptFor(city, 'long'), city)));
  const home = P.normalizePlanShot({ ...P.defaultPlanShot('walkthrough'), models: [{ ...MOSS, actor: 'hop' }] }); assert.ok(/The main character is Mossbun/.test(M.castPromptFor(P.restylePromptFor(home, 'short'), home)));
  assert.equal(M.castPromptFor('Same text.', P.defaultPlanShot('walk-by')), 'Same text.', 'no models: unchanged');
  assert.equal(M.castActionLine('The person: 0–3 s walks, 3–5 s runs, 4 s waves.', shot), 'Mossbun: 0–3 s hops, 3–5 s bounds, 4 s waves.');
  const noDesc = P.normalizePlanShot({ ...P.defaultPlanShot('walk-by'), models: [{ ...MOSS, desc: '', actor: 'hop' }] }); assert.ok(M.castPromptFor(P.restylePromptFor(noDesc, 'short'), noDesc).startsWith('Mossbun walks'), 'no words: its name');
  ok('the Render prompt names the model'); }

// ---- 6. a GLB upload is checked ----
{ const moss = readFileSync(path.join(HERE, '../../web/public/showcase/char-mossbun-3d.glb')); assert.equal(glbProblem(moss), null, 'Mossbun is a good GLB');
  assert.match(glbProblem(Buffer.from('not a glb at all, just text'))!, /isn’t a GLB/); assert.match(glbProblem(moss.subarray(0, moss.length - 10))!, /cut short/);
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scenes: [{ nodes: [0] }], nodes: [{ camera: 0 }], cameras: [{ type: 'perspective', perspective: { yfov: 1, znear: 0.1 } }] }).padEnd(152, ' '));
  const head = Buffer.alloc(20); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + json.length, 8); head.writeUInt32LE(json.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  assert.match(glbProblem(Buffer.concat([head, json]))!, /no meshes/); const v1 = Buffer.from(moss); v1.writeUInt32LE(1, 4); assert.match(glbProblem(v1)!, /glTF 2\.0/);
  ok('a GLB upload is checked'); }
console.log('previz-models: all ok');
