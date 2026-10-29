/**
 * A generate card as the shared flow spec sees it: its spec (slots, settings, models, quote params), its inputs placed in slots, what's
 * still missing in Generate's words, and the model's shown name. Reactive when read inside tldraw's useValue.
 */
import type { Editor, TLShape } from 'tldraw';
import { DEFAULT_FLOW, flowById, flowSpec, placeInputs, type FlowSpec, type GenCatalog } from '../shared/genFlows';
import { modelOfEngine, shownName } from '../shared/models';
import { cardInputs } from './graph';
import type { BoardInput, GenCardProps } from './cardModel';

export interface CardState { spec: FlowSpec | null; inputs: BoardInput[]; bySlot: Record<string, BoardInput[]>; extra: BoardInput[] }
export function cardState(editor: Editor, card: TLShape, cat: GenCatalog | null): CardState {
  const inputs = cardInputs(editor, card); const p = card.props as GenCardProps; const f = flowById(p.flow) ?? flowById(DEFAULT_FLOW[p.medium])!;
  if (!cat) return { spec: null, inputs, bySlot: {}, extra: [] };
  /* two passes: the slots can depend on what's filled (a first frame makes it image to video) */
  const first = flowSpec(f, cat, { provider: p.provider, vals: p.vals, filled: {} }); if (!first) return { spec: null, inputs, bySlot: {}, extra: inputs };
  const pl0 = placeInputs(first.slots, inputs, p.pins); const spec = flowSpec(f, cat, { provider: p.provider, vals: p.vals, filled: pl0.bySlot }) ?? first;
  const pl = placeInputs(spec.slots, inputs, p.pins); return { spec, inputs, bySlot: pl.bySlot, extra: pl.extra };
}
export const modelNameOf = (spec: FlowSpec | null) => { if (!spec) return ''; const m = modelOfEngine(spec.tool.id, spec.provider); return (m ? shownName(m) : null) ?? spec.recipe.modelInfo?.[spec.provider]?.name ?? spec.providers.find(x => x.id === spec.provider)?.name ?? spec.provider; };
export const makerOf = (spec: FlowSpec | null) => (spec ? modelOfEngine(spec.tool.id, spec.provider)?.maker ?? '' : '');
/** What Generate still waits for, in its words (the first required input left empty, else a prompt it needs). */
export function missingOf(spec: FlowSpec | null, bySlot: Record<string, BoardInput[]>, prompt: string): string | null {
  if (!spec) return null; const s = spec.slots.find(x => x.required && !(bySlot[x.name]?.length)); if (s) return s.missing;
  const rw = spec.recipe.prompt.requiredWithout; if (rw && !(bySlot[rw.slot]?.length) && !prompt.trim()) return rw.missing;
  if (spec.promptMode === 'required' && !prompt.trim()) return spec.flow.medium === 'audio' && spec.mode === 'voice' ? 'Write the script' : 'Write a prompt';
  return null;
}
