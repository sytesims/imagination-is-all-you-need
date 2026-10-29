/**
 * Rig as a character (2026-10-27): a model with moves (one you rigged with Mesh2Motion's human skeleton, or a GLB that came with its own
 * animations) playing the actor in Direct a Shot. Pure and isomorphic like previzModels.ts (no three.js, no DOM), so the player, the recorder
 * and the tests read the same numbers.
 *  - RIG_MOVES: the moves "Rig as a character" offers, the clip each one bakes from (Mesh2Motion's human pack, CC0) and the name it gets
 *    in the saved GLB. RIG_CLIP: those saved names by role.
 *  - rolesOf(names): which clip of a file plays which role (our own names first, then the usual names in other rigs: Idle, Walking, Run…).
 *  - rigMixAt(roles, pose, h): every clip's weight and time for one moment, a pure function of the actor's pose (which is a pure function
 *    of shot t): idle, walk, jog and run blend by speed with their cycles on the distance walked (the feet keep step with the ground, scaled
 *    by the model's height), an acting beat (jump, dance, sit) fades in over the top when the model has it. Same blend as the mannequin
 *    (web/src/shared/previz/actor.ts).
 */
import { STRIDE, beatSeconds, type ActorOneShot } from './previzActor.js';

export type RigRole = 'idle' | 'walk' | 'jog' | 'sprint' | 'jumpUp' | 'jumpDown' | 'dance' | 'sitIn' | 'sit' | 'sitOut' | 'wave' | 'point';
/** The clip names a rigged character's GLB carries, by role. */
export const RIG_CLIP: Record<RigRole, string> = { idle: 'Idle', walk: 'Walk', jog: 'Jog', sprint: 'Sprint', jumpUp: 'Jump_Start', jumpDown: 'Jump_Land', dance: 'Dance', sitIn: 'Sit_Enter', sit: 'Sit', sitOut: 'Sit_Exit', wave: 'Wave', point: 'Point' };
export type RigMoveId = 'idle' | 'walk' | 'jog' | 'sprint' | 'jump' | 'dance' | 'sit';
/** The moves you can pick. from = the clip in Mesh2Motion's human pack → the role it plays. Idle and walk always come. */
export const RIG_MOVES: { id: RigMoveId; label: string; hint: string; from: [string, RigRole][]; always?: boolean }[] = [
  { id: 'idle', label: 'Idle', hint: 'Breathes and shifts its weight while it stands', from: [['Idle_A', 'idle']], always: true },
  { id: 'walk', label: 'Walk', hint: 'Walks when the actor moves slowly', from: [['Walk', 'walk']], always: true },
  { id: 'jog', label: 'Jog', hint: 'Jogs at a running pace', from: [['Jog', 'jog']] },
  { id: 'sprint', label: 'Run', hint: 'Sprints at full speed', from: [['Sprint', 'sprint']] },
  { id: 'jump', label: 'Jump', hint: 'Jumps on the Jump beat', from: [['Jump_Start', 'jumpUp'], ['Jump_Land', 'jumpDown']] },
  { id: 'dance', label: 'Dance', hint: 'Dances on the Dance beat', from: [['Dance_Simple', 'dance']] },
  { id: 'sit', label: 'Sit', hint: 'Sits down on the Sit beat', from: [['Sitting_Enter', 'sitIn'], ['Sitting_Idle', 'sit'], ['Sitting_Exit', 'sitOut']] },
];
export const DEFAULT_RIG_MOVES: RigMoveId[] = ['idle', 'walk', 'jog', 'sprint', 'jump', 'dance'];
/** The moves to bake: the ones asked for (known ids), always with idle and walk, in RIG_MOVES order. */
export const cleanMoves = (ids: unknown): RigMoveId[] => { const want = new Set(Array.isArray(ids) ? ids : []); return RIG_MOVES.filter((m) => m.always || want.has(m.id)).map((m) => m.id); };

