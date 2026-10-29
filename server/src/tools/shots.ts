/**
 * Shots (app-shots) and Face Swap (app-face-swap): data for the two image apps on Create Image (tools/apps.ts APP_GALLERY).
 * Our own ids, labels and prompt wording (clean room). Shots = one output per picked camera angle, each with its own prompt,
 * priced N × the one-image price (routing/select.ts routeCredits reads gallery.perOutput.max). No new weights by default:
 * the camera instruction goes into the edit prompt of an image-edit model (Qwen-Image-Edit-2509, Nano Banana 2, FLUX 3 Klein).
 * The optional local route `comfy-qwen-angles` adds the Apache-2.0 multiple-angles LoRA (dx8152/Qwen-Edit-2509-Multiple-angles),
 * whose documented instructions ("Rotate the camera 45 degrees to the left.", "Turn the camera to a close-up.") lead each prompt below.
 */
import type { AppOption } from './appRows.js';

export interface ShotAngle extends AppOption { value: string; label: string; description: string; prompt: string; /** Mock render only: an ffmpeg filter that hints at the view (never shown as a real result). */ mockVf: string }
const shot = (value: string, label: string, description: string, prompt: string, mockVf: string): ShotAngle => ({ value, label, description, prompt, mockVf, poster: null, preview: null });

/** The nine default views, in grid order (3 × 3). */
export const SHOT_ANGLES: ShotAngle[] = [
  shot('front', 'Front', 'Straight on, eye level', 'Move the camera to face the subject straight on at eye level: a front view', ''),
  shot('three-quarter-left', '¾ left', 'Turned 45° to the left', 'Rotate the camera 45 degrees to the left around the subject: a three-quarter view', 'crop=iw*0.82:ih:0:0'),
  shot('three-quarter-right', '¾ right', 'Turned 45° to the right', 'Rotate the camera 45 degrees to the right around the subject: a three-quarter view', 'crop=iw*0.82:ih:iw*0.18:0'),
  shot('side', 'Side', 'Profile, 90° round', 'Rotate the camera 90 degrees to the left around the subject: a side profile view', 'hflip'),
  shot('back', 'Back', 'From behind the subject', 'Move the camera behind the subject: a view of the subject from the back', 'hflip,eq=brightness=-0.12'),
  shot('low', 'Low angle', 'Below, looking up', 'Lower the camera and tilt it up at the subject: a low-angle shot', 'crop=iw:ih*0.84:0:ih*0.16'),
  shot('high', 'High angle', 'Above, looking down', 'Raise the camera and look down at the subject: a high-angle shot', 'crop=iw:ih*0.84:0:0'),
  shot('close-up', 'Close-up', 'Tight on the face or detail', 'Turn the camera to a close-up of the subject', 'crop=iw*0.5:ih*0.5:iw*0.25:ih*0.25'),
  shot('wide', 'Wide', 'Whole subject and more scene', 'Turn the camera to a wide-angle lens: a wide shot that shows the whole subject and more of the scene', 'scale=trunc(iw*0.7/2)*2:trunc(ih*0.7/2)*2,pad=trunc(iw/0.7/2)*2:trunc(ih/0.7/2)*2:(ow-iw)/2:(oh-ih)/2:color=0x1d1d1d'),
];
export const SHOT_IDS = SHOT_ANGLES.map((s) => s.value);
/** Keeps every view the same subject in the same scene (appended to each angle). */
export const SHOT_KEEP = 'same subject and same scene as the photo; keep identity, face, clothing, colours and lighting consistent; photorealistic';
export const shotPrompt = (angle: ShotAngle, subject: string) =>
  [angle.prompt, subject.trim() ? `the subject: ${subject.trim().replace(/[.;,]+$/, '')}` : '', SHOT_KEEP].filter(Boolean).join('; ');
/** Parse the `shots` field: JSON array or comma list; blank = all nine. Unknown ids → error (never echoed raw). */
export function parseShots(raw: unknown): { ids: string[] } | { error: string; code: string } {
  const s = String(raw ?? '').trim(); if (!s) return { ids: [...SHOT_IDS] };
  let xs: unknown; try { xs = JSON.parse(s); } catch { xs = s.split(','); }
  const ids = [...new Set((Array.isArray(xs) ? xs : [xs]).map((x) => String(x).trim()).filter(Boolean))];
  if (!ids.length) return { error: 'Pick at least one angle.', code: 'required' };
  if (ids.some((x) => !SHOT_IDS.includes(x))) return { error: `That angle isn't on the list. Pick from: ${SHOT_ANGLES.map((a) => a.label).join(', ')}.`, code: 'invalid' };
  return { ids: SHOT_ANGLES.filter((a) => ids.includes(a.value)).map((a) => a.value) }; // grid order, whatever order was sent
}
/** Apps that show the web's branded stand-in until their own poster is dropped at web/public/examples/tools/<id>.jpg (no title-card request, so no 404). */
export const POSTER_STAND_IN = new Set(['app-face-swap', 'app-shots', 'app-person-swap']);
export const SHOT_MOCK_VF: Record<string, string> = Object.fromEntries(SHOT_ANGLES.map((a) => [a.value, a.mockVf]));

/** Face Swap: the edit instruction (image 1 = target photo, image 2 = face). The user's touch-ups follow it. */
export const FACE_SWAP_PROMPT = 'Replace the face of the person in image 1 with the face of the person in image 2, so the person in image 1 has the identity of image 2';
export const FACE_SWAP_KEEP = "keep image 1's pose, head angle, expression, hair, body, clothing, lighting, colours and background exactly as they are; blend skin tone and light naturally";

/** Person Swap: the edit instruction (image 1 = target photo, image 2 = the person to put in). The user's touch-ups follow it. */
export const PERSON_SWAP_PROMPT = 'Replace the person in image 1 with the person from image 2: their face, hair, body and outfit, so the person in image 1 becomes the person from image 2';
export const PERSON_SWAP_KEEP = "keep image 1's pose, framing, camera angle, lighting, colours and background exactly as they are; match the light and grain of image 1";
