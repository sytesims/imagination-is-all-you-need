/**
 * Per-tool MCP permissions: allow | ask | block.
 * Sources (later wins): built-in defaults → JSON config file → env vars.
 *   File:  OPENHIGGSFIELD_MCP_PERMISSIONS=/path/permissions.json  (default: ./openhiggsfield-mcp.json if present, else mcp/permissions.json)
 *          { "default": "allow", "tools": { "generate_video": "ask", "restyle": "block" } }
 *   Env:   OPENHIGGSFIELD_MCP_DEFAULT=allow|ask|block
 *          OPENHIGGSFIELD_MCP_ALLOW=list_tools,job_status   OPENHIGGSFIELD_MCP_ASK=generate_video   OPENHIGGSFIELD_MCP_BLOCK=restyle   ("*" = all)
 * ask → MCP elicitation (form: approve yes/no) when the client advertises the `elicitation` capability; otherwise the call is refused with a clear message.
 * Tiers: READ_ONLY tools (discover, quote, history) are allowed by default. SPEND tools (runs that can cost money) follow "spend", which is
 *   "ask" by default (file `"spend": "allow"` or env OPENHIGGSFIELD_MCP_SPEND=allow lets an agent spend without asking). For `run` and `retry` the spend tier
 *   is price-aware: free runs (local, quote 0, samples) go through under ask AND block; a paid one asks with the quoted price (ask) or is refused with
 *   the price and the safe way to allow it (block: OPENHIGGSFIELD_MCP_SPEND=ask + a pinned OPENHIGGSFIELD_AGENT_BUDGET_USD). A per-tool block
 *   (OPENHIGGSFIELD_MCP_BLOCK=run, "tools": {"run": "block"}) still blocks every call. The server's agent budget still caps every run.
 *   Messages never point at allow / ALLOW=* for spend: both remove the per-run OK.
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
/** Tools whose handler asks itself (or refuses, under block), after quoting, and only when the run costs money. */
export const PRICE_AWARE = new Set(['run', 'retry']);
/** origin: where each value was set, in the user's words ("OPENHIGGSFIELD_MCP_SPEND=block", '"spend": "block" in /path/permissions.json'), for refusals. */
export interface PermConfig { default: Perm; spend?: Perm; tools: Record<string, Perm>; source: string[]; toolsets?: string[] | null; origin?: { default?: string; spend?: string; tools: Record<string, string> } }
export function loadPermissions(env = process.env): PermConfig {
  const cfg: PermConfig = { default: 'allow', spend: 'ask', tools: Object.fromEntries(READ_ONLY.map((t) => [t, 'allow' as Perm])), source: ['defaults'], origin: { tools: {} } };
  const o = cfg.origin!;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = env.OPENHIGGSFIELD_MCP_PERMISSIONS ? [env.OPENHIGGSFIELD_MCP_PERMISSIONS] : [path.resolve('openhiggsfield-mcp.json'), path.resolve(here, '../permissions.json')];
  for (const f of candidates) {
    if (!fs.existsSync(f)) { if (env.OPENHIGGSFIELD_MCP_PERMISSIONS) throw new Error(`MCP permissions file not found: ${f}`); continue; }
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (j.default != null) { if (!isPerm(j.default)) throw new Error(`${f}: "default" must be allow|ask|block`); cfg.default = j.default; o.default = `"default": "${j.default}" in ${f}`; }
    if (j.spend != null) { if (!isPerm(j.spend)) throw new Error(`${f}: "spend" must be allow|ask|block`); cfg.spend = j.spend; o.spend = `"spend": "${j.spend}" in ${f}`; }
    if (j.toolsets != null) { if (!Array.isArray(j.toolsets)) throw new Error(`${f}: "toolsets" must be a list, e.g. ["core","canvas"]`); cfg.toolsets = j.toolsets.map(String); }
    for (const [k, v] of Object.entries(j.tools ?? {})) { if (!isPerm(v)) throw new Error(`${f}: tools.${k} must be allow|ask|block`); cfg.tools[k] = v; o.tools[k] = `"tools": {"${k}": "${v}"} in ${f}`; }
    cfg.source.push(f); break;
  }
  if (isPerm(env.OPENHIGGSFIELD_MCP_DEFAULT)) { cfg.default = env.OPENHIGGSFIELD_MCP_DEFAULT; cfg.source.push('env:DEFAULT'); o.default = `OPENHIGGSFIELD_MCP_DEFAULT=${cfg.default}`; }
  if (isPerm(env.OPENHIGGSFIELD_MCP_SPEND)) { cfg.spend = env.OPENHIGGSFIELD_MCP_SPEND; cfg.source.push('env:SPEND'); o.spend = `OPENHIGGSFIELD_MCP_SPEND=${cfg.spend}`; }
  for (const p of PERMS) {
    const list = env[`OPENHIGGSFIELD_MCP_${p.toUpperCase()}`]; if (!list) continue;
    const where = `OPENHIGGSFIELD_MCP_${p.toUpperCase()}=${list}`;
    for (const t of list.split(',').map((x) => x.trim()).filter(Boolean)) { if (t === '*') { cfg.default = p; cfg.spend = p; o.default = where; o.spend = where; for (const k of Object.keys(cfg.tools)) { cfg.tools[k] = p; o.tools[k] = where; } } else { cfg.tools[t] = p; o.tools[t] = where; } }
    cfg.source.push(`env:${p.toUpperCase()}`);
  }
  return cfg;
}
export const permFor = (cfg: PermConfig, tool: string): Perm => cfg.tools[tool] ?? (cfg.spend && SPEND.includes(tool) ? cfg.spend : cfg.default);

