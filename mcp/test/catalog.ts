/**
 * The MCP server can't fall behind the app (drift test) and the studio tools work end to end, over a real stdio MCP client running mcp/src (tsx).
 *  1. Every tool the server registers (GET /api/tools) is in run's tool_id list, describable with describe (schema = its inputs),
 *     and in the generated snapshot (src/catalog.snapshot.ts; `npm run gen:catalog` refreshes it). A new server tool fails here until it is covered.
 *  2. Every API path the MCP server calls (catalog.ts API_PATHS) is in the server's /api/openapi.json.
 *  3. Every MCP tool (all toolsets) is in the README; annotations, structured output, prompts (one per skill) and resources are there.
 *  4. Flow on the mock backend: search_capabilities, describe, quote (compare, quote_id), run (quote_id handshake, max_usd, budget_id,
 *     client_request_id replay, from_job), status, get_outputs, history, cancel, upload, recipe export/import/share, budget, library tools.
 * Boots an isolated mock API (temp data dir, port CATALOG_PORT or 8842) unless OPENHIGGSFIELD_API points at one (mock only; it writes jobs).
 * Run: npm run test:catalog
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_SNAPSHOT } from '../src/catalog.snapshot.js';
import { API_PATHS } from '../src/catalog.js';
import { READ_ONLY } from '../src/permissions.js';
import { TOOLSETS } from '../src/toolsets.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)); const SERVER = path.resolve(HERE, '../../server'); const MCP = path.resolve(HERE, '..');
const ok = (m: string) => console.log('ok ' + m);
let api: ChildProcess | null = null;
const API = await (async () => {
  if (process.env.OPENHIGGSFIELD_API) return process.env.OPENHIGGSFIELD_API.replace(/\/$/, '');
  const port = Number(process.env.CATALOG_PORT) || 8842; const url = `http://localhost:${port}`;
  if (await fetch(`${url}/api/health`).then(() => true, () => false)) throw new Error(`:${port} is in use; set CATALOG_PORT to a free port`);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ohf-mcp-catalog-'));
  api = spawn('npx', ['tsx', 'src/index.ts'], { cwd: SERVER, detached: true, stdio: 'ignore', env: { ...process.env, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: d, OPENHIGGSFIELD_ENV_FILE: path.join(d, 'x.env'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '80', OPENHIGGSFIELD_AGENT_BUDGET_USD: '', OPENHIGGSFIELD_AGENT_BUDGET_ID: '' } });
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${url}/api/health`)).ok) return url; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error(`mock API on :${port} did not start`);
})();
const getJ = async (u: string) => (await (await fetch(API + u)).json()) as any;
const text = (r: any) => r.content?.find((c: any) => c.type === 'text')?.text ?? '';
const parse = (r: any) => { try { return JSON.parse(text(r)); } catch { return text(r); } };

const client = new Client({ name: 'ohf-catalog', version: '1' });
try {
  const health = await getJ('/api/health'); assert.equal(health.backend, 'mock', 'this test only runs against a mock backend');
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(MCP, 'node_modules/tsx/dist/cli.mjs'), path.join(MCP, 'src/index.ts')], cwd: MCP,
    env: { ...process.env, OPENHIGGSFIELD_API: API, OPENHIGGSFIELD_MCP_POLL_MS: '200', PUBLIC_WEB_URL: 'http://web.example:5174', OPENHIGGSFIELD_MCP_PERMISSIONS: '', OPENHIGGSFIELD_MCP_DEFAULT: 'allow', OPENHIGGSFIELD_MCP_SPEND: '', OPENHIGGSFIELD_MCP_ASK: '',
      OPENHIGGSFIELD_MCP_TOOLSETS: 'core,library,admin', OPENHIGGSFIELD_AGENT_BUDGET_USD: '', OPENHIGGSFIELD_AGENT_BUDGET_ID: '' } as Record<string, string> }));
  const call = async (name: string, args: Record<string, unknown> = {}) => { const raw: any = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 }); return { raw, r: parse(raw), err: !!raw.isError }; };
  const mcpTools = (await client.listTools()).tools;

  // ---- 1. drift: every server tool is covered ----
  const live: any[] = await getJ('/api/tools'); const liveIds = live.map((t) => t.id).sort();
  const snap = TOOL_SNAPSHOT.map((t) => t.id).sort();
  const missingSnap = liveIds.filter((id) => !snap.includes(id)); const extraSnap = snap.filter((id) => !liveIds.includes(id));
  assert.deepEqual({ missingSnap, extraSnap }, { missingSnap: [], extraSnap: [] }, 'src/catalog.snapshot.ts is stale: run `OPENHIGGSFIELD_API=<a running API> npm run gen:catalog --prefix mcp`');
  const runTool: any = mcpTools.find((t) => t.name === 'run'); const en: string[] = runTool?.inputSchema?.properties?.tool_id?.enum ?? [];
  const missing = liveIds.filter((id) => !en.includes(id)); assert.deepEqual(missing, [], `server tools missing from MCP run: ${missing.join(', ')}`);
  ok(`all ${liveIds.length} server tools are in run's tool_id list and the snapshot`);
  for (const t of live) {
    const d = await call('describe', { id: t.id }); assert.equal(d.err, false, `${t.id}: ${text(d.raw)}`);
    assert.equal(d.r.id, t.id); assert.deepEqual(Object.keys(d.r.fields.properties).sort(), [...new Set((t.inputs ?? []).map((i: any) => i.name))].sort(), `${t.id}: schema = inputs`);
    assert.equal(d.r.models.length, (t.models ?? []).length, `${t.id}: every model`);
  }
  ok('describe works for every server tool (field schema = the tool inputs, every model listed)');
  const motion = await call('describe', { id: 'motion-transfer' });
  assert.ok(!motion.r.models.some((m: any) => m.model === 'minimax-h3-character-swap'), 'H3 cannot reappear in Motion discovery');
  const swaps = await call('search_capabilities', { query: 'swap', kind: 'tool' });
  assert.ok(!swaps.r.tools.some((t: any) => t.id === 'two-person-swap'), 'history-only two-person tool is not newly discovered');
  assert.equal((await call('describe', { id: 'two-person-swap' })).r.id, 'two-person-swap', 'explicit legacy tool IDs still work');
  for (const req of [{ model: 'minimax-h3-character-swap' }, { fields: { provider: 'cloud-h3-charswap' } }, { route: 'comfy-cloud:cloud-h3-charswap' }]) {
    const q = await call('quote', { tool_id: 'motion-transfer', ...req });
    assert.ok(q.err || q.r.runnable === false, 'H3 motion quote cannot bypass the backend guard');
  }
  ok('hidden legacy swap stays explicitly addressable; Motion discovery and quote reject H3');
  const tooManyImages = await call('quote', { tool_id: 'create-image', model: 'gpt-image', run_on: 'comfy-cloud', fields: { prompt: 'edit', types: ['edit'], image: '/samples/sample-character.png', refs: Array(16).fill('/samples/sample-character.png') } });
  assert.ok(tooManyImages.err || tooManyImages.r.runnable === false, 'image quote counts the main image plus all extra references against the backend cap');
  ok('image quote rejects an over-limit main-photo + refs request before any upload');
  const bad = await call('describe', { id: 'transitionz' }); assert.equal(bad.err, true); assert.match(text(bad.raw), /Unknown id "transitionz"/); ok('describe on an unknown id says so');

  // ---- 2. every API path the MCP server calls exists ----
  const spec = await getJ('/api/openapi.json'); const gone = API_PATHS.filter((p) => !spec.paths?.[p]);
  assert.deepEqual(gone, [], `API paths used by the MCP server but missing from /api/openapi.json: ${gone.join(', ')}`);
  ok(`all ${API_PATHS.length} API paths the MCP server calls are in /api/openapi.json`);

  // ---- 3. docs, annotations, prompts, resources ----
  const readme = fs.readFileSync(path.join(MCP, 'README.md'), 'utf8'); const all = Object.values(TOOLSETS).flat();
  const undocumented = all.filter((n) => !readme.includes(`\`${n}\``)); assert.deepEqual(undocumented, [], `MCP tools missing from mcp/README.md: ${undocumented.join(', ')}`);
  for (const n of ['search_capabilities', 'describe', 'quote', 'status', 'get_outputs', 'history']) assert.ok(READ_ONLY.includes(n), `${n} should be read-only`);
  const ann = (n: string) => (mcpTools.find((t) => t.name === n) as any)?.annotations ?? {};
  assert.equal(ann('describe').readOnlyHint, true); assert.equal(ann('run').readOnlyHint, false); assert.equal(ann('run').openWorldHint, true); assert.equal(ann('cancel').destructiveHint, true);
  assert.ok((mcpTools.find((t) => t.name === 'quote') as any).outputSchema, 'core tools declare an outputSchema');
  const prompts = (await client.listPrompts()).prompts.map((p) => p.name); const skills = fs.readdirSync(path.join(MCP, '../skills')).filter((d) => fs.existsSync(path.join(MCP, '../skills', d, 'SKILL.md')));
  assert.ok(skills.length >= 5 && skills.every((k) => prompts.includes(k)), `a prompt per skill: ${prompts.join(', ')}`);
  const res = (await client.listResources()).resources.map((r) => r.uri); assert.ok(res.includes('imagination://catalog/tools') && res.includes('imagination://catalog/models'));
  const tr: any = await client.readResource({ uri: 'imagination://catalog/tools/h3-video' }); assert.ok(JSON.parse(tr.contents[0].text).fields.properties.types);
  ok(`README lists all ${all.length} tools; annotations + outputSchema; ${prompts.length} prompts (one per skill); catalogue/price resources`);

  // ---- 4. the studio flow ----
  const ov = await call('search_capabilities'); assert.equal(ov.r.backend, 'mock'); assert.equal(ov.r.real, false); assert.ok(ov.r.run_on.some((p: any) => p.id === 'local')); assert.ok(ov.raw.structuredContent?.backend === 'mock', 'structuredContent');
  const sc = await call('search_capabilities', { query: 'loop' }); assert.ok(sc.r.tools.length + sc.r.models.length + sc.r.workflows.length > 0);
  const fr = await call('search_capabilities', { query: 'free video', kind: 'model' }); assert.ok(fr.r.models.length > 0 && fr.r.models.every((m: any) => m.local));
  ok(`search_capabilities: overview (mock said plainly), "loop", "free video" → ${fr.r.models.map((m: any) => m.model).slice(0, 3).join(', ')}`);
  const h3 = await call('describe', { id: 'h3-video' }); const loopModel = h3.r.models.find((m: any) => m.limits?.loop === true);
  assert.ok(loopModel, 'a Generate Video model advertises loop (LTX-2.5 22B local)');
  const dm = await call('describe', { id: loopModel.model }); assert.equal(dm.r.kind, 'model'); assert.ok(dm.r.tools.includes('h3-video'));
  ok(`describe h3-video: loop on ${loopModel.name} (${loopModel.model}); describe ${loopModel.model} → model across ${dm.r.tools.length} tools`);
  // prompt grammar (read-only): describe a model gives its reference syntax and sources; the tool's models carry the short rule
  const kd = await call('describe', { id: 'kling-v3' }); assert.equal(kd.r.promptGrammar?.key, 'kling-v3', text(kd.raw)); assert.equal(kd.r.promptGrammar.refs.image, '<<<image_{n}>>>');
  assert.equal(kd.r.promptGrammar.maxChars, 2500); assert.ok(kd.r.promptGrammar.sources.every((x: any) => /^https:/.test(x.url))); assert.equal(kd.r.promptGrammar.code, undefined, 'no internal file refs');
  const kling = h3.r.models.find((m: any) => m.model === 'kling-v3'); assert.match(kling?.prompt?.refs ?? '', /<<<image_1>>>/);
  ok(`describe kling-v3 → promptGrammar (${kd.r.promptGrammar.tip.refs}); h3-video models carry prompt.refs`);
  const cmp = await call('quote', { tool_id: 'h3-video', fields: { prompt: 'x', types: ['t2v'], duration: '5' }, compare: true }); assert.equal(cmp.err, false, text(cmp.raw));
  const runnable = cmp.r.compare.filter((x: any) => x.runnable); assert.ok(runnable.every((x: any, i: number) => i === 0 || (x.usd ?? 1e9) >= (runnable[i - 1].usd ?? 1e9)), 'cheapest first');
  ok(`quote compare h3-video: ${cmp.r.compare.length} models, cheapest first`);
  const img = await call('run', { tool_id: 'create-image', fields: { prompt: 'a red ceramic mug on a desk', types: ['generate'] }, run_on: 'local', max_usd: 0 });
  assert.equal(img.err, false, text(img.raw)); assert.equal(img.r.status, 'done'); assert.equal(img.r.quote.free, true); assert.equal(img.r.place.runOn, 'local');
  ok(`run create-image local: free, no quote_id needed (${img.r.feature})`);
  const paid = runnable.find((x: any) => (x.usd ?? 0) > 0 && !x.adjusted); assert.ok(paid, 'mock keys give a paid quote');
  const req = { tool_id: 'h3-video', fields: { prompt: 'a lighthouse at dusk', types: ['t2v'], duration: '5' }, model: paid.model, run_on: paid.runOn };
  const noQ = await call('run', req); assert.equal(noQ.err, true); assert.equal(noQ.r.refused, true); assert.match(noQ.r.reason, /needs a quote_id/); ok('run: a paid job without quote_id is refused, nothing sent');
  const q1 = await call('quote', req); assert.match(q1.r.quote_id, /^q_/); assert.ok(q1.r.usd > 0);
  const other = await call('run', { ...req, fields: { ...req.fields, prompt: 'something else' }, quote_id: q1.r.quote_id }); assert.equal(other.err, true); assert.match(other.r.reason, /different request/); ok('run: a quote_id for another request is refused');
  const capped = await call('run', { ...req, quote_id: q1.r.quote_id, max_usd: 0 }); assert.equal(capped.r.refused, true); assert.match(capped.r.reason, /over max_usd/); ok('run: max_usd under the price is refused');
  const bud = await call('budget', { action: 'set', name: 'catalog-test', budget_usd: 0.01 }); assert.match(bud.r.budget_id, /\w/);
  const over = await call('run', { ...req, quote_id: q1.r.quote_id, budget_id: bud.r.budget_id }); assert.equal(over.err, true); assert.match(text(over.raw), /agent_budget|budget/); ok(`run with budget_id over the budget is refused by the server ($${q1.r.usd} > $0.01)`);
  const big = await call('budget', { action: 'set', name: 'catalog-test-2', budget_usd: 50 });
  const okRun = await call('run', { ...req, quote_id: q1.r.quote_id, budget_id: big.r.budget_id, client_request_id: 'catalog-1', wait_sec: 0 }); assert.equal(okRun.err, false, text(okRun.raw)); assert.ok(okRun.r.id);
  const replay = await call('run', { ...req, quote_id: q1.r.quote_id, budget_id: big.r.budget_id, client_request_id: 'catalog-1', wait_sec: 0 }); assert.equal(replay.r.id, okRun.r.id, 'same client_request_id → same job'); assert.ok(replay.r.replay);
  ok('run with quote_id + budget_id starts the paid job (a sample in mock); the same client_request_id returns that job instead of a second one');
  const reused = await call('run', { ...req, quote_id: q1.r.quote_id, budget_id: big.r.budget_id, wait_sec: 0 }); assert.equal(reused.r.refused, true, text(reused.raw)); assert.equal(reused.r.charged, false);
  assert.match(reused.r.reason, /already used to start job .*Get a new quote/); ok('run: a used quote_id (no matching client_request_id) is refused: one quote, one run');
  { // retry (library): a paid re-run needs a quote too; without quote_id it answers the price and starts nothing
    const fd = new FormData(); for (const [k, v] of Object.entries({ prompt: 'a lighthouse at dusk', rights: '1', types: '["t2v"]', duration: '5', model: paid.model, runOn: paid.runOn, simulateRouteFail: q1.r.route })) fd.append(k, String(v));
    const fj = (await (await fetch(`${API}/api/tools/h3-video/jobs`, { method: 'POST', body: fd })).json()) as any; assert.ok(fj.id, JSON.stringify(fj));
    for (let i = 0; i < 60 && (await getJ(`/api/jobs/${fj.id}`)).status !== 'failed'; i++) await new Promise((r) => setTimeout(r, 250));
    const before = (await getJ('/api/jobs?limit=500')).length ?? null;
    const r0 = await call('retry', { id: fj.id, wait_sec: 0 }); assert.equal(r0.r.refused, true, text(r0.raw)); assert.match(r0.r.quote_id, /^q_/); assert.ok(r0.r.price.usd > 0);
    if (before != null) assert.equal((await getJ('/api/jobs?limit=500')).length, before, 'a retry without quote_id starts nothing');
    const bad = await call('retry', { id: fj.id, quote_id: 'q_nope', wait_sec: 0 }); assert.equal(bad.r.refused, true);
    const r1 = await call('retry', { id: fj.id, quote_id: r0.r.quote_id, budget_id: big.r.budget_id, wait_sec: 0 }); assert.equal(r1.err, false, text(r1.raw)); assert.ok(r1.r.id && r1.r.id !== fj.id);
    ok(`retry: refused without a quote (price $${r0.r.price.usd}, nothing started), runs with its quote_id`); }
  if (okRun.r.poll_after_sec) assert.ok(okRun.r.poll_after_sec >= 2 && /status/.test(okRun.r.next));
  const st = await call('status', { id: okRun.r.id, wait_sec: 60 }); assert.equal(st.r.status, 'done', text(st.raw)); assert.equal(st.r.sample, true);
  const rec = await call('budget', { action: 'receipt', budget_id: big.r.budget_id }); assert.match(text(rec.raw), /Receipt: agent "catalog-test-2"/);
  ok('status waits to done (sample said); budget receipt by budget_id lists the run');
  const vid = await call('run', { tool_id: 'h3-video', fields: { prompt: 'slow push in', types: ['i2v'] }, from_job: img.r.id, run_on: 'local', model: loopModel.model, max_usd: 0, wait_sec: 120 });
  assert.equal(vid.err, false, text(vid.raw)); assert.equal(vid.r.status, 'done'); ok(`run from_job: the image went into Generate Video on ${vid.r.model.name}, free, no re-upload`);
  const out = await call('get_outputs', { id: img.r.id }); assert.ok(out.r.outputs.length && /^curl -L -o/.test(out.r.download[0]) && !out.raw.content.some((c: any) => c.type === 'image')); ok('get_outputs: links + curl lines, nothing inlined');
  const up = await call('upload', { base64: Buffer.from('fake').toString('base64'), filename: 'x.png' }); assert.ok(up.err || up.r.url); const up2 = await call('upload', { file: '/samples/sample-character.png' }); assert.match(up2.r.url ?? '', /^\/files\//); ok('upload: a file → /files/ URL');
  const lj = await call('history', { tool_id: 'create-image', limit: 5 }); assert.ok(lj.r.items.some((j: any) => j.id === img.r.id)); ok('history finds the run');
  const na = await call('next_actions', { id: img.r.id }); assert.ok(na.r.items.some((x: any) => x.tool_id === 'h3-video' && x.run.from_job === img.r.id)); ok('next_actions: tools that take the image, as run arguments');
  const rc = await call('recipe', { action: 'export', id: img.r.id, with_prompt: true }); assert.equal(rc.r.recipe.tool.id, 'create-image'); assert.match(rc.r.link, /^http:\/\/web\.example:5174\/r\?recipe=/);
  const ur = await call('recipe', { action: 'import', recipe: rc.r.link }); assert.equal(ur.err, false, text(ur.raw)); assert.equal(ur.r.run.tool_id, 'create-image'); assert.equal(ur.r.run.fields.prompt, 'a red ceramic mug on a desk');
  const again = await call('run', { ...ur.r.run, run_on: 'local', max_usd: 0 }); assert.equal(again.r.status, 'done', text(again.raw));
  ok('recipe export → link → import → run arguments + quote → the same recipe runs again');
  assert.equal((await call('recipe', { action: 'import', recipe: 'not a recipe at all' })).err, true);
  const sh = await call('recipe', { action: 'share', id: img.r.id }); assert.equal(sh.r.shared, true); assert.equal((await fetch(`${API}/s/${sh.r.token}/recipe.json`)).status, 200);
  await call('recipe', { action: 'unshare', id: img.r.id }); assert.equal((await fetch(`${API}/s/${sh.r.token}/recipe.json`)).status, 404); ok('recipe share gives a page + recipe.json; unshare turns them off');
  const sp = await call('budget', { action: 'spend', period: 'month' }); assert.ok(sp.r.totals, text(sp.raw)); ok('budget spend: totals per provider + recent rows');
  for (const area of ['image', 'audio', '3d', 'video', 'edit-video']) { const w = await call('list_workflows', { area }); assert.equal(w.err, false, `${area}: ${text(w.raw)}`); assert.ok(w.r.length > 0, area); }
  ok('list_workflows: image, audio, 3d, video presets, edit-video');
  const cj = await call('cancel', { id: img.r.id }); assert.equal(cj.err, true); assert.match(text(cj.raw), /409|already/i); ok('cancel on a finished job explains it is already done');
  const rj = await call('retry', { id: img.r.id }); assert.equal(rj.err, true); assert.match(text(rj.raw), /not_failed|409/); ok('retry only re-runs failed jobs');
  const ss = await call('server_status'); assert.equal(ss.r.backend, 'mock'); assert.ok(Array.isArray(ss.r.accounts) && ss.r.accounts.length > 0, `server_status accounts: ${JSON.stringify(ss.r.accounts)}`); ok('server_status (admin): accounts listed');
  console.log('catalog: all ok');
} finally {
  await client.close().catch(() => {});
  if (api) try { process.kill(-api.pid!); } catch { /* gone */ }
}
