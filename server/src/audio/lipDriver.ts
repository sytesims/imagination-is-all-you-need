/**
 * Lip driver for LTX-2.5 lip sync (Voice → Talking photo on comfy-ltx25-lipsync, 2026-10-26).
 *
 * LTX-2.5's audio-to-video path conditions the clip on an audio latent. A plain speech clip often gives weak or late mouth motion; the
 * QuokkaiLab fix (sducly, MIT, https://github.com/sducly/quokkai-lab-ltx25-lipsync-fix) feeds the model a processed copy of the speech and
 * keeps the clean speech as the soundtrack. Its node needs scipy 1.15 and soundfile in ComfyUI's Python, so we rebuild the same numbers here
 * in TypeScript and hand ComfyUI two ready WAV files (nothing is installed in ComfyUI):
 *  - the "ringmod70" driver (their driver.py): x · (0.55 + 0.45·cos(2π·70·t)), an order-2 Butterworth band-pass 180–6500 Hz run forward and
 *    backward (scipy sosfiltfilt, odd padding), peak normalised to 0.95, the original samples kept before the first and after the last
 *    −40 dBFS crossing, and exact digital silence kept silent;
 *  - the timing (their timing.py, with the settings of their shipped workflow): leading / trailing silence trimmed at −40 dBFS (20 ms kept),
 *    0.5 s of silence before the speech, 1 s after and a 0.3 s margin, shrunk (margin, then after, then before) to fit the ≤ 5 s cap;
 *    the frame count fitted to 8k + 1 at 24 fps (max 113 frames = 4.71 s). Both files get the same placement.
 * Our additions: a speech still too long after the pads are gone is cut at the cap (a warning says so; chaining longer takes comes later);
 * clips are at least 49 frames (2 s), the Talking photo minimum; any channel count is averaged to mono and resampled to 48 kHz first.
 * The DSP is pure (tests compare it with scipy's numbers); only prepareLipAudio touches ffmpeg and the disk.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export const LIP_FPS = 24;
export const LIP_SAMPLE_RATE = 48000;
/** The local cap for now (Quokka's max_duration): 5 s → at most 113 frames = 4.71 s on the 8k + 1 grid. */
export const LIP_MAX_SECONDS = 5;
export const LIP_MIN_FRAMES = 49;
/** QuokkaiLab's shipped workflow settings (workflows/ltx25-quokkailab-fix.json, node QuokkaiLabAudioConditioning). */
export const LIP_TIMING = { thresholdDb: -40, minKeepMs: 20, before: 0.5, after: 1.0, margin: 0.3 } as const;
const THRESH = 10 ** (LIP_TIMING.thresholdDb / 20); // 0.01

