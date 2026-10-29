/**
 * Visual cards to pick a starting point (2026-10-25), shared: Direct a Shot's scene picker (the dock's scene slot), the 3D tab's start cards, and
 * later the 3D sets and rigged characters (an item only needs a name and, ideally, a thumbnail URL). One card look everywhere:
 *   SceneCard   one card: the picture (or a soft colour tile with an icon while it has none), a badge, the name, one line, small facts.
 *   SceneGrid   the cards in a responsive grid, with optional group tabs ("All", "Presets", "Your own"…) that only show when there is a choice.
 * Cards are role=option in a listbox, so the shared Popover's arrow keys and Home / End move through them; actions (Import…) are cards too.
 */
import { useMemo, useState, type ReactNode } from 'react';
import './sceneGrid.css';

export interface SceneItem {
  id: string; name: string; /** one plain line under the name */ line?: string;
  /** a picture of the scene; null = the colour tile */ thumb?: string | null; /** the colour tile's hue (also a thin accent under the picture) */ tint?: string;
  /** shown on the colour tile */ icon?: ReactNode; /** top left: "Free", "New", "Soon" */ badge?: string;
  /** small facts in the foot, e.g. ["Dolly", "6 s", "16:9"] */ meta?: string[];
  /** which group tab it belongs to (SceneGrid groups) */ group?: string;
  /** an action card (Import, Copy prompt): dashed, no picture */ action?: boolean; soon?: boolean; disabled?: boolean; testId?: string; title?: string;
}

export function SceneCard({ item, selected = false, onPick, size = 'md' }: { item: SceneItem; selected?: boolean; onPick?: (item: SceneItem) => void; size?: 'md' | 'lg' }) {
  const off = item.disabled || item.soon; const [bad, setBad] = useState<string | null>(null); const pic = item.thumb && item.thumb !== bad ? item.thumb : null;
  return <button type="button" role="option" aria-selected={selected} aria-disabled={off || undefined} className={`sg-card sg-${size}${selected ? ' on' : ''}${item.action ? ' sg-action' : ''}${off ? ' sg-off' : ''}`}
    data-testid={item.testId} title={item.title} onClick={() => { if (!off) onPick?.(item); }} style={item.tint ? { ['--sg-tint' as string]: item.tint } : undefined}>
    <span className="sg-media" aria-hidden>
      <span className="sg-tile">{item.icon}</span>{/* the colour tile stays under the picture until it has loaded */}
      {pic && <img src={pic} alt="" loading="lazy" decoding="async" draggable={false} onLoad={(e) => e.currentTarget.classList.add('ok')} onError={() => setBad(pic)} />}
      {item.badge && !item.action && <em className="sg-badge">{item.badge}</em>}
      {selected && <span className="sg-check"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>}
    </span>
    <span className="sg-body">
      <b className="sg-name">{item.name}{item.badge && item.action && <em className="sg-badge">{item.badge}</em>}</b>
      {item.line && <span className="sg-line">{item.line}</span>}
      {!!item.meta?.length && <span className="sg-meta">{item.meta.map((m) => <i key={m}>{m}</i>)}</span>}
    </span>
  </button>;
}

export function SceneGrid({ items, value, onPick, groups, label, testId, min = 196, size = 'md', foot }: {
  items: SceneItem[]; value?: string | null; onPick: (item: SceneItem) => void;
  /** group tabs; a tab shows only when it has cards. "all" is added in front */ groups?: { id: string; label: string }[];
  label: string; testId?: string; /** the smallest card width (px) */ min?: number; size?: 'md' | 'lg'; /** a quiet line under the grid */ foot?: ReactNode;
}) {
  const [g, setG] = useState('all');
  const tabs = useMemo(() => (groups ?? []).filter((x) => items.some((i) => i.group === x.id)), [groups, items]);
  const shown = g === 'all' ? items : items.filter((i) => i.group === g);
  return <div className="sg" data-testid={testId}>
    {tabs.length > 1 && <div className="sg-tabs" role="tablist" aria-label={`${label}: groups`}>
      {[{ id: 'all', label: 'All' }, ...tabs].map((x) => <button key={x.id} type="button" role="tab" aria-selected={g === x.id} className={g === x.id ? 'on' : ''} data-testid={testId ? `${testId}-tab-${x.id}` : undefined}
        onClick={() => setG(x.id)}>{x.label}<small>{x.id === 'all' ? items.length : items.filter((i) => i.group === x.id).length}</small></button>)}</div>}
    <div className="sg-grid" role="listbox" aria-label={label} style={{ ['--sg-min' as string]: `${min}px` }}>
      {shown.filter((it) => !it.action).map((it) => <SceneCard key={it.id} item={it} selected={value === it.id} onPick={onPick} size={size} />)}
      {/* actions (Import, Copy prompt, Coming soon): a row of slim cards after the pictures */}
      {shown.some((it) => it.action) && <div className="sg-acts" role="presentation">{shown.filter((it) => it.action).map((it) => <SceneCard key={it.id} item={it} selected={value === it.id} onPick={onPick} />)}</div>}
    </div>
    {foot && <p className="sg-foot">{foot}</p>}
  </div>;
}
