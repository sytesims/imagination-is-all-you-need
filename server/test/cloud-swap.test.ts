// Video Swap on Comfy Router (2026-10-25): Kling 3.0 Omni Edit + Seedance 2.5 Edit (routing/routerModels.ts swapSpec, shared/cloudSwap.ts, swapClips.ts,
// tools/videoSwap.ts applySwapTrim). In process, mock backend, fake key and a FAKE Router (setRouterFetch): no network, no spend.
//  1. shared pieces: planPasses (balanced whole seconds, ≤ 10 s for Kling), clampTrim, the prompt template ("Who to replace", Kling <<<…>>> names).
//  2. bodies validate against the cached Router input schemas (kling__kling-v3-omni, byteplus__dreamina-seedance-2-5-260628); passes ≤ 10 s, ≥ 720 px.
//  3. blocks: no image, two images, range too long, Seedance without a public link, a Kling image off its aspect range.
//  4. prices: Kling 26.59 cr/s of output (8 s 720p = 101 credits), Seedance edit on (in + out) s at the video-input rate.
//  5. a full keyed run on a 25 s range: 3 Kling requests, each checked against its own share of the quote, joined into one 25 s clip with the source sound.
//  6. trim: a range is cut from the upload (sound kept); bad ranges are refused with field "trim".
// Run: npx tsx test/cloud-swap.test.ts
import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { createRequire } from 'node:module';
import { ROUTER_SCHEMA_DIR, FIXTURE_SCHEMA_DIR } from './_model-health.js';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudswap-')); const DATA = fs.mkdtempSync(path.join(D, 'data-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_COMFY_ROUTER_URL: 'https://router.test', COMFY_API_KEY: '', OPENHIGGSFIELD_PUBLIC_BASE_URL: '' });
const ok = (m: string) => console.log('ok ' + m);
const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const at = (n: string) => path.join(DATA, n);
const probeOf = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', f]).toString());
const durOf = (f: string) => Number(probeOf(f).format.duration);
const hasAudio = (f: string) => probeOf(f).streams.some((s: any) => s.codec_type === 'audio');
const sizeOf = (f: string) => { const v = probeOf(f).streams.find((s: any) => s.codec_type === 'video'); return { w: v.width, h: v.height }; };
// our own test media: a 26 s 480p clip with a tone (two "performers" are irrelevant here), a 9:16 clip, a portrait character image, a too-wide sheet
ff(['-f', 'lavfi', '-i', 'testsrc=size=854x480:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=26', '-t', '26', '-pix_fmt', 'yuv420p', '-shortest', at('src26.mp4')]);
ff(['-f', 'lavfi', '-i', 'testsrc=size=720x1280:rate=30', '-t', '8', '-pix_fmt', 'yuv420p', at('tall8.mp4')]);
ff(['-f', 'lavfi', '-i', 'color=c=teal:s=512x768', '-frames:v', '1', at('char.png')]); ff(['-f', 'lavfi', '-i', 'color=c=teal:s=1600x400', '-frames:v', '1', at('wide.png')]);
ff(['-f', 'lavfi', '-i', 'color=c=teal:s=512x768', '-frames:v', '1', at('char.gif')]);

// a fake Comfy storage (comfy/storage.ts): POST /customers/storage → signed links, PUT → 200, Seedance asset → Active at once. Returns null for other URLs.
const ST = await import('../src/comfy/storage.ts'); let uploads = 0; let assets = 0;
const storageFake = async (u: any, init: any = {}): Promise<Response | null> => { const url = String(u); const j = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (url.endsWith('/customers/storage') && init.method === 'POST') { const b = JSON.parse(init.body); uploads++; return j({ upload_url: `https://storage.test/put/${b.file_name}?sig=x`, download_url: `https://storage.test/get/${b.file_name}?sig=y` }); }
  if (url.startsWith('https://storage.test/put/') && init.method === 'PUT') { assert.equal(init.headers?.['X-API-KEY'], undefined, 'no key on the signed PUT'); return new Response('', { status: 200 }); }
  if (url.endsWith('/proxy/seedance/virtual-library/assets')) { assets++; return j({ asset_id: `asset-${assets}` }); }
  const a = url.match(/\/proxy\/seedance\/assets\/(asset-\d+)$/); if (a) return j({ id: a[1], asset_type: 'Video', group_id: 'virtual-library', status: 'Active' });
  return null; };
