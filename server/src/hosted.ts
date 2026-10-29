/** Hosted demo flag (OPENHIGGSFIELD_HOSTED=1, read in ledger.ts for the signup grant): /api/config.hosted, and hides self-host specifics
 * (local MCP paths, node binary, build/stdio commands) from /api/config.mcp. The HTTP snippet stays (no npx option: the MCP package is not published). */
import { HOSTED } from './ledger.js';
export { HOSTED };
export function publicMcpInfo<T extends Record<string, any>>(m: T) {
  if (!HOSTED) return m;
  const { dir, entry, node, stdio, commands, channel, ...rest } = m as any; void dir; void entry; void node; void stdio; void commands; void channel; /* channel: local paths too */
  return { ...rest, snippets: { http: m.snippets?.http }, selfHostHidden: true };
}
