/**
 * Child processes without our keys (security review 2026-11-07, F7). ffmpeg / ffprobe, the voice runner (Python and its packages), tar,
 * git, ComfyUI's launcher and the other tools we start get this process's environment minus every variable that holds (or may hold) a
 * secret: provider keys, *_KEY, *_TOKEN, SECRET, PASSWORD, CREDENTIAL, AUTH, COOKIE (security/secretVars.ts). An env passed by
 * the caller is scrubbed the same way. Same signatures as node:child_process: import { spawn } from here instead.
 * Not used for the server starting itself (kernel/dump.ts), which needs the keys to report whether they are set.
 */
import * as cp from 'node:child_process';
import { isSecretVar } from './secretVars.js';

/** The environment for a child: `base` (default process.env) without secret variables. */
export function childEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(base)) if (v !== undefined && !isSecretVar(k)) out[k] = v;
  return out;
}
const clean = <O>(o: O | undefined): O => ({ ...(o ?? {}), env: childEnv((o as { env?: NodeJS.ProcessEnv } | undefined)?.env ?? process.env) }) as O;
const isOpts = (x: unknown) => !!x && typeof x === 'object' && !Array.isArray(x);

/** (file, args?, options?) with the options (made or given) scrubbed. */
function argsOf(a: unknown[]): [unknown[] | undefined, unknown, unknown[]] {
  const args = Array.isArray(a[0]) ? (a.shift() as unknown[]) : undefined;
  const opts = isOpts(a[0]) ? a.shift() : undefined;
  return [args, clean(opts as object | undefined), a];
}
const call = (fn: (...x: any[]) => any) => (file: string, ...a: unknown[]) => { const [args, opts, rest] = argsOf(a); return fn(file, args ?? [], opts, ...rest); };

export const spawn = call(cp.spawn) as typeof cp.spawn;
export const spawnSync = call(cp.spawnSync) as typeof cp.spawnSync;
export const execFile = call(cp.execFile) as typeof cp.execFile;
export const execFileSync = call(cp.execFileSync) as typeof cp.execFileSync;
/** execSync(command, options?): Windows npm only (doctor). */
export const execSync = ((command: string, o?: cp.ExecSyncOptions) => cp.execSync(command, clean(o))) as typeof cp.execSync;
