import { ownAccountsNow, ledgerUsd } from './billing';
/** One rule for the credits line on a failed or canceled run (Cleanroom, batch 9).
 *  heldBack: credits that were held and then returned to the app balance. The server records this in several places
 *  (refund.amount, job.refunded, routeAttempts[].refunded, "refunded (✦N total)" in the message), so take the largest.
 *  > 0: the "↩ N credits back to your balance" chip is the only credits line. 0 and nothing held: "No credits were charged". */
export function heldBack(job: any): number {
  /* Primary: the server's job.creditsBack {credits, attempts} (null = nothing went back). Older jobs without it: the legacy fields below. */
  if (job && 'creditsBack' in job) return job.creditsBack ? Number(job.creditsBack.credits) || 0 : 0;
  const attempts = Array.isArray(job?.routeAttempts) ? job.routeAttempts.reduce((s: number, a: any) => s + (Number(a?.refunded) || 0), 0) : 0;
  const inMsg = Number(/refunded \(✦\s*([\d,]+)/i.exec(String(job?.error ?? ''))?.[1]?.replace(/,/g, '') ?? 0) || 0;
  return Math.max(Number(job?.refund?.amount) || 0, Number(job?.refunded) || 0, attempts, inMsg);
}
/** True only when nothing was ever held: no credits back, and a zero / free / absent charge. */
export function nothingHeld(job: any): boolean {
  if (heldBack(job) > 0 || job?.refund?.freeGenReturned) return false;
  const c = job?.cost; return c == null || c === 0 || !!job?.free;
}
/** The server's message without its own credits sentences (the chip, or "No credits were charged", says that once). */
export const stripCreditSentences = (m: string) => m
  .replace(/\s*Each failed attempt was refunded \([^)]*\)\.?/gi, '')
  .replace(/\s*Refunded ✦\s*[\d,]+\.?/gi, '')
  .replace(/\s*(Credits|Free gen)[^.]*(refunded|returned)[^.]*\.?\s*(try again\.?)?/i, '')
  .replace(/\s*(Nothing was charged|No credits were charged)\.?/gi, '')
  .trim();
/** Per-attempt route notes ("✦N went back to your app balance, trying the next route."): neutral information, not a warning or error. */
export const isCreditsNote = (w: string) => /went back to your (app )?balance/i.test(w);
/** QA #7: a route note as shown. Own-accounts mode has no app balance, so the server's "; ✦N went back to your balance" part goes
 *  ("Comfy failed (…); trying the next route."); team mode keeps it. */
export const shownNote = (w: string, own = ownAccountsNow()) => own ? w.replace(/[;,.]?\s*✦\s*[\d,]+ went back to your (app )?balance,?/i, ';').replace(/;\s*;/, ';').replace(/;\s*$/, '.') : ledgerWords(w);
/** A server note's ledger amounts ("✦5") in dollars ("$0.05"): the app never shows its internal unit. */
export const ledgerWords = (w: string): string => w.replace(/✦\s*([\d,]+)/g, (_, n: string) => ledgerUsd(Number(n.replace(/,/g, ''))));

/** BH10 #10: what a cancel actually does to the balance. Only a charged run says credits go back. */
export function cancelText(job: any): string {
  const c = Number(job?.cost) || 0;
  if (job?.free) return 'Canceled · free gen returned';
  if (job?.runOn === 'local' || /^local:/.test(String(job?.route ?? ''))) return 'Canceled · it ran on your computer, so nothing was charged'; // a local run never reaches a provider
  if (ownAccountsNow()) return 'Canceled · nothing was sent to the provider'; // own-accounts mode: no app balance; a queued run never reached the provider
  return c > 0 ? `Canceled · ${ledgerUsd(c)} back to your balance` : 'Canceled · nothing was charged';
}
/** The "if it fails" promise only on runs that hold part of the team balance. */
export const ifFailsText = (job: any) => (Number(job?.cost) || 0) > 0 && !job?.free && !ownAccountsNow() ? ' If it fails, it goes back to your balance.' : '';
/** B14: the server's 409 "already processing" text always promises credits back; say it only when the job was charged. */
export const notCancellableText = (job: any, e: any) => e?.code === 'already_done' ? 'It finished before it could be canceled, so the result is kept.' : e?.status === 409 || e?.code === 'cannot_cancel_processing' || e?.errorType === 'not_cancellable' || e?.body?.errorType === 'not_cancellable' || /already processing/i.test(String(e?.message ?? ''))
  ? 'This job is already processing and can no longer be canceled. It will finish on its own.' + (typeof e?.charged === 'boolean' /* B15: the server says whether it was charged */ ? (e.charged && !e.free && !job?.free && !ownAccountsNow() ? ' If it fails, it goes back to your balance.' : '') : ifFailsText(job)) : String(e?.message ?? 'Could not cancel.');
