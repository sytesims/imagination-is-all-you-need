/**
 * Batch-1 UX data hooks (logic only; Design Planner owns the markup):
 *   useMediaPicker   GET /api/media (+ POST /api/media upload)
 *   usePrice         shared priceOf, computed locally (no round trip)
 *   useModels        GET /api/models?toolId=
 *   useMentions      shared validateMentions + removeRef renumbering
 *   useFormDraft     per-tool unsent form state in localStorage (ohf:form:<toolId>)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'; import type React from 'react';
import { priceOverrides, ToolInfo } from '../api';
import { priceOf, generateLabel, Price } from './price';
import { validateMentions, renumberMentions, mentionLabel, MentionKind } from './mentions';
import { KEY_PREFIX } from './useJobs';
import { hasModelTokens } from '../../../server/src/shared/typedPrompt';
import { primeClip } from './clipInfo';

// ---------- Media picker ----------
export type MediaTab = 'uploads' | 'presets' | 'generations' | 'liked';
export interface MediaItem { id: string; tab: MediaTab; type: 'image' | 'video'; url: string; thumbUrl: string; name: string; createdAt: number; jobId?: string | null; toolId?: string | null; label?: string | null;
  /** how many times the file was used or uploaded */ uses?: number; /** a fresh upload's size and length (clips: ffprobe) */ width?: number | null; height?: number | null; duration?: number | null; /** a frame saved from a video: its source clip */ frameOf?: { jobId?: string | null; url?: string; at?: unknown; t?: number } }
export interface MediaPage { tab: MediaTab; type: 'image' | 'video' | 'all'; range: 'recent' | 'all'; sort: string; q: string; page: number; pageSize: number; total: number; hasMore: boolean; counts: Record<MediaTab, number>; items: MediaItem[] }
export interface MediaFilter { tab: MediaTab; type?: 'image' | 'video' | 'all'; range?: 'recent' | 'all'; sort?: 'new' | 'old' | 'name'; q?: string; pageSize?: number; /** <project id> | none | all */ project?: string }
export async function fetchMedia(f: MediaFilter & { page?: number }): Promise<MediaPage> {
  const qs = new URLSearchParams(Object.entries({ ...f, type: f.type === 'all' ? '' : f.type }).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]));
  const r = await fetch(`/api/media?${qs}`); if (!r.ok) throw new Error('Could not load media'); return r.json();
}
export async function uploadMedia(files: File[], projectId?: string | null): Promise<MediaItem[]> {
  const fd = new FormData(); if (projectId) fd.append('projectId', projectId); /* tags the upload to that project (before the files) */ files.forEach(f => fd.append('file', f));
  const r = await fetch('/api/media', { method: 'POST', body: fd }); const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Upload failed'); for (const m of j.items ?? []) if (m?.type === 'video') primeClip(m.url, m); return j.items;
}
/** Turn a picked library item into a File for the existing upload slots. */
export async function mediaToFile(m: MediaItem): Promise<File> {
  const b = await (await fetch(m.url)).blob(); return new File([b], m.url.split('/').pop()!, { type: b.type || (m.type === 'image' ? 'image/png' : 'video/mp4') });
}
/** Modal state: tab, filters, paginated items (loadMore appends), upload into Uploads. `type` locks the media kind for an upload box. */
export function useMediaPicker(initial: MediaFilter) {
  const [filter, setFilterS] = useState<MediaFilter>({ type: 'all', range: 'all', sort: 'new', q: '', pageSize: 24, ...initial });
  const [data, setData] = useState<MediaPage | null>(null); const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const seq = useRef(0);
  const load = useCallback(async (page: number, f: MediaFilter) => {
    const n = ++seq.current; setLoading(true); setError('');
    try { const d = await fetchMedia({ ...f, page }); if (n !== seq.current) return; setData(d); setItems(xs => page === 1 ? d.items : [...xs, ...d.items]); }
    catch (e: any) { if (n === seq.current) setError(e.message); } finally { if (n === seq.current) setLoading(false); }
  }, []);
  useEffect(() => { load(1, filter); }, [filter, load]);
  return {
    filter, items, data, loading, error, counts: data?.counts ?? null, hasMore: !!data?.hasMore,
    setFilter: (p: Partial<MediaFilter>) => setFilterS(f => ({ ...f, ...p })),
    setTab: (tab: MediaTab) => setFilterS(f => ({ ...f, tab })),
    loadMore: () => data?.hasMore && !loading && load(data.page + 1, filter),
    reload: () => load(1, filter),
    upload: async (files: File[]) => { const up = await uploadMedia(files); setFilterS(f => ({ ...f, tab: 'uploads' })); return up; },
  };
}

