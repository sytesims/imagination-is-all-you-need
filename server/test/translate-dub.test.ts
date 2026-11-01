// Unit: Translate a video, line by line (2026-11-01). The timing fit (comfy/dubMix.ts fitLines: placement, √ split, speed caps, overlaps), the per-line
// graph, and a whole run on a fake ComfyUI + fake voice runner (separation on and off): no ComfyUI, no models, no paid calls; ffmpeg makes test tones.
// Run: npx tsx test/translate-dub.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'tdub-'));
process.env.OPENHIGGSFIELD_DATA_DIR ??= path.join(D, 'data'); fs.mkdirSync(process.env.OPENHIGGSFIELD_DATA_DIR, { recursive: true });
const { fitLines, fitNotes, lineGraph, DUB_SPEED, DUB_GUARD_SEC } = await import('../src/comfy/dubMix.js');
const ok = (m: string) => console.log('ok', m);
const close = (a: number, b: number, m: string) => assert.ok(Math.abs(a - b) < 0.002, `${m}: ${a} vs ${b}`);

// ---------- fitLines ----------
{ // fits: played as made, at its own start, never slowed down
  const p = fitLines([{ start: 1, end: 3 }, { start: 4, end: 6 }], [1.5, 2], 8);
  assert.deepEqual(p.map((x) => [x.at, x.speed, x.sped, x.late, x.overruns]), [[1, 1, false, false, false], [4, 1, false, false, false]]); assert.deepEqual(fitNotes(p), []);
}
{ // √ split: 1.44× too long with a big gap → 1.2× and 20 % into the gap
  const [a] = fitLines([{ start: 0, end: 1 }, { start: 5, end: 6 }], [1.44, 1], 7); close(a.speed, 1.2, 'sqrt'); close(a.length, 1.2, 'len'); assert.equal(a.overruns, false);
  // 1.21× too long → √ = 1.1, below the cap
  const [b] = fitLines([{ start: 0, end: 2 }], [2.42], 10); close(b.speed, 1.1, 'sqrt 1.1');
}
{ // small gap: speeds up just enough to end before the next line (still under the cap)
  const [a, b] = fitLines([{ start: 0, end: 2 }, { start: 2.2, end: 3 }], [2.5, 0.5], 4); // √1.25 = 1.118 would end at 2.236, past 2.15
  close(a.speed, 2.5 / (2.2 - DUB_GUARD_SEC), 'just enough'); assert.ok(a.speed <= DUB_SPEED.default); assert.equal(a.overruns, false); assert.equal(b.at, 2.2); assert.equal(b.late, false);
}
{ // over the cap: 1.2× at most, it runs into the next line, which starts later (never overlapping); later lines catch up at a pause
  const p = fitLines([{ start: 0.5, end: 1.5 }, { start: 2, end: 3 }, { start: 3.2, end: 5 }, { start: 9, end: 10 }], [1, 2.5, 1, 1], 12);
  close(p[1].speed, 1.2, 'capped'); assert.equal(p[1].overruns, true); close(p[1].length, 2.5 / 1.2, 'len at cap');
  close(p[2].at, 2 + 2.5 / 1.2 + DUB_GUARD_SEC, 'pushed'); assert.equal(p[2].late, true); assert.ok(p[2].at >= p[1].at + p[1].length);
  assert.equal(p[3].at, 9); assert.equal(p[3].late, false, 'caught up at the pause');
  assert.deepEqual(fitNotes(p), ['1 line sped up to fit the original timing (at most 1.2×).', '1 line still too long: it runs into the next line, so the lines after start a little later.']);
  // a higher setting is honoured up to the 1.5× cap, and never below 1 (no slowing down)
  close(fitLines([{ start: 0, end: 1 }, { start: 1.1, end: 2 }], [3, 1], 3, 1.5)[0].speed, 1.5, 'max 1.5'); close(fitLines([{ start: 0, end: 1 }, { start: 1.1, end: 2 }], [3, 1], 3, 9)[0].speed, DUB_SPEED.cap, 'cap');
  close(fitLines([{ start: 0, end: 1 }, { start: 1.1, end: 2 }], [3, 1], 3, 0.5)[0].speed, 1, 'never below 1'); assert.ok(DUB_SPEED.floor < 1);
}
{ // last line past the clip end; overlapping Whisper segments; empty input; a zero-length line
  const p = fitLines([{ start: 0, end: 1 }, { start: 0.8, end: 2 }], [1, 3], 2.5); assert.equal(p[1].at, 1 + DUB_GUARD_SEC); assert.equal(p[1].overruns, true);
  assert.deepEqual(fitNotes(p).slice(-1), ['The last line runs past the end of the clip.']);
  assert.deepEqual(fitLines([], [], 5), []); assert.deepEqual(fitNotes([]), []);
  const z = fitLines([{ start: 1, end: 1 }], [0], 3)[0]; assert.equal(z.length, 0); assert.equal(z.speed, 1);
  const many = fitLines(Array.from({ length: 40 }, (_, k) => ({ start: k * 0.7, end: k * 0.7 + 0.6 })), Array(40).fill(1.2), 30);
  for (let k = 1; k < many.length; k++) assert.ok(many[k].at >= many[k - 1].at + many[k - 1].length + DUB_GUARD_SEC - 0.002, `no overlap at ${k}`);
  assert.ok(many.every((x) => x.speed <= DUB_SPEED.default + 1e-9));
}
ok('fitLines: placement, √ split, just-enough, 1.2× default / 1.5× cap, never slower, overruns push later lines, notes');

