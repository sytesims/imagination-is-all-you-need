/**
 * ★ Make default (2026-10-27): the user's own default model per tool. The server keeps it (PUT /api/me/defaults, routing prefs), so every
 * browser and MCP agree; GET /api/tools then starts the tool on it (tool.favouriteProvider, defaultSource 'favourite'). Without one the tool
 * starts on its recommended default (tool.recommendedProvider: cloud first, server/src/shared/cloudDefaults.ts).
 *
 * - `favouriteOf(toolId)`: this page's latest choice (optimistic), else the server's.
 * - `recommendedOf(toolId)`: the default without the user's pick.
 * - `setDefaultModel(toolId, id | null)`: save (null = Reset to recommended), then reload the tool list so every bar and menu follows.
 */
import { useSyncExternalStore } from 'react';
import { toolLike } from './models';
import { refreshTools } from './useTools';

const shown = new Map<string, string | null>(); const subs = new Set<() => void>(); let version = 0;
const emit = () => { version++; subs.forEach(f => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export const favouriteOf = (toolId: string | null | undefined): string | null => {
  if (!toolId) return null; if (shown.has(toolId)) return shown.get(toolId)!;
  const t: any = toolLike(toolId); return typeof t?.favouriteProvider === 'string' && t.favouriteProvider ? t.favouriteProvider : null;
};
export const recommendedOf = (toolId: string | null | undefined): string | null => {
  const t: any = toolId ? toolLike(toolId) : null; return t?.recommendedProvider ?? t?.defaultProvider ?? null;
};
/** Re-render when a favourite changes (the model menu). */
export function useDefaultModel(toolId: string | null | undefined) {
  useSyncExternalStore(subscribe, () => version, () => version);
  return { favourite: favouriteOf(toolId), recommended: recommendedOf(toolId) };
}
/** Make `id` the tool's default (null = Reset to recommended). Resolves when saved; on failure the star goes back and the error is thrown. */
export async function setDefaultModel(toolId: string, id: string | null): Promise<void> {
  const before = favouriteOf(toolId); shown.set(toolId, id); emit();
  try {
    const r = await fetch('/api/me/defaults', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-openhiggsfield-source': 'web model menu' }, body: JSON.stringify({ toolId, model: id }) });
    const b = await r.json().catch(() => null);
    if (!r.ok) throw new Error(String(b?.error ?? `Couldn’t save (HTTP ${r.status}).`));
    shown.set(toolId, b?.favourite ?? null); emit(); refreshTools();
  } catch (e) { shown.set(toolId, before); emit(); throw e; }
}
