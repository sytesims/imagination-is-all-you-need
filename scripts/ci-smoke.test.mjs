import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cleanEnvironment, reservePort, runSmoke } from './ci-smoke.mjs';

test('environment whitelist excludes provider keys, Node injection and proxies', () => {
  assert.deepEqual(cleanEnvironment({ Path: 'bin', SystemRoot: 'windows', HOME: 'home', COMFY_API_KEY: 'fixture', UNKNOWN_PROVIDER_TOKEN: 'fixture', NODE_OPTIONS: '--bad', HTTPS_PROXY: 'fixture' }), { Path: 'bin', SystemRoot: 'windows', HOME: 'home' });
});

test('an occupied port fails without changing port or stopping its owner', async () => {
  const port = await reservePort();
  try { await assert.rejects(reservePort(port.port), { code: 'EADDRINUSE' }); }
  finally { await port.release(); }
});

for (const mode of ['ready', 'bad-health', 'early-exit', 'cancel', 'timeout', 'missing-script', 'spawn-error', 'stubborn']) {
  test(`owned child lifecycle: ${mode} (paths with spaces)`, async () => {
    const scratch = await mkdtemp(path.join(tmpdir(), 'ci fixture spaces-'));
    const reservation = await reservePort();
    const port = reservation.port;
    await reservation.release();
    const children = [];
    const controller = new AbortController();
    const file = path.join(scratch, 'fixture server.mjs');
    await writeFile(file, `import http from 'node:http';
      ${mode === 'early-exit' ? 'process.exit(7);' : ''}
      ${mode === 'stubborn' ? "process.on('SIGTERM', () => {});" : ''}
      http.createServer((req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ok:true, backend:${JSON.stringify(mode === 'bad-health' ? 'comfy' : 'mock')}}));
      }).listen(${port}, '127.0.0.1');`);
    try {
      const promise = runSmoke({
        env: cleanEnvironment(), timeoutMs: ['ready', 'early-exit', 'missing-script', 'stubborn'].includes(mode) ? 5000 : 500,
        signal: controller.signal,
        onSpawn: child => { children.push(child); if (mode === 'cancel') controller.abort(new Error('fixture cancellation')); },
        commands: [
          { name: 'fixture', cwd: mode === 'spawn-error' ? path.join(scratch, 'missing directory') : scratch, args: [mode === 'missing-script' ? path.join(scratch, 'missing.mjs') : file] },
          ...(mode === 'cancel' ? [] : [{ name: 'companion', cwd: scratch, args: ['-e', 'setInterval(() => {}, 1000)'] }]),
        ],
        checks: [{ url: `http://127.0.0.1:${port}/`, verify: async response => {
          const body = await response.json();
          assert.equal(body.backend, 'mock');
          if (mode === 'timeout') throw new Error('not ready');
        } }],
      });
      if (mode === 'ready' || mode === 'stubborn') await promise;
      else await assert.rejects(promise, mode === 'early-exit' ? /exited early/ : mode === 'cancel' ? /fixture cancellation/ : mode === 'spawn-error' ? /ENOENT/ : mode === 'missing-script' ? /exited early/ : /deadline/);
      assert.equal(children.length, mode === 'cancel' ? 1 : 2);
      assert.ok(children.every(child => !child.pid || child.exitCode !== null || child.signalCode !== null), 'owned children stopped');
      const reclaimed = await reservePort(port);
      await reclaimed.release();
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
}
