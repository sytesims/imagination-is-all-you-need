// Quotes include the prompt, and the price allowance (2026-11-07). GPT Image 2.5 Flare bills prompt text, so its price follows the prompt length.
//  - a quote without the prompt says promptDependent:true (a starting price) on /api/models/quote and /api/tools/create-image/price;
//  - a quote with the prompt = the submit's charge (one pricing function, the same inputs);
//  - a submit quoted a few credits low (the no-prompt quote) goes through (within 5¢) and is charged the real price;
//  - a submit quoted 20 % low on a big price asks again (409 route_changed, the fresh quote priced WITH the prompt, nothing charged), also for a
//    prompt too long for the fresh quote's query string;
//  - the compare quote prices with the prompt;
//  - MCP: quote → run with a long prompt is not refused.
// One mock-backend server with a FAKE api.comfy.org (fake key, no network, no spend).
// Run: npx tsx test/quote-prompt-allowance.e2e.ts (MCP leg needs mcp/dist: npm run mcp:build)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import http from 'node:http'; import os from 'node:os'; import path from 'node:path'; import { randomUUID } from 'node:crypto';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'quote-prompt-'));
const KEY = 'test-not-a-real-key'; const PORT_FAKE = testPort(9681); const FAKE = `http://127.0.0.1:${PORT_FAKE}`; const PORT = testPort(9682);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_GEMINI_API_KEY: '', OPENHIGGSFIELD_OPENAI_API_KEY: '' };
const ok = (m: string) => console.log('ok ' + m);
Object.assign(process.env, NOKEYS, { OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(D, 'unit-')), OPENHIGGSFIELD_BACKEND: 'mock' });
const OUT = (() => { const f = path.join(D, 'out.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=64x64', '-frames:v', '1', f]); return fs.readFileSync(f).toString('base64'); })();
const P = await import('../src/shared/pricing.ts');

