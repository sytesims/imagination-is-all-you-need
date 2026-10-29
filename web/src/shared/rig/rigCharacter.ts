/**
 * Rig as a character (2026-10-27): the whole job in the browser, free, nothing sent to a provider. Read a GLB (the same checks as Direct
 * a Shot's models: size cap, binary glTF, meshes), stand it in rig space (feet on the ground, facing +z, the template's height), fit the
 * human skeleton (humanRig.ts), paint the skin weights in a worker (skin.ts, Mesh2Motion's passes), bake the moves you picked from
 * Mesh2Motion's CC0 human pack (web/public/models/rig/human.glb), export one animated GLB (GLTFExporter) and keep it as a new 3D result
 * linked to the model it came from (POST /api/3d/rig, $0).
 */
import { AnimationClip, Bone, BufferAttribute, BufferGeometry, Float32BufferAttribute, Group, Matrix4, Object3D, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3, type Material, type Mesh } from 'three';
import { MODEL_MAX_BYTES } from '../../../../server/src/shared/previzModels';
import { RIG_CLIP, RIG_MOVES, rolesOf, type RigMeta, type RigMoveId } from '../../../../server/src/shared/previzRig';
import { TEMPLATE_HEIGHT, TEMPLATE_PELVIS_Y, POSITION_BONE, skeletonFrom, fitHuman, type Joints, type FitReport } from './humanRig';
import { boneData, skinWeights, type SkinInput, type SkinOutput } from './skin';

export class RigError extends Error {}
/** Rigging works up to this many vertices (all meshes together): more makes the weights slow and the file heavy. */
export const RIG_MAX_VERTICES = 250_000;
export const MOVES_URL = '/models/rig/human.glb';
const mb = (b: number) => `${(b / 1048576).toFixed(b > 10485760 ? 0 : 1)} MB`;
const fmtN = (n: number) => n.toLocaleString('en-US');

export interface RigPart { geometry: BufferGeometry; material: Material | Material[]; name: string }
export interface RigModel { src: string; parts: RigPart[]; vertices: number; textured: boolean; /** the bones and moves it came with (an already rigged file), else null */ own: { bones: number; clips: string[] } | null;
  /** all parts' vertices and triangles together, in rig space (for the fit) */ points: Float32Array; index: Uint32Array; /** quarter turns applied */ turn: number }

async function loader() {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')]);
  const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder); return l;
}
/** Plain float attributes (no interleaving, no quantization), so the weights, the merge and the export read them the same way. */
function plain(g: BufferGeometry): BufferGeometry {
  const out = new BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes) as [string, any][]) { if (name === 'skinIndex' || name === 'skinWeight' || /^_/.test(name)) continue;
    const n = a.count, k = a.itemSize; const arr = new Float32Array(n * k);
    for (let i = 0; i < n; i++) for (let c = 0; c < k; c++) arr[i * k + c] = c === 0 ? a.getX(i) : c === 1 ? a.getY(i) : c === 2 ? a.getZ(i) : a.getW(i);
    out.setAttribute(name, new Float32BufferAttribute(arr, k)); }
  if (g.index) out.setIndex(new BufferAttribute(Uint32Array.from(g.index.array as ArrayLike<number>), 1));
  for (const gr of g.groups) out.addGroup(gr.start, gr.count, gr.materialIndex);
  return out;
}

