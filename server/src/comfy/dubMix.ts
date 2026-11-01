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

// ---------------- line-by-line timing (Translate a video) ----------------
/** Timing fit for a dub, our own method (idea from the research's "Smart Fit"; no code copied). Audio only: the picture is never retimed.
 *  - Each translated line starts where the original line started (Whisper's segment start).
 *  - A line that fits its original span plays as made. We never slow a line down (the research's 0.85× floor only matters when stretching).
 *  - A longer line takes half of the stretch as speed and half as time borrowed from the gap after it: speed = √(made / span), so a line 1.44× too
 *    long plays 1.2× faster and runs 20 % into the gap. If that still runs into the next line, it speeds up just enough to end before it.
 *  - Speed never goes over `maxSpeed` (default 1.2×, settable up to the 1.5× cap). A line still too long after that keeps its words: it runs into the
 *    next line's start, and the lines after it start a little later (0.05 s apart, never overlapping), catching up at the next pause. Flagged in the notes.
 */
export const DUB_SPEED = { default: 1.2, cap: 1.5, floor: 0.85 } as const;
export const DUB_GUARD_SEC = 0.05;
export type DubLine = { start: number; end: number; text?: string };
export type DubPlace = { at: number; speed: number; length: number; sped: boolean; late: boolean; overruns: boolean };
const r3 = (x: number) => Math.round(x * 1000) / 1000;
/** Where each line plays and how fast. lines in time order (Whisper's), made = each line's synthesised length (s), total = the clip's length (s). */
export function fitLines(lines: DubLine[], made: number[], total: number, maxSpeed: number = DUB_SPEED.default): DubPlace[] {
  const max = Math.min(DUB_SPEED.cap, Math.max(1, Number(maxSpeed) || DUB_SPEED.default)); let cursor = 0; const out: DubPlace[] = [];
  lines.forEach((l, i) => {
    const d = Math.max(0, Number(made[i]) || 0); const at = Math.max(l.start, cursor); const span = Math.max(0.1, l.end - l.start);
    const next = i < lines.length - 1 ? lines[i + 1].start : Math.max(total, l.end); // the next line's original start (or the clip's end)
    const room = Math.max(span, next - DUB_GUARD_SEC - at); // its own span plus the gap after it
    let speed = 1; if (d > span) { speed = Math.sqrt(d / span); if (d / speed > room) speed = d / room; speed = Math.min(max, Math.max(1, speed)); }
    const length = d / speed; const end = at + length;
    out.push({ at: r3(at), speed: r3(speed), length: r3(length), sped: speed > 1.0005, late: at > l.start + 0.01, overruns: end > (i < lines.length - 1 ? next - DUB_GUARD_SEC : Math.max(total, l.end)) + 1e-6 });
    cursor = end + DUB_GUARD_SEC;
  });
  return out;
}
/** Plain notes about a fit, for the job (none when every line fits as made). */
export function fitNotes(p: DubPlace[]): string[] {
  const n: string[] = []; const sped = p.filter((x) => x.sped); const over = p.slice(0, -1).filter((x) => x.overruns); const last = p.length && p[p.length - 1].overruns;
  const s = (k: number) => (k === 1 ? '1 line' : `${k} lines`);
  if (sped.length) n.push(`${s(sped.length)} sped up to fit the original timing (at most ${Math.max(...sped.map((x) => x.speed)).toFixed(2).replace(/0$/, '')}×).`);
  if (over.length) n.push(`${s(over.length)} still too long: ${over.length === 1 ? 'it runs' : 'they run'} into the next line, so the lines after start a little later.`);
  if (last) n.push('The last line runs past the end of the clip.');
  return n;
}
/** One ComfyUI prompt that voices every line: the TTS node and its save node cloned per line (ids "<node>-l2", …), same settings, each with its line.
 *  Line 1 keeps the graph's own nodes. Returns the save node of every line after the first (the pass's extra outputs, in order). */
export function lineGraph(g: Record<string, any>, node: string, save: string, field: string, texts: string[]): string[] {
  if (!g[node] || !g[save]) throw new Error(`graph has no node ${!g[node] ? node : save}`);
  const base = structuredClone(g[node]); const baseSave = structuredClone(g[save]); g[node].inputs[field] = texts[0] ?? ''; const extra: string[] = [];
  for (let k = 1; k < texts.length; k++) {
    const id = `${node}-l${k + 1}`; const sid = `${save}-l${k + 1}`; g[id] = structuredClone(base); g[id].inputs[field] = texts[k];
    g[sid] = structuredClone(baseSave); g[sid].inputs.audio = [id, 0]; if (typeof g[sid].inputs.filename_prefix === 'string') g[sid].inputs.filename_prefix += `-line${k + 1}`; extra.push(sid);
  }
  return extra;
}
