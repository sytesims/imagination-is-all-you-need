/**
 * Drive mode physics (2026-10-27): the live drive runs in a Rapier world (@dimforge/rapier3d-compat, Apache-2.0, WebAssembly; loaded on first
 * use, its own chunk). Only the live play uses it: a take stores the poses that came out (the ActorTrack), and replay / mockup export pose
 * purely from the track, so recordings stay deterministic.
 *  - The car: one dynamic box body, turned only about y and held at the ground's height (no flipping, no tumbling; stable at any speed),
 *    with continuous collision detection so it never tunnels through a wall at speed. Each frame the driver's intent (carDrive in
 *    server/src/shared/previzVehicle.ts: throttle, brake, reverse, steering by speed, handbrake) becomes its velocity; the solver then
 *    stops it at walls, lets it slide along them and bounces it back a little; the speed it really kept is read back.
 *  - The city: every solid box of the open city (CityWorld's box index: buildings, props, trees, parked cars) as fixed cuboids; props you
 *    placed in the shot as turned cuboids; ambient traffic as kinematic bodies moved to carsAt(scene time) every frame (they push you).
 *  - Ponds, the sea and the map's edge are kept by the city's own clamp (water isn't a collider).
 * If WebAssembly can't load, createDrivePhysics rejects and the drive keeps the arcade model (carStep with the box index).
 */
import { carDrive, rideOf, type CarInput, type CarState, type RideSpec } from '../../../../server/src/shared/previzVehicle';
import { openCityWorld, isCityTemplate } from '../../../../server/src/shared/world/openCity';
import { KIT } from '../../../../server/src/shared/world/kitCatalog';
import { carScale } from '../../../../server/src/shared/world/cityGen';
import { PROP_PIECES } from '../../../../server/src/shared/world/propCatalog';
import type { PlacedProp, PrevizTemplateId } from '../../../../server/src/shared/previzTemplates';
import type { PlacedModel } from '../../../../server/src/shared/previzModels';

export interface DrivePhysics {
  /** one frame of driving: intent → physics → the state that came out; sceneT = the scene clock (the traffic's positions) */
  step(s: CarState, input: CarInput, dt: number, sceneT: number): CarState;
  /** put the car here (getting in, teleport, another car), standing still */ place(s: CarState, ride: RideSpec): void;
  dispose(): void;
}
type R = typeof import('@dimforge/rapier3d-compat').default;
let rapier: Promise<R> | null = null;
/** load and start Rapier once per page */
export function loadRapier(): Promise<R> {
  rapier ??= import('@dimforge/rapier3d-compat').then(async (m) => { const R = m.default; await R.init(); return R; }).catch((e) => { rapier = null; throw e; });
  return rapier;
}
const quatY = (h: number) => ({ x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) });
const yawOf = (q: { x: number; y: number; z: number; w: number }) => Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** how much sideways slip a frame keeps (1/s): tyres grip; the handbrake lets the tail slide */
const GRIP = 9, GRIP_HB = 1.6;