// ---------- Butterworth band-pass (scipy.signal.butter(2, [lo, hi], 'bandpass', fs=fs, output='sos')) ----------
type C = [number, number];
const cadd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]]; const csub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a: C, b: C): C => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const csqrt = (a: C): C => { const r = Math.hypot(a[0], a[1]); const re = Math.sqrt((r + a[0]) / 2); const im = Math.sqrt(Math.max(0, (r - a[0]) / 2)); return [re, a[1] < 0 ? -im : im]; };
/** Second-order sections [b0, b1, b2, 1, a1, a2] × 2, the same values scipy returns (gain on the first section, zeros at −1 then +1). */
export function butterBandpassSos(lo: number, hi: number, fs: number): number[][] {
  const warp = (f: number) => 4 * Math.tan((Math.PI * (2 * f / fs)) / 2); // scipy: fs normalised to 2, pre-warped
  const w1 = warp(lo), w2 = warp(hi); const bw = w2 - w1; const wo2 = w1 * w2;
  const proto: C[] = [[-Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2]]; // buttap(2)
  const pbp: C[] = [];
  for (const p of proto) { const pl: C = [p[0] * bw / 2, p[1] * bw / 2]; const s = csqrt(csub(cmul(pl, pl), [wo2, 0])); pbp.push(cadd(pl, s), csub(pl, s)); }
  const kbp = bw * bw;
  const pz = pbp.map((p) => cdiv(cadd([4, 0], p), csub([4, 0], p))); // bilinear, fs2 = 4
  let den: C = [1, 0]; for (const p of pbp) den = cmul(den, csub([4, 0], p)); const kz = kbp * cdiv([16, 0], den)[0]; // scipy: k·real(prod(fs2 − z) / prod(fs2 − p)), z = [0, 0] → 4² = 16
  const upper = pz.filter((p) => p[1] > 0).sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1])); // one of each conjugate pair; the pole nearest the unit circle last
  const a = (p: C) => [1, -2 * p[0], p[0] * p[0] + p[1] * p[1]];
  return [[kz, 2 * kz, kz, ...a(upper[0])], [1, -2, 1, ...a(upper[1])]];
}
function lfilterZi(s: number[]): [number, number] { // scipy.signal.lfilter_zi for one biquad (a0 = 1)
  const [b0, b1, b2, , a1, a2] = s; const B1 = b1 - a1 * b0, B2 = b2 - a2 * b0;
  // (I − companion(a)ᵀ) zi = B, companion(a)ᵀ = [[−a1, 1], [−a2, 0]]
  const m00 = 1 + a1, m01 = -1, m10 = a2, m11 = 1; const det = m00 * m11 - m01 * m10;
  return [(B1 * m11 - m01 * B2) / det, (m00 * B2 - m10 * B1) / det];
}
function sosfiltZi(sos: number[][]): [number, number][] {
  let scale = 1; return sos.map((s) => { const z = lfilterZi(s); const out: [number, number] = [z[0] * scale, z[1] * scale]; scale *= (s[0] + s[1] + s[2]) / (1 + s[4] + s[5]); return out; });
}
function sosfilt(sos: number[][], x: Float64Array, zi: [number, number][]): Float64Array {
  let y = Float64Array.from(x);
  for (let k = 0; k < sos.length; k++) { const [b0, b1, b2, , a1, a2] = sos[k]; let [z0, z1] = zi[k]; const o = new Float64Array(y.length);
    for (let n = 0; n < y.length; n++) { const xn = y[n]; const yn = b0 * xn + z0; z0 = b1 * xn - a1 * yn + z1; z1 = b2 * xn - a2 * yn; o[n] = yn; }
    y = o; }
  return y;
}
/** scipy.signal.sosfiltfilt(sos, x) with its defaults (padtype 'odd', padlen 3·(2·sections + 1)). */
export function sosfiltfilt(sos: number[][], x: Float64Array): Float64Array {
  const pad = 3 * (2 * sos.length + 1); if (x.length <= pad) throw new Error(`lip driver: audio too short to filter (${x.length} samples)`);
  const n = x.length; const ext = new Float64Array(n + 2 * pad);
  for (let i = 0; i < pad; i++) { ext[i] = 2 * x[0] - x[pad - i]; ext[n + pad + i] = 2 * x[n - 1] - x[n - 2 - i]; }
  ext.set(x, pad);
  const zi = sosfiltZi(sos);
  const f = sosfilt(sos, ext, zi.map(([a, b]) => [a * ext[0], b * ext[0]] as [number, number])); f.reverse();
  const r = sosfilt(sos, f, zi.map(([a, b]) => [a * f[0], b * f[0]] as [number, number])); r.reverse();
  return r.subarray(pad, pad + n).slice();
}

// ---------- the ringmod70 driver (QuokkaiLab driver.py make_driver) ----------
/** First and last sample above −40 dBFS (|x| > 0.01), or null when the clip is silent. */
export function activeRange(x: Float64Array): [number, number] | null {
  let a = -1, b = -1; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > THRESH) { if (a < 0) a = i; b = i; }
  return a < 0 ? null : [a, b];
}
export function ringmod70Driver(x: Float64Array, sr: number): Float64Array {
  const act = activeRange(x); if (!act) throw new Error('No speech found above −40 dBFS.');
  const m = new Float64Array(x.length); for (let n = 0; n < x.length; n++) m[n] = x[n] * (0.55 + 0.45 * Math.cos(2 * Math.PI * 70 * (n / sr)));
  const y = sosfiltfilt(butterBandpassSos(180, 6500, sr), m);
  let peak = 0; for (const v of y) peak = Math.max(peak, Math.abs(v)); if (peak) for (let i = 0; i < y.length; i++) y[i] *= 0.95 / peak;
  for (let i = 0; i <= act[0]; i++) y[i] = x[i]; for (let i = act[1]; i < x.length; i++) y[i] = x[i];
  for (let i = 0; i < x.length; i++) if (x[i] === 0) y[i] = 0;
  return y;
}

