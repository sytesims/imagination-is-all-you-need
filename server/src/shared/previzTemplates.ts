/**
 * Direct a Shot (3D tab, 2026-10-24): set up a scene and a camera move in simple 3D, scrub it, record it as a video, and later (step 2) let a
 * video model turn that rough clip into a real-looking one while keeping the exact motion and framing. Isomorphic: no server or browser imports.
 * In code this is "previz" (pre-visualisation); the UI calls it Direct a Shot, the templates "presets" and the passes "views".
 *
 *  - PREVIZ_TEMPLATES: our five presets (our own words; see docs/PLAN-A-SHOT.md). Each one has its parameters' defaults, the build
 *    prompt a coding agent can follow to write a richer scene of the same kind, and the restyle prompts (long + short) for step 2.
 *  - PlanShot: the ONE serialisable object that describes a shot (preset, colour, camera move, speed, length, aspect, fps, seed, the
 *    "Describe your shot" note). The page, the capture job and a future helper agent all read and write this object, nothing else.
 *  - cameraAt / subjectAt: the camera rig and the subject's path as pure functions of t (no three.js), so the live player, the capture,
 *    the path drawing and the tests all agree, and step 2 can export camera.json from the same numbers.
 *  - Fly the camera: takes flown by hand (cameraPath: keyframes, smoothing, trim, speed), the ground clamp, the map drags (place) and flyStep,
 *    all pure, so a chosen take drives cameraAt exactly like a preset move does.
 *  - validatePrevizContract / checkSceneHtml: the import contract for a scene a coding agent wrote (window.previz = {duration, seek, setPass}).
 */

import { normalizeActor, actorAt, type ActorTrack } from './previzActor.js';
import { isCityTemplate, openCityWorld } from './world/openCity.js';
import { PROP_PIECES } from './world/propCatalog.js';
import { KIT } from './world/kitCatalog.js';
import { normalizeModels, starOf, frameHeightOf, type PlacedModel } from './previzModels.js';
import { clampRoll, isLens, isShotSize, lensFov, sizeFrame, normalizeShake, normalizeTakeRecipe, shakeAt, sizeDistance, subjectHeight, type LensMm, type ShotShake, type ShotSize, type TakeRecipe } from './previzCamera.js';

export type PrevizTemplateId = 'walk-by' | 'product-hero' | 'walkthrough' | 'diorama' | 'establishing' | 'open-city' | 'open-city-golden' | 'open-city-night';
export type PrevizMove = 'dolly' | 'orbit' | 'push-in' | 'crane';
export type PrevizSpeed = 'slow' | 'normal' | 'fast';
export type PrevizAspect = '16:9' | '9:16' | '1:1';
export type PrevizPass = 'beauty' | 'clay' | 'depth';
export type PrevizFps = 24 | 30;
export type Vec3 = [number, number, number];

/** One shot, fully described. Serialisable as JSON; every field has a safe default (normalizePlanShot). */
export interface PlanShot {
  template: PrevizTemplateId;
  /** subject colour id (PREVIZ_COLOURS) */ colour: string;
  move: PrevizMove; speed: PrevizSpeed;
  /** 3–10 s */ seconds: number;
  aspect: PrevizAspect; fps: PrevizFps;
  /** seeds the scene's small random details (trees, buildings, windows) */ seed: number;
  /** "Describe your shot": kept with the shot for a later helper; not used by the scene yet */ note: string;
  /** Fly the camera: the takes you flew by hand (keyframes against the shot's clock) and which one drives the camera; absent = the preset move */
  cameraPath?: CameraPath;
  /** Dragged on the top-down map (metres on the ground, x and z): `aim` moves the subject / what the camera aims at, `cam` moves the preset
   *  move's camera. Absent = where the preset puts them. */
  place?: { cam: [number, number]; aim: [number, number] };
  /** Add props (2026-10-26): kit pieces you dropped into the set (web/src/shared/previz/kits.ts); absent = none */
  props?: PlacedProp[];
  /** Lens and size (2026-10-27, previzCamera.ts): the preset move's focal length (mm) and shot size; absent = the preset's own */
  lens?: LensMm; size?: ShotSize;
  /** Camera feel: a seeded shake over whichever camera drives the shot (shakeAt); absent = tripod, exactly as before */
  shake?: ShotShake;
  /** Your 3D models (2026-10-27, previzModels.ts): GLBs from the 3D tab or uploaded, placed as props or one played as the actor; absent = none */
  models?: PlacedModel[];
}
/** One prop in the set: k = the kit piece id (world/propCatalog.ts or world/kitCatalog.ts), x / z on the ground (metres; it stands on the
 *  ground there), r = its turn about the vertical (radians), s = its size (1 = true size; the diorama drops them at miniature size). */
export interface PlacedProp { k: string; x: number; z: number; r: number; s: number }
export const PROPS_MAX = 40; export const PROP_SCALE_MIN = 0.05; export const PROP_SCALE_MAX = 4;
/** a kit piece the drawer offers (the id must be known to one of the catalogs) */
export const isPropPiece = (k: unknown): k is string => typeof k === 'string' && k.length < 80 && (Object.prototype.hasOwnProperty.call(PROP_PIECES, k) || Object.prototype.hasOwnProperty.call(KIT, k));
/** One recorded camera pose. t: seconds from the start of the take; yaw: turn left/right (0 looks towards −z, positive turns left);
 *  pitch: look up (+) / down (−), radians; fov: the lens (vertical degrees for a 16:9 frame; tall frames open it the way the presets do). */
export interface CameraKey { t: number; pos: Vec3; yaw: number; pitch: number; fov: number;
  /** roll about the view axis (radians, ±ROLL_MAX; absent = 0, a level horizon) */ roll?: number; /** focus distance in metres (absent = 0: none set) */ focus?: number }
/** A take: the keyframes plus its clean-up (smoothing 0–1, trim in take seconds, playback speed). */
export interface CameraTake { id: string; name: string; keys: CameraKey[]; smooth: number; trimStart: number; trimEnd: number; speed: number;
  /** Play the actor (previzActor.ts): the person you played in this take, on the same clock as the camera keys; absent = a camera-only take */ actor?: ActorTrack;
  /** Perform, then shoot (2026-10-26): this take is a camera angle shot of a performance (the take `of`, whose person it replays: actor is a copy of
   *  that track on the same clock), its number among that performance's angles, and the playback rate it was shot at (0.5 = slow motion) */ shoot?: TakeShoot;
  /** Shot Recipes (2026-10-27): the recipe this take was baked from, with its lens and size (changing them bakes it again) */ recipe?: TakeRecipe }
export interface TakeShoot { of: string; angle: number; rate: number }
export interface CameraPath { takes: CameraTake[]; /** the take that drives the camera; null = the preset move */ chosen: string | null }

export const PREVIZ_TOOL = 'plan-a-shot';
export const PREVIZ_WORKFLOW_ID = 'plan-a-shot';
export const PREVIZ_MOVES: { id: PrevizMove; label: string; hint: string }[] = [
  { id: 'dolly', label: 'Dolly', hint: 'The camera slides alongside' },
  { id: 'orbit', label: 'Orbit', hint: 'The camera circles the subject' },
  { id: 'push-in', label: 'Push in', hint: 'The camera moves closer' },
  { id: 'crane', label: 'Crane', hint: 'The camera rises up' },
];
export const PREVIZ_SPEEDS: { id: PrevizSpeed; label: string; amount: number }[] = [
  { id: 'slow', label: 'Slow', amount: 0.6 }, { id: 'normal', label: 'Normal', amount: 1 }, { id: 'fast', label: 'Fast', amount: 1.5 }];
export const PREVIZ_ASPECTS: PrevizAspect[] = ['16:9', '9:16', '1:1'];
/** Capture size per aspect (even sides; 720p class, which is what step 2's video models take). */
export const PREVIZ_SIZES: Record<PrevizAspect, { w: number; h: number }> = { '16:9': { w: 1280, h: 720 }, '9:16': { w: 720, h: 1280 }, '1:1': { w: 960, h: 960 } };
export const PREVIZ_FPS: PrevizFps[] = [24, 30];
export const PREVIZ_MIN_SECONDS = 3; export const PREVIZ_MAX_SECONDS = 10;
export const PREVIZ_PASSES: { id: PrevizPass; label: string; hint: string }[] = [
  { id: 'beauty', label: 'Simple', hint: 'Flat colours and soft light: the plain look of the plan' },
  { id: 'clay', label: 'Clay', hint: 'Everything in one grey: shapes and motion only' },
  { id: 'depth', label: 'Depth', hint: 'Near is white, far is black: how far each thing is from the camera' },
];
export const PREVIZ_COLOURS: { id: string; label: string; hex: string; words: string }[] = [
  { id: 'orange', label: 'Orange', hex: '#FF7A1A', words: 'warm orange' },
  { id: 'blue', label: 'Blue', hex: '#4A6FD6', words: 'deep blue' },
  { id: 'teal', label: 'Teal', hex: '#2F9C96', words: 'teal' },
  { id: 'red', label: 'Red', hex: '#C9453C', words: 'brick red' },
  { id: 'cream', label: 'Cream', hex: '#E9DFC8', words: 'cream' },
  { id: 'ink', label: 'Ink', hex: '#2B2D35', words: 'near-black' },
];
export const colourOf = (id: string) => PREVIZ_COLOURS.find((c) => c.id === id) ?? PREVIZ_COLOURS[0];