/** Build the physics world for a shot (the open city only); rejects when Rapier can't load. */
export async function createDrivePhysics(tpl: PrevizTemplateId, props: PlacedProp[] = [], models: PlacedModel[] = []): Promise<DrivePhysics> {
  if (!isCityTemplate(tpl)) throw new Error('Drive mode physics is for the open city');
  const RAPIER = await loadRapier(); const city = openCityWorld();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 }); /* no gravity: the car is held on the ground (its height is the city's ground) */
  for (const b of city.boxes) { const hx = (b.x1 - b.x0) / 2, hz = (b.z1 - b.z0) / 2, hy = Math.max(0.05, (b.y1 - b.y0) / 2); if (hx <= 0 || hz <= 0) continue;
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2).setFriction(0.15).setRestitution(0.2)); }
  for (const p of props) { const k = PROP_PIECES[p.k] ?? KIT[p.k]; if (!k) continue; const y = city.groundAt(p.x, p.z); const hx = Math.max(0.1, (k.w * p.s) / 2), hz = Math.max(0.1, (k.d * p.s) / 2), hy = Math.max(0.2, (k.h * p.s) / 2);
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(p.x, y + hy, p.z).setRotation(quatY(p.r)).setFriction(0.15).setRestitution(0.2)); }
  /* your 3D models that stand still (a prop, not the actor): a box of their footprint, so the car bumps into them like a prop */
  for (const m of models) { if (m.actor) continue; const y = city.groundAt(m.x, m.z); const hw = Math.max(0.1, (m.h * m.fw) / 2), hy = Math.max(0.1, m.h / 2);
    world.createCollider(RAPIER.ColliderDesc.cuboid(hw, hy, hw).setTranslation(m.x, y + hy, m.z).setRotation(quatY(m.r)).setFriction(0.15).setRestitution(0.2)); }
  /* the ambient traffic: kinematic boxes moved to where carsAt says they are */
  const traffic = city.carsAt(0).map((c) => { const k = KIT[c.k]; const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(c.x, 0.9, c.z).setRotation(quatY(c.heading)));
    const sc = carScale(c.k); world.createCollider(RAPIER.ColliderDesc.cuboid((k?.w ?? 2) / 2 * 0.8 * sc, 0.7, (k?.d ?? 4.5) / 2 * 0.92 * sc).setFriction(0.1).setRestitution(0.3), body); return body; });
  let ride = rideOf(null); let body: any = null; let collider: any = null; let lastYawRate = 0;
  const make = (s: CarState, spec: RideSpec) => {
    if (body) world.removeRigidBody(body); ride = spec; lastYawRate = 0;
    body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(s.pos[0], s.pos[1] + 0.85, s.pos[2]).setRotation(quatY(s.heading))
      .enabledRotations(false, true, false).enabledTranslations(true, false, true).setCcdEnabled(true).setLinearDamping(0).setAngularDamping(2.5).setCanSleep(false));
    collider = world.createCollider(RAPIER.ColliderDesc.cuboid(spec.width / 2, 0.6, spec.length / 2).setDensity(140).setFriction(0.2).setRestitution(0.22), body); void collider; };
  make({ pos: [0, 0, 0], heading: 0, speed: 0, steer: 0, d: 0 }, ride);
  return {
    place(s, spec) { make(s, spec); },
    step(s, input, dt, sceneT) {
      const d = Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0)); if (d <= 0 || !body) return s;
      /* the body follows the state if something moved it outside (teleport, a lost frame) */
      const bt = body.translation(); if (Math.hypot(bt.x - s.pos[0], bt.z - s.pos[2]) > 1.5) make(s, ride);
      const w = carDrive(s, input, d, ride); const h0 = yawOf(body.rotation()); const fx = Math.sin(h0), fz = Math.cos(h0);
      /* the intent becomes the velocity: forward speed from carDrive, sideways slip mostly gripped away, the yaw rate plus whatever a hit spun in */
      const lv = body.linvel(); const lat = lv.x * fz - lv.z * fx; const keep = Math.exp(-d * (input.handbrake ? GRIP_HB : GRIP)) * lat;
      body.setLinvel({ x: fx * w.speed + fz * keep, y: 0, z: fz * w.speed - fx * keep }, true);
      const av = body.angvel().y; const spin = (av - lastYawRate) * Math.exp(-d * 5); lastYawRate = w.yawRate; body.setAngvel({ x: 0, y: w.yawRate + spin, z: 0 }, true);
      /* the traffic where the scene clock has it (one step ahead, so the solver sees them move) */
      /* a jump of the scene clock (a recording starts from the shot's first frame) moves the traffic in one go, not through you */
      const cars = city.carsAt(sceneT + d); for (let i = 0; i < traffic.length && i < cars.length; i++) { const c = cars[i]; const b = traffic[i]; const p = b.translation();
        if (Math.hypot(p.x - c.x, p.z - c.z) > 4) { b.setTranslation({ x: c.x, y: 0.9, z: c.z }, true); b.setRotation(quatY(c.heading), true); }
        b.setNextKinematicTranslation({ x: c.x, y: 0.9, z: c.z }); b.setNextKinematicRotation(quatY(c.heading)); }
      /* sub-steps keep contacts firm at 70 km/h on a slow frame */
      const n = Math.max(1, Math.ceil(d / (1 / 120))); world.timestep = d / n; for (let i = 0; i < n; i++) world.step();
      const t = body.translation(); const h1 = s.heading + wrap(yawOf(body.rotation()) - wrap(s.heading));
      /* water, ponds and the map's edge: the city's clamp on the car's centre */
      let x = t.x, z = t.z; const q = city.clampActor(x, z, 0.3); if (Math.hypot(q[0] - x, q[2] - z) > 1e-3) { x = q[0]; z = q[2]; body.setTranslation({ x, y: t.y, z }, true); body.setLinvel({ x: 0, y: 0, z: 0 }, true); }
      const v1 = body.linvel(); const speed = v1.x * Math.sin(h1) + v1.z * Math.cos(h1); const y = city.groundAt(x, z);
      if (Math.abs(t.y - (y + 0.85)) > 1e-3) body.setTranslation({ x, y: y + 0.85, z }, true); /* up the hills and onto the pier: the body rides at the ground's height */
      const moved = Math.hypot(x - s.pos[0], z - s.pos[2]);
      return { pos: [x, y, z], heading: h1, speed: Math.max(-6, Math.min(ride.top, speed)), steer: w.steer, d: s.d + moved };
    },
    dispose() { try { world.free(); } catch { /* already gone */ } body = null; },
  };
}
