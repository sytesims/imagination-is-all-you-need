// FLUX 3 Klein local multi-reference plan: 3 refs → multiref graph with 3 LoadImage nodes wired, unused 7 dropped. Run: npx tsx test/klein-multiref.test.ts
import assert from 'node:assert/strict';
import { buildPlan } from '../src/comfy/plans.js';
const refs = ['/tmp/a.png', '/tmp/b.png', '/tmp/c.png'];
const p = buildPlan({ id: 't', toolId: 'create-image', provider: 'comfy-flux3-klein', input: { mode: 'edit', prompt: 'combine', imagePath: refs[0], refPaths: refs, seed: 1 } } as any);
const g = p.passes[0].graph as Record<string, any>; assert.equal(p.passes[0].workflow, 'create-image-flux3klein-multiref-api.json');
const loads = Object.values<any>(g).filter((n) => n.class_type === 'LoadImage'); assert.equal(loads.length, 3);
assert.equal(Object.keys(g['17'].inputs).filter((k) => k.startsWith('images.')).length, 3); assert.equal(Object.keys(g['50'].inputs).filter((k) => k.startsWith('images.')).length, 3);
const one = buildPlan({ id: 't', toolId: 'create-image', provider: 'comfy-flux3-klein', input: { mode: 'edit', prompt: 'x', imagePath: refs[0], refPaths: [refs[0]] } } as any);
assert.equal(one.passes[0].workflow, 'create-image-flux3klein-edit-api.json');
console.log('klein multiref: 3 refs wired into ReferenceMultiLatent + upsampler batch; 1 ref keeps the edit graph');
