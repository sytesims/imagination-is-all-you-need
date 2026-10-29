/**
 * Cinematic camera for Direct a Shot (2026-10-27, phase 1 of the camera plan): the shared camera core. Isomorphic and pure: no server or browser
 * imports, every answer a function of the shot and t, so the live player, the recorder, the map and the tests agree.
 *
 *  - Shot Recipes: one-click camera moves named after the Camera Moves catalogue (server/src/cinema/cameraCatalog.ts ids and labels, so Video and
 *    3D share one vocabulary). Each recipe is a rig(ctx, k, u): where the camera is, what it looks at, the lens, the roll and the focus distance
 *    for progress k (0–1) at subject time u. bakeRecipe samples it at TAKE_HZ into ordinary take keys, so a recipe is a normal editable take: the
 *    map, Compare, smoothing, trim and recording all keep working, and the take remembers its recipe so the lens and size can be changed later.
 *  - Lens and shot size: real focal lengths (a 16:9 frame cut from a full-frame sensor) and the usual sizes (ECU … EWS). The distance for a size
 *    is plain maths: d = frame height / (2 · tan(vfov / 2)), on the subject's own scale (a person is 1.75 m; a bottle, a model village or a town
 *    get their own size).
 *  - Camera feel (shake): seeded smooth noise on position, turn, tilt and roll, a pure function of (seed, t). Tripod or strength 0 = no change.
 * Our own maths from the published ideas (film-craft shot sizes, the dolly-zoom relation, value noise); no code copied from anyone.
 */
import { aimAt, aimOffset, clampCamera, fovFor, groundAt, previzTemplate, subjectAt, cameraAt, yawPitchTo, smoother, clamp01, rng, normalizeTake, TAKE_HZ, FOV_MIN, FOV_MAX,
  type CameraKey, type CameraTake, type PlanShot, type PrevizTemplateId, type Vec3 } from './previzTemplates.js';
import { actorAt, shootTake, nextAngle, isPerformance } from './previzActor.js';
import { isCityTemplate, openCityWorld } from './world/openCity.js';
import { starOf, frameHeightOf } from './previzModels.js';

// ---------- lens ----------
/** The focal lengths offered (millimetres, full-frame). */
export const LENSES = [24, 35, 50, 85, 135] as const;
export type LensMm = (typeof LENSES)[number];
export const isLens = (x: unknown): x is LensMm => (LENSES as readonly number[]).includes(x as number);
/** half the height of a 16:9 frame cut from a 36 mm wide full-frame sensor (36 × 9 / 16 / 2), mm */
const HALF_SENSOR = 10.125;
/** Vertical field of view (degrees, 16:9) for a focal length. 24 mm ≈ 46°, 35 ≈ 32°, 50 ≈ 23°, 85 ≈ 13.6°, 135 ≈ 8.6°. */
export const lensFov = (mm: number) => (2 * Math.atan(HALF_SENSOR / mm) * 180) / Math.PI;
/** The focal length that gives a vertical field of view (degrees, 16:9). */
export const lensMmOf = (fov: number) => HALF_SENSOR / Math.tan((fov * Math.PI) / 360);
export const LENS_WORDS: Record<LensMm, string> = { 24: 'Wide, energetic', 35: 'Natural storytelling', 50: 'Neutral, like the eye', 85: 'Portrait, soft and close', 135: 'Long, compressed' };

// ---------- shot sizes ----------
export type ShotSize = 'ecu' | 'cu' | 'mcu' | 'ms' | 'ws' | 'ews';
/** h = frame height for a 1.75 m person (metres); c = where the frame centres, as a share of the subject's height from the ground */
export const SHOT_SIZES: { id: ShotSize; label: string; name: string; h: number; c: number }[] = [
  { id: 'ecu', label: 'ECU', name: 'Extreme close-up: the eyes', h: 0.15, c: 0.93 },
  { id: 'cu', label: 'CU', name: 'Close-up: the face', h: 0.36, c: 0.9 },
  { id: 'mcu', label: 'MCU', name: 'Medium close-up: chest up', h: 0.6, c: 0.83 },
  { id: 'ms', label: 'MS', name: 'Medium shot: waist up', h: 1.0, c: 0.72 },
  { id: 'ws', label: 'WS', name: 'Wide shot: head to toe', h: 2.3, c: 0.52 },
  { id: 'ews', label: 'EWS', name: 'Extreme wide: the whole place', h: 7, c: 0.45 },
];
export const isShotSize = (x: unknown): x is ShotSize => SHOT_SIZES.some((s) => s.id === x);
const sizeOf = (id: ShotSize) => SHOT_SIZES.find((s) => s.id === id) ?? SHOT_SIZES[3];
/** one size wider (MCU → MS) or tighter */
const wider = (id: ShotSize, n = 1) => SHOT_SIZES[Math.min(SHOT_SIZES.length - 1, SHOT_SIZES.findIndex((s) => s.id === id) + n)].id;
/** The subject's height per preset (metres): what "a medium shot" means there. The person is 1.75 m; the city without a person frames a block. */
export function subjectHeight(template: PrevizTemplateId, person: boolean): number {
  if (person) return 1.75;
  if (template === 'product-hero') return 0.55; if (template === 'diorama') return 0.8; if (template === 'walkthrough') return 1.2; /* the sofa */ if (template === 'establishing') return 7;
  if (isCityTemplate(template)) return 8; return 1.75;
}
/** Your 3D model as the subject (previzModels.ts): models from one picture are often creatures, round and big-headed, so the sizes are measured on
 *  the whole model (h = frame height as a share of its height, c = the frame's centre): MS shows all of it with a little room, CU its face. */
