/**
 * One result card in a feed grid (2026-10-24, shared by Create Image and Generate Video): the same tile, hit area, failure state and fix,
 * feature chip, select tick, caption and "open details" link, in the justified rows of imageCanvas.css (.ic-jfeed .ic-tile).
 * The page passes what differs: the media (an image, or FeedVideo for a clip), the running tile (shared/GenTile), and any extras
 * (Image's layer count, angle captions, Download all). Clicking a finished or failed card opens the shared result viewer (ResultView variant="viewer").
 */
import { memo, useRef, useState, type ReactNode } from 'react';
import type { JobState } from '../../../api';
import FailureState, { FailActions } from '../../../shared/FailureState';
import { Link } from '../../../platform/router';
import { recreateHref } from '../../../shared/workflowLinks';
import { tip } from '../../../shared/Tooltip';
import { MentionText } from '../../../shared/MentionChips';
import { gridSrc } from '../../../shared/thumbs';
import { durText } from '../../../shared/ResultViewer';
import { clampAr } from './feedMedia';
import { feedPropsEqual } from './feedMemo';
import { plainPrompt, typedPromptOf } from '../../../../../server/src/shared/typedPrompt';
export { clampAr, tileMaxH, videoOutOf, askedAr } from './feedMedia';


export interface FeedCardProps {
  job: JobState; /** which output of the job (a batch shows one card per output) */ k?: number; of?: number;
  /** width / height of the media (sets the card's shape in the justified row) */ ar: number;
  /** running / queued / a lingering canceled run: the card shows `run` */ active: boolean; run?: ReactNode;
  /** the finished media; null → the failure state */ media: ReactNode | null;
  on?: boolean; selecting?: boolean; picked?: boolean; /** why it can't be picked in Select mode */ noPick?: string | null;
  className?: string; testId: string; /** test id prefix for the chip and failure state ('ic' on Image, 'vf' on Video) */ idPre?: string;
  /** the small feature / workflow chip (top left) */ tag?: string | null;
  /** extras drawn before the chip (Image: layer count) and after it (angle captions, Download all, a duration badge) */ badges?: ReactNode; children?: ReactNode;
  /** a caption over the finished card's foot (none while it runs: the running tile has its own); default: the prompt on hover */ caption?: ReactNode;
  onOpen: (e: React.MouseEvent<HTMLButtonElement>) => void; onTogglePick?: () => void;
  /** a finished card whose body has its own controls (Audio: shared/AudioCard with play and seek), drawn instead of the one hit button; it opens
   *  the viewer itself. In Select mode a hit layer over it picks the card. */
  body?: ReactNode;
}

