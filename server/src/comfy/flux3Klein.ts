/**
 * FLUX 3 [klein] local graphs (workflows/create-image-flux3klein-*-api.json, built by scripts/build-flux3-klein.py from the official
 * image_flux3_klein_distilled_t2i / _image_edit templates), 2026-10-27.
 *  - Prompt upsampler: BFL says to use the model with one, so it is ON unless the job turns it off (promptRewrite: false, the shared
 *    "Let the model rewrite my prompt" option, imageCaps extras). Off: the raw prompt goes straight to the text encoder and the upsampler
 *    branch (TextGenerate + its 9.75 GB Qwen3.5 9B file) is cut from the graph, so the job runs without that file on disk
 *    (hardware/requirements.ts leaves it out of the files needed).
 *  - Layout boxes (shared/layoutBoxes.ts): the official CreateBoundingBoxes → Flux3LayoutPrompt pair sits on the prompt path. Boxes → the
 *    CreateBoundingBoxes `bboxes` input (BFL elements, JSON); box N is <obj_N> in the prompt. No boxes → the prompt is relinked past the pair and
 *    pruneUnreachable drops it: the same graph as before boxes existed.
 */
import { flux3LayoutElementsJson, type LayoutBox } from '../shared/layoutBoxes.js';
/** The prompt upsampler file the klein graphs load (int8 ConvRot: runs on a Mac; the templates' w4a8 file doesn't). */
export const FLUX3_KLEIN_UPSAMPLER = 'qwen3.5_9b_flux3_prompt_upsampler_int8_convrot.safetensors';
export const FLUX3_KLEIN_PROVIDER = 'comfy-flux3-klein';
const OFF = /^(0|false|off|no)$/i;
/** True when this job runs klein WITHOUT the prompt upsampler (promptRewrite false / '0'). Missing = on (BFL's advice). */
export const kleinUpsamplerOff = (input: Record<string, any> | undefined): boolean => input?.promptRewrite === false || OFF.test(String(input?.promptRewrite ?? ''));

/** Set the graph's upsampler switch from the job and cut the branch it won't take. Node-map keys: `upsample` (t2i: switch true = upsampled)
 *  or `raw_prompt` (edit / inpaint / multiref: switch true = raw prompt). Returns whether the upsampler runs. */
export function applyKleinUpsampler(g: Record<string, any>, inputs: Record<string, { node: string; field: string }>, input: Record<string, any>): boolean {
  const on = !kleinUpsamplerOff(input);
  const key = inputs.upsample ? 'upsample' : inputs.raw_prompt ? 'raw_prompt' : null; if (!key) return on;
  const sw = g[inputs[key].node]; if (!sw) return on;
  const value = key === 'upsample' ? on : !on; sw.inputs[inputs[key].field] = value;
  // ComfySwitchNode branches are lazy, but ComfyUI still validates every linked node (the upsampler's CLIPLoader names a file): drop the unused one
  if (!on) delete sw.inputs[value ? 'on_false' : 'on_true'];
  return on;
}
/** True when a weight file is optional for this job and the job opts out of it (the upsampler, on klein's local route). */
export const optionalFileSkipped = (providerId: string, file: string, input: Record<string, any> | undefined): boolean =>
  providerId === FLUX3_KLEIN_PROVIDER && file === FLUX3_KLEIN_UPSAMPLER && kleinUpsamplerOff(input);
/** Node-map `boxes`: the CreateBoundingBoxes node + its input, the Flux3LayoutPrompt node, and the prompt node it reads. */
export type KleinBoxesMap = { node: string; field: string; layout: string; prompt: string };
/** Put the job's layout boxes into the graph, or (none) bypass the box nodes. Returns how many boxes went in. */
export function applyKleinBoxes(g: Record<string, any>, m: KleinBoxesMap | undefined, boxes: LayoutBox[] | null | undefined): number {
  if (!m || !g[m.node] || !g[m.layout]) return 0;
  if (boxes?.length) { g[m.node].inputs[m.field] = flux3LayoutElementsJson(boxes); return boxes.length; }
  for (const [id, n] of Object.entries<any>(g)) { if (id === m.layout) continue;
    for (const [k, v] of Object.entries<any>(n.inputs ?? {})) if (Array.isArray(v) && v.length === 2 && v[0] === m.layout) n.inputs[k] = [m.prompt, 0]; }
  return 0;
}
