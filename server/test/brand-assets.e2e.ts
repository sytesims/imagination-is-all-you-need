// Brand assets (2026-10-31): the logo set and the font files. Unit: font sniffing (TTF / OTF / WOFF / WOFF2 by content), the family name in a
// TTF name table, file-name families, an old single `logo` read as logos.main, the slot fallback (a missing slot uses main) and the tokens file
// naming the files. E2E (own mock server, temp data dir, a fake Google Fonts catalogue on localhost, so no network): logo slots (upload, served,
// replace, delete, fallback), an old kit saved with only `logo` keeps working after a restart, font upload (good OTF / WOFF2, a renamed PNG and
// an oversize file refused, the role takes the family name), a Google font downloaded once (licence and source recorded, shared by both roles),
// offline and unknown fonts say so plainly, deleting a font and a kit removes the files, and the library export carries every logo and font file.
// Run: npx tsx test/brand-assets.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { execFileSync, spawn } from 'node:child_process'; import fs from 'node:fs'; import http from 'node:http'; import os from 'node:os'; import path from 'node:path';
import Database from 'better-sqlite3';
import * as BK from '../src/shared/brandKit.ts';
import { sfntFamily, sniffFont } from '../src/brandFonts.ts';
const ok = (m: string) => console.log('ok ' + m);

/** A tiny but well-formed sfnt: one `name` table with the family as a Windows UTF-16BE record (id 1). */
function sfnt(tag: number | string, family: string): Buffer {
  const str = Buffer.from(family, 'utf16le').swap16(); const name = Buffer.alloc(6 + 12 + str.length);
  name.writeUInt16BE(0, 0); name.writeUInt16BE(1, 2); name.writeUInt16BE(18, 4); name.writeUInt16BE(3, 6); name.writeUInt16BE(1, 8); name.writeUInt16BE(0x409, 10); name.writeUInt16BE(1, 12); name.writeUInt16BE(str.length, 14); name.writeUInt16BE(0, 16); str.copy(name, 18);
  const head = Buffer.alloc(12 + 16); if (typeof tag === 'string') head.write(tag, 0, 'latin1'); else head.writeUInt32BE(tag, 0); head.writeUInt16BE(1, 4);
  head.write('name', 12, 'latin1'); head.writeUInt32BE(28, 20); head.writeUInt32BE(name.length, 24); return Buffer.concat([head, name]);
}
const woff2 = (n = 64) => { const b = Buffer.alloc(n); b.write('wOF2', 0, 'latin1'); b.writeUInt32BE(n, 8); b.writeUInt16BE(1, 12); return b; };
const png = fs.readFileSync(path.resolve(import.meta.dirname, '../samples/sample-product.png'));