export const MODEL_SIZES: Record<ShotSize, { h: number; c: number }> = { ecu: { h: 0.22, c: 0.8 }, cu: { h: 0.45, c: 0.74 }, mcu: { h: 0.75, c: 0.62 }, ms: { h: 1.2, c: 0.5 }, ws: { h: 2.1, c: 0.45 }, ews: { h: 5.5, c: 0.45 } };
/** The frame height (metres) a size means on a subject of height H: a person's table, or the whole-model table for your 3D model. */
export const sizeFrame = (size: ShotSize, H: number, model = false) => (model ? MODEL_SIZES[size].h * H : sizeOf(size).h * (H / 1.75));
/** Camera distance (metres) that frames a size with a vertical lens (degrees) on a subject of height H. */
export const sizeDistance = (size: ShotSize, fov: number, H = 1.75) => (sizeOf(size).h * (H / 1.75)) / (2 * Math.tan((fov * Math.PI) / 360));

// ---------- roll ----------
/** the camera never rolls further than this (radians, 30°) */
export const ROLL_MAX = Math.PI / 6;
export const clampRoll = (r: number) => (Number.isFinite(r) ? Math.max(-ROLL_MAX, Math.min(ROLL_MAX, r)) : 0);

// ---------- seeded noise ----------
/** a lattice value in −1…1 for (seed, channel, i): an integer hash, so the same inputs always give the same number */
function lattice(seed: number, ch: number, i: number): number {
  let h = Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(ch + 1, 0x85ebca77) ^ Math.imul(i | 0, 0xc2b2ae3d);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15; return ((h >>> 0) / 4294967295) * 2 - 1;
}
/** Smooth 1-D value noise (−1…1): lattice values eased with smootherstep, so position and speed are continuous. Pure in (seed, ch, x). */
export function noise1(seed: number, ch: number, x: number): number { const i = Math.floor(x); const f = x - i; const k = f * f * f * (f * (f * 6 - 15) + 10); const a = lattice(seed, ch, i), b = lattice(seed, ch, i + 1); return a + (b - a) * k; }
/** two octaves: the slow sway and a finer layer */
const fbm = (seed: number, ch: number, x: number) => noise1(seed, ch, x) * 0.72 + noise1(seed, ch + 40, x * 2.3 + 17.1) * 0.28;

