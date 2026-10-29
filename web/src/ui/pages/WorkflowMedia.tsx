import { useState, type ReactNode } from 'react';
import type { HubExample, HubSingle } from '../../shared/looks';
import SplitPreview from '../../shared/SplitPreview';
/** Workflows pages: pictures that never show a broken icon (a missing file becomes a quiet placeholder) and always fill their box (cover). */
export function SafeImg({ src, alt = '', className, ph, eager = false }: { src: string | null | undefined; alt?: string; className?: string; ph?: ReactNode; eager?: boolean }) {
  const [bad, setBad] = useState<string | null>(null);
  if (!src || bad === src) return <span className={`wfh-ph ${className ?? ''}`} aria-hidden={!alt || undefined} role={alt ? 'img' : undefined} aria-label={alt || undefined} data-testid="wfh-ph">{ph ?? <PhGlyph />}</span>;
  return <img className={className} src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false} onError={() => setBad(src)} />;
}
const PhGlyph = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="m4 18 5-5 4 4 3-3 4 4" /></svg>;
/** A workflow's picture: a before → after that follows the pointer (SplitPreview; keyboard: a slider), one real image, or a designed "Be the first" tile. */
export function WfMedia({ ex, icon, className = '', eager = false, auto = false }: { ex: HubExample | HubSingle | null; icon?: ReactNode; className?: string; eager?: boolean; auto?: boolean }) {
  const note = ex?.model ? `Example made with ${ex.model}` : undefined;
  if (ex?.kind === 'split') return <SplitPreview className={`wfh-media ${className}`} testId="wfh-split" before={ex.before} after={ex.after} beforeLabel={ex.beforeLabel} afterLabel={ex.afterLabel} eager={eager} auto={auto} />;
  if (ex?.kind === 'single') return <span className={`wfh-media wfh-one ${className}`} title={note} data-testid="wfh-single"><SafeImg src={ex.url} eager={eager} /></span>;
  return <span className={`wfh-media wv-empty ${className}`} data-testid="wfh-empty"><span className="wv-empty-ic" aria-hidden>{icon}</span><span className="wv-empty-t">Be the first — try it</span></span>;
}
