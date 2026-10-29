/**
 * Stitch export engine (POST /api/compose, agentBudget.ts): ffmpeg on this computer, free. The route checks the request; this file builds
 * the film in four short passes so every sound can be measured before it is mixed:
 *  1. picture: each clip reframed to one frame (fit / fill at a crop point / fill with a blurred copy, or the older first-frame + centre crop),
 *     title and end cards on black as their own segments, joined with cuts, crossfades (xfade fade) or dips to black (xfade fadeblack),
 *     cards laid over the first / last clip, caption strips (PNG, drawn by the browser) and the fade to black at the end;
 *  2. stems: the clips' own sound (joined with the same overlaps, acrossfade; with a J / L cut anywhere, each clip's sound is placed on the
 *     timeline instead, adelay + amix, so a sound can lead or trail its picture), the music (looped when asked) and the voice, each the film's length;
 *  3. mix: every stem measured (EBU R128) and levelled (shared/stitchTimeline LEVEL), then its slider; the bed (clip sound + music) dips under
 *     the voice through a sidechain compressor (auto-duck), so a quiet voice still sits on top;
 *  4. loudness: the mix measured and moved to −14 LUFS (one gain and a −1.5 dBTP limiter, checked once more), muxed with the picture as AAC.
 * Text never goes through ffmpeg (this build has no drawtext): cards and captions arrive as transparent PNGs (the web panel draws them, or
 * cardText.ts draws a card from text for the API and MCP).
 */
