/* B21 T26/T27/T28: procedural motion sketches for option tiles that have no poster yet.
 *  Each option gets its own still frame (a paused animation at its own offset); the loop runs on hover on desktop only,
 *  never on touch and never with reduced motion. Pure CSS, fixed box, so nothing shifts when it starts. */
import type { AppFieldOpt } from './AppFields';

export function hasSketch(field: string) { return field === 'orbit' || field === 'transition' || field === 'presenter' || field === 'scene'; /* scene: a still sketch of the setting (Product Shot), no motion */ }
export default function TileSketch({ field, o }: { field: string; o: AppFieldOpt & { setting?: string; framing?: string } }) {
  const cls = field === 'presenter' ? `sk sk-presenter sk-set-${o.setting ?? 'home'} sk-frame-${o.framing ?? 'selfie'}` : `sk sk-${field} sk-${field}-${o.value}`;
  return <span className={cls} data-testid={`sketch-${o.value}`} aria-hidden><i className="sk-a" /><i className="sk-b" /><i className="sk-c" /></span>;
}