const CS = await import('../src/shared/cloudSwap.ts'); const M = await import('../src/routing/routerModels.ts'); const P = await import('../src/shared/pricing.ts');
// ---------------- 1. shared pieces ----------------
{
  const d = (t: number, m = 10, mn = 3) => CS.planPasses(t, m, mn).map((p) => p.dur);
  assert.deepEqual(d(8), [8]); assert.deepEqual(d(10), [10]); assert.deepEqual(d(11), [6, 5]); assert.deepEqual(d(25), [9, 8, 8]); assert.deepEqual(d(30), [10, 10, 10]); assert.deepEqual(d(4), [4]);
  assert.deepEqual(CS.planPasses(25, 10, 3).map((p) => p.start), [0, 9, 17]); assert.deepEqual(d(2), [], 'shorter than a pass: none');
  for (let t = 4; t <= 30; t++) { const ps = CS.planPasses(t, 10, 3); assert.equal(ps.reduce((a, p) => a + p.dur, 0), t); assert.ok(ps.every((p) => p.dur >= 3 && p.dur <= 10), `t=${t}`); }
  assert.deepEqual(d(30, 30, 4), [30], 'Seedance: one pass up to 30 s');
  assert.deepEqual(CS.clampTrim(40, {}, 10, 4), { start: 0, end: 10 }); assert.deepEqual(CS.clampTrim(40, { start: 35 }, 10, 4), { start: 35, end: 40 });
  assert.deepEqual(CS.clampTrim(8.4, {}, 30, 4), { start: 0, end: 8 }); assert.equal(CS.clampTrim(3, {}, 10, 4), null); assert.deepEqual(CS.clampTrim(20, { start: 2, end: 30 }, 10, 4), { start: 2, end: 12 });
  const p = CS.swapPrompt({ mode: 'object_swap', who: 'the man on the left in the black hoodie.', extra: 'film grain', video: '<<<video_1>>>', image: '<<<image_1>>>' });
  assert.match(p, /^Replace the man on the left in the black hoodie in <<<video_1>>> with the character from <<<image_1>>>\./); assert.match(p, /every other person unchanged/); assert.match(p, /film grain$/);
  assert.match(CS.swapPrompt({ mode: 'object_swap', who: '', video: 'v', image: 'i' }), /^Replace the main person in v/, 'empty who → the main person');
  assert.match(CS.swapPrompt({ mode: 'motion_transfer', video: 'v', image: 'i' }), /^Generate a new video with the character from i/);
  assert.doesNotMatch(CS.swapPrompt({ mode: 'motion_transfer', video: 'v', image: 'i' }), /exact motion|same camera movement/);
  assert.match(CS.passNote(CS.CLOUD_SWAP_MODELS['router-kling-edit'], 25), /3 passes \(9 s \+ 8 s \+ 8 s\), joined/);
  ok('shared: planPasses (balanced whole seconds, every 4–30 s range in ≤ 10 s passes), clampTrim, prompt template, pass note');
}

// ---------------- 1b. Seedance 2.5 Edit (2026-10-31): listed with its warning, never the automatic pick ----------------
{
  process.env.COMFY_API_KEY = 'test-not-a-real-key';
  const D = await import('../src/routing/defaults.ts'); const { getTool } = await import('../src/tools/registry.ts'); const { CATALOGUE } = await import('../src/shared/modelRank.ts');
  assert.equal(CS.swapNeverAuto('router-seedance-25-edit'), true); assert.equal(CS.swapNeverAuto('router-kling-edit'), false);
  assert.equal(CATALOGUE['seedance-2.5-edit'].bestFor, CS.SEEDANCE_PEOPLE_WARNING, 'the menu row says it');
  for (const id of ['object-swap', 'motion-transfer']) { const t = getTool(id)!;
    assert.ok(t.providers.includes('router-seedance-25-edit'), `${id}: still listed`);
    assert.equal(D.toolDefaults(t, { noFavourite: true }).defaultProvider, 'router-kling-edit', `${id}: Kling is the default`);
    const without = D.toolDefaults(t, { noFavourite: true, only: (x) => x !== 'router-kling-edit' }).defaultProvider; assert.notEqual(without, 'router-seedance-25-edit', `${id}: with Kling out, never Seedance (${without})`); }
  process.env.COMFY_API_KEY = '';
  ok('Seedance 2.5 Edit: listed, its row says "Often refuses photos of real people", never the automatic pick (Kling stays the default)');
}

