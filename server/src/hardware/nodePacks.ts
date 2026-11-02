/**
 * Windows setup PR 1 (2026-11-02): the ComfyUI add-ons (custom node packs) the app's workflows use, and which of them the running ComfyUI
 * is missing, for Settings → Your computer → ComfyUI add-ons (GET /api/local/nodes). The packs, their source and licence come from
 * readiness/manifest/custom-nodes.json; "missing" = a class of the pack that ComfyUI's /object_info doesn't list (comfyNodes.ts).
 * Read only: nothing is installed from here (ComfyUI Manager does that).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { comfyNodes } from '../comfyNodes.js';

const MANIFEST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../readiness/manifest/custom-nodes.json');
export interface NodePack { name: string; repo: string | null; dir: string | null; license: string | null; optional: boolean; note: string | null; classes: string[] }
export interface NodePackState extends NodePack { /** null = ComfyUI's node list isn't known */ installed: boolean | null; missing: string[] }
let packs: NodePack[] | null = null;
/** The non-core packs of the manifest (read once). */
export function nodePacks(): NodePack[] {
  if (packs) return packs;
  try { const j = JSON.parse(readFileSync(MANIFEST, 'utf8')); packs = Object.entries<any>(j?.packs ?? {}).filter(([, p]) => p?.dir).map(([name, p]) => ({ name, repo: typeof p.repo === 'string' ? p.repo : null, dir: String(p.dir),
    license: typeof p.license === 'string' ? p.license : null, optional: !!p.optional, note: typeof p.note === 'string' ? p.note : null, classes: Array.isArray(p.classes) ? p.classes.map(String) : [] })); }
  catch { packs = []; }
  return packs;
}
/** Each pack with what this ComfyUI lacks (have = its node classes; null = unknown). Missing packs first. */
export function nodePackStates(have: Set<string> | null = comfyNodes()): NodePackState[] {
  return nodePacks().map((p) => { const missing = have ? p.classes.filter((c) => !have.has(c)) : [];
    return { ...p, installed: have ? missing.length === 0 : null, missing }; }).sort((a, b) => Number(a.installed !== false) - Number(b.installed !== false));
}
/** The pack a node class belongs to (null = core or not in the manifest). */
export const packOfClass = (cls: string): NodePack | null => nodePacks().find((p) => p.classes.includes(cls)) ?? null;
