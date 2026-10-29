#!/usr/bin/env node
// Merge settings into the env file without losing anything (used by scripts/install.ps1; scripts/install.sh does the same in bash).
//   node scripts/env-merge.mjs <file> KEY=VALUE [KEY=VALUE ...]
// Each KEY's line is replaced (or appended); every other line, saved keys included, is kept as it was. A new file starts with a header and
// mode 600. Written through a temp file next to it, then renamed. Values are never printed.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

/** Pure merge: text in, text out. pairs = [[KEY, VALUE], ...]. */
export function mergeEnv(text, pairs, header = '# written by the installer; re-runs merge into this file and keep your saved keys') {
  const nl = text.includes('\r\n') ? '\r\n' : '\n'; const lines = text ? text.split(/\r?\n/) : [header];
  while (lines.length && lines.at(-1) === '') lines.pop();
  for (const [k, v] of pairs) { const re = new RegExp(`^\\s*(export\\s+)?${k.replace(/[^A-Za-z0-9_]/g, '')}\\s*=`); const line = `${k}=${v}`; let done = false;
    for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) { if (!done) { lines[i] = line; done = true; } else { lines.splice(i, 1); i--; } }
    if (!done) lines.push(line); }
  return lines.join(nl) + nl;
}
export function mergeEnvFile(file, pairs) {
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const out = mergeEnv(before, pairs); const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, out, { mode: 0o600 }); fs.renameSync(tmp, file); try { fs.chmodSync(file, 0o600); } catch { /* Windows */ }
  return { file, keys: pairs.map(([k]) => k) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [file, ...kv] = process.argv.slice(2);
  if (!file || !kv.length || kv.some((x) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(x))) { console.error('usage: node scripts/env-merge.mjs <file> KEY=VALUE [KEY=VALUE ...]'); process.exit(2); }
  const r = mergeEnvFile(file, kv.map((x) => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)]; }));
  console.log(`updated ${r.keys.join(', ')} in ${path.basename(r.file)} (other lines kept)`);
}
