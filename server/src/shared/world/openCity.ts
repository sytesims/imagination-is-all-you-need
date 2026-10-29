/**
 * Open city for Direct a Shot (2026-10-26): the glue between the city's WorldSpec and the shared shot maths (previzTemplates.ts,
 * previzActor.ts). Pure and isomorphic. One fixed map (OPEN_CITY_SEED), built once on first use, so the ground clamp, the person's
 * collisions, the camera's wall check, the traffic and the engine all read the same placement.
 *  - CityWorld.groundAt: terrain, street tiles (road 0, pavement 0.15) and raised surfaces (the pier), whichever is highest.
 *  - clampActor: keeps the person (a 0.3 m circle) out of buildings, props, trees and parked cars, out of the pond and the sea.
 *  - clampCamera / occlude: the camera never ends up inside a box, and the follow camera pulls in when a wall is between it and the person.
 *  - carsAt(t): every ambient car's position and heading at time t (deterministic: the same t, the same traffic).
 * City life (2026-10-27), all pure functions of t so a recording is frame-exact when it seeks:
 *  - signalAt(j, t): the traffic lights at each signalised junction run a fixed 24 s cycle (north–south green, amber, all red, then east–west),
 *    each junction offset by a fixed amount.
 *  - carsAt(t) now stops at red (and amber, when there's room to stop) and queues behind the car in front. It is a small fixed-step
 *    simulation from 90 s before t = 0, so the queues have formed when a shot starts (1/16 s steps, the same arithmetic every time, snapshots kept every second so seeking back is cheap), read out
 *    between two steps, so positions are continuous in t and the same t always gives the same traffic.
 *  - pedsAt(t) / pedsNear(t, …): people walking the pavements round every block (two directions, each on its own side), the park's edge
 *    and its paths; each has a phase, a pace and a rank (the crowd setting shows rank < 0.4 for Some, all for Busy); a few stand about.
 *    They step round lamp posts, signal poles and parked cars (a lateral offset worked out once along each loop).
 * Families (2026-10-27): people walk in small groups: alone, couples side by side, a parent or two with one or two children (drawn
 * smaller), or someone with a dog. A group shares one place on its loop and keeps its spacing (single file when it steps round something);
 * at the corners of a signalised junction it waits together until the lights let its side cross. The wait is worked out event by event
 * from t = 0 (arrive at a corner, wait for the next green), the same arithmetic every time, so every member is still a pure function of t.
 */
import { BoxIndex, collidersOf, type Box, type WorldSpec } from './worldSpec.js';
import { terrainHeight } from './terrain.js';
import { generateCity, tileOf, isRoadTile, TILE_TOP, pathLength, walkLoops, PAVE, carScale } from './cityGen.js';
import { KIT } from './kitCatalog.js';

type V3 = [number, number, number];
export const OPEN_CITY_SEED = 7;
export const CITY_IDS = ['open-city', 'open-city-golden', 'open-city-night'] as const;
export type CityTemplateId = (typeof CITY_IDS)[number];
export const isCityTemplate = (id: string): id is CityTemplateId => (CITY_IDS as readonly string[]).includes(id);
export const ACTOR_RADIUS = 0.3; export const CAM_MARGIN = 0.25;

export type Lamp = 'green' | 'amber' | 'red';
export interface SignalState { ns: Lamp; ew: Lamp }
export interface CarAt { k: string; x: number; y: number; z: number; heading: number; /* drawn at carScale(k) (cityGen.ts) */ /** speed, m/s (0 when queued at a red light) */ v: number }
export interface PedAt { id: number; x: number; y: number; z: number; heading: number; /** walking speed (0: standing) */ v: number; /** distance walked (the stride cycle runs on it) */ d: number; time: number; rank: number; tint: number; dist: number;
  /** the group they walk with (its id; a person alone is a group of one) */ group: number; kind: PedKind; /** drawn size (1 = an adult, about 1.75 m; children 0.55–0.72) */ scale: number; /** standing at a corner, waiting for the lights */ wait: boolean }
