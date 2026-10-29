/**
 * Model files that don't run on a Mac (Apple Silicon, PyTorch MPS), 2026-10-25. ONE check, by the weight file names a local route loads
 * (hardware/requirements.ts requirementsFor: the manifest rows plus the workflow's own loader files). fitFor turns a hit into
 * too_heavy / unsupported_weights with MAC_WEIGHTS_REASON on MPS only; routing (select.ts, defaults.ts) and the model listing
 * (modelRegistry.ts: the Local run-on is 'unavailable', no Download) read that. Other hardware (CUDA, CPU-only) is unchanged.
 *  - fp8 (fp8_scaled, fp8mixed, fp8_e4m3fn, fp8experts…): MPS has no float8 dtype, loading fails (readiness/manifest/models.json sources mps-fp8).
 *    One fp8 file blocks the route, also when the rest is bf16 (Fish Audio Drama 3: drama3_fp8experts_bf16).
 *  - nvfp4: fp4 values with fp8 block scales, so the same float8 gap (MiniMax H3's nvfp4_awq text encoder).
 *  - wNaM (w4a8 GPTQ, w6a8): low-bit CUDA kernels with no MPS path (FLUX 3 Klein's prompt upsampler, MOSS-Image's text encoder).
 * int8 / int8_convrot is NOT blocked: ComfyUI dequantizes it where its int8 kernels are missing (Comfy changelog "MPS int8", ComfyUI PR 16130;
 * readiness sources int8-convrot), and Qwen Image 2.1, YuE2 and MiniMax Music 3 (int8_convrot) run on Apple Silicon, slowly (mps amber).
 */
import { NEEDS_NVIDIA } from '../shared/modelIds.js';
/** The user-facing words: the one shared line (shared/modelIds.ts NEEDS_NVIDIA). The name stays for callers. */
export const MAC_WEIGHTS_REASON = NEEDS_NVIDIA;
const RULES: { re: RegExp; kind: string }[] = [
  { re: /fp8/i, kind: 'fp8' },
  { re: /nvfp4/i, kind: 'nvfp4' },
  { re: /(^|[_.-])w\d+a\d+([_.-]|$)/i, kind: 'wNaM' },
];
/** The kind of weights in this file name that a Mac can't load ('fp8' | 'nvfp4' | 'wNaM'), or null when it can. */
export const macBlockedKind = (file: string): string | null => RULES.find((r) => r.re.test(file))?.kind ?? null;
/** The files of this list a Mac can't load (unique, in order). */
export const macBlockedFiles = (files: string[]): string[] => [...new Set(files.filter((f) => !!macBlockedKind(f)))];
