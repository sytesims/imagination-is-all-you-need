# REST API

The app is driven by a REST API on `http://localhost:8787`. The web app and the MCP server both use it.

## Reference

- **OpenAPI 3.1:** served at `GET /api/openapi.json`, with a docs page at `GET /api/docs` and the in-app `/api-docs` page. A static copy lives at [`openapi.json`](../openapi.json); regenerate it with `npm run openapi`.
- **Generated API guides** (built from `openapi.json` and the live API by `npm run docs:api`; don't edit them by hand):
  - [API-QUICKSTART.md](API-QUICKSTART.md): first requests, step by step;
  - [API-MODELS.md](API-MODELS.md): every model with its price and source;
  - [API-ERRORS.md](API-ERRORS.md): error codes and limits.

## Basics

- **Submit a job:** `POST /api/tools/:toolId/jobs` (multipart). Send an `Idempotency-Key` header so retries are safe. The same key with the same body returns the same job (`idempotentReplay: true`); the same key with a different body returns 422.
- **Poll:** `GET /api/jobs/:id`. Start at 2 s and back off ×1.5 up to 10 s; the server sends `Retry-After`.
- **Price first:** `GET /api/tools/:toolId/price?...` returns the same number that is charged.
- **Results and usage:** `/api/assets`, `/api/usage`, `/api/pricing`, `/api/search?q=`, `/api/community?sort=trending|new`.
- **Share:** `POST`/`DELETE /api/jobs/:id/share`, viewable at `/s/:token`.
- **Support details:** `GET /api/jobs/:id/support`.
- **GIF export:** `GET /api/jobs/:id/output.gif?full=1`.
- **Health:** `GET /api/health` (`backend`, `comfyReady`, `comfyReason`, tool list); `GET /api/config` (app config, `localFree`, MCP snippets).
- `POST /api/jobs` is kept for the original contract and goes to `object-swap`.

```bash
curl -s -H "Idempotency-Key: $(uuidgen)" -F preset=watercolor \
  -F video=@server/samples/sample-pattern.mp4 http://localhost:8787/api/tools/restyle/jobs
curl -s http://localhost:8787/api/jobs/<id>
```

## Create Image

`n` = 1–4 images, `aspect` = `1:1|16:9|9:16|4:3|3:4|3:2|2:3|21:9`, `quality` = `low|med|high`. Bad values return 400 with nothing charged. Hosted price = per-image price × `n` (`GET /api/tools/create-image/price?provider=…&n=…` returns the same number that is charged). Local and open-weights runs cost 0 credits, and a failed job's credits go back to your balance. Checks: `BASE=http://localhost:8787 node server/scripts/test-create-image.mjs` (spends mock credits).

```bash
curl -s -F types='["generate"]' -F prompt='a red fox in snow' -F provider=api-seedream \
  -F n=3 -F aspect=16:9 -F quality=high http://localhost:8787/api/tools/create-image/jobs
# → {"id":"…","provider":"api-seedream","cost":15,…}   (5 credits per image × 3)
```

Also on Create Image: `enhance=1` rewrites the prompt (`POST /api/prompt/enhance`, rules template; set `OPENHIGGSFIELD_ENHANCE_LLM_URL` for a local LLM), `style=<id>` from `GET /api/styles`, and an inpaint mode (`types=["inpaint"]`, the **Brush Edit** feature: `mask` PNG, white = repaint; GPT Image 2 on Comfy Router, FLUX 3 Klein or Qwen-Image-Edit-2509 locally). Optional Camera & Lens rig: `cameraBody`, `lens`, `focal`, `aperture` (lists on `GET /api/image-features`) add a camera sentence to the prompt; the job keeps it as `input.camera`. Every image job carries `feature` {label "Edit Image · Nano Banana 2", workflow {source, name, url, author, licence}}.

## Voice Studio, Apps (and the Director API)

- **Director API** (tool `cinema`, kept for compatibility: it has no page in the app since 2026-10-23, and `/tools/cinema` opens Create Video): tag assets with `@image1…`, add timed camera moves (`#dolly-in 0-2s #orbit 2-5s`; untimed tags start where they sit), pick an emotion + intensity, or turn on **Auto** for 4 variants with different shots and moves. Runs on LTX-2 19B camera LoRAs or Wan Fun Camera. Preview a plan with `POST /api/cinema/plan`.
- **Voice Studio** (`/tools/voice`): Voiceover, Change voice, Translate (16 languages, `GET /api/voices`) over a video.
- **Apps** (`GET /api/apps`): 12 one-purpose preset tools declared as data in `server/src/tools/apps.ts` (`APP_GALLERY`); each runs as tool `app-<id>`.

## Edit in place and lineage

- `POST /api/jobs/:id/edit` `{ "tool": "<tool id>", "params": { ... }, "output": 0 }` runs any tool with that job's output as its `video`, `image` or `refs` input, with no download or re-upload. The new job has `parentId` set to `:id`. Multipart clients can send `fromJob=<id>` (and `output=<n>`) to `/api/tools/:toolId/jobs` instead.
- `GET /api/jobs/:id/lineage` returns `{ rootId, depth, chain: [root … this], children }`.
- `POST /api/jobs/:id/upscale` upscales a finished result (SeedVR2, same seed).

## Routing, hardware and local models

| Endpoint | What it does |
|---|---|
| `GET` / `PUT /api/me/routing` | Saved routing choices: your picked place per tool and model (`perTool`; none = the pre-selected place), **Use local ComfyUI** (`global.useLocal`), old per-model pins (`perModel`) |
| `GET /api/routes` | Every route with its price, durations and status |
| `GET /api/hardware` (`?refresh=1`), `POST /api/hardware/refresh` | This computer's hardware and tier |
| `PUT /api/hardware` `{vramGB, ramGB?}`, `DELETE /api/hardware/override` | Set or clear your hardware when it can't be detected |
| `GET` / `PUT` / `DELETE /api/local/comfy`, `POST /api/local/comfy/test` | The ComfyUI address (changing it needs a server on your own computer) |
| `POST /api/local/downloads` `{downloadId \| providerId \| variantId, dryRun?}` | One-click model download (never automatic; `dryRun:true` shows the size first) |
| `GET /api/local/downloads`, `GET` / `DELETE /api/local/downloads/:id` | Download progress, cancel |
| `GET` / `DELETE /api/eta/learned` | Learned timings |
| `POST /api/jobs/:id/fallback` | Continue a job that stopped to ask you (`needs_decision`) on the route you choose |

Plain-language guide: [LOCAL-MODELS-AND-HARDWARE.md](LOCAL-MODELS-AND-HARDWARE.md).
