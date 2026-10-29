// Library databases (2026-10-27): server/src/shared/bm25.ts, shared/libraryWorkflows.ts, libraryDb.ts.
// Ranking basics (a word in the name beats the same word in a description; prefix while typing; all words), the workflows index (every
// workflow, chain and skill; ideas parsed and never runnable), the references index (results, uploads, examples; filters, paging, tags) and
// privacy (no file system path, no remote URL, nothing from a job's input but the prompt). Run: npx tsx test/library-db.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_BACKEND = 'mock';
if (!process.env.OPENHIGGSFIELD_DATA_DIR) process.env.OPENHIGGSFIELD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ohf-lib-'));
const DATA = process.env.OPENHIGGSFIELD_DATA_DIR!; fs.mkdirSync(DATA, { recursive: true });
const IDEAS = path.join(DATA, 'ideas-test.json'); process.env.OPENHIGGSFIELD_WORKFLOW_IDEAS = IDEAS;
fs.writeFileSync(IDEAS, JSON.stringify({ entries: [
  { id: 'img-relight-ref', name: 'Relight from a reference picture', job: 'copy the light of one photo onto another', category: 'image', steps: ['load', 'relight'], inputs: ['image', 'image'], outputs: ['image'], models: ['Qwen Image Edit'], runs_on: ['local'], price_per_run: 'free local', source_url: 'https://example.com/x', source_title: 'Example', author: 'Someone', licence: 'MIT' },
  { id: 'aud-stems', name: 'Split a song into stems', job: 'vocals and music apart', category: 'audio', steps: [], inputs: ['audio'], outputs: ['audio'], models: [], runs_on: [], source_url: 'file:///etc/passwd' },
  { nonsense: true },
] }));
const ok = (m: string) => console.log('ok ' + m);
const ROOT = path.resolve(import.meta.dirname, '../..');

// ---------------------------------------------------------------- ranking
const { Bm25Index, keywords, stem } = await import('../src/shared/bm25.ts');
const ix = new Bm25Index([
  { id: 'desc', name: 'Change a photo', text: 'Relight a portrait and move the light anywhere' },
  { id: 'name', name: 'Relight', text: 'Move and recolour the light in a photo' },
  { id: 'other', name: 'Upscale', text: 'Sharper and bigger pictures' },
  { id: 'idea', name: 'Relight', text: 'Move the light', prior: 0.8 },
]);
assert.deepEqual(ix.search('relight').map((h) => h.id).slice(0, 2), ['name', 'idea'], 'name beats description; a lower prior ranks under');
assert.equal(ix.search('relight').at(-1)!.id, 'desc', 'the description match is last');
assert.equal(ix.search('relig')[0].id, 'name', 'the last word matches as a prefix while typing');
assert.deepEqual(ix.search('relight sharper').map((h) => h.id), [], 'every word must match (short query: no partial)');
assert.equal(ix.search('').length, 4, 'empty query lists everything');
assert.ok(ix.search('pictures sharper bigger nothing').every((h) => h.partial), '3+ words with no full match → partial hits');
assert.equal(stem('lights'), stem('light')); assert.equal(stem('upscaling'), stem('upscale'));
assert.ok(keywords('A small red fox with amber eyes; the fox runs to a boy. Soft light, cinematic shot.').slice(0, 2).includes('fox'), 'auto tags: the subject first');
assert.ok(!keywords('cinematic shot, soft light, slow camera').length, 'auto tags: no filler words');
ok('ranking: name > description, prior, prefix, all words, partial; auto tags');

// ---------------------------------------------------------------- workflows
const W = await import('../src/shared/libraryWorkflows.ts');
const { WF_ENTRIES, WF_CHAINS } = await import('../src/shared/workflowCatalog.ts');
const cat = W.catalogWorkflows();
assert.equal(cat.filter((w) => w.kind === 'workflow').length, WF_ENTRIES.length, 'every workflow');
assert.equal(cat.filter((w) => w.kind === 'chain').length, WF_CHAINS.length, 'every chain');
assert.equal(new Set(cat.map((w) => w.id)).size, cat.length, 'unique ids');
for (const w of cat) { assert.ok(w.mediaOut.length && w.mediaIn.length, `${w.id}: media in and out`); assert.ok(w.steps.length, `${w.id}: steps`); }
const presenter = cat.find((w) => w.id === 'c-presenter')!; assert.deepEqual(presenter.steps.map((s) => s.toolId), ['create-image', 'voice', 'voice'], 'chain steps in order (portrait, voiceover, lip sync)');
assert.ok(cat.find((w) => w.id === 'w-v-loop')!.examples[0]?.prompt, 'a workflow with a real example carries its prompt');

