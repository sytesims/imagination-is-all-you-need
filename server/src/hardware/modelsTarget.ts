/**
 * Windows setup PR 1 (2026-11-02): where model downloads go, with no setting needed. One source of truth for downloads.ts, the
 * requirements' modelsDirSet, the setup actions and GET /api/local/models-dir. In order:
 *  1. OPENHIGGSFIELD_COMFY_MODELS_DIR, when set (it must exist).
 *  2. The running ComfyUI's own folders (GET /experiment/models, hardware/comfyModels.ts), only when ComfyUI runs on this computer:
 *     each model folder goes to the first path ComfyUI lists for it (its default, so Comfy Desktop's shared folder, extra_model_paths
 *     and other drives just work).
 *     Never for a ComfyUI in Docker: the folders it lists are paths inside its container.
 *     The folder must exist, be a folder and be writable here.
 *  3. Nothing: no download is offered; the app says where the file goes inside ComfyUI's models folder instead.
 * Pure helpers (pickWriteFolder, safeJoin, whereToPut) take a path flavour, so Windows paths are tested on any OS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../env.js';
import { comfySameHost, comfyKindDetected } from '../hardware.js';
import { comfyFolderPaths, localComfyBase } from './comfyModels.js';

type PathLib = typeof path.posix;
type Exists = (p: string) => boolean;
const isDir: Exists = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const trimSep = (p: string, P: PathLib) => { const r = P.normalize(p.trim()); const root = P.parse(r).root; return r.length > root.length ? r.replace(/[\\/]+$/, '') : r; };

/** The folder to write into from ComfyUI's list for one model folder: the first that exists, else the first whose parent exists (made on
 *  download). Relative paths are skipped (they'd resolve against this server, not ComfyUI). null = none usable. */
export function pickWriteFolder(folders: string[] | null | undefined, exists: Exists = isDir, P: PathLib = path): string | null {
  const abs = (folders ?? []).filter((f) => typeof f === 'string' && f.trim() && P.isAbsolute(f.trim())).map((f) => trimSep(f, P));
  return abs.find((f) => exists(f)) ?? abs.find((f) => exists(P.dirname(f))) ?? null;
}
/** dir + a manifest file name ("sub/x.safetensors" allowed), refusing anything that leaves dir ("..", another drive, an absolute name). */
export function safeJoin(dir: string, file: string, P: PathLib = path): string | null {
  if (!file || P.isAbsolute(file) || /^[a-z]:/i.test(file)) return null;
  const base = P.resolve(dir); const d = P.resolve(base, file); return d.startsWith(base.endsWith(P.sep) ? base : base + P.sep) ? d : null;
}
/** Plain words for "put the file here" when the app can't learn the folder: ComfyUI\models\checkpoints on Windows. */
export const whereToPut = (folder: string, platform: NodeJS.Platform = process.platform) => (platform === 'win32' ? `ComfyUI\\models\\${folder.replace(/\//g, '\\')}` : `ComfyUI/models/${folder}`);

export type TargetSource = 'env' | 'comfyui' | null;
export interface ModelsTarget {
  source: TargetSource;
  /** The models folder as a whole (the env folder, or the parent of ComfyUI's checkpoints folder); null when unknown. */ root: string | null;
  /** Downloads can start: the folder is known, exists and can be written. */ writable: boolean;
  /** Why not, when not: env_missing (the env folder doesn't exist) · remote (ComfyUI on another computer) · container (ComfyUI in Docker) · unknown · not_writable. */ why: 'env_missing' | 'remote' | 'container' | 'unknown' | 'not_writable' | null;
  /** The folder a file of this model folder goes into (null = unknown). */ dirFor(folder: string): string | null;
}
const canWrite = (dir: string) => { try { fs.accessSync(dir, fs.constants.W_OK); return true; } catch { return false; } };
/** Resolve the target now (cheap: env + a cached listing; the first call for a new ComfyUI only starts the read). */
export function modelsTarget(): ModelsTarget {
  const envDir = env('COMFY_MODELS_DIR')?.trim() || null;
  if (envDir) { const ok = isDir(envDir); return { source: 'env', root: envDir, writable: ok && canWrite(envDir), why: !ok ? 'env_missing' : canWrite(envDir) ? null : 'not_writable', dirFor: (f) => (ok ? path.join(envDir, f) : null) }; }
  if (!comfySameHost()) return { source: null, root: null, writable: false, why: localComfyBase() ? 'remote' : 'unknown', dirFor: () => null };
  if (comfyKindDetected() === 'docker') return { source: null, root: null, writable: false, why: 'container', dirFor: () => null }; // container paths mean nothing on this computer
  const ck = pickWriteFolder(comfyFolderPaths('checkpoints')) ?? pickWriteFolder(comfyFolderPaths('diffusion_models'));
  if (!ck) return { source: null, root: null, writable: false, why: 'unknown', dirFor: () => null };
  const root = path.dirname(ck); const ok = isDir(root) && canWrite(root);
  return { source: 'comfyui', root, writable: ok, why: ok ? null : 'not_writable', dirFor: (f) => pickWriteFolder(comfyFolderPaths(f)) ?? path.join(root, f) };
}
/** Downloads can start here (the one check every "Download" offer uses). */
export const canDownloadHere = () => modelsTarget().writable;