// ---------- Live price ----------
export interface PriceOpts { quality: string; durationSec?: number | null; provider?: string; passes?: number; count?: number; types?: string[]; free?: boolean; missing?: number; label?: string }
/** Same function the server charges with. Returns price (+ draft price) and the CTA label ("Generate" / "Generate · $0.42"). */
export function usePrice(tool: ToolInfo, o: PriceOpts) {
  return useMemo(() => {
    const price: Price = priceOf({ ...priceOverrides(tool, o.provider), toolId: tool.id, rates: tool.gpuSecPerSec, quality: o.quality, durationSec: o.durationSec, provider: o.provider, passes: o.passes, count: o.count, types: o.types, free: o.free });
    return { price, credits: price.credits, draftCredits: price.draftCredits, label: generateLabel(price, o.missing ?? 0, o.label) };
  }, [tool, o.quality, o.durationSec, o.provider, o.passes, o.count, (o.types ?? []).join(','), o.free, o.missing, o.label]);
}

// ---------- Model picker ----------
export interface ModelCard { id: string; providerId: string; toolId: string; name: string; providerName: string; kind: 'open-weights' | 'hosted' | 'hosted-direct'; openWeights: boolean; license: { id: string; name: string; osi: boolean; url: string | null }; speed: 'fast' | 'balanced' | 'slow'; quality: 'draft' | 'good' | 'best'; hint: string; badges: string[]; priceFactor: number; workflows: string[]; default: boolean;
  /** The model this card runs and its maker (server modelIds MAKERS), sent on every card. */ modelKey?: string | null; maker?: string | null; makerName?: string | null }
export interface ModelGroup { toolId: string; toolName: string; models: ModelCard[] }
export async function fetchModels(toolId?: string, q = '', model = ''): Promise<{ groups: ModelGroup[]; selected: ModelCard | null }> {
  const qs = new URLSearchParams(Object.entries({ toolId, q, model }).filter(([, v]) => v) as [string, string][]);
  const r = await fetch(`/api/models?${qs}`); if (!r.ok) throw new Error('Could not load models'); return r.json();
}
/** The header / Home model menus read only id, hint and badges of every card (Shell mediaModels): ask for just those (~20 KB, not ~1.4 MB). */
export const MENU_MODEL_FIELDS = 'hint,badges';
export async function fetchMenuModels(): Promise<{ groups: ModelGroup[] }> {
  const r = await fetch(`/api/models?fields=${MENU_MODEL_FIELDS}`); if (!r.ok) throw new Error('Could not load models'); return r.json();
}
/** Models for one tool (or all tools); `selected` follows `?model=<id>` for deep links. */
export function useModels(toolId?: string) {
  const [groups, setGroups] = useState<ModelGroup[]>([]); const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(location.search).get('model') ?? '');
  const [loaded, setLoaded] = useState(false); /* B21: lets ModelButton reserve its row until the list lands */
  useEffect(() => { fetchModels(toolId, q).then(d => setGroups(d.groups)).catch(() => setGroups([])).finally(() => setLoaded(true)); }, [toolId, q]);
  const models = groups.flatMap(g => g.models);
  const select = (id: string) => { setSelectedId(id); const u = new URL(location.href); id ? u.searchParams.set('model', id) : u.searchParams.delete('model'); history.replaceState(null, '', u); };
  return { groups, models, loaded, q, setQ, selectedId, selected: models.find(m => m.id === selectedId) ?? models.find(m => m.default) ?? null, select };
}

// ---------- @ mentions ----------
/** Chips + issues for a prompt; `removeRef(i)` renumbers mentions when reference i (0-based) is removed. */
export function useMentions(prompt: string, setPrompt: (s: string) => void, have: { images: number; videos: number }) {
  const v = useMemo(() => validateMentions(prompt, have), [prompt, have.images, have.videos]);
  const bad = new Set(v.issues.map(i => i.mention.start));
  return {
    ok: v.ok, issues: v.issues.map(i => ({ code: i.code, mention: i.mention.raw, start: i.mention.start, end: i.mention.end, message: i.message })),
    chips: v.mentions.map(m => ({ label: mentionLabel(m), raw: m.raw, kind: m.kind, index: m.index, start: m.start, end: m.end, invalid: bad.has(m.start) })),
    removeRef: (i: number, kind: MentionKind = 'image') => setPrompt(renumberMentions(prompt, kind, i + 1)),
  };
}

// ---------- Form draft persistence (localStorage) ----------
/** A saved prompt in a model's rewritten form (<<<image_1>>>, <Picture 1>…) never came from the box (an old carry or Recreate put it there,
 *  2026-10-26): it is dropped on load, so the box starts empty instead of showing another job's prompt. */
