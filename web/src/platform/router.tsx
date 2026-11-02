import { IMAGE_REDIRECTS } from '../shared/imageFeatures';
import { VIDEO_REDIRECTS, videoRedirect } from '../../../server/src/shared/videoWorkflows';
import { pageTool } from '../../../server/src/shared/pages';
import { audioRedirectTarget } from '../../../server/src/shared/audioWorkflows';
import { threeDRedirectTarget } from '../../../server/src/shared/threeD';
import { redirectTarget, withSearch, addedImageRedirect } from '../shared/workflowLinks';
import { selfHostRedirect } from '../shared/legacyRoutes';
import { useEffect, useState } from 'react';
/** Minimal pushState router (no dependency). */
export function navigate(to: string, o: { replace?: boolean; state?: Record<string, unknown> } = {}) { to = canonTo(to); /* inApp: this entry was reached by a click in the app (✕ can go back to it). A replace keeps the entry's own flag: a direct link stays a direct link, so ✕ closes to the page's list, as Esc does */
  const st = { ...(o.replace ? history.state : {}), inApp: o.replace ? !!(history.state as any)?.inApp : true, ...(o.state ?? {}) }; if (o.replace) history.replaceState(st, '', to); else history.pushState(st, '', to); dispatchEvent(new PopStateEvent('popstate')); }
/** Alias paths → canonical (replaceState, so Back doesn't bounce). */
export const REDIRECTS: Record<string, string> = { '/licences': '/licenses', '/licence': '/licenses', '/license': '/licenses', '/apps': '/workflows' /* Apps → Workflows (2026-10-22); /apps/<x> too, see canonPath */, '/presets': '/workflows', '/looks': '/workflows', '/pricing': '/models' /* the Pricing page is gone (user, 2026-10-29): every price is on Models */ /* the Looks page is gone (user, 2026-10-28); looks live inside each workflow */,
  /* Images (2026-10-22): old names → plain names (/soul and /tools/soul → Create Image, /tools/app-shots → Camera Angles, /tools/app-inpaint → Brush Edit, /tools/edit-image → Create Image in edit mode) */ ...IMAGE_REDIRECTS,
  /* One Video page (2026-10-23): Edit Video, Motion Control and every video tool page → /video?workflow=<id>; the old /tools/h3-video → /video (videoRedirect) (shared/videoWorkflows.ts) */ ...VIDEO_REDIRECTS };
/** Join a redirect target that may carry its own query (?mode=edit) with the current query (pure; shared/workflowLinks.ts, tested in server/test/image-redirects.test.ts). */
export { withSearch };
/** An in-app link to an old path goes straight to its new home (before pushState), so the page listening for that navigation sees the final URL
 *  (/tools/image-upscale?fromJob=… → /image?workflow=upscale&fromJob=…). */
function canonTo(to: string): string { try { const u = new URL(to, location.origin); if (u.origin !== location.origin) return to; return selfHostRedirect(u.pathname) ?? redirectTarget(u.pathname, u.search, u.hash, REDIRECTS) ?? addedImageRedirect(u.pathname, u.search, u.hash) ?? videoRedirect(u.pathname, u.search, u.hash) ?? audioRedirectTarget(u.pathname, u.search, u.hash) ?? threeDRedirectTarget(u.pathname, u.search, u.hash) ?? to; } catch { return to; } }
function canonPath(): string {
  const k = (location.pathname.replace(/\/+$/, '') || '/').toLowerCase();
  const to = selfHostRedirect(location.pathname) ?? redirectTarget(location.pathname, location.search, location.hash, REDIRECTS) ?? addedImageRedirect(location.pathname, location.search, location.hash) /* a workflow you added: its old page → the Image tab with it picked */ ?? videoRedirect(location.pathname, location.search, location.hash) ?? audioRedirectTarget(location.pathname, location.search, location.hash) /* One Audio page (2026-10-23): /tools/voice, /tools/soundtrack and their modes → /audio?workflow=<id> (shared/audioWorkflows.ts) */ ?? threeDRedirectTarget(location.pathname, location.search, location.hash) /* 3D (2026-10-23): /3d, /tools/three-d, /tools/image-to-3d, /tools/turntable */ ?? (k.startsWith('/apps/') ? withSearch('/workflows', location.search) + location.hash : null);
  if (to) history.replaceState(history.state, '', to);
  return location.pathname;
}
export function usePath() {
  const [p, setP] = useState(canonPath);
  useEffect(() => { const f = () => setP(canonPath()); addEventListener('popstate', f); return () => removeEventListener('popstate', f); }, []);
  return p;
}
/** The query string, live (re-renders on navigate / back / forward even when the path stays the same, e.g. /video ⇄ ?workflow=extend). */
export function useSearch() {
  const [s, setS] = useState(() => location.search);
  useEffect(() => { const f = () => setS(location.search); addEventListener('popstate', f); return () => removeEventListener('popstate', f); }, []);
  return s;
}
/** One Video page (2026-10-23): the Video tabs (Create Video · Edit Video · Motion Control) are gone; the workflow picked in the bar is
 *  ?workflow=<id> on /video (shared/videoWorkflows.ts). Old tab URLs redirect (videoRedirect). */