// ---------------- 2. bodies vs the official schemas ----------------
const swapJob = (o: Record<string, any> = {}) => ({ mode: 'object_swap', swapType: 'person', videoPath: at('src26.mp4'), duration: 8, width: 854, height: 480, refPaths: [at('char.png')], target: 'the person on the left', prompt: '', resolution: '720p', keepAudio: true, seed: 42, count: 1, ...o });
const K = M.ROUTER_MODELS['router-kling-edit']; const S = M.ROUTER_MODELS['router-seedance-25-edit'];
const bodies: { k: any[]; s: any[] } = { k: [], s: [] };
{
  // with the Comfy key, clips go up to Comfy storage (fake): Kling gets the download link, Seedance a registered asset
  process.env.COMFY_API_KEY = 'test-not-a-real-key'; ST.setStorageFetch((async (u: any, i: any) => (await storageFake(u, i)) ?? new Response('nope', { status: 404 })) as typeof fetch, async () => {}); ST.clearStorageCache();
  // Kling: an 8 s edit (1 pass), a 25 s edit (3 passes), 1080p, motion transfer, a gif image (converted to PNG)
  for (const j of [swapJob(), swapJob({ duration: 25 }), swapJob({ resolution: '1080p' }), swapJob({ mode: 'motion_transfer', target: '' }), swapJob({ refPaths: [at('char.gif')] })]) {
    assert.equal(K.block!(j), null, `kling not blocked: ${K.block!(j)}`); const n = M.routerCalls(K, j); for (let k = 0; k < n; k++) bodies.k.push(await K.body(j, k)); }
  assert.equal(M.routerCalls(K, swapJob({ duration: 25 })), 3); assert.equal(M.routerCalls(K, swapJob({ duration: 25, count: 2 })), 6, 'passes × versions');
  const [e8, p1, p2, p3, pro, mt] = bodies.k;
  assert.deepEqual(e8.video_list.map((v: any) => [v.refer_type, v.keep_original_sound]), [['base', 'yes']]); assert.equal(e8.image_list.length, 1); assert.equal(e8.mode, 'std');
  assert.equal(e8.duration, undefined, 'an edit sends no duration (the clip sets it)'); assert.equal(e8.aspect_ratio, undefined); assert.match(e8.prompt, /<<<video_1>>>.*<<<image_1>>>/); assert.match(e8.prompt, /the person on the left/);
  assert.match(e8.video_list[0].video_url, /^https:\/\/storage\.test\/get\/[0-9a-f-]{36}\.mp4\?sig=y$/, 'the clip goes as its Comfy storage link, never inline'); assert.doesNotMatch(e8.image_list[0].image_url, /^data:/, 'Kling image: raw base64');
  assert.equal(pro.mode, 'pro'); assert.equal(mt.video_list[0].refer_type, 'feature'); assert.equal(mt.duration, '8'); assert.equal(mt.aspect_ratio, '16:9');
  // the pass files: ≤ 10 s, short side ≥ 720 (source was 854×480)
  const passes = fs.readdirSync(DATA).filter((f) => /-kling-p\d+of3\.mp4$/.test(f)).sort(); assert.equal(passes.length, 3);
  for (const f of passes) { const t = durOf(at(f)); assert.ok(t > 7.5 && t <= 10.05, `${f} ${t}`); const s = sizeOf(at(f)); assert.ok(Math.min(s.w, s.h) >= 720 && Math.max(s.w, s.h) <= 2160, `${f} ${s.w}x${s.h}`); }
  void p1; void p2; void p3;
  // 9:16 clip: 720×1280 stays (already in range)
  const tall = swapJob({ videoPath: at('tall8.mp4'), width: 720, height: 1280 }); await K.body(tall, 0); const tp = fs.readdirSync(DATA).find((f) => /^tall8-kling-p1of1\.mp4$/.test(f))!; assert.deepEqual(sizeOf(at(tp)), { w: 720, h: 1280 });
  assert.ok(uploads >= 3 && uploads <= 5, `one upload per distinct pass file (cached): ${uploads}`);
  for (const j of [swapJob(), swapJob({ duration: 26, resolution: '480p', count: 2, batchSeeds: [42, 43] }), swapJob({ mode: 'motion_transfer', target: '', duration: 12 })]) {
    assert.equal(S.block!(j), null, `seedance not blocked: ${S.block!(j)}`); const n = M.routerCalls(S, j); for (let k = 0; k < n; k++) bodies.s.push(await S.body(j, k)); }
  const [s8, s26a, s26b, smt] = bodies.s;
  assert.equal(s8.duration, -1, 'Seedance edit: duration -1'); assert.deepEqual(s8.content.map((c: any) => c.role ?? c.type), ['text', 'reference_video', 'reference_image']);
  assert.match(s8.content[1].video_url.url, /^asset:\/\/asset-\d+$/, 'Seedance: the clip as a registered asset (the official node)'); assert.equal(s8.generate_audio, false); assert.equal(s8.ratio, 'adaptive');
  assert.equal(s26a.resolution, '480p'); assert.deepEqual([s26a.seed, s26b.seed], [42, 43], 'one seed per version'); assert.equal(smt.duration, 12);
  assert.equal(smt.ratio, 'adaptive'); assert.equal(smt.generate_audio, false, 'motion keeps existing original-remux/silent policy');
  assert.equal(smt.omni_reference_task_type, undefined, 'no undocumented task-type parameter');
  assert.match(smt.content[0].text, /^Generate a new video/); assert.match(smt.content[0].text, /performance guidance/);
  const sp = fs.readdirSync(DATA).find((f) => /^src26-sd25-p1of1\.mp4$/.test(f))!; const sz = sizeOf(at(sp)); assert.ok(sz.w * sz.h >= 409_600, `Seedance pass upscaled into its pixel budget: ${sz.w}x${sz.h}`);
  // keyless fallback: the server's own public address
  process.env.COMFY_API_KEY = ''; ST.setStorageFetch(null); process.env.OPENHIGGSFIELD_PUBLIC_BASE_URL = 'https://me.example.test';
  const kb = await K.body(swapJob(), 0) as any; assert.match(kb.video_list[0].video_url, /^https:\/\/me\.example\.test\/files\/src26-kling-p1of1\.mp4$/, 'no key, a public address: Kling gets that URL');
  process.env.OPENHIGGSFIELD_PUBLIC_BASE_URL = ''; await assert.rejects(K.body(swapJob(), 0), /uploaded with your Comfy key/, 'no key, no public address: refused, never inline');
  // schemas
  const SCHEMAS = ROUTER_SCHEMA_DIR; const req = createRequire(import.meta.url); let Ajv: any = null; try { Ajv = req('ajv/dist/2020.js').default ?? req('ajv/dist/2020.js'); } catch { /* none */ }
  let checked = 0;
  for (const [file, bs, bad] of [['kling__kling-v3-omni', bodies.k, { video_list: [{ refer_type: 'other' }] }], ['byteplus__dreamina-seedance-2-5-260628', bodies.s, { content: [], ratio: '5:4' }]] as const) {
    // the full cached document when present, else the structure-only fixture: these checks never skip (2026-10-31)
    const f = [path.join(SCHEMAS, `${file}.json`), path.join(FIXTURE_SCHEMA_DIR, `${file}.json`)].find((x) => fs.existsSync(x)); assert.ok(f, `${file}: no schema (the fixture is missing)`); assert.ok(Ajv, 'ajv is needed for the schema checks');
    const doc = JSON.parse(fs.readFileSync(f, 'utf8')); delete doc.openapi; const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: true }); const id = `router-${file}`; ajv.addSchema({ ...doc, $id: id });
    const p = Object.keys(doc.paths).find((x) => doc.paths[x]?.post?.requestBody)!; const esc = p.replace(/~/g, '~0').replace(/\//g, '~1');
    const validate = ajv.compile({ $ref: `${id}#/paths/${esc}/post/requestBody/content/application~1json/schema` });
    assert.equal(validate(bad), false, `${file}: the validator refuses a bad body`);
    for (const b of bs) { assert.ok(validate(b), `${file}: ${JSON.stringify(validate.errors)?.slice(0, 400)}`); checked++; }
  }
  assert.equal(checked, bodies.k.length + bodies.s.length, 'every Kling and Seedance body checked against its schema');
  ok(`bodies: Kling edit (base + keep_original_sound, one image as raw base64, std / pro, no duration; motion = feature + duration + aspect; passes ≤ 10 s at ≥ 720 px; 9:16 kept), Seedance edit (duration -1, clip as asset://, seed per version); clips via Comfy storage; ${checked} bodies schema-valid`);
}

