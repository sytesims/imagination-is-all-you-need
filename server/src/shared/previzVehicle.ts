/**
 * Direct a Shot, Drive mode (2026-10-27): the car half of "Play the actor" in the open city. Pure and isomorphic, like previzActor.ts (no
 * three.js, no DOM), so the live player, the recorder, the Render prompt and the tests read the same numbers.
 *  - RIDES: the cars you can drive (Kenney Car Kit pieces already in the open city's kit file, CC0), with the size the maths uses.
 *  - carStep: one frame of arcade driving: throttle, brake (and reverse once stopped), steering that tightens at low speed and
 *    softens at high speed, drag and rolling resistance, a handbrake that bites hard and lets the tail swing, and building collisions.
 *  - carClamp: keeps the car's footprint (three circles along its length) out of every solid box of the city (CityWorld's box index),
 *    out of ponds and deep water.
 *  - chaseRig / chaseCamera: the spring-arm chase camera: it swings in behind the car, the mouse / right stick orbit it and it eases back,
 *    the arm and the lens open up with speed.
 *  - carSpot / exitSpot / nearCar: where a car can stand beside the person, where the person steps out, and whether they can reach it.
 * The car is stored on the person's ActorTrack (previzActor.ts: track.ride), so recording, replay and Perform-then-shoot work unchanged.
 */
import { openCityWorld, isCityTemplate } from './world/openCity.js';
import { carScale } from './world/cityGen.js';
import { clampCamera, groundAt, lookDir, PITCH_MAX, type CameraPose, type PrevizTemplateId, type Vec3 } from './previzTemplates.js';

/** A car you can drive: kit id, names for the HUD and the Render prompt, its body size (m; length = the kit's measured footprint), the wheel radius and the top speed (m/s). */
export interface RideSpec { id: string; label: string; noun: string; width: number; length: number; wheelbase: number; wheel: number; top: number }
/* the kit's sizes, then scaled with the car (carScale: every car in the city is drawn at that scale, so yours matches a person and the traffic) */
const ride = (r: RideSpec): RideSpec => { const s = carScale(r.id); return { ...r, width: r.width * s, length: r.length * s, wheelbase: r.wheelbase * s, wheel: r.wheel * s }; };
export const RIDES: RideSpec[] = [
  { id: 'kv.taxi', label: 'Taxi', noun: 'a taxi', width: 2.05, length: 4.67, wheelbase: 2.6, wheel: 0.51, top: 19 },
  { id: 'kv.sedan', label: 'Sedan', noun: 'a sedan', width: 2.05, length: 4.33, wheelbase: 2.6, wheel: 0.51, top: 19 },
  { id: 'kv.hatchback-sports', label: 'Sports car', noun: 'a sports car', width: 2, length: 4.85, wheelbase: 2.75, wheel: 0.51, top: 20 },
  { id: 'kv.police', label: 'Police car', noun: 'a police car', width: 2.05, length: 5.27, wheelbase: 2.9, wheel: 0.51, top: 20 },
  { id: 'kv.suv', label: 'SUV', noun: 'an SUV', width: 2.1, length: 4.59, wheelbase: 2.7, wheel: 0.55, top: 17 },
  { id: 'kv.van', label: 'Van', noun: 'a van', width: 2.1, length: 4.68, wheelbase: 2.8, wheel: 0.55, top: 15 },
].map(ride);
export const RIDE_DEFAULT = 'kv.taxi';
export const rideOf = (id: string | null | undefined): RideSpec => RIDES.find((r) => r.id === id) ?? RIDES[0];
export const isRide = (id: unknown): id is string => typeof id === 'string' && RIDES.some((r) => r.id === id);
/** Drive mode is offered where there are streets to drive: the open city (all three lights). */
export const driveAllowed = (tpl: PrevizTemplateId) => isCityTemplate(tpl);

/** One moment of a car: where it stands (on the ground), the way it faces (radians, 0 faces +z, positive turns left, like the person),
 *  its speed along that heading (m/s, negative in reverse), the front wheels' angle (radians, positive turns right) and the distance driven. */
