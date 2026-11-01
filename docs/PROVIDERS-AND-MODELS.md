# Models and Run on

Two choices, kept apart. The **Model** is what you get ("MiniMax H3", "LTX-2 19B"): each tool lists a model once, with a clean name. **Run on** is where it runs and who bills it: **Auto** (the default), **Local**, **Comfy Cloud**, or a direct provider (fal, Replicate, OpenAI, Google, BytePlus, Black Forest Labs, MiniMax, LTX, Alibaba Cloud, Luma). Under the hood each combination is a *route* (a ComfyUI workflow, a partner node or a provider endpoint); the older provider ("engine") ids such as `comfy-h3` or `api-minimax-h3` are still accepted everywhere as aliases of a model. This page explains how the app picks where to run, what runs today, what it costs and which licences apply.

## Tools and models

| What you want to do | Our tool(s) | Example models |
|---|---|---|
| Swap a person or object in a video; copy motion from one clip to another | Object Swap, Motion Transfer | Kling 3.0 Omni Edit and Seedance 2.5 Edit (cloud), Wan 2.2 Animate (local) |
| Cinematic camera moves from a still, or from a prompt alone on supported routes | Camera Moves (82 moves in the current tool catalogue) | Wan 2.2 Fun Camera, LTX-2 19B |
| Film the same scene again from a new angle | Re-shoot / Angles | LTX-2 19B, Wan 2.2 Fun Camera |
| Text or image to video, with sound | Generate Video, Extend | MiniMax H3 |
| Change the look of a clip | Restyle | open ComfyUI workflow, MiniMax H3 style adapters |
| Images and edits | Create Image (with edits), Relight, Face Swap, Person Swap, Camera Angles, Camera & Lens, Brush Edit, Photo FX | Qwen-Image, Qwen Image 2.1, Z-Image Turbo, FLUX |
| Sharper, larger video and images | Upscale (video), Upscale (image) | SeedVR2, ESRGAN-type upscalers |
| Voice, music and sound | Voice Studio, Audio, Add soundtrack | Chatterbox, F5-TTS, Fish Audio Drama 3, ACE-Step |
| Quick edits | Reframe, Remove Background, SDR→HDR, FPS Boost, Depth Map | BiRefNet, RIFE, Depth Anything |
| One-click apps with presets | 24 apps in the current catalogue (Product Shot, Transitions, UGC Ad, Orbit Shot, …) | the base tool's model |

The challenge page lists "Cinematic Studio" and "Re-shoot a video" as ideas to rebuild; those map to Camera Moves and Re-shoot.

