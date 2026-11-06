#!/usr/bin/env node
// Try it (sample mode): record what the real app reads from a MOCK server, so the static build at iiayn.app/try/ can answer the
// same requests in the browser (web/try/sw.js). Run by scripts/try/build.mjs; on its own:
//   PLAYWRIGHT_MODULE=file:///path/to/playwright/index.mjs node scripts/try/record.mjs <ui-origin> <out-dir>
// It clicks through the app with headless Chromium, keeps every GET /api/* answer and the list of media files the pages loaded,
// presses Generate once per studio (the mock server answers with a sample), and writes <out-dir>/snap.json + <out-dir>/media.txt.
// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs'; import path from 'node:path';

const UI = process.argv[2] || 'http://127.0.0.1:5177';
const OUT = path.resolve(process.argv[3] || 'try-out');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
fs.mkdirSync(OUT, { recursive: true });

/** Query params that only bust caches or carry time: dropped from the snapshot key (the service worker drops them too). */
const VOLATILE = new Set(['_', 't', 'ts', 'now', 'cb', 'v', 'since', 'after', 'nonce']);
export const keyOf = (method, u) => { const url = new URL(u, 'http://x'); const q = [...url.searchParams].filter(([k]) => !VOLATILE.has(k)).sort(([a, x], [b, y]) => a < b ? -1 : a > b ? 1 : x < y ? -1 : 1);
  return `${method} ${url.pathname}${q.length ? '?' + new URLSearchParams(q).toString() : ''}`; };
/** Media the pages load from the app's own origin (web/public, the mock's /files and /samples). */
const MEDIA = /^\/(files|samples|examples|showcase|fonts|models|learn|s)\/|^\/(favicon|apple-touch|app-icon|manifest)/;

const routes = {}; const media = new Set(); const jobs = {};
/** The Run on choice is saved on the server (PUT /api/me/routing) and the next price query looks the same: so a price is keyed with the
 *  saved route of its tool + model too (__route), and the service worker keeps the visitor's choice and looks prices up the same way. */
const prefs = {};
export const withRoute = (u, perTool) => { const url = new URL(u, 'http://x'); const m = url.pathname.match(/^\/api\/tools\/([^/]+)\/price$/);
  const r = m && perTool?.[decodeURIComponent(m[1])]?.[url.searchParams.get('model') ?? '']?.route; if (r) url.searchParams.set('__route', r); return url.pathname + url.search; };
/** POST price lookups (model picker rows, Run on variants): keyed by the tool they price. */
const PRICE_POST = /^\/api\/(models\/quotes|tools\/[^/]+\/price-variants)$/;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('request', (req) => { const u = new URL(req.url()); if (req.method() === 'PUT' && u.pathname === '/api/me/routing') { try { const b = JSON.parse(req.postData() || '{}');
  for (const [t, ms] of Object.entries(b.perTool ?? {})) prefs[t] = { ...(prefs[t] ?? {}), ...ms }; } catch { /* not json */ } } });
