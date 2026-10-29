/** The result node's shape util and the helpers that place one (the view is ResultCardShape.tsx; no component here, so it hot-reloads cleanly). */
import { BaseBoxShapeUtil, HTMLContainer, T, createShapeId, type Editor, type TLShape, type TLShapePartial, type VecLike } from 'tldraw';
import { resultCardSize, type ResultKind, type ResultMedia } from '../shared/resultMedia';
import { RESULT_TYPE, NODE_DEFS } from './nodeTypes';
import { keepNodeControls } from './nodeFrameModel';
import { open3d } from './canvasEvents';
import { ResultCardView } from './ResultCardShape';
import { freeSpot, reveal } from './placement';

export { RESULT_TYPE } from './nodeTypes';
export interface ResultCardProps { w: number; h: number; kind: ResultKind; jobId: string; url: string; poster: string; title: string; model: string; place: string; price: string; time: string; /** lineage: the generate card it was pulled out of */ parents?: string[] }
declare module 'tldraw' {
  export interface TLGlobalShapePropsMap { [RESULT_TYPE]: ResultCardProps }
}
export type ResultCardShape = TLShape<typeof RESULT_TYPE>;

export class ResultCardShapeUtil extends BaseBoxShapeUtil<ResultCardShape> {
  static override type = RESULT_TYPE;
  static override props = {
    w: T.number, h: T.number, kind: T.literalEnum('image', 'video', 'audio', '3d'), jobId: T.string, url: T.string, poster: T.string,
    title: T.string, model: T.string, place: T.string, price: T.string, time: T.string, parents: T.arrayOf(T.string).optional(),
  };
  getDefaultProps(): ResultCardProps { return { w: 360, h: 460, kind: 'image', jobId: '', url: '', poster: '', title: '', model: '', place: '', price: '', time: '' }; }
  override canEdit() { return false; }
  override canResize() { return true; }
  override onResize(shape: ResultCardShape, info: any) { const n = super.onResize(shape, info); const d = NODE_DEFS.result; return { ...n, props: { ...n.props, w: Math.max(d.minW, Math.min(d.maxW, n.props.w)), h: Math.max(d.minH, Math.min(d.maxH, n.props.h)) } }; }
  override onDoubleClick(shape: ResultCardShape): TLShapePartial<ResultCardShape> | void { if (shape.props.kind === '3d' && shape.props.jobId) open3d(shape.props.jobId); }
  component(shape: ResultCardShape) { return <HTMLContainer style={{ pointerEvents: 'all' }} onPointerDown={keepNodeControls} onPointerUp={keepNodeControls}><ResultCardView shape={shape} /></HTMLContainer>; }
  getIndicatorPath(shape: ResultCardShape) { const p = new Path2D(); p.roundRect(0, 0, shape.props.w, shape.props.h, 18); return p; }
}

/** Natural size of a picture or video (for the card's aspect); null when it can't be read quickly. */
export function probeSize(kind: ResultKind, url: string, timeout = 2500): Promise<{ w: number; h: number } | null> {
  if (kind === 'audio' || !url) return Promise.resolve(null);
  return new Promise(res => {
    const t = setTimeout(() => res(null), timeout); const done = (v: { w: number; h: number } | null) => { clearTimeout(t); res(v); };
    if (kind === 'video') { const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; v.onloadedmetadata = () => done(v.videoWidth ? { w: v.videoWidth, h: v.videoHeight } : null); v.onerror = () => done(null); v.src = url; return; }
    const i = new Image(); i.onload = () => done(i.naturalWidth ? { w: i.naturalWidth, h: i.naturalHeight } : null); i.onerror = () => done(null); i.src = url;
  });
}

/** Place a result node centred on `at` (page coordinates; default the viewport centre), select it, and return its id. */
export async function addResultCard(editor: Editor, jobId: string, m: ResultMedia, at?: VecLike, o: { /** `at` is only where to start looking: the nearest free place to it */ free?: boolean } = {}) {
  const nat = await probeSize(m.kind, m.kind === '3d' ? m.poster : m.kind === 'video' ? m.poster : m.url);
  const size = resultCardSize(m.kind, nat?.w, nat?.h); const h = size.h + 104;
  const c = at && !o.free ? at : freeSpot(editor, size.w, h, at); /* a click in Assets: the middle of the view, or the nearest free place, never on top of a card */
  const id = createShapeId();
  editor.markHistoryStoppingPoint('add result card');
  editor.createShape<ResultCardShape>({ id, type: RESULT_TYPE, x: c.x - size.w / 2, y: c.y - h / 2,
    props: { w: size.w, h, kind: m.kind, jobId, url: m.url, poster: m.poster, title: m.title.slice(0, 300), model: m.caption.model, place: m.caption.place, price: m.caption.price, time: m.caption.time } });
  editor.select(id); if (!at || o.free) reveal(editor, id);
  return id;
}
