// Hosted runs and money (audit 2026-11-01 #4, #9, #10), with FAKE providers (injected / stubbed fetch: no network, fake keys, no spend):
//  - one poll error, then success → the run succeeds (fal, Replicate, a lab API, Comfy Router, Comfy Cloud); N errors in a row → a plain
//    "lost contact … may still finish and bill" error; a 404 on the status → "no longer has this job"
//  - cancel: fal / Replicate / Router are asked to cancel; queue cancelRun on a running hosted job → canceled + the provider's own rule
//  - downloads: fail twice then succeed → saved; fail every time → a clear "made but couldn't be downloaded" error, job.remote kept
//    (collectable), and Retry download (collectAgain) then fetches it
// Run: npx tsx test/hosted-poll-tolerance.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'hostedpoll-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_ROUTING_LIVE: '1', OPENHIGGSFIELD_FAL_KEY: 'fal-fake-test-key', OPENHIGGSFIELD_REPLICATE_API_TOKEN: 'r8-fake-test-key',
  OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_HOSTED_POLL_MS: '2', OPENHIGGSFIELD_POLL_MAX_MISSES: '5' });
const ok = (m: string) => console.log('ok ' + m);
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const nap = async () => {};
const H = await import('../src/hostedPoll.ts'); H.setRetrySleep(nap);
const F = await import('../src/providers/fal.ts'); const RP = await import('../src/providers/replicate.ts'); const DR = await import('../src/providers/direct.ts');
const { ComfyRouter } = await import('../src/comfyRouter.ts'); const { ComfyCloudV2 } = await import('../src/comfy/cloudV2.ts');
type Call = { url: string; method: string };
const mk = (h: (c: Call, n: number) => Response | Promise<Response>) => { const calls: Call[] = []; const f = (async (u: any, init: any = {}) => { const c = { url: String(u), method: init.method ?? 'GET' }; calls.push(c); return h(c, calls.length); }) as typeof fetch; return { f, calls }; };
const FAL = 'https://queue.fal.run/test/vid/requests/r1';
const falSubmitted = () => json({ request_id: 'r1', status_url: `${FAL}/status`, response_url: FAL, cancel_url: `${FAL}/cancel` });

