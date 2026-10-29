/**
 * H3 runner Step 1 (Oct 26): "Your Comfy deployment" endpoints. Registered from index.ts.
 *  GET  /api/comfy-deploy                 what is set (env var NAMES only, never values) + the last probe
 *  GET  /api/comfy-deploy/probe?nodes=1   free check: health / job list (+ object_info node and model checks with nodes=1); never runs a job
 *  POST /api/comfy-deploy/smoke {confirm} the deployment test job (LoadImage → ImageInvert → SaveImage, no models). PAID (a few GPU-seconds plus any
 *       cold start on the user's Comfy account): refused without confirm:true, and refused while its price row is unmeasured unless
 *       OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD=1 (the same gate as every Comfy Cloud workflow route).
 */
import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { DEPLOY_ENV, DEPLOY_LABEL, deployState, lastProbe, probeDeploy } from './comfy/deploy.js';
import { DEPLOY_SMOKE_ROUTE } from './routing/deployRoutes.js';

export function registerComfyDeploy(app: FastifyInstance) {
  app.get('/api/comfy-deploy', async () => ({ label: DEPLOY_LABEL, ...deployState(), envVars: { ...DEPLOY_ENV }, lastProbe: lastProbe() }));
  app.get<{ Querystring: { nodes?: string } }>('/api/comfy-deploy/probe', async (req) => {
    const { cloudTestFetch } = await import('./routing/cloudRun.js');
    return { label: DEPLOY_LABEL, ...(await probeDeploy({ nodes: /^(1|true|yes)$/i.test(req.query.nodes ?? ''), f: cloudTestFetch() ?? undefined })) };
  });
  // Oct 26: H3 Character Swap · Comfy Cloud: free check (GET only on Comfy Cloud, the app's own key; nothing uploaded or run) that the imported LoRA is visible
  app.get<{ Querystring: { loaders?: string } }>('/api/comfy-cloud/h3-charswap/check', async (req, reply) => {
    const { cloudTargetFor, cloudTestFetch } = await import('./routing/cloudRun.js'); const { findRoute } = await import('./routing/routes.js');
    const H = await import('./comfy/h3CharSwapCloud.js'); const r = findRoute(H.CHARSWAP_CLOUD_ROUTE); const tg = r ? cloudTargetFor(r) : null;
    if (!tg) return reply.code(409).send({ error: 'No Comfy API key is set', errorType: 'validation', code: 'key_missing' });
    const f = cloudTestFetch() ?? ((...a: Parameters<typeof fetch>) => fetch(...a)); const file = H.charswapLoraName(); let assets: any[] | null = null;
    const get = async (p: string) => { const res = await f(tg.base + p, { method: 'GET', headers: { Authorization: `Bearer ${tg.token}` }, signal: AbortSignal.timeout(30_000) });
      if (p.startsWith('/api/assets') && !p.includes('768p') && res.ok) { const j: any = await res.clone().json().catch(() => null); assets = (j?.assets ?? []).map((a: any) => ({ name: a.name, loaderPath: a.loader_path, filePath: a.file_path, imported: a.is_immutable === false, tags: a.tags })); }
      return res; };
    const c = await H.checkCharswapLora(get, file);
    let inLoaderList: boolean | null = null; // ?loaders=1: also read /api/object_info (10 MB) — the choices job validation checks
    if (/^(1|true|yes)$/i.test(req.query.loaders ?? '')) { try { const res = await get('/api/object_info'); const info: any = res.ok ? await res.json() : null; const sp = info?.LoraLoaderModelOnly?.input?.required?.lora_name;
      const list: string[] = Array.isArray(sp?.[0]) ? sp[0] : sp?.[1]?.options ?? []; inLoaderList = list.length ? list.includes(c.loaderPath ?? file) : null; } catch { inLoaderList = null; } }
    const t = await H.checkCharswapTurbo(get); // Oct 27: the optional Openjutsu 768p turbo import (model library search only)
    const recommended = H.charswapRecommendedReport(c, t);
    return { route: H.CHARSWAP_CLOUD_ROUTE, file, state: c.state, loaderPath: c.loaderPath, foundVia: c.via, assetSearch: assets, inLoaderList, recommended,
      missing: recommended.filter((m) => m.state === 'missing').map((m) => m.id), ...(c.state === 'missing' ? { message: H.CHARSWAP_LORA_MISSING } : {}) };
  });
  // Oct 27: Render · LTX-2.5 + Layout to Render · Comfy Cloud: the same free check (GET only, the app's own key) for the imported Layout to Render LoRA
  app.get('/api/comfy-cloud/ltx25-layout/check', async (_req, reply) => {
    const { cloudTargetFor, cloudTestFetch } = await import('./routing/cloudRun.js'); const { findRoute } = await import('./routing/routes.js');
    const L = await import('./comfy/ltx25LayoutCloud.js'); const r = findRoute(L.LAYOUT_CLOUD_ROUTE); const tg = r ? cloudTargetFor(r) : null;
    const how = { importAs: L.layoutLoraName(), recommended: L.layoutRecommendedReport({ state: 'unknown', loaderPath: null }) };
    if (!tg) return reply.code(409).send({ error: 'No Comfy API key is set', errorType: 'validation', code: 'key_missing', route: L.LAYOUT_CLOUD_ROUTE, ...how });
    const f = cloudTestFetch() ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    const get = (p: string) => f(tg.base + p, { method: 'GET', headers: { Authorization: `Bearer ${tg.token}` }, signal: AbortSignal.timeout(30_000) });
    const c = await L.checkLayoutLora(get); const recommended = L.layoutRecommendedReport(c);
    return { route: L.LAYOUT_CLOUD_ROUTE, file: L.layoutLoraName(), state: c.state, loaderPath: c.loaderPath, foundVia: c.via, recommended,
      missing: recommended.filter((m) => m.state === 'missing').map((m) => m.id), ...(c.state === 'missing' ? { message: L.LAYOUT_LORA_MISSING } : {}) };
  });
  // Oct 27: One-time setup (Settings → Connections): the three Comfy Cloud imports and CrossView's deployment, with the plain steps. ?check=1 runs the free
  // GET-only checks (the routes' own probes); without it nothing is fetched from Comfy.
  app.get<{ Querystring: { check?: string } }>('/api/comfy-cloud/setup', async (req) => {
    const S = await import('./comfy/cloudSetup.js'); const items = S.CLOUD_SETUP.map(({ route: _r, ...x }) => x);
    if (!/^(1|true|yes)$/i.test(req.query.check ?? '')) { const d = deployState();
      return { items: items.map((x) => ({ ...x, state: x.kind === 'deployment' && !d.configured ? 'missing' : 'not_checked', note: x.kind === 'deployment' && !d.configured ? d.reason : null })), checkedAt: null }; }
    const { cloudTargetFor, cloudTestFetch } = await import('./routing/cloudRun.js'); const { findRoute } = await import('./routing/routes.js'); const L = await import('./comfy/ltx25LayoutCloud.js');
    const r = findRoute(L.LAYOUT_CLOUD_ROUTE); const tg = r ? cloudTargetFor(r) : null; const f = cloudTestFetch() ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    const get = tg ? (p: string) => f(tg.base + p, { method: 'GET', headers: { Authorization: `Bearer ${tg.token}` }, signal: AbortSignal.timeout(30_000) }) : null;
    const res = await S.checkCloudSetup(get, () => probeDeploy({ nodes: true, f: cloudTestFetch() ?? undefined }) as any);
    return { items: items.map((x) => ({ ...x, ...res[x.id] })), checkedAt: new Date().toISOString() };
  });
  app.post<{ Body: { confirm?: unknown } }>('/api/comfy-deploy/smoke', async (req, reply) => {
    if (req.body?.confirm !== true) return reply.code(400).send({ error: 'The deployment test runs a short paid job on your Comfy account. Send {"confirm": true} to run it.', errorType: 'validation', code: 'confirm_required' });
    const st = deployState(); if (!st.configured) return reply.code(409).send({ error: st.reason, errorType: 'validation', code: st.reasonCode });
    const { runFfmpeg } = await import('./ffmpeg.js'); const { runCloudWorkflow } = await import('./routing/cloudRun.js');
    const id = `deploysmoke-${Date.now().toString(36)}`; const img = path.join(DATA_DIR, `${id}-in.png`);
    if (await runFfmpeg(['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0xff7a1a:s=64x64', '-frames:v', '1', img]) !== 0) return reply.code(500).send({ error: 'Couldn’t make the test image (ffmpeg).', errorType: 'temporary' });
    const job: any = { id, toolId: 'deploy-smoke', provider: 'deploy-smoke', route: DEPLOY_SMOKE_ROUTE.routeId, input: { imagePath: img }, status: 'queued', stage: 'queued', progress: 0, queuePos: 0, eta: 0, createdAt: Date.now(), updatedAt: Date.now() };
    const attempt: any = { n: 1, routeId: DEPLOY_SMOKE_ROUTE.routeId, status: 'running', startedAt: Date.now(), charged: 0, refunded: 0 };
    const t0 = Date.now();
    try { await runCloudWorkflow(job, DEPLOY_SMOKE_ROUTE, attempt); }
    catch (e) { return reply.code(job.reasonCode === 'price_unmeasured' ? 409 : 502).send({ ok: false, error: (e as Error).message, code: job.reasonCode ?? 'deploy_failed', cloudJobId: job.cloudJobId ?? null, seconds: Math.round((Date.now() - t0) / 1000) }); }
    return { ok: job.status === 'done', outputs: job.outputs ?? [], cloudJobId: job.cloudJobId ?? null, seconds: Math.round((Date.now() - t0) / 1000) };
  });
}
