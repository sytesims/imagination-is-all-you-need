/** The non-generate nodes' props and their defaults (no React, no drawing library: the shape utils, the React Flow engine and tests share it). */
import { NODE_DEFS, type NodeKind } from './nodeTypes';

export interface AuxNodeProps { w: number; h: number; text: string; url: string; poster: string; mediaKind: string; label: string; title: string }
/** The Ad layout card's own words (its picture comes in by arrow): up to 3 headlines, the offer line, the button, the brand ('' = the active one),
 *  and which size / headline the preview shows. Where it will run (platforms), the layout and the safe-zone toggle came later, so cards
 *  saved before them don't have them (adPlatforms.asPlatforms / adLayout.asPreset fill them in). `edits`: "Edit ad"'s hand edits per size
 *  (adEdit.ts, read through asEdits); none = the automatic layout. `style`: the look on every size (adLayout.AdStyle, read through asStyle);
 *  none = the look from before styles. */
export interface AdNodeProps { w: number; h: number; headlines: string[]; offer: string; button: string; brandId: string; size: string; pick: number; platforms?: string[]; layout?: string; safeZones?: boolean; edits?: Record<string, unknown>; style?: Record<string, unknown> }
export function auxProps(kind: NodeKind): AuxNodeProps { const d = NODE_DEFS[kind]; return { w: d.defaultW, h: d.defaultH, text: '', url: '', poster: '', mediaKind: '', label: '', title: d.label }; }
export function adProps(): AdNodeProps { const d = NODE_DEFS.ad; return { w: d.defaultW, h: d.defaultH, headlines: ['', '', ''], offer: '', button: 'Shop now', brandId: '', size: '4x5', pick: 0, platforms: ['meta'], layout: 'bottom', safeZones: true }; }
