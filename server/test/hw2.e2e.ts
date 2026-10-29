// HW2 (DP asks, Oct 19 2026) + the hardware checklist end to end, on this worktree's own throwaway mock servers (never :8787/:8788).
// Temp data dirs removed on exit; nothing installed, no GPU, no real downloads (mock transport: tiny placeholder files), no paid calls.
//  :8921  HOST=127.0.0.1, no keys (sample mode), NO models folder, hardware unknown (no ComfyUI) → DP 5 manual VRAM drives the tier, 1 GB free disk
//  :8922  HOST=0.0.0.0 (not loopback-bound), HW_MOCK=mid16, fake fal/Replicate keys, Use local on, empty models folder, COMFY_BASE_URL = a closed port
// In-test stubs: a ComfyUI that never answers (timeout), one that answers HTTP 500 (bad_response). Each check prints PASS/FAIL; any FAIL exits 1.
import { testPort } from './_ports.js'; import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http'; import net from 'node:net';
const ROOT = path.resolve(import.meta.dirname, '..'); const TSX = path.resolve(ROOT, '../node_modules/.bin/tsx');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', CIVITAI_TOKEN: '', COMFY_BASE_URL: '', OPENHIGGSFIELD_HW_MOCK: '', OPENHIGGSFIELD_COMFY_MODELS_DIR: '' };
const procs: ChildProcess[] = [];
async function boot(port: number, extra: Record<string, string>, models: boolean) {
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'hw2-')); const M = path.join(D, 'models'); if (models) fs.mkdirSync(M);
  procs.push(spawn(TSX, ['src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_COMMERCIAL: '', OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY: '',
    OPENHIGGSFIELD_DOWNLOAD_MOCK_MS: '600', ...(models ? { OPENHIGGSFIELD_COMFY_MODELS_DIR: M } : {}), ...extra } }));
  const B = `http://localhost:${port}`;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) return { B, M }; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  throw new Error(`server :${port} did not start`);
}
const get = async (u: string) => (await (await fetch(u)).json()) as any;
const send = async (method: string, u: string, body?: any) => { const r = await fetch(u, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: (await r.json().catch(() => ({}))) as any }; };
const job = async (B: string, tool: string, f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.set(k, v); const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, j: (await r.json()) as any }; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: { name: string; pass: boolean; err?: string }[] = [];
async function check(name: string, fn: () => Promise<void>) { try { await fn(); results.push({ name, pass: true }); console.log(`PASS ${name}`); } catch (e: any) { results.push({ name, pass: false, err: String(e?.message ?? e).slice(0, 500) }); console.log(`FAIL ${name}\n     ${String(e?.message ?? e).slice(0, 500)}`); } }
const localRoute = async (B: string, tool: string, model: string, q = '') => { const r = await get(`${B}/api/routes?toolId=${tool}&modelId=${model}${q}`); const v = r.routes.find((x: any) => x.modelId === model); return { v, loc: v.routes.find((x: any) => x.kind === 'local') }; };
const findModel = (x: any, tool: string, id: string): any => { if (!x || typeof x !== 'object') return null; if (x.toolId === tool && x.id === id && x.fit !== undefined) return x; for (const v of Object.values(x)) { const f = findModel(v, tool, id); if (f) return f; } return null; };
const assertAlt = (a: any, demo: boolean) => { assert.ok(a, 'alternative present'); for (const k of ['providerId', 'routeId', 'name', 'routeLabel', 'priceLine']) assert.ok(typeof a[k] === 'string' && a[k], k); assert.equal(a.demo, demo);
  if (demo) { assert.equal(a.credits, 0); assert.match(a.priceLine, /^Sample output, nothing billed\./); } else { assert.ok(a.credits > 0); assert.match(a.priceLine, /^≈ \$\d+\.\d{2,3}$/); } assert.notEqual(a.routeId.split(':')[0], 'local'); };

