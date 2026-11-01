/**
 * Why "View workflow" / "Open in ComfyUI" is off for a result: ONE sentence for the result view (ResultView) and the Canvas card panel
 * (CardPanel). It leads with the server's own reason for this result (server/src/workflowExport.ts), so a hosted run says where it ran in the
 * same words as its details ("Ran on: Comfy Cloud"). Pure, no React, so tests run it under tsx.
 */
import type { WorkflowInfo } from './WorkflowDialog';

/** What does come with a workflow, added after a hosted result's reason so the two never read as a contradiction. */
export const WORKFLOW_KINDS = 'Results made with open models on your computer, or with Comfy Cloud workflows, include one.';

/** null when the workflow is available; otherwise the disabled tip. `err` is useWorkflowInfo's error ('' while loading). */
export function workflowTip(info: Pick<WorkflowInfo, 'available' | 'reason' | 'headline'> | null, err: string): string | null {
  if (info?.available) return null;
  if (info) {
    const reason = info.reason || 'No ComfyUI workflow was saved for this result.';
    return info.headline === 'Not a ComfyUI workflow' /* a hosted run (Comfy Router, fal, a lab's API): the server's headline for it */ ? `${reason} ${WORKFLOW_KINDS}` : reason;
  }
  if (err) return err === 'not found' ? 'This result is no longer in your library, so its workflow can’t be shown.' : `The workflow couldn’t be loaded. ${err}`;
  return 'Checking…';
}
