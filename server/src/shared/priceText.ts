/**
 * Shared formatting of dollar prices for the server
 * (MCP quotes, notes), the web (Generate, model rows and menus, the hover card, Run on, Compare, quote sheets, Canvas, Spend) and tests.
 * Isomorphic: no server imports, safe in the browser.
 *
 *  - The UI shows US dollars only: "≈ $0.76", "Free · this computer", "$5.72 left on Comfy", "Cost $0.75 (quoted $0.76)".
 *  - A provider's own unit (Comfy credits, BFL credits) appears only in a hover / detail line, for checking against a bill:
 *    "160 Comfy credits · on your Creator plan · price checked 2026-10-26".
 *  - The app's internal ledger unit (1 = $0.01: quote.credits, job.cost, spend rows) stays in the API and the ledger, and is shown as
 *    dollars (ledgerUsd), never as "credits".
 *  - Comfy plans: one table (COMFY_PLANS) with source and date. Every plan and top-up works out to about 211 Comfy credits per $1, so the
 *    $ figure is the same on every plan; the plan only shows in the detail line.
 */
import { fmtUsd } from './runCost.js';
import { COMFY_CREDITS_PER_USD, USD_PER_CREDIT } from './hostedPrices.js';
import { LOCAL_FREE } from './modelIds.js';

export { fmtUsd, LOCAL_FREE, COMFY_CREDITS_PER_USD };

// ---------------------------------------------------------------- Comfy plans (one table, source + date)
export type ComfyPlanId = 'standard' | 'creator' | 'pro' | 'payg';
export interface ComfyPlan {
  id: ComfyPlanId; label: string;
  /** Monthly billing: USD per month and the Comfy credits it includes (null for pay as you go). */
  usdPerMonth: number | null; creditsPerMonth: number | null;
  /** Yearly billing: USD per year and credits per year, as published (null for pay as you go). */
  usdPerYear: number | null; creditsPerYear: number | null;
  /** Comfy credits per $1 on this plan with monthly billing (top-ups: Comfy's published 211). */
  creditsPerUsd: number;
  sourceUrl: string; checkedAt: string; note?: string;
}
const PRICING_URL = 'https://www.comfy.org/cloud/pricing';
/** Comfy's own statement of the rate ("211 credits = $1 USD"); also in the local docs copy (tutorials/partner-nodes/concurrency-limits). */
export const COMFY_RATE_URL = 'https://docs.comfy.org/tutorials/partner-nodes/concurrency-limits';
const r1 = (n: number) => Math.round(n * 10) / 10;
export const COMFY_PLANS: readonly ComfyPlan[] = [
  // comfy.org/cloud/pricing, read 2026-10-26: monthly price, and credits per year (the page lists yearly totals; ÷ 12 = monthly)
  { id: 'standard', label: 'Standard', usdPerMonth: 20, creditsPerMonth: 4200, usdPerYear: 192, creditsPerYear: 50400, creditsPerUsd: r1(4200 / 20), sourceUrl: PRICING_URL, checkedAt: '2026-10-26' },
  { id: 'creator', label: 'Creator', usdPerMonth: 35, creditsPerMonth: 7400, usdPerYear: 336, creditsPerYear: 88800, creditsPerUsd: r1(7400 / 35), sourceUrl: PRICING_URL, checkedAt: '2026-10-26' },
  { id: 'pro', label: 'Pro', usdPerMonth: 100, creditsPerMonth: 21100, usdPerYear: 960, creditsPerYear: 253200, creditsPerUsd: r1(21100 / 100), sourceUrl: PRICING_URL, checkedAt: '2026-10-26' },
  { id: 'payg', label: 'Pay as you go', usdPerMonth: null, creditsPerMonth: null, usdPerYear: null, creditsPerYear: null, creditsPerUsd: COMFY_CREDITS_PER_USD, sourceUrl: COMFY_RATE_URL, checkedAt: '2026-10-24',
    note: 'Top-ups (no plan, or credits beyond the plan): Comfy says 211 credits = $1.' },
] as const;
export const COMFY_PLAN_IDS = COMFY_PLANS.map((p) => p.id);
export const comfyPlanOf = (id: string | null | undefined): ComfyPlan | null => COMFY_PLANS.find((p) => p.id === id) ?? null;
export const isComfyPlanId = (id: unknown): id is ComfyPlanId => typeof id === 'string' && COMFY_PLANS.some((p) => p.id === id);
/** "Comfy Creator plan", "Comfy pay as you go". */
export const comfyPlanName = (id: string | null | undefined): string | null => { const p = comfyPlanOf(id); return !p ? null : p.id === 'payg' ? 'Comfy pay as you go' : `Comfy ${p.label} plan`; };
/** "on your Creator plan", "pay as you go". */
export const onPlanWords = (id: string | null | undefined): string | null => { const p = comfyPlanOf(id); return !p ? null : p.id === 'payg' ? 'pay as you go' : `on your ${p.label} plan`; };
/** A plan's rate line: "$35 / month for 7,400 Comfy credits (about 211 per $1)". */
export function planRateText(p: ComfyPlan): string {
  if (p.usdPerMonth == null || p.creditsPerMonth == null) return `${p.creditsPerUsd} Comfy credits per $1`;
  return `$${p.usdPerMonth} / month for ${p.creditsPerMonth.toLocaleString('en-US')} Comfy credits (about ${Math.round(p.creditsPerUsd)} per $1)`;
}

