// Finish (2026-10-27): the look tiles' covers. Each look (server/src/shared/finishPresets.ts) runs on ONE fixed sample clip, hq-alley (Sintel
// trailer, CC BY 3.0, see ASSETS-CREDITS.md), with ffmpeg only, and one frame is saved as server/samples/presets/finish-<id>.jpg (640×360).
// No model, nothing paid. Run from the repo root: npx tsx scripts/gen-finish-covers.mts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FINISH_PRESETS, finishGraph } from '../server/src/shared/finishPresets.ts';

const SRC = 'web/public/examples/hq-alley.mp4'; const OUT = 'server/samples/presets'; const STRENGTH = 0.75;
/** the frame each cover shows: a glitch burst, the leak at its brightest, the push-in near its end; the rest mid-clip */
const AT: Record<string, number> = { glitch: 1.25, 'light-leak': 2.3, 'push-in': 2.8 };
/** looks that read faintly on a small tile are shown a little stronger */
const STRONGER: Record<string, number> = { 'film-grain': 1, 'soft-glow': 1, 'dream-blur': 0.9 };
const tmp = mkdtempSync(path.join(os.tmpdir(), 'finish-covers-'));
const ctx = { width: 960, height: 540, fps: 24, seconds: 3 };
for (const p of FINISH_PRESETS) {
  const clip = path.join(tmp, `${p.id}.mp4`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', SRC, '-filter_complex', finishGraph([{ id: p.id, strength: STRONGER[p.id] ?? STRENGTH }], ctx)!, '-map', '[vout]', '-an', '-c:v', 'libx264', '-crf', '14', clip]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(AT[p.id] ?? 1.4), '-i', clip, '-frames:v', '1', '-vf', 'scale=640:360:flags=lanczos', '-q:v', '4', path.join(OUT, `finish-${p.id}.jpg`)]);
  console.log(`ok finish-${p.id}.jpg`);
}
rmSync(tmp, { recursive: true, force: true });
