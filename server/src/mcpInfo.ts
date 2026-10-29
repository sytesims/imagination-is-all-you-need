import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The server's name in client configs (mcpServers key, `claude mcp add imagination`). Same as web/src/shared/brand.ts MCP_SERVER_KEY. */
export const MCP_SERVER_KEY = 'imagination';

/** /api/config.mcp: real paths + ready-to-paste MCP client snippets (no /ABS/PATH placeholders). */
export function mcpInfo() {
  const dir = path.resolve(HERE, '../../mcp');
  const entry = path.join(dir, 'dist', 'index.js');
  const apiUrl = process.env.OPENHIGGSFIELD_PUBLIC_API || `http://localhost:${Number(process.env.PORT) || 8787}`;
  const mcpPort = Number(process.env.MCP_PORT) || 8788;
  const httpUrl = process.env.OPENHIGGSFIELD_MCP_URL || `http://127.0.0.1:${mcpPort}/mcp`;
  const env = { OPENHIGGSFIELD_API: apiUrl };
  const stdio = { command: 'node', args: [entry], env };
  const wrap = (s: object) => JSON.stringify({ mcpServers: { [MCP_SERVER_KEY]: s } }, null, 2);
  return {
    dir, entry, built: existsSync(entry), node: process.execPath, apiUrl, httpUrl,
    stdio, // DP #20.5: no npx option (the package is not on npm; the repo stays private): run the local build
    snippets: { stdio: wrap(stdio), http: wrap({ url: httpUrl }) },
    commands: { build: 'npm run mcp:install && npm run mcp:build', stdio: `node ${entry}`, http: `node ${entry} --http --port ${mcpPort}` },
    /* Canvas + Claude Code live push (2026-10-28; docs/MCP.md "Canvas + Claude Code"): the stdio server in channel mode, under the same name, and
       the flag that lets this session hear it (custom channels need the development flag during Claude Code's channels research preview). */
    channel: {
      add: `claude mcp add ${MCP_SERVER_KEY} -e OPENHIGGSFIELD_API=${apiUrl} -- node ${entry} --channel`,
      start: `claude --dangerously-load-development-channels server:${MCP_SERVER_KEY}`,
      docs: 'https://code.claude.com/docs/en/channels-reference',
    },
  };
}
