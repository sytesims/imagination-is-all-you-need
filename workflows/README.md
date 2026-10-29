# Imagination Is All You Need ComfyUI workflows

## Object Swap (`object-swap-api.json`)

Target model: **Wan 2.2 Animate 14B** in **Mix** mode (character/object swap that keeps background, motion, lighting). Audio is **not** produced by the model — the Imagination Is All You Need server remuxes the original soundtrack with ffmpeg after the job finishes.

Hub use-case: https://comfy.org/workflows/use-cases/ai-character-replacement/

Official template (UI format, kept here for reference): `video_wan2_2_14B_animate-ui.json`  
Source: https://comfy.org/workflows/video_wan2_2_14B_animate-c2c4b45b7df5/  
Raw template: https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/templates/video_wan2_2_14B_animate.json

### Status of `object-swap-api.json` (updated 2026-10-16)

**Real and validated.** `object-swap-api.json` is a full API-format graph generated from the official template by `scripts/build-object-swap.py` (which uses `scripts/ui2api.py`, a UI→API converter that expands subgraphs and maps widgets via `/object_info`). It passes ComfyUI `/prompt` validation (`node_errors: {}`) on a local ComfyUI with the three custom nodes below and the model filenames below present. It has **not** been run on a GPU yet.

Changes vs the template: 832×480 default (template is 640×640), fixed the template bug that wires width into height on the extend segments, one final SaveVideo always at node `277`, intermediate saves removed.

Length: one 77-frame base segment plus N extend segments (72 new frames each), all at **16 fps**. `object-swap-api.json` = 1 extend (~9.3 s). Variants `object-swap/ext-0.json` … `ext-6.json` cover ~4.8 s to ~31.8 s; the server should pick the smallest one that covers the source and pre-convert the source to 16 fps. Who gets replaced is set by the SAM2 point(s) in node `229`, not by the prompt in node `21`. All extra bindings are in `node-map.json` under `extra`.

Rebuild after a template update:
```bash
curl -s http://127.0.0.1:8188/object_info > /tmp/object_info.json   # any ComfyUI with the custom nodes
python3 scripts/build-object-swap.py /tmp/object_info.json
```

### Required models (open weights)

Place under your ComfyUI `models/` tree (or include them in a Comfy API Build):

| Path | File |
|------|------|
| `diffusion_models/` | `Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ.safetensors` (or BF16) |
| `loras/` | `lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors` (4-step distill, used) |
| `loras/` | `WanAnimate_relight_lora_fp16.safetensors` (relight, used) |
| `sam2/` | `sam2_hiera_base_plus.safetensors` (auto-downloaded by the SAM2 node) |
| `text_encoders/` | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` |
| `clip_visions/` | `clip_vision_h.safetensors` |
| `vae/` | `wan_2.1_vae.safetensors` |

Docs: https://docs.comfy.org/tutorials/video/wan/wan2-2-animate

### Custom nodes

- ComfyUI-KJNodes
- comfyui_controlnet_aux (DWPose; needs `scikit-image`)
- ComfyUI-segment-anything-2 (SAM2 mask)

### How Imagination Is All You Need drives the graph

```ts
import { Comfy } from "@comfyorg/sdk";
const client = new Comfy({ apiKey: process.env.COMFY_API_KEY });
const wf = await client.workflows.fromFile("workflows/object-swap-api.json");
wf.setInput("10", "image", client.assets.fromFile(refImage));
wf.setInput("145", "file", client.assets.fromFile(sourceVideo));
wf.setInput("21", "text", whoToReplacePrompt);
const job = await client.run(wf);
await job.getOutputs("277")[0].toFile("out.mp4");
// then ffmpeg remux of original audio — see server/src/ffmpeg.ts
```

Same client works against Comfy Cloud, a `*.run.comfy.app` deployment (`COMFY_BASE_URL`), or local `comfy-api-proxy` on `http://127.0.0.1:8189`.

### `object-swap-wan-animate-api.json` (2026-10-17)

