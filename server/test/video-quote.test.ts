// Generate Video quote extras (routing/videoQuote.ts, 2026-10-23): perSecond on per-second routes only, eta = measured / estimate / null.
// Helper checks + a live quote check on a spare port (mock backend, scratch data dir, no keys, no paid run).
// Run: npx tsx test/video-quote.test.ts
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { perSecondOf, videoEta, PER_SECOND_NOTE } from '../src/routing/videoQuote.js';
import { HOSTED_BY_ID, USD_PER_CREDIT } from '../src/shared/hostedPrices.js';

// ---- 1) helper units ----
assert.deepEqual(perSecondOf('fal:minimax/h3/text-to-video', '768p'), { usd: 0.06, credits: 6 }, 'fal H3 768p is $0.06/s');
assert.deepEqual(perSecondOf('fal:minimax/h3/text-to-video', '480p'), { usd: 0.05, credits: 5 }, 'fal H3 480p is $0.05/s');
assert.equal(perSecondOf('api-gpt-image', '1K'), null, 'per-image row: no perSecond');
assert.equal(perSecondOf('local-comfy-h3', '768p'), null, 'unknown / local row: no perSecond');
assert.equal(perSecondOf(null, '768p'), null, 'no priceRef (local, free): no perSecond');
assert.equal(perSecondOf('router-seedance', '720p', 3), null, 'token-billed with reference video: no flat per-second rate');
assert.ok(perSecondOf('router-seedance', '720p', 0), 'Seedance without reference video has a per-second rate');
assert.equal(videoEta({ etaRange: { seconds: 60, low: 50, high: 70, source: 'learned' } })?.basis, 'measured');
assert.equal(videoEta({ etaRange: { seconds: 60, low: 50, high: 70, source: 'scaled' } })?.basis, 'measured');
assert.deepEqual(videoEta({ etaRange: { seconds: 300, low: 240.4, high: 360.6, source: 'reported' } }), { lowSec: 240, highSec: 361, basis: 'estimate' });
assert.equal(videoEta({ fit: { etaRange: { seconds: null, low: null, high: null, source: 'first_run' } } }), null, 'first run: no number');
assert.equal(videoEta({ etaRange: null }), null, 'hosted route: no range');
assert.equal(videoEta({ etaRange: { low: NaN, high: 5, source: 'learned' } }), null, 'NaN never shown');
console.log('ok helper: perSecond rates, per-second only, eta sources');

// ---- 2) every per-second hosted row × duration = its per-run usd (within rounding) ----
for (const [id, h] of Object.entries(HOSTED_BY_ID)) {
  if (h.unit !== 'second' || h.videoInput) continue;
  for (const q of Object.keys(h.usdByQuality ?? { default: 0 })) {
    const ps = perSecondOf(id, q === 'default' ? undefined : q);
    if (!ps) continue;
    for (const d of [4, 7, 15]) {
      const perRunUsd = Math.max(1, Math.round((ps.usd * d) / USD_PER_CREDIT)) * USD_PER_CREDIT;
      assert.ok(Number.isFinite(ps.credits) && ps.credits > 0, `${id} credits finite`);
      assert.ok(Math.abs(ps.credits * d - perRunUsd / USD_PER_CREDIT) <= 1, `${id} ${q} ${d}s: ${ps.credits} × ${d} ≈ per-run`);
    }
  }
}
console.log('ok every per-second row: perSecond × seconds ≈ per-run usd');

// ---- 3) live quote on a spare port ----
// a free port picked by the OS (a fixed 8899 collided with another local server and the test parsed its HTML error page as JSON)
const PORT = await new Promise<number>((res, rej) => { const s = net.createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });
const B = `http://localhost:${PORT}`, D = fs.mkdtempSync(path.join(os.tmpdir(), 'vq-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), detached: true, stdio: 'ignore',
  env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BILLING_MODE: 'team', OPENHIGGSFIELD_BACKEND: 'mock' } });
