/**
 * Library databases (2026-10-27): two indexed, searchable lists that agents (MCP search_workflows / search_references) and the app browse.
 *
 * Workflows ("recipes", shared/libraryWorkflows.ts): every runnable workflow and chain of the Workflows page, every agent skill
 * (skills/<id>/SKILL.md), the user's saved looks, and researched ideas marked "idea, not built" (never runnable). The ideas come from a
 * private research file that is never in the repo: OPENHIGGSFIELD_WORKFLOW_IDEAS=<path>, else <data dir>/workflow-ideas.json; none = no ideas.
 * Models, where each runs and its price come from GET /api/tools (the same words as the app: shared/runLabel.ts).
 *   GET /api/library/workflows?q=&media=&kind=&status=&limit=&offset=     ranked (shared/bm25.ts); kind = workflow,chain,skill,saved,idea
 *   GET /api/library/workflows/:id                                        one recipe + how to put it on the Canvas
 *
 * References (media): every result (each output of your finished jobs), every upload and saved element (mediaLibrary.ts uploads), and the
 * app's shipped examples (shared/featured.ts). Each with kind, url, thumbnail, size / length, date, prompt, model, workflow, project, tags
 * (auto tags from the prompt + your own), favourite and source (generated | uploaded; the Examples project's results are generations).
 *   GET  /api/library/references?q=&kind=&source=&model=&project=&fav=&tag=&since=&until=&limit=&cursor=
 *   GET  /api/library/references/:id
 *   POST /api/library/references/:id/tags {tag}     add your own tag      DELETE /api/library/references/:id/tags/:tag   remove it
 * Privacy: local only. Only app URLs (/files/, /showcase/, /samples/, /examples/) leave; never a file system path, a remote URL or a key.
 *
 * Both indexes are built on first use and rebuilt when what they read has changed (db table writes: db.ts tableRev; the tool catalogue's
 * models and places; the ideas file; skills). Test: server/test/library-db.test.ts.
 */
import { IMAGE_PAGE } from './shared/pages.js';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { DATA_DIR } from './config.js';
import { env } from './env.js';
import { getKv, setKv, tableRev } from './db.js';
import { jobs, type Job } from './jobs.js';
import * as lib from './library.js';
import { uploads } from './mediaLibrary.js';
import { cachedMeta, kindOfUrl, localFileOf, probeOutput, type MediaKind } from './outputMeta.js';
import { imageDimsOfFile } from './imageDims.js';
import { engineNameOf } from './engineName.js';
import { getTool } from './tools/registry.js';
import { listUserLooks } from './workflowLooks.js';
import { runLabel, canRun } from './shared/runLabel.js';
import { wfEntryById } from './shared/workflowCatalog.js';
import { featureById } from './shared/imageFeatures.js';
import { Bm25Index, keywords, type SearchDoc } from './shared/bm25.js';
import { resultTitle } from './shared/shortTitle.js';
import { isLayerJob } from './shared/imageLayers.js';
import { catalogWorkflows, fromSkill, fromIdea, buildWorkflowIndex, searchWorkflows, type LibWorkflow, type LibModel, type LibStep } from './shared/libraryWorkflows.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKILLS_DIR = path.join(REPO, 'skills');
export const ideasFile = () => env('WORKFLOW_IDEAS')?.trim() || path.join(DATA_DIR, 'workflow-ideas.json');
const USD_PER_CREDIT = 0.01;

