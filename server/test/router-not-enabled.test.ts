// Comfy Router not_enabled (2026-10-27, live job f609cfc5: FLUX 3 Max text to video, 20 s 720p, got 403 error_type "not_enabled" and was told
// "your Comfy plan doesn't include API access"):
// 1. Router errors are classified by errorType: not_enabled → route_not_enabled ("Comfy Router doesn't run this model yet."), never the plan;
//    forbidden (or a bare 403 with no type) still says plan;
// 2. a not_enabled route is remembered (routing/routeOff.ts) and the automatic pick moves to the same model's Comfy Cloud route; the mark ends
//    after 24 h and on Check again (clearRouteOff);
// 3. the failure note says "Nothing was charged." (never "may still bill"), and the ledger books no spend for it, even with a request id.
// Run: npx tsx test/router-not-enabled.test.ts   (pure: own data dir, mock backend, mock keys; no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'rne-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', COMFY_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '' });
const ok = (m: string) => console.log('ok ' + m);
const { routerErrorFor, ROUTER_MESSAGES } = await import('../src/comfyRouter.ts');
const { routeOff, markRouteOff, clearRouteOff, routeOffList, ROUTE_OFF_REASON, ROUTE_OFF_TTL_MS } = await import('../src/routing/routeOff.ts');
const { PRE_DISPATCH } = await import('../src/billing.ts');

// ---- 1. classify by errorType ----
{ const e = routerErrorFor(403, 'not_enabled', JSON.stringify({ error_type: 'not_enabled', detail: 'Comfy Router is not switched on for this caller yet.' }));
  assert.equal(e.reasonCode, 'route_not_enabled'); assert.equal(e.message, "Comfy Router doesn't run this model yet."); assert.ok(!/plan|API access|Standard/i.test(e.message));
  assert.equal(routerErrorFor(403, null, JSON.stringify({ error_type: 'not_enabled' })).reasonCode, 'route_not_enabled', 'the body\'s error_type counts too');
  const plan = routerErrorFor(403, 'forbidden'); assert.equal(plan.reasonCode, 'cloud_plan'); assert.match(plan.message, /plan/); assert.equal(routerErrorFor(403, null, '').reasonCode, 'cloud_plan');
  assert.match(ROUTER_MESSAGES.route_not_enabled, /doesn't run this model yet/);
  ok('not_enabled → "Comfy Router doesn\'t run this model yet."; forbidden / bare 403 → the plan wording'); }

// ---- 2. remembered per route, 24 h, Check again ----
const F3M_ROUTER = 'comfy-router:cloud-flux3-max'; const F3M_CLOUD = 'comfy-cloud:cloud-flux3-max';
{ assert.equal(routeOff(F3M_ROUTER), null); const t0 = Date.now(); markRouteOff(F3M_ROUTER, 'flux-3-max', t0);
  assert.equal(routeOff(F3M_ROUTER, t0 + 1000)?.code, 'not_enabled'); assert.equal(routeOff(F3M_ROUTER, t0 + ROUTE_OFF_TTL_MS + 1), null, 're-checked after 24 h');
  assert.equal(routeOffList(t0 + 1000)[0].routeId, F3M_ROUTER); ok('mark kept server-side with the time; gone after 24 h'); }
{ const { getTool } = await import('../src/tools/registry.ts'); const { option, resolveRoute } = await import('../src/routing/select.ts'); const { findRoute } = await import('../src/routing/routes.ts');
  const tool = getTool('h3-video')!; const input = { mode: 't2v', types: ['t2v'], duration: 20, resolution: '720p', prompt: 'A lighthouse at dusk.' };
  const rr = findRoute(F3M_ROUTER); if (rr) { const o = option(tool, rr, input); assert.equal(o.available, false); assert.equal(o.reason, ROUTE_OFF_REASON); assert.equal(o.reasonCode, 'route_not_enabled'); }
  const pl: any = resolveRoute(tool, 'cloud-flux3-max', input, 1, { runOn: 'comfy-cloud' });
  assert.ok(!('error' in pl) || !/Router/.test(String(pl.error)), JSON.stringify(pl).slice(0, 300)); if (!('error' in pl)) assert.equal(pl.first.routeId, F3M_CLOUD, 'the automatic pick moves to Comfy Cloud\'s partner node');
  assert.equal(clearRouteOff(F3M_ROUTER), true); assert.equal(routeOff(F3M_ROUTER), null); ok('the auto pick skips the Router route ("Not on Comfy Router yet") and runs the Comfy Cloud node; Check again clears it'); }

// ---- 3. nothing charged, no ledger spend ----
{ assert.ok(PRE_DISPATCH.has('route_not_enabled') && PRE_DISPATCH.has('cloud_plan'));
  const q = fs.readFileSync(path.resolve(import.meta.dirname, '../src/queue.ts'), 'utf8'); assert.match(q, /chargeNote === 'not_charged' \|\| PRE_DISPATCH\.has/, 'the failure note says Nothing was charged for refusals before a run');
  const b = fs.readFileSync(path.resolve(import.meta.dirname, '../src/billing.ts'), 'utf8'); assert.match(b, /\['route_not_enabled', 'cloud_plan'\]\.includes/, 'a gate refusal is never spend, even with a request id (refunds f609cfc5-type rows on read)');
  ok('refusals before a run: "Nothing was charged.", no ledger spend'); }
console.log('router-not-enabled: all ok'); fs.rmSync(D, { recursive: true, force: true });
