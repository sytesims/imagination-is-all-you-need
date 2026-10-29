// HW-SHAPES (Oct 19 2026) e2e: two throwaway mock servers (temp data dirs, removed on exit; nothing installed, no GPU, no network, no real-sized files).
//  :8911  OPENHIGGSFIELD_HW_MOCK=mid16 (16 GB card), Use local on, fake fal/Replicate keys, bound to 127.0.0.1, empty models folder
//  :8912  no HW_MOCK: probes an in-test ComfyUI stub (/system_stats 16 GB + /object_info/UnetLoaderGGUF), OPENHIGGSFIELD_ENFORCE_WEIGHTS=1, 1 GB free disk
// Steps 6–9 of the test plan (Auto skips too_heavy, slow after fits; pinned too_heavy runs with a warning (Q2), Auto on a local-only too-heavy model
// → 409 too_heavy; quotes; first-run download → load stages) + /api/hardware (DP 5 manual), /api/local/comfy (DP 6), /api/eta/learned (DP 7),
// /api/local/downloads (Q4, mock transport: tiny placeholder files), weights gate, GGUF variant (Q7). Run: npx tsx test/hardware.e2e.ts
import { testPort } from './_ports.js'; import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', CIVITAI_TOKEN: '', COMFY_BASE_URL: '', OPENHIGGSFIELD_HW_MOCK: '' };
const procs: ChildProcess[] = []; const GiB = 2 ** 30;
async function boot(port: number, extra: Record<string, string> = {}) {
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'hwe-')); const M = path.join(D, 'models'); fs.mkdirSync(M);
  procs.push(spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_COMMERCIAL: '', OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY: '',
    OPENHIGGSFIELD_COMFY_MODELS_DIR: M, OPENHIGGSFIELD_DOWNLOAD_MOCK_MS: '600', ...extra } }));
  const B = `http://localhost:${port}`;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) return { B, M }; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  throw new Error(`server :${port} did not start`);
}
const get = async (u: string) => (await (await fetch(u)).json()) as any;
const send = async (method: string, u: string, body?: any) => { const r = await fetch(u, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: (await r.json().catch(() => ({}))) as any }; };
const job = async (B: string, tool: string, f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.set(k, v); const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, j: (await r.json()) as any }; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now(); const ok = (m: string) => console.log(`ok [${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}`);
// ComfyUI stub for :8912 (16 GB card, GGUF node installed)
let stubHits = 0;
const stub = http.createServer((req, res) => { res.setHeader('content-type', 'application/json');
  if (req.url === '/system_stats') { stubHits++; return res.end(JSON.stringify({ system: { os: 'posix', ram_total: 64 * GiB, ram_free: 40 * GiB, comfyui_version: '0.41.3' }, devices: [{ name: 'cuda:0 NVIDIA GeForce RTX 4080 : cudaMallocAsync', type: 'cuda', index: 0, vram_total: 16376 * 2 ** 20, vram_free: 15000 * 2 ** 20 }] })); }
  if (req.url === '/object_info/UnetLoaderGGUF') return res.end(JSON.stringify({ UnetLoaderGGUF: { input: { required: { unet_name: [['x.gguf']] } } } }));
  res.statusCode = 404; res.end('{}'); });
