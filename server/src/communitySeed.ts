/**
 * Community feed seed (spec B6: the community feed must not start empty): a handful of finished, published results so
 * /community and Home's community row aren't empty in a demo. Mock or demo mode only.
 * - Media: images are our own example media (server/samples/examples, scripts/gen-example-media.py, plus repo samples); the 4 videos are
 *   credited Blender open-movie clips (CC BY 3.0, web/public/examples/hq-*, labelled 'Sample · CC-BY Blender Foundation', docs/ATTRIBUTION.md).
 *   Every seed is shown as a sample, not a tool output: toolId 'sample' (no tool, no prompt, no Recreate), kind 'sample'. aiGenerated is data-driven per seed:
 *   - 6 sample images i1–i6: the interim AI still /examples/community/<key>.jpg once it exists (aiGenerated true, 'AI-generated sample · Imagination Is All You Need'),
 *     else our procedural example media (aiGenerated false, 'Sample · Imagination Is All You Need'). Author 'Imagination Is All You Need samples'.
 *   - 7 AI stills c-<id> (manifest §4b: they replace the 7 published QA jobs): seeded only once their still exists; aiGenerated true.
 *   - 4 sample clips: author 'Blender Foundation', sampleCredit 'Sample · CC-BY Blender Foundation', aiGenerated false.
 * - Seed jobs belong to someone else: `owner = SEED_OWNER` ('community:openhiggsfield', B7: isOwner false); job_meta.author = <name> is the display name. They stay
 *   out of your own lists (history(), GET /api/jobs, Assets, media picker) but open like any result (/jobs/:id, Recreate, next actions).
 * - Idempotent: fixed ids (sha1 of the seed key); every id ever seeded is remembered in kv `communitySeed`, so a re-run adds
 *   nothing and an item you trash or delete stays gone. No credits are charged (cost 0, no ledger rows).
 * - On when OPENHIGGSFIELD_BACKEND=mock or OPENHIGGSFIELD_DEMO=1; OPENHIGGSFIELD_SEED_COMMUNITY=0 turns it off.
 */
import { createHash } from 'node:crypto';
import { env } from './env.js';
import { config } from './config.js';
import { getKv, setKv } from './db.js';
import { jobs, type Job } from './jobs.js';
import * as lib from './library.js';
import { localFileOf } from './outputMeta.js';
import { SEED_OWNER } from './owner.js';
import { SAMPLE_LABEL, sampleFor } from './sampleMedia.js';
import { interimStill } from './interimTiles.js';

export const SEED_PREFIX = 'community:';
/** A seeded (someone else's) community job. */
export const isSeedJob = (j: { owner?: unknown } | undefined | null) => !!j && typeof (j as any).owner === 'string' && (j as any).owner.startsWith(SEED_PREFIX) && !!(j as any).seed;
export const seedEnabled = () => env('SEED_COMMUNITY') !== '0' && (config.backend === 'mock' || /^(1|true|on|yes)$/i.test(env('DEMO') ?? ''));

/**
 * Every seed is sample media, not a tool run: a visible sampleCredit, a plain title, no prompt and no tool. aiGenerated comes from the seed's data
 * (true only for an AI-generated interim still that exists on disk). Videos: credited Blender open-movie clips (CC BY 3.0).
 */
/** `likes` is kept in the seed list for ordering history only; it is never stored or shown (round 1: likes are real local clicks). */
export interface SeedSpec { key: string; media: 'image' | 'video'; url: string; title: string; author: string; hoursAgo: number; likes: number; aiGenerated: boolean; sampleCredit?: string }
/** Pseudo tool id for sample media (no tool made it): never queued, no Recreate. */
export const SAMPLE_TOOL_ID = 'sample';
/** Author shown on a Blender sample clip (the credit itself is sampleCredit). */
export const SAMPLE_AUTHOR = 'Blender Foundation';
export const OHF_SAMPLE_AUTHOR = 'Imagination Is All You Need samples';
export const OHF_SAMPLE_CREDIT = 'Sample · Imagination Is All You Need';
const clip = (key: string, url: string, hoursAgo: number, likes: number): SeedSpec =>
  ({ key, media: 'video', url, title: `${sampleFor(url)?.film ?? 'Blender open movie'} · sample clip`, author: SAMPLE_AUTHOR, hoursAgo, likes, aiGenerated: false, sampleCredit: SAMPLE_LABEL });
