// Card panel words (B6 / B12, 2026-10-31): a workflow's sound is named for what it is, and recipe workflows have their real names.
// Run: npx tsx test/canvas-panel-words.test.ts   (no server, no network, no browser)
import assert from 'node:assert/strict';
import { GEN_FLOWS, flowById, flowInfo, flowAudioKind } from '../../web/src/shared/genFlows.ts';

assert.equal(flowAudioKind(flowById('sfx')!), 'sfx');
assert.equal(flowAudioKind(flowById('voice')!), 'voice');
assert.equal(flowAudioKind(flowById('music')!), 'music');
// Add sound (MMAudio, video to sound) makes a sound effect bed, never "Music" by default
assert.equal(flowAudioKind(flowById('add-sound')!), 'sfx');
// a recipe workflow ("person-swap") takes the recipe's name and line, never its id
const rec = GEN_FLOWS.find(f => f.recipeId)!; assert.equal(rec.name, rec.id);
const named = flowInfo(rec, { tools: [], models: {}, recipes: [{ id: rec.recipeId, name: 'Swap a person', tagline: 'Put someone else in the shot', needs: '2 images', icon: 'user', runner: { toolId: 'create-image' } } as any] });
assert.deepEqual([named.name, named.tagline], ['Swap a person', 'Put someone else in the shot']);
console.log('canvas panel words: ok');
