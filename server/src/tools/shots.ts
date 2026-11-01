/**
 * Shots (app-shots) and Face Swap (app-face-swap): data for the two image apps on Create Image (tools/apps.ts APP_GALLERY).
 * Our own ids, labels and prompt wording (clean room). Shots = one output per picked camera angle, each with its own prompt,
 * priced N × the one-image price (routing/select.ts routeCredits reads gallery.perOutput.max). No new weights by default:
 * the camera instruction goes into the edit prompt of an image-edit model (Qwen-Image-Edit-2509, Nano Banana 2, FLUX 3 Klein).
 * Each view is worded for the model's family (shared/promptPatterns.ts camera-angle, 2026-11-01): one view phrase, the subject repeated,
 * and a style-neutral keep (the photo sets the style). The optional local route `comfy-qwen-angles` adds the Apache-2.0 multiple-angles LoRA
 * (dx8152/Qwen-Edit-2509-Multiple-angles): views with a command on its card lead with that sentence, byte for byte.
 */
import type { AppOption } from './appRows.js';
import { fillPattern, familyOfProvider, loraSentence } from '../shared/promptPatterns.js';

export interface ShotAngle extends AppOption { value: string; label: string; description: string; /** the view's words, read after "show the subject …" / "seen …" */ prompt: string; /** Mock render only: an ffmpeg filter that hints at the view (never shown as a real result). */ mockVf: string }
const shot = (value: string, label: string, description: string, prompt: string, mockVf: string): ShotAngle => ({ value, label, description, prompt, mockVf, poster: null, preview: null });

