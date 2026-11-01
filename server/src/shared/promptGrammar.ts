/**
 * Prompt grammar (step 1 of 2, 2026-10-26): how every model the app offers expects its prompt to be written and its inputs named.
 * Data only (isomorphic, no imports): step 2 wires it into the composer (auto tags, hover tips, enhancer, MCP describe) after review.
 *
 * One entry per model key the app offers (shared/modelIds.ts MODELS + shared/threeD.ts THREE_D_MODELS + the app's own recorders), the same
 * keys, never new ids. Every fact carries a source URL and a confidence:
 *  - official     the vendor's own docs, or Comfy's docs / Router schema for the partner integration (docs.comfy.org, read from the local
 *                 linked here rather than copied; Comfy documentation is GPL-3.0).
 *  - third-party  a host's wrapper schema (fal, Replicate) or a guide; the host may rewrite the prompt before the vendor sees it.
 *  - inferred     our reading of the code, a template or the model's encoder; worth a check before step 2 relies on it.
 * Examples are our own words. Readable tables and the mismatch list: docs/PROMPT-GRAMMAR.md.
 */

export type Confidence = 'official' | 'third-party' | 'inferred';
export interface Src { url: string; confidence: Confidence; note?: string }
export type GrammarMedium = 'image' | 'video' | 'audio' | '3d' | 'tool';
/** What the model makes from a prompt. */
export type GrammarKind = 'text-to-image' | 'image-edit' | 'video' | 'video-edit' | 'lipsync' | 'music' | 'sfx' | 'tts' | 'voice-convert'
  | 'upscale' | 'utility' | '3d' | 'layers';
/**
 * How inputs are named in the prompt:
 *  - tag         a fixed token per input (`<<<image_1>>>`, `<Picture 1>`, `@Image1`, `<image1>`, `<ref_image_0>`)
 *  - words       plain words with a number ("Image 1", "image 2"): the model reads them as text
 *  - order       inputs are read in the order sent; describe them ("the first image", "the person in the photo"); no fixed token
 *  - none        the model takes no reference inputs (prompt only, or a single source the prompt never names)
 *  - unknown     not documented anywhere we could read
 */
export type RefStyle = 'tag' | 'words' | 'order' | 'none' | 'unknown';
export interface RefGrammar {
  style: RefStyle;
  /** Token templates; `{n}` = the input's number. Omitted kinds are not taken (or not nameable). */
  image?: string; video?: string; audio?: string; element?: string;
  /** First number (0 or 1). */ base?: 0 | 1;
  /** true = each kind counts from base on its own (Image 1, Video 1); false = one count across kinds. */ perKind?: boolean;
  /** Most inputs of each kind one request takes (on our routes). */ maxImages?: number; maxVideos?: number; maxAudio?: number;
  /** Start / end frames: are they named in the prompt, and can they be sent together with reference inputs? */
  frames?: { named: boolean; withRefs: boolean };
  /** What happens to an input the prompt never names. */ unnamed?: string;
  note?: string;
  src: Src[];
}
export interface PromptLimits { maxChars?: number; minChars?: number; /** we cut the prompt silently instead of refusing */ truncatedByUs?: boolean; /** the provider itself cuts an over-long prompt (no refusal): we let it run with a warning */ providerCuts?: boolean; note?: string; src: Src[] }
export interface CodeRef { /** repo path:line (server/src… or workflows/…) */ at: string; /** does this builder follow the grammar? */ follows: 'yes' | 'partly' | 'no' | 'n/a'; note?: string }
/** A route whose host reads the prompt differently from the vendor's own API (e.g. fal's @Image1 wrapper). */
export interface PlaceGrammar { route: string; refs: Partial<RefGrammar> & { src: Src[] }; note?: string }

export interface PromptGrammar {
  key: string;
  name: string;
  medium: GrammarMedium;
  kind: GrammarKind;
  status: 'known' | 'unknown';
  /** Why the entry is unknown (status 'unknown'). */ reason?: string;
  /** Is a text prompt sent at all on our routes? */ prompt: 'required' | 'optional' | 'none';
  refs: RefGrammar;
  limits?: PromptLimits;
  languages?: string;
  /** A separate negative field ('field'), avoid-words written inside the prompt ('in-prompt'), or nothing. */
  negative: 'field' | 'in-prompt' | 'none' | 'unknown';
  /** Model-specific syntax: lyrics sections, speech tags, timeline marks, LoRA trigger words, multi-shot, layout boxes… */
  special?: string[];
  /** Words the prompt must start with or contain (LoRA triggers). */ triggers?: string[];
  /** Recommended order of the prompt's parts. */ structure: string;
  /** One short example, our own words. */ example: string;
  places?: PlaceGrammar[];
  code: CodeRef[];
  sources: Src[];
}

// ---------------------------------------------------------------- sources ----------------------------------------------------------------
const O = (url: string, note?: string): Src => ({ url, confidence: 'official', ...(note ? { note } : {}) });
const T = (url: string, note?: string): Src => ({ url, confidence: 'third-party', ...(note ? { note } : {}) });
const I = (url: string, note?: string): Src => ({ url, confidence: 'inferred', ...(note ? { note } : {}) });
const ROUTER = (p: string) => O(`https://docs.comfy.org/development/comfy-router/models/${p}/code`);
const NODE = (n: string) => O(`https://docs.comfy.org/built-in-nodes/${n}`);
const TUT = (p: string) => O(`https://docs.comfy.org/tutorials/${p}`);
const REPO = (p: string, note?: string) => I(`https://github.com/sytesims/imagination-is-all-you-need/blob/main/${p}`, note);

const S = {
  klingOmni: ROUTER('kling/kling-v3-omni'), klingImage: ROUTER('kling/kling-image-o1'), klingNodeT2V: NODE('KlingOmniProTextToVideoNode'),
  klingNodeEdit: NODE('KlingOmniProEditVideoNode'), klingNodeI2V: NODE('KlingOmniProImageToVideoNode'), klingFal: T('https://fal.ai/models/fal-ai/kling-image/o1/api'),
  seedance20: ROUTER('byteplus/dreamina-seedance-2-0-260128'), seedance25: ROUTER('byteplus/dreamina-seedance-2-5-260628'),
  seedanceNode: NODE('ByteDance2ReferenceNodeV2'), seedanceNodeV1: NODE('ByteDance2ReferenceNode'), seedanceFal: T('https://fal.ai/models/bytedance/seedance-2.0/reference-to-video/api'),
  seedanceTogether: T('https://docs.together.ai/docs/seedance2.0-quickstart'),
  seedream: ROUTER('byteplus/seedream-5-0-pro-260628'), seedream45: ROUTER('byteplus/seedream-4-5-251128'), seedreamNode: NODE('ByteDanceSeedreamNodeV3'), seedreamLayers: NODE('ByteDanceSeedreamLayerSeparationNodeV2'),
  h3Router: ROUTER('minimax/minimax-h3'), h3RefNode: NODE('MinimaxHailuo03ReferenceNode'), h3T2VNode: NODE('MinimaxHailuo03TextToVideoNode'),
  h3Partner: TUT('partner-nodes/minimax/minimax-h3'), h3Native: TUT('video/minimax/minimax-h3-native'), h3Multi: TUT('video/minimax/minimax-h3-multiframe'),
  h3NativeNode: NODE('MiniMaxH3ReferenceToVideo'),
  wan3: ROUTER('wan/wan3-0-video'), wan3Prime: ROUTER('wan/wan3-0-video-prime'), veoLite: ROUTER('veo/veo-3-1-lite-generate-001'), pvideo2: ROUTER('pruna/p-video-2'),
  pvideo2Pruna: O('https://docs.pruna.ai/en/stable/docs_pruna_endpoints/performance_models/p-video-2.html'), grokVideoLite: ROUTER('xai/grok-imagine-video-1-5-lite'), wan3Node: NODE('Wan3ReferenceToVideoApi'), wanImage: NODE('WanTextToImageApi'),
  veo: ROUTER('veo/veo-3-1-generate-001'), veoNode: NODE('Veo3VideoGenerationNode'), veoGuide: O('https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide'),
  ltxApiT2V: NODE('LtxApi25TextToVideo'), ltxApiI2V: NODE('LtxApi25ImageToVideo'), ltxRouter: ROUTER('ltx/ltx-2-5-pro'), ltxPromptNode: NODE('TextGenerateLTX2Prompt'),
  ltxGuide: I('https://docs.ltx.video/api-documentation/prompting-guide', 'page refused our reader (403); open in a browser to confirm'),
  flux3Video: ROUTER('black-forest-labs/flux-3-video'), flux3VideoNode: NODE('Flux3TextToVideoNode'),
  aleph: NODE('RunwayAleph2VideoToVideoNode'), alephRouter: ROUTER('runway/aleph2'), ray32: NODE('LumaRay32VideoEditNode'),
  gpt2: ROUTER('openai/gpt-image-2'), gpt15: ROUTER('openai/gpt-image-1-5'), gptNode: O('https://docs.comfy.org/built-in-nodes/partner-node/image/openai/openai-gpt-image1'),
  gptEditGuide: O('https://platform.openai.com/docs/guides/image-generation'),
  nb2: ROUTER('google/nano-banana-2'), nbPro: ROUTER('google/nano-banana-pro'), nbNode: NODE('GeminiNanoBanana2V2'), geminiGuide: O('https://ai.google.dev/gemini-api/docs/image-generation'),
  flux2Node: NODE('Flux2ImageNode'), flux2Guide: O('https://docs.bfl.ml/guides/prompting_guide_flux2'), flux3Image: NODE('Flux3ImageNode'), flux3Layout: NODE('Flux3LayoutPrompt'),
  flux3Router: ROUTER('black-forest-labs/flux-3-image'), flux3Klein: TUT('flux/flux-3-klein'),
  ideogram45: ROUTER('ideogram/ideogram-4-5'), ideogramV4: ROUTER('ideogram/ideogram-v4'), recraftNode: NODE('RecraftV4TextToImageNode'),
  lumaNode: NODE('LumaImageNode2'), lumaEditNode: NODE('LumaImageEditNode2'), lumaRouter: ROUTER('luma_2/uni-1'),
  krea: NODE('Krea3ImageNode'), kreaRouter: ROUTER('krea/krea-3'), runwayRouter: ROUTER('runway/gen4-image'), runwayNode: NODE('RunwayTextToImageNode'),
  runwayTag: T('https://replicate.com/runwayml/gen4-image/api', 'referenceImages[].tag + @tag in the prompt (Runway API, mirrored by hosts)'),
  grokNode: NODE('GrokImageNode'), grokEdit: NODE('GrokImageEditNodeV2'), qwen3Node: NODE('QwenImageTextToImageApi'), qwenEditApi: NODE('QwenImageEditApi'),
  hunyuanT2I: NODE('HunyuanImageTextToImageApi'), hunyuanEdit: NODE('HunyuanImageEditApi'), muse: TUT('partner-nodes/meta/muse-image'),
  minimaxImage: O('https://platform.minimax.io/docs/api-reference/image-generation-t2i'),
  fibo: NODE('BriaImageEditNode'), fiboRouter: ROUTER('bria/image'), genfill: NODE('BriaGenFill'),
  qwen21: NODE('TextEncodeQwenImage21'), qwenEditPlus: NODE('TextEncodeQwenImageEditPlus'), qwen2509: O('https://huggingface.co/Qwen/Qwen-Image-Edit-2509'),
  zOmni: NODE('TextEncodeZImageOmni'), moss: NODE('MOSSImageLayoutPrompt'),
  aceStep: NODE('TextEncodeAceStepAudio1.5'), mmMusicLocal: NODE('MiniMaxMusic3TextEncode'), mmMusicTut: TUT('audio/minimax/minimax-music-3'),
  sonilo: NODE('SoniloTextToMusic'), soniloV2M: NODE('SoniloVideoToMusic'), seedAudio: NODE('ByteDanceSeedAudio'), seedAudioTut: TUT('partner-nodes/bytedance/seed-audio-1-0'), seedAudioRouter: ROUTER('byteplus/seed-audio-1-0-multilingual'),
  elevenV3: O('https://elevenlabs.io/docs/best-practices/prompting/eleven-v3'), elevenRouterV3: ROUTER('elevenlabs/eleven-v3'), elevenTts: NODE('ElevenLabsTextToSpeech'),
  elevenSfx: NODE('ElevenLabsTextToSoundEffects'), mmSpeech: O('https://platform.minimax.io/docs/api-reference/speech-t2a-http'),
  drama3: O('https://huggingface.co/fishaudio/drama-3'), stableAudio: NODE('ConditioningStableAudio'), tripoText: NODE('TripoTextToModelNodeV2'), tripoImage: NODE('TripoImageToModelNodeV2'),
};

// ---------------------------------------------------------------- builders ----------------------------------------------------------------
const NONE: RefGrammar = { style: 'none', src: [] };
const noPrompt = (key: string, name: string, medium: GrammarMedium, kind: GrammarKind, what: string, code: CodeRef[], src: Src[], extra: Partial<PromptGrammar> = {}): PromptGrammar => ({
  key, name, medium, kind, status: 'known', prompt: 'none', refs: { ...NONE, note: what, src }, negative: 'none', structure: 'No prompt: the model takes only its input.',
  example: '(no prompt)', code, sources: src, ...extra });
const g = (o: PromptGrammar) => o;

// Shared reference grammars ----------------------------------------------------------------
const KLING_REFS = (maxImages: number, video = false): RefGrammar => ({ style: 'tag', image: '<<<image_{n}>>>', element: '<<<element_{n}>>>', ...(video ? { video: '<<<video_{n}>>>' } : {}),
  base: 1, perKind: true, maxImages, ...(video ? { maxVideos: 1 } : {}), frames: { named: false, withRefs: true },
  unnamed: 'Sent but easy for the model to ignore: our Generate Video body lists unnamed refs at the end ("Reference images: <<<image_1>>>, …").',
  note: 'Kling\'s raw API wants the triple-angle tags; Comfy\'s Kling nodes accept @image / @video and convert them, our Router bodies do not.', src: [S.klingOmni, S.klingImage, S.klingNodeI2V] });
const SEEDANCE_REFS = (img: number, vid: number, aud: number): RefGrammar => ({ style: 'words', image: 'Image {n}', video: 'Video {n}', audio: 'Audio {n}', base: 1, perKind: true,
  maxImages: img, maxVideos: vid, maxAudio: aud, frames: { named: false, withRefs: false },
  unnamed: 'Used anyway; the model decides each input\'s role from the prompt (task_type auto).',
  note: 'Positional labels per kind in content order ("Image 2", "Video 1"), as Comfy\'s Seedance node writes them; fal\'s wrapper takes @Image1 / @Video1 / @Audio1 instead. First / last frames and reference media never go in one request.',
  src: [S.seedanceNode, S.seedance20, S.seedanceFal] });
