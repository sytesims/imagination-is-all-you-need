/**
 * `npm run doctor` (setup step 1, 2026-10-26): one read-only check of this computer, the app, ComfyUI, node packs, accounts and local models.
 * Prints works (✓) / missing (!, ✗) / how to fix, or JSON with --json. Exit 0 = works, 1 = something required is missing, 2 = the app can't start
 * (Node too old, dependencies not installed).
 *  - Read-only: GET requests only (the app's /api/health, /api/settings/providers, /api/tools; ComfyUI /system_stats, the Manager's version and
 *    installed list), `nvidia-smi` / `sw_vers` / `git rev-parse` / `git apply --check` (checks only), statfs. Nothing is installed, downloaded,
 *    started or sent anywhere else. Short timeouts (≤ 3 s per request).
 *  - Keys: only NAMES are reported (which accounts are connected), never values or hints. The env file is read for the names of its variables, and
 *    for the values of a few non-secret settings only (ports, the ComfyUI address, the models folder, the backend); everything else is dropped.
 *  - No database or server module is imported (this runs with the app stopped): only pure modules shared with the server.
 * Every outside effect goes through DoctorEnv, so tests run it against recorded answers.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { comfyInstallOf, type ComfyInstall } from '../hardware/comfyInstall.js';
import { PROVIDER_ACCOUNTS } from '../shared/providerKeys.js';
import { classifyMachine, inputFromSystemStats, parseNvidiaSmi, type MachineProfile } from '../hardware/machineProfile.js';

export type Status = 'ok' | 'warn' | 'fail' | 'info';
export type Section = 'computer' | 'app' | 'comfy' | 'accounts' | 'models';
export interface Check { id: string; section: Section; status: Status; required: boolean; text: string; detail?: string[]; fix?: string }
export interface PackState { name: string; dir: string; pin: string; installed: boolean | null; pinned: boolean | null; patches: number; patched: boolean | null; workflows: number; via: 'disk' | 'manager' | 'unknown' }
export interface DoctorReport {
  ok: boolean; exitCode: 0 | 1 | 2; checkedAt: string; readOnly: true;
  machine: { platform: string; osName: string; arch: string; cpu: string | null; ramGB: number | null; gpu: { name: string; type: string; vramGB: number | null } | null; usableGB: number | null; profile: MachineProfile; diskFreeGB: number | null; diskPath: string | null };
  app: { api: { url: string; up: boolean; backend: string | null; tools: number | null }; web: { url: string; up: boolean }; mcp: { url: string; up: boolean } };
  comfy: { url: string | null; reachable: boolean; version: string | null; kind: string | null; label: string | null; latencyMs: number | null; manager: string | null; modelsDir: string | null; modelsDirSource: string | null; comfyDir: string | null; required: boolean };
  nodePacks: PackState[];
  accounts: { source: 'app' | 'env-file' | 'none'; connected: string[]; notConnected: string[] };
  models: { ready: number; download: number; downloadGB: number; needsNode: number; notOnThisComputer: number; tooHeavy: number; other: number } | null;
  checks: Check[];
}
export interface ExecResult { ok: boolean; out: string }
export interface DoctorEnv {
  fetch: typeof fetch; exec: (cmd: string, args: string[], o?: { cwd?: string }) => ExecResult; fs: Pick<typeof fs, 'existsSync' | 'readFileSync' | 'statfsSync'>;
  platform: NodeJS.Platform; arch: string; release: string; cpus: () => { model: string }[]; totalmem: () => number; nodeVersion: string;
  env: Record<string, string | undefined>; repoRoot: string; now: () => Date;
}
export interface DoctorOptions { apiUrl?: string; comfyUrl?: string; comfyDir?: string; envFile?: string; timeoutMs?: number }

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const realEnv = (): DoctorEnv => ({
  fetch: (...a) => fetch(...a),
  // npm on Windows is npm.cmd, which needs a shell; one command line (fixed words, no user input) instead of args + shell, which Node 24 warns about (DEP0190)
  exec: (cmd, args, o = {}) => { try { const opts = { timeout: 4000, cwd: o.cwd, stdio: ['ignore', 'pipe', 'ignore'] as any, windowsHide: true };
    return { ok: true, out: (process.platform === 'win32' && cmd === 'npm' ? execSync(['npm', ...args].join(' '), opts) : execFileSync(cmd, args, opts)).toString().trim() }; } catch (e: any) { return { ok: false, out: String(e?.stdout ?? '').trim() }; } },
  fs, platform: process.platform, arch: process.arch, release: os.release(), cpus: () => os.cpus(), totalmem: () => os.totalmem(), nodeVersion: process.version,
  env: process.env as Record<string, string | undefined>, repoRoot: REPO_ROOT, now: () => new Date(),
});

const GiB = 2 ** 30; const r1 = (n: number) => Math.round(n * 10) / 10;
/** Settings whose VALUES the doctor may read from the env file (none of them is a secret). Every other line gives its name only. */
const SAFE_VALUES = new Set(['PORT', 'WEB_PORT', 'MCP_PORT', 'HOST', 'COMFY_BASE_URL', 'OPENHIGGSFIELD_COMFY_MODELS_DIR', 'OPENHIGGSFIELD_BACKEND', 'OPENHIGGSFIELD_USE_LOCAL', 'OPENHIGGSFIELD_COMFY_DIR']);
/** The env file as {names, safe values}. A key's value never leaves this function. */
export function readEnvFile(file: string, f: Pick<typeof fs, 'existsSync' | 'readFileSync'>): { found: boolean; names: string[]; values: Record<string, string> } {
  const out = { found: false, names: [] as string[], values: {} as Record<string, string> };
  let text = ''; try { if (!f.existsSync(file)) return out; text = String(f.readFileSync(file, 'utf8')); out.found = true; } catch { return out; }
  for (const line of text.split(/\r?\n/)) { const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/); if (!m) continue; const name = m[1];
    const v = m[2].replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2'); if (!v) continue; // an empty line (NAME=) sets nothing
    if (!out.names.includes(name)) out.names.push(name); if (SAFE_VALUES.has(name)) out.values[name] = v; }
  return out;
}
/** Provider accounts by env variable (names only), for when the app isn't running: the one list in shared/providerKeys.ts (filming mode reads it
 *  too); the app's own answer wins when it runs. */
