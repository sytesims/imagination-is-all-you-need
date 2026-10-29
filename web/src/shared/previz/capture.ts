/**
 * Direct a Shot recording (2026-10-24): frame-exact, in the browser, no extra library.
 * For every frame i (t = i / fps) the source draws exactly that moment (seek(t)), we copy it onto a fixed-size 2D canvas (letterboxed, never
 * stretched) and encode it as a JPEG. A view's JPEGs go back to back into ONE motion-JPEG stream; the server (tools/previz.ts) turns each
 * stream into an H.264 MP4 at exactly fps with exactly N frames. Slow computers just take longer; the clip's timing never changes.
 * Why not MediaRecorder (the turntable's way)? It records in real time, so dropped frames change the timing; this clip must keep exact
 * motion for step 2. Why not WebCodecs? Its H.264 encoder isn't in every Chromium build, and MP4 muxing would need a new dependency.
 */
import { createJob } from '../../api';
import { previzFrameCount, shotForJob, PREVIZ_SIZES, PREVIZ_TOOL, type PlanShot, type PrevizPass } from '../../../../server/src/shared/previzTemplates';

/** Something that can draw the frame for time t in a given view: the built-in engine or an imported scene. */
export interface FrameSource { /** draw this shot at t in this view (the shot the recording started with, whatever the page shows meanwhile) */ frame(t: number, pass: PrevizPass, shot: PlanShot): Promise<CanvasImageSource>; begin?(w: number, h: number): Promise<void> | void; end?(): Promise<void> | void }
export interface CaptureProgress { done: number; total: number; pass: PrevizPass; frame: number; frames: number }
export interface CaptureResult { streams: Blob[]; passes: PrevizPass[]; frames: number; w: number; h: number; bytes: number }

export async function captureShot(src: FrameSource, shot: PlanShot, passes: PrevizPass[], o: { onProgress?: (p: CaptureProgress) => void; signal?: AbortSignal; quality?: number } = {}): Promise<CaptureResult> {
  const { w, h } = PREVIZ_SIZES[shot.aspect]; const n = previzFrameCount(shot.seconds, shot.fps); const total = n * passes.length;
  const out = document.createElement('canvas'); out.width = w; out.height = h; const x = out.getContext('2d', { alpha: false }); if (!x) throw new Error('This browser can’t record here.');
  const parts: Blob[][] = passes.map(() => []); let done = 0; let bytes = 0;
  await src.begin?.(w, h);
  try {
    for (let i = 0; i < n; i++) {
      for (const [k, pass] of passes.entries()) {
        if (o.signal?.aborted) throw new DOMException('Recording stopped.', 'AbortError');
        const img = await src.frame(i / shot.fps, pass, shot);
        x.fillStyle = '#000'; x.fillRect(0, 0, w, h); const iw = (img as any).width ?? w, ih = (img as any).height ?? h; const s = Math.min(w / iw, h / ih); const dw = iw * s, dh = ih * s;
        x.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh); (img as ImageBitmap).close?.();
        const b = await new Promise<Blob | null>((ok) => out.toBlob(ok, 'image/jpeg', o.quality ?? 0.9)); if (!b) throw new Error('A frame could not be encoded.');
        parts[k].push(b); bytes += b.size; done++; o.onProgress?.({ done, total, pass, frame: i + 1, frames: n });
      }
      if (i % 6 === 5) await new Promise((r) => setTimeout(r, 0)); /* let the page breathe (progress paints) */
    }
  } finally { await src.end?.(); }
  return { streams: parts.map((p) => new Blob(p, { type: 'video/x-motion-jpeg' })), passes, frames: n, w, h, bytes };
}

/** Keep a recording as a video result (free local job on the plan-a-shot tool). Returns the job id. */
export async function savePlanShot(shot: PlanShot, rec: CaptureResult, scene: 'preset' | 'imported' = 'preset'): Promise<string> {
  const fd = new FormData(); fd.append('types', '["plan-a-shot"]'); fd.append('shot', JSON.stringify(shotForJob(shot))); fd.append('passes', JSON.stringify(rec.passes)); fd.append('scene', scene);
  fd.append('frameCount', String(rec.frames)); fd.append('width', String(rec.w)); fd.append('height', String(rec.h));
  rec.streams.forEach((b, i) => fd.append('streams', b, `${rec.passes[i]}.mjpeg`));
  const r = await createJob(PREVIZ_TOOL, fd); return String(r.id);
}