// ---------------- 3. blocks ----------------
{
  assert.match(K.block!(swapJob({ refPaths: [] }))!, /needs one character image/); assert.match(K.block!(swapJob({ refPaths: [at('char.png'), at('char.png')] }))!, /takes one character image.*remove the 1 extra/);
  assert.match(K.block!(swapJob({ duration: 35 }))!, /swaps 4–30 s.*yours is 35 s/); assert.match(K.block!(swapJob({ refPaths: [at('wide.png')] }))!, /1:2\.5 to 2\.5:1/);
  assert.match(K.block!(swapJob({ mode: 'restyle' }))!, /runs Video Swap jobs/); assert.match(S.block!(swapJob({ swapType: 'object', target: 'the red mug' }))!, /swaps people/, 'Seedance 2.5 Edit: people only');
  assert.match(K.block!(swapJob({ prompt: 'x'.repeat(2600) }))!, /up to 2500 characters/);
  assert.equal(K.block!({ mode: 'object_swap', swapType: 'person', duration: 8, resolution: '720p' }), null, 'a quote (no files yet) is not blocked: the form says what is missing');
  assert.equal(K.block!({ mode: 'motion-transfer', duration: 6, resolution: '720p' }), null, "a quote's ?mode=motion-transfer (the tool id's spelling) is the motion job, not a non-swap job (the Video bar showed no price)");
  process.env.COMFY_API_KEY = 'test-not-a-real-key'; assert.match(S.block!(swapJob({ refPaths: [at('wide.png')] }))!, /0\.4 to 2\.5/); assert.equal(S.block!(swapJob({ width: 1200, height: 400 })), null, 'a 3:1 clip is no longer refused here: Fit to model pads it to 2.5:1 (shared/videoFit.ts)'); assert.equal((await import('../src/shared/videoFit.ts')).videoFitFor('object-swap', 'router-seedance-25-edit', { width: 1200, height: 400, duration: 8 })!.aspect.target, '2.5:1'); assert.equal(S.block!(swapJob()), null, 'with the key: the clip is uploaded'); process.env.COMFY_API_KEY = '';
  assert.match(S.block!(swapJob())!, /uploaded with your Comfy key/); assert.match(K.block!(swapJob())!, /uploaded with your Comfy key/); await assert.rejects(S.body(swapJob(), 0), /Comfy key/, 'the body refuses too (no call made)');
  ok('blocks: no image, two images, 35 s, wide sheet, non-swap job, object swap on Seedance, long prompt, no key and no public address (body refuses too)');
}

// ---------------- 3a. Object mode (2026-10-31): Kling's edit takes objects; the quote applies the submit's own check ----------------
{
  process.env.COMFY_API_KEY = 'test-not-a-real-key';
  const obj = swapJob({ swapType: 'object', target: 'the red mug' });
  assert.equal(K.block!(obj), null, 'Kling 3.0 Omni Edit swaps objects (a general video edit: refer_type base + reference image)');
  assert.match(K.block!(swapJob({ swapType: 'object', target: '' }))!, /Name the object to replace/, 'no name: nothing for the model to find');
  const kb = await K.body(obj, 0) as any; assert.match(kb.prompt, /^Replace the red mug in <<<video_1>>> with the object from <<<image_1>>>\./); assert.match(kb.prompt, /every person unchanged/); assert.doesNotMatch(kb.prompt, /character/);
  { const MH = await import('./_model-health.ts'); const V = MH.validatorFor('kling__kling-v3-omni'); assert.ok(V, 'the model-health helper finds the Kling schema (cache or fixture)'); assert.equal(MH.schemaErrors(V!, kb), null, 'the object edit body is schema-valid'); }
  assert.equal(CS.swapTypesOf('router-kling-edit').join(), 'person,object'); assert.equal(CS.swapTypesOf('router-seedance-25-edit').join(), 'person');
  // the quote's input carries swapType + target (routing/http.ts swapQuoteFields), so the route refuses the quote exactly as the submit's block does
  const H = await import('../src/routing/http.ts'); const { findRoute } = await import('../src/routing/routes.ts'); const { getTool } = await import('../src/tools/registry.ts');
  const t = getTool('object-swap')!; const qi = (q: Record<string, string>) => ({ ...H.routeQuoteInput(t, { duration: '8', resolution: '720p', mode: 'object_swap', ...q }), mode: 'object_swap' });
  assert.deepEqual(H.swapQuoteFields({ swapType: 'object', target: ' red mug ', point: '0.5,0.25,1.5' }), { swapType: 'object', target: 'red mug', point: { x: 0.5, y: 0.25, t: 1.5 } });
  const rk = findRoute('comfy-router:router-kling-edit')!; const rs = findRoute('comfy-router:router-seedance-25-edit')!;
  for (const [r, q] of [[rk, { swapType: 'object', target: 'red mug' }], [rk, { swapType: 'object', target: '' }], [rs, { swapType: 'object', target: 'red mug' }], [rk, { swapType: 'person', target: '' }]] as const) {
    const quote = r.unavailableFor!(qi(q)); const submit = (r.routeId.endsWith('kling-edit') ? K : S).block!(swapJob({ ...q }));
    assert.equal(quote, submit, `${r.routeId} ${JSON.stringify(q)}: quote "${quote}" = submit "${submit}"`); }
  assert.equal(rs.unavailableFor!(qi({ swapType: 'object', target: 'red mug' })) != null, true, 'Seedance on an object quote: refused, as on submit');
  process.env.COMFY_API_KEY = '';
  ok('object mode: Kling takes objects (own prompt, a name required), Seedance stays people only; the quote input carries swapType/target so quote = submit');
}

