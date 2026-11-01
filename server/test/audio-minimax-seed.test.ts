// Audio batch A (2026-10-27): MiniMax Music 3 as ONE open-weights card (Local + Comfy Cloud) and Seed Audio 1.0 Multilingual in Music and Sound effects.
// In process, mock backend, a FAKE Comfy key, a FAKE Comfy Cloud (setCloudFetch) and a FAKE Comfy Router (setRouterFetch): no network, no spend.
//  1. one MiniMax Music 3 card on Audio / Add soundtrack / Music Bed: key minimax-music-3, open weights, the community licence, places Local + Comfy Cloud
//     (cloud-minimax-music is a hidden twin alias); no 'minimax-music-3-open' row anywhere.
//  2. Comfy Cloud plan = the official template graph (workflows/cloud/audio-minimax-music3-api.json) with caption, lyrics ("[Instrumental]" when empty),
//     seed and max_duration (the picked length, or the clip's length for a video); quote = charge per song second; unmeasured price → held, nothing sent.
//  3. full Cloud run on the fake transport (measuring-run switch on): one submit whose workflow carries the caption / lyrics / length, the song downloaded.
//  4. Seed Audio on Router per mode: Music / Sound effects bodies at 44.1 kHz, speech at 24 kHz, the same text_prompt; response parsing (base64, URL,
//     code ≠ 0 refused); a Router failure keeps Comfy's words (providerError); the over-long prompt refused before sending.
// Run: npx tsx test/audio-minimax-seed.test.ts
import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'audioA-')); const DATA = fs.mkdtempSync(path.join(D, 'data-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_COMFY_ROUTER_URL: 'https://router.test', COMFY_API_KEY: 'test-not-a-real-key',
  OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_DEMO_AUTO: '0', OPENHIGGSFIELD_LOCAL_AVAILABLE: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0',
  OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD: '0' });
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const at = (n: string) => path.join(DATA, n);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=12', '-t', '12', '-pix_fmt', 'yuv420p', '-shortest', at('clip12.mp4')]);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', at('song.flac')]);

const { getTool } = await import('../src/tools/registry.js');
const { toolModels, modelRoutes } = await import('../src/routing/modelRegistry.js');
const { routesFor, findRoute, minimaxSongSeconds } = await import('../src/routing/routes.js');
const { routeCredits, option } = await import('../src/routing/select.js');
const { buildCloudPlan } = await import('../src/comfy/cloudWorkflows.js');
const { runCloudWorkflow, setCloudFetch } = await import('../src/routing/cloudRun.js');
const { routeRequest } = await import('../src/routing/routeRequest.js');
const RR = await import('../src/routing/routerRun.js');
const { ROUTER_MODELS, seedAudioRate } = await import('../src/routing/routerModels.js');
const { MODELS, ENGINE_MODEL } = await import('../src/shared/modelIds.js');
const { CATALOGUE } = await import('../src/shared/modelRank.js');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.js');
const { promptGrammarOf } = await import('../src/shared/promptGrammar.js');

// ---------------- 1. one MiniMax Music 3 card ----------------
{
  assert.ok(!MODELS['minimax-music-3-open'] && !CATALOGUE['minimax-music-3-open'] && !promptGrammarOf('minimax-music-3-open'), 'the old open-weights row is gone');
  const m = MODELS['minimax-music-3']; assert.equal(m.openWeights, true); assert.equal(m.license, 'minimax-music3-community'); assert.equal(m.name, 'MiniMax Music 3');
  assert.equal(ENGINE_MODEL['comfy-minimax-music3'], 'minimax-music-3'); assert.equal(ENGINE_MODEL['cloud-minimax-music'], 'minimax-music-3');
  for (const id of ['audio', 'soundtrack', 'app-music-bed']) {
    const tool = getTool(id)!; const mm = toolModels(tool).filter((x) => /minimax-music/.test(x.key)); assert.equal(mm.length, 1, `${id}: one MiniMax Music 3 card`);
    assert.equal(mm[0].primary, 'comfy-minimax-music3', `${id}: Local is the card's primary engine`);
    const rs = modelRoutes(tool, mm[0]).map((x) => x.route); assert.deepEqual(rs.map((r) => r.routeId), ['local:comfy-minimax-music3', 'comfy-cloud:cloud-minimax-music'], id);
    const cloud = rs[1]; assert.equal(cloud.label, 'Comfy Cloud'); assert.equal((cloud as any).heldUntilMeasured, true); assert.equal(cloud.twinProvider, 'cloud-minimax-music');
  }
  ok('one MiniMax Music 3 card (open weights, MiniMax-Music3 Community License) on Audio / Add soundtrack / Music Bed: Local + Comfy Cloud, no "(open weights)" duplicate');
}

