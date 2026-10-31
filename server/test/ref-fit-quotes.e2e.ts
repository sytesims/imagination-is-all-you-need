// Reference-aware model picker (2026-10-31, shared/refFit.ts + routing/quotesBatch.ts): the picker rows are quoted with what's on the bar.
// Live report: a start frame was attached (an upload, or "From image" handed over from Image: the same slot), yet every Seedance row said
// "Needs a start image". Cause: the page's quote params carried types=i2v but no image=1, so the Comfy Router route check ("needs the first
// frame") refused the quote. Now the page sends image=1 and the bar's counts, and the batch quotes each row in the mode it would run.
//  1. helper units: the run mode, the per-row notes, the params a row is quoted with;
//  2. a throwaway server (mock backend, a fake Comfy key, the Router at a dead local address: nothing leaves this computer, nothing is spent):
//     i2v without image=1 reproduces "Needs a start image"; with image=1 every Seedance row is priced; Reference mode with pictures and a video
//     prices Seedance (uses all) and Veo (image to video, start frame only) with no need.
// Run: npx tsx test/ref-fit-quotes.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { refFitOf, runModeOf, partText, bestRefPick, attachParams, attachedOf, rowRefParams, notUsedShort } from '../src/shared/refFit.js';
const ok = (m: string) => console.log('ok ' + m);

// ---- 1. helper units ----
const SEED = { modes: ['t2v', 'i2v', 'r2v'], refKinds: ['image', 'video', 'audio'], refMax: { image: 9, video: 3, audio: 3 } };
const KLING = { modes: ['t2v', 'i2v', 'flf', 'r2v'], refKinds: ['image'], refMax: { image: 7 } };
const VEO = { modes: ['t2v', 'i2v'], refKinds: ['image'], refMax: { image: 1 } };
const bar = { start: true, image: 2, video: 1, audio: 0 };
assert.equal(runModeOf(SEED, 'i2v', bar), 'r2v', 'references on the bar: Reference mode when the model has it');
assert.equal(runModeOf(VEO, 'r2v', bar), 'i2v', 'no Reference mode: image to video with the start frame');
assert.equal(runModeOf(VEO, 'r2v', { start: false, image: 2, video: 0, audio: 0 }), 't2v', 'nothing it can use: its first mode');
{ const f = refFitOf(SEED, bar, 'r2v'); assert.equal(f.all, true); assert.deepEqual(f.parts.map(partText), ['Uses your 3 pictures', 'Uses your video']); }
{ const f = refFitOf(KLING, bar, 'r2v'); assert.equal(f.all, false); assert.deepEqual(f.parts.map(partText), ['Uses your 3 pictures', 'Skips your video']); assert.equal(notUsedShort(f), 'Video not used'); }
{ const f = refFitOf(VEO, bar, 'r2v'); assert.deepEqual(f.parts.map(partText), ['Start frame', 'Skips your 2 pictures', 'Skips your video']); assert.equal(f.caps.refs, 0); }
{ const f = refFitOf({ ...KLING, refMax: { image: 2 } }, { start: false, image: 5, video: 0, audio: 0 }, 'r2v'); assert.deepEqual(f.parts.map(partText), ['Uses 2 of your 5 pictures']); }
{ const f = refFitOf({ modes: ['keyframes'], refKinds: ['image'], refMax: { image: 5 } }, { start: true, image: 0, video: 0, audio: 0 }, 'i2v'); assert.deepEqual(f.parts.map(partText), ['No start frame']); }
assert.equal(bestRefPick(['veo', 'kling', 'seed'], (k) => refFitOf(({ veo: VEO, kling: KLING, seed: SEED } as any)[k], bar, 'r2v'), 'veo'), 'seed', 'Auto: the first model that uses everything');
assert.equal(bestRefPick(['veo', 'kling'], (k) => refFitOf(({ veo: VEO, kling: KLING } as any)[k], bar, 'r2v'), 'veo'), 'kling', 'none uses all: the one that uses the most');
assert.deepEqual(attachParams(bar), { image: '1', refImages: '2', refVideos: '1' }); assert.deepEqual(attachedOf(attachParams(bar)), bar);
{ const base = { types: 'r2v', duration: '5', refs: '3', refVideoSeconds: '5', ...attachParams(bar) };
  assert.deepEqual(rowRefParams(base, VEO), { types: 'i2v', duration: '5', image: '1', refImages: '2' }, 'Veo row: image to video with the start frame, no references');
  assert.deepEqual(rowRefParams(base, KLING), { types: 'r2v', duration: '5', refs: '3', image: '1', refImages: '2' }, 'Kling row: 3 pictures, no video');
  assert.deepEqual(rowRefParams(base, SEED), { ...base, refVideos: '1' }, 'Seedance row: everything');
  assert.deepEqual(rowRefParams({ types: 't2v', duration: '5' }, VEO), { types: 't2v', duration: '5' }, 'nothing attached: unchanged'); }
{ const two = rowRefParams({ types: 'r2v', refVideos: '2', refVideoSecondsEach: '5,3', refVideoSeconds: '8' }, { ...SEED, refMax: { image: 9, video: 1, audio: 3 } });
  assert.deepEqual([two.refVideos, two.refVideoSecondsEach, two.refVideoSeconds], ['1', '5', '5'], 'a row that takes one clip is quoted (and billed) for that clip'); }