const H3_API_REFS: RefGrammar = { style: 'words', image: 'Image {n}', video: 'Video {n}', audio: 'Audio {n}', base: 1, perKind: true, maxImages: 9, maxVideos: 3, maxAudio: 3,
  frames: { named: false, withRefs: false }, unnamed: 'Used as subject / style references in connection order.',
  note: 'Hosted H3 (Router, partner node, MiniMax API): plain "Image 1", "Video 1", "Audio 1" by order per kind. Reference audio needs an image or video next to it. Keyframes and references are mutually exclusive.',
  src: [S.h3RefNode, S.h3Partner, S.h3Router] };
const H3_NATIVE_REFS = (img: number, vid: number, aud: number): RefGrammar => ({ style: 'tag', image: '<Picture {n}>', video: '<Video {n}>', audio: '<Audio {n}>', base: 1, perKind: true,
  maxImages: img, maxVideos: vid, maxAudio: aud, frames: { named: false, withRefs: true },
  unnamed: 'Still conditions the clip, but the model can\'t tell which input a sentence means.',
  note: 'Local H3 (MiniMaxH3ReferenceToVideo): angle-bracket tags, 1-based per kind; ref_image_0 is <Picture 1>. Node order: images, then videos, then audio.',
  src: [S.h3NativeNode, S.h3Native, S.h3Multi] });
const WAN3_REFS: RefGrammar = { style: 'words', image: 'Image {n}', video: 'Video {n}', audio: 'Audio {n}', base: 1, perKind: true, maxImages: 10, maxVideos: 5, maxAudio: 5,
  frames: { named: false, withRefs: false }, unnamed: 'Used; order in the media array sets the numbers.',
  note: 'Router body: "Image 1", "Video 1", "Audio 1" in media-array order. Comfy\'s node accepts @Image1 and converts. Our route sends images only (videos / audio need public URLs: not wired).',
  src: [S.wan3, S.wan3Node] };
const ORDER_IMG = (max: number, src: Src[], note?: string, unnamed = 'Used in the order sent; describe each input\'s role in words.'): RefGrammar =>
  ({ style: 'order', image: 'image {n}', base: 1, perKind: true, maxImages: max, unnamed, ...(note ? { note } : {}), src });
const FRAME_ONLY = (src: Src[], note = 'The start (and end) frame is the only image; the prompt describes motion, not the frame.'): RefGrammar =>
  ({ style: 'none', frames: { named: false, withRefs: false }, note, src });

// Shared structures ----------------------------------------------------------------
const VIDEO_STRUCT = 'Subject and look, then the action in order, then camera move, then sound / dialogue; one shot unless the model does multi-shot.';
const IMAGE_STRUCT = 'Subject, setting, composition, light, style; for edits say what changes first, then what must stay the same.';
const EDIT_STRUCT = 'Name each input\'s role, say the one change, then list what to keep (face, pose, light, background).';

