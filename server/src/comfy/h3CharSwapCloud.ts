/**
 * H3 Character Swap · Comfy Cloud (Oct 26–27): the H3 Character Swap recipe (MiniMax H3 Ref2VA + Akatz H3 Character Swap LoRA v1.5), after Comfy's
 * Openjutsu app and Akatz Labs' H3 Character Swap workflow, as an ordinary Comfy Cloud
 * workflow job (shared Comfy Cloud, the user's Creator plan), a standalone entry in comfy/cloudWorkflows.ts on route comfy-cloud:cloud-h3-charswap.
 * Graph: workflows/cloud/h3-charswap-api.json, our own core-node API graph (every class and model file checked against Comfy Cloud's object_info,
 * 2026-10-26, test/fixtures/object-info-comfy-cloud-2026-10-26.json):
 *   UNETLoader ref2va int8 → MiniMaxH3SigmaShift 12/3 → ModelAttentionBackend (comfy kitchen) → turbo 8-step LoRA (the 768p build when the user has
 *   imported it, else Cloud's shared build) → Character Swap LoRA (the user's IMPORTED file, strength 1.0 by default)
 *   CLIPLoader qwen3vl 32B NVFP4 · video VAE fp16 · audio VAE fp32
 *   source clip (24 fps, padded to H3's 17k+5 frame grid) → <Video 1> + its sound as reference audio and as an audio guide at frame 0
 *   character image as <Picture 1> · 8 steps, cfg 1, er_sde / normal (no turbo: 20 steps, res_multistep / simple) · CreateVideo 24 fps.
 * Edit mask (Oct 27, the default for Person swap): the same idea as Akatz's H3 Relay edit mask, rebuilt from core nodes. SAM 3.1 finds the person on
 * frame 0 (the click point, else SAM text from "who to swap", limited to the named side of the frame) and tracks them through the clip; the mask is
 * pooled onto H3's 16 px latent grid (area → any coverage), grown (64 px at 768p) and put on the VAE-encoded SOURCE video latent with
 * SetLatentNoiseMask; LTXVSeparateAVLatent / LTXVConcatAVLatent keep H3's audio latent fully generated. Core ComfyUI (v0.42.5, Cloud's version) pools
 * the mask to H3's 2×2 DiT patches and keeps the unmasked source at the conditioning timestep. A frame where SAM finds nobody is regenerated whole
 * (the mask-free behaviour), so a miss never returns the source unchanged. Motion transfer and maskMode "none" stay mask-free.
 * Before anything is uploaded, a free check (GET only) confirms the LoRA is in the account's model library (a clear refusal otherwise) and looks
 * for the optional 768p turbo import.
 * Credits: LoRA by Akatz Labs (HF akatz-ai/MiniMax-H3-Character-Swap-LoRA); recipe after Comfy's Openjutsu app (github.com/Comfy-Org/comfy-openjutsu, MIT) and Akatz Labs' H3 Character Swap workflow (github.com/akatz-labs/h3-character-swap-tool, MIT);
 * edit mask after Akatz's H3 Relay. Licence texts: licenses/comfy-openjutsu-LICENSE-MIT.md, licenses/akatz-h3-character-swap-tool-LICENSE-MIT.md.
 */
import { swapSide } from '../shared/cloudSwap.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORKFLOWS_DIR } from '../config.js';
import { env } from '../env.js';
import { setIn, type Plan } from './plans.js';
import { h3MotionPrompt } from './objectSwap.js';
import { composeH3SwapPrompt } from '../shared/h3SwapPrompt.js';
import { findInAssets, checkImportedLora, importTodo, importSteps, importMissing } from './cloudImports.js';

export const CHARSWAP_CLOUD_PROVIDER = 'cloud-h3-charswap';
export const CHARSWAP_CLOUD_ROUTE = `comfy-cloud:${CHARSWAP_CLOUD_PROVIDER}`;
export const CHARSWAP_CLOUD_GRAPH = 'cloud/h3-charswap-api.json';
export const CHARSWAP_CLOUD_NODES = { unet: '1', shift: '7', attention: '8', turbo: '3', lora: '2', text: '4', video: '10', audioOut: '11', image: '12', prompt: '13', guide: '19', cond: '20', seed: '21',
  sampler: '22', scheduler: '23', guider: '24', sample: '25', save: '30' } as const;
