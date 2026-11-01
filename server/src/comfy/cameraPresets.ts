/**
 * Camera Moves preset → workflow parameters (OPENHIGGSFIELD_BACKEND=comfy only).
 * Wan 2.2 Fun Camera (camera-moves-api.json) has 9 poses (node 108 camera_pose): Static, Pan Up/Down/Left/Right,
 * Zoom In/Out, Anti Clockwise (ACW), ClockWise (CW). A preset = 1+ segments (pose, speed) run back to back
 * (each segment starts from the previous segment's last frame) plus a prompt hint.
 * LTX presets (camera-ltx-api.json) pick an LTX-2 camera-control LoRA for node 300.
 */
import { fillPattern } from '../shared/promptPatterns.js';
import { H3_CAMERA_MOVES } from '../tools/h3/catalog.js';
export type FunPose = 'Static' | 'Pan Up' | 'Pan Down' | 'Pan Left' | 'Pan Right' | 'Zoom In' | 'Zoom Out' | 'Anti Clockwise (ACW)' | 'ClockWise (CW)';
export interface FunSegment { pose: FunPose; speed: number; share?: number }
export interface FunPreset { engine: 'funcamera'; segments: FunSegment[]; hint: string }
export interface LtxPreset { engine: 'ltx'; lora: string; strength: number; hint: string }

const seg = (pose: FunPose, speed = 1, share = 1): FunSegment => ({ pose, speed, share });
export const FUN_CAMERA_PRESETS: Record<string, FunPreset> = {
  'push-in': { engine: 'funcamera', segments: [seg('Zoom In', 0.8)], hint: 'slow dolly push in' },
  'pull-out': { engine: 'funcamera', segments: [seg('Zoom Out', 0.8)], hint: 'slow dolly pull out' },
  'pan-left': { engine: 'funcamera', segments: [seg('Pan Left')], hint: 'smooth pan left' },
  'pan-right': { engine: 'funcamera', segments: [seg('Pan Right')], hint: 'smooth pan right' },
  'tilt-up': { engine: 'funcamera', segments: [seg('Pan Up', 0.8)], hint: 'tilt up' },
  'tilt-down': { engine: 'funcamera', segments: [seg('Pan Down', 0.8)], hint: 'tilt down' },
  static: { engine: 'funcamera', segments: [seg('Static')], hint: 'locked-off tripod shot, subtle natural motion' },
  handheld: { engine: 'funcamera', segments: [seg('Pan Left', 0.2, 1), seg('Pan Right', 0.2, 1)], hint: 'gentle handheld sway' },
  'crane-up': { engine: 'funcamera', segments: [seg('Pan Up', 1.2, 2), seg('Zoom Out', 0.6, 1)], hint: 'crane rising to reveal the scene' },
  orbit: { engine: 'funcamera', segments: [seg('Pan Left', 1.2, 2), seg('Anti Clockwise (ACW)', 0.4, 1)], hint: 'orbit around the subject, parallax' },
  fpv: { engine: 'funcamera', segments: [seg('Zoom In', 2), seg('Pan Down', 1.2)], hint: 'fast fpv drone dive' },
  vertigo: { engine: 'funcamera', segments: [seg('Zoom In', 1, 1), seg('Zoom Out', 1, 1)], hint: 'dolly zoom, background stretches while the subject stays the same size' },
  flyover: { engine: 'funcamera', segments: [seg('Pan Down', 0.6, 1), seg('Zoom In', 1.2, 2)], hint: 'high aerial flyover' },
  whip: { engine: 'funcamera', segments: [seg('Static', 1, 2), seg('Pan Right', 3, 1)], hint: 'fast whip pan with motion blur' },
  'snap-zoom': { engine: 'funcamera', segments: [seg('Static', 1, 2), seg('Zoom In', 3, 1)], hint: 'sudden crash zoom' },
  shake: { engine: 'funcamera', segments: [seg('Pan Up', 0.6, 1), seg('Pan Down', 0.6, 1)], hint: 'camera shake on impact' },
  roll: { engine: 'funcamera', segments: [seg('ClockWise (CW)', 2)], hint: 'camera barrel roll' },
  'focus-pull': { engine: 'funcamera', segments: [seg('Zoom In', 0.2)], hint: 'rack focus from foreground to subject, shallow depth of field' },
  'beat-zoom': { engine: 'funcamera', segments: [seg('Zoom In', 1.5, 1), seg('Zoom Out', 1.5, 1), seg('Zoom In', 1.5, 1)], hint: 'rhythmic zoom pulses' },
  strobe: { engine: 'funcamera', segments: [seg('Zoom In', 2, 1), seg('Static', 1, 1), seg('Zoom In', 2, 1)], hint: 'quick strobe-like push cuts' },
};
const ltx = (k: string, hint: string, strength = 1): LtxPreset => ({ engine: 'ltx', lora: `ltx-2-19b-lora-camera-control-${k}.safetensors`, strength, hint });
/** Extra presets via LTX-2 camera-control LoRAs (Lightricks, LTX-2 Community License — see workflows/LICENSES.md). */
export const LTX_CAMERA_PRESETS: Record<string, LtxPreset> = {
  'ltx-dolly-in': ltx('dolly-in', 'dolly in'), 'ltx-dolly-out': ltx('dolly-out', 'dolly out'),
  'ltx-dolly-left': ltx('dolly-left', 'dolly left, parallax'), 'ltx-dolly-right': ltx('dolly-right', 'dolly right, parallax'),
  'ltx-jib-up': ltx('jib-up', 'jib up'), 'ltx-jib-down': ltx('jib-down', 'jib down'), 'ltx-static': ltx('static', 'locked-off static camera'),
};
/** The camera sentence a local move sends after the prompt (shared/promptPatterns.ts): LTX-2 = one named move ("The camera performs a single, smooth
 *  dolly in only, with parallax"), its static move and Wan Fun Camera's Static = the family's still-camera line; other Fun Camera moves keep their hint
 *  (the camera_pose input drives the move). The hint stays the pass label. */
