#!/usr/bin/env node
// Try it (sample mode): build iiayn.app/try/ in one command.  npm run try:build   (needs Playwright, see below)
//  1. starts a MOCK server (backend=mock, mock keys, a fresh empty data folder, an empty keys file, no ComfyUI) and the web UI on spare ports;
//  2. clicks through the app and records what it reads (scripts/try/record.mjs);
//  3. copies the media those pages loaded, removes anything about this computer, and checks nothing private is left;
//  4. builds the app for /try/ (web/vite.try.config.ts) and writes everything to site/public/try/ (gitignored: built at deploy time).
// Options: --api-port 8796 --web-port 5177 --out site/public/try --from <recording folder> --scratch <folder for the temporary data> (default: the system temp folder).  Playwright: PLAYWRIGHT_MODULE=file:///…/playwright/index.mjs, else `playwright`.
// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawn, spawnSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const API_PORT = Number(arg('api-port', 8796)), WEB_PORT = Number(arg('web-port', 5177));
const OUT = path.resolve(REPO, arg('out', 'site/public/try'));
const TMP = fs.mkdtempSync(path.join(arg('scratch', os.tmpdir()), 'iiayn-try-'));
const DATA = path.join(TMP, 'data'), ENV = path.join(TMP, 'empty.env'), REC = path.join(TMP, 'rec'), BUILD = path.join(TMP, 'build');
fs.mkdirSync(DATA); fs.writeFileSync(ENV, '');
const UI = `http://127.0.0.1:${WEB_PORT}`, API = `http://127.0.0.1:${API_PORT}`;
const say = (m) => console.log(`[try] ${m}`);

// ---- 1. the mock server and the UI, with no keys and nothing of the user's ----
const KEY_VARS = Object.keys(process.env).filter(k => /(_KEY|_TOKEN|_SECRET)$/.test(k) || /^OPENHIGGSFIELD_|^OPENJUTSU_/.test(k));
const env = { ...process.env }; for (const k of KEY_VARS) delete env[k];
Object.assign(env, { OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_ENV_FILE: ENV,
  OPENHIGGSFIELD_FILMING_FILE: path.join(TMP, 'no-filming.json'), COMFY_DETECT_URLS: 'http://127.0.0.1:9', PORT: String(API_PORT),
  OPENHIGGSFIELD_API_PROXY: API, WEB_PORT: String(WEB_PORT), OPENHIGGSFIELD_NO_HMR: '1' });
const procs = [];
const run = (cmd, args, cwd) => { const p = spawn(cmd, args, { cwd, env, stdio: ['ignore', fs.openSync(path.join(TMP, `${path.basename(cwd)}.log`), 'a'), fs.openSync(path.join(TMP, `${path.basename(cwd)}.log`), 'a')] }); procs.push(p); return p; };
const stop = () => { for (const p of procs) { try { p.kill('SIGTERM'); } catch { /* gone */ } } };
process.on('exit', stop); process.on('SIGINT', () => process.exit(130));
const wait = async (url, ok, what) => { for (let i = 0; i < 90; i++) { try { const r = await fetch(url); if (r.ok && await ok(r)) return; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 1000)); } throw new Error(`${what} did not start (logs in ${TMP})`); };

run(process.execPath, ['scripts/dev.mjs', '--no-watch'], path.join(REPO, 'server'));
await wait(`${API}/api/health`, async r => { const h = await r.json(); if (h.backend !== 'mock') { stop(); throw new Error(`the server on ${API_PORT} is not the mock (backend=${h.backend}); stopping`); } return true; }, 'the mock server');
say(`mock server up on ${API_PORT} (backend=mock, data in a fresh folder)`);
run(process.execPath, [path.join(REPO, 'node_modules/vite/bin/vite.js')], path.join(REPO, 'web'));
await wait(`${UI}/api/health`, async () => true, 'the web UI');
say(`web UI up on ${WEB_PORT}`);

// ---- 2. record ----
const FROM = arg('from', null); // reuse an earlier recording folder (snap.json + media.txt): only media, scrub and build run again
if (FROM) fs.cpSync(path.resolve(FROM), REC, { recursive: true });
else { const rec = spawnSync(process.execPath, [path.join(REPO, 'scripts/try/record.mjs'), UI, REC], { env, stdio: 'inherit' });
  if (rec.status !== 0) { stop(); throw new Error('recording failed'); }
  fs.cpSync(REC, path.join(arg('scratch', os.tmpdir()), 'iiayn-try-last-recording'), { recursive: true }); }
const snap = JSON.parse(fs.readFileSync(path.join(REC, 'snap.json'), 'utf8'));

