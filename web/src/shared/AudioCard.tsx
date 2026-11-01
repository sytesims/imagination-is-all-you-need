/** The one audio result card (Audio feed, canvas, Film, Stitch). Two layouts of the same card:
 *  - the tile (default; the Audio feed, 2026-10-29 polish): a big play button beside the title (two lines max) and one meta line (the kind
 *    chip, length, model, price), then a real waveform with the progress scrub (click / drag / ←→ to seek) and the time. A status shows only when
 *    it matters (the file is gone). SyteSim is a small accent that dances beside the title while the sound plays (and cheers once when it just
 *    finished generating); the big dance lives in the viewer. About 2.5× more sounds per screen than the old cover card.
 *    2026-11-01: a short title on one line with the prompt as one dim line under it (full text on hover), the chip row on its own full-width line
 *    (never cut: the model's short form, full name on hover), and the waveform pinned to the bottom so every card in a row lines up.
 *  - `cover={false}`: the compact row (canvas nodes, Film, Stitch, result cards): play in the waveform row, title and meta under it.
 *  One player at a time (shared/audioPlayer + soundDirector); Space on the focused card plays / pauses. Decodes only once the card scrolls into
 *  view; only the playing card animates. */
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Waveform, useWaveform, clockText, durClock } from './Waveform';
import { useExclusivePlayback } from './audioPlayer';
import { primeAudio } from './audioGraph';
import { AudioVizLayer, useAudioViz } from './AudioViz';
import type { AudioKind } from './audioVizLogic';
import type { SavedStyle } from './listenStyle';
import { feedPropsEqual } from '../ui/next/feed/feedMemo';
import './audioCard.css';

export type AudioCardProps = {
  src: string | null | undefined;
  /** A short title (shared shortTitle: the job's own title, else a few words of its prompt). The tile shows one line; the compact row two. */
  title: string;
  /** The tile's one dim line under the title (the prompt); the full text shows on hover. */
  subtitle?: string | null;
  /** The real model name, always shown (the tile may pass a short form here and the full name as modelTitle). */
  model: string;
  /** The model's full name for the tooltip when `model` is a short form. */
  modelTitle?: string | null;
  /** Price chip or text (e.g. <GenPrice/>); the slot stays empty when absent. */
  price?: ReactNode;
  /** Seconds, when the job already knows it (shown before decoding). */
  duration?: number | null;
  /** Clicking the title opens the result (the clicked element: focus goes back to it when the viewer closes). */
  onOpen?: (from?: HTMLElement | null) => void;
  bars?: number;
  testId?: string;
  /** Music, a voice or a sound effect: the kind chip's word and the bean's default style. */
  kind?: AudioKind;
  /** The kind chip's text when it should say more than the kind (the workflow: "Cover a song", "Music for a video"). */
  tag?: string | null;
  /** Kept for callers (the job id); the tile has no generated cover any more. */
  seed?: string;
  /** The words the bean's dance style comes from (defaults to the title). */
  prompt?: string | null;
  /** The song's lyrics, when it has any: with the prompt they pick the bean's dance style (rap, love song, rock...). */
  lyrics?: string | null;
  /** false: the compact row, the play button sits in the waveform row (small canvas nodes, Film, Stitch). Default: the feed tile. */
  cover?: boolean;
  /** The job: the bean's heard / picked style is kept on it (and listened to once, the first time this card plays). */
  jobId?: string | null;
  /** The job's saved danceStyle meta. */
  danceStyle?: SavedStyle;
  /** The track just finished generating (this visit): SyteSim cheers once. */
  cheer?: boolean;
};

/** True once the element has come near the viewport (stays true). */
function useSeen<T extends Element>(margin = '200px') {
  const ref = useRef<T>(null); const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(el); return () => io.disconnect();
  }, [seen, margin]);
  return [ref, seen] as const;
}