const cleanDraft = <S extends Record<string, any>>(st: S | null | undefined): S | null => { if (!st || typeof st !== 'object') return null; if (!hasModelTokens(st.prompt)) return st; const { prompt: _p, ...rest } = st; return rest as S; };
export const draftPromptOk = (p: unknown) => !hasModelTokens(p);
const DRAFT_VERSION = 1;
export const formDraftKey = (toolId: string) => `${KEY_PREFIX}form:${toolId}`;
/** Media slots are stored as server URLs only (/files, /samples); local blob uploads can't survive a reload. */
export const persistableUrl = (u?: string | null) => (u && /^\/(files|samples)\//.test(u) ? u : null);
/**
 * Unsent form state per tool, saved to localStorage (debounced 300 ms) and restored on mount.
 * Returns [state, set(patch), clear()] + `restored` (true when a saved draft was loaded). `clear` resets to `defaults` and deletes the key.
 */
export function useFormDraft<T extends Record<string, any>>(toolId: string, defaults: T) {
  const key = formDraftKey(toolId);
  const [restored] = useState(() => { try { const j = JSON.parse(localStorage.getItem(key) || 'null'); return j?.v === DRAFT_VERSION ? cleanDraft(j.state as Partial<T>) : null; } catch { return null; } });
  const [state, setState] = useState<T>(() => ({ ...defaults, ...(restored ?? {}) }));
  const cleared = useRef(false);
  useEffect(() => {
    if (cleared.current) { cleared.current = false; return; }
    const t = setTimeout(() => { try { localStorage.setItem(key, JSON.stringify({ v: DRAFT_VERSION, savedAt: Date.now(), state })); } catch { /* quota */ } }, 300);
    return () => clearTimeout(t);
  }, [key, state]);
  const set = useCallback((p: Partial<T>) => setState(s => ({ ...s, ...p })), []);
  const clear = useCallback(() => { cleared.current = true; localStorage.removeItem(key); setState(defaults); }, [key]);
  return { state, set, clear, restored: !!restored };
}

/** BH4 G4: one persisted field (a drop-in for useState) for tools that don't use useFormDraft. Same storage family as
 *  formDraftKey; `valid` drops a restored value the tool no longer accepts (e.g. a removed option). Recreate/prefill still
 *  wins, since it sets the field after mount. */
export function useDraftField<T>(toolId: string, name: string, initial: T | (() => T), valid?: (v: unknown) => boolean): [T, React.Dispatch<React.SetStateAction<T>>] {
  const key = `${formDraftKey(toolId)}:${name}`;
  const [v, setV] = useState<T>(() => { const init = typeof initial === 'function' ? (initial as () => T)() : initial;
    try { const j = JSON.parse(localStorage.getItem(key) || 'null'); if (j && j.v === DRAFT_VERSION && 'x' in j && (!valid || valid(j.x)) && typeof j.x === typeof init && !(name === 'prompt' && hasModelTokens(j.x))) return j.x as T; } catch { /* ignore */ } return init; });
  useEffect(() => { const t = setTimeout(() => { try { localStorage.setItem(key, JSON.stringify({ v: DRAFT_VERSION, x: v })); } catch { /* quota */ } }, 300); return () => clearTimeout(t); }, [key, v]);
  return [v, setV];
}

// ---------- Adapters to Design Planner's ui/b1 components ----------
/** /api/media item → ui/b1/MediaPicker MediaItem. */
export const toPickerItem = (m: MediaItem) => ({ id: m.id, url: m.url, poster: m.thumbUrl, kind: m.type, name: m.name, ts: m.createdAt, liked: m.tab === 'liked' });
/** /api/models card → ui/b1/ModelPicker ModelCard. */
export const toModelCard = (m: ModelCard) => ({ id: m.id, name: m.name, family: m.providerName, blurb: `${m.hint} · ${m.speed} · ${m.quality} quality`, badge: (m.badges[0] as 'new' | 'premium' | undefined), license: m.license });
/** Price per quality option (for ui/b1/QualitySelect `price`). */
export const pricesByQuality = (tool: ToolInfo, qualities: string[], o: Omit<PriceOpts, 'quality'>) =>
  Object.fromEntries(qualities.map(q => [q, priceOf({ ...priceOverrides(tool, o.provider), toolId: tool.id, rates: tool.gpuSecPerSec, quality: q, durationSec: o.durationSec, provider: o.provider, passes: o.passes, count: o.count, types: o.types }).credits]));
/** Which reference index (0-based) was removed between two lists, or -1. */
export const removedIndex = <T,>(before: T[], after: T[]) => after.length === before.length - 1 ? before.findIndex((x, i) => after[i] !== x) : -1;
