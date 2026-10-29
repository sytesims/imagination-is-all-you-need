import { Link } from './router';
/** Catch-all 404 (audit batch 1 P0 #1). Minimal on purpose: Design Planner styles it (.not-found / .nf-code / .nf-path). */
export default function NotFound({ path }: { path: string }) {
  return (
    <div className="empty not-found" data-testid="not-found">
      <span className="nf-code">404</span>
      <h1 className="nf-h1">This page doesn’t exist</h1>
      <p className="helper nf-path"><code>{path}</code></p>
      <p className="helper">The link may be old, or the page moved.</p>
      <div className="row"><Link to="/" className="btn btn-primary">Home</Link><Link to="/assets" className="btn">Assets</Link></div>
    </div>
  );
}
