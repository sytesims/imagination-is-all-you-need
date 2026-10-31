/** Edge-case server routes: admission (#3 queue cap), jobs list for clients (#1), /api/queue, ZIP download (#8), trash (#9). */
import { RETIRED_MODELS } from './shared/lifecycle.js';
import { appFileName } from './shared/fileNames.js';
import { isEnhanced, mediaOf, parseWhen, FRAME_TOOL } from './pages.js';
import { featureById, featureIdOfJob } from './shared/imageFeatures.js';
import { videoFeedOf, inVideoFeed } from './shared/videoFeed.js';
import { imageFeedOf, inImageFeed } from './shared/imageFeed.js';
import { audioFeedOf, inAudioFeed } from './shared/audioFeed.js';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { cleanFileBytes } from './cleanMedia.js';
import path from 'node:path';
import { jobs, Job } from './jobs.js';
import { countsAsRun } from './owner.js';
import { jobSpendView } from './billing.js';
import { jobRouteFields } from './routing/http.js';
import { del, getKv, setKv } from './db.js';
import { inFlight, MAX_PARALLEL, CONCURRENCY, LOCAL_CONCURRENCY, CLOUD_CONCURRENCY, laneSizes, stateOf } from './queue.js';
import { MAX_QUEUED, queuedCount, queueFull } from './edge.js';
import { DATA_DIR } from './config.js';
import { env } from './env.js';
import { getTool } from './tools/registry.js';
import { toolsList } from './toolsCache.js';
import { getProvider } from './providers.js';
import * as lib from './library.js';
import { makeZip } from './zip.js';
import { fileRefs, liveRefs, removeUnreferenced } from './mediaGc.js';

/** Submit admission, in order: queue cap → legacy in-flight cap (only when MAX_QUEUED=0). Nothing is charged. */
export function admit(reply: FastifyReply): FastifyReply | null {
  const qf = queueFull(); if (qf) return reply.code(429).send(qf);
  if (MAX_QUEUED <= 0 && inFlight() >= MAX_PARALLEL) return reply.code(429).send({ error: "You've hit your limit of generations at the same time. Wait for one to finish.", errorType: 'concurrency' });
  return null;
}

/** settings.json for a job: whitelisted fields only — never keys, tokens, paths or env. */
export function settingsOf(j: Job) {
  const prov = getProvider(j.provider);
  return { id: j.id, tool: j.toolId, toolName: getTool(j.toolId)?.name ?? j.toolId, provider: j.provider, model: prov?.name ?? RETIRED_MODELS[j.provider]?.name ?? null, route: j.route ?? null,
    prompt: j.input.prompt ?? null, seed: j.input.seed ?? null, preset: j.input.preset || null, types: j.input.types ?? null, resolution: j.input.resolution ?? null,
    duration: j.input.duration ?? null, draft: !!j.input.draft, parentId: j.parentId ?? null, createdAt: new Date(j.createdAt).toISOString(),
    finishedAt: j.finishedAt ? new Date(j.finishedAt).toISOString() : null, outputs: j.outputs.map((o) => ({ label: o.label, file: path.basename(o.url) })) };
}
const SECRET_RE = /(api[_-]?key|secret|token|password|authorization|bearer|sk-[a-z0-9]{8,})/i;
/** Share step 1: media in a zip are clean copies (no PNG text chunks, EXIF/XMP or container tags; cleanMedia.ts). `noPrompt` (the share-link
 *  zip while "Show my prompt" is off) also leaves the prompt out of settings.json. */
async function zipFor(list: Job[], opts: { noPrompt?: boolean } = {}) {
  const files: { name: string; data: Buffer }[] = []; const multi = list.length > 1;
  for (const j of list) {
    const dir = multi ? `${j.id}/` : '';
    for (const [i, o] of j.outputs.entries()) {
      if (!o.url.startsWith('/files/')) continue; const p = path.join(DATA_DIR, path.basename(o.url)); if (!existsSync(p)) continue;
      const layerName = (j.input as any)?.layers && o.label ? `${String(o.label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'layer'}${path.extname(o.url)}` : null; // Image to layers: 01-background.png, 02-subject.png…
      files.push({ name: `${dir}${String(i + 1).padStart(2, '0')}-${layerName ?? path.basename(o.url)}`, data: await cleanFileBytes(p) });
    }
    const st = settingsOf(j); if (opts.noPrompt) st.prompt = null;
    const json = JSON.stringify(st, null, 2);
    if (SECRET_RE.test(json.replace(/"prompt": ".*"/g, ''))) throw new Error('settings.json would contain a secret-like field'); // belt and braces
    files.push({ name: `${dir}settings.json`, data: Buffer.from(json) });
  }
  return makeZip(files);
}
/** Clean copies, branded exports and logo-stamped copies made for a job's files (clean-cache/, share-exports/, stamps/) go with it. */
export function dropDerived(j: Job) {
  try { const names = j.outputs.map((o) => path.basename(o.url).replace(/\.[^.]+$/, '')).filter(Boolean);
    for (const d of ['clean-cache', 'share-exports', 'stamps']) { const dir = path.join(DATA_DIR, d); if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) if (((d === 'share-exports' || d === 'stamps') && f.startsWith(`${j.id}-`)) || (d === 'clean-cache' && names.some((n) => f.startsWith(`${n}-`)))) rmSync(path.join(dir, f), { force: true }); } } catch { /* best effort */ }
}

