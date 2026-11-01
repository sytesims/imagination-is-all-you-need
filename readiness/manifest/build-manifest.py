#!/usr/bin/env python3
"""Regenerate readiness/manifest/models.json (npm run models:manifest).
  --download COMFY_DIR   also download every non-gated file into COMFY_DIR/models/<folder> (skips existing, verifies sha256)
  --only a,b             restrict --download to these workflow files
  --offline              reuse sizes/hashes from the existing models.json (no network)
Sources: model URLs embedded in workflows/templates (Comfy official templates) + OVERRIDES below.
Size/sha256 come from Hugging Face's LFS headers (x-linked-size / x-linked-etag) on a HEAD of the resolve URL."""
import json, glob, re, os, sys, hashlib, urllib.request, urllib.error, argparse
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'readiness', 'manifest', 'models.json')
EXT = re.compile(r'\.(safetensors|pth|pt|ckpt|bin|gguf|onnx|pkl)$')
# filename -> list of candidate (url, comfy folder). First that resolves wins.
HF = 'https://huggingface.co/'
OVERRIDES = {
 # FLUX.2 [klein] 4B: bf16 DISTILLED file for both Klein 4B workflows (Mac-safe; fp8 is an NVIDIA-only variant in hardware/requirements.ts). Repo renamed from Comfy-Org/flux2-klein.
 'flux-2-klein-4b.safetensors': [(HF+'Comfy-Org/vae-text-encorder-for-flux-klein-4b/resolve/main/split_files/diffusion_models/flux-2-klein-4b.safetensors', 'diffusion_models', {'size': 7751105712, 'sha256': 'ec3d4e733a771f61c052fb4856c48b336c55eaf2c65487c2a1faeb9bbda7a343', 'renamed_from': HF+'Comfy-Org/flux2-klein/resolve/main/split_files/diffusion_models/flux-2-klein-4b.safetensors', 'head_status': 'ok (HEAD 2026-10-22)'})],
 # Wan 2.2 TI2V 5B (Generate Video local route, 2026-10-24): the official template's files, but the fp16 umt5 text encoder (Apple MPS has no float8).
 # Comfy-Org renamed Wan_2.2_ComfyUI_Repackaged → Wan-2.2 and Wan_2.1_ComfyUI_repackaged → Wan-2.1; sizes and sha256 from the HF paths-info API (2026-10-24).
 'wan2.2_ti2v_5B_fp16.safetensors': [(HF+'Comfy-Org/Wan-2.2/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors', 'diffusion_models', {'size': 9999658848, 'sha256': '456f901338bd9eadbded3828b819109a9b68e8a525ca5cf8d0049a69fcfeca1e', 'renamed_from': HF+'Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors', 'head_status': 'ok'})],
 'wan2.2_vae.safetensors': [(HF+'Comfy-Org/Wan-2.2/resolve/main/split_files/vae/wan2.2_vae.safetensors', 'vae', {'size': 1409400960, 'sha256': 'e40321bd36b9709991dae2530eb4ac303dd168276980d3e9bc4b6e2b75fed156', 'renamed_from': HF+'Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors', 'head_status': 'ok'})],
 'umt5_xxl_fp16.safetensors': [(HF+'Comfy-Org/Wan-2.1/resolve/main/split_files/text_encoders/umt5_xxl_fp16.safetensors', 'text_encoders', {'size': 11366399385, 'sha256': '7b8850f1961e1cf8a77cca4c964a358d303f490833c6c087d0cff4b2f99db2af', 'renamed_from': HF+'Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp16.safetensors', 'head_status': 'ok'})],
 # Render (Direct a Shot step 3, 2026-10-24): LTX-2.5 22B distilled GGUF Q4_K_M + Mac-safe bf16 files (unsloth/LTX-2.5-GGUF mirrors Lightricks' bf16 VAEs,
 # upscaler and text encoder), and the gated Layout to Render IC-LoRA (Lightricks; accept on Hugging Face, HF_TOKEN). Sizes from the HF tree API (2026-10-24).
 'ltx-2.5-22b-distilled-Q4_K_M.gguf': [(HF+'unsloth/LTX-2.5-GGUF/resolve/main/distilled/ltx-2.5-22b-distilled-Q4_K_M.gguf', 'diffusion_models', {'size': 13584703872, 'head_status': 'ok (HF tree API 2026-10-24)'})],
 'gemma4-12b-with-proj-ltx-2.5-bf16.safetensors': [(HF+'unsloth/LTX-2.5-GGUF/resolve/main/text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors', 'text_encoders', {'size': 26263858182, 'head_status': 'ok (HF tree API 2026-10-24)'})],
 'ltx-2.5-video-vae-conv-bf16.safetensors': [(HF+'unsloth/LTX-2.5-GGUF/resolve/main/vae/ltx-2.5-video-vae-conv-bf16.safetensors', 'vae', {'size': 1452269922, 'head_status': 'ok (HF tree API 2026-10-24)'})],
 'ltx-2.5-audio-vae-bf16.safetensors': [(HF+'unsloth/LTX-2.5-GGUF/resolve/main/vae/ltx-2.5-audio-vae-bf16.safetensors', 'vae', {'size': 364866540, 'head_status': 'ok (HF tree API 2026-10-24)'})],
 'ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors': [(HF+'unsloth/LTX-2.5-GGUF/resolve/main/latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors', 'latent_upscale_models', {'size': 995778752, 'head_status': 'ok (HF tree API 2026-10-24)'})],
 # LTX-2.5 DFR (Diffusion Fidelity Rendering, 2026-10-29): the official template video_ltx2_5_dfr_i2v's own files (workflows/ltx25-dfr-i2v-api.json;
 # docs.comfy.org/tutorials/video/ltx/ltx-2-5-dfr). The int8 ConvRot transformer needs CUDA (hardware/macWeights.ts). Sizes: HF tree API, 2026-10-29.
 'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors': [(HF+'Lightricks/LTX-2.5/resolve/main/diffusion_models/ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors', 'diffusion_models', {'size': 21504034224, 'head_status': 'ok (HF tree API 2026-10-29)'})],
 'ltx-2.5-video-vae-bf16.safetensors': [(HF+'Lightricks/LTX-2.5/resolve/main/vae/ltx-2.5-video-vae-bf16.safetensors', 'vae', {'size': 1472223346, 'head_status': 'ok (HF tree API 2026-10-29)'})],
 'ltx-2.5-latent-temporal-upscaler-x2-bf16-1.0.safetensors': [(HF+'Lightricks/LTX-2.5/resolve/main/latent_upscale_models/ltx-2.5-latent-temporal-upscaler-x2-bf16-1.0.safetensors', 'latent_upscale_models', {'size': 261944000, 'head_status': 'ok (HF tree API 2026-10-29)'})],
 'ltx-2.5-22b-ic-lora-pixel-spatial-upscaler-x2-1.0.safetensors': [(HF+'Lightricks/LTX-2.5-22b-IC-LoRA-Pixel-Spatial-Upscaler/resolve/main/ltx-2.5-22b-ic-lora-pixel-spatial-upscaler-x2-1.0.safetensors', 'loras', {'size': 327322640, 'head_status': 'ok (HF tree API 2026-10-29)'})],
 # Footage Effects (2026-10-26): the shared IC-LoRA video-to-video graph names Clean Plate as its default; the other effect IC-LoRAs (Day to Night,
 # Water Simulation, Alpha Gen) are swapped in per job from server/src/shared/ltxLoras.ts. Size = the file on disk (2026-10-26).
 'ltx-2.5-22b-ic-lora-clean-plate-1.0.safetensors': [(HF+'Lightricks/LTX-2.5-22b-IC-LoRA-Clean-Plate/resolve/main/ltx-2.5-22b-ic-lora-clean-plate-1.0.safetensors', 'loras', {'size': 327318439, 'head_status': 'not probed (size from the downloaded file, 2026-10-26)'})],
 'ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors': [(HF+'Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render/resolve/main/ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors', 'loras', {'size': 1308787439, 'head_status': 'gated (accept the licence on Hugging Face; HF tree API 2026-10-24)'})],
 't3_mtl23ls_v3.safetensors': [(HF+'ResembleAI/chatterbox/resolve/main/t3_mtl23ls_v3.safetensors', 'chatterbox')],  # Chatterbox multilingual (auto-downloaded by wildminder pack)
 # FLUX 3 Klein (gated BFL repack): official file names. Its VAE ships as vae/flux2-vae.safetensors (336,211,292 B), a byte-different copy of
 # Comfy-Org/flux2-dev's flux2-vae.safetensors (336,213,556 B, same 336,185,492 B tensor payload size). One models/vae/flux2-vae.safetensors serves both
 # (official name; Comfy Cloud matches by exact name): the public Comfy-Org file resolves first, the gated Klein copy is the fallback.
 'flux3-image-klein-int8-convrot.safetensors': [(HF+'black-forest-labs/flux-3-image-klein-comfy/resolve/main/diffusion_models/flux3-image-klein-int8-convrot.safetensors', 'diffusion_models')],
 # 2026-10-27: the Mac-runnable set. Text encoder + the int8_convrot prompt upsampler (the templates ship w4a8, which needs CUDA-only kernels;
 # server/src/hardware/macWeights.ts). Gated: accept the FLUX Kommunity licence on Hugging Face, then download with an HF token. Sizes: HF tree API, 2026-10-27.
 'qwen3vl_4b_int8_convrot.safetensors': [(HF+'black-forest-labs/flux-3-image-klein-comfy/resolve/main/text_encoders/qwen3vl_4b_int8_convrot.safetensors', 'text_encoders', {'size': 4858559240, 'head_status': 'gated', 'note': 'FLUX 3 Klein text encoder (Qwen3-VL 4B, int8 ConvRot). Gated: accept the FLUX Kommunity licence on https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy, then download with an HF token.'})],
 'qwen3.5_9b_flux3_prompt_upsampler_int8_convrot.safetensors': [(HF+'black-forest-labs/flux-3-image-klein-comfy/resolve/main/text_encoders/qwen3.5_9b_flux3_prompt_upsampler_int8_convrot.safetensors', 'text_encoders', {'size': 9748113996, 'head_status': 'gated', 'note': 'FLUX 3 Klein prompt upsampler (Qwen3.5 9B, int8 ConvRot; BFL: use the model with a prompt upsampler). Optional per job: promptRewrite=0 runs the raw prompt without it. Gated: accept the FLUX Kommunity licence on https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy, then download with an HF token.'})],
 # Separation (Translate a video / Change Voice, 2026-11-01): the official Comfy template audio_melbandroformer_audio_separation names this file for
 # models/diffusion_models. Safetensors copy (Kijai) of KimberleyJSN/melbandroformer (MIT). Size + sha256: HF LFS headers (x-linked-size / x-linked-etag), 2026-11-01.
 'MelBandRoformer_fp16.safetensors': [(HF+'Kijai/MelBandRoFormer_comfy/resolve/main/MelBandRoformer_fp16.safetensors', 'diffusion_models', {'size': 456479072, 'sha256': '6119aef379a6c7264e0b37db65ae1e6488b8ca4a00baf56d6d244737b8488226', 'head_status': 'ok (HEAD 2026-11-01)'})],
 'mmaudio_large_44k_v2_fp16.safetensors': [(HF+'Kijai/MMAudio_safetensors/resolve/main/mmaudio_large_44k_v2_fp16.safetensors', 'mmaudio')],
 'mmaudio_vae_44k_fp16.safetensors': [(HF+'Kijai/MMAudio_safetensors/resolve/main/mmaudio_vae_44k_fp16.safetensors', 'mmaudio')],
 'mmaudio_synchformer_fp16.safetensors': [(HF+'Kijai/MMAudio_safetensors/resolve/main/mmaudio_synchformer_fp16.safetensors', 'mmaudio')],
 'apple_DFN5B-CLIP-ViT-H-14-384_fp16.safetensors': [(HF+'Kijai/MMAudio_safetensors/resolve/main/apple_DFN5B-CLIP-ViT-H-14-384_fp16.safetensors', 'mmaudio')],
 'yolox_l.onnx': [(HF+'yzd-v/DWPose/resolve/main/yolox_l.onnx', 'custom_nodes/comfyui_controlnet_aux/ckpts/yzd-v/DWPose')],
 'dw-ll_ucoco_384_bs5.torchscript.pt': [(HF+'hr16/DWPose-TorchScript-BatchSize5/resolve/main/dw-ll_ucoco_384_bs5.torchscript.pt', 'custom_nodes/comfyui_controlnet_aux/ckpts/hr16/DWPose-TorchScript-BatchSize5')],
 'rife49.pth': [(HF+'MachineDelusions/RIFE/resolve/main/rife49.pth', 'custom_nodes/ComfyUI-Frame-Interpolation/ckpts/rife'), (HF+'marduk191/rife/resolve/main/rife49.pth', 'custom_nodes/ComfyUI-Frame-Interpolation/ckpts/rife')],
 'depth_anything_v2_vits.pth': [(HF+'depth-anything/Depth-Anything-V2-Small/resolve/main/depth_anything_v2_vits.pth', 'custom_nodes/comfyui_controlnet_aux/ckpts/depth-anything/Depth-Anything-V2-Small')],  # Edit Video Depth Map (Apache-2.0; auto-downloaded by controlnet_aux)
 'sam2_hiera_base_plus.safetensors': [(HF+'Kijai/sam2-safetensors/resolve/main/sam2_hiera_base_plus.safetensors', 'sam2')],
 'BiRefNet-general.safetensors': [(HF+'ZhengPeng7/BiRefNet/resolve/main/model.safetensors', 'birefnet')],
 'ema_vae_fp16.safetensors': [(HF+'numz/SeedVR2_comfyUI/resolve/main/ema_vae_fp16.safetensors', 'SEEDVR2')],
 # Upscale (2026-10-22): SeedVR2 3B fp16 + VAE for the native-node image graph (Comfy-Org/SeedVR2), 4x Nomos2 DAT2 (Phhofm, GitHub release). Sizes and sha256 of the files on disk.
 'seedvr2_3b_fp16.safetensors': [(HF+'Comfy-Org/SeedVR2/resolve/main/diffusion_models/seedvr2_3b_fp16.safetensors', 'diffusion_models', {'size': 6784268336, 'sha256': '98669fd2c06df5eca88baf68cd5c478775c8e61fc110e598c52b350145ea2660'})],
 # SeedVR2 3B int8 ConvRot (native video upscale graph, 2026-10-31): the URL the docs.comfy.org SeedVR2 tutorial lists (tutorials/utility/seedvr2); size and sha256 from the HF tree API (LFS oid).
 'seedvr2_3b_int8_convrot.safetensors': [(HF+'Comfy-Org/SeedVR2/resolve/main/diffusion_models/seedvr2_3b_int8_convrot.safetensors', 'diffusion_models', {'size': 3458259704, 'sha256': 'c3dec8bcc5916843a8a858572970597462e1f2dc598d6dfd818f6cd40f53a157', 'head_status': 'ok (size and sha256 from the HF tree API, 2026-10-31; not probed)'})],
 'seedvr2_ema_vae_fp16.safetensors': [(HF+'Comfy-Org/SeedVR2/resolve/main/vae/seedvr2_ema_vae_fp16.safetensors', 'vae', {'size': 501324814, 'sha256': '20678548f420d98d26f11442d3528f8b8c94e57ee046ef93dbb7633da8612ca1'})],
 '4xNomos2_hq_dat2.pth': [('https://github.com/Phhofm/models/releases/download/4xNomos2_hq_dat2/4xNomos2_hq_dat2.pth', 'upscale_models', {'size': 140196334, 'sha256': '1f2be2b4786b5031776aed90e1818564f5576ab1e44da9355c7f3788ea25bdea'})],
 'seedvr2_ema_3b_fp8_e4m3fn.safetensors': [(HF+'numz/SeedVR2_comfyUI/resolve/main/seedvr2_ema_3b_fp8_e4m3fn.safetensors', 'SEEDVR2')],
 'seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors': [(HF+'numz/SeedVR2_comfyUI/resolve/main/seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors', 'SEEDVR2'), (HF+'AInVFX/SeedVR2_comfyUI/resolve/main/seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors', 'SEEDVR2')],
 '4x-UltraSharp.pth': [(HF+'Kim2091/UltraSharp/resolve/main/4x-UltraSharp.pth', 'upscale_models'), (HF+'lokCX/4x-Ultrasharp/resolve/main/4x-UltraSharp.pth', 'upscale_models')],
 'RealESRGAN_x2plus.pth': [(HF+'Comfy-Org/Real-ESRGAN_repackaged/resolve/main/RealESRGAN_x2plus.pth', 'upscale_models'), (HF+'ai-forever/Real-ESRGAN/resolve/main/RealESRGAN_x2.pth', 'upscale_models'), ('https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth', 'upscale_models')],
 'RealESRGAN_x4plus.pth': [(HF+'Comfy-Org/Real-ESRGAN_repackaged/resolve/main/RealESRGAN_x4plus.pth', 'upscale_models'), (HF+'lllyasviel/Annotators/resolve/main/RealESRGAN_x4plus.pth', 'upscale_models')],
 'Flux_2-Turbo-LoRA_comfyui.safetensors': [(HF+'fal/FLUX.2-dev-Turbo/resolve/main/comfy/Flux_2-Turbo-LoRA_comfyui.safetensors', 'loras'), (HF+'fal/FLUX.2-dev-Turbo/resolve/main/Flux_2-Turbo-LoRA_comfyui.safetensors', 'loras')],
 'Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors': [(HF+'lightx2v/Qwen-Image-Lightning/resolve/main/Qwen-Image-Edit-2509/Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors', 'loras')],
 # Shots optional route (2026-10-21): dx8152/Qwen-Edit-2509-Multiple-angles LoRA, Apache-2.0, 236,117,032 B (sha256 e0cea950…4c8f per HF LFS). The upstream file name is
 # Chinese (镜头转换.safetensors, "camera switch"); we store it under an ASCII name, workflows/shots-qwen-edit2509-angles-api.json loads that name.
 'Qwen-Edit-2509-Multiple-angles.safetensors': [(HF+'dx8152/Qwen-Edit-2509-Multiple-angles/resolve/main/%E9%95%9C%E5%A4%B4%E8%BD%AC%E6%8D%A2.safetensors', 'loras')],
 # Face Swap / Person Swap on Qwen Image 2.1 (2026-10-22): BFS swap LoRAs by Alissonerdx (MIT), workflows/create-image-qwen21-{faceswap,personswap}-api.json.
 # Size and sha256 read from the downloaded files (user-approved download, 2026-10-22).
 'bfs_head_v1.1_qwen_2.1.safetensors': [(HF+'Alissonerdx/BFS-Best-Face-Swap/resolve/main/bfs_head_v1.1_qwen_2.1.safetensors', 'loras', {'size': 260096144, 'sha256': 'd1d748d5601077f3b6d05766f6823510e901970d916afa404a97e85dc92fa88e'})],
 'bfs_body_swap_v1.0_qwen_2.1.safetensors': [(HF+'Alissonerdx/BFS-Best-Face-Swap/resolve/main/bfs_body_swap_v1.0_qwen_2.1.safetensors', 'loras', {'size': 209753576, 'sha256': '7dc0a53aba4dbc70c204f498936a619d226559da11011f748c389189af46b664'})],
 'Qwen-Image-Lightning-8steps-V1.0.safetensors': [(HF+'lightx2v/Qwen-Image-Lightning/resolve/main/Qwen-Image-Lightning-8steps-V1.0.safetensors', 'loras')],
 'wan2.1_t2v_14b_lora_rank64_lightx2v_4step.safetensors': [(HF+'lightx2v/Wan2.1-Distill-Loras/resolve/main/wan2.1_t2v_14b_lora_rank64_lightx2v_4step.safetensors', 'loras'), (HF+'Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/loras/wan2.1_t2v_14b_lora_rank64_lightx2v_4step.safetensors', 'loras'), (HF+'Kijai/WanVideo_comfy/resolve/main/Wan21_T2V_14B_lightx2v_cfg_step_distill_lora_rank64.safetensors', 'loras')],
 # Fish Audio Drama 3 via PedroMarinhoDev/ComfyUI-Drama3 (repack of fishaudio/drama-3, Fish Audio Community License; ASR Apache-2.0)
 # H3 Character Swap LoRA v1.5 (akatz-ai, MiniMax H3 Community License) + Comfy-Org fl2v turbo 8-step, workflows/object-swap-h3-charswap-api.json
 'h3_character_swap_v1.5.safetensors': [(HF+'akatz-ai/MiniMax-H3-Character-Swap-LoRA/resolve/main/h3_character_swap_v1.5.safetensors', 'loras')],
 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors': [(HF+'Comfy-Org/MiniMax-H3/resolve/main/loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors', 'loras')],
 # MiniMax H3 additions (2026-10-17; manifest entries only, nothing downloaded). Our local file names → source repos (exact repo file names to confirm on the online run).
 'minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors': [(HF+'Comfy-Org/MiniMax-H3/resolve/main/loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors', 'loras')],
 # Exact upstream names (online run 2026-10-17): Civitai camera_motion_h3 v1.0 = model 2914784 / version 3297480 (only the 3000-step file is published).
 'camera_motion_h3_lora_v1_3000_pruned.safetensors': [('https://civitai.com/api/download/models/3297480', 'loras')],
 'minimax_h3_style_transfer_v1.0_r64.safetensors': [(HF+'Alissonerdx/Minimax-H3-ComfyUI/resolve/main/loras/minimax_h3_style_transfer_v1.0_r64.safetensors', 'loras')],
 'minimax_h3_vfx_edit_v1.0_r128.safetensors': [(HF+'Alissonerdx/Minimax-H3-ComfyUI/resolve/main/loras/minimax_h3_vfx_edit_v1.0_r128.safetensors', 'loras')],
 'drama3_fp8experts_bf16.safetensors': [(HF+'PedroMarinhoDev/Drama-3-ComfyUI/resolve/main/drama3_fp8experts_bf16.safetensors', 'diffusion_models')],
 'drama3_codec.safetensors': [(HF+'PedroMarinhoDev/Drama-3-ComfyUI/resolve/main/drama3_codec.safetensors', 'vae')],
 'qwen3_asr_0.6b_bf16.safetensors': [(HF+'PedroMarinhoDev/Qwen3-ASR-ComfyUI/resolve/main/qwen3_asr_0.6b_bf16.safetensors', 'asr')],
 'ltx-2-19b-lora-camera-control-dolly-in.safetensors': [(HF+'Lightricks/LTX-2-19b-LoRA-Camera-Control-Dolly-In/resolve/main/ltx-2-19b-lora-camera-control-dolly-in.safetensors', 'loras')],
 # OpenSoul (tool soul): bases, character engines, look LoRAs (no training; existing community LoRAs only). Civitai downloads may need CIVITAI_TOKEN.
 'Z-Image-Turbo-Realism-LoRA.safetensors': [(HF+'suayptalha/Z-Image-Turbo-Realism-LoRA/resolve/main/pytorch_lora_weights.safetensors', 'loras')],
 'flux1-dev-fp8.safetensors': [(HF+'Kijai/flux-fp8/resolve/main/flux1-dev-fp8.safetensors', 'diffusion_models')],
 'flux1-fill-dev.safetensors': [(HF+'black-forest-labs/FLUX.1-Fill-dev/resolve/main/flux1-fill-dev.safetensors', 'diffusion_models')],
 'clip_l.safetensors': [(HF+'comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors', 'text_encoders')],
 't5xxl_fp8_e4m3fn.safetensors': [(HF+'comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors', 'text_encoders')],
 'qwen_image_2512_fp8_e4m3fn.safetensors': [(HF+'Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_2512_fp8_e4m3fn.safetensors', 'diffusion_models')],
 'qwen_image_edit_2511_fp8mixed.safetensors': [(HF+'Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2511_fp8mixed.safetensors', 'diffusion_models')],
 'pulid_flux_v0.9.1.safetensors': [(HF+'guozinan/PuLID/resolve/main/pulid_flux_v0.9.1.safetensors', 'pulid')],
 'comfyui_portrait_lora64.safetensors': [(HF+'ali-vilab/ACE_Plus/resolve/main/portrait/comfyui_portrait_lora64.safetensors', 'loras')],
 'aes_stage2/image_proj_model.bin': [(HF+'ByteDance/InfiniteYou/resolve/main/infu_flux_v1.0/aes_stage2/image_proj_model.bin', 'infinite_you/aes_stage2')],
 'aes_stage2/infusenet_aes_fp8e4m3fn.safetensors': [(HF+'ByteDance/InfiniteYou/resolve/main/infu_flux_v1.0/aes_stage2/infusenet_aes_fp8e4m3fn.safetensors', 'infinite_you/aes_stage2')],
 'sim_stage1/image_proj_model.bin': [(HF+'ByteDance/InfiniteYou/resolve/main/infu_flux_v1.0/sim_stage1/image_proj_model.bin', 'infinite_you/sim_stage1')],
 'sim_stage1/infusenet_sim_fp8e4m3fn.safetensors': [(HF+'ByteDance/InfiniteYou/resolve/main/infu_flux_v1.0/sim_stage1/infusenet_sim_fp8e4m3fn.safetensors', 'infinite_you/sim_stage1')],
 'comfyui_subject_lora16.safetensors': [(HF+'ali-vilab/ACE_Plus/resolve/main/subject/comfyui_subject_lora16.safetensors', 'loras')],
 'fluxRealSkin-V2.safetensors': [('https://civitai.com/api/download/models/827325', 'loras')],
 'CoolShot_2000s_qwen.safetensors': [('https://civitai.com/api/download/models/2436841', 'loras')],
 'Modeling 101 v1.5.safetensors': [('https://civitai.com/api/download/models/2555690', 'loras')],
 '50sNoirZ.safetensors': [('https://civitai.com/api/download/models/2596514', 'loras')],
 'Velatrix.safetensors': [('https://civitai.com/api/download/models/2975453', 'loras')],
 'Professional_studio_quality_-_ZIT_epoch_13.safetensors': [('https://civitai.com/api/download/models/3107206', 'loras')],
 'Z-TURBO_Photography_35mmPhoto_1536.safetensors': [('https://civitai.com/api/download/models/2466153', 'loras')],
 'Cinematic Film Color style v1.2.safetensors': [('https://civitai.com/api/download/models/2537802', 'loras')],
 'CandidInstaxphotoZ.safetensors': [('https://civitai.com/api/download/models/2597365', 'loras')],
 'amateur_selfie.safetensors': [('https://civitai.com/api/download/models/2514521', 'loras')],
 'Z_Instapic_V1.safetensors': [('https://civitai.com/api/download/models/2909558', 'loras')],
 'd1rectflash.safetensors': [('https://civitai.com/api/download/models/1880243', 'loras')],
 'flux-fash.safetensors': [('https://civitai.com/api/download/models/2418642', 'loras')],
 'CCD_Dreams_qwen2507.safetensors': [('https://civitai.com/api/download/models/3086732', 'loras')],
 # YuE2 (song + cover), local MiniMax Music 3 and MOSS-Image (2026-10-25): the URLs the Comfy docs tutorials list; size and sha256 from HF LFS headers on HEAD.
 'yue2_3b_int8_convrot.safetensors': [(HF+'Comfy-Org/YuE2/resolve/main/checkpoints/yue2_3b_int8_convrot.safetensors', 'checkpoints', {'size': 3960938800, 'sha256': '96fe199377309001ed8cd26a944baeee8cc31a20ba7c36d1d3c0a7e1f4149db6', 'head_status': 'ok'})],
 'sheetsage2_bf16.safetensors': [(HF+'Comfy-Org/YuE2/resolve/main/audio_encoders/sheetsage2_bf16.safetensors', 'audio_encoders', {'size': 1386868122, 'sha256': '5fd960ce3df281e3f3a889d174584d88f96247711480cf96377b12d7e8b6adc5', 'head_status': 'ok'})],
 'minimax_music3_dit_fp16.safetensors': [(HF+'Comfy-Org/MiniMax-Music-3/resolve/main/diffusion_models/minimax_music3_dit_fp16.safetensors', 'diffusion_models', {'size': 4914197682, 'sha256': '45494a2b6b69af115902ff28eaf54118d19067aa54da01000f3e3efce7ba0e34', 'head_status': 'ok'})],
 'minimax_music3_text_encoder_pruned_int8_convrot.safetensors': [(HF+'Comfy-Org/MiniMax-Music-3/resolve/main/text_encoders/minimax_music3_text_encoder_pruned_int8_convrot.safetensors', 'text_encoders', {'size': 9196611886, 'sha256': '010b7416d2336a08c711bc22ee65849c9623069ddb7d89bec011a75699e52014', 'head_status': 'ok'})],
 'minimax_music3_dav.safetensors': [(HF+'Comfy-Org/MiniMax-Music-3/resolve/main/vae/minimax_music3_dav.safetensors', 'vae', {'size': 216696128, 'sha256': '2a32155b769be01445fcc2a8663b910fc9e1751e18dc1c3ec528064512d9ef0c', 'head_status': 'ok'})],
 'moss_image_sft_int8_convrot.safetensors': [(HF+'Comfy-Org/MOSS-Image/resolve/main/diffusion_models/moss_image_sft_int8_convrot.safetensors', 'diffusion_models', {'size': 5413698958, 'sha256': 'b4d1475bc7eeffd7b809e82ea13a1fba1fb85c4e18365af3813722faa5c0fe4f', 'head_status': 'ok'})],
 'moss_image_base_int8_convrot.safetensors': [(HF+'Comfy-Org/MOSS-Image/resolve/main/diffusion_models/moss_image_base_int8_convrot.safetensors', 'diffusion_models', {'size': 5413698958, 'sha256': 'f601c1e1161915fb3fea003da0c1782e374dd960fbb3978bc0e4e3fa1f2d8e6f', 'head_status': 'ok'})],
 'qwen3.5_9b_w4a8_gptq.safetensors': [(HF+'Comfy-Org/MOSS-Image/resolve/main/text_encoders/qwen3.5_9b_w4a8_gptq.safetensors', 'text_encoders', {'size': 7343591088, 'sha256': '4cc6a1543ad2061806da46f35f90cadb4801dcba246c44782cf42ec0feb6407c', 'head_status': 'ok'})],
 # Qwen3 TTS 1.7B CustomVoice (2026-10-27): a Hugging Face model FOLDER the flybirdxx/ComfyUI-Qwen-TTS node finds by name under models/qwen-tts/
 # (model_choice 1.7B + "CustomVoice" in the folder name). Listed so the app can tell "installed / files needed" (ComfyUI lists the qwen-tts folder);
 # no single-file URL on purpose: the model is a folder of files (config, tokenizer, weights), so it is installed by hand (docs/LOCAL-MODELS-AND-HARDWARE.md),
 # never by models:download or the app's one-click download. Sizes = the files on disk (2026-10-27). page_url: where to get it (no download url).
 'Qwen3-TTS-12Hz-1.7B-CustomVoice/model.safetensors': [('', 'qwen-tts', {'size': 3833402552, 'head_status': 'install by hand (a Hugging Face folder: huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice)', 'page_url': 'https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice'})],
 'Qwen3-TTS-12Hz-1.7B-CustomVoice/speech_tokenizer/model.safetensors': [('', 'qwen-tts', {'size': 682293092, 'head_status': 'install by hand (part of the same folder)', 'page_url': 'https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/tree/main/speech_tokenizer'})],
 'flux2-vae_small.safetensors': [(HF+'Comfy-Org/MOSS-Image/resolve/main/vae/flux2-vae_small.safetensors', 'vae', {'size': 249521340, 'sha256': 'd8d52ba036475f5fb07c8b435e176d3d97ebfa82f0d1a1c317f9cc1e25bd013b', 'head_status': 'ok'})],
}
# Look LoRAs referenced by server/src/tools/soul/presets.ts (patched into soul-*-api.json at run time, so not in any template), per base model
# (hardware plan B4, 2026-10-31): a LoRA is listed only for the graphs of its own base (server/src/tools/soul/plan.ts BASE_WF / ENGINE_WF / FAMILY), so the
# InfiniteYou fp8 InfuseNet no longer lands on soul-zit (which made the whole card "Needs NVIDIA" on a Mac) and a graph counts only its own base's LoRAs.
SOUL_GRAPHS = {'zit': ['soul-zit'], 'flux1dev': ['soul-flux1dev', 'soul-ref-pulid', 'soul-ref-infiniteyou', 'soul-ref-aceplus'], 'qwen': ['soul-qwen', 'soul-ref-qwenedit']}
SOUL_LOOK_LORAS = {
 'comfyui_subject_lora16.safetensors': ('flux1-dev', ['soul-ref-aceplus']), 'sim_stage1/image_proj_model.bin': ('flux1-dev', ['soul-ref-infiniteyou']), 'sim_stage1/infusenet_sim_fp8e4m3fn.safetensors': ('flux1-dev', ['soul-ref-infiniteyou']),
 **{f: ('z-image-turbo', SOUL_GRAPHS['zit']) for f in ['50sNoirZ.safetensors', 'CandidInstaxphotoZ.safetensors', 'Cinematic Film Color style v1.2.safetensors', 'Modeling 101 v1.5.safetensors', 'Professional_studio_quality_-_ZIT_epoch_13.safetensors', 'Velatrix.safetensors', 'Z-TURBO_Photography_35mmPhoto_1536.safetensors', 'Z_Instapic_V1.safetensors', 'amateur_selfie.safetensors']},
 **{f: ('flux1-dev', SOUL_GRAPHS['flux1dev']) for f in ['d1rectflash.safetensors', 'flux-fash.safetensors']},
 **{f: ('qwen-image', SOUL_GRAPHS['qwen']) for f in ['CCD_Dreams_qwen2507.safetensors']},
}
# The base model family of a LoRA (the `base` field on lora rows; a LoRA runs wherever its base runs): from the DiT files of the graphs that load it.
BASES = [(r'z_image_turbo', 'z-image-turbo'), (r'qwen_image_edit_2509', 'qwen-image-edit-2509'), (r'qwen_image_edit_2511', 'qwen-image-edit-2511'), (r'qwen_image_2\.1', 'qwen-image-2.1'),
 (r'qwen_image_(2512|fp8|bf16)|qwen-image-Q', 'qwen-image'), (r'flux1-(dev|fill)', 'flux1-dev'), (r'flux2_dev|flux2-dev', 'flux2-dev'), (r'flux-2-klein-4b', 'flux2-klein-4b'), (r'ltx-2\.5', 'ltx-2.5-22b'),
 (r'ltx-2-19b', 'ltx-2-19b'), (r'wan2\.2_i2v', 'wan2.2-i2v-14b'), (r'Wan2_2-Animate|Wan2\.2-Animate', 'wan2.2-animate-14b'), (r'wan2\.1_vace', 'wan2.1-vace-14b'), (r'wan2\.2_fun_camera', 'wan2.2-fun-camera-14b'),
 (r'wan2\.2_ti2v_5B', 'wan2.2-ti2v-5b'), (r'minimax_h3', 'minimax-h3'), (r'qwen_image_2\.1_turbo', 'qwen-image-2.1')]
