// A lighter copy of a big GLB for Direct a Shot (2026-11-03; glbLight.ts, POST /api/3d/light, uploads up to MODEL_SOURCE_MAX_BYTES).
// Covers: a model within the cap is played as it is (39 MB case); one just over (41 MB) and far over (120 MB) gets a copy under the cap and the
// triangle budget; a dense mesh is simplified, huge textures are scaled to 2K (ffmpeg); a rigged, animated model keeps its skin, joints, weights
// and animation; a corrupt GLB and one over 200 MB get plain reasons; repeated asks reuse the copy (and concurrent ones share one run); the
// original is never changed; the route answers each case. The byte sizes are scaled down (cap passed in) so the test stays fast.
// Run: npx tsx test/glb-light.test.ts   (no server, no network; needs ffmpeg like the app)
import assert from 'node:assert/strict'; import { mkdtempSync, writeFileSync, readFileSync, statSync, truncateSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process'; import { createHash } from 'node:crypto'; import os from 'node:os'; import path from 'node:path';
const dir = mkdtempSync(path.join(os.tmpdir(), 'glb-light-test-')); process.env.OPENHIGGSFIELD_DATA_DIR = dir; process.env.OPENHIGGSFIELD_ENV_FILE = '/dev/null';
const { Document, NodeIO } = await import('@gltf-transform/core');
const L = await import('../src/glbLight.ts'); const M = await import('../src/shared/previzModels.ts');
const ok = (m: string) => console.log('ok ' + m); const io = new NodeIO();

/** an n×n grid (2n² triangles) with normals and UVs; skinned: two joints, weights, a skin and a turning animation; tex: a noisy JPEG of that size */
async function grid(n: number, o: { skinned?: boolean; tex?: number } = {}) {
  const doc = new Document(); const buf = doc.createBuffer(); const v = (n + 1) * (n + 1);
  const pos = new Float32Array(v * 3), nor = new Float32Array(v * 3), uv = new Float32Array(v * 2), j = new Uint8Array(v * 4), w = new Float32Array(v * 4);
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) { const i = y * (n + 1) + x; pos.set([x / n, Math.sin(x / 7) * Math.cos(y / 9) * 0.05, y / n], i * 3); nor.set([0, 1, 0], i * 3); uv.set([x / n, y / n], i * 2); j.set([0, 1, 0, 0], i * 4); w.set([1 - y / n, y / n, 0, 0], i * 4); }
  const idx = new Uint32Array(n * n * 6); let k = 0; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const a = y * (n + 1) + x, b = a + 1, c = a + n + 1, d = c + 1; idx.set([a, c, b, b, c, d], k); k += 6; }
  const acc = (t: 'VEC3' | 'VEC2' | 'VEC4' | 'SCALAR', a: any) => doc.createAccessor().setType(t).setArray(a).setBuffer(buf);
  const prim = doc.createPrimitive().setAttribute('POSITION', acc('VEC3', pos)).setAttribute('NORMAL', acc('VEC3', nor)).setAttribute('TEXCOORD_0', acc('VEC2', uv)).setIndices(acc('SCALAR', idx));
  if (o.tex) { const png = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `testsrc=s=${o.tex}x${o.tex},noise=alls=60:allf=t`, '-frames:v', '1', '-c:v', 'mjpeg', '-q:v', '2', '-f', 'image2pipe', 'pipe:1'], { maxBuffer: 1 << 28 });
    prim.setMaterial(doc.createMaterial().setBaseColorTexture(doc.createTexture().setImage(new Uint8Array(png)).setMimeType('image/jpeg'))); }
  const mesh = doc.createMesh().addPrimitive(prim); const node = doc.createNode('body').setMesh(mesh); const scene = doc.createScene().addChild(node);
  if (o.skinned) { prim.setAttribute('JOINTS_0', acc('VEC4', j)).setAttribute('WEIGHTS_0', acc('VEC4', w));
    const root = doc.createNode('hips'); const top = doc.createNode('chest').setTranslation([0, 0, 0.5]); root.addChild(top); scene.addChild(root);
    const ibm = new Float32Array(32); ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -0.5, 1], 16);
    node.setSkin(doc.createSkin().addJoint(root).addJoint(top).setSkeleton(root).setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buf)));
    const s = doc.createAnimationSampler().setInput(acc('SCALAR', new Float32Array([0, 1]))).setOutput(acc('VEC4', new Float32Array([0, 0, 0, 1, 0, 0.7071, 0, 0.7071])));
    doc.createAnimation('walk').addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(top).setTargetPath('rotation').setSampler(s)); }
  return io.writeBinary(doc);
}
const info = async (b: Uint8Array) => { const d = await io.readBinary(b); return { d, tris: L.triangleCount(d) }; };
const sha = (f: string) => createHash('sha1').update(readFileSync(f)).digest('hex');

