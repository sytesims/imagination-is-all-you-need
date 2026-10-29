// The Video bar's popup prices = the Generate button's price (2026-10-25). For every Generate Video model (the new Router ones included:
// Seedance 2.5 / 2.0 Fast / 2.0 Mini, Veo 3.1 Fast, Kling 3.0 Omni, Wan 3.0, LTX 2.5 Pro, FLUX 3 Video, MiniMax H3) and several settings:
//  - the client helper (web/src/shared/optionPrice.ts perSecondAt: seconds × the quote's rate, server rounding) gives the same credits,
//    cost (USD, Comfy credits) and price token as GET /api/tools/h3-video/price at that length;
//  - POST /api/tools/h3-video/price-variants answers each variant exactly like GET /price with those params (lengths, resolutions, sound,
//    references);
//  - where the helper declines (a reference surcharge), the variants path is what the bar uses.
// Spare port, mock backend, scratch data dir, mock keys: no key, no paid call.
// Run: npx tsx test/video-option-prices.test.ts
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { perSecondAt, optionToken, priceDelta, etaText, localLine, rateText } from '../../web/src/shared/optionPrice.js';
import { priceToken } from '../../web/src/shared/billing.js';
import { shownCredits } from '../../web/src/shared/quote.js';
import { perSecondRun } from '../src/shared/runCost.js';

// ---- 1) helper units ----
assert.deepEqual(perSecondRun(0.08, 5), { credits: 40, estUsd: 0.4, exactUsd: 0.4, comfyUnits: 85, estUnits: 85 });
assert.equal(perSecondRun(0.24, 12, 'bfl').estUnits, 288, 'BFL credits at 100 per USD');
assert.equal(perSecondRun(0.11199, 5).credits, 56, 'rounded up per request');
assert.equal(perSecondRun(0.11199, 5).comfyUnits, 119, 'Comfy credits from the exact USD, rounded up');
assert.equal(perSecondAt({ perSecond: { usd: 0.1, credits: 10 }, credits: 51, cost: null }, 5, 6), null, 'a quote the rate can\'t reproduce (a surcharge): no client price');
assert.equal(perSecondAt({ perSecond: null, credits: 50 }, 5, 6), null, 'no rate: no client price');
assert.equal(perSecondAt({ perSecond: { usd: 0.1, credits: 10 }, credits: 50, demo: true }, 5, 6), null, 'sample run: not priced');
assert.equal(priceDelta({ credits: 40, chargeable: true, cost: { estUsd: 0.4 } }, { credits: 60, chargeable: true, cost: { estUsd: 0.6 } }, true), '+$0.20');
assert.equal(priceDelta({ credits: 40, chargeable: true, cost: { estUsd: 0.4 } }, { credits: 40, chargeable: true, cost: { estUsd: 0.4 } }, true), null, 'same price: nothing shown');
assert.equal(etaText({ lowSec: 240, highSec: 250 }), 'about 4 min'); assert.equal(etaText({ lowSec: 180, highSec: 300 }), 'about 3–5 min'); assert.equal(etaText({ lowSec: 30, highSec: 50 }), 'about 40 s'); assert.equal(etaText(null), null);
assert.match(localLine({ eta: { lowSec: 240, highSec: 250 } }), /^Free · on your computer · about 4 min$/); assert.match(localLine({ eta: null }), /^Free · on /);
assert.equal(rateText({ perSecond: { usd: 0.1716, credits: 17.16 } }, true), '$0.1716 per second'); assert.equal(rateText({ perSecond: { usd: 0.08, credits: 8 } }, true), '$0.08 per second'); assert.equal(rateText({ perSecond: null }, true), null);
console.log('ok helper units');

// ---- 2) live agreement on a spare port ----
const PORT = await new Promise<number>((res, rej) => { const s = net.createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });
const B = `http://localhost:${PORT}`, D = fs.mkdtempSync(path.join(os.tmpdir(), 'vop-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), detached: true, stdio: 'ignore',
  env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1' } });
const get = async (p: Record<string, string>) => (await fetch(`${B}/api/tools/h3-video/price?${new URLSearchParams(p)}`)).json();
const variants = async (params: Record<string, string>, vs: Record<string, Record<string, string | null>>) =>
  (await (await fetch(`${B}/api/tools/h3-video/price-variants`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ params, variants: vs }) })).json()).variants as Record<string, any>;
