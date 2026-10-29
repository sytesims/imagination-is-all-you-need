/* B22 T31 Change Voice: two honest voice cards and a browser recorder for the source clip.
 *  The engine has one built-in voice (server note), so there is exactly one stock card and no sample until the server sends one. */
import { registerMedia } from '../../shared/mediaPause';
import { useEffect, useMemo, useRef, useState } from 'react';
import { readVideo, type VideoMeta } from '../../shared/UploadVideo';

export function VoiceCards({ value, onChange, samples, setSamples, max = 3, disabled, sampleUrl, sampleStandIn, sampleKind }: {
  value: string; onChange: (v: string) => void; samples: File[]; setSamples: (fs: File[]) => void; max?: number; disabled?: boolean; sampleUrl?: string | null; sampleStandIn?: boolean; sampleKind?: SampleKind;
}) {
  const inp = useRef<HTMLInputElement>(null); const own = value === 'clone';
  const urls = useRef(new Map<File, string>()); const urlOf = (f: File) => { let u = urls.current.get(f); if (!u) { u = URL.createObjectURL(f); urls.current.set(f, u); } return u; };
  return <section className="card cv-voices" data-testid="voice-cards">
    <h2>Pick a voice</h2>
    <div className="cv-grid" role="radiogroup" aria-label="Voice">
      <div className="cv-cell">
        <button type="button" role="radio" aria-checked={!own} className={`cv-card ${!own ? 'on' : ''}`} data-testid="voice-card-builtin" disabled={disabled} onClick={() => onChange('builtin')}>
          <span className="cv-ico" aria-hidden>◉</span><b>Built-in voice</b><span className="helper">The engine’s one stock voice. Nothing to upload.</span>
        </button>
        {/* a real recording from the server only (sampleUrl); with needsSample there is nothing to play, so no button */}
        {sampleUrl && <SamplePlay url={sampleUrl} standIn={!!sampleStandIn} kind={sampleKind ?? (sampleStandIn ? 'standin' : null)} />}
      </div>
      <button type="button" role="radio" aria-checked={own} className={`cv-card ${own ? 'on' : ''}`} data-testid="voice-card-own" disabled={disabled} onClick={() => onChange('clone')}>
        <span className="cv-ico" aria-hidden>＋</span><b>Your own voice</b><span className="helper">Upload 1–{max} samples of the voice you want.</span>
      </button>
    </div>
    {own && <div className="cv-samples" data-testid="voice-samples">
      <p className="helper">10–30 s of clear speech each · WAV, MP3 or M4A · {samples.length}/{max}</p>
      {samples.map((f, i) => <div key={i} className="cv-sample"><audio src={urlOf(f)} controls preload="metadata" /><span className="cv-name" title={f.name}>{f.name}</span><button type="button" className="btn btn-sm" disabled={disabled} onClick={() => setSamples(samples.filter((_, j) => j !== i))}>Remove</button></div>)}
      {samples.length < max && <button type="button" className="btn cv-add" data-testid="voice-sample-add" disabled={disabled} onClick={() => inp.current?.click()}>Add a voice sample</button>}
      <input ref={inp} type="file" accept="audio/*" multiple hidden data-picker-title="Choose voice samples" data-testid="voice-sample-input" onChange={e => { const fs = [...(e.target.files ?? [])]; if (fs.length) setSamples([...samples, ...fs].slice(0, max)); e.target.value = ''; }} />
    </div>}
  </section>;
}

