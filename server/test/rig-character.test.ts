// Rig as a character (2026-10-27; web/src/shared/rig + shared/previzRig.ts + routes3dRig.ts).
// Covers: the human skeleton is fitted inside a standing figure (legs and arms found, deterministic) and reports a blob that isn't a person;
// the bones land exactly on the joints; the skin weights are sane (28 bones, every vertex's weights finite and summing to 1, indices in
// range, arms on arm bones, legs on leg bones); the speed blend (idle → walk → jog → run, acting beats) is a pure function of the pose and
// borrows missing roles; clip names are read from our own saves and other rigs; the moves from web/public/models/rig/human.glb bake and play
// deterministically (the same pose at the same t gives the same bone matrices, whatever was sampled before); the saved meta is cleaned and a
// GLB without a skeleton or moves is refused.
// Run: npx tsx test/rig-character.test.ts   (pure: no server, no network)
import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const HERE = path.dirname(fileURLToPath(import.meta.url)); const WEB = path.join(HERE, '..', '..', 'web');
const R = await import('../../web/src/shared/rig/humanRig.ts'); const S = await import('../../web/src/shared/rig/skin.ts');
const G = await import('../src/shared/previzRig.ts'); const M = await import('../src/shared/previzModels.ts');
const ok = (m: string) => console.log('ok ' + m);

/** a standing figure in T-pose: two legs, a torso, a neck, a head and two arms, scaled to the template's height */
function figure(arms: 'T' | 'A' = 'T') {
  const box = (w: number, h: number, d: number, x: number, y: number, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d, 4, Math.max(2, Math.round(h * 24)), 4); if (rz) g.rotateZ(rz); g.translate(x, y, 0); return g; };
  const head = new THREE.SphereGeometry(0.12, 16, 12); head.translate(0, 1.63, 0);
  const armL = arms === 'T' ? box(0.68, 0.09, 0.09, 0.54, 1.38) : box(0.68, 0.09, 0.09, 0.42, 1.18, -0.75); const armR = arms === 'T' ? box(0.68, 0.09, 0.09, -0.54, 1.38) : box(0.68, 0.09, 0.09, -0.42, 1.18, 0.75);
  const parts = [box(0.14, 0.86, 0.16, 0.1, 0.43), box(0.14, 0.86, 0.16, -0.1, 0.43), box(0.4, 0.6, 0.22, 0, 1.15), box(0.12, 0.1, 0.12, 0, 1.5), head, armL, armR];
  let g = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); p.deleteAttribute('normal'); return p.toNonIndexed(); }))!; g = mergeVertices(g);
  g.computeBoundingBox(); const s = R.TEMPLATE_HEIGHT / g.boundingBox!.max.y; g.scale(s, s, s); return g;
}
const geo = figure(); const pos = geo.getAttribute('position').array as Float32Array; const idx = geo.index!.array as Uint32Array;

// ---- 1. the fit ----
{ const a = R.fitHuman(pos, idx), b = R.fitHuman(pos.slice(), idx.slice()); assert.deepEqual(a, b, 'deterministic');
  assert.equal(a.report.legs, true, 'the gap between the legs is found'); assert.equal(a.report.arms, 'found'); assert.equal(a.report.pose, 'T'); assert.deepEqual(a.report.problems, []); assert.ok(a.report.score >= 0.8);
  const j = a.joints; for (const n of R.JOINTS) assert.ok(j[n].every(Number.isFinite), n);
  assert.ok(j.thigh_l[0] > 0 && j.thigh_r[0] < 0 && j.hand_l[0] > 0.5 && j.hand_r[0] < -0.5, 'left is +x, right is −x, hands out in the arms');
  assert.ok(j.foot_l[1] < j.calf_l[1] && j.calf_l[1] < j.thigh_l[1] && j.thigh_l[1] < j.spine_03[1] && j.spine_03[1] < j.head[1] && j.head[1] < j.head_leaf[1], 'feet → knees → hips → chest → head, bottom to top');
  const A = R.fitHuman(figure('A').getAttribute('position').array as Float32Array, figure('A').index!.array); assert.equal(A.report.pose, 'A', 'arms at 45° read as an A-pose');
  const blob = new THREE.SphereGeometry(0.8, 32, 24); blob.translate(0, 0.8, 0); const bf = R.fitHuman(blob.getAttribute('position').array as Float32Array, blob.index!.array);
  assert.equal(bf.report.legs, false); assert.ok(bf.report.problems.length >= 1 && /No gap between the legs/.test(bf.report.problems.join(' ')), 'a blob says plainly what is missing');
  ok('the fit finds legs and arms, is deterministic, and says what it could not find'); }
