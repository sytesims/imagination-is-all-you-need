#!/usr/bin/env python3
"""Voice / video-to-sound API graphs (our own, built from node schemas in object_info; no third-party workflow copied).
Packs (pinned in readiness/manifest/custom-nodes.json): wildminder/ComfyUI-Chatterbox (Apache-2.0; Chatterbox TTS / multilingual / VC),
ComfyUI-F5-TTS, ComfyUI-MMAudio. Transcription (faster-whisper) and translation (NLLB-200) run server-side: server/py/voice_runner.py. Node ids are referenced by server/src/comfy/plans.ts (voice*, mmaudio)."""
import json, os
W = os.path.join(os.path.dirname(__file__), '..', 'workflows')
def save(name, g): json.dump(g, open(os.path.join(W, name), 'w'), indent=1); print('wrote', name)
SRC = {'class_type': 'LoadAudio', 'inputs': {'audio': 'source.mp4'}}
SAMPLE = {'class_type': 'LoadAudio', 'inputs': {'audio': 'voice_sample.wav'}}
save_audio = lambda src, p: {'class_type': 'SaveAudio', 'inputs': {'audio': [src, 0], 'filename_prefix': f'openhiggsfield/{p}'}}
# 1) Voiceover, Chatterbox TTS (node 1 = optional cloned-voice sample; dropped when a library voice is used)
save('voice-chatterbox-tts-api.json', {
  '1': SAMPLE,
  '2': {'class_type': 'ChatterboxTTS', 'inputs': {'model_pack_name': 'resembleai_default_voice', 'text': 'Hello.', 'max_new_tokens': 1000, 'flow_cfg_scale': 0.7, 'exaggeration': 0.5, 'temperature': 0.8, 'cfg_weight': 0.5, 'repetition_penalty': 1.2, 'min_p': 0.05, 'top_p': 1.0, 'seed': 0, 'use_watermark': False, 'device': 'default', 'dtype': 'auto', 'attention_mode': 'sdpa', 'top_k': 1000, 'normalize_loudness': True, 'num_steps': 10, 'cfg_scale': 1.0, 'audio_prompt': ['1', 0]}},
  '3': save_audio('2', 'voiceover')})
# 2) Voiceover / translate, F5-TTS (node 1 = voice reference: cloned sample, or the source clip's own speech)
save('voice-f5tts-api.json', {
  '1': SAMPLE,
  '2': {'class_type': 'F5TTSAudioInputs', 'inputs': {'sample_audio': ['1', 0], 'sample_text': '', 'speech': 'Hello.', 'seed': 0, 'model': 'F5v1', 'vocoder': 'auto', 'speed': 1.0, 'model_type': 'F5TTS_v1_Base'}},
  '3': save_audio('2', 'voiceover')})
# 3) Change voice, Chatterbox VC: source speech (1) → target voice (2 = cloned sample; without it the pack's built-in voice)
save('voice-chatterbox-vc-api.json', {
  '1': SRC, '2': SAMPLE,
  '3': {'class_type': 'ChatterboxVC', 'inputs': {'model_pack_name': 'resembleai_default_voice', 'source_audio': ['1', 0], 'target_voice_audio': ['2', 0], 'n_timesteps': 10, 'temperature': 1.0, 'flow_cfg_scale': 0.7, 'use_watermark': False, 'device': 'default', 'dtype': 'auto', 'attention_mode': 'sdpa', 'refinement_passes': 1, 'max_chunk_duration': 30.0, 'chunk_method': 'smart'}},
  '5': save_audio('3', 'changed-voice')})
# (Translate step 1, the transcript, runs server-side with faster-whisper; step 2, NLLB-200 translation, too.)
# 5) Translate step 3: Chatterbox multilingual TTS in the target language, voice prompted from the source speech
save('voice-chatterbox-ml-api.json', {
  '1': SRC,
  '2': {'class_type': 'ChatterboxMTLTTS', 'inputs': {'model_pack_name': 'resembleai_default_voice', 'model_version': 't3_mtl23ls_v3.safetensors', 'language': 'es', 'text': 'Hola.', 'exaggeration': 0.5, 'temperature': 0.8, 'cfg_weight': 0.5, 'repetition_penalty': 1.2, 'min_p': 0.05, 'top_p': 1.0, 'seed': 0, 'use_watermark': False, 'device': 'default', 'dtype': 'auto', 'attention_mode': 'sdpa', 'crash_protection_template': 'hmm ,, {seg} hmm ,,', 'audio_prompt': ['1', 0]}},
  '3': save_audio('2', 'translated')})
# 6) Soundtrack video-to-sound, MMAudio (kijai pack, Kijai/MMAudio_safetensors weights, 44k mode)
save('soundtrack-mmaudio-api.json', {
  '1': {'class_type': 'LoadVideo', 'inputs': {'file': 'source.mp4'}},
  '2': {'class_type': 'GetVideoComponents', 'inputs': {'video': ['1', 0]}},
  '3': {'class_type': 'MMAudioModelLoader', 'inputs': {'mmaudio_model': 'mmaudio_large_44k_v2_fp16.safetensors', 'base_precision': 'fp16'}},
  '4': {'class_type': 'MMAudioFeatureUtilsLoader', 'inputs': {'vae_model': 'mmaudio_vae_44k_fp16.safetensors', 'synchformer_model': 'mmaudio_synchformer_fp16.safetensors', 'clip_model': 'apple_DFN5B-CLIP-ViT-H-14-384_fp16.safetensors', 'mode': '44k', 'precision': 'fp16'}},
  '5': {'class_type': 'MMAudioSampler', 'inputs': {'mmaudio_model': ['3', 0], 'feature_utils': ['4', 0], 'duration': 8.0, 'steps': 25, 'cfg': 4.5, 'seed': 0, 'prompt': '', 'negative_prompt': '', 'mask_away_clip': False, 'force_offload': True, 'images': ['2', 0]}},
  '6': save_audio('5', 'mmaudio')})
# 7) Voiceover, Qwen3 TTS 1.7B CustomVoice (flybirdxx/ComfyUI-Qwen-TTS @374c2e0, Apache-2.0; weights Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice, Apache-2.0).
#    One node: script + preset voice + language + optional style instruction. comfy/plans.ts fills node 1 (tools/voice/qwen3tts.ts patchQwen3Tts).
save('voice-qwen3tts-api.json', {
  '1': {'class_type': 'FB_Qwen3TTSCustomVoice', 'inputs': {'text': 'Hello.', 'speaker': 'Ryan', 'model_choice': '1.7B', 'device': 'auto', 'precision': 'bf16', 'language': 'Auto',
        'seed': 0, 'instruct': '', 'max_new_tokens': 2048, 'top_p': 1.0, 'top_k': 50, 'temperature': 0.9, 'repetition_penalty': 1.05, 'attention': 'auto', 'unload_model_after_generate': False}},
  '2': save_audio('1', 'voiceover')})
