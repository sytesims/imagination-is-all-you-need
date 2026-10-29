/**
 * Direct a Shot, Play the actor (2026-10-26): the third-person half of the game-style "Fly it yourself" mode. Pure and isomorphic, like
 * previzTemplates.ts (no three.js, no DOM), so the live player, the recorder, the Render prompt and the tests all read the same numbers.
 *  - ActorTrack: what a take keeps of the person you played: where they were at every moment (keys at TAKE_HZ: position, heading, speed,
 *    distance walked) and the beats (walk / run / stand, and the acting beats wave, dance, sit, jump, point) with optional notes.
 *  - actorAt(track, u): the pose at take time u; actorStep: one frame of GTA-style control (WASD relative to the camera, Shift runs);
 *    followCamera: the over-the-shoulder camera that orbits with the mouse.
 *  - actionPromptFor(shot): the beats as one line for the Render prompt ("0–2 s walks nervously, 3 s waves and laughs").
 *  - readPad: a browser Gamepad snapshot → the same inputs the keyboard gives (left stick moves, right stick looks, triggers, buttons).
 *  - Perform, then shoot: a take you played is a performance; perfStep replays it on its own clock (any rate, slow motion included) while you
 *    fly a camera, and shootTake turns that camera into an angle of the performance that replays the person exactly (same track, same clock).
 * The figure is Quaternius' Universal Animation Library mannequin (CC0), shipped in web/public/models/mannequin.
 */
import { isCityTemplate, openCityWorld, districtSpawn } from './world/openCity.js';
import { isRide, rideOf } from './previzVehicle.js';
import { starOf } from './previzModels.js';
import { chosenTake, clampCamera, groundAt, lookDir, resampleKeys, takeTimeAt, PITCH_MAX, TAKE_HZ, TAKE_MAX_SECONDS, TAKE_SMOOTH_DEFAULT, type CameraKey, type CameraPose, type CameraTake, type PlanShot, type PrevizTemplateId, type Vec3 } from './previzTemplates.js';

export type ActorAction = 'wave' | 'run' | 'dance' | 'sit' | 'jump' | 'point';
/** an acting beat that plays a clip once (run is a way of moving, so it is not one) */
export type ActorOneShot = Exclude<ActorAction, 'run'>;
export type ActorMoveKind = 'walk' | 'run' | 'stand';
export type BeatKind = ActorOneShot | ActorMoveKind;
/** One moment of the person: t (take seconds), where they stand (the floor under them), the way they face (radians, 0 faces +z, positive turns
 *  left), how fast they move (m/s) and how far they have walked so far (drives the walk cycle, so the feet match the ground). */
export interface ActorKey { t: number; pos: Vec3; heading: number; v: number; d: number }
export interface ActorBeat { t: number; kind: BeatKind; note?: string }
/** Drive mode (2026-10-27, previzVehicle.ts): the car that came with the take. car = its kit id; spans = when the person was at the wheel
 *  (take seconds; while inside, the keys are the car's pose: pos, heading, speed, distance driven); park = where the car stood when the
 *  take started (x, y, z, heading). Before the first span the car stands at park; after a span, where that drive ended. */
export interface ActorRide { car: string; spans: [number, number][]; park: [number, number, number, number] }
export interface ActorTrack { keys: ActorKey[]; beats: ActorBeat[]; ride?: ActorRide }
/** The car at one moment, for the engine: kit id, pose, speed, distance driven (wheel spin), the front wheels' angle (positive = right) and
 *  whether the person is at the wheel (then the person isn't drawn). */
export interface RidePose { k: string; pos: Vec3; heading: number; v: number; d: number; steer: number; inside: boolean; /** m/s² along the car (body pitch: the nose dips under braking or a hit) */ acc?: number }
/** The figure's pose at one moment: what the engine draws. beat = the acting beat playing now and how far into it (seconds). */
export interface ActorPose { pos: Vec3; heading: number; v: number; d: number; time: number; beat: { kind: ActorOneShot; local: number } | null; car?: RidePose | null;
  /** 0…1: the person fading into the car as they get in, and out of it as they get out (1 or absent = fully there) */ fade?: number }

/** The six action keys (1–6) in the order the HUD shows them. seconds: how long the beat plays (0 for run, which is a toggle). */
export const ACTOR_ACTIONS: { id: ActorAction; key: string; label: string; verb: string; seconds: number; pad: string }[] = [
  { id: 'wave', key: '1', label: 'Wave', verb: 'waves', seconds: 2.2, pad: 'X' },
  { id: 'run', key: '2', label: 'Run', verb: 'runs', seconds: 0, pad: 'LS' },
  { id: 'dance', key: '3', label: 'Dance', verb: 'dances', seconds: 4, pad: '↑' },
  { id: 'sit', key: '4', label: 'Sit', verb: 'sits down', seconds: 4.5, pad: '↓' },
  { id: 'jump', key: '5', label: 'Jump', verb: 'jumps', seconds: 1.6, pad: 'Y' },
  { id: 'point', key: '6', label: 'Point', verb: 'points ahead', seconds: 2, pad: '←' },
];
export const actorAction = (id: string) => ACTOR_ACTIONS.find((a) => a.id === id) ?? null;
const MOVE_VERB: Record<ActorMoveKind, string> = { walk: 'walks', run: 'runs', stand: 'stands still' };
export const beatSeconds = (k: BeatKind) => (k === 'walk' || k === 'run' || k === 'stand' ? 0 : actorAction(k)?.seconds ?? 0);
export const isOneShot = (k: string): k is ActorOneShot => k === 'wave' || k === 'dance' || k === 'sit' || k === 'jump' || k === 'point';
const BEAT_KINDS: BeatKind[] = ['walk', 'run', 'stand', 'wave', 'dance', 'sit', 'jump', 'point'];

