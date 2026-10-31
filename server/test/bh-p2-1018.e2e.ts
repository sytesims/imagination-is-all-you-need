// Bug Hunter P2s (Oct 18): Character Sheet / Product Shot tool posters go through the cover fallback order (/api/posters/<id>.jpg, never a
// /samples or /examples gradient); OpenSoul's listing name is the engine 'Z-Image-Turbo + Realism LoRA' (a stack names its LoRAs without
// repeating the base); the no-clip Upscale estimate follows the selected scale / output cap and names it. Port 8961, temp data dir, mock, no keys.
// Run: npx tsx test/bh-p2-1018.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'p2-')); const PORT = testPort(8961); const B = `http://localhost:${PORT}`;
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json') } });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any; const ok = (m: string) => console.log('ok ' + m);
try {
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  const tools = await get('/api/tools'); const kinds = new Map<string, string>(((await get('/api/posters')).items as any[]).map((x) => [x.toolId, x.kind]));
  const drawtext = (() => { try { return /\bdrawtext\b/.test(execFileSync('ffmpeg', ['-hide_banner', '-filters'], { env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` }, stdio: ['ignore', 'pipe', 'ignore'] }).toString()); } catch { return false; } })(); // title cards need ffmpeg drawtext; builds without it 404 them (the web shows the tool glyph)
  for (const id of ['app-character-sheet', 'app-product-shot']) { const t = tools.find((x: any) => x.id === id);
    if (kinds.get(id) === 'card' && !drawtext) { assert.equal(t.posterUrl, null, id); assert.equal(t.posterStandIn, true, `${id}: no drawtext here, the stand-in tile instead of a 404`); continue; }
    assert.equal(t.posterUrl, `/api/posters/${id}.jpg`, id);
    const r = await fetch(B + t.posterUrl); if (r.status === 404 && kinds.get(id) === 'card' && !drawtext) { console.log(`  (no ffmpeg drawtext here: ${id} title card not rendered)`); continue; }
    assert.equal(r.status, 200); assert.match(r.headers.get('content-type') ?? '', /image\/jpeg/); }
  assert.ok(!tools.some((t: any) => /^\/(samples\/(?!presets\/)|examples\/)/.test(t.posterUrl ?? '')), 'no tool poster is a sample / example file');
  ok('Character Sheet + Product Shot posters: /api/posters/<id>.jpg (cover fallback order), JPEG; no tool poster points at /samples or /examples');
  const soul = await get('/api/routes?toolId=soul'); assert.equal(soul.displayName, 'Z-Image-Turbo + Realism LoRA');
  ok("OpenSoul listing name: 'Z-Image-Turbo + Realism LoRA'");
  const R = '/api/tools/app-video-upscale/price?route=fal:fal-ai/seedvr/upscale/video';
  const q2 = await get(R), q4 = await get(`${R}&maxOutput=1440p`), q8 = await get(`${R}&maxOutput=4k`), real = await get(`${R}&width=1280&height=720&scale=2&seconds=8`); /* 2026-10-26: SeedVR2 takes a size (1080p default), not a factor */
  assert.equal(q2.estimated, true); assert.match(q2.estimateMessage, /^Estimate for an 8 s 720p clip to 1080p \(1920×1080 out\)/); assert.deepEqual(q2.assumedOutputSize, { width: 1920, height: 1080 });
  assert.ok(q4.listCredits > q2.listCredits && q8.listCredits > q4.listCredits, `estimate follows scale / output: ${q2.listCredits} < ${q4.listCredits} < ${q8.listCredits}`);
  assert.match(q8.estimateMessage, /to 4K \(3840×2160 out\)/); assert.equal(q2.listCredits, real.listCredits, 'the 720p estimate = the price of a real 8 s 720p clip');
  ok(`no-clip Upscale estimate: selected scale and output cap priced and named (${q2.listCredits} / ${q4.listCredits} / ${q8.listCredits}); equals a real 8 s 720p clip at 2×`);
  console.log('ALL OK bh-p2-1018');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); }
