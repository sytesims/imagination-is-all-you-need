import { all, getKv, put, setKv, db } from './db.js';
import { env } from './env.js';
import { config } from './config.js';
import { teamMode, billingMode } from './billingMode.js';
/**
 * 'No credits, local' mode is always on (since the 2026-10-16 pricing override): LOCAL_FREE is the constant true in every backend, and the
 * OPENHIGGSFIELD_LOCAL_FREE env var (and its OPENJUTSU_ alias) is ignored; there is no opt-out. Local and open-weights runs cost 0 credits.
 * Hosted providers keep their price (they bill a third-party account).
 */
/** PRICING OVERRIDE 2026-10-16: open weights are ALWAYS free (no opt-out; OPENHIGGSFIELD_LOCAL_FREE is ignored). Hosted runs keep their official price. */
export const LOCAL_FREE: boolean = true;
export const isLocalFree = (providerKind?: string) => !providerKind || providerKind === 'open-weights';
/**
 * Credit ledger (1 credit = $0.01), persisted in SQLite.
 * CLEANROOM account-and-credits: cost shown before run; failed runs refunded automatically;
 * queued runs cancellable for an instant refund; usage log of every deduction/refund.
 */
export interface LedgerEntry { id: number; ts: number; kind: 'grant' | 'charge' | 'refund' | 'expire'; amount: number; balance: number; jobId?: string; toolId?: string; provider?: string; note: string }
const START = Number(env('GPU_CREDITS')) || 36_000; // ~10 GPU-hours
const entries: LedgerEntry[] = all<LedgerEntry>('ledger').sort((a, b) => a.id - b.id);
let seq = entries.at(-1)?.id ?? 0;
let balance = entries.at(-1)?.balance ?? 0;
/** Rows another process wrote to the same DB (e.g. a watch restart overlapping the old process): pulled in before every write,
 * so ids never collide and refund caps see the other process's refunds (live 2026-10-17: job a78b155f refunded 400 twice, rows 696/697). Read-only. */
const newerRows = db.prepare('SELECT data FROM ledger WHERE CAST(id AS INTEGER) > ? ORDER BY CAST(id AS INTEGER)');
function syncFromDb() { for (const r of newerRows.all(seq) as { data: string }[]) { const row = JSON.parse(r.data) as LedgerEntry; entries.push(row); seq = row.id; balance = row.balance; } }
const add = (e: Omit<LedgerEntry, 'id' | 'ts' | 'balance'>) => db.transaction(() => {
  syncFromDb(); balance += e.amount; const row = { ...e, id: ++seq, ts: Date.now(), balance }; entries.push(row); put('ledger', row.id, row);
}).immediate();
/** Credits still refundable for a charge key: charged − every refund row already written for it (any process). */
const refundable = (key: string) => entries.reduce((s, e) => (e.jobId !== key ? s : e.kind === 'charge' ? s - e.amount : e.kind === 'refund' ? s - e.amount : s), 0);


/**
 * Credit buckets: starter balance, top-ups, promos. Credits never expire (no subscriptions; 2026-10-18 cold open: "No subscription. No credits to expire.").
 * Spend order: starter first, then oldest. Refunds go back to the buckets the charge came from. expiresAt stays in the shape and is always null.
 */
/** source refund = credits back from a job whose original bucket was gone (restore() re-creates them as their own bucket). */
export interface Bucket { id: string; source: 'starter' | 'topup' | 'promo' | 'refund'; amount: number; remaining: number; expiresAt: number | null; createdAt: number }
const buckets: Bucket[] = getKv<Bucket[]>('creditBuckets', entries.length ? [{ id: 'start', source: 'starter', amount: balance, remaining: Math.max(0, balance), expiresAt: null, createdAt: entries[0]?.ts ?? Date.now() }] : []);
// Boot migration (in place, idempotent): 'subscription' → 'starter'; refund-<job> buckets stored as 'topup' → 'refund'; any old expiry is cleared (credits never expire).
{ let mig = false; for (const b of buckets) { if ((b.source as string) === 'subscription') { b.source = 'starter'; mig = true; } if (b.id.startsWith('refund-') && b.source === 'topup') { b.source = 'refund'; mig = true; } if (b.expiresAt != null) { b.expiresAt = null; mig = true; } } if (mig) setKv('creditBuckets', buckets); }
const used = new Map<string, [string, number][]>(Object.entries(getKv<Record<string, [string, number][]>>('bucketUse', {})));
/** Shortfall when a charge is larger than what the buckets hold (mock overdraft, or buckets that drifted from the entry balance).
 *  Kept here instead of driving a bucket negative (/api/usage showed remaining -256). Grants pay it back first; refunds of overdrawn charges reduce it. */
