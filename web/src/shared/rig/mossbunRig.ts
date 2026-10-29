/**
 * Mossbun's own rig (2026-10-27): a skeleton made for his shape, fitted to his mesh, skinned with our own weights, and his moves made in
 * code. Pure maths (no three.js, no DOM), so the build (scripts/assets/build-mossbun-rig.mts writes web/public/showcase/char-mossbun-rig.glb),
 * the runtime (Direct a Shot's actor, Explore's city) and the tests share it. Everything is in his "unit frame": one unit tall, feet on y = 0,
 * centred on his bounding box (the tail pushes the box's centre to his left: his body's middle is at x ≈ −0.04), facing +z, his left at +x.
 *  - MOSS_BONES: root (on the ground, under him: the hop's lift and squash) → hips → chest → head; two long leaf-ears (3 bones and a tip each,
 *    so they flop); two short legs; two little arms; the tail (4 bones) ending at the lantern bud. Rest rotations are identity (world-aligned),
 *    so every move is a plain turn about x (back / forward), y (round) or z (sideways).
 *  - fitMossbun(points): the measured joints (fixed offsets, measured once on this model) moved onto landmarks found on the mesh where they are
 *    reliable: each foot's centroid, the ears' cross-sections, the tail's centre line.
 *  - mossWeights(points, index, joints): the skin. Each vertex belongs to a part (left ear, right ear, tail, body) found by a flood fill over the
 *    mesh from seeds deep inside each part, so an ear never takes weight from the cheek it hangs by; within its part it blends the nearest bones
 *    (inverse distance to each bone's segment), then the weights are smoothed over the mesh. No tearing at the ears, the leaves or the tail
 *    (the test checks every edge's stretch in the most extreme poses).
 *  - MOSS_CLIPS: Idle, Walk (a waddle), Hop (three hops: squash and stretch, the ears and tail following through a beat behind), Wave, Dance,
 *    Lantern (the tail lifts the lantern and it swings). Each is a pure function of time, looped seamlessly; the build samples them at 30 fps.
 *  - mossGlow(hopTime): the lantern's glow pulse on each landing, a pure function of the Hop clip's time.
 */
export type V3 = [number, number, number]; type Q4 = [number, number, number, number];
/** his files: the model from Image to 3D (no bones: it hops), and the rigged copy built from it (scripts/assets/build-mossbun-rig.mts) */
export const MOSSBUN_STATIC = '/showcase/char-mossbun-3d.glb'; export const MOSSBUN_RIG = '/showcase/char-mossbun-rig.glb';
/** [name, parent (−1 none), rest position in the unit frame] (parents before children). A bone's segment runs to its first child. */
export const MOSS_BONES: [string, number, V3][] = [
  ['root', -1, [-0.04, 0, 0.18]], ['hips', 0, [-0.04, 0.14, 0.15]], ['chest', 1, [-0.02, 0.4, 0.22]], ['head', 2, [-0.02, 0.6, 0.26]], ['head_top', 3, [-0.05, 0.95, 0.22]],
  ['ear_l_1', 3, [0.27, 0.7, 0.27]], ['ear_l_2', 5, [0.31, 0.5, 0.3]], ['ear_l_3', 6, [0.34, 0.33, 0.38]], ['ear_l_tip', 7, [0.35, 0.17, 0.43]],
  ['ear_r_1', 3, [-0.35, 0.7, 0.27]], ['ear_r_2', 9, [-0.39, 0.5, 0.3]], ['ear_r_3', 10, [-0.42, 0.33, 0.38]], ['ear_r_tip', 11, [-0.43, 0.17, 0.43]],
  ['arm_l', 2, [0.1, 0.33, 0.36]], ['paw_l', 13, [0.12, 0.22, 0.42]], ['paw_l_tip', 14, [0.12, 0.17, 0.45]],
  ['arm_r', 2, [-0.18, 0.33, 0.36]], ['paw_r', 16, [-0.2, 0.22, 0.42]], ['paw_r_tip', 17, [-0.2, 0.17, 0.45]],
  ['leg_l', 1, [0.06, 0.12, 0.2]], ['foot_l', 19, [0.06, 0.03, 0.22]], ['toe_l', 20, [0.06, 0.015, 0.33]],
  ['leg_r', 1, [-0.14, 0.12, 0.2]], ['foot_r', 22, [-0.14, 0.03, 0.22]], ['toe_r', 23, [-0.14, 0.015, 0.33]],
  ['tail_1', 1, [-0.07, 0.14, -0.05]], ['tail_2', 25, [0.1, 0.15, -0.42]], ['tail_3', 26, [0.24, 0.27, -0.53]], ['tail_4', 27, [0.34, 0.52, -0.49]], ['lantern', 28, [0.36, 0.75, -0.35]], ['lantern_tip', 29, [0.39, 0.98, -0.29]],
];
export const MOSS_BONE_NAMES = MOSS_BONES.map((b) => b[0]);
const IDX = (n: string) => MOSS_BONE_NAMES.indexOf(n);
/** his body's middle (x) in the unit frame */ export const MOSS_MID_X = -0.04;
/** bones that take no skin: the root (lift and squash only) and the tips (they only aim their parent) */
export const isTip = (n: string) => n === 'root' || /_tip$|^head_top$|^toe_/.test(n);
/** the parts the skin is split into, and the bones each may use (a part's bones blend with the bone it hangs from) */
export type Part = 'body' | 'earL' | 'earR' | 'tail';
const PART_BONES: Record<Part, string[]> = {
  body: ['hips', 'chest', 'head', 'arm_l', 'paw_l', 'arm_r', 'paw_r', 'leg_l', 'foot_l', 'leg_r', 'foot_r'],
  earL: ['head', 'ear_l_1', 'ear_l_2', 'ear_l_3'], earR: ['head', 'ear_r_1', 'ear_r_2', 'ear_r_3'], tail: ['hips', 'tail_1', 'tail_2', 'tail_3', 'tail_4', 'lantern'],
};

