// Saved-keys file reader for docker/start.mjs (KEY=value lines; # comments, optional export and quotes). Values are never printed.
import fs from 'node:fs';
export function readEnvFile(file) {
  const out = {}; if (!file || !fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) { const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line); if (!m) continue; let v = m[2].trim(); if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1); out[m[1]] = v; }
  return out;
}
