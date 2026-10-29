/** Backend gap endpoints (report, publish, self-host health, usage, profile, model page and more). Registered from index.ts. */
import { displayDir } from './hardware.js'; // dp30 (l)
import { tzKeyer, tzBuckets } from './pages.js';
import type { FastifyInstance } from 'fastify';
import { existsSync, readFileSync, statfsSync, statSync } from 'node:fs';
import path from 'node:path';
import { jobs } from './jobs.js';
import * as lib from './library.js';
import { getTool, listTools, setToolHidden } from './tools/registry.js';
import { pluginStatus } from './plugins.js';
import { ledger } from './ledger.js';
import { config, DATA_DIR } from './config.js';
import { checkComfyReady } from './comfyClient.js';
import { MAX_PARALLEL, CONCURRENCY, LOCAL_CONCURRENCY, CLOUD_CONCURRENCY } from './queue.js';
import { MAX_QUEUED } from './edge.js';
import { getKv, setKv } from './db.js';
import { env } from './env.js';
import { buildLicenseReport } from './licensesReport.js';
import { toolProviders, getProvider } from './providers.js';
import { modelsFor } from './models.js';
import { weightsForWorkflows } from './modelWeights.js';
import { mcpInfo } from './mcpInfo.js';
import { registerProfile } from './profile.js';

/** DP #20.7: the ComfyUI version, read (never hardcoded): /system_stats when reachable, else comfyui_version.py in the install folder
 *  (OPENHIGGSFIELD_COMFY_DIR, else the parent of the models folder). */
function comfyVersionFromDisk(modelsDir: string | null): { version: string | null; source: string | null } {
  const dirs = [env('COMFY_DIR'), modelsDir ? path.dirname(path.resolve(modelsDir)) : undefined].filter(Boolean) as string[];
  for (const d of dirs) { try { const m = /__version__\s*=\s*["']([^"']+)["']/.exec(readFileSync(path.join(d, 'comfyui_version.py'), 'utf8')); if (m) return { version: m[1], source: 'install folder' }; } catch { /* next */ } }
  return { version: null, source: null };
}
/** DP #20.6: the MCP server (:8788 by default). GET /health answers {name, version}; an older build answers 404 there but is still up. */
async function mcpHealth() {
  const url = mcpInfo().httpUrl; let base: string; try { base = new URL(url).origin; } catch { return { reachable: false, url, version: null }; }
  try { const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1500) }); let version: string | null = null;
    if (r.ok) { try { version = String(((await r.json()) as any)?.version ?? '') || null; } catch { /* not JSON */ } } else await r.arrayBuffer().catch(() => undefined);
    return { reachable: true, url, version };
  } catch { return { reachable: false, url, version: null }; }
}
/** DP #20.7: expected weight files per local model (manifest rows its workflows load), each present/missing on disk. No models folder → all missing. */
function modelsOnDisk(modelsDir: string | null) {
  const byModel = new Map<string, { providerId: string; name: string; toolIds: Set<string>; workflows: Set<string> }>();
  for (const t of listTools()) for (const c of modelsFor(t) as any[]) { if (!(c.workflows ?? []).length) continue; const e = byModel.get(c.providerId) ?? { providerId: c.providerId, name: getProvider(c.providerId)?.name ?? c.providerName ?? c.name, toolIds: new Set(), workflows: new Set() };
    e.toolIds.add(t.id); for (const w of c.workflows) e.workflows.add(w); byModel.set(c.providerId, e); }
  return [...byModel.values()].map((e) => { const files = weightsForWorkflows([...e.workflows]).map((w) => { let present = false; let sizeOnDisk: number | null = null;
      if (modelsDir) { try { const st = statSync(path.join(modelsDir, w.folder, w.file)); present = st.isFile(); sizeOnDisk = st.size; } catch { present = false; } }
      return { file: w.file, folder: w.folder, present, sizeBytes: w.sizeBytes, sizeOnDisk, url: w.url }; });
    return { providerId: e.providerId, name: e.name, toolIds: [...e.toolIds], files, present: files.filter((f) => f.present).length, missing: files.filter((f) => !f.present).length, ready: files.length > 0 && files.every((f) => f.present) };
  }).filter((m) => m.files.length);
}
/** dp30 (l): path is shown like /api/hardware disk.path (repo-relative / folder name, never an absolute dir). */
function freeDisk(dir: string) { const shown = displayDir(dir) ?? 'server data folder'; try { const s = statfsSync(dir); return { path: shown, freeBytes: Number(s.bavail) * Number(s.bsize), totalBytes: Number(s.blocks) * Number(s.bsize) }; } catch { return { path: shown, freeBytes: null, totalBytes: null }; } }

