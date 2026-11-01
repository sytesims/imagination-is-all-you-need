import { etaLine, etaRangeOf } from './eta';
/** One quiet helper line with a local run's time range (learned on this computer), near Generate. Renders nothing without a range. */
export function EtaLine({ q, className = '', compact = false, plain = false }: { q: any; className?: string; compact?: boolean; /** a workflow you added: the first-run line without "we" */ plain?: boolean }) {
  const l0 = etaLine(etaRangeOf(q)); if (!l0) return null; const l = plain && l0.kind === 'first_run' ? { ...l0, text: 'The first run is timed, so later runs show an estimate.' } : l0;
  return <p className={`helper eta-line eta-${l.kind}${className ? ' ' + className : ''}`} data-testid="eta-line" data-source={l.kind} title={l.title}>{compact ? l.short : l.text}</p>;
}
