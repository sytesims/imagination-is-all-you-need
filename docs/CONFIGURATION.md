# Configuration

Imagination Is All You Need is configured with environment variables and a few settings you can change in the app (or through the API).

## Where settings go

- **`.env.local` in the repo root.** `npm run dev` loads it into the API server (`tsx watch --env-file-if-exists=../.env.local`). Put one `NAME=value` per line. `scripts/install.sh` writes this file, and keys you save in **Settings** are stored here.
- **Your shell.** A variable you `export` before `npm run dev` wins over the same name in `.env.local`.
- **`.env.example`** lists the names the app reads, with empty or default values. Copy it to `.env.local` and fill in what you need, or create `.env.local` with only the lines you need. The Object Swap workflow line is commented out, so the code default (`object-swap-wan-animate-api.json`) applies unless you set it.
- **Never commit `.env.local` or any real key.** `.gitignore` ignores `.env` and `.env.*` (except `.env.example`).

Older `OPENJUTSU_*` names still work: each `OPENHIGGSFIELD_<NAME>` setting is also read as `OPENJUTSU_<NAME>`, and the new name wins if both are set. `COMFY_API_KEY`, `COMFY_BASE_URL`, `COMFY_DEPLOY_URL`, `COMFY_RUNNER_URL`, `COMFY_RUNNER_TOKEN`, `PORT`, `HOST` and `CIVITAI_TOKEN` have no prefix.

## Media upload policy

Multipart uploads are staged outside the public files directory, then checked by signature, container/codec probing and decoding before any route receives them. PNG, JPEG and WebP pictures; MP4, MOV, WebM and M4V video; WAV, MP3, M4A, AAC, OGG and FLAC audio are supported where the input accepts that kind. Unknown file fields, unsupported final extensions, mismatched MIME types, damaged media and active formats (including HTML/SVG) are rejected. Multi-dot names such as `photo.v2.png` and macOS screenshot filenames are accepted when their final extension and actual media content validate; middle extensions do not determine the media type. Missing `ffmpeg`/`ffprobe` or validation timeouts fail closed. A file's existing photo/audio quality checks still apply; black/white masks bypass photo-blackness checks, not media-format checks.

Direct a Shot's `streams` input also accepts its existing decoded MJPEG recordings. The dedicated 3D model upload/rig endpoints remain GLB exceptions with their own validation; GLB is not a generic media upload format. HTML imports keep their separate sandboxed document path. Existing files are not purged: `/files/` adds `nosniff` and a sandbox CSP; extensions outside the media/caption allowlist download as attachments. These defenses do not make untrusted media decoders or explicitly network-exposed instances risk-free.

## Main settings

