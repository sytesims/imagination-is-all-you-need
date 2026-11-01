/** "Give a character a voice": the portrait → the voice → the talking video, in one row. An existing example; nothing generates here.
 *  The voice card plays only the speech clip; the video's own Play plays the result with its sound. Starting one stops the other. */
import { useEffect, useRef, useState } from 'react';
import { Link } from '../../platform/router';
import { ShowcaseFilm } from '../../shared/ShowcaseFilm';
import { Waveform, useWaveform, clockText, durClock } from '../../shared/Waveform';
import { PlayIcon } from '../Icons';
import { RunChip } from '../../shared/RunChip';
import { chipOfChain, featuredPlace } from '../../../../server/src/shared/runChip';
import { featuredByKey, featuredRecreateHref } from '../../../../server/src/shared/featured';
import { videoWorkflowHref } from '../../../../server/src/shared/videoWorkflows';
import './explorePresenter.css';

const FILM = 'xp-presenter-film';

export function XpPresenter() {
  const f = featuredByKey('presenter-talk');
  const rec = f ? featuredRecreateHref(f.key) : null;
  if (!f?.before || !f.input.speechUrl || !rec) return null;
  return <PresenterRow f={f} speech={String(f.input.speechUrl)} portrait={f.before.url} rec={rec} />;
}

type F = NonNullable<ReturnType<typeof featuredByKey>>;
function PresenterRow({ f, speech, portrait, rec }: { f: F; speech: string; portrait: string; rec: string }) {
  const row = useRef<HTMLDivElement>(null); const audio = useRef<HTMLAudioElement>(null);
  const [near, setNear] = useState(false); const [playing, setPlaying] = useState(false); const [time, setTime] = useState(0); const [len, setLen] = useState(0);
  const wave = useWaveform(speech, { bars: 56, enabled: near });
  const total = len || wave.duration;
  /* decode the waveform only once the row is close */
  useEffect(() => {
    const el = row.current; if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '400px' });
    io.observe(el); return () => io.disconnect();
  }, []);
  /* a smooth played line while the voice plays */
  useEffect(() => {
    if (!playing) return; let raf = 0;
    const step = () => { setTime(audio.current?.currentTime ?? 0); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [playing]);
  const toggleVoice = () => {
    const a = audio.current; if (!a) return;
    if (!a.paused) { a.pause(); return; }
    // the voice alone: pause the talking video through its own control
    const v = row.current?.querySelector('video');
    if (v && !v.paused) row.current?.querySelector<HTMLButtonElement>(`[data-testid="${FILM}-play"]`)?.click();
    void a.play().catch(() => setPlaying(false));
  };
  const seek = (s: number) => { const a = audio.current; if (a) { a.currentTime = s; setTime(s); } };
  return <section className="xv-sec xpa" id="xp-presenter" data-testid="xp-presenter" aria-labelledby="xp-h-presenter">
    <header className="xsdc-head">
      <h2 id="xp-h-presenter" className="xps-h xsdc-h"><span>Give a character</span><span>a voice.</span></h2>
      <p className="xps-p xsdc-p">A portrait and a voice become a talking video.</p>
    </header>
    {/* media events don't bubble, so the video's play is caught on the way down */}
    <div ref={row} className="xpa-row" onPlayCapture={e => { if (e.target instanceof HTMLVideoElement) audio.current?.pause(); }}>
      <figure className="xpa-card xpa-portrait" data-testid="xp-presenter-portrait">
        <img src={portrait} alt="The portrait the talking video starts from" loading="lazy" decoding="async" draggable={false} />
        <span className="xv-tag">Portrait</span>
      </figure>
      <span className="xpa-link" aria-hidden>+</span>
      <figure className={`xpa-card xpa-voice${playing ? ' on' : ''}`} data-testid="xp-presenter-voice">
        <span className="xv-tag">Voice</span>
        <Waveform className="xpa-wave" bars={wave.bars} state={wave.state} time={time} duration={total} onSeek={seek} label="Seek voice" testId="xp-presenter-voice-wave" />
        <figcaption className="xpa-voice-bar">
          <button type="button" className="xpa-voice-play" onClick={toggleVoice} aria-label={playing ? 'Pause the voice' : 'Play the voice'} data-testid="xp-presenter-voice-play">
            {playing ? <span className="xpa-pause" aria-hidden><i /><i /></span> : <PlayIcon size={16} />}</button>
          <span className="xpa-voice-time">{playing || time > 0 ? `${clockText(time)} / ` : ''}{total ? durClock(total) : '--:--'}</span>
        </figcaption>
        <audio ref={audio} src={speech} preload="metadata" onLoadedMetadata={e => setLen(e.currentTarget.duration || 0)}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setTime(0); }} />
      </figure>
      <span className="xpa-link" aria-hidden>→</span>
      <figure className="xpa-card xpa-result" data-testid="xp-presenter-result">
        <ShowcaseFilm className="xpa-film" testId={FILM} label="Talking video" manual controls restartOnSound
          takes={[{ key: 'result', url: f.out.url, poster: f.out.poster, label: 'Talking video', sec: f.out.sec, sound: f.out.sound === true }]}
          take="result" onTake={() => 0} />
        <figcaption className="xpa-top"><span className="xv-tag xv-tag-on">Talking video</span>
          <RunChip onMedia c={chipOfChain({ jobId: f.jobId ?? '', model: f.model, place: featuredPlace(f), costUsd: f.costUsd ?? 0 }, f.from ?? [], { note: `${f.out.sec} s` })} testId="xp-presenter-model" /></figcaption>
      </figure>
    </div>
    <div className="xpa-ctas xps-ctas">
      <Link to={`${videoWorkflowHref('lip-sync')}&model=${encodeURIComponent(f.modelKey)}`} className="xv-btn" data-testid="xp-presenter-cta">Make it talk<span className="xv-arrow" aria-hidden>→</span></Link>
      <Link to={rec} className="xv-quiet" data-testid="xp-presenter-recreate">or recreate this one</Link>
    </div>
  </section>;
}
