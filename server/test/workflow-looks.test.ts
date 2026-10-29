// Workflows pages (2026-10-23): saved looks (table user_looks) and their API, and runs linked to a look (job.input.lookId).
// Covers: Save as look from a finished image (workflow, typed prompt, settings, model), what it refuses (sample, video, failed, unknown, bad names),
// the look on its workflow page and its own page (per model: "made for this one", runs, untested models with the server's quote), a run started
// from a look (input.lookId) joining the look's results, a trashed job / missing file falling back to the next example and then hiding the look,
// rename, delete, the row in SQLite, and built-in presets showing only with a real example. Optional: `npx tsx test/workflow-looks.test.ts <base>`
// also submits a run with lookId to a running mock server and checks it lands on job.input.lookId (POST /api/tools/:id/jobs).
// Run: npx tsx test/workflow-looks.test.ts   (in-process, temp data dir, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'wflooks-'));
process.env.OPENHIGGSFIELD_DATA_DIR = D; process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const ok = (m: string) => console.log('ok ' + m);
const Fastify = (await import('fastify')).default;
await import('../src/tools/apps.ts'); const { getTool } = await import('../src/tools/registry.ts');
const { imageWorkflowsPayload } = await import('../src/shared/workflows.ts');
const { validateImagePresets } = await import('../src/shared/presets.ts');
const { jobs } = await import('../src/jobs.ts'); const lib = await import('../src/library.ts'); const { db } = await import('../src/db.ts');
const { formFromInput } = await import('../src/routesPrefill.ts');
const WL = await import('../src/workflowLooks.ts');

const presets = validateImagePresets(getTool as any).ok; const recipes = imageWorkflowsPayload(getTool as any).workflows;
const app = Fastify();
const quoted: string[] = [];
app.get<{ Params: { id: string }; Querystring: Record<string, string> }>('/api/tools/:id/price', async (req) => { quoted.push(`${req.params.id}:${req.query.provider}`); return { credits: 7, runOn: 'comfy-cloud', routeId: 'comfy-router:x', priceAvailable: true, runnable: true, demo: false, needsKey: false }; });
WL.registerWorkflowLooks(app, { getTool: getTool as any, presets: () => presets, recipes: () => recipes as any }, (t, j) => formFromInput(t, j as any, { sameSeed: false }).form);
await app.ready();
const call = async (method: string, url: string, body?: unknown) => { const r = await app.inject({ method: method as any, url, ...(body ? { payload: body as any } : {}) }); return { status: r.statusCode, body: r.json() as any }; };

let n = 0; const now = Date.now();
const file = (name: string) => { fs.writeFileSync(path.join(D, name), 'x'); return `/files/${name}`; };
const job = (o: Record<string, any>) => { const id = `j${++n}`; const url = o.url ?? file(`${id}-out0.png`);
  const j: any = { id, toolId: 'create-image', provider: 'comfy-zimage-turbo', status: 'done', stage: 'done', progress: 100, queuePos: 0, eta: 0, resultUrl: url, outputs: [{ label: 'Result', url }], error: null, warnings: [],
    input: { types: ['generate'], mode: 'generate', prompt: 'a lighthouse at dusk, long exposure', aspect: '3:4', style: 'golden-hour', n: 1 }, createdAt: now + n, startedAt: now + n, finishedAt: now + n + 4000, cost: 0, runOn: 'local', ...o };
  jobs.set(id, j); return j; };