const LORA = 'qwen-image-edit-2509-angles';
/** Every view, in grid order (3 × 3, then the two extra views). prompt = the view phrase every family's camera-angle template reads. */
export const SHOT_ANGLES: ShotAngle[] = [
  shot('front', 'Front', 'Straight on, eye level', 'straight on at eye level, from the waist up', ''),
  shot('three-quarter-left', '¾ left', 'Turned 45° to the left', 'from a camera moved 45° to their left, a three-quarter view', 'crop=iw*0.82:ih:0:0'),
  shot('three-quarter-right', '¾ right', 'Turned 45° to the right', 'from a camera moved 45° to their right, a three-quarter view', 'crop=iw*0.82:ih:iw*0.18:0'),
  shot('side', 'Side', 'Profile, 90° round', 'in full side profile, from a camera moved 90° to the side', 'hflip'),
  shot('back', 'Back', 'From behind the subject', 'from directly behind, a view of their back', 'hflip,eq=brightness=-0.12'),
  shot('low', 'Low angle', 'Below, looking up', 'from a camera below chest height, looking up', 'crop=iw:ih*0.84:0:ih*0.16'),
  shot('high', 'High angle', 'Above, looking down', 'from a camera held above eye level, looking down like a selfie', 'crop=iw:ih*0.84:0:0'),
  shot('close-up', 'Close-up', 'Tight on the face or detail', 'in a close-up of the face and shoulders', 'crop=iw*0.5:ih*0.5:iw*0.25:ih*0.25'),
  shot('wide', 'Wide', 'Whole subject and more scene', 'in a wide shot with all of them and more of the place in frame', 'scale=trunc(iw*0.7/2)*2:trunc(ih*0.7/2)*2,pad=trunc(iw/0.7/2)*2:trunc(ih/0.7/2)*2:(ow-iw)/2:(oh-ih)/2:color=0x1d1d1d'),
  shot('over-shoulder', 'Over the shoulder', 'From behind, glancing back', 'from just behind their shoulder as they glance back at the camera', 'hflip,crop=iw*0.82:ih:0:0'),
  shot('full-body', 'Full body', 'Head to feet, shoes in frame', 'in full body from head to feet, with the outfit and shoes in frame', 'scale=trunc(iw*0.8/2)*2:trunc(ih*0.8/2)*2,pad=trunc(iw/0.8/2)*2:trunc(ih/0.8/2)*2:(ow-iw)/2:(oh-ih)/2:color=0x1d1d1d'),
];
export const SHOT_IDS = SHOT_ANGLES.map((s) => s.value);
/** What a blank pick runs: the nine views of the 3 × 3 grid (Over the shoulder and Full body are opt-in). */
export const SHOT_DEFAULTS = SHOT_IDS.slice(0, 9);
/** One view's edit prompt for the engine that runs it: the family's camera-angle wording, or the LoRA's trained sentence first on its own route. */
export const shotPrompt = (angle: ShotAngle, subject: string, provider?: string | null) => {
  const id = subject.trim().replace(/[.;,\s]+$/, ''); const trained = provider === 'comfy-qwen-angles' ? loraSentence('camera-angle', LORA, angle.value) : null;
  return trained ? fillPattern('camera-angle', LORA, { sentence: trained, id }) : fillPattern('camera-angle', familyOfProvider(provider), { view: angle.prompt, id });
};
/** Parse the `shots` field: JSON array or comma list; blank = the nine defaults. Unknown ids → error (never echoed raw). */
export function parseShots(raw: unknown): { ids: string[] } | { error: string; code: string } {
  const s = String(raw ?? '').trim(); if (!s) return { ids: [...SHOT_DEFAULTS] };
  let xs: unknown; try { xs = JSON.parse(s); } catch { xs = s.split(','); }
  const ids = [...new Set((Array.isArray(xs) ? xs : [xs]).map((x) => String(x).trim()).filter(Boolean))];
  if (!ids.length) return { error: 'Pick at least one angle.', code: 'required' };
  if (ids.some((x) => !SHOT_IDS.includes(x))) return { error: `That angle isn't on the list. Pick from: ${SHOT_ANGLES.map((a) => a.label).join(', ')}.`, code: 'invalid' };
  return { ids: SHOT_ANGLES.filter((a) => ids.includes(a.value)).map((a) => a.value) }; // grid order, whatever order was sent
}
/** Apps that show the web's branded stand-in until their own poster is dropped at web/public/examples/tools/<id>.jpg (no title-card request, so no 404). */
export const POSTER_STAND_IN = new Set(['app-face-swap', 'app-shots', 'app-person-swap']);
export const SHOT_MOCK_VF: Record<string, string> = Object.fromEntries(SHOT_ANGLES.map((a) => [a.value, a.mockVf]));

/** Face Swap and Person Swap (2026-11-01): the wording is the prompt pattern registry's face-swap / person-swap rows (shared/promptPatterns.ts),
 *  one shared row plus GPT Image and Nano Banana rows; image 1 = the target photo, image 2 = the face / person. The user's touch-ups follow as a sentence.
 *  Person Swap, "Use the person's outfit" (the default): what comes from the person. */
export const PERSON_SWAP_WHO = 'face, hair, body and outfit';
/** Person Swap, "Keep the photo's outfit" (2026-11-01, the Outfit choice): the slot words for the prompt pattern registry's person-swap row
 *  (shared/promptPatterns.ts): what to take from the person, and the outfit clause. "Refitted naturally to their body" so a new body shape doesn't
 *  fight "keep the outfit"; "of image 1", never "image 1's" (tag models turn it into "<image1>'s"). No "expression": holding it fights the identity. */
export const PERSON_SWAP_KEEP_OUTFIT_WHO = 'face, hair, skin tone and body shape';
export const PERSON_SWAP_KEEP_OUTFIT = 'Keep the outfit and accessories of image 1 (glasses, sunglasses, jewellery, bags), refitted naturally to their body.';
/** Person Swap's Outfit choice: 'person' (the default, today's swap: the outfit comes from image 2) or 'keep' (the outfit of image 1 stays). */
export const PERSON_SWAP_OUTFITS = [{ value: 'person', label: "Use the person's outfit" }, { value: 'keep', label: "Keep the photo's outfit" }];
