# object-swap-wan-animate-api.json: sources and status

Object/character swap with **Wan 2.2 Animate 14B, Mix mode** (replace what is under the click point with the reference image; background, motion and lighting kept). ComfyUI API format. Built by `python3 scripts/build-object-swap-wan-animate.py` (hand-authored node list, checked offline against `/object_info`).

Written 2026-10-17. Nothing was installed, downloaded or run on a GPU.

## Files

| File | What |
|---|---|
| `workflows/object-swap-wan-animate-api.json` | Base segment + 1 extend (77 + 72 frames at 16 fps, about 9.3 s) |
| `workflows/object-swap-wan-animate/ext-0..6.json` | 0 to 6 extends: 4.8 / 9.3 / 13.8 / 18.3 / 22.8 / 27.3 / 31.8 s |
| `workflows/object-swap-wan-animate/mask-ext-0..6.json` | Same lengths, but the mask comes from a user mask video (`oj_mask_video`) instead of SAM2 |
| `workflows/node-maps/object-swap-wan-animate.json` | Placeholder map |
| `scripts/build-object-swap-wan-animate.py` | Generator plus offline schema check |

## Official sources (node classes, inputs, values)

- **ComfyUI core `WanAnimateToVideo` / `TrimVideoLatent` schema**: https://github.com/comfyanonymous/ComfyUI/blob/master/comfy_extras/nodes_wan.py (class `WanAnimateToVideo`). The inputs used are positive, negative, vae, width, height, length, batch_size, clip_vision_output, reference_image, face_video, pose_video, continue_motion_max_frames, background_video, character_mask, continue_motion and video_frame_offset. The outputs are positive, negative, latent, trim_latent, trim_image and video_frame_offset. Read 2026-10-17. The same schema is served by the local validator (ComfyUI 0.41.0, `comfy_extras.nodes_wan`).
- **Official Comfy-Org template `video_wan2_2_14B_animate`**: https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/templates/video_wan2_2_14B_animate.json. The local copy is `workflows/video_wan2_2_14B_animate-ui.json`; the templates commit is in `workflows/templates/SOURCE_COMMIT` (04a508b31bec1818e48122ca0761c1de4140a234). Taken from it: every node id, the sampler settings (6 steps, CFG 1, euler / simple, ModelSamplingSD3 shift 8), the LoRA stack (lightx2v 4-step 1.0, relight 1.0), the 77-frame segments, continue_motion_max_frames 5, the 16 fps, the DWPose face and body settings, SAM2 (`sam2_hiera_base_plus`, video segmentor), GrowMask 10, BlockifyMask 32, DrawMaskOnImage `0, 0, 0`, and the negative prompt verbatim.
- **Docs, Wan2.2 Animate native workflow**: https://docs.comfy.org/tutorials/video/wan/wan2-2-animate. Covers Mix vs Move, the model list and folders, the required custom nodes (KJNodes, comfyui_controlnet_aux), "width or height should be multiples of 16", and chaining extends via `video_frame_offset` and `batch_images`.
- **Blog: WAN2.2 Animate native support** (ComfyUI 0.3.60+): https://blog.comfy.org/p/wan22-animate-and-qwen-image-edit-2509. Its comments confirm the template's extend-subgraph bug (width wired into height), which is fixed here, and the relight LoRA location.
- **Hub use-case**: https://comfy.org/workflows/use-cases/ai-character-replacement/ and the template page https://comfy.org/workflows/video_wan2_2_14B_animate-c2c4b45b7df5/.

## Custom nodes (the official template's own; not core)

| Node | Pack |
|---|---|
| `PointsEditor`, `BlockifyMask`, `DrawMaskOnImage` | ComfyUI-KJNodes |
| `DWPreprocessor`, `PixelPerfectResolution` | comfyui_controlnet_aux |
| `DownloadAndLoadSAM2Model`, `Sam2Segmentation` | ComfyUI-segment-anything-2 (used by the template; the docs page lists only the first two packs) |

