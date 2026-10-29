/* Read-only Films restart regression against an isolated frontend; existing browser/install only.
   QA_BASE=http://127.0.0.1:5277 PLAYWRIGHT_MODULE=/path/to/playwright node scripts/qa/films-start.cjs
   Optional CHROMIUM_EXECUTABLE_PATH selects an already-installed browser. No recordings or generated outputs. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.QA_BASE;
if (!base) throw new Error('Set QA_BASE to the isolated frontend.');
const report = [];
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    for (const [width, height, reduced] of [[1280, 720, false], [390, 844, false], [1280, 720, true]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route('**/api/**', r => ['GET', 'HEAD'].includes(r.request().method()) ? r.continue() : r.abort());
      await page.addInitScript(() => {
        window.filmStarts = []; const seen = new WeakSet();
        document.addEventListener('playing', e => {
          const v = e.target;
          if (!(v instanceof HTMLVideoElement) || !v.closest('[data-testid="xp-films-player"]') || seen.has(v)) return;
          seen.add(v); v.dataset.qaWatch = String(window.filmStarts.length);
          window.filmStarts.push({ src: v.getAttribute('src'), time: v.currentTime });
        }, true);
      });
      await page.goto(`${base}/#xp-films`);
      const card = id => page.getByTestId(`xp-films-poster-${id}`);
      const video = () => page.locator('[data-testid="xp-films-player"] video');
      if (!reduced && width > 700) {
        await card('mum').hover();
        const thumb = card('mum').locator('..').locator('.xpfm-pc-wide video');
        await thumb.waitFor(); await page.waitForFunction(() => document.querySelector('[data-film="mum-ep1"] .xpfm-pc-wide video')?.readyState >= 2);
        await thumb.evaluate(v => { v.currentTime = 2; });
        assert.ok(await thumb.evaluate(v => v.currentTime >= 2), 'thumbnail has already advanced before selecting the full film');
      }
      const select = async id => {
        const count = await page.evaluate(() => window.filmStarts.length);
        await card(id).click();
        await page.getByTestId('xp-films-player').evaluate(el => el.scrollIntoView({ block: 'center' }));
        if (reduced) {
          assert.equal(await video().count(), 0, 'reduced-motion selection stays a manual poster');
          await page.getByTestId('xp-films-film-play').click();
        }
        await page.waitForFunction(n => window.filmStarts.length > n, count);
        const start = await page.evaluate(() => window.filmStarts.at(-1));
        assert.ok(start.time < .5, `${id} first playing frame must be near 0:00: ${JSON.stringify(start)}`);
        assert.ok(!start.src.includes('#t='), 'full cut, no ident-skipping fragment');
        return start;
      };
      const starts = [await select('mum')];
      await video().evaluate(v => { v.currentTime = 9; v.pause(); });
      const token = await video().getAttribute('data-qa-watch');
      await page.getByTestId('xp-films-film-sound').click();
      assert.equal(await video().getAttribute('data-qa-watch'), token, 'sound toggle must not replace the watch session');
      assert.ok(await video().evaluate(v => v.currentTime >= 9), 'sound toggle must not rewind');
      await video().evaluate(async v => { v.currentTime = 12; await v.play(); });
      assert.equal(await video().getAttribute('data-qa-watch'), token, 'seek / pause / resume keep the same session');
      assert.ok(await video().evaluate(v => v.currentTime >= 12), 'normal resume must not rewind');
      starts.push(await select('mum')); // reselect the same open film, explicitly from its beginning
      for (const id of ['airport-run', 'le-septieme', 'counter-offer', 'star-to-steer-by']) {
        await video().evaluate(v => { v.currentTime = 13; });
        starts.push(await select(id)); // switching films must not inherit the old position
      }
      await page.getByTestId('xp-films-close').click();
      starts.push(await select('star-to-steer-by')); // close and reopen also starts fresh
      assert.deepEqual(errors, []); report.push({ width, reduced, starts }); await page.close();
    }
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
