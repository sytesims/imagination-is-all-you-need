import { ACCEPT, kindOfFile, wrongTypeText } from '../../../server/src/shared/mediaAccept';
/**
 * The non-generate nodes' views, all on the shared NodeFrame (their shape utils and create helpers are in auxShapes.tsx):
 *  - Prompt: text whose output feeds a generate node's prompt;
 *  - Upload: drop / pick an image, clip or sound (POST /api/media; the node keeps the /files/ URL);
 *  - Note: plain text for the user (never an input; its text can still feed a prompt);
 *  - Compare: two media inputs with the shared before/after slider;
 *  - Ad layout: one picture with your headline, offer, button and logo laid on top by code (AdNode.tsx);
 *  - Group: a frame around generate nodes with Run all. The first press only quotes every member and shows ONE total;
 *    the second press (within six seconds) runs them. Nothing is submitted on the first press.
 */
import { useEffect, useRef, useState } from 'react';
import { HTMLContainer, useEditor, useValue, type TLShapeId } from 'tldraw';
import { useToast } from '../shared/Toast';
import { uploadMedia } from '../shared/batch1';
import { mediaPoster } from './fileDrop';
import ImageCompare from '../shared/ImageCompare';
import { AudioCard } from '../shared/AudioCard';
import { tip } from '../shared/Tooltip';
import { ImageIcon, VideoIcon, AudioIcon } from '../ui/Icons';
import { NodeFrame } from './NodeFrame';
import { keepNodeControls } from './nodeFrameModel';
import type { AuxNodeProps, AuxNodeShape } from './auxShapes';
import { nodeDefOf } from './nodeTypes';
import { groupGenIds, runAllCommit, runAllConfirm, runAllPriceLabel, type RunAllConfirm } from './nodeLogic';
import { cardInputs } from './graph';
import { quoteNode, submitInOrder } from './nodeRun';
import * as Ic from './icons';
import { AdView } from './AdNode';

const KIND_ICON = { prompt: Ic.PromptIcon, upload: Ic.UploadIcon, note: Ic.NoteIcon, compare: Ic.CompareIcon, group: Ic.GroupIcon, ad: Ic.AdIcon } as const;

export function AuxView({ shape }: { shape: AuxNodeShape }) {
  const kind = nodeDefOf(shape.type)?.kind ?? 'note'; const p = shape.props as AuxNodeProps; const Icon = KIND_ICON[kind as keyof typeof KIND_ICON] ?? Ic.PromptIcon;
  return <HTMLContainer style={{ pointerEvents: kind === 'group' ? 'none' : 'all' }} onPointerDown={keepNodeControls} onPointerUp={keepNodeControls}>
    {kind === 'prompt' ? <PromptView shape={shape} p={p} Icon={Icon} /> : kind === 'upload' ? <UploadView shape={shape} p={p} Icon={Icon} /> : kind === 'note' ? <NoteView shape={shape} p={p} Icon={Icon} /> : kind === 'compare' ? <CompareView shape={shape} p={p} Icon={Icon} /> : kind === 'ad' ? <AdView shape={shape as any} Icon={Icon} /> : <GroupView shape={shape} p={p} Icon={Icon} />}
  </HTMLContainer>;
}

function TextNode({ shape, p, Icon, note = false }: { shape: AuxNodeShape; p: AuxNodeProps; Icon: (q: { size?: number }) => JSX.Element; note?: boolean }) {
  const editor = useEditor();
  const set = (text: string) => editor.run(() => editor.updateShape({ id: shape.id, type: shape.type, props: { text } } as any), { history: 'ignore' });
  const words = p.text.trim() ? p.text.trim().split(/\s+/).length : 0;
  return <NodeFrame shapeId={shape.id} type={shape.type} icon={<Icon />} title={note ? 'Note' : 'Prompt'} status={<span className="nf-status">{note ? 'Note' : 'Text'}</span>}
    footer={<><span className="nf-model"><b>{words ? `${words} word${words === 1 ? '' : 's'}` : note ? 'A note for you' : 'Text input'}</b></span><span className="nf-price" {...tip(note ? 'A note never takes an input; its output can feed a prompt' : 'Drag the output onto a generate node to feed its prompt')}>{note ? 'Not an input' : 'Prompt'}</span></>}>
    <div className={`ax-body${note ? ' ax-note' : ''}`}>
      <textarea className="ax-text" data-card-control data-testid={note ? 'note-text' : 'prompt-text'} value={p.text} placeholder={note ? 'Write a note for yourself…' : 'Write a prompt, then drag its output onto a generate node…'}
        onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()} onChange={e => set(e.target.value)} />
    </div>
  </NodeFrame>;
}
const PromptView = (o: { shape: AuxNodeShape; p: AuxNodeProps; Icon: any }) => <TextNode {...o} />;
const NoteView = (o: { shape: AuxNodeShape; p: AuxNodeProps; Icon: any }) => <TextNode {...o} note />;

