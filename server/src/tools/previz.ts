/**
 * Direct a Shot (tool id plan-a-shot, 2026-10-24, shared/previzTemplates.ts): the browser draws a planned 3D shot frame by frame (seek(t) per frame, so the clip is
 * frame-exact whatever the computer's speed) and uploads each view as ONE motion-JPEG stream (the frames' JPEGs back to back, field `streams`,
 * one file per view, in the order of `passes`). ffmpeg here turns each stream into an H.264 MP4 at exactly `fps` with exactly `frames` frames.
 * Free: no provider, no ComfyUI. The shot (PlanShot) and the step 2 restyle prompts are kept on the job (input.previz) for the repaint.
 */
import path from 'node:path';
import { stat, unlink } from 'node:fs/promises';
import type { ToolDef } from './types.js';
import { DATA_DIR } from '../config.js';
import { runFfmpeg } from '../ffmpeg.js';
import { registerProvider } from '../providers.js';
import { NATIVE_DIRECT } from '../routing/directRoutes.js';
import { PLAN_SHOT_TOOL, threeDRoute } from '../shared/threeD.js';
import { actionPromptFor } from '../shared/previzActor.js';
import { castPromptFor, castActionLine, starOf } from '../shared/previzModels.js';
import { normalizePlanShot, shotForJob, previzTemplate, chosenTake, type CameraTake, previzFrameCount, restylePromptFor, PREVIZ_PASSES, PREVIZ_FPS, PREVIZ_MIN_SECONDS, PREVIZ_MAX_SECONDS, type PrevizPass } from '../shared/previzTemplates.js';

/** The feed's name for a mockup: the scene, plus the take when it has a person ("Street walk · Performance 1 · Angle 2"), so angles tell apart. */
const takeLabel = (scene: string, k: CameraTake | null) => (k?.actor ? `${scene} · ${k.name}` : scene);
registerProvider({ id: 'local-previz', name: 'Direct a Shot (drawn in your browser)', kind: 'open-weights', via: 'This computer: the browser draws each frame, ffmpeg saves an MP4 (no ComfyUI, no provider)', workflows: [], license: 'agpl-3.0-or-later', licenseParts: ['agpl-3.0-or-later'] } as any);
NATIVE_DIRECT['local-previz'] = { noComfy: true, label: 'Your computer · free' };

const bad = (field: string, message: string, code = 'invalid') => ({ error: message, code, issues: [{ code, field, message }] }) as any;
const PASS_LABEL: Record<PrevizPass, string> = Object.fromEntries(PREVIZ_PASSES.map((p) => [p.id, `${p.label} view`])) as Record<PrevizPass, string>;

