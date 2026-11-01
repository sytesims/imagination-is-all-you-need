# Troubleshooting

## Starting the app

- **`/api/health` says `"backend":"mock"` with a `comfyReason`:** ComfyUI isn't reachable at `COMFY_BASE_URL`, the key is missing, or a workflow is missing. The app falls back to mock instead of crashing. Check `curl $COMFY_BASE_URL/system_stats`.
- **The `mcp` process exits with `EADDRINUSE`:** something already listens on :8788. The API and web app keep running. Stop the other process or change `MCP_PORT`.
- **The `mcp` process doesn't start after `npm install`:** the MCP dependencies didn't install. Run `npm run mcp:install`, then `npm start` again.
- **"Port 8787 is already used by …, so the app can't start":** another program holds the API port (`PORT`, default 8787) or the web port (`WEB_PORT`, default 5174). `npm start` and `npm run setup` check both before starting and name the program when they can. Close it, or give the app another port: add `PORT=8790` (or `WEB_PORT=5180`) to `.env.local`, or start with `WEB_PORT=5180 npm start`.
- **"The app's parts didn't install":** `npm run setup` (and the one-line installers) stop here when `npm ci` fails. The full npm output is in `setup.log` in the app folder. The usual causes are no internet connection, a full disk, or a missing build tool (next line). Fix it and run `npm run setup` again.
- **`better-sqlite3` build error during `npm ci`:** install build tools (`xcode-select --install` on a Mac, `build-essential python3` on Linux), or use Node 22, 24 or 26, which have prebuilt binaries.
- **"Node.js 20 is too old" (or 23, 25):** that version is past its end of life and no longer gets security fixes. Switch to Node 24: `brew install node@24` on a Mac, `winget install OpenJS.NodeJS.LTS` on Windows, or `nvm install 24 && nvm use 24`. See [INSTALL.md](INSTALL.md#requirements).

## Generating

- **Generate answers `no_provider` (HTTP 402):** no route is set up for that model. Add a key in Settings (or `.env.local`), or turn on **Settings → Use local ComfyUI**. Nothing was charged.
- **"Not available on this server yet":** that route has a key but no live runner yet, so it is never pre-selected and nothing is charged. See [which providers run today](PROVIDERS-AND-MODELS.md#which-providers-run-today).
- **"Sample output, nothing billed.":** you're on the mock backend and that route has no key, so you got a sample instead of a real render.
- **Added a `COMFY_API_KEY` but still get sample renders:** the mock installer turned on Use local ComfyUI. Turn it off in Settings, and start with `OPENHIGGSFIELD_BACKEND=comfy`.
- **"Local ComfyUI isn't reachable":** check `COMFY_BASE_URL` (or `GET /api/local/comfy`) and test it with `POST /api/local/comfy/test`.
- **"Too heavy for this computer":** it is never pre-selected. Pick it yourself to try anyway (it runs with a warning), use a lighter model or a cloud route. If the app got your hardware wrong, see [LOCAL-MODELS-AND-HARDWARE.md](LOCAL-MODELS-AND-HARDWARE.md#if-your-hardware-cant-be-detected).
- **A job stopped and asks you to choose (`needs_decision`):** the route failed and the next one costs more than your quote. Pick a route (or cancel); nothing extra was charged.
- **`400 invalid_duration`:** that model doesn't take that clip length. The error lists the allowed lengths.
- **Can't save a key or change the ComfyUI address from the browser:** the server listens on the network (`HOST=0.0.0.0`; `NODE_ENV` never changes this). Start it with plain `npm start`, or put the values in `.env.local`.

## Local ComfyUI and models

- **Download refused with `no_models_dir`:** set `OPENHIGGSFIELD_COMFY_MODELS_DIR` to your ComfyUI `models` folder (it must exist) and restart.
- **Download refused with `not_enough_disk`:** free up space; the answer says how much is needed.
- **ComfyUI error "Cannot find node class X":** run `npm run nodes:install -- ~/ComfyUI` again and restart ComfyUI. The script warns if your ComfyUI core isn't at the pinned commit.
- **`Value not in list` for a model file:** that tool's models aren't downloaded. Use the in-app download, or run `./scripts/install.sh --comfy-dir ~/ComfyUI --tools <tool> --skip-build`.
- **`sha256 mismatch`:** the partial file was deleted. Download it again.
- **Gated model (FLUX 3 Klein):** accept the licence on Hugging Face, then run `HF_TOKEN=hf_... ./scripts/install.sh ...`.
- **CUDA out of memory:** pick a smaller model (Qwen Image 2.1 or Klein 4B), use the 480p draft, or start ComfyUI with `--lowvram`.
- **"Needs ComfyUI ≥ 0.41.3":** update ComfyUI to use MOSS-Image.
- **GGUF versions can't be selected:** your ComfyUI doesn't have the ComfyUI-GGUF nodes (`UnetLoaderGGUF`). It's an optional pack that the installer doesn't add; install it in ComfyUI (for example with ComfyUI Manager) and restart ComfyUI.