// ---------------------------------------------------------------- dollars
/** The app's internal ledger unit (1 = $0.01) as dollars. */
export const ledgerToUsd = (credits: number): number => Math.round(credits * USD_PER_CREDIT * 1e4) / 1e4;
/** An internal ledger amount in words: 8 → "$0.08". Never "credits". */
export const ledgerUsd = (credits: number | null | undefined): string => (credits == null || !Number.isFinite(credits) ? '—' : fmtUsd(ledgerToUsd(credits)));
/** THE price token: "≈ $0.76" (an estimate), "$0.76", "≈ up to $0.05" (billed on the real output). Dollars only. */
export const usdToken = (usd: number, o: { approx?: boolean; upTo?: boolean } = {}): string => `${o.approx || o.upTo ? '≈ ' : ''}${o.upTo ? 'up to ' : ''}${fmtUsd(usd)}`;
/** A balance: "$5.72 left on Comfy" (no place: "$5.72 left"). */
export const balanceText = (usd: number, place?: string | null): string => `${fmtUsd(usd)} left${place ? ` on ${place}` : ''}`;
/** After a run: "Cost $0.75 (quoted $0.76)" when the provider reported the real cost, else "Cost ≈ $0.76 (estimate)". Same figures: "Cost $0.76". */
/** gpuTime: a Comfy Cloud workflow billed by GPU time (2026-10-27): the estimate says so, since the bill follows how long the GPU ran. */
export function costLine(o: { actualUsd?: number | null; quotedUsd?: number | null; local?: boolean; sample?: boolean; gpuTime?: boolean }): string | null {
  if (o.local) return 'Free · on your computer';
  if (o.sample) return 'Sample · nothing billed';
  const a = o.actualUsd != null && Number.isFinite(o.actualUsd) ? o.actualUsd : null; const q = o.quotedUsd != null && Number.isFinite(o.quotedUsd) ? o.quotedUsd : null;
  if (a != null) return q != null && fmtUsd(q) !== fmtUsd(a) ? `Cost ${fmtUsd(a)} (quoted ${fmtUsd(q)})` : `Cost ${fmtUsd(a)}`;
  if (q != null) return q > 0 ? `Cost ≈ ${fmtUsd(q)} (${o.gpuTime ? 'estimate · billed by GPU time' : 'estimate'})` : 'Free';
  return null;
}

// ---------------------------------------------------------------- the detail line (hover only)
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** Comfy credits for a USD figure (rounded UP, like the server's quote: never below the bill). */
export const comfyCreditsFor = (usd: number, rate = COMFY_CREDITS_PER_USD): number => Math.max(1, Math.ceil(Math.round(usd * rate * 100) / 100));
/** "160 Comfy credits · on your Creator plan · price checked 2026-10-26". Every part optional; null when nothing to say. */
export function unitsDetail(o: { units?: number | null; unitLabel?: string | null; plan?: string | null; checkedAt?: string | null; estimated?: boolean }): string | null {
  const parts: string[] = [];
  if (o.units != null && Number.isFinite(o.units) && o.units > 0 && o.unitLabel) parts.push(`${Math.round(o.units).toLocaleString('en-US')} ${o.unitLabel}`);
  const plan = /comfy/i.test(String(o.unitLabel ?? '')) ? onPlanWords(o.plan) : null; if (plan) parts.push(plan);
  if (o.checkedAt) parts.push(`price checked ${o.checkedAt}`);
  return parts.length ? cap(parts.join(' · ')) : null;
}
/** The detail line of a quote's cost object (server costOf: estUnits, unitLabel, checkedAt, plan). */
export const costDetail = (c: { estUnits?: number; unitLabel?: string; checkedAt?: string | null; plan?: string | null; billedTo?: string } | null | undefined, calls = 1): string | null =>
  !c || c.billedTo === 'local' ? null : unitsDetail({ units: c.estUnits != null ? c.estUnits * calls : null, unitLabel: c.unitLabel, plan: c.plan, checkedAt: c.checkedAt });
/** A balance's detail line: "1,207 Comfy credits · on your Creator plan · checked 5 min ago". */
export function balanceDetail(o: { units?: number | null; unitLabel?: string | null; plan?: string | null; checked?: string | null }): string | null {
  const parts: string[] = [];
  if (o.units != null && Number.isFinite(o.units) && o.unitLabel && !/^usd$/i.test(o.unitLabel)) parts.push(`${Math.floor(o.units).toLocaleString('en-US')} ${o.unitLabel}`);
  const plan = /comfy/i.test(String(o.unitLabel ?? '')) ? onPlanWords(o.plan) : null; if (plan) parts.push(plan);
  if (o.checked) parts.push(`checked ${o.checked}`);
  return parts.length ? cap(parts.join(' · ')) : null;
}
