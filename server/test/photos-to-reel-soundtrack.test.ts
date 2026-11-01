import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const preview = path.resolve(import.meta.dirname, '../../.preview');
fs.mkdirSync(preview, { recursive: true });
const dir = fs.mkdtempSync(path.join(preview, 'reel-soundtrack-'));
const empty = path.join(dir, 'empty.env'); fs.writeFileSync(empty, '');
Object.assign(process.env, { OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_ENV_FILE: empty,
  OPENHIGGSFIELD_DATA_DIR: dir, COMFY_BASE_URL: 'http://127.0.0.1:9', OPENHIGGSFIELD_COMFY_DETECT_URLS: 'http://127.0.0.1:9' });
const { renderMockOutput } = await import('../src/tools/shared.js');

for (const [width, height] of [[319, 241], [241, 319], [320, 240], [240, 320]]) {
  const src = path.join(dir, `${width}-${height}.mkv`), out = path.join(dir, `${width}-${height}.mp4`);
  const fixture = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc=size=${width}x${height}:rate=12`, '-t', '1', '-c:v', 'ffv1', '-pix_fmt', 'bgr0', src]);
  assert.equal(fixture.status, 0, String(fixture.stderr));
  await renderMockOutput({ toolId: 'app-music-bed', input: { outKind: 'soundtrack', videoPath: src,
    duration: 1, audioKind: 'music', resolution: '720p', seed: 42, mix: 'replace', hasAudio: false } } as any, 0, out);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,pix_fmt:format=duration', '-of', 'json', out], { encoding: 'utf8' });
  assert.equal(probe.status, 0, probe.stderr);
  const media = JSON.parse(probe.stdout), video = media.streams.find((s: any) => s.codec_type === 'video');
  assert.equal(video.width, Math.ceil(width / 2) * 2, 'pad only the odd edge; never resize to landscape');
  assert.equal(video.height, Math.ceil(height / 2) * 2);
  assert.equal(video.pix_fmt, 'yuv420p');
  assert.ok(media.streams.some((s: any) => s.codec_type === 'audio'), 'generated music survives mux');
  assert.ok(Math.abs(Number(media.format.duration) - 1) < 0.2);
}
console.log('PASS: mock soundtrack preserves portrait/landscape frames, pads odd edges, and keeps music and duration');