type RecState = 'idle' | 'asking' | 'rec' | 'denied' | 'unsupported' | 'error';
const BARS = 48;
/** Record the source clip in the browser (camera + microphone: the app changes the voice in a video). Fixed-height strip, so nothing moves. */
export function RecordClip({ onDone, onAudio, disabled, maxSec = 30 }: { onDone?: (v: VideoMeta) => void; /** B27: microphone only; the take comes back as an audio file */ onAudio?: (f: File, sec: number) => void; disabled?: boolean; maxSec?: number }) {
  const audioOnly = !!onAudio;
  const [st, setSt] = useState<RecState>('idle'); const [sec, setSec] = useState(0); const [lv, setLv] = useState<number[]>(() => Array(BARS).fill(0)); const [msg, setMsg] = useState('');
  const vid = useRef<HTMLVideoElement>(null); const stop = useRef<() => void>(() => 0);
  useEffect(() => () => stop.current(), []);
  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setSt('unsupported'); return; }
    setSt('asking'); setMsg('');
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia(audioOnly ? { audio: true } : { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } }); }
    catch (e: any) { const n = String(e?.name ?? ''); setSt(/NotAllowed|Security|PermissionDenied/.test(n) || /denied|dismiss/i.test(String(e?.message ?? '')) ? 'denied' : n === 'NotSupportedError' ? 'unsupported' : 'error'); setMsg(n === 'NotFoundError' ? 'No camera or microphone was found. Upload a clip instead.' : n === 'NotReadableError' ? 'The camera or microphone is busy in another app. Upload a clip instead.' : ''); return; }
    if (vid.current) { vid.current.srcObject = stream; vid.current.play().catch(() => 0); }
    const mime = (audioOnly ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'] : ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']).find(m => MediaRecorder.isTypeSupported(m)) ?? '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); const chunks: Blob[] = [];
    const ac = new AudioContext(); const an = ac.createAnalyser(); an.fftSize = 256; ac.createMediaStreamSource(stream).connect(an); const buf = new Uint8Array(an.frequencyBinCount);
    const t0 = performance.now(); let raf = 0; let last = 0;
    const tick = (t: number) => { raf = requestAnimationFrame(tick); if (t - last < 100) return; last = t; an.getByteTimeDomainData(buf); let pk = 0; for (const x of buf) pk = Math.max(pk, Math.abs(x - 128)); setLv(l => [...l.slice(1), Math.min(1, pk / 64)]); const s = (performance.now() - t0) / 1000; setSec(s); if (s >= maxSec) stop.current(); };
    raf = requestAnimationFrame(tick);
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => { cancelAnimationFrame(raf); stream.getTracks().forEach(t => t.stop()); ac.close().catch(() => 0); if (vid.current) vid.current.srcObject = null;
      const type = rec.mimeType || (audioOnly ? 'audio/webm' : 'video/webm'); const ext = audioOnly ? (/mp4/.test(type) ? 'm4a' : 'webm') : /mp4/.test(type) ? 'mp4' : 'webm'; const file = new File(chunks, `recording-${new Date().toTimeString().slice(0, 8).replace(/:/g, '')}.${ext}`, { type });
      const took = (performance.now() - t0) / 1000;
      if (onAudio) { onAudio(file, took); setSt('idle'); return; }
      try { const m = await readVideo(file); onDone?.({ ...m, duration: Number.isFinite(m.duration) && m.duration > 0 ? m.duration : took, trimmed: false }); setSt('idle'); }
      catch { setSt('error'); setMsg('That recording couldn’t be read. Try again or upload a clip.'); } };
    stop.current = () => { if (rec.state === 'recording') rec.stop(); };
    rec.start(250); setSec(0); setSt('rec');
  };
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return <div className="cv-rec" data-testid="record-clip">
    <div className="cv-rec-row">
      {st === 'rec' ? <button type="button" className="btn cv-rec-btn on" data-testid="record-stop" onClick={() => stop.current()}>■ Stop</button>
        : <button type="button" className="btn cv-rec-btn" data-testid="record-start" disabled={disabled || st === 'asking'} onClick={start}>● Record</button>}
      <span className="cv-rec-time" data-testid="record-time" aria-live="off">{mm(sec)} / {mm(maxSec)}</span>
      {!audioOnly && <video ref={vid} className="cv-rec-cam" muted playsInline aria-hidden />}
    </div>
    <div className="cv-wave" aria-hidden>{lv.map((x, i) => <i key={i} style={{ transform: `scaleY(${Math.max(0.06, x)})` }} />)}</div>
    <p className={`helper cv-rec-msg ${st === 'denied' || st === 'error' ? 'err' : ''}`} role="status" data-testid="record-msg">
      {audioOnly ? (st === 'denied' ? 'Microphone access is blocked. Allow it in your browser’s site settings, or upload an audio file instead.' : st === 'unsupported' ? 'This browser can’t record here. Upload an audio file instead.' : st === 'error' ? (msg || 'Recording didn’t start. Upload an audio file instead.') : st === 'asking' ? 'Waiting for microphone permission…' : st === 'rec' ? 'Recording. Speak clearly; it stops by itself at the limit.' : 'Or record your voice now with your microphone. You get an audio file back.')
        : st === 'denied' ? 'Camera or microphone access is blocked. Allow it in your browser’s site settings, or upload a clip instead.'
        : st === 'unsupported' ? 'This browser can’t record here. Upload a clip instead.'
        : st === 'error' ? (msg || 'Recording didn’t start. Upload a clip instead.')
        : st === 'asking' ? 'Waiting for camera and microphone permission…'
        : st === 'rec' ? 'Recording. Speak clearly; it stops by itself at the limit.'
        : 'Or record one now with your camera and microphone (the voice changes in the video).'}</p>
  </div>;
}

