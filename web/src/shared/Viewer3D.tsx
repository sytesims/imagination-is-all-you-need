/**
 * The full-screen viewer for a 3D item (2026-10-23): the same ViewerShell as image / video / audio results (header, details panel, footer
 * tiles), with the live <model-viewer> as its media (orbit, zoom, auto-rotate, clay look, keyboard). Used for a 3D job (ResultView sends GLB
 * results here, so Assets and /jobs/:id open them too) and for a showcase example (the 3D page's "Made with these models").
 *  - The one-live-viewer slot at priority 2 (a background poster render gives way).
 *  - A big GLB (over the server's bigGlbBytes) asks before it loads; a file that won't load shows a placeholder and a download link.
 *  - A job without a poster saves one from the viewer once it loads (POST /api/jobs/:id/3d-poster): the card still for the feed.
 *  - "Make a video": records one orbit in the browser (free) and keeps it as a normal video result (tool three-d-turntable).
 */
import { WorksWith } from './WorksWith';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { appFileName } from './brand';
import { ViewerShell, ViewerDetails, IoStrip, RecreateGlyph, type IoTile } from './ResultViewer';
import { goClick } from './goToWorkflow';
import { recreateHref as jobRecreateHref, directShotHref } from './workflowLinks';
import { Model3D, fmtMB, fmtFaces, posterOf3d, startOrbitOf, START_ORBIT, type Model3DHandle, type Look, type Recording } from './model3d';
import { threeDMode, threeDWorkflowById } from '../../../server/src/shared/threeD';
import { RIG_MOVES } from '../../../server/src/shared/previzRig';
import { tip } from './Tooltip';
import { useToast } from './Toast';
import { DownloadIcon, OrbitIcon, VideoIcon, PrevizIcon, RigIcon } from '../ui/Icons';
/** Rig as a character (2026-10-27): loaded when it opens (three.js, the fitter and the sheet) */
const RigSheet = lazy(() => import('./rig/RigSheet'));
import { ownAccountsNow, jobCostText, ledgerUsd } from './billing';
import { durationText, jobTiming } from './jobTiming';
import './model3d.css';

