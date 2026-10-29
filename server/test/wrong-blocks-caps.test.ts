// Wrong blocks fixed (2026-10-28, usability audit W1–W8): rules that refused runs the provider would take. In process, mock backend, no keys,
// no network, no spend. Values checked against the local Comfy docs copy (paths in the source comments; no doc text here).
//  W1 LTX-2.5 Pro on Comfy Router: 2–6, 8, 10 s (5 s, the Recreate default, runs; 7 / 9 s are still not in the Router's list).
//  W2 LTX-2.5 Pro on the LTX API: still 6 / 8 / 10 s (docs.ltx.io re-read: a real provider rule).
//  W3 MiniMax H3 on Comfy Router: 4–15 s, default still 5 s.
//  W5 Veo 3.1 / 3.1 Fast: 4K offered, priced, 8 s only, sent as "4k".
//  W6 FLUX 3 Video on Comfy Router: 1440p / 4K offered, priced, sent as qhd / uhd.
//  W8 Wan 3.0: a prompt over 20,000 characters is cut by the provider, so it runs with a warning; refusing caps (Kling) unchanged.
// (W4 Camera Motion and W7 Talking Photo: h3-router-places.test.ts; durations-camera.e2e.ts covers the 4 s H3 listing.)
// Run: npx tsx test/wrong-blocks-caps.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'wrongblocks-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', COMFY_API_KEY: '', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const { VIDEO_LIMITS, resolveDuration, videoCapsBlock, defaultSecondsFor } = await import('../src/tools/h3/videoCaps.js');
const { ROUTER_MODELS } = await import('../src/routing/routerModels.js');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.js');
const { priceOf } = await import('../src/shared/pricing.js');
const { promptLimitIssue, promptCutNote } = await import('../src/shared/promptRefs.js');
const bad = (r: unknown) => !!r && typeof r === 'object' && 'error' in (r as object);
const body = async (id: string, i: Record<string, any>) => (await ROUTER_MODELS[id].body!({ prompt: 'a lighthouse at dusk', mode: 't2v', ...i } as any)) as any;
const credits = (provider: string, quality: string, sec: number, audio = false) => priceOf({ toolId: 'h3-video', provider, quality, durationSec: sec, audio } as any).credits;

