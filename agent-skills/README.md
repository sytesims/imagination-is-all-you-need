# Agent skills (Claude and ChatGPT)

Lets a chat agent drive Imagination Is All You Need. This is a prep-only pack: nothing here is published or uploaded for you.

| Target | What gets written |
|---|---|
| `claude` | Claude Desktop: `claude_desktop_config.json` gets `mcpServers.imagination` (merged, with a `.bak` backup; an older `openhiggsfield` entry is replaced). Claude Code: `~/.claude.json` mcpServers (merged) and the skill at `~/.claude/skills/openhiggsfield/SKILL.md`. Plus `~/.openhiggsfield/agents/claude/openhiggsfield-skill.zip` to upload in Claude (Customize → Skills → Upload skill). |
| `chatgpt` | `~/.openhiggsfield/agents/chatgpt/instructions.md` (paste into a custom GPT's Instructions) and `openapi-action.json` (paste into Actions → Import schema), generated from the live `/api/openapi.json`. |

```bash
./agent-skills/setup-agents.sh claude            # or: node mcp/dist/index.js setup claude (the MCP package is not published; see CLI.md)
./agent-skills/setup-agents.sh chatgpt --public-url https://<your-tunnel>   # ChatGPT must reach the API over public HTTPS
./agent-skills/setup-agents.sh all --dry-run     # show what would be written
```

Options: `--api URL` (default `$OPENHIGGSFIELD_API` or `http://localhost:8787`), `--public-url URL` (the ChatGPT action server), `--npx` (use `npx -y openhiggsfield-mcp` instead of the local path), `--home DIR`, `--dry-run`.

The MCP command and absolute paths come from the running server's `/api/config.mcp`, so start the app first (`npm run dev`). If it isn't running, setup falls back to the local `mcp/dist/index.js`.

**ChatGPT note:** the action needs an HTTPS URL that ChatGPT can reach. The API is local and private, so expose it only through a tunnel you control, protect it with authentication, and remove it when done. Don't put a private server on a public URL without auth.

Full CLI, environment variables and the tool list (including `upload_media`): [CLI.md](CLI.md).
