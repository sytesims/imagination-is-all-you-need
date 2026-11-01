/** Which voice choices a model really offers, from the server's voiceCaps (tools/voice/voiceControls.ts). One rule for the Audio page and Voice Studio.
 *  - caps.noVoice: the model reads in its own voice and takes no voice (Seed Audio): no Voice control at all.
 *  - caps.builtinVoice: the engine has one voice of its own (Chatterbox voice changer): only "Built-in voice" and your sample, since every
 *    library voice would sound the same.
 *  - otherwise: the list as given (our voice library + your sample). */
export type VoiceOpt = { value: string; label: string; previewUrl?: string; hint?: string };
export const BUILTIN_VOICE_LABEL = 'Built-in voice';

export const takesVoicePick = (caps: any): boolean => caps?.noVoice !== true;
export const builtinVoiceOf = (caps: any): string | null => typeof caps?.builtinVoice === 'string' && caps.builtinVoice ? caps.builtinVoice : null;

/** The choices to show: for a one-voice engine, Built-in voice + the sample row (if the list had one); else the list unchanged. */
export function voiceChoicesFor<T extends VoiceOpt>(caps: any, opts: T[]): (T | VoiceOpt)[] {
  const b = builtinVoiceOf(caps); if (!b) return opts;
  return [{ value: b, label: BUILTIN_VOICE_LABEL, hint: 'The engine’s own voice' }, ...opts.filter(o => o.value === 'clone')];
}

/** The pick to show as selected: on a one-voice engine any library voice (an older or saved pick) is the built-in voice. */
export const shownVoiceFor = (caps: any, v: string): string => { const b = builtinVoiceOf(caps); return b && v !== 'clone' ? b : v; };

/** A voice clip's ▶ shows only for a real recording: a stand-in (placeholder tone, sampleKind 'standin') gets no button. */
export const showsSamplePlay = (url: string | null | undefined, kind: string | null | undefined): boolean => !!url && kind !== 'standin';
