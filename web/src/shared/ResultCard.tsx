/**
 * A result card: one finished image, video, audio or 3D result with its caption (model · price · time, shared FeedCaption /
 * jobCaption words) and a small hover toolbar (Open, Download; the Canvas adds more later). Plain React, no canvas library, so the
 * Canvas board draws it inside its shapes and any page can reuse it.
 *  - image: the picture (grid thumbnail sized to the card)
 *  - video: the still, plays inline with a small play / pause control and a progress line (one player at a time)
 *  - audio: the shared AudioCard (waveform + play)
 *  - 3d: the saved still (shared 3D poster); "View 3D" (or a double-click on the board) opens the shared 3D viewer
 * Interactive parts carry data-card-control so a host (the board) can keep their pointer events from moving the card.
 */
import { useRef, useState } from 'react';
import { FeedCaption } from './FeedCaption';
import { AudioCard } from './AudioCard';
import { gridSrc } from './thumbs';
import { useExclusivePlayback } from './audioPlayer';
import type { ResultKind } from './resultMedia';
import './resultCard.css';

export interface ResultCardProps {
  kind: ResultKind; url: string; poster?: string; title: string;
  model: string; /** where it ran (kept for later views; the caption shows model · price · time) */ place?: string; price?: string; time?: string;
  /** card width in CSS px at 100% zoom (picks the thumbnail size) */ width: number;
  /** show the toolbar (hovered or selected on the board) */ active?: boolean;
  onOpen?: () => void; onView3d?: () => void; downloadName?: string; testId?: string;
}

const Play = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>;
const Pause = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>;
const Ic = ({ d }: { d: string }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
const OPEN = 'M14 4h6v6M20 4l-8.5 8.5M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4';
const DOWNLOAD = 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14';
const CUBE = 'M12 3 20 7.5v9L12 21l-8-4.5v-9zM4 7.5 12 12l8-4.5M12 12v9';

function VideoBody({ url, poster, width, title }: { url: string; poster?: string; width: number; title: string }) {
  const v = useRef<HTMLVideoElement>(null); const [playing, setPlaying] = useState(false); const [pct, setPct] = useState(0); const [started, setStarted] = useState(false);
  useExclusivePlayback(v);
  const toggle = () => { const el = v.current; if (!el) return; setStarted(true); if (el.paused) el.play().catch(() => setPlaying(false)); else el.pause(); };
  return <>
    <video ref={v} className="rc-media" src={url} poster={poster ? gridSrc(poster, width) : undefined} playsInline loop preload="none" aria-label={title}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={e => { const el = e.currentTarget; setPct(el.duration ? el.currentTime / el.duration : 0); }} />
    <button type="button" className={`rc-play${playing ? ' on' : ''}`} data-card-control data-testid="rc-play" aria-label={playing ? 'Pause video' : 'Play video'} onClick={toggle}>{playing ? <Pause /> : <Play />}</button>
    {started && <span className="rc-progress" aria-hidden><i style={{ width: `${Math.round(pct * 1000) / 10}%` }} /></span>}
  </>;
}

export function ResultCard({ kind, url, poster, title, model, price, time, width, active, onOpen, onView3d, downloadName, testId = 'result-card' }: ResultCardProps) {
  const parts = [price, time];
  const tools = <div className={`rc-tools${active ? ' on' : ''}`} data-testid="rc-tools">
    {kind === '3d' && onView3d && <button type="button" data-card-control className="rc-tool" onClick={onView3d} title="View in 3D"><Ic d={CUBE} /><span>View 3D</span></button>}
    {onOpen && <button type="button" data-card-control className="rc-tool" onClick={onOpen} title="Open the result"><Ic d={OPEN} /><span>Open</span></button>}
    <a data-card-control className="rc-tool" href={url} download={downloadName ?? ''} title="Download"><Ic d={DOWNLOAD} /><span className="sr-only">Download</span></a>
  </div>;
  if (kind === 'audio') return <div className="rc rc-audio" data-kind={kind} data-testid={testId}>
    <div className="rc-audio-in" data-card-control-area><AudioCard src={url} title={title} model={model} price={[price, time].filter(Boolean).join(' · ')} bars={40} testId={`${testId}-audio`} cover={false} /></div>{tools}</div>;
  return <div className="rc" data-kind={kind} data-testid={testId}>
    {kind === 'image' && <img className="rc-media" src={gridSrc(url, width)} alt={title} draggable={false} decoding="async" />}
    {kind === 'video' && <VideoBody url={url} poster={poster} width={width} title={title} />}
    {kind === '3d' && (poster ? <img className="rc-media" src={gridSrc(poster, width)} alt={title} draggable={false} decoding="async" /> : <span className="rc-3d-empty" aria-label="3D model"><Ic d={CUBE} /></span>)}
    {kind === '3d' && <span className="rc-chip">3D</span>}
    <FeedCaption title={model || title} parts={parts} testId={`${testId}-cap`} className="rc-cap" />
    {tools}
  </div>;
}
