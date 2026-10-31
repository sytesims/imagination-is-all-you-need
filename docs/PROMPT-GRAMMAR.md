# Prompt grammar

How each model the app offers expects its prompt to be written, and how its inputs (images, videos, audio, elements) are named in the prompt.
The data lives in [`server/src/shared/promptGrammar.ts`](../server/src/shared/promptGrammar.ts) (one entry per model key, with a source URL for every fact).
This page is the readable view. Step 2 (2026-10-26): one rewrite, [`server/src/shared/promptRefs.ts`](../server/src/shared/promptRefs.ts), turns the composer's `@image1` / `@video1` / `@audio1` chips (and our templates' numbered words) into each model's token right before every body is built ([`server/src/routing/jobRefs.ts`](../server/src/routing/jobRefs.ts)); over-long prompts are refused with the cap, never cut.

**Why it matters.** The same reference is written differently per model: Kling wants `<<<image_1>>>`, Seedance and hosted MiniMax H3 read "Image 1", local MiniMax H3 reads `<Picture 1>`, Qwen Image 2.1 reads `<image1>`, local FLUX 3 Klein counts from zero (`<ref_image_0>`), Runway uses `@tag`, and fal's wrappers often take `@Image1`. The composer writes `@image1` for all of them.

**How to read the tables.**
- *Inputs in the prompt*: `tag` = a fixed token, `words` = plain numbered words, `order` = no token, inputs are read in the order sent (describe their roles), `none` = nothing to name. `{n}` is the input's number; numbers start at 1 unless marked 0-based. Extra lines are hosts that read the prompt differently (e.g. fal).
- *Negative*: `field` = a separate negative prompt, `in-prompt` = avoid-words go inside the prompt, `none` = not supported.
- *Our code follows*: whether the place that builds the prompt today follows the grammar (file:line in the data file and in the mismatch list).
- *Confidence*: `official` = the vendor's docs or Comfy's docs / Router schema; `third-party` = a host's wrapper or a guide; `inferred` = our reading of a template, the code or the encoder.
- Comfy's docs are linked, not copied. Consult the linked official model documentation for current syntax and limitations.

**Edge cases covered:** models with no reference support (Veo on our route, Recraft, Wan 2.5 Image, every upscaler), refs by order only (GPT Image, Nano Banana, Luma, Ideogram 4.5), start frame vs refs (Seedance, H3 and Wan 3.0 never mix them; Kling does), audio (lyrics vs instrumental: YuE2 needs lyrics, ACE-Step and MiniMax Music 3 fall back to `[Instrumental]`), 3D (all four offered models are image-only, no prompt), and LoRA trigger words (H3 Camera Motion, CrossView, Style Transfer, VFX Edit, Opensoul looks, LTX XPLDV and IC-LoRAs, Qwen 2.1 BFS swaps).

## Video: generate

| Model key | Name | Prompt | Inputs in the prompt | Limit | Negative | Special | Our code follows | Confidence |
|---|---|---|---|---|---|---|---|---|
| `minimax-h3` | MiniMax H3 | required | words: `Image {n}` `Video {n}` `Audio {n}` · max 9 img, 3 vid, 3 aud<br>local: `<Picture {n}>` `<Video {n}>` `<Audio {n}>` | 50,000 chars | in-prompt | Timeline marks inside the prompt, e.g. "[0s-2s] …", as in the official H3 templates; Generates the sound track with the picture: describe dialogue, effects and music in words; prompt_expansion_mode (H3 Max) rewrites the prompt; we send disabled | yes | official |
| `minimax-h3-camera-motion` | H3 Camera Motion | optional | none | – | none | trigger camera motion,; LoRA trigger "camera motion," then the move phrase (our cameraPrompt) | yes | official, inferred |
| `minimax-h3-talking-photo` | H3 Talking Photo | optional | words: `Image {n}` `Video {n}` `Audio {n}` · max 9 img, 3 vid, 3 aud<br>local: `<Picture {n}>` `<Video {n}>` `<Audio {n}>` | – | none | – | yes | official |
| `minimax-h3-extend` | H3 Extend | optional | none | – | none | – | yes | official, inferred |
| `minimax-h3-max-extend` | H3 Max Extend | optional | none | – | none | – | yes | third-party |
| `ltx-2-19b` | LTX-2 19B | required | none | – | field | Camera LoRAs carry the move; our preset hint is appended to the prompt; @image mentions are not understood (no reference input) | yes | official, inferred |
| `wan-2.2-fun-camera-14b` | Wan 2.2 Fun Camera 14B | required | none | – | field | The move is a node setting (camera_pose), not prompt words | yes | official, inferred |
| `wan-2.2-i2v-14b` | Wan 2.2 I2V 14B | required | none | – | field | – | yes | official |
| `ltx-2.5-talking-photo` | LTX-2.5 Talking Photo | optional | none | – | field | – | yes | official |
| `ltx-2.5-22b` | LTX-2.5 22B | required | none | – | field | LoRA templates carry their trigger (e.g. XPLDV "separates into an ordered exploded view."); Sound is generated: describe it | yes | official, inferred |
| `wan-2.2-ti2v-5b` | Wan 2.2 5B | required | none | – | field | – | yes | official |
| `seedance-2.0` | Seedance 2.0 | required | words: `Image {n}` `Video {n}` `Audio {n}` · max 9 img, 3 vid, 3 aud<br>fal: `@Image{n}` `@Video{n}` `@Audio{n}` | 40,000 chars | in-prompt | Spoken lines in double quotes steer the generated dialogue; Multi-shot by plain words ("Shot 1: … Shot 2: …"); Legacy "--ratio 16:9" suffixes in the text: we send real fields instead, never the suffix | yes | official, third-party |
| `seedance-2.0-fast` | Seedance 2.0 Fast | required | words: `Image {n}` `Video {n}` `Audio {n}` · max 9 img, 3 vid, 3 aud<br>fal: `@Image{n}` `@Video{n}` `@Audio{n}` | 40,000 chars | in-prompt | Spoken lines in double quotes steer the generated dialogue; Multi-shot by plain words ("Shot 1: … Shot 2: …"); Legacy "--ratio 16:9" suffixes in the text: we send real fields instead, never the suffix | yes | official, third-party |
| `seedance-2.0-mini` | Seedance 2.0 Mini | required | words: `Image {n}` `Video {n}` `Audio {n}` · max 9 img, 3 vid, 3 aud<br>fal: `@Image{n}` `@Video{n}` `@Audio{n}` | 40,000 chars | in-prompt | Spoken lines in double quotes steer the generated dialogue; Multi-shot by plain words ("Shot 1: … Shot 2: …"); Legacy "--ratio 16:9" suffixes in the text: we send real fields instead, never the suffix | yes | official, third-party |
| `seedance-2.5` | Seedance 2.5 | required | words: `Image {n}` `Video {n}` `Audio {n}` · max 30 img, 10 vid, 10 aud<br>fal: `@Image{n}` `@Video{n}` `@Audio{n}` | 40,000 chars | in-prompt | Spoken lines in double quotes steer the generated dialogue; Multi-shot by plain words ("Shot 1: … Shot 2: …"); Legacy "--ratio 16:9" suffixes in the text: we send real fields instead, never the suffix | yes | official, third-party |
| `veo-3.1` | Veo 3.1 | required | none | – | field | Dialogue written as "<who> says: …"; Separate sentences for sound effects and ambience; enhancePrompt defaults to true on Router (we leave it unset, so Veo rewrites the prompt); Negative prompt lists things, never "no …" / "don't …" | yes | official |
| `veo-3.1-fast` | Veo 3.1 Fast | required | none | – | field | Dialogue written as "<who> says: …"; Separate sentences for sound effects and ambience; enhancePrompt defaults to true on Router (we leave it unset, so Veo rewrites the prompt); Negative prompt lists things, never "no …" / "don't …" | yes | official |
| `kling-v3` | Kling 3.0 Omni | required | tag: `<<<image_{n}>>>` `<<<element_{n}>>>` · max 7 img | 2,500 chars | in-prompt | Positive and negative descriptions in one prompt (no negative field); multi_shot / multi_prompt storyboards (not wired); Frames go as image_list type first_frame / end_frame and are not named | partly | official |
| `wan-3.0` | Wan 3.0 | required | words: `Image {n}` `Video {n}` `Audio {n}` · max 10 img, 5 vid, 5 aud | 20,000 chars | field | prompt_extend rewrites the prompt (off unless asked) | yes | official |
| `ltx-2.5-pro` | LTX-2.5 Pro | required | none | 10,000 chars | none | camera_motion is a field (from our preset), not words | yes | official, inferred |
| `ltx-2.5-fast` | LTX-2.5 Fast | required | none | 10,000 chars | none | camera_motion is a field (from our preset), not words | yes | official, inferred |
| `ltx-2.3-fast` | LTX-2.3 Fast | required | none | 10,000 chars | none | camera_motion is a field (from our preset), not words | yes | official, inferred |
| `flux-3-video` | FLUX 3 Video | required | none | – | none | The prompt is interpreted and expanded before generation; Describe ambience, music and speech separately for layered audio | yes | official |

