import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Popover, type PopPlacement } from './Popover';
import { HwUnknownLine } from './FitNote';
import { localFitOf } from './fit';
import { MakerTile } from './MakerTile';
import { useBilling, useAccounts, modeOf, priceToken, priceDetail, fmtUsd } from './billing';
import { splitToken, balanceOf, blockOf, reasonShort, reasonBody, COMFY_CR } from './menuPrice';
import { useRowQuotes, shownCredits, ROW_PENDING, ROW_FAILED, type RowQuote, type PlacePrice, type RowFit } from './quote';
import type { Need } from '../../../server/src/shared/settingsFit';
import { groupOf, livePlace, placesIn, matchesQuery, familiesOf, familyFrom, shownOf, localBlocker, localFirst, featuredLocalFirst, type MenuTab, type Family, type Shown } from './modelMenuSort';
import { familyBlurb } from '../../../server/src/shared/modelRank';
import { LOCAL_LABEL, LOCAL_FREE } from '../../../server/src/shared/modelIds';
import { useToolModels, modelOfEngine, engineForModel, enginesModels, setActiveModel, setRunOn, listPrice, modelStateLine, useRunOn, getRunOn, shownName, toolLike, RUN_ON_CHIP, RUN_ON_BILLING, type ToolModel, type RunOnRow } from './models';
import { CHECK } from './checkGlyph';
import { RunOnMenu, runOnText } from '../ui/routing/RunOn';
import { InfoCardBody } from './ModelHoverCard';
import { ModelPreviewCard } from './ModelPreviewCard';
import { useHoverIntent } from './hoverIntent';
import { SearchIcon, ChevronRightIcon, InfoIcon, LogoMark, StarIcon } from '../ui/Icons';
import { useDefaultModel, setDefaultModel } from './defaultModel';
import { useToast } from './Toast';
import { partText, bestRefPick, AUTO_REF_RULE, type RefFit } from '../../../server/src/shared/refFit';
import './modelMenu.css';
/**
 * THE model picker, "A · Orbit", quiet header (2026-10-24; one component everywhere): Create Image and every image feature, Generate Video,
 * the video tools, Audio, Voice, 3D and the phone sheet.
 *  - Header: the search ("Search N models"; matches names, makers, family lines, capabilities like "edit" or "4k", and "free" for models that
 *    run on your own computer), then one quiet text row with counts: All · Local · Comfy · Your keys. No chips, no maker strip, no sort.
 *  - Order (2026-10-26, same in every menu): tabs All · Local · Comfy · Your keys; free local models first when they can do the job: Featured
 *    leads with one (the featured local model, else the best local one), All models lists local families first (modelMenuSort localFirst).
 *  - Sections: For this workflow (the default) · Featured (the catalogue's featured list) · All models: Auto first (what the workflow would
 *    run: its default when it runs here, else the server's default), then ONE row per family (MODELS[].family) with its line
 *    (shared/modelRank.ts FAMILY_BLURB), "N versions" and "from $0.04" / Free; its chevron (or the right / left arrow) opens its versions in
 *    place. Single-version families are plain rows. Coming soon stays folded. A search is one flat list of matching versions.
 *  - Rows: 40 px maker tile, the name in Space Grotesk, DEFAULT / NEW tags, the short best-for line, a plain "Edits · 14 refs · 4K" line, and
 *    the price of THIS run on the right in mono, in dollars, with the place under it ("Comfy", "fal"); the place's own units ("184 Comfy
 *    credits · on your Creator plan · price checked …") are the hover only. Local rows say FREE · Local. A row that
 *    can't run as set says why in a few words instead ("Needs a photo", "Max 10 s", "No 1080p"; shared/menuPrice.ts), the full reason on hover.
 *  - Selected: a faint orange fill, a 3 px orange bar and the small Orbit mark as the "picked" sign. Orange marks nothing else. A picked
 *    model that can't run as set keeps the mark but loses the orange (grey bar) and shows its reason.
 *  - No duplicates: a model shown in Featured or For this workflow isn't repeated as the same plain row in All models (a family row with
 *    several versions still lists it).
 *  - Footer (the only one): Orbit mark · "Runs on <place>" (or why the pick can't run) · the live balance there ("$8.50 left on Comfy";
 *    its Comfy credits and plan on hover; GET /api/accounts, hidden when unknown) · Change.
 *  - Desktop: hovering or focusing a row opens the preview card beside the menu (shared/ModelPreviewCard.tsx). Phones: the row's "i".
 *  - Keys: up / down move (Popover), Enter picks (or opens a family), right / left open and close a family, Esc closes, / focuses the search.
 *  - ★ Make default (2026-10-27): every row's star makes that model the tool's default, saved on the server (shared/defaultModel.ts), so
 *    other browsers and MCP start on it too. Then "Your default" leads the list and the recommended one (cloud first) is tagged
 *    "Recommended"; "Reset to recommended" (or the filled star) undoes it.
 */
/** One engine the page offers. `off`: a reason this engine can't run here at all (e.g. the local ComfyUI is too old); the row is disabled. */
export interface MenuItem { id: string; name?: string; family?: string; top?: boolean; badge?: string; open?: boolean; off?: string | null; /** extra tooltip parts */ tip?: string; /** the provider (routes), for the footer */ p?: any;
  /** a short capability tag under the name (Create Image: "Edits · up to 4 images" / "Text only") */ tag?: string;
  /** listed last, greyed, with `off` as its status (Create Image: text-only models while a photo is attached) */ last?: boolean }
const sentence1 = (d: unknown) => String(d ?? '').split(/(?<=\.)\s/)[0].replace(/\.$/, '');
/** An open-weights model that runs on your own computer: the subtle "Open weights" tag. */
const openLocal = (m: ToolModel) => m.openWeights === true && m.runsOn.some(r => r.id === 'local');
/** The Default row's preview line: why it's the default, and why it can't run here when it can't. */
export const defaultLine = (why?: string | null, reason?: string | null): string | null => why || reason ? [why ? `Default: ${why}` : 'Default for this workflow', reason ? `Can’t run here: ${reason.replace(/\.$/, '')}` : ''].filter(Boolean).join('. ') : null;

/** The small checkmark other option lists use (Run on, sort, voice lists; shared/checkGlyph.tsx). The model rows use the Orbit mark instead. */
const check = CHECK;
export { CHECK };

type Section = NonNullable<ToolModel['section']>;
const SECTIONS: { id: Section; label: string }[] = [{ id: 'featured', label: 'Featured' }, { id: 'api', label: 'Cloud models' }, { id: 'gpu', label: LOCAL_LABEL }, { id: 'soon', label: 'Coming soon' }];
/** The row's section: the server's models[].section; older servers: the same rule from the catalogue fields. */
export function sectionOf(m: ToolModel): Section {
  if (m.section) return m.section;
  if (m.rowStatus?.kind === 'coming_soon' || m.state === 'coming-soon') return 'soon';
  if (m.featured && m.home !== 'gpu' && m.lifecycle !== 'retiring') return 'featured';
  return m.home === 'gpu' || (!m.home && m.runsOn.every(r => r.id === 'local')) ? 'gpu' : 'api';
}

