# Local models and your hardware

Imagination Is All You Need can run open-weight models on your own computer through ComfyUI, for 0 credits. It checks your hardware so it can tell you which models will run well, which will be slow, and which are too heavy.

## How the app reads your hardware

- It asks the connected ComfyUI for its system stats. If ComfyUI runs on this same computer, it can also read the computer itself (`nvidia-smi` on NVIDIA, system info on a Mac). It never measures Comfy Cloud, because that GPU isn't yours.
- The result is cached for 5 minutes. Check it with:

```bash
curl -s http://localhost:8787/api/hardware            # add ?refresh=1 (or POST /api/hardware/refresh) to check again now
```

The answer includes `tier`, `tierLabel`, `gpu`, `ram`, `disk`, `effectiveVramGB` and a plain `note`. On a Mac, the usable graphics memory is estimated as 75% of system memory.

## Hardware tiers

| Tier | Graphics memory | What it means |
|---|---|---|
| `none` | under 4 GB, or no graphics card | Local runs are limited to the smallest tools |
| `light` | 4 to under 8 GB | Runs the light local models (upscalers, cut-outs, voice and audio) |
| `most` | 8 to under 24 GB | Runs most local models |
| `all` | 24 GB or more | Runs every local model (some slowly) |
| `unknown` | couldn't be read | **Nothing is blocked.** The app doesn't guess |

## Machine classes

`GET /api/hardware` also returns `profile` (one shared classifier, `server/src/hardware/machineProfile.ts`, used by the fit checks and by `npm run doctor`):

| Class | How it's recognised | What changes |
|---|---|---|
| `apple-silicon` | ComfyUI reports `mps` | Usable memory ≈ 0.75 × RAM (an estimate). fp8, nvfp4 and w4a8 weights don't load, so those models are marked "don't run on a Mac" |
| `nvidia` | CUDA card; VRAM class `<8` / `8` / `12` / `16` / `24` / `32+` | fp8 runs natively on RTX 40 / Ada and newer, upcast on older cards; nvfp4 loads but runs dequantized (slower) |
| `nvidia-blackwell` | RTX 50-series, RTX PRO Blackwell, B-series (name or compute capability 10+) | nvfp4 runs natively |
| `dgx-spark` | NVIDIA GB10 (ARM64 Linux, about 128 GB unified memory) | Usable "VRAM" is system memory (nvidia-smi shows `[N/A]` there), so big models fit, more slowly than on a desktop card. Some custom nodes have no aarch64 Python wheels |
| `amd-rocm` | ROCm, or an AMD card name | Memory rule only; some custom nodes are CUDA-only |
| `cpu-only` | no graphics card | Only the small image tools run locally |
| `unknown` | nothing could be read | Nothing is blocked |

**These classes are tested against simulated machines, not real hardware.** The fixtures in `server/test/fixtures/machines/` (Windows + RTX 4090, Linux + RTX 3060 12 GB, RTX 5090, DGX Spark, CPU only) are `/system_stats` and `nvidia-smi` answers reconstructed from public specs; only the Mac M1 Max one comes from a real machine. `server/test/machine-profiles.test.ts` checks the class and a few fit verdicts for each. If yours is classified wrong, `npm run doctor -- --json` shows what was read.

## What the app does with it

Each local model gets one of these verdicts for your computer: **fits**, **slow** (it can run by offloading to system memory, or on a Mac), **too heavy**, or **unknown**.

- **A too-heavy model is never picked automatically.** If you pick it yourself, it still runs, with a warning that it may fail or be very slow.
- **With Use local ComfyUI on**, models that fit come first, then slow ones, which carry a note ("Runs locally, free, but slowly on this computer").
- **Local shows as plainly free only when it fits** (or when the hardware is unknown). A slow route says "slow on this computer" next to the price.
- When the hardware is `unknown`, nothing is enforced: every local model stays available.
- If a model's files are missing and bigger than your free disk space, the app says "not enough disk" instead of trying.

## If your hardware can't be detected

Tell the app yourself:

```bash
curl -s -X PUT http://localhost:8787/api/hardware -H 'content-type: application/json' -d '{"vramGB":12,"ramGB":32}'
# vramGB: 0–1024 (0 = no graphics card); ramGB is optional
curl -s -X DELETE http://localhost:8787/api/hardware/override    # clear it again
```

Your values are used only while automatic detection can't see the hardware. The same form is in **Settings → Local models**, which also tests the ComfyUI address and downloads model files.

## Point the app at your ComfyUI

- Set `COMFY_BASE_URL` (for example `http://127.0.0.1:8188`) before starting, or change it while the app runs:

```bash
curl -s http://localhost:8787/api/local/comfy                                    # current address; canChange says if you can change it
curl -s -X POST http://localhost:8787/api/local/comfy/test -H 'content-type: application/json' -d '{"url":"http://127.0.0.1:8188"}'
curl -s -X PUT  http://localhost:8787/api/local/comfy      -H 'content-type: application/json' -d '{"url":"http://127.0.0.1:8188"}'
```