// ---------------- fake api.comfy.org ----------------
const calls: { model: string; body: any }[] = []; const reqs = new Map<string, { model: string }>();
const fake = http.createServer(async (req, res) => {
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); const raw = Buffer.concat(chunks).toString();
  const send = (code: number, o: any, h: Record<string, string> = {}) => { res.writeHead(code, { 'content-type': 'application/json', 'x-comfy-request-id': randomUUID(), ...h }); res.end(JSON.stringify(o)); };
  if (req.headers['x-api-key'] !== KEY) return send(401, { detail: 'no usable credential', error_type: 'unauthorized' }, { 'x-comfy-error-type': 'unauthorized' });
  let m = /^\/v2\/models\/([^/]+)\/([^/?]+)(\/estimate|\/requests)?(?:\?fallback_provider=false)?$/.exec(req.url!);
  if (m && req.method === 'POST') { const model = `${m[1]}/${m[2]}`;
    if (m[3] === '/estimate') return send(200, { source: 'exact', currency: 'USD', amount: '0.0100', amount_cents: 1, credits: 2.11, provider: m[1], model });
    const id = randomUUID(); calls.push({ model, body: JSON.parse(raw || '{}') }); reqs.set(id, { model }); const base = `${FAKE}/v2/models/${m[1]}/${m[2]}/requests/${id}`;
    return send(201, { request_id: id, status: 'IN_QUEUE', status_url: `${base}/status`, response_url: base, cancel_url: `${base}/cancel` }); }
  m = /^\/v2\/models\/[^/]+\/[^/]+\/requests\/([^/]+)(\/status|\/cancel)?$/.exec(req.url!);
  if (m) { if (!reqs.get(m[1])) return send(404, { detail: 'x', error_type: 'request_not_found' });
    if (m[2] === '/status') return send(200, { request_id: m[1], status: 'COMPLETED' }, { 'retry-after': '1' });
    return send(200, { created: 1, data: [{ b64_json: OUT }], usage: { input_tokens: 40, output_tokens: 443, total_tokens: 483 } }, { 'x-comfy-credits-used': '5' }); }
  send(404, { detail: 'unknown', error_type: 'model_not_found' });
});
await new Promise<void>((r) => fake.listen(PORT_FAKE, '127.0.0.1', r));
let proc: ChildProcess | null = null; let mcpClose: (() => Promise<void>) | null = null;
const DD = fs.mkdtempSync(path.join(D, 'data-')); const B = `http://localhost:${PORT}`;
const J = async (r: Response) => ({ status: r.status, body: (await r.json()) as any });
const get = async (u: string) => J(await fetch(B + u));
const post = async (f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', ...f })) fd.append(k, v); return J(await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd })); };
const until = async (id: string) => { for (let i = 0; i < 600; i++) { const j = (await get(`/api/jobs/${id}`)).body; if (['done', 'failed', 'canceled', 'blocked', 'needs_decision'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 50)); } throw new Error('timeout ' + id); };
const balance = async () => (await get('/api/ledger')).body.balance as number;
let err = '';
try {
  proc = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ...NOKEYS, COMFY_API_KEY: KEY, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DD, OPENHIGGSFIELD_ENV_FILE: path.join(DD, 'sandbox.env'),
    OPENHIGGSFIELD_BILLING_MODE: 'team', OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(DD, 'nofilm.json'),
    OPENHIGGSFIELD_COMFY_ROUTER_URL: FAKE, OPENHIGGSFIELD_ROUTER_RETRY_SCALE: '0.02', OPENHIGGSFIELD_ROUTING_TIMEOUT_MS: '3000', OPENHIGGSFIELD_MAX_QUEUED: '500' } });
  proc.stderr!.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); });
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  const MODEL = 'api-gpt-image-25-flare'; const route = `comfy-router:${MODEL}`;
  const set = { types: '["generate"]', aspect: '16:9', quality: 'high', n: '2' };
  const prompt = 'a lighthouse on a cliff at dusk, waves, gulls, warm light, film grain, '.repeat(30); const pb = Buffer.byteLength(prompt); // ~2 KB
  const want = (bytes: number | undefined, s: { aspect: string; tier: string; res?: string; n: number }) => P.priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: MODEL, tier: s.tier, imageRes: s.res ?? '1K', aspect: s.aspect, promptBytes: bytes, count: s.n }).credits;

  // ---- 1. a quote without the prompt is flagged; with it, it isn't ----
  const qs = (o: Record<string, string>) => new URLSearchParams({ provider: MODEL, route, ...set, ...o }).toString();
  const noP = await get(`/api/tools/create-image/price?${qs({})}`); assert.equal(noP.status, 200, JSON.stringify(noP.body));
  assert.equal(noP.body.promptDependent, true, 'no prompt → promptDependent'); assert.match(noP.body.promptNote, /longer prompt adds a little/);
  const noPm = await get(`/api/models/quote?${new URLSearchParams({ model: MODEL, route, aspect: '16:9', quality: 'high', n: '2', mode: 'generate' })}`); assert.equal(noPm.status, 200, JSON.stringify(noPm.body));
  assert.equal(noPm.body.promptDependent, true, '/api/models/quote too'); assert.equal(noPm.body.credits, noP.body.credits);
  const withP = await get(`/api/tools/create-image/price?${qs({ prompt })}`); assert.equal(withP.status, 200); assert.equal(withP.body.promptDependent, undefined, 'with the prompt: exact, no flag');
  const withPb = await get(`/api/models/quote?${new URLSearchParams({ model: MODEL, route, aspect: '16:9', quality: 'high', n: '2', mode: 'generate', promptBytes: String(pb) })}`); assert.equal(withPb.body.promptDependent, undefined, 'promptBytes counts as the prompt');
  assert.equal(withP.body.credits, want(pb, { aspect: '16:9', tier: 'high', n: 2 }), 'quote with the prompt = the shared formula'); assert.equal(withPb.body.credits, withP.body.credits);
  assert.ok(withP.body.credits > noP.body.credits, `the long prompt costs more (${withP.body.credits} > ${noP.body.credits})`);
  const nonGpt = await get(`/api/models/quote?${new URLSearchParams({ model: 'api-nano-banana-2', aspect: '16:9', n: '1' })}`); if (nonGpt.status === 200) assert.equal(nonGpt.body.promptDependent, undefined, 'a per-image model is never flagged');
  ok(`promptDependent: no prompt → ${noP.body.credits} credits, flagged; with the prompt ${withP.body.credits} (= the formula), not flagged`);

  // ---- 2. quote with the prompt = charge ----
  { const b0 = await balance(); const s = await post({ provider: MODEL, route, prompt, ...set, quotedRouteId: route, quotedCredits: String(withP.body.credits) }); assert.equal(s.status, 200, JSON.stringify(s.body));
    const d = await until(s.body.id); assert.equal(d.status, 'done', `${d.error} ${err.slice(-600)}`); assert.equal(b0 - await balance(), withP.body.credits, 'charge = the quote with the prompt'); }
  ok('quote with the prompt = the submit charge');

  // ---- 3. quoted a little low (the no-prompt quote, ≤ 5¢ under): goes through, charged the real price ----
  { const gap = withP.body.credits - noP.body.credits; assert.ok(gap > 0 && gap <= 5, `gap ${gap} within 5¢`);
    const b0 = await balance(); const s = await post({ provider: MODEL, route, prompt, ...set, quotedRouteId: route, quotedCredits: String(noP.body.credits) }); assert.equal(s.status, 200, `within the allowance: ${JSON.stringify(s.body)}`);
    const d = await until(s.body.id); assert.equal(d.status, 'done'); assert.equal(b0 - await balance(), withP.body.credits, 'charged the real price, not the quote'); assert.equal(d.cost ?? d.credits ?? withP.body.credits, withP.body.credits, 'the job shows the real price'); }
  ok(`quoted ${noP.body.credits}, real ${withP.body.credits}: runs without asking, charged ${withP.body.credits}`);

  // ---- 4. a big price (over $1, where 10 % is more than 5¢): 20 % low asks; 9 % low runs ----
  { const big = { types: '["generate"]', aspect: '1:1', quality: 'high', imageResolution: '4K', n: '4' };
    const q = await get(`/api/tools/create-image/price?${new URLSearchParams({ provider: MODEL, route, ...big, prompt })}`); assert.equal(q.status, 200); const c = q.body.credits as number; assert.ok(c >= 100, `a big price (${c} credits)`);
    const low20 = Math.floor(c / 1.2); const b0 = await balance(); const calls0 = calls.length;
    const r = await post({ provider: MODEL, route, prompt, ...big, quotedRouteId: route, quotedCredits: String(low20) }); assert.equal(r.status, 409, JSON.stringify(r.body).slice(0, 400));
    assert.equal(r.body.code, 'route_changed'); assert.equal(r.body.charged, false); assert.equal(r.body.calm, true); assert.equal(r.body.credits, c); assert.equal(r.body.quote.credits, c, 'the fresh quote is priced with the prompt'); assert.equal(r.body.quote.promptDependent, undefined);
    assert.equal(await balance(), b0, 'nothing charged'); assert.equal(calls.length, calls0, 'nothing sent');
    const low9 = Math.ceil(c / 1.09); const s = await post({ provider: MODEL, route, prompt, ...big, quotedRouteId: route, quotedCredits: String(low9) }); assert.equal(s.status, 200, `+9 % runs: ${JSON.stringify(s.body).slice(0, 300)}`); await until(s.body.id);
    ok(`big price ${c} credits: quoted ${low20} (+20 %) → 409 with the fresh quote ${c}, nothing charged; quoted ${low9} (+9 %) → runs`); }

  // ---- 5. a prompt too long for the fresh quote's query (> 4000 bytes) still prices its length ----
  { const huge = 'an extremely detailed scene description with many objects and lights, '.repeat(90); const hb = Buffer.byteLength(huge); assert.ok(hb > 4000);
    const exact = want(hb, { aspect: '16:9', tier: 'high', n: 2 }); const r = await post({ provider: MODEL, route, prompt: huge, ...set, quotedRouteId: route, quotedCredits: String(Math.max(0, Math.min(exact - 6, Math.floor(exact / 1.11) - 1))) });
    assert.equal(r.status, 409, JSON.stringify(r.body).slice(0, 300)); assert.equal(r.body.credits, exact); assert.equal(r.body.quote.credits, exact, `fresh quote ${r.body.quote.credits} = the real ${exact} (prompt counted)`);
    ok(`a ${hb}-byte prompt: the 409's fresh quote = ${exact} (its length counted)`); }

  // ---- 6. the compare quote prices with the prompt ----
  { const cq = async (body: any) => J(await fetch(`${B}/api/compare/quote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    const a = await cq({ models: [MODEL], aspect: '16:9', quality: 'high', n: 2, mode: 'generate', preview: true }); const b = await cq({ models: [MODEL], aspect: '16:9', quality: 'high', n: 2, mode: 'generate', preview: true, promptBytes: pb });
    assert.equal(a.status, 200, JSON.stringify(a.body)); const ra = a.body.rows[0], rb = b.body.rows[0]; assert.ok(ra.ok && rb.ok, JSON.stringify(a.body.rows));
    assert.equal(rb.credits, withP.body.credits, 'compare row with promptBytes = the submit price'); assert.equal(ra.credits, noP.body.credits);
    ok(`compare quote: ${ra.credits} without the prompt, ${rb.credits} with it`); }

  // ---- 7. MCP: quote → run with a long prompt is not refused ----
  { const dist = path.resolve(ROOT, '../mcp/dist/index.js');
    if (!fs.existsSync(dist)) console.log('skip MCP leg: build mcp first (npm run mcp:build)');
    else { const SDK = path.resolve(ROOT, '../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client');
      const { Client } = await import(path.join(SDK, 'index.js')); const { StdioClientTransport } = await import(path.join(SDK, 'stdio.js'));
      const c = new Client({ name: 'quote-prompt', version: '1' }); await c.connect(new StdioClientTransport({ command: process.execPath, args: [dist], env: { ...process.env, OPENHIGGSFIELD_API: B, OPENHIGGSFIELD_MCP_POLL_MS: '200', OPENHIGGSFIELD_MCP_SPEND: 'allow' } as Record<string, string> }));
      mcpClose = () => c.close();
      const parse = (r: any) => JSON.parse(r.content.find((x: any) => x.type === 'text').text);
      const args = { tool_id: 'create-image', fields: { prompt, types: ['generate'], aspect: '16:9', quality: 'high', n: 2 }, model: MODEL, route };
      const q = parse(await c.callTool({ name: 'quote', arguments: args })); assert.ok(q.quote_id, JSON.stringify(q).slice(0, 400)); assert.equal(q.credits, withP.body.credits, 'the MCP quote counts the prompt'); assert.equal(q.promptDependent, undefined);
      const b0 = await balance(); const rr: any = await c.callTool({ name: 'run', arguments: { ...args, quote_id: q.quote_id, wait_sec: 60 } }, undefined, { timeout: 120_000 }); const r = parse(rr);
      assert.ok(!rr.isError && !r.refused, `MCP run refused: ${JSON.stringify(r).slice(0, 400)}`); assert.equal(r.status, 'done', JSON.stringify(r).slice(0, 300)); assert.equal(b0 - await balance(), withP.body.credits);
      const q0 = parse(await c.callTool({ name: 'quote', arguments: { ...args, fields: { types: ['generate'], aspect: '16:9', quality: 'high', n: 2 } } })); assert.equal(q0.promptDependent, true, 'a prompt-less MCP quote says so');
      ok(`MCP: quote ${q.credits} (prompt counted) → run done, charged the quote; a quote without a prompt says promptDependent`); } }
  console.log('ALL OK quote-prompt-allowance');
} catch (e) { console.error(err.slice(-3000)); throw e; } finally {
  try { await mcpClose?.(); } catch { /* gone */ }
  if (proc?.pid) { try { process.kill(-proc.pid, 'SIGTERM'); } catch { /* gone */ } }
  fake.close(); setTimeout(() => process.exit(process.exitCode ?? 0), 300).unref();
}
