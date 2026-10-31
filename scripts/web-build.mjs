#!/usr/bin/env node
// The built web app (web/dist) for `npm start`: built only when its sources changed since the last build.
//   node scripts/web-build.mjs           build when needed (prints why), else says it's up to date
//   node scripts/web-build.mjs --check   only say whether a build is needed (exit 0 = up to date, 1 = needed)
// The stamp is the newest modification time of the web's sources (files and folders, so a deleted file counts too) against the
// time the last good build started (web/dist/.build-stamp). git pull, npm run update, a branch switch or an edit all touch
// mtimes, so the next start rebuilds by itself. Node only (no shell tools), so it runs the same on Windows, macOS and Linux.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** What the web build reads: web/ itself plus what it imports from outside it (keep in step with web/src's ../../server and docs imports). */
export const WEB_INPUTS = ['web', 'server/src/shared', 'docs/USAGE-NOTES.md', 'package-lock.json'];
const SKIP = new Set(['node_modules', 'dist', '.vite']);
const STAMP = 'web/dist/.build-stamp';

/** Newest mtime (ms) of a file or folder tree, skipping node_modules and build output. Missing paths count as 0.
 *  self=false leaves out the folder's own mtime (web/ itself changes when the build creates web/dist). */
export function newestMtime(p, self = true) {
  let st; try { st = fs.statSync(p); } catch { return 0; }
  if (!st.isDirectory()) return st.mtimeMs;
  let max = self ? st.mtimeMs : 0;
  for (const e of fs.readdirSync(p)) if (!SKIP.has(e)) max = Math.max(max, newestMtime(path.join(p, e)));
  return max;
}

/** Why the web app needs a build ('missing' | 'changed'), or '' when web/dist is up to date. */
export function webBuildReason(repo = REPO) {
  if (!fs.existsSync(path.join(repo, 'web/dist/index.html'))) return 'missing';
  let builtFrom = 0; try { builtFrom = Number(fs.readFileSync(path.join(repo, STAMP), 'utf8').trim()) || 0; } catch { /* no stamp (an older build): rebuild */ }
  const newest = Math.max(...WEB_INPUTS.map((p) => newestMtime(path.join(repo, p), p !== 'web')));
  return newest > builtFrom ? 'changed' : '';
}

/** Builds web/dist with vite when needed. Returns true when it is ready (built now or already up to date). */
export function ensureWebBuild({ repo = REPO, log = console.log } = {}) {
  const why = webBuildReason(repo);
  if (!why) { log('Web app is up to date (no changes since the last build).'); return true; }
  log(why === 'missing' ? 'Building the web app for the first time. This takes a minute or two; later starts skip it…' : 'The app changed since the last build: rebuilding the web app (about a minute)…');
  const started = Date.now();
  const vite = path.join(path.dirname(createRequire(path.join(repo, 'web/package.json')).resolve('vite/package.json')), 'bin', 'vite.js');
  const r = spawnSync(process.execPath, [vite, 'build', '--logLevel', 'error'], { cwd: path.join(repo, 'web'), stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });
  if (r.status !== 0) { log('The web build failed: see the lines above.'); return false; }
  fs.writeFileSync(path.join(repo, STAMP), `${started}\n`); // the start time: a file edited during the build still counts as newer
  log(`Web app built in ${Math.round((Date.now() - started) / 1000)} s.`);
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) { const why = webBuildReason(); console.log(why ? `A web build is needed (${why}).` : 'Web app is up to date.'); process.exit(why ? 1 : 0); }
  process.exit(ensureWebBuild() ? 0 : 1);
}
