/**
 * Local only (security, 2026-11-01): the HTTP bridge answers only this computer, as the MCP spec asks (servers MUST validate Origin).
 * The same rules as the app server (server/src/security/localOnly.ts; this package is published on its own, so it keeps its own copy):
 *  Host    a loopback name (localhost, *.localhost, 127.x, [::1]), an IP literal (a DNS-rebinding page always sends its own domain name),
 *          or a host in OPENHIGGSFIELD_ALLOWED_HOSTS (comma list; an entry without a port matches any port).
 *  Origin  when present: a loopback origin (http/https, any port), one in OPENHIGGSFIELD_ALLOWED_ORIGINS, or one whose host is in
 *          OPENHIGGSFIELD_ALLOWED_HOSTS. MCP clients (Claude, Cursor…) send no Origin and pass on the Host check.
 *  Sec-Fetch-Site: cross-site without an allowed Origin is refused.
 */
import { isIP } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';

const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim().toLowerCase().replace(/\/+$/, '')).filter(Boolean);
function splitHost(h: string): { name: string; port: string } | null {
  const s = h.trim().toLowerCase(); if (!s) return null;
  const m = /^\[([^\]]+)\](?::(\d+))?$/.exec(s); if (m) return { name: m[1], port: m[2] ?? '' };
  const i = s.lastIndexOf(':'); if (i > 0 && s.indexOf(':') === i) return /^\d+$/.test(s.slice(i + 1)) ? { name: s.slice(0, i), port: s.slice(i + 1) } : null;
  return { name: s, port: '' };
}
const loopback = (n: string) => n === 'localhost' || n.endsWith('.localhost') || n === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(n);
const inList = (h: { name: string; port: string }, entries: string[]) => entries.some((e) => { const x = splitHost(e); return !!x && x.name === h.name && (!x.port || x.port === h.port); });
const hosts = () => list(process.env.OPENHIGGSFIELD_ALLOWED_HOSTS);
export function hostAllowed(host: string | undefined): boolean {
  if (!host) return true; const h = splitHost(host); return !!h && (loopback(h.name) || isIP(h.name) !== 0 || inList(h, hosts()));
}
export function originAllowed(origin: string): boolean {
  let u: URL; try { u = new URL(origin); } catch { return false; } if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const h = splitHost(u.host); if (!h) return false;
  return loopback(h.name) || list(process.env.OPENHIGGSFIELD_ALLOWED_ORIGINS).includes(`${u.protocol}//${u.host}`.toLowerCase()) || inList(h, hosts());
}
/** null = allowed; else the plain reason for a 403. */
export function refuseReason(headers: IncomingHttpHeaders): string | null {
  if (!hostAllowed(headers.host)) return 'This MCP server answers only on this computer (localhost). Add the host to OPENHIGGSFIELD_ALLOWED_HOSTS to allow it.';
  const origin = typeof headers.origin === 'string' ? headers.origin : undefined;
  if (origin != null ? !originAllowed(origin) : String(headers['sec-fetch-site'] ?? '') === 'cross-site') return 'Another website tried to use this MCP server. Add it to OPENHIGGSFIELD_ALLOWED_ORIGINS to allow it.';
  return null;
}
