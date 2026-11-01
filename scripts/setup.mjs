#!/usr/bin/env node
// `npm run setup`: one command from a fresh clone to a running app.
//   1. Dependencies: runs `npm install` when they're missing (--check: only says so).
//   2. `npm run doctor`: what works, what's missing, how to fix it (read-only).
//   3. Starts the app (`npm start`: builds the web app when it changed, then runs it without file watching) unless it's already running (--no-start: don't), and prints the setup page: http://localhost:5174/?setup=1
//      --open: also opens the app in the browser once the web page answers (desktop shortcuts and scripts/get.sh use it).
// Nothing else is installed or downloaded: ComfyUI, custom nodes and models stay your choice (the doctor prints the commands).
// Exit codes (the one-line installers and the Mac app read them): 0 = ready · 1 = failed: the dependencies didn't install, this Node.js
// doesn't fit, or the app can't start (stop there) · 2 = the app works, but something some features need is missing (the doctor says what).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
import { nodeProblem, NODE_STEPS } from './node-version.mjs';
import { REPO, webPort, launchEnv, apiUp as up, portClash } from './app-env.mjs'; // ports and env file: the same settings the app reads
const args = process.argv.slice(2); const has = (f) => args.includes(f);
if (has('--help') || has('-h')) { console.log('npm run setup [-- --check] [--no-start] [--open]\n  --check     only check (no npm install, no start)\n  --no-start  install + doctor, but don\'t start the app\n  --open      open the app in the browser once it\'s ready'); process.exit(0); }
const checkOnly = has('--check'); const noStart = has('--no-start') || checkOnly; const openWhenReady = has('--open');
const say = (s) => console.log(`\x1b[1m==>\x1b[0m ${s}`);
const WIN = process.platform === 'win32'; const npm = WIN ? 'npm.cmd' : 'npm';
/** npm.cmd needs a shell on Windows: give it one command line (fixed words only), not args + shell: true, which Node 24 warns about (DEP0190). */
const npmCall = (a) => (WIN ? [`${npm} ${a.join(' ')}`, [], { shell: true }] : [npm, a, {}]);
const nodeBad = nodeProblem(process.versions.node);
if (nodeBad) { console.error(`${nodeBad}\n  ${NODE_STEPS}\nThen run npm run setup again.`); process.exit(1); }
const wizard = `http://localhost:${webPort}/?setup=1`;
const home = `http://localhost:${webPort}/`; // --open opens the home page: the setup sheet shows by itself on a first visit
/** Opens a page in the default browser; best effort (a computer without a desktop just keeps the printed address). */
const openBrowser = (url) => {
  const [cmd, a] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]];
  try { spawn(cmd, a, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch { /* the printed address still works */ }
};

// 1. dependencies
const depsOk = () => ['node_modules/fastify', 'node_modules/tsx', 'node_modules/concurrently'].every((p) => fs.existsSync(path.join(REPO, p)));
/** npm's output during the install, also saved here; the file is kept only when the install failed (so it's there to read or share). */
const LOG = path.join(REPO, 'setup.log');
/** Runs a command, showing its output and saving it to LOG; resolves to its exit code (1 when it couldn't run at all). */
const runLogged = (c, a, o) => new Promise((resolve) => {
  const out = fs.createWriteStream(LOG); let done = false;
  const end = (code) => { if (done) return; done = true; out.end(() => resolve(code)); };
  let p; try { p = spawn(c, a, { ...o, cwd: REPO, stdio: ['inherit', 'pipe', 'pipe'] }); } catch (e) { out.write(`${e?.message ?? e}\n`); end(1); return; }
  p.stdout.on('data', (d) => { process.stdout.write(d); out.write(d); }); p.stderr.on('data', (d) => { process.stderr.write(d); out.write(d); });
  p.on('error', (e) => { console.error(String(e?.message ?? e)); out.write(`${e?.message ?? e}\n`); end(1); });
  p.on('close', (code) => end(code ?? 1));
});
if (depsOk()) say('Dependencies installed');
else if (checkOnly) say('Dependencies not installed (run npm run setup without --check, or npm install)');
else { const ci = fs.existsSync(path.join(REPO, 'package-lock.json')); /* npm ci installs exactly the lockfile and never rewrites it (a rewritten lockfile blocks git pull later) */
  say(`Installing dependencies (npm ${ci ? 'ci' : 'install'})…`); const [c, a, o] = npmCall([ci ? 'ci' : 'install', '--no-audit', '--no-fund']);
  const code = await runLogged(c, a, o);
  if (code !== 0 || !depsOk()) {
    console.error(`\nThe app's parts didn't install (npm ${ci ? 'ci' : 'install'} stopped with an error).\n  The full log: ${LOG}\n  Check your internet connection and free disk space, fix what the log says, then run npm run setup again.`);
    process.exit(1);
  }
  try { fs.rmSync(LOG, { force: true }); } catch { /* only a leftover log */ } }

// 2. doctor
say('Checking this computer (npm run doctor)…\n');
const doc = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'doctor.mjs')], { cwd: REPO, stdio: 'inherit', env: { ...launchEnv, ...(noStart ? {} : { OPENHIGGSFIELD_DOCTOR_BEFORE_START: '1' }) } }); // the app starts next: the doctor says so instead of "App not running"
if (doc.status !== 0 && doc.status !== 1) { console.error('\nThe app can’t start yet: fix the lines marked ✗ above, then run npm run setup again.'); process.exit(1); }
/** --no-start: 2 when the doctor found something missing that some features need (the app itself works). */
const doneCode = doc.status === 1 ? 2 : 0;

// 3. start (or say where it runs)
const webUp = async () => { try { return (await fetch(home, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } };
console.log('');
if (await up()) {
  if (openWhenReady) { openBrowser(home); say(`The app is already running: opened ${home} in your browser.`); process.exit(0); }
  say(`The app is already running. Open the setup page: ${wizard}`); process.exit(0);
}
if (noStart) { say(`Start it with npm start, then open the setup page: ${wizard}`); process.exit(doneCode); }
{ const clash = await portClash(); if (clash) { console.error(clash); process.exit(1); } } // within seconds, not after the 5-minute wait below
say(`Starting the app (npm start). Setup page: ${wizard}   (Ctrl+C stops it)`);
const child = spawn(process.execPath, [path.join(REPO, 'scripts', 'start.mjs')], { cwd: REPO, stdio: 'inherit', env: launchEnv });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
let ready = false; /* checks can overlap: open the browser once */
const t0 = Date.now(); const tick = setInterval(async () => { if (ready) return; if (await up() && (!openWhenReady || await webUp()) && !ready) { ready = true; clearInterval(tick);
  if (openWhenReady) { openBrowser(home); say(`Ready: opened ${home} in your browser. Keep this window open while you use it; Ctrl+C stops the app.`); } else say(`Ready: open ${wizard}`); } else if (Date.now() - t0 > 300_000) { clearInterval(tick); say(`Still starting… when it's up, open ${wizard}`); } }, 1500);
child.on('exit', (code) => { clearInterval(tick); process.exit(code ?? 0); });
