// B6 (Oct 19): cloud-first, quality-first defaults. Two throwaway mock servers (:8986 keyless, :8987 fake fal/Replicate keys; temp data dirs).
// Checks: tool preferredProvider (quality pick) vs defaultProvider (first runnable / saved pin) + defaultFallback; per-model status fields;
// Auto tier order (Comfy Cloud workflow → partner API → direct API → local); Cloud twins listed as routes of their model ('Comfy Cloud'),
// partner nodes labelled 'Comfy Router'; keyless demo quotes say 'sample output'; Video Swap swapTypes; GPT Image priced by
// quality; Auto retry continues only to a route that costs ≤ the quote, else needs_decision with a decision payload. Run: npx tsx test/b6-defaults.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const procs: ChildProcess[] = [];
async function boot(port: number, extra: Record<string, string> = {}) {
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'b6-'));
  procs.push(spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, ...extra, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_COMMERCIAL: '', OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY: '' } }));
  const B = `http://localhost:${port}`;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) return B; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  throw new Error(`server :${port} did not start`);
}
const get = async (u: string) => (await (await fetch(u)).json()) as any;
const ok = (m: string) => console.log('ok ' + m);
const MODEL_FIELDS = ['qualityRank', 'runnable', 'demoPreview', 'needsKey', 'keyOwner', 'wired', 'reasonCode', 'reason'];
try {
  const [A, K] = await Promise.all([boot(testPort(8986)), boot(testPort(8987), { OPENHIGGSFIELD_FAL_KEY: 'test-not-a-key', OPENHIGGSFIELD_REPLICATE_API_TOKEN: 'test-not-a-key' })]);
  const tools = await get(`${A}/api/tools`) as any[]; const T = Object.fromEntries(tools.map((t) => [t.id, t]));
  // ---- tool + model fields ----
  for (const t of tools) {
    if (!(t.providers ?? []).length) continue;
    assert.ok(t.preferredProvider, `${t.id} preferredProvider`); assert.ok(t.defaultProvider, `${t.id} defaultProvider`);
    assert.equal(t.preferredProvider, t.qualityOrder[0], `${t.id}: preferred = first in quality order`);
    const ed = t.editorialDefault; // per-workflow defaults (2026-10-23, test/image-defaults.test.ts): the workflow's own default needs no fallback note; a default that can't run names itself as `from`
    if (ed && ed.source === 'editorial') assert.equal(t.defaultFallback, null, `${t.id}: the workflow default needs no fallback note`);
    else if (ed && ed.source === 'fallback') { assert.ok(t.defaultFallback?.note, `${t.id}: why the workflow default isn't used`); assert.equal(t.defaultFallback.from, ed.id); }
    else if (t.defaultSource === 'cloud') assert.equal(t.defaultFallback, null, `${t.id}: the cloud default (shared/cloudDefaults.ts) needs no fallback note`);
    else if (t.defaultProvider !== t.preferredProvider) { const f = t.defaultFallback; assert.ok(f, `${t.id} defaultFallback`); for (const k of ['note', 'from', 'to', 'fromName', 'toName', 'reasonCode']) assert.ok(f[k], `${t.id} defaultFallback.${k}`); assert.equal(f.from, t.preferredProvider); assert.equal(f.to, t.defaultProvider); }
    else assert.equal(t.defaultFallback, null, `${t.id}: no fallback when default = preferred`);
    for (const p of t.providers) { if (!t.qualityOrder.includes(p.id)) continue; for (const k of MODEL_FIELDS) assert.ok(k in p, `${t.id}/${p.id}.${k}`); }
    for (const p of t.providers) if (['cloud-h3-wf', 'cloud-ltx-camera', 'cloud-reshoot'].includes(p.id)) { assert.ok(p.twinOf?.model, `${t.id}/${p.id} twinOf`); assert.ok(!t.qualityOrder.includes(p.id), 'twin alias not in quality order'); }
  }
  ok(`${tools.length} tools: preferred/default/defaultFallback + per-model runnable/needsKey/keyOwner/demo/reason/reasonCode`);
  const ci = T['create-image']; assert.equal(ci.preferredProvider, 'api-nano-banana'); assert.equal(ci.defaultProvider, 'api-flux3-image' /* Create Image's hosted default (shared/imageDefaults.ts) */); assert.deepEqual(ci.qualityOrder.slice(0, 3), ['api-nano-banana', 'api-gpt-image', 'comfy-flux3-klein']);
  assert.equal(T['h3-video'].preferredProvider, 'comfy-h3'); assert.equal(T['h3-video'].defaultProvider, 'router-ltx-25-pro' /* cloud first (shared/cloudDefaults.ts, 2026-10-27): LTX-2.5 Pro, also on the keyless sample server */);
  for (const id of ['cinema', 'photo-fx', 'app-orbit-shot']) assert.equal(T[id].preferredProvider, 'router-seedance', `${id}: Seedance 2.0 is the video quality pick`);
  assert.equal(T['object-swap'].preferredProvider, 'router-kling-edit', 'Video Swap: Kling 3.0 Omni Edit is the cloud swap pick (2026-10-25)');
  for (const id of ['upscale', 'reframe']) { assert.notEqual(T[id].defaultRoute?.split(':')[0], 'local', `${id}: cloud default kept keyless (BH12)`); }
  ok('Create Image = Nano Banana 2.1 (its workflow default), h3-video = LTX-2.5 22B (Video tab default; MiniMax H3 stays the quality pick), Seedance 2.0 first for video, Upscale/Reframe stay cloud');
  // ---- Video Swap per-swap-type ----
  const sw = T['object-swap'].swapTypes; assert.ok(sw?.person && sw?.object, 'swapTypes person/object');
  for (const [k, v] of Object.entries<any>(sw)) { assert.ok(v.preferredProvider && v.defaultProvider && Array.isArray(v.models) && v.models.length > 1, `swapTypes.${k}`); assert.ok(v.models.some((m: any) => m.hasCloud), `${k}: cloud models listed, not only local`); for (const m of v.models) for (const f of ['runnable', 'needsKey', 'keyOwner', 'reasonCode', 'reason']) assert.ok(f in m, `swapTypes.${k}.${m.id}.${f}`); }
  ok('object-swap swapTypes: per swap type preferred/default/fallback + per-model status, cloud models included');
  // ---- route chips: tiers, twins, partner label ----
  const h3 = (await get(`${A}/api/routes?toolId=h3-video&modelId=comfy-h3&types=t2v`)).routes[0];
  const tw = h3.routes.find((r: any) => r.routeId === 'comfy-cloud:cloud-h3-wf'); assert.ok(tw, 'cloud-h3-wf is a route of comfy-h3'); assert.equal(tw.label, 'Comfy Cloud'); assert.equal(tw.tier, 0); assert.equal(tw.twinProvider, 'cloud-h3-wf');
  const sd = (await get(`${A}/api/routes?toolId=cinema&modelId=router-seedance`)).routes[0].routes; assert.ok(sd.every((r: any) => r.kind === 'local' || r.label === 'Comfy Router' || /via/.test(r.label)), 'partner routes say partner API'); assert.ok(sd.some((r: any) => r.label === 'Comfy Router' && r.tier === 1));
  const auto = (await get(`${A}/api/routes?toolId=h3-video&modelId=comfy-h3&types=t2v`)).routes[0]; const dr = auto.routes.find((r: any) => r.routeId === auto.defaultRoute); assert.equal(dr?.tier, Math.min(...auto.routes.filter((r: any) => r.kind !== 'local' && r.status === 'Sample').map((r: any) => r.tier)), 'Auto picks the lowest tier (Comfy Cloud first)');
  ok('twin route on comfy-h3 (tier 0, Comfy Cloud), partner label on Seedance (tier 1), Auto order by tier');
  // ---- keyless demo quotes say so ----
  for (const [id, q] of [['upscale', 'seconds=5'], ['reframe', 'seconds=5'], ['create-image', 'types=generate'], ['app-inpaint', 'prompt=x'], ['create-image', 'types=inpaint']]) {
    const p = await get(`${A}/api/tools/${id}/price?${q}`); assert.equal(p.demo, true, id); assert.equal(p.credits, 0); assert.match(p.routeLabel, /sample output/, `${id} route label`); assert.match(p.demoReason, /free sample|sample output|ready in this app/i); assert.ok(p.keyOwner, `${id} keyOwner`); assert.equal(p.needsKey, false, 'demo quote is not a key gate');
  }
  { const p = await get(`${A}/api/tools/h3-video/price?types=t2v`); assert.equal(p.credits, 0, 'h3-video: its default (LTX-2.5 22B local) quotes free'); }
  ok('keyless quotes: routeLabel/demoLabel say sample output, keyOwner + demoReason explain the key; the Video default quotes free (local)');
  { const fd = new FormData(); for (const [k, v] of Object.entries({ prompt: 'boat', types: '["t2v"]', draft: '1', duration: '6', rights: '1' /* 6 s: LTX-2.5 Pro (the default) takes 6, 8 or 10 s; Upscale takes clips of 4 s and up */ })) fd.append(k, v); const d = await (await fetch(`${A}/api/tools/h3-video/jobs`, { method: 'POST', body: fd })).json() as any;
    // No keys: the Video default is LTX-2.5 22B local (shared/videoDefaults.ts, 2026-10-26); if it can't run here the draft asks for a key.
    if (!d.id) { assert.equal(d.state, 'needs_provider', JSON.stringify(d)); ok('draft h3-video on a keyless real-mode server: needs_provider (Seedance default needs its key); draft Upscale check skipped'); } else {
    for (let i = 0; i < 100 && (await get(`${A}/api/jobs/${d.id}`)).status !== 'done'; i++) await new Promise((r) => setTimeout(r, 100));
    const u = await (await fetch(`${A}/api/jobs/${d.id}/upscale`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json() as any;
    assert.equal(u.credits ?? u.cost, 0, JSON.stringify(u)); assert.equal(u.demo, true, JSON.stringify(u)); assert.match(u.routeLabel, /sample output/); assert.ok(u.keyOwner && u.demoReason); ok(`draft Upscale: ${u.routeLabel}`); } }
  // ---- saved pin wins ----
  const pin = await fetch(`${A}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ perModel: { 'comfy-flux3-klein': { route: 'direct:bfl/flux-3-image-klein' } } }) }); assert.equal(pin.status, 200, await pin.text());
  const ci2 = (await get(`${A}/api/tools`) as any[]).find((t) => t.id === 'create-image'); assert.equal(ci2.defaultProvider, 'comfy-flux3-klein'); assert.equal(ci2.preferredProvider, 'api-nano-banana'); assert.equal(ci2.defaultFallback?.reasonCode, 'pinned');
  assert.match(String(ci2.defaultFallback?.note ?? ''), /best-quality option/); assert.ok(!/\bis the quality pick\b/.test(String(ci2.defaultFallback?.note ?? '')));
  const m2 = (await get(`${A}/api/models?toolId=create-image`)).groups.flatMap((g: any) => g.models).filter((m: any) => m.isDefault).map((m: any) => m.id); assert.deepEqual(m2, ['comfy-flux3-klein'], '/api/models isDefault follows the pin');
  ok('saved pin: defaultProvider = pinned model, preferredProvider stays the best-quality option, reasonCode pinned');
  // ---- GPT Image priced by quality ----
  const g = Object.fromEntries(await Promise.all(['low', 'med', 'high'].map(async (q) => [q, (await get(`${K}/api/tools/app-inpaint/price?quality=${q}`))]))) as any;
  const gl = g.low.listCredits ?? g.low.credits, gm = g.med.listCredits ?? g.med.credits, gh = g.high.listCredits ?? g.high.credits;
  if ([gl, gm, gh].every((x) => typeof x === 'number')) { assert.ok(gl < gm && gm < gh, `GPT Image low<med<high (${gl}/${gm}/${gh})`); ok(`GPT Image priced by quality: ${gl}/${gm}/${gh}`); } else console.log('skip GPT price (app-inpaint quote has no quality knob)', JSON.stringify(g.med).slice(0, 200));
  { const { partnerNodePrompt } = await import('../src/hostedRequests.ts'); const qOf = (q?: string) => (Object.values(partnerNodePrompt('OpenAIGPTImageNodeV2', { prompt: 'x', quality: q } as any))[0] as any).inputs['model.quality'];
    assert.equal(qOf('low'), 'low'); assert.equal(qOf('med'), 'medium'); assert.equal(qOf('high'), 'high'); assert.equal(qOf(undefined), 'low'); ok('GPT Image request follows quality (low / medium / high)'); }
  // ---- retry ≤ quote: on by default for the pre-selected place (D4, 2026-10-28); allowFallback=0 keeps a failure on its place and offers tryOn ----
  const rs = (await get(`${K}/api/routes?toolId=create-image`)).routes as any[]; let up: any = null, down: any = null;
  for (const m of rs) { const ord = m.routes.filter((r: any) => r.available && r.kind !== 'local').sort((a: any, b: any) => a.tier - b.tier || a.credits - b.credits); if (ord[0] && m.defaultRoute !== ord[0].routeId) continue; if (ord.length < 2) continue;
    if (!up && ord[1].credits > ord[0].credits) up = { m: m.modelId, a: ord[0].routeId, b: ord[1].routeId }; if (!down && ord[1].credits <= ord[0].credits) down = { m: m.modelId, a: ord[0].routeId, b: ord[1].routeId }; }
  const job = async (f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries({ prompt: 'a lighthouse at dusk', types: '["generate"]', rights: '1', ...f })) fd.append(k, v); const r = await fetch(`${K}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); return (await r.json()) as any; };
  const until = async (id: string) => { for (let i = 0; i < 300; i++) { const j = await get(`${K}/api/jobs/${id}`); if (['done', 'failed', 'needs_decision', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
  if (up) { const s0 = await job({ provider: up.m, simulateRouteFail: up.a, allowFallback: '0' }); const j0 = await until(s0.id); assert.equal(j0.status, 'failed', 'allowFallback=0: no automatic fallback'); assert.equal(j0.routeAttempts.length, 1); assert.ok(j0.tryOn.some((o: any) => o.routeId === up.b), 'the other place is offered (Try on)');
    const s = await job({ provider: up.m, simulateRouteFail: up.a /* D4 default */ }); const j = await until(s.id); assert.equal(j.status, 'needs_decision', `${up.m}: ${up.b} costs more than the quote → ask`); assert.equal(j.decision?.reason, 'next_route_costs_more'); assert.ok(j.decision.options[0].deltaCredits > 0); assert.equal(j.decision.failedRoute, up.a); assert.ok(j.error);
    assert.ok(!j.routeAttempts.some((x: any) => x.routeId === up.b), 'pricier route never started'); ok(`Auto: ${up.a} failed, ${up.b} costs more → needs_decision with decision payload`); } else console.log('skip: no create-image model with a pricier second runnable route');
  if (down) { const s0 = await job({ provider: down.m, simulateRouteFail: down.a, allowFallback: '0' }); const j0 = await until(s0.id); assert.equal(j0.status, 'failed', 'allowFallback=0: no automatic fallback, even to a cheaper place'); assert.equal(j0.routeAttempts.length, 1);
    const s = await job({ provider: down.m, simulateRouteFail: down.a /* D4 default */ }); const j = await until(s.id); assert.equal(j.status, 'done', `${down.m}: next route ≤ quote → continues`); assert.equal(j.routeAttempts.length, 2); ok(`Auto: ${down.a} failed, ${down.b} costs ≤ quote → continued`); } else console.log('skip: no create-image model with a cheaper/equal second route');
  console.log('ALL OK b6-defaults');
} finally { for (const p of procs) try { process.kill(-p.pid!); } catch { /* gone */ } }
