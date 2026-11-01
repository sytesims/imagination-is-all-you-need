import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
/** Env lookup: OPENHIGGSFIELD_<NAME>, falling back to the legacy OPENJUTSU_<NAME> alias. Filming mode (below) overrides a few names.
 *  A blank value (`NAME=` in .env.local) counts as unset, so it never turns a default into '' or 0. */
export function env(name: string): string | undefined {
  if (FILMING.on && name in FILMING_ENV) return FILMING_ENV[name];
  const set = (v: string | undefined) => (v != null && v.trim() !== '' ? v : undefined);
  return set(process.env[`OPENHIGGSFIELD_${name}`]) ?? set(process.env[`OPENJUTSU_${name}`]);
}

/**
 * BH9 (c) filming mode: `npm run filming -- on|off|status` (server/scripts/filming-mode.ts) writes a small state file; the server reads it
 * once at boot, here, before any config module runs. When on:
 *  - DATA_DIR is a NEW empty scratch folder (the real data dir is never opened, so nothing in it can change);
 *  - open-weights-only is on (hosted APIs hidden; open graphs on Comfy Cloud stay);
 *  - provider keys from the launching shell are ignored; only keys in <scratch>/.env.local count, and Settings saves keys there;
 *  - /api/config says notificationPrompts:false; a failed run never offers 'Use …' alternatives (no needs_decision card).
 * Off = the state file says on:false; the next boot is exactly the normal setup (nothing real was modified).
 * State file: OPENHIGGSFIELD_FILMING_FILE, else <repo>/.filming/state.json (gitignored).
 */
export interface FilmingState { on: boolean; dataDir: string; since: string; keepComfyKey?: boolean; useLocal?: boolean }
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FILMING_FILE = path.resolve(process.env.OPENHIGGSFIELD_FILMING_FILE?.trim() || process.env.OPENJUTSU_FILMING_FILE?.trim() || path.join(REPO, '.filming/state.json'));
export const readFilming = (file = FILMING_FILE): FilmingState | null => { try { const s = JSON.parse(fs.readFileSync(file, 'utf8')); return s && typeof s === 'object' ? s : null; } catch { return null; } };
/** Every provider key the server reads (envKey + aliases in routing/settings.ts, both prefixes). */
export const PROVIDER_KEY_VARS = ['COMFY_API_KEY', 'COMFY_RUNNER_TOKEN', 'FAL_KEY', 'REPLICATE_API_TOKEN',
  ...['FAL_KEY', 'REPLICATE_API_TOKEN', 'MINIMAX_API_KEY', 'DASHSCOPE_API_KEY', 'BFL_API_KEY', 'LTX_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'ARK_API_KEY'].flatMap((n) => [`OPENHIGGSFIELD_${n}`, `OPENJUTSU_${n}`])];
const st = readFilming();
export const FILMING: { on: boolean; dataDir: string | null; since: string | null; file: string } = st?.on && typeof st.dataDir === 'string' && st.dataDir
  ? { on: true, dataDir: path.resolve(st.dataDir), since: st.since ?? null, file: FILMING_FILE } : { on: false, dataDir: null, since: null, file: FILMING_FILE };
const FILMING_ENV: Record<string, string> = FILMING.on ? { DATA_DIR: FILMING.dataDir!, OPEN_WEIGHTS_ONLY: '1', ENV_FILE: path.join(FILMING.dataDir!, '.env.local'), MOCK_KEYS: '0', USE_LOCAL: st?.useLocal ? '1' : '0' } : {}; // --local is the only way local turns on while filming
if (FILMING.on) {
  fs.mkdirSync(FILMING.dataDir!, { recursive: true });
  const keep = st?.keepComfyKey ? process.env.COMFY_API_KEY : undefined;
  for (const k of PROVIDER_KEY_VARS) delete process.env[k];
  if (keep) process.env.COMFY_API_KEY = keep;
  try { for (const line of fs.readFileSync(FILMING_ENV.ENV_FILE, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.+)$/); if (m && PROVIDER_KEY_VARS.includes(m[1])) process.env[m[1]] = m[2].trim(); } } catch { /* no scratch keys */ }
}
/** fallbackOffers / notificationPrompts: the flag itself decides (not filming mode alone). Default on; OPENHIGGSFIELD_FALLBACK_OFFERS=0 /
 *  OPENHIGGSFIELD_NOTIFICATION_PROMPTS=0 turn them off in any mode; filming mode defaults both to off (state file may set fallbackOffers/notificationPrompts: true).
 *  fallbackOffers=false → a failed run never offers 'Use …' alternatives and is never parked as needs_decision (plain failure, credits back). */
const flagOff = (v: string | undefined) => v != null && /^(0|false|off|no)$/i.test(v.trim());
const flagOn = (v: string | undefined) => v != null && /^(1|true|on|yes)$/i.test(v.trim());
export const fallbackOffers = (): boolean => { const v = env('FALLBACK_OFFERS'); if (flagOff(v)) return false; if (flagOn(v)) return true; return FILMING.on ? (st as any)?.fallbackOffers === true : true; };
export const notificationPrompts = (): boolean => { const v = env('NOTIFICATION_PROMPTS'); if (flagOff(v)) return false; if (flagOn(v)) return true; return FILMING.on ? (st as any)?.notificationPrompts === true : true; };
