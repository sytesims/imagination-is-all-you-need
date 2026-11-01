import { env } from './env.js';
/** Licence metadata for providers, workflow variants and presets (see workflows/LICENSES.md). */
export interface LicenseInfo { id: string; name: string; osi: boolean; url: string | null; /** Plain-language key terms (shown with the licence on /licenses). */ terms?: string[]; /** Credit line the licence requires us to show in the app (null = none required). */ attribution?: string | null; /** Where the requirement is written (checked against the official text). */ attributionSource?: { url: string; clause: string; checkedAt: string; verified: boolean } | null; /** 'required' (default when attribution is set) or 'encouraged': the licence asks for the line but does not require it. */ attributionLevel?: 'required' | 'encouraged'; /** What the licence DOES require in the UI when that differs from the line (e.g. MiniMax H3 §IV.2: the name "MiniMax H3"). */ requiredDisplay?: string | null; /** Text the licence requires in a NOTICE file when the weights are redistributed (not shown in the UI). */ noticeFile?: string | null; /** Who made the weights, when it isn't the licensor (e.g. a fine-tuned adapter), with the upstream NOTICE source. */ credit?: { by: string; line: string; noticeUrl: string } | null }
/** OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY=1 (or filming mode): open models only, locked on for this server. */
export const OPEN_WEIGHTS_ONLY_ENV = /^(1|true|yes)$/i.test(env('OPEN_WEIGHTS_ONLY') || '');
/** @deprecated the boot-time env value only; use openWeightsOnly(), which also follows Settings → Connections → "Open models only". */
export const OPEN_WEIGHTS_ONLY = OPEN_WEIGHTS_ONLY_ENV;
let userOpenOnly: () => boolean = () => false;
/** routesHero.ts installs the saved user setting (kv 'openModelsOnly'); kept as a hook so this module never opens the DB. */
export const setUserOpenWeightsOnly = (f: () => boolean) => { userOpenOnly = f; };
/** Open models only, right now: the env lock or the user's setting. Hosted APIs and partner nodes are hidden and refused while on. */
export const openWeightsOnly = () => OPEN_WEIGHTS_ONLY_ENV || userOpenOnly();
/** OPENHIGGSFIELD_COMMERCIAL: no effect (kept so old configs still parse). Defaults never switch on a licence setting. */
export const COMMERCIAL = /^(1|true|yes)$/i.test(env('COMMERCIAL') || '');
export const LICENSES = {
  'apache-2.0': { id: 'apache-2.0', name: 'Apache-2.0', osi: true, url: 'https://www.apache.org/licenses/LICENSE-2.0' },
  mit: { id: 'mit', name: 'MIT', osi: true, url: 'https://opensource.org/license/mit' },
  /** This app's own code (root LICENSE + NOTICE): our in-browser and ffmpeg tools are credited with it. */
  'agpl-3.0-or-later': { id: 'agpl-3.0-or-later', name: 'AGPL-3.0-or-later', osi: true, url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
  'ltx-2-community': { id: 'ltx-2-community', name: 'LTX-2 Community License', osi: false, url: 'https://huggingface.co/Lightricks/LTX-2/blob/main/LICENSE', attribution: null, attributionSource: { url: 'https://huggingface.co/Lightricks/LTX-2/raw/main/LICENSE', clause: 'Retain the licence and attribution notices when distributing LTX-2 or derivatives; no in-app credit line.', checkedAt: '2026-10-17', verified: true } },
  gemma: { id: 'gemma', name: 'Gemma Terms of Use', osi: false, url: 'https://ai.google.dev/gemma/terms', attribution: null, attributionSource: { url: 'https://ai.google.dev/gemma/terms', clause: '3.1: the Notice file is required for Distributions other than through a Hosted Service; no in-app credit line.', checkedAt: '2026-10-17', verified: true }, noticeFile: 'Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms' },
  'bsd-3-clause': { id: 'bsd-3-clause', name: 'BSD-3-Clause', osi: true, url: 'https://opensource.org/license/bsd-3-clause' },
  proprietary: { id: 'proprietary', name: 'Proprietary (hosted API)', osi: false, url: null },
  // Model additions (verified upstream 2026-10-16; sources in workflows/LICENSES.md)
  'qwen-research': { id: 'qwen-research', name: 'Qwen Research License (non-commercial)', osi: false, url: 'https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE', attribution: null, attributionSource: { url: 'https://huggingface.co/Qwen/Qwen-Image-2.1/raw/main/LICENSE', clause: '“Built with Qwen” is required only when the outputs train or improve a distributed AI model; the Notice file applies to redistribution.', checkedAt: '2026-10-17', verified: true }, noticeFile: 'Qwen is licensed under the Qwen RESEARCH LICENSE AGREEMENT, Copyright (c) 2026 Hangzhou Tongyi Laboratory Technology Co., Ltd. All Rights Reserved.' },
  'minimax-community-akatz-charswap': { id: 'minimax-community-akatz-charswap', name: 'MiniMax H3 Community License (adapter retains base terms; no extra no-SaaS clause, verified 2026-10-17)', osi: false, url: 'https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA/blob/main/LICENSE', attribution: 'Powered by MiniMax H3', attributionLevel: 'encouraged', requiredDisplay: 'MiniMax H3', attributionSource: { url: 'https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA/raw/main/LICENSE', clause: '§IV.2 (required): “You shall prominently display “MiniMax H3”on the user interface of commercial product or service that uses MiniMax H3 or MiniMax H3 Works.” §III.3(a) (encouraged, not required): display a notice that the product or service is “Powered by MiniMax H3”. So the name “MiniMax H3” is required in the UI and the “Powered by MiniMax H3” credit is encouraged; we show the credit line, which also displays the required name. (Licence text checked 2026-10-17; same text as the base licence.)', checkedAt: '2026-10-17', verified: true },
    // J2: the LoRA is Akatz Labs' work; NOTICE copied verbatim from the repo (checked 2026-10-18)
    credit: { by: 'Akatz Labs', line: 'H3 Character Swap LoRA by Akatz Labs', noticeUrl: 'https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA/raw/main/NOTICE' },
    noticeFile: 'MiniMax H3 is licensed under the MiniMax H3 Community License Agreement, Copyright © 2026 MiniMax. All Rights Reserved.\n\nModified by Akatz Labs: character-swap LoRA fine-tuning, 1,000 updates, September 2026. This repository contains adapter weights, not base-model weights.\n\nAdditional modification by Akatz Labs: H3 Character Swap V1.5,\ncontinued from V1 for 1,000 additional optimizer updates, October 2026.\nV1.5 is the development checkpoint V2-1000. Adapter weights only;\nbase-model and training-assistant weights are not included.' },
  'minimax-community': { id: 'minimax-community', name: 'MiniMax H3 Community License', osi: false, url: 'https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE', attribution: 'Powered by MiniMax H3', attributionLevel: 'encouraged', requiredDisplay: 'MiniMax H3', attributionSource: { url: 'https://huggingface.co/MiniMaxAI/MiniMax-H3/raw/main/LICENSE', clause: '§IV.2 (required): “You shall prominently display “MiniMax H3”on the user interface of commercial product or service that uses MiniMax H3 or MiniMax H3 Works.” §III.3(a) (encouraged, not required): display a notice that the product or service is “Powered by MiniMax H3”. So the name “MiniMax H3” is required in the UI and the “Powered by MiniMax H3” credit is encouraged; we show the credit line, which also displays the required name. (Licence text checked 2026-10-17.)', checkedAt: '2026-10-17', verified: true } },
  'stability-community': { id: 'stability-community', name: 'Stability AI Community License', osi: false, url: 'https://huggingface.co/stabilityai/stable-audio-open-1.0/blob/main/LICENSE.md', attribution: 'Powered by Stability AI', attributionSource: { url: 'https://stability.ai/community-license-agreement', clause: 'IV(a)(iii): prominently display “Powered by Stability AI” on a related website, user interface, blogpost, about page, or product documentation (when distributing the model or a product using it).', checkedAt: '2026-10-17', verified: true }, noticeFile: 'This Stability AI Model is licensed under the Stability AI Community License, Copyright © Stability AI Ltd. All Rights Reserved' },
  // Local music models (2026-10-23, checked against the Hugging Face model cards that day)
  // 2026-10-31: Bria FIBO 2.0 weights (model cards briaai/Fibo-2.0-dev and briaai/Fibo-2.0-edit-turbo: license "bria-fibo", linked to CC BY-NC 4.0, gated)
  'bria-fibo': { id: 'bria-fibo', name: 'CC BY-NC 4.0 (FIBO 2.0 open weights); Bria API terms when hosted', osi: false, url: 'https://huggingface.co/briaai/Fibo-2.0-dev', attribution: null, attributionSource: { url: 'https://huggingface.co/briaai/Fibo-2.0-dev', clause: 'Model cards briaai/Fibo-2.0-dev and briaai/Fibo-2.0-edit-turbo declare license "bria-fibo" with license_link creativecommons.org/licenses/by-nc/4.0. Hosted runs (Comfy Router bria/image, bria/fibo) follow Bria API terms.', checkedAt: '2026-10-31', verified: true } },
  'yue2-weights': { id: 'yue2-weights', name: 'CC BY-NC 4.0 (YuE2-3B and SheetSage2 weights, m-a-p; Comfy-Org repack)', osi: false, url: 'https://huggingface.co/m-a-p/YuE2-3B', attribution: null, attributionSource: { url: 'https://huggingface.co/Comfy-Org/YuE2', clause: 'Model cards m-a-p/YuE2-3B, m-a-p/SheetSage2 and Comfy-Org/YuE2 declare cc-by-nc-4.0 (the first YuE release was Apache-2.0). §3(a): attribution applies when the weights are shared.', checkedAt: '2026-10-23', verified: true } },
  'minimax-music3-community': { id: 'minimax-music3-community', name: 'MiniMax-Music3 Community License', osi: false, url: 'https://huggingface.co/MiniMaxAI/MiniMax-Music3/blob/main/LICENSE', attribution: 'Powered by MiniMax-Music3', attributionLevel: 'encouraged', requiredDisplay: 'MiniMax-Music3', attributionSource: { url: 'https://huggingface.co/MiniMaxAI/MiniMax-Music3/raw/main/LICENSE', clause: 'Commercial products credit MiniMax-Music3 in their interface; over US$20M yearly revenue needs written permission; an acceptable use policy applies. The Comfy-Org repack card says apache-2.0, the upstream LICENSE file governs.', checkedAt: '2026-10-23', verified: true } },
  'mmaudio-weights': { id: 'mmaudio-weights', name: 'CC BY-NC 4.0 (MMAudio weights; code MIT)', osi: false, url: 'https://huggingface.co/hkchengrex/MMAudio', attribution: null, attributionSource: { url: 'https://creativecommons.org/licenses/by-nc/4.0/legalcode', clause: 'CC BY-NC 4.0 §3(a): attribution applies when the licensed material (the weights) is shared; running it and its outputs need no in-app credit.', checkedAt: '2026-10-17', verified: true } },
  'f5-tts-weights': { id: 'f5-tts-weights', name: 'CC BY-NC 4.0 (F5-TTS weights; code MIT)', osi: false, url: 'https://huggingface.co/SWivid/F5-TTS', attribution: null, attributionSource: { url: 'https://creativecommons.org/licenses/by-nc/4.0/legalcode', clause: 'CC BY-NC 4.0 §3(a): attribution applies when the licensed material (the weights) is shared; no in-app credit.', checkedAt: '2026-10-17', verified: true } },
  // Keep the background (2026-11-01, comfy/separation.ts): MelBand RoFormer vocal model, MIT on its model card (KimberleyJSN/melbandroformer); Kijai's safetensors copy has no own licence tag
  'melband-roformer': { id: 'melband-roformer', name: 'MIT (MelBand RoFormer weights, KimberleyJSN; Kijai safetensors copy)', osi: true, url: 'https://huggingface.co/KimberleyJSN/melbandroformer' },
  'chatterbox': { id: 'chatterbox', name: 'MIT (Chatterbox weights + code)', osi: true, url: 'https://huggingface.co/ResembleAI/chatterbox' },
  'flux-dev-nc': { id: 'flux-dev-nc', name: 'FLUX [dev] Non-Commercial License v2.0', osi: false, url: 'https://raw.githubusercontent.com/black-forest-labs/flux2/main/model_licenses/LICENSE-FLUX-DEV', attribution: null, attributionSource: { url: 'https://raw.githubusercontent.com/black-forest-labs/flux2/main/model_licenses/LICENSE-FLUX-DEV', clause: '3(b): the Attribution Notice goes alongside a Distribution of the model; 2(ii): outputs must disclose AI generation where the law requires it. No in-app credit line.', checkedAt: '2026-10-17', verified: true }, noticeFile: 'The FLUX [dev] Model is licensed by Black Forest Labs Inc. under the FLUX [dev] Non-Commercial License. Copyright Black Forest Labs Inc.' },
  'flux-kommunity': { id: 'flux-kommunity', name: 'FLUX Kommunity License v1.0 (non-commercial; commercial outputs only for Qualifying Users under US$5M revenue)', osi: false, url: 'https://huggingface.co/black-forest-labs/flux-3-image-klein/blob/main/LICENSE.md', attribution: null, attributionSource: { url: 'https://huggingface.co/black-forest-labs/flux-3-image-klein/blob/main/LICENSE.md', clause: 'Not verified: the licence file is gated (needs a Hugging Face login that accepted the terms).', checkedAt: '2026-10-17', verified: false } },
  'fish-community': { id: 'fish-community', name: 'Fish Audio Community License v1.0 (research/non-commercial; commercial under US$500k revenue; no hosted TTS service)', osi: false, url: 'https://huggingface.co/fishaudio/drama-3/blob/main/LICENSE', attribution: 'Built with Fish Audio', attributionSource: { url: 'https://huggingface.co/fishaudio/drama-3/raw/main/LICENSE', clause: 'IV(a): a product or service that uses the Fish Audio Materials shall prominently display “Built with Fish Audio”.', checkedAt: '2026-10-17', verified: true }, noticeFile: 'These Fish Audio Materials are licensed under the Fish Audio Community License, Version 1.0. Copyright © 39 AI, INC. All Rights Reserved.' },
  // SAM 3.1 (Object Swap mask preview, sam3.1_multiplex_fp16; routesMaskPreview.ts). Checked 2026-10-18 against the licence file.
  'sam-license': { id: 'sam-license', name: 'SAM License', osi: false, url: 'https://github.com/facebookresearch/sam3/blob/main/LICENSE', attribution: null,
    terms: ['Royalty-free, including commercial use.', 'Include the licence text when you redistribute the weights.', 'Trade-control (ITAR / export) and military-use limits apply.'] },
  'no-license': { id: 'no-license', name: 'No licence declared (ComfyUI_Fill-ChatterBox node pack)', osi: false, url: 'https://github.com/filliptm/ComfyUI_Fill-ChatterBox' },
} as Record<string, LicenseInfo>;
export type LicenseId = string;
/** Plugins may declare licences beyond the built-ins (must say whether they are OSI-approved). */
export const registerLicense = (l: LicenseInfo) => { if (!LICENSES[l.id]) LICENSES[l.id] = l; };
/** Workflow variant → governing licence (the most restrictive part) + every licence involved. */
const LTX: LicenseId[] = ['ltx-2-community', 'gemma'];
const WORKFLOW_PARTS: Record<string, LicenseId[]> = {
  'reshoot-api.json': LTX,
  'camera-ltx-api.json': LTX, 'camera-ltx-flf-api.json': LTX, 'cloud/camera-ltx-flf-api.json': LTX,
  'upscale-60fps-api.json': ['apache-2.0', 'mit'],
  'create-image-qwen21-t2i-api.json': ['qwen-research'], 'create-image-qwen21-edit-api.json': ['qwen-research'],
  'create-image-qwen21-faceswap-api.json': ['qwen-research', 'mit'], 'create-image-qwen21-personswap-api.json': ['qwen-research', 'mit'], // Face / Person Swap on Qwen 2.1 + BFS LoRAs (Alissonerdx, MIT)
  'create-image-qwen21-turbo-t2i-api.json': ['qwen-research'], 'create-image-qwen21-turbo-edit-api.json': ['qwen-research'],
  'create-image-qwen-t2i-api.json': ['apache-2.0'], 'create-image-qwen-edit2509-api.json': ['apache-2.0'],
  'create-image-qwen-edit2509-multiref-api.json': ['apache-2.0'], 'shots-qwen-edit2509-angles-api.json': ['apache-2.0'], // Face Swap / Shots (2026-10-21): Qwen-Image-Edit-2509, Lightning LoRA, multiple-angles LoRA: all Apache-2.0
  'object-swap-h3-charswap-api.json': ['minimax-community-akatz-charswap'], 'h3-t2v-api.json': ['minimax-community'], 'h3-i2v-api.json': ['minimax-community'], 'h3-r2v-api.json': ['minimax-community'], 'h3-cloud-t2v-api.json': ['minimax-community'], 'h3-cloud-i2v-api.json': ['minimax-community'], 'cloud/h3-t2v-api.json': ['minimax-community'], 'cloud/h3-i2v-api.json': ['minimax-community'],
  'create-image-zimage-turbo-api.json': ['apache-2.0'], 'create-image-moss-image-api.json': ['apache-2.0'], 'create-image-moss-image-base-api.json': ['apache-2.0'], 'create-image-zimage-api.json': ['apache-2.0'], 'create-image-klein4b-t2i-api.json': ['apache-2.0'], 'create-image-klein4b-edit-api.json': ['apache-2.0'], 'create-image-flux2dev-api.json': ['flux-dev-nc'],
  'create-image-flux3klein-t2i-api.json': ['flux-kommunity'], 'create-image-flux3klein-edit-api.json': ['flux-kommunity'], 'create-image-flux3klein-multiref-api.json': ['flux-kommunity'], 'create-image-flux3klein-inpaint-api.json': ['flux-kommunity'],
  'voice-drama3-tts-api.json': ['fish-community'], 'voice-drama3-clone-api.json': ['fish-community'],
  'voice-qwen3tts-api.json': ['apache-2.0'], // Qwen3 TTS 1.7B CustomVoice (Alibaba Qwen, Apache-2.0) via flybirdxx/ComfyUI-Qwen-TTS (Apache-2.0), 2026-10-27
  'wan22-ti2v-5b-api.json': ['apache-2.0'],
  'cloud/h3-multiframe-api.json': ['minimax-community', 'mit'] /* MiniMax H3 Keyframes: the official Comfy template (MIT), MiniMax H3 weights */, 'cloud/h3-fast-t2v-api.json': ['minimax-community', 'mit'], 'cloud/h3-fast-i2v-api.json': ['minimax-community', 'mit'], // MiniMax H3 Fast: FastH3 weights (MiniMax H3 Community), graphs from the MIT Comfy templates (2026-10-27)
  'deploy/h3-crossview-api.json': ['minimax-community', 'apache-2.0', 'mit'], // H3 CrossView (Step 3): MiniMax H3 + CrossView-Warp LoRA (MiniMax H3 Community), CrossViewWarp nodes (Apache-2.0), MoGe-2 (MIT)
  'ltx25-ti2v-api.json': ['ltx-2x-community', 'apache-2.0'], 'ltx25-flf-api.json': ['ltx-2x-community', 'apache-2.0'], 'ltx25-a2v-api.json': ['ltx-2x-community', 'apache-2.0'], 'cloud/wan21-infinitetalk-api.json': ['apache-2.0', 'mit'] /* InfiniteTalk (MeiGen-AI), Wan 2.1 and the lightx2v LoRA: Apache-2.0; wav2vec2 chinese base (TencentGameMate): MIT; graph from the MIT Comfy template */, // LTX-2.5 22B local (weights) + ComfyUI-GGUF (Apache-2.0)
  'audio-music-api.json': ['mit'], 'soundtrack-music-api.json': ['mit'],
  'audio-yue2-song-api.json': ['yue2-weights'], 'audio-yue2-cover-api.json': ['yue2-weights'], 'audio-minimax-music3-local-api.json': ['minimax-music3-community'], 'cloud/audio-minimax-music3-api.json': ['minimax-music3-community'] /* the same graph on Comfy Cloud */,
  'audio-sfx-api.json': ['stability-community'], 'soundtrack-sfx-api.json': ['stability-community'],
};
/** Plugins: governing licence parts for a workflow file. */
export const registerWorkflowLicense = (file: string, parts: LicenseId[]) => { WORKFLOW_PARTS[file] = parts; };
export function workflowLicense(file: string) {
  const parts = (WORKFLOW_PARTS[file] ?? ['apache-2.0']).filter((p) => LICENSES[p]);
  const gov = parts.find((p) => !LICENSES[p].osi) ?? parts[0];
  return { ...LICENSES[gov], parts: parts.map((p) => LICENSES[p]) };
}
export const workflowOsi = (file: string) => workflowLicense(file).osi;

/** Per-tool component licences (base weights, LoRAs, node packs) for tools that combine several models (OpenSoul). Shown only on /api/licenses + LICENSES.md. */
export interface LicenseComponent { model: string; license: string; commercial: 'yes' | 'no' | 'restricted' | 'provider-terms'; url: string | null; licenseId?: string; terms?: string[] }
export const LICENSE_COMPONENTS: Record<string, LicenseComponent[]> = {};
export const registerLicenseComponents = (toolId: string, rows: LicenseComponent[]) => { LICENSE_COMPONENTS[toolId] = rows; };
/** Canvas page (2026-10-24): the board is drawn with the tldraw SDK (web dependency, pinned). Not OSI: the tldraw license allows
 *  development use (localhost needs no key); a public production deployment needs a tldraw licence key (hobby keys keep the
 *  "made with tldraw" watermark). The licence text ships verbatim in licenses/tldraw-LICENSE.md. Its key check and watermark are untouched. */
registerLicenseComponents('canvas', [
  { model: 'tldraw 5.5.2 (the Canvas board: @tldraw/editor, @tldraw/store, @tldraw/tlschema, @tldraw/state, @tldraw/driver). Local use needs no key; a public deployment needs a tldraw licence key (VITE_TLDRAW_LICENSE_KEY). Full text: licenses/tldraw-LICENSE.md', license: 'tldraw license', commercial: 'restricted', url: 'https://github.com/tldraw/tldraw/blob/v5.5.2/LICENSE.md', terms: ['Development use only without a licence key; production use needs a trial, hobby or commercial key.', 'Do not disable or interfere with licence key enforcement or the watermark.', 'Include a verbatim copy of the licence with any distribution.'] },
  { model: 'Tiptap 3 (rich text inside tldraw text shapes, via tldraw)', license: 'MIT', commercial: 'yes', url: 'https://github.com/ueberdosis/tiptap/blob/develop/LICENSE.md' },
  { model: 'Radix UI (menus and popovers inside tldraw, via tldraw)', license: 'MIT', commercial: 'yes', url: 'https://github.com/radix-ui/primitives/blob/main/LICENSE' },
]);
/** Audio player (2026-10-25): the dancing bean hears a track's style in the browser. YAMNet ships in web/public/models/yamnet (uint8-quantized
 *  copy of Google's TF.js model; LICENSE + NOTICE.md in that folder), run with TensorFlow.js in a Web Worker. Nothing leaves the browser. */
registerLicenseComponents('audio-player', [
  { model: 'YAMNet (Google AudioSet sound classifier, TF.js v1; shipped uint8-quantized in web/public/models/yamnet with its LICENSE and NOTICE.md). Hears the dance style of an audio result, in your browser only', license: 'Apache-2.0', licenseId: 'apache-2.0', commercial: 'yes', url: 'https://www.kaggle.com/models/google/yamnet/tfJs/tfjs/1', terms: ['Keep the licence and the notice of changes (weights quantized to uint8).'] },
  { model: 'YAMNet class names (yamnet_class_map.csv, tensorflow/models; labels from the AudioSet ontology, CC BY-SA 4.0)', license: 'Apache-2.0', licenseId: 'apache-2.0', commercial: 'yes', url: 'https://github.com/tensorflow/models/tree/master/research/audioset/yamnet' },
  { model: 'TensorFlow.js 4.22.0 (@tensorflow/tfjs-core, -converter, -backend-webgl, -backend-cpu)', license: 'Apache-2.0', licenseId: 'apache-2.0', commercial: 'yes', url: 'https://github.com/tensorflow/tfjs/blob/master/LICENSE' },
]);
/** Direct a Shot, Play the actor (2026-10-26): the person you walk around is Quaternius' mannequin, shipped trimmed and compressed in
 *  web/public/models/mannequin (LICENSE.txt there; how it was made: scripts/assets/optimize-mannequin.mjs). */
registerLicenseComponents('plan-a-shot', [
  { model: 'Universal Animation Library (Standard) mannequin and clips by Quaternius (idle, walk, jog, sprint, dance, sit, jump; trimmed and meshopt-compressed in web/public/models/mannequin). The person you play in Direct a Shot', license: 'CC0-1.0', commercial: 'yes', url: 'https://quaternius.com/packs/universalanimationlibrary.html' },
  /* Open city (2026-10-26): the kit pieces the city generator places, merged into web/public/models/open-city/open-city.glb
     (LICENSE.txt there; how it was made: scripts/assets/build-open-city.mjs) */
  { model: 'KayKit City Builder Bits by Kay Lousberg (streets, pavements, buildings, street lights, cars). Open city', license: 'CC0-1.0', commercial: 'yes', url: 'https://kaylousberg.itch.io/city-builder-bits' },
  /* Rig as a character (2026-10-27): the skin-weight passes vendored in web/src/shared/rig/m2m (MIT notice in each file and in
     licenses/mesh2motion-LICENSE-MIT.md) and the human skeleton + moves in web/public/models/rig (LICENSE.txt there; scripts/assets/build-rig-human.mjs) */
  { model: 'Mesh2Motion by Scott Petrovic (the skin-weight passes in Rig as a character, vendored in web/src/shared/rig/m2m). Full text: licenses/mesh2motion-LICENSE-MIT.md', license: 'MIT', licenseId: 'mit', commercial: 'yes', url: 'https://github.com/Mesh2Motion/mesh2motion-app/blob/main/LICENSE-MIT.MD' },
  { model: 'Mesh2Motion human rig and animations (idle, walk, jog, sprint, jump, dance, sit; trimmed and meshopt-compressed in web/public/models/rig). The moves a character you rig gets', license: 'CC0-1.0', commercial: 'yes', url: 'https://github.com/Mesh2Motion/mesh2motion-app/blob/main/LICENSE-CC0.MD' },
  /* Drive mode (2026-10-27): the live drive's physics (web/src/shared/previz/drivePhysics.ts), loaded in the browser on first use */
  { model: 'Rapier 0.19.3 physics engine by Dimforge (@dimforge/rapier3d-compat, WebAssembly). Drive mode collisions in the open city', license: 'Apache-2.0', licenseId: 'apache-2.0', commercial: 'yes', url: 'https://github.com/dimforge/rapier.js/blob/master/LICENSE' },
  { model: 'City Kit (Commercial) by Kenney (towers and shops). Open city', license: 'CC0-1.0', commercial: 'yes', url: 'https://kenney.nl/assets/city-kit-commercial' },
  { model: 'City Kit (Suburban) by Kenney (houses). Open city', license: 'CC0-1.0', commercial: 'yes', url: 'https://kenney.nl/assets/city-kit-suburban' },
  { model: 'Car Kit by Kenney (traffic and parked cars). Open city', license: 'CC0-1.0', commercial: 'yes', url: 'https://kenney.nl/assets/car-kit' },
  { model: 'Nature Kit by Kenney (trees, palms, rocks, plants, fences). Open city', license: 'CC0-1.0', commercial: 'yes', url: 'https://kenney.nl/assets/nature-kit' },
  /* Direct a Shot scene kits + Add props (2026-10-26): web/public/models/kits (LICENSE.txt there; how it was made: scripts/assets/build-scene-kits.mjs) */
  { model: 'KayKit Furniture Bits by Kay Lousberg (home furniture). Direct a Shot props', license: 'CC0-1.0', commercial: 'yes', url: 'https://kaylousberg.itch.io/furniture-bits' },
  { model: 'KayKit Restaurant Bits by Kay Lousberg (kitchen pieces). Direct a Shot props', license: 'CC0-1.0', commercial: 'yes', url: 'https://kaylousberg.itch.io/restaurant-bits' },
  { model: 'KayKit Forest Nature Pack by Kay Lousberg (trees, bushes, rocks). Direct a Shot props', license: 'CC0-1.0', commercial: 'yes', url: 'https://kaylousberg.itch.io/kaykit-forest' },
  { model: 'Holiday Kit by Kenney (cabins, snowy pines, toy train). Direct a Shot diorama and props', license: 'CC0-1.0', commercial: 'yes', url: 'https://kenney.nl/assets/holiday-kit' },
  { model: 'WaterBottle glTF sample by Microsoft, label made blank (Khronos glTF Sample Assets). Direct a Shot product hero', license: 'CC0-1.0', commercial: 'yes', url: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/WaterBottle' },
]);
// Object Swap mask preview (GET/POST /api/tools/object-swap/mask-preview): SAM 3.1 on the local ComfyUI. Not a model card, so listed as a component.
// Face Swap and Shots (image apps on Create Image, 2026-10-21): the open default and the optional LoRA. Hosted routes follow the provider's terms.
const QWEN_EDIT_PARTS: LicenseComponent[] = [
  { model: 'Qwen-Image-Edit-2509 (fp8, Comfy-Org repack)', license: 'Apache-2.0', commercial: 'yes', url: 'https://huggingface.co/Qwen/Qwen-Image-Edit-2509' },
  { model: 'Qwen-Image-Edit-2509 Lightning 4-step LoRA (lightx2v)', license: 'Apache-2.0', commercial: 'yes', url: 'https://huggingface.co/lightx2v/Qwen-Image-Lightning' },
];
const HOSTED_EDIT_PARTS: LicenseComponent[] = [
  { model: 'Nano Banana 2 (hosted: fal, or the Comfy partner node)', license: 'Provider terms', commercial: 'provider-terms', url: 'https://fal.ai/models/fal-ai/nano-banana-2/edit' },
  { model: 'FLUX 3 Klein (local, BFL API)', license: 'FLUX Kommunity License v1.0', commercial: 'restricted', url: 'https://huggingface.co/black-forest-labs/flux-3-image-klein/blob/main/LICENSE.md' },
];
const BFS = 'https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap';
registerLicenseComponents('app-face-swap', [...QWEN_EDIT_PARTS, { model: 'BFS head swap LoRA v1.1 for Qwen Image 2.1 (bfs_head_v1.1_qwen_2.1, Alissonerdx)', license: 'MIT', commercial: 'yes', url: BFS }, ...HOSTED_EDIT_PARTS]);
registerLicenseComponents('app-person-swap', [...QWEN_EDIT_PARTS, { model: 'BFS body swap LoRA v1.0 for Qwen Image 2.1 (bfs_body_swap_v1.0_qwen_2.1, Alissonerdx)', license: 'MIT', commercial: 'yes', url: BFS }, ...HOSTED_EDIT_PARTS]);
// FLUX.2 [klein] 4B (Create Image, 2026-10-22): the files the local graphs load. The VAE comes from Comfy-Org/flux2-dev, whose card points to the
// FLUX.1 [dev] Non-Commercial licence: listed as found, with the link; the user decides.
/** Create Video, LTX-2.5 22B's DFR quality (2026-10-29): the official template bundled unchanged (workflows/templates/video_ltx2_5_dfr_i2v.json, its MIT licence
 *  next to it) and its model files, Lightricks' detailing IC-LoRA included. */
registerWorkflowLicense('ltx25-dfr-i2v-api.json', ['ltx-2x-community', 'mit']); registerWorkflowLicense('cloud/ltx25-dfr-i2v-api.json', ['ltx-2x-community', 'mit']);
registerLicenseComponents('h3-video', [
  { model: 'Official Comfy template · LTX-2.5 DFR: video_ltx2_5_dfr_i2v (Comfy-Org/workflow_templates, bundled unchanged in workflows/templates/ with its licence)', license: 'MIT', commercial: 'yes', url: 'https://github.com/Comfy-Org/workflow_templates/blob/main/templates/video_ltx2_5_dfr_i2v.json', licenseId: 'mit' },
  { model: 'LTX-2.5 22B distilled int8 ConvRot, Gemma 4 12B text encoder (bf16), x2 spatial and x2 temporal latent upscalers, VAEs (Lightricks/LTX-2.5) · DFR', license: 'LTX-2.x Community License', commercial: 'restricted', url: 'https://huggingface.co/Lightricks/LTX-2.5', licenseId: 'ltx-2x-community' },
  { model: 'Pixel-spatial upscaler x2 detailing IC-LoRA (Lightricks/LTX-2.5-22b-IC-LoRA-Pixel-Spatial-Upscaler) · DFR', license: 'LTX-2.x Community License', commercial: 'restricted', url: 'https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Pixel-Spatial-Upscaler', licenseId: 'ltx-2x-community' },
]);
registerLicenseComponents('create-image', [
  { model: 'FLUX.2 [klein] 4B distilled, bf16 (flux-2-klein-4b.safetensors, Comfy-Org repack)', license: 'Apache-2.0', commercial: 'yes', url: 'https://huggingface.co/black-forest-labs/FLUX.2-klein-4B' },
  { model: 'Qwen3 4B text encoder for FLUX.2 [klein] (qwen_3_4b.safetensors)', license: 'Apache-2.0', commercial: 'yes', url: 'https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-4b' },
  { model: 'FLUX.2 VAE (flux2-vae.safetensors from Comfy-Org/flux2-dev), used by FLUX.2 [klein] 4B and FLUX 3 Klein', license: 'Repo card of Comfy-Org/flux2-dev mentions the FLUX.1 [dev] Non-Commercial License; check before commercial use', commercial: 'restricted', url: 'https://huggingface.co/Comfy-Org/flux2-dev' },
]);
registerLicenseComponents('app-shots', [...QWEN_EDIT_PARTS,
  { model: 'Qwen-Edit-2509 Multiple-angles LoRA (dx8152), optional route', license: 'Apache-2.0', commercial: 'yes', url: 'https://huggingface.co/dx8152/Qwen-Edit-2509-Multiple-angles' }, ...HOSTED_EDIT_PARTS]);
// H3 Character Swap recipe credits (2026-11-01): our graphs follow Comfy's Openjutsu app and Akatz Labs' H3 Character Swap workflow (both MIT,
// full texts in licenses/). Shown with Person swap and Swap Two People.
const CHARSWAP_RECIPE_PARTS: LicenseComponent[] = [
  { model: "H3 Character Swap recipe settings, after Comfy's Openjutsu app (Comfy-Org/comfy-openjutsu)", license: 'MIT', licenseId: 'mit', commercial: 'yes', url: 'https://github.com/Comfy-Org/comfy-openjutsu' },
  { model: "H3 Character Swap workflow (Akatz Labs, akatz-labs/h3-character-swap-tool)", license: 'MIT', licenseId: 'mit', commercial: 'yes', url: 'https://github.com/akatz-labs/h3-character-swap-tool' },
];
registerLicenseComponents('object-swap', [{ model: 'SAM 3.1 (sam3.1_multiplex_fp16) · mask preview', license: 'SAM License', commercial: 'restricted', url: 'https://github.com/facebookresearch/sam3/blob/main/LICENSE', licenseId: 'sam-license', terms: LICENSES['sam-license'].terms } as LicenseComponent, ...CHARSWAP_RECIPE_PARTS]);
// Swap Two People (2026-10-27, tools/twoPersonSwap.ts): every model in the Comfy Cloud graph, with its licence.
registerLicenseComponents('two-person-swap', [
  { model: 'MiniMax H3 Ref2VA int8, Qwen3-VL 32B text encoder NVFP4, H3 video + audio VAEs, H3 fl2v turbo 8-step LoRA (Comfy-Org/MiniMax-H3, lightx2v/Minimax-h3-Turbo)', license: 'MiniMax H3 Community License', licenseId: 'minimax-community', commercial: 'restricted', url: 'https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE' },
  { model: 'H3 Character Swap LoRA v1.5 (Akatz Labs, akatz-ai/MiniMax-H3-Character-Swap-LoRA), imported into your Comfy Cloud library', license: LICENSES['minimax-community-akatz-charswap'].name, licenseId: 'minimax-community-akatz-charswap', commercial: 'restricted', url: 'https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA/blob/main/LICENSE' },
  { model: 'SAM 3.1 (sam3.1_multiplex_fp16) · person masks', license: 'SAM License', commercial: 'restricted', url: 'https://github.com/facebookresearch/sam3/blob/main/LICENSE', licenseId: 'sam-license', terms: LICENSES['sam-license'].terms } as LicenseComponent,
  ...CHARSWAP_RECIPE_PARTS,
]);
// H3 runner Step 3 (Oct 26): New angle · H3 CrossView · cloud (Re-shoot, on your own Comfy deployment). Every part of the Build, with its licence.
// Keep the background (2026-11-01): Translate a video and Change Voice split the voice from the music first when the separation pack + model are installed.
const SEPARATION_PARTS: LicenseComponent[] = [
  { model: 'Official Comfy template · MelBandRoFormer Audio Separation: audio_melbandroformer_audio_separation (Comfy-Org/workflow_templates), flattened in workflows/audio-separation-melband-api.json · Keep the background', license: 'MIT', licenseId: 'mit', commercial: 'yes', url: 'https://github.com/Comfy-Org/workflow_templates/blob/main/templates/audio_melbandroformer_audio_separation.json' },
  { model: 'ComfyUI-MelBandRoFormer node pack (kijai) @ 92c86854e6 · Keep the background', license: 'None stated (its pyproject.toml names a LICENSE file the repo does not include); check with the author', commercial: 'restricted', url: 'https://github.com/kijai/ComfyUI-MelBandRoFormer' },
  { model: 'MelBand RoFormer vocal model (KimberleyJSN/melbandroformer; MelBandRoformer_fp16.safetensors, Kijai/MelBandRoFormer_comfy) · Keep the background', license: 'MIT', licenseId: 'melband-roformer', commercial: 'yes', url: 'https://huggingface.co/KimberleyJSN/melbandroformer' },
];
registerLicenseComponents('app-translate-video', SEPARATION_PARTS); registerLicenseComponents('app-change-voice', SEPARATION_PARTS);
// Talking Video (2026-10-27, Lip Sync): InfiniteTalk on Comfy Cloud (script and long speech in parts), and LongCat-Video-Avatar 1.5 (off by default:
// needs your own Comfy deployment, shared/longcatAvatar.ts). Every part with its licence and source.
registerLicenseComponents('voice', [
  { model: 'InfiniteTalk single-speaker patch (MeiGen-AI) · Talking Video', license: 'Apache-2.0', licenseId: 'apache-2.0', commercial: 'yes', url: 'https://github.com/MeiGen-AI/InfiniteTalk' },
  { model: 'Wan 2.1 I2V 14B 480p (Wan-AI; Kijai fp8 repack) + lightx2v step-distill LoRA · Talking Video', license: 'Apache-2.0', licenseId: 'apache-2.0', commercial: 'yes', url: 'https://huggingface.co/Wan-AI/Wan2.1-I2V-14B-480P' },
  { model: 'wav2vec2 chinese base (TencentGameMate) · Talking Video', license: 'MIT', licenseId: 'mit', commercial: 'yes', url: 'https://huggingface.co/TencentGameMate/chinese-wav2vec2-base' },
  { model: 'InfiniteTalk template video_wan2_1_infinitetalk (Comfy-Org/workflow_templates) · Talking Video', license: 'MIT', licenseId: 'mit', commercial: 'yes', url: 'https://github.com/Comfy-Org/workflow_templates' },
  { model: 'LongCat-Video-Avatar 1.5 weights + code (Meituan) · Talking Video, needs your own Comfy deployment (off by default)', license: 'MIT', licenseId: 'mit', commercial: 'yes', url: 'https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5' },
  { model: 'LongCat-Avatar 1.5 bf16 + DMD distill LoRA repacks (Kijai/WanVideo_comfy) · Talking Video (deployment)', license: 'MIT (follows upstream)', licenseId: 'mit', commercial: 'yes', url: 'https://huggingface.co/Kijai/WanVideo_comfy/tree/main/LongCat' },
  { model: 'Whisper large-v3 (OpenAI) · LongCat 1.5 audio encoder (deployment)', license: 'Apache-2.0', licenseId: 'apache-2.0', commercial: 'yes', url: 'https://huggingface.co/openai/whisper-large-v3' },
  { model: 'ComfyUI-WanVideoWrapper (kijai) @ 088128b224 or later · LongCat 1.5 nodes (deployment)', license: 'Apache-2.0', licenseId: 'apache-2.0', commercial: 'yes', url: 'https://github.com/kijai/ComfyUI-WanVideoWrapper' },  ...SEPARATION_PARTS,
]);
registerLicenseComponents('reshoot', [
  { model: 'MiniMax H3 Ref2VA int8, Qwen3-VL text encoder int8, H3 video + audio VAEs (Comfy-Org/MiniMax-H3) · H3 CrossView', license: 'MiniMax H3 Community License', licenseId: 'minimax-community', commercial: 'restricted', url: 'https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE' },
  { model: 'CrossView-Warp v1 LoRA for MiniMax H3 Ref2VA (Cseti) · H3 CrossView', license: 'MiniMax H3 Community License', licenseId: 'minimax-community', commercial: 'restricted', url: 'https://huggingface.co/Cseti/MiniMax-H3_Ref2VA-LoRA-CrossView-Warp_v1' },
  { model: 'MiniMax H3 ref2v 8-step turbo LoRA 768p (lightx2v) · H3 CrossView', license: 'No licence tag on the model card; the repository licence applies, check it', commercial: 'restricted', url: 'https://huggingface.co/lightx2v/Minimax-h3-Turbo' },
  { model: 'MoGe-2 ViT-L normal fp16 depth model (Comfy-Org/MoGe) · H3 CrossView', license: 'MIT', licenseId: 'mit', commercial: 'yes', url: 'https://huggingface.co/Comfy-Org/MoGe' },
  { model: 'ComfyUI-CrossViewWarp node pack (comfyrob fork @ fbb1e93 of cseti007/ComfyUI-CrossViewWarp; installed in your Build) · H3 CrossView', license: 'Apache-2.0', licenseId: 'apache-2.0', commercial: 'yes', url: 'https://github.com/comfyrob/ComfyUI-CrossViewWarp' },
  { model: 'Reshoot recipe graph (Comfy-Org/comfy-reshoot, adapted in workflows/deploy/h3-crossview-api.json) · H3 CrossView', license: 'MIT', licenseId: 'mit', commercial: 'yes', url: 'https://github.com/Comfy-Org/comfy-reshoot' },
]);
