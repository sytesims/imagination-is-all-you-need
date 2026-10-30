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
    defaultW: 400, defaultH: 840, minW: 340, minH: 640, maxW: 820, maxH: 1400, tint: 'ad' },
};

export const NODE_KINDS = Object.keys(NODE_DEFS) as NodeKind[];
export const NODE_TYPES = NODE_KINDS.map(k => NODE_DEFS[k].type);
export const isNodeType = (type: string | undefined | null): boolean => !!type && NODE_TYPES.includes(type);
export const nodeDefOf = (type: string | undefined | null): NodeDef | null => { if (!type) return null; const i = NODE_TYPES.indexOf(type); return i >= 0 ? NODE_DEFS[NODE_KINDS[i]] : null; };
export const nodeDefOfKind = (kind: NodeKind): NodeDef => NODE_DEFS[kind];
/** The node's name for a menu: a generate node names its workflow elsewhere; this is the family name. */
export const nodeLabelOf = (type: string | undefined | null): string => nodeDefOf(type)?.label ?? 'Node';
