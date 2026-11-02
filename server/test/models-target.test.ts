// Windows/Mac/Linux setup PR 1: where model downloads go without any setting (hardware/modelsTarget.ts), Windows path handling, the
// download error words, the rename retry, the "Get ComfyUI" link per platform, and the port re-scan (POST /api/local/comfy/test).
// In-process, stub ComfyUIs on 127.0.0.1 (ephemeral ports), temp folders with spaces and accents. Run: npx tsx test/models-target.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';

const D = fs.mkdtempSync(path.join(os.tmpdir(), 'mtarget-'));
// ComfyUI stubs: A (the "Desktop" one, lists its model folders), B (a second ComfyUI on another port)
type Stub = { url: string; folders: Record<string, string[]> | null; kind: string; up: boolean; srv: http.Server };
const stub = async (version: string): Promise<Stub> => { const s: Stub = { url: '', folders: null, kind: 'local-desktop2-standalone', up: true, srv: null as any };
  s.srv = http.createServer((req, res) => { const u = String(req.url); res.setHeader('content-type', 'application/json');
    if (!s.up) { res.statusCode = 503; return res.end('{}'); }
    if (u === '/system_stats') return res.end(JSON.stringify({ system: { os: 'nt', ram_total: 32 * 2 ** 30, ram_free: 16 * 2 ** 30, comfyui_version: version, embedded_python: false, deploy_environment: s.kind, argv: ['ComfyUI/main.py'] }, devices: [] }));
    if (u === '/experiment/models' && s.folders) return res.end(JSON.stringify(Object.entries(s.folders).map(([name, folders]) => ({ name, folders }))));
    if (/^\/experiment\/models\//.test(u)) return res.end('[]');
    res.statusCode = 404; res.end('{}'); });
  await new Promise<void>((r) => s.srv.listen(0, '127.0.0.1', () => r())); s.url = `http://127.0.0.1:${(s.srv.address() as any).port}`; return s; };
const A = await stub('0.43.0'); const B = await stub('0.42.1');
const DEAD = 'http://127.0.0.1:9'; // nothing answers there
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0',
  OPENHIGGSFIELD_COMFY_DETECT_URLS: [DEAD, A.url, B.url].join(','), HOST: '127.0.0.1' });
for (const k of ['OPENHIGGSFIELD_HW_MOCK', 'COMFY_BASE_URL', 'OPENHIGGSFIELD_COMFY_MODELS_DIR']) delete process.env[k];
const MT = await import('../src/hardware/modelsTarget.js'); const CM = await import('../src/hardware/comfyModels.js'); const HW = await import('../src/hardware.js');
const DL = await import('../src/hardware/downloads.js'); const { config } = await import('../src/config.js'); const { getComfyFor } = await import('../src/shared/getComfy.js');
const ok = (m: string) => console.log('ok ' + m);
const W = path.win32;

