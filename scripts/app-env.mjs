// The few settings the start scripts need (npm run setup, npm start): the same lookup the app does, the shell first, then the env
// file (.env.local, or OPENHIGGSFIELD_ENV_FILE). Only these non-secret values are read, never keys.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const envFile = process.env.OPENHIGGSFIELD_ENV_FILE?.trim() ? path.resolve(process.env.OPENHIGGSFIELD_ENV_FILE.trim()) : path.join(REPO, '.env.local');
const fileVal = (k) => { try { const m = fs.readFileSync(envFile, 'utf8').match(new RegExp(`^\\s*${k}\\s*=\\s*([^#\\r\\n]*)`, 'm')); return m ? m[1].trim().replace(/^(['"])(.*)\1$/, '$2') : ''; } catch { return ''; } };
export const setting = (k, d) => process.env[k]?.trim() || fileVal(k) || d;
export const apiPort = setting('PORT', '8787'); export const webPort = setting('WEB_PORT', '5174');
// The web and MCP processes must inherit the same ports as the printed address and the API: only these settings are promoted.
export const launchEnv = { ...process.env, PORT: apiPort, WEB_PORT: webPort, MCP_PORT: setting('MCP_PORT', '8788') };
/** True when the app's API answers on this computer. */
export const apiUp = async () => { try { return (await fetch(`http://127.0.0.1:${apiPort}/api/health`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } };
