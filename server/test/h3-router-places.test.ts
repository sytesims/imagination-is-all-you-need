// MiniMax H3 on Comfy Router, the free H3 fixes (2026-10-26, H3 map F1–F3 + Camera + CrossView). In process, mock backend, a FAKE Comfy key and a
// FAKE Router (setRouterFetch): no network, no spend.
//  1. route pick (shared routing/partPick.ts): MiniMax H3 on Create Video at the Comfy place skips the Comfy Cloud workflow (price not measured) for
//     the Router route that runs it, in every mode (text, image, first + last frame, references, 2K), with the Router price. No key / an explicit
//     route: unchanged.
//  2. Talking Photo on Router: body = prompt with "Image 1" / "Audio 1" + reference_image (portrait) + reference_audio (speech), no first/last frame,
//     no LoRA; billed for max(5, speech) s; speech over 15 s: the Router place trims it to 15 s and says so (every format, 2026-10-28); fal / Replicate refuse it.
//  3. Extend · via last frame: the exact last frame is the first_frame of a Router image-to-video body (+5 / +8 / +10 s), the clip comes back and
//     is joined onto the source (length = source + new − the repeated frame, sound kept); +8 s and clips under 4 s refused on the local / fal places.
//  4. Camera Moves: H3 Camera Motion runs on Router with the move in words (no LoRA trigger), Slow / Aggressive as adverbs.
//  5. CrossView: with the Comfy key set and no deployment, the message names the deployment, not a key.
// Run: npx tsx test/h3-router-places.test.ts
import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '0'; // these checks cover the held state (cloud runs before a measured price are allowed by default since 2026-10-27)
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'h3router-')); const DATA = fs.mkdtempSync(path.join(D, 'data-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_COMFY_ROUTER_URL: 'https://router.test', COMFY_API_KEY: 'test-not-a-real-key',
  OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', COMFY_DEPLOY_URL: '', COMFY_RUNNER_URL: '', OPENHIGGSFIELD_MOCK_KEYS: '',
  OPENHIGGSFIELD_DEMO_AUTO: '0', OPENHIGGSFIELD_LOCAL_AVAILABLE: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_PUBLIC_BASE_URL: '' });
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const at = (n: string) => path.join(DATA, n);
const probeOf = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', f]).toString());
const durOf = (f: string) => Number(probeOf(f).format.duration); const hasAudio = (f: string) => probeOf(f).streams.some((s: any) => s.codec_type === 'audio');
ff(['-f', 'lavfi', '-i', 'testsrc2=size=1024x576', '-frames:v', '1', at('portrait.png')]);
ff(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=3', '-ar', '44100', at('speech3.wav')]);
ff(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=30', '-ar', '44100', at('speech30.wav')]);
ff(['-f', 'lavfi', '-i', 'testsrc2=size=854x480:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=3', '-t', '3', '-pix_fmt', 'yuv420p', '-shortest', at('clip3.mp4')]);
ff(['-f', 'lavfi', '-i', 'testsrc2=size=854x480:rate=30', '-t', '2', '-pix_fmt', 'yuv420p', at('clip2.mp4')]);

const { getTool } = await import('../src/tools/registry.js');
const { resolveModelRequest } = await import('../src/routing/modelRegistry.js');
const { preferRunnablePart } = await import('../src/routing/partPick.js');
const { resolveRoute, routeCredits, option } = await import('../src/routing/select.js');
const { findRoute, routesFor } = await import('../src/routing/routes.js');
const { routeRequest } = await import('../src/routing/routeRequest.js');
const RR = await import('../src/routing/routerRun.js');

// ---------------- 1. route pick ----------------
{
  const tool = getTool('h3-video')!;
  const pick = (fields: Record<string, string>, runOn: string | null = 'comfy-cloud', route?: string) => preferRunnablePart(tool, resolveModelRequest(tool, { model: 'minimax-h3', runOn, route, types: [fields.mode], mode: fields.mode }), fields) as any;
  const planOf = (mr: any, input: Record<string, any>) => resolveRoute(tool, mr.provider, input, 1, { route: mr.route ?? undefined, runOn: mr.runOn && mr.runOn !== 'auto' ? mr.runOn : undefined, allowRoutes: mr.allowRoutes, modelKey: mr.modelKey }) as any;
  for (const [mode, extra, secs, credits] of [['t2v', {}, 5, 65], ['t2v', {}, 8, 103], ['i2v', { imagePath: at('portrait.png') }, 8, 103], ['flf', { imagePath: at('portrait.png'), lastFramePath: at('portrait.png') }, 8, 103], ['r2v', { refPaths: [at('portrait.png')] }, 8, 103], ['t2v', { resolution: '2K' }, 5, 93]] as const) {
    for (const ro of ['comfy-cloud', null]) {
      const fields = { mode, duration: String(secs), ...('resolution' in extra ? { resolution: extra.resolution } : { resolution: '768p' }) };
      const mr = pick(fields, ro); assert.equal(mr.provider, 'api-minimax-h3', `${mode} ${secs}s runOn=${ro}: the Router engine`);
      const pl = planOf(mr, { types: [mode], mode, duration: secs, resolution: fields.resolution, ...extra });
      assert.ok(!('error' in pl), `${mode}: plans (${pl.error ?? ''})`); assert.equal(pl.first.routeId, 'comfy-router:api-minimax-h3'); assert.equal(pl.first.available, true); assert.equal(pl.first.credits, credits, `${mode} ${secs}s ${fields.resolution}`);
    }
  }
  // an explicit route stays (the user asked for it by name); no Comfy key → nothing to switch to (the first engine keeps its own answer)
  assert.equal(pick({ mode: 't2v', duration: '5' }, null, 'comfy-cloud:cloud-h3-wf').provider, 'comfy-h3');
  process.env.COMFY_API_KEY = ''; assert.equal(pick({ mode: 't2v', duration: '5' }).provider, 'comfy-h3', 'no key: unchanged'); process.env.COMFY_API_KEY = 'test-not-a-real-key';
  // the workflow route itself still reports why it can't run (it is skipped, not hidden)
  const wf = option(tool, routesFor('comfy-h3', tool).find((r) => r.routeId === 'comfy-cloud:cloud-h3-wf')!, { types: ['t2v'], duration: 5 }); assert.equal(wf.available, false); assert.match(String(wf.reason), /Off until we can show you its exact price/);
  ok('route pick: MiniMax H3 at the Comfy place (and Auto) → comfy-router:api-minimax-h3 for t2v / i2v / flf / r2v / 2K, priced 65 / 103 / 93; explicit route and keyless kept');
}

// fake Router: estimate under the quote, one queued request, COMPLETED, the clip asset
const posted: any[] = []; let outClip: Buffer = Buffer.alloc(0);
const routerFake = (async (u: any, init: any = {}) => { const url = String(u); const j = (o: unknown, status = 200, h: Record<string, string> = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...h } });
  const base = 'https://router.test/v2/models/minimax/minimax-h3';
  if (url.endsWith('/estimate')) return j({ source: 'exact', amount: '0.60' });
  if (url.includes('/requests') && init.method === 'POST') { posted.push(JSON.parse(init.body)); return j({ request_id: 'r1', status: 'IN_QUEUE', status_url: `${base}/requests/r1/status`, response_url: `${base}/requests/r1`, cancel_url: `${base}/requests/r1/cancel` }, 201); }
  if (url.endsWith('/status')) return j({ status: 'COMPLETED' });
  if (url.endsWith('/requests/r1')) return j({ task: { status: 'succeeded', content: { url: 'https://assets.test/h3.mp4' } } }, 200, { 'x-comfy-credits-used': '137' });
  if (url === 'https://assets.test/h3.mp4') return new Response(outClip, { status: 200, headers: { 'content-type': 'video/mp4' } });
  return new Response('nope', { status: 404 }); }) as typeof fetch;
