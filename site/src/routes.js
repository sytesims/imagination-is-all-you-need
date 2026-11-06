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

  /* a HEAD with a range is answered from the file itself (the asset server's HEAD has no body to measure) */
  const asked = request.method === 'HEAD' && request.headers.has('range') ? new Request(request.url, { method: 'GET', headers: request.headers }) : request;
  return withRanges(request, await assets.fetch(asked));
}

/**
 * Byte ranges for the static files: video and audio players (Safari above all) ask for `Range: bytes=…` and need a
 * 206 back to play and seek. When the asset server already answers 206, or the request has no single simple range,
 * the response goes out as it came; a whole-file 200 is cut down to the asked range here.
 */
export async function withRanges(request, res) {
  const range = request.headers.get('range');
  if (res.status !== 200 || (request.method !== 'GET' && request.method !== 'HEAD')) return res;
  const headers = new Headers(res.headers);
  headers.set('accept-ranges', 'bytes');
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m || (m[1] === '' && m[2] === '')) return new Response(res.body, { status: 200, headers });
  const head = request.method === 'HEAD';
  const body = await res.arrayBuffer();
  const size = body.byteLength;
  /* some asset servers send HEAD without a body even when asked by GET: then just say ranges work */
  if (head && size === 0) return new Response(null, { status: 200, headers });
  let start; let end;
  if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; } // the last n bytes
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) {
    headers.set('content-range', `bytes */${size}`); headers.delete('content-length');
    return new Response(null, { status: 416, headers });
  }
  headers.set('content-range', `bytes ${start}-${end}/${size}`);
  headers.set('content-length', String(end - start + 1));
  return new Response(head ? null : body.slice(start, end + 1), { status: 206, headers });
}
