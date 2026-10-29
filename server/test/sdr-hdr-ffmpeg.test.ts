// SDR→HDR: the real ffmpeg chain (tools/editVideo hdrArgs) on CPU. Untagged and BT.709-tagged 1 s clips (with audio) → HDR10 (PQ) and HLG:
// exit 0, HEVC 10-bit, BT.2020 primaries / bt2020nc matrix / smpte2084 or arib-std-b67 transfer, audio kept, same duration.
// Skips (exit 0, "skip") when ffmpeg / ffprobe or the zscale / libx265 support is missing. Run: npx tsx test/sdr-hdr-ffmpeg.test.ts
import assert from 'node:assert/strict'; import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const has = (bin: string, a: string[], want?: RegExp) => { const r = spawnSync(bin, a, { encoding: 'utf8' }); return r.status === 0 && (!want || want.test(r.stdout + r.stderr)); };
if (!has('ffmpeg', ['-hide_banner', '-filters'], /\bzscale\b/) || !has('ffmpeg', ['-hide_banner', '-encoders'], /libx265/) || !has('ffprobe', ['-version'])) { console.log('skip sdr-hdr-ffmpeg: ffmpeg with zscale + libx265 (and ffprobe) not found'); process.exit(0); }
process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'hdr-')); process.env.OPENHIGGSFIELD_DATA_DIR = D;
const { hdrArgs } = await import('../src/tools/editVideo/index.js');
const ff = (a: string[]) => { const r = spawnSync('ffmpeg', a, { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const probe = (f: string) => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f], { encoding: 'utf8' }).stdout);
try {
  const untagged = path.join(D, 'untagged.mp4'); const tagged = path.join(D, 'bt709.mp4');
  ff(['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24', '-f', 'lavfi', '-i', 'sine=d=1', '-t', '1', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', untagged]);
  ff(['-y', '-v', 'error', '-i', untagged, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-c:a', 'copy', tagged]);
  for (const src of [untagged, tagged]) for (const hlg of [false, true]) {
    const out = path.join(D, `${path.basename(src, '.mp4')}-${hlg ? 'hlg' : 'pq'}.mp4`);
    const r = spawnSync('ffmpeg', hdrArgs(src, out, { hlg, strength: 0.5 }), { encoding: 'utf8' }); assert.equal(r.status, 0, `${path.basename(out)}: ${r.stderr}`);
    const p = probe(out); const v = p.streams.find((s: any) => s.codec_type === 'video'); const a = p.streams.find((s: any) => s.codec_type === 'audio');
    assert.equal(v.codec_name, 'hevc'); assert.equal(v.pix_fmt, 'yuv420p10le'); assert.equal(v.color_primaries, 'bt2020'); assert.equal(v.color_space, 'bt2020nc');
    assert.equal(v.color_transfer, hlg ? 'arib-std-b67' : 'smpte2084'); assert.ok(a, 'audio kept'); assert.ok(Math.abs(Number(p.format.duration) - 1) < 0.2, `duration ${p.format.duration}`);
    console.log(`ok ${path.basename(src)} → ${hlg ? 'HLG' : 'HDR10 PQ'}: hevc 10-bit, bt2020 / ${v.color_transfer}, audio kept`);
  }
  console.log('ALL OK sdr-hdr-ffmpeg');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
