// E2E (own mock servers :8898 normal, :8899 open-weights-only; temp data dirs): the model-fallback notice (routing/fallback.ts).
// Every place a client looks (quote, submit response, job) carries fallback = null | {requestedModel, usedModel, requestedRoute, usedRoute,
// fallbackReason:{code,message}, costDiffers, requestedCredits, usedCredits, creditDelta}. Run: npx tsx test/model-fallback.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const boot = (port: number, extra: Record<string, string> = {}) => spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'mfb-')), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '150', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1',
  OPENHIGGSFIELD_FAL_KEY: 'test-not-a-key', OPENHIGGSFIELD_REPLICATE_API_TOKEN: 'test-not-a-key', COMFY_API_KEY: '', ...extra }, stdio: 'ignore', detached: true });
const stop = (p: ChildProcess) => { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } };
const api = (port: number) => { const B = `http://localhost:${port}`;
  const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
  const send = async (m: string, u: string, b: unknown) => { const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() as any }; };
  const job = async (f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries({ prompt: 'a lighthouse at dusk', types: '["generate"]', ...f })) fd.append(k, v); const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
  const until = async (id: string) => { for (let i = 0; i < 300; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'needs_decision', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
  const ready = async () => { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error(`server ${port} did not start`); };
  return { get, send, job, until, ready }; };
const KEYS = ['requestedModel', 'usedModel', 'requestedRoute', 'usedRoute', 'fallbackReason', 'costDiffers', 'requestedCredits', 'usedCredits', 'creditDelta'];
const shape = (f: any) => { assert.ok(f && typeof f === 'object', 'fallback object'); for (const k of KEYS) assert.ok(k in f, `fallback.${k}`); assert.equal(typeof f.fallbackReason.code, 'string'); assert.ok(f.fallbackReason.message.length > 10); };
const ok = (m: string) => console.log('ok ' + m);
const A = boot(testPort(8898)), O = boot(testPort(8899), { OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY: '1', OPENHIGGSFIELD_USE_LOCAL: '1' });
try {
  const a = api(testPort(8898)), o = api(testPort(8899)); await Promise.all([a.ready(), o.ready()]);
  const QWEN = 'comfy-qwen-image', FAL = 'fal:fal-ai/qwen-image', REP = 'replicate:qwen/qwen-image';
  // ---- no fallback: null everywhere ----
  { const q = await a.get(`/api/models/quote?model=${QWEN}`); assert.equal(q.fallback, null, JSON.stringify(q)); assert.equal(q.route, FAL);
    const s = await a.job({ provider: QWEN }); assert.equal(s.status, 200, JSON.stringify(s.body)); assert.equal(s.body.fallback, null);
    const j = await a.until(s.body.id); assert.equal(j.status, 'done'); assert.equal(j.fallback, null);
    ok(`plain job: quote/submit/job fallback null (route ${q.route}, ${q.credits} credits)`); }
  // ---- route_failed: a request that opts in (allowFallback=1) moves to the next route; cost difference reported (Run on: never by default) ----
  { const s = await a.job({ provider: QWEN, simulateRouteFail: FAL, allowFallback: '1' }); assert.equal(s.body.fallback, null, 'nothing known at submit');
    const j0 = await a.until(s.body.id); assert.equal(j0.status, 'needs_decision', 'B6: Replicate costs more than the fal quote → ask, never a silent pricier fallback'); assert.equal(j0.decision?.reason, 'next_route_costs_more'); assert.equal(j0.decision.options[0].routeId, REP);
    const c = await a.send('POST', `/api/jobs/${s.body.id}/fallback`, { route: REP }); assert.equal(c.status, 200, JSON.stringify(c.body));
    const j = await a.until(s.body.id); assert.equal(j.status, 'done'); shape(j.fallback);
    const f = j.fallback; assert.equal(f.fallbackReason.code, 'route_failed'); assert.equal(f.requestedRoute, FAL); assert.equal(f.usedRoute, REP); assert.equal(f.requestedModel, QWEN); assert.equal(f.usedModel, QWEN);
    assert.equal(f.requestedCredits, j.routeAttempts[0].charged, 'requestedCredits = the failed route\'s price'); assert.equal(f.usedCredits, j.cost, 'usedCredits = what the job cost');
    assert.equal(f.creditDelta, f.usedCredits - f.requestedCredits); assert.equal(f.costDiffers, f.usedCredits !== f.requestedCredits); assert.ok(f.costDiffers, 'fal and Replicate prices differ for Qwen-Image');
    const list = await a.get('/api/jobs?limit=5'); assert.equal(list.find((x: any) => x.id === j.id)?.fallback?.fallbackReason?.code, 'route_failed', 'lists carry it too');
    ok(`route_failed: ${f.requestedRoute} (✦${f.requestedCredits}) → ${f.usedRoute} (✦${f.usedCredits}), delta ${f.creditDelta}: "${f.fallbackReason.message}"`); }
  // ---- no automatic fallback (Run on, 2026-10-22): the failed job stays failed and offers the other ready places; the user re-runs there ----
  { const s = await a.job({ provider: QWEN, route: FAL, allowFallback: '0', simulateRouteFail: FAL }); const j0 = await a.until(s.body.id); assert.equal(j0.status, 'failed'); assert.equal(j0.routeAttempts.length, 1);
    assert.equal(j0.fallback, null, 'nothing moved'); assert.ok(j0.tryOn.some((o: any) => o.routeId === REP), JSON.stringify(j0.tryOn));
    const c = await a.send('POST', `/api/jobs/${s.body.id}/retry`, { runOn: 'replicate' }); assert.equal(c.status, 200, JSON.stringify(c.body)); assert.equal(c.body.route, REP);
    const j = await a.until(c.body.id); assert.equal(j.status, 'done'); assert.equal(j.fallback, null, 'it ran where the user asked');
    ok(`no automatic fallback: ${FAL} failed → failed + tryOn [${j0.tryOn.map((o: any) => o.runOn).join(', ')}]; Try on Replicate → new job on ${REP}`); }
  // ---- model_unavailable: requestedModel not offered by the tool (normal mode) ----
  { const q = await a.get(`/api/models/quote?model=${QWEN}&requestedModel=cloud-h3`); shape(q.fallback); assert.equal(q.fallback.fallbackReason.code, 'model_unavailable'); assert.equal(q.fallback.requestedModel, 'cloud-h3'); assert.equal(q.fallback.usedModel, QWEN);
    assert.equal(q.fallback.requestedCredits, null); assert.equal(q.fallback.costDiffers, null, 'unknown when the requested model has no price on this tool');
    const s = await a.job({ provider: QWEN, requestedModel: 'cloud-h3' }); shape(s.body.fallback); assert.equal(s.body.fallback.fallbackReason.code, 'model_unavailable'); assert.equal(s.body.fallback.usedCredits, s.body.cost);
    const j = await a.until(s.body.id); assert.deepEqual(j.fallback, { ...s.body.fallback }, 'job = submit notice');
    const same = await a.job({ provider: QWEN, requestedModel: 'comfy-zimage-turbo' }); assert.equal(same.body.fallback, null, 'requested model usable here → the client chose; no notice');
    const unk = await a.job({ provider: QWEN, requestedModel: 'no-such-model' }); assert.match(unk.body.fallback.fallbackReason.message, /not a known model/);
    ok(`model_unavailable (not on this tool): "${s.body.fallback.fallbackReason.message}"; usable/absent requestedModel → null`); }
  // ---- model_unavailable: hidden in open-weights-only mode, with the requested model's price ----
  { const s = await o.job({ provider: QWEN, requestedModel: 'api-gpt-image' }); assert.equal(s.status, 200, JSON.stringify(s.body)); const f = s.body.fallback; shape(f);
    assert.equal(f.fallbackReason.code, 'model_unavailable'); assert.match(f.fallbackReason.message, /open-weights-only/); assert.equal(typeof f.requestedCredits, 'number'); assert.equal(f.usedCredits, 0, 'local run = 0 credits');
    assert.equal(f.costDiffers, true); assert.equal(f.creditDelta, -f.requestedCredits);
    const q = await o.get(`/api/models/quote?model=${QWEN}&requestedModel=api-gpt-image`); assert.equal(q.fallback.fallbackReason.code, 'model_unavailable'); assert.equal(q.fallback.requestedCredits, f.requestedCredits, 'quote = submit');
    ok(`model_unavailable (open-weights-only): ✦${f.requestedCredits} → local ✦0: "${f.fallbackReason.message}"`); }
  console.log('ALL OK model-fallback');
} finally { stop(A); stop(O); }
