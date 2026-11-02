// Try it (try.iiayn.app): the same app as vite.config.ts, built with VITE_SAMPLE_SITE=1 (src/shared/sampleSite.ts says what changes) and
// started by try/boot.ts, which waits for the service worker (try/sw.js) that answers the app's server requests in the browser.
// Built by scripts/try/build.mjs (npm run try:build); the normal build is untouched.
// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig, mergeConfig, type Plugin } from 'vite';
import base from './vite.config';

process.env.VITE_SAMPLE_SITE = '1';

/** index.html starts try/boot.ts instead of src/main.tsx, and asks search engines to skip the page. */
function sampleEntry(): Plugin {
  return { name: 'sample-entry', transformIndexHtml: { order: 'pre', handler(html) {
    if (!html.includes('/src/main.tsx')) throw new Error('vite.try.config: index.html no longer starts /src/main.tsx');
    return html.replace('/src/main.tsx', '/try/boot.ts').replace('</head>', '<meta name="robots" content="noindex" />\n</head>');
  } } };
}

export default mergeConfig(base, defineConfig({
  plugins: [sampleEntry()],
  // _app/: the app's own /assets page must not meet a folder of built files
  build: { assetsDir: '_app', emptyOutDir: true, chunkSizeWarningLimit: 4000 },
}));
