/**
 * Setup step 4 (2026-10-26): which model files the connected local ComfyUI really has, from ComfyUI itself, so a Comfy Desktop user without
 * OPENHIGGSFIELD_COMFY_MODELS_DIR gets real "on disk / missing" answers instead of missingBytesSource 'assumed_all'.
 *  - GET /experiment/models/<folder> → [{name, pathIndex, size, …}] (every path ComfyUI searches: its own models folder plus Desktop's
 *    extra_model_paths YAML). Older ComfyUI: GET /models/<folder> → [names] (sizes unknown: a listed file counts as present).
 *  - Cached per folder for 60 s, refreshed in the background (at most one request per folder at a time, 2 s timeout). requirementsFor() is sync,
 *    so the first look at a folder only starts the read; until it lands the old rule applies (no models folder → assumed_all, nothing blocked).
 *  - GET /experiment/models (no folder) → where ComfyUI keeps each folder: the download target (hardware/modelsTarget.ts).
 *  - Never Comfy Cloud, never a write. An explicit models folder (OPENHIGGSFIELD_COMFY_MODELS_DIR) still wins (requirements.ts).
 */
import { config } from '../config.js';

const TTL_MS = 60_000; const KEEP_MS = 10 * 60_000;
/** files null = ComfyUI answered but has no such folder (a legacy alias such as clip / unet): remembered too, so it isn't asked again for 60 s. */
type Listing = { base: string; at: number; files: Map<string, number | null> | null };
const cache = new Map<string, Listing>(); const inflight = new Map<string, Promise<void>>(); let stamp = 0;
let fetchImpl: typeof fetch = (...a) => fetch(...a);
let disabled = false;
/** Test hooks: replace fetch (null = real) and clear the cache; turn the lookup off. */
export const setComfyModelsFetch = (f: typeof fetch | null) => { fetchImpl = f ?? ((...a) => fetch(...a)); cache.clear(); inflight.clear(); roots = null; stamp++; };
export const setComfyModelsEnabled = (on: boolean) => { disabled = !on; cache.clear(); roots = null; stamp++; };
/** ComfyUI on this machine or the LAN (never Comfy Cloud). */
export const localComfyBase = (): string | null => { const b = String(config.comfyBaseUrl ?? '').trim().replace(/\/+$/, ''); return !b || /cloud\.comfy\.org|\.run\.comfy\.app/i.test(b) ? null : b; };
/** ComfyUI folder aliases (same as requirements.ts): a file in either one loads. */
const ALIASES: Record<string, string[]> = { text_encoders: ['text_encoders', 'clip'], clip: ['clip', 'text_encoders'], diffusion_models: ['diffusion_models', 'unet'], unet: ['unet', 'diffusion_models'] };

export function refreshFolder(folder: string): Promise<void> {
  const base = localComfyBase(); if (!base || disabled) return Promise.resolve(); const key = `${base}|${folder}`; const run = inflight.get(key); if (run) return run;
  const p = (async () => {
    try { let files: Map<string, number | null> | null = null; let answered = false;
      const r = await fetchImpl(`${base}/experiment/models/${encodeURIComponent(folder)}`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) { answered = true; const j = await r.json().catch(() => null); if (Array.isArray(j)) files = new Map(j.filter((x: any) => x && typeof x.name === 'string').map((x: any) => [String(x.name).replace(/\\/g, '/'), Number.isFinite(Number(x.size)) ? Number(x.size) : null])); }
      else { await r.arrayBuffer().catch(() => undefined);
        const r2 = await fetchImpl(`${base}/models/${encodeURIComponent(folder)}`, { signal: AbortSignal.timeout(2000) });
        if (r2.ok || r2.status === 404) answered = true;
        if (r2.ok) { const j = await r2.json().catch(() => null); if (Array.isArray(j)) files = new Map(j.filter((x: any) => typeof x === 'string').map((x: string) => [x.replace(/\\/g, '/'), null])); } else await r2.arrayBuffer().catch(() => undefined); }
      if (files || answered) { cache.set(`${base}|${folder}`, { base, at: Date.now(), files }); stamp++; } }
    catch { /* unreachable: keep the last answer until it goes stale */ }
    finally { inflight.delete(key); }
  })();
  inflight.set(key, p); return p;
}
const fresh = (folder: string): Listing | null => { const base = localComfyBase(); if (!base || disabled) return null; const l = cache.get(`${base}|${folder}`);
  if (!l || Date.now() - l.at > TTL_MS) void refreshFolder(folder); return l && Date.now() - l.at < KEEP_MS ? l : null; };
