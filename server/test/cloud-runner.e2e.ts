// B2 e2e (Oct 19): the three Comfy Cloud workflow routes (cloud-h3-wf, cloud-ltx-camera, cloud-reshoot) run END TO END through a real
// server (:8996, mock backend, fake COMFY_API_KEY) against a FAKE Comfy API v2 server (:8997, this process; no network, no spend):
//  keyless → needsKey (key_missing, never not_wired); keyed → runnable (not not_wired) and a pinned submit goes to the fake Cloud:
//  upload → submit graph (workflows/cloud/*) → poll → outputs → download → job done, charged = quote;
//  a failing Cloud job → failed, full refund, ledger "credits back to your balance" (only because credits were charged);
//  cancel while generating → POST /api/v2/jobs/{id}/cancel reaches Cloud, credits back.
// Run: npx tsx test/cloud-runner.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import http from 'node:http'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cre2e-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const ok = (m: string) => console.log('ok ' + m);
const PNG = path.join(D, 'in.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=1280x720', '-frames:v', '1', PNG]);
const SRC = path.join(D, 'src.mp4'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=s=854x480:d=4:r=24', '-f', 'lavfi', '-i', 'sine=d=4', '-shortest', '-pix_fmt', 'yuv420p', '-c:a', 'aac', SRC]);
const OUT = path.join(D, 'out.mp4'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=1280x704:d=2:r=24', '-f', 'lavfi', '-i', 'sine=d=2', '-shortest', '-pix_fmt', 'yuv420p', '-c:a', 'aac', OUT]); const OUTB = fs.readFileSync(OUT);
// ---- fake Comfy API v2 ----
type CJ = { id: string; workflow: any; polls: number; mode: 'ok' | 'fail' | 'hang'; canceled: boolean };
const cjobs = new Map<string, CJ>(); const log: { method: string; url: string; auth: string | undefined; idem?: string }[] = []; let n = 0;
const fake = http.createServer(async (req, res) => {
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); const body = Buffer.concat(chunks);
  log.push({ method: req.method!, url: req.url!, auth: req.headers.authorization, idem: req.headers['idempotency-key'] as string | undefined });
  const send = (code: number, o: any) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (process.env.DBG) console.log('FAKE', req.method, req.url, req.headers.authorization);
  if (req.headers.authorization !== 'Bearer comfyui-fake-e2e' && !req.url!.startsWith('/signed/')) return send(401, { error: { code: 'unauthorized', message: 'no' } });
  if (req.method === 'POST' && req.url === '/api/v2/assets') return send(201, { id: `asset-${++n}`, file_path: 'in' });
  if (req.method === 'POST' && req.url === '/api/v2/jobs') { const wf = JSON.parse(body.toString()).workflow; const s = JSON.stringify(wf);
    const j: CJ = { id: `cj-${++n}`, workflow: wf, polls: 0, mode: /FAILME/.test(s) ? 'fail' : /HANGME/.test(s) ? 'hang' : 'ok', canceled: false }; cjobs.set(j.id, j); return send(201, { id: j.id, status: 'queued' }); }
  let m = /^\/api\/v2\/jobs\/([^/]+)\/cancel$/.exec(req.url!); if (m && req.method === 'POST') { const j = cjobs.get(m[1]); if (!j) return send(404, { error: { code: 'not_found' } }); j.canceled = true; return send(202, { id: j.id, status: 'canceling' }); }
  m = /^\/api\/v2\/jobs\/([^/]+)$/.exec(req.url!); if (m) { const j = cjobs.get(m[1]); if (!j) return send(404, { error: { code: 'not_found' } }); j.polls++;
    if (j.canceled) return send(200, { id: j.id, status: 'canceled', outputs: [] });
    if (j.mode === 'hang' || j.polls < 3) return send(200, { id: j.id, status: 'running', progress: { value: 0.3 }, outputs: [] });
    if (j.mode === 'fail') return send(200, { id: j.id, status: 'failed', outputs: [], error: { code: 'node_execution_error', message: 'boom' } });
    const save = Object.entries<any>(j.workflow).filter(([, v]) => /^Save/.test(v.class_type)).map(([k]) => k);
    return send(200, { id: j.id, status: 'succeeded', outputs: save.map((k) => ({ node_id: k, name: `${j.id}-${k}.mp4`, type: 'video', content_type: 'video/mp4', size_bytes: OUTB.length, id: `o-${j.id}-${k}`, url: `/api/v2/assets/o-${j.id}-${k}/content` })) }); }
  m = /^\/api\/v2\/assets\/([^/]+)\/content$/.exec(req.url!); if (m) { res.writeHead(302, { location: `/signed/${m[1]}?sig=x` }); return res.end(); }
  if (req.url!.startsWith('/signed/')) { res.writeHead(200, { 'content-type': 'video/mp4' }); return res.end(OUTB); }
  send(404, { error: { code: 'not_found' } });
});
await new Promise<void>((r) => fake.listen(testPort(8997), '127.0.0.1', r));
const procs: ChildProcess[] = [];
async function boot(port: number, extra: Record<string, string>) {
  const DD = fs.mkdtempSync(path.join(D, 'data-'));
  const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ...NOKEYS, ...extra, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: DD, OPENHIGGSFIELD_ENV_FILE: path.join(DD, '.env.local'),
    OPENHIGGSFIELD_BILLING_MODE: 'team', OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(DD, 'nofilm.json'),
    OPENHIGGSFIELD_COMFY_CLOUD_URL: `http://127.0.0.1:${testPort(8997)}`, OPENHIGGSFIELD_COMFY_CLOUD_POLL_MS: '40', OPENHIGGSFIELD_CANCEL_IN_PROCESSING: '1', OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD: '1' /* this test is the runner's wiring; the 'price not measured' gate (2026-10-24) has its own tests */ } });
  let err = ''; p.stderr!.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); }); procs.push(p); const B = `http://localhost:${port}`;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) return { B, err: () => err }; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  throw new Error(`server :${port} did not start: ${err.slice(-2000)}`);
}
const J = async (r: Response) => ({ status: r.status, body: (await r.json()) as any });
const post = async (B: string, tool: string, f: Record<string, string>, files: [string, string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', ...f })) fd.append(k, v);
  for (const [k, p, t] of files) fd.append(k, new Blob([fs.readFileSync(p)], { type: t }), path.basename(p)); return J(await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd })); };
