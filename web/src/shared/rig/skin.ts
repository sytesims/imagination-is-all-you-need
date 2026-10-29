/**
 * Rig as a character: the skin weights for one mesh (Mesh2Motion's weight passes, vendored in ./m2m), on plain arrays so the worker
 * (rig.worker.ts) and the tests run the same code. Bones travel as data (name, parent, local position and rotation, table order);
 * the result is four bone indices and four weights per vertex, every weight finite and each vertex's weights summing to 1.
 */
import { Bone, BufferAttribute, BufferGeometry } from 'three';
import SkinningAlgorithm from './m2m/SkinningAlgorithm';
import { POSITION_BONE } from './humanRig';

export interface BoneData { name: string; parent: number; p: [number, number, number]; q: [number, number, number, number] }
export interface SkinInput { positions: Float32Array; index: Uint32Array | null; bones: BoneData[]; /** arms hang down (A-pose or lower): hand the chest back from the arm bones */ armPlane: boolean }
export interface SkinOutput { skinIndex: Uint16Array; skinWeight: Float32Array; ms: number }

export const boneData = (bones: Bone[]): BoneData[] => bones.map((b) => ({ name: b.name, parent: bones.indexOf(b.parent as Bone), p: b.position.toArray() as BoneData['p'], q: b.quaternion.toArray() as BoneData['q'] }));
/** Bones from data, joined into one hierarchy, world matrices up to date. */
export function bonesOf(data: BoneData[]): Bone[] {
  const out = data.map((d) => { const b = new Bone(); b.name = d.name; b.position.set(...d.p); b.quaternion.set(...d.q); return b; });
  data.forEach((d, i) => { if (d.parent >= 0) out[d.parent].add(out[i]); }); out[0].updateMatrixWorld(true); return out;
}
/** Skin weights for one mesh (rig space). onStep reports the four passes. */
export function skinWeights(inp: SkinInput, onStep?: (step: number, of: number) => void): SkinOutput {
  const t0 = performance.now(); const bones = bonesOf(inp.bones);
  const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(inp.positions, 3)); if (inp.index) g.setIndex(new BufferAttribute(inp.index, 1));
  const algo = new SkinningAlgorithm(bones[0], 'human', POSITION_BONE); algo.set_geometry(g); algo.set_arm_plane_correction_enabled(inp.armPlane);
  const [idx, w] = algo.calculate_indexes_and_weights(onStep);
  const n = inp.positions.length / 3; const skinIndex = new Uint16Array(n * 4); const skinWeight = new Float32Array(n * 4); const fallback = Math.max(0, bones.findIndex((b) => b.name === POSITION_BONE));
  /* a last check: finite, within the bones, summing to exactly 1 (a vertex left with nothing goes to the hips) */
  for (let v = 0; v < n; v++) { let s = 0;
    for (let k = 0; k < 4; k++) { const i = idx[v * 4 + k]; const x = w[v * 4 + k]; const ok = Number.isFinite(x) && x > 0 && i >= 0 && i < bones.length; skinIndex[v * 4 + k] = ok ? i : 0; skinWeight[v * 4 + k] = ok ? x : 0; if (ok) s += x; }
    if (!(s > 1e-6)) { skinIndex[v * 4] = fallback; skinWeight[v * 4] = 1; for (let k = 1; k < 4; k++) { skinIndex[v * 4 + k] = 0; skinWeight[v * 4 + k] = 0; } }
    else for (let k = 0; k < 4; k++) skinWeight[v * 4 + k] /= s; }
  return { skinIndex, skinWeight, ms: Math.round(performance.now() - t0) };
}
