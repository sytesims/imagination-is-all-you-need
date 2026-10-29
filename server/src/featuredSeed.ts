/**
 * The Examples project (2026-10-29, replaces the starter pack's special cases). The app's own real outputs (shared/featured.ts) are seeded ONCE, on a
 * fresh install, as ordinary finished jobs in a normal project called "Examples": they open, Recreate, download, move, share and delete through the
 * same code as your own results. What stays special:
 *  - `featuredExample` = the catalogue key: the run cost you $0 (cost 0, no spend row) and never counts in Spend or any totals (owner.ts
 *    countsAsRun); its details still show the real model, place and original price (GET /api/jobs/:id `example`).
 *  - Seeded once: kv `examplesProject` remembers the project and every id seeded, so nothing comes back after you delete the project or an item.
 *    The media are files that ship in the repo (web/public/showcase, web/public/examples/...).
 *  - An install that had the old starter pack (owner SEED_OWNER + `seed`, marked Featured) has those jobs moved into Examples once, same ids.
 * Explore-only entries (starter: false) stay hidden seed jobs (owner SEED_OWNER + `seed`), so Explore's Recreate links open them; no tab shows them.
 * Fixed ids (sha1 of the key); a changed catalogue entry's media is updated in place. OPENHIGGSFIELD_SEED_FEATURED=0 turns it all off.
 */
import { createHash } from 'node:crypto';
import { env } from './env.js';
import { getKv, setKv } from './db.js';
import { jobs, type Job } from './jobs.js';
import * as lib from './library.js';
import { localFileOf } from './outputMeta.js';
import { LOCAL_OWNER, SEED_OWNER } from './owner.js';
import { FEATURED, isStarter, type FeaturedItem } from './shared/featured.js';

export const featuredSeedEnabled = () => env('SEED_FEATURED') !== '0';
export const featuredIdOf = (key: string) => createHash('sha1').update(`openhiggsfield-featured:${key}`).digest('hex').slice(0, 8);
/** Explore-only seeds (and, before 2026-10-29, the starter pack): every id ever seeded. */
const KV = 'featuredSeed';
/** The Examples project: its id and every example id ever seeded into it. */
export const EXAMPLES_KV = 'examplesProject';
export const EXAMPLES_PROJECT = 'Examples';
interface ExamplesState { projectId: string; ids: string[] }
/** Seeded jobs sit a day back, in catalogue order (newest first), so they never look like this visit's runs. */
const DAY = 86400_000;

function jobOf(f: FeaturedItem, id: string, createdAt: number, example: boolean): Job {
  return { id, toolId: f.toolId, provider: f.provider, status: 'done', stage: 'done', progress: 100, queuePos: 0, eta: 0, resultUrl: f.out.url,
    outputs: f.layers ? f.layers.map((l) => ({ kind: 'image', label: l.label, url: l.url, box: l.box, width: f.out.width, height: f.out.height })) /* an Image to layers run: every layer */ : [{ label: f.flow === 'Direct a Shot' ? 'Render' : 'Result', url: f.out.url }], error: null, errorType: null, cost: 0, refunded: 0, warnings: [],
    input: { ...f.input, prompt: f.prompt, finalPrompt: f.prompt }, parentId: null, route: f.route ?? `local:${f.provider}`,
    createdAt, finishedAt: createdAt + (f.runMs ?? 60_000), updatedAt: createdAt + (f.runMs ?? 60_000), featuredExample: f.key,
    ...(example ? { owner: LOCAL_OWNER } : { owner: SEED_OWNER, seed: true }) } as any;
}
const media = (j: any) => ({ toolId: j.toolId, provider: j.provider, resultUrl: j.resultUrl, outputs: j.outputs, input: j.input, route: j.route });

export function seedFeatured(now = Date.now()): { enabled: boolean; added: string[]; moved: string[]; ids: string[]; projectId: string | null } {
  if (!featuredSeedEnabled()) return { enabled: false, added: [], moved: [], ids: [], projectId: null };
  const legacy = getKv<{ ids: string[]; at: number }>(KV, { ids: [], at: now });
  const prev = getKv<ExamplesState | null>(EXAMPLES_KV, null);
  const ex: ExamplesState = prev ?? { projectId: lib.createProject(EXAMPLES_PROJECT).id, ids: [] }; // created once, never again
  const project = lib.getProject(ex.projectId) ? ex.projectId : null;
  const added: string[] = [], moved: string[] = [], ids: string[] = [];
  FEATURED.forEach((f, k) => {
    const id = featuredIdOf(f.key); ids.push(id);
    if (!localFileOf(f.out.url)) return; // a file missing from this install: skipped, seeded on a later boot
    const starter = isStarter(f); const want = jobOf(f, id, legacy.at - DAY - k * 60_000, starter); const cur = jobs.get(id) as any;
    if (cur?.featuredExample === f.key && JSON.stringify(media(cur)) !== JSON.stringify(media(want))) jobs.set(id, { ...cur, ...media(want) }); // the catalogue changed: same job, new media
    if (!starter) { if (!cur && !legacy.ids.includes(id)) { jobs.set(id, want); legacy.ids.push(id); added.push(id); } return; }
    if (ex.ids.includes(id)) return; // seeded once: an ordinary result now
    ex.ids.push(id);
    if (cur?.seed) { const { seed: _old, ...rest } = jobs.get(id) as any; jobs.set(id, { ...rest, owner: LOCAL_OWNER }); lib.setFeatured(id, false); if (project) lib.setProject(id, project); moved.push(id); return; } // the old starter pack (marked Featured): moved in once, unfeatured
    if (cur || legacy.ids.includes(id) || (prev && !project)) return; // removed before, or you deleted Examples: nothing comes back
    jobs.set(id, want); lib.setProject(id, project); added.push(id);
  });
  /* hidden seeds are never featured (an old install featured some) */
  for (const j of jobs.values()) if ((j as any).seed && typeof (j as any).featuredExample === 'string' && lib.metaOf(j.id).featured) lib.setFeatured(j.id, false);
  setKv(KV, legacy); setKv(EXAMPLES_KV, ex);
  return { enabled: true, added, moved, ids, projectId: project };
}
