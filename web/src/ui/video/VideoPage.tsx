/**
 * The Video page's shell (2026-10-26, "one Video feed always, workflow only changes the bar"): the one feed above and the picked workflow's bar
 * below. Only the bar depends on the workflow (App.tsx keys and swaps it); the feed, its cards and a playing clip stay mounted across Create
 * Video and every workflow. The bar hands the feed its own part through ui/video/videoFeedSlot. The bars' code is preloaded here, so a switch
 * never waits on a chunk; if one still loads, only the bar area waits (its own Suspense), never the feed.
 */
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { JobState, ToolInfo } from '../../api';
import VideoFeed from './VideoFeed';
import { VideoFeedHost, type VideoFeedSlot } from './videoFeedSlot';
import { L } from '../../platform/routeChunks';
import './videoDock.css';
import './videoWorkflows.css';

const NO_JOBS: JobState[] = [];
export default function VideoPage({ workflowId, tools, children }: { /** the workflow in the bar ('create' = Create Video) */ workflowId: string; tools: ToolInfo[]; /** the bar */ children: ReactNode }) {
  const slot = useRef<VideoFeedSlot | null>(null); const [jobs, setJobs] = useState<JobState[]>(NO_JOBS);
  /* the latest bar's slot; the feed re-renders when its runs change */
  const host = useCallback((s: VideoFeedSlot) => { slot.current = s; setJobs(j => (j === s.jobs ? j : s.jobs)); }, []);
  /* preload both bars (Create Video's screen and the workflow bar) once the page is up, so switching never shows a loading state */
  useEffect(() => { const t = setTimeout(() => { void L.app().catch(() => undefined); void L.videoBar().catch(() => undefined); }, 0); return () => clearTimeout(t); }, []);
  const onSelect = useCallback((id: string) => slot.current?.onSelect(id), []);
  const viewerActions = useCallback((j: JobState, close: () => void) => slot.current?.viewerActions?.(j, close) ?? null, []);
  return <VideoFeedHost.Provider value={host}>
    <div className="vs vs-dk" data-testid="video-studio" data-workflow={workflowId}>
      <section className="vs-main" aria-label="Your videos">
        <VideoFeed jobs={jobs} onSelect={onSelect} workflowId={workflowId} viewerActions={viewerActions} tools={tools} />
      </section>
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  </VideoFeedHost.Provider>;
}
