import { jobs } from '../jobs.js';
/**
 * Round 1 (S2/J14): readable names for Story jobs. The stitched parent is "Story · 3 shots" (or the story's title);
 * each shot job is "Shot 2". null for every other job (callers keep the tool name).
 */
export function storyLabelOf(j: any): string | null {
  const st = j?.input?.story;
  if (st && Array.isArray(st.shots)) return (typeof st.title === 'string' && st.title.trim()) || `Story · ${st.shots.length} shot${st.shots.length === 1 ? '' : 's'}`;
  const p: any = j?.parentId ? jobs.get(j.parentId) : null; const ps = p?.input?.story;
  if (!ps || !Array.isArray(ps.shots)) return null;
  const k = ps.shots.findIndex((s: any) => s.jobId === j.id || (Array.isArray(s.attempts) && s.attempts.includes(j.id)));
  return k >= 0 ? `Shot ${k + 1}` : null;
}
