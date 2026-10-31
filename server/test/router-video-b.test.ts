// Comfy Router video models, batch B (2026-10-25): Kling 3.0 Omni (every Generate Video mode on router-kling), Wan 3.0 (router-wan3, new model), and
// Comfy Router as another place of LTX-2.5 Pro (router-ltx-25-pro) and FLUX 3 Video (router-flux3-video). In process, no key, no network, no spend.
//  1. Every body variant validates against the model's official Router input schema (the POST requestBody of GET /v2/models/<id>/openapi.json),
//     read from MODEL_HEALTH_SCHEMAS / ROUTER_SCHEMAS_DIR or the generic user cache (<provider>__<model>.json); skipped explicitly when absent.
//  2. Limits refused by `block` in plain words: refs over the max, LTX image modes / 1:1, FLUX reference images / draft / 4K, Kling prompt cap.
//  3. Prices: the route price (what quote and submit both use) = the published per-second rates, sound on / off where it matters.
//  4. One model per engine pair: LTX-2.5 Pro and FLUX 3 Video gain a Comfy place (same model card), Wan 3.0 is a new model, Kling stays one row.
//  5. Lengths (one rule for quote and submit), refusals inside a 200 (outputs → { refused }), and the Generate Video form.
// Sources: docs.comfy.org/development/comfy-router/models/{kling/kling-v3-omni,wan/wan3-0-video,ltx/ltx-2-5-pro,black-forest-labs/flux-3-video}/code,
// docs.comfy.org/development/comfy-router/pricing, docs.comfy.org/tutorials/partner-nodes/pricing, docs.comfy.org/built-in-nodes/KlingOmniProImageToVideoNode.
// Run: npx tsx test/router-video-b.test.ts
import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { ROUTER_SCHEMA_DIR } from './_model-health.js';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'rvb-')); const DATA = fs.mkdtempSync(path.join(D, 'data-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_LTX_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
Object.assign(process.env, NOKEYS, { OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_COMFY_ROUTER_URL: 'http://127.0.0.1:9' });
const ok = (m: string) => console.log('ok ' + m);
const png = (n: string) => { const p = path.join(DATA, n); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=orange:s=320x320', '-frames:v', '1', p]); return p; };
const A = png('a.png'), B = png('b.png'); const refs = (n: number) => Array.from({ length: n }, (_, k) => (k % 2 ? B : A));

const M = await import('../src/routing/routerModels.ts'); const { findRoute } = await import('../src/routing/routes.ts'); const { routeCredits } = await import('../src/routing/select.ts');
const { getTool } = await import('../src/tools/registry.ts'); const { VIDEO_LIMITS, resolveDuration } = await import('../src/tools/h3/videoCaps.ts');
const R = await import('../src/routing/modelRegistry.ts');
const hv = getTool('h3-video')!; const S = M.ROUTER_MODELS;
const job = (o: Record<string, any>) => ({ mode: 't2v', types: [o.mode ?? 't2v'], prompt: 'a paper boat drifting down a rainy street at dusk', duration: 5, resolution: '720p', aspect: 'auto', audio: true, ...o });

// ---------------- 1. bodies vs the official Router input schemas ----------------
const VARIANTS: Record<string, [string, Record<string, any>][]> = {
  'router-kling': [['t2v 720p silent', job({ audio: false })], ['t2v 1080p 15 s 9:16 sound', job({ resolution: '1080p', duration: 15, aspect: '9:16' })], ['t2v 3 s 1:1', job({ duration: 3, aspect: '1:1' })],
    ['i2v', job({ mode: 'i2v', imagePath: A, aspect: '16:9' })], ['flf', job({ mode: 'flf', imagePath: A, lastFramePath: B })], ['r2v 7 refs (max)', job({ mode: 'r2v', refPaths: refs(7) })],
    ['r2v named refs', job({ mode: 'r2v', refPaths: refs(2), prompt: 'the cat from <<<image_1>>> on the boat from <<<image_2>>>' })]],
  'router-wan3': [['t2v auto', job({})], ['t2v 4:3 480p 30 s', job({ aspect: '4:3', resolution: '480p', duration: 30 })], ['t2v 1080p 2 s silent, negative, seed', job({ resolution: '1080p', duration: 2, audio: false, negativePrompt: 'blur', seed: 7 })],
    ['i2v', job({ mode: 'i2v', imagePath: A })], ['flf', job({ mode: 'flf', imagePath: A, lastFramePath: B })], ['r2v 10 refs (max)', job({ mode: 'r2v', refPaths: refs(10), aspect: '9:16' })]],
  'router-ltx-25-pro': [['t2v 720p 16:9 6 s', job({ duration: 6, aspect: '16:9' })], ['t2v 1080p 9:16 10 s silent', job({ resolution: '1080p', duration: 10, aspect: '9:16', audio: false })], ['t2v auto 8 s', job({ duration: 8 })]],
  'router-flux3-video': [['t2v 720p', job({})], ['t2v 1080p 20 s 21:9 silent', job({ resolution: '1080p', duration: 20, aspect: '21:9', audio: false })], ['i2v', job({ mode: 'i2v', imagePath: A })], ['flf', job({ mode: 'flf', imagePath: A, lastFramePath: B })]],
};
const SCHEMAS = ROUTER_SCHEMA_DIR;
const bodies: Record<string, Record<string, any>> = {};
for (const [prov, vs] of Object.entries(VARIANTS)) for (const [label, i] of vs) { assert.equal(S[prov].block!(i), null, `${prov} ${label}: not blocked`); bodies[`${prov} ${label}`] = await S[prov].body(i, 0); }
{ let Ajv: any = null; try { Ajv = (await import('../../node_modules/ajv/dist/2020.js' as string)).default; } catch { /* ajv not installed */ }
  let checked = 0; const skipped: string[] = [];
  for (const prov of Object.keys(VARIANTS)) {
    const id = S[prov].id; const f = path.join(SCHEMAS, `${id.replace('/', '__')}.json`);
    if (!Ajv || !fs.existsSync(f)) { skipped.push(id); continue; }
    const { openapi: _o, ...doc } = JSON.parse(fs.readFileSync(f, 'utf8')); const sid = `router:${id}`; const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: true });
    ajv.addSchema({ ...doc, $id: sid }); const p = Object.keys(doc.paths).find((k) => doc.paths[k].post)!;
    const validate = ajv.compile({ $ref: `${sid}#/paths/${p.replace(/~/g, '~0').replace(/\//g, '~1')}/post/requestBody/content/application~1json/schema` });
    for (const [label] of VARIANTS[prov]) { const b = bodies[`${prov} ${label}`]; assert.ok(validate(b), `${id} ${label}: ${JSON.stringify(validate.errors)} body ${JSON.stringify(b).slice(0, 300)}`); checked++; }
  }
  ok(`schema: ${checked} bodies valid against the official Router schemas${skipped.length ? `; skipped (no cached schema or ajv): ${skipped.join(', ')}` : ''}`); }
{ const k = (l: string) => bodies[`router-kling ${l}`];
  assert.deepEqual([k('t2v 720p silent').mode, k('t2v 720p silent').sound, k('t2v 720p silent').aspect_ratio, k('t2v 720p silent').duration], ['std', 'off', '16:9', '5']);
  assert.deepEqual([k('t2v 1080p 15 s 9:16 sound').mode, k('t2v 1080p 15 s 9:16 sound').sound, k('t2v 1080p 15 s 9:16 sound').duration], ['pro', 'on', '15']);
  assert.equal(k('i2v').aspect_ratio, undefined); assert.deepEqual(k('i2v').image_list.map((x: any) => x.type), ['first_frame']); assert.deepEqual(k('flf').image_list.map((x: any) => x.type), ['first_frame', 'end_frame']);
  assert.equal(k('r2v 7 refs (max)').image_list.length, 7); assert.ok(k('r2v 7 refs (max)').image_list.every((x: any) => !x.type && /^data:image\/png;base64,/.test(x.image_url)));
  assert.match(k('r2v 7 refs (max)').prompt, /Reference images: <<<image_1>>>.*<<<image_7>>>\.$/); assert.equal(k('r2v named refs').prompt, VARIANTS['router-kling'][6][1].prompt);
  const w = (l: string) => bodies[`router-wan3 ${l}`];
  assert.deepEqual(w('t2v auto').parameters, { resolution: '720P', duration: 5, ratio: '16:9', audio: true, prompt_extend: false, watermark: false });
  assert.deepEqual([w('t2v 4:3 480p 30 s').parameters.ratio, w('t2v 4:3 480p 30 s').parameters.resolution, w('t2v 4:3 480p 30 s').parameters.duration], ['4:3', '480P', 30]);
  assert.deepEqual([w('t2v 1080p 2 s silent, negative, seed').parameters.audio, w('t2v 1080p 2 s silent, negative, seed').input.negative_prompt, w('t2v 1080p 2 s silent, negative, seed').parameters.seed], [false, 'blur', 7]);
  assert.deepEqual(w('flf').input.media.map((x: any) => x.type), ['first_frame', 'last_frame']); assert.equal(w('flf').parameters.ratio, 'adaptive');
  assert.equal(w('r2v 10 refs (max)').input.media.length, 10); assert.ok(w('r2v 10 refs (max)').input.media.every((x: any) => x.type === 'reference_image')); assert.equal(w('r2v 10 refs (max)').parameters.ratio, '9:16');
  const l = (x: string) => bodies[`router-ltx-25-pro ${x}`];
  assert.deepEqual(l('t2v 720p 16:9 6 s'), { prompt: VARIANTS['router-kling'][0][1].prompt, duration: 6, resolution: '1280x720', fps: 24, generate_audio: true });
  assert.deepEqual([l('t2v 1080p 9:16 10 s silent').resolution, l('t2v 1080p 9:16 10 s silent').generate_audio], ['1080x1920', false]); assert.equal(l('t2v auto 8 s').resolution, '1280x720');
  assert.equal((await S['router-ltx-25-pro'].body(job({ duration: 7 }), 0) as any).duration, 6); // a length off the list snaps to the nearest (the form refuses it first)
  const f = (x: string) => bodies[`router-flux3-video ${x}`];
  assert.deepEqual([f('t2v 720p').mode, f('t2v 720p').resolution, f('t2v 720p').duration, f('t2v 720p').generate_audio], ['t2v', 'hd', 5, true]);
  assert.deepEqual([f('t2v 1080p 20 s 21:9 silent').resolution, f('t2v 1080p 20 s 21:9 silent').duration, f('t2v 1080p 20 s 21:9 silent').aspect_ratio], ['fhd', 20, '21:9']);
  assert.equal(f('i2v').mode, 'i2v'); assert.equal(typeof f('i2v').keyframes, 'string'); assert.equal(f('flf').keyframes.length, 2);
  ok('bodies: Kling std/pro, sound, aspect only without a frame, first/end frame, 7 refs named <<<image_N>>>; Wan ratio/resolution/media; LTX WxH 24 fps; FLUX hd/fhd keyframes'); }

// ---------------- 2. limits refused before any call ----------------
{ assert.match(String(S['router-kling'].block!(job({ mode: 'r2v', refPaths: refs(8) }))), /up to 7 reference images; you added 8/);
  assert.match(String(S['router-kling'].block!(job({ prompt: 'x'.repeat(2501) }))), /up to 2,500 characters/);
  assert.match(String(S['router-ltx-25-pro'].block!(job({ mode: 'i2v', imagePath: A }))), /text to video only/);
  assert.match(String(S['router-ltx-25-pro'].block!(job({ aspect: '1:1' }))), /16:9 or 9:16/);
  assert.match(String(S['router-ltx-25-pro'].block!(job({ resolution: '4K' }))), /720p or 1080p/);
  assert.match(String(S['router-flux3-video'].block!(job({ mode: 'r2v', refPaths: refs(1) }))), /no reference images/);
  assert.match(String(S['router-flux3-video'].block!(job({ draft: true }))), /no draft/); assert.equal(S['router-flux3-video'].block!(job({ resolution: '4K' })), null, '4K runs on Router (2026-10-28)'); assert.match(String(S['router-flux3-video'].block!(job({ resolution: '480p' }))), /480p runs on the BFL API/);
  for (const p of Object.keys(VARIANTS)) assert.match(String(S[p].block!(job({ mode: 'r2v', refPaths: refs(1), refVideoPaths: [A] }))), /reference videos or audio run on another route/);
  await assert.rejects(S['router-ltx-25-pro'].body(job({ mode: 'i2v', imagePath: A }), 0), /text to video only/); // the body refuses too, so no call is made
  ok('blocks: Kling 8 refs / long prompt, LTX image modes / 1:1 / 4K, FLUX refs / draft / 480p, reference video or audio on every one'); }

// ---------------- 3. prices: route credits (quote = submit) = published Comfy credits per second ----------------
{ const up = (x: number) => Math.ceil(Math.round(x * 1e6) / 1e6); const cr = (comfy: number) => up(Math.round((comfy / 211) * 1e5) / 1e5 * 100);
  const q = (p: string, o: Record<string, any>) => routeCredits(hv, findRoute(`comfy-router:${p}`)!, job(o));
  assert.deepEqual([q('router-kling', { audio: false }), q('router-kling', { resolution: '1080p', audio: false }), q('router-kling', {}), q('router-kling', { resolution: '1080p' })], [cr(17.72 * 5), cr(23.63 * 5), cr(23.63 * 5), cr(29.54 * 5)]);
  assert.equal(q('router-kling', { mode: 'r2v', refPaths: refs(7), resolution: '1080p', duration: 15 }), cr(29.54 * 15)); // refs cost nothing extra; longest length
  assert.deepEqual([q('router-wan3', { resolution: '480p', duration: 30 }), q('router-wan3', {}), q('router-wan3', { resolution: '1080p' }), q('router-wan3', { audio: false })], [cr(15.09 * 30), cr(30.17 * 5), cr(60.35 * 5), cr(30.17 * 5)]); // 2026-10-31: the partner-node rates Router bills (hostedPrices.ts); sound keeps the price
  assert.deepEqual([q('router-ltx-25-pro', { duration: 6 }), q('router-ltx-25-pro', { resolution: '1080p', duration: 10, audio: false })], [cr(36.2076 * 6), cr(51.2941 * 10)]);
  assert.deepEqual([q('router-flux3-video', {}), q('router-flux3-video', { resolution: '1080p', duration: 20 })], [cr(51.29 * 5), cr(87.5 * 20)]);
  ok('prices: Kling Omni 17.72/23.63 (+sound 23.63/29.54), Wan 15.09/30.17/60.35, LTX 36.2076/51.2941, FLUX 51.29/87.50 credits per s'); }

// ---------------- 4. engines → models ----------------
{ const ms = R.toolModels('h3-video'); const eng = (k: string) => ms.find((m) => m.key === k)!.parts.map((p) => p.engine);
  assert.deepEqual(eng('ltx-2.5-pro'), ['direct-ltx-25-pro', 'router-ltx-25-pro']); assert.deepEqual(eng('flux-3-video'), ['direct-flux3-video', 'router-flux3-video']);
  assert.deepEqual(eng('wan-3.0'), ['router-wan3']); assert.deepEqual(eng('kling-v3'), ['router-kling']);
  const r = R.resolveModelRequest('h3-video', { model: 'ltx-2.5-pro', runOn: 'comfy-cloud', types: '["t2v"]' } as any) as any; assert.equal(r.provider, 'router-ltx-25-pro');
  const f = R.resolveModelRequest('h3-video', { model: 'flux-3-video', runOn: 'comfy-cloud', types: '["i2v"]' } as any) as any; assert.equal(f.provider, 'router-flux3-video');
  ok('LTX-2.5 Pro and FLUX 3 Video: one model, two places (lab API + Comfy); Wan 3.0 new; Kling one row'); }

// ---------------- 5. lengths, refusals in a 200, the form ----------------
{ const d = (p: string, s: number) => resolveDuration('h3-video', p, s); const bad = (x: any) => !!x && !!x.snapped; // D5: an off-list length snaps (with a note) instead of a 400
  assert.ok(!bad(d('router-wan3', 30)) && bad(d('router-wan3', 31)) && !bad(d('router-wan3', 2))); assert.ok(!bad(d('router-flux3-video', 20)) && bad(d('router-flux3-video', 4)));
  assert.ok(!bad(d('router-ltx-25-pro', 10)) && bad(d('router-ltx-25-pro', 12)) && bad(d('router-ltx-25-pro', 7))); assert.ok(!bad(d('router-kling', 15)) && bad(d('router-kling', 16)));
  assert.equal((d('router-wan3', 31) as any).seconds, 30); assert.equal((d('router-flux3-video', 4) as any).seconds, 5);
  assert.deepEqual(VIDEO_LIMITS['router-ltx-25-pro'].aspects, ['auto', '16:9', '9:16']); assert.deepEqual(VIDEO_LIMITS['router-kling'].refKinds, { image: 7 });
  assert.deepEqual(S['router-kling'].outputs({ data: { task_status: 'failed', task_status_msg: 'risk control' } }), { refused: 'risk control' });
  assert.deepEqual(S['router-kling'].outputs({ data: { task_status: 'succeed', task_result: { videos: [{ url: 'https://x/v.mp4' }] } } }), [{ url: 'https://x/v.mp4' }]);
  assert.deepEqual(S['router-wan3'].outputs({ code: 'DataInspectionFailed', message: 'Input data may contain inappropriate content.' }), { refused: 'Input data may contain inappropriate content.' });
  assert.deepEqual(S['router-wan3'].outputs({ output: { task_status: 'FAILED', message: 'bad' } }), { refused: 'bad' }); assert.deepEqual(S['router-wan3'].outputs({ output: { task_status: 'SUCCEEDED', video_url: 'https://x/w.mp4' } }), [{ url: 'https://x/w.mp4' }]);
  assert.deepEqual(S['router-ltx-25-pro'].outputs({ status: 'failed', error: { message: 'moderated' } }), { refused: 'moderated' }); assert.deepEqual(S['router-ltx-25-pro'].outputs({ status: 'completed', result: { video_url: 'https://x/l.mp4' } }), [{ url: 'https://x/l.mp4' }]);
  assert.deepEqual(S['router-flux3-video'].outputs({ status: 'Content Moderated', result: {} }), { refused: 'Content Moderated' }); assert.deepEqual(S['router-flux3-video'].outputs({ status: 'Ready', result: { sample: 'https://x/f.mp4' } }), [{ url: 'https://x/f.mp4' }]);
  // the form: image to video without a photo, and refs over a model's max, are 400s before any job exists
  const fs2 = (o: Record<string, string>) => ({ prompt: 'a boat', rights: '1', ...o });
  const noPhoto: any = await hv.parseInput(fs2({ types: '["i2v"]', provider: 'router-wan3', duration: '5' }), {}); assert.ok('error' in noPhoto, JSON.stringify(noPhoto));
  const img = (n: number) => Array.from({ length: n }, (_, k) => { const f = `r${k}.png`; fs.copyFileSync(A, path.join(DATA, f)); return f; });
  const kOver: any = await hv.parseInput(fs2({ types: '["r2v"]', provider: 'router-kling', duration: '5' }), { image: img(1), refs: img(8).slice(1) }); assert.ok('error' in kOver, JSON.stringify(kOver).slice(0, 300));
  const kMax: any = await hv.parseInput(fs2({ types: '["r2v"]', provider: 'router-kling', duration: '5' }), { image: img(1), refs: img(7).slice(1) }); assert.ok(!('error' in kMax), JSON.stringify(kMax).slice(0, 300));
  const ltxImg: any = await hv.parseInput(fs2({ types: '["t2v"]', provider: 'router-ltx-25-pro', duration: '6', aspect: '1:1' }), {}); assert.ok(!('error' in ltxImg) && ltxImg.aspect !== '1:1' && ltxImg.adjustNotes?.length, JSON.stringify(ltxImg).slice(0, 300)); // D5: the closest shape, with a note
  ok('lengths (Wan 2–30, FLUX 5–20, LTX 6/8/10, Kling 3–15), refusal shapes, form: i2v without a photo and 8 Kling refs refused; LTX 1:1 made at the closest shape; 7 Kling refs fine'); }
process.exit(0);
