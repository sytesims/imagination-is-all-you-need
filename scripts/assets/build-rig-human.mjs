/**
 * Rig as a character (2026-10-27): how web/public/models/rig/human.glb was made from Mesh2Motion's human rig and animations (CC0 1.0,
 * https://github.com/Mesh2Motion/mesh2motion-app, static/rigs/rig-human.glb and static/animations/human-base-animations.glb).
 * One small file: the human skeleton (its rest pose from rig-human.glb, the fingers folded into one hand bone with a tip, no mesh) and the
 * moves a character can get (idle, walk, jog, sprint, jump start / land, dance, sit enter / idle / exit). Rotation channels only, except the
 * pelvis position (the hips' bob and the jump); scale channels dropped; resampled and meshopt-compressed.
 * Not part of the build. Run it with the gltf-transform packages from npm, outside the repo:
 *   npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer
 *   node build-rig-human.mjs rig-human.glb human-base-animations.glb human.glb
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const [rigPath, animPath, outPath] = process.argv.slice(2);
const rig = await io.read(rigPath); const doc = await io.read(animPath);
const KEEP = new Set(['Idle_A', 'Walk', 'Jog', 'Sprint', 'Jump_Start', 'Jump_Land', 'Dance_Simple', 'Sitting_Enter', 'Sitting_Idle', 'Sitting_Exit']);
const FINGER = /^(index|middle|pinky|ring|thumb)_/;
const root = doc.getRoot();
/* the rest pose: rig-human.glb's, bone by bone (the animation file carries the same bones in a slightly different rest pose) */
const rest = new Map(rig.getRoot().listNodes().map((n) => [n.getName(), n]));
/* the hand's tip: where the middle finger ends, in the hand's frame (the fingers go; one tip stays so the hand gets the palm and fingers) */
const tipOf = (side) => { const hand = rest.get(`hand_${side}`); let n = rest.get(`middle_01_${side}`); let m = [0, 0, 0];
  const mul = (a, b) => { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; };
  let local = n.getMatrix(); while (n.listChildren().length) { n = n.listChildren()[0]; local = mul(local, n.getMatrix()); } m = [local[12], local[13], local[14]]; void hand; return m; };
const tips = { l: tipOf('l'), r: tipOf('r') };
/* animations: the kept moves only, no scale channels, no finger channels, positions only on the pelvis */
for (const a of root.listAnimations()) {
  if (!KEEP.has(a.getName())) { for (const c of a.listChannels()) { c.getSampler()?.dispose(); c.dispose(); } a.dispose(); continue; }
  for (const ch of a.listChannels()) { const n = ch.getTargetNode()?.getName() ?? ''; const p = ch.getTargetPath();
    if (p === 'scale' || FINGER.test(n) || (p === 'translation' && n !== 'pelvis')) { ch.getSampler()?.dispose(); ch.dispose(); } }
}
/* no mesh, no skin: the skeleton only */
for (const n of root.listNodes()) { if (n.getMesh()) { n.setMesh(null); n.setSkin(null); } }
for (const s of root.listSkins()) s.dispose(); for (const m of root.listMeshes()) m.dispose();
for (const n of root.listNodes()) if (FINGER.test(n.getName())) n.dispose();
for (const n of root.listNodes()) { const r = rest.get(n.getName()); if (!r) continue; n.setTranslation(r.getTranslation()); n.setRotation(r.getRotation()); n.setScale([1, 1, 1]); }
for (const side of ['l', 'r']) { const hand = root.listNodes().find((n) => n.getName() === `hand_${side}`); const tip = doc.createNode(`hand_leaf_${side}`).setTranslation(tips[side]); hand.addChild(tip); }
for (const n of root.listNodes()) if (n.getName() === 'Mannequin' && !n.listChildren().length) n.dispose();
await doc.transform(prune({ keepLeaves: true, keepAttributes: false }), resample({ tolerance: 5e-4 }), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
await io.write(outPath, doc);
