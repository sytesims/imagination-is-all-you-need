import { tip } from '../shared/Tooltip';
import { useRouting, type ToolModel } from '../shared/models';
import { OpenWeightsOnlyPill } from '../shared/OpenWeights';
import { useLedger } from '../shared/balance';
import { useOwnAccounts, useSpendDay, useSpendMonth, useAccounts, fmtUsd, ago, knownBalanceUsd, ledgerUsd, balanceText, balanceDetail, comfyPlanNow } from '../shared/billing';
import './accountMenu.css';
import { LOCAL_FREE_HEADLINE, useLocalFree } from './next/LocalFree';
import { createPortal } from 'react-dom';
import { SearchOverlay, badgeOf, mediaOf } from './pages/Live';
import Wordmark from './Wordmark';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ToolInfo } from '../api';
import { Link, useSearch } from '../platform/router';
import { SearchIcon, AssetsIcon, ImageIcon, VideoIcon, AudioIcon, CubeIcon, ToolIconFor, ExploreIcon, MoreIcon, UserIcon, UsageIcon, ProjectsIcon, FavouritesIcon, SettingsIcon, DocsIcon, PriceTagIcon, BrandIcon } from './Icons';
import { fetchMenuModels, ModelGroup } from '../shared/batch1';
import { MakerTile } from '../shared/MakerTile';
import { FEATURED_MODELS, MAX_MODELS, MENU_MODELS_FIRST, TOOL_TAGLINE, CANVAS_NAV, FILM_NAV, menuFeatureRows, type Medium } from './headerMenus';
import { MENU_FEATURES, IMAGE_FEATURES } from '../shared/imageFeatures';
import { workflowOpenHref } from '../shared/workflowLinks';
import { availableVideoWorkflows, availableFlowShortcuts, videoWorkflowHref, isPanelWorkflow, VIDEO_WORKFLOWS, VIDEO_PAGE } from './video/VideoWorkflows';
import { availableAudioWorkflows, AWIcon } from './audio/AudioWorkflows';
import { AUDIO_PAGE, AUDIO_DEFAULT_WORKFLOW, audioRoute } from '../../../server/src/shared/audioWorkflows';
import { pickerHref } from '../shared/WorkflowPicker';
import { useProfile, nameOf, UserAvatar, type ProfileData } from '../shared/profile';
import { REPO_URL } from '../shared/brand';
import { GPU_SETTINGS } from '../shared/legacyRoutes';
import { THREE_D_WORKFLOWS, threeDRoute, THREE_D_PAGE } from '../../../server/src/shared/threeD';
import { LOCAL_LABEL } from '../../../server/src/shared/modelIds';
import { aboutLink } from '../../../server/src/shared/modelLinks';
import { modelNavigationHref } from '../shared/modelNavigation';
import { createHoverLock, isMenuActivation, HOVER_MENU_ZONE, type HoverLock } from '../shared/hoverMenuLock';

/** 3D menu rows (2026-10-23): one row per 3D workflow, each opening the 3D page with it picked; roadmap rows say Coming soon. */
export const threeDWorkflowRows = () => THREE_D_WORKFLOWS.map(w => ({ key: w.id, to: w.id === 'image-to-3d' ? THREE_D_PAGE : threeDRoute(w.id), name: w.name, line: w.status === 'soon' ? `Coming soon · ${w.tagline}` : w.tagline, icon: w.id, soon: w.status === 'soon' }));

/** Image menu rows (Image mega panel, mobile drawer): a plain list like the Video menu, one row per image feature in the approved order
 *  (shared/imageFeatures MENU_FEATURES). Create Image opens /tools/create-image; every other row opens Create Image with its workflow picked
 *  (workflowLinks: /tools/create-image?workflow=<id>; Camera & Lens runs on create-image itself, so its route carries the workflow).
 *  Edit Image is not a row here (editing lives inside Create Image); the header panel passes every feature (IMAGE_FEATURES) and picks its 8 from
 *  headerMenus MENU_FEATURE_ORDER, where Edit Image opens Create Image in edit mode. Tools the server doesn't have are skipped. */
export const imageFeatureRows = (tools: ToolInfo[], list: readonly (typeof MENU_FEATURES)[number][] = MENU_FEATURES) => list.flatMap(f => { const t = tools.find(x => x.id === f.toolId);
  return t ? [{ f, t, to: workflowOpenHref(f.toolId) ?? f.route, icon: f.id === 'camera-lens' || f.id === 'edit-image' ? f.id : t.id }] : []; });

/** Video menu rows (One Video page, 2026-10-23): one row per video workflow, each opening the Video page with it picked
 *  (/tools/h3-video?workflow=<id>), the way the Image menu lists its features; listed video tools that aren't a workflow follow with their own page (Director was removed 2026-10-23). */
export const videoWorkflowRows = (all: ToolInfo[], vid: ToolInfo[]) => { const covered = new Set([...VIDEO_WORKFLOWS.map(w => w.toolId), 'plan-a-shot', 'make-it-real']);
  return [...availableVideoWorkflows(all).filter(w => w.inMenu).flatMap(w => { const t = all.find(x => x.id === w.toolId); return t || isPanelWorkflow(w) /* Stitch: no registry tool */ ? [{ key: w.id, to: videoWorkflowHref(w.id), name: w.name, line: w.tagline, icon: w.toolId, ui: t?.ui, t: t ?? null }] : []; }),
    /* flow shortcuts (2026-10-26): Direct a Shot, Loop, Morph, Exploded view, New angle (shared/videoWorkflows.ts VIDEO_FLOW_SHORTCUTS) */
    ...availableFlowShortcuts(all).map(w => { const t = all.find(x => x.id === w.toolId)!; return { key: w.id, to: w.href, name: w.name, line: w.tagline, icon: w.toolId, ui: t.ui, t: w.badge === 'New' ? { ...t, badge: 'new' } as ToolInfo : t, opensIn: w.opensIn }; }),
    ...vid.filter(t => !covered.has(t.id)).map(t => ({ key: t.id, to: t.route, name: t.name, line: toolLine(t), icon: t.id, ui: t.ui, t }))]; };
/** Audio menu rows (One Audio page, 2026-10-23): one row per audio workflow (server shared/audioWorkflows.ts), each opening the Audio page with it
 *  picked (audioRoute: /tools/audio?workflow=<id>), the way the Video menu lists its workflows. Workflows whose tool the server lacks are skipped. */
export const audioWorkflowRows = (all: ToolInfo[]) => availableAudioWorkflows(all).map(w => ({ w, t: all.find(x => x.id === w.tool) }));

/** ONE builder for the Features rows of all four header menus (mega panel and phone drawer): Image features, Video, Audio and 3D workflows,
 *  each with where it opens, its line, its icon, the tool its New/Top badge comes from (once per tool) and, for a page's default workflow, the
 *  page's own path (current when no workflow is picked). The mega panel then keeps MENU_FEATURE_ORDER's 8 (headerMenus menuFeatureRows). */
export type MenuFeature = { key: string; to: string; name: string; line: string; tile: (size: number) => React.ReactNode; badgeTool?: ToolInfo | null; home?: string; /** opens in another tab (Direct a Shot: '3D') */ opensIn?: string };
export function menuFeatures(media: Medium, all: ToolInfo[], mediaTools: ToolInfo[], imageList: readonly (typeof MENU_FEATURES)[number][] = MENU_FEATURES): MenuFeature[] {
  if (media === 'image') return imageFeatureRows(all, imageList).map(({ f, t, to, icon }) => ({ key: f.id, to, name: f.name, line: f.tagline, tile: (n: number) => <ToolIconFor id={icon} ui={t.ui} size={n} />,
    badgeTool: f.toolId !== 'create-image' || f.id === 'create-image' ? t : null /* Camera & Lens shares Create Image's tool: no second badge */ }));
  if (media === 'video') return videoWorkflowRows(all, mediaTools).map(r => ({ key: r.key, to: r.to, name: r.name, line: r.line, tile: (n: number) => <ToolIconFor id={r.icon} ui={r.ui} size={n} />, badgeTool: r.t, home: r.key === 'create' ? VIDEO_PAGE : undefined, opensIn: (r as { opensIn?: string }).opensIn }));
  if (media === 'audio') { const seen = new Set<string>();
    return audioWorkflowRows(all).map(({ w, t }) => { const first = !seen.has(w.tool); seen.add(w.tool);
      return { key: w.id, to: audioRoute(w.id), name: w.name, line: w.tagline, tile: (n: number) => <AWIcon w={w} size={n} />, badgeTool: first ? t : null, home: w.id === AUDIO_DEFAULT_WORKFLOW ? AUDIO_PAGE : undefined }; }); }
  return threeDWorkflowRows().map(r => ({ key: r.key, to: r.to, name: r.name, line: r.line, tile: (n: number) => <ToolIconFor id={r.icon} size={n} />, badgeTool: r.key === 'image-to-3d' ? all.find(t => t.id === 'three-d') : null }));
}
/** Where a header menu's "See all" goes: the page's workflow picker (?picker=1, shared/WorkflowPicker) on Video, Audio and 3D; Image lists its
 *  features on the Workflows page. */
