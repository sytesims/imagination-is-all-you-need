/**
 * MOCKUP (2026-10-31, not committed; the user picked layout A): the card panel on the right of the board. Select one card and it shows
 * the card big, how it was made and what to do next, as one calm column of identical sections:
 *   header (tile · name · one subtitle line) → preview (one fixed frame for every kind) → Versions → Run again / Set it up →
 *   Made with → Next steps → Connections, and one footer row (Download · Open in … · full size) on every finished card.
 * Every section has the same heading, spacing and hairline (Section); every helper line the same caption style. The pieces inside are
 * the app's own (VideoControls, AudioCard, GenTile, WorkflowControls, DockGenerate, GenPrice, MakerTile, linksFor, QUICK_ACTIONS +
 * actionPrice, variationOf, toolHrefOf, jobCaption). The panel reads the board live (tldraw useValue) and keeps only its pin.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useEditor, useValue, type Editor, type TLShape, type TLShapeId, type TLArrowBinding } from 'tldraw';
import { getJob, type JobState } from '../api';
import { gridSrc } from '../shared/thumbs';
import { VideoControls } from '../shared/VideoControls';
import AudioCard from '../shared/AudioCard';
import GenTile from '../shared/GenTile';
import { GenPrice } from '../shared/GenPrice';
import { DockGenerate } from '../shared/DockGenerate';
import { MakerTile } from '../shared/MakerTile';
import { linksFor } from '../shared/ModelInfoCard';
import { shownCredits } from '../shared/quote';
import { useToolQuote } from '../shared/useToolQuote';
import { jobCaption } from '../shared/FeedCaption';
import { modelOfEngine, shownName } from '../shared/models';
import { flowById, flowInfo, flowAudioKind, availableFlows, tooManyNote, type GenMedium } from '../shared/genFlows';
import { audioKindOfJob } from '../shared/audioVizLogic';
import ImageCompare from '../shared/ImageCompare';
import { workflowRecreateHref } from '../shared/workflowLinks';
import { tip } from '../shared/Tooltip';
import { useToast } from '../shared/Toast';
import { navigate } from '../platform/router';
import { WorkflowControls } from '../ui/next/WorkflowBar';
import { ImageIcon, VideoIcon, AudioIcon, CubeIcon, DownloadIcon, CloseIcon, TextIcon, ChevronRightIcon, ExpandIcon } from '../ui/Icons';
import { CopyIcon, RetryIcon, PullOutIcon, NoteIcon, PromptIcon, UploadIcon, AdIcon, CompareIcon, GroupIcon } from './icons';
import { useCatalog, catalogNow } from './catalog';
import { GEN_TYPE, type GenCardProps, type Take, type MadeFrom as MadeFromT } from './cardModel';
import { CardInputs } from './CardInputs';
import { RESULT_TYPE, PROMPT_TYPE, NOTE_TYPE, UPLOAD_TYPE, AD_TYPE, COMPARE_TYPE, GROUP_TYPE, isNodeType } from './nodeTypes';
import { groupGenIds } from './nodeLogic';
import { AD_PLATFORMS, asPlatforms } from './adPlatforms';
import { cardState, makerOf, missingOf, modelNameOf } from './cardState';
import { cardInputs, promptSourcesInto } from './graph';
import { liveJobs } from './genRun';
import { runCard, open3d } from './canvasEvents';
import { setCard, submit } from './agentApi';
import { reveal } from './placement';
import { variationOf } from './variation';
import { QUICK_ACTIONS, NEXT_STEPS, quickCard, type Act } from './quickActionsModel';
import { actionPrice } from './QuickActions';
import { toolHrefOf } from './agentDockModel';
import { placeWord } from './cardLook';
import { badgeText } from '../../../server/src/shared/takeReview';
import './cardPanel.css';

const PIN_KEY = 'ohf-card-panel-pin';
const readPin = () => { try { return localStorage.getItem(PIN_KEY) === '1'; } catch { return false; } };

/* ------------------------------------------------------------------ what the panel reads from the board */
type Media = { kind: 'image' | 'video' | 'audio' | '3d'; url: string; poster: string; jobId: string };
/** A connection row. No id: a file added on the card itself (nothing to jump to). */
type Link = { id?: TLShapeId; label: string; poster: string; kind: string; slot?: string };
const MEDIUM_ICON = { image: ImageIcon, video: VideoIcon, audio: AudioIcon, '3d': CubeIcon } as const;
const KIND_WORD: Record<string, string> = { image: 'Picture', video: 'Clip', audio: 'Sound', '3d': '3D model', text: 'Text' };
const KIND_ICON: Record<string, typeof ImageIcon> = { image: ImageIcon, video: VideoIcon, audio: AudioIcon, '3d': CubeIcon, text: TextIcon };

function shapeName(s: TLShape): string {
  const p: any = s.props; const shot = String((s.meta as any)?.name ?? '').trim(); if (shot) return shot;
  if (s.type === GEN_TYPE) { const f = flowById(p.flow); return f ? flowInfo(f, catalogNow()).name : 'Generate'; }
  if (s.type === RESULT_TYPE) return p.title || p.model || 'Result';
  if (s.type === PROMPT_TYPE) return 'Prompt'; if (s.type === NOTE_TYPE) return 'Note'; if (s.type === UPLOAD_TYPE) return p.label || 'Upload';
  if (s.type === AD_TYPE) return 'Ad layout'; if (s.type === COMPARE_TYPE) return 'Compare'; if (s.type === GROUP_TYPE) return 'Group'; return 'Card';
}
function mediaOf(s: TLShape): Media | null {
  const p: any = s.props;
  if (s.type === GEN_TYPE) { const t: Take | undefined = p.takes?.[Math.min(p.take ?? 0, (p.takes?.length ?? 1) - 1)]; return t ? { kind: t.kind as any, url: t.url, poster: t.poster, jobId: t.jobId } : null; }
  if (s.type === RESULT_TYPE) return p.url ? { kind: p.kind, url: p.url, poster: p.poster || (p.kind === 'image' ? p.url : ''), jobId: p.jobId } : null;
  if (s.type === UPLOAD_TYPE) return p.url ? { kind: p.mediaKind, url: p.url, poster: p.poster || (p.mediaKind === 'image' ? p.url : ''), jobId: '' } : null;
  return null;
}
const linkOf = (s: TLShape, slot?: string): Link => { const m = mediaOf(s); const k = s.type === PROMPT_TYPE || s.type === NOTE_TYPE ? 'text' : m?.kind ?? String((s.props as any).medium ?? 'image');
  return { id: s.id, label: shapeName(s), poster: m?.poster ?? '', kind: k, slot }; };