Hand-authored Wan 2.2 Animate Mix graph, same node ids and placeholders as above, built by `scripts/build-object-swap-wan-animate.py` (variants `object-swap-wan-animate/ext-0..6.json`, mask-override `mask-ext-0..6.json`). Sources, models, tool wiring changes and open points: [object-swap-wan-animate.NOTES.md](object-swap-wan-animate.NOTES.md).

## Object Swap: server prep (`server/src/comfy/objectSwap.ts`, only with `OPENHIGGSFIELD_BACKEND=comfy`)
- Processed size: long side 832, short side by aspect, both multiples of 16 (1280×720 → 832×464, 1080×1920 → 464×832).
- Source → **16 fps** at that size with ffmpeg (`<job>-16fps.mp4`, video only). The original audio is remuxed after the run.
- Variant: the smallest `object-swap/ext-N.json` covering the clip (4.8 / 9.3 / 13.8 / 18.3 / 22.8 / 27.3 / 31.8 s). Longer clips use ext-6 and are trimmed.
- PointPicker click (normalized x,y) → node `229` `coordinates` + `points_store` in processed pixels (centre if no click). `width`/`height` on 229, 159 and 160.
- Reference → node `10`, 16 fps video → node `145`, prompt → `21`, seed → `232:63` (+1 per extend `extN:91`).
- Dry run without Comfy: `cd server && npx tsx scripts/comfy-dryrun.ts <video>` writes patched graphs to `/tmp/oj-dry-*.json`, which pass validation.

## All tool workflows (built from official templates)
Built by `scripts/build-workflows.py <object_info.json>` (same `ui2api.py` converter) from copies of the official **open-weights** templates in `workflows/templates/` (Comfy-Org/workflow_templates, MIT, commit in `templates/SOURCE_COMMIT`). Node maps: `workflows/node-maps/<tool>.json`. Rebuild everything: `npm run workflows:build`. Validate: `npm run workflows:validate`. Both need the validator on :8190.