## Video: edit, swap, render

| Model key | Name | Prompt | Inputs in the prompt | Limit | Negative | Special | Our code follows | Confidence |
|---|---|---|---|---|---|---|---|---|
| `minimax-h3-character-swap` | H3 Character Swap | optional | tag: `<Picture {n}>` `<Video {n}>` `<Audio {n}>` · max 1 img, 1 vid | – | none | – | yes | official |
| `minimax-h3-crossview` | H3 CrossView | optional | tag: `<Picture {n}>` `<Video {n}>` `<Audio {n}>` · max 1 img, 1 vid | – | none | trigger crossview.; CrossView-Warp LoRA: the prompt starts with the trigger "crossview." | yes | official, inferred |
| `minimax-h3-style-transfer` | H3 Style Transfer | optional | tag: `<Picture {n}>` `<Video {n}>` `<Audio {n}>` · max 1 img, 1 vid | – | none | trigger style_transfer: | yes | official |
| `minimax-h3-vfx-edit` | H3 VFX Edit | optional | tag: `<Picture {n}>` `<Video {n}>` `<Audio {n}>` · max 0 img, 1 vid | – | none | trigger vfx_edit: | yes | official |
| `wan-2.2-animate-14b` | Wan 2.2 Animate 14B | optional | order: `image {n}` · max 1 img | – | field | – | yes | official |
| `wan-2.1-vace-14b` | Wan 2.1 VACE 14B | optional | order: `image {n}` · max 1 img | – | field | – | yes | official |
| `kling-v3-omni-edit` | Kling 3.0 Omni Edit | required | tag: `<<<image_{n}>>>` `<<<video_{n}>>>` `<<<element_{n}>>>` · max 4 img, 1 vid | 2,500 chars | in-prompt | – | yes | official |
| `seedance-2.5-edit` | Seedance 2.5 Edit | required | words: `Image {n}` `Video {n}` `Audio {n}` · max 30 img, 10 vid, 10 aud | – | in-prompt | – | yes | official, third-party |
| `runway-aleph-2` | Runway Aleph 2 | required | none | 1,000 chars | none | – | yes | official |
| `luma-ray-3.2-edit` | Luma Ray 3.2 Edit | required | none | 6,000 chars | none | – | yes | official |
| `comfy-ltx25-layout` | LTX-2.5 Layout to Render | required | none | – | field | – | yes | official, inferred |
| `comfy-ltx25-iclora` | LTX-2.5 + IC-LoRAs (Footage Effects) | optional | none | – | field | trigger ADD WATER (Water Simulation); Each IC-LoRA has its own trigger or none (shared/ltxLoras.ts) | yes | official |

## Image: generate and edit

