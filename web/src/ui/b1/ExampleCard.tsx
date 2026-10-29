import { useNearView } from '../../shared/useNearView';
/** #4 Example card: hover reveals mode badge, mini ref thumbs and a prominent Recreate button. */
export default function ExampleCard({ title, mode, poster, src, refs = [], ratio = '4/5', href, onRecreate, placeholder }: { title: string; mode: string; poster?: string; src?: string; refs?: string[]; ratio?: string; href?: string; onRecreate?: () => void; placeholder?: boolean }) {
  const btn = href ? <a className="btn btn-primary ex-go" href={href}>↻ Recreate</a> : <button className="btn btn-primary ex-go" onClick={onRecreate}>↻ Recreate</button>;
  const [ref, near] = useNearView<HTMLElement>(); /* performance: the clip loads and plays when it nears the viewport (poster until then) */
  return (
    <article ref={ref} className="ex-card" style={{ aspectRatio: ratio }} tabIndex={0}>
      {src ? <video src={near ? src : undefined} poster={poster} muted loop playsInline autoPlay={near} preload="metadata" /> : <img src={poster} alt="" loading="lazy" decoding="async" />}
      <span className="ex-mode">{mode}</span>
      {placeholder && <span className="ex-ph" data-testid="ex-placeholder" title="Stand-in media: this example hasn’t been rendered yet">Placeholder</span>}
      <div className="ex-hover">
        {refs.length > 0 && <div className="ex-refs">{refs.slice(0, 4).map(r => <img key={r} src={r} alt="" />)}</div>}
        <span className="ex-title">{title}</span>{btn}
      </div>
    </article>
  );
}