/** Where a tool's permission comes from, in the user's words (for refusals): the per-tool setting, else the spend tier (spend tools), else default. */
export const permOrigin = (cfg: PermConfig, tool: string): string => {
  const o = cfg.origin; if (tool in cfg.tools) return o?.tools[tool] ?? 'the built-in defaults';
  if (cfg.spend && SPEND.includes(tool)) return o?.spend ?? 'the built-in defaults (spend: ask)';
  return o?.default ?? 'the built-in defaults';
};
/** The safe way to let an agent start paid runs: each one asks with its price, inside a budget the agent can't change. Never allow / ALLOW=*. */
export const SAFE_SPEND_HINT = 'To let the agent start paid runs safely, the user sets OPENHIGGSFIELD_MCP_SPEND=ask (each paid run asks them with its price) and OPENHIGGSFIELD_AGENT_BUDGET_USD=<cap> (a budget the agent can\'t change) in this connector\'s settings, then restarts the connector. docs/MCP.md "Letting Claude spend, safely".';
/** Under spend block, run / retry refuse only paid runs (free, local and sample runs pass): the refusal names the setting, the price and the safe option. */
export const spendBlockedReason = (cfg: PermConfig, tool: string, what: string) =>
  `Paid runs are off for this connector (${permOrigin(cfg, tool)}), so ${what} was not started. Nothing was sent or charged. Free runs still work: run_on "local" (this computer) or a sample. ${SAFE_SPEND_HINT}`;
/** Spend-tier block on a price-aware tool (not a per-tool block): the handler decides per price. */
export const spendBlockIsPriceAware = (cfg: PermConfig, tool: string) => PRICE_AWARE.has(tool) && !(tool in cfg.tools) && permFor(cfg, tool) === 'block';

const refuse = (text: string) => ({ isError: true, content: [{ type: 'text' as const, text }] });
/** Wrap McpServer.registerTool so every handler is gated by its permission. Must run before tools are registered. */
export function gateTools(s: any, cfg: PermConfig) {
  const orig = s.registerTool.bind(s);
  s.registerTool = (name: string, meta: any, handler: (...a: any[]) => any) => {
    const perm = permFor(cfg, name); const priceBlock = spendBlockIsPriceAware(cfg, name); const spend = SPEND.includes(name);
    const tag = priceBlock ? 'paid runs blocked — free, local and sample runs still work' : perm === 'ask' ? (PRICE_AWARE.has(name) ? 'ask — the user is asked to approve each paid run, free runs go through' : 'ask — the user is asked to approve each call')
      : `block — turned off in this connector's settings (${permOrigin(cfg, name)})`;
    const description = perm === 'allow' ? meta.description : `${meta.description} [permission: ${tag}]`;
    return orig(name, { ...meta, description }, async (args: any, extra: any) => {
      // spend block on run / retry: the handler prices the request and calls blockPaid(what) only for a paid run; free runs go through
      if (priceBlock) return handler(args, { ...extra, blockPaid: (what: string) => spendBlockedReason(cfg, name, what) });
      if (perm === 'block') return refuse(`Tool "${name}" is turned off in this connector's settings (${permOrigin(cfg, name)}). Nothing was run.${spend ? ` ${SAFE_SPEND_HINT}` : ` To turn it on, the user sets OPENHIGGSFIELD_MCP_ASK=${name} (asks each time) or OPENHIGGSFIELD_MCP_ALLOW=${name}, or "tools": {"${name}": "ask"} in the permissions file.`}`);
      if (perm === 'ask') {
        const caps = s.server.getClientCapabilities?.();
        const ask = async (message: string): Promise<string | null> => {
          if (!caps?.elicitation) return `Tool "${name}" needs the user's approval, but this MCP client doesn't support elicitation, so it can't ask. Nothing was run. ${spend
            ? 'Paid runs ask the user each time (OPENHIGGSFIELD_MCP_SPEND=ask). Use a client that supports elicitation (approval prompts), or on the Canvas use canvas_propose_run so the user presses Go in the app. Free runs (run_on "local") need no approval.'
            : `Ask the user to allow it (OPENHIGGSFIELD_MCP_ALLOW=${name} or "tools": {"${name}": "allow"} in the permissions file)`}`;
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
