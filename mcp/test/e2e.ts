/**
 * End-to-end MCP client test against a running API (mock backend). Runs every tool over stdio, then a smoke pass over
 * Streamable HTTP. Usage: npm run test:e2e (boots its own mock API on :8896; OPENHIGGSFIELD_API=<url> uses an existing one, read-only for settings). Build first: npm run build
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Never touches the shared dev API's settings (:8787). Default: boot an isolated mock API (own port + temp data dir, mockKeys + useLocal
// via env/its own prefs). OPENHIGGSFIELD_API=<url> targets an existing API instead; it must already have the routing you want (nothing is written).
import fs from 'node:fs'; import os from 'node:os';
let ownApi: ReturnType<typeof spawn> | null = null;
let restoreRouting = async () => { if (ownApi) try { process.kill(-ownApi.pid!); } catch { /* */ } };
const API = await (async () => {
  if (process.env.OPENHIGGSFIELD_API) return process.env.OPENHIGGSFIELD_API.replace(/\/$/, '');
  const port = Number(process.env.MCP_E2E_PORT) || 8896; const url = `http://localhost:${port}`;
  if (await fetch(`${url}/api/health`).then(() => true, () => false)) throw new Error(`:${port} is already in use (another API?). Set MCP_E2E_PORT to a free port.`); // never test against someone else's server
  ownApi = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.resolve(HERE, '../../server'), env: { ...process.env, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-e2e-')), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_USE_LOCAL: '1' }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 90; i++) { try { if ((await fetch(`${url}/api/health`)).ok) return url; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
  throw new Error(`isolated API on :${port} did not start`);
})();
const SAMPLES = path.resolve(HERE, '../../server/samples');
const V = path.join(SAMPLES, 'sample-pattern.mp4'), IMG = path.join(SAMPLES, 'sample-character.png'), PROD = path.join(SAMPLES, 'sample-product.png');
const WEB = 'http://web.example:5174'; // BH9 (d): user-facing links go to the web app (PUBLIC_WEB_URL), not the API port
const env = { ...process.env, OPENHIGGSFIELD_API: API, OPENHIGGSFIELD_MCP_POLL_MS: '500', PUBLIC_WEB_URL: WEB, OPENHIGGSFIELD_MCP_TOOLSETS: 'all' } as Record<string, string>;
let failed = 0;
const parse = (r: any) => { const t = r.content?.find((c: any) => c.type === 'text')?.text ?? ''; try { return JSON.parse(t); } catch { return t; } };
async function check(c: Client, name: string, args: Record<string, unknown>, ok: (r: any, raw: any) => string | true) {
  const t0 = Date.now();
  try {
    const raw: any = await c.callTool({ name, arguments: args }, undefined, { timeout: 300_000 }); const r = parse(raw);
    const v = raw.isError ? `isError: ${typeof r === 'string' ? r : JSON.stringify(r).slice(0, 300)}` : ok(r, raw);
    if (v === true) console.log(`PASS ${name} ${((Date.now() - t0) / 1000).toFixed(1)}s`); else { failed++; console.log(`FAIL ${name}: ${v}`); }
    return r;
  } catch (e) { failed++; console.log(`FAIL ${name}: ${(e as Error).message}`); }
}
const done = (r: any) => (r?.status === 'done' && r.outputs?.length ? true : `status=${r?.status} error=${r?.error}`);

const stdio = new Client({ name: 'ohf-e2e', version: '1' });
await stdio.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve(HERE, '../dist/index.js')], env }));
const names = (await stdio.listTools()).tools.map((t) => t.name).sort();
const want = ['create_story', 'generate_audio', 'generate_image', 'generate_soul', 'generate_video', 'get_asset', 'get_budget', 'get_job', 'get_receipt', 'job_status', 'list_models', 'list_tools', 'motion_transfer', 'object_swap', 'plan_budget', 'quote_cost', 'restyle', 'retry_story', 'set_budget', 'stitch_video', 'story_status', 'upload_media', 'wait_for_job'];
{ const gone = want.filter((n) => !names.includes(n)); if (gone.length) { failed++; console.log('FAIL listTools missing', gone); } else console.log(`PASS listTools (${names.length} tools, all ${want.length} legacy ones present)`); }
{ const gv: any = (await stdio.listTools()).tools.find((t) => t.name === 'generate_video'); const en = JSON.stringify(gv?.inputSchema?.properties?.resolution?.enum);
  if (en !== JSON.stringify(['768p', '720p', '480p'])) { failed++; console.log('FAIL generate_video resolution enum', en); } else console.log('PASS generate_video resolution = H3 (768p, 720p→768p, 480p)'); }
