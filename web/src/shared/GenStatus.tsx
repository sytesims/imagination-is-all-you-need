/**
 * The reason line above Generate (Generate area option A, 2026-11-02): when a run can't start, one short plain reason and at most two
 * actions ("ComfyUI isn’t open on this computer · Set up ComfyUI · Use Comfy Cloud"). Every studio mounts it right before its Generate
 * (DockGenerate does it for its callers), and Generate keeps its label and price, greyed (aria-disabled, described by this line).
 * The words come from shared/genReason.ts reasonOf(), which reads the quote's own pre-flight list (server/src/shared/preflight.ts).
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useSetupKind, openConnectSheet } from './ConnectSheet';
import { useDownloadIntent } from './hardware';
import { modelOfEngine, setRunOn, setupPlacesOf, shownName, type SetupPlace, type ToolModel } from './models';
import { quoteFitOf } from './fit';
import { askConfirm } from './Dialog';
import { TOO_BIG_TEXT } from '../../../server/src/shared/thisComputer';
import { useMemoryShort } from './FitNote';
import { hasFreeLocal } from './KeyNeeded';
import { doSetupPlace, setupNeeded, SetupPop } from './SetupCard';
import { placeActionGo } from '../ui/routing/RunOn';
import { navigate } from '../platform/router';
import { preflightProblems, type PreflightProblem } from '../../../server/src/shared/preflight';
import { reasonOf, type GenAct, type GenReasonSpec } from './genReason';

/* Run anyway (a model too big for this computer's memory): the user's own yes after the warning, per model, until the page reloads */
const anyway = new Set<string>(); const ANYWAY_EVT = 'ohf:run-anyway';
function useRunAnyway(engine: string | null | undefined): boolean {
  const [, tick] = useState(0); useEffect(() => { const f = () => tick(n => n + 1); addEventListener(ANYWAY_EVT, f); return () => removeEventListener(ANYWAY_EVT, f); }, []);
  return !!engine && anyway.has(engine);
}

export interface GenReason extends GenReasonSpec { id: string; toolId: string; model: ToolModel | undefined; engine: string | null; quote: any; places: SetupPlace[]; onDetails?: () => void }

/** What stops this run, or null. One call per Generate; pass the result to <GenStatus> and to the button (blocks → aria-disabled). */
export function useGenReason({ toolId, engine, quote, onDetails, noPlace, problems: given, mem: memOn = true }: { toolId: string; engine?: string | null; quote: any;
  /** the caller's own pre-flight list when it adds to the quote's (Create Image: a saved place that's off) */ problems?: PreflightProblem[];
  /** opens the caller's "Before you generate" list (a refused model, no price) */ onDetails?: () => void;
  /** the model has no place to run at all (no quote, no default route) */ noPlace?: boolean;
  /** check a heavy local run against this computer's memory */ mem?: boolean }): GenReason | null {
  const id = `gs${useId().replace(/:/g, '')}`; const sk = useSetupKind(); const intent = useDownloadIntent(engine ?? null);
  const memShort = useMemoryShort(memOn ? quote : null); const accepted = useRunAnyway(engine);
  const model = modelOfEngine(toolId, engine);
  /* a download the user already said yes to isn't a blocker: the next run fetches the files first */
  const chosen = !!intent && !!engine && quote?.setup?.action === 'download';
  const problems = given ?? preflightProblems({ quote: chosen ? null : quote, freeLocal: hasFreeLocal(toolId), modelName: model ? shownName(model) : null });
  const places = setupNeeded(model, quote, engine, intent) ? setupPlacesOf(model, quote) : [];
  /* the route's own fit says it's too big for this computer's memory (requirements.ts), or the free-memory check now says short */
  const fit = quoteFitOf(quote); const local = quote?.routeKind === 'local' || /^local:/.test(String(quote?.route ?? quote?.routeId ?? ''));
  const fitBig = memOn && local && String(fit?.reason ?? '').startsWith(TOO_BIG_TEXT);
  const mem = memShort ? { text: memShort.text, block: memShort.block, accepted } : fitBig ? { text: String(fit!.reason), block: true, accepted } : null;
  const spec = reasonOf({ setupKind: sk, problems, places, mem, noPlace, noConnection: quote?.code === 'no_connection', canDetails: !!onDetails });
  return spec ? { ...spec, id, toolId, model, engine: engine ?? null, quote, places, onDetails } : null;
}

