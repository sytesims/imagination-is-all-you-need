// POST /api/compose extras for the skill pack: a voice track over the music (voice), side-by-side before/after (layout), centre-crop cutdowns (aspect),
// keeping the clips' own sound (keepClipAudio), and their validation. Run: npx tsx test/compose-tracks.e2e.ts (port 9281; temp data dir, mock backend, no network; needs ffmpeg on PATH).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, spawnSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-tracks-')); const ok = (m: string) => console.log('ok ' + m);
const PORT = testPort(9281); const B = `http://localhost:${PORT}`; const PATH = `/opt/homebrew/bin:${process.env.PATH}`;
const ff = (args: string[]) => { const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { env: { ...process.env, PATH } }); assert.equal(r.status, 0, String(r.stderr)); };
// test media straight into the data dir (served as /files/…)
ff(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=2', '-pix_fmt', 'yuv420p', path.join(D, 'a.mp4')]);
ff(['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=30:duration=3', '-pix_fmt', 'yuv420p', path.join(D, 'b.mp4')]);
ff(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-pix_fmt', 'yuv420p', '-shortest', path.join(D, 'talk.mp4')]); // a clip with its own sound
ff(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=6', path.join(D, 'music.mp3')]);
ff(['-f', 'lavfi', '-i', 'sine=frequency=880:duration=3', path.join(D, 'voice.mp3')]);
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PATH, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_KEYS: '1', COMFY_API_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_USE_LOCAL: '' }, stdio: 'ignore', detached: true });
const post = async (b: unknown) => { const r = await fetch(`${B}/api/compose`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: (await r.json()) as any }; };
const probe = (url: string) => { const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', path.join(D, path.basename(url))], { env: { ...process.env, PATH }, encoding: 'utf8' });
  const j = JSON.parse(r.stdout); const v = j.streams.find((s: any) => s.codec_type === 'video'); return { w: v.width, h: v.height, audio: j.streams.some((s: any) => s.codec_type === 'audio'), dur: Number(j.format.duration) }; };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }

  const seq = await post({ clips: ['/files/a.mp4', '/files/b.mp4'], audio: '/files/music.mp3', voice: '/files/voice.mp3', title: 'Explainer' });
  assert.equal(seq.status, 200, JSON.stringify(seq.body)); assert.equal(seq.body.music, true); assert.equal(seq.body.voice, true); assert.equal(seq.body.layout, 'sequence'); assert.equal(seq.body.cost, 0);
  const s1 = probe(seq.body.resultUrl); assert.equal(s1.w, 320); assert.equal(s1.h, 240); assert.ok(s1.audio); assert.ok(Math.abs(s1.dur - 5) < 0.4, `5 s expected, got ${s1.dur}`);
  ok(`voice + music: ${s1.dur.toFixed(1)} s, one mixed audio track, $0`);

  const vo = await post({ clips: ['/files/a.mp4'], voice: '/files/voice.mp3' }); assert.equal(vo.status, 200); assert.equal(vo.body.voice, true); assert.equal(vo.body.music, false); assert.ok(probe(vo.body.resultUrl).audio);
  ok('voice alone (no music) gives an audio track');

  const kc = await post({ clips: ['/files/talk.mp4', '/files/a.mp4', '/files/talk.mp4'], audio: '/files/music.mp3', keepClipAudio: true });
  assert.equal(kc.status, 200, JSON.stringify(kc.body)); assert.equal(kc.body.clipAudio, true); const s5 = probe(kc.body.resultUrl); assert.ok(s5.audio); assert.ok(Math.abs(s5.dur - 6) < 0.4, `6 s expected, got ${s5.dur}`);
  const silent = await post({ clips: ['/files/a.mp4'], keepClipAudio: true }); assert.equal(silent.status, 200); assert.equal(silent.body.clipAudio, false); assert.match(silent.body.warnings.join(' '), /None of the clips has sound/);
  const old = await post({ clips: ['/files/talk.mp4'] }); assert.equal(old.status, 200); assert.equal(probe(old.body.resultUrl).audio, false, 'default still drops clip sound');
  ok('keepClipAudio: clip sound (and silence for silent clips) joined in order under the music; default unchanged');

  const sbs = await post({ clips: ['/files/a.mp4', '/files/b.mp4'], layout: 'side-by-side', title: 'Before / after' });
  assert.equal(sbs.status, 200, JSON.stringify(sbs.body)); const s2 = probe(sbs.body.resultUrl); assert.equal(s2.w, 640); assert.equal(s2.h, 240); assert.ok(Math.abs(s2.dur - 2) < 0.4, `shorter clip length, got ${s2.dur}`);
  assert.equal(sbs.body.width, 640);
  ok('side-by-side: 2 clips → double width, as long as the shorter clip');

  const sq = await post({ clips: ['/files/a.mp4'], aspect: '1:1' }); assert.equal(sq.status, 200); const s3 = probe(sq.body.resultUrl); assert.equal(s3.w, 240); assert.equal(s3.h, 240); assert.equal(sq.body.aspect, '1:1');
  const tall = await post({ clips: ['/files/a.mp4'], aspect: '9:16' }); assert.equal(tall.status, 200); const s4 = probe(tall.body.resultUrl); assert.equal(s4.h, 240); assert.ok(Math.abs(s4.w / s4.h - 9 / 16) < 0.02, `9:16, got ${s4.w}x${s4.h}`);
  ok(`aspect centre-crops: 1:1 → ${s3.w}x${s3.h}, 9:16 → ${s4.w}x${s4.h}`);

  // trims (Stitch timeline): each clip cut to its {in, out}; a trim past the end is clamped (with a warning); null keeps a clip whole
  const tr = await post({ clips: ['/files/a.mp4', '/files/b.mp4', '/files/a.mp4'], trims: [{ in: 0.5, out: 1.5 }, { in: 1 }, null], audio: '/files/music.mp3' });
  assert.equal(tr.status, 200, JSON.stringify(tr.body)); const s6 = probe(tr.body.resultUrl); assert.ok(Math.abs(s6.dur - 5) < 0.4, `1 + 2 + 2 = 5 s expected, got ${s6.dur}`);
  assert.deepEqual(tr.body.trims, [{ in: 0.5, out: 1.5 }, { in: 1, out: 3 }, null]); assert.equal(tr.body.durationSec, 5);
  const over = await post({ clips: ['/files/a.mp4', '/files/b.mp4'], trims: [{ in: 0.5, out: 99 }] }); assert.equal(over.status, 200, JSON.stringify(over.body));
  assert.ok(Math.abs(probe(over.body.resultUrl).dur - 4.5) < 0.4, 'a trim past the end stops at the clip end'); assert.deepEqual(over.body.trims, [{ in: 0.5, out: 2 }, null]); assert.match(over.body.warnings.join(' '), /past the end/);
  const whole = await post({ clips: ['/files/a.mp4'], trims: [{ in: 0, out: 2 }] }); assert.equal(whole.status, 200); assert.equal(whole.body.trims, null, 'a trim that keeps everything is no trim');
  const ktr = await post({ clips: ['/files/talk.mp4', '/files/a.mp4'], trims: [{ in: 1 }, { out: 1 }], keepClipAudio: true, fadeOutSec: 0.5, videoFade: true });
  assert.equal(ktr.status, 200, JSON.stringify(ktr.body)); const s7 = probe(ktr.body.resultUrl); assert.ok(s7.audio); assert.ok(Math.abs(s7.dur - 2) < 0.4, `1 + 1 s, got ${s7.dur}`); assert.equal(ktr.body.videoFade, true);
  const nofade = await post({ clips: ['/files/a.mp4'], fadeOutSec: 0, videoFade: true }); assert.equal(nofade.status, 200); assert.equal(nofade.body.videoFade, false, 'no fade length, no fade');
  ok('trims: cut per clip in clip order, clamped past the end (warned), whole-clip trims dropped; clip sound follows the trim; videoFade');

  for (const [b, field] of [[{ clips: ['/files/a.mp4'], trims: [{ in: 2, out: 1 }] }, 'trims[0]'], [{ clips: ['/files/a.mp4'], trims: [null, null] }, 'trims'], [{ clips: ['/files/a.mp4'], trims: 'x' }, 'trims'],
    [{ clips: ['/files/a.mp4'], trims: [{ in: -1 }] }, 'trims[0]'], [{ clips: ['/files/a.mp4'], trims: [[1, 2]] }, 'trims[0]']] as const) {
    const r = await post(b); assert.equal(r.status, 400, JSON.stringify(b)); assert.equal(r.body.issues?.[0]?.field, field, JSON.stringify(r.body)); }
  ok('trims validation: out before in, more trims than clips, not a list, negative in, not an object → 400');

  for (const [b, field] of [[{ clips: ['/files/a.mp4'], layout: 'side-by-side' }, 'clips'], [{ clips: ['/files/a.mp4'], layout: 'grid' }, 'layout'], [{ clips: ['/files/a.mp4'], aspect: 'wide' }, 'aspect'],
    [{ clips: ['/files/a.mp4'], aspect: '0:1' }, 'aspect'], [{ clips: ['/files/a.mp4'], voice: '/files/nope.mp3' }, 'voice']] as const) {
    const r = await post(b); assert.equal(r.status, 400, JSON.stringify(b)); assert.equal(r.body.issues?.[0]?.field, field, JSON.stringify(r.body)); }
  ok('validation: side-by-side needs 2 clips, unknown layout, bad aspect, missing voice file → 400');
  console.log('ALL OK compose-tracks');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); }
