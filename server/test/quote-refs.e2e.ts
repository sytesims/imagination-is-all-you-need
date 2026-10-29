// E2E (own mock server, temp data): upscale quote = charge (width/height/seconds/scale/mode), per-provider scales,
// and 3 multipart `refs` reach the Klein local multi-ref plan and the BFL request. Run: npx tsx test/quote-refs.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const PORT = testPort(8825), B = `http://localhost:${PORT}`, D = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DEMO_AUTO: '0' /* keyless = no_provider (real-mode rules) */, OPENHIGGSFIELD_BILLING_MODE: 'team' /* quote = charge is measured on the app balance: team mode (2026-10-21) */ }, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-srv.pid!); } catch { /* gone */ } };
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }
  { // no key (cloud-first default): the asked route's real price, flagged — never 0 as the price
    const j = await (await fetch(`${B}/api/tools/upscale/price?provider=direct-flux3-upscale&width=1280&height=720&seconds=5&scale=2&mode=precise&maxOutput=1440p`)).json();
    // Run on (2026-10-22, 4k 5b-1): nothing ready → nothing pre-selected (no route, no price on the quote); the setup option carries the place's real price
    assert.equal(j.credits, null); assert.equal(j.route, null); assert.equal(j.needsKey, true); assert.equal(j.runnable, false);
    assert.deepEqual(j.setupOptions.map((o: any) => [o.runOn, o.routeId, o.action, o.credits]), [['comfy-cloud', 'comfy-router:direct-flux3-upscale', 'add_key', 185]]); /* 2026-10-26: also on Comfy Router (estimate: 21.12 credits per MP-s). 2026-10-27: the BFL place is hidden while Comfy covers the model (routing/hiddenPlaces.ts), so it is no setup option */ // 2560×1440 × 5 s × $0.035 (BFL price re-read 2026-10-23)
    assert.deepEqual(j.noProvider.providers.map((p: any) => p.id).sort(), ['bfl', 'comfy']);
    const r = await (await fetch(`${B}/api/tools/upscale/price?provider=direct-flux3-upscale&route=direct:direct-flux3-upscale&width=1280&height=720&seconds=5&scale=2&mode=precise&maxOutput=1440p`)).json(); // the place asked for: its real price, flagged
    assert.equal(r.credits, 65); assert.equal(r.needsKey, true); assert.equal(r.runnable, false); assert.equal(r.priceAvailable, true); assert.equal(r.route, 'direct:direct-flux3-upscale');
    console.log('ok no key: nothing pre-selected, setup option Comfy 185 cr (BFL place hidden); BFL route asked → credits 65 + needsKey/runnable:false, providers [bfl]');
  }
  await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: { mode: 'auto', allowFallback: true, useLocal: true, mockKeys: true } }) });
  const vid = path.join(D, 'src.mp4'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=24', '-f', 'lavfi', '-i', 'sine', '-t', '5', '-shortest', '-pix_fmt', 'yuv420p', vid]);
  const bal = async () => (await (await fetch(`${B}/api/ledger`)).json()).balance;
  const post = async (tool: string, f: Record<string, string>, files: [string, string][]) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)]), path.basename(p)); const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() }; };
  // 1) quote = charge
  for (const [scale, mode] of [['2', 'precise'], ['1.5', 'creative'], ['3', 'precise']]) {
    const qs = `provider=direct-flux3-upscale&width=1280&height=720&seconds=5&scale=${scale}&mode=${mode}&maxOutput=4k`;
    const price = await (await fetch(`${B}/api/tools/upscale/price?${qs}`)).json(); const quote = await (await fetch(`${B}/api/models/quote?toolId=upscale&model=direct-flux3-upscale&width=1280&height=720&seconds=5&scale=${scale}&mode=${mode}&maxOutput=4k`)).json();
    const b0 = await bal(); const job = await post('upscale', { types: JSON.stringify([mode]), rights: '1', scale, provider: 'direct-flux3-upscale', maxOutput: '4k' }, [['video', vid]]); const charged = b0 - (await bal());
    assert.equal(job.status, 200, JSON.stringify(job.body)); assert.ok(price.credits > 0); assert.equal(price.runnable, true); assert.equal(price.needsKey, false); assert.equal(price.credits, charged, `price ${scale}× ${mode}`); assert.equal(quote.credits, charged, `quote ${scale}× ${mode}`);
    console.log(`ok quote = price = charge: ${scale}× ${mode} → ${charged} credits`);
  }
  { // 2026-10-28: a 1080p clip at the 1080p default is not refused: it is quoted at the next size up, and the quote says so before Generate
    const u = await (await fetch(`${B}/api/tools/upscale/price?provider=comfy-video-esrgan&width=1920&height=1080&seconds=5&maxOutput=1080p`)).json();
    assert.notEqual(u.code, 'already_at_target', JSON.stringify(u)); assert.match(String(u.adjustNotes?.[0]), /already 1080p, so it is upscaled to 1440p/, JSON.stringify(u.adjustNotes ?? u.error));
    console.log('ok upscale quote: 1080p clip at 1080p → 1440p with an adjust note'); }
  // 2) per-provider scales
  const bfl4 = await post('upscale', { types: '["precise"]', rights: '1', scale: '4', provider: 'direct-flux3-upscale' }, [['video', vid]]); assert.equal(bfl4.status, 400); assert.equal(bfl4.body.issues[0].field, 'scale');
  const q4 = await fetch(`${B}/api/models/quote?toolId=upscale&model=direct-flux3-upscale&width=1280&height=720&seconds=5&scale=4`); assert.equal(q4.status, 400);
  const tools = await (await fetch(`${B}/api/tools`)).json(); const up = tools.find((t: any) => t.id === 'upscale'); assert.deepEqual(up.app.scalesByProvider['direct-flux3-upscale'], [1.5, 2, 3]); assert.deepEqual(up.app.scalesByProvider['router-crystal-video'], [2, 4]); // the size models (Real-ESRGAN, SeedVR2, Topaz) take a size, not a factor (shared/videoUpscale.ts)
  console.log('ok scales: BFL 1.5×/2×/3×; unsupported → 400 field scale (job + quote)');
  // 3) 3 refs → plan + BFL request
  const png = path.join(import.meta.dirname, 'fixtures/ref-512.png');
  const k = await post('create-image', { types: '["edit"]', rights: '1', prompt: 'combine', provider: 'comfy-flux3-klein' }, [['image', png], ['refs', png], ['refs', png]]); assert.equal(k.status, 200, JSON.stringify(k.body));
  await new Promise((r) => setTimeout(r, 1500)); const job = await (await fetch(`${B}/api/jobs/${k.body.id}`)).json();
  const refPaths = job.input.refUrls.map((u: string) => path.join(D, path.basename(u))); assert.equal(refPaths.length, 3); refPaths.forEach((p: string) => assert.ok(fs.existsSync(p)));
  const { buildPlan } = await import('../src/comfy/plans.js'); const plan = buildPlan({ id: 'x', toolId: 'create-image', provider: 'comfy-flux3-klein', input: { mode: 'edit', prompt: 'combine', imagePath: refPaths[0], refPaths } } as any);
  assert.equal(plan.passes[0].workflow, 'create-image-flux3klein-multiref-api.json'); assert.equal(Object.values<any>(plan.passes[0].graph).filter((n) => n.class_type === 'LoadImage').length, 3);
  const { findRoute } = await import('../src/routing/routes.js'); const req = await findRoute('direct:bfl/flux-3-image-klein')!.direct!.build({ id: 'x', input: { prompt: 'combine', refPaths, imageResolution: '2K' } });
  assert.equal((req.body!.images as string[]).length, 3); assert.equal(req.body!.resolution, '2k');
  console.log('ok 3 multipart refs → job refPaths 3 → local multiref plan 3 LoadImage → BFL images[3]');
} finally { stop(); }
process.exit(0);
