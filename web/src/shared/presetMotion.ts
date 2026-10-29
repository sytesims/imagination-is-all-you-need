/**
 * Camera-move previews without a generation: one data map from a preset id (or its category) to a motion recipe that
 * PresetTile / MotionPreview (shared/PresetTile.tsx) plays with CSS transforms over one of our own showcase stills.
 * A preset's real preview video always wins; this is only the stand-in when there is none.
 * Pure data (no React), so server/test/preset-motion.test.ts can check every Camera Moves id against it.
 */

/** A CSS motion (keyframes `pt-mv-<move>` in presetTile.css). */
export type MotionMove =
  | 'push' | 'pull' | 'push-fast' | 'pull-fast' | 'crash' | 'yoyo' | 'pulse'
  | 'pan-l' | 'pan-r' | 'track-l' | 'track-r' | 'tilt-u' | 'tilt-d' | 'whip'
  | 'orbit-l' | 'orbit-r' | 'orbit-360'
  | 'crane-u' | 'crane-d' | 'crane-over' | 'fpv' | 'flyover'
  | 'vertigo-in' | 'vertigo-out'
  | 'handheld' | 'shake' | 'roll' | 'dutch' | 'focus' | 'blur' | 'timelapse' | 'still';

/** The small corner icon that names the move at a glance. */
export type MotionGlyph = 'in' | 'out' | 'left' | 'right' | 'up' | 'down' | 'orbit' | 'roll' | 'shake' | 'still' | 'vertigo' | 'focus';

export interface MotionRecipe { move: MotionMove; glyph: MotionGlyph; /** where scale moves aim (CSS transform-origin), default centre */ origin?: string }

const R = (move: MotionMove, glyph: MotionGlyph, origin?: string): MotionRecipe => (origin ? { move, glyph, origin } : { move, glyph });

