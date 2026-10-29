/**
 * Fails when any mcp/src file is newer than its mcp/dist output (or the output is missing): stdio clients (Claude Desktop, Claude Code,
 * Cursor) run dist/index.js, and dist is git-ignored, so it can quietly lag behind src. Fix: npm run build (repo root: npm run mcp:build).
 * Run: npm run test:dist-fresh
 */
import { staleDist } from '../src/freshness.js';

const stale = staleDist();
if (stale.length) {
  console.error(`not ok dist is stale: ${stale.length} src file(s) newer than dist or not built:\n  ${stale.join('\n  ')}\nRun: npm run build (in mcp/) or npm run mcp:build (repo root).`);
  process.exit(1);
}
console.log('ok dist is fresh (every src file is older than its dist output)');