/** The cards this one feeds: arrows that start on it and end on another node. */
function usedByOf(editor: Editor, id: TLShapeId): Link[] {
  const out: Link[] = []; const seen = new Set<string>();
  for (const b of editor.getBindingsToShape<TLArrowBinding>(id, 'arrow')) { if (b.props.terminal !== 'start') continue;
    const end = editor.getBindingsFromShape<TLArrowBinding>(b.fromId, 'arrow').find(x => x.props.terminal === 'end'); const to = end ? editor.getShape(end.toId) : null;
    if (to && to.id !== id && isNodeType(to.type) && !seen.has(to.id)) { seen.add(to.id); out.push(linkOf(to)); } }
  return out;
}
/** What feeds it: arrow inputs and files added on the card (with their slot), Prompt / Note text, and the card it was pulled out of. */
function inputsOf(editor: Editor, s: TLShape, bySlot: Record<string, { key: string }[]>, slotLabel: Record<string, string>): Link[] {
  const out: Link[] = []; const seen = new Set<string>(); const slotOfKey: Record<string, string> = {};
  for (const [name, list] of Object.entries(bySlot)) for (const i of list) slotOfKey[i.key] = slotLabel[name] ?? name;
  const placed = Object.keys(bySlot).length > 0; const slotOf = (key: string) => slotOfKey[key] ?? (placed ? NOT_USED : undefined);
  if (s.type === GEN_TYPE || s.type === COMPARE_TYPE || s.type === AD_TYPE) for (const [k, i] of cardInputs(editor, s).entries()) { const src = i.shapeId ? editor.getShape(i.shapeId as TLShapeId) : null;
    const slot = s.type === COMPARE_TYPE ? (k === 0 ? 'Before' : k === 1 ? 'After' : NOT_USED) : s.type === AD_TYPE ? (k === 0 ? 'Picture' : NOT_USED) : slotOf(i.key);
    if (src) { if (!seen.has(src.id)) { seen.add(src.id); out.push(linkOf(src, slot)); } } else if (!i.shapeId) out.push({ label: i.label, poster: i.poster, kind: i.kind, slot }); }
  for (const t of promptSourcesInto(editor, s.id)) { const src = editor.getShape(t.id); if (src && !seen.has(src.id)) { seen.add(src.id); out.push(linkOf(src, 'Prompt')); } }
  for (const pid of ((s.props as any).parents ?? []) as string[]) { const src = editor.getShape(pid as TLShapeId); if (src && !seen.has(src.id)) { seen.add(src.id); out.push(linkOf(src, s.type === RESULT_TYPE ? 'Pulled out of' : 'Made from')); } }
  return out;
}
/** An input past its slot's limit: wired in, but the run leaves it out. */
const NOT_USED = 'Not used';
const jump = (editor: Editor, id: TLShapeId | undefined) => { if (!id || !editor.getShape(id)) return; editor.select(id); reveal(editor, id); };

/** The finished job behind a take: real cost, where it ran, how long it took. */
function useJob(jobId: string | undefined): JobState | null {
  const live = useValue('panel job', () => (jobId ? liveJobs.get()[jobId] ?? null : null), [jobId]); const [j, setJ] = useState<JobState | null>(null);
  useEffect(() => { setJ(null); if (!jobId || live) return; let on = true; void getJob(jobId).then(x => { if (on) setJ(x); }).catch(() => undefined); return () => { on = false; }; }, [jobId, !!live]); // eslint-disable-line react-hooks/exhaustive-deps
  return live ?? j;
}