// ---------- small maths ----------
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** distance from p to the segment a→b */
export function segDist(p: V3, a: V3, b: V3) { const ab = sub(b, a), ap = sub(p, a); const L = dot(ab, ab); const k = L > 1e-12 ? Math.min(1, Math.max(0, dot(ap, ab) / L)) : 0;
  const d: V3 = [ap[0] - ab[0] * k, ap[1] - ab[1] * k, ap[2] - ab[2] * k]; return Math.sqrt(dot(d, d)); }
/** quaternion from Euler angles (radians), order XYZ (three.js's default) */
export function quatXYZ(x: number, y: number, z: number): Q4 {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2), s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3]; }
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const fract = (x: number) => x - Math.floor(x);
const TAU = Math.PI * 2;

// ---------- fitting ----------
export type MossJoints = Record<string, V3>;
/**
 * The joints for his mesh. points = vertices in the unit frame (x, y, z, …). Starts from the measured joints and moves the reliable ones onto
 * the mesh: the feet onto each foot's centroid (and the legs above them), the ears and the tail onto the middle of their cross-sections.
 * A landmark with too few vertices keeps its measured place. Deterministic.
 */
export function fitMossbun(points: Float32Array): MossJoints {
  const J: MossJoints = Object.fromEntries(MOSS_BONES.map(([n, , p]) => [n, [...p] as V3])); const n = Math.floor(points.length / 3);
  const mean = (keep: (x: number, y: number, z: number) => boolean, min = 20): V3 | null => { let sx = 0, sy = 0, sz = 0, c = 0;
    for (let i = 0; i < n; i++) { const x = points[i * 3], y = points[i * 3 + 1], z = points[i * 3 + 2]; if (!keep(x, y, z)) continue; sx += x; sy += y; sz += z; c++; }
    return c >= min ? [sx / c, sy / c, sz / c] : null; };
  for (const [s, sg] of [['l', 1], ['r', -1]] as const) {
    const f = mean((x, y, z) => y < 0.04 && (x - MOSS_MID_X) * sg > 0.02 && z > 0); if (f) { const dx = f[0] - J[`foot_${s}`][0], dz = f[2] - J[`foot_${s}`][2]; for (const b of [`leg_${s}`, `foot_${s}`, `toe_${s}`]) { J[b][0] += dx; J[b][2] += dz; } }
    /* the ear's middle at each joint's height, away from the head and in front of the tail */
    for (const b of [`ear_${s}_2`, `ear_${s}_3`, `ear_${s}_tip`]) { const yy = J[b][1]; const m = mean((x, y, z) => Math.abs(y - yy) < 0.025 && (x - MOSS_MID_X) * sg > 0.27 && z > -0.1, 15); if (m) { J[b][0] = m[0]; J[b][2] = m[2]; } }
  }
  /* the tail: its middle where it runs back along the ground, then where it rises */
  const t2 = mean((x, y, z) => Math.abs(z - J.tail_2[2]) < 0.025 && y < 0.25 && x > -0.2); if (t2) { J.tail_2[0] = t2[0]; J.tail_2[1] = t2[1]; }
  for (const b of ['tail_3', 'tail_4', 'lantern']) { const yy = J[b][1]; const m = mean((x, y, z) => Math.abs(y - yy) < 0.025 && z < -0.25 && x > 0.1); if (m) { J[b][0] = m[0]; J[b][2] = m[2]; } }
  for (const k of Object.keys(J)) J[k] = J[k].map((v) => Math.round(v * 1e5) / 1e5) as V3;
  return J;
}