/** Does ComfyUI list these folders (each, or one of its aliases)? Starts a read for the ones it doesn't know yet. */
export function comfyFoldersKnown(folders: string[]): boolean { let all = true; for (const f of new Set(folders)) { const ls = (ALIASES[f] ?? [f]).map(fresh); if (!ls.every(Boolean) || !(ls.some((l) => !!l?.files) || listsWork())) all = false; } return all; }
/** A folder ComfyUI doesn't have (404) counts as "known, empty" only once another folder listed fine, so an old ComfyUI without these endpoints never reads as "everything missing". */
const listsWork = () => { const b = localComfyBase(); for (const l of cache.values()) if (l.base === b && l.files) return true; return false; };
/** Bytes of a file as ComfyUI lists it (largest across the aliases); 0 when listed without a size (older ComfyUI); null when it isn't listed. */
export function comfyFileBytes(folder: string, file: string): number | null { let best: number | null = null; const name = file.replace(/\\/g, '/');
  for (const f of ALIASES[folder] ?? [folder]) { const l = fresh(f); if (!l?.files?.has(name)) continue; const b = l.files.get(name) ?? 0; if (best == null || b > best) best = b; } return best; }
/** Changes whenever a listing lands (part of the requirements cache key). */
export const comfyModelsStamp = () => stamp;
/** Read these folders now (tests, warm-up), and where ComfyUI keeps them. */
export const warmComfyModels = (folders: string[]) => Promise.all([...[...new Set(folders.flatMap((f) => ALIASES[f] ?? [f]))].map(refreshFolder), refreshModelRoots()]).then(() => undefined);

// ---- Windows setup PR 1: where ComfyUI itself keeps each model folder (GET /experiment/models → [{name, folders:[absolute paths]}]) ----
// The paths include Comfy Desktop's shared folders and extra_model_paths, default first: the folder ComfyUI downloads into. Cached 60 s like
// the lists above; only read for a ComfyUI on this computer (another computer's paths mean nothing here). null = not known (yet).
type Roots = { base: string; at: number; folders: Map<string, string[]> | null };
let roots: Roots | null = null; let rootsRun: { base: string; p: Promise<void> } | null = null;
export function refreshModelRoots(): Promise<void> {
  const base = localComfyBase(); if (!base || disabled) return Promise.resolve(); if (rootsRun?.base === base) return rootsRun.p; const run = { base, p: Promise.resolve() };
  run.p = (async () => {
    try { const r = await fetchImpl(`${base}/experiment/models`, { signal: AbortSignal.timeout(2000) }); let folders: Map<string, string[]> | null = null;
      if (r.ok) { const j = await r.json().catch(() => null); if (Array.isArray(j)) folders = new Map(j.filter((x: any) => x && typeof x.name === 'string' && Array.isArray(x.folders))
        .map((x: any) => [String(x.name), x.folders.filter((f: unknown): f is string => typeof f === 'string' && !!f.trim())])); }
      else await r.arrayBuffer().catch(() => undefined); // older ComfyUI (no such route): known, empty
      if (localComfyBase() === base) { roots = { base, at: Date.now(), folders }; stamp++; } }
    catch { /* not answering: keep the last answer until it goes stale */ }
    finally { if (rootsRun === run) rootsRun = null; }
  })();
  rootsRun = run; return run.p;
}
/** The folders ComfyUI reads for this model folder (aliases too: clip ⇄ text_encoders, unet ⇄ diffusion_models), default first. null = not known. */
export function comfyFolderPaths(folder: string): string[] | null {
  const base = localComfyBase(); if (!base || disabled) return null;
  if (!roots || roots.base !== base || Date.now() - roots.at > TTL_MS) void refreshModelRoots();
  if (!roots || roots.base !== base || Date.now() - roots.at > KEEP_MS || !roots.folders) return null;
  for (const f of ALIASES[folder] ?? [folder]) { const l = roots.folders.get(f); if (l?.length) return l; } return null;
}
