import { useEffect, useRef } from 'react';
import type { VideoMeta } from './UploadVideo';
/** Optional click-on-frame target (→ SAM2 point on the server). Falls back to the text field / prompt when unset. */
/** open: the frame shows at once (Person swap's Who to swap box: a click is the main way, words and a side below it).
 *  The frame and the scrubber cover the part of the clip the run uses (video.start → video.duration, the Trim sheet's range), and the frame is on
 *  screen from the first paint: the clip is loaded and seeked to the start as soon as it can show a frame (it opened all black until the slider moved). */
export default function PointPicker({ video, point, setPoint, open }: { video: VideoMeta | null; point: { x: number; y: number; t: number } | null; setPoint: (p: { x: number; y: number; t: number } | null) => void; open?: boolean }) {
  const v = useRef<HTMLVideoElement>(null); const s = useRef<HTMLInputElement>(null);
  const t0 = Math.max(0, video?.start ?? 0); const t1 = Math.max(t0 + 0.1, Math.min(video?.duration ?? 0, t0 + 30));
  /* a new range start: show its frame (and move the scrubber there) */
  useEffect(() => { const el = v.current; if (s.current) s.current.value = String(t0); if (el && el.readyState >= 1) el.currentTime = t0; }, [t0, video?.url]);
  if (!video) return null;
  return (
    <details className="mt-12" open={open || undefined}><summary>{open ? `Click the person on the frame${point ? ' · picked' : ''}` : `Or click on the frame to pick who/what${point ? ' · point set' : ''}`}</summary>
      <div className="point-picker" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setPoint({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, t: v.current?.currentTime ?? t0 }); }}>
        <video ref={v} key={video.url} src={`${video.url}#t=${t0}`} muted playsInline preload="auto" data-testid="point-picker-video" onLoadedMetadata={e => { e.currentTarget.currentTime = Number(s.current?.value ?? t0) || t0; }} />
        {point && <span className="point-dot" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} />}
      </div>
      <div className="row mt-8">
        <input ref={s} type="range" min={t0} max={t1} step={0.1} defaultValue={t0} onChange={e => { if (v.current) v.current.currentTime = Number(e.target.value); }} aria-label="Scrub frame" style={{ flex: 1 }} />
        {point && <button className="btn btn-sm" onClick={() => setPoint(null)}>Clear point</button>}
      </div>
    </details>
  );
}
