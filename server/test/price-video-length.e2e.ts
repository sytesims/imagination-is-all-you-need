// GET /api/tools/:id/price with videoPath=/files/… (what the MCP quote sends): a trim-aware Video Swap tool is priced from the clip's real length
// (or its trimStart–trimEnd range), the same length the submit bills, so an MCP quote_id matches the job (no 409 route_changed).
// Run: npx tsx test/price-video-length.e2e.ts (port 9282; temp data dir, mock backend, mock keys, no network; needs ffmpeg on PATH).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, spawnSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'price-vlen-')); const ok = (m: string) => console.log('ok ' + m);
const PORT = testPort(9282); const B = `http://localhost:${PORT}`; const PATH = `/opt/homebrew/bin:${process.env.PATH}`;
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=854x480:rate=30:duration=6', '-pix_fmt', 'yuv420p', path.join(D, 'six.mp4')], { env: { ...process.env, PATH } }); assert.equal(r.status, 0);
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PATH, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_KEYS: '1', COMFY_API_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_USE_LOCAL: '', OPENHIGGSFIELD_BILLING_MODE: '' }, stdio: 'ignore', detached: true });
const price = async (q: string) => (await (await fetch(`${B}/api/tools/object-swap/price?model=kling-v3-omni-edit&runOn=comfy-cloud&video=1&refs=1&${q}`)).json()) as any;
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((res) => setTimeout(res, 500)); }
  const def = await price(''); const six = await price('duration=6'); const viaPath = await price('videoPath=%2Ffiles%2Fsix.mp4');
  assert.notEqual(def.credits, six.credits, 'per-second pricing: the default length differs from 6 s'); assert.equal(viaPath.credits, six.credits, 'videoPath prices the clip\'s real 6 s');
  const range = await price('videoPath=%2Ffiles%2Fsix.mp4&trimStart=1&trimEnd=5'); assert.equal(range.credits, (await price('duration=4')).credits, 'a trim range prices its own length');
  const missing = await price('videoPath=%2Ffiles%2Fnope.mp4'); assert.equal(missing.credits, def.credits, 'unknown file: default length');
  const escape = await price('videoPath=%2Ffiles%2F..%2F..%2Fetc%2Fpasswd'); assert.equal(escape.credits, def.credits, 'no path escape');
  const own = await (await fetch(`${B}/api/tools/footage-fx/price?videoPath=%2Ffiles%2Fsix.mp4&video=1`)).json() as any; assert.ok(own.credits != null, 'a tool without trim ignores videoPath');
  ok(`videoPath: 6 s clip → ${viaPath.credits} credits (default ${def.credits}), range 1–5 s → ${range.credits}; missing file / path escape fall back`);
  console.log('ALL OK price-video-length');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); }
