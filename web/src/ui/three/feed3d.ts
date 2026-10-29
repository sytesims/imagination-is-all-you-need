/**
 * The 3D page's feed rules (2026-10-27, UX audit batch A), kept free of React so the tests can read them:
 *  - the kind filter: Models first (renamed from "3D"), then Mockups and Renders; the default follows the workflow
 *    (Image to 3D / Turntable → Models; Direct a Shot → Mockups + Renders), and falls back to All when that shows nothing;
 *  - the card still of a video card (Mockup, Render, Turntable): the server's first-frame poster (outputs[0].posterUrl, else
 *    GET /api/media/poster?url=), scaled for the grid, so a card is never black while its video loads;
 *  - the card caption's short 3D line ("1.4M faces"); the viewer keeps the full detail;
 *  - which "Made with these models" examples ran on a model this app has.
 */
import { gridSrc } from '../../shared/thumbs';
import { normalizePlanShot, shotForJob, type PlanShot } from '../../../../server/src/shared/previzTemplates';

export type FeedKind = 'preview' | 'real' | '3d';
/** The filter chips in order. All (no filter) stays first; Models is the first kind. */
export const KINDS: { id: FeedKind | 'all'; label: string }[] = [{ id: 'all', label: 'All' }, { id: '3d', label: 'Models' }, { id: 'preview', label: 'Mockups' }, { id: 'real', label: 'Renders' }];
const PREVIZ = 'plan-a-shot', REAL = 'make-it-real';
export const kindOfJob = (j: { toolId?: string | null }): FeedKind => (j.toolId === PREVIZ ? 'preview' : j.toolId === REAL ? 'real' : '3d');
/** The kinds a workflow shows first: Direct a Shot → Mockups + Renders; Image to 3D, Turntable (and anything else) → Models. */
export const defaultKinds = (workflowId: string): FeedKind[] => (workflowId === 'plan-a-shot' ? ['preview', 'real'] : ['3d']);
/** What the feed shows: the picked kinds (null = the workflow's default), never an empty feed when other kinds have results (then All). */
export function shownKinds(picked: FeedKind[] | null, workflowId: string, counts: Record<FeedKind, number>): FeedKind[] | null {
  const want = picked ?? defaultKinds(workflowId); const any = want.some((k) => counts[k] > 0);
  return !any || want.length === 3 ? null : want; /* null = All */
}
export function countKinds(jobs: { toolId?: string | null }[]): Record<FeedKind, number> { const c: Record<FeedKind, number> = { preview: 0, real: 0, '3d': 0 }; for (const j of jobs) c[kindOfJob(j)]++; return c; }

/** A video card's still: the job's own poster (the server's first frame), else the poster route, as a grid-sized thumb. */
export function videoCardPoster(j: { resultUrl?: string | null; outputs?: { url?: string; posterUrl?: string | null }[] | null }, cssWidth = 320): string | undefined {
  const url = j.outputs?.[0]?.url ?? j.resultUrl; if (!url || !/^\/files\//.test(url)) return undefined;
  const p = j.outputs?.[0]?.posterUrl || `/api/media/poster?url=${encodeURIComponent(url)}`;
  return gridSrc(p, cssWidth) ?? undefined;
}
/** The plan (mockup) clip shown small on a Render card. */
export const planPoster = (url?: string | null, cssWidth = 160): string | undefined => (url && /^\/files\//.test(url) ? gridSrc(`/api/media/poster?url=${encodeURIComponent(url)}`, cssWidth) ?? undefined : undefined);

/** The card caption's 3D line: the face count only ("1.4M faces"), else the size; texture and size stay in the viewer. */
export function metaShort(m: { faces?: number | null; bytes?: number | null } | null): string {
  if (!m) return ''; const n = m.faces;
  if (n) return n >= 1e6 ? `${Math.round(n / 1e5) / 10}M faces` : n >= 1000 ? `${Math.round(n / 1000)}k faces` : `${n} faces`;
  return m.bytes ? `${m.bytes >= 1e7 ? Math.round(m.bytes / 1e6) : Math.round(m.bytes / 1e5) / 10} MB` : '';
}

/** The app's model an example was made with ("Pixal3D" matches "Pixal3D + TRELLIS.2"), or null: that model isn't in this app. */
export function exampleModel<M extends { id: string; name: string }>(exampleModelName: string, models: M[]): M | null {
  const n = exampleModelName.trim().toLowerCase();
  return models.find((m) => m.name.toLowerCase() === n || m.name.toLowerCase().split(' + ')[0] === n) ?? null;
}

/** The mockup the Render step offers (2026-10-27): the newest finished mockup OF THE SHOT ON STAGE, not simply the newest of all (a night
 *  city on stage used to offer a daytime take from hours before). Same set first (the preset template, or an imported scene); within it the
 *  when the caller supplies the current shot, require its exact capture snapshot (props, lens, trim, length and frame included).
 *  Legacy callers without a snapshot retain the set/take fallback. Historical jobs are never changed. */
type PlanJob = { toolId?: string | null; status?: string; input?: unknown };
export function mockupForShot<J extends PlanJob>(jobs: J[], at: { template: string; move: string; takeId: string | null; imported: boolean; shot?: PlanShot }): J | null {
  const pv = (j: J): any => (j.input as any)?.previz ?? {};
  const same = jobs.filter((j) => j.toolId === PREVIZ && j.status === 'done' && !(j as any).deletedAt
    && (at.imported ? pv(j).scene === 'imported' : pv(j).scene !== 'imported' && pv(j).shot?.template === at.template));
  if (at.shot && !at.imported) { const key = JSON.stringify(shotForJob(at.shot)); return same.find((j) => JSON.stringify(shotForJob(normalizePlanShot(pv(j).shot))) === key) ?? null; }
  const exact = same.find((j) => { const s = pv(j).shot ?? {}; const t: string | null = s.cameraPath?.chosen ?? null; return at.takeId ? t === at.takeId : !t && s.move === at.move; });
  return exact ?? same[0] ?? null; /* jobs come newest first */
}