export interface PrevizTemplate {
  id: PrevizTemplateId; name: string; tagline: string;
  /** what the subject is, for the colour picker ("Jacket colour") */ subjectLabel: string;
  defaults: Omit<PlanShot, 'template' | 'note' | 'seed'>;
  /** the stage the camera rig works from: the look-at point, the camera's distance and height, the lens */
  stage: { target: Vec3; radius: number; height: number; fov: number; /** how far a dolly slides, metres */ span: number; /** interior: dolly is a forward glide */ interior?: boolean; depthFar: number };
  /** for step 2 (the repaint): {colour} is filled with the subject colour's words */
  restyle: { long: string; short: string };
  /** a richer version of this scene for a coding agent; the contract block is added by buildPromptFor() */
  build: string;
}

export const PREVIZ_TEMPLATES: PrevizTemplate[] = [
  { id: 'walk-by', name: 'Walk-by', tagline: 'A figure walks across a street while the camera follows', subjectLabel: 'Jacket colour',
    defaults: { colour: 'orange', move: 'dolly', speed: 'normal', seconds: 6, aspect: '16:9', fps: 24 },
    stage: { target: [0, 1.1, 0], radius: 6.5, height: 1.5, fov: 38, span: 2.4, depthFar: 30 },
    restyle: {
      long: 'Take only the camera motion, the timing, the framing and the path the person walks from the guide clip. Replace every simple shape with a real place: a fictional adult in a {colour} jacket walking along a quiet city street in late afternoon sun, shop fronts and trees behind, natural skin and fabric. Smooth out any stiff or robotic movement while keeping the same pace. No text, no logos, no readable signs.',
      short: 'A fictional adult in a {colour} jacket walks down a sunny city street, camera tracking alongside, natural motion.',
    },
    build: 'Scene: a plain street set. A smooth mannequin (capsules and spheres, no face, no fingers, about 1.75 m tall) walks from left to right across the frame with a relaxed walk cycle: arms swing against the legs, the hips shift, the feet plant without sliding. Behind it, a pavement strip, a kerb, a row of simple building blocks of different heights and a few round trees, all in flat colours. The jacket (the torso) is {colour}.' },
  { id: 'product-hero', name: 'Product hero', tagline: 'An unbranded bottle turns on a stand as the camera moves in', subjectLabel: 'Bottle colour',
    defaults: { colour: 'orange', move: 'push-in', speed: 'slow', seconds: 6, aspect: '9:16', fps: 24 },
    stage: { target: [0, 0.95, 0], radius: 2.9, height: 1.2, fov: 32, span: 1.2, depthFar: 10 },
    restyle: {
      long: 'Take only the camera motion, the timing, the framing and the slow turn of the bottle from the guide clip. Make it a premium studio commercial: an unbranded glass bottle with a {colour} tint and a matte cap on a stone pedestal, soft daylight from one side, gentle reflections, a smooth seamless backdrop, shallow depth of field. No labels, no text, no logos, no hands.',
      short: 'An unbranded {colour} glass bottle turning slowly on a stone pedestal, soft studio light, shallow focus.',
    },
    build: 'Scene: a small studio. A round pedestal (a short wide cylinder) stands on a seamless floor that curves up into a backdrop. On it, an unbranded bottle built from a cylinder body, a rounded shoulder, a short neck and a cap; the body is {colour}. The pedestal turns about 40 degrees over the clip. One big soft key light from the upper left and a faint rim from behind. No label, no text.' },
  { id: 'walkthrough', name: 'Home walkthrough', tagline: 'A slow eye-level glide through a few simple rooms', subjectLabel: 'Sofa colour',
    defaults: { colour: 'orange', move: 'dolly', speed: 'slow', seconds: 8, aspect: '16:9', fps: 24 },
    stage: { target: [0, 1.4, -6], radius: 0, height: 1.6, fov: 58, span: 7, interior: true, depthFar: 16 },
    restyle: {
      long: 'Take only the camera path, the pace, the room layout and the framing from the guide clip. Show a calm, bright home: pale wooden floors, white walls, large windows with daylight, a {colour} sofa in the living room, simple modern furniture where the guide has blocks. Walls, doors and furniture stay exactly where the guide puts them. No people, no text, no artwork with writing.',
      short: 'A slow daylight walk through a bright modern home with pale wood floors and a {colour} sofa.',
    },
    build: 'Scene: three rooms in a row (hall, living room, kitchen) built from a floor plan object, so every wall comes from data. Walls are thin boxes with door gaps and window holes; furniture is blocks (a {colour} sofa, a low table, a dining table with four chairs, a kitchen counter). The camera stays at eye height (1.6 m), never closer than 0.4 m to a wall, and glides forward through the doors.' },
  { id: 'diorama', name: 'Diorama world', tagline: 'A snowy village on a round base, a toy train loops, the camera circles', subjectLabel: 'Train colour',
    defaults: { colour: 'orange', move: 'orbit', speed: 'normal', seconds: 8, aspect: '16:9', fps: 24 },
    stage: { target: [0, 0.35, 0], radius: 9, height: 5.2, fov: 34, span: 3, depthFar: 24 },
    restyle: {
      long: 'Take only the camera motion, the timing, the framing and where things move from the guide clip. Render it as a real, full-size snowy village seen from a drone: wooden cabins with snow on the roofs, snowy pines, a frozen pond, a {colour} train crossing on a raised track, warm lit windows in soft dusk light and a little haze. No round base, no miniature look, no readable signs, no logos.',
      short: 'Drone view over a snowy village at dusk, wooden cabins and pines, a {colour} train crossing on a raised track, warm windows, light haze.',
    },
    build: 'Scene: a miniature snowy village on a round base you can see from outside. Small cabins with snowy roofs in a few sizes placed by a seeded generator, snowy pines, a circular raised track on pillars with a short {colour} train that runs one loop over the clip, and a small pond. Everything sits on the base; nothing floats.' },
  { id: 'establishing', name: 'Establishing shot', tagline: 'Hills, a hilltop town and a tower under a wide sky', subjectLabel: 'Roof colour',
    defaults: { colour: 'orange', move: 'crane', speed: 'normal', seconds: 8, aspect: '16:9', fps: 24 },
    stage: { target: [0, 2.2, -4], radius: 15, height: 2.2, fov: 40, span: 6, depthFar: 70 },
    restyle: {
      long: 'Take only the camera motion, the framing and where every building and hill sits from the guide clip. Render a wide cinematic establishing shot of a hilltop town: white walls, {colour} roofs, a tall stone tower, green hills rolling away, soft late-day sun, drifting clouds and atmospheric haze in the distance. No text, no flags with symbols, no logos, no people.',
      short: 'A cinematic aerial of a hilltop town with {colour} roofs and a stone tower, hills and haze under late sun.',
    },
    build: 'Scene: an outdoor plate. Rolling hills (a few large smooth domes), a hilltop town of simple houses with {colour} roofs, one tall tower, a winding path, and layers of distant hills that fade into fog. A big soft sky. Readable shapes, nothing tiny or repeated.' },
  // Open city (2026-10-26): a big explorable map (world/cityGen.ts) built from CC0 kits; three lighting variants share the same streets.
  { id: 'open-city', name: 'Open city', tagline: 'A sunny seaside city to walk, drive by and fly over: downtown, park, suburbs, beach', subjectLabel: 'Jacket colour',
    defaults: { colour: 'orange', move: 'crane', speed: 'normal', seconds: 8, aspect: '16:9', fps: 24 },
    stage: { target: [-30, 4, -116], radius: 26, height: 2.4, fov: 42, span: 14, depthFar: 220 },
    restyle: {
      long: 'Take only the camera motion, the timing, the framing and where every building, street, tree and car sits from the guide clip. Render it as a real, lived-in coastal city on a clear sunny day: stucco and brick buildings, glass towers, palm trees, warm asphalt with painted lines, parked and passing cars, a few fictional people in {colour} and everyday clothes. Natural light, soft haze in the distance, true-to-life scale. No text, no logos, no readable signs, no toy or miniature look.',
      short: 'A real sunny coastal city, palm-lined avenue and glass towers, cars passing, a person in {colour}, natural light, no text or logos.',
    },
    build: 'Scene: an open city of about 800 m on a 10 m street grid: a main avenue with a palm median from wooded hills down to a beach and a pier, downtown towers on one side, low shops and courtyards, a park with a plaza and a pond, houses with gardens and fences, street lights, parked cars and cars driving loops. A person in a {colour} jacket can walk it.' },
  { id: 'open-city-golden', name: 'Open city · golden hour', tagline: 'The same city at sunset: long shadows, warm light over the beach and the pier', subjectLabel: 'Jacket colour',
    defaults: { colour: 'orange', move: 'orbit', speed: 'slow', seconds: 8, aspect: '16:9', fps: 24 },
    stage: { target: [135, 3, 330], radius: 42, height: 7, fov: 40, span: 20, depthFar: 320 },
    restyle: {
      long: 'Take only the camera motion, the timing, the framing and where every building, street, palm and car sits from the guide clip. Render a real seaside city at golden hour: a low warm sun, long soft shadows, glowing building faces, palms in silhouette, a wooden pier over calm water catching the light, a fictional person in {colour} where the guide has one. Cinematic colour, gentle haze. No text, no logos, no readable signs, no miniature look.',
      short: 'A real seaside city and wooden pier at golden hour, warm low sun, palms, calm sea, a person in {colour}, no text or logos.',
    },
    build: 'Scene: the same open city at sunset. A low warm sun from the west, long shadows across the streets, an orange sky fading to blue, the sea and the pier in the foreground.' },
  { id: 'open-city-night', name: 'Open city · night', tagline: 'The same city after dark: lit windows, street lights, headlights on the avenue', subjectLabel: 'Jacket colour',
    defaults: { colour: 'orange', move: 'push-in', speed: 'slow', seconds: 8, aspect: '16:9', fps: 24 },
    stage: { target: [15, 6, -205], radius: 34, height: 3.2, fov: 44, span: 16, depthFar: 260 },
    restyle: {
      long: 'Take only the camera motion, the timing, the framing and where every building, street, tree and car sits from the guide clip. Render a real city at night: warm lit windows in the towers, sodium and LED street lights pooling on wet-looking asphalt, headlights and tail lights on the avenue, a deep blue sky, a fictional person in a {colour} jacket where the guide has one. Cinematic night photography, soft bloom, no noise. No text, no logos, no readable signs, no miniature look.',
      short: 'A real city avenue at night, lit windows, street lights, headlights, a person in a {colour} jacket, no text or logos.',
    },
    build: 'Scene: the same open city at night: a dark blue sky, warm lit windows scattered across the buildings, street lights glowing along every kerb, cars with headlights driving the loops.' },
];
export const PREVIZ_DEFAULT_TEMPLATE: PrevizTemplateId = 'walk-by';
export const previzTemplate = (id: string | null | undefined): PrevizTemplate | null => PREVIZ_TEMPLATES.find((t) => t.id === id) ?? null;

