// Audio bar intake (web/src/ui/audio/audioIntake.ts, 2026-10-31): Change voice used to send every sound to the clip slot before the voice
// samples and ignored the "+" row you picked, so adding samples replaced the clip. Now the picked row wins, a drop fills the clip first then
// the samples, and the extras over the model's limit come back as 'over' (the bar says "N not added").
// Run: npx tsx test/audio-intake.test.ts
import assert from 'node:assert/strict';
import { planAudioIntake, type AudioIntakeCtx } from '../../web/src/ui/audio/audioIntake.js';

const CV: AudioIntakeCtx = { slots: { video: true, audio: true, voice: true }, cover: false, clipIsAudio: true, hasClip: true, hasVideo: false, samples: 0, maxSamples: 3, replacing: false };
const A = (n: number) => Array.from({ length: n }, () => 'audio' as const);

// the bug: clip on the bar, "+ → Voice sample", three sounds → three samples, the clip stays
assert.deepEqual(planAudioIntake(A(3), { ...CV, want: 'sample' }), ['sample', 'sample', 'sample']);
// a fourth past the limit: not added
assert.deepEqual(planAudioIntake(A(1), { ...CV, want: 'sample', samples: 3 }), ['over']);
assert.deepEqual(planAudioIntake(A(5), { ...CV, want: 'sample', samples: 1 }), ['sample', 'sample', 'over', 'over', 'over']);
// replacing a sample at the limit fills that spot
assert.deepEqual(planAudioIntake(A(1), { ...CV, want: 'sample', samples: 3, replacing: true }), ['sample']);
// a drop with no clip yet: the clip first, then the samples
assert.deepEqual(planAudioIntake(A(3), { ...CV, hasClip: false }), ['clip', 'sample', 'sample']);
// a drop with a clip already: samples (never a silent clip swap)
assert.deepEqual(planAudioIntake(A(2), CV), ['sample', 'sample']);
// "+ → Audio file" (or Replace on the clip): that one file is the clip, the rest go to the samples
assert.deepEqual(planAudioIntake(A(2), { ...CV, want: 'clip' }), ['clip', 'sample']);
// a model with its own voices (no samples): a second sound replaces the clip (the page says so)
assert.deepEqual(planAudioIntake(A(1), { ...CV, maxSamples: 0 }), ['clip']);
// videos go to the video slot; other files are wrong
assert.deepEqual(planAudioIntake(['video', 'other'], CV), ['video', 'wrong']);
// Cover: a sound is the song
assert.deepEqual(planAudioIntake(A(1), { ...CV, cover: true, slots: { video: false, audio: true, voice: false }, clipIsAudio: false }), ['song']);
console.log('ok audio intake: 10 cases');
