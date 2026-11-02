// Clip trimmer (2026-11-03): clipTrim.ts. One range rule per tool and model (clipTrimLimits, listed per model in GET /api/tools providers[].clipSec),
// every tool with a clip takes trimStart / trimEnd (withClipTrim) through the one cut (tools/videoSwap.ts applySwapTrim), billed as the range.
//  1. limits: H3 Character Swap 2–15 s, Kling edit 4–30 s, Reframe 4–10 s, LTX-2.5 Extend 1–60 s, Swap Two People 2–15 s, an app takes its base tool's.
//  2. every registered tool with a clip file input takes trimStart / trimEnd.
//  3. applySwapTrim with a model's limits (2 s ok on H3, 16 s refused), a second cut on the same files is a no-op, a cut file handed on is kept.
//  4. a wrapped tool (Reframe): the clip is cut to the range, the job's seconds are the range's (quote = charge).
// Run: npx tsx test/clip-trim.test.ts
import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cliptrim-')); const DATA = fs.mkdtempSync(path.join(D, 'data-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_BACKEND: 'mock', COMFY_API_KEY: '' });
const ok = (m: string) => console.log('ok ' + m);
const at = (n: string) => path.join(DATA, n);
const durOf = (f: string) => Number(JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', f]).toString()).format.duration);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=854x480:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=16', '-t', '16', '-pix_fmt', 'yuv420p', '-shortest', at('clip16.mp4')]);

