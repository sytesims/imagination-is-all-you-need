// Captions + SRT (captions.ts): line wrapping (about 42 characters, at most 2 lines a cue), SRT / WebVTT format, a translation laid over the
// speech, the voiced-by-default rule, the burn-in ffmpeg args, and the voice runner contract (transcribeSegments with a fake python runner).
// Run: npx tsx test/captions.test.ts (temp data dir; no network, no Whisper, no ffmpeg).
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'captions-')); process.env.OPENHIGGSFIELD_DATA_DIR = D;
const fake = path.join(D, 'fake-runner.mjs');
fs.writeFileSync(fake, `const a = process.argv.slice(2); process.stdout.write(JSON.stringify({ text: 'hi there', language: a.includes('--language') ? a[a.indexOf('--language') + 1] : 'en', args: a,
  segments: a.includes('--segments') ? [{ start: 0, end: 1.5, text: ' hi there ' }, { start: 2, end: 2, text: 'zero length' }, { start: 3, end: 4, text: '   ' }] : undefined }));`);
process.env.OPENHIGGSFIELD_PY = process.execPath; process.env.OPENHIGGSFIELD_VOICE_RUNNER = fake;
const C = await import('../src/captions.ts'); const V = await import('../src/voiceRunner.ts');
const ok = (m: string) => console.log('ok ' + m);
try {
  // wrapping
  assert.deepEqual(C.wrapLines('a b c', 42), ['a b c']);
  const long = 'Quick thing, before we start, everything you are about to see, even my voice started as an idea.';
  const ls = C.wrapLines(long); assert.ok(ls.every((l) => l.length <= 42), JSON.stringify(ls)); assert.equal(ls.join(' '), long);
  assert.deepEqual(C.wrapLines('x'.repeat(100)), ['x'.repeat(42), 'x'.repeat(42), 'x'.repeat(16)]);
  ok('wrapLines: ≤ 42 characters a line, words kept whole, a very long word is cut');
  // cues
  const cues = C.cuesFromSegments([{ start: 0, end: 6, text: long }, { start: 6, end: 8.5, text: 'If you can imagine it, you can make it.' }]);
  assert.ok(cues.every((c) => c.lines.length >= 1 && c.lines.length <= 2 && c.lines.every((l) => l.length <= 42)), JSON.stringify(cues));
  assert.equal(cues[0].start, 0); assert.equal(cues[cues.length - 1].end, 8.5);
  for (let i = 1; i < cues.length; i++) assert.ok(cues[i].start >= cues[i - 1].end && cues[i].end > cues[i].start, 'no overlap, increasing');
  assert.ok(cues.length >= 3, 'the 96-character segment is split into 2 cues'); assert.ok(cues.every((c) => c.lines.join(' ').split(' ').length >= 3), `no one-word leftovers: ${JSON.stringify(cues)}`);
  const huge = C.cuesFromSegments([{ start: 20, end: 21, text: 'x'.repeat(100) }]); assert.equal(huge.length, 2); assert.ok(huge.every((c) => c.lines.length <= 2 && c.lines.every((l) => l.length <= 42))); assert.deepEqual(C.cuesFromSegments([]), []);
  ok(`cuesFromSegments: ${cues.length} cues, ≤ 2 lines each, in order without overlap`);
  // formats
  const one = [{ start: 1.234, end: 3723.5, lines: ['Hello', 'world --> there'] }];
  assert.equal(C.toSrt(one), '1\n00:00:01,234 --> 01:02:03,500\nHello\nworld --> there\n');
  assert.equal(C.toVtt(one), 'WEBVTT\n\n00:00:01.234 --> 01:02:03.500\nHello\nworld -> there\n');
  assert.equal(C.toSrt([]), ''); assert.equal(C.toVtt([]), 'WEBVTT\n\n');
  ok('SRT (comma ms, numbered) and WebVTT (header, dot ms, no "-->" in text)');
  // translation over the speech
  const es = 'Una cosa rápida antes de empezar: todo lo que vas a ver, incluso mi voz, empezó como una idea.';
  const al = C.alignText(es, [{ start: 0.5, end: 3, text: 'x' }, { start: 4, end: 6.5, text: 'y' }]);
  assert.equal(al.map((c) => c.lines.join(' ')).join(' '), es, 'exact translated words'); assert.equal(al[0].start, 0.5); assert.equal(al[al.length - 1].end, 6.5);
  assert.ok(al.every((c) => !(c.start > 3 && c.end <= 4)), 'no cue only inside the pause'); assert.deepEqual(C.alignText('hola', []), []);
  ok('alignText: the translated words spread over the speech Whisper heard');
  // voiced by default
  for (const j of [{ toolId: 'translate-video' }, { toolId: 'change-voice' }, { toolId: 'voice', input: { types: '["speech"]' } }, { toolId: 'h3-video', input: { speech: 'Hello!' } }]) assert.equal(C.captionsDefaultOn(j), true, JSON.stringify(j));
  for (const j of [{ toolId: 'h3-video', input: { prompt: 'a mug' } }, { toolId: 'compose' }, { toolId: 'soundtrack' }]) assert.equal(C.captionsDefaultOn(j), false, JSON.stringify(j));
  ok('captionsDefaultOn: talking / voiced / translated results only');
  // burn-in args
  const args = C.burnArgs('/in.mp4', [{ file: '/a.png', start: 0, end: 1.5, y: 900 }, { file: '/b.png', start: 1.5, end: 3, y: 880 }], '/out.mp4', { w: 1081, h: 1920, audio: false });
  const fc = args[args.indexOf('-filter_complex') + 1];
  assert.match(fc, /scale=1080:1920/); assert.match(fc, /overlay=0:900:eof_action=repeat:enable='between\(t,0\.000,1\.500\)'/); assert.match(fc, /\[b2\]format=yuv420p\[v\]/);
  assert.ok(!args.includes('0:a:0'), 'no audio map for a silent clip'); assert.ok(C.burnArgs('/i', [], '/o', { w: 2, h: 2, audio: true }).includes('0:a:0'));
  assert.ok(!/drawtext|subtitles/.test(fc), 'PNG overlays only (no drawtext on this ffmpeg)');
  ok('burnArgs: one overlay per cue with enable=between(t,a,b), even size, audio kept');
  // voice runner contract
  const r = await V.transcribeSegments('/clip.mp4', 'es');
  assert.equal(r.language, 'es'); assert.deepEqual(r.segments, [{ start: 0, end: 1.5, text: 'hi there' }], 'empty and zero-length segments dropped, text trimmed');
  assert.deepEqual((r as any).args ?? null, null, 'only the contract fields come back');
  const raw: any = await V.transcribe('/clip.mp4'); assert.deepEqual(Object.keys(raw).sort(), ['args', 'language', 'text'], 'old transcribe output unchanged for translate (no segments)');
  assert.equal(V.voiceRunnerReady().ready, true);
  process.env.OPENHIGGSFIELD_PY = path.join(D, 'missing', 'python'); assert.equal(V.voiceRunnerReady().ready, false); assert.equal(C.captionsStatus().ready, false); assert.ok(C.captionsStatus().steps.length >= 3);
  await assert.rejects(V.transcribeSegments('/clip.mp4'), /not installed/);
  ok('voice runner contract: transcribe --segments [--language], old output kept; missing python → setup, never a download');
  console.log('PASS captions');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