type View = ReturnType<typeof buildView> & {};
function useCardView(editor: Editor, s: TLShape | null, cat: ReturnType<typeof useCatalog>) {
  const st = useValue('panel state', () => (s && s.type === GEN_TYPE ? cardState(editor, s, cat) : null), [editor, s, cat]);
  const links = useValue('panel links', () => { if (!s) return { ins: [] as Link[], outs: [] as Link[] };
    const slotLabel = Object.fromEntries((st?.spec?.slots ?? []).map(x => [x.name, x.label])); return { ins: inputsOf(editor, s, st?.bySlot ?? {}, slotLabel), outs: usedByOf(editor, s.id) }; }, [editor, s, st]);
  const linked = useValue('panel prompt', () => (s ? promptSourcesInto(editor, s.id) : []), [editor, s]);
  const p: any = s?.props ?? {}; const spec = st?.spec ?? null; const draft = s?.type === GEN_TYPE && p.status === 'draft';
  const q = useToolQuote(spec && s?.type === GEN_TYPE ? spec.tool.id : null, spec?.provider ?? '', spec?.quote ?? {});
  const media = s ? mediaOf(s) : null; const job = useJob(media?.jobId || (s?.type === GEN_TYPE ? p.jobId : undefined));
  return s ? buildView(s, { st, spec, draft, q, media, job, links, linked }) : null;
}
function buildView(s: TLShape, x: { st: ReturnType<typeof cardState> | null; spec: any; draft: boolean; q: any; media: Media | null; job: JobState | null; links: { ins: Link[]; outs: Link[] }; linked: { id: TLShapeId; text: string }[] }) {
  const p: any = s.props; const gen = s.type === GEN_TYPE; const f0 = gen ? flowById(p.flow) : null; const f = f0 ? flowInfo(f0, catalogNow()) : null;
  const medium: GenMedium | 'text' = gen ? p.medium : s.type === RESULT_TYPE || s.type === UPLOAD_TYPE ? (x.media?.kind ?? 'image') as GenMedium : 'text';
  const model = gen ? (x.draft ? modelNameOf(x.spec) || p.model : p.model || modelNameOf(x.spec)) : s.type === RESULT_TYPE ? p.model : '';
  const maker = gen ? (x.draft ? makerOf(x.spec) : p.maker) || makerOf(x.spec) : '';
  const m = gen && x.spec ? modelOfEngine(x.spec.tool.id, x.spec.provider) : undefined;
  const status: string = gen ? p.status : 'done';
  const statusWord = !gen ? '' : x.draft ? 'Draft' : status === 'running' ? 'Running' : status === 'failed' ? 'Didn’t work' : p.takes.length > 1 ? `${p.takes.length} versions` : 'Done';
  const cap = x.job ? jobCaption(x.job, null) : null;
  const typeWord = gen ? `${f?.name ?? 'Generate'}` : s.type === RESULT_TYPE ? `${KIND_WORD[p.kind] ?? 'Result'} on the board` : s.type === UPLOAD_TYPE ? `Your ${String(KIND_WORD[p.mediaKind] ?? 'file').toLowerCase()}` : s.type === PROMPT_TYPE ? 'Text that feeds other cards' : s.type === NOTE_TYPE ? 'A note for you' : s.type === AD_TYPE ? 'Your words on a picture' : s.type === COMPARE_TYPE ? 'Before and after' : s.type === GROUP_TYPE ? 'A frame with Run all' : 'Card';
  const explain = gen ? (f?.tagline ? `${f.tagline}.` : null) : s.type === RESULT_TYPE ? 'A finished result. Wire it into another card to keep going.' : s.type === PROMPT_TYPE ? 'Every card this feeds uses this text as its prompt.'
    : s.type === COMPARE_TYPE ? 'Two pictures or clips with a slider between them. The first arrow in is Before, the second After.'
    : s.type === GROUP_TYPE ? 'Every generate card inside the frame runs together. You see the total first.'
    : s.type === AD_TYPE ? 'Your headline, offer, button and logo laid on one picture by code, sized for each platform. Free, in the browser.' : null;
  const Icon = s.type === PROMPT_TYPE ? PromptIcon : s.type === NOTE_TYPE ? NoteIcon : s.type === UPLOAD_TYPE && !x.media ? UploadIcon : s.type === AD_TYPE ? AdIcon : s.type === COMPARE_TYPE ? CompareIcon : s.type === GROUP_TYPE ? GroupIcon : (MEDIUM_ICON as any)[medium] ?? TextIcon;
  const prompt = x.linked.map(l => l.text).join('\n\n') || (gen ? p.prompt : s.type === PROMPT_TYPE || s.type === NOTE_TYPE ? p.text : s.type === RESULT_TYPE ? p.title : '');
  const quote = x.draft ? x.q : p.quote;
  const tint = s.type === COMPARE_TYPE ? 'compare' : s.type === GROUP_TYPE ? 'group' : s.type === AD_TYPE ? 'ad' : medium;
  return { s, p, gen, f, medium, tint, model, maker, m, status, statusWord, draft: x.draft, title: shapeName(s), kindLine: typeWord, explain, Icon, prompt, linkedPrompt: x.linked.length > 0,
    spec: x.spec, st: x.st, q: x.q, quote, media: x.media, job: x.job, cap, ins: x.links.ins, outs: x.links.outs, takes: (gen ? p.takes : []) as Take[], take: gen ? Math.max(0, Math.min(p.take, p.takes.length - 1)) : 0,
    hint: gen && p.takes.length > 1 ? 'The ringed one goes on' : undefined,
    /* music, a voice or a sound effect (the panel's sound tile says which): the workflow's, else the job's */
    audioKind: f ? flowAudioKind(f) : audioKindOfJob(x.job) };
}

