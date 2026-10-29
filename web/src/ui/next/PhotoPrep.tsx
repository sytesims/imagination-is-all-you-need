/**
 * Input prep + pre-flight in the Create bar (2026-10-23).
 * - PrepChip (inline after the photo slots, at the start of the prompt line; compact since the 2026-10-23 bar clean-up):
 *   "9:16 · Fit 4:3 · Crop" while the photo's shape doesn't suit the picked model; then "Fitted 4:3 · Undo" or "Cropped 4:3 · Edit · Undo". No chip when the photo already has the shape.
 * - CropPop: a small crop box over the photo (drag it, or arrow keys: 1%, Shift 10%), anchored to the chip; a bottom sheet on phones.
 * - PreflightPop: Generate's popover when it can't run yet: every problem (shared/preflight.ts, the same list as GET /api/tools/:id/preflight),
 *   each with its one-click fix. A bottom sheet on phones (Popover).
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Popover } from '../../shared/Popover';
import { tip } from '../../shared/Tooltip';
import { cropBox, clampBox, nudgeBox, type Box } from '../../../../server/src/shared/photoFit';
import type { PreflightProblem, PreflightFix } from '../../../../server/src/shared/preflight';
import './photoPrep.css';

export type PrepState = { kind: 'fit' | 'crop'; aspect: string; box?: Box } | null;
export function PrepChip({ prep, aspect, shape, busy, onFit, onCrop, onUndo, chipRef }: { prep: PrepState; /** the shape the model needs */ aspect: string; /** the photo's shape now ("9:16") */ shape: string;
  busy?: boolean; onFit: () => void; onCrop: () => void; onUndo: () => void; chipRef?: RefObject<HTMLSpanElement> }) {
  if (prep) return <span ref={chipRef} className="pp-chip pp-done" data-testid="pp-chip" data-state={prep.kind} role="group" aria-label={`${prep.kind === 'fit' ? 'Fitted' : 'Cropped'} to ${prep.aspect}`}>
    <b {...tip(`${prep.kind === 'fit' ? 'Fitted' : 'Cropped'} to ${prep.aspect}: the run uses this version of your photo`)}>{prep.kind === 'fit' ? 'Fitted' : 'Cropped'} {prep.aspect}</b>
    {prep.kind === 'crop' && <button type="button" className="pp-link" data-testid="pp-edit" aria-haspopup="dialog" onClick={onCrop} disabled={busy}>Edit</button>}
    <button type="button" className="pp-link" data-testid="pp-undo" {...tip('Back to your photo as you picked it')} onClick={onUndo} disabled={busy}>Undo</button></span>;
  return <span ref={chipRef} className="pp-chip pp-off" data-testid="pp-chip" data-state="off" role="group" aria-label={`Photo is ${shape}; this model needs ${aspect}`}>
    <span className="pp-why" {...tip(`Your photo is ${shape}. This model keeps your photo’s shape: fit or crop it to ${aspect} first; your photo stays as it is`)}>{shape}</span>
    <button type="button" className="pp-btn" data-testid="pp-fit" aria-label={`Fit to ${aspect}`} onClick={onFit} disabled={busy}>{busy ? 'Fitting…' : `Fit ${aspect}`}</button>
    <button type="button" className="pp-link" data-testid="pp-crop" aria-haspopup="dialog" onClick={onCrop} disabled={busy}>Crop</button></span>;
}