// ---------- the shot object ----------
const pick = <T extends string | number>(v: unknown, ok: readonly T[], d: T): T => (ok as readonly unknown[]).includes(v) ? (v as T) : (ok as readonly unknown[]).includes(Number(v)) ? (Number(v) as T) : d;
export const clampSeconds = (s: unknown) => { const n = Number(s); return Number.isFinite(n) ? Math.max(PREVIZ_MIN_SECONDS, Math.min(PREVIZ_MAX_SECONDS, Math.round(n))) : 6; };
/** Defaults for a preset (seed 7, empty note). */
export function defaultPlanShot(id: PrevizTemplateId = PREVIZ_DEFAULT_TEMPLATE): PlanShot { const t = previzTemplate(id) ?? PREVIZ_TEMPLATES[0]; return { template: t.id, ...t.defaults, seed: 7, note: '' }; }
/** Any input (a saved draft, a form, an agent's JSON) → a valid PlanShot. Unknown values fall back to the preset's defaults. */
export function normalizePlanShot(raw: unknown): PlanShot {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const t = previzTemplate(String(r.template ?? '')) ?? PREVIZ_TEMPLATES[0]; const d = t.defaults;
  const seed = Number(r.seed); const note = typeof r.note === 'string' ? r.note.slice(0, 600) : '';
  const extra: Partial<PlanShot> = {}; const cp = normalizeCameraPath(r.cameraPath); if (cp) extra.cameraPath = cp; const pl = normalizePlace(r.place); if (pl) extra.place = pl; const pr = normalizeProps(r.props); if (pr) extra.props = pr;
  if (isLens(r.lens)) extra.lens = r.lens; if (isShotSize(r.size)) extra.size = r.size; const sk = normalizeShake(r.shake); if (sk) extra.shake = sk;
  const md = normalizeModels(r.models); if (md) extra.models = md;
  return { ...shotCore(t, r, d, seed, note), ...extra };
}
function shotCore(t: PrevizTemplate, r: Record<string, unknown>, d: PrevizTemplate['defaults'], seed: number, note: string): PlanShot {
  return { template: t.id, colour: PREVIZ_COLOURS.some((c) => c.id === r.colour) ? String(r.colour) : d.colour, move: pick(r.move, PREVIZ_MOVES.map((m) => m.id), d.move),
    speed: pick(r.speed, PREVIZ_SPEEDS.map((s) => s.id), d.speed), seconds: r.seconds == null || r.seconds === '' || !Number.isFinite(Number(r.seconds)) ? d.seconds : clampSeconds(r.seconds), aspect: pick(r.aspect, PREVIZ_ASPECTS, d.aspect),
    fps: pick(r.fps, PREVIZ_FPS, d.fps), seed: Number.isInteger(seed) && seed >= 0 ? seed % 2147483647 : 7, note };
}
export const previzFrameCount = (seconds: number, fps: number) => Math.round(seconds * fps);
export const fillColour = (text: string, colourId: string) => text.replace(/\{colour\}/g, colourOf(colourId).words);
export function restylePromptFor(shot: PlanShot, kind: 'long' | 'short'): string { const t = previzTemplate(shot.template) ?? PREVIZ_TEMPLATES[0]; return fillColour(t.restyle[kind], shot.colour); }

