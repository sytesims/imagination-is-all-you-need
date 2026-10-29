/**
 * LTX-2.5 LoRA registry (2026-10-26): every style / effect LoRA the local LTX-2.5 22B graphs can load, in one place.
 * Isomorphic (no server imports): the server patches graphs and lists files from it, the web can name the files.
 *  - comfy/ltx25Video.ts withLtxLoras() chains a LoraLoaderModelOnly per entry after the GGUF model loader (ti2v + flf graphs).
 *  - hardware/requirements.ts adds the entry's file to the job's "Files needed", so a missing LoRA shows as a download.
 *  - ltxLorasForJob() says which entries a job uses (Photo FX → Exploded view on comfy-ltx25-video; Footage Effects → its IC-LoRA on comfy-ltx25-iclora).
 *  - IC-LoRAs (ic: true, mode v2v) load in the shared video-to-video base's own LoRA node (comfy/ltx25IcLora.ts), never through withLtxLoras(),
 *    because GetICLoRAParameters must read that loader's output.
 * Settings are each author's own (model card / shipped workflow); the source and credit stay with the entry.
 */
import { footageEffect } from './footageFx.js';

export type LtxLoraMode = 't2v' | 'i2v' | 'flf' | 'v2v';
export interface LtxLora {
  id: string; label: string; file: string; folder: 'loras';
  /** Exact size from the Hugging Face API. */
  bytes: number;
  /** Words the prompt must carry (the LoRA was trained on them). */
  trigger: string;
  /** LoRA strength per mode (the author's recommendation); a mode that is missing is not offered. */
  strengths: Partial<Record<LtxLoraMode, number>>;
  sourceUrl: string; credit: string; licence: string;
  /** Direct file URL for the app's downloader; null = the user downloads it by hand (login wall). */
  url: string | null;
  /** Stage 2 sampler when the author's graph differs from the template's (euler_ancestral). */
  stage2Sampler?: 'euler';
  /** Our default prompt with a {subject} slot (the trigger first, as the author's captions do). */
  promptTemplate?: string;
  /** An IC-LoRA (reference video guide): runs on the shared video-to-video base (comfy/ltx25IcLora.ts). */
  ic?: boolean;
}
/** Lightricks' official LTX-2.5 IC-LoRAs (2026-10-26): reference_downscale_factor 1, model_version 2.5 (read from each file's header). */
const lightricksIc = (id: string, label: string, repo: string, file: string, bytes: number, trigger: string, v2v: number): LtxLora => ({
  id, label, file, folder: 'loras', bytes, trigger, strengths: { v2v }, ic: true, licence: 'ltx-2x-community', credit: `Lightricks (${label})`,
  sourceUrl: `https://huggingface.co/Lightricks/${repo}`, url: `https://huggingface.co/Lightricks/${repo}/resolve/main/${file}` });