# Graphs whose custom node fetches its own weights (no file name in the graph, so no model row): their memory estimate and note (hardware plan B7).
# vram_est_gb: the pack's weights + 1.5 GB activations, an ESTIMATE (Chatterbox from the hardware matrix, 2026-10-31; F5-TTS v1 Base ~1.3 GB, unverified).
PACK_WORKFLOWS = {
 'workflows/voice-chatterbox-tts-api.json': {'vram_est_gb': 3.6, 'note': 'ComfyUI-Chatterbox downloads its own weights (ResembleAI) on first use; memory is an estimate'},
 'workflows/voice-chatterbox-vc-api.json': {'vram_est_gb': 3.6, 'note': 'ComfyUI-Chatterbox downloads its own weights (ResembleAI) on first use; memory is an estimate'},
 'workflows/voice-f5tts-api.json': {'vram_est_gb': 2.8, 'note': 'ComfyUI-F5-TTS downloads its own weights (F5TTS_v1_Base) on first use; memory is an estimate'},
}
# ---- Variants keyed by platform (hardware plan §3.2, item 5, 2026-10-31) ----
# Platforms: mac-arm64 (Apple Silicon, MPS) · nvidia-x64 (an NVIDIA PC) · nvidia-arm64 (DGX Spark, GB10: keeps the NVIDIA files, plan §1) · cpu.
# A variant maps a ROLE (dit, dit_high, dit_low, te, te2…) to a file; `replaces` names the graph's file for that role, so the app patches the graph
# by role (the loader class follows the file: a .gguf DiT loads with UnetLoaderGGUF). Every Mac-blocked file of a graph must have a swap, else mac: null.
# The Mac files are the plan's §1 "Best alternative file per platform" picks; names, sizes and sha256 from the public Hugging Face API tree listing
# (GET https://huggingface.co/api/models/<repo>/tree/main, 2026-10-31; metadata only, nothing downloaded). verified: false until a local test run.
MAC_FILES = {  # file -> (url, folder, size, sha256)
 'qwen-image-Q4_K_M.gguf': (HF+'city96/Qwen-Image-gguf/resolve/main/qwen-image-Q4_K_M.gguf', 'diffusion_models', 13065746976, 'c6f49103603b9a4927502549fb615c910386cfc675b1466325930ba10d2a11f4'),
 'Qwen-Image-Edit-2509-Q4_K_M.gguf': (HF+'QuantStack/Qwen-Image-Edit-2509-GGUF/resolve/main/Qwen-Image-Edit-2509-Q4_K_M.gguf', 'diffusion_models', 13065746976, '08f27cdf3e760edef5136ab0afdb9d3ed7a2799bd730b8d5cd9ecb291d808425'),
 'qwen_2.5_vl_7b.safetensors': (HF+'Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b.safetensors', 'text_encoders', 16584415576, 'cfafd739459bc86257397259f612a9aee88e5b98e85b5c0d0d1717e898b3463a'),
 'Wan2.2-I2V-A14B-HighNoise-Q4_K_M.gguf': (HF+'QuantStack/Wan2.2-I2V-A14B-GGUF/resolve/main/HighNoise/Wan2.2-I2V-A14B-HighNoise-Q4_K_M.gguf', 'diffusion_models', 9651728896, '836250abfaa3411694e2c9cf3a0cc18265329d5156d81aa116d5366b0f8f02e7'),
 'Wan2.2-I2V-A14B-LowNoise-Q4_K_M.gguf': (HF+'QuantStack/Wan2.2-I2V-A14B-GGUF/resolve/main/LowNoise/Wan2.2-I2V-A14B-LowNoise-Q4_K_M.gguf', 'diffusion_models', 9651728896, 'e2f98d834af009d035c6b0918268f2eba0aa8a63025ce942277e2384d40b0866'),
 'Wan2.2-Fun-A14B-Control-Camera-HighNoise-Q4_K_M.gguf': (HF+'QuantStack/Wan2.2-Fun-A14B-Control-Camera-GGUF/resolve/main/HighNoise/Wan2.2-Fun-A14B-Control-Camera-HighNoise-Q4_K_M.gguf', 'diffusion_models', 10668264576, 'e5f56a7ae1bf9f1b01e1471a808685c08ca47fa9230d8c8edef2a01f27dc8593'),
 'Wan2.2-Fun-A14B-Control-Camera-LowNoise-Q4_K_M.gguf': (HF+'QuantStack/Wan2.2-Fun-A14B-Control-Camera-GGUF/resolve/main/LowNoise/Wan2.2-Fun-A14B-Control-Camera-LowNoise-Q4_K_M.gguf', 'diffusion_models', 10668264576, 'def5f048553faeaf0afbaef6c928d4baedd808b84f06afdce1973d6b55f18ac8'),
 'Wan2.1_14B_VACE-Q4_K_M.gguf': (HF+'QuantStack/Wan2.1_14B_VACE-GGUF/resolve/main/Wan2.1_14B_VACE-Q4_K_M.gguf', 'diffusion_models', 11639453600, 'd03b2280e996172e55d91e8c41cc8a0c28fd89afc6ddbdb0572caa97fd8cc5a6'),
 'Wan2.2-Animate-14B-Q4_K_M.gguf': (HF+'QuantStack/Wan2.2-Animate-14B-GGUF/resolve/main/Wan2.2-Animate-14B-Q4_K_M.gguf', 'diffusion_models', 11496331072, '43d720f243c3cdf5346ca05b525ec662f89bc5ebeb8e998dc347b840406cdfa6'),
 'flux1-dev-Q8_0.gguf': (HF+'city96/FLUX.1-dev-gguf/resolve/main/flux1-dev-Q8_0.gguf', 'diffusion_models', 12708281504, '129032f32224bf7138f16e18673d8008ba5f84c1ec74063bf4511a8bb4cf553d'),
 't5xxl_fp16.safetensors': (HF+'comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors', 'text_encoders', 9787841024, '6e480b09fae049a72d2a8c5fbccb8d3e92febeb233bbe9dfe7256958a9167635'),
}
# graph file -> its Mac file. A graph with a swap for EVERY Mac-blocked file gets a mac-arm64 variant (all of its swappable files change together, fixes B6).
MAC_SWAPS = {
 'qwen_image_fp8_e4m3fn.safetensors': 'qwen-image-Q4_K_M.gguf', 'qwen_image_edit_2509_fp8_e4m3fn.safetensors': 'Qwen-Image-Edit-2509-Q4_K_M.gguf',
 'qwen_2.5_vl_7b_fp8_scaled.safetensors': 'qwen_2.5_vl_7b.safetensors',
 'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors': 'Wan2.2-I2V-A14B-HighNoise-Q4_K_M.gguf', 'wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors': 'Wan2.2-I2V-A14B-LowNoise-Q4_K_M.gguf',
 'wan2.2_fun_camera_high_noise_14B_fp8_scaled.safetensors': 'Wan2.2-Fun-A14B-Control-Camera-HighNoise-Q4_K_M.gguf', 'wan2.2_fun_camera_low_noise_14B_fp8_scaled.safetensors': 'Wan2.2-Fun-A14B-Control-Camera-LowNoise-Q4_K_M.gguf',
 'wan2.1_vace_14B_fp16.safetensors': 'Wan2.1_14B_VACE-Q4_K_M.gguf', 'Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ.safetensors': 'Wan2.2-Animate-14B-Q4_K_M.gguf',
 'umt5_xxl_fp8_e4m3fn_scaled.safetensors': 'umt5_xxl_fp16.safetensors', 'flux1-dev-fp8.safetensors': 'flux1-dev-Q8_0.gguf', 't5xxl_fp8_e4m3fn.safetensors': 't5xxl_fp16.safetensors',
}
MAC_BLOCKED = re.compile(r'fp8|nvfp4|(^|[_.-])w\d+a\d+([_.-]|$)', re.I)  # the same rule as server/src/hardware/macWeights.ts

