// Finish (2026-10-27): the eight one-click finishing looks (shared/finishPresets.ts) and the free local tool (tools/finish.ts).
// In-process, temp data dir, mock backend, no network. Clips are made here with `ffmpeg -f lavfi testsrc`.
// 1 the graph builder (pure): every look builds for every strength and shape, strength 0 = nothing, stacking renames pads, the size cap
// 2 parseInput: picks, strength, two looks, refusals (missing file, photo, unreadable, too short, unknown look), the 20 s cap
// 3 one ffmpeg run per look on a tiny clip (H.264 + AAC, faststart, the sound kept), a silent 9:16 clip, a 1 s clip, two looks stacked,
//   strength 0 copies the picture bit for bit; the tool is registered, free and on the send-to / prefill path
// Run: npx tsx test/finish.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'finish-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
const S = await import('../src/shared/finishPresets.js');
const { getTool } = await import('../src/tools/registry.js');
const { getProvider } = await import('../src/providers.js');
const { NATIVE_DIRECT } = await import('../src/routing/directRoutes.js');
const { VIDEO_BARS } = await import('../src/shared/videoBar.js'); const { videoWorkflowById } = await import('../src/shared/videoWorkflows.js');
const ok = (m: string) => console.log('ok ' + m);
const tool = getTool(S.FINISH_TOOL)!;

// ---- 1. graph builder ----
assert.equal(S.FINISH_PRESETS.length, 8); assert.equal(new Set(S.FINISH_PRESETS.map((p) => p.id)).size, 8);
for (const c of [{ width: 1920, height: 1080, fps: 24, seconds: 10 }, { width: 720, height: 1280, fps: 30, seconds: 1 }, { width: 640, height: 640, fps: 23.976, seconds: 0.4 }])
  for (const p of S.FINISH_PRESETS) for (const s of [0.05, 0.5, 1]) {
    const g = S.finishGraph([{ id: p.id, strength: s }], c)!;
    assert.ok(g.startsWith('') && g.includes('[0:v]') && g.endsWith('format=yuv420p[vout]'), `${p.id}: from [0:v] to [vout]`);
    assert.ok(!/\[(in|out)\]/.test(g), `${p.id}: pads renamed`); assert.ok(!/NaN|undefined|Infinity/.test(g), `${p.id} @ ${s}: clean numbers`);
    assert.ok(!/drawtext|subtitles/.test(g), 'only filters the stock ffmpeg has');
  }
assert.equal(S.finishGraph([{ id: 'film-grain', strength: 0 }], { width: 640, height: 360, fps: 24, seconds: 2 }), null, 'strength 0 changes nothing');
assert.equal(S.finishGraph([{ id: 'nope', strength: 1 }], { width: 640, height: 360, fps: 24, seconds: 2 }), null, 'an unknown look is skipped');
assert.match(S.finishGraph([], { width: 3840, height: 2160, fps: 24, seconds: 2 }, { width: 1920, height: 1080 })!, /^\[0:v\]scale=1920:1080/, 'the size cap alone still scales');
const two = S.finishGraph([{ id: 'soft-glow', strength: 0.6 }, { id: 'dream-blur', strength: 0.6 }], { width: 640, height: 360, fps: 24, seconds: 2 })!;
assert.ok(two.includes('[v0]') && two.includes('[v1]format=yuv420p[vout]') && two.includes('[l0a]') && two.includes('[l1o]'), 'two looks chain, each with its own pads');
assert.deepEqual(S.finishSize(3840, 2160), { width: 1920, height: 1080 }); assert.deepEqual(S.finishSize(1080, 1920), null); assert.deepEqual(S.finishSize(1081, 721), { width: 1082, height: 722 });
assert.ok(!S.finishGraph([{ id: 'cinematic', strength: 1 }], { width: 720, height: 1280, fps: 24, seconds: 1 })!.includes('pad='), 'no bars on a tall clip');
assert.ok(S.finishGraph([{ id: 'cinematic', strength: 1 }], { width: 1280, height: 720, fps: 24, seconds: 1 })!.includes('pad=1280:720'), 'bars on a wide clip');
ok('graph builder: 8 looks × shapes × strengths, strength 0 = null, stacking, size cap, bars only on wide clips');

