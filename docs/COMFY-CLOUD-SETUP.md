# Comfy Cloud: what works with one key, and what needs a one-time import

One Comfy key (Settings → Connections) runs almost everything on Comfy Cloud. A few workflows use files that shared Comfy Cloud doesn't carry yet. Import each file into your Comfy Cloud library once, and the workflow runs from then on. The app checks for each file for free before anything is sent, and shows these steps if one is missing. Nothing is charged for a run that can't start.

Checked against Comfy Cloud's own model list (2026-10-27). Comfy Cloud adds files over time, so a "one-time import" may stop being needed.

## Ready with just the key

- MiniMax H3 (text and image to video, with sound), H3 Extend and H3 Keyframes (2–5 frames at chosen times, one shot)
- LTX-2.5 22B, LTX-2.5 Pro and LTX-2.5 Fast
- Footage Effects on Comfy Cloud: restore old footage, remove an object, remove subtitles, extend the frame (LTX-2.3 templates)
- InfiniteTalk (Wan 2.1), Lip Sync's Talking Video: a script or speech up to 5 minutes (over 60 s runs in parts)
- Prompt Edit: Bernini-R edits a clip from one sentence (official Comfy template, open weights)
- Every partner-node model: Nano Banana, GPT Image, Seedance, Kling, FLUX, Topaz, Tripo, Gemini Omni and the rest

## One-time import into your Comfy Cloud library

| Workflow | File to import | Source |
|---|---|---|
| H3 Character Swap, Swap Two People | The Character Swap LoRA, `h3_character_swap_v1.5.safetensors` | [akatz-ai/MiniMax-H3-Character-Swap-LoRA](https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA) |
| Layout to Render (Direct a Shot's film) | The Layout to Render IC-LoRA, `ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors` | [Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render](https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render) |
| MiniMax H3 Fast | The FastH3 checkpoint, `fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors` (type: Diffusion model) | [FastVideo/FastVideo-FastH3-Comfy](https://huggingface.co/FastVideo/FastVideo-FastH3-Comfy) |

How to import: open Comfy Cloud, go to your model library, choose Import from Hugging Face, paste the source link, pick the file named above and its type (LoRA or Diffusion model), and wait for it to finish. Then press Generate again in the app.

## Needs your own Comfy deployment

| Workflow | Why |
|---|---|
| New angle (H3 CrossView) | It uses custom nodes (CrossView) and model files that shared Comfy Cloud doesn't run. Build a Comfy deployment on platform.comfy.org with them, put its address in `.env.local` as `COMFY_DEPLOY_URL` and restart the app (see [Your Comfy deployment](CONFIGURATION.md#your-comfy-deployment)). The free Check in Settings → Connections → Your Comfy deployment lists missing nodes and files when the deployment shares its node list. |
| Talking video on LongCat-Video-Avatar 1.5 (off by default) | Shared Comfy Cloud has an older LongCat node set (v1.0) and no LongCat weights, and an import can't add the 1.5 audio node `LongCatAvatarWhisperEmbeds`. Build a deployment with ComfyUI-WanVideoWrapper at commit `088128b224` or later and the files below. The app's free check (`probeLongCatCloud`) needs both LongCat 1.5 nodes and `LongCat/LongCat-Avatar-15_bf16.safetensors` before it offers the model. The workflow itself comes once a deployment exists, so it can be checked against that deployment's own node list. |

LongCat-Video-Avatar 1.5 Build (all MIT or Apache-2.0): [LongCat-Avatar-15_bf16.safetensors](https://huggingface.co/Kijai/WanVideo_comfy/blob/main/LongCat/LongCat-Avatar-15_bf16.safetensors) (31.71 GB, diffusion_models/LongCat), [LongCat-Avatar-15_dmd_distill_lora_rank128_bf16.safetensors](https://huggingface.co/Kijai/WanVideo_comfy/blob/main/LongCat/LongCat-Avatar-15_dmd_distill_lora_rank128_bf16.safetensors) (1.26 GB, loras), `whisper_large_v3_fp16.safetensors` (already on Comfy Cloud), `Wan2_1_VAE_bf16.safetensors`, `umt5-xxl-enc-bf16.safetensors` ([Kijai/WanVideo_comfy](https://huggingface.co/Kijai/WanVideo_comfy)). On your own computer it needs an NVIDIA GPU with 24 GB or more of VRAM and 64 GB or more of RAM (about 10 minutes per 5 s at 480p on a 4090); not on a Mac.

Sources: [Cseti/MiniMax-H3_Ref2VA-LoRA-CrossView-Warp_v1](https://huggingface.co/Cseti/MiniMax-H3_Ref2VA-LoRA-CrossView-Warp_v1), [lightx2v/Minimax-h3-Turbo](https://huggingface.co/lightx2v/Minimax-h3-Turbo), [Comfy-Org/MoGe](https://huggingface.co/Comfy-Org/MoGe).

None of these is a default, so a first run never needs an import. They only come up when you pick that workflow.