const { readIdeas, workflowsDb, canvasHint, publicUrl, cleanText, searchReferences, registerLibrary, webpDims } = await import('../src/libraryDb.ts');
const ideas = readIdeas();
assert.equal(ideas.length, 2, 'ideas parsed, junk skipped');
assert.ok(ideas.every((i) => i.status === 'idea' && !i.runs.runnable && i.runs.href === null), 'ideas are never runnable');
assert.equal(ideas[1].source?.url, null, 'a non-http source URL is dropped');
assert.equal(canvasHint(ideas[0]).ok, false, 'an idea never goes on the canvas');

const skills = fs.readdirSync(path.join(ROOT, 'skills')).filter((d) => fs.existsSync(path.join(ROOT, 'skills', d, 'SKILL.md')));
const db = await workflowsDb(async () => []);
assert.equal(db.list.filter((w) => w.kind === 'skill').length, skills.length, `every skill (${skills.length})`);
assert.ok(db.list.some((w) => w.id === 's-video-pacing'), 'the video-pacing skill is in');
assert.ok(db.list.find((w) => w.id === 's-ugc-ad')!.steps.some((s) => s.toolId === 'h3-video'), 'a skill lists the tools it calls');
const r1 = W.searchWorkflows(db.list, db.index, { q: 'relight', limit: 5 });
assert.equal(r1.items[0].id, 'w-i-relight', 'Relight first');
assert.ok(r1.items.findIndex((x) => x.kind === 'idea') > 0, 'the idea ranks under the built Relight');
assert.ok(W.searchWorkflows(db.list, db.index, { q: 'relight', status: 'ready', limit: 50 }).items.every((x) => x.status === 'ready'), 'status filter');
const m3 = W.searchWorkflows(db.list, db.index, { media: '3d', limit: 200 }); assert.ok(m3.total > 0 && m3.items.every((x) => x.mediaIn.includes('3d') || x.mediaOut.includes('3d')), 'media filter');
const p1 = W.searchWorkflows(db.list, db.index, { limit: 5, offset: 0 }), p2 = W.searchWorkflows(db.list, db.index, { limit: 5, offset: 5 });
assert.equal(p1.total, db.list.length); assert.ok(!p1.items.some((x) => p2.items.some((y) => y.id === x.id)), 'offset pages');
const hint: any = canvasHint(presenter); assert.equal(hint.tool, 'canvas_batch'); assert.deepEqual(hint.args.items[1].inputs_from, ['k1'], 'canvas plan wires the steps');
ok(`workflows: ${db.list.length} rows (${skills.length} skills, ${ideas.length} ideas), search, filters, paging, canvas plan`);

// ---------------------------------------------------------------- references
assert.equal(publicUrl('/files/abc.png'), '/files/abc.png'); assert.equal(publicUrl(path.join(DATA, 'abc.png')), null); assert.equal(publicUrl('https://x.example/a.png?token=k'), null);
assert.equal(publicUrl('/files/../etc/passwd'), null); assert.ok(!cleanText(`see ${DATA}/x.png and /Users/me/secret.png`).includes('/Users/'));
const { jobs } = await import('../src/jobs.ts'); const lib = await import('../src/library.ts'); const { recordUpload } = await import('../src/mediaLibrary.ts');
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000400000002008060000001fa8e7f3', 'hex');
const now = Date.now(); const proj = lib.createProject('Koi poster');
const job = (id: string, prompt: string, file: string, ago: number, extra: any = {}) => { fs.writeFileSync(path.join(DATA, file), png);
  jobs.set(id, { id, toolId: 'create-image', provider: 'mock', status: 'done', stage: 'done', progress: 100, queuePos: 0, eta: 0, resultUrl: `/files/${file}`, outputs: [{ label: 'Result', url: `/files/${file}` }],
    error: null, warnings: [], input: { prompt, imagePath: path.join(DATA, 'private-input.png') }, createdAt: now - ago, finishedAt: now - ago, ...extra } as any); };
job('b0000001', 'A red paper koi lantern over a rainy alley', 'b0000001-out0.png', 1000);
job('b0000002', 'Portrait of an old fisherman on a pier, koi pond behind', 'b0000002-out0.png', 2000);
job('b0000003', 'A secret in the trash', 'b0000003-out0.png', 3000);
job('b0000004', 'Points at a host file', 'x.png', 4000, { outputs: [{ label: 'Result', url: path.join(DATA, 'x.png') }], resultUrl: path.join(DATA, 'x.png') });
job('b0000005', 'Missing file', 'gone.png', 5000); fs.rmSync(path.join(DATA, 'gone.png'));
for (let i = 0; i < 30; i++) job(`c00000${String(i).padStart(2, '0')}`, `Batch picture number ${i} of a mountain`, `c${i}-out0.png`, 10_000 + i);
lib.setFavourite('b0000001', true); lib.setProject('b0000001', proj.id); lib.trash('b0000003');
fs.writeFileSync(path.join(DATA, 'upl-test1.png'), png); recordUpload({ id: 'upl-test1', url: '/files/upl-test1.png', name: 'my sketch.png', type: 'image', createdAt: now - 500 });