| Model key | Name | Prompt | Inputs in the prompt | Limit | Negative | Special | Our code follows | Confidence |
|---|---|---|---|---|---|---|---|---|
| `nano-banana-2` | Nano Banana 2 | required | order: `image {n}` · max 14 img | – | in-prompt | Per-model caps on objects / characters / style references (Gemini docs) | yes | official |
| `nano-banana-2.1` | Nano Banana 2.1 | required | order: `image {n}` · max 14 img | – | in-prompt | Per-model caps on objects / characters / style references (Gemini docs) | yes | official |
| `nano-banana-pro` | Nano Banana Pro | required | order: `image {n}` · max 14 img | – | in-prompt | Per-model caps on objects / characters / style references (Gemini docs) | yes | official |
| `nano-banana-2-lite` | Nano Banana 2 Lite | required | order: `image {n}` · max 14 img | – | in-prompt | Per-model caps on objects / characters / style references (Gemini docs) | yes | official |
| `gpt-image` | GPT Image 2 | required | order: `image {n}` · max 16 img | – | in-prompt | Text to render goes in quotes | yes | official |
| `gpt-image-2.5-flare` | GPT Image 2.5 Flare | required | order: `image {n}` · max 16 img | – | in-prompt | Text to render goes in quotes | yes | official |
| `gpt-image-2.5-sunburst` | GPT Image 2.5 Sunburst | required | order: `image {n}` · max 16 img | – | in-prompt | Text to render goes in quotes | yes | official |
| `gpt-image-1.5` | GPT Image 1.5 | required | order: `image {n}` · max 16 img | – | in-prompt | Text to render goes in quotes | yes | official |
| `seedream-5.0-pro` | Seedream 5.0 Pro | required | words: `image {n}` · max 10 img | – | none | optimize_prompt_options / thinking rewrite the prompt; Describe shape or purpose in words when size is left to the model | yes | official |
| `seedream-5.0-flash` | Seedream 5.0 Flash | required | words: `image {n}` · max 10 img | – | none | optimize_prompt_options / thinking rewrite the prompt; Describe shape or purpose in words when size is left to the model | yes | official |
| `seedream-4.5` | Seedream 4.5 | required | words: `image {n}` · max 14 img | – | none | optimize_prompt_options / thinking rewrite the prompt; Describe shape or purpose in words when size is left to the model | yes | official |
| `flux-2-pro` | FLUX.2 [pro] | required | words: `image {n}` · max 8 img | – | none | JSON structured prompts work as well as prose; Hex colours tied to an object: "sofa in color #1B6B6F"; prompt_upsampling rewrites the prompt (on by default) | yes | official |
| `flux-2-max` | FLUX.2 [max] | required | words: `image {n}` · max 8 img | – | none | JSON structured prompts work as well as prose; Hex colours tied to an object: "sofa in color #1B6B6F"; prompt_upsampling rewrites the prompt (on by default) | yes | official |
| `flux-2-flex` | FLUX.2 [flex] | required | words: `image {n}` · max 10 img | – | none | JSON structured prompts work as well as prose; Hex colours tied to an object: "sofa in color #1B6B6F"; prompt_upsampling rewrites the prompt (on by default) | yes | official |
| `flux-2-klein-9b` | FLUX.2 [klein] 9B | required | words: `image {n}` · max 4 img | – | none | JSON structured prompts work as well as prose; Hex colours tied to an object: "sofa in color #1B6B6F"; prompt_upsampling rewrites the prompt (on by default) | yes | official |
| `flux-3-image` | FLUX 3 Image | required | words: `image {n}` · max 10 img | 15,000 chars | none | Interpreted and expanded before generation; Layout boxes: cite box N as <obj_N> (Flux3LayoutPrompt; not wired); grounding = web / image search | yes | official |
| `ideogram-v4` | Ideogram V4 | required | none | – | none | Text to render goes in quotes; magic_prompt rewrite (not sent) | yes | official |
| `ideogram-4.5` | Ideogram 4.5 | required | order: `image {n}` · max 5 img | 10,000 chars | none | Text to render goes in quotes | yes | official |
| `recraft-v4` | Recraft V4 | required | none | 10,000 chars | none | Negative prompt is ignored by V4 / V4.1 | yes | official |
| `recraft-v4.1` | Recraft V4.1 | required | none | 10,000 chars | none | Negative prompt is ignored by V4 / V4.1 | yes | official |
| `recraft-v4.1-pro` | Recraft V4.1 Pro | required | none | 10,000 chars | none | Negative prompt is ignored by V4 / V4.1 | yes | official |
| `luma-image` | Luma UNI-1 | required | order: `image {n}` · max 9 img | 6,000 chars | none | style manga needs a portrait aspect; web_search (off) | yes | official |
| `luma-uni-1-max` | Luma UNI-1 Max | required | order: `image {n}` · max 9 img | 6,000 chars | none | style manga needs a portrait aspect; web_search (off) | yes | official |
| `kling-image-o1` | Kling Image O1 | required | tag: `<<<image_{n}>>>` `<<<element_{n}>>>` · max 10 img<br>fal: `@Image{n}` `@Element{n}` | 2,500 chars | in-prompt | – | yes | official, third-party |
| `krea` | Krea 3 | required | tag: `@Image{n}` · max 8 img | – | none | Krea rewrites the prompt; the same seed doesn't repeat an image | yes | official |
| `runway-gen4-image` | Runway Gen-4 Image | required | tag: `@{tag}` · max 3 img | – | none | – | **no** | official, third-party |
| `grok-imagine-image` | Grok Imagine Image 2.0 | required | order: `image {n}` · max 5 img | – | none | – | yes | official |
| `grok-imagine-image-pro` | Grok Imagine Image Pro | required | none | – | none | – | yes | official |
| `qwen-image-3` | Qwen Image 3.0 | required | words: `image {n}` · max 3 img | – | field | prompt_extend rewrites (off unless asked) | yes | official |
| `qwen-image-3-pro` | Qwen Image 3.0 Pro | required | words: `image {n}` · max 3 img | – | field | prompt_extend rewrites (off unless asked) | yes | official |
| `wan-image-2.5` | Wan 2.5 Image | required | none | 800 chars | field | prompt_extend (off unless asked) | yes | official |
| `hunyuan-image-3.5` | HY Image 3.5 Preview | required | none | – | none | The model rewrites and expands the prompt | yes | official |
| `meta-muse-image` | Muse Image 1.0 | required | tag: `@image{n}` · max 10 img | – | none | Agentic: may search the web (off) | yes | official |
| `minimax-image-01` | MiniMax image-01 | required | none | 1,500 chars | none | prompt_optimizer (we send false) | yes | official |
| `fibo-2.0` | FIBO 2.0 | required | order: `image {n}` · max 1 img | – | field | structured_prompt (JSON) instead of the prompt: exactly one of the two; Our Structured option sends our caption JSON | yes | official |
| `qwen-image-2.1` | Qwen Image 2.1 | required | tag: `<image{n}>` · max 16 img | – | field | trigger head_swap:; trigger body_swap:; BFS swap LoRAs: "head_swap:" / "body_swap:" trigger prompts | yes | official, inferred |
| `qwen-image-2.1-turbo` | Qwen Image 2.1 Turbo | required | tag: `<image{n}>` · max 1 img | – | field | – | yes | official |
| `qwen-image` | Qwen-Image | required | words: `Picture {n}` · max 3 img | – | field | – | yes | official, inferred |
| `qwen-image-edit-2509` | Qwen-Image-Edit-2509 | required | words: `Picture {n}` · max 3 img<br>replicate:qwen/qwen-image-edit-2511: order | – | field | – | yes | official |
| `qwen-image-edit-2509-angles` | Qwen-Image-Edit-2509 + Multiple-angles LoRA | required | order: `image {n}` · max 1 img | – | field | The LoRA's documented camera instructions lead each prompt ("Rotate the camera 45 degrees to the left.") | yes | official |
| `z-image-turbo` | Z-Image-Turbo | required | none | – | none | Distilled, CFG 1: a negative prompt has no effect | yes | official, inferred |
| `z-image` | Z-Image | required | none | – | field | – | yes | official, inferred |
| `flux-2-klein-4b` | FLUX.2 [klein] 4B | required | order: `image {n}` · max 1 img | – | none | – | yes | official, inferred |
| `flux-3-klein` | FLUX 3 Klein | required | tag: `<ref_image_{n}>` (0-based) · max 10 img<br>direct: `image {n}`<br>fal: `image {n}`<br>router: `image {n}` | – | none | – | yes | official |
| `flux-2-dev` | FLUX.2 [dev] | required | order: `image {n}` · max 1 img | – | none | – | yes | official |
| `moss-image` | MOSS-Image | required | none | – | field | Optional JSON layout prompt (caption + labelled boxes) from MOSSImageLayoutPrompt; not wired | yes | official |
| `moss-image-base` | MOSS-Image Base | required | none | – | field | Optional JSON layout prompt (caption + labelled boxes) from MOSSImageLayoutPrompt; not wired | yes | official |
| `opensoul` | Z-Image-Turbo + look LoRAs | required | order | – | none | trigger (per look, e.g. "Candid Instax Photo,", "velatrix", "50s Noir Movie Still,"); Each look LoRA has a trigger word, put first (tools/soul/presets.ts) | yes | inferred |
| `bria-genfill` | Bria GenFill | required | none | – | field | refine_prompt rewrites (on by default) | yes | official |
| `bria-expand` | Bria Expand | optional | none | – | none | – | yes | official |
| `seedream-5.0-flash-layers` | Seedream 5.0 Flash (layers) | optional | none | – | none | Target regions with <bbox>left top right bottom</bbox>, 0–1000 per-mille | yes | official |
| `seedream-5.0-pro-layers` | Seedream 5.0 Pro (layers) | optional | none | – | none | Target regions with <bbox>left top right bottom</bbox>, 0–1000 per-mille | yes | official |
| `qwen-image-layered` | Qwen-Image-Layered (unknown) | optional | none | – | unknown | – | – | official |

## Audio: music and sound

| Model key | Name | Prompt | Inputs in the prompt | Limit | Negative | Special | Our code follows | Confidence |
|---|---|---|---|---|---|---|---|---|
| `minimax-music-3` | MiniMax Music 3 | required | none | – | none | caption + lyrics, two inputs; Lyrics section tags: [Intro] [Verse] [Pre-Chorus] [Chorus] [Post-Chorus] [Bridge] [Instrumental] [Solo] [Outro]; Empty lyrics → we send "[Instrumental]" (Local and Comfy Cloud, the same template graph) | yes | official |
| `sonilo-music` | Sonilo Music | required | none | 1,000 chars | none | No lyrics field: instrumental or described vocals only | yes | official |
| `sonilo-video-to-music` | Sonilo Video-to-Music | optional | none | – | none | Empty prompt gives the best result (the model reads the video) | yes | official |
| `ace-step-1.5` | ACE-Step 1.5 | required | none | – | none | tags + lyrics fields; Lyrics section tags like [Verse 1], [Chorus], with stage notes after a dash; Empty lyrics → we send "[Instrumental]" | yes | official |
| `yue2` | YuE2 | required | none | – | none | Lyrics are required (no instrumental); style: language, voice, genre, BPM, instruments; [Verse] / [Chorus] sections | yes | inferred |
| `stable-audio-open-1.0` | Stable Audio Open 1.0 | required | none | – | field | Up to about 47 s; Comma-separated descriptors (genre, instruments, BPM) work best | yes | official |
| `mmaudio` | MMAudio | optional | none | – | field | – | yes | inferred |
| `elevenlabs-sound-effects` | ElevenLabs Sound Effects | required | none | – | none | prompt_influence 0–1 (we send 0.3); 0.5–30 s | yes | official |

## Audio: voice

