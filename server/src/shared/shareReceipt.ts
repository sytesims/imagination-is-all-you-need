/**
 * Cost receipt (2026-10-26): one honest line about what a result really took, added to what people share (caption, recipe link, link card,
 * an optional corner tag burned into the file) and shown as a chip in the result viewer.
 *   "Made free on my Mac · LTX-2.5 22B · 8 min"      a local run (nothing billed; "my Mac" / "my RTX 4090" / "my computer")
 *   "$0.32 · Kling 3.0 · Comfy Router · 41 s"         the provider reported the real cost
 *   "≈ $0.32 · Kling 3.0 · Comfy Router · 41 s"       our estimate (list price × the job's units), never shown as exact
 *   "Sample, nothing billed · LTX-2.5 22B"            a sample / preview run: no price, no time
 * Never invents a number: a part that isn't known is left out. Pure (no DOM, no Node APIs): the web app and the server tests import it.
 * Inputs are the job as GET /api/jobs/:id returns it (pub + spend); the model name comes from the caller's own naming helper.
 */
import { jobTiming, durationText } from './jobTiming.js';
import { fmtUsd } from './runCost.js';

export interface ReceiptJob {
  status?: string | null; runOn?: string | null; runOnLabel?: string | null; place?: { runOn?: string | null; label?: string | null } | null;
  /** ✦ credits, 1 = $0.01 (the server's USD × 100) */ cost?: number | null; actualUsd?: number | null;
  spend?: { billedTo?: string | null; estUsd?: number | null; actualUsd?: number | null; demo?: boolean; simulated?: boolean } | null;
  isSample?: boolean; demo?: boolean; simulated?: boolean; machine?: string | null;
  createdAt?: number | null; startedAt?: number | null; renderStartedAt?: number | null; finishedAt?: number | null;
}
/** local: free on this computer · actual: the provider's own figure · estimate: ours (≈) · free: a hosted run that cost nothing · sample: nothing ran · unknown: no figure */
export type ReceiptCostKind = 'local' | 'actual' | 'estimate' | 'free' | 'sample' | 'unknown';
export interface Receipt { kind: ReceiptCostKind; cost: string | null; model: string | null; place: string | null; time: string | null; text: string }

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
/** Always "my computer" (copy wave 1): a share never names the brand of computer or its graphics card. `machine` is kept for callers. */
export function machineWords(_machine: unknown): string { return 'my computer'; }
/** Where a hosted run ran, shortest form: 'Comfy · Comfy Router' → 'Comfy Cloud' (Router and Cloud bill the same Comfy account); 'fal' → 'fal'. */
export const placeWords = (label: unknown): string | null => { const s = typeof label === 'string' ? label.trim() : ''; if (!s) return null; const parts = s.split('·').map((x) => x.trim()).filter(Boolean); const w = parts[parts.length - 1] ?? null; return w && /^comfy( router| cloud)?$/i.test(w) ? 'Comfy Cloud' : w; };

export function shareReceipt(j: ReceiptJob | null | undefined, o: { model?: string | null } = {}): Receipt | null {
  if (!j) return null;
  const model = (o.model ?? '').trim() || null;
  const runOn = j.place?.runOn ?? j.runOn ?? null; const sp = j.spend ?? null;
  const local = runOn === 'local' || sp?.billedTo === 'local';
  const actual = num(j.actualUsd) ?? num(sp?.actualUsd);
  const sample = actual == null && !!(j.isSample || j.demo || j.simulated || sp?.demo || sp?.simulated);
  const done = !j.status || j.status === 'done';
  const time = done && !sample ? durationText(jobTiming(j).renderMs) || null : null;
  const est = num(sp?.estUsd) ?? (num(j.cost) != null ? num(j.cost)! / 100 : null);
  let kind: ReceiptCostKind; let cost: string | null;
  if (sample) { kind = 'sample'; cost = 'Sample, nothing billed'; }
  else if (local && !(actual && actual > 0)) { kind = 'local'; cost = `Made free on ${machineWords(j.machine)}`; }
  else if (actual != null) { kind = actual > 0 ? 'actual' : 'free'; cost = actual > 0 ? fmtUsd(actual) : 'Free'; }
  else if (est != null && est > 0) { kind = 'estimate'; cost = `≈ ${fmtUsd(est)}`; }
  else if (est === 0) { kind = 'free'; cost = 'Free'; }
  else { kind = 'unknown'; cost = null; }
  const place = local ? null : placeWords(j.place?.label ?? j.runOnLabel);
  const parts = [cost, model, kind === 'sample' ? null : place, time].filter((x): x is string => !!x);
  if (!parts.length) return null;
  return { kind, cost, model, place, time, text: parts.join(' · ') };
}
/** The receipt without the model, for places that already name it (the link card's MODEL row): "≈ $0.32 · Comfy Router · 41 s". */
export const receiptFacts = (r: Receipt | null): string | null => (r ? [r.cost, r.kind === 'sample' ? null : r.place, r.time].filter(Boolean).join(' · ') || null : null);
/** Longest receipt that travels (a recipe link, a caption line). */
export const MAX_RECEIPT = 140;
/** A receipt read back from its text (a recipe link carries only the line): the cost part is recognised by its words, the rest stays as
 *  plain parts in order. Text only, never trusted for anything but display. */
export function receiptFromText(text: unknown): Receipt | null {
  const t = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, MAX_RECEIPT) : ''; if (!t) return null;
  const parts = t.split(' · ').map((x) => x.trim()).filter(Boolean); const first = parts[0] ?? '';
  const kind: ReceiptCostKind = /^Made free on /.test(first) ? 'local' : /^≈ \$/.test(first) ? 'estimate' : /^\$\d/.test(first) ? 'actual' : /^Free$/.test(first) ? 'free' : /^Sample\b/.test(first) ? 'sample' : 'unknown';
  const cost = kind === 'unknown' ? null : first; const rest = kind === 'unknown' ? parts : parts.slice(1);
  const time = rest.length && /^\d+(\.\d+)? (s|min|h)\b/.test(rest[rest.length - 1]) ? rest[rest.length - 1] : null; const mid = time ? rest.slice(0, -1) : rest;
  return { kind, cost, model: mid[0] ?? null, place: mid.slice(1).join(' · ') || null, time, text: t };
}
