/** Add sound (one-click soundtrack, MMAudio): short / small clips are accepted, long clips are scored in ≤ 8 s parts and joined, the mix choice
 *  reaches the mux. Run: npx tsx test/add-sound.test.ts */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { DATA_DIR } from '../src/config.js';
import '../src/tools/registry.js';
import { getTool } from '../src/tools/registry.js';
import { buildPlan, hasPlan } from '../src/comfy/plans.js';
import { mmaudioParts } from '../src/shared/mmaudioParts.js';
import { runNative } from '../src/comfy/runNative.js';
import { probeOutput } from '../src/outputMeta.js';
import { blockedReason, canAddSound, mixQuestion, soundPlan } from '../../web/src/shared/addSoundLogic.js';
mkdirSync(DATA_DIR, { recursive: true });
const clip = (name: string, size: string, secs: number, audio: boolean) => execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=24:duration=${secs}`,
  ...(audio ? ['-f', 'lavfi', '-i', `sine=duration=${secs}`, '-shortest'] : []), '-pix_fmt', 'yuv420p', path.join(DATA_DIR, name)]);
clip('as-short.mp4', '640x360', 2, false); clip('as-long.mp4', '1280x720', 25, true); clip('as-mid.mp4', '1280x720', 9, true);
let ok = 0; const t = async (n: string, fn: () => unknown) => { await fn(); ok++; console.log('ok', n); };
const parse = (f: Record<string, string>, video: string) => getTool('soundtrack')!.parseInput({ rights: '1', seed: '7', types: '["v2s"]', provider: 'comfy-mmaudio', ...f }, { video: [video] }) as Promise<any>;
const job = (input: any) => ({ id: 'ast', toolId: 'soundtrack', provider: 'comfy-mmaudio', input }) as any;

await t('parts rule', () => {
  assert.deepEqual(mmaudioParts(6), [{ start: 0, seconds: 6 }]); assert.equal(mmaudioParts(10).length, 1);
  const p = mmaudioParts(25); assert.equal(p.length, 4); assert.ok(p.every((x) => x.seconds <= 8)); assert.equal(Math.round(p.reduce((a, x) => a + x.seconds, 0) * 100) / 100, 25);
  assert.equal(p[3].start + p[3].seconds, 25);
});
await t('a 2 s 640×360 clip is accepted (sound only: any size, from 1 s), no prompt needed', async () => {
  const i = await parse({}, 'as-short.mp4'); assert.ok(!i.error, i.error); assert.equal(i.hasAudio, false);
  const p = buildPlan(job(i)); assert.equal(p.passes.length, 1); assert.equal(p.post.kind, 'each'); assert.equal(p.passes[0].graph['5'].inputs.duration, 2);
  const pr0 = p.passes[0].prep![0] as any; assert.equal(pr0.kind, 'fps'); assert.equal(pr0.fps, 25); assert.equal(p.passes[0].graph['1'].inputs.file.__file, pr0.out); // re-timed to 25 fps (the sampler reads frames as 25 fps)
  assert.equal(p.muxOnto?.mix, 'replace'); // no sound to mix with → replace
});
await t('Mix with original reaches the mux when the clip has sound; prompt goes to the sampler', async () => {
  const i = await parse({ mix: 'blend', prompt: 'rain and distant thunder' }, 'as-mid.mp4'); assert.ok(!i.error, i.error);
  const p = buildPlan(job(i)); assert.equal(p.passes.length, 1); assert.equal(p.muxOnto?.mix, 'blend'); assert.equal(p.passes[0].graph['5'].inputs.prompt, 'rain and distant thunder');
});
await t('a 25 s clip: 4 parts cut with ffmpeg, small frames, audio joined (audioConcat), a note says so', async () => {
  const i = await parse({}, 'as-long.mp4'); assert.ok(!i.error, i.error); assert.ok(hasPlan(job(i)));
  const p = buildPlan(job(i)); assert.equal(p.passes.length, 4); assert.equal(p.post.kind, 'audioConcat'); assert.match(p.notes[0], /4 parts/);
  for (const [k, x] of p.passes.entries()) { const pr = x.prep![0] as any; assert.equal(pr.kind, 'fps'); assert.equal(pr.height, 384); assert.equal(pr.width % 2, 0);
    assert.equal(x.graph['1'].inputs.file.__file, pr.out); assert.equal(x.graph['5'].inputs.duration, pr.seconds); assert.equal(x.graph['5'].inputs.seed, p.passes[0].graph['5'].inputs.seed); assert.equal(pr.start, mmaudioParts(25)[k].start); }
});
await t('a 35 s clip is trimmed to 30 s with a warning', async () => {
  clip('as-35.mp4', '854x480', 35, false); const i = await parse({}, 'as-35.mp4'); assert.ok(!i.error, i.error); assert.equal(i.duration, 30); assert.match(i.warnings.join(' '), /30 s/);
});
await t('run (fake ComfyUI): 4 audio parts joined into one track, muxed onto the 25 s clip as one video take', async () => {
  const i = await parse({ mix: 'blend' }, 'as-long.mp4'); const j: any = { ...job(i), id: 'ast-run', status: 'queued', outputs: [] }; const sent: any[] = [];
  const fake = { upload: async (f: string) => path.basename(f), run: async (g: any) => { sent.push(g); return { outputs: { '6': [{ filename: 'a.wav' }] } } as any; },
    download: async (_o: any, dest: string) => { const d = Number(sent.at(-1)['5'].inputs.duration); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${200 + sent.length * 100}:duration=${d}`, dest]); return dest; } };
  await runNative(j, fake as any); assert.equal(sent.length, 4); assert.equal(j.status, 'done'); assert.equal(j.outputs.length, 1); assert.match(j.outputs[0].url, /\.mp4$/);
  const f = path.join(DATA_DIR, j.outputs[0].url.slice('/files/'.length)); const probe = (e: string) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', e, '-of', 'csv=p=0', f]).toString();
  assert.match(probe('stream=codec_type'), /video[\s\S]*audio/); assert.ok(Math.abs(Number(probe('format=duration')) - 25) < 0.6, probe('format=duration'));
});
await t('shared rule: where Add sound shows, what the dialog asks, what it says about length', () => {
  const j = { id: 'a', status: 'done', resultUrl: '/files/x.mp4' };
  assert.ok(canAddSound(j)); assert.ok(!canAddSound({ ...j, status: 'running' })); assert.ok(!canAddSound({ ...j, isOwner: false })); assert.ok(!canAddSound({ ...j, deletedAt: 1 }));
  assert.ok(!canAddSound({ ...j, resultUrl: '/files/x.png' })); assert.ok(!canAddSound({ ...j, resultUrl: '/files/x.glb' })); assert.ok(!canAddSound({ ...j, resultUrl: '/samples/x.mp4' }));
  assert.ok(canAddSound(j, '/files/y.mov?v=2')); assert.ok(!canAddSound(null));
  assert.deepEqual(mixQuestion(false).ask, false); assert.equal(mixQuestion(true).ask, true); assert.equal(mixQuestion(undefined).note, null);
  assert.match(blockedReason({ runnable: false, reason: 'MMAudio needs a key.', defaultFallback: { reasonCode: 'local_unreachable' } })!, /ComfyUI isn’t reachable/); assert.equal(blockedReason({ runnable: true }), null);
  assert.equal(soundPlan(1.5).parts, 1); assert.match(soundPlan(45).note, /first 30 s/); assert.equal(soundPlan(45).parts, 4); assert.equal(soundPlan(null).seconds, null);
});
await t('output metadata says whether a clip has sound', async () => {
  const a = await probeOutput('/files/as-mid.mp4'); const b = await probeOutput('/files/as-short.mp4'); assert.equal(a.hasAudio, true); assert.equal(b.hasAudio, false);
});
console.log(`add-sound: ${ok} ok`);