await check(stdio, 'quote_cost', { tool_id: 'h3-video', params: { resolution: '768p', duration: 5, provider: 'api-minimax-h3' } }, (r) => (typeof r?.credits === 'number' && r.usd === r.credits / 100 && typeof r.estimated === 'boolean' ? true : `bad quote ${JSON.stringify(r)?.slice(0, 120)}`));
let wfQuote = -1;
await check(stdio, 'quote_cost', { tool_id: 'h3-video', params: { resolution: '720p', seconds: 5, provider: 'cloud-h3-wf' } }, (r) => { wfQuote = r?.credits; return (r?.credits === 40 || (r?.demo === true && r?.credits === 0 && r?.listCredits === 40)) && r.resolution === '768p' && r.resolutionMapped?.from === '720p' ? true : `bad cloud-h3-wf 720p quote ${JSON.stringify(r)?.slice(0, 200)}`; });
await check(stdio, 'generate_video', { prompt: 'a lighthouse at dusk', provider: 'cloud-h3-wf', resolution: '720p', duration: 5 }, (r) => (r?.status === 'done' && r.cost === wfQuote && (r.warnings ?? []).some((w: string) => /720p was mapped to 768p/.test(w)) ? true : `bad cloud-h3-wf 720p run ${JSON.stringify(r)?.slice(0, 240)}`));
await check(stdio, 'quote_cost', { tool_id: 'create-image', params: { model: 'comfy-qwen21' } }, (r) => (r?.endpoint === '/api/models/quote' && r.local === true && r.credits === 0 ? true : `bad image quote ${JSON.stringify(r)?.slice(0, 120)}`));

await check(stdio, 'upload_media', { file: '/samples/sample-character.png' }, (r) => (typeof r?.url === 'string' || typeof r?.items?.[0]?.url === 'string' || typeof r?.[0]?.url === 'string' ? true : JSON.stringify(r).slice(0, 200)));
await check(stdio, 'list_tools', {}, (r) => (Array.isArray(r) && r.some((t: any) => t.id === 'object-swap') ? true : 'no object-swap'));
await check(stdio, 'list_models', { tool_id: 'create-image' }, (r) => (Array.isArray(r) && r.length > 0 && r[0].license ? true : JSON.stringify(r).slice(0, 200)));
await check(stdio, 'list_models', { tool_id: 'h3-video' }, (r) => (Array.isArray(r) && r.some((c: any) => c.id === 'api-minimax-h3' && c.model === 'minimax-h3' && Array.isArray(c.run_on)) ? true : JSON.stringify(r).slice(0, 200))); // step 2: cards name their model key
await check(stdio, 'quote_cost', { tool_id: 'h3-video', params: { model: 'minimax-h3', runOn: 'fal', mode: 't2v', seconds: 5 } }, (r) => (r?.modelKey === 'minimax-h3' && r?.runOn === 'fal' && /^fal:/.test(String(r?.route)) ? true : JSON.stringify(r)?.slice(0, 200)));
await check(stdio, 'quote_cost', { tool_id: 'soul', params: { n: 4, provider: 'comfy-soul' } }, (r) => (r?.credits === 0 ? true : `soul local should be 0: ${JSON.stringify(r)?.slice(0, 160)}`));
await check(stdio, 'generate_soul', { prompt: 'friends on a rooftop at sunset', preset: 'polaroid', colour_hex: ['#ff8800', '#003366'], colour_strength: 0.5, aspect: '3:4' }, done);
await check(stdio, 'generate_soul', { prompt: 'portrait in a red coat', preset: 'flash-editorial', refs: [IMG], n: 4 }, (r) => (r?.status === 'done' && r.outputs.length === 4 ? true : `want 4 outputs, got ${r?.outputs?.length} (${r?.status} ${r?.error ?? ''})`));
const img = await check(stdio, 'generate_image', { prompt: 'a ceramic mug on a desk, studio light' }, (r) => { const d = done(r); if (d !== true) return d;
  return r.page === `${WEB}/jobs/${r.id}` && r.outputs.every((o: any) => o.url.startsWith(`${WEB}/files/`)) ? true : `links not on the web app: page=${r.page} url=${r.outputs[0]?.url}`; });
