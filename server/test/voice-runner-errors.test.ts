// Unit: a broken voice runner (server/py/voice_runner.py) fails the job, never the API (2026-10-27).
// A runner that exits before reading its input used to throw EPIPE on the child's stdin with no listener; a translate job's transcribe /
// translate step failing must end as a plain job error with the runner's own words. No ComfyUI is reached (prep runs before any upload).
// Run: npx tsx test/voice-runner-errors.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'vre-'));
process.env.OPENHIGGSFIELD_DATA_DIR ??= path.join(D, 'data');
let finished = false; process.on('exit', () => { if (!finished) { console.error('voice-runner-errors: a runner promise never settled (the job would hang)'); process.exitCode = 1; } });
let uncaught: unknown = null; process.on('uncaughtException', (e) => { uncaught = e; }); process.on('unhandledRejection', (e) => { uncaught = e; });
// fake runners: exits at once without reading stdin; exits 0 with no JSON; prints an error and exits 1
const quick = path.join(D, 'quick.sh'); fs.writeFileSync(quick, '#!/bin/sh\nexit 3\n', { mode: 0o755 });
const nojson = path.join(D, 'nojson.sh'); fs.writeFileSync(nojson, '#!/bin/sh\necho hello\n', { mode: 0o755 });
const loud = path.join(D, 'loud.sh'); fs.writeFileSync(loud, '#!/bin/sh\necho "RuntimeError: model files missing" >&2\nexit 1\n', { mode: 0o755 });
const { translateLocal, transcribe } = await import('../src/voiceRunner.js');
const { runNativeSafe } = await import('../src/comfy/runNative.js');
const tick = () => new Promise((r) => setTimeout(r, 200));

process.env.OPENHIGGSFIELD_PY = quick; // 2 MB on stdin to a runner that never reads it: EPIPE
await assert.rejects(translateLocal('word '.repeat(400_000), 'en', 'es'), /voice runner failed: exit 3/); await tick();
assert.equal(uncaught, null, `EPIPE escaped: ${uncaught}`);
process.env.OPENHIGGSFIELD_PY = nojson; await assert.rejects(transcribe('/nope.wav'), /returned no JSON/);
process.env.OPENHIGGSFIELD_PY = loud; await assert.rejects(transcribe('/nope.wav'), /model files missing/);
process.env.OPENHIGGSFIELD_PY = path.join(D, 'missing-python'); await assert.rejects(transcribe('/nope.wav'), /not installed/);
console.log('ok voiceRunner: early exit, no JSON, stderr, missing python all reject (no EPIPE crash)');

// translate job on the native path: the prep fails → job failed with the runner's words, not "ComfyUI run failed", nothing thrown
const mp4 = path.join(D, 'clip.mp4'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=24', '-f', 'lavfi', '-i', 'sine=d=2', '-t', '2', '-pix_fmt', 'yuv420p', '-shortest', mp4]);
for (const [provider, py, re] of [['local-whisper-nllb-chatterbox', loud, /model files missing/], ['local-whisper-nllb-f5', quick, /exit 3/]] as const) {
  process.env.OPENHIGGSFIELD_PY = py;
  const job: any = { id: `vre-${provider}`, toolId: 'voice', provider, status: 'queued', outputs: [], input: { mode: 'translate', types: ['translate'], videoPath: mp4, language: 'es' } };
  await runNativeSafe(job); await tick();
  assert.equal(job.status, 'failed', provider); assert.match(job.error, re, provider); assert.doesNotMatch(job.error, /ComfyUI/, provider);
  assert.equal(job.requestIds, undefined, `${provider}: nothing was submitted`);
}
assert.equal(uncaught, null, `escaped: ${uncaught}`);
console.log('ok translate prep failure = job error (both translate routes), process alive');
fs.rmSync(D, { recursive: true, force: true });
finished = true; console.log('voice-runner-errors: all ok');
