/**
 * The non-generate nodes' shape utils (prompt, upload, note, compare, group, ad layout) and their create helpers. The views are in AuxNodes.tsx;
 * this file holds no React component of its own, so editing a view hot-reloads as a Fast Refresh.
 */
import { BaseBoxShapeUtil, T, createShapeId, resizeBox, type Editor, type TLResizeInfo, type TLShape, type TLShapeId, type VecLike } from 'tldraw';
import { NODE_DEFS, nodeDefOf, adCardHeight, GROUP_TYPE, PROMPT_TYPE, UPLOAD_TYPE, NOTE_TYPE, COMPARE_TYPE, AD_TYPE, type NodeKind } from './nodeTypes';
import { AD_SHAPES, asShape } from './adPlatforms';
import { freeSpot } from './placement';
import { AuxView } from './AuxNodes';

export interface AuxNodeProps { w: number; h: number; text: string; url: string; poster: string; mediaKind: string; label: string; title: string }
/** The Ad layout card's own words (its picture comes in by arrow): up to 3 headlines, the offer line, the button, the brand ('' = the active one),
 *  and which size / headline the preview shows. Where it will run (platforms), the layout and the safe-zone toggle came later, so cards
 *  saved before them don't have them (adPlatforms.asPlatforms / adLayout.asPreset fill them in). `edits`: "Edit ad"'s hand edits per size
 *  (adEdit.ts, read through asEdits); none = the automatic layout. `style`: the look on every size (adLayout.AdStyle, read through asStyle);
 *  none = the look from before styles. */
export interface AdNodeProps { w: number; h: number; headlines: string[]; offer: string; button: string; brandId: string; size: string; pick: number; platforms?: string[]; layout?: string; safeZones?: boolean; edits?: Record<string, unknown>; style?: Record<string, unknown> }
declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    [PROMPT_TYPE]: AuxNodeProps; [UPLOAD_TYPE]: AuxNodeProps; [NOTE_TYPE]: AuxNodeProps; [COMPARE_TYPE]: AuxNodeProps; [GROUP_TYPE]: AuxNodeProps; [AD_TYPE]: AdNodeProps;
  }
}
export type AuxNodeShape = TLShape<typeof PROMPT_TYPE>;

const AUX_PROPS = { w: T.number, h: T.number, text: T.string, url: T.string, poster: T.string, mediaKind: T.string, label: T.string, title: T.string };
export function auxProps(kind: NodeKind): AuxNodeProps { const d = NODE_DEFS[kind]; return { w: d.defaultW, h: d.defaultH, text: '', url: '', poster: '', mediaKind: '', label: '', title: d.label }; }
const AD_PROPS = { w: T.number, h: T.number, headlines: T.arrayOf(T.string), offer: T.string, button: T.string, brandId: T.string, size: T.string, pick: T.number,
  platforms: T.optional(T.arrayOf(T.string)), layout: T.optional(T.string), safeZones: T.optional(T.boolean), edits: T.optional(T.jsonValue as any), style: T.optional(T.jsonValue as any) };
export function adProps(): AdNodeProps { const d = NODE_DEFS.ad; return { w: d.defaultW, h: d.defaultH, headlines: ['', '', ''], offer: '', button: 'Shop now', brandId: '', size: '4x5', pick: 0, platforms: ['meta'], layout: 'bottom', safeZones: true }; }
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export interface AuxCreateOpts { at?: VecLike; text?: string; title?: string; media?: { url: string; poster: string; mediaKind: string; label: string }; select?: boolean; w?: number; h?: number }

/** Make a prompt / upload / note / compare / group / ad layout node (gen goes through agentApi.createCard). */
export function createAuxNode(editor: Editor, kind: NodeKind, o: AuxCreateOpts = {}): TLShapeId {
  if (kind === 'group') return createGroupNode(editor, o);
  if (kind === 'ad') { const props = { ...adProps(), ...(o.w ? { w: o.w } : {}), ...(o.h ? { h: o.h } : {}) }; const c = o.at ?? freeSpot(editor, props.w, props.h); const id = createShapeId();
    editor.markHistoryStoppingPoint('new ad layout node'); editor.run(() => editor.createShape({ id, type: AD_TYPE, x: c.x - props.w / 2, y: c.y - props.h / 2, props } as any));
    if (o.select !== false) editor.select(id); return id; }
  const def = NODE_DEFS[kind]; const base = auxProps(kind);
  const props: AuxNodeProps = { ...base, ...(o.text !== undefined ? { text: o.text } : {}), ...(o.title ? { title: o.title } : {}), ...(o.media ? { url: o.media.url, poster: o.media.poster, mediaKind: o.media.mediaKind, label: o.media.label } : {}), ...(o.w ? { w: o.w } : {}), ...(o.h ? { h: o.h } : {}) };
  const c = o.at ?? freeSpot(editor, props.w, props.h); const id = createShapeId();
  editor.markHistoryStoppingPoint(`new ${kind} node`);
  editor.run(() => editor.createShape({ id, type: def.type, x: c.x - props.w / 2, y: c.y - props.h / 2, props } as any));
  if (o.select !== false) editor.select(id);
  return id;
}

/** A group frame around the selected nodes (or an empty frame in the middle of the view), sent behind them. */
export function createGroupNode(editor: Editor, o: AuxCreateOpts = {}): TLShapeId {
  const def = NODE_DEFS.group; const picked = editor.getSelectedShapes().filter(s => nodeDefOf(s.type) && s.type !== GROUP_TYPE);
  let box: { x: number; y: number; w: number; h: number };
  const bounds = picked.map(s => editor.getShapePageBounds(s.id)).filter(Boolean) as { minX: number; minY: number; maxX: number; maxY: number }[];
  if (bounds.length) {
    const minX = Math.min(...bounds.map(b => b.minX)), minY = Math.min(...bounds.map(b => b.minY)), maxX = Math.max(...bounds.map(b => b.maxX)), maxY = Math.max(...bounds.map(b => b.maxY));
    box = { x: minX - 28, y: minY - 58, w: Math.max(def.minW, maxX - minX + 56), h: Math.max(def.minH, maxY - minY + 86) };
  } else { const c = o.at ?? editor.getViewportPageBounds().center; box = { x: c.x - def.defaultW / 2, y: c.y - def.defaultH / 2, w: def.defaultW, h: def.defaultH }; }
  const id = createShapeId(); editor.markHistoryStoppingPoint('new group');
  editor.run(() => { editor.createShape({ id, type: GROUP_TYPE, x: box.x, y: box.y, props: { ...auxProps('group'), w: box.w, h: box.h } } as any); editor.sendToBack([id]); });
  if (o.select !== false) editor.select(id);
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
    component(shape: any) { return <AuxView shape={shape} />; }
    getIndicatorPath(shape: any) { const p = new Path2D(); p.roundRect(0, 0, shape.props.w || NODE_DEFS[kind].defaultW, shape.props.h || NODE_DEFS[kind].defaultH, 18); return p; }
  };
}
export const PromptNodeUtil = makeAuxUtil('prompt', PROMPT_TYPE);
export const UploadNodeUtil = makeAuxUtil('upload', UPLOAD_TYPE);
export const NoteNodeUtil = makeAuxUtil('note', NOTE_TYPE);
export const CompareNodeUtil = makeAuxUtil('compare', COMPARE_TYPE);
export const GroupNodeUtil = makeAuxUtil('group', GROUP_TYPE);
export const AdNodeUtil = makeAuxUtil('ad', AD_TYPE);
