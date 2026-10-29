/**
 * Where to read more about a model (Models page hover card, 2026-10-25): the maker's own announcement or model page, the research paper,
 * the model card and the docs, plus the month it came out. Keyed by MODEL key (modelIds.ts MODELS / the 3D model ids).
 * Official sources only: the maker's site or blog, arXiv, the maker's Hugging Face or GitHub org, the docs page we run it through
 * (Comfy docs, the provider's API docs). Every URL was opened and returned HTTP 200 on the date below; a link we could not confirm is left out,
 * never guessed.
 * Checked: 2026-10-25.
 */
export interface ModelLinks {
  /** The maker's announcement or blog post. */ announce?: string;
  /** The maker's own page for the model (product or project page) when there is no dated post. */ site?: string;
  /** The research paper or technical report (arXiv). */ paper?: string;
  /** The model card (Hugging Face). */ card?: string;
  /** API or usage docs (maker docs, Comfy docs, the code repo). */ docs?: string;
  /** Month it came out, YYYY-MM (from the announcement, paper or model card). */ released?: string;
}

const BYTEPLUS_VIDEO = 'https://docs.byteplus.com/en/docs/ModelArk/1520757';
const H3_DOCS = 'https://docs.comfy.org/tutorials/video/minimax/minimax-h3';
const H3_CARD = 'https://huggingface.co/MiniMaxAI/MiniMax-H3';
const VEO = { announce: 'https://developers.googleblog.com/en/introducing-veo-3-1-and-new-creative-capabilities-in-the-gemini-api/', site: 'https://deepmind.google/models/veo/', docs: 'https://ai.google.dev/gemini-api/docs/video', released: '2025-10' };
const LTX25 = { site: 'https://ltx.io/model/ltx-2-5', docs: 'https://docs.ltx.io/models/ltx-2-5' };
const WAN22_PAPER = 'https://arxiv.org/abs/2503.20314';
const WAN22_CODE = 'https://github.com/Wan-Video/Wan2.2';
const FLUX3 = 'https://bfl.ai/blog/flux-3';
const FLUX2 = { announce: 'https://bfl.ai/blog/flux-2', docs: 'https://docs.bfl.ai/flux_2/flux2_overview', released: '2025-11' };
const KLEIN = 'https://bfl.ai/blog/flux2-klein-towards-interactive-visual-intelligence';
const SEEDVR2 = { site: 'https://iceclear.github.io/projects/seedvr2/', paper: 'https://arxiv.org/abs/2506.05301', docs: 'https://github.com/ByteDance-Seed/SeedVR', released: '2025-06' };
const GEMINI_IMG = 'https://ai.google.dev/gemini-api/docs/image-generation';
const OPENAI_IMG = 'https://developers.openai.com/api/docs/guides/image-generation';
const QWEN_PAPER = 'https://arxiv.org/abs/2508.02324';
/* qwen.ai/blog?id=qwen-image-2.1 renders client-side only: its content can't be confirmed (2026-10-28), so the repo stands in as the maker's docs */
const QWEN21 = { card: 'https://huggingface.co/Qwen/Qwen-Image-2.1', docs: 'https://github.com/QwenLM/Qwen-Image-2.1', released: '2026-09' };
const ZIMAGE = { announce: 'https://tongyi-mai.github.io/Z-Image-blog/', paper: 'https://arxiv.org/abs/2511.22699' };
const MOSS = { paper: 'https://arxiv.org/abs/2610.23374', docs: 'https://github.com/OpenMOSS/MOSS-Image', released: '2026-10' };
const IDEOGRAM_DOCS = 'https://developer.ideogram.ai/ideogram-api/api-overview';
const RECRAFT_DOCS = 'https://www.recraft.ai/docs';
const LUMA_UNI = { site: 'https://lumalabs.ai/uni-1', docs: 'https://docs.lumalabs.ai/docs/welcome' };
const GROK_DOCS = 'https://docs.x.ai/developers/model-capabilities/imagine';
const TOPAZ = 'https://www.topazlabs.com/';
const ELEVEN_DOCS = 'https://elevenlabs.io/docs/overview/models';
const MM_SPEECH = { announce: 'https://www.minimax.io/news/minimax-speech-28', docs: 'https://platform.minimax.io/docs/api-reference/speech-t2a-http', released: '2026-01' };
const CHATTERBOX = { site: 'https://www.resemble.ai/learn/models/chatterbox', card: 'https://huggingface.co/ResembleAI/chatterbox', docs: 'https://github.com/resemble-ai/chatterbox', released: '2025-04' };
const F5 = { paper: 'https://arxiv.org/abs/2410.06885', card: 'https://huggingface.co/SWivid/F5-TTS', docs: 'https://github.com/SWivid/F5-TTS', released: '2024-10' };
const SONILO = 'https://sonilo.com/';

