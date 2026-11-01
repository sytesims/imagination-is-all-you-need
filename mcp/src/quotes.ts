/**
 * The quote handshake: a paid run needs a fresh quote_id from `quote` for the same request. `run` refuses a paid job without one (or with one
 * for a different request, or older than QUOTE_TTL_MS), and sends the quoted credits and route to the app as quotedCredits / quotedRouteId, so
 * the app itself refuses (409 route_changed, nothing charged) if the price or the place changed since the quote. Free runs need no quote_id.
 * A quote starts ONE run (audit 2026-11-01 #6): useQuote takes it at once (before the submit, so two calls at the same moment can't both use it)
 * and remembers the job it started; a second use answers "already used, get a new quote". A submit the app refused (nothing started) gives it back.
 * Kept in memory for this process (HTTP mode: shared by the stateless per-request servers).
 */
import { randomBytes, createHash } from 'node:crypto';

export const QUOTE_TTL_MS = 15 * 60_000;
type Stored = { toolId: string; hash: string; credits: number; usd: number; routeId: string | null; at: number; /** set once a run took it: the job id, or 'pending' while its submit is on the way */ usedBy?: string; /** the client_request_id of that run: the same id again is a replay of it (the app returns the first job), never a second run */ clientKey?: string };
const quotes = new Map<string, Stored>();

const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stable((v as any)[k])])) : v;
/** What makes two requests the same run: tool, fields, media, model, place, draft (not seed, wait or idempotency key). */
export const requestHash = (r: { toolId: string; form: Record<string, unknown>; media: Record<string, string[]>; model?: string; run_on?: string; route?: string; draft?: boolean }) =>
  createHash('sha256').update(JSON.stringify(stable({ t: r.toolId, f: r.form, m: r.media, model: r.model ?? null, on: r.run_on ?? null, d: !!r.draft, ...(r.route ? { route: r.route } : {}) }))).digest('hex').slice(0, 32); // route only when sent: older hashes stay the same

export function issueQuote(s: Omit<Stored, 'at'>) {
  const now = Date.now(); for (const [k, v] of quotes) if (now - v.at > QUOTE_TTL_MS) quotes.delete(k);
  const id = `q_${randomBytes(9).toString('base64url')}`; quotes.set(id, { ...s, at: now });
  return { quote_id: id, expiresInSec: Math.round(QUOTE_TTL_MS / 1000) };
}
/** The stored quote for this request, or why it can't be used. */
export function checkQuote(id: string | undefined, toolId: string, hash: string): { ok: true; q: Stored } | { ok: false; reason: string } {
  if (!id) return { ok: false, reason: 'This run costs money, so it needs a quote_id: call quote with the same request, tell the user the price, then call run with that quote_id.' };
  const q = quotes.get(id);
  if (!q) return { ok: false, reason: `quote_id ${id} is unknown or expired (quotes last ${QUOTE_TTL_MS / 60000} min). Call quote again.` };
  if (Date.now() - q.at > QUOTE_TTL_MS) { quotes.delete(id); return { ok: false, reason: `quote_id ${id} expired. Call quote again.` }; }
  if (q.usedBy) return { ok: false, reason: `quote_id ${id} was already used${q.usedBy !== 'pending' ? ` to start job ${q.usedBy}` : ''}; a quote starts one run. Get a new quote (and the user's OK) for another run${q.usedBy !== 'pending' ? `, or call status {id:"${q.usedBy}"} to follow the first one` : ''}.` };
  if (q.toolId !== toolId || q.hash !== hash) return { ok: false, reason: `quote_id ${id} was for a different request (tool, fields, model or run_on changed). Quote this exact request again.` };
  return { ok: true, q };
}
/** checkQuote, then take the quote for this run (single use). Call done(jobId) after the submit, or release() when the app refused it (nothing started). */
export function useQuote(id: string | undefined, toolId: string, hash: string, clientKey?: string): { ok: true; q: Stored; done: (jobId: string) => void; release: () => void } | { ok: false; reason: string } {
  const prev = id ? quotes.get(id) : undefined;
  if (prev?.usedBy && clientKey && prev.clientKey === clientKey && prev.toolId === toolId && prev.hash === hash) return { ok: true, q: prev, done: () => {}, release: () => {} }; // a replay of the same run
  const c = checkQuote(id, toolId, hash); if (!c.ok) return c;
  const q = c.q; q.usedBy = 'pending'; if (clientKey) q.clientKey = clientKey;
  return { ok: true, q, done: (jobId) => { q.usedBy = jobId || 'pending'; }, release: () => { if (q.usedBy === 'pending') { delete q.usedBy; delete q.clientKey; } } };
}