export interface CarState { pos: Vec3; heading: number; speed: number; steer: number; d: number }
/** throttle and brake 0…1 (keys give 0 or 1, triggers anything between); steer −1 (left) … 1 (right); handbrake held. */
export interface CarInput { throttle: number; brake: number; steer: number; handbrake: boolean }
export const CAR = { accel: 9, brake: 16, reverse: 6, revAccel: 5, drag: 0.32, roll: 0.9, handbrake: 11, steerMax: 0.62, steerRate: 4.5, bounce: 0.25 } as const;
const fin = (x: number, d = 0) => (Number.isFinite(x) ? x : d);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const wrap = (a: number) => { let x = a; while (x > Math.PI) x -= Math.PI * 2; while (x < -Math.PI) x += Math.PI * 2; return x; };
/** the most the front wheels turn at a speed: full lock while parking, a third of it at top speed (no twitchy steering on the avenue) */
export const steerLimit = (speed: number) => CAR.steerMax / (1 + Math.abs(speed) / 8);
const groundOf = (tpl: PrevizTemplateId, x: number, z: number) => (isCityTemplate(tpl) ? openCityWorld().groundAt(x, z) : groundAt(tpl, x, z));

/** Keep a car (centre x, z, facing heading) out of every solid box, the ponds and the sea: its footprint is three circles along its length.
 *  Returns where it stands and how far it was pushed (push = 0: nothing in the way). Outside the city only the ground is kept. */
export function carClamp(tpl: PrevizTemplateId, x: number, z: number, heading: number, ride: RideSpec = rideOf(null)): { pos: Vec3; push: [number, number] } {
  const x0 = fin(x), z0 = fin(z); if (!isCityTemplate(tpl)) return { pos: [x0, groundOf(tpl, x0, z0), z0], push: [0, 0] };
  const w = openCityWorld(); const r = ride.width / 2 * 0.92; const half = Math.max(0, ride.length / 2 - r); const fx = Math.sin(heading), fz = Math.cos(heading);
  let cx = x0, cz = z0;
  for (let it = 0; it < 6; it++) { let mx = 0, mz = 0;
    for (const o of [-half, 0, half]) { const px = cx + fx * o, pz = cz + fz * o; const q = w.clampActor(px, pz, r); const dx = q[0] - px, dz = q[2] - pz;
      if (Math.abs(dx) > Math.abs(mx)) mx = dx; if (Math.abs(dz) > Math.abs(mz)) mz = dz; }
    if (Math.abs(mx) < 1e-6 && Math.abs(mz) < 1e-6) break; cx += mx; cz += mz; }
  return { pos: [cx, w.groundAt(cx, cz), cz], push: [cx - x0, cz - z0] };
}

/** One frame of arcade driving. Pure: the same state, input and dt give the same next state. dt is capped at 0.1 s (a slow frame slows the
 *  car rather than tunnelling it through a wall). A hit takes away the speed going into the wall (with a small bounce) and keeps the slide along it. */
export function carStep(s: CarState, input: CarInput, dt: number, tpl: PrevizTemplateId, ride: RideSpec = rideOf(null)): CarState {
  const d = clamp(fin(dt), 0, 0.1); const w = carDrive(s, input, d, ride); let v = w.speed; const steer = w.steer; const heading = s.heading + w.yawRate * d;
  const hm = (s.heading + heading) / 2; const fx = Math.sin(hm), fz = Math.cos(hm);
  const c = carClamp(tpl, s.pos[0] + fx * v * d, s.pos[2] + fz * v * d, heading, ride);
  const pm = Math.hypot(c.push[0], c.push[1]);
  if (pm > 1e-4) { const nx = c.push[0] / pm, nz = c.push[1] / pm; const vx = fx * v, vz = fz * v; const into = vx * nx + vz * nz;
    if (into < 0) { const k = (1 + CAR.bounce) * into; const ax = vx - nx * k, az = vz - nz * k; v = clamp((ax * Math.sin(heading) + az * Math.cos(heading)), -CAR.reverse, ride.top) * 0.9; } }
  const moved = Math.hypot(c.pos[0] - s.pos[0], c.pos[2] - s.pos[2]);
  return { pos: c.pos, heading, speed: v, steer, d: fin(s.d) + moved };
}
/** The driver's intent for one frame, before anything is in the way: the new speed, the front wheels' angle and the yaw rate (rad/s, positive
 *  = turning left). carStep moves the car with it and the box index; the live drive feeds it to the physics world (previz/drivePhysics.ts). */
