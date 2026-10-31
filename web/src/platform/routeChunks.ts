/**
 * Route-level code splitting (performance, MODEL-PICKER-REVIEW task 11). Each page's code is its own chunk, loaded when the
 * route renders; nav links prefetch the chunk on hover / focus (router.tsx Link → prefetchRoute), so a click rarely waits.
 * Components keep their names and props; only how they are loaded changes. The Suspense fallback is the app's usual
 * loading skeleton (App.tsx).
 */
import { VIDEO_PAGE } from '../../../server/src/shared/videoWorkflows';
import { lazy, type ComponentType } from 'react';
import { videoBarOf } from '../../../server/src/shared/videoBar';

type Loader<T = any> = () => Promise<T>;
/** One import per module, remembered, so prefetch and render share it. */
const once = <T,>(f: Loader<T>): Loader<T> => { let p: Promise<T> | null = null; return () => (p ??= f().catch(e => { p = null; throw e; })); };
const named = <M, K extends keyof M>(load: Loader<M>, k: K) => lazy(() => load().then(m => ({ default: m[k] as unknown as ComponentType<any> })));

export const L = {
  home: once(() => import('../ui/Home')),
  history: once(() => import('./History')),
  job: once(() => import('./JobPage')),
  backlog: once(() => import('../ui/pages/Backlog')),
  videoBar: once(() => import('../ui/video/VideoWorkflowBar')), // One Video page (2026-10-25): a picked workflow in the Video bar
  stitch: once(() => import('../ui/video/StitchPanel')), // Video: Stitch, the timeline workflow (2026-10-27): its own panel, not a bar recipe
  videoPage: once(() => import('../ui/video/VideoPage')), // the Video page's shell and its one feed (2026-10-26): only the bar below changes with the workflow
  app: once(() => import('../tools/app/AppTool')),
  faceSwap: once(() => import('../tools/imageApps/FaceSwapTool')),
  shots: once(() => import('../tools/imageApps/ShotsTool')),
  film: once(() => import('../ui/film/FilmPage')), // Film (2026-10-27): /film and /film/:id
  canvas: once(() => import('../canvas/CanvasPage')), // the Canvas board (2026-10-24): tldraw loads with this chunk only
  threeD: once(() => import('../ui/three/ThreeDStudio')), // the 3D page (2026-10-23); <model-viewer> loads later, on first view
  learnEcom: once(() => import('../learn/EcomBook')), // the e-commerce pop-up book (2026-10-24): three.js and the book's fonts load with this chunk only
  pages: once(() => import('../ui/pages/Pages')),
  workflowPages: once(() => import('../ui/pages/WorkflowPages')),
  spend: once(() => import('../ui/Spend')),
  licenses: once(() => import('./Licenses')),
  settings: once(() => import('./Settings')),
  terms: once(() => import('../ui/pages/TermsPage')),
};
export type ChunkKey = keyof typeof L;

export const Home = named(L.home, 'default');
export const History = named(L.history, 'default');
export const JobPage = named(L.job, 'default');
export const SharePage = named(L.backlog, 'SharePage');
export const ModelPage = named(L.backlog, 'ModelPage');
export const VideoWorkflowBar = named(L.videoBar, 'default');
export const VideoPage = named(L.videoPage, 'default');
export const StitchPanel = named(L.stitch, 'default');
export const AppTool = named(L.app, 'default');
export const FaceSwapTool = named(L.faceSwap, 'default');
export const ShotsTool = named(L.shots, 'default');
export const ThreeDStudio = named(L.threeD, 'default');
export const WorkflowPage = named(L.workflowPages, 'WorkflowPage');
export const LookPage = named(L.workflowPages, 'LookPage');
export const PageComps = {
  ApiDocs: named(L.pages, 'ApiDocs'), Mcp: named(L.pages, 'Mcp'), Plugins: named(L.pages, 'Plugins'), Community: named(L.pages, 'Community'),
  Workflows: named(L.pages, 'Workflows'), Models: named(L.pages, 'Models'),
  Browse: named(L.pages, 'Browse'), Profile: named(L.pages, 'Profile'), RecipeImport: named(L.pages, 'RecipeImport'),
  Canvas: named(L.canvas, 'default'), Film: named(L.film, 'default'), LearnEcom: named(L.learnEcom, 'default'),
  SpendOrUsage: named(L.spend, 'SpendOrUsage'), Licenses: named(L.licenses, 'default'), Settings: named(L.settings, 'default'), TermsPage: named(L.terms, 'default'),
};

/** Tool screen (server `ui` key or tool id) → chunk; mirrors tools/index.ts. */
export const SCREEN_CHUNK: Record<string, ChunkKey> = {
  app: 'app', /* Object Swap, Motion Control, Restyle and Re-shoot run in the Video bar (2026-10-26): no screens of their own */ /* Director removed (2026-10-23): /tools/cinema redirects to the Video page */
  /* Extend, Reframe, SDR to HDR, FPS Boost, Depth Map, Remove BG and Video Upscale run in the Video page's bar (videoBar, 2026-10-25) */
  'app-face-swap': 'faceSwap', 'app-person-swap': 'faceSwap', 'app-shots': 'shots', 'three-d': 'threeD',
};
const PAGE_CHUNK: Record<string, ChunkKey> = {
  '/mcp': 'pages', '/api-docs': 'pages', '/plugins': 'pages', '/community': 'pages', '/workflows': 'pages', '/models': 'pages', '/presets': 'pages',
  '/image': 'pages', '/audio': 'pages', '/profile': 'pages', '/settings': 'settings', '/licenses': 'licenses', '/canvas': 'canvas', '/film': 'film', '/learn/ai-ecommerce': 'learnEcom',
  '/account/usage': 'spend', '/usage': 'spend', '/spend': 'spend', '/terms': 'terms', '/usage-notes': 'terms',
};
/** /tools/<x> → screen key; App registers this from the tool registry (route / id → tool.id, tool.ui). */
let toolScreenOf: (path: string) => string[] = () => [];
export const setToolScreenResolver = (f: (path: string) => string[]) => { toolScreenOf = f; };

/** The chunk(s) a path needs. */
export function chunksFor(to: string): ChunkKey[] {
  let path = to, search = ''; try { const u = new URL(to, location.origin); path = u.pathname; search = u.search; } catch { /* keep */ }
  path = path.replace(/\/+$/, '') || '/';
  if (path === '/') return ['home'];
  if (PAGE_CHUNK[path]) return [PAGE_CHUNK[path]];
  if (/^\/film\/[^/]+$/.test(path)) return ['film'];
  if (/^\/(assets|history)(\/|$)/.test(path)) return ['history'];
  if (/^\/jobs\//.test(path)) return ['history', 'job'];
  if (/^\/workflows\/[^/]+/.test(path)) return ['workflowPages'];
  if (/^\/(share|models)\//.test(path)) return ['backlog'];
  if (path === VIDEO_PAGE) { const w = new URLSearchParams(search).get('workflow'); return w === 'stitch' ? ['videoPage', 'stitch'] : w && videoBarOf(w) ? ['videoPage', 'videoBar'] : ['videoPage', 'app']; } // One Video page: the shell and its feed, plus the bar (a workflow's, or Create Video's screen)
  if (path.startsWith('/tools/')) { const ks = toolScreenOf(path).map(k => SCREEN_CHUNK[k]).filter(Boolean); return ks.length ? [ks[0]] : []; }
  return [];
}
/** Start loading a route's code (hover / focus on a link). Errors are ignored here; the real render retries. */
export function prefetchRoute(to: string) { for (const k of chunksFor(to)) L[k]().catch(() => undefined); }