Each tool shows its models and run locations (`GET /api/tools` has `models[]` with `key`, `runsOn[]` and `engines`; `GET /api/models/registry` is the static list). Add keys or connect your own ComfyUI in **Settings → Connections**. A catalogue entry is not proof of a runnable route: executor support, account access, model files, nodes, version and hardware must also match. Implemented Comfy Router/partner routes include hosted models such as Kling, Seedance and Veo; availability remains route-specific. Open weights have no per-generation provider fee on your own compatible ComfyUI, but the app does not install them automatically. Not every local model, GPU or provider combination has been run; see [provider status](#which-providers-run-today).

## Where a model runs (Run on)

**Run on** always names a place: **Local**, **Comfy** (Comfy Cloud for our open workflows, Comfy Router for hosted models; one Comfy key) or a direct API such as **fal**, **Replicate** or a lab's own API (**OpenAI**, **Google**, **BytePlus**, **BFL**, **MiniMax**, **LTX**). The menu shows only the places a model really has, in three groups (Local, Comfy, Other API), each with its price and status. A place that isn't set up stays in the list, greyed, with one action: "Download 20 GB", "Install node", "Add a Comfy key", "Add a fal key" or "Turn on".

Until you pick, the app **pre-selects** the first place that is ready, in this order:

1. **Comfy**: our open workflow on Comfy Cloud first, then Comfy Router (needs `COMFY_API_KEY`).
2. **Another API you have a key for** (fal, Replicate, or a model maker's own API: OpenAI, Google Gemini API, BytePlus ModelArk, Black Forest Labs, MiniMax, LTX). The cheapest for this job first, then the fastest.
3. **Local**, when **Use local ComfyUI** is on (Settings → Connections) and the model's files and custom nodes are on your computer. Free. It is pre-selected when it is the only ready place; you can always pick it in Run on. Models that fit your computer come before slow ones; too-heavy models are never pre-selected ([details](LOCAL-MODELS-AND-HARDWARE.md#what-the-app-does-with-it)).

If nothing is ready, the mock backend runs a free, labelled sample ("Sample output, nothing billed."; off with `OPENHIGGSFIELD_DEMO_AUTO=0`). Otherwise **nothing is pre-selected**: the app never picks a place that needs a download or a key for you. A setup card under the composer lists every place in the same order with what it takes (its price, "Add a Comfy key", "Download 17 GB", "Turn on"), one button each, and Generate stays off until one is set up. A model with no ready place shows no price in the picker (an uninstalled GPU is never "Free").

- **You pick a place yourself:** it is saved per tool and model (`perTool` in `PUT /api/me/routing`), so picking fal for MiniMax H3 in Generate Video doesn't change any other tool. If that place stops working (a key removed, files deleted), the chip shows the problem and its fix. It never switches on its own. **Settings → Routing → Your choices per tool** lists your picks, with Reset.
- **API and MCP:** leave `runOn` out (or send the older value `auto`) for the pre-selected place. Quotes and jobs always name the place they resolved to (`runOn`, `runOnLabel`).
- **Open-weights-only mode** (`OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY=1`) hides partner nodes and direct providers, and keeps our open workflows on Comfy Cloud and Local.
- **Added a `COMFY_API_KEY` after a mock install?** Comfy comes before Local, so models that run on Comfy pre-select it. Models that only run locally stay there.

### When a run fails

- When the pre-selected place fails and that try was not charged (it never reached the provider, the provider refused before running, or its rule is that failed runs are free), the run moves to the next ready place that costs the same or less, and the result says where it ran. A dearer place waits for your OK. A place you picked yourself never moves on its own. When a run can't move on, the failed result offers **Try on <another ready place> (≈ $x)**. One click re-runs it there once; your saved choice for that model stays as it was. Tick **Make <place> my default for <model>** next to the button (off by default) to also keep that place as your choice. A retry or Try on shows in Spend like any other run.
- API clients can still opt in per request with `allowFallback=1`: the job then moves on only to a place that costs no more than the quote, and otherwise stops and asks.
- A temporary failure can be retried on the same place.
- When a provider refuses a job itself, the app shows the provider's reason and ends the job as `blocked` or `failed`. A failed attempt is noted in the spend log ("failed, not charged" or "failed, provider may charge") by that provider's rule.
- You pay providers directly under their own terms. The app holds no balance and can't give back what a provider charges. In the optional team mode, failed runs are refunded to the user's balance by the operator's ledger.

## Which providers run today

| Run on | Status |
|---|---|
| Comfy Cloud open-workflow jobs | Implemented for registered builders/runners, including LTX and H3 workflows. See [cloud workflows](../workflows/cloud/README.md) for sources and prerequisites. Fixture validation and a previous real result do not verify every route or account. |
| Comfy Router and supported partner/API nodes | Implemented per model/route (`server/src/comfyRouter.ts`, `server/src/routing/routerRun.ts` and registered cloud partner runners). A key, entitlement, compatible inputs and an available executor are still required; this is not a blanket real-run claim. |
| fal, Replicate | Wired but not yet run with a real key |
| Official lab APIs: **Black Forest Labs** (FLUX 3 Image / Klein / Video / Upscaler, FLUX.2 [flex], FLUX.2 [klein] 4B / 9B), **MiniMax** (H3 / H3-Max video, Speech 2.8 HD / Turbo, image-01), **LTX** (LTX-2.5 Pro / Fast, LTX-2.3 Fast), **OpenAI** (GPT Image 2, 2.5 Flare / Sunburst: generate, edit, inpaint), **Google Gemini API** (Nano Banana 2.1 / 2 / Pro, Nano Banana 2 Lite), **BytePlus ModelArk** (Seedance 2.0 on Generate Video, Seedance 2.0 Fast / Mini / 2.5, Seedream 5.0 Pro / Flash) | Wired (`server/src/providers/direct.ts`, routes in `server/src/routing/directRoutes.ts`). Tested against fake lab servers; not yet run with a real key. Outputs are saved right away (lab links expire); LTX runs at most 2 jobs at once and waits out "busy" answers. BytePlus refuses Seedance jobs with reference videos (it only takes public links) |
| MiniMax Speech direct | Implemented through the direct-route registry and speech adapter. Requires the appropriate provider key/access; no new real-provider validation is implied by this documentation update. |
| DashScope direct | Connection configuration exists, but no direct executor was identified in this review. Do not assume a saved key enables a route. |
| Your own ComfyUI and this-computer tools | Registered local workflows and media-processing steps are implemented where their runner exists. Hardware/model/node readiness and per-route verification vary. A cloud result or cross-platform startup CI does not prove local GPU execution. |

Under the hood, Comfy Cloud jobs go through the Comfy SDK (`@comfyorg/sdk`, API v2) or plain HTTPS, and a local ComfyUI is driven through its HTTP and WebSocket API.

### Retiring and removed models

A model or route the provider is shutting down is marked **Retiring** (an amber pill in model menus and on `/pricing`, with the date in its tooltip). It stays selectable, because it may keep working for a while, but it's never featured or picked as a default, and a saved choice of it falls back to the tool's default on reload. The list lives in `server/src/shared/lifecycle.ts`; the API carries it as `lifecycle` and `lifecycleNote` (`/api/tools`, `/api/models`, `/api/routes`, `/api/pricing`).

| Model | Status | Why (checked 2026-10-21) |
|---|---|---|
| Reve | Removed | Reve's API wound down on 2026-08-14. Old Reve results still show in Assets under the name Reve; a saved Reve choice falls back to the tool's default |

Veo 3.1 is no longer marked Retiring (2026-10-31). Google's [deprecation](https://ai.google.dev/gemini-api/docs/deprecations) covers the Gemini API *preview* ids; our Veo 3.1, Veo 3.1 Fast and Veo 3.1 Lite run the released Vertex models on Comfy Router (`veo/veo-3.1-generate-001`, `-fast-`, `-lite-`), which the Router docs and pricing still list.

## Prices and costs

- The price is shown on the Generate button before every run. It is the **estimated real cost** and says who bills it: "Free · Local", "≈ $0.42 on your fal account", "≈ 89 Comfy credits". The ✦ look stands for an estimate, 1 ✦ = $0.01.
- Hosted models are priced at what the provider publishes, with no markup. The full table, with source URL, check date and an estimated flag for every entry, is in `server/src/shared/hostedPrices.ts` and at `GET /api/pricing`.
- Open-weight workflows run on Comfy Cloud cost the Comfy Cloud price shown on the button.
- **Runs locally always cost nothing**, in every backend (mock included).
- **You pay providers directly.** There is no in-app balance, top-up or refund in the default mode (`own-accounts`). Where a provider's API reports it (BFL per job; fal, Comfy Cloud and others for balance or usage), the app shows the **actual** cost next to the estimate.
- **Spend log:** every run is recorded with where it ran, who billed it, estimate, actual and the provider's failure rule (`GET /api/spend`, `GET /api/spend/summary`; the Spend page in the app).
- **No spending limits:** you control spend by how much you top up on each provider. A model with no published price runs on an estimate ("About $X (estimate)") and the real cost is recorded after the run.
- **Team mode** (optional, off by default; `OPENHIGGSFIELD_BILLING_MODE=team` or the billing setting): an operator who pays the providers gives users credit balances with charges and refunds, using the app's ledger.
- No plans, no subscription.

**When the app looks "free":** while only Local is set up (no Comfy Cloud or provider key), `GET /api/config` reports `"localFree": true`, and the app shows "Free · Local" instead of prices. As soon as a Comfy Cloud or provider key is set, `localFree` is `false` and prices show.

**Cheaper loops:** every video tool has a **480p draft** (about 30% of the price), and a finished result offers **Upscale** (`POST /api/jobs/:id/upscale`, SeedVR2, same seed, linked by `parentId`). Swap tools keep the **original audio** by default (`keepAudio=0` to drop it), and `POST /api/precheck` gives advisory warnings (static clip, prop shape/size, start-frame resolution/aspect/blur) before you spend a run.

## Input limits

Enforced on the server: video at least 4 s (longer than 30 s is trimmed), at least 409,600 pixels per frame, up to 30 reference images (sent in groups of 8), prompts up to 10,000 characters, resolution 480p/720p/1080p. No rights or Terms field is needed.

### Video lengths per model

Each video model accepts only the clip lengths it supports. Any other length is refused with `400 invalid_duration` and the allowed list ("Duration … isn't available for this model. Allowed: …"). Nothing is charged, and the length is never quietly changed.

| Model / route | Lengths you can pick |
|---|---|
| MiniMax H3 (local `comfy-h3`, and the H3 API routes) | 4–15 s |
| MiniMax H3 · Comfy Cloud workflow (`cloud-h3-wf`) | 5 or 10 s |
| MiniMax H3 · Comfy Cloud (`cloud-h3`) | 5–15 s |
| Veo (3.1, Fast, Lite) | 4, 6 or 8 s (1080p and 4K: 8 s) |
| Wan 3.0, Wan 3.0 Prime | 2–30 s |
| P-Video-2 | 2–20 s |
| Grok Imagine Video 1.5 Lite | 2–15 s |
| Kling | 3–15 s |
| Seedance | 4–15 s |
| Director API (`cinema`, no page in the app) on local LTX-2 19B or Wan Fun Camera | 5, 10, 15, 20 or 30 s |
| Camera Moves on Wan Fun Camera (local), the LTX-2 19B presets (local or Comfy Cloud), or H3 camera (local) | 3 or 5 s |
| Camera Moves on Kling / Veo / Seedance | same as the Kling, Veo and Seedance rows above |
| Photo FX (local) | 5 s |
| Photo FX on Kling / Veo / Seedance | same as the Kling, Veo and Seedance rows above |

Source: `server/src/tools/h3/videoCaps.ts` (`VIDEO_LIMITS`, `durationsFor`) and each tool's own list in `server/src/tools/apps.ts` (Camera Moves 3/5 s, Photo FX 5 s). The live list per route is on `GET /api/routes` (`routes[].durations`) and `GET /api/tools` (`providers[].durations`).

## Licences

Imagination Is All You Need's own code is AGPL-3.0-or-later. Each model has its own licence. **The app doesn't gate anything by licence**: licences are documented here, in [LICENSES.md](../LICENSES.md) and on the in-app `/licenses` page, and never change a default.

**Main open-weight models (summary; always check the licence itself):**

| Model | Licence | In short |
|---|---|---|
| Wan 2.2 (Animate, Fun Camera) | Apache-2.0 | Permissive, commercial use OK |
| MiniMax H3 | MiniMax H3 Community License | Free incl. commercial use up to US$20M yearly revenue; not licensed in the EU, UK, South Korea or US; a commercial UI must show "MiniMax H3"; see its acceptable-use policy |
| LTX-2 19B | LTX-2 Community License | Custom terms with a revenue limit; read before commercial use |
| Z-Image Turbo, Qwen-Image | Apache-2.0 | Permissive, commercial use OK |
| Qwen Image 2.1 | Qwen Research License | Research and non-commercial use only |
| MOSS-Image (SFT default + Base; local ComfyUI 0.41.3+, not on Comfy Cloud yet) | Apache-2.0 | Permissive, commercial use OK. Text-rendering image model from OpenMOSS ([model card](https://huggingface.co/OpenMOSS-Team/MOSS-Image-SFT)) |
| FLUX 3 Image Klein | FLUX Kommunity License v1.0 | Weights: non-commercial use. Outputs: commercial use allowed for "Qualifying Users" (under US$5M yearly revenue). No training competing models |
| SeedVR2 | Apache-2.0 | Permissive |
| SAM 3.1 (Object Swap mask preview) | SAM License | Royalty-free, including commercial use. Include the licence text if you redistribute. Trade-control and military-use limits ([licence](https://github.com/facebookresearch/sam3/blob/main/LICENSE)) |
| SAM 2 (Object Swap graphs) | Apache-2.0 | Keep the licence notice |
| ACE-Step 1.5, Chatterbox | MIT | Permissive |
| F5-TTS | CC BY-NC 4.0 | Non-commercial |

The full, generated list of every model and route is in [LICENSES.md](../LICENSES.md) and on `/licenses`. Every option in the model picker shows a "License" link (`/api/models`, `/api/tools`). Details and sources: [workflows/LICENSES.md](../workflows/LICENSES.md). Credit lines: [ATTRIBUTION.md](ATTRIBUTION.md). Plain-language notes per licence: [USAGE-NOTES.md](USAGE-NOTES.md).

> **Licence and usage.** Imagination Is All You Need has no policing layer: it does not filter, moderate, report or gate what you generate, and it asks for no Terms or rights acceptance. You are responsible for following each model's licence (including any acceptable-use policy and territory limits) and the terms of any cloud provider you use. For MiniMax H3, the licence requires a commercial UI to show "MiniMax H3" prominently (§IV.2), and encourages a "Powered by MiniMax H3" notice (§III.3.a), which the app shows as its credit line.

- **Qwen Image 2.1** uses research-only, non-commercial weights. You download them yourself; we don't redistribute any weights. If you need unrestricted commercial use, pick Apache-2.0 Qwen-Image in the model picker.
- **MiniMax H3** (Generate Video, 768p, with audio): MiniMax H3 Community License. Free, including commercial use; above $20M/yr revenue you need written authorisation from MiniMax. **The licence does not cover the US, EU, UK or South Korea; there you need a separate licence from MiniMax.** Commercial UIs must show "MiniMax H3". Outputs can't be used to improve other AI models. Details: [ATTRIBUTION.md](ATTRIBUTION.md).
- **Open-weights-only** is the only filter. It hides hosted (partner/API) providers and hosted model APIs (fal, BFL, MiniMax API, OpenAI, Replicate, …). Our own open-weight workflows run as standard Comfy Cloud jobs (e.g. `workflows/cloud/h3-t2v-api.json` / `h3-i2v-api.json`) count as open weights and stay. The Comfy Cloud H3 API-node route `cloud-h3` (`ComfyCloud*` partner nodes) is a hosted provider and is hidden in this mode. `OPENHIGGSFIELD_COMMERCIAL` has no effect.

**AI-generated content:** everything the tools make is AI-generated. When you share results in public, label them as AI-generated; some model licences require this (for example item 12 of the MiniMax H3 acceptable-use policy). The sample clips built into the app are Blender Foundation open movies (CC BY 3.0), not generations, and are labelled as samples ([ASSETS-CREDITS.md](../ASSETS-CREDITS.md)).

## Model notes

### FLUX 3 Image Klein (Create Image)

`comfy-flux3-klein`: generate, edit and inpaint with ComfyUI 0.41 core nodes. The workflows are `workflows/create-image-flux3klein-{t2i,edit,inpaint}-api.json`, rebuilt by `python3 scripts/build-flux3-klein.py <object_info.json>`. Settings follow the model card: 16 steps, cfg 1, euler/simple, prompt upsampler on (the int8 ConvRot build, which runs on a Mac; "Let the model rewrite my prompt" off, `promptRewrite=0`, runs the raw prompt and skips that 9.75 GB file). Layout boxes: send `boxes` = `[{"label": "a red kite", "box": [top, left, bottom, right]}]` on BFL's 0–1000 grid; the local graphs put them through the official `CreateBoundingBoxes` → `Flux3LayoutPrompt` nodes (cite box N as `<obj_N>`), and an empty list changes nothing. FLUX 3 Image (`api-flux3-image`) takes the same field and appends the partner node's box rows to the prompt; the hosted FLUX 3 Klein places don't take boxes. Weights come from `black-forest-labs/flux-3-image-klein-comfy`, which is gated: accept the licence on Hugging Face first. Licence: FLUX Kommunity License v1.0 ([text](https://huggingface.co/black-forest-labs/flux-3-image-klein/blob/main/LICENSE.md)). In short: you may use the model for non-commercial purposes; you may use its outputs commercially if you are a "Qualifying User" (you and your affiliates under US$5M gross yearly revenue); you need content filtering or output review, and AI disclosure where the law requires it; and you may not use outputs to train a competing model. Qwen-Image (Apache-2.0) is the option for unrestricted commercial use.

### Fish Audio Drama 3 (Audio · Voice, Voice Studio · Voiceover)

`comfy-drama3` runs through the pinned node pack `PedroMarinhoDev/ComfyUI-Drama3@66c4fb9` (installed by `npm run nodes:install`). The workflows are `workflows/voice-drama3-{tts,clone}-api.json` (`scripts/build-drama3.py`). With an uploaded voice sample, it is transcribed by Qwen3-ASR 0.6B and cloned. `app.metaTags` (`[{tag,label,category}]`, from `server/src/tools/drama3Tags.ts`) lists the inline control syntax from the Drama 3 technical report, Appendix C, for the tag chips; `app.metaTagProviders` says which providers they apply to. The node pack's README says it needs about 48 GB system RAM for the FP8 experts plus an 8 GB+ NVIDIA GPU. Audio-tool voice mode is mock-only for Drama 3; Voice Studio voiceover has the real ComfyUI path.

### Upscale (image)

`image-upscale`: factor ×2, ×4 or ×8 (`scale=2|4|8`, or the older `types=["x4"]`; quote and submit). Real-ESRGAN by default (×2, ×4, ×8 = x4plus then x2plus); 4x-UltraSharp (×4 only). Output is capped at 8192 px on the long side on every backend: a bigger factor is refused (`output_too_large`). Core-node workflows `workflows/image-upscale-*-api.json` (built by `scripts/build-image-upscale.py`); the quote and `tool.app.imageUpscale.workflows` name the file that runs for each model and factor. The old `sharpen`, `denoise` and `face` fields are gone (the graphs never used them) and are ignored if sent.

### Cloud person swap (Video Swap)

Replace one described person in a clip with the character from one image, keeping motion, camera, light, background and the clip's own sound. The idea comes from Comfy's Openjutsu app ([Comfy-Org/comfy-openjutsu](https://github.com/Comfy-Org/comfy-openjutsu), MIT), built on MiniMax H3 and Akatz Labs' H3 Character Swap workflow ([akatz-labs/h3-character-swap-tool](https://github.com/akatz-labs/h3-character-swap-tool), MIT). That H3 recipe is the separate **H3 Character Swap · Comfy Cloud** route (`server/src/comfy/h3CharSwapCloud.ts`, presets Sharper (768p) and Faster and cheaper (480p)). The models in this section are hosted video-edit models through Comfy Router (your Comfy key, billed to your Comfy account):

| Model | Router id | Length | Quality | Price (list) |
|---|---|---|---|---|
| Kling 3.0 Omni Edit (default) | `kling/kling-v3-omni`, video edit | 4–30 s; up to 10 s per request, longer ranges run as passes and are joined | 720p Standard / 1080p Pro | 26.59 / 35.45 Comfy credits per output second |
| Seedance 2.5 Edit | `byteplus/dreamina-seedance-2-5-260628`, video edit | 4–30 s in one pass | 480p / 720p / 1080p | tokens on clip + output seconds (480p ≈ 38.8 credits per clip second) |

Inputs: one character image (a clear full view or a character sheet), **Who to replace** (describe one person, e.g. "the man on the left in the black hoodie"), Quality, a **Trim** for the swap range (the model's maximum is shown), seed under Advanced. The exact price shows before Generate. Seedance takes the clip only as a public link, so it needs `OPENHIGGSFIELD_PUBLIC_BASE_URL`. Both are proprietary hosted APIs (provider terms; listed in [LICENSES.md](../LICENSES.md)). Wan 2.2 Animate and H3 Character Swap stay available as local models.

### Object Swap workflows

The default workflow `object-swap-wan-animate-api.json` is a 38-node Wan 2.2 Animate API graph, and the legacy `object-swap-api.json` is a 39-node one that passes ComfyUI `/prompt` validation (see `workflows/README.md`). Neither has been run on a GPU yet. A first real run needs a `COMFY_API_KEY` (or a local GPU + `comfy-api-proxy`) and the Wan Animate weights and custom nodes listed in `workflows/README.md`.

How a comfy-mode Object Swap job runs:
1. Upload video + reference through Comfy assets (`client.assets.fromFile`).
2. Load `workflows/object-swap-wan-animate-api.json` (legacy: `object-swap-api.json`) and set the LoadVideo / LoadImage / CLIPTextEncode inputs (PICK THE PERSON → positive prompt).
3. `client.submit`, then poll / follow events until done.
4. Download the SaveVideo output.
5. `ffmpeg` remuxes the original audio onto the result (`-map 1:a:0?`).
6. Serve it as `/files/<id>-result.mp4`.

## Who makes each model

Every model has a maker (`maker` and `makerName` on each `models[]` entry of `GET /api/tools`; `makers[]` and `models[].maker` on `GET /api/models/registry`). The app shows the maker as a small logo tile next to the model, never as text. Company and model names and logos are trademarks of their owners; see [ASSETS-CREDITS.md](../ASSETS-CREDITS.md).

| Model | Maker | Medium | Open weights |
|---|---|---|---|
| MiniMax H3 | MiniMax | video | yes |
| H3 Camera Motion | MiniMax | video | yes |
| H3 Talking Photo | MiniMax | video | yes |
| H3 Extend | MiniMax | video | yes |
| H3 Max Extend | MiniMax | video | no |
| H3 Character Swap | MiniMax | video | yes |
| H3 Style Transfer | MiniMax | video | yes |
| H3 VFX Edit | MiniMax | video | yes |
| LTX-2 19B | Lightricks | video | yes |
| Wan 2.2 Fun Camera 14B | Alibaba Wan | video | yes |
| Wan 2.2 Animate 14B | Alibaba Wan | video | yes |
| Wan 2.1 VACE 14B | Alibaba Wan | video | yes |
| Wan 2.2 I2V 14B | Alibaba Wan | video | yes |
| Seedance | ByteDance | video | no |
| Veo | Google | video | no |
| Kling | Kuaishou Kling | video | no |
| Veo 3.1 Lite | Google | video | no |
| Wan 3.0 Prime | Alibaba Wan | video | no |
| P-Video-2 | Pruna AI | video | no |
| Grok Imagine Video 1.5 Lite | xAI | video | no |
| SeedVR2 | ByteDance | video | yes |
| FLUX 3 Upscaler | Black Forest Labs | video | no |
| BiRefNet | BiRefNet authors | video | yes |
| Bria Video Background Removal | Bria | video | no |
| Luma Reframe | Luma AI | video | no |
| RIFE 4.9 | RIFE authors | video | yes |
| Depth Anything V2 Small | Depth Anything team | video | yes |
| ffmpeg HDR10 conversion | FFmpeg | video | yes |
| Nano Banana 2 | Google | image | no |
| GPT Image | OpenAI | image | no |
| Seedream | ByteDance | image | no |
| FLUX.2 [pro] | Black Forest Labs | image | no |
| FLUX.2 [flex] | Black Forest Labs | image | no |
| Ideogram V4 | Ideogram | image | no |
| Recraft V4 | Recraft | image | no |
| Luma Image | Luma AI | image | no |
| Kling Image | Kuaishou Kling | image | no |
| Krea | Krea | image | no |
| Runway Image | Runway | image | no |
| Grok Imagine | xAI | image | no |
| Qwen Image 3 | Alibaba Qwen | image | no |
| Wan Image | Alibaba Wan | image | no |
| Hunyuan Image | Tencent Hunyuan | image | no |
| Meta Muse | Meta | image | no |
| Qwen Image 2.1 | Alibaba Qwen | image | yes |
| Qwen-Image | Alibaba Qwen | image | yes |
| Qwen-Image-Edit-2509 | Alibaba Qwen | image | yes |
| Qwen Edit + Angles | Alibaba Qwen | image | yes |
| Z-Image-Turbo | Tongyi-MAI | image | yes |
| Z-Image | Tongyi-MAI | image | yes |
| FLUX.2 [klein] 4B | Black Forest Labs | image | yes |
| FLUX 3 Klein | Black Forest Labs | image | yes |
| FLUX.2 [dev] | Black Forest Labs | image | yes |
| MOSS-Image | OpenMOSS | image | yes |
| MOSS-Image Base | OpenMOSS | image | yes |
| Z-Image-Turbo + look LoRAs (legacy look recipe, no menu page) | Tongyi-MAI + community LoRAs | image | yes |
| Real-ESRGAN | Tencent ARC | image | yes |
| 4x-UltraSharp | Kim2091 | image | yes |
| MiniMax Music 3 | MiniMax | audio | no |
| Sonilo Music | Sonilo | audio | no |
| Sonilo Video-to-Music | Sonilo | audio | no |
| ByteDance Seed Audio | ByteDance | audio | no |
| ACE-Step 1.5 | ACE Studio & StepFun | audio | yes |
| Stable Audio Open 1.0 | Stability AI | audio | yes |
| MMAudio | MMAudio authors | audio | yes |
| ElevenLabs Sound Effects | ElevenLabs | audio | no |
| ElevenLabs v4 | ElevenLabs | audio | no |
| MiniMax Speech 2.8 HD | MiniMax | audio | no |
| Fish Audio S2.1 Pro | Fish Audio | audio | no |
| HeyGen Voice | HeyGen | audio | no |
| Qwen3 TTS | Alibaba Qwen | audio | no |
| Chatterbox | Resemble AI | audio | yes |
| Chatterbox Voice Changer | Resemble AI | audio | yes |
| Fish Audio Drama 3 | Fish Audio | audio | yes |
| F5-TTS | SWivid | audio | yes |
| Translate with Chatterbox | Resemble AI | audio | yes |
| Translate with F5-TTS | SWivid | audio | yes |
