/** The open board (set by Board.tsx): runs go to its project, and its spend chip counts them. Kept apart from agentApi so the
 *  node run helpers can read it without importing the agent API (and the node views that agentApi creates). */
import type { BoardApi } from './boardApi';
export interface BoardCtx { boardId: string; projectId: string | null; board: BoardApi | null }
let ctx: BoardCtx = { boardId: '', projectId: null, board: null };
export const setBoardCtx = (c: Partial<BoardCtx>) => { ctx = { ...ctx, ...c }; };
export const boardCtx = () => ctx;
/** The open board, for the dock that lives outside it. */
export const useCanvasBoard = () => ctx.board;
