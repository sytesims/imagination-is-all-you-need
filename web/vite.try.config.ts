// Try it (sample mode): the same app, built to run under iiayn.app/try/ with no server (web/try/, scripts/try/build.mjs).
// One change to the app's code, made here at build time only: it reads its own path through window.__tryPath() (web/try/boot.ts),
// so /try/video is the app's /video. The normal build (vite.config.ts) is untouched.
// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** location.pathname → __tryPath(), location.href reads → __tryHref(), location.assign → __tryAssign (web/src and the shared server code). */
function tryPaths(): Plugin {
  return {
    name: 'try-paths', enforce: 'pre',
    transform(code, id) {
      if (!/\.(tsx?|jsx?)$/.test(id) || id.includes('node_modules') || id.includes('/web/try/')) return null;
      if (!/location\.(pathname|href|assign)|= location\)/.test(code)) return null;
      const out = code
        .replace(/(?<![\w.$])(?:window\.)?location\.pathname\b(?!\s*=[^=])/g, '__tryPath()')
        .replace(/(?<![\w.$])(?:window\.)?location\.href\b(?!\s*=[^=])/g, '__tryHref()')
        .replace(/(?<![\w.$])(?:window\.)?location\.assign\(/g, '__tryAssign(')
        .replace(/= location\)/g, '= { pathname: __tryPath(), search: location.search })');
      return out === code ? null : { code: out, map: null };
    },
  };
}

export default defineConfig({
  base: '/try/',
  plugins: [tryPaths(), react()],
  publicDir: false, // the media the pages use is copied by scripts/try/build.mjs (only what the recorded pages load)
  worker: { format: 'es' },
  build: { rollupOptions: { input: 'try/index.html' }, emptyOutDir: true, chunkSizeWarningLimit: 4000 },
});
