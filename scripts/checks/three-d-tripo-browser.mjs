/** Headless mock-only regression. Requires an installed Playwright and browser; never installs either.
 * PLAYWRIGHT_MODULE=/path/to/playwright BROWSER_EXECUTABLE=/path/to/chrome-headless-shell
 * TRIPO_PREVIEW_URL=http://127.0.0.1:5330 TRIPO_SCREENSHOTS=/scratch/output node scripts/checks/three-d-tripo-browser.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TRIPO_PREVIEW_URL || 'http://127.0.0.1:5330';
assert.match(base, /^http:\/\/127\.0\.0\.1:53[0-4]\d$/, 'Use an isolated Codex preview');
const health = await (await fetch(base + '/api/health')).json();
assert.equal(health.backend, 'mock', 'Never run against paid providers');
const out = process.env.TRIPO_SCREENSHOTS;
if (out) fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); return u.origin === base || ['data:', 'blob:'].includes(u.protocol) ? r.continue() : r.abort(); });
  await ctx.addInitScript(() => localStorage.setItem('ohf:setup:seen', '1'));
  const p = await ctx.newPage(); p.setDefaultTimeout(20000);
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  const shot = async (name, text) => {
    if (!out) return;
    await p.evaluate(text => { document.getElementById('__tripo_test_title')?.remove(); const el = document.createElement('div'); el.id = '__tripo_test_title'; el.textContent = 'MOCK PREVIEW · ' + text; Object.assign(el.style, { position: 'fixed', top: '0', left: '0', right: '0', zIndex: '2147483647', padding: '6px 12px', background: '#ff7a1a', color: '#111', font: '600 14px system-ui', pointerEvents: 'none' }); document.body.append(el); }, text);
    await p.screenshot({ path: path.join(out, name + '.png') });
  };
  const waitJob = async id => { for (let n = 0; n < 240; n++) { const j = await (await ctx.request.get(base + '/api/jobs/' + id)).json(); if (['done', 'failed', 'canceled'].includes(j.status)) return j; await p.waitForTimeout(250); } throw new Error('Job did not settle: ' + id); };
  const checkModel = async () => {
    await p.getByTestId('t3-model').click(); await p.getByTestId('t3-model-list').waitFor();
    const ids = await p.getByTestId('t3-model-list').locator('[role="option"][data-model]').evaluateAll(es => es.map(e => e.getAttribute('data-model')));
    assert.deepEqual(ids, ['cloud-tripo-31']); await p.keyboard.press('Escape');
  };
  const run = async (mode, price) => {
    await p.waitForFunction(() => document.querySelector('[data-testid="t3-generate"]')?.getAttribute('aria-disabled') !== 'true');
    assert.match(await p.getByTestId('t3-price').innerText(), new RegExp(`0\\.${price}`));
    const reply = p.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/api/tools/three-d/jobs'));
    await p.getByTestId('t3-generate').click(); const response = await reply; assert.equal(response.status(), 200, await response.text());
    const start = await response.json(); const job = await waitJob(start.id);
    assert.equal(job.status, 'done', JSON.stringify(job)); assert.equal(job.input.mode, mode); assert.match(job.resultUrl, /\.glb$/);
    const glb = await ctx.request.get(base + job.resultUrl); assert.equal(glb.status(), 200); assert.match(glb.headers()['content-type'], /model\/gltf-binary/);
    assert.equal((await glb.body()).subarray(0, 4).toString(), 'glTF');
    return job;
  };
  await p.goto(base + '/3d?workflow=text-to-3d');
  await p.getByTestId('t3-prompt').waitFor({ timeout: 90000 });
  await p.getByTestId('t3-generate').click({ force: true }); await p.getByTestId('t3-notes').getByText('Write a prompt', { exact: true }).waitFor();
  await shot('01-text-empty', 'Text to 3D · empty prompt is refused'); await p.keyboard.press('Escape');
  await p.getByTestId('t3-prompt').fill('A small ceramic owl with blue wings'); await checkModel();
  await p.waitForTimeout(500); await shot('02-text-ready', 'Text to 3D · $0.20 before Generate');
  const text = await run('text-to-3d', '20');
  await p.getByTestId('t3-card-' + text.id).getByRole('button', { name: /Open 3D model:/ }).click();
  for (const id of ['v3d-download', 'v3d-use-shot', 'v3d-still', 'v3d-rig']) await p.getByTestId(id).waitFor();
  await p.waitForFunction(() => !document.querySelector('[data-testid="v3d-still"]')?.disabled, { timeout: 30000 });
  assert.match(await p.getByTestId('result-viewer').innerText(), /Text to 3D/);
  await p.waitForTimeout(1500); // let the loaded model draw a frame before capturing it
  await shot('03-text-viewer', 'Mock GLB · Save, Shot, Photo and Rig'); await p.getByTestId('rvx-close').click();
  await p.goto(base + '/3d?workflow=text-to-3d&recreate=' + text.id);
  await p.waitForFunction(() => document.querySelector('[data-testid="t3-prompt"]')?.value === 'A small ceramic owl with blue wings');
  await p.goto(base + '/3d?workflow=multiview-to-3d');
  const examples = path.resolve('web/public/examples');
  await p.getByTestId('wf-slot-image-input').setInputFiles(path.join(examples, 'hq-gang.jpg'));
  await p.getByTestId('t3-generate').click({ force: true });
  await p.getByTestId('t3-notes').getByText('Add a second view: left, back or right', { exact: true }).waitFor();
  await shot('04-multiview-one', 'Multi-view to 3D · one photo is refused'); await p.keyboard.press('Escape');
  await p.getByTestId('wf-slot-image_right-input').setInputFiles(path.join(examples, 'hq-city.jpg'));
  await checkModel(); await p.waitForTimeout(500); await shot('05-multiview-two', 'Front and right views · $0.30 before Generate');
  const two = await run('multiview-to-3d', '30');
  assert.deepEqual(Object.keys(two.input.viewUrls).sort(), ['image', 'image_right']);
  await p.getByTestId('wf-slot-image_left-input').setInputFiles(path.join(examples, 'hq-elder.jpg'));
  await p.getByTestId('wf-slot-image_back-input').setInputFiles(path.join(examples, 'hq-dunes.jpg'));
  await p.waitForTimeout(500); await shot('06-multiview-four', 'Four named views · the same $0.30 price');
  const four = await run('multiview-to-3d', '30');
  assert.deepEqual(Object.keys(four.input.viewUrls).sort(), ['image', 'image_back', 'image_left', 'image_right']);
  await p.goto(base + '/3d?workflow=multiview-to-3d&recreate=' + four.id);
  for (const slot of ['image', 'image_left', 'image_back', 'image_right']) await p.getByTestId('wf-slot-' + slot).locator('img').waitFor();
  await shot('07-multiview-recreate', 'Recreate keeps all four view assignments');
  assert.deepEqual(errors, []);
  const result = { status: 'passed', text: text.id, multiviewTwo: two.id, multiviewFour: four.id, pricesUsd: { text: 0.2, multiview: 0.3 }, model: 'cloud-tripo-31', errors };
  if (out) fs.writeFileSync(path.join(out, 'browser-check.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
