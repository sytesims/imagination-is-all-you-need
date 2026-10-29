/**
 * The living parts of an audio result, shared by AudioCard (Audio feed, canvas), the viewer's audio stage and Assets tiles:
 *  - <AudioCover>: a generated cover (palette from the prompt's genre and mood words, vinyl / speech bubble / spark motif by kind);
 *  - <AudioVizLayer>: the glow and the full-body bean dancer (beanDancer.ts) standing on the cover's floor, in a style pack (beanStyle.ts:
 *    rap, love song, rock, EDM, lo-fi, classical, peaceful, voice, sound effect). The pack comes from what the sound is (heardStyle.ts: YAMNet,
 *    heard once the first time the track plays or opens, listenStyle.ts), else the prompt / lyrics words; a chip names it ("Rap mode · heard")
 *    and opens a menu to pick another style for this track;
 *  - useAudioViz(): while one element plays, a single requestAnimationFrame loop reads its analyser and writes transforms straight to the DOM
 *    (no React render per frame): waveform bars, glow and the dancer, whose moves come from danceLogic.ts (tempo, beat phase, energy,
 *    bass vs treble, onsets, drops, the end of the track). Idle cards run nothing. Reduced motion: no loop at all, the dancer stands calmly.
 *  - little moments (2026-10-25, to make Audio feel friendly): the dance opens with a hello (a hop and a wave) when you press play and ends
 *    with a bow; a card whose track just finished generating cheers once; <BeanPerformer> plays one move on loop for the welcome screen (a
 *    wave) and the generating tile (a warm-up). Every one of them stays still under reduced motion.
 */
