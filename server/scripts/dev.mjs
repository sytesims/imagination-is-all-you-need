#!/usr/bin/env node
// `npm run dev -w server`: tsx watch --env-file-if-exists=<env file> src/index.ts. The env file is the same one the server saves keys to, the doctor,
// setup and the Mac app read: OPENHIGGSFIELD_ENV_FILE when set, else <repo>/.env.local (scripts/app-env.mjs resolves it, once for all of them), so keys
// saved in Settings are loaded again on the next restart. `--no-watch` (npm start, via start:app): the same without file watching, so editing or
// updating the code never restarts a running app (and never cancels a run). Only Node's "<file> not found. Continuing without it." is replaced: tsx
// starts more than one Node process, so a fresh install saw it several times and it read like an error. Now one plain line, once.
import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url'; import path from 'node:path';
import { envFile } from '../../scripts/app-env.mjs';
const cli = fileURLToPath(import.meta.resolve('tsx/cli'));
const watch = process.argv.includes('--no-watch') ? [] : ['watch'];
const child = spawn(process.execPath, [cli, ...watch, `--env-file-if-exists=${envFile}`, 'src/index.ts'], { stdio: ['inherit', 'inherit', 'pipe'] });
const NO_KEYS_FILE = `No keys file yet (${path.basename(envFile)}). That’s fine: add keys later in Settings.`;
let said = false; let buf = '';
child.stderr.on('data', (d) => { buf += d; const lines = buf.split('\n'); buf = lines.pop() ?? '';
  for (const l of lines) { if (/ not found\. Continuing without it\./.test(l)) { if (!said) { said = true; console.log(NO_KEYS_FILE); } } else process.stderr.write(l + '\n'); } });
child.stderr.on('end', () => { if (buf) process.stderr.write(buf); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, sig) => process.exit(code ?? (sig ? 1 : 0)));
