// Comfy Router places of Seedance 2.5 / 2.0 Fast / 2.0 Mini and Veo 3.1 Fast (2026-10-25). In process, fake key, no network, no spend.
//  1. One model card each: the Router engine joins the BytePlus engine on the same model key (seedance-2.5 …), Veo 3.1 Fast is its own model.
//  2. Every body variant validates against the official Router input schema (cached OpenAPI docs from the model audit; skipped when absent).
//  3. Limits: durations / resolutions per model, refs at max, i2v without a photo, Veo 1080p = 8 s; quote = the price rows (audio toggle on Veo).
// Sources: docs.comfy.org/development/comfy-router/models/{byteplus/dreamina-seedance-2-5-260628,byteplus/dreamina-seedance-2-0-fast-260128,
// byteplus/dreamina-seedance-2-0-mini,veo/veo-3-1-fast-generate-001}/code, …/comfy-router/pricing, docs.comfy.org/built-in-nodes/ByteDance2ReferenceNode.
// Run: npx tsx test/router-new-video-models.test.ts
import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
import { ROUTER_SCHEMA_DIR } from './_model-health.js';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'newvid-')); const DATA = fs.mkdtempSync(path.join(D, 'data-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_COMFY_ROUTER_URL: 'http://127.0.0.1:9', COMFY_API_KEY: '', OPENHIGGSFIELD_ARK_API_KEY: '', OPENHIGGSFIELD_PUBLIC_BASE_URL: '' });
const ok = (m: string) => console.log('ok ' + m);
const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const at = (n: string) => path.join(DATA, n);
ff(['-f', 'lavfi', '-i', 'color=c=blue:s=512x512', '-frames:v', '1', at('ref.png')]); const PNG = at('ref.png');
ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', at('a3.mp3')]); const A3 = at('a3.mp3');
ff(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24', '-t', '3', '-pix_fmt', 'yuv420p', at('v3.mp4')]); const V3 = at('v3.mp4');

const M = await import('../src/routing/routerModels.ts'); const { findRoute } = await import('../src/routing/routes.ts');
const { routeCredits } = await import('../src/routing/select.ts'); const { getTool } = await import('../src/tools/registry.ts');
const { VIDEO_LIMITS, resolveDuration } = await import('../src/tools/h3/videoCaps.ts'); const { toolModels, modelRoutes } = await import('../src/routing/modelRegistry.ts');
const NEW = { 'router-seedance-25': 'byteplus__dreamina-seedance-2-5-260628', 'router-seedance-20-fast': 'byteplus__dreamina-seedance-2-0-fast-260128',
  'router-seedance-20-mini': 'byteplus__dreamina-seedance-2-0-mini', 'router-veo-fast': 'veo__veo-3.1-fast-generate-001' } as const;
type Key = keyof typeof NEW;

// ---------------- 1. registry: one model, two places ----------------
{
  const hv = getTool('h3-video')!; const ms = toolModels(hv);
  for (const [model, direct, router] of [['seedance-2.5', 'direct-seedance-25', 'router-seedance-25'], ['seedance-2.0-fast', 'direct-seedance-20-fast', 'router-seedance-20-fast'], ['seedance-2.0-mini', 'direct-seedance-20-mini', 'router-seedance-20-mini']]) {
    const m = ms.find((x) => x.key === model)!; assert.ok(m, model);
    assert.deepEqual(m.parts.map((p) => p.engine), [direct, router], `${model}: BytePlus + Comfy Router engines on one card`);
    const ids = modelRoutes(hv, m).map((x) => x.route.routeId); assert.ok(ids.includes(`comfy-router:${router}`) && ids.includes(`direct:${direct}`), `${model} routes ${ids}`);
    assert.equal(ms.filter((x) => x.def.name === m.def.name).length, 1, `${model}: no duplicate card`);
  }
  const veo = ms.find((x) => x.key === 'veo-3.1-fast')!; assert.equal(veo.def.name, 'Veo 3.1 Fast'); assert.deepEqual(veo.parts.map((p) => p.engine), ['router-veo-fast']);
  ok('registry: Seedance 2.5 / 2.0 Fast / 2.0 Mini each one card with BytePlus + Comfy Router; Veo 3.1 Fast its own card');
}

// ---------------- 2. bodies vs the official schemas ----------------
const job = (o: Record<string, any>) => ({ prompt: 'a red fox trotting through a snowy pine forest', duration: 5, resolution: '720p', aspect: '16:9', audio: true, ...o });
const VARIANTS: Record<Key, Record<string, any>[]> = {
  'router-seedance-25': [job({ mode: 't2v' }), job({ mode: 't2v', duration: 30, resolution: '1080p', aspect: '9:21', audio: false, seed: 7 }), job({ mode: 'i2v', imagePath: PNG }),
    job({ mode: 'flf', imagePath: PNG, lastFramePath: PNG, resolution: '480p' }), job({ mode: 'r2v', aspect: 'auto', refPaths: Array(30).fill(PNG) }),
    job({ mode: 'r2v', refPaths: [PNG], refAudioPaths: [A3], refAudioSecondsEach: [3] }), job({ mode: 'r2v', refPaths: [], refAudioPaths: [A3], refAudioSecondsEach: [3] })],
  'router-seedance-20-fast': [job({ mode: 't2v', duration: 15, resolution: '480p' }), job({ mode: 'i2v', imagePath: PNG }), job({ mode: 'flf', imagePath: PNG, lastFramePath: PNG }),
    job({ mode: 'r2v', refPaths: Array(9).fill(PNG), refAudioPaths: [A3], refAudioSecondsEach: [3] }), job({ mode: 'r2v', refPaths: [PNG], refVideoPaths: [V3], refVideoSecondsEach: [3], refVideoSeconds: 3 })],
  'router-seedance-20-mini': [job({ mode: 't2v', duration: 4 }), job({ mode: 'i2v', imagePath: PNG, aspect: '1:1' }), job({ mode: 'r2v', refPaths: [PNG, PNG] })],
  'router-veo-fast': [job({ mode: 't2v', duration: 4, audio: false }), job({ mode: 't2v', duration: 6, resolution: '1080p', aspect: '9:16', negativePrompt: 'blur', seed: 3 }), job({ mode: 'i2v', imagePath: PNG, duration: 8 })],
};
const bodies: Record<string, any[]> = {};
process.env.OPENHIGGSFIELD_PUBLIC_BASE_URL = 'https://me.example.test/';
for (const [k, vs] of Object.entries(VARIANTS) as [Key, Record<string, any>[]][]) { const S = M.ROUTER_MODELS[k];
  bodies[k] = []; for (const v of vs) { assert.equal(S.block!(v), null, `${k} ${v.mode} not blocked: ${S.block!(v)}`); bodies[k].push(await S.body(v, 0)); } }
process.env.OPENHIGGSFIELD_PUBLIC_BASE_URL = '';
{
  const SCHEMAS = ROUTER_SCHEMA_DIR;
  const req = createRequire(import.meta.url); let Ajv: any = null; try { Ajv = req('ajv/dist/2020.js').default ?? req('ajv/dist/2020.js'); } catch { /* no ajv */ }
  let checked = 0;
  for (const [k, file] of Object.entries(NEW) as [Key, string][]) {
    const f = path.join(SCHEMAS, `${file}.json`); if (!fs.existsSync(f) || !Ajv) { console.log(`skip schema ${k}: ${!Ajv ? 'ajv not installed' : 'cached schema absent'}`); continue; }
    const doc = JSON.parse(fs.readFileSync(f, 'utf8')); delete doc.openapi; const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: true });
    const id = `router-${file}`; ajv.addSchema({ ...doc, $id: id });
    const p = Object.keys(doc.paths).find((x) => doc.paths[x]?.post?.requestBody)!; const esc = p.replace(/~/g, '~0').replace(/\//g, '~1');
    const validate = ajv.compile({ $ref: `${id}#/paths/${esc}/post/requestBody/content/application~1json/schema` });
    assert.equal(validate(k === 'router-veo-fast' ? { parameters: { aspectRatio: '1:1' } } : { content: [], ratio: '5:4' }), false, `${k}: the validator does refuse a bad body`);
    for (const b of bodies[k]) { assert.ok(validate(b), `${k}: ${JSON.stringify(validate.errors)?.slice(0, 400)}`); checked++; }
  }
  ok(`schemas: ${checked} body variants valid against the cached Router input schemas`);
}
{ // shape details the schema can't see (field text): 2.5 30 s + adaptive with a frame, 2.0 Fast no 1080p, Veo 1080p → 8 s
  const [t, t30, i2v, flf, r30] = bodies['router-seedance-25'];
  assert.equal(t.duration, 5); assert.equal(t30.duration, 30); assert.equal(t30.resolution, '1080p'); assert.equal(t30.ratio, '9:21'); assert.equal(t30.generate_audio, false);
  assert.equal(i2v.ratio, 'adaptive', '2.5 first frame: adaptive only'); assert.equal(flf.ratio, 'adaptive');
  assert.deepEqual(flf.content.map((c: any) => c.role ?? c.type), ['text', 'first_frame', 'last_frame']);
  assert.equal(r30.content.filter((c: any) => c.role === 'reference_image').length, 30, '30 reference images');
  assert.equal(bodies['router-seedance-25'][6].content.filter((c: any) => c.role === 'reference_audio').length, 1, '2.5: audio-only reference allowed');
  const fv = bodies['router-seedance-20-fast'][4]; assert.equal(fv.content.find((c: any) => c.role === 'reference_video').video_url.url, 'https://me.example.test/files/v3.mp4');
  assert.equal(((await M.ROUTER_MODELS['router-seedance-20-fast'].body(job({ mode: 't2v', resolution: '1080p' }), 0)) as any).resolution, '720p', 'Fast: 1080p never sent');
  assert.equal(((await M.ROUTER_MODELS['router-seedance-20-mini'].body(job({ mode: 't2v', duration: 30 }), 0)) as any).duration, 15, 'Mini: 15 s cap');
  assert.equal(bodies['router-veo-fast'][1].parameters.durationSeconds, 8, 'Veo Fast 1080p → 8 s'); assert.equal(bodies['router-veo-fast'][1].parameters.negativePrompt, 'blur');
  assert.equal(bodies['router-veo-fast'][0].parameters.generateAudio, false); assert.ok(bodies['router-veo-fast'][2].instances[0].image.bytesBase64Encoded);
  ok('bodies: 2.5 30 s / 1080p / adaptive with a frame / 30 refs / audio-only refs; Fast no 1080p; Mini 15 s cap; Veo Fast 1080p = 8 s');
}

// ---------------- 3. limits and prices ----------------
{
  const S25 = M.ROUTER_MODELS['router-seedance-25']; const SF = M.ROUTER_MODELS['router-seedance-20-fast'];
  assert.match(String(S25.block!(job({ mode: 'r2v', refPaths: Array(31).fill(PNG) }))), /up to 30 reference images; you added 31/);
  assert.match(String(SF.block!(job({ mode: 'r2v', refPaths: Array(10).fill(PNG) }))), /up to 9 reference images; you added 10/);
  assert.match(String(SF.block!(job({ mode: 'i2v' }))), /needs the first frame/, 'i2v with no photo refused');
  assert.match(String(S25.block!(job({ mode: 'r2v', refPaths: [PNG], refVideoPaths: [V3], refVideoSecondsEach: [3] }))), /takes up to 0 reference videos/, '2.5: no reference videos here');
  assert.match(String(SF.block!(job({ mode: 'r2v', refPaths: [], refAudioPaths: [A3], refAudioSecondsEach: [3] }))), /only next to a reference image or video/, '2.0 Fast: no audio alone');
  assert.deepEqual(VIDEO_LIMITS['router-seedance-25'].durations, Array.from({ length: 27 }, (_, k) => k + 4));
  assert.deepEqual(VIDEO_LIMITS['router-seedance-20-fast'].resolutions, ['720p', '480p']); assert.deepEqual(VIDEO_LIMITS['router-seedance-20-mini'].resolutions, ['720p', '480p']);
  assert.equal((resolveDuration('h3-video', 'router-veo-fast', 6, '1080p') as any).seconds, 8, 'Veo Fast 1080p 6 s is made at 8 s (D5 snap, quote and submit)'); assert.deepEqual(resolveDuration('h3-video', 'router-veo-fast', 8, '1080p'), { seconds: 8 });
  assert.equal((resolveDuration('h3-video', 'router-seedance-20-fast', 30) as any).seconds, 15); assert.deepEqual(resolveDuration('h3-video', 'router-seedance-25', 30), { seconds: 30 });
  const hv = getTool('h3-video')!; const rt = (id: string) => findRoute(`comfy-router:${id}`)!;
  const up = (cc: number) => Math.ceil(Math.round(cc / 211 * 1e5) / 1e3 - 1e-9);
  const cr = (id: string, o: Record<string, any>) => routeCredits(hv, rt(id), job({ mode: 't2v', ...o }));
  assert.equal(cr('router-seedance-25', { duration: 30, resolution: '1080p' }), up(172.6682 * 30), '2.5 30 s 1080p');
  assert.equal(cr('router-seedance-25', { duration: 5, resolution: '480p' }), up(32.4272 * 5));
  assert.equal(cr('router-seedance-25', { duration: 5, audio: false }), cr('router-seedance-25', { duration: 5, audio: true }), 'Seedance: sound does not change the price');
  assert.equal(cr('router-seedance-20-fast', { duration: 10, resolution: '720p' }), up(36.7273 * 10));
  assert.equal(cr('router-seedance-20-mini', { duration: 4, resolution: '480p' }), up(10.607 * 4));
  assert.equal(cr('router-veo-fast', { duration: 8, resolution: '720p', audio: false }), up(16.88 * 8), 'Veo Fast sound off');
  assert.equal(cr('router-veo-fast', { duration: 8, resolution: '720p', audio: true }), up(21.1 * 8), 'Veo Fast sound on');
  assert.equal(cr('router-veo-fast', { duration: 8, resolution: '1080p', audio: true }), up(25.32 * 8), 'Veo Fast 1080p sound on');
  ok('limits and prices: refs at max, i2v without a photo, no audio alone on 2.0, Veo 1080p = 8 s, 30 s on 2.5 only; Router rates × seconds, Veo sound toggle');
}

// ---------------- 4. Comfy Router video models of 2026-10-31: Veo 3.1 Lite, Wan 3.0 Prime, Pruna P-Video-2, Grok Imagine Video 1.5 Lite ----------------
// Sources: docs.comfy.org/development/comfy-router/models/{veo/veo-3-1-lite-generate-001,wan/wan3-0-video-prime,pruna/p-video-2,xai/grok-imagine-video-1-5-lite}/code
// ("Schema → Input / Output") and …/comfy-router/pricing (fetched 2026-10-31). The body checks below follow those field lists (no cached schema needed).
{
  const hv = getTool('h3-video')!; const ms = toolModels(hv); const S = M.ROUTER_MODELS;
  const NEW4: [string, string, string, string][] = [['router-veo-lite', 'veo-3.1-lite', 'Veo 3.1 Lite', 'veo/veo-3.1-lite-generate-001'], ['router-wan3-prime', 'wan-3.0-prime', 'Wan 3.0 Prime', 'wan/wan3.0-video-prime'],
    ['router-pvideo2', 'p-video-2', 'P-Video-2', 'pruna/p-video-2'], ['router-grok-video-lite', 'grok-imagine-video-1.5-lite', 'Grok Imagine Video 1.5 Lite', 'xai/grok-imagine-video-1.5-lite']];
  for (const [pid, key, name, rid] of NEW4) {
    assert.ok(hv.providers.includes(pid), `${pid} on Generate Video`); const m = ms.find((x) => x.key === key)!; assert.ok(m, key); assert.equal(m.def.name, name); assert.deepEqual(m.parts.map((p) => p.engine), [pid]);
    assert.equal(S[pid].id, rid); assert.equal(S[pid].out, 'video'); assert.equal(S[pid].queue, true); assert.match(S[pid].doc, /^https:\/\/docs\.comfy\.org\/development\/comfy-router\/models\/.+\/code$/);
    const r = findRoute(`comfy-router:${pid}`)!; assert.ok(r, `${pid} route`); assert.equal(r.caps?.routerModel, rid); assert.ok(r.caps?.videoCaps, `${pid}: route videoCaps`);
    assert.ok(VIDEO_LIMITS[pid].source.includes('docs.comfy.org/development/comfy-router/models/'), `${pid}: caps sourced`);
  }
  // caps = the schema (UI shows only valid controls)
  assert.deepEqual(VIDEO_LIMITS['router-veo-lite'].resolutions, ['720p', '1080p'], 'Veo Lite: no 4K'); assert.deepEqual(VIDEO_LIMITS['router-veo-lite'].durations, [4, 6, 8]); assert.deepEqual(VIDEO_LIMITS['router-veo-lite'].aspects, ['auto', '16:9', '9:16']);
  assert.equal(VIDEO_LIMITS['router-veo-lite'].audio.priceAffects, true);
  assert.deepEqual(VIDEO_LIMITS['router-wan3-prime'].durations, VIDEO_LIMITS['router-wan3'].durations); assert.deepEqual(VIDEO_LIMITS['router-wan3-prime'].refKinds, { image: 10 });
  assert.deepEqual(VIDEO_LIMITS['router-pvideo2'].resolutions, ['720p', '1080p']); assert.equal(VIDEO_LIMITS['router-pvideo2'].maxSeconds, 20); assert.equal(VIDEO_LIMITS['router-pvideo2'].audio.priceAffects, false);
  assert.deepEqual(VIDEO_LIMITS['router-grok-video-lite'].resolutions.slice().sort(), ['1080p', '480p', '720p']); assert.equal(VIDEO_LIMITS['router-grok-video-lite'].maxSeconds, 15); assert.equal(VIDEO_LIMITS['router-grok-video-lite'].audio.supported, false, 'Grok Lite page: Output: Video');
  const modes = (hv as any).app?.providerModes ?? (hv as any).providerModes;
  if (modes) { assert.deepEqual(modes['router-veo-lite'], ['t2v', 'i2v']); assert.deepEqual(modes['router-wan3-prime'], ['t2v', 'i2v', 'flf', 'r2v']); assert.deepEqual(modes['router-pvideo2'], ['t2v', 'i2v', 'flf']); assert.deepEqual(modes['router-grok-video-lite'], ['t2v', 'i2v']); }
  // bodies
  const vl: any = await S['router-veo-lite'].body(job({ mode: 't2v', duration: 6, resolution: '4K', audio: true }), 0);
  assert.equal(vl.parameters.resolution, '720p', 'Veo Lite: 4K never sent'); assert.equal(vl.parameters.generateAudio, true); assert.equal(vl.instances[0].prompt, job({}).prompt);
  const vl1080: any = await S['router-veo-lite'].body(job({ mode: 'i2v', imagePath: PNG, duration: 4, resolution: '1080p' }), 0); assert.equal(vl1080.parameters.durationSeconds, 8); assert.ok(vl1080.instances[0].image.bytesBase64Encoded);
  const wp: any = await S['router-wan3-prime'].body(job({ mode: 'r2v', refPaths: Array(10).fill(PNG), resolution: '1080p', duration: 30 }), 0);
  assert.equal(wp.input.media.length, 10); assert.equal(wp.parameters.resolution, '1080P'); assert.equal(wp.parameters.duration, 30); assert.equal(wp.parameters.ratio, '16:9');
  assert.match(String(S['router-wan3-prime'].block!(job({ mode: 'r2v', refPaths: Array(11).fill(PNG) }))), /./, 'Wan Prime: 11 refs refused (body caps at 10)');
  const pv: any = await S['router-pvideo2'].body(job({ mode: 't2v', duration: 30, resolution: '1080p', aspect: '4:3', audio: false }), 0);
  assert.deepEqual(Object.keys(pv), ['input']); assert.equal(pv.input.duration, 20, 'P-Video-2: 20 s cap'); assert.equal(pv.input.resolution, '1080p'); assert.equal(pv.input.aspect_ratio, '4:3');
  assert.equal(pv.input.draft, false); assert.equal(pv.input.save_audio, false); assert.equal(pv.input.fps, 24); assert.equal(pv.input.image, undefined);
  process.env.OPENHIGGSFIELD_PUBLIC_BASE_URL = 'https://me.example.test/';
  const pvf: any = await S['router-pvideo2'].body(job({ mode: 'flf', imagePath: PNG, lastFramePath: PNG, aspect: '1:1' }), 0);
  assert.equal(pvf.input.image, 'https://me.example.test/files/ref.png', 'P-Video-2: the frame goes as a link (URI field)'); assert.equal(pvf.input.last_frame_image, 'https://me.example.test/files/ref.png'); assert.equal(pvf.input.aspect_ratio, undefined, 'aspect ignored with an image: not sent');
  process.env.OPENHIGGSFIELD_PUBLIC_BASE_URL = '';
  assert.match(String(S['router-pvideo2'].block!(job({ mode: 'r2v', refPaths: [PNG] }))), /no reference images/);
  assert.match(String(S['router-pvideo2'].block!(job({ mode: 'r2v', refPaths: [], refAudioPaths: [A3], refAudioSecondsEach: [3] }))), /./, 'P-Video-2: reference audio not taken here');
  const gk: any = await S['router-grok-video-lite'].body(job({ mode: 't2v', duration: 20, resolution: '480p', aspect: '9:16' }), 0);
  assert.equal(gk.model, 'grok-imagine-video-1.5-lite'); assert.equal(gk.duration, 15, 'Grok Lite: 15 s cap'); assert.equal(gk.resolution, '480p'); assert.equal(gk.aspect_ratio, '9:16'); assert.equal(gk.image, undefined);
  const gki: any = await S['router-grok-video-lite'].body(job({ mode: 'i2v', imagePath: PNG }), 0); assert.equal(gki.image.type, 'image_url'); assert.match(gki.image.url, /^data:image\/png;base64,/); assert.equal(gki.aspect_ratio, undefined);
  assert.match(String(S['router-grok-video-lite'].block!(job({ mode: 't2v', prompt: 'x'.repeat(4097) }))), /4,096 characters; yours is 4,097/);
  assert.equal(S['router-grok-video-lite'].block!(job({ mode: 't2v', prompt: 'x'.repeat(4096) })), null);
  assert.match(String(S['router-grok-video-lite'].block!(job({ mode: 'flf', imagePath: PNG, lastFramePath: PNG }))), /text or a first frame/);
  // outputs and refusals
  assert.deepEqual(S['router-pvideo2'].outputs({ status: 'succeeded', generation_url: 'https://x.test/v.mp4' }), [{ url: 'https://x.test/v.mp4' }]);
  assert.deepEqual(S['router-pvideo2'].outputs({ status: 'failed', error: 'nsfw' }), { refused: 'nsfw' });
  assert.deepEqual(S['router-grok-video-lite'].outputs({ status: 'done', video: { url: 'https://x.test/g.mp4' } }), [{ url: 'https://x.test/g.mp4' }]);
  assert.deepEqual(S['router-grok-video-lite'].outputs({ block_reason: 'moderation' }), { refused: 'moderation' });
  assert.deepEqual(S['router-wan3-prime'].outputs({ output: { task_status: 'SUCCEEDED', video_url: 'https://x.test/w.mp4' } }), [{ url: 'https://x.test/w.mp4' }]);
  // prices = the Router pricing page (credits per s × seconds, rounded up)
  const rt = (id: string) => findRoute(`comfy-router:${id}`)!; const up = (cc: number) => Math.ceil(Math.round(cc / 211 * 1e5) / 1e3 - 1e-9);
  const cr = (id: string, o: Record<string, any>) => routeCredits(hv, rt(id), job({ mode: 't2v', ...o }));
  assert.equal(cr('router-veo-lite', { duration: 4, resolution: '720p', audio: false }), up(6.33 * 4), 'Veo Lite 720p no sound');
  assert.equal(cr('router-veo-lite', { duration: 8, resolution: '720p', audio: true }), up(10.55 * 8), 'Veo Lite 720p sound');
  assert.equal(cr('router-veo-lite', { duration: 8, resolution: '1080p', audio: false }), up(10.55 * 8)); assert.equal(cr('router-veo-lite', { duration: 8, resolution: '1080p', audio: true }), up(16.88 * 8));
  assert.equal(cr('router-wan3-prime', { duration: 5, resolution: '480p' }), up(14.348 * 5)); assert.equal(cr('router-wan3-prime', { duration: 5, resolution: '720p' }), up(29.54 * 5)); assert.equal(cr('router-wan3-prime', { duration: 30, resolution: '1080p' }), up(59.08 * 30));
  assert.equal(cr('router-wan3-prime', { mode: 'r2v', refPaths: Array(10).fill(PNG), duration: 5 }), cr('router-wan3-prime', { duration: 5 }), 'Wan Prime: references do not change the price');
  assert.equal(cr('router-pvideo2', { duration: 5, resolution: '720p' }), up(7.5432 * 5)); assert.equal(cr('router-pvideo2', { duration: 20, resolution: '1080p' }), up(15.0865 * 20));
  assert.equal(cr('router-pvideo2', { duration: 5, audio: false }), cr('router-pvideo2', { duration: 5, audio: true }), 'P-Video-2: sound does not change the price');
  assert.equal(cr('router-grok-video-lite', { duration: 5, resolution: '480p' }), up(6.0346 * 5)); assert.equal(cr('router-grok-video-lite', { duration: 5, resolution: '720p' }), up(9.0519 * 5)); assert.equal(cr('router-grok-video-lite', { duration: 15, resolution: '1080p' }), up(42.2422 * 15));
  assert.equal((resolveDuration('h3-video', 'router-veo-lite', 6, '1080p') as any).seconds, 8, 'Veo Lite 1080p: 8 s'); assert.equal((resolveDuration('h3-video', 'router-pvideo2', 25) as any).seconds, 20); assert.equal((resolveDuration('h3-video', 'router-grok-video-lite', 20) as any).seconds, 15);
  ok('2026-10-31 models: Veo 3.1 Lite / Wan 3.0 Prime / P-Video-2 / Grok Imagine Video 1.5 Lite each one card; caps, bodies, refusals and Router prices match the docs');
}
fs.rmSync(D, { recursive: true, force: true });
