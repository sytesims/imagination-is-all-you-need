import type { ToolInfo } from '../api';
import { audioWorkflowForToolMode, audioRoute } from '../../../server/src/shared/audioWorkflows';
import { videoWorkflowHref } from '../../../server/src/shared/videoWorkflows';

/** A model link must pick a compatible workflow before the composer validates its model.
 * Audio tools share several modes; their bare routes default to Music / Voiceover. */
export function modelNavigationHref(tool: Pick<ToolInfo, 'id' | 'route' | 'app'>, model: { key: string; engines: string[] }): string {
  let route = tool.route;
  if (['audio', 'voice', 'soundtrack'].includes(tool.id)) {
    const modes = model.engines.flatMap(id => tool.app?.providerModes?.[id] ?? []);
    const mode = modes[0];
    const workflow = audioWorkflowForToolMode(tool.id, mode ?? null);
    if (workflow) route = audioRoute(workflow);
    else if (tool.id === 'voice' && mode === 'lipsync') route = videoWorkflowHref('lip-sync');
  }
  return `${route}${route.includes('?') ? '&' : '?'}model=${encodeURIComponent(model.key)}`;
}
