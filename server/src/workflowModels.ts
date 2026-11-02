/**
 * Add a workflow, step 2 (2026-11-01): the model files a workflow you added needs, whether your ComfyUI has them, and where to get the missing ones.
 *  1. neededFiles(graph): every model-loading input (requirements.ts ROLE / LOADER_FOLDERS: checkpoints, diffusion models, LoRAs, VAEs, text encoders,
 *     the GGUF loaders) → { file, folder }, one row per file however many nodes load it.
 *  2. workflowNeeds(tool): have / missing / unknown per file. Your ComfyUI's GET /object_info lists each loader's files (comfyNodes.ts, kept 60 s);
 *     a file in the models folder (OPENHIGGSFIELD_COMFY_MODELS_DIR) counts too. ComfyUI not running and no models folder = unknown: nothing is blocked.
 *  3. Links: a file the app's model list knows (readiness/manifest/models.json, via modelWeights.ts) gets its link, size and page from there; any other
 *     file takes a Hugging Face or Civitai file link you paste (checkModelLink), saved in the workflow's own folder (models.json), never the repo's list.
 *  4. Download: POST /api/local/downloads { downloadId: 'workflow:<id>' } (hardware/downloads.ts planFiles → workflowDownloadRows): the same disk check,
 *     resume, checksum, tokens and models-folder rule as every model download; files land in <models folder>/<folder>/<file>, never outside it.
 *  5. Generate: workflowGate() is the weights gate for these workflows (requirements.ts weightsGate): files known to be missing → 409 weights_missing
 *     naming them, like the built-in models (enforced on real runs; OPENHIGGSFIELD_ENFORCE_WEIGHTS=1 in mock). As with the built-ins, "Download with
 *     this run" (downloadWeights=1) passes when every missing file has a link and a models folder is set: the job downloads first (hardware/stages.ts).
 * Routes: routesWorkflowImport.ts. Test: server/test/added-workflow-models.test.ts.
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MODEL_FILE_RE, modelInputFolder, modelsDir, modelFileBytes } from './hardware/requirements.js';
import { weightFileOf } from './modelWeights.js';
import { comfyLoaderOptions, comfyLoaderOptionsNow, localComfySet } from './comfyNodes.js';
import { pluginSpec } from './pluginGraph.js';

type Graph = Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;
/** One file a graph loads; `loaders` = the class/input pairs that read it (to look it up in /object_info). */
export interface NeededFile { file: string; folder: string; nodes: string[]; loaders: { classType: string; input: string }[] }