// ------------------------------------------------------------------ privacy
/** An app URL that is safe to hand out, or null (a file system path, a remote URL, anything outside the app's own media routes). */
export function publicUrl(u: unknown): string | null {
  const s = typeof u === 'string' ? u.trim() : ''; if (!s || s.includes('..') || /\s/.test(s)) return null;
  return /^\/(files|showcase|samples|examples)\/[\w./%@+=,-]+(\?[\w=&.-]*)?$/.test(s) ? s : null;
}
/** Free text with any host path taken out (a prompt that quoted a file). */
export const cleanText = (s: unknown): string => String(s ?? '').split(DATA_DIR).join('').replace(/(?:\/Users|\/home|\/private|\/var|\/tmp|\/Volumes|[A-Z]:\\)[^\s'"`)]*/g, '…').trim();

// ------------------------------------------------------------------ workflows
/** GET /api/tools as clients get it (the routing hook adds the models and places), so the database shows the app's own words. */
type ToolsFn = () => Promise<any[]>;
const engineOf = (m: any) => m.primaryEngine ?? m.engines?.[0];
/** A tool's runnable models for one workflow entry: its pins first (only those when modelsOnly), its mode's models, can-run only. */
function modelsFor(t: any, pins: string[], mode?: string, only?: boolean, engines?: string[]): LibModel[] {
  const all: any[] = t?.models ?? []; const modes: Record<string, string[]> = t?.app?.providerModes ?? {};
  let list = mode && Object.keys(modes).length ? all.filter((m) => (m.engines ?? []).some((g: string) => (modes[g] ?? []).includes(mode))) : all;
  if (engines?.length) { const use = new Set(engines); const l = list.filter((m) => (m.engines ?? []).some((g: string) => use.has(g))); if (l.length) list = l; }
  const pinned = pins.map((k) => all.find((m) => m.key === k)).filter(Boolean);
  list = only && pinned.length ? pinned : [...pinned, ...list.filter((m) => !pins.includes(m.key))];
  return list.filter(canRun).slice(0, 10).map((m, i) => { const r = runLabel(m); return { key: m.key, name: m.displayName ?? m.name ?? m.key, where: r.text, priceUsd: r.credits != null ? Math.round(r.credits * USD_PER_CREDIT * 10000) / 10000 : null, free: r.kind === 'free', default: i === 0 }; });
}
function enrich(w: LibWorkflow, tools: any[]): LibWorkflow {
  if (w.kind === 'workflow') {
    const e = wfEntryById(w.id.slice(2)); const t = tools.find((x) => x.id === w.runs.toolId);
    if (!t) return { ...w, runs: { ...w.runs, runnable: false } };
    let models = e ? modelsFor(t, e.models, e.mode, e.modelsOnly, e.hubId ? featureById(e.hubId)?.providers : undefined) : [];
    /* the example's own model leads (the Workflows page does the same), else a pin, else the tool's order */
    const ex = w.examples[0]?.model; const nm = (x: string | null | undefined) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const ix = ex ? models.findIndex((m) => nm(m.name) === nm(ex)) : -1; if (ix > 0) models = [models[ix], ...models.filter((_, i) => i !== ix)];
    models = models.map((m, i) => ({ ...m, default: i === 0 }));
    const lead = models[0] ? (t.models ?? []).find((m: any) => m.key === models[0].key) : null;
    const wf = lead ? (t.providers ?? []).find((p: any) => p.id === engineOf(lead))?.workflow ?? (t.providers ?? []).find((p: any) => (lead.engines ?? []).includes(p.id) && p.workflow)?.workflow : null;
    return { ...w, models, runs: { ...w.runs, runnable: !(t.models ?? []).length || models.length > 0 },
      source: wf ? { kind: wf.source, name: wf.name, url: wf.url ?? null, author: wf.author ?? null, licence: wf.licence ?? null } : { kind: 'ours', name: 'Imagination Is All You Need', url: null, author: null, licence: 'AGPL-3.0 (this repo)' } };
  }
  if (w.kind === 'chain' || w.kind === 'skill') {
    const steps: LibStep[] = w.steps.map((s) => { const t = tools.find((x) => x.id === s.toolId); const m = t && s.model ? (t.models ?? []).find((x: any) => x.key === s.model) : null; return m ? { ...s, model: m.displayName ?? m.name ?? s.model } : s; });
    const models: LibModel[] = []; for (const s of w.steps) { const t = tools.find((x) => x.id === s.toolId); if (!t) continue; const ms = modelsFor(t, s.model ? [s.model] : [], undefined, !!s.model); if (ms[0] && !models.some((x) => x.key === ms[0].key)) models.push({ ...ms[0], default: true }); }
    return { ...w, steps, models };
  }
  return w;
}
function readSkills(): LibWorkflow[] {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR).sort().map((d) => { try { return fromSkill(d, readFileSync(path.join(SKILLS_DIR, d, 'SKILL.md'), 'utf8')); } catch { return null; } }).filter((x): x is LibWorkflow => !!x);
}
export function readIdeas(file = ideasFile()): LibWorkflow[] {
  try { if (!existsSync(file)) return []; const raw = JSON.parse(readFileSync(file, 'utf8')); const list = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : [];
    return list.map(fromIdea).filter((x: LibWorkflow | null): x is LibWorkflow => !!x); } catch { return []; }
}
function savedLooks(): LibWorkflow[] {
  return listUserLooks().map((l) => { const url = publicUrl(l.exampleUrl); const toolName = getTool(l.toolId)?.name ?? l.toolId;
    return { id: `l-${l.id}`, kind: 'saved' as const, name: l.name, description: `Your saved look on ${toolName}${l.modelName ? ` · ${l.modelName}` : ''}`, job: `Make more like this with ${toolName}`,
      tags: ['saved look', 'yours', ...keywords(l.prompt, 4)], category: 'Your saved looks', mediaIn: ['text' as const], mediaOut: ['image' as const],
      steps: [{ id: null, name: toolName, toolId: l.toolId, model: l.modelName, canvas: l.toolId === 'create-image' ? 'create' : null }], models: [],
      examples: url ? [{ url, poster: url, prompt: cleanText(l.prompt) || null, model: l.modelName, place: null, costUsd: null, jobId: l.jobId }] : [],
      runs: { where: 'app' as const, href: `${IMAGE_PAGE}?look=${encodeURIComponent(l.id)}`, toolId: l.toolId, runnable: true }, status: 'ready' as const, source: null, extra: cleanText(l.prompt) }; });
}
const mtime = (f: string) => { try { return statSync(f).mtimeMs; } catch { return 0; } };
let wfCache: { sig: string; list: LibWorkflow[]; index: Bm25Index; at: number } | null = null; let toolsSig = ''; let toolsAt = 0;
const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12);
/** The workflows database, rebuilt when the catalogue's models / places (checked at most every 10 s), the saved looks, skills or ideas change. */
export async function workflowsDb(tools: ToolsFn, now = Date.now()) {
  let t: any[] | null = null;
  if (!wfCache || now - toolsAt > 10_000) { t = await tools(); toolsAt = now; toolsSig = hash(JSON.stringify(t.map((x) => [x.id, (x.models ?? []).map((m: any) => [m.key, (m.runsOn ?? []).map((r: any) => `${r.id}:${r.status}:${r.credits}`)])]))); }
  const skillsM = existsSync(SKILLS_DIR) ? readdirSync(SKILLS_DIR).map((d) => mtime(path.join(SKILLS_DIR, d, 'SKILL.md'))).join(',') : '';
  const sig = `${toolsSig}|${tableRev.user_looks}|${mtime(ideasFile())}|${ideasFile()}|${hash(skillsM)}`;
  if (wfCache?.sig === sig) return wfCache;
  t ??= await tools();
  const list = [...catalogWorkflows().map((w) => enrich(w, t!)), ...readSkills().map((w) => enrich(w, t!)), ...savedLooks(), ...readIdeas()];
  wfCache = { sig, list, index: buildWorkflowIndex(list), at: now }; return wfCache;
}
/** How an agent puts a recipe on the Canvas: one canvas_batch (or canvas_add_card per step), cards wired in order. Drafts only. */
export function canvasHint(w: LibWorkflow) {
  const steps = w.steps.filter((s) => s.canvas);
  if (w.status === 'idea') return { ok: false, note: 'An idea, not built: it can\'t go on the Canvas or run. Ask the user whether to build it.' };
  if (!steps.length) return { ok: false, note: w.runs.href ? `No Canvas card for this one: open it in the app (${w.runs.href}).` : 'No Canvas card for this one.' };
  const items = steps.map((s, i) => ({ kind: 'add_card', ref: `k${i + 1}`, workflow: s.canvas, name: s.name.slice(0, 80), ...(i ? { inputs_from: [`k${i}`] } : {}) }));
  return { ok: true, tool: 'canvas_batch', args: { board_id: '<board id from canvas_list_boards>', items: [...items, ...(items.length > 1 ? [{ kind: 'add_frame', name: w.name, around: items.map((x) => x.ref) }] : [])] },
    note: `Drafts only: nothing runs. Fill each card's prompt, then canvas_propose_run and wait for the user's Go. Without canvas_batch, call canvas_add_card per step with inputs_from the previous card.${steps.length < w.steps.length ? ` ${w.steps.length - steps.length} step(s) have no Canvas card: do them in the app.` : ''}` };
}

