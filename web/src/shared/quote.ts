import { useEffect, useState } from 'react';
import { downloadIntentOf } from './hardware';
/** Server quotes (GET /api/tools/:id/price, /api/models/quote). A 400 with priceAvailable:false (credits:null, runnable:false) is a real
 *  answer, "no verified price for this setting", so keep its body instead of dropping it; callers then block Generate with the reason. */
export const UNPRICED_MSG = 'No verified price for this setting, so it can’t run.';
/** B15: a cloud route with a real key but no live executor yet (reasonCode not_wired, reason 'not wired yet'). Shown as unavailable, never priced. */
export const NOT_WIRED_MSG = 'Not ready in this app yet.';
export const isNotWired = (x: any): boolean => !!x && (x.reasonCode === 'not_wired' || /\bnot wired\b|not available on this server|not ready in this app/i.test(String(x.reason ?? '')));
/** B15 steering 4: the server's own reason ('not available on this server yet') as a short label, sentence-cased, no full stop. */
export const notWiredLabel = (x: any): string => { const r = String(x?.reason ?? '').trim().replace(/\.$/, ''); return r && !/\bnot wired\b/i.test(r) ? r[0].toUpperCase() + r.slice(1) : NOT_WIRED_MSG.replace(/\.$/, ''); };
/** Full sentence for notices: the server's userMessage when it sends one, else the reason as a sentence. Credits wording is dropped (nothing runs here). */
/** B18: the server's own plain words (unavailableReason, else userMessage), no client rewrite. */
export const notWiredText = (x: any): string => { const m = String(x?.unavailableReason ?? x?.userMessage ?? '').trim(); return m ? `${m[0].toUpperCase()}${m.slice(1)}${/[.!?]$/.test(m) ? '' : '.'}` : `${notWiredLabel(x)}.`; };
/** Oct 18 runnable gate: a not_wired quote still carries the list price; drop it so the route is shown unavailable, never priced. */
export const normalizeQuote = (d: any): any => { if (!(d && typeof d === 'object' && d.runnable === false && isNotWired(d))) return d; const msg = notWiredText(d);
  return { ...d, credits: null, perImage: null, priceAvailable: false, needsKey: false, chargeable: false, demo: false, demoMessage: null, demoNotice: null, breakdown: [], notWired: true, notWiredLabel: notWiredLabel(d), error: msg, reason: msg }; };
/** 'Price unavailable: ' before an unpriced reason, or nothing for a not_wired route (the server's reason says it all). */
export const unpricedPrefix = (q: any): string => q?.notWired ? '' : 'Price unavailable: ';
export const unpricedTitle = (q: any): string => q?.notWired ? (q.notWiredLabel ?? notWiredLabel(q)) : 'Price unavailable';
export const readQuote = (r: Response): Promise<any> => r.json().catch(() => null).then(normalizeQuote).then((d: any) => { const ok = r.ok || d?.priceAvailable === false ? d : null; if (ok) noteQuote(r.url, ok); return ok; });

/** Quote = charge: the route each quote says it would run, per tool + provider, so Generate submits exactly that route when nothing is pinned
 *  (instead of route=auto, which the server may resolve differently, e.g. past a pin). Reads `routeId`. */
