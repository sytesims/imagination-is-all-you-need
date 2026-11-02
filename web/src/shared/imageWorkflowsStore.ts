/**
 * Create Image's workflow recipes (GET /api/image-workflows): the built-ins and the workflows you added (shared/pluginPlacement.ts), one list.
 * Fetched once per page load (the server sends an ETag and a short max-age); Add a workflow calls refreshImageWorkflows() so every bar and
 * picker that shows them gets the new one at once. A small module of its own, so the app shell's Add a workflow sheet doesn't load the bar.
 */
import { useEffect, useState } from 'react';
import type { WfRecipe } from '../ui/next/WorkflowBar';

let cache: Promise<WfRecipe[]> | null = null; let fresh = false; const subs = new Set<(l: WfRecipe[]) => void>();
const load = () => (cache ??= fetch('/api/image-workflows', fresh ? { cache: 'no-cache' } : undefined).then(r => r.ok ? r.json() : { workflows: [] }).then(j => (Array.isArray(j?.workflows) ? j.workflows : [])).catch(() => { cache = null; return []; }));
export function useImageWorkflows(): WfRecipe[] {
  const [list, setList] = useState<WfRecipe[]>([]);
  useEffect(() => { let live = true; const on = (x: WfRecipe[]) => { if (live) setList(x); }; subs.add(on); load().then(on); return () => { live = false; subs.delete(on); }; }, []);
  return list;
}
/** After Add a workflow: fetch the recipes again (past the browser cache) and update every bar and picker that shows them. Resolves once they have it. */
export async function refreshImageWorkflows(): Promise<WfRecipe[]> { cache = null; fresh = true; const l = await load(); fresh = false; subs.forEach(f => f(l)); return l; }
