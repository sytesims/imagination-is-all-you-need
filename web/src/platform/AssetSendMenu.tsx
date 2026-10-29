import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { ToolInfo } from '../api';
import { useDismiss } from '../shared/useDismiss';
import { ToolIconFor } from '../ui/Icons';

type Group = { label: string; items: ToolInfo[] };
/** Only the Assets Send to surface. The parent stays the shared Popover; its nested
 * portal is an inside click (.apop), and both Escape handlers share useDismiss's stack. */
export function AssetSendMenu({ anchor, cardTrigger, groups, jobId, onBack, onClose, onSelect }: {
  anchor: RefObject<HTMLElement | null>; cardTrigger: RefObject<HTMLElement | null>;
  groups: Group[]; jobId: string; onBack: () => void; onClose: () => void; onSelect: (tool: ToolInfo) => void;
}) {
  const box = useRef<HTMLDivElement>(null); const search = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(''); const [pos, setPos] = useState<{ left: number; top: number; height: number; sheet: boolean; phone: boolean } | null>(null);
  const picked = useRef(false);
  const back = useCallback(() => {
    // Reveal the parent before focusing it: a hidden sheet cannot accept focus.
    // Doing this synchronously also prevents its initial-focus frame picking Open.
    anchor.current?.closest('.as-pop-asset')?.removeAttribute('data-asset-send-sheet');
    anchor.current?.focus({ preventScroll: true }); onBack();
  }, [onBack, anchor]);
  useDismiss(true, back, anchor);
  useLayoutEffect(() => {
    const parent = anchor.current?.closest<HTMLElement>('.as-pop-asset');
    const place = () => {
      if (!parent || !anchor.current) return;
      const p = parent.getBoundingClientRect(), r = anchor.current.getBoundingClientRect();
      const vw = innerWidth, vh = innerHeight, width = 304, edge = 8, gap = 8;
      const right = p.right + gap, left = p.left - gap - width;
      let sheet = vw < 640 || (vw <= 640 && vh < 560) || (right + width > vw - edge && left < edge);
      const x = right + width <= vw - edge ? right : left;
      let height = Math.min(460, vh - edge * 2), top = Math.max(edge, Math.min(r.top, vh - edge - height));
      // Keep the active card's toolbar (including the trigger) unobscured. Don't solve
      // player hit regions by increasing z-index or painting over native controls.
      const protectedRect = cardTrigger.current?.closest('.asset-tools')?.getBoundingClientRect();
      if (protectedRect && x < protectedRect.right && x + width > protectedRect.left && top < protectedRect.bottom && top + height > protectedRect.top) {
        const below = vh - edge - protectedRect.bottom - gap, above = protectedRect.top - gap - edge;
        if (below >= 180) { height = Math.min(height, below); top = protectedRect.bottom + gap; }
        else if (above >= 180) { height = Math.min(height, above); top = protectedRect.top - gap - height; }
        else sheet = true;
      }
      parent.toggleAttribute('data-asset-send-sheet', sheet);
      setPos({ left: x, top, height: sheet ? Math.floor(vh * .8) : height, sheet, phone: vw < 640 });
    };
    place(); let raf = 0;
    const re = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
    const ro = new ResizeObserver(re); if (parent) ro.observe(parent);
    addEventListener('resize', re); addEventListener('scroll', re, true);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('resize', re); removeEventListener('scroll', re, true); parent?.removeAttribute('data-asset-send-sheet'); };
  }, [anchor, cardTrigger]);
  useEffect(() => {
    search.current?.focus({ preventScroll: true });
    // A fast click can open the child before the parent's initial focus frame ran.
    // Run after that frame, but never steal focus already moved within this panel.
    const raf = requestAnimationFrame(() => { if (!box.current?.contains(document.activeElement)) search.current?.focus({ preventScroll: true }); });
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    // On phones the parent shared Popover already owns the scroll lock.
    if (!pos?.sheet || pos.phone) return;
    const h = document.documentElement, b = document.body; const saved = [h.style.overflow, b.style.overflow];
    h.style.overflow = b.style.overflow = 'hidden';
    return () => { [h.style.overflow, b.style.overflow] = saved; };
  }, [pos?.sheet, pos?.phone]);
  useEffect(() => {
    const down = (e: PointerEvent) => { const t = e.target as Node; if (box.current?.contains(t) || anchor.current?.closest('.as-pop-asset')?.contains(t)) return; onClose(); };
    document.addEventListener('pointerdown', down, true); return () => document.removeEventListener('pointerdown', down, true);
  }, [anchor, onClose]);
  // Keep the existing validity filter and handoff untouched. The 3D tool takes an
  // image, but belongs under 3D rather than its registry's image media category.
  const normalized: Group[] = groups.map(g => ({ ...g, items: g.items.filter(t => t.id !== 'three-d') }));
  const threeD = groups.flatMap(g => g.items).filter(t => t.id === 'three-d');
  if (threeD.length) normalized.push({ label: '3D tools', items: threeD });
  const sq = q.trim().toLowerCase(); const filtered = normalized.map(g => ({ ...g, items: g.items.filter(t => !sq || t.name.toLowerCase().includes(sq)) })).filter(g => g.items.length);
  const keys = (e: React.KeyboardEvent) => {
    e.stopPropagation(); // Search text must never reach a parent menu's keyboard handler.
    const input = e.target === search.current;
    if (e.key === 'ArrowLeft' && !input) { e.preventDefault(); back(); return; }
    if (e.key === 'Tab' && pos?.sheet) {
      const items = [...(box.current?.querySelectorAll<HTMLElement>('button,input') ?? [])];
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i === 0) { e.preventDefault(); items.at(-1)?.focus(); }
      else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0]?.focus(); }
      return;
    }
    if (input && !['ArrowDown','ArrowUp'].includes(e.key)) return;
    if (!['ArrowDown','ArrowUp','Home','End'].includes(e.key)) return;
    const items = [...(box.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])]; if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? i + 1 : i < 0 ? items.length - 1 : i - 1;
    e.preventDefault(); const target = items[(next + items.length) % items.length]; target.focus(); target.scrollIntoView({ block: 'nearest' });
  };
  return createPortal(<>
    {pos?.sheet && <div className="apop-scrim asset-send-scrim" aria-hidden onClick={onClose} />}
    <div ref={box} id={`asset-send-${jobId}`} className={`apop as-pop asset-send-menu${pos?.sheet ? ' asset-send-sheet' : ''}`} role="dialog" aria-label="Send to" aria-modal={pos?.sheet || undefined} data-testid={`am-send-list-${jobId}`} style={pos?.sheet ? { height: pos.height } : { left: pos?.left ?? -9999, top: pos?.top ?? -9999, height: pos?.height, width: 304 }} onKeyDown={keys}>
      <div className="asset-send-heading"><button type="button" aria-label="Back to asset actions" onClick={back}>‹</button><span>Send to</span><button type="button" aria-label="Close asset actions" onClick={() => { cardTrigger.current?.focus({ preventScroll: true }); onClose(); }}>×</button></div>
      <input ref={search} type="search" className="am-find" aria-label="Find a tool" placeholder="Find a tool" value={q} onChange={e => setQ(e.target.value)} />
      <div className="asset-send-results" role="menu" aria-label="Tools">
        {filtered.map(g => <div key={g.label} role="group" aria-label={g.label}><div className="am-gh">{g.label}</div>{g.items.map(t => <button type="button" key={t.id} role="menuitem" className="am-item" title={t.name} data-testid={`am-send-${t.id}`} onClick={() => { if (picked.current) return; picked.current = true; cardTrigger.current?.focus({ preventScroll: true }); onSelect(t); }}><ToolIconFor id={t.id} ui={t.ui} size={16} className="am-ic" /><span className="am-l">{t.name}</span></button>)}</div>)}
        {!filtered.length && <p className="asset-send-empty" role="status">No tool matches</p>}
      </div>
    </div>
  </>, document.body);
}