// ---------- deterministic helpers ----------
/** mulberry32: a small repeatable random generator (seeded; never Math.random). */
export function rng(seed: number): () => number { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** smootherstep: starts and ends at rest, with no one-frame jump at the start of a move */
export const smoother = (x: number) => { const k = clamp01(x); return k * k * k * (k * (k * 6 - 15) + 10); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Walk-by: the top of the pavement the figure walks on (metres). The figure's feet stand on it, never below. */
export const WALK_FLOOR_Y = 0.14;
/** Diorama: the top of the raised ring track; the train's wheels sit on it. */
export const TRAIN_Y = 0.905;
/** Diorama: the ring track's radius. */
export const TRACK_R = 2.4;

/** Where the subject is at t (only the walk-by figure and the diorama train travel). The walk-by figure and the product's stand follow a
 *  map drag (place.aim); the diorama train stays on its track. */
export function subjectAt(shot: PlanShot, t: number): { pos: Vec3; heading: number; phase: number } {
  const b = subjectBase(shot, t); if (shot.template !== 'walk-by' && shot.template !== 'product-hero') return b;
  const [ax, az] = aimOffset(shot); return { ...b, pos: [b.pos[0] + ax, b.pos[1], b.pos[2] + az] };
}
function subjectBase(shot: PlanShot, t: number): { pos: Vec3; heading: number; phase: number } {
  const k = clamp01(t / shot.seconds);
  /* a relaxed walk: up to 6.4 m, never faster than 1.3 m/s; one gait cycle (two steps) every 1.4 m, so the feet match the ground */
  if (shot.template === 'walk-by') { const run = Math.min(6.4, 1.3 * shot.seconds); const x = lerp(-run / 2, run / 2, k); return { pos: [x, WALK_FLOOR_Y, 0], heading: Math.PI / 2, phase: (((x + run / 2) / 1.4) % 1 + 1) % 1 }; }
  if (shot.template === 'diorama') { const a = k * Math.PI * 2; return { pos: [Math.cos(a) * TRACK_R, TRAIN_Y, Math.sin(a) * TRACK_R], heading: -a, phase: k }; }
  if (shot.template === 'product-hero') return { pos: [0, 0, 0], heading: smoother(k) * 0.7, phase: k };
  return { pos: [0, 0, 0], heading: 0, phase: k };
}

/**
 * The walk-by figure's pose for a gait phase (0–1), pure so the engine and the tests agree. Limbs hang from their pivots; angles in radians
 * (x rotation, positive swings the limb backwards). hipY is solved from the legs so the lower foot always touches the floor exactly:
 * no sinking into the pavement, no floating mid-stride.
 */
export const WALK_RIG = { pelvisDrop: 0.02, thigh: 0.46, shin: 0.45, footDrop: 0.47, footFwd: 0.06, footHalf: 0.035 } as const;
export function walkPose(phase: number): { hipY: number; legs: { thigh: number; shin: number }[]; arms: { up: number; fore: number }[]; hipYaw: number; torsoYaw: number } {
  const a = phase * Math.PI * 2;
  /* 2026-10-25: the thigh swings forward (negative x) while the knee is bent (swing phase) and back while the foot is planted (stance);
     it used to be the other way round, so the figure moonwalked. Arms swing opposite to the leg on the same side. */
  const legs = [0, 1].map((i) => { const p = a + i * Math.PI; return { thigh: -Math.sin(p) * 0.42, shin: Math.max(0, Math.sin(p + 1.4)) * 0.75 + 0.05 }; });
  const arms = [0, 1].map((i) => { const p = a + i * Math.PI; return { up: Math.sin(p) * 0.36, fore: -0.28 - Math.max(0, Math.sin(p)) * 0.25 }; });
  const hipY = Math.max(...legs.map((l) => footDrop(l.thigh, l.shin)));
  return { hipY, legs, arms, hipYaw: Math.sin(a) * 0.08, torsoYaw: -Math.sin(a) * 0.12 };
}
/** How far below the hip pivot a foot's sole is, for a thigh and knee angle (the rig in WALK_RIG). */
export function footDrop(thigh: number, shin: number): number {
  const R = WALK_RIG; const f = thigh + shin;
  /* the foot box's lowest corner: its centre (0, −footDrop, footFwd) in the shin's frame, minus half its height, plus the heel/toe tilt */
  return R.pelvisDrop + R.thigh * Math.cos(thigh) + R.footDrop * Math.cos(f) + R.footFwd * Math.sin(f) + R.footHalf * Math.cos(f) + 0.12 * Math.abs(Math.sin(f));
}

/** Vertical field of view for an aspect: tall frames open up a little so the subject still fits across. */
export const fovFor = (base: number, aspect: PrevizAspect) => aspect === '9:16' ? base * 1.45 : aspect === '1:1' ? base * 1.3 : base; /* 1:1 keeps most of the wide frame's width in view */

/** The camera at t: position, look-at point and vertical lens (degrees). Pure; same shot + same t → the same numbers.
 *  A chosen flown take drives it when there is one; otherwise the preset move, moved by the map drags. Never below the ground. */
export function cameraAt(shot: PlanShot, t: number): { pos: Vec3; look: Vec3; fov: number; /** radians about the view axis; 0 = level */ roll: number } {
  const c = baseCameraAt(shot, t); if (!shot.shake) return c;
  /* camera feel: the seeded shake on top of whatever camera drives the shot (pure in seed and t; small sets shake less in metres) */
  const tt = Math.max(0, Math.min(shot.seconds, Number.isFinite(t) ? t : 0)); const r = (previzTemplate(shot.template) ?? PREVIZ_TEMPLATES[0]).stage.radius;
  const sh = shakeAt(shot.shake, shot.seed, tt, shot.seconds, Math.max(0.15, Math.min(1, (r || 6) / 6))); if (!sh) return c;
  const dx = c.look[0] - c.pos[0], dy = c.look[1] - c.pos[1], dz = c.look[2] - c.pos[2]; const dist = Math.hypot(dx, dy, dz) || 1; const h = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dx, -dz) + sh.yaw, pitch = Math.max(-PITCH_MAX - 0.05, Math.min(PITCH_MAX + 0.05, Math.atan2(dy, h || 1e-9) + sh.pitch)); const d = lookDir(yaw, pitch);
  const pos = clampCamera(shot.template, [c.pos[0] + sh.pos[0], c.pos[1] + sh.pos[1], c.pos[2] + sh.pos[2]]);
  return { pos, look: [pos[0] + d[0] * dist, pos[1] + d[1] * dist, pos[2] + d[2] * dist], fov: c.fov, roll: clampRoll(c.roll + sh.roll) };
}
function baseCameraAt(shot: PlanShot, t: number): { pos: Vec3; look: Vec3; fov: number; roll: number } {
  const take = chosenTake(shot);
  if (take) { const p = takePoseAt(take, takeTimeAt(take, Math.max(0, Math.min(shot.seconds, Number.isFinite(t) ? t : 0)))); const pos = clampCamera(shot.template, p.pos); const d = lookDir(p.yaw, p.pitch);
    return { pos, look: [pos[0] + d[0] * 4, pos[1] + d[1] * 4, pos[2] + d[2] * 4], fov: fovFor(p.fov, shot.aspect), roll: clampRoll(p.roll ?? 0) }; }
  const c = framedPresetAt(shot, t); const [ax, az] = aimOffset(shot); const [cx, cz] = camOffset(shot);
  if (!ax && !az && !cx && !cz) return { ...c, pos: clampCamera(shot.template, c.pos), roll: 0 };
  return { pos: clampCamera(shot.template, [c.pos[0] + ax + cx, c.pos[1], c.pos[2] + az + cz]), look: [c.look[0] + ax, c.look[1], c.look[2] + az], fov: c.fov, roll: 0 };
}
/** The preset move with the shot's lens and size: the lens sets the field of view; the size moves the camera along its line to the look-at point
 *  (one factor for the whole move, fitted at its middle, so the move keeps its shape). Indoors the size doesn't apply (the glide is the shot). */
function framedPresetAt(shot: PlanShot, t: number): { pos: Vec3; look: Vec3; fov: number } {
  const c = presetCameraAt(shot, t); if (!shot.size) return c; const s = (previzTemplate(shot.template) ?? PREVIZ_TEMPLATES[0]).stage; if (s.interior) return c;
  const mid = presetCameraAt(shot, shot.seconds / 2); const ref = Math.hypot(mid.pos[0] - mid.look[0], mid.pos[1] - mid.look[1], mid.pos[2] - mid.look[2]) || 1;
  const st = shot.template === 'walk-by' ? starOf(shot) : null; const fov = shot.lens ? lensFov(shot.lens) : s.fov; /* your model on the walk: framed on its whole body */
  const want = st ? sizeFrame(shot.size, frameHeightOf(st), true) / (2 * Math.tan((fov * Math.PI) / 360)) : sizeDistance(shot.size, fov, subjectHeight(shot.template, shot.template === 'walk-by')); const f = want / ref;
  return { pos: [c.look[0] + (c.pos[0] - c.look[0]) * f, c.look[1] + (c.pos[1] - c.look[1]) * f, c.look[2] + (c.pos[2] - c.look[2]) * f], look: c.look, fov: c.fov };
}
function presetCameraAt(shot: PlanShot, t: number): { pos: Vec3; look: Vec3; fov: number } {
  const tpl = previzTemplate(shot.template) ?? PREVIZ_TEMPLATES[0]; const s = tpl.stage; const amt = PREVIZ_SPEEDS.find((x) => x.id === shot.speed)?.amount ?? 1;
  const k = smoother(t / shot.seconds); const fov = fovFor(shot.lens ? lensFov(shot.lens) : s.fov, shot.aspect);
  let tg: Vec3 = [...s.target];
  if (shot.template === 'walk-by') { const sx = subjectBase(shot, t).pos[0]; tg = [sx * 0.85, s.target[1], 0]; }
  if (s.interior) {
    // the walkthrough: from the hall (z = +2) towards the kitchen (z ≈ −10)
    if (shot.move === 'dolly') { const z = lerp(2.2, Math.max(-9.4, 2.2 - s.span * 1.25 * amt), k); const sway = Math.sin(k * Math.PI) * 0.35; return { pos: [sway, s.height, z], look: [sway * 0.4 + Math.sin(k * Math.PI * 1.2) * 0.8, 1.45, z - 4], fov }; }
    if (shot.move === 'orbit') { const c: Vec3 = [0, 1.2, -3.6]; const a = lerp(-0.9, 0.9, k) * amt; return { pos: [c[0] + Math.sin(a) * 1.9, s.height, c[2] + Math.cos(a) * 1.9], look: c, fov }; }
    if (shot.move === 'push-in') { const z = lerp(2.0, 2.0 - 3.4 * amt, k); return { pos: [0.2, s.height, z], look: [0.2, 1.35, -10], fov }; }
    const y = lerp(0.7, Math.min(2.5, 0.7 + 1.8 * amt), k); return { pos: [0.6, y, 1.6], look: [0, lerp(1.0, 1.25, k), -4], fov };
  }
  if (shot.move === 'dolly') { const x = tg[0] + (k - 0.5) * s.span * amt * 2; return { pos: [x, s.height, tg[2] + s.radius], look: [tg[0] + (k - 0.5) * s.span * amt * 0.6, tg[1], tg[2]], fov }; }
  if (shot.move === 'orbit') { const a = (k - 0.5) * (Math.PI / 2.2) * amt; return { pos: [tg[0] + Math.sin(a) * s.radius, s.height, tg[2] + Math.cos(a) * s.radius], look: tg, fov }; }
  if (shot.move === 'push-in') { const r = s.radius * Math.max(0.35, 1 - 0.42 * amt * k); const y = lerp(s.height, lerp(s.height, tg[1], 0.35), k); return { pos: [tg[0] + r * 0.18, y, tg[2] + r], look: tg, fov }; }
  // crane: rises and eases back a little; the pitch never reaches straight down
  const top = s.height + s.radius * 0.55 * amt; const y = lerp(Math.max(0.4, s.height * 0.45), top, k); const r = s.radius * (1 + 0.18 * k);
  return { pos: [tg[0], y, tg[2] + r], look: [tg[0], tg[1] + 0.25 * k, tg[2]], fov };
}

/**
 * The Depth view's range (metres from the camera): white at `near`, black at `far`. Fixed for the whole shot (fitted to the camera's
 * nearest and farthest distance to its look-at point over the clip), so the guide never "breathes" brighter or darker as the camera moves.
 */
export function depthRangeFor(shot: PlanShot): { near: number; far: number } {
  const tpl = previzTemplate(shot.template) ?? PREVIZ_TEMPLATES[0]; const s = tpl.stage; let lo = Infinity, hi = 0;
  const flown = !!chosenTake(shot); /* a flown camera has no look-at point: measure to what it aims at (the subject / the middle of the set) */
  for (let i = 0; i <= 32; i++) { const tt = (shot.seconds * i) / 32; const c = cameraAt(shot, tt); const to = flown ? aimAt(shot, tt) : c.look; const d = Math.hypot(to[0] - c.pos[0], to[1] - c.pos[1], to[2] - c.pos[2]); lo = Math.min(lo, d); hi = Math.max(hi, d); }
  const near = s.interior ? 0.3 : Math.max(0.3, lo * 0.5); const far = Math.min(s.depthFar, Math.max(near + 4, hi * (s.interior ? 2.5 : 2)));
  return { near, far: Math.max(far, near + 1) };
}

/** The camera path sampled at n points (the faint path drawing; step 2's camera.json). */
export function cameraPath(shot: PlanShot, n = 48): Vec3[] { return Array.from({ length: n + 1 }, (_, i) => cameraAt(shot, (shot.seconds * i) / n).pos); }

// ---------- fly the camera (2026-10-24): takes flown by hand, clean-up, ground, map drags ----------
/** Limits: how many takes a shot keeps, the longest take, the rate a take is stored at (keys per second). */
export const TAKE_MAX = 12; export const TAKE_MAX_SECONDS = 30; export const TAKE_HZ = 30;
export const TAKE_SMOOTH_DEFAULT = 0.35; export const TAKE_SPEED_MIN = 0.25; export const TAKE_SPEED_MAX = 4; export const TAKE_MIN_SECONDS = 0.2;
/** Smoothing 1 = a gentle average over about ±1.5 s (sigma 0.5 s); 0 = exactly what you flew, shake and all. */
export const TAKE_SMOOTH_SIGMA = 0.5;
/** the camera never tips further than this up or down (radians, about 77°): never straight down, the horizon stays level (no roll) */
export const PITCH_MAX = 1.35;
export const FOV_MIN = 8; export const FOV_MAX = 100;
/** the camera stays at least this far above the ground or floor (metres) */
export const CAM_CLEARANCE = 0.15;
const PLACE_MAX = 8; const POS_MAX = 200;
/** how far a saved key may sit from the centre (the open city is about 800 m across, with hills around it) */ export const KEY_MAX = 650;
/* || 0: never -0 (JSON writes it as 0, so a saved shot would not read back equal) */ const r3 = (x: number) => Math.round(x * 1000) / 1000 || 0; const r4 = (x: number) => Math.round(x * 10000) / 10000 || 0;
const clampN = (x: unknown, lo: number, hi: number, d: number) => { const n = Number(x); return x == null || x === '' || !Number.isFinite(n) ? d : Math.min(hi, Math.max(lo, n)); };

/** The direction the camera looks for a yaw and pitch (unit vector; yaw 0, pitch 0 looks towards −z; positive yaw turns left). */
export function lookDir(yaw: number, pitch: number): Vec3 { const cp = Math.cos(pitch); return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp]; }
/** yaw and pitch that look from a point towards another */
export function yawPitchTo(from: Vec3, to: Vec3): { yaw: number; pitch: number } { const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2]; const h = Math.hypot(dx, dz);
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.max(-PITCH_MAX, Math.min(PITCH_MAX, Math.atan2(dy, h || 1e-9))) }; }

