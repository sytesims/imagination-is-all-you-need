// Quote = submit (2026-10-25): enum case on the quote (aspect=AUTO, quality=HIGH) and Generate Video Auto with draft on.
// Throwaway mock server :8995 (no keys, Use local off), temp data. Run: npx tsx test/quote-submit-agree.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'qsa-')); const D2 = fs.mkdtempSync(path.join(os.tmpdir(), 'qsa2-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_LUMA_API_KEY: '' };
const boot = (port: number, dir: string, extra: Record<string, string>) => spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, ...extra, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: dir, OPENHIGGSFIELD_ENV_FILE: path.join(dir, '.env.local'), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(dir, 'nofilm.json') } });
// :8995 keyless; :8996 mock keys (OPENHIGGSFIELD_MOCK_KEYS=1: the native hosted keys count as set), where Generate Video opens on its hosted default, Seedance 2.0 Mini
const p = boot(testPort(8995), D, {}); const p2 = boot(testPort(8996), D2, { OPENHIGGSFIELD_MOCK_KEYS: '1' });
let B = `http://localhost:${testPort(8995)}`; const B2 = `http://localhost:${testPort(8996)}`;
const ok = (m: string) => console.log('ok ' + m);
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: (await r.json()) as any }; };
const form = async (u: string, f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: (await r.json()) as any }; };
try {
  for (const b of [B, B2]) for (let i = 0; i < 240; i++) { try { if ((await fetch(`${b}/api/config`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  {
  // 1. Enum case: the quote validates + normalises like the submit, before the per-model checks
  { for (const [a, ql] of [['AUTO', 'HIGH'], ['Auto', 'High'], ['auto', 'high'], ['aUtO', 'hIgH']]) {
      const q = await get(`/api/tools/create-image/price?provider=api-ideogram&aspect=${a}&quality=${ql}`); assert.equal(q.status, 200, `${a}/${ql} ${JSON.stringify(q.body)}`); assert.equal(q.body.quality, 'high');
      const s = await form('/api/tools/create-image/jobs', { rights: '1', prompt: 'a mug', types: '["generate"]', provider: 'api-ideogram', aspect: a, quality: ql }); assert.equal(s.status, 200, `${a}/${ql} ${JSON.stringify(s.body)}`); assert.equal(s.body.cost, q.body.credits); }
    for (const [k, v, code] of [['aspect', '7:7', 'unsupported_aspect'], ['aspect', 'zzq', 'invalid_aspect'], ['quality', 'ULTRA', 'invalid_quality']]) {
      const q = await get(`/api/tools/create-image/price?provider=api-ideogram&${k}=${v}`); const s = await form('/api/tools/create-image/jobs', { rights: '1', prompt: 'x', types: '["generate"]', provider: 'api-ideogram', [k]: v });
      assert.equal(q.status, 400, v); assert.equal(s.status, 400, v); assert.equal(q.body.code, code, v); assert.equal(s.body.code, code, v); assert.equal(q.body.error, s.body.error, v); assert.equal(q.body.credits, null); }
    // the default model (Nano Banana 2.1) has no quality setting: quote and submit refuse quality=HIGH the same way (the quote used to ignore the upper-case value)
    const q = await get('/api/tools/create-image/price?quality=HIGH&aspect=16:9'); const s = await form('/api/tools/create-image/jobs', { rights: '1', prompt: 'x', types: '["generate"]', quality: 'HIGH', aspect: '16:9' });
    assert.equal(q.status, 200, JSON.stringify(q.body).slice(0, 300)); assert.equal(s.status, 200, JSON.stringify(s.body)); assert.equal(s.body.cost, q.body.credits, 'quote = charge');
    assert.ok((q.body.adjustNotes ?? []).some((n: string) => /no quality setting/.test(n)), JSON.stringify(q.body.adjustNotes)); assert.ok((s.body.warnings ?? []).some((n: string) => /no quality setting/.test(n)), JSON.stringify(s.body.warnings));
    ok('enum case: AUTO/HIGH, Auto/High, auto/high, aUtO/hIgH quote 200 (quality high) and submit at the quoted cost; 7:7 / zzq / ULTRA → same 400 code + message on quote and submit; default model + quality=HIGH → runs, with the same note on both (D5)'); }
  // 2. Generate Video Auto + draft: the quote and the submit skip models with no draft mode (Seedance 2.5 on BytePlus) and pick the same one
  { B = B2; const T = '["t2v"]';
    const off = (await get(`/api/tools/h3-video/price?types=${T}`)).body; assert.equal(off.defaultProvider, 'router-ltx-25-pro', JSON.stringify(off).slice(0, 300)); assert.match(off.route, /router-ltx-25-pro$/); assert.equal(off.runnable, true); // draft off: the Video tab's cloud default (LTX-2.5 Pro, shared/cloudDefaults.ts, sponsors first 2026-10-27)
    const so = await form('/api/tools/h3-video/jobs', { rights: '1', prompt: 'a cat', types: T }); assert.equal(so.status, 200, JSON.stringify(so.body).slice(0, 300)); assert.equal(so.body.route, off.route); assert.equal(so.body.cost, off.credits);
    let dr = '';
    for (const dv of ['1', 'true', 'ON']) {
      const q = (await get(`/api/tools/h3-video/price?types=${T}&draft=${dv}`)).body; assert.equal(q.runnable, true, JSON.stringify(q).slice(0, 400)); assert.notEqual(q.route, 'direct:direct-seedance-25'); assert.ok(q.credits > 0); assert.equal(q.blockedReason, undefined);
      const s = await form('/api/tools/h3-video/jobs', { rights: '1', prompt: 'a cat', types: T, draft: dv }); assert.equal(s.status, 200, JSON.stringify(s.body).slice(0, 300)); assert.equal(s.body.route, q.route, dv); assert.equal(s.body.cost, q.credits, dv); dr = `${q.route} (${q.credits})`; }
    // draft on with a model that has no draft mode, chosen by the user: refused on both (the quote: input block, nothing chargeable; the submit: 409, nothing charged), same reason
    const q = (await get(`/api/tools/h3-video/price?types=${T}&draft=1&provider=direct-seedance-25`)).body; assert.equal(q.runnable, false); assert.equal(q.reasonCode, 'input_blocked'); assert.equal(q.chargeable, false); assert.match(q.blockedReason, /no draft mode/);
    const s = await form('/api/tools/h3-video/jobs', { rights: '1', prompt: 'a cat', types: T, draft: '1', provider: 'direct-seedance-25' }); assert.equal(s.status, 409); assert.match(s.body.error, /no draft mode/); assert.ok(s.body.error.startsWith(q.blockedReason), `${s.body.error} | ${q.blockedReason}`);
    ok(`draft: off → Seedance 2.0 Mini (${off.credits}) on quote + submit; on (1/true/ON) → Auto quotes and submits ${dr}; explicit Seedance 2.5 + draft → input_blocked quote / 409 submit, "no draft mode"`); }
  console.log('ALL OK quote-submit-agree'); }
} finally { for (const x of [p, p2]) try { process.kill(-x.pid!, 'SIGTERM'); } catch { /* gone */ } await new Promise((r) => setTimeout(r, 600)); for (const d of [D, D2]) try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* still writing */ } }