// ---- save a look from a finished image
const j1 = job({});
let r = await call('POST', '/api/user-looks', { jobId: j1.id, name: '  Lighthouse   dusk ' });
assert.equal(r.status, 201, JSON.stringify(r.body)); const look = r.body;
assert.match(look.id, /^my-[a-z0-9]{8}$/); assert.equal(look.name, 'Lighthouse dusk'); assert.equal(look.workflow, 'create-image');
assert.equal(look.prompt, 'a lighthouse at dusk, long exposure'); assert.deepEqual(look.settings, { aspect: '3:4', style: 'golden-hour' }); assert.equal(look.provider, 'comfy-zimage-turbo'); assert.equal(look.exampleUrl, j1.outputs[0].url);
const row = db.prepare('SELECT data FROM user_looks WHERE id = ?').get(look.id) as { data: string } | undefined; assert.ok(row && JSON.parse(row.data).jobId === j1.id, 'stored in SQLite');
ok('Save as look: workflow, typed prompt, settings and model from the job; stored in user_looks');
// duplicate names are allowed (the page shows the date)
r = await call('POST', '/api/user-looks', { jobId: j1.id, name: 'Lighthouse dusk' }); assert.equal(r.status, 201); const dup = r.body;
// a workflow job with no prompt (Upscale): allowed, prompt empty
const up = job({ toolId: 'image-upscale', provider: 'comfy-ultrasharp', input: { scale: 4, imageUrl: null } }); r = await call('POST', '/api/user-looks', { jobId: up.id, name: 'Sharp 4x' });
assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.workflow, 'upscale'); assert.equal(r.body.prompt, '');
ok('duplicate names allowed; a no-prompt workflow (Upscale) saves with an empty prompt');
// refused: sample, video, failed, trashed, unknown job, no name, too long
const refuse = async (body: any, code: string) => { const x = await call('POST', '/api/user-looks', body); assert.equal(x.status, code === 'not_found' ? 404 : 400, JSON.stringify(x.body)); if (code !== 'not_found') assert.equal(x.body.code === code || x.body.issues?.[0]?.code === code, true, `${code}: ${JSON.stringify(x.body)}`); };
await refuse({ jobId: job({ simulated: true }).id, name: 'x' }, 'sample');
await refuse({ jobId: job({ routing: { demo: { code: 'demo_preview' } } }).id, name: 'x' }, 'sample');
await refuse({ jobId: job({ url: file('v.mp4') }).id, name: 'x' }, 'not_image');
await refuse({ jobId: job({ status: 'failed' }).id, name: 'x' }, 'not_done');
{ const t = job({}); lib.trash(t.id); await refuse({ jobId: t.id, name: 'x' }, 'trashed'); }
await refuse({ jobId: job({ toolId: 'h3-video' }).id, name: 'x' }, 'no_workflow');
await refuse({ jobId: 'nope', name: 'x' }, 'not_found');
await refuse({ jobId: j1.id, name: '   ' }, 'required'); await refuse({ jobId: j1.id, name: 'x'.repeat(81) }, 'too_long');
ok('not offered for samples, videos, failed, trashed or non-image-workflow jobs; names required and ≤ 80');

// ---- on its workflow page, and its own page
r = await call('GET', '/api/workflow-hub/create-image'); assert.equal(r.status, 200);
const tile = r.body.looks.find((l: any) => l.id === look.id); assert.ok(tile, 'look listed'); assert.equal(tile.kind, 'mine'); assert.equal(tile.cover.url, j1.outputs[0].url); assert.equal(tile.cover.paid.runOn, 'local');
assert.ok(r.body.best.length >= 2 && r.body.best.length <= 3 && r.body.best.every((b: any) => b.quote?.credits === 7), 'Best on: 2–3 models with the server quote');
assert.ok(!r.body.looks.some((l: any) => l.id === 'paper-diorama'), 'a built-in preset without an example stays hidden');
assert.ok(r.body.looks.some((l: any) => l.id === 'golden-haze'), 'a built-in preset with its repo example shows');
r = await call('GET', `/api/workflow-hub/create-image/looks/${look.id}`); assert.equal(r.status, 200);
assert.equal(r.body.results.length, 1); assert.equal(r.body.results[0].made, true); assert.equal(r.body.results[0].provider, 'comfy-zimage-turbo'); assert.equal(r.body.results[0].latest.renderMs, 4000);
assert.ok(r.body.untested.length === 2 && r.body.untested.every((u: any) => u.provider !== 'comfy-zimage-turbo' && u.quote.credits === 7), 'two untested models, quoted');
assert.ok(quoted.some((q) => q.startsWith('create-image:')), 'quotes go to the runner tool');
ok('workflow page lists it (cover, price paid, Best on); look page: made-for model, run time, 2 untested with quotes');

// ---- a run started from the look joins its results (input.lookId), newest per model
const j2 = job({ provider: 'api-nano-banana', runOn: 'comfy-cloud', cost: 8, input: { ...j1.input, lookId: look.id } });
job({ provider: 'api-nano-banana', runOn: 'comfy-cloud', cost: 8, simulated: true, input: { ...j1.input, lookId: look.id } }); // a sample run never counts
r = await call('GET', `/api/workflow-hub/create-image/looks/${look.id}`);
assert.equal(r.body.results.length, 2); const nb = r.body.results.find((x: any) => x.provider === 'api-nano-banana'); assert.equal(nb.made, false); assert.equal(nb.runs, 1); assert.equal(nb.latest.paid.credits, 8);
assert.equal(r.body.results[0].made, true, 'the made-for model first'); assert.ok(!r.body.untested.some((u: any) => u.provider === 'api-nano-banana'), 'a tested model is no longer untested');
// a built-in preset gathers its runs the same way
job({ provider: 'api-gpt-image', input: { ...j1.input, lookId: 'golden-haze' } });
r = await call('GET', '/api/workflow-hub/create-image/looks/golden-haze'); assert.ok(r.body.results.some((x: any) => x.provider === 'api-gpt-image')); assert.ok(r.body.results.some((x: any) => x.latest.jobId === null), 'repo example kept');
ok('runs with input.lookId join the look (user and built-in); samples ignored; tested models leave the untested list');

