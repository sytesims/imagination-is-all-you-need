import { useEffect, useRef, useState } from 'react';
import { useConnectivity } from './connectivity';
import { restartListeners } from '../api';
import { RESTART_COPY } from './restartCopy';

/** The one app-level connection banner: offline (browser), can't reach the server (failed polls), server restarting, or "Back online".
 *  Pages show their own InlineError in place of content, worded the same way, and never a second banner. */
export function OfflineBanner() {
  const c = useConnectivity(); const [restart, setRestart] = useState(false); const [unreach, setUnreach] = useState(false); const [back, setBack] = useState(false); const was = useRef(false);
  useEffect(() => { const f = (r: boolean, why?: string) => { setRestart(r && why !== 'network'); setUnreach(r && why === 'network'); }; restartListeners.add(f); return () => { restartListeners.delete(f); }; }, []);
  const down = c.offline || restart || unreach;
  // Browser offline wins; then a real restart (empty 500 / 502 / 503 from the proxy); anything else is "can't reach".
  const isRestart = restart && c.reason !== 'browser';
  useEffect(() => { if (down) { was.current = true; setBack(false); return; } if (was.current) { was.current = false; setBack(true); const t = setTimeout(() => setBack(false), 2000); return () => clearTimeout(t); } }, [down]);
  if (!down && !back) return null;
  const txt = back ? 'Back online' : c.reason === 'browser' ? 'You’re offline. Showing what was already loaded.' : isRestart ? RESTART_COPY : 'Can’t reach the server. Reconnecting…';
  return <div className={`offline-banner net-banner ${back ? 'ok' : c.reason === 'browser' ? 'off' : 're'}`} role="status" aria-live="polite" data-testid="offline-banner" data-reason={back ? '' : c.reason === 'browser' ? 'browser' : isRestart ? 'restart' : c.reason ?? 'network'}>{!back && c.reason !== 'browser' && <i className="as-spin" aria-hidden />}{txt}</div>;
}