// ---------------------------------------------------------------- entries ----------------------------------------------------------------
const VIDEO: PromptGrammar[] = [
  g({ key: 'minimax-h3', name: 'MiniMax H3', medium: 'video', kind: 'video', status: 'known', prompt: 'required', refs: H3_API_REFS,
    places: [{ route: 'local', refs: { ...H3_NATIVE_REFS(9, 3, 3), src: [S.h3NativeNode, S.h3Native] }, note: 'Local graphs: <Picture 1> / <Video 1> / <Audio 1>. Our local Generate Video graphs are text and first + last frame only (no refs).' }],
    limits: { maxChars: 50000, note: 'MiniMax H3 Max / Max Turbo: 50,000 characters. Our MiniMax-API route caps at 7,000 (refused with a message).', src: [S.h3T2VNode, REPO('server/src/hostedRequests.ts')] },
    languages: 'Multilingual (English and Chinese documented in examples)', negative: 'in-prompt',
    special: ['Timeline marks inside the prompt, e.g. "[0s-2s] …", as in the official H3 templates', 'Generates the sound track with the picture: describe dialogue, effects and music in words', 'prompt_expansion_mode (H3 Max) rewrites the prompt; we send disabled'],
    structure: 'Look and mood line, then a "Timeline:" block of [start-end] beats, then sound. In Reference to video, name each input as Image N / Video N / Audio N.',
    example: 'A rainy neon alley, cinematic. Timeline: [0s-2s] Image 1 steps out of a taxi. [2s-5s] she looks up at the sign, rain on her face. Sound: rain, distant traffic.',
    code: [{ at: 'server/src/routing/routerModels.ts:732', follows: 'yes', note: 'Step 2: the runner rewrites @image1 → Image 1 first (routing/jobRefs.ts).' },
      { at: 'server/src/hostedRequests.ts:190', follows: 'yes', note: 'Step 2: over 7,000 is refused at quote, never cut.' },
      { at: 'server/src/tools/h3/plan.ts:39', follows: 'yes', note: 'Local text / first + last frame graphs: prompt only.' },
      { at: 'server/src/routing/routerModels.ts:100', follows: 'yes', note: 'App recipes (Camera Moves, Photo FX, Orbit) in our words, frame only.' }],
    sources: [S.h3RefNode, S.h3Partner, S.h3Native, S.h3T2VNode, S.h3Router] }),
  // 2026-10-27: MiniMax H3 Fast (FastVideo FastH3 8-step, Comfy Cloud). Same H3 text encoder, so the H3 prompt style; text or a start frame, no refs.
  g({ key: 'minimax-h3-fast', name: 'MiniMax H3 Fast', medium: 'video', kind: 'video', status: 'known', prompt: 'required',
    refs: { style: 'none', note: 'Text to video, or a start frame (image to video) that sets the look: never named in the prompt. No reference inputs (Ref2VA was not distilled).', src: [TUT('video/minimax/minimax-h3-fastvideo')] },
    languages: 'Multilingual (the MiniMax H3 text encoder)', negative: 'in-prompt',
    special: ['Shots, camera moves and the sound (dialogue, effects, music) in one prompt block, as for MiniMax H3', 'With a start frame, describe the motion, camera and sound; the image gives the look', 'Steps fixed at 8 (the distilled schedule)'],
    structure: 'Look and mood line, then the shots and camera, then the sound.',
    example: 'A lighthouse on a cliff at dusk, cinematic. The camera glides in over the waves as the lamp turns on. Sound: surf, gulls, a low wind.',
    code: [{ at: 'server/src/comfy/h3FastCloud.ts:66', follows: 'yes', note: 'The prompt goes to the template\'s MiniMaxH3ImageToVideo node as written.' }],
    sources: [TUT('video/minimax/minimax-h3-fastvideo'), TUT('video/minimax/minimax-h3-prompt-guide')] }),
  g({ key: 'minimax-h3-camera-motion', name: 'H3 Camera Motion', medium: 'video', kind: 'video', status: 'known', prompt: 'optional', refs: FRAME_ONLY([REPO('workflows/h3-camera-motion-api.json')]),
    negative: 'none', triggers: ['camera motion,'], special: ['LoRA trigger "camera motion," then the move phrase (our cameraPrompt)'],
    structure: '"camera motion, <adverb> <move>." then the user\'s extra words.', example: 'camera motion, slow orbit around the subject. Keep the statue still.',
    code: [{ at: 'server/src/tools/h3/catalog.ts:22', follows: 'yes', note: 'cameraPrompt writes the trigger first.' }, { at: 'server/src/tools/h3/plan.ts:51', follows: 'yes' }],
    sources: [REPO('workflows/h3-camera-motion-api.json', 'template default prompt starts with the trigger'), S.h3Native] }),
  g({ key: 'minimax-h3-talking-photo', name: 'H3 Talking Photo', medium: 'video', kind: 'lipsync', status: 'known', prompt: 'optional', refs: H3_API_REFS,
    places: [{ route: 'local', refs: { ...H3_NATIVE_REFS(1, 0, 1), unnamed: 'The photo and speech are wired by the graph; naming them only helps if the tags are right.' }, note: 'Local graph: <Picture 1> / <Audio 1>.' }], negative: 'none',
    structure: '"<Picture 1> speaks the words of <Audio 1> …" (local) or "Image 1 … Audio 1" (hosted), then expression and head motion.',
    example: '<Picture 1> speaks the words of <Audio 1> with natural lip sync, small nods and blinks; keep the face exactly the same.',
    code: [{ at: 'workflows/h3-lipsync-api.json', follows: 'yes', note: 'Step 2: template now says <Picture 1> / <Audio 1>.' },
      { at: 'server/src/tools/h3/plan.ts:45', follows: 'yes', note: 'User words rewritten to native tags (buildPlan).' },
      { at: 'server/src/tools/h3/index.ts:154', follows: 'yes', note: 'finalPrompt for the hosted routes uses Image 1 / Audio 1 (right for the API).' }],
    sources: [S.h3NativeNode, S.h3Native, S.h3RefNode] }),
  g({ key: 'minimax-h3-extend', name: 'H3 Extend', medium: 'video', kind: 'video', status: 'known', prompt: 'optional', refs: { style: 'none', note: 'The clip\'s last frames are the guide; the prompt describes what happens next.', src: [REPO('workflows/h3-extend-api.json')] },
    negative: 'none', structure: 'What happens next, in the same look; no recap of the clip.', example: 'She keeps walking, turns the corner and the camera follows her into the market.',
    code: [{ at: 'server/src/tools/h3/plan.ts:56', follows: 'yes' }], sources: [S.h3Native] }),
  g({ key: 'minimax-h3-max-extend', name: 'H3 Max Extend', medium: 'video', kind: 'video', status: 'known', prompt: 'optional', refs: { style: 'none', note: 'fal extend-video: the source clip goes as video_url, never named.', src: [T('https://fal.ai/models/minimax/h3-max/extend-video/api')] },
    negative: 'none', structure: 'What happens next.', example: 'The drone keeps rising until the whole valley is in view.', code: [{ at: 'server/src/tools/h3/cloud.ts:48', follows: 'yes' }],
    sources: [T('https://fal.ai/models/minimax/h3-max/extend-video/api')] }),
  g({ key: 'minimax-h3-character-swap', name: 'H3 Character Swap', medium: 'video', kind: 'video-edit', status: 'known', prompt: 'optional', refs: H3_NATIVE_REFS(1, 1, 0), negative: 'none',
    structure: 'Replace <who> in <Video 1> with the character in <Picture 1>; keep motion, camera, light.', example: 'Replace the runner in <Video 1> with the knight in <Picture 1>; same pace, same camera, same light.',
    code: [{ at: 'server/src/comfy/objectSwap.ts:126', follows: 'yes' }, { at: 'server/src/comfy/objectSwap.ts:123', follows: 'yes' }], sources: [S.h3NativeNode, S.h3Native] }),
  g({ key: 'minimax-h3-crossview', name: 'H3 CrossView', medium: 'video', kind: 'video-edit', status: 'known', prompt: 'optional', refs: H3_NATIVE_REFS(1, 1, 0), negative: 'none',
    triggers: ['crossview.'], special: ['CrossView-Warp LoRA: the prompt starts with the trigger "crossview."'], structure: '"crossview." then what the new angle reveals.',
    example: 'crossview. The far side of the room comes into view, a window behind the desk.', code: [{ at: 'server/src/comfy/crossview.ts:69', follows: 'yes' }],
    sources: [REPO('workflows/deploy/h3-crossview-api.json', 'template prompt is the trigger')] }),
  g({ key: 'minimax-h3-style-transfer', name: 'H3 Style Transfer', medium: 'video', kind: 'video-edit', status: 'known', prompt: 'optional', refs: H3_NATIVE_REFS(1, 1, 0), negative: 'none',
    triggers: ['style_transfer:'], structure: '"style_transfer: restyle <Video 1> in the style of <Picture 1>", then what to keep.',
    example: 'style_transfer: restyle <Video 1> as the watercolour in <Picture 1>; keep the motion and timing.',
    code: [{ at: 'workflows/h3-style-transfer-api.json', follows: 'yes', note: 'Step 2: template uses <Video 1> / <Picture 1>.' },
      { at: 'server/src/tools/h3/plan.ts:65', follows: 'yes', note: 'Trigger right; the user\'s @video1 / image 1 become native tags.' }],
    sources: [S.h3NativeNode, S.h3Native] }),
  g({ key: 'minimax-h3-vfx-edit', name: 'H3 VFX Edit', medium: 'video', kind: 'video-edit', status: 'known', prompt: 'optional', refs: H3_NATIVE_REFS(0, 1, 0), negative: 'none',
    triggers: ['vfx_edit:'], structure: '"vfx_edit:" then the effect on <Video 1>, then what stays.', example: 'vfx_edit: add glowing embers drifting up around the dancer in <Video 1>; keep everything else.',
    code: [{ at: 'workflows/h3-vfx-edit-api.json', follows: 'yes', note: 'Step 2: <Video 1>.' }, { at: 'server/src/tools/h3/plan.ts:65', follows: 'yes' }],
    sources: [S.h3NativeNode] }),
  g({ key: 'ltx-2-19b', name: 'LTX-2 19B', medium: 'video', kind: 'video', status: 'known', prompt: 'required', refs: FRAME_ONLY([S.ltxPromptNode]), negative: 'field',
    languages: 'English (Gemma text encoder)', special: ['Camera LoRAs carry the move; our preset hint is appended to the prompt', '@image mentions are not understood (no reference input)'],
    structure: 'One flowing paragraph, present tense: shot and subject, action beat by beat, camera, light, sound. Long and literal beats short.',
    example: 'A slow dolly in on a potter at her wheel; clay rises between her hands, late sun through dusty glass, the wheel hums.',
    code: [{ at: 'server/src/comfy/plans.ts:185', follows: 'yes', note: 'Step 2: mentions become plain words (no reference input).' }, { at: 'server/src/comfy/reshoot.ts:32', follows: 'yes' }],
    sources: [S.ltxPromptNode, S.ltxGuide] }),
  g({ key: 'wan-2.2-fun-camera-14b', name: 'Wan 2.2 Fun Camera 14B', medium: 'video', kind: 'video', status: 'known', prompt: 'required', refs: FRAME_ONLY([NODE('WanCameraImageToVideo')]), negative: 'field',
    languages: 'English and Chinese', special: ['The move is a node setting (camera_pose), not prompt words'], structure: 'Subject, action, scene; the move phrase follows.',
    example: 'A lighthouse on a cliff at dusk, waves breaking below. The camera pans left.', code: [{ at: 'server/src/comfy/plans.ts:179', follows: 'yes', note: 'Step 2: mentions become plain words.' }],
    sources: [NODE('WanCameraImageToVideo'), REPO('workflows/camera-moves-api.json')] }),
  g({ key: 'wan-2.2-animate-14b', name: 'Wan 2.2 Animate 14B', medium: 'video', kind: 'video-edit', status: 'known', prompt: 'optional',
    refs: ORDER_IMG(1, [NODE('WanAnimateToVideo')], 'One character image (+ extra refs on swap) and the driving clip; the prompt never names them.'), negative: 'field', languages: 'English and Chinese',
    structure: 'Short: who the character is and that they follow the clip.', example: 'The character performs the same moves as in the video, natural and smooth.',
    code: [{ at: 'server/src/comfy/plans.ts:95', follows: 'yes', note: '"the character from the reference image": describes, never tags.' }, { at: 'server/src/comfy/plans.ts:111', follows: 'yes' }],
    sources: [NODE('WanAnimateToVideo')] }),
  g({ key: 'wan-2.1-vace-14b', name: 'Wan 2.1 VACE 14B', medium: 'video', kind: 'video-edit', status: 'known', prompt: 'optional', refs: ORDER_IMG(1, [NODE('WanVaceToVideo')], 'A style swatch image as reference, by order.'),
    negative: 'field', languages: 'English and Chinese', structure: 'Style words for the whole clip, with the subject slot filled.', example: 'watercolour painting of a cyclist on a coastal road, soft paper texture',
    code: [{ at: 'server/src/comfy/restyle.ts:43', follows: 'yes' }], sources: [NODE('WanVaceToVideo')] }),
  g({ key: 'wan-2.2-i2v-14b', name: 'Wan 2.2 I2V 14B', medium: 'video', kind: 'video', status: 'known', prompt: 'required', refs: FRAME_ONLY([NODE('WanImageToVideo')]), negative: 'field', languages: 'English and Chinese',
    structure: 'The one motion or effect, then keep the subject.', example: 'The subject slowly floats upward as petals swirl around them.', code: [{ at: 'server/src/comfy/plans.ts:234', follows: 'yes' }],
    sources: [NODE('WanImageToVideo')] }),
  g({ key: 'infinitetalk-wan-2.1', name: 'InfiniteTalk (Wan 2.1)', medium: 'video', kind: 'lipsync', status: 'known', prompt: 'optional', refs: { style: 'none', note: 'Photo and speech are wired by the graph (start image + audio encoder).', src: [NODE('WanInfiniteTalkToVideo')] },
    negative: 'none', languages: 'English and Chinese (umt5 text encoder)', structure: 'Who is speaking and how they look or move; our base talking sentence follows. No quoted dialogue.', example: 'A friendly teacher in a bright classroom, warm smile, gentle hand gestures.',
    code: [{ at: 'server/src/comfy/infiniteTalkCloud.ts', follows: 'yes', note: 'Quotes are stripped; the negative is the prompt zeroed, as the official template.' }], sources: [NODE('WanInfiniteTalkToVideo'), TUT('video/wan/wan-infinitetalk')] }),
  g({ key: 'ltx-2.5-talking-photo', name: 'LTX-2.5 Talking Photo', medium: 'video', kind: 'lipsync', status: 'known', prompt: 'optional', refs: { style: 'none', note: 'Photo and speech are wired by the graph.', src: [NODE('LTXVReferenceAudio')] },
    negative: 'field', structure: 'Who is speaking and how; our base lip-sync sentence follows.', example: 'A calm news presenter, steady gaze, slight smile.',
    code: [{ at: 'server/src/comfy/ltx25Lipsync.ts:25', follows: 'yes', note: 'Quotes are stripped so the model does not read them as new lines.' }], sources: [NODE('LTXVReferenceAudio')] }),
  g({ key: 'ltx-2.5-22b', name: 'LTX-2.5 22B', medium: 'video', kind: 'video', status: 'known', prompt: 'required', refs: FRAME_ONLY([S.ltxPromptNode]), negative: 'field', languages: 'English (Gemma 4 encoder)',
    special: ['LoRA templates carry their trigger (e.g. XPLDV "separates into an ordered exploded view.")', 'Sound is generated: describe it'],
    structure: 'One flowing present-tense paragraph: shot, subject, action beats, camera, light, sound.', example: 'The camera holds on a kettle on a stove; steam starts to curl, then it whistles sharply.',
    code: [{ at: 'server/src/comfy/ltx25Video.ts:69', follows: 'yes' }, { at: 'server/src/tools/apps.ts:500', follows: 'yes', note: 'LoRA prompt template.' }], sources: [S.ltxPromptNode, S.ltxGuide] }),
  g({ key: 'wan-2.2-ti2v-5b', name: 'Wan 2.2 5B', medium: 'video', kind: 'video', status: 'known', prompt: 'required', refs: FRAME_ONLY([NODE('Wan22ImageToVideoLatent')]), negative: 'field', languages: 'English and Chinese',
    structure: VIDEO_STRUCT, example: 'A red kite climbs over a windy beach, tail snapping, kids running below.', code: [{ at: 'server/src/comfy/wan22.ts:35', follows: 'yes' }], sources: [NODE('Wan22ImageToVideoLatent')] }),
  // Seedance: one grammar, four ids
  ...([['seedance-2.0', 'Seedance 2.0', 9, 3, 3], ['seedance-2.0-fast', 'Seedance 2.0 Fast', 9, 3, 3], ['seedance-2.0-mini', 'Seedance 2.0 Mini', 9, 3, 3], ['seedance-2.5', 'Seedance 2.5', 30, 10, 10]] as const)
    .map(([key, name, i, v, a]) => g({ key, name, medium: 'video', kind: 'video', status: 'known', prompt: 'required', refs: SEEDANCE_REFS(i, v, a),
      places: [{ route: 'fal', refs: { style: 'tag', image: '@Image{n}', video: '@Video{n}', audio: '@Audio{n}', base: 1, src: [S.seedanceFal] }, note: 'fal\'s schema names refs @Image1 / @Video1 / @Audio1.' }],
      limits: { maxChars: 40000, note: 'No BytePlus limit published; Comfy Router guards at 40,000 characters.', src: [S.seedance20] }, languages: 'Chinese and English', negative: 'in-prompt',
      special: ['Spoken lines in double quotes steer the generated dialogue', 'Multi-shot by plain words ("Shot 1: … Shot 2: …")', 'Legacy "--ratio 16:9" suffixes in the text: we send real fields instead, never the suffix'],
      structure: 'Subject (name each input: Image 1 is …), action in shots, camera, then sound and quoted dialogue.',
      example: 'Image 1 is the dancer, Video 1 the routine. She performs the routine on a rooftop at dawn. Shot 2: close-up as she says "again".',
      code: [{ at: 'server/src/routing/routerModels.ts:435', follows: 'yes', note: 'Step 2: @image1 → Image 1 before the body.' },
        { at: 'server/src/providers/byteplus.ts:118', follows: 'yes', note: 'Same rewrite on the BytePlus place (routing/run.ts).' }],
      sources: [S.seedanceNode, S.seedanceNodeV1, S.seedance20, S.seedance25, S.seedanceFal, S.seedanceTogether] })),
  ...([['veo-3.1', 'Veo 3.1'], ['veo-3.1-fast', 'Veo 3.1 Fast'], ['veo-3.1-lite', 'Veo 3.1 Lite'] /* 2026-10-31: the same Vertex schema */] as const).map(([key, name]) => g({ key, name, medium: 'video', kind: 'video', status: 'known', prompt: 'required',
    refs: { ...FRAME_ONLY([S.veo]), note: 'Our route sends text, a first frame, or first + last. Veo\'s referenceImages (up to 3 asset or 1 style) are not wired.' }, negative: 'field',
    special: ['Dialogue written as "<who> says: …"', 'Separate sentences for sound effects and ambience', 'enhancePrompt: Veo rewrites the prompt by default (we send true unless the rewrite is explicitly off)', 'Negative prompt lists things, never "no …" / "don\'t …"'],
    structure: 'Subject, action, scene, camera angle and move, lens, style and light, timing, then audio.',
    example: 'Low-angle tracking shot of a cyclist racing a train at sunset. She shouts: "Almost there!" Sound: wind, the train horn.',
    code: [{ at: 'server/src/routing/routerModels.ts:453', follows: 'yes', note: 'Step 2: enhancePrompt true (Veo default) unless the rewrite is explicitly off (a switch, or an API / MCP caller).' }],
    sources: key === 'veo-3.1-lite' ? [S.veoLite, S.veo, S.veoGuide] : [S.veo, S.veoNode, S.veoGuide] })),
  g({ key: 'kling-v3', name: 'Kling 3.0 Omni', medium: 'video', kind: 'video', status: 'known', prompt: 'required', refs: KLING_REFS(7),
    limits: { maxChars: 2500, note: 'multi_prompt storyboards: up to 6, 512 characters each.', src: [S.klingOmni, S.klingNodeT2V] }, negative: 'in-prompt',
    special: ['Positive and negative descriptions in one prompt (no negative field)', 'multi_shot / multi_prompt storyboards (not wired)', 'Frames go as image_list type first_frame / end_frame and are not named'],
    structure: 'Name each input by tag, then action, camera and sound.', example: '<<<image_1>>> walks through the market in <<<image_2>>>\'s style; handheld, warm evening light.',
    code: [{ at: 'server/src/routing/routerModels.ts:223', follows: 'yes', note: 'Step 2: chips become tags, only unnamed refs are appended (never double-tagged).' }, { at: 'server/src/routing/routerModels.ts:703', follows: 'partly' }],
    sources: [S.klingOmni, S.klingNodeT2V, S.klingNodeI2V] }),
  g({ key: 'kling-v3-omni-edit', name: 'Kling 3.0 Omni Edit', medium: 'video', kind: 'video-edit', status: 'known', prompt: 'required', refs: { ...KLING_REFS(4, true), maxImages: 4 },
    limits: { maxChars: 2500, src: [S.klingNodeEdit] }, negative: 'in-prompt', structure: 'Replace / turn <<<video_1>>> …, with <<<image_1>>> as the character or look; then what to keep.',
    example: 'Replace the man on the left in <<<video_1>>> with the character from <<<image_1>>>; keep the motion, camera and light.',
    code: [{ at: 'server/src/shared/cloudSwap.ts:75', follows: 'yes' }, { at: 'server/src/routing/routerModels.ts:488', follows: 'yes' }, { at: 'server/src/shared/renderModels.ts:110', follows: 'yes' }],
    sources: [S.klingOmni, S.klingNodeEdit] }),
  g({ key: 'seedance-2.5-edit', name: 'Seedance 2.5 Edit', medium: 'video', kind: 'video-edit', status: 'known', prompt: 'required', refs: SEEDANCE_REFS(30, 10, 10), negative: 'in-prompt', languages: 'Chinese and English',
    structure: 'Edit Video 1 …, with Image 1 as the character; then keep list.', example: 'Replace the woman in the red coat in Video 1 with the character in Image 1; same motion and framing.',
    code: [{ at: 'server/src/routing/routerModels.ts:488', follows: 'yes', note: 'Step 2: Video 1 / Image 1.' },
      { at: 'server/src/shared/renderModels.ts:111', follows: 'yes', note: 'Step 2: Video 1 / Image 1.' }],
    sources: [S.seedanceNode, S.seedance25] }),
  g({ key: 'runway-aleph-2', name: 'Runway Aleph 2', medium: 'video', kind: 'video-edit', status: 'known', prompt: 'required',
    refs: { style: 'none', note: 'Guidance images go as promptImage with a position (first / last / time), never named in the text; up to 5.', maxImages: 5, src: [S.aleph, S.alephRouter] },
    limits: { maxChars: 1000, minChars: 1, src: [S.aleph, S.alephRouter] }, negative: 'none', structure: 'What should appear in the output; the source video is implied.', example: 'A finished live-action street at night: wet asphalt, neon reflections, real people.',
    code: [{ at: 'server/src/shared/renderModels.ts:112', follows: 'yes' }], sources: [S.aleph, S.alephRouter] }),
  g({ key: 'luma-ray-3.2-edit', name: 'Luma Ray 3.2 Edit', medium: 'video', kind: 'video-edit', status: 'known', prompt: 'required', refs: { style: 'none', note: 'Source video only.', src: [S.ray32] },
    limits: { maxChars: 6000, minChars: 1, src: [S.ray32] }, negative: 'none', structure: 'The edit, then keep the motion.', example: 'Real materials and daylight on the toy cars; keep every move the same.',
    code: [{ at: 'server/src/shared/renderModels.ts:113', follows: 'yes' }], sources: [S.ray32] }),
  g({ key: 'wan-3.0', name: 'Wan 3.0', medium: 'video', kind: 'video', status: 'known', prompt: 'required', refs: WAN3_REFS,
    limits: { maxChars: 20000, providerCuts: true /* comfy-docs pages/development/comfy-router/models/wan/wan3-0-video/code.md, input.prompt: over the cap is truncated (2026-10-28) */, note: 'Over the limit is cut by the provider: the run goes ahead with a warning.', src: [S.wan3, S.wan3Node] }, languages: 'English and Chinese', negative: 'field', special: ['prompt_extend rewrites the prompt (off unless asked)'],
    structure: 'Name inputs Image 1 / Video 1 / Audio 1, then action, camera, sound.', example: 'Image 1 and Image 2 meet at a train platform; Image 1 hands over a letter. Slow push in.',
    code: [{ at: 'server/src/routing/routerModels.ts:719', follows: 'yes', note: 'Step 2: @image1 → Image 1.' }], sources: [S.wan3, S.wan3Node] }),
  // Wan 3.0 Prime (2026-10-31): the Wan 3.0 schema on its own Router id, so the same grammar.
  g({ key: 'wan-3.0-prime', name: 'Wan 3.0 Prime', medium: 'video', kind: 'video', status: 'known', prompt: 'required', refs: WAN3_REFS,
    limits: { maxChars: 20000, providerCuts: true /* comfy-docs pages/development/comfy-router/models/wan/wan3-0-video/code.md, input.prompt: over the cap is truncated (2026-10-28) */, note: 'Over the limit is cut by the provider: the run goes ahead with a warning.', src: [S.wan3Prime, S.wan3] }, languages: 'English and Chinese', negative: 'field', special: ['prompt_extend rewrites the prompt (off unless asked)'],
    structure: 'Name inputs Image 1 / Video 1 / Audio 1, then action, camera, sound.', example: 'Image 1 and Image 2 meet at a train platform; Image 1 hands over a letter. Slow push in.',
    code: [{ at: 'server/src/routing/routerModels.ts:719', follows: 'yes', note: 'Step 2: @image1 → Image 1.' }], sources: [S.wan3Prime, S.wan3] }),
  // P-Video-2 and Grok Imagine Video 1.5 Lite (2026-10-31): text or a start frame (P-Video-2 also an end frame); the frames are never named in the text.
  g({ key: 'p-video-2', name: 'P-Video-2', medium: 'video', kind: 'video', status: 'known', prompt: 'required', refs: FRAME_ONLY([S.pvideo2]), negative: 'none',
    special: ['prompt_upsampling: Pruna rewrites the prompt by default (we leave it on unless the rewrite is explicitly off)', 'aspect_ratio is ignored with a start frame'],
    structure: 'Subject, action, camera, setting and light, then sound.', example: 'A paper boat drifts down a rain-filled gutter; low tracking shot, streetlights glinting, rain pattering.',
    code: [{ at: 'server/src/routing/routerModels.ts', follows: 'yes', note: 'router-pvideo2 body: input.prompt as typed.' }], sources: [S.pvideo2, S.pvideo2Pruna] }),
  g({ key: 'grok-imagine-video-1.5-lite', name: 'Grok Imagine Video 1.5 Lite', medium: 'video', kind: 'video', status: 'known', prompt: 'required', refs: FRAME_ONLY([S.grokVideoLite]),
    limits: { maxChars: 4096, src: [S.grokVideoLite] }, negative: 'none', structure: 'Subject, action, camera, setting and light.',
    example: 'A red kite climbs over a windy beach at golden hour; the camera follows it up from the sand.',
    code: [{ at: 'server/src/routing/routerModels.ts', follows: 'yes', note: 'router-grok-video-lite body: prompt as typed, refused over 4,096 characters before any call.' }], sources: [S.grokVideoLite] }),
  ...([['ltx-2.5-pro', 'LTX-2.5 Pro'], ['ltx-2.5-fast', 'LTX-2.5 Fast'], ['ltx-2.3-fast', 'LTX-2.3 Fast']] as const).map(([key, name]) => g({ key, name, medium: 'video', kind: 'video', status: 'known', prompt: 'required',
    refs: FRAME_ONLY([S.ltxApiI2V], 'First frame (+ optional last frame) on the LTX API and on Comfy Cloud (LtxApi25ImageToVideo partner node); the Router place is text only.'), limits: { maxChars: 10000, minChars: 1, src: [S.ltxApiT2V, S.ltxApiI2V] }, negative: 'none',
    special: ['camera_motion is a field (from our preset), not words'], structure: 'One flowing present-tense paragraph: shot, subject, action, camera, light, sound.',
    example: 'A barista slides a latte across the counter; the camera tracks the cup, morning light, the hiss of the steamer.',
    code: [{ at: 'server/src/providers/directSpecs.ts:67', follows: 'yes' }, ...(key === 'ltx-2.5-pro' ? [{ at: 'server/src/routing/routerModels.ts:824', follows: 'yes' as const }] : []), ...(key !== 'ltx-2.3-fast' ? [{ at: 'server/src/comfy/ltx25ApiCloud.ts:105', follows: 'yes' as const, note: 'Comfy Cloud partner node (image jobs).' }] : [])],
    sources: [S.ltxApiT2V, S.ltxApiI2V, S.ltxRouter, S.ltxGuide] })),
  g({ key: 'flux-3-video', name: 'FLUX 3 Video', medium: 'video', kind: 'video', status: 'known', prompt: 'required', refs: FRAME_ONLY([S.flux3Video]), negative: 'none',
    special: ['The prompt is interpreted and expanded before generation', 'Describe ambience, music and speech separately for layered audio'], structure: 'Plain-language shot, then the three sound layers.',
    example: 'A fox trots across fresh snow at dawn. Ambience: soft wind. Music: a lone cello. No speech.',
    code: [{ at: 'server/src/providers/directSpecs.ts:28', follows: 'yes' }, { at: 'server/src/routing/routerModels.ts:759', follows: 'yes' }], sources: [S.flux3Video, S.flux3VideoNode] }),
  // FLUX 3 Max (2026-10-27): keyframes are wired by the graph (keyframes.image_0…), never named in the prompt; cuts are written as SHOT ONE / HARD CUT / SHOT TWO.
  g({ key: 'flux-3-max', name: 'FLUX 3 Max', medium: 'video', kind: 'video', status: 'known', prompt: 'required', limits: { maxChars: 50000, minChars: 1, src: [NODE('Flux3MaxTextToVideoNode')] },
    refs: { style: 'none', note: 'Text, or 1–10 keyframe images in playback order (start, start + end, or spread / pinned to seconds); the prompt describes motion and sound, not the frames.', src: [TUT('partner-nodes/black-forest-labs/flux-3-max'), NODE('Flux3MaxImageToVideoNode')] }, negative: 'none',
    special: ['reasoning_level expands the prompt before generation (same price)', 'Write cuts explicitly: SHOT ONE, HARD CUT, SHOT TWO', 'Describe ambience, music and speech separately for layered audio'],
    structure: 'The shot (and any cuts), the camera, then the sound layers.', example: 'SHOT ONE: a red panda walks along a mossy log. HARD CUT. SHOT TWO: it looks up at falling leaves. Ambience: birdsong. No music.',
    code: [{ at: 'server/src/comfy/flux3MaxCloud.ts', follows: 'yes' }], sources: [TUT('partner-nodes/black-forest-labs/flux-3-max'), ROUTER('fal/flux-3-max'), NODE('Flux3MaxTextToVideoNode'), NODE('Flux3MaxImageToVideoNode')] }),
  // Kling 4.0 (2026-10-31): the Kling4 partner nodes take @Image1… (frames in order, or the reference images) and turn them into Kling's @image_1.
  g({ key: 'kling-4', name: 'Kling 4.0', medium: 'video', kind: 'video', status: 'known', prompt: 'required', limits: { maxChars: 26000, minChars: 1, src: [O('https://github.com/Comfy-Org/ComfyUI/pull/17364')] },
    refs: { style: 'tag', image: '@Image{n}', base: 1, perKind: true, maxImages: 10, frames: { named: true, withRefs: false }, unnamed: 'Used; say each image\'s role.',
      note: 'Image to video names the frames in order (@Image1 = start, @Image2 = end); reference to video names up to 10 images. The node checks every name has an input.', src: [O('https://github.com/Comfy-Org/ComfyUI/pull/17364')] }, negative: 'in-prompt',
    special: ['Stereo sound in every clip: describe dialogue, ambience and music in the prompt', 'Timed shots in one prompt (0-1.5s: …, 1.5-3s: hard cut …)'],
    structure: 'Shots with timings, subject and action, camera, then sound.', example: 'Two shots. 0-3s: @Image1 walks into the hall from @Image2, slow dolly in. 3-6s: hard cut, close-up, she smiles. Sound: footsteps, soft piano.',
    code: [{ at: 'server/src/comfy/kling4Cloud.ts', follows: 'yes' }], sources: [O('https://github.com/Comfy-Org/ComfyUI/pull/17364')] }),
  noPrompt('seedvr2', 'SeedVR2', 'video', 'upscale', 'Video upscale: source clip only.', [{ at: 'server/src/comfy/plans.ts:238', follows: 'n/a' }], [REPO('workflows/upscale-api.json')]),
  noPrompt('seedvr2-3b-video', 'SeedVR2 3B', 'video', 'upscale', 'Video upscale (local, NVIDIA only): source clip only.', [{ at: 'server/src/tools/videoUpscaleModels.ts', follows: 'n/a' }], [REPO('workflows/upscale-seedvr2-native-api.json')]),
  noPrompt('real-esrgan-x2-video', 'Real-ESRGAN x2', 'video', 'upscale', 'Per-frame video upscale: source clip only.', [{ at: 'server/src/tools/videoUpscaleModels.ts', follows: 'n/a' }], [REPO('workflows/upscale-esrgan-api.json')]),
  noPrompt('4x-ultrasharp-video', '4x-UltraSharp', 'video', 'upscale', 'Per-frame video upscale: source clip only.', [{ at: 'server/src/tools/videoUpscaleModels.ts', follows: 'n/a' }], [REPO('workflows/upscale-ultrasharp-api.json')]),
  noPrompt('topaz-starlight-fast', 'Topaz Starlight Fast', 'video', 'upscale', 'Topaz partner-node graph: video and size only.', [{ at: 'server/src/tools/videoUpscaleModels.ts', follows: 'n/a' }], [REPO('server/src/tools/videoUpscaleModels.ts')]),
  noPrompt('topaz-starlight-precise-2.5', 'Topaz Starlight Precise 2.5', 'video', 'upscale', 'Topaz partner-node graph: video and size only.', [{ at: 'server/src/tools/videoUpscaleModels.ts', follows: 'n/a' }], [REPO('server/src/tools/videoUpscaleModels.ts')]),
  noPrompt('topaz-astra-2', 'Topaz Astra 2', 'video', 'upscale', 'Topaz partner-node graph: video and size only.', [{ at: 'server/src/tools/videoUpscaleModels.ts', follows: 'n/a' }], [REPO('server/src/tools/videoUpscaleModels.ts')]),
  noPrompt('topaz-starlight-creative', 'Topaz Starlight Creative', 'video', 'upscale', 'Topaz partner-node graph: video and size only.', [{ at: 'server/src/tools/videoUpscaleModels.ts', follows: 'n/a' }], [REPO('server/src/tools/videoUpscaleModels.ts')]),
  noPrompt('crystal-video-upscaler', 'Crystal Video Upscaler', 'video', 'upscale', 'Video upscale: source clip only (listed, never runs: price not published).', [{ at: 'server/src/tools/videoUpscaleModels.ts', follows: 'n/a' }], [REPO('server/src/tools/videoUpscaleModels.ts')]),
  g({ key: 'flux-3-upscaler', name: 'FLUX 3 Upscaler', medium: 'video', kind: 'upscale', status: 'known', prompt: 'optional', refs: { style: 'none', note: 'Source clip only.', src: [NODE('FluxVideoUpscaleNode')] }, negative: 'none',
    special: ['Prompt only in creative mode'], structure: 'Creative mode: the detail to add.', example: 'Crisp fabric texture and sharp foliage.', code: [{ at: 'server/src/hostedRequests.ts:174', follows: 'yes' }], sources: [NODE('FluxVideoUpscaleNode')] }),
  noPrompt('birefnet', 'BiRefNet', 'video', 'utility', 'Background removal.', [{ at: 'server/src/comfy/plans.ts:238', follows: 'n/a' }], [REPO('workflows/remove-bg-birefnet-api.json')]),
  noPrompt('bria-video-background-removal', 'Bria Video Background Removal', 'video', 'utility', 'Background removal.', [], [NODE('BriaRemoveVideoBackground')]),
  noPrompt('luma-ray-2-reframe', 'Luma Reframe', 'video', 'utility', 'Reframes to a new shape (Luma Ray 3.2).', [{ at: 'server/src/tools/editVideo/index.ts', follows: 'yes' }], [NODE('LumaRay32VideoReframeNode')],
    { prompt: 'optional', structure: 'What fills the new areas; empty sends a short default ("Extend the scene naturally").', example: 'Extend the beach and the sky naturally.' }),
  noPrompt('rife-4.9', 'RIFE 4.9', 'video', 'utility', 'Frame interpolation.', [{ at: 'server/src/comfy/plans.ts:252', follows: 'n/a' }], [REPO('workflows/fps-boost-rife-api.json')]),
  noPrompt('depth-anything-v2-small', 'Depth Anything V2 Small', 'video', 'utility', 'Depth map.', [], [REPO('workflows/depth-map-dav2-api.json')]),
  noPrompt('ffmpeg-hdr10', 'ffmpeg HDR10 conversion', 'video', 'utility', 'Not an AI model.', [], [I('https://ffmpeg.org/ffmpeg-filters.html#zscale')]),
  // Official Comfy templates added 2026-10-27 (tools/comfyFeatured.ts, tools/promptEdit.ts)
  g({ key: 'gemini-omni-1.1-flash', name: 'Gemini Omni 1.1 Flash', medium: 'video', kind: 'video', status: 'known', prompt: 'required',
    refs: FRAME_ONLY([NODE('GeminiVideoOmniV2')], 'A start frame, or start + end frames (image to video); the prompt describes the motion.'), negative: 'none',
    special: ['The length goes in the prompt in words ("A 6-second clip."), 3–10 s; we add it at the end'], structure: VIDEO_STRUCT,
    example: 'A paper boat drifts down a rainy street gutter, the camera follows low, rain patter and distant traffic.',
    code: [{ at: 'server/src/comfy/geminiOmniCloud.ts:65', follows: 'yes', note: 'The user\'s words, then the length in words.' }], sources: [NODE('GeminiVideoOmniV2')] }),
  g({ key: 'wan-animate-2', name: 'Wan Animate 2', medium: 'video', kind: 'video-edit', status: 'known', prompt: 'optional',
    refs: ORDER_IMG(1, [TUT('video/wan/wan-animate-2')], 'One character image and the driving clip; the prompt never names them.'), negative: 'field', languages: 'English and Chinese',
    structure: 'Who the character is, then the scene, background and camera move; the motion comes from the clip.', example: 'A knight in silver armour on a windy cliff at dusk, slow orbit around him.',
    code: [{ at: 'server/src/comfy/wanAnimate2Cloud.ts:64', follows: 'yes', note: 'The template\'s two-part shape (character, background); the pose prompt is fixed.' }], sources: [TUT('video/wan/wan-animate-2')] }),
  g({ key: 'bernini-r', name: 'Bernini-R', medium: 'video', kind: 'video-edit', status: 'known', prompt: 'required',
    refs: { style: 'none', note: 'The source clip only on our route; the instruction never names it.', src: [TUT('video/bytedance/bernini-r')] },
    limits: { maxChars: 1500, src: [REPO('server/src/comfy/berniniCloud.ts')] }, negative: 'none',
    structure: 'The one change, then what stays (motion and framing are kept).', example: 'Make it night with warm street lights, keep the people and the camera move.',
    code: [{ at: 'server/src/comfy/berniniCloud.ts:81', follows: 'yes' }], sources: [TUT('video/bytedance/bernini-r'), NODE('BerniniConditioning')] }),
];

