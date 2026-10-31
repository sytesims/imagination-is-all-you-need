// Create Image keeps the model you picked when you add a photo (2026-10-31, many references): picking Nano Banana 2 / 2.1, Seedream or GPT
// Image 2 and then uploading flipped the bar back to FLUX 3 Image. Two rules moved it: Create → Edit switched to the Edit default
// (web/src/shared/workflowDefaults.ts featureSwitchTo, read by ui/next/ImageCanvas.tsx), and the mode change (AppTool's mode effect) took
// the mode default. Both now keep a picked model that edits too. This pins the feature rule.
// Run: npx tsx test/image-keeps-pick.test.ts
import assert from 'node:assert/strict';
import { featureSwitchTo, type WfDefault } from '../../web/src/shared/workflowDefaults.js';
const D = (start: string): WfDefault => ({ id: start, start, setup: 'hosted', runs: true, reason: null, why: null, note: null });
const CREATE = D('api-flux3-image'); const EDIT_IDS = ['api-flux3-image', 'api-nano-banana-2', 'api-nano-banana-21', 'api-seedream-45', 'api-gpt-image-2'];
for (const m of ['api-nano-banana-2', 'api-nano-banana-21', 'api-seedream-45', 'api-gpt-image-2'])
  assert.equal(featureSwitchTo(m, m, EDIT_IDS, CREATE, 'api-flux3-image'), null, `${m}: your pick edits too, so it stays`);
assert.equal(featureSwitchTo('api-flux3-image', null, EDIT_IDS, CREATE, 'api-nano-banana-2'), 'api-nano-banana-2', 'on the Create default: moves to the Edit start');
assert.equal(featureSwitchTo('api-krea-3', 'api-krea-3', EDIT_IDS, CREATE, 'api-flux3-image'), 'api-flux3-image', 'your pick can’t edit: moves to the Edit start');
assert.equal(featureSwitchTo('api-qwen-image', null, EDIT_IDS, CREATE, 'api-flux3-image'), null, 'a link’s model stays');
console.log('ok image keeps your pick when a photo is added');
