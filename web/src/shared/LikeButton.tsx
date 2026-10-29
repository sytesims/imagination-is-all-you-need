import { tip } from './Tooltip';
import { useEffect, useState } from 'react';
import { clientId } from './clientId';
import { HeartIcon } from '../ui/Icons';
/** Round 1 (C4/C6): a real local Like on a public Community shot. One like per browser on this install (X-Client-Id); the count starts at 0
 *  and only counts real clicks (POST /api/community/shots/:id/like). Not the private Favourite heart on your own results. */
export function LikeButton({ id, likes: likes0, liked: liked0, className = '', onChange, size = 17 }: { id: string; likes?: number; liked?: boolean; className?: string; onChange?: (likes: number, liked: boolean) => void; size?: number }) {
  const [st, setSt] = useState<{ likes: number; liked: boolean } | null>(likes0 != null ? { likes: likes0, liked: !!liked0 } : null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { if (likes0 != null) { setSt({ likes: likes0, liked: !!liked0 }); return; } let on = true;
    fetch(`/api/community/shots/${encodeURIComponent(id)}/like`, { headers: { 'x-client-id': clientId() } }).then(r => r.ok ? r.json() : null).then(b => { if (on && b) setSt({ likes: b.likes ?? 0, liked: !!b.liked }); }).catch(() => 0);
    return () => { on = false; }; }, [id, likes0, liked0]);
  const toggle = async (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); if (!st || busy) return; const next = { liked: !st.liked, likes: Math.max(0, st.likes + (st.liked ? -1 : 1)) }; const prev = st; setSt(next); setBusy(true); setErr('');
    try { const r = await fetch(`/api/community/shots/${encodeURIComponent(id)}/like`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-id': clientId() }, body: JSON.stringify({ on: next.liked }) }); const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || 'Couldn’t save the like'); const done = { likes: b.likes ?? next.likes, liked: !!b.liked }; setSt(done); onChange?.(done.likes, done.liked); }
    catch (x) { setSt(prev); setErr((x as Error).message); } finally { setBusy(false); } };
  const label = !st ? 'Like' : st.liked ? 'Unlike' : 'Like';
  return <button type="button" className={`btn like-btn${st?.liked ? ' on' : ''} ${className}`} aria-pressed={!!st?.liked} aria-label={`${label}${st && st.likes ? ` (${st.likes} like${st.likes === 1 ? '' : 's'})` : ''}`} {...tip(err || (st?.liked ? 'You liked this. Likes count browsers on this install.' : 'Like. Likes count browsers on this install.'))} disabled={!st} aria-busy={busy || undefined} onClick={toggle} data-testid={`like-${id}`}>
    <HeartIcon size={size} />{!!st?.likes && <span className="like-n">{st.likes}</span>}</button>;
}
