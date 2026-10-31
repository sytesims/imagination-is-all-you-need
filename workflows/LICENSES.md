# Model, LoRA and custom-node licences

Checked on 2026-10-16 against the Hugging Face API licence tags and the upstream model cards and LICENSE files.
✅ = permissive (Apache-2.0 / MIT / BSD). ⚠️ = **not permissive, read the licence before any commercial use.** ❌ = dropped.

## Models and LoRAs

| Tool / graph | File | Upstream source | Licence |
|---|---|---|---|
| Object Swap, Motion Transfer | wan2.2_animate_14B (fp8 scaled) | https://huggingface.co/Wan-AI/Wan2.2-Animate-14B · repack https://huggingface.co/Kijai/WanVideo_comfy_fp8_scaled | ✅ Apache-2.0 |
| Object Swap, Motion Transfer | lightx2v I2V 480p step-distill LoRA | https://huggingface.co/lightx2v/Wan2.1-I2V-14B-480P-StepDistill-CfgDistill-Lightx2v (file via https://huggingface.co/Kijai/WanVideo_comfy) | ✅ Apache-2.0 |
| Object Swap | WanAnimate_relight_lora_fp16 | https://huggingface.co/Kijai/WanVideo_comfy (derived from Wan2.2-Animate) | ✅ Apache-2.0 |
| Object Swap | sam2_hiera_base_plus | https://huggingface.co/facebook/sam2-hiera-base-plus · https://huggingface.co/Kijai/sam2-safetensors | ✅ Apache-2.0 |
| Object Swap mask preview | SAM 3.1 (sam3.1_multiplex_fp16) | https://github.com/facebookresearch/sam3 (licence https://github.com/facebookresearch/sam3/blob/main/LICENSE) | ⚠️ SAM License: royalty-free incl. commercial use; include the licence text when redistributing; trade-control (ITAR/export) and military-use limits. SAM2 above is still used by the Object Swap graphs (Apache-2.0) |
| Wan graphs | umt5_xxl_fp8_e4m3fn_scaled, wan_2.1_vae, clip_vision_h | https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged (clip_vision_h = OpenCLIP ViT-H/14, https://huggingface.co/laion/CLIP-ViT-H-14-laion2B-s32B-b79K, MIT) | ✅ Apache-2.0 / MIT |
| Motion Transfer | DWPose (yolox_l.onnx, dw-ll_ucoco_384) | https://huggingface.co/yzd-v/DWPose | ✅ Apache-2.0 |
| Restyle | wan2.1_vace_14B | https://huggingface.co/Wan-AI/Wan2.1-VACE-14B (repack Comfy-Org/Wan_2.1_ComfyUI_repackaged) | ✅ Apache-2.0 |
| Restyle | wan2.1_t2v_14b_lora_rank64_lightx2v_4step | https://huggingface.co/lightx2v/Wan2.1-Distill-Loras | ✅ Apache-2.0 |
| ~~Restyle~~ | ~~Wan21_CausVid_14B_T2V_lora~~ | https://huggingface.co/tianweiy/CausVid | ❌ **CC BY-NC 4.0 (non-commercial), dropped** |
| Camera Moves, Re-shoot fallback | wan2.2_fun_camera_high/low_noise_14B | https://huggingface.co/alibaba-pai/Wan2.2-Fun-A14B-Control-Camera · repack https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged | ✅ Apache-2.0 |
| Generate Video (local, Wan 2.2 5B) | wan2.2_ti2v_5B_fp16, wan2.2_vae, umt5_xxl_fp16 | https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B · repacks https://huggingface.co/Comfy-Org/Wan-2.2 and https://huggingface.co/Comfy-Org/Wan-2.1 (umt5-xxl: https://huggingface.co/google/umt5-xxl) | ✅ Apache-2.0 |
| Photo FX, Camera, Re-shoot fallback | wan2.2_i2v_high/low_noise_14B + 4-step lightx2v LoRAs | https://huggingface.co/Wan-AI/Wan2.2-I2V-A14B · https://huggingface.co/lightx2v/Wan2.2-Lightning | ✅ Apache-2.0 |
| Upscale (Precise, 60 fps) | seedvr2_ema_3b_fp8_e4m3fn | https://huggingface.co/ByteDance-Seed/SeedVR2-3B · https://huggingface.co/numz/SeedVR2_comfyUI | ✅ Apache-2.0 |
| Upscale (Creative) | seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16 | https://huggingface.co/ByteDance-Seed/SeedVR2-7B · https://huggingface.co/numz/SeedVR2_comfyUI | ✅ Apache-2.0 |
| Upscale (60 fps) | rife49.pth (RIFE) | https://github.com/hzwer/Practical-RIFE · https://github.com/hzwer/ECCV2022-RIFE | ✅ MIT |
| Re-shoot (default), Camera "LTX camera" presets | ltx-2-19b-dev-fp8, ltx-2-19b-distilled-lora, ltx-2-spatial-upscaler | https://huggingface.co/Lightricks/LTX-2 · https://huggingface.co/Comfy-Org/ltx-2 | ⚠️ **LTX-2 Community License**: free only for entities with < $10M annual revenue, otherwise a paid commercial licence is required; use restrictions in Attachment A |
| Re-shoot (default) | ltx-2-19b-ic-lora-pose-control | https://huggingface.co/Lightricks/LTX-2-19b-IC-LoRA-Pose-Control | ⚠️ LTX-2 Community License |
| Re-shoot, Camera (LTX) | ltx-2-19b-lora-camera-control-{dolly-in,dolly-out,dolly-left,dolly-right,jib-up,jib-down,static} | https://huggingface.co/Lightricks (LTX-2-19b-LoRA-Camera-Control-*) | ⚠️ LTX-2 Community License |
| Re-shoot, Camera (LTX) | gemma_3_12B_it (text encoder) | https://huggingface.co/google/gemma-3-12b-it (repack Comfy-Org/ltx-2) | ⚠️ **Gemma Terms of Use** (custom licence plus prohibited-use policy) |
| Swap Two People · Comfy Cloud (`cloud/h3-two-person-swap-api.json`, our own two-pass graph) | minimax_h3_ref2va_pruned_int8_convrot, qwen3vl_32b_minimax_h3_nvfp4_awq, minimax_h3_video_vae_fp16, minimax_h3_audio_vae_fp32 | https://huggingface.co/Comfy-Org/MiniMax-H3 | ⚠️ MiniMax H3 Community License (https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE) |
| Swap Two People · Comfy Cloud | minimax_h3_fl2v_turbo_8step_v1.0 (shared build; the 768p build when imported) | https://huggingface.co/lightx2v/Minimax-h3-Turbo | ⚠️ MiniMax H3 Community License (base model terms) |
| Swap Two People · Comfy Cloud | h3_character_swap_v1.5 (imported into your Comfy Cloud library) | https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA | ⚠️ MiniMax H3 Community License, adapter keeps the base terms (https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA/blob/main/LICENSE); credit Akatz Labs (NOTICE) |
| Swap Two People · Comfy Cloud | SAM 3.1 (sam3.1_multiplex_fp16), person masks | https://github.com/facebookresearch/sam3 | ⚠️ SAM License (https://github.com/facebookresearch/sam3/blob/main/LICENSE) |
| Re-shoot: New angle · H3 CrossView (your Comfy deployment, `deploy/h3-crossview-api.json`) | minimax_h3_ref2va_pruned_int8_convrot, qwen3vl_32b_minimax_h3_int8_convrot, minimax_h3_video_vae_int8_convrot, minimax_h3_audio_vae_fp32 | https://huggingface.co/Comfy-Org/MiniMax-H3 | ⚠️ MiniMax H3 Community License (https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE) |
| Re-shoot: New angle · H3 CrossView | MiniMax-H3_Ref2VA-LoRA-CrossView-Warp_v1_3500 (Cseti) | https://huggingface.co/Cseti/MiniMax-H3_Ref2VA-LoRA-CrossView-Warp_v1 | ⚠️ MiniMax H3 Community License |
| Re-shoot: New angle · H3 CrossView | minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16 (lightx2v) | https://huggingface.co/lightx2v/Minimax-h3-Turbo | ⚠️ no licence tag on the model card; the repository licence applies |
| Re-shoot: New angle · H3 CrossView | moge_2_vitl_normal_fp16 (MoGe-2 ViT-L) | https://huggingface.co/Comfy-Org/MoGe | ✅ MIT |
| (not used) | Cseti Cameraman IC-LoRA | third-party Hugging Face repo, no licence tag | ⚠️ no licence; does camera-motion transfer rather than re-angling, so skipped |
| (not used) | ReCamMaster-Wan2.1 | https://huggingface.co/KlingTeam/ReCamMaster-Wan2.1 | ✅ Apache-2.0; no official Comfy template, so not wired up |

**Open-weights-only mode:** with `OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY=1`, hosted (partner/API) providers and hosted model APIs are removed. Every open-weight model stays available whatever its licence (including MiniMax H3 and LTX-2), locally or as a Comfy Cloud open-weight workflow graph (`cloud-h3-wf`). `cloud-h3` runs H3 through API nodes, so it is hosted and hidden in this mode. The same metadata is exposed in `/api/tools` (`providers[].license`, `workflowVariants[].license`, `presets[].license`). Source of truth: `server/src/licenses.ts`.

**LTX note:** Re-shoot defaults to the LTX engine because it validates. To use only permissive weights, set `OPENHIGGSFIELD_RESHOOT_ENGINE=funcamera` or pick the `comfy-funcamera` provider, which uses `reshoot-funcamera-api.json`. You can also simply not use the "LTX camera" presets.

## Custom nodes and code

| Node pack | Source | Licence |
|---|---|---|
| ComfyUI core and workflow_templates | https://github.com/comfyanonymous/ComfyUI · https://github.com/Comfy-Org/workflow_templates | ⚠️ GPL-3.0 (core; a separate service, we only talk to it over HTTP) · templates: see templates/LICENSE-workflow_templates |
| ComfyUI-KJNodes | https://github.com/kijai/ComfyUI-KJNodes | ⚠️ GPL-3.0 (copyleft; it runs inside ComfyUI, not inside our code) |
| ComfyUI-CrossViewWarp (comfyrob fork @ fbb1e93 of cseti007/ComfyUI-CrossViewWarp), H3 CrossView on your Comfy deployment; installed in your Build, never copied here | https://github.com/comfyrob/ComfyUI-CrossViewWarp | ✅ Apache-2.0 |
| Comfy-Org/comfy-reshoot (the Reshoot recipe graph that `deploy/h3-crossview-api.json` is adapted from) | https://github.com/Comfy-Org/comfy-reshoot | ✅ MIT |
| Comfy-Org/comfy-openjutsu (Comfy's Openjutsu app; the H3 Character Swap recipe settings that `cloud/h3-charswap-api.json` and `object-swap-h3-charswap-api.json` follow) | https://github.com/Comfy-Org/comfy-openjutsu | ✅ MIT (licenses/comfy-openjutsu-LICENSE-MIT.md) |
| akatz-labs/h3-character-swap-tool (Akatz Labs' H3 Character Swap workflow, the recipe Openjutsu builds on) | https://github.com/akatz-labs/h3-character-swap-tool | ✅ MIT (licenses/akatz-h3-character-swap-tool-LICENSE-MIT.md) |
| ComfyUI-segment-anything-2 | https://github.com/kijai/ComfyUI-segment-anything-2 | ✅ Apache-2.0 |
| comfyui_controlnet_aux (DWPose, Canny) | https://github.com/Fannovel16/comfyui_controlnet_aux | ✅ Apache-2.0 |
| ComfyUI-SeedVR2_VideoUpscaler | https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler | ✅ Apache-2.0 |
| ComfyUI-Frame-Interpolation (RIFE VFI) | https://github.com/Fannovel16/ComfyUI-Frame-Interpolation | ✅ MIT |

No InsightFace anywhere.

## Our own assets

`server/samples/styles/*.png` holds 23 Restyle swatches. ⚠️ They are **procedural** (numpy + Pillow, `server/scripts/make-style-swatches.py`), not model-generated, because there's no GPU or image model on the box. Copyright is ours. `server/samples/*.mp4` were made procedurally with ffmpeg (`make-samples.sh`).

## Plugins

Each plugin lists its own licences in `plugin.json` (`license`, `components[]`). They are exposed in `/api/tools` and checked at load time (see docs/PLUGINS.md).

| Plugin | Component | Source | Licence |
|---|---|---|---|
| cutout | BiRefNet model weights | https://huggingface.co/ZhengPeng7/BiRefNet · https://github.com/ZhengPeng7/BiRefNet | ✅ MIT |
| cutout | ComfyUI_BiRefNet_ll node pack (tested at commit 5443a2a) | https://github.com/lldacing/ComfyUI_BiRefNet_ll | ✅ MIT. GitHub shows NOASSERTION, but the LICENSE file is the MIT text plus a note that BiRefNet is MIT. |
| cutout | timm (node-pack dependency) | https://github.com/huggingface/pytorch-image-models | ✅ Apache-2.0 |

Not used: BRIA RMBG (non-commercial licence). Also not used: ComfyUI-RMBG and ComfyUI-BiRefNet-Hugo, both GPL-3.0; a permissive option was available.

## Model additions (verified upstream 2026-10-16)

Whoever runs Imagination Is All You Need downloads model weights themselves. **We don't redistribute any weights.** Every model is selectable in the UI; each option shows a single "License" link. `OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY=1` is the only setting that filters (it hides hosted providers; Comfy Cloud open-weight workflows stay). Defaults never change with a licence setting (`OPENHIGGSFIELD_COMMERCIAL` has no effect).

| Provider id | Model | Licence | Source | Notes |
|---|---|---|---|---|
| comfy-qwen21 | Qwen Image 2.1 (T2I + edit) | Qwen Research License, **non-commercial** | https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE | Default for Create Image (in every mode) |
| comfy-qwen21-turbo | Qwen Image 2.1 Turbo (T2I + one-image edit, 8 steps) | Qwen Research License, **non-commercial** | https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE | templates image_qwen_image_2_1_turbo_t2i / image_qwen_image_2_1_turbo_image_edit; file qwen_image_2.1_turbo_int8_convrot (Comfy-Org/Qwen-Image-2.1) |
| comfy-qwen-image | Qwen-Image / Qwen-Image-Edit-2509 | Apache-2.0 | https://huggingface.co/Qwen/Qwen-Image · https://huggingface.co/Qwen/Qwen-Image-Edit-2509 | Selectable alternative (second in the Create Image order) |
| comfy-zimage-turbo | Z-Image-Turbo | Apache-2.0 | https://huggingface.co/Tongyi-MAI/Z-Image-Turbo | template image_z_image_turbo |
| comfy-zimage | Z-Image (base) | Apache-2.0 | https://huggingface.co/Tongyi-MAI/Z-Image | template image_z_image |
| comfy-moss-image | MOSS-Image SFT (OpenMOSS, 5B) | Apache-2.0 | https://huggingface.co/OpenMOSS-Team/MOSS-Image-SFT · repack https://huggingface.co/Comfy-Org/MOSS-Image | template image_moss_image_t2i; ComfyUI 0.41.3+ (CLIPLoader type moss_image); text encoder qwen3.5_9b_w4a8_gptq, VAE flux2-vae_small. Not on Comfy Cloud yet |
| comfy-moss-image-base | MOSS-Image Base (OpenMOSS, 5B) | Apache-2.0 | https://huggingface.co/OpenMOSS-Team/MOSS-Image-Base | template image_moss_image_base_t2i (SLG layer 22); ComfyUI 0.41.3+ |
| comfy-klein4b | FLUX.2 [klein] 4B (+ 4B base, edit) | Apache-2.0 | https://huggingface.co/black-forest-labs/FLUX.2-klein-4B | The 9B klein models are non-commercial and are not used |
| comfy-flux2dev | FLUX.2 [dev] 32B | FLUX [dev] Non-Commercial License v2.0 | https://raw.githubusercontent.com/black-forest-labs/flux2/main/model_licenses/LICENSE-FLUX-DEV | Weights: non-commercial use only. Outputs may be used commercially, but not to train a competing model. HF repo is gated |
| comfy-h3 (UI label "MiniMax H3") | MiniMax H3 (T2V/I2V/R2V, 768p, about 15 s at 24 fps, joint audio) | MiniMax H3 Community License (non-OSI) | https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE | Free, including commercial use, at ≤ $20M/yr revenue; above that you need written authorization (§IV.1). **Not licensed in the US, EU, UK or South Korea** (those need a separate licence from MiniMax, §II). Commercial UIs must prominently display “MiniMax H3” (§IV.2). Outputs **must not be used to improve other AI models** (§V.3). Any service that lets third parties generate outputs must keep safeguards and a report channel (§V.5). Redistributing the weights needs a copy of the Agreement and a NOTICE file (§III.1, §III.4). Licence re-checked 2026-10-17. Comfy-Org repacks: BF16 / INT8 / FP8-scaled / W6A8 (NVFP4 exists only for the Qwen3-VL-32B text encoder). Multiframe Reference needs ComfyUI ≥ 0.34. We don't state an audio sample rate (unverified) |
| comfy-wan22-5b (UI label "Wan 2.2 5B") | Wan 2.2 TI2V 5B (text + image to video, 704p / 480p, 2–5 s at 24 fps, no audio) | Apache-2.0 | https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B | Local only, free. Graph `wan22-ti2v-5b-api.json` from the official Comfy template `video_wan2_2_5B_ti2v` (Comfy-Org/workflow_templates, MIT; tutorial https://docs.comfy.org/tutorials/video/wan/wan2_2). fp16 files on purpose (umt5_xxl_fp16 instead of the template's fp8 encoder): Apple MPS has no float8. Suggested local video model on Apple Silicon. Added 2026-10-24 |
| comfy-ltx25-layout (UI "Render" in Direct a Shot, LTX-2.5 + Layout to Render) | LTX-2.5 22B distilled (GGUF Q4_K_M by Unsloth, unsloth/LTX-2.5-GGUF), Gemma 4 12B text encoder with LTX projection (bf16), LTX-2.5 video + audio VAEs, x2 latent upscaler, Layout to Render IC-LoRA 1.0 (Lightricks) | LTX-2.x Community License | https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x · https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render · https://huggingface.co/unsloth/LTX-2.5-GGUF | Local only, free. The LoRA repo is gated (accept on Hugging Face). Needs the ComfyUI-GGUF custom nodes (city96, Apache-2.0, https://github.com/city96/ComfyUI-GGUF). Graph `ltx25-layout-to-render-api.json` (ours, from the official Comfy LTX templates). The first frame can be painted locally with FLUX.2 [klein] 4B (Apache-2.0). Added 2026-10-24 |
| comfy-ltx25-video (UI "LTX-2.5 22B", Generate Video local) | LTX-2.5 22B distilled (GGUF Q4_K_M by Unsloth, unsloth/LTX-2.5-GGUF), Gemma 4 12B text encoder with LTX projection (bf16), LTX-2.5 video + audio VAEs, x2 latent upscaler | LTX-2.x Community License | https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x · https://huggingface.co/Lightricks/LTX-2.5 · https://huggingface.co/unsloth/LTX-2.5-GGUF | Local only, free; the same files as Direct a Shot’s Render step minus the LoRA. Needs the ComfyUI-GGUF custom nodes (city96, Apache-2.0, https://github.com/city96/ComfyUI-GGUF). Graphs `ltx25-ti2v-api.json` / `ltx25-flf-api.json` from the official Comfy templates `video_ltx2_5_i2v` / `video_ltx2_5_flf2v` (Comfy-Org/workflow_templates, MIT; tutorial https://docs.comfy.org/tutorials/video/ltx/ltx-2-5). Text, image and first + last frame to video with LTX's own sound; Loop (start frame at both ends, core nodes only) added 2026-10-26; Transitions (Morph, the same `ltx25-flf-api.json` from `video_ltx2_5_flf2v`) added 2026-10-26. Added 2026-10-25 |
| comfy-ltx25-lipsync (UI "LTX-2.5 Talking Photo", Voice → Talking photo / Lip Sync local) | Same files as comfy-ltx25-video (LTX-2.5 22B distilled GGUF Q4_K_M by Unsloth, Gemma 4 12B text encoder with LTX projection, LTX-2.5 video + audio VAEs, x2 latent upscaler) | LTX-2.x Community License | https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x · https://github.com/Lightricks/ComfyUI-LTXVideo (A2V example) · https://github.com/sducly/quokkai-lab-ltx25-lipsync-fix (MIT, lip driver recipe) | Local only, free; no extra download. Needs the ComfyUI-GGUF custom nodes (city96, Apache-2.0). |
| cloud-h3 | MiniMax H3 · Comfy Cloud | same licence; mock placeholder | https://docs.comfy.org/tutorials/video/minimax/minimax-h3 | No calls are made |
| comfy-acestep | ACE-Step 1.5 | MIT | https://huggingface.co/ACE-Step/Ace-Step1.5 | |
| comfy-yue2 | YuE2-3B (int8 repack) + SheetSage2 (Cover a song) | **CC BY-NC 4.0** (m-a-p/YuE2-3B, m-a-p/SheetSage2 and the Comfy-Org/YuE2 repack, checked 2026-10-23) | https://huggingface.co/m-a-p/YuE2-3B · repack https://huggingface.co/Comfy-Org/YuE2 | ⚠ The first YuE release was Apache-2.0; YuE2 is non-commercial. Templates audio_yue2_text2music / audio_yue2_music_cover; core nodes (ComfyUI 0.36+). SheetSage2 builds on m-a-p/MERT-v2-FullSong (check its card too) |
| comfy-minimax-music3 | MiniMax Music 3 (open weights: DiT fp16, text encoder int8, DAV VAE) | MiniMax-Music3 Community License (non-OSI) | https://huggingface.co/MiniMaxAI/MiniMax-Music3/blob/main/LICENSE · repack https://huggingface.co/Comfy-Org/MiniMax-Music-3 | Commercial use allowed; commercial UIs credit MiniMax-Music3; above US$20M/yr revenue needs written permission; acceptable use policy applies. The Comfy-Org repack card says apache-2.0, the upstream LICENSE governs. Template audio_minimax_music_3 (non-tiled decode) |
| comfy-stable-audio | Stable Audio Open 1.0 | Stability AI Community License (non-OSI; free under $1M/yr revenue) | https://huggingface.co/stabilityai/stable-audio-open-1.0/blob/main/LICENSE.md | |
| comfy-mmaudio | MMAudio (video-to-sound) | **Code MIT, weights CC BY-NC 4.0** | https://github.com/hkchengrex/MMAudio · https://huggingface.co/hkchengrex/MMAudio | ⚠ Kijai's safetensors repack (https://huggingface.co/Kijai/MMAudio_safetensors) is tagged MIT, but the upstream weights are CC BY-NC, so we treat them as NC. Node pack kijai/ComfyUI-MMAudio (MIT) is not on the validator, so no workflow is built yet (mock only) |
| comfy-chatterbox | Chatterbox TTS | MIT (weights and code) | https://huggingface.co/ResembleAI/chatterbox | ⚠ The node pack filliptm/ComfyUI_Fill-ChatterBox declares **no licence**. Not on the validator, mock only |
| comfy-f5tts | F5-TTS | Code MIT, **weights CC BY-NC 4.0** | https://huggingface.co/SWivid/F5-TTS | Node pack niknah/ComfyUI-F5-TTS (MIT). Not on the validator, mock only |
| comfy-qwen3tts | Qwen3 TTS 1.7B (Qwen3-TTS-12Hz-1.7B-CustomVoice: 9 preset voices, 10 languages, style instruction; Audio · Voiceover and Voice Studio · Voiceover) | Apache-2.0 (weights and code, Alibaba Qwen) | https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice · https://github.com/QwenLM/Qwen3-TTS | Node pack flybirdxx/ComfyUI-Qwen-TTS @374c2e0 (Apache-2.0), graph `voice-qwen3tts-api.json` (ours). Added 2026-10-27; replaces the paid direct-qwen3-tts entry |

### Hosted (Comfy partner nodes, mock only)
Included only if the node is listed at https://docs.comfy.org/_llms/en/built-in-nodes/nodes/partner.txt **and** appears in ComfyUI 0.41's object_info. Each option links to `https://docs.comfy.org/built-in-nodes/<Node>`. Audio options link to the vendor's terms.
- Image: Flux2ImageNode, OpenAIGPTImageNodeV2, GeminiNanoBanana2, ByteDanceSeedreamNodeV3, IdeogramV4, RecraftV4TextToImageNode, LumaImageNode2, KlingOmniProImageNode, Krea3ImageNode, ReveImageCreateNode, RunwayTextToImageNode, GrokImageNode, QwenImageTextToImageApi, WanTextToImageApi, HunyuanImageTextToImageApi, MetaMuseImageTextToImageApi.
- Video: MinimaxHailuo03Text/FirstLastFrame/ReferenceNode (MiniMax H3 partner API), plus the existing Kling / Veo / Seedance router mocks.
- Audio: ElevenLabsTextToSpeech, ElevenLabsTextToSoundEffects, FishAudioTextToSpeech, HeyGenTextToSpeechNode, SoniloTextToMusic, SoniloVideoToMusic, ByteDanceSeedAudio, ComfyCloudMiniMaxMusic3TextToAudioNode (Comfy Cloud).
- **Not added:** Stability Stable Audio (docs page https://docs.comfy.org/built-in-nodes/StabilityTextToAudio exists, but the node is absent from both the partner index and 0.41), MiniMax Speech (no node), Sora 2 and Qwen TTS (no node), and HiggsfieldMotionTransferNode (exists on the Router; left out to keep clean-room names).

### Hosted-direct (vendor API fallback, no Comfy node, mock only)
| Provider id | API | Key env var | Docs / terms |
|---|---|---|---|
| direct-minimax-speech | MiniMax Speech 2.8 HD, `POST https://api.minimax.io/v1/t2a_v2` (Bearer) | OPENHIGGSFIELD_MINIMAX_API_KEY | https://platform.minimax.io/docs/api-reference/speech-t2a-http · https://www.minimax.io/platform/protocol/terms-of-service |
| ~~direct-qwen3-tts~~ | Retired 2026-10-27: Qwen3 TTS runs from its open weights instead (comfy-qwen3tts above) | | |
| direct-flux2-flex | FLUX.2 [flex], BFL API | OPENHIGGSFIELD_BFL_API_KEY | https://docs.bfl.ai/ · https://bfl.ai/legal/terms-of-service (endpoint not wired yet) |

## Director, inpaint, Voice Studio, Apps (Oct 16)

| Piece | Used for | Licence | Source |
|---|---|---|---|
| `create-image-qwen-edit2509-inpaint-api.json` (built by `scripts/build-inpaint.py` from the Comfy-Org Qwen-Image-Edit-2509 template + core `ImageToMask`/`SetLatentNoiseMask`) | Create Image → Inpaint (mask) | Apache-2.0 (weights), MIT (template) | https://huggingface.co/Qwen/Qwen-Image-Edit-2509 |
| Director (`cinema`) | reuses `camera-ltx-api.json` (LTX-2 + camera LoRAs, default) and `reshoot-funcamera-api.json` (Wan 2.2 Fun Camera fallback) | LTX-2 Community License + Gemma Terms / Apache-2.0 | https://huggingface.co/Lightricks/LTX-2/blob/main/LICENSE |
| Whisper large-v3 | Voice Studio → Translate (transcribe) | MIT | https://github.com/openai/whisper/blob/main/LICENSE |
| NLLB-200 | Voice Studio → Translate (text translation) | CC BY-NC 4.0 (non-commercial) | https://huggingface.co/facebook/nllb-200-distilled-600M |
| SeamlessM4T v2 | Voice Studio → Translate (speech-to-speech option) | CC BY-NC 4.0 (non-commercial) | https://huggingface.co/facebook/seamless-m4t-v2-large |
| Chatterbox / Chatterbox VC | Voiceover, Change voice, Translate TTS | MIT (weights + code); ComfyUI node pack has no licence declared | https://huggingface.co/ResembleAI/chatterbox |
| F5-TTS | Voiceover / Translate TTS | code MIT, weights CC BY-NC 4.0 | https://huggingface.co/SWivid/F5-TTS |
| OpenVoice V2 | Change voice | MIT | https://github.com/myshell-ai/OpenVoice/blob/main/LICENSE |
| RVC WebUI | Change voice (bring your own voice model) | MIT (code); voice models user-supplied | https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI/blob/main/LICENSE |

Voice Studio change-voice/translate providers are **mock only**: their node packs aren't on the validator, so no API workflow is shipped yet. Prompt enhance is a local rules template; the optional LLM hook (`OPENHIGGSFIELD_ENHANCE_LLM_URL`, OpenAI-compatible, e.g. a local llama.cpp/Ollama) is off by default.

## Image Upscale (Oct 16, licences checked upstream)

| Model | Licence | Notes |
|---|---|---|
| Real-ESRGAN x2plus / x4plus (default) | BSD-3-Clause | https://github.com/xinntao/Real-ESRGAN/blob/master/LICENSE |
| 4x-UltraSharp | CC BY-NC-SA 4.0 (non-commercial) | https://huggingface.co/Kim2091/UltraSharp |
| GFPGAN (face enhance, default) | Apache-2.0; third-party parts listed in its LICENSE; face detection via facexlib (MIT), **no InsightFace** | https://github.com/TencentARC/GFPGAN/blob/master/LICENSE |
| CodeFormer (face enhance, optional) | S-Lab License 1.0, **non-commercial only** | https://github.com/sczhou/CodeFormer/blob/master/LICENSE |

Graphs use core nodes only (`UpscaleModelLoader`, `ImageUpscaleWithModel`, `ImageBlur` for denoise, `ImageSharpen`). The validator box has zero-byte placeholder `.pth` files for these. Face enhance needs a custom node pack, so it is mock only.

## Model additions (Oct 15 releases, verified 2026-10-16)

| Provider id | Model | Licence | Source | Notes |
|---|---|---|---|---|
| comfy-flux3-klein | FLUX 3 Image Klein (distilled, 5.6B image transformer; generate, edit, inpaint) | **FLUX Kommunity License v1.0** (non-OSI). Non-commercial use, plus commercial use of **outputs** only for "Qualifying Users" (you + affiliates under US$5M gross annual revenue). Requires content filtering or output review, and AI disclosure where law requires. Outputs may not be used to train a competing model | https://huggingface.co/black-forest-labs/flux-3-image-klein/blob/main/LICENSE.md · ComfyUI repack https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy | **Not** Apache (unlike FLUX.2 klein 4B), so it is **not** a default. HF repos are gated (accept the licence). Text encoder Qwen3-VL-4B and the prompt upsampler are Apache-2.0. Graphs: Comfy-Org templates `image_flux3_klein_distilled_t2i` / `_image_edit` (core nodes, ComfyUI 0.41) via `scripts/build-flux3-klein.py`; inpaint derived (VAEEncode + SetLatentNoiseMask) |
| comfy-drama3 | Fish Audio Drama 3 (TTS, voice cloning, inline control tags; Audio · Voice and Voice Studio · Voiceover) | **Fish Audio Community License v1.0** (non-OSI). Research and non-commercial use; commercial use only while you + affiliates are under **US$500k** annual revenue. **No licence to offer a Hosted Service** (a public TTS / voice-cloning API or site) at any revenue. No cloning of identifiable people without consent. Outputs may not train other speech models | https://huggingface.co/fishaudio/drama-3/blob/main/LICENSE | The HF card metadata says `fish-audio-research-license`; the LICENSE file itself is titled "Fish Audio Community License Agreement v1.0" (Oct 13, 2026), and we follow the file. Node pack PedroMarinhoDev/ComfyUI-Drama3 @66c4fb9 is **GPL-3.0** (Fish-derived parts: Fish licence; ASR parts: Apache-2.0). Weights are a repack, PedroMarinhoDev/Drama-3-ComfyUI (same Fish licence). ASR: PedroMarinhoDev/Qwen3-ASR-ComfyUI (Apache-2.0). Graphs via `scripts/build-drama3.py` |

## Talking Video (Lip Sync, 2026-10-27)

Lip Sync on InfiniteTalk (Wan 2.1) · Comfy Cloud now takes a script (the voice tool makes the voice first) and speech up to 5 minutes, run in parts of up to 55 s and joined with soft cuts. Same graph (`cloud/wan21-infinitetalk-api.json`), same files.

| Part | Source | Licence |
|---|---|---|
| InfiniteTalk single-speaker patch | https://github.com/MeiGen-AI/InfiniteTalk · https://huggingface.co/MeiGen-AI/InfiniteTalk | ✅ Apache-2.0 |
| Wan 2.1 I2V 14B 480p (Kijai fp8 repack) + lightx2v step-distill LoRA | https://huggingface.co/Wan-AI/Wan2.1-I2V-14B-480P | ✅ Apache-2.0 |
| wav2vec2 chinese base | https://huggingface.co/TencentGameMate/chinese-wav2vec2-base | ✅ MIT |
| Template `video_wan2_1_infinitetalk` | https://github.com/Comfy-Org/workflow_templates (commit 3c2199b936) | ✅ MIT |
| The voice from a script | the voice tool's own models (Chatterbox, Qwen3 TTS, F5-TTS, Fish Audio Drama 3, …), each listed above with its licence | as listed |

### LongCat-Video-Avatar 1.5 (off by default; needs your own Comfy deployment; no graph in the repo yet)

| Part | Source | Licence |
|---|---|---|
| LongCat-Video-Avatar 1.5 weights and code (Meituan) | https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5 · https://github.com/meituan-longcat/LongCat-Video | ✅ MIT |
| `LongCat-Avatar-15_bf16` (31.71 GB) and `LongCat-Avatar-15_dmd_distill_lora_rank128_bf16` (1.26 GB) repacks | https://huggingface.co/Kijai/WanVideo_comfy/tree/main/LongCat | ✅ MIT (follows upstream) |
| Whisper large-v3 | https://huggingface.co/openai/whisper-large-v3 | ✅ Apache-2.0 |
| ComfyUI-WanVideoWrapper @ 088128b224 or later (`LongCatAvatarWhisperEmbeds`, `WanVideoLongCatAvatarExtendEmbeds`) | https://github.com/kijai/ComfyUI-WanVideoWrapper | ✅ Apache-2.0 |
