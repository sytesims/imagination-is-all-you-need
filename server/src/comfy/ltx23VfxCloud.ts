/**
 * Footage Effects · Comfy Cloud (2026-10-27): four official Comfy LTX-2.3 IC-LoRA templates on shared Comfy Cloud, the Comfy Cloud place of
 * Footage Effects (routing/routes.ts TWINS: a twin of comfy-ltx25-iclora on footage-fx; standalone entry in comfy/cloudWorkflows.ts on route
 * comfy-cloud:cloud-ltx23-vfx). They run here only: the local route refuses them, and this place refuses the five local effects.
 * Graphs (workflows/cloud/, from Comfy-Org/workflow_templates, MIT; converted with scripts/ui2api.py, subgraphs flattened, template node ids kept):
 *  - ltx23-restore-footage-api.json   template_ltx2_3_lora_restore_archival_footage           Restore old footage (Dearchive IC-LoRA 1.0)
 *  - ltx23-remove-subtitles-api.json  template_ltx2_3_lora_remove_subtitles_from_video        Remove subtitles (Subtitle Remover IC-LoRA 1.2)
 *    both: LTX-2.3 22B dev, two stages (8 + 3 manual sigmas, CFG 1, euler), x2 latent upscale, the clip as an IC-LoRA guide on both stages
 *  - ltx23-remove-object-api.json     template_ltx2_3_obscura_remova_lora_remove_object_from_video  Remove an object (Obscura Remova 2.0 + distilled LoRA 0.4)
 *    one stage, 8 steps, euler_ancestral_cfg_pp / linear_quadratic; the prompt is the card's "Remove the {object} from the foreground."
 *  - ltx23-outpaint-api.json          template_ltx2_3_lora_video_outpainting                  Extend the frame (Outpaint IC-LoRA 1.0 + distilled LoRA 0.5)
 *    ADAPTED: VHS load / save → core LoadVideo / GetVideoComponents / CreateVideo / SaveVideo (our uploads only land on core loaders);
 *    the template's target-aspect maths → explicit ImagePadKJ pads from our plan (shared/footageFx.ts outpaintPlan: shape + direction);
 *    its ×0.5 pre-scale → ×1 (we conform the clip to the render size); the bypassed image-to-video step (and its LoadImage) removed.
 * Every class, LoRA and model file is in Comfy Cloud's object_info of 2026-10-26 (test/fixtures/object-info-ltx23-vfx-cloud-2026-10-26.json).
 * Our changes: the clip (conformed by our ffmpeg to 24 fps, the Draft / Sharper size, 8k + 1 frames) replaces the sample file; sizes, seed,
 * prompt and the clip's own sound (or none) are set per job; the before / after stitch branch is pruned (our viewer compares).
 * Price: an estimate from GPU time (hostedPrices.ts cloud-ltx23-vfx, priceUnmeasured) until one measured run sets it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORKFLOWS_DIR } from '../config.js';
import { pruneUnreachable, type Plan } from './plans.js';
import { footageEffect, isCloudEffect, type FootageFxPlan, type OutpaintPlan } from '../shared/footageFx.js';

export const VFX_CLOUD_PROVIDER = 'cloud-ltx23-vfx';
export const VFX_CLOUD_ROUTE = `comfy-cloud:${VFX_CLOUD_PROVIDER}`;
export const VFX_CLOUD_NAME = 'LTX-2.3 22B + IC-LoRA · Comfy Cloud';
/** Effect → its graph and the nodes the plan sets. */
type TwoStage = { kind: 'two-stage'; graph: string; p: string; load: string; out: string; audioFrom: string };
type OneStage = { kind: 'object'; graph: string; load: string; out: string } | { kind: 'outpaint'; graph: string; load: string; out: string };
export const VFX_CLOUD_GRAPHS: Record<string, TwoStage | OneStage> = {
  restore: { kind: 'two-stage', graph: 'cloud/ltx23-restore-footage-api.json', p: '5189:', load: '5188', out: '5187', audioFrom: '5190' },
  'remove-text': { kind: 'two-stage', graph: 'cloud/ltx23-remove-subtitles-api.json', p: '5161:', load: '5160', out: '5159', audioFrom: '5162' },
  'remove-object': { kind: 'object', graph: 'cloud/ltx23-remove-object-api.json', load: '39', out: '53' },
  'extend-frame': { kind: 'outpaint', graph: 'cloud/ltx23-outpaint-api.json', load: '5060', out: '5171' },
};
const load = (f: string) => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8')) as Record<string, any>;
const graphs = () => [...new Set(Object.values(VFX_CLOUD_GRAPHS).map((g) => g.graph))];
/** What Comfy Cloud must have: every class of the four graphs and every model file a loader widget names (read from the graphs themselves). */
export const VFX_CLOUD_REQUIRES = (() => {
  const nodes = new Set<string>(); const models = new Map<string, { loader: string; field: string; file: string }>();
  for (const f of graphs()) for (const n of Object.values<any>(load(f))) { nodes.add(String(n.class_type));
    for (const [k, v] of Object.entries<any>(n.inputs ?? {})) if (typeof v === 'string' && /\.(safetensors|gguf|pth)$/.test(v)) models.set(`${n.class_type}.${k}=${v}`, { loader: String(n.class_type), field: k, file: v }); }
  return { nodes: [...nodes].sort(), models: [...models.values()] };
})();