/** Walking and running speeds (m/s), and the distance one cycle of each clip covers (metres), so the feet keep step with the ground. */
export const ACTOR_WALK = 1.25; export const ACTOR_RUN = 3.6;
export const STRIDE = { walk: 1.3, jog: 2.6, sprint: 3.4 } as const;
/** Speeds that count as moving / running when the beats are read back from a take (with a little hysteresis). */
const MOVE_ON = 0.35, RUN_ON = 2.3, BEAT_MIN = 0.45;
/** Beats that hold the figure in place while they play (you can't walk while sitting or dancing). */
export const PINNED: ReadonlySet<BeatKind> = new Set<BeatKind>(['sit', 'dance']);
/** How many beats a take keeps; how long a note can be. */
export const BEAT_MAX = 40; export const NOTE_MAX = 60;

/** Presets with a person-sized world to walk around in (the diorama and the establishing hills are miniatures). */
export const actorAllowed = (tpl: PrevizTemplateId) => tpl === 'walk-by' || tpl === 'walkthrough' || tpl === 'product-hero' || isCityTemplate(tpl);
/** Where the person can walk in each preset (x0, x1, z0, z1, metres): the street's pavement and road, inside the house, the studio floor. */
const AREA: Partial<Record<PrevizTemplateId, [number, number, number, number]>> = { 'walk-by': [-26, 26, -2.1, 3.5], walkthrough: [-2.15, 2.15, -10.6, 2.8], 'product-hero': [-5, 5, -3.6, 4] };
/** Keep a position inside its preset's walkable area, standing on the floor. */
export function clampActor(tpl: PrevizTemplateId, x: number, z: number): Vec3 {
  if (isCityTemplate(tpl)) return openCityWorld().clampActor(x, z); /* the open city: around buildings, cars and trees, on the ground */
  const a = AREA[tpl] ?? [-20, 20, -20, 20]; let cx = Math.max(a[0], Math.min(a[1], x)); let cz = Math.max(a[2], Math.min(a[3], z));
  if (tpl === 'product-hero' && Math.hypot(cx, cz) < 0.85) { const r = Math.hypot(cx, cz) || 1; cx = (cx / r) * 0.85; cz = (cz / r) * 0.85; } /* not through the pedestal */
  return [cx, groundAt(tpl, cx, cz), cz];
}
/** Where the person starts in a preset: the walk-by figure's first step, the hall, beside the pedestal. Faces the way the scene suggests. */
export function actorStart(shot: PlanShot): { pos: Vec3; heading: number } {
  const st = starOf(shot); if (st && actorAllowed(shot.template)) return { pos: clampActor(shot.template, st.x, st.z), heading: st.r }; /* your model playing the actor starts where it stands */
  if (isCityTemplate(shot.template)) { const sp = districtSpawn(shot.template === 'open-city-golden' ? 'beach' : shot.template === 'open-city-night' ? 'downtown' : 'park'); return { pos: sp.actor, heading: sp.heading }; }
  if (shot.template === 'walk-by') { const run = Math.min(6.4, 1.3 * shot.seconds); return { pos: clampActor('walk-by', -run / 2 + (shot.place?.aim?.[0] ?? 0), shot.place?.aim?.[1] ?? 0), heading: Math.PI / 2 }; }
  if (shot.template === 'walkthrough') return { pos: clampActor('walkthrough', 0, 1.6), heading: Math.PI };
  return { pos: clampActor(shot.template, -1.6, 0.9), heading: Math.PI / 2 };
}

