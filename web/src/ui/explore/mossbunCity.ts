/**
 * Explore's live city, with Mossbun living in it (2026-10-27). He spends his day at the junction the city tile films (explore3dLive.tsx CityLive),
 * at the height Direct a Shot gives him in the city (previzModels.ts startHeight: 1.2 m, next to 1.75 m people and real cars).
 * His day is a 48 s loop: two turns of that junction's lights (CityWorld.signalClock), so he always crosses on green. Everything is a pure
 * function of the scene time t (where he is, how he moves, what he looks at, the camera), like the rest of the city: the same t, the same frame.
 * Beats (u = seconds into the light cycle; north–south green while u < 9, so the cars on his road wait):
 *  A  0–0.6 ready at the plaza kerb · 0.6–5.6 hops across on green · 5.6–6.8 a spinning jump on the far side · 6.8–8.8 hops up the pavement ·
 *     8.8–10 says hello to whoever walks by (turns to the nearest person) · 10–12 hops back · 12–24 waits for green again: watches the cars,
 *     and jumps when the first one shoots past (u ≈ 12.8, a bigger jump the closer the car).
 *  B  0–0.6 ready · 0.6–5.6 hops back across · 5.6–7.2 into the plaza · 7.2–12.4 dances (bounce, sway, two spins, ears and tail flopping) ·
 *     12.4–14.8 a car shoots past: he turns to it and jumps · 14.8–18.4 hops a lap of the plaza · 18.4–20.4 back to the kerb · 20.4–24 waits.
 * The camera keeps him the star: a slow orbit at about 6 m that tracks him (his own path, averaged over ±1.2 s), closer while he dances,
 * swinging round to the street side while he is on the far pavement; it never ends up in a wall (CityWorld.occlude / clampCamera).
 * Reuses Direct a Shot's pieces read-only: the GLB loader and normaliser (shared/previz/userModels.ts loadUserModel, one unit tall, feet at 0)
 * and the hop (previzModels.ts modelMotionAt). His ears flop by a small vertex bend on OUR copy of his material (the cached file's own is
 * shared with Direct a Shot and stays untouched).
 * His own rig (2026-10-27, shared/rig/mossbunRig.ts): the city plays his rigged file (char-mossbun-rig.glb) when it loads. Each beat picks his
 * moves (MossPose.anim: Hop on the distance he has hopped, Idle, Wave for hello, Dance, Lantern while he waits, the Hop's crouch and landing
 * for jumps), every clip's time a pure function of t; the hop's lift and squash then come from the clip, the jumps' height stays ours. His
 * lantern glows on each landing. If the rigged file can't load, loadUserModel hands back his plain model and the old hop and ear bend run.
 */
import { modelMotionAt, startHeight } from '../../../../server/src/shared/previzModels';
import type { CityWorld } from '../../../../server/src/shared/world/openCity';
import { loadUserModel } from '../../shared/previz/userModels';
import { MOSSBUN_RIG, HOP_SECONDS, HOPS_PER_CLIP, mossGlow } from '../../shared/rig/mossbunRig';

type T3 = typeof import('three'); type V2 = [number, number]; type V3 = [number, number, number];
export const MOSSBUN_GLB = '/showcase/char-mossbun-3d.glb';
/** the loop: two light cycles (one crossing each way) */ export const MOSS_CYCLE = 48; const CYC = 24;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpA = (a: number, b: number, k: number) => a + wrapA(b - a) * k;
/** 1 inside [a, b], easing in and out over `e` seconds */ const win = (x: number, a: number, b: number, e = 0.3) => smooth(a - e, a, x) * (1 - smooth(b, b + e, x));

