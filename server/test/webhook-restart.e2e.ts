// Webhooks + plugin toggle survive a server restart (same data dir). Run: npx tsx test/webhook-restart.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const PORT = testPort(8833), B = `http://localhost:${PORT}`, D = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-'));
const start = () => spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock' }, stdio: 'ignore', detached: true });
const up = async () => { for (let i = 0; i < 60; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); } throw new Error('no server'); };
const stop = async (p: any) => { try { process.kill(-p.pid); } catch { /* */ } for (let i = 0; i < 30; i++) { try { await fetch(`${B}/api/health`); } catch { return; } await new Promise((r) => setTimeout(r, 500)); } };
const json = (b: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
let srv = start();
try {
  await up(); await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: { mode: 'auto', allowFallback: true, useLocal: true, mockKeys: true } }) }); const mp4 = path.join(D, 's.mp4'); const png = path.join(D, 'r.png');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=854x480:rate=24', '-t', '5', '-pix_fmt', 'yuv420p', mp4]); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=512x512', '-frames:v', '1', png]);
  const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', prompt: 'x', provider: 'comfy-open', webhookUrl: `http://127.0.0.1:${testPort(8834)}/hook` })) fd.append(k, v); fd.append('video', new Blob([fs.readFileSync(mp4)]), 's.mp4'); fd.append('refs', new Blob([fs.readFileSync(png)]), 'r.png');
  const j = await (await fetch(`${B}/api/tools/object-swap/jobs`, { method: 'POST', body: fd })).json(); assert.ok(j.id, JSON.stringify(j));
  const pid = (await (await fetch(`${B}/api/plugins`)).json())[0].id; await fetch(`${B}/api/plugins/${pid}`, json({ enabled: false }));
  await stop(srv); srv = start(); await up();
  const w = await (await fetch(`${B}/api/jobs/${j.id}/webhook`)).json(); assert.equal(w.webhookUrl, `http://127.0.0.1:${testPort(8834)}/hook`);
  assert.equal((await (await fetch(`${B}/api/plugins`)).json())[0].enabled, false);
  await fetch(`${B}/api/plugins/${pid}`, json({ enabled: true }));
  console.log('ok webhook + plugin toggle survive a restart'); console.log('ALL OK webhook-restart');
} finally { await stop(srv); }
