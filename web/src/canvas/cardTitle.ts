/** A board card's title, read live from the board (release 1): cardLook.autoTitle over the card's facts. The poster cards and the inspector share it. */
import type { BoardApi, BoardNode } from './boardApi';
import { flowById, flowInfo } from '../shared/genFlows';
import { catalogNow } from './catalog';
import { GEN_TYPE, RESULT_TYPE, UPLOAD_TYPE, nodeDefOf } from './nodeTypes';
import { cardState } from './cardState';
import { promptSourcesInto } from './graph';
import { autoTitle } from './cardLook';

const KIND_WORD: Record<string, string> = { image: 'Image', video: 'Video', audio: 'Sound', '3d': '3D model' };
/** A card's title facts → its title (cardLook.autoTitle: never "Untitled"). Shared with the inspector. */
export function titleOf(board: BoardApi, n: BoardNode): { title: string; flowName: string } {
  const p: any = n.props; const name = String((n.meta as any)?.name ?? '');
  if (n.type === GEN_TYPE) { const f = flowById(p.flow); const flowName = f ? flowInfo(f, catalogNow()).name : 'Generate';
    const st = cardState(board, n, catalogNow()); const slots = st.spec?.slots ?? []; const many = new Set(slots.filter((s: any) => s.many).map((s: any) => s.name));
    const inputs = Object.entries(st.bySlot).flatMap(([slot, list]) => list.map((i) => ({ label: i.label, many: many.has(slot) })));
    const prompt = promptSourcesInto(board, n.id).map((x) => x.text).join(' ') || p.prompt;
    return { title: autoTitle({ kind: 'gen', name, flow: p.flow, flowName, prompt, inputs }), flowName }; }
  if (n.type === RESULT_TYPE) return { title: autoTitle({ kind: 'result', name, title: p.title, prompt: p.title }), flowName: KIND_WORD[p.kind] ?? 'Result' };
  if (n.type === UPLOAD_TYPE) return { title: autoTitle({ kind: 'upload', name, fileName: p.label }), flowName: 'Upload' };
  return { title: autoTitle({ kind: 'other', name }), flowName: nodeDefOf(n.type)?.label ?? 'Card' };
}

