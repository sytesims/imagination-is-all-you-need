/**
 * The dock's Generate button for a quoted run (2026-10-24, moved out of ui/next/ImageCanvas.tsx's workflow branch so Create Image and the
 * Canvas bar draw the same button): the label, then ONE second line, always the price token (shared GenPrice: Sample / Free · Local /
 * ≈ $0.04 / Price unavailable / the download size). Never a reason (Generate area option A, 2026-11-02): when the run can't start, the shared
 * reason line (GenStatus) sits right before the button and says why, with its step; the button is greyed and a click goes to that step.
 * Only an input missing (a prompt, a photo) keeps the button's own waiting click (the caller's onClick nudges it or opens its list).
 * On a Canvas node (no room for a line) the reason is the tooltip and a click runs its step.
 */
import type { RefObject } from 'react';
import { GenPrice } from './GenPrice';
import { shownCredits, isPlainBlock } from './quote';
import { intentLine } from './presetBar';
import type { PreflightProblem } from '../../../server/src/shared/preflight';
import { GenStatus, useGenReason, blockedProps, genBlocked, runGenAct } from './GenStatus';

export function DockGenerate({ toolId, engine, quote, setupTarget, label, busy, disabled, problems, missing, pfOpen, genRef, onClick, dlSize, testId = 'ic-generate', priceTestId = 'ic-price', workflowId, className = '', variant = 'dock', onDetails, noPlace }: {
  toolId: string; engine: string; quote: any; label: string; setupTarget?: { toolId: string; engine: string };
  /** a submit in flight: spinner, no second click */ busy: boolean; /** nothing can run at all (the tool isn't loaded) */ disabled?: boolean;
  problems: PreflightProblem[]; /** the caller's own first missing step (the tooltip; the click nudges it) */ missing?: string | null;
  pfOpen: boolean; genRef: RefObject<HTMLButtonElement>; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** a download the user already said yes to: its size line ("Free · downloads 12 GB first") */ dlSize?: string | null;
  testId?: string; priceTestId?: string; workflowId?: string; className?: string;
  /** opens the caller's "Before you generate" list (the reason line's "See what to fix") */ onDetails?: () => void; /** the model has no place to run at all */ noPlace?: boolean;
  /** 'dock': the bar's big two-line button; 'card': a one-line button (Film); 'node': the Canvas node's slim pill */ variant?: 'dock' | 'card' | 'node' }) {
  const base = variant === 'dock' ? 'ic-gen gen-btn gen-dock btn btn-primary' : variant === 'node' ? 'gen-btn gen-card gen-node' : 'gen-btn gen-card';
  const cr: number | null = quote ? shownCredits(quote) : null; const wKey = !!quote && quote.needsKey === true && quote.runnable === false; const unpriced = !!quote && quote.credits == null && quote.priceAvailable === false;
  const r = useGenReason({ toolId: setupTarget?.toolId ?? toolId, engine: setupTarget?.engine ?? engine, quote, onDetails, noPlace, mem: variant === 'dock' });
  const blocked = !busy && !!r?.blocks;
  const lead = missing ?? problems[0]?.message ?? null;
  /* waiting (A1, 2026-10-31): a pre-flight problem OR the caller's own missing step is the one shared waiting look (ui-states.css .gen-wait) */
  const waiting = problems.length > 0 || !!missing;
  const click = (e: React.MouseEvent<HTMLButtonElement>) => { if (blocked) { if (variant === 'node' && r?.primary) void runGenAct(r, r.primary); else genBlocked(r); return; } onClick(e); };
  const btn = <button ref={genRef} type="button" className={`${base}${waiting ? ' gen-wait' : ''} ${className}`.trim()} data-testid={testId} data-workflow={workflowId} data-problems={problems.length || undefined}
    disabled={busy || !!disabled} aria-disabled={waiting || undefined} aria-haspopup={problems.length && !blocked ? 'dialog' : undefined} aria-expanded={problems.length && !blocked ? pfOpen : undefined}
    title={pfOpen ? undefined : lead ?? (r && !r.blocks ? r.reason : undefined)} {...(blocked ? blockedProps(r) : {})} onClick={click}><span className="gen-l">{busy ? <i className="as-spin" aria-hidden /> : null}{label}</span>
    <GenPrice compact testId={priceTestId} q={quote} demo={!wKey && quote?.demo === true} text={unpriced ? (isPlainBlock(quote) ? '' : 'Price unavailable') /* a plain refusal says its own words (the reason line), never 'Price unavailable' */ : dlSize ? intentLine(dlSize) : null} free={!wKey && cr === 0} credits={wKey ? null : cr} /></button>;
  return variant === 'node' ? btn : <><GenStatus r={r} />{btn}</>;
}
