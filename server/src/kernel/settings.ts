/**
 * ctx.settings (plan §3.2 and §3.6): typed settings, merged profile → env → kv (a later layer wins), checked with zod.
 *
 * The environment is read ONCE, the first time anything asks (boot.ts asks first; config.ts too when a script or test imports it without
 * booting), into a frozen snapshot. Filming mode is applied before that: this module imports env.ts, whose load applies the filming state
 * (scratch data dir, keys from the shell dropped), so the snapshot already sees it.
 *
 *  - kernel settings (bootSettings()): what the server itself needs before any plugin runs (backend, data dir, port, host, env file…).
 *    Profile block `config: kernel:`, then the env. They can't come from kv: the kv table lives inside the data dir.
 *  - plugin settings (ctx.settings.of(schema)): profile block `config: <plugin>:` → env OPENHIGGSFIELD_<PLUGIN>_<FIELD> (e.g. place-fal's
 *    pollMs: OPENHIGGSFIELD_PLACE_FAL_POLL_MS, from the snapshot) → kv `settings.<plugin>` (saved in the app; read on each call).
 *
 * Keys are never settings: they stay behind ctx.keys (kernel/keys.ts), and the snapshot leaves out every variable that looks like a key.
 * Legacy modules still call env() (env.ts) at run time; they move to ctx.settings as each one becomes a plugin (plan §7, phases 2–5).
 */
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Service, type Context } from 'cordis';
import { env, FILMING } from '../env.js';
import { listenHost } from '../shared/listenHost.js';
import { PROVIDER_KEY_VARS } from '../shared/providerKeys.js';
import { readProfile, type Profile, type Scalar } from './profile.js';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPO = path.resolve(SERVER, '..');

/** A variable that holds (or may hold) a secret: never in the snapshot, never printed. */
export const isSecretVar = (k: string) => PROVIDER_KEY_VARS.includes(k) || /KEY|TOKEN|SECRET|PASSW|CREDENTIAL|AUTH|COOKIE/i.test(k);

export const KernelSettings = z.object({
  /** The profile in use (server/profiles/<name>.yml, OPENHIGGSFIELD_PROFILE). */
  profile: z.string(), profileFile: z.string(),
  /** comfy (real runs) · mock (development and tests: sample results). OPENHIGGSFIELD_BACKEND. */
  backend: z.enum(['mock', 'comfy']),
  /** SQLite db + uploads + outputs. OPENHIGGSFIELD_DATA_DIR, default server/data; filming mode: its scratch folder. */
  dataDir: z.string().min(1),
  /** Workflows people add in the app. OPENHIGGSFIELD_USER_PLUGINS_DIR, default <data>/plugins. */
  userPluginsDir: z.string().min(1),
  /** Days to keep finished results (0 = forever). OPENHIGGSFIELD_RESULT_TTL_DAYS. */
  resultTtlDays: z.number().min(0),
  /** API port (PORT, default 8787) and address (HOST / OPENHIGGSFIELD_HOST, default 127.0.0.1: this computer only). */
  port: z.number().int().min(0).max(65535),
  host: z.string().min(1),
  /** Where keys saved in Settings go (OPENHIGGSFIELD_ENV_FILE, else <repo>/.env.local). A path, never its content. */
  envFile: z.string().min(1),
  /** Filming mode is on (npm run filming). */
  filming: z.boolean(),
});
export type KernelSettings = z.infer<typeof KernelSettings>;

/** "a-plugin" + "pollMs" → OPENHIGGSFIELD_A_PLUGIN_POLL_MS */
export const envNameOf = (plugin: string, field: string) => `OPENHIGGSFIELD_${plugin.replace(/-/g, '_').toUpperCase()}_${field.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}`;
const scalarOf = (v: string): Scalar => (/^(true|false)$/i.test(v) ? v.toLowerCase() === 'true' : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);

interface Snapshot { profile: Profile; env: Readonly<Record<string, string>>; kernel: Readonly<KernelSettings>; readAt: number }
let snap: Snapshot | null = null;
/** How many times the environment was read (tests: exactly once). */
export let envReads = 0;

