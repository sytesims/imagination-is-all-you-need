/**
 * Prompt patterns (2026-10-31): WHAT sentence each model was trained to read for a task, next to shared/promptGrammar.ts (HOW it names its
 * inputs). Isomorphic (no node imports). Only the patterns our presets use today; each one cites the official source it follows.
 *
 *  - Templates write references as "image 1" / "video 1" words. shared/promptRefs.ts applyRefGrammar turns them into each model's own token at
 *    send time (<<<image_1>>>, Image 1, <Picture 1>, @Image1 …), so no template here ever holds a model token.
 *  - form: 'instruction' (edit models), 'caption' (local Wan Animate / VACE: describe the result, never "replace X with the reference"),
 *    'exact-lora-sentence' (the LoRA's trained sentence, byte for byte; extra words go after it).
 *  - keep: where the "keep …" clause goes. 'first' (Nano Banana relight), 'last' (FLUX, GPT Image, Seedream, Grok), 'none'.
 *  - negative: 'none' (never send one: FLUX.2/3, MiniMax H3), 'inert-at-cfg1' (the graph runs at CFG 1, so its negative does nothing; leave it).
 *
 * fillPattern(task, model, slots) is the one helper the presets call: it picks the model's pattern (model key, then its family, then 'any'),
 * fills {slots} and drops [optional parts] whose slots are empty.
 */

export type PatternTask = 'i2v-default' | 'camera-move' | 'camera-scene' | 'camera-static' | 'camera-enhance' | 'camera-angle' | 'video-swap' | 'video-swap-preset'
  | 'motion-transfer' | 'video-restyle' | 'relight' | 'face-swap' | 'person-swap';
export type PatternFamily = 'minimax-h3' | 'wan' | 'ltx' | 'kling' | 'seedance' | 'qwen-edit' | 'nano-banana' | 'gpt-image' | 'flux' | 'bria' | 'any';
export interface PromptPattern {
  /** a PROMPT_GRAMMAR key (shared/promptGrammar.ts), a family, or 'any' (the fallback) */
  model: string;
  task: PatternTask;
  /** {slot} = filled; [ … {slot} … ] = dropped when its slot is empty. References as "image N" words only. */
  template: string;
  keep: 'first' | 'last' | 'none';
  form: 'instruction' | 'caption' | 'exact-lora-sentence';
  negative: 'none' | 'inert-at-cfg1' | 'n/a';
  /** official sources (vendor guide, model card, Comfy template pinned to a commit) */
  sources: string[];
  checked: string;
  /** an exact-LoRA pattern's trained sentences, by our own id */
  exact?: Record<string, string>;
  note?: string;
}

const TPL = (name: string) => `https://github.com/Comfy-Org/workflow_templates/blob/c067929d7e9cc0f3fd15be348fa1a1d85da15946/templates/${name}.json`;
const H3_BASE = 'https://github.com/MiniMax-AI/MiniMax-H3/blob/main/skills/h3-prompt-writing/references/base-en.txt';
const WAN_GUIDE = 'https://www.alibabacloud.com/help/en/model-studio/text-to-video-prompt';
const LTX_GUIDE = 'https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide';
const ANGLES_2509 = 'https://huggingface.co/dx8152/Qwen-Edit-2509-Multiple-angles';
const D = '2026-10-31';

