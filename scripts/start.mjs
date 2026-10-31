#!/usr/bin/env node
// `npm start`: runs the app the fast way, for everyday use (npm run dev stays for working on the code).
//   1. Builds the web app only when its sources changed since the last build (scripts/web-build.mjs); the first start takes a minute or two.
//   2. Starts three processes: api (the server, without file watching), web (vite preview of web/dist, with the same /api proxy
//      as dev) and mcp (HTTP). Same ports and settings as npm run dev: PORT (8787), WEB_PORT (5174), MCP_PORT (8788), .env.local.
// Nothing restarts while it runs: an update or an edit is picked up on the next start.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { REPO, apiPort, webPort, launchEnv, apiUp } from './app-env.mjs';
import { ensureWebBuild } from './web-build.mjs';

const say = (s) => console.log(`\x1b[1m==>\x1b[0m ${s}`);
if (await apiUp()) { say(`The app is already running: http://localhost:${webPort}/  (stop it first to start it again)`); process.exit(0); }
if (!ensureWebBuild({ log: say })) process.exit(1);
say(`Starting the app: http://localhost:${webPort}/  (API ${apiPort})`);
const concurrently = path.join(path.dirname(createRequire(path.join(REPO, 'package.json')).resolve('concurrently/package.json')), 'dist', 'bin', 'concurrently.js');
const child = spawn(process.execPath, [concurrently, '-n', 'api,web,mcp', '-c', 'magenta,cyan,yellow',
  'npm:start:app -w server', 'npm:preview -w web', 'npm:mcp:dev'], { cwd: REPO, stdio: 'inherit', env: launchEnv });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, sig) => process.exit(code ?? (sig ? 1 : 0)));