def variant_rows(models):
    """Model rows for the Mac files (workflows: [] so no graph counts them; variant_of: the graphs whose mac-arm64 variant loads them)."""
    have = {m['file'] for m in models}
    for f, (url, folder, size, sha) in MAC_FILES.items():
        if f in have: continue
        repo, rev, rpath = repo_of(url)
        models.append({'file': f, 'folder': folder, 'hf_repo': repo, 'revision': rev, 'repo_path': rpath, 'url': url, 'size': size, 'size_gb': round(size / 1e9, 2), 'sha256': sha,
                       'head_status': 'ok (HF API tree listing 2026-10-31)', 'auto_downloaded_by_pack': False, 'tried': [], 'loaded_by': ['UnetLoaderGGUF'] if f.endswith('.gguf') else ['CLIPLoader'],
                       'input': ['unet_name'] if f.endswith('.gguf') else ['clip_name'], 'workflows': []})

def roles_of(models, files):
    """role -> file for a graph's weight files: dit / te / vae / lora / aux, with _high / _low for two-expert graphs and a number for other repeats."""
    by = {m['file']: m for m in models}; out = {}
    for f in sorted(files):
        m = by[f]; r = 'dit' if any(n in m.get('loaded_by', []) for n in ('UNETLoader', 'UnetLoaderGGUF', 'CheckpointLoaderSimple', 'SeedVR2LoadDiTModel')) else 'clip_vision' if 'CLIPVisionLoader' in m.get('loaded_by', []) else ROLE.get((m.get('input') or ['aux'])[0], 'aux')
        if r == 'dit' and re.search(r'high_noise|HighNoise', f): r = 'dit_high'
        elif r == 'dit' and re.search(r'low_noise|LowNoise', f): r = 'dit_low'
        k, n = r, 2
        while k in out: k, n = f'{r}{n}', n + 1
        out[k] = f
    return out