await check(stdio, 'generate_video', { prompt: 'a paper boat drifting', duration: 6 }, done);
await check(stdio, 'create_story', { shots: [{ prompt: 'a paper boat on a pond' }, { prompt: 'the boat drifts under a bridge' }], cast_images: [IMG], budget_usd: 50 }, (r) => (r?.stories?.[0]?.status === 'done' && r.stories[0].film && r.stories[0].shots.length === 2 ? true : JSON.stringify(r).slice(0, 300)));
await check(stdio, 'generate_audio', { prompt: 'lofi beat', mode: 'music', duration: 10 }, done);
await check(stdio, 'object_swap', { video: V, refs: [PROD] }, done);
await check(stdio, 'motion_transfer', { video: V, refs: Array(10).fill(IMG), pinned: [0] }, (r) => (r?.status === 'done' && r.outputs.length === 2 ? true : `want 2 group outputs, got ${r?.outputs?.length} (${r?.status})`));
const noStyle: any = await stdio.callTool({ name: 'restyle', arguments: { video: V } });
if (!noStyle.isError || !/style/i.test(parse(noStyle))) { failed++; console.log('FAIL restyle validation', parse(noStyle)); } else console.log('PASS restyle requires a style');
const rs = await check(stdio, 'restyle', { video: V, preset: 'watercolor', wait: false }, (r) => (r?.submitted?.id ? true : 'no id'));
if (rs?.submitted?.id) await check(stdio, 'job_status', { id: rs.submitted.id, wait: true, timeout_sec: 120 }, done);
if (img?.id) await check(stdio, 'get_asset', { id: img.id, include_image: true }, (_r, raw) => (raw.content.some((c: any) => c.type === 'image') && raw.content.some((c: any) => c.type === 'resource_link' && c.uri.startsWith(`${WEB}/files/`)) ? true : 'no image / resource_link on the web app'));
await stdio.close();

