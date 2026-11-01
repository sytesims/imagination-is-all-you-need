# Attribution check (P0)

Checked 2026-10-17 against each licence's official text. For every model: what its licence requires us to show in the app, the credit line we show, and the clause it comes from.
Served live on `GET /api/models/:id` → `attribution {status, lines[], requiredText[], encouragedLines[], verified, parts[{licenseId, status, line, level, requiredText, source{url, clause, checkedAt}}]}` and `creditLine` (the line to show or null). Source: `server/src/attribution.ts` + `server/src/licenses.ts`. Regenerate: `cd server && npx tsx ../scripts/gen-attribution.mts`.

**status**: `required` = the licence requires something in the app (Licences page, model page, footer); **level** says whether the shown line itself is `required` or only `encouraged` (then **requires** names what is required); `none` = the text asks for no in-app line (notices travel only with redistributed weights); `unverified` = the text could not be read or was not checked.

## Credit lines shown

| Line | Level | Licence requires | Licence (models) | Clause | Source |
|---|---|---|---|---|---|
| **Powered by MiniMax H3** | encouraged | “MiniMax H3” in the UI | minimax-community-akatz-charswap (comfy-h3-charswap, cloud-h3-two-swap) | §IV.2 (required): “You shall prominently display “MiniMax H3”on the user interface of commercial product or service that uses MiniMax H3 or MiniMax H3 Works.” §III.3(a) (encouraged, not required): display a notice that the product or service is “Powered by MiniMax H3”. So the name “MiniMax H3” is required in the UI and the “Powered by MiniMax H3” credit is encouraged; we show the credit line, which also displays the required name. (Licence text checked 2026-10-17; same text as the base licence.) | https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA/raw/main/LICENSE |
| **Powered by MiniMax H3** | encouraged | “MiniMax H3” in the UI | minimax-community (comfy-h3-restyle, comfy-h3-vfx, cloud-h3-crossview, comfy-h3-camera, comfy-h3, cloud-h3, cloud-h3-wf, cloud-h3-fast, comfy-h3-pika, cloud-h3-keyframes, comfy-h3-extend, comfy-h3-lipsync) | §IV.2 (required): “You shall prominently display “MiniMax H3”on the user interface of commercial product or service that uses MiniMax H3 or MiniMax H3 Works.” §III.3(a) (encouraged, not required): display a notice that the product or service is “Powered by MiniMax H3”. So the name “MiniMax H3” is required in the UI and the “Powered by MiniMax H3” credit is encouraged; we show the credit line, which also displays the required name. (Licence text checked 2026-10-17.) | https://huggingface.co/MiniMaxAI/MiniMax-H3/raw/main/LICENSE |
| **Powered by MiniMax-Music3** | encouraged | “MiniMax-Music3” in the UI | minimax-music3-community (comfy-minimax-music3, cloud-minimax-music) | Commercial products credit MiniMax-Music3 in their interface; over US$20M yearly revenue needs written permission; an acceptable use policy applies. The Comfy-Org repack card says apache-2.0, the upstream LICENSE file governs. | https://huggingface.co/MiniMaxAI/MiniMax-Music3/raw/main/LICENSE |
| **Powered by Stability AI** | required | “Powered by Stability AI” in the UI | stability-community (comfy-stable-audio) | IV(a)(iii): prominently display “Powered by Stability AI” on a related website, user interface, blogpost, about page, or product documentation (when distributing the model or a product using it). | https://stability.ai/community-license-agreement |
| **Built with Fish Audio** | required | “Built with Fish Audio” in the UI | fish-community (comfy-drama3) | IV(a): a product or service that uses the Fish Audio Materials shall prominently display “Built with Fish Audio”. | https://huggingface.co/fishaudio/drama-3/raw/main/LICENSE |

## Every model

