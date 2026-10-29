// S-01 (allowFallback): the two moves to another route go through the submit's spend guard (spendGuard.ts guardNextRoute). Spending limits
// were removed (2026-10-28); the agent budget still applies.
//  1. POST /api/jobs/:id/fallback {route} on a needs_decision job: an agent budget too small → 400 agent_budget, nothing changes on the job
//     (still needs_decision, Spend row not moved). Otherwise → the job runs there and its Spend row moves to that route (estimate, then settled).
//  2. runRouted's automatic next route (allowFallback=1, next route ≤ the quote): it continues and the Spend row moves to the route that ran.
// Run: npx tsx test/fallback-spend-guard.e2e.ts (port 8798; temp data dir + env file, mock backend, mock Comfy/BFL keys and placeholder
// fal/Replicate keys in the child env only (never saved, mock runs, nothing sent; /api/accounts is never called).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'fbspend-')); const ok = (m: string) => console.log('ok ' + m);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', FAL_KEY: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '', OPENHIGGSFIELD_USE_LOCAL: '' };
const PORT = testPort(8798); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_FAL_KEY: 'test-not-a-key', OPENHIGGSFIELD_REPLICATE_API_TOKEN: 'test-not-a-key',
  OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json') }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const send = async (m: string, u: string, b: unknown, h: Record<string, string> = {}) => { const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) }); return { status: r.status, body: (await r.json()) as any }; };
const submit = async (extra: Record<string, string>, h: Record<string, string> = {}) => { const f = new FormData(); for (const [k, v] of Object.entries({ prompt: 'a calm lake', rights: '1', types: '["generate"]', ...extra })) f.set(k, v);
  const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: f, headers: h }); return { status: r.status, body: (await r.json()) as any }; };
