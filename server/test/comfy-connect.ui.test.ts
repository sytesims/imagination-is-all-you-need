// Windows/Mac/Linux setup PR 1: the shared ComfyUI form (web/src/shared/ComfyConnect) in the Welcome and Settings → Your computer,
// in real React + headless Chromium with a fake API (no API server, no ComfyUI, nothing downloaded). Skips without Playwright.
// Covers: no ComfyUI (never a dead end: check again, Get ComfyUI, Use Comfy Cloud instead), ComfyUI starting while the Welcome is open,
// ComfyUI moved to 8189 (+ a second one), the models folder learned from ComfyUI vs unknown, a nearly full disk, a missing add-on, phone width.
// SETUP_EVIDENCE=<folder> keeps numbered screenshots. Run: npx tsx test/comfy-connect.ui.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { findChromium } from './_cdp.ts';
const require = createRequire(import.meta.url);
const playwright = (() => { for (const id of [process.env.SETUP_PLAYWRIGHT, 'playwright', path.join(os.homedir(), '.npm/_npx/e41f203b7505f1fb/node_modules/playwright')]) { if (!id) continue; try { return require(id); } catch { /* next */ } } return null; })();
const chromiumPath = process.env.SETUP_CHROMIUM || findChromium();
if (!playwright || !chromiumPath) { console.log(`SKIP comfy-connect.ui: ${!playwright ? 'Playwright' : 'Chromium headless shell'} not installed (nothing downloaded)`); process.exit(0); }
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-fixture-')); const evidence = process.env.SETUP_EVIDENCE || scratch; fs.mkdirSync(evidence, { recursive: true });
const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';
import {RunSetupHost,openRunSetup} from '/src/ui/setup/RunSetup.tsx';import GpuModels from '/src/platform/GpuModels.tsx';
import '/src/tokens.css';import '/src/styles.css';import '/src/ui-states.css';import '/src/runon.css';import '/src/platform/settings.css';
const settings=location.hash==='#settings';
createRoot(document.getElementById('root')).render(settings?React.createElement('section',{className:'settings-page st'},React.createElement(GpuModels)):React.createElement(React.Fragment,null,React.createElement('button',{id:'wizard',onClick:openRunSetup},'Setup'),React.createElement(RunSetupHost)));
</script></body></html>`;
const port = Number(process.env.CC_WEB_PORT) || 5294; const origin = `http://127.0.0.1:${port}`;
const server = await createServer({ root: path.resolve(import.meta.dirname, '../../web'), configFile: false, cacheDir: path.join(scratch, 'cache'), esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port, strictPort: true },
  plugins: [{ name: 'cc-fixture', configureServer(s: any) { s.middlewares.use(async (req: any, res: any, next: any) => { if (!req.url?.startsWith('/cc-fixture')) return next(); res.setHeader('Content-Type', 'text/html'); res.end(await s.transformIndexHtml('/cc-fixture', html)); }); } }] });
const GB = 1e9;
const MODELS = { groups: [{ toolName: 'Create Image', models: [
  { providerId: 'comfy-zimage', displayName: 'Z-Image Turbo', requirements: { downloadId: 'comfy-zimage', downloadBytes: 12.3 * GB, missingBytes: 12.3 * GB, missingBytesSource: 'checked' } },
  { providerId: 'comfy-flux2', displayName: 'FLUX.2 Klein', requirements: { downloadId: 'comfy-flux2', downloadBytes: 20.1 * GB, missingBytes: 20.1 * GB, missingBytesSource: 'checked' } }] }] };
const PACKS = [{ name: 'ComfyUI-KJNodes', repo: 'https://github.com/kijai/ComfyUI-KJNodes', dir: 'ComfyUI-KJNodes', license: 'GPL-3.0', optional: false, note: null, classes: ['ImageResizeKJv2', 'GetImageSizeAndCount'], installed: false, missing: ['ImageResizeKJv2', 'GetImageSizeAndCount'] },
  { name: 'ComfyUI-Frame-Interpolation', repo: 'https://github.com/Fannovel16/ComfyUI-Frame-Interpolation', dir: 'ComfyUI-Frame-Interpolation', license: 'MIT', optional: false, note: null, classes: ['RIFE VFI'], installed: true, missing: [] }];
