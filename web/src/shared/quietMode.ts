/** Quiet mode for job prompts: the "Want a notification…" popover and the "Generation finished" toast.
 * - Each shows once at most per browser (permanent, localStorage).
 * - Settings can turn both off for good.
 * - The server's filming mode (/api/config notificationPrompts:false) hides both.
 * - ?demo=1 (screen recordings) hides both and stays on for the rest of the tab session; ?demo=0 turns it off. */
const DEMO = 'ohf:demoMode'; const OFF = 'ohf:jobPromptsOff';
export const ONCE_OPTIN = 'ohf:notifyAsked'; export const ONCE_DONE_TOAST = 'ohf:doneToastSeen';
const ls = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
(function readUrl() {
  try { const v = new URLSearchParams(location.search).get('demo'); if (v === '1' || v === 'true') sessionStorage.setItem(DEMO, '1'); else if (v === '0' || v === 'false') sessionStorage.removeItem(DEMO); } catch { /* ignore */ }
})();
/** Server filming mode: /api/config notificationPrompts:false hides the prompts too. */
let serverOff = false; let fallbackOff = false;
/** Server filming mode also sends fallbackOffers:false: no 'Use <other route>' offers when a route fails. */
try { fetch('/api/config').then(r => r.ok ? r.json() : null).then(c => { if (!c) return; /* Top-level flags first (their own server switches); the filming block only when a top-level flag is absent. */ const np = (c.notificationPrompts ?? c.filming?.notificationPrompts) === false; const fo = (c.fallbackOffers ?? c.filming?.fallbackOffers) === false; if (np || fo) { serverOff = np; fallbackOff = fo; window.dispatchEvent(new Event('ohf:quiet-changed')); } }).catch(() => 0); } catch { /* ignore */ }
export function fallbackOffersOff(): boolean { return fallbackOff; }
export function serverPromptsOff(): boolean { return serverOff; }
export function isDemoMode(): boolean { try { return sessionStorage.getItem(DEMO) === '1'; } catch { return false; } }
export function jobPromptsOff(): boolean { return ls(OFF) === '1'; }
export function setJobPromptsOff(off: boolean) { try { off ? localStorage.setItem(OFF, '1') : localStorage.removeItem(OFF); } catch { /* ignore */ } window.dispatchEvent(new Event('ohf:quiet-changed')); }
/** True when a one-time prompt (key) may still be shown. */
export function mayShowOnce(key: string): boolean { return !serverOff && !isDemoMode() && !jobPromptsOff() && ls(key) !== '1'; }
export function markShown(key: string) { try { localStorage.setItem(key, '1'); } catch { /* ignore */ } }
