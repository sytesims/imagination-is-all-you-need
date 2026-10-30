// Comfy Router video / audio bodies (Comfy audit batch 2, 2026-10-24). In process, fake fetch, fake key, no network, no spend.
//  1. Seedance 2.0 and MiniMax H3 send reference videos and audio in the documented shape (content items video_url / audio_url, roles reference_video /
//     reference_audio; Seedance video = a public URL, audio = data:audio/<format>; H3 = data URIs), Seedance 9:21 and 4–15 s, H3 ratio in Reference to video.
//  2. Every limit (counts, formats, clip lengths, totals, frame rate, no audio alone, keyframes + references, Seedance video without a public link, the
//     100 MiB body cap) is refused by `block` with a plain message and by runRouter with ZERO calls (no estimate, no submit).
//  3. The reference-input price: H3 bills reference-video seconds at the output rate (rounded up, ≤ 15 s), Seedance (in + out) s at the video-input rate.
//  4. ElevenLabs v4: the picked voice and Expression (stability) in the body; a cloned voice refused.
//  5. Veo 3.1: a .webp first / last frame is converted to PNG; negativePrompt sent.
//  6. Generate Video form (h3-video parseInput): the same limits refused with 400 before any job exists.
// Sources: docs.comfy.org/development/comfy-router/models/{byteplus/dreamina-seedance-2-0-260128,minimax/minimax-h3,elevenlabs/eleven-v4,veo/veo-3-1-generate-001}/code,
// …/comfy-router/pricing, …/comfy-router/limitations, docs.comfy.org/built-in-nodes/{ByteDance2ReferenceNode,MinimaxHailuo03ReferenceNode}, …/tutorials/partner-nodes/pricing.
// Run: npx tsx test/router-av-refs.test.ts
import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'avrefs-')); const DATA = fs.mkdtempSync(path.join(D, 'data-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_PUBLIC_BASE_URL: '' };
Object.assign(process.env, NOKEYS, { OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_COMFY_ROUTER_URL: 'http://127.0.0.1:9' });
const ok = (m: string) => console.log('ok ' + m);
const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const at = (n: string) => path.join(DATA, n);
ff(['-f', 'lavfi', '-i', 'color=c=blue:s=512x512', '-frames:v', '1', at('ref.png')]);
fs.writeFileSync(at('frame.webp'), Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64')); // a 1×1 lossless WebP (ffmpeg builds often lack a WebP encoder)
const vid = (n: string, sec: number, fps = 24) => { ff(['-f', 'lavfi', '-i', `testsrc=size=320x180:rate=${fps}`, '-t', String(sec), '-pix_fmt', 'yuv420p', at(n)]); return at(n); };
const aud = (n: string, sec: number) => { ff(['-f', 'lavfi', '-i', `sine=frequency=440:duration=${sec}`, at(n)]); return at(n); };
const V3 = vid('v3.mp4', 3), V2 = vid('v2.mov', 2), V8 = vid('v8.mp4', 8), V9 = vid('v9.mp4', 9), V1 = vid('v1.mp4', 1), V20 = vid('v20.mp4', 3, 20), WEBM = (() => { ff(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24', '-t', '3', at('v.webm')]); return at('v.webm'); })();
const A3 = aud('a3.mp3', 3), A4 = aud('a4.wav', 4), A1 = aud('a1.mp3', 1), A16 = aud('a16.mp3', 16), FLAC = (() => { ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', at('a.flac')]); return at('a.flac'); })();
const PNG = at('ref.png');

const M = await import('../src/routing/routerModels.ts'); const RR = await import('../src/routing/routerRun.ts'); const { findRoute } = await import('../src/routing/routes.ts');
const { routeCredits } = await import('../src/routing/select.ts'); const { getTool } = await import('../src/tools/registry.ts'); const { priceOf } = await import('../src/shared/pricing.ts');
const { VIDEO_LIMITS, videoCapsBlock } = await import('../src/tools/h3/videoCaps.ts');
const SD = M.ROUTER_MODELS['router-seedance']; const H3 = M.ROUTER_MODELS['api-minimax-h3'];
const r2v = (o: Record<string, any> = {}) => ({ mode: 'r2v', types: ['r2v'], prompt: 'the dancer from Image 1 moves like Video 1, to Audio 1', duration: 5, resolution: '720p', aspect: 'auto', audio: true, refPaths: [PNG], ...o });
const withClips = (vids: string[], each: number[], auds: string[] = [], aeach: number[] = [], extra: Record<string, any> = {}) => r2v({ refVideoPaths: vids, refVideoSecondsEach: each, refVideoSeconds: each.reduce((a, b) => a + b, 0), refAudioPaths: auds, refAudioSecondsEach: aeach, ...extra });

// ---------------- 1. bodies ----------------
{ // Seedance 2.0: reference video only as a public URL; audio as data:audio/<format>
  const job = withClips([V3, V2], [3, 2], [A3, A4], [3, 4]);
  assert.match(SD.block!(job)!, /as a link, uploaded with your Comfy key/, 'no key and no public address → refused, plain message');
  await assert.rejects(SD.body(job, 0), /Comfy key/);
  process.env.OPENHIGGSFIELD_PUBLIC_BASE_URL = 'https://me.example.test/';
  assert.equal(SD.block!(job), null);
  const b: any = await SD.body(job, 0); const roles = b.content.map((c: any) => `${c.type}:${c.role ?? ''}`);
  assert.deepEqual(roles, ['text:', 'image_url:reference_image', 'video_url:reference_video', 'video_url:reference_video', 'audio_url:reference_audio', 'audio_url:reference_audio']);
  assert.deepEqual(b.content.filter((c: any) => c.type === 'video_url').map((c: any) => c.video_url.url), ['https://me.example.test/files/v3.mp4', 'https://me.example.test/files/v2.mov']);
  const au = b.content.filter((c: any) => c.type === 'audio_url').map((c: any) => c.audio_url.url as string);
  assert.match(au[0], /^data:audio\/mp3;base64,/); assert.match(au[1], /^data:audio\/wav;base64,/); assert.equal(Buffer.from(au[0].split(',')[1], 'base64').length, fs.statSync(A3).size);
  assert.equal(b.ratio, 'adaptive'); assert.equal(b.duration, 5); assert.equal(b.generate_audio, true);
  // 9:21 (Router ratio enum) and the 2.0 duration range 4–15
  assert.equal(((await SD.body({ mode: 't2v', types: ['t2v'], prompt: 'rain', aspect: '9:21', duration: 5, resolution: '720p' }, 0)) as any).ratio, '9:21');
  assert.ok(VIDEO_LIMITS['router-seedance'].aspects.includes('9:21')); assert.ok(VIDEO_LIMITS['router-seedance'].resolutions.includes('1080p'), '1080p kept (see videoCaps note)');
  assert.equal(((await SD.body({ mode: 't2v', types: ['t2v'], prompt: 'rain', duration: 2 }, 0)) as any).duration, 4); assert.equal(((await SD.body({ mode: 't2v', types: ['t2v'], prompt: 'rain', duration: 30 }, 0)) as any).duration, 15);
  process.env.OPENHIGGSFIELD_PUBLIC_BASE_URL = '';
  // audio + image (no video) needs no public link
  const ai: any = await SD.body(withClips([], [], [A3], [3]), 0); assert.deepEqual(ai.content.map((c: any) => c.role ?? c.type), ['text', 'reference_image', 'reference_audio']);
  ok('Seedance 2.0 body: reference_image + reference_video (public URL /files/<name>) + reference_audio (data:audio/mp3|wav); no public link → refused; 9:21; 4–15 s');
}
{ // MiniMax H3: data URIs for both; ratio as picked in Reference to video
  const job = withClips([V3, V2], [3, 2], [A3], [3], { aspect: '9:16' });
  assert.equal(H3.block!(job), null);
  const b: any = await H3.body(job, 0);
  assert.deepEqual(b.content.map((c: any) => `${c.type}:${c.role ?? ''}`), ['text:', 'image_url:reference_image', 'video_url:reference_video', 'video_url:reference_video', 'audio_url:reference_audio']);
  const vs = b.content.filter((c: any) => c.type === 'video_url').map((c: any) => c.video_url.url as string);
  assert.match(vs[0], /^data:video\/mp4;base64,/); assert.match(vs[1], /^data:video\/quicktime;base64,/); assert.equal(Buffer.from(vs[0].split(',')[1], 'base64').length, fs.statSync(V3).size);
  assert.match(b.content.at(-1).audio_url.url, /^data:audio\/mpeg;base64,/);
  assert.equal(b.ratio, '9:16', 'r2v keeps the picked ratio'); assert.equal(((await H3.body(withClips([V3], [3], [], [], { aspect: 'auto' }), 0)) as any).ratio, 'adaptive');
  assert.equal(((await H3.body({ mode: 'i2v', types: ['i2v'], prompt: 'x', imagePath: PNG, aspect: '9:16' }, 0)) as any).ratio, 'adaptive', 'ignored with a first frame');
  ok('MiniMax H3 body: reference_image + reference_video (data:video/mp4|quicktime) + reference_audio (data:audio/mpeg); ratio as picked in r2v, adaptive on Auto / with a frame');
}

// ---------------- 2. limits: refused by block AND by runRouter with zero calls ----------------
process.env.COMFY_API_KEY = 'test-not-a-real-key';
let calls = 0;
RR.setRouterFetch((async () => { calls++; return new Response(JSON.stringify({ detail: 'should not be called' }), { status: 500 }); }) as typeof fetch, async () => {});
const run = async (id: string, input: Record<string, any>) => { const r = findRoute(`comfy-router:${id}`)!; calls = 0;
  const job: any = { id: `t-${Math.random().toString(36).slice(2, 8)}`, toolId: 'h3-video', status: 'running', input, cost: 500, routing: { prices: { [r.routeId]: 500 } } };
  const err: any = await RR.runRouter(job, r, { n: 1 } as any, 5000).then(() => null, (e) => e); return { calls, reason: job.reasonCode as string, error: String(err?.message ?? '') }; };
const BAD: [string, string, Record<string, any>, RegExp][] = [
  ['api-minimax-h3', '4 videos', withClips([V3, V3, V3, V2], [3, 3, 3, 2]), /up to 3 reference videos; you added 4/],
  ['router-seedance', '4 audio clips', withClips([], [], [A3, A3, A3, A4], [3, 3, 3, 4]), /up to 3 reference audio clips; you added 4/],
  ['api-minimax-h3', 'webm video', withClips([WEBM], [3]), /reference videos as MP4 or MOV/],
  ['router-seedance', 'flac audio', withClips([], [], [FLAC], [3]), /reference audio as MP3 or WAV/],
  ['api-minimax-h3', 'video under 2 s', withClips([V1], [1]), /at least 2 s/],
  ['router-seedance', 'video under 1.8 s', withClips([V1], [1]), /at least 1.8 s/],
  ['api-minimax-h3', 'videos over 15 s in total', withClips([V8, V9], [8, 9]), /add up to 15 s; yours are 17 s/],
  ['router-seedance', 'videos over 15.1 s in total', withClips([V8, V9], [8, 9]), /add up to 15.1 s/],
  ['api-minimax-h3', 'audio over 15 s per clip', withClips([V3], [3], [A16], [16]), /at most 15 s/],
  ['router-seedance', 'audio under 1.8 s', withClips([], [], [A1], [1]), /at least 1.8 s/],
  ['api-minimax-h3', 'audio alone', withClips([], [], [A3], [3], { refPaths: [] }), /audio only next to a reference image or video/],
  ['router-seedance', 'audio alone', withClips([], [], [A3], [3], { refPaths: [] }), /audio only next to a reference image or video/],
  ['api-minimax-h3', '20 fps video', withClips([V20], [3], [], [], { refVideoFps: [20] }), /23\.976–60 frames per second/],
  ['api-minimax-h3', 'first frame + clips', { mode: 'i2v', types: ['i2v'], prompt: 'x', imagePath: PNG, refVideoPaths: [V3], refVideoSecondsEach: [3] }, /can't mix a first or last frame with reference videos or audio/],
  ['router-seedance', 'first + last frame + audio', { mode: 'flf', types: ['flf'], prompt: 'x', imagePath: PNG, lastFramePath: PNG, refAudioPaths: [A3], refAudioSecondsEach: [3] }, /can't mix a first or last frame/],
  ['api-minimax-h3', 'unreadable clip length', withClips([V3], []), /lengths couldn't be read/],
  ['router-veo', 'Veo with a reference video', withClips([V3], [3]), /jobs with reference videos or audio run on another route/],
];
for (const [id, what, input, re] of BAD) {
  const why = M.ROUTER_MODELS[id].block!(input); assert.match(String(why), re, `${id} ${what}: ${why}`);
  const r = await run(id, input); assert.equal(r.calls, 0, `${id} ${what}: no Router call`); assert.equal(r.reason, 'input_invalid', `${id} ${what}: ${JSON.stringify(r)}`); assert.match(r.error, re);
}
{ // the 100 MiB Router body cap (base64 4/3): a sparse ~80 MB clip next to an image is refused on H3 (inline), before any call
  const big = at('big.mp4'); fs.copyFileSync(V3, big); fs.truncateSync(big, 80 * 1024 * 1024);
  const j = withClips([big], [3]); assert.match(String(H3.block!(j)), /Comfy Router takes about 77\.9 MB of media per request/);
  assert.equal((await run('api-minimax-h3', j)).calls, 0); fs.rmSync(big);
}
{ // control: a valid job goes through block and reaches the Router (estimate call)
  const r = await run('api-minimax-h3', withClips([V3], [3], [A3], [3])); assert.ok(r.calls > 0, 'a valid job is sent');
}
RR.setRouterFetch(null); process.env.COMFY_API_KEY = '';
ok(`limits: ${BAD.length} bad jobs + the 100 MiB body cap refused by block and by runRouter with 0 calls (counts, formats, lengths, totals, fps, audio alone, keyframes + refs, no public link, Veo); a valid job is sent`);

// ---------------- 3. reference-input price (quote ≥ charge, rounded up) ----------------
{
  const hv = getTool('h3-video')!; const rt = (id: string) => findRoute(`comfy-router:${id}`)!;
  const CR = 211; const up = (comfyCredits: number) => Math.ceil(Math.round(comfyCredits / CR * 1e5) / 1e3 - 1e-9); // app credits from Comfy credits
  const c5 = (id: string, res: string, sec: number, extra: Record<string, any> = {}) => routeCredits(hv, rt(id), withClips([V3], [sec], [], [], { refVideoSeconds: sec, resolution: res, ...extra }))!;
  // H3: (output 5 s + reference video s rounded up) × the output rate
  assert.equal(c5('api-minimax-h3', '720p', 3), up(27.1557 * (5 + 3)));
  assert.equal(c5('api-minimax-h3', '720p', 7.3), up(27.1557 * (5 + 8)), '7.3 s billed as 8');
  assert.equal(c5('api-minimax-h3', '1080p', 15), up(39.2249 * (5 + 15)), '2K rate');
  assert.equal(routeCredits(hv, rt('api-minimax-h3'), r2v({ refAudioPaths: [A3], refAudioSecondsEach: [3] })), up(27.1557 * 5), 'reference audio is free');
  const p = priceOf({ toolId: 'h3-video', rates: {}, quality: '720p', durationSec: 5, provider: 'api-minimax-h3', refVideoSec: 22 }); assert.equal(p.credits, up(27.1557 * 20), 'capped at 15 s');
  assert.match(p.breakdown[0].label, /with 15 s reference video/);
  // Seedance: (in + out) s at the video-input rate (hostedPrices videoInput, largest frame per resolution)
  for (const [res, rate] of [['480p', 13.0271], ['720p', 28.1918], ['1080p', 69.356]] as const) assert.equal(c5('router-seedance', res, 5), up(rate * 10), `Seedance ${res}`);
  // quote ≥ what Comfy would bill (exact figures before our rounding)
  assert.ok(c5('api-minimax-h3', '720p', 7.3) / 100 >= 27.1557 * 12.3 / CR);
  ok(`price: H3 + reference-video seconds at the output rate (3 s → ${c5('api-minimax-h3', '720p', 3)}, 7.3 s billed as 8, ≤ 15 s, audio free); Seedance (in + out) s at the video-input rate; rounded up`);
}

// ---------------- 4. ElevenLabs v4 ----------------
{
  const E = M.ROUTER_MODELS['api-eleven-tts'];
  const b: any = await E.body({ mode: 'voice', prompt: 'Hello there.', voice: 'deep-calm', voiceNative: { stability: 0.2 }, voiceControls: { expression: 8 } }, 0);
  assert.deepEqual(b.inputs, [{ text: 'Hello there.', voice_id: 'pNInz6obpgDQGcFmaJgB' }]); assert.deepEqual(b.settings, { stability: 0.2 }); assert.equal(b.language_code, undefined);
  const d: any = await E.body({ prompt: 'Hi', voiceControls: { expression: 0 } }, 0); assert.equal(d.inputs[0].voice_id, '21m00Tcm4TlvDq8ikWAM'); assert.equal(d.settings.stability, 1);
  assert.equal(((await E.body({ prompt: 'Hi', voice: 'AbCdEfGhIjKlMnOpQrSt' }, 0)) as any).inputs[0].voice_id, 'AbCdEfGhIjKlMnOpQrSt', 'an ElevenLabs id passes as is');
  for (const [v, id] of Object.entries(M.ELEVEN_VOICES)) assert.equal(((await E.body({ prompt: 'x', voice: v }, 0)) as any).inputs[0].voice_id, id.id);
  assert.equal(((await E.body({ prompt: 'x' }, 0)) as any).settings.stability, 0.5);
  // voiceControls maps Expression 0–10 → stability 1.0–0.0 for this model
  const { parseVoiceControls } = await import('../src/tools/voice/voiceControls.ts'); const vc: any = parseVoiceControls({ expression: '7' }, 'api-eleven-tts', 0); assert.equal(vc.native.stability, 0.3);
  assert.match(String(E.block!({ voice: 'clone' })), /its own voices/); assert.equal(E.block!({ voice: 'narrator-crisp' }), null);
  ok('ElevenLabs v4 body: picked voice → its ElevenLabs id (6 library voices, raw ids pass), Expression → settings.stability (7 → 0.3), clone refused');
}

// ---------------- 5. Veo 3.1 ----------------
{
  const V = M.ROUTER_MODELS['router-veo'];
  const b: any = await V.body({ mode: 'flf', types: ['flf'], prompt: 'sunrise', imagePath: at('frame.webp'), lastFramePath: PNG, duration: 8, negativePrompt: ' blurry, text ' }, 0);
  const img = b.instances[0].image; assert.equal(img.mimeType, 'image/png'); assert.equal(Buffer.from(img.bytesBase64Encoded, 'base64').subarray(1, 4).toString(), 'PNG', 'webp converted to real PNG bytes');
  assert.equal(b.instances[0].lastFrame.mimeType, 'image/png'); assert.equal(b.parameters.negativePrompt, 'blurry, text');
  const j: any = await V.body({ mode: 'i2v', types: ['i2v'], prompt: 'x', imagePath: at('frame.webp'), duration: 4 }, 0); assert.equal(j.parameters.negativePrompt, undefined);
  const lastWebp: any = await V.body({ mode: 'flf', types: ['flf'], prompt: 'x', imagePath: PNG, lastFramePath: at('frame.webp') }, 0); assert.equal(lastWebp.instances[0].lastFrame.mimeType, 'image/png');
  ok('Veo 3.1 body: .webp first / last frame → PNG (image/png bytes), negativePrompt sent when given');
  // 2026-10-25: 1080p is 8 s only on Veo (snapped in the body too); MiniMax H3 never sends under 5 s; Kling 1080p (shown as Pro) = mode pro
  for (const d of [4, 6, 8]) { const v: any = await V.body({ mode: 't2v', types: ['t2v'], prompt: 'x', duration: d, resolution: '1080p' }, 0); assert.equal(v.parameters.durationSeconds, 8); assert.equal(v.parameters.resolution, '1080p'); }
  const v720: any = await V.body({ mode: 't2v', types: ['t2v'], prompt: 'x', duration: 4, resolution: '720p' }, 0); assert.equal(v720.parameters.durationSeconds, 4);
  const vAud: any = await V.body({ mode: 't2v', types: ['t2v'], prompt: 'x', duration: 8, resolution: '720p' }, 0); assert.equal(vAud.parameters.generateAudio, false);
  for (const [d, want] of [[3, 4], [4, 4], [5, 5], [15, 15], [20, 15]]) { const h: any = await H3.body({ mode: 't2v', types: ['t2v'], prompt: 'x', duration: d, resolution: '768p' }, 0); assert.equal(h.duration, want, `H3 ${d}s`); }
  const K = M.ROUTER_MODELS['router-kling']; assert.equal((await K.body({ mode: 't2v', prompt: 'x', duration: 5, resolution: '1080p' }, 0) as any).mode, 'pro'); assert.equal((await K.body({ mode: 't2v', prompt: 'x', duration: 5, resolution: '720p' }, 0) as any).mode, 'std');
  assert.equal((await K.body({ mode: 't2v', prompt: 'x', duration: 5, resolution: '720p' }, 0) as any).aspect_ratio, '16:9'); // Kling 3.0 Omni (2026-10-25): text keeps the aspect
  ok('Veo 1080p → 8 s (720p keeps 4 s, sound off unless asked); MiniMax H3 5–15 s; Kling 1080p / 720p → pro / std');
}

// ---------------- 6. the form refuses the same limits (h3-video parseInput, 400, no job) ----------------
{
  const hv: any = getTool('h3-video')!; const name = (p: string) => path.basename(p);
  const parse = (provider: string, files: Record<string, string[]>, fields: Record<string, string> = {}) => hv.parseInput({ provider, types: '["r2v"]', prompt: 'move like Video 1', duration: '5', rights: '1', ...fields }, { image: [name(PNG)], ...files });
  const cases: [string, Record<string, string[]>, RegExp, Record<string, string>?][] = [
    ['api-minimax-h3', { refVideos: [name(WEBM)] }, /MP4 or MOV/],
    ['router-seedance', { refAudios: [name(FLAC)] }, /MP3 or WAV/],
    ['api-minimax-h3', { refVideos: [name(V1)] }, /at least 2 s/],
    ['api-minimax-h3', { refVideos: [name(V20)] }, /23\.976–60 frames per second/],
    ['router-seedance', { refAudios: [name(A1)] }, /at least 1\.8 s/],
    ['api-minimax-h3', { refAudios: [name(A16)] }, /at most 15 s/],
    ['api-minimax-h3', { refVideos: [name(V8), name(V9)] }, /allows 15 s in total/],
  ];
  for (const [prov, files, re] of cases) { const r = await parse(prov, files); assert.ok('error' in r, `${prov} ${JSON.stringify(files)} → 400`); assert.match(r.error, re); }
  const good = await parse('api-minimax-h3', { refVideos: [name(V3)], refAudios: [name(A3)] }); assert.ok(!('error' in good), JSON.stringify(good));
  assert.deepEqual(good.refVideoSecondsEach, [3]); assert.deepEqual(good.refAudioSecondsEach, [3]); assert.equal(good.refVideoFps[0], 24);
  assert.equal(H3.block!(good), null, 'a parsed job passes the route check');
  // caps the Video bar reads (/api/tools app.videoLimits)
  const caps: any = videoCapsBlock(VIDEO_LIMITS['api-minimax-h3']); assert.deepEqual(caps.refMax, { image: 9, video: 3, audio: 3 }); assert.deepEqual(caps.refFormats, { video: ['mp4', 'mov'], audio: ['mp3', 'wav'] });
  assert.deepEqual(caps.refAudioSeconds, { minEach: 2, maxEach: 15, maxTotal: 15 }); assert.equal(caps.audioNeedsVisualRef, true);
  ok('form: formats, clip lengths, totals and frame rate refused with 400 on Seedance / H3; a valid upload carries the probed lengths and passes the route check; caps expose the limits');
}
console.log('ALL OK router-av-refs');
process.exit(0);
