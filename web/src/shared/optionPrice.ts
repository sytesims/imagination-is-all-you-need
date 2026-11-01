/** Live prices inside a bar's setting popups (2026-10-25; Video first, Image / Audio can adopt it). One rule: the price shown for an option
 *  is the Generate button's price once that option is picked, in the same words (priceToken).
 *   - per-second routes (quote.perSecond): seconds × rate on the client with the server's own rounding (server/src/shared/runCost.ts), and
 *     only when that rate reproduces the current quote exactly (a reference surcharge or a clamp makes it fall back to the server);
 *   - everything else (token-billed, flat, per-resolution tables, sound, references): POST /api/tools/:id/price-variants, ONE request for
 *     every visible option, each answer being that tool's GET /price with the option merged in. Debounced, cached per settings signature,
 *     never re-asked per drag frame. */
import { useEffect, useRef, useState } from 'react';
import { perSecondRun } from '../../../server/src/shared/runCost';
import { priceToken, fmtUsd } from './billing';
import { ledgerUsd } from '../../../server/src/shared/priceText';
import { shownCredits, useRequoteTick } from './quote';

/** The short form of a price token for tight slots ('Free · this computer' → 'Free'; a dollar token stays as it is); the full one is its tooltip. */
export const shortToken = (t: string): string => t.split(' · ')[0];

/** Credits an option would cost: the charge when it can run, the list price when only a key is missing (the button says so), else null. */
const optCredits = (q: any): number | null => q?.needsKey === true && typeof q.credits === 'number' ? q.credits : shownCredits(q);
/** The quote at `seconds` on the same per-second route, shaped like a quote (credits + cost), or null when the per-second rate can't
 *  reproduce the current quote (`q` priced at `curSeconds`): then the caller asks the server instead. */
export function perSecondAt(q: any, curSeconds: number, seconds: number): any | null {
  const ps = q?.perSecond; if (!ps || q.demo === true || typeof q.credits !== 'number' || optCredits(q) == null || !(curSeconds > 0) || !(seconds > 0)) return null; // a quote that can't run here isn't a price to scale
  const rate = Number(ps.exactUsd ?? ps.usd); if (!(rate > 0)) return null;
  const cost = q.cost && typeof q.cost === 'object' ? q.cost : null; const bt = String(cost?.billedTo ?? '');
  const now = perSecondRun(rate, curSeconds, bt); if (now.credits !== q.credits) return null;
  if (cost && bt !== 'local' && (cost.estUnits ?? null) !== now.estUnits) return null; // Comfy / BFL credits from another figure: ask the server
  const at = seconds === curSeconds ? now : perSecondRun(rate, seconds, bt);
  return { ...q, credits: at.credits, listCredits: q.listCredits != null ? at.credits : q.listCredits, exactUsd: at.exactUsd, duration: seconds,
    cost: cost ? { ...cost, estUsd: cost.estUsd === 0 ? 0 : at.estUsd, realRunUsd: cost.realRunUsd != null ? at.estUsd : null, ...(cost.estUnits != null ? { estUnits: at.estUnits } : {}) } : cost };
}

/** An option's price in the Generate button's words ('≈ $0.42', 'Free · this computer', team mode '$0.42'); null = not priced
 *  (a sample run, a refused setting, nothing known yet). */
export function optionToken(q: any, own: boolean | null): string | null {
  if (!q || q.demo === true || (typeof q.status === 'number' && q.status >= 400)) return null;
  const c = optCredits(q); if (c == null) return null;
  const free = c === 0 && (q.routeKind === 'local' || q.localRun === true);
  return priceToken({ q: q.needsKey === true && q.cost ? { ...q, cost: { ...q.cost, estUsd: q.cost.estUsd || c / 100 } } : q, own: own !== false, credits: c, free });
}
/** USD of a quote for differences (the estimate the token shows), else credits / 100. */
const usdOf = (q: any): number | null => { const c = optCredits(q); if (c == null || q?.demo === true || (q?.status ?? 200) >= 400) return null; const u = q?.cost?.estUsd; return typeof u === 'number' && u > 0 ? u : c / 100; };
/** What `b` adds over `a` ('+$0.20', both modes); null when it is the same price or either isn't known. */
export function priceDelta(a: any, b: any, own: boolean | null): string | null {
  const ua = usdOf(a), ub = usdOf(b); if (ua == null || ub == null) return null;
  const d = Math.round((ub - ua) * 1e4) / 1e4; if (Math.abs(d) < 0.0005) return null;
  if (own === false) { const dc = (optCredits(b) ?? 0) - (optCredits(a) ?? 0); return dc ? `${dc > 0 ? '+' : '−'}${ledgerUsd(Math.abs(dc))}` : null; }
  return `${d > 0 ? '+' : '−'}${fmtUsd(Math.abs(d))}`;
}
/** An option's price in a settings popup as what it changes ('+$0.20', '−$0.10'); null when it costs the same (the total stays on Generate).
 *  A sample run (mock) has no charge: the difference of the list prices, said so in the tooltip. */
