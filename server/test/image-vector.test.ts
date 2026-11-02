// Image to vector (SVG) (2026-11-03): VTracer on this computer (free) and Ideogram Vector 1 on Comfy Cloud (shared/imageVector.ts, vectorTrace.ts,
// comfy/ideogramVectorCloud.ts, tools/imageVectorApps.ts, tools/apps.ts app-image-vector).
// Unit (in process, no network, no spend): styles → VTracer settings, size rules, the sanitizer, real traces (flat transparent PNG keeps its transparency,
// a huge picture is scaled down and says so, a tiny one is refused, a small one gets a note, a photo works with a calm note, an SVG and a non-picture are
// refused, cancel aborts), the Ideogram graph (template shape), the price (30.17 Comfy credits), /files rules for SVG results.
// E2E (own mock server, temp data dir, no keys): the workflow recipe, quote = charge, a real local trace served as image/svg+xml in a sandbox, an SVG upload
// refused with a plain reason, Ideogram without a key = a labelled sample (never a fake price on a real backend), Recreate keeps the style.
// Run: npx tsx test/image-vector.test.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'vector-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const ok = (m: string) => console.log('ok ' + m);
const UNIT_DATA = fs.mkdtempSync(path.join(D, 'unit-'));
Object.assign(process.env, NOKEYS, { OPENHIGGSFIELD_DATA_DIR: UNIT_DATA, OPENHIGGSFIELD_BACKEND: 'mock' });
const ff = (name: string, src: string, vf = '') => { const f = path.join(D, name); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', src, ...(vf ? ['-vf', vf] : []), '-frames:v', '1', f]); return f; };
// a flat logo: two shapes on a transparent background
const LOGO = ff('logo.png', 'color=c=black@0:s=400x400,format=rgba[bg];color=c=red:s=120x120,format=rgba[a];color=c=blue:s=50x70,format=rgba[b];[bg][a]overlay=20:20[t];[t][b]overlay=250:250');
const HUGE = ff('huge.png', 'color=c=white:s=3000x1000', 'drawbox=x=200:y=200:w=900:h=500:color=green:t=fill');
const TINY = ff('tiny.png', 'color=c=red:s=8x8'); const SMALL = ff('small.png', 'color=c=white:s=40x40', 'drawbox=x=10:y=10:w=20:h=20:color=black:t=fill');
const PHOTO = ff('photo.jpg', 'testsrc2=s=320x240', 'noise=alls=60:allf=t');
const SVG = path.join(D, 'logo.svg'); fs.writeFileSync(SVG, '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
const TXT = path.join(D, 'notes.png'); fs.writeFileSync(TXT, 'not a picture at all');

// ---------------- unit ----------------
const V = await import('../src/shared/imageVector.ts'); const T = await import('../src/vectorTrace.ts'); const G = await import('../src/comfy/ideogramVectorCloud.ts');
{
  assert.deepEqual(V.VECTOR_MODELS, ['local-vtracer', 'cloud-ideogram-vector'], 'VTracer (free) first, then Ideogram Vector');
  assert.deepEqual(V.VECTOR_STYLES.map((s) => s.label), ['Logo / flat', 'Illustration', 'Detailed']);
  const S = V.VTRACER_SETTINGS; assert.ok(S.logo.colorPrecision < S.illustration.colorPrecision && S.illustration.colorPrecision < S.detailed.colorPrecision, 'more colours as the style keeps more');
  assert.ok(S.logo.filterSpeckle > S.illustration.filterSpeckle && S.illustration.filterSpeckle > S.detailed.filterSpeckle, 'fewer specks dropped as the style keeps more');
  assert.ok(S.logo.layerDifference > S.detailed.layerDifference); assert.equal(V.vectorStyleOf('nope'), 'logo');
  assert.deepEqual(V.vectorTraceSize(3000, 1000), { width: 2048, height: 683, scaled: true }); assert.deepEqual(V.vectorTraceSize(800, 600), { width: 800, height: 600, scaled: false });
  assert.equal(V.vectorPhotoBlock({ width: 8, height: 400 })?.code, 'photo_too_small'); assert.equal(V.vectorPhotoBlock({ width: 16, height: 16 }), null);
  ok('styles → VTracer settings (Logo / flat fewest colours, Detailed most), 2048 px trace cap, 16 px floor');
  const dirty = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script>
<foreignObject><iframe src="https://evil.test"/></foreignObject><a href="javascript:alert(3)"><path d="M0 0L1 1Z" fill="#f00" onclick='x()'/></a>
<image href="https://evil.test/p.png"/><use xlink:href="#p"/><rect style="fill:url(https://evil.test/x)" fill="url(#g)"/><set attributeName="href" to="javascript:alert(4)"/></svg>`;
  const clean = V.sanitizeSvg(dirty);
  for (const bad of ['<script', 'onload', 'onclick', 'foreignObject', 'iframe', 'javascript:', 'evil.test', 'ENTITY', 'DOCTYPE', '<set']) assert.ok(!clean.includes(bad), `sanitized: no ${bad}`);
  for (const good of ['<path d="M0 0L1 1Z" fill="#f00"', 'xlink:href="#p"', 'fill="url(#g)"', '<?xml version="1.0"?>']) assert.ok(clean.includes(good), `sanitized keeps ${good}`);
  ok('sanitizer: scripts, handlers, foreignObject, external / javascript: links, entities dropped; paths, in-document refs and gradients kept');
}
{
  const r = await T.tracePicture(LOGO, 'logo'); assert.match(r.svg, /^<\?xml[\s\S]*<svg[^>]*width="400" height="400"/); assert.equal(r.paths, 2, 'two shapes, no background shape: the transparent area stays transparent');
  assert.deepEqual([r.scaled, r.photo, r.notes.length], [false, false, 0]); assert.ok(/fill="#F[C-F]0000"/i.test(r.svg) && /fill="#0000F[C-F]"/i.test(r.svg), 'flat colours kept');
  const det = await T.tracePicture(LOGO, 'detailed'); assert.ok(det.paths >= 2);
  const h = await T.tracePicture(HUGE, 'illustration'); assert.equal(h.scaled, true); assert.deepEqual(h.traced, { width: 2048, height: 683 }); assert.match(h.notes[0], /3000×1000; it was traced at 2048×683/); assert.match(h.svg, /width="2048" height="683"/);
  await assert.rejects(T.tracePicture(TINY, 'logo'), (e: any) => e.code === 'photo_too_small');
  const sm = await T.tracePicture(SMALL, 'logo'); assert.match(sm.notes.join(' '), /small \(40×40\)/);
  const ph = await T.tracePicture(PHOTO, 'illustration'); assert.equal(ph.photo, true); assert.match(ph.notes.join(' '), /looks like a photo/); assert.ok(ph.paths > 20, 'a photo still traces');
  await assert.rejects(T.tracePicture(SVG, 'logo'), (e: any) => e.code === 'already_vector' && /already a vector/.test(e.message));
  await assert.rejects(T.tracePicture(TXT, 'logo'), (e: any) => e.code === 'format');
  const ac = new AbortController(); ac.abort(); await assert.rejects(T.tracePicture(HUGE, 'detailed', ac.signal), 'an aborted trace stops');
  ok(`real VTracer traces: logo ${r.paths} paths (transparency kept), 3000×1000 → 2048×683 with a note, 8×8 refused, 40×40 noted, photo traced (${ph.paths} paths) with a calm note, SVG and text refused, abort stops`);
}
{
  const g = G.ideogramVectorGraph({ __file: 'x.png' }); assert.deepEqual(Object.values<any>(g).map((n) => n.class_type), ['LoadImage', 'IdeogramVectorImageToSVGApi', 'SaveSVGNode']);
  assert.deepEqual(g['2'].inputs, { model: 'ideogram-vector-1', 'model.image': ['1', 0], mode: 'default' }); assert.deepEqual(g['3'].inputs.svg, ['2', 0]);
  const p = G.ideogramVectorCloudPlan({ id: 'j1', toolId: 'app-image-vector', provider: 'cloud-ideogram-vector', input: { imagePath: '/d/x.png' } }); assert.equal(p.passes.length, 1); assert.equal(p.passes[0].output, '3');
  assert.throws(() => G.ideogramVectorCloudPlan({ id: 'j1', toolId: 'app-image-vector', provider: 'cloud-ideogram-vector', input: { imagePath: '/d/x.svg' } }), /already a vector/);
  const H = await import('../src/shared/hostedPrices.ts'); const P = await import('../src/shared/pricing.ts'); await import('../src/tools/registry.ts');
  assert.equal(H.HOSTED_BY_ID['cloud-ideogram-vector'].usd, Math.round(30.17 / 211 * 1e5) / 1e5); assert.equal(H.HOSTED_BY_ID['cloud-ideogram-vector'].unit, 'image');
  assert.equal(P.priceOf({ toolId: 'app-image-vector', provider: 'cloud-ideogram-vector', count: 1 } as any).credits, 15); assert.equal(P.priceOf({ toolId: 'app-image-vector', provider: 'local-vtracer', count: 1 } as any).credits, 0);
  const L = await import('../src/security/localOnly.ts'); const U = await import('../src/uploadSecurity.ts');
  assert.equal(L.filesPathAllowed('/files/ab12cd34-out0.svg'), true); assert.equal(L.filesPathAllowed('/files/evil.svg'), false); assert.equal(L.filesPathAllowed('/files/x/ab12cd34-out0.svg'), false);
  const hd: Record<string, string> = {}; U.mediaResponseHeaders({ setHeader: (k, v) => { hd[k] = v; } }, '/files/ab12cd34-out0.svg'); assert.equal(hd['Content-Disposition'], undefined); assert.match(hd['Content-Security-Policy'], /sandbox/);
  const hd2: Record<string, string> = {}; U.mediaResponseHeaders({ setHeader: (k, v) => { hd2[k] = v; } }, '/files/evil.svg'); assert.equal(hd2['Content-Disposition'], 'attachment');
  ok('Ideogram graph = template (LoadImage → IdeogramVectorImageToSVGApi model.image, mode default → SaveSVGNode); 30.17 Comfy credits → ✦15; VTracer ✦0; only <job>-out<n>.svg served inline, sandboxed');
}

// ---------------- e2e (mock server, no keys) ----------------
const PORT = testPort(9186); const B = `http://localhost:${PORT}`; const DATA = fs.mkdtempSync(path.join(D, 'srv-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env.local'), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '100', COMFY_DETECT_URLS: 'http://127.0.0.1:9' }, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
let stderr = ''; srv.stderr!.on('data', (b) => { stderr += String(b); });
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: await r.json() as any }; };
const submit = async (f: Record<string, string>, file: string, type = 'image/png') => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); fd.append('image', new Blob([fs.readFileSync(file)], { type }), path.basename(file));
  const r = await fetch(`${B}/api/tools/app-image-vector/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const wait = async (id: string) => { let job: any = null; for (let i = 0; i < 120; i++) { job = (await get(`/api/jobs/${id}`)).body; if (['done', 'failed', 'canceled'].includes(job.status)) break; await new Promise((r) => setTimeout(r, 250)); } return job; };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  assert.ok(!/\[image-workflows\]/.test(stderr), `boot validation is clean: ${stderr.match(/\[image-workflows\][\s\S]*/)?.[0]}`);
  const w = (await get('/api/image-workflows')).body.workflows.find((x: any) => x.id === 'image-vector');
  assert.equal(w.name, 'Image to vector (SVG)'); assert.equal(w.runner.toolId, 'app-image-vector'); assert.deepEqual(w.slots.map((s: any) => [s.name, s.required]), [['image', true]]);
  assert.deepEqual(w.controls.map((c: any) => [c.field, c.options.map((o: any) => o.value), c.default]), [['style', ['logo', 'illustration', 'detailed'], 'logo']]);
  assert.deepEqual(w.models.edit, V.VECTOR_MODELS, JSON.stringify(w.unavailable)); assert.equal(w.prompt.mode, 'hidden');
  ok('workflow: Image to vector (SVG): one picture slot, Style Logo / flat · Illustration · Detailed, VTracer then Ideogram Vector, no prompt');
  const lq = (await get('/api/tools/app-image-vector/price?provider=local-vtracer&image=1&types=edit&style=logo')).body; assert.equal(lq.credits ?? lq.listCredits ?? 0, 0); assert.notEqual(lq.runnable, false, JSON.stringify(lq).slice(0, 300));
  const iq = (await get('/api/tools/app-image-vector/price?provider=cloud-ideogram-vector&image=1&types=edit')).body; assert.equal(iq.credits ?? iq.listCredits, 15, JSON.stringify(iq).slice(0, 300));
  ok(`quotes: VTracer ✦0 (${lq.route}), Ideogram Vector ✦${iq.credits ?? iq.listCredits} (${iq.route})`);
  const s = await submit({ provider: 'local-vtracer', style: 'illustration', rights: '1' }, LOGO); assert.equal(s.status, 200, JSON.stringify(s.body).slice(0, 300)); assert.equal(s.body.cost ?? 0, 0);
  const job = await wait(s.body.id); assert.equal(job.status, 'done', job.error); assert.match(job.outputs[0].url, /^\/files\/[0-9a-z]+-out0\.svg$/); assert.equal(job.input.style, 'illustration'); assert.equal(job.input.vector, true);
  const f = await fetch(B + job.outputs[0].url); assert.equal(f.status, 200); assert.match(String(f.headers.get('content-type')), /^image\/svg\+xml/, job.outputs[0].url + ' ' + JSON.stringify([...f.headers])); assert.match(String(f.headers.get('content-security-policy')), /sandbox/);
  assert.equal(f.headers.get('content-disposition'), null); assert.match(await f.text(), /<svg[\s\S]*<path/);
  ok(`local trace: ${job.outputs[0].url} served as image/svg+xml under a sandbox CSP, style kept on the job`);
  const pre = (await get(`/api/jobs/${job.id}/prefill?action=recreate`)); assert.equal(pre.status, 200); assert.equal(JSON.stringify(pre.body).includes('illustration'), true, 'Recreate keeps the style');
  { const fd = new FormData(); fd.append('prompt', 'a flat fox logo'); fd.append('types', '["generate"]'); fd.append('rights', '1');
    const cj = await wait(((await (await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd })).json()) as any).id); assert.equal(cj.status, 'done');
    const hv = (await get(`/api/jobs/${cj.id}/prefill?action=vector`)).body; assert.equal(hv.available, true); assert.equal(hv.url, `/image?workflow=image-vector&fromJob=${cj.id}&as=image&out=0`);
    const hs = (await get(`/api/jobs/${job.id}/prefill?action=vector`)).body; assert.notEqual(hs.available, true, 'an SVG result is not offered again'); }
  ok('Recreate prefills the style');
  const sv = await submit({ provider: 'local-vtracer', rights: '1' }, SVG, 'image/svg+xml'); assert.equal(sv.status, 400); assert.match(sv.body.error, /already a vector/);
  const tx = await submit({ provider: 'local-vtracer', rights: '1' }, TXT); assert.equal(tx.status, 400);
  const tn = await submit({ provider: 'local-vtracer', rights: '1' }, TINY); assert.equal(tn.status, 400); assert.match(String(tn.body.issues?.[0]?.code), /^(photo_too_small|low_res)$/);
  ok(`refused before anything runs: SVG ("${sv.body.error}"), a text file, an 8×8 picture`);
  const ph = await submit({ provider: 'local-vtracer', rights: '1' }, PHOTO, 'image/jpeg'); const pj = await wait(ph.body.id); assert.equal(pj.status, 'done'); assert.ok(pj.warnings.some((x: string) => /looks like a photo/.test(x)));
  const hj = await wait((await submit({ provider: 'local-vtracer', rights: '1' }, HUGE)).body.id); assert.equal(hj.status, 'done'); assert.ok(hj.warnings.some((x: string) => /traced at 2048×683/.test(x)));
  ok('a photo and a 3000×1000 picture trace, each with a calm note');
  const ij = await wait((await submit({ provider: 'cloud-ideogram-vector', rights: '1' }, LOGO)).body.id); assert.equal(ij.status, 'done', ij.error); assert.match(ij.outputs[0].label, /^Sample/); assert.match(ij.outputs[0].url, /\.svg$/);
  ok(`Ideogram Vector without a key: a labelled sample (${ij.outputs[0].label}), traced on this computer`);
  console.log('PASS image-vector');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); }