export const PROMPT_PATTERNS: PromptPattern[] = [
  // ---- image to video with an empty prompt ----
  { model: 'wan', task: 'i2v-default', form: 'caption', keep: 'none', negative: 'inert-at-cfg1', checked: D, sources: [WAN_GUIDE],
    template: 'The subject moves naturally and subtly, breathing and blinking, hair and clothes stirring slightly. Fixed camera.',
    note: 'Wan i2v: motion + camera only (the image already carries subject and style); "fixed camera" for a still shot.' },
  { model: 'ltx', task: 'i2v-default', form: 'caption', keep: 'none', negative: 'n/a', checked: D, sources: [LTX_GUIDE, TPL('video_ltx2_5_i2v')],
    template: 'Use the provided start image as the first frame. The subject moves naturally and subtly, breathing and blinking, while small details in the scene stir. The camera holds steady on the subject.',
    note: 'LTX: one present-tense paragraph; the LTX-2.5 i2v template opens with the start-image sentence.' },
  { model: 'minimax-h3', task: 'i2v-default', form: 'caption', keep: 'none', negative: 'none', checked: D, sources: [H3_BASE],
    template: 'The subject moves naturally and subtly, breathing and blinking. The camera holds a static shot.',
    note: 'Sent after H3\'s own <Picture 1> alignment line (shared/modePrompt.ts H3_I2V_LINE).' },
  { model: 'any', task: 'i2v-default', form: 'instruction', keep: 'last', negative: 'n/a', checked: D, sources: [],
    template: 'Bring this image to life with natural, subtle motion; keep the subject and framing.', note: 'Our own default for the other video models.' },

  // ---- camera moves ----
  { model: 'minimax-h3', task: 'camera-move', form: 'instruction', keep: 'none', negative: 'none', checked: D, sources: [H3_BASE],
    template: 'The camera {move}[ with {amplitude} amplitude][ at {speed} speed][ {target}].',
    note: 'Base H3 (no LoRA): type + amplitude (small | large; medium is left unwritten) + speed (slow | fast) + target. Not for the camera-motion LoRA route, whose trigger is "camera motion,".' },
  { model: 'ltx', task: 'camera-move', form: 'instruction', keep: 'none', negative: 'n/a', checked: D, sources: [TPL('video_ltx2_3_i2v'), LTX_GUIDE],
    template: 'The camera performs a single, smooth {move} only[, {detail}].', note: 'One named move relative to the subject.' },
  { model: 'ltx', task: 'camera-static', form: 'instruction', keep: 'none', negative: 'n/a', checked: D, sources: [LTX_GUIDE],
    template: 'The camera stays locked off and static, with no camera movement.', note: 'Our wording in the LTX single-move form.' },
  { model: 'wan', task: 'camera-static', form: 'caption', keep: 'none', negative: 'inert-at-cfg1', checked: D, sources: [WAN_GUIDE],
    template: 'Fixed camera[, {motion}].', note: 'Wan uses "fixed camera" for a still shot.' },
  { model: 'any', task: 'camera-enhance', form: 'caption', keep: 'none', negative: 'n/a', checked: D, sources: [],
    template: 'Cinematic, detailed, smooth motion.', note: 'The Enhance switch on Camera Moves: one plain sentence (was a "(enhanced: …)" note sent as prompt text).' },

  // Scene continuity for Photos → Reel; the selected move remains in camera-move above.
  { model: 'wan', task: 'camera-scene', form: 'caption', keep: 'none', negative: 'inert-at-cfg1', checked: D, sources: [WAN_GUIDE],
    template: 'The movement is {pace}. The photographed scene, people, objects and proportions remain consistent.' },
  { model: 'ltx', task: 'camera-scene', form: 'caption', keep: 'none', negative: 'n/a', checked: D, sources: [LTX_GUIDE],
    template: 'The movement is {pace}. The scene retains the people, objects and proportions visible in the start image.' },
  { model: 'minimax-h3', task: 'camera-scene', form: 'instruction', keep: 'last', negative: 'none', checked: D, sources: [H3_BASE],
    template: 'Keep the movement {pace}. Preserve the photographed scene, people, objects and proportions.' },
  { model: 'any', task: 'camera-scene', form: 'instruction', keep: 'last', negative: 'n/a', checked: D, sources: [],
    template: 'Keep the movement {pace}. Preserve the scene, people, objects and proportions in the photo.', note: 'Our continuity instruction for other camera models.' },

  // ---- video swap ----
  { model: 'any', task: 'video-swap-preset', form: 'instruction', keep: 'none', negative: 'n/a', checked: D,
    sources: ['https://ai.byteplus.com/ark/region:ap-southeast-1/docs/seedance-2-0-prompt-guide', H3_BASE, 'https://github.com/Comfy-Org/ComfyUI/blob/6ea48ff/comfy_api_nodes/nodes_kling.py'],
    template: 'replace {thing} with the {what} in image 1',
    note: 'Every video-edit model names its reference by slot; "image 1" becomes <<<image_1>>> (Kling), Image 1 (Seedance), <Picture 1> (H3).' },
  { model: 'wan', task: 'video-swap', form: 'caption', keep: 'none', negative: 'inert-at-cfg1', checked: D, sources: [TPL('video_wan2_2_14B_animate')],
    template: '{subject} moves naturally in the scene.',
    note: 'subject = "Who to replace" (the person on the left…), else "The character". Wan 2.2 Animate: the text captions the result ("The character is dancing in the room"); identity comes from the image, motion from the pose and face video. umT5 has no "reference image".' },
  { model: 'wan', task: 'motion-transfer', form: 'caption', keep: 'none', negative: 'inert-at-cfg1', checked: D, sources: [TPL('video_wan2_2_14B_animate')],
    template: 'The character moves naturally in the scene.', note: 'Same caption form as the swap (Wan 2.2 Animate Move mode).' },
  { model: 'wan', task: 'video-restyle', form: 'caption', keep: 'none', negative: 'inert-at-cfg1', checked: D, sources: [TPL('video_wan_vace_14B_v2v')],
    template: '{subject}, in {style} style: {traits}.',
    note: 'Wan VACE: a caption of the target clip. No "redrawn" or "keep the original motion": the control video carries the motion. The style negative runs at CFG 1.' },

  // ---- image edits ----
  { model: 'qwen-image-edit-2509-angles', task: 'camera-angle', form: 'exact-lora-sentence', keep: 'last', negative: 'n/a', checked: D,
    sources: [ANGLES_2509, TPL('templates-1_click_multiple_character_angles-v1.0')], template: '{sentence}',
    exact: { 'three-quarter-left': 'Rotate the camera 45 degrees to the left.', 'three-quarter-right': 'Rotate the camera 45 degrees to the right.',
      side: 'Rotate the camera 90 degrees to the left.', low: 'Turn the camera to a low-angle view.', 'close-up': 'Turn the camera to a close-up.', wide: 'Turn the camera to a wide-angle lens.' },
    note: '45° and close-up / wide-angle are on the 2509 LoRA card; 90° and low-angle come from the 2511 angles template (worth an A/B on 2509).' },
  { model: 'qwen-edit', task: 'relight', form: 'instruction', keep: 'last', negative: 'n/a', checked: D, sources: [TPL('image_qwen_image_edit_2509_relight')],
    template: 'Relight the scene: {light}', note: 'New light first. Only identity is locked (a light lock held the old light in our 2026-10-22 runs); the official prompt has no keep clause.' },
  { model: 'nano-banana', task: 'relight', form: 'instruction', keep: 'first', negative: 'n/a', checked: D, sources: [TPL('template_character_portrait_relighting')],
    template: 'Relight this photo: {light}', note: 'Comfy\'s Nano Banana 2 relight template puts the identity lock first, then the light.' },
  { model: 'gpt-image', task: 'relight', form: 'instruction', keep: 'last', negative: 'n/a', checked: D, sources: ['https://developers.openai.com/cookbook/examples/multimodal/image-gen-1.5-prompting_guide'],
    template: 'Relight this photo: {light}', note: '"Change only X … keep everything else", the preserve list last.' },
  { model: 'any', task: 'relight', form: 'instruction', keep: 'last', negative: 'n/a', checked: D, sources: ['https://docs.x.ai/developers/model-capabilities/images/prompting-guide'],
    template: 'relight the scene: {light}', note: 'FLUX, Seedream, Grok…: change then keep. FIBO 2.0 may prefer no keep clause; A/B before changing.' },
  { model: 'any', task: 'face-swap', form: 'instruction', keep: 'last', negative: 'n/a', checked: D, sources: ['https://docs.bfl.ai/guides/prompting_guide_flux2'],
    template: 'Replace the face of the person in image 1 with the face of the person in image 2', note: '"Replace X in image 1 with Y from image 2"; the keep list follows.' },
  { model: 'any', task: 'person-swap', form: 'instruction', keep: 'last', negative: 'n/a', checked: D, sources: ['https://docs.bfl.ai/guides/prompting_guide_flux2'],
    template: 'Replace the person in image 1 with the person from image 2', note: 'Same form as the face swap.' },
];

