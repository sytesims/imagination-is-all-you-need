# How Imagination Is All You Need works

## How it was built

- **Clean room, public sources only.** We looked at how popular AI video studios behave using public material (product pages, public docs and the challenge brief), wrote our own feature notes, and built every screen, icon and workflow ourselves. No Higgsfield code, workflows, images or logos are used. Some short UI labels, such as button and tab names and placeholders, match Higgsfield's on purpose so the app feels familiar. The longer copy is our own.
- **ComfyUI workflows.** Each open-weight tool is a ComfyUI graph saved in API format in [`workflows/`](../workflows/README.md). The server fills in your files, prompt and settings, then sends the graph to ComfyUI. Graphs are checked against ComfyUI's node definitions with `npm run workflows:validate`. You can open any of them in ComfyUI yourself.
- **Comfy Developer Platform.** Partner models run on **Comfy Router** with your Comfy key: the app asks Comfy for a price estimate first, never lets a run retry on another provider, and records what Comfy reports it charged. Open workflows run on **Comfy Cloud** through Comfy API v2 over plain HTTPS, and a ComfyUI on your computer is driven through its HTTP and WebSocket API. The same v2 runner can also use **your own Comfy deployment** (`COMFY_DEPLOY_URL`); that path is ready but not yet proven with a real run. The official `@comfyorg/sdk` drives one older Object Swap path.
- **App.** A Fastify + TypeScript server with SQLite (jobs, history, credits), a React + Vite web app, a REST API with an OpenAPI spec, and an MCP server so AI agents can use the same tools.

## The pieces

| Folder | What it is |
|---|---|
| `server/` | Fastify + TypeScript API on :8787: tool registry, shared job queue and history, routing, pricing and the credit ledger, mock and ComfyUI pipelines, ffmpeg steps, uploads and outputs in `server/data/` |
| `web/` | React 18 + Vite + TypeScript web app on :5174 (dev). It proxies `/api`, `/files`, `/samples` and `/s` to the API |
| `mcp/` | MCP server on :8788 (`/mcp`) that wraps the HTTP API for AI agents. See [MCP.md](MCP.md) |
| `workflows/` | ComfyUI API-format graphs, `node-map.json` and export notes |
| `plugins/` | Drop-in tools. See [PLUGINS.md](PLUGINS.md) |
| `readiness/` | Model manifest (`readiness/manifest/models.json`), custom-node pins and GPU-free readiness checks |
| `scripts/` | Installer, workflow builders and validators, API-doc generator |
| `agent-skills/` | Ready-made instructions and setup for using Imagination Is All You Need from Claude and ChatGPT over MCP |

## One shell, many tools

Imagination Is All You Need is a multi-tool shell: tools register on the server, and the web app renders each one with a shared screen at `/tools/:toolId`. All tools share one job queue and one history. Some routes:

- Object Swap `/tools/object-swap`, Motion Transfer `/tools/motion-transfer`, Restyle `/tools/restyle`, Re-shoot / Angles `/tools/reshoot`, Camera Moves `/tools/camera`, Photo FX `/tools/photo-fx`, Upscale `/tools/upscale`
- Voice Studio `/tools/voice`
- Assets `/assets` (and `/jobs/:id` for one result), History `/history`
- Models & Licences `/licenses`, usage notes `/terms`, API docs `/api-docs`

The normal backend requires a connected model service for generation. ComfyUI workflow plans and model-specific API adapters implement supported routes; browser editing and media finishing are separate operations. Explicit `OPENHIGGSFIELD_BACKEND=mock` is for development/testing, not a claim of provider execution. See [providers and models](PROVIDERS-AND-MODELS.md) for route-specific verification status.

## Jobs

1. You pick a tool, add files and a prompt, and see the price.
2. The server picks where it runs ([how](PROVIDERS-AND-MODELS.md#how-auto-picks-where-it-runs)), and queues the job (2 at a time by default).
3. The job moves through stages (for example downloading a model, loading, rendering) and you can follow it in the app or with `GET /api/jobs/:id`.
4. The run is written to the spend log with its estimate, who billed it and whether the provider charges for failures. The app holds no balance, so there is nothing to give back (team mode excepted).

Public architecture and extension guidance: [Contributing](CONTRIBUTING.md), [Workflows](../workflows/README.md) and [REST API](API.md).
