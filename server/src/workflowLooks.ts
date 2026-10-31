/**
 * Workflows pages (2026-10-23): looks per image workflow, and looks you save from a result.
 *
 * A look = a saved recipe for ONE image workflow (prompt, settings, the model it was made on) plus real example outputs. Two kinds:
 *   - built-in: the image presets in shared/presets.ts (IMAGE_PRESETS), with the example image already in the repo (hero thumbnails);
 *   - mine: saved from a finished image result ("Save as look"), stored in SQLite (table user_looks), renamed and deleted by the user.
 * A look shows on the Workflows pages only when it has at least one real example: its repo image, its own result, or a finished run that
 * was started from it (the Create bar sends `lookId`; index.ts keeps it on job.input.lookId). Sample / demo runs never count, and a
 * trashed job or a missing file is skipped (the next example is used; with none left the look is hidden here, still usable elsewhere).
 *
 *   GET    /api/workflow-hub                          → { workflows[] }            (the /workflows grid)
 *   GET    /api/workflow-hub/made?limit=              → { items[] }               (your favourite / liked image results: "See how it was made")
 *   GET    /api/workflow-hub/:id                      → { workflow, looks[], best[] } (one workflow: looks + "Best on" with real quotes)
 *   GET    /api/workflow-hub/:id/looks/:lookId        → { workflow, look, results[], untested[] } (one look, per model)
 *   GET    /api/user-looks                            → { items[] }
 *   POST   /api/user-looks {jobId, name, output?}     → 201 look   (finished image results only; the job's workflow, prompt, settings, model)
 *   PATCH  /api/user-looks/:id {name}                 → look
 *   DELETE /api/user-looks/:id                        → { ok, id }
 * Prices: the server's own quote (GET /api/tools/:id/price, quote = charge) for models not run yet; what a run was charged for models that ran.
 */
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, put, del } from './db.js';
import { jobs, type Job } from './jobs.js';
import * as lib from './library.js';
import { DATA_DIR, SAMPLES_DIR } from './config.js';
import { featureById, featureIdOfJob, modelNameOf, workflowFor, workflowLine } from './shared/imageFeatures.js';
import { WORKFLOW_IDS, workflowQuoteQueries } from './shared/workflows.js';
import { CREATE_PRESET_FIELDS, presetHref, type ImagePreset, type PresetValue } from './shared/presets.js';
import { jobTiming } from './shared/jobTiming.js';

// ------------------------------------------------------------------ store (SQLite table user_looks)
export interface UserLook {
  id: string; name: string; workflow: string; prompt: string; settings: Record<string, PresetValue>;
  /** the model (provider id) it was made on, its name then, and the result it was saved from */
  provider: string; modelName: string | null; toolId: string; jobId: string; output: number; exampleUrl: string;
  createdAt: number; updatedAt: number;
}
export const USER_LOOKS_MAX = 500; export const LOOK_NAME_MAX = 80;
const looks = new Map<string, UserLook>(all<UserLook>('user_looks').map((l) => [l.id, l]));
export const listUserLooks = (): UserLook[] => [...looks.values()].sort((a, b) => b.createdAt - a.createdAt);
export const getUserLook = (id: string) => looks.get(id);
const store = (l: UserLook) => { looks.set(l.id, l); put('user_looks', l.id, l); return l; };
export const isUserLookId = (id: string) => /^my-[a-z0-9]{8}$/.test(id);

