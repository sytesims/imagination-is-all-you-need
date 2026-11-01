/**
 * Shared Voice Studio controls and labels.
 * Each control maps to the engine's own parameter where it has one ('native'), otherwise our ffmpeg
 * post-process applies it at 0 credits ('post'), otherwise it is 'unsupported' (non-default value → 400).
 */
import { spawn } from 'node:child_process';
import { rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { QWEN3_TTS, QWEN3_TTS_SPEAKERS, QWEN3_TTS_DEFAULT_SPEAKER, QWEN3_TTS_LANGUAGES, QWEN3_TTS_MAX_CHARS } from './qwen3tts.js';

export type Support = { via: 'native'; param: string } | { via: 'post'; param: string } | { via: 'unsupported' };
export type ControlName = 'voiceDetails' | 'expression' | 'mood' | 'speed' | 'pitch' | 'volume' | 'outputFormat' | 'sampleRate';
/** A model's own preset voice (id = what the engine takes; hint = its native language). */
export interface ModelVoice { id: string; label: string; hint?: string }
export interface VoiceModelCaps { controls: Record<ControlName, Support>; maxVoiceSamples: number; outputFormats: string[]; sampleRates: number[]; note?: string;
  /** 2026-10-27 (Qwen3 TTS): a model with its own preset voices takes job field `speaker` (one of these) instead of our voice library. */ voices?: ModelVoice[]; defaultVoice?: string;
  /** The language it speaks the script in (job field `speechLanguage`; 'auto' = read from the script). */ languages?: { value: string; label: string }[]; defaultLanguage?: string;
  /** What the voiceDetails text is called for this model ("Style" for Qwen's instruct) and its example. */ detailsLabel?: string; detailsPlaceholder?: string;
  /** Longest script the model reads in one pass (characters); longer → 400 too_long on the prompt. */ maxChars?: number;
  /** The model reads in its own voice and takes no voice pick (Seed Audio): the Voice control hides. */ noVoice?: true;
  /** The engine has one voice of its own (Chatterbox voice changer): the picker offers only it (this library id) and your sample. */ builtinVoice?: string }
/** Job fields the voice controls read (stored as input.voiceFields, re-checked per attempt in voicePre and given back by Recreate). */
export const VOICE_FIELD_KEYS = ['voiceDetails', 'expression', 'mood', 'speed', 'pitch', 'volume', 'outputFormat', 'sampleRate', 'speaker', 'speechLanguage'] as const;
export const voiceFieldsOf = (fields: Record<string, string>) => Object.fromEntries(VOICE_FIELD_KEYS.filter((k) => fields[k] != null).map((k) => [k, fields[k]]));

export const VOICE_LIMITS = {
  voiceDetails: { maxLength: 500 },
  expression: { min: 0, max: 10, step: 1, default: 5 },
  mood: { min: -1, max: 1, step: 0.1, default: 0 },
  speed: { min: 0.5, max: 2, step: 0.05, default: 1 },
  pitch: { min: -12, max: 12, step: 1, default: 0, unit: 'semitones' },
  volume: { min: 0, max: 200, step: 1, default: 100, unit: '%' },
  outputFormat: { options: ['mp3', 'wav', 'opus'], default: 'mp3' },
  sampleRate: { options: [8000, 16000, 24000, 32000, 44100, 48000], default: 24000 },
  voiceAudio: { maxFiles: 3 },
} as const;
const OPUS_RATES = [8000, 16000, 24000, 48000];
const N = (param: string): Support => ({ via: 'native', param });
const P = (param: string): Support => ({ via: 'post', param });
const U: Support = { via: 'unsupported' };
const postAll = { speed: P('ffmpeg atempo'), pitch: P('ffmpeg asetrate+atempo'), volume: P('ffmpeg volume'), outputFormat: P('ffmpeg codec'), sampleRate: P('ffmpeg -ar') };
const caps = (c: Partial<Record<ControlName, Support>>, maxVoiceSamples: number, note?: string): VoiceModelCaps =>
  ({ controls: { voiceDetails: U, expression: U, mood: U, ...postAll, ...c }, maxVoiceSamples, outputFormats: ['mp3', 'wav', 'opus'], sampleRates: [...VOICE_LIMITS.sampleRate.options], ...(note ? { note } : {}) });

/** Per-model caps. Samples above 1 are joined by ffmpeg into one reference clip (free) for engines that take a single reference. */
export const VOICE_CAPS: Record<string, VoiceModelCaps> = {
  'comfy-chatterbox': caps({ expression: N('exaggeration') }, 3, 'expression 0–10 → exaggeration 0.25–2.0 (5 → 0.5, the engine default)'),
  'comfy-drama3': caps({}, 3, 'use the inline [tag] chips for emotion'),
  'comfy-f5tts': caps({ speed: N('speed') }, 3),
  'api-eleven-tts': caps({ expression: N('stability') }, 0, 'expression 0–10 → stability 1.0–0.0 (5 → 0.5, the node default)'),
  'api-eleven-v3': caps({ expression: N('stability') }, 0, 'expression 0–10 → stability, snapped to v3\'s presets: 0–2 Robust 1.0, 3–7 Natural 0.5, 8–10 Creative 0.0; inline audio tags such as [whispers] are read from the script'),
  'api-eleven-v4-turbo': caps({ expression: N('stability') }, 0, 'expression 0–10 → stability 1.0–0.0 (5 → 0.5, the node default)'),
  'api-fish-tts': caps({}, 0),
  'api-heygen-tts': caps({ speed: N('speed') }, 0),
  'direct-minimax-speech': caps({ mood: N('voice_setting.emotion'), speed: N('voice_setting.speed'), pitch: N('voice_setting.pitch'), volume: N('voice_setting.vol'), sampleRate: N('audio_setting.sample_rate') }, 0,
    'mood < −0.33 → angry, > 0.33 → happy, else neutral; volume % → vol (100 % = 1); 48000 Hz is resampled by ffmpeg'),
  'direct-minimax-speech-turbo': caps({ mood: N('voice_setting.emotion'), speed: N('voice_setting.speed'), pitch: N('voice_setting.pitch'), volume: N('voice_setting.vol'), sampleRate: N('audio_setting.sample_rate') }, 0,
    'mood < −0.33 → angry, > 0.33 → happy, else neutral (no emotion sent); volume % → vol (100 % = 1); 48000 Hz is resampled by ffmpeg'),
  // Qwen3 TTS 1.7B (local, open weights; tools/voice/qwen3tts.ts): 9 preset voices, a spoken language, a style instruction (voiceDetails → instruct)
  [QWEN3_TTS]: { ...caps({ voiceDetails: N('instruct') }, 0, 'its own 9 voices (no cloning); Style is a plain instruction such as "warm, excited, like a trailer narrator"; speed, pitch and volume are applied after'),
    voices: QWEN3_TTS_SPEAKERS, defaultVoice: QWEN3_TTS_DEFAULT_SPEAKER, languages: QWEN3_TTS_LANGUAGES.map(({ value, label }) => ({ value, label })), defaultLanguage: 'auto',
    detailsLabel: 'Style', detailsPlaceholder: 'e.g. warm and excited, like a friendly trailer narrator', maxChars: QWEN3_TTS_MAX_CHARS },
  'api-seed-audio': { ...caps({}, 0, 'Seed Audio reads the script in its own voice; the Router body sends no voice or delivery settings'), noVoice: true },
  // Video-output modes (result muxed onto your clip): post runs on the result's audio track; outputFormat doesn't apply (the file is a video).
  'comfy-chatterbox-vc': { ...caps({ outputFormat: U }, 3, 'change voice: no delivery controls in the engine; speed is applied after, length padded to the clip'), outputFormats: [],
    builtinVoice: 'narrator-warm' /* one built-in target voice (comfy/plans.ts change-voice); a library pick runs as it, so the picker offers Built-in + your sample */ },
  'local-whisper-nllb-chatterbox': { ...caps({ expression: N('exaggeration'), outputFormat: U }, 3, 'translate: expression 0–10 → exaggeration 0.25–2.0'), outputFormats: [] },
  'local-whisper-nllb-f5': { ...caps({ speed: N('speed'), outputFormat: U }, 3, 'translate'), outputFormats: [] },
  'cloud-infinitetalk': { ...caps({ speed: U, pitch: U, outputFormat: U }, 0, 'talking photo (InfiniteTalk): speed/pitch would break the lip sync; volume and sample rate apply to the video\'s audio track'), outputFormats: [] },
  'comfy-h3-lipsync': { ...caps({ speed: U, pitch: U, outputFormat: U }, 0, 'talking photo: speed/pitch would break the lip sync; volume and sample rate apply to the video\'s audio track'), outputFormats: [] },
  'comfy-ltx25-lipsync': { ...caps({ speed: U, pitch: U, outputFormat: U }, 0, 'talking photo (LTX-2.5): speed/pitch would break the lip sync; volume and sample rate apply to the video\'s audio track'), outputFormats: [] },
};
export const voiceCapsOf = (provider: string): VoiceModelCaps | null => VOICE_CAPS[provider] ?? null;

export interface VoiceControls { voiceDetails: string | null; expression: number; mood: number; speed: number; pitch: number; volume: number; outputFormat: 'mp3' | 'wav' | 'opus'; sampleRate: number; speaker: string | null; speechLanguage: string | null }
type Issue = { code: string; field: string; message: string };

const num = (fields: Record<string, string>, k: keyof typeof VOICE_LIMITS, issues: Issue[], int = false): number => {
  const L: any = VOICE_LIMITS[k]; const raw = fields[k];
  if (raw == null || raw === '') return L.default;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < L.min || v > L.max || (int && !Number.isInteger(v))) issues.push({ code: 'invalid', field: k, message: `${k} must be ${int ? 'a whole number ' : ''}from ${L.min} to ${L.max}${L.unit ? ` ${L.unit}` : ''}.` });
  return v;
};

