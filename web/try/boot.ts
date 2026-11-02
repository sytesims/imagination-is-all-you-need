// Try it (sample mode) at iiayn.app/try/: starts the real app with its server answered inside the browser (try/sw.js).
// 1. registers the service worker and waits until it answers this page; 2. keeps the app's own paths (/video, /assets…) under
// /try/ in the address bar (the app reads them through __tryPath, see vite.try.config.ts); 3. starts the app (sample mode's own words, in the strip above the header, come from vite.try.config.ts).
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

async function start() {
  if (!('serviceWorker' in navigator)) { document.getElementById('root')!.innerHTML = '<p class="try-msg">Sample mode needs a browser that allows service workers (a private window may block them). <a href="' + INSTALL + '">Install the app</a> instead.</p>'; return; }
  await navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE });
  if (!navigator.serviceWorker.controller) await new Promise<void>(res => navigator.serviceWorker.addEventListener('controllerchange', () => res(), { once: true }));
  const fonts = document.createElement('link'); fonts.rel = 'stylesheet'; fonts.href = '/fonts/fonts.css'; document.head.append(fonts);
  await import('../src/main');
}
start().catch((e) => { document.getElementById('root')!.innerHTML = '<p class="try-msg">Sample mode could not start (' + String(e?.message ?? e) + '). <a href="' + INSTALL + '">Install the app</a> instead.</p>'; });
