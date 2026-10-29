// Runnable gate (Oct 18, plan change 4 / conflict 1): with a (fake) COMFY_API_KEY set, routes that only have the mock executor (Comfy partner
// nodes / Router, Comfy Cloud API nodes, Comfy Cloud workflows without the runner) report reason 'not available on this server yet' / reasonCode 'not_wired':
// Auto never picks them, a pinned submit is 409 route_not_runnable, nothing is charged. Keyless, the demo preview still works (free).
// Two throwaway servers (:8957 keyed, :8958 keyless), temp data dirs, mock backend. Run: npx tsx test/runnable-gate.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '0'; // these checks cover the held state (cloud runs before a measured price are allowed by default since 2026-10-27)
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const procs: any[] = []; const dirs: string[] = [];
async function boot(port: number, extra: Record<string, string>) {
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-')); dirs.push(D);
  const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, ...extra, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json') } });
  procs.push(p); const B = `http://localhost:${port}`;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) return B; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  throw new Error(`server :${port} did not start`);
}
const j = async (r: Response) => ({ status: r.status, body: (await r.json()) as any });
const balance = async (B: string) => { const b = (await (await fetch(`${B}/api/ledger`)).json() as any).balance; assert.equal(typeof b, 'number'); return b as number; };
const submit = async (B: string, tool: string, fields: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', ...fields })) fd.append(k, v); return j(await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd })); };
const ok = (m: string) => console.log('ok ' + m);
try {
  const K = await boot(testPort(8957), { COMFY_API_KEY: 'fake-comfy-key-for-tests' });
  // every model, every tool: the Auto pick (defaultRoute / first runnable) is never a not_wired route
  const all = (await (await fetch(`${K}/api/routes`)).json() as any).routes as any[];
  let nw = 0;
  for (const m of all) for (const o of m.routes ?? []) if (o.reasonCode === 'not_wired') { nw++; assert.equal(o.available, false);
    // 2026-10-22 (honest Coming soon): a coming-soon route also reports not_wired, with its own reason (reasonDetail 'coming soon: <reason>')
    if (String(o.reasonDetail ?? '').startsWith('coming soon: ')) assert.equal(o.reasonDetail, `coming soon: ${o.reason}`, JSON.stringify(o)); else assert.equal(o.reason, 'not ready in this app yet'); assert.notEqual(m.defaultRoute, o.routeId, `${m.toolId}/${m.modelId} Auto default is a not_wired route`); }
  assert.ok(nw >= 1, `expected keyed mock-only routes (Comfy Cloud API nodes: cloud-h3, cloud-minimax-music…), got ${nw}`); // Router-wired partner models are runnable now (router-runner.e2e)
  const cw = all.find((m) => m.modelId === 'cloud-h3-wf').routes[0]; // the workflow route has the real runner (wired, never not_wired); since the Comfy audit (2026-10-24) real runs stay off until a measured run sets its GPU-time price
  assert.equal(cw.wired, true, JSON.stringify(cw)); assert.notEqual(cw.reasonCode, 'not_wired'); assert.equal(cw.available, false); assert.match(cw.reason, /^Off until we can show you its exact price/);
  ok(`keyed: ${nw} mock-only routes report not_wired, none is an Auto default; cloud-h3-wf wired, held until its price is measured`);
  const b0 = await balance(K);
  const q = await j(await fetch(`${K}/api/tools/h3-video/price?provider=cloud-h3&duration=8&types=t2v`)); assert.equal(q.status, 200);
  assert.equal(q.body.runnable, false); assert.equal(q.body.reasonCode, 'not_wired'); assert.equal(q.body.demo, false);
  const a = await submit(K, 'h3-video', { provider: 'cloud-h3', duration: '8', prompt: 'a paper boat', types: '["t2v"]' }); assert.equal(a.status, 409, JSON.stringify(a.body)); assert.match(a.body.error, /isn’t ready yet\. Pick another model/); assert.doesNotMatch(a.body.error, /wired/); assert.match(a.body.error, /Nothing was charged/);
  const pin = await submit(K, 'h3-video', { provider: 'cloud-h3', route: 'comfy-cloud:cloud-h3', duration: '8', prompt: 'a paper boat', types: '["t2v"]' }); assert.equal(pin.status, 409, JSON.stringify(pin.body));
  assert.equal(pin.body.code ?? pin.body.errorCode ?? pin.body.reasonCode, 'route_not_runnable', JSON.stringify(pin.body));
  const os2 = await submit(K, 'object-swap', { provider: 'router-seedance', prompt: 'x' }); assert.ok([400, 409].includes(os2.status), JSON.stringify(os2.body));
  const jobs = (await (await fetch(`${K}/api/jobs`)).json() as any); const list = Array.isArray(jobs) ? jobs : jobs.jobs ?? [];
  assert.equal(list.filter((x: any) => /router|api-|cloud-h3$/.test(String(x.route ?? x.routing?.order?.[0] ?? ''))).length, 0, 'no job created on a mock-only route');
  assert.equal(await balance(K), b0, 'nothing charged');
  ok('keyed: Auto on a mock-only model → 409 not wired (quote runnable:false, reasonCode not_wired); pinned → 409 route_not_runnable; no job, balance unchanged');
  const N = await boot(testPort(8958), {});
  const dq = await j(await fetch(`${N}/api/tools/h3-video/price?provider=router-veo&duration=8&types=t2v`)); assert.equal(dq.status, 200); assert.equal(dq.body.demo, true, JSON.stringify(dq.body)); assert.equal(dq.body.credits, 0);
  const nb0 = await balance(N); const d = await submit(N, 'h3-video', { provider: 'router-veo', duration: '8', prompt: 'a paper boat', types: '["t2v"]', quotedRouteId: dq.body.routeId, quotedCredits: '0' });
  assert.equal(d.status, 200, JSON.stringify(d.body)); assert.equal(d.body.cost, 0); assert.equal(await balance(N), nb0);
  ok('keyless: the same route is a sample output (quote demo:true 0 credits, submit 200, cost 0)');
  console.log('ALL OK runnable-gate');
} finally { for (const p of procs) { try { process.kill(-p.pid, 'SIGTERM'); } catch { /* gone */ } } for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); }
