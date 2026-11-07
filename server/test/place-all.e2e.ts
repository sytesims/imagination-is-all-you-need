// Every place is a plugin (plan Phase 2: services/places.ts, plugins-builtin/place-*.ts, profiles/desktop.yml).
// In process (no server): each place plugin declares only its own keys (every route a place runs names only keys its plugin declares; legacy
// still '*'); each place turned off in a boot hides its routes and quotes say it isn't set up (409 place_off), on again shows them; place-sample
// off → no sample runs (demoAuto / freeSamples off); a cost and outputs a place reports never change what is charged, and our own request id
// is on the attempt before the place is called.
// E2E (own mock server, no key, mock backend): a profile with only fal, Replicate and samples refuses a submit on your computer and on Comfy
// Cloud with 409 place_off, and nothing is charged.
// Run: npx tsx test/place-all.e2e.ts
import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { testPort } from './_ports.js';
const ok = (m: string) => console.log('ok ' + m);
const ROOT = path.resolve(import.meta.dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'place-all-'));
Object.assign(process.env, { OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DATA_DIR: path.join(dir, 'data'), OPENHIGGSFIELD_ENV_FILE: path.join(dir, 'none.env'), OPENHIGGSFIELD_FILMING_FILE: path.join(dir, 'nofilm.json'),
  OPENHIGGSFIELD_COMFY_DETECT_URLS: 'http://127.0.0.1:9', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_PROFILE: '', OPENHIGGSFIELD_BILLING_MODE: 'team' /* the app keeps a ledger */ });
for (const k of Object.keys(process.env)) if (/(_KEY|_TOKEN)$|^COMFY_(BASE|DEPLOY|RUNNER)_URL$/.test(k) && k !== 'OPENHIGGSFIELD_MOCK_KEYS') delete process.env[k];
const ALL = ['place-comfy-local', 'place-comfy-cloud', 'place-comfy-router', 'place-fal', 'place-replicate', 'place-sunra', 'place-direct', 'place-sample'];
const TOOLS = ['studio-video', 'studio-image', 'studio-audio', 'studio-3d', 'studio-edit', 'apps-gallery', 'workflow-folders']; // the studios and workflow folders (Phase 3)
/** Installable places: shipped, not in the desktop profile (place-kie). */
const INSTALLABLE = ['place-kie'];
const KIND: Record<string, string> = { 'place-comfy-local': 'local', 'place-comfy-cloud': 'comfy-cloud', 'place-comfy-router': 'comfy-router', 'place-fal': 'fal', 'place-replicate': 'replicate', 'place-direct': 'direct' };

const { readProfile } = await import('../src/kernel/profile.js');
assert.deepEqual(readProfile('desktop').plugins, [...ALL, ...TOOLS, 'legacy']);
const { BUILTIN_PLUGINS, boot } = await import('../src/boot.js');
const { places, PLACE_PLUGIN } = await import('../src/services/places.js');
const { allRoutesFor, routesFor, findRoute } = await import('../src/routing/routes.js'); const { listTools, getTool } = await import('../src/tools/registry.js');
const { option, plan, demoAuto, freeSamples } = await import('../src/routing/select.js');
await import('../src/routing/run.js'); // loads the built-in places for code that runs without a boot

