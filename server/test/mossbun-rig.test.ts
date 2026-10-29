// Mossbun's own rig (2026-10-27; web/src/shared/rig/mossbunRig.ts, web/public/showcase/char-mossbun-rig.glb, explore/mossbunCity.ts).
// Covers: the fit lands his joints on his own mesh (feet, ears, tail inside their parts) and is deterministic; the skin weights are sane (31
// bones, every weight finite and summing to 1, both ears, the tail and the lantern have their own vertices) and do not tear (the worst edge in
// every move grows by less than a tenth of his height); every move is a pure, seamless loop; the rigged file ships with his six clips, his
// skeleton, the glowing lantern and stays small; Direct a Shot reads his clips as walk / hop / wave / dance / lantern and blends them purely;
// in the city each beat picks his clips, a pure function of t.
// Run: npx tsx test/mossbun-rig.test.ts   (pure: no server, no network)
import assert from 'node:assert/strict'; import { readFileSync, statSync } from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)); const WEB = path.join(HERE, '..', '..', 'web');
const R = await import('../../web/src/shared/rig/mossbunRig.ts'); const G = await import('../src/shared/previzRig.ts');
const ok = (m: string) => console.log('ok ' + m);

/** a GLB's first mesh in his unit frame (world transforms, feet on y = 0, centred, one unit tall), read without three's loader (WebP textures) */
function unitMesh(file: string) {
  const b = readFileSync(file); const jl = b.readUInt32LE(12); const j = JSON.parse(b.subarray(20, 20 + jl).toString('utf8')); const bin = b.subarray(28 + jl);
  const acc = (i: number) => { const a = j.accessors[i]; const bv = j.bufferViews[a.bufferView]; const n = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as any)[a.type]; const size = ({ 5126: 4, 5125: 4, 5123: 2, 5122: 2, 5121: 1, 5120: 1 } as any)[a.componentType];
    const stride = bv.byteStride ?? size * n; const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0); const dv = new DataView(bin.buffer, bin.byteOffset); const out = new Float64Array(a.count * n);
    const rd = (o: number) => (a.componentType === 5126 ? dv.getFloat32(o, true) : a.componentType === 5125 ? dv.getUint32(o, true) : a.componentType === 5123 ? dv.getUint16(o, true) : a.componentType === 5122 ? dv.getInt16(o, true) : a.componentType === 5121 ? dv.getUint8(o) : dv.getInt8(o));
    const max = ({ 5122: 32767, 5123: 65535, 5120: 127, 5121: 255 } as any)[a.componentType] ?? 1;
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) { const v = rd(base + k * stride + c * size); out[k * n + c] = a.normalized ? Math.max(v / max, -1) : v; } return out; };
  const mul = (A: number[], B: number[]) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += A[k * 4 + r] * B[c * 4 + k]; return o; };
  const trs = (nd: any) => { if (nd.matrix) return nd.matrix; const [x, y, z, w] = nd.rotation ?? [0, 0, 0, 1]; const s = nd.scale ?? [1, 1, 1]; const t = nd.translation ?? [0, 0, 0];
    return [(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + w * z) * s[0], 2 * (x * z - w * y) * s[0], 0, 2 * (x * y - w * z) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + w * x) * s[1], 0, 2 * (x * z + w * y) * s[2], 2 * (y * z - w * x) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1]; };
  let out: { pos: Float32Array; idx: Uint32Array } | null = null;
  const walk = (ni: number, W: number[]) => { const nd = j.nodes[ni]; const w = mul(W, trs(nd)); if (nd.mesh != null && !out) { const pr = j.meshes[nd.mesh].primitives[0]; const p = acc(pr.attributes.POSITION); const pos = new Float32Array(p.length);
    for (let k = 0; k < p.length; k += 3) for (let r = 0; r < 3; r++) pos[k + r] = w[r] * p[k] + w[4 + r] * p[k + 1] + w[8 + r] * p[k + 2] + w[12 + r]; out = { pos, idx: Uint32Array.from(acc(pr.indices)) }; } for (const c of nd.children ?? []) walk(c, w); };
  for (const r of j.scenes[j.scene ?? 0].nodes) walk(r, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const { pos, idx } = out!; const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < pos.length; i++) { lo[i % 3] = Math.min(lo[i % 3], pos[i]); hi[i % 3] = Math.max(hi[i % 3], pos[i]); }
  const H = hi[1] - lo[1]; for (let i = 0; i < pos.length; i += 3) { pos[i] = (pos[i] - (lo[0] + hi[0]) / 2) / H; pos[i + 1] = (pos[i + 1] - lo[1]) / H; pos[i + 2] = (pos[i + 2] - (lo[2] + hi[2]) / 2) / H; }
  return { pos, idx, json: j };
}
const M = unitMesh(path.join(WEB, 'public', 'showcase', 'char-mossbun-3d.glb'));

