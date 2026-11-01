/**
 * HW-SHAPES B2 (Oct 19 2026): per local route requirements and the fit verdict for THIS computer.
 *  - recommendedVramGB re-runs readiness/manifest/build-manifest.py wf_meta() in TS with the Hugging Face size fill-ins
 *    (modelWeights.ts HF_API_SIZES), so the flux3klein rows (manifest 1.5, sizes were missing) become ≈8.6 and RIFE / DAv2 get a value.
 *    Formula: max(resident DiT + LoRAs, text encoder offloaded after encode) + VAE + aux + activations (1.5 GB image/audio, 4 GB video).
 *  - Reference pictures (2026-10-31): graphs whose encoder splices them into the sequence add REF_GB_PER_MP × their megapixels to R and M (below).
 *  - minVramGB (ESTIMATE): activations + VAE + aux + 25 % of the resident DiT (ComfyUI offloads the rest to RAM). ramMinGB = largest resident file + 8 GB.
 *  - variants[]: lighter files verified on the public Hugging Face API tree listing (Oct 19 2026). Information only (wired:false), except GGUF
 *    drop-ins for a UNETLoader DiT, which become runnable (selectable with variantId) when the connected ComfyUI reports UnetLoaderGGUF (Q7).
 *  - fit rules, in order (E effective VRAM, R recommended, M min): unknown tier → unknown (not enforced) · ComfyUI too old → too_heavy/comfy_too_old ·
 *    no GPU → slow/cpu (image tools ≤ 2 GB) else too_heavy/no_gpu · MPS + fp8 → too_heavy/unsupported_weights · R ≤ E − 1 → fits ·
 *    M ≤ E and RAM ≥ ramMinGB → slow/offload (MPS amber: slow/mps) · else too_heavy/not_enough_vram (not_enough_ram when only RAM is short).
 *  - DP 3: weights missing and bigger than the free disk → fit.reasonCode not_enough_disk (+ missingBytes, diskFreeBytes); the verdict stays.
 *  - HW2 (DP, Oct 19): missingBytesSource 'checked' (files looked up in the models folder, or a test override) | 'assumed_all' (no models folder:
 *    missingBytes = every needed file, missingFiles stays null, so no disk blocker or weights gate is raised from a guess).
 *    downloadId = the download for exactly this route's files (POST /api/local/downloads {downloadId}): the providerId when the provider declares
 *    its workflows and the job needs all of them, else '<providerId>:<workflow slugs joined by +>' (slug = file name without '-api.json').
 */
import { ltxDfrRuns } from '../shared/ltxDfr.js';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env.js';
import { HF_SIZES, weightsForWorkflows, weightFileOf } from '../modelWeights.js';
import { platformOf, swapsFor, swappedPicks, type PlatformKey } from './variants.js';
import { getProvider, providerWorkflows } from '../providers.js';
import { etaFor } from '../timing.js';
import { VUP_MODELS, vupSourceFactor } from '../shared/videoUpscale.js';
/** True when this Video Upscale engine has a measured run on this machine class (its other sizes are scaled from it). */
const vupMeasuredOn = (providerId: string, cls: string) => Object.values((VUP_MODELS[providerId]?.speed as any)?.[cls] ?? {}).some((c: any) => c?.measured);
import { currentHardware, type Hardware, type Tier } from '../hardware.js';
import { blend, etaKey, isImageJob, unitsOf, type Eta } from '../etaLearn.js';
import { jobFeatures, estimateFor, type EtaRange } from '../stepEta.js';
import type { ToolDef } from '../tools/types.js';
import { macBlockedFiles, MAC_WEIGHTS_REASON } from './macWeights.js';
import { LTX_LORAS, ltxLorasForJob } from '../shared/ltxLoras.js';
import { comfyFoldersKnown, comfyFileBytes, comfyModelsStamp } from './comfyModels.js';
import { optionalFileSkipped } from '../comfy/flux3Klein.js';
import { bfsSwapFor } from '../comfy/bfsSwap.js';
import { IMAGE_FEATURES } from '../shared/imageFeatures.js';
import { RES_PX } from '../shared/imageCaps.js';
import { soulWorkflowOf } from '../tools/soul/plan.js';
import { REEL_TOOL_IDS } from '../shared/photosToReel.js';

