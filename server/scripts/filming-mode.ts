/**
 * BH9 (c) filming mode.  Usage (from server/):  npm run filming -- on | off | status | check   [on --keep-comfy-key] [on --no-seed] [on --local]
 *  on      new scratch data dir (<repo>/.filming/data-<stamp>) seeded with the demo history (9 jobs, 1 project; the same set as
 *          demo:reset, mock-rendered, AI poster stills once they exist) so Assets isn't empty on camera; `--no-seed` keeps it EMPTY. The real data
 *          dir is never opened. Open-weights-only, launch-shell provider keys ignored
 *          (put a test key in <scratch>/.env.local as COMFY_API_KEY=…, or pass --keep-comfy-key to keep the shell's Comfy key),
 *          notification prompts off, no 'Use …' fallback offers. Running `on` again while on keeps the same scratch dir.
 *  off     back to the real data dir and settings. Nothing real was changed, so nothing needs restoring; the scratch dir is kept
 *          (its path is printed) and is never deleted by this script.
 *  status  prints the mode, the scratch dir and the real data dir.
 *  check   pre-flight only (also run by `on` and by `status` while on; FILMING_NO_PREFLIGHT=1 skips it): quotes every demo-script beat
 *          (scripts/filming-preflight.ts) on a throwaway server under the filming setup and prints a FAIL block + exits 1 if any beat would
 *          show add-a-key (needsKey / no_provider / demo preview). Fix: COMFY_API_KEY in <scratch>/.env.local, or `on --local`.
 *  --local opt-in: Use local ComfyUI on while filming (OPENHIGGSFIELD_USE_LOCAL=1 in the filming env); without it filming forces it off.
 *          `on --local` (or `on --keep-comfy-key`) while already on updates the flag in place and restarts the server.
 * The state file is OPENHIGGSFIELD_FILMING_FILE, else <repo>/.filming/state.json (gitignored). The server reads it at boot: under
 * `npm run dev` (tsx watch) this script touches src/env.ts so the whole server restarts by itself; otherwise restart the server.
 */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { spawnSync } from 'node:child_process';
const HERE = path.dirname(fileURLToPath(import.meta.url)); const REPO = path.resolve(HERE, '../..');
const FILE = path.resolve(process.env.OPENHIGGSFIELD_FILMING_FILE?.trim() || process.env.OPENJUTSU_FILMING_FILE?.trim() || path.join(REPO, '.filming/state.json'));
const REAL = path.resolve(process.env.OPENHIGGSFIELD_DATA_DIR || process.env.OPENJUTSU_DATA_DIR || path.join(REPO, 'server/data'));
const args = process.argv.slice(2); const cmd = args.find((a) => !a.startsWith('-')) ?? 'status';
const read = (): any => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; } };
const write = (s: any) => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); const t = `${FILE}.${process.pid}.part`; fs.writeFileSync(t, JSON.stringify(s, null, 2) + '\n'); fs.renameSync(t, FILE); };
const restart = () => { if (process.env.FILMING_NO_RESTART) return 'not touched (FILMING_NO_RESTART)'; const f = path.join(HERE, '../src/env.ts'); try { const now = new Date(); fs.utimesSync(f, now, now); return 'a running `npm run dev` restarts by itself; restart any other server (npm start) now'; } catch { return 'restart the server now'; } };
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
/** Pre-flight: a throwaway state file + data dir under .filming/ (the real scratch DB is never opened by the check server), the scratch
 *  .env.local copied so its keys count. Returns the exit code (0 pass, 1 FAIL block printed, 3 check server didn't boot). */
