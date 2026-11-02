import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ToolInfo } from '../../api';
import { IMAGE_PAGE, VIDEO_PAGE, AUDIO_PAGE, THREE_D_PAGE } from '../../../../server/src/shared/pages';
import { Link } from '../../platform/router';
import { prefetchRoute } from '../../platform/routeChunks';
import { goClick } from '../../shared/goToWorkflow';
import { HoverClip, useClipSound, prefersReducedMotion } from '../../shared/HoverClip';
import { SoundToggle } from '../../shared/SoundToggle';
import SplitPreview from '../../shared/SplitPreview';
import { Segmented } from '../../shared/BarPop';
import { tip } from '../../shared/Tooltip';
import { loadHub } from '../../shared/looks';
import { RunLine, RunPlaces, device } from '../../shared/RunLine';
import { ToolIconFor, SearchIcon, CloseIcon, OfficialBadgeIcon, CommunityIcon, SparkleIcon, SavedTagIcon, GenerateIcon, PlayIcon, PauseIcon } from '../Icons';
import { FlowDiagram, hasDiagram } from '../exploreArt';
import { featuredByKey, runByJob, type FeaturedRun } from '../../../../server/src/shared/featured';
import { resolveRow, whyHidden, runsPrice, runCost, openHrefOf, type Row, type Hub } from './workflowRows';
import { WF_ENTRIES, WF_CHAINS, workflowPageSections, cardThumb, entryHay, type WfChain } from '../../../../server/src/shared/workflowCatalog';
import { countLine } from '../../../../server/src/shared/workflowCount';
import { goalOf, goalById, isGoal, type WfGoal } from '../../../../server/src/shared/workflowGoals';
import { fromEntry, fromChain, chainId, wfId, buildWorkflowIndex, type LibWorkflow } from '../../../../server/src/shared/libraryWorkflows';
import { pluginWfEntries } from '../../../../server/src/shared/pluginPlacement';
import { PluginBadge, PluginMeta } from '../../shared/PluginBadge';
import { openAddWorkflow } from '../../shared/AddWorkflow';
import '../explore.css';
import './workflowFinder.css';
/**
 * Workflows (2026-10-27, the Finder; 2026-11-01 by goal): "Start here", then one short section per goal (server/src/shared/workflowGoals.ts,
 * the picks in workflowCatalog.ts WF_PAGE_PICKS; the rail is the same list), workflows and multi-step chains, with the real models and, per model, where it runs and its price from GET /api/tools
 * (shared/runLabel.ts words, shared/RunLine.tsx), and image examples from GET /api/workflow-hub. A workflow no model can run here is left out
 * (the rail names what was left out and why). Since 2026-11-02 it lists EVERY workflow and chain (workflowCatalog.ts workflowPageSections), and
 * its header and "Everything" count come from shared/workflowCount.ts, the same count the README uses.
 * Layout options for the cards (?wflayout=a|b|c, the user picks one; none = the plain grid):
 *  a  gallery: sections show the cards with a real example first, and a sound plays on its card (SoundTile);
 *  b  shelves: one horizontal row per section, with "See all" to that goal;
 *  c  compact: a denser grid, each card with its model and where it runs and the price (RunLine).
 *  - Left: the brand line, search ("/" focuses it), Start here and the goals with their counts (empty ones hidden), Step by step and Saved, Surprise me.
 *  - Right: "Yours" (saved workflows and chains, this browser only), then the sections in grids that fill the width, in Explore's
 *    banded tile (explore.css .xp-tile.is-band): the picture, then on a solid band the name, one line and a small model chip (where it runs and the price depend on the
 *    user's setup, so they live in the sheet and on the tab's Generate, not on the card).
 * A card opens the workflow sheet: its example, how it works, every model with every place it runs (status and price), the source credit and
 * licence, then "Open in <tab>" (goToWorkflow; the tab's code is fetched as the sheet opens, so the click doesn't wait). A workflow with no
 * example of ours shows our own drawing of the flow, labelled as such. ?q= prefills the search; ?cat= picks a goal (or start); both follow the page.
 */
