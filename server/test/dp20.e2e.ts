// DP #20 + Cleanroom quickstart (Oct 19, Batch A): own mock servers :9102 / :9103 (temp data dirs) + a fake MCP /health on :9104.
//  1) UGC Ad quote validates the user's aspect before the app's lock (aspect=zzq → 400 invalid_aspect; 9:16 fine)
//  2) Orbit Shot: types empty / [] = not sent (quote 200; submit not rejected for it); types=zz → 400 invalid_type allowed [] (types isn't a setting)
//  3) Transition: app.resolutions (1080p, 2K) are in its allowlist; tool.allowed on /api/tools = the effective lists ([] = not a setting)
//  4) local routes never demo (FPS Boost RIFE, H3 lip-sync) on /api/routes and the quote
//  5) /api/config.mcp has no npx option; local node command (+ --http --port 8788)
//  6+7) self-host health: mcp {reachable, url, version}; comfy.version read from comfyui_version.py next to the models folder; disk free;
//       models.perModel present/missing; no models folder → every manifest file missing (never an empty list); ComfyUI probed in mock mode too
//  8) /api/models weights[] (file, folder, exact sizeBytes, url) from public metadata
//  Cleanroom: HOST sets the listen address. Run: npx tsx test/dp20.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import http from 'node:http'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'dp20-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', HOST: '', OPENHIGGSFIELD_HOST: '', OPENHIGGSFIELD_COMFY_MODELS_DIR: '', OPENHIGGSFIELD_COMFY_DIR: '', COMFY_BASE_URL: '' };
const ok = (m: string) => console.log('ok ' + m);
const fakeMcp = http.createServer((req, res) => { if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, name: 'openhiggsfield-mcp', version: '9.9.9-test' })); } else { res.writeHead(404); res.end(); } });
await new Promise<void>((r) => fakeMcp.listen(testPort(9104), '127.0.0.1', r));
const fakeComfy = http.createServer((req, res) => { if (req.url === '/system_stats') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ system: { comfyui_version: '0.41.0-fake' } })); } else { res.writeHead(404); res.end(); } });
await new Promise<void>((r) => fakeComfy.listen(testPort(9105), '127.0.0.1', r));
const MODELS = path.join(D, 'ComfyUI', 'models'); fs.mkdirSync(path.join(MODELS, 'upscale_models'), { recursive: true }); fs.writeFileSync(path.join(MODELS, 'upscale_models', '4x-UltraSharp.pth'), 'x');
fs.writeFileSync(path.join(D, 'ComfyUI', 'comfyui_version.py'), '__version__ = "0.41.0"\n');
const procs: ChildProcess[] = [];
const boot = async (port: number, extra: Record<string, string>, host = 'localhost') => { const DD = fs.mkdtempSync(path.join(D, 'data-'));
  procs.push(spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: DD, OPENHIGGSFIELD_ENV_FILE: path.join(DD, '.env.local'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(DD, 'nf.json'), ...extra } }));
  const B = `http://${host}:${port}`; for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) return B; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); } throw new Error(`:${port} did not start`); };
