# Imagination Is All You Need MCP CLI and agent skills

The MCP server lives in `mcp/` and is **not published to npm** (`"private": true` in `mcp/package.json`). Run it from this repo.
`npx openhiggsfield-mcp …` works only after you link it locally (`cd mcp && npm link`); it does not download anything from the registry.

## Build once
```bash
npm run mcp:install && npm run mcp:build     # → mcp/dist/index.js
```
`mcp/dist` is not in git, so rebuild after every pull. `npm run test:dist-fresh --prefix mcp` fails when it is older than `mcp/src`, the stdio server logs a warning, and `./agent-skills/setup-agents.sh` rebuilds it for you.

## Commands
| Command | What it does |
|---|---|
| `node mcp/dist/index.js` (`npm run mcp`) | MCP over stdio (Claude Desktop, Claude Code, Cursor). |
| `node mcp/dist/index.js --http [--port 8788]` (`npm run mcp:http`) | Streamable HTTP at `http://127.0.0.1:8788/mcp` (POST/GET/DELETE). Binds to 127.0.0.1 unless `MCP_HOST` is set. |
| `node mcp/dist/index.js setup claude\|chatgpt\|all [--api URL] [--public-url URL] [--npx] [--home DIR] [--dry-run]` | Writes agent config and skills (see README.md in this folder). Same as `./agent-skills/setup-agents.sh`. |
| `npm run mcp:test` | MCP end-to-end test against a running API. |

## Environment
| Variable | Default | Meaning |
|---|---|---|
| `OPENHIGGSFIELD_API` | `http://localhost:8787` | API the MCP tools call. |
| `MCP_TRANSPORT=http`, `MCP_PORT`, `MCP_HOST` | stdio, 8788, 127.0.0.1 | HTTP transport settings. |
| `OPENHIGGSFIELD_MCP_POLL_MS` | 2000 | First poll interval when waiting for a job (backs off to 10 s). |
| `OPENHIGGSFIELD_MCP_PERMISSIONS` | `./openhiggsfield-mcp.json`, else `mcp/permissions.json` | Per-tool permissions file `{ "default": "allow", "spend": "ask", "tools": { "retry": "ask" } }`. |
| `OPENHIGGSFIELD_MCP_DEFAULT`, `_ALLOW`, `_ASK`, `_BLOCK` | allow | Per-tool overrides (comma lists, `*` = all). `ask` uses MCP elicitation; clients without it get a clear refusal. |

## Tools
The default stdio `core` toolset contains 15 tools: the 11 catalogue/control tools below plus four read-only workflow/media searches. These discover and operate catalogued generation features; they are not complete coverage of every web-editor action:
`search_capabilities`, `describe`, `quote`, `run`, `status`, `get_outputs`, `cancel`, `upload`, `history`, `recipe`, `budget`.

Opt-in toolsets (`OPENHIGGSFIELD_MCP_TOOLSETS=core,library`, or `all`):
| Toolset | Tools |
|---|---|
| `library` | `retry`, `list_workflows`, `next_actions`, `stitch_video`, `direct_a_shot_prep` |
| `admin` | `server_status`, `get_spend` |
| `canvas` | `canvas_list_boards`, `canvas_create_board`, `canvas_rename_board`, `canvas_switch_board`, `canvas_open_board`, `canvas_read_board`, `canvas_list_workflows`, `canvas_add_card`, `canvas_add_from_job`, `canvas_update_card`, `canvas_connect`, `canvas_remove_card`, `canvas_propose_run`, `canvas_proposal_status`, `canvas_say`, `canvas_inbox`, `canvas_add_note`, `canvas_add_frame`, `canvas_move_into`, `canvas_point_at`, `canvas_ask_pick` |
| `legacy` | The older per-feature tools (`generate_video`, `quote_cost`, `get_job`…), kept so existing agents keep working. New agents should use `core`. |

The source of truth is `mcp/src/toolsets.ts`; the live list is `GET /api/mcp/tools`. A paid `run` needs a `quote_id` from `quote` (see docs/MCP.md).

**`upload`** `{ file }` (or `base64`): adds a local path or http(s) URL (PNG, JPG, WEBP, MP4, MOV, WEBM, WAV, MP3, M4A) to the media library and returns its `/files/…` URL. Pass that URL as a media input to any run, so one upload can feed several runs.

## Skills
- Claude: `agent-skills/claude/openhiggsfield/SKILL.md` (installed to `~/.claude/skills/openhiggsfield/` by `setup claude`, plus an uploadable zip).
- ChatGPT: `agent-skills/chatgpt/instructions.md` + an Actions schema generated from the live `/api/openapi.json` by `setup chatgpt`.
Nothing is uploaded or published for you; setup only writes local files (with `.bak` backups when it merges a config).
