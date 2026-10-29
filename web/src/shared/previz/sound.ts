/**
 * Direct a Shot sound (2026-10-27): live preview only, fully procedural Web Audio (no samples, nothing to licence). One AudioContext per
 * play session, created on the first call (the player starts on a click, so the browser lets it run; if not, it resumes on the next
 * pointer / key press).
 *  - City bed: looped pink noise through a low-pass (distant traffic hum), plus soft distant horns (two detuned squares) and birds (sine
 *    chirps, daytime only) on random timers. Night is darker and sparser; near the sea a slow-swelling band-passed noise adds gentle surf
 *    (stronger at night, when the city is quieter). Indoor presets get a quiet room tone only.
 *  - Footsteps: short band-passed noise bursts (plus a low thump when running) on every footfall, i.e. every half stride of distance walked
 *    (d / STRIDE, the same stride the walk / jog / sprint clips use, so the feet and the sound agree). Harder and darker when running;
 *    none when idle, in the camera or in a car.
 *  - Engine (drive mode): a saw and a square an octave down through a low-pass; pitch, brightness and level follow the speed, with a low
 *    idle rumble at 0.
 *  - Traffic: up to three voices follow the nearest ambient cars: band-passed noise (tyres) + a low saw (engine), level by distance,
 *    pitch by a simple doppler shift, panned by where the car is around the camera.
 *  - Master: a gentle overall level (about −20 LUFS perceived) into a limiter, so it never clips; mute ramps it down (no clicks).
 * The maths (footfalls, levels, doppler, panning, nearest cars, sea) is pure and exported for server/test/previz-sound.test.ts.
 */
import { STRIDE } from '../../../../server/src/shared/previzActor';

export type V3 = [number, number, number];
export interface PrevizCar { pos: V3; vel: V3 }
export interface PrevizSoundState {
  mode: 'camera' | 'actor' | 'drive'; onFoot: boolean; inCar: boolean;
  /** speed of whoever is moving (the person or the car), m/s */ v: number; /** distance walked, m (grows while walking) */ d: number;
  camPos: V3; night: boolean; nearCars: PrevizCar[];
  /** optional: camera yaw (radians, the engine's convention: forward = (−sin, 0, −cos)) for left / right panning; 0 if left out */ yaw?: number;
  /** optional: 0..1, how near the sea (seaNearness); 0 if left out */ sea?: number;
  /** optional: 'city' (default), 'indoor' (quiet room tone) or 'none' (no bed) */ ambience?: 'city' | 'indoor' | 'none';
}
export interface PrevizSound { update(state: PrevizSoundState, dt: number): void; setMuted(b: boolean): void; stop(): void;
  /** a short game cue (drive mode, previz/driveGame.ts); muted with everything else */ cue(kind: PrevizCue): void }
/** Drive mode's cues (2026-10-27): small and soft, under the city bed's level, so they reward without nagging. Each is a few notes (Hz, start
 *  s, length s) on one wave, or a noise sweep; the tables are pure (tested). horn: two detuned squares close by, like a real car horn. */
export type PrevizCue = 'horn' | 'green' | 'oops' | 'near-miss' | 'parked' | 'streak' | 'bump';
export interface CueSpec { wave: OscillatorType | 'noise'; notes: [number, number, number][]; gain: number; cut: number }
export const CUES: Record<PrevizCue, CueSpec> = {
  horn: { wave: 'square', notes: [[415, 0, 0.42], [523, 0, 0.42]], gain: 0.16, cut: 1900 },
  green: { wave: 'sine', notes: [[1047, 0, 0.5], [1568, 0.09, 0.6]], gain: 0.09, cut: 6000 },
  oops: { wave: 'triangle', notes: [[523, 0, 0.16], [392, 0.17, 0.26]], gain: 0.13, cut: 3000 },
  'near-miss': { wave: 'noise', notes: [[700, 0, 0.36], [2600, 0.12, 0.24]], gain: 0.22, cut: 5000 },
  parked: { wave: 'sine', notes: [[1047, 0, 0.3], [1319, 0.07, 0.3], [1568, 0.14, 0.3], [2093, 0.21, 0.55]], gain: 0.08, cut: 7000 },
  streak: { wave: 'sine', notes: [[1568, 0, 0.14], [2093, 0.08, 0.3]], gain: 0.07, cut: 7000 },
  bump: { wave: 'sine', notes: [[95, 0, 0.18]], gain: 0.4, cut: 400 },
};