| Variable | Default | Meaning |
|----------|---------|---------|
| `OPENHIGGSFIELD_BACKEND` | `mock` | `mock` shows sample results; `comfy` makes real renders through ComfyUI (Comfy Cloud or your own) |
| `COMFY_API_KEY` | — | Your Comfy Cloud (or Comfy deployment) API key. Not needed for a ComfyUI on your own computer or a keyless local `comfy-api-proxy` |
| `COMFY_BASE_URL` | unset = Comfy Cloud (`https://cloud.comfy.org`) | The ComfyUI address: your own ComfyUI (e.g. `http://127.0.0.1:8188`), a deployment (`https://<id>.run.comfy.app`) or a local proxy (`http://127.0.0.1:8189`). Can also be changed at runtime, see below |
| `OPENHIGGSFIELD_USE_LOCAL` | unset (off) | `1` = **Use local ComfyUI** starts on, so **Run on → Local** can run (and is pre-selected when it is the only ready place; Comfy, then your other connected APIs, come first). Off means Local shows "Turn on". When set (`1` or `0`), it is applied again **each time the server starts** and wins over what Settings saved last time; Settings shows "Set by OPENHIGGSFIELD_USE_LOCAL". Leave it unset to keep your Settings choice |
| `OPENHIGGSFIELD_COMFY_MODELS_DIR` | unset | Your ComfyUI `models` folder (e.g. `/path/to/ComfyUI/models`). Used to list missing model files, check free disk space and receive one-click downloads. Downloads are refused while it's unset |
| `CIVITAI_TOKEN` | unset | Optional. Sent only when a one-click download comes from civitai.com. Never logged, stored or returned |
| `OPENHIGGSFIELD_HF_TOKEN` (alias `HF_TOKEN`) | unset | Optional Hugging Face **read** token (Settings → Connections → Hugging Face). Sent only to huggingface.co, for gated models such as FLUX.1 Fill dev (accept the licence on the model page first). Never logged or returned |
| `PORT` | `8787` | API port |
| `HOST` | `127.0.0.1` (development and production) | API listen address; `HOST` takes precedence over `OPENHIGGSFIELD_HOST` (then the legacy alias). Blank values fall back to loopback. `HOST=0.0.0.0` explicitly opens network access and disables browser key saving / ComfyUI-address changes |
| `WEB_HOST` | `127.0.0.1` | Vite development and preview listen address. Falls back to `HOST`, `OPENHIGGSFIELD_HOST`, then the legacy alias. Set `WEB_HOST=0.0.0.0` explicitly to expose the UI and its API proxy; this exposes API functionality even if the API itself remains loopback-only. The Docker entrypoint separately binds its web proxy explicitly to `0.0.0.0` for container publishing |
| `OPENHIGGSFIELD_DATA_DIR` | `server/data` | Where the SQLite database, uploads and outputs live (gitignored) |
| `OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY` | unset | `1` = hide and refuse hosted providers: partner/API nodes and hosted model APIs. Local open weights and our own open-weight workflows run as standard Comfy Cloud jobs (e.g. the H3 graphs in `workflows/cloud/`) stay. The Comfy Cloud H3 API-node route `cloud-h3` is a hosted provider and is hidden in this mode |
| `OPENHIGGSFIELD_BILLING_MODE` | unset = `own-accounts` | `own-accounts`: you pay providers directly, no in-app balance; runs go to the spend log. `team`: an operator pays providers and gives users credit balances (charges, refunds). When set here, the app can't change it |
| `OPENHIGGSFIELD_GPU_CREDITS` | `36000` | Team mode only: starting credit balance (1 credit = $0.01) |
| `OPENHIGGSFIELD_CONCURRENCY` | `2` | Shared queue: how many jobs run at once (`concurrency` in `/api/queue` and `/api/config`) |
| `OPENHIGGSFIELD_COMFY_PREVIEW_METHOD` | `auto` | Live preview frames locally (`auto` / `latent2rgb`, `taesd`, `none`, or `default` = ComfyUI's own setting); see [LOCAL-MODELS-AND-HARDWARE.md](LOCAL-MODELS-AND-HARDWARE.md#live-preview-while-it-renders) |
| `OPENHIGGSFIELD_MAX_PARALLEL` | `6` | Max jobs queued + running (429 `concurrency` above) |
| `OPENHIGGSFIELD_COMFY_TIMEOUT_MS` | `1800000` | Max wait for one Comfy job (30 min) |

## Provider keys

Leave these empty unless you use that provider. Settings shows which ones are set (never their values).

| Variable | Provider |
|---|---|
| `COMFY_API_KEY` | Comfy Cloud: our workflows, partner/API nodes, Comfy Router |
| `COMFY_DEPLOY_URL` | Your Comfy deployment (`https://<name>.run.comfy.app`), for heavy workflows with custom nodes and LoRAs. Uses `COMFY_API_KEY`. See [Your Comfy deployment](#your-comfy-deployment) |
| `COMFY_RUNNER_URL` + `COMFY_RUNNER_TOKEN` | Optional instead of a deployment: any Comfy API v2 host (`comfy-api-proxy` on a rented GPU). The token is optional. `COMFY_DEPLOY_URL` wins when both are set |
| `OPENHIGGSFIELD_FAL_KEY` (alias `FAL_KEY`) | fal |
| `OPENHIGGSFIELD_REPLICATE_API_TOKEN` (alias `REPLICATE_API_TOKEN`) | Replicate |
| `OPENHIGGSFIELD_BFL_API_KEY` | Black Forest Labs (FLUX 3 Image / Klein / Video / Upscaler, FLUX.2 [flex] / [klein]) |
| `OPENHIGGSFIELD_MINIMAX_API_KEY` | MiniMax (H3 / H3-Max video, Speech 2.8 HD / Turbo, image-01); a pay-as-you-go key |
| `OPENHIGGSFIELD_LTX_API_KEY` | LTX (LTX-2.5 Pro / Fast, LTX-2.3 Fast) |
| `OPENHIGGSFIELD_OPENAI_API_KEY` | OpenAI (GPT Image 2, GPT Image 2.5 Flare / Sunburst); some models need a verified organization |
| `OPENHIGGSFIELD_GEMINI_API_KEY` | Google Gemini API (Nano Banana 2.1 / 2 / Pro, Nano Banana 2 Lite); billing must be on (no free tier for these) |
| `OPENHIGGSFIELD_ARK_API_KEY` | BytePlus ModelArk (Seedance 2.0 / 2.0 Fast / 2.0 Mini / 2.5, Seedream 5.0 Pro / Flash); activate each model in the console |
| `OPENHIGGSFIELD_BFL_BASE_URL` | Optional: BFL regional host (`https://api.eu.bfl.ai`, `https://api.us.bfl.ai`) |
| `OPENHIGGSFIELD_ARK_BASE_URL` | Optional: BytePlus host (default `https://ark.ap-southeast.bytepluses.com/api/v3`; video runs only there) |
| `OPENHIGGSFIELD_MINIMAX_BASE_URL` | Optional: MiniMax China host (`https://api.minimaxi.com`; China keys only work there) |
| `OPENHIGGSFIELD_DASHSCOPE_API_KEY` | Alibaba Cloud Model Studio / DashScope (not wired yet) |

Which of these actually run today: [PROVIDERS-AND-MODELS.md](PROVIDERS-AND-MODELS.md#which-providers-run-today).

**Saving a key from the browser** works when the server listens on this computer (the default for `npm run dev`). Otherwise put keys in `.env.local` and restart. Either way, real runs need `OPENHIGGSFIELD_BACKEND=comfy`.

## Your Comfy deployment

Run heavy workflows on your own Comfy deployment. Some workflows need custom node packs and LoRAs that shared Comfy Cloud doesn't have, for example MiniMax H3 Character Swap (the `h3-relay` nodes) and H3 CrossView (the `ComfyUI-CrossViewWarp` nodes). A Comfy API deployment is your own ComfyUI environment on Comfy's GPUs. It speaks the same Comfy API v2 as Comfy Cloud and takes the same key, so the app only needs its address. Routes that run there say **Your Comfy deployment** and bill your Comfy account.

**Set it up (once, on platform.comfy.org):**

1. Have a paid Comfy plan. Standard ($20/month) allows 5 Builds, 2 deployments and 2 workers per deployment.
2. Open the Comfy API Build Wizard (platform.comfy.org) and drag in the API-format workflow JSON of each workflow you want to run there. The wizard suggests the custom nodes and models it found.
3. Add the node packs and model download links the wizard is missing (for example Hugging Face file links for the LoRAs), then create a Linux/NVIDIA release.
4. Deploy the release. Pick the GPU (a 96 GB RTX PRO 6000 fits the H3 graphs without offloading) and set **min workers 0**, so it scales to zero and bills nothing while idle. The first job after a pause then waits for a cold start.
5. Copy the deployment address (`https://<name>.run.comfy.app`) into `.env.local` as `COMFY_DEPLOY_URL`, keep your `COMFY_API_KEY`, and restart the app.

**Check it (no job is run):** Settings → Connections → Your Comfy deployment → **Check**. It reads the address (`GET /api/v2/health`, or the deployment's job list) and, where the host shares it, the node list (`GET /api/object_info`). It then shows the node count and any node classes or model files the workflows still need. It never starts a job. Whether reading the node list wakes a scaled-to-zero worker on a Comfy deployment (a few billed seconds) isn't documented yet. Over the API: `GET /api/comfy-deploy` (what is set, names only) and `GET /api/comfy-deploy/probe?nodes=1`.

**Test job (paid, a few GPU-seconds plus any cold start):** `POST /api/comfy-deploy/smoke {"confirm": true}` runs a tiny core-node graph (load image, invert, save; no models) end to end: upload, submit, poll and download. Its price isn't measured yet, so it only runs with `OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD=1`.

**What it costs:** Comfy bills a deployment per GPU-second while a worker runs: startup, model load and the job, plus about 30 s idle. An RTX PRO 6000 is about $3.49/hour. Staged model storage bills per GB-month while a deployment exists (comfy.org/pricing). Prices in the app stay estimates until a measured run. Stop or delete the deployment on platform.comfy.org when you're done.

**Own GPU instead:** run ComfyUI with [comfy-api-proxy](https://github.com/Comfy-Org/comfy-api-proxy) on a rented GPU and set `COMFY_RUNNER_URL` (plus `COMFY_RUNNER_TOKEN` if you started the proxy with a token). Your GPU host bills that, not Comfy.

### Build contents: New angle · H3 CrossView (Re-shoot)

**New angle · H3 CrossView · cloud** in Re-shoot re-views your take from a new camera angle, set in degrees. It runs Comfy's Reshoot recipe: a MoGe-2 depth warp of the take to the new camera steers MiniMax H3 with the CrossView-Warp v1 LoRA. Takes of 5–15 s (4–5 s takes are padded to 5 s, longer ones use the first 15 s), 480p or 768p in the take's shape, with the take's own sound by default (or H3's generated sound). Our graph is [`workflows/deploy/h3-crossview-api.json`](../workflows/deploy/h3-crossview-api.json), adapted from the MIT graph in [Comfy-Org/comfy-reshoot](https://github.com/Comfy-Org/comfy-reshoot) (`workflows/generate.api.json`). Thanks to Comfy, and to Cseti for the CrossView-Warp LoRA and nodes.

Add this to the Build on platform.comfy.org (drag in `workflows/deploy/h3-crossview-api.json`, then add whatever the wizard misses):

- **ComfyUI** v0.37.0 or later (Comfy's guide pins commit `2255709aa0`). It has the MiniMax H3 and MoGe core nodes.
- **Node pack:** [comfyrob/ComfyUI-CrossViewWarp](https://github.com/comfyrob/ComfyUI-CrossViewWarp) at commit `fbb1e93c7193329ff3ce7c17f95166b539687876` (Apache-2.0; a fork of [cseti007/ComfyUI-CrossViewWarp](https://github.com/cseti007/ComfyUI-CrossViewWarp) that adds `CrossViewPrepareClip`). The graph uses `CrossViewPrepareClip` and `CrossViewWarp`. No extra Python packages are needed.
- **Model files** (about 54.7 GB in all):

| File | Folder under `models/` | Size | Source | Licence |
|---|---|---|---|---|
| `minimax_h3_ref2va_pruned_int8_convrot.safetensors` | `diffusion_models/` | 20.97 GB | [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3/blob/main/diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors) | [MiniMax H3 Community License](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE) |
| `qwen3vl_32b_minimax_h3_int8_convrot.safetensors` | `text_encoders/` | 27.14 GB | [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3/blob/main/text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors) | MiniMax H3 Community License |
| `minimax_h3_video_vae_int8_convrot.safetensors` | `vae/` | 2.81 GB | [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3/blob/main/vae/minimax_h3_video_vae_int8_convrot.safetensors) | MiniMax H3 Community License |
| `minimax_h3_audio_vae_fp32.safetensors` | `vae/` | 0.61 GB | [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3/blob/main/vae/minimax_h3_audio_vae_fp32.safetensors) | MiniMax H3 Community License |
| `minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors` | `loras/` | 1.96 GB | [lightx2v/Minimax-h3-Turbo](https://huggingface.co/lightx2v/Minimax-h3-Turbo/blob/main/minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors) | no licence tag on the card; check the repository |
| `MiniMax-H3_Ref2VA-LoRA-CrossView-Warp_v1_3500.safetensors` | `loras/` | 0.60 GB | [Cseti/MiniMax-H3_Ref2VA-LoRA-CrossView-Warp_v1](https://huggingface.co/Cseti/MiniMax-H3_Ref2VA-LoRA-CrossView-Warp_v1) | MiniMax H3 Community License |
| `moge_2_vitl_normal_fp16.safetensors` | `geometry_estimation/` | 0.66 GB | [Comfy-Org/MoGe](https://huggingface.co/Comfy-Org/MoGe/blob/main/geometry_estimation/moge_2_vitl_normal_fp16.safetensors) | MIT |

Pick a 96 GB GPU (RTX PRO 6000): that's what Comfy showed the recipe on, and smaller cards are untested. After deploying, **Check** in Settings → Connections lists any node class or file the Build still misses for "New angle · H3 CrossView". While something is missing, the app refuses the run before it uploads anything. The price stays an estimate (about 25 GPU-seconds per second of video at 480p and 50 at 768p, plus any cold start) until a measured run. Until then real runs need `OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD=1`.

**Camera:** azimuth −90° to 90° (negative = to the left), elevation −45° to 45° (positive = above), distance 0.5 to 2. **Green** (up to ±45°, +30° / −20°) is where the LoRA was checked. **Yellow** (up to ±90°, +45° / −35°) is trained but less reliable. **Red** means the camera sees what the take never showed, so that side is invented. Distance isn't followed closely by the current LoRA.

The pattern follows Comfy's own clonable app [Comfy-Org/comfy-reshoot](https://github.com/Comfy-Org/comfy-reshoot) (MIT), which calls a Comfy API deployment through the same v2 jobs and assets API. Comfy's guide: [Comfy API deployments](https://docs.comfy.org/development/serverless/overview).

## Object Swap workflow settings

| Variable | Default | Meaning |
|----------|---------|---------|
| `OPENHIGGSFIELD_WORKFLOW` | `object-swap-wan-animate-api.json` | Filename under `workflows/` (legacy: `object-swap-api.json`) |
| `OPENHIGGSFIELD_NODE_IMAGE` | `10:image` | `nodeId:field` for the reference image |
| `OPENHIGGSFIELD_NODE_VIDEO` | `145:file` | `nodeId:field` for the source video |
| `OPENHIGGSFIELD_NODE_PROMPT` | `21:text` | `nodeId:field` for the PICK THE PERSON prompt |
| `OPENHIGGSFIELD_NODE_OUTPUT` | `277` | SaveVideo (or equivalent) node id |

## Demo, mock and testing

| Variable | Default | Meaning |
|----------|---------|---------|
| `OPENHIGGSFIELD_DEMO` | unset | `1` = demo mode: seed the Community feed with 10 example results by other authors even when `BACKEND=comfy` (mock mode seeds it anyway) |
| `OPENHIGGSFIELD_SEED_COMMUNITY` | on in mock/demo | `0` = never seed the Community feed. Seeding is idempotent; seeded items you trash stay gone |
| `OPENHIGGSFIELD_DEMO_AUTO` | on with the mock backend | `0` = no free sample previews for routes that only lack a key |
| `OPENHIGGSFIELD_MOCK_DELAY_MS` | — | Mock job length, kept across restarts |
| `OPENHIGGSFIELD_MOCK_FAIL` | unset | `1` or an error type (`temporary`, `provider_outage`, `ip`, `nsfw`): force every mock job to fail (QA) |
| `OPENHIGGSFIELD_MOCK_KEYS` | unset | `1` = treat hosted keys as present (mock only, no real calls) |
| `OPENHIGGSFIELD_HW_MOCK` | unset | Pretend hardware for tests and demos: a profile name (`unknown`, `none`, `cpu`, `light8`, `mid16`, `rtx4090`, `mac36`) or JSON |
| `OPENHIGGSFIELD_DOWNLOAD_MOCK_MS` | `2000` | Mock download length (mock backend writes a tiny placeholder file, no network) |
| `OPENHIGGSFIELD_DISK_FREE_GB` | — | Pretend free disk space (mock backend only) |
| `OPENHIGGSFIELD_SKIP_MCP` | unset | `1` = `npm install` skips installing the MCP server's dependencies |

## Web and MCP

| Variable | Default | Meaning |
|---|---|---|
| `WEB_PORT` | `5174` (Vite) / `8080` (`docker/start.mjs`) | Web app port |
| `OPENHIGGSFIELD_API_PROXY` | `http://localhost:8787` | Where the Vite dev server sends `/api`, `/files`, `/samples`, `/s` |
| `OPENHIGGSFIELD_API` | `http://localhost:8787` | The API the MCP server talks to |
| `MCP_PORT`, `MCP_HOST` | `8788`, `127.0.0.1` | MCP HTTP transport |
| `OPENHIGGSFIELD_MCP_PERMISSIONS`, `OPENHIGGSFIELD_MCP_DEFAULT`, `OPENHIGGSFIELD_MCP_ALLOW`, `OPENHIGGSFIELD_MCP_ASK`, `OPENHIGGSFIELD_MCP_BLOCK` | — | MCP tool permissions, see [MCP.md](MCP.md#permissions-allow--ask--block-per-tool) |

Everything else the app reads (share-link base URL, signup grant, result and trash retention, prompt enhance and translate services, and more) is listed in [`.env.example`](../.env.example). `OPENHIGGSFIELD_COMMERCIAL` is read but has no effect: no licence setting ever changes a default.

## Settings you change in the app (or over the API)

| What | In the app | API |
|---|---|---|
| Use local ComfyUI on/off | Settings → Connections → Local | `PUT /api/me/routing {"global":{"useLocal":true}}` (`GET` shows the saved choices) |
| Run on for one model in one tool | the **Run on** control next to the model, or Settings → Connections → Routing | `PUT /api/me/routing {"perTool":{"<toolId>":{"<modelKey>":{"runOn":"fal"}}}}` (`runOn` is `auto`, `local`, `comfy-cloud`, `fal`, `replicate`, `bfl`, `minimax`, `dashscope` or `luma`; `null` removes a choice). Choices are per tool and model, so they never leak to other tools. The older `perModel` engine pins are still read and migrated |
| Default Run on | Settings → Connections → Routing | `PUT /api/me/routing {"global":{"mode":"auto"}}` |
| Provider keys | Settings → Connections | `POST /api/settings/providers` (only from this computer); `GET /api/accounts` reads balances where a provider allows it |
| Billing mode | Settings → Connections, Spend page | `GET/PUT /api/settings/billing` (`mode`, `comfyPlan`; spending limits were removed 2026-10-28); `GET /api/spend`, `/api/spend/summary` |
| ComfyUI address | Settings → Local models | `GET /api/local/comfy`, `PUT /api/local/comfy {"url":"http://127.0.0.1:8188"}`, `DELETE /api/local/comfy` (back to `COMFY_BASE_URL`), `POST /api/local/comfy/test {"url":...}` (test without saving). Changing it from the browser only works when the server runs on your own computer (the default `HOST`); otherwise set `COMFY_BASE_URL` |
| Your hardware, when it can't be detected | Settings → Local models | `PUT /api/hardware {"vramGB":12,"ramGB":32}`; `DELETE /api/hardware/override` clears it |
| Model file downloads | Settings → Local models | `GET /api/local/downloads`, `POST /api/local/downloads {"providerId":...,"dryRun":true}` (see [LOCAL-MODELS-AND-HARDWARE.md](LOCAL-MODELS-AND-HARDWARE.md#model-files-and-one-click-downloads)) |
| Learned timings | Settings → reset learned timings | `GET /api/eta/learned`, `DELETE /api/eta/learned` |

More on hardware, downloads and timings: [LOCAL-MODELS-AND-HARDWARE.md](LOCAL-MODELS-AND-HARDWARE.md).

## Speech translation

**Translate** in the Voice tool runs locally: faster-whisper transcribes, NLLB-200 translates on the CPU, Chatterbox speaks the result (see [PROVIDERS-AND-MODELS.md](PROVIDERS-AND-MODELS.md)). To use a LibreTranslate server for the text step instead, set:

| Variable | Default | What it does |
|---|---|---|
| `OPENHIGGSFIELD_TRANSLATE_URL` | unset | A LibreTranslate-compatible server (`POST /translate {q, source, target}`) |
| `OPENHIGGSFIELD_TRANSLATE_KEY` | unset | Its API key, if it needs one |

If the translation step fails, the job stops with a clear message and any credits go back.

## Data and storage

- Everything persists in SQLite (`better-sqlite3`) at `$OPENHIGGSFIELD_DATA_DIR/openhiggsfield.db` (default `server/data`, gitignored): jobs and history, the spend log, the credit ledger (used in team mode), free generations, favourites, projects, trash and elements. Uploads and outputs live in the same folder. A legacy `openjutsu.db` is renamed on first start.
- Restart policy: jobs queued or running at shutdown come back as **failed (temporary)**; Retry re-runs them (in team mode their credits go back to the balance).
- `npm run demo:reset` (server stopped) wipes the data folder and seeds a clean demo: 8 done jobs across the tools (including a draft→final pair), 1 failed, 3 favourites, and a project called "Spring campaign".
- `npm run samples -w server` regenerates our own procedural media in `server/samples` (inputs `sample-*`, mock results `result-*`).
- Mock outputs are the tool's `result-*` sample clip, cut to the input length and resolution, with the input's audio. Image tools keep the uploaded still as BEFORE.
- Backups: [BACKUP-RESTORE.md](BACKUP-RESTORE.md).
