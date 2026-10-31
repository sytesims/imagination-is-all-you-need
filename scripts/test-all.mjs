#!/usr/bin/env node
// Runs the server test files (server/test/*.test.ts and *.e2e.ts) in parallel. No dependencies beyond Node.
// Guide: docs/TESTING.md.
//
//   npm test                         every test, N at a time (N = CPU cores - 2)
//   npm test -- --only queue         only files whose name contains "queue" (a plain substring or a /regex/)
//   npm test -- --changed            only tests touched by your changes vs main (see changedTests below)
//   npm test -- --jobs 4 | --serial  how many at once (--serial = 1)
//   npm test -- --shard 2/4          the 2nd quarter of the files (CI splits the suite over machines with this)
//   npm test -- --timeout 300        seconds before a test is stopped (default 240)
//   npm test -- --list               print the chosen files and exit
//
// Every test gets its own scratch folder (data dir, env file, filming file, TMPDIR) and runs with no provider keys and the
// mock backend unless the test itself asks for something else. Each worker gets its own block of ports (TEST_PORT_OFFSET,
// read by server/test/_ports.ts), so tests that start servers never collide. Logs: .test-logs/<run>/<test>.log
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(REPO, 'server'); const TEST_DIR = path.join(SERVER, 'test');
const TIMES_FILE = path.join(REPO, 'scripts', 'test-times.json'); // last known seconds per test: longest start first, shards balance by it

// Tests that must run alone, after the parallel part. Keep this short and say why.
const SERIAL = {
  // CPU hogs: on a 2-core CI runner they starved the tests beside them into timeouts (run 40201002060, 2026-10-25)
  'model-runon.e2e.ts': 'its server stays busy with ~1300 quote+submit pairs',
  'pb-1018b.e2e.ts': 'two servers and ~600 media checks / mock renders',
  'model-health.e2e.ts': 'video model health: ~900 quote + submit + body checks against its own server',
  'model-health-ui.e2e.ts': 'video model health: its own API + Vite + headless Chromium, ~150 click-throughs',
};

// Tests that need longer than --timeout (seconds). Say why.
const LONG = {
  'model-runon.e2e.ts': 900, // 1301 quote+submit pairs; the server it starts keeps ~7 cores busy (2 min alone on an M1 Max, ~4 min beside other tests)
  'pb-1018b.e2e.ts': 600, // ~1.5 min alone, ~4 min beside other tests (timed out at 240 s in a parallel run, 2026-10-25)
  'model-health.e2e.ts': 1200, // ~8 min alone on an M1 Max (every video model × mode × option)
  'model-health-ui.e2e.ts': 1500, // ~15 min alone (one headless click-through per video model × mode)
};

// ---------- options ----------
const args = process.argv.slice(2); const opt = { jobs: Math.max(1, os.cpus().length - 2), timeout: 240, only: null, changed: false, shard: null, list: false, base: 'main', saveTimes: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i]; const next = () => { const v = args[++i]; if (v === undefined) die(`${a} needs a value`); return v; };
  if (a === '--jobs' || a === '-j') opt.jobs = Math.max(1, Number(next()) || 1);
  else if (a === '--serial') opt.jobs = 1;
  else if (a === '--timeout') opt.timeout = Number(next());
  else if (a === '--only') opt.only = next();
  else if (a === '--changed') opt.changed = true;
  else if (a === '--base') opt.base = next();
  else if (a === '--shard') { const m = next().match(/^(\d+)\/(\d+)$/); if (!m || +m[1] < 1 || +m[1] > +m[2]) die('--shard wants i/n, e.g. 1/4'); opt.shard = [+m[1], +m[2]]; }
  else if (a === '--list') opt.list = true;
  else if (a === '--save-times') opt.saveTimes = true;
  else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 17).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
  else if (!a.startsWith('-')) opt.only = a; // `npm test -- queue` works too
  else die(`unknown option ${a} (try --help)`);
}
function die(m) { console.error('test-all: ' + m); process.exit(2); }
const MAX_SLOTS = 21; // port blocks 10700..31700, under Linux's ephemeral range (32768+)
if (opt.jobs > MAX_SLOTS - 1) opt.jobs = MAX_SLOTS - 1;

