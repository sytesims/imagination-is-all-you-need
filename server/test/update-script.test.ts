// `npm run update` (scripts/update.mjs): builds a throwaway bare "GitHub" remote, a dev clone that pushes new commits and a user clone
// (with a space in its path) holding server/data and .env.local, then checks: up to date; --check changes nothing; a fast-forward update
// lists the new commits and the new version; local changes and a non-main branch are refused with nothing changed; a zip install gets
// the by-hand steps; ignored files are never touched. Installs are skipped (OPENHIGGSFIELD_UPDATE_SKIP_INSTALL=1).
// Run: npx tsx test/update-script.test.ts   (temp dirs, no network, no ports)
import assert from 'node:assert/strict'; import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ok = (m: string) => console.log('ok ' + m);
const SCRIPT = path.resolve(import.meta.dirname, '../../scripts/update.mjs');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'update-script-'));
/* a clean git config: no signing or hooks from this computer */
const GCFG = path.join(T, 'gitconfig'); fs.writeFileSync(GCFG, '[user]\n\tname = Test\n\temail = test@example.com\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n');
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: GCFG, GIT_CONFIG_NOSYSTEM: '1', OPENHIGGSFIELD_UPDATE_SKIP_INSTALL: '1' };
const git = (cwd: string, ...a: string[]) => { const r = spawnSync('git', a, { cwd, env: ENV, encoding: 'utf8' }); assert.equal(r.status, 0, `git ${a.join(' ')}: ${r.stderr}`); return r.stdout.trim(); };
const write = (dir: string, f: string, s: string) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); };
const pkg = (v: string) => JSON.stringify({ name: 'openhiggsfield', version: v, private: true }, null, 2) + '\n';
const run = (dir: string, ...a: string[]) => { const r = spawnSync(process.execPath, [path.join(dir, 'scripts', 'update.mjs'), ...a], { cwd: dir, env: ENV, encoding: 'utf8' }); return { code: r.status, out: (r.stdout + r.stderr).trim() }; };

// the "GitHub" remote, seeded from a dev clone
const REMOTE = path.join(T, 'remote.git'); git(T, 'init', '--bare', '-b', 'main', REMOTE);
const DEV = path.join(T, 'dev'); git(T, 'clone', '-q', REMOTE, DEV);
write(DEV, 'scripts/update.mjs', fs.readFileSync(SCRIPT, 'utf8'));
write(DEV, 'package.json', pkg('1.0.0')); write(DEV, 'package-lock.json', '{"lockfileVersion":3}\n'); write(DEV, '.gitignore', 'node_modules\nserver/data\n.env.local\n'); write(DEV, 'README.md', 'v1\n');
git(DEV, 'add', '-A'); git(DEV, 'commit', '-qm', 'First version'); git(DEV, 'push', '-q', 'origin', 'main');

// the user's install: a path with a space, their library and keys (ignored files)
const USER = path.join(T, 'my apps', 'imagination'); fs.mkdirSync(path.dirname(USER)); git(T, 'clone', '-q', REMOTE, USER);
write(USER, 'server/data/openhiggsfield.db', 'my library'); write(USER, 'server/data/boards/b1.json', '{"board":1}'); write(USER, '.env.local', 'FAKE_TEST_VALUE=1\n');
const snapshot = () => JSON.stringify(['server/data/openhiggsfield.db', 'server/data/boards/b1.json', '.env.local'].map((f) => [f, fs.readFileSync(path.join(USER, f), 'utf8'), fs.statSync(path.join(USER, f)).mtimeMs]));
const mine = snapshot(); const head = () => git(USER, 'rev-parse', 'HEAD');

// 1. up to date
{ const r = run(USER); assert.equal(r.code, 0, r.out); assert.match(r.out, /You’re up to date \(version 1\.0\.0\)\./); ok('up to date: says so with the version'); console.log(r.out.replace(/^/gm, '    | ')); }

// new commits on GitHub: a version bump and a plain fix
write(DEV, 'package.json', pkg('1.1.0')); git(DEV, 'commit', '-qam', 'Canvas: Ad layout card (#3)');
write(DEV, 'README.md', 'v1.1\n'); git(DEV, 'commit', '-qam', 'Fix: draft cards are no longer see-through');
git(DEV, 'push', '-q', 'origin', 'main');

// 2. --check: reports, changes nothing
{ const before = head(); const r = run(USER, '--check'); assert.equal(r.code, 0, r.out); assert.match(r.out, /An update is available: version 1\.0\.0 → 1\.1\.0 \(2 new changes\)/);
  assert.equal(head(), before); assert.equal(fs.readFileSync(path.join(USER, 'README.md'), 'utf8'), 'v1\n'); ok('--check: update available, nothing changed'); }