// ---------- timing (QuokkaiLab timing.py AudioTiming.process) ----------
export interface LipTiming {
  sampleRate: number; fps: number;
  /** speech kept, in input samples [start, end) */ start: number; end: number;
  /** pads in seconds after the cap shrank them */ before: number; after: number; margin: number;
  frames: number; k: number;
  /** clip length = frames / fps */ seconds: number;
  /** what TrimAudioDuration keeps for the audio latent: (8k + 1e-4) / fps, as Quokka */ audioSeconds: number;
  speechSeconds: number; trimmedLeading: number; trimmedTrailing: number;
  /** the speech (after trimming silence) was longer than the cap and was cut at it */ cappedFrom?: number;
  beforeSamples: number; tailSamples: number;
}
export function lipTiming(x: Float64Array, sr: number, o: { maxSeconds?: number; fps?: number; minFrames?: number } = {}): LipTiming {
  const fps = o.fps ?? LIP_FPS; const maxSeconds = Math.min(LIP_MAX_SECONDS, o.maxSeconds ?? LIP_MAX_SECONDS); const minFrames = o.minFrames ?? LIP_MIN_FRAMES;
  const act = activeRange(x); if (!act) throw new Error('No speech found above −40 dBFS.');
  const keep = Math.round((LIP_TIMING.minKeepMs * sr) / 1000);
  const start = Math.max(0, act[0] - keep); let end = Math.min(x.length, act[1] + 1 + keep);
  const trimmedLeading = start / sr; const trimmedTrailing = (x.length - end) / sr;
  let raw = (end - start) / sr;
  const maxK = Math.max(0, Math.floor((Math.floor(maxSeconds * fps) - 1) / 8)); const maxEff = (1 + 8 * maxK) / fps;
  let before: number = LIP_TIMING.before, after: number = LIP_TIMING.after, margin: number = LIP_TIMING.margin;
  let over = Math.max(0, raw + before + after + margin - maxEff);
  let cut = Math.min(margin, over); margin -= cut; over -= cut; cut = Math.min(after, over); after -= cut; over -= cut; cut = Math.min(before, over); before -= cut; over -= cut;
  let cappedFrom: number | undefined;
  if (over > 1e-6) { cappedFrom = raw; end = start + Math.floor(maxEff * sr); raw = (end - start) / sr; }
  const desired = raw + before + after + margin;
  const kMin = Math.ceil((minFrames - 1) / 8);
  const k = Math.min(maxK, Math.max(kMin, Math.ceil((desired * fps - 1) / 8 - 1e-9)));
  const frames = 1 + 8 * k; const seconds = frames / fps;
  const beforeSamples = Math.round(before * sr); const tailSamples = Math.round(Math.max(0, seconds - (raw + before)) * sr);
  return { sampleRate: sr, fps, start, end, before, after, margin, frames, k, seconds, audioSeconds: (8 * k + 1e-4) / fps, speechSeconds: raw, trimmedLeading, trimmedTrailing, cappedFrom, beforeSamples, tailSamples };
}
/** The placed clip: silence before, the kept speech, silence to the clip's end (a 20 ms fade where the cap cut the speech). */
export function placeAudio(x: Float64Array, t: LipTiming): Float64Array {
  const seg = x.slice(t.start, t.end);
  if (t.cappedFrom) { const f = Math.min(seg.length, Math.round(0.02 * t.sampleRate)); for (let i = 0; i < f; i++) seg[seg.length - 1 - i] *= i / f; }
  const out = new Float64Array(t.beforeSamples + seg.length + t.tailSamples); out.set(seg, t.beforeSamples); return out;
}

