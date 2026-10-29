// Render model picker (Direct a Shot step 3, 2026-10-26): shared/renderModels.ts, tools/makeItReal.ts parseCloud, routing/routerModels.ts renderBody.
// In process, mock backend, temp data dir, no network, no spend (no Router call is made: bodies are built and validated only).
//  1. registry: local LTX is first and the default; cloud rows by price; lengths in whole seconds; Ray bills 5 / 10 s; prompts; style pick; Seedance needs the upload helper
//  2. parseInput per cloud model: the Clay view is sent (Simple when there is no Clay, with a note), cut to the picked seconds at 24 fps, the first frame
//     optional (Ray drops it with a note), bad lengths / qualities refused; the job keeps makeReal so Mockup vs Render works
//  3. bodies always validate against bundled project request contracts (not official provider schemas); each validator refuses bad bodies.
//     Optional external snapshots from MODEL_HEALTH_SCHEMAS / MODEL_HEALTH_SCHEMAS_EXTRA add checks, never replace the bundled contracts.
//  4. prices (quote = charge): Kling 5 s 720p, Ray 5 s 360p / 6 s billed as 10 s, Aleph 5 s, Seedance 5 s 720p on (in + out) s
//  5. Video Swap still gets its own body on the shared Kling / Seedance engines; the mock run makes a labelled sample for a cloud Render
// Run: npx tsx test/render-picker.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process'; import { createRequire } from 'node:module';
import { ROUTER_SCHEMA_DIR, EXTRA_SCHEMA_DIR } from './_model-health.js';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'rpick-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'),
  OPENHIGGSFIELD_COMFY_ROUTER_URL: 'https://router.test', COMFY_API_KEY: '', OPENHIGGSFIELD_PUBLIC_BASE_URL: '' });