// ---------- lineGraph ----------
{
  const g: any = { 1: { class_type: 'LoadAudio', inputs: { audio: 'x' } }, 2: { class_type: 'ChatterboxMTLTTS', inputs: { text: '', seed: 3, audio_prompt: ['1', 0] } }, 3: { class_type: 'SaveAudio', inputs: { audio: ['2', 0], filename_prefix: 'openhiggsfield/translated' } } };
  const extra = lineGraph(g, '2', '3', 'text', ['uno', 'dos', 'tres']);
  assert.deepEqual(extra, ['3-l2', '3-l3']); assert.equal(g['2'].inputs.text, 'uno'); assert.equal(g['2-l3'].inputs.text, 'tres'); assert.deepEqual(g['2-l2'].inputs.audio_prompt, ['1', 0]);
  assert.deepEqual(g['3-l3'].inputs.audio, ['2-l3', 0]); assert.equal(g['3-l2'].inputs.filename_prefix, 'openhiggsfield/translated-line2'); assert.equal(g['2-l2'].inputs.seed, 3);
  const one: any = structuredClone(g); assert.deepEqual(lineGraph(one, '2', '3', 'text', ['solo']), []);
  assert.throws(() => lineGraph({}, '2', '3', 'text', ['a']), /no node 2/);
}
ok('lineGraph: one TTS + save node per line, same settings, line 1 keeps its ids');

