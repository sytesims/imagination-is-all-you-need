#!/usr/bin/env node
// Dev-proxy check: GET <web>/api/tools through the Vite proxy must return JSON (not index.html).
// Usage: npm run check:proxy   (WEB_URL=http://localhost:5174 by default; start `npm run dev` first)
const base = process.env.WEB_URL || `http://localhost:${Number(process.env.WEB_PORT) || 5174}`;
const url = `${base}/api/tools`;
try {
  // identity: Node 24's fetch can trip over a large compressed body that the dev proxy sends with `connection: close` (undici assert(!this.paused))
  const r = await fetch(url, { headers: { 'accept-encoding': 'identity' }, signal: AbortSignal.timeout(10_000) });
  const ct = r.headers.get('content-type') || '';
  const body = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  if (!/application\/json/i.test(ct)) throw new Error(`content-type is "${ct}", expected application/json (proxy served: ${body.slice(0, 60).replace(/\s+/g, ' ')}...)`);
  const j = JSON.parse(body);
  const n = Array.isArray(j) ? j.length : Array.isArray(j?.tools) ? j.tools.length : null;
  console.log(`ok  ${url} -> ${ct}, ${n ?? '?'} tools`);
} catch (e) {
  console.error(`FAIL ${url}: ${e.message}`);
  process.exit(1);
}
