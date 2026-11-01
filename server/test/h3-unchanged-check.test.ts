// Unchanged swap check (Nov 1, comfy/unchangedCheck.ts): an H3 Character Swap that hands back its prepared source keeps the file but gets a plain notice.
//  - detector on small ffmpeg clips: the source re-encoded (other quality, sound added, padded longer) → unchanged; a big moving box over half the
//    frame at another fps → changed; a different test pattern → changed; a clip too short to judge, or a missing file → null (fail open)
//  - runNative with a fake transport: the notice lands on job.warnings (with the mask-preview line when previews were saved), the job is still done
//    with its output; a changed result or a failed check adds nothing
//  - plan: Person swap compares with its 24 fps prepared source; motion transfer is not checked
// Run: npx tsx test/h3-unchanged-check.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'h3uc-')); Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock' });
const ok = (m: string) => console.log('ok ' + m);
const { editUnchanged, unchangedNotice } = await import('../src/comfy/unchangedCheck.ts');
const { runNative } = await import('../src/comfy/runNative.ts');
const CS = await import('../src/comfy/h3CharSwapCloud.ts');
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
const F = (n: string) => path.join(D, n);
try {
  // source: 3 s at 24 fps, 320×192, with sound (as the server's prep makes it)
  ff('-f', 'lavfi', '-i', 'testsrc2=size=320x192:rate=24:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', F('src.mp4'));
  ff('-i', F('src.mp4'), '-vf', 'tpad=stop_mode=clone:stop_duration=0.5', '-c:v', 'libx264', '-crf', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', F('same.mp4')); // re-encoded, padded, with sound
  ff('-i', F('src.mp4'), '-f', 'lavfi', '-i', 'color=c=red:size=160x192:rate=30', '-filter_complex', "[0:v]fps=30[b];[b][1:v]overlay=x='80+80*sin(t*3)':y=0:shortest=1", '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', F('box.mp4'));
  ff('-f', 'lavfi', '-i', 'testsrc=size=320x192:rate=24:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', F('other.mp4'));
  ff('-f', 'lavfi', '-i', 'testsrc2=size=320x192:rate=24:duration=0.4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', F('short.mp4'));

  const same = await editUnchanged(F('src.mp4'), F('same.mp4')); assert.equal(same?.unchanged, true, JSON.stringify(same)); assert.ok(same!.frames >= 10);
  const box = await editUnchanged(F('src.mp4'), F('box.mp4')); assert.equal(box?.unchanged, false, JSON.stringify(box)); assert.ok(box!.changedShare > 0.9);
  assert.equal((await editUnchanged(F('src.mp4'), F('other.mp4')))?.unchanged, false);
  ok(`detector: re-encoded source → unchanged (${same!.changedShare} of ${same!.frames} frames changed); moving box / other pattern → changed (${box!.changedShare})`);
  assert.equal(await editUnchanged(F('short.mp4'), F('short.mp4')), null); assert.equal(await editUnchanged(F('src.mp4'), F('missing.mp4')), null);
  ok('too short to judge, or a missing file → null (no notice)');

  // runNative: the notice rides on the done job
  const run = async (result: string, vs: string, diag = false) => {
    const job: any = { id: `j${Math.random().toString(36).slice(2, 8)}`, toolId: 'object-swap', provider: CS.CHARSWAP_CLOUD_PROVIDER, status: 'queued', stage: 'queued', progress: 0, queuePos: 0, eta: 0,
      resultUrl: null, outputs: [], error: null, warnings: [], input: {}, createdAt: Date.now() };
    const t = { upload: async (f: string) => path.basename(f), download: async (_o: any, dest: string) => { fs.copyFileSync(result, dest); return dest; },
      run: async () => ({ promptId: 'p1', outputs: { '30': [{ filename: 'r.mp4' }], ...(diag ? { '73': [{ filename: 'm.mp4' }] } : {}) } }) } as any;
    await runNative(job, t, () => ({ tool: 'object-swap', outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false, labels: ['Character swap'], notes: [],
      passes: [{ label: 'Character swap', workflow: CS.CHARSWAP_CLOUD_GRAPH, graph: {}, output: '30', expect: {}, unchangedVs: vs,
        ...(diag ? { diagnostics: [{ node: '73', label: 'Selection mask (before growth)', stage: 'selection', note: 'n' }] } : {}) }] }) as any);
    return job;
  };
  const a = await run(F('same.mp4'), F('src.mp4'), true);
  assert.equal(a.status, 'done'); assert.equal(a.outputs.length, 1); assert.deepEqual(a.warnings, [unchangedNotice(true)]); assert.match(a.warnings[0], /^The swap came back unchanged: H3 returned your original video/); assert.match(a.warnings[0], /mask previews/);
  assert.deepEqual((await run(F('same.mp4'), F('src.mp4'))).warnings, [unchangedNotice(false)]); assert.doesNotMatch(unchangedNotice(false), /mask/);
  assert.deepEqual((await run(F('box.mp4'), F('src.mp4'))).warnings, []);
  const c = await run(F('same.mp4'), F('missing.mp4')); assert.equal(c.status, 'done'); assert.deepEqual(c.warnings, []);
  ok('runNative: unchanged → done + notice (mask-preview line when saved); changed → nothing; check failed → nothing, still done');

  const job = (input: Record<string, any>, toolId = 'object-swap') => ({ id: 'jx', toolId, provider: CS.CHARSWAP_CLOUD_PROVIDER, input: { videoPath: '/v/in.mp4', refPaths: ['/v/c.png'], duration: 5, width: 1920, height: 1080, target: 'the man', ...input } });
  const p = CS.charswapCloudPlan(job({})).passes[0]; assert.equal(p.unchangedVs, (p.prep![0] as any).out); assert.match(p.unchangedVs!, /charswap24\.mp4$/);
  assert.equal(CS.charswapCloudPlan(job({ charswapMask: 'off' })).passes[0].unchangedVs, p.unchangedVs); // mask-free swaps too (full regeneration passes)
  assert.equal(CS.charswapCloudPlan(job({ mode: 'motion_transfer' })).passes[0].unchangedVs, undefined);
  ok('plan: Person swap (masked or mask-free) compares with its prepared source; motion transfer is not checked');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