// ---------------- 3b. motion transfer with several characters (2026-10-26): every image in order, the model's max ----------------
{
  ff(['-f', 'lavfi', '-i', 'color=c=orange:s=600x900', '-frames:v', '1', at('char2.png')]);
  process.env.COMFY_API_KEY = 'test-not-a-real-key'; ST.setStorageFetch((async (u: any, i: any) => (await storageFake(u, i)) ?? new Response('nope', { status: 404 })) as typeof fetch, async () => {}); ST.clearStorageCache();
  const mt = (refs: string[], o: Record<string, any> = {}) => swapJob({ mode: 'motion_transfer', target: '', refPaths: refs, prompt: 'In @video1, the man on the left becomes Image 1 and the woman on the right Image 2', ...o });
  const two = [at('char.png'), at('char2.png')];
  // Kling: image_list carries both, in order (each equal to that image sent alone)
  assert.equal(K.block!(mt(two)), null, `kling 2 images: ${K.block!(mt(two))}`);
  const kb = await K.body(mt(two), 0) as any; const k1 = await K.body(mt([two[0]]), 0) as any; const k2 = await K.body(mt([two[1]]), 0) as any;
  assert.equal(kb.image_list.length, 2); assert.equal(kb.image_list[0].image_url, k1.image_list[0].image_url, 'Image 1 first'); assert.equal(kb.image_list[1].image_url, k2.image_list[0].image_url, 'Image 2 second');
  assert.match(kb.prompt, /characters from <<<image_1>>> and <<<image_2>>>/); assert.equal(kb.video_list[0].refer_type, 'feature');
  // Seedance: two reference_image parts after the video, in order
  assert.equal(S.block!(mt(two)), null, `seedance 2 images: ${S.block!(mt(two))}`);
  const sb = await S.body(mt(two), 0) as any; const s1 = await S.body(mt([two[0]]), 0) as any; const s2 = await S.body(mt([two[1]]), 0) as any;
  assert.deepEqual(sb.content.map((c: any) => c.role ?? c.type), ['text', 'reference_video', 'reference_image', 'reference_image']);
  assert.equal(sb.content[2].image_url.url, s1.content[2].image_url.url, 'Image 1 first'); assert.equal(sb.content[3].image_url.url, s2.content[2].image_url.url, 'Image 2 second');
  assert.match(sb.content[0].text, /characters from Image 1 and Image 2/);
  // the max rule: Kling takes 4 with a video, Seedance 30; a person swap still takes one
  const five = [...two, ...two, two[0]];
  assert.equal(CS.CLOUD_SWAP_MODELS['router-kling-edit'].maxCharacterImages, 4); assert.equal(CS.CLOUD_SWAP_MODELS['router-seedance-25-edit'].maxCharacterImages, 30);
  assert.equal(K.block!(mt(five.slice(0, 4))), null); assert.match(K.block!(mt(five))!, /takes up to 4 character images; remove 1/);
  assert.equal(S.block!(mt(five)), null, 'Seedance takes 5'); assert.match(S.block!(mt(Array(31).fill(two[0])))!, /up to 30 character images/);
  assert.match(K.block!(swapJob({ refPaths: two }))!, /takes one character image/, 'person swap: still one');
  assert.match(K.block!(mt([two[0], at('wide.png')]))!, /^Image 2: .*1:2\.5 to 2\.5:1/, 'each image is checked, named by its number');
  process.env.COMFY_API_KEY = ''; ST.setStorageFetch(null);
  // the tool: a cloud model gets every image in one request (never split into ref groups), local models keep the groups
  const VS = await import('../src/tools/videoSwap.ts');
  const files = () => ({ video: ['src26.mp4'], refs: Array.from({ length: 10 }, (_, k) => (k % 2 ? 'char2.png' : 'char.png')) });
  const a = await VS.motionTransferTool.parseInput({ provider: 'router-seedance-25-edit' }, files()) as any; assert.equal(a.error, undefined, a.error); assert.equal(a.refBatches.length, 1); assert.equal(a.refBatches[0].length, 10);
  assert.ok(!a.warnings.some((w: string) => / split into /.test(w)), 'no split warning');
  const b = await VS.motionTransferTool.parseInput({ provider: 'comfy-open' }, files()) as any; assert.equal(b.refBatches.length, 2, 'local: groups of ≤ 8 as before');
  ok('motion transfer: 2 images reach Kling image_list and Seedance reference_image in order, prompt names both; max 4 (Kling) / 30 (Seedance), person swap 1; one request on cloud');
}

