/**
 * Footage Effects (2026-10-26): official Lightricks LTX-2.5 IC-LoRA effects on the user's own clip, locally and free, on LTX-2.5 22B (distilled,
 * GGUF Q4_K_M). Isomorphic (no server imports): the server (tool, plan, timing) and the web (bar copy) read the same rules.
 *
 * One shared video-to-video base runs every effect: workflows/ltx25-iclora-v2v-api.json (cloned from Direct a Shot's proven Layout to Render graph;
 * patcher comfy/ltx25IcLora.ts). An effect only picks the IC-LoRA (shared/ltxLoras.ts), its strength and the prompt. Later variants of the same
 * base (Ripple, Outpaint / Inpaint, CQ Motion) plug in through comfy/ltx25IcLora.ts IC_LORA_VARIANTS; they are not built yet.
 *
 * Recipe (each LoRA's Lightricks model card, plus the conventions the cards give for prompts):
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
  /** shared/ltxLoras.ts entry (local effects); '' for a Comfy Cloud effect (its LoRA is in `cloud`) */ lora: string;
  /** LoRA strength (the card's advice for this look) */ strength: number;
  /** our prompt; {scene} = the user's one line about the shot (or a neutral fallback) */ prompt: string;
  negative: string;
  /** the one-line scene description helps this effect (Alpha matte takes an empty prompt) */ usesScene: boolean;
  /** Comfy Cloud only (2026-10-27): an official Comfy LTX-2.3 template on shared Comfy Cloud (comfy/ltx23VfxCloud.ts); local effects have none */
  cloud?: FootageCloudFx;
  /** the line is required (Remove an object: what to remove) */ needsLine?: boolean;
}
/** A Comfy Cloud effect: the official Comfy template it runs and the IC-LoRA in Comfy Cloud's shared library (object_info 2026-10-26). */
export interface FootageCloudFx {
  /** Comfy-Org/workflow_templates id and its title in Comfy's template library */ template: string; title: string;
  /** the LoRA file in Comfy Cloud's library */ loraFile: string; loraLabel: string;
  /** where the LoRA comes from (null when the template names no source) */ loraSource: string | null;
}
export const FOOTAGE_FX_TEMPLATE_URL = (id: string) => `https://github.com/Comfy-Org/workflow_templates/blob/main/templates/${id}.json`;
export const FOOTAGE_FX_CLOUD_MODEL = 'LTX-2.3 22B';
const SCENE_FALLBACK = 'the scene in the source video';
/** The effects, in menu order. Rain and Flood share the water LoRA at two strengths (the card: ~1.0–1.1 natural, 1.25+ replaces surfaces). */
export const FOOTAGE_EFFECTS: FootageEffect[] = [
  { id: 'vanish', label: 'Vanish', tagline: 'Remove the people and vehicles. Keep the place.', lora: 'clean-plate', strength: 1.0, usesScene: true,
    prompt: 'The same location with nobody in it: the empty background, buildings, ground and sky exactly as in the source, with the same camera motion and light. No people, animals or vehicles anywhere in the frame. {scene}',
    negative: 'people, person, crowd, pedestrians, figures, hands, limbs, animals, vehicles, cars, bikes, leftover shapes, ghost outlines, see-through remains, blur, flicker' },
  { id: 'day-to-night', label: 'Day to night', tagline: 'Relight the shot as night. Same framing, same motion.', lora: 'day-to-night', strength: 1.0, usesScene: true,
    prompt: 'The same shot at night: a dark blue sky, soft moonlight, deep natural shadows and cool highlights, with street lamps, windows and screens glowing where they exist. Only the time of day changes; the framing, camera motion and every subject stay the same. {scene}',
    negative: 'daylight, sunshine, bright sky, overexposed, pitch black, crushed shadows, blur' },
  { id: 'rain', label: 'Rain', tagline: 'Wet streets, puddles and light rain. Subtle and real.', lora: 'water-simulation', strength: 1.1, usesScene: true,
    prompt: 'Reference shows {scene}. Edited shows the same scene with water added.\nADD WATER light rain falling, wet ground with shallow puddles and clear reflections, glistening surfaces, small splashes where things move.',
    negative: '' },
  { id: 'flood', label: 'Flood', tagline: 'Knee-deep water fills the scene and reacts to what moves.', lora: 'water-simulation', strength: 1.3, usesScene: true,
    prompt: 'Reference shows {scene}. Edited shows the same scene with water added.\nADD WATER the ground covered by knee-deep flood water that ripples and parts around people, wheels and objects, foam and splashes with every movement, the surroundings reflected on the surface.',
    negative: '' },
  { id: 'alpha-matte', label: 'Alpha matte', tagline: 'A clean black-and-white matte of the foreground. No green screen.', lora: 'alpha-gen', strength: 1.0, usesScene: false,
    prompt: '', negative: '' },
  // Comfy Cloud effects (2026-10-27): the official Comfy LTX-2.3 IC-LoRA templates, each with the template's own prompt, LoRA strength and negative.
  { id: 'restore', label: 'Restore old footage', tagline: 'Scratched, faded film made clean, sharp and full of colour.', lora: '', strength: 1.0, usesScene: true,
    prompt: 'A modern, high-resolution video shot in vivid color, sharp detail, contemporary cinematography. {scene}', negative: 'pc game, console game, video game, cartoon, childish, ugly',
    cloud: { template: 'template_ltx2_3_lora_restore_archival_footage', title: 'LTX-2.3: Restore Archival Footage', loraFile: 'ltx-2.3-dearchive-lora_weights_step_05000.safetensors', loraLabel: 'Dearchive IC-LoRA', loraSource: null } },
  { id: 'remove-object', label: 'Remove an object', tagline: 'Name something in the shot and it’s gone.', lora: '', strength: 2.0, usesScene: true, needsLine: true,
    prompt: 'Remove the {scene} from the foreground.', negative: 'blurry, low resolution, ugly, garbled mess, compression artifacts, glitch, stop motion, still image, pixelated, robotic voice, oversaturated',
    cloud: { template: 'template_ltx2_3_obscura_remova_lora_remove_object_from_video', title: 'LTX-2.3: Remove Object from Video', loraFile: 'ltx23-obscura_remova.safetensors', loraLabel: 'Obscura Remova LoRA', loraSource: 'https://civitai.com/api/download/models/2909707' } },
  { id: 'remove-text', label: 'Remove subtitles', tagline: 'Subtitles, captions and text on screen, wiped clean.', lora: '', strength: 1.2, usesScene: false,
    prompt: 'Remove subtitles, captions, and related text occlusions from the video, restoring a clean and natural underlying image.', negative: 'pc game, console game, video game, cartoon, childish, ugly',
    cloud: { template: 'template_ltx2_3_lora_remove_subtitles_from_video', title: 'LTX-2.3: Remove Subtitles from Video', loraFile: 'ltx2.3-ic-subtitles-remove-general.safetensors', loraLabel: 'Subtitle Remover IC-LoRA', loraSource: null } },
  { id: 'extend-frame', label: 'Extend the frame', tagline: 'Grow the shot past its edges, into a new shape or any direction.', lora: '', strength: 1.0, usesScene: true,
    prompt: '{scene}', negative: 'pc game, console game, video game, ugly, 3d render, photo, still, static, slow',
    cloud: { template: 'template_ltx2_3_lora_video_outpainting', title: 'LTX-2.3: Video Outpainting', loraFile: 'ltx-2.3-22b-ic-lora-outpaint.safetensors', loraLabel: 'Outpaint IC-LoRA', loraSource: 'https://huggingface.co/oumoumad/LTX-2.3-22b-IC-LoRA-Outpaint' } },
];
export const footageEffect = (id: string | null | undefined): FootageEffect | undefined => FOOTAGE_EFFECTS.find((e) => e.id === id);
/** The effects that run on Comfy Cloud only (the local route refuses them, the Comfy Cloud place refuses the local ones). */
export const FOOTAGE_CLOUD_EFFECTS = FOOTAGE_EFFECTS.filter((e) => !!e.cloud);
export const isCloudEffect = (id: string | null | undefined) => !!footageEffect(id)?.cloud;
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

/** The prompt for an effect: the template with the user's scene line (trimmed, no trailing full stop); empty for Alpha matte. */
export function footageFxPrompt(e: FootageEffect, scene?: string | null): string {
  if (!e.usesScene) return e.prompt;
  const s = String(scene ?? '').trim().replace(/\s+/g, ' ').replace(/[.\s]+$/, '');
  if (e.id === 'remove-object') return e.prompt.replace('{scene}', s.replace(/^(the|a|an)\s+/i, '') || 'object'); // the card's own form: "Remove the {object} from the foreground."
  if (e.prompt === '{scene}') return s ? `${s[0].toUpperCase()}${s.slice(1)}.` : '';
  if (e.prompt.startsWith('Reference shows')) return e.prompt.replace('{scene}', s ? s[0].toLowerCase() + s.slice(1) : SCENE_FALLBACK);
  return e.prompt.replace('{scene}', s ? `${s[0].toUpperCase()}${s.slice(1)}.` : '').trim();
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
