/**
 * Which studio a link opens (2026-11-07). Each studio (Video, Image, Audio, 3D, Edit, the Apps gallery) is a plugin; while one is off its
 * tools are gone, so a link into it would land on a dead page. The server says which studio owns each built-in tool (GET /api/ui
 * toolStudio); this finds the tool a link opens, the same way the pages do (shared/workflowLinks pageToolId: /video?workflow=reframe → reframe,
 * the Edit studio), and returns its studio. Pure, so server/test/studio-links.test.ts can read it.
 */
import { featureForPath } from './imageFeatures';
import { pageToolId } from './workflowLinks';

/** Pages a studio owns: Image, Video, Audio, 3D, and a tool's own page /tools/<id>. */
const STUDIO_PATH = /^\/(image|video|audio|3d)$|^\/tools\/[^/]+$/;

/** The studio plugin id a link opens (toolStudio: tool id → studio id), or null for a page no studio owns. */
export const studioOfHref = (href: string, toolStudio: Record<string, string>): string | null => studiosOfHref(href, toolStudio)[0] ?? null;

/** Every studio a link needs: its tool's own, then (toolNeeds) a gallery recipe's base studio (Relight → Apps gallery and Image). */
export function studiosOfHref(href: string, toolStudio: Record<string, string>, toolNeeds: Record<string, string> = {}): string[] {
  const id = toolOfHref(href); if (!id) return [];
  return [toolStudio[id], toolNeeds[id]].filter((x): x is string => !!x);
}

/** The tool a link into a studio page opens, or null for a page no studio owns. */
function toolOfHref(href: string): string | null {
  let u: URL; try { u = new URL(href, 'http://app.local'); } catch { return null; }
  if (u.origin !== 'http://app.local') return null; /* another site */
  const path = u.pathname.replace(/\/+$/, '') || '/';
  if (!STUDIO_PATH.test(path)) return null;
  return decodeURIComponent(featureForPath(path)?.toolId ?? pageToolId(path, u.search));
}
