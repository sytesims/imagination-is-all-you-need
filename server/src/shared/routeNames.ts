/**
 * Plain names for the ways one model runs at one place (2026-10-27, app-wide): when a place has two or more routes for a model (Comfy Cloud:
 * the maker's hosted service through Comfy, our open workflow on Comfy's GPUs, a Comfy partner node; your computer: two graphs), Run on lists
 * each one by what it IS, never by a hand-written per-model name. Generated from route data only: kind, comfyVariant, the route's
 * caps.methodLabel and the maker. Pure and isomorphic: the server puts the names on GET /api/tools models[].runsOn[].choices, the web shows
 * them in Run on and on the bar, MCP lists them.
 */
import { placeOf } from './modelIds.js';
export interface RouteNameIn {
  routeId: string; kind: string; comfyVariant?: 'workflow' | 'partner' | 'deployment' | null;
  /** The route's own method words (RouteDef caps.methodLabel: "fast draft", "prompt-directed"). */ methodLabel?: string | null;
  /** The route's label ("Comfy Router · prompt-directed", "Local ComfyUI · Wan 2.2 Animate 14B"). */ label?: string | null;
}
/** The words after the place: "open workflow", "MiniMax's service", "Comfy's node", "your deployment", "fast draft". */
export function routeWord(r: RouteNameIn, maker?: string | null): string {
  const m = (r.methodLabel ?? '').trim(); const who = maker ? `${maker}’s` : 'the maker’s';
  if (r.comfyVariant === 'deployment') return 'your deployment';
  if (r.comfyVariant === 'workflow') return m ? `open workflow, ${m}` : 'open workflow';
  if (r.kind === 'comfy-router') return m ? `${who} service, ${m}` : `${who} service`;
  if (r.comfyVariant === 'partner' || r.kind === 'comfy-cloud') return m ? `Comfy’s node, ${m}` : 'Comfy’s node';
  if (m) return m;
  // your computer and the key places: the label after its place words ("Local ComfyUI · fast draft" → "fast draft")
  const tail = String(r.label ?? '').split(' · ').slice(1).join(' · ').trim();
  if (tail) return tail.charAt(0).toLowerCase() + tail.slice(1);
  // a key place's endpoint ("luma/agent/ray/v3.2/reframe") in words: its last two parts, "v3.2 reframe"
  const parts = r.routeId.slice(r.routeId.indexOf(':') + 1).split('/').filter(Boolean); return (parts.length > 2 ? parts.slice(-2) : parts.slice(-1)).join(' ').replace(/[-_]+/g, ' ');
}
/** What makes it different, in one short line for the Run on row. */
export function routeWhy(r: RouteNameIn, maker?: string | null): string {
  if (r.comfyVariant === 'deployment') return 'Runs on your own Comfy deployment';
  if (r.comfyVariant === 'workflow') return 'An open workflow you can read, run on Comfy’s graphics cards';
  if (r.kind === 'comfy-router') return `${maker ?? 'The maker'} runs it on their own servers; billed through Comfy`;
  if (r.comfyVariant === 'partner' || r.kind === 'comfy-cloud') return `${maker ?? 'The maker'}’s model through a Comfy node`;
  return '';
}
/**
 * Names for every route of one model at one place, "Comfy Cloud · open workflow". Two routes that would read the same get their own route
 * words added, so no two choices share a name.
 */
export function routeChoiceNames(place: string, routes: RouteNameIn[], maker?: string | null): { routeId: string; word: string; name: string; why: string }[] {
  const ws = routes.map((r) => routeWord(r, maker)); const dup = (w: string) => ws.filter((x) => x === w).length > 1;
  /* each route under its own place words (Comfy Cloud / Comfy Router / Comfy deployment: shared placeOf), never "Comfy Cloud · Comfy Cloud" */
  return routes.map((r, i) => { const w = dup(ws[i]) ? `${ws[i]} (${r.routeId.slice(r.routeId.indexOf(':') + 1)})` : ws[i]; const pl = placeOf({ kind: r.kind, routeId: r.routeId, comfyVariant: r.comfyVariant ?? null })?.label ?? place; return { routeId: r.routeId, word: w, name: `${pl} · ${w}`, why: routeWhy(r, maker) }; });
}
