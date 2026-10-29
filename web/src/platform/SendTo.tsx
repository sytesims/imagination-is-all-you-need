import { recreateHref, toolHandoffHref, withSearch } from '../shared/workflowLinks';
import type { JobState, ToolInfo } from '../api';
import { navigate } from './router';

export type Medium = 'image' | 'video' | 'audio';
const MEDIA_RX: [Medium, RegExp][] = [['image', /\.(png|jpe?g|webp|gif|avif)(\?|$)/i], ['video', /\.(mp4|webm|mov|m4v)(\?|$)/i], ['audio', /\.(m4a|wav|mp3|ogg|flac|aac|opus)(\?|$)/i]];
/** What an output is: the server's `kind`, else its file extension, else the tool's own medium. */
export function outputMedium(job: JobState, tools: ToolInfo[] = [], out = 0): Medium | null {
  const o: any = job.outputs[out] ?? job.outputs[0]; const k = o?.kind; if (k === 'image' || k === 'video' || k === 'audio') return k;
  const url = o?.url ?? job.resultUrl ?? ''; const hit = MEDIA_RX.find(([, rx]) => rx.test(url)); if (hit) return hit[0];
  return tools.find(t => t.id === job.toolId)?.media ?? null;
}
/** Which media a tool can take as an input, from its file inputs. Same slots the server's send-to prefill fills (routesPrefill slotFor):
 *  video → an input named `video`; image → `image` or `refs`; audio → any file input whose accept is audio. */
export function takes(t: ToolInfo): Set<Medium> {
  const s = new Set<Medium>(); for (const i of t.inputs ?? []) { if (i.kind !== 'file' && i.kind !== 'files') continue;
    if (i.name === 'video') s.add('video'); else if (i.name === 'image' || i.name === 'refs') s.add('image'); else if (/audio/.test(i.accept ?? '')) s.add('audio'); }
  return s;
}
/** Tools that take this asset's output medium (image → image-input tools, video → video-input tools, audio → audio-input tools). */
export function sendTargets(job: JobState, tools: ToolInfo[], out = 0) {
  if (!job.outputs.length) return []; const m = outputMedium(job, tools, out); if (!m) return [];
  return tools.filter(t => takes(t).has(m));
}
/** Relight, Face Swap, Upscale… open Create Image with that workflow picked (shared/workflowLinks.ts); other tools open their own page. */
export const sendUrl = (job: JobState, tool: ToolInfo, out = 0) => toolHandoffHref(tool, `fromJob=${encodeURIComponent(job.id)}&out=${out}`);
/** The last 5 Send to targets (newest first), kept in localStorage. */
const RK = 'oj:send-recent';
export const recentSends = (): string[] => { try { const v = JSON.parse(localStorage.getItem(RK) ?? '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 5) : []; } catch { return []; } };
export const noteSend = (id: string) => { try { localStorage.setItem(RK, JSON.stringify([id, ...recentSends().filter(x => x !== id)].slice(0, 5))); } catch { /* storage off */ } };
const MEDIUM_LABEL: Record<string, string> = { image: 'Image tools', video: 'Video tools', audio: 'Audio tools' };
/** Targets ordered for a menu: recent first, then the rest grouped by the tool's medium (the asset's own medium first). */
export function sendGroups(job: JobState, tools: ToolInfo[], out = 0): { label: string; items: ToolInfo[] }[] {
  const ts = sendTargets(job, tools, out); const rec = recentSends(); const own = outputMedium(job, tools, out);
  const recent = rec.map(id => ts.find(t => t.id === id)).filter((t): t is ToolInfo => !!t); const rest = ts.filter(t => !recent.includes(t));
  const order = [own, ...(['image', 'video', 'audio'] as const).filter(m => m !== own)];
  return [{ label: 'Recent', items: recent }, ...order.map(m => ({ label: MEDIUM_LABEL[m ?? ''] ?? 'Tools', items: rest.filter(t => (t.media ?? 'video') === m) })), { label: 'Other tools', items: rest.filter(t => !['image', 'video', 'audio'].includes(t.media ?? 'video')) }].filter(g => g.items.length);
}
export const sendTo = (job: JobState, t: ToolInfo, out = 0) => { noteSend(t.id); navigate(sendUrl(job, t, out)); };

/** "Send to another tool" (minimal control; styling owned by Design Planner). */
export default function SendTo({ job, tools, out = 0 }: { job: JobState; tools: ToolInfo[]; out?: number }) {
  const targets = sendTargets(job, tools, out);
  if (job.status !== 'done' || !targets.length) return null;
  return (
    <label className="send-to-wrap"><span aria-hidden>↗</span><select className="send-to" aria-label="Send to another tool" value="" onChange={e => { const t = tools.find(x => x.id === e.target.value); if (t) sendTo(job, t, out); }}>
      <option value="">Send to…</option>
      {targets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select></label>
  );
}
/** "Use as reference": an image result goes into the references of the tool that made it (when it takes refs), else Create Image. */
export function refTarget(job: JobState, tools: ToolInfo[], out = 0): { tool: ToolInfo; url: string } | null {
  if (job.status !== 'done' || outputMedium(job, tools, out) !== 'image') return null; const hasRefs = (t?: ToolInfo) => !!t?.inputs?.some(i => i.name === 'refs');
  const own = tools.find(t => t.id === job.toolId); const t = hasRefs(own) ? own! : tools.find(x => x.id === 'create-image' && hasRefs(x)); if (!t) return null;
  return { tool: t, url: withSearch(t.route, `fromJob=${encodeURIComponent(job.id)}&out=${out}&as=ref`) };
}
/** Recreate: the tool that made it, with its settings prefilled (GET /api/jobs/:id/prefill?action=recreate via ?recreate=). */
export const recreateUrl = (job: JobState, tools: ToolInfo[]) => { const t = tools.find(x => x.id === job.toolId); return t && !(job as any).sample ? { tool: t, url: recreateHref(job, tools)! } : null; };
