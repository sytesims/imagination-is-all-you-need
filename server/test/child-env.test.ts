// Child processes get no keys (security review 2026-11-07, F7): ffmpeg and the voice runner (and every tool started through
// security/childProcess.ts) run with this process's environment minus every secret variable; PATH and ordinary settings stay.
// A fake ffmpeg (a shell script first on PATH) and a fake voice runner (node) write down the environment they were given.
// Run: npx tsx test/child-env.test.ts (temp dir, fake keys only, nothing real is started).
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ok = (m: string) => console.log('ok ' + m);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'child-env-'));
const SECRETS = { OPENHIGGSFIELD_FAL_KEY: 'fake-fal', COMFY_API_KEY: 'fake-comfy', OPENHIGGSFIELD_HF_TOKEN: 'fake-hf', CIVITAI_TOKEN: 'fake-civ', SOME_SECRET: 'fake-secret', DB_PASSWORD: 'fake-pw' };
Object.assign(process.env, SECRETS, { OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DATA_DIR: dir, CHILD_ENV_PLAIN: 'plain-value' });
const leaked = (names: string[]) => names.filter((n) => n in SECRETS);

// ---- the wrapper itself ----
{ const { spawnSync, execFileSync, childEnv } = await import('../src/security/childProcess.js');
  const dump = "process.stdout.write(JSON.stringify(Object.keys(process.env)))";
  const a = JSON.parse(spawnSync(process.execPath, ['-e', dump], { encoding: 'utf8' }).stdout as string) as string[];
  const b = JSON.parse(execFileSync(process.execPath, ['-e', dump]).toString()) as string[];
  const c = JSON.parse(execFileSync(process.execPath, ['-e', dump], { env: { ...process.env, EXTRA_KEY: 'x', EXTRA_OK: 'y' } }).toString()) as string[];
  for (const names of [a, b, c]) { assert.deepEqual(leaked(names), []); assert.ok(names.includes('PATH') && names.includes('CHILD_ENV_PLAIN')); }
  assert.ok(!c.includes('EXTRA_KEY') && c.includes('EXTRA_OK'), 'an env the caller passes is scrubbed too');
  assert.deepEqual(leaked(Object.keys(childEnv())), []);
  ok('childProcess: spawnSync / execFileSync children get no secret variable (given env scrubbed too); PATH and plain settings stay'); }

// ---- ffmpeg ----
{ const bin = path.join(dir, 'bin'); fs.mkdirSync(bin); const fake = path.join(bin, 'ffmpeg');
  fs.writeFileSync(fake, '#!/bin/sh\nenv > "$1"\n'); fs.chmodSync(fake, 0o755);
  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
  const { runFfmpeg } = await import('../src/ffmpeg.js'); const out = path.join(dir, 'ffmpeg-env.txt');
  assert.equal(await runFfmpeg([out]), 0);
  const names = fs.readFileSync(out, 'utf8').split('\n').map((l) => l.split('=')[0]).filter(Boolean);
  assert.deepEqual(leaked(names), []); assert.ok(names.includes('CHILD_ENV_PLAIN'));
  ok('ffmpeg runs with no key in its environment'); }

// ---- the voice runner ----
{ const runner = path.join(dir, 'runner.mjs');
  fs.writeFileSync(runner, "process.stdout.write(JSON.stringify({ text: JSON.stringify(Object.keys(process.env)), language: 'en' }));\n");
  Object.assign(process.env, { OPENHIGGSFIELD_PY: process.execPath, OPENHIGGSFIELD_VOICE_RUNNER: runner });
  const { transcribe } = await import('../src/voiceRunner.js');
  const names = JSON.parse((await transcribe(path.join(dir, 'none.wav'))).text) as string[];
  assert.deepEqual(leaked(names), []); assert.ok(names.includes('CHILD_ENV_PLAIN'));
  ok('the voice runner (Python and its packages) runs with no key in its environment'); }
