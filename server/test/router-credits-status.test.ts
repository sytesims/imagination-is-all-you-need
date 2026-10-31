// Queued Router runs: the charge (X-Comfy-Credits-Used) is read from the collect response, else from the COMPLETED status read (2026-10-31).
// docs.comfy.org/development/comfy-router/reference: the status read (RouterQueueStatusResponse) and the result both list X-Comfy-Credits-Used.
// Before, only the collect header was read, and P-Video-2 / HeyGen Starfish jobs recorded no cost. A missing header everywhere stays "not reported".
// Run: npx tsx test/router-credits-status.test.ts   (in-process fake fetch, fake key, no network, no spend)
import assert from 'node:assert/strict';
const { ComfyRouter } = await import('../src/comfyRouter.ts');
const BASE = 'https://router.example.test';
type Hdr = Record<string, string>;
/** A fake Router: submit → one COMPLETED status → collect, with the credits header on whichever response the case says. */
function fakeRouter(o: { statusCredits?: string; collectCredits?: string }) {
  const id = '11111111-2222-3333-4444-555555555555'; const u = (s: string) => `${BASE}/v2/models/pruna/p-video-2/requests/${id}${s}`;
  const json = (body: unknown, status = 200, h: Hdr = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...h } });
  return (async (url: string | URL, init?: RequestInit) => { const s = String(url);
    if (init?.method === 'POST') return json({ request_id: id, status_url: u('/status'), response_url: u(''), cancel_url: u('/cancel') }, 201);
    if (s.endsWith('/status')) return json({ status: 'COMPLETED', request_id: id }, 200, o.statusCredits ? { 'x-comfy-credits-used': o.statusCredits } : {});
    return json({ status: 'succeeded', generation_url: 'https://x.test/v.mp4' }, 200, o.collectCredits ? { 'x-comfy-credits-used': o.collectCredits } : {});
  }) as typeof fetch;
}
const run = (o: Parameters<typeof fakeRouter>[0]) => new ComfyRouter('test-key', fakeRouter(o), BASE, async () => {}).runQueued('pruna/p-video-2', { input: { prompt: 'x' } }, 'idem-1');

assert.equal((await run({ statusCredits: '15.09' })).creditsUsed, 15.09, 'only the status read carries it: used');
assert.equal((await run({ collectCredits: '41.04' })).creditsUsed, 41.04, 'the collect header as before');
assert.equal((await run({ statusCredits: '1', collectCredits: '41.04' })).creditsUsed, 41.04, 'both: the result response wins');
assert.equal((await run({})).creditsUsed, null, 'neither: not reported (never read as free)');
const r: any = await run({}); assert.equal(r.json.generation_url, 'https://x.test/v.mp4');
console.log('ok router-credits-status: credits from the collect header, else the COMPLETED status header; none = not reported');
