/**
 * The board's node registry: ONE source of truth for every node kind, its tldraw type, its ports and its size limits.
 * The toolbar, the shape utils, the agent API and server/test/canvas-nodes.test.ts read this file; no React, no tldraw,
 * so the same rules hold on the board and in a plain tsx test.
 */
export const GEN_TYPE = 'ohf-gen';
export const RESULT_TYPE = 'ohf-result';
export const PROMPT_TYPE = 'ohf-prompt';
export const UPLOAD_TYPE = 'ohf-upload';
export const NOTE_TYPE = 'ohf-note';
export const COMPARE_TYPE = 'ohf-compare';
export const GROUP_TYPE = 'ohf-group';
export const AD_TYPE = 'ohf-ad';

export type NodeKind = 'gen' | 'result' | 'prompt' | 'upload' | 'note' | 'compare' | 'group' | 'ad';
export type NodeTint = 'image' | 'video' | 'audio' | '3d' | 'text' | 'upload' | 'compare' | 'group' | 'ad';

export interface NodeDef {
  kind: NodeKind;
  /** the tldraw shape type saved in the board snapshot */
  type: string;
  label: string;
  /** the short line under the name in menus */
  hint: string;
  /** can an arrow land on it? */
  input: boolean;
  /** can a drag start from its right edge? */
  output: boolean;
  /** how many arrows its input takes (99 = as many as the workflow has slots) */
  inputMax: number;
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
  tint: NodeTint;
}

export const NODE_DEFS: Record<NodeKind, NodeDef> = {
  gen: { kind: 'gen', type: GEN_TYPE, label: 'Generate', hint: 'Image, video, audio or 3D', input: true, output: true, inputMax: 99,
    defaultW: 340, defaultH: 430, minW: 288, minH: 320, maxW: 760, maxH: 940, tint: 'image' },
  result: { kind: 'result', type: RESULT_TYPE, label: 'Result', hint: 'A finished run', input: false, output: true, inputMax: 0,
    defaultW: 360, defaultH: 460, minW: 240, minH: 220, maxW: 900, maxH: 1000, tint: 'image' },
  prompt: { kind: 'prompt', type: PROMPT_TYPE, label: 'Prompt', hint: 'Text that feeds a generate node', input: false, output: true, inputMax: 0,
    defaultW: 300, defaultH: 230, minW: 240, minH: 160, maxW: 620, maxH: 720, tint: 'text' },
  upload: { kind: 'upload', type: UPLOAD_TYPE, label: 'Upload', hint: 'An image, clip or sound', input: false, output: true, inputMax: 0,
    defaultW: 320, defaultH: 300, minW: 240, minH: 220, maxW: 760, maxH: 820, tint: 'upload' },
  note: { kind: 'note', type: NOTE_TYPE, label: 'Note', hint: 'Plain text for you', input: false, output: true, inputMax: 0,
    defaultW: 300, defaultH: 230, minW: 220, minH: 150, maxW: 620, maxH: 760, tint: 'text' },
  compare: { kind: 'compare', type: COMPARE_TYPE, label: 'Compare', hint: 'Two inputs, before and after', input: true, output: false, inputMax: 2,
    defaultW: 440, defaultH: 420, minW: 320, minH: 300, maxW: 900, maxH: 900, tint: 'compare' },
  group: { kind: 'group', type: GROUP_TYPE, label: 'Group', hint: 'A frame with Run all', input: false, output: false, inputMax: 0,
    defaultW: 720, defaultH: 520, minW: 360, minH: 260, maxW: 1800, maxH: 1400, tint: 'group' },
  ad: { kind: 'ad', type: AD_TYPE, label: 'Ad layout', hint: 'Your headline, price and logo on a picture', input: true, output: false, inputMax: 1,
    defaultW: 360, defaultH: 514, minW: 300, minH: 240, maxW: 820, maxH: 1500, tint: 'ad' },
};

/** The Ad layout card is mostly its preview (2026-10-31): a slim title row, the ad edge to edge, one bar under it. Its height follows
 *  the ad's shape at the card's width (`aspect` = the ad's width / height), so 9:16 is tall and 1.91:1 is short. AD_CHROME is the
 *  title row, the bar, the gaps and the frame (node.css .ad-card); AD_SIDE the frame and the side padding. */
export const AD_CHROME = 86, AD_SIDE = 18;
export const adCardHeight = (w: number, aspect: number) => { const d = NODE_DEFS.ad;
  return Math.round(Math.max(d.minH, Math.min(d.maxH, AD_CHROME + (w - AD_SIDE) / (aspect > 0 ? aspect : 0.8)))); };
/** An Ad layout card's size for its ad's shape: a card still at an old default (400 × 700, 400 × 840) takes today's width; the height
 *  then follows the shape. 'grow': the card gets taller (only when that covers no other card; otherwise the preview fits inside).
 *  null: already right. */
export function adCardFit(w: number, h: number, aspect: number): { w: number; h: number; grow?: true } | null {
  const nw = w === 400 && (h === 700 || h === 840) ? NODE_DEFS.ad.defaultW : w; const nh = adCardHeight(nw, aspect);
  if (nw === w && Math.abs(nh - h) < 1) return null;
  return nh > h ? { w: nw, h: nh, grow: true } : { w: nw, h: nh };
}

export const NODE_KINDS = Object.keys(NODE_DEFS) as NodeKind[];
export const NODE_TYPES = NODE_KINDS.map(k => NODE_DEFS[k].type);
export const isNodeType = (type: string | undefined | null): boolean => !!type && NODE_TYPES.includes(type);
export const nodeDefOf = (type: string | undefined | null): NodeDef | null => { if (!type) return null; const i = NODE_TYPES.indexOf(type); return i >= 0 ? NODE_DEFS[NODE_KINDS[i]] : null; };
export const nodeDefOfKind = (kind: NodeKind): NodeDef => NODE_DEFS[kind];
/** The node's name for a menu: a generate node names its workflow elsewhere; this is the family name. */
export const nodeLabelOf = (type: string | undefined | null): string => nodeDefOf(type)?.label ?? 'Node';
