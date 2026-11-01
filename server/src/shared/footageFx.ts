/**
 * Footage Effects (2026-10-26): official Lightricks LTX-2.5 IC-LoRA effects on the user's own clip, locally and free, on LTX-2.5 22B (distilled,
 * GGUF Q4_K_M). Isomorphic (no server imports): the server (tool, plan, timing) and the web (bar copy) read the same rules.
 *
 * One shared video-to-video base runs every effect: workflows/ltx25-iclora-v2v-api.json (cloned from Direct a Shot's proven Layout to Render graph;
 * patcher comfy/ltx25IcLora.ts). An effect only picks the IC-LoRA (shared/ltxLoras.ts), its strength and the prompt. Later variants of the same
 * base (Ripple, Outpaint / Inpaint, CQ Motion) plug in through comfy/ltx25IcLora.ts IC_LORA_VARIANTS; they are not built yet.
 *
 * Recipe (each LoRA's Lightricks model card, plus the conventions the cards give for prompts: each prompt follows its card's template, a plain
 *  description of the edited result; Clean Plate "An empty clean plate of the exact same location: …", Day to Night "A realistic nighttime scene. …",
 *  Water "Reference shows … Edited shows … ADD WATER …", Alpha Gen an empty prompt):
 *  - the source clip at 24 fps, cover-cropped to the draft size (sides ÷ 64, so stage 1 sits on LTX's 32 grid), frames on the 8k + 1 grid
 *  - two stages like Layout to Render: stage 1 at half size (8 distilled steps), x2 latent upscale, stage 2 at full size (3 steps); the source
 *    clip guides BOTH stages through LTXVAddGuide with the IC-LoRA's parameters, guides cropped before the upscale and before decode
 *  - CFG 1, euler_ancestral; the clip's own sound is put back on the result (our ffmpeg), so nothing about the audio changes
 * Mac sizes: Draft 768×448 (stage 1 384×224), Sharper 1024×576; ≤ 5 s per run on this Mac (longer clips: the first 5 s; chunking comes later).
 */
import { MAKE_REAL_SIZES, aspectOf, snap8k1, type MakeRealAspect } from './makeItReal.js';

export const FOOTAGE_FX_TOOL = 'footage-fx';
export const FOOTAGE_FX_PROVIDER = 'comfy-ltx25-iclora';
export const FOOTAGE_FX_WORKFLOW = 'ltx25-iclora-v2v-api.json';
export const FOOTAGE_FX_FPS = 24;
export const FOOTAGE_FX_SEED = 42;
/** Lengths offered (seconds) and the frames each renders (s × 24 + 1, on the 8k + 1 grid). */
export const FOOTAGE_FX_SECONDS = [2, 3, 4, 5] as const;
export const FOOTAGE_FX_DEFAULT_SECONDS = 2;
export const FOOTAGE_FX_MAX_SECONDS = 5;
/** Shortest clip we take: 17 frames (0.7 s) is the smallest useful 8k + 1 guide. */
export const FOOTAGE_FX_MIN_FRAMES = 17;
/** The Video bar's resolution values (the same as LTX-2.5 on Generate Video): Draft and Sharper. */
export const FOOTAGE_FX_RESOLUTIONS = ['448p', '576p'] as const;
export const FOOTAGE_FX_RES_LABELS: Record<string, string> = { '448p': 'Draft', '576p': 'Sharper' };
const SIZE_OF: Record<string, keyof typeof MAKE_REAL_SIZES> = { '448p': 'quick', '576p': 'standard' };