const get = async (u: string) => (await fetch(B + u)).json();
const FIELDS = (q: any) => {
  assert.ok(!('perSecond' in q) || q.perSecond === null || (Number.isFinite(q.perSecond.usd) && Number.isFinite(q.perSecond.credits)), 'perSecond numeric or null');
  if (q.eta != null) { assert.ok(Number.isFinite(q.eta.lowSec) && Number.isFinite(q.eta.highSec), 'eta numeric'); assert.ok(q.eta.basis === 'measured' || q.eta.basis === 'estimate'); assert.ok(q.eta.highSec >= q.eta.lowSec); }
};
try {
  for (let i = 0; i < 60; i++) { try { const h = await fetch(`${B}/api/health`); if (h.ok && /json/.test(h.headers.get('content-type') ?? '')) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }
  await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: { mode: 'auto', allowFallback: true, useLocal: true, mockKeys: true } }) });
  const T = '&types=%5B%22t2v%22%5D&resolution=768p';
  // a per-second route: perSecond × duration = the run's credits
  for (const d of [7, 12]) {
    const q = await get(`/api/tools/h3-video/price?provider=comfy-h3&route=fal:minimax/h3/text-to-video&duration=${d}${T}`);
    FIELDS(q);
    assert.deepEqual(q.perSecond, { usd: 0.06, credits: 6 }, 'fal H3 per second');
    assert.equal(q.perSecondNote, PER_SECOND_NOTE);
    // keyless mock quote = a sample run (credits 0); listCredits is the price a keyed run charges
    const price = q.listCredits ?? q.credits;
    assert.ok(Math.abs(q.perSecond.credits * d - price) <= 1, `${d}s: ${q.perSecond.credits} × ${d} ≈ ${price}`);
    console.log(`ok live per-second route ${d}s: ${q.perSecond.credits} cr/s × ${d} = ${price} cr`);
  }
  // local route: free, no perSecond
  const loc = await get(`/api/tools/h3-video/price?provider=comfy-h3&route=local:comfy-h3&duration=6${T}`);
  FIELDS(loc);
  assert.equal(loc.credits, 0, 'local is free');
  assert.equal(loc.perSecond ?? null, null, 'local: no perSecond');
  assert.equal(loc.perSecondNote ?? null, null);
  console.log('ok local route: free, no perSecond; eta', JSON.stringify(loc.eta ?? null), `(${loc.etaRange?.source ?? 'no range'})`);
  // audio changes the rate on Kling (the audio row): perSecond follows the same row as the charge, on and off
  for (const [aud, label] of [['1', 'audio on'], ['0', 'audio off']] as const) {
    const k = await get(`/api/tools/h3-video/price?provider=router-kling&duration=5&resolution=720p&types=%5B%22t2v%22%5D&audio=${aud}`);
    FIELDS(k);
    const price = k.listCredits ?? k.credits;
    assert.ok(k.perSecond && Math.abs(k.perSecond.credits * 5 - price) <= 1, `kling ${label}: ${k.perSecond?.credits} × 5 ≈ ${price}`);
    console.log(`ok kling ${label}: ${k.perSecond.credits} cr/s × 5 = ${price} cr`);
  }
  // a range of routes: never NaN, perSecond only where the row bills per second
  for (const [prov, d] of [['router-kling', 5], ['router-veo', 6], ['router-seedance', 5], ['api-minimax-h3', 5], ['cloud-h3-wf', 5]] as const) { // Veo takes 4/6/8 s only
    const q = await get(`/api/tools/h3-video/price?provider=${prov}&duration=${d}&resolution=720p&types=%5B%22t2v%22%5D`);
    FIELDS(q);
    const price = q.listCredits ?? q.credits;
    assert.ok(q.perSecond, `${prov} is billed per second: perSecond present`);
    if (typeof price === 'number') assert.ok(Math.abs(q.perSecond.credits * d - price) <= 1, `${prov}: perSecond × ${d} ≈ ${price}`);
    console.log(`ok ${prov}: perSecond ${q.perSecond ? `${q.perSecond.credits} cr/s` : 'null'}, eta ${q.eta ? `${q.eta.lowSec}–${q.eta.highSec} s (${q.eta.basis})` : 'null'}`);
  }
} finally { try { process.kill(-srv.pid!); } catch { /* already stopped */ } }
process.exit(0);
