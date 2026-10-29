/**
 * Rig as a character (2026-10-27): the human skeleton and how it is fitted to a model. Pure three.js maths (no DOM, no loaders), so the sheet,
 * the worker and the tests share it.
 *  - HUMAN_BONES: Mesh2Motion's human rig (CC0; web/public/models/rig/human.glb, made by scripts/assets/build-rig-human.mjs): every bone's
 *    name, parent and rest pose, the fingers folded into one hand bone with a tip. Bone order = this table = the skin's joint order.
 *  - fitHuman(points): where each joint goes inside a model that stands like a person (feet on y = 0, facing +z, scaled to the template's
 *    height): the template scaled to the model, then the spine, legs and arms moved onto the mesh's own cross-sections. It reports what it
 *    could not find (no gap between the legs, no arms) and how well the joints sit inside the mesh, in plain words for the sheet.
 *  - skeletonFrom(joints): the bones for those joints. Each bone keeps the template's twist and turns only as far as it must to point at its
 *    child's joint, so the moves (authored on the template, absolute rotations) play on the model exactly as on the template: the bind pose
 *    is the model as it stands, a T-pose model lowers its arms when it walks.
 */
import { Bone, Matrix4, Quaternion, Vector3 } from 'three';
import { personShaped } from '../../../../server/src/shared/previzRig';

type V3 = [number, number, number];
/** [name, parent index (−1 = none), local position, local rotation (x, y, z, w)], from human.glb, parents before children */
export const HUMAN_BONES: [string, number, V3, [number, number, number, number]][] = [["root",-1,[0,0,0],[-0.70711,0,0,0.70711]],["pelvis",0,[0,0.0501,0.9167],[0.79047,0,0,0.6125]],["spine_01",1,[0,0.10397,0],[-0.0647,0,0,0.9979]],["spine_02",2,[0,0.12403,0],[-0.07728,0,0,0.99701]],["spine_03",3,[0,0.14127,0],[-0.09332,0,0,0.99564]],["neck_01",4,[0,0.1748,0],[0.34964,0,0,0.93689]],["head",5,[0,0.13206,0],[-0.20303,0,0,0.97917]],["head_leaf",6,[0,0.06981,0],[-0.04707,0,0,0.99889]],["clavicle_l",4,[0.0188,0.12313,0.10554],[-0.53081,-0.28815,-0.31465,0.73226]],["upperarm_l",8,[0,0.20208,0],[0.1921,0.66052,-0.26788,0.67458]],["lowerarm_l",9,[0,0.29659,0],[0.02164,0.00029,-0.00674,0.99974]],["hand_l",10,[0,0.27979,0],[-0.0084,-0.00006,0.0094,0.99992]],["hand_leaf_l",11,[0.00138,0.21303,0.0306],[0,0,0,1]],["clavicle_r",4,[-0.0188,0.12313,0.10554],[-0.53081,0.28815,0.31465,0.73226]],["upperarm_r",13,[0,0.20208,0],[0.1921,-0.66052,0.26788,0.67458]],["lowerarm_r",14,[0,0.29659,0],[0.02164,-0.00029,0.00674,0.99974]],["hand_r",15,[0,0.27979,0],[-0.0084,0.00006,-0.0094,0.99992]],["hand_leaf_r",16,[-0.00138,0.21303,0.0306],[0,0,0,1]],["thigh_l",1,[0.089,0.02777,0.04602],[0.98905,0,0,0.14761]],["calf_l",18,[0,0.40663,0],[0.10003,-0.00013,-0.00001,0.99498]],["foot_l",19,[0,0.43319,0],[-0.58651,0.00053,-0.00023,0.80994]],["ball_l",20,[0,0.18141,0],[0.00011,0.97674,-0.21441,0.00051]],["ball_leaf_l",21,[0,0.08629,0],[0.0275,0,0,0.99962]],["thigh_r",1,[-0.089,0.02777,0.04602],[0.98905,0,0,0.14761]],["calf_r",23,[0,0.40663,0],[0.10003,0.00013,0.00001,0.99498]],["foot_r",24,[0,0.43319,0],[-0.58651,-0.00053,0.00023,0.80994]],["ball_r",25,[0,0.18141,0],[0.00011,-0.97674,0.21441,0.00051]],["ball_leaf_r",26,[0,0.08629,0],[0.0275,0,0,0.99962]]];
export const BONE_NAMES = HUMAN_BONES.map((b) => b[0]);
/** the bone whose position the moves animate (the hips' bob, the jump) */
export const POSITION_BONE = 'pelvis';
/** the joints you can nudge: every bone but the root */
export const JOINTS = BONE_NAMES.filter((n) => n !== 'root');
export type Joints = Record<string, V3>;
const firstChild = HUMAN_BONES.map((_, i) => HUMAN_BONES.findIndex((b) => b[1] === i));

