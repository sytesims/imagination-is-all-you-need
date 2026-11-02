/** "Write a song. Watch it dance." (2026-11-02): our song from Audio › Music (YuE2, free on our own computer) with one play button and its real
 *  waveform, and SyteSim dancing beside it in a wide "now playing" band, in the middle of Explore. While the song plays he goes through his five
 *  dances (each twice, then the next); paused or at the end he stands still. Reduced motion: he stays a still and no video loads.
 *  "See how we made it" opens the chain (the shared Popover: a panel on desktop, a bottom sheet on a phone) as small step cards from the real runs.
 *  Data: shared/exploreShowcase.ts EXPLORE_SONG. Shared parts: the Waveform, the RunChip, the Popover, Explore's headline and buttons. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '../../platform/router';
import { Waveform, useWaveform, clockText, durClock } from '../../shared/Waveform';
import { prefersReducedMotion } from '../../shared/HoverClip';
import { RunChip } from '../../shared/RunChip';
import { Popover } from '../../shared/Popover';
import { turnSoundOn, useDirectedSound } from '../../shared/soundDirector';
import { MusicIcon, PlayIcon } from '../Icons';
import { EXPLORE_SONG, type SongMakingStep } from '../../../../server/src/shared/exploreShowcase';
import { LOCAL_LABEL } from '../../../../server/src/shared/modelIds';
import { chipUsd, type RunChipData } from '../../../../server/src/shared/runChip';
import './exploreSong.css';

const S = EXPLORE_SONG; const D = S.dancer.dances;
const CHIP: RunChipData = { model: S.song.model, place: LOCAL_LABEL, price: chipUsd(0) };
/** Safari (and every browser on iPhone and iPad) can't show a WebM's alpha, so it gets the HEVC copy. */
const webkitOnly = () => typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (/Safari\//.test(navigator.userAgent) && !/Chrom(e|ium)|Edg\/|Firefox\//.test(navigator.userAgent)));

export function XpSong() {
  const box = useRef<HTMLElement>(null); const audio = useRef<HTMLAudioElement>(null);
  const [near, setNear] = useState(false); const [playing, setPlaying] = useState(false); const [time, setTime] = useState(0); const [len, setLen] = useState(0);
  const [still] = useState(prefersReducedMotion);
  const [narrow] = useState(() => typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches); /* fewer, wider bars on a phone */
  const wave = useWaveform(S.song.url, { bars: narrow ? 44 : 96, enabled: near });
  const total = len || wave.duration || S.song.sec;
  /* load the song's bars and the dances only once the section is close */
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
  /* the page's sound director owns the song's `muted` (it mounts muted): pressing Play makes it the explicit player, so it takes the sound from
     the clips around it while it plays and hands it back on pause or at the end; never two sounds at once. Paused, it asks for no sound. */
  useDirectedSound({ root: box, media: () => audio.current, sound: playing, explicit: true });
  const toggle = () => { const a = audio.current; if (!a) return; if (a.paused) { turnSoundOn(); void a.play().catch(() => setPlaying(false)); } else a.pause(); };
  const seek = (s: number) => { const a = audio.current; if (a) { a.currentTime = s; setTime(s); } };
  return <section ref={box} className={`xv-sec xsg${playing ? ' is-playing' : ''}`} id="xp-song" data-testid="xp-song" aria-labelledby="xp-h-song">
    <header className="xsdc-head">
      <span className="xv-eb">{S.eyebrow}</span>
      <h2 id="xp-h-song" className="xps-h xsdc-h">{S.title.map(l => <span key={l}>{l}</span>)}</h2>
      <p className="xps-p xsdc-p">{S.line}</p>
    </header>
    <div className="xsg-band">
      <div className="xsg-stage" aria-hidden>
        <span className="xsg-floor" />
        {still || !near ? <img className="xsg-dancer is-front" src={S.dancer.still} alt="" width={S.dancer.width} height={S.dancer.height} decoding="async" loading="lazy" draggable={false} />
          : <Dancer playing={playing} />}
      </div>
      <div className="xsg-player">
        <div className="xsg-now"><span className="xsg-live" aria-hidden><i /><i /><i /></span>{playing ? 'Now playing' : 'Our song'}</div>
        <h3 className="xsg-title">{S.song.title}</h3>
        <p className="xsg-about">{S.song.about} · “{S.song.lyric}”</p>
        <Waveform className="xsg-wave" bars={wave.bars} state={wave.state} time={time} duration={total} onSeek={seek} label={`Seek ${S.song.title}`} testId="xp-song-wave" />
        <div className="xsg-bar">
          <button type="button" className="xsg-play" onClick={toggle} aria-label={playing ? `Pause ${S.song.title}` : `Play ${S.song.title}`} aria-pressed={playing} data-testid="xp-song-play">
            {playing ? <span className="xsg-pause" aria-hidden><i /><i /></span> : <PlayIcon size={20} />}</button>
          <span className="xsg-time" data-testid="xp-song-time">{clockText(time)} / {durClock(total)}</span>
          <RunChip c={CHIP} className="xsg-chip" testId="xp-song-chip" />
        </div>
        <audio ref={audio} src={S.song.url} preload="metadata" muted data-testid="xp-song-audio" onLoadedMetadata={e => setLen(e.currentTarget.duration || 0)}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setTime(0); }} />
      </div>
    </div>
    <div className="xsg-ctas"><Link to={S.cta.href} className="xv-btn" data-testid="xp-song-cta">{S.cta.label}<span className="xv-arrow" aria-hidden>→</span></Link>
      <Making still={still} /></div>
  </section>;
}