/** Every Camera Moves preset id (GET /api/presets?toolId=camera) → its recipe. Unknown ids fall back to the category, then to DEFAULT_MOTION. */
export const MOTION_BY_ID: Record<string, MotionRecipe> = {
  // basic
  free: R('still', 'still'), locked: R('still', 'still'), static: R('still', 'still'), 'ltx-static': R('still', 'still'),
  'push-slow': R('push', 'in'), 'push-in': R('push', 'in'), 'ltx-dolly-in': R('push', 'in'), 'h3-push-in': R('push', 'in'),
  'pull-slow': R('pull', 'out'), 'pull-out': R('pull', 'out'), 'ltx-dolly-out': R('pull', 'out'), 'h3-pull-back': R('pull', 'out'),
  'track-left': R('track-l', 'left'), 'track-right': R('track-r', 'right'), 'ltx-dolly-left': R('track-l', 'left'), 'ltx-dolly-right': R('track-r', 'right'),
  'pan-left': R('pan-l', 'left'), 'pan-right': R('pan-r', 'right'), 'h3-pan': R('pan-r', 'right'),
  'tilt-up': R('tilt-u', 'up'), 'tilt-down': R('tilt-d', 'down'),
  'zoom-in': R('push', 'in'), 'zoom-out': R('pull', 'out'),
  handheld: R('handheld', 'shake'), 'h3-handheld': R('handheld', 'shake'),
  'jib-up': R('crane-u', 'up'), 'jib-down': R('crane-d', 'down'), 'ltx-jib-up': R('crane-u', 'up'), 'ltx-jib-down': R('crane-d', 'down'),
  // zoom
  'crash-in': R('crash', 'in'), 'snap-in': R('push-fast', 'in'), 'snap-out': R('pull-fast', 'out'), 'snap-zoom': R('crash', 'in'),
  yoyo: R('yoyo', 'in'), 'double-push': R('pulse', 'in'), 'beat-zoom': R('pulse', 'in'), strobe: R('pulse', 'in'),
  'vertigo-in': R('vertigo-in', 'vertigo'), 'vertigo-out': R('vertigo-out', 'vertigo'), vertigo: R('vertigo-in', 'vertigo'),
  // close-ups: a push aimed at the face
  'eye-push': R('push-fast', 'in', '58% 14%'), 'mouth-push': R('push-fast', 'in', '56% 18%'), 'bite-zoom': R('crash', 'in', '56% 18%'),
  // lens
  'focus-pull': R('focus', 'focus'), fisheye: R('push', 'in'), 'slow-shutter': R('blur', 'focus'),
  // framing
  dutch: R('dutch', 'roll'), overhead: R('crane-over', 'down'), pov: R('handheld', 'shake'), 'low-hero': R('tilt-u', 'up'),
  'high-down': R('tilt-d', 'down'), ots: R('track-r', 'right'),
  // orbit
  'orbit-l': R('orbit-l', 'orbit'), 'orbit-r': R('orbit-r', 'orbit'), 'orbit-360': R('orbit-360', 'orbit'), orbit: R('orbit-l', 'orbit'), 'h3-orbit': R('orbit-r', 'orbit'),
  'spin-3d': R('orbit-360', 'orbit'), 'time-freeze': R('orbit-r', 'orbit'), bullet: R('orbit-l', 'orbit'),
  // crane / aerial
  'crane-up': R('crane-u', 'up'), 'crane-down': R('crane-d', 'down'), 'crane-over': R('crane-over', 'down'), 'h3-crane': R('crane-u', 'up'),
  'aerial-pull': R('pull', 'out'), 'h3-aerial': R('flyover', 'in'), fpv: R('fpv', 'in'), flyover: R('flyover', 'in'),
  // transitions
  'pass-in': R('crash', 'in'), 'pass-out': R('pull-fast', 'out'), 'fly-transition': R('fpv', 'in'), whip: R('whip', 'right'),
  // vehicle / rig
  'car-mount': R('track-l', 'left'), 'car-chase': R('fpv', 'in'), 'road-rush': R('fpv', 'in'), buckle: R('shake', 'shake'),
  'body-rig': R('handheld', 'shake'), 'robot-arm': R('orbit-r', 'orbit'), follow: R('push', 'in'), lead: R('pull', 'out'),
  // style
  bts: R('handheld', 'shake'), glam: R('push', 'in'), wiggle: R('shake', 'shake'), shake: R('shake', 'shake'), roll: R('roll', 'roll'),
  // timelapse
  'timelapse-city': R('timelapse', 'still'), 'timelapse-people': R('timelapse', 'still'), 'timelapse-glam': R('timelapse', 'still'),
};

/** A category's usual move, for ids added later that are not in MOTION_BY_ID yet. */
export const MOTION_BY_CATEGORY: Record<string, MotionRecipe> = {
  basic: R('push', 'in'), zoom: R('push-fast', 'in'), close: R('push-fast', 'in'), lens: R('focus', 'focus'), framing: R('tilt-u', 'up'),
  orbit: R('orbit-l', 'orbit'), crane: R('crane-u', 'up'), aerial: R('flyover', 'in'), transition: R('crash', 'in'), vehicle: R('fpv', 'in'),
  rig: R('handheld', 'shake'), style: R('handheld', 'shake'), timelapse: R('timelapse', 'still'), 'ltx camera': R('push', 'in'), 'h3 camera': R('push', 'in'),
};

/** Anything else: a slow push in, the most neutral camera move. */
export const DEFAULT_MOTION: MotionRecipe = R('push', 'in');

/** The recipe for a preset: by id, then by category, then the default. Never throws. */
export function motionFor(id?: string | null, category?: string | null): MotionRecipe {
  return (id && MOTION_BY_ID[id]) || (category && MOTION_BY_CATEGORY[category.trim().toLowerCase()]) || DEFAULT_MOTION;
}

/** Plain words for the move (tooltip / screen readers). */
export const MOTION_WORDS: Record<MotionGlyph, string> = {
  in: 'moves in', out: 'moves out', left: 'moves left', right: 'moves right', up: 'moves up', down: 'moves down', orbit: 'circles the subject',
  roll: 'rolls', shake: 'shakes', still: 'holds still', vertigo: 'dolly zoom', focus: 'pulls focus',
};
