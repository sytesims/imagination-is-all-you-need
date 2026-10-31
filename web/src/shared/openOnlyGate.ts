/** Open models only: a tool with no open model left (today: Reframe, hosted Luma only) says so on its Generate button instead of offering a run.
 *  The list comes from GET /api/settings/open-models (toolsUnavailable), fetched only while the switch is on. */
import { toolPage } from '../../../server/src/shared/pages';
import { useEffect, useState } from 'react';
import { useOpenWeightsOnly } from './OpenWeights';
import { TOOLS_REFRESH } from './useTools';

export const OPEN_ONLY_BLOCK = 'Not available with open models only. Turn it off in Settings → Connections to use this tool.';
let cache: Promise<string[]> | null = null;
const unavailable = (): Promise<string[]> => (cache ??= fetch('/api/settings/open-models').then(r => r.ok ? r.json() : null).then(b => (b?.toolsUnavailable ?? []).map((t: any) => String(t.id))).catch(() => { cache = null; return []; }));
/** The reason the current page's tool can't run with open models only, or ''. */
export function useOpenOnlyBlock(): string {
  const ow = useOpenWeightsOnly(); const [why, setWhy] = useState('');
  useEffect(() => { if (!ow) { setWhy(''); return; } let on = true;
    const check = () => unavailable().then(ids => { const p = location.pathname; if (on) setWhy(ids.some((id: string) => { const pg = toolPage(id); return p === pg || p.startsWith(`${pg}/`); }) ? OPEN_ONLY_BLOCK : ''); });
    const refresh = () => { cache = null; check(); };
    check(); addEventListener(TOOLS_REFRESH, refresh); addEventListener('popstate', check); return () => { on = false; removeEventListener(TOOLS_REFRESH, refresh); removeEventListener('popstate', check); }; }, [ow]);
  return why;
}
