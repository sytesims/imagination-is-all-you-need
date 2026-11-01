# AGENTS.md: set up and run Imagination Is All You Need

Instructions for AI coding agents installing and running Imagination Is All You Need for a user. Humans: the same steps are in [docs/INSTALL.md](docs/INSTALL.md).

## Rules for agents

- **Ask before anything large.** Never download models or install ComfyUI without the user's OK. Say the size first (model downloads are often 10–75 GB).
- **Keys stay secret.** Never print, echo, log or paste API keys or tokens. Never commit `.env.local` (or any `.env*` file except `.env.example`). Check with `git status` before any commit.
- **Ask, don't guess,** which way the user wants to run it (step 3) and where their ComfyUI `models` folder is.
- **Don't change routing for the user** (Use local ComfyUI, pins) unless they ask.
- **Real cloud runs cost the user money** on their Comfy Cloud or provider account. Use mock mode for testing; run a real job only when the user asks.
- **Don't edit generated files** (`openapi.json`, `LICENSES.md`, `docs/ATTRIBUTION.md`, `docs/API-*.md`); regenerate them (see [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)).

## 1. Check prerequisites

```bash
node -v        # need v22 (22.12 or newer), v24 or v26 (package.json: "engines": {"node": ">=22.12 <27"}); 24 recommended
npm -v
ffmpeg -version && ffprobe -version     # needed for media steps
python3 --version                       # 3.10+; only for scripts/install.sh, model downloads and workflow scripts
git --version
```

Or run **`npm run doctor`**: a read-only check of the OS, Node, the app, ComfyUI (version, Comfy Desktop or not, models folder), the GPU, free disk, the pinned custom node packs and which accounts are connected (names only). It prints what works, what's missing and the fix; `-- --json` for agents. Exit 0 = works, 1 = something required is missing, 2 = the app can't start yet.

There is no `.nvmrc`. If Node is missing, too old or too new, ask the user before installing it. Node 20, 23 and 25 are past their end of life and the installers and `npm run doctor` refuse them; dependencies (tldraw, the Comfy SDK, `eventsource-parser`) need 22.12+.

## 2. Clean install

```bash
npm install          # root workspaces (server, web) + the MCP server's deps via the postinstall step
```

- If the MCP part fails, the app still works; retry with `npm run mcp:install`. `OPENHIGGSFIELD_SKIP_MCP=1 npm install` skips it.
- `better-sqlite3` 12.11.1 has prebuilt binaries for Node 22/24/26 on macOS (arm64, x64), Windows (x64, arm64) and Linux (x64, arm64, arm, and musl/Alpine). Elsewhere it needs build tools (`build-essential python3` on Linux, `xcode-select --install` on a Mac).

## 3. Ask the user how to run it

> "Do you want to (a) make real renders on Comfy Cloud with your Comfy API key, (b) run models locally with your own ComfyUI, or (c) both?"

Write their answer into **`.env.local`** in the repo root (the API reads it when it starts, with `npm start` or `npm run dev`; shell exports win over it). Either copy `.env.example` to `.env.local` (every line in it is commented out, so the copy changes nothing until you uncomment a line) and fill in what's needed, or create `.env.local` with only the lines below. Never echo key values back. The backend is `comfy` by default (real runs); `OPENHIGGSFIELD_BACKEND=mock` gives sample results and is for development and tests only. With nothing set up, Generate opens "Connect a Comfy key or your ComfyUI to start" (nothing runs, nothing is charged); the Examples project shows what the app makes.

| Choice | `.env.local` |
|---|---|
| (a) Comfy Cloud | `COMFY_API_KEY=<the user types it in>` (or paste it in the app) |
| (b) Own GPU | `COMFY_BASE_URL=http://127.0.0.1:8188`, `OPENHIGGSFIELD_COMFY_MODELS_DIR=<their ComfyUI>/models`, `OPENHIGGSFIELD_USE_LOCAL=1` |
| (c) Both | the lines of (a) and (b) |

