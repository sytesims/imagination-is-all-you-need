/**
 * Video to layers result (2026-11-07; server/src/layers): the full-screen viewer's stage and panel for a split video, built on the image layer stack's
 * pieces (shared/LayerStack: the same list rows, eye buttons, stage over a checkerboard and download buttons).
 *  - useVideoLayers(job): the split's layers.json (GET /api/layers/:id), or null (not a Layers job, not done, or the plugin is off: then the
 *    viewer shows the job's clips as usual).
 *  - VideoLayersStage: every visible layer (VP9 with alpha) stacked bottom first over the clean background, all playing in sync from one
 *    scrub bar; or the depth pass, the clean background alone, or the overview (each layer tinted in its colour).
 *  - VideoLayersPanel: the layers top first (eye, solo, colour, name, depth), the views, and Export for editors (ProRes 4444 ZIP).
 */
import { useEffect, useRef, useState } from 'react';
import { usePluginOn } from '../../shared/plugins';
import { tip } from '../../shared/Tooltip';
import { LayerSheetsIcon, DownloadIcon, PlayIcon, PauseIcon } from '../Icons';
import type { LayersManifest } from '../../../../server/src/layers/manifest';
import { LAYERS_TOOL } from '../../../../server/src/layers/constants';
import '../../shared/layerStack.css';
import './videoLayers.css';

export type { LayersManifest };
export type LayersMode = 'layers' | 'depth' | 'background' | 'overview';

export function useVideoLayers(job: { id: string; toolId?: string; status?: string } | null): LayersManifest | null {
  const on = usePluginOn('studio-edit'); /* Video to layers is part of the Edit studio, with Footage Effects */ const [m, setM] = useState<LayersManifest | null>(null);
  const want = !!job && job.toolId === LAYERS_TOOL && job.status === 'done' && on;
  useEffect(() => { setM(null); if (!want) return; const ac = new AbortController();
    fetch(`/api/layers/${encodeURIComponent(job!.id)}`, { signal: ac.signal }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.kind === 'video-layers') setM(d); }).catch(() => undefined);
    return () => ac.abort(); }, [job?.id, want]); // eslint-disable-line react-hooks/exhaustive-deps
  return want ? m : null;
}

