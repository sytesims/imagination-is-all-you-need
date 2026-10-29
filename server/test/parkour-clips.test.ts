// Our parkour clips (2026-10-26; web/public/models/mannequin/parkour.glb + web/src/shared/previz/parkourClips.ts + parkour.ts).
// Covers: the GLB holds exactly the listed clips with matching lengths, only body-bone channels (no fingers / scale), root motion that ends
// where the list says; the list is well formed (unique ids and keys, keys clear of the actor's own keys, contacts inside the clip); and the
// root-motion sampler and pickParkour.
// Run: npx tsx test/parkour-clips.test.ts   (pure: reads files, no server)
import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)); const web = path.resolve(here, '../../web');
const { PARKOUR_CLIPS } = await import('../../web/src/shared/previz/parkourClips.ts');
const { sampleRoot, pickParkour, clipInfo } = await import('../../web/src/shared/previz/parkour.ts');
const ok = (m: string) => console.log('ok ' + m);

// ---- 1. the GLB ----
const buf = fs.readFileSync(path.join(web, 'public/models/mannequin/parkour.glb'));
assert.equal(buf.readUInt32LE(0), 0x46546c67, 'a GLB'); const jl = buf.readUInt32LE(12); const gl = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
const names = gl.animations.map((a: any) => a.name).sort(); assert.deepEqual(names, PARKOUR_CLIPS.map((c) => c.id).sort(), 'the file has exactly the listed clips'); ok('clips match the list');
assert.ok(!gl.meshes?.length && !gl.skins?.length, 'animation only: no mesh, no skin'); ok('no mesh');
for (const a of gl.animations) {
  const c = PARKOUR_CLIPS.find((x) => x.id === a.name)!;
  const max = Math.max(...a.samplers.map((s: any) => gl.accessors[s.input].max[0]));
  assert.ok(Math.abs(max - c.seconds) < 0.05, `${c.id}: length ${max} vs ${c.seconds}`);
  for (const ch of a.channels) { const n = gl.nodes[ch.target.node].name as string;
    assert.notEqual(ch.target.path, 'scale', `${c.id}: no scale channels`); assert.ok(!/^(index|middle|pinky|ring|thumb)_/.test(n), `${c.id}: no finger channels (${n})`);
    if (ch.target.path === 'translation') assert.ok(n === 'root' || n === 'pelvis', `${c.id}: only root / pelvis move (${n})`); }
  assert.ok(a.channels.some((ch: any) => ch.target.path === 'translation' && gl.nodes[ch.target.node].name === 'root'), `${c.id}: has root motion`);
}
ok('lengths, channels and root motion');

// ---- 2. the list ----
const ids = new Set(PARKOUR_CLIPS.map((c) => c.id)); assert.equal(ids.size, PARKOUR_CLIPS.length, 'unique ids');
const keys = new Set(PARKOUR_CLIPS.map((c) => c.key)); assert.equal(keys.size, PARKOUR_CLIPS.length, 'unique keys');
const taken = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyZ', 'KeyX', 'KeyR', 'KeyF', 'KeyV'];
for (const c of PARKOUR_CLIPS) {
  assert.ok(!taken.includes(c.key), `${c.id}: key ${c.key} is free in game mode`);
  assert.equal(c.fps, 30); assert.ok(Math.abs(c.seconds - c.frames / c.fps) < 1e-3, `${c.id}: seconds = frames / fps`);
  for (const v of Object.values(c.contacts).flat()) assert.ok(v >= 0 && v <= c.frames, `${c.id}: contact frame ${v} inside the clip`);
  assert.ok(c.move[0] > 1, `${c.id}: moves forward`);
  for (const b of c.props) for (const r of [b.f, b.u, b.l]) assert.ok(r[0] < r[1], `${c.id}: prop ranges are low → high`);
}
ok('list is well formed');

// ---- 3. helpers ----
const k = [[0, 0, 0, 0], [1, 2, 1, -1], [2, 4, 1, -2]];
assert.deepEqual(sampleRoot(k, -1), [0, 0, 0]); assert.deepEqual(sampleRoot(k, 5), [4, 1, -2]); assert.deepEqual(sampleRoot(k, 0.5), [1, 0.5, -0.5]); assert.deepEqual(sampleRoot([], 1), [0, 0, 0]);
ok('sampleRoot clamps and interpolates');
assert.equal(pickParkour('rail', 1.0)?.id, 'vault'); assert.equal(pickParkour('ledge', 1.9)?.id, 'climb'); assert.equal(pickParkour('ledge', 3.5), null); assert.equal(pickParkour('nothing', 1), null);
ok('pickParkour by kind and height');
const tr = { name: 'root.position', times: [0, 2], values: [0, 0, 0, -0.5, 0.25, 3] };
const ci = clipInfo({ name: '02_a_person_jumps_happily', duration: 2, tracks: [tr] });
assert.equal(ci.label, 'Jumps happily'); assert.equal(ci.frames, 60); assert.deepEqual(ci.move, [3, 0.25, -0.5]); assert.equal(ci.key, '');
ok('clipInfo for a loaded file: readable name, length, root motion');