export const ACCOUNT_ENV = PROVIDER_ACCOUNTS;

async function getJson(e: DoctorEnv, url: string, ms: number): Promise<{ ok: boolean; status: number; json: any; ms: number }> {
  const t0 = Date.now();
  try { const r = await e.fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: 'application/json' } }); let json: any = null; try { json = await r.json(); } catch { /* not JSON */ } return { ok: r.ok, status: r.status, json, ms: Date.now() - t0 }; }
  catch { return { ok: false, status: 0, json: null, ms: Date.now() - t0 }; }
}
/** Any HTTP answer counts as "something is listening" (the MCP endpoint answers 406 to a plain GET). */
async function answers(e: DoctorEnv, url: string, ms: number): Promise<boolean> { try { const r = await e.fetch(url, { signal: AbortSignal.timeout(ms) }); await r.arrayBuffer().catch(() => undefined); return r.status > 0; } catch { return false; } }

export function osName(e: DoctorEnv): string {
  if (e.platform === 'darwin') { const v = e.exec('sw_vers', ['-productVersion']); return `macOS ${v.ok && v.out ? v.out : ''}`.trim(); }
  if (e.platform === 'win32') { const b = Number(e.release.split('.')[2] ?? 0); return b >= 22000 ? 'Windows 11' : 'Windows 10'; }
  if (e.platform === 'linux') { try { const t = String(e.fs.readFileSync('/etc/os-release', 'utf8')); const m = t.match(/^PRETTY_NAME="?([^"\n]+)"?/m); if (m) return m[1]; } catch { /* */ } return 'Linux'; }
  return e.platform;
}
/** nvidia-smi rows (name, total MiB, free MiB, compute capability). [] when it isn't there. Shared shape with hardware/machineProfile.ts fixtures. */
export function nvidiaSmi(e: DoctorEnv): { name: string; totalMiB: number | null; freeMiB: number | null; computeCap: string | null }[] {
  if (e.platform === 'darwin') return [];
  let r = e.exec('nvidia-smi', ['--query-gpu=name,memory.total,memory.free,compute_cap', '--format=csv,noheader,nounits']); let cap = true;
  if (!r.ok) { r = e.exec('nvidia-smi', ['--query-gpu=name,memory.total,memory.free', '--format=csv,noheader,nounits']); cap = false; }
  if (!r.ok || !r.out) return [];
  return parseNvidiaSmi(r.out).map((x) => ({ ...x, computeCap: cap ? x.computeCap : null }));
}
const ver = (s: string) => s.replace(/^v/, '').split('.').map((x) => Number(x) || 0);
const gbText = (b: number) => `${r1(b / 1e9)} GB`;

export async function runDoctor(e: DoctorEnv = realEnv(), o: DoctorOptions = {}): Promise<DoctorReport> {
  const T = o.timeoutMs ?? 2500; const checks: Check[] = []; const add = (c: Check) => { checks.push(c); return c; };
  const envFile = o.envFile ?? (e.env.OPENHIGGSFIELD_ENV_FILE?.trim() ? path.resolve(e.env.OPENHIGGSFIELD_ENV_FILE.trim()) : path.join(e.repoRoot, '.env.local'));
  const ef = readEnvFile(envFile, e.fs); const setting = (k: string) => e.env[k]?.trim() || ef.values[k] || '';

  // ---- This computer ----
  const os0 = osName(e); const cpu = e.cpus()[0]?.model?.trim() || null; const ramGB = r1(e.totalmem() / GiB);
  // Node.js 22 (from 22.12), 24 or 26: the same rule as scripts/node-version.mjs and package.json engines (>=22.12 <27)
  const [nM, nm] = ver(e.nodeVersion); const nodeOk = (nM === 22 && nm >= 12) || nM === 24 || nM === 26;
  add({ id: 'os', section: 'computer', status: 'ok', required: false, text: `${os0} · ${e.arch}${cpu ? ` · ${cpu}` : ''} · ${Math.round(ramGB)} GB memory` });
  const npmV = e.exec('npm', ['-v']); const ff = e.exec('ffmpeg', ['-version']); const ffV = ff.ok ? (ff.out.match(/ffmpeg version (\S+)/)?.[1] ?? 'found') : null;
  add({ id: 'node', section: 'computer', status: nodeOk ? 'ok' : 'fail', required: true, text: `Node ${e.nodeVersion.replace(/^v/, '')}${npmV.ok ? ` · npm ${npmV.out}` : ''}`, fix: nodeOk ? undefined : `${nM > 26 ? 'This Node.js is newer than Imagination supports yet' : 'This Node.js is too old or past its end of life'}. Install Node.js 22, 24 or 26 (24 recommended). Mac: brew install node@24 · Windows: winget install OpenJS.NodeJS.LTS · or with nvm: nvm install 24 && nvm use 24. Then npm install` });
  const mediaFix = e.platform === 'darwin' ? 'brew install ffmpeg' : e.platform === 'win32' ? 'winget install --id Gyan.FFmpeg -e; reopen PowerShell afterwards' : 'sudo apt install ffmpeg';
  add({ id: 'ffmpeg', section: 'computer', status: ffV ? 'ok' : 'warn', required: false, text: ffV ? `ffmpeg ${ffV}` : 'ffmpeg not found (uploads and media processing need ffmpeg and ffprobe; browsing Examples is still available)', fix: ffV ? undefined : mediaFix });
  const probe = e.exec('ffprobe', ['-version']); const probeV = probe.ok ? (probe.out.match(/ffprobe version (\S+)/)?.[1] ?? 'found') : null;
  add({ id: 'ffprobe', section: 'computer', status: probeV ? 'ok' : 'warn', required: false, text: probeV ? `ffprobe ${probeV}` : 'ffprobe not found (needed to validate uploads and inspect media; browsing Examples is still available)', fix: probeV ? undefined : mediaFix });
  const dep = (name: string) => ['node_modules', 'server/node_modules'].some((d) => e.fs.existsSync(path.join(e.repoRoot, d, name))); // npm workspaces hoist most packages to the root
  const depsOk = dep('better-sqlite3') && dep('fastify') && dep('tsx');
  const mcpOk = e.fs.existsSync(path.join(e.repoRoot, 'mcp', 'node_modules'));
  add({ id: 'deps', section: 'computer', status: depsOk ? (mcpOk ? 'ok' : 'warn') : 'fail', required: true, text: depsOk ? (mcpOk ? 'App dependencies installed' : 'App dependencies installed; the MCP server’s are not') : 'App dependencies not installed', fix: !depsOk ? 'npm install' : !mcpOk ? 'npm run mcp:install' : undefined });

  // ---- App ----
  const apiPort = setting('PORT') || '8787'; const webPort = setting('WEB_PORT') || '5174'; const mcpPort = setting('MCP_PORT') || '8788';
  const apiUrl = (o.apiUrl ?? `http://127.0.0.1:${apiPort}`).replace(/\/+$/, '');
  const health = await getJson(e, `${apiUrl}/api/health`, T); const apiUp = health.ok && health.json?.ok === true;
  const webUrl = `http://localhost:${webPort}`; const mcpUrl = `http://127.0.0.1:${mcpPort}/mcp`;
  const [webUp, mcpUp] = await Promise.all([answers(e, `http://127.0.0.1:${webPort}/`, T), answers(e, mcpUrl, T)]);
  const backend = apiUp ? String(health.json.backend ?? '') || null : null; const tools = apiUp && Array.isArray(health.json.tools) ? health.json.tools.length : null;
  // npm run setup runs the doctor before it starts the app (OPENHIGGSFIELD_DOCTOR_BEFORE_START=1): the app being down then is expected, not a problem
  const beforeStart = !apiUp && e.env.OPENHIGGSFIELD_DOCTOR_BEFORE_START === '1';
  add({ id: 'api', section: 'app', status: apiUp ? 'ok' : beforeStart ? 'info' : 'warn', required: false, text: apiUp ? `API ${apiUrl} · backend ${backend}${tools != null ? ` · ${tools} tools` : ''}` : beforeStart ? 'The app isn’t started yet: setup starts it next.' : `App not running (nothing at ${apiUrl})`, fix: apiUp || beforeStart ? undefined : 'npm start   (or npm run setup)' });
  if (apiUp) add({ id: 'web', section: 'app', status: webUp ? 'ok' : 'warn', required: false, text: `Web ${webUrl} ${webUp ? '' : '(not answering)'}· MCP ${mcpUp ? mcpUrl.replace('/mcp', '') : 'not running'}`.replace('  ', ' ') });

  // ---- ComfyUI ----
  const envComfy = setting('COMFY_BASE_URL'); const appComfy = apiUp && typeof health.json.baseUrl === 'string' ? health.json.baseUrl : '';
  const cloud = (u: string) => /cloud\.comfy\.org|\.run\.comfy\.app/i.test(u);
  const tries = [o.comfyUrl, appComfy, envComfy].filter((u): u is string => !!u && !cloud(u)); if (!o.comfyUrl && !appComfy && !envComfy) tries.push('http://127.0.0.1:8188', 'http://127.0.0.1:8000'); // Comfy Desktop's default port is 8000
  let stats: any = null; let comfyUrl: string | null = null; let lat: number | null = null;
  for (const u of [...new Set(tries.map((x) => x.replace(/\/+$/, '')))]) { const s = await getJson(e, `${u}/system_stats`, T); if (s.ok && s.json?.system) { stats = s.json; comfyUrl = u; lat = s.ms; break; } if (!comfyUrl) comfyUrl = u; }
  const reachable = !!stats; const inst: ComfyInstall | null = reachable ? comfyInstallOf(stats, e.fs) : null;
  const version = stats?.system?.comfyui_version ? String(stats.system.comfyui_version) : null;
  const wantsLocal = /^(1|true)$/i.test(setting('OPENHIGGSFIELD_USE_LOCAL')) || (backend === 'comfy' && !!appComfy && !cloud(appComfy)) || (!apiUp && setting('OPENHIGGSFIELD_BACKEND') === 'comfy' && !!envComfy && !cloud(envComfy));
  let manager: string | null = null;
  if (reachable) { for (const p of ['/api/v2/manager/version', '/api/manager/version', '/manager/version']) { try { const r = await e.fetch(`${comfyUrl}${p}`, { signal: AbortSignal.timeout(T) }); if (r.ok) { const t = (await r.text()).trim(); if (t && t.length < 40) { manager = t.replace(/^"|"$/g, ''); break; } } } catch { /* */ } } }
  add(reachable ? { id: 'comfy', section: 'comfy', status: 'ok', required: wantsLocal, text: `ComfyUI ${version ?? ''} at ${comfyUrl} (${inst!.label}${lat != null ? `, ${lat} ms` : ''})${manager ? ` · Manager ${manager}` : ''}`.replace('ComfyUI  at', 'ComfyUI at') }
    : { id: 'comfy', section: 'comfy', status: wantsLocal ? 'fail' : 'info', required: wantsLocal, text: comfyUrl ? `ComfyUI not answering at ${comfyUrl}` : 'No local ComfyUI found', detail: wantsLocal ? ['The app is set to run models on this computer.'] : ['Optional: the app works with samples or Comfy Cloud without it.'],
      fix: 'Start ComfyUI (or install Comfy Desktop: https://docs.comfy.org/installation/desktop/overview)' });

  // GPU: ComfyUI's answer first, else nvidia-smi / Apple Silicon from the host
  // GPU: ComfyUI's answer first, else nvidia-smi / Apple Silicon from the host; one class for both (hardware/machineProfile.ts, shared with the server)
  const smi = nvidiaSmi(e); const host = { platform: e.platform, arch: e.arch, cpuModel: cpu, ramBytes: e.totalmem(), computeCap: smi[0]?.computeCap ?? null };
  const dev = Array.isArray(stats?.devices) ? stats.devices[0] : null;
  const mIn = dev ? inputFromSystemStats(stats, host) : smi.length ? { seen: true, ...host, gpu: { name: smi[0].name, type: 'cuda', vramTotalBytes: smi[0].totalMiB != null ? smi[0].totalMiB * 1024 * 1024 : null, count: smi.length } }
    : { seen: true, ...host, ramBytes: e.totalmem(), gpu: e.platform === 'darwin' && e.arch === 'arm64' ? { name: 'mps', type: 'mps', vramTotalBytes: null } : null };
  const profile = classifyMachine({ ...mIn, ramBytes: mIn.ramBytes ?? e.totalmem() });
  const gpu: DoctorReport['machine']['gpu'] = profile.backend === 'cpu' || profile.backend === 'unknown' ? null : { name: profile.gpuName ?? 'GPU', type: profile.backend, vramGB: profile.backend === 'mps' ? null : profile.vramGB };
  const usable = profile.usableGB;
  const memLine = profile.id === 'apple-silicon' ? ` · about ${Math.round(usable ?? 0)} GB usable for models (shared memory)` : profile.id === 'dgx-spark' ? ` · ${Math.round(usable ?? 0)} GB unified memory` : profile.vramGB != null ? ` · ${profile.vramGB} GB graphics memory` : '';
  add({ id: 'gpu', section: 'computer', status: gpu ? 'ok' : 'warn', required: false, text: gpu ? `${profile.id === 'dgx-spark' ? 'NVIDIA DGX Spark (GB10)' : gpu.name}${memLine}${profile.id === 'nvidia-blackwell' ? ' · Blackwell (nvfp4 native)' : ''}` : 'No graphics card found: local runs are limited to small image tools',
    detail: profile.notes, fix: gpu ? undefined : 'Use Comfy Cloud for the big models (Settings → Connections)' });

  // models folder + disk
  const envModels = setting('OPENHIGGSFIELD_COMFY_MODELS_DIR');
  const modelsDir = envModels || inst?.modelsDir || null; const modelsSrc = envModels ? 'settings (OPENHIGGSFIELD_COMFY_MODELS_DIR)' : inst?.modelsDir ? `found from ${inst.label}’s settings` : null;
  const modelsExists = !!modelsDir && e.fs.existsSync(modelsDir);
  if (reachable || envModels) add({ id: 'models-dir', section: 'comfy', status: modelsExists ? 'ok' : 'warn', required: false, text: modelsExists ? `Models folder ${modelsDir} (${modelsSrc})` : modelsDir ? `Models folder ${modelsDir} not found` : 'Models folder not known',
    fix: modelsExists ? (envModels ? undefined : `To download models from the app, add OPENHIGGSFIELD_COMFY_MODELS_DIR="${modelsDir}" to .env.local`) : 'Set OPENHIGGSFIELD_COMFY_MODELS_DIR to your ComfyUI models folder in .env.local' });
  let diskFree: number | null = null; const diskAt = modelsExists ? modelsDir! : e.repoRoot;
  try { const s = e.fs.statfsSync(diskAt); diskFree = Number(s.bavail) * Number(s.bsize); } catch { /* */ }
  if (diskFree != null) add({ id: 'disk', section: 'computer', status: diskFree < 20e9 ? 'warn' : 'ok', required: false, text: `${gbText(diskFree)} free ${modelsExists ? 'in the models folder' : 'on the app’s disk'}`, fix: diskFree < 20e9 ? 'Free up space: local video models need 20–80 GB each' : undefined });

  // ---- node packs (readiness/manifest/custom-nodes.json) ----
  const packs: PackState[] = []; let man: any = null;
  try { man = JSON.parse(String(e.fs.readFileSync(path.join(e.repoRoot, 'readiness/manifest/custom-nodes.json'), 'utf8'))); } catch { /* */ }
  const comfyDir = o.comfyDir || setting('OPENHIGGSFIELD_COMFY_DIR') || inst?.comfyDir || null;
  if (man?.packs && reachable) {
    let mgrList: Record<string, any> | null = null;
    if (!comfyDir && manager) for (const p of ['/api/v2/customnode/installed', '/api/customnode/installed', '/customnode/installed']) { const r = await getJson(e, `${comfyUrl}${p}`, T); if (r.ok && r.json && typeof r.json === 'object') { mgrList = r.json; break; } }
    const wfCount = (pack: string) => new Set((Array.isArray(man.classes) ? man.classes : []).filter((c: any) => c.pack === pack).flatMap((c: any) => c.workflows ?? [])).size;
    for (const [name, p] of Object.entries<any>(man.packs)) { if (!p?.dir || p.optional || !p.pin) continue;
      const st: PackState = { name, dir: p.dir, pin: String(p.pin), installed: null, pinned: null, patches: (p.patches ?? []).length, patched: null, workflows: wfCount(name), via: 'unknown' };
      if (comfyDir) { const d = path.join(comfyDir, 'custom_nodes', p.dir); st.via = 'disk'; st.installed = e.fs.existsSync(d);
        if (st.installed) { const h = e.exec('git', ['-C', d, 'rev-parse', 'HEAD']); st.pinned = h.ok ? h.out === st.pin : null;
          if (st.patches) st.patched = (p.patches as string[]).every((pf) => e.exec('git', ['-C', d, 'apply', '--reverse', '--check', path.join(e.repoRoot, 'readiness/manifest', pf)]).ok); } }
      else if (mgrList) { st.via = 'manager'; const repo = String(p.repo ?? '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').toLowerCase();
        const hit = Object.entries<any>(mgrList).find(([k, v]) => k.toLowerCase() === p.dir.toLowerCase() || String(v?.aux_id ?? '').toLowerCase() === repo);
        st.installed = !!hit && hit[1]?.enabled !== false; if (hit) { const v = String(hit[1]?.ver ?? '').trim(); st.pinned = /^[0-9a-f]{40}$/.test(v) ? v === st.pin : null; } }
      packs.push(st); }
    const missing = packs.filter((x) => x.installed === false); const off = packs.filter((x) => x.installed && x.pinned === false); const unpatched = packs.filter((x) => x.installed && x.patched === false);
    const known = packs.filter((x) => x.installed != null);
    const cmd = comfyDir ? `npm run nodes:install -- "${comfyDir}"` : 'npm run nodes:install -- "<your ComfyUI folder>"';
    const viaManager = 'In ComfyUI: Manager → Custom Nodes Manager → search the pack’s name → Install, then restart ComfyUI'; // every platform: Manager first (the script needs bash, and ComfyUI's own Python)
    if (!known.length) add({ id: 'packs', section: 'comfy', status: 'info', required: false, text: `Custom node packs not checked (${packs.length} pinned)`, detail: ['Couldn’t find the ComfyUI folder or ComfyUI Manager’s list.'], fix: 'npm run doctor -- --comfy-dir "<your ComfyUI folder>"' });
    else if (!missing.length && !off.length && !unpatched.length) add({ id: 'packs', section: 'comfy', status: 'ok', required: false, text: `All ${known.length} pinned custom node packs installed${known.every((x) => x.pinned) ? ' at their pins' : ''}` });
    else add({ id: 'packs', section: 'comfy', status: 'warn', required: false, text: [missing.length ? `${missing.length} of ${packs.length} custom node packs missing` : '', off.length ? `${off.length} not at the tested pin` : '', unpatched.length ? `${unpatched.length} without our patch` : ''].filter(Boolean).join(' · '),
      detail: [...missing.map((x) => `missing ${x.name} (used by ${x.workflows} workflow${x.workflows === 1 ? '' : 's'})`), ...off.map((x) => `${x.name}: another version than the tested ${x.pin.slice(0, 10)}`), ...unpatched.map((x) => `${x.name}: patch not applied`)],
      fix: `${viaManager}. Or from a terminal${e.platform === 'win32' ? ' (Git Bash or WSL2)' : ''}: ${cmd}` }); // Manager first on every platform
  }

  // ---- Accounts (names only) ----
  let accounts: DoctorReport['accounts'] = { source: 'none', connected: [], notConnected: [] };
  if (apiUp) { const p = await getJson(e, `${apiUrl}/api/settings/providers`, T);
    if (p.ok && Array.isArray(p.json?.providers)) { const list = p.json.providers.filter((x: any) => x.id !== 'local'); accounts = { source: 'app', connected: list.filter((x: any) => x.configured && !x.mockedKey).map((x: any) => String(x.id)), notConnected: list.filter((x: any) => !(x.configured && !x.mockedKey)).map((x: any) => String(x.id)) }; } }
  if (accounts.source === 'none') { const has = (v: string) => !!e.env[v]?.trim() || ef.names.includes(v);
    accounts = { source: ef.found ? 'env-file' : 'none', connected: ACCOUNT_ENV.filter((a) => a.vars.some(has)).map((a) => a.id), notConnected: ACCOUNT_ENV.filter((a) => !a.vars.some(has)).map((a) => a.id) }; }
  const nameOf = (id: string) => ACCOUNT_ENV.find((a) => a.id === id)?.name ?? id;
  add({ id: 'accounts', section: 'accounts', status: accounts.connected.length ? 'ok' : 'info', required: false, text: accounts.connected.length ? `Connected: ${accounts.connected.map(nameOf).join(', ')}` : 'No accounts connected (models run as free samples, or on this computer)', fix: accounts.connected.length ? undefined : 'Settings → Connections, or a key line in .env.local' });
  if (backend === 'mock' && accounts.connected.length) add({ id: 'sample-mode', section: 'accounts', status: 'info', required: false, text: 'Sample mode: runs make free samples, even with these accounts connected', fix: 'set OPENHIGGSFIELD_BACKEND=comfy in .env.local, then restart the app (npm start) (every paid run still shows its price first)' });
  const hfConnected = accounts.connected.includes('hf') || (accounts.source !== 'app' && (ACCOUNT_ENV.find((a) => a.id === 'hf')?.vars ?? []).some((v) => !!e.env[v]?.trim() || ef.names.includes(v)));
  if (!hfConnected) add({ id: 'hf', section: 'accounts', status: 'info', required: false, text: 'Hugging Face not connected: gated models (FLUX.1 Fill dev and a few others) can’t download', fix: 'Settings → Connections → Hugging Face (a free read token), or OPENHIGGSFIELD_HF_TOKEN in .env.local' });

  // ---- Local models (the app's own verdicts) ----
  let models: DoctorReport['models'] = null;
  if (apiUp) { const t = await getJson(e, `${apiUrl}/api/tools`, Math.max(T, 6000));
    const list: any[] = Array.isArray(t.json) ? t.json : Array.isArray(t.json?.tools) ? t.json.tools : [];
    if (t.ok && list.length) { const seen = new Map<string, any>();
      for (const tool of list) for (const m of tool.models ?? []) { const r = (m.runsOn ?? []).find((x: any) => x.id === 'local'); if (!r || r.status === 'coming-soon' || seen.has(m.key)) continue; seen.set(m.key, { name: m.displayName || m.name, r }); }
      models = { ready: 0, download: 0, downloadGB: 0, needsNode: 0, notOnThisComputer: 0, tooHeavy: 0, other: 0 }; const names: Record<string, string[]> = { ready: [], tooHeavy: [] };
      for (const { name, r } of seen.values()) {
        if (r.status === 'ready') { models.ready++; names.ready.push(name); }
        else if (r.reasonCode === 'weights_missing' || r.action?.kind === 'download') { models.download++; models.downloadGB += Number(r.action?.missingBytes ?? 0) / 1e9; }
        else if (r.reasonCode === 'nodes_missing') models.needsNode++;
        else if (r.reasonCode === 'unsupported_weights' || r.reasonCode === 'unsupported_hardware') models.notOnThisComputer++;
        else if (r.reasonCode === 'too_heavy' || /heavy/.test(String(r.reasonCode ?? ''))) { models.tooHeavy++; names.tooHeavy.push(name); }
        else models.other++; }
      models.downloadGB = r1(models.downloadGB);
      const where = e.platform === 'darwin' ? 'this Mac' : 'this computer';
      add({ id: 'models-ready', section: 'models', status: models.ready ? 'ok' : 'info', required: false, text: `${models.ready} ready on ${where}${names.ready.length ? `: ${names.ready.slice(0, 4).join(', ')}${names.ready.length > 4 ? ' …' : ''}` : ''}` });
      if (models.download) add({ id: 'models-download', section: 'models', status: 'warn', required: false, text: `${models.download} need a download (${models.downloadGB} GB in all${diskFree != null ? `; ${gbText(diskFree)} free` : ''})`, fix: `Open ${webUrl} and pick a model: its Generate button offers the download` });
      if (models.needsNode) add({ id: 'models-nodes', section: 'models', status: 'warn', required: false, text: `${models.needsNode} need a custom node pack`, fix: 'See the custom node line above' });
      if (models.notOnThisComputer) add({ id: 'models-os', section: 'models', status: 'info', required: false, text: `${models.notOnThisComputer} don’t run on ${where} (their weights or nodes need an NVIDIA card): they run on Comfy Cloud` });
      if (models.tooHeavy) add({ id: 'models-heavy', section: 'models', status: 'info', required: false, text: `${models.tooHeavy} too heavy for ${where}: ${names.tooHeavy.slice(0, 3).join(', ')}${names.tooHeavy.length > 3 ? ' …' : ''} (run them on Comfy Cloud)` }); } }

  const cantStart = checks.some((c) => c.required && c.status === 'fail' && (c.id === 'node' || c.id === 'deps'));
  const exitCode: 0 | 1 | 2 = cantStart ? 2 : checks.some((c) => c.required && c.status === 'fail') ? 1 : 0;
  return { ok: exitCode === 0, exitCode, checkedAt: e.now().toISOString(), readOnly: true,
    machine: { platform: e.platform, osName: os0, arch: e.arch, cpu, ramGB, gpu, usableGB: usable, profile, diskFreeGB: diskFree == null ? null : r1(diskFree / 1e9), diskPath: diskAt },
    app: { api: { url: apiUrl, up: apiUp, backend, tools }, web: { url: webUrl, up: webUp }, mcp: { url: mcpUrl, up: mcpUp } },
    comfy: { url: comfyUrl, reachable, version, kind: inst?.kind ?? null, label: inst?.label ?? null, latencyMs: lat, manager, modelsDir: modelsExists ? modelsDir : null, modelsDirSource: envModels ? 'env' : inst?.modelsDirSource ?? null, comfyDir, required: wantsLocal },
    nodePacks: packs, accounts, models, checks };
}

// ---- text output ----
const TITLES: Record<Section, string> = { computer: 'This computer', app: 'App', comfy: 'ComfyUI', accounts: 'Accounts', models: 'Local models' };
const MARK: Record<Status, string> = { ok: '✓', warn: '!', fail: '✗', info: '·' };
export function renderText(r: DoctorReport, o: { color?: boolean; verbose?: boolean } = {}): string {
  const c = (code: string, s: string) => (o.color ? `\x1b[${code}m${s}\x1b[0m` : s); const tone: Record<Status, string> = { ok: '32', warn: '33', fail: '31', info: '2' };
  const out: string[] = [c('1', 'Imagination Is All You Need · doctor') + c('2', ' · read-only, nothing installed or sent'), ''];
  for (const s of Object.keys(TITLES) as Section[]) { const cs = r.checks.filter((x) => x.section === s); if (!cs.length) continue; out.push(c('1', TITLES[s]));
    for (const x of cs) { out.push(`  ${c(tone[x.status], MARK[x.status])} ${x.text}${x.required && x.status === 'fail' ? c('31', '  (required)') : ''}`);
      for (const d of (o.verbose ? x.detail : x.detail?.slice(0, 4)) ?? []) out.push(c('2', `      ${d}`)); if ((x.detail?.length ?? 0) > 4 && !o.verbose) out.push(c('2', `      … ${x.detail!.length - 4} more (--verbose)`));
      if (x.fix && x.status !== 'ok') out.push(`      ${c('36', 'fix:')} ${x.fix}`); else if (x.fix && x.status === 'ok' && o.verbose) out.push(c('2', `      tip: ${x.fix}`)); }
    out.push(''); }
  const n = (st: Status) => r.checks.filter((x) => x.status === st).length;
  out.push(`${c('1', 'Summary')}  works ${n('ok')}  needs a fix ${n('warn') + n('fail')}  notes ${n('info')}`);
  out.push(c('2', `Details: npm run doctor -- --verbose · for agents: --json · exit code ${r.exitCode}${r.exitCode === 0 ? '' : r.exitCode === 1 ? ' (something required is missing)' : ' (the app can’t start yet)'}`));
  return out.join('\n');
}

export async function main(argv: string[], e: DoctorEnv = realEnv(), write: (s: string) => void = (s) => process.stdout.write(s)): Promise<number> {
  const o: DoctorOptions = {}; let json = false; let verbose = false;
  for (let i = 0; i < argv.length; i++) { const a = argv[i]; const next = () => argv[++i];
    if (a === '--json') json = true; else if (a === '--verbose' || a === '-v') verbose = true;
    else if (a === '--api') o.apiUrl = next(); else if (a === '--comfy') o.comfyUrl = next(); else if (a === '--comfy-dir') o.comfyDir = next(); else if (a === '--env-file') o.envFile = next();
    else if (a === '--help' || a === '-h') { write('npm run doctor [-- --json] [--verbose] [--api URL] [--comfy URL] [--comfy-dir PATH] [--env-file PATH]\nRead-only check of this computer, the app, ComfyUI, node packs, accounts (names only) and local models.\nExit 0 = works · 1 = something required is missing · 2 = the app can’t start.\n'); return 0; } }
  const r = await runDoctor(e, o);
  write(json ? JSON.stringify(r, null, 2) + '\n' : renderText(r, { color: !!process.stdout.isTTY && !e.env.NO_COLOR, verbose }) + '\n');
  return r.exitCode;
}
