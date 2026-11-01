import { useRef, useState } from 'react';
import type { ToolInfo } from '../../api';
import { useModels } from '../../shared/batch1';
import { ModelMenu } from '../../shared/ModelMenu';
import { useToolModels, modelOfEngine, shownName } from '../../shared/models';
/** Current model + "Change" on a one-engine tool page (Workspace) → THE model menu (shared/ModelMenu.tsx: search, All · Local · Comfy ·
 *  Your keys, the preview card), the same one every other picker uses (2026-10-26). useModels keeps ?model= in sync for deep links. */
export default function ModelButton({ tool }: { tool: ToolInfo }) {
  const m = useModels(tool.id); useToolModels(tool.id); const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(() => new URLSearchParams(location.search).get('picker') === 'models');
  /* a workflow you added runs its own graph: its main model in plain words, and nothing to change */
  if (tool.plugin?.user) return <div className="model-btn model-btn-static" data-testid="ws-model-btn"><span className="model-k">Model</span><b title={tool.plugin.mainModel ? undefined : 'The models this workflow loads are listed under Needs'}>{tool.plugin.mainModel || 'Your workflow'}</b></div>;
  if (!m.loaded) return <span className="model-btn model-btn-ph" aria-hidden />;
  if (!m.models.length) return null;
  const value = m.selected?.id ?? tool.providers[0]?.id ?? ''; const tm = modelOfEngine(tool.id, value);
  return <>
    <button ref={btn} type="button" className="model-btn" data-testid="ws-model-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}>
      <span className="model-k">Model</span><b>{tm ? shownName(tm) : m.selected?.name ?? 'Default'}</b><span className="model-change">Change</span></button>
    <ModelMenu open={open} anchor={btn} onClose={() => setOpen(false)} toolId={tool.id} value={value} testId="ws-model-list" rowTestId={id => `ws-model-${id}`}
      items={tool.providers.map(p => ({ id: p.id, name: p.name, p }))} onPick={id => m.select(id)} />
  </>;
}
