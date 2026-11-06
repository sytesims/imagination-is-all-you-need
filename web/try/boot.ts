// Try it (try.iiayn.app): starts the real app once its server, answered inside the browser by the service worker (try/sw.js), answers this
// page. Built only by web/vite.try.config.ts, which points index.html here instead of src/main.tsx.
// SPDX-License-Identifier: AGPL-3.0-or-later
import { INSTALL_URL } from '../src/shared/sampleSite';

/** A plain note on the app's dark page (the app's styles have not loaded yet), with the install link. */
const say = (msg: string) => { document.body.style.cssText = 'margin:0;background:#0b0b0c;min-height:100vh';
  document.getElementById('root')!.innerHTML = `<p style="font:16px/1.55 system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 16px;color:#ececec">${msg} <a style="color:#ff7a1a" href="${INSTALL_URL}">install the app</a> to make your own.</p>`; };
const BLOCKED = 'Sample mode needs service workers, and this window blocks them (a private window often does). Open this page in a normal window, or';

async function start() {
  if (!('serviceWorker' in navigator)) { say(BLOCKED); return; }
  const sw = navigator.serviceWorker;
  // a window that blocks service workers either refuses the registration or never answers it: both get the same plain note
  const ok = await Promise.race([sw.register('/sw.js', { scope: '/' }).then(() => true, () => false), new Promise<boolean>(res => setTimeout(() => res(false), 8000))]);
  if (!ok) { say(BLOCKED); return; }
  if (!sw.controller) {
    // first visit: the worker takes this page over as soon as it is active; a hard reload skips it, so one normal reload fixes that
    const took = await Promise.race([new Promise<boolean>(res => sw.addEventListener('controllerchange', () => res(true), { once: true })), new Promise<boolean>(res => setTimeout(() => res(false), 5000))]);
    if (!took && !sw.controller) { let again = false; try { again = sessionStorage.getItem('try-reload') === '1'; sessionStorage.setItem('try-reload', '1'); } catch { /* no storage */ }
      if (!again) { location.reload(); return; } say(BLOCKED); return; }
  }
  try { sessionStorage.removeItem('try-reload'); } catch { /* no storage */ }
  await import('../src/main');
}
start().catch(() => say('Sample mode could not start in this window. Try a reload, or'));