export const menuSeeAllHref = (media: Medium): string => media === 'image' ? '/workflows' : pickerHref(media === 'video' ? VIDEO_PAGE : media === 'audio' ? AUDIO_PAGE : THREE_D_PAGE);
/** A menu route with a query (/tools/create-image?workflow=relight) is current when the path and its query params match; Create Image itself only with no workflow picked and not in edit mode. */
const routeOn = (route: string, path: string): boolean => { const [p, q] = route.split('?'); if (p !== path) return false; const cur = new URLSearchParams(location.search);
  return q ? [...new URLSearchParams(q)].every(([k, v]) => cur.get(k) === v) : !cur.get('workflow') && cur.get('mode') !== 'edit' /* Edit Image row */; };

/** "Soon" entries come from the server registry (GET /api/roadmap, set by App via setRoadmap) so the nav can't drift. */
let ROADMAP: string[] = [];
export const setRoadmap = (names: string[]) => { ROADMAP = names; };
export const roadmap = (_tools: ToolInfo[]) => ROADMAP;


type Badge = 'new' | 'free' | 'top';
const Pill = ({ b }: { b: Badge }) => <span className={`nb nb-${b}`}>{b === 'new' ? 'New' : b === 'free' ? 'Free' : 'Top'}</span>;

/** The strip above the header on every page (PARITY-A H-22, decision 2): our own line about open source, a small link to the docs, a ×.
 *  Sits in the page flow, so it scrolls away and the sticky header takes the top. Dismissal is remembered per browser (localStorage; a
 *  blocked or private store just shows it again). The × collapses it in 0.3 s, or at once under reduced motion. */
const PROMO_KEY = 'ohf:promo:v2';
const promoDismissed = () => { try { return localStorage.getItem(PROMO_KEY) === '1'; } catch { return false; } };
export function AnnounceBar() {
  const [state, setState] = useState<'open' | 'closing' | 'gone'>(() => promoDismissed() ? 'gone' : 'open'); const el = useRef<HTMLDivElement>(null);
  if (state === 'gone') return null;
  const dismiss = () => { try { localStorage.setItem(PROMO_KEY, '1'); } catch { /* not saved: it comes back next visit */ }
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !el.current) { setState('gone'); return; }
    const s = el.current.style; s.height = `${el.current.offsetHeight}px`; void el.current.offsetHeight; s.height = '0px'; setState('closing'); setTimeout(() => setState('gone'), 320); };
  return <div ref={el} className={`promo-strip${state === 'closing' ? ' closing' : ''}`} role="region" aria-label="About Imagination Is All You Need" data-testid="promo-strip">
    <p className="promo-line"><span className="promo-text">If you can imagine it, you can make it here. Open source and yours to keep.</span>{' '}
      <Link to={REPO_URL} className="promo-link" data-testid="promo-github">GitHub →</Link></p>
    <button type="button" className="promo-x" aria-label="Dismiss" onClick={dismiss} data-testid="promo-dismiss"><svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" /></svg></button>
  </div>;
}

/** Header menus v2: one controller for every desktop header menu (Image, Video, Audio, More), so only one is ever open.
 *  Rendered in portals: the header link strip scrolls sideways (overflow-x:auto) and would clip them. Hover intent: 170 ms before the
 *  first open, instant swap while one is already open, 280 ms grace on leave so the pointer can cross onto the panel.
 *  Picking a row (click, middle / cmd-click, Enter, Space) closes it at once; after a pointer pick hover can't reopen that menu until the
 *  pointer has left the triggers and panel (another trigger still opens its own) (shared/hoverMenuLock.ts). Route or query change, Escape, focus leaving and resize close it too. */
type MenuId = 'image' | 'video' | 'audio' | '3d' | 'more';
/** One hover lock per menu controller; while locked, pointer moves are watched until the pointer is outside every trigger and panel. */
type MenuLock = HoverLock<MenuId> & { lockNow: (id: MenuId | null) => void };
function useHoverLock(): MenuLock {
  const l = useRef<MenuLock>(); const mv = useRef<(e: PointerEvent) => void>();
  if (!l.current) { const h = createHoverLock<MenuId>(); const stop = () => { if (mv.current) removeEventListener('pointermove', mv.current); mv.current = undefined; };
    l.current = Object.assign(h, { lockNow: (id: MenuId | null) => { h.lock(id); if (mv.current) return;
      mv.current = e => { h.pointerAt(!!(e.target as Element | null)?.closest?.(HOVER_MENU_ZONE)); if (!h.locked) stop(); }; addEventListener('pointermove', mv.current, { passive: true }); } }); }
  useEffect(() => () => { if (mv.current) removeEventListener('pointermove', mv.current); }, []);
  return l.current;
}
function useHeaderMenus(path: string, search: string) {
  const lock = useHoverLock();
  const [open, setOpen] = useState<MenuId | null>(null); const cur = useRef<MenuId | null>(null); cur.current = open;
  const tIn = useRef<number>(), tOut = useRef<number>(), at = useRef(0), trig = useRef<Partial<Record<MenuId, HTMLElement | null>>>({});
  const clear = () => { clearTimeout(tIn.current); clearTimeout(tOut.current); };
  const set = (id: MenuId | null) => { clear(); if (id && cur.current !== id) at.current = Date.now(); setOpen(id); };
  const enter = (id: MenuId) => { clear(); if (!lock.canHoverOpen(id)) return; if (cur.current) set(id); else tIn.current = window.setTimeout(() => set(id), 170); };
  const leave = () => { clear(); tOut.current = window.setTimeout(() => setOpen(null), 280); };
  const keep = () => clearTimeout(tOut.current);
  /** Click right after a hover-open keeps it open instead of toggling it shut. */
  const toggle = (id: MenuId) => { lock.unlock(); return cur.current === id && Date.now() - at.current > 500 ? set(null) : set(id); };
  const focusIn = (id: MenuId, first = false) => { lock.unlock(); set(id); if (first) requestAnimationFrame(() => document.querySelector<HTMLElement>('.hm-panel [role=menuitem]')?.focus()); };
  const close = (refocus = false) => { const id = cur.current; set(null); if (refocus && id) trig.current[id]?.querySelector<HTMLElement>('a,button')?.focus(); };
  const blur = (e: React.FocusEvent) => { const r = e.relatedTarget as HTMLElement | null; if (!r?.closest?.('.hm-panel,.nav-dd')) set(null); };
  useEffect(() => () => clear(), []);
  useEffect(() => { setOpen(null); }, [path, search]);
  /** A row (or a trigger link) was picked: close now, keep hover from reopening it, and put keyboard focus back on the trigger. */
  const pick = (e: React.MouseEvent | React.KeyboardEvent) => { const el = (e.target as HTMLElement).closest<HTMLElement>('a[href],[role=menuitem]'); if (!el || !isMenuActivation(e)) return;
    if (e.type === 'keydown') { if ((e as React.KeyboardEvent).key !== ' ') return; e.preventDefault(); el.click(); return; } // Space on a link: same as Enter (its click lands back here)
    const kb = e.type === 'click' && (e as React.MouseEvent).detail === 0; if (!kb) lock.lockNow(cur.current); close(kb); }; // keyboard picks don't lock hover: the pointer may be anywhere
  useEffect(() => { if (!open) return; const f = () => setOpen(null); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(true); };
    addEventListener('resize', f); addEventListener('keydown', k); return () => { removeEventListener('resize', f); removeEventListener('keydown', k); }; }, [open]);
  const trigger = (id: MenuId) => ({ 'aria-haspopup': 'menu' as const, 'aria-expanded': open === id, 'aria-controls': open === id ? 'hm-panel' : undefined,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'ArrowDown') { e.preventDefault(); focusIn(id, true); } },
    /* the Image / Video / Audio / 3D trigger is itself a link: following it closes a hover-open panel too */
    ...(id === 'more' ? {} : { onClick: (e: React.MouseEvent) => { if (cur.current) pick(e); }, onAuxClick: (e: React.MouseEvent) => { if (cur.current) pick(e); } }) });
  const wrap = (id: MenuId) => ({ ref: (el: HTMLDivElement | null) => { trig.current[id] = el; }, onMouseEnter: () => enter(id), onMouseLeave: leave, onFocus: () => { if (cur.current && cur.current !== id) set(id); }, onBlur: blur });
  /** Arrow keys move between rows; Tab out of the panel closes it. */
  const onPanelKey = (e: React.KeyboardEvent<HTMLDivElement>) => { const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]')]; const i = items.indexOf(document.activeElement as HTMLElement);
    const j = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : null;
    if (j != null) { e.preventDefault(); items[(j + items.length) % items.length]?.focus(); } };
  /** Panel shell. `anchor` = the trigger to sit under (Studio, More); none = the shared mega panel at the left gutter. */
  const panel = (cls: string, label: string, children: React.ReactNode, anchor?: HTMLElement | null) => { const hb = document.querySelector('header.topnav')?.getBoundingClientRect().bottom ?? 52; const r = anchor?.getBoundingClientRect();
    return createPortal(<div id="hm-panel" className={`hm-panel dd-portal ${cls}`} role="menu" aria-label={label} style={{ top: hb + 8 /* PARITY-A H-8: 8px under the bar */, left: r ? Math.max(16, r.left) : 16, '--hm-top': `${hb + 8}px` } as React.CSSProperties} onMouseEnter={keep} onMouseLeave={leave} onBlur={blur} onKeyDown={e => { onPanelKey(e); pick(e); }} onClick={pick} onAuxClick={pick}
      ref={el => { if (el && r) { const max = innerWidth - 16 - el.offsetWidth; if (r.left > max) el.style.left = `${Math.max(16, max)}px`; } }}>{children}</div>, document.body); };
  return { open, toggle, trigger, wrap, panel, anchor: (id: MenuId) => trig.current[id] ?? null };
}
type HM = ReturnType<typeof useHeaderMenus>;