RR.setRouterFetch(routerFake, async () => {});

// ---------------- 2. Talking Photo on Router ----------------
{
  const tool = getTool('voice')!; const r = findRoute('comfy-router:comfy-h3-lipsync')!; assert.ok(r, 'route exists'); assert.equal(r.kind, 'comfy-router'); assert.ok(RR.routerLive(r), 'keyed route is live');
  assert.ok(routesFor('comfy-h3-lipsync', tool).some((x) => x.routeId === 'fal:minimax/h3/reference-to-video#lipsync'), 'fal place kept'); assert.ok(routesFor('comfy-h3-lipsync', tool).some((x) => x.routeId === 'replicate:minimax/h3#lipsync'), 'Replicate place kept');
  const input: any = await tool.parseInput({ types: JSON.stringify(['lipsync']), provider: 'comfy-h3-lipsync', prompt: 'Small nods, @image1 smiles at the end.' }, { image: ['portrait.png'], speech: ['speech3.wav'] });
  assert.ok(!('error' in input), input.error); assert.ok(Math.abs(input.speechSeconds - 3) < 0.1, 'speech length kept on the job');
  const job: any = { id: 'job_lip1', toolId: 'voice', provider: 'comfy-h3-lipsync', input, status: 'running', outputs: [] };
  const { body } = await routeRequest(job, r, 0) as any; const c = body.content as any[];
  const text = c.find((x) => x.type === 'text').text as string; assert.match(text, /^Image 1 speaks the words of Audio 1/); assert.ok(!text.includes('@image1') && !/<Picture|<Audio/.test(text), `Router grammar: ${text}`);
  assert.deepEqual(c.map((x) => x.role ?? 'text'), ['text', 'reference_image', 'reference_audio']); assert.match(c[1].image_url.url, /^data:image\/png;base64,/); assert.match(c[2].audio_url.url, /^data:audio\/wav;base64,/);
  assert.ok(!c.some((x) => x.role === 'first_frame' || x.role === 'last_frame'), 'no keyframes next to references'); assert.equal(body.duration, 5, '3 s speech → the 5 s minimum'); assert.equal(body.resolution, '768P'); assert.ok(!('lora' in body));
  assert.equal(routeCredits(tool, r, input), 65, 'billed for the 5 s clip'); assert.equal(routeCredits(tool, r, { ...input, speechSeconds: 8, duration: 8 }), 103);
  // the Router place is Auto's pick (Comfy first); 30 s of speech (WAV): runs on Router, trimmed to the first 15 s, with one note (W7, 2026-10-28)
  const pl = resolveRoute(tool, 'comfy-h3-lipsync', input) as any; assert.equal(pl.first?.routeId, 'comfy-router:comfy-h3-lipsync');
  const long: any = await tool.parseInput({ types: JSON.stringify(['lipsync']), provider: 'comfy-h3-lipsync' }, { image: ['portrait.png'], speech: ['speech30.wav'] });
  const pl2 = resolveRoute(tool, 'comfy-h3-lipsync', long) as any; assert.ok(!('error' in pl2), pl2.error); assert.equal(pl2.first?.routeId, 'comfy-router:comfy-h3-lipsync');
  const { adjustNotesById } = await import('../src/routing/select.js'); assert.deepEqual(adjustNotesById(tool, r.routeId, long), ['Speech longer than 15 s: only the first 15 s are used.']);
  assert.ok(long.warnings.includes('Speech longer than 15 s: only the first 15 s are used.'), 'the parser says the same words (shown once on the job)');
  const lb = (await routeRequest({ ...job, id: 'job_lip30', input: long }, r, 0) as any).body; assert.equal(lb.duration, 15, 'billed and made as 15 s');
  const sent = Buffer.from(String(lb.content.find((x: any) => x.role === 'reference_audio').audio_url.url).split(',')[1], 'base64'); fs.writeFileSync(at('sent.wav'), sent); assert.ok(Math.abs(durOf(at('sent.wav')) - 15) < 0.2, `speech sent is 15 s (got ${durOf(at('sent.wav'))})`);
  assert.deepEqual(adjustNotesById(tool, r.routeId, input), [], 'a short speech: no note');
  for (const id of ['fal:minimax/h3/reference-to-video#lipsync', 'replicate:minimax/h3#lipsync']) assert.match(String(findRoute(id)!.unavailableFor!(long)), /up to 15 s/);
  ok('Talking Photo on Router: "Image 1 … Audio 1" + reference_image + reference_audio (data URIs, no keyframes, no LoRA), 5 s minimum billed (65 / 103), Auto picks it, 30 s WAV speech trimmed to 15 s on Router with a note (fal / Replicate still refuse)');
}