const fit = R.fitHuman(pos, idx);

// ---- 2. bones on the joints ----
{ const { bones } = R.skeletonFrom(fit.joints); assert.equal(bones.length, R.HUMAN_BONES.length); assert.deepEqual(bones.map((b: any) => b.name), R.BONE_NAMES);
  const w = new THREE.Vector3(); for (const b of bones) { if (b.name === 'root') continue; b.getWorldPosition(w); const t = fit.joints[b.name]; assert.ok(w.distanceTo(new THREE.Vector3(...t)) < 1e-4, `${b.name} sits on its joint`); }
  const tj = R.templateJoints(); const tb = R.skeletonFrom(tj).bones; tb.forEach((b: any, i: number) => { const [, , t, q] = R.HUMAN_BONES[i]; if (i === 0) return;
    assert.ok(b.position.distanceTo(new THREE.Vector3(...t)) < 1e-4 && Math.abs(b.quaternion.dot(new THREE.Quaternion(...q))) > 0.9999, `the template's own joints give its rest pose (${b.name})`); });
  ok('the bones land on the joints; the template gives back its own rest pose'); }

// ---- 3. skin weights ----
const { bones } = R.skeletonFrom(fit.joints); const bd = S.boneData(bones);
const skin = S.skinWeights({ positions: pos.slice(), index: idx.slice(), bones: bd, armPlane: false });
{ const n = pos.length / 3; assert.equal(skin.skinIndex.length, n * 4); assert.equal(skin.skinWeight.length, n * 4); assert.equal(bd.length, 28, '28 bones');
  const name = (i: number) => bd[i].name; let armOk = 0, armN = 0, legOk = 0, legN = 0;
  for (let v = 0; v < n; v++) { let s = 0; let top = 0, topW = -1;
    for (let k = 0; k < 4; k++) { const w = skin.skinWeight[v * 4 + k], i = skin.skinIndex[v * 4 + k]; assert.ok(Number.isFinite(w) && w >= 0, 'finite'); assert.ok(i < bd.length, 'index in range'); s += w; if (w > topW) { topW = w; top = i; } }
    assert.ok(Math.abs(s - 1) < 1e-5, `weights sum to 1 (vertex ${v}: ${s})`);
    const x = pos[v * 3], y = pos[v * 3 + 1]; if (Math.abs(x) > 0.45) { armN++; if (/arm|hand/.test(name(top))) armOk++; } if (y < 0.6 && Math.abs(x) > 0.04) { legN++; if (/thigh|calf|foot|ball/.test(name(top))) legOk++; } }
  assert.ok(armOk / armN > 0.95, `arms on arm bones (${armOk}/${armN})`); assert.ok(legOk / legN > 0.95, `legs on leg bones (${legOk}/${legN})`);
  const again = S.skinWeights({ positions: pos.slice(), index: idx.slice(), bones: bd, armPlane: false }); assert.deepEqual(again.skinIndex, skin.skinIndex); assert.deepEqual(again.skinWeight, skin.skinWeight);
  const ap = S.skinWeights({ positions: pos.slice(), index: idx.slice(), bones: bd, armPlane: true }); for (let i = 0; i < ap.skinWeight.length; i += 4) assert.ok(Math.abs(ap.skinWeight[i] + ap.skinWeight[i + 1] + ap.skinWeight[i + 2] + ap.skinWeight[i + 3] - 1) < 1e-5);
  ok(`skin weights: 28 bones, ${n} vertices summing to 1, no NaN, arms and legs on their bones, deterministic (${skin.ms} ms)`); }

