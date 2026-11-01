/**
 * HW-SHAPES endpoints (Oct 19 2026): this computer's hardware (B1, DP 5), the runtime ComfyUI address (DP 6), learned timings (B5, DP 7)
 * and one-click model downloads (Q4). Registered from index.ts.
 */
import { comfyAddressAllowed, COMFY_ADDRESS_MESSAGE } from './security/keyHosts.js';
import type { FastifyInstance } from 'fastify';
import { getHardware, setManual, getManual, lastRefreshAt, REFRESH_MIN_SEC, comfyUrlState, comfyUrlError, setComfyUrl, checkComfy, safeUrl, refreshReachability, parseSystemStats, hwKeyOf, displayDir, liveReading } from './hardware.js';
import { isLoopback } from './routing/settings.js';
import { learnedSummary, resetLearned, rateOf } from './etaLearn.js';
import { startDownload, listDownloads, getDownload, cancelDownload, downloadView, downloadCheck, DlError } from './hardware/downloads.js';
import { modelsDir } from './hardware/requirements.js';
import { separationStatus } from './comfy/separation.js';
import { config } from './config.js';

const bad = (field: string, message: string) => ({ error: message, errorType: 'validation', issues: [{ code: 'invalid', field, message }] });
const LOOPBACK_ONLY = 'Changing the ComfyUI address from the browser is off because the server isn’t running on this computer. Set it in the server’s settings file instead.';
/** HW2 item 5: POST /api/local/comfy/test waits this long (the timeout sentence names it). */
export const COMFY_TEST_TIMEOUT_MS = 3000;
/** Where a ComfyUI usually answers on this computer (ComfyUI's own default, then Comfy Desktop). Env OPENHIGGSFIELD_COMFY_DETECT_URLS (comma list) replaces it (tests, odd setups). */
export const COMFY_USUAL_URLS = (process.env.OPENHIGGSFIELD_COMFY_DETECT_URLS ?? 'http://127.0.0.1:8188,http://127.0.0.1:8000').split(',').map((x) => x.trim()).filter(Boolean);
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN);

