import { retryJob } from '../api';
import type { JobState } from '../api';
import { useToast } from './Toast';
import { navigate } from '../platform/router';
/** "Run many versions from one setup": thumbnails of every version; click to open. */
export default function VersionGrid({ jobs, selected, onSelect, onMore }: { jobs: JobState[]; selected: string; onSelect: (id: string) => void; onMore: () => void }) {
  const toast = useToast();
  if (!jobs.length) return null;
  return (
    <section className="card versions">
      <div className="result-head"><h2>Versions <span className="helper">{jobs.length}</span></h2><button className="btn" onClick={onMore}>Generate more like this</button></div>
      <div className="version-grid">{jobs.map((j, i) => (
        <button key={j.id || i} className={`version ${j.id === selected ? 'on' : ''}`} onClick={() => j.id && onSelect(j.id)}>
          {j.status === 'done' && j.resultUrl ? <video src={j.resultUrl} muted playsInline onMouseEnter={e => { e.currentTarget.play().catch(() => {}); }} onMouseLeave={e => e.currentTarget.pause()} />
            : <div className="version-ph">{j.status === 'blocked' ? 'Blocked' : j.status === 'failed' ? <>Failed <span role="button" tabIndex={0} className="vg-retry" data-testid={`retry-${j.id}`} onClick={async e => { e.stopPropagation(); try { const id = await retryJob(j.id); toast('Retrying with the same settings'); if (id) navigate(`/jobs/${id}`); } catch (err) { toast((err as Error).message, 'error'); } }}>Retry</span></> : j.status === 'canceled' ? 'Canceled' : `${j.progress}%`}</div>}
          <span className="helper">Version {jobs.length - i} · seed {j.input?.seed ?? '-'}</span>
        </button>))}</div>
    </section>
  );
}
