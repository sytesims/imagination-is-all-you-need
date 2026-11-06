// OPENHIGGSFIELD_MOCK_REPLAY_DIR (tools/shared.ts mockRun): on the mock backend each output is a real file from the folder instead of the drawn sample.
//  a  unset: the usual sample (no replay)
//  b  4 image jobs started together get image files 1, 2, 3, 4 (sorted by name), then it wraps; videos and sounds are never picked for images
//  c  a video job gets the video file, an audio job the sound (by kind, own round-robin)
//  d  a folder with no file of that kind, or a missing folder: the usual sample, job still done and marked simulated
// Run: npx tsx test/mock-replay.test.ts (mock backend, needs ffmpeg on PATH)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const ok = (m: string) => console.log('ok ' + m);
process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-replay-'));
process.env.OPENHIGGSFIELD_DATA_DIR ??= path.join(D, 'data'); fs.mkdirSync(process.env.OPENHIGGSFIELD_DATA_DIR, { recursive: true });
process.env.OPENHIGGSFIELD_MOCK_DELAY_MS = '1';
const R = path.join(D, 'replay'); fs.mkdirSync(R);
const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const COLORS = ['red', 'green', 'blue', 'yellow'];
COLORS.forEach((c, k) => ff(['-f', 'lavfi', '-i', `color=c=${c}:s=${16 + k * 2}x16`, '-frames:v', '1', path.join(R, `${k + 1}-${c}.png`)])); // widths 16, 18, 20, 22 tell them apart
ff(['-f', 'lavfi', '-i', 'color=c=white:s=48x32:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(R, 'clip.mp4')]);
ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', path.join(R, 'tone.wav')]);

const { mockRun, reserveReplayFiles } = await import('../src/tools/shared.js');
const { DATA_DIR } = await import('../src/config.js');
let n = 0;
const job = (input: Record<string, any>): any => ({ id: `mr-${++n}`, toolId: 'image', input: { prompt: 'x', aspect: '1:1', ...input }, status: 'queued', stage: 'queued', progress: 0, queuePos: 0, eta: 0, outputs: [] });
const width = (url: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width', '-of', 'csv=p=0', path.join(DATA_DIR, url.replace('/files/', ''))]).toString().trim());
const run = async (j: any, labels = ['Result']) => { await mockRun(j, [['rendering', 'Rendering']], labels, 1); assert.equal(j.status, 'done', j.error); assert.equal(j.simulated, true); return j; };

// a  unset
delete process.env.OPENHIGGSFIELD_MOCK_REPLAY_DIR;
assert.deepEqual(await reserveReplayFiles(job({ outKind: 'image' }), 4), []);
{ const j = await run(job({ outKind: 'image' })); assert.notEqual(width(j.outputs[0].url), 16); }
ok('a unset: drawn sample');

// b  4 image jobs together → 1, 2, 3, 4; next wraps to 1
process.env.OPENHIGGSFIELD_MOCK_REPLAY_DIR = R;
const four = await Promise.all([0, 1, 2, 3].map(() => run(job({ outKind: 'image' }))));
assert.deepEqual(four.map((j) => width(j.outputs[0].url)), [16, 18, 20, 22]);
{ const j = await run(job({ outKind: 'image' }), ['A', 'B']); assert.deepEqual(j.outputs.map((o: any) => width(o.url)), [16, 18]); }
ok('b images round-robin by name across parallel jobs, then wrap');

// c  by kind
{ const v = await run(job({ outKind: 'av-video', duration: 2 })); assert.equal(width(v.outputs[0].url), 48); assert.match(v.outputs[0].url, /\.mp4$/);
  const a = await run(job({ outKind: 'audio', duration: 2 })); assert.match(a.outputs[0].url, /\.m4a$/);
  assert.deepEqual(await reserveReplayFiles(job({ outKind: 'audio' }), 1), [path.join(R, 'tone.wav')]); }
ok('c video and audio jobs get their own kind');

// d  no file of that kind / missing folder → usual sample
const E = path.join(D, 'only-images'); fs.mkdirSync(E); fs.copyFileSync(path.join(R, '1-red.png'), path.join(E, '1-red.png'));
process.env.OPENHIGGSFIELD_MOCK_REPLAY_DIR = E;
assert.deepEqual(await reserveReplayFiles(job({ outKind: 'audio' }), 1), []);
await run(job({ outKind: 'audio', duration: 1 }));
process.env.OPENHIGGSFIELD_MOCK_REPLAY_DIR = path.join(D, 'missing');
assert.deepEqual(await reserveReplayFiles(job({ outKind: 'image' }), 1), []);
{ const j = await run(job({ outKind: 'image' })); assert.notEqual(width(j.outputs[0].url), 16); }
ok('d no matching file or missing folder: usual sample');

fs.rmSync(D, { recursive: true, force: true });
console.log('mock-replay: all ok');
process.exit(0);