// ---- 1. the fit ----
const J = R.fitMossbun(M.pos);
{ assert.deepEqual(R.fitMossbun(M.pos.slice()), J, 'deterministic'); assert.equal(Object.keys(J).length, R.MOSS_BONES.length);
  for (const [n] of R.MOSS_BONES) assert.ok(J[n].every(Number.isFinite), n);
  assert.ok(J.foot_l[0] > R.MOSS_MID_X && J.foot_r[0] < R.MOSS_MID_X && J.foot_l[1] < 0.06, 'his feet on the ground, either side of his middle');
  assert.ok(J.ear_l_tip[0] - R.MOSS_MID_X > 0.3 && R.MOSS_MID_X - J.ear_r_tip[0] > 0.3 && J.ear_l_tip[1] < 0.25, 'the ear tips hang low, out at his sides');
  assert.ok(J.tail_2[2] < -0.3 && J.lantern[2] < -0.2 && J.lantern[1] > 0.7 && J.lantern_tip[1] > 0.9, 'the tail runs back and up to the lantern');
  ok('the fit: his feet, ears and tail found on his mesh, deterministic'); }

// ---- 2. the skin ----
const S = R.mossWeights(M.pos, M.idx, J);
{ const n = M.pos.length / 3; const parts = [0, 0, 0, 0]; for (const p of S.parts) parts[p]++;
  assert.ok(parts.every((c) => c > 1000), `every part has its vertices: ${parts.join(' / ')}`);
  const used = new Set<string>();
  for (let v = 0; v < n; v++) { let s = 0; for (let k = 0; k < 4; k++) { const w = S.weights[v * 4 + k], b = S.joints[v * 4 + k]; assert.ok(Number.isFinite(w) && w >= 0 && b < R.MOSS_BONES.length); s += w; if (w > 0.5) used.add(R.MOSS_BONE_NAMES[b]); }
    assert.ok(Math.abs(s - 1) < 1e-5, `vertex ${v} sums to ${s}`); }
  for (const b of ['hips', 'chest', 'head', 'ear_l_3', 'ear_r_3', 'tail_2', 'tail_4', 'lantern', 'foot_l', 'foot_r']) assert.ok(used.has(b), `${b} carries part of him`);
  for (const b of R.MOSS_BONE_NAMES.filter(R.isTip)) assert.ok(!used.has(b), `${b} carries nothing`);
  /* no tearing: the worst edge in every move, sampled at 15 fps */
  for (const c of R.MOSS_CLIPS) { let worst = 0; for (let f = 0; f <= c.dur * 15; f++) worst = Math.max(worst, R.maxStretch(M.pos, R.posePoints(M.pos, S, J, c.sample(f / 15)), M.idx).grow);
    assert.ok(worst < 0.1, `${c.name}: the worst edge grows by ${worst.toFixed(3)} of his height`); console.log(`   ${c.name}: worst edge +${(worst * 100).toFixed(1)}% of his height`); }
  ok('the skin: 31 bones, weights finite and summing to 1, every part of him moves with its own bones, no tearing in any move'); }