// ---------------- 2. Comfy Cloud plan, price, hold ----------------
const audio = getTool('audio')!; const soundtrack = getTool('soundtrack')!;
const cloudOf = (tool: any) => routesFor('comfy-minimax-music3', tool).find((r) => r.routeId === 'comfy-cloud:cloud-minimax-music')!;
{
  const p = buildCloudPlan({ id: 'mm1', toolId: 'audio', provider: 'cloud-minimax-music', input: { mode: 'music', prompt: 'Indie pop, 110 BPM, warm female vocal', lyrics: '[Verse]\nMorning light', duration: 30, seed: 7 } });
  assert.equal(p.passes.length, 1); assert.equal(p.passes[0].workflow, 'cloud/audio-minimax-music3-api.json'); const g = p.passes[0].graph;
  assert.equal(g['5'].inputs.caption, 'Indie pop, 110 BPM, warm female vocal'); assert.equal(g['5'].inputs.lyrics, '[Verse]\nMorning light'); assert.equal(g['5'].inputs.max_duration, 30); assert.equal(g['4'].inputs.seed, 7);
  assert.equal(g['1'].inputs.unet_name, 'minimax_music3_dit_fp16.safetensors'); assert.equal(g['2'].inputs.type, 'minimax'); assert.equal(p.outKind, 'audio');
  const inst = buildCloudPlan({ id: 'mm2', toolId: 'audio', provider: 'cloud-minimax-music', input: { mode: 'music', prompt: 'Ambient piano', duration: 10 } });
  assert.equal(inst.passes[0].graph['5'].inputs.lyrics, '[Instrumental]', 'no lyrics → instrumental tag');
  const st = buildCloudPlan({ id: 'mm3', toolId: 'soundtrack', provider: 'cloud-minimax-music', input: { mode: 'music', prompt: 'Synthwave', videoPath: at('clip12.mp4'), duration: 12, outputDuration: 12 } });
  assert.equal(st.passes[0].graph['5'].inputs.max_duration, 30, 'Music for a video: a 12 s clip asks for the 30 s minimum song (cut mid-phrase otherwise)'); assert.equal(st.outKind, 'video'); assert.ok(st.muxOnto, 'muxed onto the clip');
  assert.equal(st.musicBed, 12, 'the song is trimmed back to the 12 s clip, faded and limited');
  const st45 = buildCloudPlan({ id: 'mm4', toolId: 'soundtrack', provider: 'cloud-minimax-music', input: { mode: 'music', prompt: 'Synthwave', videoPath: at('clip12.mp4'), duration: 30, outputDuration: 45 } });
  assert.equal(st45.passes[0].graph['5'].inputs.max_duration, 45, 'a clip over the minimum: its own length'); assert.equal(st45.musicBed, 45);
  const { bedFilter, bedFadeSeconds, songMinSeconds } = await import('../src/shared/audioLengths.js');
  assert.equal(songMinSeconds('cloud-minimax-music'), 30); assert.equal(songMinSeconds('comfy-yue2'), 30); assert.equal(songMinSeconds('comfy-acestep'), 0, 'ACE-Step: no minimum (it takes the clip length)');
  assert.deepEqual([bedFadeSeconds(10), bedFadeSeconds(30), bedFadeSeconds(2), bedFadeSeconds(1)], [0.8, 1, 0.5, 0.25], 'fade 0.5–1 s, a quarter of a very short clip');
  assert.match(bedFilter(10), /^atrim=0:10,asetpts=PTS-STARTPTS,afade=t=out:st=9\.2:d=0\.8,.*alimiter=limit=0\.841:.*level=0/);
  // quote = charge: the same seconds as the graph (priceInput), per song second
  const r = cloudOf(audio); const h = HOSTED_BY_ID['cloud-minimax-music']; assert.equal(h.unit, 'second'); assert.equal(h.priceUnmeasured, true);
  for (const s of [30, 60]) { assert.equal(minimaxSongSeconds({ duration: s }), s); assert.equal(routeCredits(audio, r, { mode: 'music', duration: s }), Math.ceil(h.usd! * s * 100 - 1e-9), `${s} s`); }
  assert.equal(minimaxSongSeconds({ duration: 10 }), 30, 'under the minimum: priced as the 30 s song the graph asks for');
  assert.equal(routeCredits(soundtrack, cloudOf(soundtrack), { mode: 'music', duration: 12, outputDuration: 12 }), Math.ceil(h.usd! * 30 * 100 - 1e-9), 'video under 30 s: priced on the 30 s song (= max_duration)');
  assert.equal(routeCredits(soundtrack, cloudOf(soundtrack), { mode: 'music', duration: 30, outputDuration: 45 }), Math.ceil(h.usd! * 45 * 100 - 1e-9), 'video over 30 s: priced on the clip length');
  for (const id of ['soundtrack', 'app-music-bed']) { const t = getTool(id)!; assert.equal(routeCredits(t, cloudOf(t), { mode: 'music', duration: 10, outputDuration: 10 }), Math.ceil(h.usd! * 30 * 100 - 1e-9), `${id}: quote = the graph's 30 s`); }
  assert.equal(minimaxSongSeconds({}), 60, 'no length → the graph default 60 s'); assert.equal(minimaxSongSeconds({ duration: 999 }), 360);
  // held until a measured run: with a key the route is unavailable with the reason; a run sends nothing
  const o = option(audio, r, { mode: 'music', duration: 10 }); assert.equal(o.available, false); assert.match(String(o.reason), /Off until we can show you its exact price/);
  const calls: string[] = []; setCloudFetch((async (u: any) => { calls.push(String(u)); return new Response('{}', { status: 500 }); }) as any, 1);
  const job: any = { id: 'held1', toolId: 'audio', provider: 'comfy-minimax-music3', input: { mode: 'music', prompt: 'x', duration: 10 }, outputs: [], warnings: [], status: 'running' };
  await assert.rejects(runCloudWorkflow(job, { ...r, envKey: 'COMFY_API_KEY' } as any, { n: 1 } as any), /Off until we can show you its exact price/); assert.equal(job.reasonCode, 'price_unmeasured'); assert.equal(calls.length, 0, 'nothing sent');
  ok(`Comfy Cloud plan = the official template (caption, lyrics / [Instrumental], seed, max_duration = length or clip); $${h.usd}/s of song (estimate); held until measured, nothing sent`);
}

