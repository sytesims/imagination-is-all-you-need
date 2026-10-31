/**
 * MiniMax H3 Keyframes · Comfy Cloud (2026-10-27): the official Comfy template "MiniMax H3: Multiframe Reference" (video_minimax_h3_multiframe_reference,
 * Comfy-Org/workflow_templates, MIT) on shared Comfy Cloud, as the "Keyframes" mode of the MiniMax H3 card on Generate Video (a B6 twin route of
 * comfy-h3: routing/routes.ts TWINS, provider cloud-h3-keyframes, route comfy-cloud:cloud-h3-keyframes; standalone entry in comfy/cloudWorkflows.ts).
 * The user gives 2–5 stills, each with its time in the clip, and a prompt; H3 makes one shot that passes through those frames.
 * Graph (workflows/cloud/h3-multiframe-api.json, converted with scripts/ui2api.py, template node ids kept): MiniMax H3 Ref2VA int8 + the template's
 * optional turbo 4-step LoRA behind its switch (Fast = on, 4 steps; Quality = off, 20 steps), res_multistep / simple, cfg 1 (BasicGuider), 24 fps.
 * One change: the video VAE is minimax_h3_video_vae_fp16 (the template's int8 ConvRot VAE is not in Comfy Cloud's library; fp16 is, as in cloud/h3-*-api.json).
 * How the frames go in, as the template and its tutorial (docs.comfy.org/tutorials/video/minimax/minimax-h3-multiframe) do it:
 *  - frame 1 is the first ref_images input (<Picture 1>): the identity lock and the clip's first frame (the template has no guide at 0 s);
 *  - every later frame is one "Add Guide for MiniMax H3" block (LoadImage + seconds + round(a * 24) + MiniMaxH3AddGuide), positive chained in series into
 *    the BasicGuider, latent and both VAEs from the Reference to Video node. The template ships three blocks; the plan drops the unused ones or clones the
 *    last one for a fourth (5 frames in all);
 *  - every later frame is ALSO plugged into the next ref_images slot, the tutorial's own tip ("Plug them into extra ref_images slots too if the prompt
 *    should see them as <Picture N>"), so <Picture N> (or @imageN) in the prompt is frame N, as the official multi-shot prompt format expects.
 * Frame index = round(seconds × 24), kept inside the generated length (H3's 17k + 5 grid: 5 s = 124 frames).
 * Checked against Comfy Cloud's object_info of 2026-10-26: every class and model file is in the shared library, so no import and no preflight.
 * Price: an estimate from GPU time (hostedPrices.ts cloud-h3-keyframes, priceUnmeasured) until one measured run sets it. Unverified until a first run.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORKFLOWS_DIR } from '../config.js';
import { imageDimsOfFile } from '../imageDims.js';
import { pruneUnreachable, type Plan } from './plans.js';
import { RESOLUTION_SELECTOR_ASPECTS, resolutionSelectorAspect } from './resolutionSelector.js';
import { H3KF_MODE, H3KF_MIN_FRAMES, H3KF_MAX_FRAMES, H3KF_SECONDS, H3KF_RESOLUTIONS, H3KF_MP, H3KF_FPS, H3KF_STEP, h3kfLength, h3kfFrameIndex, spreadTimes, keyframeTimesIssue, parseKeyframeTimes, jobModeOf } from '../shared/h3Keyframes.js';
export { H3KF_MODE, H3KF_MIN_FRAMES, H3KF_MAX_FRAMES, H3KF_SECONDS, H3KF_RESOLUTIONS, H3KF_MP, H3KF_FPS, H3KF_STEP, h3kfLength, h3kfFrameIndex, spreadTimes, keyframeTimesIssue, parseKeyframeTimes, jobModeOf };

export const H3KF_PROVIDER = 'cloud-h3-keyframes';
export const H3KF_ROUTE = `comfy-cloud:${H3KF_PROVIDER}`;
export const H3KF_NAME = 'MiniMax H3 Keyframes · Comfy Cloud';
export const H3KF_GRAPH = 'cloud/h3-multiframe-api.json';
export const H3KF_TEMPLATE = 'video_minimax_h3_multiframe_reference';
export const H3KF_TEMPLATE_URL = `https://github.com/Comfy-Org/workflow_templates/blob/main/templates/${H3KF_TEMPLATE}.json`;
export const H3KF_DOCS = 'https://docs.comfy.org/tutorials/video/minimax/minimax-h3-multiframe';
export const H3KF_LICENCE_URL = 'https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE';

const load = (f: string) => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8')) as Record<string, any>;
/** What Comfy Cloud must have: the graph's classes and every model file a loader names (all in Comfy Cloud's shared library on 2026-10-26). */
export const H3KF_REQUIRES = (() => {
  const nodes = new Set<string>(); const models = new Map<string, { loader: string; field: string; file: string }>();
  for (const n of Object.values<any>(load(H3KF_GRAPH))) { nodes.add(String(n.class_type));
    for (const [k, v] of Object.entries<any>(n.inputs ?? {})) if (typeof v === 'string' && /\.safetensors$/.test(v)) models.set(`${n.class_type}.${k}=${v}`, { loader: String(n.class_type), field: k, file: v }); }
  return { nodes: [...nodes].sort(), models: [...models.values()] };
})();