def variants_for(models, wf):
    """workflows[graph].variants: nvidia-x64 = the graph as it is (default), nvidia-arm64 inherits it, mac-arm64 = the role swap or null, cpu only for small graphs."""
    by = {m['file']: m for m in models}
    for f, e in wf.items():
        if not e['models']: continue
        roles = roles_of(models, e['models'])
        v = {'nvidia-x64': {'files': roles, 'default': True}, 'nvidia-arm64': {'inherit': 'nvidia-x64'}}
        blocked = [x for x in e['models'] if MAC_BLOCKED.search(x)]
        if not blocked: v['mac-arm64'] = {'inherit': 'nvidia-x64'}
        elif all(x in MAC_SWAPS for x in blocked):
            swap = {r: MAC_SWAPS[x] for r, x in roles.items() if x in MAC_SWAPS}
            files = {**roles, **swap}; sz = lambda x: (by[x].get('size') or (MAC_FILES[x][2] if x in MAC_FILES else 0) or 0) / 1e9
            # memory: the same formula as wf_meta (largest resident DiT or the text encoder, + VAE + aux + activations), on the swapped files
            dits = [sz(x) for r, x in files.items() if r.startswith('dit')]; te = max([sz(x) for r, x in files.items() if r.startswith('te')] or [0])
            other = sum(sz(x) for r, x in files.items() if not r.startswith(('dit', 'te', 'lora'))); loras = sum(sz(x) for r, x in files.items() if r.startswith('lora'))
            act = 4.0 if '(video)' in e.get('vram_basis', '') else 1.5
            mem = round(max(max(dits or [0]) + loras, te) + other + act, 1)
            v['mac-arm64'] = {'files': files, 'replaces': {r: roles[r] for r in swap}, 'format': '+'.join(sorted({'gguf' if x.endswith('.gguf') else 'fp16/bf16' for x in swap.values()})),
                              'downloadGB': round(sum(sz(x) for x in swap.values()), 2), 'memGB': mem, 'needsNodes': ['UnetLoaderGGUF'] if any(x.endswith('.gguf') for x in swap.values()) else [],
                              'verified': False, 'source': 'hardware plan §1 (2026-10-31); files: Hugging Face API tree listing'}
        else: v['mac-arm64'] = None
        v['cpu'] = {'inherit': 'nvidia-x64'} if e.get('vram_est_gb', 99) <= 2 else None
        e['variants'] = v