/** One menu row: 48px icon tile (badge on its corner), title, one-line description. */
type Row = { key: string; to: string; title: string; desc: string; tile: React.ReactNode; badge?: Badge | null; kind?: string; on?: boolean; /** another tab it opens in ('3D') */ opensIn?: string;
  /** Models column: the maker's announcement or model page (shared/modelLinks.ts aboutLink) */ about?: string | null };
const KIND: Record<string, string> = { 'open-weights': 'Open', hosted: 'Hosted', 'hosted-direct': 'Direct' };
const MRow = ({ r }: { r: Row }) => <Link to={r.to} role="menuitem" className={`hm-row${r.on ? ' on' : ''}`} aria-current={r.on ? 'page' : undefined}>
  <span className="hm-tile" aria-hidden>{r.tile}{r.badge && <Pill b={r.badge} />}</span>
  <span className="hm-txt"><b>{r.title}{r.badge && <span className="sr-only"> ({r.badge})</span>}{r.opensIn && <span className="hm-opens" data-testid={`hm-opens-${r.key}`}><span aria-hidden>↗ </span>{r.opensIn}<span className="sr-only"> (opens the {r.opensIn} tab)</span></span>}</b><small>{r.kind && <em className={`hm-kind k-${r.kind.split(' ')[0].toLowerCase()}`}>{r.kind}</em>}{r.desc}</small></span></Link>;
const firstSentence = (d?: string) => { const m = /^.*?[.!?](?=\s|$)/.exec((d ?? '').trim()); return (m ? m[0] : d ?? '').replace(/\.$/, ''); };

/** The curated Models column for one medium, one row per MODEL (GET /api/tools → models[], keyed by a stable model key, so "MiniMax H3"
 *  is one row however many places run it; no client-side name merge). The same order as the pickers: the server's sections (Featured,
 *  API models, Local; Coming soon left out), then catalogue rank, up to MAX_MODELS. Each row links to the tool FEATURED_MODELS names
 *  for it, else the first tool that offers the model, with ?model=<model key>. The tag is the licence only: "Open" for open weights (where it runs depends on the
 *  user's setup, so no "Your computer" tag here). On hover each row shows its maker's link and, for open models, "Weights" (ModelCell). */
