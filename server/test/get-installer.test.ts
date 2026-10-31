// The one-line installer (scripts/get.sh), in a scratch HOME. Never clones, installs or starts anything.
// Fake `defaults`, `killall`, `brew` and `uname` come first in PATH, so the real Dock, Homebrew and /Applications are never touched.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/get.sh', import.meta.url));
const repo = path.resolve(path.dirname(script), '..');
if (process.platform === 'win32') { console.log('skip get.sh: bash installer (Windows uses get.ps1, checked in CI)'); process.exit(0); }
const home = mkdtempSync(path.join(tmpdir(), 'get installer '));

// fakes: each logs its call; `defaults` keeps the Dock list in a file so a second run sees the first one's pin
const bin = path.join(home, 'fake bin'); mkdirSync(bin);
const log = path.join(home, 'calls.log'); const dock = path.join(home, 'dock.txt');
const fake = (name: string, body: string, logged = true) => { writeFileSync(path.join(bin, name), `#!/bin/bash\n${logged ? `echo "${name} $*" >> "${log}"\n` : ''}${body}\n`); chmodSync(path.join(bin, name), 0o755); };
// (`read` prints the tiles the way the real one does: "_CFURLString" = "file:///…/Imagination.app/";)
fake('defaults', `case "$1" in read) sed -n 's|.*<string>\\(file:[^<]*\\)</string>.*|"_CFURLString" = "\\1";|p' "${dock}" 2>/dev/null;; write) echo "\${@: -1}" >> "${dock}";; esac`);
fake('killall', '');
fake('brew', '');
fake('uname', '[ "$1" = -s ] && [ -n "$FAKE_OS" ] && { echo "$FAKE_OS"; exit 0; }; exec /usr/bin/uname "$@"', false);
// (brew shellenv: a runner that has Homebrew asks it for its PATH; that's not a change to this computer)
const calls = () => (existsSync(log) ? readFileSync(log, 'utf8') : '').split('\n').filter((l) => l !== 'brew shellenv').join('\n');
const reset = () => rmSync(log, { force: true });

