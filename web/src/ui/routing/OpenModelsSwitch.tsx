/**
 * Settings → Connections → "Open models only" (Open Weights Only): GET|PUT /api/settings/open-models (server/src/routesOpenModels.ts).
 * On: partner nodes and closed APIs disappear from model menus, Run on, Pricing, header menus and MCP; quotes and runs of them are refused.
 * Our open workflows still run locally and on Comfy Cloud. A server started with OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY=1 locks it on.
 */
import { useEffect, useState } from 'react';
import { setOpenWeightsOnlyNow } from '../../shared/OpenWeights';


type View = { on: boolean; locked: boolean; tools: number; toolsAvailable: number; toolsUnavailable: { id: string; name: string }[]; note: string | null };
export function OpenModelsSwitch({ onChange }: { onChange?: () => void }) {
  const [v, setV] = useState<View | null>(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  useEffect(() => { fetch('/api/settings/open-models').then(r => r.ok ? r.json() : null).then(b => b && setV(b)).catch(() => 0); }, []);
  const set = async (on: boolean) => { setBusy(true); setMsg('');
    try { const r = await fetch('/api/settings/open-models', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on }) }); const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(b?.error ?? `HTTP ${r.status}`); setV(b); setOpenWeightsOnlyNow(b.on); onChange?.(); setMsg(b.on ? 'Open models only is on' : 'All models are back'); }
    catch (e) { setMsg(`Couldn’t save: ${(e as Error).message}`); } setBusy(false); };
  const on = !!v?.on;
  return <div className={`om-card${on ? ' om-on' : ''}`} id="open-models" data-testid="open-models">
    <h3 id="om-h">Open models only</h3>
    <button type="button" role="switch" aria-checked={on} aria-labelledby="om-h" aria-describedby="om-d" disabled={!v || busy || (v.locked && on)} title={v?.locked ? v.note ?? undefined : undefined}
      className={`toggle-ui-btn prov-sw om-sw ${on ? 'on' : ''}`} onClick={() => set(!on)} data-testid="open-models-switch"><i /></button>
    <p id="om-d">Hide closed cloud models. Open models still run on your computer or on Comfy Cloud.</p>
    {v && <p className="om-stat" role="status" aria-live="polite">{msg ? msg + ' · ' : ''}{on
      ? <><b>{v.toolsAvailable} of {v.tools} tools</b> run with open models · 0 closed APIs{v.toolsUnavailable.length ? ` · not available: ${v.toolsUnavailable.map(t => t.name).join(', ')}` : ''}</>
      : <>All {v.tools} tools, including partner and hosted models.</>}{v.locked ? ` ${v.note}` : ''}</p>}
  </div>;
}
