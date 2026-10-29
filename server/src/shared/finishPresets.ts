/**
 * Finish (2026-10-27): eight one-click finishing looks for a clip you already have (grain, glow, a light leak, a glitch, a slow push-in, a
 * vignette, a cinematic frame, a dreamy blur). Free and on this computer: each look is an ffmpeg filtergraph we wrote ourselves, built only
 * from filters the stock Homebrew ffmpeg has (no drawtext, so no text looks yet). Runs in tools/finish.ts.
 *
 * Isomorphic (no server imports): the server builds the graph, the web reads the labels, lines and limits from the same list.
 *
 * Each builder takes a strength 0–1 and the clip's size, frame rate and length, and returns a chain from pad [in] to pad [out]. Strength 0
 * is always the clip untouched (`null`). Two looks stack: the first look's [out] feeds the second's [in]. Pixel sizes scale with the clip
 * (`u` = short side / 1080), so a 480p clip and a 1080p clip get the same look.
 */

export const FINISH_TOOL = 'finish';
export const FINISH_PROVIDER = 'local-finish';
/** Longest clip we finish (longer clips use their first 20 s) and the largest size (the long side; bigger clips are scaled down). */
export const FINISH_MAX_SECONDS = 20;
export const FINISH_MAX_SIDE = 1920;
/** Shortest clip we take. */
export const FINISH_MIN_SECONDS = 0.3;
export const FINISH_DEFAULT_STRENGTH = 0.6;

export interface FinishCtx { width: number; height: number; fps: number; seconds: number }
export interface FinishPreset {
  id: string; label: string; line: string;
  /** a chain from [in] to [out]; `p` prefixes this look's own pad names so two looks can stack */
  graph: (s: number, c: FinishCtx, p: string) => string;
}

/** n decimals, no trailing zeros (keeps the graph short and stable for tests). */
const n = (x: number, d = 3) => String(Number(x.toFixed(d)));
const clamp01 = (x: number) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
const unit = (c: FinishCtx) => Math.min(c.width, c.height) / 1080;
const even = (x: number) => Math.max(2, 2 * Math.round(x / 2));
/** A smaller copy for blur and glow layers (a quarter of the size, even sides): the blur looks the same and costs a sixteenth. */
const small = (c: FinishCtx, k = 4) => `${even(c.width / k)}:${even(c.height / k)}`;