The mask variants drop the SAM2 nodes but keep `PointsEditor` 229 as an inert node, so `patchGraph` works unchanged. They still need KJNodes. Everything else is ComfyUI core: UNETLoader, LoraLoaderModelOnly, ModelSamplingSD3, CLIPLoader, VAELoader, CLIPVisionLoader, CLIPVisionEncode, CLIPTextEncode, LoadImage, LoadVideo, GetVideoComponents, ImageScale, GrowMask, ImageToMask, WanAnimateToVideo, KSampler, TrimVideoLatent, VAEDecode, ImageFromBatch, ImageBatch, CreateVideo, SaveVideo and PrimitiveInt.

## Placeholders (same ids as `server/src/comfy/objectSwap.ts`)

| Input | Node.field |
|---|---|
| reference image | `10.image` (LoadImage); refs 2–4 are batched by `patchGraph` (`oj_ref*`) |
| source video (16 fps, width × height, no audio) | `145.file` (LoadVideo) |
| prompt | `21.text`; negative `1.text` |
| resolution | `159.value` / `160.value` (multiples of 16) and `229.width` / `229.height` |
| point (who/what to replace) | `229.coordinates` + `229.points_store` (pixels); negative `229.neg_coordinates` |
| seed | `232:63.seed`, `extN:91.seed` (= seed + N) |
| length | variant file (`ext-N`); 16 fps |
| mask (optional) | `oj_mask_video.file` in `mask-ext-N.json` (white = replace, red channel, same fps/size as the 16 fps source) |
| output | `277` SaveVideo (video only) |

Checked: `patchGraph(...)` from `server/src/comfy/objectSwap.ts` (imported read-only via tsx) patched the main file, `ext-1` and `mask-ext-1` without errors (1280×720, a point, seed 42 → 42/43, plus 1 extra ref), and the patched graphs were ACCEPTED by the validator.

## Differences from `object-swap-api.json` (the earlier template conversion)

- `CreateVideo` has no audio input. The server feeds a 16 fps source converted with `-an`, then remuxes the original soundtrack with ffmpeg, so wiring `GetVideoComponents.audio` would only pass an empty or absent track.
- The upload placeholders default to `oj_ref.png` / `oj_source.mp4`, the titles mark every placeholder, and the extend seed defaults are base + N.
- New `mask-ext-N` variants for a user-supplied mask.
- Same node ids, models and values otherwise.

## Wiring changes needed in the tool (not done: `server/src` is read-only here)

1. **Use these files.** In `server/src/comfy/objectSwap.ts` `pickVariant`, change the directory from `object-swap` to `object-swap-wan-animate`, or make it switchable by env. Also set `workflowFile` in `server/src/config.ts` to `object-swap-wan-animate-api.json`.
2. **Optional mask.** The tool has no mask input today (`tools/videoSwap.ts` inputs are `target`, `point`). Add a mask-video field, then in `prepareObjectSwap` pick `mask-ext-N.json`, convert the mask with the same ffmpeg filter as the source (`fps=16,scale=W:H`), and set `g['oj_mask_video'].inputs.file`.
   - Don't name the field `mask…`: `uploadTypeOk` in `index.ts` treats `mask*` fields as images. Use e.g. `matte`, or extend that check.
3. **`point.t` is ignored.** The SAM2 point applies to the first frame of the processed clip. A click on a later frame needs the clip trimmed, or a SAM2 point-per-frame setup.
4. **Optional.** Trim the last segment's `length` (4n+1) to the remaining frames to save compute; today the output is cut by ffmpeg to the variant length.

## Models (`readiness/manifest/models.json`; this workflow added to each entry's `workflows` and to the `workflows` index)

Sizes and sha256 come from Hugging Face LFS headers (`x-linked-size` / `x-linked-etag`) and were re-checked with HEAD requests on 2026-10-17; all match the manifest. No file was downloaded, so the hashes are HF's, not re-computed locally.

