// Workflows page v2 (2026-10-23): the shipped showcase (server/src/shared/showcase.ts) and "See how it was made" from your own favourites.
// Covers: every image / thumb / before / crop file exists under web/public and stays a sensible size; ids unique; every pair, hero, feature and gallery
// id resolves; pairs share a prompt on two different models; workflows and model names are real; GET /api/workflow-hub/made lists favourite or liked
// real image results (newest first) and never samples, trashed results or non-image jobs.
// Run: npx tsx test/showcase.test.ts   (in-process, temp data dir, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'showcase-'));
process.env.OPENHIGGSFIELD_DATA_DIR = D; process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const ok = (m: string) => console.log('ok ' + m);
const PUB = path.resolve(import.meta.dirname, '../../web/public');
const { SHOWCASE, SHOWCASE_PAIRS, SHOWCASE_HERO, SHOWCASE_FOR, SHOWCASE_GALLERY, showcaseById } = await import('../src/shared/showcase.ts');
const { workflowFor, modelNameOf } = await import('../src/shared/imageFeatures.ts');

// ---- files
const file = (u: string) => { assert.match(u, /^\/showcase\/[\w-]+\.webp$/, u); const f = path.join(PUB, u.slice(1)); assert.ok(fs.existsSync(f), `missing ${u}`); return fs.statSync(f).size; };
let total = 0; const seen = new Set<string>();
for (const s of SHOWCASE) {
  assert.ok(!seen.has(s.id), `duplicate ${s.id}`); seen.add(s.id);
  const big = file(s.image), th = file(s.thumb); assert.ok(big <= 900_000, `${s.image} ${big} B`); assert.ok(th <= 160_000, `${s.thumb} ${th} B`); assert.ok(th < big, s.id);
  if (s.before) { file(s.before.image); file(s.before.thumb); if (s.before.crop) { file(s.before.crop.before); file(s.before.crop.after); } if (s.before.from) assert.ok(showcaseById(s.before.from), s.before.from); }
  assert.ok(s.width > 0 && s.height > 0 && Math.max(s.width, s.height) <= 1600, `${s.id} size`);
}
// Keep the existing generated-media budget unchanged. The longer 1080p Canvas screen recording
// is independently bounded (7 MB video + 250 KB poster), also checked in explore-flows.test.ts.
const recordingFiles = new Map([['canvas-demo.mp4', 7_000_000], ['canvas-demo.jpg', 250_000]]);
for (const [f, max] of recordingFiles) assert.ok(fs.statSync(path.join(PUB, 'showcase', f)).size < max, `${f}: bounded recording asset`);
for (const f of fs.readdirSync(path.join(PUB, 'showcase'))) if (!recordingFiles.has(f)) total += fs.statSync(path.join(PUB, 'showcase', f)).size;
assert.ok(total < 67_000_000, `showcase folder ${total} B`); // 67 MB since Oct 31: the Every look frames and tiles and the Your turn wall (38 small webp, ~1.4 MB). 65 MB since Oct 29: four small portrait original/result clips and the new H3 whale; each clip is separately bounded in explore-flows. 60 MB since Oct 28 (the lantern koi's 30 s cut with its title card, 3.5 MB, Explore only); 56 MB since Oct 27 (the hero film's new score/loop re-encode); // 52 MB for Explore's "Mockup to film" (the LTX film's first shot, 4 s 720p with sound, 2.3 MB, and its mockup, 1 MB, plus the painted first frame and posters) and "One character. Every angle." (four character sheets as WebP, 90–155 KB each, thumbs and faces; Mossbun's 3D web copy, a 3.3 MB GLB); 42 MB for Explore's "From one still" (two LTX-2.5 Pro image-to-video takes with sound: 6 s at 1920×1080, 2.4 MB, and 7.4 s at 1280×720, 2.3 MB; the still, its 16:9 crop and posters, 0.6 MB); 37 MB for Explore chapter 1's Sharper switch (the swap's Topaz upscale, 1920×1080, 8 s with sound, 2.8 MB); 34 MB for Explore's "One lantern, one take" (the 20 s MiniMax H3 + H3 Extend take with sound, 3.7 MB, plus its first 10 s for Recreate, 0.9 MB, and posters); 29 MB for Explore chapter 2, Image to layers (the 16.7 s 720p animation, 1.4 MB with its AAC sound design since 2026-10-27; the input poster; 13 full-canvas transparent layers, 4–58 KB each); 27 MB for Explore's "Made with LTX-2.5" (three 10 s 720p LTX-2.5 Pro clips with sound, 1.4–2.3 MB each so they stay sharp, plus posters); 21 MB before that; 16 MB since the Explore hero became the LTX-2.5 Pro painter (a 10 s 720p clip with sound, 3.5 MB, remuxed so it stays sharp), then 18 MB for the 1080p dance swap, then 21 MB for Explore chapter 1 (the H3 Character Swap clip and result, 2 × ~1 MB, plus the photo; the old chapter's media is still used elsewhere); 13 MB before
ok(`${SHOWCASE.length} showcase images: every image, thumb, before and crop present; folder ${(total / 1e6).toFixed(1)} MB (< 65 MB)`);

