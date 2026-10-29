/* Read-only, single-browser QA. Use an already-installed Playwright:
   PLAYWRIGHT_MODULE=/path/to/playwright QA_OUTPUT=/scratch/path node scripts/qa/trend-hover-sound.cjs
   QA_URL defaults to the isolated review preview; no API mutations are allowed. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.QA_OUTPUT;
if (output) fs.mkdirSync(output, { recursive: true });
const keys = ['trend-mic', 'trend-dance'];
const report = [];
const state = page => page.evaluate(() => ({
  director: window.__ohfSound.state(),
  videos: [...document.querySelectorAll('video')].map(v => ({
    testId: v.closest('[data-testid]')?.getAttribute('data-testid'),
    src: v.getAttribute('src'), muted: v.muted, volume: v.volume, paused: v.paused,
  })),
}));
const audible = s => s.videos.filter(v => !v.muted && v.volume > .001 && !v.paused);
async function expectFilm(page, key, name) {
  await page.waitForTimeout(750);
  const s = await state(page); const sounding = audible(s);
  assert.equal(sounding.length, 1, `${name}: exactly one audible element`);
  assert.equal(sounding[0].testId, `${key}-film`, name);
  report.push({ name, ...s });
}
async function open(browser, options = {}, muted = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  // Playwright's injected evaluations can set Chromium's hasBeenActive before React
  // mounts. Exercise the director's fresh-page gate deterministically; real click/key
  // events below still unlock it through the production capture listeners.
  await context.addInitScript(() => Object.defineProperty(navigator.userActivation, 'hasBeenActive', { get: () => false }));
  if (muted) await context.addInitScript(() => localStorage.setItem('ohf.explore.sound', '0'));
  const page = await context.newPage(); page.setDefaultTimeout(6000);
  await page.route('**/api/**', r => ['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()) ? r.continue() : r.abort());
  await page.goto(process.env.QA_URL || 'http://localhost:5279/#xp-trending');
  await page.locator('#xp-trending').waitFor(); await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('#xp-trending').scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.waitForTimeout(500);
  return { context, page };
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page } = await open(browser);
    assert.deepEqual(await page.locator('#xp-trending .xpt-card').evaluateAll(cards => cards.map(card => card.getAttribute('aria-label').split(':')[0])), ['Object / Person Swap', 'Object / Person Swap'], 'each retained showcase names its actual workflow');
    await page.getByTestId('trend-dance-film').hover(); await page.waitForTimeout(1200);
    let s = await state(page);
    assert.equal(s.director.gesture, false); assert.equal(audible(s).length, 0);
    assert(await page.getByTestId('trend-dance-film-sound-label').isVisible());
    assert.equal(await page.getByTestId('trend-dance-film-sound-label').evaluate(el => getComputedStyle(el).opacity), '1');
    report.push({ name: 'fresh hover stays muted with Click for sound', ...s });
    if (output) await page.screenshot({ path: path.join(output, 'before-activation.png') });
    // Count actual audible elements on every frame, including the handoff, not only at rest.
    await page.evaluate(() => {
      window.__audioOverlap = [];
      const sample = () => {
        const live = [...document.querySelectorAll('video')].filter(v => !v.muted && v.volume > .001 && !v.paused);
        if (live.length > 1) window.__audioOverlap.push(live.map(v => ({ src: v.getAttribute('src'), volume: v.volume })));
        window.__audioRaf = requestAnimationFrame(sample);
      }; sample();
    });
    // A trusted gesture outside the sound button unlocks the hovered video.
    await page.locator('#xp-h-trending').click();
    for (const key of keys) { await page.getByTestId(`${key}-film`).hover(); await expectFilm(page, key, `activated hover ${key}`); }
    if (output) await page.screenshot({ path: path.join(output, 'hover-dance.png') });
    await page.getByTestId('trend-dance-film-seek').click(); await page.locator('#xp-h-trending').hover();
    assert.equal((await state(page)).director.attention, null, 'mouse-clicked range focus must not pin sound after pointer leaves');
    for (let i = 0; i < 3; i++) for (const key of keys) {
      const r = await page.getByTestId(`${key}-film`).boundingBox();
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(25);
    }
    await expectFilm(page, 'trend-dance', 'rapid A/B handoff');
    await page.getByTestId('trend-dance-film-sound').click();
    for (const key of keys) {
      await page.getByTestId(`${key}-film`).hover(); await page.waitForTimeout(250);
      s = await state(page); assert.equal(s.director.on, false); assert.equal(audible(s).length, 0);
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('ohf.explore.sound')), '0');
    report.push({ name: 'explicit mute survives every hover', ...s });
    await page.getByTestId('trend-dance-film-sound').click();
    await page.locator('#xp-h-trending').hover();
    await page.keyboard.press('Tab'); await page.getByTestId('trend-dance-film-seek').focus();
    await expectFilm(page, 'trend-dance', 'keyboard control focus');
    await page.locator('.xpt-rail').focus(); await page.waitForTimeout(500);
    assert.equal((await state(page)).director.attention, null);
    await page.getByTestId('trend-mic-original').click(); await page.waitForTimeout(500);
    await page.getByTestId('trend-dance-film').hover();
    await expectFilm(page, 'trend-dance', 'hover overrides another trend comparison explicit-play preference');
    await page.getByTestId('trend-dance-film-play').click(); await page.locator('#xp-h-trending').hover();
    await page.getByTestId('trend-dance-film').hover(); await page.waitForTimeout(500);
    assert(await page.getByTestId('trend-dance-film').locator('video').evaluate(v => v.paused), 'hover must not undo Pause');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await page.waitForTimeout(1000);
    s = await state(page);
    assert.equal(s.director.attention, null);
    assert(audible(s).every(v => !keys.some(key => v.testId === `${key}-film`)));
    report.push({ name: 'offscreen trend releases to page selection', ...s });
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(audible(await state(page)).length, 0);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.evaluate(() => document.querySelector('#xp-trending').scrollIntoView({ block: 'start', behavior: 'instant' }));
    await page.getByTestId('trend-dance-film').hover(); await expectFilm(page, 'trend-dance', 'return to visible group');
    await page.evaluate(() => { window.__detachedTrends = [...document.querySelectorAll('#xp-trending video')]; });
    await page.getByTestId('trend-mic-film').hover();
    await page.evaluate(() => document.querySelector('a[href="/licenses"]').click());
    await page.waitForTimeout(700);
    assert.equal((await state(page)).director.attention, null);
    assert(await page.evaluate(() => window.__detachedTrends.every(v => v.muted)), 'unmount during a pending handoff cannot unmute detached media');
    assert.deepEqual(await page.evaluate(() => window.__audioOverlap), [], 'no overlapping audible elements during any handoff');
    await context.close();

    const persisted = await open(browser, {}, true);
    await persisted.page.getByTestId('trend-dance-film').hover(); await persisted.page.locator('#xp-h-trending').click();
    await persisted.page.getByTestId('trend-dance-film').hover(); await persisted.page.waitForTimeout(650);
    s = await state(persisted.page); assert.equal(s.director.on, false); assert.equal(audible(s).length, 0);
    report.push({ name: 'saved page mute survives activation and hover', ...s }); await persisted.context.close();

    const touch = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true });
    await touch.page.getByTestId('trend-mic-film').hover(); await touch.page.waitForTimeout(400);
    s = await state(touch.page); assert.equal(s.director.attention, null); assert.equal(s.director.gesture, false);
    await touch.page.getByRole('button', { name: 'Next remix', exact: true }).tap(); await touch.page.waitForTimeout(800);
    s = await state(touch.page); assert.equal(s.director.attention, null);
    assert(audible(s).every(v => v.testId !== 'trend-mic-film'));
    report.push({ name: 'touch uses existing scroll selection without hover intent', ...s }); await touch.context.close();

    const reduced = await open(browser, { reducedMotion: 'reduce' });
    await reduced.page.getByTestId('trend-mic-film').hover(); await reduced.page.keyboard.press('Shift');
    assert.equal(await reduced.page.locator('#xp-trending video').count(), 0);
    assert.equal((await state(reduced.page)).director.attention, null);
    await reduced.page.getByTestId('trend-mic-film-play').click(); await reduced.page.waitForTimeout(500);
    await reduced.page.getByTestId('trend-dance-film').hover();
    assert.equal(await reduced.page.getByTestId('trend-dance-film').locator('video').count(), 0);
    report.push({ name: 'reduced motion posters never start from hover', ...await state(reduced.page) });
    await reduced.context.close();
    console.log('PASS: blocked state, A/B + rapid handoff, actual DOM audio exclusivity, mute, keyboard, comparison, offscreen, hidden, touch, reduced motion');
    if (output) fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
