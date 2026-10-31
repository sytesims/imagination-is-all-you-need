import { RunSetupHost } from './ui/setup/RunSetup';
import { installMediaFallback } from './shared/mediaFallback';
import { ConnectSheetHost } from './shared/ConnectSheet';
import { installRadioKeys } from './shared/radioKeys';
installRadioKeys();
import { installEnterSubmit } from './shared/enterSubmit';
installEnterSubmit();
import { DialogHost } from './shared/Dialog';
import { SaveLookHost } from './shared/SaveLookDialog';
import { matchPage, isKnownPath, isAssetsPath, WF_PATH, FILM_ID_PATH } from './platform/router';
import { PageComps } from './platform/routeChunks';
import { featureForPath } from './shared/imageFeatures';
import NotFound from './platform/NotFound';
import { Suspense, useEffect, useRef, useState } from 'react';
import { listRoadmap, listTools, ToolInfo } from './api';
import { toolScreens } from './tools';
import { ToastProvider } from './shared/Toast';
import { MediaPickerHost } from './shared/MediaPicker';
import { TooltipLayer } from './shared/Tooltip';
import { GenWhyHost } from './shared/GenWhy';
import { navigate, usePath, useSearch } from './platform/router';
import { setVideoWorkflowTools, currentVideoWorkflow, VIDEO_PAGE } from './ui/video/VideoWorkflows';
import { isPanelWorkflow } from '../../server/src/shared/videoWorkflows';
import { currentAudioWorkflow, AUDIO_PAGE } from './ui/audio/AudioWorkflows';
import { videoBarOf } from '../../server/src/shared/videoBar';
import { withSearch } from './shared/workflowLinks';
/* Pages load as their own chunks (platform/routeChunks.ts): same components, rendered under the Suspense below. */
import { VideoWorkflowBar, VideoPage, StitchPanel, History, JobPage, SharePage, ModelPage, Home, WorkflowPage, LookPage, setToolScreenResolver } from './platform/routeChunks';
import ToolPending from './ui/ToolPending';
import { useTools } from './shared/useTools';
import { OfflineBanner, EdgeHost, isRestartError } from './ui/edge/Edge';
import { InlineError } from './shared/InlineError';
import { Skeleton } from './shared/Skeleton';
import { REPO_URL } from './shared/brand';
import { AnnounceBar, MobileTabs, MobileTop, TopNav, setRoadmap } from './ui/Shell';