export interface FootageEffect {
  id: string; label: string; tagline: string;
  /** shared/ltxLoras.ts entry (runs on your computer); '' for a Comfy Cloud-only effect (its LoRA is in `cloud`) */ lora: string;
  /** LoRA strength (the card's advice for this look) */ strength: number;
  /** our prompt, in the form the LoRA was trained on (its card's template: a plain description of the result, trigger first where it has one);
   *  {scene} = the user's one line about the shot, or `sceneFallback`, or dropped with its separator when neither */ prompt: string;
  /** the card's negative ('' when the card runs without one) */ negative: string;
  /** what {scene} becomes without the user's line (Rain / Flood: the card's "Reference shows …" needs a subject) */ sceneFallback?: string;
  /** the one-line scene description helps this effect (Alpha matte takes an empty prompt) */ usesScene: boolean;
  /** its Comfy Cloud place (comfy/ltx23VfxCloud.ts): an LTX-2.3 graph on shared Comfy Cloud. With `lora` too, the effect runs in both places
   *  (Vanish, Day to night, Rain, Flood since 2026-11-01); without, on Comfy Cloud only; Alpha matte has none (your computer only). */
  cloud?: FootageCloudFx;
  /** the line is required (Remove an object: what to remove) */ needsLine?: boolean;
}
/** A Comfy Cloud effect: the official Comfy template it runs (or is derived from) and the IC-LoRA in Comfy Cloud's shared library (object_info 2026-10-26). */
export interface FootageCloudFx {
  /** Comfy-Org/workflow_templates id and its title in Comfy's template library */ template: string; title: string;
  /** true = our graph derived from that template (same nodes, another IC-LoRA, our prompt); no official template exists for the effect */ derived?: boolean;
  /** the LoRA file in Comfy Cloud's library */ loraFile: string; loraLabel: string;
  /** where the LoRA comes from (null when the template names no source) */ loraSource: string | null;
}
export const FOOTAGE_FX_TEMPLATE_URL = (id: string) => `https://github.com/Comfy-Org/workflow_templates/blob/main/templates/${id}.json`;
export const FOOTAGE_FX_CLOUD_MODEL = 'LTX-2.3 22B';
/** The official Comfy LTX-2.3 restore template: Restore old footage runs it as is; Vanish, Day to night, Rain and Flood run our graph derived from it
 *  (no official template exists for their LTX-2.3 IC-LoRAs; the same two-stage graph with their LoRA, strength, prompt and negative). */