// ---- 4. the speed blend ----
{ const clips = { idle: { name: 'Idle', dur: 3 }, walk: { name: 'Walk', dur: 1.6 }, jog: { name: 'Jog', dur: 1.1 }, sprint: { name: 'Sprint', dur: 0.8 }, dance: { name: 'Dance', dur: 1.2 }, jumpUp: { name: 'Jump_Start', dur: 1.6 }, jumpDown: { name: 'Jump_Land', dur: 1.5 } };
  const top = (m: { name: string; w: number }[]) => [...m].sort((a, b) => b.w - a.w)[0].name; const sum = (m: { w: number }[]) => m.reduce((a, x) => a + x.w, 0);
  for (let i = 0; i < 60; i++) { const p = { v: i / 8, d: i * 0.37, time: i * 0.21 }; const a = G.rigMixAt(clips, p, 1.2), b = G.rigMixAt(clips, { ...p }, 1.2); assert.deepEqual(a, b, 'same in, same out');
    assert.ok(Math.abs(sum(a) - 1) < 1e-4, 'weights sum to 1'); for (const x of a) assert.ok(Number.isFinite(x.t) && x.t >= 0 && x.t < clips[Object.keys(clips).find((k) => (clips as any)[k].name === x.name) as keyof typeof clips].dur, 'times inside their clip'); }
  assert.equal(top(G.rigMixAt(clips, { v: 0, d: 0, time: 1 })), 'Idle'); assert.equal(top(G.rigMixAt(clips, { v: 1.25, d: 3, time: 1 })), 'Walk'); assert.equal(top(G.rigMixAt(clips, { v: 3.6, d: 3, time: 1 })), 'Jog'); assert.equal(top(G.rigMixAt(clips, { v: 6, d: 3, time: 1 })), 'Sprint');
  assert.equal(top(G.rigMixAt(clips, { v: 0, d: 0, time: 1, beat: { kind: 'dance', local: 2 } })), 'Dance', 'an acting beat plays over the top');
  assert.equal(top(G.rigMixAt(clips, { v: 0, d: 0, time: 1, beat: { kind: 'jump', local: 1.2 } })), 'Jump_Land');
  assert.equal(top(G.rigMixAt(clips, { v: 0, d: 0, time: 1, beat: { kind: 'sit', local: 2 } })), 'Idle', 'a beat it has no clip for is skipped');
  const small = G.rigMixAt(clips, { v: 1.25, d: 0.2, time: 0 }, 0.6).find((x) => x.name === 'Walk')!.t, big = G.rigMixAt(clips, { v: 1.25, d: 0.2, time: 0 }, 1.75).find((x) => x.name === 'Walk')!.t; assert.ok(small > big, 'a smaller character takes more steps for the same distance');
  const walkOnly = { walk: { name: 'Walking', dur: 1 } }; assert.equal(top(G.rigMixAt(walkOnly, { v: 6, d: 1, time: 0 })), 'Walking', 'no run: it walks'); assert.deepEqual(G.rigMixAt(walkOnly, { v: 0, d: 0, time: 5 }), [{ name: 'Walking', w: 1, t: 0 }], 'no idle: the walk held still');
  assert.ok(G.rigMixAt(clips, { v: NaN, d: Infinity, time: NaN, beat: null }).every((x) => Number.isFinite(x.w) && Number.isFinite(x.t)), 'bad numbers stay finite');
  ok('the speed blend: pure, sums to 1, idle → walk → jog → run, beats over the top, missing roles borrowed, scaled by height'); }

// ---- 5. clip names ----
{ assert.deepEqual(G.rolesOf(['Idle', 'Walk', 'Jog', 'Sprint', 'Jump_Start', 'Jump_Land', 'Dance']), { idle: 'Idle', walk: 'Walk', jog: 'Jog', sprint: 'Sprint', jumpUp: 'Jump_Start', jumpDown: 'Jump_Land', dance: 'Dance' });
  const ual = G.rolesOf(['Dance_Loop', 'Idle_Loop', 'Jog_Fwd_Loop', 'Jump_Land', 'Jump_Start', 'Sitting_Enter', 'Sitting_Exit', 'Sitting_Idle_Loop', 'Sprint_Loop', 'Walk_Loop']);
  assert.equal(ual.walk, 'Walk_Loop'); assert.equal(ual.sprint, 'Sprint_Loop'); assert.equal(ual.jog, 'Jog_Fwd_Loop'); assert.equal(ual.sitIn, 'Sitting_Enter'); assert.equal(ual.sitOut, 'Sitting_Exit'); assert.equal(ual.sit, 'Sitting_Idle_Loop');
  const mixamo = G.rolesOf(['mixamo.com|Idle', 'Walking', 'Running', 'Walk Backwards']); assert.equal(mixamo.walk, 'Walking'); assert.equal(mixamo.sprint, 'Running'); assert.equal(G.canMove(mixamo), true);
  assert.equal(G.canMove(G.rolesOf(['Take 001', 'Wave'])), false, 'a file with no idle, walk or run has no moves'); assert.deepEqual(G.cleanMoves(['dance', 'fly']), ['idle', 'walk', 'dance'], 'idle and walk always come');
  assert.equal(M.motionsFor(true)[0].id, 'moves'); assert.ok(!M.motionsFor(false).some((m) => m.id === 'moves'), 'its moves only for a file that has them');
  assert.equal(M.castActionLine('The person: 0–3 s walks, 3–5 s runs', { models: [{ id: 'm1', src: '/files/x-out0.glb', name: 'Rex', desc: '', x: 0, z: 0, r: 0, h: 1.7, front: 0, fw: 0.6, actor: 'moves' }] }), 'Rex: 0–3 s walks, 3–5 s runs');
  ok('clip names: our saves, the mannequin and Mixamo-style names; its moves offered only with clips'); }

