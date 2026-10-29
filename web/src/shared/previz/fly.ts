/**
 * Fly the camera / Play the actor (2026-10-24, game mode 2026-10-26): the input driver for Direct a Shot's game-style mode. The maths is
 * shared and pure (flyStep in previzTemplates.ts; actorStep, followCamera and readPad in previzActor.ts, all covered by the tests); this file
 * only reads the keyboard, the mouse and game controllers and runs the frame loop.
 * Keys (by position, so any keyboard layout works):
 *  - Camera: W A S D or the arrows move, Q / E sink / rise, Shift slow and precise, Z / X zoom, scroll = flying speed.
 *  - Actor (third person, like a GTA character): W A S D walk relative to the camera, Shift runs (2 toggles running), 1 wave, 3 dance,
 *    4 sit, 5 jump, 6 point; the mouse orbits the camera around them, scroll moves it nearer or further.
 *  - Both: R record / stop, V switches Camera ↔ Actor, F full screen, Esc: releases the mouse first (full screen), then leaves.
 *  - Perform, then shoot: P shoots the last performance (or stops shooting), Space restarts the replay, T slow motion, L look at the person.
 *    With "look at" on, the camera keeps turning towards the aim point (options.aim) after each move, so A / D orbit, Q / E crane, W / S dolly.
 * Mouse: drag to look; in full screen the pointer is locked (no cursor, the mouse just looks, like a game).
 * Drive mode (2026-10-27, open city): C gets in when you stand by the car (or brings the car beside you) and gets out again. In the car W / S gas
 * and brake (reverse once stopped), A / D steer, Space handbrake, H horn; the chase camera swings in behind (mouse orbits, it eases back). Controller:
 * RT gas, LT brake, left stick steers, RB or X handbrake, left stick click horn, Y gets in (by the car; elsewhere Y still jumps), Y or B gets out.
 * Controllers (standard mapping): left stick moves, right stick looks, triggers down / up (camera) or nearer / further (actor), bumpers change
 * the flying speed (camera) or RB runs (actor), A records, B leaves, View / Back switches Camera ↔ Actor, X wave, Y jump, d-pad up dance,
 * down sit, left point; in Camera mode Y shoots the performance (or stops shooting), X looks at the person, LS slow motion. Keys typed into a text field, and shortcuts with Cmd / Ctrl, are left alone.
 */
import { flyStep, yawPitchTo, FLY_SPEED_MIN, FLY_SPEED_MAX, FLY_LOOK, type CameraPose, type FlyInput, type PrevizTemplateId, type Vec3 } from '../../../../server/src/shared/previzTemplates';
import type { DrivePhysics } from './drivePhysics';
import { actorStep, clampActor, DOOR_FADE, followCamera, readPad, padPressed, FOLLOW_DIST, FOLLOW_PITCH, ACTOR_ACTIONS, type ActorAction, type ActorLive, type FollowRig, type PadButtons } from '../../../../server/src/shared/previzActor';
import { carStep, carClamp, carSpot, exitSpot, nearCar, chaseRig, chaseCamera, chaseStart, rideOf, type CarState, type ChaseRig } from '../../../../server/src/shared/previzVehicle';

export type FlyMode = 'camera' | 'actor';
export type FlyKey = 'record' | 'exit' | 'mode' | 'flow' | 'shoot' | 'restart' | 'slow' | 'aim';
/** Drive mode: the car (kit id + its state) and whether the person is at the wheel */
export interface CarLive { k: string; s: CarState; inside: boolean; /** m/s² along the car, smoothed (the body pitches with it) */ acc?: number }
export interface FlyFrame { pose: CameraPose; mode: FlyMode; actor: ActorLive | null; car: CarLive | null; /** the person stands within reach of the car */ near: boolean;
  /** 0…1: the person fading into the car (getting in) or out of it (getting out); 1 = fully there */ fade: number; /** walking to the car's door */ boarding: boolean }
