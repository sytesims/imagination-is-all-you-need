/**
 * Lip Sync on InfiniteTalk (Wan 2.1) · Comfy Cloud (2026-10-27): the voice tool's lipsync mode with provider cloud-infinitetalk.
 * Photo required (PNG / JPG / WEBP), speech required (any length up to 60 s; longer is refused with a plain line, never cut), prompt optional,
 * shape auto (the photo's) / 16:9 / 9:16 / 1:1. The speech is copied to a 16-bit WAV here (Comfy Cloud's LoadAudio upload takes WAV / MP3 / FLAC;
 * an M4A would go up untyped) and its exact length is what the job is priced and planned on. Plan: comfy/infiniteTalkCloud.ts.
 * Talking Video (2026-10-27, shared/talkingVideo.ts):
 *  - split=1: speech over 60 s (up to 5 minutes) is cut at pauses (ffmpeg silencedetect −35 dB ≥ 0.25 s) into parts of at most 55 s, each part's
 *    speech written here as its own WAV (plus the 0.24 s crossfade into the next); the plan runs one job per part and joins them. Without split
 *    the 60 s line stands, as before.
 *  - script: the app's bar makes the voice first (the voice tool's voiceover, any voice or your own sample) and sends it here as speech; a script
 *    that comes without speech gets a plain line saying so. With both, the speech file wins (a warning says the script was not used).
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DATA_DIR } from '../../config.js';
import { runFfmpeg } from '../../ffmpeg.js';
import { imageDimsOfFile } from '../../imageDims.js';
import { attachVoiceControls } from './voiceControls.js';
import { TV_SILENCE_DB, TV_SILENCE_MIN, TV_SCRIPT_MAX, planTalkChunks, talkPartSpans, talkSummary, isOn, type TalkPart } from '../../shared/talkingVideo.js';
import { IT_PROVIDER, IT_MAX_SECONDS, IT_MIN_SECONDS, IT_ASPECTS, itIssue, itPrompt, itWindows, itSize } from '../../comfy/infiniteTalkCloud.js';

const bad = (field: string, message: string, code = 'invalid') => ({ error: message, issues: [{ code, field, message }] }) as any;
function audioSeconds(file: string): Promise<number> {
  return new Promise((ok) => { const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]); let o = ''; p.stdout.on('data', (d) => (o += d)); p.on('close', () => ok(Number(o.trim()) || 0)); p.on('error', () => ok(0)); });
}
/** The middle of every pause ffmpeg's silencedetect reports (its stderr), in seconds. Pure (tests read it). */
export function parseSilences(log: string): number[] {
  const out: number[] = []; let start: number | null = null;
  for (const m of String(log).matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) { const t = Number(m[2]); if (!Number.isFinite(t)) continue;
    if (m[1] === 'start') start = Math.max(0, t); else if (start != null) { out.push(Math.round(((start + t) / 2) * 100) / 100); start = null; } }
  return out;
}
function silencesOf(file: string): Promise<number[]> {
  return new Promise((ok) => { const p = spawn('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', `silencedetect=noise=${TV_SILENCE_DB}dB:d=${TV_SILENCE_MIN}`, '-f', 'null', '-']); let e = '';
    p.stderr.on('data', (d) => { e += d; if (e.length > 400_000) e = e.slice(-400_000); }); p.on('close', () => ok(parseSilences(e))); p.on('error', () => ok([])); });
}
/** Long speech: the parts (cut at pauses) and each part's own WAV (its span plus the crossfade into the next). */
async function cutParts(wav: string, total: number): Promise<{ parts: TalkPart[]; files: { start: number; end: number; seconds: number; path: string }[] } | null> {
  const parts = planTalkChunks(await silencesOf(wav), total); const spans = talkPartSpans(parts, total); const files = [];
  for (const [k, p] of spans.entries()) { const f = wav.replace(/\.wav$/i, `-p${k + 1}.wav`);
    if (await runFfmpeg(['-v', 'error', '-y', '-ss', p.start.toFixed(3), '-t', (p.end - p.start).toFixed(3), '-i', wav, '-c:a', 'pcm_s16le', f]) !== 0) return null;
    files.push({ start: parts[k].start, end: parts[k].end, seconds: Math.round((p.end - p.start) * 100) / 100, path: f }); }
  return { parts, files };
}
export async function infiniteTalkParse(fields: Record<string, string>, img: string | undefined, sp: string | undefined) {
  if (!img) return bad('image', 'InfiniteTalk needs a photo of the person who talks (field image: PNG, JPG or WEBP).', 'required');
  if (!/\.(png|jpe?g|webp)$/i.test(img)) return bad('image', 'Photo: use PNG, JPG or WEBP.', 'format');
  const script = String(fields.script ?? '').trim(); const split = isOn(fields.split);
  if (script.length > TV_SCRIPT_MAX) return bad('script', `Script: up to ${TV_SCRIPT_MAX} characters (yours is ${script.length}).`, 'too_long');
  if (!sp) return script ? bad('speech', 'Make the voice from your script first: run it on the voice tool (Voiceover), then send that audio as speech. In the app, Generate does both.', 'required')
    : bad('speech', `Add the speech audio or type a script (field speech, up to ${split ? '5 minutes' : `${IT_MAX_SECONDS} s`}).`, 'required');
  const aspect = fields.aspect || 'auto'; if (!(IT_ASPECTS as readonly string[]).includes(aspect)) return bad('aspect', 'Shape must be auto, 16:9, 9:16 or 1:1 on InfiniteTalk.', 'unsupported');
  const src = path.join(DATA_DIR, sp); const raw = await audioSeconds(src);
  if (!(raw > 0)) return bad('speech', 'Could not read the speech audio. Use WAV, MP3 or M4A.', 'unreadable');
  const issue = itIssue({ speechSeconds: raw, split }); if (issue) return bad('speech', `${issue}.`, 'too_long');
  if (raw < IT_MIN_SECONDS) return bad('speech', `Speech is too short: at least ${IT_MIN_SECONDS} second.`, 'too_short');
  const wav = path.join(path.dirname(src), `${path.basename(src, path.extname(src))}-it.wav`);
  if (await runFfmpeg(['-v', 'error', '-y', '-i', src, '-vn', '-c:a', 'pcm_s16le', wav]) !== 0) return bad('speech', 'Could not read the speech audio. Use WAV, MP3 or M4A.', 'unreadable');
  const speechSeconds = Math.round(((await audioSeconds(wav)) || raw) * 100) / 100; const w = itWindows(speechSeconds);
  const long = split && speechSeconds > IT_MAX_SECONDS + 0.05 ? await cutParts(wav, speechSeconds) : null;
  if (split && speechSeconds > IT_MAX_SECONDS + 0.05 && !long) return bad('speech', 'Could not split the speech into parts. Try a WAV or MP3.', 'unreadable');
  const renderSeconds = long ? Math.round(long.files.reduce((a, f) => a + itWindows(f.seconds).renderSeconds, 0) * 100) / 100 : w.renderSeconds;
  const warnings: string[] = [];
  if (script) warnings.push('Used your speech file; the script was not read.');
  if (long) warnings.push(`Long speech: ${talkSummary(long.parts)}. Each part is its own job with the same photo, prompt and seed.`);
  else if (w.windows > 1) warnings.push(`${w.windows} windows of 3.24 s are joined to cover ${speechSeconds.toFixed(1)} s of speech.`);
  const imagePath = path.join(DATA_DIR, img); const imageSize = imageDimsOfFile(imagePath) ?? undefined; const size = itSize(aspect, imageSize ?? null);
  const prompt = (fields.prompt || '').slice(0, 2000);
  return attachVoiceControls({ types: ['lipsync'], mode: 'lipsync', outKind: 'av-video', prompt, finalPrompt: itPrompt(prompt), aspect, resolution: '480p',
    duration: w.seconds, outputDuration: w.seconds, frames: w.frames, fps: 25, speechSeconds, itWindows: long ? long.files.reduce((a, f) => a + itWindows(f.seconds).windows, 0) : w.windows, itRenderSeconds: renderSeconds,
    ...(long ? { split: true, talkParts: long.files, talkPlan: talkSummary(long.parts) } : {}), width: size.width, height: size.height,
    seed: Number.isInteger(Number(fields.seed)) && fields.seed ? Number(fields.seed) : undefined,
    imagePath, imageUrl: `/files/${img}`, ...(imageSize ? { imageSize } : {}), refPaths: [imagePath], refUrls: [`/files/${img}`],
    speechPath: src, speechUrl: `/files/${sp}`, itSpeechPath: wav, itSpeechUrl: `/files/${path.relative(DATA_DIR, wav)}`,
    warnings, draft: false, n: 1, target: '' }, fields, IT_PROVIDER);
}
