/**
 * Node classes the connected local ComfyUI has (keys of GET /object_info), so a local route whose workflow needs custom nodes that
 * aren't installed (Chatterbox, F5-TTS, Depth Anything…) lists as not installed instead of failing in ComfyUI's prompt validation.
 * Read in the background and cached; null = not known yet (or Comfy Cloud / unreachable), and callers then don't block on a guess.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { pluginGraphOf } from './pluginGraph.js';
import { MODEL_FILE_RE, modelInputFolder } from './hardware/requirements.js';

const TTL_MS = 60_000;
const WF_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../workflows');
/** options: the files each model-loading input lists (its combo values), class → input → names. That is what ComfyUI has (workflowModels.ts). */
let known: { base: string; nodes: Set<string>; options: Record<string, Record<string, string[]>>; at: number } | null = null;
let inflight: Promise<void> | null = null;
let override: Set<string> | null | undefined;

const localBase = () => { const b = config.comfyBaseUrl.trim().replace(/\/+$/, ''); return !b || /cloud\.comfy\.org|\.run\.comfy\.app/i.test(b) ? null : b; };

/** Refresh the node list in the background (at most one request at a time). */
export function refreshComfyNodes(): Promise<void> {
  const base = localBase(); if (!base || inflight) return inflight ?? Promise.resolve();
  inflight = (async () => {
    try { const r = await fetch(`${base}/object_info`, { signal: AbortSignal.timeout(8000) }); if (r.ok) noteInfo(base, (await r.json()) as Record<string, any>); else reach = { base, ok: false, at: Date.now() }; }
    catch { reach = { base, ok: false, at: Date.now() }; /* unreachable: keep the last answer until it goes stale */ }
    finally { inflight = null; }
  })();
  return inflight;
}
/** Did the last look at ComfyUI get an answer? (null = never looked, or no local ComfyUI set) */
let reach: { base: string; ok: boolean; at: number } | null = null;
const noteInfo = (base: string, j: Record<string, any>) => { known = { base, nodes: new Set(Object.keys(j)), options: loaderOptionsOf(j), at: Date.now() }; reach = { base, ok: true, at: Date.now() }; };
/** Each model-loading input's file list in an /object_info answer: legacy combos ([[names], {…}]) and V3 ones (["COMFY_COMBO" | "COMBO", { options }]). */
export function loaderOptionsOf(info: Record<string, any>): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  for (const [cls, def] of Object.entries(info ?? {})) for (const sect of ['required', 'optional']) for (const [name, spec] of Object.entries<any>(def?.input?.[sect] ?? {})) {
    const t = Array.isArray(spec) ? spec[0] : null; const vals = Array.isArray(t) ? t : typeof t === 'string' && /COMBO/.test(t) && Array.isArray(spec[1]?.options) ? spec[1].options : null;
    if (!vals) continue; const names = vals.filter((v: unknown): v is string => typeof v === 'string').map((v: string) => v.replace(/\\/g, '/'));
    if (modelInputFolder(cls, name) == null && !names.some((v: string) => MODEL_FILE_RE.test(v))) continue;
    (out[cls] ??= {})[name] = names;
  }
  return out;
}

/** The installed node classes, or null when not known. Kicks a refresh when stale. */
export function comfyNodes(): Set<string> | null {
  if (override !== undefined) return override;
  const base = localBase(); if (!base) return null;
  if (!known || known.base !== base || Date.now() - known.at > TTL_MS) void refreshComfyNodes();
  return known && known.base === base && Date.now() - known.at < TTL_MS * 10 ? known.nodes : null;
}

/** Test hook: a fixed node list (null = unknown, undefined = back to the real ComfyUI). */
export const setComfyNodes = (n: Iterable<string> | null | undefined) => { override = n === undefined ? undefined : n === null ? null : new Set(n); };

