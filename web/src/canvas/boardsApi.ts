/** Canvas boards API (server canvasBoards.ts). No tldraw import here: the snapshot is opaque JSON to this file. */
export interface BoardSummary { id: string; name: string; createdAt: number; updatedAt: number; rev: number; shapes: number; /** the board's project (null = All generations) */ projectId?: string | null }
export interface Board extends BoardSummary { snapshot: { store: Record<string, unknown>; schema: unknown } | null }
export class BoardError extends Error { constructor(message: string, public status: number, public code?: string, public rev?: number) { super(message); } }

const call = async <T,>(url: string, init: RequestInit = {}): Promise<T> => {
  const r = await fetch(url, { ...init, headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) } });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new BoardError(b.error || `Request failed (${r.status})`, r.status, b.code, b.rev);
  return b as T;
};
const B = '/api/canvas/boards';
export const listBoards = () => call<{ items: BoardSummary[] }>(B).then(r => r.items);
export const createBoard = (name?: string) => call<Board>(B, { method: 'POST', body: JSON.stringify(name ? { name } : {}) });
export const getBoard = (id: string) => call<Board>(`${B}/${encodeURIComponent(id)}`);
export const renameBoard = (id: string, name: string) => call<BoardSummary>(`${B}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name }) });
export const setBoardProject = (id: string, projectId: string | null) => call<BoardSummary>(`${B}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ projectId }) });
export const deleteBoard = (id: string) => call<{ ok: true }>(`${B}/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const saveBoard = (id: string, snapshot: unknown, rev?: number) =>
  call<{ id: string; rev: number; updatedAt: number; shapes: number }>(`${B}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ snapshot, ...(rev != null ? { rev } : {}) }) });
/** Best effort while the page closes (keepalive caps the body at 64 KB; the debounced save has normally run already). */
export function saveBoardOnExit(id: string, snapshot: unknown, rev?: number): boolean {
  const body = JSON.stringify({ snapshot, ...(rev != null ? { rev } : {}) }); if (body.length > 60_000) return false;
  try { void fetch(`${B}/${encodeURIComponent(id)}/save`, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }); return true; } catch { return false; }
}
