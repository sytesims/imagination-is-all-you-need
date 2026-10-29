import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { modelNavigationHref } from '../../web/src/shared/modelNavigation.ts';

const tool = (id: string, providerModes: Record<string, string[]>, route = `/tools/${id}`) => ({ id, route, app: { providerModes } } as any);
const model = (key: string, ...engines: string[]) => ({ key, engines });
assert.equal(modelNavigationHref(tool('audio', { eleven: ['sfx'] }), model('elevenlabs-sound-effects', 'eleven')), '/tools/audio?workflow=sfx&model=elevenlabs-sound-effects');
assert.equal(modelNavigationHref(tool('audio', { speech: ['voice'] }), model('speech', 'speech')), '/tools/audio?workflow=voiceover&model=speech');
assert.equal(modelNavigationHref(tool('audio', { seed: ['music', 'sfx', 'voice'] }), model('seed', 'seed')), '/tools/audio?workflow=music&model=seed');
assert.equal(modelNavigationHref(tool('voice', { vc: ['change-voice'] }), model('voice-change', 'vc')), '/tools/audio?workflow=change-voice&model=voice-change');
assert.equal(modelNavigationHref(tool('voice', { infinite: ['lipsync'] }), model('infinitetalk', 'infinite')), '/tools/h3-video?workflow=lip-sync&mode=lipsync&model=infinitetalk');
assert.equal(modelNavigationHref(tool('soundtrack', { mma: ['v2s'] }), model('mmaudio', 'mma')), '/tools/audio?workflow=soundtrack-sound&model=mmaudio');
assert.equal(modelNavigationHref(tool('create-image', {}), model('image key', 'image')), '/tools/create-image?model=image%20key');
assert.equal(modelNavigationHref(tool('three-d', {}, '/tools/3d?workflow=turntable'), model('3d', '3d')), '/tools/3d?workflow=turntable&model=3d');
assert.equal(modelNavigationHref(tool('audio', {}), model('unknown', 'unknown')), '/tools/audio?model=unknown');
// Dynamic page state must not survive a different model id (missing → valid used to retain the old error).
const app = readFileSync(new URL('../../web/src/App.tsx', import.meta.url), 'utf8');
assert.match(app, /<ModelPage key=\{path\} id=/);
assert.match(app, /<SharePage key=\{path\} token=/);
console.log('model-navigation: compatible audio modes, lip sync, unchanged other media, keyed model detail: PASS');
