import { newIdemKey, jobPostError } from '../../api';
import { fallbackOffersOff } from '../../shared/quietMode';
import { Link } from '../../platform/router';
import { looksTechnical, plainCopy } from '../../shared/plainCopy';
import { InlineError } from '../../shared/InlineError';
import { Skeleton } from '../../shared/Skeleton';
import { onReconnect } from '../../shared/connectivity';
import { isOpenWeights, OpenWeightsBadge, OpenWeightsOnlyPill, useOpenWeightsOnly } from '../../shared/OpenWeights'; /* BH10 #14: route rows badge by where they run (runsOnKind), not just the model's licence */
import { useEffect, useRef, useState } from 'react';
import { isNotWired, notWiredLabel, reasonWords, LOCAL_OFF_TEXT, demoTagOf } from '../../shared/quote';
import { FitTag, FitNote } from '../../shared/FitNote';
import { routeFitOf } from '../../shared/fit';
import { setRouting, useRouting, routingNow, runOnLabel, runOnOfRoute } from '../../shared/models';
import { useBilling, useAccounts, refreshAccounts, saveBilling, fmtUsd, ago, RULE_TEXT, runPrice, placeOfQuote, ownAccountsNow, ledgerUsd, type Account, type ProviderBilling } from '../../shared/billing';
import { repoDoc } from '../../shared/brand';
/** Multi-provider routing UI. Route choice per model is kept in localStorage and attached to every job by api.createJob (route + allowFallback). */
export type Route = { routeId: string; kind: string; label: string; credits?: number | null; estimatedPrice?: boolean; priceSourceUrl?: string | null; typicalLatencySec?: number; latencyEstimated?: boolean; envKey?: string | null; configured?: boolean; available?: boolean; reason?: string | null; sourceUrl?: string | null;
  /** Server-rendered state (pb/server-1018): status text ('Reachable, but off', 'Pinned · runs locally', 'Demo preview'…), pinnable local_off routes, runnable = available or demo. All optional: older servers omit them. */
  status?: string | null; pinnable?: boolean; pinned?: boolean; runnable?: boolean; demo?: boolean };
const KEY = (m: string) => `ohf:route:${m}`; const FB = (m: string) => `ohf:fallback:${m}`;
export const getRoute = (model: string) => localStorage.getItem(KEY(model)) ?? 'auto';
export const getFallback = (model: string) => localStorage.getItem(FB(model));
const bus = new Set<() => void>();
export function setRoute(model: string, route: string, allowFallback?: boolean) { localStorage.setItem(KEY(model), route); if (allowFallback !== undefined) localStorage.setItem(FB(model), allowFallback ? '1' : '0'); bus.forEach(f => f()); }
/** B19: the user's route pin for a model as a quote param, so the quote prices the same route the job will run on (submit sends it too). */
export const pinQ = (model?: string | null): { route?: string } => { if (!model) return {}; const v = localStorage.getItem(KEY(model)); return v && v !== 'auto' ? { route: v } : {}; };
export function useRoute(model: string) { const [, t] = useState(0); useEffect(() => { const f = () => t(x => x + 1); bus.add(f); return () => { bus.delete(f); }; }, []); return { route: getRoute(model), allowFallback: getFallback(model) === '1' }; }

/** The server's short route text, minus its list price (the live quote under Generate is the one price on screen; the list here is
 *  for default settings and disagrees with the loaded clip). "Demo preview" reads as a status, not a provider. */
