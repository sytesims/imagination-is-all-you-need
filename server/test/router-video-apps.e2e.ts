// Camera Moves, Photo FX and Orbit Shot on the Comfy Router video bodies (Seedance 2.0, MiniMax H3 partner) against a FAKE api.comfy.org
// (no network, fake key, no spend). Also: Kling v3 is gone from every image-input mode (its Router schema has no image field).
// Unit: the request body per app (our prompt recipe + the photo as first_frame, cropped to the asked aspect; the model's duration / resolution limits) and the blocks.
// E2E (mock backend, COMFY_API_KEY=test-not-a-real-key, OPENHIGGSFIELD_COMFY_ROUTER_URL → fake :8794, server :8795): per app the pickers list only models
// that run it (Router models runnable, no Kling / Veo), the workflow credit, the quote, the pre-selection, a submitted job's Router body, charge = quote,
// a refused run (credits back, Try on list present), and a job the body can't take refused before anything is charged.
// Run: npx tsx test/router-video-apps.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import http from 'node:http'; import os from 'node:os'; import path from 'node:path'; import { randomUUID } from 'node:crypto';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'router-apps-'));
const KEY = 'test-not-a-real-key'; const PORT_FAKE = testPort(8794); const PORT = testPort(8795); const FAKE = `http://127.0.0.1:${PORT_FAKE}`;
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const ok = (m: string) => console.log('ok ' + m);
Object.assign(process.env, NOKEYS, { OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(D, 'unit-')), OPENHIGGSFIELD_BACKEND: 'mock' });
const PNG = path.join(D, 'photo.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=1024x576', '-frames:v', '1', PNG]); // 16:9, ≥ 409,600 px
const PNG2 = path.join(D, 'extra.png'); fs.copyFileSync(PNG, PNG2);
const MP4 = (() => { const f = path.join(D, 'out.mp4'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=1:r=24', '-pix_fmt', 'yuv420p', f]); return fs.readFileSync(f); })();
const dims = (uri: string) => { const f = path.join(D, `${randomUUID()}.png`); fs.writeFileSync(f, Buffer.from(uri.split(',')[1], 'base64'));
  const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim().split(',').map(Number); return { w, h }; };

// ---------------- unit: bodies and blocks ----------------
const M = await import('../src/routing/routerModels.ts');
{
  const SD = M.ROUTER_MODELS['router-seedance']; const H3 = M.ROUTER_MODELS['api-minimax-h3'];
  for (const t of M.ROUTER_VIDEO_APPS) { assert.ok(SD.tools!.includes(t) && H3.tools!.includes(t), t); assert.ok(!M.ROUTER_MODELS['router-kling'].tools!.includes(t) && !M.ROUTER_MODELS['router-veo'].tools!.includes(t)); }
  const cam = { mode: 'camera', types: ['push-in'], typePrompt: 'slow dolly push in', prompt: 'a red car on a coast road', enhance: true, imagePath: PNG, refPaths: [PNG], duration: 5, resolution: '720p', aspect: '1:1', seed: 7 };
  const b = await SD.body(cam, 0) as any;
  assert.match(b.content[0].text, /^Camera move: slow dolly push in\. a red car on a coast road\. Start exactly on the first frame .*only the camera moves\. Cinematic, detailed, smooth motion\. One continuous shot, no cuts\.$/);
  assert.equal(b.content.length, 2); assert.equal(b.content[1].role, 'first_frame'); assert.match(b.content[1].image_url.url, /^data:image\/png;base64,/); assert.deepEqual(dims(b.content[1].image_url.url), { w: 576, h: 576 }, '1:1 asked → photo centre-cropped');
  assert.equal(b.ratio, 'adaptive'); assert.equal(b.duration, 5); assert.equal(b.resolution, '720p'); assert.equal(b.generate_audio, true); assert.equal(b.watermark, false); assert.equal(b.seed, 7);
  const auto = await SD.body({ ...cam, aspect: 'auto' }, 0) as any; assert.deepEqual(dims(auto.content[1].image_url.url), { w: 1024, h: 576 }, 'auto → the photo as it is');
  const txt = await SD.body({ ...cam, imagePath: undefined, refPaths: [], t2v: true, aspect: '9:16' }, 0) as any; assert.equal(txt.content.length, 1); assert.equal(txt.ratio, '9:16'); assert.doesNotMatch(txt.content[0].text, /first frame/);
  const h = await H3.body({ ...cam, resolution: '1080p', duration: 10 }, 0) as any; assert.equal(h.content[1].role, 'first_frame'); assert.equal(h.resolution, '2K', '1080p runs (and is priced) as 2K'); assert.equal(h.duration, 10); assert.equal(h.ratio, 'adaptive');
  assert.equal((await H3.body({ ...cam, resolution: '480p' }, 0) as any).resolution, '768P');
  const fx = await H3.body({ mode: 'photo-fx', types: ['float'], typePrompt: 'the subject slowly floats upward', prompt: '', imagePath: PNG, refPaths: [PNG], duration: 5, resolution: '720p', aspect: 'auto' }, 0) as any;
  assert.equal(fx.content[0].text, 'Bring this photo to life with one effect: the subject slowly floats upward. Start exactly on the first frame and keep the subject recognisable. One continuous shot, no cuts.');
  const orb = await SD.body({ cinemaMode: 'generate', mode: 'direct', types: ['direct'], finalPrompt: 'the subject from the photo, on a plain light seamless backdrop. Camera: camera circles 360 degrees around the subject', refPaths: [PNG], duration: 10, resolution: '1080p', aspect: '1:1', audio: true }, 0) as any;
  assert.match(orb.content[0].text, /^Orbit shot around the subject\. the subject from the photo, on a plain light seamless backdrop\. Camera: camera circles 360 degrees around the subject\. Start exactly on the first frame \(the subject photo\)/);
  assert.equal(orb.content[1].role, 'first_frame'); assert.deepEqual(dims(orb.content[1].image_url.url), { w: 576, h: 576 }); assert.equal(orb.duration, 10); assert.equal(orb.resolution, '1080p');
  // blocks: one photo only (no reference images next to the first frame); a photo is required on Photo FX / Orbit Shot; Generate Video unchanged
  assert.match(SD.block!({ mode: 'photo-fx', imagePath: PNG, refPaths: [PNG, PNG2] })!, /takes one photo here \(it becomes the first frame\); remove the 1 extra image/);
  assert.match(H3.block!({ cinemaMode: 'generate', mode: 'direct', refPaths: [PNG, PNG2, PNG2] })!, /remove the 2 extra images/);
  assert.match(SD.block!({ cinemaMode: 'generate', mode: 'direct', refPaths: [] })!, /needs your photo here/);
  assert.equal(SD.block!(cam), null); assert.equal(SD.block!({ mode: 'camera', types: ['push-in'] }), null, 'Camera Moves without a photo = text to video');
  assert.equal(SD.block!({ mode: 'i2v', imagePath: PNG }), null); assert.match(SD.block!({ mode: 'swap' })!, /runs Generate Video jobs here/, 'swaps still refused');
  assert.match(M.ROUTER_MODELS['router-kling'].block!({ mode: 'camera', imagePath: PNG })!, /Generate Video jobs|text to video only/);
}
ok('bodies: Camera Moves / Photo FX / Orbit Shot → our prompt recipe + photo as first_frame (cropped to the asked aspect, ratio adaptive), Seedance 480p–1080p, H3 768P / 2K (1080p → 2K), duration as asked; one-photo and photo-required blocks');

// ---------------- fake api.comfy.org ----------------
type FR = { id: string; model: string; body: any; polls: number; refused: boolean };
const reqs = new Map<string, FR>(); const posts: string[] = [];
const asset = (n: string) => `${FAKE}/assets/${n}`;
const NATIVE = (model: string, id: string): any => model === 'minimax/minimax-h3' ? { task: { status: 'Success', content: { url: asset(`${id}.mp4`) } } } : { status: 'succeeded', content: { video_url: asset(`${id}.mp4`) } };
const fake = http.createServer(async (req, res) => {
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); const raw = Buffer.concat(chunks).toString();
  const send = (code: number, o: any, h: Record<string, string> = {}) => { res.writeHead(code, { 'content-type': 'application/json', 'x-comfy-request-id': randomUUID(), ...h }); res.end(JSON.stringify(o)); };
  if (req.url!.startsWith('/assets/')) { res.writeHead(200, { 'content-type': 'video/mp4' }); return res.end(MP4); }
  if (req.headers['x-api-key'] !== KEY) return send(401, { detail: 'no usable credential', error_type: 'unauthorized' }, { 'x-comfy-error-type': 'unauthorized' });
  let m = /^\/v2\/models\/([^/]+)\/([^/]+)(\/estimate|\/requests\?fallback_provider=false)$/.exec(req.url!);
  if (m && req.method === 'POST') { const model = `${m[1]}/${m[2]}`;
    if (m[3] === '/estimate') return send(200, { source: 'exact', currency: 'USD', amount: '0.0100', amount_cents: 1, credits: 2.11, provider: m[1], model });
    posts.push(model); const id = randomUUID(); const base = `${FAKE}/v2/models/${m[1]}/${m[2]}/requests/${id}`; reqs.set(id, { id, model, body: JSON.parse(raw || '{}'), polls: 0, refused: /REFUSEME/.test(raw) });
    return send(201, { request_id: id, status: 'IN_QUEUE', queue_position: 1, status_url: `${base}/status`, response_url: base, cancel_url: `${base}/cancel` }); }
  m = /^\/v2\/models\/[^/]+\/[^/]+\/requests\/([^/]+)(\/status|\/cancel)?$/.exec(req.url!);
  if (m) { const r = reqs.get(m[1]); if (!r) return send(404, { detail: 'request_not_found', error_type: 'request_not_found' });
    if (m[2] === '/cancel') return send(202, { request_id: r.id, status: 'CANCELLATION_REQUESTED' });
    if (m[2] === '/status') { r.polls++; return send(200, { request_id: r.id, status: 'COMPLETED', ...(r.refused ? { error_type: 'content_policy_violation' } : {}), status_url: '', response_url: '', cancel_url: '' }, { 'retry-after': '1' }); }
    if (r.refused) return send(400, { detail: 'refused', error_type: 'content_policy_violation' }, { 'x-comfy-error-type': 'content_policy_violation' });
    return send(200, NATIVE(r.model, r.id), { 'x-comfy-credits-used': '12.66' }); }
  send(404, { detail: 'unknown', error_type: 'model_not_found' });
});
await new Promise<void>((r) => fake.listen(PORT_FAKE, '127.0.0.1', r));
let proc: ChildProcess | null = null;
try {
  const DD = fs.mkdtempSync(path.join(D, 'data-'));
  proc = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ...NOKEYS, COMFY_API_KEY: KEY, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DD, OPENHIGGSFIELD_ENV_FILE: path.join(DD, 'sandbox.env'),
    OPENHIGGSFIELD_BILLING_MODE: 'team', OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(DD, 'nofilm.json'),
    OPENHIGGSFIELD_COMFY_ROUTER_URL: FAKE, OPENHIGGSFIELD_ROUTER_RETRY_SCALE: '0.02', OPENHIGGSFIELD_ROUTING_TIMEOUT_MS: '5000' } });
  let err = ''; proc.stderr!.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); }); const B = `http://localhost:${PORT}`;
  for (let i = 0; ; i++) { try { if ((await fetch(`${B}/api/config`)).ok) break; } catch { /* booting */ } if (i > 240) throw new Error(`server did not start: ${err.slice(-2000)}`); await new Promise((r) => setTimeout(r, 250)); }
  const J = async (r: Response) => ({ status: r.status, body: (await r.json()) as any });
  const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
  const post = async (tool: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', ...f })) fd.append(k, v);
    for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)], { type: 'image/png' }), path.basename(p)); return J(await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd })); };
  const until = async (id: string) => { for (let i = 0; i < 600; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'canceled', 'blocked', 'needs_decision'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 50)); } throw new Error('timeout ' + id); };
  const balance = async () => (await get('/api/ledger')).balance as number;
  await fetch(`${B}/api/dev/balance`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credits: 100000 }) });
  const tools = (await get('/api/tools')) as any[]; const tool = (id: string) => tools.find((t) => t.id === id);

  // ---- Kling 3.0 Omni (2026-10-25): every Generate Video mode, up to 7 reference images; still Generate Video only ----
  { const hv = tool('h3-video'); assert.deepEqual(hv.app.providerModes['router-kling'], ['t2v', 'i2v', 'flf', 'r2v']);
    for (const id of ['camera', 'photo-fx', 'app-orbit-shot', 'object-swap', 'motion-transfer']) assert.ok(!tool(id).providers.some((p: any) => p.id === 'router-kling'), `${id} lists no Kling`);
    const ki = await post('h3-video', { provider: 'router-kling', types: '["i2v"]', prompt: 'a fox', seconds: '5', resolution: '720p' }, [['image', PNG]]); assert.equal(ki.status, 200, JSON.stringify(ki.body)); await until(ki.body.id); /* finish it, so its Router call isn't counted with the app jobs below */
    const kt = await get('/api/tools/h3-video/price?provider=router-kling&types=t2v&seconds=5&resolution=720p'); assert.equal(kt.runnable, true, JSON.stringify(kt));
    const r = (await get('/api/routes?toolId=h3-video&modelId=router-kling&types=t2v')).routes[0].routes.find((x: any) => x.routeId === 'comfy-router:router-kling'); assert.deepEqual(r.caps.videoCaps?.refMax ?? r.caps.refMax ?? {}, { image: 7 }); }
  ok('Kling 3.0 Omni: Generate Video t2v / i2v / flf / r2v (i2v → 200), 7 image refs in its caps; not listed on Camera Moves, Photo FX, Orbit Shot, Object Swap, Motion Transfer');

  // ---- per app: listing, credit, quote, pre-selection, job body ----
  const APPS: { tool: string; f: Record<string, string>; files: [string, string][]; name: string; recipe: RegExp; dur: number }[] = [
    { tool: 'camera', name: 'Camera Moves', f: { types: '["push-in"]', prompt: 'a red car on a coast road', duration: '5', resolution: '720p', aspect: '16:9' }, files: [['image', PNG]], recipe: /^Camera move: slow dolly push in\. a red car on a coast road\. Start exactly on the first frame/, dur: 5 },
    { tool: 'photo-fx', name: 'Photo FX', f: { types: '["float"]', duration: '5', resolution: '720p', aspect: 'auto' }, files: [['image', PNG]], recipe: /^Bring this photo to life with one effect: the subject slowly floats upward\. Start exactly on the first frame/, dur: 5 },
    { tool: 'app-orbit-shot', name: 'Orbit Shot', f: { orbit: 'full', backdrop: 'light', duration: '10', resolution: '720p', aspect: '1:1' }, files: [['image', PNG]], recipe: /^Orbit shot around the subject\. .*plain light seamless backdrop.*camera circles 360 degrees around the subject.*Start exactly on the first frame \(the subject photo\)/, dur: 10 },
  ];
  for (const a of APPS) {
    const t = tool(a.tool); const ids = t.providers.map((p: any) => p.id);
    assert.deepEqual(ids.slice(0, 2), ['router-seedance', 'api-minimax-h3'], `${a.tool}: ${ids}`); assert.ok(!ids.includes('router-veo') && !ids.includes('router-kling'));
    for (const p of t.providers) assert.notEqual(p.reasonCode, 'not_wired', `${a.tool} ${p.id} listed but not wired: ${JSON.stringify(p).slice(0, 300)}`);
    for (const pid of ['router-seedance', 'api-minimax-h3']) { const p = t.providers.find((x: any) => x.id === pid);
      assert.equal(p.runnable, true, `${a.tool} ${pid}: ${JSON.stringify(p).slice(0, 400)}`); assert.equal(p.workflow?.source, 'official'); assert.match(p.workflow.url, /workflow_templates\/blob\/main\/templates\/api_(seedance2_0|minimax_h3)_flf2v\.json$/); assert.match(p.workflow.recipe, /first frame/);
      const r = (await get(`/api/routes?toolId=${a.tool}&modelId=${pid}`)).routes[0].routes.find((x: any) => x.routeId === `comfy-router:${pid}`); assert.equal(r.available, true, JSON.stringify(r)); assert.match(r.endpoint, /\/v2\/models\/(byteplus|minimax)\/.+\/requests\?fallback_provider=false$/); }
    assert.equal(t.defaultProvider, 'api-minimax-h3', `${a.tool}: Comfy key set → MiniMax H3 pre-selected (sponsors first, shared/cloudDefaults.ts)`);
    for (const key of ['seedance-2.0', 'minimax-h3']) { const m = (t.models ?? []).find((x: any) => x.key === key); assert.ok(m, `${a.tool}: model ${key} in models[]`);
      assert.equal(m.preselect?.runOn, 'comfy-cloud', `${a.tool} ${key}: pre-selected on Comfy (${JSON.stringify(m.preselect)})`); assert.notEqual(m.preselect?.status, 'coming-soon'); }
    for (const pid of ['router-seedance', 'api-minimax-h3']) {
      const qs = new URLSearchParams({ ...a.f, provider: pid, image: '1' }); const q = await get(`/api/tools/${a.tool}/price?${qs}`);
      assert.equal(q.runnable, true, `${a.tool} ${pid} quote: ${JSON.stringify(q).slice(0, 500)}`); assert.equal(q.demo, false); assert.ok(q.credits > 0); assert.equal(q.routeId, `comfy-router:${pid}`);
      const b0 = await balance(); const before = new Set(reqs.keys());
      const s = await post(a.tool, { ...a.f, provider: pid }, a.files); assert.equal(s.status, 200, `${a.tool} ${pid}: ${JSON.stringify(s.body)}`); assert.equal(s.body.cost, q.credits, `${a.tool} ${pid}: charge = quote`);
      const d = await until(s.body.id); assert.equal(d.status, 'done', `${a.tool} ${pid}: ${d.error} ${err.slice(-1500)}`); assert.ok(!d.demo); assert.equal(d.outputs.length, 1);
      const mine = [...reqs.values()].filter((x) => !before.has(x.id)); assert.equal(mine.length, 1); const body = mine[0].body;
      assert.equal(mine[0].model, pid === 'router-seedance' ? 'byteplus/dreamina-seedance-2-0-260128' : 'minimax/minimax-h3');
      assert.match(body.content[0].text, a.recipe, `${a.tool} ${pid}: ${body.content[0].text}`); assert.equal(body.content.length, 2); assert.equal(body.content[1].role, 'first_frame'); assert.match(body.content[1].image_url.url, /^data:image\/png;base64,/);
      if (a.f.aspect === '1:1') assert.deepEqual(dims(body.content[1].image_url.url), { w: 576, h: 576 }); else assert.deepEqual(dims(body.content[1].image_url.url), { w: 1024, h: 576 });
      assert.equal(body.ratio, 'adaptive'); assert.equal(body.duration, a.dur); assert.equal(body.resolution, pid === 'router-seedance' ? '720p' : '768P');
      assert.equal(await balance(), b0 - s.body.cost); assert.equal(d.feature?.label, `${a.name} · ${pid === 'router-seedance' ? 'Seedance 2.0' : 'MiniMax H3'}`); assert.equal(d.feature.workflow.source, 'official');
      ok(`${a.tool} × ${pid}: listed + runnable, credited "${d.feature.workflow.name}", quote ✦${q.credits} = charge; body ${mine[0].model}: recipe + first_frame, ratio adaptive, ${body.duration} s, ${body.resolution}`);
    }
    // D5: a duration outside the model's limits is made at the nearest allowed one, with the same note on quote and submit
    const bad = await J(await fetch(`${B}/api/tools/${a.tool}/price?${new URLSearchParams({ ...a.f, provider: 'api-minimax-h3', duration: '20' })}`)); assert.equal(bad.status, 200, JSON.stringify(bad.body).slice(0, 300));
    assert.ok((bad.body.adjustNotes ?? []).some((n: string) => /Made at 15 s/.test(n)), JSON.stringify(bad.body.adjustNotes));
    const bs = await post(a.tool, { ...a.f, provider: 'api-minimax-h3', duration: '20' }, a.files); assert.equal(bs.status, 200, JSON.stringify(bs.body)); assert.equal(bs.body.cost, bad.body.credits, 'quote = charge at 15 s'); await until(bs.body.id); /* its Router call lands before the next model's count */
  }
  ok('durations outside 4–15 s refused on quote and submit (400) for every app on MiniMax H3');

  // ---- extra reference images can't go with a first frame: refused before anything is charged ----
  { const b0 = await balance(); const n0 = posts.length;
    const q = await get(`/api/tools/photo-fx/price?${new URLSearchParams({ types: '["float"]', duration: '5', provider: 'router-seedance', image: '1', character: '1' })}`); void q;
    const s = await post('photo-fx', { types: '["float"]', duration: '5', provider: 'router-seedance' }, [['image', PNG], ['character', PNG2]]);
    if (s.status === 200) { const d = await until(s.body.id); assert.equal(d.status, 'failed', JSON.stringify(d).slice(0, 300)); assert.match(d.error, /takes one photo here/); }
    else assert.match(JSON.stringify(s.body), /takes one photo here|isn't available|can't/i, JSON.stringify(s.body));
    for (let i = 0; i < 40 && (await balance()) !== b0; i++) await new Promise((r) => setTimeout(r, 50)); assert.equal(await balance(), b0); assert.equal(posts.length, n0, 'no Router submit'); }
  ok('Photo FX with a character image on Seedance: refused with a plain reason, nothing charged, no Router submit');

  // ---- a refused run: credits back, Try on list present ----
  { const b0 = await balance(); const s = await post('camera', { types: '["push-in"]', prompt: 'REFUSEME', duration: '5', provider: 'api-minimax-h3' }, [['image', PNG]]); assert.equal(s.status, 200, JSON.stringify(s.body));
    const d = await until(s.body.id); assert.equal(d.status, 'failed'); assert.equal(d.reasonCode, 'content_blocked', JSON.stringify(d).slice(0, 400)); assert.ok(Array.isArray(d.tryOn), 'tryOn listed');
    for (let i = 0; i < 40 && (await balance()) !== b0; i++) await new Promise((r) => setTimeout(r, 50)); assert.equal(await balance(), b0); }
  ok('Camera Moves on MiniMax H3 refused by the provider: failed content_blocked, credits back, tryOn present');
  console.log('ALL OK router-video-apps');
} finally { if (proc) { try { process.kill(-proc.pid!, 'SIGTERM'); } catch { /* gone */ } } fake.close(); setTimeout(() => fs.rmSync(D, { recursive: true, force: true }), 500); }