/** Validates the controls for a provider. Returns the values plus engine-native params, or 400 issues. `text` = the script (checked against the model's maxChars). */
export function parseVoiceControls(fields: Record<string, string>, provider: string, sampleCount: number, text?: string): { ok: true; controls: VoiceControls; native: Record<string, any>; post: Partial<VoiceControls> } | { ok: false; issues: Issue[] } {
  const issues: Issue[] = [];
  const voiceDetails = (fields.voiceDetails ?? '').trim() || null;
  if (voiceDetails && voiceDetails.length > VOICE_LIMITS.voiceDetails.maxLength) issues.push({ code: 'too_long', field: 'voiceDetails', message: `voiceDetails is ${voiceDetails.length} characters; the limit is 500.` });
  const c: VoiceControls = {
    voiceDetails, expression: num(fields, 'expression', issues, true), mood: num(fields, 'mood', issues), speed: num(fields, 'speed', issues), pitch: num(fields, 'pitch', issues), volume: num(fields, 'volume', issues),
    outputFormat: (fields.outputFormat || 'mp3') as any, sampleRate: fields.sampleRate ? Number(fields.sampleRate) : 24000,
    speaker: (fields.speaker ?? '').trim() || null, speechLanguage: (fields.speechLanguage ?? '').trim() || null,
  };
  if (!(VOICE_LIMITS.outputFormat.options as readonly string[]).includes(c.outputFormat)) issues.push({ code: 'invalid', field: 'outputFormat', message: 'outputFormat must be mp3, wav or opus.' });
  if (!(VOICE_LIMITS.sampleRate.options as readonly number[]).includes(c.sampleRate)) issues.push({ code: 'invalid', field: 'sampleRate', message: `sampleRate must be one of ${VOICE_LIMITS.sampleRate.options.join(', ')}.` });
  else if (c.outputFormat === 'opus' && !OPUS_RATES.includes(c.sampleRate)) issues.push({ code: 'invalid', field: 'sampleRate', message: `Opus supports ${OPUS_RATES.join(', ')} Hz; pick one of those or use mp3/wav.` });
  if (sampleCount > VOICE_LIMITS.voiceAudio.maxFiles) issues.push({ code: 'too_many', field: 'voiceAudio', message: `Up to 3 voice samples (got ${sampleCount}).` });
  const cap = voiceCapsOf(provider);
  if (cap) {
    // a model's own voices / spoken language (Qwen3 TTS): unknown values → 400; sent to a model without them → 400 (nothing silently dropped)
    if (c.speaker && !cap.voices) issues.push({ code: 'unsupported', field: 'speaker', message: 'This model has no preset voices to pick from. Leave speaker empty or pick another model.' });
    else if (c.speaker && !cap.voices!.some((v) => v.id === c.speaker)) issues.push({ code: 'invalid', field: 'speaker', message: `speaker must be one of ${cap.voices!.map((v) => v.id).join(', ')}.` });
    if (c.speechLanguage && !cap.languages) issues.push({ code: 'unsupported', field: 'speechLanguage', message: 'This model has no language setting. Leave speechLanguage empty or pick another model.' });
    else if (c.speechLanguage && !cap.languages!.some((l) => l.value === c.speechLanguage)) issues.push({ code: 'invalid', field: 'speechLanguage', message: `speechLanguage must be one of ${cap.languages!.map((l) => l.value).join(', ')}.` });
    if (cap.maxChars && text && text.trim().length > cap.maxChars) issues.push({ code: 'too_long', field: 'prompt', message: `This model reads up to ${cap.maxChars.toLocaleString('en-US')} characters in one go (yours is ${text.trim().length.toLocaleString('en-US')}). Shorten the script or split it into parts.` });
    if (sampleCount > cap.maxVoiceSamples) issues.push({ code: 'unsupported', field: 'voiceAudio', message: cap.maxVoiceSamples ? `This model takes up to ${cap.maxVoiceSamples} voice samples.` : 'This model uses its own voices and does not take voice samples.' });
    const def: Record<string, any> = { voiceDetails: null, expression: 5, mood: 0, speed: 1, pitch: 0, volume: 100, outputFormat: 'mp3', sampleRate: 24000 };
    for (const k of ['voiceDetails', 'expression', 'mood', 'speed', 'pitch', 'volume', 'outputFormat'] as const)
      if (cap.controls[k].via === 'unsupported' && c[k] !== def[k] && !issues.some((i) => i.field === k)) issues.push({ code: 'unsupported', field: k, message: `This model has no ${k} control. Leave it at the default or pick another model.` });
  }
  if (issues.length) return { ok: false, issues };
  const native: Record<string, any> = {}; const post: Partial<VoiceControls> = {};
  const ctl = cap?.controls ?? ({ ...postAll } as any);
  if (ctl.expression?.via === 'native') native[ctl.expression.param] = ctl.expression.param === 'exaggeration' ? (c.expression <= 5 ? 0.25 + c.expression * 0.05 : 0.5 + (c.expression - 5) * 0.3) : Math.round((1 - c.expression / 10) * 100) / 100;
  if (ctl.mood?.via === 'native') native[ctl.mood.param] = c.mood < -0.33 ? 'angry' : c.mood > 0.33 ? 'happy' : 'neutral';
  if (ctl.voiceDetails?.via === 'native' && c.voiceDetails) native[ctl.voiceDetails.param] = c.voiceDetails; // Qwen3 TTS: the style instruction
  if (cap?.voices) native.speaker = c.speaker ?? cap.defaultVoice ?? cap.voices[0]?.id; if (cap?.languages) native.language = c.speechLanguage ?? cap.defaultLanguage ?? cap.languages[0]?.value;
  for (const k of ['speed', 'pitch', 'volume', 'sampleRate'] as const) {
    const s = ctl[k]; if (!s) continue;
    if (s.via === 'native' && !(k === 'sampleRate' && c.sampleRate === 48000)) native[s.param] = k === 'volume' ? c.volume / 100 : c[k];
    else if (s.via !== 'unsupported') (post as any)[k] = c[k];
  }
  if (ctl.outputFormat?.via !== 'unsupported') post.outputFormat = c.outputFormat; if (ctl.sampleRate?.via !== 'unsupported') post.sampleRate = c.sampleRate; // final encode always ours, so the file matches what was asked
  return { ok: true, controls: c, native, post };
}

