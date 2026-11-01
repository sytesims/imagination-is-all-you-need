import { useRef, useState } from 'react';
import { Popover } from './Popover';
import { InfoIcon } from '../ui/Icons';
import { demoMessage } from './quote';
import { etaLine, etaRangeOf } from './eta';
import { demoRealCredits } from './DemoPrice';
import { useBilling, modeOf, costShort, costTitle, demoRealText, fmtUsd, RULE_TEXT, ledgerUsd, type Cost } from './billing';
/** CostNote: the one calm line under every Generate button. The main fact (demo / local / where it's billed) and, for a clip that isn't
 *  loaded yet, what the estimate assumes ('Estimated for 8 s. Updates when your clip loads.'), so a later 447 → 335 isn't a surprise.
 *  The button already shows the price token, so the number is NOT repeated here; the details (real-run price, where it's billed, the
 *  failure rule, the estimate's assumptions) sit behind an info button in the shared Popover. Missing inputs are not listed here: they're
 *  the disabled Generate state and its reason popover. Renders nothing when there's nothing to say. */
const art = (n: any) => /^(8|11|18)(\D|$)/.test(String(n)) ? 'an' : 'a';
export function estimateWords(q: any): { short: string; long: string } | null {
  if (!q?.estimated) return null; const sec = q?.assumedSeconds;
  const m0 = typeof q?.estimateMessage === 'string' ? q.estimateMessage.trim() : '';
  if (q?.estimateReason === 'billed_cap' && Number(q?.capSeconds) > 0) return { short: `Priced at up to ${q.capSeconds}\u00a0s.`, long: m0 || `Priced at up to ${q.capSeconds} s, whatever your clip's length.` }; /* P3-02: a model with no length field (Seed Audio) bills up to its cap; it doesn't follow the clip */ const sz = q?.assumedSize, out = q?.assumedOutputSize, sc = q?.assumedScale;
  const okSz = (x: any) => x && Number(x.width) > 0 && Number(x.height) > 0;
  if (sec) return { short: `Estimated for ${sec}\u00a0s. Updates when your clip loads.`,
    long: `Estimated for ${art(sec)} ${sec} s ${okSz(sz) ? `${Math.min(sz.width, sz.height)}p ` : ''}clip${sc ? ` at ${sc}×` : ''}${okSz(out) ? `, ${out.width}×${out.height} out` : ''}. The price follows your clip's length and updates once it loads.` };
  const m = typeof q?.estimateMessage === 'string' ? q.estimateMessage.trim() : ''; return m ? { short: 'Estimated price. Updates when your clip loads.', long: m } : null;
}
export function CostNote({ q, className = '', testId }: { q: any; className?: string; testId?: string }) {
  const b = useBilling(); const own = modeOf(b, q) === 'own-accounts'; const cost: Cost | null = q?.cost && typeof q.cost === 'object' ? q.cost : null;
  const [open, setOpen] = useState(false); const iRef = useRef<HTMLButtonElement>(null);
  if (!q) return null;
  const demo = q.demo === true; const est = estimateWords(q);
  const local = !demo && ((cost && cost.billedTo === 'local') || q.localRun === true);
  const n = demo ? demoRealCredits(q) : null;
  const real = demo ? (own ? demoRealText(cost, b?.comfyCreditsPerUsd) ?? (n != null ? `≈ ${fmtUsd(n / 100)}` : null) : n != null ? ledgerUsd(n) : null) : null;
  const eta = local ? etaLine(etaRangeOf(q)) : null; // step-ETA: this computer's range for a local run
  const main = demo ? 'Sample output, nothing billed.' : local ? `Runs locally, nothing billed.${eta ? ` ${eta.short.replace(/ · Local$/, '')}.` : ''}` : own && cost ? (cost.unconfirmed ? `About ${fmtUsd(cost.estUsd)} (estimate): no published price yet. The real cost is recorded after the run.` : `Estimate, billed to your ${cost.billedToName} account.`) : null;
  if (!main && !est) return null;
  const details: { k: string; v: string; tid?: string }[] = [];
  if (demo) details.push({ k: 'Sample', v: demoMessage(q) ?? 'Sample output, nothing billed.' });
  if (demo && real) details.push({ k: 'Real run', v: `${real}${own && cost?.billedToName ? ` on ${cost.billedToName}` : ''} once a key is added.`, tid: 'demo-list' });
  if (!demo && own && cost && !local) details.push({ k: 'Cost', v: `${costShort(cost)}. ${costTitle(cost)}` });
  if (!demo && own && cost && !local && cost.failureRule) details.push({ k: 'If it fails', v: RULE_TEXT[cost.failureRule] ?? cost.failureNote });
  if (est) details.push({ k: 'Estimate', v: est.long });
  return <div className={`cost-note demo-note${className ? ' ' + className : ''}`} role="status" data-testid={testId ?? (demo ? 'demo-note' : 'cost-note')}>
    <span className="cn-t">{main && <span data-testid={demo ? 'demo-price' : undefined}>{main}</span>}{est && <> <span data-testid="price-estimate">{est.short}</span></>}</span>
    {details.length > 0 && <button ref={iRef} type="button" className="cn-i" aria-label="Price details" aria-expanded={open} title="Price details" onClick={() => setOpen(o => !o)}><InfoIcon size={16} /></button>}
    <Popover open={open} anchor={iRef} onClose={() => setOpen(false)} label="Price details" role="dialog" placement="top" align="end" className="cn-pop" closeButton={false}>
      <dl className="cn-dl">{details.map(d => <div key={d.k} data-testid={d.tid}><dt>{d.k}</dt><dd>{d.v}</dd></div>)}</dl>
      {q?.assumedOutputSize && <span hidden data-testid="est-output">{`${q.assumedOutputSize.width}x${q.assumedOutputSize.height}`}</span>}
    </Popover>
  </div>;
}