/** Which family a PROMPT_GRAMMAR key belongs to (null = none of ours). */
export function familyOf(model: string | null | undefined): PatternFamily | null {
  const k = String(model ?? '');
  return /^minimax-h3/.test(k) ? 'minimax-h3' : /^wan-/.test(k) ? 'wan' : /^ltx-/.test(k) ? 'ltx' : /^kling/.test(k) ? 'kling' : /^seedance/.test(k) ? 'seedance'
    : /^qwen-image/.test(k) ? 'qwen-edit' : /^(nano-banana|gemini)/.test(k) ? 'nano-banana' : /^gpt-image/.test(k) ? 'gpt-image' : /^flux/.test(k) ? 'flux'
    : /^(fibo|bria)/.test(k) ? 'bria' : null;
}
/** The pattern for a task on a model: the model key itself, then its family, then 'any'. */
export function patternFor(task: PatternTask, model?: string | null): PromptPattern | null {
  const k = String(model ?? ''); const fam = familyOf(k) ?? (PROMPT_PATTERNS.some((p) => p.model === k && p.task === task) ? null : k);
  return PROMPT_PATTERNS.find((p) => p.task === task && p.model === k) ?? PROMPT_PATTERNS.find((p) => p.task === task && p.model === fam)
    ?? PROMPT_PATTERNS.find((p) => p.task === task && p.model === 'any') ?? null;
}
/** Fills a template: {slot} → its value; [ … ] parts whose slots are empty are dropped. */
export function fillTemplate(template: string, slots: Record<string, string | null | undefined> = {}): string {
  const val = (s: string) => String(slots[s] ?? '').trim();
  return template.replace(/\[([^\]]*)\]/g, (_m, part: string) => ([...part.matchAll(/\{(\w+)\}/g)].every((x) => val(x[1])) ? part : ''))
    .replace(/\{(\w+)\}/g, (_m, s: string) => val(s)).replace(/\s+([.,;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}
/** The prompt a preset sends for a task on a model ('' = no pattern). */
export const fillPattern = (task: PatternTask, model: string | null | undefined, slots: Record<string, string | null | undefined> = {}): string => {
  const p = patternFor(task, model); return p ? fillTemplate(p.template, slots) : '';
};
/** An exact-LoRA pattern's trained sentence for one of our ids (null = none listed). */
/** A caption's subject: the user's words with a capital (a reference word such as "image 1" stays as typed, so the ref grammar still finds it),
 *  or the fallback. */
export const captionSubject = (words: string | null | undefined, fallback = 'The character') => { const w = String(words ?? '').trim().replace(/[.\s]+$/, '');
  return !w ? fallback : /^(@|(image|img|picture|video|audio) ?\d)/i.test(w) ? w : `${w[0].toUpperCase()}${w.slice(1)}`; };
export const loraSentence = (task: PatternTask, model: string, id: string): string | null => patternFor(task, model)?.exact?.[id] ?? null;