export interface FlyHandle { /** the pose now */ pose(): CameraPose; speed(): number; mode(): FlyMode; actor(): ActorLive | null; setMode(m: FlyMode): void;
  /** Drive mode: the car now; get in / out (C); another car (only while parked: false when it can't change now) */ car(): CarLive | null; toggleRide(): void; setCarKit(k: string): boolean;
  /** lock the mouse on the next click (full screen) or release it */ setLockOnClick(on: boolean): void; stop(): void;
  /** jump somewhere else (the open city's "teleport to district"): the camera, and the person when there is one */ teleport(pose: CameraPose, actor?: { pos: Vec3; heading: number }): void }
export interface FlyOptions {
  start: CameraPose; template: PrevizTemplateId; speed: number; mode: FlyMode;
  /** where the person stands when Actor mode starts (null: Actor mode isn't offered here) */ actor: ActorLive | null;
  /** every frame, after things moved (now = the rAF time stamp) */ onFrame(f: FlyFrame, now: number): void;
  onSpeed(speed: number): void; onKey(k: FlyKey): void;
  /** an action key (1–6, or its controller button) in Actor mode; run is a toggle and comes with its new state */ onAction?(a: ActorAction, now: number, on?: boolean): void;
  /** a controller was found or lost (its name) */ onPad?(name: string | null): void;
  /** Drive mode: the car parked when the session starts (null: no driving here) */ car?: CarLive | null;
  /** the person got in (true) or out (false) of the car; now = the rAF time stamp of that frame */ onRide?(inside: boolean, now: number, car: CarLive): void;
  /** the live drive's physics world (previz/drivePhysics.ts), read every frame: null while it loads or if it can't (the arcade model drives) */ physics?(): DrivePhysics | null;
  /** the scene clock now (seconds): where the ambient traffic is */ sceneTime?(): number;
  /** Drive mode: the horn (H, or the left stick click at the wheel) */ onHorn?(now: number): void;
  /** a short message for the HUD */ onNote?(msg: string): void;
  /** the mouse is locked to the view (true) or free again (false) */ onLock?(locked: boolean): void;
  /** the user moved or looked (the first-time hints fade after this) */ onActive?(): void;
  /** Camera mode: a point to keep the camera turned towards (look-at assist), read every frame; null = free look */ aim?(): Vec3 | null;
}
/** how fast the look-at assist turns the camera towards its point (1 / seconds) */ const AIM_RATE = 6;
const KEY_ONCE: Record<string, FlyKey> = { KeyR: 'record', KeyF: 'flow', KeyP: 'shoot', Space: 'restart', KeyT: 'slow', KeyL: 'aim' };
const MOVE: Record<string, [keyof Pick<FlyInput, 'fwd' | 'right' | 'up' | 'zoom'>, number]> = {
  KeyW: ['fwd', 1], ArrowUp: ['fwd', 1], KeyS: ['fwd', -1], ArrowDown: ['fwd', -1], KeyD: ['right', 1], ArrowRight: ['right', 1], KeyA: ['right', -1], ArrowLeft: ['right', -1],
  KeyE: ['up', 1], KeyQ: ['up', -1], KeyZ: ['zoom', 1], KeyX: ['zoom', -1],
};
const ACTION_KEY: Record<string, ActorAction> = Object.fromEntries(ACTOR_ACTIONS.map((a) => [`Digit${a.key}`, a.id]));
const PAD_ACTION: Partial<Record<keyof PadButtons, ActorAction>> = { x: 'wave', y: 'jump', up: 'dance', down: 'sit', left: 'point' };
/** right stick → look, in mouse pixels per second at full tilt */ const PAD_LOOK = 900;
/* a slider or a checkbox with focus (the replay scrubber) doesn't take typed keys: the game keeps them */
const typing = (t: EventTarget | null) => { const el = t as HTMLElement | null; if (!el) return false; if (el.tagName === 'INPUT' && /^(range|checkbox|radio|button)$/.test((el as HTMLInputElement).type)) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName); };
const firstPad = () => { try { return [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected) ?? null; } catch { return null; } };

