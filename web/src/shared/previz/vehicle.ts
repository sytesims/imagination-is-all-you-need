/**
 * Drive mode (2026-10-27): the car the engine draws for the person's ride (server/src/shared/previzVehicle.ts has the maths, the ride lives on
 * the take's ActorTrack). The car is a Kenney Car Kit piece from the open city's kit file (CC0, already shipped in
 * web/public/models/open-city), loaded through previz/kits.ts like any other piece, so it is graded into the same palette as the parked cars.
 * Deterministic like the rest of the scene: pose(car, time) sets everything from the pose alone: the wheels spin with the distance driven,
 * the front wheels turn with the steering, the body leans out of turns, pitches with the acceleration and shivers a little at idle; at night (and golden hour) the head and
 * tail lights glow. Kenney's cars keep their wheels as separate nodes, so they can spin; a car without them still drives, just with still wheels.
 */
import { loadKitFile, piece } from './kits';
import { isTaxi, livery } from './theme';
import { carScale } from '../../../../server/src/shared/world/cityGen';
import { rideOf } from '../../../../server/src/shared/previzVehicle';
import { isCityTemplate } from '../../../../server/src/shared/world/openCity';
import { KIT } from '../../../../server/src/shared/world/kitCatalog';
import type { RidePose } from '../../../../server/src/shared/previzActor';
import type { PlanShot } from '../../../../server/src/shared/previzTemplates';

type T3 = typeof import('three');
export interface VehicleRig {
  /** draw the car at this pose (null hides it); time = scene seconds (idle shiver); lights: head and tail lights on */
  pose(c: RidePose | null, time: number, lights: boolean): void;
  /** resolves once the kit file the cars live in has loaded (or failed), for shots that may show a car */ ready(s: PlanShot | null): Promise<void>;
  dispose(): void;
}

export function createVehicleRig(T: T3, scene: any, redraw: () => void): VehicleRig {
  const root = new T.Group(); root.visible = false; scene.add(root);
  let kit = ''; let model: any = null; let body: any = null; let bodyY = 0; let wheels: { o: any; front: boolean }[] = []; let loading: Promise<void> | null = null; let alive = true;
  const headM = new T.MeshBasicMaterial({ color: 0xfff1cf, fog: false }); const tailM = new T.MeshBasicMaterial({ color: 0xff2a1e }); const lightG = new T.BoxGeometry(0.32, 0.14, 0.06);
  const lamps: any[] = []; const lampG = new T.Group(); root.add(lampG);
  for (const [x, front] of [[0.58, true], [-0.58, true], [0.6, false], [-0.6, false]] as [number, boolean][]) { const m = new T.Mesh(lightG, front ? headM : tailM); m.userData.front = front; m.userData.x = x; m.userData.noCast = true; m.castShadow = false; lampG.add(m); lamps.push(m); }
  const load = () => { loading ??= loadKitFile(T, 'city').then(() => { if (alive) redraw(); }, () => undefined); return loading; };
  /** swap in the piece for this car (once its file is there) and find its body and wheels */
  const build = (k: string) => {
    if (model) { root.remove(model); model = null; } body = null; wheels = []; kit = k; const o = piece(k); if (!o) { kit = ''; return; }
    model = o; root.add(o); o.traverse((m: any) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; if (isTaxi(k)) m.material = livery(T, m.material); } });
    root.scale.setScalar(carScale(k)); /* the same scale as every car in the city (the lamps scale with it) */
    o.traverse((n: any) => { const name = String(n.name ?? '');
      if (/^body/.test(name) && !body) { body = n; bodyY = n.position.y; }
      else if (/^wheel/.test(name)) { n.rotation.order = 'YXZ'; wheels.push({ o: n, front: /front/.test(name) }); } });
    /* the lamps sit just proud of the body's own front and back (the kit's measured footprint) */
    const half = (KIT[k]?.d ?? rideOf(k).length) / 2; const cz = KIT[k]?.cz ?? 0; for (const m of lamps) m.position.set(m.userData.x, 0.78, cz + (m.userData.front ? 1 : -1) * (half + 0.02)); };
  return {
    pose(c, time, lights) {
      if (!c) { root.visible = false; return; }
      if (kit !== c.k) { load(); build(c.k); } if (!model) { root.visible = false; return; }
      root.visible = true; root.position.set(c.pos[0], c.pos[1], c.pos[2]); root.rotation.y = c.heading;
      const spec = rideOf(c.k); const sp = Math.min(1, Math.abs(c.v) / spec.top);
      /* wheels: spin with the distance driven (top moves forward), the front pair turns with the steering (positive = right) */
      const spin = c.d / spec.wheel; for (const w of wheels) { w.o.rotation.x = spin; w.o.rotation.y = w.front ? -c.steer : 0; }
      /* body: leans out of the turn with speed, a soft shiver when idling, a touch of squat when quick */
      if (body) { const idle = 1 - Math.min(1, Math.abs(c.v) / 1.5); body.rotation.z = -c.steer * sp * 0.09 + Math.sin(time * 43) * 0.0025 * idle * (c.inside ? 1 : 0);
        body.rotation.x = Math.max(-0.05, Math.min(0.07, -(c.acc ?? 0) * 0.0035)); /* the nose dips under braking (and a hit), lifts a touch when it pulls away */ body.position.y = bodyY + Math.sin(time * 37) * 0.004 * idle * (c.inside ? 1 : 0); }
      lampG.visible = lights;
    },
    ready(s) { return s && isCityTemplate(s.template) ? load() : Promise.resolve(); },
    dispose() { alive = false; root.removeFromParent(); headM.dispose(); tailM.dispose(); lightG.dispose(); },
  };
}