const MANIFEST = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../readiness/manifest/models.json');
/** Item 2: env-var names → plain words for the self-host 'Technical details' text. */
const DEV_WORDS: [RegExp, string][] = [[/\b(?:OPENHIGGSFIELD|OPENJUTSU)_BACKEND\b/g, 'the server backend setting'], [/\bCOMFY_BASE_URL\b/g, 'the ComfyUI address'],
  [/\bCOMFY_API_KEY\b/g, 'the Comfy API key'], [/\b(?:(?:OPENHIGGSFIELD|OPENJUTSU)_)?COMFY_MODELS_DIR\b/g, 'the ComfyUI models folder']];
export const plainDev = (t: string) => DEV_WORDS.reduce((x, [re, w]) => x.replace(re, w), t).replace(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g, 'a server setting');

export const LOCALES = ['en', 'es'];
const bad = (field: string, message: string, code = 'invalid') => ({ error: message, errorType: 'validation', issues: [{ code, field, message }] });

/** Page 28: resolutions and duration range for a model, from its model cards (route videoCaps / Generate Video limits) or the tool's quality tiers. */
function modelFacts(providerId: string, toolIds: string[]) {
  const res = new Set<string>(); let min: number | null = null; let max: number | null = null;
  const put = (a?: number | null, b?: number | null) => { if (a != null) min = min == null ? a : Math.min(min, a); if (b != null) max = max == null ? b : Math.max(max, b); };
  for (const tid of [...new Set(toolIds)]) { const t = getTool(tid); if (!t) continue;
    for (const c of modelsFor(t) as any[]) { if ((c.providerId ?? c.id) !== providerId) continue;
      for (const r of c.resolutions ?? []) res.add(String(r));
      if (c.videoLimits) put(c.videoLimits.minSeconds ?? c.videoLimits.duration?.min, c.videoLimits.maxSeconds ?? c.videoLimits.duration?.max);
      for (const v of Object.values(c.routeVideoCaps ?? {}) as any[]) { for (const r of v?.resolutions ?? []) res.add(String(r)); put(v?.minSeconds, v?.maxSeconds); } }
    if (!res.size) for (const q of Object.keys(t.gpuSecPerSec ?? {})) res.add(q); }
  return { resolutions: [...res], durationRange: min == null && max == null ? null : { min, max } };
}
/** Which input a finished result can fill on another tool (hand-off, page 08). */
function handoffSlot(toolId: string, outUrl: string) {
  const t = getTool(toolId); if (!t) return null;
  const isVideo = /\.(mp4|mov|webm)$/i.test(outUrl); const isImage = /\.(png|jpe?g|webp)$/i.test(outUrl);
  const names = t.inputs.map((i) => i.name);
  if (isVideo && names.includes('video')) return 'video';
  if (isImage && names.includes('refs')) return 'refs';
  if (isImage && names.includes('image')) return 'image';
  return null;
}

