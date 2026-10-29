/**
 * Shared LTX-2.5 IC-LoRA video-to-video base (2026-10-26): the plan for workflows/ltx25-iclora-v2v-api.json. Pure, so tests check it without ComfyUI.
 *
 * Graph: cloned from our proven workflows/ltx25-layout-to-render-api.json (Direct a Shot's Render; built from the official Comfy templates
 * video_ltx2_5_t2v / video_ltx2_5_i2v for the two-stage distilled ladder and video_ltx2_3_ic_lora for the IC-LoRA guide pattern):
 *   LoadVideo (the source, conformed on the server) → GetVideoComponents → LTXVAddGuide with GetICLoRAParameters on BOTH stages →
 *   LTXVCropGuides before the x2 latent upscale and before decode. Optional first frame: LTXVImgToVideoInplace on both stages (nodes 22–25,
 *   dropped when a job has none). The audio latent is LTX's own; the plan muxes the source clip's sound back (muxSourceAudio).
 * Lightricks' own V2V example (LTX-2.5_V2V_ICLoRA_Single_Stage_Distilled) is one stage at full size; ours keeps the Mac-sized two-stage ladder
 * with the guide re-added on stage 2, as Layout to Render does.
 *
 * Variants (one base, shared-first): an effect only swaps the IC-LoRA, its strength and the prompt. Later variants plug in here:
 *   ripple   : WepeNerd LTX-Ripple, an edited first frame (firstFrame required) + the source as guide
 *   motion   : CQ Freeform Motion Transfer, a depth video as the guide + a target image, 30 fps
 *   outpaint / inpaint : Lightricks In/Outpainting, the guide painted #66FF00 where to fill, LTXVAddGuide attention_mask
 * Only `effect` is built; the others throw until their step lands.
 * Every node class, input and option was checked against the user's ComfyUI /object_info (test/fixtures/object-info-ltx25-iclora.json).
 */
import { FOOTAGE_FX_FPS, FOOTAGE_FX_SEED, type FootageFxPlan } from '../shared/footageFx.js';

type G = Record<string, any>;
export type IcLoraVariant = 'effect' | 'ripple' | 'motion' | 'outpaint' | 'inpaint';
export const IC_LORA_VARIANTS: Record<IcLoraVariant, { built: boolean; firstFrame: 'none' | 'optional' | 'required'; note: string }> = {
  effect: { built: true, firstFrame: 'optional', note: 'Footage Effects: an official Lightricks IC-LoRA on the source clip (Vanish, Day to night, Rain, Flood, Alpha matte)' },
  ripple: { built: false, firstFrame: 'required', note: 'planned: an edited first frame carried through the clip (WepeNerd/LTX-Ripple)' },
  motion: { built: false, firstFrame: 'required', note: 'planned: depth video as the guide + target image at 30 fps (CQ Freeform Motion Transfer)' },
  outpaint: { built: false, firstFrame: 'optional', note: 'planned: Reframe on the In/Outpainting IC-LoRA (#66FF00 key, attention mask)' },
  inpaint: { built: false, firstFrame: 'optional', note: 'planned: Remove Object on the In/Outpainting IC-LoRA (#66FF00 key, attention mask)' },
};
export const IC_LORA_OUTPUT = '63';
const isLink = (v: any) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string';

/** ffmpeg arguments that conform the source to the plan: 24 fps, cover + centre crop to width×height, exactly `frames` frames, its sound kept (AAC,
 *  cut to the same length) so the result can carry it and the before / after compare lines up frame for frame. */
export function conformSourceArgs(src: string, out: string, p: Pick<FootageFxPlan, 'width' | 'height' | 'frames' | 'fps'>): string[] {
  return ['-y', '-v', 'error', '-i', src, '-map', '0:v:0', '-map', '0:a:0?', '-vf', `fps=${p.fps},scale=${p.width}:${p.height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${p.width}:${p.height},setsar=1`,
    '-frames:v', String(p.frames), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(p.fps),
    '-c:a', 'aac', '-b:a', '192k', '-t', ((p.frames) / p.fps).toFixed(3), '-movflags', '+faststart', out];
}

