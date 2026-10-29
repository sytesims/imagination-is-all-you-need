// Stub e2e: starts stub-comfy + an isolated non-watch API with OPENHIGGSFIELD_BACKEND=comfy (native), submits every local
// tool/provider/mode, polls percent, downloads outputs. Graphs land in ../graph/captured for graph-assert.mjs.
// Usage: node run-e2e.mjs   → writes results.json; exit 1 on any failure.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { spawn, execFileSync } from 'node:child_process';
const HERE = path.dirname(new URL(import.meta.url).pathname); const ROOT = path.resolve(HERE, '../..'); const CAP = path.resolve(HERE, '../graph/captured');
const SP = process.env.STUB_PORT || '8288', AP = process.env.E2E_PORT || '8801', API = `http://127.0.0.1:${AP}`;
fs.rmSync(CAP, { recursive: true, force: true }); fs.mkdirSync(CAP, { recursive: true });
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ohf-e2e-')); const LOG = fs.openSync(path.join(HERE, 'api.log'), 'w');
const kids = [spawn('node', [path.join(HERE, 'stub-comfy.mjs'), SP], { stdio: 'ignore', detached: true }),
  spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.join(ROOT, 'server'), detached: true, stdio: ['ignore', LOG, LOG],
    env: { ...process.env, PORT: AP, OPENHIGGSFIELD_BACKEND: 'comfy', COMFY_BASE_URL: `http://127.0.0.1:${SP}`, OPENHIGGSFIELD_COMFY_API: 'native', OPENHIGGSFIELD_CAPTURE_GRAPHS: CAP, OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_LOCAL_FREE: '1', OPENHIGGSFIELD_CONCURRENCY: '2', OPENHIGGSFIELD_FREE_GENS: '0', OPENHIGGSFIELD_PY: 'python3', OPENHIGGSFIELD_VOICE_RUNNER: path.join(HERE, 'fake_runner.py') } })];
