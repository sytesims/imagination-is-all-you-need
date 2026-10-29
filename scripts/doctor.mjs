#!/usr/bin/env node
// `npm run doctor`: read-only setup check (server/src/doctor/doctor.ts, run with tsx). Before `npm install` there is no tsx yet, so this file
// checks only what it can without it (Node version, dependencies) and says what to do. Exit 0 = works · 1 = something required missing · 2 = can't start.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const major = Number(process.versions.node.split('.')[0]);
const tsx = [path.join(REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(REPO, 'server', 'node_modules', 'tsx', 'dist', 'cli.mjs')].find((p) => fs.existsSync(p));
if (major < 20 || !tsx) {
  const json = process.argv.includes('--json');
  const checks = [{ id: 'node', ok: major >= 20, text: `Node ${process.versions.node}`, fix: major >= 20 ? null : 'Install Node 22 or 24 (https://nodejs.org)' }, { id: 'deps', ok: !!tsx, text: tsx ? 'App dependencies installed' : 'App dependencies not installed', fix: tsx ? null : 'npm install' }];
  if (json) console.log(JSON.stringify({ ok: false, exitCode: 2, readOnly: true, checks }, null, 2));
  else { console.log('Imagination Is All You Need · doctor · read-only\n'); for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.text}${c.fix ? `\n      fix: ${c.fix}` : ''}`); console.log('\nRun the full check after the fix: npm run doctor'); }
  process.exit(2);
}
const r = spawnSync(process.execPath, [tsx, path.join(REPO, 'server', 'src', 'doctor', 'cli.ts'), ...process.argv.slice(2)], { stdio: 'inherit', cwd: REPO });
process.exit(r.status ?? 2);