let browser: any; const done: string[] = [];
try {
  await server.listen(); browser = await playwright.chromium.launch({ headless: true, executablePath: chromiumPath });
  async function fixture(o: any = {}, view = { width: 1440, height: 900 }, hash = '') {
    const context = await browser.newContext({ viewport: view, reducedMotion: 'reduce' }); const page = await context.newPage(); const state: any = { up: false, url: 'http://127.0.0.1:8188', tests: 0, ...o }; const writes: any[] = [];
    await context.route('**/*', async (route: any) => { const req = route.request(); const u = new URL(req.url()); if (u.origin !== origin) return route.abort(); if (!u.pathname.startsWith('/api/')) { if (/\.(png|jpg|webp|mp4|woff2?)$/.test(u.pathname)) return route.abort(); return route.continue(); }
      const m = req.method(); if (m !== 'GET') writes.push({ path: u.pathname, method: m, body: req.postDataJSON?.() }); let body: any = {};
      const p = u.pathname;
      if (p === '/api/local/comfy/test') { state.tests++; const typed = req.postDataJSON()?.url; body = state.up || typed ? { reachable: true, url: typed || state.url, detected: !typed, version: '0.43.0', movedFrom: state.movedFrom ?? null, alsoFound: state.alsoFound ?? [], host: { platform: 'win32', arch: 'x64' } } : { reachable: false, url: null, alsoFound: [], host: { platform: 'win32', arch: 'x64' } }; }
      else if (p === '/api/setup') body = m === 'GET' ? { suggest: false, setup: 'none', choices: [], keys: [] } : { done: true, choices: req.postDataJSON().choices };
      else if (p.startsWith('/api/settings/providers')) body = { canStoreKeys: true, ok: true };
      else if (p === '/api/accounts') body = { accounts: [{ provider: 'comfy', balanceUsd: 5, keyCheck: 'ok' }] };
      else if (p === '/api/local/comfy') body = m === 'GET' ? { url: state.saved ?? null, savedUrl: state.saved ?? null, source: state.saved ? 'settings' : null, canChange: true } : { url: req.postDataJSON()?.url, savedUrl: req.postDataJSON()?.url, canChange: true };
      else if (p === '/api/me/routing') body = { global: { useLocal: true }, pins: {} };
      else if (p === '/api/hardware' || p === '/api/hardware/refresh') body = { source: 'comfyui-system_stats', tier: 'most', tierLabel: 'Most models', gpu: { name: 'NVIDIA GeForce RTX 4070', type: 'cuda', vramTotalGB: 12 }, comfy: { reachable: state.up, version: '0.43.0' }, profile: { id: 'nvidia', label: 'NVIDIA GeForce RTX 4070 · 12 GB' } };
      else if (p === '/api/hardware/live') body = { at: new Date().toISOString(), ram: { totalBytes: 32 * GB, freeBytes: 16 * GB, source: 'host' }, vram: { totalBytes: 12 * GB, freeBytes: 11 * GB }, disk: { freeBytes: state.diskFree ?? 400 * GB, totalBytes: 1000 * GB }, comfy: { reachable: state.up, version: '0.43.0', pytorch: '2.6' } };
      else if (p === '/api/health/self-host') body = { backend: 'comfy', comfy: { ready: state.up, reachable: state.up, version: '0.43.0' } };
      else if (p === '/api/tools') body = [];
      else if (p === '/api/models') body = MODELS;
      else if (p === '/api/local/models-dir') body = state.dir ? { source: 'comfyui', dir: state.dir, writable: true, why: null, putIn: 'ComfyUI\\models\\checkpoints', separator: '\\', canOpen: true } : { source: null, dir: null, writable: false, why: 'unknown', putIn: 'ComfyUI\\models\\checkpoints', separator: '\\', canOpen: false };
      else if (p === '/api/local/downloads' && m === 'GET') body = { downloads: [], modelsDir: state.dir ? 'models' : null, modelsDirSet: !!state.dir };
      else if (p === '/api/local/downloads') body = state.diskFree != null ? { dryRun: true, missingBytes: 12.3 * GB, diskFreeBytes: state.diskFree, canDownload: false, code: 'not_enough_disk', error: `Needs 12.3 GB of disk space; ${(state.diskFree / GB).toFixed(1)} GB is free. Free some space, then try again.`, files: [] } : { dryRun: true, missingBytes: 12.3 * GB, canDownload: true, code: null, files: [] };
      else if (p === '/api/local/nodes') body = { known: true, platform: 'win32', comfyUrl: 'http://127.0.0.1:8188', packs: PACKS };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }); });
    await page.goto(`${origin}/cc-fixture${hash}`); return { page, context, state, writes };
  }
  /** a numbered title bar on top of the screenshot, then the shot */
  const shot = async (page: any, n: string, title: string) => { await page.evaluate(([n, t]: string[]) => { const b = document.createElement('div'); b.id = 'cc-bar'; b.textContent = `${n} · ${t}`;
      Object.assign(b.style, { position: 'fixed', top: '0', left: '0', right: '0', zIndex: '2147483647', padding: '6px 12px', background: '#111', color: '#fff', font: '600 13px/18px system-ui', borderBottom: '2px solid #ff6a1a' }); document.body.appendChild(b); }, [n, title]);
    await page.screenshot({ path: path.join(evidence, `${n}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`), fullPage: false }); await page.evaluate(() => document.getElementById('cc-bar')?.remove()); done.push(`${n} ${title}`); };
  const toGpu = async (f: any) => { await f.page.click('#wizard'); await f.page.getByTestId('wl-rec').waitFor(); await f.page.getByTestId('wl-opt-gpu').click(); await f.page.getByTestId('wl-next').click(); };

  // 01 no ComfyUI: next steps, never a dead end; Use Comfy Cloud instead switches the pick
  { const f = await fixture(); await toGpu(f); await f.page.getByTestId('cc-missing').waitFor();
    for (const id of ['cc-look-again', 'cc-get', 'cc-cloud', 'cc-desktop-help', 'cc-other-addr']) assert.equal(await f.page.getByTestId(id).count(), 1, id);
    assert.equal(await f.page.getByTestId('cc-get').getAttribute('href'), 'https://www.comfy.org/download');
    await shot(f.page, '01', 'Welcome no ComfyUI');
    await f.page.getByTestId('cc-cloud').click(); await f.page.getByTestId('wl-comfy').waitFor(); assert.equal(await f.page.getByTestId('wl-gpu').count(), 0, 'Your computer swapped for Comfy Cloud');
    await f.page.getByTestId('wl-key-comfy').fill('synthetic-fixture-key'); await f.page.getByTestId('wl-key-comfy').press('Enter'); await f.page.getByTestId('wl-key-comfy-status').filter({ hasText: 'Key works' }).waitFor();
    assert.equal(await f.page.getByTestId('wl-next').isDisabled(), false, 'Continue works after Use Comfy Cloud instead'); await f.page.getByTestId('wl-next').click(); await f.page.getByTestId('wl-ready').waitFor();
    assert.deepEqual(f.writes.find((w: any) => w.path === '/api/setup').body.choices, ['comfy']); await f.context.close(); }
  // 02 ComfyUI starts while the Welcome is open: noticed without a reload (light polling)
  { const f = await fixture(); await toGpu(f); await f.page.getByTestId('cc-missing').waitFor(); const before = f.state.tests; f.state.up = true;
    await f.page.getByTestId('cc-found').waitFor({ timeout: 9000 }); assert.ok(f.state.tests - before <= 2, 'one or two quiet looks, no busy loop');
    assert.equal(await f.page.getByTestId('wl-next').isDisabled(), false); await shot(f.page, '02', 'ComfyUI started while open');
    const n = f.state.tests; await f.page.waitForTimeout(6000); assert.equal(f.state.tests, n, 'stops looking once found'); await f.context.close(); }
  // 03 ComfyUI moved to 8189 (the saved 8188 stopped answering) and a second one answers on 8190: shown, never switched by itself
  { const f = await fixture({ up: true, saved: 'http://127.0.0.1:8188', url: 'http://127.0.0.1:8189', movedFrom: 'http://127.0.0.1:8188', alsoFound: [{ url: 'http://127.0.0.1:8190', version: '0.41.2' }] }, undefined, '#settings');
    await f.page.getByTestId('cc-moved').waitFor(); await f.page.getByTestId('cc-pick').waitFor(); assert.ok(!f.writes.some((w: any) => w.path === '/api/local/comfy'), 'nothing saved by itself');
    await f.page.getByTestId('ls-comfy').scrollIntoViewIfNeeded(); await shot(f.page, '03', 'ComfyUI on 8189 plus a second one');
    await f.page.getByTestId('cc-use').click(); await f.page.waitForTimeout(200); assert.equal(f.writes.find((w: any) => w.path === '/api/local/comfy' && w.method === 'PUT').body.url, 'http://127.0.0.1:8189'); await f.context.close(); }
  // 04 models folder learned from ComfyUI
  { const f = await fixture({ up: true, saved: 'http://127.0.0.1:8188', dir: 'C:\\Users\\José Núñez\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\models' }, undefined, '#settings');
    await f.page.getByTestId('ls-models-dir').waitFor(); assert.match(await f.page.getByTestId('ls-models-dir-path').innerText(), /José Núñez/); await f.page.getByTestId('ls-download').first().waitFor();
    await f.page.getByTestId('ls-models-dir').scrollIntoViewIfNeeded(); await shot(f.page, '04', 'Models folder learned from ComfyUI'); await f.context.close(); }
  // 05 models folder unknown: no Download offered, where to put the files instead
  { const f = await fixture({ up: true, saved: 'http://127.0.0.1:8188' }, undefined, '#settings');
    await f.page.getByTestId('ls-models-dir-unknown').waitFor(); await f.page.getByTestId('ls-model-comfy-zimage').waitFor(); await f.page.waitForTimeout(200);
    assert.equal(await f.page.getByTestId('ls-download').count(), 0, 'no Download offered'); assert.match(await f.page.getByTestId('ls-models-put-in').innerText(), /ComfyUI\\models\\checkpoints/);
    await f.page.getByTestId('ls-models-dir-unknown').scrollIntoViewIfNeeded(); await shot(f.page, '05', 'Models folder unknown'); await f.context.close(); }
  // 06 disk nearly full: refused before downloading, in plain words
  { const f = await fixture({ up: true, saved: 'http://127.0.0.1:8188', dir: 'D:\\Comfy-Desktop\\models', diskFree: 3.2 * GB }, undefined, '#settings');
    await f.page.getByTestId('ls-download').first().click(); await f.page.getByTestId('ls-dl-err').waitFor(); assert.match(await f.page.getByTestId('ls-dl-err').innerText(), /3\.2 GB is free/);
    await f.page.getByTestId('ls-dl-err').scrollIntoViewIfNeeded(); await shot(f.page, '06', 'Disk nearly full'); await f.context.close(); }
  // 07 a missing add-on: which pack, its source, Manager steps and the manual way
  { const f = await fixture({ up: true, saved: 'http://127.0.0.1:8188', dir: 'D:\\Comfy-Desktop\\models' }, undefined, '#settings');
    const row = f.page.getByTestId('ls-pack-ComfyUI-KJNodes'); await row.waitFor(); assert.equal(await row.getByTestId('ls-pack-src').getAttribute('href'), 'https://github.com/kijai/ComfyUI-KJNodes');
    assert.match(await row.getByTestId('ls-pack-steps').first().innerText(), /Custom Nodes Manager/); await row.locator('summary').click(); assert.match(await row.innerText(), /python_embeded\\python\.exe/);
    await f.page.getByTestId('ls-nodes').scrollIntoViewIfNeeded(); await shot(f.page, '07', 'Missing add-on'); await f.context.close(); }
  // 08 phone width: the Welcome's not-found step fits, no sideways scroll
  { const f = await fixture({}, { width: 390, height: 844 }); await toGpu(f); await f.page.getByTestId('cc-missing').waitFor();
    assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll'); await shot(f.page, '08', 'Phone width Welcome'); await f.context.close(); }
  console.log(`PASS ${done.length} cases\n${done.join('\n')}`);
} finally { await browser?.close(); await server.close(); }