function FeedCard({ job: j, k = 0, of = 1, ar, active, run, media, on, selecting, picked, noPick, className = '', testId, idPre = 'ic', tag, badges, children, caption, onOpen, onTogglePick, body }: FeedCardProps) {
  const inp: any = (j as any).input ?? {}; const prompt: string = typedPromptOf(inp); const said = plainPrompt(prompt) /* aria labels: plain words, no @image2 */; const ex: { model?: string; flow?: string; recreateHref?: string | null } | null = (j as any).example ?? null; /* one of the app's examples (the Examples project) */ /* a workflow job: your words, never its composed recipe (2026-10-25) */
  return <div className={`ic-tile st-${j.status}${body ? ' has-body' : ''}${on ? ' on' : ''}${picked ? ' picked' : ''}${selecting ? ' selecting' : ''}${className ? ` ${className}` : ''}${!active && j.status !== 'done' ? ' fs-host' : ''}`}
    style={{ ['--ar' as any]: String(clampAr(ar)) }} data-testid={testId} data-batch={of > 1 ? `${k + 1}/${of}` : undefined}>
    {!active && body && j.status === 'done' ? <>{body}{selecting && <button type="button" className="ic-tile-hit fd-pick-hit" aria-label={`Select ${said || j.id}`} aria-pressed={!!picked} onClick={() => { if (!noPick) onTogglePick?.(); }} />}</>
      : active ? run : <button type="button" className="ic-tile-hit" aria-label={j.status === 'done' ? `Open result: ${said || j.id}` : `Failed: ${said || j.id}. Show details`} aria-pressed={selecting ? !!picked : undefined}
      onClick={e => { if (selecting) { if (!noPick) onTogglePick?.(); return; } onOpen(e); }}>
      {j.status === 'done' && media ? media : <FailureState job={j} variant="tile" testId={`${idPre}-fail-${j.id}`} /* the bean, a friendly title and what happened to the money; the full reason is in the viewer */ />}</button>}
    {k === 0 && !active && j.status !== 'done' && <span className="fs-tile-act"><FailActions job={j} max={1} compact skip={['details']} prefer="runLocal" /></span> /* the one fix; Run locally first when the server lists it (never automatic) */}
    {badges}
    {k === 0 && !active && (ex ? <span className="ic-tile-feat fd-ex-tag" data-testid={`${idPre}-example-${j.id}`} {...tip(`An example made by the app’s authors with ${ex.model ?? 'a local model'}. It cost you nothing.`)}>Example{ex.flow ? <i> · {ex.flow}</i> : null}</span>
      : tag ? <span className="ic-tile-feat" data-testid={`${idPre}-feat-${j.id}`}>{tag}</span> : null)}
    {k === 0 && !active && !ex && (j as any).featured && <span className="fd-star" data-testid={`${idPre}-featured-${j.id}`} {...tip('Featured')}><svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" /></svg></span>}
    {k === 0 && !active && ex && j.status === 'done' && <Link to={ex.recreateHref ?? recreateHref(j)!} className="fd-recreate" data-testid={`${idPre}-recreate-${j.id}`} {...tip('The same prompt and settings in the bar. Nothing runs until you press Generate')}><span aria-hidden>↻</span>Recreate</Link>}
    {children}
    {selecting && k === 0 && onTogglePick && <label className={`fd-check${noPick ? ' off' : ''}`} data-testid={`fd-check-${j.id || 'new'}`} {...tip(noPick ?? (picked ? 'Unselect' : 'Select'))} onClick={e => e.stopPropagation()}><input type="checkbox" checked={!!picked} disabled={!!noPick} aria-label={noPick ? `Can’t select: ${noPick}` : `Select ${said || j.id}`} onChange={() => onTogglePick()} /><i aria-hidden /></label>}
    {!active && (caption !== undefined ? caption : prompt && <span className="ic-tile-meta"><span><MentionText text={prompt} /></span></span>) /* a running card's foot is the running tile's own (GenTile): never two captions on top of each other */}
    {!active && <Link to={`/jobs/${j.id}`} className="ic-tile-open" {...tip('Open details')}>↗<span className="sr-only">Open details</span></Link>}
  </div>;
}
/** Memoised (feedMemo.ts): a poll tick or a keystroke on the page renders only the cards whose job or shown values changed. */
export default memo(FeedCard, feedPropsEqual);


/** A clip on a card: the first frame (a grid-sized thumbnail), playing muted on hover (not with reduced motion), with its length. */
export function FeedVideo({ src, poster, sec, width, testId }: { src: string; poster: string; sec?: number; /** the card's CSS width, for the thumbnail size */ width: number; testId?: string }) {
  const v = useRef<HTMLVideoElement>(null); const over = useRef(false); const [live, setLive] = useState(false); const [playing, setPlaying] = useState(false);
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const play = () => { over.current = true; if (still) return; if (v.current) v.current.play().catch(() => 0); else setLive(true); /* first hover: the clip mounts and autoplays */ };
  const stop = () => { over.current = false; const el = v.current; if (el) { el.pause(); try { el.currentTime = 0; } catch { /* not seekable yet */ } } setPlaying(false); };
  return <span className={`fv-media${playing ? ' is-playing' : ''}`} onMouseEnter={play} onMouseLeave={stop} data-testid={testId}>
    <img src={gridSrc(poster, width)} alt="" loading="lazy" decoding="async" />
    {live && <video ref={v} src={src} muted autoPlay loop playsInline preload="auto" aria-hidden tabIndex={-1} onPlaying={e => { if (over.current) setPlaying(true); else e.currentTarget.pause(); /* left before it loaded */ }} onPause={() => setPlaying(false)} />}
    {(sec ?? 0) > 0 && <span className="fv-dur" aria-label={`${durText(sec!)} long`}>{durText(sec!)}</span>}
  </span>;
}
