// Talking Video (2026-10-27): Lip Sync on InfiniteTalk · Comfy Cloud with long speech in parts and a script box. OFFLINE: fake fetches only
// (no network, no key, no spend); graphs checked against the InfiniteTalk object_info fixture.
//  1 planTalkChunks: 59 s → 1 part, 61 s → 2, 300 s → 6; every part ≤ 55 s, no gaps / overlaps, exact [0, total]; cuts move to the nearest pause
//  2 refusals: 301 s with split → too_long; without split the 60 s line stands (the old message, unchanged)
//  3 price: split prices every part (its span + the 0.24 s crossfade); ≤ 60 s prices exactly as before; the quote endpoint takes split=1
//  4 parse: a 70 s speech with pauses + split=1 → parts cut at pauses, one WAV per part (+0.24 s except the last); no speech → 'speech' required
//    (also with a script: the app makes the voice first); script + speech → the speech wins with a warning; script over 2,000 characters refused
//  5 plan: one Cloud-valid pass per part, same seed, post talkJoin over the full speech; the join's ffmpeg args make a clip as long as the speech
// Run: npx tsx test/talking-video.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'talkvid-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
for (const k of ['COMFY_API_KEY', 'COMFY_CLOUD_URL', 'OPENHIGGSFIELD_COMFY_CLOUD_URL', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL', 'COMFY_BASE_URL']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const TV = await import('../src/shared/talkingVideo.ts');
const IT = await import('../src/comfy/infiniteTalkCloud.ts');
const { parseSilences } = await import('../src/tools/voice/infiniteTalk.ts');
const { buildCloudPlan } = await import('../src/comfy/cloudWorkflows.ts');
const { checkCloudGraph } = await import('../src/comfy/cloudGraphCheck.ts');
const { getTool } = await import('../src/tools/registry.ts');
const OI = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'object-info-infinitetalk-cloud-2026-10-26.json'), 'utf8'));
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
const dur = (f: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const covers = (parts: { start: number; end: number }[], total: number) => { assert.equal(parts[0].start, 0); assert.equal(parts.at(-1)!.end, Math.round(total * 100) / 100);
  for (let k = 1; k < parts.length; k++) assert.equal(parts[k].start, parts[k - 1].end, 'no gap, no overlap'); for (const p of parts) assert.ok(p.end - p.start <= TV.TV_PART_MAX + 1e-9 && p.end > p.start, JSON.stringify(p)); };
try {
  // ---- 1. chunks ----
  assert.equal(TV.planTalkChunks([], 59).length, 1); assert.equal(TV.planTalkChunks([], 60).length, 1); assert.equal(TV.planTalkChunks([], 61).length, 2);
  const p300 = TV.planTalkChunks([], 300); assert.ok(p300.length >= 6); covers(p300, 300);
  for (const t of [60.1, 61, 99.99, 120, 151, 222.22, 299.5, 300]) { covers(TV.planTalkChunks([], t), t); covers(TV.planTalkChunks([1, 33, 47.3, 52.2, 98, 101, 149, 152, 199, 251, 260], t), t); }
  assert.deepEqual(TV.planTalkChunks([37.5, 42.1, 80.4], 120).map((p) => p.end), [42.1, 80.4, 120], 'cuts at the pause nearest each 40 s mark (within 5 s)');
  assert.deepEqual(TV.planTalkChunks([10, 70], 120).map((p) => p.end), [40, 80, 120], 'no pause near a mark: the even cut');
  const sp = TV.talkPartSpans(TV.planTalkChunks([], 120), 120); assert.deepEqual(sp.map((p) => Math.round((p.end - p.start) * 100) / 100), [40.24, 40.24, 40], 'each part but the last renders the crossfade');
  assert.equal(TV.talkSummary(TV.planTalkChunks([], 120)), '3 parts of about 40 s, joined with soft cuts at pauses'); assert.equal(TV.scriptSeconds(''), 0); assert.equal(TV.scriptSeconds('one two three four five'), 2);
  ok('chunks: 59 s 1 part, 61 s 2, 300 s 6; ≤ 55 s each, exact coverage, cuts at pauses within 5 s of an even split; spans add the 0.24 s crossfade');

  // ---- 2. refusals ----
  const t301 = TV.talkIssue(301, true); assert.equal(t301?.code, 'too_long'); assert.match(t301!.message, /up to 5 minutes; yours is 5:01/); assert.equal(TV.talkIssue(300, true), null);
  assert.equal(IT.itIssue({ speechSeconds: 120, split: true }), null); assert.match(String(IT.itIssue({ speechSeconds: 120 })), /up to 60 s; yours is 120 s/, 'without split: unchanged');
  assert.match(String(IT.itIssue({ speechSeconds: 301, split: '1' })), /up to 5 minutes/);
  ok('refusals: 301 s too_long with split; 120 s fine with split, refused without (the old line)');

  // ---- 3. price ----
  assert.equal(IT.itBillSeconds({ speechSeconds: 10, split: true }), IT.itBillSeconds({ speechSeconds: 10 }), '≤ 60 s: as before');
  const b120 = IT.itBillSeconds({ speechSeconds: 120, split: true }); assert.equal(b120, IT.talkRenderSeconds(120)); assert.ok(b120 >= 120 && b120 < 150, String(b120));
  assert.ok(IT.itBillSeconds({ speechSeconds: 300, split: true }) > b120);
  { const Fastify = (await import('fastify')).default; const app = Fastify(); (await import('../src/routesBatch1.ts')).registerBatch1(app); (await import('../src/routing/http.ts')).registerRouting(app); await app.ready();
    const q = (x: Record<string, string>) => app.inject({ url: `/api/tools/voice/price?${new URLSearchParams({ provider: IT.IT_PROVIDER, route: IT.IT_ROUTE, types: '["lipsync"]', mode: 'lipsync', image: '1', speech: '1', ...x })}` });
    assert.match((await q({ speechSeconds: '120' })).body, /up to 60 s/); const ok120 = (await q({ speechSeconds: '120', split: '1' })).json(); assert.ok(!/up to 60 s/.test(JSON.stringify(ok120)), 'split=1: no refusal');
    assert.match((await q({ speechSeconds: '301', split: '1' })).body, /up to 5 minutes/); await app.close(); }
  ok(`price: split prices every part (120 s = ${b120} rendered s); ≤ 60 s unchanged; quote endpoint takes split=1 and refuses 301 s`);

  // ---- 4. parse ----
  const tool = getTool('voice')!; ff('-f', 'lavfi', '-i', 'color=c=gray:size=720x1280', '-frames:v', '1', path.join(D, 'face.png'));
  // 70 s: tone, with a 0.6 s pause around 33 s (the mark is 35 s)
  ff('-f', 'lavfi', '-i', 'sine=frequency=220:duration=32.7', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=36.7',
    '-filter_complex', '[1:a]atrim=duration=0.6[s];[0:a][s][2:a]concat=n=3:v=0:a=1[a]', '-map', '[a]', '-ar', '44100', path.join(D, 'long.wav'));
  const base = { provider: IT.IT_PROVIDER, types: '["lipsync"]', prompt: 'a teacher' };
  const r: any = await tool.parseInput({ ...base, split: '1' }, { image: ['face.png'], speech: ['long.wav'] }); assert.ok(!r.error, r.error);
  assert.equal(r.talkParts.length, 2); assert.ok(Math.abs(r.talkParts[0].end - 33) < 0.2, `cut at the pause: ${r.talkParts[0].end}`); covers(r.talkParts, r.speechSeconds);
  assert.ok(Math.abs(dur(r.talkParts[0].path) - (r.talkParts[0].end + TV.TV_FADE)) < 0.05, 'part 1 = its span + the crossfade'); assert.ok(Math.abs(dur(r.talkParts[1].path) - (r.talkParts[1].end - r.talkParts[1].start)) < 0.05);
  assert.ok(r.warnings.some((w: string) => /2 parts/.test(w))); assert.equal(r.split, true);
  const noSplit: any = await tool.parseInput(base, { image: ['face.png'], speech: ['long.wav'] }); assert.equal(noSplit.issues[0].code, 'too_long');
  const none: any = await tool.parseInput(base, { image: ['face.png'] }); assert.equal(none.issues[0].field, 'speech'); assert.equal(none.issues[0].code, 'required'); assert.match(none.error, /speech audio or type a script/);
  const scriptOnly: any = await tool.parseInput({ ...base, script: 'Hello there.' }, { image: ['face.png'] }); assert.equal(scriptOnly.issues[0].field, 'speech'); assert.match(scriptOnly.error, /voice from your script first/);
  ff('-f', 'lavfi', '-i', 'sine=frequency=220:duration=5', path.join(D, 'five.wav'));
  const both: any = await tool.parseInput({ ...base, script: 'Hello there.' }, { image: ['face.png'], speech: ['five.wav'] }); assert.ok(!both.error); assert.ok(both.warnings.some((w: string) => /script was not read/.test(w)));
  const huge: any = await tool.parseInput({ ...base, script: 'a'.repeat(2001) }, { image: ['face.png'], speech: ['five.wav'] }); assert.equal(huge.issues[0].field, 'script');
  assert.deepEqual(parseSilences('[silencedetect @ 0x1] silence_start: 32.7\n[silencedetect @ 0x1] silence_end: 33.3 | silence_duration: 0.6\nsilence_start: 60'), [33]);
  ok('parse: 70 s + split → 2 parts cut at the 33 s pause, a WAV per part (+0.24 s); no split → refused; none / script-only → speech required; both → the file wins; 2,001-char script refused');

  // ---- 5. plan + join ----
  const plan = buildCloudPlan({ id: 'tv1', toolId: 'voice', provider: IT.IT_PROVIDER, input: { ...r, seed: 4242 } });
  assert.equal(plan.passes.length, 2); assert.equal(plan.post.kind, 'talkJoin'); assert.equal((plan.post as any).audio, r.itSpeechPath, 'the full speech is the sound');
  for (const [k, p] of plan.passes.entries()) { assert.deepEqual(checkCloudGraph(p.graph, OI).errors, [], p.label); assert.equal(p.expect.seed, 4242, 'same seed'); assert.equal(p.graph['2'].inputs.audio.__file, r.talkParts[k].path); assert.equal(p.graph['1'].inputs.image.__file, r.imagePath, 'same photo'); }
  assert.throws(() => buildCloudPlan({ id: 'tv2', toolId: 'voice', provider: IT.IT_PROVIDER, input: { ...r, talkParts: undefined } }), /not split/);
  const P = [{ start: 0, end: 4 }, { start: 4, end: 9 }, { start: 9, end: 12 }]; const spans = TV.talkPartSpans(P, 12); const clips = spans.map((s, k) => { const f = path.join(D, `c${k}.mp4`);
    ff('-f', 'lavfi', '-i', `color=c=red:size=480x832:rate=25:duration=${(s.end - s.start).toFixed(2)}`, '-pix_fmt', 'yuv420p', f); return f; });
  ff('-f', 'lavfi', '-i', 'sine=frequency=220:duration=12', path.join(D, 'a.wav')); execFileSync('ffmpeg', IT.talkJoinArgs(clips, P, path.join(D, 'a.wav'), path.join(D, 'out.mp4')));
  assert.ok(Math.abs(dur(path.join(D, 'out.mp4')) - 12) < 0.05, 'joined clip = the speech length');
  ok('plan: one Cloud-valid pass per part (same photo, seed, its own speech), joined over the full speech; an unsplit long job is refused; the join makes 12.00 s from 3 parts');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
