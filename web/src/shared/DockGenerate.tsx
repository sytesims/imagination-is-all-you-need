/**
 * The dock's Generate button for a quoted run (2026-10-24, moved out of ui/next/ImageCanvas.tsx's workflow branch so Create Image and the
 * Canvas bar draw the same button): the label, then ONE second line that is either the first missing step ("Add a photo", from the
 * pre-flight list) or the price token (shared GenPrice: Sample / Free · Local / ≈ $0.04 / Price unavailable / the download size).
 * A model that still needs setting up turns the button into the next setup step (shared SetupGenerate). With problems, a click opens the
 * pre-flight list (the caller's onClick decides); nothing ever runs from here without the caller's onClick.
 */
import type { RefObject } from 'react';
import { useMemoryShort } from './FitNote';
import { gbOf } from '../../../server/src/shared/thisComputer';
import { GenPrice } from './GenPrice';
import { shownCredits, isPlainBlock } from './quote';
import { SetupGenerate, setupNeeded } from './SetupCard';
import { modelOfEngine } from './models';
import { intentLine } from './presetBar';
import { LOCAL_LABEL } from '../../../server/src/shared/modelIds';
import type { PreflightProblem } from '../../../server/src/shared/preflight';

/** Generate's two-line space: short words for problems past the inputs (the pre-flight list says them in full). */
export const PF_SHORT: Record<string, (p: PreflightProblem) => string> = { needs_key: () => 'Add a key first', needs_download: p => p.fix.label, needs_gpu: () => `Turn on ${LOCAL_LABEL}`, needs_node: () => 'Install the node',
  needs_setup: p => p.fix.label, model_cant_run: p => /\b((?:Pick|Trim) [^.]{3,40})\.?$/.exec(p.message)?.[1] ?? 'Pick another model' /* the route's own fix when it names one ("Trim it to 15 s or less": H3 speech) */, price_unavailable: () => 'Price unavailable', photo_shape: p => p.fix.label.replace(/^Fit/, 'Fit photo'), too_many_images: p => p.message };

/** The first missing step in Generate's words: the caller's own word first, else the first pre-flight problem. */
export const leadOf = (problems: PreflightProblem[], missing?: string | null): string | null =>
  missing ?? (problems[0] ? PF_SHORT[problems[0].code]?.(problems[0]) ?? problems[0].message : null);

export function DockGenerate({ toolId, engine, quote, setupTarget, label, busy, disabled, problems, missing, pfOpen, genRef, onClick, intent, dlSize, testId = 'ic-generate', priceTestId = 'ic-price', workflowId, className = '', variant = 'dock' }: {
  toolId: string; engine: string; quote: any; label: string; setupTarget?: { toolId: string; engine: string };
  /** a submit in flight: spinner, no second click */ busy: boolean; /** nothing can run at all (the tool isn't loaded) */ disabled?: boolean;
  problems: PreflightProblem[]; /** the caller's own first missing step (wins over the list) */ missing?: string | null;
  pfOpen: boolean; genRef: RefObject<HTMLButtonElement>; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** a download the user already said yes to (shared/hardware useDownloadIntent) and its size line */ intent?: unknown; dlSize?: string | null;
  testId?: string; priceTestId?: string; workflowId?: string; className?: string;
  /** 'dock': the bar's big two-line button; 'card': a one-line button on a Canvas card; 'node': the Canvas node's slim pill */ variant?: 'dock' | 'card' | 'node' }) {
  const base = variant === 'dock' ? 'ic-gen gen-btn gen-dock btn btn-primary' : variant === 'node' ? 'gen-btn gen-card gen-node' : 'gen-btn gen-card';
  const cr: number | null = quote ? shownCredits(quote) : null; const wKey = !!quote && quote.needsKey === true && quote.runnable === false; const unpriced = !!quote && quote.credits == null && quote.priceAvailable === false;
  const setupTool = setupTarget?.toolId ?? toolId; const setupEngine = setupTarget?.engine ?? engine;
  const m = modelOfEngine(setupTool, setupEngine); const mem = useMemoryShort(variant === 'dock' ? quote : null); // a heavy local run with memory short right now: said, never blocked
  if (!busy && setupNeeded(m, quote, setupEngine, intent) && !problems.some(x => x.stage === 'inputs' || x.stage === 'model'))
    return <SetupGenerate toolId={setupTool} model={m} engine={setupEngine} quote={quote} className={`${base} ${className}`.trim()} testId={testId} priceTestId={priceTestId} />;
  const lead = leadOf(problems, missing);
  return <button ref={genRef} type="button" className={`${base}${problems.length ? ' gen-wait' : ''} ${className}`.trim()} data-testid={testId} data-workflow={workflowId} data-problems={problems.length || undefined}
    disabled={busy || !!disabled} aria-disabled={problems.length > 0 || undefined} aria-haspopup={problems.length ? 'dialog' : undefined} aria-expanded={problems.length ? pfOpen : undefined} onClick={onClick}
    title={pfOpen ? undefined : lead ?? (mem ? `${mem.text} Or pick Comfy Cloud in the run menu.` : undefined)} data-mem-short={mem ? '1' : undefined}><span className="gen-l">{busy ? <i className="as-spin" aria-hidden /> : null}{label}</span>
    {lead ? <span className="gen-price gen-missing" data-testid={priceTestId}>{lead}</span> : mem ? <span className="gen-price gen-mem" data-testid={priceTestId} data-mem="short">Free · only {gbOf(mem.freeGB * 2 ** 30)} free now, needs ~{Math.round(mem.needGB)} GB</span> : <GenPrice compact testId={priceTestId} q={quote} demo={!wKey && quote?.demo === true} text={unpriced ? (isPlainBlock(quote) ? '' : 'Price unavailable') /* a plain refusal says its own words (the pre-flight list), never 'Price unavailable' */ : dlSize ? intentLine(dlSize) : null} free={!wKey && cr === 0} credits={wKey ? null : cr} />}</button>;
}