| Model key | Name | Prompt | Inputs in the prompt | Limit | Negative | Special | Our code follows | Confidence |
|---|---|---|---|---|---|---|---|---|
| `seed-audio` | ByteDance Seed Audio | required | tag: `@Audio{n}` · max 3 aud | 3,000 chars | none | One prompt describes voices, emotion, ambience, music and effects, with the lines to speak; Name characters inline for dialogue; Music / Sound effects: describe the sound (no lyrics or length field; up to 2 min) | yes | official |
| `elevenlabs-v3` | ElevenLabs v3 | required | none | 5,000 chars | none | Audio tags in square brackets: [whispers], [laughs], [sighs]…; No SSML <break>: use tags, ellipses, punctuation; Dialogue lines start "Speaker 1:" | yes | official |
| `elevenlabs-v4` | ElevenLabs v4 | required | none | – | none | Tag support for v4 is not documented in the pages we read; plain script is safe | yes | official |
| `elevenlabs-v4-turbo` | ElevenLabs v4 Turbo | required | none | – | none | Tag support for v4 is not documented in the pages we read; plain script is safe | yes | official |
| `minimax-speech-2.8-hd` | MiniMax Speech 2.8 HD | required | none | 9,999 chars | none | Pauses: <#0.5#> (seconds, 0.01–99.99, never two in a row); Interjections in parentheses: (laughs) (sighs) (coughs) (breath)… | partly | official |
| `minimax-speech-2.8-turbo` | MiniMax Speech 2.8 Turbo | required | none | 9,999 chars | none | Pauses: <#0.5#> (seconds, 0.01–99.99, never two in a row); Interjections in parentheses: (laughs) (sighs) (coughs) (breath)… | partly | official |
| `fish-audio-s2.1-pro` | Fish Audio S2.1 Pro | required | none | – | none | Inline emotion / delivery tags in brackets (Fish S2 family) | yes | inferred |
| `heygen-voice` | HeyGen Voice | required | none | – | none | ssml flag (we send false) | yes | inferred |
| `qwen3-tts` | Qwen3 TTS 1.7B | required | none | – | none | One of 9 preset voices by name; optional Style instruction sent apart from the script; no inline tags | yes | official |
| `chatterbox` | Chatterbox | required | none | – | none | Delivery via exaggeration / cfg_weight settings, not tags | yes | inferred |
| `chatterbox-voice-changer` | Chatterbox Voice Changer | none | none | – | none | – | – | inferred |
| `fish-audio-drama-3` | Fish Audio Drama 3 | required | none | – | none | Point tags [sighs] [laughs] [pause]; Scoped <whisper>…</whisper>, <slow>…</slow>; Style prefix [with bright eager excitement]; Speakers <\|speaker:0\|>; Language hint [language: en] | yes | official |
| `f5-tts` | F5-TTS | required | none | – | none | – | yes | inferred |
| `translate-chatterbox` | Translate with Chatterbox | none | none | – | none | – | n/a | inferred |
| `translate-f5-tts` | Translate with F5-TTS | none | none | – | none | – | n/a | inferred |

## Upscale, utilities, 3D and our own tools (no prompt or a fixed one)

| Model key | Name | Prompt | Inputs in the prompt | Limit | Negative | Special | Our code follows | Confidence |
|---|---|---|---|---|---|---|---|---|
| `seedvr2` | SeedVR2 | none | none | – | none | – | n/a | inferred |
| `flux-3-upscaler` | FLUX 3 Upscaler | optional | none | – | none | Prompt only in creative mode | yes | official |
| `birefnet` | BiRefNet | none | none | – | none | – | n/a | inferred |
| `bria-video-background-removal` | Bria Video Background Removal | none | none | – | none | – | – | official |
| `luma-ray-2-reframe` | Luma Reframe | optional | none | – | none | – | yes | official |
| `rife-4.9` | RIFE 4.9 | none | none | – | none | – | n/a | inferred |
| `depth-anything-v2-small` | Depth Anything V2 Small | none | none | – | none | – | – | inferred |
| `ffmpeg-hdr10` | ffmpeg HDR10 conversion | none | none | – | none | – | – | inferred |
| `real-esrgan` | Real-ESRGAN | none | none | – | none | – | n/a | official |
| `4x-ultrasharp` | 4x-UltraSharp | none | none | – | none | – | n/a | official |
| `seedvr2-image` | SeedVR2 | none | none | – | none | – | n/a | official |
| `seedvr2-3b-image` | SeedVR2 3B | none | none | – | none | – | n/a | official |
| `4x-nomos2` | 4x Nomos2 DAT2 | none | none | – | none | – | n/a | official |
| `crystal-upscaler` | Crystal Upscaler | none | none | – | none | – | n/a | official |
| `topaz-wonder-3.5` | Topaz Wonder 3.5 | none | none | – | none | – | n/a | official |
| `topaz-standard-v2` | Topaz Standard V2 | none | none | – | none | – | n/a | official |
| `topaz-bloom-2` | Topaz Bloom 2 | none | none | – | none | – | n/a | official |
| `bria-increase-resolution` | Bria Increase Resolution | none | none | – | none | – | n/a | official |
| `z-image-turbo-2k-upscaler` | Z-Image-Turbo 2K upscaler | none | none | – | none | – | n/a | inferred |
| `bria-rmbg-2.0` | Bria RMBG 2.0 | none | none | – | none | – | n/a | official |
| `ideogram-remove-background` | Ideogram Remove Background | none | none | – | none | – | – | third-party |
| `ideogram-3-reframe` | Ideogram 3.0 Reframe | none | none | – | none | – | – | third-party |
| `bria-eraser` | Bria Eraser | none | none | – | none | – | – | official |
| `fal-object-removal` | fal Object Removal | none | none | – | none | – | – | third-party |
| `fashn-tryon-1.6` | FASHN Virtual Try-On v1.6 | none | none | – | none | – | n/a | third-party |
| `cloud-tripo-31` | Tripo 3.1 | none | none | – | none | – | n/a | official |
| `fal-trellis2` | TRELLIS.2 | none | none | – | none | – | n/a | third-party |
| `fal-hunyuan3d-31` | Hunyuan 3D 3.1 | none | none | – | none | – | n/a | official |
| `comfy-pixal3d-trellis2` | Pixal3D + TRELLIS.2 | none | none | – | none | – | n/a | inferred |
| `local-turntable` | Turntable recorder | none | none | – | none | – | n/a | inferred |
| `local-previz` | Direct a Shot (mockup) | none | none | – | none | – | n/a | inferred |


## Mismatches in our code (bugs for step 2)

Ranked by impact. Same list as `GRAMMAR_MISMATCHES` in the data file.

1. **video-mentions-raw** (fixed in step 2, high; `seedance-2.0`, `seedance-2.0-fast`, `seedance-2.0-mini`, `seedance-2.5`, `minimax-h3`, `wan-3.0`)  
   Where: `server/src/routing/routerModels.ts:435`, `server/src/routing/routerModels.ts:732`, `server/src/routing/routerModels.ts:719`, `server/src/providers/byteplus.ts:118`  
   Problem: Reference to video sends the composer's "@image1" / "@video1" as typed. These models read "Image 1" / "Video 1" / "Audio 1" by order, so the model can't tie a sentence to an input.  
   Fix: One shared rewrite per model from this table (refToken): @imageN → "Image N" etc., run where the body is built; keep the composer's @ chips as they are.

2. **kling-mentions** (fixed in step 2, high; `kling-v3`)  
   Where: `server/src/routing/routerModels.ts:223`  
   Problem: klingRefPrompt only appends "Reference images: <<<image_1>>>…" when no tag is present; the user's "@image1" stays in the text, so the prompt names the image twice in two syntaxes.  
   Fix: Rewrite @imageN → <<<image_N>>> in place, then append only the refs still unnamed.

3. **kling-image-tags** (fixed in step 2, high; `kling-image-o1`)  
   Where: `server/src/tools/media.ts:126`, `server/src/routing/routerModels.ts:617`, `server/src/tools/imageFalModels.ts:84`  
   Problem: Edit rewrites @image1 to "image 1" for every model. Kling Image O1 wants <<<image_1>>> on Router and @Image1 on fal; the face / person swap apps also say "image 1".  
   Fix: Make the Edit rewrite per model and per place (Router: <<<image_N>>>, fal: @ImageN).

4. **flux3-klein-zero-based** (fixed in step 2, high; `flux-3-klein`)  
   Where: `server/src/comfy/plans.ts:302`  
   Problem: The local multi-reference graph names references <ref_image_0>, <ref_image_1> (zero-based). We send "image 1" / "image 2", so multi-image edits and swaps on FLUX 3 Klein can't address the right input.  
   Fix: For comfy-flux3-klein multiref: image N → <ref_image_{N-1}> (and the same in the negative), like qwen21ImageTags does for Qwen 2.1.