// Exact prompt preview: pure request wrapper + identical grammar, with no storage calls or mutation of the saved/user prompt.
{
  const { promptPeek } = await import('../src/routesPromptPeek.ts'); const VS = await import('../src/tools/videoSwap.ts');
  const { withRefGrammar } = await import('../src/shared/promptRefs.ts');
  const before = uploads; const raw = 'Use @image1 and @image2, following @video1';
  for (const provider of ['router-seedance-25-edit', 'router-kling-edit'] as const) {
    const preview = await promptPeek(VS.motionTransferTool, { provider, prompt: raw, trimStart: '8', trimEnd: '12', keepAudio: '0', runOn: 'comfy' }, { video: 1, refs: 2 });
    assert.ok('ok' in preview, JSON.stringify(preview)); if (!('ok' in preview)) continue;
    const expected = withRefGrammar(swapJob({ mode: 'motion_transfer', refPaths: [at('char.png'), at('char2.png')], prompt: raw }), provider === 'router-kling-edit' ? 'kling-v3-omni-edit' : 'seedance-2.5-edit', 'router');
    assert.equal(preview.prompt, M.swapPromptOf(provider, expected)); assert.equal(preview.settings.duration, 4); assert.equal(preview.settings.audio, false);
    assert.doesNotMatch(preview.prompt!, /@image|@video/); assert.equal(raw, 'Use @image1 and @image2, following @video1');
  }
  assert.equal(uploads, before, 'prompt peek never uploads');
  const { videoInputLimits, videoFitFor, restoreRect } = await import('../src/shared/videoFit.ts');
  assert.equal(videoInputLimits('motion-transfer', 'router-seedance-25-edit')!.output, 'unknown');
  assert.equal(videoInputLimits('object-swap', 'router-seedance-25-edit')!.output, 'source');
  const motion = videoFitFor('object-swap', 'router-seedance-25-edit', { mode: 'motion_transfer', width: 1800, height: 600, duration: 4 })!;
  assert.equal(motion.restore, false); assert.equal(restoreRect(1200, 480, motion), null); assert.doesNotMatch(motion.reason!, /crop the result back/);
  assert.equal(videoFitFor('object-swap', 'router-seedance-25-edit', { width: 1800, height: 600, duration: 4 })!.restore, true);
  const edit = await promptPeek(VS.objectSwapTool, { provider: 'router-seedance-25-edit', prompt: 'Match @image1', target: 'the dancer on the right', keepAudio: '1' }, { video: 1, refs: 1 });
  assert.ok('ok' in edit); if ('ok' in edit) { assert.match(edit.prompt!, /^Replace the dancer on the right/); assert.match(edit.prompt!, /Match Image 1$/); assert.equal(edit.settings.aspect, 'adaptive'); assert.equal(edit.settings.audio, true); }
  ok('exact cloud motion prompt preview, grammar and soundtrack toggle; no uploads; generation never crops back source framing');
}

// ---------------- 4. prices ----------------
{
  const q = (provider: string, quality: string, d: number) => P.priceOf({ toolId: 'object-swap', rates: {}, quality, durationSec: d, provider });
  assert.equal(q('router-kling-edit', '720p', 8).credits, 101, '26.59 × 8 / 211 = $1.0082 → 101'); assert.equal(q('router-kling-edit', '1080p', 8).credits, 135);
  assert.equal(q('router-kling-edit', '720p', 25).credits, 316, 'passes bill their seconds: the range');
  assert.equal(q('router-seedance-25-edit', '480p', 8).credits, 148, '(8 + 8) s × 19.3957 / 211'); assert.equal(q('router-seedance-25-edit', '720p', 8).credits, 319);
  assert.equal(P.priceOf({ toolId: 'object-swap', rates: {}, quality: '720p', durationSec: 8, provider: 'router-kling-edit', passes: 2 }).credits, 202, 'two versions');
  ok('prices: Kling 8 s 720p 101 / 1080p 135 / 25 s 316; Seedance 8 s 480p 148 / 720p 319 (in + out seconds); versions × 2');
}