/** Read the environment once (filming mode already applied by env.ts) and resolve the kernel settings. */
function take(profile: Profile): Snapshot {
  envReads++;
  const vars: Record<string, string> = {};
  for (const k of Object.keys(process.env)) {
    const m = /^(?:OPENHIGGSFIELD|OPENJUTSU)_(.+)$/.exec(k); if (!m || isSecretVar(k)) continue;
    const v = env(m[1]); if (v != null) vars[`OPENHIGGSFIELD_${m[1]}`] = v; // env(): the OPENJUTSU_ alias and filming overrides, blank = unset
  }
  if (FILMING.on) for (const n of ['DATA_DIR', 'OPEN_WEIGHTS_ONLY', 'ENV_FILE', 'MOCK_KEYS', 'USE_LOCAL']) { const v = env(n); if (v != null) vars[`OPENHIGGSFIELD_${n}`] = v; }
  const p = profile.config?.kernel ?? {}; const str = (k: string) => (p[k] == null ? undefined : String(p[k]));
  const dataDir = path.resolve(vars.OPENHIGGSFIELD_DATA_DIR || str('dataDir') || path.join(SERVER, 'data'));
  const hostSet = ['HOST', 'OPENHIGGSFIELD_HOST', 'OPENJUTSU_HOST'].some((k) => process.env[k]?.trim());
  const ef = vars.OPENHIGGSFIELD_ENV_FILE?.trim() || str('envFile');
  const kernel = KernelSettings.parse({
    profile: profile.name, profileFile: profile.file,
    backend: (vars.OPENHIGGSFIELD_BACKEND ?? str('backend')) === 'mock' ? 'mock' : 'comfy',
    dataDir,
    userPluginsDir: path.resolve(vars.OPENHIGGSFIELD_USER_PLUGINS_DIR || str('userPluginsDir') || path.join(dataDir, 'plugins')),
    resultTtlDays: Math.max(0, Number(vars.OPENHIGGSFIELD_RESULT_TTL_DAYS ?? str('resultTtlDays')) || 0),
    port: Number(process.env.PORT || str('port')) || 8787,
    host: hostSet ? listenHost(process.env) : str('host') || '127.0.0.1',
    envFile: ef ? path.resolve(ef) : path.join(REPO, '.env.local'),
    filming: FILMING.on,
  });
  return { profile, env: Object.freeze(vars), kernel: Object.freeze(kernel), readAt: Date.now() };
}

/** The snapshot (taken on first use, with the profile OPENHIGGSFIELD_PROFILE names). */
export const snapshot = (): Snapshot => (snap ??= take(readProfileSafe()));
const readProfileSafe = (): Profile => { try { return readProfile(); } catch { return { name: process.env.OPENHIGGSFIELD_PROFILE?.trim() || 'desktop', plugins: [], file: '(none)' }; } };
/** The kernel settings: read once, frozen. */
export const bootSettings = (): Readonly<KernelSettings> => snapshot().kernel;

/** kv reader for the kv layer; boot.ts sets it once the db is open (this module can't import db.ts: db.ts reads the data dir from here). */
let kvGet: ((k: string) => unknown) | null = null;
export const setSettingsKv = (f: ((k: string) => unknown) | null) => { kvGet = f; };

/** One plugin's settings: profile → env snapshot → kv, parsed by its zod schema (defaults come from the schema). */
export function pluginSettings<S extends z.ZodObject<any>>(plugin: string, schema: S): z.infer<S> {
  const s = snapshot(); const merged: Record<string, unknown> = { ...(s.profile.config?.[plugin] ?? {}) };
  for (const field of Object.keys(schema.shape)) { const v = s.env[envNameOf(plugin, field)]; if (v != null) merged[field] = scalarOf(v); }
  const saved = kvGet?.(`settings.${plugin}`); if (saved && typeof saved === 'object' && !Array.isArray(saved)) Object.assign(merged, saved);
  const r = schema.safeParse(merged);
  if (!r.success) throw new Error(`settings for ${plugin}: ${r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`);
  return r.data;
}

/** Tests only: forget the snapshot so the next read takes a new one. */
export const resetSettingsForTests = () => { snap = null; };

/** The kernel service: ctx.settings. kernel = the server's own settings; of(schema) = the calling plugin's settings. */
export class SettingsService extends Service {
  constructor(ctx: Context) { super(ctx, 'settings'); snapshot(); }
  get kernel(): Readonly<KernelSettings> { return bootSettings(); }
  get profile(): Profile { return snapshot().profile; }
  of<S extends z.ZodObject<any>>(schema: S): z.infer<S> { return pluginSettings((this.ctx as any).fiber?.name ?? 'kernel', schema); }
}
