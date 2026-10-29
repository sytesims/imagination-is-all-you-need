/**
 * Your 3D models in the Direct a Shot engine (2026-10-27; the maths is in server/src/shared/previzModels.ts). A GLB from the 3D tab or an upload
 * is loaded once per page through the same GLTFLoader + Meshopt path as the kit pieces (kits.ts), checked (size cap, binary glTF, at least one
 * mesh), cleaned (its own lights and cameras are dropped, so it never relights or reframes the set) and normalised: one unit tall, its feet at
 * the origin, centred on its footprint. Each placement is a clone scaled to the shot's height in metres.
 * Deterministic: pose(...) sets everything from the shot, t and the actor's pose alone; a file's own animation plays with mixer.setTime(t).
 * A rigged character (Rig as a character, or any GLB with idle / walk / run clips) playing the actor with motion 'moves' blends its clips by
 * the actor's speed (shared/previzRig.ts rigMixAt): every clip's weight and time are set from the pose, then mixer.update(0), no clock.
 * Materials stay the file's own (its textures are the point), in shadows like every prop; Clay and Depth replace them as for the rest of the set.
 */
import { MODEL_MAX_BYTES, isModelSrc, checkModelGlb, modelGroundY, modelMotionAt, frameHeightOf, type PlacedModel } from '../../../../server/src/shared/previzModels';
import { rolesOf, canMove, rigMixAt, type RigRole } from '../../../../server/src/shared/previzRig';
import { mossGlow, MOSSBUN_RIG, MOSSBUN_STATIC } from '../rig/mossbunRig';
/** a file that has a plainer copy to fall back to when it can't be loaded (Mossbun's rig → his unrigged model, which hops) */
const FALLBACK: Record<string, string> = { [MOSSBUN_RIG]: MOSSBUN_STATIC };

type T3 = typeof import('three');
export interface LoadedModel { proto: any; animations: any[]; /** clip names by role (idle, walk, jog…) when the file has moves */ roles: Partial<Record<RigRole, string>>; /** width ÷ height of its bounds (largest side) */ fw: number; meshes: number; textured: boolean }
export class ModelLoadError extends Error {}
const cache = new Map<string, Promise<LoadedModel>>();
const mb = (b: number) => `${(b / 1048576).toFixed(b > 10485760 ? 0 : 1)} MB`;

/** Load (once per page) and check a GLB. Rejects with a ModelLoadError whose message is plain words for the user. */
export function loadUserModel(T: T3, src: string): Promise<LoadedModel> {
  let p = cache.get(src);
  if (!p) { p = (async () => {
      if (!isModelSrc(src)) throw new ModelLoadError('Choose a local GLB from Assets or upload one. External URLs are not loaded.');
      const r = await fetch(src, { signal: AbortSignal.timeout(20000) }).catch(() => null); if (!r || !r.ok) throw new ModelLoadError(r?.status === 404 ? 'That model’s file is no longer on this computer.' : 'That model’s file could not be loaded. Try selecting it again.');
      const size = Number(r.headers.get('content-length')) || 0; if (size > MODEL_MAX_BYTES) throw new ModelLoadError(`That model is ${mb(size)}: Direct a Shot takes up to ${mb(MODEL_MAX_BYTES)}. Make a lighter copy and try again.`);
      const buf = await r.arrayBuffer(); if (buf.byteLength > MODEL_MAX_BYTES) throw new ModelLoadError(`That model is ${mb(buf.byteLength)}: Direct a Shot takes up to ${mb(MODEL_MAX_BYTES)}.`);
      const problem = checkModelGlb(buf); if (problem) throw new ModelLoadError(problem);
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')]);
      const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
      /* a texture that can't be read keeps its material without it (GLTFLoader warns and goes on); a broken file rejects */
      const g = await loader.parseAsync(buf, src.replace(/[^/]*$/, '')).catch((e: unknown) => { throw new ModelLoadError(`That GLB could not be read${e instanceof Error && e.message ? ` (${e.message.slice(0, 80)})` : ''}.`); });
      const scene = g.scene ?? g.scenes?.[0]; if (!scene) throw new ModelLoadError('That GLB has no scene.');
      /* its own lights and cameras never come in: the set has its light, the shot its camera */
      const drop: any[] = []; scene.traverse((o: any) => { if (o.isLight || o.isCamera) drop.push(o); }); for (const o of drop) o.removeFromParent();
      let meshes = 0; let textured = false;
      scene.traverse((o: any) => { if (!o.isMesh) return; meshes++; o.castShadow = true; o.receiveShadow = true; if (o.isSkinnedMesh) o.frustumCulled = false; /* its bones move it outside its rest bounds */
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (!m) continue; if (m.map) { textured = true; m.map.colorSpace = T.SRGBColorSpace; } } });
      if (!meshes) throw new ModelLoadError('That GLB has no meshes: there is nothing to show.');
      scene.updateMatrixWorld(true); const box = new T.Box3().setFromObject(scene); const sz = box.getSize(new T.Vector3()); const c = box.getCenter(new T.Vector3());
      const side = Math.max(sz.x, sz.z); const tall = Math.max(sz.y, side * 0.02); if (!(tall > 0) || !Number.isFinite(tall)) throw new ModelLoadError('That GLB is empty (it has no size).');
      /* one unit tall, feet at y = 0, centred on its footprint; a placement scales the wrapper to metres */
      const inner = new T.Group(); inner.add(scene); scene.position.set(-c.x, -box.min.y, -c.z); const unit = new T.Group(); unit.add(inner); unit.scale.setScalar(1 / tall);
      const proto = new T.Group(); proto.add(unit); proto.userData.userModel = src;
      const animations = g.animations ?? []; const roles = rolesOf(animations.map((a: any) => a.name));
      return { proto, animations, roles, fw: Math.round((side / tall) * 1000) / 1000, meshes, textured };
    })().catch((e) => { cache.delete(src); if (FALLBACK[src]) return loadUserModel(T, FALLBACK[src]); throw e instanceof ModelLoadError ? e : new ModelLoadError('That model could not be loaded.'); });
    cache.set(src, p); }
  return p;
}
/** Read a GLB's footprint (fw) and check it, for the drawer before it is placed. */
export const probeUserModel = (T: T3, src: string) => loadUserModel(T, src).then((m) => ({ fw: m.fw, meshes: m.meshes, textured: m.textured, moves: canMove(m.roles) }));

