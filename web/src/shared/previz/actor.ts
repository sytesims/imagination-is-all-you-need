/**
 * Play the actor (2026-10-26): the mannequin the engine draws for the person (shared/previzActor.ts has the maths). Quaternius' Universal
 * Animation Library mannequin (CC0), trimmed to the clips we use and meshopt-compressed (web/public/models/mannequin, about 0.2 MB; how it was
 * made: scripts/assets/optimize-mannequin.mjs). Loaded once per page, cloned per engine.
 * Deterministic like the rest of the scene: pose(p) sets every clip's time and weight from the pose alone (no clock, no mixer.update(dt)):
 * idle / walk / jog / sprint blend by speed, their cycles run on the distance walked (the feet keep step with the ground), and an acting beat
 * fades in over the top. Wave and point are drawn by hand on the right arm (the library has no clips for them).
 * If the file can't load, the engine keeps the old capsule figure.
 */
import { STRIDE, beatSeconds, type ActorPose } from '../../../../server/src/shared/previzActor';
import { BRAND, PAL, shade } from './theme';

type T3 = typeof import('three');
export interface ActorRig { root: any; pose(p: ActorPose): void; tint(hex: string): void; dispose(): void }
export const MANNEQUIN_URL = '/models/mannequin/mannequin.glb';
/** The mannequin is 1.83 m; the scene's people are about 1.75 m. */
const SCALE = 0.96;
const CLIP = { idle: 'Idle_Loop', walk: 'Walk_Loop', jog: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop', dance: 'Dance_Loop', sitIn: 'Sitting_Enter', sit: 'Sitting_Idle_Loop', sitOut: 'Sitting_Exit', jumpUp: 'Jump_Start', jumpDown: 'Jump_Land' } as const;

let gltf: Promise<{ scene: any; animations: any[] } | null> | null = null;
function loadOnce(): Promise<{ scene: any; animations: any[] } | null> {
  gltf ??= (async () => {
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')]);
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    const g = await loader.loadAsync(MANNEQUIN_URL); return { scene: g.scene, animations: g.animations };
  })().catch(() => { gltf = null; return null; });
  return gltf;
}
const smooth = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const fract = (x: number) => x - Math.floor(x);

/** Load (once) and make a rig for one engine; null when the file can't be loaded (the capsule figure stays). */
export async function createActorRig(T: T3): Promise<ActorRig | null> {
  const src = await loadOnce(); if (!src) return null;
  const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
  const model = clone(src.scene); const root = new T.Group(); root.add(model); model.scale.setScalar(SCALE); root.visible = false;
  /* the brand mannequin (previz/theme.ts): matte orange, its joints and shoes a deeper orange of the same colour */
  const body = new T.MeshStandardMaterial({ color: BRAND.orange, roughness: 0.62, metalness: 0 }); const joints = new T.MeshStandardMaterial({ color: shade(BRAND.orange, 0.7), roughness: 0.7, metalness: 0 });
  model.traverse((o: any) => { if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.material = /joint/i.test(o.material?.name ?? '') ? joints : body; });
  const mixer = new T.AnimationMixer(model); const acts: Record<string, any> = {}; const dur: Record<string, number> = {};
  for (const c of src.animations) { const a = mixer.clipAction(c); a.play(); a.setEffectiveWeight(0); a.setEffectiveTimeScale(0); acts[c.name] = a; dur[c.name] = c.duration; }
  const bone = (n: string) => model.getObjectByName(n) as any; const arm = { up: bone('upperarm_r'), low: bone('lowerarm_r'), hand: bone('hand_r'), clav: bone('clavicle_r') };
  /* a seat that appears under the figure while it sits (a plain block; the Render turns it into a bench or a chair) */
  const seat = new T.Mesh(new T.BoxGeometry(0.46, 0.44, 0.42), new T.MeshStandardMaterial({ color: PAL.warmGrey, roughness: 0.9 })); seat.position.set(0, 0.22, -0.18); seat.castShadow = true; seat.receiveShadow = true; seat.visible = false; root.add(seat);
  let fadeNow = 1;
  const set = (name: string, w: number, t: number) => { const a = acts[name]; if (!a) return; a.setEffectiveWeight(w); a.time = Math.max(0, Math.min(dur[name] - 1e-4, t)); };
  const v0 = new T.Vector3(), v1 = new T.Vector3(), v2 = new T.Vector3(), qa = new T.Quaternion(), qp = new T.Quaternion(), qr = new T.Quaternion();
  /** turn bone b (whose child c sets its direction) towards dir (the person's frame), blended by k */
  const aim = (b: any, c: any, dir: [number, number, number], k: number) => {
    b.getWorldPosition(v0); c.getWorldPosition(v1); v1.sub(v0).normalize(); v2.set(dir[0], dir[1], dir[2]).normalize().applyQuaternion(root.getWorldQuaternion(qp));
    qr.setFromUnitVectors(v1, v2); b.getWorldQuaternion(qa); qa.premultiply(qr); b.parent.getWorldQuaternion(qp).invert(); qa.premultiply(qp);
    b.quaternion.slerp(qa, Math.min(1, k)); b.updateMatrixWorld(true); };
  return {
    root,
    tint(hex) { body.color.set(hex); joints.color.set(shade(hex, 0.7)); },
    pose(p) {
      /* Drive mode: fading into the car as they get in, out of it as they get out */
      const f = Math.max(0, Math.min(1, p.fade ?? 1)); if (f !== fadeNow) { fadeNow = f; const see = f < 0.999;
        for (const m of [body, joints]) { m.transparent = see; m.opacity = f; m.depthWrite = !see; m.needsUpdate = true; }
        model.traverse((o: any) => { if (o.isMesh) o.castShadow = f > 0.5; }); }
      root.visible = f > 0.01; root.position.set(p.pos[0], p.pos[1], p.pos[2]); root.rotation.y = p.heading;
      for (const a of Object.values(acts)) a.setEffectiveWeight(0); /* every clip starts from nothing: the pose depends on p alone */
      /* moving: idle → walk → jog → sprint by speed; each cycle runs on the distance walked */
      const mv = smooth(0.05, 0.7, p.v), run = smooth(1.7, 3.1, p.v), spr = smooth(4.3, 5.6, p.v);
      const base: [string, number, number][] = [[CLIP.idle, 1 - mv, (p.time % dur[CLIP.idle])], [CLIP.walk, mv * (1 - run), fract(p.d / STRIDE.walk) * dur[CLIP.walk]],
        [CLIP.jog, mv * run * (1 - spr), fract(p.d / STRIDE.jog) * dur[CLIP.jog]], [CLIP.sprint, mv * run * spr, fract(p.d / STRIDE.sprint) * dur[CLIP.sprint]]];
      const b = p.beat; const len = b ? beatSeconds(b.kind) : 0; const wb = b ? smooth(0, 0.22, b.local) * smooth(0, 0.3, len - b.local) : 0;
      const hand = b && b.kind === 'wave' ? wb : 0; const pointW = b && b.kind === 'point' ? wb : 0; /* drawn on top of whatever the legs do */
      const over = b && b.kind !== 'wave' && b.kind !== 'point' ? wb : 0; let lift = 0; seat.visible = false;
      for (const [n, ww, t] of base) set(n, ww * (1 - over), t);
      if (b && over > 0) {
        if (b.kind === 'dance') set(CLIP.dance, over, b.local % dur[CLIP.dance]);
        else if (b.kind === 'sit') { const din = dur[CLIP.sitIn], dout = dur[CLIP.sitOut]; const L = b.local;
          if (L < din) set(CLIP.sitIn, over, L); else if (L > len - dout) set(CLIP.sitOut, over, L - (len - dout)); else set(CLIP.sit, over, (L - din) % dur[CLIP.sit]);
          const s = Math.min(1, L / 0.3, Math.max(0, (len - L) / 0.3)); seat.visible = s > 0.02; seat.scale.setScalar(Math.max(0.02, s)); }
        else if (b.kind === 'jump') { const half = len / 2; if (b.local < half) set(CLIP.jumpUp, over, (b.local / half) * dur[CLIP.jumpUp]); else set(CLIP.jumpDown, over, ((b.local - half) / half) * dur[CLIP.jumpDown]);
          const a = 0.38 * len, z = 0.62 * len; if (b.local > a && b.local < z) { const k = (b.local - a) / (z - a); lift = 0.42 * 4 * k * (1 - k); } }
      }
      mixer.update(0); model.position.y = lift;
      /* wave and point are drawn by hand on the right arm, on top of whatever the body does: each bone is turned so it points along a
         direction given in the person's own frame (+z forward, +y up, −x their right), so no bone axes are guessed */
      if ((hand > 0 || pointW > 0) && arm.up && arm.low && arm.hand) { root.updateMatrixWorld(true);
        if (hand > 0) { const sw = Math.sin(b!.local * Math.PI * 2 * 1.5); aim(arm.up, arm.low, [-0.62, 0.74, 0.22], hand); aim(arm.low, arm.hand, [-0.18 - 0.42 * sw, 1, 0.3], hand); }
        else { aim(arm.up, arm.low, [-0.16, 0.12, 1], pointW); aim(arm.low, arm.hand, [-0.1, 0.16, 1], pointW); } }
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(model); body.dispose(); joints.dispose(); seat.geometry.dispose(); (seat.material as any).dispose(); root.removeFromParent(); },
  };
}
/** Start loading the file early (the engine calls this when it starts), so the first take never waits. */
export const preloadMannequin = () => { void loadOnce(); };