// 3. local changes to a tracked file: refused, nothing changed (the edit is kept)
{ write(USER, 'README.md', 'my edit\n'); const before = head(); const r = run(USER); assert.equal(r.code, 1, r.out);
  assert.match(r.out, /You have changes to the app’s own files, so nothing was updated:\n  README\.md/); assert.match(r.out, /git stash/);
  assert.equal(head(), before); assert.equal(fs.readFileSync(path.join(USER, 'README.md'), 'utf8'), 'my edit\n'); ok('local changes: refused, edit kept, nothing pulled');
  console.log(r.out.replace(/^/gm, '    | ')); git(USER, 'checkout', '--', 'README.md'); }

// 4. not on main: refused unless --force-branch
{ git(USER, 'switch', '-q', '-c', 'my-branch'); const before = head(); const r = run(USER); assert.equal(r.code, 1, r.out);
  assert.match(r.out, /You’re on the branch “my-branch”, not main/); assert.match(r.out, /git switch main/); assert.match(r.out, /--force-branch/);
  assert.equal(head(), before); git(USER, 'switch', '-q', 'main'); ok('off main: refused with how to switch'); }

// 5. the update: fast-forward, old → new version, the new commits listed, restart line
//    (npm had rewritten the user's lockfile, as `npm install` does: that's put back, not treated as their changes)
{ write(USER, 'package-lock.json', '{"lockfileVersion":3,"license":"added by npm"}\n');
  const c = run(USER, '--check'); assert.equal(c.code, 0, c.out); assert.match(fs.readFileSync(path.join(USER, 'package-lock.json'), 'utf8'), /added by npm/, '--check leaves the lockfile alone');
  const r = run(USER); assert.equal(r.code, 0, r.out); assert.match(r.out, /Put package-lock\.json back the way GitHub has it/);
  assert.match(r.out, /Updated: version 1\.0\.0 → 1\.1\.0\./); assert.match(r.out, /• Fix: draft cards are no longer see-through\n  • Canvas: Ad layout card \(#3\)/);
  assert.doesNotMatch(r.out, /First version/, 'only the new commits'); assert.match(r.out, /Release notes: https:\/\/github\.com\/sytesims\/imagination-is-all-you-need\/releases/);
  assert.match(r.out, /Restart the app to use the new version/); assert.equal(head(), git(DEV, 'rev-parse', 'HEAD'));
  assert.equal(fs.readFileSync(path.join(USER, 'README.md'), 'utf8'), 'v1.1\n'); ok('update: npm-rewritten lockfile put back, fast-forward, versions, new commits, restart line');
  console.log(r.out.replace(/^/gm, '    | ')); }
{ const r = run(USER); assert.match(r.out, /You’re up to date \(version 1\.1\.0\)\./); ok('then up to date at 1.1.0'); }

// 6. a lockfile change asks for the install (skipped here); MCP code rebuilds only when mcp/dist exists
{ write(DEV, 'package-lock.json', '{}\n'); write(DEV, 'mcp/src/index.ts', '//\n'); git(DEV, 'add', '-A'); git(DEV, 'commit', '-qm', 'New dependency'); git(DEV, 'push', '-q', 'origin', 'main');
  fs.mkdirSync(path.join(USER, 'mcp', 'dist'), { recursive: true });
  const r = run(USER); assert.equal(r.code, 0, r.out); assert.match(r.out, /\(npm ci\)… skipped/); assert.match(r.out, /mcp:build\)… skipped/);
  assert.doesNotMatch(r.out, /MCP server’s new dependencies/, 'the root npm ci covers mcp/'); ok('lockfile change → npm ci; mcp/src change + mcp/dist → mcp:build'); }
{ write(DEV, 'README.md', 'v1.2\n'); git(DEV, 'commit', '-qam', 'Docs only'); git(DEV, 'push', '-q', 'origin', 'main');
  const r = run(USER); assert.equal(r.code, 0, r.out); assert.doesNotMatch(r.out, /npm ci|mcp:build/); ok('no lockfile change → no installs'); }

// 7. the user's library and keys were never touched
assert.equal(snapshot(), mine); assert.equal(git(USER, 'status', '--porcelain'), '', 'nothing left behind'); ok('server/data and .env.local untouched through every run');

// 8. a zip install: the by-hand steps, exit 0
{ const ZIP = path.join(T, 'zip install'); write(ZIP, 'scripts/update.mjs', fs.readFileSync(SCRIPT, 'utf8')); write(ZIP, 'package.json', pkg('1.0.0'));
  const r = run(ZIP); assert.equal(r.code, 0, r.out); assert.match(r.out, /isn’t a git copy of the app/); assert.match(r.out, /releases/); assert.match(r.out, /\.env\.local/); assert.match(r.out, /server.data/);
  ok('zip install: download the release, copy server/data and .env.local'); }

fs.rmSync(T, { recursive: true, force: true });
console.log('update-script: all ok');
