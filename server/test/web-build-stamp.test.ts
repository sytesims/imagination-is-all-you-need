// `npm start` builds the web app only when its sources changed (scripts/web-build.mjs): a stand-in app folder in a temp dir, with
// mtimes set by hand, checks missing → changed → up to date, an edit, a deleted file, a shared server file, and that the build's own
// web/dist (which changes web/'s folder time) never counts. No build, no ports.
// Run: npx tsx test/web-build-stamp.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const { webBuildReason: reason } = (await import(path.resolve(import.meta.dirname, '../../scripts/web-build.mjs'))) as { webBuildReason: (repo: string) => '' | 'missing' | 'changed' };
const ok = (m: string) => console.log('ok ' + m);
const R = fs.mkdtempSync(path.join(os.tmpdir(), 'web build stamp '));
const at = (s: number) => new Date(1_700_000_000_000 + s * 1000);
const write = (f: string, s = 'x', t = 0) => { const p = path.join(R, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); fs.utimesSync(p, at(t), at(t)); };
const dirsAt = (t: number) => { for (const d of ['web/src', 'web/src/ui', 'server/src/shared', 'web/public']) fs.utimesSync(path.join(R, d), at(t), at(t)); };
try {
  write('web/index.html'); write('web/src/main.tsx'); write('web/src/ui/Page.tsx'); write('web/public/logo.svg'); write('server/src/shared/feed.ts'); write('package-lock.json'); dirsAt(0);
  assert.equal(reason(R), 'missing'); ok('no web/dist: a first build');
  write('web/dist/index.html', '<html>', 50); // a build from before stamps: rebuild once
  assert.equal(reason(R), 'changed'); ok('a build without a stamp: rebuilt');
  write('web/dist/.build-stamp', `${at(10).getTime()}\n`, 60);
  assert.equal(reason(R), ''); ok('nothing changed since the build started: skipped (web/dist and web/ itself never count)');
  write('web/src/ui/Page.tsx', 'edited', 20);
  assert.equal(reason(R), 'changed'); ok('an edited web file: rebuilt');
  write('web/dist/.build-stamp', `${at(30).getTime()}\n`); assert.equal(reason(R), '');
  write('server/src/shared/feed.ts', 'edited', 40);
  assert.equal(reason(R), 'changed'); ok('an edited shared server file the web imports: rebuilt');
  write('web/dist/.build-stamp', `${at(50).getTime()}\n`); assert.equal(reason(R), '');
  fs.rmSync(path.join(R, 'web/src/ui/Page.tsx')); fs.utimesSync(path.join(R, 'web/src/ui'), at(60), at(60)); // (a delete sets the folder's time)
  assert.equal(reason(R), 'changed'); ok('a deleted file (its folder changed): rebuilt');
  write('web/dist/.build-stamp', `${at(70).getTime()}\n`); write('web/node_modules/.vite/x.json', '{}', 99); write('server/src/routes.ts', 'x', 99);
  assert.equal(reason(R), ''); ok('node_modules and server-only code: no rebuild');
  write('package-lock.json', '{"v":2}', 80);
  assert.equal(reason(R), 'changed'); ok('new dependencies (package-lock.json): rebuilt');
  write('web/dist/.build-stamp', 'garbage'); assert.equal(reason(R), 'changed'); ok('an unreadable stamp: rebuilt');
} finally { fs.rmSync(R, { recursive: true, force: true }); }
