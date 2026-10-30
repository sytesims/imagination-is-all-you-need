import { ACCEPT, kindOfFile, wrongTypeText } from '../../../server/src/shared/mediaAccept';
/**
 * Canvas chrome in our style, drawn over tldraw (rendered as <Tldraw> children, so tldraw's editor and UI context are available):
 *  - LeftToolbar: Select, Hand, New node (node types + workflows), Upload, then tldraw's own Sticky note, Text, Arrow, Frame and Pen
 *    (so a person can add ideas beside the agent's), Group, Zoom. tldraw's own toolbar is hidden through the components override; the
 *    tool list still comes from useTools, so V / H / T / A / F / D and every other tldraw shortcut works.
 *  - Zoom is in the rail (out, %, in, fit); the old bottom panel is gone.
 *  - EmptyHint: a new board's quiet hint. The board switcher, spend chip and assets drawer live in CanvasPage.
 */
import { useRef, useState } from 'react';
import { useEditor, useIsToolSelected, useTools, useValue } from 'tldraw';
import { BarPopover, PopSection, PopRow } from '../shared/BarPop';
import { ImageIcon, VideoIcon, AudioIcon, CubeIcon } from '../ui/Icons';
import { DEFAULT_FLOW, availableFlows, type GenMedium } from '../shared/genFlows';
import { createNode } from './agentApi';
import { FlowIcon } from './GenCardShape';
import { OrbitMark } from '../shared/OrbitMark';
import { tip } from '../shared/Tooltip';
import { useToast } from '../shared/Toast';
import { uploadMedia } from '../shared/batch1';
import { useCatalog } from './catalog';
import * as Ic from './icons';
import { tidyNow } from './LinkLayer';

type ToolDef = { id: string; label: string; key: string; icon: (p: { size?: number }) => JSX.Element };
const TOOLS: (ToolDef | null)[] = [
  { id: 'select', label: 'Select', key: 'V', icon: Ic.SelectIcon }, { id: 'hand', label: 'Hand', key: 'H', icon: Ic.HandIcon },
];
/** tldraw's drawing tools, in our icons: the board is for ideas too (the agent reads stickies and text). */
const DRAW_TOOLS: ToolDef[] = [
  { id: 'note', label: 'Sticky note', key: '', icon: Ic.StickyIcon }, { id: 'text', label: 'Text', key: 'T', icon: Ic.TextIcon },
  { id: 'arrow', label: 'Arrow', key: 'A', icon: Ic.ArrowIcon }, { id: 'frame', label: 'Frame', key: 'F', icon: Ic.FrameIcon },
  { id: 'draw', label: 'Pen', key: 'D', icon: Ic.PenIcon },
];

function ToolButton({ def }: { def: ToolDef }) {
  const tools = useTools(); const t = tools[def.id]; const on = useIsToolSelected(t);
  if (!t) return null;
  return <button type="button" className={`cv-tool${on ? ' on' : ''}`} aria-pressed={on} aria-label={def.key ? `${def.label} (${def.key})` : def.label} {...tip(def.key ? `${def.label} · ${def.key}` : def.label)} data-testid={`cv-tool-${def.id}`} onClick={() => t.onSelect('toolbar')}><def.icon /></button>;
}

const GEN: { id: GenMedium; label: string; hint: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { id: 'image', label: 'Image', hint: 'Create, Relight, Upscale…', icon: ImageIcon }, { id: 'video', label: 'Video', hint: 'Create, Extend, Lip Sync…', icon: VideoIcon },
  { id: 'audio', label: 'Audio', hint: 'Music, sound, speech', icon: AudioIcon }, { id: '3d', label: '3D', hint: 'Image to 3D', icon: CubeIcon }];
const NODES: { id: 'prompt' | 'upload' | 'note' | 'compare' | 'group' | 'ad'; label: string; hint: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { id: 'prompt', label: 'Prompt', hint: 'Feeds a generate node', icon: Ic.PromptIcon }, { id: 'upload', label: 'Upload', hint: 'Image, clip or sound', icon: Ic.UploadIcon },
  { id: 'note', label: 'Note', hint: 'Plain text for you', icon: Ic.NoteIcon }, { id: 'compare', label: 'Compare', hint: 'Before / after slider', icon: Ic.CompareIcon },
  { id: 'group', label: 'Group', hint: 'A frame with Run all', icon: Ic.GroupIcon }, { id: 'ad', label: 'Ad layout', hint: 'Headline, price and logo', icon: Ic.AdIcon }];