// ---------- the track ----------
/* || 0: never -0 (JSON writes it as 0, so a saved shot would not read back equal) */ const r3 = (x: number) => Math.round(x * 1000) / 1000 || 0; const r4 = (x: number) => Math.round(x * 10000) / 10000 || 0;
const num = (x: unknown, lo: number, hi: number, d: number) => { const n = Number(x); return x == null || x === '' || !Number.isFinite(n) ? d : Math.min(hi, Math.max(lo, n)); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** A note as the prompt reads it: one line, no brackets or quotes that could break the prompt, at most NOTE_MAX characters. */
export const cleanNote = (s: unknown) => (typeof s === 'string' ? s.replace(/[\r\n\t]+/g, ' ').replace(/["<>{}[\]]/g, '').replace(/\s{2,}/g, ' ').trim().slice(0, NOTE_MAX) : '');
/** Any input (a saved shot, an agent's JSON) → a clean track, keys sorted from t = 0, at most TAKE_MAX_SECONDS; fewer than two keys → null. */
export function normalizeActor(raw: unknown): ActorTrack | null {
  if (!raw || typeof raw !== 'object') return null; const r = raw as Record<string, unknown>; if (!Array.isArray(r.keys)) return null;
  const ks: ActorKey[] = [];
  for (const k of r.keys.slice(0, 20000)) { if (!k || typeof k !== 'object') continue; const o = k as Record<string, unknown>; const p = Array.isArray(o.pos) ? o.pos.map(Number) : [];
    const t = Number(o.t); if (o.t == null || !Number.isFinite(t) || p.length !== 3 || !p.every(Number.isFinite)) continue;
    ks.push({ t, pos: [num(p[0], -650, 650, 0), num(p[1], -10, 80, 0), num(p[2], -650, 650, 0)], heading: num(o.heading, -1e4, 1e4, 0), v: num(o.v, 0, 20, 0), d: num(o.d, 0, 1e5, 0) }); }
  ks.sort((a, b) => a.t - b.t); if (ks.length < 2) return null; const t0 = ks[0].t; let out: ActorKey[] = [];
  for (const k of ks) { const t = k.t - t0; if (t > TAKE_MAX_SECONDS + 1e-9) break; if (out.length && t - out[out.length - 1].t < 1e-4) continue; out.push({ ...k, t }); }
  if (out.length < 2) return null;
  const cap = Math.round(TAKE_MAX_SECONDS * TAKE_HZ) + 1; if (out.length > cap) { const src = out; const step = (src.length - 1) / (cap - 1); out = Array.from({ length: cap }, (_, i) => src[Math.round(i * step)]); }
  for (let i = 1; i < out.length; i++) { let h = out[i].heading; const p = out[i - 1].heading; while (h - p > Math.PI) h -= Math.PI * 2; while (h - p < -Math.PI) h += Math.PI * 2; out[i] = { ...out[i], heading: h, d: Math.max(out[i].d, out[i - 1].d) }; }
  const len = out[out.length - 1].t; const beats: ActorBeat[] = [];
  for (const b of Array.isArray(r.beats) ? r.beats.slice(0, BEAT_MAX * 4) : []) { if (!b || typeof b !== 'object') continue; const o = b as Record<string, unknown>;
    const kind = BEAT_KINDS.includes(o.kind as BeatKind) ? (o.kind as BeatKind) : null; const t = Number(o.t); if (!kind || o.t == null || !Number.isFinite(t)) continue;
    const note = cleanNote(o.note); beats.push({ t: r3(Math.max(0, Math.min(len, t - t0))), kind, ...(note ? { note } : {}) }); if (beats.length >= BEAT_MAX) break; }
  beats.sort((a, b) => a.t - b.t);
  const ride = normalizeRide(r.ride, t0, len);
  return { keys: out.map((k) => ({ t: r4(k.t), pos: [r3(k.pos[0]), r3(k.pos[1]), r3(k.pos[2])], heading: r4(k.heading), v: r3(k.v), d: r3(k.d) })), beats, ...(ride ? { ride } : {}) };
}
/** How many drives one take keeps. */
export const RIDE_SPANS_MAX = 24;
/** A take's car (any input) → a clean ride: a known car, spans sorted, merged, inside the take (shifted by t0 like the keys), park finite. */
export function normalizeRide(raw: unknown, t0: number, len: number): ActorRide | null {
  if (!raw || typeof raw !== 'object') return null; const o = raw as Record<string, unknown>; if (!isRide(o.car)) return null;
  const pk = Array.isArray(o.park) ? o.park.map(Number) : []; if (pk.length !== 4 || !pk.every(Number.isFinite)) return null;
  const sp: [number, number][] = [];
  for (const s of Array.isArray(o.spans) ? o.spans.slice(0, RIDE_SPANS_MAX * 4) : []) { if (!Array.isArray(s) || s.length !== 2) continue; const a = Number(s[0]) - t0, b = Number(s[1]) - t0;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue; const lo = Math.max(0, Math.min(len, Math.min(a, b))), hi = Math.max(0, Math.min(len, Math.max(a, b))); if (hi - lo < 1e-3) continue; sp.push([lo, hi]); }
  sp.sort((a, b) => a[0] - b[0]); const spans: [number, number][] = [];
  for (const s of sp) { const last = spans[spans.length - 1]; if (last && s[0] <= last[1] + 1e-3) last[1] = Math.max(last[1], s[1]); else spans.push([s[0], s[1]]); }
  return { car: o.car, spans: spans.slice(0, RIDE_SPANS_MAX).map(([a, b]) => [r4(a), r4(b)] as [number, number]), park: [num(pk[0], -650, 650, 0), num(pk[1], -10, 80, 0), num(pk[2], -650, 650, 0), r4(num(pk[3], -1e4, 1e4, 0))].map((x, i) => (i < 3 ? r3(x) : x)) as [number, number, number, number] };
}
/** the drive (index into ride.spans) under take time t, or −1 */
export const spanAt = (ride: ActorRide | undefined, t: number) => (ride ? ride.spans.findIndex(([a, b]) => t >= a && t <= b) : -1);
/** Recorded actor states (one per screen frame, uneven) → keys at an even TAKE_HZ (heading unwrapped first), like resampleKeys for the camera. */
export function resampleActor(raw: ActorKey[], hz = TAKE_HZ): ActorKey[] {
  const src = [...raw].filter((k) => Number.isFinite(k.t)).sort((a, b) => a.t - b.t); if (src.length < 2) return src.map((k) => ({ ...k, t: 0 }));
  const t0 = src[0].t; const ks: ActorKey[] = [];
  for (const k of src) { const t = k.t - t0; if (ks.length && t - ks[ks.length - 1].t < 1e-6) continue; let h = k.heading; if (ks.length) { const p = ks[ks.length - 1].heading; while (h - p > Math.PI) h -= Math.PI * 2; while (h - p < -Math.PI) h += Math.PI * 2; } ks.push({ ...k, t, heading: h }); }
  if (ks.length < 2) return ks; const len = ks[ks.length - 1].t; const n = Math.max(1, Math.round(len * hz)); const out: ActorKey[] = []; let j = 0;
  for (let i = 0; i <= n; i++) { const t = Math.min(len, i / hz); while (j < ks.length - 2 && ks[j + 1].t < t) j++; const a = ks[j], b = ks[j + 1]; const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    out.push({ t, pos: [lerp(a.pos[0], b.pos[0], k), lerp(a.pos[1], b.pos[1], k), lerp(a.pos[2], b.pos[2], k)], heading: lerp(a.heading, b.heading, k), v: lerp(a.v, b.v, k), d: lerp(a.d, b.d, k) }); }
  return out;
}
/** The way the person moves through the take, read back from the keys as beats: walk / run / stand, each held at least BEAT_MIN seconds
 *  (no flicker when the speed hovers near a threshold). */
export function moveBeats(keys: ActorKey[]): ActorBeat[] {
  if (!keys.length) return []; const kindAt = (v: number, prev: ActorMoveKind): ActorMoveKind => {
    if (prev === 'run') return v > RUN_ON * 0.8 ? 'run' : v > MOVE_ON ? 'walk' : 'stand';
    if (prev === 'walk') return v > RUN_ON ? 'run' : v > MOVE_ON * 0.6 ? 'walk' : 'stand';
    return v > RUN_ON ? 'run' : v > MOVE_ON ? 'walk' : 'stand'; };
  const out: ActorBeat[] = []; let cur: ActorMoveKind = kindAt(keys[0].v, 'stand'); let cand: ActorMoveKind = cur; let since = 0; out.push({ t: 0, kind: cur });
  for (const k of keys) { const want = kindAt(k.v, cur); if (want === cur) { cand = cur; continue; } if (want !== cand) { cand = want; since = k.t; }
    if (k.t - since >= BEAT_MIN) { cur = cand; out.push({ t: r3(since), kind: cur }); } }
  /* a run beat made with the key (2) or Shift that never reached running speed reads as a walk: the speeds are the truth */
  const res = out.filter((b, i) => i === 0 || b.kind !== out[i - 1].kind);
  /* a take that starts by setting off: the moment of standing before the first step is not a beat of its own */
  if (res.length > 1 && res[1].t < BEAT_MIN * 2) { res.shift(); res[0] = { ...res[0], t: 0 }; }
  return res;
}
/** The move beats and the acting beats in one list, sorted, the notes of beats with the same kind and time kept. */
export function mergeBeats(...lists: ActorBeat[][]): ActorBeat[] {
  const all = lists.flat().filter((b) => b && Number.isFinite(b.t)).sort((a, b) => a.t - b.t || (isOneShot(a.kind) ? 1 : 0) - (isOneShot(b.kind) ? 1 : 0));
  const out: ActorBeat[] = []; for (const b of all) { const dup = out.find((x) => x.kind === b.kind && Math.abs(x.t - b.t) < 0.05); if (dup) { if (!dup.note && b.note) dup.note = b.note; continue; } out.push({ ...b }); if (out.length >= BEAT_MAX) break; }
  return out;
}

/** The person at take time u: position, heading, speed and walked distance in between keys (linear), and the acting beat playing now. */
export function actorAt(track: ActorTrack, u: number, time = u): ActorPose {
  const ks = track.keys; const n = ks.length; const t = Math.max(0, Number.isFinite(u) ? u : 0); let a = ks[0], b = ks[0], k = 0;
  if (n > 1 && t >= ks[n - 1].t) { a = b = ks[n - 1]; } else if (n > 1 && t > ks[0].t) { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ks[m].t <= t) lo = m; else hi = m; } a = ks[lo]; b = ks[hi]; k = (t - a.t) / Math.max(1e-9, b.t - a.t); }
  const end = t >= ks[n - 1].t; /* past the end the person stands where they stopped */
  const ride = track.ride; let inside = false;
  if (ride && a !== b) { /* a drive starts or ends between these two keys: no blend between the person and the car, take the side t is on */
    const si = spanAt(ride, t); inside = si >= 0; const ins = (x: number) => spanAt(ride, x) >= 0;
    if (ins(a.t) !== ins(b.t)) { if (ins(a.t) === inside) { b = a; k = 0; } else { a = b; k = 0; } } }
  else if (ride) inside = spanAt(ride, t) >= 0;
  const pose: ActorPose = { pos: [lerp(a.pos[0], b.pos[0], k), lerp(a.pos[1], b.pos[1], k), lerp(a.pos[2], b.pos[2], k)], heading: lerp(a.heading, b.heading, k), v: end ? 0 : lerp(a.v, b.v, k), d: lerp(a.d, b.d, k), time, beat: inside ? null : beatAt(track.beats, t) };
  if (ride) { pose.car = inside ? { k: ride.car, pos: pose.pos, heading: pose.heading, v: pose.v, d: pose.d, steer: steerOf(track, t, rideOf(ride.car).wheelbase), inside: true, acc: accOf(track, t) } : parkedAt(track, t);
    if (!inside) { const f = doorFade(ride, t); if (f < 1) pose.fade = f; } }
  return pose;
}
/** the front wheels' angle at t, read back from the keys (how fast the heading turns per metre driven) */
function steerOf(track: ActorTrack, t: number, wheelbase: number): number {
  const ks = track.keys; const i = Math.max(0, Math.min(ks.length - 2, Math.round(t * TAKE_HZ) - 1)); const a = ks[i], b = ks[Math.min(ks.length - 1, i + 2)];
  const dd = b.d - a.d; if (!(dd > 0.02)) return 0; const v = a.v + b.v; const sgn = v >= 0 ? 1 : -1;
  return Math.max(-0.62, Math.min(0.62, -Math.atan(((b.heading - a.heading) / dd) * wheelbase) * sgn));
}
/** How long the person takes to fade into the car as they get in (before a drive) and out of it as they get out (after one). */
export const DOOR_FADE = 0.35;
/** the person's opacity at t: fading out over DOOR_FADE before each drive, fading in over DOOR_FADE after it */
export function doorFade(ride: ActorRide | undefined, t: number): number {
  let f = 1; for (const [a, b] of ride?.spans ?? []) { if (t < a && t > a - DOOR_FADE) f = Math.min(f, (a - t) / DOOR_FADE); if (t > b && t < b + DOOR_FADE) f = Math.min(f, (t - b) / DOOR_FADE); }
  return Math.max(0, Math.min(1, f));
}
/** the car's acceleration at t (m/s²), read back from the keys' speeds around it */
function accOf(track: ActorTrack, t: number): number {
  const ks = track.keys; const i = Math.max(0, Math.min(ks.length - 1, Math.round(t * TAKE_HZ))); const a = ks[Math.max(0, i - 2)], b = ks[Math.min(ks.length - 1, i + 2)];
  const dt = b.t - a.t; return dt > 1e-3 ? Math.max(-60, Math.min(60, (b.v - a.v) / dt)) : 0;
}
/** Where the car stands while nobody drives it: at park before the first drive, at the end of the last drive since. */
function parkedAt(track: ActorTrack, t: number): RidePose {
  const ride = track.ride!; let last: [number, number] | null = null; for (const s of ride.spans) if (s[1] <= t) last = s;
  if (!last) return { k: ride.car, pos: [ride.park[0], ride.park[1], ride.park[2]], heading: ride.park[3], v: 0, d: 0, steer: 0, inside: false };
  const ks = track.keys; let j = 0; while (j < ks.length - 1 && ks[j + 1].t <= last[1] + 1e-6) j++; const k = ks[j];
  return { k: ride.car, pos: k.pos, heading: k.heading, v: 0, d: k.d, steer: 0, inside: false };
}
/** The acting beat playing at t (the latest one that started and hasn't finished; a new beat cuts the one before short). */
export function beatAt(beats: ActorBeat[], t: number): ActorPose['beat'] {
  let found: ActorPose['beat'] = null;
  for (const b of beats) { if (b.t > t) break; if (!isOneShot(b.kind)) continue; const local = t - b.t; found = local < beatSeconds(b.kind) ? { kind: b.kind, local } : null; }
  return found;
}

// ---------- live control (third person) ----------
export interface ActorInput { fwd: number; right: number; run: boolean; look: [number, number]; zoom: number }
export interface ActorLive { pos: Vec3; heading: number; v: number; d: number; vel: [number, number]; beat: { kind: ActorOneShot; start: number } | null }
/** The orbit camera around the person: yaw / pitch (mouse), distance (scroll). */
export interface FollowRig { yaw: number; pitch: number; dist: number }
export const FOLLOW_DIST = { min: 1.4, max: 9, start: 4.2 } as const; export const FOLLOW_PITCH = { min: -0.95, max: 0.5 } as const;
/** One frame of playing the person, GTA-style: W/S/A/D move relative to where the camera looks, the figure turns to face the way it moves,
 *  Shift (or the run toggle) runs, speed eases in and out. While a pinned beat plays (sit, dance) they stay put. Pure; stays in the area. */
export function actorStep(s: ActorLive, input: ActorInput, rig: FollowRig, dt: number, now: number, tpl: PrevizTemplateId): ActorLive {
  const d = Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
  const beat = s.beat && now - s.beat.start < beatSeconds(s.beat.kind) ? s.beat : null; const pinned = !!beat && PINNED.has(beat.kind);
  /* the camera's forward and right on the ground (yaw 0 looks towards −z) */
  const f: [number, number] = [-Math.sin(rig.yaw), -Math.cos(rig.yaw)]; const r: [number, number] = [Math.cos(rig.yaw), -Math.sin(rig.yaw)];
  let wx = f[0] * input.fwd + r[0] * input.right, wz = f[1] * input.fwd + r[1] * input.right; const m = Math.hypot(wx, wz); if (m > 1) { wx /= m; wz /= m; }
  const top = pinned ? 0 : (input.run ? ACTOR_RUN : ACTOR_WALK) * Math.min(1, m); const len = Math.hypot(wx, wz) || 1;
  const want: [number, number] = m > 0.05 ? [(wx / len) * top, (wz / len) * top] : [0, 0];
  const k = 1 - Math.exp(-d * (m > 0.05 ? 7 : 9)); const vel: [number, number] = [s.vel[0] + (want[0] - s.vel[0]) * k, s.vel[1] + (want[1] - s.vel[1]) * k];
  const pos = clampActor(tpl, s.pos[0] + vel[0] * d, s.pos[2] + vel[1] * d); const moved = Math.hypot(pos[0] - s.pos[0], pos[2] - s.pos[2]);
  const v = d > 0 ? moved / d : 0; let heading = s.heading;
  if (m > 0.05 && !pinned) { const target = Math.atan2(wx, wz); let dh = target - heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2; heading += dh * (1 - Math.exp(-d * 10)); }
  return { pos, heading, v: Math.min(20, v), d: s.d + moved, vel: d > 0 ? [(pos[0] - s.pos[0]) / d, (pos[2] - s.pos[2]) / d] : vel, beat };
}
/** The over-the-shoulder camera: behind and a little above the person, a touch to the right (like a third-person game), looking at their
 *  chest. Kept above the ground and, in the house, inside the walls. lens = the 16:9 vertical degrees a take stores. */
export function followCamera(at: Vec3, rig: FollowRig, tpl: PrevizTemplateId, lens: number): CameraPose {
  const pitch = Math.max(FOLLOW_PITCH.min, Math.min(FOLLOW_PITCH.max, rig.pitch)); const dist = Math.max(FOLLOW_DIST.min, Math.min(FOLLOW_DIST.max, rig.dist));
  const look = lookDir(rig.yaw, pitch); const right: Vec3 = [Math.cos(rig.yaw), 0, -Math.sin(rig.yaw)]; const sh = 0.32 * Math.min(1, dist / 3);
  const target: Vec3 = [at[0] + right[0] * sh, at[1] + 1.3, at[2] + right[2] * sh];
  let pos: Vec3 = [target[0] - look[0] * dist, target[1] - look[1] * dist, target[2] - look[2] * dist];
  if (tpl === 'walkthrough') pos = [Math.max(-2.3, Math.min(2.3, pos[0])), pos[1], Math.max(-10.8, Math.min(2.95, pos[2]))];
  if (isCityTemplate(tpl)) pos = openCityWorld().occlude(target, pos); /* a wall between them: the camera comes in front of it */
  pos = clampCamera(tpl, pos); return { pos, yaw: rig.yaw, pitch: Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch)), fov: lens };
}
/** The live state as the pose the engine draws (the same shape as a recorded take's actorAt). */
export const livePose = (s: ActorLive, now: number, time: number): ActorPose => ({ pos: s.pos, heading: s.heading, v: s.v, d: s.d, time, beat: s.beat && now - s.beat.start < beatSeconds(s.beat.kind) ? { kind: s.beat.kind, local: now - s.beat.start } : null });

