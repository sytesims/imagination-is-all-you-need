/**
 * Direct a Shot scenes (2026-10-24): our own three.js code for the five presets in server/src/shared/previzTemplates.ts. Loaded on first use
 * (three is its own chunk, as for the light sphere). Simple on purpose: primitives plus a few kit pieces (previz/kits.ts: furniture, street,
 * holiday village, the product bottle), all in the brand theme (previz/theme.ts: matte warm neutrals, an orange subject, warm key + cool fill,
 * a soft gradient sky and fog). Props you add (shot.props) are drawn on top of any preset. The presets build their primitives at once and
 * swap in the kit pieces when the kit file has loaded (ready() waits for it, so a recording never changes look mid-way). Deterministic: seek(t) poses everything from t alone (camera from cameraAt,
 * the figure / train / bottle from subjectAt and walkPose), small random details come from the seeded generator, nothing runs on a timer.
 * Views: beauty ("Simple": colours + soft light + shadows + haze, at the graphics quality you pick: previz/quality.ts, post.ts), clay (one grey Lambert, shadows kept), depth (MeshDepthMaterial,
 * white = near; linear between a near and far fixed for the whole shot by depthRangeFor, so the guide never breathes as the camera moves).
 * The recorder calls renderAt(shot, t, view) once per frame: it draws the shot it was given, whatever the live player is showing.
 * Clay and Depth always draw at Low quality, so the guides Render reads never change with the setting.
 */
import { actorAt, type ActorPose } from '../../../../server/src/shared/previzActor';
import { createActorRig, preloadMannequin, type ActorRig } from './actor';
import { createVehicleRig } from './vehicle';
import { createModelLayer, probeUserModel, type ModelStatus } from './userModels';
import { starOf } from '../../../../server/src/shared/previzModels';
import { buildCity } from './world/assemble';
import { mat, shade, skyTexture, LIGHTS, PAL, BRAND, type LightLook } from './theme';
import { loadPieces, placePiece, piece, tintPiece, fileOf } from './kits';
import { createGhost, type GhostSpec } from './ghost';
import { QUALITY, capQuality, pickQuality, previzQuality, storedQuality, setPrevizQuality, onPrevizQuality, type Quality, type QualityPreset } from './quality';
import { createPost, type PostLook } from './post';
import { rayToGround } from '../../../../server/src/shared/previzPlace';
import { KIT } from '../../../../server/src/shared/world/kitCatalog';
import { PROP_PIECES } from '../../../../server/src/shared/world/propCatalog';
import { chosenTake, takeTimeAt, cameraAt, subjectAt, colourOf, rng, depthRangeFor, walkPose, cameraKeyOf, clampCamera, lookDir, fovFor, hillHeight, groundAt, ESTABLISHING_HILLS, WALK_FLOOR_Y, TRAIN_Y, TRACK_R, type CameraPose, type PlanShot, type PrevizPass, type PlacedProp, type Vec3 } from '../../../../server/src/shared/previzTemplates';

type T3 = typeof import('three');
export interface PrevizEngine {
  canvas: HTMLCanvasElement;
  /** set the shot; rebuilds the set only when the preset or seed change */ setShot(shot: PlanShot): void;
  /** pose everything for t (seconds) and draw */ seek(t: number): void;
  setPass(p: PrevizPass): void;
  /** drawing size in CSS px and the pixel ratio (1 while recording) */ setSize(w: number, h: number, ratio: number): void;
  /** Fly the camera: draw from this pose instead of the shot's camera (null = back to the shot). Kept above the ground. */ setFreeCamera(pose: CameraPose | null): void;
  /** Play the actor: draw the person at this live pose (null = the chosen take's person, or the preset's own figure) */ setActor(pose: ActorPose | null): void;
  /** one call per frame while flying: the free camera, the live person (or null) and the scene time, drawn once */ setLive(pose: CameraPose, actor: ActorPose | null, t: number): void;
  /** resolves once the mannequin has loaded or failed (recording waits for it, so every frame shows the same figure) */ ready(): Promise<void>;
  /** the recorder's one call per frame: this shot, this time, this view, drawn once */ renderAt(shot: PlanShot, t: number, pass: PrevizPass): void;
  /** false after dispose() or while the browser has taken the WebGL context away */ readonly alive: boolean;
  /** Add props: which placed prop is selected (an orange ring under it in the live view; never in a recording) */ selectProp(i: number | null): void;
  /** Your 3D models: which placed model is selected (the same ring); null = none */ selectModel(i: number | null): void;
  /** the placed model (index in shot.models) under a point of the view, or null */ pickModel(nx: number, ny: number): number | null;
  /** where the camera stands on the ground now (x, z), so a new model can face it */ cameraGround(): [number, number] | null;
  /** load and check one of your GLBs (cached for the page): its footprint (width ÷ height); rejects with the reason in plain words */ probeModel(src: string): Promise<{ fw: number }>;
  /** Drive mode's "park here" bay (previz/driveGame.ts): an orange bay and a soft beacon in the live view; never in a recording (null hides it) */ setBay(b: { x: number; y: number; z: number; heading: number; w: number; l: number } | null): void;
  /** the placed prop under a point of the view (x, y from −1 to 1, y up), or null */ pickProp(nx: number, ny: number): number | null;
  /** the ground point under a point of the view (metres, x and z), or null when it is above the horizon */ groundPoint(nx: number, ny: number): [number, number] | null;
  /** Add props build mode: where the view's ray through (nx, ny) meets the floor, stopping at the first wall or building (previzPlace.rayToGround) */ castFloor(nx: number, ny: number): { x: number; z: number; wall: boolean } | null;
  /** a world point on the view (x, y from −1 to 1, y up) and whether it is in front of the camera */ project(x: number, y: number, z: number): [number, number, boolean];
  /** the ghost of what you are placing (null hides it); live view only, never recorded */ setGhost(g: GhostSpec | null): void;
  /** the white ring under what a click would pick (null hides it) */ setHover(h: { kind: 'prop' | 'model'; i: number } | null): void;
  /** draw one placed thing elsewhere for a moment (a drag, a scroll) without changing the shot; null = as the shot has it */ setOverride(o: PlaceOverride | null): void;
  /** thumbnails of kit pieces (JPEG data URLs): loads them, then in one task draws each at w × h and calls restore() (the caller puts the live size back, so nothing flashes) */
  snapPieces(ids: string[], w: number, h: number, restore: () => void): Promise<Record<string, string>>;
  /** Explore's live city only (explore/mossbunCity.ts): add the caller's own object to the scene (the caller poses it before each draw); returns its remove. Direct a Shot never calls it. */
  addExtra(o: any): () => void;
  dispose(): void;
}
/** a placed thing drawn somewhere else for a moment (Add props: while you drag or scroll it; the shot changes once, when you let go) */
export type PlaceOverride = { kind: 'prop'; i: number; x: number; z: number; r: number; s: number } | { kind: 'model'; i: number; x: number; z: number; r: number; h: number };
export interface EngineEvents { /** the browser took the graphics context away (true) or gave it back (false) */ onContextLost?: (lost: boolean) => void;
  /** Your 3D models: a file is loading, ready, or failed (with the reason in plain words) */ onModelStatus?: (s: ModelStatus) => void }
/** What a preset builds: update(t) poses it; tint = the subject's materials; shadow = the area the sun's shadow map covers (centre, half size in metres) */
interface Built { /** pose for t; cur = the live shot (its length, map drags), which can change without a rebuild */ update(t: number, cur: PlanShot): void; tint: any[];
  /** the light and sky (theme.ts LIGHTS); the open city sets its own in beforeRender */ look?: LightLook; /** kit pieces that carry the subject colour */ tintKit?: { setTint(h: string): void }[];
  /** the preset's own capsule figure (walk-by), hidden while the mannequin stands in for it */ fig?: any; sky: number; ground: number; fog: [number, number]; shadow: { center: Vec3; size: number };
  /** big worlds (world/*): resolves once the set has loaded (recording and thumbnails wait for it) */ ready?: Promise<void>;
  /** called before every draw with the camera, the lights and the view (big worlds: culling, level of detail, the shadow box that follows the camera) */ beforeRender?(ctx: RenderCtx): void;
  /** undo anything set outside the set's own group (lights, renderer settings) when another preset takes over */ dispose?(): void }
