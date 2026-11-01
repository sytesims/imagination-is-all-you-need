// Try it (sample mode) at iiayn.app/try/: starts the real app with its server answered inside the browser (try/sw.js).
// 1. registers the service worker and waits until it answers this page; 2. keeps the app's own paths (/video, /assets…) under
// /try/ in the address bar (the app reads them through __tryPath, see vite.try.config.ts); 3. shows the sample-mode banner; 4. starts the app.
// SPDX-License-Identifier: AGPL-3.0-or-later
const BASE = import.meta.env.BASE_URL; // '/try/'
const ROOT = BASE.replace(/\/$/, ''); // '/try'
/** Requests the service worker answers: never given the /try prefix. */
const SERVER_PATHS = /^\/(api|files|samples|s|examples|showcase|fonts)\/|\.[a-z0-9]{2,5}$/i;
const INSTALL = '/#install';

const strip = (p: string) => (p === ROOT || p === BASE ? '/' : p.startsWith(BASE) ? p.slice(ROOT.length) : p);
/** An app URL → the same URL under /try/ (same-origin page paths only). */
function under(u: string | URL): string | URL {
  try {
    const url = new URL(String(u), location.href); if (url.origin !== location.origin) return u;
    if (url.pathname === ROOT || url.pathname.startsWith(BASE) || SERVER_PATHS.test(url.pathname)) return u;
    url.pathname = ROOT + url.pathname; return url.pathname + url.search + url.hash;
  } catch { return u; }
}
const w = window as any;
w.__tryPath = () => strip(location.pathname);
w.__tryHref = () => location.origin + strip(location.pathname) + location.search + location.hash;
w.__tryAssign = (u: string) => location.assign(String(under(u)));
for (const k of ['pushState', 'replaceState'] as const) {
  const orig = History.prototype[k];
  History.prototype[k] = function (this: History, state: unknown, title: string, url?: string | URL | null) { return orig.call(this, state, title, url == null ? url : under(url)); };
}
/* plain links (<a href="/assets">) and new tabs: the same path under /try/ */
const fixLink = (e: Event) => { const a = (e.target as Element | null)?.closest?.('a[href^="/"]') as HTMLAnchorElement | null; if (!a) return;
  const h = a.getAttribute('href')!; const to = String(under(h)); if (to !== h) a.setAttribute('href', to); };
for (const ev of ['click', 'auxclick', 'contextmenu', 'mouseover', 'focusin']) document.addEventListener(ev, fixLink, true);

function banner() {
  const b = document.createElement('div'); b.className = 'try-banner'; b.setAttribute('role', 'note'); b.dataset.testid = 'try-banner';
  b.innerHTML = '<strong>Sample mode</strong> <span>Nothing is generated.</span><span class="try-long"> Install the app to make your own.</span> <a href="' + INSTALL + '">Install the app</a>';
  const s = document.createElement('style');
  s.textContent = `.try-banner{position:sticky;top:0;z-index:2147483000;display:flex;gap:.5em;align-items:center;justify-content:center;flex-wrap:wrap;padding:7px 16px;
    background:#16181b;color:#e8e8e8;font:500 13px/1.35 Inter,system-ui,sans-serif;border-bottom:1px solid #2a2d31;text-align:center}
  .try-banner strong{color:#ff7a1a;font-weight:600}@media (max-width:600px){.try-banner{font-size:12px;padding:6px 16px;flex-wrap:nowrap}.try-long{display:none}}.try-banner a{color:#ff7a1a;font-weight:600;text-decoration:underline;text-underline-offset:2px}`;
  document.head.append(s); document.body.prepend(b);
}

async function start() {
  banner();
  if (!('serviceWorker' in navigator)) { document.getElementById('root')!.innerHTML = '<p class="try-msg">Sample mode needs a browser that allows service workers (a private window may block them). <a href="' + INSTALL + '">Install the app</a> instead.</p>'; return; }
  await navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE });
  if (!navigator.serviceWorker.controller) await new Promise<void>(res => navigator.serviceWorker.addEventListener('controllerchange', () => res(), { once: true }));
  const fonts = document.createElement('link'); fonts.rel = 'stylesheet'; fonts.href = '/fonts/fonts.css'; document.head.append(fonts);
  await import('../src/main');
}
start().catch((e) => { document.getElementById('root')!.innerHTML = '<p class="try-msg">Sample mode could not start (' + String(e?.message ?? e) + '). <a href="' + INSTALL + '">Install the app</a> instead.</p>'; });
