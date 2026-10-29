// Recipe links and "Make this" (2026-10-25): server/src/shared/recipe.ts and GET /api/jobs/:id/recipe.
// Unit: round trip (Unicode prompt), the allow-list (no files / URLs / keys / paths / markup values), garbage and huge input refused safely,
// a newer recipe still opens (flagged), the older share-page JSON (no version) reads, a paste finds the link inside the plain text, closest
// match, the X hashtag, and "Get the app" reading one constant on both sides.
// E2E (own mock server, temp data dir, no keys, no spend): a finished job's recipe has the tool, model and seed, no prompt unless ?prompt=1,
// never a file URL; its /r path decodes back to the same recipe; another owner's job → 404 for unknown ids.
// Run: npx tsx test/share-recipe.test.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'share-recipe-'));
const ok = (m: string) => console.log('ok ' + m);
const R = await import('../src/shared/recipe.ts');
const L = await import('../src/shared/projectLinks.ts');
const P = await import('../../web/src/shared/sharePlatforms.ts');

// ---------------- encode / decode ----------------
{
  const full = { v: 1, app: 'Imagination Is All You Need', getIt: 'https://x', tool: { id: 'create-image', name: 'Create Image' }, model: { id: 'api-flux2-klein', name: 'FLUX.2 [klein] 4B' },
    workflow: { id: 'relight', name: 'Relight', url: 'https://github.com/x', licence: 'MIT', file: 'relight.json' }, ranOn: 'Local',
    settings: { aspect: '1:1', seed: 270723, n: 2, imageUrl: '/files/a.png', refUrls: ['/files/b.png'], apiKey: 'sk-123', ownerId: 'u1', style: 'https://evil.example/x', note: '<img src=x onerror=alert(1)>', path: 'C:\\x', ok: true },
    prompt: 'A café at dusk, 夜 🌙 <script>alert(1)</script>' };
  const s = R.sanitizeRecipe(full); assert.ok(s.ok); const r = s.recipe;
  assert.deepEqual(r.settings, { aspect: '1:1', seed: 270723, n: 2, ok: true }, 'only plain settings survive');
  assert.deepEqual(s.dropped.sort(), ['apiKey', 'imageUrl', 'note', 'ownerId', 'path', 'refUrls', 'style'].sort());
  assert.deepEqual(r.workflow, { id: 'relight', name: 'Relight' }, 'no workflow URL or file in the link form');
  assert.equal(r.prompt, full.prompt, 'the prompt is kept as text (the page renders it as text, never HTML)');
  const code = R.encodeRecipe(r); assert.match(code, /^[A-Za-z0-9_-]+$/, 'base64url');
  const back = R.decodeRecipe(code); assert.ok(back.ok); assert.deepEqual(back.recipe, r, 'round trip, Unicode included');
  assert.equal(R.recipePath(r), `/r?recipe=${code}`); assert.equal(R.recipeLink('http://localhost:5174/', r), `http://localhost:5174/r?recipe=${code}`);
  assert.ok(!JSON.stringify(R.compactRecipe(r)).match(/files|https?:|sk-/), 'nothing private in what travels');
  ok('round trip with a Unicode prompt; files, URLs, keys, owner ids, paths and markup values never travel');
}
{
  const bad = ['', '!!!!', 'eyJ', 'a'.repeat(R.MAX_RECIPE_CHARS + 1), Buffer.from('not json').toString('base64url'), Buffer.from('[1,2]').toString('base64url'), Buffer.from('{"tool":{"id":"../../etc"}}').toString('base64url'),
    Buffer.from('{"settings":{}}').toString('base64url'), Buffer.from([0xff, 0xfe, 0xfd]).toString('base64url')];
  for (const b of bad) { const d = R.decodeRecipe(b); assert.equal(d.ok, false, `refused: ${b.slice(0, 20)}`); assert.ok(!d.ok && d.error.length > 5 && d.error.length < 160, 'a plain message'); }
  const t0 = Date.now(); R.decodeRecipe('A'.repeat(10_000_000)); assert.ok(Date.now() - t0 < 200, 'a huge input is refused before decoding');
  // a recipe stuffed with settings / a giant prompt is capped
  const many = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, i]));
  const c = R.sanitizeRecipe({ tool: 'create-image', settings: many, prompt: 'x'.repeat(50_000) }); assert.ok(c.ok); assert.equal(Object.keys(c.recipe.settings).length, 40); assert.equal(c.recipe.prompt!.length, R.MAX_RECIPE_PROMPT);
  ok('garbage, truncated, non-JSON, wrong-shape, path-like ids and huge input refused with a plain message; settings and prompt capped');
}
{
  const newer = R.sanitizeRecipe({ v: 7, tool: { id: 'create-image' }, model: 'api-x', future: { a: 1 }, settings: { aspect: '16:9' } }); assert.ok(newer.ok && newer.newer, 'newer still opens, flagged');
  assert.equal(newer.ok && newer.recipe.model?.id, 'api-x', 'a model given as a plain id');
  const older = R.sanitizeRecipe({ app: 'Imagination Is All You Need', tool: { id: 'h3-video', name: 'Create Video' }, model: { id: null, name: null }, settings: {} });
  assert.ok(older.ok && !older.newer && older.recipe.v === 1 && older.recipe.model === null, 'a share page recipe from before versions reads as v1');
  // paste: the share sheet's plain text (ends with the link), the link, the bare code, the JSON
  const r = (R.sanitizeRecipe({ tool: { id: 'create-image', name: 'Create Image' }, settings: { seed: 5 } }) as any).recipe; const link = R.recipeLink('http://localhost:5174', r);
  const text = R.recipeText(r, link); assert.ok(text.startsWith('Recipe · Imagination Is All You Need') && text.endsWith(link) && text.includes('Settings: seed 5'));
  for (const input of [text, link, R.encodeRecipe(r), JSON.stringify(r), `  ${link}  `]) { const p = R.parseRecipeInput(input); assert.ok(p.ok, input.slice(0, 40)); assert.deepEqual((p as any).recipe, r); }
  for (const input of ['', 'hello there', '{"tool":', 'x'.repeat(R.MAX_RECIPE_CHARS * 4 + 1)]) assert.equal(R.parseRecipeInput(input).ok, false);
  ok('newer recipes open with a note; older share-page JSON reads; a paste finds the recipe in the text, the link, the code or the JSON');
}
{
  const models = [{ k: 'flux2-klein', n: 'FLUX.2 [klein] 4B' }, { k: 'qwen-image', n: 'Qwen Image 2.1' }, { k: 'seedream', n: 'Seedream 5.0' }];
  assert.equal(R.closest(['FLUX.2 [klein] 9B'], models, (m) => [m.n, m.k])?.k, 'flux2-klein');
  assert.equal(R.closest(['Seedream 4.5'], models, (m) => [m.n, m.k])?.k, 'seedream');
  assert.equal(R.closest(['zzzz'], models, (m) => [m.n, m.k]), null, 'nothing close → null');
  ok('closest: a missing model or tool maps to the nearest one we have, or none');
}
{
  assert.equal(L.APP_HASHTAG, '#ImaginationIsAllYouNeed');
  const brand = fs.readFileSync(path.join(ROOT, '../web/src/shared/brand.ts'), 'utf8'); const share = fs.readFileSync(path.join(ROOT, 'src/routesShare.ts'), 'utf8');
  assert.ok(/REPO_URL = GET_APP_URL/.test(brand) && /OPENHIGGSFIELD_PROJECT_URL \|\| GET_APP_URL/.test(share), 'both "Get the app" links read projectLinks.ts');
  const x = P.captionFor('x', { base: 'Made this in Imagination Is All You Need (open source)', repo: 'https://r', tag: true }); assert.equal(x, 'Made this in Imagination Is All You Need (open source) #ImaginationIsAllYouNeed');
  assert.ok(!fs.readdirSync(path.join(ROOT, '..')).includes('site'), 'no website files in the repo yet');
  ok('the X tag; "Get the app" is one constant for the web app and the server');
}