/** Platform shell: top nav grouped by registry category (desktop) / top bar + tab bar (mobile). Routes: / Explore, /tools/:toolId, /assets (alias /history). */
/** Routes rendered only once the tool registry has loaded. */
const NEEDS_TOOLS = /^\/(?:$|assets$|history$|tools\/|jobs\/)/; /* /camera-moves and /photo-fx redirect to the Video page (2026-10-25) */
export default function App() {
  const path = usePath(); const search = useSearch();
  /* the first-paint skeleton takes the shape of the page that's coming: the Audio tab's even grid of cards (UX audit #20), else the generic tiles */
  const audioRoute = /^\/tools\/(audio|voice|soundtrack)(\/|$)/.test(path); const skelCls = audioRoute ? 'loading loading-audio' : 'loading'; const skelN = audioRoute ? 8 : 6;
  /** Tool registry with error state + auto-retry every 3 s (shared/useTools). */
  const { tools, error: err, failure, retry: retryTools } = useTools();
  useEffect(() => { listRoadmap().then(r => setRoadmap(r.map(x => x.name))).catch(() => {}); }, []);
  /* Assets ⇄ the /jobs/:id viewer over it keeps the grid's scroll position; every other route change starts at the top. */
  const lastPath = useRef(path); useEffect(() => { const was = lastPath.current; lastPath.current = path; const lib = /^\/(assets|history|jobs\/)/; if (lib.test(was) && lib.test(path)) return; window.scrollTo(0, 0); }, [path]);

  const m = path.match(/^\/tools\/([^/]+)/);
  const toolId = m?.[1];
  /* Images: a tool is found by its page URL (plain names: /tools/brush-edit, /tools/camera-angles), else by id (old /tools/app-inpaint URLs, redirected below);
     Camera & Lens (/tools/camera-lens) is Create Image with the camera rig, shown under its own name. */
  const feat = featureForPath(path);
  const tool0 = tools.find(t => t.route === path) ?? tools.find(t => t.id === toolId) ?? (feat ? tools.find(t => t.id === feat.toolId) : undefined);
  const tool = tool0 && feat && feat.toolId === tool0.id && tool0.route !== feat.route ? { ...tool0, name: feat.name, featureId: feat.id } as ToolInfo : tool0;
  useEffect(() => { if (tool0 && toolId === tool0.id && tool0.route && tool0.route !== path && tool0.route.startsWith('/tools/')) navigate(withSearch(tool0.route, location.search), { replace: true }); }, [tool0?.id, path]);
  const Comp = tool ? (toolScreens[tool.id] ?? toolScreens[tool.ui]) : undefined;
  /* Link prefetch (routeChunks): /tools/<x> → the screen chunk it needs, by the same lookup as above */
  useEffect(() => { setToolScreenResolver((p) => { const id = p.match(/^\/tools\/([^/?#]+)/)?.[1]; const f = featureForPath(p);
    const t = tools.find(x => x.route === p) ?? tools.find(x => x.id === id) ?? (f ? tools.find(x => x.id === f.toolId) : undefined); return t ? [t.id, t.ui] : []; }); }, [tools]);
  /* One Video page (2026-10-23): /tools/h3-video?workflow=<id> renders that workflow's own tool screen (its inputs, models, quote and submit); no workflow = Create Video. */
  setVideoWorkflowTools(tools);
  const vwf = path === VIDEO_PAGE ? currentVideoWorkflow(search) : null;
  const vwfTool = vwf && vwf.id !== 'create' && vwf.toolId ? tools.find(t => t.id === vwf.toolId) : undefined;
  /* One Audio page (2026-10-23): /tools/audio?workflow=<id> renders the workflow's own tool (audio / voice / soundtrack) in the Audio bar; no workflow = Music. */
  const awf = path === AUDIO_PAGE ? currentAudioWorkflow(search) : null;
  const awfTool = awf ? tools.find(t => t.id === awf.tool) : undefined;
  const AwfComp = awfTool ? (toolScreens[awfTool.id] ?? toolScreens[awfTool.ui]) : undefined;
  const isAssets = isAssetsPath(path); /* PB-22: /assets and /assets/<section|media> */
  const jobMatch = path.match(/^\/jobs\/([^/]+)/);

  let body: React.ReactNode; let title = 'Explore';
  if (err && !matchPage(path)) body = <div className="server-down-inline"><InlineError what={toolId ? 'this tool' : 'this page'} error={isRestartError(err) ? new Error('restarting') : failure ?? new Error(err)} onRetry={retryTools} /></div>;
  else if (matchPage(path)) { const [t, P] = matchPage(path)!; title = t; body = <P tools={tools} />; }
  else if (FILM_ID_PATH.test(path)) { title = 'Editor'; body = <PageComps.Film tools={tools} />; } // Film (2026-10-27): one film's editor (the list is PAGES /film)
  else if (WF_PATH.test(path)) { const [, wid, lid] = WF_PATH.exec(path)!; title = 'Workflows'; body = lid ? <LookPage key={`${wid}/${lid}`} id={decodeURIComponent(wid)} lookId={decodeURIComponent(lid)} /> : <WorkflowPage key={wid} id={decodeURIComponent(wid)} />; } // Workflows redesign (2026-10-23): a workflow's page and one look's page
  else if (/^\/share\/[^/]+/.test(path)) { title = 'Shared'; body = <SharePage key={path} token={path.split('/')[2]} />; }
  else if (/^\/models\/[^/]+/.test(path)) { title = 'Model'; body = <ModelPage key={path} id={decodeURIComponent(path.split('/')[2])} />; }
  /* C3: /jobs/:id is an overlay over Assets. The Assets page stays mounted at the same spot (filters and scroll survive), inert underneath. */
  else if (isAssets || (jobMatch && tools.length)) { title = jobMatch ? 'Asset' : 'Assets';
    body = <><div className={jobMatch ? 'assets-under' : 'assets-host'} {...(jobMatch ? { inert: '', 'aria-hidden': true } as any : {})}><History tools={tools} /></div>{jobMatch && <JobPage id={jobMatch[1]} tools={tools} />}</>; }
  /* One Video page (2026-10-25, steps 2 and 3): every video workflow runs in the Video page's own bar (ui/video/VideoWorkflowBar.tsx, recipes in shared/videoBar.ts); no workflow has a screen of its own */
  /* One Video feed (2026-10-26): the Video page (ui/video/VideoPage) owns the feed and stays mounted; only the bar inside it is keyed by the workflow */
  /* Stitch (2026-10-27): the timeline is its own panel on POST /api/compose (ffmpeg here), no registry tool, so it never waits on the tool list */
  else if (path === VIDEO_PAGE && new URLSearchParams(search).get('workflow') === 'two-person-swap') {
    title = 'Swap Two People'; body = <section className="page" data-testid="retired-two-person-swap"><h1>Swap Two People is no longer in the workflow picker</h1>
      <p>This saved run used two replacement photos and a two-pass workflow. Object / Person Swap replaces one selected subject; it cannot recreate this run without losing inputs.</p>
      <p>Your original run, model details and outputs are unchanged. No inputs have been transferred.</p>
      <a href="/tools/h3-video?workflow=object-swap">Start a new Object / Person Swap</a> · <a href="/assets">View saved runs</a></section>;
  }
  else if (vwf && isPanelWorkflow(vwf)) { title = vwf.name; body = <VideoPage workflowId={vwf.id} tools={tools}><StitchPanel key={`vbar-${vwf.id}`} wf={vwf} tools={tools} /></VideoPage>; }
  else if (vwf && vwfTool && videoBarOf(vwf.id)) { title = vwf.name; body = <VideoPage workflowId={vwf.id} tools={tools}><VideoWorkflowBar key={`vbar-${vwf.id}`} wf={vwf} bar={videoBarOf(vwf.id)!} tool={vwfTool} tools={tools} /></VideoPage>; }
  else if (awf && awfTool) { title = 'Audio'; body = AwfComp ? <AwfComp key={`awf-${awf.id}`} tool={awfTool} tools={tools} /> : <ToolPending tool={awfTool} />; }
  else if (vwf && toolId && Comp && tool) { title = tool.name; body = <VideoPage workflowId="create" tools={tools}><Comp key={path} tool={tool} tools={tools} /></VideoPage>; } /* Create Video: the same Video page, its bar is Create's */
  else if (toolId && Comp && tool) { title = tool.name; body = <Comp key={path} tool={tool} tools={tools} />; }
  else if (toolId && tool) { title = tool.name; body = <ToolPending tool={tool} />; }
  else if (toolId && tools.length) { title = 'Not found'; body = <NotFound path={path} />; } // S12: unknown tool ids (incl. roadmap ids) get the real not-found page
  else if (path === '/' && tools.length) body = <Home tools={tools} />;
  else if (tools.length || (!isKnownPath(path) && !NEEDS_TOOLS.test(path))) { title = 'Not found'; body = <NotFound path={path} />; } // BH4: routes that wait for the tool list show a skeleton, not a 404 flash
  else body = <div className={skelCls}><Skeleton variant="tiles" count={skelN} /></div>;

  /* BH4 P2 6: subtle page transition on route change (no remount, so tool state and drafts are untouched; off with reduced motion) */
  const mainRef = useRef<HTMLElement>(null); const firstPath = useRef(true);
  useEffect(() => installMediaFallback(document), []);
  useEffect(() => { if (firstPath.current) { firstPath.current = false; return; } if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; mainRef.current?.animate?.([{ opacity: 0.4, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.7,.3,1)' }); }, [path]);
  return (
    <ToastProvider><div className="app">
      <AnnounceBar />{/* the strip above the header on every page */}
      <TopNav tools={tools} path={path} />
      <OfflineBanner />
      <MobileTop title={title} tools={tools} path={path} />
      <main ref={mainRef} className={`main ${toolId ? 'main-tool' : ''}`}>
        <Suspense fallback={<div className={skelCls}><Skeleton variant="tiles" count={skelN} /></div>}>{body}</Suspense>
        <footer className="footer">Imagination Is All You Need · open source · runs on ComfyUI · AGPL-3.0 · <a className="footer-lic" href={REPO_URL} target="_blank" rel="noopener noreferrer" data-testid="footer-source">Source code</a>{/* AGPL section 13: people using the app over a network can get its source */} · <a className="footer-lic" href="/licenses">Models &amp; licences</a> · <a className="footer-lic" href="/terms">Usage notes</a> · Not affiliated with Higgsfield</footer>
      </main>
      <MobileTabs tools={tools} path={path} />
      <EdgeHost />
      <DialogHost /><MediaPickerHost />{/* the one media picker for every upload slot (shared/MediaPicker.tsx) */}<SaveLookHost /><GenWhyHost /><RunSetupHost /><ConnectSheetHost /><TooltipLayer />
    </div></ToastProvider>
  );
}