export function optionDelta(cur: any, alt: any, own: boolean | null): string | null {
  if (cur?.demo !== true && alt?.demo !== true) return priceDelta(cur, alt, own);
  const list = (x: any): number | null => { const u = x?.cost?.realRunUsd ?? x?.exactUsd; return typeof u === 'number' && u > 0 ? u : null; };
  const a = list(cur), b = list(alt); if (a == null || b == null) return null; const d = Math.round((b - a) * 1e4) / 1e4; if (Math.abs(d) < 0.0005) return null;
  return `${d > 0 ? '+' : '−'}${fmtUsd(Math.abs(d))} · list price; sample run here, nothing billed`;
}
/** 'about 4 min' / 'about 3–5 min' / 'about 40 s' from a quote's eta {lowSec, highSec}. */
export function etaText(eta: { lowSec: number; highSec: number } | null | undefined): string | null {
  if (!eta || !(eta.highSec > 0)) return null; const lo = eta.lowSec, hi = eta.highSec;
  if (hi < 90) return `about ${Math.round((lo + hi) / 2)} s`;
  const a = Math.max(1, Math.round(lo / 60)), b = Math.max(1, Math.round(hi / 60)); return `about ${a === b ? a : `${a}–${b}`} min`;
}
/** A local run's line: 'Free · on your computer · about 4 min'. */
export const localLine = (q: any): string => ['Free', 'on your computer', etaText(q?.eta)].filter(Boolean).join(' · ');
/** Is this quote a free local run? */
export const isLocalQuote = (q: any): boolean => !!q && (q.routeKind === 'local' || q.localRun === true);
/** The rate line under a popup title: '$0.08 per second' (both modes); null when the route isn't billed per second. */
export function rateText(q: any, own: boolean | null): string | null {
  const ps = q?.perSecond; if (!ps || q.demo === true) return null;
  const usd = Number(ps.usd); const exact = `$${usd.toFixed(4).replace(/0{1,2}$/, '')}`; // the rate as published ($0.1716, $0.112, $0.08): 5 s × it = the price below
  return own === false ? `${ledgerUsd(Number(ps.credits))} per second` : `${usd >= 0.1 && Math.round(usd * 100) !== usd * 100 ? exact : fmtUsd(usd)} per second`;
}

export type Overrides = Record<string, string | number | null>;
const VCACHE = new Map<string, { p: Promise<Record<string, any> | null>; at: number }>();
/** POST /api/tools/:id/price-variants (identical calls within 8 s share one answer). */
export function quoteVariants(toolId: string, params: Record<string, string>, variants: Record<string, Overrides>): Promise<Record<string, any> | null> {
  const body = JSON.stringify({ params, variants }); const hit = VCACHE.get(`${toolId}\u0001${body}`); if (hit && Date.now() - hit.at < 8000) return hit.p;
  const p = fetch(`/api/tools/${encodeURIComponent(toolId)}/price-variants`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    .then(r => (r.ok ? r.json() : null)).then((d: any) => (d?.variants ?? null) as Record<string, any> | null).catch(() => null);
  VCACHE.set(`${toolId}\u0001${body}`, { p, at: Date.now() }); if (VCACHE.size > 60) VCACHE.delete(VCACHE.keys().next().value as string); return p;
}
/** The variant quotes for the options on screen. `base` = the page's own quote params (null = nothing to ask yet); each variant names the
 *  fields it changes. Answers are kept per (base, variant), so only options not asked yet are fetched (debounced, one request): dragging
 *  the length slider asks nothing new. A requote (new key, saved place) starts over. get(id): the quote, null (not priced), undefined (loading). */
export function useVariantQuotes(toolId: string | null | undefined, base: Record<string, string> | null, variants: Record<string, Overrides>, delayMs = 220): { get: (id: string) => any | null | undefined; pending: boolean } {
  const tick = useRequoteTick(); const store = useRef(new Map<string, any>()); const [, bump] = useState(0);
  const bk = JSON.stringify([toolId, base, tick]); const kOf = (ov: Overrides) => `${bk}\u0001${JSON.stringify(ov)}`;
  const missing = toolId && base ? Object.values(variants).filter(ov => !store.current.has(kOf(ov))) : []; const mk = JSON.stringify(missing);
  useEffect(() => { if (!toolId || !base || !missing.length) return; let live = true; const ask = missing;
    const t = setTimeout(() => { void quoteVariants(toolId, base, Object.fromEntries(ask.map((ov, i) => [`v${i}`, ov]))).then(v => { if (!live) return;
      if (store.current.size > 600) store.current.clear(); ask.forEach((ov, i) => store.current.set(kOf(ov), v ? v[`v${i}`] ?? null : null)); bump(x => x + 1); }); }, delayMs);
    return () => { live = false; clearTimeout(t); }; }, [bk, mk]);
  return { get: (id: string) => { const ov = variants[id]; return ov && toolId && base ? store.current.get(kOf(ov)) : null; }, pending: missing.length > 0 };
}