/** standIn (server sampleKind 'standin' / sampleIsStandIn): the clip only shows the style of voice, not a recording of this engine's voice. */
/** B28a: what a voice sample is, from the server (sampleKind / sampleIsStandIn). A stand-in is a placeholder tone, never presented as a voice. */
export type SampleKind = 'standin' | 'real' | null;
export const sampleKindOf = (x: any): SampleKind => !x ? null : x.sampleKind === 'standin' || x.sampleIsStandIn === true ? 'standin' : x.sampleKind === 'real' ? 'real' : null;
export const STANDIN_SAMPLE_LABEL = 'Placeholder tone · real sample coming';
export const sampleLabel = (k: SampleKind): string => k === 'standin' ? STANDIN_SAMPLE_LABEL : k === 'real' ? 'Example of the voice style' : 'Listen';
export function SamplePlay({ url, standIn, kind }: { url: string; standIn?: boolean; kind?: SampleKind }) {
  const k: SampleKind = kind ?? (standIn ? 'standin' : null);
  const a = useRef<HTMLAudioElement | null>(null); const [on, setOn] = useState(false);
  useEffect(() => () => { a.current?.pause(); }, []);
  const toggle = () => { if (!a.current) { a.current = new Audio(url); registerMedia(a.current); a.current.onended = () => setOn(false); a.current.onpause = () => setOn(false); }
    if (on) { a.current.pause(); a.current.currentTime = 0; setOn(false); } else a.current.play().then(() => setOn(true)).catch(() => setOn(false)); };
  return <button type="button" className="btn btn-sm cv-play" data-testid="voice-sample-play" aria-pressed={on} data-standin={k === 'standin' ? '1' : undefined} data-kind={k ?? undefined} aria-label={on ? (k === 'standin' ? `Stop the placeholder tone` : 'Stop the voice sample') : sampleLabel(k)} title={k === 'standin' ? 'A short test tone stands in until a real voice sample is recorded.' : undefined} onClick={toggle}>{on ? '■ Stop' : `▶ ${sampleLabel(k)}`}</button>;
}

/** B27: Change Voice also takes an audio clip instead of a video (server input 'audio'): upload or record one; the result is audio (MP3 by default). */
export function AudioClipInput({ file, onChange, disabled, accept = 'audio/*', help }: { file: File | null; onChange: (f: File | null, sec?: number) => void; disabled?: boolean; accept?: string; help?: string }) {
  const url = useMemo(() => file ? URL.createObjectURL(file) : '', [file]); useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const pick = (f?: File | null) => { if (!f) return; const a = document.createElement('audio'); a.preload = 'metadata'; a.onloadedmetadata = () => onChange(f, Number.isFinite(a.duration) ? a.duration : undefined); a.onerror = () => onChange(f); a.src = URL.createObjectURL(f); };
  return <section className="card cv-audio" data-testid="cv-audio">
    <h2>{file ? 'Audio clip' : 'Or an audio clip'}</h2>
    {file ? <div className="vs-file"><audio controls src={url} data-testid="cv-audio-player" /><span className="vs-name" title={file.name}>{file.name}</span><button type="button" className="btn btn-sm" disabled={disabled} onClick={() => onChange(null)}>Remove</button></div>
      : <><label className="vs-drop"><input type="file" accept={accept} data-testid="cv-audio-input" disabled={disabled} onChange={e => { pick(e.target.files?.[0]); e.currentTarget.value = ''; }} /><span>Upload audio</span><small>{help ?? 'WAV, MP3 or M4A. You get audio back, same length.'}</small></label>
        <RecordClip onAudio={(f, sec) => onChange(f, sec)} disabled={disabled} /></>}
  </section>;
}