// ---------------- 3. Extend · via last frame ----------------
{
  const tool = getTool('h3-extend')!; const r = findRoute('comfy-router:comfy-h3-extend')!; assert.ok(r, 'route exists'); assert.equal(r.label, 'H3 Extend · via last frame');
  const { extractFrame } = await import('../src/videoFrame.js');
  const input: any = await tool.parseInput({ provider: 'comfy-h3-extend', extendSeconds: '5', prompt: 'She keeps walking into the market.' }, { video: ['clip3.mp4'] });
  assert.ok(!('error' in input), input.error);
  const pl = resolveRoute(tool, 'comfy-h3-extend', input, 1, { allowRoutes: ['local:comfy-h3-extend', 'comfy-router:comfy-h3-extend'] }) as any; assert.equal(pl.first?.routeId, r.routeId, pl.error); assert.equal(pl.first.credits, 65);
  assert.equal(routeCredits(tool, r, { ...input, extendSeconds: 8, duration: 8 }), 103); assert.equal(routeCredits(tool, r, { ...input, extendSeconds: 10, duration: 10 }), 129);
  // the frame → i2v → join chain on the fake Router
  ff(['-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=550:duration=5', '-t', '5', '-pix_fmt', 'yuv420p', '-shortest', at('gen5.mp4')]); outClip = fs.readFileSync(at('gen5.mp4'));
  posted.length = 0; const job: any = { id: 'job_ext1', toolId: 'h3-extend', provider: 'comfy-h3-extend', input, status: 'running', outputs: [], routing: { prices: { [r.routeId]: 65 } }, cost: 65 };
  await RR.runRouter(job, r, { n: 1, routeId: r.routeId } as any, 60_000);
  assert.equal(job.status, 'done', job.error); assert.equal(posted.length, 1, 'one Router request');
  const b = posted[0]; assert.deepEqual(b.content.map((x: any) => x.role ?? 'text'), ['text', 'first_frame']); assert.equal(b.duration, 5); assert.equal(b.ratio, 'adaptive'); assert.match(b.content[0].text, /keeps walking/);
  const ref = at('expect-last.png'); assert.ok((await extractFrame(at('clip3.mp4'), ref, { kind: 'last' })).ok);
  assert.equal(b.content[1].image_url.url, `data:image/png;base64,${fs.readFileSync(ref).toString('base64')}`, 'the first frame IS the exact last frame of the clip');
  assert.equal(job.outputs.length, 1); assert.equal(job.outputs[0].label, '+5 s'); const res = at(path.basename(job.outputs[0].url));
  assert.ok(Math.abs(durOf(res) - (3 + 5 - 1 / 24)) < 0.15, `joined length ${durOf(res)}`); assert.ok(hasAudio(res), 'sound kept (source, then H3)');
  // +8 s on the classic places, a 2 s clip on fal / local, backward: refused with the reason; the Router place takes the 2 s clip
  const short: any = await tool.parseInput({ provider: 'comfy-h3-extend', extendSeconds: '5' }, { video: ['clip2.mp4'] }); assert.ok(!('error' in short), short.error);
  assert.match(String(findRoute('fal:minimax/h3-max/extend-video')!.unavailableFor!(short)), /4 s or more/); assert.equal(r.unavailableFor!(short), null);
  assert.match(String(findRoute('fal:minimax/h3-max/extend-video')!.unavailableFor!({ ...input, extendSeconds: 8 })), /adds 5 or 10 s/);
  const loc = routesFor('comfy-h3-extend', tool).find((x) => x.routeId === 'local:comfy-h3-extend')!; assert.match(String(loc.unavailableFor!({ ...input, extendSeconds: 8 })), /\+8 s runs on H3 Extend · via last frame/);
  assert.match(String(r.unavailableFor!({ ...input, direction: 'backward' })), /forward/);
  ok('Extend · via last frame: exact last frame → Router i2v first_frame (+5 s, 65 cr; +8 103; +10 129) → joined (3 + 5 s, sound kept); 2 s clip runs here, refused on fal; +8 s refused on local / fal');
}

