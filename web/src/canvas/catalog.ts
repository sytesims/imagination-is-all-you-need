/**
 * What the board's generate cards and bar read from the server, loaded once per page: the tool registry (GET /api/tools, which also fills
 * shared/models.ts for the model menu and Run on), the image workflow recipes (the same cached GET /api/image-workflows Create Image uses)
 * and the image model rows (GET /api/models?toolId=create-image: their image caps and reference limits).
 */
import { useEffect, useState } from 'react';
import { listTools } from '../api';
import { useImageWorkflows } from '../ui/next/WorkflowBar';
import type { GenCatalog } from '../shared/genFlows';

let toolsP: Promise<GenCatalog['tools']> | null = null; let modelsP: Promise<GenCatalog['models']> | null = null;
const loadTools = () => (toolsP ??= listTools().catch(e => { toolsP = null; throw e; }));
const loadModels = () => (modelsP ??= fetch('/api/models?toolId=create-image').then(r => (r.ok ? r.json() : { groups: [] }))
  .then(d => Object.fromEntries((d?.groups ?? []).flatMap((g: any) => g.models ?? []).map((m: any) => [m.providerId ?? m.id, m]))).catch(() => { modelsP = null; return {}; }));

let snap: GenCatalog | null = null;
/** The catalog, or null while it loads. */
export function useCatalog(): GenCatalog | null {
  const recipes = useImageWorkflows(); const [base, setBase] = useState<{ tools: GenCatalog['tools']; models: GenCatalog['models'] } | null>(snap ? { tools: snap.tools, models: snap.models } : null);
  useEffect(() => { let on = true; void Promise.all([loadTools(), loadModels()]).then(([tools, models]) => { if (on) setBase({ tools, models }); }).catch(() => undefined); return () => { on = false; }; }, []);
  if (!base || !recipes.length) return null;
  if (!snap || snap.tools !== base.tools || snap.recipes !== recipes || snap.models !== base.models) snap = { tools: base.tools, models: base.models, recipes };
  return snap;
}
/** The last loaded catalog, for code outside React (keyboard actions, quick actions). */
export const catalogNow = () => snap;
