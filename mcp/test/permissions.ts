/** MCP permissions test (stdio): block → refused; ask without elicitation → refused; ask with elicitation accept → runs; decline → refused.
 *  Toolsets: no OPENHIGGSFIELD_MCP_TOOLSETS → only the eleven core tools; all → every tool. Spend tier (OPENHIGGSFIELD_MCP_SPEND=ask): run asks only
 *  for a paid quote, with the price; a free local run goes through. Needs a mock API (OPENHIGGSFIELD_API; mock keys give paid quotes). */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOLSETS } from '../src/toolsets.js';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* never the live app: with no mock API named (or the live :8787 named), skip. A run against :8787 once started a real Comfy Cloud job. */
if (!process.env.OPENHIGGSFIELD_API || /:8787\b/.test(process.env.OPENHIGGSFIELD_API)) { console.log('skip: set OPENHIGGSFIELD_API to a mock sandbox API (never the live :8787)'); process.exit(0); }
const env = { ...process.env, OPENHIGGSFIELD_API: process.env.OPENHIGGSFIELD_API, OPENHIGGSFIELD_MCP_POLL_MS: '500',
  OPENHIGGSFIELD_MCP_PERMISSIONS: '', OPENHIGGSFIELD_MCP_BLOCK: 'restyle', OPENHIGGSFIELD_MCP_ASK: 'generate_image', OPENHIGGSFIELD_MCP_TOOLSETS: 'all', OPENHIGGSFIELD_MCP_SPEND: 'ask' } as Record<string, string>;
delete env.OPENHIGGSFIELD_MCP_PERMISSIONS;
let failed = 0; const ok = (n: string, c: boolean, i: unknown = '') => { if (!c) failed++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}`, c ? '' : JSON.stringify(i).slice(0, 300)); };
const txt = (r: any) => r.content?.[0]?.text ?? '';
let lastMsg = '';
async function client(elicit: 'none' | 'accept' | 'decline', e: Record<string, string> = env) {
  const c = new Client({ name: 'perm-test', version: '1' }, { capabilities: elicit === 'none' ? {} : { elicitation: { form: {} } } as any });
  if (elicit !== 'none') c.setRequestHandler(ElicitRequestSchema, async (req: any) => { lastMsg = req.params?.message ?? ''; return elicit === 'accept' ? { action: 'accept', content: { approve: true } } : { action: 'decline' }; });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve(HERE, '../dist/index.js')], env: e })); return c;
}
const a = await client('none');
const r1: any = await a.callTool({ name: 'restyle', arguments: { video: '/samples/sample-pattern.mp4', preset: 'watercolor' } });
ok('block → refused with message', r1.isError && /blocked/.test(txt(r1)), txt(r1));
const r2: any = await a.callTool({ name: 'generate_image', arguments: { prompt: 'a mug' } });
ok('ask without elicitation → refused', r2.isError && /doesn't support elicitation/.test(txt(r2)), txt(r2));
const r3: any = await a.callTool({ name: 'list_tools', arguments: {} }); ok('allow (read-only) → runs', !r3.isError, txt(r3));
const tl = (await a.listTools()).tools.find((t) => t.name === 'generate_image'); ok('description shows permission', /permission: ask/.test(tl?.description ?? ''), tl?.description);
await a.close();
const b = await client('accept');
const r4: any = await b.callTool({ name: 'generate_image', arguments: { prompt: 'a mug on a desk' } }, undefined, { timeout: 120000 });
ok('ask + elicitation accept → runs to done', !r4.isError && /"status": "done"/.test(txt(r4)), txt(r4)); await b.close();
const c = await client('decline');
const r5: any = await c.callTool({ name: 'generate_image', arguments: { prompt: 'a mug' } }); ok('ask + decline → refused', r5.isError && /declined/.test(txt(r5)), txt(r5)); await c.close();
// ---- toolsets ----
{ const e = { ...env }; delete (e as any).OPENHIGGSFIELD_MCP_TOOLSETS; const d = await client('none', e); const names = (await d.listTools()).tools.map((t) => t.name).sort();
  ok('default toolset = the eleven core tools + the four library searches', JSON.stringify(names) === JSON.stringify(['budget', 'cancel', 'describe', 'get_outputs', 'get_reference', 'get_workflow_recipe', 'history', 'quote', 'recipe', 'run', 'search_capabilities', 'search_references', 'search_workflows', 'status', 'upload']), names);
  const res = (await d.listResources()).resources.map((r) => r.uri); ok('catalogue + price resources listed', res.includes('imagination://catalog/tools') && res.some((u) => u.startsWith('imagination://prices/')), res.slice(0, 5));
  const pr: any = await d.readResource({ uri: 'imagination://prices/h3-video' }); ok('price table resource reads', JSON.parse(pr.contents[0].text).rows.length > 0); await d.close(); }
{ const e = { ...env, OPENHIGGSFIELD_MCP_TOOLSETS: 'core,canvas' }; const d = await client('none', e); const names = (await d.listTools()).tools.map((t) => t.name);
  ok('core,canvas adds the canvas tools only', JSON.stringify(names.sort()) === JSON.stringify([...TOOLSETS.core, ...TOOLSETS.canvas].sort()), names); await d.close(); }
// ---- spend tier: run asks only for a paid quote ----
{ const d = await client('none'); const free: any = await d.callTool({ name: 'run', arguments: { tool_id: 'create-image', fields: { prompt: 'a mug', types: ['generate'] }, run_on: 'local' } }, undefined, { timeout: 120000 });
  ok('spend ask: a free local run needs no approval', !free.isError && /"free": true/.test(txt(free)), txt(free));
  const desc = (await d.listTools()).tools.find((t) => t.name === 'run')?.description ?? ''; ok('run is marked permission: ask (spend tier)', /permission: ask/.test(desc), desc.slice(-120));
  const q: any = await d.callTool({ name: 'quote', arguments: { tool_id: 'h3-video', fields: { prompt: 'x', types: ['t2v'] }, compare: true } }); const paid = JSON.parse(txt(q)).compare.find((r: any) => r.runnable && r.usd > 0 && !r.adjusted);
  if (paid) {
    const req = { tool_id: 'h3-video', fields: { prompt: 'a lighthouse', types: ['t2v'] }, model: paid.model, run_on: paid.runOn };
    const qq: any = await d.callTool({ name: 'quote', arguments: req }); const args = { ...req, quote_id: JSON.parse(txt(qq)).quote_id };
    const r: any = await d.callTool({ name: 'run', arguments: args }); ok('spend ask: a paid run without elicitation is refused', r.isError && /doesn't support elicitation/.test(txt(r)), txt(r)); await d.close();
    const withQuote = async (c: Client) => ({ ...req, quote_id: JSON.parse(txt(await c.callTool({ name: 'quote', arguments: req }))).quote_id }); // quote_ids live in one MCP process
    lastMsg = ''; const dd = await client('decline'); const r2: any = await dd.callTool({ name: 'run', arguments: await withQuote(dd) }); ok('spend ask: decline → refused, price in the question', r2.isError && /declined/.test(txt(r2)) && /\$\d+\.\d\d/.test(lastMsg), lastMsg); await dd.close();
    const aa = await client('accept'); const r3: any = await aa.callTool({ name: 'run', arguments: await withQuote(aa) }, undefined, { timeout: 120000 }); ok('spend ask: accept → runs', !r3.isError && /"status": "done"/.test(txt(r3)), txt(r3)); await aa.close();
  } else { console.log('SKIP paid-run approval (no paid quote on this API: start it with OPENHIGGSFIELD_MOCK_KEYS=1)'); await d.close(); }
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
