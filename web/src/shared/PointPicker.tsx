import { useRef } from 'react';
import type { VideoMeta } from './UploadVideo';
/** Optional click-on-frame target (→ SAM2 point on the server). Falls back to the text field / prompt when unset. */
/** open: the frame shows at once (Person swap's Who to swap box: a click is the main way, words and a side below it). */
export default function PointPicker({ video, point, setPoint, open }: { video: VideoMeta | null; point: { x: number; y: number; t: number } | null; setPoint: (p: { x: number; y: number; t: number } | null) => void; open?: boolean }) {
  const v = useRef<HTMLVideoElement>(null);
  if (!video) return null;
  return (
    <details className="mt-12" open={open || undefined}><summary>{open ? `Click the person on the frame${point ? ' · picked' : ''}` : `Or click on the frame to pick who/what${point ? ' · point set' : ''}`}</summary>
      <div className="point-picker" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setPoint({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, t: v.current?.currentTime ?? 0 }); }}>
        <video ref={v} src={video.url} muted playsInline preload="metadata" />
        {point && <span className="point-dot" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} />}
      </div>
      <div className="row mt-8">
        <input type="range" min={0} max={Math.min(video.duration, 30)} step={0.1} defaultValue={0} onChange={e => { if (v.current) v.current.currentTime = Number(e.target.value); }} aria-label="Scrub frame" style={{ flex: 1 }} />
        {point && <button className="btn btn-sm" onClick={() => setPoint(null)}>Clear point</button>}
      </div>
    </details>
  );
}
