/**
 * The model menu's pure helpers (ModelMenu.tsx). No React, so server/test/model-menu-sort.test.ts can run them.
 * Used by the quiet menu (2026-10-24): placesIn / groupOf (the All · Local · Comfy · Your keys row), cheapestOf (a family's "from" price),
 * menuSearchText / matchesQuery, familiesOf, familyFrom. The chips and sorts below are no longer shown (the menu has no filters or sort);
 * they stay for their tests and any later use.
 *  - Chips per tab: All / Comfy → by maker; API → by provider (the place a route runs on: fal, Replicate, BFL, OpenAI…); Local →
 *    Installed · Needs download. Multi-select (a model matches when it has any chosen value).
 *  - Sort: Recommended (the server's order) · Price: low to high (each model at its CHEAPEST place in this tab, from the row quotes, which
 *    are already for this run's settings) · Newest (releasedAt, else the isNew flag) · Best quality (our own editorial order,
 *    server/src/shared/qualityRank.ts; the editing order when a photo is attached).
 *    Ties keep the recommended order; unknown prices / undated / unranked models go last in the recommended order.
 */
import type { ToolModel, RunOnRow } from './models';
import { LOCAL_LABEL } from '../../../server/src/shared/modelIds';

export type MenuTab = 'all' | 'comfy' | 'api' | 'gpu';
export type MenuSort = 'recommended' | 'price' | 'newest' | 'quality';
export const SORTS: { id: MenuSort; label: string }[] = [
  { id: 'recommended', label: 'Best match' }, { id: 'price', label: 'Price: low to high' }, { id: 'newest', label: 'Newest' }, { id: 'quality', label: 'Best quality' },
];

/** A place's tab: the server's group (gpu · comfy · api), else from its id (older servers). */
export const groupOf = (r: Pick<RunOnRow, 'id' | 'group'>): Exclude<MenuTab, 'all'> => r.group ?? (r.id === 'local' ? 'gpu' : r.id === 'comfy-cloud' ? 'comfy' : 'api');
export const livePlace = (r: Pick<RunOnRow, 'status'>) => r.status !== 'coming-soon' && r.status !== 'unavailable';
/** The places a model has in a tab, in the server's order (a coming-soon or unavailable place isn't one). */
export const placesIn = (m: Pick<ToolModel, 'runsOn'>, t: MenuTab): RunOnRow[] => (t === 'all' ? [] : m.runsOn.filter(r => groupOf(r) === t && livePlace(r)));
const inTab = (m: Pick<ToolModel, 'runsOn'>, t: MenuTab, placeId: string) => { const r = m.runsOn.find(x => x.id === placeId); const g = r ? groupOf(r) : groupOf({ id: placeId });
  return (t === 'all' || g === t) && (!r || livePlace(r)); };

