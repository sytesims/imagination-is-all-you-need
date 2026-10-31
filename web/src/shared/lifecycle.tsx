/** Model / route lifecycle from the server (server/src/shared/lifecycle.ts): `lifecycle` ('retiring' | 'unavailable') + `lifecycleNote`
 *  on /api/tools providers[], /api/models, /api/routes (model and route) and /api/pricing hosted rows. A retiring model stays selectable,
 *  is never "Featured", and shows a small amber "Retiring" pill whose tooltip is the note. */
export type Lifecycle = 'retiring' | 'unavailable';
export const lifecycleOf = (x: any): Lifecycle | null => (x?.lifecycle === 'retiring' || x?.lifecycle === 'unavailable' ? x.lifecycle : null);
export const isRetiringModel = (x: any) => lifecycleOf(x) === 'retiring';
const LABEL: Record<Lifecycle, string> = { retiring: 'Retiring', unavailable: 'Unavailable' };
export function LifecyclePill({ of, className = '' }: { of: any; className?: string }) {
  const l = lifecycleOf(of); if (!l) return null;
  const note = typeof of?.lifecycleNote === 'string' ? of.lifecycleNote : undefined;
  return <em className={`lc-pill lc-${l} ${className}`.trim()} title={note} data-testid="lifecycle-pill">{LABEL[l]}{note && <span className="sr-only">: {note}</span>}</em>;
}
/** A model restored from a saved draft (localStorage) is used only when the tool still lists it and it isn't retiring; otherwise the tool's
 *  default wins (a removed model such as Reve, or a model marked retiring). Picking a retiring model by hand or by ?model= still works. */
export const restorableProvider = (tool: { providers?: { id: string }[] } | null | undefined, id: unknown): id is string =>
  typeof id === 'string' && !!id && (tool?.providers ?? []).some(p => p.id === id && !isRetiringModel(p));