/** The crop box over the photo. Box in photo pixels; the photo is shown at most 300 px tall. */
export function CropPop({ open, anchor, url, size, aspect, initial, onCancel, onDone, watch }: { open: boolean; anchor: RefObject<HTMLElement>; url: string; size: { width: number; height: number } | null; aspect: string;
  initial?: Box | null; onCancel: () => void; onDone: (b: Box) => void; watch?: RefObject<HTMLElement> }) {
  const W = size?.width ?? 0, H = size?.height ?? 0; const [box, setBox] = useState<Box | null>(null); const stage = useRef<HTMLDivElement>(null); const drag = useRef<{ x: number; y: number; b: Box } | null>(null);
  useEffect(() => { if (open && W && H) setBox(initial ? clampBox(initial, W, H) : cropBox(W, H, aspect)); }, [open, W, H, aspect]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!open || !box) return; const t = requestAnimationFrame(() => stage.current?.querySelector<HTMLElement>('.pp-box')?.focus({ preventScroll: true })); return () => cancelAnimationFrame(t); }, [open, !!box]); // eslint-disable-line react-hooks/exhaustive-deps
  const k = W && H ? Math.min(300 / H, 320 / W) : 1; const pct = (b: Box) => `${Math.round(((b.x + b.w / 2) / W) * 100)}% across, ${Math.round(((b.y + b.h / 2) / H) * 100)}% down`;
  const key = (e: React.KeyboardEvent) => { if (!box) return; const m: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (m[e.key]) { e.preventDefault(); setBox(nudgeBox(box, W, H, m[e.key][0], m[e.key][1], e.shiftKey)); } else if (e.key === 'Enter') { e.preventDefault(); onDone(box); } };
  return <Popover open={open} anchor={anchor} avoid={watch} gap={8} onClose={onCancel} label={`Crop to ${aspect}`} testId="pp-crop-pop" className="pp-crop-pop" focusFirst={false}>
    <div className="pp-crop">
      <span className="ic-pop-h">Crop to {aspect}</span>
      {box && W ? <div ref={stage} className="pp-stage" style={{ width: Math.round(W * k), height: Math.round(H * k), backgroundImage: `url("${url}")` }}
        onPointerDown={e => { const r = stage.current!.getBoundingClientRect(); const px = (e.clientX - r.left) / k, py = (e.clientY - r.top) / k;
          const inside = px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h; const b = inside ? box : clampBox({ ...box, x: Math.round(px - box.w / 2), y: Math.round(py - box.h / 2) }, W, H);
          setBox(b); drag.current = { x: e.clientX, y: e.clientY, b }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
        onPointerMove={e => { const d = drag.current; if (!d) return; setBox(clampBox({ ...d.b, x: Math.round(d.b.x + (e.clientX - d.x) / k), y: Math.round(d.b.y + (e.clientY - d.y) / k) }, W, H)); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <div className="pp-box" tabIndex={0} role="group" aria-roledescription="crop area" aria-label={`Crop area, ${aspect}. Arrow keys move it, Shift moves further, Enter crops`} data-testid="pp-box" data-autofocus
          onKeyDown={key} style={{ left: box.x * k, top: box.y * k, width: box.w * k, height: box.h * k }} />
        <span className="sr-only" aria-live="polite">{pct(box)}</span>
      </div> : <p className="pp-load">Loading the photo…</p>}
      <p className="pp-hint">Drag the box, or use the arrow keys. Your photo stays as it is: Undo brings it back.</p>
      <div className="pp-acts"><button type="button" className="btn btn-sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-sm btn-primary" data-testid="pp-crop-done" disabled={!box} onClick={() => box && onDone(box)}>Crop to {aspect}</button></div>
    </div>
  </Popover>;
}

/** Generate's pre-flight list. `run(fix)` does the fix (it may close the popover). Stage words keep the order readable. */
export function PreflightPop({ open, anchor, problems, onClose, run, watch, cover }: { open: boolean; anchor: RefObject<HTMLElement>; problems: PreflightProblem[]; onClose: () => void; run: (f: PreflightFix, p: PreflightProblem) => void; watch?: RefObject<HTMLElement>;
  /** may cover `watch` (a Canvas card): opens next to Generate instead of above the whole card */ cover?: boolean }) {
  const STAGE: Record<string, string> = { inputs: 'Inputs', model: 'Model', setup: 'Setup', money: 'Spending' };
  return <Popover open={open} anchor={anchor} avoid={cover ? undefined : watch} watch={cover ? watch : undefined} placement="top" align="end" gap={8} onClose={onClose} label="Before you generate" testId="pf-pop" className="pf-pop" width={360}>
    <div className="pf" data-testid="pf-list">
      <p className="pf-h"><b>{problems.length === 1 ? 'One thing to fix first' : `${problems.length} things to fix first`}</b></p>
      <ol className="pf-list">{problems.map((p, i) => <li key={`${p.code}-${i}`} className="pf-row" data-testid={`pf-${p.code}`} data-stage={p.stage}>
        <span className="pf-t"><small>{STAGE[p.stage]}</small><span>{p.message}</span></span>
        <span className="pf-fix"><button type="button" className="btn btn-sm btn-primary" data-apop-item data-testid={`pf-fix-${p.code}`} onClick={() => run(p.fix, p)}>{p.fix.label}</button>
          {p.alt && <button type="button" className="btn btn-sm" data-apop-item data-testid={`pf-alt-${p.code}`} onClick={() => run(p.alt!, p)}>{p.alt.label}</button>}</span>
      </li>)}</ol>
    </div>
  </Popover>;
}