// ---- 3. build the app for /try/ (first, so the media step sees which files the code itself names) ----
const b = spawnSync(process.execPath, [path.join(REPO, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.try.config.ts', '--outDir', BUILD, '--logLevel', 'error'], { cwd: path.join(REPO, 'web'), stdio: 'inherit' });
if (b.status !== 0) throw new Error('vite build failed');

// ---- 4. media, scrub, privacy check ----
const urls = new Set(fs.readFileSync(path.join(REC, 'media.txt'), 'utf8').split('\n').filter(Boolean));
const MEDIA_URL = /"((?:\/(?:files|samples|examples|showcase)\/|\/api\/(?:media|posters)\/)[^"\s]+)"/g;
// every picture, clip and poster any recorded answer points at (job lists, examples, workflow pages), and a poster for each video
for (const m of JSON.stringify([snap.templates, Object.values(snap.routes).map(r => r.b)]).replace(/\\"/g, '"').matchAll(MEDIA_URL)) urls.add(m[1].replace(/\\+$/, ''));
// files the app's code names itself (Explore, workflow cards, film posters…)
for (const f of fs.readdirSync(path.join(BUILD, 'assets')).filter(f => f.endsWith('.js'))) for (const m of fs.readFileSync(path.join(BUILD, 'assets', f), 'utf8').matchAll(/["'`](\/(?:examples|showcase|samples)\/[^"'`\s?#$]+\.[a-z0-9]{2,5})["'`]/gi)) urls.add(m[1]);
for (const u of [...urls]) if (/^\/(files|examples|showcase|samples)\/.*\.(mp4|webm|mov)$/i.test(u)) urls.add(`/api/media/poster?url=${encodeURIComponent(u)}`);
urls.add('/fonts/fonts.css'); for (const f of fs.readdirSync(path.join(REPO, 'web/public/fonts'))) urls.add(`/fonts/${f}`);
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'm'), { recursive: true });
snap.media = {}; let bytes = 0, missing = 0;
for (const u of urls) {
  const r = await fetch(UI + u).catch((e) => { if (process.env.TRY_DEBUG) console.log('fetch failed', u, e.message); return null; }); if (!r?.ok) { if (process.env.TRY_DEBUG) console.log('missing', r?.status, u); missing++; continue; }
  const ct = r.headers.get('content-type') || ''; if (/text\/html/.test(ct)) { if (process.env.TRY_DEBUG) console.log('html', u); missing++; continue; } // a page, not a file
  const buf = Buffer.from(await r.arrayBuffer()); const ext = (path.extname(new URL(u, UI).pathname) || '.' + (ct.split('/')[1] || 'bin').split(/[;+]/)[0]).slice(0, 6);
  const name = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16) + ext; /* by content: a changed file gets a new name (m/ is cached for a week) */ fs.writeFileSync(path.join(OUT, 'm', name), buf); snap.media[u] = name; bytes += buf.length;
}
if (!Object.keys(snap.media).length) { stop(); throw new Error(`no media could be fetched from ${UI} (logs in ${TMP})`); }
say(`media: ${Object.keys(snap.media).length} files, ${(bytes / 1e6).toFixed(1)} MB (${missing} not files or not found)`);
stop();

/** Anything about this computer becomes "sample computer"; hardware numbers become a plain 16 GB machine. */
const PRIVATE = [os.homedir(), DATA, TMP, fs.realpathSync(TMP), os.userInfo().username, os.hostname(), os.hostname().split('.')[0]].filter(s => s && s.length > 2);
const GB = 2 ** 30;
const HW = { totalBytes: 16 * GB, freeBytes: 8 * GB, totalGB: 16, ramGB: 16 };
const scrubValue = (v, k) => {
  if (Array.isArray(v)) return v.map(x => scrubValue(x));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([kk, x]) => [kk, scrubValue(x, kk)]));
  if (k && k in HW && typeof v === 'number') return HW[k];
  if (typeof v === 'string' && /^(hostname|machine|computerName|user|username|serial|serialNumber|path)$/.test(k ?? '') && v) return 'sample computer';
  return v;
};
for (const [k, r] of Object.entries(snap.routes)) {
  if (/^GET \/api\/(hardware|local|health|setup|doctor|me\/)/.test(k)) { try { r.b = JSON.stringify(scrubValue(JSON.parse(r.b))); } catch { /* not json */ } }
  for (const p of PRIVATE) r.b = r.b.split(p).join('sample-computer');
}
const all = JSON.stringify(snap);
const leaks = PRIVATE.filter(p => all.includes(p)).concat(/[\w.+-]+@(gmail|icloud|outlook|hotmail)\.com/i.test(all) ? ['an email address'] : []).concat(/sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}/.test(all) ? ['something like a key'] : []);
if (leaks.length) throw new Error(`privacy check failed: the snapshot still has ${leaks.length} private item(s); nothing written`);
fs.writeFileSync(path.join(OUT, 'snap.json'), all);
say(`snapshot: ${Object.keys(snap.routes).length} answers, ${(all.length / 1e6).toFixed(1)} MB, privacy check passed`);

fs.cpSync(path.join(BUILD, 'assets'), path.join(OUT, 'assets'), { recursive: true });
fs.copyFileSync(path.join(BUILD, 'try/index.html'), path.join(OUT, 'index.html'));
fs.copyFileSync(path.join(REPO, 'web/try/sw.js'), path.join(OUT, 'sw.js'));
fs.copyFileSync(path.join(REPO, 'web/public/favicon.svg'), path.join(OUT, 'favicon.svg'));
const du = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? du(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
say(`done: ${path.relative(REPO, OUT)} = ${(du(OUT) / 1e6).toFixed(1)} MB (app ${(du(path.join(OUT, 'assets')) / 1e6).toFixed(1)} MB, media ${(du(path.join(OUT, 'm')) / 1e6).toFixed(1)} MB)`);
fs.rmSync(TMP, { recursive: true, force: true });