5. **h3-local-tags** (fixed in step 2, medium; `minimax-h3-talking-photo`, `minimax-h3-style-transfer`, `minimax-h3-vfx-edit`)  
   Where: `workflows/h3-lipsync-api.json`, `workflows/h3-style-transfer-api.json`, `workflows/h3-vfx-edit-api.json`, `server/src/tools/h3/plan.ts:45`, `server/src/tools/h3/plan.ts:65`  
   Problem: Local MiniMaxH3ReferenceToVideo graphs say "Image 1" / "Video 1" / "Audio 1"; the native node reads <Picture 1> / <Video 1> / <Audio 1> (our own swap prompts already do).  
   Fix: Change the three template prompts to the native tags and rewrite user mentions on local H3 jobs.

6. **runway-untagged** (open, medium; `runway-gen4-image`)  
   Where: `server/src/routing/routerModels.ts:630`  
   Problem: Runway names each reference with a tag and the prompt says @tag; we send referenceImages with uri only, so a prompt can't point at a reference.  
   Fix: Left open in step 2 (no paid run to test it). Check whether Router forwards referenceImages[].tag (strict_mode off translates the body); if it does, send tag "image1"… and rewrite @imageN → @imageN; if not, keep refs order-only and say so in the hint.

7. **seedance-swap-words** (fixed in step 2, medium; `seedance-2.5-edit`)  
   Where: `server/src/routing/routerModels.ts:488`, `server/src/shared/renderModels.ts:111`  
   Problem: Swap prompts say "the reference video" / "the reference image"; Render mixes that with "Image 1". Seedance's own labels are "Video 1" / "Image 1".  
   Fix: Pass video: "Video 1", image: "Image 1" to swapPrompt and use the same in renderPrompt.

8. **qwen-2509-picture** (fixed in step 2, medium; `qwen-image-edit-2509`)  
   Where: `server/src/tools/shots.ts:45`, `server/src/tools/shots.ts:49`  
   Problem: TextEncodeQwenImageEditPlus labels inputs "Picture 1", "Picture 2" for the model; our swap prompts say "image 1" / "image 2".  
   Fix: On local Qwen-Edit-2509 jobs rewrite "image N" → "Picture N" (inferred: A/B on a few swaps first).

9. **silent-truncation** (fixed in step 2, low; `minimax-h3`, `minimax-image-01`, `minimax-speech-2.8-hd`, `minimax-speech-2.8-turbo`)  
   Where: `server/src/hostedRequests.ts:190`, `server/src/hostedRequests.ts:216`, `server/src/hostedRequests.ts:123`  
   Problem: Prompts over 7,000 / 1,500 / 9,999 characters are cut without a word to the user (other routes refuse with a message).  
   Fix: Refuse at quote / submit with the limit from this table, like Kling and Wan do.

10. **veo-enhance** (fixed in step 2, low; `veo-3.1`, `veo-3.1-fast`)  
   Where: `server/src/routing/routerModels.ts:453`  
   Problem: Router's enhancePrompt defaults to true and we never send it, so Veo rewrites every prompt and the app's "prompt rewrite" off has no effect.  
   Fix: Send parameters.enhancePrompt = (i.promptRewrite === true), as Wan and Qwen do.

11. **director-mentions-local** (fixed in step 2, low; `ltx-2-19b`, `wan-2.2-fun-camera-14b`)  
   Where: `server/src/cinema/tool.ts:142`, `server/src/comfy/plans.ts:185`, `server/src/comfy/plans.ts:179`  
   Problem: Director keeps "@image1" in finalPrompt; local LTX-2 / Wan Fun Camera have no reference input, so the token is read as text.  
   Fix: Strip or replace mentions with the asset's description for models whose refs.style is none.


## Structure and example per model

Examples are our own words.