await (async () => {
  // a model within the cap and the triangle budget: unchanged geometry (the "39 MB" case)
  const small = await grid(200); const r = await L.lightenGlb(small, small.byteLength * 1.2 + 1);
  assert.equal(r.trisAfter, 80_000); assert.equal(r.trisBefore, 80_000); ok('within the cap: the same triangles');
  // just over the cap (the "41 MB" case: 41/40) and far over (the "120 MB" case: 3×)
  const dense = await grid(300); const n0 = 180_000;
  for (const [label, f] of [['41 MB', 40 / 41], ['120 MB', 1 / 3]] as const) { const cap = Math.floor(dense.byteLength * f); const o = await L.lightenGlb(dense, cap);
    assert.ok(o.glb.byteLength <= cap, `${label}: ${o.glb.byteLength} > ${cap}`); assert.ok(o.trisAfter < n0 && o.trisAfter > 1000, `${label}: ${o.trisAfter}`);
    const { d } = await info(o.glb); const p = d.getRoot().listMeshes()[0].listPrimitives()[0];
    for (const s of ['NORMAL', 'TEXCOORD_0']) assert.equal(p.getAttribute(s)!.getCount(), p.getAttribute('POSITION')!.getCount(), s);
    assert.ok((p.getIndices()!.getArray() as Uint32Array).reduce((m, x) => Math.max(m, x), 0) < p.getAttribute('POSITION')!.getCount()); ok(`${label}: under the cap, ${o.trisAfter} triangles, attributes kept`); }
  // a dense mesh over the triangle budget, small in bytes: simplified to the budget
  const lots = await grid(460); const o = await L.lightenGlb(lots, 1e9); assert.ok(o.trisBefore > L.TRI_BUDGET && o.trisAfter <= L.TRI_BUDGET * 1.1, String(o.trisAfter)); ok('a dense mesh: at most the triangle budget');
  // huge textures: scaled to 2K, the mesh left alone
  const tex = await grid(20, { tex: 4096 }); const t = await L.lightenGlb(tex, Math.floor(tex.byteLength * 0.9));
  const { d: td, tris } = await info(t.glb); assert.deepEqual(td.getRoot().listTextures()[0].getSize(), [2048, 2048]); assert.equal(tris, 800); ok('huge textures: 2K, mesh unchanged');
  // rigged and animated: skin, joints, weights and animation survive the simplifier
  const rig = await grid(300, { skinned: true }); const g = await L.lightenGlb(rig, Math.floor(rig.byteLength / 2)); const { d: gd } = await info(g.glb);
  const gp = gd.getRoot().listMeshes()[0].listPrimitives()[0]; const nv = gp.getAttribute('POSITION')!.getCount();
  assert.equal(gd.getRoot().listSkins().length, 1); assert.equal(gd.getRoot().listSkins()[0].listJoints().length, 2); assert.equal(gd.getRoot().listAnimations()[0]?.getName(), 'walk');
  assert.equal(gp.getAttribute('JOINTS_0')!.getCount(), nv); assert.equal(gp.getAttribute('WEIGHTS_0')!.getCount(), nv); assert.ok(gd.getRoot().listNodes().some((x) => x.getSkin()));
  const wsum = gp.getAttribute('WEIGHTS_0')!.getElement(0, []).reduce((a: number, b: number) => a + b, 0); assert.ok(Math.abs(wsum - 1) < 1e-4); ok('rigged + animated: skin, joints, weights and the walk kept');
  // a corrupt GLB: a plain reason, no throw of another kind
  await assert.rejects(L.lightenGlb(new Uint8Array(Buffer.from('glTF\x02\x00\x00\x00garbage-garbage-garbage'))), (e: any) => e instanceof L.LightError && e.code === 'bad_glb'); ok('a corrupt GLB: bad_glb');

  // on disk: made once, reused, concurrent asks share one run, the original untouched
  const f = path.join(dir, 'abc-out0.glb'); writeFileSync(f, lots); const before = sha(f);
  const [a, b] = await Promise.all([L.lightCopyOf(f), L.lightCopyOf(f)]); assert.equal(a, b); assert.equal(a.reused, false); assert.equal(a.file, path.join(dir, 'abc-out0-light.glb'));
  const m1 = statSync(a.file).mtimeMs; const again = await L.lightCopyOf(f); assert.equal(again.reused, true); assert.equal(statSync(a.file).mtimeMs, m1); assert.equal(sha(f), before);
  ok('repeated Shot: the copy is made once and reused; the original is untouched');
  const huge = path.join(dir, 'huge.glb'); writeFileSync(huge, ''); truncateSync(huge, M.MODEL_SOURCE_MAX_BYTES + 1);
  await assert.rejects(L.lightCopyOf(huge), (e: any) => e.code === 'too_large' && /200 MB/.test(e.message)); ok('over 200 MB: too_large with the limit in words');

  // the route
  const Fastify = (await import('fastify')).default; const app = Fastify(); const { registerThreeD } = await import('../src/routes3d.ts'); registerThreeD(app);
  const post = (src: string) => app.inject({ method: 'POST', url: '/api/3d/light', payload: { src } }).then((r) => ({ s: r.statusCode, b: r.json() }));
  writeFileSync(path.join(dir, 'small.glb'), small); let r2 = await post('/files/small.glb'); assert.equal(r2.s, 200); assert.deepEqual([r2.b.url, r2.b.light], ['/files/small.glb', false]);
  r2 = await post('/files/missing.glb'); assert.equal(r2.s, 404); r2 = await post('/etc/passwd'); assert.equal(r2.s, 400); r2 = await post('/files/../x.glb'); assert.equal(r2.s, 400);
  r2 = await post('/files/huge.glb'); assert.equal(r2.s, 413); assert.equal(r2.b.code, 'too_large');
  const bad = path.join(dir, 'bad.glb'); writeFileSync(bad, Buffer.alloc(M.MODEL_MAX_BYTES + 10, 7)); r2 = await post('/files/bad.glb'); assert.equal(r2.s, 422); assert.equal(r2.b.code, 'bad_glb');
  ok('route: within the cap → itself; missing 404; bad path 400; over 200 MB 413; corrupt 422');
  await app.close();
})().finally(() => rmSync(dir, { recursive: true, force: true }));