# Notes written by hand before, kept in the generator so a re-run doesn't drop them.
WF_NOTES = {'workflows/object-swap-wan-animate-api.json': 'Same model set as object-swap-api.json. Variants workflows/object-swap-wan-animate/ext-0..6.json and mask-ext-1.json use the same files. Sizes/sha256 re-checked 2026-10-17 by HF HEAD (x-linked-size / x-linked-etag); files not downloaded.'}
LTX25_GGUF_MPS = 'GGUF Q4_K_M transformer (ComfyUI-GGUF), dequantised per layer; start ComfyUI with --use-split-cross-attention (LTX-2.5 gives black frames on MPS otherwise)'
# Model files a custom node finds by itself (no file name in the workflow): file -> (workflow, node class, input that picks it).
PACK_MODELS = {
 'Qwen3-TTS-12Hz-1.7B-CustomVoice/model.safetensors': ('workflows/voice-qwen3tts-api.json', 'FB_Qwen3TTSCustomVoice', 'model_choice'),
 'Qwen3-TTS-12Hz-1.7B-CustomVoice/speech_tokenizer/model.safetensors': ('workflows/voice-qwen3tts-api.json', 'FB_Qwen3TTSCustomVoice', 'model_choice'),
}
# Files the pack auto-downloads by itself on first use (still listed so offline installs can pre-seed them).
AUTO = {'depth_anything_v2_vits.pth','yolox_l.onnx','dw-ll_ucoco_384_bs5.torchscript.pt','rife49.pth','sam2_hiera_base_plus.safetensors','BiRefNet-general.safetensors','ema_vae_fp16.safetensors','seedvr2_ema_3b_fp8_e4m3fn.safetensors','seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors'}