let r = await searchReferences({ q: 'koi', source: 'generated' });
assert.deepEqual(r.items.map((x) => x.jobId), ['b0000001', 'b0000002'], 'koi: both results, the closer match first');
assert.equal(r.items[0].project?.name, 'Koi poster'); assert.equal(r.items[0].favourite, true); assert.equal(r.items[0].width, 64, 'image size from its header');
assert.ok(r.items[0].tags.includes('lantern'), 'auto tags from the prompt');
assert.equal((await searchReferences({ fav: '1' })).total, 1, 'favourite filter');
assert.equal((await searchReferences({ project: proj.id })).total, 1, 'project filter');
assert.equal((await searchReferences({ q: 'secret' })).total, 0, 'trashed results are left out');
assert.equal((await searchReferences({ q: 'host file' })).total, 0, 'an output that is a host path is left out');
assert.equal((await searchReferences({ q: 'missing' })).total, 0, 'an output whose file is gone is left out');
assert.equal((await searchReferences({ source: 'uploaded' })).items[0]?.title, 'my sketch.png', 'uploads');
assert.equal((await searchReferences({ source: 'example' })).total, 0, 'no separate example source: the Examples project\'s results are generations (2026-10-29)');
assert.ok((await searchReferences({ kind: 'video', limit: 100 })).items.every((x) => x.kind === 'video'), 'kind filter');
assert.ok((await searchReferences({ until: String(now - 10_000), source: 'generated', limit: 100 })).items.every((x) => x.createdAt <= now - 10_000), 'date filter');
const a = await searchReferences({ q: 'mountain', source: 'generated', limit: 10 }); assert.equal(a.total, 30); assert.equal(a.nextCursor, '10');
const b = await searchReferences({ q: 'mountain', source: 'generated', limit: 10, cursor: a.nextCursor! }); assert.ok(!b.items.some((x) => a.items.some((y) => y.id === x.id)), 'cursor pages');
const last = await searchReferences({ q: 'mountain', source: 'generated', limit: 10, cursor: '20' }); assert.equal(last.nextCursor, null, 'last page has no cursor');
const everything = JSON.stringify(await searchReferences({ limit: 100 }));
assert.ok(!everything.includes(DATA) && !everything.includes('private-input') && !/\/Users\/|\/private\/var|\/tmp\//.test(everything), 'privacy: no host paths, no job inputs');
assert.equal(webpDims(path.join(ROOT, 'web/public/showcase/0f1a0117.webp'))?.width != null, true, 'webp size');
ok('references: results, uploads, examples, filters, paging, privacy');

// ---------------------------------------------------------------- routes + tags
const Fastify = (await import('fastify')).default; const app = Fastify(); registerLibrary(app, { tools: async () => [] }); await app.ready();
const id = r.items[0].id;
let res = await app.inject({ method: 'POST', url: `/api/library/references/${id}/tags`, payload: { tag: 'Hero Shot!' } }); assert.equal(res.statusCode, 200); assert.ok(res.json().userTags.includes('hero shot'));
assert.equal((await searchReferences({ tag: 'hero shot' })).total, 1, 'tag filter');
assert.equal((await searchReferences({ q: 'hero' })).items[0]?.id, id, 'a user tag is searchable');
res = await app.inject({ method: 'POST', url: `/api/library/references/${id}/tags`, payload: { tag: '' } }); assert.equal(res.statusCode, 400);
res = await app.inject({ method: 'DELETE', url: `/api/library/references/${id}/tags/hero%20shot` }); assert.ok(!res.json().userTags.includes('hero shot'), 'untag');
assert.equal((await app.inject({ method: 'GET', url: '/api/library/references/nope' })).statusCode, 404);
assert.equal((await app.inject({ method: 'GET', url: '/api/library/workflows/nope' })).statusCode, 404);
res = await app.inject({ method: 'GET', url: '/api/library/workflows?q=talking%20portrait&limit=3' }); assert.ok(res.json().items.length > 0);
res = await app.inject({ method: 'GET', url: '/api/library/workflows/c-presenter' }); assert.equal(res.json().canvas.tool, 'canvas_batch');
await app.close();
ok('routes: workflows, references, tag / untag, 404s');
process.exit(0);