export const videoWorkflowParam = (search = location.search): string => new URLSearchParams(search).get('workflow') ?? '';

export function Link({ to, children, className, onClick, ...rest }: { to: string; children: React.ReactNode; className?: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { [k: `data-${string}`]: string | undefined }) {
  /* an outside address (the GitHub repo and docs) opens in a new tab: no prefetch, no in-app navigation */
  if (/^https?:\/\//i.test(to)) return <a {...rest} href={to} className={className} target="_blank" rel="noopener noreferrer" onClick={onClick}>{children}</a>;
  /* prefetch the page's code on hover / focus / touch, so the click rarely waits for a chunk */
  const pre = () => prefetchRoute(to);
  return <a {...rest} href={to} className={className} onMouseEnter={e => { pre(); rest.onMouseEnter?.(e); }} onFocus={e => { pre(); rest.onFocus?.(e); }} onTouchStart={e => { pre(); rest.onTouchStart?.(e); }}
    onClick={e => { onClick?.(e); if (e.defaultPrevented || e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(to); }}>{children}</a>;
}

// ---- Header slot routes (DESIGN-NOTES 21/23). Components are Design Planner's (ui/pages, ui/Usage). ----
import { PageComps, prefetchRoute } from './routeChunks'; // each page is its own chunk (performance)
const { Canvas, Film, LearnEcom, SpendOrUsage, Licenses, Settings, TermsPage, ApiDocs, Mcp, Plugins, Community, Workflows, Models, Profile, RecipeImport } = PageComps;
export type PageRoute = [title: string, Comp: React.ComponentType<{ tools: any[] }>];
export const PAGES: Record<string, PageRoute> = {
  '/mcp': ['MCP', Mcp], '/api-docs': ['API', ApiDocs], '/plugins': ['Your workflows', Plugins], '/community': ['Community', Community],
  '/canvas': ['Canvas', Canvas as any],
  '/film': ['Editor', Film as any], // Film (2026-10-27): the list; /film/:id is FILM_ID_PATH (App.tsx)
  '/r': ['Make this', RecipeImport as any], // a shared recipe (/r?recipe=…, shared/recipe.ts): check it, then open it in the tool; nothing runs until Generate
  '/learn/ai-ecommerce': ['AI for e-commerce', LearnEcom as any], // the pop-up book (learn/EcomBook.tsx), full screen over the app
  '/workflows': ['Workflows', Workflows], '/models': ['Models', Models],
  '/settings': ['Settings', Settings as any], '/profile': ['Profile', Profile as any], '/licenses': ['Licences', Licenses as any], '/account/usage': ['Spend', SpendOrUsage as any], '/usage': ['Spend', SpendOrUsage as any], '/spend': ['Spend', SpendOrUsage as any], '/terms': ['Usage & licence notes', TermsPage as any], '/usage-notes': ['Usage & licence notes', TermsPage as any],
};
/** Page route for a path (trailing slash tolerated), or undefined. */
export const matchPage = (path: string): PageRoute | undefined => PAGES[path] ?? PAGES[path.replace(/\/+$/, '')];
/** Paths the app can render (anything else → NotFound immediately, even before /api/tools loads). */
/** Workflows redesign (2026-10-23): /workflows/:id and /workflows/:id/looks/:lookId. */
export const WF_PATH = /^\/workflows\/([^/]+)(?:\/looks\/([^/]+))?\/?$/;
/** Film (2026-10-27): one film's editor. */
export const FILM_ID_PATH = /^\/film\/[^/]+\/?$/;
export const isKnownPath = (path: string) => path === '/' || !!pageTool(path) /* Image, Video, Audio, 3D at /image, /video, /audio, /3d (2026-10-31) */ || !!matchPage(path) || WF_PATH.test(path) || FILM_ID_PATH.test(path) || /^\/(tools|jobs|share|models)\/[^/]+\/?$/.test(path) || isAssetsPath(path);
/** PB-22: Assets and its section / media paths (/assets/trash, /assets/videos…; /history is the old name). */
/* 'elements' stays a known path so old /assets/elements links open Assets (History rewrites the URL) */
export const ASSET_SLUGS = ['projects', 'favourites', 'favorites', 'elements', 'brands', 'brand' /* Brands (2026-10-27); /assets/brand is the first name, rewritten to /assets/brands */, 'trash', 'images', 'videos', 'video', 'audio', 'enhanced'];
export const isAssetsPath = (path: string) => { const m = /^\/(history|assets)(?:\/([a-z]+))?\/?$/.exec(path); return !!m && (!m[2] || ASSET_SLUGS.includes(m[2])); };
