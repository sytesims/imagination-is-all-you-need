/** Mock transport only: quote/run input parity, fail-closed guards, legacy discovery and diagnostic isolation.
 * Run: ./node_modules/.bin/tsx test/parity.ts (no running API, files, keys or providers needed).
 */
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

process.env.OPENHIGGSFIELD_AGENT_BUDGET_ID = 'pinned';
process.env.OPENHIGGSFIELD_MCP_TOOLSETS = 'core';
process.env.OPENHIGGSFIELD_MCP_PERMISSIONS = '';
process.env.OPENHIGGSFIELD_MCP_DEFAULT = 'allow';
const { createServer, view } = await import('../src/server.js');
const { withBudget } = await import('../src/api.js');
const { limitsOf, modelCard } = await import('../src/catalog.js');
const imageCaps = { qualityTiers: ['low', 'high'], maxBatch: 4, supports: { maxRefs: 16 }, edit: { allowAuto: false }, verified: false, unverified: ['edit'] };
assert.deepEqual(limitsOf(imageCaps), imageCaps, 'image mode/reference/batch limits and uncertainty survive describe');
assert.equal(modelCard({ key: 'chosen', runsOn: [{ id: 'comfy-cloud', choices: [{ routeId: 'mock:route', limits: { maxRefs: 2 } }] }] }).run_on[0].routes[0].limits.maxRefs, 2, 'route-specific limits survive describe');
const oldFetch = globalThis.fetch;
let runnable = true; let submitted = 0; let lastPrice = new URLSearchParams(); let lastForm: FormData | null = null;
const tool = { id: 'object-swap', name: 'Object / Person Swap', media: 'video', inputs: [{ name: 'refs', kind: 'files' }, { name: 'video', kind: 'file' }, { name: 'prompt', kind: 'text' }], models: [] };
const job = { id: 'mock', toolId: tool.id, status: 'done', isSample: true, outputs: [{ label: 'Result', url: '/files/result.mp4' }], diagnostics: [{ kind: 'selection', label: 'Selection before growth', url: '/files/mask.mp4', note: 'Not the effective sampler tensor' }] };
globalThis.fetch = async (input, init) => {
  const u = new URL(String(input)); const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } });
  if (u.pathname === '/api/tools') return json([tool, { ...tool, id: 'two-person-swap', listed: false }, ...['create-image', 'h3-video'].map(id => ({ ...tool, id, inputs: [...tool.inputs, { name: 'image', kind: 'file' }] }))]);
  if (u.pathname.endsWith('/price') || u.pathname === '/api/models/quote') { lastPrice = u.searchParams; return json({ credits: 25, runnable, blockedReason: runnable ? null : 'Unsupported model inputs', route: 'mock:route', cost: { estUsd: 0.25 } }); }
  if (u.pathname.endsWith('/jobs') && init?.method === 'POST') { submitted++; lastForm = init.body as FormData; return json({ id: job.id }); }
  if (u.pathname === '/api/jobs/mock') return json(job);
  if (u.pathname.startsWith('/files/')) return new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } });
  if (u.pathname === '/api/models') return json([]);
  if (u.pathname === '/api/config' || u.pathname === '/api/prompt-grammar') return json({});
  throw new Error(`Unexpected mock request: ${u.pathname}`);
};
const server = createServer(); const client = new Client({ name: 'parity-test', version: '1' });
const [ct, st] = InMemoryTransport.createLinkedPair();
try {
  await server.connect(st); await client.connect(ct);
  const runSchema: any = (await client.listTools()).tools.find(t => t.name === 'run')?.inputSchema;
  assert.match(runSchema.properties.run_on.description, /known uncharged failure/);
  const call = async (name: string, args: Record<string, unknown>) => {
    const raw: any = await client.callTool({ name, arguments: args });
    const text = raw.content.find((x: any) => x.type === 'text')?.text;
    let body: any; try { body = JSON.parse(text); } catch { body = text; }
    return { raw, body };
  };
  await assert.rejects(withBudget('unrestricted', async () => {}), /pinned budget/);
  await withBudget('pinned', async () => {});
  const listed = await call('search_capabilities', { query: 'swap', kind: 'tool' });
  assert.ok(!listed.body.tools.some((t: any) => t.id === 'two-person-swap'));
  assert.equal((await call('describe', { id: 'two-person-swap' })).body.id, 'two-person-swap', 'explicit legacy ids remain describable');
  for (const [tool_id, types] of [['create-image', ['edit']], ['h3-video', ['r2v']]] as const) {
    await call('quote', { tool_id, model: 'chosen', fields: { types, image: '/files/main.png', refs: ['/files/a.png', '/files/b.png'] } });
    assert.equal(lastPrice.get('refs'), '3', `${tool_id}: main photo is included in the total refs`);
    if (tool_id === 'create-image') assert.equal(lastPrice.get('mode'), 'edit');
  }
  const req = { tool_id: tool.id, model: 'chosen', run_on: 'fal', route: 'mock:route', draft: false, fields: { prompt: 'x', model: 'stale', runOn: 'local', route: 'stale:route', draft: true, refs: ['/files/a.png', '/files/b.png'] } };
  const q = await call('quote', req);
  assert.equal(lastPrice.get('refs'), '2'); assert.equal(lastPrice.get('model'), 'chosen'); assert.equal(lastPrice.get('runOn'), 'fal'); assert.equal(lastPrice.get('draft'), '0');
  assert.equal((await call('run', { ...req, max_usd: 0 })).body.refused, true);
  assert.equal((await call('run', req)).body.refused, true);
  assert.equal(submitted, 0, 'budget/quote refusals send no job');
  const changed = await call('run', { ...req, fields: { ...req.fields, prompt: 'changed' }, quote_id: q.body.quote_id });
  assert.equal(changed.body.refused, true);
  const ran = await call('run', { ...req, quote_id: q.body.quote_id, wait_sec: 0 });
  assert.equal(ran.raw.isError, false); assert.equal(submitted, 1);
  assert.equal(lastForm!.get('model'), 'chosen'); assert.equal(lastForm!.get('runOn'), 'fal'); assert.equal(lastForm!.get('route'), 'mock:route'); assert.equal(lastForm!.get('draft'), '0'); assert.equal(lastForm!.getAll('refs').length, 2);
  runnable = false;
  assert.equal((await call('run', { ...req, quote_id: q.body.quote_id })).body.refused, true);
  assert.equal(submitted, 1, 'non-runnable quote cannot submit even with a prior quote_id');
  const v = view(job);
  assert.equal(v.outputs.length, 1); assert.match(v.result_url!, /result\.mp4$/); assert.equal(v.diagnostics.length, 1); assert.match(v.diagnostics[0].url, /mask\.mp4$/);
  console.log('parity: reference counts, explicit option precedence, pinned budget, quote/max_usd/non-runnable guards, hidden legacy compatibility and separate diagnostics pass');
} finally { await client.close(); await server.close(); globalThis.fetch = oldFetch; }
