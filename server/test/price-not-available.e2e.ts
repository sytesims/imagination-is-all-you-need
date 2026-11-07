// Placeholder prices never look like quotes (agent path audit 2026-11-07 #2). With a (fake) Comfy key, MiniMax H3 on Comfy Cloud (comfy-cloud:cloud-h3,
// a partner model with only the mock executor) can't run: reasonCode not_wired, credits null. Its quote used to say breakdown "Comfy Router · $0.64"
// and cost.usdText "Free" (credits null read as 0), so an agent took it for a free run. Now:
//  - breakdown: "List price (not a quote) ≈ $0.64 · can't run: <reason>", cost.usdText "Not available";
//  - comfy-cloud:* partner routes are labelled "Comfy Cloud · partner model" (route label and tierLabel), never "Comfy Router";
//  - Comfy Router's own routes keep "Comfy Router"; a runnable paid quote keeps "≈ $…"; the user-facing reason keeps "Comfy Cloud isn't ready yet".
// One throwaway server (mock backend, temp data dir, fake key, nothing reaches a provider). Run: npx tsx test/price-not-available.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { costOf, NOT_AVAILABLE_TEXT } from '../src/billing.js';
const ROOT = path.resolve(import.meta.dirname, '..');
const ok = (m: string) => console.log('ok ' + m);
// unit: costOf
assert.equal(costOf({ kind: 'comfy-cloud', routeId: 'comfy-cloud:cloud-h3', credits: null, unavailable: true }).usdText, NOT_AVAILABLE_TEXT);
assert.equal(costOf({ kind: 'comfy-cloud', routeId: 'comfy-cloud:cloud-h3', credits: null, unavailable: true, demo: true, listCredits: 64 }).usdText, '≈ $0.64', 'a sample keeps its list price words');
assert.equal(costOf({ kind: 'local', credits: null, unavailable: true }).usdText.startsWith('Free'), true, 'local stays free');
assert.equal(costOf({ kind: 'comfy-router', routeId: 'comfy-router:x', credits: 0 }).usdText, 'Free', 'a runnable 0-credit quote is still Free');
ok('costOf: unavailable + no price → "Not available"; samples, local and real 0 unchanged');

const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'pna-')); const port = testPort(9613); const B = `http://localhost:${port}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, COMFY_API_KEY: 'fake-comfy-key-for-tests', PORT: String(port), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), NODE_USE_ENV_PROXY: '1', HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', NO_PROXY: 'localhost,127.0.0.1,::1' } });
const get = async (u: string) => { const r = await fetch(`${B}${u}`); assert.equal(r.status, 200, u); return r.json() as Promise<any>; };
try {
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  const q = await get('/api/tools/h3-video/price?provider=cloud-h3&duration=8&types=t2v');
  assert.equal(q.runnable, false); assert.equal(q.reasonCode, 'not_wired'); assert.equal(q.credits, null);
  assert.equal(q.cost.usdText, 'Not available', JSON.stringify(q.cost)); assert.notEqual(q.cost.usdText, 'Free');
  assert.equal(q.breakdown.length, 1); assert.match(q.breakdown[0].label, /^List price \(not a quote\) ≈ \$\d+\.\d\d · can’t run: Comfy Cloud isn’t ready yet$/, q.breakdown[0].label);
  assert.equal(q.breakdown[0].factor, 0); assert.doesNotMatch(JSON.stringify(q.breakdown), /Comfy Router/);
  assert.match(q.unavailableReason, /^Comfy Cloud isn’t ready yet\. Pick another model\.$/, 'the reason the app shows is unchanged');
  ok('not_wired quote: breakdown "List price (not a quote) ≈ $… · can’t run: …", usdText "Not available", reason unchanged');
  const routes = (await get('/api/routes?toolId=h3-video')).routes as any[];
  const all = routes.flatMap((m) => (m.routes ?? []).map((o: any) => ({ ...o, modelId: m.modelId })));
  const h3 = all.find((o) => o.routeId === 'comfy-cloud:cloud-h3'); assert.ok(h3);
  assert.equal(h3.label, 'Comfy Cloud · partner model'); assert.equal(h3.tierLabel, 'Comfy Cloud · partner model');
  for (const o of all.filter((x) => x.routeId.startsWith('comfy-cloud:'))) { assert.notEqual(o.label, 'Comfy Router', o.routeId); assert.notEqual(o.tierLabel, 'Comfy Router', o.routeId); }
  const wf = all.find((o) => o.routeId === 'comfy-cloud:cloud-h3-wf'); assert.equal(wf.label, 'Comfy Cloud'); assert.equal(wf.tierLabel, 'Comfy Cloud');
  const router = all.find((o) => o.routeId.startsWith('comfy-router:')); if (router) assert.equal(router.tierLabel, 'Comfy Router');
  ok('comfy-cloud:* partner routes: "Comfy Cloud · partner model" (label + tierLabel); open workflows "Comfy Cloud"; Comfy Router routes unchanged');
  // a runnable paid quote keeps its price words
  const rq = await get(`/api/tools/h3-video/price?provider=${encodeURIComponent(all.find((o) => o.available && o.credits > 0)?.modelId ?? 'cloud-h3-wf')}&duration=8&types=t2v`);
  if (rq.runnable) { assert.match(rq.cost.usdText, /^≈ \$/); assert.doesNotMatch(rq.breakdown?.[0]?.label ?? '', /not a quote/); ok('runnable paid quote: "≈ $…", breakdown unchanged'); }
  console.log('ALL OK price-not-available');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); }