/** The template's world matrices (the rest pose), computed once. */
const TEMPLATE = (() => {
  const world: Matrix4[] = []; const local = new Matrix4();
  for (const [, p, t, q] of HUMAN_BONES) { local.compose(new Vector3(...t), new Quaternion(...q), new Vector3(1, 1, 1)); world.push(p < 0 ? local.clone() : world[p].clone().multiply(local)); }
  const pos = world.map((m) => new Vector3().setFromMatrixPosition(m)); const rot = world.map((m) => new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(m)));
  return { pos, rot };
})();
/** The template's joints in its own space (metres, feet on y = 0, facing +z). */
export const templateJoints = (): Joints => Object.fromEntries(HUMAN_BONES.map(([n], i) => [n, TEMPLATE.pos[i].toArray() as V3]));
const T = (n: string) => TEMPLATE.pos[BONE_NAMES.indexOf(n)];
/** The template's height: the top of the head (head_leaf sits at the crown). */
export const TEMPLATE_HEIGHT = Math.round(T('head_leaf').y * 1000) / 1000;
/** how high the hips are on the template (the moves' pelvis position is scaled by fitted ÷ this) */
export const TEMPLATE_PELVIS_Y = T('pelvis').y;

// ---------- the bones for a set of joints ----------
/**
 * Bones (in table order, joined into one hierarchy under the root) for joints in rig space. Each bone keeps the template's twist and turns
 * only as far as needed to point at its first child's joint; a tip keeps its template rotation against its parent.
 */
export function skeletonFrom(joints: Joints): { root: Bone; bones: Bone[] } {
  const bones: Bone[] = []; const worldRot: Quaternion[] = []; const worldMat: Matrix4[] = [];
  const at = (i: number) => { const n = HUMAN_BONES[i][0]; const j = joints[n]; return j ? new Vector3(...j) : TEMPLATE.pos[i].clone(); };
  HUMAN_BONES.forEach(([name, p, t, q], i) => {
    const b = new Bone(); b.name = name; bones.push(b);
    if (p < 0) { b.position.set(...t); b.quaternion.set(...q); b.updateMatrix(); worldMat.push(b.matrix.clone()); worldRot.push(b.quaternion.clone()); return; }
    bones[p].add(b);
    const P = at(i); const c = firstChild[i]; let wr: Quaternion;
    if (c >= 0) { const from = TEMPLATE.pos[c].clone().sub(TEMPLATE.pos[i]).normalize(); const to = at(c).sub(P);
      wr = to.lengthSq() > 1e-12 ? new Quaternion().setFromUnitVectors(from, to.normalize()).multiply(TEMPLATE.rot[i]) : TEMPLATE.rot[i].clone(); }
    else wr = worldRot[p].clone().multiply(new Quaternion(...q));
    const inv = worldMat[p].clone().invert(); b.position.copy(P.clone().applyMatrix4(inv)); b.quaternion.copy(worldRot[p].clone().invert().multiply(wr)).normalize();
    b.updateMatrix(); worldMat.push(worldMat[p].clone().multiply(b.matrix)); worldRot.push(wr);
  });
  bones[0].updateMatrixWorld(true);
  return { root: bones[0], bones };
}
/** Mirror a joint across the middle (x → −x); the other side's name, or null for a middle joint. */
export const mirrorOf = (n: string) => (/_l$/.test(n) ? n.replace(/_l$/, '_r') : /_r$/.test(n) ? n.replace(/_r$/, '_l') : null);

// ---------- fitting ----------
export interface FitReport { /** 0…1: how many key joints sit inside the mesh */ score: number; legs: boolean; /** shaped like a person (previzRig.ts personShaped): only then is Person rigging offered */ person: boolean; arms: 'found' | 'guessed'; /** plain words for the sheet, empty when it fits well */ problems: string[]; pose: 'T' | 'A' | 'down' | 'unknown' }
/**
 * Where the joints go in a model that stands like a person. points = the mesh's vertices in rig space (x, y, z, …; feet on y = 0, facing +z,
 * as tall as TEMPLATE_HEIGHT, centred on x = z = 0); index = its triangles (null: every three points are one). Deterministic: the same
 * points give the same joints.
 */