function UploadView({ shape, p, Icon }: { shape: AuxNodeShape; p: AuxNodeProps; Icon: any }) {
  const editor = useEditor(); const toast = useToast(); const file = useRef<HTMLInputElement>(null); const [over, setOver] = useState(false); const [busy, setBusy] = useState(false);
  const patch = (props: Partial<AuxNodeProps>) => editor.run(() => editor.updateShape({ id: shape.id, type: shape.type, props } as any), { history: 'ignore' });
  const take = async (f: File | undefined) => { if (!f || busy) return; const mediaKind = kindOfFile(f);
    if (!mediaKind) { toast(wrongTypeText(f.name, ['image', 'video', 'audio']), 'warn'); return; } setBusy(true);
    try { const [m] = await uploadMedia([f]); if (!m?.url) throw new Error('Upload failed'); const kind = (m as any).type || mediaKind; const poster = mediaPoster(kind, m.url);
      patch({ url: m.url, poster, mediaKind: kind, label: f.name }); }
    catch (e) { toast((e as Error).message || 'Upload failed', 'error'); } finally { setBusy(false); } };
  const pick = () => file.current?.click();
  const kind = p.mediaKind; const label = p.label || 'Untitled upload';
  return <NodeFrame shapeId={shape.id} type={shape.type} icon={<Icon />} title="Upload" heading={p.url ? label : 'Add a file'} renamable={!!p.url} status={<span className="nf-status">{kind ? kind === '3d' ? '3D' : kind : 'Media'}</span>}
    footer={<><span className="nf-model">{kind === 'audio' ? <AudioIcon size={14} /> : kind === 'video' ? <VideoIcon size={14} /> : <ImageIcon size={14} />}<b>{p.url ? `${kind === 'video' ? 'Clip' : kind === 'audio' ? 'Sound' : 'Picture'} · feeds other cards` : 'No file yet'}</b></span>{p.url && <span className="nf-price">Input</span>}</>}>
    <input ref={file} type="file" hidden accept={Object.values(ACCEPT).join(',')} onChange={e => { void take(e.target.files?.[0]); e.currentTarget.value = ''; }} />
    <div className={`ax-upload${over ? ' over' : ''}`} data-card-control onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files?.[0]); }} onDoubleClick={pick}>
      {p.url ? <div className="ax-media">
        {kind === 'image' ? <img src={p.url} alt={label} draggable={false} /> : kind === 'video' ? <video src={p.url} poster={p.poster || undefined} controls playsInline preload="metadata" /> : <div className="ax-audio"><AudioCard src={p.url} title={label} model="" bars={32} testId="ax-audio" cover={false} /></div>}
        <div className="ax-media-bar"><small>{label}</small><button type="button" className="ax-pick" onClick={pick} disabled={busy}>{busy ? 'Uploading…' : 'Replace'}</button></div>
      </div> : <div className="ax-drop">
        <Icon size={28} /><b>{busy ? 'Uploading…' : 'Drop a file here'}</b><small>An image, a clip or a sound. It becomes an input you can drag into any node.</small>
        <button type="button" className="ax-pick" data-testid="upload-pick" onClick={pick} disabled={busy}>{busy ? 'Uploading…' : 'Choose a file'}</button>
      </div>}
    </div>
  </NodeFrame>;
}

