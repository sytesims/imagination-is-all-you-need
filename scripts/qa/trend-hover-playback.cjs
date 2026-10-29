/* Read-only playback regression QA, using an existing Playwright installation.
   PLAYWRIGHT_MODULE=/path/to/playwright QA_OUTPUT=/scratch/path node scripts/qa/trend-hover-playback.cjs
   The refusal tests inject policy outcomes; they are NOT native Safari/WebKit tests. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const keys = ['trend-mic', 'trend-dance'];
const output = process.env.QA_OUTPUT; if (output) fs.mkdirSync(output, { recursive: true });
const report = [];
const sample = page => page.locator('#xp-trending video').evaluateAll(vs => vs.map(v => ({
  id: v.closest('.sfilm').getAttribute('data-testid'), source: v.getAttribute('src'), paused: v.paused,
  time: v.currentTime, duration: v.duration, muted: v.muted, volume: v.volume, readyState: v.readyState,
  networkState: v.networkState, error: v.error?.message ?? null, loop: v.loop, keep: v.hasAttribute('data-media-keep'),
})));
async function advancing(page, name) {
  const before = await sample(page); await page.waitForTimeout(650); const after = await sample(page);
  assert.equal(after.length, keys.length, `${name}: all showcase clips mounted`);
  for (const v of after) {
    const old = before.find(x => x.id === v.id);
    const advanced = (v.time - old.time + v.duration) % v.duration;
    assert(!v.paused && v.readyState >= 2 && !v.error && v.loop && v.keep, `${name}: ${v.id} must be playing, decoded, looping and budget-exempt`);
    assert(advanced > .2, `${name}: ${v.id} must actually advance, not just show a playing icon`);
  }
  report.push({ name, before, after });
}
async function open(browser, scenario) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(({ scenario }) => {
    Object.defineProperty(navigator.userActivation, 'hasBeenActive', { get: () => false });
    window.__playbackEvents = []; window.__policyEvents = []; window.__audioGesture = false;
    for (const name of ['playing', 'pause', 'waiting', 'stalled', 'error']) document.addEventListener(name, e => {
      const v = e.target;
      if (v instanceof HTMLMediaElement && v.closest('#xp-trending')) window.__playbackEvents.push({ event: name, id: v.closest('.sfilm').getAttribute('data-testid'), time: v.currentTime, muted: v.muted });
    }, true);
    if (scenario === 'policy-unmute-pause') {
      // Actual native pause events, triggered at the same API boundary as a browser
      // rejecting script unmute. A genuine click remains permitted for this task.
      document.addEventListener('click', () => { window.__audioGesture = true; setTimeout(() => window.__audioGesture = false, 0); }, true);
      const muted = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
      Object.defineProperty(HTMLMediaElement.prototype, 'muted', { ...muted, set(value) {
        muted.set.call(this, value);
        if (value === false && !window.__audioGesture && this.matches('#xp-trending video')) {
          window.__policyEvents.push({ event: 'blocked script unmute', time: this.currentTime }); this.pause();
        }
      } });
    }
    if (scenario === 'initial-play-rejection') {
      const play = HTMLMediaElement.prototype.play; let rejectFirst = true;
      HTMLMediaElement.prototype.play = function () {
        if (rejectFirst && this.getAttribute('src')?.includes('trend-mic-result')) {
          rejectFirst = false; window.__policyEvents.push({ event: 'initial NotAllowedError', time: this.currentTime });
          return Promise.reject(new DOMException('Injected autoplay refusal', 'NotAllowedError'));
        }
        return play.call(this);
      };
    }
  }, { scenario });
  const page = await context.newPage(); page.setDefaultTimeout(6000);
  await page.route('**/api/**', r => ['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()) ? r.continue() : r.abort());
  await page.goto((process.env.QA_URL || 'http://localhost:5279/') + (scenario === 'navigation' ? 'licenses' : scenario === 'fresh-scroll' ? '' : '#xp-trending'));
  if (scenario === 'navigation') await page.locator('a[href="/"]').first().click();
  await page.locator('#xp-trending').waitFor(); await page.waitForTimeout(1600);
  await page.evaluate(() => document.querySelector('#xp-trending').scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.waitForTimeout(600); return { context, page };
}
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=document-user-activation-required'] });
  try {
    for (const scenario of ['fresh-hash', 'fresh-scroll', 'navigation', 'initial-play-rejection', 'policy-unmute-pause']) {
      const { context, page } = await open(browser, scenario);
      await advancing(page, `${scenario}: initial on-screen autoplay`);
      for (const key of keys) { await page.getByTestId(`${key}-film`).hover(); await advancing(page, `${scenario}: muted hover ${key}`); }
      assert.equal(await page.evaluate(() => window.__ohfSound.state().gesture), false, 'hover alone never grants audio permission');
      await page.getByTestId('trend-mic-film').hover(); await page.getByTestId('trend-mic-film-sound').click();
      await advancing(page, `${scenario}: after explicit SoundToggle click`);
      for (const key of ['trend-dance', 'trend-mic']) {
        await page.getByTestId(`${key}-film`).hover(); await advancing(page, `${scenario}: activated hover ${key}`);
      }
      await page.locator('#xp-h-trending').hover(); await advancing(page, `${scenario}: after mouseleave`);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await page.waitForTimeout(250);
      await page.evaluate(() => document.querySelector('#xp-trending').scrollIntoView({ block: 'start', behavior: 'instant' }));
      await advancing(page, `${scenario}: scroll return`);
      if (scenario === 'policy-unmute-pause') {
        assert((await page.evaluate(() => window.__policyEvents)).length > 0, 'must exercise the policy-pause path');
        assert.equal(await page.evaluate(() => window.__ohfSound.state().gesture), false);
        await page.getByTestId('trend-mic-film').hover(); await page.waitForTimeout(1200);
        assert(await page.getByTestId('trend-mic-film-sound-label').isVisible());
        if (output) await page.screenshot({ path: path.join(output, 'policy-recovery-moving-muted.png') });
        // Recovery is bounded, not an endless play/unmute/reject loop.
        const events = await page.evaluate(() => window.__policyEvents.length); await page.waitForTimeout(500);
        assert.equal(await page.evaluate(() => window.__policyEvents.length), events);
      }
      if (scenario === 'fresh-hash') {
        await page.evaluate(() => document.querySelectorAll('#xp-trending video').forEach(v => { v.currentTime = v.duration - .25; }));
        await page.waitForTimeout(1100); const looped = await sample(page);
        assert(looped.every(v => !v.paused && v.time < 2), `all clips loop after their end: ${JSON.stringify(looped)}`);
        await page.getByTestId('trend-mic-film').hover(); await page.getByTestId('trend-mic-film-play').click();
        await page.locator('#xp-h-trending').hover(); await page.getByTestId('trend-mic-film').hover(); await page.waitForTimeout(300);
        assert(await page.getByTestId('trend-mic-film').locator('video').evaluate(v => v.paused), 'intentional Pause survives hover');
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await page.waitForTimeout(250);
        await page.evaluate(() => document.querySelector('#xp-trending').scrollIntoView({ block: 'start', behavior: 'instant' })); await page.waitForTimeout(400);
        assert(await page.getByTestId('trend-mic-film').locator('video').evaluate(v => v.paused), 'intentional Pause survives scroll return');
      }
      report.push({ scenario, events: await page.evaluate(() => window.__playbackEvents), injectedPolicy: await page.evaluate(() => window.__policyEvents) });
      await context.close(); console.log(`PASS ${scenario}: all clips advance before/after hover, activation, leave and scroll return`);
    }
    if (output) fs.writeFileSync(path.join(output, 'playback-report.json'), JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
