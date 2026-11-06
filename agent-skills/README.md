# Agent skills (Claude and ChatGPT)

Lets a chat agent drive Imagination Is All You Need. This is a prep-only pack: nothing here is published or uploaded for you.

| Target | What gets written |
|---|---|
| `claude` | Claude Desktop: `claude_desktop_config.json` gets `mcpServers.imagination` (merged, with a `.bak` backup; an older `openhiggsfield` entry is replaced). Claude Code: `~/.claude.json` mcpServers (merged) and the skill at `~/.claude/skills/openhiggsfield/SKILL.md`. Plus `~/.openhiggsfield/agents/claude/openhiggsfield-skill.zip` to upload in Claude (Customize → Skills → Upload skill). |
| `chatgpt` | `~/.openhiggsfield/agents/chatgpt/instructions.md` (paste into a custom GPT's Instructions) and `openapi-action.json` (paste into Actions → Import schema), generated from the live `/api/openapi.json`. |

```bash
./agent-skills/setup-agents.sh claude            # or: node mcp/dist/index.js setup claude (the MCP package is not published; see CLI.md)
./agent-skills/setup-agents.sh chatgpt          # instructions + action schema; to connect ChatGPT use the MCP route below
./agent-skills/setup-agents.sh all --dry-run     # show what would be written
```

Options: `--api URL` (default `$OPENHIGGSFIELD_API` or `http://localhost:8787`), `--public-url URL` (the ChatGPT action server), `--npx` (use `npx -y openhiggsfield-mcp` instead of the local path), `--home DIR`, `--dry-run`.

The MCP command and absolute paths come from the running server's `/api/config.mcp`, so start the app first (`npm run dev`). If it isn't running, setup falls back to the local `mcp/dist/index.js`.

**ChatGPT note:** the app has no login, so it answers only on this computer. Don't tunnel the app itself (:8787 or :5174): a public address (a tunnel host in `OPENHIGGSFIELD_ALLOWED_HOSTS`, or `OPENHIGGSFIELD_PUBLIC_URL`) only serves shared results (`/s/…`, `/api/share/…` and their media) and refuses everything else, so a REST action can't run through it. To connect ChatGPT, use the **MCP route**: in ChatGPT developer mode add the app's MCP server as a connector, tunnel only the MCP endpoint (`http://127.0.0.1:8788/mcp`), put the tunnel's own access control or a token check in front of it (the MCP server has no login either), add the tunnel host to `OPENHIGGSFIELD_ALLOWED_HOSTS`, keep paid runs on `ask` or `block` (`OPENHIGGSFIELD_MCP_SPEND`) or pin a small budget (`OPENHIGGSFIELD_AGENT_BUDGET_USD`), and close the tunnel when you're done. The REST action schema still works for a ChatGPT-compatible client on this computer.

Full CLI, environment variables and the tool list (including `upload_media`): [CLI.md](CLI.md).