// ---- 6. the moves bake and play deterministically ----
{ const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js'); const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
  const buf = readFileSync(path.join(WEB, 'public', 'models', 'rig', 'human.glb')); const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
  const g = await l.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), ''); const names = g.animations.map((a: any) => a.name).sort();
  assert.deepEqual(names, ['Dance_Simple', 'Idle_A', 'Jog', 'Jump_Land', 'Jump_Start', 'Sitting_Enter', 'Sitting_Exit', 'Sitting_Idle', 'Sprint', 'Walk'], 'the ten CC0 moves ship');
  for (const a of g.animations) for (const t of a.tracks) { const node = t.name.split('.')[0]; assert.ok(R.BONE_NAMES.includes(node), `${a.name}: ${t.name} targets a bone of the rig`); assert.ok(/quaternion$/.test(t.name) || t.name === 'pelvis.position', `${t.name}: rotations and the hips' position only`); }
  const { bakeClips, buildCharacter } = await import('../../web/src/shared/rig/rigCharacter.ts');
  const model = { parts: [{ geometry: geo, material: new THREE.MeshStandardMaterial(), name: 'Body' }] } as any;
  const char = buildCharacter(model, fit.joints, [skin]); const clips = bakeClips(g.animations, ['idle', 'walk', 'jog', 'sprint', 'dance'], char.joints.pelvis[1]);
  assert.deepEqual(clips.map((c: any) => c.name), ['Idle', 'Walk', 'Jog', 'Sprint', 'Dance']); const roles = G.rolesOf(clips.map((c: any) => c.name)); const dur: any = {}; for (const [r, n] of Object.entries(roles)) dur[r] = { name: n, dur: clips.find((c: any) => c.name === n)!.duration };
  const k = char.joints.pelvis[1] / R.TEMPLATE_PELVIS_Y; const orig = g.animations.find((a: any) => a.name === 'Walk')!.tracks.find((t: any) => t.name === 'pelvis.position')!.values[2]; const baked = clips[1].tracks.find((t: any) => t.name === 'pelvis.position')!.values[2];
  assert.ok(Math.abs(baked - orig * k) < 1e-5, 'the hips are scaled to the model');
  const mixer = new THREE.AnimationMixer(char.scene); const acts: Record<string, any> = {}; for (const c of clips) { const a = mixer.clipAction(c); a.play(); a.setEffectiveTimeScale(0); acts[c.name] = a; }
  const sample = (p: { v: number; d: number; time: number }) => { for (const a of Object.values(acts)) a.setEffectiveWeight(0); for (const x of G.rigMixAt(dur, p, 1.7)) { acts[x.name].setEffectiveWeight(x.w); acts[x.name].time = x.t; } mixer.update(0); char.scene.updateMatrixWorld(true);
    return char.bones.map((b: any) => b.matrixWorld.elements.map((e: number) => Math.round(e * 1e6) / 1e6)); };
  const P = { v: 1.6, d: 4.2, time: 2.5 }; const first = sample(P); sample({ v: 5, d: 9, time: 7 }); sample({ v: 0, d: 0, time: 0.3 }); const again = sample(P);
  assert.deepEqual(again, first, 'the same pose gives the same bones, whatever was sampled before');
  const still = sample({ v: 0, d: 0, time: 0 }); assert.notDeepEqual(still, first, 'walking and standing differ');
  for (const m of first) assert.ok(m.every(Number.isFinite));
  ok('the CC0 moves target the rig, bake with the hips scaled, and play deterministically at a fixed t'); }

