/**
 * Profiles (plan §5): which plugins a server runs. server/profiles/<name>.yml, picked by OPENHIGGSFIELD_PROFILE (a name or a path; default
 * 'desktop'). The format is a small YAML subset, read here without a YAML library:
 *
 *   name: desktop
 *   plugins:
 *     - place-fal        # a plugin id; leave a line out (or comment it) to turn that plugin off
 *     - legacy
 *   config:            # optional: settings per plugin (ctx.settings; 'kernel' = the server itself). Scalars only; env and kv win over these.
 *     kernel:
 *       port: 8787
 */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

export const PROFILES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../profiles');
export type Scalar = string | number | boolean;
export interface Profile { name: string; plugins: string[]; file: string; config?: Record<string, Record<string, Scalar>> }
const scalar = (v: string): Scalar => { const t = v.trim().replace(/^(['"])(.*)\1$/, '$2'); return /^(true|false)$/.test(t) ? t === 'true' : /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t; };

export function profileFile(nameOrPath = process.env.OPENHIGGSFIELD_PROFILE?.trim() || 'desktop'): string {
  return /[\\/]|\.ya?ml$/i.test(nameOrPath) ? path.resolve(nameOrPath) : path.join(PROFILES_DIR, `${nameOrPath}.yml`);
}

export function parseProfile(text: string, file = '(profile)'): Profile {
  let name = path.basename(file).replace(/\.ya?ml$/i, ''); const plugins: string[] = []; let block: 'plugins' | 'config' | null = null;
  const config: Record<string, Record<string, Scalar>> = {}; let section: string | null = null;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/\s+#.*$|^\s*#.*$/, '').trimEnd(); if (!line.trim()) return;
    const top = /^([a-z][\w-]*):\s*(.*)$/i.exec(line); const item = /^\s+-\s+(\S+)$/.exec(line);
    if (top) { block = (top[1] === 'plugins' || top[1] === 'config') && !top[2] ? top[1] : null; section = null; if (top[1] === 'name' && top[2]) name = top[2].trim(); else if (top[1] !== 'plugins' && top[1] !== 'name' && top[1] !== 'config') throw new Error(`${file}:${i + 1}: unknown key "${top[1]}"`); return; }
    if (item && block === 'plugins') { if (!/^[a-z0-9][a-z0-9-]*$/.test(item[1])) throw new Error(`${file}:${i + 1}: bad plugin id "${item[1]}"`); if (!plugins.includes(item[1])) plugins.push(item[1]); return; }
    const sec = /^ {2}([a-z0-9][a-z0-9-]*):\s*$/.exec(line); const kv = /^ {4}([a-zA-Z][\w]*):\s*(\S.*)$/.exec(line);
    if (sec && block === 'config') { section = sec[1]; config[section] ??= {}; return; }
    if (kv && block === 'config' && section) { config[section][kv[1]] = scalar(kv[2]); return; }
    throw new Error(`${file}:${i + 1}: can't read "${raw.trim()}"`);
  });
  return Object.keys(config).length ? { name, plugins, file, config } : { name, plugins, file };
}

export function readProfile(nameOrPath?: string): Profile {
  const file = profileFile(nameOrPath);
  let text: string; try { text = fs.readFileSync(file, 'utf8'); } catch { throw new Error(`profile not found: ${file}`); }
  return parseProfile(text, file);
}
