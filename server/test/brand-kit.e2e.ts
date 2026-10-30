// Brand Kit (2026-10-27). Unit: the prompt phrase (shared/brandKit brandPhrase / withBrand / withoutBrand), colour words, the W3C tokens file
// (checkTokens), the other exports, the words-to-palette rules and colour extraction (transparent, white background, 1-colour, tiny).
// E2E (own mock server, temp data dir): /api/brand-kits CRUD and validation, the built-in kit, active kit, logo upload (PNG, SVG, an SVG with
// script refused), tokens.json download; a submit with brandKit=<id> gets the phrase after the typed prompt and keeps the kit on the job, the
// prompt peek shows the same words, Recreate gives back the typed words + brandKit; an unknown kit is a 400; an empty kit and a voiceover add nothing.
// Run: npx tsx test/brand-kit.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import * as BK from '../src/shared/brandKit.ts';
const ok = (m: string) => console.log('ok ' + m);

// ---------------------------------------------------------------- unit
{
  assert.equal(BK.colourWords('#9CAF88'), 'sage green'); assert.equal(BK.colourWords('#D8C3A5'), 'warm sand'); assert.equal(BK.colourWords('#2B2B2B'), 'deep charcoal');
  assert.equal(BK.normHex('abc'), '#AABBCC'); assert.equal(BK.normHex('#ff7a1a'), '#FF7A1A'); assert.equal(BK.normHex('orange'), null);
  const kit = { colors: [{ hex: '#9CAF88', name: '', role: 'primary' }, { hex: '#D8C3A5', name: 'Sand', role: 'secondary' }, { hex: '#2B2B2B', name: 'Brand 3', role: 'text' }, { hex: '#FF7A1A', name: 'Orange', role: 'accent' }] as BK.BrandColor[], mood: 'calm,  premium.' };
  const ph = BK.brandPhrase(kit, 'image');
  assert.equal(ph, 'colour palette of sage green, sand and deep charcoal, accents of orange; mood: calm, premium'); ok(`phrase: ${ph}`);
  assert.equal(BK.brandPhrase(kit, 'audio'), 'mood: calm, premium', 'audio: mood words only');
  assert.equal(BK.brandPhrase({ colors: [], mood: '' }, 'image'), '', 'an empty kit adds nothing');
  assert.equal(BK.withBrand('a fox in snow.', ph), `a fox in snow. ${ph}`); assert.equal(BK.withBrand('', ph), '', 'no typed prompt: nothing added');
  assert.equal(BK.withoutBrand(BK.withBrand('a fox, ', ph), ph), 'a fox'); assert.equal(BK.withoutBrand('a fox', ph), 'a fox');
  const long = BK.moodWords('warm, ' + 'very '.repeat(80) + 'long'); assert.ok(long.length <= 120 && !/\s$/.test(long), 'a very long mood is cut at a word');
  assert.equal(BK.moodWords('a\nb;c'), 'a, b, c', 'one line');
  assert.equal(BK.brandMediaFor('create-image'), 'image'); assert.equal(BK.brandMediaFor('h3-video'), 'video'); assert.equal(BK.brandMediaFor('audio', 'music'), 'audio');
  assert.equal(BK.brandMediaFor('audio', 'voice'), null, 'a voiceover script is never changed'); assert.equal(BK.brandMediaFor('voice'), null); assert.equal(BK.brandMediaFor('image-upscale'), null);
  ok('phrase helper, media rules');

  // tokens: W3C DTCG structure
  const tk = BK.tokensOf(BK.BUILTIN_KIT); assert.deepEqual(BK.checkTokens(tk), []);
  assert.equal(tk.color.$type, 'color'); assert.equal(tk.color.primary.$value, '#FF7A1A'); assert.deepEqual(tk.font.heading.$value, ['Space Grotesk', 'sans-serif']); assert.equal(tk.font.$type, 'fontFamily');
  assert.equal(tk.spacing.$type, 'dimension'); assert.equal(tk.spacing.md.$value, '16px'); assert.equal(tk.radius.$type, 'dimension');
  for (const g of ['color', 'font', 'spacing', 'radius']) for (const [k, v] of Object.entries(tk[g])) if (!k.startsWith('$')) assert.ok('$value' in (v as any), `${g}.${k} has $value`);
  assert.deepEqual(BK.checkTokens({ color: { $type: 'color', a: { $value: 'red' } } }), ['color.a: colour is not #RRGGBB']); assert.ok(BK.checkTokens({ x: { $value: 1 } }).length, 'no $type is an error');
  const dup = BK.colorKeys([{ hex: '#000000', name: 'Ink', role: '' }, { hex: '#111111', name: 'Ink', role: '' }, { hex: '#222222', name: '', role: '' }]); assert.deepEqual(dup, ['ink', 'ink-2', 'colour-3']);
  assert.match(BK.cssVarsOf(BK.BUILTIN_KIT), /--brand-primary: #FF7A1A;/); assert.match(BK.cssVarsOf(BK.BUILTIN_KIT), /--brand-font-heading: 'Space Grotesk', sans-serif;/);
  assert.match(BK.tailwindOf(BK.BUILTIN_KIT), /"primary": "#FF7A1A"/); assert.match(BK.hexListOf(BK.BUILTIN_KIT), /^#FF7A1A  Orange \(primary\)$/m);
  ok('tokens file (W3C DTCG), CSS, Tailwind, hex list');

  // words → palette: 5 roles, dark words give a dark background
  const pw = BK.paletteFromWords('calm, nature'); assert.deepEqual(pw.map((c) => c.role), ['primary', 'secondary', 'accent', 'background', 'text']); assert.ok(BK.luminance(pw[3].hex) > 0.8);
  assert.ok(BK.luminance(BK.paletteFromWords('dark, moody, cinematic')[3].hex) < 0.02); assert.equal(BK.paletteFromWords('').length, 5, 'no words: a default palette');
  ok('palette from words');

  // extraction
  const img = (w: number, h: number, f: (x: number, y: number) => [number, number, number, number]) => { const a = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a.set(f(x, y), (y * w + x) * 4); return a; };
  const onWhite = BK.extractColors(img(60, 60, (x, y) => (x < 20 && y < 30 ? [220, 40, 40, 255] : x > 40 && y > 30 ? [30, 80, 200, 255] : [255, 255, 255, 255])));
  assert.equal(onWhite.length, 2, `a JPG-style white background is left out (${JSON.stringify(onWhite)})`); assert.ok(onWhite.every((c) => !BK.isNeutralExtreme(c.hex)));
  const seeThrough = BK.extractColors(img(40, 40, (x) => (x < 10 ? [255, 122, 26, 255] : [0, 0, 0, 0])));
  assert.equal(seeThrough.length, 1); assert.equal(seeThrough[0].hex, '#FF7A1A', 'a transparent PNG: only the visible pixels count');
  const oneWhite = BK.extractColors(img(20, 20, (x) => (x < 10 ? [255, 255, 255, 255] : [0, 0, 0, 0]))); assert.deepEqual(oneWhite.map((c) => c.hex), ['#FFFFFF'], 'a 1-colour white logo still gives its colour');
  const tiny = BK.extractColors(img(2, 2, () => [12, 140, 90, 255])); assert.equal(tiny[0].hex, '#0C8C5A', 'a tiny logo');
  assert.deepEqual(BK.extractColors(img(4, 4, () => [0, 0, 0, 0])), [], 'fully transparent: none');
  const many = BK.extractColors(img(64, 64, (x, y) => [((x >> 4) * 70) % 256, ((y >> 4) * 60) % 256, 160, 255])); assert.ok(many.length <= 6 && many.length >= 4, `at most 6 (${many.length})`);
  ok('colour extraction');

  // validation
  const v1 = BK.validateKitInput({ name: '' }, false); assert.equal(v1.ok, false);
  const v2 = BK.validateKitInput({ name: 'x', colors: [{ hex: '#12', role: 'primary' }] }, false); assert.ok(!v2.ok && v2.issues[0].field === 'colors[0].hex');
  const v3 = BK.validateKitInput({ colors: [{ hex: '#111111', role: 'primary' }, { hex: '#222222', role: 'primary' }] }, true); assert.ok(!v3.ok && v3.issues[0].code === 'duplicate');
  const v4 = BK.validateKitInput({ mood: 'x'.repeat(301) }, true); assert.ok(!v4.ok && v4.issues[0].code === 'too_long');
  const v5 = BK.validateKitInput({ examples: ['https://evil.example/a.png'] }, true); assert.ok(!v5.ok);
  const v6 = BK.validateKitInput({ fonts: { heading: '<script>', body: 'Inter' } }, true); assert.ok(!v6.ok);
  ok('validation');
}

// ---------------------------------------------------------------- e2e
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9341); const B = `http://localhost:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brandkit-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_ENV_FILE: path.join(os.tmpdir(), 'brandkit-none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_SKIP_MCP: '1', COMFY_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '' }, stdio: 'ignore', detached: true });
const req = async (method: string, u: string, body?: unknown) => { const r = await fetch(B + u, { method, ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) }); return { status: r.status, body: await r.json().catch(() => null) as any }; };
const upload = async (u: string, bytes: Buffer, name: string, type: string) => { const fd = new FormData(); fd.append('file', new Blob([new Uint8Array(bytes)], { type }), name); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const job = async (tool: string, f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
try {
  for (let i = 0; i < 300; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }

  // list: the built-in kit first, active by default
  let l = (await req('GET', '/api/brand-kits')).body; assert.equal(l.items[0].id, BK.BUILTIN_KIT_ID); assert.equal(l.activeId, BK.BUILTIN_KIT_ID); assert.ok(l.fonts.some((f: any) => f.name === 'Manrope'));
  assert.equal((await req('PATCH', `/api/brand-kits/${BK.BUILTIN_KIT_ID}`, { name: 'x' })).status, 400, 'built-in is read-only');
  assert.equal((await req('DELETE', `/api/brand-kits/${BK.BUILTIN_KIT_ID}`)).status, 400);
  ok('built-in kit first, read-only');

  // create + validation
  assert.equal((await req('POST', '/api/brand-kits', {})).status, 400);
  assert.equal((await req('POST', '/api/brand-kits', { name: 'Imagination' })).status, 409, 'duplicate name');
  assert.equal((await req('POST', '/api/brand-kits', { name: 'X', colors: 'red' })).status, 400);
  const c = await req('POST', '/api/brand-kits', { name: 'Sage Studio', colors: [{ hex: '9caf88', role: 'primary' }, { hex: '#D8C3A5', name: 'Warm sand', role: 'secondary' }, { hex: '#2b2b2b', role: 'text' }, { hex: '#FF7A1A', name: 'Orange', role: 'accent' }], fonts: { heading: 'Fraunces', body: 'Inter' }, mood: 'calm, premium', dos: ['Soft light'], donts: ['Neon'] });
  assert.equal(c.status, 201, JSON.stringify(c.body)); const kid = c.body.id; assert.equal(c.body.colors[0].hex, '#9CAF88', 'hex normalised');
  assert.equal(c.body.phrases.image, 'colour palette of sage green, warm sand and deep charcoal, accents of orange; mood: calm, premium');
  const empty = (await req('POST', '/api/brand-kits', { name: 'Empty' })).body.id;
  const dupe = await req('POST', '/api/brand-kits', { from: BK.BUILTIN_KIT_ID }); assert.equal(dupe.status, 201); assert.equal(dupe.body.name, 'Imagination copy'); assert.equal(dupe.body.colors.length, 5);
  ok('create, duplicate, validation');

  // patch, active, rename active, delete active
  assert.equal((await req('PATCH', `/api/brand-kits/${kid}`, { mood: 'x'.repeat(400) })).status, 400);
  assert.equal((await req('PATCH', `/api/brand-kits/${kid}`, { name: 'Imagination copy' })).status, 409);
  assert.equal((await req('PUT', '/api/brand-kits/active', { id: dupe.body.id })).body.activeId, dupe.body.id);
  assert.equal((await req('PATCH', `/api/brand-kits/${dupe.body.id}`, { name: 'Renamed' })).body.name, 'Renamed'); assert.equal((await req('GET', '/api/brand-kits')).body.activeId, dupe.body.id, 'renaming keeps it active');
  const del = await req('DELETE', `/api/brand-kits/${dupe.body.id}`); assert.equal(del.body.activeId, BK.BUILTIN_KIT_ID, 'deleting the active kit makes the built-in one active');
  assert.equal((await req('PUT', '/api/brand-kits/active', { id: 'nope' })).status, 404);
  ok('patch, active, rename, delete active');

  // several brand profiles (the Brands page grid, the bar chip's quick switch): built-in first, then in the order made; switching is one PUT each
  { const made: string[] = []; for (const name of ['Brand A', 'Brand B', 'Brand C']) { const r = await req('POST', '/api/brand-kits', { name, mood: name.toLowerCase() }); assert.equal(r.status, 201); made.push(r.body.id); }
    const ids = (await req('GET', '/api/brand-kits')).body.items.map((k: any) => k.id); assert.equal(ids[0], BK.BUILTIN_KIT_ID); assert.deepEqual(ids.slice(-3), made, 'grid order: the built-in brand, then yours in the order made');
    for (const id of [made[2], made[0], BK.BUILTIN_KIT_ID]) assert.equal((await req('PUT', '/api/brand-kits/active', { id })).body.activeId, id);
    for (const id of made) assert.equal((await req('DELETE', `/api/brand-kits/${id}`)).status, 200);
    ok('several brands: grid order and quick switching'); }

  // logo: PNG, SVG kept and served as an image, SVG with script refused, GIF kept, fake GIF and wrong type refused
  const png = fs.readFileSync(path.join(ROOT, 'samples/sample-product.png'));
  const lg = await upload(`/api/brand-kits/${kid}/logo`, png, 'logo.png', 'image/png'); assert.equal(lg.status, 200, JSON.stringify(lg.body)); assert.match(lg.body.logo.url, /^\/files\/brand-/);
  assert.equal((await fetch(B + lg.body.logo.url)).status, 200);
  const svg = await upload(`/api/brand-kits/${kid}/logo`, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#FF7A1A"/></svg>'), 'logo.svg', 'image/svg+xml');
  assert.equal(svg.status, 200); assert.equal(svg.body.logo.mime, 'image/svg+xml'); assert.ok(!fs.existsSync(path.join(DATA, lg.body.logo.url.slice(7))), 'the old logo file is removed');
  assert.equal((await upload(`/api/brand-kits/${kid}/logo`, Buffer.from('<svg><script>alert(1)</script></svg>'), 'x.svg', 'image/svg+xml')).status, 400, 'an SVG with script');
  assert.match((await fetch(B + svg.body.logo.url)).headers.get('content-type') ?? '', /^image\/svg\+xml/, 'an SVG logo is served as an image, so it shows');
  const gif = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'); // 1×1 GIF
  const gl = await upload(`/api/brand-kits/${kid}/logo`, gif, 'logo.gif', 'image/gif'); assert.equal(gl.status, 200, JSON.stringify(gl.body)); assert.equal(gl.body.logo.mime, 'image/gif');
  assert.equal((await upload(`/api/brand-kits/${kid}/logo`, Buffer.from('not a gif at all'), 'x.gif', 'image/gif')).status, 400, 'a fake GIF');
  const sv2 = await upload(`/api/brand-kits/${kid}/logo`, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'), 'logo.svg', 'image/svg+xml'); assert.equal(sv2.status, 200);
  assert.equal((await upload(`/api/brand-kits/${kid}/logo`, Buffer.from('hello'), 'x.txt', 'text/plain')).status, 400);
  ok('logo upload');

  // exports
  const t = await fetch(`${B}/api/brand-kits/${kid}/tokens.json`); assert.match(t.headers.get('content-disposition') ?? '', /sage-studio\.tokens\.json/); const tj = await t.json() as any; assert.deepEqual(BK.checkTokens(tj), []);
  assert.deepEqual(tj.font.heading.$value, ['Fraunces', 'serif']);
  assert.match(await (await fetch(`${B}/api/brand-kits/${kid}/export?format=css`)).text(), /--brand-primary: #9CAF88/);
  assert.equal((await fetch(`${B}/api/brand-kits/${kid}/export?format=pdf`)).status, 400);
  const pr = (await req('GET', `/api/brand-kits/${kid}/prompt?media=audio&prompt=lofi`)).body; assert.equal(pr.prompt, 'lofi. mood: calm, premium');
  ok('tokens.json download, CSS, prompt');

  // a submit with the brand: the phrase follows the typed prompt, the kit is on the job; peek = the same words
  const fields = { types: '["generate"]', prompt: 'a ceramic mug on a table', provider: 'comfy-klein4b', seed: '42', brandKit: kid };
  const pk = (await req('POST', '/api/tools/create-image/prompt-peek', { fields, files: {} })).body; assert.equal(pk.brand?.applied, true); assert.match(pk.prompt, /a ceramic mug on a table\. colour palette of sage green/);
  const q0 = (await req('GET', '/api/tools/create-image/price?provider=comfy-klein4b')).status;
  const s1 = await job('create-image', fields); assert.equal(s1.status, 200, JSON.stringify(s1.body));
  const j1 = (await req('GET', `/api/jobs/${s1.body.id}`)).body; assert.equal(j1.input.brand.id, kid); assert.equal(j1.input.finalPrompt, pk.prompt, 'peek = job');
  const s0 = await job('create-image', { ...fields, brandKit: '' }); const j0 = (await req('GET', `/api/jobs/${s0.body.id}`)).body; assert.equal(s0.body.cost, s1.body.cost, 'same price'); assert.equal(j0.provider, j1.provider, 'same model'); assert.ok(!j0.input.brand);
  for (let i = 0; i < 120 && (await req('GET', `/api/jobs/${s1.body.id}`)).body.status !== 'done'; i++) await new Promise((r) => setTimeout(r, 250));
  const rc = (await req('GET', `/api/jobs/${s1.body.id}/prefill?action=recreate`)).body; assert.equal(rc.form.brandKit, kid); assert.equal(rc.form.prompt, 'a ceramic mug on a table', 'Recreate: typed words only');
  void q0; ok(`submit: “${j1.input.finalPrompt}”, recreate keeps the kit`);

  // unknown kit, empty kit, a voiceover, music
  const bad = await job('create-image', { ...fields, brandKit: 'bk_gone' }); assert.equal(bad.status, 400); assert.equal(bad.body.code, 'brand_kit_not_found');
  const se = await job('create-image', { ...fields, brandKit: empty }); const je = (await req('GET', `/api/jobs/${se.body.id}`)).body; assert.equal(je.input.prompt, 'a ceramic mug on a table'); assert.equal(je.input.brand.applied, false);
  const pv = (await req('POST', '/api/tools/audio/prompt-peek', { fields: { types: '["voice"]', prompt: 'Hello there.', brandKit: kid }, files: {} })).body; assert.equal(pv.prompt, 'Hello there.', 'a voiceover script is read as typed');
  const pm = (await req('POST', '/api/tools/audio/prompt-peek', { fields: { types: '["music"]', prompt: 'lofi beat', provider: 'comfy-acestep', brandKit: kid }, files: {} })).body; assert.match(pm.prompt, /^lofi beat\. mood: calm, premium/);
  ok('unknown kit 400, empty kit adds nothing, voiceover untouched, music gets the mood');

  // deleting a kit removes its own files
  const logoFile = path.join(DATA, sv2.body.logo.url.slice(7)); assert.ok(fs.existsSync(logoFile)); await req('DELETE', `/api/brand-kits/${kid}`); assert.ok(!fs.existsSync(logoFile));
  ok('delete removes the logo');
  console.log('PASS brand-kit');
} finally { try { process.kill(-srv.pid!); } catch { /* gone */ } }
