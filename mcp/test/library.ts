/** MCP library tools (stdio): search_workflows, get_workflow_recipe, search_references, get_reference against a mock sandbox API. Read only:
 *  nothing runs. Needs OPENHIGGSFIELD_API = a mock sandbox (never the live :8787). npm run test:library -w mcp (or tsx test/library.ts). */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const MCP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = process.env.OPENHIGGSFIELD_API;
if (!API || /:8787\b/.test(API)) { console.log('skip: set OPENHIGGSFIELD_API to a mock sandbox API (never the live :8787)'); process.exit(0); }
const health: any = await fetch(`${API}/api/health`).then((r) => r.json()).catch(() => null);
if (health?.backend !== 'mock') { console.log('skip: the API is not in sample mode'); process.exit(0); }
let failed = 0; const ok = (n: string, c: boolean, i: unknown = '') => { if (!c) failed++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}`, c ? '' : JSON.stringify(i).slice(0, 400)); };
const c = new Client({ name: 'library-test', version: '1' });
await c.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(MCP, 'node_modules/tsx/dist/cli.mjs'), path.join(MCP, 'src/index.ts')], cwd: MCP,
  env: { ...process.env, OPENHIGGSFIELD_API: API, OPENHIGGSFIELD_MCP_TOOLSETS: 'core' } as Record<string, string> }));
const call = async (name: string, args: Record<string, unknown>) => { const raw: any = await c.callTool({ name, arguments: args }); let j: any = {}; try { j = JSON.parse(raw.content?.[0]?.text ?? '{}'); } catch { j = { text: raw.content?.[0]?.text }; } return { raw, j }; };

const names = (await c.listTools()).tools.map((t) => t.name);
ok('the four library tools are in core', ['search_workflows', 'get_workflow_recipe', 'search_references', 'get_reference'].every((n) => names.includes(n)), names);
const ro = (await c.listTools()).tools.filter((t) => t.name.startsWith('search_') || t.name.startsWith('get_')).every((t) => t.annotations?.readOnlyHint);
ok('library tools are read-only', ro);

const s = await call('search_workflows', { query: 'relight', limit: 5 });
ok('search_workflows: Relight first for "relight"', s.j.items?.[0]?.name === 'Relight', s.j.items?.map((x: any) => x.name));
ok('search_workflows: counts by kind', s.j.counts?.workflow > 0 && s.j.counts?.skill > 0, s.j.counts);
const ready = await call('search_workflows', { query: 'relight', include_ideas: false, limit: 20 });
ok('include_ideas:false hides ideas', (ready.j.items ?? []).every((x: any) => x.status !== 'idea'), ready.j.items?.map((x: any) => x.status));
const media = await call('search_workflows', { media: '3d', limit: 20 });
ok('media filter: 3d in or out', (media.j.items ?? []).length > 0 && media.j.items.every((x: any) => x.mediaIn.includes('3d') || x.mediaOut.includes('3d')), media.j.items?.map((x: any) => x.name));
const chain = await call('get_workflow_recipe', { id: 'c-presenter' });
ok('get_workflow_recipe: chain steps in order with tools', chain.j.steps?.length === 3 && chain.j.steps[0].tool_id === 'create-image', chain.j.steps);
ok('get_workflow_recipe: a canvas_batch plan with wired cards', chain.j.canvas?.tool === 'canvas_batch' && chain.j.canvas.args.items.some((x: any) => x.inputs_from), chain.j.canvas);
const miss = await call('get_workflow_recipe', { id: 'nope' }); ok('unknown recipe → error', !!miss.raw.isError);

const r = await call('search_references', { limit: 5 });
ok('search_references: lists media', r.j.total > 0 && r.j.items[0].url?.startsWith('http'), r.j);
ok('search_references: no host paths', !JSON.stringify(r.j).match(/\/Users\/|\/private\/|\/home\//), '');
const img = await call('search_references', { kind: 'image', limit: 2, include_image: true });
ok('include_image inlines small images', img.raw.content.some((x: any) => x.type === 'image'), img.raw.content.map((x: any) => x.type));
const id = r.j.items[0].id; const one = await call('get_reference', { id });
ok('get_reference: one item with its path', one.j.id === id && typeof one.j.path === 'string' && one.j.path.startsWith('/'), one.j);
const none = await call('get_reference', { id: 'gen-nope-0' }); ok('unknown reference → error', !!none.raw.isError);
await c.close();
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