/** localStorage key for the player's remembered mute ('0' = off); sound is on by default */
export const PREVIZ_SOUND_KEY = 'ohf:previz-sound';
export function previzSoundOn(): boolean { try { return localStorage.getItem(PREVIZ_SOUND_KEY) !== '0'; } catch { return true; } }

// ---------------------------------------------------------------- pure helpers (tested)
export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
export const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const dbToGain = (db: number) => Math.pow(10, db / 20);
/** the overall level into the limiter (measured: driving ≈ −20 dBFS RMS, walking ≈ −27, the city bed alone ≈ −33) */ export const MASTER_DB = -10;
/** speed of sound for the doppler shift, m/s */ export const SOUND_SPEED = 343;

/** which gait the actor clips are showing at this speed (the midpoints of actor.ts's blends) */
export function gaitFor(v: number): 'idle' | 'walk' | 'jog' | 'sprint' { return v < 0.35 ? 'idle' : v < 2.4 ? 'walk' : v < 4.95 ? 'jog' : 'sprint'; }
export function strideFor(v: number): number { const g = gaitFor(v); return g === 'sprint' ? STRIDE.sprint : g === 'jog' ? STRIDE.jog : STRIDE.walk; }

/** Footfalls between two distances: one every half stride (two feet per cycle). Returns each one's place within the frame (0..1, in
 *  order). Walking backwards (d shrinking) or a jump of d (teleport) gives none; at most 4 per frame. */
export function footfalls(d0: number, d1: number, stride: number): number[] {
  const step = stride / 2; if (!(d1 > d0) || !(step > 0) || d1 - d0 > step * 4) return [];
  const out: number[] = []; for (let n = Math.floor(d0 / step) + 1; n * step <= d1; n++) out.push((n * step - d0) / (d1 - d0));
  return out;
}
/** a footfall's loudness (0..1) and brightness (band centre, Hz): soft when walking, harder and darker when running */
export function stepLevel(v: number): { gain: number; freq: number; thump: number } {
  const run = smoothstep(1.7, 3.6, v);
  return { gain: 0.35 + 0.45 * run + 0.2 * smoothstep(4.3, 6, v), freq: 1500 - 600 * run, thump: run };
}

/** engine note from speed (m/s): fundamental (Hz), low-pass cutoff (Hz), level (0..1); a little idle rumble at 0 */
export function engineParams(v: number): { freq: number; cutoff: number; gain: number } {
  const s = clamp(Math.abs(v), 0, 40); const gear = s / 40;
  /* a simple "gear" saw-tooth: the pitch rises inside each of 4 gears and drops a little on each change */
  const g = Math.min(3, Math.floor(gear * 4)); const inGear = gear * 4 - g;
  return { freq: 38 + g * 9 + inGear * 34, cutoff: 260 + 1500 * gear + 300 * inGear, gain: 0.32 + 0.5 * Math.sqrt(gear) };
}

