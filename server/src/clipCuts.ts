/**
 * Shot cuts in a clip (2026-11-03), for the Trim sheet: free, local, ffmpeg only. A clip with hard cuts breaks person-tracking swaps (a 16 s montage
 * with cuts at 1.67, 8, 11, 11.83 and 12.5 s: H3 swapped the first shots, then the original man came back), so the sheet marks the cuts on its
 * filmstrip and, for the swap tools, says when the chosen part spans one.
 *
 *   POST /api/clip-cuts   multipart video (file) | videoUrl (/files/… or /samples/…) → { cuts: [seconds…], free: true }
 *
 * Detector: ffmpeg's scene score (select + metadata=print lavfi.scene_score, frames at most 720 px wide), then a cut is a frame whose score is
 *   - at least CUT_MIN_SCORE (0.145), and
 *   - at least CUT_LOCAL_RATIO (3×) the median score of the frames around it (2–12 frames away), so a fast camera move or a busy shot, whose every
 *     frame scores high, doesn't count, and
 *   - at least CUT_MIN_GAP (0.3 s) after the last cut (the frame after a cut often scores high too).
 * Tuned on a real 16 s montage (24 fps, 720×1280): all five cuts found (scores 0.24, 0.45, 0.38, 0.150, 0.40), nothing else (the highest non-cut
 * frame scores 0.138). A jump cut inside one scene (11.83 s there) scores close to the floor, so it can be missed on another clip; a miss only
 * hides a note, it never blocks anything. Results are cached per file (path + size + mtime, or the upload's hash).
 */
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { DATA_DIR, SAMPLES_DIR } from './config.js';

export const CUT_MIN_SCORE = 0.145; export const CUT_LOCAL_RATIO = 3; export const CUT_MIN_GAP = 0.3; const NEAR = 12;

/** The cuts in a list of per-frame scene scores (pure: the rule above). */
export function cutsFromScores(rows: { t: number; s: number }[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const { t, s } = rows[i]; if (s < CUT_MIN_SCORE) continue;
    const nb = rows.filter((_, j) => Math.abs(j - i) >= 2 && Math.abs(j - i) <= NEAR).map((r) => r.s).sort((a, b) => a - b);
    const med = nb.length ? nb[Math.floor(nb.length / 2)] : 0; if (s < CUT_LOCAL_RATIO * Math.max(med, 0.01)) continue;
    const last = out[out.length - 1];
    if (last != null && t - last < CUT_MIN_GAP) { const prev = rows.find((r) => r.t === last)!; if (s > prev.s) out[out.length - 1] = t; continue; }
    out.push(t);
  }
  return out.map((t) => Math.round(t * 1000) / 1000);
}

/** ffmpeg's scene score for every frame (empty when the clip can't be read). */
function sceneScores(file: string): Promise<{ t: number; s: number }[]> {
  return new Promise((resolve) => {
    const c = spawn('ffmpeg', ['-v', 'error', '-i', file, '-an', '-sn', '-vf', "scale='min(iw,720)':-2,select='gte(scene,0)',metadata=print:key=lavfi.scene_score:file=-", '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let buf = ''; c.stdout.on('data', (d: Buffer) => { buf += d; });
    const kill = setTimeout(() => c.kill('SIGKILL'), 120_000);
    c.on('error', () => { clearTimeout(kill); resolve([]); });
    c.on('close', () => { clearTimeout(kill); const rows: { t: number; s: number }[] = []; let t: number | null = null;
      for (const l of buf.split('\n')) { const m = /pts_time:([\d.]+)/.exec(l); if (m) { t = Number(m[1]); continue; } const s = /scene_score=([\d.]+)/.exec(l); if (s && t != null) rows.push({ t, s: Number(s[1]) }); }
      resolve(rows); });
  });
}

const CACHE = new Map<string, Promise<number[]>>();
const remember = (key: string, run: () => Promise<number[]>) => { let p = CACHE.get(key); if (!p) { p = run().catch(() => []); CACHE.set(key, p); if (CACHE.size > 200) CACHE.delete(CACHE.keys().next().value!); } return p; };
/** The cuts in a file on this computer (cached per path, size and mtime). */
export function clipCuts(file: string): Promise<number[]> {
  const st = statSync(file); return remember(`${file}|${st.size}|${st.mtimeMs}`, async () => cutsFromScores(await sceneScores(file)));
}

const assetPath = (u: string) => !/^\/(files|samples)\/[\w\-./]+$/.test(u) || u.includes('..') ? null : u.startsWith('/files/') ? path.join(DATA_DIR, u.slice(7)) : path.join(SAMPLES_DIR, u.slice(9));
const fileHash = (f: string) => new Promise<string>((ok, no) => { const h = createHash('sha1'); createReadStream(f).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', no); });

export function registerClipCuts(app: FastifyInstance) {
  app.post('/api/clip-cuts', async (req, reply) => {
    const fields: Record<string, string> = {}; let up: string | null = null;
    try {
      if (req.isMultipart()) for await (const part of req.parts()) {
        if (part.type === 'file') { if (part.fieldname !== 'video' || up) { part.file.resume(); continue; }
          up = path.join(DATA_DIR, `cuts-${randomUUID().slice(0, 8)}${path.extname(part.filename || '').toLowerCase() || '.mp4'}`); await pipeline(part.file, createWriteStream(up)); }
        else fields[part.fieldname] = String(part.value);
      } else Object.assign(fields, (req.body ?? {}) as Record<string, string>);
      const file = up ?? (fields.videoUrl ? assetPath(fields.videoUrl) : null);
      if (!file || !existsSync(file)) return reply.code(400).send({ error: 'Send the clip (field video) or a /files/ or /samples/ videoUrl.', errorType: 'validation', cuts: [] });
      const cuts = up ? await remember(`sha1:${await fileHash(up)}`, async () => cutsFromScores(await sceneScores(up!))) : await clipCuts(file);
      return { cuts, free: true };
    } finally { if (up) await rm(up, { force: true }).catch(() => undefined); }
  });
}