// ---------- camera feel (shake) ----------
export type ShakeProfile = 'tripod' | 'breathing' | 'walk' | 'run' | 'impact' | 'car';
export interface ShotShake { p: ShakeProfile; /** strength 0–1 (0.6 ≈ the profile as described) */ k: number }
/** rot / roll in degrees, pos in metres (at full size), hz the sway's rate; bob = steps (hz, metres); buzz = fine high-rate jitter (hz, share) */
const SHAKE_SPEC: Record<ShakeProfile, { rot: number; roll: number; pos: number; hz: number; bob?: [number, number]; buzz?: [number, number] }> = {
  tripod: { rot: 0, roll: 0, pos: 0, hz: 1 },
  breathing: { rot: 0.28, roll: 0.12, pos: 0.006, hz: 0.28 },
  walk: { rot: 0.9, roll: 0.5, pos: 0.025, hz: 0.85, bob: [1.8, 0.014] },
  run: { rot: 2.2, roll: 1.3, pos: 0.06, hz: 1.6, bob: [2.8, 0.035], buzz: [7.5, 0.12] },
  impact: { rot: 0.2, roll: 0.08, pos: 0.005, hz: 0.3 },
  car: { rot: 0.3, roll: 0.18, pos: 0.014, hz: 0.35, bob: [2.4, 0.006], buzz: [11, 0.25] },
};
export const SHAKES: { id: ShakeProfile; label: string; hint: string }[] = [
  { id: 'tripod', label: 'Tripod', hint: 'Locked off: no shake at all' },
  { id: 'breathing', label: 'Breathing', hint: 'A held camera at rest: a slow, barely-there drift' },
  { id: 'walk', label: 'Handheld walk', hint: 'Walking with the camera: gentle sway and step bob' },
  { id: 'run', label: 'Run-and-gun', hint: 'Fast and urgent: strong sway, steps and jitter' },
  { id: 'impact', label: 'Impact', hint: 'Steady, then a few sharp hits that settle' },
  { id: 'car', label: 'Car mount', hint: 'Bolted to a car: road buzz and soft bumps' },
];
export const SHAKE_DEFAULT_K = 0.6;
export const isShake = (x: unknown): x is ShakeProfile => SHAKES.some((s) => s.id === x);
/** Any input → a shake, or null (tripod, strength 0 or junk mean no shake: the shot reads back exactly as without it). */
export function normalizeShake(raw: unknown): ShotShake | null {
  if (!raw || typeof raw !== 'object') return null; const r = raw as Record<string, unknown>; if (!isShake(r.p) || r.p === 'tripod') return null;
  const k = Number(r.k); const kk = r.k == null || r.k === '' || !Number.isFinite(k) ? SHAKE_DEFAULT_K : Math.round(Math.max(0, Math.min(1, k)) * 100) / 100;
  return kk > 0 ? { p: r.p, k: kk } : null;
}
/** The impact hits for a shot: two (three in longer shots) moments between 20 % and 80 % of it, from the seed. */
export function impactTimes(seed: number, seconds: number): number[] { const R = rng((seed ^ 0x51ed27) >>> 0); const n = seconds > 6 ? 3 : 2;
  return Array.from({ length: n }, () => seconds * (0.2 + 0.6 * R())).sort((a, b) => a - b); }
/**
 * The shake at t: position offset (metres), turn / tilt / roll offsets (radians). Pure in (shake, seed, t, seconds); null when there is none.
 * scale shrinks the position part for small sets (a bottle, a model village), never the angles.
 */
export function shakeAt(sh: ShotShake | null | undefined, seed: number, t: number, seconds: number, scale = 1): { pos: Vec3; yaw: number; pitch: number; roll: number } | null {
  if (!sh || sh.p === 'tripod' || !(sh.k > 0)) return null; const S = SHAKE_SPEC[sh.p]; const a = sh.k / SHAKE_DEFAULT_K; const D = Math.PI / 180; const x = t * S.hz; const sd = seed | 0;
  let yaw = fbm(sd, 0, x) * S.rot * D, pitch = fbm(sd, 1, x + 31.7) * S.rot * 0.8 * D, roll = fbm(sd, 2, x + 57.3) * S.roll * D;
  const pos: Vec3 = [fbm(sd, 3, x + 11.1) * S.pos, fbm(sd, 4, x + 23.9) * S.pos * 0.7, fbm(sd, 5, x + 41.3) * S.pos];
  if (S.bob) { const [hz, m] = S.bob; const ph = t * hz * Math.PI * 2 + noise1(sd, 6, t * 0.4) * 0.8; pos[1] += Math.sin(ph) * m; roll += Math.sin(ph * 0.5) * m * 6 * D; }
  if (S.buzz) { const [hz, share] = S.buzz; yaw += noise1(sd, 7, t * hz) * S.rot * share * D; pitch += noise1(sd, 8, t * hz + 5.5) * S.rot * share * D; pos[1] += noise1(sd, 9, t * hz + 9.1) * S.pos * share; }
  if (sh.p === 'impact') for (const ti of impactTimes(sd, seconds)) { const dt = t - ti; if (dt < 0 || dt > 1.4) continue; const e = Math.exp(-dt * 5.5) * Math.sin(dt * Math.PI * 2 * 8);
    pitch += e * 2.6 * D; yaw += e * 0.9 * D * (lattice(sd, 10, Math.round(ti * 100)) > 0 ? 1 : -1); roll += e * 0.9 * D; pos[1] += e * 0.05; }
  return { pos: [pos[0] * a * scale, pos[1] * a * scale, pos[2] * a * scale], yaw: yaw * a, pitch: pitch * a, roll: roll * a };
}