// ---------- skinning ----------
/** Welded vertices (same position = one vertex) and their neighbours, so the parts and the smoothing see one surface across UV seams. */
function weld(points: Float32Array, index: ArrayLike<number>) {
  const n = Math.floor(points.length / 3); const id = new Int32Array(n); const keys = new Map<string, number>(); let m = 0;
  for (let i = 0; i < n; i++) { const k = `${Math.round(points[i * 3] * 1e5)},${Math.round(points[i * 3 + 1] * 1e5)},${Math.round(points[i * 3 + 2] * 1e5)}`; let w = keys.get(k); if (w === undefined) { w = m++; keys.set(k, w); } id[i] = w; }
  const nb: Set<number>[] = Array.from({ length: m }, () => new Set<number>());
  for (let t = 0; t + 2 < index.length; t += 3) { const a = id[index[t]], b = id[index[t + 1]], c = id[index[t + 2]]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
  const pos = new Float32Array(m * 3); for (let i = 0; i < n; i++) { pos[id[i] * 3] = points[i * 3]; pos[id[i] * 3 + 1] = points[i * 3 + 1]; pos[id[i] * 3 + 2] = points[i * 3 + 2]; }
  return { id, m, nb: nb.map((s) => [...s]), pos };
}
/**
 * Which part each welded vertex belongs to: seeds deep in each part (the middle strip of the body, the lower ears away from the head, the tail
 * behind him), then every vertex takes the part of its nearest seed measured along the surface (Dijkstra over the mesh edges). An ear only
 * meets the head at its root, so its whole length stays an ear even where it hangs by the cheek; the lantern's leaves stay with the lantern.
 */
/** Shortest distances along the mesh surface from the source vertices (Dijkstra over welded edges); label spreads each source's own label. */
function surfaceDistance(w: ReturnType<typeof weld>, src: Int32Array /* label per vertex, −1 = not a source */, pass: (j: number) => boolean = () => true) {
  const dist = new Float64Array(w.m).fill(Infinity); const label = Int32Array.from(src); const heap: [number, number][] = [];
  const push = (d: number, i: number) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const q = (k - 1) >> 1; if (heap[q][0] <= heap[k][0]) break; [heap[q], heap[k]] = [heap[k], heap[q]]; k = q; } };
  const pop = () => { const top = heap[0]; const last = heap.pop()!; if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  for (let i = 0; i < w.m; i++) if (src[i] >= 0) { dist[i] = 0; push(0, i); }
  while (heap.length) { const [d, i] = pop(); if (d > dist[i]) continue;
    for (const j of w.nb[i]) { if (!pass(j)) continue; const nd = d + Math.hypot(w.pos[j * 3] - w.pos[i * 3], w.pos[j * 3 + 1] - w.pos[i * 3 + 1], w.pos[j * 3 + 2] - w.pos[i * 3 + 2]); if (nd < dist[j]) { dist[j] = nd; label[j] = label[i]; push(nd, j); } } }
  return { dist, label };
}
/**
 * Which part each welded vertex belongs to: seeds deep in each part (the middle strip of the body, the free lower ears, the tail behind him),
 * then every vertex takes the part of its nearest seed measured along the surface. His ears are joined to his cheeks down to about half his
 * height (the model is one piece), so the seam between ear and cheek is wherever the two meet: mossWeights fades the ear bones out towards it.
 */
