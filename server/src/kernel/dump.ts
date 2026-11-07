/**
 * --dump-config (or OPENHIGGSFIELD_DUMP_CONFIG=1; plan R8): print what this server would run, then exit. Never a secret: key variables appear
 * by name with set: true/false only, environment variables by name only (a value could hold a token), settings are the resolved kernel
 * settings (paths, port, host, backend).
 *
 * The plugin states, routes and hooks come from a second, sandboxed boot (a child process with OPENHIGGSFIELD_DUMP_ROUTES=1): a scratch data
 * folder, the mock backend, an empty env file and no key in its environment, so it never opens your library, never picks up a running job and
 * never listens on a port. It registers every route and exits.
 */
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { snapshot, isSecretVar } from './settings.js';
import { PROVIDER_KEY_VARS } from '../shared/providerKeys.js';

export const DUMP_MARK = '@@iiayn-dump@@';

/** In the sandboxed child: boot, then print the tree on one marked line. */
export async function dumpRoutesChild(): Promise<void> {
  const { boot } = await import('../boot.js'); const { currentHttp } = await import('./http.js'); const { declaredKeys } = await import('./keys.js');
  await boot(); const http = currentHttp(); const { mounted, fiberState } = await import('./index.js');
  const plugins = mounted.map((m) => ({ id: m.name, state: fiberState(m.fiber), keys: declaredKeys(m.name) }));
  process.stdout.write(`\n${DUMP_MARK}${JSON.stringify({ plugins, routes: http.routesBy(), hooks: http.hookList() })}\n`, () => process.exit(0));
}

/** Run the sandboxed child and read its tree. */
function sandboxTree(): Promise<{ plugins: { id: string; state: string; keys: string[] | '*' }[]; routes: Record<string, string[]>; hooks: unknown[] }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iiayn-dump-')); const envFile = path.join(dir, 'empty.env'); fs.writeFileSync(envFile, '');
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v != null && !isSecretVar(k) && !/^COMFY_BASE_URL$/.test(k)) env[k] = v;
  Object.assign(env, { OPENHIGGSFIELD_DUMP_ROUTES: '1', OPENHIGGSFIELD_DUMP_CONFIG: '', OPENHIGGSFIELD_DATA_DIR: path.join(dir, 'data'), OPENHIGGSFIELD_ENV_FILE: envFile,
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(dir, 'no-filming.json'), OPENHIGGSFIELD_COMFY_DETECT_URLS: 'http://127.0.0.1:9', OPENHIGGSFIELD_DEMO_AUTO: '0' });
  const args = [...process.execArgv, process.argv[1]].filter((a) => a !== '--dump-config');
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] }); let out = ''; let err = '';
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => {
      fs.rmSync(dir, { recursive: true, force: true });
      const line = out.split('\n').find((l) => l.startsWith(DUMP_MARK));
      if (!line) return reject(new Error(`dump-config: the sandboxed boot failed (exit ${code}): ${err.split('\n').slice(-5).join(' ')}`));
      resolve(JSON.parse(line.slice(DUMP_MARK.length)));
    });
  });
}

/** The whole dump (no secrets). */
export async function dumpConfig() {
  const s = snapshot(); const tree = await sandboxTree();
  return {
    profile: { name: s.profile.name, file: s.profile.file, plugins: s.profile.plugins, config: s.profile.config ?? {} },
    settings: s.kernel,
    env: Object.keys(s.env).sort(), // names only
    keys: PROVIDER_KEY_VARS.filter((k) => !/^OPENJUTSU_/.test(k)).map((k) => ({ name: k, set: !!process.env[k]?.trim() })), // names, set or not; never a value (this process imports nothing that opens the db)
    plugins: tree.plugins.map((p) => ({ ...p, routes: tree.routes[p.id]?.length ?? 0 })),
    routes: tree.routes,
    hooks: tree.hooks,
  };
}
