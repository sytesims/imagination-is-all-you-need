/**
 * Per-tool MCP permissions: allow | ask | block.
 * Sources (later wins): built-in defaults → JSON config file → env vars.
 *   File:  OPENHIGGSFIELD_MCP_PERMISSIONS=/path/permissions.json  (default: ./openhiggsfield-mcp.json if present, else mcp/permissions.json)
 *          { "default": "allow", "tools": { "generate_video": "ask", "restyle": "block" } }
 *   Env:   OPENHIGGSFIELD_MCP_DEFAULT=allow|ask|block
 *          OPENHIGGSFIELD_MCP_ALLOW=list_tools,job_status   OPENHIGGSFIELD_MCP_ASK=generate_video   OPENHIGGSFIELD_MCP_BLOCK=restyle   ("*" = all)
 * ask → MCP elicitation (form: approve yes/no) when the client advertises the `elicitation` capability; otherwise the call is refused with a clear message.
 * Tiers: READ_ONLY tools (discover, quote, history) are allowed by default. SPEND tools (runs that can cost money) follow "spend" when it is set
 *   (file `"spend": "ask"` or env OPENHIGGSFIELD_MCP_SPEND=ask), else default. For `run` an ask is price-aware: free runs (local, quote 0) go
 *   through, a paid one asks with the quoted price in the question. The server's agent budget (set with budget, or pinned by env) still caps every run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export type Perm = 'allow' | 'ask' | 'block';
const PERMS: Perm[] = ['allow', 'ask', 'block'];
const isPerm = (v: unknown): v is Perm => PERMS.includes(v as Perm);
/** Read-only tools never spend credits: allowed unless explicitly overridden. */
export const READ_ONLY = ['list_tools', 'list_models', 'job_status', 'get_asset', 'quote_cost', 'preflight', 'get_job', 'wait_for_job', 'get_budget', 'plan_budget', 'get_receipt', 'story_status',
  'search_capabilities', 'describe', 'quote', 'status', 'get_outputs', 'history', 'list_workflows', 'next_actions', 'direct_a_shot_prep', 'server_status', 'get_spend',
  'canvas_list_boards', 'canvas_open_board', 'canvas_read_board', 'canvas_list_workflows', 'canvas_proposal_status', 'canvas_inbox', 'canvas_wait_for_message',
  'search_workflows', 'get_workflow_recipe', 'search_references', 'get_reference'];

/** Canvas tools that change a board but never spend (canvas_add_card, canvas_add_from_job, canvas_update_card, canvas_connect, canvas_batch…): neither
 *  read-only nor spend, so they follow `default` (allow unless the file or env says otherwise). Listed so a check can tell them apart. */
export const BOARD_EDIT = ['canvas_create_board', 'canvas_rename_board', 'canvas_switch_board', 'canvas_add_card', 'canvas_add_from_job', 'canvas_update_card', 'canvas_connect', 'canvas_next_steps',
  'canvas_batch', 'canvas_review', 'canvas_remove_card', 'canvas_propose_run', 'canvas_say', 'canvas_add_note', 'canvas_add_frame', 'canvas_move_into', 'canvas_point_at', 'canvas_ask_pick'];