// ---------------- 5. a keyed run on a fake Router: 3 passes, each within its share, joined with the source sound ----------------
{
  process.env.COMFY_API_KEY = 'test-not-a-real-key';
  const RR = await import('../src/routing/routerRun.ts'); const { findRoute } = await import('../src/routing/routes.ts');
  const out = (s: number) => { const f = at(`fake-out-${s}.mp4`); ff(['-f', 'lavfi', '-i', `testsrc2=size=1280x720:rate=24`, '-t', String(s), '-pix_fmt', 'yuv420p', f]); return fs.readFileSync(f); };
  const OUT: Record<number, Buffer> = { 9: out(9), 8: out(8) }; let n = 0; const posted: any[] = []; const estimates: any[] = [];
  const base = 'https://router.test/v2/models/kling/kling-v3-omni';
  const f = (async (u: any, init: any = {}) => { const url = String(u); const st = await storageFake(u, init); if (st) return st;
    if (url.endsWith('/estimate')) { const b = JSON.parse(init.body); estimates.push(b); return new Response(JSON.stringify({ source: 'exact', amount: '0.30', credits: 63 }), { status: 200, headers: { 'content-type': 'application/json' } }); }
    if (url.includes('/requests?') && init.method === 'POST') { posted.push(JSON.parse(init.body)); const id = `r${++n}`; return new Response(JSON.stringify({ request_id: id, status: 'IN_QUEUE', status_url: `${base}/requests/${id}/status`, response_url: `${base}/requests/${id}`, cancel_url: `${base}/requests/${id}/cancel` }), { status: 201, headers: { 'content-type': 'application/json' } }); }
    if (url.endsWith('/status')) return new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200, headers: { 'content-type': 'application/json' } });
    const m = url.match(/requests\/r(\d+)$/); if (m) return new Response(JSON.stringify({ code: 0, data: { task_status: 'succeed', task_result: { videos: [{ url: `https://assets.test/v${m[1]}.mp4` }] } } }), { status: 200, headers: { 'content-type': 'application/json', 'x-comfy-credits-used': '70' } });
    const a = url.match(/assets\.test\/v(\d+)\.mp4$/); if (a) return new Response(OUT[Number(a[1]) === 1 ? 9 : 8], { status: 200, headers: { 'content-type': 'video/mp4' } });
    return new Response('nope', { status: 404 }); }) as typeof fetch;
  RR.setRouterFetch(f, async () => {});
  const clip = at('range25.mp4'); ff(['-i', at('src26.mp4'), '-t', '25', '-c:v', 'libx264', '-c:a', 'aac', clip]);
  const r = findRoute('comfy-router:router-kling-edit')!; assert.ok(r, 'route exists'); assert.ok(RR.routerLive(r), 'keyed route is live');
  const job: any = { id: 'job_cs1', status: 'running', input: swapJob({ videoPath: clip, duration: 25 }), routing: { prices: { [r.routeId]: 316 } }, cost: 316, outputs: [] };
  await RR.runRouter(job, r, { n: 1, routeId: r.routeId } as any, 60_000);
  assert.equal(job.status, 'done', job.error); assert.equal(posted.length, 3, 'three Kling requests'); assert.equal(estimates.length, 3);
  assert.equal(job.outputs.length, 1); assert.equal(job.outputs[0].label, 'Result'); const res = at(path.basename(job.outputs[0].url));
  assert.ok(Math.abs(durOf(res) - 25) < 0.3, `joined length ${durOf(res)}`); assert.ok(hasAudio(res), 'the source sound is back on'); assert.equal(job.actualCost.units, 210);
  // an estimate above a pass's own share stops before any call: pass 1 (9 s of 25) may cost 316 × 9 / 25 ≈ 114 credits; 1.20 $ > 1.14 $
  posted.length = 0; RR.setRouterFetch((async (u: any, init: any = {}) => String(u).endsWith('/estimate') ? new Response(JSON.stringify({ source: 'exact', amount: '1.20' }), { status: 200, headers: { 'content-type': 'application/json' } }) : f(u, init)) as typeof fetch, async () => {});
  const job2: any = { id: 'job_cs2', status: 'running', input: swapJob({ videoPath: clip, duration: 25 }), routing: { prices: { [r.routeId]: 316 } }, cost: 316, outputs: [] };
  await assert.rejects(RR.runRouter(job2, r, { n: 1, routeId: r.routeId } as any, 60_000), /price/i); assert.equal(posted.length, 0, 'nothing submitted');
  // keepAudio off: silent result
  RR.setRouterFetch(f, async () => {}); n = 0;
  const job3: any = { id: 'job_cs3', status: 'running', input: swapJob({ videoPath: clip, duration: 25, keepAudio: false }), routing: { prices: { [r.routeId]: 316 } }, cost: 316, outputs: [] };
  await RR.runRouter(job3, r, { n: 1, routeId: r.routeId } as any, 60_000); assert.equal(hasAudio(at(path.basename(job3.outputs[0].url))), false, 'keepAudio=0 → silent');
  RR.setRouterFetch(null); process.env.COMFY_API_KEY = '';
  ok('keyed run (fake Router): 25 s → 3 requests (each estimate checked against its own share), joined into one 25 s clip with the source sound; over-share estimate stops before submit; keepAudio off → silent');
}

