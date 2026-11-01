/**
 * Local only (security, 2026-11-01): who may call this server, and what /files/ serves.
 *
 * The app is a personal studio on your own computer. Without these checks any website you visit could call http://127.0.0.1:8787
 * (CORS was `*`), and a DNS-rebinding page could reach it under its own name. One onRequest hook, registered first, covers every
 * route the server answers (/api, /files, /s, /samples, the web build, the canvas event stream):
 *
 *  Host    must be a loopback name (localhost, *.localhost, 127.x, [::1]), an IP literal (a rebinding page always sends its own
 *          domain name, never an IP), the host of OPENHIGGSFIELD_PUBLIC_URL / OPENHIGGSFIELD_PUBLIC_BASE_URL, or a host listed in
 *          OPENHIGGSFIELD_ALLOWED_HOSTS. Else 403.
 *  Origin  when present: a loopback origin (http/https, any port), the request's own origin (Origin host = Host, which passed above),
 *          an origin listed in OPENHIGGSFIELD_ALLOWED_ORIGINS, or one whose host is in OPENHIGGSFIELD_ALLOWED_HOSTS. Else 403, for
 *          every method. No Origin (curl, the MCP server, provider webhooks, same-origin GETs) passes on the Host check alone.
 *  Sec-Fetch-Site: cross-site without an allowed Origin → 403, except a top-level GET/HEAD navigation (a link you click: the other
 *          site can't read what comes back).
 *  CORS    reflects only allowed origins (corsOrigin), never `*`.
 *  /files/ serves media only (filesPathAllowed): the extensions and folders the app writes. Dotfiles, the database, JSON, logs and
 *          anything else answer 404, also with ?clean=1.
 */
import type { FastifyInstance } from 'fastify';
import { isIP } from 'node:net';

