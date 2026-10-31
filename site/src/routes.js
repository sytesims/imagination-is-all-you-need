// iiayn.app: the routes the Worker adds on top of the static site (kept apart so tests can import them).
// SPDX-License-Identifier: AGPL-3.0-or-later

export const SITE = 'https://iiayn.app';
export const REPO = 'https://github.com/sytesims/imagination-is-all-you-need';
const RAW = 'https://raw.githubusercontent.com/sytesims/imagination-is-all-you-need/main/scripts/';

/** The installer routes: the path on this site -> the script in the repo. */
export const SCRIPTS = { '/install': 'get.sh', '/install.ps1': 'get.ps1' };

/** Hosts that send visitors on to the main site with a 301. */
export const REDIRECT_HOSTS = new Set(['imaginationisallyouneed.com', 'www.imaginationisallyouneed.com', 'www.iiayn.app']);

const TEXT = 'text/plain; charset=utf-8';
const CACHE_SECONDS = 300;

/** Fetch one installer script from GitHub and hand it back as plain text (never HTML, even when GitHub fails). */
export async function serveScript(name, fetchImpl = fetch) {
  const source = RAW + name;
  try {
    const res = await fetchImpl(source, { cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true } });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const body = await res.text();
    if (!body.trim()) throw new Error('GitHub sent an empty file');
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': TEXT,
        'cache-control': `public, max-age=${CACHE_SECONDS}`,
        'x-content-type-options': 'nosniff',
        'access-control-allow-origin': '*',
      },
    });
  } catch (err) {
    return scriptError(name, err);
  }
}

/** A plain-text error that is safe to pipe into a shell: every line is a comment, then it exits non-zero. */
function scriptError(name, err) {
  const ps = name.endsWith('.ps1');
  const lines = [
    `Sorry, the installer (${name}) could not be fetched from GitHub just now.`,
    `Reason: ${err && err.message ? err.message : 'unknown'}`,
    'Please try again in a minute, or get it straight from GitHub:',
    `  ${REPO}/blob/main/scripts/${name}`,
  ];
  const body = ps
    ? lines.map((l) => `# ${l}`).join('\n') + `\nWrite-Error "Could not fetch the installer. See ${REPO}"\n`
    : lines.map((l) => `# ${l}`).join('\n') + `\necho "Could not fetch the installer. See ${REPO}" >&2\nexit 1\n`;
  return new Response(body, {
    status: 502,
    headers: { 'content-type': TEXT, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

/** Handle one request. `assets` serves the static site; `fetchImpl` is GitHub's fetch (tests pass a fake). */
export async function handle(request, assets, fetchImpl = fetch) {
  const url = new URL(request.url);

  if (REDIRECT_HOSTS.has(url.hostname)) {
    return Response.redirect(SITE + url.pathname + url.search, 301);
  }

  const script = SCRIPTS[url.pathname];
  if (script) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Use GET.\n', { status: 405, headers: { 'content-type': TEXT, allow: 'GET, HEAD' } });
    }
    const res = await serveScript(script, fetchImpl);
    return request.method === 'HEAD' ? new Response(null, res) : res;
  }

  return assets.fetch(request);
}
