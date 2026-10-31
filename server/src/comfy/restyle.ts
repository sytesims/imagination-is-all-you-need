/**
 * Restyle on ComfyUI (Wan 2.1 VACE v2v, workflows/restyle-api.json). OPENHIGGSFIELD_BACKEND=comfy only.
 * VACE renders ≤81 frames per pass, so long clips are split into overlapping passes and the seams are
 * crossfaded with ffmpeg xfade. Style reference = our swatch for the preset (server/samples/styles) or the
 * first custom ref; neither → prompt-only (node 134 disconnected).
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { SAMPLES_DIR } from '../config.js';
import { runFfmpeg } from '../ffmpeg.js';
import { captionSubject } from '../shared/promptPatterns.js';

export const VACE_FPS = 16, CHUNK = 81, OVERLAP = 16;
const STYLE_META: { styles: { id: string; label: string; swatch: string; prompt: string; negative: string }[] } =
  JSON.parse(readFileSync(path.join(SAMPLES_DIR, 'styles', 'styles.json'), 'utf8'));
export const styleFor = (id: string) => STYLE_META.styles.find((s) => s.id === id);
export const swatchPath = (id: string) => (styleFor(id) ? path.join(SAMPLES_DIR, 'styles', `${id}.png`) : null);

/** Overlapping passes over `frames` total: [{start,length}] with 4n+1 lengths ≤81 and `overlap` shared frames. */
export function planChunks(frames: number, chunk = CHUNK, overlap = OVERLAP) {
  if (frames <= chunk) return [{ start: 0, length: Math.max(5, Math.floor((frames - 1) / 4) * 4 + 1) }];
  const step = chunk - overlap; const out: { start: number; length: number }[] = [];
  for (let s = 0; ; s += step) {
    if (s + chunk >= frames) { const st = Math.max(0, frames - chunk); out.push({ start: st, length: chunk }); break; }
    out.push({ start: s, length: chunk });
  }
  return out;
}

/** Patch restyle-api.json for one pass. */
export function patchRestyle(graph: Record<string, any>, v: { video: unknown; style: unknown | null; prompt: string; negative?: string; seed: number; width: number; height: number; length: number }) {
  const g = structuredClone(graph);
  g['145'].inputs.file = v.video;
  g['6'].inputs.text = v.prompt; if (v.negative) g['7'].inputs.text = v.negative;
  Object.assign(g['49'].inputs, { width: v.width, height: v.height, length: v.length });
  g['3'].inputs.seed = Math.max(0, Math.floor(v.seed));
  if (v.style) g['134'].inputs.image = v.style; else { delete g['49'].inputs.reference_image; delete g['134']; }
  return g;
}

/** Build the prompt from the preset template (+ user text as subject). VACE reads a caption of the target clip (shared/promptPatterns.ts video-restyle):
 *  "{Subject}, in {style} style: {traits}." The control video carries the motion, so no "keep the motion" words. */
export const restylePrompt = (presetId: string, user: string) => {
  const s = styleFor(presetId); const subject = captionSubject(user, 'The scene');
  return s ? { prompt: s.prompt.replace('{subject}', subject), negative: s.negative } : { prompt: `${subject}, ${user}`, negative: undefined };
};

/** ffmpeg: cut pass i out of the 16 fps source. */
export const cutChunk = (src16: string, out: string, c: { start: number; length: number }) =>
  runFfmpeg(['-y', '-i', src16, '-vf', `select='between(n\\,${c.start}\\,${c.start + c.length - 1})',setpts=N/${VACE_FPS}/TB`, '-an', '-c:v', 'libx264', '-crf', '16', out]);

/** ffmpeg xfade chain: join pass outputs, crossfading each seam over the overlap. */
export function blendArgs(files: string[], chunks: { start: number; length: number }[], out: string) {
  if (files.length === 1) return ['-y', '-i', files[0], '-c', 'copy', out];
  const inputs = files.flatMap((f) => ['-i', f]); const parts: string[] = []; let last = '[0:v]'; let acc = chunks[0].length / VACE_FPS;
  for (let i = 1; i < files.length; i++) {
    const ov = (chunks[i - 1].start + chunks[i - 1].length - chunks[i].start) / VACE_FPS; // actual overlap seconds
    const tag = i === files.length - 1 ? '[v]' : `[x${i}]`;
    parts.push(`${last}[${i}:v]xfade=transition=fade:duration=${ov.toFixed(4)}:offset=${(acc - ov).toFixed(4)}${tag}`);
    acc += chunks[i].length / VACE_FPS - ov; last = tag;
  }
  return ['-y', ...inputs, '-filter_complex', parts.join(';'), '-map', '[v]', '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', out];
}
export const blendChunks = (files: string[], chunks: { start: number; length: number }[], out: string) => runFfmpeg(blendArgs(files, chunks, out));
