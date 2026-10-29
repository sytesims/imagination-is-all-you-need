/**
 * Tool annotations and structured outputs for every tool, in one place (wraps registerTool; run it last, so it is the outermost wrapper).
 *  - annotations: readOnlyHint (discovery, quotes, history), destructiveHint (cancel, canvas remove, unshare…), idempotentHint, openWorldHint
 *    (calls that can reach a paid provider). Clients can auto-allow reads and prompt on spend.
 *  - outputSchema + structuredContent for the core tools: the JSON reply is also returned as structuredContent so agents can chain steps.
 */
import { z } from 'zod';
import { READ_ONLY, SPEND } from './permissions.js';

const DESTRUCTIVE = new Set(['cancel', 'canvas_remove_card']);
const IDEMPOTENT = new Set(['upload', 'upload_media', 'recipe', 'budget', 'canvas_update_card', 'canvas_connect', 'canvas_rename_board', 'canvas_switch_board']);
/** Core tools whose reply is one JSON object: they also return it as structuredContent. */
const STRUCTURED = new Set(['search_capabilities', 'describe', 'quote', 'run', 'status', 'get_outputs', 'cancel', 'upload', 'history', 'recipe', 'budget', 'search_workflows', 'get_workflow_recipe', 'get_reference']);
const ANY_OBJECT = z.object({}).passthrough();

export function annotationsFor(name: string, title?: string) {
  const ro = READ_ONLY.includes(name);
  return { ...(title ? { title } : {}), readOnlyHint: ro, destructiveHint: DESTRUCTIVE.has(name), idempotentHint: ro || IDEMPOTENT.has(name), openWorldHint: SPEND.includes(name) || name === 'stitch_video' };
}
/** The first text block that is a JSON object (else {text}) → structuredContent. */
function structure(r: any) {
  if (!r || r.isError || r.structuredContent || !Array.isArray(r.content)) return r;
  for (const c of r.content) { if (c?.type !== 'text') continue; try { const o = JSON.parse(c.text); if (o && typeof o === 'object' && !Array.isArray(o)) return { ...r, structuredContent: o }; } catch { /* next */ } }
  const first = r.content.find((c: any) => c?.type === 'text'); return { ...r, structuredContent: { text: first?.text ?? '' } };
}
export function annotateTools(s: any) {
  const orig = s.registerTool.bind(s);
  s.registerTool = (name: string, meta: any, handler: (...a: any[]) => any) => {
    const m = { ...meta, annotations: { ...annotationsFor(name, meta.title), ...(meta.annotations ?? {}) }, ...(STRUCTURED.has(name) && !meta.outputSchema ? { outputSchema: ANY_OBJECT } : {}) };
    return orig(name, m, STRUCTURED.has(name) ? async (args: any, extra: any) => structure(await handler(args, extra)) : handler);
  };
}