export const OHF_AI_SAMPLE_CREDIT = 'AI-generated sample · Imagination Is All You Need';
/** A sample image: the interim AI still (manifest §4a) when it exists, else the fallback art. aiGenerated + credit follow whichever is used. */
const still = (key: string, url: string, title: string, hoursAgo: number, likes: number): (() => SeedSpec) => () => {
  const ai = interimStill('community', key);
  return { key, media: 'image', url: ai ?? url, title: `${title} · sample image`, author: OHF_SAMPLE_AUTHOR, hoursAgo, likes, aiGenerated: !!ai, sampleCredit: ai ? OHF_AI_SAMPLE_CREDIT : OHF_SAMPLE_CREDIT };
};
/** An AI still with no fallback (manifest §4b): url null until the file exists, and a seed with no file is skipped (seeded on a later boot). */
const aiStill = (key: string, file: string, title: string, hoursAgo: number, likes: number): (() => SeedSpec) => () =>
  ({ key, media: 'image', url: interimStill('community', file) ?? `/examples/community/${file}.jpg`, title: `${title} · sample image`, author: OHF_SAMPLE_AUTHOR, hoursAgo, likes, aiGenerated: true, sampleCredit: OHF_AI_SAMPLE_CREDIT });
const fixed = (s: SeedSpec) => () => s;
const SEED_DEFS: (() => SeedSpec)[] = [
  fixed(clip('v1', '/examples/hq-soar.mp4', 3, 41)),
  still('i1', '/samples/examples/ex-create-portrait.jpg', 'Studio portrait', 5, 33),
  still('i2', '/samples/examples/ex-soul-polaroid.jpg', 'Rooftop polaroid', 8, 27),
  fixed(clip('v2', '/examples/hq-burrow.mp4', 11, 19)),
  still('i3', '/samples/examples/ex-soul-character.jpg', 'Red coat portrait', 14, 22),
  still('i4', '/samples/examples/ex-create-edit.jpg', 'Golden-hour still', 20, 12),
  fixed(clip('v3', '/examples/hq-city.mp4', 26, 30)),
  still('i5', '/samples/examples/ex-image-x4.jpg', 'Product still', 30, 9),
  still('i6', '/samples/sample-character.png', 'Character portrait', 40, 15),
  fixed(clip('v4', '/examples/hq-flutter.mp4', 52, 17)),
  // manifest §4b: the 7 published QA jobs (unpublished, not deleted) are replaced by these AI stills; file name = the old job id
  aiStill('c1', 'demo01', 'Serum bottle in hand', 2, 24), aiStill('c2', 'a07a4acd', 'Street robot', 6, 18), aiStill('c3', '0e932ba1', 'Mug on a desk', 9, 14),
  aiStill('c4', 'ebad1f18', 'Studio mug', 16, 11), aiStill('c5', '4fa8fd29', 'Fox in snow', 23, 29), aiStill('c6', '639bfa37', 'Paper boat', 33, 16), aiStill('c7', '025fd73a', 'Sea cliffs at sunrise', 45, 21),
];
/** The seed list as of now (interim stills resolved at call time). */
export const seeds = (): SeedSpec[] => SEED_DEFS.map((f) => f());
/** @deprecated snapshot at import; use seeds(). */
export const SEEDS: SeedSpec[] = seeds();
export const seedIdOf = (key: string) => createHash('sha1').update(`openhiggsfield-community-seed:${key}`).digest('hex').slice(0, 8);
const KV = 'communitySeed';

