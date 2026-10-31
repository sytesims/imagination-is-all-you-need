/**
 * Media picker data (GET /api/media): tabs uploads | presets | generations | liked, filter by type (image|video),
 * range (recent = last 7 days | all), sort (newest | oldest | name), search q, pagination.
 * Uploads = files the user uploaded (POST /api/media) + inputs of past jobs + saved Elements, each file once (mediaStore.ts).
 * Projects (picker project filter, 2026-10-25): ?project=<id>|none|all. A generation is in its job's project. An upload is in every project
 * it was uploaded in: the projects stored on its upload rows (POST /api/media while a project is current) plus the project of each job
 * that was given those bytes (newer than the last "Move to project", which replaces the set). Deleted projects drop out (→ No project).
 */
import { readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { all, put } from './db.js';
import { jobs } from './jobs.js';
import * as lib from './library.js';
import { DATA_DIR, SAMPLES_DIR } from './config.js';
import { runFfmpeg } from './ffmpeg.js';
import { fileRefs } from './mediaGc.js';
import { foldKeys } from './mediaStore.js';
import { getTool } from './tools/registry.js';
import { FRAME_TOOL } from './pages.js';
import { localFileOf } from './outputMeta.js';
import { resultTitle } from './shared/shortTitle.js';
import { featuredByKey } from './shared/featured.js';
import { isLayerJob } from './shared/imageLayers.js';

export const MEDIA_TABS = ['uploads', 'presets', 'generations', 'liked'] as const;
export type MediaTab = (typeof MEDIA_TABS)[number];
export const RECENT_DAYS = 7;
export interface MediaItem {
  id: string; tab: MediaTab; type: 'image' | 'video' | 'audio'; url: string; thumbUrl: string; name: string; createdAt: number;
  jobId?: string | null; toolId?: string | null; label?: string | null; toolName?: string | null; uses?: number; title?: string;
  /** live projects this item is in ([] = No project) */ projectIds?: string[];
  /** a frame saved from a video: where it came from */ frameOf?: import('./videoFrame.js').FrameOf;
}
export interface UploadRow { id: string; url: string; name: string; type: 'image' | 'video' | 'audio'; createdAt: number;
  /** projects it was uploaded in (absent on rows from before projects = No project) */ projectIds?: string[]; /** last "Move to project": job uses older than this no longer add their project */ projectSetAt?: number;
  /** a still taken from a video (videoFrame.ts saveFrameAsset): the source clip, its job and which frame */ frameOf?: import('./videoFrame.js').FrameOf }
/** The media kind of a file URL; a cache-busting query ("…mp4?v=2") doesn't hide it (2026-10-26: such generations were missing from the picker). */
const typeOf = (u: string): 'image' | 'video' | 'audio' | null => { const x = String(u ?? '').split(/[?#]/)[0]; return /\.(png|jpe?g|webp|gif)$/i.test(x) ? 'image' : /\.(mp4|mov|webm|m4v)$/i.test(x) ? 'video' : /\.(wav|mp3|m4a)$/i.test(x) ? 'audio' : null; };
const thumb = (url: string, type: string) => (type === 'image' ? url : type === 'audio' ? '' : `/api/media/thumb?url=${encodeURIComponent(url)}`);
const item = (tab: MediaTab, url: string, name: string, createdAt: number, extra: Partial<MediaItem> = {}): MediaItem | null => {
  const type = typeOf(url); if (!type) return null;
  return { id: `${tab}:${url}`, tab, type, url, thumbUrl: thumb(url, type), name, createdAt, ...extra };
};
export function recordUpload(row: UploadRow) { put('uploads', row.id, row); }
/** Saved frames whose Assets job is in Trash (and none live): hidden from the picker too, back on restore (videoFrame.ts recordFrameJob). */
export function frameUploadsInTrash(): Set<string> { const live = new Set<string>(), gone = new Set<string>();
  for (const j of jobs.values()) { const u = (j as any).toolId === FRAME_TOOL ? (j.input as any)?.frameUploadId : null; if (typeof u === 'string') (lib.metaOf(j.id).deletedAt ? gone : live).add(u); }
  for (const u of live) gone.delete(u); return gone; }

/** Raw upload names a job's input can hold: <job id>-<field><n>.<ext> (masks and derived files are not uploads; nor is another job's result,
 *  <job id>-out<n>.<ext>, given to a run: Save frame's source clip, an Extend of your own clip. It is a generation, listed under Generations). */
const RAW_INPUT = /^[0-9a-f]{8}-(?!mask|out\d)[a-zA-Z]+\d+\.[a-z0-9]+$/;
/** Uploads tab: each file once. Rows from POST /api/media (content-addressed since 2026-10-25), saved Elements and the files jobs were
 *  given. Files with the same content (hard links, or copies stored before content addressing) fold into one entry: the newest use wins
 *  the date, an upload row's own name wins the name. Files a job took from the library (`libraryPicks`) are not new uploads. */
type C = { rel: string; url: string; name: string; createdAt: number; own: boolean; extra: Partial<MediaItem>; row?: UploadRow; jobProject?: string | null };
const liveProjects = (ids: Iterable<string | null | undefined>) => [...new Set([...ids].filter((x): x is string => !!x && !!lib.getProject(x)))];
/** The projects of one folded Uploads entry (see the header). */
function groupProjects(g: C[]): string[] {
  const rows = g.filter((c) => c.row).map((c) => c.row!); const setAt = Math.max(0, ...rows.map((r) => r.projectSetAt ?? 0));
  return liveProjects([...rows.flatMap((r) => r.projectIds ?? []), ...g.filter((c) => !c.row && c.jobProject && c.createdAt > setAt).map((c) => c.jobProject)]);
}
async function uploadGroups(): Promise<C[][]> {
  const cands: C[] = [];
  const trashedFrames = frameUploadsInTrash();
  for (const u of all<UploadRow>('uploads')) if (u.url?.startsWith('/files/') && !trashedFrames.has(u.id)) cands.push({ rel: u.url.slice(7), url: u.url, name: u.name, createdAt: u.createdAt, own: true, extra: u.frameOf ? { label: 'Video frame', frameOf: u.frameOf } as Partial<MediaItem> : {}, row: u });
  for (const e of lib.listElements()) if (e.url?.startsWith('/files/')) cands.push({ rel: e.url.slice(7), url: e.url, name: e.name, createdAt: (e as any).createdAt ?? 0, own: true, extra: { label: `Element · ${e.kind}` } });
  for (const j of jobs.values()) {
    if (lib.metaOf(j.id).deletedAt) continue;
    const picks = new Set<string>(Array.isArray((j.input as any)?.libraryPicks) ? (j.input as any).libraryPicks : []);
    for (const rel of fileRefs(j.input ?? {})) {
      const base = path.basename(rel); if (rel !== base || picks.has(rel) || !(RAW_INPUT.test(rel) || /^upl-/.test(rel))) continue;
      const tn = getTool(j.toolId)?.name ?? j.toolId;
      cands.push({ rel, url: `/files/${rel}`, name: `${tn} upload`, createdAt: j.createdAt, own: false, extra: { jobId: j.id, toolId: j.toolId }, jobProject: lib.metaOf(j.id).projectId });
    }
  }
  const live = cands.filter((c) => typeOf(c.url) && existsSync(path.join(DATA_DIR, c.rel)));
  const keys = await foldKeys([...new Set(live.map((c) => c.rel))]);
  const groups = new Map<string, C[]>();
  for (const c of live) { const k = keys.get(c.rel) ?? c.rel; (groups.get(k) ?? groups.set(k, []).get(k)!).push(c); }
  return [...groups.values()];
}
const repOf = (g: C[]) => g.find((c) => c.own && /^upl-/.test(c.rel)) ?? g.find((c) => c.own) ?? [...g].sort((a, b) => b.createdAt - a.createdAt)[0];
/** The Uploads tab's items (each file once); also the references database's uploads (libraryDb.ts). */
export async function uploads(): Promise<MediaItem[]> {
  const out: MediaItem[] = [];
  for (const g of await uploadGroups()) {
    const rep = repOf(g); const t = Math.max(...g.map((c) => c.createdAt || 0));
    const it = item('uploads', rep.url, rep.name, t, { ...rep.extra, uses: g.length, projectIds: groupProjects(g) } as Partial<MediaItem>); if (it) out.push(it);
  }
  return out;
}
/** "Move to project" on an Uploads entry (any url of the folded file): its project set becomes [projectId] ([] = No project) on every
 *  upload row of that file; a file known only from job inputs or Elements gets an upload row for it. null when the url is not an upload. */
export async function setUploadProject(url: string, projectId: string | null): Promise<{ url: string; projectIds: string[] } | null> {
  const g = (await uploadGroups()).find((x) => x.some((c) => c.url === url)); if (!g) return null;
  const now = Date.now(); const projectIds = projectId ? [projectId] : []; const rows = g.filter((c) => c.row).map((c) => c.row!);
  if (rows.length) for (const r of rows) put('uploads', r.id, { ...r, projectIds, projectSetAt: now });
  else { const rep = repOf(g); const type = typeOf(rep.url); if (!type) return null;
    const id = `upl-ref-${rep.rel.replace(/[^\w.-]/g, '_').slice(0, 60)}`; put('uploads', id, { id, url: rep.url, name: rep.name, type, createdAt: Math.max(...g.map((c) => c.createdAt || 0)), projectIds, projectSetAt: now } satisfies UploadRow); }
  return { url: repOf(g).url, projectIds };
}
function presets(): MediaItem[] {
  if (!existsSync(SAMPLES_DIR)) return [];
  return readdirSync(SAMPLES_DIR).filter((f) => f.startsWith('sample-')).map((f) =>
    item('presets', `/samples/${f}`, f.replace(/^sample-|\.[^.]+$/g, '').replace(/-/g, ' '), statSync(path.join(SAMPLES_DIR, f)).mtimeMs, { label: 'Sample' })).filter(Boolean) as MediaItem[];
}
function generations(likedOnly: boolean): MediaItem[] {
  const out: MediaItem[] = [];
  for (const j of [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt)) {
    const m = lib.metaOf(j.id);
    if (m.deletedAt || j.status !== 'done' || (likedOnly && !m.favourite) || (!likedOnly && (j as any).seed)) continue; // community seed: only when you liked it
    if (!likedOnly && j.toolId === FRAME_TOOL) continue; // a saved frame is listed once, in Uploads
    const outs = j.outputs?.length ? j.outputs : j.resultUrl ? [{ label: String(j.input?.outputLabel ?? 'Result'), url: j.resultUrl }] : []; // older jobs kept only resultUrl
    const feature = getTool(j.toolId)?.name ?? j.toolId; const ex = (j as any).featuredExample; const own = m.title || (typeof ex === 'string' ? featuredByKey(ex)?.title : null) || (j as any).title;
    outs.forEach((o: { label?: string; url: string }, k: number) => { const it = item(likedOnly ? 'liked' : 'generations', o.url, `${j.toolId} · ${o.label}`, (j.finishedAt ?? j.createdAt) - k, { jobId: j.id, toolId: j.toolId, label: o.label, toolName: feature,
      /* picker tile caption: a short title (shared/shortTitle.ts), never the bare feature name when the job says more */
      title: resultTitle({ title: own, prompt: j.input?.prompt, feature, layer: isLayerJob(j) ? k : null }), projectIds: liveProjects([m.projectId]) }); if (it) out.push(it); });
  }
  return out;
}
export interface MediaQuery { tab?: string; type?: string; range?: string; sort?: string; q?: string; page?: string | number; pageSize?: string | number; /** <project id> | none | all (default all) */ project?: string }
export async function listMedia(q: MediaQuery) {
  const tab = (MEDIA_TABS as readonly string[]).includes(q.tab ?? '') ? (q.tab as MediaTab) : 'uploads';
  const up = await uploads(); const src = { uploads: () => up, presets, generations: () => generations(false), liked: () => generations(true) };
  const types = String(q.type ?? '').split(',').filter((t) => t === 'image' || t === 'video' || t === 'audio'); const type = types.length ? types.join(',') : null; // type=image,video: a slot that takes either
  const since = q.range === 'recent' ? Date.now() - RECENT_DAYS * 86_400_000 : 0;
  const needle = (q.q ?? '').trim().toLowerCase();
  const proj = String(q.project ?? '').trim(); const inProj = (m: MediaItem) => m.tab === 'presets' || !proj || proj === 'all' || (proj === 'none' ? !m.projectIds?.length : !!m.projectIds?.includes(proj));
  const filt = (xs: MediaItem[]) => xs.filter((m) => inProj(m) && (types.length ? types.includes(m.type) : m.type !== 'audio' /* audio (voice samples) only with ?type=audio, so image/video pickers are unchanged */) && m.createdAt >= since && (!needle || m.name.toLowerCase().includes(needle)));
  let items = filt(src[tab]());
  const sort = q.sort === 'oldest' || q.sort === 'name' ? q.sort : 'newest';
  items.sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : sort === 'oldest' ? (a, b) => a.createdAt - b.createdAt : (a, b) => b.createdAt - a.createdAt);
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 24)); const page = Math.max(1, Number(q.page) || 1);
  const total = items.length;
  const counts = Object.fromEntries(MEDIA_TABS.map((t) => [t, filt(src[t]()).length])) as Record<MediaTab, number>;
  return { tab, type: type ?? 'all', project: proj && proj !== 'all' ? proj : 'all', range: since ? 'recent' : 'all', sort, q: needle, page, pageSize, total, hasMore: page * pageSize < total, counts, items: items.slice((page - 1) * pageSize, page * pageSize) };
}
/** First-frame JPEG poster for a /files/ or /samples/ video, cached in DATA_DIR/thumbs. */
export async function thumbFor(url: string): Promise<string | null> {
  // the app's shipped examples (/examples/…) count too: the Examples project's videos showed a broken picture in every picker
  const m = /^\/(files|samples|examples|showcase)\/([\w.\-/]+)$/.exec(url); if (!m || m[2].includes('..')) return null;
  const src = localFileOf(url); if (!src || typeOf(src) !== 'video') return null;
  const dir = path.join(DATA_DIR, 'thumbs'); mkdirSync(dir, { recursive: true });
  // WebM may carry alpha (Remove BG transparent: VP9 yuva420p). ffmpeg's native vp9 decoder drops alpha, so decode with libvpx-vp9 and keep it in a PNG
  // (transparent pixels stay transparent instead of flattening to black). Other videos stay JPEG.
  const webm = /\.webm$/i.test(src); const out = path.join(dir, `${m[1]}-${m[2].replace(/\//g, '_')}.${webm ? 'png' : 'jpg'}`);
  if (!existsSync(out)) {
    const grab = (dec: string[]) => runFfmpeg(['-y', '-loglevel', 'error', ...dec, '-ss', '0.5', '-i', src, '-frames:v', '1', '-vf', webm ? 'scale=320:-2,format=rgba' : 'scale=320:-2', out]);
    let err = await grab(webm ? ['-c:v', 'libvpx-vp9'] : []); if ((err || !existsSync(out)) && webm) err = await grab([]); // VP8/AV1 WebM: default decoder
    if (err || !existsSync(out)) return null; }
  return out;
}
