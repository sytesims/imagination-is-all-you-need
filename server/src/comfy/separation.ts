/**
 * Keep the background (Translate a video, Change Voice; 2026-11-01): split the clip's sound into the voice and everything else (music, ambience)
 * with MelBand RoFormer, from the official Comfy template audio_melbandroformer_audio_separation (Comfy-Org/workflow_templates, MIT), flattened in
 * workflows/audio-separation-melband-api.json (scripts/build-voice-workflows.py). The new voice is cloned from the voice stem only and mixed over the
 * background stem, so the original speech is gone and the music stays.
 *  - Optional: it needs the kijai/ComfyUI-MelBandRoFormer node pack and MelBandRoformer_fp16.safetensors (456 MB, models/diffusion_models). Without
 *    them the job runs as before (no separation) with a plain note. Nothing is installed or downloaded here: the file comes through the normal
 *    download flow (POST /api/local/downloads {downloadId: SEPARATION_PROVIDER}), after the user says yes.
 *  - Ready = the connected ComfyUI lists both node classes AND the model file is on this computer. Unknown (no ComfyUI answer yet) counts as not ready,
 *    so a job never fails on a guess.
 */
import { comfyNodes, missingNodes } from '../comfyNodes.js';
import { comfyFileBytes, comfyFoldersKnown } from '../hardware/comfyModels.js';
import { modelsDir, modelFileBytes, missingOverrideFor } from '../hardware/requirements.js';

export const SEPARATION_WORKFLOW = 'audio-separation-melband-api.json';
/** The download id (and open-weights provider) for the separation files: POST /api/local/downloads {downloadId}. */
export const SEPARATION_PROVIDER = 'comfy-melband-separation';
export const SEPARATION_NODES = ['MelBandRoFormerModelLoader', 'MelBandRoFormerSampler'];
export const SEPARATION_PACK = { name: 'ComfyUI-MelBandRoFormer', repo: 'https://github.com/kijai/ComfyUI-MelBandRoFormer', pin: '92c86854e6654f4aacc97484471af95c98ea16d4' };
export const SEPARATION_MODEL = { file: 'MelBandRoformer_fp16.safetensors', folder: 'diffusion_models', bytes: 456_479_072,
  url: 'https://huggingface.co/Kijai/MelBandRoFormer_comfy/resolve/main/MelBandRoformer_fp16.safetensors' };
/** Graph nodes (workflows/audio-separation-melband-api.json): the input, and the two stems' save nodes (output order on the pass: vocals, background). */
export const SEP_NODES = { input: '1', vocals: '4', background: '5' } as const;
/** Plain note for a job that ran without separation. */
export const NO_SEPARATION_NOTE = 'Background music not kept: add the separation model.';

export interface SeparationStatus {
  ready: boolean;
  /** installed | missing | unknown (no local ComfyUI answer yet) */ nodes: 'installed' | 'missing' | 'unknown'; missingNodes: string[];
  /** present | missing | unknown (no models folder and ComfyUI hasn't listed its folders yet) */ model: 'present' | 'missing' | 'unknown';
  file: string; folder: string; bytes: number; missingBytes: number; downloadId: string; pack: typeof SEPARATION_PACK; note: string | null;
}
let forced: boolean | null = null;
/** Test hook: force ready (true) / not ready (false); null = read this computer. */
export const setSeparationReady = (v: boolean | null) => { forced = v; };

export function separationStatus(): SeparationStatus {
  const have = comfyNodes(); const miss = have ? missingNodes([SEPARATION_WORKFLOW]) : [...SEPARATION_NODES];
  const nodes = forced != null ? (forced ? 'installed' : 'missing') : !have ? 'unknown' : miss.length ? 'missing' : 'installed';
  const ov = missingOverrideFor(`local:${SEPARATION_PROVIDER}`); const dir = modelsDir(); const { file, folder, bytes } = SEPARATION_MODEL;
  const onDisk = (b: number | null) => b != null && (b === 0 || b >= bytes); // ComfyUI may list a file without its size (older builds): listed = present
  const model: SeparationStatus['model'] = forced != null ? (forced ? 'present' : 'missing') : ov ? 'missing' : dir ? (onDisk(modelFileBytes(dir, folder, file)) ? 'present' : 'missing')
    : comfyFoldersKnown([folder]) ? (onDisk(comfyFileBytes(folder, file)) ? 'present' : 'missing') : 'unknown';
  const ready = nodes === 'installed' && model === 'present';
  const note = ready ? null : nodes === 'missing' && model !== 'present' ? `${NO_SEPARATION_NOTE} It needs the MelBandRoFormer node pack in ComfyUI and its model file (456 MB).`
    : nodes === 'missing' ? `${NO_SEPARATION_NOTE} It needs the MelBandRoFormer node pack in ComfyUI.` : model !== 'present' ? `${NO_SEPARATION_NOTE} Its model file is 456 MB.` : NO_SEPARATION_NOTE;
  return { ready, nodes, missingNodes: nodes === 'installed' ? [] : nodes === 'missing' && forced == null ? miss : [...SEPARATION_NODES], model, file, folder, bytes, missingBytes: model === 'present' ? 0 : bytes,
    downloadId: SEPARATION_PROVIDER, pack: SEPARATION_PACK, note };
}