export function carDrive(s: { speed: number; steer: number }, input: CarInput, dt: number, ride: RideSpec = rideOf(null)): { speed: number; steer: number; yawRate: number } {
  const d = clamp(fin(dt), 0, 0.1); const thr = clamp(fin(input.throttle), 0, 1), brk = clamp(fin(input.brake), 0, 1); const st = clamp(fin(input.steer), -1, 1);
  let v = fin(s.speed);
  /* throttle pulls forward (less as the car nears its top speed); in reverse it brakes first */
  if (thr > 0) v += v < -0.3 ? thr * CAR.brake * d : thr * CAR.accel * Math.max(0, 1 - v / ride.top) * d;
  /* brake slows a forward car; once (nearly) stopped it reverses */
  if (brk > 0) { if (v > 0.3) v = Math.max(0, v - brk * CAR.brake * d); else v = Math.max(-CAR.reverse, v - brk * CAR.revAccel * d * Math.max(0, 1 + v / CAR.reverse)); }
  /* drag and rolling resistance when coasting (never past 0) */
  if (thr === 0 && brk === 0) { const loss = (Math.abs(v) * CAR.drag + CAR.roll) * d; v = Math.abs(v) <= loss ? 0 : v - Math.sign(v) * loss; }
  if (input.handbrake) { const loss = CAR.handbrake * d; v = Math.abs(v) <= loss ? 0 : v - Math.sign(v) * loss; }
  v = clamp(v, -CAR.reverse, ride.top);
  /* the wheels turn towards the stick (limited by speed), and come back to centre as fast */
  const lim = steerLimit(v) * (input.handbrake ? 1.35 : 1); const want = st * lim; const ds = CAR.steerRate * d; const steer = clamp(fin(s.steer) + clamp(want - fin(s.steer), -ds, ds), -lim, lim);
  /* bicycle model: yaw rate = v · tan(steer) / wheelbase (positive steer = right = heading goes down) */
  return { speed: v, steer, yawRate: -(v * Math.tan(steer) / ride.wheelbase) };
}

/** Is the person at p within reach of the car (metres from its body)? */
export function carDistance(p: Vec3, car: { pos: Vec3; heading: number }, ride: RideSpec = rideOf(null)): number {
  const dx = p[0] - car.pos[0], dz = p[2] - car.pos[2]; const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const lz = dx * fx + dz * fz, lx = dx * fz - dz * fx; const ox = Math.max(0, Math.abs(lx) - ride.width / 2), oz = Math.max(0, Math.abs(lz) - ride.length / 2);
  return Math.hypot(ox, oz);
}
export const CAR_REACH = 2.2;
export const nearCar = (p: Vec3, car: { pos: Vec3; heading: number } | null, ride: RideSpec = rideOf(null)) => !!car && carDistance(p, car, ride) <= CAR_REACH;

/** Where a car can stand beside a person (at x, z, facing heading): to their right, left, ahead or behind, the first spot with nothing in the
 *  way (or the one that needed the smallest push), never on top of the person. The car faces the way the person does. */
export function carSpot(tpl: PrevizTemplateId, at: Vec3, heading: number, ride: RideSpec = rideOf(null)): { pos: Vec3; heading: number } {
  const fx = Math.sin(heading), fz = Math.cos(heading); const lx = Math.cos(heading), lz = -Math.sin(heading); const side = ride.width / 2 + 1.1, ahead = ride.length / 2 + 1.2;
  const tries: [number, number][] = [[-side, 0], [side, 0], [0, ahead], [0, -ahead], [-side - 2, 0], [side + 2, 0], [-side, ahead], [side, ahead], [-side, -ahead], [side, -ahead], [0, ahead + 3], [0, -ahead - 3]];
  let best: { pos: Vec3; cost: number } | null = null;
  for (const [l, f] of tries) { const x = at[0] + lx * l + fx * f, z = at[2] + lz * l + fz * f; const c = carClamp(tpl, x, z, heading, ride);
    const gap = carDistance(at, { pos: c.pos, heading }, ride); const cost = Math.hypot(c.push[0], c.push[1]) + (gap < 0.4 ? 50 : 0);
    if (cost < 0.05) return { pos: c.pos, heading }; if (!best || cost < best.cost) best = { pos: c.pos, cost }; }
  return { pos: best!.pos, heading };
}
/** Where the person steps out: beside the driver's door (the car's left), else the other side, else behind; kept on walkable ground. */
export function exitSpot(clampPerson: (x: number, z: number) => Vec3, car: { pos: Vec3; heading: number }, ride: RideSpec = rideOf(null)): Vec3 {
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading); const lx = Math.cos(car.heading), lz = -Math.sin(car.heading); const side = ride.width / 2 + 0.55;
  const tries: [number, number][] = [[side, 0.4], [-side, 0.4], [0, -ride.length / 2 - 0.6], [0, ride.length / 2 + 0.6]]; let best: Vec3 | null = null; let bestErr = Infinity;
  for (const [l, f] of tries) { const x = car.pos[0] + lx * l + fx * f, z = car.pos[2] + lz * l + fz * f; const p = clampPerson(x, z); const err = Math.hypot(p[0] - x, p[2] - z);
    if (err < 0.05) return p; if (err < bestErr) { bestErr = err; best = p; } }
  return best!;
}

