/**
 * ComfyUI plans for the H3 additions (our graphs from scripts/build-h3-workflows.py; fixed node ids: 5 noise, 7 seconds, 9/10 width/height,
 * 11 steps, 20 H3 conditioning node, 30+ LoRA chain, 40 LoadVideo, 50/51 LoadImage, 52 LoadAudio, 18 SaveVideo). Rules from rules.ts
 * are applied here: seconds → 17n+5 frames (in-graph formula), sizes via h3Size (x32, ≤ 1344×768), LoRA family checked before running.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORKFLOWS_DIR } from '../../config.js';
import type { Plan, FileRef } from '../../comfy/plans.js';
import { h3Size, h3Frames, sizeIssues, loraIssues } from './rules.js';
import { pikaPlan } from '../../comfy/pikaH3Flex.js';
import { H3_INTENSITY, H3_CAMERA_MOVES, H3_EXTEND_OVERLAP_FRAMES, cameraPrompt, type H3Intensity } from './catalog.js';
const F = (p: string): FileRef => ({ __file: p });
interface Job { id: string; toolId: string; provider: string; input: Record<string, any> }
const wf = (f: string) => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8'));
const seedOf = (s: unknown) => (Number.isInteger(s) ? Math.abs(Number(s)) % 2 ** 32 : 42);
function common(g: any, i: Record<string, any>, seconds: number) {
  const { width, height } = h3Size(i.aspect ?? '16:9', i.draft ? '480p' : i.resolution ?? '768p');
  const bad = sizeIssues(width, height); if (bad.length) throw new Error(bad[0]);
  g['9'].inputs.value = width; g['10'].inputs.value = height; g['7'].inputs.value = seconds; g['5'].inputs.noise_seed = seedOf(i.seed);
  const loras = Object.values<any>(g).filter((n) => n.class_type === 'LoraLoaderModelOnly').map((n) => ({ file: n.inputs.lora_name }));
  const lbad = loraIssues(g['1'].inputs.unet_name, loras); if (lbad.length) throw new Error(lbad[0]);
  return { width, height, frames: h3Frames(seconds) };
}
const plan = (job: Job, workflow: string, g: any, label: string, expect: Record<string, any>, prep?: any[]): Plan =>
  ({ tool: job.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false, notes: [], passes: [{ label, workflow, graph: g, output: '18', expect, ...(prep ? { prep } : {}) }] });
/** Extend's context (shared by the local graph and its Comfy Cloud twin, comfy/h3ExtendCloud.ts): the source's last H3_EXTEND_OVERLAP_FRAMES frames
 *  (`tail`, a clip of exactly those frames with their sound) anchored at frame 0 by MiniMaxH3AddGuide (node 21: picture 42 + sound 43), so motion
 *  and sound continue; the graph renders the overlap + the new seconds (node 7, on H3's 17k + 5 grid in node 8). */
