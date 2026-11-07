/** A poster's input ports (2026-11-06, release 1): one per slot of its workflow, then the prompt; links land on the slot they fill. */
import type { BoardApi, BoardNode } from '../boardApi';
import type { GenCatalog } from '../../shared/genFlows';
import { GEN_TYPE } from '../nodeTypes';
import { cardState } from '../cardState';
import { promptSourcesInto } from '../graph';
import { asPortKind, type PortKind } from '../nodeLogic';

/** One input port on a poster. `from`: the cards wired into it. */
export interface PosterPort { key: string; label: string; kind: PortKind; optional: boolean; filled: boolean; from: string[] }
/** Input ports sit this far apart around the middle of the left edge. */
export const POSTER_PORT_GAP = 30;
/** A generate card's input ports, one per slot of its workflow, then the prompt (unless the workflow takes none). */
export function posterPorts(board: BoardApi, n: BoardNode, cat: GenCatalog | null): PosterPort[] {
  if (n.type !== GEN_TYPE) return [];
  const st = cardState(board, n, cat); const spec = st.spec;
  if (!spec) return [{ key: 'image', label: 'Picture', kind: 'image', optional: true, filled: false, from: [] }, { key: 'prompt', label: 'Prompt', kind: 'text', optional: true, filled: false, from: [] }];
  const out: PosterPort[] = spec.slots.map((s) => { const got = st.bySlot[s.name] ?? [];
    return { key: s.name, label: s.label, kind: (asPortKind(s.accept) ?? 'image') as PortKind, optional: !s.required, filled: got.length > 0, from: got.map((i) => i.shapeId).filter(Boolean) as string[] }; });
  if (spec.promptMode !== 'hidden') { const src = promptSourcesInto(board, n.id);
    out.push({ key: 'prompt', label: 'Prompt', kind: 'text', optional: spec.promptMode !== 'required', filled: src.length > 0 || !!String((n.props as any).prompt ?? '').trim(), from: src.map((x) => x.id) }); }
  return out;
}
/** Where a link from `fromId` lands on a poster: the y of the port it fills (else the first port of its kind, else the middle). */
export function posterPortY(ports: PosterPort[], fromId: string, kind: string | null | undefined, box: { y: number; h: number }): number {
  let i = ports.findIndex((p) => p.from.includes(fromId)); if (i < 0) i = ports.findIndex((p) => p.kind === kind && !p.filled); if (i < 0) i = ports.findIndex((p) => p.kind === kind);
  return Math.round(box.y + box.h / 2 + (i >= 0 ? (i - (ports.length - 1) / 2) * POSTER_PORT_GAP : 0));
}