/** What this route can't take (null = fine). Reads only what the quote also has (mode, duration, resolution, aspect, the frame count), so quote and charge agree;
 *  the frames themselves are checked when the job is made (tools/h3/index.ts) and again by the plan. */
export function h3KeyframesIssue(i: Record<string, any>): string | null {
  const mode = jobModeOf(i);
  if (mode && mode !== H3KF_MODE) return 'This route only makes Keyframes clips';
  const s = Number(i?.duration); if (Number.isFinite(s) && s > 0 && !H3KF_SECONDS.includes(s as any)) return `Keyframes makes ${H3KF_SECONDS[0]}–${H3KF_SECONDS[H3KF_SECONDS.length - 1]} s clips`;
  if (i?.resolution && !Object.keys(H3KF_MP).includes(String(i.resolution))) return 'Keyframes makes 768p or 480p';
  const n = Array.isArray(i?.keyframePaths) ? i.keyframePaths.length : 0; if (n > H3KF_MAX_FRAMES) return `MiniMax H3 Keyframes takes ${H3KF_MIN_FRAMES} to ${H3KF_MAX_FRAMES} frames; you added ${n}`; // the bar's count (quote) or the files (job)
  return null;
}
/** The local H3 card's routes can't make Keyframes: it runs on Comfy Cloud only (routing/routes.ts). */
export const KEYFRAMES_CLOUD_ONLY = 'Keyframes runs on Comfy Cloud';