let overdraft = getKv<number>('creditOverdraft', 0);
for (const b of buckets) if (b.remaining < 0) { overdraft += -b.remaining; b.remaining = 0; } // normalise buckets saved by the old code
// An overdraft never coexists with credit left in another bucket: settle it from the remaining buckets (spend order) at load.
for (const b of [...buckets].sort((x, y) => (x.source === 'starter' ? 0 : 1) - (y.source === 'starter' ? 0 : 1) || x.createdAt - y.createdAt)) { if (overdraft <= 0) break; const p = Math.min(overdraft, Math.max(0, b.remaining)); b.remaining -= p; overdraft -= p; }
const saveBuckets = () => { setKv('creditBuckets', buckets); setKv('bucketUse', Object.fromEntries(used)); setKv('creditOverdraft', overdraft); };
export const getOverdraft = () => overdraft;
const order = (a: Bucket, b: Bucket) => (a.source === 'starter' ? 0 : 1) - (b.source === 'starter' ? 0 : 1) || a.createdAt - b.createdAt;
/** Credits never expire: nothing to sweep (kept as a no-op so old call sites stay valid). */
function sweep() { /* no expiry */ }
function consume(jobId: string, amount: number) {
  let left = amount; const take: [string, number][] = [];
  for (const b of [...buckets].sort(order)) { if (left <= 0) break; if (b.remaining <= 0) continue; const t = Math.min(b.remaining, left); b.remaining -= t; left -= t; take.push([b.id, t]); }
  if (left > 0) { overdraft += left; take.push(['overdraft', left]); } // never a negative bucket
  used.set(jobId, take); saveBuckets();
}
function restore(jobId: string, amount: number) {
  let left = amount; const take = used.get(jobId) ?? [];
  for (let i = take.length - 1; i >= 0 && left > 0; i--) { const [id, n] = take[i]; const b = buckets.find((x) => x.id === id); const r = Math.min(n, left); if (id === 'overdraft') overdraft = Math.max(0, overdraft - r); else if (b) b.remaining += r; take[i] = [id, n - r]; left -= r; }
  if (left > 0) buckets.push({ id: `refund-${jobId}`, source: 'refund', amount: left, remaining: left, expiresAt: null, createdAt: Date.now() });
  saveBuckets(); sweep();
}
export function grant(amount: number, source: Bucket['source'] = 'topup', note = '') { // grants never expire
  const pay = Math.min(overdraft, amount); overdraft -= pay; // a grant settles any overdraft first
  const b: Bucket = { id: `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, source, amount, remaining: amount - pay, expiresAt: null, createdAt: Date.now() };
  buckets.push(b); saveBuckets(); add({ kind: 'grant', amount, note: note || `${source} grant` });
  return b;
}
export const listBuckets = () => { sweep(); return [...buckets].sort(order); };
export const getBalance = () => { sweep(); return balance; };
/** Own-accounts mode (billingMode.ts): there is no app balance to run out of; providers bill the user's own accounts and spend limits (billing.ts) apply instead. */
export const canAfford = (n: number) => !teamMode() || getBalance() >= n;
/** Team mode only. In own-accounts mode nothing is charged to the app balance (the job is written to the spend log instead), so a later
 *  refund()/refundAttempt() finds no charge and returns 0. A job charged in team mode keeps its refund if the mode changes before it ends. */
export function charge(jobId: string, toolId: string, provider: string, amount: number) {
  if (!teamMode()) return;
  sweep();
  add({ kind: 'charge', amount: -amount, jobId, toolId, provider, note: `${amount} credits` });
  if (amount > 0) consume(jobId, amount);
}
const refunded = new Set<string>(getKv<string[]>('refunded', []));
export function refund(jobId: string, reason: string) {
  syncFromDb(); if (refunded.has(jobId)) return 0;
  const c = entries.find((e) => e.kind === 'charge' && e.jobId === jobId);
  if (!c) return 0;
  refunded.add(jobId); setKv('refunded', [...refunded]);
  const amt = Math.min(-c.amount - (partials.get(jobId) ?? 0), refundable(jobId)); if (amt <= 0) return 0;
  add({ kind: 'refund', amount: amt, jobId, toolId: c.toolId, provider: c.provider, note: reason });
  restore(jobId, amt);
  return amt;
}
/** Refund part of a job's charge (e.g. failed ref groups). Capped at what's left; later full refund() then only returns the rest. */
const partials = new Map<string, number>(Object.entries(getKv<Record<string, number>>('partialRefunds', {})));
export function refundPartial(jobId: string, amount: number, reason: string) {
  syncFromDb(); const c = entries.find((e) => e.kind === 'charge' && e.jobId === jobId);
  if (!c || refunded.has(jobId)) return 0;
  const left = Math.min(-c.amount - (partials.get(jobId) ?? 0), refundable(jobId)); const amt = Math.max(0, Math.min(left, Math.round(amount)));
  if (!amt) return 0;
  partials.set(jobId, (partials.get(jobId) ?? 0) + amt); setKv('partialRefunds', Object.fromEntries(partials));
  add({ kind: 'refund', amount: amt, jobId, toolId: c.toolId, provider: c.provider, note: reason });
  restore(jobId, amt);
  return amt;
}
/** Mock free-run allowance (useFree=1; swap tools at up to 720p). */
export const FREE_GENS_START = Number(env('FREE_GENS') ?? 3);
export const FREE_GENS_MAX_RES = '720p';
/** Optional team-mode credit top-up packs, without subscriptions. Credit amounts only: OPENHIGGSFIELD_TOPUP_PACKS="500,1000,2500,5000" overrides the default list.
 *  There is no payment integration, so no pack has a price: applying one is a source 'topup' grant (POST /api/ledger/grant, mock/dev only). */
export const TOPUP_PACKS: number[] = (() => { const v = (env('TOPUP_PACKS') ?? '').split(',').map((x) => Math.round(Number(x.trim()))).filter((n) => n > 0 && n <= 1_000_000); return v.length ? [...new Set(v)].sort((a, b) => a - b) : [500, 1000, 2500, 5000]; })();
let freeGens = getKv<number>('freeGens', FREE_GENS_START);
const freeJobs = new Set<string>(getKv<string[]>('freeJobs', []));
const saveFree = () => { setKv('freeGens', freeGens); setKv('freeJobs', [...freeJobs]); };
export const freeGensLeft = () => freeGens;
export function useFreeGen(jobId: string, toolId: string, provider: string) {
  freeGens--; freeJobs.add(jobId); saveFree();
  add({ kind: 'charge', amount: 0, jobId, toolId, provider, note: `free gen (${freeGens} left)` });
}
export function refundFreeGen(jobId: string, reason: string) {
  if (!freeJobs.delete(jobId)) return false;
  freeGens++; saveFree();
  add({ kind: 'refund', amount: 0, jobId, note: `${reason.replace(/:\s*(partial )?credits back to your (app )?balance$/i, '')}: free gen returned (${freeGens} left)` });
  return true;
}
if (!entries.length) { add({ kind: 'grant', amount: START, note: 'starting credit balance' }); buckets.push({ id: 'start', source: 'starter', amount: START, remaining: START, expiresAt: null, createdAt: Date.now() }); saveBuckets(); }
/** Hosted mode (OPENHIGGSFIELD_HOSTED=1): a new account gets a one-time 10-credit signup grant via the grants ledger. */
export const HOSTED = /^(1|true|on|yes)$/i.test(env('HOSTED') ?? '');
export const SIGNUP_GRANT = Number(env('SIGNUP_GRANT') ?? 10);
export function ensureSignupGrant(account = 'default') {
  const done = getKv<string[]>('signupGrants', []); if (!HOSTED || done.includes(account) || SIGNUP_GRANT <= 0) return null;
  setKv('signupGrants', [...done, account]); return grant(SIGNUP_GRANT, 'promo', `signup grant (${SIGNUP_GRANT} credits)`);
}
ensureSignupGrant();
/**
 * Ledger notes in plain words (DP ask #4, 2026-10-18; standing decision: credits go back to your balance, never "refunded").
 * New rows: "<what happened>: credits back to your balance" (sentence case, no raw route ids). The row kind stays 'refund' and
 * every API field name is unchanged. Older rows keep their stored text; plainNote() rewrites them on read (noteRaw keeps the original).
 */
export const CREDITS_BACK = 'credits back to your balance';
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const creditsBackNote = (what: string, partial = false) => `${cap(what.trim())}: ${partial ? 'partial ' : ''}${CREDITS_BACK}`;
/** "Run failed (temporary problem)" style prefix for a job that ended failed / blocked / canceled. */
export const runEndedWhat = (status: string, why?: string | null) => `Run ${status === 'cancelled' ? 'canceled' : status}${why ? ` (${why})` : ''}`;
export function plainNote(kind: LedgerEntry['kind'], note: string): string {
  const n = String(note ?? '').trim(); if (kind !== 'refund') return kind === 'charge' ? n.replace(/^free run \(/i, 'free gen (') : n; // older free-run charge rows said 'free run'; new rows say 'free gen'
  const free = /^(.*?):\s*free (?:gen|run) returned\s*(\(.*\))?\s*$/i.exec(n); // free-gen rows: "<reason>: free gen returned (N left)" (older rows said 'free run')
  if (free) { const w = plainNote('refund', free[1]).replace(/:\s*(partial )?credits back to your (app )?balance$/i, ''); return `${w}: free gen returned${free[2] ? ` ${free[2]}` : ''}`; }
  if (/^auto-refund$/i.test(n)) return creditsBackNote('Run did not finish');
  let m = /^canceled:\s*(\d+)\/(\d+) groups not started(, \d+ failed)?/i.exec(n); if (m) return creditsBackNote(`Run canceled, ${m[1]} of ${m[2]} groups not started${m[3] ?? ''}`, true);
  m = /^(\d+)\/(\d+) ref groups failed/i.exec(n); if (m) return creditsBackNote(`${m[1]} of ${m[2]} reference groups failed`, true);
  m = /^Credits back · run (failed|canceled|cancelled|blocked)(?:,\s*(.+))?$/i.exec(n); if (m) return creditsBackNote(runEndedWhat(m[1].toLowerCase(), m[2]));
  m = /^(failed|canceled|cancelled|blocked)\s*(?:\(([^)]+)\))?\s*(?::.*)?$/i.exec(n); if (m) return creditsBackNote(runEndedWhat(m[1].toLowerCase(), m[2] ? m[2].replace(/_/g, ' ') : null));
  if (/^route\s+\S+\s+failed\b/i.test(n)) return creditsBackNote('A run failed, trying the next one');
  const t = n.replace(/:\s*(partial )?credits back to (your )?(app )?balance\.?$/i, (_x, p) => `: ${p ?? ''}${CREDITS_BACK}`);
  return cap(t.replace(/\bauto-refund(ed)?\b/gi, 'credits back').replace(/\brefunded\b/gi, 'returned').replace(/\brefunds?\b/gi, 'credits back'));
}
const shown = (e: LedgerEntry): LedgerEntry & { noteRaw?: string } => { const p = plainNote(e.kind, e.note); return p === e.note ? e : { ...e, note: p, noteRaw: e.note }; };
export const ledger = () => ({ billingMode: billingMode(), localFree: LOCAL_FREE, balance: getBalance(), buckets: listBuckets(), overdraft, start: START, unit: 'credit (1 credit = $0.01)', freeGens, freeGensMaxRes: FREE_GENS_MAX_RES, entries: [...entries].reverse().map(shown) });
/**
 * Multi-provider routing (server/src/routing): refund ONE failed route attempt. Idempotent per `${jobId}#a${attemptN}`.
 * Attempt 1 is the job's own charge (keyed jobId, made by enqueue) → recorded as a partial so a later refund() only returns the rest.
 * Attempt N>1 was charged by the router as charge(`${jobId}#aN`, …) → that charge is refunded. Returns credits refunded.
 */
const attemptRefunds = new Set<string>(getKv<string[]>('attemptRefunds', []));
export function refundAttempt(jobId: string, attemptN: number, amount: number, reason = creditsBackNote('A route attempt failed')) {
  syncFromDb(); const key = `${jobId}#a${attemptN}`; if (attemptRefunds.has(key)) return 0;
  const chargeKey = attemptN === 1 ? jobId : key;
  const c = entries.find((e) => e.kind === 'charge' && e.jobId === chargeKey);
  if (!c || (attemptN === 1 && refunded.has(jobId))) return 0;
  const left = Math.min(-c.amount - (attemptN === 1 ? partials.get(jobId) ?? 0 : 0), refundable(chargeKey));
  const amt = Math.max(0, Math.min(left, Math.round(amount)));
  attemptRefunds.add(key); setKv('attemptRefunds', [...attemptRefunds]);
  if (!amt) return 0;
  if (attemptN === 1) { partials.set(jobId, (partials.get(jobId) ?? 0) + amt); setKv('partialRefunds', Object.fromEntries(partials)); }
  add({ kind: 'refund', amount: amt, jobId: chargeKey, toolId: c.toolId, provider: c.provider, note: reason });
  restore(chargeKey, amt);
  return amt;
}
/** Assets API: total credits refunded for a job (incl. router attempts `${jobId}#aN`). */
export function refundOf(jobId: string) {
  const mine = entries.filter((e) => e.jobId && (e.jobId === jobId || e.jobId.startsWith(`${jobId}#a`)));
  const amount = mine.filter((e) => e.kind === 'refund').reduce((s, e) => s + e.amount, 0);
  const charged = mine.filter((e) => e.kind === 'charge').reduce((s, e) => s - e.amount, 0);
  const attempts = 1 + new Set(mine.map((e) => e.jobId).filter((k) => k !== jobId)).size; // jobId + each #aN key
  return { refunded: amount > 0 || refunded.has(jobId), amount, charged, attempts };
}
/** Mock dev only (POST /api/dev/balance): set the balance to exactly `credits` (a grant up, or an 'expire' entry down so the ledger still adds up). */
export function setBalanceDev(credits: number) {
  const now = getBalance(); const d = Math.round(credits) - now;
  if (d > 0) grant(d, 'topup', `dev: balance set to ${credits}`);
  else if (d < 0) { let left = -d; for (const b of [...buckets].sort(order)) { if (left <= 0) break; const t = Math.min(Math.max(0, b.remaining), left); b.remaining -= t; left -= t; }
    saveBuckets(); add({ kind: 'expire', amount: d, note: `dev: balance set to ${credits}` }); }
  return getBalance();
}

/** /api/usage totals from what each row actually did to the balance (row.balance − previous row.balance), so
 * granted − charged + refunded − expired = balance always holds. Rows whose recorded amount differs from that effect
 * (a duplicate written by a second process) are listed in `discrepancies`. Buckets: Σremaining − overdraft vs balance. */
/**
 * One-time bucket repair (approved 2026-10-17): makes Σbucket.remaining − overdraft equal the entry balance after buckets drifted
 * (two server processes on one DB each kept their own in-memory buckets). The ledger balance is the source of truth and is NOT
 * changed: no ledger row is written or edited. A positive gap first settles any overdraft, then lands as one bucket `repair-<key>`;
 * a negative gap is taken from the buckets in spend order. Each repair is recorded once under kv 'bucketRepairs' (keyed) and
 * listed in usageTotals().discrepancies. Idempotent: a key already applied, or a zero gap, is a no-op (applied:false).
 */
export interface BucketRepair { key: string; ts: number; date: string; amount: number; reason: string; before: { remaining: number; overdraft: number; balance: number }; after: { remaining: number; overdraft: number; balance: number } }
const bucketRepairs: BucketRepair[] = getKv<BucketRepair[]>('bucketRepairs', []);
const bucketState = () => ({ remaining: buckets.reduce((s, b) => s + Math.max(0, b.remaining), 0), overdraft, balance: getBalance() });
export const listBucketRepairs = () => [...bucketRepairs];
export function repairBucketGap(key: string, reason: string): { applied: boolean; gap: number; repair: BucketRepair | null } {
  syncFromDb(); const prior = bucketRepairs.find((r) => r.key === key);
  if (prior) return { applied: false, gap: 0, repair: prior };
  const before = bucketState(); const gap = before.balance - (before.remaining - before.overdraft);
  if (gap === 0) return { applied: false, gap: 0, repair: null };
  if (gap > 0) { const pay = Math.min(overdraft, gap); overdraft -= pay; const rest = gap - pay;
    if (rest > 0) buckets.push({ id: `repair-${key}`, source: 'topup', amount: rest, remaining: rest, expiresAt: null, createdAt: Date.now() }); }
  else { let left = -gap; for (const b of [...buckets].sort(order)) { if (left <= 0) break; const t = Math.min(Math.max(0, b.remaining), left); b.remaining -= t; left -= t; } overdraft += left; }
  const ts = Date.now(); const repair: BucketRepair = { key, ts, date: new Date(ts).toISOString(), amount: gap, reason, before, after: bucketState() };
  bucketRepairs.push(repair); setKv('bucketRepairs', bucketRepairs); saveBuckets();
  return { applied: true, gap, repair };
}
export function usageTotals() {
  syncFromDb(); const t = { granted: 0, charged: 0, refunded: 0, expired: 0 };
  const discrepancies: { id: number | null; kind: string; jobId: string | null; amount: number; effective: number; note: string; date?: string; key?: string }[] = [];
  let prev = 0;
  for (const e of [...entries].sort((a, b) => a.id - b.id)) {
    const eff = e.balance - prev; prev = e.balance;
    if (eff !== e.amount) discrepancies.push({ id: e.id, kind: e.kind, jobId: e.jobId ?? null, amount: e.amount, effective: eff, note: e.note });
    if (e.kind === 'grant') t.granted += eff; else if (e.kind === 'charge') t.charged += -eff; else if (e.kind === 'refund') t.refunded += eff; else if (e.kind === 'expire') t.expired += -eff;
  }
  // bucket repairs: no ledger row (balance unchanged, effective 0); `amount` is what was credited (+) / debited (−) to the buckets
  for (const r of bucketRepairs) discrepancies.push({ id: null, kind: 'bucket-repair', jobId: null, amount: r.amount, effective: 0, note: r.reason, date: r.date, key: r.key });
  const bal = getBalance(); const computed = t.granted - t.charged + t.refunded - t.expired;
  const bucketsRemaining = buckets.reduce((s, b) => s + Math.max(0, b.remaining), 0);
  const recorded = entries.reduce((s, e) => s + e.amount, 0);
  return { ...t, overdraft, computed, balance: bal, reconciles: computed === bal, unaccounted: bal - computed, recordedSum: recorded, recordedDrift: recorded - bal, discrepancies,
    buckets: { remaining: bucketsRemaining, overdraft, reconciles: bucketsRemaining - overdraft === bal, drift: bucketsRemaining - overdraft - bal } };
}