/** The Generate button's token for a quote (GenPrice → priceToken with shownCredits), own-accounts mode. */
const buttonToken = (q: any) => priceToken({ q, own: true, credits: shownCredits(q) });
const same = (a: any, b: any, what: string) => {
  assert.equal(a?.credits, b?.credits, `${what}: credits`);
  assert.equal(a?.cost?.estUsd, b?.cost?.estUsd, `${what}: estUsd`);
  assert.equal(a?.cost?.estUnits, b?.cost?.estUnits, `${what}: Comfy credits`);
  assert.equal(optionToken(a, true), buttonToken(b), `${what}: token`);
};
const NEW = ['router-seedance-25', 'direct-seedance-25', 'router-seedance-20-fast', 'router-seedance-20-mini', 'direct-seedance-20-fast', 'direct-seedance-20-mini', 'router-veo-fast', 'router-kling', 'router-wan3', 'router-ltx-25-pro', 'router-flux3-video', 'direct-flux3-video', 'api-minimax-h3'];
const pickDur = (l: number[]) => [...new Set([l[0], l[1], l[Math.floor(l.length / 2)], l[l.length - 2], l[l.length - 1]].filter((x) => x != null))];
let nClient = 0, nVariant = 0, nModels = 0;
try {
  for (let i = 0; i < 90; i++) { try { const h = await fetch(`${B}/api/health`); if (h.ok && /json/.test(h.headers.get('content-type') ?? '')) { const j = await h.json(); assert.equal(j.backend, 'mock'); break; } } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }
  await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: { mode: 'auto', allowFallback: true, useLocal: true, mockKeys: true } }) });
  const tool = ((await (await fetch(`${B}/api/tools`)).json()) as any[]).find((t) => t.id === 'h3-video');
  const ids: string[] = tool.providers.map((p: any) => p.id); for (const id of NEW) assert.ok(ids.includes(id), `${id} is a Generate Video model`);
  for (const prov of ids) {
    const L = tool.app.videoLimits?.[prov]; if (!L) continue; nModels++;
    const audios = L.audio?.supported && L.audio.toggle ? ['1', '0'] : [L.audio?.supported === false ? '0' : '1'];
    for (const res of L.resolutions as string[]) for (const audio of audios) {
      const durs: number[] = L.durationsByResolution?.[res] ?? L.durations; const mid = durs[Math.floor(durs.length / 2)];
      const params = { provider: prov, types: 't2v', resolution: res, aspect: 'auto', audio, bitrate: 'standard' };
      const base = await get({ ...params, duration: String(mid) }); const tag = `${prov} ${res} sound ${audio}`;
      assert.ok(typeof base.credits === 'number', `${tag}: priced`);
      // every length: the client price (per-second routes) or the variant answer = the quote Generate gets at that length
      const ds = pickDur(durs); const vs = await variants(params, Object.fromEntries(ds.map((d) => [`d${d}`, { duration: String(d) }])));
      for (const d of ds) {
        const q = await get({ ...params, duration: String(d) });
        same(vs[`d${d}`], q, `${tag} ${d} s (variants)`); nVariant++;
        const c = perSecondAt(base, mid, d);
        if (base.routeKind !== 'local' && base.perSecond && optionToken(base, true)) assert.ok(c, `${tag}: a per-second route is priced on the client`);
        if (c) { same(c, q, `${tag} ${d} s (client)`); nClient++; }
      }
      // the other resolutions (length snapped like the bar) and sound flipped: variants = GET
      const other: Record<string, Record<string, string>> = {};
      for (const r of L.resolutions as string[]) { const dl: number[] = L.durationsByResolution?.[r] ?? L.durations; const near = dl.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a)); other[`r${r}`] = { resolution: r, duration: String(near) }; }
      if (audios.length > 1) other.audio = { audio: audio === '1' ? '0' : '1', duration: String(mid) };
      const ov = await variants(params, other);
      for (const [k, o] of Object.entries(other)) { same(ov[k], await get({ ...params, ...o }), `${tag} → ${JSON.stringify(o)}`); nVariant++; }
      if (audios.length > 1 && L.audio.priceAffects === false) assert.equal(priceDelta(base, ov.audio, true), null, `${tag}: sound doesn't change the price, nothing shown`);
    }
  }
  // references: Seedance video refs (token-billed) and MiniMax H3 ref seconds: the client declines, the variants path prices the difference
  for (const prov of ['router-seedance', 'api-minimax-h3']) {
    const params = { provider: prov, types: 'r2v', resolution: tool.app.videoLimits[prov].resolutions[0], aspect: 'auto', audio: '1', bitrate: 'standard', refs: '1', refVideoSeconds: '6' };
    const q = await get({ ...params, duration: '8' }); assert.ok(typeof q.credits === 'number', `${prov} with refs: priced`);
    assert.equal(perSecondAt(q, 8, 10), null, `${prov} with reference video: not a flat per-second price, the bar asks the server`);
    const v = await variants(params, { d10: { duration: '10' }, norefs: { refVideoSeconds: null, duration: '8' } });
    same(v.d10, await get({ ...params, duration: '10' }), `${prov} refs 10 s`); nVariant++;
    const { refVideoSeconds: _r, ...noRv } = params; void _r;
    same(v.norefs, await get({ ...noRv, duration: '8' }), `${prov} without reference video`); nVariant++;
    assert.ok(priceDelta(v.norefs, q, true), `${prov}: billed reference video shows what it adds`);
  }
  // local model: free, no rate
  const loc = await get({ provider: 'comfy-wan22-5b', types: 't2v', resolution: '480p', duration: '3' }); assert.equal(loc.credits, 0); assert.equal(perSecondAt(loc, 3, 4), null);
  console.log(`ok ${nModels} video models: ${nClient} client prices and ${nVariant} variant answers equal the Generate quote`);
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); }
