// Keep-awake while a job runs on the user's own ComfyUI (server/src/keepAwake.ts), with the process spawner mocked (nothing is started for real):
// one helper for overlapping jobs, stopped after the last; released on a crash and on cancel (runNativeSafe, resumeNative); per-platform commands;
// no-op where unsupported or when the helper is missing; OPENHIGGSFIELD_KEEP_AWAKE=0 turns it off.
// Run: npx tsx test/keep-awake.test.ts
import assert from 'node:assert/strict'; import { EventEmitter } from 'node:events'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'keepawake-')); process.env.OPENHIGGSFIELD_DATA_DIR = D; process.env.OPENHIGGSFIELD_FILMING_FILE = path.join(D, 'nofilm.json');
process.env.COMFY_BASE_URL = 'http://127.0.0.1:9'; delete process.env.OPENHIGGSFIELD_KEEP_AWAKE;
const ok = (m: string) => console.log('ok ' + m);
const K = await import('../src/keepAwake.ts');
type Fake = EventEmitter & { pid: number; killed: boolean; kill: () => boolean; unref: () => void; cmd: string; args: string[] };
const spawned: Fake[] = [];
const spawn = ((cmd: string, args: string[]) => { const p = new EventEmitter() as Fake; Object.assign(p, { pid: 0, killed: false, cmd, args, unref() {}, kill() { p.killed = true; setImmediate(() => p.emit('exit', 0)); return true; } }); spawned.push(p); return p; }) as any;
K.setKeepAwakeDeps({ spawn, platform: 'darwin' });
const live = () => spawned.filter((p) => !p.killed);
try {
  // overlapping jobs: one helper; stops only after the last; a double release is harmless
  { const a = K.holdAwake(); const b = K.holdAwake(); assert.equal(spawned.length, 1, 'started once'); assert.equal(spawned[0].cmd, 'caffeinate'); assert.deepEqual(spawned[0].args, ['-i', '-w', String(process.pid)]);
    a(); a(); assert.equal(live().length, 1, 'still held by b'); b(); assert.equal(live().length, 0, 'stopped after the last'); assert.deepEqual(K.keepAwakeState().holds, 0);
    const c = K.holdAwake(); assert.equal(spawned.length, 2, 'a new job starts it again'); c(); ok('overlapping jobs: one caffeinate -i -w <pid>, stopped after the last job; a second release is a no-op'); }
  // off switch
  { process.env.OPENHIGGSFIELD_KEEP_AWAKE = '0'; const n = spawned.length; const r = K.holdAwake(); r(); assert.equal(spawned.length, n); delete process.env.OPENHIGGSFIELD_KEEP_AWAKE; ok('OPENHIGGSFIELD_KEEP_AWAKE=0: nothing started'); }
  // platforms
  { assert.equal(K.keepAwakeCommand('win32', 42)?.cmd, 'powershell.exe'); assert.match(K.keepAwakeCommand('win32', 42)!.args.at(-1)!, /SetThreadExecutionState\(0x80000001\).*Get-Process -Id 42/);
    const l = K.keepAwakeCommand('linux', 42)!; assert.equal(l.cmd, 'systemd-inhibit'); assert.ok(l.args.includes('--what=idle:sleep')); assert.match(l.args.at(-1)!, /kill -0 42/);
    assert.equal(K.keepAwakeCommand('freebsd', 42), null);
    K.setKeepAwakeDeps({ platform: 'freebsd' }); const n = spawned.length; const r = K.holdAwake(); assert.equal(spawned.length, n, 'unsupported: no-op'); r();
    // helper missing (spawn error, e.g. no systemd-inhibit): skipped quietly, nothing thrown
    K.setKeepAwakeDeps({ platform: 'linux' }); const r2 = K.holdAwake(); const miss = spawned.at(-1)!; miss.emit('error', new Error('ENOENT')); miss.killed = true; /* never started */ assert.equal(K.keepAwakeState().active, false); r2();
    K.setKeepAwakeDeps({ platform: 'darwin' }); ok('Windows PowerShell SetThreadExecutionState, Linux systemd-inhibit, others no-op; a missing helper is skipped quietly'); }
  // released when a local job crashes or is cancelled (the real hooks)
  { const R = await import('../src/comfy/runNative.ts'); const n = spawned.length;
    const job: any = { id: 'kc', status: 'queued', toolId: 'no-such-tool', input: {}, outputs: [], warnings: [], route: 'local:x' };
    await R.runNativeSafe(job); assert.equal(job.status, 'failed'); assert.equal(spawned.length, n + 1, 'held while it ran'); assert.equal(live().length, 0, 'released after the crash'); assert.equal(K.keepAwakeState().holds, 0);
    const RS = await import('../src/comfy/resume.ts');
    const cj: any = { id: 'kr', status: 'canceled', input: {}, outputs: [], comfyPrompt: { id: 'p', base: 'http://127.0.0.1:9', pass: 0, passes: 1, outputs: ['9'], labels: ['R'], resumable: true, submittedAt: 0 } };
    await RS.resumeNative(cj); assert.equal(live().length, 0, 'released after cancel'); assert.equal(K.keepAwakeState().holds, 0); ok('a crashed local run and a cancelled reconnected run release the hold'); }
} finally { fs.rmSync(D, { recursive: true, force: true }); }
console.log('ALL OK keep-awake'); process.exit(0);