// ---------- where he goes (metres from the junction's centre; x east, z south; heading 0 = +z, his front) ----------
const SW: V2 = [-6.9, 6.9]; /* the plaza's kerb */ const NW: V2 = [-6.2, -6.4]; /* across the road */ const UP: V2 = [-6.2, -10.5]; /* up the far pavement */
const PLAZA: V2 = [-10.5, 10.5];
interface Path { pts: V2[]; cum: number[]; len: number }
const pathOf = (pts: V2[]): Path => { const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])); return { pts, cum, len: cum[cum.length - 1] }; };
const pointOn = (p: Path, s: number): V2 => { s = Math.max(0, Math.min(p.len, s)); let k = 1; while (k < p.cum.length - 1 && p.cum[k] < s) k++;
  const a = p.pts[k - 1], b = p.pts[k]; const f = (s - p.cum[k - 1]) / (p.cum[k] - p.cum[k - 1] || 1); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
/** heading along the path from a short chord (smooth round the corners) */
const headingOn = (p: Path, s: number) => { const a = pointOn(p, s - 0.5), b = pointOn(p, s + 0.5); return Math.atan2(b[0] - a[0], b[1] - a[1]); };
/* the crossing runs just inside the junction, in front of the stopped cars (they wait 2.8 m back from it) and clear of the through lanes */
const CROSS_N = pathOf([SW, [-4.7, 5.4], [-4.7, -5.4], NW]); const CROSS_S = pathOf([...CROSS_N.pts].reverse());
const TO_UP = pathOf([NW, UP]); const FROM_UP = pathOf([UP, NW]); const TO_PLAZA = pathOf([SW, PLAZA]); const TO_KERB = pathOf([PLAZA, SW]);
const LAP = pathOf(Array.from({ length: 25 }, (_, k) => { const a = (k / 24) * Math.PI * 2; return [PLAZA[0] - 1.7 + Math.cos(a) * 1.7, PLAZA[1] + Math.sin(a) * 1.7] as V2; }));
const face = (from: V2, to: V2) => Math.atan2(to[0] - from[0], to[1] - from[1]);

/** a move along a path over [t0, t1]: speeds up and slows down over the first and last fifth (trapezoid), so he starts and stops on his feet */
function travel(p: Path, t0: number, t1: number, x: number) {
  const dur = t1 - t0, k = clamp01((x - t0) / dur), a = 0.2, vmax = 1 / (1 - a);
  const f = k < a ? (0.5 * vmax * k * k) / a : k < 1 - a ? vmax * (k - a / 2) : 1 - (0.5 * vmax * (1 - k) * (1 - k)) / a;
  const dv = k < a ? (vmax * k) / a : k < 1 - a ? vmax : (vmax * (1 - k)) / a; const s = f * p.len;
  return { at: pointOn(p, s), heading: headingOn(p, s), v: (dv * p.len) / dur, d: s };
}
type Act = { at: V2; heading: number; v: number; d: number; beat: 'stand' | 'hop' | 'jump' | 'dance' | 'hello' | 'watch' | 'ready' };
/** Where he is and what he does at loop time tau (no world needed: the camera reads this too) */
export function mossPlan(tau: number): Act & { u: number; half: 0 | 1 } {
  tau = ((tau % MOSS_CYCLE) + MOSS_CYCLE) % MOSS_CYCLE; const half = tau < CYC ? 0 : 1; const u = tau - half * CYC;
  const still = (at: V2, heading: number, beat: Act['beat']): Act => ({ at, heading, v: 0, d: 0, beat });
  const go = (p: Path, t0: number, t1: number): Act => ({ ...travel(p, t0, t1, u), beat: 'hop' });
  let a: Act;
  if (half === 0) {
    a = u < 0.6 ? still(SW, Math.PI, 'ready') : u < 5.6 ? go(CROSS_N, 0.6, 5.6) : u < 6.8 ? still(NW, Math.PI, 'jump') : u < 8.8 ? go(TO_UP, 6.8, 8.8)
      : u < 10 ? still(UP, face(NW, UP), 'hello') : u < 12 ? go(FROM_UP, 10, 12) : still(NW, 0, 'watch');
  } else {
    a = u < 0.6 ? still(NW, 0, 'ready') : u < 5.6 ? go(CROSS_S, 0.6, 5.6) : u < 7.2 ? go(TO_PLAZA, 5.6, 7.2) : u < 12.4 ? still(PLAZA, -0.9, 'dance')
      : u < 14.8 ? still(PLAZA, face(PLAZA, [0, 0]) + 0.5, 'watch') : u < 18.4 ? go(LAP, 14.8, 18.4) : u < 20.4 ? go(TO_KERB, 18.4, 20.4) : still(SW, Math.PI, 'watch');
  }
  return { ...a, u, half };
}

// ---------- how he moves ----------
export interface MossPose { pos: V3; heading: number; lean: number; pitch: number; sx: number; sy: number; /** the ears' (and tail's) bend: x sideways, z back and forth */ flop: V2;
  /** his own rig: the clips for this moment (name, time in the clip, weight), and his place with only the jumps' lift (the clips hop and squash him) */ anim: { name: string; t: number; w: number }[]; rigPos: V3 }
/** the Hop clip's time for a point in one hop (0…1: crouch to 0.16, air to 0.8, landing to 1) */ const hopAt = (k: number) => clamp01(k) * HOP_SECONDS;
/** a jump's progress (jump(): crouch to 0.28, air to 0.8, land to 1) as a point in one hop of the clip */ const jumpToHop = (k: number) => (k < 0.28 ? (k / 0.28) * 0.16 : k < 0.8 ? 0.16 + ((k - 0.28) / 0.52) * 0.64 : 0.8 + ((k - 0.8) / 0.2) * 0.2);
/** a jump over [t0, t0 + dur]: crouch, up on a parabola (stretched), land (squashed); spin turns once round in the air */
function jump(x: number, t0: number, dur: number, high: number) {
  const k = (x - t0) / dur; if (k <= 0 || k >= 1) return { lift: 0, sy: 1, air: 0 };
  const crouch = smooth(0, 0.2, k) * (1 - smooth(0.2, 0.3, k)), land = smooth(0.78, 0.86, k) * (1 - smooth(0.9, 1, k)); const air = clamp01((k - 0.28) / 0.52);
  return { lift: k > 0.28 && k < 0.8 ? high * 4 * air * (1 - air) : 0, sy: 1 - 0.16 * crouch - 0.14 * land + (k > 0.28 && k < 0.8 ? 0.08 * Math.sin(air * Math.PI) : 0), air: k > 0.28 && k < 0.8 ? air : k >= 0.8 ? 1 : 0 };
}
/** the dance (L = seconds into it, 5.2 s): a bounce on the beat (2 a second), a sway, a spin each way, a little jump to finish */
function dance(L: number) {
  const env = smooth(0, 0.35, L) * (1 - smooth(4.8, 5.2, L)); const beat = L * 2 * Math.PI * 2;
  const bounce = Math.abs(Math.sin(beat / 2)) * env; const sway = Math.sin(L * Math.PI * 2 * 1) * env;
  const s1 = smooth(1.5, 2.4, L), s2 = smooth(3.1, 4.0, L); const spin = (s1 - s2) * Math.PI * 2;
  const j = jump(L, 4.3, 0.9, 0.22);
  return { lift: 0.07 * bounce + j.lift, sy: 1 - 0.08 * (1 - bounce) * env + (j.sy - 1), lean: 0.2 * sway, yaw: spin + 0.25 * Math.sin(L * Math.PI) * env, sway, bounce, spinning: Math.max(s1 * (1 - s1), s2 * (1 - s2)) * 4, env };
}
/** where he looks: the moving cars and the people near him, nearest weighted most (a smooth blend, not a snap from one to the next) */
function lookAt(world: CityWorld, t: number, x: number, z: number, people: boolean): { heading: number; w: number } | null {
  let vx = 0, vz = 0, w = 0;
  for (const c of world.carsAt(t)) { const dx = c.x - x, dz = c.z - z; const d = Math.hypot(dx, dz); if (d > 16 || c.v < 1.5) continue; const k = Math.exp(-d / 4) * Math.min(1, c.v / 4); vx += (dx / d) * k; vz += (dz / d) * k; w += k; }
  if (people) for (const p of world.pedsNear(t, x, z, 5, 0.4, 6)) { const d = Math.max(0.3, p.dist); const k = Math.exp(-d / 2) * 0.8; vx += ((p.x - x) / d) * k; vz += ((p.z - z) / d) * k; w += k; }
  return w > 1e-3 ? { heading: Math.atan2(vx, vz), w: Math.min(1, w * 2.5) } : null;
}
/** the nearest moving car's distance at time t (for how big a fright it gives him) */
const nearestCar = (world: CityWorld, t: number, x: number, z: number) => world.carsAt(t).reduce((m, c) => (c.v > 1.5 ? Math.min(m, Math.hypot(c.x - x, c.z - z)) : m), Infinity);

/**
 * His pose at scene time t: J = the junction (centre, and j its index for the lights), h = his height (metres).
 * Pure: the same t gives the same pose (the cars and people come from CityWorld, themselves pure in t).
 */
export function mossPose(world: CityWorld, j: number, J: { x: number; z: number }, h: number, t: number): MossPose {
  const tau = world.signalClock(j, t); const a = mossPlan(tau); const u = a.u; const x = J.x + a.at[0], z = J.z + a.at[1];
  /* the hop: one every ~1.1 m (fewer, bigger hops than Direct a Shot's default for his size, so a crossing reads as bounds, not a scurry) */
  const mo = modelMotionAt('hop', h, { v: a.v, d: a.d * 0.62, time: tau }, 0);
  let heading = a.heading, lift = mo.lift, sy = mo.sy, lean = mo.lean, pitch = mo.pitch; let flopX = 0, flopZ = 0;
  let rLift = 0; const anim: MossPose['anim'] = []; const hops = (a.d * 0.62) / (0.32 * h + 0.28); /* hops so far on this path */
  const hopK = (((a.d * 0.62) / (0.32 * h + 0.28)) % 1 + 1) % 1; /* where in its hop he is: the ears trail up in the air and flop down on landing */
  if (a.beat === 'hop') { flopZ = -0.5 * Math.sin(hopK * Math.PI * 2) * Math.min(1, a.v / 1.5); const go = smooth(0.08, 0.6, a.v); /* he starts and stops on his feet */ anim.push({ name: 'Hop', t: (((hops % HOPS_PER_CLIP) + HOPS_PER_CLIP) % HOPS_PER_CLIP) * HOP_SECONDS, w: go }); if (go < 1) anim.push({ name: 'Idle', t: tau % 4, w: 1 - go }); }
  const breathe = Math.sin(tau * Math.PI * 2 * 0.45);
  if (a.beat === 'ready') { const k = smooth(0, 0.6, u); sy *= 1 - 0.1 * Math.sin(k * Math.PI); flopZ = 0.3 * Math.sin(k * Math.PI); /* a little crouch: here we go */ anim.push({ name: 'Hop', t: hopAt(0.16 * Math.sin(k * Math.PI) * 0.5), w: 1 }); }
  if (a.beat === 'jump') { const J1 = jump(u, 5.6, 1.2, 0.38 * h); lift += J1.lift; rLift += J1.lift; sy *= J1.sy; heading += Math.PI * 2 * smooth(0, 1, J1.air) + Math.PI * smooth(5.7, 6.6, u); flopZ = -0.8 * Math.sin(J1.air * Math.PI);
    const k = (u - 5.6) / 1.2; anim.push(k > 0 && k < 1 ? { name: 'Hop', t: hopAt(jumpToHop(k)), w: 1 } : { name: 'Idle', t: tau % 4, w: 1 }); }
  if (a.beat === 'dance') { const D = dance(u - 7.2); lift += D.lift * h; sy *= D.sy; lean += D.lean; heading += D.yaw; flopX = -0.9 * D.sway + 0.6 * D.spinning; flopZ = -0.5 * D.bounce * D.env;
    const L = u - 7.2; const j = jump(L, 4.3, 0.9, 0.22); rLift += j.lift * h; const jk = (L - 4.3) / 0.9;
    anim.push(jk > 0 && jk < 1 ? { name: 'Hop', t: hopAt(jumpToHop(jk)), w: 1 } : { name: 'Dance', t: ((L % 2) + 2) % 2, w: 1 }); }
  if (a.beat === 'hello') { /* says hello: turns to whoever walks by (the camera if nobody), two little bounces, a lean */
    const L = u - 8.8; const seen = lookAt(world, t, x, z, true); const k = smooth(0, 0.35, L) * (1 - smooth(0.9, 1.2, L));
    heading = lerpA(heading, seen ? seen.heading : face(a.at, [a.at[0] - 3, a.at[1] + 6]), k); lift += 0.05 * h * Math.abs(Math.sin(L * Math.PI * 2.5)) * k; lean += 0.14 * Math.sin(L * Math.PI * 2) * k; flopX = 0.5 * Math.sin(L * Math.PI * 4) * k;
    anim.push({ name: 'Wave', t: Math.min(1.999, (L / 1.2) * 2), w: 1 }); }
  if (a.beat === 'watch' || a.beat === 'stand') {
    /* watching the street: the cars (and in the plaza, the people) pull his gaze; a fright when the first car off the line shoots past */
    const seen = lookAt(world, t, x, z, a.half === 1 && u > 14); const k = seen ? seen.w * win(u, a.half === 1 && u < 14.8 ? 12.6 : 12.2, a.half === 1 && u < 14.8 ? 14.8 : 23.5, 0.5) : 0;
    heading = lerpA(heading, seen ? seen.heading : heading, k) + 0.25 * Math.sin(tau * 0.9) * (1 - k);
    const jt = 12.8, near = nearestCar(world, t - (u - jt), x, z); const scare = near < 14 ? 1 - near / 18 : 0.25;
    const J2 = jump(u, jt, 0.9, (0.12 + 0.2 * scare) * h); lift += J2.lift; rLift += J2.lift; sy *= J2.sy; flopZ = -0.7 * Math.sin(J2.air * Math.PI) * scare;
    /* while he waits: idling, and the lantern held up for a while; the fright is one hop's crouch, air and landing */
    const j2 = (u - jt) / 0.9; const lw = a.half === 0 ? win(u, 16.5, 19.5, 0.35) : win(u, 20.7, 23.7, 0.35); const l0 = a.half === 0 ? 16.15 : 20.35;
    if (j2 > 0 && j2 < 1) anim.push({ name: 'Hop', t: hopAt(jumpToHop(j2)), w: 1 });
    else { if (lw < 1) anim.push({ name: 'Idle', t: tau % 4, w: 1 - lw }); if (lw > 0) anim.push({ name: 'Lantern', t: Math.min(2.999, Math.max(0, u - l0)), w: lw }); }
    if (u > 21.5) { const tap = Math.abs(Math.sin((u - 21.5) * Math.PI * 2)); lift += 0.02 * h * tap; rLift += 0.02 * h * tap; sy *= 1 - 0.03 * tap; } /* impatient: nearly green */
    flopX += 0.12 * Math.sin(tau * 1.7) * Math.max(0, Math.sin(tau * 0.6)); }
  sy *= 1 + 0.015 * breathe * (a.beat === 'hop' ? 0 : 1); const sx = 1 / Math.sqrt(Math.max(0.5, sy));
  if (!anim.length) anim.push({ name: 'Idle', t: tau % 4, w: 1 });
  const foot = world.footAt(x, z); return { pos: [x, foot + lift, z], heading, lean, pitch, sx, sy, flop: [flopX, flopZ], anim, rigPos: [x, foot + rLift, z] };
}

/** The camera at scene time t: a slow orbit about 6 m out that tracks him; its look point is his chest. */
export function mossCamera(world: CityWorld, j: number, J: { x: number; z: number }, h: number, t: number): { pos: V3; look: V3 } {
  const tau = world.signalClock(j, t); let sx = 0, sz = 0, n = 0; for (let k = -3; k <= 3; k++) { const p = mossPlan(tau + k * 0.4); sx += p.at[0]; sz += p.at[1]; n++; }
  const cx = J.x + sx / n, cz = J.z + sz / n; const now = mossPlan(tau);
  const far = smooth(-5, -8.5, sz / n); /* on the far pavement: swing round to the street side (the building would block the plaza side) */
  const dancing = now.half === 1 ? win(now.u, 7.2, 12.4, 1.2) : 0;
  const az = -0.72 + 0.95 * far + 0.28 * Math.sin((tau / MOSS_CYCLE) * Math.PI * 2) + 0.22 * dancing * Math.sin((now.u - 7.2) * 0.35);
  const D = 6.4 - 1.4 * dancing - 0.6 * far, up = 1.9 + 0.35 * Math.sin((tau / MOSS_CYCLE) * Math.PI * 4) - 0.25 * dancing;
  const look: V3 = [cx, world.footAt(cx, cz) + h * 0.5, cz];
  const want: V3 = [cx + Math.sin(az) * D, look[1] + up, cz + Math.cos(az) * D];
  return { pos: world.clampCamera(occludeWalls(world, look, want), 0.4), look };
}
/** CityWorld.occlude, but only walls count: a lamp post or a signal pole (thinner than 1.2 m) may pass in front of him for a moment instead of
 *  snapping the camera into his back */
function occludeWalls(world: CityWorld, from: V3, to: V3): V3 {
  const d: V3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]; let tHit = 1; const m = 0.2;
  for (const k of world.index.near(Math.min(from[0], to[0]) - m, Math.max(from[0], to[0]) + m, Math.min(from[2], to[2]) - m, Math.max(from[2], to[2]) + m)) { const b = world.boxes[k];
    if (b.x1 - b.x0 < 1.2 && b.z1 - b.z0 < 1.2) continue;
    let t0 = 0, t1 = tHit; const lo = [b.x0 - m, b.y0, b.z0 - m], hi = [b.x1 + m, b.y1 + m, b.z1 + m]; let hit = true;
    for (let a = 0; a < 3 && hit; a++) { if (Math.abs(d[a]) < 1e-9) { if (from[a] < lo[a] || from[a] > hi[a]) hit = false; continue; }
      let ta = (lo[a] - from[a]) / d[a], tb = (hi[a] - from[a]) / d[a]; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) hit = false; }
    if (hit && t0 > 0 && t0 < tHit) tHit = t0; }
  if (tHit >= 1) return to; const k = Math.max(0.12, tHit - 0.04); return [from[0] + d[0] * k, from[1] + d[1] * k, from[2] + d[2] * k];
}