/** doppler factor for a source moving at vel past a still listener (> 1 approaching, < 1 leaving); clamped */
export function doppler(src: V3, vel: V3, listener: V3): number {
  const dx = listener[0] - src[0], dy = listener[1] - src[1], dz = listener[2] - src[2]; const r = Math.hypot(dx, dy, dz) || 1e-6;
  const toward = (vel[0] * dx + vel[1] * dy + vel[2] * dz) / r; return clamp(SOUND_SPEED / (SOUND_SPEED - clamp(toward, -100, 100)), 0.7, 1.4);
}
/** level for a car at distance r (m): inverse distance past 4 m, gone by 70 m */
export function passLevel(r: number): number { return r >= 70 ? 0 : Math.min(1, 4 / Math.max(4, r)) * (1 - smoothstep(40, 70, r)); }
/** left / right pan (−1..1) of a point around a camera with this yaw (forward = (−sin, 0, −cos)) */
export function panFor(src: V3, cam: V3, yaw: number): number {
  const dx = src[0] - cam[0], dz = src[2] - cam[2]; const r = Math.hypot(dx, dz); if (r < 1e-6) return 0;
  return clamp((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / r, -1, 1) * 0.85;
}
/** the n nearest cars to the camera (closest first) */
export function nearestCars(cars: PrevizCar[], cam: V3, n = 3): (PrevizCar & { r: number })[] {
  return cars.map((c) => ({ ...c, r: Math.hypot(c.pos[0] - cam[0], c.pos[1] - cam[1], c.pos[2] - cam[2]) })).sort((a, b) => a.r - b.r).slice(0, n);
}
/** ambient cars with a velocity, from two calls of CityWorld.carsAt (at t and t + h); for nearCars */
export function carsWithVelocity(a: { x: number; y: number; z: number }[], b: { x: number; y: number; z: number }[], h: number): PrevizCar[] {
  const out: PrevizCar[] = []; for (let i = 0; i < a.length && i < b.length; i++) { const p = a[i], q = b[i];
    /* a car wrapping round its loop jumps: no velocity for that one frame */ const vx = (q.x - p.x) / h, vz = (q.z - p.z) / h; const ok = Math.hypot(vx, vz) < 60;
    out.push({ pos: [p.x, p.y, p.z], vel: ok ? [vx, 0, vz] : [0, 0, 0] }); }
  return out;
}
/** 0..1: how near the sea a camera at z is (the open city's beach runs up to shoreZ, the sea is beyond it) */
export function seaNearness(z: number, shoreZ = 300): number { return smoothstep(shoreZ - 140, shoreZ - 10, z); }
/** the bed's layer levels (0..1) for a place and time */
export function ambienceLevels(o: { ambience?: 'city' | 'indoor' | 'none'; night: boolean; sea?: number }): { bed: number; bedCut: number; surf: number; horns: number; birds: number; room: number } {
  const a = o.ambience ?? 'city'; const sea = clamp(o.sea ?? 0, 0, 1);
  if (a === 'none') return { bed: 0, bedCut: 600, surf: 0, horns: 0, birds: 0, room: 0 };
  if (a === 'indoor') return { bed: 0, bedCut: 500, surf: 0, horns: 0, birds: 0, room: 0.5 };
  const city = 1 - 0.6 * sea; /* the city hum fades towards the beach */
  return o.night ? { bed: 0.55 * city, bedCut: 520, surf: 0.95 * sea, horns: 0.25 * city, birds: 0, room: 0 }
    : { bed: 0.8 * city, bedCut: 900, surf: 0.7 * sea, horns: 0.6 * city, birds: 0.7 * (1 - 0.3 * sea), room: 0 };
}
/** mean seconds between distant events at this level (0 = never) */
export const eventGap = (level: number, base: number) => (level <= 0.01 ? Infinity : base / level);

// ---------------------------------------------------------------- the audio graph
type AC = AudioContext;
function noiseBuffer(ctx: AC, seconds: number, pink: boolean): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds); const buf = ctx.createBuffer(1, n, ctx.sampleRate); const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1;
    if (!pink) { d[i] = w; continue; } /* Paul Kellet's pink filter */
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
  /* fade the loop seam */ const f = Math.min(n >> 1, 2048); for (let i = 0; i < f; i++) { const k = i / f; d[i] *= k; d[n - 1 - i] *= k; }
  return buf;
}
/** a smooth parameter move (no zipper noise) */ const glide = (p: AudioParam, v: number, t: number, tc = 0.12) => p.setTargetAtTime(v, t, tc);

