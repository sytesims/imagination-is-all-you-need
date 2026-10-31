// HW-SHAPES (Oct 19 2026) unit checks, in-process, temp data dir, nothing installed, no GPU, no network beyond an in-test http server on 127.0.0.1:
// 1 probe parsing (stubbed /system_stats: cuda 24 GB / mps / cpu-only; Comfy Cloud → no request; no nvidia-smi → gpu null) · 2 tier boundaries ·
// 3 cache (two reads = one probe, refresh rate limit) · 4 requirements parity with readiness/manifest/models.json · 5 fit matrix over the HW_MOCK
// profiles · 10 learned ETA (n<3 estimate, n=3 learned, outlier dropped, hwKey isolation) · Q4 downloader (mock fetch, tiny payloads,
// not_enough_disk, cancel) · Q7 GGUF variants runnable only with UnetLoaderGGUF · DP 5 manual override · DP 6 address validation · Q5 reachability.
// Run: npx tsx test/hardware.test.ts
import './fixtures/tmp-cleanup.mjs'; // temp dir removed on exit
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'hwu-')); const MODELS = path.join(D, 'models'); fs.mkdirSync(MODELS);
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_COMFY_MODELS_DIR: MODELS, OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_DOWNLOAD_MOCK_MS: '300', OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
delete process.env.OPENHIGGSFIELD_HW_MOCK; delete process.env.COMFY_BASE_URL;
const HW = await import('../src/hardware.js'); const R = await import('../src/hardware/requirements.js'); const L = await import('../src/etaLearn.js');
const DL = await import('../src/hardware/downloads.js'); const { config } = await import('../src/config.js'); const { getTool } = await import('../src/tools/registry.js');
const ok = (m: string) => console.log('ok ' + m);
const GiB = 2 ** 30;

// ---- 1. probe parsing (fixtures in the ComfyUI server.py /system_stats shape) ----
const FX: Record<string, any> = {
  cuda24: { system: { os: 'posix', ram_total: 64 * GiB, ram_free: 40 * GiB, comfyui_version: '0.41.3', python_version: '3.12', pytorch_version: '2.7', embedded_python: false, argv: [] }, devices: [{ name: 'cuda:0 NVIDIA GeForce RTX 4090 : cudaMallocAsync', type: 'cuda', index: 0, vram_total: 25757220864, vram_free: 24000000000, torch_vram_total: 0, torch_vram_free: 0 }] },
  mps: { system: { os: 'darwin', ram_total: 36 * GiB, ram_free: 20 * GiB, comfyui_version: '0.41.0' }, devices: [{ name: 'mps', type: 'mps', index: null, vram_total: 36 * GiB, vram_free: 20 * GiB }] },
  cpu: { system: { os: 'posix', ram_total: 32 * GiB, ram_free: 16 * GiB, comfyui_version: '0.41.0' }, devices: [{ name: 'cpu', type: 'cpu', index: null, vram_total: 32 * GiB, vram_free: 16 * GiB }] },
};
{ const a = HW.parseSystemStats(FX.cuda24); assert.equal(a.gpu?.type, 'cuda'); assert.equal(a.gpu?.vramTotalBytes, 25757220864); assert.equal(a.version, '0.41.3'); assert.equal(a.ramTotal, 64 * GiB);
  assert.equal(HW.tierOf(HW.effectiveVram(a.gpu, a.ramTotal)), 'all', '24 GB card (23.99 GiB) counts as all');
  const m = HW.parseSystemStats(FX.mps); assert.equal(m.gpu?.type, 'mps'); assert.equal(HW.effectiveVram(m.gpu, m.ramTotal), 27, 'MPS: 0.75 × RAM'); assert.equal(HW.tierOf(27), 'all');
  const c = HW.parseSystemStats(FX.cpu); assert.equal(c.gpu?.type ?? 'cpu', 'cpu', 'cpu-only → no graphics card'); assert.equal(HW.tierOf(HW.effectiveVram(c.gpu, c.ramTotal)), 'none'); }
