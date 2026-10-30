/** Your own AI as the dock's brain (2026-10-27): plain words and choices, no imports, so the server tests read them too. */
// ---------------------------------------------------------------- your own agent (2026-10-27)
/** The prompt to paste into Claude (Claude Code, Claude Desktop or any MCP client) so it listens to this board's dock. The same words
 *  are in docs/MCP.md and skills/canvas-agent/SKILL.md. */
export function agentStarterPrompt(boardId: string, boardName?: string | null): string {
  return [`Be my canvas agent for the board ${boardId}${boardName ? ` ("${boardName}")` : ''} in Imagination Is All You Need (the "imagination" MCP server).`,
    `Loop: call canvas_wait_for_message with board_id ${boardId} (pass since = the last next). When it returns nothing, call it again.`,
    'Each message is my request; its selection lists the cards I had selected.',
    'Plan with canvas_list_workflows (and list_workflows for whole pipelines), build drafts with canvas_batch, and price them with canvas_propose_run. Never start a run any other way: I press Go.',
    'When takes finish, look at them (get_asset with include_image) and record what you see with canvas_review. I pick the version.',
    'Reply in a sentence or two with canvas_say, then wait again.'].join('\n');
}
/** Where the dock sends what you type: your connected agent's inbox, an answer to the demo's "Looks good?", or a new demo run. */
export const dockRoute = (o: { connected: boolean; demoRunning: boolean; confirmWaiting: boolean }): 'messages' | 'demo' =>
  (o.connected || (o.demoRunning && o.confirmWaiting) ? 'messages' : 'demo');

// ---------------------------------------------------------------- honest status (2026-10-28)
/** The words that make Claude Code start listening (mcp/src/prompts.ts LISTEN_PHRASE says the same), and the MCP prompt that does it in one go.
 *  Claude Code lists MCP prompts as /<server>:<prompt>; "imagination" is the name the Connect sheet's `claude mcp add` gives the server. */
export const LISTEN_PHRASE = 'listen to my canvas';
export const MCP_SERVER_NAME = 'imagination';
export const listenCommand = (boardId: string, server = MCP_SERVER_NAME) => `/${server}:listen ${boardId}`;
/** The dock's states: nobody connected (built-in demo), connected but not on this board, working on this board (a canvas_* call on it in the
 *  last ~70 s, no wait loop: it builds but doesn't read what you type yet; 2026-10-28), listening (its wait is open, or a channel pushes). */
export type DockState = 'off' | 'connected' | 'working' | 'listening';
export const dockState = (o: { connected: boolean; listening: boolean; working?: boolean }): DockState => (o.listening ? 'listening' : o.working ? 'working' : o.connected ? 'connected' : 'off');
/** The line under "Agent" in the dock header. Short and without the agent's name (that is in the pill's tip and the dock below), so it never
 *  truncates in the 380 px dock at any window size (2026-10-28: "2 agents connected · none …" was cut off). */
export function dockStatusLine(state: DockState, _name: string, o: { sessions?: number; via?: 'wait' | 'channel' | null } = {}): string {
  if (state === 'off') return 'Built-in demo';
  if (state === 'connected') return o.sessions && o.sessions > 1 ? `${o.sessions} agents · not here yet` : 'Not reading this board yet';
  if (state === 'working') return 'Working on this board';
  return o.via === 'channel' ? 'Messages go straight in' : 'Reading this board';
}
/** The pill beside it. */
export const dockPill = (state: DockState): string => (state === 'listening' ? 'Listening' : state === 'working' ? 'Working' : state === 'connected' ? 'Connected' : 'Not connected');
/** The plain line in the dock while your agent works here without listening: it builds, and what you type waits. */
export const workingLine = (name: string) => `${name} is working on this board`;
/** A message you sent: waiting until the agent reads it, sent when a channel pushed it (Claude Code doesn't confirm), read once it did.
 *  null once the agent has answered after it (a reply clears it). */
export type MsgStatus = 'waiting' | 'sent' | 'read' | null;
export function messageStatus(e: { seq: number; from?: string; type: string; readAt?: number | null; pushedAt?: number | null }, lastAgentSeq: number): MsgStatus {
  if (e.from !== 'user' || e.type !== 'message' || e.seq < lastAgentSeq) return null;
  return e.readAt ? 'read' : e.pushedAt ? 'sent' : 'waiting';
}
export const messageStatusText = (st: MsgStatus, name: string): string =>
  st === 'waiting' ? `Waiting for ${name} to read it` : st === 'sent' ? `Sent to ${name}` : st === 'read' ? 'Read' : '';