function CompareView({ shape, p, Icon }: { shape: AuxNodeShape; p: AuxNodeProps; Icon: any }) {
  const editor = useEditor();
  const inputs = useValue('compare inputs', () => cardInputs(editor, shape).filter(i => i.kind === 'image' || i.kind === 'video'), [editor, shape.id, p.w, p.h]);
  const a = inputs[0], b = inputs[1]; const video = inputs.some(i => i.kind === 'video');
  return <NodeFrame shapeId={shape.id} type={shape.type} icon={<Icon />} title="Compare" status={<span className="nf-status">{inputs.length}/2</span>}
    footer={<><span className="ax-ins">{a && <span className="ax-chip">{a.poster ? <img src={a.poster} alt="" /> : <ImageIcon size={12} />}<span>Before</span></span>}{b && <span className="ax-chip">{b.poster ? <img src={b.poster} alt="" /> : <ImageIcon size={12} />}<span>After</span></span>}</span><span className="nf-price">{inputs.length === 2 ? 'Ready' : 'Needs 2'}</span></>}>
    <div className="ax-body"><div className="ax-compare" data-card-control>
      {a && b ? <ImageCompare before={a.poster || a.url} after={b.poster || b.url} kind={video ? 'video' : 'image'} aspect={video ? '16 / 9' : undefined} /> :
        <div className="ax-empty">{a ? (a.poster ? <img src={a.poster} alt="" style={{ width: 84, height: 60, objectFit: 'cover', borderRadius: 8 }} /> : <ImageIcon size={24} />) : <Ic.CompareIcon size={26} />}
          <b>{a ? 'Connect one more input' : 'Connect two inputs'}</b><small>{a ? 'Drag a second picture or clip into the left port to compare before and after.' : 'Drag a picture or clip from any result, upload or finished node into the left port.'}</small></div>}
    </div></div>
  </NodeFrame>;
}

function GroupView({ shape, p, Icon }: { shape: AuxNodeShape; p: AuxNodeProps; Icon: any }) {
  const editor = useEditor(); const toast = useToast(); const [confirm, setConfirm] = useState<RunAllConfirm | null>(null); const [busy, setBusy] = useState(false);
  const members = useValue('group members', () => {
    const b = editor.getShapePageBounds(shape.id); if (!b) return [] as string[];
    return groupGenIds(b, editor.getCurrentPageShapes().map(s => ({ id: s.id, type: s.type, bounds: editor.getShapePageBounds(s.id) })));
  }, [editor, shape.id, p.w, p.h]);
  const runnable = useValue('group runnable', () => members.filter(id => { const s = editor.getShape(id as TLShapeId); const st = (s?.props as any)?.status; return st === 'draft' || st === 'failed'; }), [editor, members.join(',')]);
  const key = runnable.join(',');
  useEffect(() => { setConfirm(null); }, [key]);
  useEffect(() => { if (!confirm) return; const t = setTimeout(() => setConfirm(null), 10000); return () => clearTimeout(t); }, [confirm]);
  const press = async () => {
    if (busy) return;
    if (confirm) { const ids = runAllCommit(confirm); if (!ids) { setConfirm(null); return; } setConfirm(null); setBusy(true); let n = 0;
      /* graph order (2026-10-28): a node fed by another node in the group starts when that one is done, with its input */
      try { const r = await submitInOrder(editor, ids, { stop: () => true, onLater: (_id, x) => { if (x.error) toast(x.error, 'error'); } }); n = r.jobIds.length;
        if (r.failed.length) toast(r.failed[0].error || 'That node could not start.', 'error');
        setBusy(false); if (n || r.later.length) toast(`${n} run${n === 1 ? '' : 's'} started${r.later.length ? `, ${r.later.length} more when the ones before them finish` : ''}`); }
      catch (e) { setBusy(false); toast((e as Error).message || 'That node could not start.', 'error'); }
      return; }
    if (!runnable.length) return;
    setBusy(true); try { const quotes = await Promise.all(runnable.map(id => quoteNode(editor, id as TLShapeId).catch(() => null))); setConfirm(runAllConfirm(runnable, quotes)); }
    catch (e) { toast((e as Error).message || 'Could not price these nodes.', 'error'); } finally { setBusy(false); }
  };
  const label = busy ? (confirm ? 'Starting…' : 'Pricing…') : confirm ? `Run ${confirm.count} · ${runAllPriceLabel(confirm.total)}` : 'Run all';
  const sub = busy ? 'Please wait' : confirm ? 'Press again to run' : runnable.length ? 'Price first' : 'Nothing to run';
  return <NodeFrame shapeId={shape.id} type={shape.type} icon={<Icon />} title="Group" status={<span className="nf-status">{members.length} node{members.length === 1 ? '' : 's'}</span>}
    actions={<button type="button" className={`nf-runall${confirm ? ' confirm' : ''}`} data-testid="group-run" data-confirm={confirm ? '1' : undefined} disabled={busy || (!runnable.length && !confirm)} onClick={() => void press()} {...tip(confirm ? 'Runs every draft / failed generate node in this group now' : 'Prices every draft / failed generate node in this group first; a second press runs them')}><span>{label}</span><small>{sub}</small></button>}
    rootAttrs={{ 'data-members': String(members.length) }} />;
}
