// H+ storage: TRASH_DAYS parsing never silently disables cleanup; install.sh merges .env.local (mode 600, keys kept on re-run);
// the server saves keys to OPENHIGGSFIELD_ENV_FILE when it is set. Run: npx tsx test/storage-h.test.ts
import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const REPO = path.resolve(import.meta.dirname, '../..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'storh-')); process.env.OPENHIGGSFIELD_DATA_DIR = path.join(D, 'data');
const ok = (m: string) => console.log('ok ' + m);
// 1. TRASH_DAYS
{ const { parseTrashDays } = await import('../src/routesEdge.ts');
  for (const [raw, days, warn] of [[undefined, 30, false], ['', 30, false], ['0', 0, false], ['7', 7, false], ['0.5', 0.5, false], ['abc', 30, true], ['-1', 30, true], ['30d', 30, true]] as const) {
    const r = parseTrashDays(raw as any); assert.equal(r.days, days, String(raw)); assert.equal(!!r.warning, warn, String(raw)); }
  const out = execFileSync(path.join(REPO, 'node_modules/.bin/tsx'), ['-e', "import('./src/routesEdge.ts').then((m) => { console.log('DAYS', m.TRASH_DAYS); process.exit(0); })"], { cwd: path.join(REPO, 'server'), env: { ...process.env, OPENHIGGSFIELD_TRASH_DAYS: 'thirty', OPENHIGGSFIELD_DATA_DIR: path.join(D, 'd2') }, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.match(out.toString(), /DAYS 30/); ok('TRASH_DAYS: non-numeric or negative → warning + default 30 (never off); 0 still means never'); }
// 2. install.sh env-file helpers: merge, mode 600, keys kept
{ const sh = fs.readFileSync(path.join(REPO, 'scripts/install.sh'), 'utf8'); const helpers = sh.slice(sh.indexOf('# ---- env-file helpers'), sh.indexOf('# ---- end env-file helpers')); assert.ok(helpers.includes('env_set'));
  const H = path.join(D, 'helpers.sh'); fs.writeFileSync(H, helpers); const F = path.join(D, '.env.local'); fs.writeFileSync(F, '# mine\nOPENHIGGSFIELD_FAL_KEY=keep-me-123\nOPENHIGGSFIELD_BACKEND=comfy\n', { mode: 0o644 });
  const run = () => execFileSync('bash', ['-c', `set -euo pipefail; . ${JSON.stringify(H)}; F=${JSON.stringify(F)}; env_init "$F"; env_set "$F" OPENHIGGSFIELD_BACKEND mock; env_set "$F" OPENHIGGSFIELD_USE_LOCAL 1`]);
  run(); run(); const t = fs.readFileSync(F, 'utf8');
  assert.match(t, /^OPENHIGGSFIELD_FAL_KEY=keep-me-123$/m); assert.match(t, /^# mine$/m); assert.equal(t.match(/^OPENHIGGSFIELD_BACKEND=/gm)!.length, 1); assert.match(t, /^OPENHIGGSFIELD_BACKEND=mock$/m); assert.equal(t.match(/^OPENHIGGSFIELD_USE_LOCAL=1$/gm)!.length, 1);
  assert.equal(fs.statSync(F).mode & 0o777, 0o600); assert.deepEqual(fs.readdirSync(D).filter((f) => f.startsWith('.env.local.')), [], 'no temp files left');
  const N = path.join(D, 'new.env'); execFileSync('bash', ['-c', `. ${JSON.stringify(H)}; env_init ${JSON.stringify(N)}; env_set ${JSON.stringify(N)} A 1`]); assert.equal(fs.statSync(N).mode & 0o777, 0o600);
  ok('install.sh: re-run merges into .env.local (saved key + comments kept, one line per setting), file mode 600, new file 600'); }
// 3. OPENHIGGSFIELD_ENV_FILE: the server saves keys to that file
{ const out = execFileSync(path.join(REPO, 'node_modules/.bin/tsx'), ['-e', "import('./src/routing/settings.ts').then((s) => { console.log('ENVF', s.ENV_LOCAL); process.exit(0); })"], { cwd: path.join(REPO, 'server'), env: { ...process.env, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'vol/.env.local'), OPENHIGGSFIELD_DATA_DIR: path.join(D, 'd3') } }).toString();
  assert.ok(out.includes(`ENVF ${path.join(D, 'vol/.env.local')}`), out); ok('the server saves keys to OPENHIGGSFIELD_ENV_FILE'); }
console.log('ALL OK storage-h');
