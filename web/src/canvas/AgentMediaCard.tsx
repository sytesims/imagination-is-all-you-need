/**
 * One agent tool call in the AI dock, drawn as a media card: a live thumbnail of the card on the board (its take, a progress sweep while
 * it runs, the workflow icon while it's a draft), the workflow and the real model, the price (or Free), the status, and Keep / Re-roll /
 * Open in tool. Everything is read live from the board shape, so the card in the dock and the card on the board never disagree.
 * Re-roll never runs anything: it asks the server for a priced proposal, which waits for Go like every other run.
 */
import type { Editor } from 'tldraw';
import { useValue } from 'tldraw';
import { jobPct } from '../api';
import { navigate } from '../platform/router';
import { tip } from '../shared/Tooltip';
import { flowById, flowInfo, type GenMedium } from '../shared/genFlows';
import { catalogNow } from './catalog';
import { GEN_TYPE, type GenCardProps } from './cardModel';
import { liveJobs } from './genRun';
import { priceView } from './agentBridge';
import { toolHrefOf } from './agentDockModel';
import { FlowIcon } from './GenCardShape';
import { RetryIcon, PullOutIcon, CheckIcon } from './icons';
import { LOCAL_FREE } from '../../../server/src/shared/modelIds';

type Snap = { status: GenCardProps['status']; medium: GenMedium; flow: string; prompt: string; name: string; model: string; quote: any; jobId: string; error: string; kept: boolean;
  poster: string; url: string; kind: string; takes: number } | null;

function snapOf(editor: Editor, id: string): Snap {
  const s = editor.getShape(id as any); if (!s || s.type !== GEN_TYPE) return null; const p = s.props as GenCardProps; const t = p.takes?.[Math.min(p.take ?? 0, (p.takes?.length ?? 1) - 1)];
  return { status: p.status, medium: p.medium, flow: p.flow, prompt: p.prompt, name: String((s.meta as any)?.name ?? ''), model: p.model, quote: p.quote, jobId: p.jobId, error: p.error, kept: !!(s.meta as any)?.kept,
    poster: t?.poster || (t?.kind === 'image' ? t.url : '') || '', url: t?.url ?? '', kind: t?.kind ?? '', takes: p.takes?.length ?? 0 };
}

const STATUS: Record<string, string> = { draft: 'Draft', running: 'Running', done: 'Done', failed: 'Failed' };

export function AgentMediaCard({ editor, cardId, meta, onFocus, onReroll, rerolling }: { editor: Editor | null; cardId: string; meta: any; onFocus: (id: string) => void; onReroll: (id: string, title: string) => void; rerolling?: boolean }) {
  const s = useValue('dock card', () => (editor ? snapOf(editor, cardId) : null), [editor, cardId]);
  const job = useValue('dock card job', () => (s?.jobId ? liveJobs.get()[s.jobId] : undefined), [s?.jobId]);
  const flow = s?.flow ?? meta?.workflow ?? ''; const medium: GenMedium = (s?.medium ?? meta?.kind ?? 'image') as GenMedium;
  const name = (flowById(flow) ? flowInfo(flowById(flow)!, catalogNow()).name : null) ?? meta?.workflowName ?? 'Card'; /* a workflow card's own name (Material Swap), not its id */
  /* the shot name the agent gave the card ("Hero close-up"), else its prompt */
  const title = (s?.name || meta?.title || s?.prompt || name).replace(/\s+/g, ' ').trim();
  const model = s?.model || meta?.model || '';
  const pv = priceView(s && s.status !== 'draft' && s.quote ? s.quote : null) ?? meta?.price ?? null;
  const price = !pv ? null : pv.demo ? 'Sample' : pv.local ? LOCAL_FREE : pv.label; /* the same tokens as the Generate button (GenPrice) */
  const priceTip = !pv ? undefined : pv.demo ? 'Sample result: nothing is charged' : pv.local ? 'Free on your computer' : 'The quoted price for this run';
  const queued = s?.status === 'running' && (job?.status === 'queued' || !job);
  const pct = s?.status === 'running' && job ? jobPct(job) : 0;
  const status = !s ? 'Removed' : queued ? 'Queued' : s.status === 'running' ? (pct ? `${pct}%` : 'Running') : s.status === 'done' && s.takes > 1 ? `${s.takes} takes` : STATUS[s.status] ?? s.status;
  const href = s ? toolHrefOf(flow, s.status === 'done' ? s.jobId : null) : null;
  const keep = () => { if (!editor || !s) return; const sh = editor.getShape(cardId as any); if (!sh) return; editor.updateShape({ id: sh.id, type: sh.type, meta: { ...sh.meta, kept: !s.kept } } as any); };
  const busy = s?.status === 'running';

  return <article className={`ap-tc${s ? ` st-${s.status}` : ' st-gone'}${s?.kept ? ' kept' : ''}`} data-testid="agent-toolcard" data-status={s?.status ?? 'gone'} data-card={cardId}>
    <button type="button" className="ap-tc-main" disabled={!s} onClick={() => onFocus(cardId)} aria-label={`${name}: ${title}. Show it on the board`}>
      <span className={`ap-tc-thumb m-${medium}`} aria-hidden>
        {s?.poster ? <img src={s.poster} alt="" draggable={false} /> : s?.kind === 'video' && s.url ? <video src={s.url} muted playsInline preload="metadata" /> : <span className="ap-tc-ic"><FlowIcon flow={flow} medium={medium} size={18} /></span>}
        {busy && <span className="ap-tc-sweep" />}
        {s?.kept && <span className="ap-tc-kept"><CheckIcon size={11} /></span>}
      </span>
      <span className="ap-tc-t">
        <span className="ap-tc-tool">{name}</span>
        <b title={title}>{title}</b>
        <small>{model || 'Default model'}</small>
      </span>
      <span className="ap-tc-r">
        <span className={`ap-tc-st st-${s?.status ?? 'gone'}`} data-testid="agent-toolcard-status">{busy && <i className="ap-dot" />}{status}</span>
        {price && <span className="ap-tc-price" data-testid="agent-toolcard-price" {...tip(priceTip ?? null)}>{price}</span>}
      </span>
    </button>
    {busy && <span className="ap-tc-bar" aria-hidden><i style={{ width: `${queued ? 6 : Math.max(8, pct)}%` }} /></span>}
    {s?.status === 'failed' && s.error && <p className="ap-tc-err">{s.error}</p>}
    {s && <div className="ap-tc-acts">
      <button type="button" className={`ap-tc-a${s.kept ? ' on' : ''}`} aria-pressed={s.kept} data-testid="agent-keep" disabled={s.status !== 'done'} onClick={keep} {...tip(s.status !== 'done' ? 'Keep is for finished results' : s.kept ? 'Kept. Click to undo' : 'Keep this result (the agent leaves it alone)')}><CheckIcon size={13} />{s.kept ? 'Kept' : 'Keep'}</button>
      <button type="button" className="ap-tc-a" data-testid="agent-reroll" disabled={busy || s.status === 'draft' || s.kept || rerolling} onClick={() => onReroll(cardId, title)} {...tip(s.status === 'draft' ? 'Runs once you press Go' : 'Run it again with a new seed. Shows the price first')}><RetryIcon size={13} />{rerolling ? 'Pricing…' : 'Re-roll'}</button>
      <button type="button" className="ap-tc-a" data-testid="agent-open-tool" disabled={!href} onClick={() => href && navigate(href)} {...tip('Open in its tool with these settings')}><PullOutIcon size={13} />Open in tool</button>
    </div>}
  </article>;
}
