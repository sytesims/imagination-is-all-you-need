import { dlDone, dlTotal, type Download } from './hardware';

/** The model-download progress bar (styles.css .ls-prog): percent and minutes left. One look for every model download (Local setup, a workflow's needs). */
export function DlProgress({ x, label, bytes = 0 }: { x: Download | null | undefined; /** what's downloading, for screen readers */ label: string; /** size to use until the download reports one */ bytes?: number }) {
  const tot = dlTotal(x) || bytes; const pc = tot ? Math.min(100, Math.floor((dlDone(x) / tot) * 100)) : 0;
  return <span className="ls-prog" data-testid="ls-progress"><span className="bar" role="progressbar" aria-label={`${label} download`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pc}><span style={{ width: `${pc}%` }} /></span><small>{pc}%{x?.etaSeconds ? ` · about ${Math.max(1, Math.round(x.etaSeconds / 60))} min left` : ''}</small></span>;
}
