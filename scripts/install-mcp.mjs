#!/usr/bin/env node
// Root postinstall (G2): `npm install` / `npm ci` at the repo root also installs the MCP server's own deps (mcp/ has its own lockfile),
// so `npm run dev` (api + web + mcp) works on a fresh clone. Skips quietly when mcp/ isn't there (e.g. the Docker build stage) or with OPENHIGGSFIELD_SKIP_MCP=1.
import { existsSync } from 'node:fs'; import { spawnSync } from 'node:child_process'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const MCP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../mcp');
if (process.env.OPENHIGGSFIELD_SKIP_MCP === '1' || !existsSync(path.join(MCP, 'package-lock.json'))) process.exit(0);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// Windows: npm.cmd needs a shell; one command line rather than args + shell (Node 24 DEP0190)
const r = process.platform === 'win32' ? spawnSync(`${npm} ci --no-audit --no-fund`, { cwd: MCP, stdio: 'inherit', shell: true }) : spawnSync(npm, ['ci', '--no-audit', '--no-fund'], { cwd: MCP, stdio: 'inherit' });
if (r.status !== 0) console.warn('[postinstall] mcp/ install failed; the API and web app still run. Retry with: npm run mcp:install');
process.exit(0);