/** The object: his file (loaded once per page, shared with Direct a Shot), our own clone and material, posed from mossPose. */
export async function createMossbun(T: T3, src = MOSSBUN_RIG) {
  const L = await loadUserModel(T, src); const h = startHeight(L.fw, 'open-city');
  const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
  if (L.animations.some((a: any) => a.name === 'Hop')) return riggedMossbun(T, L, h, clone);
  /* body (place, heading, lean) → squash (from the feet) → the normalised file (one unit tall, its front +z) */
  const body = new T.Group(); body.name = 'explore-mossbun'; const squash = new T.Group(); body.add(squash); const c = clone(L.proto); squash.add(c);
  c.updateMatrixWorld(true); const inv = new T.Matrix4().copy(c.matrixWorld).invert(); const flop = { value: new T.Vector2() }; const mats: any[] = [];
  c.traverse((o: any) => { if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    /* the bend works in his own unit frame (y 0 at the feet, 1 at the top): the top half sways with the flop, most at the ears' tips */
    const toM = new T.Matrix4().multiplyMatrices(inv, o.matrixWorld); const fromM = toM.clone().invert();
    const m = (Array.isArray(o.material) ? o.material[0] : o.material).clone(); mats.push(m); o.material = m;
    m.onBeforeCompile = (sh: any) => { sh.uniforms.uFlop = flop; sh.uniforms.uToM = { value: toM }; sh.uniforms.uFromM = { value: fromM };
      sh.vertexShader = 'uniform vec2 uFlop; uniform mat4 uToM; uniform mat4 uFromM;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n vec4 mP = uToM * vec4(transformed, 1.0); float fw = smoothstep(0.42, 1.0, mP.y); fw *= fw; mP.x += uFlop.x * fw * 0.12; mP.z += uFlop.y * fw * 0.07; mP.y -= abs(uFlop.x) * fw * 0.02; transformed = (uFromM * mP).xyz;'); };
    m.customProgramCacheKey = () => 'explore-mossbun-flop'; });
  return {
    root: body, h,
    pose(p: MossPose) { body.position.set(p.pos[0], p.pos[1], p.pos[2]); body.rotation.set(0, 0, 0); body.rotateY(p.heading); body.rotateZ(p.lean); body.rotateX(p.pitch);
      squash.scale.set(h * p.sx, h * p.sy, h * p.sx); flop.value.set(p.flop[0], p.flop[1]); },
    dispose() { body.removeFromParent(); for (const m of mats) m.dispose(); },
  };
}

