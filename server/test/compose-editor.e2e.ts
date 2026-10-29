// Stitch editor (POST /api/compose, compose.ts): the sound mix (levels, the bed dipping under the voice, −14 LUFS), transitions and their
// lengths, title / end cards (PNG parts and server-drawn text) and their timing, caption strips, reframe sizes, and the edge cases (one clip,
// 20 clips, mixed sizes / frame rates / sample rates, a silent clip, a long voice, short music).
// Run: npx tsx test/compose-editor.e2e.ts (port 9286; temp data dir, mock backend, no network; needs ffmpeg on PATH).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, spawnSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-editor-')); const ok = (m: string) => console.log('ok ' + m);
const PORT = testPort(9286); const B = `http://localhost:${PORT}`; const PATH = `/opt/homebrew/bin:${process.env.PATH}`; const env = { ...process.env, PATH };
const ff = (args: string[]) => { const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { env }); assert.equal(r.status, 0, String(r.stderr)); };
const F = (n: string) => path.join(D, n);
// media: clips of different sizes, frame rates and sample rates, with and without sound; a black clip for timing checks; music and a quiet voice
ff(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=2', '-pix_fmt', 'yuv420p', F('a.mp4')]);
ff(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=44100:duration=3', '-pix_fmt', 'yuv420p', '-shortest', F('b.mp4')]);
ff(['-f', 'lavfi', '-i', 'testsrc=size=240x426:rate=25:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=550:sample_rate=22050:duration=2', '-pix_fmt', 'yuv420p', '-shortest', F('tall.mp4')]);
ff(['-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=30:d=6', '-pix_fmt', 'yuv420p', F('black.mp4')]);
ff(['-f', 'lavfi', '-i', 'color=c=gray:s=160x120:r=30:d=0.5', '-pix_fmt', 'yuv420p', F('tiny.mp4')]);
// the bug we hit: loud "waves" (a 220 Hz bed at -6 dBFS) and a TTS voice 10 dB under it (880 Hz bursts, 0–3 s)
ff(['-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=6', '-af', 'volume=0.5', F('waves.wav')]);
ff(['-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=24000:duration=3', '-af', 'volume=0.16', F('voice.wav')]);
ff(['-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=24000:duration=12', '-af', 'volume=0.3', F('longvoice.wav')]);
ff(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=1.5', F('short.mp3')]);
// PNG parts: a full-frame white card (320x240) and a white caption strip
ff(['-f', 'lavfi', '-i', 'color=c=white:s=320x240', '-frames:v', '1', '-pix_fmt', 'rgba', F('white.png')]);
ff(['-f', 'lavfi', '-i', 'color=c=white:s=320x40', '-frames:v', '1', '-pix_fmt', 'rgba', F('strip.png')]);
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_KEYS: '1', COMFY_API_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_USE_LOCAL: '' }, stdio: 'ignore', detached: true });
const post = async (b: unknown) => { const r = await fetch(`${B}/api/compose`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: (await r.json()) as any }; };
const postParts = async (b: unknown, parts: Record<string, string>) => { const f = new FormData(); f.set('body', JSON.stringify(b)); for (const [k, file] of Object.entries(parts)) f.append(k, new Blob([fs.readFileSync(file)], { type: 'image/png' }), `${k}.png`);
  const r = await fetch(`${B}/api/compose`, { method: 'POST', body: f }); return { status: r.status, body: (await r.json()) as any }; };
const out = (url: string) => path.join(D, path.basename(url));
const probe = (url: string) => { const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', out(url)], { env, encoding: 'utf8' });
  const j = JSON.parse(r.stdout); const v = j.streams.find((s: any) => s.codec_type === 'video'); return { w: v.width, h: v.height, audio: j.streams.some((s: any) => s.codec_type === 'audio'), dur: Number(j.format.duration) }; };