// ---- one blip, then success: every hosted runner ----
{ let st = 0; const { f } = mk((c) => c.method === 'POST' ? falSubmitted() : c.url.endsWith('/status') ? (++st === 1 ? json({ detail: 'bad gateway' }, 502) : json({ status: 'COMPLETED' })) : json({ video: { url: 'https://cdn.test/v.mp4' } }));
  const r = await F.falRun('test/vid', {}, 'k', { timeoutMs: 60_000, pollMs: 1, f, sleep: nap }); assert.equal(r.requestId, 'r1'); assert.equal(st, 2); }
{ let n = 0; const { f } = mk((c) => c.method === 'POST' ? json({ id: 'p1', status: 'starting', output: null, error: null }, 201) : (++n === 1 ? Promise.reject(new TypeError('fetch failed')) : json({ id: 'p1', status: 'succeeded', output: ['https://cdn.test/a.png'], error: null })));
  const r = await RP.replicateRun('o/m', {}, 'k', { timeoutMs: 60_000, pollMs: 1, f, sleep: nap }); assert.deepEqual(r.urls, ['https://cdn.test/a.png']); }
{ DR.registerDirectProvider({ id: 'testlab', name: 'Test Lab', tag: 'TestLab', auth: (k) => ({ Authorization: `Bearer ${k}` }), defaultBase: 'https://lab.test', pollMs: 1, httpError: (s, _j, t) => new DR.DirectError(`TestLab ${s}: ${t}`, s === 404 ? 'input_invalid' : s >= 500 ? 'provider_error' : 'input_invalid', s) });
  const spec: any = { provider: 'testlab', mode: 'poll', build: async () => ({ method: 'POST', url: 'https://lab.test/v1/gen', body: {} }), submit: (j: any) => ({ id: j.id, pollUrl: `https://lab.test/v1/get/${j.id}` }),
    poll: (j: any) => (j.status === 'done' ? { done: true, outputs: [{ url: 'https://cdn.test/v.mp4' }] } : { done: false, status: 'running' }) };
  let n = 0; const { f } = mk((c) => c.method === 'POST' ? json({ id: 'L1' }) : (++n === 1 ? json({ e: 'oops' }, 503) : n === 2 ? json({ status: 'running' }) : json({ status: 'done' })));
  const r = await DR.directRun(spec, await spec.build(), 'k', { f, sleep: nap, timeoutMs: 60_000 }); assert.equal(r.id, 'L1'); assert.equal(n, 3);
  // resume: no submit, only the poll URL from before
  const r2 = mk(() => json({ status: 'done' })); const x = await DR.directRun(spec, { method: 'GET', url: '' } as any, 'k', { f: r2.f, sleep: nap, timeoutMs: 60_000, resume: { id: 'L9', pollUrl: 'https://lab.test/v1/get/L9' } });
  assert.equal(x.id, 'L9'); assert.ok(r2.calls.every((c) => c.method === 'GET'), 'a pick-up never submits'); }
{ const B = 'https://api.comfy.test'; let st = 0;
  const { f } = mk((c) => c.method === 'POST' ? json({ request_id: 'q1', status_url: `${B}/v2/requests/q1/status`, response_url: `${B}/v2/requests/q1`, cancel_url: `${B}/v2/requests/q1/cancel` }, 201)
    : c.url.endsWith('/status') ? (++st === 1 ? json({ detail: 'upstream' }, 503) : json({ status: 'COMPLETED' })) : json({ images: ['x'] }));
  const r = await new ComfyRouter('k', f, B, nap).runQueued('p/m', {}, 'idem', {}); assert.equal(r.handle.requestId, 'q1'); assert.equal(st, 2); }
{ let st = 0; const { f, calls } = mk((c) => (++st === 1 ? json({ error: { code: 'x' } }, 502) : json({ id: 'cj-7', status: 'succeeded', outputs: [] })));
  const r = await new ComfyCloudV2('https://cloud.test', 'k', 'j-a1', f, 1).run({ '1': {} }, { resumeId: 'cj-7' }); assert.equal(r.promptId, 'cj-7');
  assert.ok(calls.every((c) => c.method === 'GET'), 'a Cloud pick-up only polls (never re-submits the graph)'); }
ok('one poll error, then success → the run succeeds (fal, Replicate, a lab API, Comfy Router, Comfy Cloud pick-up)');

