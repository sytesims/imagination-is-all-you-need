/**
 * Play the actor (2026-10-26): how web/public/models/mannequin/mannequin.glb was made from Quaternius' Universal Animation Library
 * (Standard, Unreal-Godot/UAL1_Standard.glb, CC0, https://quaternius.com). Keeps the ten clips the actor uses, drops UVs (no textures),
 * finger / scale / non-root translation channels, resamples, dedupes, quantizes and meshopt-compresses: 7.6 MB → about 0.2 MB.
 * Not part of the build. Run it with the gltf-transform packages from npm, outside the repo:
 *   npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer
 *   node optimize-mannequin.mjs UAL1_Standard.glb mannequin.glb
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, dedup, prune, quantize, meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const KEEP = new Set(['Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Sprint_Loop','Dance_Loop','Sitting_Enter','Sitting_Idle_Loop','Sitting_Exit','Jump_Start','Jump_Land']);
for (const a of doc.getRoot().listAnimations()) if (!KEEP.has(a.getName())) { for (const c of a.listChannels()) c.dispose(); for (const s of a.listSamplers()) s.dispose(); a.dispose(); }
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { for (const s of ['TEXCOORD_0','TEXCOORD_1']) { const at = p.getAttribute(s); if (at) { p.setAttribute(s, null); } } }
for (const a of doc.getRoot().listAnimations()) for (const ch of a.listChannels()) { const n = ch.getTargetNode()?.getName() ?? ''; const path = ch.getTargetPath();
  if (path === 'scale' || /^(index|middle|pinky|ring|thumb)_/.test(n) || (path === 'translation' && !/^(root|pelvis)$/.test(n))) { const sm = ch.getSampler(); ch.dispose(); sm?.dispose(); } }
await doc.transform(prune(), weld(), resample({ tolerance: 5e-4 }), dedup(), prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
await io.write(process.argv[3], doc);
