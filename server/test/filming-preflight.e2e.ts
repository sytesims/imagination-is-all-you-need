// Filming pre-flight fails loudly: `check`, `on` and `status` (while on) print a FAIL block and exit non-zero when a demo-script beat would
// show add-a-key (mock backend, no keys → M3 Comfy Cloud H3 is a demo preview); `on --local` (opt-in) turns local on and passes.
// Own state file + data dirs under TMPDIR (set it to a workspace dir), FILMING_NO_RESTART, check server on :8952. Run: npx tsx test/filming-preflight.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-')); const STATE = path.join(D, 'f/state.json'); const REAL = path.join(D, 'real');
const TSX = [path.join(ROOT, 'node_modules/.bin/tsx'), path.join(ROOT, '../node_modules/.bin/tsx')].find((p) => fs.existsSync(p))!;
const env = { ...process.env, OPENHIGGSFIELD_FILMING_FILE: STATE, OPENHIGGSFIELD_DATA_DIR: REAL, FILMING_NO_RESTART: '1', PREFLIGHT_PORT: String(testPort(8952)), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '1', COMFY_API_KEY: '' };
const film = (...a: string[]) => { const r = spawnSync(TSX, ['scripts/filming-mode.ts', ...a], { cwd: ROOT, encoding: 'utf8', timeout: 400_000, env }); return { code: r.status, out: r.stdout + r.stderr }; };
const ok = (m: string) => console.log('ok ' + m);
try {
  const c = film('check'); assert.equal(c.code, 1, c.out); assert.match(c.out, /FILMING PRE-FLIGHT: FAIL/); assert.match(c.out, /FAIL M3 Generate Video · MiniMax H3 · Comfy Cloud workflow/);
  assert.match(c.out, /COMFY_API_KEY=… in .*\.env\.local/); assert.match(c.out, /npm run filming -- on --local/);
  ok('check (off, no key): FAIL block, exit 1, M3 named, both fixes printed; the shell USE_LOCAL=1 does not leak into filming');
  const on = film('on', '--no-seed'); assert.equal(on.code, 1, on.out); assert.match(on.out, /filming: ON/); assert.match(on.out, /FILMING PRE-FLIGHT: FAIL/);
  const st = film('status'); assert.equal(st.code, 1, st.out); assert.match(st.out, /FILMING PRE-FLIGHT: FAIL/);
  ok('on / status: same FAIL block, exit 1 (filming stays on so the fix can be applied)');
  const loc = film('on', '--local'); assert.equal(loc.code, 0, loc.out); assert.match(loc.out, /updated: useLocal/); assert.match(loc.out, /pre-flight: PASS/); assert.doesNotMatch(loc.out, /FAIL/);
  assert.equal(JSON.parse(fs.readFileSync(STATE, 'utf8')).useLocal, true);
  const st2 = film('status'); assert.equal(st2.code, 0, st2.out); assert.match(st2.out, /Use local ComfyUI ON \(--local\)/);
  ok('on --local (opt-in, in place): PASS, exit 0; status then passes too');
  assert.deepEqual(fs.readdirSync(path.dirname(STATE)).filter((x) => x.startsWith('preflight-')), [], 'throwaway check dirs removed');
  const off = film('off'); assert.equal(off.code, 0, off.out);
  console.log('ALL OK filming-preflight');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