/** What a big world may touch while drawing (engine-owned objects; restore them in dispose). */
export interface RenderCtx { T: T3; renderer: any; scene: any; camera: any; sun: any; hemi: any; fill: any; pass: PrevizPass; redraw(): void;
  /** the graphics quality this frame draws at (previz/quality.ts; always Low in Clay and Depth) and its preset */ quality: Quality; preset: QualityPreset;
  /** High / Ultra: the bloom and AO for this frame (a world sets its own in beforeRender; reset to the default before each draw) */ post: PostLook }
/** Options: Explore's live tile pins its own quality (Medium) instead of the one you pick in Direct a Shot */
export interface EngineOptions { quality?: Quality }
const POST_DEFAULT: PostLook = { threshold: 3.2, strength: 0.25, radius: 0.4, ao: 0.75 };

const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const SUN_DIR: Vec3 = [0.45, 0.8, 0.4]; /* the default key: upper right, a little in front (a look may set its own) */

export async function createPrevizEngine(canvas: HTMLCanvasElement, events: EngineEvents = {}, opts: EngineOptions = {}): Promise<PrevizEngine> {
  const T: T3 = await import('three');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  /* graphics quality (previz/quality.ts): Clay and Depth always draw as Low; WebGL1-class browsers stop at Medium */
  const caps = { webgl2: !!renderer.capabilities.isWebGL2, maxTexture: renderer.capabilities.maxTextureSize ?? 4096 }; let forceQ: Quality | null = null;
  const quality = (): Quality => (pass !== 'beauty' ? 'low' : capQuality(forceQ ?? opts.quality ?? previzQuality(), caps));
  const post = createPost(T, renderer); let postLook: PostLook = { ...POST_DEFAULT };
  renderer.outputColorSpace = T.SRGBColorSpace;
  /* soft shadows ground the subject (deterministic: a static sun; the shadow map is redrawn with every frame) */
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap; /* PCF with a radius: soft edges (three r18x folds PCFSoft into PCF) */
  const scene = new T.Scene(); const camera = new T.PerspectiveCamera(40, 16 / 9, 0.05, 400);
  const hemi = new T.HemisphereLight(0xf4f1ea, 0x6b665e, 1.05); scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff4e6, 2.1); sun.shadow.blurSamples = 12; sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  scene.add(sun); scene.add(sun.target);
  const fill = new T.DirectionalLight(0xdfe8ff, 0.35); fill.position.set(-6, 3, -4); scene.add(fill); /* a cool fill from behind-left keeps the shadow side readable */
  const clay = new T.MeshLambertMaterial({ color: 0xc4c1bb, side: T.DoubleSide });
  /* props you add (shot.props): their own group, rebuilt when the list changes; the selected one gets an orange ring on the ground */
  const propsRoot = new T.Group(); scene.add(propsRoot); let propsKey = ''; let propsReady: Promise<void> = Promise.resolve(); let selected: number | null = null; let capturing = false;
  const ring = new T.Mesh(new T.RingGeometry(0.92, 1, 48), new T.MeshBasicMaterial({ color: BRAND.orange, transparent: true, opacity: 0.9, depthTest: false, fog: false }));
  ring.rotation.x = -Math.PI / 2; ring.renderOrder = 20; ring.visible = false; scene.add(ring);
  /* the park bay: a faint orange fill, a crisp outline and a soft beacon you can see down the street (live only, like the ring) */
  const bay = new T.Group(); bay.visible = false; scene.add(bay); let bayOn: { x: number; y: number; z: number; heading: number; w: number; l: number } | null = null;
  const bayFillM = new T.MeshBasicMaterial({ color: BRAND.orange, transparent: true, opacity: 0.16, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  const bayLineM = new T.MeshBasicMaterial({ color: BRAND.orange, transparent: true, opacity: 0.92, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  const beamTex = (() => { const cv = document.createElement('canvas'); cv.width = 2; cv.height = 64; const g2 = cv.getContext('2d')!; const gr = g2.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); g2.fillStyle = gr; g2.fillRect(0, 0, 2, 64); return new T.CanvasTexture(cv); })();
  const beamM = new T.MeshBasicMaterial({ color: BRAND.orangeSoft, alphaMap: beamTex, transparent: true, opacity: 0.32, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending });
  const bayFill = new T.Mesh(new T.PlaneGeometry(1, 1), bayFillM); bayFill.rotation.x = -Math.PI / 2; bay.add(bayFill);
  const bayLines = [0, 1, 2, 3].map(() => { const m = new T.Mesh(new T.PlaneGeometry(1, 1), bayLineM); m.rotation.x = -Math.PI / 2; bay.add(m); return m; });
  const beam = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 9, 20, 1, true), beamM); beam.position.y = 4.5; bay.add(beam);
  /* drawn (tiny, out of sight) even when off, so its three materials are compiled up front and the first bay never stutters the frame */
  for (const o of [bayFill, beam, ...bayLines]) { o.renderOrder = 19; o.userData.noCast = true; o.frustumCulled = false; }
  const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bayFor = () => { if (!bayOn || capturing || pass !== 'beauty') { bay.visible = !capturing && pass === 'beauty'; bay.position.set(0, -500, 0); bay.scale.setScalar(1e-4); return; } const b = bayOn; bay.visible = true; bay.scale.setScalar(1); bay.position.set(b.x, b.y + 0.03, b.z); bay.rotation.y = b.heading;
    bayFill.scale.set(b.w, b.l, 1); const lw = 0.14; bayLines[0].scale.set(b.w, lw, 1); bayLines[0].position.set(0, 0.005, b.l / 2); bayLines[1].scale.set(b.w, lw, 1); bayLines[1].position.set(0, 0.005, -b.l / 2);
    bayLines[2].scale.set(lw, b.l, 1); bayLines[2].position.set(b.w / 2, 0.005, 0); bayLines[3].scale.set(lw, b.l, 1); bayLines[3].position.set(-b.w / 2, 0.005, 0);
    beamM.opacity = calm ? 0.3 : 0.24 + 0.1 * Math.sin(performance.now() / 520); };
  const skies = new Map<string, any>();
  /* depth: MeshDepthMaterial (white = near), linear between uFitNear and uFitFar (fixed per shot: depthRangeFor) */
  const depth = new T.MeshDepthMaterial({ side: T.DoubleSide }); const fit = { uCamNear: { value: 0.05 }, uCamFar: { value: 400 }, uFitNear: { value: 1 }, uFitFar: { value: 30 } };
  depth.onBeforeCompile = (sh: any) => { Object.assign(sh.uniforms, fit);
    sh.fragmentShader = 'uniform float uCamNear; uniform float uCamFar; uniform float uFitNear; uniform float uFitFar;\n' + sh.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'float vz = -perspectiveDepthToViewZ( fragCoordZ, uCamNear, uCamFar ); float lin = clamp( ( vz - uFitNear ) / ( uFitFar - uFitNear ), 0.0, 1.0 ); gl_FragColor = vec4( vec3( 1.0 - lin ), opacity );'); };
  let shot: PlanShot | null = null; let built: Built | null = null; let builtKey = ''; let pass: PrevizPass = 'beauty'; let lastT = 0; const root = new T.Group(); scene.add(root);
  let depthKey = ''; let alive = true; let lost = false;
  const lookV = new T.Vector3(); const bg = new T.Color(); const fog = new T.Fog(0xffffff, 10, 40);

  const skyOf = (l: LightLook) => { const k = `${l.sky[0]}|${l.sky[1]}`; let t = skies.get(k); if (!t) skies.set(k, (t = skyTexture(T, l.sky[0], l.sky[1]))); return t; };
  const apply = () => {
    if (!built) return; const isDepth = pass === 'depth'; const look = built.look;
    scene.overrideMaterial = pass === 'clay' ? clay : isDepth ? depth : null;
    if (pass === 'beauty' && look) scene.background = skyOf(look); else { bg.set(pass === 'clay' ? 0x6a6865 : isDepth ? 0x000000 : built.sky); scene.background = bg; }
    if (pass === 'beauty') { fog.color.set(look ? look.sky[1] : built.sky); fog.near = built.fog[0]; fog.far = built.fog[1]; scene.fog = fog; } else scene.fog = null;
    renderer.toneMapping = isDepth ? T.NoToneMapping : T.ACESFilmicToneMapping; renderer.toneMappingExposure = pass === 'clay' ? 1.1 : look?.exposure ?? 1.05;
  };
  /* a preset's light: warm key (the sun), cool fill from the other side, a soft sky; the shadow box is set by build() */
  let hemiBase = 1.05; const light = (l: LightLook | undefined) => { const L = l ?? LIGHTS.daylight; hemiBase = L.hemiI;
    sun.color.set(L.key); sun.intensity = L.keyI; fill.color.set(L.fill); fill.intensity = L.fillI; hemi.color.set(L.hemiSky); hemi.groundColor.set(L.hemiGround); hemi.intensity = L.hemiI;
    fill.position.set(-L.keyDir[0] * 6, 3, -L.keyDir[2] * 6); };
  let free: CameraPose | null = null; let liveActor: ActorPose | null = null; let rig: ActorRig | null = null;
  preloadMannequin(); const rigReady = createActorRig(T).then((r) => { if (!alive) { r?.dispose(); return; } rig = r; if (r) { scene.add(r.root); if (shot) r.tint(colourOf(shot.colour).hex); draw(); } }).catch(() => undefined);
  /* Your 3D models (previz/userModels.ts): props or the actor, their own group; selModel = the one with the ring */
  const modelsRoot = new T.Group(); scene.add(modelsRoot); let selModel: number | null = null; let prevLive: { h: number; time: number } | null = null;
  const models = createModelLayer(T, modelsRoot, () => draw(), (st) => events.onModelStatus?.(st));
  /* Drive mode: the person's car (previz/vehicle.ts), posed from the same pose as the person */
  const vehicle = createVehicleRig(T, scene, () => draw());
  /* who stands in the scene at t: the live person you play, the chosen take's person, or the walk-by figure on its scripted walk */
  const poseActor = (s: PlanShot, t: number) => {
    const take = chosenTake(s); let p: ActorPose | null = liveActor ?? (take?.actor ? actorAt(take.actor, takeTimeAt(take, t), t) : null);
    const star = starOf(s); /* your model playing the actor stands in for the mannequin (and the walk-by's figure) */
    if (!p && s.template === 'walk-by' && (rig || star)) { const sub = subjectAt(s, t); const run = Math.min(6.4, 1.3 * s.seconds); p = { pos: sub.pos, heading: sub.heading, v: run / s.seconds, d: sub.pos[0] + run / 2 + 10, time: t, beat: null }; }
    vehicle.pose(p?.car ?? null, t, s.template === 'open-city-night' || s.template === 'open-city-golden'); const atWheel = !!p?.car?.inside; /* at the wheel: the car stands in for the person */
    /* how fast the actor turns (radians a second), for the model's lean: from the take 0.1 s before (pure in t); live play reads the last frame */
    let turn = 0; if (star && p) { const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
      if (liveActor) { if (prevLive && liveActor.time > prevLive.time && liveActor.time - prevLive.time < 0.5) turn = wrapA(liveActor.heading - prevLive.h) / (liveActor.time - prevLive.time); prevLive = { h: liveActor.heading, time: liveActor.time }; }
      else if (take?.actor) { const q = actorAt(take.actor, takeTimeAt(take, Math.max(0, t - 0.1)), t); const dt = takeTimeAt(take, t) - takeTimeAt(take, Math.max(0, t - 0.1)); if (dt > 1e-4) turn = (wrapA(p.heading - q.heading) / dt) * take.speed; } }
    models.pose(t, (x, z) => groundAt(s.template, x, z), star && p && !atWheel ? { ...p, pos: p.pos as [number, number, number] } : null, turn, s.template);
    if (built?.fig) built.fig.visible = !star && (!p || !rig); if (!rig) return; if (p && !atWheel && !star) rig.pose(p); else rig.root.visible = false; };
  /* the props: one kit piece each, standing on the ground of the preset at x / z */
  /* the same pieces in the same order (a move, a turn, a size): the copies stay and only their place changes, so nothing flickers */
  let propsKinds = ''; const propObj = (i: number) => propsRoot.children.find((c: any) => c.userData.prop === i);
  const poseProp = (o: any, p: PlacedProp, tpl: string) => { o.position.set(p.x, groundAt(tpl as PlanShot['template'], p.x, p.z), p.z); o.rotation.set(0, p.r, 0); o.scale.setScalar(p.s); };
  const syncProps = (s: PlanShot) => { const list = s.props ?? []; const key = `${s.template}|${JSON.stringify(list)}`; if (key === propsKey) return; propsKey = key;
    const kinds = `${s.template}|${list.map((p) => p.k).join(',')}`;
    if (kinds === propsKinds && propsRoot.children.length === list.length) { list.forEach((p, i) => { const o = propObj(i); if (o) poseProp(o, p, s.template); }); return; } propsKinds = kinds;
    for (const ch of [...propsRoot.children]) propsRoot.remove(ch);
    const build1 = () => { if (propsKey !== key) return; for (const ch of [...propsRoot.children]) propsRoot.remove(ch);
      list.forEach((p: PlacedProp, i: number) => { const o = placePiece(propsRoot, p.k, p.x, groundAt(s.template, p.x, p.z), p.z, p.r, p.s); if (o) { o.userData.prop = i; o.traverse((m: any) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.userData.prop = i; } }); } }); };
    if (!list.length) { propsReady = Promise.resolve(); return; }
    build1(); propsReady = loadPieces(T, list.map((p) => p.k)).then(() => { build1(); if (propsRoot.children.length !== list.length) propsKinds = ''; draw(); }).catch(() => undefined); };
  /* Add props build mode: the ghost, the hover ring, and a placed thing drawn elsewhere while you drag it (live only) */
  const ghost = createGhost(T, scene, () => draw()); let override: PlaceOverride | null = null; let hoverOn: { kind: 'prop' | 'model'; i: number } | null = null;
  const propRing = (p: PlacedProp, tpl: string) => { const k = PROP_PIECES[p.k] ?? KIT[p.k]; return { x: p.x, y: groundAt(tpl as PlanShot['template'], p.x, p.z), z: p.z, r: k ? Math.max(0.3, Math.hypot(k.w, k.d) / 2 * p.s + 0.12) : 0.6 }; };
  const propNow = (i: number): PlacedProp | null => { const p = shot?.props?.[i]; if (!p) return null; return override?.kind === 'prop' && override.i === i ? { ...p, x: override.x, z: override.z, r: override.r, s: override.s } : p; };
  const placeLive = () => { const s = shot; const live = !capturing;
    if (s && override?.kind === 'prop') { const o = propObj(override.i); const p = propNow(override.i); if (o && p) poseProp(o, p, s.template); }
    ghost.show(live); if (!live || !s || !hoverOn) { ghost.hover(null); ghost.show(live); return; }
    const r = hoverOn.kind === 'prop' ? (propNow(hoverOn.i) ? propRing(propNow(hoverOn.i)!, s.template) : null) : models.ringOf(hoverOn.i, (x, z) => groundAt(s.template, x, z));
    ghost.hover(r && !(hoverOn.kind === 'prop' ? selected === hoverOn.i : selModel === hoverOn.i) ? r : null); };
  const ringFor = () => { const s = shot; const p = selected != null ? propNow(selected) : null; const o = p ? propObj(selected!) : null;
    if (selModel != null && s && !capturing && pass === 'beauty') { const rr = models.ringOf(selModel, (x, z) => groundAt(s.template, x, z)); if (rr) { ring.visible = true; ring.position.set(rr.x, rr.y + 0.02, rr.z); ring.scale.setScalar(rr.r); return; } }
    if (!p || !o || capturing || pass !== 'beauty') { ring.visible = false; return; } const rr = propRing(p, s!.template);
    ring.visible = true; ring.position.set(rr.x, rr.y + 0.02, rr.z); ring.scale.setScalar(rr.r); };
  const fitDepth = (s: PlanShot) => { const key = cameraKeyOf(s); if (key === depthKey) return; depthKey = key; const r = depthRangeFor(s); fit.uFitNear.value = r.near; fit.uFitFar.value = r.far; };
  const draw = () => {
    if (!shot || !built || !alive || lost) return; const t = free ? Math.max(0, lastT) : Math.max(0, Math.min(shot.seconds, lastT)); /* flying: the open city's world clock runs past the shot's end */
    const q = quality(); const qp = QUALITY[q]; postLook = { ...POST_DEFAULT };
    /* the small presets keep their own designed light at every level (an environment map only washed them out); the open city sets its own in beforeRender */
    scene.environment = null; hemi.intensity = hemiBase;
    if (sun.shadow.mapSize.x !== qp.shadowMap) { sun.shadow.mapSize.set(qp.shadowMap, qp.shadowMap); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    built.update(t, shot); poseActor(shot, t); placeLive(); ringFor(); bayFor(); const c = free ? freeCam(shot, free) : cameraAt(shot, t); camera.position.set(...c.pos); camera.up.set(0, 1, 0); lookV.set(...c.look); camera.lookAt(lookV); if (c.roll) camera.rotateZ(c.roll); /* roll about the view axis (Dutch, shake); 0 keeps the horizon level */ camera.fov = c.fov; camera.updateProjectionMatrix();
    built.beforeRender?.(ctx);
    fitDepth(shot); fit.uCamNear.value = camera.near; fit.uCamFar.value = camera.far;
    if (!((qp.ao > 0 || qp.bloom) && post.render(scene, camera, { ao: qp.ao, bloom: qp.bloom, msaa: qp.msaa, look: postLook }))) renderer.render(scene, camera);
  };
  const freeCam = (s: PlanShot, f: CameraPose) => { const pos = clampCamera(s.template, f.pos); const d = lookDir(f.yaw, f.pitch); return { pos, look: [pos[0] + d[0], pos[1] + d[1], pos[2] + d[2]] as Vec3, fov: fovFor(f.fov, s.aspect), roll: 0 }; };
  const ctx: RenderCtx = { T, renderer, scene, camera, sun, hemi, fill, get pass() { return pass; }, redraw: () => draw(), get quality() { return quality(); }, get preset() { return QUALITY[quality()]; },
    get post() { return postLook; }, set post(v: PostLook) { postLook = v; } };
  /* the quality you pick redraws at once (Explore's tile keeps its own) */
  const offQ = opts.quality ? () => undefined : onPrevizQuality(() => { apply(); draw(); });
  /* the first time any preset is ready and nothing is stored yet: time a few High frames at the view's size and keep the level that leaves room for 60 fps */
  let tuned = !!opts.quality || storedQuality() != null;
  const autoTune = async () => { if (tuned) return; tuned = true; await post.ready; await new Promise((r) => setTimeout(r, 400)); if (!alive || lost || capturing || pass !== 'beauty' || !shot || storedQuality() != null) { tuned = storedQuality() != null; return; }
    const gl = renderer.getContext(); const px = new Uint8Array(4); forceQ = 'high'; const times: number[] = [];
    try { for (let i = 0; i < 9; i++) { const t0 = performance.now(); draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (i > 1) times.push(performance.now() - t0); } } finally { forceQ = null; }
    times.sort((a, b) => a - b); setPrevizQuality(capQuality(pickQuality(times[times.length >> 1] ?? 99), caps)); };
  const clear = () => { built?.dispose?.(); for (const ch of [...root.children]) { root.remove(ch); ch.traverse((o: any) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); } };
  const build = (s: PlanShot) => { clear();
    const R = rng((s.seed ^ hashStr(s.template)) >>> 0); const g = new T.Group(); root.add(g);
    built = (BUILDERS[s.template] ?? BUILDERS['walk-by'])(T, g, s, R, ctx); builtKey = `${s.template}|${s.seed}`; light(built.look);
    const kd = built.look?.keyDir ?? SUN_DIR; const kn = Math.hypot(...kd); const sd: Vec3 = [kd[0] / kn, kd[1] / kn, kd[2] / kn];
    /* every solid casts and receives; flat panes, glass and the big ground only receive (no shadow acne on thin planes) */
    g.traverse((o: any) => { if (!o.isMesh) return; const basic = o.material?.type === 'MeshBasicMaterial'; const flat = basic || o.geometry?.type === 'PlaneGeometry' || o.geometry?.type === 'CircleGeometry';
      o.castShadow = !flat && !o.userData.noCast; o.receiveShadow = !basic; });
    const sh = built.shadow; const d = sh.size * 2.2; sun.target.position.set(...sh.center); sun.position.set(sh.center[0] + sd[0] * d, sh.center[1] + sd[1] * d, sh.center[2] + sd[2] * d);
    const sc = sun.shadow.camera; sc.left = -sh.size; sc.right = sh.size; sc.top = sh.size; sc.bottom = -sh.size; sc.near = 0.1; sc.far = d * 3; sc.updateProjectionMatrix(); sun.target.updateMatrixWorld();
  };
  const setTint = (hex: string) => { for (const m of built?.tint ?? []) m.color.set(hex); for (const k of built?.tintKit ?? []) k.setTint(hex); rig?.tint(hex); };
  const take = (s: PlanShot) => { shot = s; if (`${s.template}|${s.seed}` !== builtKey) build(s); setTint(colourOf(s.colour).hex); syncProps(s); models.sync(s.models ?? []); };
  /* picking: a ray from the camera through a point of the view */
  const ray = new T.Raycaster(); const ndc = new T.Vector2(); const plane = new T.Plane(new T.Vector3(0, 1, 0), 0); const hit = new T.Vector3();
  const aimRay = (nx: number, ny: number) => { ndc.set(nx, ny); camera.updateMatrixWorld(); ray.setFromCamera(ndc, camera); };
  /* a kit piece alone on a pale stage, framed from the front-right and a little above, for the drawer */
  const thumbScene = new T.Scene(); const tcam = new T.PerspectiveCamera(30, 1, 0.01, 200); const tHemi = new T.HemisphereLight(0xfaf5ee, 0x8a847b, 1.2); const tKey = new T.DirectionalLight(0xffeedd, 2.3); tKey.position.set(-2, 4, 3);
  const tFill = new T.DirectionalLight(0xd6e2ff, 0.6); tFill.position.set(3, 1.5, -2); thumbScene.add(tHemi, tKey, tFill);
  /* the browser may take the WebGL context away (GPU memory, a driver reset): three.js restores its state; we redraw and tell the player */
  const onLost = (e: Event) => { e.preventDefault(); lost = true; events.onContextLost?.(true); };
  const onRestored = () => { lost = false; apply(); draw(); events.onContextLost?.(false); };
  canvas.addEventListener('webglcontextlost', onLost); canvas.addEventListener('webglcontextrestored', onRestored);
  const api: PrevizEngine = {
    canvas,
    get alive() { return alive && !lost; },
    setShot(s) { capturing = false; take(s); apply(); draw(); if (!tuned && s.template.startsWith('open-city')) void Promise.resolve(built?.ready).then(autoTune); },
    seek(t) { capturing = false; lastT = t; draw(); },
    setFreeCamera(p) { free = p; draw(); },
    setActor(p) { liveActor = p; draw(); },
    setLive(pose, a, t) { free = pose; liveActor = a; lastT = t; draw(); },
    ready: () => Promise.all([rigReady, built?.ready, propsReady, models.ready(), vehicle.ready(shot), QUALITY[quality()].ao || QUALITY[quality()].bloom ? post.ready : null]).then(() => undefined),
    setPass(p) { pass = p; apply(); draw(); },
    setSize(w, h, ratio) { if (!alive) return; renderer.setPixelRatio(ratio); renderer.setSize(Math.max(2, Math.round(w)), Math.max(2, Math.round(h)), false); post.setSize(canvas.width, canvas.height); camera.aspect = w / h; camera.updateProjectionMatrix(); draw(); },
    renderAt(s, t, p) { if (!alive || lost) throw new Error('The 3D view stopped while recording. Nothing was saved; record again.'); capturing = true; free = null; liveActor = null; if (override) { override = null; propsKey = ''; } take(s); pass = p; apply(); lastT = t; draw(); },
    selectProp(i) { selected = i; if (i != null) selModel = null; draw(); },
    selectModel(i) { selModel = i; if (i != null) selected = null; draw(); },
    pickModel(nx, ny) { aimRay(nx, ny); return models.pick(ray); },
    cameraGround() { return shot ? [camera.position.x, camera.position.z] : null; },
    probeModel: (src) => probeUserModel(T, src),
    setBay(b) { bayOn = b; },
    pickProp(nx, ny) { aimRay(nx, ny); const h = ray.intersectObjects(propsRoot.children, true)[0]; const i = h?.object?.userData?.prop; return typeof i === 'number' ? i : null; },
    groundPoint(nx, ny) { if (!shot) return null; aimRay(nx, ny); let y = 0;
      for (let k = 0; k < 3; k++) { plane.constant = -y; if (!ray.ray.intersectPlane(plane, hit)) return null; const ny2 = groundAt(shot.template, hit.x, hit.z); if (Math.abs(ny2 - y) < 0.01) break; y = ny2; }
      return [Math.round(hit.x * 1000) / 1000, Math.round(hit.z * 1000) / 1000]; },
    castFloor(nx, ny) { if (!shot) return null; aimRay(nx, ny); const o = ray.ray.origin, d = ray.ray.direction; return rayToGround(shot.template, [o.x, o.y, o.z], [d.x, d.y, d.z]); },
    project(x, y, z) { hit.set(x, y, z); camera.updateMatrixWorld(); hit.project(camera); return [hit.x, hit.y, hit.z < 1 && hit.z > -1]; },
    setGhost(g) { ghost.set(g); draw(); },
    setHover(h) { hoverOn = h; draw(); },
    setOverride(o) { const was = override; override = o; const s = shot;
      if (s && o?.kind === 'model') models.sync((s.models ?? []).map((m, j) => (j === o.i ? { ...m, x: o.x, z: o.z, r: o.r, h: o.h } : m)));
      else if (s && was?.kind === 'model') models.sync(s.models ?? []);
      if (s && !o && was?.kind === 'prop') { const p = s.props?.[was.i]; const ob = propObj(was.i); if (p && ob) poseProp(ob, p, s.template); }
      draw(); },
    async snapPieces(ids, w, h, restore) { await loadPieces(T, ids).catch(() => undefined); const out: Record<string, string> = {}; if (!alive || lost) return out; renderer.setPixelRatio(1); renderer.setSize(w, h, false);
      const keepBg = thumbScene.background; thumbScene.background = new T.Color(0xebe7e1); const keepTm = renderer.toneMappingExposure; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
      const bx = new T.Box3(); const c = new T.Vector3(), sz = new T.Vector3(); const sh = renderer.shadowMap.enabled; renderer.shadowMap.enabled = false;
      try { for (const id of ids) { const o = piece(id); if (!o) continue; thumbScene.add(o); bx.setFromObject(o); bx.getCenter(c); bx.getSize(sz); const r = Math.max(0.05, sz.length() / 2);
          const dist = r / Math.sin((tcam.fov * Math.PI) / 360) * 1.02; tcam.position.set(c.x + dist * 0.55, c.y + dist * 0.42, c.z + dist * 0.72); tcam.lookAt(c); tcam.near = dist / 50; tcam.far = dist * 4; tcam.aspect = canvas.width / canvas.height; tcam.updateProjectionMatrix();
          renderer.render(thumbScene, tcam); out[id] = canvas.toDataURL('image/jpeg', 0.84); thumbScene.remove(o); } }
      finally { thumbScene.background = keepBg; renderer.shadowMap.enabled = sh; renderer.toneMappingExposure = keepTm; apply(); restore(); }
      return out; },
    addExtra(o) { scene.add(o); draw(); return () => { o.removeFromParent(); }; },
    dispose() { if (!alive) return; alive = false; offQ(); post.dispose(); canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored); clear(); models.dispose(); rig?.dispose(); rig = null; vehicle.dispose(); clay.dispose(); depth.dispose(); renderer.dispose(); renderer.forceContextLoss?.(); },
  };
  /* dev builds only: the newest engine, for the fps and frame checks (scripts in the report) */
  if ((import.meta as any).env?.DEV) { (globalThis as any).__previz = api; (globalThis as any).__previzGl = { scene, renderer, camera }; }
  return api;
}

