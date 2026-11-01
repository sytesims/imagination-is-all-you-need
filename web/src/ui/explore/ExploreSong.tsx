/** "Write a song. Watch it dance." (2026-11-02): our song from Audio › Music (YuE2, free on our own computer) with one play button and its real
 *  waveform, and SyteSim dancing beside it: he moves while the song plays and stands still when it stops. Reduced motion: he stays a still.
 *  Two layouts while the user picks (?songsection=a, the default: a wide "now playing" band in the middle of Explore; b: a compact card near
 *  the end). Data: shared/exploreShowcase.ts EXPLORE_SONG. Shared parts: the Waveform, the RunChip, Explore's buttons. */
import { useEffect, useRef, useState } from 'react';
import { Link } from '../../platform/router';
import { Waveform, useWaveform, clockText, durClock } from '../../shared/Waveform';
import { prefersReducedMotion } from '../../shared/HoverClip';
import { RunChip } from '../../shared/RunChip';
import { PlayIcon } from '../Icons';
import { EXPLORE_SONG } from '../../../../server/src/shared/exploreShowcase';
import { LOCAL_LABEL } from '../../../../server/src/shared/modelIds';
import { chipUsd, type RunChipData } from '../../../../server/src/shared/runChip';
import './exploreSong.css';

export type SongLayout = 'a' | 'b';
/** The layout on show: ?songsection=b, else A. */
export const songLayout = (): SongLayout => (typeof location !== 'undefined' && new URLSearchParams(location.search).get('songsection') === 'b' ? 'b' : 'a');
/** Safari (and every browser on iPhone and iPad) can't show a WebM's alpha, so it gets the HEVC copy first. */
const webkitOnly = () => typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (/Safari\//.test(navigator.userAgent) && !/Chrom(e|ium)|Edg\/|Firefox\//.test(navigator.userAgent)));

const S = EXPLORE_SONG;
const CHIP: RunChipData = { model: S.song.model, place: LOCAL_LABEL, price: chipUsd(0) };

/** Rendered once per slot; only the slot that matches the picked layout shows. */
export function XpSong({ layout }: { layout: SongLayout }) {
  const [on] = useState(songLayout);
  return on === layout ? <SongSection layout={layout} /> : null;
}

function SongSection({ layout }: { layout: SongLayout }) {
  const box = useRef<HTMLElement>(null); const audio = useRef<HTMLAudioElement>(null); const dance = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false); const [playing, setPlaying] = useState(false); const [time, setTime] = useState(0); const [len, setLen] = useState(0);
  const [still] = useState(prefersReducedMotion); const [hevc] = useState(webkitOnly);
  /* fewer, wider bars on a phone */
  const [narrow] = useState(() => typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches);
  const wave = useWaveform(S.song.url, { bars: narrow ? 44 : layout === 'a' ? 96 : 64, enabled: near });
  const total = len || wave.duration || S.song.sec;
  /* load the song's bars and the dance only once the section is close */
  useEffect(() => {
    const el = box.current; if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '600px' });
    io.observe(el); return () => io.disconnect();
  }, []);
  /* the played part of the waveform follows the song every frame */
  useEffect(() => {
    if (!playing) return; let raf = 0;
    const step = () => { setTime(audio.current?.currentTime ?? 0); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [playing]);
  /* SyteSim dances while the song plays; stopped, he goes back to standing (the still's pose) */
  useEffect(() => {
    const v = dance.current; if (!v) return;
    if (playing) void v.play().catch(() => 0); else { v.pause(); try { v.currentTime = 0; } catch { /* not loaded yet */ } }
  }, [playing]);
  const toggle = () => { const a = audio.current; if (!a) return; if (a.paused) void a.play().catch(() => setPlaying(false)); else a.pause(); };
  const seek = (s: number) => { const a = audio.current; if (a) { a.currentTime = s; setTime(s); } };
  const band = layout === 'a';
  const dancer = <div className="xsg-stage" aria-hidden>
    <span className="xsg-floor" />
    {still || !near ? <img className="xsg-dancer" src={S.dancer.still} alt="" width={S.dancer.width} height={S.dancer.height} decoding="async" loading="lazy" draggable={false} />
      : <video ref={dance} className="xsg-dancer" poster={S.dancer.still} width={S.dancer.width} height={S.dancer.height} muted loop playsInline preload="auto" disablePictureInPicture tabIndex={-1} data-testid="xp-song-dance">
        {hevc && <source src={S.dancer.mov} type='video/mp4; codecs="hvc1"' />}
        <source src={S.dancer.webm} type="video/webm" />
        {!hevc && <source src={S.dancer.mov} type='video/mp4; codecs="hvc1"' />}
      </video>}
  </div>;
  const player = <div className="xsg-player">
    <div className="xsg-now"><span className="xsg-live" aria-hidden><i /><i /><i /></span>{playing ? 'Now playing' : 'Our song'}</div>
    <h3 className="xsg-title">{S.song.title}</h3>
    <p className="xsg-about">{S.song.about} · “{S.song.lyric}”</p>
    <Waveform className="xsg-wave" bars={wave.bars} state={wave.state} time={time} duration={total} onSeek={seek} label={`Seek ${S.song.title}`} testId="xp-song-wave" />
    <div className="xsg-bar">
      <button type="button" className="xsg-play" onClick={toggle} aria-label={playing ? `Pause ${S.song.title}` : `Play ${S.song.title}`} aria-pressed={playing} data-testid="xp-song-play">
        {playing ? <span className="xsg-pause" aria-hidden><i /><i /></span> : <PlayIcon size={band ? 20 : 18} />}</button>
      <span className="xsg-time" data-testid="xp-song-time">{clockText(time)} / {durClock(total)}</span>
      <RunChip c={CHIP} className="xsg-chip" testId="xp-song-chip" />
    </div>
    <audio ref={audio} src={S.song.url} preload="metadata" onLoadedMetadata={e => setLen(e.currentTarget.duration || 0)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setTime(0); }} />
  </div>;
  const cta = <Link to={S.cta.href} className={`xv-btn${band ? '' : ' xv-btn-sm'}`} data-testid="xp-song-cta">{S.cta.label}<span className="xv-arrow" aria-hidden>→</span></Link>;
  return <section ref={box} className={`xv-sec xsg is-${layout}${playing ? ' is-playing' : ''}`} id="xp-song" data-testid="xp-song" data-layout={layout} aria-labelledby="xp-h-song">
    {band ? <>
      <header className="xsdc-head">
        <span className="xv-eb">{S.eyebrow}</span>
        <h2 id="xp-h-song" className="xps-h xsdc-h">{S.title.map(l => <span key={l}>{l}</span>)}</h2>
        <p className="xps-p xsdc-p">{S.line}</p>
      </header>
      <div className="xsg-band">{dancer}{player}</div>
      <div className="xsg-ctas">{cta}</div>
    </> : <div className="xsg-card">
      {dancer}
      <div className="xsg-side">
        <span className="xv-eb">{S.eyebrow}</span>
        <h2 id="xp-h-song" className="xsg-h">{S.title.join(' ')}</h2>
        <p className="xsg-line">{S.line}</p>
        {player}
        <div className="xsg-ctas">{cta}</div>
      </div>
    </div>}
  </section>;
}