// ---- each place declares only its own keys ----
const seen = new Map<string, any>(); for (const t of listTools()) for (const id of t.providers) for (const r of allRoutesFor(id, t)) seen.set(r.routeId, r);
const routes = [...seen.values()]; const decl: Record<string, string[]> = {};
for (const id of [...ALL, ...INSTALLABLE]) decl[id] = (await BUILTIN_PLUGINS[id]()).default.keys as string[];
for (const r of routes) {
  const runner = places.runnerOf(r); const names = [r.envKey, ...(r.envAliases ?? [])].filter(Boolean) as string[];
  if (!runner && r.kind === 'kie') { for (const k of names) assert.ok(decl['place-kie'].includes(k), `${r.routeId}: ${k} is declared by place-kie`); continue; } // installable: off without its plugin
  if (!runner) { assert.equal(r.kind, 'direct', `${r.routeId}: only 'direct' routes without a lab connection run outside a place`); assert.ok(!r.direct); continue; }
  for (const k of names) assert.ok(decl[PLACE_PLUGIN[r.kind as keyof typeof PLACE_PLUGIN]].includes(k), `${r.routeId}: ${k} is declared by ${PLACE_PLUGIN[r.kind as keyof typeof PLACE_PLUGIN]}`);
}
const owner = new Map<string, string[]>(); for (const [id, ks] of Object.entries(decl)) for (const k of ks) owner.set(k, [...(owner.get(k) ?? []), id]);
for (const [k, ids] of owner) assert.ok(ids.length === 1 || (k === 'COMFY_API_KEY' && ids.sort().join() === 'place-comfy-cloud,place-comfy-router'), `${k} is declared by one place (the Comfy key: Cloud and Router, one account)`);
assert.deepEqual(decl['place-comfy-local'], []); assert.deepEqual(decl['place-sample'], []);
assert.equal((await BUILTIN_PLUGINS.legacy()).default.keys, '*', 'legacy still reads every key (what is left: the report lists it)');
ok(`keys: ${routes.length} routes; every route a place runs names only keys its plugin declares; each key has one place (the Comfy key: Cloud + Router); local and samples declare none`);

// ---- each place off → hidden, "not set up", 409 place_off; on again → back ----
const MODEL: Record<string, [string, string, string]> = { // a tool, a model and one of its routes on that place
  local: ['create-image', 'comfy-qwen-image', 'local:comfy-qwen-image'], 'comfy-router': ['create-image', 'api-nano-banana', 'comfy-router:api-nano-banana'],
  'comfy-cloud': ['h3-video', 'cloud-h3-wf', 'comfy-cloud:cloud-h3-wf'], fal: ['create-image', 'comfy-qwen-image', 'fal:fal-ai/qwen-image'],
  replicate: ['create-image', 'comfy-qwen-image', 'replicate:qwen/qwen-image'], direct: ['create-image', 'api-nano-banana', 'direct:google/gemini-3.1-flash-image'] };
for (const [kind, [, , rid]] of Object.entries(MODEL)) assert.ok(findRoute(rid)?.kind === kind, `${rid} is a ${kind} route`);
const ctx = await boot({ name: 'all', plugins: [...ALL, ...TOOLS, 'legacy'], file: 'all.yml' }, { legacy: false });
assert.equal(places.managed, true); assert.deepEqual(places.list().map((p) => p.kind), ['local', 'comfy-cloud', 'comfy-router', 'fal', 'replicate', 'sunra', 'direct', 'sample']);
const fibers = new Map<string, any>(); { const { mounted } = await import('../src/kernel/index.js'); for (const m of mounted) fibers.set(m.name, m.fiber); }
for (const id of Object.keys(KIND)) {
  const kind = KIND[id]; const [toolId, modelId, rid] = MODEL[kind]; const tool = getTool(toolId)!; const r = findRoute(rid)!;
  assert.ok(routesFor(modelId, tool).some((x) => x.routeId === rid), `${id} on: ${rid} listed`);
  await fibers.get(id).dispose(); assert.equal(places.off(kind), true, `${id} off`);
  assert.ok(!routesFor(modelId, tool).some((x) => x.kind === kind), `${id} off: its routes are hidden`);
  const o = option(tool, r, {}); assert.equal(o.available, false); assert.equal(o.reasonCode, 'not_wired'); assert.match(o.reason!, /isn’t set up in this app$/); assert.match(o.reasonDetail!, new RegExp(`${id} plugin is off`));
  const p: any = plan(tool, modelId, {}, 1, { route: rid }); assert.equal(p.status, 409, `${id} off: a quote naming ${rid} is refused`); assert.equal(p.code, 'place_off'); assert.match(p.error, /isn’t set up in this app.*Nothing was charged\./);
  const f = ctx.plugin((await BUILTIN_PLUGINS[id]()).default as any); await f; fibers.set(id, f);
  assert.equal(places.off(kind), false); assert.ok(routesFor(modelId, tool).some((x) => x.routeId === rid), `${id} on again: ${rid} listed again`);
}
ok('each place (your computer, Comfy Cloud, Comfy Router, fal, Replicate, the labs) off → routes hidden, "isn’t set up", a quote naming it 409 place_off; on again → back');