function partsOf(w: ReturnType<typeof weld>, J: MossJoints): Uint8Array {
  const tb = ['tail_2', 'tail_3', 'tail_4', 'lantern', 'lantern_tip'].map((k) => J[k]); const src = new Int32Array(w.m).fill(-1);
  for (let i = 0; i < w.m; i++) { const p: V3 = [w.pos[i * 3], w.pos[i * 3 + 1], w.pos[i * 3 + 2]]; const dx = p[0] - MOSS_MID_X;
    if (Math.abs(dx) < 0.15 && p[2] > -0.05 && p[1] > 0.05 && p[1] < 0.9) src[i] = 0;
    else if (Math.abs(dx) > 0.3 && p[2] > -0.1 && p[1] < 0.45 && p[1] > 0.12) src[i] = dx > 0 ? 1 : 2;
    else if (p[2] < -0.25 && tb.slice(0, -1).some((q, k) => segDist(p, q, tb[k + 1]) < 0.07)) src[i] = 3; }
  return Uint8Array.from(surfaceDistance(w, src).label);
}
export interface MossSkin { joints: Uint8Array; weights: Float32Array; parts: Uint8Array }
/**
 * Four bone indices and weights per vertex (summing to 1, finite). points / index = his mesh in the unit frame; J = his joints.
 * Within its part, a vertex blends its three nearest bones by inverse distance (to the 4th power) to each bone's segment; the arms and legs
 * reach only a short way (they are small); then four rounds of smoothing over the welded mesh soften every boundary.
 */
export function mossWeights(points: Float32Array, index: ArrayLike<number>, J: MossJoints): MossSkin {
  const w = weld(points, index); const parts = partsOf(w, J); const PARTS: Part[] = ['body', 'earL', 'earR', 'tail'];
  const seg = MOSS_BONES.map(([nm], i) => { const c = MOSS_BONES.findIndex((b) => b[1] === i); return { a: J[nm], b: c >= 0 ? J[MOSS_BONES[c][0]] : J[nm] }; });
  const reach: Record<string, number> = { arm_l: 0.06, paw_l: 0.06, arm_r: 0.06, paw_r: 0.06, leg_l: 0.09, foot_l: 0.09, leg_r: 0.09, foot_r: 0.09 };
  /* how far each ear / tail vertex is from where its part meets the body, along the surface: the part's own bones fade in over SEAM */
  const fromBody = surfaceDistance(w, Int32Array.from(parts, (p) => (p === 0 ? 0 : -1))).dist; const SEAM = 0.13;
  const blend = (p: V3, names: string[]) => { const cand: [number, number][] = [];
    for (const nm of names) { const b = IDX(nm); const d = segDist(p, seg[b].a, seg[b].b); if (reach[nm] && d > reach[nm]) continue; if (/^(leg|foot)_/.test(nm) && p[1] > 0.17) continue; cand.push([b, d]); }
    cand.sort((x, y) => x[1] - y[1]); const m = new Map<number, number>(); let s = 0; for (const [b, d] of cand.slice(0, 3)) { const v = 1 / Math.pow(d + 0.01, 4); m.set(b, v); s += v; } for (const [b, v] of m) m.set(b, v / s); return m; };
  let W: Map<number, number>[] = [];
  for (let i = 0; i < w.m; i++) { const p: V3 = [w.pos[i * 3], w.pos[i * 3 + 1], w.pos[i * 3 + 2]]; const part = PARTS[parts[i]];
    if (part === 'body') { W.push(blend(p, PART_BONES.body)); continue; }
    const f = smooth(0, SEAM, fromBody[i]); const own = blend(p, PART_BONES[part].filter((n) => n !== 'head' && n !== 'hips')); const near = blend(p, ['hips', 'chest', 'head']); const m = new Map<number, number>();
    for (const [b, v] of own) m.set(b, (m.get(b) ?? 0) + f * v); for (const [b, v] of near) m.set(b, (m.get(b) ?? 0) + (1 - f) * v); W.push(m); }
  for (let r = 0; r < 4; r++) { const next: Map<number, number>[] = [];
    for (let i = 0; i < w.m; i++) { const m = new Map<number, number>(); for (const [b, v] of W[i]) m.set(b, 0.5 * v); const k = w.nb[i].length || 1;
      for (const j of w.nb[i]) for (const [b, v] of W[j]) m.set(b, (m.get(b) ?? 0) + (0.5 * v) / k); next.push(m); }
    W = next; }
  const n = w.id.length; const joints = new Uint8Array(n * 4); const weights = new Float32Array(n * 4); const vparts = new Uint8Array(n); const hips = IDX('hips');
  const fin = W.map((m) => { const top = [...m].filter(([, v]) => Number.isFinite(v) && v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4); const s = top.reduce((a, [, v]) => a + v, 0);
    return s > 1e-9 ? top.map(([b, v]) => [b, v / s] as [number, number]) : [[hips, 1] as [number, number]]; });
  for (let v = 0; v < n; v++) { const f = fin[w.id[v]]; vparts[v] = parts[w.id[v]]; for (let k = 0; k < 4; k++) { joints[v * 4 + k] = f[k]?.[0] ?? 0; weights[v * 4 + k] = f[k]?.[1] ?? 0; } }
  return { joints, weights, parts: vparts };
}