// ---------------- 5b. a refused run (2026-10-31): the provider's words are kept, the card says why, a Seedance refusal counts nothing ----------------
{
  process.env.COMFY_API_KEY = 'test-not-a-real-key'; ST.setStorageFetch((async (u: any, i: any) => (await storageFake(u, i)) ?? new Response('nope', { status: 404 })) as typeof fetch, async () => {}); ST.clearStorageCache();
  const RR = await import('../src/routing/routerRun.ts'); const { findRoute } = await import('../src/routing/routes.ts');
  const PB = await import('../src/shared/policyBilling.ts'); const FR = await import('../../web/src/shared/failureReasons.ts');
  const base = 'https://router.test/v2/models/byteplus/dreamina-seedance-2-5-260628'; const json = (o: unknown, status = 200, h: Record<string, string> = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...h } });
  const fake = (collect: () => Response) => (async (u: any, init: any = {}) => { const url = String(u); const st = await storageFake(u, init); if (st) return st;
    if (url.endsWith('/estimate')) return json({ source: 'exact', amount: '0.30', credits: 63 });
    if (url.includes('/requests?') && init.method === 'POST') return json({ request_id: 'rq1', status: 'IN_QUEUE', status_url: `${base}/requests/rq1/status`, response_url: `${base}/requests/rq1`, cancel_url: `${base}/requests/rq1/cancel` }, 201);
    if (url.endsWith('/status')) return json({ status: 'COMPLETED', error_type: 'content_policy_violation' });
    if (url.endsWith('/requests/rq1')) return collect();
    return new Response('nope', { status: 404 }); }) as typeof fetch;
  const r = findRoute('comfy-router:router-seedance-25-edit')!; const mk = (id: string): any => ({ id, status: 'running', toolId: 'motion-transfer', route: r.routeId, input: swapJob({ mode: 'motion_transfer', target: '' }), routing: { prices: { [r.routeId]: 319 } }, cost: 319, outputs: [] });
  // with words: BytePlus's own code (Router model page: InputImageSensitiveContentDetected.PrivacyInformation = a real person)
  RR.setRouterFetch(fake(() => json({ error_type: 'content_policy_violation', detail: 'The provider refused the request.', upstream_detail: 'InputImageSensitiveContentDetected.PrivacyInformation: the input image may contain a real person.' }, 400, { 'x-comfy-error-type': 'content_policy_violation' })), async () => {});
  const j1 = mk('job_cs_ref1'); await assert.rejects(RR.runRouter(j1, r, { n: 1, routeId: r.routeId } as any, 60_000), /refused a photo of a real person \(content policy\)/);
  assert.equal(j1.reasonCode, 'content_blocked'); assert.match(j1.providerError.upstreamDetail, /PrivacyInformation/); assert.equal(j1.providerError.requestId, 'rq1'); assert.equal(j1.providerError.model, 'byteplus/dreamina-seedance-2-5-260628');
  assert.equal(j1.chargeNote, 'not_charged', "Seedance's catalog: a policy refusal isn't billed (shared/policyBilling.ts)");
  const v = FR.failView({ ...j1, status: 'failed', error: 'Comfy Router failed: x' }, { ownAccounts: true, providerRule: 'may-charge', providerName: 'Comfy' });
  assert.equal(v.line, 'The provider refused a photo of a real person.'); assert.equal(v.charge, 'Nothing was charged.');
  // no words (the collect read gives nothing back): the bucket and the request id are still kept
  RR.setRouterFetch(fake(() => new Response('', { status: 202 })), async () => {});
  const j2 = mk('job_cs_ref2'); await assert.rejects(RR.runRouter(j2, r, { n: 1, routeId: r.routeId } as any, 60_000), /refused this prompt or image/);
  assert.equal(j2.providerError.errorType, 'content_policy_violation'); assert.equal(j2.providerError.requestId, 'rq1'); assert.equal(j2.providerError.detail, null);
  // the real route ids are comfy-router:<id> (the old check only read router:<id>, so a Seedance refusal kept its estimate as spend)
  assert.equal(PB.policyRefusalCharge({ route: 'comfy-router:router-seedance-25-edit' }), 'no'); assert.equal(PB.policyRefusalCharge({ route: 'comfy-router:router-kling-edit' }), 'unknown');
  assert.equal(PB.refusalReason({ detail: 'OutputAudioSensitiveContentDetected' }), 'The provider refused the sound it made. Try again with sound off.'); assert.equal(PB.refusalReason({ detail: 'something else' }), null);
  RR.setRouterFetch(null); ST.setStorageFetch(null); process.env.COMFY_API_KEY = '';
  ok('refused run: the provider\'s words and request id kept as providerError (also with no words), plain reason "a photo of a real person" on the card, Seedance refusal not charged (comfy-router: route ids)');
}

// ---------------- 6. trim ----------------
{
  const { applySwapTrim } = await import('../src/tools/videoSwap.ts');
  fs.copyFileSync(at('src26.mp4'), at('up.mp4'));
  const files: Record<string, string[]> = { video: ['up.mp4'] }; const t = await applySwapTrim({ trimStart: '12', trimEnd: '20' }, files);
  assert.deepEqual(t, { trim: { start: 12, end: 20 } }); assert.match(files.video[0], /^up-range-1200-2000\.mp4$/); assert.ok(Math.abs(durOf(at(files.video[0])) - 8) < 0.15); assert.ok(hasAudio(at(files.video[0])));
  const whole: Record<string, string[]> = { video: ['up.mp4'] }; assert.deepEqual(await applySwapTrim({}, whole), { trim: null }); assert.deepEqual(whole.video, ['up.mp4']);
  for (const [s, e, re] of [['5', '3', /start before/], ['0', '40', /after your clip ends/], ['0', '2', /at least 4 s/]] as const) {
    const r = await applySwapTrim({ trimStart: s, trimEnd: e }, { video: ['up.mp4'] }) as any; assert.match(r.error, re); assert.equal(r.issues[0].field, 'trim'); }
  const long: Record<string, string[]> = { video: ['up.mp4'] }; const r2 = await applySwapTrim({ trimStart: '0', trimEnd: '26' }, long); assert.ok(!('error' in r2), 'up to 30 s');
  ok('trim: a range anywhere in the upload is cut (8 s, sound kept); no range → untouched; end before start / past the clip / under 4 s refused on field trim');
}
console.log('cloud-swap: all ok');
process.exit(0);