// ---------- pick files ----------
let files = fs.readdirSync(TEST_DIR).filter((f) => /\.(test|e2e)\.ts$/.test(f)).sort();
if (opt.only) { const re = /^\/.*\/$/.test(opt.only) ? new RegExp(opt.only.slice(1, -1)) : null; files = files.filter((f) => (re ? re.test(f) : f.includes(opt.only))); }
if (opt.changed) files = changedTests(files);
const times = (() => { try { return JSON.parse(fs.readFileSync(TIMES_FILE, 'utf8')); } catch { return {}; } })();
const est = (f) => times[f] ?? (f.endsWith('.e2e.ts') ? 20 : 5);
if (opt.shard) { // greedy: biggest first onto the lightest shard, so every machine gets about the same total time
  const [i, n] = opt.shard; const bins = Array.from({ length: n }, () => ({ t: 0, f: [] }));
  for (const f of [...files].sort((a, b) => est(b) - est(a) || a.localeCompare(b))) { const b = bins.reduce((x, y) => (y.t < x.t ? y : x)); b.f.push(f); b.t += est(f); }
  files = bins[i - 1].f.sort();
}
if (opt.list) { console.log(files.join('\n')); process.exit(0); }
if (!files.length) { console.log('No test files matched.'); process.exit(0); }

