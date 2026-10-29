/**
 * Who is connected (2026-10-28): this MCP process tells the app which clients are connected, so the canvas can say "Claude Code is
 * connected" the moment a client connects, not only after its first tool call, and stop saying it when the client goes away.
 *
 *  HTTP: one entry per MCP session (initialize → session id). A session is live while its client holds the GET event stream open
 *        (Claude Code and the SDK clients open it right after connecting; the SDK writes a keep-alive every 15 s, so a dead peer
 *        drops it), for a short grace after the stream closes, or, for a client that never opens the stream, until it has been quiet
 *        for IDLE_MS. DELETE /mcp ends it at once.
 *  stdio: one entry for the process, live from initialize until the process exits.
 *
 * The list goes to POST /api/canvas/agent/sessions on every change and every HEARTBEAT_MS; the app forgets a process it has not heard
 * from in a while (server/src/canvasAgent.ts), so a crashed MCP server never stays "connected".
 */
import { API } from './api.js';
import { randomUUID } from 'node:crypto';

export interface SessionInfo {
  id: string; client: string | null; clientVersion: string | null; transport: 'http' | 'stdio'; since: number; lastSeen: number;
  /** open GET event streams (0 or 1) */ streams: number; /** the client opened a stream at some point */ everStream: boolean; streamClosedAt: number | null; ended: boolean;
}
const HEARTBEAT_MS = Number(process.env.OPENHIGGSFIELD_MCP_HEARTBEAT_MS) || 15_000;
/** A client without an event stream counts as connected until it has been quiet this long. */
const IDLE_MS = Number(process.env.OPENHIGGSFIELD_MCP_IDLE_MS) || 10 * 60_000;
/** After its event stream closes, a session stays connected this long (a reconnecting stream comes back within it). */
const GRACE_MS = Number(process.env.OPENHIGGSFIELD_MCP_STREAM_GRACE_MS) || 6_000;

const PROCESS_ID = randomUUID();
const sessions = new Map<string, SessionInfo>();
let timer: ReturnType<typeof setInterval> | null = null; let pushT: ReturnType<typeof setTimeout> | null = null; let lastSent = '';

export function isLive(s: SessionInfo, at = Date.now()): boolean {
  if (s.ended) return false;
  if (s.streams > 0) return true;
  if (s.everStream) return at - Math.max(s.lastSeen, s.streamClosedAt ?? 0) < GRACE_MS;
  return at - s.lastSeen < IDLE_MS;
}
export const liveSessions = () => [...sessions.values()].filter((s) => isLive(s));

/** Send the live list now (debounced a little), and only when it changed; the heartbeat re-sends it regardless. */
function push(force = false) {
  if (pushT) return;
  pushT = setTimeout(() => {
    pushT = null;
    const live = liveSessions().map((s) => ({ id: s.id, client: s.client, clientVersion: s.clientVersion, transport: s.transport, since: s.since, lastSeen: s.lastSeen, stream: s.streams > 0 }));
    const sig = JSON.stringify(live.map((s) => [s.id, s.client, s.stream]));
    if (!force && sig === lastSent) return;
    lastSent = sig;
    void fetch(`${API}/api/canvas/agent/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ process_id: PROCESS_ID, sessions: live }) }).catch(() => { lastSent = ''; /* the app is down: try again on the next beat */ });
  }, force ? 0 : 120);
  (pushT as any).unref?.();
}
function ensureTimer() {
  if (timer) return;
  timer = setInterval(() => {
    /* forget long-gone sessions (their transports are closed by the caller through onForget) */
    const at = Date.now();
    for (const s of [...sessions.values()]) if (!isLive(s, at) && at - s.lastSeen > IDLE_MS) { sessions.delete(s.id); forget?.(s.id); }
    lastSent = ''; push(true);
  }, HEARTBEAT_MS);
  (timer as any).unref?.();
  /* on a normal stop, say so at once (best effort; the app times the process out anyway) */
  const bye = () => { for (const s of sessions.values()) s.ended = true; void fetch(`${API}/api/canvas/agent/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ process_id: PROCESS_ID, sessions: [] }) }).catch(() => undefined).finally(() => process.exit(0)); setTimeout(() => process.exit(0), 800).unref(); };
  process.once('SIGINT', bye); process.once('SIGTERM', bye);
}
let forget: ((id: string) => void) | null = null;
/** Called when a long-dead session is dropped, so the HTTP side can close its transport. */
export const onForget = (f: (id: string) => void) => { forget = f; };

export function sessionStarted(id: string, clientInfo: { name?: unknown; title?: unknown; version?: unknown } | null | undefined, transport: 'http' | 'stdio') {
  const at = Date.now();
  const name = typeof clientInfo?.title === 'string' && clientInfo.title.trim() ? clientInfo.title : typeof clientInfo?.name === 'string' ? clientInfo.name : null;
  sessions.set(id, { id, client: name?.trim().slice(0, 60) || null, clientVersion: typeof clientInfo?.version === 'string' ? clientInfo.version.slice(0, 40) : null, transport, since: at, lastSeen: at, streams: 0, everStream: false, streamClosedAt: null, ended: false });
  ensureTimer(); push();
}
export function sessionSeen(id: string) { const s = sessions.get(id); if (!s) return; const was = isLive(s); s.lastSeen = Date.now(); if (!was) push(); }
export function streamOpened(id: string) { const s = sessions.get(id); if (!s) return; s.streams += 1; s.everStream = true; s.lastSeen = Date.now(); push(); }
export function streamClosed(id: string) {
  const s = sessions.get(id); if (!s) return; s.streams = Math.max(0, s.streams - 1); s.streamClosedAt = Date.now();
  /* re-check just after the grace: still no stream → it left */
  const t = setTimeout(() => push(), GRACE_MS + 200); (t as any).unref?.();
}
export function sessionEnded(id: string) { const s = sessions.get(id); if (!s) return; s.ended = true; sessions.delete(id); push(); }