// stubs: never answers (timeout) · HTTP 500 (bad_response) · a closed port (refused)
const hang = http.createServer(() => { /* never answers */ }); await new Promise<void>((r) => hang.listen(0, '127.0.0.1', () => r())); const HANG = `http://127.0.0.1:${(hang.address() as any).port}`;
const e500 = http.createServer((_q, s) => { s.statusCode = 500; s.end('boom'); }); await new Promise<void>((r) => e500.listen(0, '127.0.0.1', () => r())); const E500 = `http://127.0.0.1:${(e500.address() as any).port}`;
const CLOSED = await new Promise<string>((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as any).port; s.close(() => r(`http://127.0.0.1:${p}`)); }); });
try {
  const [{ B: A }, { B: C, M: MC }] = await Promise.all([
    boot(testPort(8921), { HOST: '127.0.0.1', OPENHIGGSFIELD_DISK_FREE_GB: '1' }, false),
    boot(testPort(8922), { HOST: '0.0.0.0', OPENHIGGSFIELD_HW_MOCK: 'mid16', COMFY_BASE_URL: CLOSED, OPENHIGGSFIELD_DISK_FREE_GB: '500', OPENHIGGSFIELD_FAL_KEY: 'test-not-a-key', OPENHIGGSFIELD_REPLICATE_API_TOKEN: 'test-not-a-key' }, true)]);
  await send('PUT', `${C}/api/me/routing`, { global: { mode: 'auto', allowFallback: true, useLocal: true, mockKeys: true } });

  // ===== hardware checklist =====
  await check('HW-1 PUT /api/hardware {vramGB} manual override (used when the hardware can\'t be read) + DELETE /api/hardware/override; unknown tier label', async () => {
    const h0 = await get(`${A}/api/hardware`); assert.equal(h0.tier, 'unknown'); assert.equal(h0.tierLabel, "Couldn't check the hardware, so nothing is blocked");
    assert.equal((await send('PUT', `${A}/api/hardware`, { vramGB: 'lots' })).status, 400);
    const m = await send('PUT', `${A}/api/hardware`, { vramGB: 12 }); assert.equal(m.status, 200); assert.equal(m.j.manualInUse, true); assert.equal(m.j.source, 'manual'); assert.equal(m.j.tier, 'most'); assert.equal(m.j.saved.vramGB, 12);
    const d = await send('DELETE', `${A}/api/hardware/override`); assert.equal(d.status, 200); assert.equal(d.j.cleared, true); assert.equal(d.j.manual, null); assert.equal(d.j.tier, 'unknown'); });
  await check('HW-2 fit verdicts fits / slow / too_heavy on local routes at low (4 GB), mid (16 GB) and high (48 GB) VRAM', async () => {
    const v = async (model: string) => (await localRoute(A, 'create-image', model, '&types=generate')).loc.fit.verdict;
    await send('PUT', `${A}/api/hardware`, { vramGB: 4 }); assert.equal(await v('comfy-zimage'), 'too_heavy'); assert.equal(await v('comfy-flux3-klein'), 'slow'); assert.equal(await v('comfy-flux2dev'), 'too_heavy');
    await send('PUT', `${A}/api/hardware`, { vramGB: 16 }); assert.equal(await v('comfy-zimage'), 'fits'); assert.equal(await v('comfy-qwen-image'), 'slow');
    await send('PUT', `${A}/api/hardware`, { vramGB: 48 }); assert.equal(await v('comfy-qwen-image'), 'fits'); assert.equal(await v('comfy-flux2dev'), 'fits');
    await send('DELETE', `${A}/api/hardware/override`); assert.equal(await v('comfy-zimage'), 'unknown'); });
  await check('HW-3 Auto never picks too_heavy (listing unavailable, quote not runnable); Auto on a local-only too-heavy model → 409 too_heavy, nothing charged', async () => {
    const { loc } = await localRoute(C, 'create-image', 'comfy-flux2dev', '&types=generate'); assert.equal(loc.fit.verdict, 'too_heavy'); assert.equal(loc.available, false); assert.equal(loc.runsWhenPinned, true); assert.match(loc.status, /^Too heavy for your computer$/);
    const q = await get(`${C}/api/tools/create-image/price?provider=comfy-flux2dev&types=generate&prompt=x`); assert.equal(q.runnable, false); assert.equal(q.reasonCode, 'too_heavy');
    const bal = (await get(`${C}/api/ledger`)).balance; const a = await job(C, 'create-image', { prompt: 'a cat', types: 'generate', provider: 'comfy-flux2dev' }); assert.equal(a.status, 409); assert.equal(a.j.code, 'too_heavy'); assert.equal(a.j.charged, false);
    assert.equal((await get(`${C}/api/ledger`)).balance, bal); });
  await check('HW-4 a pinned too_heavy route runs with fit.warning (quote, job, /api/routes local route + top-level fit, /api/tools route list)', async () => {
    const q = await get(`${C}/api/tools/create-image/price?provider=comfy-flux2dev&route=local:comfy-flux2dev&types=generate&prompt=x`); assert.equal(q.runnable, true); assert.match(q.fit.warning, /may be too heavy for your computer\. It can fail or run very slowly\./); assert.equal(q.fitWarning, q.fit.warning);
    const p = await job(C, 'create-image', { prompt: 'a cat', types: 'generate', provider: 'comfy-flux2dev', route: 'local:comfy-flux2dev' }); assert.equal(p.status, 200, JSON.stringify(p.j).slice(0, 300)); assert.equal(p.j.fit.warning, q.fit.warning);
    for (let i = 0; i < 80 && !['done', 'failed'].includes((await get(`${C}/api/jobs/${p.j.id}`)).status); i++) await sleep(250);
    const pj = await get(`${C}/api/jobs/${p.j.id}`); assert.equal(pj.status, 'done'); assert.equal(pj.fit.warning, q.fit.warning); assertAlt(pj.fit.alternative, false); assert.equal(pj.fit.alternativeReason, 'too_heavy');
    assert.equal((await send('PUT', `${C}/api/me/routing`, { perModel: { 'comfy-flux2dev': { route: 'local:comfy-flux2dev' } } })).status, 200);
    const { v, loc } = await localRoute(C, 'create-image', 'comfy-flux2dev', '&types=generate'); assert.equal(loc.status, 'Pinned · too heavy for your computer'); assert.equal(loc.fit.warning, q.fit.warning); assert.equal(loc.fit.pinnedAnyway, true); assert.equal(v.fit.warning, q.fit.warning);
    const tools = await get(`${C}/api/tools`) as any[]; const pr = tools.find((t) => t.id === 'create-image').providers.find((x: any) => x.id === 'comfy-flux2dev'); const tl = (pr.routes ?? []).find((r: any) => r.kind === 'local');
    assert.ok(tl, 'route list on /api/tools'); assert.equal(tl.fit.warning, q.fit.warning);
    await send('PUT', `${C}/api/me/routing`, { perModel: { 'comfy-flux2dev': { route: 'auto' } } }); });
  await check('HW-5 POST /api/local/downloads → 409 no_models_dir (real POST, exact message)', async () => {
    const r = await send('POST', `${A}/api/local/downloads`, { providerId: 'comfy-zimage' }); assert.equal(r.status, 409); assert.equal(r.j.code, 'no_models_dir'); assert.equal(r.j.error, 'No ComfyUI models folder is set, so there is nowhere to put the files.'); });
  await check('HW-6 dryRun returns the file list + missingBytes (no models folder: 200, canDownload:false, code no_models_dir, assumed_all; with a folder: checked, canDownload)', async () => {
    const a = await send('POST', `${A}/api/local/downloads`, { providerId: 'comfy-zimage', dryRun: true }); assert.equal(a.status, 200); assert.equal(a.j.canDownload, false); assert.equal(a.j.code, 'no_models_dir'); assert.equal(a.j.error, 'No ComfyUI models folder is set, so there is nowhere to put the files.');
    assert.equal(a.j.missingBytesSource, 'assumed_all'); assert.ok(a.j.files.length >= 2 && a.j.files.every((f: any) => f.bytesTotal > 0 && f.status === 'queued')); assert.equal(a.j.missingBytes, a.j.files.reduce((s: number, f: any) => s + f.bytesTotal, 0)); assert.equal(a.j.modelsDir, null);
    const c = await send('POST', `${C}/api/local/downloads`, { providerId: 'comfy-zimage', dryRun: true }); assert.equal(c.status, 200); assert.equal(c.j.canDownload, true); assert.equal(c.j.code, null); assert.equal(c.j.missingBytesSource, 'checked'); assert.equal(c.j.missingBytes, a.j.missingBytes); assert.equal(c.j.downloadId, 'comfy-zimage'); });
  await check('HW-7 GET / DELETE /api/eta/learned', async () => {
    const l = await get(`${A}/api/eta/learned`); assert.equal(typeof l.samples, 'number'); assert.equal(l.learning, false); assert.ok(l.hwKey); const d = await send('DELETE', `${A}/api/eta/learned`); assert.equal(d.status, 200); assert.equal(d.j.ok, true); });
  await check('HW-8 GET/PUT /api/local/comfy: 403 not_loopback when not loopback-bound; allowed when HOST=127.0.0.1', async () => {
    const g = await get(`${C}/api/local/comfy`); assert.equal(g.canChange, false); const p = await send('PUT', `${C}/api/local/comfy`, { url: HANG }); assert.equal(p.status, 403); assert.equal(p.j.code, 'not_loopback');
    const t = await send('POST', `${C}/api/local/comfy/test`, { url: HANG }); assert.equal(t.status, 403); assert.equal(t.j.code, 'not_loopback');
    const ga = await get(`${A}/api/local/comfy`); assert.equal(ga.canChange, true); const pa = await send('PUT', `${A}/api/local/comfy`, { url: E500 }); assert.equal(pa.status, 200); assert.equal(pa.j.url, E500); assert.equal(pa.j.source, 'settings');
    const cl = await send('DELETE', `${A}/api/local/comfy`); assert.equal(cl.j.cleared, true); });

  await check('HW2-6 BH P3 single-input wording (a/an) + no absolute paths in /api/hardware disk.path, dry-run modelsDir, requirements.modelsDir', async () => {
    const r = await job(A, 'app-relight', { prompt: 'warm light' }); assert.equal(r.status, 400); assert.equal(r.j.error, 'Add an image.');
    const v = await job(A, 'app-translate-video', {}); assert.equal(v.status, 400); assert.equal(v.j.error, 'Add a video.');
    const h = await get(`${A}/api/hardware`); assert.ok(h.disk.path && !h.disk.path.startsWith('/'), `disk.path ${h.disk.path}`);
    const dc = await send('POST', `${C}/api/local/downloads`, { providerId: 'comfy-zimage', dryRun: true }); assert.equal(dc.j.modelsDirSet, true); assert.equal(dc.j.modelsDir, 'models');
    const da = await send('POST', `${A}/api/local/downloads`, { providerId: 'comfy-zimage', dryRun: true }); assert.equal(da.j.modelsDirSet, false); assert.equal(da.j.modelsDir, null);
    const q = await get(`${C}/api/tools/create-image/price?provider=comfy-zimage&route=local:comfy-zimage&types=generate&prompt=x`); assert.equal(q.requirements.modelsDir, 'models'); assert.equal(q.requirements.modelsDirSet, true);
    const l = await get(`${C}/api/local/downloads`); assert.equal(l.modelsDir, 'models'); assert.ok(l.downloads.every((d: any) => !String(d.modelsDir ?? '').startsWith('/'))); });
  // ===== HW2 items =====
  await check('HW2-1 fit.alternative is real (best runnable cloud route) on slow / too_heavy / unknown / weights missing, via /api/routes, /api/models, quotes and job.fit', async () => {
    const { v, loc } = await localRoute(C, 'create-image', 'comfy-flux2dev', '&types=generate'); assertAlt(loc.fit.alternative, false); assert.equal(loc.fit.alternativeReason, 'too_heavy'); assert.deepEqual(v.fit.alternative, loc.fit.alternative);
    const s = await get(`${C}/api/tools/create-image/price?provider=comfy-qwen-image&route=local:comfy-qwen-image&types=generate&prompt=x`); assert.equal(s.fit.verdict, 'slow'); assertAlt(s.fit.alternative, false); assert.equal(s.fit.alternativeReason, 'weights_missing', 'slow AND files missing (empty models folder): the needs-download state wins (2026-10-25)');
    const z = await get(`${C}/api/tools/create-image/price?provider=comfy-zimage&route=local:comfy-zimage&types=generate&prompt=x`); assert.equal(z.fit.verdict, 'fits'); assert.equal(z.fit.alternativeReason, 'weights_missing', 'empty models folder'); assertAlt(z.fit.alternative, false);
    const models = await get(`${C}/api/models`); const mm = findModel(models, 'create-image', 'comfy-flux2dev'); assert.ok(mm, '/api/models card'); assertAlt(mm.fit.alternative, false);
    const ua = await localRoute(A, 'create-image', 'comfy-zimage', '&types=generate'); assert.equal(ua.loc.fit.verdict, 'unknown'); assert.equal(ua.loc.fit.alternativeReason, 'unknown'); assertAlt(ua.loc.fit.alternative, true); assert.ok(ua.loc.fit.alternative.listCredits > 0, 'keyless mock: the sample quotes would run');
    const j = await job(C, 'create-image', { prompt: 'x', types: 'generate', provider: 'comfy-qwen-image', route: 'local:comfy-qwen-image' }); assert.equal(j.status, 200); const jj = await get(`${C}/api/jobs/${j.j.id}`); assertAlt(jj.fit.alternative, false); assert.equal(jj.fit.alternativeReason, 'weights_missing'); });
  await check('HW2-2 missingBytes without a models folder = all needed files (missingBytesSource assumed_all), no disk blocker from a guess; with a folder: checked', async () => {
    const q = await get(`${A}/api/tools/create-image/price?provider=comfy-zimage&route=local:comfy-zimage&types=generate&prompt=x`); assert.equal(q.requirements.missingBytesSource, 'assumed_all'); assert.equal(q.requirements.missingBytes, q.requirements.downloadBytes); assert.equal(q.requirements.missingFiles, null);
    assert.equal(q.fit.missingBytesSource, 'assumed_all'); assert.equal(q.fit.missingBytes, q.requirements.missingBytes); assert.deepEqual(q.fit.blockers, []); assert.notEqual(q.fit.reasonCode, 'not_enough_disk', '1 GB free, but nothing was checked');
    const c = await get(`${C}/api/tools/create-image/price?provider=comfy-zimage&route=local:comfy-zimage&types=generate&prompt=x`); assert.equal(c.requirements.missingBytesSource, 'checked'); assert.equal(c.requirements.missingBytes, c.requirements.downloadBytes); });
  await check('HW2-3 per-family downloadId in requirements / fit / route + model lists; comfy-open providerId alone → 400 ambiguous_download {choices}; downloadId accepted (dryRun + real 202)', async () => {
    const { v, loc } = await localRoute(C, 'camera', 'comfy-open'); assert.match(v.requirements.downloadId, /^comfy-open:/); assert.equal(v.fit.downloadId, v.requirements.downloadId); assert.equal(loc.fit.downloadId, v.requirements.downloadId);
    const mm = findModel(await get(`${C}/api/models`), 'create-image', 'comfy-zimage'); assert.equal(mm.requirements.downloadId, 'comfy-zimage'); assert.equal(mm.fit.downloadId, 'comfy-zimage');
    const amb = await send('POST', `${C}/api/local/downloads`, { providerId: 'comfy-open' }); assert.equal(amb.status, 400); assert.equal(amb.j.code, 'ambiguous_download'); assert.ok(amb.j.choices.length >= 3);
    for (const ch of amb.j.choices) { assert.match(ch.downloadId, /^comfy-open:/); assert.ok(ch.label && ch.toolIds.length && ch.workflows.length); }
    assert.equal((await send('POST', `${C}/api/local/downloads`, { providerId: 'comfy-open', dryRun: true })).status, 400, 'dry run is ambiguous too');
    assert.equal((await send('POST', `${C}/api/local/downloads`, { downloadId: 'comfy-open:not-a-workflow' })).status, 404);
    const dr = await send('POST', `${C}/api/local/downloads`, { downloadId: v.requirements.downloadId, dryRun: true }); assert.equal(dr.status, 200); assert.equal(dr.j.downloadId, v.requirements.downloadId); assert.equal(dr.j.missingBytes, v.requirements.missingBytes - v.requirements.missingFiles.filter((f: any) => f.autoDownloaded).reduce((s: number, f: any) => s + (f.bytes ?? 0), 0));
    const da = await send('POST', `${A}/api/local/downloads`, { downloadId: v.requirements.downloadId, dryRun: true }); assert.equal(da.status, 200); assert.equal(da.j.code, 'no_models_dir'); assert.equal(da.j.missingBytes, dr.j.missingBytes);
    const s = await send('POST', `${C}/api/local/downloads`, { downloadId: 'comfy-open:camera-ltx' }); assert.equal(s.status, 202, JSON.stringify(s.j).slice(0, 300)); assert.equal(s.j.downloadId, 'comfy-open:camera-ltx'); assert.equal(s.j.providerId, 'comfy-open'); assert.ok(s.j.files.length >= 1);
    const again = await send('POST', `${C}/api/local/downloads`, { downloadId: 'comfy-open:camera-ltx' }); assert.equal(again.j.id, s.j.id, 'one at a time');
    await send('DELETE', `${C}/api/local/downloads/${s.j.id}`); for (let i = 0; i < 20 && (await get(`${C}/api/local/downloads/${s.j.id}`)).status === 'downloading'; i++) await sleep(100);
    const files = fs.readdirSync(MC, { recursive: true }).map((x) => path.join(MC, String(x))).filter((x) => fs.statSync(x).isFile()); assert.ok(files.every((x) => fs.statSync(x).size <= 1024), 'placeholders only'); });
  await check('HW2-5 POST /api/local/comfy/test (server default address): refused / timeout / not_found / bad_response → plain error + errorCode', async () => {
    const r = await send('POST', `${C}/api/local/comfy/test`, {}); assert.equal(r.status, 200); assert.equal(r.j.reachable, false); assert.equal(r.j.errorCode, 'refused'); assert.equal(r.j.error, `Couldn't connect to ComfyUI at ${CLOSED}. Is it running?`);
    const t0 = Date.now(); await send('PUT', `${A}/api/local/comfy`, { url: HANG }); const t = await send('POST', `${A}/api/local/comfy/test`, {}); assert.equal(t.j.errorCode, 'timeout'); assert.equal(t.j.error, `ComfyUI at ${HANG} didn't answer within 3 seconds.`); assert.equal(t.j.timeoutSec, 3); assert.ok(Date.now() - t0 < 9000);
    await send('PUT', `${A}/api/local/comfy`, { url: 'http://openhiggsfield-nohost.invalid:8188' }); const n = await send('POST', `${A}/api/local/comfy/test`, {}); // this box's resolver can be slower than the 3 s test timeout: then it reads as timeout (the DNS mapping is pinned in hw2.test.ts)
    assert.ok(['not_found', 'timeout'].includes(n.j.errorCode), JSON.stringify(n.j)); if (n.j.errorCode === 'not_found') assert.equal(n.j.error, "Couldn't find openhiggsfield-nohost.invalid.");
    await send('PUT', `${A}/api/local/comfy`, { url: E500 }); const b = await send('POST', `${A}/api/local/comfy/test`, {}); assert.equal(b.j.errorCode, 'bad_response'); assert.equal(b.j.error, `Something answered at ${E500}, but not like ComfyUI (HTTP 500).`);
    await send('DELETE', `${A}/api/local/comfy`); const ns = await send('POST', `${A}/api/local/comfy/test`, {}); assert.equal(ns.j.errorCode, 'not_set'); assert.equal(ns.j.error, 'No ComfyUI address is set.'); });
} finally { for (const p of procs) try { process.kill(-p.pid!); } catch { /* gone */ } hang.closeAllConnections?.(); hang.close(); e500.close(); }
const failed = results.filter((r) => !r.pass);
console.log(`\nhw2.e2e: ${results.length - failed.length}/${results.length} checks passed`); for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
process.exit(failed.length ? 1 : 0);