| Model (providerId) | Status | Lines | Licence parts → status |
|---|---|---|---|
| Kling 3.0 Omni Edit (hosted) (`router-kling-edit`) | unverified (not fully verified) | — | proprietary → unverified |
| Seedance 2.5 Edit (hosted) (`router-seedance-25-edit`) | unverified (not fully verified) | — | proprietary → unverified |
| Seedance (hosted) (`router-seedance`) | unverified (not fully verified) | — | proprietary → unverified |
| Open weights (ComfyUI workflow) (`comfy-open`) | none | — | apache-2.0 → none, ltx-2-community → none, gemma → none, mit → none |
| H3 Character Swap LoRA v1.5 (`comfy-h3-charswap`) | required | Powered by MiniMax H3 (encouraged; requires “MiniMax H3”) | minimax-community-akatz-charswap → required |
| Wan Animate 2 · Comfy Cloud (`cloud-wan-animate2`) | none | — | apache-2.0 → none |
| MiniMax H3 Style Transfer (`comfy-h3-restyle`) | required (not fully verified) | Powered by MiniMax H3 (encouraged; requires “MiniMax H3”) | minimax-community → required, alissonerdx-unspecified → unverified |
| MiniMax H3 VFX Edit (`comfy-h3-vfx`) | required (not fully verified) | Powered by MiniMax H3 (encouraged; requires “MiniMax H3”) | minimax-community → required, alissonerdx-unspecified → unverified |
| Veo (hosted) (`router-veo`) | unverified (not fully verified) | — | proprietary → unverified |
| Open weights · Wan Fun Camera (fallback) (`comfy-funcamera`) | none | — | apache-2.0 → none |
| LTX-2 19B re-shoot · Comfy Cloud workflow (`cloud-reshoot`) | none | — | ltx-2-community → none |
| New angle · H3 CrossView · cloud (`cloud-h3-crossview`) | required | Powered by MiniMax H3 (encouraged; requires “MiniMax H3”) | minimax-community → required |
| MiniMax H3 · partner API (`api-minimax-h3`) | unverified (not fully verified) | — | proprietary → unverified |
| MiniMax H3 Camera Motion (`comfy-h3-camera`) | required | Powered by MiniMax H3 (encouraged; requires “MiniMax H3”) | minimax-community → required, h3-camera-motion-civitai → none |
| LTX-2 19B camera · Comfy Cloud workflow (`cloud-ltx-camera`) | none | — | ltx-2-community → none |
| LTX-2.5 22B (`comfy-ltx25-video`) | unverified (not fully verified) | — | ltx-2x-community → unverified, apache-2.0 → none |
| Real-ESRGAN x2 (`comfy-video-esrgan`) | none | — | bsd-3-clause → none |
| 4x-UltraSharp (`comfy-video-ultrasharp`) | none | — | ultrasharp-nc → none |
| SeedVR2 (`comfy-seedvr2`) | none | — | apache-2.0 → none |
| Topaz Starlight Fast (`cloud-topaz-starlight-fast`) | unverified (not fully verified) | — | proprietary → unverified |
| Topaz Starlight Precise 2.5 (`cloud-topaz-precise`) | unverified (not fully verified) | — | proprietary → unverified |
| FLUX Video Upscale (`direct-flux3-upscale`) | unverified (not fully verified) | — | proprietary → unverified |
| Topaz Astra 2 (`cloud-topaz-astra2`) | unverified (not fully verified) | — | proprietary → unverified |
| Topaz Starlight Creative (`cloud-topaz-creative`) | unverified (not fully verified) | — | proprietary → unverified |
| Crystal Video Upscaler (`router-crystal-video`) | unverified (not fully verified) | — | proprietary → unverified |
| Google Nano Banana 2 (hosted) (`api-nano-banana`) | unverified (not fully verified) | — | proprietary → unverified |
| OpenAI GPT Image (hosted) (`api-gpt-image`) | unverified (not fully verified) | — | proprietary → unverified |
| FLUX 3 Image Klein (`comfy-flux3-klein`) | unverified (not fully verified) | — | flux-kommunity → unverified |
| ByteDance Seedream (hosted) (`api-seedream`) | unverified (not fully verified) | — | proprietary → unverified |
| BFL Flux.2 (hosted) (`api-flux2`) | unverified (not fully verified) | — | proprietary → unverified |
| FLUX.2 [flex] (BFL direct API) (`direct-flux2-flex`) | unverified (not fully verified) | — | proprietary → unverified |
| Ideogram V4 (hosted) (`api-ideogram`) | unverified (not fully verified) | — | proprietary → unverified |
| FLUX.2 [klein] 9B (BFL direct API) (`direct-flux2-klein-9b`) | unverified (not fully verified) | — | proprietary → unverified |
| MiniMax image-01 (direct API) (`direct-minimax-image`) | unverified (not fully verified) | — | proprietary → unverified |
| Nano Banana 2 Lite (Gemini API) (`direct-gemini-nb2-lite`) | unverified (not fully verified) | — | proprietary → unverified |
| Recraft V4 (hosted) (`api-recraft`) | unverified (not fully verified) | — | proprietary → unverified |
| Luma Image (hosted) (`api-luma-image`) | unverified (not fully verified) | — | proprietary → unverified |
| Kling Omni Image (hosted) (`api-kling-image`) | unverified (not fully verified) | — | proprietary → unverified |
| Krea 3 (hosted) (`api-krea`) | unverified (not fully verified) | — | proprietary → unverified |
| Runway Image (hosted) (`api-runway-image`) | unverified (not fully verified) | — | proprietary → unverified |
| Grok Image (hosted) (`api-grok-image`) | unverified (not fully verified) | — | proprietary → unverified |
| Qwen Image (Alibaba API) (hosted) (`api-qwen-image`) | unverified (not fully verified) | — | proprietary → unverified |
| Wan Image (Alibaba API) (hosted) (`api-wan-image`) | unverified (not fully verified) | — | proprietary → unverified |
| Tencent Hunyuan Image (hosted) (`api-hunyuan-image`) | unverified (not fully verified) | — | proprietary → unverified |
| Meta Muse Image (hosted) (`api-meta-muse`) | unverified (not fully verified) | — | proprietary → unverified |
| OpenAI GPT Image 2.5 Flare (hosted) (`api-gpt-image-25-flare`) | unverified (not fully verified) | — | proprietary → unverified |
| OpenAI GPT Image 2.5 Sunburst (hosted) (`api-gpt-image-25-sunburst`) | unverified (not fully verified) | — | proprietary → unverified |
| Google Nano Banana 2.1 (hosted) (`api-nano-banana-21`) | unverified (not fully verified) | — | proprietary → unverified |
| Google Nano Banana Pro (hosted) (`api-nano-banana-pro`) | unverified (not fully verified) | — | proprietary → unverified |
| BFL FLUX 3 Image (hosted) (`api-flux3-image`) | unverified (not fully verified) | — | proprietary → unverified |
| BFL Flux.2 [max] (hosted) (`api-flux2-max`) | unverified (not fully verified) | — | proprietary → unverified |
| ByteDance Seedream 5.0 Flash (hosted) (`api-seedream-flash`) | unverified (not fully verified) | — | proprietary → unverified |
| Ideogram 4.5 (hosted) (`api-ideogram-45`) | unverified (not fully verified) | — | proprietary → unverified |
| Qwen Image 3.0 Pro (Alibaba API) (hosted) (`api-qwen-image-pro`) | unverified (not fully verified) | — | proprietary → unverified |
| Recraft V4.1 (hosted) (`api-recraft-41`) | unverified (not fully verified) | — | proprietary → unverified |
| Recraft V4.1 Pro (hosted) (`api-recraft-41-pro`) | unverified (not fully verified) | — | proprietary → unverified |
| Luma UNI-1 Max (hosted) (`api-luma-uni1-max`) | unverified (not fully verified) | — | proprietary → unverified |
| OpenAI GPT Image 1.5 (hosted) (`api-gpt-image-15`) | unverified (not fully verified) | — | proprietary → unverified |
| ByteDance Seedream 4.5 (hosted) (`api-seedream-45`) | unverified (not fully verified) | — | proprietary → unverified |
| Grok Imagine Image Pro (hosted) (`api-grok-image-pro`) | unverified (not fully verified) | — | proprietary → unverified |
| Bria FIBO 2.0 (hosted) (`api-bria-fibo2`) | unverified (not fully verified) | — | proprietary → unverified |
| Qwen Image 2.1 (open weights, research licence) (`comfy-qwen21`) | none | — | qwen-research → none, mit → none |
| Qwen Image 2.1 Turbo (open weights, research licence) (`comfy-qwen21-turbo`) | none | — | qwen-research → none |
| Qwen-Image / Qwen-Image-Edit-2509 (Apache-2.0) (`comfy-qwen-image`) | none | — | apache-2.0 → none |
| Z-Image-Turbo (`comfy-zimage-turbo`) | none | — | apache-2.0 → none |
| Z-Image (base) (`comfy-zimage`) | none | — | apache-2.0 → none |
| FLUX.2 [klein] 4B (`comfy-klein4b`) | none | — | apache-2.0 → none |
| FLUX.2 [dev] (`comfy-flux2dev`) | none | — | flux-dev-nc → none |
| MOSS-Image (`comfy-moss-image`) | none | — | apache-2.0 → none |
| MOSS-Image Base (`comfy-moss-image-base`) | none | — | apache-2.0 → none |
| MiniMax H3 (`comfy-h3`) | required | Powered by MiniMax H3 (encouraged; requires “MiniMax H3”) | minimax-community → required |
| Wan 2.2 5B (`comfy-wan22-5b`) | none | — | apache-2.0 → none |
| Kling (hosted) (`router-kling`) | unverified (not fully verified) | — | proprietary → unverified |
| Wan 3.0 (hosted) (`router-wan3`) | unverified (not fully verified) | — | proprietary → unverified |
| MiniMax H3 · Comfy Cloud (`cloud-h3`) | required | Powered by MiniMax H3 (encouraged; requires “MiniMax H3”) | minimax-community → required |
| MiniMax H3 · Comfy Cloud workflow (`cloud-h3-wf`) | required | Powered by MiniMax H3 (encouraged; requires “MiniMax H3”) | minimax-community → required |
| MiniMax H3 Fast · Comfy Cloud (`cloud-h3-fast`) | required | Powered by MiniMax H3 (encouraged; requires “MiniMax H3”) | minimax-community → required |
| Pika H3 Flex (`comfy-h3-pika`) | required | Powered by MiniMax H3 (encouraged; requires “MiniMax H3”) | minimax-community → required, apache-2.0 → none |
| MiniMax H3 Keyframes · Comfy Cloud (`cloud-h3-keyframes`) | required | Powered by MiniMax H3 (encouraged; requires “MiniMax H3”) | minimax-community → required |
| LTX-2.5 Pro (LTX API) (`direct-ltx-25-pro`) | unverified (not fully verified) | — | proprietary → unverified |
| LTX-2.5 Pro (hosted) (`router-ltx-25-pro`) | unverified (not fully verified) | — | proprietary → unverified |
| LTX-2.5 Fast (LTX API) (`direct-ltx-25-fast`) | unverified (not fully verified) | — | proprietary → unverified |
| FLUX 3 Video (BFL direct API) (`direct-flux3-video`) | unverified (not fully verified) | — | proprietary → unverified |
| FLUX 3 Video (hosted) (`router-flux3-video`) | unverified (not fully verified) | — | proprietary → unverified |
| LTX-2.3 Fast (LTX API) (`direct-ltx-23-fast`) | unverified (not fully verified) | — | proprietary → unverified |
| Seedance 2.5 (BytePlus ModelArk) (`direct-seedance-25`) | unverified (not fully verified) | — | proprietary → unverified |
| Seedance 2.0 Fast (BytePlus ModelArk) (`direct-seedance-20-fast`) | unverified (not fully verified) | — | proprietary → unverified |
| Seedance 2.0 Mini (BytePlus ModelArk) (`direct-seedance-20-mini`) | unverified (not fully verified) | — | proprietary → unverified |
| Seedance 2.5 (hosted) (`router-seedance-25`) | unverified (not fully verified) | — | proprietary → unverified |
| Seedance 2.0 Fast (hosted) (`router-seedance-20-fast`) | unverified (not fully verified) | — | proprietary → unverified |
| Seedance 2.0 Mini (hosted) (`router-seedance-20-mini`) | unverified (not fully verified) | — | proprietary → unverified |
| Veo 3.1 Fast (hosted) (`router-veo-fast`) | unverified (not fully verified) | — | proprietary → unverified |
| Wan 3.0 Prime (hosted) (`router-wan3-prime`) | unverified (not fully verified) | — | proprietary → unverified |
| Veo 3.1 Lite (hosted) (`router-veo-lite`) | unverified (not fully verified) | — | proprietary → unverified |
| P-Video-2 (hosted) (`router-pvideo2`) | unverified (not fully verified) | — | proprietary → unverified |
| Grok Imagine Video 1.5 Lite (hosted) (`router-grok-video-lite`) | unverified (not fully verified) | — | proprietary → unverified |
| Gemini Omni 1.1 Flash · Comfy Cloud (`cloud-gemini-omni`) | unverified (not fully verified) | — | proprietary → unverified |
| FLUX 3 Max · Comfy (`cloud-flux3-max`) | unverified (not fully verified) | — | proprietary → unverified |
| Kling 4.0 · Comfy Cloud (`cloud-kling4`) | unverified (not fully verified) | — | proprietary → unverified |
| LTX-2.5 22B (`comfy-ltx25-extend`) | unverified (not fully verified) | — | ltx-2x-community → unverified, apache-2.0 → none |
| MiniMax H3 Extend (`comfy-h3-extend`) | required | Powered by MiniMax H3 (encouraged; requires “MiniMax H3”) | minimax-community → required |
| Sonilo Music (`api-sonilo-music`) | unverified (not fully verified) | — | proprietary → unverified |
| ByteDance Seed Audio (`api-seed-audio`) | unverified (not fully verified) | — | proprietary → unverified |
| YuE2 (`comfy-yue2`) | none | — | yue2-weights → none |
| MiniMax Music 3 (open weights) (`comfy-minimax-music3`) | required | Powered by MiniMax-Music3 (encouraged; requires “MiniMax-Music3”) | minimax-music3-community → required |
| MiniMax Music 3 · Comfy Cloud workflow (`cloud-minimax-music`) | required | Powered by MiniMax-Music3 (encouraged; requires “MiniMax-Music3”) | minimax-music3-community → required |
| ACE-Step 1.5 (MIT) (`comfy-acestep`) | none | — | mit → none |
| ElevenLabs Sound Effects (`api-eleven-sfx`) | unverified (not fully verified) | — | proprietary → unverified |
| Stable Audio Open 1.0 (`comfy-stable-audio`) | required | Powered by Stability AI | stability-community → required |
| ElevenLabs TTS (`api-eleven-tts`) | unverified (not fully verified) | — | proprietary → unverified |
| ElevenLabs v3 TTS (`api-eleven-v3`) | unverified (not fully verified) | — | proprietary → unverified |
| ElevenLabs v4 Turbo TTS (`api-eleven-v4-turbo`) | unverified (not fully verified) | — | proprietary → unverified |
| MiniMax Speech 2.8 HD (direct API) (`direct-minimax-speech`) | unverified (not fully verified) | — | proprietary → unverified |
| MiniMax Speech 2.8 Turbo (direct API) (`direct-minimax-speech-turbo`) | unverified (not fully verified) | — | proprietary → unverified |
| Fish Audio TTS (`api-fish-tts`) | unverified (not fully verified) | — | proprietary → unverified |
| HeyGen TTS (`api-heygen-tts`) | unverified (not fully verified) | — | proprietary → unverified |
| Chatterbox TTS (`comfy-chatterbox`) | none | — | chatterbox → none |
| Qwen3 TTS 1.7B (`comfy-qwen3tts`) | none | — | apache-2.0 → none |
| Fish Audio Drama 3 (`comfy-drama3`) | required | Built with Fish Audio | fish-community → required |
| F5-TTS (`comfy-f5tts`) | none | — | f5-tts-weights → none, mit → none |
| Sonilo Video-to-Music (`api-sonilo-v2m`) | unverified (not fully verified) | — | proprietary → unverified |
| MMAudio (video-to-sound) (`comfy-mmaudio`) | none | — | mmaudio-weights → none, mit → none |
| Chatterbox VC (voice conversion) (`comfy-chatterbox-vc`) | none | — | chatterbox → none |
| Whisper → NLLB-200 → Chatterbox (translate) (`local-whisper-nllb-chatterbox`) | none | — | nllb-nc → none, faster-whisper → none, chatterbox → none |
| Whisper → NLLB-200 → F5-TTS (translate) (`local-whisper-nllb-f5`) | none | — | nllb-nc → none, faster-whisper → none, f5-tts-weights → none |
| MiniMax H3 Talking Photo (`comfy-h3-lipsync`) | required | Powered by MiniMax H3 (encouraged; requires “MiniMax H3”) | minimax-community → required, apache-2.0 → none |
| LTX-2.5 Talking Photo (`comfy-ltx25-lipsync`) | unverified (not fully verified) | — | ltx-2x-community → unverified, apache-2.0 → none |
| InfiniteTalk (Wan 2.1) · Comfy Cloud (`cloud-infinitetalk`) | none | — | apache-2.0 → none |
| SeedVR2 (WaveSpeed) (`router-seedvr2-upscale`) | unverified (not fully verified) | — | proprietary → unverified |
| Topaz Bloom 2 · Comfy Cloud (`cloud-topaz-bloom2`) | unverified (not fully verified) | — | proprietary → unverified |
| Crystal Upscaler (Clarity AI) (`api-crystal-upscale`) | unverified (not fully verified) | — | proprietary → unverified |
| Topaz Wonder 3.5 (`fal-topaz-wonder`) | unverified (not fully verified) | — | proprietary → unverified |
| Topaz Bloom 2 (`fal-topaz-bloom`) | unverified (not fully verified) | — | proprietary → unverified |
| Topaz Standard V2 (`fal-topaz-precision`) | unverified (not fully verified) | — | proprietary → unverified |
| SeedVR2 (fal) (`fal-seedvr2-upscale`) | unverified (not fully verified) | — | proprietary → unverified |
| Bria Increase Resolution (`fal-bria-upscale`) | unverified (not fully verified) | — | proprietary → unverified |
| SeedVR2 3B fp16 (native nodes) (`comfy-seedvr2-image`) | none | — | apache-2.0 → none |
| Z-Image-Turbo 2K upscaler (`comfy-zimage-upscale`) | none | — | apache-2.0 → none, bsd-3-clause → none |
| 4x Nomos2 DAT2 (CC-BY 4.0) (`comfy-nomos2`) | unverified (not fully verified) | — | cc-by-4.0 → unverified |
| Real-ESRGAN x2plus / x4plus (BSD-3-Clause) (`comfy-realesrgan`) | none | — | bsd-3-clause → none |
| 4x-UltraSharp (`comfy-ultrasharp`) | none | — | ultrasharp-nc → none |
| Z-Image-Turbo + look LoRAs (local ComfyUI) (`comfy-soul`) | unverified (not fully verified) | — | flux1-dev-nc → none, apache-2.0 → none, infiniteyou-nc → none, insightface-nc → unverified, aceplus-flux → unverified, civitai-lora → unverified |
| Tripo 3.1 (`cloud-tripo-31`) | unverified (not fully verified) | — | tripo-terms → unverified |
| TRELLIS.2 (`fal-trellis2`) | none | — | mit → none |
| Hunyuan 3D 3.1 (`fal-hunyuan3d-31`) | unverified (not fully verified) | — | tencent-hunyuan-3d → unverified |
| Pixal3D + TRELLIS.2 (`comfy-pixal3d-trellis2`) | unverified (not fully verified) | — | dinov3 → unverified, mit → none |
| Turntable (recorded in your browser) (`local-turntable`) | unverified (not fully verified) | — | agpl-3.0-or-later → unverified |
| Direct a Shot (drawn in your browser) (`local-previz`) | unverified (not fully verified) | — | agpl-3.0-or-later → unverified |
| LTX-2.5 + Layout to Render (`comfy-ltx25-layout`) | unverified (not fully verified) | — | ltx-2x-community → unverified, apache-2.0 → none |
| Luma Ray 3.2 Edit (hosted) (`router-ray32-edit`) | unverified (not fully verified) | — | proprietary → unverified |
| Runway Aleph 2 (hosted) (`router-aleph2`) | unverified (not fully verified) | — | proprietary → unverified |
| LTX-2.5 22B + Lightricks IC-LoRA (`comfy-ltx25-iclora`) | unverified (not fully verified) | — | ltx-2x-community → unverified, apache-2.0 → none |
| H3 Character Swap · two people · Comfy Cloud (`cloud-h3-two-swap`) | required | Powered by MiniMax H3 (encouraged; requires “MiniMax H3”) | minimax-community-akatz-charswap → required |
| Bernini-R · Comfy Cloud (`cloud-bernini-r`) | none | — | apache-2.0 → none |
| Kling 4.0 Edit · Comfy Cloud (`cloud-kling4-edit`) | unverified (not fully verified) | — | proprietary → unverified |
| Finish (ffmpeg on this computer) (`local-finish`) | unverified (not fully verified) | — | agpl-3.0-or-later → unverified |
| Auto (Luma Ray 3.2) (`auto-reframe`) | unverified (not fully verified) | — | proprietary → unverified |
| Luma Reframe (`direct-luma-reframe`) | unverified (not fully verified) | — | proprietary → unverified |
| BiRefNet (local, per frame) (`comfy-birefnet-video`) | none | — | birefnet-mit → none |
| ffmpeg HDR10 conversion (local, not AI) (`local-ffmpeg-hdr`) | none | — | apache-2.0 → none |
| RIFE 4.9 (local) (`comfy-rife`) | none | — | rife-mit → none |
| Depth Anything V2 Small (local, per frame) (`comfy-depth-anything-v2`) | none | — | depth-anything-v2-small-apache → none |
| Bria GenFill (`fal-bria-genfill`) | unverified (not fully verified) | — | proprietary → unverified |
| Qwen-Image-Edit-2509 + Multiple-angles LoRA (Apache-2.0) (`comfy-qwen-angles`) | none | — | apache-2.0 → none |
| Bria RMBG 2.0 (`fal-bria-rmbg`) | unverified (not fully verified) | — | proprietary → unverified |
| Ideogram Remove Background (`fal-ideogram-rmbg`) | unverified (not fully verified) | — | proprietary → unverified |
| Bria Expand (`fal-bria-expand`) | unverified (not fully verified) | — | proprietary → unverified |
| Ideogram 3.0 Reframe (`fal-ideogram-reframe`) | unverified (not fully verified) | — | proprietary → unverified |
| Bria Eraser (`fal-bria-eraser`) | unverified (not fully verified) | — | proprietary → unverified |
| fal Object Removal (`fal-object-removal`) | unverified (not fully verified) | — | proprietary → unverified |
| FASHN Virtual Try-On v1.6 (`fal-fashn-tryon`) | unverified (not fully verified) | — | proprietary → unverified |
| Bria Virtual Try-On (`router-bria-tryon`) | unverified (not fully verified) | — | proprietary → unverified |
| ByteDance Seedream 5.0 Flash · layers (hosted) (`api-seedream-layers-flash`) | unverified (not fully verified) | — | proprietary → unverified |
| ByteDance Seedream 5.0 Pro · layers (hosted) (`api-seedream-layers-pro`) | unverified (not fully verified) | — | proprietary → unverified |
| Qwen-Image-Layered (`comfy-qwen-image-layered`) | none | — | apache-2.0 → none |

