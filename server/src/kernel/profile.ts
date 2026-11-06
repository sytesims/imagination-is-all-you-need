/**
 * Profiles (plan §5): which plugins a server runs. server/profiles/<name>.yml, picked by OPENHIGGSFIELD_PROFILE (a name or a path; default
 * 'desktop'). The format is a small YAML subset, read here without a YAML library:
 *
 *   name: desktop
 *   plugins:
 *     - place-fal        # a plugin id; leave a line out (or comment it) to turn that plugin off
 *     - legacy
 */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

export const PROFILES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../profiles');
export interface Profile { name: string; plugins: string[]; file: string }

export function profileFile(nameOrPath = process.env.OPENHIGGSFIELD_PROFILE?.trim() || 'desktop'): string {
  return /[\\/]|\.ya?ml$/i.test(nameOrPath) ? path.resolve(nameOrPath) : path.join(PROFILES_DIR, `${nameOrPath}.yml`);
}

export function parseProfile(text: string, file = '(profile)'): Profile {
  let name = path.basename(file).replace(/\.ya?ml$/i, ''); const plugins: string[] = []; let inList = false;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/\s+#.*$|^\s*#.*$/, '').trimEnd(); if (!line.trim()) return;
    const top = /^([a-z][\w-]*):\s*(.*)$/i.exec(line); const item = /^\s+-\s+(\S+)$/.exec(line);
    if (top) { inList = top[1] === 'plugins' && !top[2]; if (top[1] === 'name' && top[2]) name = top[2].trim(); else if (top[1] !== 'plugins' && top[1] !== 'name') throw new Error(`${file}:${i + 1}: unknown key "${top[1]}"`); return; }
    if (item && inList) { if (!/^[a-z0-9][a-z0-9-]*$/.test(item[1])) throw new Error(`${file}:${i + 1}: bad plugin id "${item[1]}"`); if (!plugins.includes(item[1])) plugins.push(item[1]); return; }
    throw new Error(`${file}:${i + 1}: can't read "${raw.trim()}"`);
  });
  return { name, plugins, file };
}

export function readProfile(nameOrPath?: string): Profile {
  const file = profileFile(nameOrPath);
  let text: string; try { text = fs.readFileSync(file, 'utf8'); } catch { throw new Error(`profile not found: ${file}`); }
  return parseProfile(text, file);
}
