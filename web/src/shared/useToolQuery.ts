import { useState } from 'react';
/**
 * Query params a tool honours on first render:
 *  ?preset=<id>   preselect a preset/type/angle (Explore "Try it" deep links)
 *  ?mockFail=<type|1>  mock force-fail (sent as `simulate`; QA of failure states)
 */
export function useToolQuery() {
  const [q] = useState(() => { const s = new URLSearchParams(location.search); return { preset: s.get('preset') || '', mockFail: s.get('mockFail') || '' }; });
  return q;
}
/** Copy a FormData (so a stored submission can be re-sent for Retry). */
export const cloneForm = (fd: FormData) => { const c = new FormData(); fd.forEach((v, k) => c.append(k, v)); return c; };
