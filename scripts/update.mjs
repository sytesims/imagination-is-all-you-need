#!/usr/bin/env node
// `npm run update`: brings a git install up to date, safely.
//   - Zip installs (no git): prints how to update by hand and stops.
//   - Refuses (and changes nothing) when tracked files have local changes, or when you're not on main (--force-branch to allow).
//   - git fetch + git pull --ff-only; reinstalls only when a lockfile changed; rebuilds mcp/dist only when the MCP code changed.
//   - Rebuilds the web app for npm start when it changed, unless the app is running (a running app is never disturbed: its next start rebuilds).
//   - Never touches server/data, .env.local or any other ignored file. No network calls except git and npm.
//   --check  only says whether an update is available (fetch + compare); changes nothing.
// Node only, no shell commands, so it runs the same on Windows, macOS and Linux.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** The same address as server/src/shared/projectLinks.ts GET_APP_URL. */
const RELEASES = 'https://github.com/sytesims/imagination-is-all-you-need/releases';
const args = process.argv.slice(2); const has = (f) => args.includes(f);
if (has('--help') || has('-h')) { console.log('npm run update [-- --check] [--force-branch]\n  --check         only say whether an update is available (changes nothing)\n  --force-branch  update the current branch even if it isn\'t main'); process.exit(0); }
const checkOnly = has('--check'); const forceBranch = has('--force-branch');
const WIN = process.platform === 'win32'; const NPM = WIN ? 'npm.cmd' : 'npm';
const START = WIN ? 'npm.cmd run setup' : 'npm run setup';
const MAX_NEWS = 15;
const say = (s = '') => console.log(s);
const stop = (s, code = 1) => { console.log(s); process.exit(code); };

/** git in the app folder; never through a shell, so paths with spaces are fine. */
const git = (...a) => { const r = spawnSync('git', a, { cwd: REPO, encoding: 'utf8' }); return { ok: r.status === 0, out: (r.stdout ?? '').trimEnd(), err: (r.stderr ?? '').trim() || String(r.error?.message ?? '') }; };
const versionIn = (json) => { try { return JSON.parse(json).version || ''; } catch { return ''; } };
const versionAt = (rev) => versionIn(git('show', `${rev}:package.json`).out) || git('describe', '--tags', '--abbrev=0', rev).out.replace(/^v/, '') || 'unknown';

// 1. a zip install (or git missing): update by hand
const top = git('rev-parse', '--show-toplevel');
const same = (a, b) => (WIN ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b));
if (!top.ok || !same(top.out, REPO)) {
  const why = spawnSync('git', ['--version']).status === 0 ? 'This folder isn’t a git copy of the app (it was probably downloaded as a zip),' : 'Git isn’t installed on this computer,';
  stop([`${why} so it can’t update itself. To update by hand:`, '',
    `  1. Download the latest release: ${RELEASES}`,
    '  2. Unzip it next to this folder.',
    '  3. Copy these from this folder into the new one, so you keep your work and keys:',
    `       server${path.sep}data   (your library, boards and settings)`,
    '       .env.local    (your keys, if you saved any here)',
    `  4. In the new folder, run: ${START}`, '',
    'Tip: an install made with git clone updates with one command (npm run update).'].join('\n'), 0);
}

// 2. local changes to tracked files: never discard them
const dirty = git('status', '--porcelain', '--untracked-files=no');
if (!dirty.ok) stop(`Couldn’t read the git status:\n${dirty.err}`);
/* npm can rewrite a lockfile by itself (npm install); that's not the user's work, so put it back before pulling */
const LOCKS = ['package-lock.json', 'mcp/package-lock.json'];
const edited = dirty.out ? dirty.out.split('\n').map((l) => l.slice(3)).filter(Boolean) : [];
const locksOnly = edited.filter((f) => LOCKS.includes(f));
if (edited.length > locksOnly.length) {
  const files = edited.filter((f) => !LOCKS.includes(f));
  stop(['You have changes to the app’s own files, so nothing was updated:', ...files.slice(0, 20).map((f) => `  ${f}`), ...(files.length > 20 ? [`  …and ${files.length - 20} more`] : []), '',
    'Keep them and try again:',
    '  git stash          (put them aside; git stash pop brings them back)',
    '  git commit -am "My changes"   (or save them as a commit)',
    'Your library (server/data) and keys (.env.local) don’t count: they’re never touched.'].join('\n'));
}
if (locksOnly.length && !checkOnly) {
  if (!git('checkout', '--', ...locksOnly).ok) stop(`Couldn’t put ${locksOnly.join(' and ')} back the way GitHub has it.`);
  console.log(`Put ${locksOnly.join(' and ')} back the way GitHub has it (npm had edited ${locksOnly.length === 1 ? 'it' : 'them'}; nothing of yours).`);
}

// 3. the branch: main, unless --force-branch
const branch = git('rev-parse', '--abbrev-ref', 'HEAD').out;
if (branch !== 'main' && !forceBranch) {
  stop([branch === 'HEAD' ? 'You’re not on a branch right now (a detached HEAD), so nothing was updated.' : `You’re on the branch “${branch}”, not main, so nothing was updated.`,
    'Switch to main and try again:', '  git switch main', '  npm run update',
    'Or update this branch anyway: npm run update -- --force-branch'].join('\n'));
}
const up = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}');
if (!up.ok) stop(`The branch “${branch}” doesn’t follow a branch on GitHub, so there’s nothing to update from.\nSet it with: git branch --set-upstream-to=origin/main`);

