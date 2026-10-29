import { useEffect, useState } from 'react';
import { Example, listExamples } from '../api';
import { navigate } from './router';
import ExampleCard from '../ui/b1/ExampleCard';
import { exampleAt, EXAMPLES } from '../ui/examples';
import MediaArt from '../ui/MediaArt';
/**
 * "Recreate" examples (GET /api/examples): each opens its tool prefilled via `?example=`.
 * `hard` = full page load (needed inside a tool, which reads ?example only on mount).
 */
export default function Recreate({ toolId, hard, limit, minTiles = 0 }: { toolId?: string; hard?: boolean; limit?: number; minTiles?: number }) {
  const [xs, setXs] = useState<Example[]>([]);
  useEffect(() => { listExamples().then(setXs).catch(() => undefined); }, []);
  const shown = (toolId ? xs.filter(x => x.toolId === toolId) : xs).slice(0, limit);
  if (!shown.length && !minTiles) return null;
  const pad = Math.max(0, minTiles - shown.length);
  return (
    <div className="masonry recreate-list">{shown.map((x, i) => (
      <div key={x.id} className="masonry-item recreate-item">{(() => { const ex = exampleAt(i, (x as any).posterUrl ?? x.previewUrl, 2); return (
        <ExampleCard title={x.title} mode={x.toolName} poster={ex.poster} src={ex.src} refs={x.refs ?? (x.image ? [x.image] : [])} ratio={ex.ratio ?? ['3/4', '1/1', '4/5', '9/16', '16/9'][i % 5]}
          href={hard ? x.route : undefined} onRecreate={hard ? undefined : () => navigate(x.route)} placeholder={(x as any).real !== true} />); })()}</div>))}
      {Array.from({ length: pad }, (_, k) => { const ex = EXAMPLES[(shown.length + k + 2) % EXAMPLES.length]; return <div key={'pad' + k} className="masonry-item sample-item"><button type="button" className="sample-hit" data-testid={`sample-${ex.id}`} aria-label={`Use “${ex.title}” as your input`} onClick={() => { const u = `${location.pathname}?sample=${encodeURIComponent(ex.id)}`; if (hard) location.assign(u); else navigate(u); }}><MediaArt seed={ex.id} ex={ex} ratio={ex.ratio}><span className="sample-cap">{ex.title}</span><span className="sample-use" aria-hidden>Use this</span></MediaArt></button></div>; })}</div>
  );
}
