/** Create Image toolbar: the project new results go into (null = no project). Kept per browser; the submit adds it as `projectId`
 *  (tools/app/AppTool.tsx submit), and the server files the new job there (an unknown or deleted project is ignored). */
import { useEffect, useState } from 'react';

const KEY = 'ohf:feedProject'; const EVT = 'ohf:feed-project';
export function feedProjectId(): string | null { try { return localStorage.getItem(KEY) || null; } catch { return null; } }
export function setFeedProjectId(id: string | null) { try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* storage off: this visit only */ } mem = id; dispatchEvent(new Event(EVT)); }
let mem: string | null | undefined;
export function useFeedProject(): [string | null, (id: string | null) => void] {
  const [v, setV] = useState<string | null>(() => mem !== undefined ? mem : feedProjectId());
  useEffect(() => { const f = () => setV(mem !== undefined ? mem : feedProjectId()); addEventListener(EVT, f); return () => removeEventListener(EVT, f); }, []);
  return [v, setFeedProjectId];
}
export interface ProjectRow { id: string; name: string; count: number; parentId?: string | null; /** newest finished image (the picker's cover); null = none */ coverUrl?: string | null }
export async function listProjects(): Promise<ProjectRow[]> { const r = await fetch('/api/projects'); if (!r.ok) throw new Error('Couldn’t load projects'); return r.json(); }
export async function createProject(name: string): Promise<ProjectRow> {
  const r = await fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
  const j = await r.json().catch(() => null); if (!r.ok) throw new Error(j?.error ?? 'Couldn’t create the project'); return { count: 0, coverUrl: null, ...j };
}