export function startFly(el: HTMLElement, o: FlyOptions): FlyHandle {
  let pose = o.start; let vel: Vec3 = [0, 0, 0]; let speed = o.speed; const held = new Set<string>(); let look: [number, number] = [0, 0]; let wheel = 0; let drag: number | null = null;
  let mode: FlyMode = o.mode === 'actor' && o.actor ? 'actor' : 'camera'; let actor: ActorLive | null = o.actor ? { ...o.actor } : null; let runToggle = false;
  const rig: FollowRig = { yaw: pose.yaw, pitch: Math.max(FOLLOW_PITCH.min, Math.min(FOLLOW_PITCH.max, pose.pitch)), dist: FOLLOW_DIST.start };
  /** the lens before the chase camera widened it with speed (so it never creeps wider frame after frame) */ let baseFov = o.start.fov;
  let car: CarLive | null = o.car ? { ...o.car, s: { ...o.car.s } } : null; let chase: ChaseRig = chaseStart(pose.yaw); let rideReq = false; let board: { from: Vec3; to: Vec3; t0: number; walk: number; face: number } | null = null; let outAt: number | null = null; let fade = 1; let accS = 0; let shake = 0; let phSeen: DrivePhysics | null = null; let padDrive = { gas: 0, brake: 0, steer: 0, hb: false };
  let raf = 0; let last: number | null = null; let stopped = false; let lockOnClick = false; let padPrev: PadButtons | null = null; let padName: string | null = null; let nowT = 0;
  const locked = () => document.pointerLockElement === el;
  const toActor = () => { if (!actor) return; mode = 'actor'; rig.yaw = pose.yaw; rig.pitch = Math.max(FOLLOW_PITCH.min, Math.min(FOLLOW_PITCH.max, pose.pitch)); rig.dist = FOLLOW_DIST.start; vel = [0, 0, 0]; };
  const toCamera = () => { if (board) { board = null; fade = 1; } mode = 'camera'; vel = [0, 0, 0]; if (actor) actor = { ...actor, vel: [0, 0], v: 0 }; if (car) car = { ...car, s: { ...car.s, speed: 0, steer: 0 } }; if (car?.inside) pose = { ...pose, fov: baseFov }; };
  const act = (a: ActorAction) => { if (mode !== 'actor' || !actor || car?.inside || board) return; if (a === 'run') { runToggle = !runToggle; o.onAction?.('run', nowT, runToggle); return; }
    actor = { ...actor, beat: { kind: a, start: nowT / 1000 } }; o.onAction?.(a, nowT); };
  /* get in (by the car, or the car comes to stand beside you first) or get out (beside the driver's door) */
  const ride = (now: number) => { if (mode !== 'actor' || !actor || !car || board) return; const spec = rideOf(car.k);
    if (car.inside) { if (Math.abs(car.s.speed) > 2.5) { o.onNote?.('Slow down to get out: S or LT brakes.'); return; } /* stop first */ const at = exitSpot((x, z) => clampActor(o.template, x, z), car.s, spec);
      car = { ...car, inside: false, acc: 0, s: { ...car.s, speed: 0, steer: 0 } }; actor = { ...actor, pos: at, heading: car.s.heading, v: 0, d: Math.max(actor.d, car.s.d), vel: [0, 0], beat: null };
      rig.yaw = chase.yaw; rig.pitch = Math.max(FOLLOW_PITCH.min, Math.min(FOLLOW_PITCH.max, chase.pitch)); outAt = now; o.onRide?.(false, now, car); return; }
    /* far from the car: it comes to stand beside you first; then you walk to the driver's door and fade in (DOOR_FADE) */
    if (!nearCar(actor.pos, car.s, spec)) { const sp = carSpot(o.template, actor.pos, actor.heading, spec); car = { ...car, s: { pos: sp.pos, heading: sp.heading, speed: 0, steer: 0, d: car.s.d } }; }
    const door = exitSpot((x, z) => clampActor(o.template, x, z), car.s, spec); const dist = Math.hypot(door[0] - actor.pos[0], door[2] - actor.pos[2]);
    board = { from: actor.pos, to: door, t0: now, walk: Math.min(2.2, Math.max(0.12, dist / 1.7)), face: Math.atan2(car.s.pos[0] - door[0], car.s.pos[2] - door[2]) }; runToggle = false; outAt = null; };
  /** one frame of walking to the door; at the end the person is in the car */
  const boarding = (now: number, dt: number) => { if (!board || !actor || !car) return; const t = (now - board.t0) / 1000; const b = board;
    /* the follow camera swings round behind the person, the car in front of them (never inside the car's body) */
    { let dy = b.face + Math.PI - rig.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; rig.yaw += dy * (1 - Math.exp(-dt * 5)); rig.pitch += (-0.28 - rig.pitch) * (1 - Math.exp(-dt * 4)); }
    if (t < b.walk) { const k = t / b.walk; const e = k * k * (3 - 2 * k); const pos: Vec3 = [b.from[0] + (b.to[0] - b.from[0]) * e, b.from[1] + (b.to[1] - b.from[1]) * e, b.from[2] + (b.to[2] - b.from[2]) * e];
      const step = Math.hypot(pos[0] - actor.pos[0], pos[2] - actor.pos[2]); const hd = step > 1e-4 ? Math.atan2(pos[0] - actor.pos[0], pos[2] - actor.pos[2]) : actor.heading;
      let dh = hd - actor.heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      actor = { ...actor, pos, heading: actor.heading + dh * (1 - Math.exp(-dt * 12)), v: dt > 0 ? Math.min(2, step / dt) : 0, d: actor.d + step, vel: [0, 0], beat: null }; fade = 1; return; }
    if (t < b.walk + DOOR_FADE) { let dh = b.face - actor.heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      actor = { ...actor, pos: b.to, heading: actor.heading + dh * (1 - Math.exp(-dt * 12)), v: 0 }; fade = Math.max(0, 1 - (t - b.walk) / DOOR_FADE); return; }
    board = null; fade = 1; const spec = rideOf(car.k);
    car = { ...car, inside: true, acc: 0, s: { ...car.s, d: Math.max(car.s.d, actor.d) } }; /* one distance for the take (it only grows) */ actor = { ...actor, pos: car.s.pos, heading: car.s.heading, v: 0, d: car.s.d, vel: [0, 0], beat: null };
    o.physics?.()?.place(car.s, spec); phSeen = o.physics?.() ?? null; accS = 0;
    chase = { ...chaseStart(rig.yaw), pitch: Math.max(-0.9, Math.min(0.25, rig.pitch)) }; o.onRide?.(true, now, car); };
  const onDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector('.dlg-scrim')) return;
    if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); if (locked()) { document.exitPointerLock?.(); return; } o.onKey('exit'); return; }
    const once = (k: FlyKey) => { e.preventDefault(); e.stopPropagation(); if (!e.repeat) o.onKey(k); };
    if (e.code === 'KeyC') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) rideReq = true; return; }
    if (e.code === 'KeyH' && car?.inside && mode === 'actor') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) o.onHorn?.(nowT); return; }
    if (e.code === 'Space' && car?.inside && mode === 'actor') { e.preventDefault(); e.stopPropagation(); held.add(e.code); return; } /* the handbrake */
    if (KEY_ONCE[e.code]) return once(KEY_ONCE[e.code]);
    if (e.code === 'KeyV') { e.preventDefault(); e.stopPropagation(); if (!e.repeat && actor) o.onKey('mode'); return; }
    if (ACTION_KEY[e.code]) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) act(ACTION_KEY[e.code]); return; }
    if (MOVE[e.code] || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { e.preventDefault(); e.stopPropagation(); held.add(e.code); o.onActive?.(); }
  };
  const onUp = (e: KeyboardEvent) => { held.delete(e.code); };
  const onBlur = () => { held.clear(); drag = null; };
  const onPDown = (e: PointerEvent) => { if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, a, textarea, [data-nofly]')) return;
    if (lockOnClick && !locked()) { try { const r = (el as any).requestPointerLock?.({ unadjustedMovement: true }); if (r?.catch) r.catch(() => (el as any).requestPointerLock?.()); } catch { /* no pointer lock: drag still works */ } }
    if (locked()) return; drag = e.pointerId; try { el.setPointerCapture(e.pointerId); } catch { /* fine */ } el.classList.add('pv-looking'); e.preventDefault(); };
  const onPMove = (e: PointerEvent) => { if (drag !== e.pointerId) return; look = [look[0] + e.movementX, look[1] + e.movementY]; o.onActive?.(); };
  const onMMove = (e: MouseEvent) => { if (!locked()) return; look = [look[0] + e.movementX, look[1] + e.movementY]; o.onActive?.(); };
  const onPUp = (e: PointerEvent) => { if (drag !== e.pointerId) return; drag = null; el.classList.remove('pv-looking'); try { el.releasePointerCapture(e.pointerId); } catch { /* fine */ } };
  const onWheel = (e: WheelEvent) => { e.preventDefault(); if (mode === 'actor') { wheel += e.deltaY; return; } speed = Math.max(FLY_SPEED_MIN, Math.min(FLY_SPEED_MAX, speed * Math.exp(-e.deltaY * 0.0015))); o.onSpeed(speed); };
  const onLockChange = () => { const l = locked(); el.classList.toggle('pv-locked', l); o.onLock?.(l); };
  const onPad = () => { const p = firstPad(); const n = p ? p.id.replace(/\s*\(.*$/, '').trim() || 'Controller' : null; if (n !== padName) { padName = n; o.onPad?.(n); } };
  window.addEventListener('keydown', onDown, true); window.addEventListener('keyup', onUp, true); window.addEventListener('blur', onBlur);
  window.addEventListener('gamepadconnected', onPad); window.addEventListener('gamepaddisconnected', onPad); document.addEventListener('pointerlockchange', onLockChange); document.addEventListener('mousemove', onMMove);
  el.addEventListener('pointerdown', onPDown); el.addEventListener('pointermove', onPMove); el.addEventListener('pointerup', onPUp); el.addEventListener('pointercancel', onPUp); el.addEventListener('wheel', onWheel, { passive: false });
  onPad();
  const loop = (now: number) => { if (stopped) return; const dt = last == null ? 0 : (now - last) / 1000; last = now; nowT = now;
    const slow = held.has('ShiftLeft') || held.has('ShiftRight'); const inp: FlyInput = { fwd: 0, right: 0, up: 0, zoom: 0, look, slow };
    for (const c of held) { const m = MOVE[c]; if (m) inp[m[0]] = Math.max(-1, Math.min(1, inp[m[0]] + m[1])); }
    let padRun = false;
    /* a controller adds to the keys: left stick moves, right stick looks, triggers, buttons (each press acts once) */
    const gp = padName ? firstPad() : null;
    if (gp) { const p = readPad(gp.axes, gp.buttons);
      const driving = mode === 'actor' && !!car?.inside; padDrive = { gas: p.rt, brake: p.lt, steer: p.move[0], hb: p.buttons.rb || p.buttons.x };
      if (!driving) inp.fwd = Math.max(-1, Math.min(1, inp.fwd - p.move[1])); inp.right = Math.max(-1, Math.min(1, inp.right + p.move[0]));
      inp.look = [inp.look[0] + p.look[0] * PAD_LOOK * dt, inp.look[1] + p.look[1] * PAD_LOOK * dt];
      if (mode === 'camera') { inp.up = Math.max(-1, Math.min(1, inp.up + p.rt - p.lt)); inp.zoom += (p.buttons.up ? 1 : 0) - (p.buttons.down ? 1 : 0); }
      else if (!driving) { wheel += (p.lt - p.rt) * 600 * dt; padRun = p.buttons.rb; }
      if (p.move[0] || p.move[1] || p.look[0] || p.look[1] || p.lt || p.rt) o.onActive?.();
      for (const b of padPressed(p.buttons, padPrev)) {
        if (mode === 'actor' && car && actor && (car.inside ? b === 'y' || b === 'b' : b === 'y' && nearCar(actor.pos, car.s, rideOf(car.k)))) { rideReq = true; continue; }
        if (driving && b === 'ls') { o.onHorn?.(now); continue; }
        if (driving && (b === 'x' || b === 'rb' || PAD_ACTION[b])) continue;
        if (b === 'a') o.onKey('record'); else if (b === 'b') o.onKey('exit'); else if (b === 'back' && actor) o.onKey('mode'); else if (b === 'start') o.onKey('flow');
        else if (mode === 'camera' && (b === 'y' || b === 'x' || b === 'ls')) o.onKey(b === 'y' ? 'shoot' : b === 'x' ? 'aim' : 'slow');
        else if (mode === 'camera' && (b === 'lb' || b === 'rb')) { speed = Math.max(FLY_SPEED_MIN, Math.min(FLY_SPEED_MAX, speed * (b === 'rb' ? 1.25 : 0.8))); o.onSpeed(speed); }
        else if (mode === 'actor' && PAD_ACTION[b]) act(PAD_ACTION[b]!); else if (mode === 'actor' && b === 'ls') act('run');
      }
      padPrev = p.buttons; } else { padPrev = null; padDrive = { gas: 0, brake: 0, steer: 0, hb: false }; }
    if (rideReq) { rideReq = false; ride(now); }
    if (outAt != null) { fade = Math.min(1, (now - outAt) / 1000 / DOOR_FADE); if (fade >= 1) outAt = null; }
    if (mode === 'actor' && actor && car?.inside) {
      /* Drive mode: the physics world (Rapier) when it has loaded, else the arcade model (carStep), and the spring-arm chase camera */
      const spec = rideOf(car.k); const keyGas = Math.max(0, inp.fwd), keyBrake = Math.max(0, -inp.fwd);
      const input = { throttle: Math.min(1, keyGas + padDrive.gas), brake: Math.min(1, keyBrake + padDrive.brake), steer: Math.max(-1, Math.min(1, inp.right)), handbrake: held.has('Space') || padDrive.hb };
      const ph = o.physics?.() ?? null; if (ph && ph !== phSeen) { ph.place(car.s, spec); phSeen = ph; }
      let s: CarState; try { s = ph ? ph.step(car.s, input, dt, o.sceneTime?.() ?? 0) : carStep(car.s, input, dt, o.template, spec); } catch { s = carStep(car.s, input, dt, o.template, spec); }
      /* the body pitches with the acceleration; a hard hit gives the camera a short bump */
      const a = dt > 0 ? (s.speed - car.s.speed) / dt : 0; accS += (a - accS) * (dt > 0 ? 1 - Math.exp(-dt * 10) : 0); if (a < -28) shake = Math.max(shake, Math.min(1, -a / 70)); shake *= Math.exp(-dt * 7);
      car = { ...car, s, acc: accS }; actor = { ...actor, pos: s.pos, heading: s.heading, v: Math.min(20, Math.abs(s.speed)), d: s.d, vel: [Math.sin(s.heading) * s.speed, Math.cos(s.heading) * s.speed], beat: null };
      const zoom = wheel ? Math.exp(wheel * 0.0015) : 1; wheel = 0;
      chase = chaseRig(chase, s, [inp.look[0] * FLY_LOOK, inp.look[1] * FLY_LOOK], zoom, dt);
      if (inp.zoom) baseFov = Math.max(12, Math.min(80, baseFov * Math.exp(-inp.zoom * dt * 0.8)));
      const want = chaseCamera(s, chase, o.template, baseFov, spec);
      const k = dt > 0 ? 1 - Math.exp(-dt * 10) : 1; const sh = shake > 0.01 ? shake * 0.12 : 0;
      pose = { ...want, pos: [pose.pos[0] + (want.pos[0] - pose.pos[0]) * k + sh * Math.sin(now * 0.071), pose.pos[1] + (want.pos[1] - pose.pos[1]) * k + sh * Math.sin(now * 0.093), pose.pos[2] + (want.pos[2] - pose.pos[2]) * k] };
    } else if (mode === 'actor' && actor) {
      rig.yaw -= inp.look[0] * FLY_LOOK; rig.pitch = Math.max(FOLLOW_PITCH.min, Math.min(FOLLOW_PITCH.max, rig.pitch - inp.look[1] * FLY_LOOK));
      if (wheel) { rig.dist = Math.max(FOLLOW_DIST.min, Math.min(FOLLOW_DIST.max, rig.dist * Math.exp(wheel * 0.0015))); wheel = 0; }
      if (board) boarding(now, dt); else actor = actorStep(actor, { fwd: inp.fwd, right: inp.right, run: slow || runToggle || padRun, look: [0, 0], zoom: 0 }, rig, dt, now / 1000, o.template);
      const want = followCamera(actor.pos, rig, o.template, pose.fov * Math.exp(-inp.zoom * dt * 0.8));
      /* the follow camera trails a touch (a steadier frame than a rigid arm) but never lags behind a turn of the mouse */
      const k = dt > 0 ? 1 - Math.exp(-dt * 14) : 1; pose = { ...want, pos: [pose.pos[0] + (want.pos[0] - pose.pos[0]) * k, pose.pos[1] + (want.pos[1] - pose.pos[1]) * k, pose.pos[2] + (want.pos[2] - pose.pos[2]) * k] };
    } else { const s = flyStep(pose, vel, inp, dt, speed, o.template); pose = s.pose; vel = s.vel;
      /* look-at assist: after the move, turn towards the point (the shortest way round), so strafing orbits it and rising cranes over it */
      const at = o.aim?.(); if (at && dt > 0) { const w = yawPitchTo(pose.pos, at); let dy = w.yaw - pose.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
        const k = 1 - Math.exp(-dt * AIM_RATE); pose = { ...pose, yaw: pose.yaw + dy * k, pitch: pose.pitch + (w.pitch - pose.pitch) * k }; } }
    if (mode === 'actor' && car?.inside) { /* nothing: the base lens stays as it was */ } else baseFov = pose.fov;
    look = [0, 0]; o.onFrame({ pose, mode, actor, car, near: !!(car && actor && !car.inside && !board && nearCar(actor.pos, car.s, rideOf(car.k))), fade, boarding: !!board }, now); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  return { pose: () => pose, speed: () => speed, mode: () => mode, actor: () => actor, car: () => car,
    toggleRide() { rideReq = true; },
    setCarKit(k) { if (!car || car.inside) return false; const c = carClamp(o.template, car.s.pos[0], car.s.pos[2], car.s.heading, rideOf(k)); car = { ...car, k, s: { ...car.s, pos: c.pos } }; return true; },
    setMode(m) { if (m === mode) return; if (m === 'actor') toActor(); else toCamera(); },
    teleport(p, a) { board = null; fade = 1; outAt = null; pose = p; vel = [0, 0, 0]; rig.yaw = p.yaw; chase = chaseStart(p.yaw); if (actor && a) actor = { ...actor, pos: a.pos, heading: a.heading, vel: [0, 0], v: 0, beat: null };
      /* the car comes along: at the wheel you arrive driving, on foot it stands beside you */
      if (car && a) { const sp = carSpot(o.template, a.pos, a.heading, rideOf(car.k)); car = car.inside ? { ...car, s: { ...car.s, pos: carClamp(o.template, a.pos[0], a.pos[2], a.heading, rideOf(car.k)).pos, heading: a.heading, speed: 0, steer: 0 } } : { ...car, s: { ...car.s, pos: sp.pos, heading: sp.heading, speed: 0, steer: 0 } }; if (car.inside) o.physics?.()?.place(car.s, rideOf(car.k)); } },
    setLockOnClick(on) { lockOnClick = on; if (!on && locked()) document.exitPointerLock?.(); },
    stop() { if (stopped) return; stopped = true; cancelAnimationFrame(raf); if (locked()) document.exitPointerLock?.();
      window.removeEventListener('keydown', onDown, true); window.removeEventListener('keyup', onUp, true); window.removeEventListener('blur', onBlur);
      window.removeEventListener('gamepadconnected', onPad); window.removeEventListener('gamepaddisconnected', onPad); document.removeEventListener('pointerlockchange', onLockChange); document.removeEventListener('mousemove', onMMove);
      el.removeEventListener('pointerdown', onPDown); el.removeEventListener('pointermove', onPMove); el.removeEventListener('pointerup', onPUp); el.removeEventListener('pointercancel', onPUp); el.removeEventListener('wheel', onWheel); el.classList.remove('pv-looking', 'pv-locked'); } };
}
