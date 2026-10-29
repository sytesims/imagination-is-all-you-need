/**
 * Our parkour clips (2026-10-26): load the hand-made moves (web/public/models/mannequin/parkour.glb, list in parkourClips.ts) and play them on
 * the mannequin (actor.ts loads it). The clips use the mannequin's own bone names, so they drive any clone of it.
 * Deterministic like the actor: pose(id, t) sets the clip's time from t alone (no clock, no mixer.update(dt)).
 * Root motion: the clip moves the "root" bone (the point on the ground under the person). By default it stays in the clip (the model walks
 * off its group); rootMotion: 'extract' plays it in place and hands back the offset, so the game can move the person itself (and check the
 * obstacle against needs / props first). Offsets are in the person's frame: f forward, u up, l to their left (glTF: +z, +y, +x).
 * How the clips were made: scripts/assets/parkour/README.md.
 */
import { PARKOUR_CLIPS, PARKOUR_URL, type ParkourClip } from './parkourClips';

type T3 = typeof import('three');
export type Vec3 = [number, number, number];
export interface ParkourSet { clips: Record<string, any>; info: Record<string, ParkourClip> }
export interface ParkourPlayer {
  /** pose the model at time t (seconds) of a clip, at full weight (blend: 0..1 to lay it over what the model already shows); returns the root offset */
  pose(id: string, t: number, blend?: number): Vec3;
  /** the root offset at time t without posing (for moving the person in step) */
  rootAt(id: string, t: number): Vec3;
  stop(): void;
  dispose(): void;
}

let once: Promise<ParkourSet | null> | null = null;
/** load the moves once per page; null when the file can't be loaded */
export function loadParkour(url = PARKOUR_URL): Promise<ParkourSet | null> {
  once ??= (async () => {
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')]);
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    const g = await loader.loadAsync(url);
    const clips: Record<string, any> = {}; for (const c of g.animations) clips[c.name] = c;
    return { clips, info: Object.fromEntries(PARKOUR_CLIPS.map((c) => [c.id, c])) };
  })().catch(() => { once = null; return null; });
  return once;
}

/**
 * Load any clip file made for this skeleton (e.g. a text-to-motion clip retargeted by the research script, or a clip a user brings), with a
 * plain clip list made from the file itself: length from the clip, root motion from its root track, no obstacle, no key. Not cached.
 */
export async function loadClipFile(url: string, fps = 30): Promise<ParkourSet | null> {
  try {
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')]);
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    const g = await loader.loadAsync(url); if (!g.animations?.length) return null;
    const clips: Record<string, any> = {}; const info: Record<string, ParkourClip> = {};
    for (const c of g.animations) { clips[c.name] = c; info[c.name] = clipInfo(c, fps); }
    return { clips, info };
  } catch { return null; }
}
/** a list entry for a clip that has none: its name made readable, length, root motion */
export function clipInfo(c: { name: string; duration: number; tracks: any[] }, fps = 30): ParkourClip {
  const keys = rootKeys(c); const end = keys.length ? keys[keys.length - 1] : [0, 0, 0, 0]; const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const label = c.name.replace(/^\d+[_-]/, '').replace(/^a_person_/, '').replace(/[_-]+/g, ' ').trim();
  return { id: c.name, label: label ? label[0].toUpperCase() + label.slice(1) : c.name, key: '', needs: { obstacle: null }, contacts: {},
    frames: Math.round(c.duration * fps), fps, seconds: r3(c.duration), move: [r3(end[1]), r3(end[2]), r3(end[3])], props: [] };
}

const ROOT_TRACK = /(^|\.|\/)root\.position$/;
/** the root track's sampled values: [time, f, u, l] per key */
export function rootKeys(clip: any): number[][] {
  const tr = clip.tracks.find((t: any) => ROOT_TRACK.test(t.name)); if (!tr) return [];
  const out: number[][] = []; for (let i = 0; i < tr.times.length; i++) out.push([tr.times[i], tr.values[i * 3 + 2], tr.values[i * 3 + 1], tr.values[i * 3]]);
  return out;
}
/** linear sample of rootKeys at t (clamped to the clip) */
export function sampleRoot(keys: number[][], t: number): Vec3 {
  if (!keys.length) return [0, 0, 0];
  if (t <= keys[0][0]) return [keys[0][1], keys[0][2], keys[0][3]];
  const n = keys.length - 1; if (t >= keys[n][0]) return [keys[n][1], keys[n][2], keys[n][3]];
  let lo = 0, hi = n; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (keys[m][0] <= t) lo = m; else hi = m; }
  const a = keys[lo], b = keys[hi], k = (t - a[0]) / (b[0] - a[0] || 1);
  return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
}

/** a player for one model (a clone of the mannequin scene). rootMotion 'keep' (default) or 'extract' (in place; pose() returns the offset) */
export function createParkourPlayer(T: T3, model: any, set: ParkourSet, o: { rootMotion?: 'keep' | 'extract' } = {}): ParkourPlayer {
  const extract = o.rootMotion === 'extract';
  const mixer = new T.AnimationMixer(model); const acts: Record<string, any> = {}; const roots: Record<string, number[][]> = {};
  for (const [id, c] of Object.entries(set.clips)) {
    roots[id] = rootKeys(c);
    const clip = extract ? new (c.constructor as any)(c.name, c.duration, c.tracks.filter((t: any) => !ROOT_TRACK.test(t.name))) : c;
    const a = mixer.clipAction(clip); a.play(); a.setEffectiveWeight(0); a.setEffectiveTimeScale(0); acts[id] = a;
  }
  const rootBone = model.getObjectByName('root');
  return {
    pose(id, t, blend = 1) {
      for (const a of Object.values(acts)) a.setEffectiveWeight(0);
      const a = acts[id]; if (!a) return [0, 0, 0];
      const d = a.getClip().duration; a.time = Math.max(0, Math.min(d - 1e-4, t)); a.setEffectiveWeight(Math.max(0, Math.min(1, blend)));
      mixer.update(0);
      if (extract && rootBone) rootBone.position.set(0, 0, 0);
      return sampleRoot(roots[id], t);
    },
    rootAt(id, t) { return sampleRoot(roots[id] ?? [], t); },
    stop() { for (const a of Object.values(acts)) a.setEffectiveWeight(0); mixer.update(0); },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(model); },
  };
}

/** a clip that fits the obstacle ahead (kind and height), or null: a helper for the game step that comes later */
export function pickParkour(kind: string, height: number, clips: ParkourClip[] = PARKOUR_CLIPS): ParkourClip | null {
  return clips.find((c) => {
    const n = c.needs as { obstacle?: string | null; height?: [number, number] };
    return n.obstacle === kind && (!n.height || (height >= n.height[0] && height <= n.height[1]));
  }) ?? null;
}
