/** Real costs, not a fake balance (decision 2026-10-21). One client store for the billing mode and provider rules
 *  (GET /api/settings/billing), today's / this month's spend (GET /api/spend/summary) and connected accounts (GET /api/accounts).
 *  'own-accounts' (default): prices are the estimated cost on the account that bills it; 'team': the old credits ledger. */
import { useEffect, useState } from 'react';
import { requestRequote } from './quote';
import { pollWithBackoff } from './backoff';
import { LOCAL_FREE } from '../../../server/src/shared/modelIds';
import { fmtUsd } from '../../../server/src/shared/runCost';
import { usdToken, costDetail, unitsDetail, comfyCreditsFor, costLine as costLineOf, ledgerUsd, type ComfyPlan, type ComfyPlanId } from '../../../server/src/shared/priceText';

export type BillingMode = 'own-accounts' | 'team';
export type FailureRule = 'not-charged' | 'may-charge' | 'unknown';
export interface ProviderBilling { id: string; name: string; failureRule: FailureRule; failureNote: string; failureSource: string | null; actualCost: 'per-job' | 'usage-only' | 'none'; actualNote: string; balance: 'api' | 'none'; balanceNote: string; scopedKeys: string; billingUrl: string | null; docsUrl: string | null }
export interface ComfyPlansView { plan: ComfyPlanId | null; name: string | null; picked: ComfyPlanId | null; detected: ComfyPlanId | null; source: 'picked' | 'detected' | null; detectNote: string; options: ComfyPlan[] }
export interface Billing { mode: BillingMode; modeLocked: boolean; canWrite: boolean; writeNote: string; comfyCreditsPerUsd: number; providers: ProviderBilling[]; plans?: { comfy: ComfyPlansView } }
export interface Cost { billedTo: string; billedToName: string; estUsd: number; estUnits?: number; unitLabel?: string; failureRule: FailureRule; failureNote: string; estimated: boolean; demo: boolean; realRunUsd: number | null; actualReported: boolean; /** D1: no published price, an estimate */ unconfirmed?: boolean; checkedAt?: string | null; sourceUrl?: string | null; plan?: ComfyPlanId | null; usdText?: string; detail?: string | null }
export interface SpendSummary { period: 'day' | 'month'; from: string; to: string; billingMode: BillingMode; providers: { provider: string; name: string; runs: number; demoRuns: number; estUsd: number; actualUsd: number | null; actualRuns: number; spentUsd: number; failureRule: FailureRule }[]; totals: { runs: number; estUsd: number; actualUsd: number; spentUsd: number; /** finished local runs: what the cheapest hosted route would have cost */ savedUsd?: number; savedRuns?: number } }
export interface Account { provider: string; name: string; connected: boolean; plan?: ComfyPlanId | null; balance?: number | null; balanceUnit?: string | null; balanceUsd?: number | null; monthSpendUsd?: number | null; fetchedAt: string | null; source: 'provider' | 'unavailable'; note: string; keyCheck?: 'ok' | 'rejected' | 'offline'; billingUrl: string | null; failureRule: FailureRule; failureNote: string; actualCost: string; mock?: { sample: true; balance: number; balanceUnit: string; balanceUsd: number; note: string } }

/** A tiny shared store: one fetch, many subscribers; refreshed on focus and on 'ohf:billing'. Polls every `everyMs`, slowing to 15 s
 *  (or `everyMs` when longer) while nothing changes, none while the tab is hidden. */