- Changing or testing another address only works when the server runs on your own computer (the default `HOST` for `npm run dev`). Otherwise the answer is 403 and you set `COMFY_BASE_URL` instead. The test waits up to 3 seconds and reports whether ComfyUI answered, its version, its GPU and whether it has the GGUF nodes.

## Model files and one-click downloads

Set `OPENHIGGSFIELD_COMFY_MODELS_DIR` to your ComfyUI `models` folder (for example `/home/you/ComfyUI/models`). The app then checks which files each local model needs and which you already have.

One-click download (`POST /api/local/downloads`):
- **Never automatic.** It starts only when you click Download (or "Download and run" on a job).
- **The size is shown first.** Ask for the plan without downloading anything:

```bash
curl -s -X POST http://localhost:8787/api/local/downloads -H 'content-type: application/json' -d '{"providerId":"<model id>","dryRun":true}'
# → files, missingBytes, diskFreeBytes, canDownload, code
```

- **Needs `OPENHIGGSFIELD_COMFY_MODELS_DIR`**, pointing at a folder that exists. Without it the download is refused (`409 no_models_dir`). The app never guesses a folder.
- **Refused when disk space is short** (`409 not_enough_disk`, with how much is needed and how much is free).
- Files go into `<models folder>/<subfolder>/<file>`, resume if interrupted, and are checked against their sha256 when the manifest has one.
- No models folder set? The app still checks which files you have: it asks the connected ComfyUI for its model lists (`/experiment/models/<folder>`, which covers Comfy Desktop's shared models folder too), so models show as ready or "needs a download" instead of guessing. `GET /api/hardware` also says which ComfyUI it is (`comfy.kind`: desktop, portable, docker or manual) and the models folder its settings use. One-click downloads still need `OPENHIGGSFIELD_COMFY_MODELS_DIR` (`npm run doctor` prints the line to add).
- Files from civitai.com use `CIVITAI_TOKEN` if you set it. The token is never logged, stored or returned.
- Files from huggingface.co use your Hugging Face read token (Settings → Connections → Hugging Face, or `OPENHIGGSFIELD_HF_TOKEN`). A gated model answers 401/403 until you accept its licence on its Hugging Face page; the download then says so and links the page.
- Some models serve several model families; then use the `downloadId` the app gives you (in `requirements.downloadId` or `fit.downloadId`) instead of `providerId`.
- Follow progress with `GET /api/local/downloads` or `GET /api/local/downloads/:id`; cancel with `DELETE /api/local/downloads/:id`.

The command-line route still works too: `scripts/install.sh --comfy-dir ~/ComfyUI --tools <tools>` (see [INSTALL.md](INSTALL.md#one-command-installer-scriptsinstallsh)).

## Qwen3 TTS 1.7B (installed by hand)

Qwen3 TTS (Audio → Voiceover) runs from the open weights of [Qwen3-TTS-12Hz-1.7B-CustomVoice](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice) (Apache-2.0, Alibaba Qwen) through the [flybirdxx/ComfyUI-Qwen-TTS](https://github.com/flybirdxx/ComfyUI-Qwen-TTS) node pack (Apache-2.0). The card is runnable once your ComfyUI has the `FB_Qwen3TTSCustomVoice` node and the model folder; until then it shows as not installed. The app never downloads it for you: the model is a folder of files, not one file.

1. Node pack: clone it into `ComfyUI/custom_nodes/ComfyUI-Qwen-TTS` at commit `374c2e0` (or run `npm run nodes:install -- <your ComfyUI>`), then install only `sox` and `tiktoken` with ComfyUI's Python. Skip the pack's `requirements.txt`: it pins `transformers<5` and `onnxruntime-openvino`, which has no macOS build.
2. Model (about 4.5 GB): put the whole Hugging Face repo in `ComfyUI/models/qwen-tts/Qwen3-TTS-12Hz-1.7B-CustomVoice/` (folder name as shown, directly under `qwen-tts`; the node finds it by name). The pack also fetches the shared tokenizer `Qwen3-TTS-Tokenizer-12Hz` (about 0.7 GB) into the same folder on first use.
3. Restart ComfyUI. `GET /object_info/FB_Qwen3TTSCustomVoice` should answer, and the card turns runnable.

Speed: on an M1 Max about 10 s of work per second of speech (the first run also loads the model). One script is up to 2,000 characters.

## Lighter GGUF versions

Some large models list lighter GGUF files. They become selectable once your ComfyUI has the **ComfyUI-GGUF** custom nodes (the app checks for the `UnetLoaderGGUF` node). Until then they're shown for information only. ComfyUI-GGUF ([city96/ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF), Apache-2.0) is listed as an **optional** pack in `readiness/manifest/custom-nodes.json`, but `npm run nodes:install` and `scripts/install.sh` skip optional packs, so add it to ComfyUI yourself (for example with ComfyUI Manager) if you want these. The app picks it up once ComfyUI reports the node.

## Learned timings

On a real backend the app learns how long downloads, model loading and runs take on your computer, and uses that for its time estimates. In mock mode it doesn't learn.

```bash
curl -s http://localhost:8787/api/eta/learned            # what it has learned so far
curl -s -X DELETE http://localhost:8787/api/eta/learned  # forget it (also in Settings)
```

## Live preview while it renders

On Local the generating tile can show the picture forming: ComfyUI sends a small preview image after each sampler step, and the app keeps the latest one per job (in memory only, at most 2 per second, dropped when the job ends). The app asks for previews on its own prompts only (`extra_data.preview_method` on each prompt it sends); your ComfyUI settings and your own runs are untouched. Hosted places (Comfy Cloud, Comfy Router, fal, Replicate, BFL) send no previews.

```bash
curl -s http://localhost:8787/api/jobs/<id> | jq .progressInfo   # stage, step/steps, etaSeconds, previewUrl while a frame exists
curl -s -o frame.jpg http://localhost:8787/api/jobs/<id>/preview # the latest frame (404 when there is none)
```

Preview quality depends on how ComfyUI turns the half-finished latent into a picture. `OPENHIGGSFIELD_COMFY_PREVIEW_METHOD` picks it:

| Value | What you get |
|---|---|
| `auto` (default) | ComfyUI's quick colour approximation (latent2rgb). No extra files; small, soft and a bit off in colour, but it shows the composition forming |
| `taesd` | A much closer preview from the tiny TAESD decoder. Needs the decoder for the model's family in `models/vae_approx/` (for example `taef2_decoder` for FLUX.2, `taef1_decoder` for FLUX.1, `taesdxl_decoder` for SDXL, `lighttaew2_2` for Wan 2.2). Without the file ComfyUI logs a warning and falls back to the quick preview |
| `latent2rgb` | Same as `auto` |
| `none` | No previews |
| `default` | Send nothing: your ComfyUI's own launch setting (`--preview-method`) decides; ComfyUI Desktop starts without previews |

The TAESD decoders are small files (a few MB each) published by their author at [madebyollin/taesd](https://github.com/madebyollin/taesd) (and the video ones at [madebyollin/taehv](https://github.com/madebyollin/taehv)). The app doesn't download them; put the one for your model into your ComfyUI `models/vae_approx/` folder and set `OPENHIGGSFIELD_COMFY_PREVIEW_METHOD=taesd`. If you use ComfyUI's own interface, its **Live preview method** setting (Settings › Comfy › Execution; it starts at `default`, the launch setting) does the same for the runs you start there; set it to `auto` or `taesd`.

## Will it run on my machine?

Compatibility and speed depend on the selected model variant, precision, custom nodes, resolution, memory and offloading. Check the app's current model/run-location readiness and the [model manifest](../readiness/manifest/models.json); an engineering fit estimate is not a verified benchmark or guarantee of GPU support.

The app learns your own timings after the first run of each model (see [Learned timings](#learned-timings)).

## Graphics memory per tool

These are estimates from model file sizes in `readiness/manifest/models.json`, not measured: resident weights plus activations, with the text encoder offloaded after encoding. `./scripts/install.sh --list-tools` prints the per-workflow numbers.

| Tool | Download | Est. VRAM | Fits 24 GB (4090) | Mac (MPS) |
|---|---|---|---|---|
| Upscale (image) | 0.1 GB | 1.6 GB | yes | yes |
| Cutout | 0.4 GB | 1.9 GB | yes | yes |
| Audio / Soundtrack (ACE-Step, MMAudio) | 5–10 GB | 6–7 GB | yes | yes |
| Create Image: FLUX.2 Klein 4B text-to-image and edit (bf16 distilled file, 4 steps; an fp8 file is an NVIDIA-only option) | 16 GB | 10 GB | yes | yes |
| Create Image: Qwen Image 2.1, Z-Image | 21–27 GB | 12–14 GB | yes | untested (amber) |
| Create Image: Qwen Edit 2509, FLUX.2 dev | 12–74 GB | 10–40 GB | partly | no (fp8) |
| Video Upscale / 60 fps / creative | 4–9 GB | 7–13 GB | yes | no (fp8) |
| Photo FX, Camera (moves), Re-shoot Fun Camera | 38 GB | about 20 GB | yes | no (fp8) |
| Object Swap, Motion Transfer (Wan 2.2 Animate) | 29–30 GB | 25 GB | tight (32 GB, 5090) | no (fp8) |
| Generate Video (MiniMax H3) | 42 GB | 30 GB | no (32 GB+) | amber |
| Camera LTX, Re-shoot, Restyle | 42–47 GB | 40–41 GB | no (H100 / offload) | no (fp8) |
| Voice (Fish Audio Drama 3) | 40–42 GB | about 42 GB (file-size estimate; the model card says 8 GB GPU + about 48 GB RAM) | with offload | no |

Apple Silicon support depends on the actual model precision and nodes; do not assume an NVIDIA workflow works unchanged on MPS. See [Install and run](INSTALL.md) and the model's current readiness information. The app learns your own timings after runs; the figures above are estimates, not proof that each route has run on that hardware.
