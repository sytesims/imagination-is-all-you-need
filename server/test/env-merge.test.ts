// Setup step 5: scripts/install.ps1 re-runs used to overwrite .env.local (Set-Content) and wipe saved keys. It now merges through
// scripts/env-merge.mjs like install.sh does: only the installer's own settings are replaced, everything else (keys, comments) is kept.
// Tested on a temp file (PowerShell itself isn't run here) plus a check that install.ps1 calls the merge and no longer writes the file directly.
// Run: npx tsx test/env-merge.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const M = await import(path.join(REPO, 'scripts/env-merge.mjs'));
const ok = (m: string) => console.log('ok ' + m);
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'envmerge-')); const F = path.join(D, '.env.local');
const SAVED = 'COMFY_API_KEY=comfyui-test-saved-key\nOPENHIGGSFIELD_HF_TOKEN=hf_saved_token_value\n# my note\nOPENHIGGSFIELD_BACKEND=comfy\nCOMFY_BASE_URL=http://old:8188\n';
// pure merge
{ const out = M.mergeEnv(SAVED, [['OPENHIGGSFIELD_BACKEND', 'mock'], ['OPENHIGGSFIELD_USE_LOCAL', '1']]);
  assert.match(out, /^COMFY_API_KEY=comfyui-test-saved-key$/m); assert.match(out, /^OPENHIGGSFIELD_HF_TOKEN=hf_saved_token_value$/m); assert.match(out, /^# my note$/m);
  assert.match(out, /^OPENHIGGSFIELD_BACKEND=mock$/m); assert.equal((out.match(/OPENHIGGSFIELD_BACKEND=/g) ?? []).length, 1, 'replaced in place, not duplicated'); assert.match(out, /^OPENHIGGSFIELD_USE_LOCAL=1$/m);
  assert.match(out, /^COMFY_BASE_URL=http:\/\/old:8188$/m, 'settings the installer does not pass are kept');
  assert.equal(M.mergeEnv('A=1\nexport A=2\nB=3\n', [['A', '9']]), 'A=9\nB=3\n', 'duplicates of a replaced key collapse to one');
  assert.equal(M.mergeEnv('A=1\r\nB=2\r\n', [['C', '3']]), 'A=1\r\nB=2\r\nC=3\r\n', 'Windows line endings kept');
  assert.match(M.mergeEnv('', [['X', 'y']]), /^# written by the installer.*\nX=y\n$/, 'new file: header + line'); }
// the CLI on a temp file: first run creates it (600), a re-run keeps the keys
{ const run = (...a: string[]) => execFileSync(process.execPath, [path.join(REPO, 'scripts/env-merge.mjs'), F, ...a]).toString();
  run('OPENHIGGSFIELD_BACKEND=mock', 'OPENHIGGSFIELD_USE_LOCAL=1'); if (process.platform !== 'win32') assert.equal(fs.statSync(F).mode & 0o777, 0o600);
  fs.appendFileSync(F, 'OPENHIGGSFIELD_FAL_KEY=id:secret-saved-in-settings\n'); // the user saves a key in Settings
  const said = run('OPENHIGGSFIELD_BACKEND=comfy', 'COMFY_BASE_URL=http://127.0.0.1:8188'); assert.ok(!said.includes('8188') && !said.includes('secret'), 'values never printed');
  const t = fs.readFileSync(F, 'utf8'); assert.match(t, /^OPENHIGGSFIELD_FAL_KEY=id:secret-saved-in-settings$/m, 're-run keeps the saved key'); assert.match(t, /^OPENHIGGSFIELD_BACKEND=comfy$/m); assert.match(t, /^COMFY_BASE_URL=http:\/\/127\.0\.0\.1:8188$/m);
  assert.deepEqual(fs.readdirSync(D).filter((x) => x.endsWith('.tmp')), [], 'no temp file left');
  assert.throws(() => execFileSync(process.execPath, [path.join(REPO, 'scripts/env-merge.mjs'), F, 'not a pair'], { stdio: 'ignore' }), 'bad args → exit 2'); }
// install.ps1 uses it
{ const ps = fs.readFileSync(path.join(REPO, 'scripts/install.ps1'), 'utf8'); assert.ok(!/Set-Content[^\n]*\.env\.local/.test(ps) && !/Out-File[^\n]*\.env/.test(ps), 'no direct write of the env file');
  assert.match(ps, /node scripts\/env-merge\.mjs \$envFile @envPairs/); assert.match(ps, /OPENHIGGSFIELD_ENV_FILE/); }
ok('env-merge: replaces only the installer settings, keeps saved keys and comments, 600, no temp left; install.ps1 merges instead of Set-Content');
