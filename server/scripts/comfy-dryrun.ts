/** Dry run of the ComfyUI prep (no Comfy calls): patched graphs → /tmp/oj-dry-*.json for validate-workflows.py; ffmpeg steps on a real clip. */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { planObjectSwap, patchGraph, convertTo16fps } from '../src/comfy/objectSwap.js';
import { planChunks, patchRestyle, restylePrompt, cutChunk, blendChunks, swatchPath } from '../src/comfy/restyle.js';
import { patchReshootLtx } from '../src/comfy/reshoot.js';
import { patchUpscale60 } from '../src/comfy/upscale.js';
import { mixPlan, FUN_CAMERA_PRESETS } from '../src/comfy/cameraPresets.js';
import { WORKFLOWS_DIR } from '../src/config.js';
const wf = (f: string) => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8'));
const out = (n: string, g: unknown) => writeFileSync(`/tmp/oj-dry-${n}.json`, JSON.stringify(g));

// Object Swap (incl. 4 refs)
for (const c of [{ name: 'swap-landscape-6s', duration: 6, width: 1280, height: 720, point: { x: 0.25, y: 0.6 }, refs: 1 },
  { name: 'swap-portrait-12s-4refs', duration: 12, width: 1080, height: 1920, point: { x: 0.5, y: 0.3 }, refs: 4 },
  { name: 'swap-long-40s-2refs', duration: 40, width: 1920, height: 1080, point: null, refs: 2 }]) {
  const plan = planObjectSwap(c);
  const g = patchGraph(JSON.parse(readFileSync(plan.file, 'utf8')), plan, { image: 'oj_ref.png', video: 'oj_source.mp4', prompt: 'replace the person', seed: 42, extraRefs: Array(c.refs - 1).fill('oj_ref.png') });
  out(c.name, g); console.log(c.name, `ext-${plan.ext}`, `${plan.width}x${plan.height}`, g['229'].inputs.coordinates, 'refs', c.refs);
}
// Restyle chunks (20 s @16 fps = 320 frames)
const chunks = planChunks(320); console.log('restyle chunks', JSON.stringify(chunks));
const rp = restylePrompt('watercolor', 'a dancer on a rooftop');
out('restyle-chunk0', patchRestyle(wf('restyle-api.json'), { video: 'oj_source.mp4', style: 'oj_ref.png', ...rp, seed: 7, width: 832, height: 464, length: chunks[0].length }));
out('restyle-promptonly', patchRestyle(wf('restyle-api.json'), { video: 'oj_source.mp4', style: null, prompt: 'neon noir', seed: 7, width: 832, height: 464, length: 81 }));
console.log('swatch', swatchPath('watercolor'), '| prompt:', rp.prompt);
// Re-shoot LTX per angle
for (const a of ['left side', 'low angle', 'close-up']) out(`reshoot-${a.replace(/ /g, '-')}`, patchReshootLtx(wf('reshoot-api.json'), { video: 'oj_source.mp4', startImage: 'oj_ref.png', prompt: 'a dancer', angle: a, seconds: 3, seed: 1 }));
// Upscale 60 fps
out('upscale60-24fps', patchUpscale60(wf('upscale-60fps-api.json'), 24));
// Camera presets
console.log('camera presets mapped', Object.keys(FUN_CAMERA_PRESETS).length, '| mix orbit+snap-zoom+ltx-jib-up:', JSON.stringify(mixPlan(['orbit', 'snap-zoom', 'ltx-jib-up'], 5)));
// ffmpeg: 16 fps convert, cut chunks and xfade-blend them back (stand-in for VACE outputs)
const src = process.argv[2];
if (src) {
  const p = planObjectSwap({ duration: 20, width: 1280, height: 720 }); const s16 = await convertTo16fps(src, '/tmp/oj-dry-16fps.mp4', p);
  const cs = planChunks(Math.round(Math.min(20, Number(process.argv[3] || 6)) * 16));
  const files = []; for (let i = 0; i < cs.length; i++) { const f = `/tmp/oj-dry-chunk${i}.mp4`; if (await cutChunk(s16, f, cs[i])) throw new Error('cut'); files.push(f); }
  if (await blendChunks(files, cs, '/tmp/oj-dry-blend.mp4')) throw new Error('blend');
  console.log('blended', cs.length, 'chunks', JSON.stringify(cs), '-> /tmp/oj-dry-blend.mp4');
}