// ---------- --changed: a simple import-graph heuristic ----------
// Changed files = `git diff --name-only <base>...HEAD` + uncommitted + untracked. A test runs when
//  - the test file itself changed, or
//  - any file it imports (relative imports followed recursively, in server/, web/ and readiness/) changed, or
//  - it starts the server (mentions src/index.ts) and anything the server imports changed.
// Anything outside those folders (docs, web-only styles, ...) runs nothing. Changes to package.json / package-lock.json /
// this runner run everything.
function changedTests(all) {
  const git = (a) => { try { return execFileSync('git', a, { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').filter(Boolean); } catch { return []; } };
  const changed = new Set([...git(['diff', '--name-only', `${opt.base}...HEAD`]), ...git(['diff', '--name-only', 'HEAD']), ...git(['ls-files', '--others', '--exclude-standard'])].map((f) => path.join(REPO, f)));
  if (!changed.size) return [];
  if ([...changed].some((f) => /(^|\/)(package(-lock)?\.json|test-all\.mjs)$/.test(f) && !f.includes('/mcp/'))) return all;
  const deps = new Map();
  const importsOf = (file) => {
    if (deps.has(file)) return deps.get(file); const out = new Set(); deps.set(file, out);
    let src = ''; try { src = fs.readFileSync(file, 'utf8'); } catch { return out; }
    const specs = [...src.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"`](\.{1,2}\/[^'"`$]+)['"`]/g)].map((m) => m[1]);
    if (/src\/index\.ts/.test(src) && file.startsWith(TEST_DIR)) specs.push(path.relative(path.dirname(file), path.join(SERVER, 'src/index.ts')));
    for (const s of specs) {
      const abs = path.resolve(path.dirname(file), s); const cands = [abs, abs.replace(/\.m?js$/, '.ts'), abs.replace(/\.js$/, '.tsx'), abs + '.ts', abs + '.tsx', path.join(abs, 'index.ts')];
      const hit = cands.find((c) => { try { return fs.statSync(c).isFile(); } catch { return false; } }); if (hit) out.add(hit);
    }
    return out;
  };
  const closure = (file) => { const seen = new Set(); const st = [file]; while (st.length) { const f = st.pop(); if (seen.has(f)) continue; seen.add(f); for (const d of importsOf(f)) st.push(d); } return seen; };
  return all.filter((t) => [...closure(path.join(TEST_DIR, t))].some((f) => changed.has(f)));
}

// ---------- run ----------
const RUN = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const LOGS = path.join(REPO, '.test-logs', RUN); fs.mkdirSync(LOGS, { recursive: true });
// short paths: tsx puts an IPC socket under TMPDIR, and Unix socket paths max out near 104 characters
// TEST_SCRATCH=<short prefix> puts the scratch folders elsewhere (e.g. on a small disk image, to see which tests depend on free disk space)
const SCRATCH = fs.mkdtempSync(process.env.TEST_SCRATCH || (fs.existsSync('/tmp') ? '/tmp/ohft-' : path.join(os.tmpdir(), 'ohft-'))); let seq = 0;
// a LONG limit is for the default 240 s; a bigger --timeout (slow CI machines) scales it by the same factor
const limitOf = (file) => Math.max(opt.timeout, Math.round((LONG[file] ?? 0) * Math.max(1, opt.timeout / 240)));
const CI = !!process.env.CI; // GitHub Actions: print the end of each failed log in the job output, so a failure can be read without the artifact
// tsx's own entry run with this node (node_modules/.bin/tsx is a shell script on Windows, which spawn can't start)
const TSX = [path.join(REPO, 'node_modules/tsx/dist/cli.mjs'), path.join(SERVER, 'node_modules/tsx/dist/cli.mjs')].find((p) => fs.existsSync(p)) || die('tsx not found: run npm install first');
const WIN = process.platform === 'win32';
/** Stops a test and everything it started: its process group, or on Windows (no groups, no negative pids) its process tree. */
const killTree = (p) => { try { if (WIN) execFileSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' }); else process.kill(-p.pid, 'SIGKILL'); } catch { /* already gone */ } };
const KEY_VARS = /^(OPENHIGGSFIELD_|OPENJUTSU_|COMFY_API_KEY$|FAL_KEY$|REPLICATE_API_TOKEN$|.*_API_KEY$|.*_API_TOKEN$|.*_SECRET$)/;
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !KEY_VARS.test(k)));
const parallel = files.filter((f) => !SERIAL[f]); const serial = files.filter((f) => SERIAL[f]);
parallel.sort((a, b) => est(b) - est(a) || a.localeCompare(b)); // longest first: the slow ones don't end up last
const results = []; const running = new Map(); let done = 0; const t0 = Date.now(); const TTY = process.stdout.isTTY;
// start at a random slot: runs from two checkouts at once (parallel agents) then rarely want the same ports
const freeSlots = (() => { const k = Math.floor(Math.random() * MAX_SLOTS); return Array.from({ length: MAX_SLOTS }, (_, i) => (i + k) % MAX_SLOTS); })();

const fmt = (s) => (s >= 60 ? `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s` : `${s.toFixed(1)}s`);
const progress = () => {
  if (!TTY) return; const fail = results.filter((r) => r.status !== 'pass').length;
  const line = `[${done}/${files.length}] ${fmt((Date.now() - t0) / 1000)}  failed ${fail}  running: ${[...running.keys()].join(' ')}`;
  process.stdout.write('\r\x1b[K' + line.slice(0, (process.stdout.columns || 120) - 1));
};
const say = (m) => { if (TTY) process.stdout.write('\r\x1b[K'); console.log(m); progress(); };

/** Kills anything still listening on this slot's ports (servers a stopped test left behind). Best effort; needs lsof.
 *  Only processes started from this checkout (working folder inside REPO) or this run's scratch: another checkout's test run uses the same
 *  port blocks, and sweeping its live test server killed it mid-test (voice-controls ECONNREFUSED, 2026-10-27). */
function sweepSlot(slot) {
  const lo = 8700 + 2000 + slot * 1000; let pids = [];
  try { pids = execFileSync('lsof', ['-nP', '-t', `-iTCP:${lo}-${lo + 999}`, '-sTCP:LISTEN'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').filter(Boolean).map(Number); } catch { return; }
  for (const pid of pids) if (pid !== process.pid && ownProcess(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
}
function ownProcess(pid) {
  try { const cwd = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').find((l) => l.startsWith('n'))?.slice(1) ?? '';
    const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } }; const inside = (dir) => cwd === real(dir) || cwd.startsWith(real(dir) + path.sep);
    return inside(REPO) || inside(SCRATCH); } catch { return false; }
}

// a test may leave a helper that is still writing for a moment (e.g. a delayed tmp cleanup), so removal never fails the run
function rmQuiet(p) { try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch { /* left for the OS to clean */ } }

function runOne(file) {
  return new Promise((resolve) => {
    const slot = freeSlots.shift(); const dir = path.join(SCRATCH, String(++seq)); fs.mkdirSync(path.join(dir, 'tmp'), { recursive: true });
    const env = { ...baseEnv, TEST_PORT_OFFSET: String(2000 + slot * 1000), TMPDIR: path.join(dir, 'tmp'), OPENHIGGSFIELD_DATA_DIR: path.join(dir, 'data'),
      OPENHIGGSFIELD_ENV_FILE: path.join(dir, 'none.env'), OPENHIGGSFIELD_FILMING_FILE: path.join(dir, 'filming.json'), FORCE_COLOR: '0', NO_COLOR: '1',
      OPENHIGGSFIELD_BACKEND: 'mock' /* tests run on the mock backend unless they ask for comfy (the app's own default is comfy since 2026-10-29) */,
      OPENHIGGSFIELD_COMFY_DETECT_URLS: '' /* never look for a real ComfyUI on this machine's usual ports */,
      OPENHIGGSFIELD_TOOLS_CACHE_MS: '0' /* GET /api/tools rebuilt on every read (tests drop files and read the change back at once); payload-perf tests the cache */ };
    const log = fs.openSync(path.join(LOGS, file.replace(/\.ts$/, '.log')), 'w'); const start = Date.now();
    const p = spawn(process.execPath, [TSX, path.join('test', file)], { cwd: SERVER, env, stdio: ['ignore', log, log], detached: !WIN /* Windows: detached opens a console window per test */ });
    running.set(file, p); progress(); let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(p); }, limitOf(file) * 1000);
    p.on('exit', (code, signal) => {
      clearTimeout(timer); running.delete(file); fs.closeSync(log);
      if (!WIN) killTree(p); /* the group: helpers a test left behind (on Windows the tree is gone with its root) */
      const secs = (Date.now() - start) / 1000; const status = timedOut ? 'timeout' : code === 0 ? 'pass' : 'fail';
      // a test that failed or was stopped may leave servers behind: clear its ports, and retire the slot so the next test gets clean ones
      sweepSlot(slot); if (status === 'pass') freeSlots.unshift(slot); else freeSlots.push(slot);
      results.push({ file, status, secs, code, signal }); done++;
      if (status !== 'pass') { fs.mkdirSync(path.join(LOGS, 'failed'), { recursive: true }); fs.copyFileSync(path.join(LOGS, file.replace(/\.ts$/, '.log')), path.join(LOGS, 'failed', file.replace(/\.ts$/, '.log'))); }
      if (status !== 'pass') say(`${status === 'timeout' ? 'TIMEOUT' : 'FAIL'}  ${file} (${fmt(secs)})  log: ${path.relative(REPO, path.join(LOGS, file.replace(/\.ts$/, '.log')))}`);
      else if (!TTY) console.log(`ok    ${file} (${fmt(secs)})`);
      progress(); rmQuiet(dir); resolve();
    });
  });
}

async function pool(list, n) { const q = [...list]; await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) await runOne(q.shift()); })); }