/** Establishing: the three near hills (centre x, z, radius, height); the engine builds them from this list, so the ground clamp matches. */
export const ESTABLISHING_HILLS: [number, number, number, number][] = [[0, -4, 4.2, 1.9], [-11, -10, 7, 2.6], [12, -13, 8, 3.1]];
export function hillHeight(x: number, z: number): number { let y = 0; for (const [hx, hz, r, h] of ESTABLISHING_HILLS) { const d = Math.hypot(x - hx, z - hz) / r; if (d < 1) y = Math.max(y, h * Math.sqrt(1 - d * d)); } return y; }
/** The top of the ground / floor under (x, z) for a preset, metres. */
export function groundAt(template: PrevizTemplateId, x: number, z: number): number {
  if (template === 'walk-by') return Math.abs(x) < 30 && z > -2.2 && z < 1.0 ? WALK_FLOOR_Y : 0;
  if (template === 'diorama') return Math.hypot(x, z) < 4.15 ? 0.32 : 0;
  if (template === 'establishing') return hillHeight(x, z);
  if (isCityTemplate(template)) return openCityWorld().groundAt(x, z);
  return 0;
}
/** Keep a camera position above the ground (and under the ceiling indoors). */
export function clampCamera(template: PrevizTemplateId, p: Vec3): Vec3 {
  if (isCityTemplate(template)) return openCityWorld().clampCamera(p, CAM_CLEARANCE); /* the open city: above the ground, outside every building */
  const x = Math.max(-POS_MAX, Math.min(POS_MAX, p[0])), z = Math.max(-POS_MAX, Math.min(POS_MAX, p[2]));
  let y = Math.max(groundAt(template, x, z) + CAM_CLEARANCE, Math.min(POS_MAX, p[1]));
  if (template === 'walkthrough' && Math.abs(x) < 2.5 && z > -11 && z < 3.1) y = Math.min(y, 2.7 - CAM_CLEARANCE);
  return [x, y, z];
}

/** Map drags, clamped per preset (the walk-by figure stays on the pavement, the bottle in the studio, the walkthrough in the house). */
export function aimOffset(shot: PlanShot): [number, number] {
  const a = shot.place?.aim; if (!a) return [0, 0]; const [x, z] = a;
  if (shot.template === 'walk-by') return [Math.max(-4, Math.min(4, x)), Math.max(-1.6, Math.min(0.8, z))];
  if (shot.template === 'product-hero') return [Math.max(-1.5, Math.min(1.5, x)), Math.max(-2.4, Math.min(1.6, z))];
  if (shot.template === 'walkthrough') return [Math.max(-1.5, Math.min(1.5, x)), Math.max(-3, Math.min(3, z))];
  return [Math.max(-PLACE_MAX, Math.min(PLACE_MAX, x)), Math.max(-PLACE_MAX, Math.min(PLACE_MAX, z))];
}
export function camOffset(shot: PlanShot): [number, number] {
  const c = shot.place?.cam; if (!c) return [0, 0]; const m = shot.template === 'walkthrough' ? 1.5 : PLACE_MAX;
  return [Math.max(-m, Math.min(m, c[0])), Math.max(-m, Math.min(m, c[1]))];
}
/** What the camera aims at, for the map's white circle and the Depth range of a flown take: the person you played in the chosen take, the
 *  walk-by figure, the bottle's stand, or the middle of the set (moved by place.aim). */
