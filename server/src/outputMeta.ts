import { sampleFor, type SampleCredit } from './sampleMedia.js';
/**
 * B5: per-output media metadata for the result overlay (Size row, frame sizing before load,
 * blurred video backdrop). Each output keeps {label, url} and gains {kind, width, height, durationSec, posterUrl}.
 * - Probed once per file with ffprobe and cached by URL in SQLite kv (`outputMeta`); local files only (/files, /samples, /examples).
 * - Video posters: the sibling `<name>.jpg` when it exists (our example media ships one), else `/api/media/poster?url=<url>`,
 *   which extracts the first frame with ffmpeg on first request (DATA_DIR/posters/, cached). Images use their own URL; audio has none.
 * - At most 4 ffprobe processes run at once.
 * - Until a file is probed the output carries only `kind` (and nulls); the probe runs in the background, and GET /api/jobs/:id
 *   and GET /api/share/:token wait for it (warmOutputs) so a single result always has full metadata.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, SAMPLES_DIR } from './config.js';
import { del, getKv, setKv } from './db.js';
import { runFfmpeg } from './ffmpeg.js';

export type MediaKind = 'image' | 'video' | 'audio' | '3d'; // 3d: a GLB (3D page, 2026-10-23): no probe; its poster is the still the viewer saved
export interface OutputMeta { kind: MediaKind | null; width: number | null; height: number | null; durationSec: number | null; posterUrl: string | null; /** video: has a sound track (Add sound asks Replace or Mix only then); absent on older cache rows */ hasAudio?: boolean | null }

import { examplesFileOf } from './interimTiles.js';
const WEB_PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/public');
export const kindOfUrl = (u?: string | null): MediaKind | null => !u ? null : /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u) ? 'video' : /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u) ? 'image' : /\.(m4a|mp3|wav|ogg|flac|aac|opus)(\?|$)/i.test(u) ? 'audio' : /\.glb(\?|$)/i.test(u) ? '3d' : null;
/** Local file behind an output URL (/files → DATA_DIR, /samples → server/samples, /examples → web/public/examples), or null. */
export function localFileOf(u?: string | null): string | null {
  if (!u || u.includes('..')) return null; const p = u.split('?')[0];
  const f = p.startsWith('/files/') ? path.join(DATA_DIR, p.slice(7)) : p.startsWith('/samples/') ? path.join(SAMPLES_DIR, p.slice(9)) : p.startsWith('/examples/') ? (examplesFileOf(p.slice('/examples/'.length)) ?? path.join(WEB_PUBLIC, p)) : p.startsWith('/showcase/') ? path.join(WEB_PUBLIC, p) /* Featured generations (shared/featured.ts) */ : null;
  return f && existsSync(f) ? f : null;
}

const KV = 'outputMeta.v2';
del('kv', 'outputMeta'); // pre-release cache format (eager posters), dropped
const cache = new Map<string, OutputMeta>(Object.entries(getKv<Record<string, OutputMeta>>(KV, {})));
let saveTimer: NodeJS.Timeout | null = null;
const save = () => { if (saveTimer) return; saveTimer = setTimeout(() => { saveTimer = null; setKv(KV, Object.fromEntries(cache)); }, 300); saveTimer.unref?.(); };
const pending = new Map<string, Promise<OutputMeta>>();

function ffprobe(file: string): Promise<{ width: number | null; height: number | null; durationSec: number | null; hasAudio: boolean } | null> {
  return new Promise((res) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', file]); let out = '';
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', () => undefined);
    p.on('error', () => res(null));
    p.on('close', (code) => { if (code !== 0) return res(null); try { const j = JSON.parse(out); const v = (j.streams || []).find((s: any) => s.codec_type === 'video');
      const d = Number(j.format?.duration); res({ width: v?.width ?? null, height: v?.height ?? null, durationSec: Number.isFinite(d) && d > 0 ? Math.round(d * 100) / 100 : null, hasAudio: (j.streams || []).some((s: any) => s.codec_type === 'audio') }); } catch { res(null); } });
  });
}

