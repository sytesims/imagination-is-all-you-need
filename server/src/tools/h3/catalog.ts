/**
 * H3 community LoRAs, camera presets and capability flags (2026-10-17). Manifest entries only:
 * nothing is downloaded or installed (readiness/manifest/build-manifest.py H3 block). Licences are shown on the Models & Licences page only.
 */
import type { H3Family } from './rules.js';
export interface H3Lora { id: string; file: string; family: H3Family; source: string; trigger?: string; license: string; localOnly: boolean; note: string }
export const H3_LORAS: Record<string, H3Lora> = {
  turboFl2v: { id: 'turboFl2v', file: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors', family: 'fl2va', source: 'https://huggingface.co/Comfy-Org/MiniMax-H3', license: 'apache-2.0', localOnly: false, note: 'LightX2V FL2V 8-step (Fast mode)' },
  turboRef2v: { id: 'turboRef2v', file: 'minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors', family: 'ref2va', source: 'https://huggingface.co/Comfy-Org/MiniMax-H3', license: 'apache-2.0', localOnly: false, note: 'LightX2V Ref2V 4-step (lipsync runs it at 6 steps)' },
  camera: { id: 'camera', file: 'camera_motion_h3_lora_v1_3000_pruned.safetensors', family: 'fl2va', source: 'https://civitai.com/models/2914784/cameramotionh3', trigger: 'camera motion', license: 'h3-camera-motion-civitai', localOnly: true, note: 'camera_motion_h3 v1.0 (Civitai version 3297480, 3000-step pruned). Licence allows hosted/commercial use, but a fal /lora route is not wired (needs approval + a public URL; Civitai downloads need a token), so local only for now (cloud = prompt-only camera move on plain H3)' },
  style: { id: 'style', file: 'minimax_h3_style_transfer_v1.0_r64.safetensors', family: 'ref2va', source: 'https://huggingface.co/Alissonerdx/Minimax-H3-ComfyUI', trigger: 'style_transfer:', license: 'alissonerdx-unspecified', localOnly: true, note: 'Style Transfer r64; no licence stated for this file → local only' },
  vfx: { id: 'vfx', file: 'minimax_h3_vfx_edit_v1.0_r128.safetensors', family: 'ref2va', source: 'https://huggingface.co/Alissonerdx/Minimax-H3-ComfyUI', trigger: 'vfx_edit:', license: 'alissonerdx-unspecified', localOnly: true, note: 'VFX Edit r128; no licence stated for this file → local only' },
};
/** Camera Moves presets (camera_motion_h3 move set; prompt wording is ours). Intensity = LoRA strength + adverb. */
export const H3_CAMERA_MOVES: [string, string, string][] = [
  ['h3-push-in', 'Push-in', 'push-in toward the subject'], ['h3-pull-back', 'Pull-back', 'pull-back revealing the scene'],
  ['h3-handheld', 'Handheld', 'handheld follow with natural shake'], ['h3-orbit', 'Orbit', 'orbit around the subject'],
  ['h3-aerial', 'Aerial', 'aerial drone move over the scene'], ['h3-crane', 'Crane', 'crane up rising above the subject'], ['h3-pan', 'Pan', 'pan across the scene'],
];
export const H3_INTENSITY = { slow: { label: 'Slow', strength: 0.6, adverb: 'slow, smooth' }, aggressive: { label: 'Aggressive', strength: 1.0, adverb: 'fast, aggressive' } } as const;
export type H3Intensity = keyof typeof H3_INTENSITY;
export const cameraPrompt = (move: string, intensity: H3Intensity = 'slow', extra = '') => `camera motion, ${H3_INTENSITY[intensity].adverb} ${move}${extra ? `. ${extra}` : ''}`;
/** Extend: +5 s / +10 s. Overlap = 22 source frames (17·1+5) anchored at frame 0 for continuity, trimmed on concat. */
/** +5 / +10 s on every H3 place; +8 s on H3 Extend · via last frame (Comfy Router) only (routes refuse it elsewhere). */
export const H3_EXTEND_SECONDS = [5, 8, 10] as const;
/** What the local graph and fal's H3 Max extend-video add, and the shortest clip they take. */
export const H3_EXTEND_SECONDS_CLASSIC = [5, 10] as const; export const H3_EXTEND_MIN_SOURCE = 4;
export const H3_EXTEND_OVERLAP_FRAMES = 22;
/** Fast / Quality (Generate Video): Fast = LightX2V 8-step LoRA, Quality = 20 steps without it. */
export const H3_QUALITY = { fast: { label: 'Fast', steps: 8, lora: 'turboFl2v' }, quality: { label: 'Quality', steps: 20, lora: null } } as const;