// ---------- the Render prompt ----------
const sec = (x: number) => { const v = Math.round(x * 2) / 2; return Number.isInteger(v) ? String(v) : v.toFixed(1); };
/** A verb plus its note, read as English: "walks nervously", "waves and laughs", "stands still, looking around". */
export function withNote(verb: string, note?: string): string {
  const n = cleanNote(note ?? '').replace(/[.!?]+$/, ''); if (!n) return verb; const low = n.toLowerCase();
  if (/^(and|but|while|with|as|like|in|on|at|to|towards|then|slowly|quickly)\b/.test(low) || /^\w+ly\b/.test(low)) return `${verb} ${n}`;
  if (/^\w+s\b/.test(low) && !/^(is|was|has|nervous|anxious|curious|furious|joyous|serious|cautious)\b/.test(low)) return `${verb} and ${n}`;
  return `${verb}, ${n}`;
}
/** The chosen take's beats as one sentence for the Render prompt, in shot seconds (the take's trim and speed applied), or '' when the take
 *  has no person. Move beats run until the next one; acting beats are a moment (or a span when they last 2.5 s or more). */
export function actionPromptFor(shot: PlanShot): string {
  const take = chosenTake(shot); const tr = take?.actor; if (!take || !tr || tr.keys.length < 2) return '';
  const toShot = (u: number) => (u - take.trimStart) / take.speed; const end = Math.min(shot.seconds, (take.trimEnd - take.trimStart) / take.speed);
  const moves = tr.beats.filter((b) => !isOneShot(b.kind)); const parts: { at: number; text: string }[] = [];
  /* the move beat in force at the trim start opens the line */
  const lead = [...moves].reverse().find((b) => b.t <= take.trimStart + 1e-6); const ms = [...(lead ? [{ ...lead, t: take.trimStart }] : []), ...moves.filter((b) => b.t > take.trimStart + 1e-6 && b.t < take.trimEnd)];
  ms.forEach((b, i) => { const a = Math.max(0, toShot(b.t)); const z = Math.min(end, i + 1 < ms.length ? toShot(ms[i + 1].t) : end); if (a >= end - 0.05 || z - a < 0.3) return;
    if (b.kind === 'stand' && !b.note && z - a < 1) return;
    /* standing still while sitting or dancing says nothing the beat doesn't */
    if (b.kind === 'stand' && !b.note && tr.beats.some((x) => PINNED.has(x.kind) && toShot(x.t) < z && toShot(x.t) + beatSeconds(x.kind) / take.speed > a + 0.5)) return;
    /* Drive mode: the time at the wheel is said by the drive itself, so a move beat keeps only its pieces outside the drives */
    for (const [pa, pz] of outsideDrives(a, z, (tr.ride?.spans ?? []).map(([x, y]) => [toShot(x), toShot(y)] as [number, number]))) { if (pz - pa < 0.3 || (b.kind === 'stand' && !b.note && pz - pa < 1)) continue;
      parts.push({ at: pa, text: `${sec(pa)}–${sec(pz)} s ${withNote(MOVE_VERB[b.kind as ActorMoveKind], b.note)}` }); } });
  for (const p of drivePromptParts(tr, take.trimStart, take.trimEnd, toShot, end)) parts.push(p);
  for (const b of tr.beats) { if (!isOneShot(b.kind) || b.t < take.trimStart - 1e-6 || b.t > take.trimEnd || spanAt(tr.ride, b.t) >= 0) continue; const a = toShot(b.t); if (a >= end) continue;
    const z = Math.min(end, a + beatSeconds(b.kind) / take.speed); const verb = actorAction(b.kind)!.verb;
    parts.push({ at: a + 1e-3, text: `${z - a >= 2.5 ? `${sec(a)}–${sec(z)}` : sec(a)} s ${withNote(verb, b.note)}` }); }
  if (!parts.length) return '';
  parts.sort((x, y) => x.at - y.at); return `The person: ${parts.map((p) => p.text).join(', ')}.`;
}