// ------------------------------------------------------------------ workflows
/** Intent chips on /workflows (one workflow can be in several). */
export const INTENTS = [{ id: 'make', label: 'Make from text' }, { id: 'change', label: 'Change a photo' }, { id: 'people', label: 'People' }, { id: 'products', label: 'Products' }, { id: 'fix', label: 'Fix and finish' }] as const;
export const WORKFLOW_INTENTS: Record<string, string[]> = {
  'create-image': ['make'], 'camera-lens': ['make'], 'character-sheet': ['make', 'people'], 'product-shot': ['make', 'products'],
  relight: ['change'], 'face-swap': ['change', 'people'], 'person-swap': ['change', 'people'], 'try-on': ['change', 'people', 'products'], 'material-swap': ['change', 'products'],
  'brush-edit': ['change', 'fix'], 'camera-angles': ['change'], expand: ['change', 'fix'], erase: ['fix'], 'remove-bg': ['fix', 'products'], upscale: ['fix'], 'image-layers': ['change', 'fix'],
};
/** The order on /workflows: Create Image first, then making, changing, fixing. */
export const HUB_ORDER = ['create-image', 'relight', 'character-sheet', 'face-swap', 'product-shot', 'upscale', 'camera-lens', 'person-swap', 'brush-edit', 'camera-angles', 'try-on', 'material-swap', 'expand', 'erase', 'remove-bg', 'image-layers'];
export const hubWorkflowIds = (): string[] => HUB_ORDER.filter((id) => id === 'create-image' || (WORKFLOW_IDS as readonly string[]).includes(id));

type Recipe = { id: string; name: string; tagline: string; needs: string; runner: { toolId: string }; status: string; surface: string | null; source: any; slots: any[]; controls: { field: string }[];
  modes: { default: string; whenSlot: Record<string, string> | null }; models: Record<string, string[]>; modelInfo?: Record<string, { name: string | null; workflow: { line: string; url: string | null; source: string } | null }>; prompt: { mode: string }; locked: Record<string, string>; output: any; prep?: any };
type ToolLike = { id: string; name: string; description?: string; providers: (string | { id: string })[]; app?: any; inputs: any[] };
export interface Deps { getTool: (id: string) => ToolLike | undefined; presets: () => ImagePreset[]; recipes: () => Recipe[] }
const pid = (p: string | { id: string }) => (typeof p === 'string' ? p : p.id);

/** One workflow as these pages need it: runner tool, models (default mode, quality order), the fields a look may set, the credit. */
export interface HubWorkflow { id: string; name: string; tagline: string; needs: string; toolId: string; mode: string; models: string[]; fields: string[]; intents: string[]; photo: boolean; promptMode: string; recipe: Recipe | null }
export function hubWorkflow(id: string, d: Deps): HubWorkflow | null {
  if (id === 'create-image') { const f = featureById('create-image')!; const t = d.getTool('create-image'); if (!t) return null; const tp = new Set(t.providers.map(pid));
    return { id, name: f.name, tagline: firstLine(t.description) || 'Describe it, get an image.', needs: 'Photo optional', toolId: 'create-image', mode: 'generate', models: f.providers.filter((p) => tp.has(p)), fields: CREATE_PRESET_FIELDS, intents: WORKFLOW_INTENTS[id], photo: false, promptMode: 'required', recipe: null }; }
  const r = d.recipes().find((x) => x.id === id && x.status === 'ready'); if (!r) return null;
  const fields = r.surface === 'rig' ? r.controls.map((c) => c.field) : r.controls.map((c) => c.field);
  return { id, name: r.name, tagline: r.tagline, needs: r.needs, toolId: r.runner.toolId, mode: r.modes.default, models: r.models[r.modes.default] ?? [], fields, intents: WORKFLOW_INTENTS[id] ?? [],
    photo: r.slots.some((s: any) => s.required), promptMode: r.prompt.mode, recipe: r };
}
const firstLine = (s?: string) => { const t = String(s ?? '').trim(); const m = /^(.+?[.!?])(\s|$)/.exec(t); return m ? m[1] : t; };
/** The workflow a job belongs to on these pages (null = not an image workflow). Edit Image results count as Create Image (same bar). */
export function workflowOfJob(j: Pick<Job, 'toolId' | 'input'>): string | null {
  const f = featureIdOfJob(j as any); if (!f) return null; if (f === 'edit-image') return 'create-image';
  return f === 'create-image' || (WORKFLOW_IDS as readonly string[]).includes(f) ? f : null;
}

