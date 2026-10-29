/**
 * Toolsets (like GitHub's MCP server): the server is small on the outside. `core` is eleven catalogue-driven tools plus four read-only library searches (recipes, your media) that reach every studio
 * feature (new tools, models and workflows appear through search_capabilities / describe with no new MCP tool); the rest is opt-in.
 *   OPENHIGGSFIELD_MCP_TOOLSETS=core            (default for stdio; the --http bridge defaults to core,canvas)
 *   OPENHIGGSFIELD_MCP_TOOLSETS=core,canvas     add the canvas bridge
 *   OPENHIGGSFIELD_MCP_TOOLSETS=all             everything, including the older per-feature tools (legacy)
 * Or `"toolsets": ["core", "library"]` in the permissions file. Unknown names are an error at start.
 */
export const TOOLSETS: Record<string, string[]> = {
  core: ['search_capabilities', 'describe', 'quote', 'run', 'status', 'get_outputs', 'cancel', 'upload', 'history', 'recipe', 'budget',
    /* the library databases (2026-10-27): recipes and your media, read only */ 'search_workflows', 'get_workflow_recipe', 'search_references', 'get_reference'],
  library: ['retry', 'list_workflows', 'next_actions', 'stitch_video', 'direct_a_shot_prep'],
  admin: ['server_status', 'get_spend'],
  canvas: ['canvas_list_boards', 'canvas_create_board', 'canvas_rename_board', 'canvas_switch_board', 'canvas_open_board', 'canvas_read_board', 'canvas_list_workflows', 'canvas_add_card', 'canvas_add_from_job', 'canvas_update_card', 'canvas_connect', 'canvas_next_steps', 'canvas_batch', 'canvas_review', 'canvas_wait_for_message', 'canvas_remove_card', 'canvas_propose_run', 'canvas_proposal_status', 'canvas_say', 'canvas_inbox', 'canvas_add_note', 'canvas_add_frame', 'canvas_move_into', 'canvas_point_at', 'canvas_ask_pick'],
  // The per-feature tools from before the catalogue-driven core (kept so existing agents keep working; each maps onto core: see mcp/README.md).
  legacy: ['list_tools', 'list_models', 'generate_image', 'generate_soul', 'generate_video', 'generate_audio', 'create_story', 'story_status', 'retry_story', 'object_swap', 'motion_transfer', 'restyle',
    'upload_media', 'quote_cost', 'preflight', 'set_budget', 'get_budget', 'plan_budget', 'get_receipt', 'get_job', 'wait_for_job', 'job_status', 'get_asset'],
};
export const DEFAULT_TOOLSETS = ['core'];
/** The app's own HTTP bridge (`--http`, what `npm run dev` starts on :8788 and what the Canvas "Connect your agent" sheet points at) also
 *  turns on `canvas` by default (2026-10-28): without it a connected agent showed as "connected" but had no board tools at all. */
export const HTTP_DEFAULT_TOOLSETS = ['core', 'canvas'];
export const toolsetOf = (tool: string) => Object.entries(TOOLSETS).find(([, names]) => names.includes(tool))?.[0] ?? null;

/** Enabled toolsets from env (OPENHIGGSFIELD_MCP_TOOLSETS) or the permissions file's "toolsets", else core. */
export function enabledToolsets(env = process.env, fromFile?: string[] | null, http = false): Set<string> {
  const def = http ? HTTP_DEFAULT_TOOLSETS : DEFAULT_TOOLSETS;
  const raw = env.OPENHIGGSFIELD_MCP_TOOLSETS?.trim() ? env.OPENHIGGSFIELD_MCP_TOOLSETS.split(',') : fromFile ?? def;
  const names = raw.map((x) => x.trim()).filter(Boolean);
  if (names.includes('all')) return new Set(Object.keys(TOOLSETS));
  const unknown = names.filter((n) => !TOOLSETS[n]); if (unknown.length) throw new Error(`Unknown MCP toolset(s): ${unknown.join(', ')}. Pick from ${Object.keys(TOOLSETS).join(', ')} or all.`);
  return new Set(names.length ? names : def);
}

/** Wrap registerTool so only tools of enabled toolsets are registered (a tool in no toolset is always registered). Run after gateTools.
 *  Every handler is also kept in the returned map (registered or not), so a core tool can reuse a legacy tool's code (budget → set_budget …). */
export function filterToolsets(s: any, enabled: Set<string>) {
  const orig = s.registerTool.bind(s); const handlers = new Map<string, (args: any, extra?: any) => any>();
  s.registerTool = (name: string, meta: any, handler: (...a: any[]) => any) => { handlers.set(name, handler); const set = toolsetOf(name); if (set && !enabled.has(set)) return undefined; return orig(name, meta, handler); };
  return handlers;
}
