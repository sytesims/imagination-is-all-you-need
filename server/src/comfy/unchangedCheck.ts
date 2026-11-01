/**
 * Did an edit come back unchanged? (Nov 1) A masked H3 Character Swap can return the prepared source passed straight through (the person not
 * replaced) and still "succeed". Free, after the run, before the job shows as done: both clips sampled at 4 fps (timestamps aligned from the start,
 * the shorter length, sound ignored), grey, at a quarter of the source's size; each frame split into 16 px cells (the source's pixels, H3's latent
 * cell). A cell changed when its mean absolute difference is over 15 (of 255; the VAE round trip alone stays well under), a frame changed when at
 * least 2% of its cells did, and the clip is "unchanged" when fewer than 25% of the sampled frames changed.
 * Calibrated on real runs: a pass-through came back with 2 of 60 sampled frames changed (3%; median frame 0.4% of cells), real swaps with every
 * sampled frame changed (masked: median 8.1% of cells, lowest 4.9%; mask-free: median 6.1%, lowest 3.7%). Fewer than 3 frames compared, or any ffmpeg
 * error → null (say nothing: never block a good result).
 */
import { spawn } from 'node:child_process';

export const UNCHANGED_RULE = { fps: 4, cell: 16, scale: 4, cellDiff: 15, frameCells: 0.02, clipFrames: 0.25, minFrames: 3 } as const;
const run = (cmd: string, args: string[]) => new Promise<Buffer>((res, rej) => {
  const c = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] }); const out: Buffer[] = [];
  c.stdout.on('data', (d: Buffer) => out.push(d)); c.on('error', rej); c.on('close', (code) => code === 0 ? res(Buffer.concat(out)) : rej(new Error(`${cmd} exit ${code}`)));
});
/** { unchanged, changedShare (of sampled frames), frames } or null when the check could not run. */
export async function editUnchanged(source: string, output: string, R = UNCHANGED_RULE): Promise<{ unchanged: boolean; changedShare: number; frames: number } | null> {
  try {
    const [sw, sh] = String(await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', source])).trim().split(',').map(Number);
    if (!(sw > 0 && sh > 0)) return null;
    const cw = Math.max(1, Math.round(sw / R.cell)), ch = Math.max(1, Math.round(sh / R.cell)), k = R.cell / R.scale, w = cw * k, h = ch * k, fs = w * h;
    const grab = (f: string) => run('ffmpeg', ['-v', 'error', '-i', f, '-an', '-vf', `fps=${R.fps},scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-']);
    const [a, b] = await Promise.all([grab(source), grab(output)]); const n = Math.floor(Math.min(a.length, b.length) / fs);
    if (n < R.minFrames) return null;
    let changed = 0;
    for (let f = 0; f < n; f++) { let cells = 0;
      for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) { let s = 0;
        for (let y = 0; y < k; y++) { const row = f * fs + (cy * k + y) * w + cx * k; for (let x = 0; x < k; x++) s += Math.abs(a[row + x] - b[row + x]); }
        if (s / (k * k) > R.cellDiff) cells++; }
      if (cells >= R.frameCells * cw * ch) changed++; }
    return { unchanged: changed / n < R.clipFrames, changedShare: Math.round((changed / n) * 1000) / 1000, frames: n };
  } catch { return null; }
}
/** The job's notice (job.warnings, shown on the result card and in the viewer). */
export const unchangedNotice = (maskPreview: boolean) => `The swap came back unchanged: H3 returned your original video, so the person wasn't replaced. Try clicking the person or picking a side, or use a wider shot.${maskPreview ? ' The mask previews in the result details show who was selected.' : ''}`;
