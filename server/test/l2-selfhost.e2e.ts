// (L2) /api/health/self-host: plain user-facing notes (note/userNote/gpuNote/userNotes) without env-var names; developer text only in devNote fields.
// Run: npx tsx test/l2-selfhost.e2e.ts (port 8972; temp data dir).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-'));
const PORT = testPort(8972); const B = `http://localhost:${PORT}`; const env: any = { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_HOSTED: '' }; delete env.OPENHIGGSFIELD_COMFY_MODELS_DIR; delete env.COMFY_MODELS_DIR;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env, stdio: 'ignore', detached: true });
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const h = (await (await fetch(`${B}/api/health/self-host`)).json()) as any;
  assert.equal(h.models.userNote, 'Set your ComfyUI models folder when you install, or ask your admin.'); assert.equal(h.models.note, h.models.userNote);
  assert.match(h.models.devNote, /models folder/); // item 2: Technical details are plain text, no env-var names
  assert.match(h.comfy.userNote, /^Preview mode/); assert.match(h.comfy.devNote, /runs in mock mode/);
  const plain = [h.models.note, h.models.userNote, h.comfy.userNote, h.gpuNote, h.gpuUserNote, ...h.userNotes].filter(Boolean);
  assert.ok(plain.length >= 2 && h.userNotes.length >= 2, JSON.stringify(h));
  for (const t of plain) { assert.ok(!/[A-Z][A-Z0-9]*_[A-Z0-9_]+|nvidia-smi|backend=|\bmock\b/.test(t), `plain note leaks dev text: ${t}`); assert.match(t, /\.$/); }
  // P2 3c: comfy.reason + every devNote are plain (no env-var names, no host paths, no tool names); comfy.code is the stable id
  assert.equal(h.comfy.code, 'backend_not_comfy'); for (const t of [h.comfy.reason, h.comfy.devNote, h.models.devNote, h.gpuDevNote].filter(Boolean)) assert.ok(!/[A-Z][A-Z0-9]*_[A-Z0-9_]+|nvidia-smi|backend=|\/workspace|\.json/.test(t), `dev text leaks: ${t}`);
  { const src = fs.readFileSync(path.join(ROOT, 'src/comfyClient.ts'), 'utf8'); for (const m of src.matchAll(/reason: ['`]([^'`]+)['`]/g)) assert.ok(!/[A-Z][A-Z0-9]*_[A-Z0-9_]+|\$\{/.test(m[1]), `comfyReady reason not plain: ${m[1]}`); }
  console.log('ok self-host notes plain:', JSON.stringify(h.userNotes)); console.log('ALL OK l2');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
