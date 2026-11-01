// /self-host was removed (2026-10-23): every old form of the link lands on Settings → Local models (/settings#gpu),
// the page is gone from the router, and the repo URL lives in one constant.
// Run: npx tsx test/selfhost-redirect.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { selfHostRedirect, GPU_SETTINGS } = await import('../../web/src/shared/legacyRoutes.ts');
const { REPO_URL, repoDoc, TRANSLATE_DOC } = await import('../../web/src/shared/brand.ts');
const ok = (m: string) => console.log('ok ' + m);

assert.equal(GPU_SETTINGS, '/settings#gpu');
for (const p of ['/self-host', '/self-host/', '/Self-Host', '/SELF-HOST//', '/self-host/local-setup', '/self-host/docs/mac'])
  assert.equal(selfHostRedirect(p), '/settings#gpu', `${p} → Settings`);
ok('/self-host, trailing slash, any case and sub-paths → /settings#gpu');

// The query and the old #anchors (#local-setup, #translate, #mac) are dropped: the router passes only the pathname.
for (const [path, q, h] of [['/self-host', '?tab=mac', '#local-setup'], ['/self-host', '', '#translate'], ['/self-host/', '?x=1&y=2', '']]) {
  const u = new URL(path + q + h, 'http://app.test');
  assert.equal(selfHostRedirect(u.pathname), '/settings#gpu', `${path}${q}${h}`);
}
ok('query and hash forms → /settings#gpu (no stale #local-setup)');

for (const p of ['/', '/settings', '/self-hosted', '/selfhost', '/tools/self-host', '/self-host-guide', '/mcp'])
  assert.equal(selfHostRedirect(p), null, `${p} is not redirected`);
ok('look-alike paths are left alone');

// The router checks this redirect before the others, on load (canonPath) and on in-app links (canonTo); the page itself is gone.
const router = readFileSync(new URL('../../web/src/platform/router.tsx', import.meta.url), 'utf8');
assert.equal((router.match(/selfHostRedirect\(/g) ?? []).length, 2, 'router: load + in-app link');
assert.ok(!/'\/self-host'\s*:/.test(router) && !/SelfHost/.test(router), 'router: no /self-host page');
const chunks = readFileSync(new URL('../../web/src/platform/routeChunks.ts', import.meta.url), 'utf8');
assert.ok(!/self-host|SelfHost/.test(chunks), 'routeChunks: no /self-host chunk');
const pages = readFileSync(new URL('../../web/src/ui/pages/Pages.tsx', import.meta.url), 'utf8');
assert.ok(!/function SelfHost|LocalSetup/.test(pages), 'Pages: SelfHost removed');
ok('router, chunks and Pages no longer have the page');

// Settings: #gpu (and the old #local-setup anchor) open the section
const settings = readFileSync(new URL('../../web/src/platform/Settings.tsx', import.meta.url), 'utf8');
assert.ok(/\['gpu', 'Your computer'\]/.test(settings) && /h === 'gpu' \|\| h === 'local' \|\| h === 'local-setup'/.test(settings) && /<GpuModels \/>/.test(settings));
ok('Settings has the Your computer section (#gpu, #local, #local-setup, ?section=gpu)');

// No in-app link points at /self-host any more (the server's /api/health/self-host check stays)
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../../web/src/', import.meta.url).pathname; const hits: string[] = [];
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f) && !p.endsWith('legacyRoutes.ts')) { const t = readFileSync(p, 'utf8'); for (const m of t.matchAll(/["'`(]\/self-host[^"'`)]*/g)) hits.push(`${p.slice(root.length)}: ${m[0]}`); } } };
walk(root);
assert.deepEqual(hits.filter(h => !h.includes('/api/health/self-host') && !/\(\/self-host#local-setup\)|old \/self-host/.test(h)), [], 'no links to /self-host');
ok('no in-app links to /self-host');

// One repo constant; docs links are built from it
assert.equal(REPO_URL, 'https://github.com/sytesims/imagination-is-all-you-need');
assert.equal(repoDoc('docs/INSTALL.md'), `${REPO_URL}/blob/main/docs/INSTALL.md`);
assert.equal(repoDoc('docs/CONFIGURATION.md', 'speech-translation'), `${REPO_URL}/blob/main/docs/CONFIGURATION.md#speech-translation`);
assert.equal(TRANSLATE_DOC, repoDoc('docs/CONFIGURATION.md', 'speech-translation'));
const shell = readFileSync(new URL('../../web/src/ui/Shell.tsx', import.meta.url), 'utf8');
assert.ok(/<Link to=\{REPO_URL\} className="promo-link"[^>]*>GitHub →<\/Link>/.test(shell), 'promo line: GitHub →');
assert.ok(!/github\.com\/sytesims/.test(shell), 'Shell uses the constant');
// Link opens an outside address in a new tab
assert.ok(/if \(\/\^https\?:\\\/\\\/\/i\.test\(to\)\) return <a [^>]*target="_blank" rel="noopener noreferrer"/.test(router), 'Link: external → new tab');
// The moved docs exist
const hw = readFileSync(new URL('../../docs/LOCAL-MODELS-AND-HARDWARE.md', import.meta.url), 'utf8');
// the public docs dropped the unverified speed table; the section and the per-tool memory table stay
assert.ok(/^## Will it run on my machine\?$/m.test(hw) && /^## Graphics memory per tool$/m.test(hw) && /Fits 24 GB \(4090\)/.test(hw), 'fit section + memory table in docs');
const cfg = readFileSync(new URL('../../docs/CONFIGURATION.md', import.meta.url), 'utf8');
assert.ok(/^## Speech translation$/m.test(cfg), 'speech translation section in docs');
const inst = readFileSync(new URL('../../docs/INSTALL.md', import.meta.url), 'utf8');
assert.ok(/^## Requirements$/m.test(inst) && /^### macOS$/m.test(inst) && /^### Windows$/m.test(inst) && /^## Start the app$/m.test(inst) && /^### Real renders on Comfy Cloud$/m.test(inst) && /install\.sh --install-comfy/.test(inst), 'install steps in docs');
ok('REPO_URL constant, GitHub → promo, new-tab links, docs hold the install steps and the fit / memory tables');
console.log('ALL OK selfhost-redirect');
