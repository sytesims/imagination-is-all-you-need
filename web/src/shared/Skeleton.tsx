/** Loading placeholders, one look everywhere: tiles (media grids), rows (tables, lists) or lines (text blocks).
 *  They reserve the space the content will take, so nothing jumps when it arrives (CLS). Callers time them out into
 *  InlineError via useLoad, so they never spin forever. */
export function Skeleton({ variant = 'tiles', count = 8, className = '', label = 'Loading' }: { variant?: 'tiles' | 'rows' | 'lines'; count?: number; className?: string; label?: string }) {
  return <div className={`skel skel-${variant} ${className}`} role="status" aria-live="polite" aria-label={label} data-testid="skeleton">
    {Array.from({ length: count }, (_, i) => <span key={i} className="skel-i" aria-hidden />)}
  </div>;
}
