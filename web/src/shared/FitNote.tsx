import { Notice } from './Notice';
import { runPrice, placeOfQuote, ownAccountsNow } from './billing';
import { useEffect, useRef, useState } from 'react';
import { DemoPrice } from './DemoPrice';
import { Link } from '../platform/router';
import { fitLabel, etaSourceNote, showLighter, gbText, noteOffersAlt, altCredits, quoteFitOf, LOCAL_SETUP_HREF, type Fit, type FitAlt } from './fit';
import { dryRunDownload, setDownloadIntent, useDownloadIntent, promptMounted, choiceText, useHardware, useLiveHardware, type DryRun, type DlChoice } from './hardware';
import { memoryCheck, HEAVY_GB } from '../../../server/src/shared/thisComputer';
/** B31: a 409 weights gate from a submit (api.ts), so the download prompt for that model shows the server's words and its options. */
export const WEIGHTS_GATE_EVT = 'ohf:weights-gate';
const gates = new Map<string, any>();
if (typeof window !== 'undefined') window.addEventListener(WEIGHTS_GATE_EVT, (e: Event) => { const d = (e as CustomEvent).detail; if (d?.providerId) gates.set(String(d.providerId), d.body); });

/** B31: 'Use cloud instead · Seedance · Sample ✦0' (or its price): the server's alternative route; its route and price line on hover. */
export function AltButton({ alt, testId, disabled, onPick }: { alt: FitAlt; testId: string; disabled?: boolean; onPick: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  const c = altCredits(alt); const title = [alt.routeLabel ?? alt.tierLabel, alt.priceLine].filter(Boolean).join(' · ') || undefined;
  return <button type="button" className="btn btn-sm fit-cloud" data-testid={testId} data-alt-route={alt.routeId ?? undefined} data-alt-demo={alt.demo ? '1' : undefined} disabled={disabled} title={title} onClick={onPick}>
    <span className="fit-alt-n">Use cloud instead · {alt.name ?? alt.providerId}</span><span className="fit-alt-p">{alt.demo ? <em className="demo-badge demo-tag fit-alt-demo" data-testid="fit-alt-demo"><DemoPrice q={alt} /></em> : c != null && <span className="fit-alt-cr" data-testid="fit-alt-credits">· {runPrice({ own: ownAccountsNow(), credits: c, runOn: placeOfQuote(alt) })}</span>}</span>
  </button>;
}
/** Batch 28: "Use cloud instead" from a place that can't switch the model itself (route chips): the tool page listens. */
export const USE_PROVIDER_EVT = 'ohf:use-provider';
export const useCloudInstead = (providerId: string) => dispatchEvent(new CustomEvent(USE_PROVIDER_EVT, { detail: { providerId } }));

/** The short fit tag on a local route or model ('Runs on this computer', 'Slow on this computer, about 4 min'…); the server's reason on hover. */
/** B30: in a list, the hardware-unknown tag is said once at the top (HwUnknownLine), not on every row. */
const hwUnknown = (fit: Fit | null | undefined) => { const l = fitLabel(fit); return !!l && l.kind === 'unknown' && fit?.reasonCode !== 'requirements_unknown'; };
export function HwUnknownLine({ fits, className = '', short = false }: { fits: (Fit | null | undefined)[]; className?: string; /** one short line (model menu footer) */ short?: boolean }) {
  if (!fits.some(hwUnknown)) return null;
  return <p className={`fit-hw-line ${className}`.trim()} data-testid="fit-hw-line" role="note"><span title={short ? 'Your computer couldn’t be checked, so what fits isn’t known yet.' : undefined}>{short ? 'Couldn’t check what fits your computer' : 'Your computer couldn’t be checked, so what fits isn’t known yet.'}</span> <Link to={LOCAL_SETUP_HREF} className="fit-setup">Set up your computer</Link></p>;
}
export function FitTag({ fit, className = '', quietUnknown = false }: { fit: Fit | null | undefined; className?: string; quietUnknown?: boolean }) {
  const l = fitLabel(fit); if (!l || !fit) return null; if (quietUnknown && hwUnknown(fit)) return null; const src = l.kind === 'slow' && fit.etaSeconds ? etaSourceNote(fit) : null;
  const title = [fit.warning ?? fit.reason, src ? `Time: ${src}.` : null].filter(Boolean).join(' ') || undefined;
  return <span className={`fit-tag fit-${l.kind} ${className}`.trim()} data-testid="fit-tag" data-fit={l.kind} data-pinned={fit.pinnedAnyway ? '1' : undefined} title={title}>{l.text}{fit.pinnedAnyway && <small className="fit-pinned" data-testid="fit-pinned"> · pinned</small>}{src && <small className="fit-src" aria-hidden>{fit.eta?.source === 'learned' ? ' · timed' : ' · est.'}</small>}</span>;
}

/** The full fit under a picker or near Generate: tag, the server's reason word for word, the pinned warning, a lighter-version hint,
 *  'Use cloud instead' (only when the server names an alternative) and, when the hardware can't be read, a link to Local setup. */
export function FitNote({ fit, onUseCloud, className = '' }: { fit: Fit | null | undefined; onUseCloud?: (providerId: string) => void; className?: string }) {
  const l = fitLabel(fit); if (!l || !fit) return null; const alt = noteOffersAlt(fit) ? fit.alternative ?? null : null;
  const src = l.kind === 'slow' && fit.etaSeconds ? etaSourceNote(fit) : null;
  return <div className={`fit-note fit-note-${l.kind} ${className}`.trim()} data-testid="fit-note" data-fit={l.kind} role={fit.warning ? 'alert' : 'note'}>
    <span className="fit-note-l"><FitTag fit={fit} />{fit.reason && !(fit.warning && fit.warning.includes(fit.reason)) && <span className="fit-why" data-testid="fit-reason">{fit.reason}</span>}</span>
    {src && <small className="helper fit-eta-src" data-testid="fit-eta-src">Time: {src}.</small>}
    {fit.warning && <p className="fit-warn" data-testid="fit-warning">{fit.warning}</p>}{fit.pinnedAnyway && !fit.warning && <p className="fit-warn" data-testid="fit-pinned-note">Pinned anyway.</p>}
    {showLighter(fit) && <small className="helper fit-lighter" data-testid="fit-lighter">A lighter version is available.</small>}
    {alt && <AltButton alt={alt} testId="fit-use-cloud" onPick={e => { const b = e.currentTarget; const host = hostOf(b); (onUseCloud ?? useCloudInstead)(alt.providerId); refocus(host, b); }} />}
    {(l.kind === 'fits' || l.kind === 'slow') && <MemoryWarn fit={fit} alt={alt ? null : fit.alternative ?? null} onUseCloud={onUseCloud} />}
    {l.kind === 'unknown' && fit.reasonCode !== 'requirements_unknown' && <Link to={LOCAL_SETUP_HREF} className="fit-setup" data-testid="fit-setup-link">Set up your computer</Link>}
  </div>;
}

/** The same check for a quote (the dock's Generate button): only for a local route of 8 GB and up; null otherwise or when memory is fine. */
export function useMemoryShort(quote: any): ReturnType<typeof memoryCheck> {
  const f = quoteFitOf(quote); const local = !!f && (quote?.routeKind === 'local' || /^local:/.test(String(quote?.route ?? quote?.routeId ?? '')));
  const need = local && (f!.verdict === 'fits' || f!.verdict === 'slow') ? f!.recommendedVramGB ?? null : null; const hw = useHardware();
  const live = useLiveHardware(need != null && need >= HEAVY_GB && !!hw?.profile); const c = memoryCheck(need, hw?.profile, live); return c?.short ? c : null;
}
/** Fit check before a heavy local run (hardware plan §3.5): the model's memory need against what is free right now (shared memory on a Mac or a
 *  DGX Spark, the card's free memory otherwise; shared/thisComputer.ts memoryCheck). Short → "close other apps" and the cloud route when there is one.
 *  It never blocks Generate: ComfyUI offloads, so the run still works, slower. Reads memory only for models of 8 GB and up. */
function MemoryWarn({ fit, alt, onUseCloud }: { fit: Fit; alt: FitAlt | null; onUseCloud?: (providerId: string) => void }) {
  const need = fit.recommendedVramGB ?? null; const heavy = need != null && need >= HEAVY_GB;
  const hw = useHardware(); const live = useLiveHardware(heavy && !!hw?.profile);
  const c = memoryCheck(need, hw?.profile, live); if (!c?.short) return null;
  return <div className="fit-mem" data-testid="fit-mem" role="status"><span>{c.text}</span>
    {alt?.providerId && <AltButton alt={alt} testId="fit-mem-cloud" onPick={e => { const b = e.currentTarget; const host = hostOf(b); (onUseCloud ?? useCloudInstead)(alt.providerId); refocus(host, b); }} />}</div>;
}

/* B30: after 'Use cloud instead' the button unmounts; put focus on the model picker (or Generate) in the same composer, not <body>. */
const hostOf = (el: HTMLElement) => el.closest<HTMLElement>('.ic-dock, .gb, .ws-panel, .as-panel, form, section, main') ?? document.body;
function refocus(host: HTMLElement, from?: HTMLElement) {
  const pick = () => [...host.querySelectorAll<HTMLElement>('[data-fit-focus], .ic-model, [aria-haspopup="listbox"], .gen-btn')].find(t => t !== from && !t.closest('.fit-note, .wp') && !(t as HTMLButtonElement).disabled);
  const t = pick(); if (t) t.focus(); // move focus now: the clicked button unmounts once the new quote lands
  let n = 0; const tick = () => { if (document.activeElement && document.activeElement !== document.body && document.contains(document.activeElement)) return; const x = pick(); if (x) x.focus(); else if (n++ < 10) setTimeout(tick, 100); };
  setTimeout(tick, 400);
}
/** 'Not now' on the download prompt, kept for this tab session per model. */
const LATER = new Set<string>();

/** First use of a local model whose files aren't on this computer yet. B31: the plan comes from the server's dry run (nothing is
 *  fetched): its size (checked, or the full size when no folder could be checked), whether it can download (canDownload / code)
 *  and its own sentence when it can't. Yes marks the next run to download first. A 409 weights gate shows the server's words. */
export function WeightsPrompt({ providerId, requirements, variantId = null, reasonCode, alternative, onUseCloud, downloading, downloadId }: { providerId: string; requirements?: any; variantId?: string | null; reasonCode?: string | null;
  /** the server's cloud alternative (fit.alternative), offered as 'Use cloud instead' */ alternative?: FitAlt | null; onUseCloud?: (providerId: string) => void;
  /** a run on this model is already downloading or loading it: don't offer the download again */ downloading?: boolean; /** B31: the server's downloadId (else requirements.downloadId) */ downloadId?: string | null }) {
  const intent = useDownloadIntent(providerId); const [busy, setBusy] = useState(false); const [err, setErr] = useState<{ code?: string; text: string } | null>(null);
  const [later, setLater] = useState(() => LATER.has(providerId)); const [plan, setPlan] = useState<DryRun | null>(null); const [choices, setChoices] = useState<DlChoice[] | null>(null); const [picked, setPicked] = useState<DlChoice | null>(null); const [allChoices, setAll] = useState<DlChoice[] | null>(null);
  const [gate, setGate] = useState<any>(() => gates.get(providerId) ?? null);
  const dlId = String(downloadId ?? requirements?.downloadId ?? providerId);
  const need0 = Number(requirements?.missingBytes) || 0; const flagged = need0 > 0 || reasonCode === 'weights_missing' || !!gate;
  const open = !!providerId && flagged && !intent && !later && !downloading;
  useEffect(() => (providerId ? promptMounted(providerId) : undefined), [providerId]);
  useEffect(() => { const f = (e: Event) => { const d = (e as CustomEvent).detail; if (String(d?.providerId) === providerId) { setGate(d.body); LATER.delete(providerId); setLater(false); } }; window.addEventListener(WEIGHTS_GATE_EVT, f); setGate(gates.get(providerId) ?? null); return () => window.removeEventListener(WEIGHTS_GATE_EVT, f); }, [providerId]);
  useEffect(() => { setPlan(null); setChoices(null); setErr(null); if (!open) return; let live = true;
    dryRunDownload(String(gate?.downloadId ?? dlId), variantId).then(r => { if (!live) return; if (r.ok) setPlan(r.data); else if (r.code === 'ambiguous_download' && r.choices?.length) { setChoices(r.choices); setAll(r.choices); } });
    return () => { live = false; }; }, [open, dlId, variantId, gate?.downloadId]);
  if (!providerId || (!flagged && !intent)) return null;
  if (downloading && !intent) return <div className="wp wp-busy" data-testid="weights-downloading" role="status"><span>The model files are downloading for your current run.</span></div>;
  if (later && !intent) return <div className="wp wp-later" data-testid="weights-later"><span>Model files aren’t on this computer yet.</span><button type="button" className="btn btn-sm btn-ghost" data-testid="weights-reopen" onClick={() => { LATER.delete(providerId); setLater(false); }}>Download options</button></div>;
  const need = plan ? Number(plan.missingBytes) || 0 : Number(gate?.missingBytes) || need0; const src = plan?.missingBytesSource ?? requirements?.missingBytesSource ?? null;
  const size = intent?.bytes || need || Number(requirements?.downloadBytes) || 0;
  if (intent) return <div className="wp wp-on" data-testid="weights-prompt" role="status"><span>Downloads {size ? gbText(size) : 'the model files'} first, then runs. Nothing is charged for the download.</span><button type="button" className="btn btn-sm btn-ghost" data-testid="weights-undo" onClick={() => setDownloadIntent(providerId, null)}>Don’t download</button></div>;
  const alt: FitAlt | null = (gate?.fit?.alternative ?? gate?.alternative ?? alternative ?? null);
  const blocked = !!plan && plan.canDownload === false; const none = blocked && plan!.code === 'nothing_to_download';
  const pick = async (id: string, c?: DlChoice) => { setBusy(true); setErr(null); const r = await dryRunDownload(id, variantId, true); setBusy(false);
    if (!r.ok) { if (r.code === 'ambiguous_download' && r.choices?.length) { setChoices(r.choices); setAll(r.choices); return; } setErr({ code: r.code, text: r.error }); return; }
    if (c) { setPicked(c); setChoices(null); } setPlan(r.data); if (r.data.canDownload === false) return; setChoices(null); setDownloadIntent(providerId, { variantId, bytes: r.data.missingBytes || null }); };
  const sizeText = !size ? 'Needs its model files, download now?' : src === 'assumed_all' ? `Full download: ${gbText(size)}. Download now?` : `Missing files: ${gbText(size)}. Download now?`;
  return <div className="wp" data-testid="weights-prompt" data-src={src ?? undefined} data-can={plan ? String(plan.canDownload !== false) : undefined} role="group" aria-label="Model download">
    {gate?.error && <Notice as="p" kind="error" tone="line" className="wp-err" testId={`weights-gate-${gate.code ?? 'error'}`}>{String(gate.error)}</Notice>}
    {picked && allChoices && <span className="wp-picked" data-testid="weights-picked">{choiceText(picked, allChoices)} <button type="button" className="link-btn" data-testid="weights-repick" onClick={() => setChoices(allChoices)}>Pick another</button></span>}
    <span data-testid="weights-size">{none ? (plan!.error || 'All the files are already on this computer.') : sizeText}</span>
    {!none && !choices && <button type="button" className="btn btn-sm" data-testid="weights-yes" disabled={busy || blocked} aria-disabled={busy || blocked} aria-describedby={blocked ? `wp-why-${providerId}` : undefined} aria-busy={busy} onClick={() => pick(String(picked?.downloadId ?? gate?.downloadId ?? dlId))}>{busy ? 'Checking…' : 'Download with this run'}</button>}
    <button type="button" className="btn btn-sm btn-ghost" data-testid="weights-later-btn" disabled={busy} onClick={() => { LATER.add(providerId); setLater(true); }}>Not now</button>
    {alt?.providerId && <AltButton alt={alt} testId="weights-use-cloud" disabled={busy} onPick={e => { const b = e.currentTarget; const host = hostOf(b); (onUseCloud ?? useCloudInstead)(alt.providerId); refocus(host, b); }} />}
    {choices && <div className="wp-choices" role="group" aria-label="Pick what to download" data-testid="weights-choices">{choices.map(c => <button key={c.downloadId} type="button" className="btn btn-sm" data-testid="weights-choice" aria-pressed={picked?.downloadId === c.downloadId} disabled={busy} onClick={() => pick(c.downloadId, c)}>{choiceText(c, choices)}{typeof c.bytesTotal === 'number' && c.bytesTotal > 0 ? ` · ${gbText(c.bytesTotal)}` : ''}</button>)}</div>}
    {blocked && !none && plan!.error && <p className="helper wp-why" id={`wp-why-${providerId}`} role="note" data-testid={`weights-err-${plan!.code ?? 'error'}`}>{plan!.error}{plan!.code === 'no_models_dir' && <> <Link to={LOCAL_SETUP_HREF}>Set up your computer</Link></>}</p>}
    {open && !plan && !choices && !err && <p className="helper wp-why wp-pend" aria-hidden="true" data-testid="weights-pending" /> /* the dry run's answer lands here; its slot is kept so the dock doesn't jump */}
    {err && <Notice as="p" kind="error" tone="line" className="wp-err" testId={`weights-err-${err.code ?? 'error'}`}>{err.text}{err.code === 'no_models_dir' && <> <Link to={LOCAL_SETUP_HREF}>Set up your computer</Link></>}</Notice>}
  </div>;
}

/** B32: on phones (< 640px) the fit note and the download prompt fold into one summary line: the fit tag, 'Download options'
 *  (expands the full note and prompt) and, when the server names one, 'Use cloud instead' in one tap. Wider screens show the full
 *  content and no summary (CSS only, so nothing re-lays out after load). A 409 weights gate opens it. */
export function LocalCollapse({ fit, alternative, providerId, weights, missingBytes, onUseCloud, children }: { fit: Fit | null | undefined; alternative?: FitAlt | null; providerId?: string | null;
  /** the download prompt is part of it */ weights?: boolean; /** B33: bytes still to download, from the quote */ missingBytes?: number | null; onUseCloud?: (providerId: string) => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false); const intent = useDownloadIntent(providerId ?? null); const id = `loc-${providerId ?? 'x'}`; const root = useRef<HTMLDivElement>(null);
  /* In the composer dock the details float above it (CSS): there, Escape and a click outside close them, focus back on the toggle */
  useEffect(() => { if (!open) return; const el = root.current; const body = el?.querySelector<HTMLElement>('.loc-body'); if (!el || !body || getComputedStyle(body).position !== 'absolute') return;
    const tgl = () => el.querySelector<HTMLElement>('.loc-tgl'); const down = (e: PointerEvent) => { const t = e.target as Element; if (!el.contains(t) && !t.closest?.('.apop')) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); tgl()?.focus(); } };
    document.addEventListener('pointerdown', down, true); window.addEventListener('keydown', key, true); return () => { document.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true); }; }, [open]);
  useEffect(() => { if (!providerId) return; const f = (e: Event) => { if (String((e as CustomEvent).detail?.providerId) === providerId) setOpen(true); }; window.addEventListener(WEIGHTS_GATE_EVT, f); return () => window.removeEventListener(WEIGHTS_GATE_EVT, f); }, [providerId]);
  const alt = fit?.alternative ?? alternative ?? null; const has = !!fitLabel(fit) || !!weights;
  if (!has) return <>{children}</>;
  return <div ref={root} className={`loc-c${open ? ' open' : ''}`} data-testid="loc-collapse">
    <div className="loc-sum" data-testid="loc-sum">
      {/* Missing files: the pill says so (brand orange), never a green 'Runs on this computer'; a slow or too-heavy fit still shows its tag */}
      {fit && !(weights && fitLabel(fit)?.kind === 'fits') && <FitTag fit={fit} />}{(() => { /* B33 (BH E): say what's missing, size from the data */ const b = intent?.bytes || missingBytes || null; return weights ? <small className="loc-intent loc-need" data-testid="loc-intent">Download needed{b ? ` · ${gbText(b)}` : ''}</small> : intent ? <small className="loc-intent loc-need" data-testid="loc-intent">Downloads {intent.bytes ? gbText(intent.bytes) : 'the files'} first</small> : null; })()}
      <button type="button" className="btn btn-sm btn-ghost loc-tgl" data-testid="loc-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>{open ? (weights ? 'Hide options' : 'Hide details') : weights ? 'Download' : 'Details'}</button>
      {!open && alt?.providerId && <AltButton alt={alt} testId="loc-use-cloud" onPick={e => { const b = e.currentTarget; const host = hostOf(b); (onUseCloud ?? useCloudInstead)(alt.providerId); refocus(host, b); }} />}
    </div>
    <div className="loc-body" id={id}>{children}</div>
  </div>;
}
