/**
 * Models the user imports into their Comfy Cloud model library (Creator plan: Model Library → Import from Hugging Face or Civitai), shared by every
 * Comfy Cloud route that needs one (H3 Character Swap, LTX-2.5 Layout to Render). An import from Hugging Face is named <owner>__<repo>__<file>.
 * The check is free and GET only, and runs before anything is uploaded or submitted:
 *  1) the Model Library search: GET /api/assets?include_tags=models,<tag>&name_contains=<stem> (an import has is_immutable:false) → its loader_path;
 *  2) else GET /api/object_info → the loader's choices (what job validation checks).
 * 'missing' only when a check answered and the file isn't there; 'unknown' when neither answered (the run goes on: Cloud validates at submit).
 */
import path from 'node:path';

export type ImportState = 'present' | 'missing' | 'unknown';
export interface ImportCheck { state: ImportState; loaderPath: string | null; via: string | null }

/** Is a model file in this account's Comfy Cloud library (the Model Library search only)? names = accepted base names. */
export async function findInAssets(get: (p: string) => Promise<Response>, tag: string, stem: string, names: Set<string>, file: string): Promise<{ answered: boolean; loaderPath: string | null }> {
  const hit = (s: unknown) => typeof s === 'string' && (s === file || names.has(path.posix.basename(s)));
  try {
    const r = await get(`/api/assets?include_tags=models,${tag}&name_contains=${encodeURIComponent(stem)}&limit=50`);
    if (!r.ok) return { answered: false, loaderPath: null };
    const j: any = await r.json().catch(() => null); const a = (j?.assets ?? []).find((x: any) => hit(x?.loader_path) || hit(x?.name) || hit(x?.file_path));
    return { answered: true, loaderPath: a ? String(a.loader_path || a.name || file) : null };
  } catch { return { answered: false, loaderPath: null }; }
}

/** Free check for one imported LoRA: the Model Library search (by `stem`), then LoraLoaderModelOnly's choices in /api/object_info.
 *  file = the expected loader name; aliases = other accepted base names (e.g. the plain Hugging Face file name). Exact names only. */
export async function checkImportedLora(get: (p: string) => Promise<Response>, o: { file: string; aliases?: string[]; stem: string }): Promise<ImportCheck> {
  const names = new Set([path.posix.basename(o.file), ...(o.aliases ?? [])]);
  const hit = (s: unknown) => typeof s === 'string' && (s === o.file || names.has(path.posix.basename(s)));
  const a = await findInAssets(get, 'loras', o.stem, names, o.file); let answered = a.answered;
  if (a.loaderPath) return { state: 'present', loaderPath: a.loaderPath, via: 'assets' };
  try {
    const r = await get('/api/object_info');
    if (r.ok) { const info: any = await r.json().catch(() => null); const spec = info?.LoraLoaderModelOnly?.input?.required?.lora_name;
      const list: string[] = Array.isArray(spec?.[0]) ? spec[0] : spec?.[0] === 'COMBO' ? spec?.[1]?.options ?? [] : [];
      if (list.length) { answered = true; const f = list.find(hit); if (f) return { state: 'present', loaderPath: f, via: 'object_info' }; } }
  } catch { /* unknown */ }
  return { state: answered ? 'missing' : 'unknown', loaderPath: null, via: null };
}

/** The one-line import instruction (a Hugging Face "blob" link becomes the "resolve" download link Comfy Cloud's Import takes). */
export const importTodo = (m: { hf: string; type: string; importAs: string }) =>
  `Comfy Cloud → Model Library → Import → paste ${m.hf.replace('/blob/', '/resolve/')} → type ${m.type}. It shows up as ${m.importAs}.`;

/** One-time setup (2026-10-27): the same numbered steps on the Settings card (Connections → One-time setup) and in a run's refusal, for every import.
 *  gated: the Hugging Face repo needs its licence accepted and a read token in Comfy Cloud first. */
export const importSteps = (m: { hf: string; type: string; importAs: string; gated?: { repo: string } }): string[] => [
  ...(m.gated ? [`Accept the licence on ${m.gated.repo} (approval is instant).`, 'In Comfy Cloud → Settings → Secrets, add a Hugging Face read token.'] : []),
  'Open Comfy Cloud → Model Library → Import.', `Paste ${m.hf.replace('/blob/', '/resolve/')}.`, `Pick type ${m.type} and wait for the import to finish. It shows up as ${m.importAs}.`];
/** The refusal when a run needs an import that isn't there (reasonCode cloud_import_missing): what, then the same steps as the Settings card. */
export const importMissing = (name: string, file: string, steps: string[]) =>
  `${name} needs ${file} in your Comfy Cloud model library (a one-time setup). ${steps.map((s, k) => `${k + 1}) ${s}`).join(' ')} Then press Generate again. Nothing was sent or charged`;

/** Free check for any model file a loader names (2026-10-27, MiniMax H3 Fast's checkpoint): the Model Library search (tag, stem), then the loader's
 *  choices in /api/object_info. Same answers as checkImportedLora: 'present' with the loader path, 'missing' when a check answered without it, else 'unknown'. */
export async function checkCloudModel(get: (p: string) => Promise<Response>, o: { loader: string; field: string; tag: string; file: string; aliases?: string[]; stem: string }): Promise<ImportCheck> {
  const names = new Set([path.posix.basename(o.file), ...(o.aliases ?? [])]);
  const hit = (s: unknown) => typeof s === 'string' && (s === o.file || names.has(path.posix.basename(s)));
  const a = await findInAssets(get, o.tag, o.stem, names, o.file); let answered = a.answered;
  if (a.loaderPath) return { state: 'present', loaderPath: a.loaderPath, via: 'assets' };
  try {
    const r = await get('/api/object_info');
    if (r.ok) { const info: any = await r.json().catch(() => null); const spec = info?.[o.loader]?.input?.required?.[o.field];
      const list: string[] = Array.isArray(spec?.[0]) ? spec[0] : spec?.[0] === 'COMBO' ? spec?.[1]?.options ?? [] : [];
      if (list.length) { answered = true; const f = list.find(hit); if (f) return { state: 'present', loaderPath: f, via: 'object_info' }; } }
  } catch { /* unknown */ }
  return { state: answered ? 'missing' : 'unknown', loaderPath: null, via: null };
}
