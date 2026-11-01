/**
 * Cost receipt chip (2026-10-26): the one look for the receipt line (shared/shareReceipt.ts) in the share sheet and the result viewer.
 * "≈ $0.32 · Kling 3.0 · Comfy Router · 41 s": the cost first in orange, then the real model, where it ran and how long it took.
 * JobReceipt works it out from a job (the viewer); ReceiptChip draws one the caller already has (the share sheet).
 */
import { useMemo } from 'react';
import { shareReceipt, type Receipt } from '../../../server/src/shared/shareReceipt';
import { tip } from './Tooltip';
import './receipt.css';

const TIPS: Partial<Record<Receipt['kind'], string>> = {
  estimate: 'An estimate from the list price (≈). The provider’s bill is the real figure.',
  actual: 'The cost the provider reported for this run.',
  local: 'Ran on your computer: nothing was billed.',
  sample: 'A sample: nothing was generated or billed.',
};
export function ReceiptChip({ receipt, off, testId = 'receipt-chip', label }: { receipt: Receipt; off?: boolean; testId?: string; label?: string }) {
  const rest = [receipt.model, receipt.kind === 'sample' ? null : receipt.place, receipt.time].filter(Boolean) as string[];
  return <p className={`rcpt${off ? ' is-off' : ''}`} data-testid={testId} data-kind={receipt.kind} aria-label={`${label ?? 'Cost receipt'}: ${receipt.text}`} {...tip(TIPS[receipt.kind] ?? null)}>
    <ReceiptGlyph />{receipt.cost && <b className="rcpt-cost">{receipt.cost}</b>}{rest.map((x, i) => <span key={i} className="rcpt-part">{x}</span>)}</p>;
}
/** The receipt of a finished job, or nothing when no part of it is known. `model`: the name the caller already shows. */
export function JobReceipt({ job, model }: { job: any; model?: string | null }) {
  const r = useMemo(() => (job?.status && job.status !== 'done' ? null : shareReceipt(job, { model: model ?? job?.modelName ?? null })), [job, model]);
  return r ? <div className="rcpt-row" data-testid="rvx-receipt"><span className="rcpt-h">What sharing says</span><ReceiptChip receipt={r} testId="rvx-receipt-chip" /></div> : null;
}
const ReceiptGlyph = () => <svg className="rcpt-ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
  <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>;
