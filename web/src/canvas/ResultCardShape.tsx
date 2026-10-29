/**
 * The board's result node view ('ohf-result'; its shape util and placing helpers are in resultCardUtil.tsx): a finished image, video, audio or 3D job on the SAME shared NodeFrame as a generate
 * node. The shape keeps the job id (links back to /jobs/:id) and the caption words captured when it was placed, so a board opens
 * without a request per node. Media is a /files/ URL, never inline data.
 * Header: the medium tile, the title and "Done". Body: the shared ResultCard (its caption hidden; the frame's footer owns the
 * model and price). Footer: the full model name and the price. Hovering shows the quick-action bar; a card pulled out of a
 * generate node keeps that node as its parent (lineage), and hovering a linked node softly lights its ancestors and descendants.
 */
import { useEditor, useValue } from 'tldraw';
import { ResultCard } from '../shared/ResultCard';
import { navigate } from '../platform/router';
import { ImageIcon, VideoIcon, AudioIcon, CubeIcon } from '../ui/Icons';
import { QuickActions } from './QuickActions';
import { lineageRole } from './graph';
import { NodeFrame } from './NodeFrame';
import { open3d } from './canvasEvents';
import type { ResultCardShape } from './resultCardUtil';
import { tip } from '../shared/Tooltip';
import { RESULT_TYPE } from './nodeTypes';

const openJob = (jobId: string) => { if (jobId) navigate(`/jobs/${encodeURIComponent(jobId)}`); };
const KIND_ICON = { image: ImageIcon, video: VideoIcon, audio: AudioIcon, '3d': CubeIcon } as const;

export function ResultCardView({ shape }: { shape: ResultCardShape }) {
  const editor = useEditor(); const p = shape.props;
  const active = useValue('card active', () => editor.getHoveredShapeId() === shape.id || (editor.getSelectedShapeIds().length === 1 && editor.getOnlySelectedShapeId() === shape.id), [editor, shape.id]);
  const role = useValue('lineage', () => lineageRole(editor, shape.id), [editor, shape.id]);
  const Icon = KIND_ICON[p.kind] ?? ImageIcon; const price = [p.price, p.time].filter(Boolean).join(' · ');
  return <NodeFrame shapeId={shape.id} type={RESULT_TYPE} tint={p.kind} icon={<Icon />} title={<b title={p.title}>{p.title || 'Result'}</b>} testId="result-node" far={{ label: p.title || p.model || 'Result', media: p.kind, state: 'done' }}
    rootAttrs={{ 'data-role': role ?? undefined, 'data-kind': p.kind, 'data-job': p.jobId || undefined }}
    status={<span className="nf-status nf-status-done">Done</span>}
    footer={<><span className="nf-model"><b {...tip(p.model)}>{p.model || 'Result'}</b></span>{price && <span className="nf-price"><span>{price}</span></span>}</>}>
    <div className="nf-media">
      <ResultCard kind={p.kind} url={p.url} poster={p.poster} title={p.title} model={p.model} place={p.place} price={p.price} time={p.time} width={p.w} active={active}
        onOpen={p.jobId ? () => openJob(p.jobId) : undefined} onView3d={p.kind === '3d' && p.jobId ? () => open3d(p.jobId) : undefined} downloadName={p.url.split('/').pop()} testId={`card-${p.kind}`} />
      {(p.kind === 'image' || p.kind === 'video') && <QuickActions editor={editor} sourceId={shape.id} kind={p.kind} url={p.url} show={active} />}
    </div>
  </NodeFrame>;
}
