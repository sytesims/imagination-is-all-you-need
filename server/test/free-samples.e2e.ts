// Free samples (fresh install, 2026-11-06): routing/select.ts freeSamples + routing/sampleRun.ts + shared/sampleMatch.ts.
// 1 the matcher: a prompt gets the shipped example that fits, count n gives n different files, no match still gives one;
// 2 a real-backend server with NOTHING set up: health says freeSamples, the quote is a $0 labelled sample, Generate makes one from the
//   shipped examples (image matched to the prompt, count 4, video, audio), it is never charged (cost 0, Spend counts $0) and says so;
// 3 a fake Comfy key: no samples (the quote needs no sample; nothing is submitted); 4 only a fal key: no samples either.
// 5 View workflow on seeded examples ships its real graph (README tour step 3: Mossbun Layout to Render).
// Run: npx tsx test/free-samples.e2e.ts   (own servers on testPort 9641-9643, temp data dirs, fake keys only, no network, no ComfyUI)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createHash } from 'node:crypto';
import { matchSamples, SAMPLE_CANDIDATES } from '../src/shared/sampleMatch.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const ok = (m: string) => console.log('ok ' + m);
const KEYS = ['COMFY_API_KEY', 'COMFY_BASE_URL', 'OPENHIGGSFIELD_FAL_KEY', 'FAL_KEY', 'OPENHIGGSFIELD_REPLICATE_API_TOKEN', 'REPLICATE_API_TOKEN', 'OPENHIGGSFIELD_BFL_API_KEY', 'OPENHIGGSFIELD_OPENAI_API_KEY',
  'OPENHIGGSFIELD_GEMINI_API_KEY', 'OPENHIGGSFIELD_MINIMAX_API_KEY', 'OPENHIGGSFIELD_LTX_API_KEY', 'OPENHIGGSFIELD_ARK_API_KEY', 'OPENHIGGSFIELD_DASHSCOPE_API_KEY', 'OPENHIGGSFIELD_LUMA_API_KEY', 'OPENHIGGSFIELD_HF_TOKEN', 'HF_TOKEN',
  'OPENHIGGSFIELD_LOCAL_AVAILABLE', 'OPENHIGGSFIELD_USE_LOCAL', 'OPENHIGGSFIELD_MOCK_KEYS', 'OPENHIGGSFIELD_ROUTING_LIVE', 'OPENHIGGSFIELD_FREE_SAMPLES', 'OPENHIGGSFIELD_BILLING_MODE'];
const NOKEYS = Object.fromEntries(KEYS.map((k) => [k, '']));
const procs: ChildProcess[] = []; const dirs: string[] = [];
function boot(port: number, extra: Record<string, string> = {}) {
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'freesamples-')); dirs.push(D); fs.writeFileSync(path.join(D, 'env'), '');
  const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, PORT: String(port), HOST: '127.0.0.1', OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env'),
    OPENHIGGSFIELD_BACKEND: 'comfy', OPENHIGGSFIELD_COMFY_DETECT_URLS: 'http://127.0.0.1:9', OPENHIGGSFIELD_MOCK_DELAY_MS: '200', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), ...extra } });
  procs.push(p); return `http://127.0.0.1:${port}`;
}
const up = async (B: string) => { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error('server did not start'); };
const get = async (B: string, u: string) => (await (await fetch(B + u)).json()) as any;
const submit = async (B: string, toolId: string, form: Record<string, string>, file?: { field: string; path: string }) => { const fd = new FormData(); for (const [k, v] of Object.entries(form)) fd.append(k, v);
  if (file) fd.append(file.field, new Blob([fs.readFileSync(file.path)], { type: file.path.endsWith('.png') ? 'image/png' : 'image/jpeg' }), path.basename(file.path));
  const r = await fetch(`${B}/api/tools/${toolId}/jobs`, { method: 'POST', body: fd }); return { status: r.status, j: (await r.json()) as any }; };
const done = async (B: string, id: string) => { for (let i = 0; i < 120; i++) { const j = await get(B, `/api/jobs/${id}`); if (['done', 'failed', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 250)); } throw new Error(`job ${id} did not finish`); };
const sha = (f: string) => createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const PUB = path.resolve(ROOT, '../web/public');
const PHOTO = path.join(PUB, 'examples', fs.readdirSync(path.join(PUB, 'examples')).find((f) => /\.(png|jpe?g)$/i.test(f))!);