/** atempo accepts 0.5–2 per instance; pitch = asetrate shift + tempo compensation (no rubberband dependency). */
export function postFilters(p: Partial<VoiceControls>, inRate = 48000): string[] {
  const f: string[] = [];
  if (p.pitch) { const r = Math.pow(2, p.pitch / 12); f.push(`asetrate=${Math.round(inRate * r)}`, `aresample=${inRate}`); let t = 1 / r; while (t < 0.5) { f.push('atempo=0.5'); t /= 0.5; } while (t > 2) { f.push('atempo=2'); t /= 2; } f.push(`atempo=${t.toFixed(4)}`); }
  if (p.speed && p.speed !== 1) f.push(`atempo=${p.speed}`);
  if (p.volume != null && p.volume !== 100) f.push(`volume=${(p.volume / 100).toFixed(2)}`);
  return f;
}
const CODEC = { mp3: ['-c:a', 'libmp3lame', '-b:a', '192k'], wav: ['-c:a', 'pcm_s16le'], opus: ['-c:a', 'libopus', '-b:a', '96k'] } as const;
export const extOf = (fmt: string) => (fmt === 'opus' ? 'ogg' : fmt);
const ff = (args: string[]) => new Promise<boolean>((res) => { const c = spawn('ffmpeg', ['-y', '-v', 'error', ...args]); c.on('close', (x) => res(x === 0)); c.on('error', () => res(false)); });

