/**
 * Type filter (2026-10-31): All · Images · Videos · Audio (· 3D), the app's page names, one small segmented row. Shared by the media picker (shared/MediaPicker)
 * and Canvas's Assets drawer, so both name the kinds the same way. Callers pass only the kinds that exist; with fewer than two it hides.
 */
import './typeFilter.css';

export type TypeKind = 'image' | 'video' | 'audio' | '3d';
export type TypePick = 'all' | TypeKind;
export const TYPE_LABEL: Record<TypePick, string> = { all: 'All', image: 'Images', video: 'Videos', audio: 'Audio', '3d': '3D' };

export function TypeFilter({ kinds, value, onChange, all = true, testPre = 'type', className = '' }: {
  /** the kinds to offer, in order */ kinds: TypeKind[]; value: TypePick; onChange: (v: TypePick) => void;
  /** offer "All" first (default on) */ all?: boolean; testPre?: string; className?: string }) {
  const opts: TypePick[] = [...(all ? ['all' as const] : []), ...kinds];
  if (kinds.length < 2) return null;
  return <div className={`tyf ${className}`} role="radiogroup" aria-label="Show">
    {opts.map(k => <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} data-testid={`${testPre}-${k}`} onClick={() => onChange(k)}>{TYPE_LABEL[k]}</button>)}
  </div>;
}
