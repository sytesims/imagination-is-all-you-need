// Material Swap, several swatches in one go (2026-10-31): 1 object + 1–6 swatches → one run per swatch, one set (shared/swatchBatch.ts).
// Covers: the pure rules (keys, the 7th refused, n × the price, free stays free, the toast words, the set's state), the batch runner (n jobs
// in order, each with its set fields; one refused doesn't stop the others; never more than 6), the Canvas card's batch (cardModel.batchOf,
// the "up to 6" note) and the server: the listing's several-file slot, n jobs grouped as one set (up to 6), a failed swatch stays with its
// set in the feed, and Retry lands back in the same place of the set.
// Run: cd server && npx tsx test/material-swap-batch.e2e.ts   (temp data dir, mock backend, no keys, no network; port 9481)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import * as SB from '../src/shared/swatchBatch.ts';
const ok = (m: string) => console.log('ok ' + m);

// ---- the rules ----
assert.equal(SB.SWATCH_MAX, 6);
assert.deepEqual(SB.swatchKeys('material'), ['material', 'material#2', 'material#3', 'material#4', 'material#5', 'material#6']);
assert.equal(SB.tooManySwatches(6), ''); assert.equal(SB.tooManySwatches(7), 'Up to 6 swatches in one go: 1 not added.'); assert.equal(SB.tooManySwatches(9), 'Up to 6 swatches in one go: 3 not added.');
{ const f: Record<string, string | null> = { image: 'obj', material: 'a', 'material#2': 'b', 'material#3': 'c' };
  assert.equal(SB.nextSwatchKey(f, 'material'), 'material#4'); assert.deepEqual(SB.swatchesOf(f, 'material'), ['a', 'b', 'c']);
  const r = SB.withoutSwatch(f, 'material', 'material#2'); assert.deepEqual(SB.swatchesOf(r, 'material'), ['a', 'c'], 'removing one moves the rest up'); assert.equal(r['material#3'], null); assert.equal(r.image, 'obj');
  const full = Object.fromEntries(SB.swatchKeys('material').map((k) => [k, 'x'])); assert.equal(SB.nextSwatchKey(full, 'material'), null, 'six taken: no seventh place'); }
ok('keys: material, material#2 … #6; removing one moves the rest up; the 7th is refused in plain words');

{ const q = { credits: 4, runnable: true, cost: { estUsd: 0.04, estUnits: 4, billedTo: 'comfy-cloud' } };
  const t = SB.timesQuote(q, 4); assert.equal(t.credits, 16); assert.equal(t.cost.estUsd, 0.16); assert.equal(t.cost.estUnits, 16); assert.equal((t as any).runs, 4); assert.equal(q.credits, 4, 'the one-run quote is untouched');
  assert.equal(SB.timesQuote(q, 1), q, 'one swatch: today’s price');
  const free = SB.timesQuote({ credits: 0, localRun: true, cost: { estUsd: 0, billedTo: 'local' } }, 6); assert.equal(free.credits, 0); assert.equal(free.cost.estUsd, 0); assert.equal(free.localRun, true);
  const none = SB.timesQuote({ credits: null, priceAvailable: false }, 3); assert.equal(none.credits, null, 'no price stays no price');
  const demo = SB.timesQuote({ credits: 0, demo: true, cost: { estUsd: 0.02, demo: true } }, 2); assert.equal(demo.demo, true); assert.equal(SB.timesQuote(null, 4), null);
  assert.equal(SB.batchLabel('Swap material', 1), 'Swap material'); assert.equal(SB.batchLabel('Swap material', 4), 'Swap 4 materials'); }
ok('price: n × one run (credits, dollars, units); free stays free, a sample stays a sample, no price stays none');