const BOILER = /^(hosted api|comfy cloud|runs on the provider's servers; pay per run\.?)$|, open weights$| through its vendor api$/i;
export type ModelEntry = { key: string; maker?: string | null; makerName?: string | null; title: string; to: string; open: boolean; desc: string; isNew: boolean; tools: string[]; sec: number; rank: number;
  /** The listing row (GET /api/tools models[]) and its tool: the Models page hover card reads places, licence and caps from them. */ model?: ToolModel; tool?: ToolInfo;
  /** withSoon only: why nothing runs it here yet ("Not on Comfy Router yet"); the row shows greyed with this reason. */ soon?: string | null };
/** Pick the model's compatible Audio mode, then append its key (existing workflow queries stay intact). */
const withModel = (tool: ToolInfo, model: Pick<ToolModel, 'key' | 'engines'>) => modelNavigationHref(tool, model);
/** Model sections, in the pickers' order: Featured, API models, Local (index = ModelEntry.sec). */
export const MODEL_SECTIONS = ['featured', 'api', 'gpu'] as const;
/** Every listed model for one medium (no cap), in the pickers' order. Used by the header Models column and the /models page. */
export function mediaModelEntries(media: Medium, tools: ToolInfo[], groups: ModelGroup[], opts: { /** Models page: keep coming-soon / unavailable models (greyed, with the reason) in their home section, after the live ones */ withSoon?: boolean } = {}): ModelEntry[] {
  type E = ModelEntry;
  const SEC: readonly string[] = MODEL_SECTIONS;
  const out = new Map<string, E>();
  const soon: [ToolInfo, ToolModel][] = [];
  for (const t of tools) for (const m of t.models ?? []) {
    if (/^(open weights|auto)$/i.test(m.name) || m.lifecycle === 'retiring') continue; // retiring models are never featured
    if (m.state === 'coming-soon' || m.state === 'unavailable' || m.section === 'soon') { soon.push([t, m]); continue; }
    const g = groups.find(x => x.toolId === t.id)?.models.find(x => m.engines.includes(x.id)); const hint = (g?.hint ?? '').trim();
    const e = out.get(m.key) ?? { key: m.key, maker: m.maker, makerName: m.makerName, title: m.displayName || m.name, to: withModel(t, m), open: m.openWeights, desc: '', isNew: false, tools: [], sec: 9, rank: 999, model: m, tool: t, soon: null }; out.set(m.key, e);
    const si = SEC.indexOf(m.section ?? (m.featured ? 'featured' : m.home ?? 'api')); e.sec = Math.min(e.sec, si < 0 ? 9 : si); e.rank = Math.min(e.rank, m.rank ?? 999);
    e.tools.push(t.id); if (!e.desc) e.desc = m.bestFor || (m.blurb ?? '').split(/(?<=\.)\s/)[0].replace(/\.$/, '') || (hint && !BOILER.test(hint) ? hint.replace(/\.$/, '') : '') || toolLine(t); e.isNew ||= !!m.isNew || !!g?.badges?.includes('new');
  }
  // Models page: models nothing runs here yet, greyed in their home section (Local when only this computer would run them) after the live ones
  if (opts.withSoon) for (const [t, m] of soon) { if (out.has(m.key)) { out.get(m.key)!.tools.push(t.id); continue; }
    out.set(m.key, { key: m.key, maker: m.maker, makerName: m.makerName, title: m.displayName || m.name, to: withModel(t, m), open: m.openWeights, isNew: false, tools: [t.id],
      desc: m.bestFor || (m.blurb ?? '').split(/(?<=\.)\s/)[0].replace(/\.$/, ''), sec: m.runsOn.some(r => r.id === 'local') ? 2 : 1, rank: 1000 + (m.rank ?? 999), model: m, tool: t,
      soon: m.runsOn.find(r => r.reason)?.reason ?? m.rowStatus?.text ?? 'Coming soon' }); }
  // the pickers' order (server models[].section, then catalogue rank): Featured, API models, Local; Coming soon is left out.
  // FEATURED_MODELS only names the tool a model's link opens (Re-shoot for LTX-2 19B, Object Swap for Wan Animate…).
  for (const [toolId, key] of FEATURED_MODELS[media] ?? []) { const t = tools.find(x => x.id === toolId); const e = out.get(key); if (t && e && !e.soon) e.to = withModel(t, t.models?.find(x => x.key === key) ?? { key, engines: [] }); }
  return [...out.values()].sort((a, b) => a.sec - b.sec || a.rank - b.rank || a.title.localeCompare(b.title));
}
/** The tag a model row carries: "Local" for the Local section, "Open" for other open-weights models. */
export const modelKind = (e: ModelEntry) => e.sec === 2 ? LOCAL_LABEL : e.open ? KIND['open-weights'] : '';
/** Up to MAX_MODELS models for the header column: a mix, the top cloud (Featured + API) models first, then the top "Local" models
 *  (GPU_SLOTS of them when the medium has that many; empty slots go back to the other side). */
const GPU_SLOTS = 4;
export function mediaModels(media: Medium, tools: ToolInfo[], groups: ModelGroup[]) {
  const all = mediaModelEntries(media, tools, groups); const gpu = all.filter(e => e.sec === 2), cloud = all.filter(e => e.sec !== 2);
  const nGpu = Math.min(gpu.length, Math.max(GPU_SLOTS, MAX_MODELS - cloud.length)); const nCloud = Math.min(cloud.length, MAX_MODELS - nGpu);
  const first = MENU_MODELS_FIRST[media] ?? []; const picked = [...cloud.slice(0, nCloud), ...gpu.slice(0, MAX_MODELS - nCloud)];
  const pinned = first.map(k => all.find(e => e.key === k)).filter((e): e is ModelEntry => !!e); /* pinned first, the rest in catalogue order, still MAX_MODELS */
  return [...pinned, ...picked.filter(e => !first.includes(e.key))].slice(0, MAX_MODELS).map((e): Row => ({ key: e.key, to: e.to, title: e.title, kind: e.open && e.maker !== 'openhiggsfield' ? KIND['open-weights'] : '', desc: e.desc || '', badge: e.isNew ? 'new' : null,
    about: aboutLink(e.key),
    tile: <MakerTile maker={e.maker} makerName={e.makerName} fallback={e.title} medium={media} /> }));
}
const toolLine = (t: ToolInfo) => TOOL_TAGLINE[t.id] || firstSentence(t.description);

/** Image / Video / Audio trigger. Hovering any of the three shows the same shared panel; only its content swaps. */
function MediaTrigger({ id, label, to, icon: I, on, hm }: { id: MenuId; label: string; to: string; icon: typeof ImageIcon; on: boolean; hm: HM }) {
  return <div className="nav-dd" {...hm.wrap(id)} data-testid={`nav-dd-${id}`}>
    <Link to={to} className={`top-link ${on ? 'on' : ''} ${hm.open === id ? 'open' : ''}`} {...hm.trigger(id)}><I size={14} className="tl-ic" />{label}</Link>
  </div>;
}
/** Image / Video / Audio panel: Features (at most MAX_FEATURES rows, headerMenus MENU_FEATURE_ORDER; "See all N" counts every one) | Models.
 *  Each column scrolls on its own when the window is too short, so the panel never runs off the bottom. */
function MegaPanel({ media, tools, all, groups, path, hm }: { media: MenuId; tools: ToolInfo[]; all: ToolInfo[]; groups: ModelGroup[]; path: string; hm: HM }) {
  const every: Row[] = menuFeatures(media as Medium, all, tools, IMAGE_FEATURES).map(r => ({ key: r.key, to: r.to, title: r.name, desc: r.line, badge: r.badgeTool ? badgeOf(r.badgeTool) : null, on: routeOn(r.to, path) || (!!r.home && routeOn(r.home, path)), tile: r.tile(22), opensIn: r.opensIn }));
  const tr = menuFeatureRows(media as Medium, every);
  const mr = mediaModels(media as Medium, tools, groups); const allTo = menuSeeAllHref(media as Medium);
  return hm.panel('hm-mega', `${media[0].toUpperCase()}${media.slice(1)} tools and models`, <div className="hm-cols" data-media={media}>
    <section className="hm-col hm-col-features"><div className="hm-h-row"><h4 className="hm-h">Features</h4>
      <Link to={allTo} role="menuitem" className="hm-see-all" data-testid="hm-all-tools" aria-current={path === allTo ? 'page' : undefined}>See all {every.length}<span className="sr-only"> {media === 'image' ? 'image features' : `${media === '3d' ? '3D' : media} workflows`}</span><span aria-hidden className="hm-all-chev">›</span></Link></div>
      <div className="hm-scroll">{tr.map(r => <MRow key={r.key} r={r} />)}</div></section>
    <section className="hm-col hm-col-models"><h4 className="hm-h">Models</h4><div className="hm-scroll"><div className="hm-mgrid">{mr.map(r => <ModelCell key={r.key} r={r} />)}</div>{!mr.length && <p className="hm-empty">Models load with the server.</p>}</div>
      <div className="hm-mfoot">{mr.some(r => r.kind) && <span className="hm-legend" data-testid="hm-models-legend"><em className="hm-kind k-open">{KIND['open-weights']}</em>Open weights you can run yourself</span>}
        <Link to={`/models?media=${media}`} role="menuitem" className="hm-all" data-testid="hm-all-models">See all models<span aria-hidden className="hm-all-chev">›</span></Link></div></section>
  </div>);
}

/** A Models-column row plus one outside link, "About ↗": the maker's announcement or model page (shared/modelLinks.ts aboutLink).
 *  It shows on hover or focus at the right of the title line, so the description keeps the full width; beside the row's own link, never
 *  inside it (no nested anchors). New tab, noopener. Papers, model files and API docs live in the hover cards. */
function ModelCell({ r }: { r: Row }) {
  return <div className={`hm-mcell${r.about ? ' has-link' : ''}`}>
    <MRow r={r} />
    {r.about && <a className="hm-ext" href={r.about} target="_blank" rel="noopener noreferrer" role="menuitem" data-testid={`hm-about-${r.key}`}>
      About<span aria-hidden> ↗</span><span className="sr-only"> {r.title} (opens in a new tab)</span></a>}
  </div>;
}

/** Grouped header dropdown (Studio, More): one label, its destinations as a single column of rows. */
type NavItem = { to: string; label: string; desc: string; icon: React.ReactNode; badge?: Badge; on: boolean };
function NavMenu({ id, label, items, testid, hm }: { id: MenuId; label: string; items: NavItem[]; testid: string; hm: HM }) {
  return <div className="nav-dd tn-group" {...hm.wrap(id)} data-testid={testid}>
    <button type="button" {...hm.trigger(id)} className={`top-link more-link ${items.some(i => i.on) ? 'on' : ''} ${hm.open === id ? 'open' : ''}`} onClick={() => hm.toggle(id)}>{label}<svg aria-hidden className="tn-caret" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.5 6 7.5l3-3" /></svg></button>
    {hm.open === id && hm.panel('hm-list-panel', label, items.map(i => <MRow key={i.to} r={{ key: i.to, to: i.to, title: i.label, desc: i.desc, tile: i.icon, badge: i.badge, on: i.on }} />), hm.anchor(id))}
  </div>;
}
const glyph = (d: string) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;

/** Mid-width header (S-05): instead of letting the strip run under the right cluster, lower-priority slots fold into More one step at a time
 *  until the header fits. Steps (cumulative, lowest priority first): 1 Self-host / Docs and the Pricing tag · 3 Workflows ·
 *  4 compact Spend and Assets (icon only, label kept for screen readers) · 5 Pricing · 6 Studio. Measured, not breakpoints, because the right
 *  cluster's width depends on mode (spend vs credits, the open-weights pill). Steps are written to data-fold on the header ("1 2 3"), which
 *  the CSS reads; the step count also feeds More's extra rows. At ≥1200 the default header fits, so it stays at step 0. */
const FOLD_MAX = 5;
function useHeaderFold() {
  const ref = useRef<HTMLElement>(null); const [fold, setFold] = useState(0);
  useLayoutEffect(() => { const h = ref.current; const links = h?.querySelector<HTMLElement>('.topnav-links'); const right = h?.querySelector<HTMLElement>('.topnav-right'); if (!h || !links || !right) return;
    const put = (n: number) => { h.dataset.fold = Array.from({ length: n }, (_, i) => i + 1).join(' '); };
    const fits = () => links.scrollWidth <= links.clientWidth + 1 && h.scrollWidth <= h.clientWidth + 1;
    const measure = () => { if (!h.offsetWidth) { put(0); setFold(0); return; } /* phone: the header is display:none */
      let n = 0; for (; n < FOLD_MAX; n++) { put(n); if (fits()) break; } put(n); setFold(n); };
    /* re-measure when the viewport, the right cluster or any slot changes size (spend/credits loading, web font swap) */
    const ro = new ResizeObserver(measure); [h, right, ...links.children].forEach(el => ro.observe(el)); measure(); document.fonts?.ready.then(measure).catch(() => undefined); return () => ro.disconnect(); }, []);
  return { ref, fold };
}

/** Desktop header. Slot order follows the reference structure with our own labels:
 *  Explore · Image▾ · Video▾ · Audio▾ · Workflows · More▾ (presets, plugins, MCP, API)  |  search · credits · Pricing · Self-host / Docs · Assets · avatar. Fits 1280 with no sideways scroll. */
export function TopNav({ tools, path }: { tools: ToolInfo[]; path: string }) {
  const [groups, setGroups] = useState<ModelGroup[]>([]);
  useEffect(() => { fetchMenuModels().then(d => setGroups(d.groups)).catch(() => undefined); }, []);
  const ofMedia = (m: string) => tools.filter(t => mediaOf(t) === m && (t as any).listed !== false);
  const [search, setSearch] = useState(false); const lf = useLocalFree(); const rtgS = useRouting();
  const [scrolled, setScrolled] = useState(false); useEffect(() => { const f = () => setScrolled(s => s ? scrollY > 8 : scrollY > 32); /* hysteresis: no flip-flop at the threshold */ f(); addEventListener('scroll', f, { passive: true }); return () => removeEventListener('scroll', f); }, []);
  const credits = useCredits(); const own = useOwnAccounts();
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearch(true); } }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, []);
  const byId = (id: string) => tools.find(t => t.id === id);
    const on = (p: string) => path === p || path.startsWith(p + '/');
  const T = (id: string, label: string, badge?: Badge) => { const t = byId(id); return t ? <Link key={id} to={t.route} className={`top-link ${path.startsWith(t.route) ? 'on' : ''}`}><ToolIconFor id={t.id} ui={t.ui} size={14} className="tl-ic" />{label}{badge && <Pill b={badge} />}</Link> : null; };
  const L = (to: string, label: string, badge?: Badge, cls = '') => <Link key={to} to={to} className={`top-link ${cls} ${on(to) ? 'on' : ''}`}>{label}{badge && <Pill b={badge} />}</Link>;
  const under = (r: string) => path === r || path.startsWith(r + '/'); /* /tools/camera-lens is not under /tools/camera */
  /* H-1: the medium of the hub page or tool page you're on lights its nav item (same rule as the phone tab bar) */
  const curMedia = ['/workflows', '/community', '/plugins', '/mcp', '/api-docs'].some(on) ? null : routeMedia(tools, path);
  /* E3: like the reference, a click goes straight into the main tool (hover still opens the panel; its "See all" row keeps the hub) */
  const toolRoute = (id: string, hub: string) => byId(id)?.route ?? hub;
  const imgTools = ofMedia('image'), vidTools = ofMedia('video'), audTools = ofMedia('audio'), d3Tools = ofMedia('3d');
  const bp = (id: string) => badgeOf(byId(id)) ?? undefined; const qs = useSearch(); const hm = useHeaderMenus(path, qs); const { ref: hdr, fold } = useHeaderFold();
  return (
    <header ref={hdr} className={`topnav hn ${scrolled ? 'hn-scrolled' : ''}`}>
      <Link to="/" className="wordmark hn-logo" aria-label="Imagination Is All You Need"><Wordmark /></Link>
      <nav className="topnav-links" aria-label="Main">
        <Link to="/" className={`top-link ${path === '/' ? 'on' : ''}`}>Explore</Link>
        <MediaTrigger id="image" label="Image" to={toolRoute('create-image', '/image')} icon={ImageIcon} hm={hm} on={curMedia === 'image'} />
        <MediaTrigger id="video" label="Video" to={toolRoute('h3-video', '/video')} icon={VideoIcon} hm={hm} on={curMedia === 'video'} />
        <MediaTrigger id="audio" label="Audio" to={toolRoute('audio', '/audio')} icon={AudioIcon} hm={hm} on={curMedia === 'audio'} />
        {d3Tools.length > 0 && <MediaTrigger id="3d" label="3D" to={toolRoute('three-d', THREE_D_PAGE)} icon={CubeIcon} hm={hm} on={curMedia === '3d'} /> /* 3D (2026-10-23): after Audio */}
        {L(CANVAS_NAV.to, CANVAS_NAV.label, undefined, 'hn-canvas')}{/* Canvas (2026-10-24): after 3D, a plain tab */}
        {L(FILM_NAV.to, FILM_NAV.label, undefined, 'hn-film')}{/* Film (2026-10-27): after Canvas, a plain tab */}
        {(hm.open === 'image' || hm.open === 'video' || hm.open === 'audio' || hm.open === '3d') && (() => { const ts = hm.open === 'image' ? imgTools : hm.open === 'video' ? vidTools : hm.open === '3d' ? d3Tools : audTools; return ts.length ? <MegaPanel media={hm.open} tools={ts} all={tools} groups={groups} path={path} hm={hm} /> : null; })()}
        {(() => { const ti = (id: string, label?: string): NavItem | null => { const t = byId(id); return t ? { to: t.route, label: label ?? t.name, desc: toolLine(t), icon: <ToolIconFor id={t.id} ui={t.ui} size={22} />, badge: bp(id), on: under(t.route) } : null; };
          const folded: NavItem[] = [...(fold >= 3 ? [{ to: '/workflows', label: 'Workflows', desc: 'Every workflow, with where it comes from', icon: glyph('M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'), on: on('/workflows') }] : [])];
          const tail: NavItem[] = [
            ...(fold >= 1 ? [{ to: REPO_URL, label: 'Docs (GitHub)', desc: 'Install steps, hardware and guides', icon: glyph('M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01'), on: false }] : [])];
          return <>
        {L('/workflows', 'Workflows', undefined, 'hn-f-apps')}
        <NavMenu id="more" label="More" testid="nav-more" hm={hm} items={[...folded,
          { to: '/models', label: 'Models', desc: 'Every model, what it makes, open or not, and where it runs', icon: glyph('M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9'), on: on('/models') }, /* Models page (2026-10-28): first, so it's easy to find */
          { to: '/assets/brands', label: 'Brands', desc: 'Your brand profiles: colours, fonts and mood on every result; export to Figma, Canva and code', icon: <BrandIcon size={22} />, on: on('/assets/brands') }, /* Brands (2026-10-27): live in Assets › Brands; this is a shortcut */
          { to: '/plugins', label: 'Plugins', desc: 'Add workflows and models', icon: glyph('M9 3v4M15 3v4M6 7h12v5a6 6 0 0 1-12 0zM12 18v3'), on: on('/plugins') },
          { to: '/mcp', label: 'MCP', desc: 'Let your AI assistant run tools for you', icon: glyph('M4 12h4l2-5 4 10 2-5h4'), badge: 'new', on: on('/mcp') },
          { to: '/api-docs', label: 'API', desc: 'HTTP endpoints for every tool and job', icon: glyph('M8 6l-5 6 5 6M16 6l5 6-5 6M13.5 4l-3 16'), badge: 'new', on: on('/api-docs') }, ...tail]} /></>; })()}
      </nav>
      <div className="topnav-right">
        <button type="button" className="tn-icon tn-search" aria-label="Search (Ctrl+K)" {...tip('Search')} onClick={() => setSearch(true)}><SearchIcon size={17} /></button>{search && createPortal(<SearchOverlay onClose={() => setSearch(false)} />, document.body)}
        <OpenWeightsOnlyPill className="tn-ow" />
        <Link to="/assets" className={`tn-btn tn-assets ${path === '/assets' || path === '/history' ? 'on' : ''}`}><AssetsIcon size={15} /><span className="tn-assets-l">Assets</span></Link>
        <AvatarMenu credits={own ? null : credits} own={own} />
      </div>
    </header>
  );
}