// ---- 3. the moves ----
{ assert.deepEqual(R.MOSS_CLIPS.map((c) => c.name), ['Idle', 'Walk', 'Hop', 'Wave', 'Dance', 'Lantern']);
  for (const c of R.MOSS_CLIPS) { for (const t of [0, 0.37, c.dur / 2, c.dur - 0.01]) assert.deepEqual(c.sample(t), c.sample(t), `${c.name}: pure`);
    const a = R.boneLocals(c.sample(0), J, 1), b = R.boneLocals(c.sample(c.dur - 1e-9), J, 1);
    a.forEach((x, i) => { for (const k of ['t', 's'] as const) x[k].forEach((v, j) => assert.ok(Math.abs(v - b[i][k][j]) < 2e-3, `${c.name} loops (${R.MOSS_BONE_NAMES[i]}.${k})`)); assert.ok(Math.abs(Math.abs(x.q.reduce((s, v, j) => s + v * b[i].q[j], 0)) - 1) < 2e-3, `${c.name} loops (${R.MOSS_BONE_NAMES[i]} turn)`); }); }
  const hop = R.mossClip('Hop')!; const lifts = Array.from({ length: 60 }, (_, f) => hop.sample(f / 100).root?.p?.[1] ?? 0); assert.ok(Math.max(...lifts) > 0.2 && Math.min(...lifts) === 0, 'the hop leaves the ground and lands');
  const sq = hop.sample(R.HOP_SECONDS * 0.9).root!.s!; assert.ok(sq[1] < 0.9 && sq[0] > 1, 'squashed on landing (volume kept)'); const st = hop.sample(R.HOP_SECONDS * 0.3).root!.s!; assert.ok(st[1] > 1.05, 'stretched in the air');
  const argmax = (f: (t: number) => number) => { let best = -Infinity, at = 0; for (let k = 0; k < 120; k++) { const t = (k / 120) * R.HOP_SECONDS; const v = f(t); if (v > best) { best = v; at = t; } } return at; };
  const squashAt = argmax((t) => -hop.sample(t).root!.s![1]); const flopAt = argmax((t) => hop.sample(t).ear_l_3!.r![2]);
  assert.ok(((flopAt - squashAt + R.HOP_SECONDS) % R.HOP_SECONDS) > 0.03 && ((flopAt - squashAt + R.HOP_SECONDS) % R.HOP_SECONDS) < 0.3, `the ear tips flop a beat after the landing (${squashAt.toFixed(2)} s → ${flopAt.toFixed(2)} s)`);
  assert.ok(R.mossGlow(R.HOP_SECONDS * 0.81) > R.mossGlow(R.HOP_SECONDS * 0.5) + 0.5 && R.mossGlow(null) > 0, 'the lantern flares on each landing');
  ok('six moves, each a pure seamless loop; the hop squashes and stretches, the ears follow through, the lantern glows on landing'); }

// ---- 4. the rigged file ----
{ const f = path.join(WEB, 'public', 'showcase', 'char-mossbun-rig.glb'); const bytes = statSync(f).size; assert.ok(bytes <= 4 * 1024 * 1024, `≤ 4 MB (${(bytes / 1048576).toFixed(2)} MB)`);
  const j = JSON.parse(readFileSync(f).subarray(20, 20 + readFileSync(f).readUInt32LE(12)).toString('utf8'));
  assert.deepEqual(j.animations.map((a: any) => a.name), ['Idle', 'Walk', 'Hop', 'Wave', 'Dance', 'Lantern']); assert.equal(j.skins.length, 1); assert.equal(j.skins[0].joints.length, R.MOSS_BONES.length);
  assert.deepEqual(j.skins[0].joints.map((k: number) => j.nodes[k].name), R.MOSS_BONE_NAMES, 'his bones, in order');
  assert.ok(j.materials.some((m: any) => m.name === 'Lantern' && m.emissiveTexture), 'the lantern has its own glowing material');
  assert.ok(!(j.extensionsRequired ?? []).includes('EXT_meshopt_compression'), 'no Meshopt: the 3D viewer reads it with no decoder');
  const old = JSON.parse(readFileSync(path.join(WEB, 'public', 'showcase', 'char-mossbun-3d.glb')).subarray(20, 20 + readFileSync(path.join(WEB, 'public', 'showcase', 'char-mossbun-3d.glb')).readUInt32LE(12)).toString('utf8'));
  const img = (x: any) => x.images.map((i: any) => x.bufferViews[i.bufferView].byteLength); assert.ok(img(j).includes(img(old)[0]), 'the same texture');
  ok(`the rigged file: his six clips, his 31 bones, the glowing lantern, his own texture, ${(bytes / 1048576).toFixed(2)} MB`); }

