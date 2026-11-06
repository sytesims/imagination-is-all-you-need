import { useEffect, useRef, useState } from 'react';
import type { VideoMeta } from './UploadVideo';
import { contentRect } from './frameFit';
/** Optional click-on-frame target (→ SAM2 point on the server). Falls back to the text field / prompt when unset. */
/** open: the frame shows at once (Person swap's Who to swap box: a click is the main way, words and a side below it).
 *  The frame and the scrubber cover the part of the clip the run uses (video.start → video.duration, the Trim sheet's range), and the frame is on
 *  screen from the first paint: the clip is loaded and seeked to the start as soon as it can show a frame (it opened all black until the slider moved). */
export default function PointPicker({ video, point, setPoint, open }: { video: VideoMeta | null; point: { x: number; y: number; t: number } | null; setPoint: (p: { x: number; y: number; t: number } | null) => void; open?: boolean }) {
  const v = useRef<HTMLVideoElement | null>(null); const s = useRef<HTMLInputElement>(null);
  /* the picture's own size (the clip's, then the loaded video's): the dot sits on a layer of the picture's shape, centred in the box like object-fit: contain */
  const [dims, setDims] = useState<{ url: string; w: number; h: number } | null>(null);
  const pw = (dims?.url === video?.url ? dims?.w : 0) || video?.w || 0, ph = (dims?.url === video?.url ? dims?.h : 0) || video?.h || 0;
  const t0 = Math.max(0, video?.start ?? 0); const t1 = Math.max(t0 + 0.1, Math.min(video?.duration ?? 0, t0 + 30));
  /* a new range start: show its frame (and move the scrubber there) */
  useEffect(() => { const el = v.current; if (s.current) s.current.value = String(t0); if (el && el.readyState >= 1) el.currentTime = t0; }, [t0, video?.url]);
  if (!video) return null;
  return (
    <details className="mt-12" open={open || undefined}><summary>{open ? `Click the person on the frame${point ? ' · picked' : ''}` : `Or click on the frame to pick who/what${point ? ' · point set' : ''}`}</summary>
      <div className="point-picker" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); const el = v.current; const fit = contentRect(r.width, r.height, el?.videoWidth || pw, el?.videoHeight || ph);
        const x = ((e.clientX - r.left) / r.width - fit.l) / fit.w, y = ((e.clientY - r.top) / r.height - fit.t) / fit.h;
        if (x < -0.01 || x > 1.01 || y < -0.01 || y > 1.01) return; /* a click on the black bars around the picture isn't on anyone */
        setPoint({ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)), t: v.current?.currentTime ?? t0 }); }}>
        <video ref={v} key={video.url} src={`${video.url}#t=${t0}`} muted playsInline preload="auto" data-testid="point-picker-video" onLoadedMetadata={e => { const el = e.currentTarget; el.currentTime = Number(s.current?.value ?? t0) || t0; if (el.videoWidth && el.videoHeight) setDims({ url: video.url, w: el.videoWidth, h: el.videoHeight }); }} />
        {point && <span className="point-pic" style={pw && ph ? { aspectRatio: `${pw} / ${ph}` } : { width: '100%' }}><span className="point-dot" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} /></span>}
      </div>
      <div className="row mt-8">
        <input ref={s} type="range" min={t0} max={t1} step={0.1} defaultValue={t0} onChange={e => { if (v.current) v.current.currentTime = Number(e.target.value); }} aria-label="Scrub frame" style={{ flex: 1 }} />
        {point && <button className="btn btn-sm" onClick={() => setPoint(null)}>Clear point</button>}
      </div>
    </details>
  );
}
