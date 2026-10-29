import { useEffect, useState } from 'react';
/** GET /api/config → { localFree }. When true: <html class="local-free"> hides every price (CSS) and the header pill / Home hero show the local headline.
 *  Mock: ?localFree=1 forces it on until /api/config lands. */
export const LOCAL_FREE_HEADLINE = 'Free on your computer';
let cache: boolean | null = null; const subs = new Set<(b: boolean) => void>();
function apply(b: boolean) { cache = b; document.documentElement.classList.toggle('local-free', b); subs.forEach(f => f(b)); }
export function useLocalFree() {
  const [v, setV] = useState<boolean>(cache ?? false);
  useEffect(() => {
    subs.add(setV);
    if (cache === null) {
      const forced = new URLSearchParams(location.search).get('localFree');
      if (forced) apply(forced === '1');
      else fetch('/api/config').then(r => r.ok ? r.json() : {}).then((j: any) => apply(!!j.localFree)).catch(() => apply(false));
    }
    return () => { subs.delete(setV); };
  }, []);
  return v;
}
export const LocalFreeHeadline = ({ className = '' }: { className?: string }) => useLocalFree() ? <p className={`lf-headline ${className}`}><span className="lf-dot" />{LOCAL_FREE_HEADLINE}</p> : null;