// Image ----------------------------------------------------------------
const GPT = (key: string, name: string, max: number, src: Src) => g({ key, name, medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required',
  refs: ORDER_IMG(max, [src, S.gptEditGuide], 'Refer by order or content ("the first image", "image 2", "the logo"). Mask = alpha PNG on the first image.'),
  negative: 'in-prompt', languages: 'Multilingual', special: ['Text to render goes in quotes'], structure: EDIT_STRUCT,
  example: 'Put the jacket from image 2 on the man in image 1; keep his pose, face and the street behind him.',
  code: [{ at: 'server/src/routing/routerModels.ts:250', follows: 'yes' }, { at: 'server/src/providers/openai.ts:93', follows: 'yes' }, { at: 'server/src/tools/media.ts:126', follows: 'yes', note: '@imageN → "image N".' }],
  sources: [src, S.gptNode, S.gptEditGuide] });
const NB = (key: string, name: string, max: number) => g({ key, name, medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required',
  refs: ORDER_IMG(max, [S.nbNode, S.geminiGuide], 'Images are parts after the text, in order. No numbering syntax is documented; "image 1" or a description both read naturally.'),
  negative: 'in-prompt', languages: 'Multilingual', special: ['Per-model caps on objects / characters / style references (Gemini docs)'], structure: 'A described scene in sentences, not keyword lists; then the edit and the keep list.',
  example: 'Seat the woman from the first image at the café table in the second image, matching the afternoon light.',
  code: [{ at: 'server/src/routing/routerModels.ts:356', follows: 'yes' }, { at: 'server/src/providers/gemini.ts:98', follows: 'yes' }, { at: 'server/src/tools/imageFalModels.ts:72', follows: 'yes' }],
  sources: [S.nb2, S.nbPro, S.nbNode, S.geminiGuide] });
