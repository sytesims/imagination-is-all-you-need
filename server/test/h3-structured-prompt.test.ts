// A prompt already in MiniMax H3's structured format reaches the model as written: no "animate the image." in front (2026-10-27).
import assert from 'node:assert/strict';
import { structuredPrompt } from '../src/tools/media.ts';
assert.ok(structuredPrompt('For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\nintegrated_multimodal_description: [Shot 1] …'));
assert.ok(structuredPrompt('integrated_multimodal_description: [Shot 1] a cat'));
// the full-reference / multiframe format (Keyframes, docs.comfy.org minimax-h3-multiframe): subject_definitions: … detailed_description: …
assert.ok(structuredPrompt('subject_definitions:\n<Subject 1> is the woman in <Picture 1>.\n\nsummary:\n…\n\ndetailed_description:\n[Shot 1] The shot begins from <Picture 1>.'));
assert.ok(structuredPrompt('summary:\nA short film.\n\ndetailed_description:\n[Shot 1] a cat'));
assert.ok(!structuredPrompt('a detailed description of a cat'));
assert.ok(!structuredPrompt('a cat walks across a wall'));
assert.ok(!structuredPrompt('The target video shows a dog'));
console.log('ok structured H3 prompts go as written');