const stop = () => { for (const k of kids) try { process.kill(-k.pid, 'SIGTERM'); } catch {} };
process.on('exit', stop); process.on('SIGINT', () => process.exit(1));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0, up = false; i < 90 && !up; i++) { try { up = (await fetch(`${API}/api/health`)).ok && (await fetch(`http://127.0.0.1:${SP}/queue`)).ok; } catch {} if (!up) await wait(1000); }
// Media fixtures: QA_FIXTURES=<dir with hd.mp4, sharp.png, oj-ref.png>, else generated with ffmpeg into the temp data dir.
const Q = process.env.QA_FIXTURES || (() => { const d = path.join(DATA, 'fixtures'); fs.mkdirSync(d, { recursive: true }); const ff = (...a) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
  ff('-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24', '-f', 'lavfi', '-i', 'sine=d=6', '-t', '6', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', path.join(d, 'hd.mp4'));
  ff('-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=1', '-frames:v', '1', path.join(d, 'sharp.png'));
  fs.copyFileSync(path.join(ROOT, 'server/test/fixtures/ref-512.png'), path.join(d, 'oj-ref.png')); return d; })(); const B = (f, t) => new Blob([fs.readFileSync(f)], { type: t });
const VID = () => B(path.join(HERE, 'clip12.mp4'), 'video/mp4'), SHORT = () => B(`${Q}/hd.mp4`, 'video/mp4'), IMG = () => B(`${Q}/sharp.png`, 'image/png'), REF = () => B(`${Q}/oj-ref.png`, 'image/png'), MASK = () => B(path.join(HERE, 'mask.png'), 'image/png'), WAV = () => B(path.join(HERE, 'voice.wav'), 'audio/wav');
const C = (tool, provider, fields = {}, files = {}, label = '') => ({ tool, provider, fields, files, label: label || `${tool} · ${provider}${fields.types ? ' · ' + fields.types : ''}` });
const T = (x) => JSON.stringify([x].flat());
const IMGP = ['comfy-flux3-klein', 'comfy-qwen21', 'comfy-qwen-image', 'comfy-zimage-turbo', 'comfy-zimage', 'comfy-klein4b', 'comfy-flux2dev'];
const CASES = [
  C('object-swap', 'comfy-open', { preset: 'outfit', point: '0.4,0.5,0' }, { video: SHORT, refs: [REF] }),
  C('object-swap', 'comfy-open', { preset: 'outfit', resolution: '480p' }, { video: VID, refs: Array(10).fill(REF) }, 'object-swap · 10 refs → 2 groups · 12 s clip'),
  C('motion-transfer', 'comfy-open', {}, { video: SHORT, refs: [REF] }),
  C('restyle', 'comfy-open', { preset: 'anime-cel' }, { video: VID }, 'restyle · 12 s → chunked passes'),
  C('reshoot', 'comfy-open', { angles: JSON.stringify([{ start: 1, end: 3, angle: 'left side' }, { start: 6, end: 8, angle: 'close-up' }]) }, { video: VID }),
  C('reshoot', 'comfy-funcamera', { angles: JSON.stringify([{ start: 0, end: 2, angle: 'low angle' }]) }, { video: SHORT }),
  C('camera', 'comfy-open', { types: T('push-in'), duration: 5 }, { image: IMG }),
  C('camera', 'comfy-open', { types: T(['handheld']), duration: 5 }, { image: IMG }, 'camera · handheld (2 chained segments)'),
  C('camera', 'comfy-open', { types: T('ltx-dolly-in'), duration: 5 }, { image: IMG }),
  C('photo-fx', 'comfy-open', { types: T('float') }, { image: IMG }),
  ...['precise', 'creative', 'smooth60'].map((m) => C('upscale', 'comfy-open', { types: T(m) }, { video: SHORT })),
  ...IMGP.map((p) => C('create-image', p, { types: T('generate'), prompt: 'a red bicycle on a beach', resolution: '720p' })),
  ...['comfy-flux3-klein', 'comfy-qwen21', 'comfy-qwen-image', 'comfy-klein4b', 'comfy-flux2dev'].map((p) => C('create-image', p, { types: T('edit'), prompt: 'make it night' }, { image: IMG })),
  C('create-image', 'comfy-qwen-image', { types: T('inpaint'), prompt: 'add a hat' }, { image: IMG, mask: MASK }),
  C('create-image', 'comfy-flux3-klein', { types: T('inpaint'), prompt: 'add a hat' }, { image: IMG, mask: MASK }),
  C('h3-video', 'comfy-h3', { types: T('t2v'), prompt: 'a paper boat drifting', duration: 6 }),
  C('h3-video', 'comfy-h3', { types: T('i2v'), prompt: 'the camera pushes in', duration: 6 }, { image: IMG }),
  C('h3-video', 'comfy-h3', { types: T('r2v'), prompt: 'use the reference', duration: 6 }, { image: IMG }),
  C('audio', 'comfy-acestep', { types: T('music'), prompt: 'lofi beat', duration: 10 }),
  C('audio', 'comfy-stable-audio', { types: T('sfx'), prompt: 'door slam', duration: 10 }),
  C('soundtrack', 'comfy-acestep', { types: T('music'), prompt: 'upbeat' }, { video: SHORT }),
  C('soundtrack', 'comfy-stable-audio', { types: T('sfx'), prompt: 'city ambience' }, { video: SHORT }),
  C('soundtrack', 'comfy-mmaudio', { types: T('v2s'), prompt: 'footsteps', mix: 'blend' }, { video: SHORT }),
  C('voice', 'comfy-chatterbox', { types: T('voiceover'), prompt: 'Welcome to the show.', voice: 'energetic-host' }, { video: SHORT }),
  C('audio', 'comfy-chatterbox', { types: T('voice'), prompt: 'Good morning, everyone.' }),
  C('audio', 'comfy-drama3', { types: T('voice'), prompt: '[whispering] Good morning.' }),
  C('voice', 'comfy-chatterbox', { types: T('voiceover'), prompt: 'Welcome back.', voice: 'clone' }, { video: SHORT, voiceAudio: WAV }, 'voice · comfy-chatterbox · voiceover · clone'),
  C('voice', 'comfy-drama3', { types: T('voiceover'), prompt: '[excited] Welcome to the show.' }, { video: SHORT }),
  C('voice', 'comfy-drama3', { types: T('voiceover'), prompt: 'Welcome back.', voice: 'clone' }, { video: SHORT, voiceAudio: WAV }, 'voice · comfy-drama3 · voiceover · clone'),
  C('voice', 'comfy-f5tts', { types: T('voiceover'), prompt: 'Welcome to the show.' }, { video: SHORT }),
  C('voice', 'comfy-chatterbox-vc', { types: T('change-voice'), voice: 'deep-calm' }, { video: SHORT }),
  C('voice', 'comfy-chatterbox-vc', { types: T('change-voice'), voice: 'clone' }, { video: SHORT, voiceAudio: WAV }, 'voice · chatterbox-vc · clone'),
  C('voice', 'local-whisper-nllb-chatterbox', { types: T('translate'), language: 'es' }, { video: SHORT }),
  C('voice', 'local-whisper-nllb-f5', { types: T('translate'), language: 'fr', mix: 'blend' }, { video: SHORT }),
  C('app-change-voice', 'comfy-chatterbox-vc', { voice: 'narrator-crisp', rights: '1' }, { video: SHORT }),
  C('app-translate-video', 'local-whisper-nllb-chatterbox', { language: 'de', rights: '1' }, { video: SHORT }),
  ...['x2', 'x4', 'x8'].map((x) => C('image-upscale', 'comfy-realesrgan', { types: T(x) }, { image: IMG })),
  C('image-upscale', 'comfy-ultrasharp', { types: T('x4') }, { image: IMG }),
  C('cutout', 'comfy-open', { types: T('white'), detail: 'fine', edgeSoftness: 9 }, { video: SHORT }),
  C('app-character-sheet', 'comfy-qwen21', { prompt: 'a red-haired explorer' }), C('app-product-shot', 'comfy-qwen21', { prompt: 'a perfume bottle' }),
  C('app-inpaint', 'comfy-qwen-image', { prompt: 'add a hat' }, { image: IMG, mask: MASK }), C('app-relight', 'comfy-qwen21', { prompt: 'golden hour' }, { image: IMG }),
  C('app-transition', 'comfy-h3', { prompt: 'morph into a city', duration: 6 }, { image: IMG }), C('app-ugc-ad', 'comfy-h3', { prompt: 'a creator holds a mug' }),
  C('app-anime-restyle', 'comfy-open', {}, { video: SHORT }), C('app-video-upscale', 'comfy-open', {}, { video: SHORT }), C('app-music-bed', 'comfy-acestep', { prompt: 'warm bed' }, { video: SHORT }),
  C('cinema', 'comfy-open', { prompt: '@image1 in the rain #dolly-in 0-2s', duration: 5, rights: '1' }, { refs: [IMG] }), C('app-orbit-shot', 'comfy-open', { prompt: '@image1 orbit', duration: 5, rights: '1' }, { refs: [IMG] }),
  C('cinema', 'comfy-open', { prompt: 'a lighthouse at dusk #crane-up 0-2s #orbit 2-5s', duration: 5 }, {}),
  C('cinema', 'comfy-open', { prompt: 'a street market', duration: 5, auto: '1' }, {}),
  C('cinema', 'comfy-funcamera', { prompt: '@image1 walks #dolly-in 0-3s #tilt-up 3-5s', duration: 5, resolution: '720p', rights: '1' }, { refs: [IMG] }),
];
const results = [];
async function one(c) {
  const f = new FormData(); f.append('rights', '1'); f.append('provider', c.provider); for (const [k, v] of Object.entries(c.fields)) f.append(k, String(v));
  for (const [k, v] of Object.entries(c.files)) for (const x of [v].flat()) { const b = x(); f.append(k, b, `${k}.${b.type.split('/')[1]}`); }
  const r = await fetch(`${API}/api/tools/${c.tool}/jobs`, { method: 'POST', body: f }); const s = await r.json();
  if (r.status !== 200) return { ...c, ok: false, stage: 'submit', error: s.error, issues: s.issues };
  const pct = []; let j; const t0 = Date.now();
  while (Date.now() - t0 < 240000) { j = await (await fetch(`${API}/api/jobs/${s.id}`)).json(); if (pct.at(-1) !== j.percent) pct.push(j.percent); if (['done', 'failed', 'canceled', 'blocked'].includes(j.status)) break; await wait(150); }
  const outs = []; for (const o of j.outputs ?? []) { const b = Buffer.from(await (await fetch(API + o.url)).arrayBuffer()); const p = path.join(DATA, `dl-${path.basename(o.url)}`); fs.writeFileSync(p, b);
    let streams = ''; try { streams = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', p]).toString().trim().split('\n').join('+'); } catch {} outs.push({ label: o.label, bytes: b.length, streams }); }
  const rising = pct.every((x, i) => i === 0 || x >= pct[i - 1]) && new Set(pct).size >= 3;
  const native = (j.requestIds ?? []).length > 0 || fs.readdirSync(CAP).some((x) => x.startsWith(s.id));
  return { ...c, files: undefined, id: s.id, ok: j.status === 'done' && outs.length > 0 && outs.every((x) => x.bytes > 0) && native, native, status: j.status, error: j.error, percent: pct, percentRising: rising, outputs: outs, graphs: fs.readdirSync(CAP).filter((x) => x.startsWith(s.id)).length, plan: j.input?.comfyPlan ?? null };
}
for (let i = 0; i < CASES.length; i += 2) { const batch = await Promise.all(CASES.slice(i, i + 2).map((c) => one(c).catch((e) => ({ ...c, files: undefined, ok: false, error: String(e) })))); for (const r of batch) { results.push(r); console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.label}  ${r.status ?? r.stage} ${r.ok ? `pct ${r.percent.join('→')} outs ${r.outputs.map((o) => o.streams).join(',')} graphs ${r.graphs}` : r.error ?? ''}`); } }
fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(results, null, 1));
const core = results;
console.log(`\n${core.filter((r) => r.ok).length}/${core.length} pass`);
process.exit(core.every((r) => r.ok) ? 0 : 1);
