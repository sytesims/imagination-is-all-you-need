// One isolated mock server; reject H3 motion requests before any uploads/provider calls.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { testPort } from './_ports.js';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swap-api-'));
const port = testPort(8964); const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: dir, OPENHIGGSFIELD_ENV_FILE: path.join(dir, 'unused.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DEMO_AUTO: '0' }, stdio: 'ignore' });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
  const tools = await (await fetch(`${base}/api/tools`)).json() as any[];
  const motion = tools.find(t => t.id === 'motion-transfer');
  assert.ok(!motion.providers.some((p: any) => /h3-charswap/.test(p.id)));
  assert.ok(!motion.models.some((m: any) => m.key === 'minimax-h3-character-swap'));
  assert.ok(tools.find(t => t.id === 'object-swap').models.some((m: any) => m.key === 'minimax-h3-character-swap'));
  for (const fields of [{ provider: 'comfy-h3-charswap' }, { model: 'comfy-h3-charswap' }, { model: 'minimax-h3-character-swap' }, { route: 'comfy-cloud:cloud-h3-charswap' }, { provider: 'cloud-h3-charswap' }]) {
    const q = await fetch(`${base}/api/tools/motion-transfer/price?${new URLSearchParams(fields)}`);
    assert.equal(q.status, 400); assert.equal((await q.json()).code, 'motion_model_unavailable');
    const form = new FormData(); for (const [k, v] of Object.entries(fields)) form.set(k, v);
    const r = await fetch(`${base}/api/tools/motion-transfer/jobs`, { method: 'POST', body: form });
    const body = await r.json(); assert.equal(r.status, 400); assert.equal(body.code, 'motion_model_unavailable'); assert.equal(body.charged, false);
  }
  console.log('ok mock API catalogue excludes H3 only on motion; legacy provider/model/route quotes and submits refused without charge');
} finally { server.kill('SIGTERM'); }
