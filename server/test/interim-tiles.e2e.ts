// Interim AI tiles (manifest): a still at web/public/examples/<page>/<id>.jpg (here a temp OPENHIGGSFIELD_EXAMPLES_DIR) switches the tile to it
// (aiGenerated, credit, previewWebm null); a missing still keeps the old art. Community AI seeds c1..c7 only when their file exists. Jobs carry
// posterUrl + caption; elements carry aiGenerated + credit. Restyle swatchUrl is untouched. Run: npx tsx test/interim-tiles.e2e.ts (port 8961)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const ok = (m: string) => console.log('ok ' + m);
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'itiles-')); const DATA = path.join(D, 'data'); const EX = path.join(D, 'examples');
const still = (rel: string) => { const f = path.join(EX, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=teal:s=64x36', '-frames:v', '1', f]); };
for (const r of ['object-swap/product.jpg', 'motion-transfer/new-cast.jpg', 'restyle/anime-cel.jpg', 'community/i1.jpg', 'community/demo01.jpg', 'assets/demo01.jpg']) still(r);
const PORT = testPort(8961); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_EXAMPLES_DIR: EX, OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'none.json') }, stdio: 'ignore', detached: true });
const get = async (u: string) => { const r = await fetch(B + u); assert.ok(r.ok, `${u} → ${r.status}`); return (await r.json()) as any; };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  // (a) presets through /api/effects and /api/presets
  const eff = await get('/api/effects'); const items: any[] = eff.items ?? eff; assert.ok(items.length > 0);
  for (const it of items) { assert.equal(typeof it.aiGenerated, 'boolean', `${it.id} aiGenerated`); assert.ok(it.credit === null || typeof it.credit === 'string'); }
  const sw = (await get('/api/presets?toolId=object-swap&limit=100')).items as any[]; const prod = sw.find((x) => x.id === 'product'), car = sw.find((x) => x.id === 'car');
  assert.equal(prod.posterUrl, '/examples/object-swap/product.jpg'); assert.equal(prod.previewWebm ?? null, null); assert.equal(prod.aiGenerated, true); assert.equal(prod.credit, 'AI-generated preview');
  assert.equal(car.posterUrl, '/samples/presets/object-swap-car.jpg'); assert.equal(car.previewWebm, '/samples/presets/object-swap-car.webm'); assert.notEqual(car.aiGenerated, true);
  const mt = (await get('/api/presets?toolId=motion-transfer&limit=100')).items as any[]; const dance = mt.find((x) => x.id === 'new-cast');
  assert.ok(dance, 'new-cast preset'); if (dance) { assert.equal(dance.posterUrl, '/examples/motion-transfer/new-cast.jpg'); assert.equal(dance.aiGenerated, true); }
  const rs = (await get('/api/presets?toolId=restyle&limit=100')).items as any[]; const an = rs.find((x) => x.id === 'anime-cel');
  assert.ok(an, 'anime-cel style'); if (an) { assert.equal(an.posterUrl, '/examples/restyle/anime-cel.jpg'); assert.equal(an.aiGenerated, true); if (an.swatchUrl) assert.match(an.swatchUrl, /samples\/styles/, 'swatchUrl untouched'); }
  // /examples/* is served by the web app (web/public), not :8787 — nothing to fetch here
  ok(`presets: product → AI still (previewWebm null, credit), car keeps old art${dance ? ', motion new-cast AI' : ''}${an ? ', restyle anime-cel AI (swatchUrl untouched)' : ''}; /api/effects carries aiGenerated + credit`);
  // (b)+(e) community seeds
  const sh = (await get('/api/community/shots?limit=100')).items as any[]; const samples = sh.filter((x) => x.kind === 'sample');
  const i1 = samples.find((x) => String(x.posterUrl ?? x.previewUrl).includes('/examples/community/i1.jpg')); assert.ok(i1, 'i1 uses the AI still'); assert.equal(i1.aiGenerated, true); assert.equal(i1.sampleCredit, 'AI-generated sample · Imagination Is All You Need');
  const c1 = samples.find((x) => String(x.posterUrl ?? x.previewUrl).includes('/examples/community/demo01.jpg')); assert.ok(c1, 'c1 seeded'); assert.equal(c1.aiGenerated, true);
  assert.ok(!samples.some((x) => /\/examples\/community\/(a07a4acd|0e932ba1)/.test(String(x.posterUrl ?? x.previewUrl))), 'c2.. not seeded without a file');
  const otherImg = samples.filter((x) => x !== i1 && x !== c1 && x.media === 'image'); assert.ok(otherImg.every((x) => x.aiGenerated === false), 'image seeds without a still stay non-AI');
  ok(`community: i1 + c1 AI (credit), c2..c7 pending (not seeded), ${otherImg.length} other image seeds keep old art (aiGenerated false)`);
  // (c) jobs carry posterUrl + caption
  const fd = new FormData(); fd.set('prompt', 'a red cube'); fd.set('types', '["generate"]'); const sub = await (await fetch(B + '/api/tools/create-image/jobs', { method: 'POST', body: fd })).json() as any; assert.ok(sub.id ?? sub.job?.id, JSON.stringify(sub));
  const jl = await get('/api/jobs'); const arr: any[] = jl.items ?? jl.jobs ?? jl; const mine = arr.find((j) => j.id === (sub.id ?? sub.job?.id)); assert.ok(mine, 'job listed');
  assert.ok('posterUrl' in mine && 'caption' in mine); assert.equal(mine.posterUrl, null); assert.equal(mine.caption, null);
  ok('/api/jobs items carry posterUrl + caption (null for a normal job)');
  // (d) elements
  const efd = new FormData(); efd.set('name', 'Bottle'); efd.set('kind', 'product'); efd.set('file', new Blob([fs.readFileSync(path.join(EX, 'assets/demo01.jpg'))], { type: 'image/jpeg' }), 'b.jpg');
  const er = await fetch(B + '/api/elements', { method: 'POST', body: efd }); const el = await er.json() as any; assert.ok(er.ok, JSON.stringify(el)); assert.equal(el.aiGenerated ?? el.element?.aiGenerated, false, 'uploaded photo → not AI');
  const els = await get('/api/elements'); const list: any[] = els.items ?? els.elements ?? els; assert.ok(list.length >= 1);
  for (const e of list) { assert.equal(typeof e.aiGenerated, 'boolean'); assert.ok(e.credit === null || typeof e.credit === 'string'); }
  ok(`elements carry aiGenerated + credit (${list.length}; POST → ${JSON.stringify({ aiGenerated: el.aiGenerated ?? el.element?.aiGenerated })})`);
  console.log('ALL OK interim-tiles');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