const waitEnd = async (id: string) => { for (let i = 0; i < 300; i++) { const j = await get(`/api/jobs/${id}`); if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('job did not end ' + id); };
const rowOf = async (id: string) => ((await get('/api/spend?limit=500')).items as any[]).find((r) => r.jobId === id);
const nRows = async () => ((await get('/api/spend?limit=500')).items as any[]).length;
const charges = async (id: string) => ((await get('/api/ledger')).entries as any[]).filter((e) => e.kind === 'charge' && String(e.jobId).startsWith(id));
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }

  // ---- 1. POST /api/jobs/:id/fallback (FLUX 3 Klein: Local fails → a priced API (fal / BFL) costs more than the $0 quote → needs_decision) ----
  // Pre-selection is Comfy → other API → Local (TRANSPARENCY-PLAN 4k 5b-1), so with the placeholder fal key Klein would start on fal: pick Local as Klein's Run on (saved choice)
  { const pin = await send('PUT', '/api/me/routing', { perModel: { 'comfy-flux3-klein': { route: 'local:comfy-flux3-klein' } } }); assert.equal(pin.status, 200, JSON.stringify(pin.body)); }
  const KLEIN = { provider: 'comfy-flux3-klein', allowFallback: '1' }; const qk = await get('/api/tools/create-image/price?provider=comfy-flux3-klein&types=generate');
  assert.equal(qk.runOn, 'local', `Klein runs locally (saved choice): ${qk.route}`);
  const waiting = async (h: Record<string, string> = {}) => { const s = await submit({ ...KLEIN, simulateRouteFail: qk.route }, h); assert.equal(s.status, 200, JSON.stringify(s.body)); const j = await waitEnd(s.body.id);
    assert.equal(j.status, 'needs_decision', JSON.stringify({ status: j.status, error: j.error })); const alt = j.alternatives.find((o: any) => o.credits > 0); assert.ok(alt, `a priced alternative: ${JSON.stringify(j.alternatives)}`); return { j, alt }; };
  const { j: w1, alt } = await waiting(); const row0 = await rowOf(w1.id); assert.ok(row0, 'the submit wrote a Spend row'); assert.equal(row0.route, qk.route); const rows0 = await nRows();
  // agent budget: the job's budget (too small for the priced route) refuses the move the same way a submit would
  const ab = await send('POST', '/api/agent/budgets', { name: 'fallback test', budgetUsd: 0 }); assert.equal(ab.status, 201, JSON.stringify(ab.body)); const AH = { 'x-ohf-agent-budget': ab.body.id };
  const { j: w2 } = await waiting(AH); assert.equal(w2.agent?.id ?? (await get(`/api/jobs/${w2.id}`)).agent?.id, ab.body.id, 'the job carries its agent budget');
  const fa = await send('POST', `/api/jobs/${w2.id}/fallback`, { route: alt.routeId }); assert.equal(fa.status, 400, JSON.stringify(fa.body)); assert.equal(fa.body.code, 'agent_budget'); assert.equal(fa.body.charged, false);
  assert.equal((await get(`/api/jobs/${w2.id}`)).status, 'needs_decision'); assert.equal((await rowOf(w2.id)).route, qk.route, 'agent-blocked: Spend row not moved');
  ok(`fallback over the agent budget ($${ab.body.budgetUsd}): 400 agent_budget, nothing moved`);

  // no budget: runs there; the Spend row moves to the new route with its estimate and settles when the run ends
  const f1 = await send('POST', `/api/jobs/${w1.id}/fallback`, { route: alt.routeId }); assert.equal(f1.status, 200, JSON.stringify(f1.body));
  const moved = await rowOf(w1.id); assert.equal(moved.route, alt.routeId, 'Spend row moved to the new route'); assert.notEqual(moved.billedTo, 'local'); assert.ok(moved.estUsd > 0, `estimate on the new route: ${JSON.stringify(moved)}`);
  let jd: any; for (let i = 0; i < 300; i++) { jd = await get(`/api/jobs/${w1.id}`); if (['done', 'failed'].includes(jd.status)) break; await new Promise((r) => setTimeout(r, 100)); }
  assert.equal(jd.status, 'done', JSON.stringify({ status: jd.status, error: jd.error })); assert.equal(await nRows(), rows0 + 1, 'one Spend row per job (w1 moved, not added; w2 its own)');
  let settled: any; for (let i = 0; i < 30; i++) { settled = await rowOf(w1.id); if (settled.finishedAt) break; await new Promise((r) => setTimeout(r, 100)); }
  assert.ok(settled.finishedAt, 'the moved row settles when the fallback run ends'); assert.equal(settled.status, 'done'); assert.equal(settled.route, alt.routeId);
  ok(`fallback: ran on ${alt.routeId}; Spend row moved (${moved.billedTo}, est $${moved.estUsd}) and settled (${settled.status})`);

  // ---- 2. automatic next route (Nano Banana 2: Comfy Router fails → fal / Replicate at ≤ the quote) ----
  const NB = { provider: 'api-nano-banana', allowFallback: '1' }; const qn = await get('/api/tools/create-image/price?provider=api-nano-banana&types=generate');
  assert.equal(qn.cost?.billedTo, 'comfy', `Nano Banana 2 starts on Comfy: ${qn.route}`);
  const rowsA = await nRows();
  const s2 = await submit({ ...NB, simulateRouteFail: qn.route }); assert.equal(s2.status, 200); const a2 = await waitEnd(s2.body.id);
  assert.equal(a2.status, 'done', JSON.stringify({ status: a2.status, error: a2.error })); assert.equal(a2.routeAttempts.length, 2); const ran = a2.routeAttempts[1].routeId;
  let r2: any; for (let i = 0; i < 30; i++) { r2 = await rowOf(a2.id); if (r2.finishedAt) break; await new Promise((r) => setTimeout(r, 100)); }
  assert.equal(r2.route, ran, 'Spend row moved to the route that ran'); assert.notEqual(r2.billedTo, 'comfy', 'billed where it ran'); assert.equal(await nRows(), rowsA + 1, 'one Spend row for the job (moved, not added)'); assert.ok(r2.estUsd > 0); assert.equal(r2.status, 'done');
  ok(`auto next route: continued on ${ran}; Spend row moved (${r2.billedTo}, est $${r2.estUsd}) and settled`);
  console.log('ALL OK fallback-spend-guard');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
