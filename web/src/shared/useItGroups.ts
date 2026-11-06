/**
 * The viewer's "Use it in…" groups (shared/ResultMenu.tsx ToolsPanel), pure so server/test/use-it-groups.test.ts can read them.
 * A hand-off goes in the group of the page it opens: the Video page → "Make it move", Audio → "Sound and voice", 3D → "3D", anything
 * else → "Edit the picture". The old /tools/<id> pattern stays as the fallback for tools that still open on their own page.
 * (2026-11-03: video tools now open the Video page, so matching only /tools/<id> put Camera Moves and Photo FX under "Edit the picture".)
 */
import { VIDEO_PAGE, AUDIO_PAGE, THREE_D_PAGE } from '../../../server/src/shared/pages';

export type UseItGroup = 'Picture' | 'Video' | 'Sound' | '3D';
/** Group titles, in the order the panel shows them. */
export const USE_IT_TITLE: Record<UseItGroup, string> = { Picture: 'Edit the picture', Video: 'Make it move', Sound: 'Sound and voice', '3D': '3D' };
const OLD_TOOL_GROUP: [RegExp, UseItGroup][] = [
  [/^(h3-video|h3-extend|object-swap|motion-transfer|restyle|reshoot|camera|photo-fx|upscale|footage-fx|two-person-swap|prompt-edit|finish|reframe|remove-bg|sdr-hdr|fps-boost|depth-map|cutout|app-(anime|video|transition|ugc|orbit))/, 'Video'],
  [/^(voice|soundtrack|audio|app-(change-voice|translate|music))/, 'Sound'], [/^three-d/, '3D']];
const onPage = (url: string, page: string) => url === page || url.startsWith(`${page}?`) || url.startsWith(`${page}/`);
/** The group of one hand-off, from where its link opens (`url`, the resolved toolHandoffHref) and its tool id. */
export function useItGroupOf(toolId: string, url: string): UseItGroup {
  if (onPage(url, VIDEO_PAGE)) return 'Video';
  if (onPage(url, AUDIO_PAGE)) return 'Sound';
  if (onPage(url, THREE_D_PAGE)) return '3D';
  const m = /^\/tools\/([\w-]+)/.exec(url); const id = m ? m[1] : toolId;
  return OLD_TOOL_GROUP.find(([r]) => r.test(id))?.[1] ?? 'Picture';
}