// ---- the batch runner: n jobs through the caller's submit, one set ----
{ const sent: { s: string; set: Record<string, string> }[] = [];
  const r = await SB.runBatch(['a', 'b', 'c', 'd'], async (s, set) => { sent.push({ s, set }); return `job-${s}`; }, { setId: 'sw-test' });
  assert.deepEqual(sent.map((x) => x.s), ['a', 'b', 'c', 'd'], 'in order'); assert.deepEqual(r.jobIds, ['job-a', 'job-b', 'job-c', 'job-d']); assert.equal(r.started, 4);
  assert.deepEqual(sent[2].set, { compareGroup: 'sw-test', compareOf: '4', compareIndex: '2', compareKind: 'swatch' });
  assert.deepEqual(SB.batchToast(r, 4), { text: 'Swapping 4 materials. The results land together in your feed.', tone: 'info' }); }
{ const one = await SB.runBatch(['a'], async (_s, set) => { assert.deepEqual(set, {}, 'one swatch: a plain run, no set'); return 'j'; }); assert.equal(one.started, 1); }
{ let n = 0; const r = await SB.runBatch(['1', '2', '3', '4', '5', '6', '7'], async () => `j${n++}`); assert.equal(n, 6, 'never more than 6 runs'); assert.equal(r.jobIds.length, 6); }
{ const r = await SB.runBatch(['a', 'b', 'c'], async (s) => { if (s === 'b') throw new Error('Not enough credits.'); return s; });
  assert.deepEqual(r.jobIds, ['a', null, 'c'], 'one refused, the others still go'); assert.deepEqual(r.failed, [{ index: 1, error: 'Not enough credits.' }]);
  assert.deepEqual(SB.batchToast(r, 3), { text: '2 of 3 started. Swatch 2 didn’t start, so it wasn’t charged: Not enough credits.', tone: 'warn' }); }
{ let stop = false; const r = await SB.runBatch(['a', 'b', 'c'], async (s) => { stop = true; return s; }, { stop: () => stop }); assert.deepEqual(r.jobIds, ['a', null, null], 'stopped while still sending: the rest never start'); }
assert.deepEqual(SB.setState(['done', 'running', 'failed']), { done: false, ok: 1, failed: 1, running: 1 });
assert.deepEqual(SB.setState(['done', 'canceled', 'done']), { done: true, ok: 2, failed: 1, running: 0 });
ok('runner: one job per swatch in order with its set fields; one swatch is a plain run; 7 → 6; a refused one doesn’t stop the rest; a stop ends it');

// ---- the Canvas card: several Material inputs make one run each ----
{ const { batchOf } = await import('../../web/src/canvas/cardModel.ts'); const { tooManyNote } = await import('../../web/src/shared/genFlows.ts');
  const slots = [{ name: 'image' }, { name: 'material', many: true }]; const inp = (k: string) => ({ key: k, kind: 'image', url: `/files/${k}.png`, poster: '', jobId: '', label: k }) as any;
  assert.equal(batchOf(slots, { image: [inp('o')], material: [inp('m1')] }), null, 'one swatch: the plain run');
  const b = batchOf(slots, { image: [inp('o')], material: [inp('m1'), inp('m2'), inp('m3'), inp('m4')] })!; assert.equal(b.slot, 'material'); assert.equal(b.inputs.length, 4);
  assert.equal(tooManyNote({ slots: [{ name: 'image', accept: 'image', max: 1 }, { name: 'material', accept: 'image', max: 6, many: true }], maxImages: null, flow: { name: 'Material Swap' } } as any, 1, 'x'), 'Up to 6 swatches in one go: 1 not added.'); }
ok('canvas: a card with 4 swatches wired in runs 4 times; a 7th arrow says "up to 6"');