const SEEDREAM = (key: string, name: string, max: number, src: Src) => g({ key, name, medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required',
  refs: { style: 'words', image: 'image {n}', base: 1, perKind: true, maxImages: max, unnamed: 'Used; describe its role.', note: 'Input + generated images ≤ 15.', src: [src, S.seedreamNode] },
  negative: 'none', languages: 'Chinese and English', special: ['optimize_prompt_options / thinking rewrite the prompt', 'Describe shape or purpose in words when size is left to the model'],
  structure: IMAGE_STRUCT, example: 'Use the product in image 1 on the marble counter from image 2, soft window light, catalogue look.',
  code: [{ at: 'server/src/routing/routerModels.ts:277', follows: 'yes' }, { at: 'server/src/providers/byteplus.ts:160', follows: 'yes' }, { at: 'server/src/tools/imageFalModels.ts:70', follows: 'yes' }],
  sources: [src, S.seedreamNode] });
const FLUX2 = (key: string, name: string, max: number, at: string) => g({ key, name, medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required',
  refs: { style: 'words', image: 'image {n}', base: 1, perKind: true, maxImages: max, unnamed: 'Used; say each image\'s role ("subject from image 1, style from image 2").', src: [S.flux2Guide, S.flux2Node] },
  negative: 'none', special: ['JSON structured prompts work as well as prose', 'Hex colours tied to an object: "sofa in color #1B6B6F"', 'prompt_upsampling rewrites the prompt (on by default)'],
  structure: 'Subject, action, style, context; 30–80 words is the sweet spot.', example: 'Subject from image 1, style from image 2: a ceramic owl on a bookshelf, mug in color #C92695.',
  code: [{ at: at, follows: 'yes' }], sources: [S.flux2Guide, S.flux2Node] });

