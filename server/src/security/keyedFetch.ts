/**
 * keyedFetch: the one way a request that carries a provider key leaves this server (security review 2026-11-07, F3 and F4).
 *  - https only; plain http only to this computer (loopback: your own ComfyUI, test stubs).
 *  - Only to the provider's own hosts (its allow-list, plus the base URL you configured for it).
 *  - Redirects are followed by hand (redirect: 'manual', at most 4 hops): the key headers ride only while the hops stay on the first
 *    request's origin and on the allow-list. A hop anywhere else is followed with no key and no other header than `accept`, and never
 *    gets the key back later. Node's fetch drops only Authorization / Cookie on a cross-site redirect; custom key headers (x-key,
 *    X-API-Key, x-goog-api-key) would follow, which is why this exists.
 * A refused host throws KeyHostRefused (never temporary: a poll loop stops at once). The message names the origin, never the key.
 */
import { isLoopbackName } from './localOnly.js';

type Fetch = typeof fetch;
/** 'api.bfl.ai' = that host only; '.bfl.ai' = bfl.ai and every subdomain. */
export type HostRule = string;
/** Who the key belongs to (for messages) and where it may go. `hosts` is read per call, so a configured base can change at run time. */
export interface KeyScope { provider: string; hosts: () => readonly HostRule[] }

export const MAX_HOPS = 4;

const parse = (u: string): URL | null => { try { return new URL(u); } catch { return null; } };
const hostOf = (x: URL) => x.hostname.toLowerCase().replace(/^\[|\]$/g, '');
const matches = (host: string, rule: HostRule) => { const r = rule.toLowerCase(); return r.startsWith('.') ? host === r.slice(1) || host.endsWith(r) : host === r; };

/** Is this URL a loopback address (http or https)? */
export const isLoopbackUrl = (u: string) => { const x = parse(u); return !!x && /^https?:$/.test(x.protocol) && isLoopbackName(hostOf(x)); };
/** May a key for `hosts` go to this URL? https on an allowed host, or this computer. */
export function keyUrlAllowed(u: string, hosts: readonly HostRule[]): boolean {
  const x = parse(u); if (!x) return false;
  const h = hostOf(x);
  if (isLoopbackName(h)) return x.protocol === 'http:' || x.protocol === 'https:';
  return x.protocol === 'https:' && hosts.some((r) => matches(h, r));
}
/** The exact-host rule for a configured base URL (empty when it isn't a URL). */
export const hostRuleOf = (base: string | undefined | null): HostRule[] => { const x = base ? parse(base) : null; return x ? [hostOf(x)] : []; };

export class KeyHostRefused extends Error {
  readonly keyHostRefused = true; readonly temporary = false;
  constructor(readonly provider: string, url: string) { super(`refused to send the ${provider} key to ${parse(url)?.origin ?? 'an address that is not a URL'}`); this.name = 'KeyHostRefused'; }
}

/** Throws KeyHostRefused unless the scope allows the URL. */
export function assertKeyUrl(scope: KeyScope, u: string) { if (!keyUrlAllowed(u, scope.hosts())) throw new KeyHostRefused(scope.provider, u); }

const KEEP_ON_HOP = ['accept'];
const methodAfter = (status: number, method: string) => (status === 307 || status === 308 || method === 'GET' || method === 'HEAD' ? method : 'GET');

/** fetch with the key headers in `init`, only where the scope allows (see the top of this file). */
export async function keyedFetch(scope: KeyScope, url: string, init: RequestInit = {}, o: { f?: Fetch; maxHops?: number } = {}): Promise<Response> {
  const f = o.f ?? ((...a: Parameters<Fetch>) => fetch(...a)); const maxHops = o.maxHops ?? MAX_HOPS;
  assertKeyUrl(scope, url);
  let at = url; let req: RequestInit = init; let keyed = true;
  for (let hop = 0; ; hop++) {
    const r = await f(at, { ...req, redirect: 'manual' });
    const loc = r.status >= 300 && r.status < 400 && r.status !== 304 ? r.headers.get('location') : null;
    if (!loc) return r;
    if (hop >= maxHops) throw Object.assign(new Error(`${scope.provider}: too many redirects`), { temporary: false });
    await r.body?.cancel().catch(() => {});
    const next = new URL(loc, at).toString(); const method = methodAfter(r.status, (req.method ?? 'GET').toUpperCase());
    const body = method === (req.method ?? 'GET').toUpperCase() ? req.body : undefined;
    keyed = keyed && new URL(next).origin === new URL(at).origin && keyUrlAllowed(next, scope.hosts());
    if (keyed) req = { ...req, method, body };
    else { const h = new Headers(req.headers); const plain = new Headers(); for (const k of KEEP_ON_HOP) { const v = h.get(k); if (v) plain.set(k, v); } req = { method, body, headers: plain, signal: req.signal }; }
    at = next;
  }
}