// ---- 2. parseInput ----
const mk = (name: string, args: string[]) => { execFileSync('ffmpeg', ['-y', '-v', 'error', ...args, path.join(D, name)]); return name; };
const wide = mk('wide.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac']);
const tall = mk('tall.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=180x320:rate=30:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p']); // silent, 9:16, 1 s
const tiny = mk('tiny.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=24:duration=0.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p']);
const long = mk('long.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=128x72:rate=10:duration=22', '-c:v', 'libx264', '-pix_fmt', 'yuv420p']);
fs.writeFileSync(path.join(D, 'junk.mp4'), 'not a video');
const parse = (f: Record<string, string>, files: Record<string, string[]> = { video: [wide] }) => tool.parseInput({ types: '["film-grain"]', ...f }, files) as Promise<any>;
const r = await parse({});
assert.equal(r.finish.looks[0].id, 'film-grain'); assert.equal(r.finish.strength, S.FINISH_DEFAULT_STRENGTH); assert.equal(r.compareUrl, `/files/${wide}`); assert.equal(r.hasAudio, true);
assert.equal((await parse({ strength: '0.3' })).finish.strength, 0.3); assert.equal((await parse({ strength: '40' })).finish.strength, 0.4, 'a percent is read as a percent');
const st = await parse({ second: 'vignette' }); assert.deepEqual(st.finish.looks.map((l: any) => l.id), ['film-grain', 'vignette']); assert.equal(st.outputLabel, 'Film grain + Vignette');
for (const [f, files, code] of [[{}, {}, 'required'], [{}, { video: ['x.png'] }, 'format'], [{}, { video: ['missing.mp4'] }, 'unreadable'], [{}, { video: ['junk.mp4'] }, 'unreadable'], [{}, { video: [tiny] }, 'too_short'],
  [{ types: '["sparkles"]' }, undefined, 'unknown_look'], [{ second: 'sparkles' }, undefined, 'unknown_look'], [{ second: 'film-grain' }, undefined, 'invalid'], [{ strength: '-1' }, undefined, 'invalid'], [{ strength: 'x' }, undefined, 'invalid']] as const) {
  const e = await parse(f as any, files as any); assert.equal(e.code, code, `${JSON.stringify(f)} ${JSON.stringify(files)} → ${code} (got ${e.code}: ${e.error})`);
}
const lg = await parse({}, { video: [long] }); assert.equal(lg.finish.seconds, S.FINISH_MAX_SECONDS); assert.equal(lg.finish.trimmed, true); assert.match(lg.warnings[0], /first 20 s/);
assert.match((await parse({ types: '["cinematic"]' }, { video: [tall] })).warnings.join(' '), /wide clips only/);
ok('parseInput: look, strength (0–1 or %), two looks, refusals (missing, photo, junk, too short, unknown, same look twice, bad strength), the 20 s cap');

// ---- 3. runs ----
const probe = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', f]).toString());
const { jobs } = await import('../src/jobs.js'); let n = 0;
const run = async (input: any) => { const job: any = { id: `fin${n++}`, toolId: 'finish', provider: S.FINISH_PROVIDER, status: 'queued', input, createdAt: Date.now() }; jobs.set(job.id, job); await tool.run(job); assert.equal(job.status, 'done', job.error); return job; };
for (const p of S.FINISH_PRESETS) {
  const j = await run(await parse({ types: JSON.stringify([p.id]), strength: '0.8' })); const f = path.join(D, j.outputs[0].url.slice(7)); const pr = probe(f);
  assert.deepEqual(pr.streams.map((s: any) => s.codec_name).sort(), ['aac', 'h264'], `${p.id}: H.264 + AAC`); assert.equal(pr.streams.find((s: any) => s.codec_type === 'video').width, 320);
  assert.ok(Math.abs(Number(pr.format.duration) - 2) < 0.15, `${p.id}: same length`); assert.ok(fs.readFileSync(f).subarray(0, 64).includes('ftyp') && fs.readFileSync(f).indexOf('moov') < fs.readFileSync(f).indexOf('mdat'), `${p.id}: faststart`);
  assert.equal(j.outputs[0].label, p.label);
}
const t = await run(await parse({ types: '["push-in"]', second: 'cinematic' }, { video: [tall] })); const tp = probe(path.join(D, t.outputs[0].url.slice(7)));
assert.deepEqual(tp.streams.map((s: any) => s.codec_type), ['video'], 'a silent clip stays silent'); assert.equal(tp.streams[0].height, 320);
const z = await run(await parse({ strength: '0' }));
const md5 = (f: string) => execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-map', '0:v', '-f', 'md5', '-']).toString().trim();
assert.equal(md5(path.join(D, z.outputs[0].url.slice(7))), md5(path.join(D, wide)), 'strength 0: the picture is identical');
assert.ok(probe(path.join(D, z.outputs[0].url.slice(7))).streams.some((s: any) => s.codec_type === 'audio'), 'strength 0 keeps the sound');
ok('runs: all 8 looks (H.264 + AAC, faststart, same size and length), a silent 9:16 1 s clip with two looks, strength 0 identical');

// ---- 4. wiring ----
assert.deepEqual(tool.providers, [S.FINISH_PROVIDER]); assert.ok(getProvider(S.FINISH_PROVIDER)); assert.equal(NATIVE_DIRECT[S.FINISH_PROVIDER]?.noComfy, true);
assert.equal(videoWorkflowById('finish')?.toolId, 'finish'); assert.equal(VIDEO_BARS.finish.controls[0].kind, 'gallery');
assert.ok(tool.presets!.every((p: any) => fs.existsSync(path.join(import.meta.dirname, '..', p.posterUrl.replace(/^\//, '')))), 'every look has its cover');
assert.ok(tool.inputs.some((i) => i.name === 'video'), 'takes a video, so video results can be sent to it');
ok('wiring: free local provider, Video workflow + bar recipe, covers on disk, send-to slot');
