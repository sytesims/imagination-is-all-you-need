import { etaLine, etaRangeOf } from './eta';
/** One quiet helper line with a local run's time range (learned on this computer), near Generate. Renders nothing without a range. */
export function EtaLine({ q, className = '', compact = false }: { q: any; className?: string; compact?: boolean }) {
  const l = etaLine(etaRangeOf(q)); if (!l) return null;
  return <p className={`helper eta-line eta-${l.kind}${className ? ' ' + className : ''}`} data-testid="eta-line" data-source={l.kind} title={l.title}>{compact ? l.short : l.text}</p>;
}
