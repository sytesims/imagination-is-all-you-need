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
  | 'motion-transfer' | 'video-restyle' | 'relight' | 'face-swap' | 'person-swap' | 'ad' | 'ad-text' | 'ugc-photo';
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
const GPT_GUIDE = 'https://developers.openai.com/cookbook/examples/multimodal/image-gen-1.5-prompting_guide';
const GEMINI_GUIDE = 'https://ai.google.dev/gemini-api/docs/image-generation';
const FLUX_GUIDE = 'https://docs.bfl.ml/guides/prompting_guide_flux2';
const QWEN_CARD = 'https://huggingface.co/Qwen/Qwen-Image';

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
  { model: 'qwen-image-edit-2509-angles', task: 'camera-angle', form: 'exact-lora-sentence', keep: 'last', negative: 'n/a', checked: '2026-11-01',
    sources: [ANGLES_2509, TPL('templates-1_click_multiple_character_angles-v1.0')], template: '{sentence}[ The subject: {id}.] Keep the subject, the place, the light and the photo style the same.',
    exact: { 'three-quarter-left': 'Rotate the camera 45 degrees to the left.', 'three-quarter-right': 'Rotate the camera 45 degrees to the right.',
      high: 'Turn the camera to a top-down view.', 'close-up': 'Turn the camera to a close-up.', wide: 'Turn the camera to a wide-angle lens.' },
    note: 'Only the commands on the 2509 LoRA card (its English glosses): 45° left / right, top-down (our High angle), close-up and wide-angle. The card has no low-angle and no 90° command, so those views (and every other one) get the plain camera-angle wording below.' },
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

  // ---- Ad Pack (2026-10-31, shared/adPack.ts): one finished ad per style, the model paints the scene and the words; our code adds the logo after.
  // 'ad' is the frame ({scene} = the style's sentence), 'ad-text' the words line. Every guide below agrees on the text rules: exact words in
  // double quotes, short, with the font feel and the place named. Our own wording after each vendor's guide; product photos as "image N" words.
  { model: 'gpt-image', task: 'ad', form: 'instruction', keep: 'last', negative: 'n/a', checked: D, sources: [GPT_GUIDE],
    template: 'Image 1 is the product photo.[ {more}] Create a finished {shape} social media ad for this product. Scene: {scene}.[ About the product: {details}.] Product: keep it exactly as in image 1, with the same shape, colours, label and printed text.[ {text}][ Brand colours: {colours}.][ Brand rules: {dos}.][ Avoid {donts}.][ Layout: keep the {corner} corner as plain background with nothing in it, for a logo added later.][ Keep all text and the product clear of the {safe} of the frame.] No other words, watermarks or logos.',
    note: 'OpenAI: label each input image by its role, then scene → subject → details → constraints; say what the image is for (an ad); the preserve list stated in full; "no other text" as the last constraint.' },
  { model: 'gpt-image', task: 'ad-text', form: 'instruction', keep: 'none', negative: 'n/a', checked: D, sources: [GPT_GUIDE],
    template: 'Text, verbatim, each once and perfectly legible: {quoted}. Typography: {type}.', note: 'OpenAI: literal text in quotes, "verbatim", appears once, typography as a constraint.' },
  { model: 'nano-banana', task: 'ad', form: 'instruction', keep: 'last', negative: 'n/a', checked: D, sources: [GEMINI_GUIDE],
    template: 'Using the provided image of the product (image 1), create a high-resolution {shape} advertising photograph of it.[ {more}] {scene}.[ The product: {details}.] The product stays exactly as it is in the image, with its shape, colours and label unchanged.[ {text}][ The colour scheme uses {colours}.][ The design follows the brand\'s style: {dos}.][ It avoids {donts}.][ The {corner} corner is clean, empty background with no text or objects.][ All text and the product stay clear of the {safe} of the frame.] There is no other text or logo in the image.',
    note: 'Google: "Using the provided image of …" for edits; describe the scene in sentences, not keywords; the product-photography template (surface, light, angle); the shape named in the prompt as well as the request.' },
  { model: 'nano-banana', task: 'ad-text', form: 'instruction', keep: 'none', negative: 'n/a', checked: D, sources: [GEMINI_GUIDE],
    template: 'The ad shows {quoted} in {type}.', note: 'Google text template: the exact words in quotes, then the font style and the design.' },
  { model: 'flux', task: 'ad', form: 'instruction', keep: 'none', negative: 'none', checked: D, sources: [FLUX_GUIDE],
    template: 'Advertising photograph of the product from image 1. {scene}.[ {more}][ The product: {details}.] The product keeps its exact shape, colours and label from image 1.[ {text}][ Colours: {coloursByRole}.][ Brand style: {dos}.][ The {corner} corner is clean, empty background.][ Text and product sit clear of the {safe} of the frame.] Format: {shape}.',
    note: 'BFL FLUX.2: most important first (subject, then scene, then style); no negative prompt, so the ad says what it wants; brand colours as hex codes tied to objects ("in colour #…"): each colour on its kit role, by the kit\'s own name; the kit\'s do\'s only (its don\'ts would be negatives).' },
  { model: 'flux', task: 'ad-text', form: 'instruction', keep: 'none', negative: 'none', checked: D, sources: [FLUX_GUIDE],
    template: 'The image shows {quoted}, in {type}.', note: 'BFL: quoted text, its typeface style, size and where it sits.' },
  { model: 'qwen-edit', task: 'ad', form: 'instruction', keep: 'last', negative: 'n/a', checked: D, sources: [QWEN_CARD],
    template: 'Turn the product in image 1 into a {shape} advertising photo.[ {more}] {scene}.[ The product: {details}.] Keep the product\'s shape, colours and label exactly as in image 1.[ {text}][ Colour palette: {colours}.][ Brand style: {dos}.][ Avoid {donts}.][ Keep the {corner} corner as empty background.][ Keep the text and the product clear of the {safe} of the frame.] No other words or logos.',
    note: 'Qwen Image: short edit instruction on image 1, text in double quotes (the card\'s own examples). Its "Ultra HD, 4K" suffix is for text-to-image, so not added to an edit.' },
  { model: 'qwen-edit', task: 'ad-text', form: 'instruction', keep: 'none', negative: 'n/a', checked: D, sources: [QWEN_CARD],
    template: 'Add {quoted} in {type}.', note: 'Qwen Image: the words in double quotes.' },
  { model: 'any', task: 'ad', form: 'instruction', keep: 'last', negative: 'n/a', checked: D, sources: [],
    template: 'Create a {shape} advertising photo of the product in image 1.[ {more}] {scene}.[ The product: {details}.] Keep the product exactly as in image 1, with the same shape, colours and label.[ {text}][ Brand colours: {colours}.][ Brand style: {dos}.][ Avoid {donts}.][ Leave the {corner} corner as empty background.][ Keep the text and the product clear of the {safe} of the frame.] No other words or logos.',
    note: 'Our own default for the other edit models (Seedream, Qwen Image 3.0…): the shared rules, plain order.' },
  { model: 'any', task: 'ad-text', form: 'instruction', keep: 'none', negative: 'n/a', checked: D, sources: [],
    template: 'Add {quoted}, in {type}.', note: 'Quoted words, font feel and place.' },
  // ---- People, phone photos (2026-11-01): our own wording after each vendor's guide (research: realistic UGC portraits). ----
  // ugc-photo: one casual phone photo of an AI-made person. {who} = what you typed; {holder} / {light} = the chips' sentences (shared/phonePhoto.ts).
  // No quality tags ("8K", "ultra-detailed", "photorealistic") and no studio-polish words: they push the picture toward an ad or an editorial.
  { model: 'gpt-image', task: 'ugc-photo', form: 'instruction', keep: 'none', negative: 'n/a', checked: '2026-11-01', sources: [GPT_GUIDE],
    template: 'A casual phone photo of {who}[, {action}][ in {setting}].[ {holder}.][ {light}.] Real skin with visible pores, a little shine and small marks, hair slightly out of place[, {detail}]. Everyday background left as it is, framing a little off-centre, phone-camera sharpness with light noise in the shadows. Unposed, no heavy retouching.',
    note: 'OpenAI: write it as a real in-the-moment photo; name the framing and the light; ask for pores and small marks; "unposed", "no heavy retouching" instead of quality tags.' },
  { model: 'nano-banana', task: 'ugc-photo', form: 'instruction', keep: 'none', negative: 'n/a', checked: '2026-11-01', sources: [GEMINI_GUIDE],
    template: 'A casual, unposed phone photo: {who}[ {action}][ in {setting}], with everyday things around them just as they are.[ {holder}.][ {light}.] Their skin shows natural pores, a slight shine and small marks; a few loose strands of hair[; {detail}]. The frame is a little off-centre with the phone camera\'s natural sharpness.',
    note: 'Google: full sentences, not a keyword list; say what is there (positive phrasing).' },
  { model: 'flux', task: 'ugc-photo', form: 'instruction', keep: 'none', negative: 'none', checked: '2026-11-01', sources: [FLUX_GUIDE],
    template: '{who}[, {action}][ in {setting}]. Modern smartphone photo[, {holder}][, {light}]. Natural skin with pores and slight shine, loose hair strands[, {detail}]. Lived-in background, slightly off-centre framing, small-sensor noise, deep focus.',
    note: 'BFL FLUX.2: subject, action, style, context; 30-80 words; no negatives; real camera words.' },
  { model: 'any', task: 'ugc-photo', form: 'instruction', keep: 'none', negative: 'n/a', checked: '2026-11-01', sources: [GPT_GUIDE, QWEN_CARD],
    template: 'A casual phone photo of {who}[, {action}][ in {setting}].[ {holder}.][ {light}.] Real skin with visible pores, a little shine and small marks, hair slightly out of place[, {detail}]. Everyday background left as it is, framing a little off-centre, phone-camera sharpness with light noise in the shadows. Unposed, no heavy retouching.',
    note: 'The GPT sentences for the other models (Seedream, Qwen Image…), with no "Ultra HD, 4K" suffix.' },

  // camera-angle (2026-11-01): one edit per view of the same photo ({view} = the view's words, shared by every family; [{id}] = the subject as
  // typed, repeated in every view). Style-neutral: the photo sets the style, so no "photorealistic" and no "phone photo" here.
  { model: 'gpt-image', task: 'camera-angle', form: 'instruction', keep: 'last', negative: 'n/a', checked: '2026-11-01', sources: [GPT_GUIDE],
    template: 'Image 1: the subject. Keep the subject exactly the same[: {id}]; same face, hair, skin tone, build and clothes. New camera angle: {view}. Same place and the same light as image 1, in the same photo style as image 1.',
    note: 'OpenAI: label the input, state the preserve list in full on every edit, then the one change.' },
  { model: 'nano-banana', task: 'camera-angle', form: 'instruction', keep: 'last', negative: 'n/a', checked: '2026-11-01', sources: [GEMINI_GUIDE],
    template: 'Using the provided image of the subject, show the same subject {view}.[ The subject: {id}.] Their face, hair, skin tone, build and clothes stay exactly as in the image, and the place, the light and the photo style stay the same.',
    note: 'Google: "Using the provided image of …", then say what stays.' },
  { model: 'flux', task: 'camera-angle', form: 'instruction', keep: 'last', negative: 'none', checked: '2026-11-01', sources: [FLUX_GUIDE],
    template: 'The subject from image 1[, {id},] seen {view}, in the same place, light and photo style as image 1.',
    note: 'BFL FLUX.2: say what each image gives and repeat the subject; no negatives.' },
  { model: 'any', task: 'camera-angle', form: 'instruction', keep: 'last', negative: 'n/a', checked: '2026-11-01', sources: [],
    template: 'Show the subject in image 1 {view}.[ The subject: {id}.] Keep their face, hair, skin tone, build and clothes, the place, the light and the photo style exactly as in image 1.',
    note: 'Our own default for the other edit models (Seedream, Kling, Qwen Image, Luma…).' },
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
/** The family whose wording an engine gets, by its provider id (Ad Pack, Camera Angles, Phone Photo). */
export function familyOfProvider(provider?: string | null): PatternFamily {
  const p = String(provider ?? '');
  return /^(api-gpt-image|direct-openai)/.test(p) ? 'gpt-image' : /^(api-nano-banana|direct-gemini)/.test(p) ? 'nano-banana' : /flux|klein/.test(p) ? 'flux'
    : /^comfy-qwen|^api-qwen-image/.test(p) ? 'qwen-edit' : 'any';
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