// ---------------- 3. full Comfy Cloud run on the fake transport (measuring run) ----------------
{
  process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '1'; const song = fs.readFileSync(at('song.flac'));
  const calls: { url: string; method: string; headers: any; body?: any }[] = []; let polls = 0;
  setCloudFetch((async (u: any, init: any = {}) => { const url = String(u); calls.push({ url, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body });
    const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/api/v2/jobs') && init.method === 'POST') return j({ id: 'cj-mm', status: 'queued' }, 201);
    if (url.endsWith('/api/v2/jobs/cj-mm')) { polls++; return j(polls < 2 ? { id: 'cj-mm', status: 'running' } : { id: 'cj-mm', status: 'succeeded', outputs: [{ node_id: '10', name: 'song.flac', type: 'audio', content_type: 'audio/flac', id: 'o1', url: 'https://cc.test/api/v2/assets/o1/content' }] }); }
    if (url.endsWith('/api/v2/assets/o1/content')) return new Response(song, { status: 200, headers: { 'content-type': 'audio/flac' } });
    return j({ error: { code: 'not_found' } }, 404); }) as any, 1);
  const r = cloudOf(audio); const input = { mode: 'music', types: ['music'], prompt: 'Warm indie folk, 92 BPM', lyrics: '[Chorus]\nCarry me home', duration: 10, seed: 3 };
  const job: any = { id: 'mmrun', toolId: 'audio', provider: 'comfy-minimax-music3', input, outputs: [], warnings: [], status: 'running', stage: 'queued', progress: 0 };
  await runCloudWorkflow(job, { ...r, envKey: 'COMFY_API_KEY' } as any, { n: 1, routeId: r.routeId, status: 'running', charged: 0, refunded: 0 } as any);
  assert.equal(job.status, 'done', job.error); assert.equal(job.cloudJobId, 'cj-mm'); assert.ok(job.outputs.length >= 1, 'the song came back');
  const sub = calls.filter((c) => c.method === 'POST' && c.url.endsWith('/api/v2/jobs')); assert.equal(sub.length, 1, 'one submit');
  const wf = JSON.parse(sub[0].body).workflow; assert.equal(wf['5'].class_type, 'MiniMaxMusic3TextEncode'); assert.equal(wf['5'].inputs.caption, 'Warm indie folk, 92 BPM'); assert.equal(wf['5'].inputs.lyrics, '[Chorus]\nCarry me home');
  assert.equal(wf['5'].inputs.max_duration, 30, '10 s asked: raised to the model minimum'); assert.equal(wf['10'].class_type, 'SaveAudioAdvanced'); assert.ok(!Object.values<any>(wf).some((n) => /^ComfyCloud|Api$/.test(n.class_type)), 'core nodes only, no partner node');
  setCloudFetch(null); process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '0';
  ok('Comfy Cloud run (fake transport, measuring switch on): one submit with the template graph (caption, lyrics, 10 s raised to 30 s), core nodes only, the song downloaded');
}

