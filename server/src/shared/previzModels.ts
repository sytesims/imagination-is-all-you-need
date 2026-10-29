/**
 * Your 3D models in Direct a Shot (2026-10-27): a GLB you made in the 3D tab (Image to 3D), or one you uploaded, placed in the set as a prop or
 * played as the actor. Pure and isomorphic like previzTemplates.ts (no three.js, no DOM), so the live player, the recorder, the Render prompt and
 * the tests read the same numbers.
 *  - PlacedModel: what the shot keeps (shot.models): the file, its name and the words the Render uses for it, where it stands, its turn, its
 *    height in metres, its front (a turn in its own frame, for files whose front isn't glTF's +z) and its footprint (width ÷ height, measured
 *    once when it was added, so framing and spacing never depend on a file being loaded).
 *  - starOf: the model that plays the actor (actor = its motion). It stands in for the mannequin: on a performance's path, on the walk-by
 *    figure's walk, or where you put it.
 *  - modelMotionAt: the actor's procedural motion (models from one picture aren't rigged), a pure function of the pose (which is a pure function
 *    of t): a hop, a waddle or a glide along the path, with a bob, a lean into turns and a squash and stretch on hops.
 *  - castPromptFor / castActionLine: the Render prompt says who the character is in words (the 3D job's source prompt, its name, or what you typed).
 * Rigging (2026-10-27): Rig as a character (web/src/shared/rig, Mesh2Motion's human skeleton and CC0 moves) saves a rigged GLB; as the actor
 * with motion 'moves' it walks, runs and acts with those clips (shared/previzRig.ts rigMixAt), the hop / waddle / glide stay for unrigged files.
 */
import type { PlanShot, Vec3 } from './previzTemplates.js';

export type ModelMotion = 'hop' | 'waddle' | 'glide' | 'moves';
export const MODEL_MOTIONS: { id: ModelMotion; label: string; hint: string; verb: string; fast: string }[] = [
  { id: 'hop', label: 'Hop', hint: 'Bounces along with a squash on every landing', verb: 'hops', fast: 'bounds' },
  { id: 'waddle', label: 'Waddle', hint: 'Rocks from side to side as it goes', verb: 'waddles', fast: 'scurries' },
  { id: 'glide', label: 'Glide', hint: 'Floats just above the ground', verb: 'glides', fast: 'glides quickly' },
  /* Rig as a character (2026-10-27, shared/previzRig.ts): a rigged model (or a GLB with its own animations) walks, runs and acts with its moves.
     Offered only for a file that has moves; without them it hops. */
  { id: 'moves', label: 'Its moves', hint: 'Walks, jogs and runs with its own moves', verb: 'walks', fast: 'runs' },
];
/** The motions offered for a model: its own moves first when its file has them (a rigged character), then hop, waddle and glide. */
export const motionsFor = (hasMoves: boolean) => (hasMoves ? [MODEL_MOTIONS[3], ...MODEL_MOTIONS.slice(0, 3)] : MODEL_MOTIONS.slice(0, 3));
export const isModelMotion = (x: unknown): x is ModelMotion => MODEL_MOTIONS.some((m) => m.id === x);
/** One of your models in the shot. src: the GLB (/files/<name>.glb, or a shipped /showcase/<name>.glb); job: the 3D job it came from. */
export interface PlacedModel { id: string; src: string; job?: string; name: string; /** the words the Render uses ("a small moss-green forest creature…") */ desc: string;
  x: number; z: number; /** turn about the vertical (radians; 0 faces +z) */ r: number; /** height in metres */ h: number;
  /** the file's front, as a turn in its own frame (radians, quarter turns in the UI) */ front: number; /** footprint: width ÷ height (largest side) */ fw: number;
  /** plays the actor with this motion; absent = a prop */ actor?: ModelMotion }