const get = async (B: string, u: string) => (await (await fetch(B + u)).json()) as any;
const until = async (B: string, id: string, want = ['done', 'failed', 'canceled', 'blocked', 'needs_decision']) => { for (let i = 0; i < 600; i++) { const j = await get(B, `/api/jobs/${id}`); if (want.includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
const balance = async (B: string) => (await get(B, '/api/ledger')).balance as number;
const CASES: { name: string; tool: string; model: string; quote: string; fields: Record<string, string>; files: [string, string, string][]; wf: RegExp }[] = [
  { name: 'cloud-h3-wf', tool: 'h3-video', model: 'cloud-h3-wf', quote: 'seconds=5&types=t2v', fields: { provider: 'cloud-h3-wf', types: '["t2v"]', seconds: '5', prompt: 'a paper boat' }, files: [], wf: /^cloud\/h3-t2v-api\.json$/ },
  { name: 'cloud-ltx-camera', tool: 'camera', model: 'cloud-ltx-camera', quote: 'types=ltx-dolly-in&duration=3', fields: { provider: 'cloud-ltx-camera', types: '["ltx-dolly-in"]', duration: '3', prompt: 'a quiet room' }, files: [['image', PNG, 'image/png']], wf: /^cloud\/camera-ltx-api\.json$/ },
  { name: 'cloud-reshoot', tool: 'reshoot', model: 'cloud-reshoot', quote: 'duration=4', fields: { provider: 'cloud-reshoot', angles: JSON.stringify(['low angle']), resolution: '720p', prompt: 'a street' }, files: [['video', SRC, 'video/mp4']], wf: /^cloud\/reshoot-cloud-api\.json$/ },
];
const routeOf = async (B: string, c: typeof CASES[0]) => ((await get(B, `/api/routes?toolId=${c.tool}&modelId=${c.model}`)).routes[0].routes as any[]).find((x) => x.routeId === `comfy-cloud:${c.model}`);
try {
  const [N, K] = await Promise.all([boot(testPort(8995), {}), boot(testPort(8996), { COMFY_API_KEY: 'comfyui-fake-e2e' })]);
  for (const c of CASES) { const r = await routeOf(N.B, c); assert.ok(r, c.name); assert.equal(r.reasonCode, 'key_missing', `${c.name} keyless: ${JSON.stringify(r)}`); assert.notEqual(r.reasonCode, 'not_wired');
    const k = await routeOf(K.B, c); assert.equal(k.available, true, `${c.name} keyed: ${JSON.stringify(k)}`); assert.notEqual(k.reasonCode, 'not_wired'); }
  ok('keyless → key_missing (needsKey) on all three; with a key → runnable (never not_wired)');
  for (const c of CASES) {
    // success
    const b0 = await balance(K.B); const before = cjobs.size;
    const s = await post(K.B, c.tool, c.fields, c.files); assert.equal(s.status, 200, `${c.name}: ${JSON.stringify(s.body)}`); assert.ok(s.body.cost > 0, `${c.name} charged`);
    const d = await until(K.B, s.body.id); assert.equal(d.status, 'done', `${c.name}: ${d.error} ${K.err().slice(-1500)}`); assert.ok(d.outputs.length >= 1); assert.ok(d.cloudJobId?.startsWith('cj-'), c.name);
    assert.ok(cjobs.size > before, `${c.name} reached the fake Cloud`); assert.ok(d.input.comfyPlan.passes.every((p: any) => c.wf.test(p.workflow)), `${c.name} graphs: ${JSON.stringify(d.input.comfyPlan.passes)}`);
    assert.equal(await balance(K.B), b0 - s.body.cost, `${c.name} charged = quote`); assert.ok(!d.demo, `${c.name} not a demo`);
    const out = await fetch(K.B + d.outputs[0].url); assert.equal(out.status, 200);
    // failure → credits back
    const f = await post(K.B, c.tool, { ...c.fields, prompt: 'FAILME please' }, c.files); assert.equal(f.status, 200, JSON.stringify(f.body)); const cost = f.body.cost; assert.ok(cost > 0);
    const fd = await until(K.B, f.body.id); assert.ok(['failed', 'needs_decision'].includes(fd.status), `${c.name} fail: ${fd.status}`); assert.equal(fd.reasonCode, 'cloud_job_failed', JSON.stringify(fd));
    if (fd.status === 'failed') { assert.equal(fd.refund?.amount, cost, `${c.name} full refund ${JSON.stringify(fd.refund)}`); assert.equal(await balance(K.B), b0 - s.body.cost, `${c.name} balance back`);
      const rows = (await get(K.B, '/api/ledger')).entries.filter((e: any) => e.kind === 'refund' && e.jobId === f.body.id); assert.equal(rows.length, 1); assert.match(rows[0].note, /credits back to your balance/); }
    // cancel while generating → Cloud cancel
    const h = await post(K.B, c.tool, { ...c.fields, prompt: 'HANGME please' }, c.files); assert.equal(h.status, 200);
    for (let i = 0; i < 300; i++) { const j = await get(K.B, `/api/jobs/${h.body.id}`); if (j.cloudJobId) break; await new Promise((r) => setTimeout(r, 50)); }
    const hj = await get(K.B, `/api/jobs/${h.body.id}`); assert.ok(hj.cloudJobId, `${c.name} hang submitted`);
    const cr = await J(await fetch(`${K.B}/api/jobs/${h.body.id}/cancel`, { method: 'POST' })); assert.ok(cr.status < 300, JSON.stringify(cr.body));
    for (let i = 0; i < 100 && !cjobs.get(hj.cloudJobId)!.canceled; i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(cjobs.get(hj.cloudJobId)!.canceled, true, `${c.name}: cancel reached Comfy Cloud`);
    const hd = await until(K.B, h.body.id, ['canceled', 'failed', 'done']); assert.equal(hd.status, 'canceled'); await new Promise((r) => setTimeout(r, 300));
    assert.equal(await balance(K.B), b0 - s.body.cost, `${c.name}: cancelled job's credits back`);
    ok(`${c.name}: submit ${d.input.comfyPlan.passes.map((p: any) => p.workflow).join(', ')} → poll → outputs → done (charged ${s.body.cost} = quote); Cloud failure → refund ${cost} + ledger "credits back…"; cancel → Cloud cancel, credits back`);
  }
  assert.ok(log.every((l) => l.url.startsWith('/signed/') ? !l.auth : l.auth === 'Bearer comfyui-fake-e2e'), 'key on every API call, never on the signed URL');
  assert.ok(log.filter((l) => l.method === 'POST' && l.url === '/api/v2/jobs').every((l) => !!l.idem), 'Idempotency-Key on every submit');
  ok('every API call carries the key, signed downloads never do; every submit carries an Idempotency-Key');
  console.log('ALL OK cloud-runner-e2e');
} finally { for (const p of procs) { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } } fake.close(); setTimeout(() => fs.rmSync(D, { recursive: true, force: true }), 500); }