/* the usual names in other rigs, for a GLB that came with its own animations (Mixamo, Quaternius, Mesh2Motion exports…) */
const GUESS: [RigRole, RegExp][] = [['idle', /idle/i], ['walk', /walk|waddle/i], ['jog', /jog|^hop$/i], ['wave', /wave|hello/i], ['point', /point|lantern/i], ['sprint', /sprint|run/i], ['jumpUp', /jump.*(start|up|begin)|^jump$/i], ['jumpDown', /land/i], ['dance', /danc/i], ['sitIn', /sit.*(enter|down|start)/i], ['sitOut', /sit.*(exit|up|stand)|stand.*up/i], ['sit', /sit/i]];
/** Which clip plays which role: exact saved names first, then the usual names (each clip plays one role at most). */
export function rolesOf(names: string[]): Partial<Record<RigRole, string>> {
  const out: Partial<Record<RigRole, string>> = {}; const used = new Set<string>();
  for (const r of Object.keys(RIG_CLIP) as RigRole[]) if (names.includes(RIG_CLIP[r])) { out[r] = RIG_CLIP[r]; used.add(RIG_CLIP[r]); }
  for (const [r, rx] of GUESS) { if (out[r]) continue; const n = names.find((x) => !used.has(x) && rx.test(x) && !/carry|crouch|zombie|swim|back|left|right|strafe/i.test(x)); if (n) { out[r] = n; used.add(n); } }
  /* a hop loop (Mossbun's own rig) is also his jump: one hop of it per Jump beat */
  if (!out.jumpUp && !out.jumpDown && out.jog && /^hop$/i.test(out.jog)) out.jumpUp = out.jog;
  return out;
}
/** The model can walk and stand with its own moves (an idle or a walk at least). */
export const canMove = (roles: Partial<Record<RigRole, string>>) => !!(roles.walk || roles.jog || roles.sprint);

const smooth = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const fract = (x: number) => x - Math.floor(x);
export interface RigPose { v: number; d: number; time: number; beat?: { kind: ActorOneShot; local: number } | null }
/** One clip's weight (0…1) and time (seconds, inside the clip) for this moment. */
export interface RigMix { name: string; w: number; t: number }
/**
 * Every clip's weight and time for one pose. clips = role → {name, duration in seconds} (what the file has); h = the model's height in
 * metres (a cycle covers STRIDE × h ÷ 1.75 metres). Roles a file lacks borrow the nearest one (no sprint → jog → walk; no idle → walk held
 * at its first frame). Weights sum to 1. Pure: the same pose always gives the same mix.
 */
export function rigMixAt(clips: Partial<Record<RigRole, { name: string; dur: number }>>, p: RigPose, h = 1.75): RigMix[] {
  const v = Math.max(0, Number.isFinite(p.v) ? p.v : 0); const d = Number.isFinite(p.d) ? Math.max(0, p.d) : 0; const time = Number.isFinite(p.time) ? Math.max(0, p.time) : 0;
  const k = Math.min(4, Math.max(0.2, (Number.isFinite(h) ? h : 1.75) / 1.75));
  const walk = clips.walk ?? clips.jog ?? clips.sprint; const jog = clips.jog ?? clips.sprint ?? walk; const sprint = clips.sprint ?? jog; const idle = clips.idle;
  const acc = new Map<string, RigMix>(); const add = (c: { name: string; dur: number } | undefined, w: number, t: number) => { if (!c || !(w > 1e-4)) return; const dur = Math.max(1e-3, c.dur);
    const cur = acc.get(c.name); const tt = Math.max(0, Math.min(dur - 1e-4, t)); if (cur) { if (w > cur.w) cur.t = tt; cur.w += w; } else acc.set(c.name, { name: c.name, w, t: tt }); };
  const cyc = (c: { dur: number } | undefined, stride: number) => (c ? fract(d / (stride * k)) * c.dur : 0);
  const b = p.beat ?? null; const len = b ? beatSeconds(b.kind) : 0; const has = (r: RigRole) => !!clips[r];
  const beatOk = !!b && (b.kind === 'dance' ? has('dance') : b.kind === 'sit' ? has('sit') || has('sitIn') : b.kind === 'jump' ? has('jumpUp') || has('jumpDown') : b.kind === 'wave' ? has('wave') : b.kind === 'point' ? has('point') : false);
  const over = beatOk ? smooth(0, 0.22, b!.local) * smooth(0, 0.3, len - b!.local) : 0;
  const mv = smooth(0.05, 0.7, v), run = smooth(1.7, 3.1, v), spr = smooth(4.3, 5.6, v); const base = 1 - over;
  if (idle) add(idle, (1 - mv) * base, time % idle.dur); else add(walk, (1 - mv) * base, 0);
  add(walk, mv * (1 - run) * base, cyc(walk, STRIDE.walk)); add(jog, mv * run * (1 - spr) * base, cyc(jog, STRIDE.jog)); add(sprint, mv * run * spr * base, cyc(sprint, STRIDE.sprint));
  if (beatOk && over > 0) { const L = b!.local;
    if (b!.kind === 'dance') add(clips.dance, over, L % clips.dance!.dur);
    else if (b!.kind === 'wave' || b!.kind === 'point') { const c = b!.kind === 'wave' ? clips.wave! : clips.point!; add(c, over, Math.min(c.dur - 1e-3, (L / Math.max(1e-3, len)) * c.dur)); }
    else if (b!.kind === 'sit') { const sIn = clips.sitIn, sOut = clips.sitOut, s = clips.sit ?? sIn ?? sOut; const din = sIn?.dur ?? 0, dout = sOut?.dur ?? 0;
      if (sIn && L < din) add(sIn, over, L); else if (sOut && L > len - dout) add(sOut, over, L - (len - dout)); else add(s, over, s === clips.sit ? (L - din) % s!.dur : Math.min(L, s!.dur)); }
    else if (clips.jumpUp && clips.jog && clips.jumpUp.name === clips.jog.name && !clips.jumpDown) add(clips.jumpUp, over, (L / len) * (clips.jumpUp.dur / 3)); /* one hop of a three-hop loop */
    else { const half = len / 2; const up = clips.jumpUp ?? clips.jumpDown!, down = clips.jumpDown ?? up; if (L < half) add(up, over, (L / half) * up.dur); else add(down, over, ((L - half) / half) * down.dur); } }
  const out = [...acc.values()]; const s = out.reduce((a, x) => a + x.w, 0);
  if (!(s > 1e-6)) { const c = idle ?? walk; return c ? [{ name: c.name, w: 1, t: 0 }] : []; }
  return out.map((x) => ({ name: x.name, w: Math.round((x.w / s) * 1e6) / 1e6, t: Math.round(x.t * 1e6) / 1e6 })).sort((a, z) => (a.name < z.name ? -1 : 1));
}

