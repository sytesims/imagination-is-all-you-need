import { useRef } from 'react';
import type { VideoMeta } from './UploadVideo';
/** Optional click-on-frame target (→ SAM2 point on the server). Falls back to the text field / prompt when unset. */
export default function PointPicker({ video, point, setPoint }: { video: VideoMeta | null; point: { x: number; y: number; t: number } | null; setPoint: (p: { x: number; y: number; t: number } | null) => void }) {
  const v = useRef<HTMLVideoElement>(null);
  if (!video) return null;
  return (
    <details className="mt-12"><summary>Or click on the frame to pick who/what {point ? '· point set' : '(optional)'}</summary>
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