/** H+: OPENHIGGSFIELD_TRASH_DAYS (default 30; 0 = never purge). A value that isn't a number ≥ 0 logs a warning and falls back to 30:
 *  a typo must never silently switch cleanup off. */
export const TRASH_DAYS_DEFAULT = 30;
export function parseTrashDays(raw: string | undefined): { days: number; warning: string | null } {
  if (raw == null || raw.trim() === '') return { days: TRASH_DAYS_DEFAULT, warning: null };
  const n = Number(raw.trim()); if (Number.isFinite(n) && n >= 0) return { days: n, warning: null };
  return { days: TRASH_DAYS_DEFAULT, warning: `OPENHIGGSFIELD_TRASH_DAYS=${JSON.stringify(raw)} is not a number ≥ 0; using the default ${TRASH_DAYS_DEFAULT} days (set 0 to never purge Trash).` };
}
const trashCfg = parseTrashDays(env('TRASH_DAYS')); if (trashCfg.warning) console.warn(`[openhiggsfield] ${trashCfg.warning}`);
export const TRASH_DAYS = trashCfg.days;
/** Delete forever (G6): job row, meta, and its media: inputs, outputs and their cached thumbnails. A file still referenced by another
 *  job, element, project, upload or kv value is kept (inputs can be shared). `live` lets a batch (the trash sweep) compute references once. */
export function purge(id: string, live?: Set<string>) {
  const j = jobs.get(id); if (!j) return false;
  const mine = fileRefs({ input: j.input, outputs: j.outputs, resultUrl: (j as any).resultUrl, meta: lib.metaOf(id) });
  dropFrameUpload(j); // a saved frame: its picker row goes too, so the PNG is no longer referenced
  dropDerived(j); lib.unshareJob(id); jobs.delete(id); del('jobs', id); lib.forget(id);
  const refs = live ?? liveRefs(new Set([id]));
  lastPurge = removeUnreferenced(mine, refs); return true;
}
/** Delete forever of a saved frame (FRAME_TOOL): the upload row it was listed by in the picker, unless another live frame job still uses it. */
function dropFrameUpload(j: Job) { const u = j.toolId === FRAME_TOOL ? (j.input as any)?.frameUploadId : null; if (typeof u !== 'string') return;
  if ([...jobs.values()].some((x) => x.id !== j.id && x.toolId === FRAME_TOOL && (x.input as any)?.frameUploadId === u)) return; del('uploads', u); }
let lastPurge = { files: 0, bytes: 0, kept: 0 }; export const lastPurgeStats = () => lastPurge;
/** Trash sweep (G6 + BH4 #5): purges jobs trashed more than TRASH_DAYS ago, with their uploads and thumbs. References are computed once,
 *  excluding the whole batch, so files shared only inside the batch are removed too. */
export const sweepTrash = (now = Date.now()) => {
  if (!TRASH_DAYS) return 0;
  const ids = [...jobs.keys()].filter((id) => { const d = lib.metaOf(id).deletedAt; return d && d < now - TRASH_DAYS * 86400_000; });
  if (!ids.length) return 0; for (const id of ids) { const j = jobs.get(id); if (j) dropFrameUpload(j); } const live = liveRefs(new Set(ids)); let n = 0, files = 0, bytes = 0;
  for (const id of ids) if (purge(id, live)) { n++; files += lastPurge.files; bytes += lastPurge.bytes; }
  lastPurge = { files, bytes, kept: 0 }; return n;
};
/** Ids of every job in Trash. */
const trashedIds = () => [...jobs.keys()].filter((id) => !!lib.metaOf(id).deletedAt);
const ACTIVE = ['queued', 'running', 'needs_decision'];
/** GET /api/jobs?ids=: how many ids one request may ask for. */
export const MAX_IDS = 100;
export type JobListQuery = { ids?: string; state?: string; status?: string; tool?: string; toolId?: string; limit?: string; since?: string; from?: string; to?: string; q?: string; media?: string; enhanced?: string; cursor?: string; order?: string; features?: string; liked?: string; featured?: string; project?: string; projectId?: string; compare?: string; counts?: string; videoFeed?: string; imageFeed?: string; audioFeed?: string };
let pubFn: (j: Job) => any = (j) => j;
/** The GET /api/jobs list (filters + sort, before paging), shared with GET /api/jobs/:id/locate so its page/index always match the list.
 *  → {all (public job objects, list order), defaultLimit (the list's page size: ?limit, else 50, or 200 with status/state)} | {error:{field, message}}. */