/** The viewer's state: hidden layers (by id), the solo layer, the background shown or not, the view, the shared clock. */
export function useVideoLayerView(jobId: string) {
  const [hidden, setHidden] = useState<ReadonlySet<number>>(() => new Set()); const [solo, setSolo] = useState<number | null>(null);
  const [bgOn, setBgOn] = useState(true); const [mode, setMode] = useState<LayersMode>('layers');
  const [time, setTime] = useState(0); const [playing, setPlaying] = useState(true);
  useEffect(() => { setHidden(new Set()); setSolo(null); setBgOn(true); setMode('layers'); setTime(0); setPlaying(true); }, [jobId]);
  return { hidden, solo, bgOn, mode, time, playing, setMode, setTime, setPlaying,
    toggle: (id: number) => setHidden((h) => { const n = new Set(h); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    toggleSolo: (id: number) => setSolo((s) => (s === id ? null : id)), toggleBg: () => setBgOn((b) => !b),
    visible: (id: number) => (solo != null ? solo === id : !hidden.has(id)) };
}
export type VideoLayerView = ReturnType<typeof useVideoLayerView>;

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;

export function VideoLayersStage({ m, view }: { m: LayersManifest; view: VideoLayerView }) {
  const box = useRef<HTMLDivElement>(null); const { mode, playing, time, setTime, setPlaying } = view;
  const vids = () => Array.from(box.current?.querySelectorAll('video') ?? []) as HTMLVideoElement[];
  /* one clock: the first video leads, the others follow it (a drift over 1.5 frames is corrected) */
  const playingRef = useRef(playing); playingRef.current = playing; const timeRef = useRef(time); timeRef.current = time;
  useEffect(() => { const t = timeRef.current; for (const v of vids()) v.currentTime = t; }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps -- another view keeps the moment you were on
  useEffect(() => { let raf = 0; const tick = () => { const all = vids(); const lead = (playingRef.current && all.find((v) => !v.paused)) || all[0];
      if (lead) { const t = lead.currentTime;
        for (const v of all) { if (v === lead) continue; if (Math.abs(v.currentTime - t) > 1.5 / m.fps) v.currentTime = t;
          if (playingRef.current && v.paused && v.readyState >= 2) void v.play().catch(() => undefined); } // a clip that didn't start with the others joins them
        setTime(t); }
      raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [mode, m.jobId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { for (const v of vids()) { if (playing) void v.play().catch(() => undefined); else v.pause(); } }, [playing, mode, m.jobId]); // eslint-disable-line react-hooks/exhaustive-deps
  const seek = (t: number) => { for (const v of vids()) v.currentTime = t; setTime(t); };
  const vprops = { muted: true, loop: true, playsInline: true, preload: 'auto' as const, autoPlay: playing, 'data-media-keep': '' /* the stack plays together: never budget-paused one by one (shared/mediaPause.ts) */ };
  const bottomUp = [...m.layers].sort((a, b) => a.order - b.order); const shown = m.layers.filter((l) => view.visible(l.id)).length;
  const label = mode === 'depth' ? 'Depth (near is white)' : mode === 'background' ? 'Clean background' : mode === 'overview' ? 'Overview: each layer in its colour' : `${shown} of ${m.layers.length} layers shown`;
  return <div className="vly-stage" data-testid="vly-stage">
    <div ref={box} className="rvx-media rvx-fit ly-canvas alpha-bg vly-canvas" style={{ ['--ar' as any]: m.width / m.height }} role="img" aria-label={`Video to layers: ${label}`} data-testid={`vly-canvas-${mode}`}>
      {mode === 'layers' && <>
        {m.background.url && <video key="bg" src={m.background.url} {...vprops} className={view.bgOn && view.solo == null ? undefined : 'ly-off'} data-testid="vly-bg" />}
        {bottomUp.map((l) => <video key={l.id} src={l.previewUrl} {...vprops} className={view.visible(l.id) ? undefined : 'ly-off'} data-testid={`vly-video-${l.id}`} />)}
        {shown === 0 && !(view.bgOn && m.background.url) && <span className="ly-none">All layers hidden</span>}
      </>}
      {mode === 'depth' && m.depth.url && <video key="depth" src={m.depth.url} {...vprops} data-testid="vly-depth" />}
      {mode === 'background' && m.background.url && <video key="plate" src={m.background.url} {...vprops} data-testid="vly-plate" />}
      {mode === 'overview' && <video key="ov" src={m.overviewUrl} {...vprops} data-testid="vly-overview" />}
    </div>
    <div className="vly-scrub" data-testid="vly-scrub">
      <button type="button" className="ly-eye" aria-label={playing ? 'Pause' : 'Play'} data-testid="vly-play" onClick={() => setPlaying(!playing)}>{playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}</button>
      <input type="range" min={0} max={m.seconds} step={1 / m.fps} value={Math.min(time, m.seconds)} aria-label="Scrub" data-testid="vly-range"
        onChange={(e) => { setPlaying(false); seek(Number(e.target.value)); }} />
      <span className="vly-time" data-testid="vly-time">{fmt(time)} / {fmt(m.seconds)}</span>
    </div>
  </div>;
}

const MODES: { id: LayersMode; label: string; tip: string }[] = [
  { id: 'layers', label: 'Layers', tip: 'Every visible layer over the clean background' },
  { id: 'overview', label: 'Overview', tip: 'Your clip with each layer tinted in its colour' },
  { id: 'depth', label: 'Depth', tip: 'Near is white, far is black, over the whole clip' },
  { id: 'background', label: 'Background', tip: 'The scene with the layers taken out' },
];
const SoloGlyph = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" fill="currentColor" /></svg>;
const EyeGlyph = ({ off }: { off: boolean }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
  <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.6" />{off && <path d="M4 20 20 4" />}</svg>;

export function VideoLayersPanel({ m, view, onError }: { m: LayersManifest; view: VideoLayerView; onError?: (msg: string) => void }) {
  const [ex, setEx] = useState<'' | 'busy' | 'done'>(''); const topDown = [...m.layers].sort((a, b) => b.order - a.order);
  const modes = MODES.filter((x) => (x.id !== 'depth' || !!m.depth.url) && (x.id !== 'background' || !!m.background.url));
  const exportZip = async () => { if (ex === 'busy') return; setEx('busy');
    try { const r = await fetch(`/api/layers/${encodeURIComponent(m.jobId)}/export`, { method: 'POST' }); const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) throw new Error(d.error || 'The export could not be made');
      const a = document.createElement('a'); a.href = d.url; a.download = d.name ?? 'layers.zip'; document.body.appendChild(a); a.click(); a.remove(); setEx('done'); setTimeout(() => setEx(''), 2500); }
    catch (e) { setEx(''); onError?.(e instanceof Error ? e.message : 'The export could not be made'); } };
  return <section className="rvx-sec ly-sec vly-sec" aria-label="Video to layers" data-testid="vly-panel">
    <div className="rvx-sec-h"><span className="rvx-lbl"><LayerSheetsIcon size={16} />Video to layers <small className="ly-n">{m.layers.length}</small></span>
      {view.solo != null && <button type="button" className="rvx-copy" onClick={() => view.toggleSolo(view.solo!)} data-testid="vly-unsolo">Show all</button>}</div>
    <div className="vly-modes" role="tablist" aria-label="View">{modes.map((x) => <button key={x.id} type="button" role="tab" aria-selected={view.mode === x.id} className={`vly-mode${view.mode === x.id ? ' on' : ''}`}
      onClick={() => view.setMode(x.id)} data-testid={`vly-mode-${x.id}`} {...tip(x.tip)}>{x.label}</button>)}</div>
    <ul className="ly-rows">
      {topDown.map((l) => { const vis = view.visible(l.id); const solo = view.solo === l.id; const pos = l.order === m.layers.length - 1 ? 'Top' : l.order === 0 ? 'Bottom' : `Layer ${l.order + 1} of ${m.layers.length}`;
        return <li key={l.id} className={`ly-row${vis ? '' : ' off'}${solo ? ' on' : ''}`} data-testid={`vly-row-${l.id}`}>
          <button type="button" className="ly-eye" aria-pressed={!view.hidden.has(l.id)} aria-label={`${view.hidden.has(l.id) ? 'Show' : 'Hide'} ${l.name}`} {...tip(view.hidden.has(l.id) ? 'Show layer' : 'Hide layer')} onClick={() => view.toggle(l.id)} data-testid={`vly-eye-${l.id}`}><EyeGlyph off={view.hidden.has(l.id)} /></button>
          <button type="button" className={`ly-eye vly-solo${solo ? ' on' : ''}`} aria-pressed={solo} aria-label={`${solo ? 'Stop solo' : 'Solo'} ${l.name}`} {...tip(solo ? 'Show every layer again' : 'Show only this layer')} onClick={() => view.toggleSolo(l.id)} data-testid={`vly-solo-${l.id}`}><SoloGlyph /></button>
          <video className="vly-thumb" src={`${l.matteUrl}#t=0.5`} muted playsInline preload="metadata" aria-hidden />
          <span className="ly-name"><b><i className="vly-dot" style={{ background: l.colour }} aria-hidden />{l.name}</b>
            <small>{pos}{l.depth != null ? ` · depth ${Math.round(l.depth * 100)}%` : ''}{l.coverage < 0.5 ? ` · in ${Math.round(l.coverage * 100)}% of the clip` : ''}</small></span>
          <a className="ly-dl" href={l.previewUrl} download aria-label={`Download ${l.name} (WebM with transparency)`} {...tip('This layer as a WebM with transparency')} data-testid={`vly-dl-${l.id}`}><DownloadIcon size={15} /></a>
        </li>; })}
      {m.background.url && <li className={`ly-row${view.bgOn && view.solo == null ? '' : ' off'}`} data-testid="vly-row-bg">
        <button type="button" className="ly-eye" aria-pressed={view.bgOn} aria-label={`${view.bgOn ? 'Hide' : 'Show'} the clean background`} onClick={view.toggleBg} data-testid="vly-eye-bg"><EyeGlyph off={!view.bgOn} /></button>
        <span className="vly-solo-gap" aria-hidden />
        <video className="vly-thumb" src={`${m.background.url}#t=0.5`} muted playsInline preload="metadata" aria-hidden />
        <span className="ly-name"><b>Clean background</b><small>{m.background.model}{m.background.note ? ` · first ${m.background.seconds} s` : ''}</small></span>
        <a className="ly-dl" href={m.background.url} download aria-label="Download the clean background" data-testid="vly-dl-bg"><DownloadIcon size={15} /></a></li>}
    </ul>
    {m.background.note && <p className="rvx-hint vly-note" data-testid="vly-bg-note">{m.background.note}</p>}
    <div className="ly-alls vly-alls">
      <button type="button" className="ly-all" onClick={exportZip} disabled={ex === 'busy'} aria-busy={ex === 'busy'} data-testid="vly-export" {...tip('ProRes 4444 per layer, black-and-white mattes, 16-bit depth, the clean background and layers.json')}>
        <DownloadIcon size={15} />{ex === 'busy' ? 'Making the export…' : ex === 'done' ? 'Export downloaded' : 'Export for editors (.zip)'}</button>
    </div>
    <p className="rvx-hint vly-models" data-testid="vly-models">{m.models.map((x) => x.name).join(' · ')}{m.where === 'sample' ? ' · Sample: drawn from your clip, no model ran' : ''}</p>
  </section>;
}