/* ------------------------------------------------------------------ the panel */
export function CardPanel({ hidden, onOpen }: { hidden: boolean; onOpen?: (on: boolean) => void }) {
  const editor = useEditor(); const [pin, setPinS] = useState(readPin);
  const setPin = (v: boolean) => { setPinS(v); try { localStorage.setItem(PIN_KEY, v ? '1' : '0'); } catch { /* private window */ } };
  const ids = useValue('panel selection', () => editor.getSelectedShapeIds().filter(id => isNodeType(editor.getShape(id)?.type)), [editor]);
  const open = !hidden && (ids.length > 0 || pin);
  useEffect(() => { onOpen?.(open); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the board gives up its right edge to the panel: if the picked card now sits under the panel, slide the board just enough to show it */
  useEffect(() => { if (!open || !ids.length) return; const t = window.setTimeout(() => { const b = editor.getSelectionPageBounds(); if (!b) return; const vp = editor.getViewportScreenBounds(); const z = editor.getZoomLevel();
      const right = editor.pageToViewport({ x: b.maxX, y: b.minY }).x; const over = right + 24 - vp.w; const left = editor.pageToViewport({ x: b.minX, y: b.minY }).x;
      if (over > 0) { const c = editor.getCamera(); editor.setCamera({ ...c, x: c.x - Math.min(over, Math.max(0, left - 80)) / z }, { animation: { duration: 240 } }); } }, 320);
    return () => window.clearTimeout(t); }, [open, ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && ids.length && !(e.target as HTMLElement)?.closest?.('input,textarea,[contenteditable]')) editor.selectNone(); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [editor, ids.length]);
  const close = () => { setPin(false); editor.selectNone(); };
  const head: HeadFn = (h) => <Header {...h} pin={pin} onPin={() => setPin(!pin)} onClose={close} />;
  return <aside className={`cp${open ? ' on' : ''}`} aria-label="Card details" aria-hidden={!open} data-testid="card-panel" onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
    {ids.length === 1 ? <One key={ids[0]} id={ids[0]} head={head} /> : ids.length > 1 ? <Many ids={ids} head={head} /> : <Empty head={head} />}
  </aside>;
}
const PinIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 17v5M8 3h8l-1 6 3 4H6l3-4z" /></svg>;

/** One header for every state: a tile, the name, and ONE subtitle line ("Create Image · 3 versions", "3 pictures", "5 cards on this board"). */
type HeadProps = { icon: ReactNode; tint?: string; title: string; sub: ReactNode; live?: boolean };
type HeadFn = (h: HeadProps) => JSX.Element;
function Header({ icon, tint = 'none', title, sub, live, pin, onPin, onClose }: HeadProps & { pin: boolean; onPin: () => void; onClose: () => void }) {
  return <header className="cp-head">
    <span className={`cp-tile cp-tile-${tint}`}>{icon}</span>
    <span className="cp-name"><b title={title}>{title}</b><small>{live && <i className="cp-dot" aria-hidden />}{sub}</small></span>
    <button type="button" className={`cp-icon${pin ? ' on' : ''}`} aria-pressed={pin} aria-label="Keep open" {...tip(pin ? 'Stays open. Click to close it with the selection' : 'Keep this panel open')} onClick={onPin}><PinIcon /></button>
    <button type="button" className="cp-icon" aria-label="Close" {...tip('Close (Esc)')} onClick={onClose}><CloseIcon size={14} /></button>
  </header>;
}

/** Every section: the same heading, the same right-hand caption, the same spacing and hairline. */
function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return <section className="cp-sec"><h4 className="cp-sec-h"><span>{title}</span>{aside && <small>{aside}</small>}</h4>{children}</section>;
}
const Caption = ({ children }: { children: ReactNode }) => <p className="cp-cap">{children}</p>;

/* ------------------------------------------------------------------ one card */
function One({ id, head }: { id: TLShapeId; head: HeadFn }) {
  const editor = useEditor(); const cat = useCatalog();
  const s = useValue('panel shape', () => editor.getShape(id) ?? null, [editor, id]); const v = useCardView(editor, s, cat);
  const [peek, setPeek] = useState<Take | null>(null);
  if (!s || !v) return <Empty head={head} />;
  const finished = v.gen ? v.status === 'done' && !!v.media : !!v.media;
  const isText = v.s.type === PROMPT_TYPE || v.s.type === NOTE_TYPE;
  const from: MadeFromT[] = (peek ?? v.takes[v.take])?.from ?? [];
  return <>
    {head({ icon: <v.Icon size={15} />, tint: v.tint, title: v.title, sub: [v.kindLine, v.statusWord].filter(Boolean).join(' · '), live: v.status === 'running' })}
    <div className="cp-body">
      {v.explain && <Caption>{v.explain}</Caption>}
      {!isText && v.s.type !== GROUP_TYPE && <Preview v={v} peek={peek} />}
      {v.s.type === GROUP_TYPE && <GroupBody v={v} />}
      {v.s.type === AD_TYPE && <Section title="Words"><AdWords v={v} /></Section>}
      {v.gen && v.takes.length > 1 && <Section title="Versions" aside={`${v.take + 1} of ${v.takes.length} goes on`}><Versions v={v} onPeek={setPeek} /></Section>}
      {isText && <Section title="Text"><TextEdit v={v} /></Section>}
      {v.gen && v.spec && v.status !== 'running' && <Section title={v.draft ? 'Set it up' : 'Run again'} aside={v.draft ? undefined : 'Same model and settings'}><RunBlock v={v} /></Section>}
      {(v.gen || v.s.type === RESULT_TYPE) && <Section title={v.draft ? 'Model' : 'Made with'}><MadeWith v={v} /></Section>}
      {!v.draft && from.length > 0 && <Section title="Made from" aside={peek ? `Version ${v.takes.indexOf(peek) + 1}` : undefined}><MadeFrom list={from} /></Section>}
      {finished && v.media && v.media.kind !== '3d' && <Section title="Next steps" aside="Each makes a new card"><NextSteps v={v} /></Section>}
      {(v.ins.length > 0 || v.outs.length > 0) && <Section title="Connections" aside={[v.ins.length && `${v.ins.length} in`, v.outs.length && `${v.outs.length} out`].filter(Boolean).join(' · ')}><Connections v={v} /></Section>}
    </div>
    {finished && <footer className="cp-foot"><Actions v={v} /></footer>}
  </>;
}

/** One frame for every kind: full width, a fixed height, contained, rounded. A clip's controls sit inside the same frame. */
function Preview({ v, peek }: { v: View; peek: Take | null }) {
  const vid = useRef<HTMLVideoElement>(null); const [el, setEl] = useState<HTMLVideoElement | null>(null); const box = useRef<HTMLDivElement>(null);
  const m: Media | null = peek ? { kind: peek.kind as any, url: peek.url, poster: peek.poster, jobId: peek.jobId } : v.media;
  useEffect(() => { setEl(vid.current); }, [m?.url]);
  const k = peek ? v.takes.indexOf(peek) : -1;
  const tag = peek ? `Version ${k + 1}${k === v.take ? ' · goes on' : ''}` : null;
  let inner: ReactNode; let kind = 'media';
  if (v.gen && v.status === 'running') { kind = 'run'; inner = <GenTile job={v.job ?? ({ id: v.p.jobId, status: 'queued', stage: 'queued', progress: 0, outputs: [], input: {} } as any)} />; }
  else if (v.gen && v.status === 'failed' && !peek) { kind = 'empty'; inner = <><b>This run didn’t work</b><small>{v.p.error || 'Nothing was made.'}</small></>; }
  else if (!m && v.s.type === COMPARE_TYPE && v.ins.length >= 2 && v.ins[0].poster && v.ins[1].poster) { kind = 'input'; inner = <ImageCompare before={v.ins[0].poster} after={v.ins[1].poster} kind="image" />; }
  else if (!m) { const first = v.ins.find(i => i.poster && i.slot && i.slot !== 'Prompt' && i.slot !== NOT_USED) ?? v.ins.find(i => i.poster); /* a used input before one that's not used */
    if (first) { kind = 'input'; inner = <><img src={gridSrc(first.poster, 760)} alt="" /><span className="cp-tag">{first.slot ?? 'Input'} · {first.label}</span></>; }
    else { kind = 'empty'; const [t, l] = EMPTY_LINE[v.s.type] ?? ['Nothing made yet', v.draft ? 'Set it up below, then press Generate.' : 'No picture yet.']; inner = <><v.Icon size={22} /><b>{t}</b><small>{l}</small></>; } }
  else if (m.kind === 'video') inner = <><video ref={vid} key={m.url} src={m.url} poster={m.poster ? gridSrc(m.poster, 760) : undefined} playsInline loop preload="metadata" onClick={() => { const e = vid.current; if (e) void (e.paused ? e.play() : e.pause()); }} />
    <VideoControls video={el} fullscreen={box} label="Clip playback" seekLabel="Seek clip" /></>;
  else if (m.kind === 'audio') { kind = 'audio'; inner = <AudioCard src={m.url} title={v.prompt || v.title} model={v.model} kind={v.audioKind} tag={v.s.type === UPLOAD_TYPE ? 'Your sound' : undefined} />; }
  else if (m.kind === '3d') inner = <>{m.poster && <img src={gridSrc(m.poster, 760)} alt="" />}<button type="button" className="cp-btn cp-tag-btn" onClick={() => open3d(m.jobId)}><CubeIcon size={14} />View 3D</button></>;
  else inner = <img key={m.url} src={gridSrc(m.url, 760)} alt={v.prompt || v.title} />;
  return <div ref={box} className={`cp-pv cp-pv-${kind}`}>{inner}{tag && <span className="cp-tag">{tag}</span>}</div>;
}

/** Versions fill the row evenly (one column per version up to five); hover to look in the preview, click to pick the one that goes on. */
function Versions({ v, onPeek }: { v: View; onPeek: (t: Take | null) => void }) {
  const editor = useEditor(); const n = v.takes.length;
  const pick = (k: number) => editor.run(() => editor.updateShape({ id: v.s.id, type: GEN_TYPE, props: { take: k, ratio: 0 } } as any), { history: 'ignore' });
  const review = v.takes[v.take]?.review;
  return <>
    <div className="cp-vers" style={{ ['--n' as any]: Math.min(n, 5) }} role="listbox" aria-label="Versions" onPointerLeave={() => onPeek(null)}>
      {v.takes.map((t, k) => <button key={`${t.url}-${k}`} type="button" role="option" aria-selected={k === v.take} className={`cp-ver${k === v.take ? ' on' : ''}`} onPointerEnter={() => onPeek(t)} onFocus={() => onPeek(t)} onBlur={() => onPeek(null)} onClick={() => pick(k)}
        {...tip(k === v.take ? `Version ${k + 1}: this one goes to the next card` : `Use version ${k + 1}`)}>
        {t.poster ? <img src={gridSrc(t.poster, 140)} alt="" /> : <i />}<span className="cp-badge">{k + 1}</span>
        {t.review && <b className={`cp-ver-mark ${t.review.verdict}`} aria-label={badgeText(t.review)}>{t.review.verdict === 'fits' ? '✓' : '!'}</b>}</button>)}
    </div>
    <Caption>{review ? badgeText(review) : 'Hover to look, click to pick the one that goes on.'}</Caption>
  </>;
}

/** How it was made: the prompt in a quiet box with a copy button, the model as one row, then where it ran, the cost and the time. */
function MadeWith({ v }: { v: View }) {
  const toast = useToast(); const [more, setMore] = useState(false);
  const about = v.m ? linksFor(v.m.key, v.m, v.spec?.tool)[0] : null; const open = !!v.m?.openWeights && v.m.maker !== 'openhiggsfield';
  const price = v.draft ? null : v.cap?.price || (v.p.price as string) || null; /* where it ran: the card's own word (placeWord of its quote) on a generate card, the result card's own line on a result: never a second source */
  const place = v.draft ? null : v.gen ? placeWord(v.quote) : (v.p.place as string) || v.cap?.place || null;
  const long = v.prompt.length > 160;
  const facts = [['Ran on', place], ['Cost', price], ['Took', v.draft ? null : v.cap?.time || (v.p.time as string) || null], ['Runs', v.gen && v.p.runs > 1 ? String(v.p.runs) : null]].filter(([, x]) => x) as [string, string][];
  return <div className="cp-made">
    {v.prompt && !v.draft && <div className="cp-quote">
      <p className={more ? 'open' : ''}>{v.prompt}</p>
      <button type="button" className="cp-icon cp-quote-copy" aria-label="Copy the prompt" {...tip('Copy the prompt')} onClick={() => { void navigator.clipboard?.writeText(v.prompt).then(() => toast('Prompt copied')); }}><CopyIcon size={13} /></button>
      {(long || v.linkedPrompt) && <span className="cp-quote-f">{v.linkedPrompt && <small>From {v.ins.find(i => i.slot === 'Prompt')?.label ?? 'a note'}</small>}{long && <button type="button" className="cp-link" onClick={() => setMore(o => !o)}>{more ? 'Less' : 'More'}</button>}</span>}
    </div>}
    {v.model && <div className="cp-model">
      <MakerTile className="cp-model-tile" maker={v.m?.maker ?? v.maker} makerName={v.m?.makerName} fallback={v.model} medium={v.m?.medium ?? v.medium} title={false} />
      <span className="cp-model-n"><b>{v.m ? shownName(v.m) : v.model}</b>{v.m?.makerName && <small>{v.m.makerName}</small>}</span>
      {open && <em className="cp-open" title="Open weights: the model files are public">Open</em>}
      {about && <a className="cp-link" href={about.href} target="_blank" rel="noreferrer" {...tip(`${about.label}: ${about.href}`)}>About ↗</a>}
    </div>}
    {facts.length > 0 && <dl className="cp-facts">{facts.map(([k, x]) => <div key={k}><dt>{k}</dt><dd>{x}</dd></div>)}</dl>}
  </div>;
}

/** What an empty Compare / Ad layout says (a generate card says "Nothing made yet"). */
const EMPTY_LINE: Record<string, [string, string]> = { [COMPARE_TYPE]: ['Connect two inputs', 'Drag a picture or clip from any card into its left port.'], [AD_TYPE]: ['Start with a picture', 'Wire a picture in, or choose one on the card. Your words and logo go on top.'] };

/** Group: the cards inside the frame (a click jumps to one) and Run the drafts, the same as selecting them all. */
function GroupBody({ v }: { v: View }) {
  const editor = useEditor();
  const ids = useValue('group members', () => { const b = editor.getShapePageBounds(v.s.id); return groupGenIds(b, editor.getCurrentPageShapes().map(x => ({ id: x.id, type: x.type, bounds: editor.getShapePageBounds(x.id) }))) as TLShapeId[]; }, [editor, v.s.id, v.p.w, v.p.h]);
  const shapes = useValue('group shapes', () => ids.map(id => editor.getShape(id)).filter(Boolean) as TLShape[], [editor, ids.join()]);
  if (!shapes.length) return <div className="cp-pv cp-pv-empty"><GroupIcon size={22} /><b>Nothing inside yet</b><small>Move generate cards into the frame, then run them all at once.</small></div>;
  return <>
    <Section title="Inside" aside={`${shapes.length} card${shapes.length === 1 ? '' : 's'}`}><div className="cp-rows">{shapes.map(x => { const m = mediaOf(x);
      return <Row key={x.id} poster={m?.poster ?? ''} kind={m?.kind ?? String((x.props as any).medium ?? 'image')} label={shapeName(x)} sub={STATUS_WORD[(x.props as any).status] ?? 'Card'} onClick={() => jump(editor, x.id)} />; })}</div></Section>
    <RunDrafts shapes={shapes} />
  </>;
}
const STATUS_WORD: Record<string, string> = { draft: 'Draft', running: 'Running', done: 'Done', failed: 'Didn’t work' };

/** Ad layout: the words on the ad, edited here or on the card (the same props), and where it runs. */
function AdWords({ v }: { v: View }) {
  const editor = useEditor(); const p = v.p as { headlines: string[]; offer: string; button: string; platforms?: string[] };
  const set = (props: Record<string, unknown>) => editor.updateShape({ id: v.s.id, type: AD_TYPE, props } as any);
  const hl = [0, 1, 2].map(i => p.headlines?.[i] ?? ''); const shown = Math.max(1, hl.reduce((n, h, i) => (h.trim() ? i + 1 : n), 0));
  const where = asPlatforms(p.platforms).map(x => AD_PLATFORMS[x].label).join(' · ');
  const field = (label: string, value: string, on: (s: string) => void, key: string) => <label key={key} className="cp-field"><small>{label}</small>
    <input className="cp-text cp-input" value={value} placeholder={label} aria-label={label} onChange={e => on(e.target.value)} /></label>;
  return <div className="cp-fields">
    {hl.slice(0, shown).map((h, i) => field(shown > 1 ? `Headline ${i + 1}` : 'Headline', h, x => { const n = [...hl]; n[i] = x; set({ headlines: n }); }, `h${i}`))}
    {field('Offer', p.offer ?? '', x => set({ offer: x }), 'offer')}
    {field('Button', p.button ?? '', x => set({ button: x }), 'button')}
    {where && <Caption>Runs on {where}. Edit, Brand and Export are on the card.</Caption>}
  </div>;
}

/** Prompt / Note: the text, roomy, edited in place. */
function TextEdit({ v }: { v: View }) {
  const editor = useEditor();
  return <textarea className="cp-text" value={v.p.text ?? ''} rows={8} aria-label={v.title} placeholder="Write here"
    onChange={e => editor.updateShape({ id: v.s.id, type: v.s.type, props: { text: e.target.value } } as any)} />;
}

/** A price as the same small suffix everywhere. */
const PriceSuffix = ({ q }: { q: any }) => { const cr = q ? shownCredits(q) : null; const key = !!q && q.needsKey === true && q.runnable === false;
  return <small className="cp-suffix"><GenPrice q={q} demo={q?.demo === true} credits={key ? null : cr} text={key ? 'Needs a key' : null} /></small>; };

/** Set it up (a draft) or run again (a finished card): the settings as an even grid, then the action(s). */
function RunBlock({ v }: { v: View }) {
  const editor = useEditor(); const toast = useToast(); const box = useRef<HTMLDivElement>(null); const spec = v.spec; const p = v.p as GenCardProps;
  const [busy, setBusy] = useState(false); const genRef = useRef<HTMLButtonElement>(null);
  const missing = v.draft ? missingOf(spec, v.st?.bySlot ?? {}, v.prompt) : null;
  const again = async () => { setBusy(true); try { await submit(editor, v.s.id); } catch (e: any) { toast(e?.message ?? 'That didn’t start.', 'error'); } finally { setBusy(false); } };
  const tweak = () => { const nid = variationOf(editor, v.s.id); if (nid) { editor.select(nid); reveal(editor, nid); } };
  const settings = (ro: boolean) => <div className={`cp-settings${ro ? ' cp-ro' : ''}`} {...(ro ? { inert: '' } : {})}>
    <WorkflowControls key={spec.flow.id} recipe={spec.recipe} vals={spec.vals} setVal={ro ? () => undefined : (k, val) => setCard(editor, v.s.id, { vals: { ...p.vals, ...spec.vals, [k]: val } })} provider={spec.provider} watch={ro ? undefined : box} mode={spec.mode}
      files={{ image: !ro && v.st?.bySlot.image?.[0]?.url ? { file: null as any, url: v.st.bySlot.image[0].poster || v.st.bySlot.image[0].url } : null }} /></div>;
  if (!v.draft) return <div className="cp-run" ref={box}>
    {settings(true)}
    <div className="cp-pair">
      <button type="button" className="cp-btn" onClick={tweak} {...tip('A copy beside it with the same settings, ready to change. Nothing runs until you press Generate')}><CopyIcon size={14} />Change settings</button>
      <button type="button" className="cp-btn cp-btn-main" disabled={busy} onClick={() => void again()} {...tip('Same settings again. The new version joins the strip')}><RetryIcon size={14} />{busy ? 'Starting…' : 'Run again'}<PriceSuffix q={v.q ?? p.quote} /></button>
    </div></div>;
  const note = v.st?.extra.length ? tooManyNote(spec, v.st.extra.length, v.model) : null;
  return <div className="cp-run" ref={box}>
    {spec.slots.length > 0 && <CardInputs cardId={v.s.id} slots={spec.slots} bySlot={v.st?.bySlot ?? {}} showAdd className="cp-ins" testPrefix="cp" />}
    {note && <Caption>{note}</Caption>}
    {spec.promptMode !== 'hidden' && !v.linkedPrompt && <textarea className="cp-text cp-text-s" rows={3} value={p.prompt} placeholder={spec.placeholder ?? 'Describe what you want'} aria-label="Prompt" onChange={e => setCard(editor, v.s.id, { prompt: e.target.value })} />}
    {settings(false)}
    <DockGenerate toolId={spec.tool.id} engine={spec.provider} quote={v.q} label={spec.generateLabel} busy={busy} problems={[]} missing={missing} pfOpen={false} genRef={genRef} onClick={() => runCard(v.s.id)} workflowId={spec.flow.id} className="cp-go" variant="node" testId="cp-generate" />
  </div>;
}

/** The quick actions with words and prices, as an even two-column grid. Each makes a new draft card wired to this one. */
function NextSteps({ v }: { v: View }) {
  const editor = useEditor(); const cat = useCatalog(); const kind = v.media!.kind;
  const have = new Set(availableFlows(cat).map(f => f.id));
  const acts: Act[] = (kind === 'audio' ? NEXT_STEPS.audio : kind === 'image' ? NEXT_STEPS.image : QUICK_ACTIONS.video).filter(a => have.has(a.flow));
  const [pr, setPr] = useState<Record<string, string | null>>({});
  useEffect(() => { let on = true; acts.forEach(a => void actionPrice(a.flow, kind as any, v.media!.url).then(t => { if (on) setPr(m => ({ ...m, [a.id]: t })); })); return () => { on = false; }; }, [kind, acts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="cp-grid2">{acts.map(a => <button key={a.id} type="button" className="cp-tilebtn" onClick={() => quickCard(editor, v.s.id, a)}>
    <a.icon size={15} /><span>{a.label}</span><small className="cp-suffix">{pr[a.id] ?? '…'}</small></button>)}</div>;
}

/** What feeds it and what it feeds; a click jumps to that card. */
function Connections({ v }: { v: View }) {
  const editor = useEditor();
  const row = (l: Link, dir: 'in' | 'out', k: number) => <Row key={`${dir}-${l.id ?? k}`} poster={l.poster} kind={l.kind} label={l.label} sub={dir === 'in' ? `Uses · ${l.slot ?? KIND_WORD[l.kind] ?? 'Input'}` : `Used by · ${KIND_WORD[l.kind] ?? 'Card'}`}
    onClick={l.id ? () => jump(editor, l.id) : undefined} />;
  return <div className="cp-rows">{v.ins.map((l, k) => row(l, 'in', k))}{v.outs.map((l, k) => row(l, 'out', k))}</div>;
}
/** One row: a thumbnail (or the kind's icon), a name and a small line. With a card behind it, a click jumps there; otherwise it just shows. */
function Row({ poster, kind, label, sub, onClick }: { poster: string; kind: string; label: string; sub: string; onClick?: () => void }) {
  const I = KIND_ICON[kind] ?? ImageIcon;
  const inner = <><span className="cp-row-t">{poster ? <img src={gridSrc(poster, 72)} alt="" /> : <I size={14} />}</span>
    <span className="cp-row-n"><b title={label}>{label}</b><small>{sub}</small></span>{onClick && <ChevronRightIcon size={14} />}</>;
  return onClick ? <button type="button" className="cp-row" onClick={onClick}>{inner}</button> : <div className="cp-row cp-row-still">{inner}</div>;
}

/** What a finished version was made from: the inputs it was sent with, kept on the version (a card that's still there is one click away). */
function MadeFrom({ list }: { list: MadeFromT[] }) {
  const editor = useEditor(); const live = useValue('made from live', () => list.map(i => !!i.shapeId && !!editor.getShape(i.shapeId as TLShapeId)), [editor, list]);
  return <div className="cp-rows" data-testid="cp-made-from">{list.map((i, k) => <Row key={`${i.url}-${k}`} poster={i.poster} kind={i.kind} label={i.label} sub={i.slot} onClick={live[k] ? () => jump(editor, i.shapeId as TLShapeId) : undefined} />)}</div>;
}

/** The footer, the same on every finished card: Download · Open in its page · full size (two equal buttons and one square). */
function Actions({ v }: { v: View }) {
  const m = v.media!; const page = m.kind === 'video' ? 'Video' : m.kind === 'audio' ? 'Audio' : m.kind === '3d' ? '3D' : 'Image';
  const href = v.gen ? toolHrefOf(v.p.flow, m.jobId || v.p.jobId) : v.job ? workflowRecreateHref(v.job as any) : null;
  return <div className="cp-foot-row">
    <a className="cp-btn" href={m.url} download {...tip('Save the file')}><DownloadIcon size={14} />Download</a>
    {v.s.type !== UPLOAD_TYPE && <button type="button" className="cp-btn" disabled={!href} onClick={() => href && navigate(href)} {...tip(href ? `Open in ${page} with these settings` : 'Made outside a workflow: nothing to open')}><PullOutIcon size={14} />Open in {page}</button>}
    <a className="cp-btn cp-sq" href={m.url} target="_blank" rel="noreferrer" aria-label="Full size" {...tip('Full size in a new tab')}><ExpandIcon size={14} /></a>
  </div>;
}

/* ------------------------------------------------------------------ several cards, none */
function Many({ ids, head }: { ids: TLShapeId[]; head: HeadFn }) {
  const editor = useEditor();
  const shapes = useValue('panel many', () => ids.map(id => editor.getShape(id)).filter(Boolean) as TLShape[], [editor, ids]);
  const done = shapes.map(s => ({ s, m: mediaOf(s) })).filter(x => x.m);
  const counts = Object.entries(shapes.reduce<Record<string, number>>((a, s) => { const m = mediaOf(s); const k = s.type === GEN_TYPE ? (m ? m.kind : 'draft') : s.type === PROMPT_TYPE || s.type === NOTE_TYPE ? 'text' : m?.kind ?? 'other'; a[k] = (a[k] ?? 0) + 1; return a; }, {}));
  const WORD: Record<string, [string, string]> = { image: ['picture', 'pictures'], video: ['clip', 'clips'], audio: ['sound', 'sounds'], '3d': ['3D model', '3D models'], draft: ['draft', 'drafts'], text: ['text card', 'text cards'], other: ['card', 'cards'] };
  const downloadAll = () => done.forEach(({ m }, i) => setTimeout(() => { const a = document.createElement('a'); a.href = m!.url; a.download = ''; a.click(); }, i * 250));
  return <>{head({ icon: <ImageIcon size={15} />, title: `${shapes.length} cards selected`, sub: counts.map(([k, n]) => `${n} ${WORD[k]?.[n === 1 ? 0 : 1] ?? k}`).join(', ') })}
    <div className="cp-body">
      <Caption>Click one to see just that card.</Caption>
      <div className="cp-many">{shapes.map(s => { const m = mediaOf(s); const I = s.type === PROMPT_TYPE || s.type === NOTE_TYPE ? TextIcon : (MEDIUM_ICON as any)[(s.props as any).medium ?? m?.kind ?? 'image'] ?? ImageIcon;
        return <button key={s.id} type="button" className="cp-many-t" onClick={() => editor.select(s.id)} {...tip(`Just ${shapeName(s)}`)}><span className="cp-many-i">{m?.poster ? <img src={gridSrc(m.poster, 140)} alt="" /> : <I size={18} />}</span><small>{shapeName(s)}</small></button>; })}</div>
      <RunDrafts shapes={shapes} />
      {done.length > 0 && <Section title="Finished" aside={`${done.length} of ${shapes.length}`}><div className="cp-pair">
        <button type="button" className="cp-btn" onClick={() => editor.selectNone()}><CloseIcon size={13} />Clear selection</button>
        <button type="button" className="cp-btn" onClick={downloadAll}><DownloadIcon size={14} />Download all</button></div></Section>}
    </div></>;
}

/** Run the drafts among these cards: each with its own settings, the total priced first. */
function RunDrafts({ shapes }: { shapes: TLShape[] }) {
  const editor = useEditor(); const toast = useToast();
  const drafts = shapes.filter(s => s.type === GEN_TYPE && (s.props as any).status === 'draft');
  const [total, setTotal] = useState<{ credits: number; demo: boolean } | null>(null); const key = drafts.map(d => d.id).join();
  useEffect(() => { setTotal(null); if (!drafts.length) return; let on = true;
    void Promise.all(drafts.map(d => import('./nodeRun').then(m => m.quoteNode(editor, d.id)))).then(qs => { if (!on) return; setTotal({ credits: qs.reduce((a, q) => a + (q ? shownCredits(q) ?? 0 : 0), 0), demo: qs.every(q => q?.demo === true) }); });
    return () => { on = false; }; }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!drafts.length) return null;
  return <Section title="Run the drafts" aside={`${drafts.length} of ${shapes.length}`}>
    <Caption>Each one runs with its own settings. You see the total first.</Caption>
    <button type="button" className="cp-btn cp-btn-main cp-wide" disabled={!total} onClick={() => { drafts.forEach(d => runCard(d.id)); toast(`Started ${drafts.length} run${drafts.length === 1 ? '' : 's'}`); }}>
      Generate {drafts.length}<small className="cp-suffix">{total ? <GenPrice credits={total.credits} demo={total.demo} /> : 'Pricing…'}</small></button></Section>;
}

function Empty({ head }: { head: HeadFn }) {
  const editor = useEditor(); const n = useValue('panel count', () => editor.getCurrentPageShapes().filter(s => isNodeType(s.type)).length, [editor]);
  return <>{head({ icon: <ImageIcon size={15} />, title: 'Card details', sub: `${n} card${n === 1 ? '' : 's'} on this board` })}
    <div className="cp-body cp-empty"><span className="cp-empty-i"><ImageIcon size={22} /></span><b>Select a card</b><p>See it big, how it was made, and what you can do next.</p></div></>;
}

export default CardPanel;