// ------------------------------------------------------------------ examples
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOTS = [path.resolve(HERE, '../../web/public'), path.resolve(HERE, '../../web/dist')];
const isImageUrl = (u?: string | null) => !!u && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u);
/** Does the file behind a media URL still exist? (/files → data dir, /samples → samples, /examples → web public.) */
export function fileThere(url: string): boolean {
  const u = url.split('?')[0]; const safe = (root: string, rel: string) => { const p = path.resolve(root, rel); return p.startsWith(root) && existsSync(p); };
  try { if (u.startsWith('/files/')) return safe(path.resolve(DATA_DIR), decodeURIComponent(u.slice(7)));
    if (u.startsWith('/samples/')) return safe(path.resolve(SAMPLES_DIR), decodeURIComponent(u.slice(9)));
    if (u.startsWith('/examples/')) return WEB_ROOTS.some((r) => safe(r, decodeURIComponent(u.slice(1))));
    return /^\//.test(u); } catch { return false; }
}
/** A run counts as a real example: finished, not trashed, not a sample / demo, an image output whose file is still there. */
const isSampleJob = (j: Job) => !j.actualCost && (!!j.routing?.demo || !!j.simulated);
export function exampleOutput(j: Job, out = 0): string | null {
  if (j.status !== 'done' || lib.metaOf(j.id).deletedAt || isSampleJob(j)) return null;
  const u = j.outputs?.[out]?.url ?? (out === 0 ? j.resultUrl : null); return u && isImageUrl(u) && fileThere(u) ? u : null;
}
export interface Paid { credits: number | null; usd: number | null; runOn: string | null }
export interface Example { url: string; inputUrl: string | null; provider: string | null; modelName: string | null; jobId: string | null; paid: Paid | null; renderMs: number | null; at: number }
const modelOfJob = (j: Job, mode: string) => modelNameOf(j.provider, mode) ?? j.modelName ?? null;
const exampleOfJob = (j: Job, mode: string, out = 0): Example | null => { const url = exampleOutput(j, out); if (!url) return null;
  const inp = typeof j.input?.imageUrl === 'string' && isImageUrl(j.input.imageUrl) && fileThere(j.input.imageUrl) ? j.input.imageUrl : null;
  return { url, inputUrl: inp, provider: j.provider, modelName: modelOfJob(j, mode), jobId: j.id, paid: { credits: typeof j.cost === 'number' ? j.cost : null, usd: j.actualCost?.usd ?? null, runOn: j.runOn ?? null },
    renderMs: jobTiming(j).renderMs, at: j.finishedAt ?? j.createdAt }; };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** "Qwen Image 2.1 · Local" → the provider among this workflow's models with that name (null when none matches). */
export function providerOfModelName(label: string | null, models: string[], mode: string): string | null {
  if (!label) return null; const want = norm(label.split(' · ')[0]); return models.find((p) => norm(modelNameOf(p, mode) ?? '') === want) ?? null;
}

/** A look as these pages show it (built-in or mine), with its examples (newest first; its original model's first). */
export interface Look { id: string; kind: 'preset' | 'mine'; name: string; description: string; workflow: string; prompt: string; promptTemplate: string; subjectHint: string; settings: Record<string, PresetValue>;
  provider: string | null; modelName: string | null; href: string; createdAt: number | null; examples: Example[] }
function examplesFor(id: string, wf: HubWorkflow, own: Example[]): Example[] {
  const runs: Example[] = []; for (const j of jobs.values()) if (j.input?.lookId === id) { const e = exampleOfJob(j, wf.mode); if (e) runs.push(e); }
  const seen = new Set<string>(); return [...own, ...runs].filter((e) => (e.jobId ? !seen.has(e.jobId) && !!seen.add(e.jobId) : true)).sort((a, b) => b.at - a.at);
}
export function looksOf(wf: HubWorkflow, d: Deps): Look[] {
  const out: Look[] = [];
  for (const u of listUserLooks()) { if (u.workflow !== wf.id) continue; const j = jobs.get(u.jobId); const own = j ? exampleOfJob(j, wf.mode, u.output) : null;
    out.push({ id: u.id, kind: 'mine', name: u.name, description: '', workflow: u.workflow, prompt: u.prompt, promptTemplate: u.prompt, subjectHint: '', settings: u.settings, provider: u.provider, modelName: u.modelName,
      href: presetHref({ id: u.id, workflow: u.workflow }), createdAt: u.createdAt, examples: examplesFor(u.id, wf, own ? [own] : []) }); }
  for (const p of d.presets()) { if (p.workflow !== wf.id || !p.available) continue;
    const prov = providerOfModelName(p.thumbnailModel, wf.models, wf.mode);
    const own: Example[] = p.thumbnail && fileThere(p.thumbnail) ? [{ url: p.thumbnail, inputUrl: null, provider: prov, modelName: p.thumbnailModel?.split(' · ')[0] ?? null, jobId: null,
      paid: /· local$/i.test(p.thumbnailModel ?? '') ? { credits: 0, usd: null, runOn: 'local' } : null, renderMs: null, at: 0 }] : [];
    out.push({ id: p.id, kind: 'preset', name: p.name, description: p.description, workflow: p.workflow, prompt: fillHint(p), promptTemplate: p.promptTemplate, subjectHint: p.subjectHint, settings: p.settings,
      provider: prov, modelName: p.thumbnailModel?.split(' · ')[0] ?? null, href: presetHref(p), createdAt: null, examples: examplesFor(p.id, wf, own) }); }
  return out.filter((l) => l.examples.length > 0);
}
const fillHint = (p: ImagePreset) => p.promptTemplate.replace(/\{(?:subject|prompt)\}/, p.subjectHint.trim() || '').replace(/\s*,\s*$/, '').replace(/^\s*,\s*/, '').trim();
/** The example a look's tile shows: the newest from the model it was made for, else the newest. */
export const coverOf = (l: Look): Example => l.examples.find((e) => l.provider && e.provider === l.provider) ?? l.examples[0];
/** Per model: the newest finished output, how many runs, and whether it is the look's own model ("Made for this one"). Original first, then newest. */
export function resultsOf(l: Look) {
  const by = new Map<string, { key: string; provider: string | null; modelName: string | null; made: boolean; runs: number; latest: Example }>();
  for (const e of l.examples) { const k = e.provider ?? `name:${e.modelName ?? '?'}`; const cur = by.get(k);
    if (cur) cur.runs++; else by.set(k, { key: k, provider: e.provider, modelName: e.modelName, made: !!l.provider && e.provider === l.provider, runs: 1, latest: e }); }
  return [...by.values()].sort((a, b) => Number(b.made) - Number(a.made) || b.latest.at - a.latest.at);
}

/** Real renders already in the repo that aren't a tool's gallery preview: Upscale's examples popup (web/public/examples/upscale/examples, made with 4x-UltraSharp). */
const REPO_EXAMPLES: Record<string, { before: string; after: string; beforeLabel: string; afterLabel: string; model: string | null }> = {
  upscale: { before: '/examples/upscale/examples/armor-source-crop.png', after: '/examples/upscale/examples/armor-ultrasharp-crop.jpg', beforeLabel: 'Before', afterLabel: '4x', model: '4x-UltraSharp' },
};
/** The card's picture on /workflows: the repo's before / after pair, else a look's example (a split when the run had an input photo), else none.
 *  `jobId` is set only when the picture is a recorded run of ours (a preset's repo thumbnail has none), so the page says "Made here" only then. */
export function cardExample(wf: HubWorkflow, ls: Look[], d: Deps) {
  const pv = d.getTool(wf.toolId)?.app?.gallery?.preview;
  if (pv?.before && pv?.after && fileThere(pv.before) && fileThere(pv.after)) return { kind: 'split' as const, before: pv.before, after: pv.after, beforeLabel: pv.beforeLabel ?? 'Before', afterLabel: pv.afterLabel ?? 'After', model: pv.model ?? null };
  const rx = REPO_EXAMPLES[wf.id]; if (rx && fileThere(rx.before) && fileThere(rx.after)) return { kind: 'split' as const, ...rx };
  const ex = ls.map(coverOf).sort((a, b) => b.at - a.at);
  const split = wf.photo ? ex.find((e) => e.inputUrl) : null;
  if (split) return { kind: 'split' as const, before: split.inputUrl!, after: split.url, beforeLabel: 'Before', afterLabel: 'After', model: split.modelName, jobId: split.jobId, paid: split.paid };
  const one = ex[0]; return one ? { kind: 'single' as const, url: one.url, model: one.modelName, jobId: one.jobId, paid: one.paid } : null;
}

// ------------------------------------------------------------------ saving a look from a result
const RIG_KEYS: Record<string, string> = { cameraBody: 'body', lens: 'lens', focal: 'focal', aperture: 'aperture', film: 'film', lighting: 'lighting', era: 'era' };
/** What a finished job gives a look: its workflow, the prompt as typed, the settings this workflow's bar takes, the model. */
export function lookFromJob(j: Job, out: number, d: Deps, form: (t: any, j: Job) => Record<string, string>): { error: string; code: string } | Omit<UserLook, 'id' | 'name' | 'createdAt' | 'updatedAt'> {
  if (j.status !== 'done') return { error: 'Only a finished result can become a look.', code: 'not_done' };
  if (lib.metaOf(j.id).deletedAt) return { error: 'That result is in the Trash.', code: 'trashed' };
  const url = j.outputs?.[out]?.url ?? (out === 0 ? j.resultUrl : null);
  if (!url || !isImageUrl(url)) return { error: 'Only image results can become a look.', code: 'not_image' };
  if (!fileThere(url)) return { error: 'That result’s file is gone.', code: 'file_missing' };
  if (isSampleJob(j)) return { error: 'A sample result isn’t a real example, so it can’t become a look.', code: 'sample' };
  const wfId = workflowOfJob(j); const wf = wfId ? hubWorkflow(wfId, d) : null; if (!wf) return { error: 'This result isn’t from an image workflow.', code: 'no_workflow' };
  const t = d.getTool(j.toolId); const f = t ? form(t, j) : {};
  const settings: Record<string, PresetValue> = {};
  for (const k of wf.fields) { let v: unknown = f[k]; if (wf.id === 'camera-lens' && v == null) v = j.input?.camera?.[RIG_KEYS[k] ?? k];
    if (v == null || v === '') continue; const s = String(v);
    if (s.startsWith('[')) { try { const a = JSON.parse(s); if (Array.isArray(a)) { settings[k] = a.map(String); continue; } } catch { /* plain */ } }
    settings[k] = typeof v === 'number' ? v : s; }
  const prompt = wf.promptMode === 'hidden' ? '' : String(f.prompt ?? j.input?.appPrompt ?? j.input?.prompt ?? '').trim();
  return { workflow: wf.id, prompt, settings, provider: j.provider, modelName: modelOfJob(j, wf.mode), toolId: j.toolId, jobId: j.id, output: out, exampleUrl: url };
}

// ------------------------------------------------------------------ your own favourites ("See how it was made")
export const MADE_MAX = 40;
export interface MadeItem { jobId: string; url: string; inputUrl: string | null; workflow: string; workflowName: string; toolId: string; provider: string | null; modelName: string | null;
  prompt: string; settings: Record<string, PresetValue>; paid: Paid; renderMs: number | null; at: number }
/** Finished image results from an image workflow that you starred (favourite) or liked; real runs only (exampleOutput: no samples, no trash, file present). */
export function madeItems(d: Deps, form: (t: any, j: Job) => Record<string, string>, limit = MADE_MAX): MadeItem[] {
  const out: MadeItem[] = [];
  for (const j of jobs.values()) {
    const m = lib.metaOf(j.id); if (!m.favourite && !(m.likedBy?.length)) continue; if (m.author && m.author !== 'you') continue;
    const wfId = workflowOfJob(j); const wf = wfId ? hubWorkflow(wfId, d) : null; if (!wf) continue;
    const e = exampleOfJob(j, wf.mode); if (!e) continue;
    const t = d.getTool(j.toolId); let f: Record<string, string> = {}; try { f = t ? form(t, j) : {}; } catch { /* settings stay empty */ }
    const settings: Record<string, PresetValue> = {}; for (const k of wf.fields) { const v = f[k]; if (v != null && v !== '' && !String(v).startsWith('[')) settings[k] = v; }
    out.push({ jobId: j.id, url: e.url, inputUrl: e.inputUrl, workflow: wf.id, workflowName: wf.name, toolId: j.toolId, provider: j.provider ?? null, modelName: e.modelName,
      prompt: wf.promptMode === 'hidden' ? '' : String(f.prompt ?? j.input?.appPrompt ?? j.input?.prompt ?? '').trim(), settings, paid: e.paid ?? { credits: null, usd: null, runOn: null }, renderMs: e.renderMs, at: e.at });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, Math.max(1, Math.min(MADE_MAX, limit)));
}

// ------------------------------------------------------------------ routes
const bad = (field: string, message: string, code = 'invalid') => ({ error: message, errorType: 'validation', code, issues: [{ code, field, message }] });
const QUOTE_KEYS = ['credits', 'listCredits', 'runOn', 'routeKind', 'routeId', 'local', 'demo', 'needsKey', 'keyOwner', 'priceAvailable', 'runnable', 'unavailableReason', 'error', 'message', 'reason', 'reasonCode', 'notWired', 'billingMode', 'cost'];
const MAX_BEST = 3, MAX_UNTESTED = 2;

export function registerWorkflowLooks(app: FastifyInstance, d: Deps, form: (t: any, j: Job) => Record<string, string>) {
  /** The server's own quote for one model with this workflow's defaults and the look's settings (quote = charge). */
  const quote = async (wf: HubWorkflow, provider: string, settings: Record<string, PresetValue> = {}) => {
    const base: Record<string, string> = wf.recipe ? workflowQuoteQueries(wf.recipe as any, wf.mode, provider)[0] ?? {} : { types: JSON.stringify(['generate']) };
    const q = new URLSearchParams({ ...base, provider });
    for (const [k, v] of Object.entries(settings)) q.set(k, Array.isArray(v) ? JSON.stringify(v) : String(v));
    try { const r = await app.inject({ method: 'GET', url: `/api/tools/${encodeURIComponent(wf.toolId)}/price?${q}` }); const body = r.json() as Record<string, unknown>;
      return Object.fromEntries(QUOTE_KEYS.filter((k) => k in body).map((k) => [k, body[k]])); } catch { return null; }
  };
  const modelName = (wf: HubWorkflow, p: string) => wf.recipe?.modelInfo?.[p]?.name ?? modelNameOf(p, wf.mode) ?? p;
  /** "How it works": the workflow's own note + each model's ComfyUI graph credit (and our file to download, when there is one). */
  const howItWorks = (wf: HubWorkflow) => {
    const fid = wf.id; const models = wf.models.map((p) => { const w = workflowFor(fid, p); return { provider: p, name: modelName(wf, p), workflow: w ? { line: workflowLine(w), source: w.source, name: w.name, url: w.url, author: w.author, licence: w.licence, file: w.file ?? null } : null }; });
    const src = wf.recipe?.source ?? null;
    return { note: src?.note ?? null, source: src ? { kind: src.kind, author: src.author, url: src.url, licence: src.licence, file: src.file } : null, models };
  };
  const lookView = (l: Look, wf: HubWorkflow) => { const c = coverOf(l);
    return { id: l.id, kind: l.kind, name: l.name, description: l.description, href: l.href, createdAt: l.createdAt, provider: l.provider, modelName: l.modelName,
      cover: { url: c.url, inputUrl: c.inputUrl, provider: c.provider, modelName: c.modelName ?? (c.provider ? modelName(wf, c.provider) : null), paid: c.paid }, models: new Set(l.examples.map((e) => e.provider ?? e.modelName)).size }; };

  app.get('/api/workflow-hub', async () => ({
    intents: INTENTS,
    workflows: hubWorkflowIds().map((id) => hubWorkflow(id, d)).filter((w): w is HubWorkflow => !!w).map((wf) => { const ls = looksOf(wf, d);
      return { id: wf.id, name: wf.name, tagline: wf.tagline, needs: wf.needs, toolId: wf.toolId, intents: wf.intents, models: wf.models, looks: ls.length, example: cardExample(wf, ls, d),
        href: `/workflows/${wf.id}`, createHref: `/tools/create-image${wf.id === 'create-image' ? '' : `?workflow=${wf.id}`}` }; }),
  }));

  /** "See how it was made" grows with the app: your own favourite or liked finished images from the image workflows (newest first). Samples never. */
  app.get<{ Querystring: { limit?: string } }>('/api/workflow-hub/made', async (req) => ({ items: madeItems(d, form, Number(req.query.limit) || MADE_MAX) }));

  app.get<{ Params: { id: string } }>('/api/workflow-hub/:id', async (req, reply) => {
    const wf = hubWorkflow(req.params.id, d); if (!wf) return reply.code(404).send({ error: 'No such workflow.', code: 'not_found' });
    const ls = looksOf(wf, d);
    /* Best on: models this workflow's looks really ran on (most-used first), then the quality order; 3 at most, each with a real quote */
    const used = new Map<string, number>(); for (const l of ls) for (const e of l.examples) if (e.provider && wf.models.includes(e.provider)) used.set(e.provider, (used.get(e.provider) ?? 0) + 1);
    const bestIds = [...[...used.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p), ...wf.models].filter((p, i, a) => a.indexOf(p) === i).slice(0, MAX_BEST);
    const best = await Promise.all(bestIds.map(async (p) => ({ provider: p, name: modelName(wf, p), quote: await quote(wf, p) })));
    return { workflow: { id: wf.id, name: wf.name, tagline: wf.tagline, needs: wf.needs, toolId: wf.toolId, intents: wf.intents, photo: wf.photo, createHref: `/tools/create-image${wf.id === 'create-image' ? '' : `?workflow=${wf.id}`}`,
      example: cardExample(wf, ls, d), howItWorks: howItWorks(wf) }, looks: ls.map((l) => lookView(l, wf)), best };
  });

  app.get<{ Params: { id: string; lookId: string } }>('/api/workflow-hub/:id/looks/:lookId', async (req, reply) => {
    const wf = hubWorkflow(req.params.id, d); if (!wf) return reply.code(404).send({ error: 'No such workflow.', code: 'not_found' });
    const l = looksOf(wf, d).find((x) => x.id === req.params.lookId);
    if (!l) return reply.code(404).send({ error: 'No such look, or it has no example yet.', code: 'not_found' });
    const results = resultsOf(l).map((r) => ({ provider: r.provider, modelName: r.provider ? modelName(wf, r.provider) : r.modelName, made: r.made, runs: r.runs, latest: r.latest, compatible: !!r.provider && wf.models.includes(r.provider) }));
    const tested = new Set(results.map((r) => r.provider).filter(Boolean) as string[]);
    /* the look's own model first when it hasn't run here yet (a built-in example whose model we can't name stays a result card) */
    const pool = [...(l.provider && !tested.has(l.provider) && wf.models.includes(l.provider) ? [l.provider] : []), ...wf.models.filter((p) => !tested.has(p))].filter((p, i, a) => a.indexOf(p) === i).slice(0, MAX_UNTESTED);
    const untested = await Promise.all(pool.map(async (p) => ({ provider: p, modelName: modelName(wf, p), made: p === l.provider, quote: await quote(wf, p, l.settings) })));
    return { workflow: { id: wf.id, name: wf.name, toolId: wf.toolId, promptMode: wf.promptMode, fields: wf.fields },
      look: { id: l.id, kind: l.kind, name: l.name, description: l.description, prompt: l.prompt, promptTemplate: l.promptTemplate, subjectHint: l.subjectHint, settings: l.settings, provider: l.provider, modelName: l.modelName, href: l.href, createdAt: l.createdAt },
      results, untested };
  });

  app.get('/api/user-looks', async () => ({ items: listUserLooks(), max: USER_LOOKS_MAX }));
  app.post<{ Body: Record<string, unknown> }>('/api/user-looks', async (req, reply) => {
    const b = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const name = typeof b.name === 'string' ? b.name.trim().replace(/\s+/g, ' ') : ''; const jobId = typeof b.jobId === 'string' ? b.jobId : ''; const out = Math.max(0, Math.floor(Number(b.output ?? 0)) || 0);
    if (!name) return reply.code(400).send(bad('name', 'Give the look a name.', 'required'));
    if (name.length > LOOK_NAME_MAX) return reply.code(400).send(bad('name', `Look names can be up to ${LOOK_NAME_MAX} characters.`, 'too_long'));
    const j = jobs.get(jobId); if (!j) return reply.code(404).send({ error: 'No such result.', errorType: 'not_found', code: 'not_found' });
    if (looks.size >= USER_LOOKS_MAX) return reply.code(400).send(bad('name', `You can save up to ${USER_LOOKS_MAX} looks. Delete one first.`, 'too_many'));
    const r = lookFromJob(j, out, d, form); if ('error' in r) return reply.code(400).send(bad('jobId', r.error, r.code));
    const now = Date.now(); return reply.code(201).send(store({ id: `my-${randomUUID().replace(/-/g, '').slice(0, 8)}`, name, ...r, createdAt: now, updatedAt: now }));
  });
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>('/api/user-looks/:id', async (req, reply) => {
    const l = looks.get(req.params.id); if (!l) return reply.code(404).send({ error: 'Look not found.', errorType: 'not_found', code: 'not_found' });
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
    if (!name) return reply.code(400).send(bad('name', 'Give the look a name.', 'required'));
    if (name.length > LOOK_NAME_MAX) return reply.code(400).send(bad('name', `Look names can be up to ${LOOK_NAME_MAX} characters.`, 'too_long'));
    return store({ ...l, name, updatedAt: Date.now() });
  });
  app.delete<{ Params: { id: string } }>('/api/user-looks/:id', async (req, reply) => {
    if (!looks.has(req.params.id)) return reply.code(404).send({ error: 'Look not found.', errorType: 'not_found', code: 'not_found' });
    looks.delete(req.params.id); del('user_looks', req.params.id); return { ok: true, id: req.params.id };
  });
}

/** Saved looks as image presets (GET /api/image-presets): the Create bar opens them with ?preset=<id>, like the built-in ones. */
export function userLooksAsPresets(getTool: Deps['getTool'], recipes: Deps['recipes']) {
  const d: Deps = { getTool, recipes, presets: () => [] };
  return listUserLooks().map((u) => { const wf = hubWorkflow(u.workflow, d); if (!wf) return null;
    return { id: u.id, name: u.name, workflow: u.workflow, category: 'Look', description: `Saved from a result made on ${u.modelName ?? u.provider}`, promptTemplate: u.prompt.replace(/\{(subject|prompt)\}/g, '($1)'), subjectHint: '', settings: u.settings,
      lora: null, thumbnail: u.exampleUrl, thumbnailModel: u.modelName, hero: false, available: true, inspiredBy: [], mine: true, provider: u.provider,
      runner: { toolId: wf.toolId }, workflowStatus: 'ready', ready: true, href: presetHref(u) }; }).filter(Boolean);
}