ok('helper: run mode, row notes, Auto, row params');

// ---- 2. quotes with attachments ----
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'rfq-'));
const PORT = testPort(9675); const B = `http://localhost:${PORT}`;
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_LUMA_API_KEY: '', OPENHIGGSFIELD_ARK_API_KEY: '', OPENHIGGSFIELD_USE_LOCAL: '' };
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, COMFY_API_KEY: 'test-not-a-real-key', OPENHIGGSFIELD_COMFY_ROUTER_URL: 'http://127.0.0.1:9', COMFY_BASE_URL: 'http://127.0.0.1:9', OPENHIGGSFIELD_COMFY_DETECT_URLS: 'http://127.0.0.1:9',
  PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json') } });
const stop = () => { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } };
const SEEDANCE = ['seedance-2.0', 'seedance-2.5', 'seedance-2.0-fast', 'seedance-2.0-mini'];
const batch = async (params: Record<string, string>, models: string[]) => { const r = await fetch(`${B}/api/models/quotes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ toolId: 'h3-video', params, models, range: false }) }); assert.equal(r.status, 200); return ((await r.json()) as any).quotes as Record<string, any>; };
const I2V = { duration: '5', resolution: '720p', types: 'i2v', quality: 'quality', aspect: 'auto', audio: '1', bitrate: 'standard' };
try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  // the old request (no image=1): the Router refuses image to video without a frame → the rows' "Needs a start image"
  const before = await batch(I2V, SEEDANCE); const blocked = SEEDANCE.filter((m) => before[m]?.need?.short === 'Needs a start image');
  assert.ok(blocked.length > 0, `the cause reproduces: ${JSON.stringify(Object.values(before).map((q: any) => [q.model, q.runOn, q.runnable, q.need?.short]))}`);
  ok(`cause: types=i2v without image=1 → ${blocked.join(', ')} say "Needs a start image"`);
  // the fix: the bar's start frame (upload or hand-off) goes with the quote
  const after = await batch({ ...I2V, ...attachParams({ start: true, image: 0, video: 0, audio: 0 }) }, SEEDANCE);
  for (const m of SEEDANCE) { const q = after[m]; assert.equal(q.need, undefined, `${m}: ${JSON.stringify(q.need)}`); assert.equal(q.runnable, true, `${m} runnable: ${q.blockedReason ?? q.reason ?? ''}`); assert.ok(q.demo === true || (typeof q.credits === "number" && q.credits > 0), `${m} priced (or a free sample where it has no key): ${JSON.stringify({ c: q.credits, demo: q.demo, runOn: q.runOn, route: q.routeId })}`); }
  ok(`with image=1 every Seedance row runs: ${SEEDANCE.map((m) => `${m} ${after[m].demo ? 'sample' : after[m].credits}`).join(', ')}`);
  { const r = await fetch(`${B}/api/tools/h3-video/price?${new URLSearchParams({ ...I2V, provider: 'router-seedance', image: '1' })}`); const q = (await r.json()) as any; assert.equal(r.status, 200); assert.equal(q.runnable, true, q.blockedReason); ok('the page quote with image=1 is runnable too'); }
  // Reference mode, a start frame + 2 pictures + a 5 s video: each row in the mode it would run
  const R2V = { ...I2V, types: 'r2v', refs: '3', refVideoSeconds: '5', ...attachParams(bar) };
  const rq = await batch(R2V, ['seedance-2.0', 'kling-v3', 'veo-3.1']);
  for (const m of ['seedance-2.0', 'kling-v3', 'veo-3.1']) { assert.equal(rq[m].need, undefined, `${m}: ${JSON.stringify(rq[m].need)}`); assert.equal(rq[m].runnable, true, `${m}: ${rq[m].blockedReason ?? rq[m].reason ?? rq[m].error ?? ''}`); }
  ok(`Reference mode with references: Seedance ${rq['seedance-2.0'].credits}, Kling ${rq['kling-v3'].credits}, Veo ${rq['veo-3.1'].credits} (image to video), none "Needs a start image"`);
} finally { stop(); fs.rmSync(D, { recursive: true, force: true }); }