export function aimAt(shot: PlanShot, t: number): Vec3 {
  const k = chosenTake(shot); if (k?.actor) { const p = actorAt(k.actor, takeTimeAt(k, Math.max(0, Math.min(shot.seconds, t)))).pos; return [p[0], p[1] + 1.1, p[2]]; } /* a take with a person aims at them */
  const st = starOf(shot); /* your model playing the actor: on the walk-by's walk, else where it stands */
  if (shot.template === 'walk-by') { const p = subjectAt(shot, t).pos; return [p[0], st ? p[1] + frameHeightOf(st) * 0.55 : 1.1, p[2]]; }
  if (st) return [st.x, groundAt(shot.template, st.x, st.z) + frameHeightOf(st) * 0.55, st.z];
  if (shot.template === 'product-hero') { const p = subjectAt(shot, t).pos; return [p[0], 0.95, p[2]]; }
  const tg = (previzTemplate(shot.template) ?? PREVIZ_TEMPLATES[0]).stage.target; const [ax, az] = aimOffset(shot); return [tg[0] + ax, tg[1], tg[2] + az];
}
/** Any input → the props list: known pieces only, at most PROPS_MAX, positions within KEY_MAX, turn wrapped to ±π, size clamped; empty → null. */
export function normalizeProps(raw: unknown): PlacedProp[] | null {
  if (!Array.isArray(raw)) return null; const out: PlacedProp[] = [];
  for (const p of raw) { if (out.length >= PROPS_MAX) break; if (!p || typeof p !== 'object') continue; const o = p as Record<string, unknown>; if (!isPropPiece(o.k)) continue;
    let r = clampN(o.r, -1e4, 1e4, 0); r = Math.atan2(Math.sin(r), Math.cos(r));
    out.push({ k: o.k, x: r3(clampN(o.x, -KEY_MAX, KEY_MAX, 0)), z: r3(clampN(o.z, -KEY_MAX, KEY_MAX, 0)), r: r4(r), s: r3(clampN(o.s, PROP_SCALE_MIN, PROP_SCALE_MAX, 1)) }); }
  return out.length ? out : null;
}
function normalizePlace(raw: unknown): PlanShot['place'] | null {
  if (!raw || typeof raw !== 'object') return null; const r = raw as Record<string, unknown>;
  const two = (v: unknown): [number, number] => Array.isArray(v) ? [r3(clampN(v[0], -PLACE_MAX, PLACE_MAX, 0)), r3(clampN(v[1], -PLACE_MAX, PLACE_MAX, 0))] : [0, 0];
  const cam = two(r.cam), aim = two(r.aim); if (!cam[0] && !cam[1] && !aim[0] && !aim[1]) return null; return { cam, aim };
}

/** Any keyframes (a saved shot, an agent's JSON) → clean, sorted keys starting at t = 0; yaw unwrapped (no spin at ±180°); at most
 *  TAKE_MAX_SECONDS × TAKE_HZ + 1 keys (longer lists are thinned evenly). Fewer than two usable keys → null. */
export function normalizeKeys(raw: unknown): CameraKey[] | null {
  if (!Array.isArray(raw)) return null; const ks: CameraKey[] = [];
  for (const k of raw.slice(0, 20000)) { if (!k || typeof k !== 'object') continue; const o = k as Record<string, unknown>; const p = Array.isArray(o.pos) ? o.pos.map(Number) : [];
    const t = Number(o.t); if (o.t == null || !Number.isFinite(t) || p.length !== 3 || !p.every(Number.isFinite)) continue;
    ks.push({ t, pos: [clampN(p[0], -KEY_MAX, KEY_MAX, 0), clampN(p[1], -KEY_MAX, KEY_MAX, 0), clampN(p[2], -KEY_MAX, KEY_MAX, 0)], yaw: clampN(o.yaw, -1e4, 1e4, 0), pitch: clampN(o.pitch, -PITCH_MAX, PITCH_MAX, 0), fov: clampN(o.fov, FOV_MIN, FOV_MAX, 40), roll: clampRoll(clampN(o.roll, -1, 1, 0)), focus: clampN(o.focus, 0, 1000, 0) }); }
  ks.sort((a, b) => a.t - b.t); if (ks.length < 2) return null; const t0 = ks[0].t; let out: CameraKey[] = [];
  for (const k of ks) { const t = k.t - t0; if (t > TAKE_MAX_SECONDS + 1e-9) break; if (out.length && t - out[out.length - 1].t < 1e-4) continue; out.push({ ...k, t }); }
  if (out.length < 2 || out[out.length - 1].t < 0.05) return null;
  const cap = Math.round(TAKE_MAX_SECONDS * TAKE_HZ) + 1; if (out.length > cap) { const src = out; const step = (src.length - 1) / (cap - 1); out = Array.from({ length: cap }, (_, i) => src[Math.round(i * step)]); }
  for (let i = 1; i < out.length; i++) { let y = out[i].yaw; const prev = out[i - 1].yaw; while (y - prev > Math.PI) y -= Math.PI * 2; while (y - prev < -Math.PI) y += Math.PI * 2; out[i] = { ...out[i], yaw: y }; }
  /* roll and focus are written only when set, so a level take with no focus reads back exactly as before they existed */
  return out.map((k) => { const roll = r4(k.roll ?? 0), focus = Math.round((k.focus ?? 0) * 100) / 100 || 0;
    return { t: r4(k.t), pos: [r3(k.pos[0]), r3(k.pos[1]), r3(k.pos[2])], yaw: r4(k.yaw), pitch: r4(k.pitch), fov: Math.round(k.fov * 100) / 100, ...(roll ? { roll } : {}), ...(focus ? { focus } : {}) }; });
}
/** A take's length in seconds (its last key). */
export const takeLength = (k: { keys: CameraKey[] }) => k.keys[k.keys.length - 1]?.t ?? 0;
export function normalizeTake(raw: unknown, i = 0): CameraTake | null {
  if (!raw || typeof raw !== 'object') return null; const r = raw as Record<string, unknown>; const keys = normalizeKeys(r.keys); if (!keys) return null; const len = takeLength({ keys });
  const id = typeof r.id === 'string' && /^[a-z0-9-]{1,24}$/.test(r.id) ? r.id : `take-${i + 1}`;
  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 40) : `Take ${i + 1}`;
  const minLen = Math.min(TAKE_MIN_SECONDS, len); const trimStart = r3(clampN(r.trimStart, 0, Math.max(0, len - minLen), 0)); const trimEnd = r3(clampN(r.trimEnd, Math.min(len, trimStart + minLen), len, len));
  const actor = normalizeActor(r.actor); const sh = r.shoot as Record<string, unknown> | undefined;
  const shoot: TakeShoot | null = actor && sh && typeof sh === 'object' && typeof sh.of === 'string' && /^[a-z0-9-]{1,24}$/.test(sh.of) && sh.of !== id
    ? { of: sh.of, angle: Math.round(clampN(sh.angle, 1, 99, 1)), rate: r3(clampN(sh.rate, 0.25, 1, 1)) } : null;
  const recipe = normalizeTakeRecipe(r.recipe);
  return { id, name, keys, smooth: r3(clampN(r.smooth, 0, 1, TAKE_SMOOTH_DEFAULT)), trimStart, trimEnd, speed: r3(clampN(r.speed, TAKE_SPEED_MIN, TAKE_SPEED_MAX, 1)), ...(actor ? { actor } : {}), ...(shoot ? { shoot } : {}), ...(recipe ? { recipe } : {}) };
}
export function normalizeCameraPath(raw: unknown): CameraPath | null {
  if (!raw || typeof raw !== 'object') return null; const r = raw as Record<string, unknown>; if (!Array.isArray(r.takes)) return null;
  const takes: CameraTake[] = []; const seen = new Set<string>();
  for (const [i, x] of r.takes.slice(0, TAKE_MAX * 4).entries()) { const k = normalizeTake(x, i); if (!k) continue; let id = k.id; let n = 2; while (seen.has(id)) id = `${k.id.slice(0, 20)}-${n++}`; seen.add(id); takes.push({ ...k, id }); if (takes.length >= TAKE_MAX) break; }
  if (!takes.length) return null; const chosen = typeof r.chosen === 'string' && takes.some((k) => k.id === r.chosen) ? r.chosen : null; return { takes, chosen };
}
/** The take that drives the camera, or null (the preset move). */
export const chosenTake = (shot: PlanShot): CameraTake | null => { const cp = shot.cameraPath; return cp?.chosen ? cp.takes.find((k) => k.id === cp.chosen) ?? null : null; };

