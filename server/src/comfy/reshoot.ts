import { env } from '../env.js';
/**
 * Re-shoot on ComfyUI. Default engine: LTX-2 pose IC-LoRA + camera-control LoRA (workflows/reshoot-api.json):
 * per angle range, the source range drives the motion (pose guide) and the LoRA moves the camera.
 * Fallback: Wan 2.2 Fun Camera from the range's first frame (reshoot-funcamera-api.json), selected with
 * provider `comfy-funcamera` or OPENHIGGSFIELD_RESHOOT_ENGINE=funcamera. OPENHIGGSFIELD_BACKEND=comfy only.
 */
import type { FunPose } from './cameraPresets.js';
export type ReshootEngine = 'ltx' | 'funcamera';
export const reshootEngine = (provider?: string): ReshootEngine =>
  provider === 'comfy-funcamera' || env('RESHOOT_ENGINE') === 'funcamera' ? 'funcamera' : 'ltx'; // K4: LTX-2 stays the default in open-weights-only mode too
const L = (k: string) => `ltx-2-19b-lora-camera-control-${k}.safetensors`;
/** Angle presets (tools/reshoot.ts) → LTX camera LoRA / Fun Camera pose. */
export const ANGLE_MAP: Record<string, { ltx: string; fun: FunPose; hint: string }> = {
  'left side': { ltx: L('dolly-left'), fun: 'Pan Left', hint: 'the camera moves to the left side of the subject' },
  'right side': { ltx: L('dolly-right'), fun: 'Pan Right', hint: 'the camera moves to the right side of the subject' },
  'low angle': { ltx: L('jib-down'), fun: 'Pan Up', hint: 'low angle looking up at the subject' },
  'high angle': { ltx: L('jib-up'), fun: 'Pan Down', hint: 'high angle looking down at the subject' },
  'close-up': { ltx: L('dolly-in'), fun: 'Zoom In', hint: 'close-up on the subject' },
  'over the shoulder': { ltx: L('dolly-in'), fun: 'Zoom In', hint: 'over-the-shoulder framing' },
  'slow push in': { ltx: L('dolly-in'), fun: 'Zoom In', hint: 'slow push in' },
  'orbit left': { ltx: L('dolly-left'), fun: 'Anti Clockwise (ACW)', hint: 'orbit to the left around the subject' },
};
/** angle = a preset label, or a phrase (custom yaw/tilt, free text); preset = the nearest pad preset for a custom yaw/tilt (its LoRA / pose, the phrase as hint). */
export const angleParams = (angle: string, preset?: string | null) => ANGLE_MAP[angle.toLowerCase()] ?? (preset && ANGLE_MAP[preset.toLowerCase()] ? { ...ANGLE_MAP[preset.toLowerCase()], hint: angle } : { ltx: L('static'), fun: 'Static' as FunPose, hint: angle });
/** LTX frames for a range: 8n+1 at 24 fps. */
export const ltxFrames = (seconds: number) => Math.max(9, Math.round((seconds * 24) / 8) * 8 + 1);
/** Patch reshoot-api.json (LTX) for one angle range. */
export function patchReshootLtx(graph: Record<string, any>, v: { video: unknown; startImage: unknown; prompt: string; angle: string; preset?: string | null; seconds: number; seed: number }) {
  const g = structuredClone(graph); const a = angleParams(v.angle, v.preset);
  g['185'].inputs.file = v.video; g['160'].inputs.image = v.startImage;
  g['143:124'].inputs.text = `${v.prompt ? v.prompt + '. ' : ''}${a.hint}`;
  g['300'].inputs.lora_name = a.ltx; g['168'].inputs.value = ltxFrames(v.seconds);
  for (const k of ['143:126', '143:187']) if (g[k]) g[k].inputs.noise_seed = Math.max(0, Math.floor(v.seed));
  return g;
}
