import { GenPrice } from '../../shared/GenPrice';
import { useGenState } from '../edge/Edge';
import { missingText } from '../../shared/missing';
import { nudgeMissing } from '../../shared/genNudge';
import { useRef } from 'react';
import { humanWhy, GEN_WHY_EVT } from '../../shared/GenWhy';
import { priceTitle } from '../../shared/GenPrice';
import { useBilling } from '../../shared/billing';
import { useOpenOnlyBlock } from '../../shared/openOnlyGate';
/** #6 Generate: label + live price (B16: the price stays, muted, while disabled; no price when the caller has none to charge). */
export default function GenerateButton({ label = 'Generate', ready, price, free, demoQ, quote, busy, onClick, missing = [], calls = 1, why, soft }: { /** the live quote: own-accounts mode prices it as the real cost and where it's billed */ quote?: any; /** R1: soft = only inputs are missing: stays bright, a click points at what's missing */ soft?: boolean; /** a demo quote: the short demo price instead of credits */ demoQ?: any; /** B19: the server's reason as the tooltip (local_off, input block) instead of 'Missing: …' */ why?: string | null; calls?: number; label?: string; ready: boolean; price?: number | null; free?: boolean; busy?: boolean; onClick: () => void; missing?: string[] }) {
  const g = useGenState(); const b = useRef<HTMLButtonElement>(null); const bill = useBilling(); const ow = useOpenOnlyBlock();
  const spin = !!busy || g.submitting;
  /* can't run: stays focusable (aria-disabled) so a click or keyboard focus can say why (GenWhy). Only a run in flight uses real disabled.
     soft = only inputs are missing (the 'needs input' look; a click also points at the empty field); otherwise the grey 'off' look. */
  const off = !spin && (!ready || !!g.block || !!ow); const wait = off && !!soft && !g.block;
  const whyTxt = !off ? '' : g.block || ow || why || (missing.length ? humanWhy(missingText(missing)) : '') || 'This can’t run as set yet.';
  const tip = whyTxt || priceTitle(demoQ ?? quote, bill, { demo: !!demoQ, free, credits: price, calls }) || '';
  return (
    <button ref={b} className={`btn btn-primary gen-btn ${ready && !off ? 'ready' : ''}${wait ? ' gen-wait' : off ? ' gen-off' : ''}`} disabled={spin} aria-disabled={off || undefined} aria-busy={spin || undefined}
      onClick={off ? () => { if (wait) nudgeMissing(b.current); else window.dispatchEvent(new CustomEvent(GEN_WHY_EVT, { detail: b.current })); } : onClick} data-why={whyTxt || undefined} title={tip}>
      <span className="gen-l">{spin ? <i className="as-spin" aria-hidden /> : null}{spin ? 'Generating…' : ow ? 'Not available' : g.label ?? label}</span>
      {/* B16: the cost stays visible (muted) while Generate is disabled; callers pass price=null when there is no chargeable price */}
      {!ow && <GenPrice q={demoQ ?? quote} demo={!!demoQ} free={free} credits={price} calls={calls} />}
    </button>
  );
}