export interface IcLoraJob {
  variant: IcLoraVariant; plan: Pick<FootageFxPlan, 'width' | 'height' | 'stage1' | 'frames' | 'seconds'>;
  prompt: string; negative?: string; seed?: number;
  lora: { file: string; strength: number };
  /** the conformed source clip ({__file} placeholder) */ source: unknown;
  /** optional first frame, already fitted to the full size ({__file}); strength per stage */ firstFrame?: unknown; firstFrameStrength?: [number, number];
  /** guide strength (both stages); the IC-LoRA cards use 1 */ guideStrength?: number;
}
/** Patch the shared graph for one job. Returns the graph, its output node and what was asked (for readiness/graph assertions). */
export function patchLtx25IcLora(g: G, a: IcLoraJob): { graph: G; output: string; expect: Record<string, any> } {
  const v = IC_LORA_VARIANTS[a.variant]; if (!v) throw new Error(`ltx25 IC-LoRA: unknown variant ${a.variant}`);
  if (!v.built) throw new Error(`ltx25 IC-LoRA: the ${a.variant} variant is not built yet (${v.note})`);
  if (v.firstFrame === 'required' && !a.firstFrame) throw new Error(`ltx25 IC-LoRA: ${a.variant} needs a first frame`);
  if (!a.source) throw new Error('ltx25 IC-LoRA: the source clip is required');
  if (!a.lora?.file) throw new Error('ltx25 IC-LoRA: no IC-LoRA picked');
  const { plan } = a; const seed = Number.isInteger(a.seed) ? Number(a.seed) : FOOTAGE_FX_SEED; const gs = a.guideStrength ?? 1;
  Object.assign(g['2'].inputs, { lora_name: a.lora.file, strength_model: a.lora.strength });
  g['10'].inputs.text = a.prompt; g['11'].inputs.text = a.negative ?? '';
  g['20'].inputs.file = a.source;
  Object.assign(g['30'].inputs, { width: plan.stage1.width, height: plan.stage1.height, length: plan.frames, batch_size: 1 });
  Object.assign(g['23'].inputs, { width: plan.stage1.width, height: plan.stage1.height });
  g['33'].inputs.frames_number = plan.frames;
  for (const id of ['12', '33']) g[id].inputs.frame_rate = FOOTAGE_FX_FPS; g['62'].inputs.fps = FOOTAGE_FX_FPS;
  g['35'].inputs.noise_seed = seed; g['54'].inputs.noise_seed = seed + 1;
  for (const id of ['32', '52']) g[id].inputs.strength = gs;
  if (a.firstFrame) {
    const [s1, s2] = a.firstFrameStrength ?? [1, 1];
    g['22'].inputs.image = a.firstFrame; g['24'].inputs.strength = s1; g['25'].inputs.strength = s2;
  } else { g['32'].inputs.latent = ['30', 0]; g['52'].inputs.latent = ['50', 0]; for (const id of ['22', '23', '24', '25']) delete g[id]; }
  for (const [id, n] of Object.entries<any>(g)) for (const [k, val] of Object.entries<any>(n.inputs)) if (isLink(val) && !g[val[0]]) throw new Error(`ltx25 IC-LoRA graph: ${id}.${k} links to missing node ${val[0]}`);
  return { graph: g, output: IC_LORA_OUTPUT, expect: { variant: a.variant, prompt: a.prompt, negative: a.negative ?? '', seed, lora: a.lora.file, loraStrength: a.lora.strength, guideStrength: gs,
    width: plan.width, height: plan.height, stage1: plan.stage1, frames: plan.frames, seconds: plan.seconds, fps: FOOTAGE_FX_FPS, firstFrame: !!a.firstFrame, sourceAudio: true } };
}