const RESTORE_TEMPLATE = 'template_ltx2_3_lora_restore_archival_footage'; const RESTORE_TITLE = 'LTX-2.3: Restore Archival Footage';
/** The effects, in menu order. Rain and Flood share the water LoRA at two strengths (the card: ~1.0–1.1 natural, 1.25+ replaces surfaces). */
export const FOOTAGE_EFFECTS: FootageEffect[] = [
  { id: 'vanish', label: 'Vanish', tagline: 'Remove the people and vehicles. Keep the place.', lora: 'clean-plate', strength: 1.0, usesScene: true,
    prompt: 'An empty clean plate of the exact same location: {scene}, identical background, environment, structures and lighting as the source video, with no people, no humans, no figures, no animals, no vehicles and no body parts such as arms, hands or legs anywhere in the frame. Photorealistic footage, natural light, high detail.',
    negative: 'person, people, human, figure, limb, arm, hand, leg, body part, backpack, shadow of a person, animal, vehicle, car, bike, leftover people, leftover figures, ghosting, semi-transparent remnants, blurry, soft, distorted, inconsistent motion, jitter, worst quality, cartoon, video game, ugly',
    cloud: { template: RESTORE_TEMPLATE, title: RESTORE_TITLE, derived: true, loraFile: 'ltx-2.3-22b-ic-lora-clean-plate-1.0.safetensors', loraLabel: 'Clean Plate IC-LoRA', loraSource: 'https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Clean-Plate' } },
  { id: 'day-to-night', label: 'Day to night', tagline: 'Relight the shot as night. Same framing, same motion.', lora: 'day-to-night', strength: 1.0, usesScene: true,
    prompt: 'A realistic nighttime scene. {scene}. A dark night sky with soft moonlight, deep natural shadows and cool highlights, street lamps, windows and screens glowing with warm light. Only the lighting changes from day to night; identical composition, framing, camera movement and motion.',
    negative: 'daytime, bright sunlight, blue sky, overexposed, worst quality, inconsistent motion, blurry, jittery, distorted',
    cloud: { template: RESTORE_TEMPLATE, title: RESTORE_TITLE, derived: true, loraFile: 'ltx-2.3-22b-ic-lora-day-to-night-0.9.safetensors', loraLabel: 'Day to Night IC-LoRA', loraSource: 'https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Day-To-Night' } },
  { id: 'rain', label: 'Rain', tagline: 'Wet streets, puddles and light rain. Subtle and real.', lora: 'water-simulation', strength: 1.1, usesScene: true,
    prompt: 'Reference shows {scene}. Edited shows the same scene with water added.\nADD WATER light rain falling through the air, wet glistening ground with shallow puddles and clear reflections, small splashes where feet and wheels touch the ground.\nSubject identity, clothing, framing, and background geometry are identical to the reference; only water-related elements differ between reference and edited.',
    negative: '', sceneFallback: 'the scene in the source video',
    cloud: { template: RESTORE_TEMPLATE, title: RESTORE_TITLE, derived: true, loraFile: 'ltx-2.3-22b-ic-lora-water-simulation-0.9.safetensors', loraLabel: 'Water Simulation IC-LoRA', loraSource: 'https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Water-Simulation' } },
  { id: 'flood', label: 'Flood', tagline: 'Knee-deep water fills the scene and reacts to what moves.', lora: 'water-simulation', strength: 1.3, usesScene: true,
    prompt: 'Reference shows {scene}. Edited shows the same scene with water added.\nADD WATER murky knee-deep flood water filling the ground, rippling and parting around legs, wheels and objects, splashing with every movement and reflecting the surroundings.\nSubject identity, clothing, framing, and background geometry are identical to the reference; only water-related elements differ between reference and edited.',
    negative: '', sceneFallback: 'the scene in the source video',
    cloud: { template: RESTORE_TEMPLATE, title: RESTORE_TITLE, derived: true, loraFile: 'ltx-2.3-22b-ic-lora-water-simulation-0.9.safetensors', loraLabel: 'Water Simulation IC-LoRA', loraSource: 'https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Water-Simulation' } },
  { id: 'alpha-matte', label: 'Alpha matte', tagline: 'A clean black-and-white matte of the foreground. No green screen.', lora: 'alpha-gen', strength: 1.0, usesScene: false,
    prompt: '', negative: '' },
  // Comfy Cloud effects (2026-10-27): the official Comfy LTX-2.3 IC-LoRA templates, each with the template's own prompt, LoRA strength and negative.
  { id: 'restore', label: 'Restore old footage', tagline: 'Scratched, faded film made clean, sharp and full of colour.', lora: '', strength: 1.0, usesScene: true,
    prompt: 'A modern, high-resolution video shot in vivid color, sharp detail, contemporary cinematography. {scene}.', negative: 'pc game, console game, video game, cartoon, childish, ugly',
    cloud: { template: RESTORE_TEMPLATE, title: RESTORE_TITLE, loraFile: 'ltx-2.3-dearchive-lora_weights_step_05000.safetensors', loraLabel: 'Dearchive IC-LoRA', loraSource: null } },
  { id: 'remove-object', label: 'Remove an object', tagline: 'Name something in the shot and it’s gone.', lora: '', strength: 2.0, usesScene: true, needsLine: true,
    prompt: 'Remove the {scene} from the foreground.', negative: 'blurry, low resolution, ugly, garbled mess, compression artifacts, glitch, stop motion, still image, pixelated, robotic voice, oversaturated',
    cloud: { template: 'template_ltx2_3_obscura_remova_lora_remove_object_from_video', title: 'LTX-2.3: Remove Object from Video', loraFile: 'ltx23-obscura_remova.safetensors', loraLabel: 'Obscura Remova LoRA', loraSource: 'https://civitai.com/api/download/models/2909707' } },
  { id: 'remove-text', label: 'Remove subtitles', tagline: 'Subtitles, captions and text on screen, wiped clean.', lora: '', strength: 1.2, usesScene: false,
    prompt: 'Remove subtitles, captions, and related text occlusions from the video, restoring a clean and natural underlying image.', negative: 'pc game, console game, video game, cartoon, childish, ugly',
    cloud: { template: 'template_ltx2_3_lora_remove_subtitles_from_video', title: 'LTX-2.3: Remove Subtitles from Video', loraFile: 'ltx2.3-ic-subtitles-remove-general.safetensors', loraLabel: 'Subtitle Remover IC-LoRA', loraSource: null } },
  { id: 'extend-frame', label: 'Extend the frame', tagline: 'Grow the shot past its edges, into a new shape or any direction.', lora: '', strength: 1.0, usesScene: true,
    prompt: '{scene}.', negative: 'pc game, console game, video game, ugly, 3d render, photo, still, static, slow',
    cloud: { template: 'template_ltx2_3_lora_video_outpainting', title: 'LTX-2.3: Video Outpainting', loraFile: 'ltx-2.3-22b-ic-lora-outpaint.safetensors', loraLabel: 'Outpaint IC-LoRA', loraSource: 'https://huggingface.co/oumoumad/LTX-2.3-22b-IC-LoRA-Outpaint' } },
];
export const footageEffect = (id: string | null | undefined): FootageEffect | undefined => FOOTAGE_EFFECTS.find((e) => e.id === id);
/** The effects that run on Comfy Cloud (the Comfy Cloud place refuses the rest: Alpha matte). */
export const FOOTAGE_CLOUD_EFFECTS = FOOTAGE_EFFECTS.filter((e) => !!e.cloud);
/** Comfy Cloud only: no local LoRA (the local route refuses them). Vanish, Day to night, Rain and Flood run in both places. */
export const isCloudOnly = (e: FootageEffect | undefined): boolean => !!e?.cloud && !e.lora;
export const isCloudEffect = (id: string | null | undefined) => isCloudOnly(footageEffect(id));
/** "LTX-2.3 22B + Dearchive IC-LoRA": the real model a Comfy Cloud effect runs. */
export const footageCloudModelName = (e: FootageEffect) => `${FOOTAGE_FX_CLOUD_MODEL} + ${e.cloud?.loraLabel ?? 'IC-LoRA'}`;

