// pb/sm1: demoMessage without 'Demo preview:' lead; pricing exampleQuantity/exampleCredits;
// Camera no-provider quote route = submit route; no-media submit creates no job.
// Port :9131. Run: npx tsx test/sm1.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const TMP = process.env.TMPDIR || path.join(ROOT, '../../pb-scratch/tmp'); fs.mkdirSync(TMP, { recursive: true });
const D = fs.mkdtempSync(path.join(TMP, 'sm1-')); const DD = path.join(D, 'data'); fs.mkdirSync(DD);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', HOST: '', OPENHIGGSFIELD_HOST: '', COMFY_BASE_URL: '' };
const ok = (m: string) => console.log('ok ' + m);
let proc: ChildProcess | null = null; const PORT = testPort(9131); const B = `http://localhost:${PORT}`;
const J = async (r: Response) => { const t = await r.text(); let body: any; try { body = JSON.parse(t); } catch { body = t; } return { status: r.status, body }; };
const get = (u: string) => fetch(B + u).then(J);
const png = path.join(D, 'i.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=s=1280x720', '-frames:v', '1', png]);
const submit = async (tool: string, f: Record<string, string>, files: [string, string][] = []) => {
  const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v);
  for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)], { type: 'image/png' }), path.basename(p));
  return J(await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }));
};
try {
  proc = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DD, OPENHIGGSFIELD_ENV_FILE: path.join(DD, '.env.local'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(DD, 'nf.json') } });
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }

  // 1) demoMessage / via / status
  { const q = await get('/api/tools/upscale/price?seconds=5'); assert.equal(q.status, 200, JSON.stringify(q.body));
    assert.equal(q.body.demo, true); assert.equal(q.body.demoMessage, 'Sample output, nothing billed.');
    assert.ok(!String(q.body.demoMessage).startsWith('Demo preview:'));
    assert.equal(q.body.demoTag, 'Sample');
    const routes = await get('/api/routes?toolId=upscale');
    // 959c88cc (2026-10-26): the Upscale menu lists local first (Real-ESRGAN x2, free), while a keyless server keeps the cloud default (BH12):
    // the quote's model (SeedVR2 on fal, a sample) is the row that says 'Sample'
    const top = (routes.body.routes ?? [])[0]; assert.equal(top?.modelId, 'comfy-video-esrgan'); assert.equal(top?.via?.text, 'local · free', JSON.stringify(top?.via));
    assert.equal(q.body.route, 'fal:fal-ai/seedvr/upscale/video', 'keyless: the cloud default stays');
    const def = (routes.body.routes ?? []).find((m: any) => (m.routes ?? []).some((r: any) => r.routeId === q.body.route));
    assert.equal(def?.via?.text, 'Sample', JSON.stringify(def?.via));
    const demoRow = (routes.body.routes ?? []).flatMap((m: any) => m.routes ?? []).find((r: any) => r.demo);
    if (demoRow) assert.equal(demoRow.status, 'Sample');
    const fd = new FormData(); fd.append('rights', '1'); fd.append('seconds', '5');
    // upscale needs a video — skip job body check; quote is enough for demoMessage
    ok(`1 demoMessage="${q.body.demoMessage}" via.text Sample, demoTag Sample`); }

  // 2) pricing exampleQuantity / exampleCredits
  { const pr = await get('/api/pricing'); assert.equal(pr.status, 200);
    const row = (pr.body.hosted as any[]).find((h) => h.unit === 'second' && h.credits != null);
    assert.ok(row, 'a second-priced hosted row');
    assert.equal(row.exampleQuantity, 5); assert.equal(row.exampleLabel, '5 s clip');
    assert.equal(row.exampleCredits, Math.round(row.credits * 5 * 1000) / 1000);
    const img = (pr.body.hosted as any[]).find((h) => h.unit === 'image' && h.credits != null);
    if (img) { assert.equal(img.exampleQuantity, 1); assert.equal(img.exampleCredits, img.credits); }
    ok(`2 pricing exampleQuantity=${row.exampleQuantity} exampleCredits=${row.exampleCredits}`); }

  // 3) Camera no provider: quote route = submit route; no-media creates no job
  { const tools = (await get('/api/tools')).body; const cam = (tools.items ?? tools).find((t: any) => t.id === 'camera');
    assert.ok(cam?.defaultProvider, 'camera defaultProvider');
    // with image + no types: both use defaultProvider's default move / route
    const q = await get('/api/tools/camera/price?duration=5&image=1'); assert.equal(q.status, 200, JSON.stringify(q.body));
    assert.ok(q.body.routeId, 'quote routeId'); assert.equal(q.body.defaultProvider, cam.defaultProvider);
    const before = (await get('/api/jobs?toolId=camera&limit=100')).body;
    const beforeIds = new Set(((before.items ?? before) as any[]).map((j: any) => j.id));
    const s = await submit('camera', { rights: '1', duration: '5' }, [['image', png]]);
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.equal(s.body.route, q.body.routeId, `submit route ${s.body.route} vs quote ${q.body.routeId}`);
    assert.equal(s.body.provider, q.body.defaultProvider ?? cam.defaultProvider);
    // no media on a provider that needs the start image: 400, no new job. (2026-10-22: the default is now a Comfy Router model, Seedance 2.0 /
    // MiniMax H3, which runs a move from text alone, so pick H3 Camera Motion, which requires the image, explicitly.)
    assert.equal(cam.inputs.find((i: any) => i.name === 'image').requiredByProvider?.['comfy-h3-camera'], true, 'H3 Camera Motion needs the start image');
    const s2 = await submit('camera', { rights: '1', duration: '5', provider: 'comfy-h3-camera' });
    assert.equal(s2.status, 400, JSON.stringify(s2.body));
    assert.ok(s2.body.code === 'image_required' || s2.body.code === 'required' || /image|start image|Add /i.test(String(s2.body.error)), JSON.stringify(s2.body));
    const after = (await get('/api/jobs?toolId=camera&limit=100')).body;
    const afterIds = ((after.items ?? after) as any[]).map((j: any) => j.id);
    const created = afterIds.filter((id: string) => !beforeIds.has(id) && id !== s.body.id);
    assert.deepEqual(created, [], `no-media submit created jobs: ${created}`);
    ok(`3 camera quote=submit route ${q.body.routeId}; no-media → 400, no job`); }

  console.log('ALL OK sm1');
} finally {
  if (proc?.pid) try { process.kill(-proc.pid, 'SIGTERM'); } catch { /* */ }
  fs.rmSync(D, { recursive: true, force: true });
}