export const LTX_LORAS: Record<string, LtxLora> = {
  xpldv: {
    id: 'xpldv', label: 'Exploded view (XPLDV)', file: 'ltx-2.5-xpldv_v5-lora.safetensors', folder: 'loras', bytes: 402758608,
    trigger: 'separates into an ordered exploded view.',
    strengths: { i2v: 0.5, flf: 0.7 }, // model card: 0.5 balanced (0.75 stronger, may simplify detail); 0.7 for first + last frame
    sourceUrl: 'https://huggingface.co/DigitalByte/LTX-2.5-Exploded-View-XPLDV', credit: 'DigitalByte (XPLDV v5)', licence: 'ltx-2x-community',
    url: 'https://huggingface.co/DigitalByte/LTX-2.5-Exploded-View-XPLDV/resolve/main/ltx-2.5-xpldv_v5-lora.safetensors',
    stage2Sampler: 'euler',
    promptTemplate: '{subject} separates into an ordered exploded view. Its outer parts move outward along controlled paths, revealing the internal components underneath. '
      + 'The parts settle into an organized layered arrangement around the exposed core while keeping their original shapes. '
      + 'The camera stays steady with a slow push in. The lighting matches the image and stays consistent throughout the continuous shot.',
  },
  // Footage Effects (shared/footageFx.ts). Strengths are the default look; Rain / Flood pick their own on the water LoRA. Sizes = the files on disk.
  'clean-plate': lightricksIc('clean-plate', 'Clean Plate IC-LoRA', 'LTX-2.5-22b-IC-LoRA-Clean-Plate', 'ltx-2.5-22b-ic-lora-clean-plate-1.0.safetensors', 327318439, '', 1.0),
  'day-to-night': lightricksIc('day-to-night', 'Day to Night IC-LoRA', 'LTX-2.5-22b-IC-LoRA-Day-To-Night', 'ltx-2.5-22b-ic-lora-day-to-night-0.9.safetensors', 327318440, '', 1.0),
  'water-simulation': lightricksIc('water-simulation', 'Water Simulation IC-LoRA', 'LTX-2.5-22b-IC-LoRA-Water-Simulation', 'ltx-2.5-22b-ic-lora-water-simulation-0.9.safetensors', 906080568, 'ADD WATER', 1.1),
  'alpha-gen': lightricksIc('alpha-gen', 'Alpha Gen IC-LoRA', 'LTX-2.5-22b-IC-LoRA-Alpha-Gen', 'ltx-2.5-22b-ic-lora-alpha-gen-0.9.safetensors', 1308787472, '', 1.0),
};

const firstType = (t: unknown): string => (Array.isArray(t) ? String(t[0] ?? '') : typeof t === 'string' ? (t.replace(/[[\]"]/g, '').split(',')[0] ?? '').trim() : '');
export type LtxLoraUse = { id: string; file: string; strength: number };
/** One LoRA at its mode's strength (null when the LoRA has no strength for that mode). */
export function ltxLoraUse(id: string, mode: LtxLoraMode, strength?: number): LtxLoraUse | null {
  const l = LTX_LORAS[id]; const s = strength ?? l?.strengths[mode]; return l && s != null ? { id, file: l.file, strength: s } : null;
}
/** The prompt for a LoRA: its template with the subject filled in (default "The object"); the trigger is always present. */
export function ltxLoraPrompt(id: string, subject?: string | null): string {
  const l = LTX_LORAS[id]; const s = String(subject ?? '').trim().replace(/[.\s]+$/, '');
  if (!l?.promptTemplate) return s;
  const subj = s ? s[0].toUpperCase() + s.slice(1) : 'The object';
  return l.promptTemplate.replace('{subject}', subj).trim();
}
/** Photo FX effects that run a LoRA on local LTX-2.5 (effect id → LoRA id). */
export const PHOTO_FX_LTX_LORA: Record<string, string> = { 'exploded-view': 'xpldv' };
/** Which LoRAs a job loads (empty for every job without one). */
export function ltxLorasForJob(toolId: string | undefined, providerId: string | undefined, input: Record<string, any> = {}): LtxLoraUse[] {
  if (toolId === 'footage-fx' && providerId === 'comfy-ltx25-iclora') { const e = footageEffect(firstType(input.types)); return e ? [ltxLoraUse(e.lora, 'v2v', e.strength)].filter((x): x is LtxLoraUse => !!x) : []; }
  if (providerId !== 'comfy-ltx25-video') return [];
  const types: string[] = Array.isArray(input.types) ? input.types.map(String) : typeof input.types === 'string' ? input.types.replace(/[[\]"]/g, '').split(',').map((x: string) => x.trim()) : [];
  if (toolId === 'photo-fx') return types.map((t) => PHOTO_FX_LTX_LORA[t]).filter(Boolean).map((id) => ltxLoraUse(id, 'i2v')).filter((x): x is LtxLoraUse => !!x);
  return [];
}
export type LtxLoraState = 'ready' | 'downloading' | 'missing' | 'unknown';
/** File state from the bytes on disk (null = not found; dirKnown false = no models folder set). */
export function ltxLoraState(l: LtxLora, haveBytes: number | null, dirKnown = true): LtxLoraState {
  if (!dirKnown) return 'unknown'; if (haveBytes == null || haveBytes <= 0) return 'missing';
  return haveBytes < l.bytes ? 'downloading' : 'ready';
}
