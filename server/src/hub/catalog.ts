/**
 * Community hub catalogue: Civitai-shaped LoRAs + workflows. Mock (cached sample list) by default;
 * OPENHIGGSFIELD_HUB_LIVE=1 queries https://civitai.com/api/v1/models (nsfw=false) and falls back to the sample on failure.
 * nsfw=false is always enforced: never a query option, and any nsfw item from live data is dropped.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env.js';

export type HubType = 'lora' | 'workflow';
export type HubSort = 'popular' | 'trending' | 'new' | 'rated';
export const HUB_SORTS: HubSort[] = ['popular', 'trending', 'new', 'rated'];
export const USE_CASES = [
  { id: 'product-shots', label: 'Product shots', keywords: ['product', 'packshot', 'ecommerce', 'studio', 'cosmetics', 'food'] },
  { id: 'ads', label: 'Ads', keywords: ['ad', 'advertising', 'banner', 'billboard', 'poster', 'campaign', 'marketing'] },
  { id: 'fashion', label: 'Fashion', keywords: ['fashion', 'clothing', 'apparel', 'runway', 'outfit', 'jewelry', 'lookbook'] },
  { id: 'real-estate', label: 'Real estate', keywords: ['interior', 'architecture', 'real estate', 'house', 'room', 'exterior'] },
  { id: 'thumbnails', label: 'Thumbnails', keywords: ['thumbnail', 'youtube', 'expression', 'sticker'] },
] as const;
export type CommercialUse = 'Image' | 'Rent' | 'RentCivit' | 'Sell';
export interface HubItem {
  id: string; source: 'civitai' | 'openart' | 'comfyworkflows'; sourceId: number | null; sample: boolean; type: HubType;
  name: string; description: string; creator: { username: string }; tags: string[]; useCases: string[]; baseModel: string | null; triggerWords: string[];
  stats: { downloadCount: number; favoriteCount: number; rating: number; ratingCount: number; commentCount: number };
  trendingScore: number; publishedAt: string; nsfw: false;
  license: { allowCommercialUse: CommercialUse[]; allowNoCredit: boolean; allowDerivatives: boolean; allowDifferentLicense: boolean };
  files: { name: string; sizeKB: number }[]; url: string | null; downloadUrl: string | null; posterUrl: string | null;
}
/** Derived flags the UI shows next to each item. */
export function commercialFlags(l: HubItem['license']) {
  const a = l.allowCommercialUse;
  return { commercialUse: a.length > 0, sellImages: a.includes('Image'), sellModel: a.includes('Sell'), rentModel: a.includes('Rent') || a.includes('RentCivit'),
    creditRequired: !l.allowNoCredit, label: a.length ? `Commercial use: ${a.join(', ')}` : 'Non-commercial only' };
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
let SAMPLE: HubItem[] | null = null;
export function sampleItems(): HubItem[] {
  if (SAMPLE) return SAMPLE;
  const p = [path.join(HERE, 'sample.json'), path.resolve(HERE, '../../src/hub/sample.json')].find(existsSync)!;
  SAMPLE = (JSON.parse(readFileSync(p, 'utf8')).items as HubItem[]).filter((i) => i.nsfw === false)
    // own thumbnails generated from repo samples (scripts/gen-example-media.py → server/samples/hub/)
    .map((i) => ({ ...i, posterUrl: i.posterUrl ?? `/samples/hub/${i.id}.jpg` }))
    /* Round 1 (C1): a sample catalogue item never looks like real community data: no made-up creator, downloads, likes or rating
       (the list keeps its file order for every sort). */
    .map((i) => ({ ...i, creator: { username: 'sample' }, stats: { downloadCount: 0, favoriteCount: 0, rating: 0, ratingCount: 0, commentCount: 0 }, trendingScore: 0 }));
  return SAMPLE;
}

export const hubLive = () => env('HUB_LIVE') === '1';
const LIVE_TTL_MS = 10 * 60_000;
let live: { at: number; items: HubItem[] } | null = null; let liveError: string | null = null;

function guessUseCases(text: string): string[] {
  const t = text.toLowerCase();
  return USE_CASES.filter((u) => u.keywords.some((k) => t.includes(k))).map((u) => u.id);
}
/** Map one Civitai /api/v1/models entry onto HubItem (null if it is nsfw or not a LoRA/workflow). */
export function fromCivitai(m: any): HubItem | null {
  if (!m || m.nsfw === true || (typeof m.nsfwLevel === 'number' && m.nsfwLevel > 1)) return null;
  const type: HubType | null = m.type === 'LORA' || m.type === 'LoCon' || m.type === 'DoRA' ? 'lora' : m.type === 'Workflows' ? 'workflow' : null;
  if (!type) return null;
  const v = (m.modelVersions ?? [])[0] ?? {}; const f = (v.files ?? [])[0];
  const img = (v.images ?? []).find((i: any) => !i.nsfw || i.nsfw === 'None' || i.nsfwLevel === 1);
  const tags: string[] = (m.tags ?? []).map((x: any) => (typeof x === 'string' ? x : x?.name)).filter(Boolean);
  const ac = m.allowCommercialUse; const acl: CommercialUse[] = Array.isArray(ac) ? ac : typeof ac === 'string' && ac !== 'None' ? [ac as CommercialUse] : [];
  const s = m.stats ?? {};
  const desc = String(m.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
  const pub = v.publishedAt ?? v.createdAt ?? new Date(0).toISOString();
  const ageDays = Math.max(1, (Date.now() - Date.parse(pub)) / 86_400_000);
  return {
    id: `civitai-${m.id}`, source: 'civitai', sourceId: m.id, sample: false, type, name: String(m.name ?? ''), description: desc,
    creator: { username: String(m.creator?.username ?? 'unknown') }, tags, useCases: guessUseCases(`${m.name} ${tags.join(' ')}`), baseModel: v.baseModel ?? null,
    triggerWords: v.trainedWords ?? [],
    stats: { downloadCount: s.downloadCount ?? 0, favoriteCount: s.favoriteCount ?? s.thumbsUpCount ?? 0, rating: s.rating ?? 0, ratingCount: s.ratingCount ?? 0, commentCount: s.commentCount ?? 0 },
    trendingScore: Math.round(((s.downloadCount ?? 0) / ageDays) * 10) / 10, publishedAt: pub, nsfw: false,
    license: { allowCommercialUse: acl, allowNoCredit: !!m.allowNoCredit, allowDerivatives: m.allowDerivatives !== false, allowDifferentLicense: !!m.allowDifferentLicense },
    files: f ? [{ name: f.name, sizeKB: Math.round(f.sizeKB ?? 0) }] : [], url: `https://civitai.com/models/${m.id}`, downloadUrl: f?.downloadUrl ?? v.downloadUrl ?? null, posterUrl: img?.url ?? null,
  };
}

async function fetchLive(): Promise<HubItem[] | null> {
  if (live && Date.now() - live.at < LIVE_TTL_MS) return live.items;
  try {
    const out: HubItem[] = [];
    for (const types of ['LORA', 'Workflows']) {
      const u = `https://civitai.com/api/v1/models?types=${types}&sort=Most%20Downloaded&limit=50&nsfw=false`;
      const r = await fetch(u, { signal: AbortSignal.timeout(6000), headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error(`civitai ${r.status}`);
      const j: any = await r.json();
      for (const m of j.items ?? []) { const it = fromCivitai(m); if (it) out.push(it); }
    }
    live = { at: Date.now(), items: out }; liveError = null; return out;
  } catch (x: any) { liveError = x?.message ?? String(x); return null; }
}

export async function catalog(): Promise<{ items: HubItem[]; source: 'sample' | 'live'; liveError: string | null }> {
  if (hubLive()) { const l = await fetchLive(); if (l) return { items: l, source: 'live', liveError: null }; }
  return { items: sampleItems(), source: 'sample', liveError: hubLive() ? liveError : null };
}

export interface HubQuery { type?: string; useCase?: string; sort?: string; q?: string; limit?: number; offset?: number }
export function filterSort(items: HubItem[], o: HubQuery) {
  let r = items.filter((i) => i.nsfw === false);
  if (o.type) r = r.filter((i) => i.type === o.type);
  if (o.useCase) r = r.filter((i) => i.useCases.includes(o.useCase!));
  if (o.q) { const q = o.q.toLowerCase(); r = r.filter((i) => `${i.name} ${i.description} ${i.tags.join(' ')} ${i.baseModel ?? ''}`.toLowerCase().includes(q)); }
  const sort = (HUB_SORTS as string[]).includes(o.sort ?? '') ? (o.sort as HubSort) : 'popular';
  const key: Record<HubSort, (i: HubItem) => number> = {
    popular: (i) => i.stats.downloadCount, trending: (i) => i.trendingScore, new: (i) => Date.parse(i.publishedAt), rated: (i) => i.stats.rating * Math.log10(10 + i.stats.ratingCount),
  };
  r = [...r].sort((a, b) => key[sort](b) - key[sort](a));
  return { sort, items: r };
}