## Components (not model cards)

Parts of a tool that carry their own licence (also on `/licenses` and in LICENSES.md).

| Tool | Component | Licence | Key terms | Source |
|---|---|---|---|---|
| canvas | tldraw 5.5.2 (the Canvas board: @tldraw/editor, @tldraw/store, @tldraw/tlschema, @tldraw/state, @tldraw/driver). Local use needs no key; a public deployment needs a tldraw licence key (VITE_TLDRAW_LICENSE_KEY). Full text: licenses/tldraw-LICENSE.md | tldraw license | Development use only without a licence key; production use needs a trial, hobby or commercial key. Do not disable or interfere with licence key enforcement or the watermark. Include a verbatim copy of the licence with any distribution. | https://github.com/tldraw/tldraw/blob/v5.5.2/LICENSE.md |
| canvas | Tiptap 3 (rich text inside tldraw text shapes, via tldraw) | MIT | — | https://github.com/ueberdosis/tiptap/blob/develop/LICENSE.md |
| canvas | Radix UI (menus and popovers inside tldraw, via tldraw) | MIT | — | https://github.com/radix-ui/primitives/blob/main/LICENSE |
| audio-player | YAMNet (Google AudioSet sound classifier, TF.js v1; shipped uint8-quantized in web/public/models/yamnet with its LICENSE and NOTICE.md). Hears the dance style of an audio result, in your browser only | Apache-2.0 | Keep the licence and the notice of changes (weights quantized to uint8). | https://www.kaggle.com/models/google/yamnet/tfJs/tfjs/1 |
| audio-player | YAMNet class names (yamnet_class_map.csv, tensorflow/models; labels from the AudioSet ontology, CC BY-SA 4.0) | Apache-2.0 | — | https://github.com/tensorflow/models/tree/master/research/audioset/yamnet |
| audio-player | TensorFlow.js 4.22.0 (@tensorflow/tfjs-core, -converter, -backend-webgl, -backend-cpu) | Apache-2.0 | — | https://github.com/tensorflow/tfjs/blob/master/LICENSE |
| plan-a-shot | Universal Animation Library (Standard) mannequin and clips by Quaternius (idle, walk, jog, sprint, dance, sit, jump; trimmed and meshopt-compressed in web/public/models/mannequin). The person you play in Direct a Shot | CC0-1.0 | — | https://quaternius.com/packs/universalanimationlibrary.html |
| plan-a-shot | KayKit City Builder Bits by Kay Lousberg (streets, pavements, buildings, street lights, cars). Open city | CC0-1.0 | — | https://kaylousberg.itch.io/city-builder-bits |
| plan-a-shot | Mesh2Motion by Scott Petrovic (the skin-weight passes in Rig as a character, vendored in web/src/shared/rig/m2m). Full text: licenses/mesh2motion-LICENSE-MIT.md | MIT | — | https://github.com/Mesh2Motion/mesh2motion-app/blob/main/LICENSE-MIT.MD |
| plan-a-shot | Mesh2Motion human rig and animations (idle, walk, jog, sprint, jump, dance, sit; trimmed and meshopt-compressed in web/public/models/rig). The moves a character you rig gets | CC0-1.0 | — | https://github.com/Mesh2Motion/mesh2motion-app/blob/main/LICENSE-CC0.MD |
| plan-a-shot | Rapier 0.19.3 physics engine by Dimforge (@dimforge/rapier3d-compat, WebAssembly). Drive mode collisions in the open city | Apache-2.0 | — | https://github.com/dimforge/rapier.js/blob/master/LICENSE |
| plan-a-shot | City Kit (Commercial) by Kenney (towers and shops). Open city | CC0-1.0 | — | https://kenney.nl/assets/city-kit-commercial |
| plan-a-shot | City Kit (Suburban) by Kenney (houses). Open city | CC0-1.0 | — | https://kenney.nl/assets/city-kit-suburban |
| plan-a-shot | Car Kit by Kenney (traffic and parked cars). Open city | CC0-1.0 | — | https://kenney.nl/assets/car-kit |
| plan-a-shot | Nature Kit by Kenney (trees, palms, rocks, plants, fences). Open city | CC0-1.0 | — | https://kenney.nl/assets/nature-kit |
| plan-a-shot | KayKit Furniture Bits by Kay Lousberg (home furniture). Direct a Shot props | CC0-1.0 | — | https://kaylousberg.itch.io/furniture-bits |
| plan-a-shot | KayKit Restaurant Bits by Kay Lousberg (kitchen pieces). Direct a Shot props | CC0-1.0 | — | https://kaylousberg.itch.io/restaurant-bits |
| plan-a-shot | KayKit Forest Nature Pack by Kay Lousberg (trees, bushes, rocks). Direct a Shot props | CC0-1.0 | — | https://kaylousberg.itch.io/kaykit-forest |
| plan-a-shot | Holiday Kit by Kenney (cabins, snowy pines, toy train). Direct a Shot diorama and props | CC0-1.0 | — | https://kenney.nl/assets/holiday-kit |
| plan-a-shot | WaterBottle glTF sample by Microsoft, label made blank (Khronos glTF Sample Assets). Direct a Shot product hero | CC0-1.0 | — | https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/WaterBottle |
| app-face-swap | Qwen-Image-Edit-2509 (fp8, Comfy-Org repack) | Apache-2.0 | — | https://huggingface.co/Qwen/Qwen-Image-Edit-2509 |
| app-face-swap | Qwen-Image-Edit-2509 Lightning 4-step LoRA (lightx2v) | Apache-2.0 | — | https://huggingface.co/lightx2v/Qwen-Image-Lightning |
| app-face-swap | BFS head swap LoRA v1.1 for Qwen Image 2.1 (bfs_head_v1.1_qwen_2.1, Alissonerdx) | MIT | — | https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap |
| app-face-swap | Nano Banana 2 (hosted: fal, or the Comfy partner node) | Provider terms | — | https://fal.ai/models/fal-ai/nano-banana-2/edit |
| app-face-swap | FLUX 3 Klein (local, BFL API) | FLUX Kommunity License v1.0 | — | https://huggingface.co/black-forest-labs/flux-3-image-klein/blob/main/LICENSE.md |
| app-person-swap | Qwen-Image-Edit-2509 (fp8, Comfy-Org repack) | Apache-2.0 | — | https://huggingface.co/Qwen/Qwen-Image-Edit-2509 |
| app-person-swap | Qwen-Image-Edit-2509 Lightning 4-step LoRA (lightx2v) | Apache-2.0 | — | https://huggingface.co/lightx2v/Qwen-Image-Lightning |
| app-person-swap | BFS body swap LoRA v1.0 for Qwen Image 2.1 (bfs_body_swap_v1.0_qwen_2.1, Alissonerdx) | MIT | — | https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap |
| app-person-swap | Nano Banana 2 (hosted: fal, or the Comfy partner node) | Provider terms | — | https://fal.ai/models/fal-ai/nano-banana-2/edit |
| app-person-swap | FLUX 3 Klein (local, BFL API) | FLUX Kommunity License v1.0 | — | https://huggingface.co/black-forest-labs/flux-3-image-klein/blob/main/LICENSE.md |
| h3-video | Official Comfy template · LTX-2.5 DFR: video_ltx2_5_dfr_i2v (Comfy-Org/workflow_templates, bundled unchanged in workflows/templates/ with its licence) | MIT | — | https://github.com/Comfy-Org/workflow_templates/blob/main/templates/video_ltx2_5_dfr_i2v.json |
| h3-video | LTX-2.5 22B distilled int8 ConvRot, Gemma 4 12B text encoder (bf16), x2 spatial and x2 temporal latent upscalers, VAEs (Lightricks/LTX-2.5) · DFR | LTX-2.x Community License | — | https://huggingface.co/Lightricks/LTX-2.5 |
| h3-video | Pixel-spatial upscaler x2 detailing IC-LoRA (Lightricks/LTX-2.5-22b-IC-LoRA-Pixel-Spatial-Upscaler) · DFR | LTX-2.x Community License | — | https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Pixel-Spatial-Upscaler |
| create-image | FLUX.2 [klein] 4B distilled, bf16 (flux-2-klein-4b.safetensors, Comfy-Org repack) | Apache-2.0 | — | https://huggingface.co/black-forest-labs/FLUX.2-klein-4B |
| create-image | Qwen3 4B text encoder for FLUX.2 [klein] (qwen_3_4b.safetensors) | Apache-2.0 | — | https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-4b |
| create-image | FLUX.2 VAE (flux2-vae.safetensors from Comfy-Org/flux2-dev), used by FLUX.2 [klein] 4B and FLUX 3 Klein | Repo card of Comfy-Org/flux2-dev mentions the FLUX.1 [dev] Non-Commercial License; check before commercial use | — | https://huggingface.co/Comfy-Org/flux2-dev |
| app-shots | Qwen-Image-Edit-2509 (fp8, Comfy-Org repack) | Apache-2.0 | — | https://huggingface.co/Qwen/Qwen-Image-Edit-2509 |
| app-shots | Qwen-Image-Edit-2509 Lightning 4-step LoRA (lightx2v) | Apache-2.0 | — | https://huggingface.co/lightx2v/Qwen-Image-Lightning |
| app-shots | Qwen-Edit-2509 Multiple-angles LoRA (dx8152), optional route | Apache-2.0 | — | https://huggingface.co/dx8152/Qwen-Edit-2509-Multiple-angles |
| app-shots | Nano Banana 2 (hosted: fal, or the Comfy partner node) | Provider terms | — | https://fal.ai/models/fal-ai/nano-banana-2/edit |
| app-shots | FLUX 3 Klein (local, BFL API) | FLUX Kommunity License v1.0 | — | https://huggingface.co/black-forest-labs/flux-3-image-klein/blob/main/LICENSE.md |
| object-swap | SAM 3.1 (sam3.1_multiplex_fp16) · mask preview | SAM License | Royalty-free, including commercial use. Include the licence text when you redistribute the weights. Trade-control (ITAR / export) and military-use limits apply. | https://github.com/facebookresearch/sam3/blob/main/LICENSE |
| object-swap | H3 Character Swap recipe settings, after Comfy's Openjutsu app (Comfy-Org/comfy-openjutsu) | MIT | — | https://github.com/Comfy-Org/comfy-openjutsu |
| object-swap | H3 Character Swap workflow (Akatz Labs, akatz-labs/h3-character-swap-tool) | MIT | — | https://github.com/akatz-labs/h3-character-swap-tool |
| two-person-swap | MiniMax H3 Ref2VA int8, Qwen3-VL 32B text encoder NVFP4, H3 video + audio VAEs, H3 fl2v turbo 8-step LoRA (Comfy-Org/MiniMax-H3, lightx2v/Minimax-h3-Turbo) | MiniMax H3 Community License | — | https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE |
| two-person-swap | H3 Character Swap LoRA v1.5 (Akatz Labs, akatz-ai/MiniMax-H3-Character-Swap-LoRA), imported into your Comfy Cloud library | MiniMax H3 Community License (adapter retains base terms; no extra no-SaaS clause, verified 2026-10-17) | — | https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA/blob/main/LICENSE |
| two-person-swap | SAM 3.1 (sam3.1_multiplex_fp16) · person masks | SAM License | Royalty-free, including commercial use. Include the licence text when you redistribute the weights. Trade-control (ITAR / export) and military-use limits apply. | https://github.com/facebookresearch/sam3/blob/main/LICENSE |
| two-person-swap | H3 Character Swap recipe settings, after Comfy's Openjutsu app (Comfy-Org/comfy-openjutsu) | MIT | — | https://github.com/Comfy-Org/comfy-openjutsu |
| two-person-swap | H3 Character Swap workflow (Akatz Labs, akatz-labs/h3-character-swap-tool) | MIT | — | https://github.com/akatz-labs/h3-character-swap-tool |
| app-translate-video | Official Comfy template · MelBandRoFormer Audio Separation: audio_melbandroformer_audio_separation (Comfy-Org/workflow_templates), flattened in workflows/audio-separation-melband-api.json · Keep the background | MIT | — | https://github.com/Comfy-Org/workflow_templates/blob/main/templates/audio_melbandroformer_audio_separation.json |
| app-translate-video | ComfyUI-MelBandRoFormer node pack (kijai) @ 92c86854e6 · Keep the background | None stated (its pyproject.toml names a LICENSE file the repo does not include); check with the author | — | https://github.com/kijai/ComfyUI-MelBandRoFormer |
| app-translate-video | MelBand RoFormer vocal model (KimberleyJSN/melbandroformer; MelBandRoformer_fp16.safetensors, Kijai/MelBandRoFormer_comfy) · Keep the background | MIT | — | https://huggingface.co/KimberleyJSN/melbandroformer |
| app-change-voice | Official Comfy template · MelBandRoFormer Audio Separation: audio_melbandroformer_audio_separation (Comfy-Org/workflow_templates), flattened in workflows/audio-separation-melband-api.json · Keep the background | MIT | — | https://github.com/Comfy-Org/workflow_templates/blob/main/templates/audio_melbandroformer_audio_separation.json |
| app-change-voice | ComfyUI-MelBandRoFormer node pack (kijai) @ 92c86854e6 · Keep the background | None stated (its pyproject.toml names a LICENSE file the repo does not include); check with the author | — | https://github.com/kijai/ComfyUI-MelBandRoFormer |
| app-change-voice | MelBand RoFormer vocal model (KimberleyJSN/melbandroformer; MelBandRoformer_fp16.safetensors, Kijai/MelBandRoFormer_comfy) · Keep the background | MIT | — | https://huggingface.co/KimberleyJSN/melbandroformer |
| voice | InfiniteTalk single-speaker patch (MeiGen-AI) · Talking Video | Apache-2.0 | — | https://github.com/MeiGen-AI/InfiniteTalk |
| voice | Wan 2.1 I2V 14B 480p (Wan-AI; Kijai fp8 repack) + lightx2v step-distill LoRA · Talking Video | Apache-2.0 | — | https://huggingface.co/Wan-AI/Wan2.1-I2V-14B-480P |
| voice | wav2vec2 chinese base (TencentGameMate) · Talking Video | MIT | — | https://huggingface.co/TencentGameMate/chinese-wav2vec2-base |
| voice | InfiniteTalk template video_wan2_1_infinitetalk (Comfy-Org/workflow_templates) · Talking Video | MIT | — | https://github.com/Comfy-Org/workflow_templates |
| voice | LongCat-Video-Avatar 1.5 weights + code (Meituan) · Talking Video, needs your own Comfy deployment (off by default) | MIT | — | https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5 |
| voice | LongCat-Avatar 1.5 bf16 + DMD distill LoRA repacks (Kijai/WanVideo_comfy) · Talking Video (deployment) | MIT (follows upstream) | — | https://huggingface.co/Kijai/WanVideo_comfy/tree/main/LongCat |
| voice | Whisper large-v3 (OpenAI) · LongCat 1.5 audio encoder (deployment) | Apache-2.0 | — | https://huggingface.co/openai/whisper-large-v3 |
| voice | ComfyUI-WanVideoWrapper (kijai) @ 088128b224 or later · LongCat 1.5 nodes (deployment) | Apache-2.0 | — | https://github.com/kijai/ComfyUI-WanVideoWrapper |
| voice | Official Comfy template · MelBandRoFormer Audio Separation: audio_melbandroformer_audio_separation (Comfy-Org/workflow_templates), flattened in workflows/audio-separation-melband-api.json · Keep the background | MIT | — | https://github.com/Comfy-Org/workflow_templates/blob/main/templates/audio_melbandroformer_audio_separation.json |
| voice | ComfyUI-MelBandRoFormer node pack (kijai) @ 92c86854e6 · Keep the background | None stated (its pyproject.toml names a LICENSE file the repo does not include); check with the author | — | https://github.com/kijai/ComfyUI-MelBandRoFormer |
| voice | MelBand RoFormer vocal model (KimberleyJSN/melbandroformer; MelBandRoformer_fp16.safetensors, Kijai/MelBandRoFormer_comfy) · Keep the background | MIT | — | https://huggingface.co/KimberleyJSN/melbandroformer |
| reshoot | MiniMax H3 Ref2VA int8, Qwen3-VL text encoder int8, H3 video + audio VAEs (Comfy-Org/MiniMax-H3) · H3 CrossView | MiniMax H3 Community License | — | https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE |
| reshoot | CrossView-Warp v1 LoRA for MiniMax H3 Ref2VA (Cseti) · H3 CrossView | MiniMax H3 Community License | — | https://huggingface.co/Cseti/MiniMax-H3_Ref2VA-LoRA-CrossView-Warp_v1 |
| reshoot | MiniMax H3 ref2v 8-step turbo LoRA 768p (lightx2v) · H3 CrossView | No licence tag on the model card; the repository licence applies, check it | — | https://huggingface.co/lightx2v/Minimax-h3-Turbo |
| reshoot | MoGe-2 ViT-L normal fp16 depth model (Comfy-Org/MoGe) · H3 CrossView | MIT | — | https://huggingface.co/Comfy-Org/MoGe |
| reshoot | ComfyUI-CrossViewWarp node pack (comfyrob fork @ fbb1e93 of cseti007/ComfyUI-CrossViewWarp; installed in your Build) · H3 CrossView | Apache-2.0 | — | https://github.com/comfyrob/ComfyUI-CrossViewWarp |
| reshoot | Reshoot recipe graph (Comfy-Org/comfy-reshoot, adapted in workflows/deploy/h3-crossview-api.json) · H3 CrossView | MIT | — | https://github.com/Comfy-Org/comfy-reshoot |
| app-image-layers | ag-psd 31.0.3 (Download PSD: writes the layered .psd in the browser) | MIT | — | https://github.com/Agamnentzar/ag-psd/blob/master/LICENSE |
| app-image-layers | pako 2.1.0 (zlib for ag-psd) | MIT AND Zlib | — | https://github.com/nodeca/pako/blob/master/LICENSE |
| app-image-layers | base64-js 1.5.1 (used by ag-psd) | MIT | — | https://github.com/beatgammit/base64-js/blob/master/LICENSE |
| soul | Z-Image-Turbo (Tongyi-MAI) | Apache-2.0 | — | https://huggingface.co/Tongyi-MAI/Z-Image-Turbo |
| soul | Qwen-Image-2512 | Apache-2.0 | — | https://huggingface.co/Qwen/Qwen-Image-2512 |
| soul | Qwen-Image-Edit-2511 | Apache-2.0 | — | https://huggingface.co/Qwen/Qwen-Image-Edit-2511 |
| soul | FLUX.1 [dev] (fp8, Comfy-Org repack) | FLUX.1 [dev] Non-Commercial License | — | https://huggingface.co/black-forest-labs/FLUX.1-dev |
| soul | FLUX.1 Fill [dev] (ACE++ base) | FLUX.1 [dev] Non-Commercial License | — | https://huggingface.co/black-forest-labs/FLUX.1-Fill-dev |
| soul | PuLID-FLUX v0.9.1 (guozinan/PuLID) | Apache-2.0 (needs FLUX.1-dev + insightface antelopev2, both non-commercial) | — | https://huggingface.co/guozinan/PuLID |
| soul | ComfyUI-PuLID-Flux node pack @a80912f | Apache-2.0 | — | https://github.com/balazik/ComfyUI-PuLID-Flux |
| soul | InfiniteYou infu_flux_v1.0 (ByteDance) | CC BY-NC 4.0 | — | https://huggingface.co/ByteDance/InfiniteYou |
| soul | ComfyUI_InfiniteYou node pack @1c97939 | Apache-2.0 | — | https://github.com/bytedance/ComfyUI_InfiniteYou |
| soul | InsightFace antelopev2 | Non-commercial research only | — | https://github.com/deepinsight/insightface#license |
| soul | ACE++ portrait / subject LoRAs (ali-vilab/ACE_Plus) | No licence stated (no licence file); README: follow FLUX.1-dev licence | — | https://huggingface.co/ali-vilab/ACE_Plus |
| soul | Real-ESRGAN x2plus / x4plus | BSD-3-Clause | — | https://github.com/xinntao/Real-ESRGAN |
| soul | Z-Image-Turbo Realism LoRA LoRA | Apache-2.0 | — | https://huggingface.co/suayptalha/Z-Image-Turbo-Realism-LoRA |
| soul | FluxRealSkin v2 LoRA | Civitai model licence; Civitai permissions: RentCivit | — | https://civitai.com/models/651043?modelVersionId=827325 |
| soul | Cinematic Photography (ZIT) LoRA | Civitai model licence; Civitai permissions: RentCivit | — | https://civitai.com/models/214956?modelVersionId=2555690 |
| soul | 50s Noir Movie (ZIT) LoRA | Civitai model licence; Civitai permissions: RentCivit, Image | — | https://civitai.com/models/804984?modelVersionId=2596514 |
| soul | Cinematic Portrait Lighting (ZIT) LoRA | Civitai model licence; Civitai permissions: RentCivit, Rent, Image | — | https://civitai.com/models/2595570?modelVersionId=2975453 |
| soul | Realistic Skin & Face Professional (ZIT) LoRA | Civitai model licence; Civitai permissions: RentCivit | — | https://civitai.com/models/1426727?modelVersionId=3107206 |
| soul | 35mm Photo (ZIT) LoRA | Civitai model licence; Civitai permissions: RentCivit, Image | — | https://civitai.com/models/660731?modelVersionId=2466153 |
| soul | Cinematic Film Color (ZIT) LoRA | Civitai model licence; Civitai permissions: RentCivit | — | https://civitai.com/models/541698?modelVersionId=2537802 |
| soul | Candid Instax Photo (ZIT) LoRA | Civitai model licence; Civitai permissions: Image, RentCivit | — | https://civitai.com/models/1683324?modelVersionId=2597365 |
| soul | Ultra Real Amateur Selfies (ZIT) LoRA | Civitai model licence; Civitai permissions: RentCivit, Image | — | https://civitai.com/models/2233658?modelVersionId=2514521 |
| soul | InstaPic (ZIT) LoRA | Civitai model licence; Civitai permissions: Image, RentCivit | — | https://civitai.com/models/2168120?modelVersionId=2909558 |
| soul | Direct Flash (FLUX.1-dev) LoRA | Civitai model licence (base FLUX.1-dev non-commercial); Civitai permissions: Image, RentCivit, Rent, Sell, SellMerge | — | https://civitai.com/models/1661207?modelVersionId=1880243 |
| soul | Flux Fashion Editorial (FLUX.1-dev) LoRA | Civitai model licence (base FLUX.1-dev non-commercial); Civitai permissions: Image, RentCivit, Rent | — | https://civitai.com/models/2138223?modelVersionId=2418642 |
| soul | CoolShot 2000s (Qwen-Image) LoRA | Civitai model licence; Civitai permissions: Image, RentCivit, Rent, Sell, SellMerge | — | https://civitai.com/models/2163880?modelVersionId=2436841 |
| soul | Siemens CX70 CCD Dreams (Qwen-Image) LoRA | Civitai model licence; Civitai permissions: Image, RentCivit, Rent, Sell, SellMerge | — | https://civitai.com/models/2744351?modelVersionId=3086732 |
| three-d | Tripo 3.1 Text, Image and Multi-view (Comfy partner nodes, hosted) | Tripo terms of service | — | https://www.tripo3d.ai/terms |
| three-d | TRELLIS.2 (Microsoft, fal-ai/trellis-2) | MIT | — | https://huggingface.co/microsoft/TRELLIS.2-4B |
| three-d | Hunyuan 3D 3.1 Pro (Tencent, fal-ai/hunyuan-3d/v3.1/pro/image-to-3d) | Tencent Hunyuan 3D Community License; not in the EU, UK or South Korea | — | https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE |
| three-d | Pixal3D + TRELLIS.2 local template (Comfy-Org repack: Pixal3D, TRELLIS.2, MoGe-2, BiRefNet) | MIT | — | https://huggingface.co/Comfy-Org/Pixal3D |
| three-d | DINOv3 ViT-L (in the Pixal3D template) | DINOv3 License | — | https://ai.meta.com/resources/models-and-libraries/dinov3-license/ |
| make-it-real | LTX-2.5 22B distilled (Lightricks; GGUF Q4_K_M repack by Unsloth, unsloth/LTX-2.5-GGUF) | LTX-2.x Community License | — | https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x |
| make-it-real | Layout to Render IC-LoRA 1.0 (Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render) | LTX-2.x Community License | — | https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render |
| make-it-real | Gemma 4 12B text encoder with LTX projection, VAEs, x2 latent upscaler (Lightricks/LTX-2.5) | LTX-2.x Community License | — | https://huggingface.co/Lightricks/LTX-2.5 |
| make-it-real | ComfyUI-GGUF custom nodes (city96) | Apache-2.0 | — | https://github.com/city96/ComfyUI-GGUF |
| footage-fx | LTX-2.5 22B distilled (Lightricks; GGUF Q4_K_M repack by Unsloth, unsloth/LTX-2.5-GGUF) | LTX-2.x Community License | — | https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x |
| footage-fx | Clean Plate IC-LoRA (Lightricks/LTX-2.5-22b-IC-LoRA-Clean-Plate) | LTX-2.x Community License | — | https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Clean-Plate |
| footage-fx | Day to Night IC-LoRA (Lightricks/LTX-2.5-22b-IC-LoRA-Day-To-Night) | LTX-2.x Community License | — | https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Day-To-Night |
| footage-fx | Water Simulation IC-LoRA (Lightricks/LTX-2.5-22b-IC-LoRA-Water-Simulation) | LTX-2.x Community License | — | https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Water-Simulation |
| footage-fx | Alpha Gen IC-LoRA (Lightricks/LTX-2.5-22b-IC-LoRA-Alpha-Gen) | LTX-2.x Community License | — | https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Alpha-Gen |
| footage-fx | Gemma 4 12B text encoder with LTX projection, VAEs, x2 latent upscaler (Lightricks/LTX-2.5) | LTX-2.x Community License | — | https://huggingface.co/Lightricks/LTX-2.5 |
| footage-fx | ComfyUI-GGUF custom nodes (city96) | Apache-2.0 | — | https://github.com/city96/ComfyUI-GGUF |
| footage-fx | LTX-2.3 22B dev, Gemma 3 12B text encoder, x2 latent upscaler (Lightricks/LTX-2.3; Comfy Cloud effects) | LTX-2.x Community License | — | https://huggingface.co/Lightricks/LTX-2.3 |
| footage-fx | Clean Plate IC-LoRA for LTX-2.3 (Vanish; huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Clean-Plate) | LTX-2.x Community License | — | https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Clean-Plate |
| footage-fx | Day to Night IC-LoRA for LTX-2.3 (Day to night; huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Day-To-Night) | LTX-2.x Community License | — | https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Day-To-Night |
| footage-fx | Water Simulation IC-LoRA for LTX-2.3 (Rain, Flood; huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Water-Simulation) | LTX-2.x Community License | — | https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Water-Simulation |
| footage-fx | Dearchive IC-LoRA (Restore old footage; as shipped in Comfy Cloud’s library) | LTX-2.x Community License | — | https://github.com/Comfy-Org/workflow_templates/blob/main/templates/template_ltx2_3_lora_restore_archival_footage.json |
| footage-fx | Obscura Remova LoRA (Remove an object; civitai.com/api/download/models/2909707) | LTX-2.x Community License | — | https://civitai.com/api/download/models/2909707 |
| footage-fx | Subtitle Remover IC-LoRA (Remove subtitles; as shipped in Comfy Cloud’s library) | LTX-2.x Community License | — | https://github.com/Comfy-Org/workflow_templates/blob/main/templates/template_ltx2_3_lora_remove_subtitles_from_video.json |
| footage-fx | Outpaint IC-LoRA (Extend the frame; huggingface.co/oumoumad/LTX-2.3-22b-IC-LoRA-Outpaint) | LTX-2.x Community License | — | https://huggingface.co/oumoumad/LTX-2.3-22b-IC-LoRA-Outpaint |
| footage-fx | Official Comfy template · LTX-2.3 · Lightricks: template_ltx2_3_lora_restore_archival_footage (Comfy-Org/workflow_templates); Vanish, Day to night, Rain, Flood on Comfy Cloud use our graph derived from it | MIT | — | https://github.com/Comfy-Org/workflow_templates/blob/main/templates/template_ltx2_3_lora_restore_archival_footage.json |
| footage-fx | Official Comfy template · LTX-2.3 · Lightricks: template_ltx2_3_obscura_remova_lora_remove_object_from_video (Comfy-Org/workflow_templates) | MIT | — | https://github.com/Comfy-Org/workflow_templates/blob/main/templates/template_ltx2_3_obscura_remova_lora_remove_object_from_video.json |
| footage-fx | Official Comfy template · LTX-2.3 · Lightricks: template_ltx2_3_lora_remove_subtitles_from_video (Comfy-Org/workflow_templates) | MIT | — | https://github.com/Comfy-Org/workflow_templates/blob/main/templates/template_ltx2_3_lora_remove_subtitles_from_video.json |
| footage-fx | Official Comfy template · LTX-2.3 · Lightricks: template_ltx2_3_lora_video_outpainting (Comfy-Org/workflow_templates) | MIT | — | https://github.com/Comfy-Org/workflow_templates/blob/main/templates/template_ltx2_3_lora_video_outpainting.json |

