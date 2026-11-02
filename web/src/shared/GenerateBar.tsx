import { Notice } from './Notice';
import { useComfyVersion, olderThan, minComfyOf, minComfyHint, minComfyBlock } from './comfyVersion';
import { runPrice, placeOfQuote, ownAccountsNow } from './billing';
import { EtaLine } from './EtaLine';
import { GenHint } from '../ui/edge/Edge';
import { RoutePicker, ViaLine, openNeedsKey } from '../ui/routing/Routes';
import { RunOnField } from '../ui/routing/RunOn';
import { SetupStatus, setupNeeded } from './SetupCard';
import { GenStatus, useGenReason } from './GenStatus';
import { useDownloadIntent } from './hardware';
import { useToolModels, modelOfEngine, runOnLabel, runOnOfRoute, enginesModels, setActiveModel, shownName } from './models';
import { orderModels, qualityPickOf, modelStatus, tierChipsOf, fallbackNoteOf, withQuoteDefaults, type Defaults } from './defaults';
import { useEffect, useRef, useState } from 'react';
import { useSubmitting } from './submitGuard';
import { useLocalFree, LOCAL_FREE_HEADLINE } from '../ui/next/LocalFree';
import { isOpenWeights, providerGroupOf, displayNameOf } from './OpenWeights';
import { DraftToggle } from '../ui/next/Gen';
import { fmtSec, ProviderInfo } from '../api';
import { RESOLUTIONS as SHARED_RESOLUTIONS } from '../../../server/src/shared/mediaAccept';
const RESOLUTIONS: string[] = [...SHARED_RESOLUTIONS];
import QualitySelect from '../ui/b1/QualitySelect';
import GenerateButton from '../ui/b1/GenerateButton';
import { KeyNeeded, isKeyGate } from './KeyNeeded';
import { splitLead, demoTagOf } from './quote';
import { FitNote, USE_PROVIDER_EVT } from './FitNote';
import { isFit, quoteFitOf } from './fit';
import { DemoText } from './DemoText';
import { CostNote } from './CostNote';
import { isPlainBlock, sizeLine, blockedPrice, runBlock, isLocalOff, sizeEstLine, reasonWords, LOCAL_OFF_TEXT } from './quote';
import { Link } from '../platform/router';
import { ModelMenu } from './ModelMenu';
import { exampleFor } from '../ui/examples';
import { useModels } from './batch1';
import IssueList, { FieldIssue, Issue } from '../ui/IssueList';
import { RouteNotRunnable } from './RouteNotRunnable';
import { singleMissing } from './missing';
import { MakerTile } from './MakerTile';
import { IMAGE_FEATURES } from './imageFeatures';
const QDESC: Record<string, string> = { '480p': 'Fastest and cheapest', '720p': 'Balanced speed and detail', '768p': 'This model’s full resolution', '2K': 'Highest detail · slowest', '1080p': 'Best fidelity · slower upscale pass' };
/** Settings chips (resolution, seed) + Generate button that shows estimated GPU time instead of credits. */
export default function GenerateBar({ demo, quote, extra, rows, hideGpu, keyGate, toolId, showDraft, issues = [], calls, draftSec, onReset, mentionIssues = [], resolution, setResolution, seed, setSeed, estSec, missing, onGenerate, hideQuality = false, label = 'Generate', backend,  onDraft, resolutions = RESOLUTIONS, providers: providersIn = [], provider = '', defaults, setProvider, media = 'video', audio = true, free, useFree = false, setUseFree, prices, viaRoute, priceUnavailable, quotePending = false, modelName, cardProvider, qualityHints, hold = null, plain = false }: { /** A workflow you added: Generate waits for this ("Add links for 3 files under Needs"), shown under it, instead of the download step. */ hold?: string | null; /** A workflow you added: plain setup and timing lines ("your computer", no "we"). */ plain?: boolean; /** Per-quality words that replace the generic ones (a model's own: Standard / Pro, Faster / Sharper). */ qualityHints?: Record<string, string>; /** B27: the tool's (mode's / swap type's) cloud-first defaults: quality order, quality pick, fallback note. */ defaults?: Defaults | null; /** B18: the model the card shows when the picked option runs elsewhere (Camera H3 move on Auto). */ cardProvider?: string; /** B15: what the picked option actually runs (Camera LTX move on a shared provider → LTX-2 19B); overrides the card name. */ modelName?: string; /** The live quote: `localRun` hides the price, `priceLine` is the server's one-line price (demo list price included). */ quote?: any; demo?: string | null; /** Quote said priceAvailable:false + runnable:false: no price shown, Generate blocked with this reason. */ priceUnavailable?: string | null; /** First quote not back yet: hold the price slot (no local guess, no wrong text). */ quotePending?: boolean; extra?: React.ReactNode; rows?: boolean; hideGpu?: boolean;  keyGate?: any; hideQuality?: boolean; toolId?: string; showDraft?: boolean; issues?: Issue[]; calls?: number; draftSec?: number; onReset?: () => void; mentionIssues?: { message: string }[]; prices?: Record<string, number>; media?: 'video' | 'image'; audio?: boolean; free?: { left: number; maxRes: string } | null; useFree?: boolean; setUseFree?: (b: boolean) => void; viaRoute?: string | null; onDraft?: () => void; resolutions?: string[];  providers?: ProviderInfo[]; provider?: string; setProvider?: (p: string) => void; resolution: string; setResolution: (r: string) => void; seed: number; setSeed: (n: number) => void; estSec: number; missing: string[]; onGenerate: () => void; label?: string; backend: string }) {
  /* B27 (A1–A3, A6): models in quality order, twin aliases folded into their model's route chips, the quality pick marked */
  const D: Defaults | null = withQuoteDefaults(defaults ?? null, quote) /* B28a: the quote's defaults first, the tool's as the fallback */;
  const providers = orderModels(providersIn, D?.qualityOrder, provider); const qPick = providers.length > 1 ? qualityPickOf(D, providers) : null;
  const fbNote = fallbackNoteOf(D?.defaultFallback ?? null, provider); const curSt = modelStatus(providers.find(p => p.id === provider));
  useEffect(() => { const f = (e: Event) => { const id = (e as CustomEvent<{ providerId?: string }>).detail?.providerId; if (id && setProvider && providersIn.some(x => x.id === id)) setProvider(id); }; addEventListener(USE_PROVIDER_EVT, f); return () => removeEventListener(USE_PROVIDER_EVT, f); }, [providersIn, setProvider]); /* Batch 28: 'Use cloud instead' from a route chip */
  const subBusy = useSubmitting(toolId); const lf = useLocalFree(); const [draftOn, setDraftOn] = useState(false); const [pickOpen, setPickOpen] = useState(false); const mbtn = useRef<HTMLButtonElement>(null); const panelRef = { get current() { return mbtn.current?.closest<HTMLElement>('.ws-panel') ?? null; } }; /* the model menu opens beside the tool panel */
  // [EDGE #6] Locked from click until createJob returns (sync ref stops a same-tick double-click).
  const inFlight = useSubmitting(); const clickLock = useRef(false); const [clicking, setClicking] = useState(false);
  const locked = (fn: () => unknown) => () => { if (clickLock.current || inFlight) return; clickLock.current = true; setClicking(true);
    Promise.resolve().then(fn).catch(() => 0).finally(() => { clickLock.current = false; setClicking(false); }); };
  const busy = clicking || inFlight;
  /* nothing ready (or the chosen place needs setup) → the reason line above Generate says the step (shared GenStatus) */
  const dlIntent = useDownloadIntent(cardProvider ?? provider); const setupM = toolId ? modelOfEngine(toolId, cardProvider ?? provider, modelName) : undefined;
  const needSetup = setupNeeded(setupM, quote, cardProvider ?? provider, dlIntent) && !hold;
  /* a place to set up: the shared reason line above Generate says it (its own lines below cover keys, local off and blocked routes) */
  const gr = useGenReason({ toolId: toolId ?? '', engine: cardProvider ?? provider, quote }); const setupR = needSetup && toolId ? gr : null;
  const kg = (!!keyGate || isKeyGate(quote)) && !needSetup; // B15 PB c1e28ff: a missing key is never a charge
  /* B19: any runnable:false quote blocks here too (callers that pass only an unpriced reason), in the server's words; local_off is a 'turn it on' state. */
  if (!priceUnavailable && !kg && !needSetup && quote?.runnable === false && !(quote?.missingInput && missing.length) /* B20: a missing input the caller already lists */) priceUnavailable = runBlock(quote); const localOff = !kg && quote?.runnable === false && isLocalOff(quote);
  /* B19 (item 6): a quote-time 400 invalid_<field> (e.g. quality ultra) is shown like a submit issue, in the server's words; language has its own slot
     in the form. resolution/quality issues sit under the quality picker; the rest in the list above Generate. */
  const qIss: any[] = /^invalid_/.test(String(quote?.code ?? '')) && Array.isArray(quote?.issues) ? quote.issues.filter((i: any) => i?.field && i.field !== 'language' && !issues.some((x: any) => x?.field === i.field)) : [];
  const allIss: any[] = [...issues, ...qIss]; const isQ = (i: any) => i?.field === 'resolution' || i?.field === 'quality';
  if (!priceUnavailable && qIss.length) priceUnavailable = String(qIss[0].message ?? '');
  /* B21: imperative reasons ('Add a start image') read as they are; nouns keep the 'Missing:' line. */
  const fmtMissing = (b: string[]) => singleMissing(b) ?? (b.some(x => /^(Add|Pick|Record|Upload) /.test(x)) ? b.map(x => /^(Add|Pick|Record|Upload) /.test(x) ? x : `Add ${x}`).join(' · ') : `Missing: ${b.join(', ')}`);
  const plainBlk = isPlainBlock(quote); const blocking = [...missing]; if (priceUnavailable) blocking.push(plainBlk ? 'a setting this model can run' : 'a setting with a verified price');
  const guard = (fn: () => void) => () => fn();
  const cardPicker = providers.length >= 2;
  useToolModels(toolId); const tm = cardPicker ? modelOfEngine(toolId, cardProvider ?? provider, modelName) : undefined; /* Model vs Run-on: the model this pick runs (Camera: the move's model) */
  /* A one-engine tool (Upscale, Reframe, H3 Extend…) has no model card: its Run on field shows here when there is a real choice (two places, or two models) */
  const soloE = !cardPicker ? (provider || providers[0]?.id || '') : ''; const soloMs = soloE && toolId ? enginesModels(toolId, soloE) : [];
  const soloM = soloMs.length ? modelOfEngine(toolId, soloE) : undefined; const soloPlaces = new Set(soloMs.flatMap(m => m.runsOn.filter(r => r.status !== 'coming-soon' && r.status !== 'unavailable').map(r => r.id)));
  useEffect(() => { const e = cardProvider ?? provider; if (toolId && tm && e && enginesModels(toolId, e).length > 1) setActiveModel(toolId, tm.key); }, [toolId, tm?.key, cardProvider, provider]); /* quotes + submits name that model (shared/models.ts) */
  const reg = useModels(cardPicker ? toolId : undefined);
  const comfyV = useComfyVersion();
  const soonOf = (id: string): string | undefined => { const p: any = providers.find(x => x.id === id); const rs: any[] = p?.routes ?? (reg.models.find(m => m.providerId === id || m.id === id) as any)?.routes ?? []; const mv = minComfyOf(p, reg.models.find(m => m.providerId === id || m.id === id)); if (mv && comfyV && olderThan(comfyV, mv)) return minComfyBlock(mv, comfyV); return rs.length && rs.every(r => r.caps?.comingSoon) ? (rs[0].reason ?? 'not available yet') : undefined; };
  const flagsOf = (id: string): string[] => { const r: any = reg.models.find(m => m.providerId === id || m.id === id); const p: any = providers.find(x => x.id === id); const rs: any[] = r?.routes ?? p?.routes ?? []; const exp = !!(r?.experimental || p?.experimental || rs.some((x: any) => x.caps?.experimental)); const loc = !!(r?.localOnly || p?.localOnly || rs.some((x: any) => x.caps?.localOnly)); const mv = minComfyOf(p, r); return [...(exp ? ['Experimental'] : []), ...(loc ? ['Your computer only'] : []), ...(mv ? [minComfyHint(mv)] : [])]; }; const regOf = (id: string) => reg.models.find(m => m.providerId === id || m.id === id);
  /* A provider named only by its kind ('Open weights', 'Hosted API') shows the registry's model name instead (e.g. comfy-open → Wan 2.2 Animate 14B). */
  const nameOf = (p: { id: string; name: string }): string => { const r: any = regOf(p.id); const dn = displayNameOf(p, r); if (dn) return dn; return (!p.name || /^(open[- ]weights|hosted( api)?|local|api)$/i.test(p.name.trim())) && r?.name ? String(r.name) : p.name; };
  const kind = providers.find(p => p.id === provider)?.kind ?? providers[0]?.kind ?? 'open-weights';
  // Only a quote that says it runs locally hides the price (an open-weights model on a fal demo is not local). Without a quote, the old local guess.
  const hidePrice = quotePending ? false : quote ? quote.localRun === true && quote.demo !== true /* B20: a demo quote shows only the demo line, never 'No credits — runs locally' too */ : !(estSec > 0) && kind === 'open-weights'; void lf;
  const priceLine: string | null = quote && typeof quote.priceLine === 'string' && quote.priceLine.trim() && quote.localRun !== true ? quote.priceLine.trim() : null;
  /* B34 (CLS): before the first quote, a tool whose route will be a sample run keeps the demo line's slot (from the tool's provider data), so the bottom bar doesn't grow when the quote lands */
  const demoSoon = !quote && !demo && (() => { const ps = (providersIn ?? []) as any[]; const pv = provider ? ps.find(x => x?.id === provider) : null; if (pv) return pv.demo === true; return ps.some(x => x?.demo === true) && !ps.some(x => x?.demo !== true && x?.available === true && x?.runnable !== false); })();
  const demoLine = demo ? (priceLine && splitLead(priceLine)[0] && splitLead(priceLine)[0] === splitLead(demo)[0] ? priceLine /* B27: the server's price line verbatim (it repeats the demo lead) */ : demo) : null;
  /* An image tool (Brush Edit, Camera Angles, Camera & Lens…) has no 480p draft: that is a video idea (QA #15). */
  const imageOut = !!toolId && IMAGE_FEATURES.some(f => f.toolId === toolId);
  const draftable = !!onDraft && !imageOut && (showDraft ?? media === 'video'); const useDraft = draftable && draftOn;
  return <div className={`genbar ${hidePrice ? 'lf-free' : ''}`} data-local-free={hidePrice || undefined}>
    {cardPicker && setProvider && (() => { const cur = providers.find(p => p.id === (cardProvider ?? provider)) ?? providers[0]; return <div className="pv-card-row">
      <button ref={mbtn} type="button" className="model-btn pv-model-btn" onClick={() => setPickOpen(o => !o)} aria-haspopup="listbox" aria-expanded={pickOpen}>{imageOut ? ((mm) => <MakerTile className="pv-thumb pv-mk" medium="image" maker={mm?.maker} makerName={mm?.makerName} fallback={(mm ? shownName(mm) : null) || nameOf(cur)} title={false} />)(tm ?? modelOfEngine(toolId, cur.id) as any)
        : <span className="pv-thumb" style={{ backgroundImage: `url(${(regOf(cur.id) as any)?.posterUrl || exampleFor(cur.id).poster /* '' = stand-in app with no poster yet */})` }} />}<span className="pv-txt"><span className="model-k">Model</span><b title={modelName && modelName !== nameOf(cur) ? `${modelName} runs this move` : tm ? `${shownName(tm)} · ${runOnLabel(viaRoute ? runOnOfRoute(viaRoute) : null) || 'Run on below'}` : undefined}>{tm ? shownName(tm) : modelName || ((cm) => (cm ? shownName(cm) : null))(modelOfEngine(toolId, cur.id)) || nameOf(cur)}{flagsOf(cur.id).map(f => <span key={f} className={`mdl-flag ${f === 'Experimental' ? 'exp' : 'loc'}`}>{f}</span>)}</b>{!tm && <ViaLine p={cur} override={viaRoute} />}</span><span className="model-change">Change</span></button>
      {tm ? <RunOnField toolId={toolId!} model={tm} engine={cur.id} quote={quote} testId="gb-run-on" avoid={panelRef} /> : <RoutePicker p={cur} />}
      
      <ModelMenu open={pickOpen} anchor={mbtn} avoid={panelRef} onClose={() => setPickOpen(false)} value={cardProvider ?? provider} onPick={id => setProvider(id)} testId="model-dropdown" toolId={toolId ?? ''} modelHint={modelName} quote={quote}
        items={providers.map(p => { const r: any = regOf(p.id); const name = nameOf(p); const b0 = (r?.badges ?? []).find((b: string) => /^new$/i.test(b)); return { id: p.id, name, family: r?.family ?? (p as any).family ?? p.name, top: p.id === qPick, badge: b0 ? 'New' : undefined, open: p.kind === 'open-weights' || isOpenWeights(r, p), off: soonOf(p.id) ?? null,
          tip: [...(tierChipsOf(p) ?? [providerGroupOf(p, r)]), r?.speed, ...flagsOf(p.id), (p as any).demoPreview === true ? demoTagOf(p) : null, (r?.isDefault ?? r?.default) ? 'Default' : null].filter(Boolean).join(' · '), p: { ...r, ...p, routes: (p as any).routes ?? r?.routes } }; })} />
    </div>; })()}
    {soloM && (soloPlaces.size > 1 || soloMs.length > 1) && <div className="gb-runon"><RunOnField toolId={toolId!} model={soloM} engine={soloE} quote={quote} testId="ws-run-on" avoid={panelRef} /></div>}
    {!needSetup && quote?.runnable !== false && isFit(quote?.fit) && <FitNote fit={quoteFitOf(quote)} onUseCloud={id => { if (setProvider && providers.some(x => x.id === id)) setProvider(id); }} className="gb-fit" /> /* Batch 28: the picked local route on this computer, when it runs */}
    <SetupStatus model={setupM} engine={cardProvider ?? provider} quote={quote} className="gb-setup-status" plain={plain} /> {/* setup is the reason line above Generate (GenStatus); only the quiet download-chosen line sits here */}
    {(fbNote || (curSt.keyCue && !needSetup)) && <div className="gb-defaults">{fbNote && <p className="helper default-fb" role="note" data-testid="default-fallback">{fbNote}</p>}{curSt.keyCue && !needSetup && <button type="button" className="link-btn gb-key-cue" data-testid="model-key-cue" title={curSt.note ?? undefined} onClick={() => openNeedsKey({ error: curSt.note ?? undefined, modelId: provider }, provider)}>{curSt.keyCue}</button>}</div>}
    {providers.length > 1 && setProvider && <>
      <label className={`field ${cardPicker ? 'sr-only-vis' : ''}`} htmlFor="provider">PROVIDER</label>
      <select id="provider" className={cardPicker ? 'sr-only-vis' : undefined} value={provider} onChange={e => setProvider(e.target.value)} style={{ maxWidth: 360 }}>
        {providers.map(p => <option key={p.id} value={p.id} disabled={!!soonOf(p.id) || !!modelStatus(p).off} title={soonOf(p.id) ?? modelStatus(p).note ?? undefined}>{nameOf(p)}{soonOf(p.id) ? " (coming soon)" : ""}</option>)}
      </select>
    </>}
    {!hideQuality && <div className="settings-chips"><QualitySelect value={resolution} onChange={setResolution} options={resolutions.map(r => ({ value: r, label: r, desc: qualityHints?.[r] ?? QDESC[r] ?? '', price: prices?.[r] }))} quote={quote} /></div>}
    {!hideQuality && allIss.filter(isQ).slice(0, 1).map((i: any, n) => <Notice as="p" key={n} kind="error" tone="line" className="field-err" testId="enum-issue" data-field={i.field}>{String(i.message ?? '')}</Notice>)}
    {resolution === '1080p' && kind === 'open-weights' && <p className="helper warn">1080p takes longer on your computer.</p>}
    <details className="mt-12 gb-adv" data-testid="gb-advanced" onToggle={e => { const d = e.currentTarget; if (d.open) requestAnimationFrame(() => d.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); /* BH12 T7: opened rows land above the sticky Generate bar (scroll-padding-bottom) */ }}><summary>Advanced</summary>
      {rows && <div className="gb-adv-extra">{extra}{draftable && <DraftToggle on={draftOn} onChange={(v: boolean) => { if (!subBusy) setDraftOn(v); }} hint={hidePrice ? 'Quick 480p preview. Upscale or render the one you like.' : 'Quick 480p preview at about 30% of the cost.'} />}</div>}
      <label className="field">SEED</label>
      <div className="row"><input type="number" value={seed} onChange={e => setSeed(Number(e.target.value))} style={{ maxWidth: 200 }} /><button className="btn seed-dice" aria-label="New random seed" title="Same seed and settings usually look similar, but results can still vary." onClick={() => setSeed(Math.floor(Math.random() * 1e6))}>🎲</button></div>
      {audio && <><label className="field">AUDIO</label>
      <label className="row helper"><input type="checkbox" checked disabled /> Original audio preserved</label></>}
      {onReset && <><label className="field">FORM</label><button className="btn btn-sm form-reset" onClick={onReset}>Reset form</button></>}
    </details>
    {mentionIssues.map((m, i) => <p key={i} className="err mention-issue">{m.message}</p>)}
    <p className="helper sfw-note" title="Imagination Is All You Need is SFW-only. Prompts are filtered; blocked runs show a clear message."><span aria-hidden>ⓘ</span> SFW only</p>
    {free && setUseFree && !(hidePrice && !useFree) && rows && <label className={`fg-row ${!free.left ? 'off' : ''}`} data-testid="free-gens-row"><span>Use free gens</span><em className="fg-n" title={`Free gens: ${free.left} remaining · up to ${free.maxRes}`}>✦ {free.left}</em><input className="sr-only" type="checkbox" checked={useFree} disabled={!free.left} onChange={e => setUseFree(e.target.checked)} /><i className={`fg-pill ${useFree ? 'on' : ''}`} aria-hidden /></label>}
    {free && setUseFree && !(hidePrice && !useFree) && !rows && <label className="row helper"><input type="checkbox" checked={useFree} disabled={!free.left} onChange={e => setUseFree(e.target.checked)} /> Use free gens (Free gens: {free.left} remaining · up to {free.maxRes})</label>}
    <RouteNotRunnable issues={issues} /><IssueList issues={allIss.filter((i: any) => i?.code !== 'route_not_runnable' && i?.code !== 'idempotency_conflict' && !(isQ(i) && !hideQuality))} />
    {!rows && draftable && <DraftToggle on={draftOn} onChange={(v: boolean) => { if (!subBusy) setDraftOn(v); }} hint={hidePrice ? 'Quick 480p preview. Upscale or render the one you like.' : 'Quick 480p preview at about 30% of the cost.'} />}
    <GenStatus r={setupR} className="gb-status" />
    <div className="row gen-row mt-16">
      {hold ? <GenerateButton label={label} ready={false} missing={[hold]} price={null} why={hold} onClick={() => {}} />
      : setupR ? <GenerateButton label={label} ready={false} missing={[]} price={null} why={setupR.reason} onClick={() => {}} /> /* the reason line above says the step */
      : kg ? <GenerateButton label={label} ready={false} missing={[]} price={null} why="Add a provider key to run this model." onClick={() => {}} /> : <GenerateButton why={localOff && blocking.length === 1 ? String(quote?.reasonText || 'Use local ComfyUI is off in Settings.') /* B20: short, not the note again */ : blockedPrice(quote) != null ? String(quote.blockedReason) : null} calls={calls} label={useDraft ? `${label} draft` : label} ready={blocking.length === 0} soft={blocking.length > 0 && !priceUnavailable && !localOff && blockedPrice(quote) == null} missing={blocking} busy={busy} free={useFree || (hidePrice && !quotePending && !priceUnavailable && !localOff && !!quote) /* a quote that runs locally: 'Generate · Free' */} quote={quote} demoQ={quote?.demo === true && !priceUnavailable && !localOff && blockedPrice(quote) == null ? quote : null} price={quote?.demo === true ? null : blockedPrice(quote) != null ? blockedPrice(quote) /* B19: input block: real price, muted (Generate is off) */ : hidePrice || priceUnavailable || quote?.chargeable === false ? null : useDraft ? (draftSec ?? Math.max(5, Math.round(estSec * 0.3))) : estSec > 0 ? estSec : null} onClick={locked(guard(useDraft ? onDraft! : onGenerate))} />}<GenHint toolId={toolId} />
      {onDraft && !draftable && !imageOut && <button className="btn" disabled={kg || blocking.length > 0 || busy || subBusy} aria-busy={busy || subBusy} onClick={locked(guard(onDraft))} title="Quick 480p preview. Make the final version later with the same settings.">Draft 480p{estSec > 0 && !kg && <span className="cost cost-soft">{runPrice({ own: ownAccountsNow(), credits: draftSec ?? Math.max(5, Math.round(estSec * 0.3)), runOn: placeOfQuote(quote) })}</span>}</button>}
      {kg && <KeyNeeded q={quote} toolId={toolId} />}{hold ? <span className="helper gen-missing" data-testid="gen-hold" role="status">{hold}</span> : localOff && blocking.length === 1 ? <LocalOffNote q={quote} /> : !needSetup && (!kg || blocking.length > 0) && <span className={`helper ${blocking.length ? 'gen-missing' : ''}${blocking.length > 0 && !(priceUnavailable && (blocking.length === 1 || plainBlk)) ? ' sr-only' : ''}`} id={blocking.length ? `gb-why-${toolId ?? 'tool'}` : undefined} data-testid={blocking.length ? 'gen-missing' : undefined} title={localOff && blocking.length === 1 ? String(reasonWords(quote) ?? LOCAL_OFF_TEXT) : blocking.length ? (priceUnavailable && (blocking.length === 1 || plainBlk) ? (plainBlk ? priceUnavailable : `Price unavailable: ${priceUnavailable}`) : fmtMissing(blocking)) : undefined}>{quotePending && !blocking.length ? <span className="gb-price-ph shimmer" data-testid="gen-price-pending" aria-label="Checking the price" /> : priceUnavailable && (blocking.length === 1 || plainBlk) ? (plainBlk ? priceUnavailable : `Price unavailable: ${priceUnavailable}`) : blocking.length ? fmtMissing(blocking) : hidePrice ? LOCAL_FREE_HEADLINE : demoLine ? '' : priceLine ? priceLine : estSec > 0 && !hideGpu ? `≈ ${fmtSec(estSec)} GPU time${backend === 'mock' ? ' · mock backend runs in ~8s' : ''}` : ''}</span>}
      {quote?.runnable !== false && typeof quote?.localNote === 'string' && quote.localNote.trim() && /^local_(pinned|only)$/.test(String(quote.reasonCode ?? '')) && <p className="helper gb-local-note" data-testid="local-note">{quote.localNote.trim().replace(/\.?$/, '.')}</p> /* B20: why it runs here; quiet, not a warning */}{sizeLine(quote) && !blocking.length && <p className="helper gb-size" data-testid="quote-size">{sizeLine(quote)}</p>}{!sizeLine(quote) && sizeEstLine(quote) && !priceUnavailable && !kg && <p className="helper gb-size gb-size-est" data-testid="quote-size-est" title={sizeEstLine(quote) ?? undefined}>{sizeEstLine(quote)}</p>}
      {(demoLine || quote?.estimated) && <CostNote q={quote} className="gb-demo" />}{!demoLine && !quote?.estimated && quote?.localRun === true && <EtaLine q={quote} className="gb-eta" plain={plain} /> /* step-ETA */}{!demoLine && demoSoon && <p className="helper demo-note gb-demo gb-demo-ph" aria-hidden="true" data-testid="demo-note-slot">&nbsp;</p>}
    </div>
  </div>;
}

/** B19: Use local ComfyUI is off for this route: say how to turn it on (calm, not an error), with a link to the switch in Settings. */
export function LocalOffNote({ q, className = '' }: { q: any; className?: string }) {
  const t = String(q?.reason && q.reason !== 'local_off' ? q.reason : q?.priceLine ?? 'Turn on Your computer in Settings to run this here').trim().replace(/\.?$/, '.');
  const d = typeof q?.reasonDetail === 'string' && q.reasonDetail.trim() ? q.reasonDetail.trim() : null; /* B20: the server's second line, not the first one again */
  return <span className={`helper lo-note ${className}`} role="status" data-testid="local-off-note">{t}{d && <span className="lo-detail" data-testid="local-off-detail"> {d}</span>} <Link to="/settings#use-local" className="lo-link" data-testid="local-off-link">Open Connections</Link></span>;
}