/** Applies the post controls to an audio file and re-encodes it; returns the new path (extension follows outputFormat). */
export async function applyVoicePost(file: string, p: Partial<VoiceControls>): Promise<string | null> {
  const fmt = (p.outputFormat ?? 'mp3') as keyof typeof CODEC; const out = file.replace(/\.[^.]+$/, `.${extOf(fmt)}`); const tmp = out + '.tmp.' + extOf(fmt);
  const af = postFilters(p, 48000);
  const ok = await ff(['-i', file, '-vn', '-af', ['aresample=48000', ...af, `aresample=${p.sampleRate ?? 24000}`].join(','), '-ar', String(p.sampleRate ?? 24000), ...CODEC[fmt], '-f', fmt === 'opus' ? 'ogg' : fmt, tmp]);
  if (!ok) { await unlink(tmp).catch(() => {}); return null; }
  await rename(tmp, out); if (out !== file) await unlink(file).catch(() => {});
  return out;
}

/** Joins up to 3 voice samples into one reference clip (for engines with a single reference input). */
export async function joinVoiceSamples(paths: string[], outDir: string, id: string): Promise<string | null> {
  if (paths.length <= 1) return paths[0] ?? null;
  const out = path.join(outDir, `${id}-voiceref.wav`);
  const ok = await ff([...paths.flatMap((p) => ['-i', p]), '-filter_complex', `${paths.map((_, i) => `[${i}:a]aresample=24000,aformat=channel_layouts=mono[a${i}]`).join(';')};${paths.map((_, i) => `[a${i}]`).join('')}concat=n=${paths.length}:v=0:a=1[o]`, '-map', '[o]', '-c:a', 'pcm_s16le', out]);
  return ok ? out : null;
}

