/**
 * Mossbun's own rig (2026-10-27): how web/public/showcase/char-mossbun-rig.glb is made from web/public/showcase/char-mossbun-3d.glb (his
 * Tripo 3.1 model, same mesh, same texture). Uses web/src/shared/rig/mossbunRig.ts for everything that matters (the skeleton, the fit, the
 * skin weights, the moves); this script only reads and writes glTF:
 *  - his mesh in his unit frame (one unit tall, feet on y = 0, facing +z; the old turn and scale nodes are baked in), skinned to the 31 bones,
 *  - the lantern bud as its own primitive with an emissive copy of his material (named "Lantern"), so the player can pulse its glow,
 *  - six clips sampled at 30 fps from the moves in code (Idle, Walk, Hop, Wave, Dance, Lantern), linear keys,
 *  - deduplicated and quantized (KHR_mesh_quantization, which <model-viewer> and three.js read natively; no Meshopt, so the 3D viewer needs no
 *    decoder download).
 * Not part of the build. Run it outside the repo, with the gltf-transform packages from npm:
 *   npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer
 *   npx tsx build-mossbun-rig.mts <repo>/web/src/shared/rig/mossbunRig.ts char-mossbun-3d.glb char-mossbun-rig.glb
 */
import { pathToFileURL } from 'node:url';
import { NodeIO, type Node, type Accessor } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const [rigPath, inPath, outPath] = process.argv.slice(2);
const R = await import(pathToFileURL(rigPath).href) as typeof import('../../web/src/shared/rig/mossbunRig');
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inPath); const root = doc.getRoot(); const buf = root.listBuffers()[0];

// ---- his mesh, in his unit frame ----
const meshNode = root.listNodes().find((n) => n.getMesh())!; const prim = meshNode.getMesh()!.listPrimitives()[0]; const W = meshNode.getWorldMatrix();
const posA = prim.getAttribute('POSITION')!, nrmA = prim.getAttribute('NORMAL'), n = posA.getCount();
const P = new Float32Array(n * 3); const N = new Float32Array(n * 3); const v = [0, 0, 0];
for (let i = 0; i < n; i++) { posA.getElement(i, v); for (let r = 0; r < 3; r++) P[i * 3 + r] = W[r] * v[0] + W[4 + r] * v[1] + W[8 + r] * v[2] + W[12 + r];
  if (nrmA) { nrmA.getElement(i, v); let x = 0, y = 0, z = 0; x = W[0] * v[0] + W[4] * v[1] + W[8] * v[2]; y = W[1] * v[0] + W[5] * v[1] + W[9] * v[2]; z = W[2] * v[0] + W[6] * v[1] + W[10] * v[2]; const l = Math.hypot(x, y, z) || 1; N[i * 3] = x / l; N[i * 3 + 1] = y / l; N[i * 3 + 2] = z / l; } }
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < n * 3; i++) { lo[i % 3] = Math.min(lo[i % 3], P[i]); hi[i % 3] = Math.max(hi[i % 3], P[i]); }
const H = hi[1] - lo[1]; for (let i = 0; i < n; i++) { P[i * 3] = (P[i * 3] - (lo[0] + hi[0]) / 2) / H; P[i * 3 + 1] = (P[i * 3 + 1] - lo[1]) / H; P[i * 3 + 2] = (P[i * 3 + 2] - (lo[2] + hi[2]) / 2) / H; }
const index = prim.getIndices()!.getArray()!;

// ---- fit and skin (mossbunRig.ts) ----
const t0 = performance.now(); const J = R.fitMossbun(P); const skin = R.mossWeights(P, index, J); console.log(`fit + weights: ${Math.round(performance.now() - t0)} ms, ${n} vertices`);
const acc = (type: 'VEC3' | 'VEC4' | 'SCALAR', arr: Float32Array | Uint8Array | Uint16Array | Uint32Array) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
prim.setAttribute('POSITION', acc('VEC3', P)); if (nrmA) prim.setAttribute('NORMAL', acc('VEC3', N));
prim.setAttribute('JOINTS_0', acc('VEC4', skin.joints)); prim.setAttribute('WEIGHTS_0', acc('VEC4', skin.weights));