## Licence clauses read

| Licence | Status | Clause | Source |
|---|---|---|---|
| proprietary | unverified | Hosted API: no model licence; any credit rule is in the provider's API terms, which were not checked line by line. | — |
| apache-2.0 | none | Apache-2.0 §4 (Redistribution): keep the copyright and licence notice in copies of the software/weights; nothing is required in the app UI or on outputs. | https://www.apache.org/licenses/LICENSE-2.0 |
| ltx-2-community | none | Retain the licence and attribution notices when distributing LTX-2 or derivatives; no in-app credit line. | https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2 |
| gemma | none | 3.1: the Notice file is required for Distributions other than through a Hosted Service; no in-app credit line. | https://ai.google.dev/gemma/terms |
| mit | none | MIT: keep the copyright and licence notice in copies of the software/weights; nothing is required in the app UI or on outputs. | https://opensource.org/license/mit |
| minimax-community-akatz-charswap | required | §IV.2 (required): “You shall prominently display “MiniMax H3”on the user interface of commercial product or service that uses MiniMax H3 or MiniMax H3 Works.” §III.3(a) (encouraged, not required): display a notice that the product or service is “Powered by MiniMax H3”. So the name “MiniMax H3” is required in the UI and the “Powered by MiniMax H3” credit is encouraged; we show the credit line, which also displays the required name. (Licence text checked 2026-10-17; same text as the base licence.) | https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA/raw/main/LICENSE |
| minimax-community | required | §IV.2 (required): “You shall prominently display “MiniMax H3”on the user interface of commercial product or service that uses MiniMax H3 or MiniMax H3 Works.” §III.3(a) (encouraged, not required): display a notice that the product or service is “Powered by MiniMax H3”. So the name “MiniMax H3” is required in the UI and the “Powered by MiniMax H3” credit is encouraged; we show the credit line, which also displays the required name. (Licence text checked 2026-10-17.) | https://huggingface.co/MiniMaxAI/MiniMax-H3/raw/main/LICENSE |
| alissonerdx-unspecified | unverified | LICENSES.md scopes its custom licence to the BFS Character Swap LoRAs only (credit required there for orgs over US$1M); no licence is stated for the Style Transfer / VFX Edit files we use. The base MiniMax H3 line still applies. | https://huggingface.co/Alissonerdx/Minimax-H3-ComfyUI/raw/main/LICENSES.md |
| h3-camera-motion-civitai | none | Civitai permissions for camera_motion_h3: no credit required. The downloaded weights fall under the MiniMax H3 Community Licence, whose “Powered by MiniMax H3” line comes from the minimax-community part. | https://civitai.com/models/2914784/cameramotionh3 |
| ltx-2x-community | unverified | Not checked yet. | https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x |
| bsd-3-clause | none | BSD-3-Clause clauses 1–2: keep the copyright and licence notice in copies of the software/weights; nothing is required in the app UI or on outputs. | https://opensource.org/license/bsd-3-clause |
| ultrasharp-nc | none | CC BY-NC-SA 4.0 §3(a)/(b): attribution and share-alike apply when the weights (or adapted weights) are shared; upscaled outputs need no in-app credit. | https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode |
| flux-kommunity | unverified | Not verified: the licence file is gated (needs a Hugging Face login that accepted the terms). | https://huggingface.co/black-forest-labs/flux-3-image-klein/blob/main/LICENSE.md |
| qwen-research | none | “Built with Qwen” is required only when the outputs train or improve a distributed AI model; the Notice file applies to redistribution. | https://huggingface.co/Qwen/Qwen-Image-2.1/raw/main/LICENSE |
| flux-dev-nc | none | 3(b): the Attribution Notice goes alongside a Distribution of the model; 2(ii): outputs must disclose AI generation where the law requires it. No in-app credit line. | https://raw.githubusercontent.com/black-forest-labs/flux2/main/model_licenses/LICENSE-FLUX-DEV |
| yue2-weights | none | Model cards m-a-p/YuE2-3B, m-a-p/SheetSage2 and Comfy-Org/YuE2 declare cc-by-nc-4.0 (the first YuE release was Apache-2.0). §3(a): attribution applies when the weights are shared. | https://huggingface.co/Comfy-Org/YuE2 |
| minimax-music3-community | required | Commercial products credit MiniMax-Music3 in their interface; over US$20M yearly revenue needs written permission; an acceptable use policy applies. The Comfy-Org repack card says apache-2.0, the upstream LICENSE file governs. | https://huggingface.co/MiniMaxAI/MiniMax-Music3/raw/main/LICENSE |
| stability-community | required | IV(a)(iii): prominently display “Powered by Stability AI” on a related website, user interface, blogpost, about page, or product documentation (when distributing the model or a product using it). | https://stability.ai/community-license-agreement |
| chatterbox | none | MIT: keep the copyright and licence notice in copies of the software/weights; nothing is required in the app UI or on outputs. | https://huggingface.co/ResembleAI/chatterbox |
| fish-community | required | IV(a): a product or service that uses the Fish Audio Materials shall prominently display “Built with Fish Audio”. | https://huggingface.co/fishaudio/drama-3/raw/main/LICENSE |
| f5-tts-weights | none | CC BY-NC 4.0 §3(a): attribution applies when the licensed material (the weights) is shared; no in-app credit. | https://creativecommons.org/licenses/by-nc/4.0/legalcode |
| mmaudio-weights | none | CC BY-NC 4.0 §3(a): attribution applies when the licensed material (the weights) is shared; running it and its outputs need no in-app credit. | https://creativecommons.org/licenses/by-nc/4.0/legalcode |
| nllb-nc | none | CC BY-NC 4.0 §3(a): attribution applies when the licensed material (the weights, https://huggingface.co/facebook/nllb-200-distilled-600M) is shared; running it and its outputs need no in-app credit. | https://creativecommons.org/licenses/by-nc/4.0/legalcode |
| faster-whisper | none | MIT: keep the copyright and licence notice in copies of the software/weights; nothing is required in the app UI or on outputs. | https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE |
| cc-by-4.0 | unverified | Not checked yet. | https://creativecommons.org/licenses/by/4.0/ |
| flux1-dev-nc | none | 3(b): the Attribution Notice goes alongside a Distribution of the model (e.g. a Notice file); 2(e)(ii): outputs disclose AI generation where the law requires. No in-app credit line. | https://raw.githubusercontent.com/black-forest-labs/flux/main/model_licenses/LICENSE-FLUX1-dev |
| infiniteyou-nc | none | CC BY-NC 4.0 §3(a): attribution applies when the licensed material (the weights, https://huggingface.co/ByteDance/InfiniteYou) is shared; running it and its outputs need no in-app credit. | https://creativecommons.org/licenses/by-nc/4.0/legalcode |
| insightface-nc | unverified | README states non-commercial research use for the models; no full licence text with attribution terms to check. | https://github.com/deepinsight/insightface#license |
| aceplus-flux | unverified | No licence file; the README defers to the FLUX.1 [dev] licence (no in-app line there), but the LoRAs themselves have no checkable text. | https://huggingface.co/ali-vilab/ACE_Plus |
| civitai-lora | unverified | Per-model permissions set by each LoRA author; checked per component, not here. | https://civitai.com/content/licenses |
| tripo-terms | unverified | Not checked yet. | https://www.tripo3d.ai/terms |
| tencent-hunyuan-3d | unverified | Not checked yet. | https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE |
| dinov3 | unverified | Not checked yet. | https://ai.meta.com/resources/models-and-libraries/dinov3-license/ |
| agpl-3.0-or-later | unverified | Not checked yet. | https://www.gnu.org/licenses/agpl-3.0.html |
| birefnet-mit | none | MIT: keep the copyright and licence notice in copies of the software/weights; nothing is required in the app UI or on outputs. | https://github.com/ZhengPeng7/BiRefNet/blob/main/LICENSE |
| rife-mit | none | MIT: keep the copyright and licence notice in copies of the software/weights; nothing is required in the app UI or on outputs. | https://github.com/hzwer/Practical-RIFE/blob/main/LICENSE |
| depth-anything-v2-small-apache | none | Apache-2.0 §4: keep the copyright and licence notice in copies of the software/weights; nothing is required in the app UI or on outputs. | https://huggingface.co/depth-anything/Depth-Anything-V2-Small |

## Notes

- **FLUX 3 Image Klein** (FLUX Kommunity License v1.0): the licence file is gated on Hugging Face (it needs a login that accepted the terms), so its attribution terms are **unverified**. Re-check when someone with access can read it.
- **Hosted APIs** (`proprietary`): there is no model licence. Any credit rule is in each provider's API terms, which were not checked line by line, so they are marked unverified.
- **FLUX.1 [dev]** (legacy look recipe, tool soul): read from the official text on GitHub (black-forest-labs/flux, model_licenses/LICENSE-FLUX1-dev, v1.1.1): §3(b) Attribution Notice only alongside a Distribution; no in-app line.
- Notice-file texts (Gemma, Qwen, Stability, FLUX dev, Fish Audio) are required only when weights are redistributed; they stay in `licenses.ts` (`noticeFile`), are not shown in the UI, and are copied under "Credits and NOTICE texts" below. The H3 Character Swap LoRA is by **Akatz Labs** (its NOTICE is there too).


## Credits and NOTICE texts

Copied verbatim from the upstream NOTICE files. They travel with the weights when weights are redistributed; the app shows the credit lines above.

### Gemma Terms of Use

- Licence: [gemma](https://ai.google.dev/gemma/terms)

> Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms

### Qwen Research License (non-commercial)

- Licence: [qwen-research](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE)

> Qwen is licensed under the Qwen RESEARCH LICENSE AGREEMENT, Copyright (c) 2026 Hangzhou Tongyi Laboratory Technology Co., Ltd. All Rights Reserved.

### MiniMax H3 Community License (adapter retains base terms; no extra no-SaaS clause, verified 2026-10-17) (Akatz Labs)

- Credit: **H3 Character Swap LoRA by Akatz Labs** ([NOTICE](https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA/raw/main/NOTICE))
- Licence: [minimax-community-akatz-charswap](https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA/blob/main/LICENSE)

> MiniMax H3 is licensed under the MiniMax H3 Community License Agreement, Copyright © 2026 MiniMax. All Rights Reserved.
>
> Modified by Akatz Labs: character-swap LoRA fine-tuning, 1,000 updates, September 2026. This repository contains adapter weights, not base-model weights.
>
> Additional modification by Akatz Labs: H3 Character Swap V1.5,
> continued from V1 for 1,000 additional optimizer updates, October 2026.
> V1.5 is the development checkpoint V2-1000. Adapter weights only;
> base-model and training-assistant weights are not included.

### Stability AI Community License

- Licence: [stability-community](https://huggingface.co/stabilityai/stable-audio-open-1.0/blob/main/LICENSE.md)

> This Stability AI Model is licensed under the Stability AI Community License, Copyright © Stability AI Ltd. All Rights Reserved

### FLUX [dev] Non-Commercial License v2.0

- Licence: [flux-dev-nc](https://raw.githubusercontent.com/black-forest-labs/flux2/main/model_licenses/LICENSE-FLUX-DEV)

> The FLUX [dev] Model is licensed by Black Forest Labs Inc. under the FLUX [dev] Non-Commercial License. Copyright Black Forest Labs Inc.

### Fish Audio Community License v1.0 (research/non-commercial; commercial under US$500k revenue; no hosted TTS service)

- Licence: [fish-community](https://huggingface.co/fishaudio/drama-3/blob/main/LICENSE)

> These Fish Audio Materials are licensed under the Fish Audio Community License, Version 1.0. Copyright © 39 AI, INC. All Rights Reserved.


## Sample media (Blender Foundation open movies, CC BY 3.0)

Some demo media are clips from Blender Foundation open movies, not generations. Every place that shows one carries a visible label field `sampleLabel: "Sample · CC-BY Blender Foundation"` plus `sample {label, film, credit, license, licenseUrl, sourceUrl, modified}` (`server/src/sampleMedia.ts`): job outputs (`outputs[].sample`), jobs (`sampleLabel`, `sample`) and Community items. The four Community seed videos use them. Files: `web/public/examples/hq-*` and `ex-*` (full list in `ASSETS-CREDITS.md`).

| Film | Credit (required by CC BY 3.0) | Licence | Source | Clips |
|---|---|---|---|---|
| Sintel (2010) | "Sintel" © copyright Blender Foundation, durian.blender.org | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | https://download.blender.org/durian/trailer/ | hq-snow, hq-elder, hq-heroine, hq-hand, hq-alley, hq-ember, hq-city, hq-glide, hq-blade, hq-gaze, hq-wings, hq-soar, hq-dunes; ex-snow, ex-elder, ex-alley, ex-dragon, ex-portrait, ex-flight, ex-desert |
| Big Buck Bunny (2008) | "Big Buck Bunny" © copyright Blender Foundation, peach.blender.org | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | https://download.blender.org/peach/trailer/ | hq-burrow, hq-giant, hq-trio, hq-meadow, hq-stare, hq-twig, hq-gang, hq-grin, hq-forest, hq-flutter, hq-grump; ex-bunny, ex-rodents, ex-squirrel |

Changes: cropped, scaled and trimmed (no other edits). No endorsement by the Blender Foundation is implied.