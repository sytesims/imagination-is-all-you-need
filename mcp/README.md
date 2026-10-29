# openhiggsfield-mcp

The MCP server for [Imagination Is All You Need](../README.md): compatible clients can discover catalogued image/video/audio/3D generation tools, inspect their inputs, quote permitted runs and reuse results. The **core toolset has 15 tools**: 11 catalogue/control tools plus four read-only library searches. Default stdio enables core; default HTTP also enables 25 Canvas tools, for 40 tools. Optional toolsets expose other operations. Film-editor/project-management actions are not all dedicated MCP tools; see the REST API rather than assuming complete UI parity.

**Before connecting a funded account:** default MCP tool permissions are allow unless overridden. Direct generation calls follow those permissions, quotes and configured budgets; they are not forced through the Canvas Go button. Canvas proposals wait for Go separately. A quote is not human approval. Review permissions and the actual client's approval support, keep the service on loopback, and never assume an HTTP budget handle applies to tools that do not accept it. See [MCP safety and scope](../docs/MCP.md#safety-and-scope).

## Install

Start the app first (`npm run dev`: API on :8787, web on :5174, this server over HTTP on :8788). The mock backend is fine for trying it.

**Claude Code, one line** (from the repo root):

```bash
claude mcp add imagination -e OPENHIGGSFIELD_API=http://localhost:8787 -- node "$(pwd)/mcp/dist/index.js"   # stdio (build once: npm run mcp:build)
claude mcp add --transport http imagination http://127.0.0.1:8788/mcp                                     # or the HTTP server npm run dev already runs
```

**Claude Code plugin** (MCP over HTTP + the [creative skills](../skills/) as `/imagination:<skill>`):

```text
/plugin marketplace add /path/to/openhiggsfield
/plugin install imagination@imagination
```

**Claude Desktop**: `node mcp/dist/index.js setup claude` writes the config (and installs the skills for Claude Code), or paste:

```json
{ "mcpServers": { "imagination": { "command": "node", "args": ["/ABS/PATH/mcp/dist/index.js"], "env": { "OPENHIGGSFIELD_API": "http://localhost:8787" } } } }
```