/** The menu's tabs: every model, or only the models that run in one kind of place. */
export { groupOf, placesIn, type MenuTab };
const TABS: { id: MenuTab; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'gpu', label: LOCAL_LABEL }, { id: 'comfy', label: 'Comfy Cloud' }, { id: 'api', label: 'Your keys' }];
const tabLabel = (t: MenuTab) => TABS.find(x => x.id === t)?.label ?? 'All';
const TAB_LS = 'ohf.modelMenu.tab';
const readTab = (): MenuTab => { try { const v = localStorage.getItem(TAB_LS); return v === 'comfy' || v === 'api' || v === 'gpu' ? v : 'all'; } catch { return 'all'; } };
const saveTab = (t: MenuTab) => { try { localStorage.setItem(TAB_LS, t); } catch { /* storage off: the tab just isn't remembered */ } };

/** The place in a row's price line, short ("BFL", not "Black Forest Labs"). */
const placeShort = (runOn: string | null, text: string) => (runOn === 'local' ? LOCAL_LABEL : (runOn && RUN_ON_CHIP[runOn]) || text).replace(/^Your GPU$/, LOCAL_LABEL);

/** The right column: the price on top (mono, tabular), what it's in under it. `kind` / run-on / test ids as the tests and pages read them. */
function Price({ kind, top, sub, free, est, need, title, runOn, status }: { kind: string; top?: ReactNode; sub?: ReactNode; free?: boolean; est?: boolean; need?: boolean; title?: string; runOn?: string | null; /** a word, not a price */ status?: boolean }) {
  return <span className="orb-pr" data-testid="mp-row-status" data-kind={kind} data-run-on={runOn ?? undefined} title={title}>
    {top != null && <b className={`orb-usd${free ? ' orb-free' : ''}${est ? ' orb-est' : ''}${status ? ' orb-word' : ''}`} data-testid={status ? undefined : 'mp-row-price'}>{top}</b>}
    {sub ? <small className={`orb-cr${need ? ' orb-need' : ''}`}>{sub}</small> : null}</span>;
}
/** A row's right column and the price it shows (null: a word, a sample, a wait). The family row's price is built from these (familyFrom). */
type Right = { node: ReactNode; shown: Shown | null };
const R = (node: ReactNode, shown: Shown | null = null): Right => ({ node, shown }); const FREE: Shown = { usd: 0, free: true };
/** A price token ('≈ $0.08', '≈ $0.42', 'Free') as the two lines: '$0.08' over the place ('Comfy', 'fal'). Dollars only; `detail` (the place's
 *  own units, plan and price date: billing.ts priceDetail) is the hover. */
function tokenPrice(tok: string, place: string, o: { kind: string; title?: string; runOn?: string | null; est?: boolean; detail?: string | null }): Right {
  const { detail, ...po } = o; const shown = shownOf(tok);
  if (/^Free\b/.test(tok)) return R(<Price {...po} top="Free" sub={LOCAL_LABEL} free />, shown);
  const { usd, sub } = splitToken(tok, place);
  return R(<Price {...po} top={usd} sub={sub} title={[o.title ?? (tok.startsWith('≈') ? `${usd}, an estimate.` : null), detail].filter(Boolean).join(' ') || tok} />, shown);
}
/** A row that can't run (as set, or here at all): the reason in a few words, the full sentence on hover. */
const offWords = (s: string | null | undefined) => { const r = reasonShort(s); return r === 'Not for these settings' ? 'Not available' : r; };
/** The page's handler for a row's need action ("Add image" opens the start-image slot); absent = the reason only. */
const NeedAct = createContext<((n: Need) => void) | null>(null);
const NEED_WORDS: Record<NonNullable<Need['action']>, string> = { 'add-image': 'Add image', 'add-end-frame': 'Add images', 'add-video': 'Add video', 'add-audio': 'Add audio' };
function Blocked({ b, runOn }: { b: { short: string; full: string; need?: Need | null }; runOn?: string | null }) {
  const act = useContext(NeedAct); const n = b.need; const word = n?.action ? NEED_WORDS[n.action] : null;
  return <Price kind={n ? 'needs' : 'blocked'} runOn={runOn} top={b.short} status title={b.full}
    sub={act && n && word ? <button type="button" className="orb-need-act" data-testid="mp-need-act" onClick={() => act(n) /* the click goes on to the row: the model is picked, then the slot opens */} onKeyDown={e => e.stopPropagation()}>{word}</button> : undefined} />;
}
/** A status in words ("Add key · BFL", "Download · 17 GB", "Coming soon"): the first part on top, the rest under it. */
function wordStatus(kind: string, text: string, o: { title?: string; runOn?: string | null } = {}) {
  const [a, ...rest] = String(text).split(' · ');
  return <Price kind={kind} top={a} sub={rest.join(' · ') || undefined} status {...o} />;
}

/** The row's price of THIS run (task 7): the live quote for the selected model (the one Generate shows), else the picker's batch quote
 *  (POST /api/models/quotes at the page's current settings and the place that would run it). Same token as Generate (priceToken). */
export function rowPrice(rq: RowQuote | any | null | undefined, own: boolean): { price: string | null; place: string; sample: boolean; title?: string } | null {
  if (!rq || rq.ok === false || (typeof rq.status === 'number' && rq.status >= 400) || rq.runnable === false || !rq.runOn) return null;
  const demo = rq.demo === true; const credits = shownCredits(rq); const local = rq.runOn === 'local' || rq.routeKind === 'local';
  const tok = priceToken({ q: rq, own, demo, free: credits === 0 && local, credits }); if (!tok) return null;
  const place = rq.placeLabel || placeShort(rq.runOn, rq.runOnLabel ?? ''); const placeTok = (p: PlacePrice) => priceToken({ q: p, own, credits: p.credits, free: p.credits === 0 && p.runOn === 'local' });
  const rng = rq.priceRange?.places?.length > 1 ? `At these settings: ${rq.priceRange.places.map((p: PlacePrice) => `${(p as any).placeLabel || placeShort(p.runOn, p.runOnLabel ?? '')} ${placeTok(p) ?? ''}`.trim()).join(' · ')}.` : '';
  const adj = rq.fit?.hint ? `${rq.fit.hint}: picking it sets this.` : rq.adjusted && Object.keys(rq.adjusted).length ? `Priced at ${adjustedWords(rq.adjusted) || 'its own settings'}: what this model runs when you pick it.` : '';
  return { price: demo ? null : (tok === LOCAL_FREE || /^Free · your GPU$/i.test(tok) ? 'Free' : tok), place, sample: demo, title: [rng, adj].filter(Boolean).join(' ') || undefined };
}
/** The settings a row was priced at once picked, in plain words ("1:1, 1K, 2 images"); fields that don't change what it runs are left out. */
const ADJ_WORDS: Record<string, (v: string) => string> = { aspect: v => (v === 'auto' ? 'Auto aspect' : v), imageResolution: v => v, resolution: v => v, quality: v => `${v === 'med' ? 'medium' : v} quality`,
  n: v => `${v} image${v === '1' ? '' : 's'}`, duration: v => `${v} s`, seconds: v => `${v} s`, audio: v => (v === '1' ? 'sound on' : 'sound off') };
export const adjustedWords = (a: Record<string, string | null>): string => Object.entries(a).filter(([k, v]) => v != null && ADJ_WORDS[k]).map(([k, v]) => ADJ_WORDS[k](String(v))).join(', ');
const sampleRow = (runOn?: string | null) => <Price kind="sample" runOn={runOn} top="Sample" sub="Free run" status title="Sample output: free until a key is added." />;
/** A model row's right column: ONE status from the server's rowStatus (MODEL-PICKER-REVIEW §5b.4); a model that runs now shows the price of
 *  this run at the place that would run it (rowPrice), so the row, Run on and Generate say the same thing. */