// ---------- the moves ----------
/** one bone's pose: a turn (Euler XYZ, radians), a move of its position (unit frame) and a scale */
export interface BonePose { r?: V3; p?: V3; s?: V3 }
export type MossPoseFrame = Partial<Record<string, BonePose>>;
export interface MossClip { name: string; dur: number; sample(t: number): MossPoseFrame }
/** the Hop clip: three hops of HOP_SECONDS each */ export const HOP_SECONDS = 0.6; export const HOPS_PER_CLIP = 3;
const hopShape = (p: number) => { /* p = 0…1 through one hop */ const a0 = 0.16, a1 = 0.8; const k = (p - a0) / (a1 - a0); const air = k > 0 && k < 1;
  const crouch = p < a0 ? Math.sin((Math.PI * p) / a0) : 0; const land = p >= a1 ? Math.sin((Math.PI * (p - a1)) / (1 - a1)) : 0;
  return { lift: air ? 0.26 * 4 * k * (1 - k) : 0, vel: air ? 0.26 * 4 * (1 - 2 * k) : 0, crouch, land, stretch: air ? Math.sin(Math.PI * k) * (k < 0.5 ? 1 : 0.45) : 0, k: air ? k : p < a0 ? 0 : 1 }; };
const ears = (f: MossPoseFrame, back: [number, number, number], out: [number, number, number], twist = 0) => {
  for (let k = 0; k < 3; k++) { f[`ear_l_${k + 1}`] = { r: [back[k], twist, out[k]] }; f[`ear_r_${k + 1}`] = { r: [back[k], -twist, -out[k]] }; } };
