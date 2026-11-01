/**
 * The job view tells the whole truth (agent audit gap 3 / task 3), over real MCP stdio clients running mcp/src (tsx, no build needed):
 *  1. run_on "fal" without a fal key → the generate reply says so (notice), and get_job / wait_for_job / job_status report sample:true + the reason;
 *  2. a real (stub) job → model {name, id}, place {runOn, label}, estimate {usd, comfyCredits}, actual {usd}, sample:false;
 *  3. a failed job → error {message, code, next} + tryOn (places with prices);
 *  4. wait_for_job timeout → status still running + next ("call get_job …, the job keeps running"); an active job carries a compact progressInfo {stage, source, line, …}.
 * Boots two isolated mock APIs (temp data dirs, no keys / mock keys, ports 8838 + 8839) and a stub API on 8840; nothing reaches a provider.
 * Run: npm run test:job-view   (or: npx tsx test/job-view.ts)
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)); const SERVER = path.resolve(HERE, '../../server'); const MCP = path.resolve(HERE, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_COMFY_API_KEY: '',
  OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_USE_LOCAL: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_LUMA_API_KEY: '', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_AGENT_BUDGET_USD: '', OPENHIGGSFIELD_AGENT_BUDGET_ID: '', OPENHIGGSFIELD_MCP_TOOLSETS: 'all' };
const P_NOKEY = Number(process.env.JOBVIEW_PORT) || 8838, P_KEYS = P_NOKEY + 1, P_STUB = P_NOKEY + 2;
const procs: ChildProcess[] = [];
const boot = (port: number, extra: Record<string, string>) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ohf-jobview-'));
  const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: SERVER, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: d, OPENHIGGSFIELD_ENV_FILE: path.join(d, 'x.env'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '80', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', ...extra }, stdio: 'ignore', detached: true }); procs.push(p); return p; };
const B = (port: number) => `http://localhost:${port}`;
const ready = async (port: number) => { for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B(port)}/api/health`)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error(`API on :${port} did not start`); };
const getJ = async (port: number, u: string) => (await (await fetch(B(port) + u)).json()) as any;
const ok = (m: string) => console.log('ok ' + m);
const show = (label: string, v: unknown) => { if (process.env.JOBVIEW_PRINT) console.log(`--- ${label}\n${JSON.stringify(v, null, 2)}`); }; // JOBVIEW_PRINT=1 prints the views
const text = (r: any) => r.content?.find((c: any) => c.type === 'text')?.text ?? '';
const parse = (r: any) => { try { return JSON.parse(text(r)); } catch { return text(r); } };
const clients: Client[] = [];
async function mcpFor(port: number, base = B(port)) {
  const c = new Client({ name: 'ohf-jobview', version: '1' }); clients.push(c);
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(MCP, 'node_modules/tsx/dist/cli.mjs'), path.join(MCP, 'src/index.ts')], cwd: MCP,
    env: { ...process.env, ...NOKEYS, OPENHIGGSFIELD_API: base, OPENHIGGSFIELD_MCP_POLL_MS: '200', PUBLIC_WEB_URL: 'http://web.example:5174' } as Record<string, string> }));
  return { call: async (name: string, args: Record<string, unknown>) => { const raw: any = await c.callTool({ name, arguments: args }, undefined, { timeout: 120_000 }); return { raw, r: parse(raw) }; } };
}

for (const p of [P_NOKEY, P_KEYS, P_STUB]) if (await fetch(`http://127.0.0.1:${p}/api/health`).then(() => true, () => false)) throw new Error(`:${p} is in use; set JOBVIEW_PORT to a free base port`);
let stub: ReturnType<typeof createServer> | null = null;
try {
  boot(P_NOKEY, {}); boot(P_KEYS, { OPENHIGGSFIELD_MOCK_KEYS: '1' });
  await Promise.all([ready(P_NOKEY), ready(P_KEYS)]);
  const nokey = await mcpFor(P_NOKEY); const keys = await mcpFor(P_KEYS);

  // ---- 1. run_on fal with no fal key → a sample, said out loud everywhere ----
  { const tools = (await clients[0].listTools()).tools; const js = tools.find((t) => t.name === 'job_status')!; const gj = tools.find((t) => t.name === 'get_job')!;
    assert.match(js.description ?? '', /Deprecated alias of get_job/); assert.ok((gj.inputSchema as any).properties.wait, 'get_job takes wait'); assert.match(gj.description ?? '', /sample/);
    ok('job_status is a deprecated alias; get_job takes wait and documents sample'); }
  const g = await nokey.call('generate_image', { prompt: 'a lighthouse at dusk', model: 'qwen-image', run_on: 'fal' });
  assert.equal(g.raw.isError, false, text(g.raw)); assert.equal(g.r.status, 'done'); assert.equal(g.r.sample, true);
  assert.match(g.r.notice, /You asked for run_on "fal", but this ran as a sample\. No fal key is set/); assert.match(g.r.sampleReason, /No fal key is set, so this is a sample: nothing was generated/);
  assert.deepEqual(g.r.place, { runOn: 'fal', label: 'fal' }); assert.deepEqual(g.r.model, { name: 'Qwen-Image', id: 'qwen-image' }); assert.equal(g.r.estimate.usd, 0); assert.equal(g.r.actual, null);
  show('sample (run_on fal, no key)', g.r);
  ok(`generate_image run_on fal (no key): notice "${g.r.notice.slice(0, 70)}…"`);
  for (const [tool, args] of [['get_job', { id: g.r.id }], ['wait_for_job', { id: g.r.id, timeout_sec: 5 }], ['job_status', { id: g.r.id }]] as const) {
    const x = await nokey.call(tool, args); assert.equal(x.r.sample, true, tool); assert.match(x.r.sampleReason, /No fal key/, tool); assert.equal(x.r.place.runOn, 'fal', tool);
    assert.equal(x.r.feature, 'Create Image · Qwen-Image', tool); assert.equal(x.r.workflow?.author, 'Comfy Org', tool); assert.ok(!('raw' in x.r) && JSON.stringify(x.r).length < 3000, `${tool}: compact`); }
  ok('get_job / wait_for_job / job_status: sample:true + reason, place fal, feature label, workflow credit; compact (< 3 KB)');
  const nw = await nokey.call('generate_image', { prompt: 'a lighthouse', model: 'qwen-image', run_on: 'fal', wait: false });
  assert.ok(nw.r.submitted?.id); assert.match(nw.r.notice, /run_on "fal".*sample/); assert.equal(nw.r.job.sample, true); assert.match(nw.r.next, /wait_for_job \(or get_job\)/);
  ok('wait:false reply also carries the sample notice and points at wait_for_job / get_job');

  // ---- mock backend with keys: still a sample (nothing real), with the place label and the Comfy estimate ----
  // a paid legacy call is priced first (audit 2026-11-01 #6): the first call answers the price + quote_id and starts nothing, the second runs it
  const cArgs = { prompt: 'a ceramic mug', model: 'nano-banana-2', run_on: 'comfy-cloud' };
  const c0 = await keys.call('generate_image', cArgs); assert.equal(c0.r.refused, true, text(c0.raw)); assert.equal(c0.r.charged, false); assert.match(c0.r.quote_id, /^q_/);
  const c = await keys.call('generate_image', { ...cArgs, quote_id: c0.r.quote_id });
  const again = await keys.call('generate_image', { ...cArgs, quote_id: c0.r.quote_id }); assert.equal(again.r.refused, true); assert.match(again.r.reason, /already used/);
  ok('generate_image (paid): priced first with a quote_id, runs with it, and the same quote_id cannot start a second run');
  assert.equal(c.r.status, 'done', text(c.raw)); assert.equal(c.r.sample, true); assert.match(c.r.sampleReason, /sample mode \(mock backend\)/); assert.match(c.r.notice, /run_on "comfy-cloud"/);
  assert.deepEqual(c.r.place, { runOn: 'comfy-cloud', label: 'Comfy · Comfy Router' }); assert.deepEqual(c.r.model, { name: 'Nano Banana 2', id: 'nano-banana-2' });
  assert.ok(c.r.estimate.usd > 0 && c.r.estimate.comfyCredits > 0 && c.r.estimate.billedTo === 'Comfy', JSON.stringify(c.r.estimate));
  ok(`mock backend: sample:true (mock backend reason), place "${c.r.place.label}", estimate $${c.r.estimate.usd} = ${c.r.estimate.comfyCredits} Comfy credits`);

  // ---- 2. a real (stub) job: the same server JSON with a reported actual cost and no sample ----
  const realJob = { ...(await getJ(P_KEYS, `/api/jobs/${c.r.id}`)), id: 'job_real', isSample: false, sampleReason: null, demo: false };
  realJob.spend = { ...realJob.spend, simulated: false, actualUsd: 0.067, actualSource: 'comfy-router settled', countedUsd: 0.067 };
  stub = createServer((req, res) => { const m = req.url?.match(/^\/api\/jobs\/([^/?]+)/);
    if (m && m[1] === 'job_real') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(realJob)); return; }
    res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'not found' })); });
  await new Promise<void>((r) => stub!.listen(P_STUB, '127.0.0.1', () => r()));
  const st = await mcpFor(P_STUB, `http://127.0.0.1:${P_STUB}`); const real = await st.call('get_job', { id: 'job_real' });
  assert.equal(real.r.sample, false); assert.equal(real.r.sampleReason, undefined); assert.deepEqual(real.r.model, { name: 'Nano Banana 2', id: 'nano-banana-2' });
  assert.deepEqual(real.r.place, { runOn: 'comfy-cloud', label: 'Comfy · Comfy Router' }); assert.equal(real.r.estimate.usd, c.r.estimate.usd); assert.deepEqual(real.r.actual, { usd: 0.067, source: 'comfy-router settled' });
  assert.equal(real.r.feature, 'Create Image · Nano Banana 2'); assert.match(real.r.result_url, /^http:\/\/web\.example:5174\/files\//);
  show('real (stub) job', real.r);
  ok(`real (stub) job: sample:false, model ${real.r.model.name}, place ${real.r.place.label}, estimate $${real.r.estimate.usd}, actual $${real.r.actual.usd}`);
  const missing = await st.call('get_job', { id: 'nope' }); assert.equal(missing.raw.isError, true); assert.match(text(missing.raw), /404/);

  // ---- 3. a failed job: error {message, code, next} + tryOn with prices ----
  const pre = await getJ(P_KEYS, '/api/models/quote?toolId=create-image&model=qwen-image&runOn=local'); assert.equal(pre.runOn, 'local', JSON.stringify(pre).slice(0, 200));
  const fd = new FormData(); for (const [k, v] of Object.entries({ prompt: 'a lighthouse', rights: '1', types: '["generate"]', model: 'qwen-image', runOn: 'local', simulateRouteFail: pre.route })) fd.append(k, v);
  const sub = (await (await fetch(`${B(P_KEYS)}/api/tools/create-image/jobs`, { method: 'POST', body: fd })).json()) as any; assert.ok(sub.id, JSON.stringify(sub));
  const f = await keys.call('wait_for_job', { id: sub.id, timeout_sec: 60 });
  assert.equal(f.r.status, 'failed', JSON.stringify(f.r).slice(0, 300)); assert.equal(f.raw.isError, true); assert.ok(f.r.error?.message && f.r.error.code && f.r.error.next, JSON.stringify(f.r.error));
  assert.ok(Array.isArray(f.r.tryOn) && f.r.tryOn.length >= 1, JSON.stringify(f.r.tryOn)); assert.ok(f.r.tryOn.every((o: any) => o.run_on !== 'local' && typeof o.usd === 'number' && o.label), JSON.stringify(f.r.tryOn));
  assert.match(f.r.error.next, /tryOn/);
  show('failed job', f.r);
  ok(`failed job: error.code ${f.r.error.code}, next "${f.r.error.next.slice(0, 50)}…", tryOn ${f.r.tryOn.map((o: any) => `${o.label} $${o.usd}`).join(', ')}`);

  // ---- 4. wait_for_job timeout: still running, and what to do next ----
  await fetch(`${B(P_KEYS)}/api/dev/mock-delay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ms: 20_000 }) });
  const slow = await keys.call('generate_image', { prompt: 'a slow lighthouse', model: 'qwen-image', run_on: 'local', wait: false }); assert.ok(slow.r.submitted?.id, JSON.stringify(slow.r));
  const t = await keys.call('wait_for_job', { id: slow.r.submitted.id, timeout_sec: 1 });
  assert.ok(['queued', 'running'].includes(t.r.status), t.r.status); assert.equal(t.raw.isError, false);
  assert.match(t.r.next, new RegExp(`Call get_job with id "${slow.r.submitted.id}".*keeps running|keeps running.*Call get_job with id "${slow.r.submitted.id}"`));
  const t2 = await keys.call('get_job', { id: slow.r.submitted.id, wait: true, timeout_sec: 1 }); assert.match(t2.r.next, /keeps running/);
  const t3 = await keys.call('get_job', { id: slow.r.submitted.id }); assert.equal(t3.r.next, undefined, 'no wait → no timeout hint');
  { const pi = t3.r.progressInfo; assert.ok(pi && ['queued', 'loading', 'generating', 'finishing'].includes(pi.stage), JSON.stringify(pi)); assert.equal(pi.source, 'mock'); assert.equal(typeof pi.line, 'string');
    assert.ok(!('previewUrl' in pi) && JSON.stringify(pi).length < 200, 'compact progress, no preview link'); assert.equal(g.r.progressInfo, undefined, 'finished job: no progressInfo'); }
  await fetch(`${B(P_KEYS)}/api/jobs/${slow.r.submitted.id}/cancel`, { method: 'POST' }).catch(() => null);
  show('wait_for_job timeout', t.r);
  ok(`wait_for_job timeout: status ${t.r.status}, next "${t.r.next.slice(0, 80)}…"`);
  console.log('\nall job-view checks passed');
} finally {
  for (const c of clients) await c.close().catch(() => null);
  stub?.close();
  for (const p of procs) { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } }
}