export type PedKind = 'adult' | 'child' | 'dog';
/** who walks together: the share of each kind of group (the rest walk alone) */
export const GROUPS = { couple: 0.18, family: 0.17, dog: 0.1 } as const;
/** pedestrians cross only with at least this much green left (seconds), and step off a moment after it turns */
const WALK_LEFT = 2, STEP_OFF = 0.5;
interface Member { id: number; kind: PedKind; along: number; side: number; scale: number; tint: number; /** where they walk when the group closes up into single file */ file: number }
interface Group { id: number; phase: number; pace: number; dir: 1 | -1; rank: number; idle: boolean; members: Member[]; memo: { tau: number; u: number; stop: boolean } | null }
/** Sort a few people into groups (pure; the same seed the walkers use). */
export function groupOf(R: (n: number) => number, h: number, nextId: () => number): { pace: number; idle: boolean; members: Member[] } {
  const r = R(h + 29); const m = (kind: PedKind, along: number, side: number, scale = 1): Member => ({ id: nextId(), kind, along, side, scale, tint: Math.floor(R(h + 41 + along * 7 + side * 13) * 1000), file: 0 });
  const filed = (ms: Member[]) => { const order = [...ms].sort((a, b) => b.along - a.along || a.side - b.side); const mid = ms.reduce((a, x) => a + x.along, 0) / ms.length; order.forEach((x, i) => { x.file = mid + ((order.length - 1) / 2 - i) * 0.7; }); return ms; }; /* single file round the group's middle, in walking order: nobody moves far to get in line */
  if (r < GROUPS.couple) { const idle = R(h + 19) < 0.18; return { pace: 1.0 + R(h + 7) * 0.3, idle, members: filed(idle ? [m('adult', -0.42, 0), m('adult', 0.42, 0)] : [m('adult', 0, -0.32), m('adult', 0, 0.32)]) }; }
  if (r < GROUPS.couple + GROUPS.family) { const two = R(h + 31) < 0.7; const kids = R(h + 37) < 0.5 ? 2 : 1; const out = two ? [m('adult', 0, -0.34), m('adult', 0, 0.34)] : [m('adult', 0, 0.18)];
    out.push(m('child', 0.8, kids === 2 ? -0.28 : -0.12, 0.62 + R(h + 43) * 0.1)); if (kids === 2) out.push(m('child', 0.8, 0.3, 0.55 + R(h + 47) * 0.12));
    return { pace: 1.0 + R(h + 7) * 0.15, idle: false, members: filed(out) }; }
  if (r < GROUPS.couple + GROUPS.family + GROUPS.dog) return { pace: 1.1 + R(h + 7) * 0.3, idle: false, members: filed([m('adult', 0, -0.1), m('dog', 1.25, 0.35, 0.8 + R(h + 53) * 0.45)]) };
  return { pace: 1.05 + R(h + 7) * 0.5, idle: R(h + 19) < 0.12, members: [m('adult', 0, 0)] };
}
/** the lights' cycle (seconds): north–south green, amber, all red, then the same for east–west */
export const SIGNAL = { cycle: 24, green: 9, amber: 2.5 } as const;
/** a junction's lights at time t, given its offset in the cycle (pure) */
export function signalPhase(offset: number, t: number): SignalState {
  let u = (t + offset) % SIGNAL.cycle; if (u < 0) u += SIGNAL.cycle; const half = SIGNAL.cycle / 2;
  const lamp = (x: number): Lamp => (x < SIGNAL.green ? 'green' : x < SIGNAL.green + SIGNAL.amber ? 'amber' : 'red');
  return u < half ? { ns: lamp(u), ew: 'red' } : { ns: 'red', ew: lamp(u - half) };
}
/** the traffic has been running WARM seconds when a shot starts (t = 0), so queues have formed at the lights */
const DT = 1 / 16, SNAP = 16, WARM = 90; const ACCEL = 2.6, BRAKE = 3.2, BRAKE_HARD = 9, CAR_GAP = 7.2, STOP_BACK = 2.8;
/** a closed rectangle with rounded corners, clockwise seen from above */
function roundRect(x0: number, x1: number, z0: number, z1: number, r: number): [number, number][] {
  const out: [number, number][] = []; const arc = (cx: number, cz: number, a0: number) => { for (let s = 0; s <= 4; s++) { const a = a0 + (s / 4) * (Math.PI / 2); out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } };
  arc(x1 - r, z0 + r, -Math.PI / 2); arc(x1 - r, z1 - r, 0); arc(x0 + r, z1 - r, Math.PI / 2); arc(x0 + r, z0 + r, Math.PI); return out;
}