type Hook = { url: string; sent: Set<string>; tries: number; next: number; until: number };
const hooks = new Map<string, Hook>(Object.entries(getKv<Record<string, any>>('webhooks', {})).map(([k, v]) => [k, { ...v, sent: new Set<string>(v.sent ?? []) }]));
const saveHooks = () => setKv('webhooks', Object.fromEntries([...hooks].map(([k, v]) => [k, { ...v, sent: [...v.sent] }])));
export function webhookUrlError(url: string): string | null { let u: URL; try { u = new URL(url); } catch { return 'webhookUrl must be an http(s) URL.'; } return /^https?:$/.test(u.protocol) ? null : 'webhookUrl must be an http(s) URL.'; }
export function registerWebhook(jobId: string, url: string) { hooks.set(jobId, { url, sent: new Set(), tries: 0, next: 0, until: Date.now() + 2 * 3600_000 }); saveHooks(); }
const TERMINAL = ['done', 'failed', 'canceled', 'blocked'];
let loop: NodeJS.Timeout | null = null;
function startWebhookLoop() {
  if (loop) return;
  loop = setInterval(async () => {
    const now = Date.now(); let dirty = false;
    for (const [id, h] of hooks) {
      const j = jobs.get(id); if (!j || now > h.until) { hooks.delete(id); dirty = true; continue; }
      if (!TERMINAL.includes(j.status) || h.sent.has(j.status) || now < h.next) continue;
      const key = `${id}:${j.status}`; dirty = true;
      try { const r = await fetch(h.url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-id': key }, body: JSON.stringify({ id, toolId: j.toolId, status: j.status, outputs: j.outputs, error: j.error, refund: (j as any).refund ?? null }), signal: AbortSignal.timeout(5000) });
        if (r.ok) { h.sent.add(j.status); h.tries = 0; continue; } } catch { /* retry */ }
      h.tries++; h.next = now + Math.min(600_000, 2000 * 2 ** h.tries);
    }
    if (dirty) saveHooks();
  }, 1000); loop.unref();
}

export function registerGaps(app: FastifyInstance) {
  // ---- 17 Community: publish to the public gallery (no reporting / moderation queue: users are responsible for licences and provider terms; see docs) ----
  if (!app.hasContentTypeParser('application/x-www-form-urlencoded'))
    app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 4096 }, (_r, body, done) => done(null, Object.fromEntries(new URLSearchParams(String(body)))));
  app.post<{ Params: { id: string }; Body: { showPrompt?: boolean } }>('/api/jobs/:id/publish', async (req, reply) => {
    const j = jobs.get(req.params.id); if (!j || lib.metaOf(j.id).deletedAt) return reply.code(404).send({ error: 'not found' });
    if (j.status !== 'done') return reply.code(409).send({ error: 'Only finished results can be published.', errorType: 'validation' });
    const m = lib.publishJob(j.id, req.body?.showPrompt !== false); return { published: true, ...m.published };
  });
  app.delete<{ Params: { id: string } }>('/api/jobs/:id/publish', async (req, reply) => { if (!jobs.get(req.params.id)) return reply.code(404).send({ error: 'not found' }); lib.unpublishJob(req.params.id); return { published: false }; });

  // ---- 25 Self-host health panel ----
  app.get('/api/health/self-host', async () => {
    const ready = config.backend === 'comfy' ? checkComfyReady({ probeLocal: true }) : { ok: false as const, reason: 'The server runs in preview mode: results are sample outputs until ComfyUI is connected.', code: 'backend_not_comfy' as const, detail: `backend=${config.backend}` };
    // DP #20.7: ComfyUI reachability is checked in preview/mock mode too (whenever an address is set); its version comes from /system_stats
    let reachable: boolean | null = null; let comfyVersion: string | null = null; let comfyVersionSource: string | null = null;
    if (config.comfyBaseUrl) { try { const r = await fetch(`${config.comfyBaseUrl.replace(/\/$/, '')}/system_stats`, { signal: AbortSignal.timeout(2000) }); reachable = r.ok;
      if (r.ok) { try { const v = ((await r.json()) as any)?.system?.comfyui_version; if (v) { comfyVersion = String(v); comfyVersionSource = 'system_stats'; } } catch { /* not JSON */ } } } catch { reachable = false; } }
    // HW-SHAPES B1: one hardware probe (ComfyUI /system_stats, else this computer when ComfyUI runs here); no inline nvidia-smi here any more
    const hw = await (await import('./hardware.js')).getHardware();
    const gpu: { name: string; memoryMB: number }[] | null = hw.gpu && hw.gpu.type !== 'cpu' ? Array.from({ length: Math.max(1, hw.gpu.count) }, () => ({ name: hw.gpu!.name, memoryMB: Math.round((hw.gpu!.vramTotalBytes ?? 0) / 1048576) })) : null;
    const modelsDir = env('COMFY_MODELS_DIR')?.trim() || null; let modelsMissing: { file: string; folder: string; sizeGB: number }[] | null = null; let modelsTotal = 0;
    try { const ms: any[] = (await import(MANIFEST, { with: { type: 'json' } } as any)).default.models; modelsTotal = ms.length;
      // DP #20.7: no models folder → every expected file is reported missing (never an empty list)
      modelsMissing = ms.filter((m) => !modelsDir || !existsSync(path.join(modelsDir, m.folder, m.file))).map((m) => ({ file: m.file, folder: m.folder, sizeGB: m.size_gb })); } catch { /* manifest missing */ }
    if (!comfyVersion) { const v = comfyVersionFromDisk(modelsDir); comfyVersion = v.version; comfyVersionSource = v.source; }
    const perModel = modelsOnDisk(modelsDir); const mcp = await mcpHealth();
    const disk = { data: freeDisk(DATA_DIR), ...(modelsDir ? { models: freeDisk(modelsDir) } : {}) };
    // (L2) Plain user-facing sentences in note/userNote fields; developer text (env vars, commands) only in devNote (same pattern as I2).
    const comfyUser = ready.ok ? null : config.backend !== 'comfy' ? 'Preview mode: results are sample outputs until ComfyUI is connected.'
      : reachable === false ? 'ComfyUI is not answering. Check that it is running at the address set when you installed, or ask your admin.' : 'ComfyUI is not ready yet. Check its address and models folder from your install, or ask your admin.';
    // Item 2: the 'Technical details' (devNote) strings are plain text too, without env-var names; the variables are listed in the docs
    // (OPENHIGGSFIELD_BACKEND, COMFY_BASE_URL, COMFY_API_KEY, OPENHIGGSFIELD_COMFY_MODELS_DIR). comfy.reason is the plain check result (comfyClient), comfy.code its stable id.
    const comfyDev = ready.ok ? null : config.backend !== 'comfy' ? `The server runs in ${config.backend} mode. Switch it to the ComfyUI backend and give it the ComfyUI address to render for real.` : plainDev(String(ready.reason ?? ''));
    const gpuUser = gpu ? null : 'No NVIDIA graphics card was found on this computer. Local models need one to run at full speed.';
    // Item 6: there is no Settings field for these (server install settings only), so the notes say where they really come from.
    const modelsUser = modelsDir ? null : 'Set your ComfyUI models folder when you install, or ask your admin.';
    const modelsDev = modelsDir ? null : 'No ComfyUI models folder is configured on the server, so the check for missing manifest models is skipped.';
    return { backend: config.backend, comfy: { ready: ready.ok, reason: ready.ok ? null : plainDev(ready.reason), code: ready.ok ? null : ready.code, reachable, baseUrl: config.comfyBaseUrl || null, version: comfyVersion, versionSource: comfyVersionSource, userNote: comfyUser, devNote: comfyDev },
      mcp, disk, hardware: { tier: hw.tier, tierLabel: hw.tierLabel, source: hw.source, effectiveVramGB: hw.effectiveVramGB, checkedAt: hw.checkedAt },
      gpu, gpuNote: gpuUser, gpuUserNote: gpuUser, gpuDevNote: gpu ? null : 'No NVIDIA GPU was detected: the NVIDIA driver tool did not answer.',
      models: { dir: modelsDir, total: modelsTotal, missing: modelsMissing, perModel, note: modelsUser, userNote: modelsUser, devNote: modelsDev },
      userNotes: [comfyUser, gpuUser, modelsUser].filter(Boolean),
      queue: { maxParallel: MAX_PARALLEL, maxQueued: MAX_QUEUED, lanes: { local: { limit: LOCAL_CONCURRENCY }, cloud: { limit: CLOUD_CONCURRENCY } } } };
  });

  // ---- 24 API docs: endpoint table rendered from the live OpenAPI spec (no drift) ----
  app.get('/api/openapi/endpoints', async () => {
    const spec: any = (await app.inject({ method: 'GET', url: '/api/openapi.json' })).json();
    const items = Object.entries(spec.paths ?? {}).flatMap(([p, ops]: [string, any]) => Object.entries(ops).filter(([m]) => ['get', 'post', 'put', 'patch', 'delete'].includes(m)).map(([m, o]: [string, any]) => ({ method: m.toUpperCase(), path: p, tag: o.tags?.[0] ?? null, summary: o.summary ?? o.description ?? '' })));
    return { version: spec.info?.version ?? null, specUrl: '/api/openapi.json', total: items.length, tags: [...new Set(items.map((i) => i.tag).filter(Boolean))], items };
  });

  // ---- 08 Hand-off: bring a finished result into another tool as an input ----
  app.get<{ Params: { id: string }; Querystring: { to?: string; as?: string; i?: string } }>('/api/jobs/:id/handoff', async (req, reply) => {
    const j = jobs.get(req.params.id); if (!j || lib.metaOf(j.id).deletedAt) return reply.code(404).send({ error: 'not found' });
    if (j.status !== 'done' || !j.outputs.length) return reply.code(409).send({ error: 'This job has no finished output yet.', errorType: 'validation' });
    const out = j.outputs[Math.min(j.outputs.length - 1, Math.max(0, Number(req.query.i) || 0))];
    const targets = listTools().filter((t) => t.listed !== false /* unlisted (legacy look tool): still accepted by to=, not offered */).map((t) => ({ toolId: t.id, name: t.name, slot: handoffSlot(t.id, out.url) })).filter((x) => x.slot && x.toolId !== j.toolId);
    if (!req.query.to) return { jobId: j.id, output: out, targets, attribution: (await import('./attribution.js')).jobAttribution(j) };
    const t = getTool(req.query.to); if (!t) return reply.code(404).send(bad('to', `unknown tool ${req.query.to}`, 'unknown'));
    const slot = req.query.as === 'ref' ? (t.inputs.some((x) => x.name === 'refs') ? 'refs' : null) : handoffSlot(t.id, out.url);
    if (!slot) return reply.code(400).send(bad('to', `${t.name} can't take this result as ${req.query.as === 'ref' ? 'a reference' : 'an input'}.`, 'unsupported'));
    return { jobId: j.id, toolId: t.id, slot, attribution: (await import('./attribution.js')).jobAttribution(j), fileUrl: out.url, route: `${t.route}?fromJob=${j.id}&as=${slot === 'refs' ? 'ref' : slot}`, prefill: { [slot]: [out.url] } };
  });

  // ---- 20 Usage chart ----
  app.get<{ Querystring: { bucket?: string; days?: string; tz?: string } }>('/api/usage/series', async (req, reply) => {
    const bucket = req.query.bucket === 'hour' ? 'hour' : 'day'; const days = Math.min(365, Math.max(1, Number(req.query.days) || 30)); const since = Date.now() - days * 86400_000;
    // ?tz=<IANA> (default UTC): buckets on that zone's local midnight / local hour; echoed as `timezone`.
    const timezone = (req.query.tz || 'UTC').trim(); let key: (ts: number) => string;
    try { key = tzKeyer(timezone, bucket); } catch { return reply.code(400).send({ error: 'tz must be an IANA time zone, e.g. Asia/Dubai', errorType: 'validation', issues: [{ code: 'invalid', field: 'tz', message: 'tz must be an IANA time zone, e.g. Asia/Dubai' }] }); }
    const m = new Map<string, { date: string; charged: number; refunded: number }>();
    for (const e of ledger().entries) { if (e.ts < since || (e.kind !== 'charge' && e.kind !== 'refund')) continue; const k = key(e.ts); const r = m.get(k) ?? { date: k, charged: 0, refunded: 0 }; if (e.kind === 'charge') r.charged += Math.abs(e.amount); else r.refunded += Math.abs(e.amount); m.set(k, r); }
    // Zero-fill: one row per bucket from `since` to now (empty buckets = 0), oldest first.
    const items = tzBuckets(key, since, Date.now()).map((b) => ({ ...(m.get(b.key) ?? { date: b.key, charged: 0, refunded: 0 }), start: new Date(b.start).toISOString() }));
    return { bucket, days, timezone, zeroFilled: true, items };
  });

  // ---- 22 Profile (profile.ts: profile, avatar upload, creator-page stats) ----
  registerProfile(app);

  // ---- 27 Mobile: suggest a tool for a typed prompt ----
  const ROUTE_RULES: [RegExp, string][] = [[/\b(upscale|sharpen|4k|higher res)/i, 'upscale'], [/\b(swap|replace)\b/i, 'object-swap'], [/\b(restyle|anime|cartoon|watercolou?r|claymation)\b/i, 'restyle'],
    [/\b(angle|re-?shoot)\b/i, 'reshoot'], [/\b(dolly|orbit|pan|camera move|crane)\b/i, 'camera'], [/\b(voice|narrat|speak|tts|dub|translate)\b/i, 'voice'], [/\b(music|song|soundtrack)\b/i, 'soundtrack'],
    [/\b(motion|dance|move like)\b/i, 'motion-transfer'], [/\b(video|clip|shot|scene|film)\b/i, 'h3-video'], [/\b(photo|image|picture|portrait|poster|logo)\b/i, 'create-image']];
  app.post<{ Body: { prompt?: string } }>('/api/route-prompt', async (req, reply) => {
    const prompt = String(req.body?.prompt ?? '').trim(); if (!prompt) return reply.code(400).send(bad('prompt', 'prompt is required.', 'required'));
    const hits = ROUTE_RULES.filter(([re, id]) => re.test(prompt) && getTool(id)).map(([, id]) => id);
    const toolId = hits[0] ?? 'create-image'; const t = getTool(toolId)!;
    return { toolId, name: t.name, route: `${t.route}?prompt=${encodeURIComponent(prompt.slice(0, 500))}`, alternatives: [...new Set(hits.slice(1))], basis: hits.length ? 'keywords' : 'default' };
  });

  // ---- 28 Model directory page ----
  app.get<{ Params: { id: string } }>('/api/models/:id', async (req, reply) => {
    const rep = buildLicenseReport(); const rows = rep.rows.filter((r) => r.providerId === req.params.id); if (!rows.length) return reply.code(404).send({ error: `unknown model ${req.params.id}` });
    const p = listTools().flatMap((t) => toolProviders(t)).find((x) => x.id === req.params.id) as any;
    const ri = (await import('./releaseDates.js')).releaseInfo(req.params.id);
    const { requirementNote } = await import('./models.js');
    // N4: description = the same card text as /api/models (catalog first, else the model info blurb), plus tech + minComfyVersion
    const card: any = rows.map((r) => getTool(r.toolId)).filter(Boolean).flatMap((t) => modelsFor(t!)).find((m) => m.id === req.params.id) ?? null;
    return { id: req.params.id, name: rows[0].model, kind: rows[0].kind, licenseName: rows[0].license ?? null, requirementNote: requirementNote(p?.minComfyVersion), releasedAt: ri.releasedAt, releaseSource: ri.releaseSource, badges: ri.isNew ? ['new'] : [], description: card?.description ?? p?.description ?? null, tech: card?.tech ?? null, minComfyVersion: p?.minComfyVersion ?? null, license: { name: rows[0].license, id: rows[0].licenseId, url: rows[0].licenseUrl, commercial: rows[0].commercial, attribution: rows[0].attribution, attributionSources: rows[0].attributionSources },
      sourceUrl: rows[0].sourceUrl, tools: rows.map((r) => ({ toolId: r.toolId, name: r.toolName, route: getTool(r.toolId)?.route ?? null })),
      // Page 28 summary chips: resolutions[] + durationRange {min,max} (seconds; null for image/audio or unknown), and the P0 attribution check (docs/ATTRIBUTION.md).
      ...modelFacts(req.params.id, rows.map((r) => r.toolId)), attribution: (await import('./attribution.js')).modelAttribution(req.params.id),
      ...(await import('./attribution.js')).creditOf(req.params.id) };
  });

  // ---- 24 Webhooks: job field webhookUrl (on submit) or POST /api/jobs/:id/webhook; persisted (kv 'webhooks') so they survive restarts ----
  app.post<{ Params: { id: string }; Body: { url?: string } }>('/api/jobs/:id/webhook', async (req, reply) => {
    if (!jobs.get(req.params.id)) return reply.code(404).send({ error: 'not found' });
    const err = webhookUrlError(String(req.body?.url ?? '')); if (err) return reply.code(400).send(bad('url', err));
    registerWebhook(req.params.id, String(req.body!.url)); return { jobId: req.params.id, webhookUrl: req.body!.url, retryForSec: 7200, dedupe: 'X-Webhook-Id = <jobId>:<status>' };
  });
  app.get<{ Params: { id: string } }>('/api/jobs/:id/webhook', async (req, reply) => { const h = hooks.get(req.params.id); return h ? { jobId: req.params.id, webhookUrl: h.url, delivered: [...h.sent], tries: h.tries, until: h.until } : reply.code(404).send({ error: 'No webhook for this job.' }); });
  startWebhookLoop();

  // ---- 26 Plugins: enable / disable without a restart (persisted; disabled tools vanish from /api/tools and job submit 404s) ----
  app.post<{ Params: { id: string }; Body: { enabled?: boolean } }>('/api/plugins/:id', async (req, reply) => {
    const st = pluginStatus().find((p) => p.id === req.params.id); if (!st) return reply.code(404).send({ error: `unknown plugin ${req.params.id}` });
    if (typeof req.body?.enabled !== 'boolean') return reply.code(400).send(bad('enabled', 'enabled must be true or false.'));
    const off = new Set(getKv<string[]>('plugins_disabled', [])); if (req.body.enabled) off.delete(st.id); else off.add(st.id); setKv('plugins_disabled', [...off]);
    if (st.toolId) setToolHidden(st.toolId, !req.body.enabled);
    return { id: st.id, toolId: st.toolId ?? null, enabled: req.body.enabled, loaded: st.ok };
  });
  for (const id of getKv<string[]>('plugins_disabled', [])) { const st = pluginStatus().find((p) => p.id === id); if (st?.toolId) setToolHidden(st.toolId, true); }

  // ---- 21/22 config extras: concurrency limits and locales on /api/config ----
  app.addHook('preSerialization', async (req, _r, payload: any) => (req.url.split('?')[0] === '/api/config' && payload && typeof payload === 'object' ? { ...payload, maxParallel: MAX_PARALLEL, concurrency: CONCURRENCY, lanes: { local: { limit: LOCAL_CONCURRENCY }, cloud: { limit: CLOUD_CONCURRENCY } } /* 2026-10-25 run lanes (queue.ts) */, maxQueued: MAX_QUEUED, locales: LOCALES, defaultLocale: 'en' } : payload));
}