A one-click **`.mcpb` bundle** is described by [`manifest.json`](manifest.json) (asks for the API URL, toolsets and a budget cap): `npm run build && npx @anthropic-ai/mcpb pack` in `mcp/`. [`server.json`](server.json) is the entry for the official MCP Registry (not published yet; the package isn't on npm).

**Skills by hand**: copy the folders in [`../skills/`](../skills/) to `~/.claude/skills/` (or a project's `.claude/skills/`). Walkthrough: [docs/MCP-SKILLS.md](../docs/MCP-SKILLS.md).

## Toolsets

`OPENHIGGSFIELD_MCP_TOOLSETS` (comma list, or `"toolsets": [...]` in the permissions file). Default `core`.

| Toolset | Tools |
|---|---|
| **core** (default) | `search_capabilities`, `describe`, `quote`, `run`, `status`, `get_outputs`, `cancel`, `upload`, `history`, `recipe`, `budget`, plus the read-only library searches `search_workflows`, `get_workflow_recipe`, `search_references`, `get_reference` ([docs/LIBRARY.md](../docs/LIBRARY.md)) |
| library | `retry`, `list_workflows`, `next_actions`, `stitch_video`, `direct_a_shot_prep` |
| admin | `server_status`, `get_spend` |
| canvas | `canvas_list_boards`, `canvas_create_board`, `canvas_rename_board`, `canvas_switch_board`, `canvas_open_board`, `canvas_read_board`, `canvas_list_workflows`, `canvas_add_card`, `canvas_add_from_job`, `canvas_update_card`, `canvas_connect`, `canvas_next_steps`, `canvas_batch`, `canvas_review`, `canvas_wait_for_message`, `canvas_remove_card`, `canvas_propose_run`, `canvas_proposal_status`, `canvas_say`, `canvas_inbox`, `canvas_add_note`, `canvas_add_frame`, `canvas_move_into`, `canvas_point_at`, `canvas_ask_pick` (see [docs/MCP.md](../docs/MCP.md#drive-the-canvas)) |
| legacy | the per-feature tools from before: `list_tools`, `list_models`, `generate_image`, `generate_soul`, `generate_video`, `generate_audio`, `create_story`, `story_status`, `retry_story`, `object_swap`, `motion_transfer`, `restyle`, `upload_media`, `quote_cost`, `preflight`, `set_budget`, `get_budget`, `plan_budget`, `get_receipt`, `get_job`, `wait_for_job`, `job_status`, `get_asset` |

`all` turns on everything. **Changed (2026-10-26):** the old per-feature tools and the canvas tools are no longer on by default. Agents that use them: set `OPENHIGGSFIELD_MCP_TOOLSETS=core,legacy,canvas` (or `all`). They map onto core as: `list_tools`/`list_models` → `search_capabilities` + `describe`; `generate_*`, `object_swap`, `motion_transfer`, `restyle` → `run`; `quote_cost`/`plan_budget` → `quote` / `budget {action:"plan"}`; `get_job`/`wait_for_job` → `status`; `get_asset` → `get_outputs`; `upload_media` → `upload`; `set_budget`/`get_budget`/`get_receipt` → `budget`.

## Core tools

| Tool | What it does | Spends? |
|---|---|---|
| `search_capabilities` | Find tools, tool modes (`footage-fx/vanish`, `voice/voiceover`…), workflows and flows (Video Swap, Loop, Morph, Extend, Make it talk, Direct a Shot, Look → Viral templates…, from the app's `GET /api/capabilities`) and models (real names, open weights, licence, cheapest price, local or not) by everyday words ("seamless loop", "remove people", "talking photo", "text to speech", "free video"), ranked, each with ready `run` arguments. No query: an overview, including whether results are real or samples and the run_on places. | no |
| `describe` | A workflow/flow/template id (`video/loop`, `template/fruit-drama`) or tool mode (`footage-fx/vanish`) → its run arguments plus the tool below, its model first. One tool id → its job fields as JSON Schema (allowed values, required, which take media), presets, and every model with limits (lengths, resolutions, aspects, sound, loop, reference kinds) and run_on places with prices. A model key or workflow id works too. | no |
| `quote` | Price the exact request `run` will send: credits (1 = $0.01), USD, where it is billed, runnable or why not, budget fit, and a `quote_id`. `compare:true` prices it on every model, cheapest first. | no |
| `run` | Start a job on any tool (`tool_id` list generated from the catalogue). Quotes first; a **paid run needs a fresh `quote_id`** for that exact request; `max_usd` caps it; `budget_id` ties it to a budget; `client_request_id` makes a retried call return the first job. Waits `wait_sec` (default 30), then returns the job id with `poll_after_sec`. | paid runs only |
| `status` | A job's state, or wait up to `wait_sec` with progress notifications. | no |
| `get_outputs` | Result links (web app), resource links, `curl` lines, seed, real model. `include_image` inlines one image only when asked. | no |
| `cancel` | Stop a queued or running job; says whether anything was charged. | no |
| `upload` | Add a file (path, URL or small base64) to the library → `/files/…` URL for any media field. | no |
| `history` | Past and running jobs: filter by tool, status, media, words. | no |
| `recipe` | `export` a job's recipe + link, `import` a recipe link/JSON into ready `run` arguments with a quote, `share` / `unshare` its public page. | no |
| `budget` | `set` (returns `budget_id`), `get`, `plan` (price a whole plan), `receipt` (itemised, estimate vs actual), `spend` (per provider, today or this month). | no |

Typical flow: `search_capabilities` → `describe` → `quote` (tell the user the price) → `run` with the `quote_id` → `status` → `get_outputs` → `budget {action:"receipt"}`. Media fields take a local path, an http(s) URL or a `/files/…` / `/samples/…` path.

Discovery omits `listed:false` tools, including the old two-person swap; explicit legacy IDs and recipes remain supported. New replacement workflows use **Object / Person Swap** (`object-swap`). H3 Character Swap is not available for new Motion Transfer requests. Seedance motion is performance-guided generation with automatic task classification, not guaranteed exact scene/timing preservation. `describe` includes model and route-specific limits; `quote` counts every supplied reference. Auxiliary mask previews appear in `diagnostics`, never in primary `outputs` or `result_url`.

Film project editing is currently REST-only (`/api/films`, documented in the API's `/api/docs`); legacy story tools and `stitch_video` do not implement that editor's operations.

## Money: approval, quotes, budgets

- **Tiers.** Read-only tools (discover, quote, history) are always allowed. Spend tools (`run`, `retry`, legacy `generate_*`…) follow `"spend"` in the permissions file or `OPENHIGGSFIELD_MCP_SPEND=allow|ask|block`. With `ask`, `run` asks the user through MCP elicitation **only when the quote costs money**, with the model, place and price in the question; free local runs go straight through.
- **Quote handshake.** `run` refuses a paid job without a `quote_id` from `quote` for the same tool, fields, model, run_on and draft (valid 15 min). It sends the quoted credits and route to the app (`quotedCredits` / `quotedRouteId`), and the app refuses the job (409 `route_changed`, nothing charged) if the price or place changed since.
- **Budgets are handles.** `budget {action:"set"}` returns a `budget_id`; pass it to `quote`, `run`, `status` and `budget`. The app refuses a run that would go over it before anything is sent. Over HTTP (many clients, one process) a budget only applies where its id is passed; over stdio the session also uses it by default. `OPENHIGGSFIELD_AGENT_BUDGET_USD` / `_ID` pins one for the whole process; a per-call `budget_id` cannot replace it. A non-runnable quote also refuses submission. A quote ID is not itself human approval: tell the user the price and honor the configured spend permission.
- Per-tool rules still work: `OPENHIGGSFIELD_MCP_PERMISSIONS=/path/permissions.json` (see [`permissions.example.json`](permissions.example.json)), `OPENHIGGSFIELD_MCP_ALLOW|ASK|BLOCK=tool,tool`, `OPENHIGGSFIELD_MCP_DEFAULT`.

## Also exposed

- **Annotations** on every tool (readOnlyHint, destructiveHint, idempotentHint, openWorldHint) and **outputSchema + structuredContent** on the core tools.
- **Resources**: `imagination://catalog/tools`, `imagination://catalog/tools/{id}`, `imagination://catalog/models`, `imagination://catalog/workflows`, `imagination://prices/{id}` (model × run_on price table), `imagination://run-on`.
- **Prompts** (slash commands): one per skill in [`../skills/`](../skills/) (`viral-format`, `ugc-ad`, `product-photo-pack`, `ad-multiplier`, `footage-fx-pass`, `drama-series`, `release-kit`, `faceless-explainer`, `make-ad-variants`, `direct-a-shot`, `storyboard-to-video`, `music-video`, `free-local-only`, `cost-check`) plus `what-can-you-do`. They read the skill files, so they never drift from the skills.
- **Server instructions**: a short playbook every client gets on connect.

## Run it

- stdio is the default: `node mcp/dist/index.js`. HTTP: `node mcp/dist/index.js --http [--port 8788]` → `http://127.0.0.1:8788/mcp` (initialize returns a session ID; legacy stateless requests remain supported; `GET /health`). Loopback is the default, not authentication: do not expose it publicly without a separate authenticated gateway.
- `OPENHIGGSFIELD_API` (default `http://localhost:8787`); `PUBLIC_WEB_URL` is where result links point (default `http://localhost:5174`).
- The tool list comes from the live API (cached 30 s). When the API is down at start, `run` falls back to [`src/catalog.snapshot.ts`](src/catalog.snapshot.ts); refresh it with `OPENHIGGSFIELD_API=… npm run gen:catalog`.

## Tests

`npm run test:catalog` boots an isolated mock API and checks that every server tool is in `run` and `describe`, the snapshot is current, every API path the server calls is in `/api/openapi.json`, every tool is in this README, and the whole flow (quote handshake, budgets, idempotency, recipes, history…). `npm run test:search` checks every tool, tool mode and workflow is findable by its name and the common phrases ("video swap", "vanish", "make it talk", "continue video", "text to speech"…) land on the right item; the extra words live in `server/src/capabilities.ts` KEYWORDS (its test fails on a stale key). `npm run test:skills` follows every skill in `../skills/` step by step over MCP against a mock app and checks each SKILL.md only names real tools, modes and models. Also `test:permissions` (needs a mock API in `OPENHIGGSFIELD_API`), `test:job-view`, `test:e2e`.

## Next

- An **MCP App job card**: `run` / `status` rendering a live card in chat (progress, preview, player, real model, estimate vs actual, Approve / Cancel / Re-roll).
- Publish to npm + the MCP Registry, attach the `.mcpb` to releases.
