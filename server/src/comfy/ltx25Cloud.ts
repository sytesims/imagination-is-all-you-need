/**
 * LTX-2.5 22B · Comfy Cloud (2026-10-27): the open LTX-2.5 22B on shared Comfy Cloud, the twin of the local routes comfy-ltx25-video (Generate
 * Video: text, start frame, Loop; Transitions: Morph) and comfy-ltx25-extend (Extend). Standalone entries in comfy/cloudWorkflows.ts on routes
 * comfy-cloud:cloud-ltx25-video / comfy-cloud:cloud-ltx25-extend, shown as the "Comfy Cloud" place of the LTX-2.5 22B card (routing/routes.ts TWINS).
 * Graphs (workflows/cloud/, every class and file checked against Comfy Cloud's object_info of 2026-10-26):
 *  - ltx25-ti2v-api.json / ltx25-flf-api.json: our local graphs (official templates video_ltx2_5_i2v / video_ltx2_5_flf2v, same node ids) with the
 *    template's own files: UNETLoader ltx-2.5-22b-distilled-transformer-comfy-int8-convrot (instead of the Mac's GGUF), Gemma 4 12B int8 ConvRot,
 *    video VAE bf16, audio VAE bf16, x2 latent upscaler. Two stages as the template (the distilled transformer needs no distilled LoRA).
 *    The plan is the local one (comfy/ltx25Video.ts patchLtx25Video, comfy/ltx25Extend.ts patchLtx25Extend) on these graphs.
 *  - ltx25-continue-api.json: Extend's picture-and-sound continuation (comfy/ltx25Extend.ts continuePlan / patchLtx25Continue), the default here.
 *  - Extend: ltx25Extend.ts extendSoundOnStage1 (stage-1 sound normaliser + freeze) is NOT applied: on Cloud it failed in SamplerCustomAdvanced
 *    ("mat1 and mat2 shapes cannot be multiplied", jobs feed2e65 / a17e3c2c, 2026-10-27).
 * Sizes: Draft / Sharper as local, plus 720p (1280×704 / 704×1280 / 960×960) which only this route renders. Lengths as local (2–5 s; Extend +2–5 s).
 * DFR (2026-10-29, comfy/ltx25Dfr.ts): the quality "DFR" on image to video runs the official template video_ltx2_5_dfr_i2v (cloud/ltx25-dfr-i2v-api.json,
 * the template's own files). Its detailing IC-LoRA was not on Comfy Cloud's public model list (read 2026-10-29), so a free GET-only check looks for it
 * before anything is uploaded (the shared library or the user's Hugging Face import); missing → refused with the import steps, nothing sent.
 * LoRA effects (Photo FX) are not offered: their files are not in Comfy Cloud's library.
 * Price: an estimate from GPU time (hostedPrices.ts cloud-ltx25-video, priceUnmeasured) until one measured run sets it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORKFLOWS_DIR } from '../config.js';
import type { Plan } from './plans.js';
import { pruneUnreachable } from './plans.js';
import { ltx25WorkflowFor, patchLtx25Video, isLtx25Loop, LTX25_TI2V_WORKFLOW, LTX25_FLF_WORKFLOW } from './ltx25Video.js';
import { patchLtx25Extend, patchLtx25Continue, LTX25_CONTINUE_CONTEXT, type ExtendPlan } from './ltx25Extend.js';
import { ltxLorasForJob } from '../shared/ltxLoras.js';
import { LTX25_DFR_CLOUD_GRAPH, ltxDfrPlan } from './ltx25Dfr.js';
import { LTX_DFR_FILES, LTX_DFR_LORA_HF, ltxDfrRuns } from '../shared/ltxDfr.js';
import { checkImportedLora, importSteps, importMissing } from './cloudImports.js';

export const LTX25_CLOUD_PROVIDER = 'cloud-ltx25-video';
export const LTX25_CLOUD_ROUTE = `comfy-cloud:${LTX25_CLOUD_PROVIDER}`;
export const LTX25_CLOUD_EXTEND_PROVIDER = 'cloud-ltx25-extend';
export const LTX25_CLOUD_EXTEND_ROUTE = `comfy-cloud:${LTX25_CLOUD_EXTEND_PROVIDER}`;
export const LTX25_CLOUD_NAME = 'LTX-2.5 22B · Comfy Cloud';
/** Local graph → its Comfy Cloud graph. */
export const LTX25_CLOUD_GRAPHS: Record<string, string> = { [LTX25_TI2V_WORKFLOW]: 'cloud/ltx25-ti2v-api.json', [LTX25_FLF_WORKFLOW]: 'cloud/ltx25-flf-api.json' };
export const LTX25_CONTINUE_GRAPH = 'cloud/ltx25-continue-api.json';
/** The model files (all in Comfy Cloud's shared library, object_info 2026-10-26; the same files as the official templates). */
export const LTX25_CLOUD_FILES = {
  unet: 'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors',
  textEncoder: 'gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors',
  videoVae: 'ltx-2.5-video-vae-bf16.safetensors',
  audioVae: 'ltx-2.5-audio-vae-bf16.safetensors',
  upscaler: 'ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors',
} as const;
/** DFR's detailing IC-LoRA: its plain name (Comfy Cloud's shared library) or the name Comfy Cloud gives a Hugging Face import. */
export const LTX_DFR_LORA_IMPORTED = `Lightricks__LTX-2.5-22b-IC-LoRA-Pixel-Spatial-Upscaler__${LTX_DFR_FILES.icLora}`;
export const LTX_DFR_IMPORT_STEPS = importSteps({ hf: LTX_DFR_LORA_HF, type: 'LoRA', importAs: LTX_DFR_LORA_IMPORTED, gated: { repo: 'https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Pixel-Spatial-Upscaler' } });
export const LTX_DFR_LORA_MISSING = importMissing('LTX-2.5 DFR', `Lightricks’ pixel-spatial detailing IC-LoRA (${LTX_DFR_FILES.icLora})`, LTX_DFR_IMPORT_STEPS);
/** Free check (GET only): is DFR's IC-LoRA in this account's Comfy Cloud (shared library or an import)? */
export const checkDfrLora = (get: (p: string) => Promise<Response>) => checkImportedLora(get, { file: LTX_DFR_FILES.icLora, aliases: [LTX_DFR_LORA_IMPORTED], stem: 'pixel-spatial-upscaler' });
/** The route's preflight: DFR jobs only (other LTX-2.5 jobs need no import). Refuses when the check answered without the LoRA. */
export async function ltx25CloudPreflight(get: (p: string) => Promise<Response>, input?: Record<string, any>): Promise<Record<string, any>> {
  if (!input || !ltxDfrRuns(input)) return {};
  const c = await checkDfrLora(get);
  if (c.state === 'missing') throw Object.assign(new Error(LTX_DFR_LORA_MISSING), { reasonCode: 'cloud_import_missing', errorType: 'validation' });
  return c.loaderPath ? { dfrLora: c.loaderPath } : {};
}
const load = (f: string) => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8')) as Record<string, any>;
const classesOf = (...fs: string[]) => [...new Set(fs.flatMap((f) => Object.values<any>(load(f)).map((n) => String(n.class_type))))].sort();
/** What Comfy Cloud must have (nodes of every graph + the model files and their loader widgets). */
export const LTX25_CLOUD_REQUIRES = {
  nodes: [...new Set([...classesOf(...Object.values(LTX25_CLOUD_GRAPHS), LTX25_CONTINUE_GRAPH), 'LoadVideo', 'GetVideoComponents', 'ImageFromBatch', 'ColorTransfer', 'LTXVFreezeLatent', 'LTX2AudioLatentNormalizingSampling'])].sort(),
  models: [
    { loader: 'UNETLoader', field: 'unet_name', file: LTX25_CLOUD_FILES.unet },
    { loader: 'CLIPLoader', field: 'clip_name', file: LTX25_CLOUD_FILES.textEncoder },
    { loader: 'VAELoader', field: 'vae_name', file: LTX25_CLOUD_FILES.videoVae },
    { loader: 'VAELoader', field: 'vae_name', file: LTX25_CLOUD_FILES.audioVae },
    { loader: 'LatentUpscaleModelLoader', field: 'model_name', file: LTX25_CLOUD_FILES.upscaler },
    // DFR's extra files (its IC-LoRA is checked per DFR run, ltx25CloudPreflight; its generated-keyframe nodes are newer than the 2026-10-26 object_info copy, so they
    // are not part of this probe: Cloud's own submit validation refuses a graph it can't run, free)
    { loader: 'CLIPLoader', field: 'clip_name', file: LTX_DFR_FILES.textEncoder },
    { loader: 'LatentUpscaleModelLoader', field: 'model_name', file: LTX_DFR_FILES.temporalUpscaler },
  ],
};
/** Rendered seconds a job bills on Comfy Cloud (GPU time follows the frames the model makes): Generate = the clip; Extend = the kept context
 *  (continuation: 121 frames = 5.04 s) or the guide frames (guide: 1 / 9 / 17) + the new seconds. Read from the ASKED fields only (extendSeconds,
 *  extendMethod, guideFrames), so the quote before the upload and the charge after it agree; a source shorter than 5 s renders less than quoted.
 *  Used by the Extend twin's priceInput. */
