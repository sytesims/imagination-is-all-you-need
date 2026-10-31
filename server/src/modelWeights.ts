/**
 * DP #20.8 / #20.7 (Oct 19): weight files per model, from public metadata only (nothing is downloaded).
 * Source: readiness/manifest/models.json (file, ComfyUI folder, exact byte size from the Hugging Face LFS headers or the Civitai API, download URL,
 * the workflows that load it). The four files the manifest has no size for were read from the public Hugging Face API tree listing
 * (GET https://huggingface.co/api/models/<repo>/tree/main, Oct 19 2026): exact bytes too, so no size here is approximate (sizeApprox false).
 * A model's files = every manifest entry loaded by one of the model's local workflows (/api/models workflows[]).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MANIFEST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../readiness/manifest/models.json');
/** Exact sizes from the Hugging Face API tree listing (public metadata) for manifest rows without a size. */
export const HF_SIZES: Record<string, number> = {
  'flux1-fill-dev.safetensors': 23804922408,
  'qwen3.5_9b_flux3_prompt_upsampler_int8_convrot.safetensors': 9748113996, // FLUX 3 Klein's Mac-runnable prompt upsampler (HF tree API, 2026-10-27)
  'qwen3vl_4b_int8_convrot.safetensors': 4858559240,
  'depth_anything_v2_vits.pth': 99218434,
  'Qwen-Edit-2509-Multiple-angles.safetensors': 236117032, // Shots angles LoRA (HF LFS x-linked-size, 2026-10-21)
};
export interface WeightFile { file: string; folder: string; sizeBytes: number | null; sizeGB: number | null; sizeApprox: boolean; sizeSource: 'manifest' | 'huggingface-api' | null;
  url: string; source: 'huggingface' | 'civitai' | 'other'; pageUrl: string | null;
  /** A LoRA's base model family ('z-image-turbo', 'qwen-image', …; a list when one LoRA serves two bases), from the manifest (build-manifest.py add_bases). A LoRA runs wherever its base runs. */ base?: string | string[] | null }
type Row = { file: string; folder: string; size?: number | null; url: string; hf_repo?: string | null; civitai_version?: number | null; page_url?: string | null; workflows?: string[]; base?: string | string[] | null };
let rows: Row[] | null = null;
const load = (): Row[] => { if (rows) return rows; try { rows = JSON.parse(readFileSync(MANIFEST, 'utf8')).models ?? []; } catch { rows = []; } return rows!; };
/** 'workflows/soul-zit-api.json (preset LoRA)' (a look LoRA its graph may load) → a matcher on the bare workflow file name ('*' globs still work). */
const matcher = (w: string) => { const f = w.replace(/\s*\(.*\)\s*$/, '').replace(/^workflows\//, '').trim(); const re = new RegExp(`^${f.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`); return (x: string) => re.test(x); };
const toFile = (r: Row): WeightFile => {
  const exact = r.size ?? HF_SIZES[r.file] ?? null;
  const source = /huggingface\.co/.test(r.url) ? 'huggingface' : /civitai\.com/.test(r.url) ? 'civitai' : 'other';
  return { file: r.file, folder: r.folder, sizeBytes: exact, sizeGB: exact == null ? null : Math.round(exact / 1e7) / 100, sizeApprox: false, sizeSource: r.size ? 'manifest' : HF_SIZES[r.file] ? 'huggingface-api' : null,
    url: r.url, source, pageUrl: source === 'huggingface' && r.hf_repo ? `https://huggingface.co/${r.hf_repo}` : source === 'civitai' && r.civitai_version ? `https://civitai.com/api/v1/model-versions/${r.civitai_version}` : r.page_url ?? null, ...(r.base !== undefined ? { base: r.base } : {}) }; // page_url: a model installed by hand (a folder, no single-file url): where to get it
};
/** Weight files loaded by any of these workflow files (bare names, e.g. camera-ltx-api.json). [] for cloud models (no local workflows). */
export function weightsForWorkflows(workflows: string[]): WeightFile[] {
  if (!workflows.length) return [];
  const names = workflows.map((w) => w.replace(/^workflows\//, ''));
  const seen = new Set<string>(); const out: WeightFile[] = [];
  for (const r of load()) { const ms = (r.workflows ?? []).map(matcher); if (!names.some((n) => ms.some((m) => m(n)))) continue; const k = `${r.folder}/${r.file}`; if (seen.has(k)) continue; seen.add(k); out.push(toFile(r)); }
  return out;
}
export const manifestTotal = () => load().length;