// ---------------------------------------------------------------- unit
{
  const otf = sfnt('OTTO', 'Lumen Serif'); const ttf = sfnt(0x00010000, 'Lumen Sans');
  assert.equal(sniffFont(otf, '.otf'), 'opentype'); assert.equal(sniffFont(ttf, '.ttf'), 'truetype'); assert.equal(sniffFont(otf, '.ttf'), 'opentype', 'a CFF font named .ttf is still a font');
  assert.equal(sniffFont(woff2(), '.woff2'), 'woff2'); assert.equal(sniffFont(woff2(), '.woff'), null, 'WOFF2 bytes named .woff');
  assert.equal(sniffFont(png, '.ttf'), null, 'a PNG renamed .ttf'); assert.equal(sniffFont(Buffer.from('hello world, not a font'), '.otf'), null);
  const cut = Buffer.from(woff2(64).subarray(0, 50)); assert.equal(sniffFont(cut, '.woff2'), null, 'a cut-off WOFF2 (length mismatch)');
  assert.equal(sniffFont(otf.subarray(0, 30), '.otf'), null, 'a table that runs past the end'); assert.equal(sniffFont(otf, '.exe'), null);
  assert.equal(sfntFamily(otf), 'Lumen Serif'); assert.equal(sfntFamily(Buffer.alloc(40)), '');
  assert.equal(BK.familyOfFileName('BigCaslon-Bold.ttf'), 'Big Caslon'); assert.equal(BK.familyOfFileName('work_sans_regular.woff2'), 'work sans'); assert.equal(BK.familyOfFileName('<x>.otf'), 'x');
  assert.ok(BK.fontNameOk('Big Caslon') && !BK.fontNameOk('a<b') && !BK.fontNameOk(''));
  ok('font sniffing, family names');

  const old = { id: 'bk_old', name: 'Old', colors: [], fonts: { heading: '', body: '' }, mood: '', dos: [], donts: [], logo: { url: '/files/brand-bk_old-logo-1.png', mime: 'image/png' }, examples: [], createdAt: '', updatedAt: '' } as unknown as BK.BrandKit;
  const n = BK.normalizeKit(old); assert.deepEqual(n.logos.main, old.logo); assert.equal(n.logos.light, null); assert.deepEqual(n.fontFiles, []); assert.equal(n.logo, n.logos.main);
  assert.equal(BK.logoFor(n, 'dark')?.url, old.logo!.url, 'a missing slot falls back to main');
  const set = BK.normalizeKit({ ...old, logos: { main: null, light: { url: '/files/l.png', mime: 'image/png' }, dark: { url: '/files/d.png', mime: 'image/png' }, icon: null } } as any);
  assert.equal(set.logo, null); assert.equal(BK.logoForBackground(set, 0.1)?.url, '/files/l.png', 'dark picture: the light logo'); assert.equal(BK.logoForBackground(set, 0.9)?.url, '/files/d.png');
  assert.equal(BK.logoFor(set, 'main')?.url, '/files/d.png', 'no main: any logo beats none');
  const tk = BK.tokensOf({ ...n, fontFiles: [{ family: 'Lumen Serif', role: 'heading', weight: 0, url: '/files/brand-fonts/bk_old/a.otf', file: 'a.otf', format: 'opentype', source: 'upload', licence: 'x' }] });
  const ext = tk.$extensions['app.imagination.brand-kit']; assert.equal(ext.logos.main, old.logo!.url); assert.equal(ext.fontFiles[0].file, '/files/brand-fonts/bk_old/a.otf'); assert.deepEqual(BK.checkTokens(tk), []);
  assert.ok(!BK.validateKitInput({ logos: {} }, true).ok && !BK.validateKitInput({ fontFiles: [] }, true).ok, 'logos and font files only through their routes');
  ok('logo set: migration, fallback, tokens name the files');
}

