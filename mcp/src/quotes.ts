/**
 * The quote handshake: a paid run needs a fresh quote_id from `quote` for the same request. `run` refuses a paid job without one (or with one
 * for a different request, or older than QUOTE_TTL_MS), and sends the quoted credits and route to the app as quotedCredits / quotedRouteId, so
 * the app itself refuses (409 route_changed, nothing charged) if the price or the place changed since the quote. Free runs need no quote_id.
 * Kept in memory for this process (HTTP mode: shared by the stateless per-request servers).
 */
import { randomBytes, createHash } from 'node:crypto';

export const QUOTE_TTL_MS = 15 * 60_000;
type Stored = { toolId: string; hash: string; credits: number; usd: number; routeId: string | null; at: number };
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
  if (q.toolId !== toolId || q.hash !== hash) return { ok: false, reason: `quote_id ${id} was for a different request (tool, fields, model or run_on changed). Quote this exact request again.` };
  return { ok: true, q };
}