// ---------------- 4. Camera Moves (prompt-directed) ----------------
{
  const tool = getTool('camera')!; const r = findRoute('comfy-router:comfy-h3-camera')!; assert.ok(r, 'route exists'); assert.match(r.label, /prompt-directed/);
  const input: any = { types: ['h3-orbit'], mode: 'camera', intensity: 'aggressive', duration: 5, prompt: 'Keep the statue still.', imagePath: at('portrait.png') };
  const job: any = { id: 'job_cam1', toolId: 'camera', provider: 'comfy-h3-camera', input, status: 'running', outputs: [] };
  const { body } = await routeRequest(job, r, 0) as any; const text = body.content[0].text as string;
  assert.match(text, /^Camera move: fast, aggressive orbit around the subject\. Keep the statue still\./); assert.ok(!/camera motion,/.test(text), 'no LoRA trigger'); assert.equal(body.content[1].role, 'first_frame');
  const slow = (await routeRequest({ ...job, input: { ...input, types: ['h3-push-in'], intensity: 'slow' } }, r, 0) as any).body.content[0].text; assert.match(slow, /^Camera move: slow, smooth push-in toward the subject/);
  assert.equal(routeCredits(tool, r, input), 65);
  // W4 (2026-10-28): a 3 s move is not refused: made and billed as 4 s (MiniMax H3's shortest on Router), with a note; 5 s needs no note
  const three = { ...input, duration: 3 }; assert.equal(r.unavailableFor!(three), null); assert.equal((await routeRequest({ ...job, input: three }, r, 0) as any).body.duration, 4);
  const c4 = routeCredits(tool, r, three)!; assert.ok(c4 > 0 && c4 < 65, `4 s billed below 5 s (${c4})`);
  const { adjustNotesById } = await import('../src/routing/select.js'); assert.match(adjustNotesById(tool, r.routeId, three)[0] ?? '', /3 s camera move is made \(and charged\) as 4 s/); assert.deepEqual(adjustNotesById(tool, r.routeId, input), []);
  assert.equal((resolveRoute(tool, 'comfy-h3-camera', three) as any).first?.routeId, r.routeId, '3 s runs on Router');
  const pl = resolveRoute(tool, 'comfy-h3-camera', input) as any; assert.equal(pl.first?.routeId, r.routeId, pl.error);
  ok('Camera Moves: H3 Camera Motion on Router, move in words (Slow / Aggressive adverbs, no LoRA trigger), 65 credits for 5 s, Auto picks it; 3 s → made as 4 s with a note');
}

// ---------------- 5. CrossView without a deployment ----------------
{
  const tool = getTool('reshoot')!; const pl = resolveRoute(tool, 'cloud-h3-crossview', { duration: 5, seconds: 5 }) as any;
  assert.ok('error' in pl); assert.equal(pl.error, 'New angle needs your own Comfy deployment (one-time setup in your Comfy account). Set it up in Connections → Your Comfy deployment. Nothing was charged.');
  assert.ok(!/key/i.test(pl.error), 'no key talk'); assert.equal(pl.setup?.connection, 'deploy'); assert.equal(pl.setup?.actionText, 'Set up your deployment');
  const o = pl.routes.find((x: any) => x.routeId === 'comfy-deploy:cloud-h3-crossview'); assert.match(o.reason, /^Needs your own Comfy deployment/);
  ok('CrossView: Comfy key set, no deployment → "New angle needs your own Comfy deployment …", setup opens Connections → Your Comfy deployment');
}
RR.setRouterFetch(null);
console.log('h3-router-places: all ok');
process.exit(0);