// ---------------- the presets ----------------
type Builder = (T: T3, g: any, s: PlanShot, R: () => number, ctx: RenderCtx) => Built;
/** the set's material: matte, from the brand palette (theme.ts) */
const lam = (T: T3, color: number | string) => mat(T, color);
const box = (T: T3, w: number, h: number, d: number, m: any, x = 0, y = 0, z = 0) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const cyl = (T: T3, rt: number, rb: number, h: number, m: any, x = 0, y = 0, z = 0, seg = 28) => { const o = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); return o; };
const ball = (T: T3, r: number, m: any, x = 0, y = 0, z = 0) => { const o = new T.Mesh(new T.SphereGeometry(r, 24, 16), m); o.position.set(x, y, z); return o; };
const ground = (T: T3, g: any, color: number, size = 240, y = 0) => { const p = new T.Mesh(new T.PlaneGeometry(size, size), lam(T, color)); p.rotation.x = -Math.PI / 2; p.position.y = y; g.add(p); return p; };
/** seeded scatter without overlaps: true (and remembered) when a footprint of radius r at (x, z) clears every one placed before */
const spaced = (placed: [number, number, number][], x: number, z: number, r: number) => { if (placed.some(([a, b, c]) => Math.hypot(a - x, b - z) < c + r)) return false; placed.push([x, z, r]); return true; };
/** a limb that hangs from its pivot (a capsule whose top sits at the pivot) */
const limb = (T: T3, len: number, r: number, m: any) => { const pivot = new T.Group(); const c = new T.Mesh(new T.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 6, 12), m); c.position.y = -len / 2; pivot.add(c); return pivot; };
const tree = (T: T3, g: any, x: number, z: number, h: number, trunkM: any, leafM: any) => { const t = new T.Group(); t.add(cyl(T, 0.07, 0.09, h * 0.45, trunkM, x, h * 0.225, z, 10)); t.add(ball(T, h * 0.26, leafM, x, h * 0.66, z)); g.add(t); return t; };
/** kit set dressing: load the pieces, then call place() once (it adds them and hides the primitives they replace); errors keep the primitives */
const dress = (T: T3, ids: string[], place: () => void, redraw: () => void) => loadPieces(T, ids).then(() => { place(); redraw(); }).catch((e) => { console.warn('Direct a Shot: kit pieces could not be loaded', e); });
/** every mesh of a kit piece casts and receives shadows (the build pass ran before the piece arrived) */
const shadows = (o: any, cast = true) => { o?.traverse((m: any) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = true; } }); return o; };