/** A studio's own can't-run reason with its one step, in the same line (3D Turntable: "Make a 3D model first" · Image to 3D). */
export function useOwnReason(on: boolean, code: string, reason: string, act: { label: string; run: () => void }): GenReason | null {
  const id = `gs${useId().replace(/:/g, '')}`;
  return on ? { code, reason, blocks: true, primary: { kind: 'details', label: act.label }, alt: null, id, toolId: '', model: undefined, engine: null, quote: null, places: [], onDetails: act.run } : null;
}
/** Generate's props while a reason blocks it: greyed, still focusable, described by the line; a click moves focus to the line's first action. */
export function blockedProps(r: GenReason | null) {
  if (!r?.blocks) return {};
  return { 'aria-disabled': true as const, 'aria-describedby': `${r.id}-t`, 'data-blocked': r.code, title: r.reason };
}
/** Call first in Generate's onClick: true = blocked (nothing runs; focus goes to the reason line's action). */
export function genBlocked(r: GenReason | null): boolean {
  if (!r?.blocks) return false;
  try { (document.getElementById(r.id)?.querySelector<HTMLElement>('button') ?? null)?.focus(); } catch { /* ignore */ }
  return true;
}

/** Runs one action of the line (also the Canvas pill's click, which has no line). */
export async function runGenAct(r: GenReason, a: GenAct, openMore?: () => void): Promise<void> {
  if (a.kind === 'connect') { openConnectSheet(); return; }
  if (a.kind === 'settings') { navigate('/settings#connections'); return; }
  if (a.kind === 'details') { r.onDetails?.(); return; }
  if (a.kind === 'more') { if (openMore) openMore(); else navigate('/settings#connections'); return; }
  if (a.kind === 'cloud') { const p = r.places.find(x => x.runOn === 'comfy-cloud');
    if (p) await doSetupPlace(r.toolId, r.model, r.engine, p);
    else if (r.model?.runsOn.some(x => x.id === 'comfy-cloud')) await setRunOn(r.toolId, r.model.key, 'comfy-cloud'); /* the quote then says the price (or that it needs a key) */
    else await placeActionGo({ action: 'add_key', runOn: 'comfy-cloud' }, r.engine); return; }
  if (a.kind === 'anyway') {
    const yes = await askConfirm({ title: 'Run it on this computer anyway?', body: ['This model needs more memory than this computer has free.', 'Your computer can freeze while it runs. Save your work and close other apps first.'], confirm: 'Run anyway', danger: true });
    if (!yes || !r.engine) return; anyway.add(r.engine); dispatchEvent(new Event(ANYWAY_EVT));
    requestAnimationFrame(() => { const b = document.getElementById(r.id)?.nextElementSibling; if (b instanceof HTMLElement) b.focus(); }); return; }
  /* fix: the problem's own step, at the place it names */
  const runOn = String(r.problem?.fix.args?.runOn ?? ''); const p = r.places.find(x => x.runOn === runOn) ?? r.places[0];
  if (p) { await doSetupPlace(r.toolId, r.model, r.engine, p); return; }
  const action = ({ 'add-key': 'add_key', download: 'download', 'turn-on': 'turn_on', 'install-node': 'install_node' } as Record<string, string>)[String(r.problem?.fix.kind)];
  if (action) await placeActionGo({ action, runOn: runOn || 'comfy-cloud', missingBytes: Number(r.problem?.fix.args?.bytes) || null }, r.engine); else r.onDetails?.();
}

export function GenStatus({ r, className = '' }: { r: GenReason | null; className?: string }) {
  const altRef = useRef<HTMLButtonElement>(null); const priRef = useRef<HTMLButtonElement>(null);
  const [more, setMore] = useState<'pri' | 'alt' | ''>(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  if (!r) return null;
  const act = (a: GenAct, which: 'pri' | 'alt') => async () => { if (busy) return; setErr(''); setBusy(true);
    try { await runGenAct(r, a, () => setMore(which)); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  return <div id={r.id} className={`gen-status${r.blocks ? '' : ' gen-status-note'} ${className}`.trim()} data-testid="gen-status" data-code={r.code}>
    <p className="gs-t"><i className="gs-dot" aria-hidden /><span id={`${r.id}-t`} className="gs-why" title={r.reason}>{err || r.reason}</span></p>
    {(r.primary || r.alt) && <span className="gs-acts">
      {r.primary && <button ref={priRef} type="button" className="gs-pri" data-testid="gen-status-primary" data-act={r.primary.kind} aria-busy={busy || undefined} aria-expanded={r.primary.kind === 'more' ? more === 'pri' : undefined} onClick={act(r.primary, 'pri')}>{r.primary.label}</button>}
      {r.alt && <button ref={altRef} type="button" className="gs-alt" data-testid="gen-status-alt" data-act={r.alt.kind} aria-expanded={r.alt.kind === 'more' ? more === 'alt' : undefined} onClick={act(r.alt, 'alt')}>{r.alt.label}</button>}
    </span>}
    {r.places.length > 0 && <SetupPop open={!!more} anchor={more === 'pri' ? priRef : altRef} onClose={() => setMore('')} toolId={r.toolId} model={r.model} engine={r.engine} quote={r.quote} />}
  </div>;
}
