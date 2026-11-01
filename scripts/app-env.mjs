// The few settings the start scripts need (npm run setup, npm start): the same lookup the app does, the shell first, then the env
// file (.env.local, or OPENHIGGSFIELD_ENV_FILE). Only these non-secret values are read, never keys.
import fs from 'node:fs'; import net from 'node:net'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const envFile = process.env.OPENHIGGSFIELD_ENV_FILE?.trim() ? path.resolve(process.env.OPENHIGGSFIELD_ENV_FILE.trim()) : path.join(REPO, '.env.local');
const fileVal = (k) => { try { const m = fs.readFileSync(envFile, 'utf8').match(new RegExp(`^\\s*${k}\\s*=\\s*([^#\\r\\n]*)`, 'm')); return m ? m[1].trim().replace(/^(['"])(.*)\1$/, '$2') : ''; } catch { return ''; } };
export const setting = (k, d) => process.env[k]?.trim() || fileVal(k) || d;
export const apiPort = setting('PORT', '8787'); export const webPort = setting('WEB_PORT', '5174');
// The web and MCP processes must inherit the same ports as the printed address and the API: only these settings are promoted.
export const launchEnv = { ...process.env, PORT: apiPort, WEB_PORT: webPort, MCP_PORT: setting('MCP_PORT', '8788') };
/** True when the app's API answers on this computer. */
export const apiUp = async () => { try { return (await fetch(`http://127.0.0.1:${apiPort}/api/health`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } };
/** True when something already listens on this port on this computer (a quick connect, no request sent). */
export const portBusy = (port) => new Promise((resolve) => {
  const s = net.connect({ port: Number(port), host: '127.0.0.1' }); const done = (v) => { s.destroy(); resolve(v); };
  s.setTimeout(1000); s.once('connect', () => done(true)); s.once('error', () => done(false)); s.once('timeout', () => done(false));
});
/** What listens on the port, e.g. "node (process 1234)", when that's cheap to find (lsof on macOS and Linux), else null. */
export const portUser = (port) => {
  if (process.platform === 'win32') return null;
  try { const r = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'], { encoding: 'utf8', timeout: 2000 });
    const pid = r.stdout?.match(/^p(\d+)/m)?.[1]; const cmd = r.stdout?.match(/^c(.+)$/m)?.[1];
    return pid ? `${cmd ?? 'a program'} (process ${pid})` : null; } catch { return null; }
};
/** Before starting: a plain message when PORT or WEB_PORT is taken by something that isn't this app (else null). Call it after apiUp() said no. */
export const portClash = async () => {
  for (const [name, port] of [['PORT', apiPort], ['WEB_PORT', webPort]]) {
    if (!(await portBusy(port))) continue;
    const who = portUser(port); const other = String(Number(port) + 3);
    return [`Port ${port} is already used by ${who ?? 'another program'}, so the app can't start.`,
      `  Close that program, or give the app another port: add ${name}=${other} to ${envFile}`,
      `  (or start it with ${name}=${other} in front of the command), then start it again.`].join('\n');
  }
  return null;
};
