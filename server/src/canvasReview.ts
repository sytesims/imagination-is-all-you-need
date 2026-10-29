/**
 * The agent reviews its own versions (2026-10-27; the verdicts, words and recommendation are shared/takeReview.ts). This file runs the
 * reviewers that cost nothing:
 *  - the mock sandbox: deterministic sample reviews (fixtures), so a demo and the tests always see the same badges;
 *  - otherwise: free simple checks on this computer with ffmpeg (a 16 × 16 grey thumbnail: blank, near-black, a near-copy of an earlier
 *    version), plus the image header for the shape and size.
 * An MCP agent with vision reviews for real by looking at each version itself and posting canvas_review (no cost to the app). No paid
 * vision call exists here; one could plug in later only behind a quote and Go.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { config, DATA_DIR, SAMPLES_DIR } from './config.js';
import { imageDimsOfFile } from './imageDims.js';
import { judgeStats, sampleReview, type PixelStats, type TakeReview } from './shared/takeReview.js';

/** A board URL (/files/…, /samples/…) → the file on this computer, or null. */
export function fileOfUrl(url: string): string | null {
  const m = /^\/(files|samples)\/([^?#]+)/.exec(String(url ?? '')); if (!m) return null;
  const rel = decodeURIComponent(m[2]); if (rel.includes('..')) return null;
  const file = m[1] === 'files' ? path.join(DATA_DIR, path.basename(rel)) : path.join(SAMPLES_DIR, rel);
  return existsSync(file) ? file : null;
}
/** Mean, spread and an 8 × 8 average hash of a picture (ffmpeg, local, free). Null when it can't be read. */
export function pixelStats(file: string): Promise<PixelStats | null> {
  return new Promise((resolve) => {
    let c; try { c = spawn('ffmpeg', ['-v', 'error', '-i', file, '-frames:v', '1', '-vf', 'scale=8:8:flags=area,format=gray', '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'ignore'] }); } catch { resolve(null); return; }
    const chunks: Buffer[] = []; c.stdout.on('data', (b: Buffer) => chunks.push(b)); c.on('error', () => resolve(null));
    c.on('close', () => {
      const px = Buffer.concat(chunks); if (px.length < 64) { resolve(null); return; }
      const v = [...px.subarray(0, 64)]; const mean = v.reduce((s, x) => s + x, 0) / 64; const std = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / 64);
      let hash = ''; for (let i = 0; i < 64; i += 4) hash += ((v[i] > mean ? 8 : 0) | (v[i + 1] > mean ? 4 : 0) | (v[i + 2] > mean ? 2 : 0) | (v[i + 3] > mean ? 1 : 0)).toString(16);
      const d = imageDimsOfFile(file); resolve({ mean, std, hash, width: d?.width ?? null, height: d?.height ?? null });
    });
  });
}

export const reviewMode = () => (config.backend === 'mock' ? 'sample' : 'checks') as 'sample' | 'checks';
/** Reviews for one card's versions (in version order). `shot` keeps the sample reviews different from shot to shot. */
export async function reviewVersions(urls: string[], o: { shot: number; aspect?: string | null; mode?: 'sample' | 'checks' }): Promise<TakeReview[]> {
  const mode = o.mode ?? reviewMode();
  if (mode === 'sample') return urls.map((_, v) => sampleReview(o.shot, v));
  const out: TakeReview[] = []; const hashes: string[] = [];
  for (const u of urls) {
    const file = fileOfUrl(u); const s = file ? await pixelStats(file) : null;
    if (!s) { out.push({ verdict: 'check', reason: "I couldn't open this version to look at it", by: 'checks' }); continue; }
    out.push(judgeStats(s, { earlier: hashes, aspect: o.aspect })); hashes.push(s.hash);
  }
  return out;
}