/** Recorded poses (one per screen frame, uneven) → keys at an even TAKE_HZ, linearly in between (yaw unwrapped first). */
export function resampleKeys(raw: CameraKey[], hz = TAKE_HZ): CameraKey[] {
  const ks = sortKeys(raw); if (ks.length < 2) return ks; const len = ks[ks.length - 1].t; const n = Math.max(1, Math.round(len * hz)); const out: CameraKey[] = []; let j = 0;
  for (let i = 0; i <= n; i++) { const t = Math.min(len, i / hz); while (j < ks.length - 2 && ks[j + 1].t < t) j++; const a = ks[j], b = ks[j + 1]; const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    const roll = lerp(a.roll ?? 0, b.roll ?? 0, k), focus = lerp(a.focus ?? 0, b.focus ?? 0, k);
    out.push({ t, pos: [lerp(a.pos[0], b.pos[0], k), lerp(a.pos[1], b.pos[1], k), lerp(a.pos[2], b.pos[2], k)], yaw: lerp(a.yaw, b.yaw, k), pitch: lerp(a.pitch, b.pitch, k), fov: lerp(a.fov, b.fov, k), ...(roll ? { roll } : {}), ...(focus ? { focus } : {}) }); }
  return out;
}
function sortKeys(raw: CameraKey[]): CameraKey[] { const ks = [...raw].filter((k) => Number.isFinite(k.t)).sort((a, b) => a.t - b.t); if (!ks.length) return []; const t0 = ks[0].t; const out: CameraKey[] = [];
  for (const k of ks) { const t = k.t - t0; if (out.length && t - out[out.length - 1].t < 1e-6) continue; let yaw = k.yaw; if (out.length) { const p = out[out.length - 1].yaw; while (yaw - p > Math.PI) yaw -= Math.PI * 2; while (yaw - p < -Math.PI) yaw += Math.PI * 2; } out.push({ ...k, t, yaw }); }
  return out; }

/** Shot time → take time: trim start + t × speed, held at the trim end (a take shorter than the shot holds its last pose). */
export const takeTimeAt = (take: CameraTake, t: number) => Math.max(take.trimStart, Math.min(take.trimEnd, take.trimStart + Math.max(0, t) * take.speed));
/** The speed that makes the trimmed take last exactly the shot. */
export const fitTakeSpeed = (take: CameraTake, seconds: number) => r3(Math.max(TAKE_SPEED_MIN, Math.min(TAKE_SPEED_MAX, (take.trimEnd - take.trimStart) / Math.max(0.1, seconds))));
/** How long the trimmed take lasts in the shot at its speed (seconds). */
export const takeShotSeconds = (take: CameraTake) => (take.trimEnd - take.trimStart) / take.speed;
export type CameraPose = { pos: Vec3; yaw: number; pitch: number; fov: number; roll?: number; focus?: number };
/** the raw take at time u: positions through a Catmull-Rom curve (smooth even between sparse keys an agent wrote), angles and lens linear */
function rawPose(keys: CameraKey[], u: number): CameraPose {
  const n = keys.length; if (u <= keys[0].t) return keys[0]; if (u >= keys[n - 1].t) return keys[n - 1];
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (keys[m].t <= u) lo = m; else hi = m; }
  const a = keys[lo], b = keys[hi]; const k = (u - a.t) / (b.t - a.t); const p0 = keys[Math.max(0, lo - 1)].pos, p3 = keys[Math.min(n - 1, hi + 1)].pos;
  const cr = (i: number) => { const P0 = p0[i], P1 = a.pos[i], P2 = b.pos[i], P3 = p3[i]; const k2 = k * k, k3 = k2 * k;
    return 0.5 * (2 * P1 + (-P0 + P2) * k + (2 * P0 - 5 * P1 + 4 * P2 - P3) * k2 + (-P0 + 3 * P1 - 3 * P2 + P3) * k3); };
  const roll = lerp(a.roll ?? 0, b.roll ?? 0, k), focus = lerp(a.focus ?? 0, b.focus ?? 0, k);
  return { pos: [cr(0), cr(1), cr(2)], yaw: lerp(a.yaw, b.yaw, k), pitch: lerp(a.pitch, b.pitch, k), fov: lerp(a.fov, b.fov, k), ...(roll ? { roll } : {}), ...(focus ? { focus } : {}) };
}
/** The cleaned-up take at take time u: a Gaussian average of the raw take over ±3 sigma (sigma = smooth × TAKE_SMOOTH_SIGMA), sampled at
 *  fixed offsets (at least twice per stored key) and held inside the trim, so it is a pure function: the same take + settings give the same camera at every u. */
export function takePoseAt(take: CameraTake, u: number): CameraPose {
  const lo = take.trimStart, hi = take.trimEnd; const uu = Math.max(lo, Math.min(hi, u)); const sigma = take.smooth * TAKE_SMOOTH_SIGMA;
  if (sigma < 1e-4) return rawPose(take.keys, uu);
  /* sample at least twice per stored key (no aliasing against the 30 Hz keys), out to 3 sigma */
  const h = Math.min(sigma / 3, 1 / (2 * TAKE_HZ)); const N = Math.min(240, Math.ceil((3 * sigma) / h)); let w = 0; const acc = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = -N; i <= N; i++) { const off = i * h; const wi = Math.exp(-0.5 * (off / sigma) ** 2); const p = rawPose(take.keys, Math.max(lo, Math.min(hi, uu + off)));
    acc[0] += p.pos[0] * wi; acc[1] += p.pos[1] * wi; acc[2] += p.pos[2] * wi; acc[3] += p.yaw * wi; acc[4] += p.pitch * wi; acc[5] += p.fov * wi; acc[6] += (p.roll ?? 0) * wi; acc[7] += (p.focus ?? 0) * wi; w += wi; }
  const roll = acc[6] / w, focus = acc[7] / w;
  return { pos: [acc[0] / w, acc[1] / w, acc[2] / w], yaw: acc[3] / w, pitch: Math.max(-PITCH_MAX, Math.min(PITCH_MAX, acc[4] / w)), fov: acc[5] / w, ...(roll ? { roll } : {}), ...(focus ? { focus } : {}) };
}
/** The raw (unsmoothed) camera path of the chosen take over the shot, for the map's faint "as flown" line. */
export function rawTakePath(shot: PlanShot, n = 60): Vec3[] { const k = chosenTake(shot); if (!k) return []; const raw = { ...k, smooth: 0 };
  return Array.from({ length: n + 1 }, (_, i) => clampCamera(shot.template, takePoseAt(raw, takeTimeAt(raw, (shot.seconds * i) / n)).pos)); }
/** A short key for everything that moves the camera (the engine re-fits the Depth range only when it changes). */
export function cameraKeyOf(s: PlanShot): string { const k = chosenTake(s);
  return [s.template, s.move, s.speed, s.seconds, s.aspect, JSON.stringify(s.place ?? null), s.lens ?? '', s.size ?? '', s.shake ? `${s.shake.p}:${s.shake.k}` : '', s.seed, ((m) => (m ? `${m.x},${m.z},${m.h},${m.fw}` : ''))(starOf(s)),
    k ? [k.id, k.keys.length, takeLength(k), k.smooth, k.trimStart, k.trimEnd, k.speed, k.recipe ? `${k.recipe.id}:${k.recipe.lens}:${k.recipe.size}` : ''].join(',') : '-'].join('|'); }
/** A starting speed for flying in a preset, metres per second (small sets fly slower). */
export function flySpeedFor(template: PrevizTemplateId): number { const s = (previzTemplate(template) ?? PREVIZ_TEMPLATES[0]).stage; return s.interior ? 1.2 : Math.max(0.6, Math.min(6, s.radius * 0.32)); }
/** A preset's lens as a take stores it (16:9 vertical degrees). */
export const baseFovOf = (template: PrevizTemplateId) => (previzTemplate(template) ?? PREVIZ_TEMPLATES[0]).stage.fov;
/** What the keys and mouse ask for in one frame of flying: fwd / right / up in −1…1, look = mouse movement in pixels, zoom −1 (out) … 1 (in). */
export interface FlyInput { fwd: number; right: number; up: number; look: [number, number]; slow: boolean; zoom: number }
export const FLY_LOOK = 0.0032; /* radians per pixel of mouse drag */ export const FLY_SPEED_MIN = 0.1; export const FLY_SPEED_MAX = 20;
/** One frame of flying, like a game camera: W/S move along the ground where you look (your height stays put), A/D slide, Q/E sink and rise,
 *  the mouse turns and tilts (no roll), Shift is slow and precise. Velocity eases in and out (no jerks). Pure; kept above the ground. */