// ---- links
for (const [a, b] of SHOWCASE_PAIRS) { const x = showcaseById(a)!, y = showcaseById(b)!; assert.ok(x && y, `${a} ${b}`);
  assert.equal(x.prompt, y.prompt, `pair ${a}/${b}: same prompt`); assert.notEqual(x.provider, y.provider, `pair ${a}/${b}: two models`); assert.equal(x.pair, b); assert.equal(y.pair, a); }
for (const id of [...SHOWCASE_HERO, ...Object.values(SHOWCASE_FOR)]) assert.ok(showcaseById(id), id);
assert.equal(new Set(SHOWCASE_GALLERY).size, SHOWCASE_GALLERY.length, 'the gallery shows each pick once'); for (const id of SHOWCASE_GALLERY) assert.ok(showcaseById(id), id);
// the starter pack (user's picks, 2026-10-28): the gallery is its share; every other entry stays only because Explore or Workflows still shows it
{ const { EXPLORE_ONLY_SHOWCASE } = await import('../src/shared/featured.ts');
  const used = new Set([...SHOWCASE_GALLERY, ...EXPLORE_ONLY_SHOWCASE, ...SHOWCASE_PAIRS.flat(), ...SHOWCASE_HERO, ...Object.values(SHOWCASE_FOR), ...SHOWCASE.flatMap((s) => (s.before?.from ? [s.before.from] : []))]);
  for (const s of SHOWCASE) assert.ok(used.has(s.id), `${s.id}: shown somewhere (else remove it and its files)`);
  for (const id of ['c0ce448f', 'baed513e']) assert.ok(!showcaseById(id) && !fs.existsSync(path.join(PUB, `showcase/${id}.webp`)), `${id}: removed from the app`); }
for (const s of SHOWCASE) { assert.ok(['create-image', 'character-sheet', 'upscale', 'relight'].includes(s.workflow), s.workflow); assert.equal(s.runOn, 'local'); assert.equal(s.price, 'Free · on your computer');
  assert.equal(modelNameOf(s.provider) ?? s.model, s.model, `${s.id}: model name`); assert.ok(workflowFor(s.workflow, s.provider)?.file, `${s.id}: a workflow file`);
  if (s.workflow !== 'upscale') assert.ok(s.prompt.length > 20, `${s.id}: prompt`); }
ok(`${SHOWCASE_PAIRS.length} same-prompt pairs resolve (one prompt, two models); hero, feature and gallery ids resolve; every pick names its model and workflow file`);

// ---- your favourites
const Fastify = (await import('fastify')).default;
await import('../src/tools/apps.ts'); const { getTool } = await import('../src/tools/registry.ts');
const { imageWorkflowsPayload } = await import('../src/shared/workflows.ts');
const { jobs } = await import('../src/jobs.ts'); const lib = await import('../src/library.ts');
const { formFromInput } = await import('../src/routesPrefill.ts');
const WL = await import('../src/workflowLooks.ts');
const app = Fastify(); const recipes = imageWorkflowsPayload(getTool as any).workflows;
WL.registerWorkflowLooks(app, { getTool: getTool as any, presets: () => [], recipes: () => recipes as any }, (t, j) => formFromInput(t, j as any, { sameSeed: false }).form);
await app.ready();
let n = 0; const now = Date.now();
const job = (o: Record<string, any> = {}) => { const id = `s${++n}`; const name = o.ext ? `${id}.${o.ext}` : `${id}-out0.png`; fs.writeFileSync(path.join(D, name), 'x'); const url = `/files/${name}`;
  const j: any = { id, toolId: 'create-image', provider: 'comfy-zimage-turbo', status: 'done', stage: 'done', progress: 100, resultUrl: url, outputs: [{ label: 'Result', url }], error: null, warnings: [],
    input: { types: ['generate'], mode: 'generate', prompt: `prompt ${n}, golden light`, aspect: '1:1' }, createdAt: now + n, startedAt: now + n, finishedAt: now + n * 1000, cost: 0, runOn: 'local', ...o };
  delete j.ext; jobs.set(id, j); return j; };
const fav = job(); lib.setFavourite(fav.id, true);
const liked = job(); lib.setLike(liked.id, 'client-a', true);
job(); // not starred
const sample = job({ simulated: true }); lib.setFavourite(sample.id, true);
const trashed = job(); lib.setFavourite(trashed.id, true); lib.trash(trashed.id);
const video = job({ toolId: 'h3-video', ext: 'mp4' }); lib.setFavourite(video.id, true);
const r = await app.inject({ method: 'GET', url: '/api/workflow-hub/made' }); assert.equal(r.statusCode, 200); const items = (r.json() as any).items;
assert.deepEqual(items.map((x: any) => x.jobId), [liked.id, fav.id], 'favourite + liked, newest first; no sample, trash, plain or video');
const it = items[1]; assert.equal(it.workflow, 'create-image'); assert.equal(it.prompt, 'prompt 1, golden light'); assert.equal(it.modelName, 'Z-Image-Turbo'); assert.equal(it.paid.runOn, 'local'); assert.equal(it.settings.aspect, '1:1');
ok('GET /api/workflow-hub/made: your favourite / liked image results with prompt, model, settings and price; samples, trash and videos left out');
await app.close();
