/**
 * Voice tools' final mix (Translate a video, Change Voice; 2026-11-01): the new voice placed over the beds (the separated background, or the
 * ducked original when separation isn't there) in one ffmpeg pass. Pure: builds the ffmpeg arguments, runs nothing (runNative.ts runs them).
 */
/** A sound under the voice: a file (separated background, or the source clip) at this volume (1 = as is). */
export type BedIn = { file: string; volume: number };
/** One voice part: a file, where it starts in the clip (seconds) and how much faster it plays (1 = as made). */
export type VoiceIn = { file: string; at: number; speed: number };
const n3 = (x: number) => String(Math.round(x * 1000) / 1000);

/** ffmpeg arguments: every input resampled to 44.1 kHz stereo; beds at their volume, voices sped up (atempo) and delayed to their start;
 *  all mixed without level normalisation (normalize=0, so the background keeps its level), with a limiter so a loud bed + voice never clips. */
export function voiceMixArgs(beds: BedIn[], voices: VoiceIn[], out: string): string[] {
  const ins = [...beds.map((b) => b.file), ...voices.map((v) => v.file)]; if (!voices.length) throw new Error('no voice to mix');
  const norm = 'aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo';
  const f: string[] = []; const labels: string[] = [];
  beds.forEach((b, k) => { f.push(`[${k}:a]${norm}${b.volume !== 1 ? `,volume=${n3(b.volume)}` : ''}[b${k}]`); labels.push(`[b${k}]`); });
  voices.forEach((v, k) => { const ms = Math.max(0, Math.round(v.at * 1000));
    f.push(`[${beds.length + k}:a]${norm}${Math.abs(v.speed - 1) > 1e-3 ? `,atempo=${n3(v.speed)}` : ''}${ms > 0 ? `,adelay=${ms}:all=1` : ''}[v${k}]`); labels.push(`[v${k}]`); });
  f.push(labels.length > 1 ? `${labels.join('')}amix=inputs=${labels.length}:duration=longest:normalize=0,alimiter=limit=0.95[a]` : `${labels[0]}anull[a]`);
  return ['-y', ...ins.flatMap((x) => ['-i', x]), '-filter_complex', f.join(';'), '-map', '[a]', '-c:a', 'pcm_s16le', out];
}
