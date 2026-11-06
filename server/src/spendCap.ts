/**
 * Monthly spend cap (optional, off by default). The user picks a dollar limit per calendar month (local time) on the Spend page.
 * Before a paid run starts, spendGuard.ts (the one guard every run goes through: submit, retry, Try on, upscale, the move to another
 * route) asks capVerdict(): month-to-date spend (billing.ts monthToDateUsd, the same countedUsd the Spend page adds up) + this run's
 * price must stay at or under the cap. Free runs (local, sample, free gens) are never refused, even past the cap.
 * Stored in kv 'spend.cap' on this computer. This is separate from the per-provider limits removed on 2026-10-28 (their old kv row is
 * still never read).
 */
import { getKv, setKv } from './db.js';

const KV = 'spend.cap';
const MAX_USD = 1_000_000;
/** The saved monthly cap in USD, or null (off). */
export function spendCapUsd(): number | null {
  const v = getKv<{ monthlyUsd?: unknown }>(KV, {})?.monthlyUsd;
  if (v == null || v === '') return null; const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= MAX_USD ? Math.round(n * 100) / 100 : null;
}
/** null turns the cap off. Returns the saved value, or an error for a bad amount. */
export function saveSpendCap(v: unknown): { ok: true; monthlyUsd: number | null } | { ok: false; error: string } {
  if (v == null || v === '') { setKv(KV, { monthlyUsd: null }); return { ok: true, monthlyUsd: null }; }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > MAX_USD) return { ok: false, error: 'Enter an amount in dollars, from $0 up to $1,000,000, or turn the limit off.' };
  const usd = Math.round(n * 100) / 100; setKv(KV, { monthlyUsd: usd }); return { ok: true, monthlyUsd: usd };
}
/** The first moment of next month (local time): when the cap resets. */
export const nextMonthStart = (now = new Date()) => new Date(now.getFullYear(), now.getMonth() + 1, 1);
const money = (n: number) => `$${Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(2)}`;
const dayWords = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

export interface CapVerdict { ok: boolean; capUsd: number | null; spentUsd: number; runUsd: number; leftUsd: number | null; resetsOn: string; message?: string }
/** Pure check (tests call it directly). capUsd null = off. Allowed when runUsd is 0 or spent + run ≤ cap (to the cent). */
export function capVerdict(o: { capUsd: number | null; spentUsd: number; runUsd: number; now?: Date }): CapVerdict {
  const now = o.now ?? new Date(); const reset = nextMonthStart(now);
  const cents = (n: number) => Math.round(n * 100);
  const spent = Math.max(0, o.spentUsd); const run = Math.max(0, o.runUsd);
  const base = { capUsd: o.capUsd, spentUsd: spent, runUsd: run, leftUsd: o.capUsd == null ? null : Math.max(0, cents(o.capUsd) - cents(spent)) / 100, resetsOn: reset.toISOString() };
  if (o.capUsd == null || cents(run) <= 0 || cents(spent) + cents(run) <= cents(o.capUsd)) return { ok: true, ...base };
  return { ok: false, ...base, message: `This run would take you past your ${money(o.capUsd)} monthly limit. Raise it on the Spend page, or wait until ${dayWords(reset)}. Nothing was charged.` };
}
