// server/scripts/dev.mjs (npm run dev / npm start's API) loads the env file the rest of the app uses: OPENHIGGSFIELD_ENV_FILE when set, else
// <repo>/.env.local. Runs a copied dev.mjs on a stand-in src/index.ts that only prints one fake value; never starts the real server.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = mkdtempSync(path.join(tmpdir(), 'dev env file '));
try {
  mkdirSync(path.join(root, 'scripts')); mkdirSync(path.join(root, 'server', 'scripts'), { recursive: true }); mkdirSync(path.join(root, 'server', 'src'));
  writeFileSync(path.join(root, 'scripts', 'app-env.mjs'), readFileSync(path.join(repo, 'scripts', 'app-env.mjs')));
  writeFileSync(path.join(root, 'server', 'scripts', 'dev.mjs'), readFileSync(path.join(repo, 'server', 'scripts', 'dev.mjs')));
  writeFileSync(path.join(root, 'server', 'src', 'index.ts'), 'console.log(`value=${process.env.IIAYN_TEST_FAKE_VALUE ?? "none"}`);\n');
  symlinkSync(path.join(repo, 'node_modules'), path.join(root, 'node_modules'), 'junction'); // tsx, from the repo's install
  const run = (env: Record<string, string>) => {
    const r = spawnSync(process.execPath, ['scripts/dev.mjs', '--no-watch'], { cwd: path.join(root, 'server'), encoding: 'utf8', timeout: 60_000,
      env: { PATH: process.env.PATH ?? '', HOME: root, ...env } });
    return `${r.stdout}${r.stderr}`;
  };
  // OPENHIGGSFIELD_ENV_FILE: that file (path with spaces), not .env.local
  writeFileSync(path.join(root, '.env.local'), 'IIAYN_TEST_FAKE_VALUE=from-dot-env-local\n');
  const custom = path.join(root, 'my settings.env'); writeFileSync(custom, 'IIAYN_TEST_FAKE_VALUE=from-custom-file\n');
  assert.match(run({ OPENHIGGSFIELD_ENV_FILE: custom }), /value=from-custom-file/);
  // unset: <repo>/.env.local
  assert.match(run({}), /value=from-dot-env-local/);
  // a missing file: one plain line, no Node warning
  const missing = run({ OPENHIGGSFIELD_ENV_FILE: path.join(root, 'nothing here.env') });
  assert.match(missing, /value=none/); assert.match(missing, /No keys file yet \(nothing here\.env\)/); assert.doesNotMatch(missing, /Continuing without it/);
  console.log('ok dev.mjs: OPENHIGGSFIELD_ENV_FILE, then .env.local; a missing file is one plain line');
} finally {
  rmSync(root, { recursive: true, force: true }); // only this test's scratch folder (the node_modules link, not its target)
}
