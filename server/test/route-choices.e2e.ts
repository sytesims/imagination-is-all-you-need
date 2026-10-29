// Named ways to run one model at one place (2026-10-27, app-wide; shared/routeNames.ts, routing/modelRegistry.ts choicesOf, select.ts takesRank):
// 1. naming is generated from route data for EVERY model with 2+ real routes in one place (snapshot below: a new route shows up as a diff);
//    names are unique per place and never a raw route id on Comfy Cloud; job-type splits (fal text-to-video / image-to-video) are not choices;
// 2. the automatic pick inside a place takes the route that accepts your settings (MiniMax H3 at 480p: never the 768p / 2K service when the
//    open workflow runs it; 2K: the service);
// 3. a picked route is remembered per tool and model on the server (PUT /api/me/routing perTool route) and the quote, the batch row and the
//    submit all use it; clearing it goes back to the automatic pick;
// 4. quote = charge per route.
// Run: npx tsx test/route-choices.e2e.ts (own port; temp data dir, mock backend, mock keys)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { routeChoiceNames, routeWord } from '../src/shared/routeNames.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'rch-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_COMFY_API_KEY: '', OPENHIGGSFIELD_USE_LOCAL: '' };
const PORT = testPort(8993); const B = `http://localhost:${PORT}`;
const ok = (m: string) => console.log('ok ' + m);

// ---- 0. pure naming ----
assert.equal(routeWord({ routeId: 'comfy-cloud:cloud-h3-wf', kind: 'comfy-cloud', comfyVariant: 'workflow' }, 'MiniMax'), 'open workflow');
assert.equal(routeWord({ routeId: 'comfy-router:api-minimax-h3', kind: 'comfy-router', comfyVariant: 'partner' }, 'MiniMax'), 'MiniMax’s service');
assert.equal(routeWord({ routeId: 'comfy-cloud:cloud-ltx25-pro-api', kind: 'comfy-cloud', comfyVariant: 'partner' }, 'Lightricks'), 'Comfy’s node');
assert.equal(routeWord({ routeId: 'comfy-deploy:x', kind: 'comfy-cloud', comfyVariant: 'deployment' }), 'your deployment');
assert.equal(routeWord({ routeId: 'local:comfy-x', kind: 'local', label: 'Local ComfyUI · Fast draft' }), 'fast draft');
assert.equal(routeWord({ routeId: 'fal:fal-ai/luma-dream-machine/ray-2-flash/reframe', kind: 'fal' }), 'ray 2 flash reframe');
{ const n = routeChoiceNames('Comfy Cloud', [{ routeId: 'comfy-cloud:a', kind: 'comfy-cloud', comfyVariant: 'partner' }, { routeId: 'comfy-cloud:b', kind: 'comfy-cloud', comfyVariant: 'partner' }], 'X');
  assert.notEqual(n[0].name, n[1].name, 'two routes that would read the same get their own words'); }
ok('route words: open workflow / <maker>’s service / Comfy’s node / your deployment / a local label / a key place\'s endpoint; duplicates told apart');