const TAB: [string, string][] = [[IMAGE_PAGE, 'Image'], [VIDEO_PAGE, 'Video'], [AUDIO_PAGE, 'Audio'], [THREE_D_PAGE, '3D']];
export const tabOf = (href: string) => TAB.find(([p]) => href === p || /^[/?#]/.test(href.slice(p.length)) && href.startsWith(p))?.[1] ?? 'the app';
/** the goal's label for a workflow or chain id (the sheet's kicker) */
const goalLabel = (id: string) => goalById(goalOf(id) ?? '')?.label ?? '';
const mins = (ms: number) => ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`;
export { resolveRow, runsPrice, type Row };
/** The tab's code, fetched once (a card hover, a sheet opening), so "Open in" doesn't wait for it. */
/** Click → sheet on screen, as performance marks (DevTools › Performance, or performance.getEntriesByName('wf:click-to-sheet')). */
const markOpen = () => { try { performance.mark('wf:open'); } catch { /* old browser */ } };
const markShown = () => { try { performance.mark('wf:sheet'); performance.measure('wf:click-to-sheet', 'wf:open', 'wf:sheet'); } catch { /* no open mark (Surprise me, a chain step) */ } };
const fetched = new Set<string>(); const warm = (href: string) => { const p = href.split('?')[0]; if (fetched.has(p)) return; fetched.add(p); prefetchRoute(p); };

// ------------------------------------------------------------------ data hooks
function useRows(tools: ToolInfo[]) {
  const [hub, setHub] = useState<Hub>(null);
  useEffect(() => { let live = true; loadHub().then((h) => live && setHub(h)).catch(() => undefined); return () => { live = false; }; }, []);
  return useMemo(() => { const w = { device: device() };
    /* plugins with a tab (shared/pluginPlacement.ts) join the catalogue from GET /api/tools: they show and search like the built-in ones, with their Plugin badge */
    const entries = [...WF_ENTRIES, ...pluginWfEntries(tools as any)];
    const rows = entries.map((e) => resolveRow(e, tools, hub, w)).filter((r): r is Row => !!r);
    /* left out here, and why (tools still loading: nothing yet) */
    const left = tools.length ? entries.map((e) => ({ e, why: whyHidden(e, tools, hub) })).filter((x): x is { e: typeof x.e; why: string } => !!x.why) : [];
    return { rows, left }; }, [tools, hub]);
}
/** Sample mode (no keys, mock server): said once, plainly. */
function useSampleMode() {
  const [m, setM] = useState<{ mock: boolean; comfy: boolean } | null>(null);
  useEffect(() => { fetch('/api/health').then((r) => (r.ok ? r.json() : null)).then((h) => h && setM({ mock: h.backend === 'mock', comfy: !!h.comfyReady })).catch(() => undefined); }, []);
  return m;
}
/** Saved workflows and chains: this browser only (try/catch: private mode just doesn't remember). */
function useStored<T>(key: string, init: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) as T : init; } catch { return init; } });
  return [v, (n: T) => { setV(n); try { localStorage.setItem(key, JSON.stringify(n)); } catch { /* not remembered */ } }];
}
/** Saved ids: a workflow's id, or `chain:<id>` for a multi-step chain. */
function useSaved() {
  const [saved, setSaved] = useStored<string[]>('ohf:wf:saved', []);
  return { saved, toggle: (id: string) => setSaved(saved.includes(id) ? saved.filter((x) => x !== id) : [id, ...saved]) };
}
type Saved = ReturnType<typeof useSaved>;

/** Researched ideas, not built (GET /api/library/workflows?kind=idea: the library database, server libraryDb.ts). [] when the install has none. */
function useIdeas() {
  const [ideas, setIdeas] = useState<LibWorkflow[]>([]);
  useEffect(() => { let live = true; fetch('/api/library/workflows?kind=idea&limit=200').then((r) => (r.ok ? r.json() : null)).then((d) => { if (live && Array.isArray(d?.items)) setIdeas(d.items); }).catch(() => undefined); return () => { live = false; }; }, []);
  return ideas;
}
/** Search + goal filter. `cat`: all | start | chains | saved | ideas | a goal. Both follow the address (replaceState: Back leaves the page, not a keystroke).
 *  Search ranks with the library index (shared/bm25.ts via shared/libraryWorkflows.ts): the same ranking agents get from search_workflows. */
function useFilter(allRows: Row[], allChains: WfChain[], ideas: LibWorkflow[]) {
  /* the page shows every workflow and chain that runs here (plugins in their own section) */
  const rows = allRows; const chainsHere = allChains;
  const [q, setQ] = useState(() => new URLSearchParams(location.search).get('q') ?? ''); const [cat, setCat] = useState<string>(() => { const c = new URLSearchParams(location.search).get('cat'); return c && (c === 'start' || c === 'chains' || c === 'saved' || c === 'ideas' || isGoal(c)) ? c : 'all'; });
  useEffect(() => { if (location.pathname !== '/workflows') return; const u = new URLSearchParams(location.search); q ? u.set('q', q) : u.delete('q'); cat !== 'all' ? u.set('cat', cat) : u.delete('cat');
    const s = u.toString(); const next = `${location.pathname}${s ? `?${s}` : ''}${location.hash}`; if (next !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(history.state, '', next); }, [q, cat]);
  /* one index over the rows (with their real model names), the chains that run here and the ideas */
  const index = useMemo(() => buildWorkflowIndex([...allRows.map((r) => ({ ...fromEntry(r.e), models: r.models.map((m) => ({ key: m.key, name: m.name, where: '', priceUsd: null, free: false, default: false })) })), ...allChains.map(fromChain), ...ideas]), [allRows, allChains, ideas]);
  const score = useMemo(() => new Map(index.search(q).map((h, i) => [h.id, i])), [index, q]);
  const rank = (id: string) => score.get(id) ?? Infinity;
  const hits = useMemo(() => rows.filter((r) => score.has(wfId(r.e.id))).sort((a, b) => (q ? rank(wfId(a.e.id)) - rank(wfId(b.e.id)) : 0)), [rows, score, q]);
  const chains = useMemo(() => chainsHere.filter((c) => score.has(chainId(c.id))).sort((a, b) => (q ? rank(chainId(a.id)) - rank(chainId(b.id)) : 0)), [chainsHere, score, q]);
  const ideaHits = useMemo(() => ideas.filter((w) => score.has(w.id)).sort((a, b) => (q ? rank(a.id) - rank(b.id) : 0)), [ideas, score, q]);
  return { q, setQ, cat, setCat, rows, chainsHere, hits, chains, ideas: ideaHits, ranked: !!q.trim(), order: (id: string) => rank(id.startsWith('chain:') ? chainId(id.slice(6)) : wfId(id)) };
}
type Filter = ReturnType<typeof useFilter>;

/** A near miss for a search with no results: workflows that match any one word (or its first four letters), best first. */
function nearMisses(rows: Row[], q: string): Row[] {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 3); if (!words.length) return [];
  const score = (r: Row) => { const h = entryHay(r.e, r.models.map((m) => m.name).join(' ')).toLowerCase(); return words.reduce((a, w) => a + (h.includes(w) ? 2 : h.includes(w.slice(0, 4)) ? 1 : 0), 0); };
  return rows.map((r) => [r, score(r)] as const).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1] || Number(b[0].made) - Number(a[0].made)).slice(0, 3).map(([r]) => r);
}

// ------------------------------------------------------------------ pieces
/** A modal panel (Esc / scrim / Close; focus kept inside and given back). */
function Panel({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const back = document.activeElement as HTMLElement | null; requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('.wv-x')?.focus());
    const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = o; if (back?.isConnected) back.focus({ preventScroll: true }); }; }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key === 'Tab') { const f = [...(box.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex="0"],textarea') ?? [])]; if (!f.length) return; const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
  };
  return createPortal(<div className="dlg-scrim wv-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()} onKeyDown={onKey}>
    <div ref={box} className="wv-panel" role="dialog" aria-modal="true" aria-label={label} data-testid="wv-panel">
      <button type="button" className="wv-x" aria-label="Close" onClick={onClose}><CloseIcon size={18} /></button>
      {children}
    </div></div>, document.body);
}

function Search({ f, inputRef }: { f: Filter; inputRef: React.RefObject<HTMLInputElement> }) {
  return <label className="wn-search"><SearchIcon size={16} />
    <input ref={inputRef} type="search" value={f.q} onChange={(e) => f.setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && f.q) { e.preventDefault(); e.stopPropagation(); f.setQ(''); } }}
      placeholder="Search workflows" aria-label="Search workflows" aria-keyshortcuts="/" data-testid="wn-search" />
    {f.q ? <button type="button" className="wn-clear" aria-label="Clear search" onClick={() => { f.setQ(''); inputRef.current?.focus(); }}><CloseIcon size={14} /></button> : <kbd className="wn-kbd" aria-hidden>/</kbd>}</label>;
}
/** No example of ours yet: our own drawing of the flow (Explore's art), honestly labelled where there is room (`label`). */
function Art({ r, label }: { r: Row; label?: boolean }) {
  const a = r.e.art; return <span className="wn-art" data-testid="wn-art"><span className="xp-art" aria-hidden>{a && hasDiagram(a) ? <FlowDiagram art={a} /> : <ToolIconFor id={r.e.toolId} size={44} strokeWidth={1.3} />}</span>
    {label && <span className="wn-art-t">How it works · no example yet</span>}</span>;
}
/** `thumb`: the card's own picture (Row.thumb): a clip's poster, or the picture itself for a still or a before / after (the sheet keeps the wipe). */
function MediaView({ r, mode = 'hover', muted = true, label, thumb }: { r: Row; mode?: 'hover' | 'view'; muted?: boolean; label?: boolean; thumb?: string | null }) {
  const m = r.media; const lay = useContext(LayoutCtx);
  if (m.kind === 'clip') return <HoverClip src={m.src} poster={thumb ?? m.poster} label={r.e.name} mode={mode} muted={muted} />;
  /* a before picture too (Try-On): the change plays as a soft wipe while the card is hovered; still, the result shows */
  if (thumb && r.thumbBefore) return <span className="wn-ba" data-testid="wn-ba"><img src={r.thumbBefore} alt="" loading="lazy" decoding="async" draggable={false} /><img className="wn-ba-after" src={thumb} alt={r.e.name} loading="lazy" decoding="async" draggable={false} /></span>;
  if (thumb) return <HoverClip src={thumb} poster={thumb} label={r.e.name} />;
  if (m.kind === 'still') return <HoverClip src={m.src} poster={m.src} label={r.e.name} />;
  if (m.kind === 'split') return <SplitPreview className="wn-split" before={m.before} after={m.after} beforeLabel={m.bl} afterLabel={m.al} testId="wn-split" />;
  /* a real sound of ours: our drawing on the card; in the sheet, the sound itself under it */
  if (m.kind === 'sound' && mode !== 'view' && lay) return <SoundTile src={m.src} label={r.e.name} />;
  if (m.kind === 'sound') return mode === 'view'
    ? <span className="wn-art wn-sound" data-testid="wn-sound"><span className="xp-art" aria-hidden>{r.e.art && hasDiagram(r.e.art) ? <FlowDiagram art={r.e.art} /> : <ToolIconFor id={r.e.toolId} size={44} strokeWidth={1.3} />}</span>
      <audio controls preload="none" src={m.src} aria-label={`${r.e.name}: our example`} /></span>
    : <Art r={r} />;
  return <Art r={r} label={label} />;
}
function SaveBtn({ id, s, label }: { id: string; s: Saved; label: string }) {
  const on = s.saved.includes(id);
  return <button type="button" className={`wn-save${on ? ' on' : ''}`} aria-pressed={on} aria-label={on ? `Remove ${label} from saved` : `Save ${label}`} {...tip(on ? 'Saved' : 'Save')} onClick={(e) => { e.stopPropagation(); s.toggle(id); }} data-testid="wn-save"><SavedTagIcon size={15} /></button>;
}
/** "Example" on a look's picture with no recorded run of ours (a preset's own picture). Nothing on our runs or our drawings. */
function Badge({ r }: { r: Row }) {
  return !r.made && r.media.kind !== 'art' && r.media.kind !== 'sound' ? <span className="xp-badge" {...tip('An example picture, not one of our own runs')}>Example</span> : null;
}

/** A card's model name, short (the sheet keeps the full one): "ByteDance Seedream 5.0 Flash · layers (hosted)" → "Seedream 5.0 Flash". */
export const shortModel = (n: string) => n.replace(/\s*·.*$/, '').replace(/\s*\((hosted|local)\)$/i, '').replace(/^ByteDance\s+/, '');
/** A workflow card, Explore's tile with the caption on a solid band under the picture (xp-tile is-band): name, line, model (no place or price,
 *  those depend on the setup). The whole card opens the sheet. */
/** The last card of Your workflows: opens Add a workflow (shared/AddWorkflow.tsx). */
function BringYourOwn() {
  return <button type="button" className="wn-bring" onClick={() => openAddWorkflow()} data-testid="wn-bring-own">
    <span className="wn-bring-ic" aria-hidden><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></span>
    <b>Bring your own</b><small>Add a ComfyUI workflow. It shows up in its tab, next to the built-in ones.</small></button>;
}
function Card({ r, onOpen, s, i = 0 }: { r: Row; onOpen: () => void; s: Saved; i?: number }) {
  /* a click anywhere opens it (the before / after wipe is hover-only on a card); only the Save button keeps its own click */
  const open = (ev: React.MouseEvent) => { if ((ev.target as HTMLElement).closest('a,button')) return; onOpen(); }; const lay = useContext(LayoutCtx);
  return <div className={`xp-tile is-band wn-card${r.media.kind !== 'art' ? ' is-real' : ''}`} onClick={open} onPointerEnter={() => warm(r.e.href)} data-hover-play data-testid={`wn-card-${r.e.id}`} style={{ ['--i' as string]: Math.min(i, 12) }}>
    <span className="xp-tile-media wn-media"><MediaView r={r} thumb={r.thumb} /></span>
    {/* the Added by you / Add-on badge sits on the picture, so a long name that clamps never hides it */}
    <span className="wn-top"><Badge r={r} />{r.e.plugin && <PluginBadge b={r.e.plugin} />}</span>
    <SaveBtn id={r.e.id} s={s} label={r.e.name} />
    <span className="xp-cap wn-cap">
      <button type="button" className="xp-title wn-title" onClick={onOpen} onFocus={() => warm(r.e.href)} aria-label={`${r.e.name}${r.e.plugin ? ` (${r.e.plugin.user ? 'added by you' : 'add-on'})` : ''}: ${r.e.line}. Details`}>{r.e.name}</button>
      <span className="xp-line">{r.e.line}</span>
      <span className="xp-meta wn-meta"><span className="wn-chip" title={r.models.map((m) => m.name).join(', ')}>{r.model ? shortModel(r.model) : 'Runs in the app'}</span></span>
      {lay === 'c' && <RunLine p={r.run} className="wn-runl" />}
    </span>
  </div>;
}
/** The card layout picked with ?wflayout=a|b|c ('' = the plain grid). */
type Layout = '' | 'a' | 'b' | 'c';
const LayoutCtx = createContext<Layout>('');
const layoutOf = (): Layout => { const v = new URLSearchParams(location.search).get('wflayout'); return v === 'a' || v === 'b' || v === 'c' ? v : ''; };
/** A sound of ours on its card (Make music, Sound effects, Voiceover): its own bars and a play button; the rest of the card still opens the sheet. */
function SoundTile({ src, label }: { src: string; label: string }) {
  const a = useRef<HTMLAudioElement>(null); const [on, setOn] = useState(false);
  const bars = useMemo(() => { let h = 0; for (const ch of src) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return Array.from({ length: 32 }, (_, i) => { h = (h * 1103515245 + 12345) >>> 0; return 22 + ((h >>> 8) % 60) * Math.sin(Math.PI * (i + 0.5) / 32); }); }, [src]);
  useEffect(() => () => a.current?.pause(), []);
  return <span className={`wn-snd${on ? ' is-on' : ''}`} data-testid="wn-snd">
    <span className="wn-snd-bars" aria-hidden>{bars.map((h, i) => <i key={i} style={{ height: `${Math.round(h)}%`, ['--d' as string]: `${(i % 7) * 90}ms` }} />)}</span>
    <button type="button" className="wn-snd-play" aria-label={on ? `Pause ${label}` : `Play ${label}`} onClick={(e) => { e.stopPropagation(); const el = a.current; if (!el) return; if (el.paused) el.play().catch(() => setOn(false)); else el.pause(); }}>
      {on ? <PauseIcon size={18} /> : <PlayIcon size={18} />}</button>
    <span className="wn-snd-t">Our example · listen</span>
    <audio ref={a} src={src} preload="none" onPlay={() => setOn(true)} onPause={() => setOn(false)} onEnded={() => setOn(false)} />
  </span>;
}

/** A chain's facts, shared by its tile and its sheet: each step's row, model, recorded runs; the first step's link with its model picked. */
function chainFacts(c: WfChain, rows: Row[]) {
  const steps = c.steps.map((st) => { const r = rows.find((x) => x.e.id === st.entry); const rs = (st.jobs ?? []).map(runByJob).filter((x): x is FeaturedRun => !!x);
    const m = st.model ? r?.models.find((x) => x.key === st.model) : undefined;
    return { st, r, rs, m, model: rs.length ? rs[rs.length - 1].model : st.modelName ?? m?.name ?? r?.model ?? null }; });
  const first = steps[0]; const fm = first.m;
  /* "Start with": the first step's tab on the step's own model (K-drama and One long take: MiniMax H3), like a card's Open */
  const startHref = first.r ? (fm ? openHrefOf(first.r.e, [fm, ...first.r.models.filter((x) => x.key !== fm.key)]) : first.r.openHref) : null;
  const ran = steps.every((x) => x.rs.length > 0); const f = c.featured ? featuredByKey(c.featured) : undefined;
  return { steps, first, startHref, ran, f, made: !!f && ran, run: fm?.run ?? first.r?.run ?? null };
}
const ChainArt = ({ c }: { c: WfChain }) => <span className="xp-art" aria-hidden>{c.art && hasDiagram(c.art) ? <FlowDiagram art={c.art} /> : <GenerateIcon size={40} />}</span>;
/** A chain as a card, the same size as a workflow’s: its clip and its steps’ models. Opens the chain’s sheet. */
function ChainTile({ c, rows, onOpen, s, i = 0 }: { c: WfChain; rows: Row[]; onOpen: () => void; s: Saved; i?: number }) {
  const k = chainFacts(c, rows); const open = (ev: React.MouseEvent) => { if ((ev.target as HTMLElement).closest('a,button')) return; onOpen(); }; const lay = useContext(LayoutCtx);
  return <div className={`xp-tile is-band wn-card wn-chaintile${k.f ? ' is-real' : ''}`} onClick={open} onPointerEnter={() => k.startHref && warm(k.startHref)} data-hover-play data-testid={`wn-chain-${c.id}`} style={{ ['--i' as string]: Math.min(i, 12) }}>
    <span className="xp-tile-media wn-media">{k.f ? <HoverClip src={k.f.out.url} poster={cardThumb(`chain:${c.id}`) ?? k.f.out.poster} label={c.name} /> : <span className="wn-art"><ChainArt c={c} /></span>}</span>
    <SaveBtn id={`chain:${c.id}`} s={s} label={c.name} />
    <span className="xp-cap wn-cap">
      <button type="button" className="xp-title wn-title" onClick={onOpen} aria-label={`${c.name}: ${c.line}. ${c.steps.length} steps. Details`}>{c.name}</button>
      <span className="xp-line">{c.line}</span>
      <span className="xp-meta wn-meta"><span className="wn-chip" title={k.steps.map((x) => x.model).filter(Boolean).join(' → ')}>{c.steps.length > 1 ? `${c.steps.length} steps` : k.steps[0].model ? shortModel(k.steps[0].model) : '1 step'}</span></span>
      {lay === 'c' && k.run && <RunLine p={k.run} className="wn-runl" />}
    </span>
  </div>;
}
/** A chain's sheet: its example, its steps in order (each names its workflow and real model, and opens that workflow's sheet), how the hand-off
 *  works, its source, then "Start with <first step>". */
function ChainSheet({ c, rows, s, onClose, onOpen }: { c: WfChain; rows: Row[]; s: Saved; onClose: () => void; onOpen: (r: Row) => void }) {
  const k = chainFacts(c, rows); const [going, setGoing] = useState(false); useLayoutEffect(markShown, [c]);
  useEffect(() => { if (k.startHref) warm(k.startHref); setGoing(false); }, [c]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = k.steps.flatMap((x) => x.rs); const tab = k.startHref ? tabOf(k.startHref) : '';
  return <Panel label={`${c.name}: how it works`} onClose={onClose}>
    <div className="wv-pmedia wn-pmedia" data-hover-play>
      <span className="wn-pframe" key={c.id}>{k.f ? <HoverClip src={k.f.out.url} poster={k.f.out.poster} label={c.name} mode="view" /> : <span className="wn-art"><ChainArt c={c} /><span className="wn-art-t">How it works · no example yet</span></span>}</span>
      {all.length > 0 && <span className="wn-pcap">{all.map((x) => `${x.model} · ${x.place}, ${runCost(x)}`).join(' → ')}{all.length > 1 ? ` · ${runsPrice(all)?.text} in all` : ''}</span>}
    </div>
    <div className="wv-pbody" data-testid="wn-chain-sheet">
      <p className="wv-kicker">{c.steps.length} {c.steps.length === 1 ? 'step' : 'steps'}</p>
      <h2 className="disp wv-ptitle">{c.name}</h2>
      <p className="wn-pline">{c.line}</p>
      <h3 className="wv-h">The steps</h3>
      <ol className="wn-steps">{k.steps.map(({ st, r, rs, model }, i) => { if (!r) return null; const cost = runsPrice(rs);
        return <li key={i}><button type="button" onClick={() => onOpen(r)} onPointerEnter={() => warm(r.e.href)}><i>{i + 1}</i><span><b>{r.e.name}</b><small>{st.say}</small><small>{[model, cost?.text.replace(' · on your computer', '')].filter(Boolean).join(' · ')}</small></span>
</button></li>; })}</ol>
      <h3 className="wv-h">Between the steps</h3><p className="wv-muted">{c.handoff}</p>
      {(c.source || c.skill) && <div className="wn-chain-foot">
        {c.source && <a href={c.source.url} target="_blank" rel="noreferrer" className="wn-skill" data-testid={`wn-chain-src-${c.id}`} {...tip(`${c.source.name}, by ${c.source.author}. We run it step by step on our tabs. Licence: ${c.source.licence}.`)}>Official Comfy template</a>}
        {c.skill && <Link to="/mcp" className="wn-skill" {...tip(`A related agent skill (${c.skill}): your AI agent can plan a similar path with it, not exactly these steps. It quotes first.`)}>Agent skill</Link>}</div>}
      <div className="wv-pacts">
        {k.startHref && k.first.r && <a href={k.startHref} onClick={(e) => { setGoing(true); goClick(k.startHref!)(e); }} className="btn wv-pri" aria-busy={going || undefined} data-testid="wn-chain-start">{going ? `Opening ${tab}…` : `Start with ${k.first.r.e.name}`}</a>}
        <SaveRowBtn id={`chain:${c.id}`} s={s} />
      </div>
    </div>
  </Panel>;
}
/** The sheet's Save: a compact button that stays on the button row (it used to wrap under Open at 1440). */
function SaveRowBtn({ id, s }: { id: string; s: Saved }) {
  const on = s.saved.includes(id);
  return <button type="button" className={`btn wn-psave${on ? ' on' : ''}`} aria-pressed={on} aria-label={on ? 'Saved' : 'Save'} onClick={() => s.toggle(id)} {...tip(on ? 'Saved' : 'Save for next time')}><SavedTagIcon size={15} /><span>{on ? 'Saved' : 'Save'}</span></button>;
}

/** The workflow sheet ("an opened workflow"): example, how it works, every model with every place it runs, credit, licence, and Open in <tab>. */
function Sheet({ r, rows, chains, s, onClose, onOpen, mock }: { r: Row; rows: Row[]; chains: WfChain[]; s: Saved; onClose: () => void; onOpen: (r: Row) => void; mock: boolean }) {
  const [sound, toggleSound] = useClipSound('ohf:wf:sound'); const [all, setAll] = useState(false); const [going, setGoing] = useState(false);
  useLayoutEffect(markShown, [r]);
  useEffect(() => { warm(r.e.href); setAll(false); setGoing(false); }, [r]);
  const partOf = chains.filter((c) => c.steps.some((x) => x.entry === r.e.id)); const tab = tabOf(r.e.href);
  const f = r.e.featured ? featuredByKey(r.e.featured) : undefined; const recreate = r.e.recreate ?? (f?.recreateHref ?? null);
  const models = all ? r.models : r.models.slice(0, 5); const SrcIc = r.source?.source === 'official' ? OfficialBadgeIcon : r.source?.source === 'community' ? CommunityIcon : SparkleIcon;
  /* "Ours" with no graph of ours and a link out = our request to a hosted model: say so (Try-On was "Ours · AGPL" while it is Bria's model) */
  const srcLabel = !r.source ? '' : r.source.source === 'official' ? 'Official Comfy template' : r.source.source === 'community' ? 'Community workflow' : !r.source.file && r.source.url ? 'Hosted model' : 'Built-in';  return <Panel label={`${r.e.name}: how it works`} onClose={onClose}>
    <div className="wv-pmedia wn-pmedia" data-hover-play>
      <span className="wn-pframe" key={r.e.id}><MediaView r={r} mode="view" muted={!sound} label thumb={r.media.kind === 'still' ? r.thumb : null} /></span>
      {r.media.kind === 'clip' && r.media.sound && !prefersReducedMotion() && <SoundToggle on={sound} onToggle={toggleSound} testId="wn-sound" />}
      {r.made && r.runs.length > 0 && <span className="wn-pcap" data-testid="wn-pcap">{r.runs.map((x) => `${x.model} · ${x.place}, ${runCost(x)}`).join(' → ')}{r.runs.length > 1 ? ` · ${runsPrice(r.runs)?.text} in all` : ''}{r.runMs ? ` · took ${mins(r.runMs)}` : ''}</span>}
    </div>
    <div className="wv-pbody" data-testid="wn-sheet">
      <p className="wv-kicker">{r.e.goal ? goalById(r.e.goal)?.label ?? '' : goalLabel(r.e.id)}</p>
      <h2 className="disp wv-ptitle">{r.e.name}{r.e.plugin && <PluginBadge b={r.e.plugin} />}</h2>
      <p className="wn-pline">{r.e.line}</p>
      {r.e.plugin && <p className="wn-pline" data-testid="wn-plugin-meta"><PluginMeta b={r.e.plugin} /> · <Link to="/plugins">Your workflows</Link></p>}
      {r.e.tabName && <p className="wv-muted wn-tabname" data-testid="wn-tabname">In the {tab} menu: {r.e.tabName}</p>}
      <div className="wv-pills"><span className="wv-pill">Needs: {r.e.needs}</span><RunLine p={r.run} testId="wn-sheet-run" /></div>
      {mock && <p className="wv-muted wn-mocknote">Sample mode: you get a sample and pay nothing. Prices show what a real run costs.</p>}
      {r.e.how && <><h3 className="wv-h">How it works</h3><ol className="wn-how">{r.e.how.map(([h, b]) => <li key={h}><b>{h}</b><span>{b}</span></li>)}</ol></>}
      <h3 className="wv-h">Models and where they run <span className="wn-n">{r.models.length}</span></h3>
      {r.models.length ? <ul className="wn-models" data-testid="wn-models">{models.map((m) => <li key={m.key}><b title={m.name}>{m.name}</b>
        <RunPlaces m={m.raw} />
        {m.licence && <small><Link to={`/licenses#${encodeURIComponent(m.licence.id)}`}>{m.licence.name}</Link></small>}</li>)}
        {r.models.length > 5 && <li className="wn-more-m"><button type="button" className="link-btn" onClick={() => setAll(!all)}>{all ? 'Fewer' : `All ${r.models.length} models`}</button></li>}</ul>
        : <p className="wv-muted">It runs inside the app, free on {device()}.</p>}
      <h3 className="wv-h">Source</h3>
      {r.source ? <div className="wv-wf" data-testid="wn-source"><span className="wn-src"><span className={`wfp-badge wfp-${r.source.source}`}><SrcIc size={12} />{srcLabel}</span></span>
        <span className="wv-wf-n">{r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer">{r.source.name}<span aria-hidden> ↗</span></a> : r.source.name}</span>
        {(r.source.author || r.source.licence) && <span className="wv-muted">{[r.source.author, r.source.licence].filter(Boolean).join(' · ')}</span>}
        {r.source.file && <a className="wv-dl" href={`/api/workflows/${encodeURIComponent(r.source.file)}`} download={r.source.file}>Download {r.source.file}</a>}</div>
        : <p className="wv-muted">{r.e.plugin ? `${r.e.plugin.user ? 'You added this ComfyUI workflow' : 'Added as a folder: its ComfyUI workflow ships with it'}${r.e.plugin.author ? `, made by ${r.e.plugin.author}` : ''}. It runs on your own ComfyUI.` : !r.models.length ? 'It runs inside the app, on your computer.' : `No source credit yet for ${r.models[0].name}.`}</p>}
      {partOf.length > 0 && <><h3 className="wv-h">Part of</h3><div className="wn-partof">{partOf.map((c) => { const nx = c.steps.findIndex((x) => x.entry === r.e.id) + 1; const n = c.steps[nx] ? rows.find((x) => x.e.id === c.steps[nx].entry) : null;
        return <span key={c.id}><b>{c.name}</b>{n ? <> · next: <button type="button" className="link-btn" onClick={() => onOpen(n)}>{n.e.name}</button></> : ' · last step'}</span>; })}</div></>}
      <div className="wv-pacts">
        <a href={r.openHref} onClick={(e) => { setGoing(true); goClick(r.openHref)(e); }} className="btn wv-pri" aria-busy={going || undefined} data-testid="wn-open" {...tip(r.models[0] ? `Opens ${tab} on ${r.models[0].name}` : null)}>{going ? `Opening ${tab}…` : `Open in ${tab}`}</a>
        {recreate && <a href={recreate} onClick={goClick(recreate)} className="btn">Make one like this</a>}
        <SaveRowBtn id={r.e.id} s={s} />
      </div>
    </div>
  </Panel>;
}

/** A researched idea: not built, never runnable. Its job, the models and where the research says it runs, and the source it came from. */
function IdeaCard({ w }: { w: LibWorkflow }) {
  const m = w.models[0];
  return <article className="wn-idea" data-testid={`wn-idea-${w.id}`}>
    <span className="xp-badge wn-idea-b">Idea · not built</span>
    <b className="disp">{w.name}</b>{w.job && w.job !== w.name && <p>{w.job.charAt(0).toUpperCase() + w.job.slice(1)}</p>}
    <span className="wn-idea-meta">{[w.mediaIn.join(' + ') + ' → ' + w.mediaOut.join(' + '), m?.name, m?.where].filter(Boolean).join(' · ')}</span>
    {w.source?.url ? <a href={w.source.url} target="_blank" rel="noreferrer" className="wn-idea-src">{w.source.name}<span aria-hidden> ↗</span></a> : w.source && <span className="wn-idea-src">{w.source.name}</span>}
  </article>;
}

function Empty({ f, rows, open }: { f: Filter; rows: Row[]; open: (r: Row) => void }) {
  const near = nearMisses(rows, f.q);
  return <div className="wn-empty" data-testid="wn-empty"><b className="disp">Nothing for “{f.q}” yet.</b>
    {near.length ? <><p>Closest we have:</p><div className="wn-near" data-testid="wn-near">{near.map((r) => <button key={r.e.id} type="button" className="wn-pin" onClick={() => open(r)}><ToolIconFor id={r.e.toolId} size={16} />{r.e.name}</button>)}</div></>
      : <p>Try simpler words, or ask your AI agent to build it for you.</p>}
    <div className="wn-empty-acts"><button type="button" className="btn" onClick={() => { f.setQ(''); f.setCat('all'); }}>Show all</button><Link to="/mcp" className="btn">Ask your agent</Link></div></div>;
}
function Note({ mode }: { mode: ReturnType<typeof useSampleMode> }) {
  if (!mode?.mock) return null;
  return <p className="wn-note" data-testid="wn-sample"><span className="wn-dot" aria-hidden />Sample mode: you get sample results and pay nothing. <Link to="/settings">Set up real runs</Link></p>;
}
/** What this computer can't run, named once (never a card that can't run). */
function LeftOut({ left }: { left: { e: { name: string }; why: string }[] }) {
  if (!left.length) return null;
  return <details className="wn-left" data-testid="wn-left"><summary>{left.length} can’t run on this computer yet</summary><ul>{left.map((x) => <li key={x.e.name}><b>{x.e.name}</b>: {x.why}</li>)}</ul></details>;
}

/** A section head: the title with its count beside it, one plain line. On the page background (no plate, no numbers). */
const Head = ({ id, title, line, count }: { id: string; title: string; line: string; count?: number }) =>
  <header className="wn-head"><h2 id={id}>{title}{count != null && <span className="wn-count" aria-label={`${count} ${count === 1 ? 'workflow' : 'workflows'}`}>{count}</span>}</h2>{line && <p>{line}</p>}</header>;

/** Yours: saved workflows and chains, first; a first-time note when there are none. */
function Yours({ rows, chains, s, open, openChain }: { rows: Row[]; chains: WfChain[]; s: Saved; open: (r: Row) => void; openChain: (c: WfChain) => void }) {
  const items = s.saved.map((id) => id.startsWith('chain:') ? chains.find((c) => `chain:${c.id}` === id) ?? null : rows.find((r) => r.e.id === id) ?? null).filter((x): x is Row | WfChain => !!x);
  if (!items.length) return null; /* nothing saved: no empty box (the Saved category says how) */
  return <section className="wn-yours" aria-labelledby="wn-h-yours" data-testid="wn-yours"><h2 id="wn-h-yours">Yours</h2>
    {items.length ? <div className="wn-yours-row">{items.map((x) => 'e' in x
      ? <button key={x.e.id} type="button" className="wn-pin" onClick={() => open(x)}><ToolIconFor id={x.e.toolId} size={16} />{x.e.name}</button>
      : <button key={x.id} type="button" className="wn-pin is-chain" onClick={() => openChain(x)}><GenerateIcon size={14} />{x.name}<small>{x.steps.length} steps</small></button>)}</div>
      : <p className="wn-first" data-testid="wn-first">Nothing saved yet. Press <SavedTagIcon size={13} /> on any card to keep it.</p>}
  </section>;
}

/** Loading: the same frame as the page (rail + grid), so nothing jumps when the tools arrive. */
const Loading = () => <div className="wn-page" aria-busy="true" aria-label="Loading workflows" data-testid="workflows-page"><div className="wn wn-b">
  <aside className="wn-side"><span className="wn-brand">Imagination is all you need</span><h1>Workflows</h1><span className="wn-shim wn-shim-search" />{[0, 1, 2, 3, 4, 5, 6].map((n) => <span key={n} className="wn-shim wn-shim-cat" />)}</aside>
  <div className="wn-main"><span className="wn-shim wn-shim-h" /><div className="wn-grid">{[0, 1, 2, 3, 4, 5].map((n) => <span key={n} className="wn-shim wn-shim-card" aria-hidden />)}</div></div></div></div>;

/** One card on the page: a workflow or a multi-step chain (a goal's picks can mix them). */
type Item = { kind: 'row'; r: Row; id: string } | { kind: 'chain'; c: WfChain; id: string };
const START_LINE = 'The easiest first steps. Most are free on your computer.';

export default function Workflows({ tools }: { tools: ToolInfo[] }) {
  const { rows, left } = useRows(tools); const s = useSaved(); const mode = useSampleMode(); const [layout] = useState(layoutOf);
  /* a chain shows only when every step can run here */
  const chainsAll = useMemo(() => WF_CHAINS.filter((c) => c.steps.every((st) => rows.some((r) => r.e.id === st.entry))), [rows]);
  const ideas = useIdeas(); const f = useFilter(rows, chainsAll, ideas);
  const [sheet, setSheet] = useState<Row | null>(null); const [chainSheet, setChainSheet] = useState<WfChain | null>(null); const search = useRef<HTMLInputElement>(null);
  const openRow = (r: Row) => { markOpen(); setChainSheet(null); setSheet(r); }; const openChain = (c: WfChain) => { markOpen(); setSheet(null); setChainSheet(c); };
  /* a gentle rise of the cards when a category is picked (not on load, not while typing) */
  const [rise, setRise] = useState(false); const firstCat = useRef(f.cat);
  useEffect(() => { if (f.cat === firstCat.current) return; firstCat.current = f.cat; setRise(true); const t = setTimeout(() => setRise(false), 900); return () => clearTimeout(t); }, [f.cat]);
  /* "/" focuses the search (not while typing somewhere else, not over a sheet) */
  const anySheet = !!sheet || !!chainSheet;
  useEffect(() => { const k = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || anySheet || t?.closest('input,textarea,select,[contenteditable="true"]')) return; e.preventDefault(); search.current?.focus(); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [anySheet]);
  if (!tools.length) return <Loading />;
  /* every workflow and chain, in the page's order (Start here, then each goal: its picks first), as far as the search keeps them */
  const item = (id: string): Item | null => { if (id.startsWith('chain:')) { const c = f.chains.find((x) => `chain:${x.id}` === id); return c ? { kind: 'chain', c, id } : null; } const r = f.hits.find((x) => x.e.id === id); return r ? { kind: 'row', r, id } : null; };
  const isItem = (x: Item | null): x is Item => !!x;
  /* a search ranks the cards inside each section (best match first) */
  const byRank = (list: Item[]) => !f.ranked ? list : [...list].sort((a, b) => f.order(a.id) - f.order(b.id));
  const sec = workflowPageSections();
  const start = byRank(sec.start.map(item).filter(isItem));
  const plugged: Item[] = f.hits.filter((r) => r.e.plugin).map((r) => ({ kind: 'row', r, id: r.e.id }));
  /* each goal's section; picked alone in the rail, a goal also shows its Start here cards first and the plugins its manifest puts there */
  const goals = sec.goals.map(({ goal, ids }) => { const g = goalById(goal)!; return { g, items: byRank(ids.map(item).filter(isItem)), starts: start.filter((x) => goalOf(x.id) === goal), plugs: plugged.filter((x) => x.kind === 'row' && x.r.e.goal === goal) }; });
  const picked = [...start, ...goals.flatMap((x) => x.items), ...plugged];
  /** Surprise me: a random workflow on this page that runs here right now, a made one twice as likely */
  const surprise = () => { const pool = f.rows.filter((r) => ['free', 'cloud', 'sample'].includes(r.run.kind)).flatMap((r) => (r.made ? [r, r] : [r])); const pick = pool[Math.floor(Math.random() * pool.length)]; if (pick) openRow(pick); };
  const savedItems: Item[] = s.saved.map((id): Item | null => { if (id.startsWith('chain:')) { const c = chainsAll.find((x) => `chain:${x.id}` === id); return c ? { kind: 'chain', c, id } : null; } const r = rows.find((x) => x.e.id === id); return r && (!f.ranked || f.hits.includes(r)) ? { kind: 'row', r, id } : null; }).filter(isItem);
  const goalItems = (g: WfGoal) => { const x = goals.find((y) => y.g.id === g)!; return [...x.starts, ...x.items, ...x.plugs]; };
  const opts = [{ value: 'all', label: 'Everything', aside: String(picked.length) }, ...(start.length ? [{ value: 'start', label: 'Start here', aside: String(start.length) }] : []),
    ...goals.map(({ g }) => ({ value: g.id as string, label: g.label, aside: String(goalItems(g.id).length) })).filter((o) => o.aside !== '0'),
    ...(f.chains.length ? [{ value: 'chains', label: 'Step by step', aside: String(f.chains.length) }] : []), { value: 'saved', label: 'Saved', aside: String(savedItems.length) },
    ...(ideas.length ? [{ value: 'ideas', label: 'Ideas, not built yet', aside: String(f.ideas.length) }] : [])];
  if (!opts.some((o) => o.value === f.cat)) opts.push({ value: f.cat, label: f.cat === 'chains' ? 'Step by step' : f.cat === 'ideas' ? 'Ideas, not built yet' : f.cat === 'start' ? 'Start here' : goalById(f.cat)?.label ?? f.cat, aside: '0' });
  const inCat = f.cat === 'chains' ? picked.filter((x) => x.kind === 'chain') : f.cat === 'saved' ? savedItems : f.cat === 'start' ? start : isGoal(f.cat) ? goalItems(f.cat) : [];
  const catInfo = isGoal(f.cat) ? goalById(f.cat) : f.cat === 'start' ? { label: 'Start here', line: START_LINE } : undefined;
  /* the header counts the cards shown right now (every section, or the one picked), with the shared words (shared/workflowCount.ts); ideas aren't workflows yet */
  const shownList = f.cat === 'all' ? picked : f.cat === 'ideas' ? [] : inCat;
  const headLine = countLine(shownList.filter((x) => x.kind === 'row').length, shownList.filter((x) => x.kind === 'chain').length);
  const nothing = f.cat === 'all' ? !picked.length : f.cat === 'ideas' ? !f.ideas.length : !inCat.length;
  /* Option A: the cards with a real example of ours lead each section (stable: the page's order otherwise) */
  const real = (x: Item) => x.kind === 'row' ? x.r.media.kind !== 'art' : !!x.c.featured;
  const arrange = (list: Item[]) => layout === 'a' && !f.ranked ? [...list.filter(real), ...list.filter((x) => !real(x))] : list;
  const tiles = (list: Item[]) => arrange(list).map((x, i) => x.kind === 'row' ? <Card key={x.id} r={x.r} s={s} i={i} onOpen={() => openRow(x.r)} /> : <ChainTile key={x.id} c={x.c} rows={rows} s={s} i={i} onOpen={() => openChain(x.c)} />);
  /** One section: its head, then its cards (a grid; Option B: a row that scrolls sideways, with "See all" for a goal) */
  const section = (id: string, title: string, line: string, list: Item[], extra?: ReactNode, cls = '', all?: string) => <section key={id} className={`wn-sec ${cls}`} aria-labelledby={`wn-h-${id}`} data-testid={`wn-sec-${id}`}>
    <div className="wn-head-row"><Head id={`wn-h-${id}`} title={title} line={line} count={list.length} />
      {layout === 'b' && all && f.cat === 'all' && <button type="button" className="link-btn wn-seeall" onClick={() => { f.setCat(all); scrollTo({ top: 0 }); }} data-testid={`wn-seeall-${id}`}>See all {list.length}</button>}</div>
    <div className={`wn-grid${layout === 'b' && f.cat === 'all' ? ' is-shelf' : ''}${layout === 'c' ? ' is-dense' : ''}`}>{tiles(list)}{extra}</div></section>;
  return <LayoutCtx.Provider value={layout}><div className={`wn-page${layout ? ` wn-l-${layout}` : ''}`} data-testid="workflows-page" data-layout={layout || 'grid'}>
    <div className="wn wn-b">
      <aside className="wn-side" aria-label="Find a workflow">
        <span className="wn-brand">Imagination is all you need</span><h1>Workflows</h1>
        <Search f={f} inputRef={search} />
        <div className="bp-host"><Segmented label="Categories" value={f.cat} options={opts} onChange={(v) => f.setCat(v)} cols={1} className="wn-cats" testId="wn-cats" /></div>
        <button type="button" className="wn-surprise" onClick={surprise} data-testid="wn-surprise"><SparkleIcon size={15} />Surprise me</button>
        <Note mode={mode} />
        <LeftOut left={left} />
      </aside>
      <div className="wn-main">
        <header className="wn-mhead"><h2>Make anything you imagine</h2><p data-testid="wn-count">{headLine ? `${headLine} ` : ''}Open one to see its models and price.</p></header>
        <Yours rows={rows} chains={chainsAll} s={s} open={openRow} openChain={openChain} />
        <div className={`wn-results${rise ? ' is-rising' : ''}`} key={f.cat}>
        {nothing ? (f.cat === 'saved' && !f.q ? <p className="wn-first wn-first-big">Nothing saved yet. Press <SavedTagIcon size={13} /> on any card.</p> : <Empty f={f} rows={f.rows} open={openRow} />) : <>
          {f.cat === 'all' && start.length > 0 && section('start', 'Start here', START_LINE, start, undefined, 'wn-start', 'start')}
          {f.cat === 'all' && goals.filter((x) => x.items.length > 0).map(({ g, items }) => section(g.id, g.label, g.line, items, undefined, '', g.id))}
          {f.cat === 'all' && (plugged.length > 0 || !f.q) && section('plugins', 'Your workflows', 'ComfyUI workflows you added, and add-ons. They run on your own ComfyUI.', plugged, <BringYourOwn />)}
          {f.cat !== 'all' && f.cat !== 'ideas' && inCat.length > 0 && section(f.cat,
            f.cat === 'chains' ? 'Step by step' : f.cat === 'saved' ? 'Saved' : catInfo?.label ?? f.cat,
            f.cat === 'chains' ? 'Workflows that pass the result along. Each step shows its model and price first.' : f.cat === 'saved' ? 'Kept in this browser.' : catInfo?.line ?? '', inCat)}
          {f.cat === 'ideas' && <section className="wn-sec" aria-labelledby="wn-h-ideas" data-testid="wn-sec-ideas">
            <Head id="wn-h-ideas" title="Ideas, not built yet" line="Coming later. They don’t run yet; each links its source." count={f.ideas.length} />
            <div className="wn-ideas">{f.ideas.map((w) => <IdeaCard key={w.id} w={w} />)}</div></section>}
        </>}
        </div>
      </div>
    </div>
    {sheet && <Sheet r={sheet} rows={rows} chains={chainsAll} s={s} onClose={() => setSheet(null)} onOpen={openRow} mock={!!mode?.mock} />}
    {chainSheet && <ChainSheet c={chainSheet} rows={rows} s={s} onClose={() => setChainSheet(null)} onOpen={openRow} />}
  </div></LayoutCtx.Provider>;
}