// ---------- who can get the human skeleton ----------
/** The fit score a model needs before Person rigging is offered (humanRig.ts fitHuman: how many key joints have mesh around them). */
export const PERSON_MIN_SCORE = 0.8;
/**
 * Shaped like a person: most key joints sit in the mesh, and either the legs stand apart or nearly everything fits (a long coat or a robe
 * hides the gap). A creature like Mossbun (score 0.73, no leg gap) is refused: the human skeleton tears it. Creature skeletons come later.
 */
export const personShaped = (fit: { score: number; legs: boolean }) => Number.isFinite(fit.score) && fit.score >= PERSON_MIN_SCORE && (fit.legs || fit.score >= 0.9);
export const NOT_A_PERSON = 'This one isn’t shaped like a person. Creature skeletons are coming soon.';

// ---------- the saved character ----------
/** What the server keeps with a rigged character (job.input.rig). */
export interface RigMeta { skeleton: 'human'; moves: RigMoveId[]; clips: string[]; bones: number; meshes: number; vertices: number;
  /** milliseconds: fitting, skin weights, baking + export */ ms: { fit: number; skin: number; bake: number }; fit: { score: number; legs: boolean; arms: 'found' | 'guessed'; nudged: number };
  /** the model it was made from: its file, its 3D job (if any) and its name */ src: string; srcJob: string | null; name: string; engine: { name: 'Mesh2Motion'; commit: string } }
export const M2M_COMMIT = 'eef2de9';
const MOVE_IDS = new Set(RIG_MOVES.map((m) => m.id));
const int = (x: unknown, lo: number, hi: number) => { const n = Math.round(Number(x)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };
/** Any input → a clean RigMeta (what a browser sends is checked before it is kept); null when the essentials are missing. */
export function normalizeRigMeta(raw: unknown): RigMeta | null {
  if (!raw || typeof raw !== 'object') return null; const o = raw as Record<string, any>;
  const src = typeof o.src === 'string' && /^\/(files|showcase)\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.glb$/i.test(o.src) && !o.src.includes('..') ? o.src : null; if (!src) return null;
  const moves = (Array.isArray(o.moves) ? o.moves : []).filter((m: unknown): m is RigMoveId => MOVE_IDS.has(m as RigMoveId)); if (!moves.length) return null;
  const clips = (Array.isArray(o.clips) ? o.clips : []).filter((c: unknown): c is string => typeof c === 'string' && /^[A-Za-z0-9_ -]{1,40}$/.test(c)).slice(0, 40);
  const fit = o.fit ?? {}; const ms = o.ms ?? {};
  return { skeleton: 'human', moves: [...new Set(moves)] as RigMoveId[], clips, bones: int(o.bones, 0, 400), meshes: int(o.meshes, 0, 400), vertices: int(o.vertices, 0, 5e6),
    ms: { fit: int(ms.fit, 0, 6e5), skin: int(ms.skin, 0, 6e5), bake: int(ms.bake, 0, 6e5) },
    fit: { score: Math.min(1, Math.max(0, Math.round(Number(fit.score) * 100) / 100 || 0)), legs: !!fit.legs, arms: fit.arms === 'found' ? 'found' : 'guessed', nudged: int(fit.nudged, 0, 999) },
    src, srcJob: typeof o.srcJob === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(o.srcJob) ? o.srcJob : null,
    name: typeof o.name === 'string' ? o.name.replace(/[\r\n\t"<>{}[\]\\]/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 40) || 'Your character' : 'Your character',
    engine: { name: 'Mesh2Motion', commit: M2M_COMMIT } };
}