type Quoted = { route: string; credits: number | null; at: number };
const QUOTED = new Map<string, Quoted>();
/** The latest quote body per tool (any page's), for widgets that show where the next run goes without quoting themselves (the Run-on field). */
const LASTQ = new Map<string, any>(); const lqBus = new Set<() => void>();
export function useLastQuote(toolId?: string | null): any { const [, t] = useState(0); useEffect(() => { const f = () => t(x => x + 1); lqBus.add(f); return () => { lqBus.delete(f); }; }, []); return toolId ? LASTQ.get(toolId) ?? null : null; }
const qk = (tool: string, provider: string) => `${tool}\u0001${provider}`;
function noteQuote(url: string, d: any) {
  try { const u = new URL(url, location.origin); const mm = u.pathname === '/api/models/quote'; const m = mm ? ['', '*'] : u.pathname.match(/^\/api\/tools\/([^/]+)\/price$/); if (!m) return;
    const route = typeof d?.routeId === 'string' && d.routeId && d.routeId !== 'auto' ? d.routeId : null; // the price contract always carries routeId
    const k = qk(decodeURIComponent(m[1]), (mm ? u.searchParams.get('model') : u.searchParams.get('provider')) ?? '');
    if (route && d?.runnable !== false) QUOTED.set(k, { route, credits: typeof d.credits === 'number' ? d.credits : null, at: Date.now() }); else QUOTED.delete(k);
    if (!mm) { LASTQ.set(decodeURIComponent(m[1]), d); lqBus.forEach(f => f()); }
  } catch { /* ignore */ }
}
/** The route the latest quote for this tool + provider would run (null if none, or older than 10 min). */
export const quotedRoute = (tool: string, provider: string): Quoted | null => { const q = QUOTED.get(qk(tool, provider)) ?? QUOTED.get(qk('*', provider)); return q && Date.now() - q.at < 600_000 ? q : null; };
/** The fresh quote a 409 route_changed carries becomes the one the next submit sends. */
export const seedQuote = (tool: string, provider: string, d: any) => noteQuote(`/api/tools/${encodeURIComponent(tool)}/price?provider=${encodeURIComponent(provider)}`, d);
export const forgetQuote = (tool: string, provider: string) => { QUOTED.delete(qk(tool, provider)); QUOTED.delete(qk('*', provider)); };
/** Like readQuote but hands back the raw body (callers that read issues/errors themselves); still records the quoted route. */
export const readQuoteBody = (r: Response): Promise<any> => r.json().catch(() => null).then(normalizeQuote).then((d: any) => { if (d && (r.ok || d.priceAvailable === false)) noteQuote(r.url, d); return d; });

/** 409 route_changed: the server would now run a different route than the one quoted. Price widgets re-quote on this tick. */
let requoteN = 0; const requoteBus = new Set<() => void>();
export const requestRequote = () => { requoteN++; requoteBus.forEach(f => f()); };
export function useRequoteTick(): number { const [n, setN] = useState(requoteN); useEffect(() => { const f = () => setN(requoteN); requoteBus.add(f); return () => { requoteBus.delete(f); }; }, []); return n; }
/** The reason to show when the quote says the setting has no verified price; null when it is priced (or still loading). A missing key is its own gate. */
export const unpricedReason = (q: any): string | null => {
  if (!q || q.needsKey === true) return null;
  if (q.priceAvailable !== false && !(q.credits === null && q.runnable === false)) return null;
  const why = [q.unavailableReason, q.error, reasonWords(q), q.message].find(x => typeof x === 'string' && x.trim());
  return why ? String(why).trim() : UNPRICED_MSG;
};

/** Demo previews (no key, mock run): quote and job carry `demo:true` + `demoMessage` (and `demoNotice.message`). */
export const demoMessage = (q: any): string | null => {
  if (!q || q.demo !== true) return null;
  const m = [q.demoMessage, q.demoNotice?.message].find(x => typeof x === 'string' && x.trim());
  return m ? String(m).trim() : 'Sample output, nothing billed.'; // B27: the server's words verbatim; this is only for a missing field
};
/** B27: a server sentence 'Lead: rest' split so the lead can be bold (text unchanged). [null, text] when there is no short lead. */
export const splitLead = (t: string | null | undefined): [string | null, string] => { const s = String(t ?? '').trim(); const m = /^([^:.]{2,40}):\s+([\s\S]*)$/.exec(s); return m ? [m[1], m[2]] : [null, s]; };
/** B28a: the server's short demo tag ('Sample') on a quote, route, provider, job or its via; null when the field is missing. */
export const demoTagOf = (x: any): string | null => { const v = [x?.demoTag, x?.via?.demoTag, x?.demo && typeof x.demo === 'object' ? x.demo.demoTag : null, x?.routing?.demoTag, x?.quote?.demoTag].find(y => typeof y === 'string' && y.trim()); return v ? String(v).trim() : null; };
/** The short demo tag for badges: the server's demoTag; only when it is missing, the B27 fallback (the demo message's lead, else the via text, else 'Demo'). */
export const demoTag = (q: any): string => demoTagOf(q) ?? splitLead(demoMessage(q))[0] ?? (typeof q?.via?.text === 'string' && q.via.text.trim() ? q.via.text.trim() : 'Sample');
/** B27: the full demo route label from the server (quote / via / upscale reply), e.g. 'SeedVR2 via fal · sample … · needs a fal key for real runs'. */
export const demoLabelOf = (x: any): string | null => { const v = [x?.demoLabel, x?.via?.demoLabel].find(y => typeof y === 'string' && y.trim()); return v ? String(v).trim() : null; };
/** The real price a demo preview would cost (`listCredits`), shown struck through next to the demo note. */
export const demoList = (q: any): number | null => q?.demo === true && typeof q.listCredits === 'number' && q.listCredits > 0 ? q.listCredits : null;
/** Is this job a demo-preview run? (`demo:true` per the new contract; older servers: `demo:{code:'demo_preview'}` or input/route flags.) */
export const isDemoJob = (j: any): boolean => !!j && (j.demo === true || (j.demo && typeof j.demo === 'object' && (j.demo.code === 'demo_preview' || !!j.demo.message)) || typeof j.demoMessage === 'string' || j.routing?.demo === true || j.input?.demo === true);