await new Promise<void>((r) => stub.listen(0, '127.0.0.1', () => r())); const STUB = `http://127.0.0.1:${(stub.address() as any).port}`;
try {
  const [{ B: A, M: MA }, { B: C, M: MC }] = await Promise.all([
    boot(testPort(8911), { HOST: '127.0.0.1', OPENHIGGSFIELD_HW_MOCK: 'mid16', OPENHIGGSFIELD_DISK_FREE_GB: '500', OPENHIGGSFIELD_FAL_KEY: 'test-not-a-key', OPENHIGGSFIELD_REPLICATE_API_TOKEN: 'test-not-a-key' }),
    boot(testPort(8912), { HOST: '0.0.0.0', COMFY_BASE_URL: STUB, OPENHIGGSFIELD_ENFORCE_WEIGHTS: '1', OPENHIGGSFIELD_DISK_FREE_GB: '1' })]);
  await send('PUT', `${A}/api/me/routing`, { global: { mode: 'auto', allowFallback: true, useLocal: true, mockKeys: true } });
  await send('PUT', `${C}/api/me/routing`, { global: { mode: 'auto', allowFallback: true, useLocal: true } });

  // ---- /api/hardware ----
  { const h = await get(`${A}/api/hardware`); assert.equal(h.source, 'mock'); assert.equal(h.tier, 'most'); assert.equal(h.effectiveVramGB, 15.99); assert.ok(h.hwKey); assert.equal(h.tierThresholdsGB.all, 24); assert.equal(h.rates.download.source, 'estimate');
    const c = await get(`${C}/api/hardware?refresh=1`); assert.equal(c.source, 'comfyui-system_stats'); assert.equal(c.tier, 'most'); assert.equal(c.comfy.ggufNode, true); assert.equal(c.comfy.version, '0.41.3'); assert.ok(stubHits >= 1);
    const n = stubHits; await get(`${C}/api/hardware`); await get(`${C}/api/hardware`); assert.equal(stubHits, n, 'cached'); const r = await send('POST', `${C}/api/hardware/refresh`); assert.equal(r.status, 200); assert.ok(r.j.refreshAfterSec >= 0);
    // DP 5 manual override: saved; on a computer whose hardware was read it is kept but not used
    assert.equal((await send('PUT', `${A}/api/hardware`, { vramGB: 'x' })).status, 400);
    const m = await send('PUT', `${A}/api/hardware`, { vramGB: 12, ramGB: 32 }); assert.equal(m.status, 200); assert.equal(m.j.saved.vramGB, 12); assert.equal(m.j.manualInUse, false); assert.equal(m.j.tier, 'most');
    const d = await send('DELETE', `${A}/api/hardware/override`); assert.equal(d.j.cleared, true); assert.equal(d.j.manual, null);
    const sh = await get(`${C}/api/health/self-host`); assert.equal(sh.hardware.tier, 'most'); assert.equal(sh.gpu[0].memoryMB, 16376); }
  ok('/api/hardware: mock + system_stats probe (tier, ggufNode, version), cached, refresh; DP 5 PUT/DELETE manual; self-host uses the same probe');

  // ---- 6. Auto skips too_heavy; slow after fits ----
  const tools = await get(`${A}/api/tools`) as any[]; const T = Object.fromEntries(tools.map((t) => [t.id, t]));
  let heavy = 0;
  for (const t of tools) for (const p of t.providers ?? []) { if (!p.fit) continue; assert.ok(['fits', 'slow', 'too_heavy', 'unknown'].includes(p.fit.verdict), `${t.id}/${p.id} verdict`); if (p.fit.verdict === 'too_heavy') heavy++; }
  assert.ok(heavy > 0, 'some local routes are too heavy for a 16 GB card');
  { const f2 = T['create-image'].providers.find((p: any) => p.id === 'comfy-flux2dev'); assert.equal(f2.fit.verdict, 'too_heavy'); assert.equal(f2.reasonCode, 'too_heavy', JSON.stringify(f2));
    const rr = await get(`${A}/api/routes?toolId=create-image&modelId=comfy-flux2dev&types=generate`); const loc = rr.routes[0].routes.find((r: any) => r.kind === 'local');
    assert.equal(loc.available, false); assert.equal(loc.runsWhenPinned, true); assert.match(loc.status, /Too heavy for your computer/); assert.match(loc.pinWarning, /too heavy for your computer/); assert.ok(rr.routes[0].requirements?.recommendedVramGB > 16); assert.equal(rr.routes[0].fit.verdict, 'too_heavy');
    const q = await get(`${A}/api/tools/create-image/price?provider=comfy-qwen-image&types=generate`); // slow local + cloud: local still first (Use local on), labelled slow
    const rq = await get(`${A}/api/routes?toolId=create-image&modelId=comfy-qwen-image&types=generate`); const lq = rq.routes[0].routes.find((r: any) => r.kind === 'local'); assert.equal(lq.fit.verdict, 'slow'); assert.match(lq.status, /slow/); assert.equal(lq.fitNote, 'Free on your computer, but slow');
    const rk = await get(`${A}/api/routes?toolId=create-image&modelId=comfy-zimage&types=generate`); const lk = rk.routes[0].routes.find((r: any) => r.kind === 'local'); assert.equal(lk.fit.verdict, 'fits');
    // Run on order (TRANSPARENCY-PLAN 4k 5b-1, replaces Q3 "local first"): a connected API (here fal, placeholder key + mock keys) is pre-selected before Local
    assert.notEqual(q.runOn, 'local', `a ready API comes before Local: ${q.route}`); assert.equal(q.runOn, 'fal', q.route);
    const ql = await get(`${A}/api/tools/create-image/price?provider=comfy-qwen-image&types=generate&route=local:comfy-qwen-image`); // Local picked: runs, labelled slow
    assert.equal(ql.route, 'local:comfy-qwen-image', JSON.stringify(ql).slice(0, 300)); assert.match(ql.priceLine, /slow/);
    const qz = await get(`${A}/api/tools/create-image/price?provider=comfy-zimage&types=generate`); assert.equal(qz.route, 'local:comfy-zimage'); assert.equal(qz.localFreeOption, true);
    const qh = await get(`${A}/api/tools/create-image/price?provider=comfy-flux2dev&types=generate`); assert.equal(qh.runnable, false, 'too_heavy never auto-picked'); assert.equal(qh.reasonCode, 'too_heavy'); assert.equal(qh.chargeable, false); }
  ok('6 Auto: too_heavy local routes are unavailable (status, runsWhenPinned, pinWarning) and never auto-picked; slow sorts after fits');

  // ---- 7. pinned too_heavy runs with a loud warning (Q2); Auto on a local-only too-heavy model → 409 too_heavy, nothing charged ----
  { const bal0 = (await get(`${A}/api/ledger`)).balance;
    const p = await job(A, 'create-image', { prompt: 'a cat', types: 'generate', provider: 'comfy-flux2dev', route: 'local:comfy-flux2dev' }); assert.equal(p.status, 200, JSON.stringify(p.j));
    assert.equal(p.j.fit.verdict, 'too_heavy'); assert.match(p.j.fitWarning, /may be too heavy for your computer\. It can fail or run very slowly\./); assert.ok(p.j.warnings.some((w: string) => /too heavy/.test(w))); assert.equal(p.j.cost, 0);
    for (let i = 0; i < 60 && !['done', 'failed'].includes((await get(`${A}/api/jobs/${p.j.id}`)).status); i++) await sleep(250);
    const pj = await get(`${A}/api/jobs/${p.j.id}`); assert.equal(pj.status, 'done'); assert.equal(pj.fit.warning, p.j.fitWarning);
    const a = await job(A, 'create-image', { prompt: 'a cat', types: 'generate', provider: 'comfy-flux2dev' }); assert.equal(a.status, 409); assert.equal(a.j.code, 'too_heavy'); assert.match(a.j.error, /^FLUX\.2 \[dev\] is too heavy.*Nothing was charged\.$/); assert.equal(a.j.refund.charged, false);
    assert.equal((await get(`${A}/api/ledger`)).balance, bal0, 'credits unchanged'); }
  ok('7 pin on a too_heavy route runs with fit.warning on the job (Q2); Auto on the local-only too-heavy model → 409 too_heavy; credits unchanged');

  // ---- 8. quotes ----
  { const h = await get(`${A}/api/tools/create-image/price?provider=comfy-flux2dev&route=local:comfy-flux2dev&types=generate&prompt=x`); assert.equal(h.runnable, true); assert.equal(h.fit.verdict, 'too_heavy'); assert.match(h.fitWarning, /too heavy/); assert.equal(h.localFreeOption, false); assert.ok('alternative' in h.fit);
    const z = await get(`${A}/api/tools/create-image/price?provider=comfy-zimage&route=local:comfy-zimage&types=generate&prompt=x`); assert.equal(z.fit.verdict, 'fits'); assert.equal(z.priceLine, 'Free · on your computer'); assert.equal(z.localFreeOption, true); assert.equal(z.fit.alternativeReason, 'weights_missing', 'HW2: files known missing → a cloud alternative'); assert.ok(z.fit.alternative?.providerId);
    assert.ok(z.requirements.downloadBytes > 0); assert.equal(z.requirements.missingBytes, z.requirements.downloadBytes, 'empty models folder'); assert.equal(z.fit.eta.source, 'estimate');
    const s = await get(`${A}/api/tools/create-image/price?provider=comfy-qwen-image&route=local:comfy-qwen-image&types=generate&prompt=x`); assert.equal(s.fit.verdict, 'slow'); assert.match(s.priceLine, /slow/); assert.equal(s.localFreeOption, false);
    if (s.fit.alternative) { assert.ok(s.fit.alternative.providerId && s.fit.alternative.credits > 0 && s.fit.alternative.priceLine); } }
  ok('8 quotes: pinned too_heavy → runnable + fitWarning; fits → "Free · runs locally on your ComfyUI" + localFreeOption; slow → priceLine says slow, alternative');

  // ---- 9. first-run stages: downloading_model (shared downloader, tiny placeholder files) → loading_model ----
  { const r = await job(A, 'create-image', { prompt: 'a cat', types: 'generate', provider: 'comfy-zimage', route: 'local:comfy-zimage', downloadWeights: '1' }); assert.equal(r.status, 200, JSON.stringify(r.j));
    const seq: string[] = []; const done: number[] = []; const etas: number[] = []; let slowSeen = false;
    for (let i = 0; i < 120; i++) { const j = await get(`${A}/api/jobs/${r.j.id}`); if (j.stage && seq[seq.length - 1] !== j.stage) seq.push(j.stage); if (j.stageDetail?.stage === 'downloading_model') { done.push(j.stageDetail.bytesDone); etas.push(j.stageDetail.etaSeconds); assert.ok(j.stageDetail.bytesTotal > 0); assert.ok(j.stageDetail.downloadId); }
      if (j.slow) slowSeen = true; if (['done', 'failed'].includes(j.status)) break; await sleep(100); }
    const fin = await get(`${A}/api/jobs/${r.j.id}`); assert.equal(fin.status, 'done', fin.error); const di = seq.indexOf('downloading_model'), li = seq.indexOf('loading_model'); assert.ok(di >= 0 && li > di, seq.join(' > '));
    assert.ok(done.length >= 2 && done.every((v, i) => i === 0 || v >= done[i - 1]), `bytesDone rises: ${done.join(',')}`); assert.ok(etas[etas.length - 1] <= etas[0], 'etaSeconds falls'); assert.equal(slowSeen, false);
    assert.ok(fin.stageTimes.downloading_model.end && fin.stageTimes.loading_model.end); assert.ok(fin.etaBreakdown);
    const files = fs.readdirSync(MA, { recursive: true }).map((x) => path.join(MA, String(x))).filter((x) => fs.statSync(x).isFile()); assert.ok(files.length >= 2); assert.ok(files.every((x) => fs.statSync(x).size <= 1024), 'placeholders only');
    const q = await get(`${A}/api/tools/create-image/price?provider=comfy-zimage&route=local:comfy-zimage&types=generate&prompt=x`); // every file is now on disk; the mock writes tiny placeholders, and a file smaller than its known size counts as still downloading
    // (requirements.ts, 2026-10-24), so each one is listed as partial with its placeholder bytes, none as absent
    const mf = q.requirements.missingFiles as any[]; assert.ok(mf.length >= 2, 'files listed'); assert.ok(mf.every((f) => f.partial === true && f.haveBytes > 0 && f.haveBytes <= 1024), 'files now present (placeholders = partial)');
    assert.deepEqual(mf.map((f) => f.file).sort(), files.map((x) => path.basename(x)).sort(), 'the partial files are exactly the downloaded placeholders'); }
  ok('9 first run: downloading_model (bytesDone up, etaSeconds down, slow false) → loading_model → done; models folder holds only tiny placeholders');

  // ---- Q4 downloads API ----
  { assert.equal((await send('POST', `${A}/api/local/downloads`, {})).status, 400);
    assert.equal((await send('POST', `${A}/api/local/downloads`, { providerId: 'nope' })).status, 404);
    const dry = await send('POST', `${A}/api/local/downloads`, { providerId: 'comfy-flux3-klein', dryRun: true }); assert.equal(dry.status, 200); assert.ok(dry.j.missingBytes > 1e9); assert.ok(dry.j.files.every((f: any) => f.url && f.bytesTotal));
    const s = await send('POST', `${A}/api/local/downloads`, { providerId: 'comfy-flux3-klein' }); assert.equal(s.status, 202); const id = s.j.id; assert.ok(id);
    const again = await send('POST', `${A}/api/local/downloads`, { providerId: 'comfy-flux3-klein' }); assert.equal(again.j.id, id, 'one per model at a time');
    await sleep(300); const mid = await get(`${A}/api/local/downloads/${id}`); for (const k of ['bytesTotal', 'bytesDone', 'etaSeconds', 'files']) assert.ok(k in mid, k);
    const del = await send('DELETE', `${A}/api/local/downloads/${id}`); assert.equal(del.j.cancelRequested, true); await sleep(400); assert.equal((await get(`${A}/api/local/downloads/${id}`)).status, 'canceled');
    assert.equal((await send('GET', `${A}/api/local/downloads/nope`)).status, 404); assert.ok((await get(`${A}/api/local/downloads`)).downloads.length >= 2);
    const nd = await send('POST', `${C}/api/local/downloads`, { providerId: 'comfy-qwen-image' }); assert.equal(nd.status, 409); assert.equal(nd.j.code, 'not_enough_disk'); assert.ok(nd.j.missingBytes > nd.j.diskFreeBytes); }
  ok('Q4 /api/local/downloads: dryRun, 202 + id, de-dup, progress fields, cancel, 404, 400, 409 not_enough_disk');

  // ---- weights gate (ENFORCE_WEIGHTS on :8912) + GGUF variant (Q7) ----
  { const q = await get(`${C}/api/tools/create-image/price?provider=comfy-qwen-image&route=local:comfy-qwen-image&types=generate&prompt=x`); assert.equal(q.runnable, false); assert.equal(q.reasonCode, 'not_enough_disk'); assert.ok(q.missingFiles.length);
    const up = await get(`${C}/api/tools/image-upscale/price?provider=comfy-realesrgan&route=local:comfy-realesrgan`); assert.equal(up.runnable, false, JSON.stringify(up).slice(0, 300)); assert.equal(up.reasonCode, 'weights_missing'); assert.equal(up.downloadEndpoint, '/api/local/downloads');
    const sub = await job(C, 'create-image', { prompt: 'x', types: 'generate', provider: 'comfy-qwen-image', route: 'local:comfy-qwen-image' }); assert.equal(sub.status, 409); assert.equal(sub.j.code, 'not_enough_disk'); assert.equal(sub.j.charged, false);
    const v = q.requirements.variants.find((x: any) => x.id === 'qwen-image-q4km'); assert.equal(v.runnable, true, 'ComfyUI reports UnetLoaderGGUF'); assert.ok(v.bytes > 0);
    const qv = await get(`${C}/api/tools/create-image/price?provider=comfy-qwen-image&route=local:comfy-qwen-image&types=generate&prompt=x&variantId=qwen-image-q4km`); assert.equal(qv.requirements.variantId, 'qwen-image-q4km'); assert.ok(qv.requirements.recommendedVramGB <= q.requirements.recommendedVramGB);
    const a = await get(`${A}/api/tools/create-image/price?provider=comfy-qwen-image&route=local:comfy-qwen-image&types=generate&prompt=x`); assert.equal(a.requirements.variants.find((x: any) => x.id === 'qwen-image-q4km').runnable, false, `no GGUF node on :${testPort(8911)}`); }
  ok('weights gate: not_enough_disk / weights_missing on quote + 409 on submit (nothing charged); Q7 GGUF variant selectable only where UnetLoaderGGUF exists');

  // ---- DP 6: ComfyUI address ----
  { const g = await get(`${A}/api/local/comfy`); assert.equal(g.canChange, true); assert.equal(g.url, null);
    assert.equal((await send('PUT', `${A}/api/local/comfy`, { url: 'http://u:p@127.0.0.1:1' })).status, 400); assert.equal((await send('PUT', `${A}/api/local/comfy`, { url: 'http://127.0.0.1:1/?key=abc' })).status, 400);
    const p = await send('PUT', `${A}/api/local/comfy`, { url: STUB }); assert.equal(p.status, 200); assert.equal(p.j.url, STUB); assert.equal(p.j.source, 'settings');
    const t = await send('POST', `${A}/api/local/comfy/test`, {}); assert.equal(t.j.reachable, true); assert.equal(t.j.version, '0.41.3'); assert.equal(t.j.ggufNode, true); assert.equal(t.j.gpu.type, 'cuda'); assert.ok(t.j.latencyMs >= 0);
    const t2 = await send('POST', `${A}/api/local/comfy/test`, { url: 'http://127.0.0.1:1' }); assert.equal(t2.j.reachable, false);
    const cl = await send('PUT', `${A}/api/local/comfy`, { url: null }); assert.equal(cl.j.cleared, true); assert.equal(cl.j.url, null);
    assert.equal((await send('PUT', `${C}/api/local/comfy`, { url: STUB })).status, 403, 'not loopback-bound → 403 (like saving keys)'); assert.equal((await send('POST', `${C}/api/local/comfy/test`, { url: STUB })).status, 403);
    assert.equal((await send('POST', `${C}/api/local/comfy/test`, {})).j.reachable, true, 'testing the current address is allowed'); assert.equal((await get(`${C}/api/local/comfy`)).canChange, false); }
  ok('DP 6 /api/local/comfy: GET/PUT (validated, persisted, loopback only) + POST /test {reachable, version, gpu, ggufNode, latencyMs}');

  // ---- DP 7 learned timings ----
  { const l = await get(`${A}/api/eta/learned`); assert.equal(l.learning, false, 'mock runs do not learn'); assert.equal(typeof l.samples, 'number'); const d = await send('DELETE', `${A}/api/eta/learned`); assert.equal(d.j.ok, true); }
  ok('DP 7 /api/eta/learned GET + DELETE');
} finally { for (const p of procs) try { process.kill(-p.pid!); } catch { /* gone */ } stub.close(); }
console.log('hardware.e2e: all passed'); process.exit(0);