const MANIFEST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../readiness/manifest/models.json');
const WF_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../workflows');
type MRow = { file: string; folder: string; size?: number | null; url: string; sha256?: string | null; hf_repo?: string | null; loaded_by: string[]; input: string[]; workflows: string[]; auto_downloaded_by_pack?: boolean };
type MWf = { models: string[]; vram_est_gb?: number; mps?: string; mps_notes?: string[]; note?: string; variants?: unknown };
let man: { models: MRow[]; workflows: Record<string, MWf> } | null = null;
export const manifest = (): { models: MRow[]; workflows: Record<string, MWf> } => (man ??= ((): { models: MRow[]; workflows: Record<string, MWf> } => { try { const j = JSON.parse(readFileSync(MANIFEST, 'utf8')); return { models: j.models ?? [], workflows: j.workflows ?? {} }; } catch { return { models: [], workflows: {} }; } })());
const sizeGb = (r: MRow) => { const b = r.size ?? HF_SIZES[r.file] ?? null; return b == null ? 0 : Math.round((b / 1e9) * 100) / 100; };
const ROLE: Record<string, string> = { unet_name: 'dit', ckpt_name: 'dit', model: 'dit', text_encoder: 'te', clip_name: 'te', clip_name1: 'te', clip_name2: 'te', lora_name: 'lora', vae_name: 'vae' };
const roleOf = (m: MRow) => (['UNETLoader', 'UnetLoaderGGUF', 'CheckpointLoaderSimple', 'SeedVR2LoadDiTModel'].some((n) => m.loaded_by.includes(n)) ? 'dit' : ROLE[m.input[0]] ?? 'aux');
const r1 = (x: number) => Math.round(x * 10) / 10;
export interface WfVram { workflow: string; recommendedVramGB: number; minVramGB: number; residentGB: number; teGB: number; largestFileGB: number; video: boolean; mps: 'green' | 'amber' | 'red'; mpsNotes: string[]; files: string[] }
const wfCache = new Map<string, WfVram | null>();
/** build-manifest.py wf_meta() for one workflow key ('workflows/x-api.json' or 'plugins/…/workflow.json'), sizes filled from HF_SIZES. */
export function wfVram(key: string): WfVram | null {
  const k = key.includes('/') ? key : `workflows/${key}`; if (wfCache.has(k)) return wfCache.get(k)!;
  const ms = manifest().models.filter((m) => (m.workflows ?? []).includes(k));
  if (!ms.length) { // a graph whose node pack fetches its own weights (Chatterbox, F5-TTS): the manifest's estimate, no files (build-manifest.py PACK_WORKFLOWS, hardware plan B7)
    const mw = manifest().workflows[k]; const est = Number(mw?.vram_est_gb); const v: WfVram | null = mw && est > 0 ? { workflow: k, recommendedVramGB: est, minVramGB: est, residentGB: 0, teGB: 0, largestFileGB: 0, video: false, mps: (mw.mps as WfVram['mps']) ?? 'green', mpsNotes: mw.mps_notes ?? [], files: [] } : null;
    wfCache.set(k, v); return v; }
  const dits = ms.filter((m) => roleOf(m) === 'dit').map(sizeGb).sort((a, b) => b - a); const te = Math.max(0, ...ms.filter((m) => roleOf(m) === 'te').map(sizeGb));
  const sum = (role: string) => ms.filter((m) => roleOf(m) === role).reduce((a, m) => a + sizeGb(m), 0);
  const loras = sum('lora'); const vae = sum('vae'); const aux = sum('aux');
  const video = ['h3-', 'camera', 'motion', 'object-swap', 'reshoot', 'restyle', 'upscale-', 'photo-fx', 'wan22-', 'ltx25-'].some((x) => k.includes(x)) && !k.includes('image-upscale'); const act = video ? 4 : 1.5;
  const names = ms.map((m) => m.file).join(' '); const resident = (dits[0] ?? 0) + loras / (dits.length > 1 && names.includes('wan2.2') ? 2 : 1);
  const peak = r1(Math.max(resident, te) + vae + aux + act);
  const low = names.toLowerCase(); let mps: WfVram['mps'] = 'green'; const notes: string[] = [];
  const mw = manifest().workflows[k]; if (mw?.mps) { mps = mw.mps as any; notes.push(...(mw.mps_notes ?? [])); } else {
    if (low.includes('fp8')) { mps = 'red'; notes.push('fp8 weights: MPS has no float8 dtype'); } if (low.includes('nvfp4') && mps !== 'red') mps = 'amber'; if (low.includes('int8_convrot') && mps !== 'red') mps = 'amber'; if (low.includes('bf16') && mps === 'green') mps = 'amber'; }
  const v: WfVram = { workflow: k, recommendedVramGB: peak, minVramGB: r1(act + vae + aux + 0.25 * resident), residentGB: r1(resident), teGB: te, largestFileGB: Math.max(0, ...ms.map(sizeGb)), video, mps, mpsNotes: notes, files: ms.map((m) => m.file) };
  wfCache.set(k, v); return v;
}
// ---- reference pictures (2026-10-31) ----
/** Memory each reference picture adds, in GB per megapixel of reference, by the graph's reference encoder. The encoder puts every reference
 *  into the transformer's sequence (1 MP = 4096 tokens on Qwen Image 2.1), so the need grows with the number and size of the pictures.
 *  Qwen Image 2.1 (TextEncodeQwenImage21), measured on an M1 Max 64 GB (ComfyUI, MPS, split attention): one 1024 picture finishes, two peak at
 *  70–79 GB. base 11.7 + 2 × 32 ≈ 76 matches the two-picture peak; one picture = 43.7, under a 64 GB Mac's 48 GB. Other GPUs (memory-efficient
 *  attention): the prefix cache only, ≈ 2.2 GB per 4096 tokens in bf16 (2 × 32 layers × 4096 hidden × 2 bytes). Add a row to cover another encoder. */
export const REF_GB_PER_MP: Record<string, { mps: number; other: number }> = { TextEncodeQwenImage21: { mps: 32, other: 2.2 } };
const refSlotsCache = new Map<string, { encoder: string; mp: number[] } | null>();
/** A graph's reference slots: the encoder (a REF_GB_PER_MP class) and each linked picture's megapixels as the graph sizes it
 *  (the encoder's `resolution`², or with resolution 0 the ImageScaleToTotalPixels in front of it; unknown = 1 MP). */