/** [a, z] with the drives cut out: the pieces left (shot seconds) */
function outsideDrives(a: number, z: number, spans: [number, number][]): [number, number][] {
  let out: [number, number][] = [[a, z]];
  for (const [sa, sz] of spans) out = out.flatMap(([x, y]): [number, number][] => (sz <= x || sa >= y ? [[x, y]] : [...(sa > x ? [[x, sa] as [number, number]] : []), ...(sz < y ? [[sz, y] as [number, number]] : [])]));
  return out;
}
/** Where a drive mostly happened, as the prompt says it ("along the main avenue", "through downtown"): the open city's district that holds
 *  most of the keys of the drive. */
const DRIVE_WHERE: Record<string, string> = { avenue: 'along the main avenue', downtown: 'through downtown', midtown: 'through midtown', oldtown: 'through the old town', park: 'past the park and plaza', suburbs: 'through the suburbs', beach: 'along the beach road', hills: 'up in the hills' };
function driveWhere(keys: ActorKey[]): string {
  const ds = openCityWorld().spec.districts; const count = new Map<string, number>();
  for (const k of keys) { const d = ds.find((x) => x.rects.some(([x0, x1, z0, z1]) => k.pos[0] >= x0 && k.pos[0] <= x1 && k.pos[2] >= z0 && k.pos[2] <= z1)); if (d) count.set(d.id, (count.get(d.id) ?? 0) + 1); }
  let best = ''; let n = 0; for (const [id, c] of count) if (c > n) { n = c; best = id; } return DRIVE_WHERE[best] ?? 'through the city';
}
/** The drives of a take inside its trim, as prompt parts: "3–9 s gets into a taxi and drives it fast along the main avenue", then
 *  "9 s gets out" when the drive ends before the shot does. */
