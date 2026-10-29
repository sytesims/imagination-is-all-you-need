/** Thin client for the Imagination Is All You Need HTTP API (OPENHIGGSFIELD_API, default http://localhost:${PORT || 8787}). */
import { openAsBlob } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

export const API = (process.env.OPENHIGGSFIELD_API || `http://localhost:${Number(process.env.PORT) || 8787}`).replace(/\/$/, ''); // follows PORT, like the web app's proxy
export const abs = (u: string | null | undefined) => (!u ? null : /^https?:/.test(u) ? u : `${API}${u}`);
/** BH9 (d): where people open results: the web app (PUBLIC_WEB_URL / OPENHIGGSFIELD_PUBLIC_WEB_URL, default the web dev origin http://localhost:${WEB_PORT || 5174},
 *  which proxies /files and /api). Links handed to the user (job page, output URLs, resource links) use it; the MCP server itself still fetches from API. */
export const WEB = (process.env.PUBLIC_WEB_URL || process.env.OPENHIGGSFIELD_PUBLIC_WEB_URL || `http://localhost:${Number(process.env.WEB_PORT) || 5174}`).replace(/\/$/, '');
export const webLink = (u: string | null | undefined) => (!u ? null : /^https?:/.test(u) ? u : `${WEB}${u.startsWith('/') ? '' : '/'}${u}`);

export class ApiError extends Error { constructor(msg: string, public status: number, public body: any) { super(msg); } }
async function parse(r: Response) {
  const t = await r.text(); let b: any; try { b = JSON.parse(t); } catch { b = t; }
  if (!r.ok) {
    const issues = Array.isArray(b?.issues) && b.issues.length > 1 ? ` Issues: ${b.issues.map((i: any) => `${i.field}: ${i.message}`).join('; ')}` : '';
    throw new ApiError(`${r.status} ${b?.errorType ?? ''} ${b?.error ?? t}`.replace(/\s+/g, ' ').trim() + issues, r.status, b);
  }
  return b;
}

/** Agent budget (server/src/agentBudget.ts): this MCP process's current budget id, sent as X-OHF-Agent-Budget on every API call so the server can
 *  refuse runs over it. set_budget sets it; or the user pins one for the whole process with OPENHIGGSFIELD_AGENT_BUDGET_USD / _CREDITS (+ _NAME),
 *  created on first use, or OPENHIGGSFIELD_AGENT_BUDGET_ID (an existing budget). stdio = one process per client, so one budget per agent session. */
export const AGENT_HEADER = 'x-ohf-agent-budget';
const envBudget = { id: process.env.OPENHIGGSFIELD_AGENT_BUDGET_ID?.trim() || null, usd: process.env.OPENHIGGSFIELD_AGENT_BUDGET_USD?.trim() || null, credits: process.env.OPENHIGGSFIELD_AGENT_BUDGET_CREDITS?.trim() || null,
  name: process.env.OPENHIGGSFIELD_AGENT_NAME?.trim() || 'MCP agent' };
/** true when the user set the budget for this process (env): the agent can't replace it with set_budget. */
export const budgetLocked = () => !!(envBudget.id || envBudget.usd || envBudget.credits);
let budgetId: string | null = envBudget.id;
let creating: Promise<string | null> | null = null;
/** HTTP mode serves many clients from one process, so a budget set by one client must not become everyone's: there the budget is a handle
 *  (budget_id) passed per call, and only an env-pinned budget is process-wide. stdio = one client per process, so `budget set` also sets it here. */
let sharedBudget = true;
export const disableSharedBudget = () => { sharedBudget = false; };
export const sharedBudgetEnabled = () => sharedBudget;
export const setBudgetId = (id: string | null) => { if (sharedBudget || id === null) budgetId = id; };
/** A budget id for the calls made inside fn (X-OHF-Agent-Budget), overriding the process one: run/quote/status take budget_id. */
const budgetScope = new AsyncLocalStorage<string>();
export const withBudget = async <T>(id: string | null | undefined, fn: () => Promise<T>): Promise<T> => {
  if (id && budgetLocked() && id !== await currentBudgetId()) throw new Error('This MCP process has a pinned budget; budget_id cannot replace it.');
  return id ? budgetScope.run(id, fn) : fn();
};
/** The current budget id: a per-call budget_id first, else the process one (creating the env-pinned one on first use). null = no budget. */
export async function currentBudgetId(): Promise<string | null> {
  const scoped = budgetScope.getStore(); if (scoped) return scoped;
  if (budgetId || !(envBudget.usd || envBudget.credits)) return budgetId;
  creating ??= fetch(`${API}/api/agent/budgets`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: envBudget.name, budgetUsd: envBudget.usd, budgetCredits: envBudget.credits, client: 'openhiggsfield-mcp (env)' }) })
    .then(parse).then((b: any) => (budgetId = b.id)).finally(() => { creating = null; });
  return creating;
}
const ENV_AGENT_NAME = process.env.OPENHIGGSFIELD_AGENT_NAME?.trim() || null;
/** The connected client's own name (clientInfo.name, e.g. "claude-code"): per HTTP session (index.ts runs each request in it), or the one
 *  stdio client. The app turns it into "Claude Code" for the canvas. OPENHIGGSFIELD_AGENT_NAME wins when set. */