// in-test ComfyUI stub
let served = 'cuda24'; let statsHits = 0; let gguf = false;
const srv = http.createServer((req, res) => { if (req.url === '/system_stats') { statsHits++; res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(FX[served])); }
  if (req.url === '/object_info/UnetLoaderGGUF') { res.setHeader('content-type', 'application/json'); return res.end(gguf ? JSON.stringify({ UnetLoaderGGUF: { input: { required: { unet_name: [[]] } } } }) : '{}'); }
  res.statusCode = 404; res.end(); });
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r())); const STUB = `http://127.0.0.1:${(srv.address() as any).port}`;
HW.setHostProbe(() => { throw new Error('host probe must not run while ComfyUI answers'); });
config.comfyBaseUrl = STUB;
{ const h = await HW.getHardware({ refresh: true }); assert.equal(h.source, 'comfyui-system_stats'); assert.equal(h.tier, 'all'); assert.equal(h.comfy.version, '0.41.3'); assert.equal(h.comfy.ggufNode, false); assert.equal(h.gpu?.name.includes('4090'), true); assert.equal(h.ram.totalGB, 64); }
// Comfy Cloud: never probed
{ let calls = 0; HW.setComfyFetch((async (...a: Parameters<typeof fetch>) => { calls++; return fetch(...a); }) as any);
  const c = await HW.checkComfy('https://cloud.comfy.org'); assert.equal(c.cloud, true); assert.equal(c.reachable, false); assert.equal(calls, 0, 'no request to Comfy Cloud'); HW.setComfyFetch(null); }
// no nvidia-smi (this box) → host probe has no GPU
{ const h = HW.probeHost((() => { throw Object.assign(new Error('spawn nvidia-smi ENOENT'), { code: 'ENOENT' }); }) as any); assert.equal(h.gpu, null); assert.ok(h.ramTotal > 0); }
ok('1 probe: cuda 24 GB → all, mps → 0.75 × RAM, cpu-only → none, Comfy Cloud gets no request, no nvidia-smi → gpu null');

// ---- 2. tier boundaries ----
assert.deepEqual([3.9, 4, 7.9, 8, 23.9, 24].map((g) => HW.tierOf(g)), ['none', 'light', 'light', 'most', 'most', 'all']);
assert.equal(HW.tierOf(23.99), 'all', '0.05 GB tolerance'); assert.equal(HW.tierOf(0, false), 'unknown');
ok('2 tiers: 3.9/4/7.9/8/23.9/24 → none/light/light/most/most/all; unseen → unknown');

// ---- 3. cache ----
{ statsHits = 0; const a = await HW.getHardware(); const b = await HW.getHardware(); assert.equal(statsHits, 1, 'two reads = one probe'); assert.equal(a.cached, false); assert.equal(b.cached, true);
  await HW.getHardware({ refresh: true }); assert.equal(statsHits, 1, 'refresh inside 5 s is rate-limited');
  await new Promise((r) => setTimeout(r, HW.REFRESH_MIN_SEC * 1000 + 100)); served = 'mps'; const c = await HW.getHardware({ refresh: true }); assert.equal(statsHits, 2, 'refresh after 5 s re-probes once'); assert.equal(c.gpu?.type, 'mps'); assert.equal(c.cached, false);
  served = 'cuda24'; }
ok('3 cache: two GETs = one probe, refresh limited to one per 5 s, then re-probes');

// ---- 4. requirements parity ----
{ const m = R.manifest(); let n = 0; const diffs: string[] = [];
  for (const [k, w] of Object.entries<any>(m.workflows)) { const v = R.wfVram(k); if (!v || w.vram_est_gb == null) continue; const files = m.models.filter((x) => x.workflows.includes(k)); if (files.some((f) => f.size == null)) continue; n++; if (Math.abs(v.recommendedVramGB - w.vram_est_gb) > 0.11) diffs.push(`${k} ${v.recommendedVramGB} vs ${w.vram_est_gb}`); }
  assert.ok(n >= 60, `parity rows ${n}`); assert.deepEqual(diffs, [], 'TS formula = manifest vram_est_gb where sizes are complete');
  const kl = Object.keys(m.workflows).find((k) => /flux3.?klein/i.test(k) && R.wfVram(k)); assert.ok(kl); const kv = R.wfVram(kl!)!.recommendedVramGB; assert.ok(kv > 11 && kv < 12.5, `flux3klein ≈ 11.6 (got ${kv}: the 9.75 GB int8_convrot upsampler is the largest file; manifest 1.5 had missing sizes)`);
  const req = R.requirementsFor(getTool('create-image')!, 'comfy-flux3-klein', {})!; const M = await import('../src/modelWeights.js');
  assert.equal(req.downloadBytes, M.weightsForWorkflows(req.workflows).reduce((a, f) => a + (f.sizeBytes ?? 0), 0), 'downloadBytes = Σ weights sizeBytes'); assert.equal(req.missingBytes, req.downloadBytes, 'empty models folder: everything missing');
  console.log(`  parity rows ${n}, flux3klein ${kv} GB`); }
