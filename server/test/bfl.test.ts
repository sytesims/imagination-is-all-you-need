// BFL client + FLUX 3 Upscaler pricing (no network: fake fetch). Run: npx tsx test/bfl.test.ts
import assert from 'node:assert/strict';
import { bflRun } from '../src/providers/bfl.js';
import { bflKleinRequest, bflVideoUpscaleRequest } from '../src/hostedRequests.js';
import { priceOf } from '../src/shared/pricing.js';
import '../src/routing/routePrices.js';
let polls = 0; const calls: any[] = [];
const f = (async (url: string, init: any) => { calls.push({ url, init }); const j = (b: any) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  if (init?.method === 'POST') return j({ id: 't1', polling_url: 'https://api.bfl.ai/v1/get_result?id=t1' });
  return j(++polls < 2 ? { status: 'Pending' } : { status: 'Ready', result: { sample: 'https://x.invalid/o.mp4' } }); }) as any;
const r = await bflRun(bflVideoUpscaleRequest({ inputVideo: 'AA', factor: 2, mode: 'creative' }), 'k', { f, pollMs: 1 });
assert.equal(r.url, 'https://x.invalid/o.mp4'); assert.equal(calls[0].init.headers['x-key'], 'k'); assert.equal(JSON.parse(calls[0].init.body).creativity, 1); assert.equal(calls[1].init.headers['x-key'], 'k');
const fm = (async (_u: string, init: any) => ({ ok: true, status: 200, json: async () => (init?.method === 'POST' ? { id: 'a', polling_url: 'p' } : { status: 'Content Moderated' }), text: async () => '' })) as any;
await assert.rejects(bflRun(bflKleinRequest({ prompt: 'x' }), 'k', { f: fm, pollMs: 1 }), /Moderated/);
assert.equal((bflKleinRequest({ prompt: 'x', images: Array(12).fill('A') }).body!.images as string[]).length, 10);
// price = MP × s × rate, rounded up: 1920×1080 (2.0736 MP) × 5 s × $0.035 = $0.36288 → 37 credits; creative × $0.05 = $0.5184 → 52 (BFL pricing re-read 2026-10-23)
const p = (mode: string) => priceOf({ toolId: 'upscale', rates: {}, quality: '1080p', durationSec: 5, provider: 'direct-flux3-upscale', megapixels: 1920 * 1080 / 1e6, mode }).credits;
assert.equal(p('precise'), 37); assert.equal(p('creative'), 52);
console.log('bfl: client submit/poll/moderation, 10-ref cap, upscale price precise 37 / creative 52 credits (1080p × 5 s) ok');