// ---------------------------------------------------------------- e2e
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9345); const API_PORT = testPort(9346); const B = `http://localhost:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brandassets-'));
/* the fake catalogue: "Lumen Grotesk" (google, 400 and 700), "Not Google" (another source); anything else is a 404 */
let downloads = 0;
const api = http.createServer((req, res) => {
  const u = req.url ?? ''; const host = `http://127.0.0.1:${API_PORT}`;
  if (u === '/fonts/lumen-grotesk') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ id: 'lumen-grotesk', family: 'Lumen Grotesk', type: 'google', license: 'OFL-1.1', defSubset: 'latin',
    variants: Object.fromEntries([300, 400, 700].map((w) => [w, { normal: { latin: { url: { woff2: `${host}/files/lg-${w}.woff2` } } } }])) })); return; }
  if (u === '/fonts/not-google') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ id: 'not-google', family: 'Not Google', type: 'other', variants: {} })); return; }
  if (/^\/files\/lg-\d+\.woff2$/.test(u)) { downloads++; res.setHeader('content-type', 'font/woff2'); res.end(woff2(80)); return; }
  res.statusCode = 404; res.end('{}');
});
await new Promise<void>((r) => api.listen(API_PORT, '127.0.0.1', () => r()));
const env = { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_ENV_FILE: path.join(os.tmpdir(), 'brandassets-none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_SKIP_MCP: '1', COMFY_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '',
  COMFY_BASE_URL: 'http://127.0.0.1:9', OPENHIGGSFIELD_COMFY_DETECT_URLS: 'http://127.0.0.1:9', OPENHIGGSFIELD_FONTS_API: `http://127.0.0.1:${API_PORT}/fonts` };
let srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env, stdio: 'ignore', detached: true });
const up = async () => { for (let i = 0; i < 300; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error('server did not start'); };
const stop = async () => { try { process.kill(-srv.pid!); } catch { /* gone */ } for (let i = 0; i < 40; i++) { try { await fetch(`${B}/api/health`); } catch { return; } await new Promise((r) => setTimeout(r, 250)); } };
const req = async (method: string, u: string, body?: unknown) => { const r = await fetch(B + u, { method, ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) }); return { status: r.status, body: await r.json().catch(() => null) as any }; };
const upload = async (u: string, bytes: Buffer, name: string, type = 'application/octet-stream') => { const fd = new FormData(); fd.append('file', new Blob([new Uint8Array(bytes)], { type }), name); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const onDisk = (url: string) => fs.existsSync(path.join(DATA, url.slice('/files/'.length)));
try {
  await up();
  const kid = (await req('POST', '/api/brand-kits', { name: 'Lumen', colors: [{ hex: '#F3E9DC', role: 'background' }] })).body.id;
  let k = (await req('GET', `/api/brand-kits/${kid}`)).body; assert.deepEqual(k.logos, { main: null, light: null, dark: null, icon: null }); assert.deepEqual(k.fontFiles, []);

  // logo slots
  const main = await upload(`/api/brand-kits/${kid}/logo`, png, 'main.png', 'image/png'); assert.equal(main.status, 200, JSON.stringify(main.body)); assert.equal(main.body.logo.url, main.body.logos.main.url, 'logo mirrors logos.main');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#fff"/></svg>');
  const light = await upload(`/api/brand-kits/${kid}/logo?slot=light`, svg, 'light.svg', 'image/svg+xml'); assert.equal(light.status, 200, JSON.stringify(light.body)); assert.match(light.body.logos.light.url, /^\/files\/brand-.*-logo-light-/);
  assert.equal(light.body.logos.main.url, main.body.logo.url, 'other slots stay');
  const gif = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
  const icon = await upload(`/api/brand-kits/${kid}/logo?slot=icon`, gif, 'icon.gif', 'image/gif'); assert.equal(icon.status, 200); assert.equal(icon.body.logos.icon.mime, 'image/gif');
  assert.equal((await upload(`/api/brand-kits/${kid}/logo?slot=side`, png, 'x.png', 'image/png')).status, 400, 'unknown slot');
  assert.equal((await upload(`/api/brand-kits/${BK.BUILTIN_KIT_ID}/logo?slot=dark`, png, 'x.png', 'image/png')).status, 400, 'the built-in kit is read-only');
  assert.equal((await fetch(B + light.body.logos.light.url)).status, 200);
  const light2 = await upload(`/api/brand-kits/${kid}/logo?slot=light`, png, 'light.png', 'image/png'); assert.ok(!onDisk(light.body.logos.light.url), 'replacing a slot removes its old file');
  const noLight = await req('DELETE', `/api/brand-kits/${kid}/logo?slot=light`); assert.equal(noLight.body.logos.light, null); assert.ok(!onDisk(light2.body.logos.light.url));
  assert.equal(BK.logoFor(noLight.body, 'light')?.url, main.body.logo.url, 'an empty slot uses main');
  ok('logo slots: upload (PNG, SVG, GIF), replace, delete, fallback');

  // fonts: upload
  const otf = sfnt('OTTO', 'Lumen Serif');
  const f1 = await upload(`/api/brand-kits/${kid}/font?role=heading`, otf, 'lumen-serif.otf'); assert.equal(f1.status, 200, JSON.stringify(f1.body));
  assert.equal(f1.body.fonts.heading, 'Lumen Serif', 'the family comes from the font itself'); const ff = f1.body.fontFiles[0];
  assert.equal(ff.source, 'upload'); assert.equal(ff.format, 'opentype'); assert.equal(ff.role, 'heading'); assert.match(ff.url, new RegExp(`^/files/brand-fonts/${kid}/`)); assert.match(ff.licence, /licence/);
  const served = await fetch(B + ff.url); assert.equal(served.status, 200); assert.equal(served.headers.get('content-disposition'), null, 'served as a font, not a download');
  assert.equal((await upload(`/api/brand-kits/${kid}/font?role=heading`, png, 'renamed.ttf')).status, 400, 'a PNG renamed .ttf');
  assert.equal((await upload(`/api/brand-kits/${kid}/font?role=heading`, Buffer.from('just text, not a font at all'), 'x.woff2')).status, 400);
  const big = Buffer.concat([otf, Buffer.alloc(BK.BRAND_LIMITS.fontMB * 1024 * 1024)]); big.writeUInt32BE(big.length - 28, 24); // a valid table directory, just too big
  const tooBig = await upload(`/api/brand-kits/${kid}/font?role=heading`, big, 'huge.otf'); assert.equal(tooBig.status, 400); assert.equal(tooBig.body.code, 'file_too_large');
  assert.equal((await upload(`/api/brand-kits/${kid}/font?role=title`, otf, 'a.otf')).status, 400, 'unknown role');
  const named = await upload(`/api/brand-kits/${kid}/font?role=body&family=${encodeURIComponent('My Body')}`, woff2(), 'body.woff2'); assert.equal(named.body.fonts.body, 'My Body'); assert.equal(named.body.fontFiles.length, 2);
  ok('font upload: OTF and WOFF2 by content, renamed and oversize refused');

  // fonts: Google, once
  const g = await req('POST', `/api/brand-kits/${kid}/font/google`, { family: 'lumen grotesk', role: 'body' }); assert.equal(g.status, 200, JSON.stringify(g.body));
  const gf = g.body.fontFiles.filter((f: any) => f.role === 'body'); assert.deepEqual(gf.map((f: any) => f.weight), [400, 700]); assert.equal(g.body.fonts.body, 'Lumen Grotesk', 'the real family name');
  assert.equal(gf[0].licence, 'OFL-1.1'); assert.equal(gf[0].source, 'google'); assert.match(gf[0].sourceUrl, /fonts\.google\.com\/specimen\/Lumen\+Grotesk/); assert.equal(downloads, 2);
  assert.ok(!onDisk(named.body.fontFiles.find((f: any) => f.role === 'body').url), 'the replaced body font file is gone');
  const g2 = await req('POST', `/api/brand-kits/${kid}/font/google`, { family: 'Lumen Grotesk', role: 'heading' }); assert.equal(g2.status, 200); assert.equal(downloads, 2, 'already here: no second download');
  assert.equal(g2.body.fontFiles.length, 4); assert.ok(!onDisk(ff.url), 'the replaced heading file is gone');
  assert.equal((await req('POST', `/api/brand-kits/${kid}/font/google`, { family: 'Nope Sans', role: 'body' })).status, 404);
  assert.equal((await req('POST', `/api/brand-kits/${kid}/font/google`, { family: 'Not Google', role: 'body' })).status, 404, 'only Google Fonts');
  assert.equal((await req('POST', `/api/brand-kits/${kid}/font/google`, { family: '<b>', role: 'body' })).status, 400);
  ok('Google font: downloaded once, licence and source kept, shared by both roles');

  // a font picked from the list (or removed) takes that role's files away; delete a role
  const p1 = await req('PATCH', `/api/brand-kits/${kid}`, { fonts: { heading: 'Manrope', body: 'Lumen Grotesk' } }); assert.equal(p1.body.fontFiles.length, 2); assert.ok(p1.body.fontFiles.every((f: any) => f.role === 'body'));
  assert.ok(p1.body.fontFiles.every((f: any) => onDisk(f.url)), 'files the body still uses stay');
  const d1 = await req('DELETE', `/api/brand-kits/${kid}/font?role=body`); assert.equal(d1.body.fonts.body, ''); assert.deepEqual(d1.body.fontFiles, []); assert.ok(p1.body.fontFiles.every((f: any) => !onDisk(f.url)));
  ok('font delete');

  // offline
  await stop(); api.close(); srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...env, OPENHIGGSFIELD_FONTS_API: 'http://127.0.0.1:9/fonts' }, stdio: 'ignore', detached: true }); await up();
  const off = await req('POST', `/api/brand-kits/${kid}/font/google`, { family: 'Fraunces', role: 'heading' }); assert.equal(off.status, 502); assert.equal(off.body.code, 'offline'); assert.match(off.body.error, /internet connection/);
  ok('offline: says so plainly');

  // the library export carries every logo and font file
  const f2 = await upload(`/api/brand-kits/${kid}/font?role=heading`, otf, 'serif.otf'); const dark = await upload(`/api/brand-kits/${kid}/logo?slot=dark`, png, 'dark.png', 'image/png');
  const tar = path.join(DATA, 'x.tar.gz'); fs.writeFileSync(tar, Buffer.from(await (await fetch(`${B}/api/export`)).arrayBuffer()));
  const list = execFileSync('tar', ['-tzf', tar]).toString().split('\n'); fs.rmSync(tar);
  for (const u of [dark.body.logos.main.url, dark.body.logos.dark.url, dark.body.logos.icon.url, f2.body.fontFiles[0].url]) assert.ok(list.includes(u.slice('/files/'.length)), `export has ${u}`);
  ok('library export keeps logos and font files');

  // an old kit saved with only `logo` (before the logo set) keeps working
  await stop(); const db = new Database(path.join(DATA, 'openhiggsfield.db'));
  const row = db.prepare('SELECT data FROM kv WHERE id = ?').get('brandKits') as { data: string }; const kits = JSON.parse(row.data);
  kits.push({ id: 'bk_legacy', name: 'Legacy', colors: [], fonts: { heading: 'Inter', body: '' }, mood: '', dos: [], donts: [], logo: dark.body.logos.main, examples: [], createdAt: '2026-10-27T00:00:00.000Z', updatedAt: '2026-10-27T00:00:00.000Z' });
  db.prepare('UPDATE kv SET data = ? WHERE id = ?').run(JSON.stringify(kits), 'brandKits'); db.close();
  srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env, stdio: 'ignore', detached: true }); await up();
  const lg = (await req('GET', '/api/brand-kits/bk_legacy')).body; assert.equal(lg.logos.main.url, dark.body.logos.main.url, 'old logo read as main'); assert.deepEqual(lg.fontFiles, []);
  const kept = (await req('GET', `/api/brand-kits/${kid}`)).body; assert.equal(kept.logos.dark.url, dark.body.logos.dark.url, 'a restart keeps the logo set'); assert.equal(kept.fontFiles.length, 1);
  const lg2 = await upload('/api/brand-kits/bk_legacy/logo?slot=light', png, 'l.png', 'image/png'); assert.equal(lg2.body.logos.main.url, dark.body.logos.main.url); assert.ok(lg2.body.logos.light);
  ok('old single-logo kits: read as main, then gain slots');

  // duplicate shares the files; deleting a kit removes only files nobody else uses
  const dup = (await req('POST', '/api/brand-kits', { from: kid, name: 'Lumen copy' })).body; assert.equal(dup.logos.dark.url, kept.logos.dark.url); assert.equal(dup.fontFiles[0].url, kept.fontFiles[0].url);
  await req('DELETE', `/api/brand-kits/${kid}`); assert.ok(onDisk(kept.fontFiles[0].url) && onDisk(kept.logos.dark.url), 'the copy still uses them');
  await req('DELETE', `/api/brand-kits/${dup.id}`); assert.ok(!onDisk(kept.fontFiles[0].url) && !onDisk(kept.logos.dark.url) && !onDisk(kept.logos.icon.url));
  assert.ok(!fs.existsSync(path.join(DATA, 'brand-fonts', kid)), 'the empty font folder goes');
  ok('duplicate shares files; delete removes the unused ones');
  console.log('PASS brand-assets');
} finally { await stop(); api.close(); }