/** Tools that can spend money (start a run on a paid place). */
export const SPEND = ['run', 'retry', 'generate_image', 'generate_soul', 'generate_video', 'generate_audio', 'create_story', 'retry_story', 'object_swap', 'motion_transfer', 'restyle'];
/** Tools whose handler asks itself, after quoting, and only when the run costs money. */
const PRICE_AWARE = new Set(['run']);
export interface PermConfig { default: Perm; spend?: Perm; tools: Record<string, Perm>; source: string[]; toolsets?: string[] | null }
export function loadPermissions(env = process.env): PermConfig {
  const cfg: PermConfig = { default: 'allow', tools: Object.fromEntries(READ_ONLY.map((t) => [t, 'allow' as Perm])), source: ['defaults'] };
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = env.OPENHIGGSFIELD_MCP_PERMISSIONS ? [env.OPENHIGGSFIELD_MCP_PERMISSIONS] : [path.resolve('openhiggsfield-mcp.json'), path.resolve(here, '../permissions.json')];
  for (const f of candidates) {
    if (!fs.existsSync(f)) { if (env.OPENHIGGSFIELD_MCP_PERMISSIONS) throw new Error(`MCP permissions file not found: ${f}`); continue; }
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (j.default != null) { if (!isPerm(j.default)) throw new Error(`${f}: "default" must be allow|ask|block`); cfg.default = j.default; }
    if (j.spend != null) { if (!isPerm(j.spend)) throw new Error(`${f}: "spend" must be allow|ask|block`); cfg.spend = j.spend; }
    if (j.toolsets != null) { if (!Array.isArray(j.toolsets)) throw new Error(`${f}: "toolsets" must be a list, e.g. ["core","canvas"]`); cfg.toolsets = j.toolsets.map(String); }
    for (const [k, v] of Object.entries(j.tools ?? {})) { if (!isPerm(v)) throw new Error(`${f}: tools.${k} must be allow|ask|block`); cfg.tools[k] = v; }
    cfg.source.push(f); break;
  }
  if (isPerm(env.OPENHIGGSFIELD_MCP_DEFAULT)) { cfg.default = env.OPENHIGGSFIELD_MCP_DEFAULT; cfg.source.push('env:DEFAULT'); }
  if (isPerm(env.OPENHIGGSFIELD_MCP_SPEND)) { cfg.spend = env.OPENHIGGSFIELD_MCP_SPEND; cfg.source.push('env:SPEND'); }
  for (const p of PERMS) {
    const list = env[`OPENHIGGSFIELD_MCP_${p.toUpperCase()}`]; if (!list) continue;
    for (const t of list.split(',').map((x) => x.trim()).filter(Boolean)) { if (t === '*') { cfg.default = p; for (const k of Object.keys(cfg.tools)) cfg.tools[k] = p; } else cfg.tools[t] = p; }
    cfg.source.push(`env:${p.toUpperCase()}`);
  }
  return cfg;
}
export const permFor = (cfg: PermConfig, tool: string): Perm => cfg.tools[tool] ?? (cfg.spend && SPEND.includes(tool) ? cfg.spend : cfg.default);

const refuse = (text: string) => ({ isError: true, content: [{ type: 'text' as const, text }] });
/** Wrap McpServer.registerTool so every handler is gated by its permission. Must run before tools are registered. */
export function gateTools(s: any, cfg: PermConfig) {
  const orig = s.registerTool.bind(s);
  s.registerTool = (name: string, meta: any, handler: (...a: any[]) => any) => {
    const perm = permFor(cfg, name);
    const description = perm === 'allow' ? meta.description : `${meta.description} [permission: ${perm}${perm === 'ask' ? ' — the user is asked to approve each call' : ' — disabled by the server admin'}]`;
    return orig(name, { ...meta, description }, async (args: any, extra: any) => {
      if (perm === 'block') return refuse(`Tool "${name}" is blocked by the Imagination Is All You Need MCP permissions (${cfg.source.at(-1)}). Ask the user to set it to allow or ask (OPENHIGGSFIELD_MCP_ALLOW=${name} or the permissions file).`);
      if (perm === 'ask') {
        const caps = s.server.getClientCapabilities?.();
        const ask = async (message: string): Promise<string | null> => {
          if (!caps?.elicitation) return `Tool "${name}" needs the user's approval, but this MCP client doesn't support elicitation, so it can't ask. Ask the user to allow it (OPENHIGGSFIELD_MCP_ALLOW=${name} or "tools": {"${name}": "allow"} in the permissions file), or use a client with elicitation support.`;
          try {
            const r = await s.server.elicitInput({ message, requestedSchema: { type: 'object', properties: { approve: { type: 'boolean', title: 'Approve this call', default: false } }, required: ['approve'] } });
            return r.action === 'accept' && r.content?.approve === true ? null : `The user declined "${name}" (${r.action}). Nothing was run.`;
          } catch (e) { return `Couldn't ask the user to approve "${name}" (${(e as Error).message}). Nothing was run.`; }
        };
        // Price-aware tools quote first and call approve(price line) only for a paid run; free runs need no approval.
        if (PRICE_AWARE.has(name)) return handler(args, { ...extra, approve: async (what: string) => ask(`Allow Imagination Is All You Need to ${what}?\nArguments: ${JSON.stringify(args ?? {}).slice(0, 600)}`) });
        const no = await ask(`Allow Imagination Is All You Need to run "${name}"? This may spend credits.\nArguments: ${JSON.stringify(args ?? {}).slice(0, 600)}`);
        if (no) return refuse(no);
      }
      return handler(args, extra);
    });
  };
}