export function startPrevizSound(): PrevizSound {
  const Ctor: typeof AudioContext | undefined = typeof window !== 'undefined' ? (window.AudioContext ?? (window as any).webkitAudioContext) : undefined;
  if (!Ctor) return { update() {}, setMuted() {}, stop() {}, cue() {} };
  const ctx = new Ctor({ latencyHint: 'interactive' }); let stopped = false; let muted = !previzSoundOn();
  const resume = () => { if (!stopped && ctx.state === 'suspended') void ctx.resume().catch(() => {}); };
  const gesture = () => resume(); window.addEventListener('pointerdown', gesture, true); window.addEventListener('keydown', gesture, true);
  const sources: (AudioScheduledSourceNode)[] = []; const keep = <N extends AudioScheduledSourceNode>(n: N) => { sources.push(n); n.start(); return n; };

  /* master: level → limiter → out */
  const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -4; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.12;
  const master = ctx.createGain(); master.gain.value = 0; master.connect(limiter).connect(ctx.destination);
  const level = () => (muted ? 0 : dbToGain(MASTER_DB)); glide(master.gain, level(), ctx.currentTime, 0.4);
  const bus = (g = 1) => { const n = ctx.createGain(); n.gain.value = g; n.connect(master); return n; };

  const pinkBuf = noiseBuffer(ctx, 4, true), whiteBuf = noiseBuffer(ctx, 1, false);
  const loop = (buf: AudioBuffer, offset = 0) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; sources.push(s); s.start(0, offset % buf.duration); return s; };

  /* city bed */
  const bedLp = ctx.createBiquadFilter(); bedLp.type = 'lowpass'; bedLp.frequency.value = 900; bedLp.Q.value = 0.3;
  const bedHp = ctx.createBiquadFilter(); bedHp.type = 'highpass'; bedHp.frequency.value = 50;
  const bedG = ctx.createGain(); bedG.gain.value = 0; loop(pinkBuf).connect(bedHp).connect(bedLp).connect(bedG).connect(bus(0.9));
  /* room tone (indoor) */
  const roomLp = ctx.createBiquadFilter(); roomLp.type = 'lowpass'; roomLp.frequency.value = 280; const roomG = ctx.createGain(); roomG.gain.value = 0;
  loop(pinkBuf, 1.3).connect(roomLp).connect(roomG).connect(bus(0.5));
  /* surf: band-passed noise swelling on a slow LFO (~8 s waves) */
  const surfBp = ctx.createBiquadFilter(); surfBp.type = 'bandpass'; surfBp.frequency.value = 520; surfBp.Q.value = 0.6;
  const surfSwell = ctx.createGain(); surfSwell.gain.value = 0.55; const lfo = keep(ctx.createOscillator()); lfo.frequency.value = 0.12; const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.45; lfo.connect(lfoAmt).connect(surfSwell.gain);
  const surfG = ctx.createGain(); surfG.gain.value = 0; loop(pinkBuf, 2.7).connect(surfBp).connect(surfSwell).connect(surfG).connect(bus(0.9));
  /* distant events (horns, birds) share a soft, far-away bus */
  const farLp = ctx.createBiquadFilter(); farLp.type = 'lowpass'; farLp.frequency.value = 2600; const far = bus(0.5); farLp.connect(far);
  let hornIn = 4 + Math.random() * 6, birdIn = 2 + Math.random() * 4;
  const horn = (t: number) => { const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8; const g = ctx.createGain(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
    const f = 290 + Math.random() * 120; const len = 0.25 + Math.random() * 0.45; const peak = 0.05 + Math.random() * 0.05;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.03); g.gain.setValueAtTime(peak, t + len); g.gain.linearRampToValueAtTime(0, t + len + 0.08);
    for (const [type, mul] of [['square', 1], ['square', 1.26]] as const) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mul; o.connect(lp); o.start(t); o.stop(t + len + 0.1); }
    lp.connect(g).connect(pan).connect(farLp); };
  const bird = (t: number) => { const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.8 - 0.9; const n = 2 + Math.floor(Math.random() * 3); const base = 2600 + Math.random() * 1600;
    for (let i = 0; i < n; i++) { const t0 = t + i * (0.11 + Math.random() * 0.06); const o = ctx.createOscillator(); o.type = 'sine'; const g = ctx.createGain();
      o.frequency.setValueAtTime(base, t0); o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.3), t0 + 0.07);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.03, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.09);
      o.connect(g).connect(pan); o.start(t0); o.stop(t0 + 0.1); }
    pan.connect(farLp); };

  /* footsteps */
  const steps = bus(1);
  const footstep = (t: number, v: number) => { const L = stepLevel(v); const s = ctx.createBufferSource(); s.buffer = whiteBuf; s.playbackRate.value = 0.9 + Math.random() * 0.2;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = L.freq * (0.9 + Math.random() * 0.2); bp.Q.value = 1.1;
    const g = ctx.createGain(); const peak = 0.55 * L.gain * (0.85 + Math.random() * 0.3); const len = 0.07 + 0.03 * L.thump;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, t + len);
    s.connect(bp).connect(g).connect(steps); s.start(t, Math.random() * 0.8); s.stop(t + len + 0.02);
    if (L.thump > 0.05) { const o = ctx.createOscillator(); o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.08); const og = ctx.createGain();
      og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.5 * L.thump * L.gain, t + 0.004); og.gain.exponentialRampToValueAtTime(0.0008, t + 0.1);
      o.connect(og).connect(steps); o.start(t); o.stop(t + 0.12); } };

  /* engine */
  const engLp = ctx.createBiquadFilter(); engLp.type = 'lowpass'; engLp.Q.value = 2; engLp.frequency.value = 260; const engG = ctx.createGain(); engG.gain.value = 0;
  const saw = keep(ctx.createOscillator()); saw.type = 'sawtooth'; const sq = keep(ctx.createOscillator()); sq.type = 'square'; const rumble = keep(ctx.createOscillator()); rumble.type = 'sine';
  const sqG = ctx.createGain(); sqG.gain.value = 0.5; const rumG = ctx.createGain(); rumG.gain.value = 0.8;
  saw.connect(engLp); sq.connect(sqG).connect(engLp); rumble.connect(rumG).connect(engG); engLp.connect(engG).connect(bus(0.45));

  /* traffic: three voices for the nearest cars */
  const voices = [0, 1, 2].map((i) => { const pan = ctx.createStereoPanner(); const g = ctx.createGain(); g.gain.value = 0; g.connect(pan).connect(bus(0.7));
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 0.7; loop(whiteBuf, i * 0.31).connect(bp).connect(g);
    const o = keep(ctx.createOscillator()); o.type = 'sawtooth'; o.frequency.value = 70; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; const og = ctx.createGain(); og.gain.value = 0.35;
    o.connect(lp).connect(og).connect(g); return { pan, g, bp, o }; });

  /* game cues: their own bus, a touch of stereo width, nothing that rings on */
  const cues = bus(1);
  const cue = (kind: PrevizCue) => { const C = CUES[kind]; const t = ctx.currentTime + 0.01; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = C.cut; lp.connect(cues);
    for (const [f, at, len] of C.notes) { const g = ctx.createGain(); g.connect(lp); const t0 = t + at;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(C.gain, t0 + (kind === 'horn' ? 0.02 : 0.006)); if (kind === 'horn') g.gain.setValueAtTime(C.gain, t0 + len - 0.06); g.gain.exponentialRampToValueAtTime(0.0005, t0 + len);
      if (C.wave === 'noise') { const n = ctx.createBufferSource(); n.buffer = whiteBuf; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4; bp.frequency.setValueAtTime(f * 0.6, t0); bp.frequency.exponentialRampToValueAtTime(f, t0 + len * 0.5); bp.frequency.exponentialRampToValueAtTime(f * 0.5, t0 + len);
        n.connect(bp).connect(g); n.start(t0, Math.random() * 0.5); n.stop(t0 + len + 0.02); continue; }
      const o = ctx.createOscillator(); o.type = C.wave; o.frequency.setValueAtTime(f, t0); if (kind === 'bump') o.frequency.exponentialRampToValueAtTime(f * 0.45, t0 + len); o.connect(g); o.start(t0); o.stop(t0 + len + 0.02); } };

  let lastD: number | null = null; let lastMode = '';
  return {
    update(s, dt) {
      if (stopped) return; resume(); const t = ctx.currentTime; dt = clamp(dt || 0, 0, 0.25);
      /* bed */ const A = ambienceLevels(s); glide(bedG.gain, A.bed, t, 0.6); glide(bedLp.frequency, A.bedCut, t, 0.6); glide(surfG.gain, A.surf, t, 1); glide(roomG.gain, A.room, t, 0.6);
      hornIn -= dt; birdIn -= dt;
      if (hornIn <= 0) { if (A.horns > 0.01) horn(t + 0.02); hornIn = eventGap(A.horns, 9) * (0.5 + Math.random()); if (!isFinite(hornIn)) hornIn = 3; }
      if (birdIn <= 0) { if (A.birds > 0.01) bird(t + 0.02); birdIn = eventGap(A.birds, 5) * (0.5 + Math.random()); if (!isFinite(birdIn)) birdIn = 3; }
      /* footsteps: only a person on foot, in Actor mode, actually moving */
      const walking = s.mode === 'actor' && s.onFoot && !s.inCar && gaitFor(s.v) !== 'idle';
      if (walking && lastD != null && lastMode === 'actor') for (const f of footfalls(lastD, s.d, strideFor(s.v))) footstep(t + 0.01 + f * dt, s.v);
      lastD = s.d; lastMode = s.mode;
      /* engine */ const driving = s.mode === 'drive' || s.inCar; const E = engineParams(driving ? s.v : 0);
      glide(saw.frequency, E.freq, t, 0.08); glide(sq.frequency, E.freq / 2, t, 0.08); glide(rumble.frequency, 28 + E.freq * 0.25, t, 0.1);
      glide(engLp.frequency, E.cutoff, t, 0.08); glide(engG.gain, driving ? E.gain : 0, t, 0.25);
      /* traffic */ const near = nearestCars(s.nearCars ?? [], s.camPos, voices.length); const yaw = s.yaw ?? 0;
      voices.forEach((vc, i) => { const c = near[i]; if (!c) { glide(vc.g.gain, 0, t, 0.3); return; }
        const k = doppler(c.pos, c.vel, s.camPos); const sp = Math.hypot(c.vel[0], c.vel[2]); const L = passLevel(c.r) * clamp(0.25 + sp / 14, 0, 1);
        glide(vc.g.gain, L * 0.6, t, 0.15); glide(vc.bp.frequency, (650 + sp * 25) * k, t, 0.08); glide(vc.o.frequency, (55 + sp * 2.2) * k, t, 0.08); glide(vc.pan.pan, panFor(c.pos, s.camPos, yaw), t, 0.08); });
    },
    cue(kind) { if (stopped || muted) return; resume(); try { cue(kind); } catch { /* a cue is a nicety */ } },
    setMuted(b) { muted = b; if (!stopped) glide(master.gain, level(), ctx.currentTime, 0.08); },
    stop() { if (stopped) return; stopped = true; window.removeEventListener('pointerdown', gesture, true); window.removeEventListener('keydown', gesture, true);
      const t = ctx.currentTime; try { master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(0, t, 0.04); } catch { /* closed */ }
      setTimeout(() => { for (const n of sources) { try { n.stop(); } catch { /* already stopped */ } try { n.disconnect(); } catch { /* gone */ } } sources.length = 0; void ctx.close().catch(() => {}); }, 180); },
  };
}