function drivePromptParts(tr: ActorTrack, lo: number, hi: number, toShot: (u: number) => number, end: number): { at: number; text: string }[] {
  const ride = tr.ride; if (!ride) return []; const out: { at: number; text: string }[] = []; const car = rideOf(ride.car);
  for (const [sa, sz] of ride.spans) { const a0 = Math.max(lo, sa), z0 = Math.min(hi, sz); if (z0 - a0 < 0.05) continue; const a = Math.max(0, toShot(a0)), z = Math.min(end, toShot(z0)); if (a >= end - 0.05 || z - a < 0.3) continue;
    const ks = tr.keys.filter((k) => k.t >= a0 && k.t <= z0); const moved = ks.length > 1 ? ks[ks.length - 1].d - ks[0].d : 0; const vmax = ks.reduce((m, k) => Math.max(m, k.v), 0); const avg = moved / Math.max(0.01, z0 - a0);
    const getsIn = sa > lo + 0.05; const how = vmax < 0.6 ? null : avg > 12 ? 'fast ' : avg < 4 ? 'slowly ' : '';
    const verb = how == null ? `sits at the wheel of ${car.noun}` : getsIn ? `gets into ${car.noun} and drives it ${how}${driveWhere(ks)}` : `drives ${car.noun} ${how}${driveWhere(ks)}`;
    out.push({ at: a + 2e-3, text: `${sec(a)}–${sec(z)} s ${verb.replace(/\s+/g, ' ')}` });
    if (sz < hi - 0.05 && z < end - 0.3) out.push({ at: z + 1e-3, text: `${sec(z)} s gets out` }); }
  return out;
}

