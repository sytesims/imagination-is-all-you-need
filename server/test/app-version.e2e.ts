// The app's version (root package.json, one source of truth) is reported by GET /api/health and the API docs' info.version,
// and the static openapi.json agrees. Boots the server in mock mode with a temp data dir and an empty env file.
// Run: npx tsx test/app-version.e2e.ts (port 9517)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'app-version-')); const ok = (m: string) => console.log('ok ' + m);
const PORT = testPort(9517); const B = `http://localhost:${PORT}`;
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'package.json'), 'utf8')).version;
assert.match(VERSION, /^\d+\.\d+\.\d+$/, 'root package.json has a version'); ok(`root package.json version ${VERSION}`);
assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'openapi.json'), 'utf8')).info.version, VERSION, 'openapi.json info.version'); ok('openapi.json info.version matches');
const ENVF = path.join(D, 'empty.env'); fs.writeFileSync(ENVF, '');
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: ENVF, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_HOSTED: '', COMFY_BASE_URL: 'http://127.0.0.1:9' }, stdio: 'ignore', detached: true });
const down = async () => { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } for (let i = 0; i < 40; i++) { try { await fetch(`${B}/api/health`); } catch { return; } await new Promise((r) => setTimeout(r, 250)); } };
try {
  let h: any = null; for (let i = 0; i < 120 && !h; i++) { try { const r = await fetch(`${B}/api/health`); if (r.ok) h = await r.json(); } catch { /* */ } if (!h) await new Promise((r) => setTimeout(r, 500)); }
  assert.ok(h, 'server up'); assert.equal(h.version, VERSION); ok(`/api/health version ${h.version}`);
  const spec: any = await (await fetch(`${B}/api/openapi.json`)).json(); assert.equal(spec.info.version, VERSION); assert.ok(spec.components.schemas.Health.properties.version); ok('/api/openapi.json info.version + Health.version');
  console.log('ALL OK app-version');
} finally { await down(); fs.rmSync(D, { recursive: true, force: true }); }