export const MODELS_MAX = 4; export const MODEL_H_MIN = 0.1; export const MODEL_H_MAX = 8; export const MODEL_DESC_MAX = 200; export const MODEL_NAME_MAX = 40;
/** the largest GLB Direct a Shot loads (bytes): bigger files slow the open city down and are refused with a clear message */
export const MODEL_MAX_BYTES = 40 * 1024 * 1024;
/** a GLB the app serves: a result or upload in the data folder, or a shipped showcase file */
export const isModelSrc = (s: unknown): s is string => typeof s === 'string' && /^\/(files|showcase)\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.glb$/i.test(s) && !s.includes('..');
/** A placed prop must be self-contained: never let a GLB request external buffers or textures. */
export function checkModelGlb(buf: ArrayBuffer): string | null {
  if (buf.byteLength > MODEL_MAX_BYTES) return 'That GLB is larger than 40 MB. Make a lighter copy and try again.';
  if (buf.byteLength < 20) return 'That file isn’t a complete GLB (binary glTF).';
  const v = new DataView(buf);
  if (v.getUint32(0, true) !== 0x46546c67 || v.getUint32(4, true) !== 2 || v.getUint32(8, true) !== buf.byteLength) return 'That file isn’t a complete GLB 2.0 model.';
  const len = v.getUint32(12, true);
  if (v.getUint32(16, true) !== 0x4e4f534a || len > buf.byteLength - 20) return 'That GLB has an unreadable scene.';
  try { const j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, len)));
    if ([...(j.buffers ?? []), ...(j.images ?? [])].some((x: { uri?: unknown }) => x.uri != null && (typeof x.uri !== 'string' || !x.uri.startsWith('data:')))) return 'Use a self-contained GLB with embedded textures and buffers. External files and URLs are not loaded.';
  } catch { return 'That GLB has an unreadable scene.'; }
  return null;
}
const r3 = (x: number) => Math.round(x * 1000) / 1000 || 0; const r4 = (x: number) => Math.round(x * 10000) / 10000 || 0;
const num = (x: unknown, lo: number, hi: number, d: number) => { const n = Number(x); return x == null || x === '' || !Number.isFinite(n) ? d : Math.min(hi, Math.max(lo, n)); };
/* wrapped to ±π, a hair inside it, so a rounded angle reads back the same (3.1416 would wrap to −3.1416) */
const wrap = (a: number) => Math.max(-3.1415, Math.min(3.1415, Math.atan2(Math.sin(a), Math.cos(a))));
/** plain words only (it goes into a prompt): no line breaks, quotes or brackets */
export const cleanWords = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/[\r\n\t]+/g, ' ').replace(/["<>{}[\]\\]/g, '').replace(/\s{2,}/g, ' ').trim().slice(0, max) : '');
const KEY_MAX = 650;

/** Any input → the models list: known files only, at most MODELS_MAX, ids unique, one actor at most (the first); empty → null. */
export function normalizeModels(raw: unknown): PlacedModel[] | null {
  if (!Array.isArray(raw)) return null; const out: PlacedModel[] = []; const seen = new Set<string>(); let star = false;
  for (const m of raw.slice(0, MODELS_MAX * 4)) { if (out.length >= MODELS_MAX) break; if (!m || typeof m !== 'object') continue; const o = m as Record<string, unknown>; if (!isModelSrc(o.src)) continue;
    let id = typeof o.id === 'string' && /^[a-z0-9-]{1,24}$/.test(o.id) ? o.id : `m${out.length + 1}`; let n = 2; while (seen.has(id)) id = `m${out.length + 1}-${n++}`; seen.add(id);
    const job = typeof o.job === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(o.job) ? o.job : undefined;
    const actor = !star && isModelMotion(o.actor) ? o.actor : undefined; if (actor) star = true;
    out.push({ id, src: o.src, ...(job ? { job } : {}), name: cleanWords(o.name, MODEL_NAME_MAX) || 'Your model', desc: cleanWords(o.desc, MODEL_DESC_MAX),
      x: r3(num(o.x, -KEY_MAX, KEY_MAX, 0)), z: r3(num(o.z, -KEY_MAX, KEY_MAX, 0)), r: r4(wrap(num(o.r, -1e4, 1e4, 0))), h: r3(num(o.h, MODEL_H_MIN, MODEL_H_MAX, 1.2)),
      front: r4(wrap(num(o.front, -1e4, 1e4, 0))), fw: r3(num(o.fw, 0.05, 20, 1)), ...(actor ? { actor } : {}) }); }
  return out.length ? out : null;
}
/** The model that plays the actor, or null. */
export const starOf = (shot: Pick<PlanShot, 'models'>): PlacedModel | null => shot.models?.find((m) => !!m.actor) ?? null;
/** How tall a model frames (metres): its height, or more for a wide, low model, so a shot size keeps all of it in view. */
export const frameHeightOf = (m: Pick<PlacedModel, 'h' | 'fw'>) => Math.max(m.h, m.h * m.fw * 0.62);
/** Half its footprint's diagonal (metres), for spacing new drops and the selection ring. */
export const modelRadius = (m: Pick<PlacedModel, 'h' | 'fw'>) => Math.max(0.15, (m.h * m.fw) / 2 * Math.SQRT2 * 0.85);
/** Product Hero's existing plinth is 0.60 m tall: props on its top must not disappear inside it. */
export const modelGroundY = (template: string, x: number, z: number, floor: number) => template === 'product-hero' && Math.hypot(x, z) < 0.6 ? 0.6 : floor;
/** The size a new model starts at: a character-like file (taller than wide) about 1.2 m, a wide one about 1.6 m across; small sets scale it. */
export function startHeight(fw: number, template: string): number {
  const f = Math.max(0.05, fw); const h = f <= 1.4 ? 1.2 : Math.max(0.3, Math.min(3, 1.6 / f)); const k = template === 'diorama' ? 0.14 : template === 'product-hero' ? 0.45 : 1;
  return r3(Math.max(MODEL_H_MIN, Math.min(MODEL_H_MAX, h * k)));
}
/** A turn that faces a model at (x, z) towards a point (the camera) on the ground. */
export const faceTowards = (x: number, z: number, tx: number, tz: number) => (Math.hypot(tx - x, tz - z) < 1e-6 ? 0 : r4(wrap(Math.atan2(tx - x, tz - z))));

// ---------- the actor's motion ----------
export interface ModelPose { /** metres up */ lift: number; /** extra turn about y (a waddle's wiggle) */ yaw: number; /** roll about its forward axis (+ leans right) */ lean: number;
  /** tip forward (+) */ pitch: number; /** squash and stretch: width and height factors (volume roughly kept) */ sx: number; sy: number }
const fract = (x: number) => x - Math.floor(x);
const smooth = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
/**
 * The actor's motion at one moment, pure: m = the motion, h = its height (metres), p = the pose (speed v m/s, distance travelled d, clock time),
 * turn = how fast it turns (radians a second, + = left). The hop and the waddle run on the distance travelled, so the feet keep step with the
 * ground at any speed; standing still it breathes. No clock, no state: the same inputs always give the same pose.
 */
export function modelMotionAt(m: ModelMotion, h: number, p: { v: number; d: number; time: number }, turn = 0): ModelPose {
  const H = Math.max(0.05, h); const v = Math.max(0, Number.isFinite(p.v) ? p.v : 0); const d = Number.isFinite(p.d) ? p.d : 0; const time = Number.isFinite(p.time) ? p.time : 0;
  const go = smooth(0.08, 0.6, v); /* 0 standing … 1 moving */ const tr = Number.isFinite(turn) ? turn : 0;
  const lean = Math.max(-0.3, Math.min(0.3, -tr * Math.min(v, 3) * 0.09)) * go; /* into the turn, more at speed */
  const breathe = Math.sin(time * Math.PI * 2 * 0.45) * (1 - go);
  if (m === 'moves') return { lift: 0, yaw: 0, lean: lean * 0.5, pitch: 0, sx: 1, sy: 1 }; /* its own clips move it (userModels.ts): only a slight lean into turns */
  if (m === 'glide') { const float = 0.06 * H + 0.025 * H * Math.sin(time * Math.PI * 2 * 0.6);
    return { lift: float, yaw: 0, lean: lean * 1.3, pitch: 0.14 * Math.min(1, v / 2.5) * go, sx: 1 - 0.008 * breathe, sy: 1 + 0.015 * breathe }; }
  if (m === 'waddle') { const step = 0.22 * H + 0.12; const a = (d / step) * Math.PI; const rock = Math.sin(a) * go;
    return { lift: Math.abs(Math.sin(a)) * 0.035 * H * go, yaw: Math.sin(a) * 0.09 * go, lean: lean + rock * 0.13, pitch: 0.05 * Math.min(1, v / 2) * go, sx: 1 - 0.01 * breathe, sy: 1 + 0.02 * breathe }; }
  /* hop: one hop every L metres; up and down on a parabola; squashed at each landing, stretched in the air */
  const L = 0.32 * H + 0.28; const k = fract(d / L); const up = 4 * k * (1 - k); const hopH = (0.16 * H + 0.04) * Math.min(1, v / 1.1 + 0.25) * go;
  const land = (1 - smooth(0, 0.16, k)) + smooth(0.86, 1, k); /* near a landing: 1 */ const air = smooth(0.15, 0.45, k) * (1 - smooth(0.55, 0.85, k));
  const sy = 1 + (0.09 * air - 0.17 * land) * go + 0.02 * breathe; const sx = 1 / Math.sqrt(Math.max(0.5, sy));
  return { lift: up * hopH, yaw: 0, lean, pitch: (0.08 * Math.min(1, v / 2) + 0.06 * (k - 0.5)) * go, sx, sy };
}

// ---------- the Render prompt ----------
const PERSON = /\b(a|A) (?:fictional )?(?:adult|person) in (?:a )?(?:warm orange|deep blue|teal|brick red|cream|near-black)(?: jacket)?/;
/** what the Render calls a model: its words, else its name */
const wordsOf = (m: PlacedModel) => (m.desc || m.name).replace(/[.\s]+$/, '');
/**
 * A restyle prompt with your models in it: the actor model takes the place of the preset's person ("a fictional adult in a warm orange jacket" →
 * "Mossbun, a small moss-green forest creature…"), or is added when the preset has no person; the other models are named once at the end.
 */
export function castPromptFor(text: string, shot: Pick<PlanShot, 'models'>): string {
  const list = shot.models ?? []; if (!list.length) return text; const star = starOf(shot); let out = text;
  if (star) { const w = wordsOf(star); const hit = PERSON.exec(out);
    if (hit) out = out.replace(PERSON, (_m, a: string) => (a === 'A' ? w.replace(/^[a-z]/, (c) => c.toUpperCase()) : w));
    else out = `${out.replace(/[.\s]+$/, '')}. The main character is ${w}.`; }
  const props = list.filter((m) => m !== star).map(wordsOf).filter(Boolean);
  if (props.length) out = `${out.replace(/[.\s]+$/, '')}. Also in the scene: ${props.join('; ')}.`;
  return out;
}
/** The acting line with the actor model's name and motion: "The person: 0–3 s walks" → "Mossbun: 0–3 s hops". Unchanged without one. */
export function castActionLine(line: string, shot: Pick<PlanShot, 'models'>): string {
  const star = starOf(shot); if (!star || !line) return line; const mo = MODEL_MOTIONS.find((x) => x.id === star.actor)!;
  return line.replace(/^The person:/, `${star.name}:`).replace(/\bwalks\b/g, mo.verb).replace(/\bruns\b/g, mo.fast);
}
/** Where the actor model stands when nothing moves it (no performance, not the walk-by): its spot, facing its turn. */
export const starRest = (m: PlacedModel, ground: number): { pos: Vec3; heading: number } => ({ pos: [m.x, ground, m.z], heading: m.r });
/**
 * Your models when the preset changes: they come along (props you dropped stay with their set), re-placed for the new set: the actor where a
 * person starts there, the others in a row beside it, each at the new set's starting size, facing the way the set faces.
 */
export function carryModels(list: PlacedModel[] | undefined, template: string, at: { pos: Vec3; heading: number }): PlacedModel[] | undefined {
  if (!list?.length) return undefined; const side: [number, number] = [Math.cos(at.heading), -Math.sin(at.heading)]; let k = 0;
  return list.map((m) => { const h = startHeight(m.fw, template); const off = m.actor ? 0 : (++k) * Math.max(0.6, h * m.fw + 0.4) * (k % 2 ? 1 : -1);
    return { ...m, h, x: r3(at.pos[0] + side[0] * off), z: r3(at.pos[2] + side[1] * off), r: r4(wrap(at.heading)) }; });
}