const IMAGE: PromptGrammar[] = [
  NB('nano-banana-2', 'Nano Banana 2', 14), NB('nano-banana-2.1', 'Nano Banana 2.1', 14), NB('nano-banana-pro', 'Nano Banana Pro', 14), NB('nano-banana-2-lite', 'Nano Banana 2 Lite', 14),
  GPT('gpt-image', 'GPT Image 2', 16, S.gpt2), GPT('gpt-image-2.5-flare', 'GPT Image 2.5 Flare', 16, S.gpt2), GPT('gpt-image-2.5-sunburst', 'GPT Image 2.5 Sunburst', 16, S.gpt2), GPT('gpt-image-1.5', 'GPT Image 1.5', 16, S.gpt15),
  SEEDREAM('seedream-5.0-pro', 'Seedream 5.0 Pro', 10, S.seedream), SEEDREAM('seedream-5.0-flash', 'Seedream 5.0 Flash', 10, S.seedream), SEEDREAM('seedream-4.5', 'Seedream 4.5', 14, S.seedream45),
  FLUX2('flux-2-pro', 'FLUX.2 [pro]', 8, 'server/src/routing/routerModels.ts:366'), FLUX2('flux-2-max', 'FLUX.2 [max]', 8, 'server/src/routing/routerModels.ts:366'),
  FLUX2('flux-2-flex', 'FLUX.2 [flex]', 10, 'server/src/hostedRequests.ts:139'), FLUX2('flux-2-klein-9b', 'FLUX.2 [klein] 9B', 4, 'server/src/hostedRequests.ts:269'),
  g({ key: 'flux-3-image', name: 'FLUX 3 Image', medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required',
    refs: { style: 'words', image: 'image {n}', base: 1, perKind: true, maxImages: 10, unnamed: 'Used; say its role.', src: [S.flux3Image, S.flux3Router] },
    limits: { maxChars: 15000, minChars: 1, note: 'Layout box rows count toward the limit.', src: [S.flux3Image] }, negative: 'none',
    special: ['Interpreted and expanded before generation', 'Layout boxes (field boxes, wired 2026-10-27): each box\'s label joins the prompt as a {"id": "box_N", "bbox": [top, left, bottom, right] on 0–1000, "desc"} row, as the partner node sends them (shared/layoutBoxes.ts)', 'grounding = web / image search'],
    structure: 'An instruction: what to make or change, then refer to images as image 1, image 2.', example: 'Combine the chair from image 1 with the fabric of image 2, shot in a bright loft.',
    code: [{ at: 'server/src/routing/routerModels.ts:669', follows: 'yes' }, { at: 'server/src/routing/routes.ts:116', follows: 'yes' }], sources: [S.flux3Image, S.flux3Layout, S.flux3Router] }),
  g({ key: 'ideogram-v4', name: 'Ideogram V4', medium: 'image', kind: 'text-to-image', status: 'known', prompt: 'required', refs: { style: 'none', note: 'Text to image on our route.', src: [S.ideogramV4] }, negative: 'none',
    special: ['Text to render goes in quotes', 'magic_prompt rewrite (not sent)'], structure: IMAGE_STRUCT, example: 'A vintage travel poster that reads "VISIT MARS" in bold red letters over dunes.',
    code: [{ at: 'server/src/routing/routerModels.ts:601', follows: 'yes' }], sources: [S.ideogramV4, NODE('IdeogramV4')] }),
  g({ key: 'ideogram-4.5', name: 'Ideogram 4.5', medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required',
    refs: ORDER_IMG(5, [S.ideogram45], 'The first image is the primary source, the rest are references (4 with a mask).'), limits: { maxChars: 10000, minChars: 1, src: [S.ideogram45] }, negative: 'none',
    special: ['Text to render goes in quotes'], structure: EDIT_STRUCT, example: 'Change the shop sign in the first image to read "OPEN LATE"; keep the street as it is.',
    code: [{ at: 'server/src/routing/routerModels.ts:607', follows: 'yes' }, { at: 'server/src/tools/imageFalModels.ts:76', follows: 'yes' }], sources: [S.ideogram45] }),
  ...([['recraft-v4', 'Recraft V4'], ['recraft-v4.1', 'Recraft V4.1'], ['recraft-v4.1-pro', 'Recraft V4.1 Pro']] as const).map(([key, name]) => g({ key, name, medium: 'image', kind: 'text-to-image', status: 'known', prompt: 'required',
    refs: { style: 'none', note: 'Style references become a style_id, never named in the prompt (not wired).', src: [S.recraftNode] }, limits: { maxChars: 10000, minChars: 1, src: [S.recraftNode] },
    negative: 'none', special: ['Negative prompt is ignored by V4 / V4.1'], structure: IMAGE_STRUCT, example: 'Flat vector illustration of a fox reading under a lamp, teal and orange palette.',
    code: [{ at: 'server/src/routing/routerModels.ts:328', follows: 'yes' }], sources: [S.recraftNode] })),
  ...([['luma-image', 'Luma UNI-1'], ['luma-uni-1-max', 'Luma UNI-1 Max']] as const).map(([key, name]) => g({ key, name, medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required',
    refs: ORDER_IMG(9, [S.lumaRouter, S.lumaNode, S.lumaEditNode], 'Up to 9 refs (image) / 8 (edit) for style and content; no numbering syntax documented.'), limits: { maxChars: 6000, minChars: 1, src: [S.lumaNode] }, negative: 'none',
    special: ['style manga needs a portrait aspect', 'web_search (off)'], structure: IMAGE_STRUCT, example: 'Repaint the photo as a soft pastel storybook page; keep the girl and her dog.',
    code: [{ at: 'server/src/routing/routerModels.ts:335', follows: 'yes' }, { at: 'server/src/tools/imageFalModels.ts:79', follows: 'yes' }], sources: [S.lumaRouter, S.lumaNode, S.lumaEditNode] })),
  g({ key: 'kling-image-o1', name: 'Kling Image O1', medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required', refs: { ...KLING_REFS(10), frames: undefined, note: 'Elements + images ≤ 10.' },
    places: [{ route: 'fal', refs: { style: 'tag', image: '@Image{n}', element: '@Element{n}', base: 1, src: [S.klingFal] }, note: 'fal: @Image1 (or @Image when only one).' }],
    limits: { maxChars: 2500, src: [S.klingImage, S.klingFal] }, negative: 'in-prompt', structure: EDIT_STRUCT, example: 'Dress <<<image_1>>> in the coat from <<<image_2>>>, studio white backdrop.',
    code: [{ at: 'server/src/routing/routerModels.ts:617', follows: 'yes', note: 'Step 2: image 1 → <<<image_1>>>.' },
      { at: 'server/src/tools/imageFalModels.ts:84', follows: 'yes', note: 'Step 2: @Image1 on fal.' }, { at: 'server/src/tools/media.ts:126', follows: 'yes', note: 'Plain "image 1" words; the per-model rewrite then makes the tag.' }],
    sources: [S.klingImage, S.klingFal, NODE('KlingOmniProImageNode')] }),
  g({ key: 'krea', name: 'Krea 3', medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required',
    refs: { style: 'tag', image: '@Image{n}', base: 1, perKind: true, maxImages: 8, unnamed: 'Used; describe what changes and what stays.', note: '"image 1" also accepted; @Image3 needs 3 images.', src: [S.krea, S.kreaRouter] },
    negative: 'none', special: ['Krea rewrites the prompt; the same seed doesn\'t repeat an image'], structure: 'What to change and what to keep.', example: 'Give @Image1 the lighting of @Image2; keep the face and outfit.',
    code: [{ at: 'server/src/routing/routerModels.ts:623', follows: 'yes', note: '"image 1" is accepted.' }], sources: [S.krea, S.kreaRouter] }),
  g({ key: 'runway-gen4-image', name: 'Runway Gen-4 Image', medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required',
    refs: { style: 'tag', image: '@{tag}', maxImages: 3, unnamed: 'Untagged refs can\'t be named in the prompt; the model weighs them loosely.',
      note: 'Runway names each reference with a tag (3–15 letters / digits, starting with a letter) and the prompt says @tag. The Router schema lists only uri.', src: [S.runwayTag, S.runwayRouter] },
    negative: 'none', structure: '@tag for each reference, then the scene.', example: '@hero stands on the bridge from @city at blue hour, wide shot.',
    code: [{ at: 'server/src/routing/routerModels.ts:630', follows: 'no', note: 'Refs sent without tags, so "@image1" / "image 1" can\'t point at one.' }], sources: [S.runwayRouter, S.runwayTag, S.runwayNode] }),
  ...([['grok-imagine-image', 'Grok Imagine Image 2.0', 5], ['grok-imagine-image-pro', 'Grok Imagine Image Pro', 0]] as const).map(([key, name, max]) => g({ key, name, medium: 'image', kind: max ? 'image-edit' : 'text-to-image', status: 'known', prompt: 'required',
    refs: max ? ORDER_IMG(max, [S.grokEdit, O('https://docs.x.ai/developers/model-capabilities/images/prompting-guide')], 'Edits run on the fal route, which takes up to 5 images (Comfy\'s edit node takes 3), referenced in the order sent; the output shape follows the first image. No numbering syntax documented.') : { style: 'none', note: 'Pro on Router: prompt only.', src: [S.grokEdit] }, negative: 'none',
    structure: IMAGE_STRUCT, example: 'A cosy cabin interior in winter, fire glowing, snow at the window.', code: [{ at: `server/src/routing/routerModels.ts:${max ? 635 : 643}`, follows: 'yes' }, ...(max ? [{ at: 'server/src/tools/imageFalModels.ts:81', follows: 'yes' as const }] : [])],
    sources: [S.grokNode, S.grokEdit] })),
  ...([['qwen-image-3', 'Qwen Image 3.0'], ['qwen-image-3-pro', 'Qwen Image 3.0 Pro']] as const).map(([key, name]) => g({ key, name, medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required',
    refs: { style: 'words', image: 'image {n}', base: 1, perKind: true, maxImages: 3, note: 'Images go before the text in one message. Comfy\'s Qwen edit node takes @Image1 tags (numbered in input order) and converts them; the raw API reads words.', src: [S.qwenEditApi, ROUTER('qwen/qwen-image-3-0')] },
    negative: 'field', languages: 'English and Chinese', special: ['prompt_extend rewrites (off unless asked)'], structure: IMAGE_STRUCT, example: 'A night market in Taipei with bilingual signs reading "夜市 NIGHT MARKET", steam rising.',
    code: [{ at: 'server/src/routing/routerModels.ts:342', follows: 'yes' }], sources: [S.qwen3Node, S.qwenEditApi] })),
  g({ key: 'wan-image-2.5', name: 'Wan 2.5 Image', medium: 'image', kind: 'text-to-image', status: 'known', prompt: 'required', refs: { style: 'none', src: [S.wanImage] },
    limits: { maxChars: 800, src: [S.wan3, S.wanImage] }, negative: 'field', languages: 'English and Chinese', special: ['prompt_extend (off unless asked)'], structure: IMAGE_STRUCT,
    example: 'An ink-wash mountain village in morning mist, a red umbrella on the bridge.', code: [{ at: 'server/src/routing/routerModels.ts:651', follows: 'yes', note: 'Refuses over 800 characters.' }], sources: [S.wanImage, S.wan3] }),
  g({ key: 'hunyuan-image-3.5', name: 'HY Image 3.5 Preview', medium: 'image', kind: 'text-to-image', status: 'known', prompt: 'required',
    refs: { style: 'none', note: 'Text to image here. The edit node names refs @Image1…@Image5 (not offered).', src: [S.hunyuanT2I, S.hunyuanEdit] }, negative: 'none',
    special: ['The model rewrites and expands the prompt'], structure: IMAGE_STRUCT, example: 'A paper-cut diorama of a whale over a lighthouse, layered blues.', code: [{ at: 'server/src/hostedRequests.ts:52', follows: 'yes' }],
    sources: [S.hunyuanT2I, S.hunyuanEdit] }),
  g({ key: 'meta-muse-image', name: 'Muse Image 1.0', medium: 'image', kind: 'text-to-image', status: 'known', prompt: 'required',
    refs: { style: 'tag', image: '@image{n}', base: 1, maxImages: 10, note: 'Edit (not offered on our route) names refs @image1, @image2 in the official example.', src: [S.muse] }, negative: 'none',
    special: ['Agentic: may search the web (off)'], structure: IMAGE_STRUCT, example: 'A field guide page about the snowy owl, labelled sketches.', code: [{ at: 'server/src/hostedRequests.ts:53', follows: 'yes' }], sources: [S.muse] }),
  g({ key: 'minimax-image-01', name: 'MiniMax image-01', medium: 'image', kind: 'text-to-image', status: 'known', prompt: 'required', refs: { style: 'none', note: 'subject_reference (character) exists in the API but is not wired.', src: [S.minimaxImage] },
    limits: { maxChars: 1500, note: 'Longer prompts are refused with a message.', src: [S.minimaxImage] }, negative: 'none', special: ['prompt_optimizer (we send false)'], structure: IMAGE_STRUCT,
    example: 'Portrait of an old fisherman mending nets at dawn, warm side light.', code: [{ at: 'server/src/hostedRequests.ts:216', follows: 'yes', note: 'Step 2: over 1,500 refused, never cut.' }], sources: [S.minimaxImage] }),
  g({ key: 'fibo-2.0', name: 'FIBO 2.0', medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required', refs: ORDER_IMG(1, [S.fiboRouter], 'bria/image takes exactly one reference; edits take one image (+ mask).'),
    negative: 'field', special: ['structured_prompt (JSON) instead of the prompt: exactly one of the two', 'Our Structured option sends our caption JSON'], structure: 'Instruction for edits; or a JSON structured prompt.',
    example: 'The sofa is deep green velvet.' /* the final state only: a "keep X unchanged" clause makes raw FIBO re-render the frame (Bria FIBO 2.0 notes) */, code: [{ at: 'server/src/routing/routerModels.ts:306', follows: 'yes' }], sources: [S.fibo, S.fiboRouter] }),
  g({ key: 'qwen-image-2.1', name: 'Qwen Image 2.1', medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required',
    refs: { style: 'tag', image: '<image{n}>', base: 1, perKind: true, maxImages: 16, unnamed: 'Used: seen by the text encoder and spliced in as latents.', note: 'Our template edits take 1–2 images.', src: [S.qwen21, REPO('server/src/comfy/plans.ts')] },
    negative: 'field', languages: 'English and Chinese', special: ['BFS swap LoRAs: "head_swap:" / "body_swap:" trigger prompts'], triggers: ['head_swap:', 'body_swap:'],
    structure: 'Start from <image1> as the base, say what to take from <image2>, then the keep list.', example: 'Start with <image1> as the base and replace the mug with the one in <image2>; keep the desk and light.',
    code: [{ at: 'server/src/comfy/plans.ts:274', follows: 'yes' }, { at: 'server/src/comfy/plans.ts:302', follows: 'yes' }, { at: 'server/src/comfy/bfsSwap.ts:4', follows: 'yes' }], sources: [S.qwen21] }),
  g({ key: 'qwen-image-2.1-turbo', name: 'Qwen Image 2.1 Turbo', medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required',
    refs: { style: 'tag', image: '<image{n}>', base: 1, maxImages: 1, note: 'The Turbo edit template takes one image.', src: [S.qwen21] }, negative: 'field', languages: 'English and Chinese',
    structure: 'The edit, then the keep list.', example: 'Turn <image1> into a rainy evening; keep the people where they are.', code: [{ at: 'server/src/comfy/plans.ts:302', follows: 'yes' }], sources: [S.qwen21] }),
  g({ key: 'qwen-image', name: 'Qwen-Image', medium: 'image', kind: 'text-to-image', status: 'known', prompt: 'required', refs: { style: 'words', image: 'Picture {n}', base: 1, perKind: true, maxImages: 3, note: 'Text to image takes no refs; edits on this engine run the Qwen-Image-Edit-2509 graph, which labels inputs Picture N.', src: [S.qwenEditPlus, REPO('workflows/create-image-qwen-t2i-api.json')] },
    negative: 'field', languages: 'English and Chinese (strong text rendering in both)', structure: IMAGE_STRUCT, example: 'A rain-washed Hong Kong street with glowing bilingual signs, cinematic.',
    code: [{ at: 'server/src/comfy/plans.ts:302', follows: 'yes' }, { at: 'server/src/providers/replicate.ts:23', follows: 'yes' }], sources: [REPO('workflows/create-image-qwen-t2i-api.json')] }),
  g({ key: 'qwen-image-edit-2509', name: 'Qwen-Image-Edit-2509', medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required',
    refs: { style: 'words', image: 'Picture {n}', base: 1, perKind: true, maxImages: 3, unnamed: 'Used; describe by position ("the bear on the left").',
      note: 'The encoder template labels each input "Picture N:" before the instruction; Qwen\'s own examples describe subjects by position. "image N" works less reliably than the label the model sees.', src: [S.qwenEditPlus, S.qwen2509] },
    places: [{ route: 'replicate:qwen/qwen-image-edit-2511', refs: { style: 'order', src: [T('https://replicate.com/qwen/qwen-image-edit-2511')] } }], negative: 'field', languages: 'English and Chinese',
    structure: EDIT_STRUCT, example: 'Put the person from Picture 2 into the scene of Picture 1, same light and grain.',
    code: [{ at: 'server/src/tools/shots.ts:45', follows: 'yes', note: 'Face / Person Swap words become Picture 1 / Picture 2 on the local graph.' }, { at: 'server/src/tools/media.ts:126', follows: 'yes' }],
    sources: [S.qwenEditPlus, S.qwen2509] }),
  g({ key: 'qwen-image-edit-2509-angles', name: 'Qwen-Image-Edit-2509 + Multiple-angles LoRA', medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required', refs: ORDER_IMG(1, [S.qwenEditPlus]),
    negative: 'field', special: ['The LoRA\'s documented camera instructions lead each prompt ("Rotate the camera 45 degrees to the left.")'], structure: 'The camera instruction first, then the view.',
    example: 'Rotate the camera 90 degrees to the right around the subject: a side profile view.', code: [{ at: 'server/src/tools/shots.ts:17', follows: 'yes' }], sources: [S.qwenEditPlus] }),
  ...([['z-image-turbo', 'Z-Image-Turbo'], ['z-image', 'Z-Image']] as const).map(([key, name]) => g({ key, name, medium: 'image', kind: 'text-to-image', status: 'known', prompt: 'required',
    refs: { style: 'none', note: 'Text to image on our graphs (the Omni encoder takes up to 3 images; not wired).', src: [S.zOmni] }, negative: key === 'z-image' ? 'field' : 'none', languages: 'English and Chinese',
    special: key === 'z-image-turbo' ? ['Distilled, CFG 1: a negative prompt has no effect'] : [], structure: 'Long descriptive prose: subject, setting, light, camera, style.',
    example: 'A low-angle fashion shot of a model walking through blue reeds under a pale sky, soft film grain.', code: [{ at: 'server/src/comfy/plans.ts:302', follows: 'yes' }], sources: [S.zOmni, REPO(`workflows/create-image-${key === 'z-image' ? 'zimage' : 'zimage-turbo'}-api.json`)] })),
  g({ key: 'flux-2-klein-4b', name: 'FLUX.2 [klein] 4B', medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required', refs: ORDER_IMG(1, [S.flux2Guide], 'Local edit template: one image.'), negative: 'none',
    structure: 'The edit in one sentence.', example: 'Change the bag colour to blue.', code: [{ at: 'server/src/comfy/plans.ts:302', follows: 'yes' }], sources: [S.flux2Guide, REPO('workflows/create-image-klein4b-edit-api.json')] }),
  g({ key: 'flux-3-klein', name: 'FLUX 3 Klein', medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required',
    refs: { style: 'tag', image: '<ref_image_{n}>', base: 0, perKind: true, maxImages: 10, unnamed: 'Used; added to both conditionings.', note: 'Zero-based: the first reference is <ref_image_0>.', src: [S.flux3Klein] },
    places: [...['direct', 'fal', 'router'].map((route) => ({ route, refs: { style: 'words' as const, image: 'image {n}', base: 1 as const, src: [I('https://docs.bfl.ml/api-reference/utility/generate-an-image-with-flux-3')] }, note: 'Hosted FLUX 3 Klein reads "image 1", like FLUX 3 Image.' }))], negative: 'none',
    special: ['Layout boxes on the local route (field boxes, 2026-10-27): CreateBoundingBoxes → Flux3LayoutPrompt; cite box N as <obj_N> (comfy/flux3Klein.ts). Hosted places don\'t take boxes'],
    structure: 'Name each reference by tag, then the result.', example: 'Place the lamp from <ref_image_0> on the desk in <ref_image_1>, evening light.',
    code: [{ at: 'server/src/comfy/plans.ts:302', follows: 'yes', note: 'Step 2: image 1 → <ref_image_0> on the local graph.' },
      { at: 'server/src/hostedRequests.ts:154', follows: 'yes' }],
    sources: [S.flux3Klein, S.flux3Layout] }),
  g({ key: 'flux-2-dev', name: 'FLUX.2 [dev]', medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required', refs: ORDER_IMG(1, [S.flux2Guide]), negative: 'none',
    structure: 'Subject, action, style, context.', example: 'The woman wears a small pale-yellow knitted beanie; keep the face.', code: [{ at: 'server/src/comfy/plans.ts:302', follows: 'yes' }], sources: [S.flux2Guide] }),
  ...([['moss-image', 'MOSS-Image'], ['moss-image-base', 'MOSS-Image Base']] as const).map(([key, name]) => g({ key, name, medium: 'image', kind: 'text-to-image', status: 'known', prompt: 'required',
    refs: { style: 'none', src: [S.moss] }, negative: 'field', special: ['Optional JSON layout prompt (caption + labelled boxes) from MOSSImageLayoutPrompt; not wired'],
    structure: IMAGE_STRUCT, example: 'A bold concert poster reading "NIGHT SHIFT" in tall white letters over a deep blue sky.', code: [{ at: 'server/src/comfy/plans.ts:302', follows: 'yes' }], sources: [S.moss] })),
  g({ key: 'opensoul', name: 'Z-Image-Turbo + look LoRAs', medium: 'image', kind: 'text-to-image', status: 'known', prompt: 'required', refs: { style: 'order', note: 'Reference routes use an edit model (one face image), never named.', src: [REPO('server/src/tools/soul/presets.ts')] },
    negative: 'none', special: ['Each look LoRA has a trigger word, put first (tools/soul/presets.ts)'], triggers: ['(per look, e.g. "Candid Instax Photo,", "velatrix", "50s Noir Movie Still,")'],
    structure: 'Triggers first, then the photo description.', example: 'Candid Instax Photo, two friends laughing on a ferry deck, wind in their hair.',
    code: [{ at: 'server/src/tools/soul/plan.ts:50', follows: 'yes' }, { at: 'server/src/tools/soul/tool.ts:110', follows: 'yes' }], sources: [REPO('server/src/tools/soul/presets.ts', 'triggers read from Civitai / Hugging Face model pages')] }),
  ...([['real-esrgan', 'Real-ESRGAN'], ['4x-ultrasharp', '4x-UltraSharp'], ['seedvr2-image', 'SeedVR2'], ['seedvr2-3b-image', 'SeedVR2 3B'], ['4x-nomos2', '4x Nomos2 DAT2'],
    ['crystal-upscaler', 'Crystal Upscaler'], ['topaz-wonder-3.5', 'Topaz Wonder 3.5'], ['topaz-standard-v2', 'Topaz Standard V2'], ['topaz-bloom-2', 'Topaz Bloom 2'], ['bria-increase-resolution', 'Bria Increase Resolution']] as const)
    .map(([key, name]) => noPrompt(key, name, 'image', 'upscale', 'Image upscale: the photo only; we send no prompt.', [{ at: 'server/src/tools/imageUpscaleModels.ts:1', follows: 'n/a' }], [NODE('TopazImageEnhanceV2'), NODE('BriaIncreaseResolution')])),
  noPrompt('z-image-turbo-2k-upscaler', 'Z-Image-Turbo 2K upscaler', 'image', 'upscale', 'Fixed prompt in the graph ("masterpiece, 8k"); the user\'s words are not used.', [{ at: 'workflows/image-upscale-zimage-2k-api.json', follows: 'n/a' }], [REPO('workflows/image-upscale-zimage-2k-api.json')]),
  g({ key: 'bria-genfill', name: 'Bria GenFill', medium: 'image', kind: 'image-edit', status: 'known', prompt: 'required', refs: { style: 'none', note: 'Image + painted mask; the prompt describes what fills the mask.', src: [S.genfill] },
    negative: 'field', languages: 'English', special: ['refine_prompt rewrites (on by default)'], structure: 'Only what goes inside the mask.', example: 'A potted fern on the windowsill.',
    code: [{ at: 'server/src/tools/imageFalModels.ts:87', follows: 'yes' }], sources: [S.genfill] }),
  noPrompt('bria-rmbg-2.0', 'Bria RMBG 2.0', 'image', 'utility', 'Background removal; a prompt would change the price, so none is sent.', [{ at: 'server/src/tools/imageFalApps.ts:44', follows: 'n/a' }], [NODE('BriaRemoveImageBackground')]),
  noPrompt('ideogram-remove-background', 'Ideogram Remove Background', 'image', 'utility', 'Background removal.', [], [T('https://fal.ai/models/fal-ai/ideogram/v3/remove-background')]),
  g({ key: 'bria-expand', name: 'Bria Expand', medium: 'image', kind: 'image-edit', status: 'known', prompt: 'optional', refs: { style: 'none', note: 'The photo is placed on a larger canvas.', src: [NODE('BriaExpandImage')] },
    negative: 'none', languages: 'English only, no special characters (Bria)', structure: 'What the new edges show.', example: 'More of the beach and the pier on the right.',
    code: [{ at: 'server/src/tools/imageFalApps.ts:50', follows: 'yes', note: 'Only the user\'s own words.' }], sources: [NODE('BriaExpandImage')] }),
  noPrompt('ideogram-3-reframe', 'Ideogram 3.0 Reframe', 'image', 'utility', 'Reframes to a new shape; no prompt sent.', [], [T('https://fal.ai/models/fal-ai/ideogram/v3/reframe')]),
  noPrompt('bria-eraser', 'Bria Eraser', 'image', 'utility', 'Removes the painted object.', [], [NODE('BriaEraser')]),
  noPrompt('fal-object-removal', 'fal Object Removal', 'image', 'utility', 'Removes the painted object.', [], [T('https://fal.ai/models/fal-ai/object-removal')]),
  noPrompt('fashn-tryon-1.6', 'FASHN Virtual Try-On v1.6', 'image', 'utility', 'Two images by role (person, garment); no prompt.', [{ at: 'server/src/tools/apps.ts:814', follows: 'n/a' }], [T('https://fal.ai/models/fal-ai/fashn/tryon/v1.6')]),
  ...([['seedream-5.0-flash-layers', 'Seedream 5.0 Flash (layers)'], ['seedream-5.0-pro-layers', 'Seedream 5.0 Pro (layers)']] as const).map(([key, name]) => g({ key, name, medium: 'image', kind: 'layers', status: 'known', prompt: 'optional',
    refs: { style: 'none', note: 'One photo.', src: [S.seedreamLayers] }, negative: 'none', special: ['Target regions with <bbox>left top right bottom</bbox>, 0–1000 per-mille'],
    structure: 'Empty = split every major element; or name the elements to separate.', example: 'Separate the man, the bicycle and the shop sign.', code: [{ at: 'server/src/routing/routerModels.ts:391', follows: 'yes' }], sources: [S.seedreamLayers, S.seedream] })),
  g({ key: 'qwen-image-layered', name: 'Qwen-Image-Layered', medium: 'image', kind: 'layers', status: 'unknown', reason: 'The official template\'s prompt role (caption or instruction) is not documented in the pages we read.', prompt: 'optional',
    refs: { style: 'none', src: [NODE('EmptyQwenImageLayeredLatentImage')] }, negative: 'unknown', structure: 'Unknown: leave empty or describe the scene.', example: '(leave empty)', code: [], sources: [NODE('EmptyQwenImageLayeredLatentImage')] }),
  g({ key: 'bria-virtual-tryon', name: 'Bria Virtual Try-On', medium: 'image', kind: 'image-edit', status: 'known', prompt: 'optional',
    refs: { style: 'none', note: 'Two photos by role (person_image, garment_images); the instruction never names them.', src: [ROUTER('bria/image-edit-product-virtual-tryon')] },
    limits: { maxChars: 500, truncatedByUs: true, src: [REPO('server/src/routing/routerModels.ts')] }, negative: 'none', languages: 'English only, no special characters (Bria)',
    structure: 'Optional: how the garment should sit (tucked, open, sleeves rolled).', example: 'Jacket worn open, sleeves rolled to the elbow.',
    code: [{ at: 'server/src/routing/routerModels.ts:921', follows: 'yes', note: 'Only the user\'s own words (briaText).' }], sources: [ROUTER('bria/image-edit-product-virtual-tryon')] }),
];

