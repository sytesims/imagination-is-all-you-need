/**
 * How many workflows the app offers (2026-11-02): ONE count, used by the Workflows tab's header and its "Everything" filter, the README and
 * the submission README (server/test/readme-counts.test.ts), so a number said anywhere is the number the tab shows.
 *  - workflows: every ready-made workflow in the catalogue (shared/workflowCatalog.ts WF_ENTRIES: each opens its tab with it picked; the
 *    one-click apps are the engines behind some of them), plus the bundled plugins with a tab (plugins/<id>/plugin.json, e.g. Cutout);
 *  - chains: the step-by-step chains that join them (WF_CHAINS);
 *  - cards: both, what "Everything" lists on a setup that can run them all.
 * Isomorphic, data only. Test: server/test/workflow-count.test.ts.
 */
import { WF_ENTRIES, WF_CHAINS } from './workflowCatalog.js';

export type CountTab = 'image' | 'video' | 'audio' | '3d';
export interface WorkflowCounts { image: number; video: number; audio: number; three: number; workflows: number; chains: number; cards: number }

/** `pluginTabs`: the tab of each plugin that joins the catalogue (GET /api/tools on the page, plugin.json files in the README test). */
export function workflowCounts(pluginTabs: string[] = []): WorkflowCounts {
  const by: Record<CountTab, number> = { image: 0, video: 0, audio: 0, '3d': 0 };
  for (const e of WF_ENTRIES) by[e.medium]++;
  for (const t of pluginTabs) if (t in by) by[t as CountTab]++;
  const workflows = by.image + by.video + by.audio + by['3d'];
  return { image: by.image, video: by.video, audio: by.audio, three: by['3d'], workflows, chains: WF_CHAINS.length, cards: workflows + WF_CHAINS.length };
}
/** The tab's header line for what it shows right now: "77 ways to start: 69 workflows and 8 step by step." */
export function countLine(workflows: number, chains: number): string {
  const n = workflows + chains; if (!n) return '';
  const w = `${workflows} ${workflows === 1 ? 'workflow' : 'workflows'}`;
  return `${n} ${n === 1 ? 'way' : 'ways'} to start: ${chains ? `${w} and ${chains} step by step` : w}.`;
}