def workflow_files():
    fs = glob.glob(os.path.join(ROOT,'workflows','*-api.json'))+glob.glob(os.path.join(ROOT,'workflows','object-swap','*.json'))+glob.glob(os.path.join(ROOT,'workflows','motion-transfer','*.json'))+glob.glob(os.path.join(ROOT,'plugins','*','workflow.json'))
    return sorted(fs)

def collect():
    refs = {}
    for f in workflow_files():
        rel = os.path.relpath(f, ROOT); d = json.load(open(f))
        for nid, n in d.items():
            if not isinstance(n, dict) or 'class_type' not in n: continue
            for k, v in n.get('inputs', {}).items():
                if isinstance(v, str) and EXT.search(v):
                    r = refs.setdefault(v, {'file': v, 'inputs': set(), 'nodes': set(), 'workflows': set()})
                    r['inputs'].add(k); r['nodes'].add(n['class_type']); r['workflows'].add(rel)
    for v, (base, graphs) in SOUL_LOOK_LORAS.items():
        r = refs.setdefault(v, {'file': v, 'inputs': set(), 'nodes': set(), 'workflows': set()}); r['inputs'].add('lora_name'); r['nodes'].add('LoraLoaderModelOnly'); r['base'] = base
        for g in graphs: r['workflows'].add(f'workflows/{g}-api.json (preset LoRA)')
    for v, (wf, node, inp) in PACK_MODELS.items():
        r = refs.setdefault(v, {'file': v, 'inputs': set(), 'nodes': set(), 'workflows': set()}); r['inputs'].add(inp); r['nodes'].add(node); r['workflows'].add(wf)
    return refs

def template_urls():
    m = {}
    for f in glob.glob(os.path.join(ROOT,'workflows','templates','*.json'))+glob.glob(os.path.join(ROOT,'workflows','*-ui.json')):
        for x in re.finditer(r'"name"\s*:\s*"([^"]+)"\s*,\s*"url"\s*:\s*"([^"]+)"(?:\s*,\s*"directory"\s*:\s*"([^"]+)")?', open(f).read()):
            m.setdefault(x.group(1), []).append((x.group(2), x.group(3)))
    return m

