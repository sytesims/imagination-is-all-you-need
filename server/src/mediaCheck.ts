/**
 * Upload quality checks shared by POST /api/media and POST /api/precheck.
 * Images: unreadable (can't be decoded), low_res, dark (all-black is blocking, very dark/bright is a warning).
 * Audio: unreadable, too_short, silent. Codes match PrecheckWarning codes.
 */
import { spawn } from 'node:child_process';

export interface MediaIssue { code: 'unreadable' | 'low_res' | 'dark' | 'too_short' | 'too_long' | 'silent'; field: string; severity: 'block' | 'warn' | 'info'; message: string }
export interface MediaCheck { kind: 'image' | 'audio'; ok: boolean; issues: MediaIssue[]; width?: number; height?: number; duration?: number; luma?: number | null; maxVolumeDb?: number | null }

/** Image: shorter side under BLOCK → rejected; under WARN → flagged. */
export const IMAGE_MIN_SIDE_BLOCK = 128;
export const IMAGE_MIN_SIDE_WARN = 512;
/** Audio (voice samples): shorter than this → too_short. Peak below SILENT_DB → silent. */
export const AUDIO_MIN_SEC = 3;
export const AUDIO_MAX_SEC = 600;
export const SILENT_DB = -60;

function run(cmd: string, args: string[], ms = 20000): Promise<{ code: number; out: string; err: string; timedOut?: boolean }> {
  return new Promise((res) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = '';
    let timedOut = false; const t = setTimeout(() => { timedOut = true; p.kill('SIGKILL'); }, ms);
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; if (err.length > 200_000) err = err.slice(-100_000); });
    p.on('close', (code) => { clearTimeout(t); res({ code: code ?? 1, out, err, ...(timedOut ? { timedOut } : {}) }); }); p.on('error', () => { clearTimeout(t); res({ code: 1, out: '', err: 'spawn failed' }); });
  });
}

export async function checkImage(file: string, field = 'file'): Promise<MediaCheck> {
  const issues: MediaIssue[] = [];
  const pr = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file]);
  let width = 0, height = 0;
  try { const s = JSON.parse(pr.out).streams?.[0]; width = Number(s?.width) || 0; height = Number(s?.height) || 0; } catch { /* unreadable */ }
  // A truncated/corrupt file can still have a readable header: decode one frame and treat any decoder error as unreadable.
  const dec = pr.code === 0 && width > 0 ? await run('ffmpeg', ['-hide_banner', '-nostats', '-xerror', '-i', file, '-frames:v', '1', '-vf', 'format=gray,signalstats,metadata=print', '-f', 'null', '-']) : null;
  // A check that timed out (busy machine) or could not spawn ffmpeg says nothing about the file: never block on it.
  if (pr.timedOut || dec?.timedOut || pr.err === 'spawn failed') return { kind: 'image', ok: true, issues: [] };
  if (!dec || dec.code !== 0 || /\berror\b|invalid|corrupt/i.test(dec.err.replace(/[^\n]*lavfi\.[^\n]*/g, ''))) {
    issues.push({ code: 'unreadable', field, severity: 'block', message: "Couldn't read this image. The file may be damaged; export it again as PNG or JPG." });
    return { kind: 'image', ok: false, issues };
  }
  const yavg = /YAVG=([\d.]+)/.exec(dec.err)?.[1] ?? /YAVG=([\d.]+)/.exec(dec.out)?.[1]; const ymax = /YMAX=([\d.]+)/.exec(dec.err + dec.out)?.[1];
  const luma = yavg != null ? Number(yavg) : null; const peak = ymax != null ? Number(ymax) : null;
  const side = Math.min(width, height);
  if (side < IMAGE_MIN_SIDE_BLOCK) issues.push({ code: 'low_res', field, severity: 'block', message: `This image is ${width}×${height}. Use at least ${IMAGE_MIN_SIDE_BLOCK}px on the shorter side (${IMAGE_MIN_SIDE_WARN}px or more recommended).` });
  else if (side < IMAGE_MIN_SIDE_WARN) issues.push({ code: 'low_res', field, severity: 'warn', message: `This image is ${width}×${height}; ${IMAGE_MIN_SIDE_WARN}px or more on the shorter side gives better results.` });
  if (luma != null && luma < 3 && (peak == null || peak < 12)) issues.push({ code: 'dark', field, severity: 'block', message: 'This image is completely black. Choose a photo with visible content.' });
  else if (luma != null && (luma < 20 || luma > 240)) issues.push({ code: 'dark', field, severity: 'warn', message: luma < 20 ? 'This image is very dark.' : 'This image is very bright / washed out.' });
  return { kind: 'image', ok: !issues.some((i) => i.severity === 'block'), issues, width, height, luma };
}

export async function checkAudio(file: string, field = 'file', minSec = AUDIO_MIN_SEC): Promise<MediaCheck> {
  const issues: MediaIssue[] = [];
  const pr = await run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type,sample_rate,channels:format=duration', '-of', 'json', file]);
  let duration = 0, hasAudio = false, rate = 0, ch = 0;
  try { const j = JSON.parse(pr.out); hasAudio = (j.streams ?? []).length > 0; rate = Number(j.streams?.[0]?.sample_rate) || 0; ch = Number(j.streams?.[0]?.channels) || 0; duration = Number(j.format?.duration) || 0; } catch { /* unreadable */ }
  const vol = pr.code === 0 && hasAudio ? await run('ffmpeg', ['-hide_banner', '-nostats', '-xerror', '-i', file, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], 30000) : null;
  // The container duration can be an estimate (truncated MP3): use the decoded sample count when we have it.
  const ns = [...(vol?.err ?? '').matchAll(/n_samples:\s*(\d+)/g)].at(-1); if (ns && rate > 0 && ch > 0) duration = Number(ns[1]) / (rate * ch);
  if (!vol || vol.code !== 0 || !(duration > 0)) {
    issues.push({ code: 'unreadable', field, severity: 'block', message: "Couldn't read this audio. Use a WAV, MP3 or M4A file." });
    return { kind: 'audio', ok: false, issues };
  }
  const mx = /max_volume:\s*(-?[\d.]+|-inf) dB/.exec(vol?.err ?? ''); const maxVolumeDb = mx ? (mx[1] === '-inf' ? -Infinity : Number(mx[1])) : null;
  if (duration < minSec) issues.push({ code: 'too_short', field, severity: 'block', message: `This sample is ${duration.toFixed(1)} s. Voice samples need at least ${minSec} seconds.` });
  if (duration > AUDIO_MAX_SEC) issues.push({ code: 'too_long', field, severity: 'warn', message: `This sample is ${Math.round(duration)} s; only the first ${AUDIO_MAX_SEC / 60} minutes are used.` });
  if (maxVolumeDb != null && maxVolumeDb < SILENT_DB) issues.push({ code: 'silent', field, severity: 'block', message: 'This audio is silent. Record a sample where the voice is clearly audible.' });
  return { kind: 'audio', ok: !issues.some((i) => i.severity === 'block'), issues, duration: +duration.toFixed(2), maxVolumeDb: maxVolumeDb === -Infinity ? null : maxVolumeDb };
}
