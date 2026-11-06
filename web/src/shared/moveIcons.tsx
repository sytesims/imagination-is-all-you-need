/**
 * One line icon per camera move (the Presets picker's Camera tab, the Camera Moves gallery): each move its OWN drawing, so no two tiles
 * look alike, plus the small hover motion that says how it moves (`anim`, keyframes `mvi-<anim>` in presetTile.css).
 * 48×48 grid, drawn with strokes in currentColor. Pure drawings; no photos, no footage.
 */
import type { ReactNode } from 'react';

export type MoveAnim = 'l' | 'r' | 'u' | 'd' | 'in' | 'out' | 'spin' | 'spin-rev' | 'rock' | 'shake' | 'pulse' | 'tilt' | 'blink' | 'breathe';
export interface MoveIcon { draw: ReactNode; anim: MoveAnim }

/* ---- path helpers (strings, so the drawings stay short) */
const head = (x: number, y: number, deg: number, s = 5) => {
  const a = (deg * Math.PI) / 180, b = 0.62;
  const p = (t: number) => `${(x - s * Math.cos(a + t)).toFixed(1)} ${(y - s * Math.sin(a + t)).toFixed(1)}`;
  return `M${p(b)}L${x} ${y}L${p(-b)}`;
};
const ar = (x1: number, y1: number, x2: number, y2: number, s = 5) => `M${x1} ${y1}L${x2} ${y2}${head(x2, y2, (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI, s)}`;
/** a small camera at x,y facing right (or left) */
const cam = (x: number, y: number, left = false) => left
  ? `M${x} ${y}h10v8h-10zM${x} ${y + 2}l-4-2v8l4-2`
  : `M${x} ${y}h10v8h-10zM${x + 10} ${y + 2}l4-2v8l-4-2`;
/** a person, head centre x,y (scale s) */
const Person = ({ x = 24, y = 20, s = 1, dash }: { x?: number; y?: number; s?: number; dash?: boolean }) => <g strokeDasharray={dash ? '2 2.4' : undefined}>
  <circle cx={x} cy={y} r={3.4 * s} /><path d={`M${x - 7 * s} ${y + 13 * s}c0-4.6 3.1-7.6 ${7 * s} -7.6s${7 * s} 3 ${7 * s} 7.6`} /></g>;
const P = (d: string) => <path d={d} />;
const frame = 'M8 14V9h5M35 9h5v5M40 34v5h-5M13 39H8v-5';
const mag = (x: number, y: number, r = 9) => `M${x + r} ${y}a${r} ${r} 0 1 1-${2 * r} 0a${r} ${r} 0 1 1 ${2 * r} 0M${x + r * 0.72} ${y + r * 0.72}l7 7`;
const drone = (x: number, y: number) => `M${x - 7} ${y - 4}l14 8M${x + 7} ${y - 4}l-14 8M${x - 9} ${y - 5}h4M${x + 5} ${y - 5}h4M${x - 9} ${y + 5}h4M${x + 5} ${y + 5}h4`;
const clock = (x: number, y: number, r = 6) => `M${x + r} ${y}a${r} ${r} 0 1 1-${2 * r} 0a${r} ${r} 0 1 1 ${2 * r} 0M${x} ${y - r + 2.4}V${y}l2.6 2`;
const spark = (x: number, y: number, r = 5) => `M${x} ${y - r}q.8 ${r - 1} ${r} ${r}q${1 - r} .8-${r} ${r}q-.8-${r - 1}-${r}-${r}q${r - 1}-.8 ${r}-${r}z`;
const car = (x: number, y: number) => `M${x} ${y}h18v-4l-4-5h-9l-4 5h-1zM${x + 4} ${y}m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M${x + 14} ${y}m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0`;
const ell = (cx: number, cy: number, rx: number, ry: number) => `M${cx + rx} ${cy}a${rx} ${ry} 0 1 1-${2 * rx} 0a${rx} ${ry} 0 1 1 ${2 * rx} 0`;

const I = (anim: MoveAnim, ...parts: ReactNode[]): MoveIcon => ({ anim, draw: <>{parts.map((p, i) => <g key={i}>{p}</g>)}</> });

