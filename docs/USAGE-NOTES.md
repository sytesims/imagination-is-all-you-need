# Usage and licence notes

*Written Oct 17 2026 (UTC+4). Plain-language notes, not legal advice. When these notes and an official licence differ, the licence wins.*

Imagination Is All You Need is free, open-source software (AGPL-3.0-or-later). You run it, you choose the models, and you're responsible for how you use them.
- The app doesn't gate, filter, report or suspend anything based on these notes.
- Nothing here is a contract you have to accept.
- This page tells you what each model's licence asks of *you*, so you can decide.

The full per-model table, with links, is in [LICENSES.md](../LICENSES.md) (also shown in the app at /licenses). The project repo also has the licence list for every workflow and the full attribution list.

## 1. Model licences you're responsible for

| Model (where it's used) | Licence | What it asks of you (short) | Source |
|---|---|---|---|
| **MiniMax H3** (Generate Video, Extend, Camera Motion, Character Swap, Restyle/VFX adapters; local, and as our own workflow on Comfy Cloud (**MiniMax H3 · Comfy Cloud workflow**); **MiniMax H3 · Comfy Cloud**, which runs on Comfy Cloud's API nodes, counts as a hosted provider) | MiniMax H3 Community License (non-OSI) | <ul><li>Free, including commercial use, at ≤ US$20M yearly revenue; above that you need written authorisation (§IV.1).</li><li>**Not licensed in the EU, UK, South Korea or US**; those need a separate licence from MiniMax (§I.5, §II, §V.4).</li><li>Commercial UIs must show "MiniMax H3" (§IV.2).</li><li>Outputs may not be used to improve other AI models (§V.3).</li><li>Follow the Acceptable Use Policy (Exhibit A).</li></ul> | https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE |
| **LTX-2 19B** (Re-shoot default, "LTX camera" presets) | LTX-2 Community License | <ul><li>Free, including commercial use, for entities under US$10M yearly revenue; above that you need a paid licence.</li><li>Use restrictions are in Attachment A.</li><li>The Gemma 3 text encoder it uses has its own Gemma Terms of Use and prohibited-use policy.</li></ul> | https://github.com/Lightricks/LTX-2/blob/main/LICENSE · https://ai.google.dev/gemma/terms |
| **FLUX 3 Image Klein** (Create Image) | FLUX Kommunity License v1.0 (non-OSI) | <ul><li>Non-commercial use only.</li><li>Commercial use of *outputs* only for "Qualifying Users" (under US$5M revenue).</li><li>The licence asks for content filtering or output review, and AI disclosure where the law requires it.</li><li>No training of competing models.</li></ul> | https://huggingface.co/black-forest-labs/flux-3-image-klein/blob/main/LICENSE.md |
| **FLUX.2 [dev]** (Create Image) | FLUX [dev] Non-Commercial License v2.0 | <ul><li>The weights are for non-commercial use.</li><li>Outputs may be used commercially, but not to train a competing model.</li></ul> | https://raw.githubusercontent.com/black-forest-labs/flux2/main/model_licenses/LICENSE-FLUX-DEV |
| **FLUX.2 [klein] 4B** (Create Image) | Apache-2.0 | Keep the licence notice. | https://huggingface.co/black-forest-labs/FLUX.2-klein-4B |
| **Qwen Image 2.1** (Create Image default) | Qwen Research License | <ul><li>Research and non-commercial use only.</li><li>Credit Qwen if you use outputs to build AI models.</li></ul> | https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE |
| **Qwen-Image / Qwen-Image-Edit-2509** | Apache-2.0 | Keep the licence notice. | https://huggingface.co/Qwen/Qwen-Image |
| **Lucy Edit Dev** (Decart; Object Swap research option, not available yet) | Licence: Lucy Edit Dev Model Non-Commercial License ([model card](https://huggingface.co/decart-ai/Lucy-Edit-1.1-Dev)), checked Oct 18, 2026 | <ul><li>Non-commercial use only. It's your responsibility to read the full licence (linked from the model card) before you use it.</li></ul> | https://huggingface.co/decart-ai/Lucy-Edit-1.1-Dev |
| **SAM 3.1** (Object Swap mask preview) | Licence: SAM License ([licence file](https://github.com/facebookresearch/sam3/blob/main/LICENSE)), checked Oct 18, 2026 | <ul><li>Royalty-free, including commercial use.</li><li>Include the licence text if you redistribute.</li><li>Trade-control and military-use limits.</li><li>The official download on Hugging Face asks you to request access first. Following these terms is your responsibility.</li></ul> | https://github.com/facebookresearch/sam3/blob/main/LICENSE · https://huggingface.co/facebook/sam3.1 |
| **SAM 2** (Object Swap masking) | Apache-2.0 | Keep the licence notice. | https://github.com/facebookresearch/sam2/blob/main/LICENSE |
| **Wan 2.2 Animate / Fun Camera / VACE** (Object Swap, Motion Transfer, Re-shoot) | Apache-2.0 | Keep the licence notice; list third-party repacks' licences too. | https://huggingface.co/Wan-AI |
| **SeedVR2** (Upscale) · **Z-Image** (Create Image) | Apache-2.0 | Keep the licence notice. | https://huggingface.co/ByteDance-Seed/SeedVR2-3B · https://huggingface.co/Tongyi-MAI/Z-Image-Turbo |
| **MOSS-Image (SFT / Base)** (OpenMOSS; text-rendering image model. **In Create Image as a local open-weights model (SFT default, Base variant); needs ComfyUI 0.41.3+; not on Comfy Cloud yet**) | Apache-2.0 (weights and bundled inference code) | <ul><li>Commercial use allowed.</li><li>Keep the licence notice if you redistribute the weights.</li><li>No credit line is required.</li><li>The pipeline code and third-party parts (Qwen text encoder, FLUX.2 small VAE decoder) keep their own licences.</li></ul> | https://huggingface.co/OpenMOSS-Team/MOSS-Image-SFT · https://huggingface.co/OpenMOSS-Team/MOSS-Image-Base |
| **Stable Audio Open 1.0** | Stability AI Community License | <ul><li>Free under US$1M yearly revenue.</li><li>Credit: "Powered by Stability AI".</li></ul> | https://huggingface.co/stabilityai/stable-audio-open-1.0/blob/main/LICENSE.md |
| **Fish Audio Drama 3** (Voice) | Fish Audio Community License v1.0 | <ul><li>Research and non-commercial use; commercial use only under US$500k revenue.</li><li>No licence to run it as a public hosted TTS or voice-cloning service.</li><li>No cloning of identifiable people without consent.</li><li>Credit: "Built with Fish Audio".</li></ul> | https://huggingface.co/fishaudio/drama-3/blob/main/LICENSE |
| **F5-TTS · MMAudio** | Code MIT, weights CC BY-NC 4.0 | The weights are for non-commercial use, with attribution. | https://huggingface.co/SWivid/F5-TTS · https://huggingface.co/hkchengrex/MMAudio |
| **ACE-Step 1.5 · Chatterbox** | MIT | Keep the licence notice. | https://huggingface.co/ACE-Step/Ace-Step1.5 · https://huggingface.co/ResembleAI/chatterbox |
| **Hosted providers** (fal, Replicate, partner/API nodes incl. **MiniMax H3 · Comfy Cloud** (Comfy Cloud API nodes), direct APIs) | Each provider's own terms | You use your own key and you're bound by that provider's terms. | Linked per model on /licenses |

Licence summaries were checked on Oct 17, 2026 against the project's workflow licence list and each model's licence page (linked above). The Lucy Edit and SAM 3.1 rows were checked again on Oct 18, 2026 against the official model card and licence file.

## 2. MiniMax H3 attribution
- The UI shows the model as **"MiniMax H3"**. Commercial products using H3 must display "MiniMax H3" prominently (licence §IV.2).
- Results made with H3 carry the credit line **"Powered by MiniMax H3"**, the wording suggested in §III.3(a). It appears in the result view, on model pages and on /licenses.
- Other credit lines:
  - "Powered by Stability AI" (Stable Audio Open);
  - "Built with Fish Audio" (Drama 3).
  - Full list: in [LICENSES.md](../LICENSES.md) (also shown in the app at /licenses) and in the project's attribution list.

## 3. Outputs
- You keep whatever rights you have in your uploads and outputs. Model makers may claim none; for example, MiniMax "claims no rights over the Outputs you generate" (H3 §VI.4).
- **Some licences limit what outputs can be used for:**
  - training other AI models: H3 §V.3, FLUX licences, Fish Audio;
  - commercial use: FLUX Kommunity, Qwen research, Lucy, the NC weights.
  - Check the row for the model you used.
- The H3 Acceptable Use Policy asks that AI-generated content published publicly be labelled as such (Exhibit A item 12).
- When a cloud provider refuses a job, the app shows the provider's own reason and ends the job as blocked or failed. Anything the provider itself bills is under its own terms; the app can't refund it, and the spend log shows what it expects the provider to charge. There is no filter or rights check of our own.
- Generations are private by default. Sharing a link or publishing is your choice.

## 4. Not affiliated with Higgsfield
Imagination Is All You Need is an independent, open-source project. It is **not affiliated with, endorsed by, or sponsored by Higgsfield AI** or its owners. "Higgsfield" is used only to describe the product it's inspired by. All other names and marks (MiniMax, Lightricks/LTX, Black Forest Labs, Alibaba/Qwen, Decart, Meta, Stability AI, Fish Audio, ComfyUI and others) belong to their owners.

## 5. Notes for operators
Anyone who hosts Imagination Is All You Need for other people should read MiniMax H3 licence §V.2 and §V.5 themselves (https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE).

---
*These notes describe model/asset usage responsibilities; they are not a promise of licence clearance for a particular output.*
