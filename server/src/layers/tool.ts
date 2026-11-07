/**
 * Video to layers (tool id layers, Edit Video): your clip + up to four names ("woman", "steam", "neon sign") → a see-through layer per name, a depth pass,
 * a clean background and an export for editors. Opened on the Video page (/video?workflow=layers; recipe in shared/videoBar.ts, the names chip in
 * web ui/video/barExtras/LayersExtra.tsx); the clip comes from an upload, your media or a result.
 *
 *  - parseInput: checks the clip (up to 15 s) and the names, makes the analysis copy (up to 24 fps, long side up to 1024 px, no sound), and, with
 *    Clean background on, prepares Footage Effects' Vanish on the same clip (its own conform: up to 5 s, 24 fps, Draft size).
 *  - run: reached only when no model runs this job here (the mock backend, free samples, a ComfyUI that isn't connected the native way): a
 *    labelled sample from your own clip (mock.ts), through the same finish step as a real run. A real run is the plan (plan.ts) on your ComfyUI
 *    or on Comfy Cloud, then assemble.ts.
 */
import path from 'node:path';
import type { ToolDef } from '../tools/types.js';
import type { Job } from '../jobs.js';
import { DATA_DIR } from '../config.js';
import { probe } from '../media.js';
import { runFfmpeg, countFrames } from '../ffmpeg.js';
import { mockRun } from '../tools/shared.js';
import { footageFxTool } from '../tools/footageFx.js';
import { VFX_CLOUD_ROUTE } from '../comfy/ltx23VfxCloud.js';
import { FOOTAGE_FX_WORKFLOW } from '../shared/footageFx.js';
import { LAYERS_TOOL, LAYERS_LOCAL, LAYERS_WORKFLOW, LAYERS_MAX_SECONDS, LAYERS_MIN_SECONDS, LAYERS_MAX_OBJECTS, LAYERS_FPS, LAYERS_LONG_SIDE,
  LAYERS_PLATE_SECONDS, LAYERS_MODEL_LINE, objectNames, optionOn, layersMode, CLOUD_PLATE_NOTE } from './constants.js';
import { sampleRaw } from './mock.js';
import { assembleLayers } from './assemble.js';

const bad = (field: string, message: string, code = 'invalid') => ({ error: message, code, issues: [{ code, field, message }] }) as any;
export const LAYERS_STAGES: [string, string][] = [['uploading', 'Sending your clip'], ['tracking', 'Finding and tracking each object (SAM 3.1)'], ['edges', 'Cleaning the edges (BiRefNet)'],
  ['depth', 'Measuring depth (Depth Anything 3)'], ['background', 'Making the clean background'], ['saving', 'Putting the layers together']];

/** The analysis copy's size: long side up to 1024 px, both sides even. */
export function analysisSize(w: number, h: number): { width: number; height: number } {
  const k = Math.min(1, LAYERS_LONG_SIDE / Math.max(w, h)); const even = (x: number) => Math.max(2, Math.round((x * k) / 2) * 2);
  return { width: even(w), height: even(h) };
}
export const analysisFps = (src?: number) => (src && src > 0 ? Math.min(LAYERS_FPS, Math.round(src * 1000) / 1000) : LAYERS_FPS);

/** Footage Effects' Vanish on the same clip, for the clean background (null + a reason when it can't be made). */
async function plateInput(fields: Record<string, string>, video: string, seconds: number, effect: 'vanish' | 'remove-object', prompt = ''): Promise<{ input: Record<string, any> } | { why: string }> {
  const duration = String(Math.min(LAYERS_PLATE_SECONDS, Math.max(2, Math.floor(seconds))));
  const r: any = await footageFxTool.parseInput({ types: effect, prompt, duration, resolution: '448p', route: VFX_CLOUD_ROUTE /* also makes the Comfy Cloud copy a silent clip needs */, keepAudio: '0', seed: fields.seed ?? '' }, { video: [video] });
  return r?.error ? { why: String(r.error) } : { input: r };
}


