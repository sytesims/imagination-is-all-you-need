/**
 * Coming back to the same place (2026-10-27). If the browser reloads the tab (Safari drops heavy background tabs and reloads them on
 * return) or the viewer goes Back / Forward, the page opens where it was: the route and workflow are in the URL already, the open result
 * is ?view=<id> (useFeedViewer), and this file keeps the scroll position per page (pathname + query, without ?view) in sessionStorage,
 * so it is per tab and gone with the tab. history.scrollRestoration is "manual": the browser's own restore runs before our content has
 * loaded and lands at the top; ours waits until the page is tall enough (or gives up after RESTORE_WAIT_MS), and stops as soon as the
 * viewer scrolls, clicks or types. In-app links still open at the top (App.tsx). Every storage call is wrapped: private windows and
 * full storage just don't remember. Pure helpers are tested in server/test/tab-restore.test.ts.
 */
export const RESTORE_WAIT_MS = 5000;
/** how long the page height must stay put before the restore lets go */
export const SETTLE_MS = 600;
const SCROLL_PREFIX = 'ohf:scroll:';

/** sessionStorage read / write / remove that never throws. */
export const ssGet = (k: string): string | null => { try { return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(k); } catch { return null; } };
export const ssSet = (k: string, v: string): void => { try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(k, v); } catch { /* private window or full: this tab won't remember */ } };
export const ssDel = (k: string): void => { try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(k); } catch { /* ignore */ } };
/** JSON in sessionStorage; a bad or missing value is `fallback`. */
export const ssJson = <T,>(k: string, fallback: T): T => { const s = ssGet(k); if (!s) return fallback; try { return JSON.parse(s) as T; } catch { return fallback; } };

/** Query params that open something over the page and don't make it another page (the result viewer). */
const OVERLAY_PARAMS = ['view'];
/** The key a page's scroll is kept under: path + sorted query, without overlay params, so /tools/h3-video?view=a and ?view=b share it. */
export function scrollKey(pathname: string, search: string): string {
  const q = new URLSearchParams(search); OVERLAY_PARAMS.forEach(p => q.delete(p));
  const pairs = [...q.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const qs = new URLSearchParams(pairs).toString();
  return `${SCROLL_PREFIX}${(pathname.replace(/\/+$/, '') || '/').toLowerCase()}${qs ? `?${qs}` : ''}`;
}
/** A saved position (or null): only whole, non-negative numbers. */
export function parseScroll(v: string | null): { y: number; h: number } | null {
  if (!v) return null; try { const o = JSON.parse(v); const y = Number(o?.y), h = Number(o?.h); return Number.isFinite(y) && y > 0 ? { y: Math.round(y), h: Number.isFinite(h) && h > 0 ? Math.round(h) : 0 } : null; } catch { return null; }
}
/** Can we scroll there yet? The page must be tall enough for `y` to be a real position (or nearly: within 40 px). */
export const canReach = (y: number, scrollHeight: number, viewport: number) => scrollHeight - viewport >= y - 40;

/** ?view=<id> in a URL, set (id) or removed (null); other params and the hash stay. */
export function withViewParam(href: string, id: string | null): string {
  const u = new URL(href, 'http://x'); if (id) u.searchParams.set('view', id); else u.searchParams.delete('view');
  return `${u.pathname}${u.search}${u.hash}`;
}
export const viewParam = (search: string): string | null => new URLSearchParams(search).get('view') || null;

let installed = false;
/** Wire scroll saving and restoring (main.tsx, once). */
export function installTabRestore(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return; installed = true;
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch { /* old browser */ }
  const se = () => document.scrollingElement ?? document.documentElement;
  let restoring = false; let cancel: (() => void) | null = null;
  const save = () => { if (restoring) return; const y = Math.round(window.scrollY); const k = scrollKey(location.pathname, location.search);
    if (y > 0) ssSet(k, JSON.stringify({ y, h: se().scrollHeight })); else ssDel(k); };
  let t: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener('scroll', () => { if (t) return; t = setTimeout(() => { t = null; save(); }, 200); }, { passive: true });
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });

  /** Scroll to the saved spot once the content is tall enough; the viewer's own scroll, click or key stops it. */
  const restore = () => {
    cancel?.(); const pos = parseScroll(ssGet(scrollKey(location.pathname, location.search))); if (!pos) return;
    restoring = true; const t0 = Date.now(); let timer: ReturnType<typeof setTimeout> | undefined; let done = false;
    const stop = () => { if (done) return; done = true; restoring = false; clearTimeout(timer); ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(n => removeEventListener(n, stop, true)); cancel = null; };
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(n => addEventListener(n, stop, { capture: true, passive: true }));
    /* hold the spot until the page height has stopped changing for SETTLE_MS (skeletons swap for content, images land, the feed's
     * first page arrives), so a late layout change can't clamp it back to the top */
    let lastH = -1; let stableSince = 0;
    const tick = () => {
      if (done) return;
      const h = se().scrollHeight; const now = Date.now(); if (h !== lastH) { lastH = h; stableSince = now; }
      if (canReach(pos.y, h, window.innerHeight)) { if (Math.abs(window.scrollY - pos.y) > 2) window.scrollTo(0, pos.y); if (now - stableSince > SETTLE_MS && Math.abs(window.scrollY - pos.y) <= 2) return stop(); }
      if (now - t0 > RESTORE_WAIT_MS) { if (window.scrollY < pos.y) window.scrollTo(0, Math.min(pos.y, h)); return stop(); }
      timer = setTimeout(tick, 50); /* timers, not frames: a tab that loads without painting still restores */
    };
    timer = setTimeout(tick, 0); cancel = stop;
  };
  /* a reload or a fresh open of this tab at this URL */
  restore();
  (window as unknown as { __ohfTab?: unknown }).__ohfTab = { restore, key: () => scrollKey(location.pathname, location.search), get restoring() { return restoring; } };
  /* Back / Forward (a real popstate; the router's own navigate() dispatches an untrusted one and in-app links start at the top) */
  window.addEventListener('popstate', (e) => { if (e.isTrusted) setTimeout(restore, 0); });
  /* back from the back/forward cache: the page is as it was, nothing to do but keep saving */
}
