#!/usr/bin/env node
// `npm run dev -w server`: tsx watch --env-file-if-exists=../.env.local src/index.ts, exactly as before (keys load the same way, and a keys file
// saved later in Settings is picked up on the next restart). `--no-watch` (npm start, via start:app): the same without file watching, so editing or
// updating the code never restarts a running app (and never cancels a run). Only Node's "../.env.local not found. Continuing without it." is replaced: tsx
// starts more than one Node process, so a fresh install saw it several times and it read like an error. Now one plain line, once.
import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(import.meta.resolve('tsx/cli'));
const watch = process.argv.includes('--no-watch') ? [] : ['watch'];
const child = spawn(process.execPath, [cli, ...watch, '--env-file-if-exists=../.env.local', 'src/index.ts'], { stdio: ['inherit', 'inherit', 'pipe'] });
const NO_KEYS_FILE = 'No keys file yet (.env.local). That’s fine: add keys later in Settings.';
let said = false; let buf = '';
child.stderr.on('data', (d) => { buf += d; const lines = buf.split('\n'); buf = lines.pop() ?? '';
  for (const l of lines) { if (/\.env\.local not found\. Continuing without it\./.test(l)) { if (!said) { said = true; console.log(NO_KEYS_FILE); } } else process.stderr.write(l + '\n'); } });
child.stderr.on('end', () => { if (buf) process.stderr.write(buf); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, sig) => process.exit(code ?? (sig ? 1 : 0)));