// ---------- the rig context: the subject and the set ----------
/** Home walkthrough: where the sofa stands (x, z; web/src/shared/previz/engine.ts builds it there, facing +x) */
export const WALKTHROUGH_SOFA: [number, number] = [-1.9, -3.2];
type V2 = [number, number];
const norm2 = (x: number, z: number): V2 => { const l = Math.hypot(x, z); return l > 1e-6 ? [x / l, z / l] : [0, 1]; };
const rot2 = ([x, z]: V2, a: number): V2 => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** What a rig works from. Times are subject times u (the shot's clock, or a performance's own clock). */
export interface RigCtx {
  template: PrevizTemplateId; seed: number; interior: boolean;
  /** the subject's height (metres): what the sizes are measured against */ H: number;
  /** the ground point under the subject at u */ base(u: number): Vec3;
  /** the way the subject faces / travels at u (unit, on the ground) */ fwd(u: number): V2;
  /** from the subject towards the side the preset films it from (unit, on the ground): the set's good side */ view: V2;
  /** true when the subject travels during the take (walk-by, a performance) */ moving: boolean;
  /** the subject is your 3D model (the sizes use MODEL_SIZES) */ model: boolean;
}
export interface RigOut { pos: Vec3; look: Vec3; /** 16:9 vertical degrees */ fov: number; roll: number; /** metres from the camera to what it is about */ focus: number }
/** k = progress 0–1 (eased by the rig itself), u = subject time; size and lens are the take's (or the recipe's own) */
type Rig = (c: RigCtx, k: number, u: number, o: { size: ShotSize; lens: number; seconds: number; t: number; /** frame width ÷ height and its vertical lens factor (fovFor) */ aspect: number; tall: number }) => Omit<RigOut, 'focus'>;

/** The context for a shot: the person of a performance when one is given, else the preset's subject (the walker, the bottle, the set's centre). */
export function rigContext(shot: PlanShot, perf: CameraTake | null = null): RigCtx {
  const tpl = previzTemplate(shot.template)!; const interior = !!tpl.stage.interior; const person = !!perf?.actor || shot.template === 'walk-by';
  /* your model playing the actor (previzModels.ts): the sizes are measured on its own bounds; with no performance and no walk it is the subject where it stands */
  const star = starOf(shot); const H = star ? frameHeightOf(star) : subjectHeight(shot.template, person); const bare: PlanShot = { ...shot, cameraPath: undefined };
  let base: (u: number) => Vec3; let heading: ((u: number) => V2) | null = null; let moving = false;
  if (perf?.actor) { const tr = perf.actor; base = (u) => actorAt(tr, u).pos; heading = (u) => { const h = actorAt(tr, u).heading; return [Math.sin(h), Math.cos(h)]; };
    const a = base(perf.trimStart), b = base(perf.trimEnd); moving = Math.hypot(b[0] - a[0], b[2] - a[2]) > 0.8; }
  else if (shot.template === 'walk-by') { base = (u) => subjectAt(bare, u).pos; heading = () => [1, 0]; moving = true; }
  else if (star) { const g: Vec3 = [star.x, groundAt(shot.template, star.x, star.z), star.z]; base = () => g; }
  else if (shot.template === 'product-hero') { base = (u) => { const p = aimAt(bare, u); return [p[0], p[1] - H * 0.5, p[2]]; }; }
  else if (shot.template === 'walkthrough') { const [ax, az] = aimOffset(shot); const g: Vec3 = [WALKTHROUGH_SOFA[0] + ax, 0, WALKTHROUGH_SOFA[1] + az]; base = () => g; } /* indoors the subject is the sofa (map drags move it) */
  else { const p = aimAt(bare, 0); const g: Vec3 = [p[0], interior ? 0 : groundAt(shot.template, p[0], p[2]), p[2]]; base = () => g; }
  /* the good side: towards where the preset puts its camera halfway through its move (a dolly or an orbit starts off to one side) */
  const c0 = cameraAt(bare, shot.seconds / 2); const b0 = base(perf ? perf.trimStart : shot.seconds / 2); let view = norm2(c0.pos[0] - b0[0], c0.pos[2] - b0[2]);
  if (perf?.actor) { const h = actorAt(perf.actor, perf.trimStart).heading; view = [Math.sin(h), Math.cos(h)]; } /* a person: their front */
  else if (star && shot.template !== 'walk-by') view = [Math.sin(star.r), Math.cos(star.r)]; /* your model: its front */
  else if (shot.template === 'walkthrough') view = [1, 0]; /* the sofa faces into the living room */
  /* a travelling subject's heading, averaged over ±0.8 s so sharp turns don't swing the camera */
  const fwd = heading ? (u: number) => { let x = 0, z = 0; for (let i = -4; i <= 4; i++) { const h = heading!(Math.max(0, u + i * 0.2)); x += h[0]; z += h[1]; } return norm2(x, z); } : () => view;
  return { template: shot.template, seed: shot.seed, interior, H, base, fwd, view, moving, model: !!star };
}
const centre = (c: RigCtx, u: number, size: ShotSize): Vec3 => { const b = c.base(u); return [b[0], b[1] + (c.model ? MODEL_SIZES[size].c : sizeOf(size).c) * c.H, b[2]]; };
/** the frame height a size means for this subject (metres) and the camera distance for it with a vertical lens (degrees) */
const frameOf = (c: RigCtx, size: ShotSize) => sizeFrame(size, c.H, c.model);
const sizeDist = (c: RigCtx, size: ShotSize, fov: number) => frameOf(c, size) / (2 * Math.tan((fov * Math.PI) / 360));
const at = (p: Vec3, d: V2, dist: number, y: number): Vec3 => [p[0] + d[0] * dist, y, p[2] + d[1] * dist];
/** the side of the subject that faces the viewer, at right angles to its heading */
const sideOf = (c: RigCtx, f: V2): V2 => { const s: V2 = [-f[1], f[0]]; return s[0] * c.view[0] + s[1] * c.view[1] >= 0 ? s : [-s[0], -s[1]]; };
/** exponential ease in-out for the whip (fast in the middle, soft at the ends) */
const expoInOut = (x: number) => { const k = clamp01(x); return k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? Math.pow(2, 20 * k - 10) / 2 : (2 - Math.pow(2, -20 * k + 10)) / 2; };