export function ltx25CloudRenderSeconds(i: Record<string, any>): number {
  if (i?.ltxExtend || i?.extendSeconds != null || i?.mode === 'extend') {
    const add = Number(i.extendSeconds ?? i.duration) || 2; const G = Number(i.guideFrames) || 9;
    const kept = i.extendMethod === 'guide' ? G : LTX25_CONTINUE_CONTEXT;
    return Math.round((add + kept / 24) * 100) / 100;
  }
  return Number(i?.duration) || 0;
}
/** Extend on Comfy Cloud: the picture-and-sound continuation unless the job asks for the last-frames guide (or the clip is too short for it). */
export const cloudExtendMethod = (i: Record<string, any>): 'continue' | 'guide' => (i?.extendMethod === 'guide' || !i?.ltxExtend?.continuePlan ? 'guide' : 'continue');
/** What this route can't take (null = fine): LoRA effects (Photo FX) need files that are not on Comfy Cloud. */
export function ltx25CloudIssue(i: Record<string, any>): string | null {
  if (i?.extendMethod === 'continue' && i?.ltxExtend && !i.ltxExtend.continuePlan) return i.ltxExtend.continueError ?? 'This clip is too short for the picture-and-sound continuation';
  return null;
}
type J = { id: string; toolId: string; provider: string; input: Record<string, any> };
const seedOf = (s: any) => Math.max(0, Math.floor(Number(s) || 0));
/** The plan: Extend (continuation or guide) on h3-extend; Generate Video / Loop / Morph otherwise. Same patches as local, Cloud graphs. */
export function ltx25CloudPlan(j: J): Plan {
  const i = j.input;
  if (j.toolId === 'h3-extend' || i.ltxExtend) {
    const x = i.ltxExtend; if (!x?.plan) throw new Error('LTX-2.5 Extend on Comfy Cloud: the clip was not prepared');
    const prompt = String(i.finalPrompt ?? i.prompt ?? '');
    if (cloudExtendMethod(i) === 'continue') {
      const p: ExtendPlan = x.continuePlan; if (!x.contextPath || !x.contextAudioPath) throw new Error('LTX-2.5 Extend on Comfy Cloud: the context clip is missing');
      const { graph, output, expect } = patchLtx25Continue(load(LTX25_CONTINUE_GRAPH), { prompt, seed: seedOf(i.seed), plan: p, video: { __file: x.contextPath }, audio: { __file: x.contextAudioPath } }); pruneUnreachable(graph, [output]);
      const label = `+${p.seconds} s (${p.out.seconds.toFixed(1)} s total)`;
      return { tool: j.toolId, outKind: 'video', post: { kind: 'extend', plan: p, label }, muxSourceAudio: false, passes: [{ label, workflow: LTX25_CONTINUE_GRAPH, graph, output, expect }],
        notes: [`Picture-and-sound continuation: the last ${p.guideFrames} frames (${(p.guideFrames / p.fps).toFixed(2)} s) of picture and sound kept, ${p.crossfade}-frame picture fade, sound cut at the edit`] };
    }
    const p: ExtendPlan = x.plan; const wf = LTX25_CLOUD_GRAPHS[LTX25_TI2V_WORKFLOW];
    const { graph, output, expect } = patchLtx25Extend(load(wf), { prompt, seed: seedOf(i.seed), plan: p, guide: { __file: x.guidePath } }); pruneUnreachable(graph, [output]);
    const label = `+${p.seconds} s (${p.out.seconds.toFixed(1)} s total)`;
    return { tool: j.toolId, outKind: 'video', post: { kind: 'extend', plan: p, label }, muxSourceAudio: false, passes: [{ label, workflow: wf, graph, output, expect }],
      notes: [`${p.guideFrames} guide frame(s), ${p.crossfade}-frame crossfade`] };
  }
  if (j.toolId === 'h3-video' && ltxDfrRuns(i)) return ltxDfrPlan(j.toolId, LTX25_DFR_CLOUD_GRAPH, load(LTX25_DFR_CLOUD_GRAPH), i, seedOf(i.seed), { lora: i.dfrLora ?? null }); // DFR quality (comfy/ltx25Dfr.ts)
  if (j.toolId === 'photo-fx' || ltxLorasForJob(j.toolId, 'comfy-ltx25-video', i).length) throw Object.assign(new Error('LoRA effects run on this computer only: their files are not in Comfy Cloud\'s library. Nothing was sent or charged'), { reasonCode: 'input_blocked', errorType: 'validation' });
  const local = ltx25WorkflowFor(i.mode, isLtx25Loop(i)); const wf = LTX25_CLOUD_GRAPHS[local];
  const { graph, output, expect } = patchLtx25Video(load(wf), i, seedOf(i.seed), []); pruneUnreachable(graph, [output]);
  return { tool: j.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false, notes: [], passes: [{ label: 'Result', workflow: wf, graph, output, expect }] };
}