// Audio ----------------------------------------------------------------
const AUDIO: PromptGrammar[] = [
  // 2026-10-27: one entry. MiniMax Music 3 is the open model on both places (Local, Comfy Cloud: the same official template graph, comfy/plans.ts songPlan).
  g({ key: 'minimax-music-3', name: 'MiniMax Music 3', medium: 'audio', kind: 'music', status: 'known', prompt: 'required', refs: NONE, negative: 'none',
    special: ['caption + lyrics, two inputs (MiniMaxMusic3TextEncode caption / lyrics)', 'Lyrics section tags: [Intro] [Verse] [Pre-Chorus] [Chorus] [Post-Chorus] [Bridge] [Instrumental] [Solo] [Outro]', 'Empty lyrics → we send "[Instrumental]"'],
    structure: 'Caption in three parts: global metadata (genre, BPM, key, mood), vocal details, arrangement. Lyrics with section tags; the tags carry the structure.',
    example: 'Indie pop, 110 BPM, bright and hopeful. Warm female vocal, light harmonies. Electric guitars, punchy drums, melodic bass. Lyrics: [Verse] Morning light… [Chorus] Run with me…',
    code: [{ at: 'server/src/comfy/plans.ts:436', follows: 'yes', note: 'Local and Comfy Cloud (comfy/cloudWorkflows.ts: the same graph).' }], sources: [S.mmMusicTut, S.mmMusicLocal] }),
  g({ key: 'sonilo-music', name: 'Sonilo Music', medium: 'audio', kind: 'music', status: 'known', prompt: 'required', refs: NONE, limits: { maxChars: 1000, minChars: 1, src: [S.sonilo] }, negative: 'none',
    special: ['No lyrics field: instrumental or described vocals only'], structure: 'Genre, mood, instruments, tempo, use.', example: 'Upbeat lo-fi hip hop for a cooking video, mellow keys, vinyl crackle.',
    code: [{ at: 'server/src/hostedRequests.ts:66', follows: 'yes' }], sources: [S.sonilo] }),
  g({ key: 'sonilo-video-to-music', name: 'Sonilo Video-to-Music', medium: 'audio', kind: 'music', status: 'known', prompt: 'optional', refs: { style: 'none', note: 'The video is analysed; never named.', src: [S.soniloV2M] }, negative: 'none',
    special: ['Empty prompt gives the best result (the model reads the video)'], structure: 'Leave empty, or one line of mood.', example: '(empty)', code: [{ at: 'server/src/hostedRequests.ts:67', follows: 'yes' }], sources: [S.soniloV2M] }),
  g({ key: 'seed-audio', name: 'ByteDance Seed Audio', medium: 'audio', kind: 'tts' /* also music and sound effects (2026-10-27): one prompt for every kind */, status: 'known', prompt: 'required',
    refs: { style: 'tag', audio: '@Audio{n}', base: 1, maxAudio: 3, note: 'Voice-clone refs are tagged @Audio1–3 (audio reference mode; not wired). Image reference: one character image.', src: [S.seedAudio, S.seedAudioRouter] },
    limits: { maxChars: 3000, src: [S.seedAudioRouter] }, languages: 'Multilingual (1.0 multilingual model)', negative: 'none',
    special: ['One prompt describes voices, emotion, ambience, music and effects, with the lines to speak', 'Name characters inline for dialogue', 'Music / Sound effects: describe the sound (no lyrics or length field; up to 2 min)'], structure: 'Who speaks and how, the setting sound, then the lines. For music or a sound: genre, mood, instruments; or what, where, how close.',
    example: 'A tired detective, low and slow, rain on the window: "We\'re out of time."', code: [{ at: 'server/src/routing/routerModels.ts:861', follows: 'yes' }], sources: [S.seedAudio, S.seedAudioTut, S.seedAudioRouter] }),
  g({ key: 'ace-step-1.5', name: 'ACE-Step 1.5', medium: 'audio', kind: 'music', status: 'known', prompt: 'required', refs: NONE, negative: 'none', languages: '50+ (language field, default en)',
    special: ['tags + lyrics fields', 'Lyrics section tags like [Verse 1], [Chorus], with stage notes after a dash', 'Empty lyrics → we send "[Instrumental]"'],
    structure: 'Tags: genre, mood, instruments, vocal. Lyrics with section tags.', example: 'Tags: synthwave, driving, 118 BPM, female vocal. Lyrics: [Verse 1] Neon on the highway…',
    code: [{ at: 'server/src/comfy/plans.ts:419', follows: 'yes' }], sources: [S.aceStep] }),
  g({ key: 'yue2', name: 'YuE2', medium: 'audio', kind: 'music', status: 'known', prompt: 'required', refs: { style: 'none', note: 'Cover a song: the source melody comes from the audio, never named.', src: [REPO('workflows/audio-yue2-song-api.json')] },
    negative: 'none', special: ['Lyrics are required (no instrumental)', 'style: language, voice, genre, BPM, instruments', '[Verse] / [Chorus] sections'],
    structure: 'Style line, then lyrics in sections.', example: 'English, soulful male vocal, jazz-pop, 88 BPM, Rhodes and brushed drums. [Verse] Streetlights…',
    code: [{ at: 'server/src/comfy/plans.ts:436', follows: 'yes' }, { at: 'server/src/tools/media.ts:441', follows: 'yes', note: 'Refuses a song without lyrics.' }], sources: [I('https://huggingface.co/m-a-p/YuE2-3B'), REPO('workflows/audio-yue2-song-api.json')] }),
  g({ key: 'stable-audio-open-1.0', name: 'Stable Audio Open 1.0', medium: 'audio', kind: 'sfx', status: 'known', prompt: 'required', refs: NONE, negative: 'field',
    special: ['Up to about 47 s', 'Comma-separated descriptors (genre, instruments, BPM) work best'], structure: 'Descriptors, comma separated.', example: 'thunderstorm, heavy rain on a tin roof, distant rumble',
    code: [{ at: 'server/src/comfy/plans.ts:419', follows: 'yes' }], sources: [S.stableAudio] }),
  g({ key: 'mmaudio', name: 'MMAudio', medium: 'audio', kind: 'sfx', status: 'known', prompt: 'optional', refs: { style: 'none', note: 'The video drives the sound.', src: [REPO('workflows/soundtrack-mmaudio-api.json')] }, negative: 'field',
    structure: 'The sounds to add, short.', example: 'footsteps on gravel, birds', code: [{ at: 'server/src/comfy/plans.ts:492', follows: 'yes' }], sources: [REPO('workflows/soundtrack-mmaudio-api.json')] }),
  g({ key: 'elevenlabs-sound-effects', name: 'ElevenLabs Sound Effects', medium: 'audio', kind: 'sfx', status: 'known', prompt: 'required', refs: NONE, negative: 'none',
    special: ['prompt_influence 0–1 (we send 0.3)', '0.5–30 s'], structure: 'The sound, its source and space.', example: 'A heavy wooden door creaks open in a stone hall.',
    code: [{ at: 'server/src/routing/routerModels.ts:776', follows: 'yes' }], sources: [S.elevenSfx] }),
  g({ key: 'elevenlabs-v3', name: 'ElevenLabs v3', medium: 'audio', kind: 'tts', status: 'known', prompt: 'required', refs: NONE, limits: { maxChars: 5000, src: [S.elevenV3] }, negative: 'none', languages: 'Multilingual (language_code optional)',
    special: ['Audio tags in square brackets: [whispers], [laughs], [sighs]…', 'No SSML <break>: use tags, ellipses, punctuation', 'Dialogue lines start "Speaker 1:"'],
    structure: 'The script with inline [tags] where the delivery changes.', example: '[whispers] Did you hear that? [pause] [laughs] It\'s just the cat.',
    code: [{ at: 'server/src/routing/routerModels.ts:419', follows: 'yes', note: 'Text sent as typed (tags pass through); no tag chips in the UI.' }], sources: [S.elevenV3, S.elevenRouterV3] }),
  ...([['elevenlabs-v4', 'ElevenLabs v4'], ['elevenlabs-v4-turbo', 'ElevenLabs v4 Turbo']] as const).map(([key, name]) => g({ key, name, medium: 'audio', kind: 'tts', status: 'known', prompt: 'required', refs: NONE, negative: 'none',
    languages: 'Multilingual (language_code optional)', special: ['Tag support for v4 is not documented in the pages we read; plain script is safe'], structure: 'The script.', example: 'Welcome back. Today we\'re building a kite.',
    code: [{ at: 'server/src/routing/routerModels.ts:419', follows: 'yes' }], sources: [S.elevenTts, ROUTER(`elevenlabs/${key === 'elevenlabs-v4' ? 'eleven-v4' : 'eleven-v4-turbo'}`)] })),
  ...([['minimax-speech-2.8-hd', 'MiniMax Speech 2.8 HD'], ['minimax-speech-2.8-turbo', 'MiniMax Speech 2.8 Turbo']] as const).map(([key, name]) => g({ key, name, medium: 'audio', kind: 'tts', status: 'known', prompt: 'required', refs: NONE,
    limits: { maxChars: 9999, note: 'Under 10,000 characters; longer scripts are refused with a message.', src: [S.mmSpeech] }, negative: 'none', languages: '40+ (language_boost)',
    special: ['Pauses: <#0.5#> (seconds, 0.01–99.99, never two in a row)', 'Interjections in parentheses: (laughs) (sighs) (coughs) (breath)…'],
    structure: 'The script with <#x#> pauses and (interjections).', example: 'Okay. <#0.6#> (sighs) Let\'s try that one more time.',
    code: [{ at: 'server/src/hostedRequests.ts:123', follows: 'partly', note: 'Step 2: over 9,999 refused, never cut. [bracket] tags from other models are still not translated to (parentheses).' }, { at: 'server/src/providers/directSpecs.ts:55', follows: 'yes' }],
    sources: [S.mmSpeech] })),
  g({ key: 'fish-audio-s2.1-pro', name: 'Fish Audio S2.1 Pro', medium: 'audio', kind: 'tts', status: 'known', prompt: 'required', refs: NONE, negative: 'none',
    special: ['Inline emotion / delivery tags in brackets (Fish S2 family)'], structure: 'The script with inline tags.', example: '[excited] We actually won!',
    code: [{ at: 'server/src/hostedRequests.ts:70', follows: 'yes' }], sources: [I('https://docs.fish.audio/', 'tag list not read this session')] }),
  g({ key: 'heygen-voice', name: 'HeyGen Voice', medium: 'audio', kind: 'tts', status: 'known', prompt: 'required', refs: NONE, negative: 'none', special: ['ssml flag (we send false)'],
    structure: 'The script.', example: 'Thanks for watching, see you next week.', code: [{ at: 'server/src/routing/routerModels.ts', follows: 'yes', note: 'heygen/starfish on Comfy Router (2026-10-31): text as typed, input_type text.' }], sources: [ROUTER('heygen/starfish'), NODE('HeyGenTextToSpeechNode')] }),
  g({ key: 'qwen3-tts', name: 'Qwen3 TTS 1.7B', medium: 'audio', kind: 'tts', status: 'known', prompt: 'required', refs: NONE, negative: 'none', languages: 'Chinese, English, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian (Auto by default)',
    special: ['One of 9 preset voices by name (Ryan, Aiden, Vivian, Serena, Uncle_Fu, Dylan, Eric, Ono_Anna, Sohee); no cloning in the CustomVoice model', 'Optional style instruction in plain words (the node\'s instruct: "Very happy.", "warm, slow and calm"), sent apart from the script; we send at most 100 characters and drop requests for pauses', 'No inline tags; ellipses are read as commas / full stops'],
    structure: 'The script, plain; delivery goes in the Style line, not the script.', example: 'Tonight, one small robot is about to change everything.',
    code: [{ at: 'server/src/tools/voice/qwen3tts.ts:83', follows: 'yes', note: 'patchQwen3Tts: text (ellipses tidied), speaker, language, instruct (reshaped).' }], sources: [O('https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice'), O('https://github.com/flybirdxx/ComfyUI-Qwen-TTS')] }),
  g({ key: 'chatterbox', name: 'Chatterbox', medium: 'audio', kind: 'tts', status: 'known', prompt: 'required', refs: { style: 'none', note: 'Optional voice sample to clone, never named.', src: [REPO('workflows/voice-chatterbox-tts-api.json')] },
    negative: 'none', languages: 'English (multilingual graph: 23 languages)', special: ['Delivery via exaggeration / cfg_weight settings, not tags'], structure: 'The script, plain.', example: 'I never thought I\'d see this place again.',
    code: [{ at: 'server/src/comfy/plans.ts:412', follows: 'yes' }], sources: [I('https://github.com/resemble-ai/chatterbox')] }),
  noPrompt('chatterbox-voice-changer', 'Chatterbox Voice Changer', 'audio', 'voice-convert', 'Speech in, target voice sample in; no prompt.', [], [I('https://github.com/resemble-ai/chatterbox')]),
  g({ key: 'fish-audio-drama-3', name: 'Fish Audio Drama 3', medium: 'audio', kind: 'tts', status: 'known', prompt: 'required', refs: { style: 'none', note: 'Optional clone sample.', src: [S.drama3] }, negative: 'none',
    special: ['Point tags [sighs] [laughs] [pause]', 'Scoped <whisper>…</whisper>, <slow>…</slow>', 'Style prefix [with bright eager excitement]', 'Speakers <|speaker:0|>', 'Language hint [language: en]'],
    structure: 'Speaker tag, style prefix, line with point / scoped tags.', example: '<|speaker:0|> [icy calm] I knew you\'d come back. [sighs] <slow>Sit down.</slow>',
    code: [{ at: 'server/src/comfy/plans.ts:406', follows: 'yes' }, { at: 'server/src/tools/drama3Tags.ts:10', follows: 'yes', note: 'Tag chips in the UI.' }], sources: [S.drama3] }),
  g({ key: 'f5-tts', name: 'F5-TTS', medium: 'audio', kind: 'tts', status: 'known', prompt: 'required', refs: { style: 'none', note: 'A reference voice clip; never named.', src: [I('https://github.com/SWivid/F5-TTS')] }, negative: 'none',
    languages: 'Per model (English / Chinese base; others by checkpoint)', structure: 'The script, plain.', example: 'The museum opens at nine.', code: [{ at: 'server/src/comfy/plans.ts:469', follows: 'yes' }], sources: [I('https://github.com/SWivid/F5-TTS')] }),
  noPrompt('translate-chatterbox', 'Translate with Chatterbox', 'audio', 'tts', 'Pipeline: the transcript is made and translated for you.', [{ at: 'server/src/comfy/plans.ts:477', follows: 'n/a' }], [I('https://github.com/resemble-ai/chatterbox')]),
  noPrompt('translate-f5-tts', 'Translate with F5-TTS', 'audio', 'tts', 'Pipeline: the transcript is made and translated for you.', [{ at: 'server/src/comfy/plans.ts:479', follows: 'n/a' }], [I('https://github.com/SWivid/F5-TTS')]),
];