export const layersTool: ToolDef = {
  id: LAYERS_TOOL, name: 'Video to layers', category: 'Edit Video', status: 'new', route: `/tools/${LAYERS_TOOL}`, ui: 'app',
  description: `Split any video into separate layers: name up to ${LAYERS_MAX_OBJECTS} things and get each one on its own see-through layer, plus depth and a clean background, ready for your editor. Free on your computer, or on Comfy Cloud.`,
  inputs: [{ name: 'video', kind: 'file', required: true, accept: 'video/mp4,video/quicktime,video/webm', label: 'Your clip' },
    { name: 'objects', kind: 'list', required: true, max: LAYERS_MAX_OBJECTS, label: 'What to split out' },
    { name: 'edges', kind: 'select', options: ['1', '0'], default: '1', label: 'Clean edges' },
    { name: 'depth', kind: 'select', options: ['1', '0'], default: '1', label: 'Depth' },
    { name: 'background', kind: 'select', options: ['1', '0'], default: '1', label: 'Clean background' },
    { name: 'types', kind: 'list', max: 1, options: ['with-plate', 'split'], label: 'Mode (set from Clean background)' },
    { name: 'seed', kind: 'number' }],
  app: { kind: 'video', input: 'video', maxSeconds: LAYERS_MAX_SECONDS, minSeconds: LAYERS_MIN_SECONDS },
  workflows: [LAYERS_WORKFLOW, FOOTAGE_FX_WORKFLOW /* the clean background (Vanish) */], model: LAYERS_MODEL_LINE, gpuSecPerSec: { source: 4 }, providers: [LAYERS_LOCAL] /* Comfy Cloud is this model's second place (register.ts addTwin) */, stages: LAYERS_STAGES,
  /** The download set follows Clean background: off = the split graph only; on = also Footage Effects' LTX files (hardware/requirements.ts jobWorkflows). */
  routeInput: (i) => ({ types: [layersMode(i)] }),
  async parseInput(fields, files) {
    const vf = files.video?.[0]; if (!vf) return bad('video', 'Add a clip to split into layers.', 'required');
    if (/\.(png|jpe?g|webp|gif)$/i.test(vf)) return bad('video', 'Video to layers takes a video clip, not a photo.', 'format');
    const objects = objectNames(fields.objects ?? fields.prompt);
    if (!objects.length) return bad('objects', 'Name at least one thing to split out, like “woman” or “neon sign”.', 'required');
    if (objects.length > LAYERS_MAX_OBJECTS) return bad('objects', `Up to ${LAYERS_MAX_OBJECTS} things per clip. Remove ${objects.length - LAYERS_MAX_OBJECTS}.`, 'too_many');
    const src = path.join(DATA_DIR, vf); const p = await probe(src);
    if (!p) return bad('video', 'That clip could not be read. Re-export it as MP4 (H.264) and try again.', 'unreadable');
    if (p.duration > LAYERS_MAX_SECONDS + 0.05) return bad('video', `Your clip is ${p.duration.toFixed(1)} s. Video to layers takes up to ${LAYERS_MAX_SECONDS} s: trim it first.`, 'too_long');
    if (p.duration < LAYERS_MIN_SECONDS) return bad('video', `That clip is too short (${p.duration.toFixed(1)} s).`, 'too_short');
    if (Math.min(p.width, p.height) < 64) return bad('video', `That clip is too small (${p.width}×${p.height}).`, 'too_small');
    const edges = optionOn(fields.edges); const depth = optionOn(fields.depth); let background = optionOn(fields.background);
    const id = `lyr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; const name = `${id}-source.mp4`; const out = path.join(DATA_DIR, name);
    const size = analysisSize(p.width, p.height); const fps = analysisFps(p.fps);
    const code = await runFfmpeg(['-y', '-v', 'error', '-i', src, '-t', String(LAYERS_MAX_SECONDS), '-vf', `fps=${fps},scale=${size.width}:${size.height}:flags=lanczos,setsar=1,format=yuv420p`,
      '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-movflags', '+faststart', out]);
    if (code !== 0) return bad('video', 'That clip could not be prepared. Try another clip.', 'format');
    const frames = await countFrames(out); if (!frames) return bad('video', 'That clip has no frames we could read.', 'unreadable');
    const warnings: string[] = []; let plate: Record<string, any> | null = null;
    if (background) { // Vanish, prepared the way Footage Effects does (your computer; Comfy Cloud skips it for now: plan.ts)
      const r = await plateInput(fields, vf, p.duration, 'vanish');
      if ('why' in r) { background = false; warnings.push(`No clean background for this clip: ${r.why}`); } else plate = r.input; }
    if (plate && p.duration > LAYERS_PLATE_SECONDS + 0.05) warnings.push(`The clean background covers the first ${LAYERS_PLATE_SECONDS} s; after that it holds its last frame.`);
    if (p.width > LAYERS_LONG_SIDE || p.height > LAYERS_LONG_SIDE || (p.fps ?? 0) > LAYERS_FPS + 0.01) warnings.push(`The layers are made at ${size.width}×${size.height}, ${fps} fps.`);
    const seconds = Math.round((frames / fps) * 100) / 100;
    return { mode: 'layers', outKind: 'video', ownSample: true, objects, edges, depth, background, plate, types: background ? ['with-plate'] : ['split'],
      prompt: objects.join(', '), videoPath: out, videoUrl: `/files/${name}`, originalVideoUrl: `/files/${vf}`, width: size.width, height: size.height, fps, frames,
      duration: seconds, hasAudio: false, outputLabel: 'Overview', warnings };
  },
  /** The sample (see the header): never a model, never sent anywhere; the same finish step as a real run. */
  async run(job: Job) {
    await mockRun(job, LAYERS_STAGES, ['Overview'], 4000);
    if (job.status !== 'done') return;
    try {
      job.status = 'running' as any; job.stage = 'saving' as any;
      const i: any = job.input; const cloud = String(job.route ?? '').startsWith('comfy-cloud:'); // a Comfy Cloud sample shows what Comfy Cloud makes: no clean background yet
      const finals = await assembleLayers(job, await sampleRaw(job.id, { ...i, background: i.background && !cloud }), 'sample');
      if (cloud && i.background) ((job as any).warnings ??= []).push(CLOUD_PLATE_NOTE);
      job.outputs = finals.map((f) => ({ label: f.label, url: `/files/${path.basename(f.file)}` }));
      job.resultUrl = job.outputs[0]?.url ?? null; job.status = 'done'; job.stage = 'done'; job.progress = 100;
    } catch (e) {
      job.status = 'failed'; job.errorType = 'temporary'; job.error = `The sample layers could not be made (${e instanceof Error ? e.message : String(e)}).`;
    }
  },
};