export function refSlots(workflow: string): { encoder: string; mp: number[] } | null {
  const w = workflow.replace(/^workflows\//, ''); if (refSlotsCache.has(w)) return refSlotsCache.get(w)!; let out: { encoder: string; mp: number[] } | null = null;
  try { const g = JSON.parse(readFileSync(path.join(WF_DIR, w), 'utf8')) as Record<string, any>;
    const enc = Object.values<any>(g).find((n) => REF_GB_PER_MP[n?.class_type]);
    if (enc) { const res = Number(enc.inputs?.resolution ?? 0);
      const mp = Object.entries<any>(enc.inputs ?? {}).filter(([k, v]) => /^images\.image_\d+$/.test(k) && Array.isArray(v)).sort(([a], [b]) => Number(a.split('_').pop()) - Number(b.split('_').pop()))
        .map(([, v]) => { if (res > 0) return (res / 1024) ** 2; const s = g[v[0]]; return s?.class_type === 'ImageScaleToTotalPixels' ? Number(s.inputs?.megapixels) || 1 : 1; });
      out = { encoder: enc.class_type, mp }; } } catch { /* unreadable workflow: no reference term */ }
  refSlotsCache.set(w, out); return out;
}
/** How many reference pictures this job sends: the job's own (refPaths, else the one photo), else the feature's minimum (Material Swap 2), else 1.
 *  Create Image with no picture and no edit mode is text to image: none (its edit graph is only listed as the worst case, it doesn't run). */
const refCountOf = (tool: ToolDef, input: Record<string, any>) => {
  const own = Array.isArray(input.refPaths) && input.refPaths.length ? input.refPaths.length : Array.isArray(input.refUrls) && input.refUrls.length ? input.refUrls.length : input.imagePath ? 1 : 0;
  if (own) return own;
  if (tool.id === 'create-image') return input.mode === 'edit' || (Array.isArray(input.types) && input.types.includes('edit')) ? 1 : 0;
  const f = IMAGE_FEATURES.find((x) => x.toolId === tool.id && tool.id !== 'create-image'); return typeof f?.images[0] === 'number' && f.images[0] > 0 ? f.images[0] : 1;
};
/** GB the job's reference pictures add on this hardware (0 when the graph has no reference encoder). Edit Image's 1K / 2K resizes them (comfy/plans.ts editSize). */
export function refMemoryGB(tool: ToolDef, workflow: string, input: Record<string, any> = {}, hw: Hardware = currentHardware()): number {
  const s = refSlots(workflow); if (!s || !s.mp.length) return 0; const per = REF_GB_PER_MP[s.encoder]; const gb = hw.gpu?.type === 'mps' ? per.mps : per.other;
  const res = tool.id === 'create-image' && input.imageResolution ? RES_PX[input.imageResolution as keyof typeof RES_PX] : null;
  const mp = s.mp.slice(0, refCountOf(tool, input)).map((x) => (res ? (res / 1024) ** 2 : x)).reduce((a, b) => a + b, 0);
  return r1(gb * mp);
}
// ---- lighter variants (public HF API tree, Oct 19 2026; /workspace pb-scratch/hw cache) ----
export interface Variant { id: string; file: string; repoPath: string; url: string; folder: string; bytes: number; precision: string; loader: 'core' | 'gguf'; replaces: string; dropIn: boolean;
  vramEstGB: number; vramEstimate: true; verified: string; wired: boolean; runnable: boolean; pageUrl: string; licence: string; note: string | null; providers: string[] }
const HF = (repo: string, p: string) => `https://huggingface.co/${repo}/resolve/main/${p}`;
const V = (id: string, repo: string, repoPath: string, bytes: number, precision: string, loader: 'core' | 'gguf', replaces: string, providers: string[], vramEstGB: number, dropIn: boolean, note: string | null = null, folder = loader === 'gguf' ? 'unet' : 'diffusion_models'): Omit<Variant, 'runnable' | 'wired'> => ({
  id, file: path.basename(repoPath), repoPath, url: HF(repo, repoPath), folder, bytes, precision, loader, replaces, dropIn, vramEstGB, vramEstimate: true, verified: 'hf-api-tree 2026-10-19', pageUrl: `https://huggingface.co/${repo}`,
  licence: 'same as base model (verify the repo card before wiring)', note, providers });
export const VARIANTS: Omit<Variant, 'runnable' | 'wired'>[] = [
  V('h3-fl2va-pruned-w6a8', 'Comfy-Org/MiniMax-H3', 'diffusion_models/minimax_h3_fl2va_pruned_w6a8.safetensors', 15983746636, 'w6a8', 'core', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors', ['comfy-h3', 'comfy-h3-extend', 'comfy-h3-camera'], 25.4, false, 'w6a8 runtime support not verified'),
  V('h3-fl2va-pruned-fp8', 'Comfy-Org/MiniMax-H3', 'diffusion_models/minimax_h3_fl2va_pruned_fp8_scaled.safetensors', 20958205608, 'fp8_scaled', 'core', 'minimax_h3_fl2va_pruned_int8_convrot.safetensors', ['comfy-h3', 'comfy-h3-extend', 'comfy-h3-camera'], 30.4, false, 'same size as the int8 file; for GPUs without int8 kernels'),
  V('h3-ref2va-pruned-w6a8', 'Comfy-Org/MiniMax-H3', 'diffusion_models/minimax_h3_ref2va_pruned_w6a8.safetensors', 15983746636, 'w6a8', 'core', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', ['comfy-h3-lipsync', 'comfy-h3-restyle', 'comfy-h3-vfx', 'comfy-h3-charswap'], 25.4, false, 'w6a8 runtime support not verified'),
  V('ltx2-dev-fp4', 'Lightricks/LTX-2', 'ltx-2-19b-dev-fp4.safetensors', 19988416674, 'fp4', 'core', 'ltx-2-19b-dev-fp8.safetensors', ['comfy-open'], 34.0, false, 'fp4 is accelerated on Blackwell GPUs only', 'checkpoints'),
  V('ltx2-dev-q4km-unsloth', 'unsloth/LTX-2-GGUF', 'ltx-2-19b-dev-Q4_K_M.gguf', 12840118752, 'Q4_K_M', 'gguf', 'ltx-2-19b-dev-fp8.safetensors', ['comfy-open'], 26.9, false, 'transformer only: the VAE and connectors are separate files, so not a drop-in for the checkpoint loader'),
  V('ltx2-dev-q8-unsloth', 'unsloth/LTX-2-GGUF', 'ltx-2-19b-dev-Q8_0.gguf', 20407560672, 'Q8_0', 'gguf', 'ltx-2-19b-dev-fp8.safetensors', ['comfy-open'], 33.0, false, 'transformer only (not a drop-in)'),
  V('ltx2-dev-q4km-quantstack', 'QuantStack/LTX-2-GGUF', 'LTX-2-dev/LTX-2-dev-Q4_K_M.gguf', 13374456704, 'Q4_K_M', 'gguf', 'ltx-2-19b-dev-fp8.safetensors', ['comfy-open'], 27.4, false, 'transformer only (not a drop-in)'),
  V('wan-animate-fp8-kj-v2', 'Kijai/WanVideo_comfy_fp8_scaled', 'Wan22Animate/Wan2_2-Animate-14B_fp8_scaled_e4m3fn_KJ_v2.safetensors', 17317143060, 'fp8_scaled', 'core', 'Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ.safetensors', ['comfy-open'], 24.1, true),
  V('wan-animate-q4km', 'QuantStack/Wan2.2-Animate-14B-GGUF', 'Wan2.2-Animate-14B-Q4_K_M.gguf', 11496331072, 'Q4_K_M', 'gguf', 'Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ.safetensors', ['comfy-open'], 18.3, true),
  V('wan-animate-q3km', 'QuantStack/Wan2.2-Animate-14B-GGUF', 'Wan2.2-Animate-14B-Q3_K_M.gguf', 8630769472, 'Q3_K_M', 'gguf', 'Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ.safetensors', ['comfy-open'], 15.5, true),
  V('wan-vace-q4km', 'QuantStack/Wan2.1_14B_VACE-GGUF', 'Wan2.1_14B_VACE-Q4_K_M.gguf', 11639453600, 'Q4_K_M', 'gguf', 'wan2.1_vace_14B_fp16.safetensors', ['comfy-open'], 16.6, true),
  V('wan-vace-q8', 'QuantStack/Wan2.1_14B_VACE-GGUF', 'Wan2.1_14B_VACE-Q8_0.gguf', 18663274400, 'Q8_0', 'gguf', 'wan2.1_vace_14B_fp16.safetensors', ['comfy-open'], 23.6, true),
  V('qwen-image-q4km', 'city96/Qwen-Image-gguf', 'qwen-image-Q4_K_M.gguf', 13065746976, 'Q4_K_M', 'gguf', 'qwen_image_fp8_e4m3fn.safetensors', ['comfy-qwen-image'], 16.5, true),
  V('qwen-image-q8', 'city96/Qwen-Image-gguf', 'qwen-image-Q8_0.gguf', 21761817120, 'Q8_0', 'gguf', 'qwen_image_fp8_e4m3fn.safetensors', ['comfy-qwen-image'], 25.2, true),
  V('flux2-te-fp4', 'Comfy-Org/flux2-dev', 'split_files/text_encoders/mistral_3_small_flux2_fp4_mixed.safetensors', 12275678071, 'fp4_mixed', 'core', 'mistral_3_small_flux2_bf16.safetensors', ['comfy-flux2dev'], 40.0, false, 'text encoder only; the DiT dominates', 'text_encoders'),
  V('flux2-te-fp8', 'Comfy-Org/flux2-dev', 'split_files/text_encoders/mistral_3_small_flux2_fp8.safetensors', 18034640095, 'fp8', 'core', 'mistral_3_small_flux2_bf16.safetensors', ['comfy-flux2dev'], 40.0, false, 'text encoder only', 'text_encoders'),
  V('flux2-dit-q4km', 'city96/FLUX.2-dev-gguf', 'flux2-dev-Q4_K_M.gguf', 20082414560, 'Q4_K_M', 'gguf', 'flux2_dev_fp8mixed.safetensors', ['comfy-flux2dev'], 24.6, true, 'pair with the fp4 text encoder for the ≈24.6 GB estimate'),
  // FLUX.2 [klein] 4B (2026-10-22): both workflows load the bf16 DISTILLED file (flux-2-klein-4b.safetensors, Mac-safe default); fp8 is the NVIDIA-only lighter file
  V('klein4b-fp8', 'black-forest-labs/FLUX.2-klein-4b-fp8', 'flux-2-klein-4b-fp8.safetensors', 4070624520, 'fp8', 'core', 'flux-2-klein-4b.safetensors', ['comfy-klein4b'], 6.2, true, 'NVIDIA only: MPS (Apple Silicon) has no float8, so Macs keep the bf16 distilled file'),
  V('zimage-turbo-int8', 'Comfy-Org/z_image_turbo', 'split_files/diffusion_models/z_image_turbo_int8_convrot.safetensors', 6201001296, 'int8_convrot', 'core', 'z_image_turbo_bf16.safetensors', ['comfy-zimage-turbo', 'comfy-soul'], 8.1, true),
  V('zimage-turbo-nvfp4', 'Comfy-Org/z_image_turbo', 'split_files/diffusion_models/z_image_turbo_nvfp4.safetensors', 4509509600, 'nvfp4', 'core', 'z_image_turbo_bf16.safetensors', ['comfy-zimage-turbo', 'comfy-soul'], 8.1, true, 'nvfp4 is accelerated on Blackwell GPUs only'),
  V('drama3-w4a8', 'PedroMarinhoDev/Drama-3-ComfyUI', 'drama3_w4a8experts_bf16.safetensors', 24603565376, 'w4a8', 'core', 'drama3_fp8experts_bf16.safetensors', ['comfy-drama3'], 27.6, false, 'whether our Drama3 node pack loads w4a8 is not verified'),
  V('drama3-w6a8', 'PedroMarinhoDev/Drama-3-ComfyUI', 'drama3_w6a8experts_bf16.safetensors', 32656613840, 'w6a8', 'core', 'drama3_fp8experts_bf16.safetensors', ['comfy-drama3'], 35.6, false, 'not verified with our node pack'),
];
/** Q7: GGUF drop-ins (a UNETLoader DiT) are runnable when the connected ComfyUI reports UnetLoaderGGUF; everything else is information only. */
export const variantRunnable = (v: Omit<Variant, 'runnable' | 'wired'>, hw: Hardware = currentHardware()) => v.loader === 'gguf' && v.dropIn && hw.comfy.ggufNode === true;
export const variantView = (v: Omit<Variant, 'runnable' | 'wired'>, hw: Hardware = currentHardware()): Variant => { const run = variantRunnable(v, hw); return { ...v, wired: run, runnable: run }; };
export const findVariant = (id: string) => VARIANTS.find((v) => v.id === id) ?? null;
// ---- per route requirements ----
export interface Requirements { workflows: string[]; recommendedVramGB: number | null; minVramGB: number | null; minVramEstimate: true; downloadBytes: number; downloadGB: number; missingBytes: number | null; missingBytesSource: 'checked' | 'assumed_all'; missingFiles: { file: string; folder: string; bytes: number | null; url: string; autoDownloaded: boolean; /** on disk but smaller than its size: still downloading */ partial?: boolean; haveBytes?: number }[] | null;
  ramMinGB: number | null; mps: 'green' | 'amber' | 'red' | null; mpsNotes: string[]; minComfyVersion: string | null; secondsPerTier: Record<'all' | 'most' | 'light' | 'mac', { seconds: number; source: 'cited' | 'estimate'; gpuClass: string } | null>;
  variants: Variant[]; variantId: string | null; /** 2026-10-25: this route's weight files a Mac can't load (hardware/macWeights.ts; [] = none). */ macBlockedFiles: string[]; downloadable: boolean; modelsDir: string | null; modelsDirSet: boolean; downloadId: string;
  /** Setup step 4: where "on this computer" was checked: 'models_dir' (OPENHIGGSFIELD_COMFY_MODELS_DIR), 'comfyui' (the connected ComfyUI's own model lists, e.g. Comfy Desktop), null (not checked: assumed_all). */
  presenceSource: 'models_dir' | 'comfyui' | null;
  /** Item 5 (2026-10-31): this computer's platform key (hardware/variants.ts) and, when its pick swaps files, that variant: verified false = not run on
   *  this platform yet ("should run here, not tested yet"); needsNodes = loader nodes the swapped files need (UnetLoaderGGUF for a .gguf DiT). */
  platform: PlatformKey | null; variant: { platform: PlatformKey; verified: boolean; format: string | null; needsNodes: string[]; files: string[] } | null }
/** Which of the provider's workflows serve this job: Camera LTX moves → camera-ltx*; a mode named in the file (h3-t2v, …-edit-…) → those; else all. */
/** Graphs a model runs only at one quality, kept out of its card's default set (downloads, Ready): LTX-2.5 22B's DFR (2026-10-29, shared/ltxDfr.ts). */
export const QUALITY_WORKFLOWS: Record<string, { workflow: string; runs: (input: Record<string, any>) => boolean }[]> = { 'comfy-ltx25-video': [{ workflow: 'ltx25-dfr-i2v-api.json', runs: ltxDfrRuns }] };
export function jobWorkflows(tool: ToolDef, providerId: string, input: Record<string, any> = {}): string[] {
  const qw = QUALITY_WORKFLOWS[providerId]?.find((q) => q.runs(input)); if (qw && tool.id === 'h3-video') return [qw.workflow]; // DFR: its own template and files
  const bfs = bfsSwapFor(tool.id, providerId, input); if (bfs) return [bfs.workflowFile]; // Face / Person Swap on Qwen 2.1: the job's own BFS graph (keep-outfit = the head swap)
  const p = getProvider(providerId); if (!p) return []; const pw = providerWorkflows(tool, p); const all = pw.length ? pw : p.workflows ?? []; if (all.length <= 1) return all; // charswap: its graph is chosen in comfyClient, not by providerWorkflows
  const t = Array.isArray(input.types) ? String(input.types[0] ?? '') : typeof input.types === 'string' ? String(input.types).replace(/[[\]"]/g, '').split(',')[0] : String(input.mode ?? '');
  if (providerId === 'comfy-soul') { const w = soulWorkflowOf(input); if (w && all.includes(w)) return [w]; } // OpenSoul: the look's (or engine's) own graph
  if (tool.id === 'camera' || REEL_TOOL_IDS.includes(tool.id)) { const ltx = all.filter((w) => /camera-ltx/.test(w)); return /^ltx-/.test(t) ? (ltx.length ? ltx : all) : all.filter((w) => !/camera-ltx/.test(w)).length ? all.filter((w) => !/camera-ltx/.test(w)) : all; }
  if (t) { const hit = all.filter((w) => new RegExp(`[-_]${t.replace(/[^\w-]/g, '')}[-_.]`).test(w)); if (hit.length) return hit; }
  return all;
}
export const modelsDir = () => env('COMFY_MODELS_DIR')?.trim() || null;
// ---- HW2 item 3: per-family download ids ----
const wfSlug = (w: string) => { const b = w.replace(/^workflows\//, ''); return !b.includes('/') && b.endsWith('-api.json') ? b.slice(0, -'-api.json'.length) : b; };
const wfUnslug = (s: string) => (s.includes('/') || s.endsWith('.json') ? s : `${s}-api.json`);
/** The download id for these workflows of a provider (see the header). */
export function downloadIdFor(providerId: string, workflows: string[]): string {
  const p = getProvider(providerId); const ws = [...new Set(workflows.map((w) => w.replace(/^workflows\//, '')))];
  if (p?.workflows && ws.length === p.workflows.length && ws.every((w) => p.workflows!.includes(w))) return providerId;
  return ws.length ? `${providerId}:${ws.map(wfSlug).join('+')}` : providerId;
}
/** '<providerId>:<slug>+<slug>' → {providerId, workflows}; null when it isn't one (a bare providerId). */
export function parseDownloadId(id: string): { providerId: string; workflows: string[] } | null {
  const i = id.indexOf(':'); if (i <= 0) return null; const ws = id.slice(i + 1).split('+').filter(Boolean).map(wfUnslug); return ws.length ? { providerId: id.slice(0, i), workflows: ws } : null;
}
const manRow = (file: string) => manifest().models.find((m) => m.file === file);
let missOverride: Record<string, string[]> = {};
/** Test hook (B4 mock first run): pretend these files are missing for a route (empty = clear). Never writes anything. */
export const setMissingWeights = (routeId: string, files: string[] | null) => { if (!files?.length) delete missOverride[routeId]; else missOverride[routeId] = files; reqCache.clear(); };
export const missingOverrideFor = (routeId: string) => missOverride[routeId] ?? null;
const reqCache = new Map<string, { at: number; r: Requirements }>();
/** A download finished (files on disk changed): drop the 10 s requirements cache. */
export const clearRequirementsCache = () => reqCache.clear();
/** ComfyUI folder aliases: a file in either folder loads (text_encoders/clip, diffusion_models/unet). */
const FOLDER_ALIASES: Record<string, string[]> = { text_encoders: ['text_encoders', 'clip'], clip: ['clip', 'text_encoders'], diffusion_models: ['diffusion_models', 'unet'], unet: ['unet', 'diffusion_models'] };
/** Bytes of a model file on disk (largest copy across the folder aliases), or null when it isn't there. */
export const modelFileBytes = (dir: string, folder: string, file: string): number | null => { let best: number | null = null;
  for (const d of FOLDER_ALIASES[folder] ?? [folder]) { try { const st = statSync(path.join(dir, d, file)); if (st.isFile() && (best == null || st.size > best)) best = st.size; } catch { /* not in this folder */ } } return best; };
/** Core loader inputs → ComfyUI folder. LoRA loaders are left out: their file is swapped per job. */
const LOADER_FOLDERS: Record<string, Record<string, string>> = { UNETLoader: { unet_name: 'diffusion_models' }, UnetLoaderGGUF: { unet_name: 'diffusion_models' }, LatentUpscaleModelLoader: { model_name: 'latent_upscale_models' }, CLIPLoader: { clip_name: 'text_encoders' }, DualCLIPLoader: { clip_name1: 'text_encoders', clip_name2: 'text_encoders' },
  VAELoader: { vae_name: 'vae' }, CheckpointLoaderSimple: { ckpt_name: 'checkpoints' }, UpscaleModelLoader: { model_name: 'upscale_models' }, CLIPVisionLoader: { clip_name: 'clip_vision' } };
const wfFilesCache = new Map<string, { file: string; folder: string }[]>();
/** Weight files a workflow's core loader nodes name, read from the workflow JSON, so a model the manifest misses still gets its files checked. */
function loaderFiles(wfs: string[]): { file: string; folder: string; bytes: number | null; url: string; autoDownloaded: boolean }[] {
  const out: { file: string; folder: string }[] = [];
  for (const w of wfs) { let fs = wfFilesCache.get(w);
    if (!fs) { fs = []; try { const g = JSON.parse(readFileSync(path.join(WF_DIR, w), 'utf8')) as Record<string, any>;
      for (const n of Object.values(g)) { const m = LOADER_FOLDERS[n?.class_type]; if (!m) continue; for (const [k, folder] of Object.entries(m)) { const v = n.inputs?.[k]; if (typeof v === 'string' && /\.(safetensors|gguf|pth|pt|ckpt|bin)$/.test(v)) fs.push({ file: v, folder }); } } } catch { /* unreadable workflow: nothing extra */ }
      wfFilesCache.set(w, fs); }
    for (const f of fs) if (!out.some((x) => x.file === f.file)) out.push(f); }
  return out.map((f) => ({ ...f, bytes: null, url: '', autoDownloaded: false }));
}
export function requirementsFor(tool: ToolDef, providerId: string, input: Record<string, any> = {}, hw: Hardware = currentHardware()): Requirements | null {
  const p = getProvider(providerId); if (!p || p.kind !== 'open-weights') return null;
  const wfs = jobWorkflows(tool, providerId, input); const variantId = typeof input.variantId === 'string' && input.variantId ? input.variantId : null;
  const loras = ltxLorasForJob(tool.id, providerId, input); // LTX LoRAs this job loads (shared/ltxLoras.ts): their files join "Files needed"
  const ck = `${tool.id}|${providerId}|${wfs.join(',')}|${loras.map((l) => l.file).join(',')}|${variantId}|${input.resolution ?? ''}|${input.duration ?? ''}|${input.n ?? ''}|${vupSourceFactor(providerId, input)}|${hw.comfy.ggufNode}|${modelsDir()}|${comfyModelsStamp()}|${JSON.stringify(missOverride[`local:${providerId}`] ?? null)}|${String(input.promptRewrite ?? '')}|${input.refPaths?.length ?? input.refUrls?.length ?? (input.imagePath ? 1 : 0)}|${input.imageResolution ?? ''}|${hw.gpu?.type ?? ''}|${platformOf(hw.profile)}`;
  const hit = reqCache.get(ck); if (hit && Date.now() - hit.at < 10_000) return hit.r;
  const plat = platformOf(hw.profile); const picks = swappedPicks(wfs, plat); const swaps = swapsFor(wfs, plat);
  // a graph whose pick swaps files on this platform takes the memory of the picked files (build-manifest.py variants_for memGB);
  // then the reference pictures' share (REF_GB_PER_MP) is working memory: it adds to both the recommended and the minimum need
  const vs = wfs.map((w) => { let v = wfVram(w); if (!v) return v; const mem = picks.find((p) => p.workflow === w)?.variant?.memGB;
    if (Number(mem) > 0) { const k = mem! / v.recommendedVramGB; v = { ...v, recommendedVramGB: mem!, minVramGB: r1(v.minVramGB * k), residentGB: r1(v.residentGB * k), teGB: r1(v.teGB * k), mps: 'amber' as const }; }
    const add = refMemoryGB(tool, w, input, hw); return add ? { ...v, recommendedVramGB: r1(v.recommendedVramGB + add), minVramGB: r1(v.minVramGB + add) } : v; }).filter((x): x is WfVram => !!x);
  const worst = vs.length ? vs.reduce((a, b) => (b.recommendedVramGB > a.recommendedVramGB ? b : a)) : null;
  const weights = weightsForWorkflows(wfs);
  const vv = VARIANTS.filter((v) => v.providers.includes(providerId) && weights.some((w) => w.file === v.replaces)).map((v) => variantView(v, hw));
  const chosen = variantId ? vv.find((v) => v.id === variantId && v.runnable) ?? null : null;
  let files = weights.map((w) => ({ file: w.file, folder: w.folder, bytes: w.sizeBytes, url: w.url, autoDownloaded: !!manRow(w.file)?.auto_downloaded_by_pack }));
  if (loras.length && loras.every((l) => LTX_LORAS[l.id]?.ic)) files = files.filter((f) => f.folder !== 'loras' || loras.some((l) => l.file === f.file)); // shared IC-LoRA graph: only the effect's own LoRA, never the graph's default
  for (const l of loras) { const e = LTX_LORAS[l.id]; if (!files.some((f) => f.file === e.file)) files.push({ file: e.file, folder: e.folder, bytes: e.bytes, url: e.url ?? '', autoDownloaded: false }); }
  if (chosen) files = files.map((f) => (f.file === chosen.replaces ? { file: chosen.file, folder: chosen.folder, bytes: chosen.bytes, url: chosen.url, autoDownloaded: false } : f));
  const dir = modelsDir(); const ov = missOverride[`local:${providerId}`];
  // Setup step 4: no models folder set → ask the connected ComfyUI which files it has (hardware/comfyModels.ts), once every folder's list is in
  const viaComfy = !dir && !ov && files.length > 0 && comfyFoldersKnown([...files, ...loaderFiles(wfs)].map((f) => f.folder));
  if ((dir || viaComfy) && !ov) files = [...files, ...loaderFiles(wfs).filter((f) => !files.some((x) => x.file === f.file))]; // files the manifest doesn't list yet
  if (Object.keys(swaps).length) { const seen = new Set<string>(); files = files.map((f) => { const to = swaps[f.file]; const w = to ? weightFileOf(to) : null;
    return w ? { file: w.file, folder: w.folder, bytes: w.sizeBytes, url: w.url, autoDownloaded: false } : f; }).filter((f) => (seen.has(f.file) ? false : (seen.add(f.file), true))); } // this platform's picked files only (Files needed, downloads)
  files = files.filter((f) => !optionalFileSkipped(providerId, f.file, input)); // a file the job opted out of (FLUX 3 Klein without its prompt upsampler) is never needed
  const haveBytes = (f: { folder: string; file: string }) => (dir ? modelFileBytes(dir, f.folder, f.file) : comfyFileBytes(f.folder, f.file));
  /** Present AND complete: a file smaller than its known size is still downloading (or broken), never ready (Render, 2026-10-24). */
  const present = (f: { folder: string; file: string; bytes: number | null }) => { const b = haveBytes(f); return b != null && (b === 0 && !dir ? true : f.bytes == null || f.bytes <= 0 || b >= f.bytes); }; // ComfyUI lists without sizes (older builds): listed = present
  const missing = ov ? files.filter((f) => ov.includes(f.file) || ov.includes('*')) : dir || viaComfy ? files.filter((f) => !present(f))
    .map((f) => { const have = haveBytes(f); return have != null && have > 0 ? { ...f, haveBytes: have, partial: true } : f; }) : null; // partial = on disk but short of its size: still downloading
  // Mac check (hardware/macWeights.ts), per workflow: the manifest's files and the workflow loaders' own (a lighter variant replaces its file).
  // Blocked only when EVERY workflow this job may run has such a file: a job that can run a Mac-safe graph of the same model stays available.
  const wfBlocked = wfs.map((w) => { const sw = swapsFor([w], plat); return macBlockedFiles([...weightsForWorkflows([w]).map((x) => x.file), ...loaderFiles([w]).map((x) => x.file)].filter((f) => f !== chosen?.replaces && !sw[f])); }); // the picked variant's swapped files are gone (B6)
  const macBlocked = wfBlocked.length && wfBlocked.every((b) => b.length) ? [...new Set(wfBlocked.flat())] : [];
  // The Mac rating of the graphs a Mac CAN run (OpenSoul: soul-zit is amber while the FLUX / Qwen recipes are red): the job isn't red because of a graph it won't use here.
  const safeVs = wfs.map((w, i) => (wfBlocked[i].length ? null : wfVram(w))).filter((x): x is WfVram => !!x);
  const macSafeMps = safeVs.length ? (safeVs.some((v) => v.mps === 'amber' || v.mps === 'red') ? 'amber' as const : 'green' as const) : null;
  const R = worst ? (chosen ? Math.min(worst.recommendedVramGB, chosen.vramEstGB) : worst.recommendedVramGB) : null;
  const M = worst ? r1(chosen && R != null ? worst.minVramGB * (R / worst.recommendedVramGB) : worst.minVramGB) : null;
  // secondsPerTier: timing.ts cells for this job (all → rtx4090, else rtx5090; mac → mseries). light / most stay null (no cross-GPU scaling, timing.ts:4).
  const t0 = Array.isArray(input.types) ? String(input.types[0] ?? '') : ''; const et = etaFor(tool, { providerId, presetGroup: tool.id === 'camera' && /^ltx-/.test(t0) ? 'LTX camera' : undefined });
  const image = isImageJob(input, tool); const units = unitsOf(input, image);
  const cell = (g: string) => { const by = (et.eta.byGpu as any)[g] as Record<string, number> | undefined; if (!by || !Object.keys(by).length) return null; const q = by[String(input.resolution ?? '')] != null ? String(input.resolution) : by['720p'] != null ? '720p' : Object.keys(by)[0];
    const c = (et.etaSource.cells as any)[g]?.[q]; return { seconds: Math.round(by[q] * units * vupSourceFactor(providerId, input)), source: c?.cited && vupSourceFactor(providerId, input) === 1 ? 'cited' as const : 'estimate' as const, gpuClass: g }; };
  const r: Requirements = { workflows: wfs.map((w) => `workflows/${w}`), recommendedVramGB: R, minVramGB: M, minVramEstimate: true,
    downloadBytes: files.reduce((a, f) => a + (f.bytes ?? 0), 0), downloadGB: Math.round(files.reduce((a, f) => a + (f.bytes ?? 0), 0) / 1e7) / 100,
    missingBytes: (missing ?? files).reduce((a, f) => a + (f.bytes ?? 0), 0), missingBytesSource: missing ? 'checked' : 'assumed_all', missingFiles: missing,
    ramMinGB: worst ? Math.ceil(Math.max(worst.residentGB, worst.teGB) + 8) : null, mps: macBlocked.length ? 'red' : macSafeMps ?? worst?.mps ?? null,
    mpsNotes: macBlocked.length && !(worst?.mpsNotes ?? []).some((n) => /fp8|nvfp4|w4a8/i.test(n)) ? [...(worst?.mpsNotes ?? []), `${MAC_WEIGHTS_REASON} (${macBlocked.join(', ')})`] : worst?.mpsNotes ?? [], minComfyVersion: p.minComfyVersion ?? null,
    secondsPerTier: { all: cell('rtx4090') ?? cell('rtx5090'), most: null, light: null, mac: cell('mseries') }, variants: vv, variantId: chosen?.id ?? null, macBlockedFiles: macBlocked,
    downloadable: files.some((f) => !!f.url), modelsDir: HW.displayDir(dir), modelsDirSet: !!dir, downloadId: downloadIdFor(providerId, wfs), presenceSource: ov ? null : dir ? 'models_dir' : viaComfy ? 'comfyui' : null, platform: plat,
    variant: picks.length && !wfs.some((w, i) => !wfBlocked[i].length && !picks.some((p) => p.workflow === w)) /* a graph that runs here as it is: the job needs no untested variant (OpenSoul: soul-zit) */ ? { platform: plat!, verified: picks.every((p) => p.verified), format: picks[0].variant?.format ?? null, needsNodes: [...new Set(picks.flatMap((p) => p.variant?.needsNodes ?? []))], files: Object.values(swaps) } : null };
  reqCache.set(ck, { at: Date.now(), r }); return r;
}
// ---- fit ----
export type Verdict = 'fits' | 'slow' | 'too_heavy' | 'unknown';
export interface Fit { verdict: Verdict; reasonCode: string; reason: string; hardwareReasonCode: string; tier: Tier; enforced: boolean; lighterVariantAvailable: boolean; recommendedVramGB: number | null; effectiveVramGB: number | null;
  etaSeconds: number | null; eta: { source: 'learned' | 'estimate'; samples: number; hwKey: string; estimateSeconds: number | null; learnedSeconds: number | null };
  /** Step-ETA learning (stepEta.ts): {seconds, low, high, source learned | scaled | reported | first_run, samples, includesLoad cold | warm | null, calibrating, …}. */
  etaRange: EtaRange;
  missingBytes: number | null; missingBytesSource: 'checked' | 'assumed_all' | null; downloadId: string | null; diskFreeBytes: number | null; blockers: { code: 'not_enough_disk'; needBytes: number; freeBytes: number }[]; vramFreeHint: string | null;
  /** Item 5: the platform variant this computer picked (files swapped for it); verified false → "should run here (not tested yet)". */ variant?: Requirements['variant'] }
const cmpVer = (a: string, b: string) => { const x = a.split('.').map(Number); const y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return Math.sign(d); } return 0; };
const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
/** " (about 4 min here)" for a slow verdict's reason, from the estimate (learned on this computer, else measured or reported); '' when unknown. */
export const aboutTime = (sec: number | null | undefined) => { if (!(Number(sec) > 0)) return ''; const s = Number(sec);
  const t = s < 90 ? `${Math.round(s)} s` : s < 90 * 60 ? `${Math.round(s / 60)} min` : `${Math.round((s / 3600) * 10) / 10} h`; return ` (about ${t} here)`; };
export function fitFor(tool: ToolDef, providerId: string, input: Record<string, any> = {}, hw: Hardware = currentHardware(), req: Requirements | null = requirementsFor(tool, providerId, input, hw)): Fit {
  const E0 = hw.effectiveVramGB; const E = E0 ?? 0; const R = req?.recommendedVramGB ?? null; const M = req?.minVramGB ?? null; const ramGB = hw.ram.totalGB;
  const lighter = !!req?.variants.some((v) => R != null && v.vramEstGB < R);
  const image = isImageJob(input, tool); const units = unitsOf(input, image);
  const est = !req ? null : hw.gpu?.type === 'mps' ? req.secondsPerTier.mac?.seconds ?? null : hw.tier === 'all' ? req.secondsPerTier.all?.seconds ?? null : hw.tier === 'most' ? req.secondsPerTier.most?.seconds ?? null : hw.tier === 'light' ? req.secondsPerTier.light?.seconds ?? null : null;
  const { hwKeyOf } = HW; const hk = hwKeyOf(hw); const e: Eta = blend(est, etaKey(tool.id, `local:${providerId}`, input, image), hk, units);
  // Step-ETA: this computer's own timed runs of this workflow; none → no number ('first_run'), or a published figure for this GPU class ('reported').
  const cellNow = !req ? null : hw.gpu?.type === 'mps' ? req.secondsPerTier.mac : hw.tier === 'all' ? req.secondsPerTier.all : null;
  const fromOwnRun = !!cellNow && cellNow.source !== 'cited' && vupMeasuredOn(providerId, cellNow.gpuClass); // Video Upscale: other sizes scaled from our own measured run on this machine class
  let etaRange = estimateFor(jobFeatures(tool.id, providerId, input), hk, { reportedSeconds: cellNow?.source === 'cited' || fromOwnRun ? cellNow!.seconds : null });
  if (etaRange.samples === 0 && e.source === 'learned' && e.seconds) etaRange = { ...etaRange, seconds: e.seconds, low: Math.max(1, Math.floor(e.seconds * 0.75)), high: Math.ceil(e.seconds * 1.3), source: 'learned', samples: e.samples, calibrating: false }; // timings learned before step learning (eta_samples)
  const base = { tier: hw.tier, lighterVariantAvailable: lighter, recommendedVramGB: R, effectiveVramGB: E0, etaSeconds: etaRange.seconds, etaRange, eta: { source: e.source, samples: e.samples, hwKey: hk, estimateSeconds: e.estimateSeconds, learnedSeconds: e.learnedSeconds },
    missingBytes: req?.missingBytes ?? null, missingBytesSource: req?.missingBytesSource ?? null, downloadId: req?.downloadId ?? null, diskFreeBytes: hw.disk.freeBytes, blockers: [] as Fit['blockers'], vramFreeHint: null as string | null };
  const done = (verdict: Verdict, reasonCode: string, reason: string, enforced = true): Fit => {
    const f: Fit = { ...base, verdict, reasonCode, hardwareReasonCode: reasonCode, reason, enforced, ...(req?.variant ? { variant: req.variant } : {}) };
    if (req?.variant && !req.variant.verified && (verdict === 'fits' || verdict === 'slow')) f.reason = `${UNTESTED_VARIANT}: it uses files made for this kind of computer (${req.variant.format ?? 'lighter files'}). ${reason}`; // never "runs here" before a real run
    if (req?.missingBytes && req.missingBytesSource === 'checked' && hw.disk.freeBytes != null && req.missingBytes > hw.disk.freeBytes * 0.95) {
      f.blockers.push({ code: 'not_enough_disk', needBytes: req.missingBytes, freeBytes: hw.disk.freeBytes });
      if (verdict !== 'too_heavy') { f.reasonCode = 'not_enough_disk'; f.reason = `Its files need ${fmt(req.missingBytes / 1e9)} GB of disk space; ${fmt(hw.disk.freeBytes / 1e9)} GB is free.`; } }
    if (verdict === 'fits' && !hw.gpu?.unifiedMemory && !hw.profile?.unifiedMemory /* GB10: cudaMemGetInfo under-reports (NVIDIA DGX Spark known issues) */ && hw.gpu?.vramFreeBytes != null && R != null && hw.gpu.vramFreeBytes / 2 ** 30 < R) f.vramFreeHint = `Other apps are using graphics memory right now (${fmt(hw.gpu.vramFreeBytes / 2 ** 30)} GB free); close them for full speed.`;
    return f; };
  if (hw.tier === 'unknown') return done('unknown', 'hardware_unknown', "This computer's hardware couldn't be read, so this route isn't checked.", false);
  if (!req || !req.workflows.length) return done('fits', 'no_gpu_needed', 'Runs on your computer.');
  if (hw.gpu?.type === 'mps' && req.macBlockedFiles?.length) return done('too_heavy', 'unsupported_weights', `${MAC_WEIGHTS_REASON}.`); // 2026-10-25: before the size checks (a Mac with room still can't load them)
  if (R == null) return done('unknown', 'requirements_unknown', "This model's memory needs aren't listed yet, so this route isn't checked.", false); // workflow missing from readiness/manifest
  if (req.minComfyVersion && hw.comfy.version && cmpVer(hw.comfy.version, req.minComfyVersion) < 0) return done('too_heavy', 'comfy_too_old', `Needs ComfyUI ${req.minComfyVersion} or newer; this computer has ${hw.comfy.version}.`);
  if (!hw.gpu || hw.gpu.type === 'cpu' || E <= 0) {
    if (R <= 2 && image) return done('slow', 'cpu', 'Runs on the processor without a graphics card, slowly.');
    return done('too_heavy', 'no_gpu', `Needs a graphics card with about ${fmt(R)} GB of memory; your computer has none.`); }
  if (hw.gpu.type === 'mps' && req.mps === 'red') return done('too_heavy', 'unsupported_weights', `${MAC_WEIGHTS_REASON}.`);
  if (R <= E - 1) return done(hw.gpu.type === 'mps' && req.mps === 'amber' ? 'slow' : 'fits', hw.gpu.type === 'mps' && req.mps === 'amber' ? 'mps' : 'fits', hw.gpu.type === 'mps' && req.mps === 'amber' ? `Runs, but slow${aboutTime(base.etaSeconds)}: these weights are slow or untested on Apple graphics.` : `Fits in your ${fmt(E)} GB of graphics memory.`);
  const ramOk = ramGB == null || req.ramMinGB == null || ramGB >= req.ramMinGB;
  if (M != null && M <= E && ramOk) return done('slow', hw.gpu.type === 'mps' ? 'mps' : 'offload', `Needs about ${fmt(R)} GB of graphics memory; your ${fmt(E)} GB computer will run it more slowly by moving part of it to system memory.`);
  if (M != null && M <= E && !ramOk) return done('too_heavy', 'not_enough_ram', `Needs at least ${req.ramMinGB} GB of system memory to run on your ${fmt(E)} GB card; your computer has ${fmt(ramGB!)} GB.`);
  return done('too_heavy', 'not_enough_vram', `Needs about ${fmt(R)} GB of graphics memory; your computer has ${fmt(E)} GB.`);
}
import * as HW from '../hardware.js';
/** Q2: the loud warning a pinned too_heavy route carries on the quote and the job (it still runs; nothing switches silently). */
export const tooHeavyWarning = (f: Fit, label: string) => (f.reasonCode === 'unsupported_weights' ? `${label} needs an NVIDIA graphics card, so it won’t run on your computer.` : `${label} may be too heavy for your computer. It can fail or run very slowly.`);
export const SLOW_LOCAL_NOTE = 'Free on your computer, but slow';
/** Item 5: the words for a platform variant nobody has run on this kind of computer yet. */
export const UNTESTED_VARIANT = 'Should run here (not tested yet)';
// ---- Q4 weights gate (real runs need the files; the mock backend only reports unless OPENHIGGSFIELD_ENFORCE_WEIGHTS=1) ----
import { config as CFG } from '../config.js';
import { missingNodes } from '../comfyNodes.js';
export const enforceWeights = () => CFG.backend === 'comfy' || /^(1|true)$/i.test(env('ENFORCE_WEIGHTS') ?? '');
export interface WeightsGate { code: 'weights_missing' | 'not_enough_disk' | 'nodes_missing'; missingNodes?: string[]; message: string; missingBytes: number; missingFiles: NonNullable<Requirements['missingFiles']>; diskFreeBytes: number | null; downloadable: boolean; downloadEndpoint: string; downloadId: string }
/** A local job whose weight files are missing (pack auto-downloads don't count): not_enough_disk when they can't fit (also on the mock backend when downloadWeights=1), else weights_missing unless the
 *  job asks for the one-click download first (downloadWeights=1). null = nothing missing, no models folder known, or not enforced. */
export function weightsGate(tool: ToolDef, providerId: string, input: Record<string, any> = {}, hw: Hardware = currentHardware()): WeightsGate | null {
  const wantsDl = /^(1|true|on|yes)$/i.test(String(input.downloadWeights ?? '')); if (!enforceWeights() && !wantsDl) return null; // a requested download is always disk-checked
  if (enforceWeights()) { const wfs = jobWorkflows(tool, providerId, input); const nodes = missingNodes(wfs.length ? wfs : providerId === 'comfy-open' ? tool.workflows ?? [] : []); // custom nodes the local ComfyUI doesn't have: it would refuse the prompt
    const vn = (requirementsFor(tool, providerId, input, hw)?.variant?.needsNodes ?? []).filter((n) => n === 'UnetLoaderGGUF' && hw.comfy.ggufNode === false); // the picked variant's .gguf files need ComfyUI-GGUF
    for (const n of vn) if (!nodes.includes(n)) nodes.push(n);
    if (nodes.length) return { code: 'nodes_missing', missingNodes: nodes, message: `Your ComfyUI is missing the custom node${nodes.length > 1 ? 's' : ''} this model needs (${nodes.slice(0, 4).join(', ')}${nodes.length > 4 ? '…' : ''}). Install ${nodes.length > 1 ? 'them' : 'it'} with ComfyUI Manager and restart ComfyUI, or use another route.`,
      missingBytes: 0, missingFiles: [], diskFreeBytes: hw.disk.freeBytes, downloadable: false, downloadEndpoint: '/api/local/downloads', downloadId: '' }; }
  const req = requirementsFor(tool, providerId, input, hw); if (!req?.missingFiles) return null;
  const files = req.missingFiles.filter((f) => !f.autoDownloaded); if (!files.length) return null; const need = files.reduce((a, f) => a + (f.bytes ?? 0), 0);
  const free = hw.disk.freeBytes; const gbs = (b: number) => (Math.round(b / 1e8) / 10).toString();
  const base = { missingBytes: need, missingFiles: files, diskFreeBytes: free, downloadable: files.every((f) => !!f.url), downloadEndpoint: '/api/local/downloads', downloadId: req.downloadId };
  if (free != null && need > free * 0.95) return { ...base, code: 'not_enough_disk', message: `This model's files need ${gbs(need)} GB of disk space; ${gbs(free)} GB is free. Free up space or use another route.` };
  if (wantsDl) return null;
  return { ...base, code: 'weights_missing', message: `This model's files aren't on this computer yet (${files.length} file${files.length > 1 ? 's' : ''}${files.every((f) => f.bytes != null) ? `, ${gbs(need)} GB` : ''}). Download them first, or use another route.` };
}