// ---- place-sample off → no samples ----
assert.equal(demoAuto(), true, 'mock backend: samples on');
await fibers.get('place-sample').dispose(); assert.equal(places.off('sample'), true);
assert.equal(demoAuto(), false, 'place-sample off: Auto never offers a sample'); assert.equal(freeSamples(), false);
{ const f = ctx.plugin((await BUILTIN_PLUGINS['place-sample']()).default as any); await f; fibers.set('place-sample', f); } assert.equal(demoAuto(), true);
ok('place-sample off → no sample runs (demoAuto, freeSamples off); on again → back');

// ---- a reported cost / outputs never change what is charged; our request id is stored before the place is called ----
{ const { jobs } = await import('../src/jobs.js'); const { runRouted } = await import('../src/routing/run.js'); const L = await import('../src/ledger.js'); await import('../src/queue.js'); // the queue's boot recovery runs before our jobs exist
  process.env.OPENHIGGSFIELD_ROUTING_LIVE = '1';
  const { EXTRA_ROUTES } = await import('../src/routing/routes.js') as any;
  const ROUTE = { routeId: 'fal:test/cost', kind: 'fal', modelId: 'test-cost-model', endpoint: 'test/cost', priceRef: null, sourceUrl: '', checkedAt: '', typicalLatencySec: 1, latencyEstimated: true, envKey: 'TEST_PLACE_KEY', label: 'Test · fal', output: 'video', request: async () => ({}) };
  EXTRA_ROUTES['test-cost-model'] = [ROUTE];
  const real = globalThis.fetch; globalThis.fetch = (async () => new Response(Buffer.from('fake-mp4'), { headers: { 'content-type': 'video/mp4' } })) as typeof fetch; // the download only
  const seenAtRun: (string | undefined)[] = [];
  const stub = (cost: boolean) => ({ kind: 'fal' as const, label: 'fal', remote: 'fal' as const, ready: () => true, key: () => 'k', live: () => true, resume: () => true,
    async run(req: any, h: any) { seenAtRun.push(jobs.get(req.requestId.split('-a')[0])?.routeAttempts?.[0]?.clientRequestId); h.onSubmit({ kind: 'fal', id: `r-${cost}` });
      return { url: 'https://cdn.test/v.mp4', outputs: [{ kind: 'video' as const, url: 'https://cdn.test/v.mp4' }, { kind: 'audio' as const, url: 'https://cdn.test/a.mp3' }], ...(cost ? { cost: { usd: 0.42, source: 'provider' as const } } : {}), refresh: async () => undefined }; } });
  const run = async (id: string, cost: boolean) => {
    await fibers.get('place-fal').dispose(); const off = places.register(stub(cost) as any);
    const j: any = { id, toolId: 'h3-video', provider: 'test-cost-model', status: 'running', stage: 'queued', progress: 0, queuePos: 0, eta: 0, resultUrl: null, outputs: [], error: null, errorType: null, warnings: [], parentId: null, createdAt: Date.now(), input: { prompt: 'x' },
      routing: { modelId: 'test-cost-model', order: [ROUTE.routeId], prices: { [ROUTE.routeId]: 7 }, allowFallback: false, mode: 'pinned' }, routeAttempts: [] };
    jobs.set(id, j); L.charge(id, 'h3-video', ROUTE.routeId, 7); await runRouted(j, getTool('h3-video')!); off();
    const f = ctx.plugin((await BUILTIN_PLUGINS['place-fal']()).default as any); await f; fibers.set('place-fal', f);
    return { j, rows: L.ledger().entries.filter((e: any) => e.jobId?.startsWith(id)).map((e: any) => [e.kind, e.amount]) }; };
  try {
    const a = await run('jcost1', true); const b = await run('jcost0', false);
    assert.equal(a.j.status, 'done', a.j.error); assert.equal(b.j.status, 'done', b.j.error);
    assert.deepEqual(a.rows, b.rows, 'the same ledger rows with or without a reported cost'); assert.deepEqual(a.rows, [['charge', -7]], 'charged the quote, once');
    assert.deepEqual(a.j.routeAttempts[0].reportedCost, { usd: 0.42, source: 'provider' }, 'the reported cost is kept on the attempt'); assert.equal(b.j.routeAttempts[0].reportedCost, undefined);
    assert.equal(a.j.routeAttempts[0].charged, 7); assert.equal(a.j.cost, b.j.cost);
    assert.equal(a.j.outputs.length, 1, 'outputs[] is extra information: run.ts still saves the one url');
    assert.deepEqual(seenAtRun, ['jcost1-a1-o0', 'jcost0-a1-o0'], 'our request id was on the attempt before the place was called');
  } finally { globalThis.fetch = real; delete process.env.OPENHIGGSFIELD_ROUTING_LIVE; }
  ok('a reported cost and extra outputs never change the charge (same ledger rows: the quote, once); the cost is kept on the attempt; our request id is stored before the call'); }