// ---------- files ----------
/** 24-bit PCM mono WAV (Quokka writes PCM_24). */
export function wavPcm24(samples: Float64Array, sr: number): Buffer {
  const n = samples.length; const buf = Buffer.alloc(44 + n * 3);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 3, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 3, 28); buf.writeUInt16LE(3, 32); buf.writeUInt16LE(24, 34); buf.write('data', 36); buf.writeUInt32LE(n * 3, 40);
  for (let i = 0; i < n; i++) { const v = Math.max(-8388608, Math.min(8388607, Math.round(Math.max(-1, Math.min(1, samples[i])) * 8388607))); buf.writeIntLE(v, 44 + i * 3, 3); }
  return buf;
}
const run = (cmd: string, args: string[]): Promise<Buffer> => new Promise((ok, bad) => {
  const p = spawn(cmd, args); const out: Buffer[] = []; let err = ''; p.stdout.on('data', (d) => out.push(d)); p.stderr.on('data', (d) => (err += d));
  p.on('error', bad); p.on('close', (c) => (c === 0 ? ok(Buffer.concat(out)) : bad(new Error(`${cmd} failed: ${err.trim().slice(0, 300)}`))));
});
/** Decode any audio (or a video's sound) to mono 48 kHz: channels averaged, as Quokka's mean over channels. */
export async function decodeMono(file: string, sr = LIP_SAMPLE_RATE): Promise<Float64Array> {
  const ch = Number((await run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', file])).toString().trim()) || 1;
  const raw = await run('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ar', String(sr), '-f', 'f32le', '-acodec', 'pcm_f32le', 'pipe:1']);
  const f = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4 / ch) * ch); const n = f.length / ch; const x = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < ch; c++) s += f[i * ch + c]; x[i] = s / ch; }
  return x;
}
export interface LipAudio { driverPath: string; cleanPath: string; timing: LipTiming; fix: boolean; warnings: string[] }
/**
 * The two files ComfyUI loads: the driver (fix on: ringmod70; off: the placed clean speech, for an A/B) and the clean soundtrack.
 * Named by the source's content + settings, so a repeat parse of the same clip reuses them. Throws on a silent clip.
 */
export async function prepareLipAudio(src: string, outDir: string, o: { fix?: boolean; maxSeconds?: number } = {}): Promise<LipAudio> {
  const fix = o.fix !== false; const maxSeconds = Math.min(LIP_MAX_SECONDS, o.maxSeconds ?? LIP_MAX_SECONDS);
  let x = await decodeMono(src);
  let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v)); if (peak >= 1) { const g = 0.98 / peak; x = x.map((v) => v * g); } // Quokka refuses clipped input; we scale it under 1
  const t = lipTiming(x, LIP_SAMPLE_RATE, { maxSeconds });
  const h = createHash('sha1').update(readFileSync(src)).update(JSON.stringify({ v: 1, fix, maxSeconds })).digest('hex').slice(0, 16);
  mkdirSync(outDir, { recursive: true });
  const driverPath = path.join(outDir, `lip-${h}-driver.wav`); const cleanPath = path.join(outDir, `lip-${h}-clean.wav`);
  if (!existsSync(cleanPath)) writeFileSync(cleanPath, wavPcm24(placeAudio(x, t), LIP_SAMPLE_RATE));
  if (!existsSync(driverPath)) writeFileSync(driverPath, wavPcm24(placeAudio(fix ? ringmod70Driver(x, LIP_SAMPLE_RATE) : x, t), LIP_SAMPLE_RATE));
  const warnings: string[] = [];
  if (t.cappedFrom) warnings.push(`The speech is ${t.cappedFrom.toFixed(1)} s; LTX-2.5 lip sync takes up to ${t.speechSeconds.toFixed(1)} s on this computer for now, so only the first ${t.speechSeconds.toFixed(1)} s are used. Longer takes (chained clips) come later.`);
  return { driverPath, cleanPath, timing: t, fix, warnings };
}