const viaText = (t: string) => { const x = t.replace(/\s*·\s*list\s*✦\s*[\d,.]+/i, '').trim(); return /^via\b/i.test(x) ? x.replace(/^via\s+/i, 'Runs on ') : /^local\b|demo|^sample/i.test(x) ? x : `Runs on ${x}`; }; /* round 1: never "via" */ /* B27: a demo status from the server reads as it is */
/** Under a model name: "Runs on fal". */
export function ViaLine({ p, override }: { p: any; override?: string | null }) {
  const { route: picked } = useRoute(p?.id ?? ''); const route = override || picked; // override: a Recreate restores the original job's route
  const r: Route | undefined = route !== 'auto' ? (p?.routes ?? []).find((x: Route) => x.routeId === route) : undefined;
  const rt = useRouting();
  /* B20 (local_only): a model whose only route is local runs here even with Use local ComfyUI off; say so, with the server's reason on hover */
  const one: any = r ?? ((p?.routes ?? []).length === 1 ? p.routes[0] : undefined);
  if (one?.reasonCode === 'local_only') return <small className="via-line via-local-only" data-testid="via-line" title={one.reason ?? undefined}>{one.status ?? 'Local only · runs on your computer'}</small>;
  if (p && 'defaultRoute' in p && p.defaultRoute == null && route === 'auto') return <button type="button" className="via-line via-nokey" data-testid="via-add-key" onClick={e => { e.stopPropagation(); e.preventDefault(); openNeedsKey(p.noProvider ?? { error: `No provider is set up for ${p.name ?? p.id}.`, modelId: p.id }, p.id); }}>Add an API key</button>;
  const txt = r ? `Runs on ${r.label}` /* price from the live quote only */ : rt?.global?.useLocal && (p?.routes ?? []).some((x: Route) => x.kind === 'local') ? 'local · free' : demoTagOf(p) && p?.demoPreview ? demoTagOf(p)! /* B28a */ : p?.via?.text ? viaText(String(p.via.text)) : '';
  /* B27 (A3): a keyless demo shows the server's full demo label ('SeedVR2 via fal · sample … · needs a fal key for real runs'), never a cut tag */
  const dl = !r && !(rt?.global?.useLocal && (p?.routes ?? []).some((x: Route) => x.kind === 'local')) && typeof p?.via?.demoLabel === 'string' && p.via.demoLabel.trim() ? String(p.via.demoLabel).trim() : '';
  if (dl) return <small className="via-line via-demo" data-testid="via-line" data-demo-label="1" title={dl}>{dl}</small>;
  return txt ? <small className="via-line" data-testid="via-line">{txt}</small> : null;
}

