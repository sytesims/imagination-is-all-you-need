/**
 * Where each file you add on the Audio bar goes (2026-10-31, many references). The "+" row you picked wins: Voice sample sends every
 * sound to the samples, up to the model's limit; Audio file / Song file / Video fill that one slot. A drop (no row picked) fills the
 * clip first, then the voice samples, so a second sound never silently replaces the clip on Change voice.
 * Pure, so the routing is tested without the page (server/test/audio-intake.test.ts).
 */
export type AudioPick = 'video' | 'song' | 'clip' | 'sample';
export type AudioDest = 'video' | 'song' | 'clip' | 'sample' | 'over' | 'wrong';
export interface AudioIntakeCtx {
  /** the "+" row picked (none for a drop or the drop tile) */ want?: AudioPick | null;
  slots: { video: boolean; audio: boolean; voice: boolean }; cover: boolean; /** the clip may be an audio file (Change voice) */ clipIsAudio: boolean;
  hasClip: boolean; hasVideo: boolean; samples: number; maxSamples: number; /** a sample is being replaced (it fills that spot) */ replacing: boolean;
}

/** One destination per file (`kinds[i]`: 'audio' | 'video' | other). */
export function planAudioIntake(kinds: ('audio' | 'video' | 'other')[], c: AudioIntakeCtx): AudioDest[] {
  let samples = c.samples; let clip = c.hasClip || c.hasVideo; let replacing = c.replacing; let picked = false;
  const toSample = (): AudioDest => { if (replacing) { replacing = false; return 'sample'; } if (samples >= c.maxSamples) return 'over'; samples++; return 'sample'; };
  return kinds.map(k => {
    if (k === 'video') { if (!c.slots.video) return 'wrong'; clip = true; return 'video'; }
    if (k !== 'audio') return 'wrong';
    if (c.want === 'sample' && c.slots.voice && c.maxSamples > 0) return toSample();
    if (c.slots.audio && c.cover) return 'song';
    const canClip = c.slots.audio && c.clipIsAudio;
    /* the clip slot: when picked, or when it's still empty; else the samples take it; else the clip is replaced (said so) */
    if (canClip && ((c.want === 'clip' && !picked) || !clip)) { clip = true; picked = true; return 'clip'; }
    if (c.slots.voice && c.maxSamples > 0) return toSample();
    if (canClip) return 'clip';
    return 'wrong';
  });
}
