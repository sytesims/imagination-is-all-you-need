import { InlineError } from './InlineError';
/** B15: a pinned submit to a route that can't run here (409 route_not_runnable, e.g. not wired yet). Nothing ran, so no credits talk. */
export function RouteNotRunnable({ issues, className = '' }: { issues?: any[] | null; className?: string }) {
  const c = (issues ?? []).find((x: any) => x?.code === 'idempotency_conflict');
  /* B17: 409 idempotency_conflict (same key, different body). Nothing ran; the next click sends a new key. */
  if (c) return <InlineError className={`ie-route ${className}`} title="That run wasn’t sent" why={String(c.message ?? 'That run was already sent with different settings. Try again.')} testId="idem-conflict" />;
  const i = (issues ?? []).find((x: any) => x?.code === 'route_not_runnable'); if (!i) return null;
  return <InlineError className={`ie-route ${className}`} title="Can’t run here" why={String(i.message ?? 'Pick another place in Run on.')} testId="route-not-runnable" />;
}