ok('4 requirements: formula = manifest on every complete row, flux3klein ≈ 11.6, downloadBytes = Σ weights');

// ---- 5. fit matrix ----
const CASES: [string, string, any][] = [['image-upscale', 'comfy-realesrgan', {}], ['create-image', 'comfy-zimage', { types: ['generate'] }], ['camera', 'comfy-open', {}], ['h3-video', 'comfy-h3', { types: ['t2v'] }], ['reshoot', 'comfy-funcamera', {}], ['audio', 'comfy-drama3', {}]];
const EXPECT: Record<string, string[]> = {
  unknown: ['unknown/hardware_unknown', 'unknown/hardware_unknown', 'unknown/hardware_unknown', 'unknown/hardware_unknown', 'unknown/hardware_unknown', 'unknown/hardware_unknown'],
  none: ['slow/cpu', 'too_heavy/no_gpu', 'too_heavy/no_gpu', 'too_heavy/no_gpu', 'too_heavy/no_gpu', 'too_heavy/no_gpu'],
  cpu: ['slow/cpu', 'too_heavy/no_gpu', 'too_heavy/no_gpu', 'too_heavy/no_gpu', 'too_heavy/no_gpu', 'too_heavy/no_gpu'],
  light8: ['fits/fits', 'too_heavy/not_enough_ram', 'too_heavy/not_enough_vram', 'too_heavy/not_enough_vram', 'too_heavy/not_enough_vram', 'too_heavy/not_enough_vram'],
  mid16: ['fits/fits', 'fits/fits', 'slow/offload', 'slow/offload', 'slow/offload', 'too_heavy/not_enough_vram'],
  rtx4090: ['fits/fits', 'fits/fits', 'slow/offload', 'slow/offload', 'fits/fits', 'too_heavy/not_enough_vram'],
  mac36: [null as any, 'slow/mps', 'slow/mps' /* 2026-10-31: the Wan Fun Camera graphs have a Mac variant (GGUF + fp16 encoder, untested); LTX-2 ones don't */, 'too_heavy/unsupported_weights' /* nvfp4 text encoder (2026-10-25, hardware/macWeights.ts) */, 'slow/mps' /* Fun Camera Mac variant */, 'too_heavy/unsupported_weights'],
};
config.comfyBaseUrl = '';
for (const [prof, want] of Object.entries(EXPECT)) { HW.setHardwareOverride(prof); const hw = HW.currentHardware();
  const got = CASES.map(([t, p, i]) => { const f = R.fitFor(getTool(t)!, p, i, hw); return `${f.verdict}/${f.reasonCode === 'not_enough_disk' ? f.hardwareReasonCode : f.reasonCode}`; });
  want.forEach((w, i) => { if (w) assert.equal(got[i], w, `${prof} ${CASES[i][0]}/${CASES[i][1]}`); });
  if (prof === 'unknown') for (const [t, p, i] of CASES) assert.equal(R.fitFor(getTool(t)!, p, i, hw).enforced, false, 'unknown is never enforced'); }
HW.setHardwareOverride('mac36'); { const f = R.fitFor(getTool('h3-video')!, 'comfy-h3', { types: ['t2v'] }); assert.equal(f.reasonCode, 'unsupported_weights'); assert.match(f.reason, /NVIDIA graphics card/); }
{ const f = R.fitFor(getTool('reshoot')!, 'comfy-funcamera', {}); assert.equal(f.variant?.verified, false, 'Fun Camera on a Mac: its untested Mac variant'); assert.equal(f.verdict, 'slow'); }
HW.setHardwareOverride('mid16'); { const f = R.fitFor(getTool('object-swap')!, 'comfy-h3-charswap', {}); assert.notEqual(f.reasonCode, 'no_gpu_needed', 'charswap uses its own workflow'); }
{ const f = R.fitFor(getTool('create-image')!, 'comfy-moss-image', {}); assert.notEqual(f.reasonCode, 'requirements_unknown', 'MOSS-Image has manifest rows (2026-10-25)'); assert.ok(f.recommendedVramGB! > 0); }
ok('5 fit matrix: unknown/none/cpu/light8/mid16/rtx4090/mac36 × upscale/zimage/wan camera/h3-t2v/ltx reshoot/drama3 (mac36 + fp8 → unsupported_weights)');