page.on('response', async (res) => {
  const u = new URL(res.url()); if (u.origin !== new URL(UI).origin) return;
  const m = res.request().method();
  if (u.pathname.startsWith('/api/')) {
    if (/\/(stream|events)$/.test(u.pathname)) return;
    const ct = res.headers()['content-type'] || '';
    if (/^(image|video|audio)\/|octet-stream|model\//.test(ct)) { if (m === 'GET') media.add(u.pathname + u.search); return; }
    let body; try { body = await res.text(); } catch { return; }
    const rec = { s: res.status(), t: ct.split(';')[0] || 'application/json', b: body };
    if (m === 'GET') { const k = keyOf('GET', withRoute(u.pathname + u.search, prefs)); if (!routes[k] || res.status() < routes[k].s) routes[k] = rec; }
    else if (/\/api\/tools\/[^/]+\/jobs$/.test(u.pathname) && m === 'POST') { try { const j = JSON.parse(body); const id = j.id ?? j.job?.id; if (id) jobs[id] = { toolId: u.pathname.split('/')[3] }; } catch { /* not json */ } }
    else if (PRICE_POST.test(u.pathname) && res.status() < 400) { let tool = ''; try { tool = JSON.parse(res.request().postData() || '{}').toolId ?? ''; } catch { /* not json */ }
      routes[keyOf(m, `${u.pathname}?toolId=${encodeURIComponent(tool || u.pathname.split('/')[3])}`)] = rec; }
    else { const k = keyOf(m, u.pathname); if (!routes[k] && res.status() < 400) routes[k] = rec; }
  } else if (MEDIA.test(u.pathname) && m === 'GET' && res.status() < 400) media.add(u.pathname);
});

// No welcome dialog in sample mode: it asks about this computer, which the website can't see.
await page.request.put(`${UI}/api/setup`, { data: { done: true, choices: ['cloud'] } });

const settle = async (ms = 900) => { try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch { /* polling pages never idle */ } await page.waitForTimeout(ms); };
const visit = async (p) => { try { await page.goto(UI + p, { waitUntil: 'domcontentloaded', timeout: 20000 }); await settle(); await page.mouse.wheel(0, 2500); await settle(400); } catch (e) { console.warn('visit failed', p, e.message); } };
const hrefs = async (re) => [...new Set((await page.$$eval('a[href]', as => as.map(a => a.getAttribute('href')))).filter(h => h && re.test(h)))];

// 1. The pages a visitor clicks through.
const PAGES = ['/', '/image', '/video', '/audio', '/3d', '/canvas', '/film', '/workflows', '/models', '/assets', '/assets/images', '/assets/videos', '/assets/audio', '/assets/projects', '/assets/favourites', '/assets/trash',
  '/settings', '/profile', '/spend', '/licenses', '/terms', '/mcp', '/api-docs', '/plugins', '/community', '/learn/ai-ecommerce'];
for (const p of PAGES) { await visit(p); console.log('page', p); }

// 2. Every workflow page, every video and audio workflow, every model page, a few asset viewers.
const idsOf = (k, pick) => { try { return pick(JSON.parse(routes[k]?.b ?? 'null')) ?? []; } catch { return []; } };
const wf = idsOf('GET /api/workflow-hub', b => b.workflows.map(w => `/workflows/${encodeURIComponent(w.id)}`));
for (const h of wf) await visit(h);
await visit('/video'); const vids = await hrefs(/^\/video\?workflow=/); for (const h of vids) await visit(h);
await visit('/audio'); const auds = await hrefs(/^\/audio\?workflow=/); for (const h of auds) await visit(h);
await visit('/image'); const imgs = await hrefs(/^\/(tools|image)\/?[^?#]*$/); for (const h of imgs.slice(0, 40)) await visit(h);
const models = [...new Set(Object.keys(routes).filter(k => k.startsWith('GET /api/models?toolId=')).flatMap(k => idsOf(k, b => b.groups.flatMap(g => g.models.map(m => `/models/${encodeURIComponent(m.id)}`)))))];
for (const h of models.slice(0, 120)) await visit(h);
await visit('/assets'); const assets = await hrefs(/^\/jobs\/[^/?#]+$/); for (const h of assets.slice(0, 12)) await visit(h);
await visit('/settings'); const sets = await hrefs(/^\/settings[?/]/); for (const h of sets) await visit(h);
console.log(`workflows ${wf.length}, video ${vids.length}, audio ${auds.length}, image ${imgs.length}, models ${models.length}, assets ${assets.length}, settings ${sets.length}`);

// 4. Generate once per studio: the mock answers with a sample job; its finished JSON becomes the template for in-browser runs.
async function generate(p, prompt, file) {
  await visit(p);
  try {
    if (file) { await page.locator('input[type=file]').first().setInputFiles(file); await settle(1500); }
    const box = page.locator('textarea:visible').first(); if (prompt && await box.count()) await box.fill(prompt);
    const go = page.locator('[data-testid$="-generate"]:visible:not([aria-disabled="true"])').first(); await go.click({ timeout: 4000 });
    await page.waitForTimeout(9000); await settle(500);
  } catch (e) { console.warn('generate failed on', p, e.message); }
}
await generate('/image', 'A lighthouse on a cliff at sunset, painterly');
await generate('/video', 'Waves rolling onto a quiet beach at dawn');
await generate('/audio', 'Calm piano with soft rain');
await generate('/3d', '', path.join(path.dirname(new URL(import.meta.url).pathname), '../../web/public/app-icon-512.png')); // Image to 3D needs a picture: the app's own icon
// the finished jobs (status done) for each tool, read straight from the mock server
const templates = {};
for (const [id, { toolId }] of Object.entries(jobs)) { const r = await page.request.get(`${UI}/api/jobs/${id}`); if (r.ok()) templates[toolId] = await r.json(); }
await visit('/assets'); // the library with the new runs

// 5. Prices for every model on every studio: each recorded price query again with each model of that tool (Run on is part of the
//    model: the same model on your computer, Comfy Cloud or a partner API is a different provider id).
const priceKeys = Object.keys(routes).filter(k => /^GET \/api\/(tools\/[^/]+\/price|models\/quote)\?/.test(k));
let harvested = 0;
for (const k of priceKeys) {
  const u = new URL(k.slice(4), 'http://x'); const toolId = u.pathname.startsWith('/api/models/quote') ? 'create-image' : u.pathname.split('/')[3];
  const list = routes[`GET /api/models?toolId=${toolId}`]; if (!list) continue;
  let models = []; try { models = JSON.parse(list.b).groups.flatMap(g => g.models); } catch { continue; }
  for (const m of models) {
    const q = new URLSearchParams(u.search);
    if (toolId === 'create-image' && u.pathname.endsWith('/quote')) q.set('model', m.providerId); else { q.set('provider', m.providerId); if (m.modelKey) q.set('model', m.modelKey); }
    const key = keyOf('GET', `${u.pathname}?${q}`); if (routes[key]) continue;
    const r = await page.request.get(`${UI}${u.pathname}?${q}`); if (!r.ok()) continue;
    routes[key] = { s: r.status(), t: 'application/json', b: await r.text() }; harvested++;
  }
}
console.log(`prices: ${harvested} more answers from ${priceKeys.length} recorded price queries`);

// 6. Last (it changes the saved Run on choice): open the model picker and pick every Run on option on each studio, so each price is recorded.
for (const p of ['/image', '/video', '/audio', '/3d']) {
  await visit(p);
  try { const mp = page.locator('[data-testid$="-model"]:visible').first(); if (await mp.count()) { await mp.click({ timeout: 3000 }); await settle(500); await page.keyboard.press('Escape'); } } catch { /* no picker */ }
  const chip = page.locator('[data-testid$="run-on"]:visible').first(); if (!(await chip.count())) continue;
  let n = 0; try { await chip.click({ timeout: 3000 }); await page.waitForTimeout(500); n = await page.locator('[role="radio"]:visible').count(); await page.keyboard.press('Escape'); } catch { continue; }
  for (let i = 0; i < n; i++) { try { await chip.click({ timeout: 3000 }); await page.waitForTimeout(400); await page.locator('[role="radio"]:visible').nth(i).click({ timeout: 2000 }); await settle(600); } catch { await page.keyboard.press('Escape'); } }
  console.log('run on', p, n, 'options');
}
await browser.close();

fs.writeFileSync(path.join(OUT, 'snap.json'), JSON.stringify({ recordedAt: new Date().toISOString().slice(0, 10), routes, templates, routing: prefs }));
fs.writeFileSync(path.join(OUT, 'media.txt'), [...media].sort().join('\n') + '\n');
console.log(`recorded ${Object.keys(routes).length} answers, ${media.size} media files, ${Object.keys(templates).length} job templates (${Object.keys(templates).join(', ')})`);