/** #6 One quote per model per params: identical in-flight GETs share one request; a priced answer is reused for 3 s;
 *  an unpriced answer (400, or 200 priceAvailable:false) is not re-asked for the same URL until a requote. Resolves to the body (or null). */
const QCACHE = new Map<string, { p: Promise<any>; at: number; sticky: boolean }>();
export function quoteGet(url: string): Promise<any> {
  try { const u = new URL(url, location.origin); if (u.pathname === '/api/models/quote') noteQuoteParams(u.searchParams.get('toolId') || 'create-image', u.searchParams); } catch { /* ignore */ } // the picker's batch quote prices rows at these settings
  const hit = QCACHE.get(url); if (hit && (hit.sticky || Date.now() - hit.at < 3000)) return hit.p;
  const ent = { p: Promise.resolve(null) as Promise<any>, at: Date.now(), sticky: false };
  ent.p = fetch(url).then(r => r.json().catch(() => null).then(normalizeQuote).then((d: any) => { if (d && (r.ok || d.priceAvailable === false)) noteQuote(r.url || url, d);
    if ((r.status === 400 || d?.priceAvailable === false) && d) ent.sticky = true; else if (!r.ok) QCACHE.delete(url); return d; })).catch(() => { QCACHE.delete(url); return null; });
  QCACHE.set(url, ent); return ent.p;
}
requoteBus.add(() => QCACHE.clear());

/** B17: any runnable:false quote blocks Generate, input reasons included, in the server's own words. A missing key is the key gate, not this. */
export const runBlock = (q: any): string | null => {
  if (!q || q.runnable !== false || q.needsKey === true) return null;
  if (q.reasonCode === 'weights_missing' && downloadIntentOf(String(q.provider ?? q.model ?? q.providerId ?? ''))) return null; /* Batch 28: it downloads first, so it can run */
  const w = [q.blockedReason, q.unavailableReason, q.userMessage, q.error, reasonWords(q), Array.isArray(q.issues) ? q.issues[0]?.message : null, q.message, q.priceLine].find(x => typeof x === 'string' && x.trim());
  if (!w) return q.priceAvailable === false ? UNPRICED_MSG : 'This setting can’t run here.';
  const t = String(w).trim(); return `${t[0].toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}`;
};
/** The block is the server's reason as-is (not wired, or an input reason), not a missing price: no "Price unavailable:" prefix. */
/** B18: also a server refusal with its own code (unsupported, image_required…) or a non-key route that can't run (unavailableReason). */
const refusal = (q: any): boolean => typeof q?.code === 'string' && !!q.code && q.code !== 'price_unavailable';
export const isPlainBlock = (q: any): boolean => !!q && (q.runnable === false || refusal(q)) && q.needsKey !== true && (!!q.notWired || q.priceAvailable !== false || refusal(q) || !!q.unavailableReason);

/** B18: a route/quote reason in plain words. reasonCode 'local_off' (the raw code can also sit in `reason`) = turned off locally. */
export const LOCAL_OFF_TEXT = 'Your computer is off · turn it on in Settings → Your computer';
export const reasonWords = (x: any): string | null => { if (!x) return null; if (x.reasonCode === 'local_off' || x.reason === 'local_off') return x.reason && x.reason !== 'local_off' ? String(x.reason) : LOCAL_OFF_TEXT; /* B19: the server's plain 'Turn on Use local ComfyUI…' */ const r = typeof x.reason === 'string' ? x.reason.trim() : ''; return r || null; };
/** B18: credits to show as a charge. `chargeable:false` (demo, local, a missing key, a route that can't run) is never a charge: null,
 *  or 0 when the quote itself says 0. Older quotes without `chargeable` fall back to their numeric credits. */