/** Poster URL for a video output (no work done here; the poster route renders lazily). */
function posterFor(url: string): string {
  const sib = url.split('?')[0].replace(/\.(mp4|mov|webm|m4v)$/i, '.jpg'); if (sib !== url && localFileOf(sib)) return sib;
  return `/api/media/poster?url=${encodeURIComponent(url)}`;
}
/** Full-size first-frame JPEG for a local video URL (DATA_DIR/posters, cached). Returns the file path, or null. */
export async function renderPoster(url: string): Promise<string | null> {
  const file = localFileOf(url); if (!file || kindOfUrl(url) !== 'video') return null;
  const dir = path.join(DATA_DIR, 'posters'); const dst = path.join(dir, `${createHash('sha1').update(url).digest('hex').slice(0, 16)}.jpg`);
  if (!existsSync(dst)) { mkdirSync(dir, { recursive: true }); const code = await runFfmpeg(['-y', '-v', 'error', '-ss', '0', '-i', file, '-frames:v', '1', '-q:v', '3', dst]); if (code !== 0 || !existsSync(dst)) return null; }
  return dst;
}
/** a video row cached before hasAudio was probed: probed again once (in the background; GET /api/jobs/:id waits) */
const stale = (m: OutputMeta) => m.kind === 'video' && m.hasAudio === undefined;
let running = 0; const waiters: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 4) await new Promise<void>((r) => waiters.push(r)); running++;
  try { return await fn(); } finally { running--; waiters.shift()?.(); }
}

/** Probe one URL (deduplicated, cached). Remote or missing files get {kind} + nulls (not cached, so a later file can still be probed). */
export function probeOutput(url: string): Promise<OutputMeta> {
  const hit = cache.get(url); if (hit && !stale(hit)) return Promise.resolve(hit);
  const p0 = pending.get(url); if (p0) return p0;
  const kind = kindOfUrl(url); const file = localFileOf(url);
  if (!file || !kind || kind === '3d') return Promise.resolve({ kind, width: null, height: null, durationSec: null, posterUrl: kind === 'image' ? url : null });
  const g = gen.get(url) ?? 0; // a probe that started before forgetOutputMeta() must not cache the old size
  const p: Promise<OutputMeta> = (async () => {
    const pr = await limited(() => ffprobe(file));
    const m: OutputMeta = { kind, width: pr?.width ?? null, height: pr?.height ?? null, durationSec: kind === 'image' ? null : pr?.durationSec ?? null,
      posterUrl: kind === 'image' ? url : kind === 'video' && pr?.width ? posterFor(url) : null };
    if (kind === 'video' && pr) m.hasAudio = pr.hasAudio;
    if (kind === 'audio') { m.width = null; m.height = null; }
    if (pr && (gen.get(url) ?? 0) === g) { cache.set(url, m); save(); }
    return m;
  })().finally(() => { if (pending.get(url) === p) pending.delete(url); });
  pending.set(url, p); return p;
}

/** Cached metadata only (no probe started): the references database reads sizes for a page of items without spawning a probe per file. */
export const cachedMeta = (url: string): OutputMeta | null => cache.get(url) ?? null;
/** Sync view for serializers: cached metadata, or {kind} + nulls while the background probe runs. */
export function metaOf(url: string): OutputMeta {
  const hit = cache.get(url); if (hit) { if (stale(hit)) void probeOutput(url); return hit; }
  void probeOutput(url); const kind = kindOfUrl(url);
  return { kind, width: null, height: null, durationSec: null, posterUrl: kind === 'image' ? url : kind === 'video' && localFileOf(url) ? posterFor(url) : null };
}
/** Outputs with B5 fields added (existing fields untouched; an output's own values win). */
/** + sample: Blender open-movie sample clips carry {label:'Sample · CC-BY Blender Foundation', film, credit, license, …} (sampleMedia.ts); else null. */
export const withOutputMeta = <T extends { url: string }>(outs: T[] | undefined | null): (T & OutputMeta & { sample: SampleCredit | null })[] => (outs ?? []).map((o) => ({ ...metaOf(o.url), sample: sampleFor(o.url), ...o }));
/** Await metadata for every output of a job (used before serializing a single result). */
export async function warmOutputs(outs: { url: string }[] | undefined | null): Promise<void> { await Promise.all((outs ?? []).map((o) => probeOutput(o.url).catch(() => null))); }
/** Drop the cached probe of a file that was rewritten in place (e.g. the Upscale sample render, resized after the job went done). */
const gen = new Map<string, number>();
export function forgetOutputMeta(url: string): void { gen.set(url, (gen.get(url) ?? 0) + 1); cache.delete(url); pending.delete(url); save(); }