class NoRedir(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
OPENER = urllib.request.build_opener(NoRedir)
def head(url):
    req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'openhiggsfield-manifest'})
    tok = os.environ.get('HF_TOKEN')
    if tok and 'huggingface.co' in url: req.add_header('Authorization', 'Bearer '+tok)
    try: r = OPENER.open(req, timeout=30); return r.status, dict(r.headers)
    except urllib.error.HTTPError as e: return e.code, dict(e.headers or {})
    except Exception as e: return 0, {'error': str(e)}

CIVITAI_DL = re.compile(r'https://civitai\.com/api/download/models/(\d+)')
def civitai_probe(url, vid):
    """Civitai: name/size/sha256 from the public model-versions API (metadata only); HEAD of the download URL tells if CIVITAI_TOKEN is needed."""
    out = {'url': url, 'civitai_version': int(vid)}
    try:
        d = json.load(urllib.request.urlopen(urllib.request.Request(f'https://civitai.com/api/v1/model-versions/{vid}', headers={'User-Agent': 'openhiggsfield-manifest'}), timeout=30))
        f = next((x for x in d.get('files', []) if x.get('primary')), (d.get('files') or [None])[0]) or {}
        out.update({'repo_file': f.get('name'), 'size': int(round(f['sizeKB']*1024)) if f.get('sizeKB') else None,
                    'sha256': (f.get('hashes', {}).get('SHA256') or '').lower() or None, 'civitai_model': d.get('modelId'), 'base_model': d.get('baseModel')})
    except Exception as e: out['metadata_error'] = str(e)
    st, _ = head(url); out['http'] = st
    out['status'] = 'ok' if st in (200, 302, 307) else ('auth-required (CIVITAI_TOKEN)' if st in (401, 403) else f'error-{st}')
    if out['status'].startswith('auth') and out.get('sha256'): out['status'] = 'ok-metadata (download needs CIVITAI_TOKEN)'
    return out

def probe(url):
    m = CIVITAI_DL.match(url)
    if m: return civitai_probe(url, m.group(1))
    st, h = head(url); h = {k.lower(): v for k, v in h.items()}
    if st == 307 and h.get('location', '').startswith('/'):  # HF repo renamed: follow to canonical URL
        p = probe('https://huggingface.co' + h['location']); p['renamed_from'] = url; return p
    out = {'url': url, 'http': st}
    if st in (200, 302, 307):
        size = h.get('x-linked-size') or h.get('content-length'); et = (h.get('x-linked-etag') or h.get('etag') or '').strip('"').replace('W/', '')
        out['status'] = 'ok'; out['size'] = int(size) if size else None
        out['sha256'] = et if re.fullmatch(r'[0-9a-f]{64}', et) else None
        if st != 200 and h.get('location') and 'github' in url:
            s2, h2 = head(h['location']); h2 = {k.lower(): v for k, v in h2.items()}
            if h2.get('content-length'): out['size'] = int(h2['content-length'])
    elif st in (401, 403): out['status'] = 'gated' if 'gated' in (h.get('x-error-message','')+h.get('x-error-code','')).lower() or st == 403 else 'auth-required'
    elif st == 404: out['status'] = '404'
    else: out['status'] = f'error-{st}'
    return out

def repo_of(url):
    m = re.match(r'https://huggingface.co/([^/]+/[^/]+)/resolve/([^/]+)/(.+)', url)
    return (m.group(1), m.group(2), m.group(3)) if m else (None, None, None)

def build(offline=False):
    prev = {}
    if offline and os.path.exists(OUT): prev = {m['file']: m for m in json.load(open(OUT))['models']}
    refs, tpl = collect(), template_urls(); models = []
    for name in sorted(refs):
        r = refs[name]; cands = OVERRIDES.get(name, []) + [(u, d) for u, d in tpl.get(name, [])]
        seen = []; best = None
        for c in cands:
            u, d = c[0], c[1]
            if u in [s['url'] for s in seen]: continue
            p = prev.get(name) if offline else probe(u)
            if offline:
                best = p; k = c[2] if len(c) > 2 else {}
                if best and k.get('size') and not best.get('size'): best = {**best, 'size': k['size'], 'size_gb': round(k['size'] / 1e9, 2), **({'note': k['note']} if k.get('note') and not best.get('note') else {})} # offline: an override fills a size the old row lacks
                if best and k.get('page_url'): best = {**best, 'page_url': k['page_url']}
                break
            p['folder'] = d; seen.append(p)
            if p['status'].startswith('ok'): best = p; break
        if offline:
            if not best and OVERRIDES.get(name):
                o = OVERRIDES[name][0]; k = o[2] if len(o) > 2 else {}; repo, rev, rpath = repo_of(o[0])
                best = {'file': name, 'folder': o[1], 'hf_repo': repo, 'revision': rev, 'repo_path': rpath, 'url': o[0], 'size': k.get('size'), 'size_gb': round(k['size'] / 1e9, 2) if k.get('size') else None, 'sha256': k.get('sha256'),
                        'renamed_from': k.get('renamed_from'), 'head_status': k.get('head_status', 'not probed (offline; run npm run models:manifest)'), **({'note': k['note']} if k.get('note') else {}), **({'page_url': k['page_url']} if k.get('page_url') else {})}
            m = dict(best) if best else {'file': name, 'folder': None, 'url': None, 'size': None, 'sha256': None, 'head_status': 'unknown (not in models.json; run npm run models:manifest)'}
            m['workflows'] = sorted(r['workflows']); m.setdefault('loaded_by', sorted(r['nodes'])); m.setdefault('input', sorted(r['inputs']))
            models.append(m); continue
        if not best: best = seen[0] if seen else {'url': None, 'status': 'no-url', 'folder': None}
        repo, rev, path = repo_of(best.get('url') or '')
        models.append({'file': name, 'folder': best.get('folder'), 'hf_repo': repo, 'revision': rev, 'repo_path': path,
            'url': best.get('url'), 'size': best.get('size'), 'size_gb': round(best['size']/1e9, 2) if best.get('size') else None,
            'sha256': best.get('sha256'), 'repo_file': best.get('repo_file'), 'civitai_version': best.get('civitai_version'), 'renamed_from': best.get('renamed_from'), 'head_status': best.get('status'), 'http': best.get('http'),
            'auto_downloaded_by_pack': name in AUTO, 'tried': [{'url': s['url'], 'status': s['status']} for s in seen if s is not best],
            'loaded_by': sorted(r['nodes']), 'input': sorted(r['inputs']), 'workflows': sorted(r['workflows']),
            **({'page_url': ov[0][2]['page_url']} if (ov := OVERRIDES.get(name)) and len(ov[0]) > 2 and ov[0][2].get('page_url') else {})})
    return models

def add_bases(models):
    """`base` on every LoRA row: the soul looks' own base, else the base family of the DiT files in the graphs that load it (BASES); null when unknown."""
    dits = {}
    for m in models:
        if any(n in m.get('loaded_by', []) for n in ('UNETLoader', 'UnetLoaderGGUF', 'CheckpointLoaderSimple')):
            for f in m['workflows']: dits.setdefault(f, []).append(m['file'])
    for m in models:
        if 'lora_name' not in m.get('input', []): continue
        if m['file'] in SOUL_LOOK_LORAS: m['base'] = SOUL_LOOK_LORAS[m['file']][0]; continue
        fams = sorted({b for f in m['workflows'] for d in dits.get(f, []) for rx, b in BASES if re.search(rx, d)})
        m['base'] = fams[0] if len(fams) == 1 else (fams or None)

def wf_index(models):
    w = {}
    for m in models:
        for f in m['workflows']:
            if f.endswith(')'): continue  # 'workflows/soul-zit-api.json (preset LoRA)': a file the graph may load, not a graph of its own
            e = w.setdefault(f, {'models': [], 'total_gb': 0.0}); e['models'].append(m['file']); e['total_gb'] = round(e['total_gb'] + (m.get('size_gb') or 0), 2)
    return dict(sorted(w.items()))