/** Route picker (tools without models[]): the pre-selected place + each route; unavailable ones disabled with their reason. No fallback switch (2026-10-22). */
const plainWhy2 = (t: unknown): string | null => { const x = typeof t === 'string' ? t.trim() : ''; return x ? x.replace(/\.?$/, '.') : null; };
export function RoutePicker({ p, compact }: { p: any; compact?: boolean }) {
  const routes: Route[] = p?.routes ?? []; const { route, allowFallback } = useRoute(p?.id ?? '');
  const rtUseLocal = !!useRouting()?.global?.useLocal;
  if (!p || routes.length < 2) return null;
  /* BH12 T24: routes that can't be picked here aren't buttons; each reason is said once, as text, under the list (the picked one stays a button) */
  const offOf = (r: Route) => { const nw = isNotWired(r) && r.runnable !== true; const lo = (r as any).reasonCode === 'local_off' || r.reason === 'local_off'; const rwp = (r as any).runsWhenPinned === true; const dim = nw || (r.available === false && !r.demo && !(lo && rwp && route === r.routeId)); return route !== r.routeId && (nw || (dim && !r.pinnable && !rwp && r.runnable !== true)); };
  const offRoutes = routes.filter(offOf); const offIds = new Set(offRoutes.map(r => r.routeId)); const groups = new Map<string, string[]>();
  offRoutes.forEach(r => { const why = plainWhy2(isNotWired(r) && r.runnable !== true ? notWiredLabel(r) : reasonWords(r) ?? 'Not configured') ?? 'Not configured.'; groups.set(why, [...(groups.get(why) ?? []), (r as any).displayName ?? r.label]); });
  const offNotes = [...groups.entries()].map(([why, names]) => <p key={why} className="helper route-off" data-testid="route-off"><b>{names.join(', ')}</b>: {why}</p>);
  return <div className={`route-pick ${compact ? 'compact' : ''}`} role="radiogroup" aria-label="Route">
    <span className="field">ROUTE</span>
    {[{ routeId: 'auto', kind: 'auto', label: `Pre-selected${p?.defaultRoute ? ` · ${runOnLabel(runOnOfRoute(p.defaultRoute)) || 'first ready place'}` : ''}`, available: true } as Route, ...routes].filter(r => !offIds.has(r.routeId)).map(r => { const nw = isNotWired(r) && r.runnable !== true; const on = route === r.routeId; const lo = (r as any).reasonCode === 'local_off' || r.reason === 'local_off'; const rwp = (r as any).runsWhenPinned === true; /* B20: local_off + runsWhenPinned = pick it and it runs on this computer */ const dim = nw || (r.available === false && !r.demo && !(lo && rwp && on)); const off = nw || (dim && !r.pinnable && !rwp && r.runnable !== true); const why2 = (x: any) => [reasonWords(x), plainWhy2(x.reasonDetail)].filter(Boolean).join(' ') || null; /* B18: local_off = turned off locally, in plain words */ /* B15: not_wired = shown, greyed, never priced or picked */
      return <button key={r.routeId} data-testid={`route-opt-${r.routeId}`} data-pinnable={r.pinnable ? '1' : undefined} data-status={r.status ?? undefined} type="button" role="radio" aria-checked={on} aria-disabled={dim || undefined} disabled={off} className={`route-opt ${on ? 'on' : ''} ${dim ? 'dim' : ''} ${r.demo ? 'demo' : ''} ${r.pinned ? 'pinned' : ''}`} data-not-wired={nw ? '1' : undefined} title={nw ? notWiredLabel(r) : lo ? (why2(r) ?? LOCAL_OFF_TEXT) /* B20: reason + reasonDetail, the server's two lines */ : /^local_(only|pinned)$/.test(String((r as any).reasonCode ?? '')) && r.reason ? r.reason : dim ? (r.status ?? reasonWords(r) ?? 'Not available') + (r.pinnable ? ' · pick it to pin this model to it' : '') : r.demo && r.reason ? r.reason /* B19: the server's demo wording */ : r.status ?? r.sourceUrl ?? ''} onClick={() => setRoute(p.id, r.routeId)}>
        <b>{(r as any).displayName ?? r.label}<OpenWeightsBadge on={isOpenWeights(r) && String((r as any).runsOnKind ?? (/^local:/.test(r.routeId) ? 'local' : '')) !== 'api' && !/^(fal|replicate|direct|api):/.test(r.routeId)} className="ow-sm" />{isOpenWeights(r) && ((r as any).runsOnKind === 'api' || /^(fal|replicate|direct|api):/.test(r.routeId)) && <em className="ow-badge ow-sm ow-hosted" title="Open-weights model, run here on a hosted API">Hosted</em>}</b><small>{nw ? notWiredLabel(r) : lo ? (on && rwp ? 'Pinned · runs locally' : rwp ? 'Off for Auto · pick to run it here' : LOCAL_OFF_TEXT) : r.routeId === 'auto' ? rtUseLocal && routes.some(x => x.kind === 'local') ? 'Use local ComfyUI is on' : `Best available${p.defaultRoute ? `, default ${routes.find(x => x.routeId === p.defaultRoute)?.label ?? ''}` : ''}` : r.demo && demoTagOf(r) && !dim && !r.pinned ? demoTagOf(r) /* B28a: the server's short demo tag */ : r.status && (dim || r.pinned || r.demo) ? r.status : off ? (reasonWords(r) ?? 'Not configured') : [r.status, r.credits ? `${runPrice({ own: ownAccountsNow(), credits: r.credits, runOn: placeOfQuote(r) })}${r.estimatedPrice ? ' est.' : ''}` : 'free', r.typicalLatencySec ? `~${r.typicalLatencySec}s${r.latencyEstimated ? ' est.' : ''}` : ''].filter(Boolean).join(' · ')}</small><FitTag fit={routeFitOf(r)} className="route-fit" /></button>; })}
    {(() => { const f = routeFitOf(routes.find(x => x.routeId === route)); return f ? <FitNote fit={f} className="route-fitnote" /> : null; })() /* Batch 28: the picked local route's fit, in the server's words */}
    {offNotes}
  </div>;
}

