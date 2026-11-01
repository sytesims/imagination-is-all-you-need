/**
 * The words in front of a video run's prompt (2026-10-29): one rule and one table, used by the job (tools/media.ts parseInput) and so by the
 * "What will be sent" peek, which runs the same parseInput.
 *  - A prompt already in a model's structured format goes as written (MiniMax H3's official fields).
 *  - Image modes (start frame, start + end frame, reference): the mode phrase is added only when the prompt doesn't already speak about its
 *    image or frames ("image", "photo", "first frame", <Picture 1>, @image1 …). A small word list, no guessing.
 *  - Per-model wording (MODEL_WORDS): MiniMax H3's own image-alignment line on the routes that run the H3 weights (its base-mode I2VA format:
 *    the line first, then a blank line; docs.comfy.org tutorials/video/minimax/minimax-h3-prompt-guide, "I2VA opens with a fixed image-alignment
 *    line", wording from MiniMax's VIDEO_PROMPT_WRITING_GUIDE_base_en). H3 Fast takes the start frame as the look and never names it: no phrase.
 *    Every other model keeps the short generic phrase.
 *  - The H3 line stays unless the prompt already anchors <Picture N> itself (h3Anchored); a loose "image" or "photo" does not (2026-10-31).
 *  - Image to video with no prompt sends the model family's default (shared/promptPatterns.ts), never a near-empty prompt. The job keeps the typed words in `prompt` (Recreate).
 */
import { fillPattern } from './promptPatterns.js';

/** A prompt written in a model's own structured format (MiniMax H3's official fields): send it exactly as written. */
export const structuredPrompt = (p: string) => /^\s*For the target video,|^\s*How the reference pictures align|integrated_multimodal_description\s*:|(^|\n)\s*(subject_definitions|detailed_description)\s*:/i.test(p); // + the full-reference / multiframe fields (subject_definitions:, detailed_description:), docs.comfy.org minimax-h3-multiframe

/** Image to video with an empty prompt: the generic default, and each family's own (shared/promptPatterns.ts i2v-default: Wan motion + "Fixed camera",
 *  LTX a present-tense paragraph, H3 motion + a static camera after its alignment line). */
export const I2V_DEFAULT_PROMPT = fillPattern('i2v-default', null);
export const i2vDefaultFor = (model?: string | null) => fillPattern('i2v-default', model);
/** MiniMax H3 I2VA: the start frame is <Picture 1>, fully used at 0 s (its documented first line). */
export const H3_I2V_LINE = 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.';

/** The video modes that take an image, with their generic phrase. */
export const IMAGE_MODE_PHRASES: Record<string, string> = { i2v: 'animate the image', flf: 'move from the start frame to the end frame', r2v: 'keep the referenced subject' };

/** The prompt already anchors a picture the H3 way ("<Picture 1> (from [Shot 1]) is fully referenced", "… aligns with the 0.00-second mark"). A loose
 *  "image" or "photo" is not an anchor, so H3's own line stays (MiniMax H3 base-en I2VA). */
export const h3Anchored = (p: string) => /<picture\s*\d+>[^\n]*?\b(is fully referenced|aligns with)\b/i.test(p);

/** The prompt already speaks about its image(s) or frames. */
export const mentionsImage = (p: string) =>
  /\b(images?|pictures?|photos?|photographs?|(first|start|starting|opening|end|ending|last|final) frames?|keyframes?)\b|<picture\s*\d+>|@image\s*\d*|\bimage\s*\d+\b/i.test(p);

type Words = { text: string; sep: string } | null;
const H3_LINE: Words = { text: H3_I2V_LINE, sep: '\n\n' };
/** provider → mode → the words in front (null = none: the model uses the image on its own). Missing = the generic phrase. */
export const MODEL_WORDS: Record<string, Partial<Record<string, Words>>> = {
  'comfy-h3': { i2v: H3_LINE }, 'cloud-h3': { i2v: H3_LINE }, 'cloud-h3-wf': { i2v: H3_LINE }, // the H3 weights (MiniMaxH3ImageToVideo / Comfy Cloud's H3 node)
  'cloud-h3-fast': { i2v: null },
  'cloud-h3-pika': { i2v: H3_LINE, flf: null }, 'comfy-h3-pika': { i2v: H3_LINE, flf: null }, // Pika H3 Flex: the H3 first-frame line; start + end gets the fl2va template's own line in the plan (comfy/pikaH3Flex.ts) // FastH3: the start frame sets the look, never named in the prompt (shared/promptGrammar.ts minimax-h3-fast)
};

/** The prompt a run sends: the mode's words (when needed), the prompt (or the model's default), the look's words. `model` = the PROMPT_GRAMMAR key. */
export function assemblePrompt(a: { mode: string; modePhrase?: string; prompt: string; style?: string | null; provider?: string | null; model?: string | null }): string {
  const typed = a.prompt.trim(); const join = (...x: (string | null | undefined)[]) => x.filter(Boolean).join('. ');
  if (structuredPrompt(typed)) return join(typed, a.style);
  if (!(a.mode in IMAGE_MODE_PHRASES)) return join(a.modePhrase, typed, a.style); // other modes: as before
  const fallback = !typed && a.mode === 'i2v'; const body = typed || (fallback ? i2vDefaultFor(a.model) : ''); const rest = join(body, a.style);
  const own = a.provider ? MODEL_WORDS[a.provider] : undefined;
  if (own && a.mode in own) { const w = own[a.mode]; return !w || h3Anchored(body) ? rest : rest ? `${w.text}${w.sep}${rest}` : w.text; } // the model's own line (H3), unless already anchored
  if (fallback || mentionsImage(body)) return rest; // a default is written for the model; a prompt that names its image needs no phrase
  const text = a.modePhrase || IMAGE_MODE_PHRASES[a.mode];
  return rest ? `${text}. ${rest}` : text;
}