// ---------- game controllers ----------
export interface PadButtons { a: boolean; b: boolean; x: boolean; y: boolean; lb: boolean; rb: boolean; back: boolean; start: boolean; ls: boolean; rs: boolean; up: boolean; down: boolean; left: boolean; right: boolean }
export interface PadInput { move: [number, number]; look: [number, number]; lt: number; rt: number; buttons: PadButtons }
export const PAD_DEAD = 0.16;
/** A stick with a round dead zone, rescaled so it starts from 0 at the zone's edge (no drift at rest, full range at the rim). */
export function stick(x: number, y: number, dead = PAD_DEAD): [number, number] {
  const fx = Number.isFinite(x) ? x : 0, fy = Number.isFinite(y) ? y : 0; const m = Math.hypot(fx, fy); if (m < dead) return [0, 0];
  const k = Math.min(1, (m - dead) / (1 - dead)) / m; return [fx * k, fy * k];
}
/** A browser Gamepad (the "standard" mapping) → sticks, triggers and named buttons. Missing axes or buttons read as rest. */
export function readPad(axes: readonly number[], buttons: readonly ({ pressed?: boolean; value?: number } | undefined)[]): PadInput {
  const bt = (i: number) => !!buttons[i]?.pressed || (buttons[i]?.value ?? 0) > 0.5; const val = (i: number) => Math.max(0, Math.min(1, buttons[i]?.value ?? (buttons[i]?.pressed ? 1 : 0)));
  const tr = (v: number) => (v < 0.06 ? 0 : v);
  return { move: stick(axes[0] ?? 0, axes[1] ?? 0), look: stick(axes[2] ?? 0, axes[3] ?? 0), lt: tr(val(6)), rt: tr(val(7)),
    buttons: { a: bt(0), b: bt(1), x: bt(2), y: bt(3), lb: bt(4), rb: bt(5), back: bt(8), start: bt(9), ls: bt(10), rs: bt(11), up: bt(12), down: bt(13), left: bt(14), right: bt(15) } };
}
/** The buttons that went down since the last frame (each press acts once). */
export const padPressed = (now: PadButtons, prev: PadButtons | null): (keyof PadButtons)[] => (Object.keys(now) as (keyof PadButtons)[]).filter((k) => now[k] && !prev?.[k]);

