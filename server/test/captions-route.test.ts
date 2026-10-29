// Captions routes (captions.ts): POST /api/jobs/:id/captions makes and caches <id>.srt / .vtt, GET reads them, a silent clip says "nospeech",
// a missing file 409s, burn-in makes a new $0 job, and trash removes the captions. The Whisper call is a fake runner (OPENHIGGSFIELD_PY = node).
// Run: npx tsx test/captions-route.test.ts (port 9433; temp data dir, mock backend, no keys, no network; needs ffmpeg on PATH).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'captions-route-')); const ok = (m: string) => console.log('ok ' + m);
const PATH = `/opt/homebrew/bin:${process.env.PATH}`; const ff = (a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a], { env: { ...process.env, PATH } });
ff(['-f', 'lavfi', '-i', 'color=c=gray:s=320x240:d=3', '-f', 'lavfi', '-i', 'sine=f=440:d=3', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(D, 'talk.mp4')]);
ff(['-f', 'lavfi', '-i', 'color=c=gray:s=320x240:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(D, 'silent.mp4')]);
const fake = path.join(D, 'fake-runner.mjs'); const calls = path.join(D, 'calls.log');
fs.writeFileSync(fake, `import fs from 'node:fs'; const a = process.argv.slice(2); fs.appendFileSync(${JSON.stringify(calls)}, a.join(' ') + '\\n');
process.stdout.write(JSON.stringify({ text: 'x', language: 'en', segments: [{ start: 0.2, end: 2.6, text: 'Imagination is all you need. If you can imagine it, you can make it today.' }] }));`);
const PORT = testPort(9433); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PATH, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'), OPENHIGGSFIELD_BACKEND: 'mock', COMFY_API_KEY: '',
  OPENHIGGSFIELD_SKIP_MCP: '1', OPENHIGGSFIELD_PY: process.execPath, OPENHIGGSFIELD_VOICE_RUNNER: fake }, stdio: 'ignore', detached: true });
const j = async (u: string, init?: RequestInit) => { const r = await fetch(B + u, init); return { status: r.status, body: (await r.json()) as any }; };
const post = (u: string, b: unknown) => j(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const st = await j('/api/captions/status'); assert.equal(st.body.ready, true); assert.ok(st.body.steps.length >= 3);
  const talk = (await post('/api/compose', { clips: ['/files/talk.mp4'], keepClipAudio: true, title: 'talking clip' })).body.id; assert.ok(talk);
  const silent = (await post('/api/compose', { clips: ['/files/silent.mp4'], title: 'silent clip' })).body.id; assert.ok(silent);
  const g0 = await j(`/api/jobs/${talk}/captions`); assert.equal(g0.body.state, 'none'); assert.equal(g0.body.defaultOn, false);
  const m = await post(`/api/jobs/${talk}/captions`, {}); assert.equal(m.status, 200, JSON.stringify(m.body)); assert.equal(m.body.state, 'ready'); assert.equal(m.body.cached, false);
  assert.ok(m.body.cues.length === 1 && m.body.cues[0].lines.length === 2 && m.body.cues.every((c: any) => c.lines.length <= 2)); assert.equal(m.body.vtt, `/api/jobs/${talk}/captions.vtt`);
  assert.ok(fs.existsSync(path.join(D, 'captions', `${talk}.srt`)) && fs.existsSync(path.join(D, 'captions', `${talk}.vtt`)));
  assert.match(fs.readFileSync(calls, 'utf8'), new RegExp(`transcribe .*${talk}-ad\\.mp4 --segments`));
  const m2 = await post(`/api/jobs/${talk}/captions`, {}); assert.equal(m2.body.cached, true); assert.equal(fs.readFileSync(calls, 'utf8').trim().split('\n').length, 1, 'cached: Whisper ran once');
  ok(`POST captions: ${m.body.cues.length} cues, <id>.srt + .vtt in DATA_DIR/captions, cached on the second call`);
  const srt = await fetch(`${B}/api/jobs/${talk}/captions.srt?download=1`); assert.equal(srt.status, 200); assert.match(srt.headers.get('content-type')!, /subrip/); assert.match(srt.headers.get('content-disposition')!, /attachment; filename=".*\.srt"/);
  assert.match(await srt.text(), /^1\n00:00:00,200 --> /); const vtt = await fetch(`${B}/api/jobs/${talk}/captions.vtt`); assert.match(vtt.headers.get('content-type')!, /text\/vtt/); assert.match(await vtt.text(), /^WEBVTT\n\n00:00:00\.200 --> /);
  assert.equal((await j(`/api/jobs/${talk}/captions`)).body.state, 'ready');
  ok('GET .srt (attachment) and .vtt (text/vtt); GET captions says ready');
  const s = await post(`/api/jobs/${silent}/captions`, {}); assert.equal(s.body.state, 'nospeech'); assert.equal(s.body.srt, null);
  assert.equal(fs.readFileSync(calls, 'utf8').trim().split('\n').length, 1, 'a clip with no sound never calls Whisper'); assert.equal((await fetch(`${B}/api/jobs/${silent}/captions.srt`)).status, 404);
  ok('a clip with no sound: state nospeech, no files');
  assert.equal((await post('/api/jobs/nope/captions', {})).status, 404);
  fs.rmSync(path.join(D, 'silent.mp4')); fs.rmSync(path.join(D, fs.readdirSync(D).find((f) => f.startsWith(silent) && f.endsWith('.mp4'))!));
  const miss = await post(`/api/jobs/${silent}/captions`, {}); assert.equal(miss.status, 409); assert.equal(miss.body.code, 'no_media'); assert.equal((await j(`/api/jobs/${silent}/captions`)).body.state, 'nomedia');
  ok('unknown job 404; missing file 409 no_media');
  // burn-in: one PNG strip per cue, the video's width
  const strip = path.join(D, 'strip.png'); ff(['-f', 'lavfi', '-i', 'color=c=white@0.0:s=320x40,format=rgba', '-frames:v', '1', strip]);
  const f = new FormData(); const cues = m.body.cues.map((c: any) => ({ start: c.start, end: c.end, y: 180 })); f.set('cues', JSON.stringify(cues));
  cues.forEach((_: any, i: number) => f.append(`cue${i}`, new Blob([fs.readFileSync(strip)], { type: 'image/png' }), `cue${i}.png`));
  const b = await j(`/api/jobs/${talk}/captions/burn`, { method: 'POST', body: f }); assert.equal(b.status, 200, JSON.stringify(b.body)); assert.equal(b.body.cost, 0);
  const nj = (await j(`/api/jobs/${b.body.id}`)).body; assert.equal(nj.status, 'done'); assert.equal(nj.parentId, talk); assert.match(nj.outputs[0].url, /-cc\.mp4$/);
  const bad = new FormData(); bad.set('cues', JSON.stringify([{ start: 0, end: 1, y: 0 }])); bad.append('cue0', new Blob([Buffer.from('nope')]), 'x.png');
  assert.equal((await j(`/api/jobs/${talk}/captions/burn`, { method: 'POST', body: bad })).status, 400);
  ok('burn in: a new done job at $0 with the captioned MP4; a bad strip is refused');
  assert.equal((await fetch(`${B}/api/jobs/${talk}`, { method: 'DELETE' })).status < 300, true); assert.equal(fs.existsSync(path.join(D, 'captions', `${talk}.srt`)), false);
  ok('trash removes the captions');
  console.log('PASS captions-route');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