try {
  // ---- 1. the matcher ----
  const whale = matchSamples('A glass whale floating over desert dunes at golden hour', 'image');
  assert.match(whale[0].title, /whale/i, 'the glass whale prompt gets a whale example'); assert.ok(whale[0].url.startsWith('/'));
  const four = matchSamples('a whale', 'image', 4); assert.equal(new Set(four.map((c) => c.url)).size, 4, 'count 4: four different files');
  assert.equal(matchSamples('zzqx unmatched words', 'image').length, 1, 'no match still gives a sample');
  assert.deepEqual(matchSamples('a fox', 'video'), matchSamples('a fox', 'video'), 'same prompt, same pick');
  for (const k of ['image', 'video', 'audio'] as const) assert.ok(SAMPLE_CANDIDATES.some((c) => c.kind === k), `${k} examples ship`);
  for (const c of SAMPLE_CANDIDATES) assert.ok(fs.existsSync(path.join(PUB, c.url)), `${c.url} ships`);
  ok(`1. matcher: ${SAMPLE_CANDIDATES.length} shipped examples; "glass whale" → ${whale[0].title}; count 4 = 4 files; a no-match prompt still gets one`);

  const F = boot(testPort(9641)), K = boot(testPort(9642), { COMFY_API_KEY: 'fake-test-key-never-sent' }), L = boot(testPort(9643), { OPENHIGGSFIELD_FAL_KEY: 'fake-fal-key-never-sent' });
  await up(F); await up(K); await up(L);

  // ---- 2. nothing set up: free samples ----
  const h = await get(F, '/api/health'); assert.equal(h.backend, 'comfy'); assert.equal(h.freeSamples, true, 'health: free samples on');
  const q = await get(F, `/api/tools/create-image/price?prompt=${encodeURIComponent('a glass whale over dunes')}`);
  assert.equal(q.demo, true); assert.equal(q.freeSample, true); assert.equal(q.credits ?? 0, 0, 'quote: $0');
  assert.match(String(q.priceLine), /^\$0 · sample( · List price ≈ \$\d)?/, 'price line: $0 · sample · List price'); assert.match(String(q.sampleNote), /A sample from our examples\. Add a key or set up your computer/);
  const s = await submit(F, 'create-image', { types: 'generate', prompt: 'A glass whale floating over desert dunes at golden hour', quotedRouteId: q.routeId ?? '', quotedCredits: '0' });
  assert.equal(s.status, 200, JSON.stringify(s.j).slice(0, 300)); const j = await done(F, s.j.id);
  assert.equal(j.status, 'done', String(j.error)); assert.equal(j.isSample, true); assert.match(String(j.sampleReason), /A sample from our examples/); assert.equal(Number(j.cost) || 0, 0, 'never charged');
  const out = path.join(dirs[0], path.basename(j.outputs[0].url)); const pick = matchSamples('A glass whale floating over desert dunes at golden hour', 'image')[0];
  assert.ok(fs.existsSync(out), 'the sample file is saved');
  const sp = await get(F, '/api/spend?limit=50'); const row = sp.items.find((r: any) => r.jobId === j.id);
  assert.ok(!row || (row.countedUsd === 0), 'Spend counts the sample as $0');
  ok(`2a. create-image: quote "${q.priceLine}", job ${j.id} done as a sample (${pick.title}), cost 0, Spend $0`);
  const s4 = await submit(F, 'create-image', { types: 'generate', prompt: 'a whale', n: '4' }); assert.equal(s4.status, 200, JSON.stringify(s4.j).slice(0, 300)); const j4 = await done(F, s4.j.id);
  assert.equal(j4.status, 'done'); assert.equal(j4.outputs.length, 4, 'count 4: four samples');
  assert.equal(new Set(j4.outputs.map((o: any) => sha(path.join(dirs[0], path.basename(o.url))))).size, 4, 'four different pictures');
  ok('2b. count 4: four different sample pictures');
  for (const [tool, form] of [['h3-video', { types: 't2v', prompt: 'a fox in a meadow', duration: '5' }], ['audio', { types: 'music', prompt: 'a music box lullaby', mode: 'music', duration: '10' }], ['three-d', { prompt: 'a toy robot' }]] as const) {
    const qq = await get(F, `/api/tools/${tool}/price?${new URLSearchParams(form)}`); assert.equal(qq.demo, true, `${tool}: sample quote`);
    const r = await submit(F, tool, form as Record<string, string>, tool === 'three-d' ? { field: 'image', path: PHOTO } : undefined); assert.equal(r.status, 200, `${tool}: ${JSON.stringify(r.j).slice(0, 300)}`);
    const jj = await done(F, r.j.id); assert.equal(jj.status, 'done', `${tool}: ${jj.error}`); assert.equal(jj.isSample, true); assert.equal(Number(jj.cost) || 0, 0, `${tool}: never charged`);
    ok(`2c. ${tool}: sample done, $0`);
  }

  // ---- 3. a Comfy key: no samples (routing only, nothing submitted) ----
  assert.equal((await get(K, '/api/health')).freeSamples, false); const qk = await get(K, '/api/tools/create-image/price?prompt=a%20fox');
  assert.ok(!qk.demo && !qk.freeSample, 'a key: real routing, no sample'); assert.ok(!/sample/i.test(String(qk.priceLine)), String(qk.priceLine));
  ok(`3. a Comfy key: no sample ("${qk.priceLine}")`);
  // ---- 4. only a fal key: no samples either ----
  assert.equal((await get(L, '/api/health')).freeSamples, false); const ql = await get(L, '/api/tools/create-image/price?prompt=a%20fox'); assert.ok(!ql.freeSample, 'any key turns samples off');
  ok('4. only a fal key: no free samples');

  // ---- 5. View workflow on seeded examples ----
  const id = (k: string) => createHash('sha1').update(`openhiggsfield-featured:${k}`).digest('hex').slice(0, 8);
  for (const k of ['mossbun-mockup-film', 'ltx-mockup-film', 'presenter-talk', 'h3-koi-take', 'ltx-pro-whale-glide', 'h3-char-swap', 'sc-0f1a0117', 'ltx-village-loop']) {
    const w = await get(F, `/api/jobs/${id(k)}/workflow`); assert.equal(w.available, true, `${k}: ${w.reason}`); assert.equal(w.source, 'submitted'); assert.match(w.headline, /this example ran/);
    const g = await (await fetch(`${F}${w.passes[0].url}`)).text(); assert.ok(!/core\/ASSET|blake3|\/Users\//.test(g), `${k}: no account asset ids or paths`); }
  const st = await get(F, `/api/jobs/${id('ltx-street-take')}/workflow`); assert.equal(st.available, false); assert.match(st.reason, /wasn’t kept/);
  ok('5. View workflow: the shipped example graphs open (README step 3 included); ltx-street-take says its file wasn’t kept');
} finally {
  for (const p of procs) { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } }
  await new Promise((r) => setTimeout(r, 800)); for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
}