export const clientScope = new AsyncLocalStorage<string>();
let processClient: string | null = null;
export const setProcessClient = (name: string | null) => { processClient = name; };
const agentName = () => ENV_AGENT_NAME || clientScope.getStore() || processClient || 'Your AI';
/** This MCP server process, so a board knows which agent is listening (one agent per board; canvas_wait_for_message). */
const LISTENER_ID = randomUUID();
/** Every API call says it came from the MCP server (the canvas panel shows "Connected") and carries this session's agent budget. */
const hdr = async (h: Record<string, string> = {}) => { const id = await currentBudgetId(); return { ...h, 'x-ohf-mcp': '1', 'x-ohf-agent-name': agentName(), 'x-ohf-agent-listener': LISTENER_ID, ...(id ? { [AGENT_HEADER]: id } : {}) }; };
export const get = async (p: string) => fetch(`${API}${p}`, { headers: await hdr() }).then(parse);
export const post = async (p: string, body?: unknown) => fetch(`${API}${p}`, { method: 'POST', headers: await hdr(body ? { 'content-type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined }).then(parse);
export const patch = async (p: string, body: unknown) => fetch(`${API}${p}`, { method: 'PATCH', headers: await hdr({ 'content-type': 'application/json' }), body: JSON.stringify(body) }).then(parse);
export const del = async (p: string) => fetch(`${API}${p}`, { method: 'DELETE', headers: await hdr() }).then(parse);

/** A media input: absolute/relative local path (stdio use), http(s) URL, or a server path like /samples/sample-pattern.mp4. */
export async function blobOf(src: string): Promise<[Blob, string]> {
  if (/^https?:\/\//.test(src) || src.startsWith('/samples/') || src.startsWith('/files/')) {
    const r = await fetch(abs(src)!); if (!r.ok) throw new Error(`Could not fetch ${src}: ${r.status}`);
    return [await r.blob(), path.basename(new URL(abs(src)!).pathname) || 'file'];
  }
  const p = path.resolve(src); if (!existsSync(p)) throw new Error(`File not found: ${src}`);
  return [await openAsBlob(p), path.basename(p)];
}

export type Fields = Record<string, string | number | boolean | undefined | null>;
/** Submit a job: multipart with fields + files; one Idempotency-Key per call, reused on a network retry. */
export async function submit(toolId: string, fields: Fields, files: Record<string, string[] | undefined> = {}, idempotencyKey?: string) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null && v !== '') fd.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  for (const [k, list] of Object.entries(files)) for (const s of list ?? []) { const [b, n] = await blobOf(s); fd.append(k, b, n); }
  const key = idempotencyKey?.trim() || randomUUID(); // a client_request_id makes a retried call return the first job instead of starting a second paid one
  const headers = await hdr({ 'Idempotency-Key': key });
  const send = () => fetch(`${API}/api/tools/${encodeURIComponent(toolId)}/jobs`, { method: 'POST', body: fd, headers });
  let r: Response; try { r = await send(); } catch { await new Promise((res) => setTimeout(res, 800)); r = await send(); }
  return parse(r);
}
const DONE = new Set(['done', 'failed', 'canceled', 'blocked']);
/** Poll with the documented backoff (2 s ×1.5 → 10 s, reset on change) until finished or timeout. */
export async function waitFor(id: string, timeoutSec = 120, minMs = Number(process.env.OPENHIGGSFIELD_MCP_POLL_MS) || 2000, onTick?: (j: any) => void) {
  const end = Date.now() + timeoutSec * 1000; let delay = minMs; let last = '';
  for (;;) {
    const j = await get(`/api/jobs/${id}`); try { onTick?.(j); } catch { /* progress is best effort */ }
    if (DONE.has(j.status) || Date.now() > end) return j;
    const sig = `${j.status}|${j.stage}|${j.progress}`; delay = sig !== last ? minMs : Math.min(10_000, delay * 1.5); last = sig;
    await new Promise((r) => setTimeout(r, Math.min(delay, Math.max(0, end - Date.now()))));
  }
}

/** Upload one file to the media library (POST /api/media) → the saved item (url /files/…, type, width, height, duration). */
export async function uploadMedia(src: string) {
  const [b, n] = await blobOf(src); const fd = new FormData(); fd.append('file', b, n);
  return parse(await fetch(`${API}/api/media`, { method: 'POST', body: fd, headers: await hdr() }));
}
