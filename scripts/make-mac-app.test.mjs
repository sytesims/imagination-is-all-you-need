// node --test scripts/make-mac-app.test.mjs: builds Imagination.app into a temp folder and checks the bundle.
// macOS only (it needs osacompile, sips and iconutil). Starts no servers and opens nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO, 'scripts', 'make-mac-app.sh');
const skip = process.platform !== 'darwin' && 'macOS only';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mac app test-')); // a space, like "Application Support"

test('--dry-run writes nothing', { skip }, () => {
  const dest = path.join(tmp(), 'Apps');
  const out = execFileSync('bash', [SCRIPT, '--dest', dest, '--dry-run'], { encoding: 'utf8' });
  assert.match(out, /Dry run/);
  assert.equal(fs.existsSync(dest), false);
});

test('a folder that is not the app is refused', { skip }, () => {
  const r = spawnSync('bash', [SCRIPT, '--dest', tmp(), '--repo', tmp()], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /isn't an Imagination app folder/);
});

test('never replaces another app called Imagination', { skip }, () => {
  const dest = tmp(); const theirs = path.join(dest, 'Imagination.app', 'Contents'); fs.mkdirSync(theirs, { recursive: true });
  const plist = path.join(theirs, 'Info.plist');
  fs.writeFileSync(plist, '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.example.imagination</string></dict></plist>');
  const r = spawnSync('bash', [SCRIPT, '--dest', dest, '--repo', REPO], { encoding: 'utf8' });
  assert.equal(r.status, 3); assert.match(r.stderr, /is a different app/);
  assert.match(fs.readFileSync(plist, 'utf8'), /com\.example\.imagination/);
});

test('builds a complete Imagination.app', { skip }, () => {
  const dest = tmp();
  execFileSync('bash', [SCRIPT, '--dest', dest, '--repo', REPO], { encoding: 'utf8' });
  const app = path.join(dest, 'Imagination.app', 'Contents');
  const plist = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', path.join(app, 'Info.plist')], { encoding: 'utf8' }));
  assert.equal(plist.CFBundleName, 'Imagination');
  assert.equal(plist.CFBundleIdentifier, 'app.iiayn.launcher');
  assert.equal(plist.CFBundlePackageType, 'APPL');
  assert.equal(plist.CFBundleIconFile, 'Imagination');
  assert.equal(plist.LSUIElement, undefined, 'a normal Dock app');
  assert.equal(plist.OSAAppletStayOpen, true, 'stays in the Dock while Imagination runs');
  assert.equal(plist.NSCameraUsageDescription, undefined);
  const version = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
  assert.equal(plist.CFBundleShortVersionString, version);

  const exe = path.join(app, 'MacOS', plist.CFBundleExecutable);
  const launcher = path.join(app, 'Resources', 'launch.sh');
  for (const f of [exe, launcher]) assert.ok(fs.statSync(f).mode & 0o111, `${path.basename(f)} is executable`);
  assert.ok(fs.statSync(path.join(app, 'Resources', 'Imagination.icns')).size > 1000);
  assert.equal(fs.readFileSync(path.join(app, 'Resources', 'repo-path'), 'utf8').trim(), REPO);
  assert.equal(spawnSync('codesign', ['--verify', path.join(dest, 'Imagination.app')]).status, 0, 'signature matches the changed bundle');

  // the launcher fails clearly (and starts nothing) when its app folder is gone
  const home = tmp();
  const r = spawnSync(launcher, [], { encoding: 'utf8', env: { ...process.env, HOME: home, IMAGINATION_REPO: path.join(home, 'gone'), IMAGINATION_NO_NOTIFY: '1', SHELL: '', PORT: '1', WEB_PORT: '1' } });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /couldn't find its app folder/);
  assert.equal(fs.existsSync(path.join(home, 'Library', 'Application Support', 'Imagination', 'app.pid')), false);
  assert.equal(spawnSync(launcher, ['--status'], { encoding: 'utf8', env: { ...process.env, HOME: home, SHELL: '', PORT: '1', WEB_PORT: '1' } }).stdout.trim(), 'stopped');
});