| Tool | Workflow | Template | What we changed |
|---|---|---|---|
| Object Swap | `object-swap-api.json`, `object-swap/ext-0..6.json` | `video_wan2_2_14B_animate` (Mix) | see above |
| Motion Transfer | `motion-transfer-api.json`, `motion-transfer/ext-0..6.json` | `video_wan2_2_14B_animate` (**Move**) | `background_video` + `character_mask` disconnected on every WanAnimateToVideo; SAM2/mask branch pruned |
| Restyle | `restyle-api.json` | `video_wan_vace_14B_v2v` | control video = Canny of the source (node 200); style ref → node 134; 832×480, 81 frames; fp8 text encoder; source audio passed to CreateVideo |
| Re-shoot | `reshoot-api.json` (default, LTX) · `reshoot-funcamera-api.json` (fallback) | `video_ltx2_pose_to_video` + camera-control LoRA (node 300) · `video_wan2_2_14B_fun_camera` | one run per angle (`server/src/comfy/reshoot.ts` `ANGLE_MAP`); fallback via the `comfy-funcamera` provider or `OPENHIGGSFIELD_RESHOOT_ENGINE=funcamera` |
| Camera (LTX presets) | `camera-ltx-api.json` | `video_ltx2_i2v` + camera LoRA node 300 | `ltx-*` presets; the 20 Fun Camera presets map to poses, combinations and speed in `cameraPresets.ts` |
| Upscale variants | `upscale-creative-api.json` · `upscale-60fps-api.json` | SeedVR2 7B · SeedVR2 3B + RIFE VFI node 400 (`upscale.ts` picks the multiplier) | |
| Camera Moves | `camera-moves-api.json` | `video_wan2_2_14B_fun_camera` | 832×480, 81 frames; `camera_pose` (node 108) from the preset |
| Photo FX | `photo-fx-api.json` | `video_wan2_2_14B_i2v` | 832×480; 4-step LightX2V switch on; effect prompt → 129:93 |
| Upscale | `upscale-api.json` | `utility_seedvr2_video_upscale` | whole clip (no 96-frame preview, no pre-downscale); 3B fp8 DiT by default |
| Generate Video (local Wan 2.2 5B) | `wan22-ti2v-5b-api.json` | `video_wan2_2_5B_ti2v` ([docs](https://docs.comfy.org/tutorials/video/wan/wan2_2)) | hand-flattened (11 core nodes, same node ids); fp16 umt5 text encoder instead of fp8 and euler instead of uni_pc (Apple Silicon); Load Image wired to `start_image` for image to video, dropped for text to video; size / length (4n+1 at 24 fps) / seed / steps per job in `server/src/comfy/wan22.ts` |
| Render (Direct a Shot step 3, local LTX-2.5) | `ltx25-layout-to-render-api.json` | `video_ltx2_5_t2v` / `video_ltx2_5_i2v` (two-stage distilled ladder) + `video_ltx2_3_ic_lora` (IC-LoRA guide); recipe from [Lightricks' Layout to Render card](https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render) and [docs.ltx.io](https://docs.ltx.io/open-source-model/vfx-post-production/layout-to-render) | hand-built (42 nodes; Lightricks' own JSON is gated): GGUF Q4_K_M transformer + bf16 Gemma 4 text encoder for Apple Silicon; the layout clip guides both stages, the art-directed first frame sits before the clip (latent_idx -1) on both stages; 8 + 3 distilled steps, CFG 1, euler_ancestral; size / frames / seed / prompt per job in `server/src/comfy/makeItReal.ts`; validated against the user's ComfyUI 0.42.5 `/object_info` (`server/test/fixtures/object-info-ltx25-layout.json`) |
| Footage Effects (local LTX-2.5 IC-LoRA video-to-video base) | `ltx25-iclora-v2v-api.json` | cloned from our `ltx25-layout-to-render-api.json` (`video_ltx2_5_t2v` / `video_ltx2_5_i2v` ladder + `video_ltx2_3_ic_lora` guide); IC-LoRAs and prompt conventions from Lightricks' cards ([Clean Plate](https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Clean-Plate), [Day to Night](https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Day-To-Night), [Water Simulation](https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Water-Simulation), [Alpha Gen](https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Alpha-Gen)) | 40 nodes; the source clip guides both stages through LTXVAddGuide + GetICLoRAParameters, optional first frame (LTXVImgToVideoInplace) dropped when unused, the source sound muxed back; IC-LoRA, strength and prompt per job in `server/src/comfy/ltx25IcLora.ts` (variants: effect built; ripple, motion, outpaint, inpaint planned); validated against the user's `/object_info` (`server/test/fixtures/object-info-ltx25-iclora.json`) |
| Generate Video (local LTX-2.5 22B, with sound) · Transitions (Morph) | `ltx25-ti2v-api.json`, `ltx25-flf-api.json` | `video_ltx2_5_i2v` (text + image to video; text = its "Switch to Text to Video") and `video_ltx2_5_flf2v` ([docs](https://docs.comfy.org/tutorials/video/ltx/ltx-2-5)) | hand-flattened, template node ids kept. Same Mac files as Direct a Shot’s Render step (UnetLoaderGGUF Q4_K_M, bf16 Gemma 4 12B, conv bf16 video VAE) instead of the int8 ConvRot files; ImageScale to the output size instead of the long-side resize; no prompt enhancer. Two stages (half size, 8 distilled sigmas → x2 latent upscale → 0.85 / 0.725 / 0.4219 / 0), CFG 1, 24 fps, frames = seconds × 24 + 1. The FLF template is one stage: ours adds the same second stage, guides re-added at 1.0 and cropped before decode. LTX's own sound is kept. **Loop** (2026-10-26): the FLF graph with the start frame as both guides (frame 0 and -1), then core `ImageFromBatch` drops the repeated last frame and `TrimAudioDuration` cuts the sound to match (2 s = 48 frames), so the clip repeats seamlessly; no LTX-2.x loop template exists. Patched per job in `server/src/comfy/ltx25Video.ts` |
| Lip Sync / Talking photo (local LTX-2.5, `comfy-ltx25-lipsync`) | `ltx25-a2v-api.json` | Lightricks [`LTX-2.5_A2V_Two_Stage_Distilled.json`](https://github.com/Lightricks/ComfyUI-LTXVideo/blob/master/example_workflows/2.5/LTX-2.5_A2V_Two_Stage_Distilled.json) (core audio-to-video path) on our `ltx25-ti2v-api.json` (`video_ltx2_5_i2v`); lip driver recipe from [QuokkaiLab](https://github.com/sducly/quokkai-lab-ltx25-lipsync-fix) (sducly) | hand-built, template node ids kept. The speech is encoded and frozen (SolidMask 0 → SetLatentNoiseMask) in both stages; the server makes the processed driver and the clean soundtrack (`server/src/audio/lipDriver.ts`, ringmod70 + timing, rebuilt in TypeScript, no custom node). Soundtrack = your speech. Length follows the speech, ≤ 113 frames (4.71 s) at 24 fps; Draft / Sharper. Text only drops the image nodes. |

### Validation (local ComfyUI on CPU, 2026-10-16)
`/prompt` accepted with `node_errors: {}` for all graphs: object-swap and motion-transfer plus their ext-0..6, restyle, camera-moves, camera-ltx, reshoot (LTX), reshoot-funcamera, photo-fx, and upscale (precise, creative, 60fps). Patched dry-run graphs also pass (`npx tsx server/scripts/comfy-dryrun.ts <clip>`): Object Swap with 1, 2 and 4 references, Restyle chunks with and without a style ref, LTX re-shoot per angle, and upscale at 60 fps. Nothing was run; zero-byte placeholders stand in for the weights. The validator needs `OJ_VALIDATOR_FAKE_CUDA=1` (`start-validator.sh`).

### Custom nodes
| Node pack | Used by | Licence |
|---|---|---|
| ComfyUI core (incl. WanAnimateToVideo, WanVaceToVideo, WanCameraImageToVideo/Embedding, WanImageToVideo, Canny, ComfySwitchNode, ComfyMathExpression) | all | GPL-3.0 |
| [kijai/ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes) (PointsEditor, GrowMask, BlockifyMask, DrawMaskOnImage…) | object-swap, motion-transfer | GPL-3.0 |
| [Fannovel16/comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux) (DWPose, PixelPerfectResolution) | object-swap, motion-transfer | Apache-2.0 |
| [kijai/ComfyUI-segment-anything-2](https://github.com/kijai/ComfyUI-segment-anything-2) (SAM2) | object-swap | Apache-2.0 |
| [numz/ComfyUI-SeedVR2_VideoUpscaler](https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler) (SeedVR2Load*) | upscale | Apache-2.0 |

No InsightFace anywhere. DWPose uses yolox + dw-ll_ucoco (ONNX/TorchScript, auto-downloaded).

### Model files per tool (all open weights)
| Tool | Files (ComfyUI `models/` subfolder) | Licence |
|---|---|---|
| Object Swap / Motion Transfer | `diffusion_models/Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ.safetensors`, `loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors`, `loras/WanAnimate_relight_lora_fp16.safetensors`, `text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors`, `clip_vision/clip_vision_h.safetensors`, `vae/wan_2.1_vae.safetensors`, `sam2/sam2_hiera_base_plus.safetensors` (swap only, auto-download) | Wan, LightX2V, umt5, SAM2: Apache-2.0; CLIP-ViT-H: MIT |
| Restyle | `diffusion_models/wan2.1_vace_14B_fp16.safetensors`, `loras/wan2.1_t2v_14b_lora_rank64_lightx2v_4step.safetensors` (4 steps, cfg 1), umt5 fp8, wan_2.1_vae | Apache-2.0 (CausVid dropped: CC BY-NC 4.0) |
| Re-shoot / Camera Moves | `diffusion_models/wan2.2_fun_camera_high_noise_14B_fp8_scaled.safetensors`, `…_low_noise_14B_fp8_scaled.safetensors`, umt5 fp8, wan_2.1_vae | Apache-2.0 (Wan 2.2 Fun, alibaba-pai) |
| Photo FX | `diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors`, `…_low_noise_14B_fp8_scaled.safetensors`, `loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors`, `…_low_noise.safetensors`, umt5 fp8, wan_2.1_vae | Apache-2.0 |
| Upscale | `SEEDVR2/seedvr2_ema_3b_fp8_e4m3fn.safetensors` (or 7b / 7b_sharp), `SEEDVR2/ema_vae_fp16.safetensors` (auto-download by the node) | Apache-2.0 (ByteDance-Seed SeedVR2) |

Download links: the official template JSONs carry the `models[].url` list (Comfy-Org/Wan_2.2_ComfyUI_Repackaged, Wan_2.1_ComfyUI_repackaged, Kijai/WanVideo_comfy on Hugging Face).

### Open questions
- **Restyle length:** `restyle.ts` splits clips into 81-frame passes with a 16-frame overlap and xfade-blends the seams with ffmpeg. Style presets are in `server/samples/styles/` (swatch + prompt template). ⚠️ The swatches are procedural.
- **Licences:** see [LICENSES.md](LICENSES.md). ⚠️ LTX-2 (Community License) and Gemma are not permissive.
- **Restyle presets:** VACE wants a style reference image. Presets need a per-style swatch image (ours) or prompt-only (no ref, node 134 disconnected). Decide which.
- **Re-shoot fidelity:** the official templates have no true open-weights video-to-video re-camera model. Fun Camera re-generates each range from its first frame, so motion is not preserved exactly. LTX-2 camera IC-LoRAs or ReCamMaster-style weights would be closer, but no official template exists.
- **Camera Moves:** Fun Camera has 9 poses (static, pan up/down/left/right, zoom in/out, rotate). Our 20 presets need a mapping, or LoRAs for orbit/crane/FPV. Mix = chained segments?
- **Upscale:** "Creative" vs "Precise" = 7B sharp vs 3B? "60 fps smooth" needs frame interpolation (RIFE/FILM custom node, not added).
- **Object Swap:** Wan Animate takes one reference image (extra refs ignored). The click point is applied at frame 0; a click at a later time `t` is not tracked back. Re-check the 16:9 → 832×464 aspect drift once it runs on a GPU.

## Talking Video (Lip Sync on InfiniteTalk · Comfy Cloud, 2026-10-27)

No new graph: `cloud/wan21-infinitetalk-api.json` runs once per part. With `split=1`, speech up to 5 minutes is cut at pauses (ffmpeg `silencedetect`, −35 dB, ≥ 0.25 s) into parts of at most 55 s near an even split (`server/src/shared/talkingVideo.ts`); every part is its own Comfy Cloud job with the same photo, prompt and seed and renders 0.24 s into the next part; the parts are joined with a 6-frame video crossfade over the original full speech (`talkJoinArgs`, post `talkJoin`). A script is voiced first by the voice tool (Voiceover), in the app's Lip Sync bar.

Later (not wired): two speakers on the InfiniteTalk multi patch (`wan2.1_infiniteTalk_multi_fp16`, on Comfy Cloud; needs masks per speaker), LongCat-Video-Avatar 1.5 (needs your own Comfy deployment, see `docs/COMFY-CLOUD-SETUP.md`), and the official Wan 2.2 S2V and HuMo templates (`video_wan2_2_14B_s2v`, `video_humo`: every node and file is on shared Comfy Cloud, so each is a build plus one measured run away).

## LTX-2.5 DFR (2026-10-29)

`templates/video_ltx2_5_dfr_i2v.json` is Comfy's official template, bundled unchanged (Comfy-Org/workflow_templates commit `0cf483d1dcb548b8b8d3f38ddf0ff41c89896cdb`, MIT: `templates/LICENSE-workflow_templates`). `scripts/build-ltx25-dfr.py` converts it with `scripts/ui2api.py` into `ltx25-dfr-i2v-api.json` (local) and `cloud/ltx25-dfr-i2v-api.json` (Comfy Cloud, the same file). The template file itself is never edited. At run time `server/src/comfy/ltx25Dfr.ts` only fills inputs: start frame, prompt, size, seconds, seed, and whether stage 3 (48 fps) runs. Model files: the template's own (see the README table).