export class CityWorld {
  readonly spec: WorldSpec; readonly boxes: Box[]; readonly index: BoxIndex; private tiles = new Map<number, number>();
  private loops: { pts: [number, number][]; cum: number[]; len: number }[];
  constructor(spec: WorldSpec) {
    this.spec = spec; this.boxes = collidersOf(spec); this.index = new BoxIndex(this.boxes);
    for (const p of spec.pieces) { const kind = KIT[p.k]?.kind; const [i, j] = tileOf(p.x, p.z);
      if (p.k.startsWith('kk.road')) this.tiles.set(i * 1000 + j, TILE_TOP.road);
      else if (p.k === 'kk.base' || (kind === 'building' && p.k.startsWith('kk.'))) this.tiles.set(i * 1000 + j, TILE_TOP.base); }
    this.loops = spec.carLoops.map((l) => { const cum = [0]; for (let k = 0; k < l.pts.length; k++) { const a = l.pts[k], b = l.pts[(k + 1) % l.pts.length]; cum.push(cum[k] + Math.hypot(b[0] - a[0], b[1] - a[1])); } return { pts: l.pts, cum, len: pathLength(l.pts) }; });
    this.junctions = spec.pieces.filter((p) => p.k === 'kk.trafficlight_C').map((p, k) => ({ x: p.x - 4.7, z: p.z - 4.7, offset: (k * 5.3) % SIGNAL.cycle, pole: [p.x, p.z] as [number, number] }));
    this.initTraffic(); this.initWalkers();
  }
  /** the walkable ground under (x, z) */
  groundAt(x: number, z: number): number {
    let y = terrainHeight(this.spec.terrain, x, z); const [i, j] = tileOf(x, z); const t = this.tiles.get(i * 1000 + j); if (t != null) y = Math.max(y, t);
    for (const s of this.spec.surfaces) { const [x0, x1, z0, z1] = s.rect; if (x >= x0 && x <= x1 && z >= z0 && z <= z1) y = Math.max(y, s.y[0] + (s.y[1] - s.y[0]) * ((z - z0) / Math.max(1e-6, z1 - z0))); }
    return y;
  }
  private onSurface(x: number, z: number) { return this.spec.surfaces.some((s) => x >= s.rect[0] && x <= s.rect[1] && z >= s.rect[2] && z <= s.rect[3]); }
  /** Keep a person at (x, z) out of every solid box, the ponds and deep water, inside the map; returns where they stand. */
  clampActor(x: number, z: number, r = ACTOR_RADIUS): V3 {
    const lim = this.spec.half + 30; x = Math.max(-lim, Math.min(lim, x)); z = Math.max(-lim, Math.min(lim, z));
    for (let it = 0; it < 3; it++) { let moved = false;
      for (const k of this.index.near(x - r, x + r, z - r, z + r)) { const b = this.boxes[k]; const px = Math.max(b.x0, Math.min(b.x1, x)), pz = Math.max(b.z0, Math.min(b.z1, z)); const dx = x - px, dz = z - pz; const d = Math.hypot(dx, dz);
        if (d >= r) continue; moved = true;
        if (d > 1e-6) { x = px + (dx / d) * r; z = pz + (dz / d) * r; }
        else { const pen = [x - b.x0, b.x1 - x, z - b.z0, b.z1 - z]; const m = Math.min(...pen); const s = pen.indexOf(m);
          if (s === 0) x = b.x0 - r; else if (s === 1) x = b.x1 + r; else if (s === 2) z = b.z0 - r; else z = b.z1 + r; } }
      for (const [px, pz, pr] of this.spec.ponds) { const dx = x - px, dz = z - pz; const d = Math.hypot(dx, dz); if (d < pr + r) { const k = (pr + r) / (d || 1); x = px + (d ? dx : 1) * k; z = pz + (d ? dz : 0) * k; moved = true; } }
      if (!moved) break; }
    /* no wading out to sea: step back up the beach until the water is shallow (the pier deck is fine) */
    const deep = this.spec.terrain.water - 0.25;
    if (!this.onSurface(x, z) && this.groundAt(x, z) < deep) { let lo = this.spec.terrain.flat[3], hi = z; for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (this.groundAt(x, m) < deep) hi = m; else lo = m; } z = lo; }
    return [x, this.groundAt(x, z), z];
  }
  /** Keep a camera above the ground and the water, and outside every solid box (pushed out through the nearest face or over the roof). */
  clampCamera(p: V3, clearance = 0.15): V3 {
    const lim = this.spec.half + 220; let x = Math.max(-lim, Math.min(lim, p[0])), z = Math.max(-lim, Math.min(lim, p[2]));
    let y = Math.max(this.groundAt(x, z) + clearance, this.spec.terrain.water + clearance, Math.min(600, p[1])); const m = CAM_MARGIN;
    for (const k of this.index.near(x - m, x + m, z - m, z + m)) { const b = this.boxes[k];
      if (x <= b.x0 - m || x >= b.x1 + m || z <= b.z0 - m || z >= b.z1 + m || y >= b.y1 + m) continue;
      const pen = [x - (b.x0 - m), b.x1 + m - x, z - (b.z0 - m), b.z1 + m - z, b.y1 + m - y]; const s = pen.indexOf(Math.min(...pen));
      if (s === 0) x = b.x0 - m; else if (s === 1) x = b.x1 + m; else if (s === 2) z = b.z0 - m; else if (s === 3) z = b.z1 + m; else y = b.y1 + m; }
    return [x, y, z];
  }
  /** The follow camera: if a box stands between the person (from) and the camera (to), bring the camera in front of it. */
  occlude(from: V3, to: V3): V3 {
    const d: V3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]; let tHit = 1; const m = 0.2;
    for (const k of this.index.near(Math.min(from[0], to[0]) - m, Math.max(from[0], to[0]) + m, Math.min(from[2], to[2]) - m, Math.max(from[2], to[2]) + m)) { const b = this.boxes[k];
      let t0 = 0, t1 = tHit; const lo = [b.x0 - m, b.y0, b.z0 - m], hi = [b.x1 + m, b.y1 + m, b.z1 + m]; let hit = true;
      for (let a = 0; a < 3 && hit; a++) { if (Math.abs(d[a]) < 1e-9) { if (from[a] < lo[a] || from[a] > hi[a]) hit = false; continue; }
        let ta = (lo[a] - from[a]) / d[a], tb = (hi[a] - from[a]) / d[a]; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) hit = false; }
      if (hit && t0 > 0 && t0 < tHit) tHit = t0; }
    if (tHit >= 1) return to; const k = Math.max(0.12, tHit - 0.04); return [from[0] + d[0] * k, from[1] + d[1] * k, from[2] + d[2] * k];
  }
  /** every ambient car at time t: kit id, position (on the road surface), heading (radians; the car's +z points along it) and speed (m/s) */
  carsAt(t: number): CarAt[] {
    const out: CarAt[] = []; const u = (Math.max(0, t) + WARM) / DT; const k = Math.floor(u); const f = u - k; const A = this.stateAt(k), B = this.stateAt(k + 1); const n = this.tc.n;
    this.spec.carLoops.forEach((l, li) => { const L = this.loops[li]; l.cars.forEach((c, ci) => { const i = this.tc.base[li] + ci;
      let ds = B[i] - A[i]; if (ds < -L.len / 2) ds += L.len; let s = (A[i] + ds * f) % L.len; if (s < 0) s += L.len;
      const [x, z, heading] = this.onLoop(L, s); const kit = KIT[c.k]; out.push({ k: c.k, x, y: -(kit?.y0 ?? 0) * carScale(c.k), z, heading, v: A[n + i] + (B[n + i] - A[n + i]) * f }); }); });
    return out;
  }
  private onLoop(L: { pts: [number, number][]; cum: number[] }, s: number): [number, number, number] {
    let lo = 0, hi = L.cum.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (L.cum[mid] <= s) lo = mid; else hi = mid; }
    const a = L.pts[lo], b = L.pts[(lo + 1) % L.pts.length]; const seg = L.cum[lo + 1] - L.cum[lo] || 1; const k = (s - L.cum[lo]) / seg;
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, Math.atan2(b[0] - a[0], b[1] - a[1])];
  }

  // ---- traffic lights ----
  /** the signalised junctions (centre, cycle offset, where the pole stands) */
  readonly junctions!: { x: number; z: number; offset: number; pole: [number, number] }[];
  /** junction j's lights at time t: for traffic driving north–south and east–west */
  signalAt(j: number, t: number): SignalState { const J = this.junctions[j]; return signalPhase(J ? J.offset : 0, t + WARM); }
  /** junction j's own clock at scene time t (seconds, not wrapped): its lights read it mod SIGNAL.cycle (u < 9: north–south green). Explore's Mossbun keeps time with it. */
  signalClock(j: number, t: number): number { return t + WARM + (this.junctions[j]?.offset ?? 0); }

  // ---- traffic: a fixed-step simulation from t = 0, read out between steps ----
  private tc!: { n: number; base: number[]; loop: Int32Array; leader: Int32Array; vmax: Float64Array; stops: { s: number; j: number; ns: boolean }[][]; snaps: Float64Array[]; cur: { k: number; st: Float64Array; prev: Float64Array | null } };
  private initTraffic() {
    const base: number[] = []; let n = 0; for (const l of this.spec.carLoops) { base.push(n); n += l.cars.length; }
    const loop = new Int32Array(n), leader = new Int32Array(n).fill(-1), vmax = new Float64Array(n); const st = new Float64Array(2 * n);
    this.spec.carLoops.forEach((l, li) => { const L = this.loops[li]; const ids = l.cars.map((_, ci) => base[li] + ci);
      l.cars.forEach((c, ci) => { const i = base[li] + ci; loop[i] = li; vmax[i] = c.speed; st[i] = ((c.phase * L.len) % L.len + L.len) % L.len; st[n + i] = c.speed; });
      const order = [...ids].sort((p, q) => st[p] - st[q] || p - q); if (order.length > 1) order.forEach((i, k) => { leader[i] = order[(k + 1) % order.length]; }); });
    /* stop lines: where a loop drives into a signalised junction's square, a car-half back from its edge */
    const stops = this.loops.map((L) => { const list: { s: number; j: number; ns: boolean }[] = [];
      this.junctions.forEach((J, j) => { const inside = (x: number, z: number) => Math.abs(x - J.x) < 5 && Math.abs(z - J.z) < 5; let prevIn = true;
        for (let s = 0; s <= L.len; s += 0.25) { const [x, z, h] = this.onLoop(L, Math.min(s, L.len - 1e-6)); const now = inside(x, z);
          if (s > 0 && now && !prevIn) list.push({ s: ((s - STOP_BACK) % L.len + L.len) % L.len, j, ns: Math.abs(Math.cos(h)) > Math.abs(Math.sin(h)) }); prevIn = now; } });
      return list; });
    this.tc = { n, base, loop, leader, vmax, stops, snaps: [st], cur: { k: 0, st, prev: null } };
  }
  /** one step of the traffic from step k (time k·DT) to k + 1: speed up to the loop's speed, keep a gap to the car in front, stop at red */
  private advance(st: Float64Array, k: number): Float64Array {
    const { n, loop, leader, vmax, stops } = this.tc; const t = k * DT; const lamps = this.junctions.map((J) => signalPhase(J.offset, t)); const out = new Float64Array(2 * n);
    for (let i = 0; i < n; i++) { const L = this.loops[loop[i]]; const s = st[i], v = st[n + i]; let free = Infinity;
      const ld = leader[i]; if (ld >= 0) { let gap = (st[ld] - s) % L.len; if (gap < 0) gap += L.len; free = gap - CAR_GAP; }
      for (const sp of stops[loop[i]]) { let d = (sp.s - s) % L.len; if (d < 0) d += L.len; if (d > L.len - 1e-6) d = 0; if (d > 70) continue;
        const lamp = sp.ns ? lamps[sp.j].ns : lamps[sp.j].ew; if (lamp === 'green') continue;
        /* amber: stop if there's room to stop comfortably, else go on; red: stop unless it's already too late to (only at t = 0) */
        const tooLate = v > 3 && d < (v * v) / (2 * (lamp === 'red' ? BRAKE_HARD : BRAKE)); if (!tooLate) free = Math.min(free, d); }
      const vNew = Math.max(0, Math.min(vmax[i], v + ACCEL * DT, Math.sqrt(2 * BRAKE * Math.max(0, free)))); const ds = Math.min(vNew * DT, Math.max(0, free));
      out[i] = (s + ds) % L.len; out[n + i] = ds / DT; }
    return out;
  }
  /** the traffic's state at step k (from the nearest snapshot or the last step read; the same numbers whichever way it gets there) */
  private stateAt(k: number): Float64Array {
    const tc = this.tc; if (k === tc.cur.k) return tc.cur.st; if (k === tc.cur.k - 1 && tc.cur.prev) return tc.cur.prev;
    let j: number, st: Float64Array; const snap = Math.min(tc.snaps.length - 1, Math.floor(k / SNAP));
    if (tc.cur.k < k && tc.cur.k >= snap * SNAP) { j = tc.cur.k; st = tc.cur.st; } else { j = snap * SNAP; st = tc.snaps[snap]; }
    let prev: Float64Array | null = null; while (j < k) { prev = st; st = this.advance(st, j); j++; if (j % SNAP === 0 && tc.snaps.length === j / SNAP) tc.snaps.push(st); }
    tc.cur = { k, st, prev }; return st;
  }

  // ---- people on the pavements ----
  private walk!: { id: string; pts: [number, number][]; cum: number[]; len: number; side: Float32Array; box: [number, number, number, number]; people: Group[];
    /** the corners of signalised junctions on this loop, as walked: where to stop (loop distance), which junction, which way the lights must let them go */ waits: { s: number; j: number; ns: boolean }[] }[];
  private initWalkers() {
    const R = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }; let id = 0, mid = 0; this.walk = []; const nextId = () => mid++;
    for (const W of walkLoops()) { const [x0, x1, z0, z1] = W.rect;
      const lanes: { off: number; dir: 1 | -1 }[] = W.kind === 'kerb' ? [{ off: PAVE.out, dir: 1 }, { off: PAVE.in, dir: -1 }] : [{ off: 0, dir: 1 }];
      for (const ln of lanes) { const r = W.kind === 'kerb' ? 1.6 : 0.9;
        const pts = roundRect(x0 + ln.off, x1 - ln.off, z0 + ln.off, z1 - ln.off, r); /* clockwise seen from above (x right, z down): N edge east, E edge south… */
        const cum = [0]; for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[(k + 1) % pts.length]; cum.push(cum[k] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
        const len = cum[cum.length - 1]; const L = { pts, cum, len };
        /* sidestep: every 0.5 m, the nearest lateral offset (towards the kerb or the wall) that clears every solid box by a body width, then smoothed */
        const N = Math.ceil(len / 0.5); const raw = new Float32Array(N); const tries = [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1, -1, 1.3];
        for (let q = 0; q < N; q++) { const [x, z, h] = this.onLoop(L, (q * len) / N); const nx = Math.cos(h), nz = -Math.sin(h); /* the walker's right */
          let best = 0; for (const o of tries) { if (this.clearAt(x + nx * o, z + nz * o, 0.32)) { best = o; break; } if (o === tries[tries.length - 1]) best = 0; } raw[q] = best; }
        const side = new Float32Array(N); for (let q = 0; q < N; q++) { let m = raw[q]; for (let w = -4; w <= 4; w++) { const v = raw[(q + w + N) % N]; if (Math.abs(v) > Math.abs(m)) m = v; } side[q] = m; }
        const sm = new Float32Array(N); for (let q = 0; q < N; q++) { let a = 0; for (let w = -3; w <= 3; w++) a += side[(q + w + N) % N]; sm[q] = a / 7; }
        const count = Math.max(1, Math.round(len / (W.kind === 'kerb' ? 19 : 22))); const people: Group[] = [];
        for (let p = 0; p < count; p++) { const h = id * 1.618 + p; const gr = groupOf(R, h, nextId); people.push({ id, phase: (p + R(h) * 0.7) / count, pace: gr.pace, dir: ln.dir, rank: R(h + 13), idle: gr.idle, members: gr.members, memo: null }); id++; }
        /* the corners at signalised junctions (the rect's corners are the street crossings): stop just before the corner's curve, facing the crossing */
        const waits: { s: number; j: number; ns: boolean }[] = []; if (W.kind === 'kerb') { const corner = [[x1, z0], [x1, z1], [x0, z1], [x0, z0]];
          corner.forEach(([cx0, cz0], k) => { const j = this.junctions.findIndex((J) => Math.hypot(J.x - cx0, J.z - cz0) < 3); if (j < 0) return; const a0 = k * 5, a1 = k * 5 + 4;
            const before = ln.dir > 0 ? pts[(a0 - 1 + pts.length) % pts.length] : pts[(a1 + 1) % pts.length], at = ln.dir > 0 ? pts[a0] : pts[a1]; const h = Math.atan2(at[0] - before[0], at[1] - before[1]);
            waits.push({ s: ln.dir > 0 ? (cum[a0] - 0.35 + len) % len : (cum[a1] + 0.35) % len, j, ns: Math.abs(Math.cos(h)) > Math.abs(Math.sin(h)) }); }); }
        this.walk.push({ id: `${W.id}${ln.dir > 0 ? '' : '-back'}`, pts, cum, len, side: sm, box: [Math.min(x0, x1) - 2, Math.max(x0, x1) + 2, Math.min(z0, z1) - 2, Math.max(z0, z1) + 2], people, waits }); } }
  }
  /** where a person stands: the ground, or the kerb top (4.5–5 m from a street's centre, on the side away from the road) */
  footAt(x: number, z: number): number { const [i, j] = tileOf(x, z); const y = this.groundAt(x, z); if (!isRoadTile(i, j)) return y;
    const lx = x - (this.spec.grid.x0 + (i + 0.5) * this.spec.tile), lz = z - (this.spec.grid.z0 + (j + 0.5) * this.spec.tile);
    const kerb = (Math.abs(lx) >= 4.5 && !isRoadTile(i + Math.sign(lx), j)) || (Math.abs(lz) >= 4.5 && !isRoadTile(i, j + Math.sign(lz))); return kerb ? Math.max(y, TILE_TOP.base) : y; }
  private clearAt(x: number, z: number, r: number) { for (const k of this.index.near(x - r, x + r, z - r, z + r)) { const b = this.boxes[k]; if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return false; } return true; }
  /** how many people walk the city (Busy shows them all, Some about two in five) */
  get peopleCount() { return this.walk.reduce((n, w) => n + w.people.reduce((m, g) => m + g.members.length, 0), 0); }
  /** how many groups walk the city (a person alone counts as one) */
  get groupCount() { return this.walk.reduce((n, w) => n + w.people.length, 0); }
  /** When a group stands at a waiting corner at time tau: the first moment from then on it may cross (pure in tau). */
  private greenFrom(wp: { j: number; ns: boolean }, tau: number): number { const J = this.junctions[wp.j]; const C = SIGNAL.cycle;
    let u = (tau + WARM + J.offset) % C; if (u < 0) u += C; const open = wp.ns ? 0 : C / 2; const close = open + SIGNAL.green - WALK_LEFT;
    if (u >= open && u < close) return tau; const wait = (u < open ? open - u : C - u + open); return tau + wait + STEP_OFF; }
  private waitsAt(W: (typeof this.walk)[number], k: number, ta: number) { return this.greenFrom(W.waits[k], ta) > ta; }
  /** how far a group has walked by t, and whether it is standing at a corner (event by event from t = 0; memo = the last event before t) */
  private walked(W: (typeof this.walk)[number], g: Group, t: number): { u: number; v: number; wait?: boolean } {
    if (g.idle || t <= 0) return { u: 0, v: g.idle ? 0 : g.pace }; const L = W.len; const v = g.pace; const start = g.phase * L;
    let tau = 0, u = 0, stop = false; if (g.memo && g.memo.tau <= t) { tau = g.memo.tau; u = g.memo.u; stop = g.memo.stop; }
    const ramp = (x: number) => Math.max(0, Math.min(1, x / 0.35));
    for (let it = 0; it < 4000; it++) { const s = ((start + g.dir * u) % L + L) % L; let best = Infinity, bw = -1;
      for (let k = 0; k < W.waits.length; k++) { let d = g.dir > 0 ? W.waits[k].s - s : s - W.waits[k].s; d = ((d % L) + L) % L; if (d < 1e-6) d += L; if (d < best) { best = d; bw = k; } }
      if (bw < 0) return { u: u + v * (t - tau), v };
      /* the walk cycle eases out as they reach the kerb and in as they set off (only the legs: the place stays linear in t) */
      const ta = tau + best / v; if (ta >= t) return { u: u + v * (t - tau), v: v * Math.min(this.waitsAt(W, bw, ta) ? ramp(ta - t) : 1, stop ? ramp(t - tau) : 1) };
      const tg = this.greenFrom(W.waits[bw], ta); if (tg >= t) { g.memo = { tau, u, stop }; return { u: u + best, v: 0, wait: true }; }
      u += best; stop = tg > ta; tau = tg; g.memo = { tau, u, stop }; }
    return { u: u + v * (t - tau), v }; }
  /** every person on the pavements at time t (in id order) */
  pedsAt(t: number): PedAt[] { return this.pedsNear(t, 0, 0, Infinity).sort((a, b) => a.id - b.id); }
  /** the people within r metres of (x, z) at time t, rank below maxRank (1 = everyone), nearest first, at most max */
  pedsNear(t: number, x: number, z: number, r: number, maxRank = 1, max = Infinity): PedAt[] {
    const out: PedAt[] = [];
    for (const W of this.walk) { const [bx0, bx1, bz0, bz1] = W.box; if (x < bx0 - r || x > bx1 + r || z < bz0 - r || z > bz1 + r) continue; const N = W.side.length;
      for (const g of W.people) { if (g.rank >= maxRank) continue; const { u, v, wait } = this.walked(W, g, t); const walked = g.idle ? 0 : u; const s0 = g.phase * W.len + g.dir * walked;
        g.members.forEach((m, mi) => {
          /* the sidestep at the group's place: they close up into single file while it lasts */
          const sq = (q0s: number) => { const q = (((q0s % W.len) + W.len) % W.len / W.len) * N; const q0 = Math.floor(q) % N, q1 = (q0 + 1) % N; return W.side[q0] + (W.side[q1] - W.side[q0]) * (q - Math.floor(q)); };
          const og = sq(s0); const k = Math.max(0, Math.min(1, 1 - Math.abs(og) * 1.8)); const along = m.along + (m.file - m.along) * (1 - k);
          let s = (s0 + g.dir * along) % W.len; if (s < 0) s += W.len;
          /* the heading from a short chord round s (continuous through the rounded corners, so the sidestep never jumps) */
          const [px0, pz0] = this.onLoop(W, s); const [ax, az] = this.onLoop(W, (s - 0.6 + W.len) % W.len), [bx, bz] = this.onLoop(W, (s + 0.6) % W.len); const h0 = Math.atan2(bx - ax, bz - az);
          const o = sq(s) + m.side * k * g.dir; const nx = Math.cos(h0), nz = -Math.sin(h0); const px = px0 + nx * o, pz = pz0 + nz * o; const d = Math.hypot(px - x, pz - z); if (d > r) return;
          const heading = g.idle ? (g.members.length > 1 ? h0 + (mi === 0 ? 0 : Math.PI) /* a couple chatting, face to face */ : h0 + (g.id % 2 ? Math.PI / 2 : -Math.PI / 2)) : g.dir > 0 ? h0 : h0 + Math.PI;
          out.push({ id: m.id, x: px, y: this.footAt(px, pz), z: pz, heading, v: g.idle ? 0 : v, d: walked + g.phase * W.len, time: t + g.phase * 7 + mi * 1.3, rank: g.rank, tint: m.tint, dist: d, group: g.id, kind: m.kind, scale: m.scale, wait: !!wait }); }); } }
    out.sort((a, b) => a.dist - b.dist || a.id - b.id); return out.length > max ? out.slice(0, max) : out;
  }
}

let cached: CityWorld | null = null;
/** The map Direct a Shot uses (generated once, on first use). */
export function openCityWorld(): CityWorld { cached ??= new CityWorld(generateCity({ seed: OPEN_CITY_SEED })); return cached; }
export const cityDistricts = () => openCityWorld().spec.districts;
/** where a district's spawn puts the person and a camera a few metres behind them, looking the same way */
export function districtSpawn(id: string): { actor: V3; heading: number; cam: V3; yaw: number; pitch: number } {
  const w = openCityWorld(); const d = w.spec.districts.find((x) => x.id === id) ?? w.spec.districts[0]; const [x, z] = d.spawn.pos; const h = d.spawn.heading;
  const actor = w.clampActor(x, z); const fx = Math.sin(h), fz = Math.cos(h); const cam = w.clampCamera([x - fx * 6, actor[1] + 2.6, z - fz * 6]);
  return { actor, heading: h, cam, yaw: h + Math.PI, pitch: -0.12 };
}
