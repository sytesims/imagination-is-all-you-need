// E2E (own mock server, temp data dir): Recreate fills the box with the user's words as chips, never a model's rewritten form (2026-10-26:
// a Motion Control job stored "In <<<video_1>>> … <<<image_1>>>" and that form came back into the prompt box). Run: npx tsx test/prompt-restore.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9623); const B = `http://localhost:${PORT}`;
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'prestore-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0' }, stdio: 'ignore', detached: true });
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: await r.json() as any }; };
const IMG = path.join(D, 'a.png'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=512x512', '-frames:v', '1', IMG]);
const submit = async (tool: string, f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); fd.append('image', new Blob([fs.readFileSync(IMG)]), 'a.png'); const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const _done = async (id: string) => { for (let i = 0; i < 300; i++) { const j = (await get(`/api/jobs/${id}`)).body; if (['done', 'failed', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout'); };
try {
  for (let i = 0; i < 90; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  { const r = await submit('app-relight', { prompt: 'In <<<video_1>>>, the woman from <<<image_1>>> and <Picture 2> dances' }); assert.equal(r.status, 200, JSON.stringify(r.body)); const j = await _done(r.body.id);
    const p = (await get(`/api/jobs/${j.id}/prefill?action=recreate`)).body; assert.equal(p.form.prompt, 'In @video1, the woman from @image1 and @image2 dances', 'chips, not model tokens');
    console.log('ok Recreate: model tokens come back as chips'); }
  { const words = 'a red mug, Image 1 style, @image1 on the left'; const r = await submit('app-relight', { prompt: words }); const j = await _done(r.body.id);
    const p = (await get(`/api/jobs/${j.id}/prefill?action=recreate`)).body; assert.equal(p.form.prompt, words, 'typed words exactly as typed');
    console.log('ok Recreate: typed words unchanged'); }
  console.log('ALL OK');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