// 4. fetch and compare
say(`Checking for updates (git fetch)…`);
const f = git('fetch', '--quiet');
if (!f.ok) stop(`Couldn’t reach GitHub, so nothing was updated:\n${f.err}\nCheck your internet connection and try again.`);
const oldHead = git('rev-parse', 'HEAD').out; const oldVersion = versionAt('HEAD');
const behind = Number(git('rev-list', '--count', `HEAD..${up.out}`).out) || 0;
if (!behind) stop(`You’re up to date (version ${oldVersion}).`, 0);
if (!git('merge-base', '--is-ancestor', 'HEAD', up.out).ok) {
  stop([`An update is available, but your ${branch} has commits of its own that aren’t on GitHub, so nothing was updated.`,
    'Keep your commits on a branch of their own, then put main back in line with GitHub:',
    '  git branch my-changes', `  git reset --keep ${up.out}`,
    'Your library (server/data) and keys (.env.local) aren’t affected by these commands.'].join('\n'));
}
const newVersionThere = versionAt(up.out);
if (checkOnly) stop(`An update is available: version ${oldVersion} → ${newVersionThere} (${behind} new change${behind === 1 ? '' : 's'}).\nRun npm run update to get it.`, 0);

// 5. update (fast-forward only: never a merge, never a reset)
say('Updating (git pull --ff-only)…');
const pull = git('pull', '--ff-only', '--quiet');
if (!pull.ok) stop(`The update didn’t go through, and nothing was changed:\n${pull.err}\nIf git names files that would be overwritten, move them out of the way and run npm run update again.`);
const newHead = git('rev-parse', 'HEAD').out; const newVersion = versionAt('HEAD');
const changed = new Set(git('diff', '--name-only', oldHead, newHead).out.split('\n').filter(Boolean));

// 6. installs: only when a lockfile changed; mcp/dist only when the MCP code changed (it isn't in git)
const rootDeps = changed.has('package-lock.json');
const mcpDeps = changed.has('mcp/package-lock.json');
const mcpCode = [...changed].some((p) => p.startsWith('mcp/src/') || p === 'mcp/tsconfig.json') || mcpDeps;
const steps = [
  ...(rootDeps ? [{ label: 'Installing the app’s new dependencies (npm ci)…', cwd: REPO, args: ['ci', '--no-audit', '--no-fund'] }] : []),
  /* the root npm ci already installs mcp/ (scripts/install-mcp.mjs) */
  ...(mcpDeps && !rootDeps ? [{ label: 'Installing the MCP server’s new dependencies…', cwd: path.join(REPO, 'mcp'), args: ['ci', '--no-audit', '--no-fund'] }] : []),
  /* only when you built it before: npm run dev runs the MCP server from source */
  ...(mcpCode && fs.existsSync(path.join(REPO, 'mcp', 'dist')) ? [{ label: 'Rebuilding the MCP server (npm run mcp:build)…', cwd: REPO, args: ['run', 'mcp:build'] }] : []),
];
for (const s of steps) {
  if (process.env.OPENHIGGSFIELD_UPDATE_SKIP_INSTALL === '1') { say(`${s.label} skipped (OPENHIGGSFIELD_UPDATE_SKIP_INSTALL=1)`); continue; }
  say(s.label);
  const r = spawnSync(NPM, s.args, { cwd: s.cwd, stdio: 'inherit', shell: WIN });
  if (r.status !== 0) stop(`\nThe new code is in place, but “npm ${s.args.join(' ')}” failed. Fix the error above, then run it again in ${s.cwd}.\nIf a file is in use, stop the app first (Ctrl+C in its terminal).`);
}

// 7. the web app npm start serves: build it now so the next start is quick; never under a running app (its open tabs still use
// the old files), which rebuilds by itself on its next start
if (process.env.OPENHIGGSFIELD_UPDATE_SKIP_INSTALL !== '1') {
  const { ensureWebBuild, webBuildReason } = await import('./web-build.mjs'); const { apiUp } = await import('./app-env.mjs');
  if (!webBuildReason()) { /* up to date */ } else if (await apiUp()) say('The app is running, so the web app isn’t rebuilt now: its next start rebuilds it (a minute or two).');
  else if (!ensureWebBuild()) say('The web build didn’t finish; the next start tries again.');
}

// 8. what's new: one line per change on main (a merged pull request's title rather than "Merge pull request …")
const log = git('log', '--first-parent', '--format=%s%x1f%b%x1e', `${oldHead}..${newHead}`).out.split('\x1e').map((e) => e.trim()).filter(Boolean)
  .map((e) => { const [s, b = ''] = e.split('\x1f'); return /^Merge (pull request|branch)/.test(s) && b.trim() ? b.trim().split('\n')[0] : s; });
say();
say(newVersion === oldVersion ? `Updated: version ${newVersion} (${log.length} new change${log.length === 1 ? '' : 's'}).` : `Updated: version ${oldVersion} → ${newVersion}.`);
say(); say('What’s new:');
for (const l of log.slice(0, MAX_NEWS)) say(`  • ${l}`);
if (log.length > MAX_NEWS) say(`  …and ${log.length - MAX_NEWS} more`);
say(); say(`Release notes: ${RELEASES}`);
say(); say(`Restart the app to use the new version: stop it with Ctrl+C, then run ${START}.`);
