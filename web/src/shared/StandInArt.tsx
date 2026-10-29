/** Branded stand-in tile for preset art that isn't made yet (server: preset.standIn, posterUrl null). Same idea as the /presets
 *  stand-in tiles: our neutral surface ramp, an orange light placed per preset, grain, the tool's icon. No text, no people, no file to 404. */
import { ToolIconFor } from '../ui/Icons';

const hash = (s: string) => { let h = 7; for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0; return h; };
/** Art for a preset tile: its poster when it has one, else null (draw StandInArt). */
export const hasArt = (p: any): boolean => !!(p?.posterUrl || p?.previewWebm || p?.previewUrl);

export function StandInArt({ id, toolId, group, label, className = '' }: { id: string; toolId: string; group?: string; /** shown small at the bottom (e.g. hero cards) */ label?: string; className?: string }) {
  const v = hash(group || toolId) % 6; const s = hash(id) % 5;
  return <span className={`standin-art v${v} s${s} ${className}`} data-testid={`standin-${id}`} aria-hidden title="Preview coming soon">
    <i className="standin-glyph"><ToolIconFor id={toolId} size={22} strokeWidth={1.4} /></i>{label && <b className="standin-label">{label}</b>}</span>;
}