export function fitHuman(points: Float32Array, index: ArrayLike<number> | null = null): { joints: Joints; report: FitReport } {
  const H = TEMPLATE_HEIGHT; const n = Math.floor(points.length / 3);
  /* a fixed subsample keeps the fit quick on big meshes (every k-th vertex) */
  const k = Math.max(1, Math.floor(n / 60000)); const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  for (let i = 0; i < n; i += k) { xs.push(points[i * 3]); ys.push(points[i * 3 + 1]); zs.push(points[i * 3 + 2]); }
  const m = xs.length; const joints = templateJoints(); const problems: string[] = [];
  /** vertices in a slab of heights (optionally a range of x): their x and z extents' middle, and the x extent */
  const slab = (y: number, h: number, x0 = -Infinity, x1 = Infinity) => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity, cnt = 0;
    for (let i = 0; i < m; i++) { if (Math.abs(ys[i] - y) > h || xs[i] < x0 || xs[i] > x1) continue; cnt++; if (xs[i] < a) a = xs[i]; if (xs[i] > b) b = xs[i]; if (zs[i] < c) c = zs[i]; if (zs[i] > d) d = zs[i]; }
    return cnt ? { x: (a + b) / 2, z: (c + d) / 2, w: b - a, x0: a, x1: b, cnt } : null; };
  /* 1 · the legs: the crotch is the lowest height where a triangle crosses the body's middle line again (below it, the legs stand apart).
     Triangles, not vertices, so a low-poly body with no vertex on the middle line still counts as covered. */
  const tCrotch = T('thigh_l').y - 0.07; const BIN = 0.005 * H; const bins = Math.ceil(H / BIN) + 1; const covered = new Uint8Array(bins);
  const tri = index ? Math.floor(index.length / 3) : Math.floor(n / 3); const vi = (t: number, c: number) => (index ? index[t * 3 + c] : t * 3 + c);
  for (let t = 0; t < tri; t++) { const a = vi(t, 0), b = vi(t, 1), c = vi(t, 2); const xa = points[a * 3], xb = points[b * 3], xc = points[c * 3];
    if (Math.min(xa, xb, xc) > 0 || Math.max(xa, xb, xc) < 0) continue; const ya = points[a * 3 + 1], yb = points[b * 3 + 1], yc = points[c * 3 + 1];
    const lo = Math.max(0, Math.floor(Math.min(ya, yb, yc) / BIN)), hi = Math.min(bins - 1, Math.floor(Math.max(ya, yb, yc) / BIN)); for (let i = lo; i <= hi; i++) covered[i] = 1; }
  let crotch = -1; const start = Math.floor(0.1 * H / BIN);
  for (let i = start; i < Math.floor(0.7 * H / BIN); i++) if (covered[i]) { const y = i * BIN; if (y > 0.25 * H && !covered.slice(start, i).some(Boolean)) crotch = y; break; }
  const legs = crotch > 0; if (!legs) { crotch = tCrotch; problems.push('No gap between the legs: the leg bones use a standard person’s proportions.'); }
  const legK = crotch / tCrotch; const bodyK = (H - crotch) / (H - tCrotch);
  /* heights: below the crotch scaled by the leg length, above it by the body length */
  for (const j of JOINTS) { const y = joints[j][1]; joints[j][1] = y <= tCrotch ? y * legK : crotch + (y - tCrotch) * bodyK; }
  /* 2 · the spine down the middle of the body (the middle of its front and back, left and right), using only the central part */
  const hips = slab(joints.pelvis[1], 0.03 * H); const halfW = hips ? Math.max(0.06 * H, Math.min(0.2 * H, hips.w / 2)) : 0.1 * H;
  for (const j of ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head']) { const s = slab(joints[j][1], 0.02 * H, -halfW * 0.8, halfW * 0.8); if (s) { joints[j][0] = s.x; joints[j][2] = s.z; } }
  joints.head_leaf[0] = joints.head[0]; joints.head_leaf[2] = joints.head[2];
  { let top = -Infinity; for (let i = 0; i < m; i++) if (ys[i] > top) top = ys[i]; joints.head_leaf[1] = Math.max(joints.head[1] + 0.02 * H, top - 0.01 * H); }
  /* 3 · each leg: its own middle at the hip, knee and ankle heights */
  for (const side of ['l', 'r'] as const) { const sg = side === 'l' ? 1 : -1; const cx = joints.pelvis[0];
    const range = (sg > 0 ? [cx + 0.004 * H, Infinity] : [-Infinity, cx - 0.004 * H]) as [number, number];
    for (const j of [`thigh_${side}`, `calf_${side}`, `foot_${side}`]) { const yy = j.startsWith('thigh') ? Math.min(joints[j][1], crotch - 0.02 * H) : joints[j][1];
      const s = slab(yy, 0.015 * H, range[0], range[1]); if (s && legs) { joints[j][0] = s.x; joints[j][2] = j.startsWith('foot') ? joints[j][2] + (s.z - joints[j][2]) * 0.5 : s.z; } }
    /* the toes go forward from the ankle along the template's line, the ball on the ground */
    const f = joints[`foot_${side}`]; const tf = T(`foot_${side}`), tb = T(`ball_${side}`), tl = T(`ball_leaf_${side}`);
    joints[`ball_${side}`] = [f[0] + (tb.x - tf.x) * legK, Math.max(0.01 * H, tb.y * legK), f[2] + (tb.z - tf.z) * legK];
    joints[`ball_leaf_${side}`] = [f[0] + (tl.x - tf.x) * legK, Math.max(0.01 * H, tl.y * legK), f[2] + (tl.z - tf.z) * legK]; }
  /* 4 · the arms: the farthest point of each arm from its shoulder is the fingertip; the wrist and elbow go along the line, then into the arm */
  let arms: 'found' | 'guessed' = 'found'; let pose: FitReport['pose'] = 'unknown';
  const chest = slab(joints.spine_02[1], 0.02 * H, -halfW * 1.1, halfW * 1.1);
  for (const side of ['l', 'r'] as const) { const sg = side === 'l' ? 1 : -1;
    const sh = new Vector3(...joints[`upperarm_${side}`]); const cl = joints[`clavicle_${side}`];
    if (chest) { const edge = sg > 0 ? chest.x1 : chest.x0; const tx = Math.abs(T(`upperarm_${side}`).x); const want = joints.spine_03[0] + sg * Math.min(1.3 * tx, Math.max(0.75 * tx, Math.abs(edge - joints.spine_03[0]) * 0.82)); const dx = want - sh.x; sh.x = want; cl[0] += dx * 0.4; }
    joints[`upperarm_${side}`] = sh.toArray() as V3;
    const out = Math.abs(sh.x - joints.spine_03[0]); let best = -1, bd = 0;
    for (let i = 0; i < m; i++) { const dx = (xs[i] - joints.spine_03[0]) * sg; if (dx < out * 0.9 || ys[i] < crotch + 0.04 * H) continue;
      const d = (xs[i] - sh.x) ** 2 + (ys[i] - sh.y) ** 2 + (zs[i] - sh.z) ** 2; if (d > bd) { bd = d; best = i; } }
    const reach = Math.sqrt(bd); const tReach = T(`hand_leaf_${side}`).distanceTo(T(`upperarm_${side}`));
    if (best < 0 || reach < 0.45 * tReach || reach > 1.6 * tReach) { arms = 'guessed'; continue; }
    const tip = new Vector3(xs[best], ys[best], zs[best]); const dir = tip.clone().sub(sh);
    const la = T(`lowerarm_${side}`).distanceTo(T(`upperarm_${side}`)), lb = T(`hand_${side}`).distanceTo(T(`lowerarm_${side}`)), lc = T(`hand_leaf_${side}`).distanceTo(T(`hand_${side}`));
    const wrist = sh.clone().addScaledVector(dir, (la + lb) / (la + lb + lc)); const elbow = sh.clone().addScaledVector(dir, la / (la + lb + lc));
    /* into the arm: the middle of the vertices around each point, across the arm */
    const u = dir.clone().normalize(); const r = 0.07 * H;
    const centre = (p: Vector3) => { const s = new Vector3(); let c = 0; for (let i = 0; i < m; i++) { const vx = xs[i] - p.x, vy = ys[i] - p.y, vz = zs[i] - p.z; const along = vx * u.x + vy * u.y + vz * u.z;
      if (Math.abs(along) > 0.012 * H) continue; const across = vx * vx + vy * vy + vz * vz - along * along; if (across > r * r) continue; s.x += xs[i]; s.y += ys[i]; s.z += zs[i]; c++; } return c >= 3 ? s.divideScalar(c) : p; };
    joints[`lowerarm_${side}`] = centre(elbow).toArray() as V3; joints[`hand_${side}`] = centre(wrist).toArray() as V3; joints[`hand_leaf_${side}`] = tip.toArray() as V3;
    const drop = -u.y; pose = drop > 0.82 ? 'down' : drop > 0.35 ? 'A' : 'T'; }
  if (arms === 'guessed') problems.push('Its arms weren’t found: the arm bones sit where a person’s would. Drag them into the arms.');
  /* 5 · how well it fits: key joints with mesh close by */
  const key = ['head', 'spine_02', 'pelvis', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r'];
  const near = (p: V3) => { const r2 = (0.06 * H) ** 2; for (let i = 0; i < m; i++) if ((xs[i] - p[0]) ** 2 + (ys[i] - p[1]) ** 2 + (zs[i] - p[2]) ** 2 < r2) return true; return false; };
  const score = key.filter((j) => near(joints[j])).length / key.length;
  if (score < 0.75) problems.unshift('This model doesn’t stand like a person, so some bones sit outside it. Drag them inside, or it will tear when it moves.');
  for (const j of JOINTS) joints[j] = joints[j].map((x) => Math.round(x * 1e5) / 1e5) as V3;
  const sc = Math.round(score * 100) / 100;
  return { joints, report: { score: sc, legs, arms, problems, pose, person: personShaped({ score: sc, legs }) } };
}
