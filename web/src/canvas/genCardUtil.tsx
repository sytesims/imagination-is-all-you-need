/** The generate node's shape util (the view is GenCardShape.tsx; no component here, so editing the view hot-reloads as a Fast Refresh). */
import { BaseBoxShapeUtil, HTMLContainer, T, type TLShape } from 'tldraw';
import { GEN_TYPE, CARD_W, draftProps, type GenCardProps } from './cardModel';
import { NODE_DEFS } from './nodeTypes';
import { keepNodeControls } from './nodeFrameModel';
import { GenCardView } from './GenCardShape';

export type { GenCardProps } from './cardModel';
declare module 'tldraw' { export interface TLGlobalShapePropsMap { [GEN_TYPE]: GenCardProps } }
export type GenCardShape = TLShape<typeof GEN_TYPE>;

export class GenCardShapeUtil extends BaseBoxShapeUtil<GenCardShape> {
  static override type = GEN_TYPE;
  static override props = {
    w: T.number, h: T.number, medium: T.literalEnum('image', 'video', 'audio', '3d'), flow: T.string, provider: T.string, prompt: T.string,
    vals: T.jsonValue as any, inputs: T.jsonValue as any, pins: T.jsonValue as any, status: T.literalEnum('draft', 'running', 'done', 'failed'), jobId: T.string, error: T.string,
    takes: T.jsonValue as any, take: T.number, parents: T.jsonValue as any, model: T.string, maker: T.string, quote: T.jsonValue as any, runs: T.number, ratio: T.number,
  };
  getDefaultProps(): GenCardProps { return draftProps(); }
  override canEdit() { return false; }
  override canResize() { return true; }
  override onResize(shape: GenCardShape, info: any) { const n = super.onResize(shape, info); const d = NODE_DEFS.gen; return { ...n, props: { ...n.props, w: Math.max(d.minW, Math.min(d.maxW, n.props.w)), h: Math.max(d.minH, Math.min(d.maxH, n.props.h)) } }; }
  component(shape: GenCardShape) { return <HTMLContainer style={{ pointerEvents: 'all' }} onPointerDown={keepNodeControls} onPointerUp={keepNodeControls}><GenCardView shape={shape} /></HTMLContainer>; }
  getIndicatorPath(shape: GenCardShape) { const p = new Path2D(); p.roundRect(0, 0, shape.props.w || CARD_W, shape.props.h, 18); return p; }
}