/** Extend the frame (outpaint): the new shape and which way the picture grows. */
export const OUTPAINT_SHAPES = ['16:9', '9:16', '1:1'] as const;
export const OUTPAINT_GROW = ['around', 'left', 'right', 'up', 'down'] as const;
export type OutpaintShape = (typeof OUTPAINT_SHAPES)[number]; export type OutpaintGrow = (typeof OUTPAINT_GROW)[number];
/** A shape the same as the clip's zooms out: the clip shrinks to this share of the frame and the rest is new. */
export const OUTPAINT_ZOOM_OUT = 0.7;
export interface OutpaintPlan { canvas: { width: number; height: number }; inner: { width: number; height: number }; pad: { left: number; right: number; top: number; bottom: number }; shape: OutpaintShape; grow: OutpaintGrow; zoomOut: boolean }
/** Where the clip sits in the new frame: fitted inside (shrunk to 70 % when the shape doesn't change), even sizes, then pushed to the far side
 *  of the way it grows ("left" = new picture on the left). A direction the shape has no room for (left in a taller frame) grows around instead. */
export function outpaintPlan(clip: { width: number; height: number }, canvas: { width: number; height: number }, shape: OutpaintShape, grow: OutpaintGrow): OutpaintPlan {
  const zoomOut = aspectOf(clip.width, clip.height) === shape;
  const k = Math.min(canvas.width / clip.width, canvas.height / clip.height) * (zoomOut ? OUTPAINT_ZOOM_OUT : 1);
  const even = (n: number, max: number) => Math.min(max, Math.max(2, Math.floor(n / 2) * 2));
  const inner = { width: even(clip.width * k, canvas.width), height: even(clip.height * k, canvas.height) };
  const fx = canvas.width - inner.width; const fy = canvas.height - inner.height;
  const horiz = grow === 'left' || grow === 'right'; const vert = grow === 'up' || grow === 'down';
  const g: OutpaintGrow = (horiz && fx < 2) || (vert && fy < 2) ? 'around' : grow;
  const left = g === 'left' ? fx : g === 'right' ? 0 : Math.floor(fx / 4) * 2; const top = g === 'up' ? fy : g === 'down' ? 0 : Math.floor(fy / 4) * 2;
  return { canvas: { ...canvas }, inner, pad: { left, right: fx - left, top, bottom: fy - top }, shape, grow: g, zoomOut };
}