// ---------------- 4. Seed Audio on Comfy Router: Music / Sound effects / Voice ----------------
{
  const SA = ROUTER_MODELS['api-seed-audio']; assert.equal(SA.id, 'byteplus/seed-audio-1.0-multilingual');
  const tools = { audio, soundtrack, voice: getTool('voice')! };
  for (const [id, mode] of [['audio', 'music'], ['audio', 'sfx'], ['soundtrack', 'music'], ['soundtrack', 'sfx'], ['audio', 'voice'], ['voice', 'voiceover']] as const)
    assert.ok((tools as any)[id].app.providerModes['api-seed-audio'].includes(mode), `${id}: Seed Audio in ${mode}`);
  assert.deepEqual(audio.app!.durationsByProvider['api-seed-audio'], [], 'no Length control: the model decides (up to 2 min)');
  for (const m of ['music', 'sfx']) {
    const b: any = await SA.body({ types: JSON.stringify([m]), prompt: 'Rain on a tin roof, distant thunder' }, 0);
    assert.deepEqual(b, { text_prompt: 'Rain on a tin roof, distant thunder', audio_config: { format: 'mp3', sample_rate: 44100 } }, m);
  }
  assert.equal((await SA.body({ mode: 'voice', prompt: 'Hello.' }, 0) as any).audio_config.sample_rate, 24000); assert.equal(seedAudioRate({ types: ['voiceover'] }), 24000);
  assert.match(String(SA.block!({ types: ['music'], prompt: 'x'.repeat(3001) })), /^Seed Audio takes prompts up to 3,000 characters; yours is 3,001/);
  assert.match(String(SA.block!({ types: ['voiceover'], prompt: 'x'.repeat(3001) })), /^Seed Audio reads scripts up to 3,000/);
  await assert.rejects(SA.body({ types: ['music'], prompt: '   ' }, 0), /needs a prompt/);
  assert.deepEqual(SA.outputs({ audio: 'QUJD', duration: 30 }), [{ b64: 'QUJD', mime: 'audio/mpeg' }]); assert.deepEqual(SA.outputs({ url: 'https://x.test/a.mp3' }), [{ url: 'https://x.test/a.mp3' }]);
  assert.deepEqual(SA.outputs({ code: 45000001, message: 'text risk' }), { refused: 'text risk' });
  // the real submit path: parseInput → routeRequest (the shared prompt rewrite) → the Router body
  const r = findRoute('comfy-router:api-seed-audio')!; const input: any = await audio.parseInput!({ types: JSON.stringify(['music']), provider: 'api-seed-audio', prompt: 'Upbeat chiptune loop, 140 BPM' } as any, {});
  assert.ok(!('error' in input), input.error); const { body } = await routeRequest({ id: 'sa0', toolId: 'audio', provider: 'api-seed-audio', input } as any, r, 0) as any;
  assert.equal(body.text_prompt, 'Upbeat chiptune loop, 140 BPM'); assert.equal(body.audio_config.sample_rate, 44100); assert.ok(!('model' in body) && !('lyrics' in body), 'Router fills model from the path; no lyrics field');
  assert.equal(routeCredits(audio, r, input), 43, 'Music on Seed Audio: quoted at the 120 s cap = $0.43'); assert.equal(routeCredits(audio, r, { ...input, types: ['sfx'], mode: 'sfx' }), 43);
  // the fake Router: one good run (base64 audio), then a provider failure that keeps Comfy's own words
  const mp3 = Buffer.from('ID3fake-mp3-bytes'); let fail = false; const posted: any[] = [];
  RR.setRouterFetch((async (u: any, init: any = {}) => { const url = String(u); const j = (o: unknown, s = 200, h: Record<string, string> = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', ...h } });
    const base = 'https://router.test/v2/models/byteplus/seed-audio-1.0-multilingual';
    if (url.endsWith('/estimate')) return j({ source: 'estimated', amount: '0.10', max_amount: '0.42' });
    if (url.includes('/requests') && init.method === 'POST') { posted.push(JSON.parse(init.body));
      if (fail) return j({ detail: 'audio generation failed', upstream_detail: 'BytePlus: prompt rejected by safety check' }, 502, { 'x-comfy-error-type': 'provider_error', 'x-comfy-upstream-status': '400' });
      return j({ request_id: 's1', status: 'IN_QUEUE', status_url: `${base}/requests/s1/status`, response_url: `${base}/requests/s1`, cancel_url: `${base}/requests/s1/cancel` }, 201); }
    if (url.endsWith('/status')) return j({ status: 'COMPLETED' });
    if (url.endsWith('/requests/s1')) return j({ audio: mp3.toString('base64'), duration: 31.5, original_duration: 31.5 }, 200, { 'x-comfy-credits-used': '23.76' });
    return new Response('nope', { status: 404 }); }) as any, async () => {});
  const job: any = { id: 'sa1', toolId: 'audio', provider: 'api-seed-audio', input, status: 'running', outputs: [], routing: { prices: { [r.routeId]: 43 } }, cost: 43 };
  await RR.runRouter(job, r, { n: 1, routeId: r.routeId } as any, 60_000);
  assert.equal(job.status, 'done', job.error); assert.equal(posted.length, 1); assert.deepEqual(posted[0], { text_prompt: 'Upbeat chiptune loop, 140 BPM', audio_config: { format: 'mp3', sample_rate: 44100 } });
  assert.equal(job.outputs.length, 1); assert.ok(job.outputs[0].url.endsWith('.mp3')); assert.deepEqual(fs.readFileSync(at(path.basename(job.outputs[0].url))), mp3); assert.ok(Math.abs(job.actualCost.usd - 23.76 / 211) < 1e-3, 'actual cost from Comfy');
  fail = true; const bad: any = { id: 'sa2', toolId: 'audio', provider: 'api-seed-audio', input, status: 'running', outputs: [], routing: { prices: { [r.routeId]: 43 } }, cost: 43 };
  await assert.rejects(RR.runRouter(bad, r, { n: 1, routeId: r.routeId } as any, 60_000), /Comfy said: .*prompt rejected by safety check/);
  assert.equal(bad.reasonCode, 'provider_error'); assert.equal(bad.providerError.model, 'byteplus/seed-audio-1.0-multilingual'); assert.match(bad.providerError.upstreamDetail, /safety check/); assert.equal(bad.providerError.upstreamStatus, 400);
  RR.setRouterFetch(null);
  ok('Seed Audio on Router: Music / Sound effects (44.1 kHz) and speech (24 kHz) bodies, prompt cap per mode, outputs (base64 / URL / refused), a real run on the fake Router (estimate under quote, $0.43 cap quote), provider_error keeps Comfy\'s words');
}
console.log('audio-minimax-seed: all checks passed');
process.exit(0);
