/**
 * The Audio tab's feed (2026-10-27): every result of the Audio workflows (music, sound effects, voice, sound for a video), on the same shared
 * feed as Image and Video (GET /api/jobs?audioFeed=, web ui/next/feed). A job belongs here by the tool and mode that made it (the Audio
 * workflow it ran), not by its file type: "Sound for a video" makes a clip and still shows in Audio (and in Video, by its output).
 * The voice tool's lip-sync runs are Video's (Lip Sync workflow), never Audio's.
 *
 * Isomorphic (no server imports): the web app imports it too.
 */
import { FEED_GROUP_PREFIX, jobModes, type FeedJob, type FeedGroup } from './mediaFeed.js';
import { audioWorkflowForToolMode, type AudioWorkflowId } from './audioWorkflows.js';

/** The tools the Audio workflows run on. */
export const AUDIO_FEED_TOOLS = ['audio', 'voice', 'soundtrack'];
/** Every audio result (the tab's landing feed). */
export const ALL_AUDIO_FEED = 'all';
/** Filter › Type in the Audio tab. Ids never clash with Image's or Video's chips (Video already has group:sound). */
export const AUDIO_FEED_GROUPS: FeedGroup[] = [
  { id: ALL_AUDIO_FEED, label: 'All', noun: 'sounds', workflows: [] },
  { id: `${FEED_GROUP_PREFIX}music`, label: 'Music', noun: 'tracks', workflows: ['music', 'cover'] },
  { id: `${FEED_GROUP_PREFIX}sfx`, label: 'Sound effects', noun: 'sound effects', workflows: ['sfx'] },
  { id: `${FEED_GROUP_PREFIX}voice`, label: 'Voice', noun: 'voice results', workflows: ['voiceover', 'change-voice', 'translate'] },
  { id: `${FEED_GROUP_PREFIX}for-video`, label: 'For a video', noun: 'sounds for a video', workflows: ['soundtrack-music', 'soundtrack-sound'] },
];
export const audioFeedOf = (id: string | null | undefined): FeedGroup | null => AUDIO_FEED_GROUPS.find((g) => g.id === (id || ALL_AUDIO_FEED)) ?? null;

/** The Audio workflow a job ran (its tool + the first mode that maps to one); null = none (an older run with no mode, or another tool). */
export function audioWorkflowOfJob(j: FeedJob): AudioWorkflowId | null {
  const tid = String(j.toolId ?? ''); if (!AUDIO_FEED_TOOLS.includes(tid)) return null;
  for (const m of jobModes(j)) { const w = audioWorkflowForToolMode(tid, m); if (w) return w; }
  return null;
}
/** Is this job in that Audio feed (`feed` = 'all' or a chip id)? A run with no mode at all still counts in All (older runs). */
export function inAudioFeed(j: FeedJob, feed: string | null | undefined = ALL_AUDIO_FEED): boolean {
  const g = audioFeedOf(feed); if (!g) return false;
  const tid = String(j.toolId ?? ''); if (!AUDIO_FEED_TOOLS.includes(tid)) return false;
  const modes = jobModes(j); if (modes.includes('lipsync')) return false;
  const w = audioWorkflowOfJob(j);
  if (g.id === ALL_AUDIO_FEED) return !!w || !modes.length;
  return !!w && g.workflows.includes(w);
}