/** needs_decision: the chosen route failed; offer the alternatives. */
export function FallbackPrompt({ job, onDone }: { job: any; onDone: () => void }) {
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  /* Filming (/api/config fallbackOffers:false): no 'Use <route>' offers, only the way to stop. */
  const [, rq] = useState(0); useEffect(() => { const f = () => rq(x => x + 1); window.addEventListener('ohf:quiet-changed', f); return () => window.removeEventListener('ohf:quiet-changed', f); }, []);
  const noOffers = fallbackOffersOff();
  const alts: any[] = noOffers ? [] : job.alternatives ?? job.decision?.alternatives ?? [];
  /* Filming: the card never shows; the route failure is declined once so the job ends as a normal failure (refund line + Retry). */
  const declined = useRef(''); useEffect(() => { if (!noOffers || declined.current === job.id) return; declined.current = job.id; void send({ decline: true }, 'decline'); }, [noOffers, job.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async (body: any, k: string) => { setBusy(k); setErr(''); try { const r = await fetch(`/api/jobs/${encodeURIComponent(job.id)}/fallback`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': newIdemKey() }, body: JSON.stringify(body) }); if (!r.ok) throw jobPostError(await r.json().catch(() => ({})), r.status, `That route couldn’t start (HTTP ${r.status}).`); onDone(); } catch (e) { setErr((e as Error).message); } finally { setBusy(''); } };
  if (noOffers) return err ? <p className="inline-err">{err}</p> : null;
  /* B27 (A8): the decision payload: options with their price, the server's note verbatim, then what happened to the failed attempt's credits */
  const opts: any[] = Array.isArray(job.decision?.options) && job.decision.options.length ? job.decision.options : alts;
  const note = String(job.decision?.note ?? job.error ?? '').trim() || 'The route you picked failed.';
  const back = job.creditsBack?.credits ?? (job.refund?.refunded ? job.refund.amount : null);
  const refundLine = job.refund?.freeGenReturned ? 'Your free gen was returned.' : typeof back === 'number' && back > 0 ? `The failed attempt’s ${ledgerUsd(back)} went back to your balance.` : null;
  const saysBack = /back in your balance|back to your balance|returned/i.test(note);
  const busy2 = typeof job.busyNote?.message === 'string' && job.busyNote.message.trim() && !note.includes(job.busyNote.message.trim()) ? job.busyNote.message.trim() : null;
  const credOf = (a: any) => typeof a.credits === 'number' ? a.credits : null;
  const cta = (a: any) => { const c = credOf(a); const via = opts.length > 1 ? ` on ${a.label ?? a.tierLabel ?? 'this route'}` : ''; return c != null ? `Continue${via} for ${runPrice({ own: ownAccountsNow(), credits: c, runOn: placeOfQuote(a) }) ?? ledgerUsd(c)}` : `Continue${via}`; };
  return <div className="fallback-card" role="alertdialog" aria-label="Route failed" data-testid="needs-decision">
    <b>That didn’t work here</b><p className="helper" data-testid="decision-note">{note}</p>
    {busy2 && <p className="helper" data-testid="decision-busy">{busy2}</p>}
    <p className="helper fb-refund" data-testid="decision-refund">{[!saysBack ? refundLine : null, 'Nothing more was charged.'].filter(Boolean).join(' ')}</p>
    <div className="fallback-list">{opts.map(a => <button key={a.routeId ?? a.route} type="button" className="btn btn-primary" data-testid={`decision-continue-${a.routeId ?? a.route}`} disabled={!!busy || a.available === false} title={[a.label, typeof a.deltaCredits === 'number' && a.deltaCredits > 0 ? `${ledgerUsd(a.deltaCredits)} more than your quote` : '', reasonWords(a) ?? ''].filter(Boolean).join(' · ')} onClick={() => send({ route: a.routeId ?? a.route, routeId: a.routeId ?? a.route }, a.routeId ?? a.route)}>{busy === (a.routeId ?? a.route) ? 'Starting…' : cta(a)}</button>)}
      <button type="button" className="btn btn-ghost" data-testid="fallback-decline" disabled={!!busy} onClick={() => send({ decline: true }, 'decline')}>{busy === 'decline' ? 'Canceling…' : 'Cancel'}</button></div>
    {!opts.length && <p className="helper">Nowhere else can run this model.</p>}
    {err && <p className="inline-err">{err}</p>}
  </div>;
}

/** Result details: where it ran, and on a fallback each place it tried ("Tried fal (failed, not charged), then ran on Comfy Cloud"). */
export function RouteAttempts({ job, label }: { job: any; label?: string }) {
  const at: any[] = job.routeAttempts ?? []; if (!job.route && !at.length) return null;
  const place = (a: any) => runOnLabel(runOnOfRoute(a?.routeId ?? a?.route ?? '')) || a?.displayName || a?.label || 'another place';
  const name = label || runOnLabel(job.runOn) || ''; // friendly words only; a raw route id never reaches the card
  const failed = at.filter(a => a.ok === false || a.error || a.status === 'failed'); const last = at[at.length - 1];
  const story = at.length > 1 ? [...failed.map(a => `Tried ${place(a)} (failed, ${a.notCharged || !(Number(a.charged) > 0) || Number(a.refunded) >= Number(a.charged) ? 'not charged' : 'may have been charged'})`), last && !failed.includes(last) ? `then ran on ${place(last)}` : ''].filter(Boolean).join(', ') : '';
  /* Round 1 (S3): the result header already says where it ran; this block only tells the fallback story. */
  void name; if (!story) return null;
  return <div className="route-attempts">
    {story && <p className="helper route-story" data-testid="route-story">{story}.</p>}</div>;
}

/* Settings → Connections + Routing defaults moved to Settings → Connections (./Connections.tsx). */

/** Shared routing prefs cache (GET /api/me/routing), refreshed on save. */
export { setRouting, useRouting } from '../../shared/models';

/** "Add an API key" prompt: no_provider 402, quote.noProvider, or a model card with defaultRoute null. */
export const NEEDS_KEY_EVT = 'ohf:needs-key';
export function openNeedsKey(np: any, modelId?: string) { window.dispatchEvent(new CustomEvent(NEEDS_KEY_EVT, { detail: { ...np, modelId: np?.modelId ?? modelId } })); }
export function NeedsKeyHost() {
  const nkOw = useOpenWeightsOnly();
  const [np, setNp] = useState<any>(null); const [prov, setProv] = useState<any[] | null>(null); const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { const f = (e: Event) => { setErr(''); setNp((e as CustomEvent).detail); }; window.addEventListener(NEEDS_KEY_EVT, f); return () => window.removeEventListener(NEEDS_KEY_EVT, f); }, []);
  useEffect(() => { if (!np) return; if (np.providers?.length) { setProv(np.providers); return; } setProv(null); fetch('/api/settings/providers').then(r => r.ok ? r.json() : null).then(d => setProv((d?.providers ?? []).filter((p: any) => p.id !== 'local' && p.id !== 'hf' /* a download token, not a place to run */ && !p.configured))).catch(() => setProv([])); }, [np]);
  useEffect(() => { if (!np || np.localAvailable != null) return; fetch('/api/config').then(r => r.ok ? r.json() : null).then(c => c && setNp((x: any) => x && { ...x, localAvailable: !!c.localAvailable })).catch(() => 0); }, [np]);
  /* Offer "pin to local" only when this model's local route really runs: quote it on that route (local + runnable). */
  const [localOk, setLocalOk] = useState<boolean | null>(null);
  useEffect(() => { setLocalOk(null); if (!np?.modelId || !np?.localRoute) return; fetch(`/api/models/quote?${new URLSearchParams({ model: np.modelId, route: np.localRoute })}`).then(r => r.ok ? r.json() : null).then(j => setLocalOk(!!j && j.local === true && j.runnable !== false)).catch(() => setLocalOk(false)); }, [np?.modelId, np?.localRoute]);
  if (!np) return null;
  const put = async (body: any, k: string) => { setBusy(k); setErr(''); try { const r = await fetch('/api/me/routing', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) { const b = await r.json().catch(() => ({})); const lu = (b.issues ?? []).find((i: any) => i.code === 'local_unavailable') ?? (b.code === 'local_unavailable' || b.errorType === 'local_unavailable' || b.error === 'local_unavailable' ? { message: b.message ?? (b.error !== 'local_unavailable' ? b.error : undefined) } : null); throw new Error(lu ? (lu.message ?? 'The local route for this model isn’t available, so it can’t be pinned.') : b.error ?? `HTTP ${r.status}`); } setRouting(await r.json()); setNp(null); } catch (e) { setErr((e as Error).message); } finally { setBusy(''); } };
  const pin = () => { const cur = routingNow()?.perModel ?? {}; return put({ perModel: { ...cur, [np.modelId]: { route: np.localRoute } } }, 'pin'); };
  return <div className="nk-scrim" onClick={() => setNp(null)}><div className="nk-card card" role="alertdialog" aria-label={np.title ?? 'Choose where to run'} data-testid="needs-key" onClick={e => e.stopPropagation()}>
    <b className="nk-h">{np.title ?? 'Choose where to run'}</b>
    <p className="helper nk-err" data-testid="needs-key-error">{np.error ?? 'Nothing is set up to run this model yet.'}</p>
    <div className="nk-list">{(prov ?? []).filter((p: any) => !nkOw || p.id === 'local' || /comfy/i.test(String(p.id)) || isOpenWeights(p)).map((p: any) => <div key={p.id} className="nk-row" data-testid={`needs-key-${p.id}`}><div><b>{p.name}</b></div>{p.keysUrl ? <a className="btn btn-sm" href={p.keysUrl} target="_blank" rel="noreferrer">Get a key</a> : p.docsUrl ? <a className="btn btn-sm btn-ghost" href={p.docsUrl} target="_blank" rel="noreferrer">Docs</a> : null}</div>)}
      {prov && !prov.length && <p className="helper">No account you can connect runs this model.</p>}</div>
    <p className="helper">Add a key in <Link to="/settings#connections" onClick={() => setNp(null)}>Settings → Connections</Link>, or see the <Link to={repoDoc('docs/CONFIGURATION.md', 'provider-keys')}>setup guide ↗</Link>.</p>
    {np.localAvailable && (!np.localRoute || !np.modelId || localOk === true) && <div className="nk-local"><button type="button" className="btn" data-testid="needs-key-use-local" disabled={!!busy} onClick={() => np.localRoute && np.modelId ? pin() : put({ global: { useLocal: true } }, 'local')}>{busy ? 'Saving…' : 'Use my GPU instead'}</button>
      {np.localRoute && np.modelId && <button type="button" className="link-btn" disabled={!!busy} onClick={() => put({ global: { useLocal: true } }, 'local')}>Use my GPU for every model</button>}</div>}
    {err && <p className="inline-err">{err}</p>}
    <div className="nk-foot"><button type="button" className="btn btn-ghost" onClick={() => setNp(null)}>Close</button></div>
  </div></div>;
}