SOURCES = {
 'mps-fp8': 'https://github.com/pytorch/pytorch/issues/132624 (MPS has no float8 dtypes); https://github.com/Comfy-Org/ComfyUI/issues/9255 (Wan2.2 fp8 template fails on Apple Silicon)',
 'mps-fp8-workaround': 'https://github.com/Comfy-Org/ComfyUI/issues/5533 (use fp16/bf16 or GGUF, or PYTORCH_ENABLE_MPS_FALLBACK=1 / --cpu, very slow)',
 'nvfp4': 'https://blog.comfy.org/p/new-comfyui-optimizations-for-nvidia (NVFP4 accelerated only on Blackwell + cu130; elsewhere dequantized, up to 2x slower than fp8)',
 'int8-convrot': 'https://github.com/Comfy-Org/comfy-quants/blob/main/docs/quantization/README.md (INT8 tensorwise/ConvRot native in ComfyUI>=0.27, CUDA SM>=7.5; other hardware dequantizes); https://github.com/Comfy-Org/ComfyUI/issues/14824 (slower than fp8 on A100)',
 'vram-guidance': 'https://modelvram.com/image-video-vram-calculator/ (Wan2.2 A14B fp8 720p/81f 14.9-19.0 GB; LTX-2 19B fp8 1280x720/121f 27.2-30.2 GB; FLUX.2 dev fp8 35-37 GB at 1MP with encoder swapped out); https://docs.comfy.org/tutorials/video/wan/wan2_2 (one 14B expert resident at a time, native offloading)',
 'mps-bf16': 'https://developer.apple.com/documentation/metalperformanceshaders/mpsdatatype (bfloat16 on MPS needs macOS 14+; PyTorch errors on older macOS)',
}
ROLE = {'unet_name': 'dit', 'ckpt_name': 'dit', 'model': 'dit', 'text_encoder': 'te', 'clip_name': 'te', 'clip_name1': 'te', 'clip_name2': 'te', 'lora_name': 'lora', 'vae_name': 'vae'}
def wf_meta(models, wf):
    by = {m['file']: m for m in models}
    for f, e in wf.items():
        ms = [by[x] for x in e['models']]; g = lambda m: m.get('size_gb') or 0
        role = lambda m: 'dit' if any(n in m['loaded_by'] for n in ('UNETLoader', 'UnetLoaderGGUF', 'CheckpointLoaderSimple', 'SeedVR2LoadDiTModel')) else ROLE.get(m['input'][0], 'aux')
        dits = sorted([g(m) for m in ms if role(m) == 'dit'], reverse=True); te = max([g(m) for m in ms if role(m) == 'te'] or [0])
        loras = sum(g(m) for m in ms if role(m) == 'lora'); vae = sum(g(m) for m in ms if role(m) == 'vae'); aux = sum(g(m) for m in ms if role(m) == 'aux')
        video = any(k in f for k in ('h3-', 'camera', 'motion', 'object-swap', 'reshoot', 'restyle', 'upscale-', 'photo-fx', 'wan22-', 'ltx25-')) and 'image-upscale' not in f
        act = 4.0 if video else 1.5
        # Wan2.2 two-expert graphs (high/low noise): ComfyUI keeps one expert resident (vram-guidance)
        resident = (dits[0] if dits else 0) + loras / (2 if len(dits) > 1 and 'wan2.2' in ' '.join(e['models']) else 1)
        peak = round(max(resident, te) + vae + aux + act, 1)
        names = ' '.join(e['models']).lower(); mps, notes = 'green', []
        if 'fp8' in names: mps = 'red'; notes.append('fp8 weights: MPS has no float8 dtype -> TypeError on load; needs fp16/bf16/GGUF swap or CPU fallback [mps-fp8, mps-fp8-workaround]')
        # 2026-10-25: same rule as server/src/hardware/macWeights.ts. nvfp4 (fp8 block scales) and w4a8 (GPTQ int4 weights, int8 activations) need CUDA kernels: red on MPS.
        if 'nvfp4' in names: mps = 'red'; notes.append('nvfp4 weights: fp4 values with fp8 block scales; MPS has no float8 dtype [nvfp4, mps-fp8]')
        if re.search(r'(^|[_.-])w\da\d+([_.-]|$)', names): mps = 'red'; notes.append('w4a8 / w6a8 weights: low-bit CUDA kernels, no MPS path')
        if 'int8_convrot' in names: mps = 'red' if mps == 'red' else 'amber'; notes.append('int8 ConvRot: CUDA kernels; MPS would hit the eager dequant path (slow, unverified) [int8-convrot]')
        if 'bf16' in names: notes.append('bf16 files: MPS bf16 requires macOS 14+ [mps-bf16]'); mps = mps if mps != 'green' else 'amber'
        if 'ltx-2.5' in names and '.gguf' in names: notes.append(LTX25_GGUF_MPS)
        if 'yolox' in names: notes.append('DWPose yolox/torchscript: runs via onnxruntime/torchscript on CPU on Mac (slow but works)')
        if 'sam2' in names: notes.append('SAM2: kijai pack supports mps device but bf16/fp16 autocast varies; use fp32 on MPS')
        if 'rife' in names: notes.append('RIFE VFI: pure PyTorch, works on MPS/CPU')
        if peak > 64 and mps != 'red': mps = 'amber'; notes.append('needs >64 GB unified memory')
        e.update({'vram_est_gb': peak, 'vram_basis': f'max(resident DiT {resident:.1f}, text encoder {te:.1f} offloaded after encode) + VAE {vae:.1f} + aux {aux:.1f} + activations {act} GB ({"video" if video else "image/audio"})',
                  'fits': {'24GB': peak <= 24, '32GB': peak <= 32, '80GB': peak <= 80}, 'mps': mps, 'mps_notes': notes})

def download(models, comfy, only):
    import shutil
    for m in models:
        if only and not set(m['workflows']) & only: continue
        civ = 'civitai.com' in (m.get('url') or '')
        if m.get('head_status') != 'ok' and not (civ and str(m.get('head_status')).startswith('ok') and os.environ.get('CIVITAI_TOKEN')): print('SKIP', m['file'], m.get('head_status')); continue
        if not m.get('folder'): print('SKIP', m['file'], 'no folder'); continue
        fold = m['folder'] if m['folder'].startswith('custom_nodes/') else 'models/' + m['folder']
        dst = os.path.join(comfy, fold, m['file']); os.makedirs(os.path.dirname(dst), exist_ok=True)
        if os.path.exists(dst) and (not m.get('size') or os.path.getsize(dst) == m['size']): print('have', dst); continue
        print('get ', m['url'], '->', dst)
        req = urllib.request.Request(m['url'], headers={'User-Agent': 'openhiggsfield-manifest', **({'Authorization': 'Bearer '+os.environ['HF_TOKEN']} if os.environ.get('HF_TOKEN') and not civ else {}), **({'Authorization': 'Bearer '+os.environ['CIVITAI_TOKEN']} if civ and os.environ.get('CIVITAI_TOKEN') else {})})
        h = hashlib.sha256()
        with urllib.request.urlopen(req) as r, open(dst + '.part', 'wb') as o:
            while True:
                b = r.read(1 << 20)
                if not b: break
                h.update(b); o.write(b)
        if m.get('sha256') and h.hexdigest() != m['sha256']: os.remove(dst + '.part'); sys.exit(f'sha256 mismatch {m["file"]}')
        os.replace(dst + '.part', dst)

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--download'); ap.add_argument('--only'); ap.add_argument('--offline', action='store_true'); a = ap.parse_args()
    models = build(a.offline)
    extra = json.load(open(OUT)).get('workflows_meta', {}) if os.path.exists(OUT) else {}
    meta_path = os.path.join(ROOT, 'readiness', 'manifest', 'vram-mps.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    variant_rows(models); add_bases(models); wf = wf_index(models); wf_meta(models, wf); variants_for(models, wf)
    for f, p in PACK_WORKFLOWS.items():
        wf[f] = {'models': [], 'total_gb': 0.0, 'vram_est_gb': p['vram_est_gb'], 'vram_basis': 'weights the node pack downloads itself + activations 1.5 GB (image/audio), an estimate',
                 'fits': {'24GB': True, '32GB': True, '80GB': True}, 'mps': 'green', 'mps_notes': [], 'note': p['note']}
    for f, n in WF_NOTES.items():
        if f in wf: wf[f]['note'] = n
    wf = dict(sorted(wf.items()))
    for f, e in wf.items(): e.update(meta.get('workflows', {}).get(os.path.basename(f), {}))
    json.dump({'generated_by': 'npm run models:manifest', 'note': 'size/sha256 from Hugging Face LFS headers on HEAD; vram/mps from readiness/manifest/vram-mps.json', 'sources': SOURCES,
               'models': models, 'workflows': wf}, open(OUT, 'w'), indent=1)
    bad = [m for m in models if m.get('head_status') != 'ok']
    print(f'{len(models)} models, {len(bad)} not ok:', [(m['file'], m.get('head_status')) for m in bad])
    if a.download: download(models, a.download, set(x if '/' in x else 'workflows/'+x for x in a.only.split(',')) if a.only else None)