export function registerHardware(app: FastifyInstance) {
  // ---- B1 / DP 5: hardware ----
  const view = async (refresh: boolean) => { const hw = await getHardware({ refresh }); const next = Math.max(0, Math.ceil((lastRefreshAt() + REFRESH_MIN_SEC * 1000 - Date.now()) / 1000));
    return { ...hw, hwKey: hwKeyOf(hw), refreshAfterSec: next, rates: { download: rateOf(hwKeyOf(hw), 'download'), load: rateOf(hwKeyOf(hw), 'load') } }; };
  app.get<{ Querystring: { refresh?: string } }>('/api/hardware', async (req) => view(/^(1|true)$/i.test(req.query.refresh ?? '')));
  app.post('/api/hardware/refresh', async () => view(true));
  /** "This computer" card: memory and disk right now (polled every few seconds while the card is visible). GET only, no probe of Comfy Cloud. */
  app.get('/api/hardware/live', async () => liveReading());
  app.put<{ Body: { vramGB?: unknown; ramGB?: unknown } }>('/api/hardware', async (req, reply) => {
    const v = num(req.body?.vramGB); const r = req.body?.ramGB == null || req.body.ramGB === '' ? null : num(req.body.ramGB);
    if (!Number.isFinite(v) || v < 0 || v > 1024) return reply.code(400).send(bad('vramGB', 'vramGB must be a number of GB between 0 and 1024 (0 = no graphics card).'));
    if (r != null && (!Number.isFinite(r) || r <= 0 || r > 4096)) return reply.code(400).send(bad('ramGB', 'ramGB must be a number of GB between 1 and 4096.'));
    setManual({ vramGB: Math.round(v * 10) / 10, ramGB: r == null ? null : Math.round(r * 10) / 10 });
    const hw = await view(false); return { ...hw, saved: getManual(), note: hw.manualInUse ? hw.note : "Saved. This computer's hardware was read automatically, so the values you entered are kept but not used." };
  });
  app.delete('/api/hardware/override', async () => { setManual(null); return { ...(await view(false)), cleared: true }; });

  // ---- DP 6: ComfyUI address ----
  app.get('/api/local/comfy', async () => ({ ...comfyUrlState(), canChange: isLoopback(process.env.HOST) }));
  app.put<{ Body: { url?: unknown } }>('/api/local/comfy', async (req, reply) => {
    if (!isLoopback(process.env.HOST)) return reply.code(403).send({ error: LOOPBACK_ONLY, errorType: 'forbidden', code: 'not_loopback' });
    const u = req.body?.url; if (u === null || u === '') return { ...setComfyUrl(null), canChange: true, cleared: true };
    const e = comfyUrlError(u) ?? (comfyAddressAllowed(String(u).trim()) ? null : COMFY_ADDRESS_MESSAGE); if (e) return reply.code(400).send(bad('url', e));
    const st = setComfyUrl(String(u)); void refreshReachability().catch(() => undefined); return { ...st, canChange: true };
  });
  app.delete('/api/local/comfy', async (_req, reply) => { if (!isLoopback(process.env.HOST)) return reply.code(403).send({ error: LOOPBACK_ONLY, errorType: 'forbidden', code: 'not_loopback' }); return { ...setComfyUrl(null), canChange: true, cleared: true }; });
  app.post<{ Body: { url?: unknown } }>('/api/local/comfy/test', async (req, reply) => {
    const given = req.body?.url != null && req.body.url !== '';
    if (given && !isLoopback(process.env.HOST)) return reply.code(403).send({ error: 'Testing another address from the browser is off because the server isn’t running on this computer.', errorType: 'forbidden', code: 'not_loopback' });
    if (given) { const e = comfyUrlError(req.body!.url) ?? (comfyAddressAllowed(String(req.body!.url).trim()) ? null : COMFY_ADDRESS_MESSAGE); if (e) return reply.code(400).send(bad('url', e)); }
    let url = given ? String(req.body!.url).trim() : config.comfyBaseUrl; let detected = false;
    // no address yet: look on the usual ports of this computer (ComfyUI 8188, Comfy Desktop 8000); the caller saves what it finds (PUT /api/local/comfy)
    if (!given && (!url || /cloud\.comfy\.org|\.run\.comfy\.app/i.test(url))) for (const u of COMFY_USUAL_URLS) { const c = await checkComfy(u, { timeoutMs: 1500, gguf: false }); if (c.reachable) { url = u; detected = true; break; } }
    const c = await checkComfy(url, { timeoutMs: COMFY_TEST_TIMEOUT_MS }); const s = c.stats ? parseSystemStats(c.stats) : null;
    return { url: url ? safeUrl(url) : null, detected, reachable: c.reachable, version: c.version, latencyMs: c.latencyMs, ggufNode: c.ggufNode, cloud: c.cloud, error: c.error, errorCode: c.errorCode, timeoutSec: COMFY_TEST_TIMEOUT_MS / 1000,
      gpu: s?.gpu ? { name: s.gpu.name, type: s.gpu.type, vramTotalGB: s.gpu.vramTotalGB } : null };
  });

  // ---- B5 / DP 7: learned timings ----
  app.get('/api/eta/learned', async () => ({ ...learnedSummary(), hwKey: hwKeyOf(), learning: config.backend !== 'mock' || /^(1|true)$/i.test(process.env.OPENHIGGSFIELD_ETA_LEARN_MOCK ?? '') }));
  app.delete('/api/eta/learned', async () => ({ ...resetLearned(), ok: true }));

  // ---- Q4: downloads ----
  // HW2: downloadId (requirements.downloadId / fit.downloadId) names one route's files; providerId alone on comfy-open → 400 ambiguous_download {choices}.
  // dryRun always answers 200 with the plan (files, missingBytes, missingBytesSource, canDownload, code); the real POST keeps its 409s.
  const dlFail = (reply: any, e: DlError) => { const code = e.code === 'not_found' ? 404 : e.code === 'bad_request' || e.code === 'ambiguous_download' ? 400 : 409;
    return reply.code(code).send({ error: e.message, code: e.code, errorType: code === 409 ? 'conflict' : code === 404 ? 'not_found' : 'validation', ...e.extra }); };
  app.post<{ Body: { providerId?: string; variantId?: string; downloadId?: string; dryRun?: boolean } }>('/api/local/downloads', async (req, reply) => {
    const b = req.body ?? {}; if (!b.providerId && !b.variantId && !b.downloadId) return reply.code(400).send(bad('downloadId', 'Give downloadId (one model’s files), providerId (a local model) or variantId (a lighter version).'));
    const spec = { providerId: b.providerId ?? null, variantId: b.variantId ?? null, downloadId: b.downloadId ?? null };
    if (b.dryRun === true || String(b.dryRun) === 'true' || String(b.dryRun) === '1') {
      try { const c = downloadCheck(spec);
        return { dryRun: true, label: c.plan.label, providerId: c.plan.providerId, variantId: spec.variantId, downloadId: c.plan.downloadId, bytesTotal: c.plan.files.reduce((a, f) => a + (f.bytesTotal ?? 0), 0), missingBytes: c.need, missingBytesSource: c.missingBytesSource,
          diskFreeBytes: c.free, modelsDir: displayDir(c.dir ?? modelsDir()), modelsDirSet: !!modelsDir(), canDownload: c.code == null, code: c.code, error: c.message, files: c.plan.files.map(({ sha256, ...f }) => ({ ...f, checksum: !!sha256 })) }; }
      catch (e) { if (e instanceof DlError) return dlFail(reply, e); throw e; } }
    try { const d = startDownload(spec); return reply.code(202).send(downloadView(d)); }
    catch (e) { if (!(e instanceof DlError)) throw e; return dlFail(reply, e); }
  });
  /** Keep the background (comfy/separation.ts): whether Translate a video / Change Voice can split voice from music here. Read only. */
  app.get('/api/local/separation', async () => separationStatus());
  app.get('/api/local/downloads', async () => ({ downloads: listDownloads().map(downloadView), modelsDir: displayDir(modelsDir()), modelsDirSet: !!modelsDir() }));
  app.get<{ Params: { id: string } }>('/api/local/downloads/:id', async (req, reply) => { const d = getDownload(req.params.id); return d ? downloadView(d) : reply.code(404).send({ error: 'not found', code: 'not_found' }); });
  app.delete<{ Params: { id: string } }>('/api/local/downloads/:id', async (req, reply) => { const d = cancelDownload(req.params.id); return d ? { ...downloadView(d), cancelRequested: true } : reply.code(404).send({ error: 'not found', code: 'not_found' }); });
}