// ---------- a whole run on a fake ComfyUI ----------
const py = path.join(D, 'runner.sh'); // fake voice runner: three timed lines; the translation keeps the breaks
fs.writeFileSync(py, `#!/bin/sh\ncase "$2" in\n transcribe) echo "$3" >> ${D}/transcribed.txt; echo '{"text":"one two three","language":"en","segments":[{"start":0.5,"end":1.5,"text":"One."},{"start":2,"end":3,"text":"Two."},{"start":3.2,"end":5,"text":"Three."}]}';;\n translate) cat > ${D}/translate-in.txt; printf '{"text":"Uno.\\\\nDos dos dos.\\\\nTres."}';;\nesac\n`, { mode: 0o755 });
process.env.OPENHIGGSFIELD_PY = py;
const clip = path.join(D, 'clip.mp4'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=12', '-f', 'lavfi', '-i', 'sine=f=300:d=6', '-t', '6', '-pix_fmt', 'yuv420p', '-shortest', clip]);
const LEN: Record<string, number> = { '4': 6, '5': 6, '3': 1, '3-l2': 2.5, '3-l3': 1 }; // vocals, background, then the three voiced lines
const { buildPlan } = await import('../src/comfy/plans.js'); const { runNative } = await import('../src/comfy/runNative.js'); const { NO_SEPARATION_NOTE } = await import('../src/comfy/separation.js');
const run = async (separation: boolean, mix: string) => {
  const sent: any[] = []; const uploads: string[] = [];
  const transport: any = {
    upload: async (f: string) => { uploads.push(f); return path.basename(f); },
    run: async (graph: any) => { sent.push(graph); const outs: any = {}; for (const [id, n] of Object.entries<any>(graph)) if (n.class_type === 'SaveAudio') outs[id] = [{ filename: `${id}.wav`, subfolder: '', type: 'output', kind: 'audio' }]; return { outputs: outs, promptId: `p${sent.length}` }; },
    download: async (o: any, dest: string) => { execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=f=600:d=${LEN[o.filename.replace(/\.wav$/, '')]}`, dest]); return dest; },
  };
  const job: any = { id: `td-${separation}-${mix}`, toolId: 'voice', provider: 'local-whisper-nllb-chatterbox', status: 'queued', outputs: [], warnings: [], input: { mode: 'translate', videoPath: clip, language: 'es', mix } };
  await runNative(job, transport, (j: any, o: any) => buildPlan(j, { ...o, separation }));
  return { job, sent, uploads };
};
{
  const { job, sent, uploads } = await run(true, 'replace');
  assert.equal(job.status, 'done', job.error); assert.equal(sent.length, 2); assert.equal(sent[0]['3'].class_type, 'MelBandRoFormerSampler');
  const tts = sent[1]; assert.deepEqual(Object.keys(tts).filter((k) => tts[k].class_type === 'ChatterboxMTLTTS').sort(), ['2', '2-l2', '2-l3']);
  assert.deepEqual(['2', '2-l2', '2-l3'].map((k) => tts[k].inputs.text), ['Uno.', 'Dos dos dos.', 'Tres.']);
  assert.match(String(tts['1'].inputs.audio), /-p0-4\.wav$/, 'the voice is cloned from the vocals stem'); assert.ok(uploads.some((u) => /-p0-4\.wav$/.test(u)));
  assert.match(fs.readFileSync(path.join(D, 'transcribed.txt'), 'utf8'), /-p0-4\.wav/, 'Whisper hears the vocals stem'); assert.equal(fs.readFileSync(path.join(D, 'translate-in.txt'), 'utf8'), 'One.\nTwo.\nThree.');
  assert.deepEqual(job.input.dubLines.map((l: any) => [l.start, l.text]), [[0.5, 'Uno.'], [2, 'Dos dos dos.'], [3.2, 'Tres.']]);
  assert.equal(job.input.translatedText.text, 'Uno. Dos dos dos. Tres.'); assert.equal(job.input.separation, true);
  assert.deepEqual(job.input.dubFit.map((x: any) => [x.speed, x.sped, x.late, x.overruns]), [[1, false, false, false], [1.2, true, false, true], [1, false, true, false]]);
  assert.ok(job.warnings.some((w: string) => /sped up/.test(w)) && job.warnings.some((w: string) => /runs into the next line/.test(w))); assert.ok(!job.warnings.includes(NO_SEPARATION_NOTE));
  assert.equal(job.outputs.length, 1); const outFile = path.join(process.env.OPENHIGGSFIELD_DATA_DIR!, path.basename(job.outputs[0].url)); assert.match(outFile, /\.mp4$/);
  const streams = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', outFile]).toString().trim().split('\n'); assert.deepEqual(streams.sort(), ['audio', 'video']);
}
ok('run with separation: template pass, vocals cloned + transcribed, three lines in one prompt, placed and fitted, one video out');
{
  const { job, sent } = await run(false, 'blend');
  assert.equal(job.status, 'done', job.error); assert.equal(sent.length, 1); assert.equal(job.input.separation, false);
  assert.ok(job.warnings.includes(NO_SEPARATION_NOTE)); assert.equal(job.input.dubFit.length, 3);
  const r = await run(false, 'replace'); assert.equal(r.job.status, 'done', r.job.error);
}
ok('run without separation: lines still placed, the plain note, blend and replace both mix');
fs.rmSync(D, { recursive: true, force: true }); console.log('translate-dub: all ok');