/** The LoRA file as Comfy Cloud names it after Model Library → Import from Hugging Face (<owner>__<repo>__<file>, seen 2026-10-26).
 *  Env COMFY_CLOUD_CHARSWAP_LORA when the import has another name (e.g. a Civitai import or a rename). */
export const CHARSWAP_LORA_DEFAULT = 'akatz-ai__MiniMax-H3-Character-Swap-LoRA__h3_character_swap_v1.5.safetensors';
/** The file's own name on Hugging Face (also accepted by the check, in case Comfy Cloud keeps the plain name). */
export const CHARSWAP_LORA_HF_FILE = 'h3_character_swap_v1.5.safetensors';
export const charswapLoraName = () => env('COMFY_CLOUD_CHARSWAP_LORA')?.trim() || process.env.COMFY_CLOUD_CHARSWAP_LORA?.trim() || CHARSWAP_LORA_DEFAULT;
export const CHARSWAP_LORA_URL = 'https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA';
export const CHARSWAP_LORA_STEPS = importSteps({ hf: `${CHARSWAP_LORA_URL}/blob/main/${CHARSWAP_LORA_HF_FILE}`, type: 'LoRA', importAs: CHARSWAP_LORA_DEFAULT });
export const CHARSWAP_LORA_MISSING = importMissing('H3 Character Swap', `the Character Swap LoRA (${CHARSWAP_LORA_HF_FILE})`, CHARSWAP_LORA_STEPS);
/** The optional Openjutsu turbo build (trained at 768p). Not in Comfy Cloud's shared library (2026-10-26); the user can import it from Hugging Face.
 *  When the free check finds it, 768p runs use it; otherwise the shared minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16 build. */
export const TURBO_768_HF_FILE = 'minimax_h3_fl2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors';
export const TURBO_768_DEFAULT = `lightx2v__Minimax-h3-Turbo__${TURBO_768_HF_FILE}`;
export const TURBO_768_URL = `https://huggingface.co/lightx2v/Minimax-h3-Turbo/blob/main/${TURBO_768_HF_FILE}`;
export const TURBO_SHARED = 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors';
/** What the free check reports: the files the recipe (after Comfy's Openjutsu app) wants, where to import them from and the name Comfy Cloud gives an import. */
export const CHARSWAP_RECOMMENDED = [
  { id: 'charswap-lora', required: true, file: CHARSWAP_LORA_HF_FILE, importAs: CHARSWAP_LORA_DEFAULT, hf: `${CHARSWAP_LORA_URL}/blob/main/${CHARSWAP_LORA_HF_FILE}`, type: 'LoRA', size: '0.16 GB',
    why: 'The Character Swap adapter itself. Without it the route refuses to run.' },
  { id: 'turbo-768p', required: false, file: TURBO_768_HF_FILE, importAs: TURBO_768_DEFAULT, hf: TURBO_768_URL, type: 'LoRA', size: '1.96 GB',
    why: 'The turbo build trained at 768p, as Comfy\'s Openjutsu app uses for Sharper (768p). Without it, 768p runs use Cloud\'s shared 8-step turbo (the non-768p build).' },
] as const;

/** Seconds one pass takes (Ref2V's trained range is ~124–362 frames at 24 fps; the reference clip must be 2–15 s). */
export const CHARSWAP_CLOUD_SECONDS = { min: 2, max: 15 } as const;
/** Pixel budgets per tier, as Openjutsu / H3 Relay size the canvas: 480 = up to 0.5 MP, 768 = up to 1.0 MP. Our 720p and 1080p render at 768. */
export const CHARSWAP_CLOUD_BUDGET = { '480p': 500_000, '768p': 1_000_000 } as const;
export type CharSwapTier = keyof typeof CHARSWAP_CLOUD_BUDGET;
/** Presets: "openjutsu" (default, shown as "Sharper (768p)") = the recipe at 768p as in Comfy's Openjutsu app; "fast" = the same recipe at 480p
 *  (about half the price). The key "openjutsu" stays so saved jobs and Recreate keep working. */