// ---------------------------------------------------------------- filter chips
/** Short chip names for makers whose catalogue name is long. */
const MAKER_SHORT: Record<string, string> = { bfl: 'BFL', 'alibaba-qwen': 'Qwen', 'alibaba-wan': 'Wan', kling: 'Kling', 'tencent-hunyuan': 'Hunyuan', luma: 'Luma', tongyi: 'Tongyi' };
/** Short provider names (the menu's own RUN_ON_CHIP words), duplicated here to keep this file free of React. */
const PLACE_SHORT: Record<string, string> = { 'comfy-cloud': 'Comfy Cloud', fal: 'fal', replicate: 'Replicate', bfl: 'BFL', minimax: 'MiniMax', ltx: 'LTX', openai: 'OpenAI', google: 'Google', byteplus: 'BytePlus', dashscope: 'Alibaba', luma: 'Luma', local: LOCAL_LABEL };
export interface Chip { id: string; label: string; count: number }
const makerOf = (m: Pick<ToolModel, 'maker' | 'makerName' | 'family'>) => ({ id: m.maker || m.makerName || m.family || 'other', label: (m.maker && MAKER_SHORT[m.maker]) || m.makerName || m.family || 'Other' });
/** The local place's state for the Local chips: installed (ready), needs download, or neither (turned off, missing node…). */
export const gpuStateOf = (m: Pick<ToolModel, 'runsOn'>): 'installed' | 'download' | null => {
  const r = m.runsOn.find(x => x.id === 'local' && livePlace(x)); if (!r) return null;
  return r.status === 'ready' ? 'installed' : r.action?.kind === 'download' || r.status === 'not-installed' ? 'download' : null;
};
/** The chip values a model has in a tab. */
export function chipValues(m: ToolModel, t: MenuTab): string[] {
  if (t === 'gpu') { const s = gpuStateOf(m); return s ? [s] : []; }
  if (t === 'api') return placesIn(m, 'api').map(r => r.id);
  return [makerOf(m).id];
}
/** The chips of a tab over its models, most models first (then by name). Local: Installed, then Needs download. */
export function chipsFor(models: ToolModel[], t: MenuTab): Chip[] {
  const by = new Map<string, Chip>();
  for (const m of models) for (const v of chipValues(m, t)) {
    const label = t === 'gpu' ? (v === 'installed' ? 'Installed' : 'Needs download') : t === 'api' ? PLACE_SHORT[v] ?? m.runsOn.find(r => r.id === v)?.label ?? v : makerOf(m).label;
    const c = by.get(v); if (c) c.count++; else by.set(v, { id: v, label, count: 1 });
  }
  const out = [...by.values()];
  return t === 'gpu' ? out.sort((a, b) => (a.id === 'installed' ? -1 : 1) - (b.id === 'installed' ? -1 : 1)) : out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
export const matchesChips = (m: ToolModel, t: MenuTab, on: readonly string[]) => !on.length || chipValues(m, t).some(v => on.includes(v));

// ---------------------------------------------------------------- price: each model at its cheapest place
export interface Cheapest { usd: number; place: string; placeLabel: string; /** what the place still needs: a key, a download, turning on */ setup: 'key' | 'download' | 'setup' | null }
const usdOf = (p: { credits?: number | null; cost?: any }): number | null => (typeof p.cost?.estUsd === 'number' ? p.cost.estUsd : typeof p.credits === 'number' ? p.credits / 100 : null);
/** The cheapest place for this run in this tab: the row quote's priceRange places (runnable now, at this run's settings), the places that
 *  need a key (setupOptions, priced as once the key is added), and Local (free; 'download' when the weights aren't there yet).
 *  null = no price known (no quote yet, a sample-only model, blocked at these settings). `only`: the API tab's provider chips that are on
 *  (the price is then the cheapest among those providers). */
export function cheapestOf(m: ToolModel, rq: any, t: MenuTab, only: readonly string[] = []): Cheapest | null {
  let c: Cheapest[] = []; const label = (id: string, l?: string | null) => PLACE_SHORT[id] ?? l ?? id;
  if (t === 'all' || t === 'gpu') { const r = m.runsOn.find(x => x.id === 'local' && livePlace(x));
    if (r) c.push({ usd: 0, place: 'local', placeLabel: LOCAL_LABEL, setup: r.status === 'ready' ? null : gpuStateOf(m) === 'download' ? 'download' : 'setup' }); }
  const q = rq && typeof rq === 'object' && !rq.pending && !rq.failed ? rq : null;
  if (q && t !== 'gpu') {
    const places: any[] = Array.isArray(q.priceRange?.places) ? q.priceRange.places : [];
    for (const p of places) { const u = usdOf(p); if (u != null && p.runOn && p.runOn !== 'local' && inTab(m, t, p.runOn)) c.push({ usd: u, place: p.runOn, placeLabel: label(p.runOn, p.runOnLabel), setup: null }); }
    // older answers without priceRange: the row's own price at the place it would run
    if (!places.length && q.ok !== false && q.runnable !== false && q.demo !== true && q.needsKey !== true && q.runOn && q.runOn !== 'local' && inTab(m, t, q.runOn)) {
      const u = usdOf(q); if (u != null && q.chargeable !== false) c.push({ usd: u, place: q.runOn, placeLabel: label(q.runOn, q.runOnLabel), setup: null }); }
    if (q.needsKey === true && q.runOn && typeof q.credits === 'number' && q.credits > 0 && inTab(m, t, q.runOn)) c.push({ usd: q.credits / 100, place: q.runOn, placeLabel: label(q.runOn, q.runOnLabel), setup: 'key' });
    for (const o of Array.isArray(q.setupOptions) ? q.setupOptions : []) if (o?.action === 'add_key' && typeof o.credits === 'number' && o.credits > 0 && o.runOn && inTab(m, t, o.runOn))
      c.push({ usd: o.credits / 100, place: o.runOn, placeLabel: label(o.runOn, o.runOnLabel), setup: 'key' });
  }
  if (only.length) c = c.filter(x => only.includes(x.place));
  if (!c.length) return null;
  // cheapest; at the same price a place that runs now beats one that needs setting up
  return c.reduce((a, b) => (b.usd < a.usd - 1e-9 || (Math.abs(b.usd - a.usd) <= 1e-9 && a.setup && !b.setup) ? b : a));
}

// ---------------------------------------------------------------- sort
/** Newest: the release date, else "new" (≤ 60 days) counts as a month ago; null = undated (sorted last). */
export const newestScore = (m: Pick<ToolModel, 'releasedAt' | 'isNew'>, now = Date.now()): number | null => {
  const t = m.releasedAt ? Date.parse(m.releasedAt) : NaN; return Number.isFinite(t) ? t : m.isNew ? now - 30 * 86_400_000 : null;
};
/** Sorts a tab's models (already in the recommended order). Stable: ties and unknowns keep the recommended order, unknowns last. */
export function sortModels<T extends ToolModel>(list: T[], sort: MenuSort, o: { price?: (m: T) => Cheapest | null; rank?: (m: T) => number | null; now?: number } = {}): T[] {
  if (sort === 'recommended') return list;
  const idx = new Map(list.map((m, i) => [m, i] as const));
  const key = (m: T): [number, number] | null => {
    if (sort === 'price') { const p = o.price?.(m); return p ? [p.usd, p.setup ? 1 : 0] : null; }
    if (sort === 'newest') { const s = newestScore(m, o.now); return s == null ? null : [-s, 0]; }
    const r = o.rank?.(m); return r != null && r > 0 ? [r, 0] : null;
  };
  const ks = new Map(list.map(m => [m, key(m)] as const));
  return [...list].sort((a, b) => { const ka = ks.get(a)!, kb = ks.get(b)!;
    if (!ka || !kb) return ka ? -1 : kb ? 1 : idx.get(a)! - idx.get(b)!;
    return ka[0] - kb[0] || ka[1] - kb[1] || idx.get(a)! - idx.get(b)!; });
}

// ---------------------------------------------------------------- search and families (the quiet menu, 2026-10-24)
/** Everything a search can match on a model: names, maker (name and id), family and its line, best-for, aliases, the capability words
 *  ("edit", "mask", "4k", "1080p", "sound"…) and "free local" when it runs on your own computer. Lower case. */
export function menuSearchText(m: Partial<ToolModel>, familyLine?: string | null): string {
  const c: any = m.caps ?? {}; const caps: string[] = [];
  if (c.edit) caps.push('edit edits'); if (c.mask) caps.push('mask inpaint'); if (c.maxRefs > 1) caps.push('references refs');
  if (c.maxResolution) caps.push(String(c.maxResolution)); if (c.summary) caps.push(String(c.summary));
  const local = (m.runsOn ?? []).some(r => r.id === 'local' && livePlace(r));
  return [m.displayName, m.name, m.makerName, m.maker, m.family, familyLine, m.bestFor, ...(m.aliases ?? []), ...caps, local ? 'free local' : '', m.openWeights ? 'open weights' : '']
    .filter(Boolean).join(' ').toLowerCase();
}
/** A search matches when every word of it is in the model's search text ("google 4k" = Google models that make 4K). */
export const matchesQuery = (m: Partial<ToolModel>, q: string, familyLine?: string | null): boolean => {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return true;
  const t = menuSearchText(m, familyLine); return words.every(w => t.includes(w));
};
export interface Family<T> { family: string; models: T[] }
/** The list grouped by family, in the order each family first appears (the server's order); a model without a family is its own. */
export function familiesOf<T extends Pick<ToolModel, 'family' | 'key'>>(list: T[]): Family<T>[] {
  const by = new Map<string, Family<T>>();
  for (const m of list) { const f = m.family || m.key; const g = by.get(f); if (g) g.models.push(m); else by.set(f, { family: f, models: [m] }); }
  return [...by.values()];
}
/** A family row's price: "Free" when any version runs on your own computer (`local`: the tab shows Local places), else the lowest known price of its versions (null = none known). */
export function familyFrom<T extends Pick<ToolModel, 'runsOn'>>(models: T[], cheap: (m: T) => Cheapest | null, local = true): { free: boolean; usd: number | null } {
  if (local && models.some(m => m.runsOn.some(r => r.id === 'local' && livePlace(r)))) return { free: true, usd: 0 };
  const vals = models.map(m => cheap(m)).filter((c): c is Cheapest => !!c && c.usd > 0).map(c => c.usd);
  return { free: false, usd: vals.length ? Math.min(...vals) : null };
}

// ---------------------------------------------------------------- remembered state (localStorage; storage off = nothing remembered)
const SORT_LS = 'ohf.modelMenu.sort'; const FILT_LS = 'ohf.modelMenu.filters';
export const readSort = (): MenuSort => { try { const r = localStorage.getItem(SORT_LS); const v = r === 'top' ? 'quality' : r; /* the old Top rated sort */ return SORTS.some(s => s.id === v) ? v as MenuSort : 'recommended'; } catch { return 'recommended'; } };
export const saveSort = (s: MenuSort) => { try { localStorage.setItem(SORT_LS, s); } catch { /* not remembered */ } };
export type TabFilters = Partial<Record<MenuTab, string[]>>;
export const readFilters = (): TabFilters => { try { const v = JSON.parse(localStorage.getItem(FILT_LS) ?? '{}'); if (!v || typeof v !== 'object') return {};
  const o: TabFilters = {}; for (const t of ['all', 'comfy', 'api', 'gpu'] as const) if (Array.isArray(v[t])) o[t] = v[t].filter((x: unknown) => typeof x === 'string').slice(0, 40); return o; } catch { return {}; } };
export const saveFilters = (f: TabFilters) => { try { localStorage.setItem(FILT_LS, JSON.stringify(f)); } catch { /* not remembered */ } };

// ---------------------------------------------------------------- local first (2026-10-26: one order in every menu)
/** Runs free on your own computer: a live Local place (ready, or one download / switch away). */
export const runsLocal = (m: Pick<ToolModel, 'runsOn'>) => m.runsOn.some(r => r.id === 'local' && livePlace(r));
/** How free-and-local a model is right now: 0 = runs on your computer by default and is ready (its row says Free · Local), 1 = ready on
 *  your computer but runs elsewhere by default, 2 = could run locally after a download or switch, 3 = cloud only. */
export function localScore(m: Pick<ToolModel, 'runsOn'> & { autoRunOn?: string | null; preselect?: { runOn?: string | null } | null }): number {
  const r = m.runsOn.find(x => x.id === 'local' && livePlace(x)); if (!r) return 3; if (r.status !== 'ready') return 2;
  const home = m.autoRunOn === 'local' || m.preselect?.runOn === 'local' || m.runsOn.every(x => x.id === 'local' || !livePlace(x)); return home ? 0 : 1;
}
/** The list with the models that run free on your own computer first (localScore), each part in the server's order. Stable. */
export function localFirst<T extends Pick<ToolModel, 'runsOn'>>(list: T[]): T[] {
  return list.map((m, i) => [m, i, localScore(m)] as const).sort((a, b) => a[2] - b[2] || a[1] - b[1]).map(x => x[0]);
}
/** Featured with a free local option on top: the best local model that can do this job (`pool`, in the server's order) leads, then the
 *  featured list in its own order (a featured cloud model stays highlighted). A featured model that is already the best local one just
 *  moves to the top. No Featured list, no local model, or `skip` (a model shown above, the workflow's default) as local: unchanged. */
export function featuredLocalFirst<T extends Pick<ToolModel, 'runsOn'>>(featured: T[], pool: T[], skip?: T | null): T[] {
  if (!featured.length) return featured;
  const best = localFirst(pool)[0]; if (!best || localScore(best) > 1) return featured;
  if (skip && localScore(skip) <= localScore(best)) return featured;
  const top = localFirst(featured)[0]; if (localScore(top) <= localScore(best)) return [top, ...featured.filter(m => m !== top)];
  return [best, ...featured.filter(m => m !== best)];
}