import { mkdirSync, rmSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';
import { runFfmpeg, loudnessOf } from './ffmpeg.js';
import { drawCardPng } from './cardText.js';
import { planTimeline, outputSize, trackGain, duckRatio, cardFade, dbToGain, LEVEL, EXPORT_LUFS, DEFAULT_MIX, type StitchTransition, type ReframeFit, type CardMode, type CardStyle, type TimelinePlan, type Seam, soundPlaces, hasSplitJoint } from './shared/stitchTimeline.js';

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const AF = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
const WAV = ['-c:a', 'pcm_f32le'];

export interface ComposeClip { file: string; full: number; cut: { in: number; out: number } | null; w: number; h: number; audio: boolean }
export interface ComposeCard { mode: CardMode; sec: number; png: string | null; text?: string | null; style?: CardStyle }
export interface ComposeInput {
  clips: ComposeClip[]; layout: 'sequence' | 'side-by-side';
  aspect: string | null; fit: ReframeFit | null; crop: { x: number; y: number };
  transition: StitchTransition; transitionSec: number;
  /** per-seam transitions (Film): seams[i] joins clip i and i+1; null / missing = the film-wide transition */ seams?: (Seam | null)[] | null;
  /** a rough cut (Film preview): small frame, fast encode, the clips' own sound only, no levelling */ draft?: boolean;
  title: ComposeCard | null; end: ComposeCard | null;
  captions: { png: string; start: number; end: number; y: number }[];
  music: { file: string; loop: boolean } | null; voice: string | null; keepClip: boolean;
  /** volumes are gains on the levelled tracks; normalize=false keeps the older raw mix (volumes on the raw files, no levelling, no −14 LUFS) */
  mix: { clip: number; music: number; voice: number; duck: boolean; duckAmount: number; normalize: boolean; /** the music dips under the clips' own sound too (Film) */ duckClips?: boolean };
  fade: number; videoFade: boolean; out: string; tmp: string;
}
export interface ComposeResult { ok: boolean; code: number; total: number; W: number; H: number; plan: TimelinePlan; audio: boolean; ducked: boolean;
  loudness: { before: number | null; target: number | null }; levels: Record<string, number | null>; warnings: string[] }

/** One clip's picture into the W×H frame. Exported for tests. */
export function reframeChain(i: number, o: { W: number; H: number; fit: ReframeFit | null; crop: { x: number; y: number }; legacy?: { W0: number; H0: number } }): string {
  const { W, H } = o; const x = Math.min(1, Math.max(0, o.crop.x)), y = Math.min(1, Math.max(0, o.crop.y));
  if (!o.fit) { const { W0, H0 } = o.legacy ?? { W0: W, H0: H }; /* the older rule: fitted into the first clip's frame, then centre-cropped to the shape */
    return `[${i}:v]scale=${W0}:${H0}:force_original_aspect_ratio=decrease,pad=${W0}:${H0}:(ow-iw)/2:(oh-ih)/2,setsar=1${W0 !== W || H0 !== H ? `,crop=${W}:${H}:(iw-${W})/2:(ih-${H})/2` : ''}`; }
  if (o.fit === 'fit') return `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
  if (o.fit === 'fill') return `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}:(iw-${W})*${r3(x)}:(ih-${H})*${r3(y)},setsar=1`;
  const w4 = even(W / 4), h4 = even(H / 4); /* blur: a small, blurred, slightly darker fill behind the whole picture */
  return `[${i}:v]split[ba${i}][fa${i}];[ba${i}]scale=${w4}:${h4}:force_original_aspect_ratio=increase,crop=${w4}:${h4},gblur=sigma=6,scale=${W}:${H},eq=brightness=-0.07,setsar=1[bb${i}];`
    + `[fa${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1[ff${i}];[bb${i}][ff${i}]overlay=(W-w)/2:(H-h)/2`;
}

/** The ffmpeg args for the picture pass (exported for tests: transitions, cards and caption timing are all in here). */
export function pictureArgs(p: ComposeInput, plan: TimelinePlan, W: number, H: number, out: string, legacy: { W0: number; H0: number } | null): string[] {
  const inputs: string[] = []; const f: string[] = []; let n = 0;
  const durs = p.clips.map((c) => (c.cut ? r3(c.cut.out - c.cut.in) : c.full));
  for (const c of p.clips) { inputs.push(...(c.cut ? ['-ss', String(c.cut.in), '-t', String(r3(c.cut.out - c.cut.in))] : []), '-i', c.file); n++; }
  const tail = (d: number, k: string) => `,fps=30,format=yuv420p,setsar=1,tpad=stop_mode=clone:stop_duration=2,trim=duration=${d},setpts=PTS-STARTPTS,settb=AVTB[${k}]`;
  let joined: string;
  if (p.layout === 'side-by-side') {
    const L = legacy ?? { W0: W, H0: H }; const t = plan.total;
    for (const i of [0, 1]) f.push(`${reframeChain(i, { W: L.W0, H: L.H0, fit: null, crop: p.crop })}${tail(t, `s${i}`)}`);
    f.push(`[s0][s1]hstack=inputs=2${L.W0 * 2 !== W || L.H0 !== H ? `,crop=${W}:${H}:(iw-${W})/2:(ih-${H})/2` : ''}[vj]`); joined = 'vj';
  } else {
    const labels: string[] = [];
    for (const [k, s] of plan.segments.entries()) {
      const lab = `s${k}`; labels.push(lab);
      if (s.kind === 'clip') { f.push(`${reframeChain(s.clip!, { W, H, fit: p.fit, crop: p.crop, legacy: legacy ?? undefined })}${tail(durs[s.clip!], lab)}`); continue; }
      const card = s.kind === 'title' ? p.title! : p.end!; if (!card.png) continue; const fd = cardFade(s.dur);
      inputs.push('-loop', '1', '-framerate', '30', '-t', String(s.dur), '-i', card.png); const ci = n++;
      f.push(`color=c=black:s=${W}x${H}:r=30:d=${s.dur}[cb${k}]`, `[${ci}:v]scale=${W}:${H},format=rgba,fade=t=in:st=0:d=${fd}:alpha=1,fade=t=out:st=${r3(s.dur - fd)}:d=${fd}:alpha=1[ct${k}]`,
        `[cb${k}][ct${k}]overlay=0:0:shortest=1${tail(s.dur, lab)}`);
    }
    if (labels.length === 1) joined = labels[0];
    else if (plan.overlap > 0) { let cur = labels[0]; /* each joint its own way: xfade (crossfade / dip) or a plain concat (cut) */
      for (let k = 1; k < labels.length; k++) { const nx = k === labels.length - 1 ? 'vj' : `x${k}`; const ov = plan.overlaps?.[k] ?? plan.overlap; const tr = plan.joints?.[k] ?? p.transition;
        /* J / L cut: a hard picture cut inside the overlap. J: A plays to its end, B's first `ov` of picture is hidden (its sound already runs).
           L: the picture cuts to B `ov` early (A's tail picture is hidden; A's sound runs on under B). */
        if (ov > 0 && tr === 'jcut') f.push(`[${labels[k]}]trim=start=${ov},setpts=PTS-STARTPTS[${labels[k]}h]`, `[${cur}][${labels[k]}h]concat=n=2:v=1:a=0[${nx}]`);
        else if (ov > 0 && tr === 'lcut') f.push(`[${cur}]trim=duration=${plan.segments[k].start},setpts=PTS-STARTPTS[${cur}t]`, `[${cur}t][${labels[k]}]concat=n=2:v=1:a=0[${nx}]`);
        else f.push(ov > 0 ? `[${cur}][${labels[k]}]xfade=transition=${tr === 'dip' ? 'fadeblack' : 'fade'}:duration=${ov}:offset=${plan.segments[k].start}[${nx}]` : `[${cur}][${labels[k]}]concat=n=2:v=1:a=0[${nx}]`); cur = nx; }
      joined = 'vj'; }
    else { f.push(`${labels.map((l) => `[${l}]`).join('')}concat=n=${labels.length}:v=1:a=0[vj]`); joined = 'vj'; }
  }
  /* cards over the picture: a looping PNG shown between its start and end, its text fading in and out */
  let cur = joined; let ov = 0;
  const over = (png: string, a: number, b: number) => { if (!(b > a)) return; const fd = cardFade(b - a); inputs.push('-loop', '1', '-framerate', '30', '-i', png); const ci = n++; const nx = `o${ov++}`;
    f.push(`[${ci}:v]scale=${W}:${H},format=rgba,fade=t=in:st=${r3(a)}:d=${fd}:alpha=1,fade=t=out:st=${r3(b - fd)}:d=${fd}:alpha=1[oi${nx}]`, `[${cur}][oi${nx}]overlay=0:0:shortest=1:enable='between(t,${r3(a)},${r3(b)})'[${nx}]`); cur = nx; };
  if (plan.overTitle && p.title?.png) over(p.title.png, plan.overTitle[0], plan.overTitle[1]);
  if (plan.overEnd && p.end?.png) over(p.end.png, plan.overEnd[0], plan.overEnd[1]);
  /* caption strips (Captions.tsx drawCue): one still each, at (0, y), between its times */
  for (const c of p.captions) { if (!(c.end > c.start) || c.start >= plan.total) continue; inputs.push('-i', c.png); const ci = n++; const nx = `o${ov++}`;
    f.push(`[${cur}][${ci}:v]overlay=0:${Math.round(c.y)}:eof_action=repeat:enable='between(t,${c.start.toFixed(3)},${Math.min(c.end, plan.total).toFixed(3)})'[${nx}]`); cur = nx; }
  const vFade = p.videoFade && p.fade > 0 && plan.total > p.fade ? `,fade=t=out:st=${r2(plan.total - p.fade)}:d=${p.fade}` : '';
  f.push(`[${cur}]format=yuv420p${vFade}[v]`);
  return ['-y', '-v', 'error', ...inputs, '-filter_complex', f.join(';'), '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', p.draft ? 'ultrafast' : 'veryfast', '-crf', p.draft ? '30' : '20', '-pix_fmt', 'yuv420p', '-t', String(plan.total || 1), out];
}

/** The ffmpeg args for the stems pass: clip sound, music and voice, each exactly the film's length, as float WAVs. null = no sound at all. */
export function stemArgs(p: ComposeInput, plan: TimelinePlan, files: { clip: string; music: string; voice: string }): { args: string[]; stems: ('clip' | 'music' | 'voice')[] } | null {
  const inputs: string[] = []; const f: string[] = []; const outs: string[] = []; const stems: ('clip' | 'music' | 'voice')[] = []; let n = 0; const T = plan.total;
  const anyClip = p.keepClip && p.clips.some((c) => c.audio);
  if (anyClip) {
    const idx = new Map<number, number>();
    p.clips.forEach((c, i) => { if (!c.audio) return; inputs.push(...(c.cut ? ['-ss', String(c.cut.in), '-t', String(r3(c.cut.out - c.cut.in))] : []), '-i', c.file); idx.set(i, n++); });
    const seg = (k: number, clip: number | undefined, d: number) => clip != null && idx.has(clip) ? `[${idx.get(clip)}:a]${AF},apad,atrim=0:${d},asetpts=N/SR/TB[c${k}]` : `aevalsrc=0:s=48000:c=stereo:d=${Math.max(0.04, d)},aformat=sample_fmts=fltp:channel_layouts=stereo[c${k}]`;
    if (p.layout === 'side-by-side') f.push(`${seg(0, 0, T)}`, `[c0]anull[cj]`);
    else {
      plan.segments.forEach((s, k) => f.push(seg(k, s.kind === 'clip' ? s.clip : undefined, s.dur)));
      const L = plan.segments.length;
      if (L > 1 && hasSplitJoint(plan)) { /* J / L cuts: every segment's sound placed on the timeline (its window, fades, adelay) and mixed */
        const placed = soundPlaces(plan).filter((sp) => sp.to - sp.from > 0.01);
        placed.forEach((sp, n2) => { const len = r3(sp.to - sp.from); const ms = Math.round(sp.from * 1000);
          f.push(`[c${sp.seg}]atrim=start=${sp.offset}:end=${r3(sp.offset + len)},asetpts=PTS-STARTPTS${sp.fadeIn > 0 ? `,afade=t=in:st=0:d=${sp.fadeIn}:curve=${sp.curveIn}` : ''}${sp.fadeOut > 0 ? `,afade=t=out:st=${r3(len - sp.fadeOut)}:d=${sp.fadeOut}:curve=${sp.curveOut}` : ''}${ms > 0 ? `,adelay=${ms}:all=1` : ''}[cp${n2}]`); });
        plan.segments.forEach((_, k) => { if (!placed.some((sp) => sp.seg === k)) f.push(`[c${k}]anullsink`); });
        f.push(placed.length > 1 ? `${placed.map((_, n2) => `[cp${n2}]`).join('')}amix=inputs=${placed.length}:duration=longest:normalize=0[cj]` : placed.length ? '[cp0]anull[cj]' : `aevalsrc=0:s=48000:c=stereo:d=${Math.max(0.04, T)},aformat=sample_fmts=fltp:channel_layouts=stereo[cj]`);
      }
      else if (L === 1) f.push('[c0]anull[cj]');
      else if (plan.overlap > 0) { let cur = 'c0'; for (let k = 1; k < L; k++) { const nx = k === L - 1 ? 'cj' : `cx${k}`; const ov = plan.overlaps?.[k] ?? plan.overlap; const c = (plan.joints?.[k] ?? p.transition) === 'dip' ? 'exp' : 'tri';
        f.push(ov > 0 ? `[${cur}][c${k}]acrossfade=d=${ov}:c1=${c}:c2=${c}[${nx}]` : `[${cur}][c${k}]concat=n=2:v=0:a=1[${nx}]`); cur = nx; } }
      else f.push(`${plan.segments.map((_, k) => `[c${k}]`).join('')}concat=n=${L}:v=0:a=1[cj]`);
    }
    f.push(`[cj]apad,atrim=0:${T},asetpts=N/SR/TB[clip]`); outs.push('-map', '[clip]', ...WAV, '-t', String(T), files.clip); stems.push('clip');
  }
  const fadeF = p.fade > 0 && T > p.fade ? `,afade=t=out:st=${r2(T - p.fade)}:d=${p.fade}` : '';
  if (p.music) { inputs.push(...(p.music.loop ? ['-stream_loop', '-1'] : []), '-i', p.music.file); f.push(`[${n++}:a]${AF},atrim=0:${T},apad,atrim=0:${T},asetpts=N/SR/TB${fadeF}[music]`); outs.push('-map', '[music]', ...WAV, '-t', String(T), files.music); stems.push('music'); }
  if (p.voice) { inputs.push('-i', p.voice); f.push(`[${n++}:a]${AF},atrim=0:${T},apad,atrim=0:${T},asetpts=N/SR/TB[voice]`); outs.push('-map', '[voice]', ...WAV, '-t', String(T), files.voice); stems.push('voice'); }
  if (!stems.length) return null;
  return { args: ['-y', '-v', 'error', ...inputs, '-filter_complex', f.join(';'), ...outs], stems };
}

/** The mix graph over the stems (in `stems` order as inputs 0…): gains, the duck and the end fade → [mix]. Exported for tests. */
/** duckClips (Film, 2026-10-27): the music also dips under the clips' own sound (their dialogue), so a film whose lines are in the clips gets a
 *  ducked score without a separate voice track. Off by default (the Stitch panel's mix is unchanged). */
export function mixGraph(stems: ('clip' | 'music' | 'voice')[], gains: Record<string, number>, o: { duck: boolean; duckAmount: number; endFade: string; duckClips?: boolean }): { graph: string; ducked: boolean } {
  const f: string[] = []; const bed: string[] = [];
  const underClips = !!o.duckClips && o.duckAmount > 0 && stems.includes('clip') && stems.includes('music');
  stems.forEach((s, i) => { if (s === 'voice') f.push(`[${i}:a]volume=${gains.voice}${o.duck ? ',asplit=2[voice][sc]' : '[voice]'}`);
    else if (underClips && s === 'clip') { f.push(`[${i}:a]volume=${gains.clip},asplit=2[clip][csc]`); bed.push('[clip]'); }
    else if (underClips && s === 'music') { f.push(`[${i}:a]volume=${gains.music}[music0]`, `[music0][csc]sidechaincompress=threshold=0.03:ratio=${duckRatio(o.duckAmount)}:attack=20:release=400:makeup=1:detection=rms[music]`); bed.push('[music]'); }
    else { f.push(`[${i}:a]volume=${gains[s]}[${s}]`); bed.push(`[${s}]`); } });
  const hasVoice = stems.includes('voice'); const ducked = hasVoice && o.duck && bed.length > 0 && o.duckAmount > 0;
  if (hasVoice && o.duck && !ducked) f[f.length - 1] = f[f.length - 1].replace(',asplit=2[voice][sc]', '[voice]');
  let bedL = ''; if (bed.length > 1) { f.push(`${bed.join('')}amix=inputs=${bed.length}:duration=longest:normalize=0[bed]`); bedL = '[bed]'; } else if (bed.length) bedL = bed[0];
  if (ducked) { f.push(`${bedL}[sc]sidechaincompress=threshold=0.03:ratio=${duckRatio(o.duckAmount)}:attack=20:release=400:makeup=1:detection=rms[bedd]`); bedL = '[bedd]'; }
  const all = [bedL, hasVoice ? '[voice]' : ''].filter(Boolean);
  f.push(all.length > 1 ? `${all.join('')}amix=inputs=2:duration=longest:normalize=0${o.endFade}[mix]` : `${all[0]}anull${o.endFade}[mix]`);
  return { graph: f.join(';'), ducked: ducked || underClips };
}

/** Run the whole export. The caller checks the request and owns the job record. */
export async function composeRender(p: ComposeInput): Promise<ComposeResult> {
  const warnings: string[] = []; mkdirSync(p.tmp, { recursive: true });
  const durs = p.clips.map((c) => (c.cut ? r3(c.cut.out - c.cut.in) : c.full));
  const first = p.clips[0]; const W0 = first.w - (first.w % 2), H0 = first.h - (first.h % 2);
  let plan: TimelinePlan; let W: number, H: number; let legacy: { W0: number; H0: number } | null = null;
  if (p.draft) { /* rough cut: the clips' own sound only, nothing levelled; a frame of at most 360 px on the short side */
    p = { ...p, music: null, voice: null, keepClip: true, title: null, end: null, captions: [], mix: { ...p.mix, duck: false, duckClips: false, normalize: false, clip: 1 } };
    if (p.layout === 'sequence') { const k = Math.min(1, 360 / Math.max(2, Math.min(first.w, first.h))); p = { ...p, fit: p.fit ?? 'fit', aspect: null }; W = even(first.w * k); H = even(first.h * k); } else { W = 0; H = 0; }
  } else { W = 0; H = 0; }
  if (!W || !H) { const sz = p.layout === 'side-by-side' ? outputSize({ w: W0 * 2, h: H0 }, p.aspect, null)! : outputSize({ w: first.w, h: first.h }, p.aspect, p.fit)!; W = sz.w; H = sz.h; }
  /* cards sent as text (the API, MCP): drawn here at the frame's size; a card that can't be drawn is left out */
  for (const k of ['title', 'end'] as const) { const c = p[k]; if (!c || c.png) continue;
    const png = c.text ? await drawCardPng(c.text, c.style ?? 'clean', path.join(p.tmp, `${k}-text.png`), W, H) : null;
    if (png) p[k] = { ...c, png }; else { p[k] = null; warnings.push(`The ${k === 'title' ? 'title' : 'end'} card couldn’t be drawn, so it was left out.`); } }
  if (p.layout === 'side-by-side') {
    const t = r2(Math.min(...durs));
    plan = { ...planTimeline([t], { title: p.title?.mode === 'over' ? p.title : null, end: p.end?.mode === 'over' ? p.end : null }), total: t };
    legacy = { W0, H0 };
    if (p.title?.mode === 'black' || p.end?.mode === 'black') warnings.push('Side by side shows cards over the picture, not on black.');
  } else {
    plan = planTimeline(durs, { transition: p.transition, transitionSec: p.transitionSec, title: p.title, end: p.end, seams: p.seams });
    if (!p.fit) legacy = { W0, H0 };
    if ((p.transition !== 'cut' || p.seams?.some((x) => x && x.type !== 'cut')) && plan.segments.length > 1 && plan.overlap === 0) warnings.push('A clip is too short for a transition, so the clips are joined with cuts.');
  }
  const total = plan.total; const res = (o: Partial<ComposeResult>): ComposeResult => ({ ok: false, code: 1, total, W, H, plan, audio: false, ducked: false, loudness: { before: null, target: null }, levels: {}, warnings, ...o });
  const vFile = path.join(p.tmp, 'v.mp4');
  const vc = await runFfmpeg(pictureArgs(p, plan, W, H, vFile, legacy)); if (vc !== 0 || !existsSync(vFile)) return res({ code: vc });
  const files = { clip: path.join(p.tmp, 'clip.wav'), music: path.join(p.tmp, 'music.wav'), voice: path.join(p.tmp, 'voice.wav') };
  const st = stemArgs(p, plan, files);
  if (!st) { renameSync(vFile, p.out); return res({ ok: true, code: 0 }); }
  const sc = await runFfmpeg(st.args); if (sc !== 0) return res({ code: sc });
  /* levels: each stem measured, then brought to its level; the slider is a gain on top */
  const meas = Object.fromEntries(await Promise.all(st.stems.map(async (s) => [s, (await loudnessOf(files[s]))?.i ?? null] as const))) as Record<string, number | null>;
  const vol = { clip: p.mix.clip, music: p.mix.music, voice: p.mix.voice };
  const gains: Record<string, number> = {}; for (const s of st.stems) gains[s] = p.mix.normalize ? trackGain(meas[s], LEVEL[s], vol[s]) : Math.min(2, Math.max(0, vol[s]));
  const endFade = p.videoFade && p.fade > 0 && total > p.fade ? `,afade=t=out:st=${r2(total - p.fade)}:d=${p.fade}:curve=esin` : '';
  const mg = mixGraph(st.stems, gains, { duck: p.mix.duck, duckAmount: p.mix.duckAmount, endFade, duckClips: p.mix.duck && p.mix.duckClips });
  const mixFile = path.join(p.tmp, 'mix.wav');
  const mc = await runFfmpeg(['-y', '-v', 'error', ...st.stems.flatMap((s) => ['-i', files[s]]), '-filter_complex', mg.graph, '-map', '[mix]', ...WAV, '-t', String(total), mixFile]); if (mc !== 0) return res({ code: mc });
  /* loudness: the mix measured (EBU R128) and moved to −14 LUFS with one gain, a limiter keeping peaks under −1.5 dBTP; the result is measured
     again and, when the limiter took more than half a LU, the gain is corrected once. A silent mix is left as it is. */
  let before: number | null = null; const mux = (af: string) => runFfmpeg(['-y', '-v', 'error', '-i', vFile, '-i', mixFile, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', af, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', String(total || 1), '-movflags', '+faststart', p.out]);
  const limit = `alimiter=limit=${r3(dbToGain(-1.5))}:attack=5:release=60:level=false`;
  let gain = 0; let norm = false;
  if (p.mix.normalize) { const m = await loudnessOf(mixFile); before = m?.i ?? null; if (m && Number.isFinite(m.i) && m.i > -70) { gain = Math.min(30, EXPORT_LUFS - m.i); norm = true; } }
  let fc = await mux(norm ? `volume=${r2(gain)}dB,${limit}` : 'alimiter=limit=0.95:level=false'); if (fc !== 0) return res({ code: fc });
  if (norm) { const o = await loudnessOf(p.out); if (o && Number.isFinite(o.i) && Math.abs(o.i - EXPORT_LUFS) > 0.5) { gain = Math.min(36, gain + (EXPORT_LUFS - o.i)); fc = await mux(`volume=${r2(gain)}dB,${limit}`); if (fc !== 0) return res({ code: fc }); } }
  return res({ ok: true, code: 0, audio: true, ducked: mg.ducked, loudness: { before: before != null && Number.isFinite(before) ? r2(before) : null, target: p.mix.normalize ? EXPORT_LUFS : null },
    levels: Object.fromEntries(Object.entries(meas).map(([k, v]) => [k, v != null && Number.isFinite(v) ? r2(v) : null])) });
}

export const cleanTmp = (dir: string) => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ } };
export { DEFAULT_MIX };