export interface ModelStatus { src: string; state: 'loading' | 'ready' | 'error'; message?: string }
/** The models of one engine: build them for a shot, pose them for t. */
export function createModelLayer(T: T3, root: any, onChange: () => void, onStatus: (s: ModelStatus) => void) {
  let key = ''; let ready: Promise<void> = Promise.resolve(); let gen = 0;
  type Inst = { m: PlacedModel; body: any; turn: any; squash: any; mixer: any | null; dur: number; first: any | null; /** role → clip and its action */ moves: Partial<Record<RigRole, { name: string; dur: number }>> | null; acts: Record<string, any>; /** Mossbun's lantern (its own material, cloned per placement): its glow pulses on each hop's landing */ glow: any | null };
  let insts: Inst[] = []; let clone: ((o: any) => any) | null = null;
  const clear = () => { for (const i of insts) { i.mixer?.stopAllAction(); i.body.removeFromParent(); } insts = []; };
  return {
    /** rebuild when the models change (files, sizes, turns, actor); positions follow the shot each frame */
    sync(list: PlacedModel[]) { const k = JSON.stringify(list.map((m) => [m.id, m.src])); const same = k === key;
      if (same) { for (const i of insts) i.m = list.find((x) => x.id === i.m.id) ?? i.m; return; } key = k; const my = ++gen; clear();
      if (!list.length) { ready = Promise.resolve(); return; }
      ready = (async () => {
        clone ??= (await import('three/examples/jsm/utils/SkeletonUtils.js')).clone;
        const loaded = await Promise.all(list.map((m) => { onStatus({ src: m.src, state: 'loading' }); return loadUserModel(T, m.src).then((x) => { onStatus({ src: m.src, state: 'ready' }); return x; }, (e: Error) => { onStatus({ src: m.src, state: 'error', message: e.message }); return null; }); }));
        if (my !== gen) return; const cur = JSON.parse(key) as [string, string][];
        loaded.forEach((L, n) => { if (!L) return; const m = list[n]; if (cur[n]?.[0] !== m.id) return;
          /* body (position, heading, lean) → turn (the file's front) → squash (squash and stretch from the feet) → the normalised file */
          const body = new T.Group(); const turn = new T.Group(); const squash = new T.Group(); const c = clone!(L.proto); squash.add(c); turn.add(squash); body.add(turn);
          body.userData.model = n; c.traverse((o: any) => { if (o.isMesh) { o.userData.model = n; o.castShadow = true; o.receiveShadow = true; } });
          const anim = L.animations[0]; let mixer: any = null; let dur = 0; let first: any = null; const acts: Record<string, any> = {}; let moves: Inst['moves'] = null;
          if (anim) { mixer = new T.AnimationMixer(c); first = mixer.clipAction(anim); first.play(); dur = Math.max(0.01, anim.duration);
            /* a file with moves: one action per role clip, all held at weight 0 until pose() sets them (no clock) */
            if (canMove(L.roles)) { moves = {}; for (const [r, name] of Object.entries(L.roles) as [RigRole, string][]) { const clip = L.animations.find((a: any) => a.name === name); if (!clip) continue;
              const a = name === anim.name ? first : mixer.clipAction(clip); a.play(); a.setEffectiveTimeScale(0); acts[name] = a; moves[r] = { name, dur: Math.max(0.01, clip.duration) }; } } }
          let glow: any = null; c.traverse((o: any) => { if (o.isMesh && o.material?.name === 'Lantern') { o.material = o.material.clone(); glow = o.material; } });
          root.add(body); insts.push({ m, body, turn, squash, mixer, dur, first, moves, acts, glow }); });
        onChange();
      })(); },
    ready: () => ready,
    /**
     * Pose every model for t. ground(x, z) = the floor; star = the actor's pose when one of them plays the actor (null = it stands where it is put),
     * turn = how fast the actor turns (radians a second). Every number comes from the shot, t and the pose: nothing is remembered between frames.
     */
    pose(t: number, ground: (x: number, z: number) => number, star: { pos: [number, number, number]; heading: number; v: number; d: number; time: number; fade?: number; beat?: { kind: any; local: number } | null } | null, turn: number, template = '') {
      for (const i of insts) { const m = i.m; const actor = !!m.actor && !!star; const h = m.h; const rigged = m.actor === 'moves' && !!i.moves; const motion = m.actor === 'moves' && !i.moves ? 'hop' : m.actor;
        if (actor) { const mo = modelMotionAt(motion!, h, star!, turn); i.body.position.set(star!.pos[0], star!.pos[1] + mo.lift, star!.pos[2]);
          i.body.rotation.set(0, 0, 0); i.body.rotateY(star!.heading + mo.yaw); i.body.rotateZ(mo.lean); i.body.rotateX(mo.pitch); i.squash.scale.set(h * mo.sx, h * mo.sy, h * mo.sx);
          i.body.visible = (star!.fade ?? 1) > 0.5; }
        else if (m.actor) { const mo = modelMotionAt(motion!, h, { v: 0, d: 0, time: t }); i.body.position.set(m.x, ground(m.x, m.z) + mo.lift, m.z); i.body.rotation.set(0, m.r, 0); i.squash.scale.set(h * mo.sx, h * mo.sy, h * mo.sx); i.body.visible = true; }
        else { i.body.position.set(m.x, modelGroundY(template, m.x, m.z, ground(m.x, m.z)), m.z); i.body.rotation.set(0, m.r, 0); i.squash.scale.setScalar(h); i.body.visible = true; }
        i.turn.rotation.set(0, m.front, 0);
        if (i.moves && (rigged || i.moves.idle)) { /* its moves, blended by the actor's speed (or idling where it stands), every weight and time from the pose */
          const p = actor && rigged ? star! : { v: 0, d: 0, time: t, beat: null };
          for (const a of Object.values(i.acts)) a.setEffectiveWeight(0);
          const mix = rigMixAt(i.moves, { v: p.v, d: p.d, time: p.time, beat: p.beat ?? null }, h);
          for (const x of mix) { const a = i.acts[x.name]; if (!a) continue; a.setEffectiveWeight(x.w); a.time = x.t; }
          i.mixer.update(0);
          if (i.glow) { const hop = mix.find((x) => x.name === 'Hop' && x.w > 0.3); i.glow.emissiveIntensity = mossGlow(hop ? hop.t : null); } }
        else if (i.mixer) { if (i.moves) { for (const a of Object.values(i.acts)) a.setEffectiveWeight(0); i.first.setEffectiveWeight(1); i.first.setEffectiveTimeScale(1); } i.mixer.setTime(((actor ? star!.time : t) % i.dur + i.dur) % i.dur); } }
    },
    /** the placed model under a ray (index in shot.models), or null */
    pick(ray: any): number | null { const h = ray.intersectObjects(insts.map((i) => i.body), true)[0]; const n = h?.object?.userData?.model; return typeof n === 'number' ? n : null; },
    /** where the selection ring goes for model n (its ground point and radius) */
    ringOf(n: number, ground: (x: number, z: number) => number): { x: number; y: number; z: number; r: number } | null { const i = insts.find((x) => x.body.userData.model === n); if (!i) return null;
      return { x: i.body.position.x, y: i.m.actor ? ground(i.body.position.x, i.body.position.z) : i.body.position.y, z: i.body.position.z, r: Math.max(0.3, frameHeightOf(i.m) * 0.5) }; },
    hasActor: () => insts.some((i) => !!i.m.actor),
    dispose() { gen++; clear(); },
  };
}
export type ModelLayer = ReturnType<typeof createModelLayer>;