export const FINISH_PRESETS: FinishPreset[] = [
  { id: 'film-grain', label: 'Film grain', line: 'Soft, living grain with gently lifted blacks, like a film scan.',
    /* grain lives on its own mid-grey layer, a little larger than a pixel, merged in (grainmerge: grey = no change), so it never tints the
     * colours; then a gentle film curve (lifted blacks, rolled-off whites) and a touch less saturation */
    graph: (s, c, p) => { const gw = even(c.width / (1.25 + 0.35 * unit(c))); const gh = even(c.height / (1.25 + 0.35 * unit(c)));
      return `color=c=0x808080:s=${gw}x${gh}:r=${n(c.fps)}:d=${n(c.seconds + 1)},format=gray,noise=alls=${Math.round(14 + 22 * s)}:allf=t+u,`
        + `scale=${c.width}:${c.height}:flags=bicubic,format=yuv444p[${p}g];`
        + `[in]format=yuv444p,curves=all='0/${n(0.035 * s)} 0.5/0.5 1/${n(1 - 0.04 * s)}',eq=saturation=${n(1 - 0.1 * s)}[${p}b];`
        + `[${p}b][${p}g]blend=all_mode=grainmerge:all_opacity=${n(0.35 + 0.55 * s)}:shortest=1[out]`; } },
  { id: 'soft-glow', label: 'Soft glow', line: 'Highlights bloom into a soft, warm halo.',
    /* only the bright parts are blurred (a curve keeps the top of the range), at a quarter size, then screened back over the clip */
    graph: (s, c, p) => { const knee = n(0.58 - 0.2 * s);
      return `[in]format=gbrp,split[${p}a][${p}b];[${p}b]scale=${small(c)},curves=all='0/0 ${knee}/0 1/1',gblur=sigma=${n(4 + 7 * s)},`
        + `colorbalance=rh=0.04:bh=-0.03,scale=${c.width}:${c.height}:flags=bicubic[${p}g];`
        + `[${p}a][${p}g]blend=all_mode=screen:all_opacity=${n(0.45 + 0.55 * s)}:shortest=1[out]`; } },
  { id: 'light-leak', label: 'Light leak', line: 'A warm wash of amber and rose drifts across the frame.',
    /* two soft colour blobs drawn on a tiny canvas with geq (cheap), drifting with time over the clip's length, blurred, scaled up and screened */
    graph: (s, c, p) => { const gh = even(160 * c.height / c.width); const D = n(Math.max(c.seconds, 0.1)); const P = `(T/${D})`;
      const a1 = `(0.75+0.25*sin(2*PI*(${P}*1.3+0.1)))*exp(-(pow(X-W*(-0.08+0.4*${P}),2)+pow(Y-H*(0.22+0.12*sin(2*PI*${P})),2))/(2*pow(W*0.3,2)))`;
      const a2 = `(0.3+0.3*sin(2*PI*(${P}*0.9+0.6)))*exp(-(pow(X-W*(1.06-0.3*${P}),2)+pow(Y-H*(0.85-0.25*${P}),2))/(2*pow(W*0.2,2)))`;
      const ch = (k1: number, k2: number) => `'255*min(1,${k1}*${a1}+${k2}*${a2})'`;
      return `color=c=black:s=160x${gh}:r=${n(c.fps)}:d=${n(c.seconds + 1)},format=gbrp,geq=r=${ch(1, 0.95)}:g=${ch(0.55, 0.38)}:b=${ch(0.2, 0.42)},`
        + `gblur=sigma=5,scale=${c.width}:${c.height}:flags=bicubic[${p}l];`
        + `[in]format=gbrp[${p}a];[${p}a][${p}l]blend=all_mode=screen:all_opacity=${n(0.3 + 0.6 * s)}:shortest=1[out]`; } },
  { id: 'glitch', label: 'Glitch', line: 'Short digital bursts: split colour, a torn slice, a hiss of noise.',
    /* a faint colour fringe all the time; bursts (three sines summed, above a threshold) switch on a strong RGB split, noise and a torn slice.
     * Deterministic: the same clip glitches the same way every time. More strength = stronger and more frequent bursts. */
    graph: (s, c, p) => { const u = unit(c); const thr = n(2.05 - 0.65 * s); const B = `gt(sin(2.3*t)+sin(5.7*t+1.3)+sin(9.1*t+2.1),${thr})`;
      const B2 = `gt(sin(3.1*t+0.4)+sin(7.9*t+2.6)+sin(11.3*t+0.9),${n(2.25 - 0.6 * s)})`; const f = Math.max(1, Math.round(u * (1 + 2 * s))); const R = Math.max(2, Math.round(u * (8 + 16 * s)));
      const sh = even(c.height / 9); const y = even(c.height * 0.56); const dx = Math.round(c.width * (0.015 + 0.03 * s));
      return `[in]rgbashift=rh=${f}:bh=${-f},rgbashift=rh=${R}:bh=${-R}:gv=${Math.round(R / 3)}:enable='${B}',noise=alls=${Math.round(8 + 14 * s)}:allf=t:enable='${B}',split[${p}a][${p}b];`
        + `[${p}b]crop=${c.width}:${sh}:0:${y}[${p}s];[${p}a][${p}s]overlay=x=${dx}:y=${y}:enable='${B2}'[out]`; } },
  { id: 'push-in', label: 'Smooth push-in', line: 'A slow, eased camera push toward the centre.',
    /* perspective with per-frame corners and cubic sampling: sub-pixel smooth (scale + crop or zoompan step a pixel at a time and judder);
     * eased in and out over the whole clip, up to 4–14% closer */
    graph: (s, c, p) => { const z = 0.04 + 0.1 * s; const m = `(${n(z / (2 * (1 + z)), 5)}*(1-cos(PI*min(in/${n(Math.max(c.seconds * c.fps - 1, 1))},1)))/2)`;
      void p; return `[in]perspective=x0='W*${m}':y0='H*${m}':x1='W-W*${m}':y1='H*${m}':x2='W*${m}':y2='H-H*${m}':x3='W-W*${m}':y3='H-H*${m}':interpolation=cubic:eval=frame[out]`; } },
  { id: 'vignette', label: 'Vignette', line: 'Edges fall gently into shadow to hold the eye on the centre.',
    /* our own soft mask (an oval that follows the frame's shape, falling off smoothly from the centre) drawn small, scaled up and multiplied in */
    graph: (s, c, p) => { const gh = even(160 * c.height / c.width); const k = n(0.25 + 0.5 * s); const r = `(pow((X-W/2)/(W/2),2)+pow((Y-H/2)/(H/2),2))/2`;
      return `color=c=white:s=160x${gh}:r=${n(c.fps)}:d=${n(c.seconds + 1)},format=gray,geq=lum='255*(1-${k}*pow(min(1,${r}),1.15))',gblur=sigma=2,`
        + `scale=${c.width}:${c.height}:flags=bicubic,format=gbrp[${p}m];[in]format=gbrp[${p}a];[${p}a][${p}m]blend=all_mode=multiply:shortest=1[out]`; } },
  { id: 'cinematic', label: 'Cinematic', line: 'A 2.39:1 frame with a teal-and-orange grade. Bars on wide clips only.',
    /* teal shadows, warm highlights, lightness kept; a gentle S-curve; letterbox bars (crop + pad) when the clip is wider than 4:3 */
    graph: (s, c) => { const wide = c.width / c.height >= 1.3; const inner = even(c.width / 2.39); const bars = wide && inner < c.height ? `,crop=${c.width}:${inner}:0:${(c.height - inner) / 2},pad=${c.width}:${c.height}:0:${(c.height - inner) / 2}:black` : '';
      return `[in]colorbalance=rs=${n(-0.11 * s)}:gs=${n(0.01 * s)}:bs=${n(0.1 * s)}:rm=${n(0.03 * s)}:bm=${n(-0.03 * s)}:rh=${n(0.09 * s)}:gh=${n(0.02 * s)}:bh=${n(-0.08 * s)},`
        + `curves=all='0/0 0.25/${n(0.25 - 0.035 * s)} 0.75/${n(0.75 + 0.03 * s)} 1/1',eq=saturation=${n(1 + 0.06 * s)}${bars}[out]`; } },
  { id: 'dream-blur', label: 'Dream blur', line: 'Motion melts into soft trails and a hazy glow.',
    /* frames blended over time (tmix) for trails, a quarter-size glow that lingers on the light (lagfun), mixed over the clip by strength */
    graph: (s, c, p) => { const F = 3 + 2 * Math.round(2 * s);
      return `[in]format=gbrp,split[${p}o][${p}d];[${p}d]tmix=frames=${F},split[${p}d1][${p}d2];`
        + `[${p}d2]scale=${small(c)},gblur=sigma=${n(5 + 6 * s)},lagfun=decay=${n(0.9 + 0.06 * s)},scale=${c.width}:${c.height}:flags=bicubic[${p}g];`
        + `[${p}d1][${p}g]blend=all_mode=screen:all_opacity=0.55:shortest=1[${p}dd];[${p}o][${p}dd]blend=all_mode=normal:all_opacity=${n(0.35 + 0.6 * s)}:shortest=1[out]`; } },
];