export const CHARSWAP_PRESETS = {
  openjutsu: { label: 'Sharper (768p)', tier: '768p' },
  fast: { label: 'Faster and cheaper (480p)', tier: '480p' },
} as const satisfies Record<string, { label: string; tier: CharSwapTier }>;
export type CharSwapPreset = keyof typeof CHARSWAP_PRESETS;
export const charswapPreset = (i: { charswapPreset?: string; resolution?: string; draft?: boolean }): CharSwapPreset =>
  i.charswapPreset === 'fast' || i.charswapPreset === 'openjutsu' ? i.charswapPreset : i.draft || i.resolution === '480p' ? 'fast' : 'openjutsu';
export const charswapTier = (i: { charswapPreset?: string; resolution?: string; draft?: boolean }): CharSwapTier => CHARSWAP_PRESETS[charswapPreset(i)].tier;
/** Output size: the largest canvas on the 32 px grid within the tier's budget, nearest the source shape (equal weight to each side's relative error).
 *  16:9 → 928×512 / 1344×736; 9:16 → 512×928 / 736×1344; unknown → 16:9. */
export function charswapSize(srcW: number, srcH: number, tier: CharSwapTier) {
  const budget = CHARSWAP_CLOUD_BUDGET[tier]; const a = srcW > 0 && srcH > 0 ? srcW / srcH : 16 / 9;
  const iw = Math.sqrt(budget * a), ih = Math.sqrt(budget / a); let best = { width: 32, height: 32, score: Infinity };
  for (let height = 32; height * 32 <= budget; height += 32) {
    const maxW = Math.floor(budget / height / 32) * 32; if (maxW < 32) break;
    for (const width of new Set([Math.min(maxW, Math.max(32, Math.floor(iw / 32) * 32)), Math.min(maxW, Math.max(32, Math.ceil(iw / 32) * 32))])) {
      const score = Math.log(width / iw) ** 2 + Math.log(height / ih) ** 2;
      if (score < best.score - 1e-12 || (Math.abs(score - best.score) <= 1e-12 && width * height > best.width * best.height)) best = { width, height, score };
    }
  }
  return { width: best.width, height: best.height };
}
/** Frames on H3's 17k+5 grid at 24 fps, rounded up (5 s → 124, 15 s → 362). */
export const charswapFrames = (seconds: number) => { const f = Math.max(5, Math.round(seconds * 24)); return f + ((5 - (f % 17)) % 17 + 17) % 17; };
/** H3's video latent: 16 px cells (the DiT then works on 2×2 cells = 32 px). The mask is built on this grid. */
export const H3_LATENT_CELL = 16;
/** Mask grow in pixels at 768p (H3 Relay grows 64 px); tight / loose / box widen or narrow it. Converted to latent cells at the run's size. */
export const CHARSWAP_GROW_PX = { tight: 32, normal: 64, loose: 96, box: 128 } as const;
export const charswapGrowCells = (height: number, width: number, grow?: string) => {
  const px = CHARSWAP_GROW_PX[(grow && grow in CHARSWAP_GROW_PX ? grow : 'normal') as keyof typeof CHARSWAP_GROW_PX];
  return Math.max(1, Math.round((px * Math.min(width, height)) / 736 / H3_LATENT_CELL));
};
/** Sampling: the turbo recipe of Comfy's Openjutsu app (8 steps, er_sde / normal, sigma shift 12/3) or, without turbo, Akatz Labs' native recipe (20 steps,
 *  res_multistep / simple, no turbo LoRA, no sigma shift). steps 4–40 overrides; LoRA strength 0–1.5 (the card's default 1.0). */
export function charswapSampling(i: Record<string, any>) {
  const turbo = !(i.turbo === false || i.turbo === '0' || i.turbo === 'false' || i.turbo === 'off');
  const n = Math.round(Number(i.steps)); const steps = Number.isFinite(n) && n >= 4 && n <= 40 ? n : turbo ? 8 : 20;
  const s = Number(i.loraStrength); const loraStrength = Number.isFinite(s) && s >= 0 && s <= 1.5 ? Math.round(s * 100) / 100 : 1;
  return { turbo, steps, loraStrength, sampler: turbo ? 'er_sde' : 'res_multistep', scheduler: turbo ? 'normal' : 'simple', cfg: 1 };
}
export type CharSwapMask =
  | { mode: 'off'; reason: string }
  | { mode: 'point'; point: { x: number; y: number }; text: string }
  | { mode: 'text'; text: string; side: 'left' | 'right' | null }
  | { mode: 'upload'; path: string };