const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim().toLowerCase().replace(/\/+$/, '')).filter(Boolean);
/** "Host" or URL host → { name, port } in lower case, brackets kept off IPv6. */
function splitHost(h: string): { name: string; port: string } | null {
  const s = h.trim().toLowerCase(); if (!s) return null;
  const m = /^\[([^\]]+)\](?::(\d+))?$/.exec(s); if (m) return { name: m[1], port: m[2] ?? '' };
  const i = s.lastIndexOf(':'); if (i > 0 && s.indexOf(':') === i) return /^\d+$/.test(s.slice(i + 1)) ? { name: s.slice(0, i), port: s.slice(i + 1) } : null;
  return { name: s, port: '' };
}
export const isLoopbackName = (name: string) => name === 'localhost' || name.endsWith('.localhost') || name === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name);
const hostOfUrl = (u: string | undefined) => { try { return u?.trim() ? new URL(u.trim()).host.toLowerCase() : null; } catch { return null; } };
/** Hosts named in the env (read per call so tests and a reloaded env see changes). */
function envHosts(): string[] {
  const own = [process.env.OPENHIGGSFIELD_PUBLIC_URL, process.env.OPENHIGGSFIELD_PUBLIC_BASE_URL].map(hostOfUrl).filter((x): x is string => !!x);
  return [...list(process.env.OPENHIGGSFIELD_ALLOWED_HOSTS ?? process.env.OPENJUTSU_ALLOWED_HOSTS), ...own];
}
/** An entry without a port matches any port; with a port, only that one. */
const inList = (h: { name: string; port: string }, entries: string[]) => entries.some((e) => { const x = splitHost(e); return !!x && x.name === h.name && (!x.port || x.port === h.port); });
/** Is this Host header one we answer? (missing = a non-browser client: nothing to rebind) */
export function hostAllowed(host: string | undefined): boolean {
  if (host == null || host === '') return true; const h = splitHost(host); if (!h) return false;
  return isLoopbackName(h.name) || isIP(h.name) !== 0 || inList(h, envHosts());
}
/** Is this Origin allowed to call the API (without knowing the request's Host: used for CORS)? */
export function originAllowed(origin: string | undefined): boolean {
  if (!origin) return false; let u: URL; try { u = new URL(origin); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const h = splitHost(u.host); if (!h) return false;
  if (isLoopbackName(h.name)) return true;
  const o = `${u.protocol}//${u.host}`.toLowerCase();
  return list(process.env.OPENHIGGSFIELD_ALLOWED_ORIGINS ?? process.env.OPENJUTSU_ALLOWED_ORIGINS).includes(o) || inList(h, envHosts());
}
/** The request's own origin (a page served by this host calling it) counts too. */
const sameOrigin = (origin: string, host: string | undefined) => { try { return !!host && new URL(origin).host.toLowerCase() === host.trim().toLowerCase(); } catch { return false; } };

/** @fastify/cors `origin` option: reflect allowed origins only. */
export const corsOrigin = (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => cb(null, !!origin && originAllowed(origin));

/** Media the app writes into the data folder and links as /files/… (outputs, uploads, posters, thumbs, captions, stamps, share
 *  exports, voice previews, 3D). Fonts only under brand-fonts/, SVG only as a brand logo (brand-…svg), like uploadSecurity's headers. */
const MEDIA = /\.(png|jpe?g|webp|gif|avif|heic|heif|bmp|tiff?|mp4|m4v|mov|webm|mkv|wav|mp3|m4a|aac|ogg|oga|flac|opus|aiff?|glb|gltf|obj|fbx|ply|stl|usdz|splat|vtt|srt)$/i;
export function filesPathAllowed(url: string): boolean {
  let rel: string; try { rel = decodeURIComponent(url.split('?')[0].replace(/^\/files\//, '')); } catch { return false; }
  if (!rel || rel.includes('\0') || rel.includes('\\')) return false;
  const parts = rel.split('/'); if (parts.some((p) => !p || p.startsWith('.'))) return false; // dotfiles, dot folders (.peek, .import-*), '..', '//'
  const base = parts[parts.length - 1];
  if (MEDIA.test(base)) return true;
  if (/^brand-[^/]*\.svg$/i.test(base) && parts.length === 1) return true;
  if (parts.length === 3 && parts[0] === 'brand-fonts' && /\.(ttf|otf|woff2?)$/i.test(base)) return true;
  return false;
}

const deny = (reply: any, code: 403 | 404, error: string, errorCode: string) => reply.code(code).header('cache-control', 'no-store')
  .send({ error, errorType: code === 404 ? 'not_found' : 'forbidden', code: errorCode });
const HOST_MSG = 'This app answers only on this computer (localhost). To open it under another name, add that host to OPENHIGGSFIELD_ALLOWED_HOSTS.';
const ORIGIN_MSG = 'Another website tried to use this app. Only the app itself (localhost) may call it. To allow a site you trust, add it to OPENHIGGSFIELD_ALLOWED_ORIGINS.';

/** Register first (before CORS, static files and the ?clean=1 responder). */
export function registerLocalOnly(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    const host = req.headers.host;
    if (!hostAllowed(host)) { req.log.warn({ host }, 'refused: Host not allowed'); return deny(reply, 403, HOST_MSG, 'host_not_allowed'); }
    const origin = req.headers.origin; const site = String(req.headers['sec-fetch-site'] ?? '').toLowerCase();
    if (origin != null) { if (!(originAllowed(origin) || sameOrigin(origin, host))) { req.log.warn({ origin }, 'refused: Origin not allowed'); return deny(reply, 403, ORIGIN_MSG, 'origin_not_allowed'); } }
    else if (site === 'cross-site' && !((req.method === 'GET' || req.method === 'HEAD') && req.headers['sec-fetch-mode'] === 'navigate')) return deny(reply, 403, ORIGIN_MSG, 'origin_not_allowed');
    if (req.url.startsWith('/files/') && !filesPathAllowed(req.url)) return deny(reply, 404, 'Not found', 'not_found');
  });
}
