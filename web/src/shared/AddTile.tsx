/**
 * The bar's "add a picture" tile (2026-10-31), one for Image, Video and the Canvas card bars: a small dashed "+" right after the thumbnails.
 * No counter text on the bar: the tooltip says "Add a picture · up to 10" (the picked model's real limit); only near the limit a tiny badge
 * ("2 left"); at the limit the tile is disabled ("That's the most this model takes").
 */
import { tip } from './Tooltip';
import { PlusIcon } from '../ui/Icons';
import { addTileState } from './addTileState';
import './addTile.css';
export { addTileState };

export function AddTile({ used, max, noun, onAdd, testId = 'add-tile', size = 'bar' }: { used: number; max: number; noun?: string; onAdd: () => void; testId?: string; /** 'card': the Canvas card's smaller tiles */ size?: 'bar' | 'card' }) {
  const s = addTileState(used, max, noun);
  return <button type="button" className={`add-tile add-tile-${size}${s.full ? ' full' : ''}`} data-testid={testId} data-ref-trigger data-card-control aria-label={s.badge ? `${s.label}. ${s.badge}` : s.label}
    aria-disabled={s.full || undefined} {...tip(s.label)} onClick={() => { if (!s.full) onAdd(); }}>
    <PlusIcon size={size === 'card' ? 12 : 16} />{s.badge && <b className="add-tile-n" aria-hidden>{s.badge}</b>}</button>;
}
