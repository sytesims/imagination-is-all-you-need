/**
 * Render (Direct a Shot step 3) in the result viewer (/jobs/:id, 2026-10-24). A Take holds a Mockup and its Render:
 *  - a render (tool make-it-real): Mockup vs Render on the stage (shared/MakeItReal.tsx PlanVsReal) and, in the panel, a link back to its mockup;
 *  - a Direct a Shot mockup (tool plan-a-shot): a "Render real video" button in the panel that opens the shared sheet, plus its earlier renders.
 * Plain function (no hooks): the viewer calls it every render and places `stage` and `panel`.
 */
import { useRef, useState, type ReactNode } from 'react';
import type { JobState } from '../api';
import { navigate } from '../platform/router';
import { MakeItRealSheet, PlanVsReal } from './MakeItReal';
import { SparkleIcon } from '../ui/Icons';
import { MAKE_REAL_TOOL } from '../../../server/src/shared/makeItReal';
import { PREVIZ_TOOL } from '../../../server/src/shared/previzTemplates';

const go = (href: string) => (e: React.MouseEvent) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(href); };

export function MakeRealViewer(job: JobState): { stage?: ReactNode; panel?: ReactNode } | null {
  if (job.toolId === MAKE_REAL_TOOL) {
    const m = (job.input as any)?.makeReal ?? {}; const p = m.plan ?? {}; const real = job.outputs?.[0]?.url ?? job.resultUrl;
    if (!m.planUrl || !real) return null;
    const sample = /sample/i.test(job.outputs?.[0]?.label ?? '');
    return { stage: <PlanVsReal planUrl={m.planUrl} realUrl={real} ar={p.width && p.height ? `${p.width} / ${p.height}` : undefined} sample={sample} />,
      panel: <section className="mir-vpanel" data-testid="mir-viewer-panel">
        <p><b>{(job as any).example ? 'Example take: rendered from a mockup' : 'Take: rendered from your mockup'}</b>{m.presetName ? ` · ${m.presetName}` : ''}. LTX-2.5 22B (distilled, GGUF Q4_K_M) with Lightricks’ Layout to Render, {p.width}×{p.height}, {p.frames} frames at 24 fps{m.firstFrame ? ', with your first frame' : ', no first frame'}.</p>
        {sample && <p className="mir-vnote">Sample mode: no model ran. This is a colour-graded copy of your mockup so you can try Mockup vs Render.</p>}
        {m.planJobId ? <span className="mir-vrow"><a className="rvx-second" href={`/jobs/${m.planJobId}`} onClick={go(`/jobs/${m.planJobId}`)} data-testid="mir-open-plan">Open the mockup</a><AgainButton planJobId={m.planJobId} /></span>
          : (job as any).example?.recreateHref ? <span className="mir-vrow"><a className="rvx-second" href={(job as any).example.recreateHref} onClick={go((job as any).example.recreateHref)} data-testid="mir-direct-this">Direct this shot</a></span> : null /* an example take (shared/featured.ts): its scene, with the Render prompt waiting */}</section> };
  }
  if (job.toolId === PREVIZ_TOOL) return { panel: <MakeRealPanel job={job} /> };
  return null;
}

function MakeRealPanel({ job }: { job: JobState }) {
  const [open, setOpen] = useState(false); const btn = useRef<HTMLButtonElement>(null); const made: any[] = (job as any).madeReal ?? [];
  return <section className="mir-vpanel" data-testid="mir-plan-panel">
    <button ref={btn} type="button" className="rvx-primary mir-vbtn" data-testid="rvx-make-real" onClick={() => setOpen(true)}><SparkleIcon size={16} />Render real video</button>
    <p className="mir-vnote">Real video from this mockup. The camera move and where things stand stay as you staged them. Free on your computer; takes a few minutes.</p>
    {made.length > 0 && <ul className="mir-vlist">{made.slice(0, 4).map((r) => <li key={r.id}><a href={`/jobs/${r.id}`} onClick={go(`/jobs/${r.id}`)}>{r.status === 'done' ? 'Render' : r.status === 'failed' ? 'Failed render' : 'Rendering…'}</a><small>{r.createdAt ? new Date(r.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : ''}{r.simulated ? ' · sample' : ''}</small></li>)}</ul>}
    <MakeItRealSheet open={open} planJobId={job.id} anchor={btn} placement="bottom" onClose={() => setOpen(false)} onStarted={(id) => navigate(`/jobs/${id}`)} />
  </section>;
}

/** Render again from the same mockup (a new seed or prompt), from the render's panel. */
function AgainButton({ planJobId }: { planJobId: string }) {
  const [open, setOpen] = useState(false); const btn = useRef<HTMLButtonElement>(null);
  return <><button ref={btn} type="button" className="rvx-second mir-vbtn" data-testid="mir-again" onClick={() => setOpen(true)}><SparkleIcon size={14} />Render again</button>
    <MakeItRealSheet open={open} planJobId={planJobId} anchor={btn} placement="bottom" onClose={() => setOpen(false)} onStarted={(id) => navigate(`/jobs/${id}`)} /></>;
}