/** Every camera move id in the Presets picker (GET /api/presets?toolId=camera, minus Free and the LTX / H3 moves) → its icon. */
export const MOVE_ICONS: Record<string, MoveIcon> = {
  // basic
  static: I('breathe', P(cam(17, 10)), P('M22 18v6M22 24l-8 15M22 24l8 15M22 24v15'), P('M36 14h6M36 20h6')),
  'push-in': I('r', P(cam(4, 20)), P(ar(20, 24, 31, 24)), <Person x={39} y={18} s={0.85} />),
  'pull-out': I('r', <Person x={9} y={18} s={0.85} />, P(cam(22, 20, true)), P(ar(34, 24, 44, 24))),
  'track-left': I('l', <Person y={13} s={0.8} />, P('M6 40h36M6 44h36'), P(ar(36, 33, 12, 33))),
  'track-right': I('r', <Person y={13} s={0.8} />, P('M6 40h36M6 44h36'), P(ar(12, 33, 36, 33))),
  'pan-left': I('rock', P('M24 40v-8'), P('M20 40h8'), P(cam(19, 24)), P('M36 18a16 16 0 0 0-24 0'), P(head(12, 18, 135))),
  'pan-right': I('rock', P('M24 40v-8'), P('M20 40h8'), P(cam(19, 24)), P('M12 18a16 16 0 0 1 24 0'), P(head(36, 18, 45))),
  'tilt-up': I('u', P(cam(8, 22)), P('M13 30v10M9 40h8'), P('M30 36a14 14 0 0 0 0-22'), P(head(30, 14, -100))),
  'tilt-down': I('d', P(cam(8, 18)), P('M13 26v14M9 40h8'), P('M30 12a14 14 0 0 1 0 22'), P(head(30, 34, 100))),
  'zoom-in': I('in', P(mag(20, 20)), P('M16 20h8M20 16v8')),
  'zoom-out': I('out', P(mag(20, 20)), P('M16 20h8')),
  handheld: I('shake', P(cam(16, 14)), P('M20 22v4'), P('M14 30q4-4 8 0t8 0t8 0M14 36q4-4 8 0t8 0t8 0')),
  'jib-up': I('u', P('M8 40h12M14 40V30'), P('M8 34l28-10'), P(cam(32, 16)), P(ar(42, 14, 42, 5))),
  'jib-down': I('d', P('M8 40h12M14 40V30'), P('M8 34l28-10'), P(cam(32, 16)), P(ar(42, 27, 42, 38))),
  // zoom
  'snap-zoom': I('pulse', P(mag(24, 22, 8)), P('M6 12l6 4M4 22h7M6 32l6-4')),
  'snap-in': I('in', P('M8 8l9 9M17 11v6h-6M40 8l-9 9M31 11v6h6M8 40l9-9M17 37v-6h-6M40 40l-9-9M31 37v-6h6'), P('M25 18l-4 7h6l-4 7')),
  'snap-out': I('out', P('M17 17L8 8M8 14V8h6M31 17l9-9M34 8h6v6M17 31l-9 9M8 34v6h6M31 31l9 9M40 34v6h-6'), P('M25 18l-4 7h6l-4 7')),
  yoyo: I('pulse', P(ar(17, 31, 8, 40)), P(ar(31, 17, 40, 8)), P('M17 31l14-14'), P(ell(24, 24, 5, 5))),
  vertigo: I('in', P('M6 6h36v36H6z'), P('M6 6l11 11M42 6L31 17M6 42l11-11M42 42L31 31'), P('M17 17h14v14H17z'), <Person y={21} s={0.45} />),
  'vertigo-out': I('out', P('M15 15h18v18H15z'), P('M15 15L6 6M33 15l9-9M15 33l-9 9M33 33l9 9'), P('M6 6h6M6 6v6M42 6h-6M42 6v6M6 42h6M6 42v-6M42 42h-6M42 42v-6'), <Person y={21} s={0.45} />),
  'double-push': I('r', P('M8 14l10 10-10 10M18 14l10 10-10 10'), <Person x={38} y={18} s={0.8} />),
  'eye-push': I('in', P('M6 24q18-16 36 0q-18 16-36 0z'), P(ell(24, 24, 5, 5)), P('M24 24h.01')),
  'mouth-push': I('in', P('M8 24q8-8 16-4q8-4 16 4q-8 10-16 10t-16-10z'), P('M8 24q16 4 32 0')),
  'bite-zoom': I('pulse', P('M8 16h32v16H8z'), P('M8 16l4 6 4-6 4 6 4-6 4 6 4-6 4 6 4-6M8 32l4-6 4 6 4-6 4 6 4-6 4 6 4-6 4 6'), P('M4 10l4 4M44 10l-4 4')),
  // lens
  'focus-pull': I('blink', P(ell(14, 24, 7, 7)), <g strokeDasharray="2.2 2.4">{P(ell(34, 24, 7, 7))}</g>, P(ar(22, 24, 26, 24, 3))),
  fisheye: I('breathe', P(ell(24, 24, 17, 17)), P('M24 7q-10 17 0 34M24 7q10 17 0 34M7 24q17-10 34 0M7 24q17 10 34 0')),
  'slow-shutter': I('l', <Person x={32} y={17} s={0.9} />, P('M6 20h12M4 26h14M8 32h10'), <g opacity=".45"><Person x={24} y={17} s={0.9} /></g>),
  // framing
  dutch: I('tilt', <g transform="rotate(-14 24 24)">{P('M8 12h32v24H8z')}{P('M8 28h32')}</g>, <Person y={20} s={0.6} />),
  overhead: I('d', P(cam(17, 4)), P(ar(22, 14, 22, 26, 4)), P(ell(22, 36, 10, 6)), P(ell(22, 36, 3.2, 3.2))),
  pov: I('breathe', P('M4 24q8-8 16 0q-8 8-16 0z'), P(ell(12, 24, 2.4, 2.4)), P('M20 20l22-12M20 28l22 12'), P('M42 8v32')),
  'low-hero': I('u', <Person x={30} y={10} s={1.1} />, P(cam(4, 36)), P(ar(18, 36, 26, 28, 4))),
  'high-down': I('d', P(cam(4, 6)), P(ar(18, 14, 26, 22, 4)), <Person x={32} y={30} s={0.6} />),
  ots: I('r', P('M4 44c0-10 4-16 10-16s10 6 10 16'), P(ell(14, 20, 6, 6)), <Person x={36} y={16} s={0.6} />),
  // orbit: each its own drawing
  'orbit-l': I('spin-rev', <Person y={14} s={0.8} />, P('M38 34a14 6 0 0 1-28 0'), P(head(10, 34, -95))),
  orbit: I('spin', <Person y={12} s={0.8} />, P('M8 32a16 7 0 0 0 32 0'), P(head(40, 32, -80)), P('M40 32a16 7 0 0 0-32 0'), P('M8 32h.01')),
  'orbit-360': I('spin', <Person y={21} s={0.7} />, P('M38 24a14 14 0 1 1-4-10'), P(head(34, 14, -60))),
  'spin-3d': I('spin', P('M24 6l12 6v12l-12 6-12-6V12z'), P('M12 12l12 6 12-6M24 18v12'), P('M10 36a14 5 0 0 0 28 0'), P(head(38, 36, -75, 4))),
  'time-freeze': I('spin', <Person y={18} s={0.7} />, <g strokeDasharray="2.4 2.6">{P(ell(24, 32, 16, 6))}</g>, P('M38 6v8M42 6v8')),
  bullet: I('r', P('M6 20h20q10 0 14 4q-4 4-14 4H6z'), P('M14 20v8'), <g strokeDasharray="1.5 3">{P('M6 38q18 6 36 0')}</g>),
  // crane / aerial
  'crane-up': I('u', P('M12 42V18M6 42h12'), P('M12 22l22-10'), P(cam(30, 14)), P(ar(40, 32, 40, 24, 4))),
  'crane-down': I('d', P('M12 42V18M6 42h12'), P('M12 22l22-10'), P(cam(30, 14)), P(ar(40, 26, 40, 34, 4))),
  'crane-over': I('r', <Person x={24} y={30} s={0.7} />, P('M6 22a20 16 0 0 1 36 0'), P(head(42, 22, 75))),
  'aerial-pull': I('out', P(drone(30, 14)), P(ar(24, 22, 14, 34)), P('M4 42h40')),
  fpv: I('r', P(drone(14, 22)), P(ar(26, 22, 42, 22)), P('M28 14h8M28 30h8')),
  flyover: I('r', P(drone(14, 12)), P('M4 36q6-6 12 0t12 0t12 0t12 0'), P(ar(26, 12, 42, 12, 4))),
  // transitions
  'pass-in': I('r', P('M28 8h14v32H28'), P(ar(4, 24, 36, 24))),
  'pass-out': I('r', P('M20 8H6v32h14'), P(ar(12, 24, 44, 24))),
  'fly-transition': I('r', P('M4 18h12v12H4zM32 18h12v12H32z'), P('M10 16q14-16 28 0'), P(head(38, 16, 60))),
  whip: I('r', P('M28 12h14v24H28z'), P('M4 16h18M8 24h16M4 32h18')),
  // vehicle / rig
  'car-mount': I('r', P(car(6, 34)), P(cam(26, 14)), P('M31 22v3')),
  'car-chase': I('r', P(car(2, 22)), P(car(26, 38)), P('M30 14h14M34 8h10')),
  'road-rush': I('in', P('M18 8L6 42M30 8l12 34'), P('M24 12v4M24 22v6M24 34v8')),
  'body-rig': I('shake', <Person y={12} s={0.9} />, P('M24 22v8M24 30h10'), P(cam(32, 26))),
  'robot-arm': I('rock', P('M6 42h14M13 42v-6'), P('M13 36l8-14 12 6'), P(ell(21, 22, 2, 2)), P(cam(33, 24))),
  follow: I('r', P(cam(2, 20)), P(ar(16, 24, 22, 24, 3.5)), <Person x={34} y={16} s={0.85} />),
  lead: I('r', <Person x={12} y={16} s={0.85} />, P(cam(28, 20, true)), P(ar(38, 34, 46, 34, 3.5))),
  // style / effects
  bts: I('rock', P('M8 20h32v20H8z'), P('M8 20l4-9 30-3 2 8'), P('M17 10l-3 9M27 9l-3 10M37 8l-3 11')),
  glam: I('pulse', <Person x={20} y={20} s={0.9} />, P(spark(38, 12, 6)), P(spark(36, 30, 3.5))),
  wiggle: I('shake', P('M4 24q5-10 10 0t10 0t10 0t10 0')),
  shake: I('shake', P('M24 6l3 10 9-5-4 10 10 2-9 5 6 8-10-3-1 10-5-9-7 7 1-10-9-2 8-6-6-8 10 2z')),
  'timelapse-city': I('spin', P('M4 42V26h8v16M12 42V16h10v26M22 42V22h8v20'), P(clock(38, 14, 7))),
  'timelapse-people': I('spin', <Person x={12} y={22} s={0.7} />, <Person x={26} y={22} s={0.7} />, P(clock(38, 12, 6))),
  'timelapse-glam': I('spin', P('M14 8h20M14 40h20M16 8q0 10 8 16q-8 6-8 16M32 8q0 10-8 16q8 6 8 16'), P(spark(40, 30, 4))),
  buckle: I('shake', P('M4 20h14M30 20h14M4 28h14M30 28h14'), P('M18 14h12v20H18z'), P('M22 20h4v8h-4z')),
  roll: I('spin', P('M14 16h20v16H14z'), P('M40 24a16 16 0 1 1-6-12.5'), P(head(34, 11.5, -40))),
  'beat-zoom': I('pulse', P('M16 34V12l14-4v22'), P(ell(12, 34, 4, 3)), P(ell(26, 30, 4, 3)), P('M36 16l6-4M36 24h7')),
  strobe: I('blink', P(ell(24, 24, 8, 8)), P('M24 6v4M24 38v4M6 24h4M38 24h4M11 11l3 3M34 34l3 3M37 11l-3 3M14 34l-3 3')),
};

/** Its own icon, else none (the caller falls back to the move's glyph). */
export const moveIconFor = (id?: string | null): MoveIcon | null => (id ? MOVE_ICONS[id] ?? null : null);