// ---- the example's job trashed → next example; file gone too → hidden
lib.trash(j1.id); r = await call('GET', '/api/workflow-hub/create-image');
assert.equal(r.body.looks.find((l: any) => l.id === look.id)?.cover.url, j2.outputs[0].url, 'falls back to the linked run');
fs.rmSync(path.join(D, `${j2.id}-out0.png`)); r = await call('GET', '/api/workflow-hub/create-image');
assert.ok(!r.body.looks.some((l: any) => l.id === look.id), 'no example left: hidden'); assert.equal((await call('GET', `/api/workflow-hub/create-image/looks/${look.id}`)).status, 404);
ok('trashed example → next example; none left → hidden here (404 on its page)');

// ---- rename, delete, and the image-presets view the Create bar reads
r = await call('PATCH', `/api/user-looks/${dup.id}`, { name: 'Night lighthouse' }); assert.equal(r.status, 200); assert.equal(r.body.name, 'Night lighthouse');
assert.equal((await call('PATCH', `/api/user-looks/${dup.id}`, { name: '' })).status, 400); assert.equal((await call('PATCH', '/api/user-looks/my-00000000', { name: 'x' })).status, 404);
const asPresets = WL.userLooksAsPresets(getTool as any, () => recipes as any) as any[]; const p = asPresets.find((x) => x.id === dup.id);
assert.ok(p && p.ready && p.available && p.workflow === 'create-image' && p.href === `/tools/create-image?preset=${dup.id}` && p.provider === 'comfy-zimage-turbo', 'opens in Create via ?preset=');
r = await call('DELETE', `/api/user-looks/${dup.id}`); assert.equal(r.status, 200); assert.equal((await call('DELETE', `/api/user-looks/${dup.id}`)).status, 404);
assert.ok(!db.prepare('SELECT 1 FROM user_looks WHERE id = ?').get(dup.id), 'row deleted');
ok('rename (name required), delete (row gone), and saved looks served as Create presets');

// ---- the hub: every image workflow once, intents, honest examples
r = await call('GET', '/api/workflow-hub'); const ids = r.body.workflows.map((w: any) => w.id);
assert.equal(ids[0], 'create-image'); assert.equal(new Set(ids).size, ids.length); assert.ok(r.body.workflows.every((w: any) => w.intents.length > 0 && w.models.length > 0));
assert.equal(r.body.workflows.find((w: any) => w.id === 'character-sheet').example.kind, 'split'); assert.equal(r.body.workflows.find((w: any) => w.id === 'upscale').example.kind, 'split');
assert.equal(r.body.workflows.find((w: any) => w.id === 'erase').example, null, 'no example yet');
ok(`hub: ${ids.length} image workflows, Create Image first, repo before/after where there is one, null otherwise`);
await app.close();

// ---- optional e2e: the submit keeps lookId on the job input
const base = process.argv[2];
if (base) {
  const fd = new FormData(); for (const [k, v] of Object.entries({ types: '["generate"]', prompt: 'look link test', provider: 'comfy-zimage-turbo', aspect: '1:1', lookId: 'golden-haze' })) fd.append(k, v);
  const s = await fetch(`${base}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); const b = await s.json() as any; assert.equal(s.status, 200, JSON.stringify(b));
  const jj = await (await fetch(`${base}/api/jobs/${b.id}`)).json() as any; assert.equal(jj.input.lookId, 'golden-haze');
  const bad = new FormData(); for (const [k, v] of Object.entries({ types: '["generate"]', prompt: 'x', provider: 'comfy-zimage-turbo', lookId: '../../etc' })) bad.append(k, v);
  const s2 = await fetch(`${base}/api/tools/create-image/jobs`, { method: 'POST', body: bad }); const b2 = await s2.json() as any; const j3 = await (await fetch(`${base}/api/jobs/${b2.id}`)).json() as any; assert.equal(j3.input.lookId, undefined);
  ok('submit: lookId lands on job.input (a bad id is dropped)');
}
fs.rmSync(D, { recursive: true, force: true });
process.exit(0);