const preflight = (st: any): number => {
  if (process.env.FILMING_NO_PREFLIGHT) { console.log('  pre-flight: skipped (FILMING_NO_PREFLIGHT)'); return 0; }
  const dir = path.join(path.dirname(FILE), `preflight-${process.pid}`); const sf = path.join(dir, 'state.json'); const dd = path.join(dir, 'data');
  fs.mkdirSync(dd, { recursive: true });
  const envSrc = st?.dataDir ? path.join(st.dataDir, '.env.local') : null; if (envSrc && fs.existsSync(envSrc)) fs.copyFileSync(envSrc, path.join(dd, '.env.local'));
  fs.writeFileSync(sf, JSON.stringify({ on: true, dataDir: dd, since: new Date().toISOString(), keepComfyKey: !!st?.keepComfyKey, useLocal: !!st?.useLocal }));
  const tsx = path.join(HERE, '../node_modules/.bin/tsx'); const bin = fs.existsSync(tsx) ? tsx : path.join(REPO, 'node_modules/.bin/tsx');
  const r = spawnSync(bin, [path.join(HERE, 'filming-preflight.ts')], { cwd: path.join(HERE, '..'), stdio: 'inherit', timeout: 180_000,
    env: { ...process.env, OPENHIGGSFIELD_FILMING_FILE: sf, PREFLIGHT_LOCAL: st?.useLocal ? '1' : '0', FILMING_SCRATCH_ENV: envSrc ?? '<scratch data dir>/.env.local' } });
  fs.rmSync(dir, { recursive: true, force: true }); // only our own .filming/preflight-<pid> dir
  return r.status ?? 3;
};
const s = read();
if (cmd === 'on') {
  if (s?.on && s.dataDir) {
    const upd = { ...(args.includes('--local') ? { useLocal: true } : {}), ...(args.includes('--keep-comfy-key') ? { keepComfyKey: true } : {}) };
    const changed = Object.entries(upd).some(([k, v]) => s[k] !== v); if (changed) write({ ...s, ...upd });
    console.log(`filming: already ON (since ${s.since}); scratch data dir ${s.dataDir}${changed ? `\n  updated: ${Object.keys(upd).join(', ')}; server: ${restart()}` : ''}\n  local: ${(changed ? upd.useLocal ?? s.useLocal : s.useLocal) ? 'Use local ComfyUI ON (--local)' : 'off'}`);
    process.exit(preflight({ ...s, ...upd }));
  }
  const dataDir = path.join(path.dirname(FILE), `data-${stamp()}`);
  if (path.resolve(dataDir) === REAL || fs.existsSync(dataDir)) { console.error(`filming: refusing to use ${dataDir}`); process.exit(1); }
  fs.mkdirSync(dataDir, { recursive: true });
  write({ on: true, dataDir, since: new Date().toISOString(), keepComfyKey: args.includes('--keep-comfy-key'), useLocal: args.includes('--local'), realDataDir: REAL, history: s?.history ?? [] });
  let seeded = 'skipped (--no-seed): the scratch dir is empty';
  if (!args.includes('--no-seed')) { // child process under the filming state just written: env.ts points DATA_DIR at the scratch dir; mock backend, no keys
    const tsx = path.join(HERE, '../node_modules/.bin/tsx'); const bin = fs.existsSync(tsx) ? tsx : path.join(REPO, 'node_modules/.bin/tsx');
    const r = spawnSync(bin, [path.join(HERE, 'filming-seed.ts')], { cwd: path.join(HERE, '..'), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, OPENHIGGSFIELD_FILMING_FILE: FILE, OPENJUTSU_FILMING_FILE: '', OPENHIGGSFIELD_DATA_DIR: '', OPENJUTSU_DATA_DIR: '', OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_SEED_COMMUNITY: '0', FILMING_SEED_DIR: dataDir, FILMING_REAL_DIR: REAL } });
    seeded = r.status === 0 ? (r.stdout.trim().split('\n').pop() ?? 'seeded') : `FAILED (exit ${r.status}): ${(r.stderr || r.stdout).trim().split('\n').slice(-2).join(' ')}; the scratch dir is usable, just not seeded`;
  }
  console.log(`filming: ON\n  scratch data dir (new): ${dataDir}\n  demo seed: ${seeded}\n  real data dir (untouched):     ${REAL}\n  open-weights-only: on · hosted APIs hidden · notification prompts off · no fallback offers\n  keys: ${args.includes('--keep-comfy-key') ? 'the shell COMFY_API_KEY is kept; ' : ''}only keys in ${path.join(dataDir, '.env.local')} count\n  server: ${restart()}\n  leave with: npm run filming -- off`);
  console.log(`  local: ${args.includes('--local') ? 'Use local ComfyUI ON (--local)' : 'off (add --local to run locally)'}`);
  process.exit(preflight(read()));
} else if (cmd === 'off') {
  if (!s?.on) { console.log('filming: already OFF'); process.exit(0); }
  write({ on: false, lastDataDir: s.dataDir, lastSince: s.since, offAt: new Date().toISOString(), realDataDir: REAL, history: [...(s.history ?? []), { dataDir: s.dataDir, since: s.since, offAt: new Date().toISOString() }] });
  console.log(`filming: OFF\n  back on the real data dir: ${REAL}\n  scratch dir kept (delete it yourself if you like): ${s.dataDir}\n  server: ${restart()}`);
} else if (cmd === 'status') {
  console.log(s?.on ? `filming: ON since ${s.since}\n  scratch data dir: ${s.dataDir}\n  real data dir (untouched): ${REAL}` : `filming: OFF\n  data dir: ${REAL}${s?.lastDataDir ? `\n  last scratch dir: ${s.lastDataDir}` : ''}`);
  console.log(`  state file: ${FILE}`);
  if (s?.on) { console.log(`  local: ${s.useLocal ? 'Use local ComfyUI ON (--local)' : 'off'}`); process.exit(preflight(s)); }
} else if (cmd === 'check') {
  if (!s?.on) console.log('filming: OFF; checking what `on` would give with this shell (scratch keys from the last scratch dir, if any)');
  process.exit(preflight(s?.on ? s : { keepComfyKey: args.includes('--keep-comfy-key'), useLocal: args.includes('--local'), dataDir: s?.lastDataDir }));
} else { console.error('usage: npm run filming -- on | off | status | check   [on --keep-comfy-key] [on --no-seed] [on --local]'); process.exit(2); }