// ---------- the recipes ----------
export type RecipeId = 'low-hero' | 'aerial-pull' | 'eye-push' | 'ots' | 'orbit-r' | 'track-right' | 'lead' | 'follow' | 'crane-down' | 'vertigo-in' | 'whip' | 'dutch' | 'overhead';
export interface ShotRecipe { id: RecipeId; /** the Camera Moves catalogue's label for the same id */ label: string; hint: string; size: ShotSize; lens: LensMm;
  /** the move sets its own lens (dolly zoom): the lens chips don't apply */ ownLens?: boolean; /** the move rolls the horizon on purpose */ dutch?: boolean; rig: Rig }
const D = Math.PI / 180;
export const SHOT_RECIPES: ShotRecipe[] = [
  { id: 'low-hero', label: 'Low hero angle', hint: 'Low, looking up, pushing in: the subject feels powerful', size: 'ms', lens: 24,
    rig: (c, k, u, o) => { const e = smoother(k); const p = centre(c, u, o.size); const d = sizeDist(c, o.size, lensFov(o.lens)); const dir = rot2(c.view, 0.35); const b = c.base(u);
      return { pos: at(p, dir, lerp(1.7 * d, d, e), b[1] + 0.22 * c.H), look: p, fov: lensFov(o.lens), roll: 0 }; } },
  { id: 'aerial-pull', label: 'Drone pull-back', hint: 'Starts on the subject, then pulls back and up to reveal the place', size: 'ms', lens: 24,
    rig: (c, k, u, o) => { const e = smoother(k); const p = centre(c, u, o.size); const d = sizeDist(c, o.size, lensFov(o.lens)); const far = d * 3.4 + 4 * (c.H / 1.75); const b = c.base(u);
      const dist = lerp(d, far, e); const dir = rot2(c.view, -0.25 * e); const top = b[1] + Math.max(0.8 * c.H, far * 0.75);
      return { pos: at(p, dir, dist, lerp(b[1] + 0.8 * c.H, top, e)), look: [p[0], lerp(p[1], b[1] + 0.35 * c.H, e), p[2]], fov: lensFov(o.lens), roll: 0 }; } },
  { id: 'eye-push', label: 'Eye close-in', hint: 'A slow push at eye level into the face: a realisation', size: 'cu', lens: 85,
    rig: (c, k, u, o) => { const e = smoother(k); const b = c.base(u); const eye: Vec3 = [b[0], b[1] + (c.model ? 0.76 : 0.93) * c.H, b[2]]; const d = sizeDist(c, o.size, lensFov(o.lens));
      return { pos: at(eye, c.fwd(u), lerp(2 * d, d, e), eye[1]), look: eye, fov: lensFov(o.lens), roll: 0 }; } },
  { id: 'ots', label: 'Over the shoulder', hint: 'Dialogue framing from beside the other person’s shoulder, the subject on a third, a soft push', size: 'mcu', lens: 85,
    rig: (c, k, u, o) => { const e = smoother(k); const p = centre(c, u, o.size); const fov = lensFov(o.lens); const d = sizeDist(c, o.size, fov); const dir = rot2(c.fwd(u), 0.42); const b = c.base(u);
      const dist = lerp(1.08 * d, d, e); const pos = at(p, dir, dist, b[1] + 0.92 * c.H); const D2 = norm2(p[0] - pos[0], p[2] - pos[2]); const right: V2 = [-D2[1], D2[0]];
      const off = (dist * Math.tan((fov * o.tall * Math.PI) / 360) * o.aspect) / 3; /* the subject on the left third of this frame shape */
      return { pos, look: [p[0] + right[0] * off, p[1], p[2] + right[1] * off], fov, roll: 0 }; } },
  { id: 'orbit-r', label: 'Arc right', hint: 'Arcs around the subject, keeping it centred: a reveal with depth', size: 'ms', lens: 35,
    rig: (c, k, u, o) => { const e = smoother(k); const p = centre(c, u, o.size); const d = sizeDist(c, o.size, lensFov(o.lens)); const b = c.base(u);
      return { pos: at(p, rot2(c.fwd(u), lerp(-0.85, 0.75, e)), d * lerp(1.1, 1, e), b[1] + 0.8 * c.H), look: p, fov: lensFov(o.lens), roll: 0 }; } },
  { id: 'track-right', label: 'Track right', hint: 'Slides alongside, parallel to the subject: travel and parallax', size: 'ms', lens: 35,
    rig: (c, k, u, o) => { const e = smoother(k); const p = centre(c, u, o.size); const d = sizeDist(c, o.size, lensFov(o.lens)); const f = c.fwd(u); const s = sideOf(c, f); const b = c.base(u); const y = b[1] + 0.72 * c.H;
      if (c.moving) { const pos = at(p, s, d * 1.15, y); return { pos, look: [p[0] + f[0] * 0.15 * d, p[1], p[2] + f[1] * 0.15 * d], fov: lensFov(o.lens), roll: 0 }; }
      const along: V2 = [-c.view[1], c.view[0]]; const slide = lerp(-0.5, 0.5, e) * d; const pos = at(p, c.view, d * 1.15, y);
      return { pos: [pos[0] + along[0] * slide, y, pos[2] + along[1] * slide], look: [p[0] + along[0] * slide * 0.3, p[1], p[2] + along[1] * slide * 0.3], fov: lensFov(o.lens), roll: 0 }; } },
  { id: 'lead', label: 'Lead in front', hint: 'Backs away in front of the subject: the journey, face first', size: 'ms', lens: 35,
    rig: (c, k, u, o) => { const e = smoother(k); const p = centre(c, u, o.size); const d = sizeDist(c, o.size, lensFov(o.lens)); const f = c.fwd(u); const s = sideOf(c, f); const b = c.base(u);
      const dist = c.moving ? d * 1.1 : lerp(d, 1.3 * d, e); const pos = at(p, f, dist, b[1] + 0.85 * c.H);
      return { pos: [pos[0] + s[0] * 0.14 * dist, pos[1], pos[2] + s[1] * 0.14 * dist], look: p, fov: lensFov(o.lens), roll: 0 }; } },
  { id: 'follow', label: 'Follow behind', hint: 'Behind the subject at shoulder height, seeing where they go', size: 'ms', lens: 35,
    rig: (c, k, u, o) => { const e = smoother(k); const p = centre(c, u, o.size); const d = sizeDist(c, o.size, lensFov(o.lens)); const b = c.base(u); const y = b[1] + 0.98 * c.H;
      if (!c.moving) { return { pos: at(p, rot2(c.view, 0.2), lerp(1.35 * d, d, e), y), look: p, fov: lensFov(o.lens), roll: 0 }; } /* nothing to follow: a slow drift in */
      const f = c.fwd(u); return { pos: at(p, [-f[0], -f[1]], d * 1.15, y), look: [p[0] + f[0] * 0.35 * d, p[1], p[2] + f[1] * 0.35 * d], fov: lensFov(o.lens), roll: 0 }; } },
  { id: 'crane-down', label: 'Crane down', hint: 'From high above down to eye level on the subject: an opening', size: 'ws', lens: 35,
    rig: (c, k, u, o) => { const e = smoother(k); const p = centre(c, u, o.size); const d = sizeDist(c, o.size, lensFov(o.lens)); const b = c.base(u); const high = b[1] + Math.max(2.4 * c.H, d * 0.95);
      return { pos: at(p, rot2(c.view, 0.15), lerp(1.2 * d, d, e), lerp(high, b[1] + 0.85 * c.H, e)), look: [p[0], lerp(b[1] + 0.3 * c.H, p[1], e), p[2]], fov: lensFov(o.lens), roll: 0 }; } },
  { id: 'vertigo-in', label: 'Dolly-zoom in', hint: 'Moves in while the lens widens: the subject holds its size, the world stretches', size: 'ms', lens: 35, ownLens: true,
    rig: (c, k, u, o) => { const e = smoother(k); const p = centre(c, u, o.size); const hf = frameOf(c, o.size); const t2 = (deg: number) => Math.tan((deg * Math.PI) / 360);
      const far = hf / (2 * t2(14)), near = hf / (2 * t2(60)); const dist = lerp(far, near, e); const fov = Math.max(FOV_MIN, Math.min(FOV_MAX, (2 * Math.atan(hf / (2 * dist)) * 180) / Math.PI));
      return { pos: at(p, c.view, dist, p[1]), look: p, fov, roll: 0 }; } },
  { id: 'whip', label: 'Whip pan', hint: 'Holds on the subject, then whips sideways in a third of a second', size: 'ms', lens: 35,
    rig: (c, k, u, o) => { const p = centre(c, u, o.size); const d = sizeDist(c, o.size, lensFov(o.lens)); const pos = at(p, c.view, d * 1.2, p[1] + 0.05 * c.H);
      const { yaw, pitch } = yawPitchTo(pos, p); const t0 = Math.max(0.5, o.seconds * 0.62); const w = expoInOut((o.t - t0) / 0.32);
      const y2 = yaw - 1.35 * w, p2 = pitch * (1 - w); const dir: Vec3 = [-Math.sin(y2) * Math.cos(p2), Math.sin(p2), -Math.cos(y2) * Math.cos(p2)];
      return { pos, look: [pos[0] + dir[0] * d, pos[1] + dir[1] * d, pos[2] + dir[2] * d], fov: lensFov(o.lens), roll: 0 }; } },
  { id: 'dutch', label: 'Dutch tilt', hint: 'The horizon creeps to a 12° tilt during a slow push: unease', size: 'mcu', lens: 35, dutch: true,
    rig: (c, k, u, o) => { const e = smoother(k); const p = centre(c, u, o.size); const d = sizeDist(c, o.size, lensFov(o.lens)); const b = c.base(u);
      return { pos: at(p, rot2(c.view, -0.2), lerp(1.35 * d, d, e), b[1] + 0.7 * c.H), look: p, fov: lensFov(o.lens), roll: 12 * D * e }; } },
  { id: 'overhead', label: 'Top-down', hint: 'Straight down from above, turning slowly: graphic and godlike', size: 'ws', lens: 35,
    rig: (c, k, u, o) => { const e = smoother(k); const b = c.base(u); const p: Vec3 = [b[0], b[1] + 0.3 * c.H, b[2]]; const d = sizeDist(c, o.size, lensFov(o.lens)) * lerp(1.12, 1, e);
      const el = 1.3; const dir = rot2(c.view, lerp(-0.3, 0.3, e)); return { pos: [p[0] + dir[0] * d * Math.cos(el), p[1] + d * Math.sin(el), p[2] + dir[1] * d * Math.cos(el)], look: p, fov: lensFov(o.lens), roll: 0 }; } },
];
export const isRecipeId = (x: unknown): x is RecipeId => SHOT_RECIPES.some((r) => r.id === x);
export const recipeOf = (id: string | null | undefined): ShotRecipe | null => SHOT_RECIPES.find((r) => r.id === id) ?? null;