type Make = (kind: 'gen' | 'prompt' | 'upload' | 'note' | 'compare' | 'group' | 'ad', flow?: string) => void;
const plural = (n: number) => `${n} workflow${n === 1 ? '' : 's'}`;
/** One menu tile; `more` (a medium with several workflows) shows its count and opens that medium's list. */
const Tile = ({ id, label, hint, icon: I, more, onClick }: { id: string; label: string; hint: string; icon: (p: { size?: number }) => JSX.Element; more?: number; onClick: () => void }) =>
  <button type="button" role="menuitem" className="cv-new-tile" data-testid={`cv-new-${id}`} aria-label={more ? `${label}, ${plural(more)}` : undefined} onClick={onClick}>
    <i><I size={15} /></i>{more ? <em className="cv-new-n" aria-hidden>{more}<Ic.ChevronRightIcon size={12} /></em> : null}<b>{label}</b><small>{hint}</small></button>;

/** "New node": the Generate tiles (each opens its medium's workflows) and the other node kinds. */
export function NewNodeButton() {
  const editor = useEditor(); const cat = useCatalog(); const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false); const [step, setStep] = useState<GenMedium | null>(null);
  const flows = availableFlows(cat); const count = (m: GenMedium) => flows.filter(f => f.medium === m).length;
  const focus = (sel: string) => requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="cv-new-pop"] ${sel}`)?.focus({ preventScroll: true }));
  const close = () => { setOpen(false); setStep(null); };
  const back = () => { const m = step; setStep(null); if (m) focus(`[data-testid="cv-new-${m}"]`); };
  const pick = (m: GenMedium) => { if (count(m) > 1) { setStep(m); focus('.cv-new-flows [role=menuitem]'); } else make('gen', DEFAULT_FLOW[m]); };
  const make: Make = (kind, flow) => { close(); editor.setCurrentTool('select'); createNode(editor, kind, kind === 'gen' ? { flow: flow ?? DEFAULT_FLOW.image } : {}); };
  const g = step && GEN.find(k => k.id === step); const list = step ? flows.filter(f => f.medium === step) : [];
  return <>
    <button ref={btn} type="button" className={`cv-tool cv-new${open ? ' on' : ''}`} aria-haspopup="menu" aria-expanded={open} aria-label="New node (G)" {...tip(open ? null : 'New node · G')} data-testid="cv-new" onClick={() => open ? close() : setOpen(true)}><Ic.PlusIcon /></button>
    <BarPopover open={open} anchor={btn} onClose={close} onEscape={step ? back : close} label={g ? `New ${g.label} node` : 'New node'} placement="right" width={326} testId="cv-new-pop" role="menu">
      {!g ? <>
        <PopSection label="Generate"><div className="cv-new-grid" role="group">{GEN.map(k => { const n = count(k.id); return <Tile key={k.id} {...k} more={n > 1 ? n : undefined} onClick={() => pick(k.id)} />; })}</div></PopSection>
        <PopSection label="Nodes"><div className="cv-new-grid" role="group">{NODES.map(k => <Tile key={k.id} {...k} onClick={() => make(k.id)} />)}</div></PopSection>
      </> : <div className="cv-new-step">
        <div className="cv-new-head"><button type="button" className="cv-new-back" aria-label="Back" data-testid="cv-new-back" onClick={back}><Ic.ChevronLeftIcon size={16} /></button>
          <i><g.icon size={15} /></i><b>{g.label}</b><span>{plural(list.length)}</span></div>
        <div className="cv-new-flows" role="group" aria-label={`${g.label} workflows`}>{list.map(f => <PopRow key={f.id} role="menuitem" className="cv-new-flow" icon={<FlowIcon flow={f.id} medium={f.medium} size={15} />} label={f.name} hint={f.tagline || f.needs} testId={`cv-new-wf-${f.id}`} onClick={() => make('gen', f.id)} />)}</div>
      </div>}
      <p className="cv-new-note">A draft node with its price. Nothing runs until you press Generate.</p>
    </BarPopover>
  </>;
}

/** Upload: picks a file, uploads it through POST /api/media and drops an Upload node with the /files/ URL. */
function UploadButton() {
  const editor = useEditor(); const toast = useToast(); const file = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false);
  const take = async (f: File | undefined) => { if (!f || busy) return; if (!kindOfFile(f)) { toast(wrongTypeText(f.name, ['image', 'video', 'audio']), 'warn'); return; } setBusy(true);
    try { const [m] = await uploadMedia([f]); if (!m?.url) throw new Error('Upload failed'); const kind = (m as any).type || (/^image\//.test(f.type) ? 'image' : /^video\//.test(f.type) ? 'video' : 'audio');
      const poster = kind === 'image' ? m.url : kind === 'video' ? `/api/media/thumb?url=${encodeURIComponent(m.url)}` : '';
      createNode(editor, 'upload', { media: { url: m.url, poster, mediaKind: kind, label: f.name } }); }
    catch (e) { toast((e as Error).message || 'Upload failed', 'error'); } finally { setBusy(false); } };
  return <>
    <input ref={file} type="file" hidden accept={Object.values(ACCEPT).join(',')} onChange={e => { void take(e.target.files?.[0]); e.currentTarget.value = ''; }} />
    <button type="button" className="cv-tool" aria-label="Upload an image, clip or sound" {...tip('Upload an image, clip or sound')} data-testid="cv-tool-upload" disabled={busy} onClick={() => file.current?.click()}><Ic.UploadIcon /></button>
  </>;
}

export function LeftToolbar() {
  const editor = useEditor(); const toast = useToast(); const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor]);
  const opts = { animation: { duration: 160 } };
  return <nav className="cv-toolbar" aria-label="Canvas tools" data-testid="cv-toolbar">
    {TOOLS.map(d => d ? <ToolButton key={d.id} def={d} /> : null)}
    <hr className="cv-sep" />
    <NewNodeButton />
    <UploadButton />
    <hr className="cv-sep" />
    {DRAW_TOOLS.map(d => <ToolButton key={d.id} def={d} />)}
    <button type="button" className="cv-tool" aria-label="Group the selection (Shift+G)" {...tip('Group the selection · Shift+G')} data-testid="cv-tool-group" onClick={() => { editor.setCurrentTool('select'); createNode(editor, 'group'); }}><Ic.GroupIcon /></button>
    <button type="button" className="cv-tool" aria-label="Tidy: lay linked cards into rows" {...tip('Tidy · linked cards into rows, left to right (Undo puts it back)')} data-testid="cv-tool-tidy" onClick={() => { const n = tidyNow(editor); if (!n) toast('Already tidy.'); }}><Ic.TidyIcon /></button>
    <hr className="cv-sep" />
    <div className="cv-rail-zoom" role="group" aria-label="Zoom" data-testid="cv-zoom">
      <button type="button" className="cv-tool" aria-label="Zoom out" {...tip('Zoom out · −')} onClick={() => editor.zoomOut(undefined, opts)}><Ic.ZoomOutIcon size={16} /></button>
      <button type="button" className="cv-rail-pct" aria-label="Reset zoom to 100%" {...tip('Reset to 100% · Shift+0')} data-testid="cv-zoom-pct" onClick={() => editor.resetZoom(undefined, opts)}>{Math.round(zoom * 100)}%</button>
      <button type="button" className="cv-tool" aria-label="Zoom in" {...tip('Zoom in · +')} onClick={() => editor.zoomIn(undefined, opts)}><Ic.ZoomInIcon size={16} /></button>
      <button type="button" className="cv-tool" aria-label="Zoom to fit" {...tip('Fit everything · Shift+1')} onClick={() => editor.zoomToFit(opts)}><Ic.FitIcon size={16} /></button>
    </div>
  </nav>;
}

export function EmptyHint({ onOpenAssets }: { onOpenAssets: () => void }) {
  const editor = useEditor(); const empty = useValue('board empty', () => editor.getCurrentPageShapeIds().size === 0, [editor]);
  const tool = useValue('tool', () => editor.getCurrentToolId(), [editor]);
  if (!empty) return null;
  return <div className={`cv-empty${tool !== 'select' && tool !== 'hand' ? ' quiet' : ''}`} data-testid="cv-empty">
    <OrbitMark size={40} className="cv-empty-mark" />
    <p>An endless board for your ideas. Tell the agent what to make, add a sticky note, or press <kbd>G</kbd> for a card.</p>
    <button type="button" className="cv-empty-btn" onClick={onOpenAssets} data-testid="cv-empty-assets">Open Assets</button>
  </div>;
}
