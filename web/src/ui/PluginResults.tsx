/**
 * The results side of a workflow from a folder (one you added, or an add-on), 2026-11-01: only your own runs of it, newest first, like the
 * built-in workflows' feeds. Before the first run a plain empty state (its name, one line, "Your results will show here"); never the shared
 * Library / Community / Looks blocks or stock example media (ui/Workspace.tsx shows those for the older built-in tools only).
 */
import { useEffect, useState } from 'react';
import { listJobs, STATE_LABELS, type JobState, type ToolInfo } from '../api';
import { Link } from '../platform/router';
import GenTile from '../shared/GenTile';
import { PluginBadge } from '../shared/PluginBadge';
import { ToolIconFor } from './Icons';
import WorkflowNeeds from './WorkflowNeeds';
import './pluginResults.css';

const isImg = (u?: string | null) => !!u && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u);
const active = (j: JobState) => j.status === 'running' || j.status === 'queued';

/** The small square at the top of the panel: the workflow's icon, never a stock clip. */
export function PluginTile({ tool }: { tool: ToolInfo }) {
  return <span className="plr-icon" aria-hidden><ToolIconFor id={tool.id} ui={tool.ui} size={22} /></span>;
}

export default function PluginResults({ tool, mv = 'canvas', setMv }: { tool: ToolInfo; /** phones: the form or the results, one at a time */ mv?: 'form' | 'canvas'; setMv?: (v: 'form' | 'canvas') => void }) {
  const onStart = setMv ? () => setMv('form') : undefined;
  const [jobs, setJobs] = useState<JobState[] | null>(null);
  useEffect(() => { let live = true; const l = () => listJobs(tool.id).then(j => { if (live) setJobs(j); }).catch(() => { if (live) setJobs(js => js ?? []); });
    l(); const t = setInterval(() => { if (!document.hidden) l(); }, 3000); return () => { live = false; clearInterval(t); }; }, [tool.id]);
  const p = tool.plugin; const b = p ? { author: p.author ?? null, licence: p.license?.name ?? 'Unknown licence', runsCode: !!p.handler, user: !!p.user } : null;
  const takes = p?.input === 'none' ? 'your prompt' : p?.input === 'image' ? 'a photo' : 'a clip';
  return <div className="canvas plr" data-testid="plugin-results">
    {setMv && <div className="canvas-tabs plr-tabs" role="tablist"><button type="button" role="tab" className={`ctab-create ${mv === 'form' ? 'on m-on' : ''}`} aria-selected={mv === 'form'} data-testid="ctab-create" onClick={() => setMv('form')}>Create</button>
      <button type="button" role="tab" className={mv === 'canvas' ? 'on m-on' : ''} aria-selected={mv === 'canvas'} data-testid="ctab-results" onClick={() => setMv('canvas')}>Results{jobs?.length ? <span className="count">{jobs.length}</span> : null}</button></div>}
    <header className="plr-head"><h2>{tool.name}{b && <PluginBadge b={b} />}</h2><p>{tool.description}</p></header>
    {p?.user && <WorkflowNeeds toolId={tool.id} />}
    {jobs === null ? <div className="plr-grid" aria-busy="true">{[0, 1, 2].map(i => <span key={i} className="plr-cell shimmer" />)}</div>
      : !jobs.length ? <div className="plr-empty" data-testid="plugin-results-empty">
          <span className="plr-empty-ic" aria-hidden><ToolIconFor id={tool.id} ui={tool.ui} size={26} /></span>
          <b>Your results will show here</b>
          <p>Add {takes}, then press Generate. It runs on your own ComfyUI; anywhere else you get a sample and the exact workflow a real run would send.</p>
          <span className="plr-empty-a">{onStart && <button type="button" className="btn btn-sm m-only" onClick={onStart}>Start</button>}<Link to="/plugins" className="plr-link">Your workflows</Link></span>
        </div>
      : <div className="plr-grid" data-testid="plugin-results-grid">{jobs.map(j => active(j) ? <GenTile key={j.id} job={j} className="plr-cell" />
          : <Link key={j.id} to={`/jobs/${j.id}`} className={`plr-cell plr-${j.status}`} data-testid={`plugin-result-${j.id}`} aria-label={`${tool.name}: ${STATE_LABELS[j.state ?? j.status] ?? j.status}`}>
              {j.status === 'done' && j.resultUrl ? (isImg(j.resultUrl) ? <img src={j.resultUrl} alt="" loading="lazy" /> : <video src={j.resultUrl} muted loop playsInline preload="metadata" onMouseEnter={e => { e.currentTarget.play().catch(() => undefined); }} onMouseLeave={e => e.currentTarget.pause()} />)
                : <span className="plr-fail">{j.error ? j.error.slice(0, 120) : STATE_LABELS[j.state ?? j.status] ?? j.status}</span>}
              {((j as any).isSample || (j as any).simulated) && <span className="plr-tag" title={(j as any).sampleReason ?? undefined}>Sample</span>}
              {j.input?.prompt ? <span className="plr-cap">{String(j.input.prompt).slice(0, 80)}</span> : null}
            </Link>)}</div>}
  </div>;
}
