import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let cached: { repoUrl: string | null; repoUrlSource: 'env' | 'git' | null } | undefined;

/** Strip credentials (https://user:token@host/...) so a remote URL is safe to show in the UI. */
const scrub = (u: string) => u.trim().replace(/^(\w+:\/\/)[^/@]+@/, '$1');

/** /api/config.repoUrl: OPENHIGGSFIELD_REPO_URL, else `git remote get-url origin`, else null (never a guessed URL). */
export function repoInfo() {
  if (cached) return cached;
  const env = process.env.OPENHIGGSFIELD_REPO_URL?.trim();
  if (env) return (cached = { repoUrl: scrub(env), repoUrlSource: 'env' });
  try {
    const u = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).toString();
    if (u.trim()) return (cached = { repoUrl: scrub(u), repoUrlSource: 'git' });
  } catch { /* no git / no remote (e.g. Docker image) */ }
  return (cached = { repoUrl: null, repoUrlSource: null });
}