export function filterJobList(q: JobListQuery): { all: any[]; defaultLimit: number } | { error: { field: string; message: string } } {
  const tool = q.tool || q.toolId;
  const want = q.state === 'active' ? ACTIVE : q.status ? q.status.split(',').map((s) => s.trim()) : null;
  const since = Number(q.since) || 0; const from = parseWhen(q.from), to = parseWhen(q.to);
  if (Number.isNaN(from)) return { error: { field: 'from', message: 'from must be an ISO date or epoch ms' } }; if (Number.isNaN(to)) return { error: { field: 'to', message: 'to must be an ISO date or epoch ms' } };
  if (q.media && !['image', 'video', 'audio'].includes(q.media)) return { error: { field: 'media', message: 'media must be image, video or audio' } };
  // ?features=* (or image) = every image feature (Create Image, Edit, Camera & Lens, Relight, Face Swap, Upscale…; shared/imageFeatures.ts), or a comma list of feature ids
  const feats = q.features == null || q.features === '' ? null : q.features === '*' || q.features === 'image' ? '*' : new Set(q.features.split(',').map((s) => s.trim()).filter(Boolean));
  if (feats instanceof Set) { const bad = [...feats].find((f) => !featureById(f)); if (bad) return { error: { field: 'features', message: `unknown image feature ${bad} (GET /api/image-features)` } }; }
  // ?videoFeed=<workflow id | flow shortcut id | all> (2026-10-26): one Video workflow's feed (shared/videoFeed.ts): its tool's video results, Lip Sync = the voice tool's lip-sync runs, all = every video
  const vfeed = q.videoFeed ? videoFeedOf(q.videoFeed) : null; if (q.videoFeed && !vfeed) return { error: { field: 'videoFeed', message: `unknown video feed ${q.videoFeed}` } };
  // ?imageFeed=<all | group:<chip> | image workflow id> (2026-10-26): the Image tab's feeds (shared/imageFeed.ts): all = every job whose output is an image
  const ifeed = q.imageFeed ? imageFeedOf(q.imageFeed) : null; if (q.imageFeed && !ifeed) return { error: { field: 'imageFeed', message: `unknown image feed ${q.imageFeed}` } };
  // ?audioFeed=<all | group:<chip>> (2026-10-27): the Audio tab's feed (shared/audioFeed.ts): every Audio workflow's results, by the tool + mode that made them
  const afeed = q.audioFeed ? audioFeedOf(q.audioFeed) : null; if (q.audioFeed && !afeed) return { error: { field: 'audioFeed', message: `unknown audio feed ${q.audioFeed}` } };
  const enh = q.enhanced == null || q.enhanced === '' ? null : /^(1|true|on|yes)$/i.test(q.enhanced); const needle = (q.q ?? '').trim().toLowerCase();
  // Create Image toolbar filters: ?liked=1 (favourites), ?project=<id>|none, ?compare=<group id>|any (Compare models runs); ?order=desc keeps newest first with a status filter
  const liked = q.liked == null || q.liked === '' ? null : /^(1|true|on|yes)$/i.test(q.liked); const proj = (q.project ?? q.projectId ?? '').trim(); const cmp = (q.compare ?? '').trim();
  const metaOk = (id: string) => { if (liked == null && !proj && !cmp) return true; const m = lib.metaOf(id);
    return (liked == null || !!m.favourite === liked) && (!proj || (proj === 'none' ? !m.projectId : m.projectId === proj)) && (!cmp || (cmp === 'any' ? !!m.compare : m.compare?.id === cmp)); };
  // ?featured=1 (2026-10-26): your starred results, newest first; ?media= picks the tab
  const featured = q.featured != null && /^(1|true|on|yes)$/i.test(q.featured);
  const asc = q.order === 'asc' || (want != null && q.order !== 'desc');
  const defaultLimit = Math.min(500, Number(q.limit) || (want ? 200 : 50));
  const all = [...jobs.values()].filter((j) => !(j as any).seed && (!featured || !!lib.metaOf(j.id).featured) && (!tool || j.toolId === tool) && (!want || want.includes(j.status)) && !lib.metaOf(j.id).deletedAt // community seed jobs aren't yours
      && (from == null || j.createdAt >= from) && (to == null || j.createdAt <= to) && (!q.media || mediaOf(j) === q.media) && (enh == null || isEnhanced(j as any) === enh)
      && (!vfeed || inVideoFeed(j as any, vfeed)) && (!ifeed || inImageFeed(j as any, ifeed)) && (!afeed || inAudioFeed(j as any, afeed.id)) && (!feats || ((f) => !!f && (feats === '*' || feats.has(f)))(featureIdOfJob(j as any)))
      && (!needle || `${j.id} ${j.toolId} ${String((j.input as any)?.prompt ?? '')}`.toLowerCase().includes(needle)) && metaOk(j.id))
    .sort((a, b) => (asc ? a.createdAt - b.createdAt : b.createdAt - a.createdAt)) // ?order=asc: oldest first (Assets sort)
    .map(pubFn).filter((p) => !since || p.updatedAt > since);
  return { all, defaultLimit };
}
export function registerEdge(app: FastifyInstance, pub: (j: Job) => any) {
  /** #1 client list: ?state=active (queued+running+needs_decision) or ?status=queued,running; ?tool= / ?toolId=; since=<ms> (updatedAt). */
  /** Images: ?features=* (every image feature) or ?features=relight,face-swap (feature ids): Create Image's feed and reference picker.
   *  Pages 16-18: ?from=&to= (ISO or ms, on createdAt), ?q= (prompt/tool/id substring), ?media=image|video|audio, ?enhanced=1|0, ?cursor=<opaque>.
   *  Passing `cursor` (empty = first page) returns { items, nextCursor }; otherwise the plain array as before, with an X-Next-Cursor header. */
  pubFn = pub;
  app.get<{ Querystring: JobListQuery }>('/api/jobs', async (req, reply) => {
    const q = req.query;
    /* ?ids=a,b,c (≤ 100): those jobs only, each exactly as GET /api/jobs/:id answers it (spend included), in the asked order; unknown ids are left out.
     * One request per poll for every job a page follows (web shared/useJobs), instead of one per job. Other filters are ignored. */
    if (q.ids != null) { const ids = [...new Set(String(q.ids).split(',').map((s) => s.trim()).filter(Boolean))];
      if (ids.length > MAX_IDS) return reply.code(400).send({ error: `ids takes up to ${MAX_IDS} job ids`, errorType: 'validation', issues: [{ code: 'invalid', field: 'ids', message: `ids takes up to ${MAX_IDS} job ids` }] });
      return ids.map((id) => jobs.get(id)).filter((j): j is Job => !!j).map((j) => ({ ...pub(j), spend: jobSpendView(j.id), ...jobRouteFields(j as any) })); }
    const r = filterJobList(q);
    if ('error' in r) return reply.code(400).send({ error: r.error.message, errorType: 'validation', issues: [{ code: 'invalid', field: r.error.field, message: r.error.message }] });
    const { all } = r; const off = Math.max(0, Number(q.cursor) || 0); const limit = r.defaultLimit;
    const items = all.slice(off, off + limit); const nextCursor = off + limit < all.length ? String(off + limit) : null;
    /* ?counts=failed (with cursor): how many failed / blocked runs the same filters hold (the feed's "N failed" link; its list shows finished runs) */
    const failed = q.cursor !== undefined && /(^|,)failed(,|$)/.test(q.counts ?? '') ? ((r2) => ('error' in r2 ? 0 : r2.all.length))(filterJobList({ ...q, status: 'failed,blocked', since: undefined })) : undefined;
    if (q.cursor !== undefined) return { items, nextCursor, total: all.length, ...(failed !== undefined ? { failed } : {}) }; // total: the whole filtered list (Create Image toolbar's count)
    if (nextCursor) reply.header('x-next-cursor', nextCursor); return items;
  });
  /** Video preset library for Generate Video (camera_motion_h3 moves + style presets, with poster tiles). Job field: videoPreset=<id> (+ intensity slow|aggressive for camera). */
  /** Presets list by tool (the same visible presets GET /api/tools carries). `?toolId=` narrows to one tool (404 unknown). */
  app.get<{ Querystring: { source?: string; toolId?: string; tool?: string; media?: string; provider?: string; category?: string; sort?: string; q?: string; days?: string; cursor?: string; limit?: string } }>('/api/presets', async (req, reply) => {
    if (req.query.tool && !req.query.toolId) req.query.toolId = req.query.tool;
    // Page 16 source pills: ours (curated, default) | community (no community presets on a local install yet → empty list, communityAvailable:false).
    const source = (req.query as any).source ?? 'ours'; if (!['ours', 'community'].includes(source)) return reply.code(400).send({ error: 'source must be ours or community', errorType: 'validation', issues: [{ code: 'invalid', field: 'source', message: 'source must be ours or community' }] });
    if (source === 'community') return { toolId: req.query.toolId ?? null, source, communityAvailable: false, note: 'No community presets on a local install yet.', categories: [], items: [], total: 0, cursor: null, limit: null, nextCursor: null, sort: req.query.sort ?? null, byTool: {} };
    if (req.query.toolId && !getTool(req.query.toolId)) return reply.code(404).send({ error: `unknown tool ${req.query.toolId}`, errorType: 'validation', issues: [{ code: 'unknown', field: 'toolId', message: 'Unknown tool id (GET /api/tools).' }] });
    const tools: any[] = toolsList().filter((t) => !req.query.toolId || t.id === req.query.toolId);
    let items = tools.flatMap((t) => (t.presets ?? []).map((p: any) => ({ ...p, toolId: t.id, toolName: t.name })));
    // ?q= name search; ?sort=trending (real job counts per tool+preset, last `days`, default 7) | new (addedAt, newest first; undated last).
    const qq = (req.query.q ?? '').trim().toLowerCase(); if (qq) items = items.filter((p: any) => `${p.label} ${p.id} ${p.group ?? ''} ${p.toolName}`.toLowerCase().includes(qq));
    // Camera: category=trending|new are virtual categories (real camera presets, not video presets): trending = most-used in `days` (uses>0), new = newest addedAt.
    const vcat = req.query.category === 'trending' || req.query.category === 'new' ? req.query.category : null; if (vcat) { (req.query as any).sort = vcat; delete (req.query as any).category; }
    const sort = req.query.sort === 'trending' || req.query.sort === 'new' ? req.query.sort : null;
    if (sort === 'trending') { const since = Date.now() - Math.min(90, Math.max(1, Number(req.query.days) || 7)) * 86400_000; const uses = new Map<string, number>();
      for (const j of jobs.values()) { if (!countsAsRun(j) || (j.createdAt ?? 0) < since || ['failed', 'canceled', 'blocked'].includes(j.status)) continue; const ids = new Set<string>([...(Array.isArray(j.input?.types) ? j.input.types : []), ...(j.input?.preset ? [j.input.preset] : [])]); for (const id of ids) uses.set(`${j.toolId}|${id}`, (uses.get(`${j.toolId}|${id}`) ?? 0) + 1); }
      items = items.map((p: any) => ({ ...p, uses: uses.get(`${p.toolId}|${p.id}`) ?? 0 })).sort((a: any, b: any) => b.uses - a.uses); }
    if (sort === 'new') items = [...items].sort((a: any, b: any) => (b.addedAt ? Date.parse(b.addedAt) : 0) - (a.addedAt ? Date.parse(a.addedAt) : 0));
    if (vcat === 'trending') items = items.filter((p: any) => (p.uses ?? 0) > 0);
    if (vcat === 'new') { const newest = Math.max(0, ...items.map((p: any) => (p.addedAt ? Date.parse(p.addedAt) : 0))); items = items.filter((p: any) => p.addedAt && Date.parse(p.addedAt) >= newest - 14 * 86400_000 && Date.parse(p.addedAt) > Date.parse('2026-10-16')); }
    // Page 11: ?provider= (presets that run on that model) &category= (exact)
    if (req.query.provider) items = items.filter((p: any) => !p.providers || p.providers.includes(req.query.provider));
    if (req.query.category) items = items.filter((p: any) => (p.category ?? p.group) === req.query.category);
    if (req.query.toolId === 'camera' && !sort && !vcat) items = [...items].sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999));
    // paging: ?media=image|video|audio (the tool's output kind) &limit=1–200 (no limit = all) &cursor=<offset from nextCursor>.
    if (req.query.media) { if (!['image', 'video', 'audio'].includes(req.query.media)) return reply.code(400).send({ error: 'media must be image, video or audio', errorType: 'validation', issues: [{ code: 'invalid', field: 'media', message: 'media must be image, video or audio' }] });
      const kindOf = (id: string) => (getTool(id) as any)?.outputKind ?? (/image|soul|photo/.test(id) ? 'image' : /voice|audio|music|sound|tts/.test(id) ? 'audio' : 'video'); items = items.filter((p: any) => (p.media ?? kindOf(p.toolId)) === req.query.media); }
    const total = items.length; const off = Math.max(0, Number(req.query.cursor) || 0); const lim = req.query.limit ? Math.min(200, Math.max(1, Number(req.query.limit) || 60)) : null;
    if (lim) items = items.slice(off, off + lim);
    // Page 16 (Oct 17): every item carries source 'ours', uses (all-time runs; trending uses the window), refThumbs[] and prefill (same shape as /api/examples/:id/prefill) for Recreate.
    { const all = new Map<string, number>(); for (const j of jobs.values()) { if (!countsAsRun(j) || ['failed', 'canceled', 'blocked'].includes(j.status)) continue; for (const id of new Set<string>([...(Array.isArray(j.input?.types) ? j.input.types : []), ...(j.input?.preset ? [j.input.preset] : [])])) all.set(`${j.toolId}|${id}`, (all.get(`${j.toolId}|${id}`) ?? 0) + 1); }
      const { examplePrefill } = await import('./routesBatch1.js');
      items = await Promise.all(items.map(async (p: any) => ({ ...p, source: 'ours', uses: (p.uses ?? all.get(`${p.toolId}|${p.id}`) ?? 0) + (sort === 'trending' ? 0 : (getKv<Record<string, number>>('presetUses', {})[`${p.toolId}|${p.id}`] ?? 0)), runs: all.get(`${p.toolId}|${p.id}`) ?? 0, picks: getKv<Record<string, number>>('presetUses', {})[`${p.toolId}|${p.id}`] ?? 0, refThumbs: p.refThumbs ?? (Array.isArray(p.refs) ? p.refs : []), mode: p.mode ?? (getTool(p.toolId) as any)?.outputKind ?? null,
        prefill: await examplePrefill({ id: `preset:${p.toolId}:${p.id}`, toolId: p.toolId, preset: p.id, types: [p.id], prompt: '', ...(Array.isArray(p.providers) && p.providers[0] ? { provider: p.providers[0] } : {}) } as any).catch(() => null) }))); }
    if ((req.query as any).sort === 'popular') items = [...items].sort((a: any, b: any) => (b.uses ?? 0) - (a.uses ?? 0));
    const categories = req.query.toolId === 'camera' ? (await import('./cinema/cameraCatalog.js')).CAMERA_CATEGORIES.filter((c) => tools[0]?.presets?.some((p: any) => p.category === c)).concat(['trending', 'new'] as any) : [...new Set(tools.flatMap((t) => (t.presets ?? []).map((p: any) => p.category ?? p.group).filter(Boolean)))];
    return { toolId: req.query.toolId ?? null, source, communityAvailable: false, categories, items, total, cursor: lim ? off : null, limit: lim, nextCursor: lim && off + lim < total ? String(off + lim) : null, sort, byTool: Object.fromEntries(tools.map((t) => [t.id, (t.presets ?? []).length])) };
  });
  /** Use counter (GAP-MATRIX 16): the client calls this when a preset is picked / Recreate is pressed. {toolId?} disambiguates ids shared across tools.
   *  → {id, toolId, uses (runs + picks), runs, picks}. Unknown preset → 404. */
  app.post<{ Params: { id: string }; Body: { toolId?: string } }>('/api/presets/:id/use', async (req, reply) => {
    const tid = (req.body as any)?.toolId ?? (req.query as any)?.toolId;
    const t = toolsList().find((x) => (!tid || x.id === tid) && (x.presets ?? []).some((p: any) => p.id === req.params.id));
    if (!t) return reply.code(404).send({ error: `unknown preset ${req.params.id}${tid ? ` for ${tid}` : ''}`, errorType: 'not_found' });
    const k = `${t.id}|${req.params.id}`; const u = getKv<Record<string, number>>('presetUses', {}); u[k] = (u[k] ?? 0) + 1; setKv('presetUses', u);
    let runs = 0; for (const j of jobs.values()) { if (!countsAsRun(j) || j.toolId !== t.id || ['failed', 'canceled', 'blocked'].includes(j.status)) continue; if ((Array.isArray(j.input?.types) && j.input.types.includes(req.params.id)) || j.input?.preset === req.params.id) runs++; }
    return { id: req.params.id, toolId: t.id, uses: runs + u[k], runs, picks: u[k] };
  });
  /** Page 11 preset detail: GET /api/presets/:id[?toolId=] → {preset (+ toolId), examples[] (our samples + finished jobs that used it, newest first)}. 404 unknown. */
  app.get<{ Params: { id: string }; Querystring: { toolId?: string } }>('/api/presets/:id', async (req, reply) => {
    const r = await app.inject({ method: 'GET', url: `/api/presets${req.query.toolId ? `?toolId=${encodeURIComponent(req.query.toolId)}` : ''}` }); if (r.statusCode !== 200) return reply.code(r.statusCode).send(r.json());
    const all: any[] = (r.json() as any).items; const p = all.find((x) => x.id === req.params.id && (!req.query.toolId || x.toolId === req.query.toolId)) ?? all.find((x) => `${x.toolId}:${x.id}` === req.params.id);
    if (!p) return reply.code(404).send({ error: `unknown preset ${req.params.id}`, errorType: 'validation', issues: [{ code: 'unknown', field: 'id', message: 'Unknown preset id (GET /api/presets).' }] });
    const own = [p.previewUrl, p.previewWebm].filter(Boolean).map((url: string) => ({ kind: 'sample', url, posterUrl: p.posterUrl ?? null }));
    const runs = [...jobs.values()].filter((j) => !(j as any).seed && j.toolId === p.toolId && j.status === 'done' && j.outputs?.length && (Array.isArray(j.input?.types) ? j.input.types : []).concat(j.input?.preset ? [j.input.preset] : []).includes(p.id))
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 12).map((j) => ({ kind: 'job', jobId: j.id, url: j.outputs[0].url, createdAt: j.createdAt }));
    return { preset: p, examples: [...own, ...runs] };
  });
  /** MCP tool list, read from the MCP server's own declarations (mcp/src/server.ts registerTool calls). Permissions (mcp/src/permissions.ts) can hide some at runtime. */
  app.get('/api/mcp/tools', async () => {
    const src = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../mcp/src/server.ts'); if (!existsSync(src)) return { items: [], total: 0, source: null, note: 'mcp/ not found next to the server' };
    const text = readFileSync(src, 'utf8');
    // description is a '…' string or a `…` template whose ${NAME} parts are `const NAME = '…'` strings in the same file (get_job / wait_for_job share JOB_DESC)
    const constStr = (name: string) => text.match(new RegExp(`const ${name} = '((?:[^'\\\\]|\\\\.)*)'`))?.[1] ?? '';
    const items = [...text.matchAll(/registerTool\(\s*'([a-z0-9_]+)'\s*,\s*\{\s*title:\s*'((?:[^'\\]|\\.)*)'\s*,\s*description:\s*(?:'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)/g)]
      .map((m) => ({ name: m[1], title: m[2], description: (m[3] ?? m[4].replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, n: string) => constStr(n))).replace(/\\'/g, "'") }));
    // Toolsets (mcp/src/toolsets.ts): which group each tool is in; only `core` is on by default (OPENHIGGSFIELD_MCP_TOOLSETS turns on more).
    const tsSrc = (() => { try { return readFileSync(path.join(path.dirname(src), 'toolsets.ts'), 'utf8'); } catch { return ''; } })();
    const sets: Record<string, string[]> = {}; for (const m of tsSrc.matchAll(/^\s*([a-z]+): \[([^\]]*)\]/gm)) sets[m[1]] = [...m[2].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
    const defaults = (tsSrc.match(/DEFAULT_TOOLSETS = \[([^\]]*)\]/)?.[1].match(/'([a-z]+)'/g) ?? ["'core'"]).map((x) => x.replace(/'/g, ''));
    const setOf = (n: string) => Object.entries(sets).find(([, v]) => v.includes(n))?.[0] ?? null;
    const withSets = items.map((t) => { const toolset = setOf(t.name); return { ...t, toolset, default: toolset == null || defaults.includes(toolset) }; });
    return { items: withSets, total: withSets.length, toolsets: sets, defaultToolsets: defaults, source: 'mcp/src/server.ts', note: 'Tools the MCP server declares, with their toolset; only the default toolsets are on unless OPENHIGGSFIELD_MCP_TOOLSETS adds more. A permissions file can hide some at runtime.' };
  });
  /** Choose a plan: documented stub. A local open-source install has no billing and never takes payments; plans in GET /api/pricing are samples.
   *  Valid plan id → 200 {chosen:false, charged:false, notice}; unknown → 404. Nothing changes (credits, balance). */
  app.post<{ Params: { id: string } }>('/api/plans/:id/choose', async (req, reply) => {
    const plans: any[] = ((await app.inject({ method: 'GET', url: '/api/pricing' })).json() as any).plans ?? []; const plan = plans.find((p) => p.id === req.params.id);
    if (!plan) return reply.code(404).send({ error: `unknown plan ${req.params.id}`, errorType: 'validation', issues: [{ code: 'unknown', field: 'id', message: `Plans: ${plans.map((p) => p.id).join(', ')}.` }] });
    return { chosen: false, charged: false, payment: null, plan: { id: plan.id, name: plan.name, sample: !!plan.sample }, notice: 'Imagination Is All You Need is self-hosted: there is no billing and no payment is taken. Plans are samples for the demo; credits come from your own provider keys or run free, locally.' };
  });
  app.get('/api/video-presets', async () => { const { videoPresets } = await import('./tools/h3/videoCaps.js'); const items = videoPresets(); return { items, total: items.length, field: 'videoPreset', toolId: 'h3-video' }; });
  /** Shared history for the Elements picker: finished generations across tools (same jobs + favourites data as Assets).
   * ?kind=image|video|audio|all (default image) &liked=1 (favourites only) &toolId= &limit=1–100 (default 30) &cursor=<offset from nextCursor>. */
  // Quote from uploaded reference videos: multipart fields (same as the GET price query) + refVideos files. Each clip is ffprobed (as at job upload),
  // the total goes in as refVideoSeconds, and the answer is the GET price for that query (quote = charge). Files are deleted afterwards.
  app.post<{ Params: { id: string } }>('/api/tools/:id/price', async (req, reply) => {
    if (!getTool(req.params.id)) return reply.code(404).send({ error: `unknown tool ${req.params.id}` });
    const { mkdtempSync, writeFileSync } = await import('node:fs'); const os = await import('node:os'); const { spawn } = await import('node:child_process');
    const dur = (f: string) => new Promise<number>((ok) => { const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]); let o = ''; p.stdout.on('data', (d) => (o += d)); p.on('close', () => ok(Number(o.trim()) || 0)); p.on('error', () => ok(0)); });
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ohf-quote-')); const q: Record<string, string> = {}; const each: number[] = [];
    try {
      for await (const part of (req as any).parts()) {
        if (part.type === 'file') { if (part.fieldname !== 'refVideos') { q[part.fieldname] ??= '1'; /* file present → marker (app mode switch, e.g. UGC Ad image → i2v) */ part.file.resume(); continue; } const f = path.join(dir, `v${each.length}${path.extname(part.filename || '') || '.mp4'}`); writeFileSync(f, await part.toBuffer()); const s = await dur(f);
          if (!(s > 0)) return reply.code(400).send({ error: 'Could not read a reference video\'s length.', errorType: 'validation', issues: [{ code: 'format', field: 'refVideos', message: 'Could not read a reference video\'s length.' }] }); each.push(Math.round(s * 100) / 100); }
        else q[part.fieldname] = String(part.value);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
    if (each.length) q.refVideoSeconds = String(Math.round(each.reduce((a, b) => a + b, 0) * 100) / 100);
    const r = await app.inject({ method: 'GET', url: `/api/tools/${req.params.id}/price?${new URLSearchParams(q)}` });
    return reply.code(r.statusCode).send({ ...(r.json() as Record<string, unknown>), refVideoSeconds: Number(q.refVideoSeconds) || 0, refVideoSecondsEach: each });
  });
  app.get<{ Querystring: { kind?: string; liked?: string; toolId?: string; limit?: string; cursor?: string; status?: string } }>('/api/history', async (req, reply) => {
    const q = req.query; const kind = q.kind || 'all'; // all media types by default
    const STATUSES = ['done', 'failed', 'running', 'queued', 'blocked', 'canceled']; const st = (q.status || 'done').split(',').map((s) => s.trim()).filter(Boolean);
    if (!st.length || st.some((s) => !STATUSES.includes(s))) return reply.code(400).send({ error: `status must be one or more of ${STATUSES.join('|')}`, errorType: 'validation', issues: [{ code: 'invalid', field: 'status', message: `status must be one or more of ${STATUSES.join('|')}` }] });
    if (!['image', 'video', 'audio', 'all'].includes(kind)) return reply.code(400).send({ error: 'kind must be image, video, audio or all', errorType: 'validation', issues: [{ code: 'invalid', field: 'kind', message: 'kind must be image, video, audio or all' }] });
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 30)); const off = Math.max(0, Number(q.cursor) || 0); const liked = /^(1|true|on|yes)$/i.test(q.liked ?? '');
    const kindOf = (url: string) => (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) ? 'image' : /\.(mp4|mov|webm)(\?|$)/i.test(url) ? 'video' : /\.(mp3|wav|m4a|flac|ogg)(\?|$)/i.test(url) ? 'audio' : 'other');
    const all = [...jobs.values()].filter((j) => !(j as any).seed && st.includes(j.status) && (j.status !== 'done' || j.outputs?.length) && !lib.metaOf(j.id).deletedAt && (!q.toolId || j.toolId === q.toolId) && (!liked || lib.metaOf(j.id).favourite))
      .sort((a, b) => b.createdAt - a.createdAt)
      .flatMap((j): Record<string, any>[] => j.status !== 'done' || !j.outputs?.length ? [{ id: j.id, jobId: j.id, index: null, toolId: j.toolId, status: j.status, kind: 'other', url: null, label: null, prompt: String(j.input?.prompt ?? ''), liked: !!lib.metaOf(j.id).favourite, createdAt: j.createdAt, error: (j as any).error ?? null }]
        : j.outputs.map((o, k) => ({ id: `${j.id}:${k}`, jobId: j.id, index: k, toolId: j.toolId, status: j.status, kind: kindOf(o.url), url: o.url, label: o.label, prompt: String(j.input?.prompt ?? ''), liked: !!lib.metaOf(j.id).favourite, createdAt: j.createdAt })))
      .filter((x) => kind === 'all' || x.kind === kind || (x.url == null && x.kind === 'other')); // non-done rows have no media; kept under any kind
    const items = all.slice(off, off + limit);
    return { items, total: all.length, limit, cursor: off, nextCursor: off + limit < all.length ? String(off + limit) : null };
  });
  // 2026-10-25 run lanes (queue.ts): lanes.local / lanes.cloud = {running, waiting, limit}; concurrency = both limits together; lanes.paid / free / active / activeFree as before.
  app.get('/api/queue', async () => ({ queued: queuedCount(), maxQueued: MAX_QUEUED, running: [...jobs.values()].filter((j) => j.status === 'running').length, concurrency: CONCURRENCY, localConcurrency: LOCAL_CONCURRENCY, cloudConcurrency: CLOUD_CONCURRENCY, maxParallel: MAX_PARALLEL, lanes: laneSizes() }));

  const access = (j: Job | undefined, token?: string) => !!j && !lib.metaOf(j.id).deletedAt && (!token || (lib.metaOf(j.id).shareToken === token));
  app.get<{ Params: { id: string }; Querystring: { token?: string } }>('/api/jobs/:id/download.zip', async (req, reply) => {
    const j = jobs.get(req.params.id);
    if (!access(j, req.query.token)) return reply.code(404).send({ error: 'not found', errorType: 'not_found' });
    if (!j!.outputs.length) return reply.code(409).send({ error: 'This job has no outputs yet.', errorType: 'validation' });
    return reply.type('application/zip').header('Content-Disposition', `attachment; filename="${appFileName(j!.id, 'zip')}"`).send(await zipFor([j!], { noPrompt: !!req.query.token && !lib.metaOf(j!.id).published?.showPrompt }));
  });
  app.get<{ Params: { token: string } }>('/api/share/:token/download.zip', async (req, reply) => {
    const id = lib.jobByToken(req.params.token); const j = id ? jobs.get(id) : undefined;
    if (!access(j) || !j!.outputs.length) return reply.code(404).send({ error: 'This link was revoked or never existed.', errorType: 'not_found' });
    return reply.type('application/zip').header('Content-Disposition', `attachment; filename="${appFileName(j!.id, 'zip')}"`).send(await zipFor([j!], { noPrompt: !lib.metaOf(j!.id).published?.showPrompt }));
  });
  /** Batch: ?ids=a,b,c (finished, not trashed) → one folder per job. */
  app.get<{ Querystring: { ids?: string } }>('/api/jobs/download.zip', async (req, reply) => {
    const list = (req.query.ids || '').split(',').map((s) => jobs.get(s.trim())).filter((j): j is Job => access(j) && !!j!.outputs.length);
    if (!list.length) return reply.code(400).send({ error: 'Pass ids=<id,id> of finished jobs.', errorType: 'validation' });
    return reply.type('application/zip').header('Content-Disposition', `attachment; filename="${appFileName(`${list.length}-jobs`, 'zip')}"`).send(await zipFor(list.slice(0, 100)));
  });
  /** #9 Trash: delete forever + manual sweep. Auto sweep every hour (TRASH_DAYS, default 30 (ours); 0 = never). */
  app.delete<{ Params: { id: string } }>('/api/trash/:id', async (req, reply) => (lib.metaOf(req.params.id).deletedAt && purge(req.params.id) ? { ok: true, purged: req.params.id, removed: { files: lastPurge.files, bytes: lastPurge.bytes, keptShared: lastPurge.kept } } : reply.code(404).send({ error: 'Not in Trash.', errorType: 'not_found' })));
  /** PB-24: Restore all (everything in Trash back to Assets) and Empty trash (delete every Trash item forever). Empty trash needs
   *  {confirm: true} in the body, so a stray request can't wipe Trash; the UI only sends it after its own in-page confirmation. */
  app.post('/api/trash/restore-all', async () => { const ids = trashedIds(); for (const id of ids) lib.restore(id); return { ok: true, restored: ids.length }; });
  app.post<{ Body: { confirm?: unknown } }>('/api/trash/empty', async (req, reply) => {
    if (req.body?.confirm !== true) return reply.code(400).send({ error: 'Send {"confirm": true} to empty Trash. This deletes every item in Trash forever.', errorType: 'validation', code: 'confirm_required' });
    const ids = trashedIds(); if (!ids.length) return { ok: true, purged: 0, removed: { files: 0, bytes: 0 } };
    const live = liveRefs(new Set(ids)); let n = 0, files = 0, bytes = 0, kept = 0;
    for (const id of ids) if (purge(id, live)) { n++; files += lastPurge.files; bytes += lastPurge.bytes; kept += lastPurge.kept; }
    lastPurge = { files, bytes, kept }; return { ok: true, purged: n, removed: { files, bytes, keptShared: kept } };
  });
  app.post('/api/trash/sweep', async () => { const purged = sweepTrash(); return { purged, trashDays: TRASH_DAYS, removed: purged ? { files: lastPurge.files, bytes: lastPurge.bytes } : { files: 0, bytes: 0 } }; });
  sweepTrash(); setInterval(sweepTrash, 3600_000).unref();
  void stateOf;
}
