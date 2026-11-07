/**
 * Which engine draws the Canvas (2026-11-06, the move to React Flow behind a switch). tldraw stays the default.
 *  - `?engine=rf` (or `?engine=tldraw`) in the address picks one for this page; the board links the page makes keep it;
 *  - the board menu's "Board engine" setting (shown in dev builds, or once the new engine is on) keeps a choice in this browser.
 */
export type CanvasEngine = 'tldraw' | 'rf';
const KEY = 'ohf-canvas-engine';
const asEngine = (v: string | null | undefined): CanvasEngine | null => (v === 'rf' || v === 'tldraw' ? v : null);
/** the engine named in the address, if any */
export const engineInUrl = (): CanvasEngine | null => { try { return asEngine(new URLSearchParams(location.search).get('engine')); } catch { return null; } };
export const savedEngine = (): CanvasEngine | null => { try { return asEngine(localStorage.getItem(KEY)); } catch { return null; } };
export function canvasEngine(): CanvasEngine { return engineInUrl() ?? savedEngine() ?? 'tldraw'; }
export function saveEngine(e: CanvasEngine) { try { if (e === 'tldraw') localStorage.removeItem(KEY); else localStorage.setItem(KEY, e); } catch { /* private window */ } }
/** Dev / measuring only: `?rfopt=links:curve,sticky:card,handles:corners,minimap:1` shows the taste options (D1, D3, D4, D6) side by side. */
export function rfOptions(): Record<string, string> {
  try { const v = new URLSearchParams(location.search).get('rfopt') ?? ''; return Object.fromEntries(v.split(',').filter(Boolean).map((x) => { const [k, o] = x.split(':'); return [k, o ?? '1']; })); } catch { return {}; }
}
