/* Upscale page → "Examples" popup (2026-10-22; QA #18: titled with the two models it compares and follows the picked model). Five real ×4 runs made on the user's own GPU in this app: a 384 px source through
 * Real-ESRGAN ×4 and 4x-UltraSharp ×4, compared with the shared SplitPreview. Close-up = a 512 px crop at the output's own resolution
 * (where the models differ most); Whole = the full output shrunk to 1024 px. "Original (stretched)" is the 384 px source scaled up by
 * the browser, for an honest baseline. Times and file sizes are the measured ones (data: upscaleExamplesData.ts).
 * Modal on desktop, bottom sheet on phone; Esc / backdrop / ✕ close; focus is trapped and returns to the opener. */
import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent as RKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import SplitPreview from '../../shared/SplitPreview';
import { CloseIcon, StopwatchIcon } from '../../ui/Icons';
import { UPSCALE_EXAMPLES, UPSCALE_EXAMPLES_DIR, EXAMPLE_MODELS, EXAMPLES_COMPARE, exampleModelOf, type ExampleModel, type UpscaleExample } from './upscaleExamplesData';

type Pair = 'models' | 'orig-realesrgan' | 'orig-ultrasharp';
type View = 'crop' | 'whole';
const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])';
const kb = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);
const sec = (s: number) => (s < 10 ? `${s.toFixed(1)} s` : `${Math.round(s)} s`);
const sz = (s: { width: number; height: number }) => `${s.width}×${s.height}`;
const url = (f: string) => `${UPSCALE_EXAMPLES_DIR}/${f}`;

/** `model` = the picked upscale provider id. Real-ESRGAN / 4x-UltraSharp open on "Original vs <that model>"; any other model (SeedVR2…)
 *  has no example yet, so the popup says so and names the two models the examples do show (QA #18). Without it: the plain comparison. */
