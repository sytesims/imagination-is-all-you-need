// Post-rename batch (2026-10-18 13:22 steering), one section per item.
// 1. /api/tools providers[] carry displayName / providerGroup / runsOnKind equal to /api/models and /api/routes.
// 2. /api/health/self-host devNote ('Technical details') strings carry no env-var names (plainDev maps the comfyReady reasons too).
// 3. Model blurbs (/api/models hint/description) use plain model names: no node class names (MinimaxHailuo03*Node), no 'mock only'.
// 4. Demo previews on cloud routes (fal) never read 'No credits · runs locally': quote priceLine/breakdown = demo copy + real list price.
// 5. 'Comfy API (partner nodes …)' is not badged open weights (openWeights false, providerGroup 'API'); no route or provider naming API / partner nodes is.
// 6. Self-host notes never send the user to a Settings field that doesn't exist (models folder / ComfyUI address are install settings).
// 3d. Per-route displayName: local routes name the model ('Your computer · <model>') on /api/routes, /api/models and /api/tools providers.
// Run: npx tsx test/post-rename-1018.e2e.ts (port 8977; temp data dir).
import { ledgerUsd } from '../src/shared/priceText.ts';
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'pr1018-'));
const PORT = testPort(8977); const B = `http://localhost:${PORT}`; const env: any = { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_HOSTED: '' };
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any; const ok = (m: string) => console.log('ok ' + m);
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const tools = await get('/api/tools'); const models = await get('/api/models'); const routes = await get('/api/routes');
  // ---- 1. providers[] labels ----
  const M = new Map<string, any>(); for (const g of models.groups) for (const m of g.models) M.set(`${m.toolId}/${m.id}`, m);
  const R = new Map<string, any>(); for (const r of routes.routes) R.set(`${r.toolId}/${r.modelId}`, r);
  let n = 0;
  for (const t of tools) for (const pr of t.providers ?? []) {
    const k = `${t.id}/${pr.id}`; n++;
    assert.ok(typeof pr.displayName === 'string' && pr.displayName, `${k} displayName`); assert.ok(['Local', 'Comfy Cloud', 'API'].includes(pr.providerGroup), `${k} providerGroup ${pr.providerGroup}`);
    for (const [src, o] of [['models', M.get(k)], ['routes', R.get(k)]] as const) {
      assert.ok(o, `${k} missing from /api/${src}`);
      for (const f of ['displayName', 'providerGroup', 'runsOnKind']) assert.equal(pr[f], o[f], `${k} ${f}: tools=${pr[f]} ${src}=${o[f]}`);
    }
  }
  assert.ok(n > 100, `only ${n} providers`); ok(`1: ${n} /api/tools providers carry displayName/providerGroup/runsOnKind = /api/models = /api/routes`);
  // ---- 2. self-host Technical details ----
  const h = await get('/api/health/self-host'); const ENV = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b|=/;
  const dev = [h.comfy.devNote, h.models.devNote, h.gpuDevNote].filter(Boolean); assert.ok(dev.length >= 2, JSON.stringify(h));
  for (const t of dev) assert.ok(!ENV.test(t), `devNote has an env-var name: ${t}`);
  const { plainDev } = await import('../src/routesGaps.ts');
  for (const r of ['OPENHIGGSFIELD_BACKEND is not comfy', 'COMFY_API_KEY missing (required for Comfy Cloud / *.run.comfy.app). Set COMFY_BASE_URL to a local comfy-api-proxy to run without a key.', 'set OPENJUTSU_COMFY_MODELS_DIR', 'FOO_BAR unset'])
    assert.ok(!ENV.test(plainDev(r)), plainDev(r));
  assert.equal(plainDev('COMFY_API_KEY missing'), 'the Comfy API key missing');
  ok('2: self-host devNotes plain: ' + JSON.stringify(dev));
  // ---- 3. model blurbs ----
  const blurbs = [...M.values()].flatMap((m) => [m.hint, m.description]).filter(Boolean);
  for (const t of blurbs) assert.ok(!/[A-Za-z0-9]\*?Node(V\d+)?\b|\*|mock only/.test(t), `blurb has a node class / dev text: ${t}`);
  const mm = M.get('h3-video/api-minimax-h3'); assert.equal(mm.hint, "In the cloud; priced before you run."); assert.equal(mm.tech, 'Comfy partner node (API)');
  assert.equal(M.get('audio/cloud-minimax-music').description, 'MiniMax Music 3 on Comfy Cloud');
  ok(`3: ${blurbs.length} blurbs plain; api-minimax-h3 hint "${mm.hint}"`);
  // ---- 4. fal demo routes: demo copy + list price ----
  const MISMATCH: string[] = []; const LOCAL_RE = /runs locally|no credits\s*[—·-]/i; let demos = 0;
  for (const t of tools) for (const pr of t.providers ?? []) {
    const q = await get(`/api/tools/${t.id}/price?provider=${pr.id}`);
    if (q?.runnable && q.route) { const rv0 = R.get(`${t.id}/${pr.id}`); if (rv0.defaultRoute !== q.route || !!rv0.demo !== !!q.demo) MISMATCH.push(`${t.id}/${pr.id}: routes ${rv0.defaultRoute}${rv0.demo ? "(demo)" : ""} vs quote ${q.route}${q.demo ? "(demo)" : ""}`); }
    if (!q?.demo) continue;
    if (q.routeKind === 'local') { assert.ok(q.priceLine.startsWith('Sample output, nothing billed.'), `${t.id}/${pr.id} ${q.priceLine}`); continue; }
    demos++; assert.equal(q.local, false); assert.equal(q.localRun, false); assert.equal(q.credits, 0);
    assert.ok(q.listCredits > 0, `${t.id}/${pr.id} listCredits ${q.listCredits}`);
    const want = `Sample output, nothing billed. List price ≈ ${ledgerUsd(q.listCredits)}.`;
    assert.equal(q.priceLine, want, `${t.id}/${pr.id}`); assert.equal(q.breakdown[0].label, want);
    for (const x of [q.priceLine, ...q.breakdown.map((b: any) => b.label)]) assert.ok(!LOCAL_RE.test(x), `${t.id}/${pr.id}: ${x}`);
  }
  // the listing (/api/routes, /api/tools providers[]) and the quote pick the same route, for every tool and app (no exceptions)
  assert.deepEqual(MISMATCH, [], 'listing default route = quote route');
  { const ai = tools.find((t: any) => t.id === 'app-inpaint'); assert.deepEqual(ai.providers.map((p: any) => p.id ?? p), ['api-gpt-image', 'api-gpt-image-25-flare', 'api-gpt-image-25-sunburst', 'api-gpt-image-15', 'api-bria-fibo2', 'comfy-flux3-klein', 'comfy-qwen-image', 'api-ideogram-45', 'fal-bria-genfill'], 'B6: app-inpaint (Brush Edit) lists its engines in quality order; only routes with a mask (2026-10-22; GPT Image 2.5 + Ideogram 4.5 masks and fal Bria GenFill joined 2026-10-23, Bria FIBO 2.0 joined 2026-10-26 (5ceab785, mask on bria/fibo), shared/imageFeatures.ts MASK_MODELS)'); assert.equal(ai.preferredProvider, 'api-gpt-image'); }
  // 5bc53d48 (2026-10-26): H3 Extend gained a Comfy Router place (via last frame, +5 s = 65 credits); Comfy comes first in the place order, so the keyless demo quote lands there; the fal place is still listed with demo copy below
  // 2026-10-27: its Comfy Cloud twin (workflows/cloud/h3-extend-api.json, open weights, tier 0) now leads the Comfy places, so the keyless sample lands there
  const ext = await get('/api/tools/h3-extend/price'); assert.equal(ext.route, 'comfy-cloud:cloud-h3-extend'); assert.equal(ext.demo, true); assert.match(ext.priceLine, /^Sample output, nothing billed\. List price ≈ \$0\.30\./);
  const rv = (await get('/api/routes?tool=h3-extend')).routes.find((r: any) => r.modelId === 'comfy-h3-extend');
  const fr = rv.routes.find((r: any) => r.demo && r.kind === 'fal'); assert.ok(fr, JSON.stringify(rv.routes.map((r: any) => [r.routeId, r.demo])));
  assert.match(fr.priceLine, /^Sample output, nothing billed\. List price ≈ \$\d/); assert.ok(!LOCAL_RE.test(rv.via.text), rv.via.text);
  ok(`4: ${demos} demo quotes carry demo copy + list price; h3-extend "${ext.priceLine}", via "${rv.via.text}"`);
  // ---- 5. API / partner nodes never badged open weights ----
  const sp = (await get('/api/settings/providers')).providers as any[]; const cm = sp.find((x) => x.id === 'comfy');
  assert.equal(cm.openWeights, false); assert.equal(cm.providerGroup, 'API'); assert.equal(cm.disabledReason, null);
  assert.equal(sp.find((x) => x.id === 'local').providerGroup, 'Local');
  const API_RE = /\bAPI\b|partner node/i;
  for (const x of sp) if (API_RE.test(x.name)) assert.equal(x.openWeights, false, `settings provider ${x.id} "${x.name}" badged open weights`);
  let nr = 0; for (const m of routes.routes) for (const r of m.routes) if (r.kind === 'comfy-router' || API_RE.test(`${r.label ?? ''}`) && r.kind !== 'local' && r.providerGroup === 'API' && /partner|Comfy API|Router/i.test(`${r.label ?? ''} ${r.endpoint ?? ''}`)) { nr++; assert.equal(r.openWeights, false, `${m.toolId}/${m.modelId} ${r.routeId} "${r.label}" badged open weights`); }
  assert.ok(nr > 50, `only ${nr} partner/API routes`); ok(`5: comfy provider openWeights false / API; ${nr} partner-node routes not open weights`);
  // ---- 6. self-host notes: no phantom Settings field ----
  assert.equal(h.models.userNote, 'Set your ComfyUI models folder when you install, or ask your admin.');
  const src = fs.readFileSync(path.join(ROOT, 'src/routesGaps.ts'), 'utf8');
  for (const t of [...h.userNotes, ...(src.match(/'ComfyUI is not [^']+'/g) ?? [])]) assert.ok(!/in Settings|Settings is right/.test(t), `note points at Settings: ${t}`);
  ok('6: self-host notes: ' + JSON.stringify(h.userNotes));
  // ---- 3d. per-route displayName ----
  let nl = 0; const chk = (src: string, k: string, rs: any[], name: string) => { for (const r of rs ?? []) { assert.ok(typeof r.displayName === 'string' && r.displayName, `${src} ${k} ${r.routeId} displayName`);
    assert.ok(!/✦|\bfree\b/i.test(r.displayName), `${src} ${k} ${r.displayName}`); if (r.kind === 'local') { nl++; assert.ok([`Your computer · ${name}`].includes(r.displayName), `${src} ${k} ${r.displayName}`); /* BH10 P2 #16 (1843210): engines outside ComfyUI (ffmpeg, Whisper) say 'This computer' */ } } };
  for (const r of routes.routes) chk('routes', `${r.toolId}/${r.modelId}`, r.routes, r.displayName);
  for (const m of M.values()) chk('models', `${m.toolId}/${m.id}`, m.routes, m.displayName);
  for (const t of tools) for (const pr of t.providers ?? []) chk('tools', `${t.id}/${pr.id}`, pr.routes, pr.displayName);
  assert.equal(R.get('object-swap/comfy-open').routes.find((r: any) => r.kind === 'local').displayName, 'Your computer · Wan 2.2 Animate 14B');
  ok(`3d: ${nl} local route displayNames name the model`);
  console.log('ALL OK post-rename-1018');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