export const shownCredits = (q: any): number | null => { if (!q || typeof q.credits !== 'number') return null; if (q.chargeable === false) return q.credits === 0 ? 0 : null; return q.credits; };
/** B18: the quote's own unit fields first, then the pricing row's. */
export const unitOf = (q: any, row?: any): { label: string; help: string } => ({ label: String(q?.unitLabel ?? row?.unitLabel ?? '').trim(), help: String(q?.unitHelp ?? row?.unitHelp ?? '').trim() });
/** B18: an upscale quote with a given size (estimated:false + sourceSize/outputSize): "1280×720 → 2560×1440 at 2×". */
export const sizeLine = (q: any): string | null => { const a = q?.sourceSize, b = q?.outputSize; if (!q || (q.sizeEstimated ?? q.estimated) === true || !a?.width || !b?.width) return null; return `${a.width}×${a.height} → ${b.width}×${b.height}${q.scale ? ` at ${q.scale}×` : ''}`; };
/** B19 (PB 06e0685): an input block keeps the real price (credits = listCredits, chargeable:false) plus blockedReason: show that price muted. */
export const blockedPrice = (q: any): number | null => { if (!q || q.runnable !== false || typeof q.blockedReason !== 'string' || !q.blockedReason.trim()) return null;
  if (typeof q.credits === 'number' && q.credits > 0) return q.credits; /* B20: a demo route's block (credits 0) shows the list price, muted, like the demo note */
  return q.demo === true && typeof q.listCredits === 'number' && q.listCredits > 0 ? q.listCredits : null; };
/** B19: local_off (Use local ComfyUI is off): a "turn it on" state, not an error. */
export const isLocalOff = (x: any): boolean => !!x && (x.reasonCode === 'local_off' || x.reason === 'local_off');
/** B19 (enum audit): tools whose output doesn't depend on a resolution/quality pick (voice, soundtrack and the audio apps; the format-only
 *  video tools that keep the source size). They get no resolution/quality param on quote or submit. */
const NO_RES = new Set(['voice', 'soundtrack', 'app-change-voice', 'app-translate-video', 'app-music-bed', 'remove-bg', 'sdr-hdr', 'fps-boost', 'depth-map', 'image-upscale']);
export const ignoresRes = (toolId?: string | null): boolean => !!toolId && NO_RES.has(toolId);
/** B19: no clip yet (sizeEstimated:true): the server's estimate sentence, else its assumed sizes. */
export const sizeEstLine = (q: any): string | null => { if (!q || q.sizeEstimated !== true) return null; const m = typeof q.estimateMessage === 'string' ? q.estimateMessage.trim() : '';
  if (m) return m; const a = q.assumedSize, b = q.assumedOutputSize; return a?.width && b?.width ? `Estimate for a ${a.width}×${a.height} clip → ${b.width}×${b.height}${q.assumedScale ? ` at ${q.assumedScale}×` : ''}. The exact size shows once your clip is loaded.` : null; };

// ---------------------------------------------------------------- the picker's batch quote (MODEL-PICKER-REVIEW task 7)
/** The settings each tool's page quoted last (the params of its latest /price or /api/models/quote request, minus the per-model fields),
 *  so a model picker prices every row for THIS run without knowing the page's fields. Recorded by the fetch guard (api.ts) and quoteGet. */
