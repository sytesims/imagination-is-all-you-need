import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';

export interface Probe { duration: number; width: number; height: number; hasAudio: boolean; /** frames per second (r_frame_rate), when ffprobe says */ fps?: number }

function run(cmd: string, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((res) => {
    const p = spawn(cmd, args); let out = '';
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', () => undefined);
    p.on('close', (code) => res({ code: code ?? 1, out })); p.on('error', () => res({ code: 1, out: '' }));
  });
}

/** Probes of unchanged files (same path, size and mtime): a submit, its quote and the prompt peek read the same upload several times. Only successes are kept. */
const probes = new Map<string, Probe>();
export async function probe(file: string): Promise<Probe | null> {
  let key: string | null = null; try { const st = statSync(file); key = `${file}|${st.size}|${st.mtimeMs}`; } catch { /* missing: ffprobe says so */ }
  const hit = key ? probes.get(key) : undefined; if (hit) return { ...hit };
  const p = await probeOnce(file); if (p && key) { if (probes.size > 500) probes.clear(); probes.set(key, p); } return p ? { ...p } : null;
}
async function probeOnce(file: string): Promise<Probe | null> {
  const r = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate', '-of', 'json', file]);
  if (r.code !== 0) return null;
  try {
    const j = JSON.parse(r.out);
    const v = (j.streams || []).find((s: any) => s.codec_type === 'video');
    if (!v) return null;
    const [fn, fd] = String(v.r_frame_rate ?? '').split('/').map(Number); const fps = fn > 0 && (fd || 1) > 0 ? Math.round((fn / (fd || 1)) * 1000) / 1000 : undefined;
    return { duration: Number(j.format?.duration) || 0, width: v.width, height: v.height, hasAudio: (j.streams || []).some((s: any) => s.codec_type === 'audio'), ...(fps ? { fps } : {}) };
  } catch { return null; }
}

/** Copy the first `seconds` of a clip (stream copy). */
export async function trim(src: string, dst: string, seconds: number): Promise<boolean> {
  return (await run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-t', String(seconds), '-c', 'copy', dst])).code === 0;
}

/** Spec limits (CLEANROOM-SPEC P0-1 errors): defined once in shared/mediaAccept.ts, so the web's upload checks read the same numbers. */
export { LIMITS, RESOLUTIONS } from './shared/mediaAccept.js';