| Model key | Structure | Example |
|---|---|---|
| `minimax-h3` | Look and mood line, then a "Timeline:" block of [start-end] beats, then sound. In Reference to video, name each input as Image N / Video N / Audio N. | A rainy neon alley, cinematic. Timeline: [0s-2s] Image 1 steps out of a taxi. [2s-5s] she looks up at the sign, rain on her face. Sound: rain, distant traffic. |
| `minimax-h3-camera-motion` | "camera motion, <adverb> <move>." then the user's extra words. | camera motion, slow orbit around the subject. Keep the statue still. |
| `minimax-h3-talking-photo` | "<Picture 1> speaks the words of <Audio 1> …" (local) or "Image 1 … Audio 1" (hosted), then expression and head motion. | <Picture 1> speaks the words of <Audio 1> with natural lip sync, small nods and blinks; keep the face exactly the same. |
| `minimax-h3-extend` | What happens next, in the same look; no recap of the clip. | She keeps walking, turns the corner and the camera follows her into the market. |
| `minimax-h3-max-extend` | What happens next. | The drone keeps rising until the whole valley is in view. |
| `minimax-h3-character-swap` | Replace <who> in <Video 1> with the character in <Picture 1>; keep motion, camera, light. | Replace the runner in <Video 1> with the knight in <Picture 1>; same pace, same camera, same light. |
| `minimax-h3-crossview` | "crossview." then what the new angle reveals. | crossview. The far side of the room comes into view, a window behind the desk. |
| `minimax-h3-style-transfer` | "style_transfer: restyle <Video 1> in the style of <Picture 1>", then what to keep. | style_transfer: restyle <Video 1> as the watercolour in <Picture 1>; keep the motion and timing. |
| `minimax-h3-vfx-edit` | "vfx_edit:" then the effect on <Video 1>, then what stays. | vfx_edit: add glowing embers drifting up around the dancer in <Video 1>; keep everything else. |
| `ltx-2-19b` | One flowing paragraph, present tense: shot and subject, action beat by beat, camera, light, sound. Long and literal beats short. | A slow dolly in on a potter at her wheel; clay rises between her hands, late sun through dusty glass, the wheel hums. |
| `wan-2.2-fun-camera-14b` | Subject, action, scene; the move phrase follows. | A lighthouse on a cliff at dusk, waves breaking below. The camera pans left. |
| `wan-2.2-animate-14b` | Short: who the character is and that they follow the clip. | The character performs the same moves as in the video, natural and smooth. |
| `wan-2.1-vace-14b` | Style words for the whole clip, with the subject slot filled. | watercolour painting of a cyclist on a coastal road, soft paper texture |
| `wan-2.2-i2v-14b` | The one motion or effect, then keep the subject. | The subject slowly floats upward as petals swirl around them. |
| `ltx-2.5-talking-photo` | Who is speaking and how; our base lip-sync sentence follows. | A calm news presenter, steady gaze, slight smile. |
| `ltx-2.5-22b` | One flowing present-tense paragraph: shot, subject, action beats, camera, light, sound. | The camera holds on a kettle on a stove; steam starts to curl, then it whistles sharply. |
| `wan-2.2-ti2v-5b` | Subject and look, then the action in order, then camera move, then sound / dialogue; one shot unless the model does multi-shot. | A red kite climbs over a windy beach, tail snapping, kids running below. |
| `seedance-2.0` | Subject (name each input: Image 1 is …), action in shots, camera, then sound and quoted dialogue. | Image 1 is the dancer, Video 1 the routine. She performs the routine on a rooftop at dawn. Shot 2: close-up as she says "again". |
| `seedance-2.0-fast` | Subject (name each input: Image 1 is …), action in shots, camera, then sound and quoted dialogue. | Image 1 is the dancer, Video 1 the routine. She performs the routine on a rooftop at dawn. Shot 2: close-up as she says "again". |
| `seedance-2.0-mini` | Subject (name each input: Image 1 is …), action in shots, camera, then sound and quoted dialogue. | Image 1 is the dancer, Video 1 the routine. She performs the routine on a rooftop at dawn. Shot 2: close-up as she says "again". |
| `seedance-2.5` | Subject (name each input: Image 1 is …), action in shots, camera, then sound and quoted dialogue. | Image 1 is the dancer, Video 1 the routine. She performs the routine on a rooftop at dawn. Shot 2: close-up as she says "again". |
| `veo-3.1` | Subject, action, scene, camera angle and move, lens, style and light, timing, then audio. | Low-angle tracking shot of a cyclist racing a train at sunset. She shouts: "Almost there!" Sound: wind, the train horn. |
| `veo-3.1-fast` | Subject, action, scene, camera angle and move, lens, style and light, timing, then audio. | Low-angle tracking shot of a cyclist racing a train at sunset. She shouts: "Almost there!" Sound: wind, the train horn. |
| `kling-v3` | Name each input by tag, then action, camera and sound. | <<<image_1>>> walks through the market in <<<image_2>>>'s style; handheld, warm evening light. |
| `kling-v3-omni-edit` | Replace / turn <<<video_1>>> …, with <<<image_1>>> as the character or look; then what to keep. | Replace the man on the left in <<<video_1>>> with the character from <<<image_1>>>; keep the motion, camera and light. |
| `seedance-2.5-edit` | Edit Video 1 …, with Image 1 as the character; then keep list. | Replace the woman in the red coat in Video 1 with the character in Image 1; same motion and framing. |
| `runway-aleph-2` | What should appear in the output; the source video is implied. | A finished live-action street at night: wet asphalt, neon reflections, real people. |
| `luma-ray-3.2-edit` | The edit, then keep the motion. | Real materials and daylight on the toy cars; keep every move the same. |
| `wan-3.0` | Name inputs Image 1 / Video 1 / Audio 1, then action, camera, sound. | Image 1 and Image 2 meet at a train platform; Image 1 hands over a letter. Slow push in. |
| `ltx-2.5-pro` | One flowing present-tense paragraph: shot, subject, action, camera, light, sound. | A barista slides a latte across the counter; the camera tracks the cup, morning light, the hiss of the steamer. |
| `ltx-2.5-fast` | One flowing present-tense paragraph: shot, subject, action, camera, light, sound. | A barista slides a latte across the counter; the camera tracks the cup, morning light, the hiss of the steamer. |
| `ltx-2.3-fast` | One flowing present-tense paragraph: shot, subject, action, camera, light, sound. | A barista slides a latte across the counter; the camera tracks the cup, morning light, the hiss of the steamer. |
| `flux-3-video` | Plain-language shot, then the three sound layers. | A fox trots across fresh snow at dawn. Ambience: soft wind. Music: a lone cello. No speech. |
| `flux-3-upscaler` | Creative mode: the detail to add. | Crisp fabric texture and sharp foliage. |
| `nano-banana-2` | A described scene in sentences, not keyword lists; then the edit and the keep list. | Seat the woman from the first image at the café table in the second image, matching the afternoon light. |
| `nano-banana-2.1` | A described scene in sentences, not keyword lists; then the edit and the keep list. | Seat the woman from the first image at the café table in the second image, matching the afternoon light. |
| `nano-banana-pro` | A described scene in sentences, not keyword lists; then the edit and the keep list. | Seat the woman from the first image at the café table in the second image, matching the afternoon light. |
| `nano-banana-2-lite` | A described scene in sentences, not keyword lists; then the edit and the keep list. | Seat the woman from the first image at the café table in the second image, matching the afternoon light. |
| `gpt-image` | Name each input's role, say the one change, then list what to keep (face, pose, light, background). | Put the jacket from image 2 on the man in image 1; keep his pose, face and the street behind him. |
| `gpt-image-2.5-flare` | Name each input's role, say the one change, then list what to keep (face, pose, light, background). | Put the jacket from image 2 on the man in image 1; keep his pose, face and the street behind him. |
| `gpt-image-2.5-sunburst` | Name each input's role, say the one change, then list what to keep (face, pose, light, background). | Put the jacket from image 2 on the man in image 1; keep his pose, face and the street behind him. |
| `gpt-image-1.5` | Name each input's role, say the one change, then list what to keep (face, pose, light, background). | Put the jacket from image 2 on the man in image 1; keep his pose, face and the street behind him. |
| `seedream-5.0-pro` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | Use the product in image 1 on the marble counter from image 2, soft window light, catalogue look. |
| `seedream-5.0-flash` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | Use the product in image 1 on the marble counter from image 2, soft window light, catalogue look. |
| `seedream-4.5` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | Use the product in image 1 on the marble counter from image 2, soft window light, catalogue look. |
| `flux-2-pro` | Subject, action, style, context; 30–80 words is the sweet spot. | Subject from image 1, style from image 2: a ceramic owl on a bookshelf, mug in color #C92695. |
| `flux-2-max` | Subject, action, style, context; 30–80 words is the sweet spot. | Subject from image 1, style from image 2: a ceramic owl on a bookshelf, mug in color #C92695. |
| `flux-2-flex` | Subject, action, style, context; 30–80 words is the sweet spot. | Subject from image 1, style from image 2: a ceramic owl on a bookshelf, mug in color #C92695. |
| `flux-2-klein-9b` | Subject, action, style, context; 30–80 words is the sweet spot. | Subject from image 1, style from image 2: a ceramic owl on a bookshelf, mug in color #C92695. |
| `flux-3-image` | An instruction: what to make or change, then refer to images as image 1, image 2. | Combine the chair from image 1 with the fabric of image 2, shot in a bright loft. |
| `ideogram-v4` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | A vintage travel poster that reads "VISIT MARS" in bold red letters over dunes. |
| `ideogram-4.5` | Name each input's role, say the one change, then list what to keep (face, pose, light, background). | Change the shop sign in the first image to read "OPEN LATE"; keep the street as it is. |
| `recraft-v4` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | Flat vector illustration of a fox reading under a lamp, teal and orange palette. |
| `recraft-v4.1` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | Flat vector illustration of a fox reading under a lamp, teal and orange palette. |
| `recraft-v4.1-pro` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | Flat vector illustration of a fox reading under a lamp, teal and orange palette. |
| `luma-image` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | Repaint the photo as a soft pastel storybook page; keep the girl and her dog. |
| `luma-uni-1-max` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | Repaint the photo as a soft pastel storybook page; keep the girl and her dog. |
| `kling-image-o1` | Name each input's role, say the one change, then list what to keep (face, pose, light, background). | Dress <<<image_1>>> in the coat from <<<image_2>>>, studio white backdrop. |
| `krea` | What to change and what to keep. | Give @Image1 the lighting of @Image2; keep the face and outfit. |
| `runway-gen4-image` | @tag for each reference, then the scene. | @hero stands on the bridge from @city at blue hour, wide shot. |
| `grok-imagine-image` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | A cosy cabin interior in winter, fire glowing, snow at the window. |
| `grok-imagine-image-pro` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | A cosy cabin interior in winter, fire glowing, snow at the window. |
| `qwen-image-3` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | A night market in Taipei with bilingual signs reading "夜市 NIGHT MARKET", steam rising. |
| `qwen-image-3-pro` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | A night market in Taipei with bilingual signs reading "夜市 NIGHT MARKET", steam rising. |
| `wan-image-2.5` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | An ink-wash mountain village in morning mist, a red umbrella on the bridge. |
| `hunyuan-image-3.5` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | A paper-cut diorama of a whale over a lighthouse, layered blues. |
| `meta-muse-image` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | A field guide page about the snowy owl, labelled sketches. |
| `minimax-image-01` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | Portrait of an old fisherman mending nets at dawn, warm side light. |
| `fibo-2.0` | Instruction for edits; or a JSON structured prompt. | The sofa is deep green velvet. |
| `qwen-image-2.1` | Start from <image1> as the base, say what to take from <image2>, then the keep list. | Start with <image1> as the base and replace the mug with the one in <image2>; keep the desk and light. |
| `qwen-image-2.1-turbo` | The edit, then the keep list. | Turn <image1> into a rainy evening; keep the people where they are. |
| `qwen-image` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | A rain-washed Hong Kong street with glowing bilingual signs, cinematic. |
| `qwen-image-edit-2509` | Name each input's role, say the one change, then list what to keep (face, pose, light, background). | Put the person from Picture 2 into the scene of Picture 1, same light and grain. |
| `qwen-image-edit-2509-angles` | The camera instruction first, then the view. | Rotate the camera 90 degrees to the right around the subject: a side profile view. |
| `z-image-turbo` | Long descriptive prose: subject, setting, light, camera, style. | A low-angle fashion shot of a model walking through blue reeds under a pale sky, soft film grain. |
| `z-image` | Long descriptive prose: subject, setting, light, camera, style. | A low-angle fashion shot of a model walking through blue reeds under a pale sky, soft film grain. |
| `flux-2-klein-4b` | The edit in one sentence. | Change the bag colour to blue. |
| `flux-3-klein` | Name each reference by tag, then the result. | Place the lamp from <ref_image_0> on the desk in <ref_image_1>, evening light. |
| `flux-2-dev` | Subject, action, style, context. | The woman wears a small pale-yellow knitted beanie; keep the face. |
| `moss-image` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | A bold concert poster reading "NIGHT SHIFT" in tall white letters over a deep blue sky. |
| `moss-image-base` | Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same. | A bold concert poster reading "NIGHT SHIFT" in tall white letters over a deep blue sky. |
| `opensoul` | Triggers first, then the photo description. | Candid Instax Photo, two friends laughing on a ferry deck, wind in their hair. |
| `bria-genfill` | Only what goes inside the mask. | A potted fern on the windowsill. |
| `bria-expand` | What the new edges show. | More of the beach and the pier on the right. |
| `seedream-5.0-flash-layers` | Empty = split every major element; or name the elements to separate. | Separate the man, the bicycle and the shop sign. |
| `seedream-5.0-pro-layers` | Empty = split every major element; or name the elements to separate. | Separate the man, the bicycle and the shop sign. |
| `qwen-image-layered` | Unknown: leave empty or describe the scene. | (leave empty) |
| `minimax-music-3` | Caption in three parts: global metadata (genre, BPM, key, mood), vocal details, arrangement. Lyrics with section tags; the tags carry the structure. | Indie pop, 110 BPM, bright and hopeful. Warm female vocal, light harmonies. Electric guitars, punchy drums, melodic bass. Lyrics: [Verse] Morning light… [Chorus] Run with me… |
| `sonilo-music` | Genre, mood, instruments, tempo, use. | Upbeat lo-fi hip hop for a cooking video, mellow keys, vinyl crackle. |
| `sonilo-video-to-music` | Leave empty, or one line of mood. | (empty) |
| `seed-audio` | Who speaks and how, the setting sound, then the lines. For music or a sound: genre, mood, instruments; or what, where, how close. | A tired detective, low and slow, rain on the window: "We're out of time." |
| `ace-step-1.5` | Tags: genre, mood, instruments, vocal. Lyrics with section tags. | Tags: synthwave, driving, 118 BPM, female vocal. Lyrics: [Verse 1] Neon on the highway… |
| `yue2` | Style line, then lyrics in sections. | English, soulful male vocal, jazz-pop, 88 BPM, Rhodes and brushed drums. [Verse] Streetlights… |
| `stable-audio-open-1.0` | Descriptors, comma separated. | thunderstorm, heavy rain on a tin roof, distant rumble |
| `mmaudio` | The sounds to add, short. | footsteps on gravel, birds |
| `elevenlabs-sound-effects` | The sound, its source and space. | A heavy wooden door creaks open in a stone hall. |
| `elevenlabs-v3` | The script with inline [tags] where the delivery changes. | [whispers] Did you hear that? [pause] [laughs] It's just the cat. |
| `elevenlabs-v4` | The script. | Welcome back. Today we're building a kite. |
| `elevenlabs-v4-turbo` | The script. | Welcome back. Today we're building a kite. |
| `minimax-speech-2.8-hd` | The script with <#x#> pauses and (interjections). | Okay. <#0.6#> (sighs) Let's try that one more time. |
| `minimax-speech-2.8-turbo` | The script with <#x#> pauses and (interjections). | Okay. <#0.6#> (sighs) Let's try that one more time. |
| `fish-audio-s2.1-pro` | The script with inline tags. | [excited] We actually won! |
| `heygen-voice` | The script. | Thanks for watching, see you next week. |
| `qwen3-tts` | The script, plain; delivery goes in the Style line, not the script. | Tonight, one small robot is about to change everything. |
| `chatterbox` | The script, plain. | I never thought I'd see this place again. |
| `fish-audio-drama-3` | Speaker tag, style prefix, line with point / scoped tags. | <\|speaker:0\|> [icy calm] I knew you'd come back. [sighs] <slow>Sit down.</slow> |
| `f5-tts` | The script, plain. | The museum opens at nine. |
| `comfy-ltx25-layout` | One flowing paragraph: the finished look of the staged shot. | A real kitchen at golden hour, a chef plating pasta, steam rising. |
| `comfy-ltx25-iclora` | Trigger (if any), then the scene. | ADD WATER. The street floods slowly, reflections on the rising water. |