// 3D and our own tools ----------------------------------------------------------------
const THREE_D: PromptGrammar[] = [
  g({ key:'cloud-tripo-31',name:'Tripo 3.1',medium:'3d',kind:'3d',status:'known',prompt:'optional',refs:{style:'none',note:'Text mode describes the object without attached references. Image and multiview modes use named image inputs and no text.',src:[S.tripoText,S.tripoImage]},negative:'none',structure:'Describe one object, its shape, materials and colours.',example:'A small ceramic fox with a glossy blue glaze.',code:[{at:'server/src/tools/threeD.ts',follows:'yes'}],sources:[S.tripoText,S.tripoImage] }),
  noPrompt('fal-trellis2', 'TRELLIS.2', '3d', '3d', 'Image to 3D: one picture, no prompt.', [{ at: 'server/src/tools/threeD.ts:174', follows: 'n/a' }], [T('https://fal.ai/models/fal-ai/trellis-2')]),
  noPrompt('fal-hunyuan3d-31', 'Hunyuan 3D 3.1', '3d', '3d', 'Image to 3D: one picture, no prompt.', [{ at: 'server/src/tools/threeD.ts:174', follows: 'n/a' }], [NODE('Hunyuan3Dv2Conditioning')]),
  noPrompt('comfy-pixal3d-trellis2', 'Pixal3D + TRELLIS.2', '3d', '3d', 'Image to 3D: one picture, no prompt.', [{ at: 'server/src/tools/threeD.ts:174', follows: 'n/a' }], [I('https://huggingface.co/Comfy-Org/Pixal3D')]),
  noPrompt('local-turntable', 'Turntable recorder', 'tool', 'utility', 'Our in-browser recorder: a model in, a spin video out.', [{ at: 'server/src/tools/threeD.ts:198', follows: 'n/a' }], [REPO('server/src/tools/threeD.ts')]),
  noPrompt('local-finish', 'Finish looks', 'video', 'utility', 'Our own ffmpeg looks on a clip you have (grain, glow, light leak and more): the clip and a strength, no prompt.', [{ at: 'server/src/tools/finish.ts:4', follows: 'n/a' }], [REPO('server/src/shared/finishPresets.ts')]),
  noPrompt('local-previz', 'Direct a Shot (mockup)', 'tool', 'utility', 'Our renderer: the shot note is kept for Render, no model reads it here.', [{ at: 'server/src/tools/previz.ts:52', follows: 'n/a' }], [REPO('server/src/tools/previz.ts')]),
  g({ key: 'comfy-ltx25-layout', name: 'LTX-2.5 Layout to Render', medium: 'video', kind: 'video-edit', status: 'known', prompt: 'required', refs: FRAME_ONLY([REPO('workflows/ltx25-layout-to-render-api.json')], 'The mockup layout and an optional first frame are wired by the graph.'),
    negative: 'field', structure: 'One flowing paragraph: the finished look of the staged shot.', example: 'A real kitchen at golden hour, a chef plating pasta, steam rising.',
    code: [{ at: 'server/src/comfy/makeItReal.ts:35', follows: 'yes' }], sources: [S.ltxPromptNode] }),
  g({ key: 'comfy-ltx25-iclora', name: 'LTX-2.5 + IC-LoRAs (Footage Effects)', medium: 'video', kind: 'video-edit', status: 'known', prompt: 'optional', refs: { style: 'none', note: 'The source clip is the IC guide.', src: [O('https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Water-Simulation')] },
    negative: 'field', triggers: ['ADD WATER (Water Simulation)'], special: ['Each IC-LoRA has its own trigger or none (shared/ltxLoras.ts)'], structure: 'Trigger (if any), then the scene.', example: 'ADD WATER. The street floods slowly, reflections on the rising water.',
    code: [{ at: 'server/src/shared/footageFx.ts:63', follows: 'yes' }, { at: 'server/src/comfy/ltx25IcLora.ts:58', follows: 'yes' }], sources: [O('https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Water-Simulation')] }),
];

export const PROMPT_GRAMMAR: Record<string, PromptGrammar> = Object.fromEntries([...VIDEO, ...IMAGE, ...AUDIO, ...THREE_D].map((e) => [e.key, e]));

// ---------------------------------------------------------------- mismatches (bugs for step 2) ----------------------------------------------------------------
export interface GrammarMismatch { id: string; rank: number; impact: 'high' | 'medium' | 'low'; /** fixed in step 2 (2026-10-26), or still open */ status: 'fixed' | 'open'; models: string[]; at: string[]; problem: string; fix: string }
export const GRAMMAR_MISMATCHES: GrammarMismatch[] = [
  { id: 'video-mentions-raw', rank: 1, status: 'fixed', impact: 'high', models: ['seedance-2.0', 'seedance-2.0-fast', 'seedance-2.0-mini', 'seedance-2.5', 'minimax-h3', 'wan-3.0'],
    at: ['server/src/routing/routerModels.ts:435', 'server/src/routing/routerModels.ts:732', 'server/src/routing/routerModels.ts:719', 'server/src/providers/byteplus.ts:118'],
    problem: 'Reference to video sends the composer\'s "@image1" / "@video1" as typed. These models read "Image 1" / "Video 1" / "Audio 1" by order, so the model can\'t tie a sentence to an input.',
    fix: 'One shared rewrite per model from this table (refToken): @imageN → "Image N" etc., run where the body is built; keep the composer\'s @ chips as they are.' },
  { id: 'kling-mentions', rank: 2, status: 'fixed', impact: 'high', models: ['kling-v3'], at: ['server/src/routing/routerModels.ts:223'],
    problem: 'klingRefPrompt only appends "Reference images: <<<image_1>>>…" when no tag is present; the user\'s "@image1" stays in the text, so the prompt names the image twice in two syntaxes.',
    fix: 'Rewrite @imageN → <<<image_N>>> in place, then append only the refs still unnamed.' },
  { id: 'kling-image-tags', rank: 3, status: 'fixed', impact: 'high', models: ['kling-image-o1'], at: ['server/src/tools/media.ts:126', 'server/src/routing/routerModels.ts:617', 'server/src/tools/imageFalModels.ts:84'],
    problem: 'Edit rewrites @image1 to "image 1" for every model. Kling Image O1 wants <<<image_1>>> on Router and @Image1 on fal; the face / person swap apps also say "image 1".',
    fix: 'Make the Edit rewrite per model and per place (Router: <<<image_N>>>, fal: @ImageN).' },
  { id: 'flux3-klein-zero-based', rank: 4, status: 'fixed', impact: 'high', models: ['flux-3-klein'], at: ['server/src/comfy/plans.ts:302'],
    problem: 'The local multi-reference graph names references <ref_image_0>, <ref_image_1> (zero-based). We send "image 1" / "image 2", so multi-image edits and swaps on FLUX 3 Klein can\'t address the right input.',
    fix: 'For comfy-flux3-klein multiref: image N → <ref_image_{N-1}> (and the same in the negative), like qwen21ImageTags does for Qwen 2.1.' },
  { id: 'h3-local-tags', rank: 5, status: 'fixed', impact: 'medium', models: ['minimax-h3-talking-photo', 'minimax-h3-style-transfer', 'minimax-h3-vfx-edit'],
    at: ['workflows/h3-lipsync-api.json', 'workflows/h3-style-transfer-api.json', 'workflows/h3-vfx-edit-api.json', 'server/src/tools/h3/plan.ts:45', 'server/src/tools/h3/plan.ts:65'],
    problem: 'Local MiniMaxH3ReferenceToVideo graphs say "Image 1" / "Video 1" / "Audio 1"; the native node reads <Picture 1> / <Video 1> / <Audio 1> (our own swap prompts already do).',
    fix: 'Change the three template prompts to the native tags and rewrite user mentions on local H3 jobs.' },
  { id: 'runway-untagged', rank: 6, status: 'open', impact: 'medium', models: ['runway-gen4-image'], at: ['server/src/routing/routerModels.ts:630'],
    problem: 'Runway names each reference with a tag and the prompt says @tag; we send referenceImages with uri only, so a prompt can\'t point at a reference.',
    fix: 'Left open in step 2 (no paid run to test it). Check whether Router forwards referenceImages[].tag (strict_mode off translates the body); if it does, send tag "image1"… and rewrite @imageN → @imageN; if not, keep refs order-only and say so in the hint.' },
  { id: 'seedance-swap-words', rank: 7, status: 'fixed', impact: 'medium', models: ['seedance-2.5-edit'], at: ['server/src/routing/routerModels.ts:488', 'server/src/shared/renderModels.ts:111'],
    problem: 'Swap prompts say "the reference video" / "the reference image"; Render mixes that with "Image 1". Seedance\'s own labels are "Video 1" / "Image 1".',
    fix: 'Pass video: "Video 1", image: "Image 1" to swapPrompt and use the same in renderPrompt.' },
  { id: 'qwen-2509-picture', rank: 8, status: 'fixed', impact: 'medium', models: ['qwen-image-edit-2509'], at: ['server/src/tools/shots.ts:45', 'server/src/tools/shots.ts:49'],
    problem: 'TextEncodeQwenImageEditPlus labels inputs "Picture 1", "Picture 2" for the model; our swap prompts say "image 1" / "image 2".',
    fix: 'On local Qwen-Edit-2509 jobs rewrite "image N" → "Picture N" (inferred: A/B on a few swaps first).' },
  { id: 'silent-truncation', rank: 9, status: 'fixed', impact: 'low', models: ['minimax-h3', 'minimax-image-01', 'minimax-speech-2.8-hd', 'minimax-speech-2.8-turbo'],
    at: ['server/src/hostedRequests.ts:190', 'server/src/hostedRequests.ts:216', 'server/src/hostedRequests.ts:123'],
    problem: 'Prompts over 7,000 / 1,500 / 9,999 characters are cut without a word to the user (other routes refuse with a message).',
    fix: 'Refuse at quote / submit with the limit from this table, like Kling and Wan do.' },
  { id: 'veo-enhance', rank: 10, status: 'fixed', impact: 'low', models: ['veo-3.1', 'veo-3.1-fast'], at: ['server/src/routing/routerModels.ts:453'],
    problem: 'Router\'s enhancePrompt defaults to true and we never send it, so Veo rewrites every prompt and the app\'s "prompt rewrite" off has no effect.',
    fix: 'Send parameters.enhancePrompt explicitly: true (Veo\'s default) unless the job says promptRewrite off.' },
  { id: 'director-mentions-local', rank: 11, status: 'fixed', impact: 'low', models: ['ltx-2-19b', 'wan-2.2-fun-camera-14b'], at: ['server/src/cinema/tool.ts:142', 'server/src/comfy/plans.ts:185', 'server/src/comfy/plans.ts:179'],
    problem: 'Director keeps "@image1" in finalPrompt; local LTX-2 / Wan Fun Camera have no reference input, so the token is read as text.',
    fix: 'Strip or replace mentions with the asset\'s description for models whose refs.style is none.' },
];

// ---------------------------------------------------------------- small typed helpers ----------------------------------------------------------------
export const promptGrammarOf = (key: string | null | undefined): PromptGrammar | null => (key && PROMPT_GRAMMAR[key]) || null;
/** The token a model reads for input n (1-based as the user counts) of a kind, or null when the model can't name it. Place = a route key in `places`. */
export function refToken(key: string, kind: 'image' | 'video' | 'audio' | 'element', n: number, place?: string): string | null {
  const e = promptGrammarOf(key); if (!e) return null;
  const p = place ? e.places?.find((x) => x.route === place || x.route.startsWith(place))?.refs : undefined; const r = { ...e.refs, ...(p ?? {}) };
  const t = r[kind]; if (!t || r.style === 'none' || r.style === 'unknown') return null;
  return t.replace('{n}', String(n - 1 + (r.base ?? 1)));
}