const ok = (m: string) => console.log('ok ' + m);
const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const at = (n: string) => path.join(D, n);
const probe = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate', '-of', 'json', f]).toString());
// our own test media: a 6 s Simple view + Clay view at 30 fps (Direct a Shot can record 30), a 3 s Simple-only mockup, a first-frame still
ff(['-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30', '-t', '6', '-pix_fmt', 'yuv420p', at('p6-out0.mp4')]); ff(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-t', '6', '-pix_fmt', 'yuv420p', at('p6-out1.mp4')]);
ff(['-f', 'lavfi', '-i', 'testsrc=size=720x1280:rate=24', '-t', '3', '-pix_fmt', 'yuv420p', at('p3-out0.mp4')]);
ff(['-f', 'lavfi', '-i', 'color=c=orange:s=1280x720', '-frames:v', '1', at('look.png')]);

const RU = await import('../src/routing/renderUpload.ts'); RU.setClipUploader(null);
const RM = await import('../src/shared/renderModels.ts'); const M = await import('../src/routing/routerModels.ts'); const P = await import('../src/shared/pricing.ts');
const { jobs } = await import('../src/jobs.ts'); const { getTool } = await import('../src/tools/registry.ts'); const { MAKE_REAL_PROVIDER, MAKE_REAL_TOOL } = await import('../src/shared/makeItReal.ts');
const tool = getTool(MAKE_REAL_TOOL)!;
const prev = (w: number, h: number, s: number) => ({ previz: { width: w, height: h, fps: 30, frames: s * 30, shot: { seconds: s, note: '' }, presetName: 'City street', restyle: { short: 'A rainy street at dusk.' }, action: '' } });
jobs.set('p6', { id: 'p6', toolId: 'plan-a-shot', status: 'done', createdAt: 1, outputs: [{ label: 'Simple view', url: '/files/p6-out0.mp4' }, { label: 'Clay view', url: '/files/p6-out1.mp4' }], resultUrl: '/files/p6-out0.mp4', input: prev(1280, 720, 6) } as any);
jobs.set('p3', { id: 'p3', toolId: 'plan-a-shot', status: 'done', createdAt: 2, outputs: [{ label: 'Simple view', url: '/files/p3-out0.mp4' }], resultUrl: '/files/p3-out0.mp4', input: prev(720, 1280, 3) } as any);

// ---------------- 1. registry ----------------
{
  assert.deepEqual(RM.RENDER_PROVIDERS, [MAKE_REAL_PROVIDER, 'router-kling-edit', 'router-ray32-edit', 'router-aleph2', 'router-seedance-25-edit'], 'local LTX first, cloud by price, Seedance last');
  assert.deepEqual(tool.providers, RM.RENDER_PROVIDERS, 'the tool offers the same list'); assert.equal(RM.renderModelOf(MAKE_REAL_PROVIDER)!.firstFrame, 'required');
  for (const m of RM.RENDER_MODELS.filter((x) => x.route === 'router')) { assert.equal(m.style, 'clay', `${m.name}: best with Clay`); assert.ok(m.routerModel && M.ROUTER_MODELS[m.id], `${m.name}: a Router spec`); assert.ok(m.qualities.some((q) => q.id === m.defaultQuality)); }
  assert.deepEqual(RM.renderLengths('router-kling-edit', 6), [3, 4, 5, 6]); assert.deepEqual(RM.renderLengths('router-aleph2', 3), [2, 3]); assert.deepEqual(RM.renderLengths('router-kling-edit', 2.5), [], 'Kling needs 3 s');
  assert.deepEqual(RM.renderLengths('router-kling-edit', 10.04), [3, 4, 5, 6, 7, 8, 9, 10]); assert.equal(RM.renderDefaultLength('router-ray32-edit', 6), 6);
  assert.deepEqual([4, 5, 6, 10].map((s) => RM.renderBillSeconds('router-ray32-edit', s)), [5, 5, 10, 10]); assert.equal(RM.renderBillSeconds('router-aleph2', 6), 6);
  assert.match(RM.renderPrompt('router-kling-edit', 'A rainy street, clay look.', true), /^Turn <<<video_1>>> into a finished live-action shot: A rainy street, look\. Keep the camera movement.*<<<image_1>>> is a reference/);
  assert.doesNotMatch(RM.renderPrompt('router-aleph2', 'clay 3D blockout street', false), /clay|3D|blockout/i, 'avoid-words stripped');
  assert.match(RM.renderPrompt('router-seedance-25-edit', 'x', true), /Image 1 is a reference.*No additional content\.$/); assert.doesNotMatch(RM.renderPrompt('router-kling-edit', 'x', false), /image_1/);
  const outs = [{ label: 'Simple view', url: '/a.mp4' }, { label: 'Clay view', url: '/b.mp4' }];
  assert.equal(RM.pickStyleOutput(outs, 'clay').out!.url, '/b.mp4'); const p = RM.pickStyleOutput([outs[0], { label: 'Depth view', url: '/d.mp4' }], 'clay');
  assert.equal(p.out!.url, '/a.mp4', 'no Clay: Simple, never Depth'); assert.equal(p.matched, false); assert.match(p.note!, /no Clay view.*Simple view is used/);
  assert.match(RM.renderNeeds('router-seedance-25-edit')!, /upload helper|Comfy key/); assert.equal(RM.renderNeeds('router-seedance-25-edit', { publicBase: true }), null); assert.equal(RM.renderNeeds('router-aleph2'), null);
  assert.match(RM.renderNeeds('router-kling-edit')!, /Kling takes your mockup only as a web link/, 'Kling: no inline video'); assert.equal(RM.renderNeeds('router-kling-edit', { upload: true }), null); assert.equal(RM.renderNeeds('router-ray32-edit'), null);
  ok('registry: LTX default first, cloud by price, Clay for edit models, whole-second lengths, Ray 5 / 10 s billing, prompt templates, style pick, Seedance needs the upload helper');
}

// ---------------- 2. parseInput per cloud model ----------------
const parse = (o: Record<string, string>, files: Record<string, string[]> = {}) => tool.parseInput({ planJob: 'p6', prompt: 'A rainy street at dusk, clay look.', ...o }, files) as Promise<any>;
const got: Record<string, any> = {};
{
  const k = await parse({ provider: 'router-kling-edit', length: '5', resolution: '1080p' }, { firstFrame: ['look.png'] }); assert.ok(!k.error, JSON.stringify(k));
  assert.equal(k.makeReal.planUrl, '/files/p6-out1.mp4', 'the Clay view is sent'); assert.equal(k.duration, 5); assert.equal(k.clipSeconds, 5); assert.equal(k.resolution, '1080p'); assert.ok(k.firstFramePath);
  const pk = probe(k.clipPath); const v = pk.streams.find((s: any) => s.codec_type === 'video'); assert.equal(v.r_frame_rate, '24/1'); assert.ok(Math.abs(Number(pk.format.duration) - 5) < 0.1, `5 s clip: ${pk.format.duration}`);
  assert.deepEqual([v.width, v.height], [1280, 720]); assert.ok(!pk.streams.some((s: any) => s.codec_type === 'audio'), 'no sound sent');
  assert.match(k.warnings.join(' '), /Left out of the prompt: “clay”/); assert.equal(k.makeReal.provider, 'router-kling-edit'); assert.equal(k.makeReal.model, 'Kling 3.0 Omni Edit'); assert.deepEqual([k.makeReal.plan.width, k.makeReal.plan.seconds], [1280, 5]);
  got.kling = k;
  const r = await parse({ provider: 'router-ray32-edit', length: '6', resolution: '360p' }, { firstFrame: ['look.png'] }); assert.ok(!r.error, JSON.stringify(r));
  assert.equal(r.firstFramePath, null, 'Ray takes no picture'); assert.match(r.warnings.join(' '), /takes no first frame/); assert.equal(r.duration, 10, '6 s bills as 10 s'); assert.match(r.warnings.join(' '), /bills a 6 s clip as 10 s/); got.ray = r;
  const a = await parse({ provider: 'router-aleph2' }); assert.ok(!a.error, JSON.stringify(a)); assert.equal(a.clipSeconds, 6, 'default: the whole mockup'); assert.equal(a.resolution, 'source'); assert.equal(a.firstFramePath, null, 'first frame optional'); got.aleph = a;
  const af = await parse({ provider: 'router-aleph2', length: '4' }, { firstFrame: ['look.png'] }); got.alephFirst = af;
  const s = await parse({ provider: 'router-seedance-25-edit', length: '5', resolution: '480p' }, { firstFrame: ['look.png'] }); assert.ok(!s.error, 'Seedance parses (the route refuses it)'); got.seed = s;
  // a 3 s 9:16 Simple-only mockup on Kling: Simple sent with a note, 720×1280 kept
  const k3 = await tool.parseInput({ planJob: 'p3', prompt: 'A tall tower.', provider: 'router-kling-edit' }, {}) as any; assert.ok(!k3.error, JSON.stringify(k3));
  assert.match(k3.warnings.join(' '), /no Clay view/); assert.deepEqual([k3.width, k3.height], [720, 1280]); assert.equal(k3.clipSeconds, 3);
  // refusals
  assert.equal((await parse({ provider: 'router-kling-edit', length: '7' })).issues[0].field, 'length', 'longer than the mockup');
  assert.equal((await parse({ provider: 'router-kling-edit', length: '2' })).issues[0].field, 'length', 'Kling: under 3 s');
  assert.equal((await parse({ provider: 'router-kling-edit', resolution: '360p' })).issues[0].field, 'resolution');
  assert.equal((await parse({ provider: 'router-aleph2', prompt: '' })).issues[0].field, 'prompt'); assert.equal((await parse({ provider: 'router-aleph2', prompt: 'clay 3D' })).issues[0].field, 'prompt');
  const ltx: any = await parse({}); assert.equal(ltx.issues[0].field, 'firstFrame', 'LTX (no provider) still needs its first frame');
  ok('parseInput: Clay view sent (Simple + note when absent), 24 fps whole-second clip, sizes kept, first frame optional (Ray drops it), Ray billed 10 s for 6 s, refusals, LTX unchanged');
}

// ---------------- 3. bodies vs project contracts + optional external snapshots ----------------
const bodies: Record<string, any[]> = { kling: [], ray: [], aleph: [], seed: [] };
{
  await assert.rejects(M.renderBody('router-kling-edit', got.kling), /upload helper|Comfy key/, 'Kling: refused before any call without a link'); assert.match(M.renderIssue('router-kling-edit', got.kling)!, /upload helper|Comfy key/);
  const uploaded: string[] = []; RU.setClipUploader(async (p, mime) => { uploaded.push(`${path.basename(p)} ${mime}`); return `https://storage.test/${path.basename(p)}`; });
  bodies.kling.push(await M.renderBody('router-kling-edit', got.kling)); assert.deepEqual(uploaded, [`${path.basename(got.kling.clipPath)} video/mp4`], 'the clip went through the storage upload'); bodies.kling.push(await M.renderBody('router-kling-edit', { ...got.kling, firstFramePath: null, resolution: '720p' }));
  const [k1, k2] = bodies.kling; assert.deepEqual(k1.video_list.map((v: any) => [v.refer_type, v.keep_original_sound]), [['base', 'no']]); assert.equal(k1.mode, 'pro'); assert.equal(k2.mode, 'std');
  assert.match(k1.video_list[0].video_url, /^https:\/\/storage\.test\/mir-.*-clip\.mp4$/, 'Kling gets a link, never a data URI'); assert.equal(k1.image_list.length, 1); assert.doesNotMatch(k1.image_list[0].image_url, /^data:/, 'raw base64 image'); assert.equal(k2.image_list, undefined);
  assert.equal(k1.duration, undefined, 'an edit sends no duration'); assert.equal(k1.aspect_ratio, undefined);
  bodies.ray.push(await M.renderBody('router-ray32-edit', got.ray)); bodies.ray.push(await M.renderBody('router-ray32-edit', { ...got.ray, clipSeconds: 4, resolution: '1080p' }));
  const [r1, r2] = bodies.ray; assert.equal(r1.type, 'video_edit'); assert.equal(r1.video.duration, '10s'); assert.equal(r2.video.duration, '5s'); assert.equal(r1.video.resolution, '360p'); assert.equal(r1.source.media_type, 'video/mp4'); assert.doesNotMatch(r1.source.data, /^data:/); assert.equal(r1.video.edit.strength, 'adhere_1');
  bodies.aleph.push(await M.renderBody('router-aleph2', got.aleph)); bodies.aleph.push(await M.renderBody('router-aleph2', got.alephFirst));
  const [a1, a2] = bodies.aleph; assert.equal(a1.promptImage, undefined); assert.deepEqual(a2.promptImage.map((p: any) => p.position), ['first']); assert.match(a2.promptImage[0].uri, /^data:image\/png;base64,/); assert.equal(a1.model, undefined, 'model never sent'); assert.ok(a1.promptText.length <= 1000);
  RU.setClipUploader(null); await assert.rejects(M.renderBody('router-seedance-25-edit', got.seed), /upload helper|Comfy key/, 'Seedance: refused before any call without a link');
  process.env.OPENHIGGSFIELD_PUBLIC_BASE_URL = 'https://me.example.test'; bodies.seed.push(await M.renderBody('router-seedance-25-edit', got.seed)); process.env.OPENHIGGSFIELD_PUBLIC_BASE_URL = '';
  RU.setClipUploader(async (p) => `https://storage.test/${path.basename(p)}`); const sUp = await M.renderBody('router-seedance-25-edit', got.seed) as any; assert.match(sUp.content[1].video_url.url, /^https:\/\/storage\.test\//, 'Seedance via the storage upload'); bodies.seed.push(sUp);
  const [s1] = bodies.seed; assert.equal(s1.duration, -1); assert.deepEqual(s1.content.map((c: any) => c.role ?? c.type), ['text', 'reference_video', 'reference_image']); assert.match(s1.content[1].video_url.url, /^https:\/\/me\.example\.test\/files\/mir-.*-clip\.mp4$/); assert.equal(s1.resolution, '480p');
  const CACHED = ROUTER_SCHEMA_DIR; const EXTRA = EXTRA_SCHEMA_DIR;
  // A missing validator is an installation/test failure, not permission to skip the core contracts.
  const req = createRequire(import.meta.url); const Ajv = req('ajv/dist/2020.js').default ?? req('ajv/dist/2020.js');
  const contracts = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/render-request-contracts.json'), 'utf8')).schemas;
  assert.deepEqual(Object.keys(contracts).sort(), Object.keys(bodies).sort(), 'each tested render builder has a bundled contract');
  let checked = 0;
  const served = (file: string) => { const f = path.join(CACHED, `${file}.json`); if (!fs.existsSync(f)) return null; const doc = JSON.parse(fs.readFileSync(f, 'utf8')); delete doc.openapi;
    const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: true }); const id = `router-${file}`; ajv.addSchema({ ...doc, $id: id });
    const p = Object.keys(doc.paths).find((x) => doc.paths[x]?.post?.requestBody)!; return ajv.compile({ $ref: `${id}#/paths/${p.replace(/~/g, '~0').replace(/\//g, '~1')}/post/requestBody/content/application~1json/schema` }); };
  const extra = (file: string) => { const f = path.join(EXTRA, `${file}.json`); if (!fs.existsSync(f)) return null; return new Ajv({ strict: false, validateFormats: false, allErrors: true }).compile(JSON.parse(fs.readFileSync(f, 'utf8'))); };
  const cases: [string, any, any[], any, (b: any) => void][] = [
    ['kling', served('kling__kling-v3-omni'), bodies.kling, { video_list: [{ refer_type: 'other' }] }, (b) => { b.video_list[0].refer_type = 'other'; }],
    ['ray', served('luma_2__uni-1'), bodies.ray, { prompt: 'x', type: 'video_edit', video: { duration: '7s' } }, (b) => { b.video.duration = '7s'; }],
    ['seed', served('byteplus__dreamina-seedance-2-5-260628'), bodies.seed, { content: [], ratio: '5:4' }, (b) => { b.content[1].role = 'reference_image'; }],
    ['aleph', extra('runway__aleph2.input'), bodies.aleph, { promptText: 'x', videoUri: 'data:video/mp4;base64,AA', model: 'aleph2' }, (b) => { b.model = 'aleph2'; }],
  ];
  for (const [label, snapshot, bs, bad, mutate] of cases) {
    const v = new Ajv({ strict: false, validateFormats: false, allErrors: true }).compile(contracts[label]);
    assert.equal(v(bad), false, `${label}: the validator refuses a bad body`);
    const wrong = structuredClone(bs[0]); mutate(wrong); assert.equal(v(wrong), false, `${label}: a single wrong field is refused in an otherwise valid body`);
    for (const b of bs) { assert.ok(v(b), `${label}: ${JSON.stringify(v.errors)?.slice(0, 400)}`); checked++; }
    if (snapshot) { assert.equal(snapshot(bad), false, `${label}: external snapshot refuses the original bad body`);
      for (const b of bs) assert.ok(snapshot(b), `${label} external snapshot: ${JSON.stringify(snapshot.errors)?.slice(0, 400)}`); }
    else console.log(`skip optional external snapshot ${label}: absent from configured cache; bundled project contract checked`);
  }
  assert.ok(checked >= 8, `project request-contract checks ran (${checked})`);
  ok(`bodies: Kling base edit (clip as a link via the storage upload, refused without one; raw base64 reference, std / pro), Ray video_edit (source.data, 5s / 10s, adhere_1), Aleph (videoUri inline, promptImage first, no model), Seedance (link only: public address or storage upload, duration -1); ${checked} bodies project-contract-valid (not provider verification)`);
}