// ---- 1. Windows paths (pure, path.win32 on any OS) ----
{ const have = new Set(['C:\\Users\\José Núñez\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\models\\checkpoints', 'D:\\Comfy-Desktop\\models', 'C:\\Users\\José Núñez\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\models']);
  const ex = (p: string) => have.has(p);
  assert.equal(MT.pickWriteFolder(['C:\\Users\\José Núñez\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\models\\checkpoints\\', 'D:\\Comfy-Desktop\\models\\checkpoints'], ex, W),
    'C:\\Users\\José Núñez\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\models\\checkpoints', 'default (first) folder, trailing backslash dropped, accents and spaces kept');
  assert.equal(MT.pickWriteFolder(['E:\\Unplugged\\checkpoints', 'D:\\Comfy-Desktop\\models\\checkpoints'], ex, W), 'D:\\Comfy-Desktop\\models\\checkpoints', 'missing drive skipped; a folder whose parent exists is made on download');
  assert.equal(MT.pickWriteFolder(['C:/Users/José Núñez/AppData/Local/Comfy-Desktop/ComfyUI-Shared/models/checkpoints'], ex, W), 'C:\\Users\\José Núñez\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\models\\checkpoints', 'forward slashes from ComfyUI normalised');
  assert.equal(MT.pickWriteFolder(['models\\checkpoints', 'ComfyUI/models/checkpoints'], () => true, W), null, 'relative paths never used (they would resolve against this server)');
  assert.equal(MT.pickWriteFolder([], ex, W), null); assert.equal(MT.pickWriteFolder(null, ex, W), null);
  const dir = 'C:\\Users\\José Núñez\\ComfyUI-Shared\\models\\checkpoints';
  assert.equal(MT.safeJoin(dir, 'flux 2\\klein.safetensors', W), 'C:\\Users\\José Núñez\\ComfyUI-Shared\\models\\checkpoints\\flux 2\\klein.safetensors');
  assert.equal(MT.safeJoin(dir, 'sub/x.safetensors', W), `${dir}\\sub\\x.safetensors`);
  for (const bad of ['..\\..\\Windows\\evil.dll', 'D:\\other\\x.safetensors', 'C:x.safetensors', '\\\\server\\share\\x', '']) assert.equal(MT.safeJoin(dir, bad, W), null, `refused: ${bad}`);
  assert.equal(MT.safeJoin('C:\\models\\checkpoints', '..\\checkpoints2\\x', W), null, 'a sibling folder with the same prefix is outside');
  const long = 'C:\\Users\\' + 'a'.repeat(240) + '\\models\\checkpoints'; assert.ok(MT.safeJoin(long, 'x.safetensors', W)!.length > 260, 'long paths are joined as they are (Node writes them on Windows)');
  assert.equal(MT.whereToPut('checkpoints', 'win32'), 'ComfyUI\\models\\checkpoints'); assert.equal(MT.whereToPut('text_encoders', 'darwin'), 'ComfyUI/models/text_encoders'); }
ok('1 Windows paths: backslashes, forward slashes, spaces, accents, drive letters, traversal and other drives refused, long paths');

// ---- 2. resolution order: env → ComfyUI's own folders → nothing ----
const SHARED = path.join(D, 'José Núñez', 'ComfyUI-Shared', 'models'); fs.mkdirSync(path.join(SHARED, 'checkpoints'), { recursive: true });
const OTHER = path.join(D, 'Other drive', 'loras'); fs.mkdirSync(OTHER, { recursive: true });
A.folders = { checkpoints: [path.join(SHARED, 'checkpoints'), path.join(D, 'Legacy', 'models', 'checkpoints')], loras: [OTHER], text_encoders: [path.join(SHARED, 'text_encoders')], diffusion_models: [path.join(SHARED, 'diffusion_models')] };
config.comfyBaseUrl = A.url;
assert.equal(MT.modelsTarget().writable, false, 'first look only starts the read'); await CM.refreshModelRoots();
{ const t = MT.modelsTarget(); assert.equal(t.source, 'comfyui'); assert.equal(t.root, SHARED); assert.equal(t.writable, true);
  assert.equal(t.dirFor('checkpoints'), path.join(SHARED, 'checkpoints')); assert.equal(t.dirFor('loras'), OTHER, 'each folder where ComfyUI keeps it (another drive)');
  assert.equal(t.dirFor('clip'), path.join(SHARED, 'text_encoders'), 'clip ⇄ text_encoders'); assert.equal(t.dirFor('vae'), path.join(SHARED, 'vae'), 'a folder ComfyUI does not list: under the root');
  assert.equal(MT.canDownloadHere(), true); }
const ENVDIR = path.join(D, 'env models'); fs.mkdirSync(ENVDIR);
process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR = ENVDIR;
{ const t = MT.modelsTarget(); assert.equal(t.source, 'env'); assert.equal(t.root, ENVDIR); assert.equal(t.dirFor('loras'), path.join(ENVDIR, 'loras'), 'the env folder wins over ComfyUI'); }
process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR = path.join(D, 'nope');
{ const t = MT.modelsTarget(); assert.equal(t.source, 'env'); assert.equal(t.writable, false); assert.equal(t.why, 'env_missing'); }
delete process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR;
// older ComfyUI: no /experiment/models → unknown, no download offered
A.folders = null; CM.setComfyModelsFetch(null); await CM.refreshModelRoots();
{ const t = MT.modelsTarget(); assert.equal(t.source, null); assert.equal(t.why, 'unknown'); assert.equal(MT.canDownloadHere(), false);
  const c = DL.downloadCheck({ variantId: null, providerId: 'comfy-zimage' }); assert.equal(c.code, 'no_models_dir'); assert.match(c.message!, /couldn’t find where ComfyUI keeps/);
  assert.ok(c.extra.files.every((f: any) => /^ComfyUI[\\/]models[\\/]/.test(f.putIn)), 'says where each file goes instead'); }