export function flyStep(pose: CameraPose, vel: Vec3, input: FlyInput, dt: number, speed: number, template: PrevizTemplateId): { pose: CameraPose; vel: Vec3 } {
  const d = Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0)); const slow = input.slow ? 0.25 : 1; const lk = FLY_LOOK * (input.slow ? 0.4 : 1);
  const yaw = pose.yaw - input.look[0] * lk; const pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pose.pitch - input.look[1] * lk));
  const f: Vec3 = [-Math.sin(yaw), 0, -Math.cos(yaw)]; const r: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)]; const v = speed * slow;
  const want: Vec3 = [(f[0] * input.fwd + r[0] * input.right) * v, input.up * v * 0.7, (f[2] * input.fwd + r[2] * input.right) * v];
  const k = 1 - Math.exp(-d * 8); const nv: Vec3 = [vel[0] + (want[0] - vel[0]) * k, vel[1] + (want[1] - vel[1]) * k, vel[2] + (want[2] - vel[2]) * k];
  const pos = clampCamera(template, [pose.pos[0] + nv[0] * d, pose.pos[1] + nv[1] * d, pose.pos[2] + nv[2] * d]);
  const fov = Math.max(FOV_MIN, Math.min(FOV_MAX, pose.fov * Math.exp(-input.zoom * d * (input.slow ? 0.25 : 0.8))));
  return { pose: { pos, yaw, pitch, fov }, vel: [nv[0], pos[1] === pose.pos[1] + nv[1] * d ? nv[1] : 0, nv[2]] };
}
/** Where flying starts: the shot's camera at t, as a pose (the lens back in 16:9 terms). */
export function poseAt(shot: PlanShot, t: number): CameraPose { const c = cameraAt(shot, t); const { yaw, pitch } = yawPitchTo(c.pos, c.look); return { pos: c.pos, yaw, pitch, fov: c.fov / (fovFor(1, shot.aspect)) }; }

/** The shot as a video job keeps it: only the chosen take (the one the video was made from), so saved jobs stay small. */
export function shotForJob(s: PlanShot): PlanShot { const k = chosenTake(s); const { cameraPath: _drop, ...rest } = s; void _drop; return k ? { ...rest, cameraPath: { takes: [k], chosen: k.id } } : rest; }

// ---------- the player's clock (pure, so the tests cover the loop seam) ----------
/** m:ss.s for the player; never negative or NaN (a playhead before 0 reads 0:00.0) */
export const previzTime = (t: number) => { const x = Math.max(0, Number.isFinite(t) ? t : 0); const m = Math.floor(x / 60); return `${m}:${(x - m * 60).toFixed(1).padStart(4, '0')}`; };
/** how long the last frame holds before the preview loops (s) */
export const PREVIZ_HOLD_END = 0.7;
/** One step of preview playback: dt is clamped to 0…0.1 s (a hidden tab or the first frame never jumps the playhead or goes negative);
 *  at the end the last frame holds PREVIZ_HOLD_END, then the playhead wraps to exactly 0 (wrapped: true, the player fades in). */
export function previzPlayStep(t: number, hold: number, dt: number, dur: number): { t: number; hold: number; wrapped: boolean } {
  const d = Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
  if (hold > 0) { const h = hold - d; return h > 0 ? { t: dur, hold: h, wrapped: false } : { t: 0, hold: 0, wrapped: true }; }
  const n = Math.max(0, t) + d; return n >= dur ? { t: dur, hold: PREVIZ_HOLD_END, wrapped: false } : { t: n, hold: 0, wrapped: false };
}

// ---------- import contract ----------
/** What an imported scene must expose: window.previz = { duration, seek(t), setPass(name) } (docs/PLAN-A-SHOT.md). */
export interface PrevizContractCheck { ok: boolean; problems: string[]; duration: number; passes: PrevizPass[] }
export function validatePrevizContract(x: unknown): PrevizContractCheck {
  const problems: string[] = []; const o = (x && typeof x === 'object' ? x : null) as Record<string, unknown> | null;
  if (!o) return { ok: false, problems: ['The scene has no window.previz object.'], duration: 0, passes: [] };
  const d = Number(o.duration);
  if (!Number.isFinite(d) || d <= 0) problems.push('previz.duration must be a number of seconds above 0.');
  else if (d > 60) problems.push('previz.duration is longer than 60 s; keep scenes short (3–10 s are captured).');
  if (typeof o.seek !== 'function') problems.push('previz.seek(t) is missing: it must draw the frame for time t (seconds).');
  if (typeof o.setPass !== 'function') problems.push('previz.setPass(name) is missing: it must switch between "beauty", "clay" and "depth".');
  let passes: PrevizPass[] = ['beauty', 'clay', 'depth'];
  if (o.passes != null) { if (!Array.isArray(o.passes) || !o.passes.every((p) => PREVIZ_PASSES.some((q) => q.id === p))) problems.push('previz.passes, when given, lists only "beauty", "clay" and "depth".'); else passes = o.passes as PrevizPass[]; }
  return { ok: problems.length === 0, problems, duration: Number.isFinite(d) ? d : 0, passes };
}
export const SCENE_HTML_MAX_BYTES = 5 * 1024 * 1024;
/** A quick look at an .html file before it is loaded into the sandbox. */
export function checkSceneHtml(text: string, bytes = text.length): string[] {
  const p: string[] = [];
  if (!text.trim()) p.push('The file is empty.');
  else if (bytes > SCENE_HTML_MAX_BYTES) p.push('The file is larger than 5 MB. Scenes should be one small HTML file with no media inside.');
  else if (!/<(html|script|canvas|body)\b/i.test(text)) p.push('This doesn’t look like an HTML page.');
  else if (!/previz/.test(text)) p.push('The page never mentions window.previz, so it can’t follow the contract.');
  return p;
}

const CONTRACT = `CONTRACT (the page will be loaded into a sandboxed frame and recorded frame by frame)
- One self-contained HTML file. No build step. If you use three.js, load exactly three@0.183.2 from cdn.jsdelivr.net through an import map; no other libraries, models, textures, fonts or sounds. Plain Canvas 2D is fine too.
- Expose window.previz = { duration, seek(t), setPass(name), passes }:
  - duration: the clip length in seconds (between 3 and 10).
  - seek(t): poses everything for time t (seconds) and draws that frame before it returns (or returns a promise that resolves once it is drawn).
  - setPass(name): "beauty" (your normal look), "clay" (every surface one neutral grey, one soft light) or "depth" (white = near, black = far, no lighting).
  - passes: the passes you support, e.g. ["beauty", "clay", "depth"].
- Everything is a function of t only: no timers driving the motion, no Date.now or performance.now in the pose, no Math.random (use a seeded generator). The same t must always give the same picture.
- Use one canvas that fills the window and keep its drawing buffer (WebGLRenderer({ preserveDrawingBuffer: true }) for WebGL). Resize with the window and keep the camera's aspect in step.
- Draw only the scene: no buttons, labels, captions, logos or text anywhere in the picture. Keep it simple on purpose: smooth capsule people with no faces, big clear shapes, flat or clay colours.
- The camera moves with eased motion (no sudden starts), keeps the horizon level and never points straight down.
- When it loads, call seek(0) once so the first frame is a finished picture.`;
/** The prompt a user copies for their coding agent: our preset's scene + the shot's camera + the contract. */
export function buildPromptFor(shot: PlanShot): string {
  const t = previzTemplate(shot.template) ?? PREVIZ_TEMPLATES[0]; const move = PREVIZ_MOVES.find((m) => m.id === shot.move)!;
  return [`Write a simple 3D scene I can use to plan a video shot: "${t.name}", ${t.tagline.toLowerCase()}.`, '', fillColour(t.build, shot.colour), '',
    `Camera: ${move.label.toLowerCase()} (${move.hint.toLowerCase()}), ${shot.speed} speed, over ${shot.seconds} seconds, framed for ${shot.aspect}.`, ...(shot.note ? [`What I have in mind: ${shot.note}`] : []), '', CONTRACT].join('\n');
}