export function patchH3Extend(g: any, a: { prompt: string; tail: FileRef; seconds: number }) {
  const C = H3_EXTEND_OVERLAP_FRAMES; const ov = C / 24;
  g['20'].inputs.prompt = a.prompt; g['40'].inputs.file = a.tail; g['42'].inputs.batch_index = 0; g['42'].inputs.length = C;
  g['43'].inputs.start_index = -ov; g['43'].inputs.duration = ov; g['7'].inputs.value = a.seconds + ov;
}
/** Which jobs these builders own (checked before the generic BUILDERS in comfy/plans.ts). */
export function h3Owns(j: Job): boolean {
  if (j.toolId === 'h3-video' && j.provider === 'comfy-h3-pika') return true; // Pika H3 Flex on your ComfyUI (comfy/pikaH3Flex.ts)
  if (j.toolId === 'h3-video' && j.provider === 'comfy-h3') return j.input.mode === 'flf' || (j.input.mode === 't2v' && j.input.quality === 'fast');
  if (j.toolId === 'voice') return j.provider === 'comfy-h3-lipsync' && j.input.mode === 'lipsync';
  if (j.toolId === 'camera') return j.provider === 'comfy-h3-camera';
  if (j.toolId === 'h3-extend') return j.provider === 'comfy-h3-extend';
  if (j.toolId === 'restyle') return j.provider === 'comfy-h3-restyle' || j.provider === 'comfy-h3-vfx';
  return false;
}
export function h3BuildPlan(j: Job): Plan {
  const i = j.input; const prompt = String(i.finalPrompt ?? i.prompt ?? '');
  if (j.toolId === 'h3-video' && j.provider === 'comfy-h3-pika') return pikaPlan(j, 'local');
  if (j.toolId === 'h3-video') {
    const file = i.mode === 'flf' ? (i.quality === 'fast' ? 'h3-flf-fast-api.json' : 'h3-flf-api.json') : 'h3-t2v-fast-api.json';
    const g = wf(file); const c = common(g, i, Number(i.duration) || 6); g['20'].inputs.prompt = prompt;
    if (i.mode === 'flf') { g['50'].inputs.image = F(i.imagePath); g['51'].inputs.image = F(i.lastFramePath); }
    return plan(j, file, g, 'Result', { prompt, seconds: Number(i.duration) || 6, fps: 24, ...c, quality: i.quality ?? 'quality', steps: g['11'].inputs.value });
  }
  if (j.toolId === 'voice') {
    const g = wf('h3-lipsync-api.json'); const secs = Math.min(15, Math.max(2, Number(i.duration) || 5)); const c = common(g, { ...i, aspect: i.aspect ?? '9:16' }, secs);
    g['50'].inputs.image = F(i.imagePath); g['52'].inputs.audio = F(i.speechPath); if (prompt.trim()) g['20'].inputs.prompt = `${g['20'].inputs.prompt} ${prompt}`;
    return plan(j, 'h3-lipsync-api.json', g, 'Talking photo', { seconds: secs, ...c, steps: 6 });
  }
  if (j.toolId === 'camera') {
    const g = wf('h3-camera-motion-api.json'); const move = H3_CAMERA_MOVES.find((m) => m[0] === (i.types?.[0] ?? '')) ?? H3_CAMERA_MOVES[0];
    const it: H3Intensity = (i.fields?.intensity ?? i.intensity) === 'aggressive' ? 'aggressive' : 'slow'; const secs = Number(i.duration) || 5; const c = common(g, i, secs);
    g['30'].inputs.strength_model = H3_INTENSITY[it].strength; g['50'].inputs.image = F(i.imagePath); g['20'].inputs.prompt = cameraPrompt(move[2], it, i.prompt ?? '');
    return plan(j, 'h3-camera-motion-api.json', g, move[1], { move: move[0], intensity: it, loraStrength: H3_INTENSITY[it].strength, seconds: secs, ...c });
  }
  if (j.toolId === 'h3-extend') {
    const g = wf('h3-extend-api.json'); const add = Number(i.extendSeconds) === 10 ? 10 : 5; const ov = H3_EXTEND_OVERLAP_FRAMES / 24;
    const c = common(g, i, add + ov); const tail = path.join(path.dirname(i.videoPath), `${j.id}-h3tail.mp4`); patchH3Extend(g, { prompt, tail: F(tail), seconds: add });
    return plan(j, 'h3-extend-api.json', g, `+${add}s`, { extendSeconds: add, overlapFrames: H3_EXTEND_OVERLAP_FRAMES, ...c },
      [{ kind: 'fps', src: i.videoPath, out: tail, fps: 24, width: c.width, height: c.height, start: Math.max(0, (Number(i.sourceSeconds) || 0) - ov), seconds: ov }]);
  }
  // restyle: style_transfer (style ref image) or vfx_edit; local only (licence), source clip ≤ 15 s per pass
  const vfx = j.provider === 'comfy-h3-vfx'; const file = vfx ? 'h3-vfx-edit-api.json' : 'h3-style-transfer-api.json'; const g = wf(file);
  const secs = Math.min(15, Number(i.duration) || 5); const c = common(g, i, secs); g['40'].inputs.file = F(i.videoPath);
  if (!vfx) { const ref = i.refPaths?.[0]; if (ref) g['50'].inputs.image = F(ref); else { delete g['50']; delete g['20'].inputs['ref_images.ref_image_0']; } }
  const trig = vfx ? 'vfx_edit: ' : 'style_transfer: '; g['20'].inputs.prompt = `${trig}${prompt || g['20'].inputs.prompt.replace(trig, '')}`;
  return plan(j, file, g, vfx ? 'Video FX' : 'Restyle', { seconds: secs, ...c, lora: vfx ? 'vfx_edit' : 'style_transfer' });
}