let infoOverride: Record<string, Record<string, string[]>> | null | undefined;
/** Test hook: a fake /object_info (null = ComfyUI not running, undefined = back to the real one). Also sets the node list. */
export const setComfyObjectInfo = (info: Record<string, any> | null | undefined) => { infoOverride = info === undefined ? undefined : info === null ? null : loaderOptionsOf(info); setComfyNodes(info === undefined ? undefined : info === null ? null : Object.keys(info)); };
/**
 * The files your ComfyUI offers for each model-loading input (class → input → names), read from /object_info and kept 60 s.
 * comfyLoaderOptions() waits (up to 3 s) for a new read when the last one is stale, so a page that just opened gets a real answer.
 * null = no local ComfyUI set, or it didn't answer.
 */
export function comfyLoaderOptionsNow(): { options: Record<string, Record<string, string[]>>; nodes: Set<string> } | null {
  if (infoOverride !== undefined) return infoOverride ? { options: infoOverride, nodes: (override ?? new Set()) as Set<string> } : null;
  const base = localBase(); if (!base) return null;
  if (!known || known.base !== base || Date.now() - known.at > TTL_MS) void refreshComfyNodes();
  if (reach && reach.base === base && !reach.ok && (!known || reach.at > known.at)) return null; // it stopped answering
  return known && known.base === base && Date.now() - known.at < TTL_MS * 10 ? { options: known.options, nodes: known.nodes } : null;
}
export async function comfyLoaderOptions(): Promise<ReturnType<typeof comfyLoaderOptionsNow>> {
  const base = localBase(); if (infoOverride === undefined && base && (!known || known.base !== base || Date.now() - known.at > TTL_MS)) await Promise.race([refreshComfyNodes(), new Promise((r) => setTimeout(r, 3000))]);
  return comfyLoaderOptionsNow();
}
/** Is a local ComfyUI address set at all? (off vs not set, for the page's words) */
export const localComfySet = () => !!localBase();
/** A download landed: read the lists again next time. */
export const forgetComfyLoaderOptions = () => { if (known) known = { ...known, at: Date.now() - TTL_MS - 1 }; }; // stale (read again) but still used meanwhile

const wfCache = new Map<string, string[]>();
/** Node classes a workflow file uses. */
export function workflowNodeClasses(wf: string): string[] {
  let c = wfCache.get(wf);
  if (!c) { const pg = pluginGraphOf(wf); /* a workflow you added lives in the data folder, not next to workflows/ */
    if (pg) return [...new Set(Object.values(pg).map((n: any) => n?.class_type).filter((x): x is string => typeof x === 'string'))];
    try { const g = JSON.parse(readFileSync((/^plugins\//.test(wf) ? path.resolve(WF_DIR, '..', wf) : path.join(WF_DIR, wf.replace(/^workflows\//, ''))), 'utf8')) as Record<string, any>; c = [...new Set(Object.values(g).map((n) => n?.class_type).filter((x): x is string => typeof x === 'string'))]; } catch { c = []; } wfCache.set(wf, c); }
  return c;
}

/** Node classes these workflows need that the local ComfyUI doesn't have ([] when none, or when the node list isn't known). */
export function missingNodes(wfs: string[]): string[] {
  const have = comfyNodes(); if (!have) return [];
  return [...new Set(wfs.flatMap(workflowNodeClasses))].filter((n) => !have.has(n));
}

// read once at startup, so the first listing already knows
void refreshComfyNodes();

/** Your local ComfyUI's full node list (GET /object_info), or null when no local ComfyUI is set or it doesn't answer. Used to read a saved
 *  (editor-format) workflow someone adds (workflowImport.ts). Never Comfy Cloud. */
export async function localObjectInfo(timeoutMs = 6000): Promise<Record<string, any> | null> {
  const base = localBase(); if (!base) return null;
  try { const r = await fetch(`${base}/object_info`, { signal: AbortSignal.timeout(timeoutMs) }); if (!r.ok) return null; const j = await r.json(); if (j && typeof j === 'object') { noteInfo(base, j as Record<string, any>); return j as Record<string, any>; } } catch { reach = { base, ok: false, at: Date.now() }; /* not running */ }
  return null;
}