// ---------------- 4. prices ----------------
{
  const q = (provider: string, quality: string, d: number) => P.priceOf({ toolId: MAKE_REAL_TOOL, rates: {}, quality, durationSec: d, provider }).credits;
  assert.equal(q('router-kling-edit', '720p', 5), 64, '26.59 × 5 / 211 = $0.630'); assert.equal(q('router-kling-edit', '1080p', 5), 85);
  assert.equal(q('router-ray32-edit', '360p', 5), 54, '113.94 / 211 = $0.540'); assert.equal(q('router-ray32-edit', '360p', RM.renderBillSeconds('router-ray32-edit', 6)), 108); assert.equal(q('router-ray32-edit', '720p', 5), 108);
  assert.equal(q('router-aleph2', 'source', 5), 201, '84.4844 × 5 / 211 = $2.002'); assert.equal(q('router-seedance-25-edit', '720p', 5), 199, '(5 + 5) s × 41.974 / 211'); assert.equal(q('router-seedance-25-edit', '480p', 5), 92);
  assert.equal(q(MAKE_REAL_PROVIDER, '', 3), 0, 'local LTX: free');
  ok('prices: Kling 5 s 720p 64 / 1080p 85, Ray 5 s 360p 54 (6 s → 10 s: 108), Aleph 5 s 201, Seedance 5 s 720p 199 / 480p 92, LTX free');
}

