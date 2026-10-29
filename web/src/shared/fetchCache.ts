/**
 * Shared read cache for the app-wide GET endpoints (performance, MODEL-PICKER-REVIEW task 11).
 *
 * Many components read the same registry/config endpoints on their own (`fetch('/api/config')` in 8 places, /api/tools in the
 * shell and Settings, /api/models in the header, Home and the studios). This wraps `fetch` once, like the enum guard in api.ts:
 *  - concurrent identical GETs share one request (dedupe);
 *  - a 2xx answer is reused for `fresh` ms (no request at all), so navigating between pages doesn't refetch the registry;
 *  - after that, endpoints marked `swr` answer at once from the last copy (up to `stale` ms) and refresh in the background;
 *    when the refreshed /api/tools differs, `ohf:tools-refresh` fires so the shell re-reads it (useTools);
 *  - any non-GET request to /api/* (saving keys, routing, settings, a run…) and `ohf:tools-refresh` drop the cache,
 *    so the next read after a change always goes to the server.
 * Only plain same-origin GETs to the listed paths are cached; everything else passes through untouched.
 */
type Snap = { status: number; statusText: string; headers: [string, string][]; body: ArrayBuffer };
type Rule = { re: RegExp; fresh: number; stale?: number };
const RULES: Rule[] = [
  { re: /^\/api\/tools$/, fresh: 30_000, stale: 10 * 60_000 },
  { re: /^\/api\/models$/, fresh: 30_000, stale: 10 * 60_000 },
  { re: /^\/api\/(config|me\/routing|settings\/providers|settings\/billing|settings\/open-models|setup|accounts|hardware)$/, fresh: 4_000 },
  { re: /^\/api\/(roadmap|image-features|image-presets|examples|styles|presets|video-presets|camera\/categories|posters)$/, fresh: 60_000 },
  { re: /^\/api\/(ledger|spend\/summary)$/, fresh: 1_500 },
];
const TOOLS_REFRESH = 'ohf:tools-refresh'; // = shared/useTools TOOLS_REFRESH (kept literal: no import cycle)
type Entry = { at: number; p: Promise<Snap>; snap?: Snap; refreshing?: boolean };
const cache = new Map<string, Entry>();
let selfRefresh = false;
export const clearFetchCache = () => cache.clear();

const toResponse = (s: Snap) => new Response(s.body.byteLength || ![204, 205, 304].includes(s.status) ? s.body.slice(0) : null, { status: s.status, statusText: s.statusText, headers: s.headers });
const same = (a: ArrayBuffer, b: ArrayBuffer) => { if (a.byteLength !== b.byteLength) return false; const x = new Uint8Array(a), y = new Uint8Array(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false; return true; };
const withAbort = <T,>(p: Promise<T>, signal?: AbortSignal | null): Promise<T> => !signal ? p : signal.aborted ? Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
  : new Promise<T>((res, rej) => { const f = () => rej(signal.reason ?? new DOMException('Aborted', 'AbortError')); signal.addEventListener('abort', f, { once: true }); p.then(v => { signal.removeEventListener('abort', f); res(v); }, e => { signal.removeEventListener('abort', f); rej(e); }); });

export function installFetchCache() {
  const g = globalThis as any;
  if (typeof g.fetch !== 'function' || g.__ohfFetchCache || typeof location === 'undefined') return;
  g.__ohfFetchCache = true;
  const orig: typeof fetch = g.fetch.bind(globalThis);
  addEventListener(TOOLS_REFRESH, () => { if (!selfRefresh) cache.clear(); });
  const load = (key: string): Promise<Snap> => orig(key).then(async r => ({ status: r.status, statusText: r.statusText, headers: [...r.headers.entries()], body: await r.arrayBuffer() }));
  g.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : null; // Request objects pass through
    const method = (init?.method ?? 'GET').toUpperCase();
    if (!raw) return orig(input, init);
    let u: URL; try { u = new URL(raw, location.origin); } catch { return orig(input, init); }
    if (u.origin !== location.origin || !u.pathname.startsWith('/api/')) return orig(input, init);
    if (method !== 'GET' && method !== 'HEAD') { cache.clear(); return orig(input, init).finally(() => cache.clear()); }
    const rule = RULES.find(r => r.re.test(u.pathname));
    if (!rule || method !== 'GET' || init?.body || init?.cache === 'no-store' || init?.cache === 'reload') return orig(input, init);
    const key = u.pathname + u.search; const now = Date.now(); const e = cache.get(key);
    const start = (): Entry => { const ent: Entry = { at: Date.now(), p: load(key) }; cache.set(key, ent);
      ent.p.then(s => { if (s.status >= 200 && s.status < 300) ent.snap = s; else if (cache.get(key) === ent) cache.delete(key); }, () => { if (cache.get(key) === ent) cache.delete(key); });
      return ent; };
    if (e && !e.snap) return withAbort(e.p, init?.signal).then(toResponse); // in flight: share it
    if (e?.snap && now - e.at < rule.fresh) return Promise.resolve(toResponse(e.snap));
    if (e?.snap && rule.stale && now - e.at < rule.stale) { // stale-while-revalidate
      if (!e.refreshing) { e.refreshing = true; const old = e.snap;
        load(key).then(s => { if (cache.get(key) !== e) return; if (s.status >= 200 && s.status < 300) { e.snap = s; e.at = Date.now();
            if (u.pathname === '/api/tools' && !same(old.body, s.body)) { selfRefresh = true; try { dispatchEvent(new Event(TOOLS_REFRESH)); } finally { selfRefresh = false; } } } }, () => undefined)
          .finally(() => { e.refreshing = false; }); }
      return Promise.resolve(toResponse(e.snap));
    }
    return withAbort(start().p, init?.signal).then(toResponse);
  };
}
installFetchCache();
