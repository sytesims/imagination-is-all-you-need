// D4 (user decision 2026-10-28): a place fails → the next ready place that costs the same or less is tried automatically, and the result
// says where it ran; a dearer one asks first; never when the failed try may have been charged; never off a place the user picked.
//  1. success: a pre-selected (Auto) run that works runs once, on its first place (no fallback, no note).
//  2. same price or less: the first place fails before reaching the provider → the job runs on the next place; routeAttempts[0].notCharged,
//     the fallback notice (route_failed) names where it ran; ONE Spend row, moved to the place that ran.
//  3. dearer: the next place costs more than the quote → needs_decision with the price difference; the dearer place never started.
//  4. charged: the first place failed AFTER the request reached the provider (it may have billed) → no automatic move: failed, a plain
//     "may have charged" warning, Try on places listed, one attempt only.
//  5. the user's pinned place (runOn picked) fails → stays failed with Try on places; nothing moves on its own.
//  6. allowFallback=0 on an Auto run keeps it on its place.
// Run: npx tsx test/place-fallback.e2e.ts (port 9351; temp data dir + env file, mock backend, mock keys and placeholder fal/Replicate keys in
// the child env only: mock runs, nothing sent, nothing charged).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'placefb-')); const ok = (m: string) => console.log('ok ' + m);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', FAL_KEY: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '', OPENHIGGSFIELD_USE_LOCAL: '' };
const PORT = testPort(9351); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_FAL_KEY: 'test-not-a-key', OPENHIGGSFIELD_REPLICATE_API_TOKEN: 'test-not-a-key',
  OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json') }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const send = async (m: string, u: string, b: unknown) => { const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: (await r.json()) as any }; };
const submit = async (extra: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries({ prompt: 'a calm lake', rights: '1', types: '["generate"]', ...extra })) f.set(k, v);
  const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: f }); return { status: r.status, body: (await r.json()) as any }; };
const waitEnd = async (id: string) => { for (let i = 0; i < 300; i++) { const j = await get(`/api/jobs/${id}`); if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('job did not end ' + id); };
const rowsOf = async (id: string) => ((await get('/api/spend?limit=500')).items as any[]).filter((r) => r.jobId === id);
const price = async (model: string, route?: string) => (await get(`/api/tools/create-image/price?provider=${model}&types=generate${route ? `&route=${encodeURIComponent(route)}` : ''}`)).credits as number;
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  assert.equal((await get('/api/health')).backend, 'mock');
  const NB = 'api-nano-banana'; const q = await get(`/api/tools/create-image/price?provider=${NB}&types=generate`);
  assert.equal(q.routing?.mode, 'auto'); const [first, second] = q.routing.order as string[]; assert.ok(first && second, `two ready places: ${JSON.stringify(q.routing)}`);
  const p1 = await price(NB, first), p2 = await price(NB, second); assert.ok(p2 <= p1, `the next place costs the same or less (${p2} ≤ ${p1})`);

  // 1. success
  { const s = await submit({ provider: NB }); assert.equal(s.status, 200, JSON.stringify(s.body)); assert.equal(s.body.routing.allowFallback, true, 'Auto moves on by default');
    const j = await waitEnd(s.body.id); assert.equal(j.status, 'done'); assert.equal(j.route, first); assert.equal(j.routeAttempts.length, 1); assert.equal(j.fallback, null);
    ok(`success: ran once on ${first}, no fallback note`); }

  // 2. same price or less
  { const s = await submit({ provider: NB, simulateRouteFail: first }); assert.equal(s.status, 200); const j = await waitEnd(s.body.id);
    assert.equal(j.status, 'done', JSON.stringify({ status: j.status, error: j.error })); assert.deepEqual(j.routeAttempts.map((a: any) => a.routeId), [first, second]);
    assert.equal(j.routeAttempts[0].notCharged, true, 'the failed try is marked not charged'); assert.equal(j.route, second);
    assert.equal(j.fallback?.fallbackReason?.code, 'route_failed'); assert.match(j.fallback.fallbackReason.message, /so it ran on/);
    let rows: any[] = []; for (let i = 0; i < 30; i++) { rows = await rowsOf(j.id); if (rows[0]?.finishedAt) break; await new Promise((r) => setTimeout(r, 100)); }
    assert.equal(rows.length, 1, 'one Spend row'); assert.equal(rows[0].route, second, 'billed where it ran');
    ok(`same price or less: ${first} failed (not charged) → ran on ${second} ($${(p2 / 100).toFixed(2)} ≤ $${(p1 / 100).toFixed(2)}); notice "${j.fallback.fallbackReason.message.slice(0, 70)}…"`); }

  // 3. dearer: Klein on this computer ($0) fails; every other place costs more → it waits for the user
  { const K = 'comfy-flux3-klein'; const s = await submit({ provider: K, route: `local:${K}`, allowFallback: '1', simulateRouteFail: `local:${K}` }); assert.equal(s.status, 200, JSON.stringify(s.body));
    const j = await waitEnd(s.body.id); assert.equal(j.status, 'needs_decision', JSON.stringify({ status: j.status, error: j.error })); assert.equal(j.routeAttempts.length, 1, 'the dearer place never started');
    assert.equal(j.decision?.reason, 'next_route_costs_more'); assert.ok(j.decision.options.every((o: any) => o.deltaCredits > 0), 'each option says how much more');
    ok(`dearer: ${j.decision.options[0].label} costs ${j.decision.options[0].deltaCredits} credits more → needs_decision, nothing started`); }

  // 4. charged: the failed try reached the provider → stop and tell
  { const s = await submit({ provider: NB, simulateRouteFail: `${first}@sent` }); const j = await waitEnd(s.body.id);
    assert.equal(j.status, 'failed', JSON.stringify({ status: j.status, error: j.error })); assert.equal(j.routeAttempts.length, 1, 'no automatic second try'); assert.ok(!j.routeAttempts[0].notCharged);
    assert.ok((j.warnings ?? []).some((w: string) => /may have charged/.test(w)), JSON.stringify(j.warnings)); assert.ok((j.tryOn ?? []).length > 0, 'Try on places offered');
    ok(`charged: ${first} failed after the request was sent → failed, "may have charged" note, ${j.tryOn.length} Try on place(s), one attempt`); }

  // 5. the user's pinned place
  { const s = await submit({ provider: NB, runOn: 'comfy-cloud', simulateRouteFail: first }); assert.equal(s.status, 200, JSON.stringify(s.body)); assert.equal(s.body.routing.mode, 'pinned'); assert.equal(s.body.routing.allowFallback, false);
    const j = await waitEnd(s.body.id); assert.equal(j.status, 'failed'); assert.equal(j.routeAttempts.length, 1); assert.ok((j.tryOn ?? []).length > 0);
    ok('pinned place (Run on picked): fails and stays, with Try on places'); }

  // 6. allowFallback=0 opts Auto out
  { const s = await submit({ provider: NB, allowFallback: '0', simulateRouteFail: first }); assert.equal(s.body.routing.allowFallback, false); const j = await waitEnd(s.body.id);
    assert.equal(j.status, 'failed'); assert.equal(j.routeAttempts.length, 1); ok('allowFallback=0: Auto stays on its place'); }
  console.log('ALL OK place-fallback');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