const stop = () => { for (const p of running.values()) killTree(p); process.exit(130); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
process.on('uncaughtException', (e) => { console.error(e); stop(); }); // never leave tests running behind a crashed runner

console.log(`Running ${files.length} test files, ${opt.jobs} at a time${serial.length ? ` (+${serial.length} alone at the end)` : ''}${opt.shard ? `, shard ${opt.shard.join('/')}` : ''}. Logs: ${path.relative(REPO, LOGS)}/`);
await pool(parallel, opt.jobs);
await pool(serial, 1);
if (TTY) process.stdout.write('\r\x1b[K');

// ---------- summary ----------
const total = (Date.now() - t0) / 1000; const by = (s) => results.filter((r) => r.status === s);
fs.writeFileSync(path.join(LOGS, 'summary.json'), JSON.stringify({ total, jobs: opt.jobs, results }, null, 1));
if (opt.saveTimes) { const all = { ...times }; for (const r of results) if (r.status === 'pass') all[r.file] = Math.round(r.secs * 10) / 10; fs.writeFileSync(TIMES_FILE, JSON.stringify(Object.fromEntries(Object.entries(all).sort()), null, 1) + '\n'); }
console.log('\nSlowest:'); for (const r of [...results].sort((a, b) => b.secs - a.secs).slice(0, 10)) console.log(`  ${fmt(r.secs).padStart(7)}  ${r.file}`);
console.log(`\n${by('pass').length} passed, ${by('fail').length} failed, ${by('timeout').length} timed out — ${fmt(total)} with ${opt.jobs} at a time`);
for (const r of [...by('fail'), ...by('timeout')]) console.log(`  ${r.status.toUpperCase().padEnd(7)} ${r.file}  →  ${path.relative(REPO, path.join(LOGS, r.file.replace(/\.ts$/, '.log')))}`);
if (CI) for (const r of [...by('fail'), ...by('timeout')]) { // collapsible groups in the Actions log
  let tail = ''; try { tail = fs.readFileSync(path.join(LOGS, r.file.replace(/\.ts$/, '.log')), 'utf8').split('\n').slice(-80).join('\n'); } catch { /* no log */ }
  console.log(`::group::${r.status.toUpperCase()} ${r.file} (last 80 log lines)\n${tail}\n::endgroup::`); }
rmQuiet(SCRATCH);
// keep the last 10 runs of logs
try { const runs = fs.readdirSync(path.join(REPO, '.test-logs')).filter((d) => /^\d{4}-/.test(d)).sort(); for (const d of runs.slice(0, -10)) fs.rmSync(path.join(REPO, '.test-logs', d), { recursive: true, force: true }); } catch { /* */ }
process.exit(results.every((r) => r.status === 'pass') ? 0 : 1);