const effectOf = (i: Record<string, any>) => String(i?.footageFx?.effect ?? (Array.isArray(i?.types) ? i.types[0] : (() => { try { const v = JSON.parse(String(i?.types ?? '[]')); return Array.isArray(v) ? v[0] : v; } catch { return String(i?.types ?? '').split(',')[0]; } })()) ?? '').trim();
/** What this place can't take (null = fine): the five local effects run on your computer. Reads only what the quote also has (types). */
export function vfxCloudIssue(i: Record<string, any>): string | null {
  const id = effectOf(i); if (!id) return null; const e = footageEffect(id);
  return e && !e.cloud ? `${e.label} runs on your computer; on Comfy Cloud pick Restore old footage, Remove an object, Remove subtitles or Extend the frame` : null;
}
/** The local route can't take a Comfy Cloud effect (their templates and LoRAs are LTX-2.3 on Comfy Cloud). */
export function vfxLocalIssue(i: Record<string, any>): string | null {
  const id = effectOf(i); return isCloudEffect(id) ? `${footageEffect(id)!.label} runs on Comfy Cloud` : null;
}
const bad = (m: string) => Object.assign(new Error(m), { reasonCode: 'input_invalid', errorType: 'validation' });
const seedOf = (s: any) => Math.max(0, Math.floor(Number(s) || 0));
type J = { id: string; toolId: string; provider: string; input: Record<string, any> };
/** The plan: one pass of the effect's graph. input.footageFx = parseInput's plan (and outpaint plan for Extend the frame). */
export function vfxCloudPlan(j: J): Plan {
  const i = j.input; const f = i.footageFx ?? {}; const e = footageEffect(f.effect); const def = e ? VFX_CLOUD_GRAPHS[e.id] : undefined;
  if (!e || !e.cloud || !def) throw bad(vfxCloudIssue(i) ?? 'Pick a Comfy Cloud effect');
  const p = f.plan as FootageFxPlan | undefined; if (!p || !i.videoPath) throw bad('Footage Effects on Comfy Cloud: the clip was not prepared. Add it again and press Apply effect');
  const g = load(def.graph); const prompt = String(i.finalPrompt ?? ''); const negative = String(i.negative ?? e.negative); const seed = seedOf(i.seed); const keepAudio = i.keepAudio !== false && i.hasAudio !== false;
  g[def.load].inputs.file = { __file: i.videoPath };
  let size = { width: p.width, height: p.height }; let audioNode: string;
  if (def.kind === 'two-stage') {
    const n = (id: string) => g[`${def.p}${id}`];
    n('5091').inputs.text = prompt; n('5057').inputs.text = negative; n('5058').inputs.noise_seed = seed; n('5078').inputs.noise_seed = seed + 1;
    for (const id of ['5089']) Object.assign(n(id).inputs, { 'resize_type.width': p.stage1.width, 'resize_type.height': p.stage1.height });
    Object.assign(n('5093').inputs, { width: p.stage1.width, height: p.stage1.height });
    Object.assign(n('5068').inputs, { 'resize_type.width': p.width, 'resize_type.height': p.height });
    Object.assign(n('5087').inputs, { lora_name: e.cloud.loraFile, strength_model: e.strength });
    audioNode = `${def.p}5062`;
  } else if (def.kind === 'object') {
    g['54:9'].inputs.text = prompt; g['54:22'].inputs.text = negative; g['54:19'].inputs.seed = seed; g['54:50'].inputs.value = p.fps;
    Object.assign(g['54:41'].inputs, { 'resize_type.width': p.width, 'resize_type.height': p.height });
    Object.assign(g['54:15'].inputs, { lora_name: e.cloud.loraFile, strength_model: e.strength });
    audioNode = '54:36';
  } else {
    const o = f.outpaint as OutpaintPlan | undefined; if (!o) throw bad('Extend the frame on Comfy Cloud: pick a shape first');
    g['5151:5138'].inputs.text = prompt; g['5151:5131'].inputs.text = negative; g['5151:5117'].inputs.noise_seed = seed;
    Object.assign(g['5151:5139'].inputs, o.pad); Object.assign(g['5151:5146'].inputs, { lora_name: e.cloud.loraFile, strength_model: e.strength });
    size = { ...o.canvas }; audioNode = '5170';
  }
  if (!keepAudio) delete g[audioNode].inputs.audio;
  pruneUnreachable(g, [def.out]);
  return { tool: j.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false,
    notes: [`${e.label} on Comfy Cloud (official template ${e.cloud.template}): ${size.width}×${size.height}, ${p.frames} frames (${p.seconds} s), ${e.cloud.loraLabel} ${e.strength}`],
    passes: [{ label: e.label, workflow: def.graph, graph: g, output: def.out, expect: { width: size.width, height: size.height, frames: p.frames, effect: e.id } }] };
}