function store<T>(url: string, everyMs: number) {
  let cur: T | null = null; const subs = new Set<(v: T) => void>(); let timer: any = null; let inflight: Promise<void> | null = null;
  const refresh = () => (inflight ??= fetch(url).then(r => (r.ok ? r.json() : null)).then((v: T | null) => { if (v) { cur = v; subs.forEach(f => f(v)); } }).catch(() => undefined).finally(() => { inflight = null; }));
  const use = (): T | null => {
    const [v, setV] = useState<T | null>(cur);
    useEffect(() => { subs.add(setV); if (cur) setV(cur); if (!timer) { refresh(); timer = pollWithBackoff(() => refresh().then(() => JSON.stringify(cur, (k, x) => (k === 'to' ? undefined : x)) /* the window's end is "now": not a change */), { minMs: everyMs, maxMs: Math.max(everyMs, 15_000), pauseHidden: true }); addEventListener('focus', refresh); addEventListener('ohf:billing', refresh); addEventListener('oj:balance', refresh); }
      return () => { subs.delete(setV); if (!subs.size) { timer(); timer = null; removeEventListener('focus', refresh); removeEventListener('ohf:billing', refresh); removeEventListener('oj:balance', refresh); } }; }, []);
    return v;
  };
  return { use, refresh, get: () => cur };
}
const B = store<Billing>('/api/settings/billing', 30_000);
const DAY = store<SpendSummary>('/api/spend/summary?period=day', 8_000);
const MONTH = store<SpendSummary>('/api/spend/summary?period=month', 20_000);
const ACC = store<{ accounts: Account[]; mockBackend: boolean }>('/api/accounts', 60_000);
export const useBilling = B.use; export const useSpendDay = DAY.use; export const useSpendMonth = MONTH.use; export const useAccounts = ACC.use;
export const refreshAccounts = () => fetch('/api/accounts?refresh=1').then(() => ACC.refresh());
/** The mode for a quote: the quote's own billingMode first, else the store's. null while unknown (never flash a balance). */
export const modeOf = (b: Billing | null, q?: any): BillingMode | null => (q?.billingMode === 'team' || q?.billingMode === 'own-accounts' ? q.billingMode : b?.mode ?? null);
export function useOwnAccounts(q?: any): boolean | null { const b = useBilling(); const m = modeOf(b, q); return m == null ? null : m === 'own-accounts'; }

