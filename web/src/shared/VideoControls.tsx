/**
 * VideoControls (2026-10-31, shared): the app's own video transport, drawn over the bottom of a player on a soft dark fade.
 * A round orange Play / Pause, a thin progress line (a real range input that fills orange and shows a knob on hover / focus), small
 * tabular time, and quiet round buttons for Replay, Sound and Full screen. `compact`: the Play button and the progress line only.
 * It follows the <video> it is given (its own play / pause / time events), so any player can use it in place of the browser's `controls`.
 * `sound`: leave it out for a plain mute button on this video; pass a node (ShowcaseFilm's directed SoundToggle) or `false` for none.
 * `onToggle` / `onReplay`: a player with its own play rules (ShowcaseFilm's poster-first and sound director) handles the press itself.
 * Styles: shared/editorial.css (.sfilm-controls …), so pages that already tune the Explore transport keep working.
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { FitIcon, PauseIcon, PlayIcon, ResetIcon } from '../ui/Icons';
import { SoundToggle } from './SoundToggle';
import './editorial.css';

const tc = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function VideoControls({ video, compact = false, onToggle, onReplay, sound, fallbackSec = 0, fullscreen, testId, label = 'Film playback', seekLabel = 'Seek film' }: {
  /** the <video> to drive (null while a poster shows) */ video: HTMLVideoElement | null;
  /** Play and the progress line only, for small spots */ compact?: boolean;
  /** the player's own Play / Pause */ onToggle?: () => void; /** the player's own Replay */ onReplay?: () => void;
  /** leave out: a mute button for this video; a node: that sound button; false / null: none */ sound?: ReactNode;
  /** length to show before the clip's metadata is in */ fallbackSec?: number;
  /** what goes full screen (default: the video's parent) */ fullscreen?: RefObject<HTMLElement | null>;
  testId?: string; /** the group's name for screen readers */ label?: string; seekLabel?: string;
}) {
  const seekBar = useRef<HTMLInputElement>(null);
  const [paused, setPaused] = useState(true); const [time, setTime] = useState(0); const [duration, setDuration] = useState(0); const [muted, setMuted] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  /* follow the video: its own events, and the progress line every frame without a re-render */
  useEffect(() => {
    const el = video; if (!el) { setPaused(true); setTime(0); setDuration(0); return; }
    const fill = () => { if (el.duration) seekBar.current?.style.setProperty('--p', `${(Math.min(1, el.currentTime / el.duration) * 100).toFixed(2)}%`); };
    const sync = () => { setPaused(el.paused); setTime(el.currentTime); setDuration(Number.isFinite(el.duration) ? el.duration : 0); setMuted(el.muted); fill(); };
    const onPlaying = () => setPaused(false); const onPause = () => setPaused(true);
    const onTime = () => { setTime(el.currentTime); fill(); }; const onMeta = () => { setDuration(Number.isFinite(el.duration) ? el.duration : 0); fill(); };
    const onVol = () => setMuted(el.muted);
    sync();
    el.addEventListener('playing', onPlaying); el.addEventListener('pause', onPause); el.addEventListener('ended', onPause);
    el.addEventListener('timeupdate', onTime); el.addEventListener('seeked', onTime); el.addEventListener('loadedmetadata', onMeta); el.addEventListener('durationchange', onMeta);
    el.addEventListener('volumechange', onVol);
    let raf = 0; const step = () => { fill(); raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf);
      el.removeEventListener('playing', onPlaying); el.removeEventListener('pause', onPause); el.removeEventListener('ended', onPause);
      el.removeEventListener('timeupdate', onTime); el.removeEventListener('seeked', onTime); el.removeEventListener('loadedmetadata', onMeta); el.removeEventListener('durationchange', onMeta);
      el.removeEventListener('volumechange', onVol); };
  }, [video]);
  const toggle = onToggle ?? (() => { const el = video; if (!el) return; if (el.paused || el.ended) { if (el.ended) el.currentTime = 0; void el.play().catch(() => undefined); } else el.pause(); });
  const replay = onReplay ?? (() => { const el = video; if (!el) return; el.currentTime = 0; void el.play().catch(() => undefined); });
  const full = async () => {
    setFullscreenError(''); const r = (fullscreen?.current ?? video?.parentElement ?? null) as (HTMLElement & { webkitRequestFullscreen?: () => void }) | null;
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (r?.requestFullscreen) await r.requestFullscreen(); else if (r?.webkitRequestFullscreen) r.webkitRequestFullscreen(); else setFullscreenError('Full screen is not available in this browser.'); }
    catch { setFullscreenError('Full screen is not available right now.'); }
  };
  const total = duration || fallbackSec || 0;
  const id = (s: string) => testId ? `${testId}-${s}` : undefined;
  const seek = <input ref={seekBar} className="sfilm-seek" type="range" min="0" max={total || 1} step="0.1" value={Math.min(time, total)} disabled={!duration}
    aria-label={seekLabel} aria-valuetext={`${tc(time)} of ${tc(total)}`} data-testid={id('seek')}
    onChange={e => { const el = video; if (el) { el.currentTime = Number(e.target.value); setTime(el.currentTime); if (el.duration) e.target.style.setProperty('--p', `${(el.currentTime / el.duration) * 100}%`); } }} />;
  const play = <button type="button" className="sfilm-btn sfilm-btn-play" onClick={toggle} aria-label={paused ? 'Play' : 'Pause'} title={paused ? 'Play' : 'Pause'} data-testid={id('play')}>{paused ? <PlayIcon size={compact ? 16 : 20} /> : <PauseIcon size={compact ? 15 : 18} />}</button>;
  if (compact) return <div className="sfilm-controls is-compact" role="group" aria-label={label} data-testid={id('controls')}><div className="sfilm-transport">{play}{seek}</div></div>;
  return <div className="sfilm-controls" role="group" aria-label={label} data-testid={id('controls')}>
    {seek}
    <div className="sfilm-transport">{play}
      <button type="button" className="sfilm-btn" onClick={replay} aria-label="Replay" title="Replay" data-testid={id('replay')}><ResetIcon size={18} strokeWidth={1.8} /></button>
      <span className="sfilm-time">{tc(time)} <span>/ {tc(total)}</span></span>
      <span className="sfilm-control-space" />
      {sound === undefined ? <SoundToggle on={!muted} onToggle={() => { if (video) video.muted = !video.muted; }} testId={id('sound')} /> : sound}
      <button type="button" className="sfilm-btn" onClick={() => void full()} aria-label="Full screen" title="Full screen" data-testid={id('fullscreen')}><FitIcon size={18} strokeWidth={1.8} /></button>
    </div>{fullscreenError && <span className="sfilm-control-error" role="status">{fullscreenError}</span>}
  </div>;
}