/** His own rig in the city: body (place, heading, lean) → the normalised rigged file; his clips set from MossPose.anim, no clock. */
function riggedMossbun(T: T3, L: Awaited<ReturnType<typeof loadUserModel>>, h: number, clone: (o: any) => any) {
  const body = new T.Group(); body.name = 'explore-mossbun'; const c = clone(L.proto); c.scale.multiplyScalar(h); body.add(c); let glow: any = null;
  c.traverse((o: any) => { if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; if (o.material?.name === 'Lantern') { o.material = o.material.clone(); glow = o.material; } });
  const mixer = new T.AnimationMixer(c); const acts: Record<string, any> = {};
  for (const a of L.animations) { const x = mixer.clipAction(a); x.play(); x.setEffectiveWeight(0); x.setEffectiveTimeScale(0); acts[a.name] = x; }
  return {
    root: body, h, rigged: true,
    pose(p: MossPose) { body.position.set(p.rigPos[0], p.rigPos[1], p.rigPos[2]); body.rotation.set(0, 0, 0); body.rotateY(p.heading); body.rotateZ(p.lean * 0.5);
      for (const a of Object.values(acts)) a.setEffectiveWeight(0); let hop: number | null = null;
      for (const x of p.anim) { const a = acts[x.name]; if (!a) continue; a.setEffectiveWeight(x.w); a.time = Math.max(0, Math.min(a.getClip().duration - 1e-4, x.t)); if (x.name === 'Hop' && x.w > 0.3) hop = x.t; }
      mixer.update(0); if (glow) glow.emissiveIntensity = mossGlow(hop); },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(c); glow?.dispose(); body.removeFromParent(); },
  };
}