export const MOSS_CLIPS: MossClip[] = [
  { name: 'Idle', dur: 4, sample(t) { const f: MossPoseFrame = {};
    const breathe = Math.sin((t / 4) * TAU * 2); f.chest = { s: [1 + 0.012 * breathe, 1 + 0.025 * breathe, 1 + 0.012 * breathe] };
    const look = 0.38 * (smooth(0.8, 1.3, t) - smooth(1.7, 2.3, t)) - 0.32 * (smooth(2.4, 2.9, t) - smooth(3.3, 3.8, t)); f.head = { r: [0.05 * Math.sin((t / 4) * TAU), look, 0.06 * look] };
    const tw = (c: number) => Math.exp(-Math.pow((t - c) / 0.06, 2)); /* a quick twitch */
    f.ear_l_1 = { r: [0.02 * breathe - 0.25 * tw(0.6), 0, 0.03 + 0.18 * tw(0.6)] }; f.ear_r_1 = { r: [0.02 * breathe - 0.25 * tw(3.1), 0, -0.03 - 0.18 * tw(3.1)] };
    f.ear_l_2 = { r: [0.03 * breathe + 0.12 * tw(0.68), 0, 0.04 * breathe] }; f.ear_r_2 = { r: [0.03 * breathe + 0.12 * tw(3.18), 0, -0.04 * breathe] };
    const sway = Math.sin((t / 4) * TAU); f.tail_1 = { r: [0, 0.08 * sway, 0] }; f.tail_3 = { r: [0.04 * Math.sin((t / 4) * TAU * 2), 0.05 * sway, 0] }; f.lantern = { r: [0.08 * Math.sin((t / 4) * TAU * 2 + 1), 0, 0.06 * sway] };
    return f; } },
  { name: 'Walk', dur: 1, sample(t) { const f: MossPoseFrame = {}; const ph = (t / 1) * TAU; const s = Math.sin(ph), c = Math.cos(ph);
    const roll = 0.11 * s; f.root = { p: [0, 0.018 * Math.abs(c), 0], r: [0.04, 0.07 * s, roll] }; f.head = { r: [0.03 * Math.abs(c), -0.05 * s, -roll * 0.6] };
    f.leg_l = { r: [-0.55 * Math.max(0, c) + 0.2 * Math.max(0, -c), 0, 0] }; f.leg_r = { r: [-0.55 * Math.max(0, -c) + 0.2 * Math.max(0, c), 0, 0] };
    f.arm_l = { r: [0.3 * c, 0, 0.05] }; f.arm_r = { r: [-0.3 * c, 0, -0.05] };
    const lag = Math.sin(ph - 0.7); ears(f, [0.08 * Math.abs(c), 0.1 * Math.abs(Math.cos(ph - 0.5)), 0.12 * Math.abs(Math.cos(ph - 0.9))], [-0.12 * lag + 0.04, -0.14 * Math.sin(ph - 1.1), -0.16 * Math.sin(ph - 1.5)]);
    f.tail_1 = { r: [0, 0.16 * Math.sin(ph - 0.6), 0] }; f.tail_3 = { r: [0, 0.12 * Math.sin(ph - 1.1), 0] }; f.lantern = { r: [0.12 * Math.sin(2 * ph - 1), 0, 0.14 * Math.sin(ph - 1.7)] };
    return f; } },
  { name: 'Hop', dur: HOP_SECONDS * HOPS_PER_CLIP, sample(t) { const f: MossPoseFrame = {}; const p = fract(t / HOP_SECONDS); const H = hopShape(p);
    const sy = 1 - 0.16 * H.crouch - 0.2 * H.land + 0.13 * H.stretch; const sx = 1 / Math.sqrt(sy);
    f.root = { p: [0, H.lift, 0], s: [sx, sy, sx], r: [0.14 * H.stretch * (H.k < 0.5 ? 1 : -0.6), 0, 0] };
    /* the ears and the tail follow a beat behind: each link of the chain lags a little more */
    const lagged = (d: number) => { const q = hopShape(fract(p - d)); return { up: q.vel / 1.04, land: q.land, air: q.stretch }; };
    const e = [lagged(0.08), lagged(0.13), lagged(0.18)]; ears(f, [0.35 * e[0].up, 0.3 * e[1].up, 0.28 * e[2].up], [0.12 * e[0].air + 0.3 * e[0].land, 0.15 * e[1].air + 0.35 * e[1].land, 0.18 * e[2].air + 0.4 * e[2].land]);
    const tl = [lagged(0.1), lagged(0.16), lagged(0.22)]; f.tail_2 = { r: [-0.18 * tl[0].up, 0, 0] }; f.tail_3 = { r: [-0.16 * tl[1].up, 0, 0] }; f.tail_4 = { r: [-0.14 * tl[2].up, 0, 0] };
    f.lantern = { r: [0.38 * Math.sin(TAU * (p - 0.3)), 0, 0.1 * Math.sin(TAU * (p - 0.45))] };
    f.leg_l = f.leg_r = { r: [-0.5 * H.stretch, 0, 0] }; f.foot_l = f.foot_r = { r: [0.4 * H.stretch, 0, 0] }; f.arm_l = { r: [-0.4 * H.stretch, 0, 0.12 * H.stretch] }; f.arm_r = { r: [-0.4 * H.stretch, 0, -0.12 * H.stretch] };
    f.head = { r: [0.12 * H.land - 0.06 * H.stretch, 0, 0] }; f.chest = { s: [1 + 0.03 * H.land, 1 - 0.04 * H.land, 1 + 0.03 * H.land] };
    return f; } },
  { name: 'Wave', dur: 2, sample(t) { const f: MossPoseFrame = {}; const up = smooth(0, 0.35, t) * (1 - smooth(1.65, 2, t)); const wv = Math.sin(t * TAU * 2.2) * up;
    f.arm_r = { r: [-0.35 * up, 0, -0.55 * up] }; f.paw_r = { r: [0, 0, -0.25 * wv] };
    /* the right ear lifts and waves too (his arms are short: the ear does most of the hello) */
    f.ear_r_1 = { r: [-0.06 * up, 0, -0.22 * up] }; f.ear_r_2 = { r: [-0.15 * up, 0, -0.7 * up - 0.22 * wv] }; f.ear_r_3 = { r: [0, 0, -0.35 * up - 0.4 * Math.sin(t * TAU * 2.2 - 0.6) * up] };
    f.ear_l_1 = { r: [0.04 * up, 0, 0.12 * up] }; f.head = { r: [0.06 * up, -0.15 * up, 0.18 * up] }; f.chest = { r: [0, 0, 0.06 * wv] };
    f.root = { p: [0, 0.015 * Math.abs(Math.sin(t * Math.PI * 2.2)) * up, 0], r: [0, 0, 0.05 * up] }; f.tail_1 = { r: [0, 0.18 * Math.sin(t * TAU * 1.1) * up, 0] };
    return f; } },
  { name: 'Dance', dur: 2, sample(t) { const f: MossPoseFrame = {}; const beat = t * TAU * 2; /* 120 bpm: a bounce every half second */
    const bounce = Math.abs(Math.sin(beat / 2)); const sway = Math.sin(t * Math.PI * 2 / 2 * 2); const sy = 1 - 0.07 * (1 - bounce);
    f.root = { p: [0.02 * sway, 0.05 * bounce, 0], s: [1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy)], r: [0, 0.35 * Math.sin(t * Math.PI), 0.16 * sway] };
    f.head = { r: [0.1 * Math.sin(beat), 0, -0.12 * sway] }; f.chest = { r: [0, 0, -0.08 * sway] };
    const alt = Math.sin(t * TAU); f.arm_l = { r: [-0.5 * Math.max(0, alt), 0, 0.25 * Math.max(0, alt)] }; f.arm_r = { r: [-0.5 * Math.max(0, -alt), 0, -0.25 * Math.max(0, -alt)] };
    f.ear_l_1 = { r: [0, 0, 0.12 * Math.max(0, sway) + 0.04] }; f.ear_r_1 = { r: [0, 0, -0.12 * Math.max(0, -sway) - 0.04] };
    f.ear_l_2 = { r: [0.12 * Math.sin(beat - 0.6), 0, 0.35 * Math.sin(t * TAU - 0.8) + 0.12] }; f.ear_r_2 = { r: [0.12 * Math.sin(beat - 0.6), 0, 0.35 * Math.sin(t * TAU - 0.8) - 0.12] };
    f.ear_l_3 = { r: [0, 0, 0.25 * Math.sin(t * TAU - 1.3)] }; f.ear_r_3 = { r: [0, 0, 0.25 * Math.sin(t * TAU - 1.3)] };
    f.leg_l = { r: [-0.35 * Math.max(0, Math.sin(beat / 2)), 0, 0] }; f.leg_r = { r: [-0.35 * Math.max(0, -Math.sin(beat / 2)), 0, 0] };
    f.tail_1 = { r: [0, 0.3 * Math.sin(t * TAU), 0] }; f.tail_3 = { r: [0, 0.2 * Math.sin(t * TAU - 0.7), 0] }; f.lantern = { r: [0.25 * Math.sin(beat - 1), 0, 0.2 * Math.sin(t * TAU - 1.4)] };
    return f; } },
  { name: 'Lantern', dur: 3, sample(t) { const f: MossPoseFrame = {}; const lift = smooth(0, 0.8, t) * (1 - smooth(2.2, 3, t)); const sw = Math.sin((t - 0.4) * TAU * 0.9) * lift;
    /* the tail curls forward and up, holding the lantern out over his head; the lantern swings on its stem; he looks up at it */
    f.tail_1 = { r: [0, -0.15 * lift, 0] }; f.tail_2 = { r: [0.38 * lift, 0, 0] }; f.tail_3 = { r: [-0.08 * lift, 0, 0] }; f.tail_4 = { r: [0.12 * lift + 0.05 * sw, 0.08 * sw, 0] };
    f.lantern = { r: [-0.25 * lift + 0.35 * sw, 0, 0.22 * Math.sin((t - 0.2) * TAU * 0.9) * lift] };
    f.head = { r: [-0.28 * lift, 0.32 * lift, 0.08 * lift] }; f.chest = { r: [-0.05 * lift, 0.08 * lift, 0] };
    f.arm_l = { r: [-0.45 * lift, 0, 0.2 * lift] }; f.arm_r = { r: [-0.25 * lift, 0, -0.1 * lift] };
    ears(f, [0.18 * lift, 0.1 * lift, 0.08 * lift], [0.05 * lift + 0.04 * sw, 0.06 * sw, 0.08 * sw]);
    return f; } },
];
export const mossClip = (name: string) => MOSS_CLIPS.find((c) => c.name === name) ?? null;
/** The lantern's glow at this moment of the Hop clip: a soft base and a pulse that flares on each landing and fades over a fifth of a hop. */
export function mossGlow(hopTime: number | null): number {
  if (hopTime == null || !Number.isFinite(hopTime)) return 0.35; const p = fract(hopTime / HOP_SECONDS); const since = fract(p - 0.8); /* landings at p = 0.8 */
  return 0.35 + 0.9 * Math.exp(-since / 0.07) * (since < 0.6 ? 1 : 0);
}
/** Bone local transforms for one frame: rest offsets (unit frame) scaled to metres by H, plus the move. */
export function boneLocals(frame: MossPoseFrame, J: MossJoints, H: number): { t: V3; q: Q4; s: V3 }[] {
  return MOSS_BONES.map(([n, p]) => { const rest = J[n]; const par = p >= 0 ? J[MOSS_BONES[p][0]] : ([0, 0, 0] as V3); const bp = frame[n] ?? {}; const off = bp.p ?? [0, 0, 0];
    const base: V3 = p >= 0 ? sub(rest, par) : rest; const r = bp.r ?? [0, 0, 0];
    return { t: [(base[0] + off[0]) * H, (base[1] + off[1]) * H, (base[2] + off[2]) * H], q: quatXYZ(r[0], r[1], r[2]), s: bp.s ?? [1, 1, 1] }; });
}