export default function UpscaleExamples({ onClose, onTry, model, modelName }: { onClose: () => void; onTry: (file: File, ex: UpscaleExample) => void; model?: string | null; modelName?: string | null }) {
  const picked = exampleModelOf(model); const noExample = !!model && !picked;
  const [i, setI] = useState(0); const [pair, setPair] = useState<Pair>(picked ? `orig-${picked}` : 'models'); const [view, setView] = useState<View>('crop'); const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null); const ex = UPSCALE_EXAMPLES[i];
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null; const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    box.current?.querySelector<HTMLElement>('.iux-x')?.focus();
    return () => { document.body.style.overflow = prev; back?.focus?.(); };
  }, []);
  const onKey = (e: RKeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab' || !box.current) return;
    const f = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.getClientRects().length > 0); if (!f.length) return;
    const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  };
  const onTabsKey = (e: RKeyboardEvent) => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; e.preventDefault(); const n = (i + d + UPSCALE_EXAMPLES.length) % UPSCALE_EXAMPLES.length; setI(n); (e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[n])?.focus(); };
  const img = (m: ExampleModel | 'orig') => (m === 'orig' ? url(view === 'crop' ? ex.sourceCrop : ex.source) : url(view === 'crop' ? ex.runs[m].crop : ex.runs[m].full));
  const [l, r]: [ExampleModel | 'orig', ExampleModel] = pair === 'models' ? ['realesrgan', 'ultrasharp'] : pair === 'orig-realesrgan' ? ['orig', 'realesrgan'] : ['orig', 'ultrasharp'];
  const label = (m: ExampleModel | 'orig') => (m === 'orig' ? 'Original (stretched)' : `${EXAMPLE_MODELS[m].name} ×4`);
  const tryIt = async () => {
    setBusy(true);
    try { const b = await (await fetch(url(ex.source))).blob(); onTry(new File([b], ex.source, { type: b.type || (ex.source.endsWith('.jpg') ? 'image/jpeg' : 'image/png') }), ex); onClose(); }
    catch { setBusy(false); }
  };
  return createPortal(
    <div className="iux-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} data-testid="iux-scrim">
      <div ref={box} className="iux" role="dialog" aria-modal="true" aria-labelledby="iux-h" aria-describedby="iux-guide" onKeyDown={onKey} data-testid="iu-examples">
        <header className="iux-head">
          <h2 id="iux-h">Examples: <span data-testid="iux-compare">{EXAMPLES_COMPARE}</span></h2>
          <button type="button" className="iux-x" aria-label="Close examples" onClick={onClose}><CloseIcon size={16} /></button>
        </header>
        {noExample && <p className="iux-nomodel" role="note" data-testid="iux-no-example">No example for <b>{modelName || 'this model'}</b> yet. These show {EXAMPLE_MODELS.realesrgan.name} and {EXAMPLE_MODELS.ultrasharp.name}, two other models you can pick.</p>}
        <p className="iux-guide" id="iux-guide"><b>Real-ESRGAN</b> gives a clean, smooth result: the safer pick for noisy or compressed images, though skin and flat surfaces can look a little airbrushed. <b className="iux-nw">4x-UltraSharp</b> keeps more fine texture (skin, hair, brick, knit), which suits detailed images, but it looks harsher and sometimes adds texture that wasn’t there.</p>
        <div className="iux-tabs" role="tablist" aria-label="Example images" onKeyDown={onTabsKey}>
          {UPSCALE_EXAMPLES.map((x, k) => <button key={x.id} type="button" role="tab" aria-label={x.title} id={`iux-t-${x.id}`} aria-controls="iux-panel" aria-selected={k === i} tabIndex={k === i ? 0 : -1} className={`iux-tab ${k === i ? 'on' : ''}`} onClick={() => setI(k)} data-testid={`iux-tab-${x.id}`}>
            <img src={url(x.source)} alt="" width={44} height={44} loading="lazy" /><span>{x.title}</span></button>)}
        </div>
        <div className="iux-panel" id="iux-panel" role="tabpanel" aria-labelledby={`iux-t-${ex.id}`}>
          <div className="iux-meta"><b data-testid="iux-title">{ex.title}</b><span className="iux-dim">{sz(ex.sourceSize)} → {sz(ex.outputSize)}</span></div>
          <div className="iux-ctrls">
            <div className="iux-seg" role="radiogroup" aria-label="Compare">
              {([['models', <><span className="iux-nw">{EXAMPLE_MODELS.realesrgan.name}</span> vs <span className="iux-nw">{EXAMPLE_MODELS.ultrasharp.name}</span></>], ['orig-realesrgan', <>Original vs <span className="iux-nw">{EXAMPLE_MODELS.realesrgan.name}</span></>], ['orig-ultrasharp', <>Original vs <span className="iux-nw">{EXAMPLE_MODELS.ultrasharp.name}</span></>]] as [Pair, ReactNode][]).map(([k, t]) =>
                <button key={k} type="button" role="radio" aria-checked={pair === k} className={pair === k ? 'on' : ''} onClick={() => setPair(k)} data-testid={`iux-pair-${k}`}>{t}</button>)}
            </div>
            <div className="iux-seg" role="radiogroup" aria-label="View">
              {([['crop', 'Close-up'], ['whole', 'Whole']] as [View, string][]).map(([k, t]) =>
                <button key={k} type="button" role="radio" aria-checked={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)} data-testid={`iux-view-${k}`}>{t}</button>)}
            </div>
          </div>
          <div className={`iux-stage ${l === 'orig' ? 'is-orig' : ''}`}>
            <SplitPreview key={`${ex.id}-${pair}-${view}`} before={img(l)} after={img(r)} beforeLabel={label(l)} afterLabel={label(r)} sticky initial={50} className="iux-split" testId="iux-split" />
          </div>
          <p className="iux-cap">{view === 'crop' ? `A ${ex.cropSize} px detail at full output size. Drag the divider.` : `The whole ${sz(ex.outputSize)} result, shown smaller. Drag the divider.`}</p>
          <ul className="iux-stats" data-testid="iux-stats">
            {(['realesrgan', 'ultrasharp'] as ExampleModel[]).map(m => <li key={m}><b>{EXAMPLE_MODELS[m].name} ×4</b><span><StopwatchIcon size={13} />{sec(ex.runs[m].seconds)}</span><span>{kb(ex.runs[m].bytes)} PNG</span></li>)}
          </ul>
          <p className="iux-note">Times are from our computer; yours will differ. File size = the PNG the model saved.</p>
        </div>
        <footer className="iux-foot">
          <span className="iux-dim">Made in this app with Z-Image Turbo, shrunk to 384 px.</span>
          <button type="button" className="iux-try" onClick={tryIt} disabled={busy} data-testid="iux-try">Try this one</button>
        </footer>
      </div>
    </div>, document.body);
}