// ---- 7. what the server keeps ----
{ const { rigProblem } = await import('../src/routes3dRig.ts');
  const glb = (json: object) => { const j = Buffer.from(JSON.stringify(json)); const pad = Buffer.alloc((4 - (j.length % 4)) % 4, 0x20); const body = Buffer.concat([j, pad]); const h = Buffer.alloc(20);
    h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(20 + body.length, 8); h.writeUInt32LE(body.length, 12); h.writeUInt32LE(0x4e4f534a, 16); return Buffer.concat([h, body]); };
  assert.match(rigProblem(glb({ asset: { version: '2.0' }, meshes: [{}] }))!, /no skeleton/); assert.match(rigProblem(glb({ asset: { version: '2.0' }, meshes: [{}], skins: [{}] }))!, /no moves/);
  assert.equal(rigProblem(glb({ asset: { version: '2.0' }, meshes: [{}], skins: [{}], animations: [{}] })), null);
  assert.equal(G.normalizeRigMeta({ src: '/files/../x.glb', moves: ['walk'] }), null); assert.equal(G.normalizeRigMeta({ src: '/files/a.glb', moves: [] }), null);
  const m = G.normalizeRigMeta({ src: '/files/up-1.glb', moves: ['walk', 'walk', 'fly'], clips: ['Walk', 'bad"name'], name: 'Moss"bun\n', srcJob: '../x', ms: { fit: -5, skin: 'x', bake: 1e9 }, fit: { score: 2, arms: 'x' } })!;
  assert.deepEqual(m.moves, ['walk']); assert.deepEqual(m.clips, ['Walk']); assert.equal(m.name, 'Moss bun'); assert.equal(m.srcJob, null); assert.deepEqual(m.ms, { fit: 0, skin: 0, bake: 6e5 }); assert.equal(m.fit.score, 1); assert.equal(m.fit.arms, 'guessed'); assert.equal(m.engine.name, 'Mesh2Motion');
  ok('the server refuses a GLB without bones or moves and cleans what the browser sends'); }
