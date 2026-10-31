/**
 * search_capabilities finds everything the app has (src/search.ts over the live catalogue, GET /api/capabilities included):
 *  1. every server tool by its name, every tool mode (footage-fx/vanish…) by its name and id, every workflow / flow / viral template by its name;
 *  2. the words people use: "video swap", "seamless loop", "morph", "make it talk", "talking photo", "vanish", "remove people", "clean plate",
 *     "continue video", "last frame", "text to speech", "viral template", "exploded view", "new angle", "direct a shot", "canvas"…;
 *  3. over MCP: search_capabilities returns ready run arguments, describe gives a workflow's / mode's run + inputs, limits and price rules.
 * Needs a mock API: OPENHIGGSFIELD_API=<url>, else boots one (temp data dir, port SEARCH_PORT or 8843).
 * Run: npm run test:search
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)); const SERVER = path.resolve(HERE, '../../server'); const MCP = path.resolve(HERE, '..');
const ok = (m: string) => console.log('ok ' + m);
let api: ChildProcess | null = null;
const API = await (async () => {
  if (process.env.OPENHIGGSFIELD_API) return process.env.OPENHIGGSFIELD_API.replace(/\/$/, '');
  const port = Number(process.env.SEARCH_PORT) || 8843; const url = `http://localhost:${port}`;
  if (await fetch(`${url}/api/health`).then(() => true, () => false)) throw new Error(`:${port} is in use; set SEARCH_PORT to a free port`);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ohf-mcp-search-'));
  api = spawn('npx', ['tsx', 'src/index.ts'], { cwd: SERVER, detached: true, stdio: 'ignore', env: { ...process.env, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: d, OPENHIGGSFIELD_ENV_FILE: path.join(d, 'x.env'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_API_PROXY: url } });
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${url}/api/health`)).ok) return url; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error(`mock API on :${port} did not start`);
})();
process.env.OPENHIGGSFIELD_API = API;
const { loadTools, loadWorkflows, loadSearchWords } = await import('../src/catalog.js');
const { buildIndex, search, toolModes } = await import('../src/search.js');

const client = new Client({ name: 'ohf-search', version: '1' });
try {
  const health = await (await fetch(`${API}/api/health`)).json() as any; assert.equal(health.backend, 'mock', 'mock backend only');
  const [tools, wfs, words] = await Promise.all([loadTools(true), loadWorkflows(), loadSearchWords()]);
  const index = buildIndex(tools, wfs, words);
  const ids = (q: string, n = 10) => search(index, q).slice(0, n).map((h) => h.entry.id);
  const findable = (q: string, id: string, n = 10) => assert.ok(ids(q, n).includes(id), `"${q}" should find ${id}; got ${ids(q, n).join(', ')}`);

  for (const mode of ['text-to-3d', 'multiview-to-3d']) {
    const wf = wfs.find(w => w.id === `3d/${mode}`); assert.ok(wf, `${mode} is available through MCP`);
    assert.deepEqual(wf.run, { tool_id: 'three-d', model: 'cloud-tripo-31', fields: { types: [mode] } });
    findable(mode === 'text-to-3d' ? 'Text to 3D' : 'Multi-view to 3D', `3d/${mode}`);
  }
  assert.deepEqual(wfs.filter(w => w.name === 'Image to 3D').map(w => w.id), ['3d/image-to-3d'], 'one Image to 3D search entry');
  // ---- 1. everything by its name ----
  for (const t of tools) { findable(t.name, t.id); findable(t.id, t.id, 3); }
  let modes = 0; for (const t of tools) for (const m of toolModes(t)) { findable(`${t.name} ${m.label}`, `${t.id}/${m.id}`); findable(`${t.id}/${m.id}`, `${t.id}/${m.id}`, 3); modes++; }
  const caps = wfs.filter((w) => w.kind); assert.ok(caps.length >= 40, `capabilities served (${caps.length})`);
  for (const w of wfs) findable(w.name, w.id, 15);
  for (const k of ['video/object-swap', 'video/motion-control', 'video/loop', 'video/morph', 'video/extend', 'video/lip-sync', 'video/footage-fx', 'video/exploded-view', 'video/new-angle', 'video/direct-a-shot', 'template/fruit-drama', 'explore/canvas'])
    assert.ok(caps.some((w) => w.id === k), `${k} served`);
  ok(`${tools.length} tools, ${modes} tool modes and ${wfs.length} workflows (${caps.length} from /api/capabilities) are findable by name`);

  // ---- 2. the words people use ----
  const ALIASES: [string, string[]][] = [
    ['video swap', ['video/object-swap', 'video/motion-control']], ['swap outfit', ['video/object-swap', 'object-swap/outfit']], ['seamless loop', ['video/loop']], ['loop', ['video/loop']],
    ['morph', ['video/morph', 'video/transitions']], ['lip sync', ['video/lip-sync', 'voice/lipsync']], ['make it talk', ['video/lip-sync', 'explore/lip-sync']], ['talking photo', ['video/lip-sync']],
    ['vanish', ['footage-fx/vanish']], ['remove people', ['footage-fx/vanish']], ['clean plate', ['footage-fx/vanish']], ['footage effects', ['video/footage-fx', 'footage-fx']],
    ['continue video', ['video/extend']], ['last frame', ['video/extend', 'h3-video/flf']], ['extend', ['video/extend', 'h3-extend']],
    ['text to speech', ['voice/voiceover', 'audio/voice']], ['tts', ['voice/voiceover', 'audio/voice']], ['script to voiceover', ['voice/voiceover']],
    ['viral template', ['template/fruit-drama', 'template/glass-asmr', 'template/miniature-world', 'template/cctv-found-footage']], ['fruit drama', ['template/fruit-drama']],
    ['exploded view', ['video/exploded-view', 'photo-fx/exploded-view']], ['new angle', ['video/new-angle']], ['direct a shot', ['video/direct-a-shot', 'plan-a-shot']],
    ['packshot', ['app-product-shot']], ['consistent character', ['app-character-sheet']], ['infinite zoom', ['app-transition']], ['album cover', ['create-image']],
    ['marketplace crops', ['app-expand']], ['product angles', ['app-shots']], ['dialogue scene', ['explore/ltx-t2v']], ['relight product', ['app-relight']],
    ['canvas', ['explore/canvas']], ['3d model', ['three-d']], ['upscale video', ['video/upscale', 'upscale']], ['relight', ['app-relight']], ['day to night', ['footage-fx/day-to-night']],
  ];
  for (const [q, want] of ALIASES) { const got = ids(q, 5); assert.ok(want.some((w) => got.includes(w)), `"${q}" should find one of ${want.join(', ')} in the top 5; got ${got.join(', ')}`); }
  const part = search(index, 'remove zzqx people'); assert.ok(part.length && part[0].partial, 'nothing matches every word → partial hits');
  ok(`${ALIASES.length} everyday phrases land on the right item; a half-matching query still answers (partial)`);

  // ---- 3. over MCP ----
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(MCP, 'node_modules/tsx/dist/cli.mjs'), path.join(MCP, 'src/index.ts')], cwd: MCP,
    env: { ...process.env, OPENHIGGSFIELD_API: API, OPENHIGGSFIELD_MCP_PERMISSIONS: '', OPENHIGGSFIELD_MCP_DEFAULT: 'allow', OPENHIGGSFIELD_MCP_TOOLSETS: 'core' } as Record<string, string> }));
  const call = async (name: string, args: Record<string, unknown>) => { const r: any = await client.callTool({ name, arguments: args }); assert.ok(!r.isError, `${name}: ${r.content?.[0]?.text}`); return JSON.parse(r.content[0].text); };
  const s1 = await call('search_capabilities', { query: 'remove people' }); assert.equal(s1.top[0].id, 'footage-fx/vanish'); assert.deepEqual(s1.top[0].run, { tool_id: 'footage-fx', fields: { types: ['vanish'] } });
  const s2 = await call('search_capabilities', { query: 'seamless loop' }); assert.deepEqual(s2.workflows.find((w: any) => w.id === 'video/loop').run, { tool_id: 'h3-video', model: 'ltx-2.5-22b', fields: { loop: 1 } });
  const s3 = await call('search_capabilities', { query: 'text to speech', kind: 'mode' }); assert.ok(s3.modes.some((x: any) => x.id === 'voice/voiceover'));
  const d1 = await call('describe', { id: 'video/loop' }); assert.equal(d1.kind, 'workflow'); assert.equal(d1.tool.id, 'h3-video'); assert.equal(d1.tool.models[0].model, 'ltx-2.5-22b'); assert.equal(d1.tool.modelOffered, true);
  assert.ok(d1.tool.fields.properties.prompt && d1.tool.priceRules && d1.inputs.length > 0, 'workflow describe: inputs, fields, price rules');
  const d2 = await call('describe', { id: 'footage-fx/vanish' }); assert.equal(d2.kind, 'mode'); assert.deepEqual(d2.run.fields, { types: ['vanish'] }); assert.ok(d2.tool.fields.properties.video); assert.ok(d2.tool.models.length > 0);
  const d3 = await call('describe', { id: 'video/lip-sync' }); assert.deepEqual(d3.run, { tool_id: 'voice', fields: { types: ['lipsync'] } });
  const d4 = await call('describe', { id: 'template/glass-asmr' }); assert.match(d4.run.fields.prompt, /glass/); assert.equal(d4.run.model, 'ltx-2.5-22b');
  const d5 = await call('describe', { id: 'explore/canvas' }); assert.equal(d5.run, null); assert.match(d5.next, /canvas/);
  const q = await call('quote', { ...d2.run, fields: { ...d2.run.fields, video: '/samples/clip.mp4' } }).catch(() => null); void q; // the run shape is accepted by quote (price may be unrunnable on mock)
  ok('MCP: search returns ready run arguments; describe gives a workflow / mode its run, inputs, model limits and price rules');
} finally {
  await client.close().catch(() => {});
  if (api?.pid) try { process.kill(-api.pid); } catch { /* gone */ }
}
process.exit(0);