// ------------------------------------------------------------------ references
export type RefSource = 'generated' | 'uploaded';
export interface RefItem {
  id: string; kind: MediaKind; source: RefSource; url: string; thumbUrl: string | null; width: number | null; height: number | null; durationSec: number | null; createdAt: number;
  title: string; /** a few words for a small tile (shared/shortTitle.ts) */ short?: string; prompt: string | null; model: string | null; modelKey: string | null; workflow: string | null; toolId: string | null; jobId: string | null;
  project: { id: string; name: string } | null; projectIds: string[]; tags: string[]; autoTags: string[]; userTags: string[]; favourite: boolean;
}
const TAGS_KV = 'libraryTags'; let tags: Record<string, string[]> = getKv(TAGS_KV, {}); let tagsRev = 0;
export const userTagsOf = (id: string) => tags[id] ?? [];
export const cleanTag = (t: unknown): string | null => { const s = String(t ?? '').toLowerCase().replace(/[^\p{L}\p{N} -]+/gu, ' ').replace(/\s+/g, ' ').trim(); return s && s.length <= 40 ? s : null; };
function setTags(id: string, next: string[]) { tags = { ...tags }; if (next.length) tags[id] = next; else delete tags[id]; tagsRev++; setKv(TAGS_KV, tags); }
const projectOf = (ids: string[]) => { const p = ids.map((x) => lib.getProject(x)).find(Boolean); return p ? { id: p.id, name: p.name } : null; };
const thumbOf = (url: string, kind: MediaKind, poster?: string | null) => publicUrl(poster) ?? (kind === 'image' ? url : kind === 'video' && /^\/(files|samples|examples|showcase)\//.test(url) ? `/api/media/thumb?url=${encodeURIComponent(url)}` : null);
const mk = (r: Omit<RefItem, 'tags' | 'autoTags' | 'userTags'>): RefItem => { const autoTags = keywords(r.prompt ?? r.title, 6); const userTags = userTagsOf(r.id); return { ...r, autoTags, userTags, tags: [...new Set([...userTags, ...autoTags])] }; };

function generations(): RefItem[] {
  const out: RefItem[] = [];
  for (const j of jobs.values() as IterableIterator<Job & { seed?: boolean }>) {
    const m = lib.metaOf(j.id); if (j.seed || m.deletedAt || j.status !== 'done') continue;
    const outs = j.outputs?.length ? j.outputs : j.resultUrl ? [{ label: 'Result', url: j.resultUrl }] : [];
    const urls = outs.map((o) => publicUrl(o.url)); const still = urls.find((u) => u && kindOfUrl(u) === 'image') ?? null;
    const prompt = cleanText(j.input?.prompt) || null; const tool = getTool(j.toolId); let model: string | null = null; try { model = engineNameOf(j); } catch { model = null; }
    outs.forEach((o, k) => { const url = urls[k]; const kind = url ? kindOfUrl(url) : null; if (!url || !kind || !localFileOf(url)) return; // a missing file is left out (no broken tiles)
      out.push(mk({ id: `gen-${j.id}-${k}`, kind, source: 'generated', url, thumbUrl: thumbOf(url, kind, kind === '3d' ? still : null), width: null, height: null, durationSec: null, createdAt: (j.finishedAt ?? j.createdAt) - k,
        title: cleanText(m.title) || (prompt ? prompt.slice(0, 70) : `${tool?.name ?? j.toolId}${outs.length > 1 ? ` · ${o.label}` : ''}`), prompt, short: resultTitle({ title: m.title, prompt, feature: tool?.name ?? j.toolId, layer: isLayerJob(j) ? k : null }), model, modelKey: j.modelKey ?? null,
        workflow: tool?.name ?? j.toolId, toolId: j.toolId, jobId: j.id, project: projectOf(m.projectId ? [m.projectId] : []), projectIds: m.projectId && lib.getProject(m.projectId) ? [m.projectId] : [], favourite: !!m.favourite })); });
  }
  return out;
}
async function uploadRefs(): Promise<RefItem[]> {
  return (await uploads()).map((u) => { const url = publicUrl(u.url); if (!url) return null; const kind = kindOfUrl(url); if (!kind) return null; const el = /^Element/.test(u.label ?? '');
    return mk({ id: `up-${hash(url)}`, kind, source: 'uploaded', url, thumbUrl: thumbOf(url, kind, u.thumbUrl), width: null, height: null, durationSec: null, createdAt: u.createdAt, title: cleanText(u.name) || 'Upload',
      prompt: null, model: null, modelKey: null, workflow: el ? u.label! : u.toolName ?? null, toolId: u.toolId ?? null, jobId: null, project: projectOf(u.projectIds ?? []), projectIds: u.projectIds ?? [], favourite: false }); })
    .filter((x): x is RefItem => !!x);
}
const refDoc = (r: RefItem): SearchDoc => ({ id: r.id, name: r.title, tags: [...r.tags, r.kind], text: r.prompt ?? '', body: [r.model, r.modelKey, r.workflow, r.project?.name, r.source].filter(Boolean).join(' ') });
interface RefDb { sig: string; list: RefItem[]; byId: Map<string, RefItem>; index: Bm25Index; at: number }
let refCache: RefDb | null = null; let building: Promise<RefDb> | null = null;
/** The references database. Rebuilt when jobs, their meta, uploads, elements, projects or tags changed (at most every 2 s; a tag change at once). */
export async function referencesDb(now = Date.now()): Promise<RefDb> {
  const sig = `${jobs.size}:${tableRev.jobs}:${tableRev.job_meta}:${tableRev.uploads}:${tableRev.elements}:${tableRev.projects}:${tagsRev}`;
  if (refCache && (refCache.sig === sig || (now - refCache.at < 2000 && refCache.sig.endsWith(`:${tagsRev}`)))) return refCache;
  if (building) return building;
  building = (async () => { const list = [...generations(), ...await uploadRefs()].sort((a, b) => b.createdAt - a.createdAt);
    const db: RefDb = { sig, list, byId: new Map(list.map((r) => [r.id, r])), index: new Bm25Index(list.map(refDoc)), at: Date.now() }; refCache = db; return db; })().finally(() => { building = null; });
  return building;
}
/** A WebP's size from its header (VP8, VP8L, VP8X), or null. */
export function webpDims(file: string): { width: number; height: number } | null {
  let fd: number | null = null;
  try { fd = openSync(file, 'r'); const b = Buffer.alloc(30); readSync(fd, b, 0, 30, 0);
    if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null; const t = b.toString('ascii', 12, 16);
    if (t === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (t === 'VP8L') { const v = b.readUInt32LE(21); return { width: 1 + (v & 0x3fff), height: 1 + ((v >> 14) & 0x3fff) }; }
    if (t === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    return null; } catch { return null; } finally { if (fd != null) closeSync(fd); }
}
/** Sizes and lengths for the items on one page: the probe cache, else an image's own header. Nothing probes the whole library. */
const dimsMemo = new Map<string, { width: number | null; height: number | null }>();
function withSize(r: RefItem): RefItem {
  if (r.width && r.height) return r; const c = cachedMeta(r.url);
  if (c && (c.width || c.durationSec)) return { ...r, width: c.width ?? null, height: c.height ?? null, durationSec: c.durationSec ?? r.durationSec };
  if (r.kind === 'image') { let d = dimsMemo.get(r.url); if (!d) { const f = localFileOf(r.url); const x = f ? imageDimsOfFile(f) ?? webpDims(f) : null; d = { width: x?.width ?? null, height: x?.height ?? null }; dimsMemo.set(r.url, d); } return { ...r, ...d }; }
  if (r.kind === 'video' && !c) void probeOutput(r.url).catch(() => null); // known on the next look; only items someone is looking at are probed
  return r;
}
export interface RefQuery { q?: string; kind?: string; source?: string; model?: string; project?: string; fav?: string; tag?: string; since?: string; until?: string; limit?: string | number; cursor?: string }
const when = (v?: string): number | null => { if (!v) return null; const n = Number(v); if (Number.isFinite(n) && n > 1e9) return n; const t = Date.parse(v); return Number.isFinite(t) ? t : null; };
export async function searchReferences(o: RefQuery) {
  const db = await referencesDb(); const kinds = String(o.kind ?? '').split(',').map((x) => x.trim()).filter(Boolean); const sources = String(o.source ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const model = String(o.model ?? '').toLowerCase().trim(); const proj = String(o.project ?? '').trim(); const fav = /^(1|true|yes)$/i.test(String(o.fav ?? '')); const tag = cleanTag(o.tag);
  const since = when(o.since); const until = when(o.until);
  const keep = (d: SearchDoc) => { const r = db.byId.get(d.id)!;
    return (!kinds.length || kinds.includes(r.kind)) && (!sources.length || sources.includes(r.source)) && (!model || `${r.model ?? ''} ${r.modelKey ?? ''}`.toLowerCase().includes(model))
      && (!proj || proj === 'all' || (proj === 'none' ? !r.projectIds.length : r.projectIds.includes(proj))) && (!fav || r.favourite) && (!tag || r.tags.includes(tag))
      && (since == null || r.createdAt >= since) && (until == null || r.createdAt <= until); };
  const hits = db.index.search(o.q ?? '', keep); const off = Math.max(0, Number.parseInt(String(o.cursor ?? '0'), 10) || 0); const lim = Math.min(100, Math.max(1, Number(o.limit) || 24));
  const page = hits.slice(off, off + lim);
  return { q: String(o.q ?? ''), total: hits.length, nextCursor: off + lim < hits.length ? String(off + lim) : null, items: page.map((h) => ({ ...withSize(db.byId.get(h.id)!), score: h.score, partial: h.partial })) };
}

// ------------------------------------------------------------------ routes
export function registerLibrary(app: FastifyInstance, d: { tools: ToolsFn }) {
  app.get<{ Querystring: { q?: string; media?: string; kind?: string; status?: string; limit?: string; offset?: string } }>('/api/library/workflows', async (req) => {
    const db = await workflowsDb(d.tools); const q = req.query;
    const r = searchWorkflows(db.list, db.index, { q: q.q, media: q.media, kind: q.kind, status: q.status, limit: Number(q.limit) || 20, offset: Number(q.offset) || 0 });
    const counts: Record<string, number> = {}; for (const w of db.list) counts[w.kind] = (counts[w.kind] ?? 0) + 1;
    return { q: q.q ?? '', total: r.total, counts, ideas: readIdeasPresent(), items: r.items };
  });
  app.get<{ Params: { id: string } }>('/api/library/workflows/:id', async (req, reply) => {
    const w = (await workflowsDb(d.tools)).list.find((x) => x.id === req.params.id); if (!w) return reply.code(404).send({ error: `No workflow ${req.params.id} in the library.`, errorType: 'not_found' });
    return { ...w, canvas: canvasHint(w) };
  });
  app.get<{ Querystring: RefQuery }>('/api/library/references', async (req) => searchReferences(req.query));
  app.get<{ Params: { id: string } }>('/api/library/references/:id', async (req, reply) => {
    const r = (await referencesDb()).byId.get(req.params.id); return r ? withSize(r) : reply.code(404).send({ error: `No reference ${req.params.id}.`, errorType: 'not_found' });
  });
  app.post<{ Params: { id: string }; Body: { tag?: unknown } }>('/api/library/references/:id/tags', async (req, reply) => {
    const r = (await referencesDb()).byId.get(req.params.id); if (!r) return reply.code(404).send({ error: `No reference ${req.params.id}.`, errorType: 'not_found' });
    const t = cleanTag(req.body?.tag); if (!t) return reply.code(400).send({ error: 'A tag is 1 to 40 letters, numbers, spaces or dashes.', errorType: 'validation' });
    const cur = userTagsOf(r.id); if (!cur.includes(t)) { if (cur.length >= 30) return reply.code(400).send({ error: 'At most 30 tags on one item.', errorType: 'validation' }); setTags(r.id, [...cur, t]); }
    return withSize((await referencesDb()).byId.get(r.id)!);
  });
  app.delete<{ Params: { id: string; tag: string } }>('/api/library/references/:id/tags/:tag', async (req, reply) => {
    const r = (await referencesDb()).byId.get(req.params.id); if (!r) return reply.code(404).send({ error: `No reference ${req.params.id}.`, errorType: 'not_found' });
    const t = cleanTag(req.params.tag); setTags(r.id, userTagsOf(r.id).filter((x) => x !== t)); return withSize((await referencesDb()).byId.get(r.id)!);
  });
}
/** Whether researched ideas are loaded (never the path itself). */
const readIdeasPresent = () => existsSync(ideasFile());