import { memo, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { analyserFor, releaseTap } from './audioGraph';
import { dancerSvg, dancerNodes, applyPose, type DancerNodes } from './beanDancer';
import { MusicSense, BeatClock, Choreographer, featuresFromBins, featuresFromLevel, sampleMove, MOVES, REST, type Features, type Face, type MoveName } from './danceLogic';
import { PACKS, PACK_IDS, type PackId, type Pack } from './beanStyle';
import { labelOf } from './heardStyle';
import { useStyleChoice, type SavedStyle } from './listenStyle';
import { BarPopover, PopList, PopRow } from './BarPop';
import { coverOf, barLevels, energyOfBins, peakLevel, COVER_W, COVER_H, seeded, hashStr, type AudioKind } from './audioVizLogic';
import './audioViz.css';

/* ---------------- cover ---------------- */

/** The generated cover: deterministic from `seed` (the job id), coloured by the prompt's words. Decorative. */
export const AudioCover = memo(function AudioCover({ seed, prompt, kind = 'music', className }: { seed: string; prompt?: string | null; kind?: AudioKind; className?: string }) {
  const s = useMemo(() => coverOf({ seed, prompt, kind }), [seed, prompt, kind]);
  const uid = useId().replace(/[^\w-]/g, ''); const p = s.palette;
  return <svg className={`av-cover${className ? ` ${className}` : ''}`} viewBox={`0 0 ${COVER_W} ${COVER_H}`} preserveAspectRatio="xMidYMid slice" aria-hidden data-mood={s.mood} data-kind={kind} data-testid="audio-cover">
    <defs>
      {s.blobs.map((b, i) => <radialGradient key={i} id={`${uid}g${i}`}><stop offset="0" stopColor={b.color} stopOpacity={b.o} /><stop offset="1" stopColor={b.color} stopOpacity="0" /></radialGradient>)}
      <linearGradient id={`${uid}l`} x1="0" x2="1"><stop offset="0" stopColor={p.c} stopOpacity="0" /><stop offset=".5" stopColor={p.c} stopOpacity=".55" /><stop offset="1" stopColor={p.b} stopOpacity=".1" /></linearGradient>
      <linearGradient id={`${uid}v`} x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stopColor="#0B0B0D" stopOpacity="0" /><stop offset="1" stopColor="#0B0B0D" stopOpacity=".7" /></linearGradient>
    </defs>
    <rect width={COVER_W} height={COVER_H} fill="#121315" />
    {s.blobs.map((b, i) => <circle key={i} cx={b.x} cy={b.y} r={b.r} fill={`url(#${uid}g${i})`} />)}
    {kind === 'music' && <g fill="none" stroke="#fff">
      {s.rings.map((r, i) => <circle key={i} cx={s.cx} cy={s.cy} r={r} strokeOpacity={i === s.rings.length - 1 ? 0.14 : 0.06} strokeWidth={i === 0 ? 1.4 : 1} />)}
      <circle cx={s.cx} cy={s.cy} r="9" fill={p.b} fillOpacity=".85" stroke="none" /><circle cx={s.cx} cy={s.cy} r="2.4" fill="#121315" stroke="none" />
    </g>}
    {kind === 'voice' && <g>
      <path d={`M${s.cx} ${s.cy}h76a14 14 0 0 1 14 14v40a14 14 0 0 1-14 14h-44l-20 16v-16h-12a14 14 0 0 1-14-14v-40a14 14 0 0 1 14-14z`} transform="translate(-14 0)" fill={p.a} fillOpacity=".22" stroke={p.c} strokeOpacity=".5" strokeWidth="1.4" />
      {[0, 1, 2].map(i => <circle key={i} cx={s.cx + 20 + i * 18} cy={s.cy + 34} r="4.2" fill={p.c} fillOpacity={0.5 + i * 0.18} />)}
    </g>}
    {kind === 'sfx' && <g>
      <path d={`M${s.cx} ${s.cy - 26}l7 19 19 7-19 7-7 19-7-19-19-7 19-7z`} fill={p.c} fillOpacity=".8" />
      {s.sparks.map((k, i) => <path key={i} d={`M${k.x} ${k.y - k.s}l${k.s * 0.3} ${k.s * 0.7} ${k.s * 0.7} ${k.s * 0.3}-${k.s * 0.7} ${k.s * 0.3}-${k.s * 0.3} ${k.s * 0.7}-${k.s * 0.3}-${k.s * 0.7}-${k.s * 0.7}-${k.s * 0.3} ${k.s * 0.7}-${k.s * 0.3}z`} fill={p.c} fillOpacity=".55" />)}
    </g>}
    <g fill="none" stroke={kind === 'music' ? `url(#${uid}l)` : p.c} strokeOpacity={kind === 'music' ? 1 : 0.35} strokeWidth={kind === 'sfx' ? 1.2 : 1.6} strokeLinecap="round">{s.lines.map((d, i) => <path key={i} d={d} />)}</g>
    <rect width={COVER_W} height={COVER_H} fill={`url(#${uid}v)`} />
  </svg>;
});

/* ---------------- glow, dancer, style chip ---------------- */

/* ---------------- little moments: one shared ticker for every performer (the welcome wave, warm-ups, cheers) ---------------- */

const ticks = new Set<(now: number) => void>(); let tickRaf = 0;
const tickLoop = (now: number) => { for (const f of [...ticks]) f(now); tickRaf = ticks.size ? requestAnimationFrame(tickLoop) : 0; };
/** Run `f` every frame until the returned stop is called. One requestAnimationFrame for all of them, however many tiles perform. */
function onTick(f: (now: number) => void): () => void {
  ticks.add(f); if (!tickRaf) tickRaf = requestAnimationFrame(tickLoop);
  return () => { ticks.delete(f); if (!ticks.size && tickRaf) { cancelAnimationFrame(tickRaf); tickRaf = 0; } };
}
/** Play `move` on the dancer inside `host` at `bpm`: `times` passes (Infinity = loop), then back to rest. Returns stop. */
function perform(host: HTMLElement, move: MoveName, o: { bpm?: number; times?: number; face?: Face; onDone?: () => void } = {}): () => void {
  const m = MOVES[move]; const beatMs = 60000 / (o.bpm ?? 100); const len = m.beats * beatMs; const times = o.times ?? Infinity;
  const d = dancerNodes(host); let t0 = -1; let stop = () => {};
  stop = onTick(now => {
    if (t0 < 0) t0 = now; const el = (now - t0) / len;
    if (el >= times) { stop(); applyPose(d, REST); o.onDone?.(); return; }
    applyPose(d, sampleMove(m, el % 1), o.face ?? m.face);
  });
  return stop;
}

/** The bean dancer: drawn once per card at rest (React never re-renders it per frame); the loop poses it while it plays. Smiles while it
 *  waits; `cheer` (a track that just finished generating): one happy hop, then waits. */
const Dancer = memo(function Dancer({ playing, pack, cheer }: { playing: boolean; pack: PackId; cheer?: boolean }) {
  const uid = `avd${useId().replace(/[^\w-]/g, '')}`; const html = useMemo(() => dancerSvg(uid), [uid]); const ref = useRef<HTMLSpanElement>(null);
  const cheered = useRef(false);
  useEffect(() => {
    const el = ref.current; if (!cheer || playing || cheered.current || !el || reducedMotion()) return;
    cheered.current = true; el.dataset.cheer = '1';
    const stop = perform(el, 'cheer', { bpm: 104, times: 2, onDone: () => { delete el.dataset.cheer; el.dataset.face = idleFace(pack); } });
    return () => { stop(); delete el.dataset.cheer; };
  }, [cheer, playing]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref} className="av-dancer" data-viz="bean" data-pack={pack} data-face={playing ? (PACKS[pack].faces?.happy ?? 'happy') : idleFace(pack)} data-testid="audio-bean" aria-hidden dangerouslySetInnerHTML={{ __html: html }} />;
});
/** Waiting to be played: a friendly smile (a peaceful track waits with its calm face). */
const idleFace = (pack: PackId): Face => PACKS[pack]?.faces?.smile ?? 'smile';

/** SyteSim on its own, doing one move on loop: the welcome wave on an empty Audio page, the warm-up on a generating tile. Decorative; under
 *  reduced motion it holds the move's first pose (the hand up for the wave) and stays still. */
export function BeanPerformer({ move, bpm = 96, pack = 'groove', face, className = '', testId = 'bean-performer' }: { move: MoveName; bpm?: number; pack?: PackId; face?: Face; className?: string; testId?: string }) {
  const uid = `avp${useId().replace(/[^\w-]/g, '')}`; const ref = useRef<HTMLSpanElement>(null);
  const html = useMemo(() => dancerSvg(uid, sampleMove(MOVES[move], 0)), [uid, move]);
  useEffect(() => { const el = ref.current; if (!el || reducedMotion()) return; return perform(el, move, { bpm, face }); }, [move, bpm, face]);
  return <span ref={ref} className={`av-dancer av-performer ${className}`} data-pack={pack} data-face={face ?? MOVES[move].face} data-move={move} data-testid={testId} aria-hidden dangerouslySetInnerHTML={{ __html: html }} />;
}

/** The chip's menu, in this order. */
const MENU: PackId[] = ['lofi', 'edm', 'peaceful', 'love', 'rap', 'rock', 'classical', 'groove', 'voice', 'sfx'];

export type AudioVizLayerProps = { kind: AudioKind; playing: boolean; bean?: boolean; prompt?: string | null; lyrics?: string | null; chip?: boolean;
  /** The track just finished generating: the bean cheers once. */ cheer?: boolean;
  /** The job (key for the heard / picked style, saved on its meta). */ jobId?: string | null;
  /** The file: listened to once, the first time `listen` turns true. */ src?: string | null;
  /** The job's saved danceStyle meta (heard elsewhere / picked before). */ saved?: SavedStyle;
  /** true once the result is played (a card) or opened (the viewer): start listening. */ listen?: boolean };

/** Drawn over a cover: the glow, (optionally) the dancer, and a chip naming the style ("Rap mode · heard") that opens a menu to pick another. */
export function AudioVizLayer({ kind, playing, bean = true, prompt, lyrics, chip = true, jobId, src, saved, listen, cheer }: AudioVizLayerProps) {
  const st = useStyleChoice({ kind, prompt, lyrics, jobId, src, saved, listenNow: listen });
  const pack = st.choice.pack;
  return <>
    <span className="av-glow" data-viz="glow" data-pack={pack} aria-hidden />
    {bean && <Dancer playing={playing} pack={pack} cheer={cheer} />}
    {bean && chip && <StyleChip st={st} />}
  </>;
}

function StyleChip({ st }: { st: ReturnType<typeof useStyleChoice> }) {
  const [open, setOpen] = useState(false); const btn = useRef<HTMLButtonElement>(null);
  const { choice, heard, picked, listening } = st;
  /* The neutral groove from the words alone: a quiet chip (shows on hover / focus / play) until something is heard or picked. */
  const quiet = choice.pack === 'groove' && choice.source === 'words';
  const label = choice.label || labelOf(choice.pack);
  const hint = choice.source === 'heard' ? 'heard' : choice.source === 'picked' ? 'picked' : listening ? 'listening' : '';
  const auto = heard?.pack ? `Heard: ${heard.label || labelOf(heard.pack)}` : listening ? 'Listening to your track…' : 'From your words';
  return <>
    <button ref={btn} type="button" className={`av-mode${quiet ? ' av-mode-quiet' : ''}`} data-pack={choice.pack} data-source={choice.source} data-testid="audio-mode"
      aria-haspopup="listbox" aria-expanded={open} aria-label={`Mood: ${label}${hint ? `, ${hint}` : ''}. Pick how SyteSim dances`}
      onClick={e => { e.stopPropagation(); setOpen(o => !o); }} onKeyDown={e => e.stopPropagation()}>
      <i className="av-mode-dot" aria-hidden /><span className="av-mode-l">{label}</span>{hint && <small className="av-mode-h" data-testid="audio-mode-hint">· {hint}</small>}
      <svg className="av-mode-caret" viewBox="0 0 12 12" aria-hidden><path d="M3 4.6l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    <BarPopover open={open} anchor={btn} onClose={() => setOpen(false)} label="How SyteSim dances" role="listbox" placement="bottom" align="end" width={300} testId="audio-mode-menu" className="av-mode-pop">
      <PopList label="Automatic">
        <PopRow selected={!picked} label="Automatic" hint={auto} testId="audio-mode-opt-auto" onClick={() => { st.pick(null); setOpen(false); }} />
      </PopList>
      <PopList label="Pick a mood" cols={2}>
        {MENU.map(p => <PopRow key={p} selected={picked === p} label={labelOf(p)} testId={`audio-mode-opt-${p}`} icon={<i className="av-mode-dot" data-pack={p} />} onClick={() => { st.pick(p); setOpen(false); }} />)}
      </PopList>
    </BarPopover>
  </>;
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Drive the visuals of `root` from `audio` while `playing`: bars (`.wf i` inside root), [data-viz=glow|bean]. One loop per playing
 *  element; it stops (and resets every transform) on pause, unmount, or when another track takes over. */
export function useAudioViz(root: RefObject<HTMLElement | null>, audio: RefObject<HTMLMediaElement | null>, playing: boolean, o: { peaks: number[]; duration: number; kind: AudioKind }) {
  const live = useRef(o); live.current = o;
  useEffect(() => { const el = audio.current; return () => { if (el) releaseTap(el); }; }, [audio]);
  useEffect(() => {
    const el = audio.current, box = root.current; if (!playing || !el || !box || reducedMotion()) return;
    let raf = 0, on = true, an: AnalyserNode | null = null, bins: Uint8Array<ArrayBuffer> | null = null;
    analyserFor(el).then(a => { if (on && a) { an = a; bins = new Uint8Array(a.frequencyBinCount); } });
    let bars: HTMLElement[] = []; const q = <T extends HTMLElement>(s: string) => box.querySelector<T>(s);
    const glow = q('[data-viz=glow]');
    const rnd = seeded(hashStr(el.currentSrc || 'x') ^ Date.now());
    let gain = 0.2, last = performance.now(), levels: number[] = [];
    /* the dancer: music sense → beat clock → choreographer → pose */
    const kind0 = live.current.kind; const sense = new MusicSense(); const clock = new BeatClock(kind0 === 'voice' ? 96 : kind0 === 'sfx' ? 120 : 110);
    /* the style pack (beanStyle.ts), drawn on the host (data-pack) by AudioVizLayer: heard, picked or from the words. Checked every frame, so a
       pick from the chip (or the sound being heard mid-play) switches the dance at once. */
    const packOfHost = (): Pack => { const a = q<HTMLElement>('[data-viz=bean]')?.dataset.pack as PackId | undefined; return PACKS[a && PACK_IDS.includes(a) ? a : kind0 === 'voice' ? 'voice' : kind0 === 'sfx' ? 'sfx' : 'groove']; };
    let pack = packOfHost();
    /* ballads, peaceful songs and lo-fi dance in half time when the tempo reads fast */
    const halfOf = (p: Pack) => p.id === 'love' || p.id === 'peaceful' || p.id === 'lofi'; let halfTime = halfOf(pack);
    /* a hello (a little hop and a wave) when you press play, unless the clip is too short for one */
    const dur0 = el.duration || live.current.duration; const greet = !(dur0 > 0) || dur0 - el.currentTime > 4;
    let chor = new Choreographer(kind0, rnd, pack.id, { greet }); let prevBins: Uint8Array<ArrayBuffer> | null = null, prevLevel = 0, dancer: DancerNodes | null = null;
    box.dataset.live = '1';
    const frame = (now: number) => {
      if (!on) return;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
      if (!bars.length || !bars[0].isConnected) bars = Array.from(box.querySelectorAll<HTMLElement>('.wf i'));
      let level: number, feat: Features;
      if (an && bins) {
        an.getByteFrequencyData(bins); levels = barLevels(bins, bars.length, levels);
        level = energyOfBins(bins, 1, 64); feat = featuresFromBins(bins, prevBins);
        if (!prevBins) prevBins = new Uint8Array(bins.length); prevBins.set(bins);
      } else {
        const { peaks, duration } = live.current; level = peakLevel(peaks, el.currentTime, el.duration || duration, now); feat = featuresFromLevel(level, prevLevel); prevLevel = level;
        if (levels.length !== bars.length) levels = new Array(bars.length).fill(0);
        for (let i = 0; i < bars.length; i++) levels[i] = level * (0.5 + 0.5 * Math.abs(Math.sin(i * 0.9 + now / 170 + i * i * 0.13)));
      }
      /* Soft auto-gain: bars are drawn against the loudest bar of the last second or so, so quiet and loud tracks both move. */
      let mx = 0; for (let i = 0; i < levels.length; i++) if (levels[i] > mx) mx = levels[i];
      gain = Math.max(0.2, mx, gain * Math.pow(0.45, dt));
      /* A share of the overall loudness rides on every bar, so narrow sounds (a voice, a hum) still move the whole waveform. */
      const all = Math.min(1, (0.5 * mx + level) / gain);
      for (let i = 0; i < bars.length; i++) { const v = Math.max((levels[i] ?? 0) / gain, all * (0.35 + 0.4 * Math.abs(Math.sin(i * 1.3 + now / 210)))); bars[i].style.transform = `scaleY(${(0.3 + 0.85 * v * v).toFixed(3)})`; }
      if (glow) glow.style.opacity = (0.2 + 0.8 * Math.min(1, level * 1.4)).toFixed(3);
      const onset = sense.update(feat, now); const s = sense.snapshot(now);
      if (kind0 === 'music') clock.bpm = halfTime && s.bpm > 110 ? s.bpm / 2 : s.bpm; if (onset && kind0 !== 'sfx') clock.onset(); clock.advance(dt);
      const host = q<HTMLElement>('[data-viz=bean]');
      if (host) {
        if (!dancer || dancer.el !== host) dancer = dancerNodes(host);
        if (host.dataset.pack !== pack.id) { pack = packOfHost(); halfTime = halfOf(pack); chor = new Choreographer(kind0, rnd, pack.id); }
        const dur = el.duration || live.current.duration; const left = dur > 0 && isFinite(dur) ? dur - el.currentTime : Infinity;
        const ending = left < Math.max(2.2, (4 * 60) / clock.bpm) && dur > 6;
        const f = chor.update(clock.pos, s, { ending, amount: 0.62 + 0.38 * Math.min(1, s.level * 2.4), cutIn: onset && kind0 === 'sfx' });
        applyPose(dancer, f.pose, f.face); if (host.dataset.move !== f.move) host.dataset.move = f.move; const calm = s.quiet ? '1' : '0'; if (host.dataset.calm !== calm) host.dataset.calm = calm;
        /* dev only: set window.__beanLog = [] in the console to log what the bean hears, frame by frame */
        const dbg = (import.meta as any).env?.DEV ? (window as any).__beanLog : null; if (Array.isArray(dbg) && dbg.length < 20000) dbg.push({ t: +el.currentTime.toFixed(2), move: f.move, ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(3) : v])) });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      on = false; cancelAnimationFrame(raf); delete box.dataset.live;
      for (const b of bars) b.style.transform = ''; if (glow) glow.style.opacity = '';
      const host = q<HTMLElement>('[data-viz=bean]'); if (host) { applyPose(dancer && dancer.el === host ? dancer : dancerNodes(host), REST); host.dataset.face = idleFace(host.dataset.pack as PackId); delete host.dataset.move; delete host.dataset.calm; }
    };
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps
}