// ---------------- 5. shared engines, route blocks, mock run ----------------
{
  const K = M.ROUTER_MODELS['router-kling-edit'];
  assert.ok(K.tools!.includes('object-swap') && K.tools!.includes('make-it-real')); assert.equal(K.block!(got.kling), null, 'with an uploader'); assert.equal(M.routerCalls(K, got.kling), 1);
  ff(['-f', 'lavfi', '-i', 'testsrc=size=854x480:rate=24', '-t', '8', '-pix_fmt', 'yuv420p', at('swap8.mp4')]); ff(['-f', 'lavfi', '-i', 'color=c=teal:s=512x768', '-frames:v', '1', at('char.png')]);
  /* the swap body (clip uploaded with the Comfy key) is covered by cloud-swap.test.ts since the storage helper merged (2026-10-26); no real upload here */

  RU.setClipUploader(null); assert.match(M.ROUTER_MODELS['router-seedance-25-edit'].block!(got.seed)!, /upload helper|Comfy key/); assert.match(K.block!(got.kling)!, /upload helper|Comfy key/, 'Kling blocked without a link'); assert.equal(M.ROUTER_MODELS['router-aleph2'].block!(got.aleph), null);
  assert.match(M.ROUTER_MODELS['router-aleph2'].block!({ mode: 'object_swap' })!, /runs Render jobs/); assert.match(M.renderIssue('router-aleph2', { ...got.aleph, finalPrompt: 'x'.repeat(1001) })!, /up to 1000 characters/);
  // the mock backend: a labelled sample from the conformed clip
  const job: any = { id: 'mirjob1', toolId: MAKE_REAL_TOOL, provider: 'router-aleph2', status: 'queued', input: got.aleph, outputs: [] }; await tool.run(job);
  assert.equal(job.status, 'done'); assert.match(job.outputs[0].label, /sample/i); assert.ok(fs.existsSync(at(path.basename(job.outputs[0].url))));
  ok('shared engines: a Render job and a swap job each get their own body on Kling; Seedance blocked without a public link; non-Render job refused on Aleph; long prompt refused; mock sample made');
}
console.log('render-picker: all ok');
