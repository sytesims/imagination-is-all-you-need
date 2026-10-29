// E2E (own mock server): local profile, avatar upload, creator-page stats. Run: npx tsx test/profile.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const PORT = testPort(8893), B = `http://localhost:${PORT}`, D = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', COMFY_API_KEY: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await fetch(B + u)).json();
const put = async (body: unknown) => { const r = await fetch(`${B}/api/me/profile`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const up = async (buf: Buffer, name: string) => { const fd = new FormData(); fd.append('file', new Blob([buf]), name); const r = await fetch(`${B}/api/me/avatar`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() }; };
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
  // defaults: nothing set, member-since stamped
  const p0 = await get('/api/me/profile'); assert.equal(p0.displayName, null); assert.equal(p0.avatar, null); assert.equal(p0.avatarUrl, null); assert.ok(p0.createdAt > 0);
  // an older install's saved https URL keeps working
  assert.equal((await put({ avatarUrl: 'https://example.com/me.png' })).body.avatarUrl, 'https://example.com/me.png');
  // name, handle, bean, cover
  const ok = await put({ displayName: '  Ada  ', handle: '@Ada.Makes', avatar: { mood: 'happy', tint: 'mint' }, cover: { kind: 'gradient', id: 'dusk' } });
  assert.equal(ok.status, 200); assert.equal(ok.body.displayName, 'Ada'); assert.equal(ok.body.handle, 'ada.makes'); assert.deepEqual(ok.body.avatar, { mood: 'happy', tint: 'mint' }); assert.deepEqual(ok.body.cover, { kind: 'gradient', id: 'dusk' });
  for (const [b, f] of [[{ handle: 'a b' }, 'handle'], [{ avatar: { mood: 'angry', tint: 'orange' } }, 'avatar'], [{ cover: { kind: 'image', url: 'https://x/y.png' } }, 'cover'], [{ displayName: 'x'.repeat(61) }, 'displayName'], [{ avatarUrl: 'javascript:alert(1)' }, 'avatarUrl']] as const) {
    const r = await put(b); assert.equal(r.status, 400, JSON.stringify(b)); assert.equal(r.body.issues[0].field, f); }
  // upload: wrong type, too big, then a real PNG (sniffed, not trusted by name)
  assert.equal((await up(Buffer.from('not a picture at all'), 'me.png')).body.code, 'unsupported');
  { const big = await up(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0]), Buffer.alloc(2.5 * 1024 * 1024)]), 'big.png'); assert.equal(big.body.code, 'file_too_large', JSON.stringify(big)); }
  const png = path.join(D, 'src.png'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=orange:s=256x256', '-frames:v', '1', png]);
  const a1 = await up(fs.readFileSync(png), 'whatever.bin'); assert.equal(a1.status, 200, JSON.stringify(a1.body)); assert.match(a1.body.avatarUrl, /^\/files\/avatar-[\w-]+\.png$/);
  assert.equal((await fetch(B + a1.body.avatarUrl)).status, 200);
  // replacing it deletes the old file; DELETE brings the bean back and keeps the bean choice
  const a2 = await up(fs.readFileSync(png), 'again.png'); assert.notEqual(a2.body.avatarUrl, a1.body.avatarUrl); assert.ok(!fs.existsSync(path.join(D, path.basename(a1.body.avatarUrl))));
  const del = await (await fetch(`${B}/api/me/avatar`, { method: 'DELETE' })).json(); assert.equal(del.avatarUrl, null); assert.deepEqual(del.avatar, { mood: 'happy', tint: 'mint' }); assert.ok(!fs.existsSync(path.join(D, path.basename(a2.body.avatarUrl))));
  // stats on an empty library
  const s = await get('/api/me/stats'); assert.equal(s.generations, 0); assert.equal(s.finished, 0); assert.equal(s.favouriteModel, null); assert.equal(s.savedUsd, 0); assert.ok(s.memberSince > 0);
  console.log('ok profile: fields, validation, avatar upload/replace/delete, stats');
} finally { try { process.kill(-srv.pid!); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