// ---------- the chase camera ----------
/** The spring arm: yaw / pitch it looks along (yaw 0 looks towards −z), how far behind, and the orbit you added with the mouse (eases back). */
export interface ChaseRig { yaw: number; pitch: number; dist: number; off: number; idle: number }
export const CHASE = { dist: 6.2, min: 3.5, max: 14, pitch: -0.2, pitchMin: -0.9, pitchMax: 0.25, follow: 4.5, settle: 1.2, back: 2.2, fovGain: 0.3 } as const;
export const chaseStart = (yaw: number): ChaseRig => ({ yaw, pitch: CHASE.pitch, dist: CHASE.dist, off: 0, idle: 0 });
/** One frame of the spring arm: it swings towards behind the car (faster at speed; in reverse it stays behind, it doesn't flip), the look
 *  input (radians) orbits it and, after CHASE.settle s without input, the orbit eases back to behind. zoom scales the distance. Pure. */
export function chaseRig(r: ChaseRig, car: { heading: number; speed: number }, look: [number, number], zoom: number, dt: number): ChaseRig {
  const d = clamp(fin(dt), 0, 0.1); const lx = fin(look[0]), ly = fin(look[1]); const touched = Math.abs(lx) + Math.abs(ly) > 1e-6;
  let off = wrap(r.off - lx); const idle = touched ? 0 : r.idle + d;
  if (idle > CHASE.settle) off *= Math.exp(-d * CHASE.back);
  let pitch = clamp(r.pitch - ly, CHASE.pitchMin, CHASE.pitchMax); if (idle > CHASE.settle) pitch += (CHASE.pitch - pitch) * (1 - Math.exp(-d * CHASE.back));
  const behind = car.heading + Math.PI; const k = 1 - Math.exp(-d * (CHASE.follow * (0.35 + Math.min(1, Math.abs(car.speed) / 6))));
  const base = r.yaw - r.off; const yawBase = base + wrap(behind - base) * k;
  return { yaw: yawBase + off, pitch, dist: clamp(r.dist * (Number.isFinite(zoom) && zoom > 0 ? zoom : 1), CHASE.min, CHASE.max), off, idle };
}
/** The chase camera's pose: behind and above the car on the arm (a little longer at speed), looking at the roof; pulled in front of any
 *  wall between, kept above the ground. The lens widens with speed (lens = the 16:9 vertical degrees the take stores). */
export function chaseCamera(car: { pos: Vec3; speed: number }, rig: ChaseRig, tpl: PrevizTemplateId, lens: number, ride: RideSpec = rideOf(null)): CameraPose {
  const sp = Math.min(1, Math.abs(fin(car.speed)) / ride.top); const pitch = clamp(rig.pitch, CHASE.pitchMin, CHASE.pitchMax); const dist = rig.dist * (1 + 0.22 * sp);
  const look = lookDir(rig.yaw, pitch); const target: Vec3 = [car.pos[0], car.pos[1] + 1.5, car.pos[2]];
  let pos: Vec3 = [target[0] - look[0] * dist, target[1] - look[1] * dist + 0.6, target[2] - look[2] * dist];
  if (isCityTemplate(tpl)) pos = openCityWorld().occlude(target, pos);
  pos = clampCamera(tpl, pos); const fov = clamp(lens * (1 + CHASE.fovGain * sp * sp), 10, 100);
  return { pos, yaw: rig.yaw, pitch: clamp(pitch - 0.04, -PITCH_MAX, PITCH_MAX), fov };
}
/** the speed for the HUD (km/h, whole numbers, never −0) */
export const kmh = (speed: number) => Math.round(Math.abs(fin(speed)) * 3.6) || 0;
