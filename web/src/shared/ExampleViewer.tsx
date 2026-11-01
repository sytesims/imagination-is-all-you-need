import { useEffect, useState } from 'react';
import { appFileName } from './brand';
import { ViewerShell, ViewerPrompt, ViewerDetails, IoStrip, RecreateGlyph, RefGlyph, type IoTile } from './ResultViewer';
import { ViewerImage } from './ViewerImage';
import { workflowFor } from './imageFeatures';
import { durationText } from './jobTiming';
import { tip } from './Tooltip';
import { scaleText } from './scaleText';
import { useToast } from './Toast';
import { DownloadIcon, HeartIcon, PencilIcon, ImageIcon } from '../ui/Icons';
import './exampleViewer.css';
import { LOCAL_LABEL } from '../../../server/src/shared/modelIds';
/**
 * A shipped example (the Workflows showcase) or a look's cover, opened in Create Image as if you had just made it (2026-10-23): the same
 * viewer as a real result (ViewerShell, the zoomable image with Compare, Input → Output, prompt, details), labelled "Example · Made with
 * <model> · <workflow>" so nobody takes it for a result in their library. It is never a job: Like, Share, Edit, Delete and the hand-offs are
 * off (with the reason), Download works, "Use these settings" fills the bar again, "Use this photo" puts the example's input photo in the
 * workflow's slot (never automatic).
 */
export interface ExampleShown {
  key: string; name: string; image: string; width: number | null; height: number | null;
  before: { image: string; label: string; afterLabel: string } | null;
  workflow: string; workflowName: string; provider: string | null; model: string | null; prompt: string; settings: Record<string, unknown>;
  price: string | null; runMs: number | null; /** a look: its name ("Neon night") shown as the preset it opened */ look?: string | null;
}
const SETTING: Record<string, string> = { aspect: 'Aspect', imageResolution: 'Resolution', quality: 'Quality', seed: 'Seed', n: 'Images', scale: 'Scale', style: 'Style', resolution: 'Resolution' };
const QUAL: Record<string, string> = { low: 'Low', med: 'Medium', medium: 'Medium', high: 'High' };
const OFF = 'Examples aren’t in your library. Generate your own to use this.';
const fileName = (e: ExampleShown) => appFileName(`example-${e.key}`, (e.image.split('?')[0].match(/\.(\w+)$/)?.[1] ?? 'webp').toLowerCase());

