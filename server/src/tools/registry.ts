/**
 * The tool registry behind ctx.tools (services/tools.ts). Nothing registers here at import time (plan R3): a booted server's tools come from
 * its plugins (the studios in plugins-builtin/studios.ts, the workflow folders in plugins-builtin/workflow-folders.ts), each undone when its
 * plugin is disposed. Code that runs without booting (scripts, tests) gets the built-in tools (tools/builtin.ts, the desktop profile's set)
 * on its first read, as before.
 *
 * Nav order (GET /api/tools, menus) is each tool's explicit `order`, then the order tools were registered in; never import order.
 */
import type { ToolDef } from './types.js';
import { invalidateTools } from '../toolsCache.js';
import { withClipTrim } from '../clipTrim.js';
import { STUDIO_TOOLS, STUDIO_IDS, galleryEntries, BUILTIN_TOOL_STUDIO, SOON, type ToolEntry } from './builtin.js';

/** A workflow folder's tool (plugins/, <data>/plugins) lists after every built-in, in the order the folders load. */
export const FOLDER_ORDER = 10_000;

interface Entry { tool: ToolDef; order: number; seq: number }
const tools = new Map<string, Entry>();
const aliases = new Map<string, string>();
let seq = 0; let sorted: ToolDef[] | null = null;
/** true once boot.ts mounted the tools service: from then on only plugins add tools. */
export const toolRegistry = { managed: false };
/** The tools service takes over (services/tools.ts): whatever the no-boot fallback (or a direct load) registered before goes, so the
 *  profile's plugins decide which tools exist (a test that read the registry before booting gets only its profile's tools). */
export function manageTools() { toolRegistry.managed = true; if (!tools.size) return; tools.clear(); aliases.clear(); sorted = null; invalidateTools(); }
let filled = false;
/** Without a boot: the built-in tools, on the first read (a booted server never does this). */
function ensure() {
  if (toolRegistry.managed || filled) return; filled = true;
  for (const s of STUDIO_IDS) for (const e of STUDIO_TOOLS[s]) add(e);
  for (const e of galleryEntries((id) => tools.get(id)?.tool)) add(e); // after every base tool (Upscale is the gallery's own)
}
const add = (e: ToolEntry) => registerTool(e.tool, { order: e.order, aliases: e.aliases });

export function registerTool(t: ToolDef, o: { order?: number; aliases?: string[] } = {}) {
  ensure();
  if (tools.has(t.id)) throw new Error(`duplicate tool id ${t.id}`);
  withClipTrim(t); // every tool with a clip takes the shared range (trimStart / trimEnd: the Trim sheet)
  tools.set(t.id, { tool: t, order: o.order ?? FOLDER_ORDER, seq: seq++ });
  (o.aliases ?? []).forEach((a) => aliases.set(a, t.id));
  sorted = null; invalidateTools(); // a plugin tool added after start shows in GET /api/tools at once
}
/** Takes a tool out again (its plugin was disposed: a workflow you removed, a studio turned off). */
export function unregisterTool(id: string) {
  if (!tools.delete(id)) return false;
  for (const [a, t] of [...aliases]) if (t === id) aliases.delete(a);
  hidden.delete(id); sorted = null; invalidateTools(); return true;
}
/** Disabled plugin tools (POST /api/workflow-folders/:id {enabled:false}): hidden from lookups and lists without a restart. */
const hidden = new Set<string>();
export const setToolHidden = (id: string, on: boolean) => { if (on) hidden.add(id); else hidden.delete(id); sorted = null; };
/** Hidden (turned off on the Plugins page), or a built-in tool whose studio plugin is off in this profile. */
export const isToolHidden = (id: string) => hidden.has(id) || toolOff(id);
/** A built-in tool (or alias) whose studio plugin isn't loaded (only on a booted server; without a boot every studio is on). */
export const toolOff = (id: string) => toolRegistry.managed && BUILTIN_TOOL_STUDIO.has(id) && !tools.has(aliases.get(id) ?? id);
/** The studio plugin a built-in tool belongs to (for "turned off" details), or null. */
export const studioOf = (id: string) => BUILTIN_TOOL_STUDIO.get(id) ?? null;
/** A tool by id or alias, hidden ones included (the gallery wraps its base tool with this). */
export const findTool = (id: string) => { ensure(); return (tools.get(id) ?? tools.get(aliases.get(id) ?? ''))?.tool; };
export const getTool = (id: string) => { const t = findTool(id); return t && !hidden.has(t.id) ? t : undefined; };
/** True when a tool (or an alias) already has this id, hidden ones included: a new workflow may never take it. */
export const toolIdTaken = (id: string) => { ensure(); return tools.has(id) || aliases.has(id); };
export const listTools = (): ToolDef[] => {
  ensure();
  sorted ??= [...tools.values()].sort((a, b) => a.order - b.order || a.seq - b.seq).map((e) => e.tool).filter((t) => !hidden.has(t.id));
  return [...sorted];
};
export const DEFAULT_TOOL_ID = 'object-swap';

/** Roadmap ("Soon") entries live here too, so the nav can't drift from the registry. Not runnable. */
export interface SoonEntry { id: string; name: string; group: string; category: string; status: 'soon' }
export const listSoon = (): SoonEntry[] => { ensure(); return SOON.filter(([id]) => !tools.has(id)).map(([id, name]) => ({ id, name, group: 'Soon', category: 'Soon', status: 'soon' })); };
