/**
 * The non-generate nodes' shape utils (prompt, upload, note, compare, group, ad layout) and their create helpers. The views are in AuxNodes.tsx;
 * this file holds no React component of its own, so editing a view hot-reloads as a Fast Refresh.
 */
import { BaseBoxShapeUtil, HTMLContainer, T, resizeBox, type TLResizeInfo, type TLShape } from 'tldraw';
import type { BoardApi, NodeId, Point } from './boardApi';
import { createGroupNode } from './groupModel';
import { NODE_DEFS, nodeDefOf, adCardHeight, GROUP_TYPE, PROMPT_TYPE, UPLOAD_TYPE, NOTE_TYPE, COMPARE_TYPE, AD_TYPE, type NodeKind } from './nodeTypes';
import { AD_SHAPES, asShape } from './adPlatforms';
import { auxProps, adProps, type AuxNodeProps, type AdNodeProps } from './auxModel';
export { auxProps, adProps, type AuxNodeProps, type AdNodeProps };
import { freeSpot } from './placement';
import { AuxView } from './AuxNodes';
import { keepNodeControls } from './nodeFrameModel';

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    [PROMPT_TYPE]: AuxNodeProps; [UPLOAD_TYPE]: AuxNodeProps; [NOTE_TYPE]: AuxNodeProps; [COMPARE_TYPE]: AuxNodeProps; [GROUP_TYPE]: AuxNodeProps; [AD_TYPE]: AdNodeProps;
  }
}
export type AuxNodeShape = TLShape<typeof PROMPT_TYPE>;

const AUX_PROPS = { w: T.number, h: T.number, text: T.string, url: T.string, poster: T.string, mediaKind: T.string, label: T.string, title: T.string };
const AD_PROPS = { w: T.number, h: T.number, headlines: T.arrayOf(T.string), offer: T.string, button: T.string, brandId: T.string, size: T.string, pick: T.number,
  platforms: T.optional(T.arrayOf(T.string)), layout: T.optional(T.string), safeZones: T.optional(T.boolean), edits: T.optional(T.jsonValue as any), style: T.optional(T.jsonValue as any) };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export interface AuxCreateOpts { at?: Point; text?: string; title?: string; media?: { url: string; poster: string; mediaKind: string; label: string }; select?: boolean; w?: number; h?: number }

/** Make a prompt / upload / note / compare / group / ad layout node (gen goes through agentApi.createCard). */
export function createAuxNode(board: BoardApi, kind: NodeKind, o: AuxCreateOpts = {}): NodeId {
  if (kind === 'group') return createGroupNode(board, o);
  if (kind === 'ad') { const props = { ...adProps(), ...(o.w ? { w: o.w } : {}), ...(o.h ? { h: o.h } : {}) }; const c = o.at ?? freeSpot(board, props.w, props.h);
    board.mark('new ad layout node'); let id = ''; board.batch(() => { id = board.addNode({ type: AD_TYPE, x: c.x - props.w / 2, y: c.y - props.h / 2, props }); });
    if (o.select !== false) board.select([id]); return id; }
  const def = NODE_DEFS[kind]; const base = auxProps(kind);
  const props: AuxNodeProps = { ...base, ...(o.text !== undefined ? { text: o.text } : {}), ...(o.title ? { title: o.title } : {}), ...(o.media ? { url: o.media.url, poster: o.media.poster, mediaKind: o.media.mediaKind, label: o.media.label } : {}), ...(o.w ? { w: o.w } : {}), ...(o.h ? { h: o.h } : {}) };
  const c = o.at ?? freeSpot(board, props.w, props.h);
  board.mark(`new ${kind} node`);
  let id = ''; board.batch(() => { id = board.addNode({ type: def.type, x: c.x - props.w / 2, y: c.y - props.h / 2, props: props as any }); });
  if (o.select !== false) board.select([id]);
  return id;
}

function makeAuxUtil(kind: NodeKind, type: string) {
  return class AuxUtil extends BaseBoxShapeUtil<any> {
    static override type = type;
    static override props = kind === 'ad' ? AD_PROPS : AUX_PROPS;
    getDefaultProps(): AuxNodeProps | AdNodeProps { return kind === 'ad' ? adProps() : auxProps(kind); }
    override canEdit() { return false; }
    override canResize() { return true; }
    override onResize(shape: any, info: TLResizeInfo<any>) { const n = resizeBox(shape, info); const d = NODE_DEFS[kind]; const w = clamp(n.props.w, d.minW, d.maxW);
      /* an ad layout's height follows its ad's shape (nodeTypes.adCardHeight) */
      const a = kind === 'ad' ? AD_SHAPES[asShape(shape.props.size)] : null;
      return { ...n, props: { ...n.props, w, h: a ? adCardHeight(w, a.w / a.h) : clamp(n.props.h, d.minH, d.maxH) } }; }
    component(shape: any) { return <HTMLContainer style={{ pointerEvents: kind === 'group' ? 'none' : 'all' }} onPointerDown={keepNodeControls} onPointerUp={keepNodeControls}><AuxView shape={shape} /></HTMLContainer>; }
    getIndicatorPath(shape: any) { const p = new Path2D(); p.roundRect(0, 0, shape.props.w || NODE_DEFS[kind].defaultW, shape.props.h || NODE_DEFS[kind].defaultH, 18); return p; }
  };
}
export const PromptNodeUtil = makeAuxUtil('prompt', PROMPT_TYPE);
export const UploadNodeUtil = makeAuxUtil('upload', UPLOAD_TYPE);
export const NoteNodeUtil = makeAuxUtil('note', NOTE_TYPE);
export const CompareNodeUtil = makeAuxUtil('compare', COMPARE_TYPE);
export const GroupNodeUtil = makeAuxUtil('group', GROUP_TYPE);
export const AdNodeUtil = makeAuxUtil('ad', AD_TYPE);