export const MODEL_LINKS: Record<string, ModelLinks> = {
  // ---------- video ----------
  'seedance-2.0': { site: 'https://seed.bytedance.com/en/seedance2_0', docs: BYTEPLUS_VIDEO, released: '2026-02' },
  'seedance-2.0-fast': { site: 'https://seed.bytedance.com/en/seedance2_0', docs: BYTEPLUS_VIDEO },
  'seedance-2.0-mini': { site: 'https://seed.bytedance.com/en/seedance2_0', docs: BYTEPLUS_VIDEO },
  'seedance-2.5': { site: 'https://seed.bytedance.com/en/seedance2_5', docs: BYTEPLUS_VIDEO },
  'wan-2.2-animate-14b': { site: 'https://humanaigc.github.io/wan-animate/', paper: 'https://arxiv.org/abs/2509.14055', card: 'https://huggingface.co/Wan-AI/Wan2.2-Animate-14B', released: '2025-09' },
  'wan-2.1-vace-14b': { site: 'https://ali-vilab.github.io/VACE-Page/', paper: 'https://arxiv.org/abs/2503.07598', card: 'https://huggingface.co/Wan-AI/Wan2.1-VACE-14B', released: '2025-05' },
  'wan-2.2-fun-camera-14b': { paper: WAN22_PAPER, card: 'https://huggingface.co/alibaba-pai/Wan2.2-Fun-A14B-Control-Camera', docs: 'https://github.com/aigc-apps/VideoX-Fun', released: '2025-08' },
  'wan-2.2-i2v-14b': { paper: WAN22_PAPER, card: 'https://huggingface.co/Wan-AI/Wan2.2-I2V-A14B', docs: WAN22_CODE, released: '2025-07' },
  'ltx-2.5-22b': { ...LTX25, card: 'https://huggingface.co/Lightricks/LTX-2.5' },
  'infinitetalk-wan-2.1': { site: 'https://meigen-ai.github.io/InfiniteTalk/', paper: 'https://arxiv.org/abs/2508.14033', card: 'https://huggingface.co/MeiGen-AI/InfiniteTalk', docs: 'https://docs.comfy.org/tutorials/video/wan/wan-infinitetalk', released: '2025-08' },
  'ltx-2.5-talking-photo': { ...LTX25, card: 'https://huggingface.co/Lightricks/LTX-2.5' },
  'wan-2.2-ti2v-5b': { paper: WAN22_PAPER, card: 'https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B', docs: WAN22_CODE, released: '2025-07' },
  'wan-3.0': { site: 'https://wan.video/' },
  'minimax-h3': { announce: 'https://www.minimax.io/news/minimax-h3-open-source', card: H3_CARD, docs: H3_DOCS, released: '2026-07' },
  'minimax-h3-fast': { site: 'https://haoailab.com/blogs/fasth3-preview/', card: 'https://huggingface.co/FastVideo/FastVideo-FastH3-8-Step-V2', docs: 'https://docs.comfy.org/tutorials/video/minimax/minimax-h3-fastvideo' },
  'minimax-h3-camera-motion': { card: H3_CARD, docs: H3_DOCS },
  'minimax-h3-extend': { card: H3_CARD, docs: H3_DOCS },
  'minimax-h3-max-extend': { docs: H3_DOCS },
  'minimax-h3-talking-photo': { card: H3_CARD, docs: H3_DOCS },
  'minimax-h3-character-swap': { card: 'https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA', docs: H3_DOCS },
  'minimax-h3-style-transfer': { card: 'https://huggingface.co/Alissonerdx/Minimax-H3-ComfyUI', docs: H3_DOCS },
  'minimax-h3-vfx-edit': { card: 'https://huggingface.co/Alissonerdx/Minimax-H3-ComfyUI', docs: H3_DOCS },
  'veo-3.1': VEO,
  'veo-3.1-fast': VEO,
  'ltx-2-19b': { site: 'https://ltx.io/model/ltx-2', paper: 'https://arxiv.org/abs/2601.03233', card: 'https://huggingface.co/Lightricks/LTX-2', released: '2026-01' },
  'ltx-2.5-pro': LTX25,
  'ltx-2.5-fast': LTX25,
  'ltx-2.3-fast': { site: 'https://ltx.io/model/ltx-2-3', docs: 'https://docs.ltx.io/models/ltx-2-3' },
  'flux-3-video': { announce: FLUX3, docs: 'https://docs.bfl.ml/flux_3/flux3_video', released: '2026-07' },
  'flux-3-upscaler': { announce: FLUX3, docs: 'https://docs.bfl.ai/flux_tools/flux_video_upscale' },
  seedvr2: { ...SEEDVR2, card: 'https://huggingface.co/ByteDance-Seed/SeedVR2-7B' },
  'kling-v3': { site: 'https://kling.ai/release-note/release-notes', docs: 'https://kling.ai/document-api', released: '2026-02' },
  'luma-ray-2-reframe': { docs: 'https://fal.ai/models/fal-ai/luma-dream-machine/ray-2/reframe/api' },
  'bria-video-background-removal': { docs: 'https://fal.ai/models/bria/video/background-removal' },
  birefnet: { paper: 'https://arxiv.org/abs/2401.03407', card: 'https://huggingface.co/ZhengPeng7/BiRefNet', docs: 'https://github.com/ZhengPeng7/BiRefNet', released: '2024-01' },
  'ffmpeg-hdr10': { docs: 'https://ffmpeg.org/ffmpeg-filters.html#zscale' },
  'rife-4.9': { paper: 'https://arxiv.org/abs/2011.06294', docs: 'https://github.com/hzwer/Practical-RIFE' },
  'depth-anything-v2-small': { site: 'https://depth-anything-v2.github.io/', paper: 'https://arxiv.org/abs/2406.09414', card: 'https://huggingface.co/depth-anything/Depth-Anything-V2-Small', released: '2024-06' },

  // ---------- image ----------
  'gpt-image': { docs: 'https://developers.openai.com/api/docs/models/gpt-image-2', released: '2026-04' },
  'gpt-image-2.5-flare': { docs: OPENAI_IMG },
  'gpt-image-2.5-sunburst': { docs: OPENAI_IMG },
  'gpt-image-1.5': { docs: 'https://developers.openai.com/api/docs/models/gpt-image-1.5' },
  'nano-banana-2': { announce: 'https://blog.google/innovation-and-ai/technology/ai/nano-banana-2/', site: 'https://deepmind.google/models/gemini-image/flash/', docs: GEMINI_IMG, released: '2026-02' },
  'nano-banana-2.1': { site: 'https://deepmind.google/models/gemini-image/flash/', docs: GEMINI_IMG, released: '2026-10' },
  'nano-banana-2-lite': { docs: GEMINI_IMG },
  'nano-banana-pro': { announce: 'https://blog.google/innovation-and-ai/products/nano-banana-pro/', site: 'https://deepmind.google/models/gemini-image/pro/', docs: GEMINI_IMG, released: '2025-11' },
  'seedream-5.0-pro': { site: 'https://seed.bytedance.com/en/seedream5_0_pro', docs: 'https://docs.comfy.org/built-in-nodes/ByteDanceSeedreamNodeV3' },
  'seedream-5.0-pro-layers': { site: 'https://seed.bytedance.com/en/seedream5_0_pro', docs: 'https://docs.comfy.org/built-in-nodes/ByteDanceSeedreamLayerSeparationNodeV2' },
  'seedream-5.0-flash': { docs: 'https://docs.comfy.org/built-in-nodes/ByteDanceSeedreamNodeV3' },
  'seedream-5.0-flash-layers': { docs: 'https://docs.comfy.org/built-in-nodes/ByteDanceSeedreamLayerSeparationNodeV2' },
  'seedream-4.5': { site: 'https://seed.bytedance.com/en/seedream4_5', docs: 'https://docs.comfy.org/development/comfy-router/models/byteplus/seedream-4-5-251128/code' },
  'flux-3-image': { announce: FLUX3, docs: 'https://docs.bfl.ml/flux_3/flux3_image_generate', released: '2026-07' },
  'flux-3-klein': { announce: FLUX3, card: 'https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy', released: '2026-10' },
  'flux-2-max': FLUX2,
  'flux-2-pro': FLUX2,
  'flux-2-flex': FLUX2,
  'flux-2-dev': { ...FLUX2, card: 'https://huggingface.co/black-forest-labs/FLUX.2-dev' },
  'flux-2-klein-9b': { announce: KLEIN, card: 'https://huggingface.co/black-forest-labs/FLUX.2-klein-9B', released: '2026-01' },
  'flux-2-klein-4b': { announce: KLEIN, card: 'https://huggingface.co/black-forest-labs/FLUX.2-klein-4B', released: '2026-01' },
  'qwen-image-3-pro': { docs: 'https://docs.comfy.org/built-in-nodes/QwenImageTextToImageApi' },
  'qwen-image-3': { docs: 'https://docs.comfy.org/built-in-nodes/QwenImageTextToImageApi' },
  'qwen-image-2.1': QWEN21,
  'qwen-image-2.1-turbo': QWEN21,
  'qwen-image': { announce: 'https://qwenlm.github.io/blog/qwen-image/', paper: QWEN_PAPER, card: 'https://huggingface.co/Qwen/Qwen-Image', released: '2025-08' },
  'qwen-image-edit-2509': { paper: QWEN_PAPER, card: 'https://huggingface.co/Qwen/Qwen-Image-Edit-2509', released: '2025-09' },
  'qwen-image-edit-2509-angles': { paper: QWEN_PAPER, card: 'https://huggingface.co/dx8152/Qwen-Edit-2509-Multiple-angles' },
  'qwen-image-layered': { paper: 'https://arxiv.org/abs/2512.15603', card: 'https://huggingface.co/Qwen/Qwen-Image-Layered', released: '2025-12' },
  'ideogram-4.5': { docs: IDEOGRAM_DOCS },
  'ideogram-v4': { docs: IDEOGRAM_DOCS },
  'ideogram-3-reframe': { docs: 'https://developer.ideogram.ai/v1/api-reference/tools/reframe-v3' },
  'ideogram-remove-background': { docs: 'https://fal.ai/models/fal-ai/ideogram/remove-background' },
  'kling-image-o1': { docs: 'https://kling.ai/document-api' },
  'recraft-v4.1-pro': { docs: RECRAFT_DOCS },
  'recraft-v4.1': { docs: RECRAFT_DOCS },
  'recraft-v4': { docs: RECRAFT_DOCS },
  'luma-uni-1-max': LUMA_UNI,
  'luma-image': LUMA_UNI,
  'grok-imagine-image': { docs: GROK_DOCS },
  'grok-imagine-image-pro': { docs: GROK_DOCS },
  'fibo-2.0': { paper: 'https://arxiv.org/abs/2511.06876', card: 'https://huggingface.co/briaai/Fibo-2.0-dev', docs: 'https://docs.comfy.org/tutorials/partner-nodes/bria/fibo', released: '2026-10' },
  krea: { site: 'https://www.krea.ai/krea-3', docs: 'https://www.krea.ai/docs' },
  'runway-gen4-image': { docs: 'https://docs.dev.runwayml.com/' },
  'wan-image-2.5': { docs: 'https://www.alibabacloud.com/help/en/model-studio/text-to-image' },
  'minimax-image-01': { announce: 'https://www.minimax.io/news/image-01', docs: 'https://platform.minimax.io/docs/api-reference/image-generation-t2i' },
  'z-image-turbo': { ...ZIMAGE, card: 'https://huggingface.co/Tongyi-MAI/Z-Image-Turbo', released: '2025-11' },
  'z-image': { ...ZIMAGE, card: 'https://huggingface.co/Tongyi-MAI/Z-Image' },
  'z-image-turbo-2k-upscaler': { ...ZIMAGE, card: 'https://huggingface.co/Tongyi-MAI/Z-Image-Turbo' },
  opensoul: { card: 'https://huggingface.co/Tongyi-MAI/Z-Image-Turbo' },
  'moss-image': { ...MOSS, card: 'https://huggingface.co/OpenMOSS-Team/MOSS-Image-SFT' },
  'moss-image-base': { ...MOSS, card: 'https://huggingface.co/OpenMOSS-Team/MOSS-Image-Base' },
  'hunyuan-image-3.5': { docs: 'https://docs.comfy.org/built-in-nodes/HunyuanImageTextToImageApi' },
  'meta-muse-image': { docs: 'https://docs.comfy.org/built-in-nodes/MetaMuseImageTextToImageApi' },
  'seedvr2-image': { ...SEEDVR2, card: 'https://huggingface.co/ByteDance-Seed/SeedVR2-7B' },
  'seedvr2-3b-image': { ...SEEDVR2, card: 'https://huggingface.co/ByteDance-Seed/SeedVR2-3B' },
  'crystal-upscaler': { site: 'https://clarityai.co/', docs: 'https://fal.ai/models/clarityai/crystal-upscaler' },
  'topaz-wonder-3.5': { site: TOPAZ, docs: 'https://fal.ai/models/topaz/upscale/image/generative' },
  'topaz-standard-v2': { site: TOPAZ, docs: 'https://fal.ai/models/topaz/upscale/image/precision' },
  'topaz-bloom-2': { site: TOPAZ, docs: 'https://fal.ai/models/topaz/upscale/image/creative' },
  'bria-increase-resolution': { docs: 'https://fal.ai/models/bria/increase-resolution' },
  'bria-genfill': { docs: 'https://fal.ai/models/fal-ai/bria/genfill' },
  'bria-rmbg-2.0': { card: 'https://huggingface.co/briaai/RMBG-2.0', docs: 'https://fal.ai/models/fal-ai/bria/background/remove' },
  'bria-expand': { docs: 'https://fal.ai/models/fal-ai/bria/expand' },
  'bria-eraser': { docs: 'https://fal.ai/models/fal-ai/bria/eraser' },
  'fal-object-removal': { docs: 'https://fal.ai/models/fal-ai/object-removal/mask' },
  'fashn-tryon-1.6': { docs: 'https://docs.fashn.ai/' },
  'bria-virtual-tryon': { docs: 'https://docs.comfy.org/development/comfy-router/models/bria/image-edit-product-virtual-tryon/code' },
  '4x-nomos2': { docs: 'https://github.com/Phhofm/models/releases/tag/4xNomos2_hq_dat2' },
  'real-esrgan': { paper: 'https://arxiv.org/abs/2107.10833', docs: 'https://github.com/xinntao/Real-ESRGAN', released: '2021-07' },
  '4x-ultrasharp': { card: 'https://huggingface.co/Kim2091/UltraSharp' },

  // ---------- audio ----------
  'elevenlabs-v4': { announce: 'https://elevenlabs.io/blog/eleven-v4', docs: ELEVEN_DOCS },
  'elevenlabs-v4-turbo': { announce: 'https://elevenlabs.io/blog/eleven-v4', docs: ELEVEN_DOCS },
  'elevenlabs-v3': { announce: 'https://elevenlabs.io/blog/eleven-v3', docs: ELEVEN_DOCS, released: '2025-06' },
  'elevenlabs-sound-effects': { site: 'https://elevenlabs.io/sound-effects', docs: 'https://elevenlabs.io/docs/overview/capabilities/sound-effects' },
  'minimax-music-3': { announce: 'https://www.minimax.io/blog/minimax-music-3-0-next-generation-open-weights-production-ready-versatile-music-model', card: 'https://huggingface.co/MiniMaxAI/MiniMax-Music3', docs: 'https://docs.comfy.org/tutorials/audio/minimax/minimax-music-3', released: '2026-08' },
  'seed-audio': { docs: 'https://docs.comfy.org/tutorials/partner-nodes/bytedance/seed-audio-1-0' },
  'minimax-speech-2.8-hd': MM_SPEECH,
  'minimax-speech-2.8-turbo': MM_SPEECH,
  'qwen3-tts': { card: 'https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice', docs: 'https://github.com/QwenLM/Qwen3-TTS' },
  yue2: { paper: 'https://arxiv.org/abs/2609.33757', card: 'https://huggingface.co/m-a-p/YuE2-3B', released: '2026-09' },
  'ace-step-1.5': { site: 'https://ace-step.github.io/ace-step-v1.5.github.io/', paper: 'https://arxiv.org/abs/2602.00744', card: 'https://huggingface.co/ACE-Step/Ace-Step1.5', released: '2026-01' },
  chatterbox: CHATTERBOX,
  'chatterbox-voice-changer': CHATTERBOX,
  'translate-chatterbox': CHATTERBOX,
  'stable-audio-open-1.0': { announce: 'https://stability.ai/news-updates/introducing-stable-audio-open', paper: 'https://arxiv.org/abs/2407.14358', card: 'https://huggingface.co/stabilityai/stable-audio-open-1.0', released: '2024-06' },
  'fish-audio-drama-3': { paper: 'https://arxiv.org/abs/2610.18010', card: 'https://huggingface.co/fishaudio/drama-3', released: '2026-10' },
  'fish-audio-s2.1-pro': { docs: 'https://docs.fish.audio/overview/capabilities' },
  'f5-tts': F5,
  'translate-f5-tts': F5,
  'sonilo-music': { site: SONILO, docs: 'https://docs.comfy.org/built-in-nodes/SoniloTextToMusic' },
  'sonilo-video-to-music': { site: SONILO, docs: 'https://docs.comfy.org/built-in-nodes/SoniloVideoToMusic' },
  'heygen-voice': { docs: 'https://developers.heygen.com/' },
  mmaudio: { site: 'https://hkchengrex.com/MMAudio/', paper: 'https://arxiv.org/abs/2412.15322', card: 'https://huggingface.co/hkchengrex/MMAudio', released: '2024-12' },

  // ---------- 3D ----------
  'fal-trellis2': { site: 'https://microsoft.github.io/TRELLIS.2/', paper: 'https://arxiv.org/abs/2512.14692', card: 'https://huggingface.co/microsoft/TRELLIS.2-4B', docs: 'https://github.com/microsoft/TRELLIS.2', released: '2025-12' },
  'fal-hunyuan3d-31': { site: 'https://3d.hunyuan.tencent.com/', docs: 'https://fal.ai/models/fal-ai/hunyuan-3d/v3.1/pro/image-to-3d' },
  'cloud-tripo-31': { docs: 'https://docs.comfy.org/tutorials/partner-nodes/tripo/tripo-3-1' },
  'comfy-pixal3d-trellis2': { paper: 'https://arxiv.org/abs/2605.10922', card: 'https://huggingface.co/TencentARC/Pixal3D', docs: 'https://github.com/TencentARC/Pixal3D', released: '2026-04' },
  'comfy-ltx25-iclora': { site: 'https://ltx.io/model/ltx-2-5', card: 'https://huggingface.co/Lightricks/LTX-2.5' },
  'comfy-ltx25-layout': { site: 'https://ltx.io/model/ltx-2-5', card: 'https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render' },
  // local-turntable and local-previz are our own in-browser tools: nothing to link.
};
// Official Comfy templates (2026-10-27, server tools/comfyFeatured.ts): Comfy's template page and docs as the "docs" link.
Object.assign(MODEL_LINKS, {
  'gemini-omni-1.1-flash': { docs: 'https://docs.comfy.org/tutorials/partner-nodes/google/gemini-omni-flash', released: '2026-08' /* Omni Flash 1.1 GA, Aug 27, 2026 (Comfy docs) */ },
  'flux-3-max': { announce: FLUX3, docs: 'https://docs.comfy.org/tutorials/partner-nodes/black-forest-labs/flux-3-max', released: '2026-10' /* Comfy v0.42.2 changelog, Oct 20, 2026 */ },
  'wan-animate-2': { card: 'https://huggingface.co/Comfy-Org/Wan-Animate-2', docs: 'https://docs.comfy.org/tutorials/video/wan/wan-animate-2' },
} satisfies Record<string, ModelLinks>);
/** The links for one model key (empty object when none). */
export const linksOf = (modelKey: string | null | undefined): ModelLinks => (modelKey && MODEL_LINKS[modelKey]) || {};
/** "Nov 2025" from "2025-11". */
export const releasedText = (r?: string | null): string | null => {
  const m = /^(\d{4})-(\d{2})$/.exec(r ?? ''); if (!m) return null;
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1];
  return mon ? `${mon} ${m[1]}` : null;
};
/** The header Models column's links (2026-10-28): `maker` = the maker's own announcement, else its docs, else its model page, labelled by
 *  what it is; never a page we only run it through (Comfy docs, fal). `weights` = the Hugging Face card, for open-weights models only.
 *  Either can be missing: nothing is guessed. Same data as MODEL_LINKS; no second list. */
export type MenuLinks = { maker: { href: string; label: 'Announcement' | 'Docs' | 'Model page' } | null; weights: string | null };
const makerOwn = (u?: string) => (u && /^https:\/\//.test(u) && !/^https:\/\/(docs\.comfy\.org|fal\.ai)\//.test(u) ? u : undefined);
export const menuLinksOf = (modelKey: string | null | undefined, openWeights: boolean): MenuLinks => {
  const l = linksOf(modelKey); const a = makerOwn(l.announce), d = makerOwn(l.docs), s = makerOwn(l.site);
  const maker = a ? { href: a, label: 'Announcement' as const } : d ? { href: d, label: 'Docs' as const } : s ? { href: s, label: 'Model page' as const } : null;
  return { maker, weights: openWeights && l.card && /^https:\/\/huggingface\.co\//.test(l.card) ? l.card : null };
};