const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_SKIP_MCP: '1' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await fetch(`${B}${u}`)).json() as Promise<any>;
const price = async (toolId: string, q: Record<string, string>) => { const r = await fetch(`${B}/api/tools/${toolId}/price?${new URLSearchParams(q)}`); return { status: r.status, body: (await r.json()) as any }; };
const putRouting = async (body: any) => { const r = await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); assert.equal(r.status, 200, await r.clone().text()); };
try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }

  // ---- 1. every model with 2+ routes in one place gets generated names (snapshot) ----
  const tools: any[] = await get('/api/tools'); const snap: string[] = [];
  for (const t of tools) for (const m of t.models ?? []) for (const r of m.runsOn ?? []) if (r.choices) {
    assert.ok(r.choices.length > 1); const names = r.choices.map((c: any) => c.name); assert.equal(new Set(names).size, names.length, `${t.id} ${m.key} ${r.id}: unique names`);
    for (const c of r.choices) { assert.ok(c.name.startsWith(`${r.label} · `) || (r.id === 'comfy-cloud' && /^(Comfy Cloud|Comfy Router|Comfy deployment) · /.test(c.name)), c.name); /* each Comfy route under its own place words (shared placeOf) */ assert.ok(r.routes.includes(c.routeId)); if (r.id === 'comfy-cloud') assert.ok(!/[:/]/.test(c.word), `no raw ids on Comfy Cloud: ${c.word}`); }
    assert.ok(!r.choices.every((c: any) => /(text|image|reference)-to-(image|video)/.test(c.routeId)), 'job-type endpoints are not choices');
    snap.push(`${t.id} ${m.key} ${r.id}: ${r.choices.map((c: any) => c.word).join(' | ')}`); }
  const want = [
    'h3-video ltx-2.5-pro comfy-cloud: Lightricks’s service | Comfy’s node',
    'h3-video minimax-h3 comfy-cloud: MiniMax’s service | open workflow',
    'h3-video flux-3-max comfy-cloud: Black Forest Labs’s service | Comfy’s node',
  ];
  // each wanted choice is there (a place may list more: MiniMax H3 also has Comfy's node once its price is set)
  for (const w of want) assert.ok(snap.some((x) => x.split(': ')[0] === w.split(': ')[0] && w.split(': ')[1].split(' | ').every((y) => x.split(': ')[1].split(' | ').includes(y))), `snapshot: ${w}\n${snap.join('\n')}`);
  ok(`${snap.length} place(s) list named choices:\n  ${[...new Set(snap)].join('\n  ')}`);

  // ---- 2. the automatic pick inside a place takes your settings ----
  const T = { types: 't2v', aspect: 'auto', audio: '1' };
  const h480 = await price('h3-video', { ...T, duration: '10', resolution: '480p', model: 'minimax-h3', runOn: 'comfy-cloud' });
  if (h480.status === 200 && h480.body.runnable !== false) assert.match(String(h480.body.routeId), /cloud-h3-wf/, 'MiniMax H3 at 480p runs on the open workflow, which makes 480p');
  const h2k = await price('h3-video', { ...T, duration: '10', resolution: '2K', model: 'minimax-h3', runOn: 'comfy-cloud' }); assert.equal(h2k.status, 200); assert.match(String(h2k.body.routeId), /api-minimax-h3/, '2K: the service');
  ok(`auto pick: 480p → ${h480.body.routeId ?? h480.body.error}, 2K → ${h2k.body.routeId}`);

  // ---- 3. a remembered choice ----
  const pro = (tools.find((t) => t.id === 'h3-video').models as any[]).find((m) => m.key === 'ltx-2.5-pro'); const cc = pro.runsOn.find((r: any) => r.id === 'comfy-cloud');
  const svc = cc.choices.find((c: any) => /service/.test(c.word)); assert.ok(svc);
  await putRouting({ perTool: { 'h3-video': { 'ltx-2.5-pro': { runOn: 'comfy-cloud', route: svc.routeId } } } });
  const saved = await get('/api/me/routing'); assert.equal(saved.perTool['h3-video']['ltx-2.5-pro'].route, svc.routeId);
  const q1 = await price('h3-video', { ...T, duration: '8', resolution: '1080p', model: 'ltx-2.5-pro' }); assert.equal(q1.body.routeId, svc.routeId, 'the quote uses the remembered route');
  const row = (await (await fetch(`${B}/api/models/quotes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ toolId: 'h3-video', params: { ...T, duration: '8', resolution: '1080p' }, models: ['ltx-2.5-pro'], range: false }) })).json() as any).quotes['ltx-2.5-pro'];
  assert.equal(row.routeId, svc.routeId, 'the menu row too');
  // ---- 4. quote = charge on that route ----
  const fd = new FormData(); for (const [k, v] of Object.entries({ ...T, duration: '8', resolution: '1080p', model: 'ltx-2.5-pro', prompt: 'A lighthouse at dusk.', quotedCredits: String(q1.body.credits), quotedRouteId: String(q1.body.routeId) })) fd.append(k, v);
  const sub = await fetch(`${B}/api/tools/h3-video/jobs`, { method: 'POST', body: fd }); const sb: any = await sub.json(); assert.equal(sub.status, 200, JSON.stringify(sb)); assert.equal(sb.route, svc.routeId); assert.equal(sb.cost, q1.body.credits);
  ok(`remembered ${svc.name}: quote, row and job all on ${svc.routeId}; charge ${sb.cost} = quote ${q1.body.credits}`);
  await putRouting({ perTool: {} }); const q2 = await price('h3-video', { ...T, duration: '8', resolution: '1080p', model: 'ltx-2.5-pro' }); assert.equal(q2.status, 200); ok(`cleared: back to the automatic pick (${q2.body.routeId})`);
  console.log('route-choices: all ok');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); }