const BUILDERS: Record<string, Builder> = {
  // The open city (2026-10-26): a big map assembled from a placement spec (world/assemble.ts); three lighting variants.
  'open-city': (T, g, s, _R, ctx) => buildCity(T, g, s, ctx, 'day'), 'open-city-golden': (T, g, s, _R, ctx) => buildCity(T, g, s, ctx, 'golden'), 'open-city-night': (T, g, s, _R, ctx) => buildCity(T, g, s, ctx, 'night'),
  // A mannequin walks left to right along a pavement at golden hour; KayKit shop fronts, street lights, benches and trees behind; the camera follows.
  'walk-by': (T, g, s, R, ctx) => {
    const look = LIGHTS.golden; ground(T, g, PAL.asphalt);
    g.add(box(T, 60, WALK_FLOOR_Y, 3.2, lam(T, PAL.stone), 0, WALK_FLOOR_Y / 2, -0.6)); g.add(box(T, 60, 0.16, 0.18, lam(T, PAL.paper), 0, 0.08, 1.0));
    for (let x = -28; x < 28; x += 3) g.add(box(T, 1.4, 0.005, 0.12, lam(T, PAL.sand), x, 0.003, 4.6)); /* the road's centre line */
    /* primitive blocks until the kit has loaded (and if it can't) */
    const blocks = new T.Group(); g.add(blocks); const bm = [lam(T, PAL.paper), lam(T, PAL.sand), lam(T, PAL.warmGrey), lam(T, PAL.stone)]; let x = -26;
    while (x < 26) { const w = 2 + R() * 3.2; const h = 3 + R() * 7; blocks.add(box(T, w - 0.15, h, 4, bm[Math.floor(R() * bm.length)], x + w / 2, h / 2, -5.4)); x += w; }
    const trunk = lam(T, PAL.woodDark); const leaf = lam(T, PAL.sageDark); const trees: any[] = []; for (let i = -10; i <= 10; i++) if (R() > 0.35) trees.push(tree(T, g, i * 2.6 + R() * 0.6, -2.2, 2.6 + R() * 0.9, trunk, leaf));
    const FRONTS = ['kk.building_E', 'kk.building_F', 'kk.building_H', 'kk.building_B', 'kk.building_G', 'kk.building_A']; /* the lighter shop fronts (they read best behind the figure) */ const order = FRONTS.map((f) => ({ f, k: R() })).sort((a, b) => a.k - b.k).map((o) => o.f);
    const ready = dress(T, [...FRONTS, 'kk.streetlight', 'kk.bench', 'kk.firehydrant', 'kk.trash_A', 'kk.bush', 'kn.tree_default', 'kn.tree_oak'], () => {
      const kit = new T.Group(); g.add(kit); blocks.visible = false; trees.forEach((t) => (t.visible = false));
      /* a row of shop fronts, their fronts just behind the pavement (z −2.7), facing the street */
      for (let i = 0; i < 7; i++) { const id = order[i % order.length]; const k = KIT[id]; const col = k.col ?? [0, 0, k.w, k.d]; const xx = -31.5 + i * 10.5;
        shadows(placePiece(kit, id, xx, WALK_FLOOR_Y - 0.5, -2.7 - (col[1] + col[3] / 2), 0, 1)); }
      for (const lx of [-21, -13.5, -6.5, 6.5, 13.5, 21]) shadows(placePiece(kit, 'kk.streetlight', lx, WALK_FLOOR_Y, 0.75, Math.PI, 1)); /* on the kerb, clear of the walk */
      const bits: [string, number, number][] = [['kk.bench', -5.6, -1.75], ['kk.bench', 6.4, -1.75], ['kk.firehydrant', 4.2, -1.7], ['kk.trash_A', -9.2, -1.8], ['kk.bush', 9.8, -1.85], ['kk.bush', -2.8, -1.9], ['kn.tree_default', -12.5, -1.6], ['kn.tree_oak', 13, -1.6], ['kn.tree_default', 19.5, -1.6], ['kn.tree_oak', -19.5, -1.6]];
      for (const [id, bx, bz] of bits) shadows(placePiece(kit, id, bx, WALK_FLOOR_Y, bz, id === 'kk.bench' ? 0 : R() * 6.28, id.startsWith('kn.') ? 0.6 : id === 'kk.firehydrant' || id === 'kk.trash_A' ? 0.6 : 1));
    }, ctx.redraw);
    // the figure (about 1.75 m): it walks on the pavement (WALK_FLOOR_Y); walkPose solves the hip height so the lower foot touches it
    const skin = lam(T, PAL.sand); const jacket = lam(T, colourOf(s.colour).hex); const trousers = lam(T, PAL.graphite); const fig = new T.Group(); g.add(fig);
    const hips = new T.Group(); hips.position.y = walkPose(0).hipY; fig.add(hips);
    const torso = new T.Mesh(new T.CapsuleGeometry(0.17, 0.38, 6, 14), jacket); torso.position.y = 0.33; torso.scale.set(1, 1, 0.72); hips.add(torso);
    const head = ball(T, 0.115, skin, 0, 0.78, 0); head.scale.set(0.9, 1.08, 0.95); hips.add(head); hips.add(cyl(T, 0.045, 0.05, 0.1, skin, 0, 0.66, 0, 10));
    const pelvis = box(T, 0.3, 0.14, 0.18, trousers, 0, 0.02, 0); hips.add(pelvis);
    const legs = [-1, 1].map((side) => { const thigh = limb(T, 0.46, 0.075, trousers); thigh.position.set(0.09 * side, -0.02, 0); hips.add(thigh);
      const shin = limb(T, 0.45, 0.062, trousers); shin.position.y = -0.46; thigh.add(shin); const foot = box(T, 0.1, 0.07, 0.24, lam(T, PAL.charcoal), 0, -0.47, 0.06); shin.add(foot); return { thigh, shin }; });
    const arms = [-1, 1].map((side) => { const up = limb(T, 0.3, 0.055, jacket); up.position.set(0.22 * side, 0.55, 0); up.rotation.z = 0.08 * side; hips.add(up);
      const fore = limb(T, 0.28, 0.048, jacket); fore.position.y = -0.3; up.add(fore); const hand = ball(T, 0.05, skin, 0, -0.3, 0); fore.add(hand); return { up, fore }; });
    return { sky: look.sky[1], ground: PAL.asphalt, fog: look.fog, look, tint: [jacket], fig, ready,
      shadow: { center: [0, 1, -1.6], size: 9 },
      update(t, cur) { const sub = subjectAt(cur, t); fig.position.set(sub.pos[0], sub.pos[1], sub.pos[2]); fig.rotation.y = sub.heading; const pose = walkPose(sub.phase);
        legs.forEach((l, i) => { l.thigh.rotation.x = pose.legs[i].thigh; l.shin.rotation.x = pose.legs[i].shin; });
        arms.forEach((ar, i) => { ar.up.rotation.x = pose.arms[i].up; ar.fore.rotation.x = pose.arms[i].fore; });
        hips.position.y = pose.hipY; hips.rotation.y = pose.hipYaw; torso.rotation.y = pose.torsoYaw; } };
  },
  // The product bottle (blank label) on a two-tone plinth in a warm grey studio sweep; the plinth turns slowly.
  'product-hero': (T, g, s, R, ctx) => {
    const look = LIGHTS.studio; const sweepC = PAL.stone; const sweep = lam(T, sweepC); ground(T, g, sweepC, 40);
    /* a studio sweep: the floor curves up into the back wall (a quarter cylinder, r 2 m, from z −4 at the floor to z −6 at 2 m) */
    const back = new T.Mesh(new T.PlaneGeometry(40, 20), sweep); back.position.set(0, 12, -6); g.add(back);
    const cove = new T.Mesh(new T.CylinderGeometry(2, 2, 40, 24, 1, true, Math.PI, Math.PI / 2), mat(T, sweepC, { side: T.DoubleSide })); cove.rotation.z = Math.PI / 2; cove.position.set(0, 2, -4); cove.userData.noCast = true; g.add(cove); /* the sweep only receives: a curved wall casting onto itself reads as a dark wedge */
    const ped = new T.Group(); g.add(ped); ped.add(cyl(T, 0.62, 0.62, 0.52, lam(T, PAL.paper), 0, 0.3, 0, 64)); ped.add(cyl(T, 0.6, 0.6, 0.04, lam(T, PAL.graphite), 0, 0.02, 0, 64)); /* a charcoal foot under an off-white drum */
    ped.add(cyl(T, 0.63, 0.63, 0.012, mat(T, BRAND.orange, { rough: 0.6 }), 0, 0.566, 0, 64)); ped.add(cyl(T, 0.6, 0.6, 0.03, lam(T, PAL.offWhite), 0, 0.585, 0, 64)); /* a thin orange line under the top */
    const glass = mat(T, colourOf(s.colour).hex, { rough: 0.45 }); const cap = lam(T, PAL.charcoal); const band = lam(T, PAL.paper); const b = new T.Group(); b.position.y = 0.6; ped.add(b);
    b.add(cyl(T, 0.16, 0.17, 0.42, glass, 0, 0.21, 0, 40)); const sh = ball(T, 0.16, glass, 0, 0.42, 0); sh.scale.set(1, 0.55, 1); b.add(sh);
    b.add(cyl(T, 0.052, 0.06, 0.12, glass, 0, 0.53, 0, 24)); b.add(cyl(T, 0.066, 0.066, 0.1, cap, 0, 0.63, 0, 24));
    const tag = box(T, 0.16, 0.14, 0.02, band, 0, 0.22, 0.165); b.add(tag); /* a blank band on one side, so the turn reads */
    for (let i = 0; i < 3; i++) { const a = 2.2 + R() * 1.6; g.add(ball(T, 0.08 + R() * 0.08, lam(T, i === 1 ? PAL.sand : PAL.warmGrey), Math.cos(a) * (1.3 + R()), 0.08, Math.sin(a) * 1.4 - 0.4)); }
    g.add(box(T, 0.34, 0.34, 0.34, lam(T, PAL.sand), -1.5, 0.17, -1.1)); g.add(cyl(T, 0.22, 0.22, 0.7, lam(T, PAL.paper), 1.35, 0.35, -1.6, 40));
    const tintKit: { setTint(h: string): void }[] = [];
    const ready = dress(T, ['wb.bottle', 'fu.cactus_medium_A'], () => {
      const k = PROP_PIECES['wb.bottle']; const S = 2.7; const o = shadows(placePiece(ped, 'wb.bottle', 0, 0.6 - k.y0 * S, 0, Math.PI * 0.15, S)); if (o) { b.visible = false; tintKit.push(tintPiece(T, o, colourOf(s.colour).hex, { key: 0xbdba6e, tol: 0.25 } /* the label: the bottle's body takes the colour; the band and cap stay dark */)); }
      shadows(placePiece(g, 'fu.cactus_medium_A', 1.35, 0.7, -1.6, 0.6, 0.8));
    }, ctx.redraw);
    return { sky: look.sky[1], ground: sweepC, fog: look.fog, look, tint: [glass], tintKit, ready, shadow: { center: [0, 0.6, -0.6], size: 3.2 }, update(t, cur) { const sub = subjectAt(cur, t); ped.rotation.y = sub.heading; ped.position.set(sub.pos[0], 0, sub.pos[2]); } };
  },
  // Three rooms in a row from a small floor plan: hall (z 3…0), living (0…−6), kitchen (−6…−11), furnished from the KayKit furniture kit.
  walkthrough: (T, g, s, _R, ctx) => {
    const look = LIGHTS.interior; const wall = lam(T, PAL.paper); const floor = lam(T, 0xc7a98a); const pane = new T.MeshBasicMaterial({ color: 0xf6efe4 }); const H = 2.7, X = 2.5;
    g.add(box(T, 2 * X, 0.04, 14.4, floor, 0, -0.02, -4)); g.add(box(T, 2 * X, 0.04, 14.4, new T.MeshBasicMaterial({ color: 0xece8e2 }), 0, H, -4)); ground(T, g, PAL.sageDark, 240, -0.08); /* below the floor: no z-fighting */
    const PLAN = [{ name: 'hall', z0: 3, z1: 0 }, { name: 'living', z0: 0, z1: -6 }, { name: 'kitchen', z0: -6, z1: -11 }];
    for (const r of PLAN) { const len = r.z0 - r.z1; const zc = (r.z0 + r.z1) / 2;
      for (const side of [-1, 1]) { g.add(box(T, 0.12, H, len, wall, side * X, H / 2, zc)); if (r.name !== 'hall') { const wp = box(T, 0.02, 1.2, Math.min(2.2, len - 1.4), pane, side * (X - 0.07), 1.5, zc); g.add(wp); } } }
    for (const z of [0, -6]) for (const side of [-1, 1]) g.add(box(T, X - 0.75, H, 0.12, wall, side * (0.75 + (X - 0.75) / 2), H / 2, z)); /* 1.5 m doors */
    for (const z of [0, -6]) g.add(box(T, 1.5, H - 2.2, 0.12, wall, 0, 2.2 + (H - 2.2) / 2, z));
    g.add(box(T, 2 * X, H, 0.12, wall, 0, H / 2, -11)); g.add(box(T, 1.8, 1.1, 0.02, pane, 0, 1.45, -10.92)); g.add(box(T, 2 * X, H, 0.12, wall, 0, H / 2, 3.1));
    g.add(box(T, 2 * X - 0.1, 0.08, 0.02, lam(T, PAL.warmGrey), 0, 0.04, -10.93)); /* skirting on the end wall */
    const sofaM = lam(T, colourOf(s.colour).hex); const wood = lam(T, PAL.wood); const soft = lam(T, PAL.stone); const dark = lam(T, PAL.graphite);
    const prim = new T.Group(); g.add(prim);
    // hall: a bench and a coat stand
    prim.add(box(T, 0.4, 0.45, 1.1, wood, -2.15, 0.225, 1.6)); prim.add(cyl(T, 0.03, 0.03, 1.7, dark, 2.2, 0.85, 2.4, 8));
    // living: sofa, low table, rug, lamp, shelf
    prim.add(box(T, 0.9, 0.42, 2.2, sofaM, -1.95, 0.21, -3.2)); prim.add(box(T, 0.22, 0.8, 2.2, sofaM, -2.33, 0.4, -3.2)); for (const z of [-4.2, -2.2]) prim.add(box(T, 0.9, 0.6, 0.2, sofaM, -1.95, 0.3, z));
    const rug = box(T, 2.4, 0.01, 2.8, soft, -0.6, 0.006, -3.2); prim.add(rug); prim.add(box(T, 0.8, 0.36, 1.2, wood, -0.6, 0.18, -3.2));
    prim.add(cyl(T, 0.02, 0.02, 1.5, dark, -2.1, 0.75, -4.9, 8)); prim.add(cyl(T, 0.18, 0.24, 0.3, soft, -2.1, 1.6, -4.9, 20)); prim.add(box(T, 0.35, 1.9, 1.6, wood, 2.25, 0.95, -2.6));
    // kitchen: counter (stays: the kit's counters are restaurant-deep), island, table and chairs
    g.add(box(T, 0.65, 0.92, 4.2, lam(T, PAL.offWhite), 2.15, 0.46, -8.6)); g.add(box(T, 0.67, 0.04, 4.2, dark, 2.15, 0.94, -8.6)); g.add(box(T, 0.9, 0.92, 1.8, lam(T, PAL.paper), 0.6, 0.46, -8.4)); g.add(box(T, 0.92, 0.04, 1.82, dark, 0.6, 0.94, -8.4));
    prim.add(box(T, 1.0, 0.05, 1.6, wood, -1.5, 0.76, -8.3)); for (const [cx, cz] of [[-1.5, -9.4], [-1.5, -7.2], [-2.2, -8.3], [-0.8, -8.3]]) prim.add(box(T, 0.42, 0.45, 0.42, wood, cx, 0.225, cz));
    g.traverse((o: any) => { if (o.isMesh && o.material === wall) o.userData.noCast = true; }); /* the walls and ceiling let the light in; furniture casts */
    const tintKit: { setTint(h: string): void }[] = [];
    const ready = dress(T, ['fu.couch_pillows', 'fu.rug_rectangle_stripes_A', 'fu.table_low', 'fu.lamp_standing', 'fu.shelf_B_large_decorated', 'fu.armchair', 'fu.cactus_medium_A', 'fu.cabinet_small_decorated', 'fu.table_medium', 'fu.chair_B', 'fu.lamp_table', 'fu.pictureframe_large_A', 'fu.cactus_small_A', 'fu.book_set'], () => {
      const kit = new T.Group(); g.add(kit); prim.visible = false; const P = (id: string, x: number, z: number, r: number, sc = 1, y = 0) => shadows(placePiece(kit, id, x, y, z, r, sc));
      P('fu.cabinet_small_decorated', -2.05, 1.7, Math.PI / 2); P('fu.lamp_standing', 2.1, 2.5, 0, 0.95);
      const sofa = P('fu.couch_pillows', -1.9, -3.2, Math.PI / 2); if (sofa) tintKit.push(tintPiece(T, sofa, colourOf(s.colour).hex, { all: true }));
      const rugO = P('fu.rug_rectangle_stripes_A', -0.5, -3.2, Math.PI / 2); shadows(rugO, false); P('fu.table_low', -0.55, -3.2, Math.PI / 2);
      P('fu.lamp_standing', -2.05, -4.95, 0); P('fu.shelf_B_large_decorated', 2.2, -2.6, -Math.PI / 2); P('fu.armchair', 1.2, -4.6, -Math.PI * 0.8); P('fu.cactus_medium_A', 2.05, -5.4, 0, 0.9);
      P('fu.pictureframe_large_A', -2.4, -1.4, Math.PI / 2, 0.8, 1.2); P('fu.book_set', -0.45, -3.05, 0.4, 0.8, 0.35);
      P('fu.table_medium', -1.4, -8.4, 0); for (const [cx, cz, r] of [[-1.4, -9.45, 0], [-1.4, -7.35, Math.PI], [-2.25, -8.4, Math.PI / 2], [-0.55, -8.4, -Math.PI / 2]] as [number, number, number][]) P('fu.chair_B', cx, cz, r);
      P('fu.cactus_small_A', -1.4, -8.4, 0, 0.8, 0.7); P('fu.lamp_table', 2.15, -10.3, 0, 0.8, 0.96);
    }, ctx.redraw);
    return { sky: look.sky[1], ground: PAL.sageDark, fog: look.fog, look, tint: [sofaM], tintKit, ready, shadow: { center: [0, 1, -4], size: 8 }, update() { /* the rooms stay still; only the camera moves */ } };
  },
  // A snowy holiday village on a round charcoal plinth (Kenney Holiday Kit cabins and pines); a toy train runs one loop on a raised ring track.
  diorama: (T, g, s, R, ctx) => {
    const look = LIGHTS.diorama; ground(T, g, PAL.charcoal); const baseM = lam(T, PAL.graphite); const top = lam(T, PAL.paper);
    g.add(cyl(T, 4.05, 4.15, 0.3, baseM, 0, 0.15, 0, 96)); g.add(cyl(T, 4.07, 4.07, 0.02, mat(T, BRAND.orange, { rough: 0.6 }), 0, 0.27, 0, 96)); g.add(cyl(T, 4, 4, 0.04, top, 0, 0.3, 0, 96));
    const pond = new T.Mesh(new T.CircleGeometry(0.7, 40), mat(T, PAL.glass, { rough: 0.25 })); pond.rotation.x = -Math.PI / 2; pond.position.set(-1.1, 0.325, 0.9); g.add(pond);
    const walls = [lam(T, PAL.stone), lam(T, PAL.sand), lam(T, PAL.paper)]; const roofs = [lam(T, PAL.slate), lam(T, PAL.woodDark), lam(T, PAL.graphite)];
    const trunk = lam(T, PAL.woodDark); const leaf = lam(T, PAL.sageDark);
    const placed: [number, number, number][] = [[-1.1, 0.9, 0.75]]; /* the pond */ const spots: { x: number; z: number; ry: number; w: number; tree: boolean; th: number; k: number; o: any }[] = [];
    for (let i = 0; i < 70; i++) { const a = R() * Math.PI * 2; const r = 0.5 + R() * 3.2; const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const isTree = R() < 0.3; const w = 0.24 + R() * 0.26, d = 0.24 + R() * 0.2, h = 0.22 + R() * 0.38; const k = Math.floor(R() * 3); const ry = R() * Math.PI; const th = 0.28 + R() * 0.25;
      const foot = isTree ? th * 0.32 : Math.hypot(w, d) / 2 + 0.03;
      if (Math.abs(r - TRACK_R) < 0.3 + foot || r + foot > 3.85 || !spaced(placed, x, z, foot)) continue;
      if (isTree) { const t = new T.Group(); t.add(cyl(T, 0.02, 0.025, th * 0.5, trunk, x, 0.32 + th * 0.25, z, 6)); t.add(ball(T, th * 0.32, leaf, x, 0.32 + th * 0.62, z)); g.add(t); spots.push({ x, z, ry, w, tree: true, th, k, o: t }); continue; }
      const house = new T.Group(); house.position.set(x, 0.32, z); house.rotation.y = ry; g.add(house); house.add(box(T, w, h, d, walls[k], 0, h / 2, 0));
      const roof = new T.Mesh(new T.ConeGeometry(Math.max(w, d) * 0.72, 0.18 + R() * 0.12, 4), roofs[k]); roof.rotation.y = Math.PI / 4; roof.position.y = h + 0.1; house.add(roof); spots.push({ x, z, ry, w: Math.max(w, d), tree: false, th, k, o: house }); }
    const rail = lam(T, PAL.slate); const ring = new T.Mesh(new T.TorusGeometry(TRACK_R, 0.045, 8, 96), rail); ring.rotation.x = Math.PI / 2; ring.position.y = TRAIN_Y - 0.045; g.add(ring);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const top = TRAIN_Y - 0.09; g.add(cyl(T, 0.035, 0.045, top - 0.32, rail, Math.cos(a) * TRACK_R, 0.32 + (top - 0.32) / 2, Math.sin(a) * TRACK_R, 10)); }
    const trainM = lam(T, colourOf(s.colour).hex); const cars = [0, 1, 2].map((i) => { const c = new T.Group(); const body = new T.Group(); c.add(body); body.add(box(T, 0.16, 0.13, 0.36, trainM, 0, 0.065, 0)); body.add(box(T, 0.17, 0.02, 0.3, lam(T, PAL.charcoal), 0, 0.14, 0)); if (i === 0) body.add(box(T, 0.12, 0.08, 0.02, lam(T, PAL.paper), 0, 0.08, 0.19)); /* the front: cars drive towards their +z */ g.add(c); return { c, body }; });
    const tintKit: { setTint(h: string): void }[] = [];
    const CABINS = ['ho.cabin-a', 'ho.cabin-b', 'ho.cabin-c']; const PINES = ['ho.tree-snow-a', 'ho.tree-snow-b', 'ho.tree-snow-c']; const TRAIN = ['ho.train-locomotive', 'ho.train-tender', 'ho.train-wagon'];
    const ready = dress(T, [...CABINS, ...PINES, ...TRAIN, 'ho.lantern', 'ho.snowman', 'ho.bench', 'ho.rocks-medium'], () => {
      const kit = new T.Group(); g.add(kit);
      for (const sp of spots) { sp.o.visible = false;
        if (sp.tree) { const id = PINES[sp.k]; shadows(placePiece(kit, id, sp.x, 0.32, sp.z, sp.ry, (sp.th * 1.25) / PROP_PIECES[id].h)); continue; }
        const id = CABINS[sp.k]; shadows(placePiece(kit, id, sp.x, 0.32, sp.z, sp.ry, (sp.w * 1.35) / PROP_PIECES[id].w)); }
      const extras: [string, number, number, number, number][] = [['ho.snowman', -0.35, 1.35, 0.7, 0.12], ['ho.bench', -1.05, 1.75, 0.2, 0.1], ['ho.rocks-medium', -1.75, 0.4, 0, 0.12], ['ho.lantern', 0.4, 0.55, 0, 0.12], ['ho.lantern', -1.9, 1.3, 0, 0.12]];
      for (const [id, x, z, r, sc] of extras) if (!placed.some(([a, b, c]) => Math.hypot(a - x, b - z) < c + 0.12) || id === 'ho.snowman') shadows(placePiece(kit, id, x, 0.32, z, r, sc));
      /* the toy train: the kit's engine, tender and wagon (they run along their x; turned to drive along +z), carrying the subject colour */
      cars.forEach(({ c, body }, i) => { const id = TRAIN[i]; const k = PROP_PIECES[id]; const o = placePiece(c, id, 0, 0, 0, -Math.PI / 2, 0.36 / Math.max(0.5, k.w) * (i === 1 ? 0.75 : 1)); if (!o) return; shadows(o); body.visible = false; tintKit.push(tintPiece(T, o, colourOf(s.colour).hex, { all: true })); });
    }, ctx.redraw);
    return { sky: look.sky[1], ground: PAL.charcoal, fog: look.fog, look, tint: [trainM], tintKit, ready, shadow: { center: [0, 0.4, 0], size: 4.6 },
      update(t, cur) { const lead = subjectAt(cur, t); const a0 = -lead.heading; cars.forEach(({ c }, i) => { const a = a0 - i * 0.17; c.position.set(Math.cos(a) * TRACK_R, lead.pos[1], Math.sin(a) * TRACK_R); c.rotation.y = -a; }); } };
  },
  // Hills, a hilltop town and a tower in late-afternoon sun.
  establishing: (T, g, s, R) => {
    const est = LIGHTS.hills; ground(T, g, 0x98a08c, 600); const hillM = lam(T, 0xa2a993); const farM = lam(T, 0xbfc2bb);
    const dome = (r: number, ry: number, m: any, x: number, z: number) => { const d = ball(T, r, m, x, 0, z); d.scale.set(1, ry / r, 1); g.add(d); };
    for (const [hx, hz, r, h] of ESTABLISHING_HILLS) dome(r, h, hillM, hx, hz); /* the same hills the camera's ground clamp knows (hillHeight) */ for (let i = 0; i < 7; i++) dome(9 + R() * 8, 3 + R() * 4, farM, -50 + i * 17 + R() * 6, -36 - R() * 14);
    const hillY = hillHeight;
    const wallM = lam(T, PAL.paper); const roofM = lam(T, colourOf(s.colour).hex);
    const placed: [number, number, number][] = [[0.5, -4.6, 0.45]]; /* the tower */
    for (let i = 0; i < 60 && placed.length < 27; i++) { const a = R() * Math.PI * 2; const r = R() * 2.6; const x = Math.cos(a) * r, z = -4 + Math.sin(a) * r; const y = hillY(x, z) - 0.08;
      const w = 0.35 + R() * 0.35, d = 0.35 + R() * 0.3, h = 0.3 + R() * 0.4; if (!spaced(placed, x, z, Math.hypot(w, d) / 2)) continue; const house = new T.Group(); house.position.set(x, y, z); house.rotation.y = R() * Math.PI; g.add(house);
      house.add(box(T, w, h, d, wallM, 0, h / 2, 0)); const roof = new T.Mesh(new T.ConeGeometry(Math.max(w, d) * 0.72, 0.22, 4), roofM); roof.rotation.y = Math.PI / 4; roof.position.y = h + 0.11; house.add(roof); }
    const stone = lam(T, PAL.stone); const ty = hillY(0.5, -4.6); g.add(cyl(T, 0.32, 0.38, 3.2, stone, 0.5, ty + 1.5, -4.6, 20)); const cone = new T.Mesh(new T.ConeGeometry(0.46, 0.9, 20), roofM); cone.position.set(0.5, ty + 3.55, -4.6); g.add(cone);
    const trunk = lam(T, PAL.woodDark); const leaf = lam(T, PAL.sageDark); for (let i = 0; i < 40; i++) { const x = -18 + R() * 36, z = -2 + R() * 10; if (Math.abs(x) < 5.5) continue; /* keep the line of sight to the town clear */ tree(T, g, x, z, 0.9 + R() * 1.1, trunk, leaf); }
    return { sky: est.sky[1], ground: 0x98a08c, fog: est.fog, look: est, tint: [roofM], shadow: { center: [0, 1.2, -4], size: 9 }, update() { /* the place stays still; only the camera moves */ } };
  },
};
/** a kit piece id is known to one of the files */
export const knownPiece = (id: string) => !!fileOf(id);