| Folder | File | Size | Source |
|---|---|---|---|
| diffusion_models | Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ.safetensors | 18.40 GB | https://huggingface.co/Kijai/WanVideo_comfy_fp8_scaled/resolve/main/Wan22Animate/Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ.safetensors (linked by the template and docs) |
| loras | lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors | 0.74 GB | https://huggingface.co/Kijai/WanVideo_comfy/resolve/main/Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors |
| loras | WanAnimate_relight_lora_fp16.safetensors | 1.44 GB | https://huggingface.co/Kijai/WanVideo_comfy/resolve/main/LoRAs/Wan22_relight/WanAnimate_relight_lora_fp16.safetensors (in the template; not in the docs' model list) |
| text_encoders | umt5_xxl_fp8_e4m3fn_scaled.safetensors | 6.74 GB | https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors |
| vae | wan_2.1_vae.safetensors | 0.25 GB | https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors (the template links the same file in Comfy-Org/Wan_2.2_ComfyUI_Repackaged) |
| clip_vision | clip_vision_h.safetensors | 1.26 GB | https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/clip_vision/clip_vision_h.safetensors |
| sam2 | sam2_hiera_base_plus.safetensors | 0.32 GB | https://huggingface.co/Kijai/sam2-safetensors/resolve/main/sam2_hiera_base_plus.safetensors (auto-downloaded by the SAM2 node) |
| controlnet_aux ckpts | yolox_l.onnx | 0.22 GB | https://huggingface.co/yzd-v/DWPose/resolve/main/yolox_l.onnx (auto-downloaded by DWPose) |
| controlnet_aux ckpts | dw-ll_ucoco_384_bs5.torchscript.pt | 0.14 GB | https://huggingface.co/hr16/DWPose-TorchScript-BatchSize5/resolve/main/dw-ll_ucoco_384_bs5.torchscript.pt (auto-downloaded by DWPose) |

Total about 29.5 GB. The manifest estimates about 25 GB VRAM, fits 32 GB, and is red on MPS (fp8).

**Alternative diffusion model (not wired; not in the manifest because no workflow references it):** `wan2.2_animate_14B_bf16.safetensors`, https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_animate_14B_bf16.safetensors. HEAD 2026-10-17 gave 34,549,787,368 bytes and sha256 `7d37cb0120488dec2a061135aa3018426925318a60838c3de935c829abc88667`. To use it, swap `20.unet_name`.

## Validation

- **Offline schema check** (`scripts/build-object-swap-wan-animate.py`, against `/object_info` from the validator on :8190, ComfyUI 0.41.0):
  - Covers class names, required/unknown inputs, combo values, INT/FLOAT ranges, link targets, output types, and a single output node (277).
  - All 15 files: 0 errors. One note: `oj_mask.mp4` is not on the validator's upload list, as expected.
  - Negative-tested: the check caught a misspelt input, a wrong link type and a bad combo value.
- **`scripts/validate-workflows.py`** (POST /prompt to :8190, then interrupt and clear): all 15 files plus the three `patchGraph`-patched copies were ACCEPTED, and the queue was empty afterwards.
  - The validator's model files are zero-byte placeholders that were already present, so this proves the graph wiring and file names, not the weights.

## Still unverified

- No GPU run: output quality, VRAM and timing are unknown.
- How well **non-human objects** swap (products, props) is untested. Wan Animate is trained for characters, and DWPose finds no pose on an object, so the pose and face inputs are near-empty there. The tool description already mentions an LTX In/Outpaint fallback for objects.
- Extend chaining (continue_motion from the accumulated batch, `video_frame_offset` from the previous segment) follows the docs; seams have not been checked on real output.
- Multi-reference batching into `reference_image` (refs 2–4, `patchGraph`) goes beyond the model's single-reference training.
- `ImageBatch` is marked DEPRECATED in core 0.41.0 (replacement `BatchImagesNode`, autogrow input). It still validates; kept because the template uses it.
- Sizes and hashes are HF LFS metadata only; nothing was downloaded or hash-checked locally.
- Newer option, not used: **Wan Animate 2** (`WanAnimate2ToVideo`, https://blog.comfy.org/p/wan-animate-2-is-now-available-in) would need its own graph and models.
