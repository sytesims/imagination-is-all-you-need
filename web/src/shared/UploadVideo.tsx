import { VIDEO_PAGE, VIDEO_TOOL } from '../../../server/src/shared/videoWorkflows';
import { useDraftFile } from './draftFiles';
import LibraryButton from '../ui/b1/LibraryButton';
import FilledMedia from '../ui/b1/FilledMedia';
import { useState } from 'react';
import Dropzone from './Dropzone';
import { LIMITS, VIDEO_TYPES } from './limits';
import { useToast } from './Toast';

export interface VideoMeta { file: File; url: string; duration: number; w: number; h: number; audio: boolean | null; trimmed: boolean }
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/* Detached <video> elements can be garbage-collected before loadedmetadata fires (the "first upload adds nothing" bug), so keep a
   reference until it settles, time out after 8 s and retry once with a fresh element. */
const pending = new Set<HTMLVideoElement>();
function readOnce(file: File, url: string): Promise<Omit<VideoMeta, 'trimmed'>> {
  return new Promise((res, rej) => {
    const v = document.createElement('video'); pending.add(v); let settled = false;
    const end = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(to); pending.delete(v); fn(); };
    const to = setTimeout(() => end(() => rej(new Error('timeout'))), 8000);
    v.preload = 'metadata'; v.muted = true; v.playsInline = true;
    v.onloadedmetadata = () => {
      const a = v as any; let done = false;
      const probe = () => { if (done) return; done = true; end(() => res({ file, url, duration: v.duration, w: v.videoWidth, h: v.videoHeight,
        audio: a.mozHasAudio ?? (a.webkitAudioDecodedByteCount !== undefined ? a.webkitAudioDecodedByteCount > 0 : (a.audioTracks ? a.audioTracks.length > 0 : null)) })); };
      v.onseeked = probe; v.currentTime = Math.min(1, v.duration / 2); setTimeout(probe, 1500);
    };
    v.onerror = () => end(() => rej(new Error('Unsupported format.')));
    v.src = url; v.load();
  });
}
export async function readVideo(file: File): Promise<Omit<VideoMeta, 'trimmed'>> {
  const url = URL.createObjectURL(file);
  try { return await readOnce(file, url); } catch (e) { if ((e as Error).message !== 'timeout') throw e; return readOnce(file, url); }
}

/** Shared S1 upload screen: validates format, 4–30 s (longer is trimmed), ≥0.4 MP. */
export default function UploadVideo({ title = 'Video', hint, video, onChange, disabled, draftKey, dropLabel, exactHint }: { title?: string; hint?: string; /** B32: show the hint as is (HF's exact line); the size limit is still checked on upload */ exactHint?: boolean; /** B30: the drop box's own label (HF short labels per tool) */ dropLabel?: string; video: VideoMeta | null; onChange: (v: VideoMeta | null) => void; disabled?: boolean; /** tool id: keep the upload across a refresh */ draftKey?: string }) {
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const toast = useToast();
  const fail = (m: string) => { setErr(m); };
  const onFile = async ([f]: File[]) => {
    setErr('');
    if (!VIDEO_TYPES.includes(f.type) && !(f.type === '' && /\.(mp4|mov|webm)$/i.test(f.name))) return fail('Unsupported format. Use MP4, MOV or WEBM.');
    if (f.size > LIMITS.maxBytes) return fail('Max 200 MB.');
    setBusy(true);
    try {
      const m = await readVideo(f);
      if (m.duration < LIMITS.minSec) return fail(`Clips need at least ${LIMITS.minSec} seconds.`);
      if (m.w * m.h < LIMITS.minPixels) return fail(`Video is too small (needs about 854×480 or larger). Yours is ${m.w}×${m.h}.`);
      const trimmed = m.duration > LIMITS.maxSec;
            onChange({ ...m, trimmed });
    } catch (e) { fail((e as Error).message === 'timeout' ? 'Couldn’t read that clip. Try again or use another file.' : 'Unsupported format.'); } finally { setBusy(false); }
  };
  useDraftFile(draftKey ?? (location.pathname.startsWith('/tools/') ? location.pathname.slice(7) : location.pathname === VIDEO_PAGE ? VIDEO_TOOL /* the same draft key as before the move to /video */ : undefined), `video:${title}`, video?.file ?? null, f => { void onFile([f]); });
  return (
    <section className="card">
      <h2>{title}</h2>
      {!video ? <>
        <Dropzone accept="video/mp4,video/quicktime,video/webm" label={dropLabel ?? 'Upload a video'} busy={busy ? 'Checking the clip…' : false} error={err || null}
          helper={exactHint && hint ? hint : `${hint ?? `MP4, MOV, WEBM · ${LIMITS.minSec}–${LIMITS.maxSec} s · up to 200 MB`} · min 854×480`} onFiles={onFile}
          actions={<LibraryButton icon kind="video" onFiles={fs => onFile(fs)} />} />
      </> : <>
        <FilledMedia items={[{ id: video.url, url: video.url, kind: 'video', label: '@Video 1' }]} max={1} onRemove={() => !disabled && onChange(null)} onReplace={disabled ? undefined : () => onChange(null)} onAdd={() => undefined} />
        <div className="row mt-8 fm-meta">
          <span className="chip">{fmt(Math.min(video.duration, LIMITS.maxSec))}</span>{video.trimmed && <span className="chip info-chip">We'll use the first {LIMITS.maxSec} s (sound included).</span>}
          <span className="chip">{video.w}×{video.h}</span>
          <span className={`chip ${video.audio === false ? '' : 'ok'}`} title={video.audio === false ? 'This clip has no sound' : 'Audio detected: it is kept in the result'}>{video.audio === false ? 'No audio track' : 'Audio kept'}</span>
        </div>
      </>}
    </section>
  );
}