function modelRight({ m, own, off, rq }: { m: ToolModel; own: boolean; /** true, or the page's reason (item.off) */ off?: boolean | string | null; rq?: RowQuote | any | null }): Right {
  const rs = m.rowStatus;
  if (!rs || (off && rs.kind !== 'coming_soon')) { const why = typeof off === 'string' ? off : rs?.kind === 'unavailable' ? (rs.text !== 'Not available' ? rs.text : null) : null;
    return R(<Price kind="unavailable" top={offWords(why)} status title={why ?? 'Not available here.'} />); }
  if (rs.kind === 'ready' || rs.kind === 'sample') { const rp = rowPrice(rq, own);
    if (rp?.sample) return R(sampleRow(rq.runOn));
    if (rp?.price) return tokenPrice(rp.price, rp.place, { kind: 'ready', runOn: rq.runOn, title: rp.title, detail: priceDetail(rq, { credits: shownCredits(rq) }) });
    const b = blockOf(rq); if (b) return R(<Blocked b={b} runOn={rq.runOn} />); } // this job can't run on this model as set (e.g. needs a photo): why, in a few words
  if (rs.kind === 'ready' && (rq?.pending || rq?.failed)) return R(<RowWait failed={!!rq.failed} place={placeShort(rs.runOn, rs.text)} />);
  if (rs.kind === 'ready') { const price = listPrice(rs.credits, rs.runOn, own); // no batch answer (older server)
    return price ? tokenPrice(price, placeShort(rs.runOn, rs.text), { kind: 'ready', detail: priceDetail(null, { credits: rs.credits, runOn: rs.runOn }) }) : R(<Price kind="ready" top={placeShort(rs.runOn, rs.text)} status />); }
  if (rs.kind === 'sample') return R(sampleRow(rs.runOn));
  /* a row that needs a key still says what this run would cost there (the quote's setupOptions): "$0.01 · Needs fal key" */
  const so: any = (rs.kind === 'add_key' || rs.kind === 'set_up') && Array.isArray(rq?.setupOptions) ? rq.setupOptions.find((o: any) => o?.action === 'add_key' && typeof o.credits === 'number' && o.credits > 0) : null;
  const soPrice = so ? listPrice(so.credits, so.runOn, own) : null;
  if (so && soPrice) return R(<NeedsKey price={soPrice} place={placeShort(so.runOn, so.runOnLabel ?? '')} kind={rs.kind} title={`${so.actionText ?? rs.text}. An estimate for this run once the key is added.`} />, shownOf(soPrice));
  return R(wordStatus(rs.kind, rs.kind === 'download' ? String(rs.text).replace(/^Download\b/, 'Download') : rs.text));
}
/** This run's price is loading (or the batch call failed): a quiet placeholder, never a price for other settings. */
function RowWait({ failed, place, runOn }: { failed: boolean; place: string; runOn?: string }) {
  return <span className="orb-pr" data-testid="mp-row-status" data-kind={failed ? 'unknown' : 'loading'} data-run-on={runOn} aria-busy={!failed || undefined}
    title={failed ? 'Couldn’t get this run’s price. It shows on Generate once you pick it.' : undefined}>
    {failed ? <b className="orb-usd orb-word">Price unknown</b> : <span className="orb-wait" aria-label="Loading price" />}{place && <small className="orb-cr">{place}</small>}</span>;
}
/** A place that needs a key: its price once the key is added, dimmed, then the key ("$0.01" over "Needs fal key"). */
function NeedsKey({ price, place, kind = 'add_key', title, runOn }: { price: string; place: string; kind?: string; title?: string; runOn?: string }) {
  const usd = price.replace(COMFY_CR, '').replace(/^≈\s*/, '');
  return <span className="orb-pr" data-testid="mp-row-status" data-kind={kind} data-setup-price="1" data-run-on={runOn} title={title}><b data-testid="mp-row-price" className="orb-usd orb-est">{usd}</b><small className="orb-cr orb-need">Needs {place} key</small></span>;
}
/** A row's right column inside a place tab (Local · Comfy · Your keys): what THIS place charges for this run, or what it still needs.
 *  Local: Free when it runs now, else its blocker over "Free once ready" ("Download 43 GB", "Needs 43 GB space", "Turn on"; modelMenuSort localBlocker). Comfy / Your keys: the batch quote for that place (same token as Generate),
 *  Sample for a sample run, the price over "Needs fal key" when a key is missing; the place's list price until the quote answers. */
function placeRight({ p, own, off, rq, many }: { p: RunOnRow; own: boolean; /** true, or the page's reason (item.off) */ off?: boolean | string | null; rq?: RowQuote | any | null; /** the tab has several places: name it */ many?: boolean }): Right {
  const short = placeShort(p.id, p.label); void many;
  if (off) { const why = typeof off === 'string' ? off : p.reason ?? null; return R(<Price kind="unavailable" runOn={p.id} top={offWords(why)} status title={why ?? 'Not available here.'} />); }
  if (p.id === 'local') { const b = localBlocker(p); // Free only when it runs now; else the blocker, and no price (the family isn't Free on it)
    if (!b) return R(<Price kind="ready" runOn="local" top="Free" sub={LOCAL_LABEL} free />, FREE);
    return R(<Price kind={p.action?.kind ?? p.reasonCode ?? p.status} runOn="local" top={b.word} status sub={b.sub} title={p.reason ?? undefined} />); }
  const mine = rq && (!rq.runOn || rq.runOn === p.id) ? rq : null;
  const keyPrice = (c: number | null | undefined) => listPrice(c, p.id, own);
  if (mine?.demo === true || (!mine && p.status === 'sample')) return R(sampleRow(p.id));
  if (mine?.needsKey === true || (!mine && p.status === 'needs-key')) { const price = keyPrice(typeof mine?.credits === 'number' && mine.credits > 0 ? mine.credits : p.credits);
    return price ? R(<NeedsKey price={price} place={short} runOn={p.id} title={`${p.action?.text ?? 'Add a key'}. An estimate for this run once the key is added.`} />, shownOf(price))
      : R(<Price kind="add_key" runOn={p.id} top="Add key" sub={short} status need />); }
  const rp = mine ? rowPrice(mine, own) : null;
  if (rp?.price) return tokenPrice(rp.price, short, { kind: 'ready', runOn: p.id, title: rp.title, detail: priceDetail(mine, { credits: shownCredits(mine) }) });
  const b = mine ? blockOf(mine) : null; if (b) return R(<Blocked b={b} runOn={p.id} />);
  if (rq?.pending || rq?.failed) return R(<RowWait failed={!!rq.failed} place={short} runOn={p.id} />);
  const lp = keyPrice(p.credits); // no quote (older server): the place's list price
  return lp ? tokenPrice(lp, short, { kind: p.status, runOn: p.id, est: true, detail: priceDetail(null, { credits: p.credits, runOn: p.id }) }) : R(<Price kind={p.status} runOn={p.id} top={short} status />);
}
/** A family row's price (familyFrom over its version rows' rightOf): "Free" over Local when a version row says Free, else "from $0.04" (the cheapest a version row shows). */
function FamPrice({ p, wait }: { p: { free: boolean; usd: number | null }; wait: boolean }) {
  if (p.free) return <span className="orb-pr" data-testid="mp-row-status" data-kind="from"><b data-testid="mp-fam-price" className="orb-usd orb-free">Free</b><small className="orb-cr">{LOCAL_LABEL}</small></span>;
  if (p.usd != null) return <span className="orb-pr" data-testid="mp-row-status" data-kind="from" title="The cheapest version for this run"><b data-testid="mp-fam-price" className="orb-usd">from {fmtUsd(p.usd)}</b></span>;
  return wait ? <RowWait failed={false} place="" /> : <span className="orb-pr" data-testid="mp-row-status" data-kind="unknown" />;
}
/** The plain capability line under the description: "Edits · 14 refs · 4K", "1080p · 4–15 s · Sound", "Open weights". */
function CapLine({ m, it, rate }: { m: ToolModel; it?: MenuItem; /** the published per-unit rate, when the page asks for it (Audio: "$0.10/1k chars") */ rate?: string | null }) {
  const c: any = m.caps ?? {}; const parts: { t: string; id?: string }[] = [];
  if (it?.tag && !it.last) parts.push({ t: it.tag, id: 'mp-tag' });
  else if (m.medium === 'image' && (c.edit != null || c.maxRefs != null)) {
    if (c.edit) parts.push({ t: 'Edits' }); if (c.maxRefs > 1) parts.push({ t: `${c.maxRefs} refs` }); if (c.mask) parts.push({ t: 'Mask' }); }
  if (m.medium === 'image' && c.maxResolution && !parts.some(p => p.t.includes(String(c.maxResolution)))) parts.push({ t: String(c.maxResolution) });
  if (m.medium !== 'image' && c.summary) for (const x of String(c.summary).split(' · ').filter(Boolean)) parts.push({ t: x, id: m.medium === 'video' ? 'mp-caps' : undefined });
  if (openLocal(m)) parts.push({ t: 'Open weights', id: 'mp-open-local' });
  if (rate) parts.push({ t: rate, id: 'mp-rate' });
  if (!parts.length) return null;
  return <span className={`orb-g${/^Text only/.test(it?.tag ?? '') ? ' orb-g-t' : ''}`}>{parts.map((p, i) => <span key={i} data-testid={p.id}>{p.t}</span>)}</span>;
}