// ---------------- e2e ----------------
const PORT = testPort(9176); const B = `http://localhost:${PORT}`; const DATA = fs.mkdtempSync(path.join(D, 'srv-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env.local'), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_COMFY_ROUTER_URL: '' }, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: await r.json() as any }; };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const fd = new FormData(); for (const [k, v] of Object.entries({ prompt: 'a red mug on a wooden table <b>bold</b>', aspect: '1:1', seed: '4242', types: '["generate"]', rights: '1' })) fd.append(k, v);
  const sub = await (await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd })).json() as any; assert.ok(sub.id, JSON.stringify(sub).slice(0, 300));
  let j: any = null; for (let i = 0; i < 120; i++) { j = (await get(`/api/jobs/${sub.id}`)).body; if (['done', 'failed', 'blocked'].includes(j.status)) break; await new Promise((r) => setTimeout(r, 250)); }
  assert.equal(j.status, 'done', JSON.stringify(j).slice(0, 300));
  const a = (await get(`/api/jobs/${j.id}/recipe`)); assert.equal(a.status, 200); const rec = a.body.recipe;
  assert.equal(rec.tool.id, 'create-image'); assert.equal(rec.settings.aspect, '1:1'); assert.equal(Number(rec.settings.seed), 4242); assert.equal(rec.prompt, undefined, 'no prompt unless asked'); assert.equal(a.body.hasPrompt, false);
  assert.ok(!/\/files\/|https?:/.test(JSON.stringify(rec)), 'no file or URL in the recipe');
  const d = R.decodeRecipe(a.body.path.replace('/r?recipe=', '')); assert.ok(d.ok); assert.deepEqual(d.recipe, rec, 'the /r path is the same recipe');
  const b = (await get(`/api/jobs/${j.id}/recipe?prompt=1`)).body; assert.equal(b.recipe.prompt, 'a red mug on a wooden table <b>bold</b>'); assert.equal(b.hasPrompt, true);
  assert.equal((await get('/api/jobs/nope/recipe')).status, 404);
  ok('e2e: GET /api/jobs/:id/recipe: tool, aspect, seed; prompt only with ?prompt=1; no files; the /r path decodes to the same recipe; unknown job 404');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
console.log('share-recipe: all passed');
