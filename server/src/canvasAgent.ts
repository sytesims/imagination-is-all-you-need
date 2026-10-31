/**
 * Canvas agent bridge (2026-10-24): the live wire between an MCP client and an open board.
 *
 *  POST /api/canvas/boards/:id/agent/ops      { ops: [...] }  the MCP side queues ops; waits for the open canvas page
 *  GET  /api/canvas/boards/:id/agent/stream   (SSE)            the page listens; it applies each op and POSTs the result back
 *  POST /api/canvas/boards/:id/agent/results  { id, ok, result?, error? }
 *  GET  /api/canvas/boards/:id/agent/summary  the board's cards, connections, status and prices (live when the page is open)
 *  GET  /api/canvas/boards/:id/agent/feed     everything the panel shows (messages, activity, decisions), by `since`
 *  GET  /api/canvas/boards/:id/agent/inbox    only the agent's messages + the user's replies and Go / Cancel presses
 *  POST /api/canvas/boards/:id/agent/messages { text }         a reply typed in the panel
 *  GET  /api/canvas/boards/:id/agent/proposals                 recent proposals
 *  POST /api/canvas/boards/:id/agent/proposals/:pid/decision  { decision: "go" | "cancel" }
 *  GET  /api/canvas/agent/proposals/:pid                      a proposal by id (for canvas_proposal_status)
 *  GET  /api/canvas/agent/workflows                           the workflows canvas_add_card accepts
 *  GET  /api/canvas/agent/presence                            whether an MCP client is connected, and whether one is listening (reading what you type)
 *  GET  /api/canvas/agent/channel?timeout_sec=                 a channel-mode MCP server (mcp/src/channel.ts) long-polls the messages it should push into its session
 *  DELETE /api/canvas/agent/channel                             that MCP server stops (it goes away at once)
 *  POST /api/canvas/agent/sessions { process_id, sessions[] }  the MCP server's live client list (on every change + a heartbeat; mcp/src/sessions.ts)
 *  POST /api/canvas/agent/open     { board_id }                show a board on every open canvas page (canvas_create_board / canvas_switch_board)
 *  POST /api/canvas/boards/:id/agent/proposals { card_ids, note? }  the user's own Re-roll from the dock: priced like any proposal
 *  POST /api/canvas/boards/:id/agent/demo     { prompt, starter? }  a chip (starter id) plays a scripted plan (canvasDemo.ts); typed words get an honest reply, never a run
 *  POST /api/canvas/boards/:id/agent/demo/stop                      stops it (nothing it added is removed)
 *  GET  /api/canvas/agent/starters                                  the dock's starter chips
 *  POST /api/canvas/boards/:id/agent/pick     { pick_id, card_id }  the user's choice for an ask_pick ("Pick the one you like")
 *
 * Nothing here ever submits a run. A proposal only prices cards; the user's Go in the panel is the one thing that makes the page
 * submit them (through the same agentApi.submit a person's Generate uses). An MCP call alone can never spend money.
 *
 * State is in memory per board (the page is the source of truth for the board itself; the saved snapshot is the fallback). Feed and
 * proposal lists are capped, so a long session stays small.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getBoard, summary as boardSummary } from './canvasBoards.js';
import { jobs } from './jobs.js';
import { budgetOfRequest, budgetView, type AgentBudget } from './agentBudget.js';
import { getTool } from './tools/registry.js';
import { imageWorkflowsPayload } from './shared/workflows.js';
import { DEMO_STARTERS, isChip, demoPlan, demoCardAt, demoPlanSize, demoFrameOf, demoNoteAt, demoGridOffset, detectStarter, isStarterId, demoReply, DEMO_GRID, type DemoPlan, type DemoCard } from './canvasDemo.js';
import { SHORT_STEPS, shortFilmPlan, shortLayout, beatOfNote, beatNote, keyFramePrompt, clipPrompt, narrationOf, musicPrompt, SHORT_MUSIC, shortFilmVideoOn, stitchBody, type ShortPlan, type ShortBeat } from './canvasDemo.js';
import { tagDemoCard, demoProviderOf } from './shared/demoMedia.js';
import { config } from './config.js';
import { LOCAL_FREE } from './shared/modelIds.js';
import { toolDefaults, toolModes } from './routing/defaults.js';
import { canvasDefaultModel } from './shared/cloudDefaults.js';
import { validateBatch, batchLine, BATCH_MAX, type BatchItem } from './shared/canvasBatch.js';
import { recommend } from './shared/takeReview.js';
import { reviewVersions, reviewMode } from './canvasReview.js';

const MAX_FEED = 240;
const MAX_PROPOSALS = 40;
const OP_TIMEOUT_MS = 10_000;
const BATCH_TIMEOUT_MS = 30_000;
const SUMMARY_TIMEOUT_MS = 8_000;
const PROPOSAL_TIMEOUT_MS = 180_000;
/** An agent counts as connected while it waits or polls: every canvas_wait_for_message (≤ 60 s) or board call refreshes it (2026-10-27; was 30 min). */
const AGENT_FRESH_MS = Number(process.env.OPENHIGGSFIELD_AGENT_FRESH_MS ?? 90_000);
const WAIT_MAX_S = 60;
/** Listening (2026-10-28): a board is "listening" while a canvas_wait_for_message is open on it, or for this long after the last one returned
 *  (the agent reads, thinks and calls again inside it), or while a channel-mode MCP server polls (it pushes what you type into its session). */
const LISTEN_FRESH_MS = Number(process.env.OPENHIGGSFIELD_AGENT_LISTEN_MS ?? 70_000);
/** Working (2026-10-28): an agent that builds over MCP without a wait loop (canvas_add_card, canvas_propose_run… over HTTP) is working on this
 *  board for this long after its last canvas_* call on it. The dock said "connected but isn't reading this board yet" while it built. */