`npm start` and `npm run dev` keep the API on this computer (`127.0.0.1`), so the user can also save keys and change the ComfyUI address from the browser (setup sheet or **Settings → Connections**); keys saved there work at once. `HOST=0.0.0.0` opens the API to the network and turns browser key saving off. Other keys (fal, Replicate, and official lab keys: Black Forest Labs, MiniMax, LTX) are listed in [docs/CONFIGURATION.md](docs/CONFIGURATION.md#provider-keys). Let the user add keys themselves (in `.env.local` or **Settings**) if they prefer.

Tell the user honestly what will work: workflow/source documentation distinguishes graphs that have made real results (*Ran*) from validation-only entries (*Built*). Neither establishes every platform or provider route. Routes with no live runner must say so. See [workflows/README.md](workflows/README.md) and [docs/PROVIDERS-AND-MODELS.md](docs/PROVIDERS-AND-MODELS.md).

## 4. Start it

```bash
npm start            # everyday use: builds the web app when it changed (first time: a minute or two), then runs it without file watching
npm run dev          # only when changing the code: hot reload, and the API restarts on every file change
```

`npm run setup` does install + doctor + start (`npm start`) in one go and prints `http://localhost:5174/?setup=1` (the first-run sheet; it also opens by itself on a first visit); `-- --check` only checks, `-- --no-start` doesn't start. Exit codes: 0 = ready, 1 = failed (dependencies didn't install, Node doesn't fit, or the app can't start; a failed install keeps npm's output in `setup.log`), 2 = the app works but something optional is missing (the doctor says what). Before starting, it stops within seconds if another program holds `PORT` or `WEB_PORT`.

Both start three processes (`concurrently`): `api` on **:8787**, `web` on **:5174**, `mcp` (HTTP) on **:8788**. `npm start` never restarts while running, so it is the safe choice for a user's app (a restart cancels runs in progress). Ports: `PORT` (API), `WEB_PORT` (web), `MCP_PORT` (MCP).

## 5. Verify (second terminal)

```bash
curl -s http://localhost:8787/api/health
# → {"ok":true,"backend":"comfy",...,"tools":[...50 ids...],...}   ("backend":"mock" only with OPENHIGGSFIELD_BACKEND=mock)

npm run check
# → ok  http://localhost:5174/api/tools -> application/json; charset=utf-8, 50 tools

curl -s -X POST http://127.0.0.1:8788/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
# → {"result":{"protocolVersion":"2025-03-26",...,"serverInfo":{"name":"openhiggsfield","title":"Imagination Is All You Need","version":"0.1.0"}},...}
```

A plain `GET /mcp` answers 406; that's normal. Then open **http://localhost:5174** for the user.

Check the actual health response and setup state rather than assuming a missing key triggers sample generation. The normal backend requires a connection; explicit mock mode is for development/tests. Investigate any unexpected mode or readiness reason before submitting a job.

## 6. Local GPU only: hardware and models

```bash
curl -s http://localhost:8787/api/hardware
# → {..., "tier":"none"|"light"|"most"|"all"|"unknown", "tierLabel":"...", "gpu":{...}|null, "disk":{...}, ...}
```

- `unknown` means the hardware couldn't be read (for example no ComfyUI connected); nothing is blocked. If the user knows their card, set it: `curl -s -X PUT http://localhost:8787/api/hardware -H 'content-type: application/json' -d '{"vramGB":12,"ramGB":32}'` (clear with `DELETE /api/hardware/override`).
- Test the ComfyUI address: `curl -s -X POST http://localhost:8787/api/local/comfy/test -H 'content-type: application/json' -d '{}'`.
- Model files go into `OPENHIGGSFIELD_COMFY_MODELS_DIR`. Show the size first, then **ask** before downloading:

```bash
curl -s -X POST http://localhost:8787/api/local/downloads -H 'content-type: application/json' -d '{"providerId":"<model id>","dryRun":true}'
# → missingBytes, diskFreeBytes, canDownload, code   (if it answers ambiguous_download, use one of the downloadId choices it lists)
```

  Only after the user agrees, send the same body without `dryRun`. Downloads are refused without a models folder (`no_models_dir`) or with too little disk (`not_enough_disk`). Civitai files use `CIVITAI_TOKEN` if the user set it; Hugging Face files use the user's read token (`OPENHIGGSFIELD_HF_TOKEN`, Settings → Connections), needed for gated models after the user accepts the licence on the model page.
- Command-line alternative: `./scripts/install.sh --comfy-dir ~/ComfyUI --tools starter`. Before the first ComfyUI clone, custom-node install or model download it prints a plan (what it will clone and install, and the model download size in GB). In a terminal it asks once, "Go ahead? [y/N]" (default no). In a non-interactive agent shell without `--yes` it prints the plan and exits 0 without installing or downloading anything. So: run it once without `--yes` to get the plan (or use `--list-tools` for sizes, `--dry-run` to print every command), show the plan to the user, and add `--yes` only after they agree.
- Lighter GGUF versions need the ComfyUI-GGUF custom nodes (`UnetLoaderGGUF`) in the user's ComfyUI. ComfyUI-GGUF is listed as an optional pack in `readiness/manifest/custom-nodes.json`, but `npm run nodes:install` skips optional packs, so the user adds it themselves (for example with ComfyUI Manager). Ask before installing it.

Full guide: [docs/LOCAL-MODELS-AND-HARDWARE.md](docs/LOCAL-MODELS-AND-HARDWARE.md).

## Common failures

| Symptom | Fix |
|---|---|
| `mcp` exits with `EADDRINUSE` | Something already uses :8788. API and web keep running. Free the port or set `MCP_PORT` |
| `mcp` won't start after install | `npm run mcp:install`, then `npm start` |
| Web won't start: port 5174 in use | Vite uses a strict port. Free it or set `WEB_PORT` |
| Node rejects `--env-file-if-exists` (a "bad option" error) | Node too old; use Node 22 (22.12+), 24 or 26 |
| Generate → "Connect a Comfy key or your ComfyUI to start" (402 `no_connection`) | Nothing is set up: paste a Comfy key, or point the app at your ComfyUI (Settings → Connections) |
| Generate → 402 `no_provider` | This model can't run on what is connected: add the key it names, or turn on Use local ComfyUI (`OPENHIGGSFIELD_USE_LOCAL=1`) |
| Still sample results after adding a Comfy key | `OPENHIGGSFIELD_BACKEND=mock` is set (development only): remove it |
| "Not available on this server yet" | That route has no live runner yet; pick another model or route |
| Can't save a key from the browser | The API was started with a network `HOST`: use `HOST=127.0.0.1`, or put the key in `.env.local`. Production also defaults to loopback; Vite dev/preview require an explicit `WEB_HOST` or `HOST` to expose their API proxy |
| ComfyUI "Cannot find node class X" | `npm run nodes:install -- ~/ComfyUI`, restart ComfyUI |
| `Value not in list` for a model file | That model isn't downloaded (step 6) |

More: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Where things are

`server/` API (Fastify, SQLite in `server/data/`) · `web/` React + Vite app · `mcp/` MCP server · `workflows/` ComfyUI graphs · `scripts/` installer and tools · `docs/` documentation. Server tests: one with `cd server && npx tsx test/<name>.ts`, the ones your change touches with `npm test -- --changed`, all with `npm test` (parallel; see [docs/TESTING.md](docs/TESTING.md)). New tests that start a server take their port from `testPort()` in `server/test/_ports.ts`.