const FOLDER_RE = /^[a-z0-9_]{1,40}$/i;
/** A file name the app may write: relative, '/'-separated, no '..', '.' or empty parts, no drive letters or odd characters. Subfolders are fine ("wan/foo.safetensors"). */
export const safeModelPath = (folder: string, file: string) => FOLDER_RE.test(folder) && file.length <= 255 && !/[\0:*?"<>|]/.test(file) && !file.startsWith('/')
  && file.split('/').every((p) => p !== '' && p !== '.' && p !== '..' && p.trim() === p) && MODEL_FILE_RE.test(file);

/** Graph → the model files it loads (string values of model-loading inputs that name a weight file). */
export function neededFiles(graph: Graph): NeededFile[] {
  const out = new Map<string, NeededFile>();
  const ids = Object.keys(graph ?? {}).sort((a, b) => (Number(a) - Number(b)) || a.localeCompare(b));
  for (const id of ids) { const n = graph[id]; const cls = String(n?.class_type ?? '');
    for (const [input, v] of Object.entries(n?.inputs ?? {})) {
      if (typeof v !== 'string') continue; const folder = modelInputFolder(cls, input); if (!folder) continue;
      const file = v.replace(/\\/g, '/').trim(); if (!MODEL_FILE_RE.test(file)) continue;
      const k = `${folder}/${file}`; const row = out.get(k) ?? { file, folder, nodes: [], loaders: [] };
      if (!row.nodes.includes(id)) row.nodes.push(id); if (!row.loaders.some((l) => l.classType === cls && l.input === input)) row.loaders.push({ classType: cls, input });
      out.set(k, row); } }
  return [...out.values()];
}

// ---- links ----

/** Saved links: <workflow folder>/models.json { files: { "<folder>/<file>": { url } } }. */
type Saved = { files: Record<string, { url: string }> };
const savedPath = (dir: string) => path.join(dir, 'models.json');
export function savedLinks(dir: string | null | undefined): Saved {
  if (!dir) return { files: {} };
  try { const j = JSON.parse(readFileSync(savedPath(dir), 'utf8')); const files: Saved['files'] = {};
    for (const [k, v] of Object.entries<any>(j?.files ?? {})) { const c = typeof v?.url === 'string' ? checkModelLink(v.url) : null; if (c && 'url' in c) files[k] = { url: c.url }; } return { files }; }
  catch { return { files: {} }; }
}
export const LINK_HELP = 'Paste a file link from huggingface.co (…/resolve/main/file.safetensors) or civitai.com (…/api/download/models/123456).';
/** A pasted link → the download address, or a plain error. Only https huggingface.co / civitai.com file links; a /blob/ page becomes /resolve/,
 *  a Civitai model page with ?modelVersionId becomes its download link, and a token in the link is dropped (tokens live in Settings → Connections). */
export function checkModelLink(raw: string): { url: string } | { error: string } {
  const s = String(raw ?? '').trim(); if (!s) return { error: LINK_HELP };
  let u: URL; try { u = new URL(s); } catch { return { error: `That isn’t a link. ${LINK_HELP}` }; }
  if (u.protocol !== 'https:') return { error: `The link must start with https://. ${LINK_HELP}` };
  if (u.username || u.password || u.port) return { error: `That link can’t be used. ${LINK_HELP}` };
  const host = u.hostname.toLowerCase().replace(/^www\./, ''); const parts = u.pathname.split('/').filter(Boolean);
  for (const k of [...u.searchParams.keys()]) if (/token|key|auth/i.test(k)) u.searchParams.delete(k);
  if (host === 'huggingface.co') {
    const i = parts.findIndex((p) => p === 'resolve' || p === 'blob'); // /<org>/<repo>/resolve/<rev>/<path…>  (datasets/<org>/<repo>/… too)
    if (i < 2 || parts.length < i + 3 || parts.slice(0, i).some((p) => p === '..')) return { error: `That Hugging Face link isn’t a file. ${LINK_HELP}` };
    parts[i] = 'resolve'; u.pathname = `/${parts.join('/')}`; u.hostname = 'huggingface.co'; u.hash = '';
    return { url: u.href.slice(0, 1000) };
  }
  if (host === 'civitai.com') {
    if (parts[0] === 'api' && parts[1] === 'download' && parts[2] === 'models' && /^\d+$/.test(parts[3] ?? '') && parts.length === 4) { u.hostname = 'civitai.com'; u.hash = ''; return { url: u.href.slice(0, 1000) }; }
    const v = u.searchParams.get('modelVersionId'); if (parts[0] === 'models' && v && /^\d+$/.test(v)) return { url: `https://civitai.com/api/download/models/${v}` };
    return { error: `That Civitai link isn’t a file. Open the model, pick the version, then copy its download link. ${LINK_HELP}` };
  }
  return { error: `Only Hugging Face and Civitai links work here. ${LINK_HELP}` };
}

// ---- have / missing ----

export type FileState = 'have' | 'missing' | 'unknown';
export interface NeedRow { file: string; folder: string; nodes: string[]; state: FileState; url: string | null; bytes: number | null; pageUrl: string | null;
  /** where the link came from: the app's model list, or one you pasted */ linkFrom: 'list' | 'yours' | null; /** the loader isn't in your ComfyUI (a custom node) */ nodeMissing?: boolean; badPath?: boolean }
export interface NeedsView { id: string; comfy: 'ok' | 'off' | 'not_set'; modelsDirSet: boolean; files: NeedRow[]; missing: number; unknown: number; downloadId: string }
type ToolLike = { id: string; plugin?: { dir?: string; user?: boolean } | null };

/** The app's model list row for a file (exact name, else the same name without its subfolder in the same folder). */
const known = (folder: string, file: string) => { const w = weightFileOf(file); if (w || !file.includes('/')) return w; const b = weightFileOf(file.split('/').pop()!); return b && b.folder === folder ? b : null; };

/** Have / missing per file. `opts` = your ComfyUI's loader lists (null = not running / not set). */
export function needsOf(tool: ToolLike, opts: ReturnType<typeof comfyLoaderOptionsNow>): NeedsView {
  const spec = pluginSpec(tool.id); return graphNeeds(tool.id, spec ? spec.graph : {}, opts, savedLinks(tool.plugin?.dir));
}
/** The same have / missing view for a graph that isn't saved yet (Add a workflow's summary checks the models up front, before you add it). */
export function graphNeeds(id: string, graph: Graph, opts: ReturnType<typeof comfyLoaderOptionsNow>, links: Saved = { files: {} }): NeedsView {
  const files = neededFiles(graph); const dir = modelsDir();
  const rows: NeedRow[] = files.map((f) => {
    const bad = !safeModelPath(f.folder, f.file);
    const lists = opts ? f.loaders.map((l) => opts.options[l.classType]?.[l.input]).filter((x): x is string[] => Array.isArray(x)) : [];
    const listed = lists.some((l) => l.includes(f.file)); const onDisk = !!dir && !bad && modelFileBytes(dir, f.folder, f.file) != null;
    const nodeMissing = !!opts && opts.nodes.size > 0 && !f.loaders.some((l) => opts.nodes.has(l.classType));
    const state: FileState = listed || onDisk ? 'have' : (opts && lists.length) || dir ? 'missing' : 'unknown';
    const w = known(f.folder, f.file); const mine = links.files[`${f.folder}/${f.file}`]?.url ?? null;
    return { file: f.file, folder: f.folder, nodes: f.nodes, state, url: w?.url || mine || null, bytes: w?.url ? w.sizeBytes : null, pageUrl: w?.url ? w.pageUrl : null, linkFrom: w?.url ? 'list' : mine ? 'yours' : null,
      ...(nodeMissing ? { nodeMissing: true } : {}), ...(bad ? { badPath: true } : {}) };
  });
  return { id, comfy: opts ? 'ok' : localComfySet() ? 'off' : 'not_set', modelsDirSet: !!dir, files: rows, missing: rows.filter((r) => r.state === 'missing').length, unknown: rows.filter((r) => r.state === 'unknown').length, downloadId: `workflow:${id}` };
}
/** The page's view: asks ComfyUI (waits up to 3 s for a fresh list). */
export const workflowNeeds = async (tool: ToolLike) => needsOf(tool, await comfyLoaderOptions());

/** Save a pasted link for one file the workflow needs, in its own folder. */
export function saveModelLink(tool: ToolLike, folder: string, file: string, raw: string): { ok: true; url: string } | { ok: false; code: 400 | 403 | 404; error: string } {
  const dir = tool.plugin?.dir; if (!dir || !tool.plugin?.user) return { ok: false, code: 403, error: 'Links can be saved only for workflows you added.' };
  const spec = pluginSpec(tool.id); if (!spec || !neededFiles(spec.graph).some((f) => f.folder === folder && f.file === file)) return { ok: false, code: 404, error: 'This workflow doesn’t load that file.' };
  if (!safeModelPath(folder, file)) return { ok: false, code: 400, error: 'This file name can’t be saved to your models folder.' };
  const c = checkModelLink(raw); if ('error' in c) return { ok: false, code: 400, error: c.error };
  const s = savedLinks(dir); s.files[`${folder}/${file}`] = { url: c.url };
  const tmp = `${savedPath(dir)}.tmp`; writeFileSync(tmp, JSON.stringify({ schema: 1, files: s.files }, null, 2) + '\n'); renameSync(tmp, savedPath(dir));
  return { ok: true, url: c.url };
}

/** The download rows for 'workflow:<id>' (hardware/downloads.ts planFiles): every file not known to be here, with its link (null = none yet). */
export function workflowDownloadRows(tool: ToolLike): { file: string; folder: string; url: string | null; bytes: number | null }[] {
  return needsOf(tool, comfyLoaderOptionsNow()).files.filter((r) => r.state !== 'have' && !r.badPath).map((r) => ({ file: r.file, folder: r.folder, url: r.url, bytes: r.bytes }));
}

/** "0.4 GB", or "0.4 GB + 2 files of unknown size" when some links don't say their size (a pasted link). */
export const sizeWords = (bytes: number, unknown: number) => { const g = bytes / 1e9; const t = `${g >= 10 ? Math.round(g) : Math.max(0.1, Math.round(g * 10) / 10)} GB`;
  return unknown ? (bytes ? `${t} + ${unknown} file${unknown > 1 ? 's' : ''} of unknown size` : `${unknown} file${unknown > 1 ? 's' : ''} of unknown size`) : t; };
/** The weights gate for a workflow you added (requirements.ts weightsGate). null = nothing known to be missing. */
export function workflowGate(tool: ToolLike, freeBytes: number | null, /** the run asked to download first (downloadWeights=1, the built-in "Download with this run") */ wantsDl = false) {
  if (!tool.plugin?.user) return null;
  const v = needsOf(tool, comfyLoaderOptionsNow()); const miss = v.files.filter((r) => r.state === 'missing'); if (!miss.length) return null;
  const need = miss.reduce((a, f) => a + (f.bytes ?? 0), 0); const names = miss.map((f) => f.file); const unknownSizes = miss.filter((f) => f.bytes == null).length;
  const list = `${names.slice(0, 4).join(', ')}${names.length > 4 ? ` and ${names.length - 4} more` : ''}`;
  const base = { missingBytes: need, missingFiles: miss.map((f) => ({ file: f.file, folder: f.folder, bytes: f.bytes, url: f.url ?? '', autoDownloaded: false })), diskFreeBytes: freeBytes,
    downloadable: miss.every((f) => !!f.url), downloadEndpoint: '/api/local/downloads', downloadId: v.downloadId, unknownSizes, needsLinks: miss.filter((f) => !f.url).length };
  const gbs = (b: number) => (Math.round(b / 1e8) / 10).toString();
  if (freeBytes != null && need > freeBytes * 0.95) return { ...base, code: 'not_enough_disk' as const, message: `This workflow's files need ${sizeWords(need, unknownSizes)}; ${gbs(freeBytes)} GB of disk space is free. Free up space first.` };
  if (wantsDl && base.downloadable && modelsDir()) return null; // every file has a link: the run downloads them first (hardware/stages.ts prePhase)
  return { ...base, code: 'weights_missing' as const, message: `${miss.length === 1 ? 'A model file isn’t' : `${miss.length} model files aren’t`} in your ComfyUI yet. Get ${miss.length === 1 ? 'it' : 'them'} under Needs on this page: ${list}.` };
}
