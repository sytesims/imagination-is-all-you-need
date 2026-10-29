/**
 * MCP prompts (slash commands in Claude Code, the prompt picker in Claude Desktop) mirroring the Claude skills in the repo's skills/ folder:
 * one source of truth, so a skill edit changes its prompt too. Plus the server instructions every client gets on connect.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** skills/ next to mcp/ (repo) or the copy packed into the package (skills/creative). */
export function skillsRoot(): string | null {
  for (const d of [path.resolve(HERE, '../../skills'), path.resolve(HERE, '../skills/creative')]) if (fs.existsSync(d) && fs.readdirSync(d).some((n) => fs.existsSync(path.join(d, n, 'SKILL.md')))) return d;
  return null;
}
export type Skill = { name: string; description: string; body: string };
export function loadSkills(): Skill[] {
  const root = skillsRoot(); if (!root) return [];
  return fs.readdirSync(root).sort().flatMap((dir) => {
    const f = path.join(root, dir, 'SKILL.md'); if (!fs.existsSync(f)) return [];
    const t = fs.readFileSync(f, 'utf8'); const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(t); if (!m) return [];
    const fm = Object.fromEntries(m[1].split('\n').map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
    return fm.name ? [{ name: fm.name, description: fm.description ?? '', body: m[2].trim() }] : [];
  });
}

export const INSTRUCTIONS = `Imagination Is All You Need: a local creative studio (image, video, audio, 3D) with free local models and optional paid cloud models.
How to work:
1. search_capabilities {query} to find tools, models and workflows (no query = overview, incl. whether results are real or samples).
2. describe {id} for the exact fields (JSON Schema), limits, models and prices of a tool.
3. quote the exact request and tell the user the price. Prefer free local runs (run_on "local") when they are good enough.
4. run it. A paid run needs the quote_id from step 3 (and the user's OK); max_usd caps it, budget_id ties it to a budget (budget {action:"set"}).
5. status {id, wait_sec} until done (never call run again to check: that starts and pays for a second job). get_outputs for the links.
6. When a budget was set, end with budget {action:"receipt"} and show it.
If a result says sample:true, tell the user it is a placeholder, not a real render. Prompts named like the skills (make-ad-variants, cost-check…) give step-by-step playbooks.`;

/** The phrase the canvas dock tells people to type in their AI (web/src/canvas/dockAgent.ts LISTEN_PHRASE says the same). */
export const LISTEN_PHRASE = 'listen to my canvas';
/** What "listen" means, for the server instructions and the listen prompt: one loop, one board, replies with canvas_say. */
export const listenLoop = (board?: string | null) => [
  board ? `Board: ${board}.` : 'Find the board: call canvas_list_boards and take the one with open: true (if several are open, ask me which; if none, ask me to open Canvas).',
  `Loop on that board: call canvas_wait_for_message { board_id${board ? `: "${board}"` : ''} } (no since the first time: it also returns what I typed before you started), then pass since = the last next. When it returns nothing, call it again at once. Keep looping until I say stop.`,
  'Each message is my request from the canvas dock; its selection lists the cards I had selected.',
  'Answer every message with canvas_say on the same board (a sentence or two), even just to say hello. Build drafts with canvas_batch / canvas_add_card and price them with canvas_propose_run: never start a run any other way, I press Go.',
].join('\n');
/** Server instructions: the base, plus the canvas part when the canvas tools are on, plus the channel part in channel mode. */
export function instructionsFor(o: { canvas: boolean; channel?: boolean }): string {
  const parts = [INSTRUCTIONS];
  if (o.canvas) parts.push(`Canvas: the user may type in the app's Canvas dock and expect you to answer there. When they say "${LISTEN_PHRASE}" (or "listen to the canvas", "be my canvas agent", "watch my board"), or run the listen prompt, do this:\n${listenLoop()}`);
  if (o.channel) parts.push('Canvas messages are also pushed to you: they arrive as <channel source="…" board_id="…" board_name="…" seq="…"> with the user\'s words inside. Treat each as the user\'s own request from the canvas dock and answer it with canvas_say { board_id } from the tag (build and quote on that board as above). You don\'t need a wait loop while these arrive.');
  return parts.join('\n\n');
}

export function registerPrompts(s: any, o: { canvas?: boolean } = {}) {
  /* "listen" (2026-10-28): the canvas dock says "type /imagination:listen <board>" when your AI is connected but not reading the board.
     Claude Code lists MCP prompts as /<server>:<prompt> and splits arguments on spaces, so the board id is one token. */
  if (o.canvas) s.registerPrompt('listen', { title: 'listen to my canvas', description: 'Read what I type in the Canvas dock and answer there: loop on canvas_wait_for_message for a board and reply with canvas_say.',
    argsSchema: { board: z.string().optional().describe('Board id (brd_…); leave out to use the board open in the app') } },
    ({ board }: { board?: string }) => ({ messages: [{ role: 'user', content: { type: 'text', text: `Listen to my canvas in Imagination Is All You Need and answer me there.\n${listenLoop(board?.trim() || null)}\nStart now: say hello on the board with canvas_say, then wait.` } }] }));
  for (const k of loadSkills()) {
    s.registerPrompt(k.name, { title: k.name.replace(/-/g, ' '), description: k.description, argsSchema: { request: z.string().optional().describe('What the user wants, in their words') } },
      ({ request }: { request?: string }) => ({ messages: [{ role: 'user', content: { type: 'text', text: `${request ? `Request: ${request}\n\n` : ''}Follow this playbook with the imagination MCP tools:\n\n${k.body}` } }] }));
  }
  s.registerPrompt('what-can-you-do', { title: 'what can you do', description: 'Show what the studio can make right now, what is free and local, and what costs money.' },
    () => ({ messages: [{ role: 'user', content: { type: 'text', text: 'Call search_capabilities with no query, then summarise for me in a short table: what I can make (image, video, audio, 3D), which of it runs free on this computer, which needs a paid place and roughly what it costs, and whether results are real or samples right now.' } }] }));
}