// ComfyUI on another computer: never written to
config.comfyBaseUrl = 'http://192.168.1.50:8188'; { const t = MT.modelsTarget(); assert.equal(t.why, 'remote'); assert.equal(t.writable, false); }
config.comfyBaseUrl = A.url;
// a folder that can't be written (not on Windows, where chmod doesn't apply)
A.folders = { checkpoints: [path.join(SHARED, 'checkpoints')] }; CM.setComfyModelsFetch(null); await CM.refreshModelRoots();
if (process.platform !== 'win32' && process.getuid?.() !== 0) { fs.chmodSync(SHARED, 0o555); const t = MT.modelsTarget(); assert.equal(t.writable, false); assert.equal(t.why, 'not_writable'); fs.chmodSync(SHARED, 0o755); }
// a ComfyUI in Docker lists container paths: never used
await HW.getHardware(); A.kind = 'docker'; HW.setHostProbe(null); await HW.getHardware(); assert.equal(HW.comfyKindDetected(), 'docker');
{ const t = MT.modelsTarget(); assert.equal(t.why, 'container'); assert.equal(t.writable, false); assert.match(DL.downloadCheck({ providerId: 'comfy-zimage' }).message!, /inside your container/); }
A.kind = 'local-desktop2-standalone'; HW.setHostProbe(null); await HW.getHardware();
ok('2 models folder: env wins; else ComfyUI\'s own folders (default first, aliases, other drives); old ComfyUI / remote / read-only / Docker → no download, says where files go');

// ---- 3. a real download plan into ComfyUI's folder; disk nearly full ----
A.folders = { checkpoints: [path.join(SHARED, 'checkpoints')], text_encoders: [path.join(SHARED, 'text_encoders')], diffusion_models: [path.join(SHARED, 'diffusion_models')], vae: [path.join(SHARED, 'vae')] };
CM.setComfyModelsFetch(null); await CM.refreshModelRoots();
{ const c = DL.downloadCheck({ providerId: 'comfy-zimage' }); assert.equal(c.dir, SHARED); assert.ok(c.code == null || c.code === 'not_enough_disk', `can start (${c.code})`);
  for (const f of c.plan.files) assert.ok(c.dest!(f.folder, f.file)!.startsWith(path.join(SHARED, f.folder === 'clip' ? 'text_encoders' : f.folder === 'unet' ? 'diffusion_models' : f.folder)), `${f.file} → ComfyUI's ${f.folder}`); }
process.env.OPENHIGGSFIELD_DISK_FREE_GB = '0.5';
{ const c = DL.downloadCheck({ providerId: 'comfy-zimage' }); assert.equal(c.code, 'not_enough_disk'); assert.match(c.message!, /GB is free\. Free some space/); }
delete process.env.OPENHIGGSFIELD_DISK_FREE_GB;
ok('3 download plan writes into ComfyUI\'s own folders; a nearly full disk is refused before downloading');

