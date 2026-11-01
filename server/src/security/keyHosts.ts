/**
 * Where keys may go (security, 2026-11-01).
 *  - The Comfy key (COMFY_API_KEY) is sent only to Comfy's own hosts (cloud.comfy.org, api.comfy.org, *.comfy.org, *.run.comfy.app),
 *    never to a ComfyUI address someone typed in (your own ComfyUI needs no key).
 *  - The ComfyUI address set from the browser (PUT /api/local/comfy) must be this computer, your own network (10/8, 172.16/12,
 *    192.168/16, 169.254/16, *.local, *.lan, *.home.arpa, Tailscale 100.64/10, IPv6 ULA / link-local), Comfy's own hosts, or a host in
 *    OPENHIGGSFIELD_ALLOWED_HOSTS.
 *  - Replicate's token goes only to Replicate's hosts when downloading a result.
 */
import { isIP } from 'node:net';
import { isLoopbackName } from './localOnly.js';

const hostname = (u: string): string | null => { try { return new URL(u).hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch { return null; } };
/** Comfy's own hosts, over https. */
export function isComfyKeyHost(u: string): boolean {
  let x: URL; try { x = new URL(u); } catch { return false; } if (x.protocol !== 'https:') return false;
  const h = x.hostname.toLowerCase(); return h === 'comfy.org' || h.endsWith('.comfy.org') || h.endsWith('.run.comfy.app');
}
/** The Authorization header for a ComfyUI-API client at `base`: the Comfy key only when `base` is Comfy's own host. */
export const comfyAuthFor = (base: string, key: string | undefined): Record<string, string> => (key && isComfyKeyHost(base) ? { Authorization: `Bearer ${key}` } : {});

function privateIPv4(h: string): boolean {
  const p = h.split('.').map(Number); if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return p[0] === 10 || p[0] === 127 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
}
function privateIPv6(h: string): boolean {
  if (h === '::1') return true; const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h); if (m) return privateIPv4(m[1]);
  return /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h); // fc00::/7 ULA (Tailscale too), fe80::/10 link-local
}
const allowedHosts = () => (process.env.OPENHIGGSFIELD_ALLOWED_HOSTS ?? process.env.OPENJUTSU_ALLOWED_HOSTS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  .map((e) => e.replace(/^\[([^\]]+)\](:\d+)?$/, '$1').replace(/:\d+$/, ''));
/** A ComfyUI address we accept from the browser: this computer, your own network, Comfy's hosts, or OPENHIGGSFIELD_ALLOWED_HOSTS. */
export function comfyAddressAllowed(u: string): boolean {
  const h = hostname(u); if (!h) return false;
  if (isLoopbackName(h) || isComfyKeyHost(u)) return true;
  const v = isIP(h); if (v === 4 ? privateIPv4(h) : v === 6 ? privateIPv6(h) : /\.(local|lan|home\.arpa|internal|invalid|test)$/.test(h) || !h.includes('.')) return true;
  return allowedHosts().includes(h);
}
export const COMFY_ADDRESS_MESSAGE = 'Use an address on this computer or your own network (e.g. http://127.0.0.1:8188 or http://192.168.1.20:8188). For another host, add it to OPENHIGGSFIELD_ALLOWED_HOSTS.';

/** Replicate result downloads: the token only to Replicate's own hosts. */
export const replicateAuthFor = (url: string, key: string) => { const h = hostname(url); return h && /(^|\.)replicate\.(com|delivery)$/.test(h) && url.startsWith('https:') ? `Bearer ${key}` : undefined; };