// ---- W1 / W2: LTX-2.5 Pro ----
{
  const L = VIDEO_LIMITS['router-ltx-25-pro']; assert.deepEqual(L.durations, [2, 3, 4, 5, 6, 8, 10]); assert.equal(L.minSeconds, 2); assert.equal(L.maxSeconds, 10);
  assert.deepEqual(videoCapsBlock(L).durations, [2, 3, 4, 5, 6, 8, 10], 'the picker reads the same list');
  for (const s of [2, 5, 6, 10]) assert.deepEqual(resolveDuration('h3-video', 'router-ltx-25-pro', s), { seconds: s }, `${s} s runs`);
  for (const [s, to] of [[1, 2], [7, 8], [9, 10], [12, 10]]) { const r: any = resolveDuration('h3-video', 'router-ltx-25-pro', s); assert.ok(!bad(r) && r.seconds === to && /Made at/.test(r.snapped?.note), `${s} s is made at ${to} s (D5 snap): ${JSON.stringify(r)}`); }
  for (const s of [2, 5, 8]) assert.equal((await body('router-ltx-25-pro', { duration: s, resolution: '720p' })).duration, s, `${s} s is sent as asked`);
  assert.ok(ROUTER_MODELS['router-ltx-25-pro'].block!({ mode: 't2v', duration: 5, resolution: '1080p', aspect: '16:9' } as any) == null, '5 s at 1080p is not blocked');
  assert.ok(credits('router-ltx-25-pro', '720p', 5) > 0, 'priced at 5 s');
  assert.deepEqual(VIDEO_LIMITS['direct-ltx-25-pro'].durations, [6, 8, 10], 'the LTX API place keeps its documented 6 / 8 / 10 s');
  ok('W1 LTX-2.5 Pro on Router: 2–6 / 8 / 10 s on caps, quote and body (5 s runs, 7 / 9 s still refused); W2 LTX API place unchanged at 6 / 8 / 10 s');
}
// ---- W3: MiniMax H3 on Comfy Router ----
{
  const L = VIDEO_LIMITS['api-minimax-h3']; assert.equal(L.minSeconds, 4); assert.deepEqual(L.durations, Array.from({ length: 12 }, (_, k) => k + 4)); assert.equal(defaultSecondsFor(L), 5, 'default still 5 s');
  assert.deepEqual(resolveDuration('h3-video', 'api-minimax-h3', 4), { seconds: 4 }); assert.equal((resolveDuration('h3-video', 'api-minimax-h3', 3) as any).seconds, 4); assert.equal((resolveDuration('h3-video', 'api-minimax-h3', 16) as any).seconds, 15); // D5: snapped with a note
  assert.ok(credits('api-minimax-h3', '768p', 4) < credits('api-minimax-h3', '768p', 5), '4 s costs less than 5 s');
  ok('W3 MiniMax H3 on Router: 4–15 s (4 s runs and is priced for 4 s), default 5 s, 3 / 16 s made at 4 / 15 s with a note');
}
// ---- W5: Veo 3.1 / 3.1 Fast 4K ----
{
  for (const id of ['router-veo', 'router-veo-fast']) {
    const L = VIDEO_LIMITS[id]; assert.ok(L.resolutions.includes('4K'), `${id} offers 4K`); assert.deepEqual(L.durationsByResolution?.['4K'], [8]); assert.deepEqual(videoCapsBlock(L).durationsByResolution?.['4K'], [8], 'the picker reads 4K = 8 s');
    assert.deepEqual(resolveDuration('h3-video', id, 8, '4K'), { seconds: 8 }); assert.equal((resolveDuration('h3-video', id, 4, '4K') as any).seconds, 8, '4 s at 4K (Google makes 8 s only) is made at 8 s, with a note (D5)');
    const b = await body(id, { duration: 8, resolution: '4K', aspect: '16:9' }); assert.equal(b.parameters.resolution, '4k'); assert.equal(b.parameters.durationSeconds, 8);
    const b2 = await body(id, { duration: 4, resolution: '720p' }); assert.equal(b2.parameters.resolution, '720p'); assert.equal(b2.parameters.durationSeconds, 4);
  }
  const c = (n: number) => Math.round((n / 211) * 1e5) / 1e5; // Comfy credits → USD, as hostedPrices
  assert.equal(HOSTED_BY_ID['router-veo'].usdByQuality!['4K'], c(84.4)); assert.equal(HOSTED_BY_ID['router-veo'].audio!.usdByQuality!['4K'], c(126.6));
  assert.equal(HOSTED_BY_ID['router-veo-fast'].usdByQuality!['4K'], c(52.75)); assert.equal(HOSTED_BY_ID['router-veo-fast'].audio!.usdByQuality!['4K'], c(63.3));
  assert.equal(HOSTED_BY_ID['router-veo'].usdByQuality!['1080p'], c(42.2), '1080p unchanged');
  const v4 = credits('router-veo', '4K', 8), v1 = credits('router-veo', '1080p', 8); assert.ok(v4 > v1 && v4 <= 2 * v1 + 1, `Veo 4K ${v4} vs 1080p ${v1}`);
  assert.ok(credits('router-veo', '4K', 8, true) > v4, 'sound on costs more at 4K');
  ok(`W5 Veo 3.1 / Fast: 4K offered (8 s only), sent as "4k", priced ${v4} credits for 8 s (Router pricing 4K column)`);
}
// ---- W6: FLUX 3 Video on Comfy Router ----
{
  const L = VIDEO_LIMITS['router-flux3-video']; assert.deepEqual([...L.resolutions].sort(), ['1080p', '1440p', '4K', '720p']); assert.equal(L.maxResolution, '4K');
  const blk = ROUTER_MODELS['router-flux3-video'].block!;
  for (const res of ['720p', '1080p', '1440p', '4K']) assert.equal(blk({ mode: 't2v', resolution: res, duration: 5 } as any), null, `${res} runs on Router`);
  assert.match(String(blk({ mode: 't2v', resolution: '480p', duration: 5 } as any)), /480p runs on the BFL API/);
  for (const [res, want] of [['720p', 'hd'], ['1080p', 'fhd'], ['1440p', 'qhd'], ['4K', 'uhd']] as const) assert.equal((await body('router-flux3-video', { resolution: res, duration: 5 })).resolution, want);
  const q = HOSTED_BY_ID['router-flux3-video'].usdByQuality!; const c = (n: number) => Math.round((n / 211) * 1e5) / 1e5;
  assert.equal(q['1440p'], c(120.69)); assert.equal(q['4K'], c(241.38)); assert.equal(HOSTED_BY_ID['router-flux3-video'].estimated, true, 'still labelled an estimate');
  const p = (r: string) => credits('router-flux3-video', r, 5); assert.ok(p('720p') < p('1080p') && p('1080p') < p('1440p') && p('1440p') < p('4K'), 'price rises with size');
  ok(`W6 FLUX 3 Video on Router: 1440p / 4K run (qhd / uhd), priced ${p('1440p')} / ${p('4K')} credits for 5 s (estimated)`);
}
// ---- W8: Wan 3.0 long prompts ----
{
  const long = 'x'.repeat(20001), fits = 'x'.repeat(20000);
  assert.equal(promptLimitIssue('wan-3.0', long, 'comfy-router:router-wan3'), null, 'not refused'); assert.match(String(promptCutNote('wan-3.0', long, 'comfy-router:router-wan3')), /first 20,000 characters.*20,001.*end will be cut/);
  assert.equal(promptCutNote('wan-3.0', fits, 'comfy-router:router-wan3'), null, 'no note when it fits');
  assert.match(String(promptLimitIssue('kling-v3', 'x'.repeat(2501))), /up to 2,500 characters/, 'a refusing cap still refuses'); assert.equal(promptCutNote('kling-v3', 'x'.repeat(2501)), null);
  const { getTool } = await import('../src/tools/registry.js'); const { adjustNotesFor } = await import('../src/routing/select.js'); const { routesFor } = await import('../src/routing/routes.js');
  const tool = getTool('h3-video')!; const r = routesFor('router-wan3', tool).find((x) => x.routeId === 'comfy-router:router-wan3')!; assert.ok(r, 'Wan 3.0 Router route');
  assert.match(adjustNotesFor(tool, r, { prompt: long, mode: 't2v' })[0] ?? '', /end will be cut/); assert.deepEqual(adjustNotesFor(tool, r, { prompt: 'short', mode: 't2v' }), []);
  ok('W8 Wan 3.0: 20,001 characters run with a "the end will be cut" note on quote and job; Kling’s refusing cap unchanged');
}
// ---- Upscale: a size that would not enlarge the clip moves up, and the note reaches the quote / job notes ----
{
  const { vupSizing } = await import('../src/shared/videoUpscale.js'); const { getTool } = await import('../src/tools/registry.js'); const { adjustNotesFor } = await import('../src/routing/select.js'); const { routesFor } = await import('../src/routing/routes.js');
  const i = vupSizing('comfy-video-esrgan', { types: ['precise'], duration: 5 }, { maxOutput: '1080p', width: 1920, height: 1080 }); assert.equal(i.maxOutput, '1440p');
  const tool = getTool('upscale')!; const r = routesFor('comfy-video-esrgan', tool)[0]; assert.ok(r, 'a Real-ESRGAN route');
  assert.deepEqual(adjustNotesFor(tool, r, i), [i.adjustNote]); assert.match(i.adjustNote, /upscaled to 1440p/);
  ok('Upscale: a 1080p clip at 1080p runs at 1440p, and the note is one of the route\u2019s adjust notes (quote and job)');
}
console.log('ALL OK wrong-blocks-caps');
process.exit(0);