// ---------- Perform, then shoot (2026-10-26) ----------
/** A performance: a take you played (it has a person) that isn't itself a camera angle of another performance. */
export const isPerformance = (k: CameraTake) => !!k.actor && !k.shoot;
/** The camera angles shot of a performance, in the order they were shot. */
export const anglesOf = (takes: CameraTake[], perfId: string) => takes.filter((k) => k.shoot?.of === perfId).sort((a, b) => a.shoot!.angle - b.shoot!.angle);
/** Every performance with its angles, in the order the performances were recorded. */
export const performanceGroups = (takes: CameraTake[]) => takes.filter(isPerformance).map((perf) => ({ perf, angles: anglesOf(takes, perf.id) }));
/** The number the next angle of a performance gets (one more than the highest so far, so a deleted angle's number isn't reused). */
export const nextAngle = (takes: CameraTake[], perfId: string) => anglesOf(takes, perfId).reduce((m, k) => Math.max(m, k.shoot!.angle), 0) + 1;
/** The name the next performance gets: "Performance N", one more than the highest so far. */
export function nextPerformanceName(takes: CameraTake[]): string {
  const n = takes.reduce((m, k) => { const x = /^Performance (\d+)$/.exec(k.name); return x ? Math.max(m, Number(x[1])) : m; }, 0); return `Performance ${Math.max(n, takes.filter(isPerformance).length) + 1}`;
}
/** Slow motion while you shoot: the rates you can replay a performance at. */
export const SHOOT_RATES = [1, 0.5] as const;
/** How long the replay holds the last moment before it starts again (seconds of wall time). */
export const PERF_HOLD = 0.6;
/** The replay clock: one frame of a performance played at `rate` between take times lo and hi. dt is wall time (capped at 0.1 s, like every
 *  other step), so a slow frame slows the replay rather than skipping it. loop: at the end hold PERF_HOLD then start again; otherwise stop at hi
 *  (ended = true). Pure: the same frames give the same clock. */
export function perfStep(c: { u: number; hold: number }, dt: number, rate: number, lo: number, hi: number, loop: boolean): { u: number; hold: number; ended: boolean } {
  const d = Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0)); const r = Math.max(0.1, Math.min(1, Number.isFinite(rate) ? rate : 1));
  const u0 = Math.max(lo, Math.min(hi, Number.isFinite(c.u) ? c.u : lo));
  if (u0 >= hi) { if (!loop) return { u: hi, hold: 0, ended: true }; const hold = c.hold + d; return hold >= PERF_HOLD ? { u: lo, hold: 0, ended: false } : { u: hi, hold, ended: false }; }
  const u = Math.min(hi, u0 + d * r); return { u, hold: 0, ended: !loop && u >= hi };
}
/** The person of a performance at take time u (what the shooting camera sees). */
export const performanceAt = (perf: CameraTake, u: number): ActorPose | null => (perf.actor ? actorAt(perf.actor, u, u) : null);
/** A camera flown while a performance replays → a new take, an angle of that performance. raw: the camera poses stamped with the performance's
 *  take time (so slow motion is re-timed to real speed for free). The angle keeps the performance's track and its trim and speed, so it replays
 *  the person exactly as the performance does at every shot time; the camera holds its first pose before the first key. null if too short. */
export function shootTake(perf: CameraTake, raw: CameraKey[], o: { id: string; angle: number; rate: number }): (Omit<CameraTake, 'shoot'> & { shoot: { of: string; angle: number; rate: number } }) | null {
  if (!perf.actor) return null; const ks = raw.filter((k) => Number.isFinite(k.t)).sort((a, b) => a.t - b.t); if (ks.length < 2 || ks[ks.length - 1].t - ks[0].t < 0.3) return null;
  const u0 = ks[0].t; const rs = resampleKeys(ks).map((k) => ({ ...k, t: k.t + u0 })); const keys = u0 > 1e-3 ? [{ ...rs[0], t: 0 }, ...rs] : rs;
  const end = keys[keys.length - 1].t; const trimStart = Math.min(perf.trimStart, Math.max(0, end - 0.2)); const trimEnd = Math.max(trimStart + 0.2, Math.min(perf.trimEnd, end));
  return { id: o.id, name: `${perf.name} · Angle ${o.angle}`.slice(0, 40), keys, smooth: TAKE_SMOOTH_DEFAULT, trimStart, trimEnd, speed: perf.speed, actor: perf.actor, shoot: { of: perf.id, angle: o.angle, rate: o.rate } };
}
