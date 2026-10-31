/**
 * First-run Welcome host (MODEL-ROUTE-SPEC §2.5). The Welcome itself is WelcomeSteps (How → Connect → Ready). Shown once, on a first visit
 * when nothing is set up yet (GET /api/setup → suggest), with ?setup=1 (the link `npm run setup` prints), and again from
 * Settings → Connections → "Run setup again". Never blocks the app: "Look around first" and Escape close it. Remembered in localStorage too.
 */
import { useEffect, useState } from 'react';
import { WelcomeSteps } from './WelcomeSteps';
import { markSeen, seen } from './WelcomeParts';

const OPEN_EVT = 'ohf:run-setup';
export const openRunSetup = () => { try { dispatchEvent(new Event(OPEN_EVT)); } catch { /* ignore */ } };

/** Mounted once (App): opens itself on a first visit, with ?setup=1, or when openRunSetup() is called. */
export function RunSetupHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => { const f = () => setOpen(true); addEventListener(OPEN_EVT, f); return () => removeEventListener(OPEN_EVT, f); }, []);
  useEffect(() => { try { if (new URLSearchParams(location.search).get('setup')) { setOpen(true); return; } } catch { /* */ }
    if (seen() || /^\/(share|jobs)\//.test(location.pathname)) return; let live = true;
    fetch('/api/setup').then(r => r.ok ? r.json() : null).then(s => { if (!live || !s) return; if (s.done) { markSeen(); return; } if (s.suggest) setOpen(true); }).catch(() => 0);
    return () => { live = false; }; }, []);
  return open ? <WelcomeSteps onClose={() => setOpen(false)} /> : null;
}