/** Load and check a model, stand it in rig space (turned by quarter turns about the vertical). Rejects with a RigError in plain words. */
export async function readModel(src: string, turn = 0): Promise<RigModel> {
  const r = await fetch(src).catch(() => null); if (!r || !r.ok) throw new RigError(r?.status === 404 ? 'That model’s file is no longer on this computer.' : 'That model’s file could not be loaded.');
  const buf = await r.arrayBuffer(); if (buf.byteLength > MODEL_MAX_BYTES) throw new RigError(`That model is ${mb(buf.byteLength)}. Rigging takes up to ${mb(MODEL_MAX_BYTES)}: make a lighter copy and try again.`);
  if (buf.byteLength < 20 || new DataView(buf).getUint32(0, true) !== 0x46546c67) throw new RigError('That file isn’t a GLB (binary glTF).');
  const g = await (await loader()).parseAsync(buf, src.replace(/[^/]*$/, '')).catch((e: unknown) => { const m = e instanceof Error ? e.message : '';
    throw new RigError(/draco/i.test(m) ? 'That GLB is Draco-compressed. Export it without Draco and try again.' : 'That GLB could not be read.'); });
  const scene = g.scene ?? g.scenes?.[0]; if (!scene) throw new RigError('That GLB has no scene.');
  scene.updateMatrixWorld(true); const parts: RigPart[] = []; let bones = 0; let textured = false;
  scene.traverse((o: Object3D) => { if ((o as Bone).isBone) bones++; const m = o as Mesh; if (!m.isMesh || !m.visible) return;
    const geo = plain(m.geometry); if (!geo.getAttribute('position')) return; geo.applyMatrix4(m.matrixWorld);
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if ((mat as any)?.map) textured = true;
    parts.push({ geometry: geo, material: m.material, name: m.name || 'Body' }); });
  if (!parts.length) throw new RigError('That GLB has no meshes: there is nothing to rig.');
  const vertices = parts.reduce((a, p) => a + p.geometry.getAttribute('position').count, 0);
  if (vertices > RIG_MAX_VERTICES) throw new RigError(`This model is very detailed (${fmtN(vertices)} vertices). Rigging works up to ${fmtN(RIG_MAX_VERTICES)}: make a lighter copy with fewer faces and try again.`);
  /* stand it up: turned, feet on y = 0, centred, as tall as the template */
  const turnM = new Matrix4().makeRotationY((turn * Math.PI) / 2); for (const p of parts) p.geometry.applyMatrix4(turnM);
  const lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of parts) { p.geometry.computeBoundingBox(); const b = p.geometry.boundingBox!; if (![b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].every(Number.isFinite)) throw new RigError('That model has broken geometry (points with no position), so it can’t be rigged.'); lo.min(b.min); hi.max(b.max); }
  const H = hi.y - lo.y, W = hi.x - lo.x, D = hi.z - lo.z; if (!(H > 0)) throw new RigError('That model is flat (it has no height), so it can’t be rigged.');
  if (H < 0.45 * Math.max(W, D)) throw new RigError('This model is lying down or much wider than it is tall. Rigging needs a character standing up, feet on the ground.');
  const s = TEMPLATE_HEIGHT / H; const norm = new Matrix4().makeScale(s, s, s).multiply(new Matrix4().makeTranslation(-(lo.x + hi.x) / 2, -lo.y, -(lo.z + hi.z) / 2));
  const { mergeVertices } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
  for (const p of parts) { p.geometry.applyMatrix4(norm); if (!p.geometry.index) p.geometry = mergeVertices(p.geometry); }
  const total = parts.reduce((a, p) => a + p.geometry.getAttribute('position').count, 0); const tris = parts.reduce((a, p) => a + p.geometry.index!.count, 0);
  const points = new Float32Array(total * 3); const index = new Uint32Array(tris); let vo = 0, io = 0;
  for (const p of parts) { const pa = p.geometry.getAttribute('position').array as Float32Array; points.set(pa, vo * 3); const ia = p.geometry.index!.array; for (let i = 0; i < ia.length; i++) index[io + i] = ia[i] + vo; vo += pa.length / 3; io += ia.length; }
  const own = g.animations?.length || bones ? { bones, clips: (g.animations ?? []).map((a: AnimationClip) => a.name || 'Animation') } : null;
  return { src, parts, vertices: total, textured, own, points, index, turn };
}

/** The first fit (deterministic): joints and what it could not find. */
export const autoFit = (m: RigModel): { joints: Joints; report: FitReport } => fitHuman(m.points, m.index);

/** Skin weights for every part, in a worker when the browser has them (the page stays responsive), else here. onStep: 0…1. */
export function skinAll(m: RigModel, joints: Joints, armPlane: boolean, onStep?: (p: number) => void): Promise<SkinOutput[]> {
  const { bones } = skeletonFrom(joints); const bd = boneData(bones);
  const inputs: SkinInput[] = m.parts.map((p) => ({ positions: (p.geometry.getAttribute('position').array as Float32Array).slice(), index: Uint32Array.from(p.geometry.index!.array as ArrayLike<number>), bones: bd, armPlane }));
  if (typeof Worker === 'undefined') return Promise.resolve(inputs.map((x, i) => skinWeights(x, (s, of) => onStep?.((i + s / of) / inputs.length))));
  return new Promise((resolve, reject) => {
    let w: Worker; try { w = new Worker(new URL('./rig.worker.ts', import.meta.url), { type: 'module' }); } catch { resolve(inputs.map((x) => skinWeights(x))); return; }
    const id = Date.now(); const done = () => w.terminate();
    w.onmessage = (e: MessageEvent<any>) => { const d = e.data; if (d.id !== id) return; if (d.step != null) onStep?.(d.step); else if (d.done) { done(); resolve(d.done); } else if (d.error) { done(); reject(new RigError('The skin could not be painted on this model. Nothing changed. Try nudging the bones, or pick another model.')); } };
    w.onerror = () => { done(); reject(new RigError('The skin could not be painted on this model. Nothing changed. Try again.')); };
    w.postMessage({ id, meshes: inputs }, inputs.flatMap((x) => [x.positions.buffer, ...(x.index ? [x.index.buffer] : [])]));
  });
}