// ---- the lantern bud: its own primitive with a glowing copy of the material ----
const tri = index.length / 3; const body: number[] = [], bud: number[] = [];
const isBud = (i: number) => skin.parts[i] === 3 && P[i * 3 + 1] > J.lantern[1] - 0.02 && P[i * 3 + 2] < -0.2;
for (let t = 0; t < tri; t++) { const a = index[t * 3], b = index[t * 3 + 1], c = index[t * 3 + 2]; (isBud(a) && isBud(b) && isBud(c) ? bud : body).push(a, b, c); }
prim.setIndices(acc('SCALAR', Uint32Array.from(body)));
const mat = prim.getMaterial()!; const glow = mat.clone().setName('Lantern').setEmissiveTexture(mat.getBaseColorTexture()).setEmissiveFactor([1, 0.62, 0.3]);
const budPrim = prim.clone().setIndices(acc('SCALAR', Uint32Array.from(bud))).setMaterial(glow); meshNode.getMesh()!.addPrimitive(budPrim);
console.log(`lantern: ${bud.length / 3} triangles of ${tri}`);

// ---- the skeleton ----
for (const p of meshNode.listParents()) if ((p as any).propertyType === 'Node') (p as Node).removeChild(meshNode);
const scene = root.getDefaultScene() ?? root.listScenes()[0]; for (const c of scene.listChildren()) scene.removeChild(c);
for (const nd of root.listNodes()) if (nd !== meshNode) nd.dispose();
meshNode.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]).setName('Mossbun'); scene.addChild(meshNode);
const rest = R.boneLocals({}, J, 1); const bones: Node[] = R.MOSS_BONES.map(([name], i) => doc.createNode(name).setTranslation(rest[i].t));
R.MOSS_BONES.forEach(([, p], i) => { if (p >= 0) bones[p].addChild(bones[i]); });
const arm = doc.createNode('Armature').addChild(bones[0]); scene.addChild(arm);
const ibm = new Float32Array(16 * bones.length); R.MOSS_BONES.forEach(([name], i) => { const w = J[name]; ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -w[0], -w[1], -w[2], 1], i * 16); });
const sk = doc.createSkin('MossbunSkin').setSkeleton(bones[0]).setInverseBindMatrices(acc('VEC4', ibm).setType('MAT4')); for (const b of bones) sk.addJoint(b); meshNode.setSkin(sk);

// ---- the moves, sampled at 30 fps ----
const FPS = 30;
for (const c of R.MOSS_CLIPS) {
  const frames = Math.round(c.dur * FPS); const times = new Float32Array(frames + 1); const locs: ReturnType<typeof R.boneLocals>[] = [];
  for (let f = 0; f <= frames; f++) { const t = (f / frames) * c.dur; times[f] = t; locs.push(R.boneLocals(c.sample(f === frames ? 0 : t), J, 1)); } /* the last key is the first: a seamless loop */
  const anim = doc.createAnimation(c.name); const input = acc('SCALAR', times);
  R.MOSS_BONES.forEach((_, i) => {
    const same = (k: 't' | 'q' | 's') => locs.every((l) => l[i][k].every((x, j) => Math.abs(x - rest[i][k][j]) < 1e-6));
    for (const [k, path, type] of [['q', 'rotation', 'VEC4'], ['t', 'translation', 'VEC3'], ['s', 'scale', 'VEC3']] as const) { if (same(k)) continue;
      const out = new Float32Array(locs.length * (type === 'VEC4' ? 4 : 3)); locs.forEach((l, f) => out.set(l[i][k], f * (type === 'VEC4' ? 4 : 3)));
      const s = doc.createAnimationSampler().setInput(input).setOutput(acc(type, out)).setInterpolation('LINEAR'); anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(bones[i]).setTargetPath(path).setSampler(s)); } });
}
await doc.transform(prune({ keepLeaves: true }), dedup(), quantize({ quantizeNormal: 8 }));
await io.write(outPath, doc); const { statSync } = await import('node:fs'); console.log(`${outPath}: ${(statSync(outPath).size / 1048576).toFixed(2)} MB`);
void ({} as Accessor);