/** What a recipe take remembers, so its lens and size can be changed later (it is baked again). */
export interface TakeRecipe { id: RecipeId; lens: LensMm; size: ShotSize }
export function normalizeTakeRecipe(raw: unknown): TakeRecipe | null {
  if (!raw || typeof raw !== 'object') return null; const r = raw as Record<string, unknown>; const R = recipeOf(String(r.id ?? '')); if (!R) return null;
  return { id: R.id, lens: isLens(r.lens) ? r.lens : R.lens, size: isShotSize(r.size) ? r.size : R.size };
}

/** Keep a recipe camera in the set: inside the walkthrough's rooms, in front of any city building between it and the subject, above the ground.
 *  Pulled in along the line to the subject, so the subject stays in view. pulled = it had to move. */
export function containCamera(template: PrevizTemplateId, look: Vec3, pos: Vec3): { pos: Vec3; pulled: boolean } {
  let p = pos;
  if (template === 'walkthrough') { const lo = [-2.2, 0.3, -10.6], hi = [2.2, 2.45, 2.8]; let k = 1;
    for (let a = 0; a < 3; a++) { const d = p[a] - look[a]; if (p[a] > hi[a] && d > 1e-9) k = Math.min(k, (hi[a] - look[a]) / d); if (p[a] < lo[a] && d < -1e-9) k = Math.min(k, (lo[a] - look[a]) / d); }
    k = Math.max(0.05, k); if (k < 1) p = [look[0] + (p[0] - look[0]) * k, look[1] + (p[1] - look[1]) * k, look[2] + (p[2] - look[2]) * k]; }
  if (isCityTemplate(template)) p = openCityWorld().occlude(look, p);
  const c = clampCamera(template, p); const pulled = Math.hypot(c[0] - pos[0], c[1] - pos[1], c[2] - pos[2]) > 1e-3; return { pos: c, pulled };
}