/** SAM 3 text for "who to swap": the person word in the user's words, else "person" (SAM 3 matches concepts, not positions). */
export function samNoun(target?: string) {
  const t = (target ?? '').toLowerCase();
  if (/\b(woman|women|girl|girls|lady|ladies|female)\b/.test(t)) return 'woman';
  if (/\b(man|men|guy|guys|boy|boys|male)\b/.test(t)) return 'man';
  if (/\b(child|children|kid|kids)\b/.test(t)) return 'child';
  return 'person';
}
/** "on the left" / "on the right" in who to swap → keep SAM's frame-0 find on that half of the frame only. */
export const samSide = (target?: string): 'left' | 'right' | null => swapSide(target); // shared/cloudSwap.ts (the same rule decides whether H3 can run)
/** How the edit mask is found. Motion transfer rebuilds the whole frame (no mask); maskMode "none" turns it off; an uploaded mask video wins; then
 *  the click point; else SAM text from maskPrompt (maskMode text) or who to swap. */
export function charswapMask(i: Record<string, any>, motion: boolean): CharSwapMask {
  if (motion) return { mode: 'off', reason: 'motion transfer rebuilds the whole frame' };
  if (i.maskMode === 'none' || i.charswapMask === 'off') return { mode: 'off', reason: 'mask turned off' };
  if (i.maskPath && (i.maskMode === 'upload' || !i.maskMode)) return { mode: 'upload', path: String(i.maskPath) };
  const words = (i.maskMode === 'text' && typeof i.maskPrompt === 'string' && i.maskPrompt.trim()) || '';
  const p = i.point; if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { mode: 'point', point: { x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) }, text: words || samNoun(i.target) };
  return { mode: 'text', text: (words || samNoun(i.target)).slice(0, 120), side: samSide(i.target) };
}
/** What the route can't take (null = fine): the swap range must be 2–15 s. */
export function charswapCloudIssue(i: Record<string, any>): string | null {
  const s = Number(i.duration);
  if (Number.isFinite(s) && s > CHARSWAP_CLOUD_SECONDS.max + 0.05) return `H3 Character Swap on Comfy Cloud takes up to ${CHARSWAP_CLOUD_SECONDS.max} s in one pass; your range is ${Math.round(s * 10) / 10} s. Set a shorter swap range`;
  if (Number.isFinite(s) && s > 0 && s < CHARSWAP_CLOUD_SECONDS.min) return `H3 Character Swap needs at least ${CHARSWAP_CLOUD_SECONDS.min} s of video`;
  return null;
}

