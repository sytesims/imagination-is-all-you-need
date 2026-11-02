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

// ---- 2a. what Recreate and "See the workflow" read for each example (the recorder opens a few; every example gets them here) ----
{ const ids = new Set(); const tools = new Set(['create-image', 'h3-video', 'audio', 'three-d']);
  for (const [k, r] of Object.entries(snap.routes)) if (/^GET \/api\/jobs(\?|$)/.test(k)) { try { const b = JSON.parse(r.b); for (const j of (Array.isArray(b) ? b : b.items ?? [])) if (j?.id && j.status === 'done') { ids.add(j.id); if (j.toolId) tools.add(j.toolId); } } catch { /* not a list */ } }
  let n = 0; const keep = async (u) => { const k = `GET ${u}`; if (snap.routes[k]) return; const r = await fetch(API + u).catch(() => null); if (r?.ok) { snap.routes[k] = { s: r.status, t: 'application/json', b: await r.text() }; n++; } };
  for (const id of ids) for (const u of [`/api/jobs/${id}/prefill?action=recreate`, `/api/jobs/${id}/workflow`]) await keep(u);
  for (const t of tools) await keep(`/api/routes?toolId=${encodeURIComponent(t)}`);
  say(`examples: ${n} more answers (Recreate, workflows, routes) for ${ids.size} examples`); }

// ---- 2b. the price grid: every studio's price for each model, place and setting, asked from the mock (scripts/try/priceGrid.mjs) ----
{ for (let i = 0; i < 5; i++) { // no saved places: the server's own picks
    try { const r = await fetch(`${API}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-openhiggsfield-source': 'try build' }, body: JSON.stringify({ perTool: {}, perModel: {} }) }); if (r.ok) break; say(`routing reset: HTTP ${r.status}`); }
    catch (e) { say(`routing reset: ${e.cause?.code ?? e.message}, trying again`); } await new Promise(r => setTimeout(r, 2000)); }
  let tools = await (await fetch(`${API}/api/tools`)).json(); tools = Array.isArray(tools) ? tools : tools.tools;
  const { harvestGrid } = await import('./priceGrid.mjs'); const t0 = Date.now();
  snap.grid = await harvestGrid(API, snap.routes, tools, say);
  say(`price grid: ${Object.keys(snap.grid.cells).length} prices in ${Math.round((Date.now() - t0) / 1000)} s`); }

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
// the app's own example files the pages build a path to (Explore's looks, films, wall…): every picture and subtitle file, and any clip or
// sound whose name the app's code or a recorded answer mentions
{ const said = JSON.stringify(Object.values(snap.routes).map(r => r.b)) + fs.readdirSync(path.join(BUILD, 'assets')).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(BUILD, 'assets', f), 'utf8')).join('');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const top of ['showcase', 'examples']) for (const f of walk(path.join(REPO, 'web/public', top))) { const u = '/' + path.relative(path.join(REPO, 'web/public'), f).split(path.sep).join('/');
    if (/\.(webp|jpe?g|png|srt|vtt)$/i.test(f) || said.includes(path.basename(f).replace(/\.[a-z0-9]+$/i, ''))) urls.add(u); } }
// the example results a sample run shows (web/try/samples.json, read by the service worker from the snapshot)
snap.samples = JSON.parse(fs.readFileSync(path.join(REPO, 'web/try/samples.json'), 'utf8')); delete snap.samples._;
for (const x of Object.values(snap.samples).flat()) for (const u of [x.url, x.poster]) if (u) urls.add(u);
for (const u of [...urls]) if (/^\/(files|examples|showcase|samples)\/.*\.(mp4|webm|mov)$/i.test(u)) urls.add(`/api/media/poster?url=${encodeURIComponent(u)}`);
// Image to layers: each layered example's composite poster (the mock makes it on first ask), under the address the feed asks for
for (const r of Object.values(snap.routes)) for (const m of r.b.matchAll(/\/api\/jobs\/([A-Za-z0-9_-]+)\/layers-poster\.png/g)) urls.add(m[0]);
for (const r of Object.values(snap.routes)) for (const m of r.b.matchAll(/"id":"([A-Za-z0-9_-]+)"[^{}]*?"layersPosterUrl":"[^"]+"/g)) urls.add(`/api/jobs/${m[1]}/layers-poster.png`);
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
/** Where this build ran → where an installed app lives (scripts/get.sh puts it in ~/Imagination; the app serves on 8787 / 5174). */
const PLACES = [[fs.realpathSync(REPO), '~/Imagination'], [REPO, '~/Imagination'], [path.join(os.homedir(), '.local/node/bin/node'), 'node'],
  [`127.0.0.1:${API_PORT}`, 'localhost:8787'], [`localhost:${API_PORT}`, 'localhost:8787'], [`127.0.0.1:${WEB_PORT}`, 'localhost:5174'], [`localhost:${WEB_PORT}`, 'localhost:5174']];
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
// the recorder's own Generate presses (they only made the job shapes in snap.templates) never show as someone's runs
const RECORDER_RUNS = new Set(Object.values(snap.templates).map(j => j.id));
const notRecorders = (j) => !(j && typeof j === 'object' && (RECORDER_RUNS.has(j.id) || (j.isSample && /mock backend/.test(String(j.sampleReason ?? '')))));
for (const [k, r] of Object.entries(snap.routes)) {
  const id = k.match(/^GET \/api\/jobs\/([^/?]+)/)?.[1]; if (id && RECORDER_RUNS.has(id)) { delete snap.routes[k]; continue; }
  if (!/^GET \/api\/(jobs|assets|library|projects|spend)/.test(k)) continue;
  try { const b = JSON.parse(r.b); let n = 0;
    if (Array.isArray(b)) { const f = b.filter(notRecorders); n = b.length - f.length; if (n) r.b = JSON.stringify(f); }
    else if (b && Array.isArray(b.items)) { const f = b.items.filter(notRecorders); n = b.items.length - f.length; if (n) { b.items = f; if (typeof b.total === 'number') b.total -= n; r.b = JSON.stringify(b); } }
  } catch { /* not json */ }
}
/** Words written for a developer running the mock server, said the way a visitor of sample mode should read them. */
const WORDS = [
  [' (mock unless OPENHIGGSFIELD_BACKEND=comfy)', ''],
  ['Mock key only (test mode): no real account to read.', 'Sample mode: connect your own account in the app.'],
  ['Sample figure (mock mode, no key): shows how a connected balance looks. Not your account.', 'Sample figure: shows how a connected balance looks. Not a real account.'],
];
for (const r of Object.values(snap.routes)) for (const [a, b] of WORDS) if (r.b.includes(a)) r.b = r.b.split(a).join(JSON.stringify(b).slice(1, -1));
for (const [k, r] of Object.entries(snap.routes)) {
  if (/^GET \/api\/(hardware|local|health|setup|doctor|me\/)/.test(k)) { try { r.b = JSON.stringify(scrubValue(JSON.parse(r.b))); } catch { /* not json */ } }
  for (const [a, b] of PLACES) r.b = r.b.split(a).join(b);
  for (const p of PRIVATE) r.b = r.b.split(p).join('sample-computer');
}
const all = JSON.stringify(snap);
const leaks = PRIVATE.filter(p => all.includes(p)).concat(/\/Desktop\/|\.claude\/worktrees|sample-computer\//.test(all) ? ['a folder path of this computer'] : []).concat(/[\w.+-]+@(gmail|icloud|outlook|hotmail)\.com/i.test(all) ? ['an email address'] : []).concat(/sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}/.test(all) ? ['something like a key'] : []);
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
