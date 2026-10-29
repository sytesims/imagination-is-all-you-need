/**
 * Setup step 4 (2026-10-26): what kind of ComfyUI is connected and where its folders are, read from ComfyUI's own GET /system_stats
 * (system.deploy_environment, system.embedded_python, system.argv) plus Comfy Desktop's settings files next to the model-paths file it passes
 * with --extra-model-paths-config. Pure: node:fs reads only, no network, no database, so `npm run doctor` and the server share it.
 *  - kind: desktop (deploy_environment mentions desktop) · portable (Windows portable build: embedded_python) · docker · manual (a git clone) · unknown.
 *  - modelsDir: the default entry's base_path in the extra-model-paths YAML (Desktop writes one per install, e.g.
 *    ~/Library/Application Support/Comfy Desktop/instance-model-paths/inst-<id>.yaml), else <--base-directory>/models, else <folder of main.py>/models.
 *  - comfyDir: Desktop's installations.json (same folder as instance-model-paths) → installPath/ComfyUI, else --base-directory, else the folder of main.py.
 * Nothing here is trusted for writing: downloads still need an explicit OPENHIGGSFIELD_COMFY_MODELS_DIR (hardware/downloads.ts).
 */
import fs from 'node:fs';
import path from 'node:path';

export type ComfyKind = 'desktop' | 'portable' | 'docker' | 'manual' | 'unknown';
export const COMFY_KIND_LABEL: Record<ComfyKind, string> = { desktop: 'Comfy Desktop', portable: 'ComfyUI portable', docker: 'ComfyUI in Docker', manual: 'ComfyUI (own install)', unknown: 'ComfyUI' };
export interface ComfyInstall {
  kind: ComfyKind; label: string; deployEnvironment: string | null;
  /** Where the model folders are, or null when it couldn't be worked out. */ modelsDir: string | null;
  modelsDirSource: 'desktop-yaml' | 'extra-paths-yaml' | 'base-directory' | 'main-py' | null;
  /** The ComfyUI folder (has custom_nodes/), or null. */ comfyDir: string | null;
  extraModelPathsConfig: string | null; managerFlag: boolean;
}
type FsLike = { existsSync: (p: string) => boolean; readFileSync: (p: string, enc: 'utf8') => string };

/** Value after a flag in argv (`--flag value` or `--flag=value`). */
export function argValue(argv: unknown, flag: string): string | null {
  if (!Array.isArray(argv)) return null;
  for (let i = 0; i < argv.length; i++) { const a = String(argv[i]); if (a === flag && i + 1 < argv.length) return String(argv[i + 1]); if (a.startsWith(flag + '=')) return a.slice(flag.length + 1); }
  return null;
}
export function comfyKindOf(stats: any): ComfyKind {
  const sys = stats?.system; if (!sys) return 'unknown'; const de = String(sys.deploy_environment ?? '').toLowerCase();
  if (de.includes('desktop')) return 'desktop'; if (de.includes('docker') || de.includes('container')) return 'docker';
  if (sys.embedded_python === true) return 'portable';
  return 'manual';
}
/** The base_path of a ComfyUI extra_model_paths YAML: the entry marked is_default: true, else the first one. A tiny line reader (the format is flat). */
export function yamlBasePath(text: string): string | null {
  const entries: { base: string | null; def: boolean }[] = []; let cur: { base: string | null; def: boolean } | null = null;
  for (const raw of text.split(/\r?\n/)) { if (/^\s*#/.test(raw) || !raw.trim()) continue;
    if (/^\S[^:]*:\s*$/.test(raw)) { cur = { base: null, def: false }; entries.push(cur); continue; }
    const m = raw.match(/^\s+(['"]?)(base_path|is_default)\1\s*:\s*(.*)$/); if (!m || !cur) continue;
    const v = m[3].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (m[2] === 'base_path') cur.base = v || null; else cur.def = /^true$/i.test(v); }
  return (entries.find((e) => e.def && e.base) ?? entries.find((e) => e.base))?.base ?? null;
}
const expandHome = (p: string) => (p.startsWith('~') ? path.join(process.env.HOME || process.env.USERPROFILE || '', p.slice(1)) : p);
export function comfyInstallOf(stats: any, f: FsLike = fs): ComfyInstall {
  const kind = comfyKindOf(stats); const sys = stats?.system ?? {}; const argv: unknown[] = Array.isArray(sys.argv) ? sys.argv : [];
  const out: ComfyInstall = { kind, label: COMFY_KIND_LABEL[kind], deployEnvironment: sys.deploy_environment ? String(sys.deploy_environment) : null, modelsDir: null, modelsDirSource: null, comfyDir: null,
    extraModelPathsConfig: argValue(argv, '--extra-model-paths-config'), managerFlag: argv.some((a) => a === '--enable-manager') };
  const exists = (p: string) => { try { return f.existsSync(p); } catch { return false; } };
  const yaml = out.extraModelPathsConfig;
  if (yaml) { try { const base = yamlBasePath(f.readFileSync(yaml, 'utf8')); if (base) { out.modelsDir = path.resolve(path.dirname(yaml), expandHome(base)); out.modelsDirSource = kind === 'desktop' ? 'desktop-yaml' : 'extra-paths-yaml'; } } catch { /* unreadable: another computer, or no access */ } }
  // Comfy Desktop: instance-model-paths/inst-<id>.yaml → ../installations.json [{id, installPath}] → <installPath>/ComfyUI
  if (yaml && kind === 'desktop') { try { const id = path.basename(yaml).replace(/\.ya?ml$/i, ''); const list = JSON.parse(f.readFileSync(path.join(path.dirname(path.dirname(yaml)), 'installations.json'), 'utf8'));
    const hit = (Array.isArray(list) ? list : list?.installations ?? []).find((x: any) => x?.id === id); const ip = hit?.installPath ? String(hit.installPath) : null;
    if (ip) { const c = [path.join(ip, 'ComfyUI'), ip].find((d) => exists(path.join(d, 'custom_nodes'))); if (c) out.comfyDir = c; } } catch { /* not there */ } }
  const baseDir = argValue(argv, '--base-directory');
  if (baseDir) { if (!out.comfyDir && exists(path.join(baseDir, 'custom_nodes'))) out.comfyDir = baseDir; if (!out.modelsDir && exists(path.join(baseDir, 'models'))) { out.modelsDir = path.join(baseDir, 'models'); out.modelsDirSource = 'base-directory'; } }
  const main = argv.length ? String(argv[0]) : ''; if (main && path.isAbsolute(main) && /main\.py$/i.test(main)) { const d = path.dirname(main);
    if (!out.comfyDir && exists(path.join(d, 'custom_nodes'))) out.comfyDir = d; if (!out.modelsDir && exists(path.join(d, 'models'))) { out.modelsDir = path.join(d, 'models'); out.modelsDirSource = 'main-py'; } }
  return out;
}
