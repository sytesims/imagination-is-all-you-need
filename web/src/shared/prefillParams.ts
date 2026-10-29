/** Tool-link settings (pure, so server/test/video-aspect-handoff.test.ts checks it). Read by usePrefill. */
/** ?aspect=9:16 / ?duration=5 on a tool link (Explore, guides): the bar's own settings, applied like a Recreate's (null = none passed). */
export function urlSettings(q: URLSearchParams): Record<string, string> | null {
  const out: Record<string, string> = {}; const a = q.get('aspect') ?? ''; const d = q.get('duration') ?? '';
  if (/^(auto|\d+(\.\d+)?:\d+(\.\d+)?)$/.test(a)) out.aspect = a; if (/^\d+(\.\d+)?$/.test(d) && Number(d) > 0) out.duration = String(Number(d));
  return Object.keys(out).length ? out : null;
}