/** Mobile header with a hamburger drawer: every destination the desktop header has (media menus,
 *  direct tools, Pricing, Docs, Assets, credits and the account links) is reachable under 700px.
 *  Drawer: Create CTA, a flat row list, Image / Video / Audio / More accordions (the current route's group opens), a pinned "own GPU" button. */
const LOCAL_SETUP = GPU_SETTINGS;
type DrawerGroup = 'image' | 'video' | 'audio' | 'more';
const VIDEO_PAGES = /^\/tools\/h3-video(\/|$)/; /* the one Video page (every video workflow is ?workflow= on it; the old galleries and hubs redirect here) */
const routeMedia = (tools: ToolInfo[], path: string): Medium | null => (['image', 'video', 'audio'] as Medium[]).find(m => path === `/${m}`) ?? (MENU_FEATURES.some(f => f.route === path) ? 'image' : null) ?? (VIDEO_PAGES.test(path) ? 'video' : null) ?? (() => { const t = tools.find(t => path === t.route || path.startsWith(t.route + '/')); return t ? mediaOf(t) as Medium : null; })();
export function MobileTop({ title, tools = [], path = '' }: { title: string; tools?: ToolInfo[]; path?: string }) {
  const [open, setOpen] = useState(false); const credits = useCredits(); const own = useOwnAccounts(); const today = useSpendDay()?.totals.spentUsd ?? null; const btn = useRef<HTMLButtonElement>(null); const panel = useRef<HTMLDivElement>(null);
  const [exp, setExp] = useState<DrawerGroup | null>(null); const [acctOpen, setAcctOpen] = useState(false); const prof = useProfile();
  const close = () => { setOpen(false); btn.current?.focus(); };
  useEffect(() => { setOpen(false); setAcctOpen(false); }, [path]);
  useEffect(() => { if (!open) return; document.body.classList.add('m-drawer-open'); panel.current?.querySelector<HTMLElement>('a,button')?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; addEventListener('keydown', k);
    return () => { document.body.classList.remove('m-drawer-open'); removeEventListener('keydown', k); }; }, [open]);
  const media = (m: string) => tools.filter(t => mediaOf(t) === m && (t as any).listed !== false);
  const on = (to: string) => path === to || path.startsWith(to + '/');
  // One active row: a link with ?query is active only when that query is current; the bare path only when no section query is set.
  const isOn = (to: string) => { const [pth, q] = to.split(/[?#]/); const cur = new URLSearchParams(location.search); if (q && to.includes('?')) { const want = new URLSearchParams(q); return pth === path && [...want].every(([k, v]) => cur.get(k) === v); } return on(pth) && !(pth === '/assets' && cur.get('section')) && !(pth === '/' && path !== '/'); };
  const more: [string, string][] = [[CANVAS_NAV.to, CANVAS_NAV.label], [FILM_NAV.to, FILM_NAV.label], ['/workflows', 'Workflows'], ['/models', 'Models'], ['/assets/brands', 'Brands'], ['/plugins', 'Plugins'], ['/api-docs', 'API'], ['/licenses', 'Models & licences'], ['/account/usage', own ? 'Spend' : 'Usage'], ['/assets?section=Projects', 'Projects'], ['/assets?section=Favourites', 'Favourites'], ['/settings', 'Settings'], ['/profile', 'View profile']];
  const curGroup: DrawerGroup | null = ((m0) => (m0 === '3d' ? null : m0))(routeMedia(tools, path)) ?? (more.some(([to]) => isOn(to)) ? 'more' : null); /* 3D has no drawer group yet (desktop first) */
  const openMenu = () => { setExp(curGroup); setOpen(true); };
  const A = (to: string, label: React.ReactNode, icon?: React.ReactNode, extra?: React.ReactNode, key?: string) => <Link key={key ?? to} to={to} className={`md-link md-row ${isOn(to) ? 'on' : ''}`} aria-current={isOn(to) ? 'page' : undefined}>{icon && <span className="md-ic" aria-hidden>{icon}</span>}<span className="md-lbl">{label}</span>{extra}</Link>;
  const acc = (id: DrawerGroup, h: string, icon: React.ReactNode, body: React.ReactNode) => <section className={`md-acc ${exp === id ? 'open' : ''}`} key={id}>
    <button type="button" className="md-acc-h" aria-expanded={exp === id} aria-controls={`md-acc-${id}`} onClick={() => setExp(e => e === id ? null : id)}><span className="md-ic" aria-hidden>{icon}</span><span className="md-lbl">{h}</span>{curGroup === id && <span className="md-dot" aria-label="current section" />}<svg className="md-chev" aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg></button>
    {exp === id && <div className="md-acc-b" id={`md-acc-${id}`}>{body}</div>}</section>;
  const rowsOf = (m: Medium) => menuFeatures(m, tools, media(m)); /* the same builder as the header panel */
  const toolRows = (m: Medium, all: string) => <>{rowsOf(m).map(r => <Link key={r.key} to={r.to} className={`md-tool ${routeOn(r.to, path) || (!!r.home && routeOn(r.home, path)) ? 'on' : ''}`} aria-current={routeOn(r.to, path) || (!!r.home && routeOn(r.home, path)) ? 'page' : undefined}><span className="md-tic" aria-hidden>{r.tile(18)}</span><span className="md-ttxt"><b>{r.name}</b><small>{r.line}</small></span></Link>)}
    <Link to={`/${m}`} className={`md-tool md-all ${path === `/${m}` ? 'on' : ''}`}><span className="md-ttxt"><b>{all}</b></span><span aria-hidden>›</span></Link></>;
  const create = tools.find(t => t.id === 'h3-video');
  return <header className="m-top">
    <button ref={btn} type="button" className="m-burger" aria-label="Open menu" aria-expanded={open} aria-controls="m-drawer" data-testid="m-burger" onClick={openMenu}><span /><span /><span /></button>
    <Link to="/" className="wordmark" aria-label="Imagination Is All You Need"><Wordmark compact /></Link><span className="m-title">{title}</span>
    {own ? <Link to="/account/usage" className="m-credits m-spend" data-testid="m-spend-pill" aria-label={`Spend today ${fmtUsd(today ?? 0)}`}>{fmtUsd(today ?? 0)}<small className="helper"> today</small></Link> : own === false && credits != null && <Link to="/account/usage" className="m-credits" aria-label={`Team balance ${ledgerUsd(credits)}`}>{ledgerUsd(credits)}</Link>}
    {open && createPortal(<div className="m-drawer-scrim" onMouseDown={e => e.target === e.currentTarget && close()}>
      <div ref={panel} id="m-drawer" className="m-drawer" role="dialog" aria-modal="true" aria-label="Menu" data-testid="m-drawer">
        <div className="md-scroll">
          <div className="md-head"><Link to="/" className="wordmark md-wm" aria-label="Imagination Is All You Need"><Wordmark /></Link><button type="button" className="md-x" aria-label="Close menu" onClick={close}>✕</button></div>
          <Link to={create?.route ?? '/video'} className="md-create" data-testid="md-create"><span className="md-plus" aria-hidden>+</span><span className="md-lbl">Make something<small>Video</small></span><span aria-hidden>›</span></Link>
          <nav aria-label="Main">
            <div className="md-flat">{A('/', 'Explore', <ExploreIcon size={18} />)}{A('/assets', 'Assets', <AssetsIcon size={18} />)}              {A('/mcp', 'MCP', glyph('M4 12h4l2-5 4 10 2-5h4'), <span className="md-pill">Connect</span>)}{A(REPO_URL, 'GitHub', glyph('M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01'))}</div>
            <div className="md-accs">{acc('image', 'Image', <ImageIcon size={18} />, toolRows('image', 'All image tools'))}{acc('video', 'Video', <VideoIcon size={18} />, toolRows('video', 'All video tools'))}{acc('audio', 'Audio', <AudioIcon size={18} />, toolRows('audio', 'All audio tools'))}
              {acc('more', 'More', <MoreIcon size={18} />, more.map(([to, l]) => <Link key={to} to={to} className={`md-tool md-sub ${isOn(to) ? 'on' : ''}`} aria-current={isOn(to) ? 'page' : undefined}><span className="md-ttxt"><b>{l}</b></span></Link>))}</div>
          </nav>
        </div>
        <div className="md-foot"><p>Free and private: run open models on your computer.</p><Link to={LOCAL_SETUP} className="md-gpu" data-testid="md-gpu">Set up your computer</Link>
          {/* PB-31: the account card sits at the bottom of the drawer and opens in place (profile, spend, settings) */}
          <div className={`md-acct-card${acctOpen ? ' open' : ''}`} data-testid="md-acct-card">
            {acctOpen && <div id="md-acct-list" className="md-acct-list">{([['/profile', 'View profile', UserIcon], ['/account/usage', own ? 'Spend' : 'Usage', UsageIcon], ['/settings', 'Settings', SettingsIcon]] as [string, string, typeof UserIcon][]).map(([to, l, I]) => <Link key={to} to={to} className={`md-acct-row${isOn(to) ? ' on' : ''}`} aria-current={isOn(to) ? 'page' : undefined}><span className="md-ic" aria-hidden><I size={18} /></span><span className="md-lbl">{l}</span></Link>)}</div>}
            <button type="button" className="md-acct" data-testid="md-acct" aria-expanded={acctOpen} aria-controls="md-acct-list" onClick={() => setAcctOpen(o => !o)}><span className="hm-av" aria-hidden><UserAvatar profile={prof} size="100%" /></span><span><b>{nameOf(prof)}</b><small>{own ? `Spend today ${fmtUsd(today ?? 0)}` : credits != null ? `${ledgerUsd(credits)} left` : 'Runs on your computer'}</small></span>
              <svg className="md-chev" aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10l4-4 4 4" /></svg></button>
          </div></div>
      </div></div>, document.body)}
  </header>;
}

/** Bottom tab bar: the desktop nav's Explore / Image / Video / Audio / Assets; a tool page lights its medium. */
export function MobileTabs({ tools, path }: { tools: ToolInfo[]; path: string }) {
  const m = routeMedia(tools, path);
  const T = (to: string, label: string, I: typeof ImageIcon, on: boolean) => <Link to={to} className={`m-tab ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined}><I size={22} /><span>{label}</span></Link>;
  return (
    <nav className="m-tabs" aria-label="Main">
      {T('/', 'Explore', ExploreIcon, path === '/')}{T('/image', 'Image', ImageIcon, m === 'image')}{T('/video', 'Video', VideoIcon, m === 'video')}{T('/audio', 'Audio', AudioIcon, m === 'audio')}
      {T('/assets', 'Assets', AssetsIcon, path === '/assets' || path === '/history' || path.startsWith('/jobs/'))}
    </nav>
  );
}

/** "$12.40" → ["$", "12.40"]: the big stat number sets its unit small. */
const splitUsd = (t: string): [string, string] => { const m = /^(-?)\$(.+)$/.exec(t); return m ? [`${m[1]}$`, m[2]] : ['', t]; };
/** The account menu's stat card (own-accounts mode): today's spend big, this month beside it, then only balances we really know
 *  (knownBalanceUsd: read from the provider, never a sample; Comfy's $0 reading is unknown). Comfy connected but unknown → a quiet
 *  "check your balance" link to Comfy's own page. The card opens Spend; "See costs" opens Pricing. */
function SpendBlock() {
  const day = useSpendDay(); const month = useSpendMonth(); const acc = useAccounts();
  const known = (acc?.accounts ?? []).flatMap(a => { const usd = knownBalanceUsd(a); return usd == null ? [] : [{ a, usd }]; });
  const comfy = acc?.accounts.find(a => a.provider === 'comfy' && a.connected && knownBalanceUsd(a) == null);
  const today = day ? fmtUsd(day.totals.spentUsd) : '—'; const mon = month ? fmtUsd(month.totals.spentUsd) : '—'; const [unit, num] = splitUsd(today);
  return <div className="am-card" data-testid="hm-spend">
    <Link to="/account/usage" role="menuitem" className="am-card-main" data-testid="hm-spend-link" aria-label={`Spend: ${today} today, ${mon} this month`}>
      <span className="am-card-k">Spend today<span aria-hidden className="am-chev">›</span></span>
      <span className="am-card-v"><span className="am-num" data-testid="hm-spend-today"><small>{unit}</small>{num}</span><span className="am-kv"><small>This month</small><b>{mon}</b></span></span>
    </Link>
    {(known.length > 0 || comfy) && <ul className="am-bal" role="group" aria-label="Account balances" data-testid="hm-accounts">
      {known.map(({ a, usd }) => <li key={a.provider} role="none" title={balanceDetail({ units: a.balance ?? null, unitLabel: a.balanceUnit ?? null, plan: a.provider === 'comfy' ? comfyPlanNow() : null, checked: ago(a.fetchedAt) }) ?? undefined}><span>{a.name}</span><b>{balanceText(usd)}</b></li>)}
      {comfy && <li role="none" data-testid="hm-comfy-check"><span>Comfy Cloud</span>{comfy.billingUrl
        ? <a href={comfy.billingUrl} target="_blank" rel="noreferrer" role="menuitem" className="am-q">Check your balance<span aria-hidden> ↗</span></a> : <span>Check on Comfy</span>}</li>}
    </ul>}
    <div className="am-foot"><span>Your computer is free</span><Link to="/models" role="menuitem" className="am-q" data-testid="hm-see-costs">See costs<span aria-hidden> ›</span></Link></div>
  </div>;
}
/** The menu's cover strip: your profile cover (a brand gradient, or one of your pictures; a broken picture falls back to its gradient), else Sunrise. */
function AccountCover({ cover }: { cover: ProfileData['cover'] | undefined }) {
  const [broken, setBroken] = useState(''); const img = cover?.kind === 'image' && cover.url !== broken ? cover.url : null;
  const grad = cover?.kind === 'gradient' ? cover.id : 'sunrise';
  return <span className={`am-cover pf2-cover-${grad}`} aria-hidden data-testid="hm-cover" data-cover={img ? 'image' : grad}>{img && <span className="am-cover-img" /* own host: App's missing-media marker lands here, not on the gradient */><img src={img} alt="" onError={() => setBroken(img)} /></span>}</span>;
}
/** Account menu (PARITY-A H-2, decision 4). Opens on hover with a mouse (200 ms intent, 300 ms grace on leave so the pointer can cross the
 *  gap onto the panel; the spec's Radix-style delays) and on click; a mouse click never closes it (PB-29), a tap toggles. Keyboard: Enter/Space
 *  toggle, ArrowDown opens on the first item, arrows / Home / End move, Escape closes and returns focus, Tab out closes. */
const AV_OPEN_MS = 200, AV_CLOSE_MS = 300;
/** Avatar inside a progress ring (PARITY-A H-15): our glyph on a dark disc, an accent ring that draws in over 0.5 s. The ring is the share of
 *  credits left; full in spend mode and before the balance loads. Sizes come from the box it sits in (36 / 24 in the bar, 40 in the menu). */
const AV_C = 2 * Math.PI * 16.5;
function AvatarRing({ pct, children }: { pct: number; children: React.ReactNode }) {
  return <span className="av-ring"><svg className="av-ring-svg" viewBox="0 0 36 36" aria-hidden><circle cx="18" cy="18" r="16.5" className="av-track" />
    <circle cx="18" cy="18" r="16.5" className="av-prog" style={{ strokeDasharray: AV_C, strokeDashoffset: AV_C * (1 - pct), '--av-c': AV_C } as React.CSSProperties} /></svg>
    <span className="av-photo">{children}</span></span>;
}
function AvatarMenu({ credits, own }: { credits: number | null; own?: boolean | null }) {
  const prof = useProfile(); const name = nameOf(prof); const icon = <UserAvatar profile={prof} size="100%" />;
  const [open, setOpen] = useState(false); const start = useLedger()?.start ?? null;
  const btn = useRef<HTMLButtonElement>(null); const menu = useRef<HTMLDivElement>(null); const tIn = useRef<number>(); const tOut = useRef<number>(); const at = useRef(0); const cur = useRef(false); cur.current = open; const ptr = useRef('');
  const clear = () => { clearTimeout(tIn.current); clearTimeout(tOut.current); };
  const set = (v: boolean) => { clear(); if (v && !cur.current) at.current = Date.now(); setOpen(v); };
  const items0 = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
  const openAt = (i: number) => { set(true); requestAnimationFrame(() => { const xs = items0(); xs[(i + xs.length) % xs.length]?.focus(); }); };
  useEffect(() => () => clear(), []);
  useEffect(() => { if (!open) return; const d = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.tn-menu-wrap')) setOpen(false); }; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { const inside = !!(document.activeElement as HTMLElement | null)?.closest?.('.tn-menu-wrap'); setOpen(false); if (inside) btn.current?.focus(); } }; addEventListener('mousedown', d); addEventListener('keydown', k); return () => { removeEventListener('mousedown', d); removeEventListener('keydown', k); }; }, [open]);
  /** Two groups (account, then help), split by a divider. Profile is the header's link; Spend and Pricing are the stat card's. */
  const groups: [string, string, typeof UserIcon][][] = [[['/assets?section=Projects', 'Projects', ProjectsIcon], ['/assets?section=Favourites', 'Favourites', FavouritesIcon]], [['/settings', 'Settings', SettingsIcon], [REPO_URL, 'Docs (GitHub)', DocsIcon]]];
  const pct = credits != null && start ? Math.max(0, Math.min(1, credits / start)) : 1; const segs = 24; const ring = own ? 1 : pct;
  const mouse = (e: React.PointerEvent) => e.pointerType === 'mouse';
  /** Picking a row (click, middle / cmd-click, Enter, Space via onKeyDown) closes the menu at once (shared/hoverMenuLock.ts); hover reopens
   *  it only after the pointer leaves the wrap and comes back (pointerenter). Keyboard picks put focus back on the avatar. */
  const pickAv = (e: React.MouseEvent) => { if (!(e.target as HTMLElement).closest('a[href]') || !isMenuActivation(e)) return; set(false); if (e.type === 'click' && e.detail === 0) btn.current?.focus(); };
  const onMenuKey = (e: React.KeyboardEvent) => { const xs = items0(); const i = xs.indexOf(document.activeElement as HTMLElement);
    const j = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? xs.length - 1 : null;
    if (j != null && xs.length) { e.preventDefault(); xs[(j + xs.length) % xs.length]?.focus(); } };
  return <div className="tn-menu-wrap" data-testid="account-menu-wrap"
    onPointerEnter={e => { if (!mouse(e)) return; clear(); if (!cur.current) tIn.current = window.setTimeout(() => set(true), AV_OPEN_MS); }}
    onPointerLeave={e => { if (!mouse(e)) return; clear(); if (cur.current) tOut.current = window.setTimeout(() => setOpen(false), AV_CLOSE_MS); }}
    onBlur={e => { const r = e.relatedTarget as HTMLElement | null; if (r && !e.currentTarget.contains(r)) setOpen(false); }}>
    <button ref={btn} type="button" className="tn-avatar" aria-label={`Account menu, ${name}`} aria-haspopup="menu" data-testid="account-avatar" aria-expanded={open} aria-controls={open ? 'tn-account-menu' : undefined}
      onPointerDown={e => { ptr.current = e.pointerType; }}
      onClick={e => { const kb = e.detail === 0; /* Enter / Space */
        /* PB-29: with a mouse, hover already opened it, so a click only ever opens (it never flashes shut); click outside, Escape or leaving closes.
         *  Touch has no hover: a tap toggles. Keyboard: Enter / Space toggle. */
        if (kb) { if (cur.current) set(false); else openAt(0); return; }
        if (ptr.current === 'mouse') { if (!cur.current) set(true); return; }
        if (cur.current && Date.now() - at.current > 500) set(false); else set(true); }}
      onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); openAt(0); } else if (e.key === 'ArrowUp') { e.preventDefault(); openAt(-1); } }}><AvatarRing pct={ring}>{icon}</AvatarRing></button>
    {open && <div ref={menu} id="tn-account-menu" className="tn-menu hn-menu am" role="menu" aria-label="Account" onKeyDown={e => { onMenuKey(e); const a = (e.target as HTMLElement).closest<HTMLElement>('a[href]'); if (a && e.key === ' ') { e.preventDefault(); a.click(); } }}
      onClick={e => pickAv(e)} onAuxClick={e => pickAv(e)}>
      <div className="am-head"><AccountCover cover={prof?.cover} />
        <div className="am-id"><span className="am-av" aria-hidden><AvatarRing pct={ring}>{icon}</AvatarRing></span>
          <Link to="/profile" role="menuitem" className="am-q am-view" data-testid="hm-view-profile">View profile<span aria-hidden> ›</span></Link></div>
        <b className="am-name" data-testid="hm-acct-name" title={name}>{name}</b>
        <small className="am-sub">{prof?.handle && prof.displayName ? `@${prof.handle}` : 'Runs on your computer'}</small></div>
      {own ? <SpendBlock /> : own === false && <div className="am-card" data-testid="hm-credits">
        <Link to="/account/usage" role="menuitem" className="am-card-main" aria-label={`Team balance: ${credits != null ? ledgerUsd(credits) : 'unknown'} left`}>
          <span className="am-card-k">Team balance<span aria-hidden className="am-chev">›</span></span>
          <span className="am-card-v"><span className="am-num">{credits != null ? ledgerUsd(credits) : '—'}</span></span>
          <span className="am-segs" aria-hidden>{Array.from({ length: segs }, (_, i) => <i key={i} className={i < Math.round(pct * segs) ? 'on' : ''} />)}</span></Link>
        <div className="am-foot"><span>Your computer is free</span><Link to="/models" role="menuitem" className="am-q">See costs<span aria-hidden> ›</span></Link></div></div>}
      <div role="none" className="am-list">{groups.map((g, k) => <div role="none" key={k} className="am-grp">{k > 0 && <hr role="separator" className="am-sep" />}
        {g.map(([to, l, I]) => <Link key={l} to={to} role="menuitem" className="am-row"><span className="am-ic" aria-hidden><I size={16} /></span>{l}</Link>)}</div>)}</div>
    </div>}</div>;
}
function useCredits() {
  return useLedger()?.balance ?? null;
}
