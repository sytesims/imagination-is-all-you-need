// Talking Video Phase B (2026-10-27): LongCat-Video-Avatar 1.5, off by default, needs your own Comfy deployment. Pure checks only (no network).
//  1 longcatWindows: 3.72 s = 1 window (93 frames), 3.8 s = 2, 60 s = 1 + ceil((1500 − 93) / 80) = 19
//  2 probeLongCatCloud: false on our Comfy Cloud fixture (2026-10-26: no v1.5 node, no weights); true on a synthetic object_info with both nodes and the file
//  3 the flag is off unless OPENHIGGSFIELD_LONGCAT=1
// Run: npx tsx test/longcat-avatar.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const L = await import('../src/shared/longcatAvatar.ts');
const ok = (m: string) => console.log('ok ' + m);
assert.deepEqual([3.72, 3.8, 60].map((s) => L.longcatWindows(s).windows), [1, 2, 19]); assert.equal(L.longcatWindows(60).frames, 1500);
ok('windows: 3.72 s 1, 3.8 s 2, 60 s 19');
const cloud = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'object-info-comfy-cloud-2026-10-26.json'), 'utf8'));
const p0 = L.probeLongCatCloud(cloud); assert.equal(p0.ok, false); assert.ok(p0.missing.some((m) => /LongCatAvatarWhisperEmbeds/.test(m)) && p0.missing.some((m) => /LongCat-Avatar-15_bf16/.test(m)), p0.missing.join(', '));
const synth: Record<string, any> = Object.fromEntries(L.LONGCAT_NODES.map((n) => [n, { input: { required: {} } }]));
synth.WanVideoModelLoader = { input: { required: { model: [['wan2.1_i2v_480p_14B_fp16.safetensors', 'LongCat/LongCat-Avatar-15_bf16.safetensors']] } } };
assert.deepEqual(L.probeLongCatCloud(synth), { ok: true, missing: [] });
assert.equal(L.probeLongCatCloud({ ...synth, WanVideoModelLoader: { input: { required: { model: [['wan2.1_i2v_480p_14B_fp16.safetensors']] } } } }).ok, false, 'nodes without the file: not ok');
assert.equal(L.probeLongCatCloud(null).ok, false);
ok('probe: false on the Comfy Cloud fixture (no v1.5 node, no weights), true with the nodes + the bf16 file, false without the file');
assert.equal(L.longcatFlagOn({}), false); assert.equal(L.longcatFlagOn({ OPENHIGGSFIELD_LONGCAT: '1' }), true);
ok('flag: off by default');
