// Try it (try.iiayn.app): starts the real app once its server, answered inside the browser by the service worker (try/sw.js), answers this
// page. Built only by web/vite.try.config.ts, which points index.html here instead of src/main.tsx.
// SPDX-License-Identifier: AGPL-3.0-or-later
import { INSTALL_URL } from '../src/shared/sampleSite';

const say = (msg: string) => { document.getElementById('root')!.innerHTML = `<p style="font:15px/1.5 system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 16px;color:#e8e8e8">${msg} <a style="color:#ff7a1a" href="${INSTALL_URL}">Install the app</a> instead.</p>`; };

async function start() {
  if (!('serviceWorker' in navigator)) { say('Sample mode needs a browser that allows service workers (a private window may block them).'); return; }
  const sw = navigator.serviceWorker;
  await sw.register('/sw.js', { scope: '/' });
  if (!sw.controller) {
    // first visit: the worker takes this page over as soon as it is active; a hard reload skips it, so one normal reload fixes that
    const took = await Promise.race([new Promise<boolean>(res => sw.addEventListener('controllerchange', () => res(true), { once: true })), new Promise<boolean>(res => setTimeout(() => res(false), 5000))]);
    if (!took && !sw.controller) { let again = false; try { again = sessionStorage.getItem('try-reload') === '1'; sessionStorage.setItem('try-reload', '1'); } catch { /* no storage */ }
      if (!again) { location.reload(); return; } say('Sample mode could not start in this window.'); return; }
  }
  try { sessionStorage.removeItem('try-reload'); } catch { /* no storage */ }
  await import('../src/main');
}
start().catch((e) => say(`Sample mode could not start (${String(e?.message ?? e)}).`));
