/**
 * Default models for the Audio page, keyed by Audio workflow (shared/audioWorkflows.ts).
 * Same shape and resolution as shared/imageDefaults.ts and shared/videoDefaults.ts: one model for a local GPU and one for a hosted key, with a
 * short line on why. routing/defaults.ts resolves it (saved pick > this default for the active setup, if it runs > the first model that runs),
 * and the web marks it "Default" in the model menu.
 *
 * Every id here must be a model its workflow's tool really offers for that mode (tools/media.ts providerModes); test/audio-defaults.test.ts checks it.
 * User decisions (2026-10-23): music runs on YuE2 locally (MiniMax Music 3 open weights and ACE-Step 1.5 are also offered) and on MiniMax Music 3
 * (Comfy Cloud) hosted; hosted voice is ElevenLabs, with MiniMax Speech as the fallback when there is no ElevenLabs route.
 * Music for a video keeps ACE-Step 1.5 locally: it makes instrumental beds to the clip's length and needs no lyrics (YuE2 does).
 * 2026-10-25: no hosted music default for now. MiniMax Music 3 (Comfy Cloud, cloud-minimax-music) is mock only (providers.ts) and has no Comfy Router
 * page, and Sonilo Text to Music is not on Comfy Router either (routing/routerModels.ts NOT_ON_ROUTER), so neither runs for real with a key. A hosted
 * default that can't run would carry the "Default" mark in the menu; with none, the local default (YuE2 / ACE-Step) is the one named and the bar falls
 * back to whatever runs. Put cloud-minimax-music back here once its node has a live executor.
 * 2026-10-27: MiniMax Music 3 is one open-weights card (Local + Comfy Cloud, cloud-minimax-music: a real Comfy Cloud runner, held until one measured run sets
 * its GPU-time price) and Seed Audio 1.0 Multilingual (Comfy Router, live with a key) now also makes music and sound effects.
 * Cloud first (2026-10-27): hosted models come from shared/cloudDefaults.ts; music and music for a video start on Seed Audio (the Comfy key).
 */
import type { WorkflowDefaults } from './imageDefaults.js';
import type { AudioWorkflowId } from './audioWorkflows.js';
import { cloudModel } from './cloudDefaults.js';

const VOICE_HOSTED = { hosted: cloudModel('voiceover'), hostedFallback: 'direct-minimax-speech', hostedFirstWhenNeither: true };

export const AUDIO_DEFAULTS: Record<AudioWorkflowId, WorkflowDefaults> = {
  music: { local: 'comfy-yue2', hosted: cloudModel('music'), why: { local: 'Full songs with vocals from your lyrics, free, locally', hosted: 'Music from a prompt on the Comfy key (no lyrics)' } },
  sfx: { local: 'comfy-stable-audio', hosted: cloudModel('sfx'), why: { local: 'Sound effects and loops, free, locally', hosted: 'Clean sound effects from a few words' } },
  voiceover: { local: 'comfy-chatterbox', ...VOICE_HOSTED, why: { local: 'Natural speech with voice cloning, free, locally', hosted: 'ElevenLabs: the most natural voices' } },
  'change-voice': { local: 'comfy-chatterbox-vc', hosted: null, why: { local: 'New voice, same timing, free, locally' } },
  translate: { local: 'local-whisper-nllb-chatterbox', hosted: null, why: { local: 'Most languages: transcribe, translate and re-voice on your computer' } },
  'soundtrack-music': { local: 'comfy-acestep', hosted: cloudModel('soundtrack-music'), why: { local: 'Instrumental beds to the clip length, free, locally', hosted: 'Music from a prompt on the Comfy key' } },
  'soundtrack-sound': { local: 'comfy-mmaudio', hosted: cloudModel('soundtrack-sound') /* Sonilo isn't on Comfy Router */, why: { local: 'Sound synced to what happens on screen, free, locally' } },
  cover: { local: 'comfy-yue2', hosted: null, why: { local: 'Keeps the melody, sings your new words, free, locally' } },
};
/** The static table for clients (GET /api/audio-workflows `defaults`). */
export const audioDefaultsOf = (id: string): WorkflowDefaults | null => (AUDIO_DEFAULTS as Record<string, WorkflowDefaults>)[id] ?? null;
