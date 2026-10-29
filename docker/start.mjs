// Container entrypoint: runs the Fastify API (server/dist) on API_PORT and serves web/dist on WEB_PORT,
// forwarding /api, /files, /samples and /s (share links) to the API (same as the Vite dev proxy). No extra deps.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { readEnvFile } from './envfile.mjs';

const API_PORT = Number(process.env.API_PORT || 8787);
const WEB_PORT = Number(process.env.WEB_PORT || 8080);
const WEB = path.resolve('web/dist');
const PROXY = ['/api', '/files', '/samples', '/s'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.gif': 'image/gif', '.txt': 'text/plain' };

// Saved keys (H+): OPENHIGGSFIELD_ENV_FILE (Dockerfile: /data/.env.local, on the data volume) is read here, so keys saved earlier survive
// recreating the container. Variables already set (docker run -e / compose environment) win over the file. Values are never printed.
const fromFile = readEnvFile(process.env.OPENHIGGSFIELD_ENV_FILE);
const env = { ...fromFile, ...process.env, PORT: String(API_PORT) };
if (Object.keys(fromFile).length) console.log(`[start] loaded ${Object.keys(fromFile).length} setting(s) from ${process.env.OPENHIGGSFIELD_ENV_FILE}`);
const api = spawn(process.execPath, ['dist/index.js'], { cwd: 'server', stdio: 'inherit', env });
api.on('exit', (code) => { console.error(`[start] API exited (${code})`); process.exit(code ?? 1); });
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { api.kill(s); setTimeout(() => process.exit(0), 3000).unref(); });

http.createServer((req, res) => {
  const url = req.url || '/';
  if (PROXY.some((p) => url === p || url.startsWith(p + '/') || url.startsWith(p + '?'))) {
    const up = http.request({ host: '127.0.0.1', port: API_PORT, method: req.method, path: url, headers: req.headers }, (r) => { res.writeHead(r.statusCode || 502, r.headers); r.pipe(res); });
    up.on('error', () => { if (!res.headersSent) res.writeHead(503, { 'content-type': 'application/json', 'retry-after': '2' }); res.end('{"ok":false,"error":"Server restarting, retrying…","errorType":"server_restarting","code":"server_restarting"}'); });
    req.pipe(up);
    return;
  }
  let p = path.normalize(decodeURIComponent(url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(WEB, p);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB, 'index.html'); // SPA fallback
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(WEB_PORT, '0.0.0.0', () => console.log(`[start] Imagination Is All You Need on http://localhost:${WEB_PORT} (API :${API_PORT}, backend=${process.env.OPENHIGGSFIELD_BACKEND || 'mock'})`));