// ---- 5. as the Direct a Shot actor ----
{ const roles = G.rolesOf(['Idle', 'Walk', 'Hop', 'Wave', 'Dance', 'Lantern']);
  assert.deepEqual(roles, { idle: 'Idle', walk: 'Walk', jog: 'Hop', wave: 'Wave', point: 'Lantern', dance: 'Dance', jumpUp: 'Hop' }); assert.equal(G.canMove(roles), true);
  const dur: any = {}; for (const [r, n] of Object.entries(roles)) dur[r] = { name: n, dur: R.mossClip(n)!.dur };
  const top = (m: { name: string; w: number }[]) => [...m].sort((a, b) => b.w - a.w)[0].name;
  assert.equal(top(G.rigMixAt(dur, { v: 0, d: 0, time: 1 }, 1.2)), 'Idle'); assert.equal(top(G.rigMixAt(dur, { v: 1.25, d: 2, time: 1 }, 1.2)), 'Walk', 'walking pace: he waddles');
  assert.equal(top(G.rigMixAt(dur, { v: 3.6, d: 2, time: 1 }, 1.2)), 'Hop', 'running: he hops'); assert.equal(top(G.rigMixAt(dur, { v: 6, d: 2, time: 1 }, 1.2)), 'Hop');
  for (const [k, want] of [['wave', 'Wave'], ['point', 'Lantern'], ['dance', 'Dance'], ['jump', 'Hop']] as const) { const m = G.rigMixAt(dur, { v: 0, d: 0, time: 1, beat: { kind: k, local: 1 } }, 1.2); assert.equal(top(m), want, `${k} beat → ${want}`); assert.deepEqual(m, G.rigMixAt(dur, { v: 0, d: 0, time: 1, beat: { kind: k, local: 1 } }, 1.2)); }
  const jm = G.rigMixAt(dur, { v: 0, d: 0, time: 1, beat: { kind: 'jump', local: 1.59 } }, 1.2).find((x) => x.name === 'Hop')!; assert.ok(jm.t <= R.HOP_SECONDS + 1e-6, 'a Jump beat is one hop of the loop');
  const my = readFileSync(path.join(WEB, 'src', 'shared', 'previz', 'myModels.ts'), 'utf8'); assert.match(my, /const rigOf = \(url: string\) => \(url === MOSSBUN_STATIC \? MOSSBUN_RIG : url\)/, 'the example Mossbun is his rigged copy');
  const um = readFileSync(path.join(WEB, 'src', 'shared', 'previz', 'userModels.ts'), 'utf8'); assert.match(um, /\[MOSSBUN_RIG\]: MOSSBUN_STATIC/, '...and falls back to his plain model (which hops) if it fails to load');
  ok('as the actor: idle, a waddle at walking pace, hops when running, wave / lantern / dance / jump on their beats, all pure'); }

// ---- 6. in the city ----
{ const C = await import('../../web/src/ui/explore/mossbunCity.ts'); const { openCityWorld } = await import('../src/shared/world/openCity.ts'); const world = openCityWorld();
  const J0 = { x: world.junctions[0].x, z: world.junctions[0].z }; const seen = new Set<string>();
  for (let t = 0; t < C.MOSS_CYCLE; t += 0.25) { const a = C.mossPose(world, 0, J0, 1.2, t), b = C.mossPose(world, 0, J0, 1.2, t); assert.deepEqual(a, b, 'pure in t'); assert.ok(a.anim.length >= 1);
    const s = a.anim.reduce((x, y) => x + y.w, 0); assert.ok(Math.abs(s - 1) < 1e-6, `clip weights sum to 1 at ${t}`); for (const x of a.anim) { seen.add(x.name); assert.ok(Number.isFinite(x.t) && x.t >= 0 && x.t <= R.mossClip(x.name)!.dur + 1e-6, `${x.name} time inside its clip`); }
    assert.ok(a.rigPos.every(Number.isFinite) && a.rigPos[1] <= a.pos[1] + 1e-9 + 0.5, 'his place'); }
  for (const n of ['Idle', 'Hop', 'Wave', 'Dance', 'Lantern']) assert.ok(seen.has(n), `the city plays his ${n}`);
  const src = readFileSync(path.join(WEB, 'src', 'ui', 'explore', 'mossbunCity.ts'), 'utf8'); assert.match(src, /createMossbun\(T: T3, src = MOSSBUN_RIG\)/, 'the city loads his rig'); assert.match(src, /modelMotionAt\('hop'/, '...and keeps the old hop for his plain model');
  ok(`in the city: every beat picks his clips (${[...seen].join(', ')}), a pure function of t`); }
console.log('mossbun-rig: ALL OK');