let moves: Promise<AnimationClip[]> | null = null;
/** Mesh2Motion's human moves (CC0), loaded once per page. */
export function loadMoves(): Promise<AnimationClip[]> {
  moves ??= (async () => (await (await loader()).loadAsync(MOVES_URL)).animations)().catch(() => { moves = null; throw new RigError('The moves could not be loaded. Check your connection and try again.'); });
  return moves;
}
/** The clips for the moves you picked, renamed to the saved names (RIG_CLIP) and with the hips' height scaled to the model. */
export function bakeClips(all: AnimationClip[], picked: RigMoveId[], pelvisY: number): AnimationClip[] {
  const k = pelvisY / TEMPLATE_PELVIS_Y; const out: AnimationClip[] = [];
  for (const mv of RIG_MOVES) { if (!picked.includes(mv.id)) continue;
    for (const [from, role] of mv.from) { const c = all.find((x) => x.name === from); if (!c) continue; const clip = c.clone(); clip.name = RIG_CLIP[role];
      for (const t of clip.tracks) if (t.name === `${POSITION_BONE}.position`) { const v = t.values.slice(); for (let i = 0; i < v.length; i++) v[i] *= k; t.values = v; }
      out.push(clip); } }
  return out;
}

/** The character: the skeleton for the joints and every part skinned to it, centred on its hips. */
export function buildCharacter(m: RigModel, joints: Joints, skins: SkinOutput[]): { scene: Group; bones: Bone[]; skeleton: Skeleton; joints: Joints } {
  const px = joints[POSITION_BONE][0], pz = joints[POSITION_BONE][2];
  const J: Joints = Object.fromEntries(Object.entries(joints).map(([n, p]) => [n, [p[0] - px, p[1], p[2] - pz]])) as Joints;
  const { root, bones } = skeletonFrom(J); const skeleton = new Skeleton(bones);
  const scene = new Group(); scene.name = 'Character'; const arm = new Object3D(); arm.name = 'Armature'; arm.add(root); scene.add(arm);
  m.parts.forEach((p, i) => { const g = p.geometry.clone(); g.translate(-px, 0, -pz); g.setAttribute('skinIndex', new Uint16BufferAttribute(skins[i].skinIndex, 4)); g.setAttribute('skinWeight', new Float32BufferAttribute(skins[i].skinWeight, 4));
    g.computeBoundingBox(); g.computeBoundingSphere(); if (!g.getAttribute('normal')) g.computeVertexNormals();
    const sm = new SkinnedMesh(g, p.material); sm.name = p.name; sm.castShadow = true; sm.frustumCulled = false; scene.add(sm); sm.bind(skeleton, new Matrix4()); });
  scene.updateMatrixWorld(true);
  return { scene, bones, skeleton, joints: J };
}

/** One GLB with the character and its moves. */
export async function exportGlb(scene: Group, clips: AnimationClip[]): Promise<ArrayBuffer> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const out = await new GLTFExporter().parseAsync(scene, { binary: true, animations: clips, onlyVisible: false }).catch(() => { throw new RigError('The character could not be saved as a GLB. Nothing changed. Try again.'); });
  if (!(out instanceof ArrayBuffer)) throw new RigError('The character could not be saved as a GLB. Try again.');
  if (out.byteLength > MODEL_MAX_BYTES) throw new RigError(`The rigged character came out at ${mb(out.byteLength)}, over the ${mb(MODEL_MAX_BYTES)} a 3D model can be. Make a lighter copy of the model (smaller textures) and try again.`);
  return out;
}
/** Keep it as a new 3D result (POST /api/3d/rig, free). */
export async function saveCharacter(glb: ArrayBuffer, meta: RigMeta, poster: Blob | null): Promise<{ id: string; url: string }> {
  const fd = new FormData(); fd.append('meta', JSON.stringify(meta)); fd.append('model', new Blob([glb], { type: 'model/gltf-binary' }), 'character.glb'); if (poster) fd.append('poster', poster, 'poster.png');
  const r = await fetch('/api/3d/rig', { method: 'POST', body: fd }).catch(() => null); const b = r ? await r.json().catch(() => ({})) : {};
  if (!r || !r.ok) throw new RigError(b.error || 'The character could not be saved. Nothing changed. Try again.');
  return { id: String(b.id), url: String(b.url) };
}
/** The clips a file came with, by role (an already rigged model). */
export const ownRoles = (clips: string[]) => rolesOf(clips);
