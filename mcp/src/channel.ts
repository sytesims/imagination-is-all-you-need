/**
 * Channel mode (2026-10-28): push what the user types in the Canvas dock straight into a running Claude Code session.
 *
 * Claude Code "channels" (research preview, https://code.claude.com/docs/en/channels-reference): a stdio MCP server that declares the
 * `claude/channel` capability (server.ts, createServer({ channel: true })) can send `notifications/claude/channel`; Claude Code puts each one in
 * the session as <channel source="<server name>" …>content</channel>, so Claude wakes up and answers without a canvas_wait_for_message loop.
 * The user opts in per session (custom channels aren't on Anthropic's allowlist during the preview):
 *   claude --dangerously-load-development-channels server:<name of this server in the MCP config>
 * Without that flag Claude Code drops the notifications silently, and canvas_wait_for_message still works as before.
 *
 * Here: long-poll GET /api/canvas/agent/channel (the app routes each message to the session listening on its board, or to the newest channel
 * session when nobody is) and send one notification per message. Only messages typed in this app's own dock come through (the API is local).
 */
import { API, get, del } from './api.js';

type Msg = { seq: number; at: number; type: string; text: string; decision?: string; proposalId?: string; selection?: { id: string; name?: string | null }[]; confirmId?: string; pickId?: string; cardId?: string };
type Batch = { boardId: string; boardName: string | null; messages: Msg[] };
type Notify = (n: { method: string; params: { content: string; meta: Record<string, string> } }) => Promise<void>;

/** One channel event for one dock message. meta keys must be identifiers (letters, digits, _): Claude Code drops any other. */
export function channelEvent(b: Pick<Batch, 'boardId' | 'boardName'>, m: Msg): { content: string; meta: Record<string, string> } {
  const sel = (m.selection ?? []).slice(0, 12).map((x) => (x.name ? `${x.name} (${x.id})` : x.id));
  const content = m.type === 'decision'
    ? `I pressed ${m.decision === 'go' ? 'Go' : 'Cancel'} on proposal ${m.proposalId ?? ''}.`.replace(/ \.$/, '.')
    : `${m.text}${sel.length ? `\n\n(Selected on the board: ${sel.join(', ')})` : ''}`;
  const meta: Record<string, string> = { board_id: b.boardId, seq: String(m.seq), kind: m.type };
  if (b.boardName) meta.board_name = b.boardName.slice(0, 80);
  if (m.decision) meta.decision = m.decision; if (m.proposalId) meta.proposal_id = m.proposalId;
  if (m.confirmId) meta.confirm_id = m.confirmId; if (m.pickId) meta.pick_id = m.pickId; if (m.cardId) meta.card_id = m.cardId;
  return { content, meta };
}

/** Start the poll loop; returns stop() (resolves once the app has forgotten this session). The loop backs off while the app is down. */
export function startChannel(notify: Notify, log: (s: string) => void = (s) => console.error(`[openhiggsfield-mcp] ${s}`)): () => Promise<void> {
  let stopped = false; let fails = 0;
  void (async () => {
    log(`channel mode: pushing canvas messages from ${API} into this session`);
    while (!stopped) {
      try {
        const r: { items?: Batch[] } = await get('/api/canvas/agent/channel?timeout_sec=50');
        fails = 0;
        for (const b of r.items ?? []) for (const m of b.messages) await notify({ method: 'notifications/claude/channel', params: channelEvent(b, m) });
      } catch (e) {
        if (stopped) break; fails += 1;
        if (fails === 1) log(`channel mode: the app is not answering (${(e as Error).message}); retrying`);
        await new Promise((res) => setTimeout(res, Math.min(15_000, 1000 * fails)));
      }
    }
  })();
  return () => { stopped = true; return Promise.race([del('/api/canvas/agent/channel').catch(() => undefined), new Promise((r) => setTimeout(r, 800))]).then(() => undefined); };
}
