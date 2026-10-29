// Quote = submit for the swap range (2026-10-26): an upload a hair longer than its range (8.04 s video, 8.00 s audio: 193 frames at 24 fps) with range 0–8
// and 2 character images bills 8 s on the quote AND the submit (it used to bill the file's 8.04 s at submit → 409 route_changed every time).
// Kling 3.0 Omni Edit + Seedance 2.5 Edit, Motion transfer and Person swap, plus a cut range. Throwaway mock server :8937 (mock keys), temp data.
// Run: npx tsx test/swap-quote-agree.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { swapRangeSeconds } from '../src/shared/cloudSwap.js';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'sqa-')); const M = fs.mkdtempSync(path.join(os.tmpdir(), 'sqa-media-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_LUMA_API_KEY: '' };
const PORT = testPort(8937); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, OPENHIGGSFIELD_MOCK_KEYS: '1', PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json') } });
const ok = (m: string) => console.log('ok ' + m);
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
ff('-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=24', '-f', 'lavfi', '-t', '8', '-i', 'sine=frequency=440:sample_rate=48000', '-frames:v', '193', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(M, 'clip.mp4'));
for (const [n, c] of [['a', 'red'], ['b', 'blue']]) ff('-f', 'lavfi', '-i', `color=${c}:size=512x768`, '-frames:v', '1', path.join(M, `${n}.png`));
const fileLen = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(M, 'clip.mp4')]).toString());
try {
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  assert.ok(fileLen > 8.02 && fileLen < 8.06, `fixture is 8.04 s, got ${fileLen}`);
  assert.equal(swapRangeSeconds({ start: 0, end: 8 }), 8); assert.equal(swapRangeSeconds({ start: 1.5, end: 6 }), 4.5);
  for (const tool of ['motion-transfer', 'object-swap']) for (const prov of ['router-kling-edit', 'router-seedance-25-edit']) for (const [st, en] of [[0, 8], [1, 6]]) {
    const mode = tool === 'motion-transfer' ? 'motion_transfer' : 'object_swap'; const sec = swapRangeSeconds({ start: st, end: en });
    // what the Video bar quotes (SwapRange: seconds = the range) and then submits (trimStart / trimEnd, no seconds) with quotedRouteId / quotedCredits
    const q = await (await fetch(`${B}/api/tools/${tool}/price?provider=${prov}&model=${prov}&mode=${mode}&count=1&resolution=720p&keepAudio=1&trimStart=${st}&trimEnd=${en}&seconds=${sec}&width=1280&height=720&sourceResolution=720p&refs=1&video=1`)).json() as any;
    assert.ok(q.credits > 0, `${tool} ${prov} ${st}-${en} quote ${JSON.stringify(q).slice(0, 300)}`);
    const fd = new FormData(); const add = (k: string, f: string, t: string) => fd.append(k, new Blob([fs.readFileSync(path.join(M, f))], { type: t }), f);
    add('video', 'clip.mp4', 'video/mp4'); add('refs', 'a.png', 'image/png'); if (tool === 'motion-transfer') add('refs', 'b.png', 'image/png');
    for (const [k, v] of Object.entries({ rights: '1', provider: prov, mode, count: '1', resolution: '720p', keepAudio: '1', trimStart: String(st), trimEnd: String(en), ...(tool === 'object-swap' ? { target: 'the person' } : {}), quotedRouteId: q.route, quotedCredits: String(q.credits) })) fd.append(k, v);
    const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); const b = await r.json() as any;
    assert.equal(r.status, 200, `${tool} ${prov} ${st}-${en}: ${JSON.stringify(b).slice(0, 300)}`); assert.equal(b.cost, q.credits); assert.equal(b.route, q.route);
    const j = await (await fetch(`${B}/api/jobs/${b.id}`)).json() as any; if (j?.input?.duration != null) assert.equal(j.input.duration, sec, 'the job bills the range');
    // the server's own quote of that upload (videoPath, as the MCP quote does) says the same
    if (j?.input?.videoUrl && st === 0) { const qv = await (await fetch(`${B}/api/tools/${tool}/price?provider=${prov}&mode=${mode}&count=1&resolution=720p&trimStart=${st}&trimEnd=${en}&videoPath=${encodeURIComponent(j.input.videoUrl)}&width=1280&height=720&refs=1&video=1`)).json() as any; assert.equal(qv.credits, q.credits, `${tool} ${prov} videoPath quote`); }
    ok(`${tool} on ${prov}, 8.04 s upload, range ${st}–${en} s${tool === 'motion-transfer' ? ' + 2 images' : ''}: quote ${q.credits} = submit ${b.cost}`);
  }
  console.log('ALL OK swap-quote-agree');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } await new Promise((r) => setTimeout(r, 600)); for (const d of [D, M]) try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* still writing */ } }