// ---- e2e: a profile with only fal, Replicate and samples: your computer and Comfy Cloud refuse a submit, nothing charged ----
const few = path.join(dir, 'few.yml'); fs.writeFileSync(few, `name: few\nplugins:\n  - place-fal\n  - place-replicate\n  - place-sample\n${TOOLS.map((x) => `  - ${x}\n`).join('')}  - legacy\n`);
let srv: ChildProcess | null = null;
try {
  const port = testPort(9491); const B = `http://127.0.0.1:${port}`; const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v != null && !/(_KEY|_TOKEN)$/.test(k)) env[k] = v;
  srv = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...env, PORT: String(port), OPENHIGGSFIELD_PROFILE: few, OPENHIGGSFIELD_DEMO_AUTO: '0', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(dir, 'srv-')) } });
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }
  const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
  assert.equal((await get('/api/health')).backend, 'mock');
  const sub = async (toolId: string, f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); const r = await fetch(`${B}/api/tools/${toolId}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: (await r.json()) as any }; };
  const before = (await get('/api/ledger')).entries?.length ?? 0;
  const ids = ((await get('/api/routes?toolId=create-image')).routes as any[]).flatMap((m) => m.routes.map((x: any) => x.routeId as string));
  assert.ok(ids.length && ids.every((id) => /^(fal|replicate):/.test(id)), 'only fal and Replicate routes are listed');
  const q = await get('/api/models/quote?model=comfy-qwen-image&route=local:comfy-qwen-image'); assert.equal(q.runnable, false); assert.equal(q.noProvider?.code, 'place_off'); assert.match(q.noProvider?.error, /^Your computer isn’t set up in this app/);
  const a = await sub('create-image', { prompt: 'a red bicycle', types: '["generate"]', provider: 'comfy-qwen-image', route: 'local:comfy-qwen-image' }); assert.equal(a.status, 409); assert.equal(a.body.code, 'place_off'); assert.match(a.body.error, /Nothing was charged/);
  const c = await sub('h3-video', { prompt: 'a fox', types: '["t2v"]', provider: 'comfy-h3', route: 'comfy-cloud:cloud-h3-wf' }); assert.equal(c.status, 409, JSON.stringify(c.body)); assert.equal(c.body.code, 'place_off');
  assert.equal((await get('/api/ledger')).entries?.length ?? 0, before, 'nothing charged');
  ok('profile with only fal, Replicate and samples: only their routes listed; a quote on your computer says not set up; submits on your computer and Comfy Cloud → 409 place_off, nothing charged');
} finally { if (srv?.pid) try { process.kill(-srv.pid, 'SIGTERM'); } catch { /* gone */ } }
process.exit(0);