// ---- 8. only person-shaped models get the human skeleton (Mossbun keeps his hop) ----
{ /** a GLB's meshes in rig space, like rigCharacter.ts readModel: world transforms, feet on y = 0, centred, as tall as the template */
  const stand = (parts: { pos: Float32Array; idx: ArrayLike<number> }[]) => { const all = new Float32Array(parts.reduce((a, p) => a + p.pos.length, 0)); const ix: number[] = []; let o = 0;
    for (const p of parts) { all.set(p.pos, o); for (let i = 0; i < p.idx.length; i++) ix.push(p.idx[i] + o / 3); o += p.pos.length; }
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < all.length; i++) { lo[i % 3] = Math.min(lo[i % 3], all[i]); hi[i % 3] = Math.max(hi[i % 3], all[i]); }
    const s = R.TEMPLATE_HEIGHT / (hi[1] - lo[1]); for (let i = 0; i < all.length; i += 3) { all[i] = (all[i] - (lo[0] + hi[0]) / 2) * s; all[i + 1] = (all[i + 1] - lo[1]) * s; all[i + 2] = (all[i + 2] - (lo[2] + hi[2]) / 2) * s; }
    return R.fitHuman(all, Uint32Array.from(ix)); };
  /** read a plain or KHR_mesh_quantization GLB without three's loader (Mossbun's WebP textures can't load in Node) */
  const readGlb = (file: string) => { const b = readFileSync(file); const jl = b.readUInt32LE(12); const j = JSON.parse(b.subarray(20, 20 + jl).toString('utf8')); const bin = b.subarray(28 + jl);
    const acc = (i: number) => { const a = j.accessors[i]; const bv = j.bufferViews[a.bufferView]; const n = { SCALAR: 1, VEC3: 3, VEC4: 4, VEC2: 2 }[a.type as 'VEC3']!; const T: any = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5122: Int16Array, 5121: Uint8Array, 5120: Int8Array }[a.componentType];
      const stride = bv.byteStride ?? T.BYTES_PER_ELEMENT * n; const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0); const max = { 5122: 32767, 5123: 65535, 5120: 127, 5121: 255 }[a.componentType as 5122] ?? 1; const out = new Float32Array(a.count * n);
      const dv = new DataView(bin.buffer, bin.byteOffset); const rd = (off: number) => a.componentType === 5126 ? dv.getFloat32(off, true) : a.componentType === 5125 ? dv.getUint32(off, true) : a.componentType === 5123 ? dv.getUint16(off, true) : a.componentType === 5122 ? dv.getInt16(off, true) : a.componentType === 5121 ? dv.getUint8(off) : dv.getInt8(off);
      for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) { const v = rd(base + k * stride + c * T.BYTES_PER_ELEMENT); out[k * n + c] = a.normalized ? Math.max(v / max, -1) : v; } return out; };
    const parts: { pos: Float32Array; idx: ArrayLike<number> }[] = [];
    const walk = (ni: number, parent: THREE.Matrix4) => { const nd = j.nodes[ni]; const m = new THREE.Matrix4(); if (nd.matrix) m.fromArray(nd.matrix); else m.compose(new THREE.Vector3(...(nd.translation ?? [0, 0, 0])), new THREE.Quaternion(...(nd.rotation ?? [0, 0, 0, 1])), new THREE.Vector3(...(nd.scale ?? [1, 1, 1])));
      const w = parent.clone().multiply(m); if (nd.mesh != null) for (const pr of j.meshes[nd.mesh].primitives) { const pos = acc(pr.attributes.POSITION); const v = new THREE.Vector3(); for (let k = 0; k < pos.length; k += 3) { v.set(pos[k], pos[k + 1], pos[k + 2]).applyMatrix4(w); pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z; }
        parts.push({ pos, idx: pr.indices != null ? acc(pr.indices) : Array.from({ length: pos.length / 3 }, (_, k) => k) }); }
      for (const c of nd.children ?? []) walk(c, w); };
    for (const r of j.scenes[j.scene ?? 0].nodes) walk(r, new THREE.Matrix4()); return parts; };
  const moss = stand(readGlb(path.join(WEB, 'public', 'showcase', 'char-mossbun-3d.glb')));
  assert.equal(moss.report.person, false, `Mossbun isn't shaped like a person (score ${moss.report.score}, legs ${moss.report.legs})`); assert.equal(G.personShaped(moss.report), false);
  assert.equal(fit.report.person, true, 'the standing figure is'); assert.equal(R.fitHuman(figure('A').getAttribute('position').array as Float32Array, figure('A').index!.array).report.person, true, 'so is an A-pose figure');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js'); const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
  const mb = readFileSync(path.join(WEB, 'public', 'models', 'mannequin', 'mannequin.glb')); const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder); const mg = await l.parseAsync(mb.buffer.slice(mb.byteOffset, mb.byteOffset + mb.byteLength), '');
  mg.scene.updateMatrixWorld(true); const mparts: { pos: Float32Array; idx: ArrayLike<number> }[] = []; mg.scene.traverse((o: any) => { if (!o.isMesh) return; const a = o.geometry.getAttribute('position'); const pos = new Float32Array(a.count * 3); const v = new THREE.Vector3();
    for (let k = 0; k < a.count; k++) { v.fromBufferAttribute(a, k).applyMatrix4(o.matrixWorld); pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z; } mparts.push({ pos, idx: o.geometry.index ? Array.from(o.geometry.index.array as ArrayLike<number>) : Array.from({ length: a.count }, (_, k) => k) }); });
  const man = stand(mparts); assert.equal(man.report.person, true, `the Quaternius mannequin passes (score ${man.report.score})`);
  assert.equal(G.personShaped({ score: 0.73, legs: false }), false); assert.equal(G.personShaped({ score: 0.82, legs: true }), true); assert.equal(G.personShaped({ score: 0.85, legs: false }), false); assert.equal(G.personShaped({ score: 0.91, legs: false }), true, 'a long coat that hides the legs still passes when the rest fits');
  ok(`only person-shaped models get the human skeleton: Mossbun refused (${moss.report.score}), the figure and the mannequin (${man.report.score}) pass`); }
console.log('rig-character: ALL OK');