export const finishPreset = (id: string | null | undefined): FinishPreset | undefined => FINISH_PRESETS.find((p) => p.id === id);
export interface FinishLook { id: string; strength: number }

/**
 * The whole -filter_complex, from [0:v] to [vout], for one or two looks: each look in turn (its pads renamed), then yuv420p for H.264.
 * `scale` (the capped size, when the clip is bigger) goes first. Returns null when nothing changes the picture (every strength 0, no scale),
 * so the caller copies the video stream as it is.
 */
export function finishGraph(looks: FinishLook[], c: FinishCtx, scale?: { width: number; height: number } | null): string | null {
  const used = looks.map((l) => ({ p: finishPreset(l.id), s: clamp01(l.strength) })).filter((l) => l.p && l.s > 0);
  if (!used.length && !scale) return null;
  const ctx = scale ? { ...c, ...scale } : c; const parts: string[] = []; let cur = '0:v';
  if (scale) { parts.push(`[0:v]scale=${scale.width}:${scale.height}:flags=lanczos,setsar=1[s0]`); cur = 's0'; }
  used.forEach((l, k) => { const out = `v${k}`; const pre = `l${k}`;
    parts.push(l.p!.graph(l.s, ctx, pre).replace(/\[in\]/g, `[${cur}]`).replace(/\[out\]/g, `[${out}]`)); cur = out; });
  parts.push(`[${cur}]format=yuv420p[vout]`);
  return parts.join(';');
}

/** The capped output size: the long side at most FINISH_MAX_SIDE, both sides even. null when the clip already fits and is even. */
export function finishSize(width: number, height: number): { width: number; height: number } | null {
  const k = Math.min(1, FINISH_MAX_SIDE / Math.max(width, height)); const w = even(width * k); const h = even(height * k);
  return w === width && h === height ? null : { width: w, height: h };
}