export async function saveBilling(patch: { mode?: BillingMode; comfyPlan?: ComfyPlanId | null }): Promise<Billing> {
  const r = await fetch('/api/settings/billing', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
  const j = await r.json().catch(() => null); if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
  await B.refresh(); dispatchEvent(new Event('ohf:billing')); dispatchEvent(new Event('oj:balance')); requestRequote(); return j as Billing;
}

export { fmtUsd } from '../../../server/src/shared/runCost';
export { ledgerUsd, usdToken, costLine, balanceText, unitsDetail, balanceDetail } from '../../../server/src/shared/priceText'; // one $ formatter for the web and the share receipt (shared/shareReceipt.ts)
export const isLocalCost = (c?: Cost | null) => !!c && c.billedTo === 'local';
/** Comfy credits per US dollar (Comfy bills 211 credits = $1); the server's figure once billing has loaded. */
export const comfyPerUsd = (): number => { const r = B.get()?.comfyCreditsPerUsd; return typeof r === 'number' && r > 0 ? r : 211; };
/** Comfy credits for a dollar amount (what Comfy bills; at least 1 for a priced run). */
export const comfyCr = (usd: number, rate = comfyPerUsd()): number => comfyCreditsFor(usd, rate); // shared/priceText.ts: rounded UP, never less than the bill
/** ONE price unit everywhere: dollars only (prices in dollars, 2026-10-26; server/src/shared/priceText.ts usdToken). `approx` puts '≈ ' in
 *  front of an estimate. A provider's own units (Comfy credits) are never in the token: they are the hover's detail line (priceDetail). */
export function usdPrice(usd: number, o: { approx?: boolean; upTo?: boolean } = {}): string { return usdToken(usd, o); }
/** The plan used in price details (Settings → Your plans), once billing has loaded. */
export const comfyPlanNow = (): ComfyPlanId | null => B.get()?.plans?.comfy.plan ?? null;
/** The hover / detail line of a price: '160 Comfy credits · on your Creator plan · price checked 2026-10-26'. From the quote's cost object when
 *  there is one (the server's exact units and date), else derived from the dollars on a Comfy place. null on Local / fal / … with no units. */
export function priceDetail(q: any, o: { credits?: number | null; calls?: number; runOn?: string | null } = {}): string | null {
  const calls = o.calls ?? 1; const c: Cost | null = q?.cost && typeof q.cost === 'object' ? q.cost : null;
  if (c) { if (c.billedTo === 'local') return null; return costDetail({ ...c, plan: c.plan ?? comfyPlanNow() }, calls); }
  const place = o.runOn ?? placeOfQuote(q); const credits = o.credits ?? (typeof q?.credits === 'number' ? q.credits : null);
  if (!isComfyPlace(place) || credits == null || !(credits > 0)) return null;
  return unitsDetail({ units: comfyCreditsFor((credits * calls) / 100, comfyPerUsd()), unitLabel: 'Comfy credits', plan: comfyPlanNow() });
}
/** A place id that Comfy bills (its credits are shown after the dollars). */
export const isComfyPlace = (runOn?: string | null) => runOn === 'comfy-cloud' || runOn === 'comfy-router' || runOn === 'comfy';
/** Where a quote / price object runs, as a place id: the server's runOn, else its cost's billedTo, else its route kind. */
export function placeOfQuote(q: any): string | null {
  if (!q || typeof q !== 'object') return null;
  if (typeof q.runOn === 'string' && q.runOn) return q.runOn;
  const b = q.cost && typeof q.cost === 'object' ? String(q.cost.billedTo ?? '') : ''; if (b === 'local') return 'local'; if (b === 'comfy') return 'comfy-cloud';
  const k = String(q.routeKind ?? q.kind ?? String(q.routeId ?? q.route ?? '').split(':')[0] ?? '');
  return k === 'local' ? 'local' : k === 'comfy-cloud' || k === 'comfy-router' || k === 'router' ? 'comfy-cloud' : b || k || null;
}
/** THE price text of a run from its ledger units (1 = $0.01, the server's USD × 100) or its dollars, for every list row and menu option
 *  (QA #7: the resolution / quality menus, model rows, Recreate, the video price, Workflows' "from", the queue). Same words as the
 *  Generate button for the same run:
 *    own accounts → '≈ $0.08' on any place (Comfy, fal, Replicate, BFL, a direct lab API), LOCAL_FREE locally;
 *    team mode    → '$0.08' (the ledger amount, exact; 'Free' locally).
 *  `own` null (billing not loaded yet) reads as own accounts. null = no price known. */
export function runPrice(o: { own: boolean | null; runOn?: string | null; credits?: number | null; usd?: number | null; calls?: number; approx?: boolean }): string | null {
  const calls = o.calls ?? 1; const team = o.own === false;
  if (o.runOn === 'local') return team ? 'Free' : LOCAL_FREE;
  const credits = o.credits != null && Number.isFinite(o.credits) ? o.credits * calls : null;
  const usd = !team && o.usd != null && Number.isFinite(o.usd) ? o.usd * calls : credits != null ? credits / 100 : null;
  if (usd == null) return null;
  if (team) { const c = credits ?? Math.round(usd * 100); return c > 0 ? ledgerUsd(c) : 'Free'; } // team mode: the ledger amount, in dollars (exact, no ≈)
  if (!(usd > 0)) return 'Free';
  return usdPrice(usd, { approx: o.approx !== false });
}
/** One option's price in a menu (resolution, quality): the Generate button's words, on the place the current quote runs on. */
export const optionPrice = (q: any, own: boolean | null, credits: number | null | undefined): string | null =>
  q?.demo === true ? null : runPrice({ own, credits, runOn: placeOfQuote(q) });
/** Words: LOCAL_FREE, '≈ $0.09 on Comfy', '≈ $0.42 on fal'. Dollars only; the units are in costTitle / priceDetail. */
export function costShort(c: Cost, calls = 1): string {
  if (c.billedTo === 'local') return LOCAL_FREE;
  return `≈ ${fmtUsd(c.estUsd * calls)} on ${c.billedToName}`;
}
/** The button's price token: short, never truncated (LOCAL_FREE, '≈ $0.09', '≈ $0.42'). Dollars only, from the server's own estUsd (never
 *  converted back from rounded credits); costShort / costTitle carry the words. */
export function costToken(c: Cost, calls = 1, upTo = false): string {
  if (c.billedTo === 'local') return LOCAL_FREE;
  return usdPrice(c.estUsd * calls, { approx: c.estimated !== false, upTo });
}
/** THE price token of a run (the Generate button and every picker row use it, so they never disagree): 'Sample' for a free sample run,
 *  LOCAL_FREE locally, '≈ $0.42' anywhere else; team mode '$0.64'. Units (Comfy credits) go in priceDetail, never in the token.
 *  `credits` is what the quote shows as a charge (shownCredits, ledger units); null = nothing known yet. */
export function priceToken(o: { q?: any; own: boolean; demo?: boolean; free?: boolean; credits?: number | null; calls?: number }): string | null {
  const calls = o.calls ?? 1; const cost: Cost | null = o.q?.cost && typeof o.q.cost === 'object' ? o.q.cost : null;
  if (o.demo) return 'Sample';
  if (o.own && cost && cost.billedTo === 'local') return LOCAL_FREE;
  if (o.own && cost && o.credits != null) return costToken(cost, calls, o.q?.upTo === true); // upTo: the bill follows the real output (Seed Audio): '≈ up to $0.05'
  if (o.free) return o.own ? LOCAL_FREE : 'Free';
  if (o.credits != null) return runPrice({ own: o.own, credits: o.credits, calls, runOn: o.own ? placeOfQuote(o.q) : null });
  return null;
}
export const RULE_TEXT: Record<FailureRule, string> = { 'not-charged': 'Failed runs aren’t charged', 'may-charge': 'A failed run may still be charged', unknown: 'Failed-run billing not published' };
/** Tooltip: where it's billed, that it's an estimate, and the provider's failure rule. */
export function costTitle(c: Cost): string {
  if (c.billedTo === 'local') return 'Runs locally: nothing is billed.';
  const d = costDetail({ ...c, plan: c.plan ?? comfyPlanNow() });
  if (c.unconfirmed) return `About ${fmtUsd(c.estUsd)} (estimate). This model has no published price yet, so the real cost is recorded after the run. Billed to your ${c.billedToName} account. If it fails: ${c.failureNote}`;
  return `Billed to your ${c.billedToName} account. Estimate: about ${fmtUsd(c.estUsd)}; the provider’s bill is the real figure.${d ? ` (${d})` : ''}${c.actualReported ? ` ${c.billedToName} reports the actual cost after the run.` : ''} If it fails: ${c.failureNote}`;
}
/** A demo's real-run price, dollars only: '≈ $0.07'. (`rate` kept for callers; units are not shown.) */
export function demoRealText(c: Cost | null | undefined, rate = comfyPerUsd()): string | null {
  void rate; if (!c || c.realRunUsd == null || !(c.realRunUsd > 0)) return null;
  return `≈ ${fmtUsd(c.realRunUsd)}`;
}
export const accountBalanceText = (a: Account): string | null => { const usd = a.balanceUsd ?? a.mock?.balanceUsd; if (usd == null) return null; return `${fmtUsd(usd)} left`; };
/** A balance we really know: read from the provider just now (never a mock sample). Comfy's reader takes summary.balance.amount_micros only;
 *  a plan's monthly or cloud credits sit in other fields, so a $0 there doesn't mean the account is empty: treated as unknown. */
export const knownBalanceUsd = (a: Account): number | null =>
  a.source === 'provider' && a.connected && a.balanceUsd != null && Number.isFinite(a.balanceUsd) && !(a.provider === 'comfy' && a.balanceUsd <= 0) ? a.balanceUsd : null;
export const ago =(iso: string | null | undefined): string => { if (!iso) return 'never'; const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(iso).toLocaleDateString(); };
/** Sync read for plain helpers (toasts, notes): true unless the server said team mode. Kicks off a load the first time. */
export const ownAccountsNow = (): boolean => { if (!B.get()) void B.refresh(); return B.get()?.mode !== 'team'; };
/** A job's cost (ledger units, 1 = $0.01) in own-accounts words: '≈ $0.42' (dollars only, any place). */
export const jobCostText = (credits: number, runOn?: string | null) => runPrice({ own: true, credits, runOn: runOn === 'local' ? null : runOn }) ?? `≈ ${fmtUsd(credits / 100)}`;
/** After a run, in dollars (prices in dollars, 2026-10-26): "Cost $0.75 (quoted $0.76)" when the provider reported the real cost, else
 *  "Cost ≈ $0.76 (estimate)"; "Free · this computer" locally; null when nothing is known. From the job's spend view (server costText), else
 *  from its own fields (actualUsd, cost in ledger units). `detail`: the provider's units for the hover. */
export function jobCostLine(j: any): { text: string; detail: string | null } | null {
  if (!j || typeof j !== 'object') return null; const sp = j.spend && typeof j.spend === 'object' ? j.spend : null;
  if (sp && typeof sp.costText === 'string' && sp.costText) return { text: sp.costText, detail: sp.costDetail ?? null };
  const local = j.runOn === 'local' || /^local:/.test(String(j.route ?? '')); const sample = !!(j.demo || j.isSample || j.input?.demo);
  const quoted = typeof j.cost === 'number' ? j.cost / 100 : null; const actual = typeof j.actualUsd === 'number' ? j.actualUsd : null;
  const text = costLineOf({ actualUsd: actual, quotedUsd: quoted, local: local && !(quoted && quoted > 0), sample }); return text ? { text, detail: null } : null;
}
/** The after-run amount alone ("$0.75 (quoted $0.76)", "≈ $0.76 (estimate)") for a sentence that names the account itself; null for samples
 *  and local runs (their own words say it). */
export const jobCostAmount = (j: any): string | null => { const t = jobCostLine(j)?.text ?? ''; return /^Cost /.test(t) ? t.slice(5) : null; };