const WORK_FRESH_MS = Number(process.env.OPENHIGGSFIELD_AGENT_WORK_MS ?? 70_000);
/** A wait without `since`, and a channel poll, pick up your unread messages from this far back (a "hello" typed before the agent listened). */
const UNREAD_WINDOW_MS = 30 * 60_000;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const now = () => Date.now();
const uid = (p: string) => `${p}_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

// ---------------------------------------------------------------- types
export type Op =
  | { kind: 'say'; text: string }
  | { kind: 'add_card'; workflow: string; prompt?: string; name?: string; model?: string; settings?: Record<string, string>; inputs_from?: string[]; at?: { x: number; y: number } }
  | { kind: 'update_card'; card_id: string; workflow?: string; prompt?: string; model?: string; settings?: Record<string, string>; inputs_from?: string[]; version?: number }
  | { kind: 'connect'; from_id: string; to_id: string }
  | { kind: 'remove_card'; card_id: string }
  | { kind: 'propose_run'; card_ids: string[]; note?: string }
  | { kind: 'summary' }
  /* the board as a plan (2026-10-27): sticky notes, named frames, cards dropped into frames, a pointer, and "pick one" */
  | { kind: 'add_note'; text: string; at?: { x: number; y: number }; color?: string; frame_id?: string }
  | { kind: 'add_frame'; name: string; at?: { x: number; y: number }; w?: number; h?: number; around?: string[] }
  | { kind: 'move_into'; ids: string[]; frame_id: string }
  | { kind: 'point_at'; ids?: string[]; at?: { x: number; y: number }; text?: string }
  | { kind: 'ask_pick'; card_ids: string[]; text?: string }
  /* typed connections (2026-10-27): the board's "What next?" list for a node (the workflows that take what it makes) */
  | { kind: 'next_steps'; card_id: string }
  /* many things at once (2026-10-27): add_card / add_note / add_frame / connect / move_into with temporary refs; all or nothing */
  | { kind: 'batch'; items: BatchItem[]; note?: string }
  /* the agent reviews its own versions (2026-10-27): a verdict per version and a recommended one per card; never changes the active one */
  | { kind: 'review_versions'; cards: { card_id: string; reviews: { version: number; verdict: 'fits' | 'check'; reason?: string }[]; recommend?: number | null }[]; say?: string }
  /* an existing generation on the board (2026-10-28): the same result card the Assets drawer places, so the agent can wire it into a new card */
  | { kind: 'add_from_job'; job_id: string; out?: number; at?: { x: number; y: number } };
type InternalOp = Op | { kind: 'run_proposal'; proposal_id: string; card_ids: string[]; budget_id?: string | null } | { kind: 'free_area'; w: number; h: number }
  | { kind: 'place_result'; job_id: string; url: string; title: string; at: { x: number; y: number } }
  /* Sofa in every material (canvasDemo.materialPlan): the demo's own pictures as Upload nodes, then a card's versions side by side */
  | { kind: 'add_upload'; url: string; name: string; at: { x: number; y: number } } | { kind: 'spread_versions'; card_id: string; from_id?: string; at: { x: number; y: number } };
type OpResult = { ok: true; result: any } | { ok: false; error: string; code?: string; result?: any };

export type PriceView = { usd: number | null; credits: number | null; label: string | null; demo: boolean; local: boolean; runnable: boolean };
export interface BoardNode {
  id: string; type: 'card' | 'result' | 'picture' | 'clip' | 'note' | 'frame' | 'link'; kind: string | null; name?: string | null; frame?: string | null; children?: string[]; url?: string | null; by?: 'agent' | 'you'; workflow?: string | null; model?: string | null;
  prompt?: string | null; title?: string | null; status?: string | null; inputs?: string[]; results?: { url: string; kind?: string | null; poster?: string | null }[];
  price?: PriceView | null; jobId?: string | null; missing?: string | null;
}
export interface ProposalItem { cardId: string; title: string; workflow: string; model: string | null; status: string; usd: number | null; credits: number | null; quote: any; problem: string | null }
export interface ProposalBudget { id: string; name: string; budgetUsd: number | null; remainingUsd: number | null; spentUsd: number; budgetCredits: number | null; remainingCredits: number | null }
export interface Proposal {
  id: string; boardId: string; cardIds: string[]; note: string | null; items: ProposalItem[]; totalUsd: number; totalCredits: number;
  budget: ProposalBudget | null; overBudget: boolean; overByUsd: number | null; reason: string | null;
  /** The cards Go starts: every item without a problem. A row that can't run here (a model not on this server, a missing input) is skipped, not a
   *  blocker for the rest; the total counts only these. `reason` is set (and Go is off) only when NONE can run, or the batch is over budget. */
  runCardIds: string[]; skipped: { cardId: string; title: string; problem: string }[]; /** cards Go tried that the server refused (they stay drafts) */ failedIds?: string[];
  status: 'pending' | 'running' | 'approved' | 'cancelled' | 'failed'; createdAt: number; decidedAt: number | null; jobIds: string[]; error: string | null;
}
export interface FeedEntry {
  seq: number; id: string; at: number; type: 'message' | 'activity' | 'decision' | 'proposal'; text: string;
  from?: 'agent' | 'user'; cardId?: string; fromId?: string; toId?: string; proposalId?: string; decision?: 'go' | 'cancel'; meta?: any;
  /** your message reached the agent (2026-10-28): when, and how (its wait, its inbox, or a channel push it answered) */ readAt?: number; readVia?: 'wait' | 'inbox' | 'channel';
  /** pushed into a channel session (2026-10-28): sent, but Claude Code doesn't confirm delivery, so it only counts as read once the agent answers */ pushedAt?: number;
}
/** One connected MCP client (a session of an MCP server process), as the canvas shows it. */
export interface AgentSession { id: string; name: string; client: string | null; transport: 'http' | 'stdio'; since: number; lastSeen: number }
/** connected: a client is connected (any MCP session) or an agent touched this board lately. listening (2026-10-28): an agent reads what you
 *  type on THIS board right now: its canvas_wait_for_message is open or returned under LISTEN_FRESH_MS ago (via "wait"), or a channel-mode
 *  session is polling (via "channel": your message is pushed into it). sessions: every connected client. */
export interface Presence { connected: boolean; listening: boolean; /** a canvas_* call on this board in the last WORK_FRESH_MS (any board, for presenceView) */ working: boolean; listenVia: 'wait' | 'channel' | null; channel: boolean; lastAgentAt: number | null; agentName: string | null; sessions: AgentSession[] }
/** "Pick the one you like": the cards the user chooses from, and their choice once they click one. */
export interface PickAsk { id: string; boardId: string; cardIds: string[]; text: string; chosen: string | null; status: 'waiting' | 'picked' | 'cancelled'; createdAt: number; by: 'mcp' | 'demo' }

interface AgentClient { id: string; res: ServerResponse }
interface Listener { id: string; name: string; at: number }
interface BoardState { clients: Map<string, AgentClient>; feed: FeedEntry[]; seq: number; proposals: Map<string, Proposal>; lastAgentAt: number; agentName: string | null; pick: PickAsk | null;
  /** the one agent listening on this board (canvas_wait_for_message), and the waits parked until you type */ listener: Listener | null; waiters: Set<() => void>; fresh: ReturnType<typeof setTimeout> | null;
  /** open waits, when the last one started or ended, and the timer that says "not listening" when it lapses */ waits: number; listenAt: number; listenT: ReturnType<typeof setTimeout> | null;
  /** the agent's last call on this board, and the timer that says "not working" when it lapses */ workAt: number; workT: ReturnType<typeof setTimeout> | null }
interface Pending { boardId: string; clientId: string; timer: ReturnType<typeof setTimeout>; resolve: (r: OpResult) => void; onResult?: (r: OpResult) => void }

const states = new Map<string, BoardState>();
const pending = new Map<string, Pending>();
const proposalsById = new Map<string, Proposal>();
let globalAgentAt = 0; let globalAgentName: string | null = null; let presenceTimer: ReturnType<typeof setTimeout> | null = null;

function stateOf(boardId: string): BoardState {
  let s = states.get(boardId);
  if (!s) { s = { clients: new Map(), feed: [], seq: 0, proposals: new Map(), lastAgentAt: 0, agentName: null, pick: null, listener: null, waiters: new Set(), fresh: null, waits: 0, listenAt: 0, listenT: null, workAt: 0, workT: null }; states.set(boardId, s); }
  return s;
}
export const hasCanvas = (boardId: string) => (states.get(boardId)?.clients.size ?? 0) > 0;
// ---------------------------------------------------------------- connected clients (2026-10-28)
/** An MCP server process we have not heard from in this long is gone (it beats every 15 s): its clients stop counting as connected. */
const MCP_PROC_FRESH_MS = Number(process.env.OPENHIGGSFIELD_MCP_PROC_FRESH_MS ?? 45_000);
const mcpProcs = new Map<string, { at: number; sessions: AgentSession[] }>();
let sweepTimer: ReturnType<typeof setInterval> | null = null;
/** "claude-code" → "Claude Code"; a client with no name is "Your AI". */
export function clientLabel(raw: string | null | undefined): string {
  const n = String(raw ?? '').trim(); if (!n) return 'Your AI';
  const known: Record<string, string> = { 'claude-code': 'Claude Code', 'claude-ai': 'Claude', claude: 'Claude', 'claude-desktop': 'Claude Desktop', cursor: 'Cursor', 'cursor-vscode': 'Cursor', vscode: 'VS Code', 'visual-studio-code': 'VS Code', windsurf: 'Windsurf', codex: 'Codex', 'codex-mcp-client': 'Codex', 'gemini-cli-mcp-client': 'Gemini CLI', 'mcp-inspector': 'MCP Inspector', 'inspector-client': 'MCP Inspector' };
  const k = known[n.toLowerCase()]; if (k) return k;
  if (/[A-Z ]/.test(n)) return n.slice(0, 40); /* already a display name */
  return n.split(/[-_\s]+/).filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ').slice(0, 40) || 'Your AI';
}
export function liveSessions(at = now()): AgentSession[] {
  const out: AgentSession[] = [];
  for (const p of mcpProcs.values()) if (at - p.at < MCP_PROC_FRESH_MS) out.push(...p.sessions);
  return out.sort((a, b) => a.since - b.since);
}
/** The first connected client's name, unless the agent named itself (OPENHIGGSFIELD_AGENT_NAME / its budget name). */
const nameFor = (named: string | null, sess: AgentSession[]) => (named && named !== 'Your AI' ? named : sess[0]?.name ?? named);
/** A wait is open on this board, or the last one returned a moment ago. */
const waitLive = (s: BoardState | undefined, at = now()) => !!s && (s.waits > 0 || (s.listenAt > 0 && at - s.listenAt < LISTEN_FRESH_MS));
/** The agent made a canvas_* call on this board a moment ago. */
const workLive = (s: BoardState | undefined, at = now()) => !!s && s.workAt > 0 && at - s.workAt < WORK_FRESH_MS;
export function presenceView(): Presence {
  const sess = liveSessions(); const touched = globalAgentAt > 0 && now() - globalAgentAt < AGENT_FRESH_MS;
  const chan = channelNow(); const wait = [...states.values()].some((s) => waitLive(s)); const listening = wait || !!chan; const working = [...states.values()].some((s) => workLive(s));
  return { connected: touched || sess.length > 0 || listening || working, listening, working, listenVia: wait ? 'wait' : chan ? 'channel' : null, channel: !!chan, lastAgentAt: globalAgentAt || null, agentName: nameFor(globalAgentName ?? chan?.name ?? null, sess), sessions: sess };
}
/** Presence for one board: connected as soon as any client is; listening only while an agent reads THIS board (its wait) or a channel session polls. */
export function presenceOf(boardId: string): Presence {
  const s = states.get(boardId); const at = s?.lastAgentAt ?? 0; const sess = liveSessions(); const touched = at > 0 && now() - at < AGENT_FRESH_MS;
  const chan = channelNow(); const wait = waitLive(s); const listening = wait || !!chan; const working = workLive(s);
  const name = wait ? s?.listener?.name ?? s?.agentName ?? null : chan && !s?.agentName ? chan.name : s?.agentName ?? null;
  return { connected: touched || sess.length > 0 || listening || working, listening, working, listenVia: wait ? 'wait' : chan ? 'channel' : null, channel: !!chan, lastAgentAt: at || null, agentName: nameFor(name, sess), sessions: sess };
}

// ---------------------------------------------------------------- listening + read receipts (2026-10-28)
/** A wait started or ended on this board: it listens now, and the dock hears when that lapses. */
function touchListen(boardId: string) {
  const s = stateOf(boardId); const was = waitLive(s); s.listenAt = now();
  if (s.listenT) clearTimeout(s.listenT);
  s.listenT = setTimeout(() => { s.listenT = null; if (!waitLive(s)) broadcast(boardId, 'presence', presenceOf(boardId)); }, LISTEN_FRESH_MS + 300); (s.listenT as any).unref?.();
  if (!was) broadcast(boardId, 'presence', presenceOf(boardId));
}
/** Your messages (and Go / Cancel presses) reached the agent: stamp them, and the dock turns "Waiting for … to read it" into "Read". */
function markRead(boardId: string, entries: FeedEntry[], via: NonNullable<FeedEntry['readVia']>) {
  const at = now();
  for (const e of entries) if (e.from === 'user' && (e.type === 'message' || e.type === 'decision') && !e.readAt) { e.readAt = at; e.readVia = via; broadcast(boardId, 'feed', e); }
}
/** The user's unread messages on a board from the last half hour, oldest first (notPushed: skip the ones a channel already sent). */
const unreadOf = (s: BoardState, at = now(), notPushed = false) => s.feed.filter((e) => e.from === 'user' && (e.type === 'message' || e.type === 'decision') && !e.readAt && !(notPushed && e.pushedAt) && at - e.at < UNREAD_WINDOW_MS);
/** Pushed into a channel session: the dock says "Sent to …" (not "Read" yet). */
function markPushed(boardId: string, entries: FeedEntry[]) { const at = now(); for (const e of entries) if (!e.pushedAt && !e.readAt) { e.pushedAt = at; broadcast(boardId, 'feed', e); } }
/** The agent answered on this board: what a channel pushed before now has clearly reached it. */
function answeredPushed(boardId: string) { const s = states.get(boardId); if (s) markRead(boardId, s.feed.filter((e) => e.pushedAt && !e.readAt), 'channel'); }
/** What the agent gets for one of your messages (canvas_wait_for_message and the channel push share it). */
const messageOut = (e: FeedEntry) => ({ seq: e.seq, at: e.at, type: e.type, text: e.text, ...(e.decision ? { decision: e.decision, proposalId: e.proposalId } : {}), selection: e.meta?.selection ?? [],
  ...(e.meta?.confirmId ? { confirmId: e.meta.confirmId } : {}), ...(e.meta?.pickId ? { pickId: e.meta.pickId, cardId: e.meta.cardId } : {}) });

// ---------------------------------------------------------------- channel sessions (2026-10-28)
/** An MCP server started in channel mode (stdio, `--channel`; mcp/src/channel.ts) long-polls GET /api/canvas/agent/channel and pushes what you
 *  type into its Claude Code session as a channel message, so Claude wakes up without a wait loop. It is live while it polls (and a little after). */
interface ChannelSub { id: string; name: string; since: number; at: number; polls: number }
const channelSubs = new Map<string, ChannelSub>();
const channelWaiters = new Set<() => void>();
const channelLive = (c: ChannelSub, at = now()) => c.polls > 0 || at - c.at < LISTEN_FRESH_MS;
/** The newest live channel session: it gets messages for boards nobody else listens on. */
function channelNow(at = now()): ChannelSub | null { let best: ChannelSub | null = null; for (const c of channelSubs.values()) if (channelLive(c, at) && (!best || c.since > best.since)) best = c; return best; }
/** The messages this channel session should push now: boards it listens on, and boards with nobody else listening when it is the newest. */
function channelPick(sub: ChannelSub): { boardId: string; entries: FeedEntry[] }[] {
  const at = now(); const newest = channelNow(at)?.id === sub.id; const out: { boardId: string; entries: FeedEntry[] }[] = [];
  for (const [boardId, s] of states) {
    const l = s.listener; const mine = !!l && l.id === sub.id && at - l.at < AGENT_FRESH_MS;
    if (!mine && (waitLive(s, at) || (l && l.id !== sub.id && at - l.at < AGENT_FRESH_MS) || !newest)) continue; /* a wait-loop agent (or another session) has this board */
    const entries = unreadOf(s, at, true).filter((e) => !e.meta?.remote); if (entries.length) out.push({ boardId, entries }); /* remote senders wait for a wait loop */
  }
  return out;
}
const channelSig = () => { const c = channelNow(); return c ? c.id : ''; };
let channelSweep: ReturnType<typeof setInterval> | null = null;
/** A channel session came or went: every open board hears the new presence. */
function channelChanged(before: string) {
  if (channelSig() !== before) schedulePresence();
  if (!channelSweep && channelSubs.size) channelSweep = setInterval(() => {
    const b = channelSig(); for (const [id, c] of channelSubs) if (!channelLive(c)) channelSubs.delete(id);
    if (channelSig() !== b) schedulePresence();
    if (!channelSubs.size && channelSweep) { clearInterval(channelSweep); channelSweep = null; }
  }, 5_000);
  (channelSweep as any)?.unref?.();
}
/** The boards open in a canvas page right now. */
export const openBoards = () => [...states.entries()].filter(([, s]) => s.clients.size > 0).map(([id]) => id);
const sessionsSig = () => JSON.stringify(liveSessions().map((x) => [x.id, x.name]));
/** The MCP server's client list replaces what we had for that process; the canvas hears at once when it changed. */
function setSessions(processId: string, list: { id: string; client?: string | null; transport?: string; since?: number; lastSeen?: number }[]) {
  const before = sessionsSig(); const at = now();
  if (!list.length) mcpProcs.delete(processId);
  else mcpProcs.set(processId, { at, sessions: list.slice(0, 50).map((x) => ({ id: x.id, name: clientLabel(x.client), client: x.client ?? null, transport: x.transport === 'stdio' ? 'stdio' : 'http', since: Number(x.since) || at, lastSeen: Number(x.lastSeen) || at })) });
  if (sessionsSig() !== before) schedulePresence();
  if (!sweepTimer && mcpProcs.size) {
    /* a process that stops beating drops off on its own */
    sweepTimer = setInterval(() => {
      const b = sessionsSig(); for (const [id, p] of mcpProcs) if (now() - p.at >= MCP_PROC_FRESH_MS) mcpProcs.delete(id);
      if (sessionsSig() !== b) schedulePresence();
      if (!mcpProcs.size && sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
    }, 5_000); (sweepTimer as any).unref?.();
  }
}
/** Every open canvas page (any board) hears this: a new board list, or "show this board". */
function broadcastAll(event: string, data: unknown) { for (const id of states.keys()) broadcast(id, event, data); }

/** An MCP request touched the canvas (mcp/src/api.ts sends x-ohf-mcp + x-ohf-agent-name): the panel can say "Connected". */
function markAgent(req: FastifyRequest, boardId?: string, work = true) {
  const b = budgetOfRequest(req); const fromBudget = b && !('error' in b) ? b.name : null;
  const raw = req.headers['x-ohf-agent-name']; const header = (Array.isArray(raw) ? raw[0] : raw)?.trim(); const name = fromBudget ?? (header ? clientLabel(header) : null); /* "claude-code" → "Claude Code" */
  globalAgentAt = now(); if (name) globalAgentName = name;
  if (boardId) { const s = stateOf(boardId); s.lastAgentAt = globalAgentAt; if (name) s.agentName = name;
    /* when it goes quiet, the dock says so: one presence update just after the fresh window ends */
    if (s.fresh) clearTimeout(s.fresh); s.fresh = setTimeout(() => { s.fresh = null; broadcast(boardId, 'presence', presenceOf(boardId)); }, AGENT_FRESH_MS + 500); (s.fresh as any).unref?.();
    if (work) markWork(boardId); }
  schedulePresence();
}
/** A canvas_* call on THIS board: the dock says "working on this board" until WORK_FRESH_MS after the last one (then one presence update). */
function markWork(boardId: string) {
  const s = stateOf(boardId); const was = workLive(s); s.workAt = now();
  if (s.workT) clearTimeout(s.workT);
  s.workT = setTimeout(() => { s.workT = null; if (!workLive(s)) broadcast(boardId, 'presence', presenceOf(boardId)); }, WORK_FRESH_MS + 300); (s.workT as any).unref?.();
  if (!was) broadcast(boardId, 'presence', presenceOf(boardId));
}
const headerOf = (req: FastifyRequest, h: string) => { const v = req.headers[h]; return String((Array.isArray(v) ? v[0] : v) ?? '').trim(); };
/** One agent per board: a different listener while the first is still fresh gets a polite "busy". Returns the refusal, or null. */
function busyFor(req: FastifyRequest, boardId: string): string | null {
  const id = headerOf(req, 'x-ohf-agent-listener'); const s = stateOf(boardId); const l = s.listener;
  if (!id || !l || l.id === id || now() - l.at > AGENT_FRESH_MS) return null;
  return `${l.name} is already working on this board. Try again when it stops (about ${Math.ceil((AGENT_FRESH_MS - (now() - l.at)) / 1000)} s after its last call).`;
}
/** This request's agent becomes the board's listener (refreshing it). */
function listen(req: FastifyRequest, boardId: string) {
  const id = headerOf(req, 'x-ohf-agent-listener'); if (!id) return; const s = stateOf(boardId);
  const h = headerOf(req, 'x-ohf-agent-name'); s.listener = { id, name: (h ? clientLabel(h) : '') || s.listener?.name || 'Your AI', at: now() };
}
function schedulePresence() {
  if (presenceTimer) return;
  presenceTimer = setTimeout(() => { presenceTimer = null; for (const id of states.keys()) broadcast(id, 'presence', presenceOf(id)); }, 150);
}
function broadcast(boardId: string, event: string, data: unknown) {
  const s = states.get(boardId); if (!s) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of [...s.clients.values()]) { try { c.res.write(payload); } catch { s.clients.delete(c.id); } }
}

// ---------------------------------------------------------------- feed, messages, proposals
function addFeed(boardId: string, e: Omit<FeedEntry, 'seq' | 'id' | 'at'> & { at?: number }): FeedEntry {
  const s = stateOf(boardId); const entry: FeedEntry = { seq: ++s.seq, id: uid('ev'), at: e.at ?? now(), ...e };
  s.feed.push(entry); if (s.feed.length > MAX_FEED) s.feed.splice(0, s.feed.length - MAX_FEED);
  broadcast(boardId, 'feed', entry);
  if (entry.from === 'user' && (entry.type === 'message' || entry.type === 'decision')) { const w = [...s.waiters, ...channelWaiters]; s.waiters.clear(); channelWaiters.clear(); for (const f of w) f(); }
  return entry;
}
function addMessage(boardId: string, from: 'agent' | 'user', text: string, extra: Partial<FeedEntry> = {}) {
  return addFeed(boardId, { type: 'message', from, text, ...extra });
}
function addDecision(boardId: string, decision: 'go' | 'cancel', proposalId: string) {
  const text = decision === 'go' ? 'Approved the run.' : 'Cancelled the run.';
  return addFeed(boardId, { type: 'decision', from: 'user', decision, proposalId, text });
}
function addActivity(boardId: string, text: string, extra: Partial<FeedEntry> = {}) {
  return addFeed(boardId, { type: 'activity', text, ...extra });
}
function rememberProposal(p: Proposal) {
  const s = stateOf(p.boardId); s.proposals.set(p.id, p); proposalsById.set(p.id, p);
  if (s.proposals.size > MAX_PROPOSALS) { const old = [...s.proposals.values()].sort((a, b) => a.createdAt - b.createdAt)[0]; if (old) { s.proposals.delete(old.id); proposalsById.delete(old.id); } }
  broadcast(p.boardId, 'proposal', p);
}
function updateProposal(p: Proposal) { broadcast(p.boardId, 'proposal_update', p); }
/** Ask the user to pick one of these cards: the page pulses them and a click is the choice. A newer ask replaces a waiting one. */
function startPick(boardId: string, cardIds: string[], text: string, by: PickAsk['by']): PickAsk {
  const s = stateOf(boardId); endPick(boardId);
  const p: PickAsk = { id: uid('pick'), boardId, cardIds: [...new Set(cardIds)], text, chosen: null, status: 'waiting', createdAt: now(), by };
  s.pick = p; broadcast(boardId, 'pick', p); return p;
}
/** A waiting pick ends unanswered (Stop, or a newer ask). */
function endPick(boardId: string) { const s = states.get(boardId); if (s?.pick?.status === 'waiting') { s.pick.status = 'cancelled'; broadcast(boardId, 'pick', s.pick); } }
export const pickOf = (boardId: string) => states.get(boardId)?.pick ?? null;

// ---------------------------------------------------------------- zod validation
const zSettings = z.record(z.string(), z.string());
const sessionsBody = z.object({ process_id: z.string().trim().min(1).max(80), sessions: z.array(z.object({ id: z.string().trim().min(1).max(120), client: z.string().max(120).nullable().optional(),
  clientVersion: z.string().max(60).nullable().optional(), transport: z.string().max(10).optional(), since: z.number().optional(), lastSeen: z.number().optional(), stream: z.boolean().optional() })).max(200) });
const openBody = z.object({ board_id: z.string().trim().min(1).max(80) }).strict();
const zAt = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
const sayOp = z.object({ kind: z.literal('say'), text: z.string().trim().min(1).max(4000) }).strict();
const addOp = z.object({ kind: z.literal('add_card'), workflow: z.string().trim().min(1).max(80), prompt: z.string().max(4000).optional(), name: z.string().trim().max(80).optional(), model: z.string().trim().max(120).optional(),
  settings: zSettings.optional(), inputs_from: z.array(z.string().trim().min(1)).max(30).optional(), at: zAt.optional() }).strict();
const updateOp = z.object({ kind: z.literal('update_card'), card_id: z.string().trim().min(1), workflow: z.string().trim().min(1).max(80).optional(), prompt: z.string().max(4000).optional(),
  model: z.string().trim().max(120).optional(), settings: zSettings.optional(), inputs_from: z.array(z.string().trim().min(1)).max(30).optional(), version: z.number().int().min(1).max(99).optional() }).strict();
const connectOp = z.object({ kind: z.literal('connect'), from_id: z.string().trim().min(1), to_id: z.string().trim().min(1) }).strict();
const removeOp = z.object({ kind: z.literal('remove_card'), card_id: z.string().trim().min(1) }).strict();
const proposeOp = z.object({ kind: z.literal('propose_run'), card_ids: z.array(z.string().trim().min(1)).min(1).max(30), note: z.string().max(2000).optional() }).strict();
const summaryOp = z.object({ kind: z.literal('summary') }).strict();
const NOTE_COLORS = ['orange', 'yellow', 'violet', 'light-violet', 'blue', 'light-blue', 'green', 'light-green', 'red', 'light-red', 'grey', 'black', 'white'] as const;
const noteOp = z.object({ kind: z.literal('add_note'), text: z.string().trim().min(1).max(600), at: zAt.optional(), color: z.enum(NOTE_COLORS).optional(), frame_id: z.string().trim().min(1).optional() }).strict();
const frameOp = z.object({ kind: z.literal('add_frame'), name: z.string().trim().min(1).max(80), at: zAt.optional(), w: z.number().finite().min(80).max(20_000).optional(), h: z.number().finite().min(80).max(20_000).optional(),
  around: z.array(z.string().trim().min(1)).min(1).max(60).optional() }).strict();
const moveIntoOp = z.object({ kind: z.literal('move_into'), ids: z.array(z.string().trim().min(1)).min(1).max(60), frame_id: z.string().trim().min(1) }).strict();
const pointOp = z.object({ kind: z.literal('point_at'), ids: z.array(z.string().trim().min(1)).min(1).max(30).optional(), at: zAt.optional(), text: z.string().trim().max(120).optional() }).strict(); // ids or at: the page says so when neither is given
const askPickOp = z.object({ kind: z.literal('ask_pick'), card_ids: z.array(z.string().trim().min(1)).min(2).max(12), text: z.string().trim().max(200).optional() }).strict();
const nextStepsOp = z.object({ kind: z.literal('next_steps'), card_id: z.string().trim().min(1) }).strict();
const fromJobOp = z.object({ kind: z.literal('add_from_job'), job_id: z.string().trim().min(1).max(80), out: z.number().int().min(0).max(99).optional(), at: zAt.optional() }).strict();
const zRef = z.string().trim().min(1).max(80);
const batchItem = z.object({ kind: z.enum(['add_card', 'add_note', 'add_frame', 'connect', 'move_into']), ref: z.string().trim().max(40).optional(),
  workflow: z.string().trim().max(80).optional(), prompt: z.string().max(4000).optional(), name: z.string().trim().max(80).optional(), model: z.string().trim().max(120).optional(), settings: zSettings.optional(),
  inputs_from: z.array(zRef).max(30).optional(), text: z.string().max(600).optional(), color: z.enum(NOTE_COLORS).optional(), frame: zRef.optional(),
  w: z.number().finite().min(80).max(20_000).optional(), h: z.number().finite().min(80).max(20_000).optional(), from_id: zRef.optional(), to_id: zRef.optional(),
  ids: z.array(zRef).max(60).optional(), frame_id: zRef.optional(), at: zAt.optional() }).strict();
const batchOp = z.object({ kind: z.literal('batch'), items: z.array(batchItem).min(1).max(BATCH_MAX), note: z.string().max(200).optional() }).strict(); /* the batch rules (refs, order, all or nothing) are validateBatch, checked in executePublicOp before anything reaches the page */
const reviewOp = z.object({ kind: z.literal('review_versions'), say: z.string().trim().max(1200).optional(), cards: z.array(z.object({ card_id: z.string().trim().min(1),
  reviews: z.array(z.object({ version: z.number().int().min(1).max(99), verdict: z.enum(['fits', 'check']), reason: z.string().trim().max(160).optional() }).strict()).min(1).max(24),
  recommend: z.number().int().min(1).max(99).nullable().optional() }).strict()).min(1).max(30) }).strict();
export const opSchema = z.discriminatedUnion('kind', [sayOp, addOp, updateOp, connectOp, removeOp, proposeOp, summaryOp, noteOp, frameOp, moveIntoOp, pointOp, askPickOp, nextStepsOp, batchOp, reviewOp, fromJobOp]);
const opsBody = z.object({ ops: z.array(opSchema).min(1).max(20) }).strict();
const resultBody = z.object({ id: z.string().min(1), ok: z.boolean(), result: z.any().optional(), error: z.string().max(4000).optional() }).strict();
const zSel = z.object({ id: z.string().trim().min(1).max(80), name: z.string().trim().max(120).nullish(), type: z.string().trim().max(40).nullish(), workflow: z.string().trim().max(80).nullish(), status: z.string().trim().max(20).nullish() }).strict();
const messageBody = z.object({ text: z.string().trim().min(1).max(4000), /** the dock's "Looks good" button answers this ask */ confirm_id: z.string().trim().max(60).optional(),
  /** the cards you had selected when you typed: context for your agent */ selection: z.array(zSel).max(50).optional() }).strict();
const decisionBody = z.object({ decision: z.enum(['go', 'cancel']) }).strict();
const userProposalBody = z.object({ card_ids: z.array(z.string().trim().min(1)).min(1).max(20), note: z.string().max(400).optional() }).strict();
const demoBody = z.object({ prompt: z.string().trim().min(1).max(4000), starter: z.string().max(40).optional() }).strict();
const pickBody = z.object({ pick_id: z.string().trim().min(1), card_id: z.string().trim().min(1), title: z.string().trim().max(140).optional() }).strict();
const zodText = (e: z.ZodError) => { const i = e.issues[0]; return i ? `${i.path.join('.') || 'body'}: ${i.message}` : 'Invalid request.'; };

// ---------------------------------------------------------------- workflows (the ids canvas_add_card accepts)
const BASE_WORKFLOWS: { id: string; medium: string; name: string; needs: string; tagline?: string; toolId: string }[] = [
  { id: 'create', medium: 'image', name: 'Create Image', needs: 'Prompt · images optional', tagline: 'Text to image, or edit with references', toolId: 'create-image' },
  { id: 'video', medium: 'video', name: 'Create Video', needs: 'Prompt · first / last frame optional', tagline: 'Video with sound, from text or frames', toolId: 'h3-video' },
  { id: 'transition', medium: 'video', name: 'Transitions', needs: '2 images', tagline: 'Animate from a start to an end image', toolId: 'app-transition' },
  { id: 'extend', medium: 'video', name: 'Extend', needs: '1 clip', tagline: 'Keep the shot going', toolId: 'h3-extend' },
  { id: 'video-upscale', medium: 'video', name: 'Video Upscale', needs: '1 clip', tagline: 'Sharper, larger clips, audio kept', toolId: 'upscale' },
  { id: 'lip-sync', medium: 'video', name: 'Lip Sync', needs: 'Portrait + speech', tagline: 'Make a portrait talk with a speech clip', toolId: 'voice' },
  { id: 'music', medium: 'audio', name: 'Music', needs: 'Prompt', tagline: 'Songs and beds from a prompt', toolId: 'audio' },
  { id: 'sfx', medium: 'audio', name: 'Sound Effects', needs: 'Prompt', tagline: 'A sound from a description', toolId: 'audio' },
  { id: 'voice', medium: 'audio', name: 'Text to Speech', needs: 'Script', tagline: 'Your script, read aloud', toolId: 'audio' },
  { id: 'image-to-3d', medium: '3d', name: 'Image to 3D', needs: '1 image', tagline: 'One image into a textured 3D model', toolId: 'three-d' },
];
/** The image recipe flows the canvas offers (the same list as web/src/shared/genFlows.ts; masks/angle sheets stay on their pages). */
const IMAGE_RECIPE_IDS = new Set(['relight', 'upscale', 'remove-bg', 'image-layers', 'expand', 'product-shot', 'character-sheet', 'face-swap', 'person-swap', 'try-on', 'material-swap']);
export function canvasWorkflows() {
  const out = BASE_WORKFLOWS.filter((f) => !!getTool(f.toolId));
  try {
    for (const w of imageWorkflowsPayload(getTool as any).workflows ?? []) {
      if (w.status !== 'ready' || !IMAGE_RECIPE_IDS.has(w.id) || !getTool(w.runner?.toolId)) continue;
      out.push({ id: w.id, medium: 'image', name: w.name, needs: w.needs, tagline: w.tagline, toolId: w.runner.toolId });
    }
  } catch { /* the image recipes are optional here */ }
  return out;
}

// ---------------------------------------------------------------- dispatch to the open page
function latestClient(boardId: string): AgentClient | null { const s = states.get(boardId); if (!s?.clients.size) return null; return [...s.clients.values()].at(-1) ?? null; }
function sendOp(boardId: string, op: InternalOp, timeoutMs: number, onResult?: (r: OpResult) => void): Promise<OpResult> {
  const client = latestClient(boardId);
  if (!client) return Promise.resolve({ ok: false, error: 'Open the board in the app first.', code: 'canvas_not_open' });
  const id = uid('op');
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      const r: OpResult = { ok: false, error: 'The canvas did not answer. Is the board still open?', code: 'canvas_timeout' };
      onResult?.(r); resolve(r);
    }, timeoutMs);
    pending.set(id, { boardId, clientId: client.id, timer, resolve, onResult });
    try { client.res.write(`event: op\ndata: ${JSON.stringify({ id, op })}\n\n`); }
    catch {
      clearTimeout(timer); pending.delete(id);
      const r: OpResult = { ok: false, error: 'The board closed before the canvas answered.', code: 'canvas_closed' };
      onResult?.(r); resolve(r);
    }
  });
}

// ---------------------------------------------------------------- prices and summaries from a saved snapshot
export function priceOfQuote(q: any): PriceView | null {
  if (!q || typeof q !== 'object') return null;
  const cost = q.cost && typeof q.cost === 'object' ? q.cost : null;
  const usd = q.runnable === false && q.demo !== true ? null /* can't run here: no price, never '$0.00' (the quote's credits are null; cost.estUsd is 0) */ : typeof cost?.estUsd === 'number' ? cost.estUsd : typeof q.credits === 'number' ? q.credits / 100 : null;
  const local = q.localRun === true || cost?.billedTo === 'local';
  const demo = q.demo === true;
  return { usd: usd == null ? null : r4(usd), credits: typeof q.credits === 'number' ? q.credits : null,
    label: demo ? 'Sample' : local ? 'Free' : usd != null ? `≈ $${usd.toFixed(2)}` : null, demo, local, runnable: q.runnable !== false };
}
/** Plain text of a tldraw rich text value (tiptap JSON). */
export function richTextPlain(rt: any): string { if (!rt || typeof rt !== 'object') return ''; if (typeof rt.text === 'string') return rt.text; return (Array.isArray(rt.content) ? rt.content.map(richTextPlain).join(rt.type === 'doc' ? '\n' : '') : '').trim(); }
/** The saved board as the same node list the live page returns (used when no page is open). */
export function summarizeSnapshot(snapshot: any): BoardNode[] {
  const store = (snapshot as any)?.store ?? (snapshot as any)?.document?.store ?? {};
  if (!store || typeof store !== 'object') return [];
  const records = Object.values(store) as any[];
  const shapes = records.filter((r) => r?.typeName === 'shape');
  const bindings = records.filter((r) => r?.typeName === 'binding' && r?.type === 'arrow');
  const start = new Map<string, string>(); const end = new Map<string, string>();
  for (const b of bindings) { const t = b?.props?.terminal; if (t === 'start' && b.fromId && b.toId) start.set(b.fromId, b.toId); else if (t === 'end' && b.fromId && b.toId) end.set(b.fromId, b.toId); }
  const inputsOf = (id: string) => [...end.entries()].filter(([, to]) => to === id).map(([arrow]) => start.get(arrow)).filter((x): x is string => !!x);
  const nodes: BoardNode[] = [];
  for (const s of shapes.sort((a, b) => String(a.index ?? '').localeCompare(String(b.index ?? '')))) {
    const p = s.props ?? {};
    if (s.type === 'ohf-gen') {
      nodes.push({ id: s.id, type: 'card', kind: p.medium ?? null, workflow: p.flow ?? null, model: p.model || p.provider || null, prompt: p.prompt ?? '',
        name: typeof s.meta?.name === 'string' ? s.meta.name : null, title: String(s.meta?.name || p.prompt || p.flow || 'Card').slice(0, 100), status: p.status ?? null, inputs: inputsOf(s.id), missing: null,
        results: (p.takes ?? []).filter((t: any) => t?.url).map((t: any) => ({ url: t.url, kind: t.kind ?? null, poster: t.poster ?? null })),
        price: priceOfQuote(p.quote), jobId: p.jobId || null });
    } else if (s.type === 'ohf-result') {
      nodes.push({ id: s.id, type: 'result', kind: p.kind ?? null, title: p.title ?? null, model: p.model ?? null, results: p.url ? [{ url: p.url, kind: p.kind ?? null, poster: p.poster ?? null }] : [], jobId: p.jobId || null });
    } else if (s.type === 'image' || s.type === 'video') {
      const asset = p.assetId ? store[p.assetId] : null; const url = asset?.props?.src; if (!url) continue;
      nodes.push({ id: s.id, type: s.type === 'image' ? 'picture' : 'clip', kind: s.type, title: asset?.props?.name ?? s.type, results: [{ url, kind: s.type }] });
    } else if (s.type === 'note' || s.type === 'text') {
      const t = richTextPlain(p.richText); if (t) nodes.push({ id: s.id, type: 'note', kind: s.type, title: t.slice(0, 600), by: s.meta?.by === 'agent' ? 'agent' : 'you', frame: String(s.parentId ?? '').startsWith('shape:') ? s.parentId : null });
    } else if (s.type === 'frame') {
      nodes.push({ id: s.id, type: 'frame', kind: 'frame', title: String(p.name || 'Frame'), children: shapes.filter((c) => c.parentId === s.id).map((c) => c.id) });
    }
  }
  return nodes;
}

// ---------------------------------------------------------------- live summary via the page
async function liveSummary(boardId: string): Promise<{ nodes: BoardNode[]; live: boolean } | null> {
  if (!hasCanvas(boardId)) return null;
  const r = await sendOp(boardId, { kind: 'summary' }, SUMMARY_TIMEOUT_MS);
  return r.ok ? { nodes: Array.isArray(r.result?.nodes) ? r.result.nodes : [], live: true } : null;
}

// ---------------------------------------------------------------- ops
async function executePublicOp(boardId: string, op: Op, req: FastifyRequest | null, by: 'mcp' | 'demo' = 'mcp'): Promise<OpResult> {
  if (op.kind === 'say') {
    if (by === 'mcp') answeredPushed(boardId); /* it answered: messages a channel pushed to it are read */
    const message = addMessage(boardId, 'agent', op.text, { meta: { by } });
    return { ok: true, result: { message } };
  }
  if (op.kind === 'summary') {
    const nodes = await liveSummary(boardId);
    return nodes ? { ok: true, result: nodes } : { ok: false, error: 'Open the board in the app first.', code: 'canvas_not_open' };
  }
  if (op.kind === 'propose_run') return proposeRun(boardId, op, req);
  if (op.kind === 'ask_pick') {
    if (!hasCanvas(boardId)) return { ok: false, error: 'Open the board in the app first.', code: 'canvas_not_open' };
    const pick = startPick(boardId, op.card_ids, op.text?.trim() || 'Pick the one you like.', by);
    addMessage(boardId, 'agent', pick.text, { meta: { by, pick: { id: pick.id, cardIds: pick.cardIds } } });
    return { ok: true, result: { pick } };
  }
  if (op.kind === 'review_versions') {
    /* reviews only label versions: the page sets the badges and the recommendation, never the active version (you still choose) */
    const r = await sendOp(boardId, { ...op, by: by === 'demo' ? (op as any).by ?? 'checks' : 'agent' } as any, OP_TIMEOUT_MS); if (!r.ok) return r;
    if (op.say) addMessage(boardId, 'agent', op.say, { meta: { by, review: true } });
    return r;
  }
  if (op.kind === 'batch') {
    const why = validateBatch(op.items); if (why) return { ok: false, error: why, code: 'invalid_batch' };
    const r = await sendOp(boardId, op, BATCH_TIMEOUT_MS); if (!r.ok) return r;
    const cards: any[] = Array.isArray(r.result?.cards) ? r.result.cards : [];
    addActivity(boardId, String(r.result?.line ?? batchLine({ cards: cards.length, notes: (r.result?.notes ?? []).length, frames: (r.result?.frames ?? []).length })), { cardId: cards[0]?.id, meta: { tool: 'batch', by, cardIds: cards.map((c) => c.id), note: op.note ?? null } });
    return r;
  }
  if (op.kind === 'add_from_job') {
    /* checked here first, so the agent hears a plain reason without a round trip to the page */
    const j = jobs.get(op.job_id); if (!j) return { ok: false, error: `No generation with id "${op.job_id}". Use history or search_references for the ids.`, code: 'job_not_found' };
    if (j.status !== 'done') return { ok: false, error: `That generation is ${j.status === 'running' || j.status === 'queued' ? 'still running' : j.status}: only finished ones can go on the board.`, code: 'job_not_done' };
    const outs = (j.outputs ?? []).filter((o) => o?.url); const n = op.out ?? 0;
    if (!outs.length && !(j as any).resultUrl) return { ok: false, error: 'That generation has no file to place.', code: 'job_no_output' };
    if (n > 0 && n >= outs.length) return { ok: false, error: `That generation has ${outs.length} output${outs.length === 1 ? '' : 's'}: use out 0${outs.length > 1 ? `–${outs.length - 1}` : ''}.`, code: 'invalid_out' };
    const r = await sendOp(boardId, op, OP_TIMEOUT_MS); if (!r.ok) return r;
    const node = r.result?.node ?? null;
    addActivity(boardId, node?.title ? `Placed “${String(node.title).slice(0, 48)}”` : 'Placed a generation', { cardId: node?.id ?? r.result?.id, meta: { tool: 'add_from_job', by, jobId: op.job_id } });
    return r;
  }
  const r = await sendOp(boardId, op, OP_TIMEOUT_MS);
  if (!r.ok) return r;
  const card = r.result?.card ?? null; const arrowId = r.result?.arrowId ?? null;
  /* the dock draws an add as a media card: the meta carries what it needs before the page answers a summary */
  if (op.kind === 'add_card') addActivity(boardId, card?.title ? `Added “${String(card.title).slice(0, 48)}”` : `Added a ${card?.workflowName ?? op.workflow} card`,
    { cardId: card?.id, meta: { tool: 'add_card', by, workflow: card?.workflow ?? op.workflow, workflowName: card?.workflowName ?? null, model: card?.model ?? null, kind: card?.kind ?? null, price: card?.price ?? null } });
  else if (op.kind === 'update_card') addActivity(boardId, card?.title ? `Updated “${String(card.title).slice(0, 48)}”` : 'Updated a card', { cardId: op.card_id });
  else if (op.kind === 'connect') addActivity(boardId, `Connected “${r.result?.fromTitle ?? 'a card'}” → “${r.result?.toTitle ?? 'a card'}”`, { cardId: r.result?.toId ?? op.to_id, fromId: op.from_id, toId: op.to_id });
  else if (op.kind === 'remove_card') addActivity(boardId, r.result?.title ? `Removed “${String(r.result.title).slice(0, 48)}”` : 'Removed a card', { cardId: op.card_id });
  else if (op.kind === 'add_note') addActivity(boardId, `Added a note: “${op.text.replace(/\s+/g, ' ').slice(0, 60)}${op.text.length > 60 ? '…' : ''}”`, { cardId: r.result?.id, meta: { tool: 'add_note', by } });
  else if (op.kind === 'add_frame') addActivity(boardId, `Made a frame: ${op.name}`, { cardId: r.result?.id, meta: { tool: 'add_frame', by } });
  else if (op.kind === 'move_into') { const n = Number(r.result?.moved ?? op.ids.length); addActivity(boardId, `Put ${n} card${n === 1 ? '' : 's'} in ${r.result?.frameName ?? 'the frame'}`, { cardId: op.frame_id, meta: { tool: 'move_into', by } }); }
  /* point_at is only a gesture on the board and next_steps only reads: no feed row */
  return { ok: true, result: { ...r.result, ...(arrowId ? { arrowId } : {}) } };
}

async function proposeRun(boardId: string, op: { card_ids: string[]; note?: string }, req: FastifyRequest | null, by: 'mcp' | 'demo' | 'user' = 'mcp'): Promise<OpResult> {
  const budget = req ? budgetOfRequest(req) : null;
  if (budget && 'error' in budget) return { ok: false, error: budget.error, code: 'agent_budget_unknown' };
  const r = await sendOp(boardId, { kind: 'propose_run', card_ids: op.card_ids, note: op.note }, OP_TIMEOUT_MS);
  if (!r.ok) return r;
  const data = r.result ?? {};
  const items: ProposalItem[] = (Array.isArray(data.items) ? data.items : []).map((x: any) => ({
    cardId: String(x.cardId ?? ''), title: String(x.title ?? 'Card').slice(0, 140), workflow: String(x.workflow ?? ''), model: x.model ? String(x.model) : null,
    status: String(x.status ?? 'draft'), usd: typeof x.usd === 'number' ? r4(x.usd) : null, credits: typeof x.credits === 'number' ? x.credits : null,
    quote: x.quote ?? null, problem: x.problem ? String(x.problem) : (x.missing ? String(x.missing) : null),
  }));
  if (!items.length) return { ok: false, error: 'None of those cards could be priced. Add a card first.', code: 'no_cards' };
  const runs = items.filter((i) => !i.problem); const skipped = items.filter((i) => !!i.problem).map((i) => ({ cardId: i.cardId, title: i.title, problem: i.problem! }));
  const totalUsd = r4(runs.reduce((s, i) => s + (i.usd ?? 0), 0)); const totalCredits = runs.reduce((s, i) => s + (i.credits ?? 0), 0); // only what Go starts
  const bv = budget && !('error' in budget) ? budgetView(budget as AgentBudget) : null;
  const budgetViewOut: ProposalBudget | null = bv ? { id: bv.id, name: bv.name, budgetUsd: bv.budgetUsd, remainingUsd: bv.remainingUsd, spentUsd: bv.spentUsd, budgetCredits: bv.budgetCredits, remainingCredits: bv.remainingCredits } : null;
  const overBy = budgetViewOut?.remainingUsd != null ? r4(Math.max(0, totalUsd - budgetViewOut.remainingUsd)) : null;
  const over = overBy != null && overBy > 1e-9;
  const reason = over
    ? `This is $${overBy!.toFixed(2)} over the $${(budgetViewOut!.remainingUsd ?? 0).toFixed(2)} left in the agent budget. Nothing will run.`
    : !runs.length ? (skipped.length === 1 ? skipped[0].problem : `None of these cards can run here. ${skipped[0].problem}`) : null;
  const proposal: Proposal = { id: uid('prop'), boardId, cardIds: op.card_ids, note: op.note?.trim() || null, items, totalUsd, totalCredits,
    budget: budgetViewOut, overBudget: over, overByUsd: overBy, reason, runCardIds: runs.map((i) => i.cardId), skipped, status: 'pending', createdAt: now(), decidedAt: null, jobIds: [], error: null };
  rememberProposal(proposal);
  addActivity(boardId, `Proposed ${runs.length} run${runs.length === 1 ? '' : 's'} · $${totalUsd.toFixed(2)}${skipped.length ? ` · ${skipped.length} skipped` : ''}`, { proposalId: proposal.id, meta: { tool: 'propose_run', by } });
  return { ok: true, result: { proposal } };
}

function finishRunProposal(p: Proposal, r: OpResult) {
  if (r.ok) { p.status = 'approved'; p.jobIds = Array.isArray(r.result?.jobIds) ? r.result.jobIds : []; const failed: any[] = Array.isArray(r.result?.failed) ? r.result.failed : [];
    p.error = failed.length ? `${failed.length} card${failed.length === 1 ? '' : 's'} didn’t start: ${String(failed[0]?.error ?? 'refused')}` : null; // the others still ran
    p.failedIds = failed.map((f) => String(f?.cardId ?? '')).filter(Boolean);
    addActivity(p.boardId, `Started ${p.jobIds.length} run${p.jobIds.length === 1 ? '' : 's'}${failed.length ? ` · ${failed.length} didn’t start` : ''}`, { proposalId: p.id }); }
  else { p.status = 'failed'; p.jobIds = Array.isArray(r.result?.jobIds) ? r.result.jobIds : []; p.error = r.error || 'The runs could not start.'; p.failedIds = [...(p.runCardIds ?? p.cardIds)]; addActivity(p.boardId, `Could not start the runs: ${p.error}`, { proposalId: p.id }); }
  p.decidedAt ??= now(); updateProposal(p);
}

// ---------------------------------------------------------------- the demo's models: the tool's own default
/* The demo never names a model id (2026-10-27): a hard-coded or first-in-list model may not be on this machine (FLUX 3 Klein on a fresh
   clone stopped the 30s film). Each card gets the Canvas cloud default (shared/cloudDefaults.ts canvasDefaultModel: GPT Image 2.5 Flare,
   MiniMax H3, …), the same pick a new card on the page makes; the user's own pick wins, and a cloud model that can't start here gives way to
   the tool's default from the shared resolver (routing/defaults.ts toolDefaults), for the mode the card runs in. Sound cards keep the page's own default
   (genFlows.audioCardDefault reads the same resolver and skips lyrics-only models, which a card can't feed). */
const DEMO_MODE: Record<string, (withInputs: boolean) => string> = { create: (i) => (i ? 'edit' : 'generate'), video: (i) => (i ? 'i2v' : 't2v'), transition: () => 'flf', extend: () => 'extend' };
export function demoDefaultModel(workflow: string, withInputs: boolean): string | undefined {
  try {
    const wf = canvasWorkflows().find((w) => w.id === workflow); const tool = wf ? getTool(wf.toolId) : null; const pick = DEMO_MODE[workflow];
    if (!tool || !pick || wf!.medium === 'audio') return undefined;
    const modes = toolModes(tool); const want = pick(withInputs); const mode = modes.includes(want) ? want : null;
    const D = toolDefaults(tool, { mode }); // cloud first on the canvas (shared/cloudDefaults.ts CANVAS_DEFAULTS): the same pick a new card makes
    return canvasDefaultModel(workflow, mode, { source: D.defaultSource ?? null, toolDefault: D.defaultProvider, state: (id) => D.models.find((m) => m.id === id) }) ?? undefined;
  } catch { return undefined; }
}
/** A demo op; an add_card the page can't place with the resolver's model (not on this page's list) goes again with the page's own default. */
async function demoOp(boardId: string, o: Op): Promise<OpResult> {
  const w = withDefaultModel(o); const r = await executePublicOp(boardId, w, null, 'demo');
  if (r.ok || !/unknown model/i.test(r.error)) return r;
  /* a demo card names the model that made its sample (shared/demoMedia.ts); a page without that model gets its own default */
  const bare: Op = o.kind === 'batch' ? { ...o, items: o.items.map(({ model: _m, ...it }) => it) } : o.kind === 'add_card' ? (({ model: _m, ...x }) => x)(o) : o;
  return w !== o || bare !== o ? executePublicOp(boardId, withDefaultModel(bare), null, 'demo') : r;
}
const withDefaultModel = (o: Op): Op => {
  if (o.kind === 'batch') { let changed = false; const items = o.items.map((it) => { if (it.kind !== 'add_card' || it.model || !it.workflow) return it; const m = demoDefaultModel(it.workflow, !!it.inputs_from?.length); if (!m) return it; changed = true; return { ...it, model: m }; }); return changed ? { ...o, items } : o; }
  return o.kind === 'add_card' && !o.model ? (() => { const m = demoDefaultModel(o.workflow, !!o.inputs_from?.length); return m ? { ...o, model: m } : o; })() : o;
};

// ---------------------------------------------------------------- the built-in demo agent (canvasDemo.ts plans)
/* One demo run per board. It plays a plan through executePublicOp / proposeRun (the MCP path), waits for the user's Go on every
   proposal, and waits for the cards to finish before the next phase. Stop (or closing the board) ends it; nothing is undone. */
interface DemoRun { id: string; boardId: string; stop: boolean; title: string }
const demos = new Map<string, DemoRun>();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DEMO_STEP_MS = Number(process.env.OPENHIGGSFIELD_DEMO_STEP_MS ?? 420);
export const demoState = (boardId: string) => { const d = demos.get(boardId); return d ? { running: true, runId: d.id, title: d.title } : { running: false, runId: null, title: null }; };
/** ' I’ll skip “Cinematic score…”: MiniMax Music 3 isn’t available on this server yet.' (empty when every card runs) */
export function skipNote(p: Pick<Proposal, 'skipped'>): string {
  if (!p.skipped?.length) return '';
  const t = (x: { title: string }) => `“${x.title.length > 40 ? `${x.title.slice(0, 39)}…` : x.title}”`;
  return p.skipped.length === 1 ? ` I’ll skip ${t(p.skipped[0])}: ${p.skipped[0].problem.replace(/\.?$/, '.')}` : ` I’ll skip ${p.skipped.length} cards that can’t run here (${p.skipped.map(t).join(', ')}).`;
}
/** The run's price in the same words the dock and the cards use (shared/modelIds LOCAL_FREE, GenPrice's 'Sample', '≈ $0.42'). */
export function priceWords(p: Pick<Proposal, 'items' | 'totalUsd' | 'runCardIds'>): string {
  const run = new Set(p.runCardIds ?? []); const quotes = p.items.filter((i) => !i.problem && (!run.size || run.has(i.cardId))).map((i) => i.quote);
  if (quotes.length && quotes.every((q) => q?.demo === true)) return 'Sample: nothing is charged';
  if (p.totalUsd <= 0) return quotes.length && quotes.every((q) => q?.localRun === true || q?.cost?.billedTo === 'local') ? LOCAL_FREE : 'Free';
  return `≈ $${p.totalUsd.toFixed(2)}`;
}
const firstSentence = (t: string) => (t.split(/(?<=[.!?])\s/)[0] ?? t).replace(/[.!?]+$/, '').trim();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/* A card's state after Go: 'draft' means it never started (the server refused it), so it counts as finished-without-a-result: the demo
   never waits on it (the old wait loop sat on such a card for 15 minutes, showing "Working on the board…"). */
const settled = (st: string) => st === 'done' || st === 'failed' || st === 'gone' || st === 'draft';

async function runDemo(run: DemoRun, plan: DemoPlan) {
  const { boardId } = run;
  const say = (text: string, meta: Record<string, unknown> = {}) => addMessage(boardId, 'agent', text, { meta: { by: 'demo', runId: run.id, ...meta } });
  const alive = () => !run.stop && hasCanvas(boardId);
  /* a short think beat before each step, so the board builds at a pace you can follow */
  const op = async (o: Op): Promise<OpResult | null> => { await wait(Math.round(DEMO_STEP_MS * 0.55)); if (!alive()) return null; return demoOp(boardId, o); };
  let steps = 0; const runProposals = new Set<string>();
  try {
    say(plan.intro, { plan: plan.steps, title: plan.title });
    await wait(DEMO_STEP_MS * 1.4);
    const size = demoPlanSize(plan);
    const area = await sendOp(boardId, { kind: 'free_area', w: size.w, h: size.h }, OP_TIMEOUT_MS);
    const base = area.ok && Number.isFinite(area.result?.x) && Number.isFinite(area.result?.y) ? { x: Number(area.result.x), y: Number(area.result.y) } : { x: 0, y: 0 };
    const off = demoGridOffset(); const origin = { x: base.x + off.x, y: base.y + off.y };
    /* the idea first, as a sticky note: the board reads as a plan from the first second */
    if (!(await op({ kind: 'add_note', text: plan.idea, at: demoNoteAt(origin), color: 'orange' }))) return;
    const ids: Record<string, string> = {}; const cardOf: Record<string, DemoCard> = {};
    let picked: string | null = null;
    for (const phase of plan.phases) {
      if (!alive()) return;
      say(phase.say);
      const fb = demoFrameOf(origin, phase);
      const fr = await op({ kind: 'add_frame', name: phase.frame, at: { x: fb.x, y: fb.y }, w: fb.w, h: fb.h }); if (!fr) return;
      const frameId = fr.ok ? String(fr.result?.id ?? '') : '';
      const phaseIds: string[] = []; const placed: string[] = [];
      for (const u of phase.uploads ?? []) { /* the plan's own pictures (Upload nodes): nothing to run, they feed the cards */
        await wait(Math.round(DEMO_STEP_MS * 0.55)); if (!alive()) return;
        const r = await sendOp(boardId, { kind: 'add_upload', url: u.url, name: u.name, at: demoCardAt(origin, u.col, u.row) }, OP_TIMEOUT_MS);
        const id = r.ok ? String(r.result?.id ?? '') : ''; if (!id) { say(`I couldn’t add ${u.name}: ${r.ok ? 'the board didn’t answer' : r.error.replace(/\.$/, '')}. I’ll carry on without it.`, { error: true }); continue; }
        ids[u.key] = id; placed.push(id); addActivity(boardId, `Added “${u.name}”`, { cardId: id, meta: { tool: 'add_upload', by: 'demo' } });
      }
      for (const c of phase.cards) {
        if (!alive()) return;
        const from = (c.from ?? []).map((k) => (k === '@pick' ? picked : ids[k])).filter((x): x is string => !!x);
        const pickedCard = picked ? cardOf[picked] : null;
        const prompt = c.prompt.replace('{pick}', pickedCard ? firstSentence(pickedCard.prompt) : 'the key moment');
        if (c.ref) tagDemoCard(boardId, prompt, c.ref); /* the sample server plays this card's real run (shared/demoMedia.ts) */
        const r = await op({ kind: 'add_card', workflow: c.workflow, prompt, name: c.name, at: demoCardAt(origin, c.col, c.row), ...(c.settings ? { settings: c.settings } : {}), ...(from.length ? { inputs_from: from } : {}), ...(demoProviderOf(c.ref) ? { model: demoProviderOf(c.ref) } : {}) });
        if (!r) return;
        /* fail kindly: one card that can't go on the board doesn't end the plan */
        const id = r.ok ? String(r.result?.card?.id ?? '') : '';
        if (!id) { say(`I couldn’t add ${c.name}: ${r.ok ? 'the board didn’t answer' : r.error.replace(/\.$/, '')}. I’ll carry on without it.`, { error: true }); continue; }
        ids[c.key] = id; cardOf[id] = c; phaseIds.push(id);
      }
      if (!alive()) return;
      if (!phaseIds.length) { say('None of these cards made it onto the board, so I’ll stop here. Nothing was charged.', { error: true }); return; }
      if (frameId) await op({ kind: 'move_into', ids: [...placed, ...phaseIds], frame_id: frameId });
      if (!alive()) return;
      const pr = await proposeRun(boardId, { card_ids: phaseIds, note: phase.note }, null, 'demo');
      if (!pr.ok) { say(`I couldn’t price these cards: ${pr.error.replace(/\.$/, '')}. They stay on the board as drafts.`, { error: true }); return; }
      const p: Proposal = pr.result.proposal; runProposals.add(p.id);
      if (!p.runCardIds.length) { say(`None of these can run here yet: ${String(p.reason ?? 'no model for them on this server').replace(/\.$/, '')}. They stay on the board as drafts.`, { error: true }); return; }
      const nRuns = p.items.filter((i) => p.runCardIds.includes(i.cardId)).reduce((a, i) => a + (Number(i.quote?.runs) > 1 ? Number(i.quote.runs) : 1), 0); /* a Material Swap card runs once per swatch */
      /* every paid step is its own decision: a later step says plainly it is a new run, and nothing goes on until its own Go */
      const k = plan.phases.indexOf(phase); const n = plan.phases.length;
      say(k > 0 ? `Step ${k + 1} of ${n} is a new run: ${plural(nRuns, 'run')} (${priceWords(p)}).${skipNote(p)} Nothing runs until you press Go. Cancel stops here.`
        : `That’s ${plural(nRuns, 'run')} (${priceWords(p)}).${skipNote(p)} Press Go when you’re ready, or Cancel.`, { proposalId: p.id, waiting: true });
      /* the decision route changes this same object (proposalsById holds it) */
      while (p.status === 'pending' && alive()) await wait(250);
      if (!alive()) return; /* Stop says its own one line */
      if (p.status === 'cancelled') { say('Stopped there. Nothing ran. The cards stay on the board as drafts.', { stopped: true }); return; }
      while (p.status === 'running' && alive()) await wait(250);
      if (!alive()) return;
      const refused = new Set(p.failedIds ?? []); const started = p.runCardIds.filter((id) => !refused.has(id));
      if (!started.length) { say(`Those didn’t start: ${String(p.error ?? 'the server said no').replace(/\.$/, '')}. Nothing was charged. The cards stay as drafts, so you can try again from each one.`, { error: true }); return; }
      if (refused.size) say(`${plural(refused.size, 'card')} didn’t start, so nothing was charged for ${refused.size === 1 ? 'it' : 'them'}. I’ll carry on with the rest.`, { error: true });
      const until = Date.now() + 15 * 60_000; let states: string[] = [];
      while (alive() && Date.now() < until) {
        const sum = await sendOp(boardId, { kind: 'summary' }, SUMMARY_TIMEOUT_MS);
        if (sum.ok) {
          const nodes: any[] = Array.isArray(sum.result?.nodes) ? sum.result.nodes : [];
          states = started.map((id) => nodes.find((n) => n.id === id)?.status ?? 'gone');
          if (states.every(settled)) break;
        }
        await wait(1500);
      }
      if (!alive()) return;
      const failed = states.filter((x) => x === 'failed').length;
      say(phase.done + (failed ? ` ${plural(failed, 'card')} didn’t finish; Re-roll ${failed === 1 ? 'it' : 'them'} from the card.` : ''), { stepsDone: ++steps });
      if (phase.spread && ids[phase.spread.card]) { /* the versions side by side, then a Compare card (before / after) */
        await wait(Math.round(DEMO_STEP_MS * 0.8)); if (!alive()) return;
        const rows = Math.max(...[...phase.cards, ...(phase.uploads ?? [])].map((c) => c.row)) + 1;
        const sp = await sendOp(boardId, { kind: 'spread_versions', card_id: ids[phase.spread.card], ...(phase.spread.compare && ids[phase.spread.compare] ? { from_id: ids[phase.spread.compare] } : {}), at: { x: origin.x, y: origin.y + rows * DEMO_GRID.rowH + 230 } }, OP_TIMEOUT_MS * 2);
        if (sp.ok) { const n = Array.isArray(sp.result?.ids) ? sp.result.ids.length : 0; addActivity(boardId, `Placed ${plural(n, 'result')} side by side${sp.result?.compare ? ', and a Compare card' : ''}`, { cardId: sp.result?.ids?.[0], meta: { tool: 'spread_versions', by: 'demo' } }); }
        else say(`I couldn’t lay the results out: ${sp.error.replace(/\.$/, '')}. They’re all on the card’s version strip.`, { error: true });
      }
      if (phase.pick) {
        const ready = started.filter((_, i) => states[i] === 'done');
        if (ready.length >= 2) {
          await wait(Math.round(DEMO_STEP_MS * 0.8)); if (!alive()) return;
          const pk = startPick(boardId, ready, phase.pick, 'demo');
          say(phase.pick, { pick: { id: pk.id, cardIds: pk.cardIds }, waiting: true });
          while (pk.status === 'waiting' && alive()) await wait(200);
          if (!alive() || pk.status !== 'picked' || !pk.chosen) return;
          picked = pk.chosen;
          say(`Nice pick: ${cardOf[picked]?.name ?? 'that one'}. Only your pick goes on, so less is spent.`, { stepsDone: ++steps, picked });
        } else if (ready.length === 1) {
          picked = ready[0]; say(`Only ${cardOf[picked]?.name ?? 'one card'} finished, so I’ll go on with that one.`, { stepsDone: ++steps, picked });
        } else { say('None of them finished, so there’s nothing to pick yet. Re-roll a card, then ask me again.', { error: true }); return; }
      }
      await wait(DEMO_STEP_MS);
    }
    say(plan.outro, { stepsDone: plan.steps.length, finished: true });
  } catch (e) {
    say(`Something went wrong on my side: ${(e as Error).message}. Everything on the board stays.`, { error: true });
  } finally {
    if (demos.get(boardId) === run) demos.delete(boardId);
    endPick(boardId);
    /* a quote this run left waiting can't start anything later (the plan is over): close it, so no stale Go stays in the dock */
    for (const p of stateOf(boardId).proposals.values()) if (p.status === 'pending' && runProposals.has(p.id)) { p.status = 'cancelled'; p.decidedAt = now(); updateProposal(p); }
    broadcast(boardId, 'demo', demoState(boardId));
  }
}


// ---------------------------------------------------------------- "Short film from idea" (canvasDemo.shortFilmPlan)
let appRef: FastifyInstance | null = null;
const YES = /^\s*(looks good|look good|lgtm|good|great|perfect|nice|yes|yep|yeah|ok(ay)?|go( on)?|continue|next|carry on|do it|let'?s go)\b/i;
/** The one source of truth for the short film run's words on a card the agent made. */
async function liveNodes(boardId: string): Promise<any[] | null> { const r = await sendOp(boardId, { kind: 'summary' }, SUMMARY_TIMEOUT_MS); return r.ok && Array.isArray(r.result?.nodes) ? r.result.nodes : null; }

async function runShortFilm(run: DemoRun, plan: ShortPlan) {
  /* the chip on the sample server: its clip cards play the real clips, so they run even while video runs are off */
  const { boardId } = run; const demo = plan.demo ?? null; const videoOn = shortFilmVideoOn() || (!!demo && config.backend === 'mock');
  /* a card that shows a real run: tagged (board + prompt), and named with the model that made it */
  const tag = (prompt: string, key: string) => { tagDemoCard(boardId, prompt, `short:${key}`); const m = demoProviderOf(`short:${key}`); return m ? { model: m } : {}; };
  const say = (text: string, meta: Record<string, unknown> = {}) => addMessage(boardId, 'agent', text, { meta: { by: 'demo', runId: run.id, ...meta } });
  const alive = () => !run.stop && hasCanvas(boardId);
  const op = async (o: Op): Promise<OpResult | null> => { await wait(Math.round(DEMO_STEP_MS * 0.55)); if (!alive()) return null; return demoOp(boardId, o); };
  const idOf = (r: OpResult | null) => (r && r.ok ? String(r.result?.card?.id ?? r.result?.id ?? '') : '');
  const runProposals = new Set<string>(); let steps = 0;
  /* the beats as they read on the board, and the key frame each one drew (so an edit later rewrites that card) */
  let beatIds: string[] = []; let beatsFrame = ''; const keyOfBeat = new Map<string, { cardId: string; text: string; i: number }>();
  /** A beat edited after its key frame exists: rewrite that card's prompt (its versions stay) and say so. Runs on every wait tick. */
  const syncBeats = async (nodes: any[] | null) => {
    if (!nodes || !keyOfBeat.size) return;
    for (const [noteId, k] of keyOfBeat) { const n = nodes.find((x) => x.id === noteId); const card = nodes.find((x) => x.id === k.cardId); if (!n || !card) continue;
      const text = String(n.title ?? '').trim(); if (!text || text === k.text) continue;
      const beat = beatOfNote(text, k.i); k.text = text;
      const r = await executePublicOp(boardId, { kind: 'update_card', card_id: k.cardId, prompt: keyFramePrompt(plan.subject, beat) }, null, 'demo');
      if (r.ok) say(`Beat ${k.i + 1} changed, so I rewrote its key frame.${card.status === 'done' ? ' Its versions stay; Recreate makes one from the new beat.' : ''}`, { cardId: k.cardId }); }
  };
  /** Wait for the user's OK (the Looks good button, or a yes in their words). Anything else they type comes back as an edit. */
  const waitConfirm = async (text: string, label = 'Looks good', onTick?: () => Promise<void>): Promise<'ok' | { edit: string } | null> => {
    const s = stateOf(boardId); const id = uid('ok'); const from = s.seq; say(text, { confirm: { id, label }, waiting: true });
    let tick = 0;
    while (alive()) {
      const reply = s.feed.find((e) => e.seq > from && e.type === 'message' && e.from === 'user');
      if (reply) return reply.meta?.confirmId === id || YES.test(reply.text) ? 'ok' : { edit: reply.text };
      if (++tick % 8 === 0) { await syncBeats(await liveNodes(boardId)); if (onTick) await onTick(); }
      await wait(250);
    }
    return null;
  };
  /** The agent looks at each new version of these cards (free: sample reviews in the mock sandbox, else quick checks on this computer),
   *  badges them, and says which one it would pick per shot. It never picks for you. */
  const reviewed = new Map<string, number>();
  const reviewCards = async (ids: string[], aspect?: string | null) => {
    if (demo && config.backend === 'mock') return; /* the chip's cards are real runs: no made-up sample verdicts on them */
    const nodes = await liveNodes(boardId); if (!nodes || !alive()) return; const cards: any[] = []; const lines: string[] = []; const mode = reviewMode();
    for (const [k, id] of ids.entries()) {
      const n = nodes.find((x) => x.id === id); const urls: string[] = (n?.results ?? []).filter((r: any) => (r.kind ?? 'image') === 'image').map((r: any) => String(r.url));
      if (!urls.length || reviewed.get(id) === urls.length) continue;
      const reviews = await reviewVersions(urls, { shot: k, aspect, mode }); const rec = recommend(String(n?.name || `Card ${k + 1}`), reviews); reviewed.set(id, urls.length);
      cards.push({ card_id: id, reviews: reviews.map((r, v) => ({ version: v + 1, verdict: r.verdict, reason: r.reason })), recommend: rec.pick }); lines.push(rec.line);
    }
    if (!cards.length || !alive()) return;
    const rr = await sendOp(boardId, { kind: 'review_versions', cards, by: mode } as any, OP_TIMEOUT_MS); if (!rr.ok) return;
    const how = mode === 'sample' ? 'These are sample reviews in this demo.' : 'I used quick checks on your computer (light, shape, near-copies), so faces and story are yours to judge.';
    say(`I looked at each version. ${lines.join(' ')} ${how} You choose: the ringed version is the one that goes on.`, { review: true });
  };
  /** Price these cards as one proposal and wait for Go. Pressing Generate on every card yourself counts as a Go (you took over). */
  const goFor = async (ids: string[], note: string): Promise<{ started: string[] } | null> => {
    const pr = await proposeRun(boardId, { card_ids: ids, note }, null, 'demo');
    if (!pr.ok) { say(`I couldn’t price these cards: ${pr.error.replace(/\.$/, '')}. They stay on the board as drafts.`, { error: true }); return null; }
    const p: Proposal = pr.result.proposal; runProposals.add(p.id);
    if (!p.runCardIds.length) { say(`None of these can run here yet: ${String(p.reason ?? 'no model for them on this server').replace(/\.$/, '')}. They stay on the board as drafts.`, { error: true }); return null; }
    say(`That’s ${plural(p.runCardIds.length, 'run')} (${priceWords(p)}).${skipNote(p)} Press Go when you’re ready, or Generate on any card yourself.`, { proposalId: p.id, waiting: true });
    let tick = 0;
    while (p.status === 'pending' && alive()) {
      await wait(250);
      if (++tick % 8 === 0) { const nodes = await liveNodes(boardId); await syncBeats(nodes);
        if (nodes && p.status === 'pending' && p.runCardIds.every((id) => { const st = nodes.find((n) => n.id === id)?.status; return st === 'running' || st === 'done'; })) {
          p.status = 'cancelled'; p.decidedAt = now(); updateProposal(p); say('You started them yourself, so I closed my quote. I’ll carry on when they’re done.'); return { started: [...p.runCardIds] }; } }
    }
    if (!alive()) return null;
    if (p.status === 'cancelled') { say('Stopped there. Nothing ran. The cards stay on the board as drafts.', { stopped: true }); return null; }
    while (p.status === 'running' && alive()) await wait(250);
    if (!alive()) return null;
    const refused = new Set(p.failedIds ?? []); const started = p.runCardIds.filter((id) => !refused.has(id));
    if (!started.length) { say(`Those didn’t start: ${String(p.error ?? 'the server said no').replace(/\.$/, '')}. Nothing was charged.`, { error: true }); return null; }
    if (refused.size) say(`${plural(refused.size, 'card')} didn’t start, so nothing was charged for ${refused.size === 1 ? 'it' : 'them'}. I’ll carry on with the rest.`, { error: true });
    return { started };
  };
  /** Wait until these cards finish (done, failed or never started). Returns their states. */
  const settle = async (ids: string[]): Promise<string[] | null> => {
    const until = Date.now() + 20 * 60_000; let states: string[] = []; let drafts = 0;
    while (alive() && Date.now() < until) { const nodes = await liveNodes(boardId); await syncBeats(nodes);
      /* a draft counts as finished only once it stays a draft: a card wired from another card of this run starts when that one is done */
      if (nodes) { states = ids.map((id) => nodes.find((n) => n.id === id)?.status ?? 'gone'); if (states.every(settled) && (!states.includes('draft') || ++drafts >= 4)) return states; if (!states.every(settled)) drafts = 0; }
      await wait(1500); }
    return alive() ? states : null;
  };
  try {
    say(plan.intro, { plan: [...SHORT_STEPS], title: plan.title, tracker: true });
    await wait(DEMO_STEP_MS * 1.4);
    const L0 = shortLayout({ x: 0, y: 0 }, plan.beats.length);
    const area = await sendOp(boardId, { kind: 'free_area', w: L0.size.w, h: L0.size.h }, OP_TIMEOUT_MS);
    const base = area.ok && Number.isFinite(area.result?.x) && Number.isFinite(area.result?.y) ? { x: Number(area.result.x), y: Number(area.result.y) } : { x: 0, y: 0 };
    const L = shortLayout({ x: base.x + 36, y: base.y + 36 }, plan.beats.length);

    /* the idea first, as an orange note left of the rows (the zoomed-out sky's centre) */
    if (!(await op({ kind: 'add_note', text: plan.idea, at: L.idea, color: 'orange' }))) return;
    // ---- 1 Beats: sticky notes the user edits; Looks good (or an edit) ----
    say(`Step 1, the beats: ${plural(plan.beats.length, 'note')}, one per moment of the story.`);
    /* setup arrives as one batch (one wave, one Undo); the guided moments below stay single steps */
    const fb = L.frames.beats;
    const rb = await op({ kind: 'batch', note: 'The beat sheet', items: [{ kind: 'add_frame', ref: 'beats', name: '1 · Beats', at: { x: fb.x, y: fb.y }, w: fb.w, h: fb.h },
      ...plan.beats.map((b, i): BatchItem => ({ kind: 'add_note', ref: `b${i}`, text: b.text, at: L.beat(i), color: 'yellow', frame: 'beats' }))] });
    if (!rb) return; if (!rb.ok) { say(`I couldn’t lay out the beats: ${rb.error.replace(/\.$/, '')}. Nothing was made.`, { error: true }); return; }
    beatsFrame = String(rb.result?.refs?.beats ?? ''); beatIds = plan.beats.map((_, i) => String(rb.result?.refs?.[`b${i}`] ?? '')).filter(Boolean);
    for (let asks = 0; ; asks++) {
      const a = await waitConfirm(asks ? 'Anything else? Press Looks good when the beats read right.' : 'Here’s the beat sheet. Edit any note on the board (double-click it), or tell me what to change. Press Looks good when it reads right.');
      if (!a) return; if (a === 'ok') break;
      if (beatIds.length >= 10) { say('That’s plenty of beats. Edit the notes on the board, then press Looks good.'); continue; }
      const i = beatIds.length; const r = await op({ kind: 'add_note', text: a.edit.slice(0, 300), at: L.beat(i), color: 'light-violet', ...(beatsFrame ? { frame_id: beatsFrame } : {}) }); if (!r) return;
      const id = idOf(r); if (id) { beatIds.push(id); say(`Added it as beat ${i + 1}. You can move, edit or delete it on the board.`, { cardId: id }); }
    }
    /* the beats as they read now: the notes in the Beats frame, in board order (yours too) */
    const nodes1 = await liveNodes(boardId); if (!alive()) return;
    const inFrame = nodes1?.find((n) => n.id === beatsFrame)?.children as string[] | undefined;
    const noteIds = (inFrame?.length ? inFrame : beatIds).filter((id) => nodes1?.some((n) => n.id === id && n.type === 'note'));
    const beats: { id: string; beat: ShortBeat }[] = noteIds.map((id, i) => ({ id, beat: beatOfNote(String(nodes1?.find((n) => n.id === id)?.title ?? ''), i) })).filter((x) => x.beat.line || x.beat.name).slice(0, 10);
    if (!beats.length) { say('There are no beats left on the board, so I’ll stop here. Nothing was charged.', { error: true }); return; }
    say(`Beats locked: ${plural(beats.length, 'shot')}.`, { stepsDone: ++steps });

    // ---- 2 Cast: a character sheet and the place ----
    say(demo ? 'Step 2, the cast: the harbour and a creature sheet, so the same whale shows up in every shot.' : 'Step 2, the cast: a character sheet, so the same person shows up in every shot, and the place.');
    const fc = L.frames.cast; const frc = await op({ kind: 'add_frame', name: '2 · Cast', at: { x: fc.x, y: fc.y }, w: fc.w, h: fc.h }); if (!frc) return;
    const castIds: string[] = []; const castOf: Record<string, string> = {};
    for (const [i, c] of plan.cast.entries()) { if (c.ref) tagDemoCard(boardId, c.prompt, c.ref);
      const r = await op({ kind: 'add_card', workflow: c.workflow, prompt: c.prompt, name: c.name, at: L.cast(i), ...(demoProviderOf(c.ref) ? { model: demoProviderOf(c.ref) } : {}) }); if (!r) return; const id = idOf(r); if (id) { castIds.push(id); castOf[c.key] = id; } else if (!r.ok) say(`I couldn’t add ${c.name}: ${r.error.replace(/\.$/, '')}.`, { error: true }); }
    if (!castIds.length) { say('The cast cards didn’t make it onto the board, so I’ll stop here. Nothing was charged.', { error: true }); return; }
    if (idOf(frc)) await op({ kind: 'move_into', ids: castIds, frame_id: idOf(frc) });
    const g1 = await goFor(castIds, 'The cast: a character sheet and the place'); if (!g1) return;
    const s1 = await settle(g1.started); if (!s1) return;
    await reviewCards(castIds.filter((_, i) => s1[i] === 'done'));
    say(`The cast is in.${s1.includes('failed') ? ' One didn’t finish; Retry it on its card, the key frames still work without it.' : ''}`, { stepsDone: ++steps });

    // ---- 3 Key frames: one picture per beat, wired from the cast; then a version per shot ----
    say(demo ? 'Step 3, the key frames: one picture per beat. Some start from the cast or an earlier shot, wired in.' : `Step 3, the key frames: one picture per beat, made from the cast.`);
    const fk = L.frames.keys;
    /* the character sheet feeds every shot (one arrow each keeps the board readable; the place is in the prompt's look) */
    const keyIds: string[] = []; const castDone = castIds.filter((_, i) => s1[i] === 'done').slice(0, 1);
    /* the chip: a shot whose beat still reads as written keeps its real run's prompt and inputs (the harbour, the whale sheet, an earlier shot) */
    const real = (i: number) => (demo && demo.keys[i] && beats[i].beat.text === beatNote({ name: plan.beats[i]?.name ?? '', line: plan.beats[i]?.line ?? '' }) ? demo.keys[i] : null);
    const wire = (keys: string[]) => keys.map((k) => (castOf[k] && s1[castIds.indexOf(castOf[k])] === 'done' ? castOf[k] : /^k\d+$/.test(k) && real(Number(k.slice(1))) ? k : null));
    const keyItems = beats.map(({ beat }, i): BatchItem => { const d = real(i); const from = d ? wire(d.from) : null;
      if (d && from!.every(Boolean)) return { kind: 'add_card', ref: `k${i}`, workflow: 'create', ...tag(d.prompt, `k${i}`), prompt: d.prompt, name: `Shot ${i + 1} · ${beat.name}`.slice(0, 80), at: L.key(i), frame: 'keys', ...(from!.length ? { inputs_from: from as string[] } : {}) };
      return { kind: 'add_card', ref: `k${i}`, workflow: 'create', prompt: keyFramePrompt(plan.subject, beat), name: `Shot ${i + 1} · ${beat.name}`.slice(0, 80), at: L.key(i), frame: 'keys', ...(castDone.length ? { inputs_from: castDone } : {}) }; });
    const rk = await op({ kind: 'batch', note: 'Key frames, one per beat', items: [{ kind: 'add_frame', ref: 'keys', name: '3 · Key frames', at: { x: fk.x, y: fk.y }, w: fk.w, h: fk.h }, ...keyItems] });
    if (!rk) return; if (!rk.ok) { say(`I couldn’t add the key frames: ${rk.error.replace(/\.$/, '')}. Nothing was made, and nothing was charged.`, { error: true }); return; }
    beats.forEach(({ id: noteId, beat }, i) => { const id = String(rk.result?.refs?.[`k${i}`] ?? ''); if (!id) return; keyIds.push(id); keyOfBeat.set(noteId, { cardId: id, text: beat.text, i }); });
    if (!keyIds.length) { say('None of the key frames made it onto the board, so I’ll stop here. Nothing was charged.', { error: true }); return; }
    const g2 = await goFor(keyIds, `${plural(keyIds.length, 'key frame')}, one per beat`); if (!g2) return;
    const s2 = await settle(g2.started); if (!s2) return;
    const okKeys = g2.started.filter((_, i) => s2[i] === 'done');
    if (!okKeys.length) { say('None of the key frames finished, so there’s nothing to film yet. Retry them on their cards, then ask me again.', { error: true }); return; }
    await reviewCards(okKeys);
    const pickAns = await waitConfirm(`Your key frames are in. Pick a version on each shot: click a thumbnail in its strip (Recreate makes another one${demo && config.backend === 'mock' ? '' : ', and I\'ll look at it too'}). The ringed one is what gets filmed. Press Looks good when every shot has the one you want.`, 'Looks good', () => reviewCards(okKeys));
    if (!pickAns) return;
    say('Got your picks.', { stepsDone: ++steps });

    // ---- 4 Film: clips from your picks, voice, music; quoted; voice + music run on Go; stitch when the clips exist ----
    say(demo ? 'Step 4, the film: the clips, each wired from the frames it starts (and ends) on, a voice and a music bed.' : 'Step 4, the film: a clip per shot from your pick, a voice and a music bed.');
    const ff = L.frames.film; const clipItems: BatchItem[] = []; const keyCard = (i: number) => keyOfBeat.get(beats[i]?.id ?? '')?.cardId;
    /* the chip's shots that keep their real runs get only the clips that were really made (from the frames they started and ended on);
       every other shot gets a clip from its own key frame */
    beats.forEach(({ beat }, i) => { const key = keyCard(i); if (!key || !okKeys.includes(key) || (real(i) && keyItems[i].prompt === real(i)!.prompt)) return;
      clipItems.push({ kind: 'add_card', ref: `c${i}`, workflow: 'video', prompt: clipPrompt(plan.subject, beat), name: `Shot ${i + 1} · clip`, at: L.clip(i), inputs_from: [key], frame: 'film' }); });
    for (const c of demo?.clips ?? []) {
      const from = c.from.map((k) => { if (castOf[k]) return s1[castIds.indexOf(castOf[k])] === 'done' ? castOf[k] : null; const i = Number(k.slice(1)); const id = keyCard(i);
        return id && okKeys.includes(id) && real(i) && keyItems[i].prompt === real(i)!.prompt ? id : null; });
      if (!from.every(Boolean)) continue;
      clipItems.push({ kind: 'add_card', ref: c.key, workflow: 'video', ...tag(c.prompt, c.key), prompt: c.prompt, name: c.name, at: L.clip(c.col), inputs_from: from as string[], frame: 'film' }); }
    clipItems.sort((a, b) => a.at!.x - b.at!.x); /* the film plays the clips left to right */
    const voiceText = demo?.voice ?? narrationOf(plan.subject); const musicText = demo?.music ?? musicPrompt(plan.subject);
    const voiceModel = demo ? tag(voiceText, 'voice') : {}; const musicModel = demo ? tag(musicText, 'music') : {};
    const rf = await op({ kind: 'batch', note: 'The film: clips, voice and music', items: [{ kind: 'add_frame', ref: 'film', name: '4 · Film', at: { x: ff.x, y: ff.y }, w: ff.w, h: ff.h }, ...clipItems,
      { kind: 'add_card', ref: 'voice', workflow: 'voice', ...voiceModel, prompt: voiceText, name: 'Narration', at: L.voice, frame: 'film' },
      { kind: 'add_card', ref: 'music', workflow: 'music', ...musicModel, prompt: musicText, name: 'Music bed', at: L.music, settings: SHORT_MUSIC, frame: 'film' }] });
    if (!rf) return; if (!rf.ok) { say(`I couldn’t add the film cards: ${rf.error.replace(/\.$/, '')}. Nothing was made, and nothing was charged.`, { error: true }); return; }
    const refOf = (k: string) => String(rf.result?.refs?.[k] ?? '');
    const clipIds = clipItems.map((c) => refOf(c.ref!)).filter(Boolean); const voiceId = refOf('voice'); const musicId = refOf('music');
    /* the clips are always priced; they run only when video runs are switched on */
    if (clipIds.length && !videoOn) {
      const q = await sendOp(boardId, { kind: 'propose_run', card_ids: clipIds, note: 'quote only' }, OP_TIMEOUT_MS);
      const items: any[] = q.ok && Array.isArray(q.result?.items) ? q.result.items : []; const usd = r4(items.filter((x) => !x.problem).reduce((n, x) => n + (typeof x.usd === 'number' ? x.usd : 0), 0));
      const words = items.length && items.every((x) => x.quote?.demo === true) ? 'Sample' : usd > 0 ? `≈ $${usd.toFixed(2)}` : items.length && items.every((x) => x.quote?.localRun === true || x.quote?.cost?.billedTo === 'local') ? LOCAL_FREE : 'Free';
      say(`${plural(clipIds.length, 'clip card')} wired to your picks, priced at ${words} together. ${plan.videoOff}`, { cardId: clipIds[0] });
    }
    const runNow = [...(videoOn ? clipIds : []), voiceId, musicId].filter(Boolean);
    if (!runNow.length) { say('Nothing in the film step can run here yet. The cards stay on the board as drafts.', { error: true }); return; }
    const g3 = await goFor(runNow, videoOn ? 'The film: clips, voice and music' : 'The voice and the music bed'); if (!g3) return;
    const s3 = await settle(g3.started); if (!s3) return;
    if (videoOn && clipIds.length) {
      const nodes = await liveNodes(boardId); const jobOf = (id: string) => (nodes?.find((n) => n.id === id)?.status === 'done' ? nodes?.find((n) => n.id === id)?.jobId ?? null : null);
      const body = stitchBody(clipIds.map(jobOf), musicId ? jobOf(musicId) : null, voiceId ? jobOf(voiceId) : null, plan.idea);
      if (!body) say('Some clips didn’t finish, so I didn’t stitch yet. Retry them on their cards, then ask me to stitch.', { error: true });
      else if (appRef) { const res = await appRef.inject({ method: 'POST', url: '/api/compose', payload: body }); const out: any = res.json();
        if (res.statusCode === 200 && out?.resultUrl) { await sendOp(boardId, { kind: 'place_result', job_id: out.id, url: out.resultUrl, title: plan.idea, at: L.film } as any, OP_TIMEOUT_MS); say('Stitched: your film is on the board, free on your computer.', { cardId: null }); }
        else say(`The stitch didn’t work: ${String(out?.error ?? 'unknown').replace(/\.$/, '')}. Nothing was charged.`, { error: true }); }
      say(plan.outro, { stepsDone: SHORT_STEPS.length, finished: true });
    } else say(`Your short film is laid out shot by shot: beats, cast, key frames${s3.every((x) => x === 'done') ? ', voice and music' : ' and the sound cards'}. The clips are ready to go when video runs are on, and then I stitch them into one film.`, { stepsDone: SHORT_STEPS.length, finished: true });
  } catch (e) {
    say(`Something went wrong on my side: ${(e as Error).message}. Everything on the board stays.`, { error: true });
  } finally {
    if (demos.get(boardId) === run) demos.delete(boardId);
    endPick(boardId);
    for (const p of stateOf(boardId).proposals.values()) if (p.status === 'pending' && runProposals.has(p.id)) { p.status = 'cancelled'; p.decidedAt = now(); updateProposal(p); }
    broadcast(boardId, 'demo', demoState(boardId));
  }
}

// ---------------------------------------------------------------- routes
const bad = (reply: FastifyReply, error: string, code = 'invalid_op', status = 400) => reply.code(status).send({ error, errorType: status === 404 ? 'not_found' : status === 409 ? 'conflict' : 'validation', code });
const notFound = (reply: FastifyReply) => bad(reply, 'No board with that id.', 'not_found', 404);
const int = (v: unknown, d: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : d; };
/** Only the MCP server marks the agent present (it sends x-ohf-agent-name); the panel's own reads never do. */
const fromAgent = (req: FastifyRequest) => !!String(req.headers['x-ohf-agent-name'] ?? '').trim();

export function registerCanvasAgent(app: FastifyInstance) {
  appRef = app;
  /* Any MCP request under /api/canvas marks the agent present, so the panel can switch to "Connected" even before an op. */
  app.addHook('onRequest', async (req) => {
    const url = String(req.url ?? ''); const agent = String(req.headers['x-ohf-agent-name'] ?? '').trim();
    if (!url.startsWith('/api/canvas') || !agent) return;
    markAgent(req);
    /* A plain board list from the MCP side means the agent is here: mark every board that has an open canvas page, so its panel
       can switch to Connected before the first board-specific call. */
    if (url.split('?')[0] === '/api/canvas/boards') for (const [id, s] of states) if (s.clients.size) markAgent(req, id, false); /* connected, not working on them */
    /* any call on one board (canvas_open_board, canvas_add_card, canvas_propose_run…) means the agent is working on it */
    const one = /^\/api\/canvas\/boards\/([^/?]+)/.exec(url)?.[1]; if (one && getBoard(decodeURIComponent(one))) markAgent(req, decodeURIComponent(one));
  });

  app.get('/api/canvas/agent/presence', async () => ({ ...presenceView(), openBoards: openBoards() }));

  /* The MCP server's connected clients (mcp/src/sessions.ts): sent on connect / disconnect and every 15 s. */
  app.post<{ Body: unknown }>('/api/canvas/agent/sessions', async (req, reply) => {
    const parsed = sessionsBody.safeParse(req.body); if (!parsed.success) return bad(reply, zodText(parsed.error), 'invalid_sessions');
    setSessions(parsed.data.process_id, parsed.data.sessions); return { ok: true, connected: liveSessions().length };
  });

  /* Show a board on every open canvas page (the agent made it or switched to it). The page follows unless nothing is open. */
  app.post<{ Body: unknown }>('/api/canvas/agent/open', async (req, reply) => {
    const parsed = openBody.safeParse(req.body); if (!parsed.success) return bad(reply, zodText(parsed.error), 'invalid_open');
    const b = getBoard(parsed.data.board_id); if (!b) return notFound(reply);
    if (fromAgent(req)) markAgent(req, b.id);
    const pages = [...states.values()].reduce((n, s) => n + s.clients.size, 0);
    const name = presenceOf(b.id).agentName ?? 'Your AI';
    broadcastAll('open_board', { boardId: b.id, name: b.name, by: name, at: now() });
    return { ok: true, board: boardSummary(b), shownOn: pages, note: pages ? 'The canvas in the app switched to this board.' : 'No canvas page is open in the app right now. The user sees this board when they open Canvas and pick it.' };
  });

  /* A board was made, renamed or deleted (by the user in another tab, or by the agent): every open page refreshes its board list. */
  app.addHook('onResponse', async (req, reply) => {
    const url = String(req.url ?? '').split('?')[0]!;
    if (reply.statusCode >= 400 || !/^\/api\/canvas\/boards(\/[^/]+)?$/.test(url) || !['POST', 'PATCH', 'DELETE'].includes(req.method)) return;
    broadcastAll('boards', { at: now(), by: fromAgent(req) ? 'agent' : 'you' });
  });

  app.get('/api/canvas/agent/starters', async () => ({ items: DEMO_STARTERS }));

  /* The user's own proposal from the dock (Re-roll on a media card): priced exactly like an agent's, and it waits for Go too. */
  app.post<{ Params: { id: string }; Body: unknown }>('/api/canvas/boards/:id/agent/proposals', async (req, reply) => {
    const b = getBoard(req.params.id); if (!b) return notFound(reply);
    const parsed = userProposalBody.safeParse(req.body); if (!parsed.success) return bad(reply, zodText(parsed.error), 'invalid_proposal');
    if (!hasCanvas(b.id)) return bad(reply, 'Open the board in the app first.', 'canvas_not_open', 409);
    const r = await proposeRun(b.id, parsed.data, null, 'user');
    if (!r.ok) return bad(reply, r.error, r.code ?? 'not_priced', 409);
    return { ok: true, proposal: r.result.proposal };
  });

  /* The built-in demo agent: plays a scripted plan on the open board. It never spends: each phase is a proposal that waits for Go. */
  app.post<{ Params: { id: string }; Body: unknown }>('/api/canvas/boards/:id/agent/demo', async (req, reply) => {
    const b = getBoard(req.params.id); if (!b) return notFound(reply);
    const parsed = demoBody.safeParse(req.body); if (!parsed.success) return bad(reply, zodText(parsed.error), 'invalid_demo');
    if (!hasCanvas(b.id)) return bad(reply, 'Open the board in the app first.', 'canvas_not_open', 409);
    /* typed words (no chip): the demo can't chat, so it says so. It never builds, prices, approves or moves a running demo on (2026-10-31:
       a typed question used to start a demo and a priced proposal). The words stay in the box (kept), so they can go to Claude once connected. */
    if (!isStarterId(parsed.data.starter)) {
      const s = stateOf(b.id); const running = demos.has(b.id);
      const waiting = !running ? null : [...s.proposals.values()].some((p) => p.status === 'pending') ? 'go' : s.pick?.status === 'waiting' ? 'pick' : null;
      const r = demoReply(parsed.data.prompt, { running, waiting });
      const last = s.feed.at(-1);
      const said = last?.type === 'message' && last.from === 'agent' && last.meta?.demoReply && last.text === r.text && (last.meta?.suggest ?? null) === r.suggest
        ? last : addMessage(b.id, 'agent', r.text, { meta: { by: 'demo', demoReply: true, suggest: r.suggest } });
      return { ok: true, kept: true, reply: said };
    }
    if (demos.has(b.id)) return bad(reply, 'The agent is already working on this board. Stop it first.', 'demo_running', 409);
    const message = addMessage(b.id, 'user', parsed.data.prompt);
    if (detectStarter(parsed.data.prompt, parsed.data.starter ?? null) === 'short') { /* the flagship: Short film from idea */
      const sp = shortFilmPlan(parsed.data.prompt, isChip(parsed.data.starter, parsed.data.prompt)); const run: DemoRun = { id: uid('demo'), boardId: b.id, stop: false, title: sp.title };
      demos.set(b.id, run); broadcast(b.id, 'demo', demoState(b.id));
      void runShortFilm(run, sp);
      return { ok: true, runId: run.id, plan: { id: sp.id, title: sp.title, steps: [...SHORT_STEPS] }, message };
    }
    const plan = demoPlan(parsed.data.prompt, parsed.data.starter ?? null);
    const run: DemoRun = { id: uid('demo'), boardId: b.id, stop: false, title: plan.title };
    demos.set(b.id, run); broadcast(b.id, 'demo', demoState(b.id));
    void runDemo(run, plan);
    return { ok: true, runId: run.id, plan: { id: plan.id, title: plan.title, steps: plan.steps }, message };
  });
  app.post<{ Params: { id: string } }>('/api/canvas/boards/:id/agent/demo/stop', async (req, reply) => {
    const b = getBoard(req.params.id); if (!b) return notFound(reply);
    const run = demos.get(b.id); if (!run) return { ok: true, running: false };
    run.stop = true; demos.delete(b.id);
    /* a proposal still waiting for Go is cancelled: nothing it priced runs */
    for (const p of stateOf(b.id).proposals.values()) if (p.status === 'pending') { p.status = 'cancelled'; p.decidedAt = now(); updateProposal(p); }
    endPick(b.id);
    addMessage(b.id, 'agent', 'Stopped. Everything already on the board stays.', { meta: { by: 'demo', runId: run.id, stopped: true } });
    broadcast(b.id, 'demo', demoState(b.id));
    return { ok: true, running: false };
  });
  app.get('/api/canvas/agent/workflows', async () => ({ items: canvasWorkflows() }));

  /* "Pick the one you like": the user's click on one of the cards an ask_pick named. The agent (demo or MCP inbox) goes on with that card only. */
  app.post<{ Params: { id: string }; Body: unknown }>('/api/canvas/boards/:id/agent/pick', async (req, reply) => {
    const b = getBoard(req.params.id); if (!b) return notFound(reply);
    const parsed = pickBody.safeParse(req.body); if (!parsed.success) return bad(reply, zodText(parsed.error), 'invalid_pick');
    const pk = stateOf(b.id).pick;
    if (!pk || pk.id !== parsed.data.pick_id) return reply.code(404).send({ error: 'Nothing to pick right now.', errorType: 'not_found', code: 'not_found' });
    if (pk.status !== 'waiting') return bad(reply, pk.status === 'picked' ? 'You already picked one.' : 'That choice was closed.', 'pick_closed', 409);
    if (!pk.cardIds.includes(parsed.data.card_id)) return bad(reply, 'Pick one of the highlighted cards.', 'not_a_choice', 409);
    pk.chosen = parsed.data.card_id; pk.status = 'picked'; broadcast(b.id, 'pick', pk);
    addMessage(b.id, 'user', `Picked ${parsed.data.title ? `“${parsed.data.title}”` : 'this one'}.`, { cardId: pk.chosen, meta: { pickId: pk.id, cardId: pk.chosen } });
    return { ok: true, pick: pk };
  });

  app.get<{ Params: { pid: string } }>('/api/canvas/agent/proposals/:pid', async (req, reply) => {
    const p = proposalsById.get(req.params.pid); if (!p) return reply.code(404).send({ error: 'No proposal with that id.', errorType: 'not_found', code: 'not_found' });
    if (fromAgent(req)) markAgent(req, p.boardId); return p;
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/canvas/boards/:id/agent/ops', async (req, reply) => {
    const b = getBoard(req.params.id); if (!b) return notFound(reply);
    if (fromAgent(req)) { const busy = busyFor(req, b.id); if (busy) return bad(reply, busy, 'board_busy', 409); markAgent(req, b.id); listen(req, b.id); }
    const parsed = opsBody.safeParse(req.body);
    if (!parsed.success) return bad(reply, zodText(parsed.error));
    const results: OpResult[] = [];
    for (const op of parsed.data.ops) results.push(await executePublicOp(b.id, op, req));
    return { ok: results.every((r) => r.ok), results };
  });

  app.get<{ Params: { id: string } }>('/api/canvas/boards/:id/agent/stream', async (req, reply) => {
    const b = getBoard(req.params.id); if (!b) return notFound(reply);
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    try { res.write('retry: 1500\n\n'); } catch { /* gone */ }
    const s = stateOf(b.id); const client: AgentClient = { id: uid('cl'), res };
    s.clients.set(client.id, client);
    const send = (event: string, data: unknown) => { try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* gone */ } };
    send('hello', { boardId: b.id, canvasOpen: true, agent: presenceOf(b.id), demo: demoState(b.id), pick: s.pick?.status === 'waiting' ? s.pick : null, lastSeq: s.seq, proposals: [...s.proposals.values()].filter((p) => p.status === 'pending' || p.status === 'running') });
    schedulePresence();
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* gone */ } }, 15_000);
    const close = () => {
      clearInterval(ping); s.clients.delete(client.id);
      for (const [id, p] of [...pending.entries()]) if (p.clientId === client.id) {
        clearTimeout(p.timer); pending.delete(id);
        const r: OpResult = { ok: false, error: 'The board closed before the canvas answered.', code: 'canvas_closed' };
        p.onResult?.(r); p.resolve(r);
      }
      schedulePresence();
    };
    req.raw.on('close', close); req.raw.on('error', close);
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/canvas/boards/:id/agent/results', async (req, reply) => {
    const b = getBoard(req.params.id); if (!b) return notFound(reply);
    const parsed = resultBody.safeParse(req.body); if (!parsed.success) return bad(reply, zodText(parsed.error), 'invalid_result');
    const p = pending.get(parsed.data.id); if (!p || p.boardId !== b.id) return reply.code(404).send({ error: 'No op is waiting for that result.', errorType: 'not_found', code: 'unknown_op' });
    clearTimeout(p.timer); pending.delete(parsed.data.id);
    const r: OpResult = parsed.data.ok ? { ok: true, result: parsed.data.result ?? null } : { ok: false, error: parsed.data.error || 'The canvas could not apply that.', result: parsed.data.result };
    p.onResult?.(r); p.resolve(r);
    return { ok: true };
  });

  app.get<{ Params: { id: string }; Querystring: { since?: string; limit?: string } }>('/api/canvas/boards/:id/agent/feed', async (req, reply) => {
    const b = getBoard(req.params.id); if (!b) return notFound(reply);
    const s = stateOf(b.id); const since = int(req.query.since, 0, 0, Number.MAX_SAFE_INTEGER); const limit = int(req.query.limit, 200, 1, 500);
    const items = s.feed.filter((e) => e.seq > since).slice(0, limit);
    return { boardId: b.id, items, next: items.at(-1)?.seq ?? since };
  });

  /* canvas_wait_for_message: your agent long-polls (≤ 60 s) for what you type in the dock, with the cards you had selected. Returns early
     when a message (or a Go / Cancel) arrives, else empty at the timeout; the agent calls it again. One agent per board: a second gets "busy". */
  app.get<{ Params: { id: string }; Querystring: { since?: string; timeout_sec?: string } }>('/api/canvas/boards/:id/agent/wait', async (req, reply) => {
    const b = getBoard(req.params.id); if (!b) return notFound(reply);
    const busy = busyFor(req, b.id); if (busy) return bad(reply, busy, 'board_busy', 409);
    markAgent(req, b.id); listen(req, b.id); const s = stateOf(b.id);
    /* no since (the first call): your unread messages from the last half hour too, so a "hello" typed before the agent listened isn't lost */
    const fresh = req.query.since == null || req.query.since === '';
    const since = fresh ? s.seq : int(req.query.since, 0, 0, Number.MAX_SAFE_INTEGER); const timeout = int(req.query.timeout_sec, 50, 0, WAIT_MAX_S);
    const backlog = fresh ? unreadOf(s) : [];
    const pick = () => [...backlog, ...s.feed.filter((e) => e.seq > since && e.from === 'user' && (e.type === 'message' || e.type === 'decision'))];
    let items = pick();
    s.waits += 1; touchListen(b.id);
    try {
      if (!items.length && timeout > 0) {
        await new Promise<void>((resolve) => { let done = false; const fin = () => { if (done) return; done = true; clearTimeout(t); s.waiters.delete(fin); resolve(); };
          const t = setTimeout(fin, timeout * 1000); s.waiters.add(fin); req.raw.on('close', fin); });
        items = pick();
      }
    } finally { s.waits = Math.max(0, s.waits - 1); touchListen(b.id); }
    markAgent(req, b.id); listen(req, b.id);
    const name = s.listener?.name ?? 'Your AI';
    if (items.some((e) => e.type === 'message')) broadcast(b.id, 'agent_status', { state: 'planning', name, at: now() }); /* the dock: "Claude is planning…" */
    markRead(b.id, items, 'wait');
    const messages = items.map(messageOut);
    return { boardId: b.id, messages, next: Math.max(since, items.at(-1)?.seq ?? since), waitedSec: timeout, note: messages.length ? 'These are the user\'s own requests from the canvas dock.' : 'Nothing yet. Call again to keep listening.' };
  });

  /* Channel mode (2026-10-28): an MCP server started with --channel long-polls here and pushes each message into its Claude Code session. */
  app.get<{ Querystring: { timeout_sec?: string } }>('/api/canvas/agent/channel', async (req, reply) => {
    const id = headerOf(req, 'x-ohf-agent-listener'); if (!id) return bad(reply, 'Only an MCP server in channel mode polls here (x-ohf-agent-listener).', 'no_listener');
    const h = headerOf(req, 'x-ohf-agent-name'); const before = channelSig(); const timeout = int(req.query.timeout_sec, 50, 0, WAIT_MAX_S);
    let sub = channelSubs.get(id); if (!sub) { sub = { id, name: (h ? clientLabel(h) : '') || 'Your AI', since: now(), at: now(), polls: 0 }; channelSubs.set(id, sub); }
    sub.polls += 1; sub.at = now(); if (h) sub.name = clientLabel(h) || sub.name; channelChanged(before);
    let got = channelPick(sub);
    try {
      if (!got.length && timeout > 0) {
        await new Promise<void>((resolve) => { let done = false; const fin = () => { if (done) return; done = true; clearTimeout(t); channelWaiters.delete(fin); resolve(); };
          const t = setTimeout(fin, timeout * 1000); channelWaiters.add(fin); req.raw.on('close', fin); });
        got = channelPick(sub);
      }
    } finally { sub.polls = Math.max(0, sub.polls - 1); sub.at = now(); }
    const out = got.map(({ boardId, entries }) => {
      const st = stateOf(boardId); st.listener = { id: sub!.id, name: sub!.name, at: now() }; st.lastAgentAt = now(); st.agentName = sub!.name;
      markPushed(boardId, entries);
      if (entries.some((e) => e.type === 'message')) broadcast(boardId, 'agent_status', { state: 'planning', name: sub!.name, at: now() });
      return { boardId, boardName: getBoard(boardId)?.name ?? null, messages: entries.map(messageOut) };
    });
    if (out.length) { globalAgentAt = now(); schedulePresence(); }
    return { items: out };
  });
  app.delete('/api/canvas/agent/channel', async (req) => {
    const id = headerOf(req, 'x-ohf-agent-listener'); const before = channelSig(); if (id) channelSubs.delete(id); channelChanged(before); return { ok: true };
  });

  app.get<{ Params: { id: string }; Querystring: { since?: string; limit?: string } }>('/api/canvas/boards/:id/agent/inbox', async (req, reply) => {
    const b = getBoard(req.params.id); if (!b) return notFound(reply); if (fromAgent(req)) markAgent(req, b.id);
    const s = stateOf(b.id); const since = int(req.query.since, 0, 0, Number.MAX_SAFE_INTEGER); const limit = int(req.query.limit, 200, 1, 500);
    const items = s.feed.filter((e) => e.seq > since && (e.type === 'message' || e.type === 'decision')).slice(0, limit);
    if (fromAgent(req)) markRead(b.id, items, 'inbox'); /* the agent read them: the dock says "Read" */
    return { boardId: b.id, items, next: items.at(-1)?.seq ?? since };
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/canvas/boards/:id/agent/messages', async (req, reply) => {
    const b = getBoard(req.params.id); if (!b) return notFound(reply);
    const parsed = messageBody.safeParse(req.body); if (!parsed.success) return bad(reply, zodText(parsed.error), 'invalid_message');
    const sel = parsed.data.selection?.length ? { selection: parsed.data.selection } : {};
    /* typed on this computer (or through its own web proxy)? Only those are pushed into a channel session (an outside sender can't wake Claude Code) */
    const local = /^(127\.|::1$|::ffff:127\.)/.test(req.ip ?? '');
    const message = addMessage(b.id, 'user', parsed.data.text, { meta: { ...(parsed.data.confirm_id ? { confirmId: parsed.data.confirm_id } : {}), ...sel, ...(local ? {} : { remote: true }) } });
    return { ok: true, message };
  });

  app.get<{ Params: { id: string } }>('/api/canvas/boards/:id/agent/state', async (req, reply) => {
    const b = getBoard(req.params.id); if (!b) return notFound(reply);
    const s = stateOf(b.id);
    return { boardId: b.id, canvasOpen: s.clients.size > 0, agent: presenceOf(b.id), demo: demoState(b.id), pick: s.pick?.status === 'waiting' ? s.pick : null, proposals: [...s.proposals.values()].filter((p) => p.status === 'pending' || p.status === 'running').length };
  });

  app.get<{ Params: { id: string } }>('/api/canvas/boards/:id/agent/summary', async (req, reply) => {
    const b = getBoard(req.params.id); if (!b) return notFound(reply); if (fromAgent(req)) markAgent(req, b.id);
    const live = await liveSummary(b.id);
    return live ? { board: boardSummary(b), nodes: live.nodes, live: true } : { board: boardSummary(b), nodes: summarizeSnapshot(b.snapshot), live: false, note: 'This is the last saved board. Open it in the app to see live cards.' };
  });

  app.get<{ Params: { id: string } }>('/api/canvas/boards/:id/agent/proposals', async (req, reply) => {
    const b = getBoard(req.params.id); if (!b) return notFound(reply); if (fromAgent(req)) markAgent(req, b.id);
    const items = [...stateOf(b.id).proposals.values()].sort((a, c) => c.createdAt - a.createdAt).slice(0, 20);
    return { boardId: b.id, items };
  });

  app.post<{ Params: { id: string; pid: string }; Body: unknown }>('/api/canvas/boards/:id/agent/proposals/:pid/decision', async (req, reply) => {
    const b = getBoard(req.params.id); if (!b) return notFound(reply);
    const parsed = decisionBody.safeParse(req.body); if (!parsed.success) return bad(reply, zodText(parsed.error), 'invalid_decision');
    const p = proposalsById.get(req.params.pid); if (!p || p.boardId !== b.id) return reply.code(404).send({ error: 'No proposal with that id.', errorType: 'not_found', code: 'not_found' });
    if (p.status !== 'pending') return bad(reply, p.status === 'cancelled' ? 'This proposal was cancelled.' : p.status === 'approved' ? 'This proposal already ran.' : 'This proposal is already in progress.', 'proposal_not_pending', 409);
    if (parsed.data.decision === 'cancel') {
      p.status = 'cancelled'; p.decidedAt = now(); addDecision(b.id, 'cancel', p.id); updateProposal(p);
      return { ok: true, proposal: p };
    }
    if (p.reason) return bad(reply, p.reason, p.overBudget ? 'over_budget' : 'not_runnable', 409);
    if (!hasCanvas(b.id)) return bad(reply, 'Open the board in the app first.', 'canvas_not_open', 409);
    p.status = 'running'; p.decidedAt = now(); addDecision(b.id, 'go', p.id); updateProposal(p);
    void sendOp(b.id, { kind: 'run_proposal', proposal_id: p.id, card_ids: p.runCardIds ?? p.cardIds, budget_id: p.budget?.id ?? null }, PROPOSAL_TIMEOUT_MS, (r) => finishRunProposal(p, r));
    return { ok: true, proposal: p };
  });
}

/** For the server test: clear the in-memory bridge (a fresh process has nothing anyway). */
export function resetCanvasAgentForTest() { for (const d of demos.values()) d.stop = true; demos.clear(); states.clear(); pending.clear(); proposalsById.clear(); mcpProcs.clear(); globalAgentAt = 0; globalAgentName = null; }