// ---------- checking the skin ----------
type M4 = number[];
const compose = (t: V3, q: Q4, s: V3): M4 => { const [x, y, z, w] = q; const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0, (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1]; };
const mul = (a: M4, b: M4): M4 => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
/** Each bone's skinning matrix for one frame (its world matrix times the inverse of its rest place), H = 1. */
export function skinMatrices(frame: MossPoseFrame, J: MossJoints): M4[] {
  const L = boneLocals(frame, J, 1); const world: M4[] = [];
  MOSS_BONES.forEach(([n, p], i) => { const m = compose(L[i].t, L[i].q, L[i].s); world.push(p >= 0 ? mul(world[p], m) : m); void n; });
  return world.map((m, i) => { const r = J[MOSS_BONES[i][0]]; return mul(m, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -r[0], -r[1], -r[2], 1]); });
}
/** The mesh posed by a frame (linear blend skinning, as three.js does). */
export function posePoints(points: Float32Array, skin: MossSkin, J: MossJoints, frame: MossPoseFrame): Float32Array {
  const S = skinMatrices(frame, J); const n = points.length / 3; const out = new Float32Array(points.length);
  for (let v = 0; v < n; v++) { const x = points[v * 3], y = points[v * 3 + 1], z = points[v * 3 + 2]; let ox = 0, oy = 0, oz = 0;
    for (let k = 0; k < 4; k++) { const w = skin.weights[v * 4 + k]; if (!w) continue; const m = S[skin.joints[v * 4 + k]]; ox += w * (m[0] * x + m[4] * y + m[8] * z + m[12]); oy += w * (m[1] * x + m[5] * y + m[9] * z + m[13]); oz += w * (m[2] * x + m[6] * y + m[10] * z + m[14]); }
    out[v * 3] = ox; out[v * 3 + 1] = oy; out[v * 3 + 2] = oz; }
  return out;
}
/** The worst edge in a pose: how much longer it got than at rest, in units of his height (a tear shows as a long edge where none was). */
export function maxStretch(points: Float32Array, posed: Float32Array, index: ArrayLike<number>): { grow: number; at: number } {
  let worst = 0, at = -1; const len = (a: Float32Array, i: number, j: number) => Math.hypot(a[i * 3] - a[j * 3], a[i * 3 + 1] - a[j * 3 + 1], a[i * 3 + 2] - a[j * 3 + 2]);
  for (let t = 0; t + 2 < index.length; t += 3) for (const [i, j] of [[index[t], index[t + 1]], [index[t + 1], index[t + 2]], [index[t + 2], index[t]]]) {
    const g = len(posed, i, j) - len(points, i, j); if (g > worst) { worst = g; at = i; } }
  return { grow: worst, at };
}
