/**
 * The AI dock's non-visual parts (AgentPanel.tsx, AgentMediaCard.tsx and FollowAgent.tsx draw): starter chips, feed / proposal merging,
 * the "Follow agent" state and the cards the agent is working on, and where "Open in tool" goes. No components here, so the dock's
 * view files stay Fast Refresh friendly.
 */
import { atom } from 'tldraw';
import { flowById, flowInfo } from '../shared/genFlows';
import { catalogNow } from './catalog';
import { workflowOpenOf, withSearch } from '../shared/workflowLinks';
import type { FeedEntry, Proposal } from './agentBridge';

export const DOCK_W = 380;

/** The dock's starters (the server has the same list at GET /api/canvas/agent/starters; this is the offline copy). */
export const STARTERS = [
  { id: 'short', label: 'Short film from idea', hint: 'Beats, cast, key frames, film', icon: 'film', prompt: 'A short film: on the night the town turns off the last harbor lamp, a girl sets a paper boat on the water, and every dark window answers.' },
  { id: 'film', label: 'Make a 30s film', hint: 'Five shots, clips and music', icon: 'film', prompt: 'Make a 30s film: a lighthouse keeper finds a glowing bottle on the shore at dawn.' },
  { id: 'product', label: 'Product shots', hint: 'Hero, lifestyle, detail, flat lay', icon: 'product', prompt: 'Product shots for a matte orange water bottle: hero, lifestyle, detail and flat lay.' },
  { id: 'storyboard', label: 'Storyboard from a script', hint: 'One panel per beat', icon: 'storyboard', prompt: 'Storyboard from a script:\nINT. NIGHT MARKET – A girl buys a paper lantern. It lifts her off the ground. She floats over the stalls, laughing, and lands on a rooftop where an old man is waiting with tea.' },
  { id: 'mood', label: 'Mood board', hint: 'Palette, wardrobe, set, light', icon: 'mood', prompt: 'A mood board for a desert sci-fi short: palette, wardrobe, set and light.' },
] as const;
export type StarterId = (typeof STARTERS)[number]['id'];

export function mergeFeed(prev: FeedEntry[], incoming: FeedEntry[]) {
  const map = new Map(prev.map((e) => [e.seq, e])); for (const e of incoming) if (e?.seq) map.set(e.seq, e);
  return [...map.values()].sort((a, b) => a.seq - b.seq).slice(-240);
}
export { mergeProposals } from './proposalMerge';

/** The newest plan the agent posted and how many of its steps are done (later messages of the same run carry stepsDone). */
export function planOf(feed: FeedEntry[]): { seq: number; runId: string | null; title: string; steps: string[]; done: number; finished: boolean; tracker: boolean; stopped: boolean } | null {
  const at = [...feed].reverse().find((e) => e.type === 'message' && Array.isArray(e.meta?.plan));
  if (!at) return null; const runId = at.meta?.runId ?? null;
  let done = 0; let finished = false; let stopped = false;
  for (const e of feed) if (e.seq > at.seq && e.meta?.runId === runId) { if (typeof e.meta?.stepsDone === 'number') done = Math.max(done, e.meta.stepsDone); if (e.meta?.finished) finished = true; if (e.meta?.stopped) stopped = true; }
  return { seq: at.seq, runId, title: String(at.meta?.title ?? 'Plan'), steps: at.meta.plan.map(String), done, finished, tracker: at.meta?.tracker === true, stopped };
}

/** The agent's newest "Looks good?" ask that nobody has answered yet (any message from you after it answers it). */
export function confirmOf(feed: FeedEntry[]): { id: string; label: string; seq: number } | null {
  const at = [...feed].reverse().find((e) => e.type === 'message' && e.from === 'agent' && e.meta?.confirm?.id);
  if (!at || feed.some((e) => e.seq > at.seq && e.type === 'message' && (e.from === 'user' || e.meta?.stopped || e.meta?.finished || e.meta?.error))) return null;
  return { id: String(at.meta.confirm.id), label: String(at.meta.confirm.label ?? 'Looks good'), seq: at.seq };
}

// ---------------------------------------------------------------- Follow agent
const FOLLOW_KEY = 'ohf-canvas-follow-agent';
const readFollow = () => { try { return localStorage.getItem(FOLLOW_KEY) !== '0'; } catch { return true; } };
/** On by default: the board pans / zooms to what the agent is working on. A manual pan or zoom turns it off. */
export const followAtom = atom<boolean>('ohf-follow-agent', readFollow());
export const setFollow = (v: boolean) => { followAtom.set(v); try { localStorage.setItem(FOLLOW_KEY, v ? '1' : '0'); } catch { /* private window */ } };
/** The cards the agent is busy with right now (the newest adds of a run, or the cards a Go just started). `key` changes on every update. */
export const agentFocusAtom = atom<{ ids: string[]; key: number } | null>('ohf-agent-focus', null);
let recent: { runKey: string; ids: string[] } = { runKey: '', ids: [] };
/** A card the agent added: follow the newest few of this run together, so the camera frames the board as it grows. */
export function focusAdded(runKey: string, id: string, move = true) {
  if (recent.runKey !== runKey) recent = { runKey, ids: [] };
  recent.ids = [...recent.ids.filter((x) => x !== id), id].slice(-6);
  if (move) agentFocusAtom.set({ ids: [...recent.ids], key: Date.now() }); /* the agent's hand moves the camera itself (agentHand.workArea) */
}
export function focusCards(ids: string[]) { if (ids.length) agentFocusAtom.set({ ids: [...ids], key: Date.now() }); }

// ---------------------------------------------------------------- Open in tool
/** The tool page a card's workflow runs on, with its finished job's settings when there is one (the same ?recreate= the feed uses). */
export function toolHrefOf(flowId: string, jobId?: string | null): string | null {
  const f = flowById(flowId); if (!f) return null; const cat = catalogNow(); const toolId = cat ? flowInfo(f, cat).toolId : f.toolId; if (!toolId) return null;
  /* the workflow's own tab (shared/workflowLinks, the same links Assets and the viewer use): Image recipes on Create Image, video flows on the
     Video page (Lip Sync too, not Audio), Music / Sound effects / Text to speech on Audio, Image to 3D on the 3D page */
  const base = f.medium === 'image' && f.id !== 'create' ? `/tools/create-image?workflow=${encodeURIComponent(f.id)}` : workflowOpenOf({ toolId, input: f.types ? { types: [f.types] } : {} });
  return jobId ? withSearch(base, `recreate=${encodeURIComponent(jobId)}`) : base;
}

export { agentStarterPrompt, dockRoute, dockState, dockStatusLine, dockPill, workingLine, messageStatus, messageStatusText, listenCommand, LISTEN_PHRASE, type DockState, type MsgStatus } from './dockAgent';
