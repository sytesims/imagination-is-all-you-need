/**
 * A Group's header strip (Canvas release 2, step 1; look A1, user decision 2026-11-07): always visible at the top of the box.
 *  - the name: the first step's title until you rename it (double-click it, or select it and press Enter); an empty name goes back to auto;
 *  - how many steps it holds (no "Up to date" / "out of date" state until step 2 can keep it true);
 *  - "Run the flow · $0.57" when its cards are linked: it prices every step through the shared proposal card in the dock (price lock,
 *    board budget, steps with no price listed apart). Nothing runs until Go there. An unlinked Group is just a box: no run button.
 * "Run what changed" and "Save as template" come in later steps; nothing is shown for them yet.
 */
import { memo, useState } from 'react';
import { atom, useBoardApi, useValue, type NodeId } from '../boardApi';
import { useToast } from '../../shared/Toast';
import { tip } from '../../shared/Tooltip';
import { PlayIcon } from '../../ui/Icons';
import { groupFacts, showsRun, stepsWords } from '../groupModel';
import { useFlowPrice } from '../useFlowPrice';
import { titleOf } from '../cardTitle';
import { proposeCards, openDock } from '../flowRun';

export function RunFlow({ id, runIds, steps, name }: { id: NodeId; runIds: NodeId[]; steps: number; name: string }) {
  const board = useBoardApi(); const toast = useToast(); const [busy, setBusy] = useState(false);
  const price = useFlowPrice(board, runIds);
  const allRunning = runIds.length === 0;
  const press = async () => {
    if (busy || allRunning) return; setBusy(true);
    try {
      const r = await proposeCards(runIds, `Run the flow: “${name.slice(0, 60)}”`);
      if (!r.ok) { toast(r.error, 'warn'); return; }
      openDock();
      toast(`${stepsWords(runIds.length)} priced in the AI panel. Nothing runs until you press Go there.`);
    } finally { setBusy(false); }
  };
  const left = steps - runIds.length;
  const hint = allRunning ? 'Every step is running' : `Prices ${runIds.length === steps ? 'every step' : `${runIds.length} of ${steps} steps (${left} running)`} first. Nothing runs until you press Go in the AI panel`;
  return <button type="button" className="cv-gs-run nodrag" data-testid="group-run-flow" data-group={id} disabled={busy || allRunning} onClick={() => void press()} {...tip(hint)}>
    <PlayIcon size={12} /><span>{busy ? 'Pricing…' : allRunning ? 'Running' : 'Run the flow'}</span>
    <b className="cv-gs-price" data-testid="group-run-price" title={price.words ?? undefined}>{allRunning ? '' : !price.parts ? '…' : <>{price.parts.main}
      {price.parts.tail && <><span className="cv-gs-tail">{price.parts.tail}</span><span className="cv-gs-short" aria-hidden>{price.parts.short}</span></>}</>}</b>
  </button>;
}

/** The Group whose name is being typed (Enter on a selected Group starts it; RfBoard's keys). */
export const renameGroupAtom = atom<string | null>('ohf-rename-group', null);

function NameField({ id, name, typed }: { id: NodeId; name: string; typed: boolean }) {
  const board = useBoardApi(); const [local, setLocal] = useState(false);
  const asked = useValue('group rename', () => renameGroupAtom.get() === id, [id]);
  const edit = local || asked;
  const setEdit = (v: boolean) => { setLocal(v); if (!v && renameGroupAtom.get() === id) renameGroupAtom.set(null); };
  const save = (v: string) => { setEdit(false); const next = v.trim().slice(0, 80); if (next === (typed ? name : '')) return; if (!typed && next === name) return;
    board.mark('rename group'); board.patchNode(id, { props: { name: next } }); };
  if (edit) return <input className="cv-gs-input nodrag" data-testid="group-name-input" aria-label="Group name" autoFocus defaultValue={name} maxLength={80}
    onFocus={(e) => e.currentTarget.select()} onBlur={(e) => save(e.currentTarget.value)}
    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEdit(false); }} />;
  return <b className={`cv-gs-name${typed ? '' : ' auto'}`} data-testid="group-name" title={typed ? 'Double-click to rename' : 'Named after its first step. Double-click to rename'}
    onDoubleClick={() => setEdit(true)} data-rename={id}>{name}</b>;
}

export const GroupStrip = memo(function GroupStrip({ id }: { id: NodeId }) {
  const board = useBoardApi();
  const f = useValue('group facts', () => groupFacts(board, id, (n) => titleOf(board, n).title), [board, id]);
  const typed = useValue('group typed name', () => !!String((board.getNode(id)?.props as any)?.name ?? '').trim(), [board, id]);
  const running = f.steps - f.runIds.length;
  return <div className="cv-gstrip" data-testid="group-strip" data-linked={f.linked ? '1' : undefined}>
    <div className="cv-gs-t">
      <NameField id={id} name={f.name} typed={typed} />
      <small data-testid="group-steps">{stepsWords(f.steps)}{running > 0 ? ` · ${running} running` : ''}</small>
    </div>
    {showsRun(f) && <RunFlow id={id} runIds={f.runIds} steps={f.steps} name={f.name} />}
  </div>;
});
