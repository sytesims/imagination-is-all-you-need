// One-browser, read-only ViewerVideo regression against an isolated Vite dev server.
// Requires an existing Playwright install/browser; never installs/downloads anything.
// MEDIA_VIEWER_BASE=http://localhost:5274 MEDIA_VIEWER_FILE=/files/existing.mp4
// PLAYWRIGHT_MODULE=file:///path/to/playwright/index.mjs node scripts/qa/media-viewer.mjs
import assert from 'node:assert/strict';
const base = process.env.MEDIA_VIEWER_BASE;
const src = process.env.MEDIA_VIEWER_FILE;
if (!base || !src) throw new Error('Set MEDIA_VIEWER_BASE (isolated Vite) and MEDIA_VIEWER_FILE (existing playable video).');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(); const writes = []; const exceptions = [];
  await page.route('**/*', r => ['GET', 'HEAD'].includes(r.request().method()) ? r.continue() : r.abort());
  page.on('request', r => { if (!['GET', 'HEAD'].includes(r.method())) writes.push(r.method()); });
  page.on('pageerror', e => exceptions.push(e.message));
  await page.goto(base);
  await page.evaluate(async (src) => {
    // Resolve Vite's transformed dependency URLs, including custom isolated cacheDir.
    const viewer = await (await fetch('/src/shared/ResultViewer.tsx')).text();
    const main = await (await fetch('/src/main.tsx')).text();
    const reactUrl = viewer.match(/from "([^"]*\/react\.js[^\"]*)"/)[1];
    const domUrl = main.match(/from "([^"]*\/react-dom_client\.js[^\"]*)"/)[1];
    const { default: React } = await import(reactUrl);
    const { default: { createRoot } } = await import(domUrl);
    const { ViewerVideo } = await import('/src/shared/ResultViewer.tsx');
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host); window.viewerErrors = []; window.nativeMediaErrors = [];
    document.addEventListener('error', e => { const v = e.target;
      if (v instanceof HTMLVideoElement) window.nativeMediaErrors.push({ src: v.getAttribute('src'), code: v.error?.code, network: v.networkState, ready: v.readyState });
    }, true);
    window.renderViewer = (url = src, vtt = null) => root.render(React.createElement(ViewerVideo, {
      src: url, label: 'Regression video', autoPlay: true, captions: { vtt, on: true },
      onError: () => window.viewerErrors.push(url),
    }));
    window.renderResultFixture = async () => {
      const { default: ResultView } = await import('/src/shared/ResultView.tsx');
      root.render(React.createElement(ResultView, { variant: 'viewer', beforeUrl: '', title: 'QA result', onClose: () => root.render(null),
        job: { id: 'qa-sample', kind: 'sample', toolId: 'sample', status: 'done', input: {}, outputs: [
          { label: 'Missing clip', url: '/files/qa-missing-result.mp4' }, { label: 'Playable clip', url: src },
        ] },
      }));
    };
    window.renderViewer(src, '/files/qa-missing-caption.vtt');
  }, src);
  const playable = async () => {
    await page.waitForSelector('[data-testid=rvx-video]');
    await page.waitForFunction(() => document.querySelector('[data-testid=rvx-video]')?.readyState >= 2);
  };
  await playable();
  await page.evaluate(() => { const v = document.querySelector('[data-testid=rvx-video]');
    v.querySelector('track').dispatchEvent(new Event('error', { bubbles: true }));
    v.dispatchEvent(new Event('error')); // no MediaError: not a genuine media failure
    v.poster = '/files/qa-missing-poster.jpg';
  });
  assert.equal(await page.evaluate(() => window.viewerErrors.length), 0);
  assert.equal(await page.locator('[data-testid=rvx-missing]').count(), 0);
  console.log('ok subtitle/poster/empty-error events do not replace playable video');

  await page.evaluate(() => window.renderViewer('/files/qa-missing-video.mp4'));
  await page.waitForSelector('[data-testid=rvx-missing]');
  await page.evaluate(src => window.renderViewer(src), src); await playable();
  console.log('ok real 404 preserves missing message; selecting valid source recovers');

  await page.evaluate(() => window.renderViewer('/src/shared/mediaFailure.ts'));
  await page.waitForSelector('[data-testid=rvx-media-error]');
  assert.equal(await page.locator('[data-testid=rvx-missing]').count(), 0);
  assert.equal(await page.locator('[data-testid=rvx-media-error]').getAttribute('data-reason'), 'unsupported');
  console.log('ok valid HTTP resource with unsupported content is not called deleted');

  const transient = `${src}${src.includes('?') ? '&' : '?'}qa-reload=1`;
  const transientUrl = new URL(transient, base).href;
  await page.route(transientUrl, async r => { await page.unroute(transientUrl); await r.abort('failed'); });
  await page.evaluate(src => window.renderViewer(src), transient);
  await page.waitForSelector('[data-testid=rvx-media-error]');
  assert.equal(await page.locator('[data-testid=rvx-missing]').count(), 0);
  await page.locator('[data-testid=rvx-media-retry]').click(); await playable();
  await page.waitForFunction(() => document.querySelector('[data-testid=rvx-video]')?.currentTime > 0);
  console.log('ok one-shot failed request reloads same media and resumes playback');

  await page.evaluate(() => { const host = document.createElement('div'); document.body.append(host);
    const v = document.createElement('video'); v.id = 'qa-grid-video'; v.src = '/files/qa-missing-grid.mp4'; host.append(v);
  });
  await page.waitForFunction(() => document.querySelector('#qa-grid-video')?.classList.contains('media-broken'));
  await page.evaluate(src => { const v = document.querySelector('#qa-grid-video'); v.src = src; v.load(); }, src);
  await page.waitForFunction(() => document.querySelector('#qa-grid-video')?.readyState >= 2);
  assert.equal(await page.locator('#qa-grid-video').evaluate(v => v.classList.contains('media-broken') || v.parentElement.classList.contains('media-broken-host')), false);
  assert.equal(await page.evaluate(async () => { const { isDecorative } = await import('/src/shared/mediaBudget.ts'); return isDecorative(document.querySelector('[data-testid=rvx-video]')); }), false);
  assert.deepEqual(writes, []); assert.deepEqual(exceptions, []);
  console.log('ok global fallback recovers, muted viewer is not decorative, no writes/page exceptions');
  await page.evaluate(() => window.renderResultFixture());
  await page.waitForSelector('[data-testid=rvx-missing]');
  await page.locator('[data-testid=rvx-next]').click(); await playable();
  assert.equal(await page.locator('[data-testid=rvx-missing]').count(), 0);
  await page.locator('[data-testid=rvx-prev]').click(); await page.waitForSelector('[data-testid=rvx-missing]');
  await page.locator('[data-testid=rvx-next]').click(); await playable();
  await page.locator('[data-testid=rvx-close]').click();
  assert.deepEqual(writes, []); assert.deepEqual(exceptions, []);
  console.log('ok full ResultView missing/playable output selection in both directions and close');
  console.log('observed native media errors:', JSON.stringify(await page.evaluate(() => window.nativeMediaErrors)));
} finally { await browser.close(); }