const load = () => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, CHARSWAP_CLOUD_GRAPH), 'utf8')) as Record<string, any>;
/** The mask nodes (SAM 3.1, latent-grid pooling, grow, empty-frame fallback, source latent + noise mask); removed for mask-free runs. */
export const CHARSWAP_MASK_NODES = ['36', '37', '38', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '50', '51', '52', '53', '55', '56', '57', '58', '59', '60', '61', '62', '63', '64', '65', '66'];
/** What Comfy Cloud must have (all checked on 2026-10-26 except the imported LoRA; the optional 768p turbo import is not required). */
export const CHARSWAP_CLOUD_REQUIRES = {
  nodes: [...new Set(Object.values<any>(load()).map((n) => String(n.class_type)))].sort(),
  models: [
    { loader: 'UNETLoader', field: 'unet_name', file: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors' },
    { loader: 'LoraLoaderModelOnly', field: 'lora_name', file: TURBO_SHARED },
    { loader: 'LoraLoaderModelOnly', field: 'lora_name', file: CHARSWAP_LORA_DEFAULT /* the user's import */ },
    { loader: 'CLIPLoader', field: 'clip_name', file: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors' },
    { loader: 'VAELoader', field: 'vae_name', file: 'minimax_h3_video_vae_fp16.safetensors' },
    { loader: 'VAELoader', field: 'vae_name', file: 'minimax_h3_audio_vae_fp32.safetensors' },
    { loader: 'CheckpointLoaderSimple', field: 'ckpt_name', file: 'sam3.1_multiplex_fp16.safetensors' },
  ],
};

/** Plan for one swap (one Comfy Cloud job). input.charswapLora / input.charswapTurbo = the loader values the free check found. */
export function charswapCloudPlan(j: { id: string; toolId: string; provider: string; input: Record<string, any> }): Plan {
  const i = j.input; const image = i.refPaths?.[0] ?? i.imagePath;
  if (!i.videoPath || !image) throw Object.assign(new Error('H3 Character Swap needs a video and a character image'), { reasonCode: 'input_invalid', errorType: 'validation' });
  const bad = charswapCloudIssue(i); if (bad) throw Object.assign(new Error(bad), { reasonCode: 'input_invalid', errorType: 'validation' });
  const seconds = Math.min(CHARSWAP_CLOUD_SECONDS.max, Math.max(CHARSWAP_CLOUD_SECONDS.min, Number(i.duration) || 5));
  const preset = charswapPreset(i); const tier = CHARSWAP_PRESETS[preset].tier; const { width, height } = charswapSize(Number(i.width), Number(i.height), tier); const length = charswapFrames(seconds);
  const motion = i.mode === 'motion_transfer' || j.toolId === 'motion-transfer';
  const own = typeof i.prompt === 'string' ? i.prompt.trim() : ''; // the user's words, already in H3's <Picture 1> / <Video 1> form (buildCloudPlan → withRefGrammar)
  const prompt = motion ? (own || h3MotionPrompt()).slice(0, 4000) : composeH3SwapPrompt(i);
  const seed = Math.max(0, Math.floor(Number(i.seed) || 0)) || Math.floor(Math.random() * 2 ** 32);
  const smp = charswapSampling(i); const mask = charswapMask(i, motion);
  const g = load(); const N = CHARSWAP_CLOUD_NODES; const src24 = `${i.videoPath}.${j.id}-charswap24.mp4`;
  // models: turbo (the imported 768p build at 768p when found) or none; character LoRA strength
  const turboFile = tier === '768p' && typeof i.charswapTurbo === 'string' && i.charswapTurbo ? i.charswapTurbo : TURBO_SHARED;
  if (smp.turbo) setIn(g, N.turbo, 'lora_name', turboFile);
  else { delete g[N.turbo]; delete g[N.shift]; g[N.attention].inputs.model = [N.unet, 0]; g[N.lora].inputs.model = [N.attention, 0]; }
  setIn(g, N.lora, 'lora_name', String(i.charswapLora || charswapLoraName())); setIn(g, N.lora, 'strength_model', smp.loraStrength);
  Object.assign(g[N.scheduler].inputs, { steps: smp.steps, scheduler: smp.scheduler }); setIn(g, N.sampler, 'sampler_name', smp.sampler);
  setIn(g, N.video, 'file', { __file: src24 }); setIn(g, N.image, 'image', { __file: image }); setIn(g, N.prompt, 'value', prompt);
  Object.assign(g[N.cond].inputs, { width, height, length }); setIn(g, N.seed, 'noise_seed', seed);
  const prep: Plan['passes'][number]['prep'] = [{ kind: 'fps', src: i.videoPath, out: src24, fps: 24, width, height, seconds, frames: length, audio: i.hasAudio !== false }];
  // edit mask
  const cw = width / H3_LATENT_CELL, ch = height / H3_LATENT_CELL; let maskNote = '';
  const diagnostics: NonNullable<Plan['passes'][number]['diagnostics']> = [];
  if (mask.mode === 'off') {
    for (const k of CHARSWAP_MASK_NODES) delete g[k];
    g[N.guide].inputs.latent = [N.cond, 1]; g[N.sample].inputs.latent_image = [N.cond, 1]; maskNote = `mask-free (${mask.reason}; the prompt names who to replace)`;
  } else {
    for (const k of ['50', '60']) Object.assign(g[k].inputs, { width: cw, height: ch });
    setIn(g, '53', 'expand', charswapGrowCells(height, width, i.maskGrow));
    if (mask.mode === 'upload') {
      for (const k of ['40', '41', '42', '43', '44', '45', '46', '47', '48']) delete g[k];
      const m24 = `${mask.path}.${j.id}-charswap24-mask.mp4`; setIn(g, '36', 'file', { __file: m24 }); g['49'].inputs.mask = ['38', 0];
      prep.push({ kind: 'fps', src: mask.path, out: m24, fps: 24, width, height, seconds, frames: length, audio: false }); maskNote = 'edit mask from your mask video';
    } else {
      for (const k of ['36', '37', '38']) delete g[k];
      setIn(g, '41', 'text', mask.text);
      if (mask.mode === 'point') {
        const px = { x: Math.min(width - 1, Math.round(mask.point.x * width)), y: Math.min(height - 1, Math.round(mask.point.y * height)) };
        setIn(g, '44', 'value', JSON.stringify([px])); delete g['43'].inputs.conditioning; g['43'].inputs.positive_coords = ['44', 0];
        delete g['45']; delete g['46']; g['47'].inputs.initial_mask = ['43', 0]; maskNote = `edit mask: SAM 3.1 from your click (${px.x}, ${px.y}), tracked`;
      } else {
        delete g['44'];
        if (mask.side) { Object.assign(g['45'].inputs, { width: width / 2, height }); setIn(g, '46', 'x', mask.side === 'right' ? 0 : width / 2); }
        else { delete g['45']; delete g['46']; g['47'].inputs.initial_mask = ['43', 0]; }
        maskNote = `edit mask: SAM 3.1 "${mask.text}"${mask.side ? ` on the ${mask.side}` : ''}, tracked`;
      }
    }
    maskNote += `, grown ${g['53'].inputs.expand * H3_LATENT_CELL} px; a frame where nobody is found is regenerated whole`;
    // Actual masks from this run, not inferred from output pixels. Separate from result outputs and audio postprocessing.
    // Half-canvas, 8-bit video previews are lossy visual diagnostics, NOT the native sampler's temporally/2×2-patch pooled tensor.
    for (const [offset, label, stage, note] of [
      [0, 'Selection mask (before growth)', 'selection', 'White = selected. Actual tracked or uploaded mask, before latent-grid threshold, growth and empty-frame fallback.'],
      [4, 'Edit mask (before native H3 pooling)', 'edit-before-native', 'White = regenerate. 16 px grid after threshold, growth and empty-frame fallback; H3 subsequently pools to 32 px patches and converts time. Not the effective sampler tensor.'],
    ] as const) {
      const id = 70 + offset; const image = offset ? String(id) : '49', scaled = String(id + 1), video = String(id + 2), save = String(id + 3);
      if (offset) g[image] = { class_type: 'MaskToImage', inputs: { mask: ['62', 0] } };
      g[scaled] = { class_type: 'ImageScale', inputs: { image: [image, 0], upscale_method: 'nearest-exact', width: width / 2, height: height / 2, crop: 'disabled' } };
      g[video] = { class_type: 'CreateVideo', inputs: { images: [scaled, 0], fps: 24, bit_depth: 8 } };
      g[save] = { class_type: 'SaveVideo', inputs: { video: [video, 0], filename_prefix: `openhiggsfield/charswap-mask-${stage}`, format: 'auto', 'format.codec': 'auto' } };
      diagnostics.push({ node: save, label, stage, note: `${note} Silent half-canvas 8-bit preview, not lossless mask data.` });
    }
  }
  if (i.hasAudio === false) { // a silent clip: no reference audio, no audio guide (H3 still makes its own sound; keepAudio decides what is kept)
    delete g[N.cond].inputs['ref_audios.ref_audio_0']; g[N.guider].inputs.conditioning = [N.cond, 0]; delete g[N.guide];
  }
  const label = motion ? 'Motion transfer' : 'Character swap';
  return { tool: j.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: i.keepAudio !== false, labels: [label],
    notes: [`H3 Character Swap on Comfy Cloud: ${CHARSWAP_PRESETS[preset].label}, ${width}×${height}, ${seconds} s (${length} frames), ${smp.turbo ? `turbo ${turboFile === TURBO_SHARED ? '(shared build)' : '768p build'}` : 'no turbo'} ${smp.steps} steps ${smp.sampler}/${smp.scheduler}, Character Swap LoRA ${smp.loraStrength}, ${maskNote}`,
      ...(diagnostics.length ? ['Two silent mask previews are saved separately; extra Cloud encoding/storage overhead is unmeasured and may add GPU-time cost. They are not effective sampler tensors.'] : [])],
    passes: [{ label, workflow: CHARSWAP_CLOUD_GRAPH, graph: g, output: N.save, prep, diagnostics,
      expect: { fps: 24, width, height, length, seconds, tier, preset, seed, prompt, ...(!motion ? { prompts: [prompt] } : {}), lora: g[N.lora].inputs.lora_name, turbo: smp.turbo ? turboFile : null, steps: smp.steps, loraStrength: smp.loraStrength, mask: mask.mode } }] };
}

/** Free check (GET only, before any upload or submit): is the LoRA in this account's Comfy Cloud model library? (comfy/cloudImports.ts: the Model
 *  Library search, else LoraLoaderModelOnly's choices; 'missing' only when a check answered, 'unknown' when neither did.) */
export async function checkCharswapLora(get: (p: string) => Promise<Response>, file = charswapLoraName()): Promise<{ state: 'present' | 'missing' | 'unknown'; loaderPath: string | null; via: string | null }> {
  return checkImportedLora(get, { file, aliases: file === CHARSWAP_LORA_DEFAULT ? [CHARSWAP_LORA_HF_FILE] : [],
    stem: file === CHARSWAP_LORA_DEFAULT ? 'h3_character_swap' /* in both the imported name and the plain HF name */ : path.posix.basename(file).replace(/\.(safetensors|sft)$/i, '') });
}
/** Free check for the optional 768p turbo import (model library search only: Cloud's shared list has no 768p build). */
export async function checkCharswapTurbo(get: (p: string) => Promise<Response>): Promise<{ state: 'present' | 'missing' | 'unknown'; loaderPath: string | null }> {
  const a = await findInAssets(get, 'loras', 'turbo_8step_v1.0_768p', new Set([TURBO_768_HF_FILE, TURBO_768_DEFAULT]), TURBO_768_DEFAULT);
  return { state: a.loaderPath ? 'present' : a.answered ? 'missing' : 'unknown', loaderPath: a.loaderPath };
}
/** The free check's report: which recommended files are in the library, and how to import the missing ones. */
export const charswapRecommendedReport = (lora: { state: string; loaderPath: string | null }, turbo: { state: string; loaderPath: string | null }) =>
  CHARSWAP_RECOMMENDED.map((m) => { const c = m.id === 'charswap-lora' ? lora : turbo;
    return { ...m, state: c.state, loaderPath: c.loaderPath, ...(c.state === 'missing' ? { todo: importTodo(m) } : {}) }; });
/** Form fields for this route's settings (Person swap / Motion transfer): charswapPreset openjutsu|fast, turbo 0|1, steps 4–40, loraStrength 0–1.5,
 *  charswapMask off. Only the fields that are set; other routes ignore them. */
export function charswapFields(f: Record<string, string>): Record<string, any> | { error: string } {
  const o: Record<string, any> = {}; const has = (k: string) => f[k] != null && String(f[k]).trim() !== '';
  if (has('charswapPreset')) { if (!(f.charswapPreset in CHARSWAP_PRESETS)) return { error: 'charswapPreset must be openjutsu (Sharper, 768p) or fast (Faster and cheaper, 480p).' }; o.charswapPreset = f.charswapPreset; }
  if (has('turbo')) { if (!/^(0|1|true|false|on|off)$/i.test(f.turbo)) return { error: 'turbo must be 1 or 0.' }; o.turbo = /^(1|true|on)$/i.test(f.turbo); }
  if (has('steps')) { const n = Number(f.steps); if (!Number.isInteger(n) || n < 4 || n > 40) return { error: 'steps must be a whole number from 4 to 40.' }; o.steps = n; }
  if (has('loraStrength')) { const n = Number(f.loraStrength); if (!Number.isFinite(n) || n < 0 || n > 1.5) return { error: 'loraStrength must be from 0 to 1.5.' }; o.loraStrength = n; }
  if (has('charswapMask')) { if (!/^(auto|off)$/.test(f.charswapMask)) return { error: 'charswapMask must be auto or off.' }; if (f.charswapMask === 'off') o.charswapMask = 'off'; }
  return o;
}