export const BIG_GLB_BYTES = 60 * 1024 * 1024; /* server shared/threeD.ts BIG_GLB_BYTES; /api/3d-workflows sends it too */
export interface Meta3D { bytes: number; faces: number | null; vertices: number | null; textured: boolean; pbr: boolean; valid: boolean; big?: boolean }
const metaCache = new Map<string, Promise<Meta3D | null>>();
/** GET /api/3d/meta for a /files/*.glb result (cached per page load); null for other URLs or on failure. */
export function meta3d(url: string): Promise<Meta3D | null> {
  if (!/^\/files\/[^?#]+\.glb$/i.test(url)) return Promise.resolve(null);
  let p = metaCache.get(url); if (!p) { p = fetch(`/api/3d/meta?url=${encodeURIComponent(url)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null); metaCache.set(url, p); } return p;
}
export function useMeta3d(url: string | null | undefined): Meta3D | null { const [m, setM] = useState<Meta3D | null>(null);
  useEffect(() => { let on = true; setM(null); if (url) void meta3d(url).then((x) => { if (on) setM(x); }); return () => { on = false; }; }, [url]); return m; }
/** "7k faces · textured · 4.2 MB" */
export const metaLine = (m: Meta3D | null, mb?: number | null) => [m?.faces ? fmtFaces(m.faces) : '', m ? (m.textured ? (m.pbr ? 'PBR textures' : 'textured') : 'no texture') : '', m?.bytes ? fmtMB(m.bytes) : mb ? `${mb} MB` : ''].filter(Boolean).join(' · ');

/** Upload a poster for a 3D job (once, after its viewer loads). */
export async function savePoster(jobId: string, blob: Blob): Promise<string | null> {
  const fd = new FormData(); fd.append('image', blob, 'poster.png');
  try { const r = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/3d-poster`, { method: 'POST', body: fd }); return r.ok ? (await r.json()).posterUrl ?? null : null; } catch { return null; }
}
/** Keep a recorded orbit as a video result (free). Returns the new job id. */
export async function saveTurntable(sourceJob: string | null, rec: Recording): Promise<string> {
  const fd = new FormData(); fd.append('types', '["turntable"]'); fd.append('seconds', String(rec.seconds)); if (sourceJob) fd.append('sourceJob', sourceJob); fd.append('video', rec.blob, `turntable.${rec.ext}`);
  const r = await fetch('/api/tools/three-d-turntable/jobs', { method: 'POST', body: fd }); const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error ?? 'The turntable could not be saved.'); return String(b.id);
}

export interface Item3D {
  key: string; src: string; name: string; role: string; poster?: string | null; badge?: ReactNode;
  /** the job (null for a showcase example) */ jobId?: string | null; inputUrl?: string | null; inputLabel?: string;
  rows: [string, ReactNode][]; /** Recreate: the job's 3D workflow with its image and settings (shared/workflowLinks recreateHref); null = none (a showcase example, a sample) */ recreateHref?: string | null;
  /** where the camera starts (model3d startOrbitOf); default START_ORBIT */ cameraOrbit?: string;
  /** known size (showcase) when there is no meta call */ mb?: number | null; credit?: ReactNode; downloadName: string;
  /** a rigged character: the move the viewer plays (Walk) */ animation?: string | null; /** what the rig sheet calls it (the source's name) */ rigName?: string;
}
export function Viewer3D({ item, onClose, onPrev, onNext, pos, bigBytes = BIG_GLB_BYTES, recordOnOpen = false, onTurntable, onRigged, headActions, primary, tiles, children }: { item: Item3D; /** header buttons beside ✕ (a job's Favourite heart) */ headActions?: React.ReactNode; onClose: () => void; onPrev?: (() => void) | null; onNext?: (() => void) | null; pos?: string;
  /** row 1's main button instead of the default (a job: Make a video; an example: none, the GLB tile downloads it), e.g. an example's "Use this image" */ primary?: ReactNode;
  /** more footer tiles after GLB and Still (a job's shared Share and More from ResultView) */ tiles?: ReactNode; /** dialogs over the viewer (Share) */ children?: ReactNode;
  bigBytes?: number; /** start recording the turntable as soon as the model loads (the Turntable workflow) */ recordOnOpen?: boolean; onTurntable?: (jobId: string) => void; /** a character was rigged from this model (its new job id) */ onRigged?: (jobId: string) => void }) {
  const toast = useToast(); const v = useRef<Model3DHandle>(null);
  const meta = useMeta3d(item.jobId ? item.src : null); const bytes = meta?.bytes ?? (item.mb ? item.mb * 1e6 : 0);
  const [okBig, setOkBig] = useState(false); const big = bytes > bigBytes && !okBig;
  const [rotate, setRotate] = useState(true); const [look, setLook] = useState<Look>('lit'); const [loaded, setLoaded] = useState(false);
  const [rig, setRig] = useState(false); const [rec, setRec] = useState<{ p: number } | null>(null); const [inView, setInView] = useState<number | null>(null); const posterSaved = useRef(false); const autoRec = useRef(recordOnOpen);
  useEffect(() => { setOkBig(false); setLoaded(false); setLook('lit'); setInView(null); posterSaved.current = !!item.poster; autoRec.current = recordOnOpen; }, [item.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const onLoad = () => { setLoaded(true);
    if (item.jobId && !posterSaved.current) { posterSaved.current = true; setTimeout(() => { void v.current?.snapshot().then((b) => (b ? savePoster(item.jobId!, b) : null)); }, 600); }
    if (autoRec.current) { autoRec.current = false; setTimeout(() => void record(), 500); } };
  const record = async () => { if (!v.current || rec) return; setRec({ p: 0 }); setRotate(false);
    try { const r = await v.current.record({ seconds: 6, onProgress: (p) => setRec({ p }) });
      const id = await saveTurntable(item.jobId ?? null, r); onTurntable?.(id);
      toast(r.fpsMeasured < 18 ? `Turntable saved. Your computer recorded it at ${r.fpsMeasured} fps, so it may look choppy.` : 'Turntable saved as a video', r.fpsMeasured < 18 ? 'warn' : 'info', { action: { label: 'Open', to: `/jobs/${id}` } });
    } catch (e) { toast((e as Error).message || 'The turntable could not be recorded.', 'error'); } finally { setRec(null); setRotate(true); } };
  const io: IoTile[] = item.inputUrl ? [{ url: item.inputUrl, kind: 'image', a: 'Input', b: item.inputLabel ?? '', label: item.inputLabel ? `Input · ${item.inputLabel}` : 'Input' }] : [];
  const inX = inView != null ? io[inView] : null;
  const tools = <div className="m3d-tools" role="toolbar" aria-label="3D view">
    <button type="button" className={`m3d-tb${rotate ? ' on' : ''}`} aria-pressed={rotate} aria-label="Auto-rotate" data-testid="v3d-rotate" onClick={() => setRotate((r) => !r)} {...tip('Auto-rotate')}><OrbitIcon size={16} /><span>Rotate</span></button>
    <div className="m3d-seg" role="radiogroup" aria-label="Look">{(['lit', 'clay'] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={look === k} className={look === k ? 'on' : ''} data-testid={`v3d-look-${k}`} onClick={() => setLook(k)}>{k === 'lit' ? 'Textured' : 'Clay'}</button>)}</div>
    <span className="m3d-hint" aria-hidden>Drag to orbit · scroll to zoom · arrow keys when focused</span></div>;
  const media = inX ? <><div className="rvx-inbar"><b>{inX.label}</b><small>The picture this model was made from</small><button type="button" className="rvx-inbtn" onClick={() => setInView(null)}>Back to the model</button></div>
      <img className="rvx-img m3d-input" src={inX.url} alt={inX.label} /></>
    : <div className="rvx-media m3d-stage" data-testid="v3d-stage">
      {big ? <div className="m3d m3d-big" role="alertdialog" aria-label="Large model" data-testid="v3d-big">{item.poster ? <img className="m3d-still" src={item.poster} alt="" /> : null}
        <p className="m3d-why"><b>This model is {fmtMB(bytes)}.</b><span>Large files can be slow to open and use a lot of graphics memory.</span>
          <span className="m3d-big-act"><button type="button" className="btn btn-primary btn-sm" data-testid="v3d-load-big" onClick={() => setOkBig(true)}>Open it anyway</button><a className="btn btn-sm" href={item.src} download={item.downloadName}>Download instead</a></span></p></div>
        : <Model3D key={`${item.key}-${look}`} ref={v} slot="viewer" pri={2} src={item.src} alt={item.name} poster={item.poster} autoRotate={rotate && !rec} look={look} downloadName={item.downloadName} onLoad={onLoad} testId="v3d-model" cameraOrbit={item.cameraOrbit} invalid={meta?.valid === false} animation={item.animation} />}
      {!big && loaded && tools}
      {rec && <div className="m3d-rec" role="status" data-testid="v3d-recording"><i className="m3d-rec-dot" aria-hidden />Recording the turntable… {Math.round(rec.p * 100)}%</div>}
    </div>;
  const strip = io.length > 0 && <IoStrip key={item.key} items={io} viewing={inView} onView={(i) => setInView(i)} bad={new Set()} onBad={() => 0} cmp={{ mode: 'none' }} out={{ thumb: item.poster ?? null, b: '3D model', on: inView == null, onShow: () => setInView(null) }} />;
  const rows: [string, ReactNode][] = [...item.rows, ...(meta?.faces ? [['Faces', fmtFaces(meta.faces).replace(' faces', '')] as [string, ReactNode]] : []), ...(meta ? [['Textures', meta.textured ? (meta.pbr ? 'Yes, with PBR maps' : 'Yes') : 'None'] as [string, ReactNode]] : []),
    ...(bytes ? [['File', `GLB · ${fmtMB(bytes)}`] as [string, ReactNode]] : [['Format', 'GLB'] as [string, ReactNode]])];
  const footer = <>
    <div className="rvx-row1">{item.jobId && !primary ? <button type="button" className="rvx-primary" data-testid="v3d-make-video" disabled={!loaded || !!rec} onClick={() => void record()} {...tip('Records one orbit of the model in your browser and keeps it as a video. Free.')}><VideoIcon size={16} />{rec ? 'Recording…' : 'Make a video'}</button>
      : primary ?? null /* no second Download GLB: the GLB tile below downloads it (UX audit #9) */}
      {item.recreateHref && <a className="rvx-second" href={item.recreateHref} onClick={goClick(item.recreateHref, onClose)} data-action="recreate" data-testid="rv-recreate" {...tip('The same inputs and settings in this workflow, with a new seed')}><RecreateGlyph />Recreate</a>}</div>
    <div className="rvx-tiles" data-testid="rvx-tiles">
      <a className="rvx-tile" href={item.src} download={item.downloadName} data-testid="v3d-download" aria-label="Download the GLB" {...tip('Download the GLB')}><DownloadIcon size={18} /><span>Save</span></a>
      {item.jobId && <a className="rvx-tile" href={directShotHref(item.jobId)} onClick={goClick(directShotHref(item.jobId), onClose)} data-testid="v3d-use-shot" aria-label="Use in Direct a Shot" {...tip('Use in Direct a Shot: put this model in a 3D set as a prop or as the actor, film it, then render it as real video')}><PrevizIcon size={18} /><span>Shot</span></a>}
      <button type="button" className="rvx-tile" data-testid="v3d-still" disabled={!loaded} aria-label="Save a still picture" {...tip('Save a picture of this view (PNG)')} onClick={async () => { const b = await v.current?.snapshot(); if (!b) return; const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = item.downloadName.replace(/\.glb$/i, '.png'); a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="12" cy="12" r="3.5" /></svg><span>Photo</span></button>
      {item.jobId && <button type="button" className="rvx-tile" data-testid="v3d-rig" aria-label="Rig as a character" onClick={() => setRig(true)} {...tip(item.animation ? 'Rig it again: new bones and moves. Free, in your browser' : 'Rig as a character: give it bones and moves (walk, run, dance), then direct it. Free, in your browser')}><RigIcon size={18} /><span>Rig</span></button>}
      {tiles}</div><WorksWith className="v3d-works" testId="v3d-works-with">Opens in Blender, and online in any glTF viewer.</WorksWith>{item.credit && <p className="m3d-credit" data-testid="v3d-credit">{item.credit}</p>}</>;
  return <ViewerShell testId="result-viewer" label={item.name} bg={item.poster ?? undefined} media={media} who={{ name: item.name, role: item.role }} badge={item.badge}
    tabs={[{ id: 'info', label: 'Info' }]} tab="info" setTab={() => 0} itemKey={item.key} onClose={onClose} onPrev={onPrev} onNext={onNext} pos={pos} headActions={headActions}
    body={<>{strip}<ViewerDetails rows={rows} /></>} footer={footer}>{children}
    {rig && <Suspense fallback={null}><RigSheet src={item.src} name={item.rigName ?? item.name} jobId={item.jobId ?? null} onClose={() => setRig(false)} onSaved={(r) => onRigged?.(r.id)} /></Suspense>}</ViewerShell>;
}
/** The details rows for a 3D job: model, where it ran, price and time, and the settings it ran with. */
export function jobRows3d(j: any, priceText: string | null): [string, ReactNode][] {
  const i = j?.input ?? {}; const t = jobTiming(j); const L: Record<string, string> = { low: 'Low', standard: 'Standard', high: 'High', off: 'Off', hd: 'HD', pbr: 'PBR', auto: 'Auto' };
  return [['Model', j?.model ?? j?.provider ?? ''], ['Ran on', j?.place?.label ?? j?.runOnLabel ?? ''], ...(priceText ? [['Price', priceText] as [string, ReactNode]] : []), ...(t.renderMs ? [['Time', durationText(t.renderMs)] as [string, ReactNode]] : []),
    ...(i.detail ? [['Detail', L[i.detail] ?? i.detail] as [string, ReactNode]] : []), ...(i.texture ? [['Texture', L[i.texture] ?? i.texture] as [string, ReactNode]] : []), ...(i.faces ? [['Face count', L[i.faces] ?? i.faces] as [string, ReactNode]] : []),
    ...(i.seed != null ? [['Seed', String(i.seed)] as [string, ReactNode]] : [])].filter(([, v]) => v !== '' && v != null) as [string, ReactNode][];
}
export { posterOf3d };
/** A 3D job as a viewer item (the 3D page and ResultView, so Assets and /jobs/:id open GLB results the same way). */
export function jobItem3d(j: any): Item3D {
  const rig = j?.input?.rig; if (rig) return rigItem3d(j, rig);
  const price = j?.demo ? 'Sample, nothing billed' : j?.cost ? (ownAccountsNow() ? jobCostText(j.cost, j.runOn) : ledgerUsd(j.cost)) : 'Free';
  return { key: j.id, jobId: j.id, src: j.resultUrl ?? j.outputs?.[0]?.url, name: j.model ?? '3D model', role: `${threeDWorkflowById(threeDMode(j.input ?? {}))?.name ?? '3D model'}${j.place?.label ? ` · ${j.place.label}` : ''}`, poster: posterOf3d(j), inputUrl: j.input?.imageUrl ?? null, inputLabel: 'Image',
    rows: jobRows3d(j, price), cameraOrbit: startOrbitOf(j), downloadName: appFileName(j.id, 'glb'), recreateHref: j?.demo || j?.sample || j?.deletedAt ? null : jobRecreateHref(j), badge: j?.demo ? <span className="rvx-badges"><em className="exv-chip">Sample</em></span> : undefined };
}
/** A character rigged with Rig as a character (job.input.rig, server shared/previzRig.ts RigMeta): its moves, bones and the time it took. */
function rigItem3d(j: any, rig: any): Item3D {
  const moves: string[] = Array.isArray(rig.moves) ? rig.moves : []; const label = (m: string) => RIG_MOVES.find((x) => x.id === m)?.label ?? m; const ms = rig.ms ? (rig.ms.fit ?? 0) + (rig.ms.skin ?? 0) + (rig.ms.bake ?? 0) : 0;
  return { key: j.id, jobId: j.id, src: j.resultUrl ?? j.outputs?.[0]?.url, name: `${rig.name ?? 'Your character'}, rigged`, rigName: rig.name ?? 'Your character', role: 'Rig as a character', poster: posterOf3d(j), inputUrl: j.input?.imageUrl ?? null, inputLabel: 'Image',
    rows: [['Model', 'Mesh2Motion'], ['Ran on', 'Your computer'], ['Price', 'Free'], ['Body type', 'Person'], ['Moves', moves.map(label).join(', ')], ...(rig.bones ? [['Bones', String(rig.bones)] as [string, ReactNode]] : []), ...(ms ? [['Time', durationText(ms)] as [string, ReactNode]] : [])] as [string, ReactNode][],
    cameraOrbit: START_ORBIT, downloadName: appFileName(j.id, 'glb'), recreateHref: null, animation: Array.isArray(rig.clips) && rig.clips.includes('Walk') ? 'Walk' : rig.clips?.[0] ?? null,
    credit: <>Rigged with Mesh2Motion (MIT) and its human moves (CC0).</> };
}
