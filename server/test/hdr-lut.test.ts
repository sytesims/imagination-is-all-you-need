// SDR→HDR LUT fallback (ffmpeg without zscale): .cube layout and the PQ / HLG code values at black and SDR white. Run: tsx test/hdr-lut.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'hdrlut-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
const { hdrLut, hdrArgsLut } = await import('../src/tools/editVideo/index.js');
const rows = (t: string) => t.trim().split('\n').filter((l) => /^[\d.]+ [\d.]+ [\d.]+$/.test(l)).map((l) => l.split(' ').map(Number));
const pq = rows(hdrLut({ strength: 0.5 }, 5));
assert.equal(pq.length, 125, '5³ entries');
assert.deepEqual(pq[0], [0, 0, 0].map((v) => +v.toFixed(6)).map(() => pq[0][0]), 'black is neutral');
assert.ok(pq[0][0] < 0.01, 'black ≈ PQ 0');
const white = pq[124]; assert.ok(white.every((v) => Math.abs(v - white[0]) < 0.002), 'SDR white stays neutral through the primaries matrix');
assert.ok(Math.abs(white[0] - 0.58) < 0.01, `SDR white at 200 nits ≈ PQ 0.58 (got ${white[0]})`);
const red = pq[4]; assert.ok(red[0] > red[1] && red[0] > red[2], 'red stays red (first index is red, fastest)');
const hlg = rows(hdrLut({ hlg: true, strength: 0.5 }, 5)); assert.ok(Math.abs(hlg[124][0] - 0.75) < 0.02, `HLG SDR white ≈ 0.75 (BT.2408) (got ${hlg[124][0]})`);
const a = hdrArgsLut('in.mp4', 'out.mp4', "/tmp/it's.cube", { hlg: true }); const vf = a[a.indexOf('-vf') + 1];
assert.match(vf, /lut3d=file='\/tmp\/it\\'s\.cube'/); assert.ok(a.includes('arib-std-b67'));
console.log('hdr-lut.test: all passed');