/** Reference-aware picker (2026-10-31, shared/refFit.ts): what this row does with the files on the bar, in a few calm words: each part,
 *  used ones with a tick ("Uses your 3 pictures", "Start frame"), skipped ones with a small slashed circle ("Skips your video", "No start
 *  frame"). No green and no orange: a neutral tick, the skipped words a step dimmer. */
const RF_OK = <svg className="orb-rf-i" width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const RF_NO = <svg className="orb-rf-i" width="12" height="12" viewBox="0 0 12 12" aria-hidden><circle cx="6" cy="6" r="4.3" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M3 9l6-6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>;
function RefNote({ f }: { f: RefFit }) {
  const all = f.parts.map(partText).join(' · ');
  return <span className="orb-rf" data-testid="mp-ref-fit" data-all={f.all ? '1' : undefined} title={all}>{f.parts.map((x, i) =>
    <span key={i} className={`orb-rf-p${x.used < x.have ? ' skip' : ''}`}>{x.used ? RF_OK : RF_NO}{partText(x)}</span>)}</span>;
}

/** The live balance at the place that runs the pick: shared/menuPrice.ts ("$8.50 left on Comfy"; units and plan on hover). */
export { balanceOf };

export function ModelMenu({ open, anchor, avoid, watch, gap, onClose, items, value, onPick, placement = 'right', testId = 'model-menu', rowTestId, toolId, modelHint, quote, supports, lastLabel, defaultId, defaultWhy, defaultReason, onReset, rateOf, onNeed, refFit }: {
  open: boolean; anchor: RefObject<HTMLElement | null>; avoid?: RefObject<HTMLElement | null>; /** re-place when it resizes (Popover watch) */ watch?: RefObject<HTMLElement | null>; gap?: number; onClose: () => void; items: MenuItem[]; value: string;
  /** fit: what picking this model changes (the batch row's shared/settingsFit.ts answer); the page applies its values and shows its note. */ onPick: (id: string, fit?: RowFit | null) => void;
  /** A row that needs an input no setting can give (a start image): the page opens that slot. Absent = the reason only. */ onNeed?: (n: Need) => void;
  placement?: PopPlacement; testId?: string; /** data-testid per row, e.g. id => `vs-model-${id}` */ rowTestId?: (id: string) => string;
  /** The tool whose models[] (GET /api/tools) give one row per model. */ toolId: string;
  /** The model the page runs when its engine builds several (Camera: the move's model name or key). */ modelHint?: string | null;
  /** The live quote, for the footer's "Runs on <place>". */ quote?: any;
  /** Shown between the list and the footer (the workflow credit, a download note). */ supports?: ReactNode;
  /** The header over the greyed rows listed last (default: Create Image's text-only models while a photo is attached). A workflow names why they can't run it. */ lastLabel?: string;
  /** Per-workflow defaults (shared/workflowDefaults.ts): the engine marked "Default" (the For this workflow row, and what Auto picks when it runs here),
   *  its one-line why for the preview card, and why it can't run here when it can't. */ defaultId?: string | null; defaultWhy?: string | null; defaultReason?: string | null;
  /** Set while the user's own pick is selected: Auto (and "Reset") goes back to the workflow's default. */ onReset?: (() => void) | null;
  /** A model's published per-unit rate ("$0.10/1k chars", "$0.005/s"), shown in its capability line. Pages that price per unit pass it
   *  (Audio, 2026-10-27); others leave it out and nothing changes. */ rateOf?: (m: ToolModel) => string | null;
  /** Reference-aware rows (Generate Video, 2026-10-31): what each engine would use of the files on the bar (shared/refFit.ts); null when
   *  nothing is attached. The list is then two sections, "Works with your files" and "Skips some of your files", and Auto picks the best
   *  model that works with them all (bestRefPick). */ refFit?: ((engine: string) => RefFit | null) | null;
}) {
  const [q, setQ] = useState(''); const [roOpen, setRoOpen] = useState(false); const [soonOpen, setSoonOpen] = useState(false); const roRef = useRef<HTMLButtonElement>(null); const qRef = useRef<HTMLInputElement>(null);
  const [fam, setFam] = useState<string | null>(null); // the family whose versions are open (one at a time)
  /* the preview card (desktop: hover or keyboard focus shows it beside the menu; phones: the row's "i" opens the details inside the sheet).
   * Hover intent (shared/hoverIntent.ts, same rule as the Models page card): the pointer can travel from the row onto the card and use its
   * links; Tab from a row goes into its card, Tab past the card's last link on to the next row, Esc in the card back to the row. */
  const hi = useHoverIntent<string>({ open: 120, next: el => { const os = [...(listRef.current?.querySelectorAll<HTMLElement>('[role=option][tabindex="0"]') ?? [])]; return os[os.indexOf(el) + 1]; } });
  const hov = hi.cur ? { key: hi.cur.t, el: hi.cur.el } : null; const setHov = (_: null) => hi.hide(); const [info, setInfo] = useState<string | null>(null);
  const hoverOn = (key: string, el: HTMLElement, now = false) => hi.enter(key, el, now);
  const hoverOff = (e?: React.MouseEvent) => hi.leave(e);
  useEffect(() => { if (!open) { setQ(''); setRoOpen(false); setSoonOpen(false); setHov(null); setInfo(null); setFam(null); } }, [open]);
  const is3d = /^three-d/.test(toolId); // 3D models: the cube glyph when the maker has no logo (their medium is 'video' in the registry)
  const shownMedium = (m: ToolModel) => (is3d ? '3d' : m.medium);
  const models = useToolModels(toolId); const bill = useBilling(); const own = modeOf(bill, quote) !== 'team'; const acc = useAccounts();
  const listed = items.map(x => x.id);
  // one row per model (MODEL-ROUTE-SPEC §2.2): the models one of this page's engines builds, in the server's order (section, rank)
  const ms = models.filter(m => m.engines.some(e => listed.includes(e)));
  const isDef = (m: ToolModel) => !!defaultId && m.engines.includes(defaultId);
  const toast = useToast(); const { favourite, recommended } = useDefaultModel(toolId);
  const isFav = (m: ToolModel) => !!favourite && m.engines.includes(favourite);
  /** the recommended row: the page's workflow default, else the tool's recommended default (what it starts on without your pick) */
  const isRec = (m: ToolModel) => (defaultId ? isDef(m) : !!recommended && m.engines.includes(recommended) && !!favourite);
  const makeDefault = (m: ToolModel, id: string) => { const on = isFav(m);
    void setDefaultModel(toolId, on ? null : id).then(() => toast(on ? 'Back to the recommended default' : `${shownName(m)} is now your default here`, 'success'))
      .catch((e: any) => toast(`Couldn’t save your default: ${e?.message || 'try again'}`, 'error')); };
  const defModel = defaultId ? ms.find(isDef) ?? null : null;
  const curModel = modelOfEngine(toolId, value, modelHint); const pick = useRunOn(toolId, curModel?.key);
  // the quiet row: All · Local · Comfy · Your keys (a place with no model is left out; the row only shows when a place narrows the list)
  const [tabPick, setTabPick] = useState<MenuTab>(readTab); const listRef = useRef<HTMLDivElement>(null); const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) setTabPick(readTab()); }, [open]); // another menu may have changed the remembered tab
  const counts = { all: ms.length, comfy: 0, api: 0, gpu: 0 } as Record<MenuTab, number>;
  for (const m of ms) for (const g of ['comfy', 'api', 'gpu'] as const) if (placesIn(m, g).length) counts[g]++;
  const tabs = TABS.filter(x => x.id === 'all' || counts[x.id] > 0);
  const showTabs = tabs.length > 2 || (tabs.length === 2 && counts[tabs[1].id] < ms.length);
  const tab: MenuTab = showTabs && tabs.some(x => x.id === tabPick) ? tabPick : 'all';
  const goTab = (t: MenuTab, focus = false) => { setTabPick(t); saveTab(t); setHov(null); setFam(null); if (listRef.current) listRef.current.scrollTop = 0;
    if (focus) requestAnimationFrame(() => tabsRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${t}"]`)?.focus()); };
  const tabKeys = (e: React.KeyboardEvent) => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault();
    const i = tabs.findIndex(x => x.id === tab); goTab(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].id, true); };
  /** The place a row stands for in a place tab: the model's saved choice when it's in this tab, else the first ready, else the first. */
  const placeFor = (m: ToolModel): RunOnRow | null => { const ps = placesIn(m, tab); if (!ps.length) return null; const saved = getRunOn(toolId, m.key).runOn;
    return ps.find(r => r.id === saved) ?? ps.find(r => r.status === 'ready') ?? ps.find(r => r.status === 'sample') ?? ps[0]; };
  const famLine = (m: ToolModel) => familyBlurb(m.family, m.medium);
  const inTab = ms.filter(m => tab === 'all' || placesIn(m, tab).length > 0);
  const ql = q.trim().toLowerCase(); const all = inTab.filter(m => !ql || matchesQuery(m, ql, famLine(m)));
  const itemOf = (m: ToolModel) => items.find(x => x.id === engineForModel(m, value, listed)) ?? items.find(x => m.engines.includes(x.id));
  const isLast = (m: ToolModel) => !!itemOf(m)?.last;
  const fitOf = (m: ToolModel): RefFit | null => (refFit ? refFit(itemOf(m)?.id ?? m.primaryEngine) : null);
  const refsOn = !!refFit && ms.some(m => !!fitOf(m));
  /** Disabled: the server says it can't run (Coming soon, Not available), or the page's engine can't run here (item.off, e.g. ComfyUI too old). */
  const offOf = (m: ToolModel) => modelStateLine(m).off || !!itemOf(m)?.off;
  const pinDef = !ql && !!defModel && all.includes(defModel) && !isLast(defModel) && sectionOf(defModel) !== 'soon';
  // task 7: every row that runs now is priced for THIS run (the page's current settings) at the place that would run it (its saved choice,
  // as the page sends it, else the server's pick), in one batch call while the picker is open (a place tab prices each row at that tab's
  // place; Local needs no quote: it is free)
  const asks = tab === 'gpu' ? [] : tab !== 'all' ? inTab.filter(m => !offOf(m)).map(m => ({ model: m.key, runOn: placeFor(m)?.id ?? null }))
    : ms.filter(m => !offOf(m) && ['ready', 'sample', 'add_key', 'set_up'].includes(String(m.rowStatus?.kind))).map(m => { const ro = getRunOn(toolId, m.key).runOn; return { model: m.key, runOn: ro && ro !== 'auto' ? ro : null }; }); // key-needing rows too: their price once a key is added
  const { quotes: rqs, state: rqState } = useRowQuotes(toolId, open, asks); const asked = new Set(asks.map(a => a.model));
  const liveQ = (m: ToolModel) => { const at = tab === 'all' ? null : placeFor(m)?.id ?? null;
    return curModel?.key === m.key && quote && (!quote.modelKey || quote.modelKey === m.key) && (quote.runOn || quote.demo) && (!at || quote.runOn === at) ? quote : rqs?.[m.key] ?? (asked.has(m.key) && rqState === 'pending' ? ROW_PENDING : asked.has(m.key) && rqState === 'failed' ? ROW_FAILED : null); };
  const choose = (m: ToolModel) => { if (offOf(m)) return;
    // picked in a place tab: it runs there (saved like Run on's own choice), when the model has other places too
    const p = tab === 'all' ? null : placeFor(m);
    if (p && m.runsOn.filter(livePlace).length > 1 && getRunOn(toolId, m.key).runOn !== p.id) void setRunOn(toolId, m.key, p.id).catch(() => undefined);
    // an engine that builds several models here (Camera: comfy-open) → prefer an engine only this model uses, so the pick really changes the model
    const shared = value && m.engines.includes(value) && enginesModels(toolId, value).length > 1 && curModel?.key !== m.key;
    const e = shared ? (m.engines.find(x => listed.includes(x) && enginesModels(toolId, x).length === 1) ?? engineForModel(m, null, listed)) : engineForModel(m, value, listed);
    const fit = curModel?.key !== m.key ? rqs?.[m.key]?.fit ?? null : null; // the settings this row was priced at: the page switches to them
    setActiveModel(toolId, enginesModels(toolId, e).length > 1 ? m.key : null); onPick(e, fit); onClose(); };
  /* Auto: the workflow's default when it runs here, else what the server's default rule (routing/defaults.ts → tool.defaultProvider) starts on */
  const tl: any = toolLike(toolId);
  const autoEngine = [defaultId && !defaultReason ? defaultId : null, tl?.defaultProvider, defaultId].find((x): x is string => !!x && listed.includes(x)) ?? null;
  const usualAuto = autoEngine ? ms.find(m => m.engines.includes(autoEngine) && !offOf(m) && !isLast(m)) ?? null : null;
  /* with references on the bar: the usual pick when it uses them all, else the first model (server order: featured, then rank) that does,
   * else the one that uses the most (shared/refFit.ts bestRefPick) */
  /** works with all your files AND can run this job as set (a place that refuses it, e.g. a local graph with fewer slots, isn't "works with") */
  const worksWith = (m: ToolModel) => !!fitOf(m)?.all && !blockOf(liveQ(m));
  const autoModel = refsOn ? bestRefPick(ms.filter(m => !offOf(m) && !isLast(m) && sectionOf(m) !== 'soon'), m => { const f = fitOf(m); return f && f.all && !worksWith(m) ? { ...f, all: false } : f; }, usualAuto) : usualAuto;
  const autoFit = autoModel ? fitOf(autoModel) : null;
  const autoShown = !ql && !!autoModel && all.includes(autoModel);
  const autoOn = autoShown && curModel?.key === autoModel!.key && !onReset;
  /** A row's right column (its price at the place this tab shows, or what it needs), the ONE answer the row and its family row both read. */
  const rightOf = (m: ToolModel): Right => { const it = itemOf(m); const p = tab !== 'all' ? placeFor(m) : null;
    return it?.last ? R(<Price kind="text-only" top={it.off ?? 'Not for this'} status />)
      : p ? placeRight({ p, own, off: it?.off || offOf(m), rq: liveQ(m), many: tab === 'api' }) : modelRight({ m, own, off: it?.off || null, rq: liveQ(m) }); };
  const pickAuto = () => { if (onReset) { onReset(); onClose(); } else if (autoModel) choose(autoModel); };
  const focusFam = (f: string) => requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-family="${CSS.escape(f)}"]`)?.focus());
  const mrow = (m: ToolModel, parent?: string) => { const on = curModel?.key === m.key && !autoOn; const st = modelStateLine(m); const it = itemOf(m); const id = it?.id ?? m.primaryEngine; const off = offOf(m);
    const retiring = m.lifecycle === 'retiring'; const blk = off || !!it?.last || !!blockOf(liveQ(m)); // can't run as set: no orange, the reason shows
    const rf = off ? null : fitOf(m); /* what it does with the references on the bar */
    return <div key={m.key} role="option" aria-selected={on} aria-disabled={off || undefined} data-status={it?.off ? 'off' : st.k} data-model-key={m.key} data-section={sectionOf(m)} tabIndex={0} data-model={id} data-testid={rowTestId?.(id)}
      data-blocked={blk || undefined} data-ref-all={rf ? (rf.all ? '1' : '0') : undefined} className={`orb-row${parent ? ' orb-ver' : ''}${on ? ' on' : ''}${on && blk ? ' blk' : ''}${off ? ' dis' : ''}`} onClick={() => choose(m)}
      onKeyDown={e => { hi.rowKeyDown(e); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(m); } else if (e.key === 'ArrowLeft' && parent) { e.preventDefault(); setFam(null); focusFam(parent); } }}
      aria-describedby={hov?.key === m.key ? 'mpv-card' : undefined} onMouseEnter={e => hoverOn(m.key, e.currentTarget)} onMouseLeave={hoverOff}
      onFocus={e => { if (e.target === e.currentTarget) hoverOn(m.key, e.currentTarget, true); }} onBlur={e => { if (e.target === e.currentTarget) hoverOff(); }}>
      <MakerTile className="orb-tile" maker={m.maker} makerName={m.makerName} fallback={m.family || m.name} medium={shownMedium(m)} title={false} />
      <span className="orb-t">
        <span className="orb-n"><span className="orb-name">{shownName(m)}</span>{isFav(m) ? <em className="orb-tag orb-tag-y" data-testid="mp-your-default" title="You made this the default here. The filled star resets it.">Your default</em>
          : isRec(m) || isDef(m) ? <em className={`orb-tag ${favourite ? 'orb-tag-rec' : 'orb-tag-d'}`} data-testid="mp-default" title={defaultLine(defaultWhy, defaultReason) ?? undefined}>{favourite ? 'Recommended' : 'Default'}</em> : null}{m.isNew && !retiring && <em className="orb-tag orb-tag-n" data-testid="mp-new">New</em>}{retiring && <em className="orb-tag orb-tag-r" data-testid="lifecycle-pill">Retiring</em>}
          {!off && sectionOf(m) !== 'soon' && !it?.last && <button type="button" className={`orb-star${isFav(m) ? ' on' : ''}`} data-testid="mp-make-default" aria-pressed={isFav(m)}
        aria-label={isFav(m) ? `${shownName(m)} is your default. Reset to recommended` : `Make ${shownName(m)} your default`} title={isFav(m) ? 'Your default · click to reset to recommended' : 'Make default'}
        onClick={e => { e.stopPropagation(); makeDefault(m, id); }} onKeyDown={e => e.stopPropagation()}><StarIcon size={14} /></button>}</span>
        <span className="orb-d" data-testid="mp-desc">{m.bestFor ?? sentence1(m.blurb)}</span>
        {rf ? <RefNote f={rf} /> : <CapLine m={m} it={it} rate={!off ? rateOf?.(m) : null} />}
      </span>
      {rightOf(m).node}
      {on && <span className="orb-pick" aria-hidden data-testid="mp-picked"><LogoMark size={16} /></span>}
      <button type="button" className={`orb-i${info === m.key ? ' on' : ''}`} data-testid="mp-row-info" aria-label={`About ${shownName(m)}`} aria-expanded={info === m.key}
        onClick={e => { e.stopPropagation(); setInfo(i => (i === m.key ? null : m.key)); }} onKeyDown={e => e.stopPropagation()}><InfoIcon size={16} /></button>
    </div>; };
  /** The preview's extra line: why it's the default, and why this run can't go on it as set (too many images, a mask). */
  const noteOf = (m: ToolModel) => { const rq = liveQ(m); const b = rq && !rq.priceRange?.places?.length ? blockOf(rq) : null; const it = itemOf(m);
    const why = b ? `Can’t run as set: ${reasonBody(b.full).replace(/^Not for these settings\.?\s*/, '') || 'try other settings.'}` : typeof it?.off === 'string' && it.off ? `Can’t run here: ${it.off}` : null;
    return [isDef(m) ? defaultLine(defaultWhy, defaultReason) : null, why].filter(Boolean).join(' ') || null; };
  const row = (m: ToolModel, parent?: string) => info === m.key ? [mrow(m, parent), <div key={`${m.key}-info`} className="mhc mhc-inline" data-testid="model-info-card" data-model-key={m.key}><InfoCardBody m={{ ...m, medium: shownMedium(m) }} own={own} rq={liveQ(m)} note={noteOf(m)} /></div>] : mrow(m, parent);
  /** A family with several versions: one row (logo, name, versions, its line, "from $0.04" or Free) whose › opens the versions in place. */
  const famRow = (f: Family<ToolModel>) => { const openF = fam === f.family; const picked = f.models.find(m => curModel?.key === m.key && !autoOn) ?? null;
    const lead = picked ?? f.models[0]; const fp = familyFrom(f.models.map(m => rightOf(m).shown));
    const wait = f.models.some(m => asked.has(m.key)) && rqState === 'pending'; const line = famLine(lead) ?? lead.bestFor ?? sentence1(lead.blurb);
    const toggle = (to = !openF) => { setFam(to ? f.family : null); setHov(null); };
    return [<div key={`fam:${f.family}`} role="option" aria-selected={false} aria-expanded={openF} data-family={f.family} data-testid="mp-family" data-count={f.models.length} tabIndex={0}
      className={`orb-row orb-fam${openF ? ' open' : ''}${picked ? ' has-pick' : ''}`} onClick={() => toggle()}
      onKeyDown={e => { hi.rowKeyDown(e); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } else if (e.key === 'ArrowRight' && !openF) { e.preventDefault(); toggle(true); } else if (e.key === 'ArrowLeft' && openF) { e.preventDefault(); toggle(false); } }}
      onMouseEnter={e => hoverOn(lead.key, e.currentTarget)} onMouseLeave={hoverOff} onFocus={e => { if (e.target === e.currentTarget) hoverOn(lead.key, e.currentTarget, true); }} onBlur={e => { if (e.target === e.currentTarget) hoverOff(); }}>
      <MakerTile className="orb-tile" maker={lead.maker} makerName={lead.makerName} fallback={f.family} medium={shownMedium(lead)} title={false} />
      <span className="orb-t">
        <span className="orb-n"><span className="orb-name">{f.family}</span>{f.models.some(m => m.isNew && m.lifecycle !== 'retiring') && <em className="orb-tag orb-tag-n">New</em>}</span>
        <span className="orb-d">{line}</span>
        <span className="orb-g"><span data-testid="mp-family-count">{f.models.length} versions</span>{picked && <span className="orb-g-pick">{shownName(picked)} picked</span>}</span>
      </span>
      {fp.free || fp.usd != null || wait ? <FamPrice p={fp} wait={wait} /> : rightOf(lead).node /* no version shows a price (all need a download, space, a switch…): what the first one needs */}
      <ChevronRightIcon size={16} className="orb-fam-chev" aria-hidden />
      {picked && <span className="orb-pick" aria-hidden data-testid="mp-picked-in"><LogoMark size={16} /></span>}
    </div>, openF ? <div key={`fam:${f.family}:v`} className="orb-vers" role="group" aria-label={`${f.family} versions`} data-testid="mp-family-versions">{f.models.flatMap(m => row(m, f.family))}</div> : null]; };
  const autoRow = () => { const m = autoModel!; return <div key="auto" role="option" aria-selected={autoOn} tabIndex={0} data-testid="mp-auto" data-model-key={m.key} className={`orb-row orb-auto${autoOn ? ' on' : ''}`}
    onClick={pickAuto} onKeyDown={e => { hi.rowKeyDown(e); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickAuto(); } }}
    onMouseEnter={e => hoverOn(m.key, e.currentTarget)} onMouseLeave={hoverOff} onFocus={e => { if (e.target === e.currentTarget) hoverOn(m.key, e.currentTarget, true); }} onBlur={e => { if (e.target === e.currentTarget) hoverOff(); }}>
    <span className="orb-auto-tile" aria-hidden><LogoMark size={20} /></span>
    <span className="orb-t"><span className="orb-n"><span className="orb-name">Auto</span></span>
      <span className="orb-d" data-testid="mp-auto-line" title={autoFit ? AUTO_REF_RULE : undefined}>Picks <b>{shownName(m)}</b>{autoFit ? (autoFit.all ? ' · works with your files' : ' · uses the most of your files') : ' for this'}</span>
      {autoFit && !autoFit.all ? <RefNote f={autoFit} /> : null}</span>
    {rightOf(m).node}
    {autoOn && <span className="orb-pick" aria-hidden data-testid="mp-picked"><LogoMark size={16} /></span>}
  </div>; };
  const hm = hov ? ms.find(m => m.key === hov.key) : null;
  /** the preview card's 'This run' line: the row's own price (rowPrice) and its detail (units, plan, price date) */
  const runOf = (m: ToolModel) => { const q = liveQ(m); const rp = rowPrice(q, own); return rp?.price ? { price: rp.price, place: rp.place, detail: priceDetail(q, { credits: shownCredits(q) }) } : null; };
  const t = curModel ? runOnText(curModel, pick.runOn, quote) : null; const curItem = curModel ? itemOf(curModel) : undefined;
  const bal = balanceOf(acc?.accounts, t?.place ?? null);
  /* the pick can't run as set (or here): the footer says why in a few words, the full reason on hover */
  const curBlk = curModel ? (() => { const b = blockOf(liveQ(curModel)); if (b) return b; const o = curItem?.off; return typeof o === 'string' && o ? { short: offWords(o), full: o } : null; })() : null;
  const sec = (label: string, right?: ReactNode, testId?: string) => <div className="orb-sec" data-testid={testId}><span className="orb-lbl">{label}</span>{right}</div>;
  const resetBtn = onReset && defModel ? <button type="button" className="orb-lbl orb-reset" data-testid="mp-reset" title={`Reset to the default: ${shownName(defModel)}`} onClick={() => { onReset(); onClose(); }}>Reset</button> : null;
  const keys = (e: React.KeyboardEvent) => { if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return; const tg = e.target as HTMLElement; if (tg.matches('input,textarea,select,[contenteditable=true]')) return; e.preventDefault(); qRef.current?.focus(); qRef.current?.select(); };
  const tall = ms.length > 4;
  // the list: For this workflow · Featured · All models (Auto, then one row per family) · Coming soon; a search is one flat list of versions
  // free local models first when they can do the job (2026-10-26, every menu): Featured leads with one, All models lists them first
  // (All and Local only: a Comfy or Your keys tab is about that place, so it keeps the server's order)
  const lf = tab === 'all' || tab === 'gpu'; const main0 = all.filter(m => !isLast(m) && sectionOf(m) !== 'soon');
  const autoFirst = (l: ToolModel[]) => (autoModel && l.includes(autoModel) ? [autoModel, ...l.filter(m => m !== autoModel)] : l); // Auto's pick first among equals
  const main = lf ? localFirst(autoFirst(main0)) : main0;
  const feat0 = main0.filter(m => sectionOf(m) === 'featured' && !(pinDef && m === defModel)); // the catalogue's order: a featured cloud model stays highlighted
  const pool = main.filter(m => !offOf(m) && !(pinDef && m === defModel));
  const featured = lf ? featuredLocalFirst(feat0, pool, pinDef ? defModel : null) : feat0;
  const soon = all.filter(m => !isLast(m) && sectionOf(m) === 'soon');
  // no duplicate rows (2026-10-26): a model already shown above (Featured, For this workflow) isn't listed again as the same plain row in
  // All models; a family with several versions keeps its row (it opens the versions, a different thing)
  const favModel = favourite ? main.find(isFav) ?? null : null; // the user's own default, when this menu lists it
  const resetFav = favModel ? <button type="button" className="orb-lbl orb-reset" data-testid="mp-reset-recommended" title={recommended ? 'Start on the recommended model again' : undefined}
    onClick={() => makeDefault(favModel, favModel.primaryEngine)}>Reset to recommended</button> : null;
  const shownAbove = new Set([...featured.map(m => m.key), ...(pinDef && defModel ? [defModel.key] : []), ...(favModel ? [favModel.key] : [])]);
  const allRows = familiesOf(main).flatMap(f => f.models.length > 1 ? famRow(f) : shownAbove.has(f.models[0].key) ? [] : [row(f.models[0])]);
  const grp = (id: string, label: string, body: ReactNode, right?: ReactNode) => <div key={id} className="orb-grp" role="group" aria-label={label} data-testid={`mp-section-${id}`}>{sec(label, right)}{body}</div>;
  return <Popover open={open} anchor={anchor} avoid={avoid} watch={watch} gap={gap} placement={placement} onClose={onClose} label="Model" role="listbox" className="apop-orbit" testId={testId}><NeedAct.Provider value={onNeed ? (n: Need) => { onClose(); onNeed(n); } : null}>
    <div className={`orb${tall ? ' orb-tall' : ''}${showTabs ? ' orb-tabs' : ''}`} onKeyDown={keys}>
    <div className="orb-top">
      <label className="orb-search"><SearchIcon size={16} /><input ref={qRef} className="orb-q" type="search" placeholder={`Search ${ms.length} model${ms.length === 1 ? '' : 's'}`} aria-label="Search models" value={q} onChange={e => { setQ(e.target.value); setHov(null); }} autoFocus data-testid="mp-search" /></label>
      {showTabs && <div ref={tabsRef} className="orb-seg" role="tablist" aria-label="Where it runs" data-testid="mp-tabs" onKeyDown={tabKeys}>
        {tabs.map(x => <button key={x.id} type="button" role="tab" data-tab={x.id} aria-selected={tab === x.id} tabIndex={tab === x.id ? 0 : -1} className={tab === x.id ? 'on' : ''} data-testid={`mp-tab-${x.id}`}
          onClick={() => goTab(x.id)}>{x.label}<em>{counts[x.id]}</em></button>)}</div>}
    </div>
    <div ref={listRef} onScroll={() => { if (hov && document.activeElement === hov.el) return; /* a row focused by keys scrolled into view keeps its card */ setHov(null); }} className="orb-list" data-testid="mp-list" data-count={all.length} data-tab={tab} role={showTabs ? 'tabpanel' : undefined} aria-label={showTabs ? tabLabel(tab) : undefined}>
      {refsOn && !ql ? <>{/* files on the bar (2026-10-31, user pick): the models that use them all first, then the rest with what they skip */}
        {grp('ref-all', 'Works with your files', <>{autoShown && autoRow()}{main.filter(worksWith).map(m => row(m))}</>)}
        {main.some(m => !worksWith(m)) && grp('ref-skip', 'Skips some of your files', main.filter(m => !worksWith(m)).map(m => row(m)))}
        {soon.length > 0 && <div className="orb-grp" role="group" aria-label="Coming soon" data-testid="mp-section-soon">
          <button type="button" className="orb-sec orb-sec-tog" aria-expanded={soonOpen} data-testid="mp-soon-toggle" onClick={() => setSoonOpen(o => !o)}><span className="orb-lbl">Coming soon <small>{soon.length}</small></span><ChevronRightIcon size={14} className="orb-sec-chev" /></button>
          {soonOpen && soon.map(m => row(m))}</div>}
      </>
      : ql ? (main.length || soon.length ? grp('results', `${main.length + soon.length} result${main.length + soon.length === 1 ? '' : 's'}`, [...main, ...soon].map(m => row(m))) : null)
      : <>
        {favModel && grp('yours', 'Your default', row(favModel), resetFav)}
        {pinDef && favModel !== defModel && grp('default', favModel ? 'Recommended' : 'For this workflow', row(defModel!), favModel ? null : resetBtn)}
        {featured.filter(m => m !== favModel).length > 0 && grp('featured', 'Featured', featured.filter(m => m !== favModel).map(m => row(m)))}
        {(autoShown || allRows.length > 0) && grp('all', 'All models', <>{autoShown && autoRow()}{allRows}</>)}
        {soon.length > 0 && <div className="orb-grp" role="group" aria-label="Coming soon" data-testid="mp-section-soon">
          <button type="button" className="orb-sec orb-sec-tog" aria-expanded={soonOpen} data-testid="mp-soon-toggle" onClick={() => setSoonOpen(o => !o)}><span className="orb-lbl">Coming soon <small>{soon.length}</small></span><ChevronRightIcon size={14} className="orb-sec-chev" /></button>
          {soonOpen && soon.map(m => row(m))}</div>}
      </>}
      {all.some(isLast) && <div className="orb-grp orb-grp-last" role="group" aria-label={lastLabel ?? 'Text only'} data-testid="mp-section-text-only">{sec(lastLabel ?? 'Text only · remove the photo to use these')}{all.filter(isLast).map(m => row(m))}</div>}
      {!all.length && <p className="orb-empty" data-testid="mp-empty">{ms.length ? <>No models match “{q}”{tab !== 'all' ? ` in ${tabLabel(tab)}` : ''}. {tab !== 'all' ? <button type="button" className="orb-link" data-testid="mp-empty-all" onClick={() => goTab('all')}>Search all</button> : null}</> : models.length ? 'No model does this yet.' : 'Loading models…'}</p>}
    </div>
    {supports}
    {curModel && t && <div className="orb-foot" data-testid="mp-foot"><HwUnknownLine fits={[localFitOf(curItem?.p)]} className="mp-hw" short />
      <div className="orb-foot-row"><span className="orb-runs" title={curBlk ? `${shownName(curModel)} can’t run as set: ${curBlk.full}` : t.tip}><LogoMark size={16} />Runs on <b>{t.main.replace(/^Your GPU\b/, LOCAL_LABEL)}</b>{curBlk ? <small className="orb-why" data-testid="mp-foot-why">{` · ${curBlk.short}`}</small> : t.sub ? <small>{` · ${t.sub}`}</small> : null}</span>
        <span className="orb-bal">{bal && <span data-testid="mp-balance" data-sample={bal.sample || undefined} title={bal.title}><span className="orb-mono">{fmtUsd(bal.usd)}</span>{bal.text.slice(fmtUsd(bal.usd).length)}{bal.sample ? <small> · sample</small> : null}<span className="orb-dot"> · </span></span>}
          <button ref={roRef} type="button" className="orb-chg" aria-expanded={roOpen} data-testid="mp-route-toggle" onClick={() => setRoOpen(o => !o)}>Change</button></span></div>
      <RunOnMenu open={roOpen} anchor={roRef} placement="top" onClose={() => setRoOpen(false)} toolId={toolId} model={curModel} engine={value} quote={quote} /></div>}
    {hm && hov && !roOpen && <ModelPreviewCard run={runOf(hm)} rq={liveQ(hm)} m={{ ...hm, medium: shownMedium(hm) }} row={hov.el} engine={itemOf(hm)?.id ?? hm.primaryEngine} tool={toolLike(toolId)} provider={itemOf(hm)?.p} note={noteOf(hm)} hover={hi.cardProps} />}
  </div></NeedAct.Provider></Popover>;
}
