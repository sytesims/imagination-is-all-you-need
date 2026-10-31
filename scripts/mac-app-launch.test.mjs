// node --test --test-concurrency=1 scripts/mac-app-launch.test.mjs: the Mac app's launcher (scripts/mac-app/launch.sh) in a
// scratch HOME, against a stand-in app folder whose setup.mjs serves two tiny pages on spare ports (web 5198, api 8756).
// Fake `open` and `osascript` come first in PATH, so no browser opens and no notification shows. Stops only what it started.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const LAUNCH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mac-app', 'launch.sh');
const WEB = 5198, API = 8756;
const listening = (p) => spawnSync('lsof', ['-ti', `tcp:${p}`, '-sTCP:LISTEN']).stdout.toString().trim() !== '';
const skip = process.platform !== 'darwin' ? 'macOS only' : (listening(WEB) || listening(API)) ? `port ${WEB} or ${API} is busy` : false;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mac launch test-'));
const home = path.join(root, 'home');
const support = path.join(home, 'Library', 'Application Support', 'Imagination');
const logFile = path.join(home, 'Library', 'Logs', 'Imagination', 'app.log');
const calls = path.join(root, 'calls.log');
const bin = path.join(root, 'bin');
// the app folder: a space and a quote in its name, like real folders can have
const repo = path.join(root, "Imagination it's");
const SERVER = `const http = require('http'); const [web, api, what] = process.argv.slice(2);
if (what !== 'api') http.createServer((q, r) => r.end('web')).listen(+web, '127.0.0.1');
if (what !== 'web') http.createServer((q, r) => { r.statusCode = q.url === '/api/health' ? 200 : 404; r.end('{}'); }).listen(+api, '127.0.0.1');`;
if (!skip) {
  fs.mkdirSync(bin, { recursive: true });
  for (const b of ['open', 'osascript']) { fs.writeFileSync(path.join(bin, b), `#!/bin/bash\necho "${b} $*" >> "${calls}"\n`); fs.chmodSync(path.join(bin, b), 0o755); }
  for (const d of ['scripts', 'node_modules/fastify', 'node_modules/tsx', 'node_modules/concurrently']) fs.mkdirSync(path.join(repo, d), { recursive: true });
  fs.writeFileSync(path.join(root, 'server.cjs'), SERVER);
  // FAKE_SETUP: serve (after FAKE_DELAY seconds; the web page from a child process, like npm and vite) | doctor (exit 2)
  fs.writeFileSync(path.join(repo, 'scripts', 'setup.mjs'), `import { spawn } from 'node:child_process';
console.log('fake setup ' + (process.env.FAKE_SETUP || 'serve'));
if (process.env.FAKE_SETUP === 'doctor') { console.log('✗ Node.js is too old'); process.exit(2); }
setTimeout(() => {
  spawn(process.execPath, [${JSON.stringify(path.join(root, 'server.cjs'))}, process.env.WEB_PORT, process.env.PORT, 'web'], { stdio: 'inherit' });
  spawn(process.execPath, [${JSON.stringify(path.join(root, 'server.cjs'))}, process.env.WEB_PORT, process.env.PORT, 'api'], { stdio: 'inherit' });
}, Number(process.env.FAKE_DELAY || 0) * 1000);
setInterval(() => {}, 1000);
`);
}
const env = (extra = {}) => ({ PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin:${path.dirname(process.execPath)}`, HOME: home, SHELL: '', IMAGINATION_REPO: repo, PORT: String(API), WEB_PORT: String(WEB), OPENHIGGSFIELD_ENV_FILE: path.join(root, 'env.local'), IMAGINATION_START_TIMEOUT: '20', ...extra });
const launch = (args = [], extra = {}) => { const r = spawnSync('bash', [LAUNCH, ...args], { encoding: 'utf8', env: env(extra), timeout: 60_000 }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const takeCalls = () => { const c = fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8') : ''; fs.rmSync(calls, { force: true }); return c; };
const opens = (c) => c.split('\n').filter((l) => l.startsWith('open ')).length;
const savedPid = () => Number(fs.readFileSync(path.join(support, 'app.pid'), 'utf8').split('\n')[0]);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const setupPids = () => execFileSync('ps', ['-ax', '-o', 'pid=,command='], { encoding: 'utf8' }).split('\n').map((l) => l.trim()).filter((l) => / node scripts\/setup\.mjs/.test(` ${l.replace(/^\d+/, '')}`)).map((l) => l.split(' ')[0]);
const otherSetups = new Set(setupPids()); // (a real Imagination already running on this computer isn't ours to count)
const setupCount = () => setupPids().filter((pid) => !otherSetups.has(pid)).length;
// a copy we didn't start (a terminal): both pages, or only one of them
const terminalCopy = (what = 'both') => spawn(process.execPath, [path.join(root, 'server.cjs'), String(WEB), String(API), what], { stdio: 'ignore' });
const until = async (ok, ms = 5000) => { const end = Date.now() + ms; while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 100)); return ok(); };
const stopOurs = () => launch(['--stop']);

after(() => { if (!skip) stopOurs(); fs.rmSync(root, { recursive: true, force: true }); });

test('a cold start opens the browser once; Stop ends the whole process group', { skip }, async () => {
  takeCalls();
  const r = launch();
  assert.equal(r.code, 0, r.out);
  const c = takeCalls();
  assert.equal(opens(c), 1); assert.match(c, new RegExp(`open http://localhost:${WEB}/`));
  const [pid, folder] = fs.readFileSync(path.join(support, 'app.pid'), 'utf8').trim().split('\n');
  assert.equal(folder, repo);
  assert.equal(execFileSync('ps', ['-p', pid, '-o', 'pgid='], { encoding: 'utf8' }).trim(), pid, 'its own process group');
  assert.equal(launch(['--status']).out.trim(), 'running');
  assert.equal(launch().code, 0); assert.equal(opens(takeCalls()), 1, 'already running: only opens');
  assert.match(stopOurs().out, /Imagination stopped/);
  assert.ok(await until(() => !listening(WEB) && !listening(API)), 'the servers (children) stopped too');
  assert.equal(launch(['--status']).out.trim(), 'stopped');
  assert.match(launch(['--stop']).out, /isn't running/);
});

test('a copy started in a terminal is used, never doubled, and never stopped', { skip }, async () => {
  const t = terminalCopy(); try {
    assert.ok(await until(() => listening(WEB) && listening(API)));
    takeCalls();
    assert.equal(launch().code, 0); assert.equal(opens(takeCalls()), 1);
    assert.equal(setupCount(), 0, 'no second copy');
    const s = launch(['--stop']);
    assert.equal(s.code, 1); assert.match(s.out, /press Ctrl\+C there/);
    assert.ok(alive(t.pid));
  } finally { t.kill(); await until(() => !listening(WEB) && !listening(API)); }
});

test('a copy that is reloading (its api restarts) is waited for, not doubled', { skip }, async () => {
  const web = terminalCopy('web'); let api;
  const later = setTimeout(() => { api = terminalCopy('api'); }, 2000);
  try {
    assert.ok(await until(() => listening(WEB)));
    takeCalls();
    const r = await new Promise((res) => { const p = spawn('bash', [LAUNCH], { env: env() }); let out = ''; p.stdout.on('data', (d) => { out += d; }); p.on('exit', (code) => res({ code, out })); });
    assert.equal(r.code, 0, r.out); assert.equal(opens(takeCalls()), 1);
    assert.equal(setupCount(), 0);
  } finally { clearTimeout(later); web.kill(); api?.kill(); await until(() => !listening(WEB) && !listening(API)); }
});

test('a setup that can\'t start (doctor exit 2) fails fast with only this start\'s log', { skip }, () => {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, '\n=== an older start\nold line from before\n');
  const t0 = Date.now();
  const r = launch([], { FAKE_SETUP: 'doctor' });
  assert.equal(r.code, 1);
  assert.ok(Date.now() - t0 < 8000, 'no extra waiting');
  assert.match(r.out, /can't start yet/); assert.match(r.out, /Node\.js is too old/);
  assert.doesNotMatch(r.out, /old line from before/);
  assert.equal(r.err, '', 'nothing else on stderr');
});

test('stale files never block a start or stop something else', { skip }, async () => {
  const stranger = spawn('sleep', ['60']);
  try {
    fs.mkdirSync(support, { recursive: true });
    // a saved id now used by another program, and a lock left by a launcher that is gone (its id reused too)
    fs.writeFileSync(path.join(support, 'app.pid'), `${stranger.pid}\n`);
    assert.match(launch(['--stop']).out, /isn't running/); assert.ok(alive(stranger.pid));
    fs.symlinkSync(String(stranger.pid), path.join(support, 'launch.lock'));
    takeCalls();
    assert.equal(launch().code, 0); assert.equal(opens(takeCalls()), 1);
    assert.notEqual(savedPid(), stranger.pid);
    assert.equal(fs.existsSync(path.join(support, 'launch.lock')), false, 'lock released');
    stopOurs(); assert.ok(alive(stranger.pid));
    await until(() => !listening(WEB) && !listening(API));
    // an older launcher's lock folder
    fs.mkdirSync(path.join(support, 'launch.lock'));
    assert.equal(launch().code, 0); stopOurs();
    await until(() => !listening(WEB) && !listening(API));
  } finally { stranger.kill(); }
});

test('two clicks at once start one copy', { skip }, async () => {
  takeCalls();
  const first = new Promise((res) => { const p = spawn('bash', [LAUNCH], { env: env({ FAKE_DELAY: '2' }) }); let out = ''; p.stdout.on('data', (d) => { out += d; }); p.on('exit', (code) => res({ code, out })); });
  await until(() => fs.existsSync(path.join(support, 'app.pid')));
  const second = launch([], { FAKE_DELAY: '2' });
  assert.equal(second.code, 0); assert.match(second.out, /already starting/);
  assert.equal((await first).code, 0);
  assert.equal(setupCount(), 1); assert.equal(opens(takeCalls()), 1, 'the browser opens once');
  stopOurs(); await until(() => !listening(WEB) && !listening(API));
});

test('ports come from the settings file (first line wins, like npm run setup); bad values are refused', { skip }, async () => {
  fs.writeFileSync(path.join(root, 'env.local'), `SOME_KEY=never-read\r\nWEB_PORT = "${WEB}" # web\r\nPORT=${API}\r\nPORT=1\r\n`);
  try {
    takeCalls();
    const r = launch([], { PORT: '', WEB_PORT: '' });
    assert.equal(r.code, 0, r.out); assert.match(takeCalls(), new RegExp(`open http://localhost:${WEB}/`));
    assert.match(launch(['--stop'], { PORT: '', WEB_PORT: '' }).out, /stopped/);
    await until(() => !listening(WEB) && !listening(API));
    const bad = launch([], { WEB_PORT: 'abc' });
    assert.equal(bad.code, 1); assert.match(bad.out, /isn't a number/);
  } finally { fs.rmSync(path.join(root, 'env.local')); }
});

test('the app from another folder is not mistaken for this one', { skip }, async () => {
  const other = path.join(root, 'other'); fs.mkdirSync(path.join(other, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(repo, 'scripts', 'setup.mjs'), path.join(other, 'scripts', 'setup.mjs'));
  assert.equal(launch().code, 0);
  const r = launch([], { IMAGINATION_REPO: other, WEB_PORT: '5199', PORT: '8757' });
  assert.equal(r.code, 1); assert.match(r.out, /already running from another folder/);
  stopOurs(); await until(() => !listening(WEB) && !listening(API));
});

test('the log stays small, and a log it can\'t write never replaces the message', { skip }, () => {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.writeFileSync(logFile, 'x'.repeat(100) + '\n'.repeat(1) + 'y'.repeat(3 * 1024 * 1024));
  launch([], { FAKE_SETUP: 'doctor' });
  assert.ok(fs.statSync(logFile).size <= 1.1 * 1024 * 1024, 'trimmed to about 1 MB');
  fs.chmodSync(logFile, 0o444);
  try {
    const r = launch([], { FAKE_SETUP: 'doctor' });
    assert.equal(r.code, 1); assert.match(r.out, /^Imagination /); assert.equal(r.err, '');
  } finally { fs.chmodSync(logFile, 0o644); }
});
