#!/usr/bin/env node
// `npm run setup`: one command from a fresh clone to a running app.
//   1. Dependencies: runs `npm install` when they're missing (--check: only says so).
//   2. `npm run doctor`: what works, what's missing, how to fix it (read-only).
//   3. Starts the app (`npm run dev`) unless it's already running (--no-start: don't), and prints the setup page: http://localhost:5174/?setup=1
// Nothing else is installed or downloaded: ComfyUI, custom nodes and models stay your choice (the doctor prints the commands).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2); const has = (f) => args.includes(f);
if (has('--help') || has('-h')) { console.log('npm run setup [-- --check] [--no-start]\n  --check     only check (no npm install, no start)\n  --no-start  install + doctor, but don\'t start the app'); process.exit(0); }
const checkOnly = has('--check'); const noStart = has('--no-start') || checkOnly;
const say = (s) => console.log(`\x1b[1m==>\x1b[0m ${s}`);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) { console.error(`Node ${process.versions.node} is too old: install Node 22 or 24 (https://nodejs.org), then run npm run setup again.`); process.exit(2); }
// ports and env file: the same settings the app reads (shell first, then the env file; values of these few settings only, never keys)
const envFile = process.env.OPENHIGGSFIELD_ENV_FILE?.trim() ? path.resolve(process.env.OPENHIGGSFIELD_ENV_FILE.trim()) : path.join(REPO, '.env.local');
const fileVal = (k) => { try { const m = fs.readFileSync(envFile, 'utf8').match(new RegExp(`^\\s*${k}\\s*=\\s*([^#\\r\\n]*)`, 'm')); return m ? m[1].trim().replace(/^(['"])(.*)\1$/, '$2') : ''; } catch { return ''; } };
const setting = (k, d) => process.env[k]?.trim() || fileVal(k) || d;
const apiPort = setting('PORT', '8787'); const webPort = setting('WEB_PORT', '5174');
// The Vite and MCP processes must inherit the same ports as the printed wizard URL/API.
// Only promote these non-secret settings, not the contents of the settings file.
const launchEnv = { ...process.env, PORT: apiPort, WEB_PORT: webPort, MCP_PORT: setting('MCP_PORT', '8788') };
const wizard = `http://localhost:${webPort}/?setup=1`;

// 1. dependencies
const depsOk = () => ['node_modules/fastify', 'node_modules/tsx', 'node_modules/concurrently'].every((p) => fs.existsSync(path.join(REPO, p)));
if (depsOk()) say('Dependencies installed');
else if (checkOnly) say('Dependencies not installed (run npm run setup without --check, or npm install)');
else { say('Installing dependencies (npm install)…'); const r = spawnSync(npm, ['install'], { cwd: REPO, stdio: 'inherit', shell: process.platform === 'win32' }); if (r.status !== 0) { console.error('npm install failed; fix the error above and run npm run setup again.'); process.exit(r.status ?? 1); } }

// 2. doctor
say('Checking this computer (npm run doctor)…\n');
const doc = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'doctor.mjs')], { cwd: REPO, stdio: 'inherit', env: launchEnv });
if (doc.status === 2) { console.error('\nThe app can’t start yet: fix the lines marked ✗ above, then run npm run setup again.'); process.exit(2); }

// 3. start (or say where it runs)
const up = async () => { try { const r = await fetch(`http://127.0.0.1:${apiPort}/api/health`, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; } };
console.log('');
if (await up()) { say(`The app is already running. Open the setup page: ${wizard}`); process.exit(0); }
if (noStart) { say(`Start it with npm run dev, then open the setup page: ${wizard}`); process.exit(doc.status ?? 0); }
say(`Starting the app (npm run dev). Setup page: ${wizard}   (Ctrl+C stops it)`);
const child = spawn(npm, ['run', 'dev'], { cwd: REPO, stdio: 'inherit', shell: process.platform === 'win32', env: launchEnv });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
const t0 = Date.now(); const tick = setInterval(async () => { if (await up()) { clearInterval(tick); say(`Ready: open ${wizard}`); } else if (Date.now() - t0 > 120_000) { clearInterval(tick); say(`Still starting… when it's up, open ${wizard}`); } }, 1500);
child.on('exit', (code) => { clearInterval(tick); process.exit(code ?? 0); });
