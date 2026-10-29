/**
 * Finish (tool id finish, 2026-10-27): one-click finishing looks on a clip you already have: film grain, soft glow, a light leak, a glitch,
 * a smooth push-in, a vignette, a cinematic frame or a dream blur, at a strength you pick, one look or two stacked.
 * Free: our own ffmpeg filtergraphs (shared/finishPresets.ts), on this computer. No model, no provider, no ComfyUI; the same on every backend.
 * Opened on the Video page (?workflow=finish; recipe in shared/videoBar.ts); the clip comes from an upload, the media picker or a result.
 *
 *  - parseInput: reads the clip and plans the run: the first FINISH_MAX_SECONDS seconds, the long side capped at FINISH_MAX_SIDE.
 *  - run: one ffmpeg pass: H.264 (CRF 18) + AAC with faststart, the clip's sound kept. Strength 0 with nothing to cap copies the clip as is.
 */
import path from 'node:path';
import { renameSync, rmSync } from 'node:fs';
import type { ToolDef } from './types.js';
import { DATA_DIR } from '../config.js';
import { runFfmpeg } from '../ffmpeg.js';
import { probe } from '../media.js';
import { registerProvider } from '../providers.js';
import { NATIVE_DIRECT } from '../routing/directRoutes.js';
import { FINISH_TOOL, FINISH_PROVIDER, FINISH_PRESETS, FINISH_MAX_SECONDS, FINISH_MIN_SECONDS, FINISH_DEFAULT_STRENGTH, finishPreset, finishGraph, finishSize, type FinishLook } from '../shared/finishPresets.js';

registerProvider({ id: FINISH_PROVIDER, name: 'Finish (ffmpeg on this computer)', kind: 'open-weights', via: 'This computer: our own ffmpeg filtergraphs (no ComfyUI, no provider)', workflows: [], license: 'agpl-3.0-or-later', licenseParts: ['agpl-3.0-or-later'] } as any);
NATIVE_DIRECT[FINISH_PROVIDER] = { noComfy: true, label: 'Your computer · free' };

const bad = (field: string, message: string, code = 'invalid') => ({ error: message, code, issues: [{ code, field, message }] }) as any;
const typesOf = (raw: string | undefined): string[] => { try { const v = JSON.parse(raw || '[]'); return (Array.isArray(v) ? v : [v]).map(String); } catch { return String(raw ?? '').split(',').map((x) => x.trim()).filter(Boolean); } };
/** A strength field: '' = the default; else 0–1 (a percent 0–100 is read as a percent). */
const strengthOf = (raw: string | undefined): number | null => {
  if (raw == null || raw === '') return FINISH_DEFAULT_STRENGTH; const x = Number(raw); if (!Number.isFinite(x) || x < 0 || x > 100) return null; return x > 1 ? x / 100 : x;
};

