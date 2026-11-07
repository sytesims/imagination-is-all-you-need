// 409 route_changed for API callers (agent path audit 2026-11-07 #7). The app's words ("The price went up… press Generate again") stay for the
// app; the body now also carries quotedUsd, usd, why (old → new price and the likely cause) and next (re-quote, resubmit with quotedCredits=N).
// It fires only when the run is dearer than quotedCredits; the same price runs with quotedCredits alone (quotedRouteId is optional).
// One throwaway server (mock backend, mock keys, temp data dir, nothing reaches a provider). Run: npx tsx test/route-changed-api.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { routeChangedForApi } from '../src/shared/priceChange.js';
const ok = (m: string) => console.log('ok ' + m);
// unit
{ const a = routeChangedForApi({ quotedCredits: 12, credits: 14, route: 'fal:x', resubmit: 'GET /api/tools/h3-video/price' });
  assert.equal(a.quotedUsd, 0.12); assert.equal(a.usd, 0.14); assert.match(a.why, /^Not started: the price rose from \$0\.12 to \$0\.14; the request prices higher than the quote \(prompt length/); assert.match(a.why, /Nothing was charged\.$/);
  assert.match(a.next, /^Re-quote \(GET \/api\/tools\/h3-video\/price with the same fields.*submit again with quotedCredits=14 \(quotedRouteId=fal:x is optional\)\.$/);
  const m = routeChangedForApi({ quotedCredits: null, credits: 50, quotedRoute: 'fal:a', route: 'comfy-cloud:b' }); assert.equal(m.quotedUsd, null);
  assert.match(m.why, /no quotedCredits was sent and the place changed \(now \$0\.50\); it would now run on comfy-cloud:b instead of fal:a/);
  const l = routeChangedForApi({ quotedCredits: 50, credits: 50, quotedRoute: 'fal:a', route: 'comfy-cloud:b', lockReason: 'route' }); assert.match(l.why, /Canvas price lock/);
  ok('routeChangedForApi: old → new price, cause, next with the new quotedCredits; quotedRouteId optional'); }

const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-api-')); const PORT = testPort(9614); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', COMFY_API_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'),
  NODE_USE_ENV_PROXY: '1', HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', NO_PROXY: 'localhost,127.0.0.1,::1' } });
const submit = async (fields: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', ...fields })) fd.append(k, v); const r = await fetch(`${B}/api/tools/h3-video/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
try {
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  const rows: any = await (await fetch(`${B}/api/models/quotes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ toolId: 'h3-video', params: { types: '["t2v"]', duration: '5' } }) })).json();
  const [model, q] = Object.entries(rows.quotes ?? {}).find(([, v]: any) => v.runnable !== false && v.credits > 1 && !v.demo) as [string, any] ?? [];
  assert.ok(model, 'a paid runnable model on the mock keys'); const base = { prompt: 'a paper boat on a pond', types: '["t2v"]', duration: '5', model, ...(q.runOn ? { runOn: q.runOn } : {}) };
  const low = q.credits - 1; const r = await submit({ ...base, quotedCredits: String(low) });
  assert.equal(r.status, 409, JSON.stringify(r.body)); assert.equal(r.body.code, 'route_changed'); assert.equal(r.body.charged, false); assert.equal(r.body.message, 'The price went up. Nothing was charged.', 'app copy unchanged');
  const now = r.body.credits; assert.ok(now > low); assert.equal(r.body.quotedCredits, low); assert.equal(r.body.quotedUsd, low / 100); assert.equal(r.body.usd, now / 100);
  assert.match(r.body.why, /^Not started: the price rose from \$[\d.]+ to \$[\d.]+/); assert.match(r.body.next, new RegExp(`quotedCredits=${now}\\b`)); assert.match(r.body.next, /quotedRouteId=.* is optional/);
  assert.equal(r.body.quote?.credits, now, 'the fresh quote rides along, same price as the 409');
  ok(`dearer (${low} → ${now}): 409 with quotedUsd, usd, why, next; app message unchanged`);
  const same = await submit({ ...base, quotedCredits: String(now) }); assert.equal(same.status, 200, JSON.stringify(same.body));
  ok('following next: the new quotedCredits alone (no quotedRouteId) runs');
  console.log('ALL OK route-changed-api');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); }
