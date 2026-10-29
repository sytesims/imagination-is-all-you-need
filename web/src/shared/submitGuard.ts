import { useEffect, useState } from 'react';
import { ledgerUsd } from './billing';
/**
 * Submit lock + server back-pressure:
 *  - in-flight createJob count per tool → Generate stays locked from click until the response (useSubmitting);
 *  - submit error text for queue_full / 402 partial groups (submitErrorMessage).
 */
const inflight = new Map<string, number>(); const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const isSubmitting = (toolId?: string) => (toolId ? (inflight.get(toolId) ?? 0) > 0 : [...inflight.values()].some((n) => n > 0));
export function beginSubmit(toolId: string) { inflight.set(toolId, (inflight.get(toolId) ?? 0) + 1); emit(); return () => { inflight.set(toolId, Math.max(0, (inflight.get(toolId) ?? 1) - 1)); emit(); }; }
const useTick = (on: boolean) => { const [, f] = useState(0); useEffect(() => { const g = () => f((n) => n + 1); subs.add(g); const t = on ? setInterval(g, 1000) : undefined; return () => { subs.delete(g); if (t) clearInterval(t); }; }, [on]); };
/** true while a createJob for this tool is in flight. */
export function useSubmitting(toolId?: string) { useTick(false); return isSubmitting(toolId); }

export interface SubmitErrorInfo { status: number; code?: string; limit?: number; queued?: number; retryAfterSec?: number; affordableGroups?: number; totalGroups?: number; partialCost?: number; needed?: number; balance?: number; idemKey?: string }
/** Clear user message for the structured submit errors (falls back to the server text). */
/** B18: a JSON 5xx body from the server (not the proxy's empty restart 500, which the module fetch retries). */
export const isServerErrorBody = (b: any, status: number): boolean => status >= 500 && !!b && (b.error === 'server_error' || b.errorType === 'server' || b.code === 'server_error' || typeof b.message === 'string');
/** B18: the "Technical details" line for a 5xx: the code and HTTP status only (the server logs the rest). */
export const serverErrorDetail = (b: any, status: number): string => `${String(b?.code || b?.error || 'server_error')} · HTTP ${Number(b?.status) || status}`;
/** B18: the user-facing message for any failed job POST (5xx → the server's message, else its `error`). */
export const httpErrorText = (b: any, status: number, fallback: string): string => isServerErrorBody(b, status) ? String(b.message || fallback) : (b?.code === 'idempotency_conflict' || b?.error === 'idempotency_conflict') ? String(b.message || fallback) : String(b?.error || b?.message || fallback);
export function submitErrorMessage(b: any, status: number): string {
  const code = b?.code ?? b?.errorType;
  if (status === 429 && code === 'queue_full') return `Your queue is full (${b.queued ?? b.limit} of ${b.limit} waiting). Wait for one to finish or cancel a queued job, then try again. Nothing was charged.`;
  if (status === 402 && b?.affordableGroups) return `Not enough balance for all ${b.totalGroups} reference groups (needs ${ledgerUsd(b.needed)}, you have ${ledgerUsd(b.balance)}). You can run ${b.affordableGroups} group${b.affordableGroups > 1 ? 's' : ''} for ${ledgerUsd(b.partialCost)}.`;
  if (code === 'route_not_runnable') return routeNotRunnableText(b);
  /* B18 (PB f6fd872): the server's own sentence for the 409 conflict ("This request was already sent with different details. Start a new one."). */
  if (code === 'idempotency_conflict' || b?.error === 'idempotency_conflict') return String(b?.message || 'This request was already sent with different details. Start a new one.');
  /* B18: every 5xx carries {error:'server_error', code, errorType:'server', status, message}; `error` is a code there, the words are in `message`. */
  if (isServerErrorBody(b, status)) return String(b.message || 'That didn’t work. Try again in a moment.');
  return b?.error || 'Upload failed';
}

/** B15: 409 route_not_runnable (a pinned route that can't run here, e.g. not wired yet). Plain words, no credits talk: nothing ran. */
export function routeNotRunnableText(b: any): string {
  /* B18 (item 8): the server's copy is plain now ("<route> isn't available on this server yet. Pick another place. Nothing was charged."); show it as is. */
  const srv = String(b?.userMessage ?? b?.error ?? b?.message ?? '').trim();
  if (srv && srv !== 'route_not_runnable') return /[.!?]$/.test(srv) ? srv : `${srv}.`;
  const r = Array.isArray(b?.routes) ? b.routes.find((x: any) => x?.routeId === b?.routeId) : null;
  const name = String(r?.displayName ?? r?.label ?? '').replace(/\s*·\s*(free|demo)$/i, '').trim();
  const nw = b?.reasonCode === 'not_wired' || r?.reasonCode === 'not_wired';
  return `${name || 'This route'} ${nw ? 'isn’t ready in this app yet' : 'can’t run right now'}. Pick another place in Run on.`;
}
