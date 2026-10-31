// The one-line installer (scripts/get.sh): dry runs only, in a scratch HOME. Never clones, installs or starts anything.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/get.sh', import.meta.url));
if (process.platform === 'win32') { console.log('skip get.sh: bash installer (Windows uses get.ps1, checked in CI)'); process.exit(0); }
const home = mkdtempSync(path.join(tmpdir(), 'get installer '));
const run = (args: string[], env: Record<string, string> = {}) => {
  const r = spawnSync('bash', [script, ...args], { encoding: 'utf8', input: '', env: { PATH: process.env.PATH ?? '', HOME: home, ...env } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
try {
  const help = run(['--help']);
  assert.equal(help.code, 0); assert.match(help.out, /--dry-run/); assert.match(help.out, /--no-shortcut/);

  const bad = run(['--nope']);
  assert.equal(bad.code, 1); assert.match(bad.out, /Unknown option: --nope/);

  // a dry run prints every step and changes nothing (no folder, no shortcut)
  const dry = run(['--dry-run', '--yes', '--branch', 'test-branch']);
  assert.equal(dry.code, 0, dry.out);
  for (const step of ['git clone --depth 1 --branch test-branch', 'npm run setup -- --no-start', 'npm run setup -- --open']) assert.ok(dry.out.includes(step), `dry run shows: ${step}`);
  assert.equal(existsSync(path.join(home, 'Imagination')), false);
  assert.equal(existsSync(path.join(home, 'Desktop')), false);

  // a folder that has other files in it is never used
  const other = path.join(home, 'busy'); mkdirSync(other); writeFileSync(path.join(other, 'notes.txt'), 'mine');
  const busy = run(['--dry-run', '--dir', other]);
  assert.equal(busy.code, 1); assert.match(busy.out, /already has other files/);
  assert.equal(readFileSync(path.join(other, 'notes.txt'), 'utf8'), 'mine');

  // an existing install is updated, not cloned again
  const app = path.join(home, 'app'); mkdirSync(path.join(app, '.git'), { recursive: true }); mkdirSync(path.join(app, 'scripts'));
  writeFileSync(path.join(app, 'scripts', 'setup.mjs'), '');
  const again = run(['--dry-run', '--no-start', '--no-shortcut', '--dir', app]);
  assert.equal(again.code, 0, again.out); assert.match(again.out, /npm run update/); assert.doesNotMatch(again.out, /git clone/);

  // the README links to both scripts so people can read them first
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  assert.match(readme, /\(scripts\/get\.sh\)/); assert.match(readme, /\(scripts\/get\.ps1\)/);
  console.log('ok get.sh: help, unknown option, dry run changes nothing, busy folder refused, existing install updated');
} finally {
  rmSync(home, { recursive: true, force: true }); // only this test's scratch folder
}