export function cameraSentence(p: FunPreset | LtxPreset): string {
  if (p.engine === 'ltx') return p.lora.endsWith('-static.safetensors') ? fillPattern('camera-static', 'ltx-2-19b')
    : fillPattern('camera-move', 'ltx-2-19b', { move: p.hint.split(', ')[0], detail: p.hint.split(', ').slice(1).map((d) => `with ${d}`).join(' ') });
  return p.segments.every((x) => x.pose === 'Static') ? fillPattern('camera-static', 'wan-2.2-fun-camera-14b', { motion: 'subtle natural motion' }) : p.hint;
}
export const cameraPreset = (id: string): FunPreset | LtxPreset | undefined => FUN_CAMERA_PRESETS[id] ?? LTX_CAMERA_PRESETS[id];
/** The one list of the moves each graph route really runs (the plan builders read these same records: camera() below and tools/h3/plan.ts).
 *  comfy-open = your own computer: the 20 Wan 2.2 Fun Camera pose plans + the 7 LTX-2 LoRA moves; cloud-ltx-camera = the LTX graph on Comfy Cloud;
 *  comfy-h3-camera = the 7 camera_motion_h3 moves. Prompt-only cloud models (Seedance, MiniMax H3) run any other move from its words.
 *  Camera Moves lists each move's providers from this, so an unsupported move + engine pair is never offered and is refused before it runs. */
export const CAMERA_ENGINE_MOVES: Record<string, readonly string[]> = {
  'comfy-open': [...Object.keys(FUN_CAMERA_PRESETS), ...Object.keys(LTX_CAMERA_PRESETS)],
  'cloud-ltx-camera': Object.keys(LTX_CAMERA_PRESETS),
  'comfy-h3-camera': H3_CAMERA_MOVES.map(([id]) => id),
};
/** The graph routes (keys of CAMERA_ENGINE_MOVES) that run this move, in that order. */
export const cameraEnginesFor = (id: string): string[] => Object.keys(CAMERA_ENGINE_MOVES).filter((p) => CAMERA_ENGINE_MOVES[p].includes(id));

/** Frames per Fun Camera segment (4n+1, 16 fps) for a total duration, split by segment share. */
export function funSegments(p: FunPreset, seconds: number) {
  const total = Math.max(17, Math.round(seconds * 16));
  const sum = p.segments.reduce((a, s) => a + (s.share ?? 1), 0);
  return p.segments.map((s) => ({ ...s, length: Math.max(17, Math.round(((total * (s.share ?? 1)) / sum - 1) / 4) * 4 + 1) }));
}
/** Mix of up to 3 picked presets = their segments chained in pick order (LTX presets run as separate LTX passes). */
export const mixPlan = (ids: string[], seconds: number) => ids.map((id) => cameraPreset(id)).filter(Boolean).map((p) => p!.engine === 'funcamera'
  ? { engine: 'funcamera' as const, segments: funSegments(p as FunPreset, seconds / ids.length), hint: p!.hint, sentence: cameraSentence(p!) }
  : { ...(p as LtxPreset), sentence: cameraSentence(p!), frames: Math.max(9, Math.round((seconds / ids.length) * 24 / 8) * 8 + 1) });
