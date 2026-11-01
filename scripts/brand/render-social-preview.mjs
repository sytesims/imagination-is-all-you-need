#!/usr/bin/env node
// Renders scripts/brand/social-preview.html into the two link preview images:
//   brand/social/github-social-preview.png   1280 x 640 PNG  (GitHub allows up to 1 MB)
//   site/public/brand/social-preview.jpg     1200 x 630 JPG  (og:image / X card, keep under 300 KB)
//
//   PLAYWRIGHT_DIR=<folder with node_modules/playwright> node scripts/brand/render-social-preview.mjs
//
// Playwright is not a repo dependency: install it in a scratch folder (npm i playwright && npx playwright install chromium).
// The page loads Inter and JetBrains Mono (OFL) from Google Fonts, so it needs a network connection.
// Screenshots carry no EXIF or other camera metadata.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const base = process.env.PLAYWRIGHT_DIR ? path.join(path.resolve(process.env.PLAYWRIGHT_DIR), 'x.js') : import.meta.url;
const { chromium } = createRequire(base)('playwright');

const outputs = [
  { file: 'brand/social/github-social-preview.png', width: 1280, height: 640, type: 'png', max: 1_000_000 },
  { file: 'site/public/brand/social-preview.jpg', width: 1200, height: 630, type: 'jpeg', quality: 86, max: 300_000 },
];

const browser = await chromium.launch({ args: ['--use-mock-keychain', '--password-store=basic', '--allow-file-access-from-files'] });
try {
  for (const o of outputs) {
    const page = await browser.newPage({ viewport: { width: o.width, height: o.height }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.join(here, 'social-preview.html')).href, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const dest = path.join(repo, o.file);
    await page.screenshot({ path: dest, type: o.type, ...(o.quality ? { quality: o.quality } : {}) });
    await page.close();
    const size = fs.statSync(dest).size;
    console.log(`${o.file}  ${o.width}x${o.height}  ${(size / 1024).toFixed(0)} KB${size > o.max ? '  TOO BIG' : ''}`);
    if (size > o.max) process.exitCode = 1;
  }
} finally {
  await browser.close();
}