const apps = path.join(home, 'Applications system'); mkdirSync(apps); // stands in for /Applications in every run
const run = (args: string[], env: Record<string, string> = {}) => {
  const r = spawnSync('bash', [script, ...args], { encoding: 'utf8', input: '', detached: true, env: { PATH: `${bin}:${process.env.PATH ?? ''}`, HOME: home, IIAYN_APPS_DIR: apps, ...env } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const mac = { FAKE_OS: 'Darwin', IIAYN_APPS_DIR: apps };
try {
  const help = run(['--help']);
  assert.equal(help.code, 0); assert.match(help.out, /--dry-run/); assert.match(help.out, /--no-shortcut/);
  assert.match(help.out, /On a Mac the installer adds Imagination to Applications and your Dock/);
  assert.doesNotMatch(help.out, /IIAYN_APPS_DIR/);

  const bad = run(['--nope']);
  assert.equal(bad.code, 1); assert.match(bad.out, /Unknown option: --nope/);

  // a dry run prints every step and changes nothing (no folder, no shortcut)
  const dry = run(['--dry-run', '--yes', '--branch', 'test-branch']);
  assert.equal(dry.code, 0, dry.out);
  for (const step of ['git clone --depth 1 --branch test-branch', 'npm run setup -- --no-start', 'npm run setup -- --open']) assert.ok(dry.out.includes(step), `dry run shows: ${step}`);
  assert.equal(existsSync(path.join(home, 'Imagination')), false);
  assert.equal(existsSync(path.join(home, 'Desktop')), false);

  // macOS: builds the app into Applications and pins it to the Dock (dry run: printed only)
  reset();
  const macDry = run(['--dry-run', '--yes'], mac);
  assert.equal(macDry.code, 0, macDry.out);
  assert.ok(macDry.out.includes(`+ bash ${home}/Imagination/scripts/make-mac-app.sh --repo ${home}/Imagination --dest ${apps}`), macDry.out);
  assert.ok(macDry.out.includes(`+ defaults write com.apple.dock persistent-apps -array-add <dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>file://${apps.replaceAll(' ', '%20')}/Imagination.app/</string><key>_CFURLStringType</key><integer>15</integer>`), macDry.out);
  assert.match(macDry.out, /\+ killall Dock/);
  assert.match(macDry.out, /Imagination is in your Applications folder and Dock\. Click it any time to start it\./);
  assert.doesNotMatch(macDry.out, /Imagination\.command/);
  assert.equal(calls().trim(), 'defaults read com.apple.dock persistent-apps', 'only reads the Dock in a dry run');
  assert.equal(existsSync(path.join(home, 'Applications')), false);

  // the Dock address is a real file URL, also for folder names with accents or # in them
  const odd = path.join(home, 'Apps é#'); mkdirSync(odd);
  const oddRun = run(['--dry-run', '--yes'], { ...mac, IIAYN_APPS_DIR: odd });
  assert.ok(oddRun.out.includes(`<string>file://${home.replaceAll(' ', '%20')}/Apps%20%C3%A9%23/Imagination.app/</string>`), oddRun.out);
  rmSync(odd, { recursive: true });

  // Applications needs an administrator: the Applications folder in the home folder instead, never sudo
  chmodSync(apps, 0o555);
  const locked = run(['--dry-run', '--yes'], mac);
  chmodSync(apps, 0o755);
  assert.equal(locked.code, 0, locked.out);
  assert.match(locked.out, /needs an administrator to change/);
  assert.ok(locked.out.includes(`--dest ${home}/Applications\n`), locked.out);
  assert.doesNotMatch(locked.out, /sudo/);

  // --no-shortcut: no app, no Dock
  reset();
  const none = run(['--dry-run', '--yes', '--no-shortcut'], mac);
  assert.equal(none.code, 0, none.out);
  assert.doesNotMatch(none.out, /make-mac-app|defaults|killall|Dock/);
  assert.equal(calls(), '');

  // nobody at the keyboard (and no --yes): not added
  const noTty = run(['--dry-run'], mac);
  assert.match(noTty.out, /Applications folder and Dock\? no/); assert.doesNotMatch(noTty.out, /make-mac-app/);

  // someone else's Imagination.app is left alone
  const theirs = path.join(apps, 'Imagination.app', 'Contents'); mkdirSync(theirs, { recursive: true });
  writeFileSync(path.join(theirs, 'Info.plist'), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.example.imagination</string></dict></plist>');
  const other = run(['--dry-run', '--yes'], mac);
  assert.equal(other.code, 0, other.out);
  assert.match(other.out, /already a different app called Imagination/); assert.doesNotMatch(other.out, /make-mac-app\.sh --repo|killall/);
  assert.ok(existsSync(theirs));
  rmSync(path.join(apps, 'Imagination.app'), { recursive: true });

  // Linux keeps its .desktop entry
  const linux = run(['--dry-run', '--yes'], { FAKE_OS: 'Linux' });
  assert.equal(linux.code, 0, linux.out);
  assert.match(linux.out, /\+ write .*\/applications\/imagination\.desktop/); assert.doesNotMatch(linux.out, /make-mac-app|defaults|Dock/);

  // a folder that has other files in it is never used
  const busyDir = path.join(home, 'busy'); mkdirSync(busyDir); writeFileSync(path.join(busyDir, 'notes.txt'), 'mine');
  const busy = run(['--dry-run', '--dir', busyDir]);
  assert.equal(busy.code, 1); assert.match(busy.out, /already has other files/);
  assert.equal(readFileSync(path.join(busyDir, 'notes.txt'), 'utf8'), 'mine');

  // an existing install is updated, not cloned again
  const app = path.join(home, 'app'); mkdirSync(path.join(app, '.git'), { recursive: true }); mkdirSync(path.join(app, 'scripts'));
  writeFileSync(path.join(app, 'scripts', 'setup.mjs'), '');
  const again = run(['--dry-run', '--no-start', '--no-shortcut', '--dir', app]);
  assert.equal(again.code, 0, again.out); assert.match(again.out, /npm run update/); assert.doesNotMatch(again.out, /git clone/);

  // a real Mac build: an older install (with the old desktop .command) gets the app, a Dock pin, and loses the .command
  if (process.platform === 'darwin') {
    // a stand-in install: just what make-mac-app needs, and npm scripts that don't exist (so update/setup do nothing)
    const inst = path.join(home, 'Imagination old'); mkdirSync(path.join(inst, '.git'), { recursive: true });
    cpSync(path.join(repo, 'scripts', 'make-mac-app.sh'), path.join(inst, 'scripts', 'make-mac-app.sh'));
    cpSync(path.join(repo, 'scripts', 'mac-app'), path.join(inst, 'scripts', 'mac-app'), { recursive: true });
    cpSync(path.join(repo, 'brand', 'app-icon-512.png'), path.join(inst, 'brand', 'app-icon-512.png'));
    writeFileSync(path.join(inst, 'scripts', 'setup.mjs'), '');
    writeFileSync(path.join(inst, 'package.json'), '{\n  "name": "stand-in",\n  "version": "9.9.9"\n}\n');
    const desk = path.join(home, 'Desktop'); mkdirSync(desk);
    const oldCommand = `#!/bin/bash\n# Starts Imagination Is All You Need and opens it in your browser. Close this window (or press Ctrl+C) to stop it.\nexport PATH="/opt/old/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"\ncd "${inst}" || { echo "The app isn't in ${inst} any more."; exit 1; }\nexec npm run setup -- --open\n`;
    writeFileSync(path.join(desk, 'Imagination.command'), oldCommand);

    reset();
    const real = run(['--yes', '--no-start', '--dir', inst], mac);
    assert.equal(real.code, 0, real.out);
    const plist = path.join(apps, 'Imagination.app', 'Contents', 'Info.plist');
    const id = spawnSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plist], { encoding: 'utf8' }).stdout.trim();
    assert.equal(id, 'app.iiayn.launcher');
    assert.equal(readFileSync(path.join(apps, 'Imagination.app', 'Contents', 'Resources', 'repo-path'), 'utf8').trim(), inst);
    assert.match(calls(), /defaults write com\.apple\.dock persistent-apps -array-add/); assert.match(calls(), /killall Dock/);
    assert.equal(existsSync(path.join(desk, 'Imagination.command')), false, 'our old .command is removed');

    // a second run replaces our app, doesn't pin it twice, and keeps a .command someone changed
    writeFileSync(path.join(desk, 'Imagination.command'), `${oldCommand}echo mine\n`);
    reset();
    const second = run(['--yes', '--no-start', '--dir', inst], mac);
    assert.equal(second.code, 0, second.out);
    assert.match(second.out, /Already in your Dock/); assert.doesNotMatch(calls(), /defaults write|killall/);
    assert.ok(existsSync(plist));
    assert.ok(existsSync(path.join(desk, 'Imagination.command')), 'a changed .command stays');
  }

  // the README links to both scripts so people can read them first
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  assert.match(readme, /\(scripts\/get\.sh\)/); assert.match(readme, /\(scripts\/get\.ps1\)/);
  console.log('ok get.sh: help, dry runs (Linux, macOS, fallback, --no-shortcut, not our app), busy folder, update, real Mac app build + Dock pin');
} finally {
  rmSync(home, { recursive: true, force: true }); // only this test's scratch folder
}