/**
 * Bake a recipe into take keys: sampled at TAKE_HZ over the shot (or over the used part of a performance, on its clock), contained in the set,
 * yaw / pitch towards the look point, the lens as 16:9 degrees, roll (0 unless the move rolls on purpose) and focus (distance to the subject).
 */
export function bakeRecipe(shot: PlanShot, rec: TakeRecipe, perf: CameraTake | null = null): { keys: CameraKey[]; pulled: boolean } {
  const R = recipeOf(rec.id)!; const c = rigContext(shot, perf); const lo = perf ? perf.trimStart : 0; const span = perf ? Math.min(perf.trimEnd - lo, shot.seconds * perf.speed) : shot.seconds;
  const [aw, ah] = shot.aspect.split(':').map(Number); const aspect = aw / ah, tall = fovFor(1, shot.aspect); const n = Math.max(2, Math.round(span * TAKE_HZ)); const keys: CameraKey[] = []; let pulled = false; const seconds = span / (perf ? perf.speed : 1);
  for (let i = 0; i <= n; i++) { const k = i / n; const u = lo + span * k; const r = R.rig(c, k, u, { size: rec.size, lens: rec.lens, seconds, t: seconds * k, aspect, tall });
    const ct = containCamera(shot.template, r.look, r.pos); pulled ||= ct.pulled; const { yaw, pitch } = yawPitchTo(ct.pos, r.look);
    const focus = Math.hypot(r.look[0] - ct.pos[0], r.look[1] - ct.pos[1], r.look[2] - ct.pos[2]); const roll = R.dutch ? clampRoll(r.roll) : 0;
    keys.push({ t: perf ? u : span * k, pos: ct.pos, yaw, pitch, fov: Math.max(FOV_MIN, Math.min(FOV_MAX, r.fov)), ...(roll ? { roll } : {}), focus: Math.round(focus * 100) / 100 }); }
  /* unwrap the yaw so a move through ±180° never spins */
  for (let i = 1; i < keys.length; i++) { let y = keys[i].yaw; const p = keys[i - 1].yaw; while (y - p > Math.PI) y -= Math.PI * 2; while (y - p < -Math.PI) y += Math.PI * 2; keys[i].yaw = y; }
  return { keys, pulled };
}

