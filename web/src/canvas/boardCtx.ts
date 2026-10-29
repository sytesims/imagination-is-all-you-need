/** The open board (set by Board.tsx): runs go to its project, and its spend chip counts them. Kept apart from agentApi so the
 *  node run helpers can read it without importing the agent API (and the node views that agentApi creates). */
import type { Editor } from 'tldraw';
export interface BoardCtx { boardId: string; projectId: string | null; editor: Editor | null }
let ctx: BoardCtx = { boardId: '', projectId: null, editor: null };
export const setBoardCtx = (c: Partial<BoardCtx>) => { ctx = { ...ctx, ...c }; };
export const boardCtx = () => ctx;
export const useCanvasEditor = () => ctx.editor;