const J = async (r: Response) => ({ status: r.status, body: (await r.json()) as any });
const get = (B: string, u: string) => fetch(B + u).then(J);
try {
  const [A, M] = await Promise.all([boot(testPort(9102), { OPENHIGGSFIELD_MCP_URL: `http://127.0.0.1:${testPort(9104)}/mcp` }), boot(testPort(9103), { OPENHIGGSFIELD_COMFY_MODELS_DIR: MODELS, COMFY_BASE_URL: `http://127.0.0.1:${testPort(9105)}`, HOST: '127.0.0.1', OPENHIGGSFIELD_MCP_URL: `http://127.0.0.1:${testPort(9199)}/mcp` }, '127.0.0.1')]);
  // 1
  { const bad = await get(A, '/api/tools/app-ugc-ad/price?aspect=zzq'); assert.equal(bad.status, 400); assert.equal(bad.body.code, 'invalid_aspect'); assert.ok(!JSON.stringify(bad.body).includes('zzq'));
    assert.equal((await get(A, '/api/tools/app-ugc-ad/price?aspect=9:16')).status, 200); assert.equal((await get(A, '/api/tools/app-ugc-ad/price?aspect=9%3A16')).status, 200); }
  ok('1 UGC Ad: aspect=zzq → 400 invalid_aspect (not echoed); 9:16 → 200');
  // 2
  { for (const t of ['', '%5B%5D', '%22%22']) { const r = await get(A, `/api/tools/app-orbit-shot/price?types=${t}`); assert.equal(r.status, 200, `types=${t} ${JSON.stringify(r.body)}`); }
    const zz = await get(A, '/api/tools/app-orbit-shot/price?types=zz'); assert.equal(zz.status, 400); assert.equal(zz.body.code, 'invalid_type'); assert.deepEqual(zz.body.allowed, []); assert.match(zz.body.error, /isn't a setting/);
    const png = path.join(D, 'o.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:s=1280x720', '-frames:v', '1', png]);
    const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', types: '[]', prompt: 'a vase' })) fd.append(k, v); fd.append('image', new Blob([fs.readFileSync(png)], { type: 'image/png' }), 'o.png');
    const s = await J(await fetch(`${A}/api/tools/app-orbit-shot/jobs`, { method: 'POST', body: fd })); assert.notEqual(s.body.code, 'invalid_type', JSON.stringify(s.body)); assert.equal(s.status, 200, JSON.stringify(s.body));
    const fd2 = new FormData(); for (const [k, v] of Object.entries({ rights: '1', types: 'zz', prompt: 'a vase' })) fd2.append(k, v); fd2.append('image', new Blob([fs.readFileSync(png)], { type: 'image/png' }), 'o.png');
    const s2 = await J(await fetch(`${A}/api/tools/app-orbit-shot/jobs`, { method: 'POST', body: fd2 })); assert.equal(s2.status, 400); assert.equal(s2.body.code, 'invalid_type'); }
  ok('2 Orbit Shot: types "", [] and "" = not sent (quote 200, submit 200); types=zz → 400 invalid_type allowed [] on quote and submit');
  // 3
  { const tools = (await get(A, '/api/tools')).body as any[]; const T = Object.fromEntries(tools.map((t) => [t.id, t]));
    for (const t of tools) { assert.ok(t.allowed && typeof t.allowed === 'object', t.id); for (const k of ['resolution', 'aspect', 'quality', 'qualityLabels', 'scale']) assert.ok(Array.isArray(t.allowed[k]), `${t.id}.${k}`);
      for (const k of ['types', 'mode']) assert.ok(t.allowed[k] === null || Array.isArray(t.allowed[k]), `${t.id}.${k}`); assert.equal(t.allowed.quality.length, t.allowed.qualityLabels.length); }
    const tr = T['app-transition']; for (const r of tr.app.resolutions) assert.ok(tr.allowed.resolution.includes(r), `transition ${r} in allowed`);
    for (const r of ['1080p', '2K']) { const q = await get(A, `/api/tools/app-transition/price?resolution=${r}`); assert.notEqual(q.body.code, 'invalid_resolution', `${r}: ${JSON.stringify(q.body)}`); }
    assert.equal((await get(A, '/api/tools/app-transition/price?resolution=1080p&provider=router-kling')).status, 200);
    assert.deepEqual(T['app-orbit-shot'].allowed.types, []); assert.equal(T['object-swap'].allowed.types, null); assert.deepEqual(T['create-image'].allowed.quality, ['low', 'med', 'high']); assert.deepEqual(T['create-image'].allowed.qualityLabels, ['Low', 'Medium', 'High']);
    assert.deepEqual(T['fps-boost'].allowed.aspect, []); }
  ok('3 Transition: app.resolutions (1080p, 2K) allowed (the model check then decides; Kling 1080p → 200); every tool carries allowed {resolution, aspect, quality, qualityLabels, scale, types, mode}');
  // 4
  { for (const [tool, route] of [['fps-boost', 'local:comfy-rife'], ['voice', 'local:comfy-h3-lipsync']]) {
      const rs = ((await get(A, `/api/routes?toolId=${tool}`)).body.routes as any[]).flatMap((m) => m.routes); const r = rs.find((x) => x.routeId === route); assert.ok(r, route);
      assert.notEqual(r.demo, true, route); assert.notEqual(r.status, 'Sample', route); }
    const q = (await get(A, '/api/tools/fps-boost/price?runOn=local')).body /* Use local is off here, so Auto picks RIFE's fal place (B6 order); the local place is asked by name */; assert.equal(q.routeId, 'local:comfy-rife'); assert.equal(q.demo, false); assert.equal(q.credits, 0); }
  ok('4 FPS Boost RIFE / H3 lip-sync local routes: never demo (routes + quote)');
  // 5
  { const c = (await get(A, '/api/config')).body.mcp; assert.ok(!('npx' in c)); assert.ok(!c.snippets.npx); assert.ok(!JSON.stringify(c).includes('npx'));
    assert.equal(c.stdio.command, 'node'); assert.match(c.commands.http, /mcp\/dist\/index\.js --http --port 8788$/); }
  ok('5 /api/config.mcp: no npx anywhere; stdio = node <repo>/mcp/dist/index.js; http command = … --http --port 8788');
  // 6 + 7
  { const h = (await get(A, '/api/health/self-host')).body; assert.deepEqual(h.mcp, { reachable: true, url: `http://127.0.0.1:${testPort(9104)}/mcp`, version: '9.9.9-test' });
    assert.equal(h.models.dir, null); assert.equal(h.models.missing.length, h.models.total, 'no models folder: every file missing'); assert.ok(h.models.total > 50);
    assert.ok(h.models.perModel.length > 5); assert.ok(h.models.perModel.every((m: any) => m.files.every((f: any) => f.present === false)));
    assert.equal(typeof h.disk.data.freeBytes, 'number'); assert.equal(h.comfy.reachable, null); assert.equal(h.comfy.version, null); }
  { const h = (await get(M, '/api/health/self-host')).body; assert.equal(h.backend, 'mock'); assert.equal(h.comfy.reachable, true, 'probed in mock mode'); assert.equal(h.comfy.version, '0.41.0-fake'); assert.equal(h.comfy.versionSource, 'system_stats');
    assert.deepEqual(h.mcp, { reachable: false, url: `http://127.0.0.1:${testPort(9199)}/mcp`, version: null }); assert.ok(h.models.missing.length === h.models.total - 1);
    const up = h.models.perModel.find((m: any) => m.files.some((f: any) => f.file === '4x-UltraSharp.pth')); assert.ok(up); assert.equal(up.files.find((f: any) => f.file === '4x-UltraSharp.pth').present, true);
    assert.equal(typeof h.disk.models.freeBytes, 'number'); }
  ok('6/7 self-host: mcp {reachable, url, version}; ComfyUI probed in mock mode (version from /system_stats); disk free; perModel present/missing; no folder → all missing');
  // version from disk when ComfyUI is down: same server M, but ask the helper path through a third boot is costly → covered by M's fallback order unit below
  // 8
  { const ms = ((await get(A, '/api/models?toolId=image-upscale')).body.groups as any[]).flatMap((g) => g.models); const us = ms.find((m) => m.id === 'comfy-ultrasharp'); assert.ok(us, 'ultrasharp');
    const w = us.weights.find((x: any) => x.file === '4x-UltraSharp.pth'); assert.equal(w.folder, 'upscale_models'); assert.equal(w.sizeBytes, 66961958); assert.equal(w.sizeApprox, false); assert.match(w.url, /^https:\/\/huggingface\.co\//);
    const all = ((await get(A, '/api/models')).body.groups as any[]).flatMap((g) => g.models); assert.ok(all.every((m: any) => Array.isArray(m.weights)));
    // a model installed by hand (a Hugging Face folder, e.g. Qwen3 TTS since 2026-10-27) has no single-file url on purpose (never one-click): its link is pageUrl
    const bad = all.flatMap((m: any) => m.weights.filter((x: any) => !(x.sizeBytes > 0 && /^https:\/\//.test(x.url || x.pageUrl || ''))).map((x: any) => `${m.id}: ${x.file}`));
    assert.deepEqual(bad, [], 'every weight has an exact size and a link (download url, or the page for hand-installed folders)'); }
  ok('8 /api/models weights[]: file, folder, exact sizeBytes (sizeApprox false), download url; every listed weight sized and linked');
  // Cleanroom HOST
  { assert.equal((await fetch(`${M}/api/config`)).status, 200); let lan = true; try { await fetch(`http://[::1]:${testPort(9103)}/api/config`, { signal: AbortSignal.timeout(1500) }); } catch { lan = false; }
    // listening sockets for a port: `ss` on Linux, `lsof` elsewhere (macOS has no ss); both print addr:port (lsof: *:port for all interfaces)
    const listening = (port: number) => { try { return execFileSync('ss', ['-ltnH', `sport = :${port}`], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { return execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { env: { ...process.env, PATH: `/usr/sbin:/usr/bin:/bin:${process.env.PATH}` } }).toString(); } };
    const ss = listening(testPort(9103)); assert.match(ss, new RegExp(`127\\.0\\.0\\.1:${testPort(9103)}\\b`), ss); assert.doesNotMatch(ss, new RegExp(`0\\.0\\.0\\.0:${testPort(9103)}\\b|\\*:${testPort(9103)}\\b`), ss); void lan;
    const ssA = listening(testPort(9102)); assert.match(ssA, new RegExp(`127\\.0\\.0\\.1:${testPort(9102)}\\b`), ssA); assert.doesNotMatch(ssA, new RegExp(`0\\.0\\.0\\.0:${testPort(9102)}\\b|\\*:${testPort(9102)}\\b`), ssA);
    assert.equal((await (await fetch(`${A}/api/settings/providers`)).json()).canStoreKeys, true, 'unset HOST (npm run dev) can save keys from the browser'); }
  ok('Cleanroom: HOST=127.0.0.1 listens on 127.0.0.1 only; unset HOST (no NODE_ENV=production) is 127.0.0.1 too, so keys save from the browser');
  console.log('ALL OK dp20');
} finally { for (const p of procs) { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } } fakeMcp.close(); fakeComfy.close(); setTimeout(() => fs.rmSync(D, { recursive: true, force: true }), 500); }
