/**
 * B5: which node classes are API / partner nodes. A cloud-* provider counts as open weights only if
 * none of its graphs uses one. Source: `api_node: true` in the ComfyUI /object_info snapshot (readiness/stub/object_info.json, tracked),
 * plus a name rule for classes the snapshot doesn't know (ComfyCloud*, *ApiNode, *Api, partner prefixes).
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { WORKFLOWS_DIR } from './config.js';
const SNAPSHOT = path.resolve(WORKFLOWS_DIR, '../readiness/stub/object_info.json');
let known: { api: Set<string>; all: Set<string> } | null = null;
function snapshot() {
  if (known) return known;
  known = { api: new Set(), all: new Set() };
  try { if (existsSync(SNAPSHOT)) for (const [k, v] of Object.entries<any>(JSON.parse(readFileSync(SNAPSHOT, 'utf8')))) { known.all.add(k); if (v?.api_node) known.api.add(k); } } catch { /* no snapshot: name rule only */ }
  return known;
}
const NAME_RULE = /^ComfyCloud|ApiNode$|Api$|^(Minimax|Kling|Veo|Luma|Pika|Runway|Ideogram|Recraft|OpenAI|Gemini|Stability|Bfl|Flux(Pro|Kontext)|Moonvalley|Rodin|Tripo|ByteDance|Vidu|Wan(Text|Image)To.*Api)/;
export const isApiNode = (cls: string) => { const s = snapshot(); return s.api.has(cls) || (!s.all.has(cls) && NAME_RULE.test(cls)); };
const cache = new Map<string, string[]>();
/** API/partner node classes used by a workflow file (relative to workflows/). Unreadable file → ['<unreadable>'] (never counts as open). */
export function apiNodesIn(file: string): string[] {
  const hit = cache.get(file); if (hit) return hit;
  let out: string[];
  try { const g = JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8')); out = [...new Set(Object.values<any>(g).map((n) => n?.class_type).filter((c): c is string => typeof c === 'string' && isApiNode(c)))]; }
  catch { out = ['<unreadable>']; }
  cache.set(file, out); return out;
}