const R = await import('../src/tools/registry.ts'); const C = await import('../src/clipTrim.ts'); const { applySwapTrim } = await import('../src/tools/videoSwap.ts');
// ---------------- 1. limits ----------------
{
  assert.deepEqual(C.clipTrimLimits('object-swap', 'comfy-h3-charswap'), { min: 2, max: 15 });
  assert.deepEqual(C.clipTrimLimits('object-swap', 'router-kling-edit'), { min: 4, max: 30 });
  assert.deepEqual(C.clipTrimLimits('reframe', 'auto-reframe'), { min: 4, max: 10 });
  assert.deepEqual(C.clipTrimLimits('h3-extend', 'comfy-ltx25-extend'), { min: 1, max: 60 });
  assert.deepEqual(C.clipTrimLimits('two-person-swap', 'cloud-h3-two-swap'), { min: 2, max: 15 });
  assert.deepEqual(C.clipTrimLimits('upscale', 'direct-flux3-upscale'), { min: 4, max: 20 });
  assert.deepEqual(C.clipTrimLimits('object-swap'), { min: 4, max: 30 }, 'no model: the shared upload limits');
  assert.deepEqual(C.clipTrimLimits('prompt-edit', 'cloud-bernini-r'), { min: 1, max: 5 }); assert.deepEqual(C.clipTrimLimits('prompt-edit', 'cloud-kling4-edit'), { min: 3, max: 30 });
  assert.deepEqual(C.clipTrimLimits('finish', 'local-finish'), { min: 1, max: 20 }); assert.deepEqual(C.clipTrimLimits('footage-fx', 'comfy-ltx25-iclora'), { min: 1, max: 5 });
  assert.deepEqual(C.clipTrimLimits('reshoot', 'cloud-h3-crossview'), { min: 4, max: 15 });
  const app = R.getTool('app-video-upscale')!; assert.equal(C.trimToolId(app as any), 'upscale'); assert.deepEqual(C.clipTrimLimits(C.trimToolId(app as any), 'cloud-topaz-astra2'), { min: 4, max: 30 }, 'an app takes its base tool\'s rule');
  ok('limits: H3 2–15, Kling 4–30, Reframe 4–10, LTX Extend 1–60, Swap Two People 2–15, FLUX upscale ≤ 20, default 4–30, apps follow their base');
}
// ---------------- 2. every tool with a clip takes a range ----------------
{
  const clip = R.listTools().filter((t) => t.inputs.some((i) => i.name === 'video' && i.kind === 'file'));
  assert.ok(clip.length >= 15, `tools with a clip: ${clip.length}`);
  for (const t of clip) assert.ok(t.inputs.some((i) => i.name === 'trimStart') && t.inputs.some((i) => i.name === 'trimEnd'), `${t.id} takes trimStart / trimEnd`);
  for (const id of ['object-swap', 'motion-transfer', 'reframe', 'upscale', 'h3-extend', 'prompt-edit', 'reshoot', 'app-video-upscale']) assert.ok(clip.some((t) => t.id === id), `${id} has a clip`);
  ok(`every tool with a clip takes the range (${clip.length} tools)`);
}
// ---------------- 3. the cut ----------------
{
  fs.copyFileSync(at('clip16.mp4'), at('a.mp4'));
  const two: Record<string, string[]> = { video: ['a.mp4'] }; assert.deepEqual(await applySwapTrim({ trimStart: '3', trimEnd: '5' }, two, { min: 2, max: 15 }), { trim: { start: 3, end: 5 } });
  assert.ok(Math.abs(durOf(at(two.video[0])) - 2) < 0.15, '2 s cut');
  const again = await applySwapTrim({ trimStart: '3', trimEnd: '5' }, two, { min: 2, max: 15 }); assert.deepEqual(again, { trim: { start: 3, end: 5 } }); assert.match(two.video[0], /-range-300-500\.mp4$/, 'cut once');
  const handed: Record<string, string[]> = { video: [two.video[0]] }; assert.deepEqual(await applySwapTrim({ trimStart: '3', trimEnd: '5' }, handed, { min: 2, max: 15 }), { trim: { start: 3, end: 5 } }, 'a cut file handed on (app → base) is not cut again');
  const long = await applySwapTrim({ trimStart: '0', trimEnd: '16' }, { video: ['a.mp4'] }, { min: 2, max: 15 }) as any; assert.match(long.error, /at most 15 s/);
  const short = await applySwapTrim({ trimStart: '0', trimEnd: '1' }, { video: ['a.mp4'] }, { min: 2, max: 15 }) as any; assert.match(short.error, /at least 2 s/);
  assert.deepEqual(await applySwapTrim({ trimStart: '0', trimEnd: '2' }, { video: ['photo.png'] }), { trim: null }, 'a photo has no range (Re-shoot)');
  ok('cut: model limits (2 s ok, 16 s / 1 s refused on H3), once per files, a cut file handed on is kept, a photo is skipped');
}
// ---------------- 4. a wrapped tool ----------------
{
  fs.copyFileSync(at('clip16.mp4'), at('b.mp4'));
  const t = R.getTool('reframe')!; const files: Record<string, string[]> = { video: ['b.mp4'] };
  const r: any = await t.parseInput({ trimStart: '3', trimEnd: '10', provider: 'auto-reframe', aspect: '9:16' }, files);
  assert.ok(!('error' in r), JSON.stringify(r).slice(0, 300)); assert.deepEqual(r.trim, { start: 3, end: 10 }); assert.equal(r.duration, 7, 'billed seconds = the range');
  assert.match(files.video[0], /-range-300-1000\.mp4$/);
  const over: any = await t.parseInput({ trimStart: '0', trimEnd: '12', provider: 'auto-reframe', aspect: '9:16' }, { video: ['b.mp4'] }); assert.match(over.error, /at most 10 s/);
  const whole: any = await t.parseInput({ provider: 'auto-reframe', aspect: '9:16' }, { video: ['b.mp4'] }); assert.ok('error' in whole, 'no range: a 16 s clip is still refused by Reframe (4–10 s), as before');
  ok('wrapped tool: Reframe cuts 3–10 s, bills 7 s; 12 s refused on its 10 s rule; no range → unchanged');
}
// ---------------- 5. shot cuts ----------------
{
  const K = await import('../src/clipCuts.ts');
  // the rule: a lone high score is a cut; a busy stretch (every frame high) is not; the frame right after a cut is not a second one
  const rows = (o: Record<number, number>, base = 0.03, n = 96) => Array.from({ length: n }, (_, i) => ({ t: i / 24, s: o[i] ?? base }));
  assert.deepEqual(K.cutsFromScores(rows({ 40: 0.45, 41: 0.14 })), [40 / 24].map((t) => Math.round(t * 1000) / 1000));
  assert.deepEqual(K.cutsFromScores(rows({ 40: 0.2 }, 0.09)), [], 'a camera move: the neighbours score high too');
  assert.deepEqual(K.cutsFromScores(rows({ 40: 0.13 })), [], 'under the floor');
  // a real clip: three shots (two colour test patterns and a moving one), cut at 2 s and 4 s
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24:duration=2', '-f', 'lavfi', '-i', 'smptebars=size=640x360:rate=24:duration=2', '-f', 'lavfi', '-i', 'mandelbrot=size=640x360:rate=24', '-filter_complex', '[2:v]trim=duration=2,setpts=PTS-STARTPTS[m];[0:v][1:v][m]concat=n=3:v=1[v]', '-map', '[v]', '-pix_fmt', 'yuv420p', at('shots.mp4')]);
  const cuts = await K.clipCuts(at('shots.mp4')); assert.equal(cuts.length, 2, JSON.stringify(cuts)); assert.ok(Math.abs(cuts[0] - 2) < 0.1 && Math.abs(cuts[1] - 4) < 0.1, JSON.stringify(cuts));
  assert.equal(await K.clipCuts(at('shots.mp4')), await K.clipCuts(at('shots.mp4')), 'cached per file');
  assert.deepEqual(await K.clipCuts(at('clip16.mp4')), [], 'one continuous shot: no cuts');
  ok('shot cuts: score rule (lone peak, camera move, floor), a three-shot clip cut at 2 s and 4 s, cached, a continuous clip has none');
}
console.log('clip-trim: all ok');
process.exit(0);