export const finishTool: ToolDef = {
  id: FINISH_TOOL, name: 'Finish', category: 'Edit Video', status: 'new', route: `/tools/${FINISH_TOOL}`, ui: 'app',
  description: `Give a clip you already have a finished look, like film grain or a soft glow. Stack two if you like. Free on your computer, and your sound stays. Clips up to ${FINISH_MAX_SECONDS} s.`,
  inputs: [{ name: 'video', kind: 'file', required: true, accept: 'video/mp4,video/quicktime,video/webm', label: 'Your clip' },
    { name: 'types', kind: 'list', required: true, max: 1, options: FINISH_PRESETS.map((p) => p.id) },
    { name: 'strength', kind: 'number', default: FINISH_DEFAULT_STRENGTH, label: 'Strength (0–1)' } as any,
    { name: 'second', kind: 'select', options: ['', ...FINISH_PRESETS.map((p) => p.id)], default: '', label: 'A second look (optional)' } as any,
    { name: 'keepAudio', kind: 'select', options: ['1', '0'], default: '1' }],
  presets: FINISH_PRESETS.map((p) => ({ id: p.id, label: p.label, prompt: '', description: p.line, group: 'Look', addedAt: '2026-10-27', providers: [FINISH_PROVIDER], category: 'Free · on your computer',
    /* still frames: each look on one fixed sample clip (scripts/gen-finish-covers.sh) */ posterUrl: `/samples/presets/finish-${p.id}.jpg` } as any)),
  app: { kind: 'video', input: 'video', maxSeconds: FINISH_MAX_SECONDS },
  workflows: [], model: 'ffmpeg (our own filtergraphs)', gpuSecPerSec: { source: 0 }, providers: [FINISH_PROVIDER], stages: [['saving', 'Finishing your clip']],
  routeInput: (i) => ({ types: Array.isArray(i.types) ? i.types : [FINISH_PRESETS[0].id] }),
  async parseInput(fields, files) {
    const vf = files.video?.[0]; if (!vf) return bad('video', 'Add a clip to finish.', 'required');
    if (/\.(png|jpe?g|webp|gif)$/i.test(vf)) return bad('video', 'Finish takes a video clip, not a photo.', 'format');
    const look = finishPreset(typesOf(fields.types)[0] ?? fields.look); if (!look) return bad('types', 'Pick a look from the list.', 'unknown_look');
    const second = fields.second ? finishPreset(fields.second) : undefined; if (fields.second && !second) return bad('second', 'Pick the second look from the list.', 'unknown_look');
    if (second && second.id === look.id) return bad('second', 'Pick a different second look, or none.');
    const strength = strengthOf(fields.strength); if (strength == null) return bad('strength', 'Strength must be between 0 and 1.');
    const src = path.join(DATA_DIR, vf); const p = await probe(src);
    if (!p) return bad('video', 'That clip could not be read. Re-export it as MP4 (H.264) and try again.', 'unreadable');
    if (!(p.duration >= FINISH_MIN_SECONDS)) return bad('video', `That clip is too short (${p.duration.toFixed(1)} s); use one of at least ${FINISH_MIN_SECONDS} s.`, 'too_short');
    if (Math.min(p.width, p.height) < 64) return bad('video', `That clip is too small (${p.width}×${p.height}).`, 'too_small');
    const seconds = Math.min(p.duration, FINISH_MAX_SECONDS); const size = finishSize(p.width, p.height);
    const keepAudio = !/^(0|false|off|no)$/i.test(fields.keepAudio ?? '');
    const warnings: string[] = [];
    if (p.duration > FINISH_MAX_SECONDS) warnings.push(`Your clip is ${p.duration.toFixed(1)} s; Finish covers the first ${FINISH_MAX_SECONDS} s.`);
    if (size && Math.max(p.width, p.height) > 1920) warnings.push(`Your clip is ${p.width}×${p.height}; the finished clip is ${size.width}×${size.height}.`);
    if (look.id === 'cinematic' && p.width / p.height < 1.3) warnings.push('Cinematic adds its 2.39:1 bars on wide clips only; this clip gets the grade.');
    const looks: FinishLook[] = [{ id: look.id, strength }, ...(second ? [{ id: second.id, strength }] : [])];
    const label = looks.map((l) => finishPreset(l.id)!.label).join(' + ');
    return { types: [look.id], mode: 'finish', outKind: 'video', prompt: '', finalPrompt: '', duration: Math.round(seconds * 10) / 10, resolution: 'source',
      videoPath: src, videoUrl: `/files/${vf}`, compareUrl: `/files/${vf}`, hasAudio: p.hasAudio, keepAudio, width: size?.width ?? p.width, height: size?.height ?? p.height,
      outputLabel: label, warnings,
      finish: { looks, strength, label, seconds, trimmed: p.duration > FINISH_MAX_SECONDS, source: { width: p.width, height: p.height, fps: p.fps ?? 24, seconds: p.duration }, scale: size } };
  },
  async run(job) {
    job.status = 'running'; job.stage = 'saving'; job.progress = 10; const i: any = job.input; const f = i.finish;
    const name = `${job.id}-finish.mp4`; const out = path.join(DATA_DIR, name); const tmp = `${out}.part.mp4`;
    const ctx = { width: f.source.width, height: f.source.height, fps: f.source.fps, seconds: f.seconds };
    const graph = finishGraph(f.looks, ctx, f.scale);
    const audio = i.keepAudio !== false && i.hasAudio ? ['-map', '0:a:0?'] : ['-an'];
    const trim = f.trimmed ? ['-t', String(f.seconds)] : [];
    const args = !graph
      /* strength 0 and nothing to cap: the clip as it is (the picture stream copied, bit for bit) */
      ? ['-y', '-v', 'error', '-i', i.videoPath, ...trim, '-map', '0:v:0', ...audio, '-c', 'copy', '-movflags', '+faststart', tmp]
      : ['-y', '-v', 'error', '-i', i.videoPath, ...trim, '-filter_complex', graph, '-map', '[vout]', ...audio, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
        ...(audio[0] === '-an' ? [] : ['-c:a', 'aac', '-b:a', '192k']), '-r', String(f.source.fps), '-movflags', '+faststart', tmp];
    const code = await runFfmpeg(args);
    if (code !== 0) { rmSync(tmp, { force: true }); job.status = 'failed'; job.errorType = 'temporary'; job.error = 'The clip could not be finished. Nothing was charged; try another clip or look.'; return; }
    renameSync(tmp, out); /* written aside, then moved in: nothing ever reads a half-written file */
    job.outputs = [{ label: f.label, url: `/files/${name}`, width: i.width, height: i.height } as any]; job.resultUrl = `/files/${name}`;
    job.status = 'done'; job.stage = 'done'; job.progress = 100; job.eta = 0;
  },
};