// Agent budgets (server/src/agentBudget.ts): a fresh stdio process = a fresh agent session. set → spend → refusal when over → local at $0 → stitch → receipt.
{
  const ag = new Client({ name: 'ohf-e2e-budget', version: '1' });
  await ag.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve(HERE, '../dist/index.js')], env }));
  const CLIP = { prompt: 'a ceramic mug turning on a table', mode: 't2v', duration: 6, model: 'minimax-h3', run_on: 'comfy-cloud' };
  const q = await check(ag, 'quote_cost', { tool_id: 'h3-video', params: { model: 'minimax-h3', runOn: 'comfy-cloud', duration: 6, types: '["t2v"]' } }, (r) => (r?.costUsd > 0 && !r.agentBudget ? true : `want a paid quote without a budget: ${JSON.stringify(r)?.slice(0, 200)}`));
  const est: number = q?.costUsd ?? 0.48; const budget = Math.round(est * 2.5 * 100) / 100;
  const b = await check(ag, 'set_budget', { name: 'e2e-agent', budget_usd: budget }, (r) => (r?.id && r.budgetUsd === budget && r.spentUsd === 0 ? true : JSON.stringify(r)?.slice(0, 200)));
  await check(ag, 'plan_budget', { steps: [1, 2, 3].map((i) => ({ label: `clip ${i}`, tool_id: 'h3-video', params: { model: 'minimax-h3', runOn: 'comfy-cloud', duration: 6, types: '["t2v"]' } })).concat([{ label: 'local clip', tool_id: 'h3-video', params: { model: 'minimax-h3', runOn: 'local', duration: 6, types: '["t2v"]' } }] as any) },
    (r) => (r?.steps?.length === 4 && r.steps[3].usd === 0 && r.steps[3].local && Math.abs(r.totalUsd - 3 * est) < 1e-6 && r.fits === false && r.overByUsd > 0 ? true : `bad plan ${JSON.stringify(r)?.slice(0, 300)}`));
  const c1 = await check(ag, 'generate_video', CLIP, (r) => (done(r) === true && r.agent?.name === 'e2e-agent' && r.result_url ? true : `${done(r)} agent=${JSON.stringify(r?.agent)}`));
  const c2 = await check(ag, 'generate_video', { ...CLIP, wait: false }, (r) => (r?.submitted?.id ? true : 'no id'));
  if (c2?.submitted?.id) await check(ag, 'wait_for_job', { id: c2.submitted.id, timeout_sec: 120 }, (r) => (done(r) === true && r.result_url ? true : done(r)));
  await check(ag, 'get_job', { id: c1?.id ?? 'x' }, (r) => (r?.status === 'done' && r.result_url?.startsWith(`${WEB}/files/`) ? true : JSON.stringify(r)?.slice(0, 160)));
  const over: any = await ag.callTool({ name: 'generate_video', arguments: CLIP }); const ov = parse(over);
  if (over.isError && ov?.refused && ov.code === 'agent_budget' && ov.charged === false && Math.abs(ov.neededUsd - est) < 1e-6 && Math.abs(ov.remainingUsd - (budget - 2 * est)) < 1e-6) console.log(`PASS budget refusal (needed $${ov.neededUsd}, $${ov.remainingUsd} left, nothing charged)`);
  else { failed++; console.log('FAIL budget refusal', JSON.stringify(ov)?.slice(0, 300)); }
  const loc = await check(ag, 'generate_video', { ...CLIP, run_on: 'local' }, (r) => (done(r) === true && r.run_on === 'local' ? true : `${done(r)} run_on=${r?.run_on}`));
  const music = await check(ag, 'generate_audio', { prompt: 'warm upbeat acoustic bed', mode: 'music', duration: 30, model: 'ace-step-1.5', run_on: 'local' }, done);
  const st = await check(ag, 'stitch_video', { clips: [c1?.id, c2?.submitted?.id, loc?.id].filter(Boolean), music: music?.id, title: 'e2e ad', transition: 'crossfade', transition_sec: 0.3, end_card: {}, aspect: '9:16', fit: 'blur' },
    (r) => (r?.status === 'done' && r.result_url?.startsWith(`${WEB}/files/`) && r.cost === 0 && r.durationSec > 0 && r.transition === 'crossfade' && r.endCard?.text === 'Imagination is all you need.' && r.fit === 'blur' && r.height > r.width ? true : JSON.stringify(r)?.slice(0, 300)));
  const rc: any = await ag.callTool({ name: 'get_receipt', arguments: {} }); const rj = JSON.parse(rc.content?.[1]?.text ?? '{}');
  const free = (rj.items ?? []).filter((i: any) => i.countedUsd === 0).length;
  if (!rc.isError && /Spent \$/.test(rc.content?.[0]?.text ?? '') && rj.items?.length === 5 && rj.refusals?.length === 1 && Math.abs(rj.totals.spentUsd - 2 * est) < 1e-6 && rj.totals.budgetUsd === budget && free === 3 && st?.id && rj.items.some((i: any) => i.jobId === st.id))
    console.log(`PASS get_receipt (5 items, 3 free, 1 refusal, spent $${rj.totals.spentUsd} of $${budget})`);
  else { failed++; console.log('FAIL get_receipt', rc.content?.[0]?.text, JSON.stringify(rj.totals)); }
  await check(ag, 'get_budget', {}, (r) => (r?.id === b?.id && Math.abs(r.remainingUsd - (budget - 2 * est)) < 1e-6 && r.refusals === 1 ? true : JSON.stringify(r)?.slice(0, 200)));
  await ag.close();
  // The user pins the budget for the process (env): the agent can't replace it.
  const pinned = new Client({ name: 'ohf-e2e-pinned', version: '1' });
  await pinned.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve(HERE, '../dist/index.js')], env: { ...env, OPENHIGGSFIELD_AGENT_BUDGET_USD: '0.5', OPENHIGGSFIELD_AGENT_NAME: 'pinned-agent' } }));
  const sb: any = await pinned.callTool({ name: 'set_budget', arguments: { name: 'greedy', budget_usd: 100 } }); const sbj = parse(sb);
  if (sb.isError && sbj?.refused && sbj.budget?.budgetUsd === 0.5 && sbj.budget?.name === 'pinned-agent') console.log('PASS env-pinned budget: set_budget refused'); else { failed++; console.log('FAIL env-pinned budget', JSON.stringify(sbj)?.slice(0, 200)); }
  await check(pinned, 'quote_cost', { tool_id: 'h3-video', params: { model: 'minimax-h3', runOn: 'comfy-cloud', duration: 6, types: '["t2v"]' } }, (r) => (r?.agentBudget?.fits === (est <= 0.5) && r.agentBudget.name === 'pinned-agent' ? true : JSON.stringify(r?.agentBudget)));
  await pinned.close();
}

// Streamable HTTP
const port = 18788 + Math.floor(Math.random() * 500);
const srv = spawn(process.execPath, [path.resolve(HERE, '../dist/index.js'), '--http', '--port', String(port)], { env, stdio: ['ignore', 'ignore', 'pipe'] });
await new Promise<void>((res, rej) => { srv.stderr!.on('data', (d) => /Streamable HTTP/.test(String(d)) && res()); setTimeout(() => rej(new Error('http server did not start')), 10_000); });
const http = new Client({ name: 'ohf-e2e-http', version: '1' });
await http.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
console.log(`PASS http connect (${(await http.listTools()).tools.length} tools)`);
await check(http, 'list_tools', { media: 'audio' }, (r) => (Array.isArray(r) && r.every((t: any) => t.media === 'audio') && r.length ? true : 'bad filter'));
await check(http, 'generate_image', { prompt: 'a lighthouse at dusk', seed: 42 }, (r) => (done(r) === true && r.seed === 42 ? true : `seed=${r?.seed} ${done(r)}`));
await http.close(); srv.kill();
await restoreRouting(); console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0);