const lufs = (url: string) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', out(url), '-af', 'ebur128', '-f', 'null', '-'], { env, encoding: 'utf8' }); const m = [...r.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop(); return m ? Number(m[1]) : NaN; };
/** RMS (dBFS) of one frequency band in [a, b] seconds: the voice at 880 Hz, the bed at 220 Hz. */
const band = (url: string, hz: number, a: number, b: number) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-ss', String(a), '-t', String(b - a), '-i', out(url), '-af', `bandpass=f=${hz}:width_type=q:w=6,bandpass=f=${hz}:width_type=q:w=6,astats=measure_perchannel=none:measure_overall=RMS_level`, '-f', 'null', '-'], { env, encoding: 'utf8' });
  const m = r.stderr.match(/RMS level dB:\s+(-?[\d.]+|-inf)/); return m ? Number(m[1] === '-inf' ? -200 : m[1]) : NaN; };
const luma = (url: string, t: number) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(t), '-i', out(url), '-frames:v', '1', '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-'], { env, encoding: 'utf8' });
  const m = r.stderr.match(/YAVG=([\d.]+)/); return m ? Number(m[1]) : NaN; };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }

  // ---- sound: the quiet voice sits on top, and the film lands on −14 LUFS ----
  const raw = await post({ clips: ['/files/black.mp4'], audio: '/files/waves.wav', voice: '/files/voice.wav', musicVolume: 1, normalize: false, duck: false });
  assert.equal(raw.status, 200, JSON.stringify(raw.body)); const rawGap = band(raw.body.resultUrl, 880, 0.5, 2.5) - band(raw.body.resultUrl, 220, 0.5, 2.5);
  assert.ok(rawGap < -6, `without the mix the voice is under the bed (got ${rawGap.toFixed(1)} dB)`);
  const mix = await post({ clips: ['/files/black.mp4'], audio: '/files/waves.wav', voice: '/files/voice.wav' });
  assert.equal(mix.status, 200, JSON.stringify(mix.body)); assert.equal(mix.body.ducked, true); assert.equal(mix.body.mix.duck, true); assert.equal(mix.body.mix.normalize, true);
  const vB = band(mix.body.resultUrl, 880, 0.5, 2.5), bB = band(mix.body.resultUrl, 220, 0.5, 2.5), bAfter = band(mix.body.resultUrl, 220, 3.8, 4.8);
  assert.ok(vB - bB >= 6, `in speech the voice is ≥6 dB over the bed (got ${(vB - bB).toFixed(1)} dB)`);
  assert.ok(bAfter - bB >= 4, `the bed comes back up after the voice (dipped ${(bAfter - bB).toFixed(1)} dB)`);
  const L1 = lufs(mix.body.resultUrl); assert.ok(Math.abs(L1 - -14) <= 1, `−14 ±1 LUFS, got ${L1}`); assert.equal(mix.body.loudness.target, -14);
  const nod = await post({ clips: ['/files/black.mp4'], audio: '/files/waves.wav', voice: '/files/voice.wav', duck: false });
  const gapNoDuck = band(nod.body.resultUrl, 880, 0.5, 2.5) - band(nod.body.resultUrl, 220, 0.5, 2.5); assert.equal(nod.body.ducked, false);
  assert.ok(vB - bB > gapNoDuck + 4, `ducking adds a clear dip (${(vB - bB).toFixed(1)} vs ${gapNoDuck.toFixed(1)} dB)`);
  const quiet = await post({ clips: ['/files/b.mp4'], keepClipAudio: true }); assert.ok(Math.abs(lufs(quiet.body.resultUrl) - -14) <= 1, 'clip sound alone is also −14 LUFS');
  const vol = await post({ clips: ['/files/black.mp4'], audio: '/files/waves.wav', voice: '/files/voice.wav', voiceVolume: 0.5, musicVolume: 1.5 });
  assert.ok(band(vol.body.resultUrl, 880, 0.5, 2.5) - band(vol.body.resultUrl, 220, 0.5, 2.5) < vB - bB - 3, 'the sliders move the balance');
  ok(`mix: a voice 10 dB under the bed ends up ${(vB - bB).toFixed(1)} dB over it (ducked), the export is ${L1} LUFS, sliders move the balance`);

  // ---- transitions change the length by their overlap ----
  const three = ['/files/a.mp4', '/files/b.mp4', '/files/a.mp4'];
  const cut = await post({ clips: three }); assert.equal(cut.body.durationSec, 7); assert.ok(Math.abs(probe(cut.body.resultUrl).dur - 7) < 0.15);
  const xf = await post({ clips: three, transition: 'crossfade', transitionSec: 0.5, keepClipAudio: true }); assert.equal(xf.status, 200, JSON.stringify(xf.body));
  assert.equal(xf.body.durationSec, 6); assert.ok(Math.abs(probe(xf.body.resultUrl).dur - 6) < 0.15, `crossfade: ${probe(xf.body.resultUrl).dur}`); assert.equal(xf.body.overlapSec, 0.5); assert.ok(probe(xf.body.resultUrl).audio);
  const dip = await post({ clips: three, transition: 'dip', transitionSec: 0.8 }); assert.equal(dip.body.durationSec, 5.4); assert.ok(Math.abs(probe(dip.body.resultUrl).dur - 5.4) < 0.15);
  const big = await post({ clips: three, transition: 'dip', transitionSec: 2 }); assert.equal(big.body.overlapSec, 0.9, 'capped at 45 % of the shortest clip');
  const one = await post({ clips: ['/files/a.mp4'], transition: 'crossfade' }); assert.equal(one.body.durationSec, 2, 'one clip: nothing to cross');
  const withEnd = await post({ clips: three, transition: 'crossfade', transitionSec: 0.5, endCard: { text: 'Imagination is all you need.', mode: 'black', sec: 2 } });
  assert.equal(withEnd.body.durationSec, 7.5, 'an end card on black: +2 s, one more overlap'); assert.ok(Math.abs(probe(withEnd.body.resultUrl).dur - 7.5) < 0.15);
  ok('transitions: cut 7 s, crossfade 0.5 s → 6 s, dip 0.8 s → 5.4 s, capped by the shortest clip, one clip unchanged, an end card adds its length');

  // ---- reframe sizes ----
  for (const [aspect, fit, w, h] of [['9:16', 'fill', 240, 426], ['9:16', 'blur', 240, 426], ['1:1', 'fit', 240, 240], ['16:9', 'fill', 426, 240], [null, 'blur', 320, 240]] as const) {
    const r = await post({ clips: ['/files/a.mp4', '/files/tall.mp4', '/files/b.mp4'], ...(aspect ? { aspect } : {}), fit, cropX: 0.2 }); assert.equal(r.status, 200, JSON.stringify(r.body));
    const s = probe(r.body.resultUrl); assert.deepEqual([s.w, s.h], [w, h], `${aspect} ${fit}`); assert.deepEqual([r.body.width, r.body.height], [w, h]); assert.equal(r.body.fit, fit); }
  const old = await post({ clips: ['/files/a.mp4'], aspect: '9:16' }); const so = probe(old.body.resultUrl); assert.equal(so.h, 240); assert.ok(so.w < 240, 'without fit the older centre crop stays');
  ok('reframe: 9:16 / 1:1 / 16:9 from the first clip’s short side with fill, fit or blur; mixed sizes, rates and sample rates join; no fit keeps the older crop');

  // ---- cards and captions: on screen exactly in their windows ----
  const base = luma((await post({ clips: ['/files/black.mp4'] })).body.resultUrl, 1);
  const tc = await postParts({ clips: ['/files/black.mp4'], titleCard: { mode: 'over', sec: 2 }, captions: [{ start: 3, end: 4, y: 100 }] }, { titleCard: F('white.png'), cue0: F('strip.png') });
  assert.equal(tc.status, 200, JSON.stringify(tc.body)); assert.equal(tc.body.durationSec, 6, 'a title over the picture adds nothing'); assert.equal(tc.body.captions, 1);
  const u = tc.body.resultUrl; const at1 = luma(u, 1), at25 = luma(u, 2.6), at35 = luma(u, 3.5), at45 = luma(u, 4.5), at02 = luma(u, 0.1);
  assert.ok(at1 > 200, `title shown at 1 s (${at1})`); assert.ok(at02 < at1 - 50, `fading in at 0.1 s (${at02})`); assert.ok(Math.abs(at25 - base) < 5, `title gone at 2.6 s (${at25} vs ${base})`);
  assert.ok(at35 > base + 15 && at35 < 120, `caption strip at 3.5 s (${at35})`); assert.ok(Math.abs(at45 - base) < 5, `caption gone at 4.5 s (${at45})`);
  const black = await postParts({ clips: ['/files/black.mp4'], titleCard: { mode: 'black', sec: 2 } }, { titleCard: F('white.png') });
  assert.equal(black.body.durationSec, 8, 'a title on black adds its length'); assert.ok(luma(black.body.resultUrl, 1) > 200 && Math.abs(luma(black.body.resultUrl, 3) - base) < 5, 'its own segment, then the clip');
  const txt = await post({ clips: ['/files/black.mp4'], endCard: {}, titleCard: { text: 'A very long title that keeps going on and on, far longer than any title should be, so it has to wrap and shrink to fit the frame nicely', style: 'lower', mode: 'over' } });
  assert.equal(txt.status, 200, JSON.stringify(txt.body)); assert.equal(txt.body.endCard.text, 'Imagination is all you need.'); assert.equal(txt.body.durationSec, 8.5);
  assert.ok(luma(txt.body.resultUrl, 7.2) > base + 2, 'the server drew the default end card'); assert.ok(luma(txt.body.resultUrl, 1.2) > base + 2, 'and the long title');
  ok('cards and captions: a title over the clip shows in [0, 2] with its fade, on black it adds 2 s, a caption strip shows only in its window, text cards are drawn by the server');

  // ---- edge cases ----
  const twenty = await post({ clips: Array.from({ length: 20 }, () => '/files/tiny.mp4'), transition: 'crossfade', transitionSec: 0.2 }); assert.equal(twenty.status, 200, JSON.stringify(twenty.body));
  assert.equal(twenty.body.durationSec, 6.2); assert.ok(Math.abs(probe(twenty.body.resultUrl).dur - 6.2) < 0.15);
  const mixed = await post({ clips: ['/files/a.mp4', '/files/b.mp4', '/files/tall.mp4'], keepClipAudio: true, transition: 'dip', transitionSec: 0.4 }); assert.equal(mixed.status, 200); assert.ok(probe(mixed.body.resultUrl).audio, 'a silent clip among clips with sound');
  const lv = await post({ clips: ['/files/a.mp4'], voice: '/files/longvoice.wav' }); assert.match(lv.body.warnings.join(' '), /voice is 12 s and the video 2 s/);
  const sm = await post({ clips: ['/files/black.mp4'], audio: '/files/short.mp3' }); assert.match(sm.body.warnings.join(' '), /music is shorter/);
  const lp = await post({ clips: ['/files/black.mp4'], audio: '/files/short.mp3', musicLoop: true, fadeOutSec: 0 }); assert.equal(lp.body.warnings.some((w: string) => /shorter/.test(w)), false);
  assert.ok(band(lp.body.resultUrl, 220, 4.5, 5.5) > -40, 'looped music still plays at 5 s');
  ok('edge cases: 20 clips with crossfades, mixed sizes / rates / sample rates with a silent clip, a long voice warned, short music warned or looped');

  for (const [b, field] of [[{ clips: ['/files/a.mp4'], transition: 'wipe' }, 'transition'], [{ clips: ['/files/a.mp4'], fit: 'stretch' }, 'fit'], [{ clips: ['/files/a.mp4'], duckAmount: 2 }, 'duckAmount'],
    [{ clips: ['/files/a.mp4'], voiceVolume: 3 }, 'voiceVolume'], [{ clips: ['/files/a.mp4'], titleCard: { text: 'x', style: 'neon' } }, 'titleCard.style'], [{ clips: ['/files/a.mp4'], endCard: { sec: 30 } }, 'endCard.sec'],
    [{ clips: ['/files/a.mp4'], cropX: 1.5 }, 'cropX']] as const) {
    const r = await post(b); assert.equal(r.status, 400, JSON.stringify(b)); assert.equal(r.body.issues?.[0]?.field, field, JSON.stringify(r.body)); }
  const badPng = await (async () => { const f = new FormData(); f.set('body', JSON.stringify({ clips: ['/files/a.mp4'], titleCard: {} })); f.append('titleCard', new Blob(['not a png']), 'x.png'); const r = await fetch(`${B}/api/compose`, { method: 'POST', body: f }); return r.status; })();
  assert.equal(badPng, 400, 'a card part must be a PNG');
  ok('validation: unknown transition / fit, out-of-range levels, card style and length, crop point, a non-PNG card → 400');
  console.log('ALL OK compose-editor');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); }
