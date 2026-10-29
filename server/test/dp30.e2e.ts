// DP batch-29/30 server asks (Oct 19 2026) (a)-(f), on this worktree's own throwaway mock servers (never :8787/:8788). Temp data dirs removed on exit;
// nothing installed, no paid calls, no real downloads, fake keys only ("test-...", never printed).
//  :8927  HOST=127.0.0.1, no keys, mock backend, hardware unreadable (tier unknown) → pricing (a)(b)(c), Re-shoot batch (d), saved key (e), null VRAM (f)
//  :8929  HOST=127.0.0.1, HW_MOCK=mid16, an EMPTY models folder, weights enforced → (l) self-host disk path, (m)(n) ambiguous_download choices, (o) 409 weights gate
//  :8928  HOST=0.0.0.0, a fal key from the server's environment (no saved timestamp) → (e) keySource 'env', keySetAt null; a CPU-only hardware reading → (f) 0, (g) too-heavy fallback wording
import { testPort } from './_ports.js'; import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const TSX = path.resolve(ROOT, '../node_modules/.bin/tsx');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_HW_MOCK: '', OPENHIGGSFIELD_VRAM_GB: '', OPENHIGGSFIELD_TOPUP_PACKS: '' };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'dp30-')); const procs: ChildProcess[] = [];
async function boot(port: number, extra: Record<string, string>) {
  const D = fs.mkdtempSync(path.join(T, 'd-'));
  procs.push(spawn(TSX, ['src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_SEED_COMMUNITY: '0', ...extra } }));
  const B = `http://localhost:${port}`;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) return B; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  throw new Error(`server :${port} did not start`);
}
const get = async (u: string) => (await (await fetch(u)).json()) as any;
const getS = async (u: string) => { const r = await fetch(u); return { status: r.status, j: (await r.json()) as any }; };
const send = async (method: string, u: string, body?: any) => { const r = await fetch(u, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: (await r.json()) as any }; };
const post = async (u: string, f: Record<string, string>, files: [string, string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v);
  for (const [k, p, t] of files) fd.append(k, new Blob([fs.readFileSync(p)], { type: t }), path.basename(p)); const r = await fetch(u, { method: 'POST', body: fd }); return { status: r.status, j: (await r.json()) as any }; };
const until = async (B: string, id: string) => { for (let i = 0; i < 900; i++) { const j = await get(`${B}/api/jobs/${id}`); if (['done', 'failed', 'needs_decision', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
const results: { name: string; pass: boolean; err?: string }[] = [];
async function check(name: string, fn: () => Promise<void>) { try { await fn(); results.push({ name, pass: true }); console.log(`PASS ${name}`); } catch (e: any) { results.push({ name, pass: false, err: String(e?.message ?? e).slice(0, 600) }); console.log(`FAIL ${name}: ${String(e?.message ?? e).slice(0, 600)}`); } }
const MP4 = path.join(T, 'clip.mp4'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=854x480:rate=24', '-t', '4', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', MP4]);
const PNG = path.join(T, 'x.png'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=256x256', '-frames:v', '1', PNG]);
const FAKE = 'r8_test-dp30-not-a-real-key-wxyz'; const ENVFAKE = 'test-dp30-env-only-key-9876';
try {
  const MD = fs.mkdtempSync(path.join(T, 'models-'));
  const [A, C, W] = await Promise.all([boot(testPort(8927), { HOST: '127.0.0.1' }), boot(testPort(8928), { HOST: '0.0.0.0', OPENHIGGSFIELD_FAL_KEY: ENVFAKE, OPENHIGGSFIELD_HW_MOCK: 'cpu', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1' }),
    boot(testPort(8929), { HOST: '127.0.0.1', OPENHIGGSFIELD_HW_MOCK: 'mid16', OPENHIGGSFIELD_COMFY_MODELS_DIR: MD, OPENHIGGSFIELD_ENFORCE_WEIGHTS: '1', OPENHIGGSFIELD_DISK_FREE_GB: '500', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1' })]);
  const P = await get(`${A}/api/pricing`);

  await check('(a) topUps replace plans: [{id, credits, label, priceUsd null, priceLine local demo}], plans [] deprecated + plansNote', async () => {
    assert.ok(Array.isArray(P.topUps) && P.topUps.length >= 1, JSON.stringify(P.topUps));
    for (const t of P.topUps) {
      assert.match(t.id, /^topup-\d+$/); assert.ok(Number.isInteger(t.credits) && t.credits > 0); assert.equal(t.label, `${t.credits.toLocaleString('en-US')} credits`);
      assert.equal(t.priceUsd, null, 'no payment integration → no invented price'); assert.equal(t.priceLine, 'Local demo, no payment');
      if ('bonusCredits' in t) assert.ok(Number.isInteger(t.bonusCredits)); if ('popular' in t) assert.equal(typeof t.popular, 'boolean');
      assert.equal(t.grant.endpoint, '/api/ledger/grant'); assert.deepEqual(t.grant.body, { amount: t.credits, source: 'topup' }); assert.equal(typeof t.available, 'boolean');
    }
    assert.deepEqual(P.topUps.map((t: any) => t.credits), [...P.topUps.map((t: any) => t.credits)].sort((x: number, y: number) => x - y), 'smallest first');
    assert.deepEqual(P.plans, []); assert.match(P.plansNote, /^No monthly plans/); assert.ok(!/subscription/i.test(JSON.stringify(P)), 'no subscription wording'); assert.match(P.plansNote, /deprecated/); assert.ok(!/OPENHIGGSFIELD_|_KEY\b/.test(JSON.stringify(P.topUps) + P.plansNote + (P.topUpsNote ?? '')), 'no env var names');
    const t0 = P.topUps.find((t: any) => t.available); if (t0) { const before = (await get(`${A}/api/ledger`)).balance; const g = await send('POST', `${A}${t0.grant.endpoint}`, t0.grant.body); assert.equal(g.status, 200, JSON.stringify(g.j));
      const after = (await get(`${A}/api/ledger`)).balance; if (typeof before === 'number' && typeof after === 'number') assert.equal(after - before, t0.credits); }
    const pl = await get(`${A}/api/plans`); assert.deepEqual(pl.topUps, P.topUps); assert.equal(pl.plansNote, P.plansNote);
  });

  await check('(b) free gens rows carry toolId + toolName, exampleQuantity/exampleCredits where a credit cost applies', async () => {
    const rows = P.freeGens?.rows; assert.ok(Array.isArray(rows) && rows.length >= 1, JSON.stringify(P.freeGens).slice(0, 400));
    for (const r of rows) { assert.ok(typeof r.toolId === 'string' && r.toolId, 'toolId'); assert.ok(typeof r.toolName === 'string' && r.toolName, 'toolName'); assert.ok(r.exampleCredits === null || typeof r.exampleCredits === 'number', 'exampleCredits number|null');
      if (r.exampleCredits != null) { assert.ok(Number.isFinite(r.exampleQuantity) && r.exampleQuantity > 0); assert.ok(typeof r.exampleLabel === 'string' && r.exampleLabel); } }
    for (const r of P.tools ?? []) { assert.ok(r.toolId && r.toolName, JSON.stringify(r).slice(0, 200)); }
  });

  await check('(c) every hosted pricing row has exampleCredits (number|null), null only when there is no price at all', async () => {
    const hosted: any[] = P.hosted ?? P.hostedPricing ?? []; assert.ok(hosted.length > 0, Object.keys(P).join(','));
    for (const h of hosted) { assert.ok('exampleCredits' in h, `exampleCredits missing on ${h.id ?? h.model}`); assert.ok(h.exampleCredits === null || (typeof h.exampleCredits === 'number' && h.exampleCredits >= 0));
      const priced = h.credits != null || Object.values(h.usdByQuality ?? h.creditsByQuality ?? {}).some((v) => v != null); if (priced) assert.notEqual(h.exampleCredits, null, `${h.id}: priced row needs an example`); }
    for (const t of P.tools ?? []) for (const p of t.providers ?? []) { assert.ok('exampleCredits' in p, `${t.toolId}/${p.id}`); assert.ok(p.exampleCredits === null || typeof p.exampleCredits === 'number'); if (p.kind === 'open-weights') assert.equal(p.exampleCredits, 0); }
  });

  await check('(d) Re-shoot angleCount: allowed values in the tool schema, quote = N × one-angle price, 400 on a bad value, mock job → N outputs at 0 credits', async () => {
    const tools = await get(`${A}/api/tools`); const rs = (Array.isArray(tools) ? tools : tools.tools).find((t: any) => t.id === 'reshoot');
    const inp = rs.inputs.find((i: any) => i.name === 'angleCount'); assert.ok(inp, 'angleCount input'); assert.deepEqual(inp.options, ['1', '4', '8', '12']); assert.equal(inp.default, '1');
    assert.deepEqual(rs.capabilities?.angleCounts, [1, 4, 8, 12], JSON.stringify(rs.capabilities ?? {}).slice(0, 300));
    for (const prov of ['router-seedance', 'router-veo']) {
      const q1 = await get(`${A}/api/tools/reshoot/price?provider=${prov}&duration=4&resolution=720p`); const q8 = await get(`${A}/api/tools/reshoot/price?provider=${prov}&duration=4&resolution=720p&angleCount=8`);
      const l1 = q1.demo ? q1.listCredits : q1.credits, l8 = q8.demo ? q8.listCredits : q8.credits; assert.ok(l1 > 0, JSON.stringify(q1).slice(0, 400)); assert.equal(l8, 8 * l1, `${prov}: ${l8} = 8 × ${l1}`);
      assert.equal(q8.angleCount, 8); assert.equal(q1.angleCount, 1);
      assert.equal(q8.perAngleCredits, q1.credits, 'perAngleCredits = the one-angle charge');
    }
    const bad = await getS(`${A}/api/tools/reshoot/price?provider=router-seedance&duration=4&angleCount=5`); assert.equal(bad.status, 400); assert.equal(bad.j.field, 'angleCount'); assert.deepEqual(bad.j.allowed, [1, 4, 8, 12]);
    const bj = await post(`${A}/api/tools/reshoot/jobs`, { rights: '1', provider: 'comfy-open', angleCount: '5' }, [['video', MP4, 'video/mp4']]); assert.equal(bj.status, 400, JSON.stringify(bj.j).slice(0, 300)); assert.equal(bj.j.issues?.[0]?.field, 'angleCount', JSON.stringify(bj.j).slice(0, 400));
    const lq = await get(`${A}/api/tools/reshoot/price?provider=comfy-open&duration=4&angleCount=4`); assert.equal(lq.credits, 0, 'local/mock = 0 credits');
    const r = await post(`${A}/api/tools/reshoot/jobs`, { rights: '1', provider: 'comfy-open', angleCount: '4', angles: JSON.stringify(['low angle']) }, [['video', MP4, 'video/mp4']]);
    assert.equal(r.status, 200, JSON.stringify(r.j).slice(0, 600)); assert.equal(r.j.cost ?? 0, 0); const j = await until(A, r.j.id); assert.equal(j.status, 'done', JSON.stringify(j).slice(0, 500));
    assert.equal(j.outputs.length, 4, JSON.stringify(j.outputs).slice(0, 400)); assert.equal(j.input.angles.length, 4); assert.equal(j.input.angles[0].angle, 'low angle'); assert.equal(j.input.angleCount, 4);
  });

  await check('(e) /api/settings/providers keySetAt (ISO|null) + keyHint (last 4 only) + keySource; env key → keySetAt null, keySource env', async () => {
    const t0 = Date.now(); const s = await send('POST', `${A}/api/settings/providers`, { id: 'replicate', key: FAKE }); assert.equal(s.status, 200, JSON.stringify(s.j));
    assert.equal(s.j.keyHint, '••••wxyz'); assert.equal(s.j.keySource, 'saved'); assert.ok(Date.parse(s.j.keySetAt) >= t0 - 2000 && new Date(s.j.keySetAt).toISOString() === s.j.keySetAt);
    const g = await get(`${A}/api/settings/providers`); const rep = g.providers.find((p: any) => p.id === 'replicate'); assert.equal(rep.keySetAt, s.j.keySetAt); assert.equal(rep.keyHint, '••••wxyz'); assert.equal(rep.keySource, 'saved');
    const fal = g.providers.find((p: any) => p.id === 'fal'); assert.equal(fal.keySetAt, null); assert.equal(fal.keyHint, null); assert.equal(fal.keySource, null);
    for (const p of g.providers) { assert.ok('keySetAt' in p && 'keyHint' in p && 'keySource' in p, p.id); if (p.keyHint) assert.match(p.keyHint, /^••••.{0,4}$/); }
    const e = await get(`${C}/api/settings/providers`); const ef = e.providers.find((p: any) => p.id === 'fal'); assert.equal(ef.keySetAt, null); assert.equal(ef.keySource, 'env'); assert.equal(ef.keyHint, '••••9876');
    const all = JSON.stringify(g) + JSON.stringify(e) + JSON.stringify(s.j); assert.ok(!all.includes(FAKE) && !all.includes(ENVFAKE) && !all.includes('not-a-real') && !all.includes('env-only'), 'no key value in any response');
  });

  await check('(f) hardware unreadable → effectiveVramGB null (/api/hardware and every fit); a manual 0 GB reading stays 0', async () => {
    const h = await get(`${A}/api/hardware`); assert.equal(h.tier, 'unknown'); assert.equal(h.source, 'none'); assert.equal(h.effectiveVramGB, null, JSON.stringify(h).slice(0, 300));
    const m = await get(`${A}/api/models`); const fits: any[] = []; const walk = (x: any) => { if (!x || typeof x !== 'object') return; if (x.fit && typeof x.fit === 'object' && 'effectiveVramGB' in x.fit) fits.push(x.fit); for (const v of Object.values(x)) walk(v); }; walk(m);
    assert.ok(fits.length > 0, 'some fits'); for (const f of fits) assert.equal(f.effectiveVramGB, null, JSON.stringify(f).slice(0, 200));
    const z = await send('PUT', `${A}/api/hardware`, { vramGB: 0 }); assert.equal(z.status, 200, JSON.stringify(z.j)); const h0 = await get(`${A}/api/hardware`); assert.equal(h0.effectiveVramGB, 0, 'a real 0 GB reading');
    const m0 = await get(`${A}/api/models`); const f0: any[] = []; const w0 = (x: any) => { if (!x || typeof x !== 'object') return; if (x.fit && typeof x.fit === 'object' && 'effectiveVramGB' in x.fit) f0.push(x.fit); for (const v of Object.values(x)) w0(v); }; w0(m0); for (const f of f0) assert.equal(f.effectiveVramGB, 0);
    const cpu = await get(`${C}/api/hardware`); assert.equal(cpu.effectiveVramGB, 0, 'a CPU-only reading is a real 0'); assert.equal(cpu.tier, 'none');
    await send('DELETE', `${A}/api/hardware/override`); assert.equal((await get(`${A}/api/hardware`)).effectiveVramGB, null, 'back to unreadable → null');
  });

  await check('(g) a too-heavy fallback names the fit reason, never a blanket "needs more graphics memory"', async () => {
    const t = await get(`${C}/api/tools`); const arr: any[] = Array.isArray(t) ? t : t.tools; const fb = arr.map((x) => x.defaultFallback).filter((f) => f?.reasonCode === 'too_heavy');
    assert.ok(fb.length >= 1, 'a too_heavy fallback on a CPU-only computer'); // two shapes, both naming the fit reason: the quality pick ("X is too heavy …, so Y is the default.") or a workflow's own default
    // (edFallbackNote: "X is the default for <area> but is too heavy …, so Y is used.", e.g. Music → YuE2 since its hosted default is null, 2026-10-25)
    for (const f of fb) { assert.match(f.note, /^(.+ is too heavy for your computer( \([a-z].+\))?, so .+ is the default\.|.+ is the default for .+ but is too heavy for your computer( \([a-z].+\))?, so .+ is used\.)/, f.note); assert.ok(!/needs more graphics memory/.test(f.note), f.note); }
    assert.ok(fb.some((f) => / \(needs a graphics card with about [\d.]+ GB of memory; your computer has none\), so /.test(f.note)), fb.map((f) => f.note).join(' | '));
  });

  await check('(h) Re-shoot zoom: no model takes a zoom/distance number → capabilities.zoomSupported false, no zoom input', async () => {
    const t = await get(`${A}/api/tools`); const rs = (Array.isArray(t) ? t : t.tools).find((x: any) => x.id === 'reshoot');
    assert.equal(rs.capabilities.zoomSupported, false); assert.ok(typeof rs.capabilities.zoomNote === 'string' && rs.capabilities.zoomNote.length > 0); assert.ok(!rs.inputs.some((i: any) => /zoom/i.test(i.name))); /* a 'distance' field exists only for New angle · H3 CrossView (camera distance, 2026-10-26) */ if (rs.inputs.some((i: any) => /distance/i.test(i.name))) assert.ok(/crossview/i.test(JSON.stringify(rs)));
  });

  await check('(i) GET /api/topups = /api/pricing topUps', async () => {
    const r = await getS(`${A}/api/topups`); assert.equal(r.status, 200); const P2 = await get(`${A}/api/pricing`);
    assert.deepEqual(r.j.topUps, P2.topUps); assert.deepEqual(r.j.items, P2.topUps); assert.equal(r.j.total, P2.topUps.length); assert.equal(r.j.topUpsNote, P2.topUpsNote);
  });

  await check('(l) /api/health/self-host disk paths are repo-relative / folder names (like /api/hardware disk.path), never absolute', async () => {
    const h = await get(`${W}/api/health/self-host`); const d = h.disk ?? h.storage?.disk ?? h; const paths: string[] = [];
    const walk = (x: any) => { if (!x || typeof x !== 'object') return; for (const [k, v] of Object.entries(x)) { if (k === 'path' && typeof v === 'string') paths.push(v); else walk(v); } }; walk(h.disk ?? h);
    assert.ok(paths.length >= 1, JSON.stringify(h).slice(0, 400)); for (const x of paths) { assert.ok(!path.isAbsolute(x), `absolute path: ${x}`); assert.ok(!x.includes(T) && !x.includes(os.tmpdir()), x); }
    const hw = await get(`${W}/api/hardware`); assert.ok(!path.isAbsolute(hw.disk.path)); void d;
  });

  await check('(m)(n)(o) ambiguous_download choices carry toolNames and exactly the per-model downloadIds of /api/models; a real 409 weights gate', async () => {
    const amb = await send('POST', `${W}/api/local/downloads`, { providerId: 'comfy-open' }); assert.equal(amb.status, 400); assert.equal(amb.j.code, 'ambiguous_download');
    console.log('BODY ambiguous_download 400: ' + JSON.stringify(amb.j));
    for (const c of amb.j.choices) { assert.ok(Array.isArray(c.toolNames) && c.toolNames.length === c.toolIds.length, JSON.stringify(c)); for (const n of c.toolNames) assert.ok(typeof n === 'string' && n.length > 0); }
    const tools = await get(`${W}/api/tools`); const names = new Map(((Array.isArray(tools) ? tools : tools.tools) as any[]).map((t) => [t.id, t.name]));
    for (const c of amb.j.choices) assert.deepEqual(c.toolNames, c.toolIds.map((id: string) => names.get(id) ?? id));
    const m = await get(`${W}/api/models`); const ids = new Set<string>(); const walk = (x: any) => { if (!x || typeof x !== 'object') return; if (typeof x.downloadId === 'string' && x.downloadId.startsWith('comfy-open')) ids.add(x.downloadId); for (const v of Object.values(x)) walk(v); }; walk(m);
    assert.deepEqual(new Set(amb.j.choices.map((c: any) => c.downloadId)), ids, 'choices downloadIds = /api/models downloadIds for comfy-open');
    assert.ok([...ids].some((i) => /camera-moves/.test(i)) && ![...ids].some((i) => /camera-moves\+camera-ltx/.test(i)), [...ids].join(','));
    for (const c of amb.j.choices) { const dr = await send('POST', `${W}/api/local/downloads`, { downloadId: c.downloadId, dryRun: true }); assert.ok(dr.status === 200 || dr.status === 409, `${c.downloadId}: ${dr.status} ${JSON.stringify(dr.j).slice(0, 200)}`); }
    const fd = new FormData(); fd.set('provider', 'comfy-realesrgan'); fd.set('route', 'local:comfy-realesrgan'); fd.set('types', '["x2"]'); fd.set('image', new Blob([fs.readFileSync(PNG)], { type: 'image/png' }), 'x.png');
    const r = await fetch(`${W}/api/tools/image-upscale/jobs`, { method: 'POST', body: fd }); const j = await r.json() as any; console.log('BODY weights gate ' + r.status + ': ' + JSON.stringify(j));
    assert.equal(r.status, 409, JSON.stringify(j).slice(0, 400)); assert.equal(j.code, 'weights_missing'); assert.equal(j.charged, false); assert.ok(!JSON.stringify(j).includes(MD), 'no absolute models dir');
  });
} finally {
  for (const p of procs) { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } }
  await new Promise((r) => setTimeout(r, 500)); fs.rmSync(T, { recursive: true, force: true });
}
const failed = results.filter((r) => !r.pass); console.log(`\ndp30: ${results.length - failed.length}/${results.length} checks passed`); if (failed.length) process.exit(1);