/** Two stacked clips: the one in front dances; the one behind already holds the next dance on its first frame. Every dance starts and ends on
 *  the same standing pose, so when the front one has played S.dancer.repeats times the cut to the next is seamless (no blank frame, no shift). */
function Dancer({ playing }: { playing: boolean }) {
  const a = useRef<HTMLVideoElement>(null); const b = useRef<HTMLVideoElement>(null);
  const [hevc] = useState(webkitOnly);
  const cyc = useRef({ front: 0, idx: 0, plays: 0 });
  const vid = (k: number) => (k === 0 ? a : b).current;
  const srcOf = (i: number) => { const d = D[i % D.length]; return hevc ? d.mov : d.webm; };
  /* show slot k in front, the other behind (opacity only: both keep their place) */
  const show = (k: number) => { for (const j of [0, 1]) { const v = vid(j); if (v) { v.classList.toggle('is-front', j === k); } } };
  const load = (k: number, i: number) => { const v = vid(k); if (!v) return; v.src = srcOf(i); v.dataset.dance = D[i % D.length].id; v.load(); };
  /* back to the start: the bounce in front, the next dance behind */
  const reset = () => { cyc.current = { front: 0, idx: 0, plays: 0 }; for (const k of [0, 1]) { const v = vid(k); if (v) v.pause(); } load(0, 0); load(1, 1); show(0); };
  useEffect(() => { reset(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  /* dancing while the song plays; stopped, he goes back to standing (frame 0 of the dance in front) */
  useEffect(() => {
    const v = vid(cyc.current.front); if (!v) return;
    if (playing) void v.play().catch(() => 0); else { v.pause(); try { v.currentTime = 0; } catch { /* not loaded yet */ } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  const onEnded = (k: number) => {
    const c = cyc.current; if (k !== c.front) return; const v = vid(k); if (!v) return;
    c.plays++;
    if (c.plays < S.dancer.repeats) { v.currentTime = 0; void v.play().catch(() => 0); return; }
    const next = 1 - k; c.front = next; c.idx = (c.idx + 1) % D.length; c.plays = 0;
    const n = vid(next); if (n) { n.currentTime = 0; void n.play().catch(() => 0); }
    show(next);
    load(k, c.idx + 1); /* the one now behind fetches the dance after this one */
  };
  /* an HEVC copy that won't play (an older Safari): fall back to the WebM */
  const onError = (k: number) => { const v = vid(k); if (v && hevc && /\.mov$/.test(v.src)) { const i = D.findIndex(d => d.id === v.dataset.dance); v.src = D[Math.max(0, i)].webm; v.load(); } };
  return <>{[a, b].map((r, k) => <video key={k} ref={r} className={`xsg-dancer${k === 0 ? ' is-front' : ''}`} poster={k === 0 ? S.dancer.still : undefined} width={S.dancer.width} height={S.dancer.height}
    muted playsInline preload="auto" disablePictureInPicture tabIndex={-1} data-testid={`xp-song-dance-${k}`} onEnded={() => onEnded(k)} onError={() => onError(k)} />)}</>;
}

/** A step's run line, "model · where · price" (the RunChip's words); a manual step says where it was done and that it was free, no model. */
const stepPrice = (x: SongMakingStep) => `${chipUsd(x.usd, x.est)}${x.runs && x.runs > 1 ? ' each' : ''}`;
const stepLine = (x: SongMakingStep) => [x.model, x.place, stepPrice(x)].filter(Boolean).join(' · ');

/** "See how we made it · 6 steps": the button and its panel of step cards. Clips loop only while it is open, never with reduced motion. */
function Making({ still }: { still: boolean }) {
  const M = S.making; const btn = useRef<HTMLButtonElement>(null); const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return <>
    <button ref={btn} type="button" className="xv-quiet xsg-how" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="xp-song-how">
      {M.label} · {M.steps.length} steps</button>
    <Popover open={open} anchor={btn} onClose={close} label="How we made it" placement="top" align="center" closeButton className="xsgm-pop" testId="xp-song-making">
      <ol className="xsgm-list">{M.steps.map((x, k) => <li key={x.role} className={`xsgm-step${x.manual ? ' is-manual' : ''}`} tabIndex={0} data-apop-item
        aria-label={`Step ${k + 1}: ${x.role}. ${x.manual ? `${x.place}, free. ${x.note ?? ''}` : `${x.tool ? `${x.tool}, ` : ''}${stepLine(x)}.${x.note ? ` ${x.note}.` : ''}`}`} data-testid={`xp-song-step-${k + 1}`}>
        <div className="xsgm-media" aria-hidden><StepMedia x={x} still={still} /><span className="xsgm-n">{k + 1}</span></div>
        <div className="xsgm-text" aria-hidden>
          <b className="xsgm-role">{x.role}</b>
          {x.manual ? <span className="xsgm-run is-manual">{x.place} · <em>Free</em></span>
            : <><span className="xsgm-tool">{x.tool}</span><span className="xsgm-run">{x.model} · {x.place} · <em className={x.usd === 0 ? 'is-free' : ''}>{stepPrice(x)}</em></span></>}
          {x.note && <span className="xsgm-note">{x.note}</span>}
        </div>
      </li>)}</ol>
      <p className="xsgm-total" data-testid="xp-song-making-total"><span>Total</span><b>{M.total}</b>
        <small>Each picture as billed. The dances are Comfy’s GPU-time estimate. The song and the edit were free.</small></p>
    </Popover>
  </>;
}
function StepMedia({ x, still }: { x: SongMakingStep; still: boolean }) {
  const [hevc] = useState(webkitOnly);
  if (x.keyed) { const d = D[1]; return <span className="xsgm-keyed">{still ? <img src={S.dancer.still} alt="" width={S.dancer.width} height={S.dancer.height} decoding="async" draggable={false} />
    : <video src={hevc ? d.mov : d.webm} poster={S.dancer.still} width={S.dancer.width} height={S.dancer.height} muted playsInline autoPlay loop disablePictureInPicture tabIndex={-1}
      onError={(e) => { if (hevc && /\.mov$/.test(e.currentTarget.src)) e.currentTarget.src = d.webm; }} />}</span>; }
  if (x.clip && !still) return <video src={x.clip} poster={x.img} width={x.w} height={x.h} muted playsInline autoPlay loop disablePictureInPicture tabIndex={-1} />;
  if (x.img) return <img src={x.img} alt="" width={x.w} height={x.h} decoding="async" draggable={false} />;
  return <span className="xsgm-song"><MusicIcon size={26} /><small>{S.song.title}</small></span>;
}