/** The performance a recipe should film: the chosen take's person (a performance, or the performance an angle was shot of), else null. */
export function recipeSubject(shot: PlanShot, takeId?: string | null): CameraTake | null {
  const takes = shot.cameraPath?.takes ?? []; const k = takes.find((x) => x.id === (takeId ?? shot.cameraPath?.chosen)); if (!k?.actor) return null;
  if (isPerformance(k)) return k; return (k.shoot && takes.find((x) => x.id === k.shoot!.of)) || k;
}
/**
 * A recipe as a take (normalised, ready for shot.cameraPath): a camera-only take of the shot, or, when perf is given, a new angle of that
 * performance (the person replays exactly, like a flown angle). No smoothing (the rig is already smooth; a whip must stay sharp) unless the camera
 * had to be pulled in front of a wall, which gets a light touch.
 */
export function recipeTake(shot: PlanShot, rec: TakeRecipe, o: { id: string; index: number; perf?: CameraTake | null; name?: string }): CameraTake | null {
  const R = recipeOf(rec.id); if (!R) return null; const perf = o.perf?.actor ? o.perf : null; const { keys, pulled } = bakeRecipe(shot, rec, perf); const smooth = pulled && rec.id !== 'whip' ? 0.12 : 0;
  if (perf) { const angle = nextAngle(shot.cameraPath?.takes ?? [], perf.id); const st = shootTake(perf, keys, { id: o.id, angle, rate: 1 }); if (!st) return null;
    const t = normalizeTake({ ...st, name: o.name ?? `${perf.name} · ${R.label}`.slice(0, 40), smooth, recipe: rec }, o.index); return t; }
  return normalizeTake({ id: o.id, name: o.name ?? R.label, keys, smooth, trimStart: 0, trimEnd: shot.seconds, speed: 1, recipe: rec }, o.index);
}
/** The take baked again with a new lens / size (same id, name, trim and speed where they still fit). */
export function rebakeTake(shot: PlanShot, take: CameraTake, rec: TakeRecipe): CameraTake | null {
  const perf = take.shoot ? (shot.cameraPath?.takes.find((x) => x.id === take.shoot!.of) ?? (take.actor ? take : null)) : null;
  const next = recipeTake(shot, rec, { id: take.id, index: 0, perf, name: take.name }); if (!next) return null;
  return { ...next, ...(take.shoot && next.shoot ? { shoot: take.shoot } : {}) };
}
