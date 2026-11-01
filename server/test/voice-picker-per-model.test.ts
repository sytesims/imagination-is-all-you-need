// The Voice control offers only what a model really does (audit Pass 3: P3-03, P3-04, P3-07, P3-08, P3-09). No server, no browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VOICE_CAPS, voiceCapsOf } from '../src/tools/voice/voiceControls.ts';
import { MODEL_CATALOG } from '../src/shared/modelCatalog.ts';
import { THREE_D_BEST_FOR } from '../src/shared/modelRank.ts';
import { takesVoicePick, builtinVoiceOf, voiceChoicesFor, shownVoiceFor, showsSamplePlay, BUILTIN_VOICE_LABEL } from '../../web/src/shared/voicePick.ts';

// P3-03: Seed Audio reads in its own voice, so it offers no Voice pick; every other voice model still does
assert.equal(takesVoicePick(voiceCapsOf('api-seed-audio')), false);
for (const id of Object.keys(VOICE_CAPS).filter(k => k !== 'api-seed-audio')) assert.equal(takesVoicePick(VOICE_CAPS[id]), true, id);
assert.equal(takesVoicePick(null), true); // unknown model / Auto: the list as before

// P3-04: the voice changer has one built-in voice; the picker offers it and your sample, not six library voices that sound the same
const vc = voiceCapsOf('comfy-chatterbox-vc');
assert.equal(builtinVoiceOf(vc), 'narrator-warm');
const library = ['narrator-warm', 'narrator-deep', 'bright', 'calm', 'news', 'story'].map(v => ({ value: v, label: v, previewUrl: `/x/${v}.mp3` }));
const all = [...library, { value: 'clone', label: 'Clone from a sample' }];
assert.deepEqual(voiceChoicesFor(vc, all).map(o => [o.value, o.label]), [['narrator-warm', BUILTIN_VOICE_LABEL], ['clone', 'Clone from a sample']]);
assert.equal(voiceChoicesFor(vc, all).some(o => o.previewUrl), false, 'a library clip is not the engine voice: no ▶');
assert.deepEqual(voiceChoicesFor(vc, library).map(o => o.value), ['narrator-warm'], 'no sample row when the list has none');
assert.equal(shownVoiceFor(vc, 'story'), 'narrator-warm'); assert.equal(shownVoiceFor(vc, 'clone'), 'clone');
// a TTS model keeps the whole library
assert.equal(voiceChoicesFor(voiceCapsOf('comfy-chatterbox'), all).length, all.length); assert.equal(shownVoiceFor(voiceCapsOf('comfy-chatterbox'), 'story'), 'story');
assert.match(MODEL_CATALOG['comfy-chatterbox-vc'].description, /its built-in voice or your sample/);
assert.doesNotMatch(MODEL_CATALOG['comfy-chatterbox-vc'].description, /library voice/);

// the pages use the shared rule (Audio page, Voice Studio) and skip voice samples for a no-voice model on submit
const web = (f: string) => readFileSync(new URL(`../../web/src/${f}`, import.meta.url), 'utf8');
assert.match(web('ui/audio/AudioPage.tsx'), /voiceOn = wf\.controls\.some\(c => c\.field === 'voice'\) && takesVoicePick\(vCaps\)/);
assert.match(web('ui/audio/AudioStudio.tsx'), /showVoice = p\.mode !== 'lipsync' && takesVoicePick\(caps\)/);
assert.match(web('tools/app/AppTool.tsx'), /=== 'clone' && takesVoicePick\(/);

// P3-07: a placeholder tone gets no ▶ button; a real recording does
assert.equal(showsSamplePlay('/a.mp3', 'standin'), false); assert.equal(showsSamplePlay('/a.mp3', 'real'), true); assert.equal(showsSamplePlay('/a.mp3', null), true); assert.equal(showsSamplePlay('', 'real'), false);
assert.match(web('tools/app/ChangeVoice.tsx'), /if \(!showsSamplePlay\(url, k\)\) return null;/);

// P3-08: Tripo 3.1 runs from a photo, views or a prompt; its line fits every mode
assert.doesNotMatch(THREE_D_BEST_FOR['cloud-tripo-31'], /one photo/);
assert.match(THREE_D_BEST_FOR['cloud-tripo-31'], /photo, views or a prompt/);

// P3-09: the Translate note names no fixed count or language the list may not show
const apps = readFileSync(new URL('../src/tools/apps.ts', import.meta.url), 'utf8');
assert.doesNotMatch(apps, /16 listed|Indonesian has no voice/);
assert.match(apps, /The language list shows what the chosen engine can voice/);
console.log('voice-picker-per-model: ok');
