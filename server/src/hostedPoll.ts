/**
 * Shared by every hosted runner (fal, Replicate, the direct lab APIs, Comfy Router, Comfy Cloud): keep polling the SAME remote id through
 * network blips, and fetch a finished result with a few tries (audit 2026-11-01 #4, #10).
 *
 * Why: a paid run keeps running (and billing) at the provider whatever happens on our side. One 502 or a Wi-Fi drop while polling used to fail
 * the job, so the user paid for a result we never collected. Now only a DEFINITE answer from the provider ends a run:
 *   - temporary (keep polling, back off): a network error, an unreadable body, HTTP 5xx / 408 / 429, or a provider error marked temporary;
 *   - final (stop at once): 404 / 410 (the provider no longer has it: RemoteGoneError) and every other 4xx / non-temporary provider error.
 * After POLL_MAX_MISSES temporary misses IN A ROW (any good read resets the count) the run stops with LostContactError: a plain sentence that
 * says it may still finish and bill, and the remote id stays on the job (job.remote) so it can be collected later.
 */
import { env } from './env.js';

/** Temporary misses in a row before a run gives up (cloudV2 used 20 before this was shared). */
export const POLL_MAX_MISSES = Number(env('POLL_MAX_MISSES')) || 20;
/** fal / Replicate poll pace (ms); OPENHIGGSFIELD_HOSTED_POLL_MS changes it (tests). */
export const HOSTED_POLL_MS = () => Number(env('HOSTED_POLL_MS')) || 1500;
/** Longest wait between two polls after misses (back-off: the poll pace × 2, 4, 8…, capped here). */
const MAX_BACKOFF_MS = 30_000;

const statusOf = (e: any): number | null => { const s = e?.httpStatus ?? e?.status; return typeof s === 'number' && s > 0 ? s : null; };
/** Is this poll / download error worth trying again on the same id? */
export function isTemporary(e: unknown): boolean {
  const x = e as any; const s = statusOf(x);
  if (s === 404 || s === 410) return false; // gone
  if (typeof x?.temporary === 'boolean') return x.temporary || s === 408; // our provider error classes say it themselves
  if (s != null) return s >= 500 || s === 408 || s === 429;
  return true; // no status: a network error, a timeout or an unreadable body
}
/** The provider no longer has this request (404 / 410 on its status). */
export class RemoteGoneError extends Error { readonly gone = true; constructor(readonly where: string, readonly httpStatus: number) { super(`${where} no longer has this job, so it was stopped`); } }
/** Too many temporary misses in a row: we lost contact; the provider may still finish (and bill) it. */
export class LostContactError extends Error {
  readonly lostContact = true; readonly temporary = true;
  constructor(readonly where: string, readonly misses: number, readonly last: unknown) {
    super(`lost contact with ${where} while it was running (${misses} checks in a row failed: ${String((last as any)?.message ?? last).slice(0, 160)}). It may still finish and bill your account; the request id is kept so the result can be collected later`);
  }
}
/** An HTTP error with its status, for the classifier. */
export const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });

/**
 * One poll loop's tolerance. read(fn) runs one status read: its value, or MISS after a temporary error (the caller waits wait(pollMs) and polls
 * again); a final error is thrown at once (404 / 410 as RemoteGoneError), and the Nth temporary miss in a row throws LostContactError.
 */
export const MISS: unique symbol = Symbol('poll miss');
export class PollTolerance {
  misses = 0;
  constructor(readonly where: string, readonly max = POLL_MAX_MISSES) {}
  async read<T>(fn: () => Promise<T>): Promise<T | typeof MISS> {
    try { const v = await fn(); this.misses = 0; return v; }
    catch (e) {
      if ((e as any)?.lostContact || (e as any)?.gone) throw e;
      if (!isTemporary(e)) { const s = statusOf(e); if (s === 404 || s === 410) throw Object.assign(new RemoteGoneError(this.where, s), { cause: e }); throw e; }
      if (++this.misses >= this.max) throw new LostContactError(this.where, this.misses, e);
      return MISS;
    }
  }
  /** The wait before the next poll: the normal pace, doubled per miss in a row (capped). */
  wait(pollMs: number) { return this.misses ? Math.min(MAX_BACKOFF_MS, pollMs * 2 ** Math.min(this.misses, 5)) : pollMs; }
}

/** Tests: no real waiting in the download back-off. */
let testSleep: ((ms: number) => Promise<void>) | null = null;
export const setRetrySleep = (s: ((ms: number) => Promise<void>) | null) => { testSleep = s; };
export const DOWNLOAD_TRIES = Number(env('DOWNLOAD_TRIES')) || 4;
/** The result was made (and paid for) but could not be saved here. The remote id stays on the job (job.remote), so Retry download can fetch it. */
export class DownloadError extends Error {
  readonly downloadFailed = true; readonly temporary = true;
  constructor(readonly where: string, readonly last: unknown, readonly tries: number) {
    super(`${where} finished the result (so it is paid for), but it couldn't be downloaded after ${tries} tries (${String((last as any)?.message ?? last).slice(0, 160)}). Use Retry download to fetch it again`);
  }
}
/**
 * Fetch a finished result with retries (back-off 1 s, 2 s, 4 s…). get(fresh) does one try; fresh = true after a failed try, so a runner that
 * can ask the provider for a new signed link (the result URL may have expired) does so. A final error (a 4xx other than 408 / 429 from the
 * same link twice) still gets the remaining tries when the runner can refresh the link; otherwise it stops. The last failure is a DownloadError.
 */
export async function withDownloadRetry<T>(where: string, get: (fresh: boolean) => Promise<T>, o: { tries?: number; canRefresh?: boolean; sleep?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const tries = Math.max(1, o.tries ?? DOWNLOAD_TRIES); const sleep = o.sleep ?? testSleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: unknown = null; let k = 0;
  for (; k < tries; k++) {
    try { return await get(k > 0); }
    catch (e) { last = e; if (!isTemporary(e) && !o.canRefresh) { k++; break; } if (k < tries - 1) await sleep(1000 * 2 ** k); }
  }
  throw new DownloadError(where, last, Math.min(k, tries));
}
