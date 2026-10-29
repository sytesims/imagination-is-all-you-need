/**
 * One Video feed (user, 2026-10-26: "one Video feed always, workflow only changes the bar"). The Video page (ui/video/VideoPage.tsx) renders the
 * feed once; the bar below it (Create Video's VideoStudio, or a workflow's VideoWorkflowBar) only hands it what is the bar's own: its live runs,
 * the viewer's run-again actions and what opening a clip selects. Switching workflows swaps the bar, never the feed.
 */
import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react';
import type { JobState } from '../../api';

export interface VideoFeedSlot {
  /** the bar's own runs (the feed also watches every active job) */ jobs: JobState[];
  /** opening a clip selects it in the bar */ onSelect: (id: string) => void;
  /** the viewer's More items for a clip of the bar's workflow */ viewerActions?: (j: JobState, close: () => void) => ReactNode;
}
export const VideoFeedHost = createContext<((s: VideoFeedSlot) => void) | null>(null);

/** Hands the bar's part of the feed to the Video page's one feed. Returns false outside the Video page (the bar then renders its own feed). */
export function useHostedVideoFeed(s: VideoFeedSlot): boolean {
  const set = useContext(VideoFeedHost);
  useLayoutEffect(() => { set?.(s); }); /* every render: functions and runs stay current; the page re-renders the feed only when the runs change */
  return !!set;
}