/** Adds missing seed jobs and fixes earlier seeded rows in place. Returns {added, skipped, ids}. Safe to call any number of times. */
export function seedCommunity(now = Date.now()): { enabled: boolean; added: string[]; skipped: string[]; ids: string[] } {
  if (!seedEnabled()) return { enabled: false, added: [], skipped: [], ids: [] };
  const state = getKv<{ ids: string[]; at: number }>(KV, { ids: [], at: now });
  const added: string[] = [], skipped: string[] = [], ids: string[] = [];
  for (const s of seeds()) {
    const id = seedIdOf(s.key); ids.push(id);
    if (state.ids.includes(id) || jobs.has(id)) { migrate(id, s); skipped.push(id); continue; }
    if (!localFileOf(s.url)) { skipped.push(id); continue; }
    const createdAt = state.at - s.hoursAgo * 3600_000;
    jobs.set(id, sampleJob(id, s, createdAt));
    lib.setCommunityMeta(id, { author: s.author, publishedAt: createdAt + 60_000, showPrompt: false, aiGenerated: s.aiGenerated, sampleCredit: s.sampleCredit ?? null, title: s.title });
    state.ids.push(id); added.push(id);
  }
  setKv(KV, state);
  return { enabled: true, added, skipped, ids };
}

const sampleInput = (s: SeedSpec) => (s.media === 'video' ? { sampleFilm: sampleFor(s.url)?.film ?? null } : { sampleImage: s.url });
function sampleJob(id: string, s: SeedSpec, createdAt: number): Job & { owner: string; seed: true } {
  return { id, toolId: SAMPLE_TOOL_ID, provider: SAMPLE_TOOL_ID, status: 'done', stage: 'done', progress: 100, queuePos: 0, eta: 0, resultUrl: s.url, outputs: [{ label: s.media === 'video' ? 'Sample clip' : 'Sample image', url: s.url }],
    error: null, errorType: null, cost: 0, refunded: 0, warnings: [], input: sampleInput(s), parentId: null,
    createdAt, finishedAt: createdAt + 60_000, updatedAt: createdAt + 60_000, owner: SEED_OWNER, seed: true } as any;
}
/**
 * Reseed-on-boot migration for rows seeded by earlier builds (same fixed ids). Only touches a job that is still a seed (owner 'community:…' + seed flag):
 * a real user job can never match (ids are sha1 of the seed key, and isSeedJob checks owner + seed). Trashed seeds stay trashed; likes and publish time are kept.
 * Drops the old tool, prompt, example link and made-up author; sets aiGenerated, sampleCredit, title.
 */
function migrate(id: string, s: SeedSpec) {
  const ex0 = jobs.get(id) as any; if (!ex0?.seed) return;
  let ch = false; if (ex0.owner !== SEED_OWNER) { ex0.owner = SEED_OWNER; ch = true; } /* pre-release seeds were owned per author */
  if (!isSeedJob(ex0)) return;
  const want = sampleJob(id, s, ex0.createdAt);
  if (ex0.toolId !== SAMPLE_TOOL_ID || ex0.resultUrl !== s.url || JSON.stringify(ex0.input) !== JSON.stringify(want.input) || JSON.stringify(ex0.outputs) !== JSON.stringify(want.outputs)) {
    Object.assign(ex0, { toolId: want.toolId, provider: want.provider, resultUrl: want.resultUrl, outputs: want.outputs, input: want.input }); ch = true; }
  const m = lib.metaOf(id);
  if (m.author !== s.author || m.aiGenerated !== s.aiGenerated || (m.sampleCredit ?? null) !== (s.sampleCredit ?? null) || m.title !== s.title || m.published?.showPrompt)
    lib.fixSeedMeta(id, { author: s.author, aiGenerated: s.aiGenerated, sampleCredit: s.sampleCredit ?? null, title: s.title, showPrompt: false });
  if (ch) jobs.set(id, ex0);
}

/** Interim stills appear while the server runs: the feeds call this (at most once a minute) so a new still is seeded / swapped in without a restart. */
let lastReseed = 0;
export function reseedIfDue(now = Date.now()) { if (now - lastReseed < 60_000) return; lastReseed = now; try { seedCommunity(now); } catch { /* feed still answers */ } }
