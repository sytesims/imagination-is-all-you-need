/** Mock-only browser regression. Run against the isolated Vite/API preview.
 * PLAYWRIGHT_MODULE=/path/to/playwright BROWSER_EXECUTABLE=/path/to/chromium
 * REEL_PREVIEW_URL=http://127.0.0.1:5330 REEL_SCREENSHOTS=/scratch/output node scripts/checks/photos-to-reel-browser.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.REEL_PREVIEW_URL || 'http://127.0.0.1:5330';
assert.ok(/^http:\/\/127\.0\.0\.1:53[0-4]\d$/.test(base), 'Use an isolated Codex preview port');
const health = await (await fetch(base + '/api/health')).json();
assert.equal(health.backend, 'mock', 'Never run this test against real providers');
const out = process.env.REEL_SCREENSHOTS;
if (out) fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); return u.origin === base || ['data:', 'blob:'].includes(u.protocol) ? r.continue() : r.abort(); });
  await ctx.addInitScript(() => localStorage.setItem('ohf:setup:seen', '1'));
  const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  const shot = async (name, title) => {
    if (!out) return;
    await p.evaluate(text => { document.getElementById('__reel_test_title')?.remove(); const el = document.createElement('div'); el.id = '__reel_test_title'; el.textContent = 'MOCK PREVIEW · ' + text; Object.assign(el.style, { position: 'fixed', top: '0', left: '0', right: '0', zIndex: '2147483647', padding: '6px 12px', background: '#ff7a1a', color: '#111', font: '600 14px system-ui', pointerEvents: 'none' }); document.body.append(el); }, title);
    await p.screenshot({ path: path.join(out, name + '.png') });
  };
  // Simulate a price rising after the displayed quote. Only the quote response is changed;
  // the actual UI noteQuote/createJob path must carry this old approval to the real mock API.
  const pricePattern = '**/api/tools/app-photos-to-reel/price?*';
  let quoted = false;
  const oldPrice = async route => {
    const response = await route.fetch(); const body = await response.json();
    if (response.ok() && body.runnable !== false && body.photoCount >= 8) { assert.ok(body.routeId, 'Reel quote must identify the camera route'); body.credits = 0; body.priceText = 'Free'; body.cost = { ...body.cost, credits: 0, estUsd: 0, realRunUsd: 0, usdText: 'Free' }; quoted = true; }
    await route.fulfill({ response, json: body });
  };
  await p.route(pricePattern, oldPrice);
  await p.goto(base + '/video?workflow=photos-to-reel');
  await p.getByTestId('vbar-slot-photos-input').waitFor({ state: 'attached', timeout: 60000 });
  await p.getByTestId('vs-generate').click({ force: true });
  const titleFix = p.locator('.pf-row').filter({ hasText: 'Add title' });
  await titleFix.getByRole('button', { name: 'Choose…', exact: true }).click();
  await p.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'vbar-title');
  await p.getByTestId('vbar-title').fill('A weekend away');
  const root = path.resolve('web/public/examples');
  await p.getByTestId('vbar-slot-photos-input').setInputFiles(['hq-gang.jpg','hq-elder.jpg','hq-soar.jpg','hq-dunes.jpg','hq-forest.jpg','hq-city.jpg','hq-snow.jpg','hq-trio.jpg'].map(f => path.join(root, f)));
  await p.waitForFunction(() => document.querySelector('[data-testid="vs-generate"]') && !document.querySelector('[data-testid="vs-generate"]').disabled);
  await p.waitForTimeout(1400); assert.ok(quoted);
  await shot('07-fixed-composer', 'Title in composer · hero motion by default');
  await p.getByTestId('vbar-slot-photos-stack').click();
  await p.getByText('Drag to change the order. The reel follows this order.', { exact: true }).waitFor();
  await shot('08-fixed-photo-order', 'Every photo can be reordered');
  await p.keyboard.press('Escape');
  const responsePromise = p.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/api/tools/app-photos-to-reel/jobs'));
  await p.getByTestId('vs-generate').click();
  const refused = await responsePromise;
  assert.equal(refused.status(), 409);
  assert.match(refused.request().postData() || '', /name="quotedCredits"\r\n\r\n0/);
  await p.getByText('The price went up', { exact: true }).waitFor();
  await shot('09-price-approval', 'Real UI quote path · higher price requires approval');
  await p.getByRole('button', { name: 'Not now', exact: true }).click();
  await p.unroute(pricePattern, oldPrice);
  await p.evaluate(async () => { const q = await import('/src/shared/quote.ts'); q.requestRequote(); });
  await p.waitForTimeout(1600);
  const startedPromise = p.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/api/tools/app-photos-to-reel/jobs'));
  await p.getByTestId('vs-generate').click();
  const startedResponse = await startedPromise; assert.equal(startedResponse.status(), 200);
  const started = await startedResponse.json();
  const tile = p.getByTestId('vf-tile-' + started.id); await tile.waitFor();
  await tile.locator('.gt-has-prev').waitFor();
  const rect = await tile.boundingBox(); assert.ok(rect && rect.height > rect.width, 'Generating reel stays portrait');
  await shot('10-generating-reel', 'One portrait reel tile · source photos while generating');
  let job;
  for (let n = 0; n < 720; n++) { job = await (await ctx.request.get(base + '/api/jobs/' + started.id)).json(); if (['done', 'failed', 'canceled'].includes(job.status)) break; await p.waitForTimeout(250); }
  assert.equal(job.status, 'done', JSON.stringify(job)); assert.ok(!job.partial, JSON.stringify(job.warnings));
  for (const id of [...(job.input.childIds || []), job.input.composeJobId].filter(Boolean)) assert.equal(await p.getByTestId('vf-tile-' + id).count(), 0, 'Child must not become a gallery tile');
  await tile.getByRole('button', { name: /Open result:/ }).click(); await p.locator('.rvx').waitFor();
  await p.getByRole('navigation', { name: 'Reel steps' }).waitFor();
  await shot('11-fixed-result', 'Completed reel · child steps available in viewer');
  assert.deepEqual(errors, []);
  const result = { status: 'passed', id: job.id, errors, priceApproval: 'UI quote → automatic quotedCredits → 409 → confirmation → decline', childTiles: 0 };
  if (out) fs.writeFileSync(path.join(out, 'review-browser-check.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
