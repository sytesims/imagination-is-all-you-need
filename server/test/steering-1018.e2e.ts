// E2E (own mock servers :8931 mock/demo, :8932 DEMO_AUTO=0 as "real mode, nothing set up"; temp data dirs, no keys). Oct 18 steering items:
// (b) the unreachable licence-policing message is gone; (c) Blender sample clips carry a visible 'Sample · CC-BY Blender Foundation' label + credit;
// (e) first load never looks broken: in mock/demo mode every tool's Auto resolves (demo_preview), in real mode with nothing set up the state is
// {state:'needs_provider', options:['connect_key','enable_local']}; (f) SeedVR2 labels + routes; (g) MCP generate_video resolutions = H3;
// (h) Soul prefill route = price route, /api/routes?toolId=soul defaultRoute, Director recreate carries mode + duration.
// Run: npx tsx test/steering-1018.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { VIDEO_LIMITS } from '../src/tools/h3/videoCaps.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const REPO = path.resolve(ROOT, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const boot = (port: number, extra: Record<string, string> = {}) => spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'st18-')),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '150', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_SEED_COMMUNITY: '1', ...extra }, stdio: 'ignore', detached: true });
const stop = (p: ChildProcess) => { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } };
const api = (port: number) => { const B = `http://localhost:${port}`;
  const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
  const job = async (tool: string, f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
  const until = async (id: string) => { for (let i = 0; i < 300; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'needs_decision', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
  const ready = async () => { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error(`server ${port} did not start`); };
  return { get, job, until, ready }; };
const ok = (m: string) => console.log('ok ' + m);
const D = boot(testPort(8931)), R = boot(testPort(8932), { OPENHIGGSFIELD_DEMO_AUTO: '0' });
try {
  const d = api(testPort(8931)), r = api(testPort(8932)); await Promise.all([d.ready(), r.ready()]);

  // (b)
  const idx = fs.readFileSync(path.join(ROOT, 'src/index.ts'), 'utf8');
  assert.ok(!/uses non-OSI weights/.test(idx) && !/allowedFor\(tool, prov\)/.test(idx), 'unreachable licence-policing branch removed'); ok('(b) no unreachable licence-policing message in index.ts');

  // (e) mock/demo: every tool's default model resolves; nothing says "Add an API key"
  const tools = await d.get('/api/tools'); let demoCount = 0;
  for (const t of tools) {
    const v = await d.get(`/api/routes?toolId=${t.id}`); if (!v.routes.length) continue;
    assert.ok(v.defaultRoute, `${t.id}: defaultRoute (${JSON.stringify(v.noProvider?.error)})`); assert.equal(v.state, 'ready', t.id); if (v.demo) { demoCount++; assert.equal(v.demo, true); assert.equal(v.demoNotice.code, 'demo_preview'); assert.equal(v.demoNotice.routeId, v.defaultRoute); assert.match(v.demoMessage, /^Sample output, nothing billed\./); }
    const p = await d.get(`/api/tools/${t.id}/price`); assert.ok(!p.noProvider, `${t.id}: price has no noProvider (${p.noProvider?.error})`);
  }
  assert.ok(demoCount >= 7, `demo routes ${demoCount}`); ok(`(e) mock/demo: all ${tools.length} tools resolve a default route (${demoCount} as demo_preview), no "Add an API key"`);
  // a demo run: quote = charge, job carries the demo notice
  const q = await d.get('/api/tools/upscale/price?duration=5'); assert.equal(q.runnable, true); assert.equal(q.demo, true); assert.equal(q.credits, 0, 'demo quote is free'); assert.ok(q.listCredits > 0, 'list price kept for display'); assert.equal(q.routeId, q.route);
  const sj = await d.job('soul', { prompt: 'portrait in golden hour light' }); assert.equal(sj.status, 200, JSON.stringify(sj.body));
  const sp = await d.get('/api/tools/soul/price'); assert.equal(sj.body.cost ?? sj.body.credits, sp.credits, 'soul quote = charge');
  const sd = await d.until(sj.body.id); assert.equal(sd.status, 'done'); assert.equal(sd.demo, true); assert.equal(sd.demoNotice.routeId, sp.route); assert.match(sd.demoMessage, /nothing billed/); assert.equal(sj.body.cost, 0, 'demo run is free'); assert.equal(sj.body.demo, true); ok(`(e) demo soul run: quote ${sp.credits} = charge ${sj.body.cost} on ${sp.route} (free), job demo:true + demoMessage`);

  // (e) real mode, nothing set up: calm structured state
  const rv = await r.get('/api/routes?toolId=soul'); assert.equal(rv.defaultRoute, null); assert.equal(rv.state, 'needs_provider'); assert.deepEqual(rv.options, ['connect_key', 'enable_local']);
  assert.equal(rv.noProvider.state, 'needs_provider'); assert.ok(rv.noProvider.title && rv.noProvider.message.length > 20, 'title + message');
  const rp = await r.get('/api/tools/soul/price'); assert.equal(rp.runnable, false); assert.equal(rp.noProvider.state, 'needs_provider'); assert.deepEqual(rp.noProvider.options, ['connect_key', 'enable_local']);
  const rr = await r.get('/api/routes?toolId=reframe'); assert.equal(rr.state, 'needs_provider'); assert.deepEqual(rr.options, ['connect_key'], 'reframe has no local route');
  ok('(e) real mode, no keys: {state:"needs_provider", options:["connect_key","enable_local"], title, message} on routes + price (reframe: connect_key only)');

  // (h) Soul: prefill route = price route; Director recreate form carries mode + duration
  const sf = await d.get(`/api/jobs/${sd.id}/prefill?action=recreate`); assert.equal(sf.routeId, sf.price.route, 'prefill routeId = price route'); assert.ok('originalRouteId' in sf);
  assert.ok((await d.get('/api/routes?toolId=soul')).defaultRoute, 'soul defaultRoute');
  const cj = await d.job('cinema', { mode: 'image', prompt: 'a lighthouse at dusk', route: 'local:comfy-open' }); assert.equal(cj.status, 200, JSON.stringify(cj.body)); await d.until(cj.body.id);
  const cf = await d.get(`/api/jobs/${cj.body.id}/prefill?action=recreate`); assert.equal(cf.form.mode, 'image'); assert.equal(cf.form.duration, '1');
  const cj2 = await d.job('cinema', { mode: 'generate', prompt: 'a lighthouse at dusk', duration: '10', palette: 'noir' }); assert.equal(cj2.status, 200, JSON.stringify(cj2.body)); await d.until(cj2.body.id);
  const cf2 = await d.get(`/api/jobs/${cj2.body.id}/prefill?action=recreate`); assert.equal(cf2.form.mode, 'generate'); assert.equal(cf2.form.duration, '10'); assert.equal(cf2.form.palette, 'noir');
  ok('(h) soul prefill routeId = price.route, defaultRoute set; Director recreate form has mode, duration (+ look chips)');

  // (f) upscale labels + mapping
  const m = await d.get('/api/models?toolId=upscale'); const names = Object.fromEntries(m.groups.flatMap((g: any) => g.models).map((x: any) => [x.id, x.name]));
  assert.equal(names['comfy-seedvr2'], 'SeedVR2'); assert.equal(names['comfy-video-esrgan'], 'Real-ESRGAN x2'); assert.equal(names['comfy-video-ultrasharp'], '4x-UltraSharp'); assert.equal(names['direct-flux3-upscale'], 'FLUX Video Upscale'); /* 2026-10-26: shared/videoUpscale.ts names the real models */
  const ur = (await d.get('/api/routes?toolId=upscale&modelId=comfy-seedvr2')).routes[0].routes.map((x: any) => x.routeId);
  assert.ok(!ur.some((id: string) => /bfl|flux-3/.test(id)), `SeedVR2 has no FLUX route: ${ur}`); assert.ok(ur.includes('fal:fal-ai/seedvr/upscale/video') && ur.includes('local:comfy-seedvr2'));
  ok(`(f) upscale: comfy-seedvr2 = "SeedVR2 3B" (${ur.join(', ')}), comfy-open = "${names['comfy-open']}", FLUX 3 Upscaler its own card`);

  // (g) MCP generate_video resolutions = H3
  const mcp = fs.readFileSync(path.join(REPO, 'mcp/src/server.ts'), 'utf8'); const en = /H3_RESOLUTIONS = \[([^\]]*)\]/.exec(mcp)?.[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(en!.filter((r) => r !== '720p'), VIDEO_LIMITS['comfy-h3'].resolutions); assert.ok(en!.includes('720p'), '720p accepted (mapped to 768p, e5f53e2)'); assert.match(mcp, /\.\.\.common,\s*resolution: H3_RESOLUTION/); ok(`(g) MCP generate_video resolution enum = H3 ${en}`);

  // (c) Blender samples: labelled + credited
  const shots = (await d.get('/api/community/shots?sort=new&limit=100')).items; const vids = shots.filter((s: any) => /\.mp4$/.test(s.previewUrl ?? ''));
  assert.ok(vids.length >= 4, `video seeds ${vids.length}`);
  for (const s of vids) { assert.match(s.previewUrl, /^\/examples\/hq-/); assert.equal(s.sampleLabel, 'Sample · CC-BY Blender Foundation'); assert.equal(s.sample.license, 'CC BY 3.0'); assert.match(s.sample.credit, /Blender Foundation/); assert.ok(s.posterUrl); }
  const vj = await d.get(`/api/jobs/${vids[0].id}`); assert.equal(vj.sampleLabel, 'Sample · CC-BY Blender Foundation'); assert.equal(vj.outputs[0].sample.label, vj.sampleLabel);
  const img = shots.find((s: any) => !/\.mp4$/.test(s.previewUrl ?? '')); assert.equal(img.sampleLabel, null, 'generated example images are not labelled as Blender samples');
  const att = fs.readFileSync(path.join(REPO, 'docs/ATTRIBUTION.md'), 'utf8'); assert.match(att, /## Sample media/); assert.match(att, /"Sintel" © copyright Blender Foundation/); assert.match(att, /"Big Buck Bunny" © copyright Blender Foundation/); assert.match(att, /creativecommons\.org\/licenses\/by\/3\.0/);
  for (const s of vids) assert.ok(fs.existsSync(path.join(REPO, 'web/public', s.previewUrl)), s.previewUrl);
  ok(`(c) ${vids.length} Community videos are Blender samples with sampleLabel + credit; job + outputs carry it; ATTRIBUTION.md has credit + licence`);
  // item 3 addendum: cloud-h3 takes 5–15 s (ComfyCloudMiniMaxH3 nodes); quote = charge at 5 s; 4 s refused on both
  for (const sec of [5, 6, 11, 15]) {
    const qq = await d.get(`/api/models/quote?model=cloud-h3&toolId=h3-video&seconds=${sec}`); assert.equal(qq.valid, true, `${sec}s: ${qq.reason ?? qq.error}`);
    const jj = await d.job('h3-video', { prompt: 'a paper boat drifting', types: '["t2v"]', provider: 'cloud-h3', seconds: String(sec) }); assert.equal(jj.status, 200, JSON.stringify(jj.body)); assert.equal(jj.body.cost, qq.credits, `${sec}s quote ${qq.credits} = charge ${jj.body.cost}`);
  }
  const q4 = await d.get('/api/models/quote?model=cloud-h3&toolId=h3-video&seconds=4'); assert.equal(q4.valid, false); assert.equal((await d.job('h3-video', { prompt: 'x', types: '["t2v"]', provider: 'cloud-h3', seconds: '4' })).status, 400);
  { const dq = await d.get('/api/models/quote?model=cloud-h3&toolId=h3-video'); assert.equal(dq.demo ? dq.listCredits : dq.credits, 48, 'default stays 6 s = 48 cr (list price when shown as a sample run) ' + JSON.stringify(dq)); } ok('(3) cloud-h3 5–15 s: quote = charge at 5/6/11/15 s, 4 s refused on quote + submit, default 6 s = 48 cr');
  console.log('PASS steering-1018');
} finally { stop(D); stop(R); }