// ---- 4. error words and the Windows rename retry ----
{ const E = (code: string, p = '') => Object.assign(new Error(`${code}: something, open '${p}'`), { code, path: p });
  assert.match(DL.downloadErrorText(E('ENOSPC')), /disk filled up.*Resume/); assert.match(DL.downloadErrorText(E('ENAMETOOLONG')), /too long/);
  assert.match(DL.downloadErrorText(E('EROFS')), /read-only/); assert.match(DL.downloadErrorText(E('EACCES')), /no permission/);
  assert.match(DL.downloadErrorText(E('EPERM'), '/Users/me/Documents/ComfyUI/models/x', 'darwin', '/Users/me'), /Privacy & Security/);
  assert.match(DL.downloadErrorText(E('EPERM'), '/Volumes/T7/models/x', 'darwin', '/Users/me'), /Privacy & Security/);
  assert.match(DL.downloadErrorText(E('EPERM'), 'C:\\models\\x', 'win32'), /Another program/);
  assert.match(DL.downloadErrorText(E('ENOENT'), '/media/me/disk/models/x', 'linux'), /plugged in/);
  assert.equal(DL.downloadErrorText(new Error('download failed (HTTP 500) Bearer abc123')), 'download failed (HTTP 500) Bearer ***');
  let n = 0; await DL.renameWithRetry('a', 'b', () => { if (++n < 3) throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); }, 5, 1); assert.equal(n, 3, 'EPERM twice, then it works');
  n = 0; await assert.rejects(DL.renameWithRetry('a', 'b', () => { n++; throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' }); }, 3, 1)); assert.equal(n, 3, 'gives up after the tries');
  n = 0; await assert.rejects(DL.renameWithRetry('a', 'b', () => { n++; throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); }, 5, 1)); assert.equal(n, 1, 'other errors are not retried'); }
ok('4 plain error words (full disk, long path, read-only, permission, macOS privacy, unplugged drive); rename retried on EPERM/EBUSY');

// ---- 5. Get ComfyUI per platform ----
{ assert.match(getComfyFor({ platform: 'win32', arch: 'x64' }).url!, /comfy\.org\/download/);
  const mac = getComfyFor({ platform: 'darwin', arch: 'arm64' }); assert.match(mac.url!, /comfy\.org\/download/); assert.ok(mac.help.some((h) => /Open Anyway/.test(h)));
  const intel = getComfyFor({ platform: 'darwin', arch: 'x64' }); assert.equal(intel.url, null); assert.match(intel.note!, /Intel Macs/);
  const lin = getComfyFor({ platform: 'linux', arch: 'x64' }); assert.match(lin.url!, /desktop\/linux/); assert.ok(lin.help.some((h) => /libfuse2/.test(h)));
  assert.match(getComfyFor({ platform: 'linux', arch: 'x64', headless: true }).url!, /manual_install/); assert.match(getComfyFor(null).url!, /comfy\.org\/download/); }
ok('5 Get ComfyUI: Windows / Apple Silicon → Desktop, Intel Mac → Comfy Cloud, Linux → Desktop for Linux, headless → manual install');

// ---- 6. POST /api/local/comfy/test: re-scan when the saved address stops answering; two answering → alsoFound; never switches by itself ----
const Fastify = (await import('fastify')).default; const { registerHardware } = await import('../src/routesHardware.js');
const app = Fastify(); registerHardware(app); await app.ready();
const test = async (body: any = {}) => (await app.inject({ method: 'POST', url: '/api/local/comfy/test', payload: body })).json();
config.comfyBaseUrl = '';
{ const r = await test(); assert.equal(r.reachable, true); assert.equal(r.url, A.url); assert.equal(r.detected, true); assert.deepEqual(r.alsoFound.map((x: any) => x.url), [B.url], 'both listed, so the person can pick');
  assert.equal(r.movedFrom, null); assert.ok(r.host?.platform); }
config.comfyBaseUrl = B.url; { const r = await test(); assert.equal(r.url, B.url); assert.equal(r.detected, false, 'the saved address answers: nothing to save'); assert.deepEqual(r.alsoFound, []); }
B.up = false; { const r = await test(); assert.equal(r.reachable, true); assert.equal(r.url, A.url, 'saved one down: found on another usual port'); assert.equal(r.detected, true); assert.equal(r.movedFrom, B.url); assert.equal(config.comfyBaseUrl, B.url, 'not switched by itself'); }
A.up = false; { const r = await test(); assert.equal(r.reachable, false); assert.equal(r.url, B.url); }
A.up = true; B.up = true;
const dir = (await app.inject({ method: 'GET', url: '/api/local/models-dir' })).json(); config.comfyBaseUrl = A.url; await CM.refreshModelRoots();
const dir2 = (await app.inject({ method: 'GET', url: '/api/local/models-dir' })).json(); assert.equal(dir2.source, 'comfyui'); assert.equal(dir2.dir, SHARED, 'full path on this computer'); assert.equal(dir2.canOpen, false, 'mock: never opens windows'); void dir;
const nodes = (await app.inject({ method: 'GET', url: '/api/local/nodes' })).json(); assert.ok(nodes.packs.some((p: any) => p.name === 'ComfyUI-KJNodes' && /github\.com/.test(p.repo)), 'packs with their source');
ok('6 port re-scan: saved address first; when it stops answering, the usual ports (alsoFound when two answer); models-dir and add-on list');
await app.close(); A.srv.close(); B.srv.close();
