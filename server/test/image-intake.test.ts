// Create Image intake (2026-10-22): where an image lands when it enters Create Image with a workflow picked (web/src/shared/imageIntake.ts).
// Covers: placeIncoming (only empty slot → it; several empty → ask; all full → ask, or replace a single-slot workflow), against the real recipes
// (server/src/shared/workflows.ts: Face Swap Target + Face, Relight Photo); workflowAfterNav (Reference keeps the workflow, Edit / Send to / plain
// Recreate go back to Create, ?workflow= wins, a plain link keeps what is picked).
// Run: npx tsx test/image-intake.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { placeIncoming, workflowAfterNav } from '../../web/src/shared/imageIntake.ts';
import { imageWorkflowsPayload } from '../src/shared/workflows.ts';
const ok = (m: string) => console.log('ok ' + m);

const all = (imageWorkflowsPayload(() => undefined) as any).workflows as any[];
const fs = all.find((r) => r.id === 'face-swap'); const rl = all.find((r) => r.id === 'relight');
assert.ok(fs && rl, 'face-swap and relight recipes exist');
const filled = (...names: string[]) => (n: string) => names.includes(n);

// ---- placeIncoming ----
assert.deepEqual(placeIncoming(fs.slots, filled()), { kind: 'ask', slots: ['image', 'face'] }, 'Face Swap, both empty: ask Target or Face (bar order)');
assert.deepEqual(placeIncoming(fs.slots, filled('image')), { kind: 'slot', slot: 'face', replaced: false }, 'Target filled: the face slot');
assert.deepEqual(placeIncoming(fs.slots, filled('face')), { kind: 'slot', slot: 'image', replaced: false }, 'Face filled: the target slot');
assert.deepEqual(placeIncoming(fs.slots, filled('image', 'face')), { kind: 'ask', slots: ['image', 'face'] }, 'both filled: ask which to replace, never a silent drop');
ok('placeIncoming on Face Swap');
assert.deepEqual(placeIncoming(rl.slots, filled()), { kind: 'slot', slot: 'image', replaced: false }, 'Relight empty: its photo');
assert.deepEqual(placeIncoming(rl.slots, filled('image')), { kind: 'slot', slot: 'image', replaced: true }, 'Relight full: replace (one slot, nothing to ask)');
assert.deepEqual(placeIncoming([], filled()), { kind: 'none' }, 'no slots (Camera Lens): nothing');
assert.deepEqual(placeIncoming([{ name: 'b', label: 'B', order: 2 }, { name: 'a', label: 'A', order: 1 }], filled()), { kind: 'ask', slots: ['a', 'b'] }, 'slot order, not array order');
ok('placeIncoming on Relight and edge cases');
// 2026-10-23: Brush Edit and Camera Angles take an incoming photo in their one slot; Camera & Lens has none (the image goes to Create's photos)
for (const id of ['brush-edit', 'camera-angles']) { const r = all.find((x) => x.id === id); assert.equal(r.status, 'ready', `${id} ready`);
  assert.deepEqual(placeIncoming(r.slots, filled()), { kind: 'slot', slot: 'image', replaced: false }, `${id}: empty → its photo`);
  assert.deepEqual(placeIncoming(r.slots, filled('image')), { kind: 'slot', slot: 'image', replaced: true }, `${id}: full → replace`); }
{ const cl = all.find((x) => x.id === 'camera-lens'); assert.equal(cl.surface, 'rig'); assert.deepEqual(placeIncoming(cl.slots, filled()), { kind: 'none' }, 'Camera & Lens: no slot'); }
assert.equal(workflowAfterNav('?fromJob=j1&out=0&as=ref', 'camera-lens'), 'camera-lens', 'Reference keeps Camera & Lens');
assert.equal(workflowAfterNav('?workflow=brush-edit&fromJob=j1&out=0', 'relight'), 'brush-edit', 'the viewer\'s Inpaint row (redirected) picks Brush Edit');
assert.equal(workflowAfterNav('?workflow=camera-lens&recreate=j1', ''), 'camera-lens', 'a Camera & Lens Recreate picks it');
ok('placeIncoming / workflowAfterNav on Brush Edit, Camera Angles, Camera & Lens');

// ---- workflowAfterNav ----
assert.equal(workflowAfterNav('?fromJob=j1&out=0&as=ref', 'face-swap'), 'face-swap', 'Reference keeps the picked workflow');
assert.equal(workflowAfterNav('?fromJob=j1&out=0', 'face-swap'), '', 'Edit with a prompt / Send to Create Image: plain Create');
assert.equal(workflowAfterNav('?recreate=j1', 'relight'), '', 'Recreate of a plain Create job: plain Create');
assert.equal(workflowAfterNav('?workflow=relight&recreate=j1', ''), 'relight', 'a workflow Recreate picks that workflow');
assert.equal(workflowAfterNav('?workflow=face-swap', 'relight'), 'face-swap', '?workflow= wins');
assert.equal(workflowAfterNav('?refUrl=%2Ffiles%2Fj1-image0.png', 'upscale'), 'upscale', 'an input photo used as a reference (viewer Inputs row) keeps the workflow');
assert.equal(workflowAfterNav('?workflow=upscale&fromJob=j1&as=image', ''), 'upscale', 'the old Upscale page link (redirected) picks Upscale');
assert.equal(workflowAfterNav('', 'relight'), 'relight', 'a plain link keeps what is picked');
assert.equal(workflowAfterNav('?model=flux-3-klein', ''), '', 'a plain link in Create stays Create');
ok('workflowAfterNav');
