/**
 * Is mcp/dist (what stdio clients run: Claude Desktop, Claude Code, Cursor) older than mcp/src?
 * dist is git-ignored, so after a pull it can lag behind src; `setup` warns, stdio logs a warning, and `npm run test:dist-fresh` fails.
 * Fix: `npm run mcp:build` (or re-run ./agent-skills/setup-agents.sh, which rebuilds when stale).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** mcp/ (works from src/ under tsx and from dist/ under node). */
export const MCP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** src files (relative) whose dist output is missing or older. Empty = fresh. */
export function staleDist(dir = MCP_DIR): string[] {
  const src = path.join(dir, 'src'); const stale: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.ts$/.test(e.name) || e.name.endsWith('.d.ts')) continue;
      const rel = path.relative(src, p); const out = path.join(dir, 'dist', rel.replace(/\.ts$/, '.js'));
      const outTime = fs.existsSync(out) ? fs.statSync(out).mtimeMs : 0;
      if (fs.statSync(p).mtimeMs > outTime) stale.push(rel);
    }
  };
  if (fs.existsSync(src)) walk(src);
  return stale.sort();
}

/** One-line warning, or null when dist is fresh (or there is no src next to it, e.g. a packed install). */
export function staleWarning(dir = MCP_DIR): string | null {
  const s = staleDist(dir); if (!s.length) return null;
  return `mcp/dist is older than mcp/src (${s.length} file${s.length > 1 ? 's' : ''}: ${s.slice(0, 3).join(', ')}${s.length > 3 ? ', …' : ''}). Agents on stdio get an old server. Run: npm run mcp:build`;
}