/** Video mux path: same post controls on the result's audio track (video stream copied; voice length kept with apad). outputFormat doesn't apply to video. */
export async function applyVoicePostVideo(file: string, p: Partial<VoiceControls>): Promise<boolean> {
  const af = postFilters(p, 48000); const tmp = file.replace(/\.mp4$/, '.vpost.mp4');
  const ok = await ff(['-i', file, '-map', '0:v', '-map', '0:a', '-c:v', 'copy', '-af', ['aresample=48000', ...af, 'apad', `aresample=${p.sampleRate ?? 48000}`].join(','), '-shortest', '-c:a', 'aac', '-b:a', '192k', '-ar', String(p.sampleRate ?? 48000), '-movflags', '+faststart', tmp]);
  if (!ok) { await unlink(tmp).catch(() => {}); return false; }
  await rename(tmp, file); return true;
}

/** Before any backend runs (tool mock, native ComfyUI plan, hosted): re-check controls for the routed provider, set voiceNative, join samples. */
export async function voicePre(job: any, dataDir: string): Promise<boolean> {
  if (!job.input?.voiceFields) return true; // re-run per attempt: a fallback route may be a different engine
  const v = parseVoiceControls(job.input.voiceFields, job.provider || '', job.input.voiceSamplePaths?.length ?? 0, typeof job.input.prompt === 'string' ? job.input.prompt : undefined);
  if (!v.ok) { job.status = 'failed'; job.errorType = 'validation'; job.error = `${v.issues[0].message} Credits went back to your balance.`; return false; }
  Object.assign(job.input, { voiceNative: v.native, voicePost: v.post, voicePreDone: true });
  if (job.input.voiceSamplePaths?.length > 1 && !/-voiceref\.wav$/.test(job.input.voiceSamplePath ?? '')) { const j = await joinVoiceSamples(job.input.voiceSamplePaths, dataDir, job.id); if (j) job.input.voiceSamplePath = j; }
  return true;
}
/** After the backend finished: ffmpeg post (0 credits) on audio outputs, or on the audio track of muxed video outputs. */
export async function voicePostRun(job: any, dataDir: string) {
  const p = job.input?.voicePost; if (!p || job.status !== 'done' || job.input.voicePostDone) return; job.input.voicePostDone = true;
  job.status = 'running'; job.stage = 'finishing'; job.progress = 99; // hold 'done' until the files are final
  for (const o of job.outputs ?? []) {
    const f = path.join(dataDir, String(o.url).slice('/files/'.length));
    if (/\.(mp4|mov|webm)$/i.test(f)) { const vp = { ...p, sampleRate: job.input.voiceFields?.sampleRate ? p.sampleRate : undefined }; // video: keep the track's rate unless asked
      if (postFilters(vp).length || vp.sampleRate) await applyVoicePostVideo(f, vp); }
    else { const n = await applyVoicePost(f, p); if (n) o.url = `/files/${path.basename(n)}`; }
  }
  job.resultUrl = job.outputs?.[0]?.url ?? null; job.status = 'done'; job.stage = 'done'; job.progress = 100;
}

/** Adds validated controls to a parsed job input (for parsers that don't go through Voice Studio's wrapper, e.g. Talking photo). */
export function attachVoiceControls(r: any, fields: Record<string, string>, provider: string, samplePaths: string[] = []): any {
  const v = parseVoiceControls(fields, provider, samplePaths.length, fields.prompt);
  if (!v.ok) return { error: v.issues[0].message, issues: v.issues };
  return { ...r, voiceControls: v.controls, voiceNative: v.native, voicePost: v.post, voiceSamplePaths: samplePaths,
    voiceFields: voiceFieldsOf(fields) };
}