// ---- N errors in a row → a plain failure; a 404 → gone ----
{ const { f } = mk((c) => c.method === 'POST' ? falSubmitted() : json({}, 503));
  await assert.rejects(F.falRun('test/vid', {}, 'k', { timeoutMs: 60_000, pollMs: 1, f, sleep: nap }), (e: any) => { assert.equal(e.lostContact, true); assert.match(e.message, /^lost contact with fal while it was running \(5 checks in a row failed.*It may still finish and bill your account/); return true; });
  const g = mk((c) => c.method === 'POST' ? falSubmitted() : json({ detail: 'not found' }, 404));
  await assert.rejects(F.falRun('test/vid', {}, 'k', { timeoutMs: 60_000, pollMs: 1, f: g.f, sleep: nap }), /fal no longer has this job/);
  const t = mk((c) => c.method === 'POST' ? falSubmitted() : json({ detail: 'bad key' }, 401));
  await assert.rejects(F.falRun('test/vid', {}, 'k', { timeoutMs: 60_000, pollMs: 1, f: t.f, sleep: nap }), /fal status 401/); assert.equal(t.calls.length, 2, 'a definite answer ends it at once'); }
ok('N poll errors in a row → "lost contact … may still finish and bill" (request id kept); 404 → "no longer has this job"; 401 → at once');

// ---- cancel calls the provider ----
{ const { f, calls } = mk((c) => c.method === 'POST' ? falSubmitted() : c.method === 'PUT' ? new Response(null, { status: 202 }) : json({ status: 'IN_PROGRESS' }));
  let n = 0; await assert.rejects(F.falRun('test/vid', {}, 'k', { timeoutMs: 60_000, pollMs: 1, f, sleep: nap, isCanceled: () => ++n > 2 }), /canceled/);
  assert.ok(calls.some((c) => c.method === 'PUT' && c.url === `${FAL}/cancel`), 'fal cancel_url called');
  const r = mk((c) => c.method === 'POST' && !c.url.endsWith('/cancel') ? json({ id: 'p2', status: 'starting', output: null, error: null }, 201) : c.method === 'POST' ? json({}) : json({ id: 'p2', status: 'processing', output: null, error: null }));
  let m = 0; await assert.rejects(RP.replicateRun('o/m', {}, 'k', { timeoutMs: 60_000, pollMs: 1, f: r.f, sleep: nap, isCanceled: () => ++m > 2 }), /canceled/);
  assert.ok(r.calls.some((c) => c.method === 'POST' && c.url.endsWith('/predictions/p2/cancel')), 'Replicate cancel called'); }
ok('cancel: fal (PUT cancel_url) and Replicate (POST …/cancel) are asked to stop the request');

// ---- the routed run: cancel through the queue, downloads with retries, Retry download ----
const { EXTRA_ROUTES } = await import('../src/routing/routes.ts') as any;
const ROUTE = { routeId: 'fal:test/vid', kind: 'fal', modelId: 'test-hosted-model', endpoint: 'test/vid', priceRef: null, sourceUrl: '', checkedAt: '', typicalLatencySec: 1, latencyEstimated: true, envKey: 'OPENHIGGSFIELD_FAL_KEY', label: 'Test video · fal', output: 'video', request: async (j: any) => ({ prompt: j.input.prompt }) };
EXTRA_ROUTES['test-hosted-model'] = [ROUTE];
const { jobs } = await import('../src/jobs.ts'); const { getTool } = await import('../src/tools/registry.ts'); const { runRouted } = await import('../src/routing/run.ts');
const Q = await import('../src/queue.ts');
const MP4 = Buffer.from('fake-mp4-bytes');
const job = (id: string): any => { const j: any = { id, toolId: 'h3-video', provider: 'test-hosted-model', status: 'running', stage: 'queued', progress: 0, queuePos: 0, eta: 0, resultUrl: null, outputs: [], error: null, errorType: null, warnings: [], parentId: null, createdAt: Date.now(), input: { prompt: 'a kite' }, cost: 0, refunded: 0,
  routing: { modelId: 'test-hosted-model', order: [ROUTE.routeId], prices: { [ROUTE.routeId]: 0 }, allowFallback: false, mode: 'pinned' }, routeAttempts: [] }; jobs.set(id, j); return j; };
const real = globalThis.fetch; let handler: (c: Call) => Response | Promise<Response> = () => json({}, 500); const seen: Call[] = [];
globalThis.fetch = (async (u: any, init: any = {}) => { const c = { url: String(u), method: init.method ?? 'GET' }; seen.push(c); return handler(c); }) as typeof fetch;
const tool = getTool('h3-video')!;
try {
  // download fails twice, then succeeds
  { let d = 0; handler = (c) => c.method === 'POST' ? falSubmitted() : c.url.endsWith('/status') ? json({ status: 'COMPLETED' }) : c.url === FAL ? json({ video: { url: 'https://cdn.test/v.mp4' } })
      : c.url === 'https://cdn.test/v.mp4' ? (++d <= 2 ? json({}, 502) : new Response(MP4, { headers: { 'content-type': 'video/mp4' } })) : json({}, 404);
    const j = job('dl-ok'); await runRouted(j, tool);
    assert.equal(j.status, 'done', j.error); assert.equal(d, 3); assert.equal(fs.readFileSync(path.join(D, path.basename(j.resultUrl))).toString(), 'fake-mp4-bytes'); assert.equal(j.remote, null, 'done: the handle is cleared'); }
  ok('download fails twice, then succeeds → the job is done with the file');
  // download fails every time → clear error, remote kept → Retry download fetches it
  { handler = (c) => c.method === 'POST' ? falSubmitted() : c.url.endsWith('/status') ? json({ status: 'COMPLETED' }) : c.url === FAL ? json({ video: { url: 'https://cdn.test/v.mp4' } }) : json({}, 503);
    const j = job('dl-bad'); await runRouted(j, tool);
    assert.equal(j.status, 'failed'); assert.equal(j.reasonCode, 'download_failed'); assert.match(j.error, /finished the result \(so it is paid for\), but it couldn't be downloaded after 4 tries.*Retry download/);
    assert.equal(j.remote?.id, 'r1'); assert.equal(j.remote?.collectable, 'download'); assert.equal(j.remote?.statusUrl, `${FAL}/status`);
    await new Promise((r) => setImmediate(r)); // the failure's own settle step (routing/run.ts afterSettle) runs first, as it would in the app
    const posts = seen.filter((c) => c.method === 'POST').length;
    handler = (c) => c.method === 'POST' ? falSubmitted() : c.url.endsWith('/status') ? json({ status: 'COMPLETED' }) : c.url === FAL ? json({ video: { url: 'https://cdn.test/v2.mp4' } }) : c.url === 'https://cdn.test/v2.mp4' ? new Response(MP4, { headers: { 'content-type': 'video/mp4' } }) : json({}, 404);
    assert.equal(Q.collectAgain(j), true); for (let i = 0; i < 200 && j.status === 'running'; i++) await new Promise((r) => setTimeout(r, 10));
    assert.equal(j.status, 'done', j.error); assert.equal(seen.filter((c) => c.method === 'POST').length, posts, 'Retry download sends nothing new'); assert.equal(j.routeAttempts.length, 1, 'same attempt');
    assert.ok(j.warnings.some((w: string) => /collected from fal/.test(w))); assert.equal(Q.collectAgain(j), false, 'nothing left to collect'); }
  ok('download fails every time → "made (paid) but couldn\'t be downloaded" + job.remote kept; Retry download (collect) fetches it with no new submit');
  // cancel a running hosted job through the queue → fal cancel
  { let cancels = 0; handler = (c) => c.method === 'POST' ? falSubmitted() : c.method === 'PUT' ? (cancels++, new Response(null, { status: 202 })) : c.url.endsWith('/status') ? json({ status: 'IN_PROGRESS' }) : json({}, 404);
    const j = job('cx'); const run = runRouted(j, tool); for (let i = 0; i < 200 && !j.remote; i++) await new Promise((r) => setTimeout(r, 5));
    assert.equal(Q.canCancel(j), true, 'cancellable once the request is at fal');
    const r = await Q.cancelRun(j); assert.equal(r.result, 'canceled'); assert.match(r.note ?? '', /^Asked fal to stop this run\./); await run;
    assert.equal(j.status, 'canceled'); assert.equal(cancels, 1, 'fal was asked to cancel once'); }
  { const j = job('cx-lab'); j.remote = { kind: 'direct', id: 'x', pollUrl: 'https://lab.test/p', routeId: ROUTE.routeId, attempt: 1, output: 0, outputs: 1, at: 0 };
    assert.equal(Q.canCancel(j), false); assert.equal((await Q.cancelRun(j)).result, 'refused', 'a lab API has no cancel call'); jobs.delete('cx-lab'); }
  ok('cancel: a running hosted job is canceled and fal is asked to stop it (note = the provider\'s own rule); a lab API run is still refused');
} finally { globalThis.fetch = real; }
process.exit(0);