/** Auto aspect = the selector shape nearest frame 1. */
function autoAspect(file: string | undefined): string {
  const d = file ? imageDimsOfFile(file) : null; if (!d || !d.width || !d.height) return '16:9 (Widescreen)';
  const r = Math.log(d.width / d.height); let best: string = RESOLUTION_SELECTOR_ASPECTS[6]; let gap = Infinity;
  for (const o of RESOLUTION_SELECTOR_ASPECTS) { const m = /^(\d+):(\d+)/.exec(o)!; const g = Math.abs(Math.log(Number(m[1]) / Number(m[2])) - r); if (g < gap) { gap = g; best = o; } }
  return best;
}
const bad = (m: string) => Object.assign(new Error(m), { reasonCode: 'input_invalid', errorType: 'validation' });
/** The template's guide blocks, in order: Add Guide, its Math Expression, its seconds, its Load Image. A 4th guide clones the last one. */
const BLOCKS = [{ guide: '147', math: '153', sec: '154', img: '157' }, { guide: '162', math: '161', sec: '160', img: '159' }, { guide: '169', math: '170', sec: '168', img: '167' }];
/** The plan: one pass of the template graph with N frames. input.keyframePaths + input.keyframeTimes come from tools/h3/index.ts. */
export function h3KeyframesPlan(j: { id: string; toolId: string; provider: string; input: Record<string, any> }): Plan {
  const i = j.input; const why = h3KeyframesIssue(i); if (why) throw bad(why);
  const paths: string[] = Array.isArray(i.keyframePaths) ? i.keyframePaths.filter((x: unknown) => typeof x === 'string' && x) : [];
  if (paths.length < H3KF_MIN_FRAMES || paths.length > H3KF_MAX_FRAMES) throw bad(`Keyframes takes ${H3KF_MIN_FRAMES} to ${H3KF_MAX_FRAMES} frames`);
  const seconds = Number(i.duration) || 5; const times = parseKeyframeTimes(i.keyframeTimes) ?? spreadTimes(paths.length, seconds);
  if (times.length !== paths.length) throw bad('Give every frame a time in seconds'); const tw = keyframeTimesIssue(times, seconds); if (tw) throw bad(tw);
  const g = load(H3KF_GRAPH);
  const prompt = String(i.enhancedPrompt ?? i.finalPrompt ?? i.prompt ?? ''); const seed = Math.max(0, Math.floor(Number(i.seed) || 0));
  const res = String(i.resolution ?? '768p'); const mp = H3KF_MP[res] ?? 0.98; const fast = i.quality === 'fast';
  g['138'].inputs.value = prompt; g['132'].inputs.value = seconds; g['129'].inputs.noise_seed = seed; g['146'].inputs.value = fast;
  const aspect = i.aspect && i.aspect !== 'auto' ? resolutionSelectorAspect(String(i.aspect)) : autoAspect(paths[0]);
  Object.assign(g['115'].inputs, { aspect_ratio: aspect, megapixels: mp });
  g['164'].inputs.image = { __file: paths[0] }; // <Picture 1>: identity and first frame (ref_image_0)
  const blocks = [...BLOCKS];
  while (blocks.length < paths.length - 1) { // a 4th guide: clone the template's last block (its "Follow the same pattern" note)
    const k = blocks.length + 1; const src = BLOCKS[BLOCKS.length - 1]; const b = { guide: `9${k}0`, math: `9${k}1`, sec: `9${k}2`, img: `9${k}3` };
    for (const key of ['guide', 'math', 'sec', 'img'] as const) g[b[key]] = JSON.parse(JSON.stringify(g[src[key]]));
    g[b.math].inputs['values.a'] = [b.sec, 0]; Object.assign(g[b.guide].inputs, { frame_idx: [b.math, 1], image: [b.img, 0] }); blocks.push(b); }
  let prev: [string, number] = ['136', 0];
  paths.slice(1).forEach((file, n) => { const b = blocks[n];
    g[b.img].inputs.image = { __file: file }; g[b.sec].inputs.value = h3kfFrameIndex(times[n + 1], seconds) / H3KF_FPS; // round(a × 24) = the index exactly
    g[b.guide].inputs.positive = prev; prev = [b.guide, 0];
    g['136'].inputs[`ref_images.ref_image_${n + 1}`] = [b.img, 0]; }); // <Picture n + 2> for the prompt (the tutorial's tip)
  g['126'].inputs.conditioning = prev;
  pruneUnreachable(g, ['92']);
  const frames = times.map((t) => h3kfFrameIndex(t, seconds));
  return { tool: j.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false,
    notes: [`MiniMax H3 Keyframes on Comfy Cloud (official template ${H3KF_TEMPLATE}): ${paths.length} frames at ${times.map((t) => `${t} s`).join(', ')}, ${seconds} s, ${mp} MP, ${fast ? '4 steps (turbo LoRA)' : '20 steps'}`],
    passes: [{ label: 'Result', workflow: H3KF_GRAPH, graph: g, output: '92', expect: { seed, prompt, seconds, fps: H3KF_FPS, megapixels: mp, keyframes: frames, length: h3kfLength(seconds) } }] };
}