/** The prompt for an effect: its template with the user's scene line (trimmed, no trailing full stop), capitalised where it starts a sentence;
 *  without a line, the effect's fallback, or the slot is dropped with its ", " / ". " separator. Empty for Alpha matte. */
export function footageFxPrompt(e: FootageEffect, scene?: string | null): string {
  if (!e.usesScene) return e.prompt;
  const s = String(scene ?? '').trim().replace(/\s+/g, ' ').replace(/[.\s]+$/, '');
  if (e.id === 'remove-object') return e.prompt.replace('{scene}', s.replace(/^(the|a|an)\s+/i, '') || 'object'); // the card's own form: "Remove the {object} from the foreground."
  const line = s || e.sceneFallback;
  if (!line) return e.prompt.replace(/\{scene\}[.,]?\s*/, '').trim();
  const at = e.prompt.indexOf('{scene}'); const starts = at === 0 || /[.!?]\s*$/.test(e.prompt.slice(0, at));
  return e.prompt.replace('{scene}', starts ? line[0].toUpperCase() + line.slice(1) : line[0].toLowerCase() + line.slice(1));
}

export interface FootageFxPlan { width: number; height: number; stage1: { width: number; height: number }; frames: number; seconds: number; fps: number; aspect: MakeRealAspect; size: 'quick' | 'standard'; resolution: string; trimmed: boolean }
/** Frames for an asked length (2 s → 49, 5 s → 121). */
export const footageFxFrames = (seconds: number) => Math.round(Math.min(FOOTAGE_FX_MAX_SECONDS, Math.max(1, seconds)) * FOOTAGE_FX_FPS) + 1;
/** Size, length and frames for one job from the clip and the bar's picks. A clip shorter than the asked length gives what it has (snapped down
 *  to 8k + 1); a longer one uses its first seconds. null = the clip is too short to guide the model. */
export function footageFxPlan(clip: { width: number; height: number; seconds: number }, ask: { seconds?: number | string; resolution?: string } = {}): FootageFxPlan | null {
  const resolution = SIZE_OF[String(ask.resolution)] ? String(ask.resolution) : '448p'; const size = SIZE_OF[resolution];
  const aspect = aspectOf(clip.width, clip.height); const [width, height] = MAKE_REAL_SIZES[size].dims[aspect];
  const want = FOOTAGE_FX_SECONDS.includes(Number(ask.seconds) as any) ? Number(ask.seconds) : FOOTAGE_FX_DEFAULT_SECONDS;
  const have = snap8k1(Math.floor(clip.seconds * FOOTAGE_FX_FPS + 1e-6)); const frames = Math.min(footageFxFrames(want), have);
  if (frames < FOOTAGE_FX_MIN_FRAMES) return null;
  return { width, height, stage1: { width: width / 2, height: height / 2 }, frames, seconds: Math.round(((frames - 1) / FOOTAGE_FX_FPS) * 10) / 10, fps: FOOTAGE_FX_FPS, aspect, size, resolution, trimmed: clip.seconds > (frames - 1) / FOOTAGE_FX_FPS + 0.25 };
}

/** First estimate on Apple Silicon (M1 Max class), in seconds, until this computer has timed its own runs.
 *  Anchored on our measured LTX-2.5 runs: a 2 s Draft ≈ 8 min, a 5 s Draft ≈ 19 min (the IC-LoRA guide doubles the tokens, like Layout to Render). */
export function footageFxEtaSeconds(p: Pick<FootageFxPlan, 'width' | 'height' | 'frames'>): { low: number; high: number } {
  const px = (p.width * p.height) / (768 * 448); const len = p.frames / 49;
  const mid = 60 + 420 * Math.pow(px * len, 1.12);
  return { low: Math.round(mid * 0.85), high: Math.round(mid * 1.15) };
}
/** "LTX-2.5 22B + Clean Plate IC-LoRA": the real model a pick runs. */
export const footageFxModelName = (loraLabel: string) => `LTX-2.5 22B + ${loraLabel}`;
