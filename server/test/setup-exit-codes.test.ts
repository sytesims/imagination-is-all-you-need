// npm run setup's exit codes, which the one-line installers and the Mac app read: 0 = ready, 1 = failed (stop), 2 = works, something optional missing.
// Runs a copied setup.mjs with a fake npm and a fake doctor in a scratch folder; never installs or starts anything.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

if (process.platform === 'win32') { console.log('skip setup exit codes: the fake npm is a shell script (Windows runs setup in CI)'); process.exit(0); }
const root = mkdtempSync(path.join(tmpdir(), 'setup exit codes '));
try {
  mkdirSync(path.join(root, 'scripts'));
  for (const f of ['setup.mjs', 'app-env.mjs', 'node-version.mjs']) writeFileSync(path.join(root, 'scripts', f), readFileSync(new URL(`../../scripts/${f}`, import.meta.url)));
  writeFileSync(path.join(root, 'scripts', 'doctor.mjs'), 'process.exit(Number(process.env.FAKE_DOCTOR ?? 0));');
  writeFileSync(path.join(root, 'package-lock.json'), '{}');
  // fake npm: prints a line, then fails (FAKE_NPM=fail) or "installs" the three folders setup checks for
  const bin = path.join(root, 'bin'); mkdirSync(bin);
  writeFileSync(path.join(bin, 'npm'), `#!/bin/sh\necho "fake npm $*"\nif [ "$FAKE_NPM" = fail ]; then echo "npm error code ENOSPC" >&2; exit 1; fi\nfor d in fastify tsx concurrently; do mkdir -p node_modules/$d; done\n`);
  chmodSync(path.join(bin, 'npm'), 0o755);
  const settings = path.join(root, 'none.env'); // ports nobody uses: the "already running?" check finds nothing
  writeFileSync(settings, 'PORT=1\nWEB_PORT=2\n');
  const run = (env: Record<string, string>, args = ['--no-start']) => {
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'setup.mjs'), ...args], { cwd: root, encoding: 'utf8',
      env: { PATH: `${bin}:${process.env.PATH ?? ''}`, HOME: root, OPENHIGGSFIELD_ENV_FILE: settings, ...env } });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const log = path.join(root, 'setup.log');

  // the dependency install fails: exit 1 (never 2, which installers read as "optional"), the log is kept and named
  const failed = run({ FAKE_NPM: 'fail' });
  assert.equal(failed.code, 1, failed.out);
  assert.match(failed.out, /didn't install/); assert.ok(failed.out.includes(log), 'names the log');
  assert.match(readFileSync(log, 'utf8'), /fake npm ci --no-audit --no-fund[\s\S]*ENOSPC/);

  // the install works: the old log goes, the doctor decides
  const installed = run({});
  assert.equal(installed.code, 0, installed.out); assert.equal(existsSync(log), false, 'a log is only kept after a failure');
  assert.ok(existsSync(path.join(root, 'node_modules', 'fastify')));

  // doctor 1 (something required for some features is missing; the app itself starts) → 2; doctor 2 (can't start) → 1
  assert.equal(run({ FAKE_DOCTOR: '1' }).code, 2);
  const cant = run({ FAKE_DOCTOR: '2' });
  assert.equal(cant.code, 1, cant.out); assert.match(cant.out, /can’t start yet/);
  console.log('ok setup exit codes: failed npm → 1 with setup.log; doctor 0/1/2 → 0/2/1');
} finally {
  rmSync(root, { recursive: true, force: true }); // only this test's scratch folder
}
