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

/** Sample mode's own words, swapped in at build time (the normal build keeps the app's): the strip above the header says this is sample mode
 *  and links to the install steps (it replaces a separate banner, so no page grows taller), and a sample result says how to make it for real.
 *  Each swap must still find its text: a changed app line stops the build instead of silently keeping the old words. */
const SAMPLE_LINE = 'Sample mode: install the app to make this for real.';
const WORDS: { file: RegExp; from: string; to: string; all?: boolean }[] = [
  { file: /\/ui\/Shell\.tsx$/, from: '<span className="promo-text">If you can imagine it, you can make it here. Open source and yours to keep.</span>',
    to: '<span className="promo-text"><b>Sample mode.</b> Click through the real app: nothing is generated here. Install it to make your own.</span>' },
  { file: /\/ui\/Shell\.tsx$/, from: '<Link to={REPO_URL} className="promo-link" data-testid="promo-github">GitHub →</Link>',
    to: '<a href={location.origin + "/#install"} className="promo-link" data-testid="promo-install">Install the app →</a>' },
  { file: /\/ui\/Shell\.tsx$/, from: 'onClick={dismiss} data-testid="promo-dismiss"', to: 'onClick={dismiss} hidden data-testid="promo-dismiss"' },
  { file: /\/ui\/Shell\.tsx$/, from: "() => promoDismissed() ? 'gone' : 'open'", to: "() => 'open'" },
  { file: /\/shared\/(CostNote|ResultView|DemoPrice|GenPrice)\.tsx$|\/shared\/quote\.ts$|\/next\/ImageCanvas\.tsx$/, from: 'Sample output, nothing billed.', to: SAMPLE_LINE, all: true },
];
function tryWords(): Plugin {
  const seen = new Set<number>();
  return {
    name: 'try-words', enforce: 'pre',
    transform(code, id) {
      let out = code;
      WORDS.forEach((w, i) => { if (!w.file.test(id) || !out.includes(w.from)) return; seen.add(i); out = w.all ? out.split(w.from).join(w.to) : out.replace(w.from, w.to); });
      return out === code ? null : { code: out, map: null };
    },
    buildEnd(err) { if (err) return; const missing = WORDS.filter((_, i) => !seen.has(i)).map((w) => w.from.slice(0, 60)); if (missing.length) this.error(`try-words: the app no longer has: ${missing.join(' | ')}`); },
  };
}

export default defineConfig({
  base: '/try/',
  plugins: [tryWords(), tryPaths(), react()],
  publicDir: false, // the media the pages use is copied by scripts/try/build.mjs (only what the recorded pages load)
  worker: { format: 'es' },
  build: { rollupOptions: { input: 'try/index.html' }, emptyOutDir: true, chunkSizeWarningLimit: 4000 },
});