## Sources

Every entry in the data file carries its own URLs. All of them, with confidence:

- https://ai.google.dev/gemini-api/docs/image-generation (official)
- https://docs.bfl.ml/guides/prompting_guide_flux2 (official)
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide (official)
- https://docs.comfy.org/built-in-nodes/BriaEraser (official)
- https://docs.comfy.org/built-in-nodes/BriaExpandImage (official)
- https://docs.comfy.org/built-in-nodes/BriaGenFill (official)
- https://docs.comfy.org/built-in-nodes/BriaImageEditNode (official)
- https://docs.comfy.org/built-in-nodes/BriaIncreaseResolution (official)
- https://docs.comfy.org/built-in-nodes/BriaRemoveImageBackground (official)
- https://docs.comfy.org/built-in-nodes/BriaRemoveVideoBackground (official)
- https://docs.comfy.org/built-in-nodes/ByteDance2ReferenceNode (official)
- https://docs.comfy.org/built-in-nodes/ByteDance2ReferenceNodeV2 (official)
- https://docs.comfy.org/built-in-nodes/ByteDanceSeedAudio (official)
- https://docs.comfy.org/built-in-nodes/ByteDanceSeedreamLayerSeparationNodeV2 (official)
- https://docs.comfy.org/built-in-nodes/ByteDanceSeedreamNodeV3 (official)
- https://docs.comfy.org/built-in-nodes/ConditioningStableAudio (official)
- https://docs.comfy.org/built-in-nodes/ElevenLabsTextToSoundEffects (official)
- https://docs.comfy.org/built-in-nodes/ElevenLabsTextToSpeech (official)
- https://docs.comfy.org/built-in-nodes/EmptyQwenImageLayeredLatentImage (official)
- https://docs.comfy.org/built-in-nodes/Flux2ImageNode (official)
- https://docs.comfy.org/built-in-nodes/Flux3ImageNode (official)
- https://docs.comfy.org/built-in-nodes/Flux3LayoutPrompt (official)
- https://docs.comfy.org/built-in-nodes/Flux3TextToVideoNode (official)
- https://docs.comfy.org/built-in-nodes/FluxVideoUpscaleNode (official)
- https://docs.comfy.org/built-in-nodes/GeminiNanoBanana2V2 (official)
- https://docs.comfy.org/built-in-nodes/GrokImageEditNodeV2 (official)
- https://docs.comfy.org/built-in-nodes/GrokImageNode (official)
- https://docs.comfy.org/built-in-nodes/Hunyuan3Dv2Conditioning (official)
- https://docs.comfy.org/built-in-nodes/HunyuanImageEditApi (official)
- https://docs.comfy.org/built-in-nodes/HunyuanImageTextToImageApi (official)
- https://docs.comfy.org/built-in-nodes/IdeogramV4 (official)
- https://docs.comfy.org/built-in-nodes/KlingOmniProEditVideoNode (official)
- https://docs.comfy.org/built-in-nodes/KlingOmniProImageNode (official)
- https://docs.comfy.org/built-in-nodes/KlingOmniProImageToVideoNode (official)
- https://docs.comfy.org/built-in-nodes/KlingOmniProTextToVideoNode (official)
- https://docs.comfy.org/built-in-nodes/Krea3ImageNode (official)
- https://docs.comfy.org/built-in-nodes/LTXVReferenceAudio (official)
- https://docs.comfy.org/built-in-nodes/LtxApi25ImageToVideo (official)
- https://docs.comfy.org/built-in-nodes/LtxApi25TextToVideo (official)
- https://docs.comfy.org/built-in-nodes/LumaImageEditNode2 (official)
- https://docs.comfy.org/built-in-nodes/LumaImageNode2 (official)
- https://docs.comfy.org/built-in-nodes/LumaRay32VideoEditNode (official)
- https://docs.comfy.org/built-in-nodes/LumaRay32VideoReframeNode (official)
- https://docs.comfy.org/built-in-nodes/MOSSImageLayoutPrompt (official)
- https://docs.comfy.org/built-in-nodes/MiniMaxH3ReferenceToVideo (official)
- https://docs.comfy.org/built-in-nodes/MiniMaxMusic3TextEncode (official)
- https://docs.comfy.org/built-in-nodes/MinimaxHailuo03ReferenceNode (official)
- https://docs.comfy.org/built-in-nodes/MinimaxHailuo03TextToVideoNode (official)
- https://docs.comfy.org/built-in-nodes/QwenImageEditApi (official)
- https://docs.comfy.org/built-in-nodes/QwenImageTextToImageApi (official)
- https://docs.comfy.org/built-in-nodes/RecraftV4TextToImageNode (official)
- https://docs.comfy.org/built-in-nodes/RunwayAleph2VideoToVideoNode (official)
- https://docs.comfy.org/built-in-nodes/RunwayTextToImageNode (official)
- https://docs.comfy.org/built-in-nodes/SoniloTextToMusic (official)
- https://docs.comfy.org/built-in-nodes/SoniloVideoToMusic (official)
- https://docs.comfy.org/built-in-nodes/TextEncodeAceStepAudio1.5 (official)
- https://docs.comfy.org/built-in-nodes/TextEncodeQwenImage21 (official)
- https://docs.comfy.org/built-in-nodes/TextEncodeQwenImageEditPlus (official)
- https://docs.comfy.org/built-in-nodes/TextEncodeZImageOmni (official)
- https://docs.comfy.org/built-in-nodes/TextGenerateLTX2Prompt (official)
- https://docs.comfy.org/built-in-nodes/TopazImageEnhanceV2 (official)
- https://docs.comfy.org/built-in-nodes/TripoImageToModelNodeV2 (official)
- https://docs.comfy.org/built-in-nodes/TripoTextToModelNodeV2 (official)
- https://docs.comfy.org/built-in-nodes/Veo3VideoGenerationNode (official)
- https://docs.comfy.org/built-in-nodes/Wan22ImageToVideoLatent (official)
- https://docs.comfy.org/built-in-nodes/Wan3ReferenceToVideoApi (official)
- https://docs.comfy.org/built-in-nodes/WanAnimateToVideo (official)
- https://docs.comfy.org/built-in-nodes/WanCameraImageToVideo (official)
- https://docs.comfy.org/built-in-nodes/WanImageToVideo (official)
- https://docs.comfy.org/built-in-nodes/WanTextToImageApi (official)
- https://docs.comfy.org/built-in-nodes/WanVaceToVideo (official)
- https://docs.comfy.org/built-in-nodes/partner-node/image/openai/openai-gpt-image1 (official)
- https://docs.comfy.org/development/comfy-router/models/black-forest-labs/flux-3-image/code (official)
- https://docs.comfy.org/development/comfy-router/models/black-forest-labs/flux-3-video/code (official)
- https://docs.comfy.org/development/comfy-router/models/bria/image/code (official)
- https://docs.comfy.org/development/comfy-router/models/byteplus/dreamina-seedance-2-0-260128/code (official)
- https://docs.comfy.org/development/comfy-router/models/byteplus/dreamina-seedance-2-5-260628/code (official)
- https://docs.comfy.org/development/comfy-router/models/byteplus/seed-audio-1-0-multilingual/code (official)
- https://docs.comfy.org/development/comfy-router/models/byteplus/seedream-4-5-251128/code (official)
- https://docs.comfy.org/development/comfy-router/models/byteplus/seedream-5-0-pro-260628/code (official)
- https://docs.comfy.org/development/comfy-router/models/elevenlabs/eleven-v3/code (official)
- https://docs.comfy.org/development/comfy-router/models/elevenlabs/eleven-v4-turbo/code (official)
- https://docs.comfy.org/development/comfy-router/models/elevenlabs/eleven-v4/code (official)
- https://docs.comfy.org/development/comfy-router/models/google/nano-banana-2/code (official)
- https://docs.comfy.org/development/comfy-router/models/google/nano-banana-pro/code (official)
- https://docs.comfy.org/development/comfy-router/models/ideogram/ideogram-4-5/code (official)
- https://docs.comfy.org/development/comfy-router/models/ideogram/ideogram-v4/code (official)
- https://docs.comfy.org/development/comfy-router/models/kling/kling-image-o1/code (official)
- https://docs.comfy.org/development/comfy-router/models/kling/kling-v3-omni/code (official)
- https://docs.comfy.org/development/comfy-router/models/krea/krea-3/code (official)
- https://docs.comfy.org/development/comfy-router/models/ltx/ltx-2-5-pro/code (official)
- https://docs.comfy.org/development/comfy-router/models/luma_2/uni-1/code (official)
- https://docs.comfy.org/development/comfy-router/models/minimax/minimax-h3/code (official)
- https://docs.comfy.org/development/comfy-router/models/openai/gpt-image-1-5/code (official)
- https://docs.comfy.org/development/comfy-router/models/openai/gpt-image-2/code (official)
- https://docs.comfy.org/development/comfy-router/models/qwen/qwen-image-3-0/code (official)
- https://docs.comfy.org/development/comfy-router/models/runway/aleph2/code (official)
- https://docs.comfy.org/development/comfy-router/models/runway/gen4-image/code (official)
- https://docs.comfy.org/development/comfy-router/models/veo/veo-3-1-generate-001/code (official)
- https://docs.comfy.org/development/comfy-router/models/wan/wan3-0-video/code (official)
- https://docs.comfy.org/tutorials/flux/flux-3-klein (official)
- https://docs.comfy.org/tutorials/partner-nodes/meta/muse-image (official)
- https://docs.comfy.org/tutorials/partner-nodes/minimax/minimax-h3 (official)
- https://docs.comfy.org/tutorials/video/minimax/minimax-h3-multiframe (official)
- https://docs.comfy.org/tutorials/video/minimax/minimax-h3-native (official)
- https://docs.fish.audio/ (inferred)
- https://docs.heygen.com/ (inferred)
- https://docs.ltx.video/api-documentation/prompting-guide (inferred)
- https://docs.together.ai/docs/seedance2.0-quickstart (third-party)
- https://elevenlabs.io/docs/best-practices/prompting/eleven-v3 (official)
- https://fal.ai/models/bytedance/seedance-2.0/reference-to-video/api (third-party)
- https://fal.ai/models/fal-ai/fashn/tryon/v1.6 (third-party)
- https://fal.ai/models/fal-ai/ideogram/v3/reframe (third-party)
- https://fal.ai/models/fal-ai/ideogram/v3/remove-background (third-party)
- https://fal.ai/models/fal-ai/kling-image/o1/api (third-party)
- https://fal.ai/models/fal-ai/object-removal (third-party)
- https://fal.ai/models/fal-ai/trellis-2 (third-party)
- https://fal.ai/models/minimax/h3-max/extend-video/api (third-party)
- https://ffmpeg.org/ffmpeg-filters.html#zscale (inferred)
- https://github.com/SWivid/F5-TTS (inferred)
- https://github.com/resemble-ai/chatterbox (inferred)
- https://huggingface.co/Comfy-Org/Pixal3D (inferred)
- https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Water-Simulation (official)
- https://huggingface.co/Qwen/Qwen-Image-Edit-2509 (official)
- https://github.com/flybirdxx/ComfyUI-Qwen-TTS (official)
- https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice (official)
- https://huggingface.co/fishaudio/drama-3 (official)
- https://huggingface.co/m-a-p/YuE2-3B (inferred)
- https://platform.minimax.io/docs/api-reference/image-generation-t2i (official)
- https://platform.minimax.io/docs/api-reference/music-generation (official)
- https://platform.minimax.io/docs/api-reference/speech-t2a-http (official)
- https://platform.openai.com/docs/guides/image-generation (official)
- https://replicate.com/runwayml/gen4-image/api (third-party)