/** The card's play / pause glyphs (the result viewer's player uses the same ones). */
export const PlayGlyph = ({ s = 16 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>;
export const PauseGlyph = ({ s = 16 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>;
/** The time beside the waveform: the length before it plays; "0:12 / 0:40" (where it is / how long) while playing or paused part-way, so a
 *  paused card never reads "0:00" with its length gone (UX audit #15). */
export function durLabel(missing: boolean, playing: boolean, t: number, d: number): string {
  if (missing) return '--:--';
  if (playing || t > 0) return d > 0 ? `${clockText(t)} / ${durClock(d)}` : clockText(t);
  return d > 0 ? durClock(d) : '--:--';
}
const KIND_WORD: Record<AudioKind, string> = { music: 'Music', voice: 'Voice', sfx: 'Sound effect' };
/** The tile's kind chip: plain words for what the sound is. */
export const KIND_CHIP: Record<AudioKind, string> = { music: 'Music', voice: 'Voiceover', sfx: 'Sound FX' };

function AudioCardView({ src, title, subtitle, model, modelTitle, price, duration, onOpen, bars, testId = 'audio-card', kind = 'music', tag, prompt, lyrics, cover = true, jobId, danceStyle, cheer }: AudioCardProps) {
  const [box, seen] = useSeen<HTMLDivElement>();
  const a = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false); const [t, setT] = useState(0); const [md, setMd] = useState(0); const [bad, setBad] = useState(false);
  /* the bean stays a moment after a pause (its bow), then leaves the card clean */
  const [bean, setBean] = useState(false);
  useEffect(() => { if (playing || cheer) { setBean(true); return; } const id = setTimeout(() => setBean(false), 1600); return () => clearTimeout(id); }, [playing, cheer]);
  useEffect(() => { setPlaying(false); setT(0); setMd(0); setBad(false); }, [src]);
  useExclusivePlayback(a);
  const wave = useWaveform(src, { bars: bars ?? 48, enabled: seen });
  const missing = !src || bad || wave.error === 'missing';
  const d = md || wave.duration || (duration && duration > 0 ? duration : 0);
  useAudioViz(box, a, playing, { peaks: wave.bars, duration: d, kind });
  const toggle = () => { const el = a.current; if (!el || missing) return; primeAudio(); if (el.paused) el.play().catch(() => setPlaying(false)); else el.pause(); };
  const seek = (sec: number) => { const el = a.current; if (!el || missing) return; el.currentTime = sec; setT(sec); };
  const name = title.trim() || 'Untitled audio';
  const sub0 = subtitle?.replace(/\s+/g, ' ').trim() || null; const sub = sub0 && sub0.toLowerCase() !== name.toLowerCase() ? sub0 : null; // never the title twice
  /* Space on the card itself (or its waveform) plays / pauses; buttons and links keep their own Space. */
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== ' ' || e.altKey || e.ctrlKey || e.metaKey) return; const tg = e.target as HTMLElement;
    if (tg !== e.currentTarget && tg.closest('button, a, input, textarea, select, [contenteditable]')) return;
    e.preventDefault(); toggle();
  };
  const playBtn = <button type="button" className={`ac-play${cover ? ' ac-play-lg' : ''}`} data-testid={`${testId}-play`} disabled={missing} onClick={toggle}
    aria-label={missing ? 'This audio file isn’t here any more' : playing ? `Pause ${name}` : `Play ${name}`} aria-pressed={missing ? undefined : playing} title={missing ? 'This file was moved or deleted, so it can’t play' : undefined}>
    {playing ? <PauseGlyph s={cover ? 20 : 16} /> : <PlayGlyph s={cover ? 20 : 16} />}
  </button>;
  const timeEl = <span className={`ac-dur${!missing && (playing || t > 0) && d > 0 ? ' ac-dur-pos' : ''}`} data-testid={`${testId}-dur`}>{durLabel(missing, playing, t, d)}</span>;
  const waveEl = <Waveform className="ac-wave" testId={`${testId}-wave`} state={missing ? 'fallback' : wave.state} bars={wave.bars} time={t} duration={missing ? 0 : d}
    onSeek={missing ? undefined : seek} label={`Seek ${name}`} />;
  const titleEl = onOpen ? <button type="button" className="ac-title" data-testid={`${testId}-open`} onClick={e => onOpen(e.currentTarget)} title={name}>{name}</button> : <span className="ac-title" title={name}>{name}</span>;
  return <div ref={box} className={`ac${cover ? ' ac-tile' : ''}${playing ? ' is-playing' : ''}${missing ? ' is-missing' : ''}`} data-testid={testId} data-state={missing ? 'missing' : wave.state} data-kind={kind}
    tabIndex={missing ? undefined : 0} role="group" aria-label={`${KIND_WORD[kind]}: ${name}${model ? `, ${modelTitle || model}` : ''}${playing ? ', playing' : ''}. Space to ${playing ? 'pause' : 'play'}`} onKeyDown={missing ? undefined : onKey}>
    {cover ? <>
      <div className="ac-top">
        {playBtn}
        <div className="ac-head">
          {titleEl}
          {sub && <span className="ac-sub" data-testid={`${testId}-sub`} title={sub}>{sub}</span>}
        </div>
        {bean && !missing && <span className="ac-bean" data-testid={`${testId}-bean`}><AudioVizLayer kind={kind} playing={playing} chip={false} prompt={prompt ?? title} lyrics={lyrics} jobId={jobId} src={src} saved={danceStyle} listen={playing} cheer={cheer} /></span>}
      </div>
      <div className="ac-meta">
        <span className="ac-kind" data-testid={`${testId}-kind`} data-kind={kind}><i aria-hidden />{tag || KIND_CHIP[kind]}</span>
        {missing ? <span className="ac-status" data-testid={`${testId}-status`}>File missing</span> : null}
        <span className="ac-model" data-testid={`${testId}-model`} title={modelTitle && modelTitle !== model ? modelTitle : undefined}>{model}</span>
        <span className="ac-price" data-testid={`${testId}-price`}>{price}</span>
      </div>
      <div className="ac-row">{waveEl}{timeEl}</div>
    </> : <>
      <div className="ac-row">{playBtn}{waveEl}{timeEl}</div>
      <div className="ac-body">
        {titleEl}
        <div className="ac-meta"><span className="ac-model" data-testid={`${testId}-model`}>{model}</span><span className="ac-price" data-testid={`${testId}-price`}>{price}</span></div>
      </div>
    </>}
    <audio ref={a} src={seen && src ? src : undefined} preload="none"
      onLoadedMetadata={e => { const x = e.currentTarget.duration; if (isFinite(x) && x > 0) setMd(x); }}
      onTimeUpdate={e => setT(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onEnded={e => { setPlaying(false); setT(0); e.currentTarget.currentTime = 0; }} onError={() => { if (a.current?.getAttribute('src')) { setBad(true); setPlaying(false); } }} />
  </div>;
}

/** Memoised like the feed cards: renders again only when something it shows changed (callbacks count as equal). */
export const AudioCard = memo(AudioCardView, feedPropsEqual);
export default AudioCard;
