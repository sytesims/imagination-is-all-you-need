/**
 * Provider busy (2026-10-25): when a hosted provider says it is busy before it takes a request (HTTP 429, Comfy Router queue_full /
 * rate_limited / concurrency_limit_exceeded, MiniMax 1002, LTX's queue cap), the same request is sent again later instead of failing.
 *   - Only a refused SUBMIT is retried: the provider never started that request, so nothing runs twice and nothing is billed twice.
 *     Comfy Router submits keep their Idempotency-Key, so a refusal that in fact got through is replayed by Router, never run again.
 *   - The wait follows the provider's Retry-After (capped at BUSY_MAX_WAIT_MS), else 5 s, 10 s, 20 s… (OPENHIGGSFIELD_BUSY_RETRY_BASE_MS).
 *   - At most BUSY_RETRIES more tries (OPENHIGGSFIELD_BUSY_RETRIES, default 4), then the last error is thrown with .busy = true and
 *     .busyTries, so the runner fails the job with a plain "still busy" message (errorType temporary, the attempt refunded as usual).
 *   - Ledger: retries stay inside one route attempt: no new charge, no extra refund row (routing/run.ts).
 */
import { env } from './env.js';

export const BUSY_RETRIES = Math.max(0, Math.floor(Number(env('BUSY_RETRIES') ?? 4)) || 0);
export const BUSY_BASE_MS = Number(env('BUSY_RETRY_BASE_MS')) || 5000;
export const BUSY_MAX_WAIT_MS = Number(env('BUSY_MAX_WAIT_MS')) || 60_000;
/** Seconds-or-date Retry-After header → ms (null when absent / unreadable). */
export function retryAfterMs(h: Headers | null | undefined): number | null {
  const v = h?.get?.('retry-after'); if (v == null || v === '') return null;
  const n = Number(v); if (Number.isFinite(n) && n >= 0) return n * 1000;
  const t = Date.parse(v); return Number.isFinite(t) ? Math.max(0, t - Date.now()) : null;
}
/** The wait before try n+1 (n = retries already made). */
export const busyWaitMs = (n: number, ra?: number | null) => Math.min(BUSY_MAX_WAIT_MS, ra != null && ra >= 0 ? ra : BUSY_BASE_MS * 2 ** n);
/** The error a provider client throws for a busy answer (fal / Replicate submit 429). */
export class BusyError extends Error { busy = true; busyTries = 0; constructor(message: string, readonly httpStatus: number, readonly retryAfterMs: number | null) { super(message); } }
const sleepDefault = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
/** Run `fn`; while it throws an error `busyOf` reads as busy ({retryAfterMs}), wait and run it again, up to BUSY_RETRIES more times. */
export async function withBusyRetry<T>(fn: () => Promise<T>, o: { busyOf: (e: unknown) => { retryAfterMs?: number | null } | null; onWait?: (ms: number, n: number) => void;
  sleep?: (ms: number) => Promise<void>; scale?: number; deadline?: number; retries?: number; /** false: a read of a request already taken (status poll); the error isn't marked busy */ mark?: boolean }): Promise<T> {
  const max = o.retries ?? BUSY_RETRIES;
  for (let n = 0; ; n++) {
    try { return await fn(); } catch (e) {
      const b = o.busyOf(e); if (!b) throw e;
      const wait = busyWaitMs(n, b.retryAfterMs) * (o.scale ?? 1);
      if (n >= max || (o.deadline != null && Date.now() + wait > o.deadline)) { if (o.mark !== false && e && typeof e === 'object') Object.assign(e, { busy: true, busyTries: n + 1 }); throw e; }
      o.onWait?.(wait, n + 1); await (o.sleep ?? sleepDefault)(Math.max(0, wait));
    }
  }
}
/** Plain sentence for a run that stayed busy (follows "<place> failed: "). */
export const stillBusyMessage = (tries: number) => `it stayed busy and didn't take the request after ${tries} ${tries === 1 ? 'try' : 'tries'}. Nothing was run there. Try again in a few minutes`;
/** The waiting card's reason while a busy provider is retried ("Comfy Router is busy: trying again in 20 s"). */
export const busyReason = (name: string, ms: number) => `${name} is busy: trying again in ${Math.max(1, Math.round(ms / 1000))} s`;