// ---- the server: the slot, the set, the feed, Retry ----
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'msbatch-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const PORT = testPort(9481); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), HOST: '127.0.0.1', OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '20', OPENHIGGSFIELD_HOSTED: '', COMFY_BASE_URL: 'http://127.0.0.1:9' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const PIC = (n: string) => new Blob([fs.readFileSync(path.resolve(ROOT, `../web/public/examples/demo/material/${n}.webp`))], { type: 'image/webp' }); /* the demo's own pictures */
const swap = async (extra: Record<string, string>) => { const f = new FormData(); f.set('image', PIC('sofa'), 'sofa.webp'); f.set('material', PIC('leather'), 'leather.webp');
  for (const [k, v] of Object.entries({ provider: 'api-nano-banana', rights: '1', ...extra })) f.set(k, v);
  const r = await fetch(`${B}/api/tools/app-material-swap/jobs`, { method: 'POST', body: f }); return { status: r.status, body: (await r.json()) as any }; };
const waitEnd = async (id: string) => { for (let i = 0; i < 600; i++) { const j = await get(`/api/jobs/${id}`); if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('job did not end'); };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const w = (await get('/api/image-workflows')).workflows.find((x: any) => x.id === 'material-swap'); assert.equal(w.slots.find((s: any) => s.name === 'material').many, 6, 'the Material slot takes up to 6');
  assert.equal(w.slots.find((s: any) => s.name === 'image').many, undefined, 'one object');
  /* six swatches, one set; swatch 3 fails during its run (mock) */
  const ids: string[] = [];
  for (let i = 0; i < 6; i++) { const r = await swap({ ...SB.setFields('sw-e2e-six', 6, i), ...(i === 2 ? { simulate: 'temporary' } : {}) }); assert.equal(r.status, 200, JSON.stringify(r.body)); ids.push(r.body.id); }
  const ends = await Promise.all(ids.map(waitEnd)); assert.deepEqual(ends.map((j) => j.status), ['done', 'done', 'failed', 'done', 'done', 'done']);
  assert.deepEqual(ends.map((j) => j.compare), ids.map((_, i) => ({ id: 'sw-e2e-six', n: 6, i, kind: 'swatch' })), 'one set of six');
  const feed = await get('/api/jobs?status=done,queued,running&limit=50&compare=sw-e2e-six'); const items = feed.items ?? feed;
  assert.equal(items.length, 6, 'the failed swatch stays with its set in the feed'); assert.ok(items.some((j: any) => j.id === ids[2] && j.status === 'failed'));
  const done = await get('/api/jobs?status=done&limit=50&compare=sw-e2e-six'); assert.equal((done.items ?? done).length, 5, 'only what finished, when only finished ones are asked for');
  /* Compare models stays at 4; a set is never more than 6 */
  const c7 = await swap({ compareGroup: 'sw-e2e-big', compareOf: '9', compareIndex: '6', compareKind: 'swatch' }); await waitEnd(c7.body.id); assert.ok(!(await get(`/api/jobs/${c7.body.id}`)).compare, 'index 6 of a set capped at 6: not in a set');
  const cm = await swap({ compareGroup: 'cmp-e2e', compareOf: '6', compareIndex: '5' }); await waitEnd(cm.body.id); assert.ok(!(await get(`/api/jobs/${cm.body.id}`)).compare, 'Compare models: still 2–4');
  /* Retry just the failed swatch: it lands in the same place of the set */
  const rr = await fetch(`${B}/api/jobs/${ids[2]}/retry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); const rb: any = await rr.json(); assert.equal(rr.status, 200, JSON.stringify(rb));
  const again = await waitEnd(rb.id); assert.equal(again.status, 'done'); assert.deepEqual(again.compare, { id: 'sw-e2e-six', n: 6, i: 2, kind: 'swatch' }); assert.equal(again.input.retryOf, ids[2]);
  ok('server: Material takes up to 6; six swatches = six jobs in one set; the failed one stays in the feed; Retry lands back as swatch 3; sets cap at 6, Compare models at 4');
} catch (e) { console.error(e); process.exitCode = 1; } finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); try { fs.rmSync(D, { recursive: true, force: true }); } catch { /* */ } }