export function ExampleViewer({ ex, onClose, onUse, onUsePhoto }: { ex: ExampleShown; onClose: () => void; /** fill the bar with this example again and close */ onUse: () => void;
  /** put the example's input photo in the workflow's first slot (only when it has one) */ onUsePhoto?: (() => void) | null }) {
  const toast = useToast();
  const [bad, setBad] = useState(false); const [nat, setNat] = useState(''); const [cmp, setCmp] = useState(false); const [inView, setInView] = useState<number | null>(null); const [badIn, setBadIn] = useState<ReadonlySet<number>>(() => new Set());
  /* a missing file shows a placeholder (the bar is still filled); checked before the image mounts, so no broken image flashes */
  useEffect(() => { setBad(false); setNat(''); setCmp(false); setInView(null); let live = true; const i = new Image(); i.onerror = () => { if (live) setBad(true); }; i.src = ex.image; return () => { live = false; }; }, [ex.image]);
  const made = [ex.model ?? 'a model not recorded', ex.workflowName].filter(Boolean).join(' · ');
  const ar = ex.width && ex.height ? ex.width / ex.height : (() => { const m = /^(\d+)×(\d+)$/.exec(nat); return m ? Number(m[1]) / Number(m[2]) : 0; })();
  const before = ex.before && !badIn.has(0) ? ex.before : null;
  const io: IoTile[] = ex.before ? [{ url: ex.before.image, kind: 'image', a: 'Input', b: ex.before.label, label: `Input · ${ex.before.label}` }] : [];
  const inX = inView != null ? io[inView] ?? null : null;
  const media = bad ? <div className="rvx-media rvx-fail exv-missing" role="img" aria-label="Example image missing" data-testid="exv-missing"><ImageIcon size={28} /><b>This example’s image is missing.</b><small>The prompt, model and settings are still here, and in the bar.</small></div>
    : inX ? <><div className="rvx-inbar" data-testid="rvx-input-bar"><b>{inX.label}</b><small>The photo this example started from</small>
        <button type="button" className="rvx-inbtn" onClick={() => setInView(null)} data-testid="rvx-input-back" {...tip('Back to the example (Esc)')}>Back to example</button></div>
      <ViewerImage key={inX.url} className="rvx-img" src={inX.url} before={null} alt={inX.label} /></>
    : <ViewerImage key={ex.image} className={`rvx-img${ar ? ' rvx-fit' : ''}`} style={ar ? { ['--ar' as any]: ar } : undefined} src={ex.image} alt={`Example: ${ex.name}`}
        before={before?.image ?? null} compare={cmp} onCompare={setCmp} beforeLabel={ex.before?.label ?? 'Before'} afterLabel={ex.before?.afterLabel ?? 'Example'}
        onLoad={e => { const im = e.currentTarget; if (im.naturalWidth) setNat(`${im.naturalWidth}×${im.naturalHeight}`); }} />;
  const strip = io.length > 0 && <IoStrip key={ex.key} items={io} viewing={inView} onView={i => { setCmp(false); setInView(i); }} bad={badIn} onBad={i => setBadIn(s => s.has(i) ? s : new Set(s).add(i))}
    cmp={badIn.has(0) ? { mode: 'blocked', why: 'the input photo is missing' } : bad ? { mode: 'none' } : { mode: cmp ? 'on' : 'off', toggle: () => { setInView(null); setCmp(!cmp); } }}
    out={{ thumb: bad ? null : ex.image, b: ex.before?.afterLabel ?? '', on: inView == null && !cmp, onShow: () => { setInView(null); setCmp(false); } }} />;
  const wf = ex.provider ? workflowFor(ex.workflow, ex.provider) : null;
  /* the graph file the example really ran (Upscale ×2 records its own), else the model's */ const wfFile = typeof ex.settings.workflow === 'string' && /^[\w.-]+\.json$/.test(ex.settings.workflow) ? ex.settings.workflow : wf?.file ?? null;
  const sets = Object.entries(ex.settings).filter(([k, v]) => k !== 'workflow' && v != null && v !== '').map(([k, v]) => [SETTING[k] ?? k, k === 'quality' ? QUAL[String(v)] ?? String(v) : k === 'scale' ? scaleText(v) : String(v)] as [string, string]);
  const rows: [string, React.ReactNode][] = [['Model', <span data-testid="exv-model">{ex.model ?? 'Not recorded'}</span>], ['Workflow', ex.workflowName], ...(ex.look ? [['Preset', ex.look] as [string, string]] : []),
    ['Ran on', LOCAL_LABEL], ['Price', <span data-testid="exv-price">{ex.price ?? 'Not recorded'}</span>], ['Time', <span data-testid="exv-time">{ex.runMs ? durationText(ex.runMs) : 'Not recorded'}</span>],
    ...(nat ? [['Size', nat] as [string, string]] : []), ...sets,
    ...(wf ? [['ComfyUI graph', wfFile ? <a href={`/api/workflows/${encodeURIComponent(wfFile)}`} download={wfFile} data-testid="exv-wf-file">{wfFile !== wf.file || typeof ex.settings.workflow === 'string' ? wfFile : wf.name}</a> : wf.url ? <a href={wf.url} target="_blank" rel="noreferrer">{wf.name}</a> : wf.name] as [string, React.ReactNode]] : [])];
  const copy = () => navigator.clipboard?.writeText(ex.prompt).then(() => { toast('Prompt copied'); }, () => { toast('Couldn’t copy the prompt', 'error'); return false; });
  const offTile = (k: string, label: string, icon: React.ReactNode) => <button key={k} type="button" className="rvx-tile exv-off" aria-disabled="true" data-testid={`exv-off-${k}`} aria-label={`${label}: ${OFF}`} {...tip(OFF)}
    onClick={() => toast(OFF, 'info')}>{icon}<span>{label}</span></button>;
  const footer = <>
    <div className="rvx-row1"><button type="button" className="rvx-primary" data-testid="exv-use" onClick={onUse} {...tip('Puts this example’s workflow, model, prompt and settings in the bar. Nothing runs until you press Generate.')}><RecreateGlyph />Use these settings</button>
      {onUsePhoto && <button type="button" className="rvx-second" data-testid="exv-use-photo" onClick={onUsePhoto} {...tip(`Put this example’s ${ex.before?.label.toLowerCase() ?? 'photo'} in ${ex.workflowName} to try it`)}><RefGlyph />Use this photo</button>}</div>
    <div className="rvx-tiles" data-testid="rvx-tiles">
      {bad ? <button type="button" className="rvx-tile exv-off" aria-disabled="true" data-testid="rv-download" {...tip('The image is missing')}><DownloadIcon size={18} /><span>Save</span></button>
        : <a className="rvx-tile" href={ex.image} download={fileName(ex)} data-testid="rv-download" aria-label="Download this example" {...tip('Download')}><DownloadIcon size={18} /><span>Save</span></a>}
      {offTile('like', 'Like', <HeartIcon size={18} />)}{offTile('edit', 'Edit', <PencilIcon size={18} />)}{offTile('share', 'Share', <ShareGlyph />)}</div>
    <p className="exv-note" data-testid="exv-note">An example, not in your library: Like, Share, Edit and Delete work on what you make.</p></>;
  return <ViewerShell testId="result-viewer" label={`Example: ${ex.name}`} bg={bad ? undefined : ex.image} media={media} fullscreen={!bad}
    who={{ name: ex.name, role: `Made with ${made}` }} badge={<span className="rvx-badges"><em className="exv-chip" data-testid="exv-chip" {...tip('A shipped example made in Imagination Is All You Need. It isn’t in your library.')}>Example</em></span>}
    tabs={[{ id: 'info', label: 'Info' }]} tab="info" setTab={() => 0} itemKey={ex.key} onClose={onClose}
    body={<><ViewerPrompt text={ex.prompt} onCopy={copy} extra={strip} /><ViewerDetails rows={rows} /></>} footer={footer} />;
}
const ShareGlyph = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 15V4" /><path d="m7.5 8.5 4.5-4.5 4.5 4.5" /><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" /></svg>;
