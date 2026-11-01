// View workflow on the app's built-in examples (2026-11-01 review F10): Explore-only examples are seeded as owned by the community account
// (featuredSeed.ts), and GET /api/jobs/:id/workflow refused them with 403. Built-in examples are allowed now; other people's real results
// are still refused, and a hosted example still answers honestly that there is no ComfyUI graph.
// Run: npx tsx test/workflow-export-examples.test.ts   (temp data dir, no network, no server port)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-export-examples-'));
process.env.OPENHIGGSFIELD_COMFY_DETECT_URLS = 'http://127.0.0.1:9';
const Fastify = (await import('fastify')).default;
const { registerWorkflowExport } = await import('../src/routesWorkflow.ts');
const { seedFeatured, featuredIdOf } = await import('../src/featuredSeed.ts');
const { jobs } = await import('../src/jobs.ts');
const { SEED_OWNER } = await import('../src/owner.ts');
const ok = (m: string) => console.log('ok ' + m);

const app = Fastify(); registerWorkflowExport(app); await app.ready();
const get = async (url: string) => { const r = await app.inject({ method: 'GET', url }); return { status: r.statusCode, body: JSON.parse(r.body) }; };

seedFeatured();
// a hosted Explore-only example with no partner workflow file (Seedance via Comfy Router): community-owned, allowed, honest "no graph"
const sd = featuredIdOf('seedance-fashion'); const dj = jobs.get(sd) as any;
assert.ok(dj, 'the Seedance example is seeded'); assert.equal(dj.owner, SEED_OWNER); assert.equal(dj.featuredExample, 'seedance-fashion');
const info = await get(`/api/jobs/${sd}/workflow`);
assert.equal(info.status, 200, 'a built-in example is not refused');
assert.equal(info.body.available, false); assert.equal(info.body.headline, 'Not a ComfyUI workflow'); assert.equal(info.body.source, null);
const api = await get(`/api/jobs/${sd}/workflow?format=api`);
assert.equal(api.status, 409, 'no fake graph for a hosted example'); assert.equal(api.body.code, 'no_workflow');
ok('a hosted built-in example: allowed, and says it has no ComfyUI graph');

// a Shop example (Nano Banana 2 partner node): allowed, and never claims to be the exact run (same answer your own run would get)
const shop = featuredIdOf('shop-swap-velvet'); assert.equal((jobs.get(shop) as any).owner, SEED_OWNER);
const sh = await get(`/api/jobs/${shop}/workflow`);
assert.equal(sh.status, 200); assert.equal(sh.body.exact, false); assert.notEqual(sh.body.source, 'submitted'); assert.notEqual(sh.body.source, 'rebuilt');
// a local Explore-only example still shows its real graph
const lt = await get(`/api/jobs/${featuredIdOf('ltx-lighthouse')}/workflow`);
assert.equal(lt.status, 200); assert.equal(lt.body.available, true); assert.equal(lt.body.exact, true);
ok('Shop example labelled as not exact; a local Explore example shows its graph');

// someone else's real result (not an example): still refused
const other = { ...dj, id: 'otherjob1', owner: 'community:someone' }; delete other.featuredExample; delete other.seed; jobs.set(other.id, other);
const r = await get('/api/jobs/otherjob1/workflow');
assert.equal(r.status, 403); assert.equal(r.body.code, 'not_owner');
assert.equal((await get('/api/jobs/otherjob1/workflow?format=api')).status, 403);
ok("another person's result is still refused");

await app.close();