export const previzTool: ToolDef = {
  id: PLAN_SHOT_TOOL, name: 'Direct a Shot', category: '3D', status: 'new', route: threeDRoute('plan-a-shot'), ui: 'three-d', listed: false,
  description: 'Stage a scene in simple 3D, move the camera, and record a free mockup in seconds.',
  inputs: [{ name: 'streams', kind: 'files', required: true, accept: 'video/x-motion-jpeg', max: 2 }, { name: 'shot', kind: 'text', required: true }, { name: 'passes', kind: 'list', options: PREVIZ_PASSES.map((p) => p.id) },
    { name: 'frameCount', kind: 'number' }, { name: 'width', kind: 'number' }, { name: 'height', kind: 'number' }, { name: 'scene', kind: 'text' }, { name: 'types', kind: 'list', options: ['plan-a-shot'] }],
  presets: [{ id: 'plan-a-shot', label: 'Direct a Shot', prompt: '', group: 'Mode' }],
  app: { kind: 'video', providerModes: { 'local-previz': ['plan-a-shot'] } },
  workflows: [], gpuSecPerSec: { source: 0 }, providers: ['local-previz'], stages: [['saving', 'Saving the video']],
  routeInput: () => ({ types: ['plan-a-shot'], mode: 'plan-a-shot' }),
  async parseInput(fields, files) {
    const streams = files.streams ?? [];
    if (!streams.length) return bad('streams', 'Record the shot first.', 'required');
    let shotRaw: unknown = null; try { shotRaw = JSON.parse(fields.shot || 'null'); } catch { return bad('shot', 'The shot settings could not be read.'); }
    if (!shotRaw || typeof shotRaw !== 'object') return bad('shot', 'The shot settings are missing.', 'required');
    const shot = normalizePlanShot(shotRaw); const imported = fields.scene === 'imported';
    const asked = Number((shotRaw as any).seconds); if (!(asked >= PREVIZ_MIN_SECONDS && asked <= PREVIZ_MAX_SECONDS)) return bad('shot', `Length: pick ${PREVIZ_MIN_SECONDS}–${PREVIZ_MAX_SECONDS} seconds.`);
    if (!PREVIZ_FPS.includes(Number((shotRaw as any).fps) as any)) return bad('shot', 'Frame rate: pick 24 or 30 fps.');
    let passes: PrevizPass[] = []; try { passes = JSON.parse(fields.passes || '["beauty"]'); } catch { return bad('passes', 'The views could not be read.'); }
    if (!Array.isArray(passes) || !passes.length || passes.length > 2 || new Set(passes).size !== passes.length || !passes.every((p) => PREVIZ_PASSES.some((q) => q.id === p))) return bad('passes', 'Pick one or two views: Simple, Clay or Depth.');
    if (passes.length !== streams.length) return bad('streams', 'Send one recording per view.');
    const want = previzFrameCount(shot.seconds, shot.fps); const n = Number(fields.frameCount);
    if (n !== want) return bad('frameCount', `A ${shot.seconds} s shot at ${shot.fps} fps has ${want} frames; this recording says ${fields.frameCount || 'none'}.`);
    const w = Number(fields.width); const h = Number(fields.height);
    if (!(Number.isInteger(w) && Number.isInteger(h) && w >= 64 && h >= 64 && w <= 1920 && h <= 1920 && w % 2 === 0 && h % 2 === 0)) return bad('width', 'The frame size must be even, between 64 and 1920 pixels a side.');
    for (const f of streams) { const st = await stat(path.join(DATA_DIR, f)).catch(() => null); if (!st || st.size < n * 200) return bad('streams', 'That recording is too small to hold every frame. Record it again.', 'format'); }
    const tpl = previzTemplate(shot.template)!;
    return { types: ['plan-a-shot'], mode: 'plan-a-shot', outKind: 'video', prompt: shot.note, finalPrompt: '', duration: shot.seconds, resolution: 'source', outputLabel: PASS_LABEL[passes[0]], warnings: [],
      streamPaths: streams.map((f) => path.join(DATA_DIR, f)), passes, fps: shot.fps, frames: n, width: w, height: h,
      previz: { shot: shotForJob(shot), scene: imported ? 'imported' : 'preset', presetName: imported ? 'Imported scene' : takeLabel(tpl.name, chosenTake(shot)), passes, fps: shot.fps, frames: n, width: w, height: h,
        restyle: imported ? null : { long: castPromptFor(restylePromptFor(shot, 'long'), shot), short: castPromptFor(restylePromptFor(shot, 'short'), shot) }, action: imported ? '' : castActionLine(actionPromptFor(shot), shot),
        /* your 3D models (previzModels.ts): the Render prompt names them; the sheet's "Who is it?" picture stays for a person, not a model */
        ...(shot.models ? { cast: shot.models.map((m) => ({ name: m.name, desc: m.desc, actor: !!m.actor })), star: starOf(shot)?.name ?? null } : {}) } };
  },
  async run(job) {
    job.status = 'running'; job.stage = 'saving'; job.progress = 10; const i = job.input; const outputs: { label: string; url: string }[] = [];
    for (const [k, src] of (i.streamPaths as string[]).entries()) {
      const name = `${job.id}-out${k}.mp4`; const out = path.join(DATA_DIR, name);
      /* frame-exact: every JPEG in the stream is one frame at `fps`; -frames:v caps it at the expected count */
      const code = await runFfmpeg(['-y', '-v', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(i.fps), '-i', src, '-frames:v', String(i.frames), '-an',
        '-vf', `scale=${i.width}:${i.height}:flags=bicubic,format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-r', String(i.fps), '-movflags', '+faststart', out]);
      if (code !== 0) { job.status = 'failed'; job.errorType = 'temporary'; job.error = 'The recording could not be saved as a video. Nothing was charged; record it again.'; return; }
      outputs.push({ label: `${(i.passes as PrevizPass[])[k] ? PASS_LABEL[(i.passes as PrevizPass[])[k]] : 'Video'}`, url: `/files/${name}` });
      job.progress = 10 + Math.round((80 * (k + 1)) / i.streamPaths.length);
    }
    for (const src of i.streamPaths as string[]) await unlink(src).catch(() => undefined); /* the frames are in the MP4 now */
    job.outputs = outputs; job.resultUrl = outputs[0].url; job.status = 'done'; job.stage = 'done'; job.progress = 100; job.eta = 0;
  },
};
(previzTool as any).media = '3d';