const ROW_FIELDS = new Set(['provider', 'model', 'runOn', 'run_on', 'route', 'quotedRouteId', 'quotedCredits', 'toolId', 'allowFallback']);
const LASTP = new Map<string, Record<string, string>>(); const lpBus = new Set<() => void>();
export function noteQuoteParams(toolId: string, sp: URLSearchParams) {
  const o: Record<string, string> = {}; sp.forEach((v, k) => { if (!ROW_FIELDS.has(k)) o[k] = v; });
  const prev = LASTP.get(toolId); if (prev && JSON.stringify(prev) === JSON.stringify(o)) return; LASTP.set(toolId, o); lpBus.forEach(f => f());
}
export const quoteParamsOf = (toolId?: string | null) => (toolId ? LASTP.get(toolId) ?? null : null);
import type { FitChange, FitValues, Need } from '../../../server/src/shared/settingsFit';
export interface RowFit { values: FitValues; changes: FitChange[]; note: string; hint: string }
/** One row of POST /api/models/quotes: the quote fields a row needs (= the single quote's) + priceRange over the places that can run it now. */
export interface PlacePrice { runOn: string; runOnLabel: string | null; placeLabel?: string | null; credits: number; cost: any; routeId: string | null }
export interface RowQuote { model: string; ok: boolean; status: number; runOn?: string | null; runOnLabel?: string | null; placeLabel?: string | null; place?: { label: string; billing: string; short: string; note: string } | null; credits?: number | null; demo?: boolean; runnable?: boolean; needsKey?: boolean;
  cost?: any; routeKind?: string; chargeable?: boolean; billingMode?: string; reason?: string; blockedReason?: string; error?: string; adjusted?: Record<string, string | null>;
  /** What picking this model changes (shared/settingsFit.ts): the values the bar switches to, each change, the bar's note and the row's hover. */ fit?: RowFit | null;
  /** A job no setting can fix here: what it needs ("Needs a start image") and the bar's action. */ need?: Need | null;
  priceRange?: { min: number; max: number; minUsd: number; maxUsd: number; places: PlacePrice[] } | null; setupOptions?: { runOn: string; runOnLabel?: string | null; action: string; actionText?: string; credits?: number | null }[] }
const BCACHE = new Map<string, { p: Promise<Record<string, RowQuote> | null>; at: number }>();
requoteBus.add(() => BCACHE.clear());
/** POST /api/models/quotes: every listed model's price at these settings (one call; identical calls within 3 s share one answer). */
export function quoteBatch(toolId: string, params: Record<string, string>, models: { model: string; runOn?: string | null }[]): Promise<Record<string, RowQuote> | null> {
  const body = JSON.stringify({ toolId, params, models }); const hit = BCACHE.get(body); if (hit && Date.now() - hit.at < 3000) return hit.p;
  const p = fetch('/api/models/quotes', { method: 'POST', headers: { 'content-type': 'application/json' }, body }).then(r => (r.ok ? r.json() : null)).then((d: any) => (d?.quotes ?? null) as Record<string, RowQuote> | null).catch(() => null);
  BCACHE.set(body, { p, at: Date.now() }); if (BCACHE.size > 50) BCACHE.delete(BCACHE.keys().next().value as string); return p;
}
/** A row whose batch answer isn't in yet (or is for older settings): shown as loading, never as a price for other settings. */
export const ROW_PENDING = Object.freeze({ pending: true }) as any;
/** The batch call failed: the row says its price is unknown, never a list price for another job. */
export const ROW_FAILED = Object.freeze({ failed: true }) as any;
/** The picker rows' prices while it is open: re-quoted (debounced) when the page's settings change, a run-on is saved or a key is added.
 *  state: 'ready' (quotes are for these settings), 'pending' (loading, or the answer is for older settings), 'failed', 'off' (nothing to ask). */
export function useRowQuotes(toolId: string | null | undefined, open: boolean, models: { model: string; runOn?: string | null }[]): { quotes: Record<string, RowQuote> | null; state: 'ready' | 'pending' | 'failed' | 'off' } {
  const [, bump] = useState(0); useEffect(() => { const f = () => bump(x => x + 1); lpBus.add(f); return () => { lpBus.delete(f); }; }, []);
  const tick = useRequoteTick(); const params = quoteParamsOf(toolId); const key = JSON.stringify([toolId, params, models]);
  const [res, setRes] = useState<{ key: string; v: Record<string, RowQuote> | null } | null>(null);
  useEffect(() => { if (!open || !toolId || !params || !models.length) return; let live = true;
    const t = setTimeout(() => { void quoteBatch(toolId, params, models).then(v => { if (live) setRes({ key, v }); }); }, res ? 250 : 0);
    return () => { live = false; clearTimeout(t); }; }, [open, key, tick]);
  // an answer for other settings is never shown as this run's price: the rows show loading until the new one is in
  if (!toolId || !params || !models.length) return { quotes: null, state: 'off' };
  if (!res || res.key !== key) return { quotes: null, state: 'pending' };
  return res.v ? { quotes: res.v, state: 'ready' } : { quotes: null, state: 'failed' };
}
