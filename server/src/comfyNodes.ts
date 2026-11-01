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

const TTL_MS = 60_000;
const WF_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../workflows');
let known: { base: string; nodes: Set<string>; at: number } | null = null;
let inflight: Promise<void> | null = null;
let override: Set<string> | null | undefined;

const localBase = () => { const b = config.comfyBaseUrl.trim().replace(/\/+$/, ''); return !b || /cloud\.comfy\.org|\.run\.comfy\.app/i.test(b) ? null : b; };

/** Refresh the node list in the background (at most one request at a time). */
export function refreshComfyNodes(): Promise<void> {
  const base = localBase(); if (!base || inflight) return inflight ?? Promise.resolve();
  inflight = (async () => {
    try { const r = await fetch(`${base}/object_info`, { signal: AbortSignal.timeout(8000) }); if (r.ok) known = { base, nodes: new Set(Object.keys((await r.json()) as Record<string, unknown>)), at: Date.now() }; }
    catch { /* unreachable: keep the last answer until it goes stale */ }
    finally { inflight = null; }
  })();
  return inflight;
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
  try { const r = await fetch(`${base}/object_info`, { signal: AbortSignal.timeout(timeoutMs) }); if (!r.ok) return null; const j = await r.json(); if (j && typeof j === 'object') { known = { base, nodes: new Set(Object.keys(j)), at: Date.now() }; return j as Record<string, any>; } } catch { /* not running */ }
  return null;
}