// ---- DP 3: not enough disk ----
process.env.OPENHIGGSFIELD_DISK_FREE_GB = '5';
{ const f = R.fitFor(getTool('create-image')!, 'comfy-zimage', { types: ['generate'] }); assert.equal(f.verdict, 'fits'); assert.equal(f.reasonCode, 'not_enough_disk'); assert.equal(f.hardwareReasonCode, 'fits'); assert.ok(f.missingBytes! > 5e9); assert.equal(f.diskFreeBytes, 5e9); assert.equal(f.blockers[0].code, 'not_enough_disk'); }
ok('DP 3: missing weights > free disk → reasonCode not_enough_disk (+ missingBytes, diskFreeBytes), the verdict stays');

// ---- Q4: downloader. Never the network and never real-sized files: the http transport runs against a mock fetch with tiny payloads ----
await assert.rejects(async () => DL.startDownload({ providerId: 'comfy-zimage' }), (e: any) => e.code === 'not_enough_disk' && e.extra.diskFreeBytes === 5e9);
process.env.OPENHIGGSFIELD_DISK_FREE_GB = '500';
{ const PAY = Buffer.from('tiny fake weights\n'); const calls: { url: string; auth: string | null; range: string | null }[] = []; const orig = globalThis.fetch;
  globalThis.fetch = (async (u: any, init: any = {}) => { const h = new Headers(init.headers); calls.push({ url: String(u), auth: h.get('authorization'), range: h.get('range') });
    if (!/^https:\/\/(huggingface\.co|civitai\.com)\//.test(String(u))) throw new Error(`unexpected fetch ${u}`);
    await new Promise((r) => setTimeout(r, 150)); return new Response(PAY, { status: 200, headers: { 'content-length': String(PAY.length) } }); }) as any;
  try {
    DL.setDownloadTransport(DL.httpTransport);
    // the Q8 file (no checksum in the manifest: the tiny mock payload passes); the Q4 file is a Mac variant file with its sha256 now (2026-10-31)
    const d = DL.startDownload({ variantId: 'qwen-image-q8' }); assert.ok(['queued', 'downloading'].includes(d.status)); assert.equal(d.files.length, 1); assert.equal(d.bytesTotal, 21761817120, 'size shown = the real file size');
    const end = await DL.waitDownload(d.id); assert.equal(end!.status, 'done', String(end!.error)); assert.equal(end!.bytesDone, end!.bytesTotal);
    const f = path.join(MODELS, 'unet', 'qwen-image-Q8_0.gguf'); assert.equal(fs.statSync(f).size, PAY.length, 'only the tiny mock payload is written'); assert.ok(!fs.existsSync(`${f}.part`));
    assert.equal(calls.length, 1); assert.match(calls[0].url, /^https:\/\/huggingface\.co\/city96\/Qwen-Image-gguf\/resolve\/main\/qwen-image-Q8_0\.gguf$/); assert.equal(calls[0].auth, null, 'no token to Hugging Face');
    await assert.rejects(async () => DL.startDownload({ variantId: 'qwen-image-q8' }), (e: any) => e.code === 'nothing_to_download');
    // resume: a leftover .part is continued with Range
    const f2 = path.join(MODELS, 'unet', 'Wan2.2-Animate-14B-Q3_K_M.gguf'); fs.writeFileSync(`${f2}.part`, 'abc'); calls.length = 0;
    await DL.waitDownload(DL.startDownload({ variantId: 'wan-animate-q3km' }).id); assert.equal(calls[0].range, 'bytes=3-'); assert.equal(fs.statSync(f2).size, PAY.length, 'server ignored Range (200) → started over');
    // cancel
    const c = DL.startDownload({ variantId: 'wan-vace-q8' }); DL.cancelDownload(c.id); const ce = await DL.waitDownload(c.id); assert.equal(ce!.status, 'canceled'); assert.ok(!fs.existsSync(path.join(MODELS, 'unet', 'Wan2.1_14B_VACE-Q8_0.gguf')));
    // Civitai: Bearer CIVITAI_TOKEN only when set, only to civitai.com, never in the view or the error
    process.env.CIVITAI_TOKEN = 'test-not-a-token'; calls.length = 0; const target = path.join(MODELS, 'loras', 'civ-test.safetensors');
    await DL.httpTransport.fetch({ file: 'civ-test.safetensors', folder: 'loras', url: 'https://civitai.com/api/download/models/1', bytesTotal: PAY.length, bytesDone: 0, sha256: null, status: 'queued' }, target, () => undefined, new AbortController().signal);
    assert.equal(calls[0].auth, 'Bearer test-not-a-token'); delete process.env.CIVITAI_TOKEN; calls.length = 0;
    await DL.httpTransport.fetch({ file: 'civ-test2.safetensors', folder: 'loras', url: 'https://civitai.com/api/download/models/2', bytesTotal: PAY.length, bytesDone: 0, sha256: null, status: 'queued' }, target + '2', () => undefined, new AbortController().signal);
    assert.equal(calls[0].auth, null, 'no token set → no header');
    assert.ok(!JSON.stringify(DL.listDownloads().map(DL.downloadView)).includes('test-not-a-token')); assert.ok(!('sha256' in DL.downloadView(end!).files[0]));
    // the mock transport writes only a tiny placeholder
    DL.setDownloadTransport(null); const m = await DL.waitDownload(DL.startDownload({ variantId: 'wan-vace-q4km' }).id); assert.equal(m!.status, 'done'); assert.ok(fs.statSync(path.join(MODELS, 'unet', 'Wan2.1_14B_VACE-Q4_K_M.gguf')).size <= DL.MOCK_PAYLOAD_MAX);
    // no explicit models folder (or one that doesn't exist) → refused
    const keep = process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR; process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR = path.join(D, 'nope'); await assert.rejects(async () => DL.startDownload({ variantId: 'qwen-image-q8' }), (e: any) => e.code === 'no_models_dir');
    delete process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR; await assert.rejects(async () => DL.startDownload({ variantId: 'qwen-image-q8' }), (e: any) => e.code === 'no_models_dir'); process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR = keep;
  } finally { globalThis.fetch = orig; DL.setDownloadTransport(null); }
  const total = fs.readdirSync(MODELS, { recursive: true }).map((x) => path.join(MODELS, String(x))).filter((x) => fs.statSync(x).isFile()).reduce((a, x) => a + fs.statSync(x).size, 0); assert.ok(total < 8192, `models folder holds ${total} bytes`); }
ok('Q4 downloader: mock fetch + tiny payloads (size shown from the manifest), resume via Range, cancel, Civitai Bearer only when CIVITAI_TOKEN is set, no_models_dir, not_enough_disk');

// ---- Q7: GGUF variant runnable only when ComfyUI reports UnetLoaderGGUF ----
{ HW.setHardwareOverride('mid16'); const t = getTool('create-image')!; let req = R.requirementsFor(t, 'comfy-qwen-image', {})!; const q4 = req.variants.find((v) => v.id === 'qwen-image-q4km')!;
  assert.equal(q4.runnable, false, 'no GGUF node → info only'); assert.equal(R.requirementsFor(t, 'comfy-qwen-image', { variantId: 'qwen-image-q4km' })!.variantId, null);
  HW.setHardwareOverride({ ...HW.currentHardware(), comfy: { reachable: true, version: '0.41.3', cloud: false, ggufNode: true } } as any);
  req = R.requirementsFor(t, 'comfy-qwen-image', { variantId: 'qwen-image-q4km' })!; assert.equal(req.variants.find((v) => v.id === 'qwen-image-q4km')!.runnable, true); assert.equal(req.variantId, 'qwen-image-q4km');
  assert.ok(req.recommendedVramGB! <= 16.5, 'variant lowers the recommended VRAM'); assert.equal(req.variants.find((v) => v.id.startsWith('zimage'))?.runnable ?? false, false);
  const ltx = R.findVariant('ltx2-dev-q4km-unsloth')!; assert.equal(R.variantRunnable(ltx, HW.currentHardware()), false, 'LTX GGUF is not a drop-in');
  // the probe reads /object_info/UnetLoaderGGUF
  gguf = true; const c = await HW.checkComfy(STUB); assert.equal(c.ggufNode, true); gguf = false; assert.equal((await HW.checkComfy(STUB)).ggufNode, false); }
ok('Q7: GGUF drop-ins are selectable only with UnetLoaderGGUF (from /object_info); LTX GGUF and core variants stay info only');

// ---- DP 5: manual override (only while the probe sees nothing) ----
{ HW.setHardwareOverride('unknown'); HW.setManual({ vramGB: 12, ramGB: 32 }); let h = HW.currentHardware(); assert.equal(h.source, 'manual'); assert.equal(h.manualInUse, true); assert.equal(h.tier, 'most'); assert.equal(h.effectiveVramGB, 12);
  HW.setHardwareOverride('rtx4090'); h = HW.currentHardware(); assert.equal(h.source, 'mock'); assert.equal(h.manualInUse, false); assert.equal(h.manual?.vramGB, 12);
  HW.setManual(null); HW.setHardwareOverride('unknown'); assert.equal(HW.currentHardware().manual, null); assert.equal(HW.currentHardware().tier, 'unknown'); }
ok('DP 5: manual values apply only when the hardware is unknown; cleared → unknown again');

// ---- DP 6 / Q5 ----
assert.equal(HW.comfyUrlError('http://127.0.0.1:8188'), null); assert.ok(HW.comfyUrlError('ftp://x')); assert.ok(HW.comfyUrlError('http://u:p@host:8188')); assert.ok(HW.comfyUrlError('http://h:8188/?token=abc')); assert.ok(HW.comfyUrlError(''));
assert.equal(HW.safeUrl('http://u:p@h:8188/x?k=1#a'), 'http://h:8188/x');
{ HW.setComfyReachableOverride(false); assert.equal(HW.localReachable(), false); HW.setComfyReachableOverride(null); assert.equal(HW.localReachable(), true, 'mock backend: reachable');
  const prev = config.backend; (config as any).backend = 'comfy'; config.comfyBaseUrl = 'http://127.0.0.1:1'; assert.equal(HW.localReachable(), true, 'optimistic before the first answer'); assert.equal(await HW.refreshReachability(), false); assert.equal(HW.localReachable(), false, 'cached: not reachable');
  config.comfyBaseUrl = STUB; assert.equal(await HW.refreshReachability(), true); assert.equal(HW.localReachable(), true); (config as any).backend = prev; config.comfyBaseUrl = ''; }
ok('DP 6 address validation (http(s), no user:password, no query) + Q5 reachability (cached, mockable, optimistic first)');

// ---- 10. learned ETA ----
{ const key = 'create-image|local:comfy-zimage|1k|-'; const hk = 'cuda|Test GPU|16';
  L.addSample({ key, hwKey: hk, renderSec: 20, downloadSec: 0, loadSec: 0, bytesDownloaded: 0, bytesLoaded: 0, units: 1 }); L.addSample({ key, hwKey: hk, renderSec: 22, downloadSec: 0, loadSec: 0, bytesDownloaded: 0, bytesLoaded: 0, units: 1 });
  let e = L.blend(40, key, hk, 1); assert.equal(e.source, 'estimate'); assert.equal(e.seconds, 40); assert.equal(e.samples, 2);
  L.addSample({ key, hwKey: hk, renderSec: 24, downloadSec: 0, loadSec: 0, bytesDownloaded: 0, bytesLoaded: 0, units: 1 }); e = L.blend(40, key, hk, 1); assert.equal(e.source, 'learned'); assert.equal(e.learnedSeconds, 22); assert.ok(e.seconds! < 40 && e.seconds! > 22, `blended ${e.seconds}`);
  L.addSample({ key, hwKey: hk, renderSec: 500, downloadSec: 0, loadSec: 0, bytesDownloaded: 0, bytesLoaded: 0, units: 1 }); assert.equal(L.learned(key, hk).n, 3, 'outlier (> 3 × median) dropped');
  assert.equal(L.blend(null, key, hk, 1).seconds, 22, 'null estimate (light tier) → learned at n = 3'); assert.equal(L.blend(30, key, 'cuda|Other|8', 1).source, 'estimate', 'other hwKey isolated');
  for (let i = 0; i < 25; i++) L.addSample({ key, hwKey: hk, renderSec: 20, downloadSec: 0, loadSec: 0, bytesDownloaded: 0, bytesLoaded: 0, units: 1 }); assert.ok(L.learnedSummary().groups.find((g) => g.key === key)!.samples <= L.KEEP, 'keeps the last 20');
  const r = L.resetLearned(); assert.ok(r.cleared > 0); assert.equal(L.learned(key, hk).n, 0); }
ok('10 learned ETA: 2 samples → estimate, 3 → learned (blended), outlier dropped, null estimate → learned, hwKey isolated, keep 20, reset');

srv.close(); HW.setHardwareOverride(null); HW.setHostProbe(null);
console.log('hardware.test: all passed'); process.exit(0); // tmp-cleanup removes the temp dir on exit
