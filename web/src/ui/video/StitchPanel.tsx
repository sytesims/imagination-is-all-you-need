/**
 * Stitch (2026-10-27): the Video page's timeline workflow. Clips you already made (Assets results or uploads, through the shared media picker)
 * in order on one strip: drag or Alt+←/→ to reorder, × or Delete to remove, a per-clip in/out trim with a preview, plus a music bed and a voice
 * (AudioCard rows), the shape (Auto / 16:9 / 9:16 / 1:1), the clips' own sound on/off and a fade at the end. Export is one POST /api/compose:
 * ffmpeg on this computer, $0, a normal done job that shows in the Video feed and in Assets. No AI runs here.
 * Same dock as every Video workflow (VideoWorkflowBar: the workflow chip, chips with BarPopovers, DockGenerate); the feed above is the Video
 * page's own. The draft (strip and settings) is kept in this browser, so leaving and coming back keeps the timeline.
 * Links: ?add=<job id> adds that result's video (Assets ⋯ Add to Stitch); ?recreate=<compose job id> loads a stitched video's own timeline.
 * Editor (2026-10-27): Sound (a slider per track, the bed dipping under the voice, −14 LUFS on export), Transitions (cut / crossfade / dip to
 * black, a fade at the end), Titles (a title and an end card, on black or over the picture, four looks), Shape (16:9 / 9:16 / 1:1 with fit,
 * fill at a crop point or a blurred fill) and voice captions (the shared Captions look). Defaults are set so a first export just works; the
 * finer controls sit under "More" in each popover. Preview (the ▶ by the length) plays the film in the browser; the export is exact.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JobState, ToolInfo } from '../../api';
import { getJob } from '../../api';
import type { VideoWorkflow } from '../../../../server/src/shared/videoWorkflows';
import { VideoWorkflowChip } from './VideoWorkflows';
import VideoFeed from './VideoFeed';
import { useHostedVideoFeed } from './videoFeedSlot';
import { useToast } from '../../shared/Toast';
import { DockGenerate } from '../../shared/DockGenerate';
import { BarPopover, PopSection, Segmented, PopNote, PopSwitch, AspectShape, aspectWH } from '../../shared/BarPop';
import { pickMedia } from '../../shared/MediaPicker';
import { libraryUrlOf } from '../../shared/libraryFiles';
import { uploadMedia } from '../../shared/batch1';
import { VideoThumb } from '../../shared/VideoThumb';
import TrimRange from '../../shared/TrimRange';
import AudioCard, { PlayGlyph, PauseGlyph } from '../../shared/AudioCard';
import { tip } from '../../shared/Tooltip';
import { useDockHeight } from '../../shared/dockFit';
import { CloseIcon, PlusIcon, AspectIcon, SoundIcon, SoundOffIcon, MusicIcon, MicIcon, StitchIcon, TransitionIcon, PlayIcon } from '../Icons';
import { MAX_CLIPS, MIN_TRIM, EMPTY_DRAFT, STITCH_ASPECTS, clampTrim, playLen, totalLen, secText, clock, moveClip, addClips, fitOf, filmSize, missingStep, composeBody, parseDraft, draftFromJob, clipKey,
  planOf, cardOn, pct, CARD_STYLES, CARD_SEC, TRANSITION_SEC, END_CARD_TEXT, CARD_TEXT_MAX,
  type StitchClip, type StitchDraft, type StitchSound, type StitchAspect, type StitchCard, type StitchTransition, type ReframeFit } from './stitchLogic';
import { CARD_LOOKS, duckDb } from '../../../../server/src/shared/stitchTimeline';
import StitchPreview from './StitchPreview';
import { cardPng } from './stitchCards';
import { drawCue, captionStyle, type Cue } from '../../shared/Captions';
import { canvasBlob } from '../../shared/shareBrand';
import '../next/workflowBar.css';
import '../next/createBar.css';
import './videoPanel.css';
import './videoDock.css';
import './videoWorkflowBar.css';
import './stitch.css';

const DRAFT_KEY = 'ohf:stitch:draft';
const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm';
const AUDIO_ACCEPT = 'audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a';
const QUOTE = { credits: 0, runnable: true, cost: { billedTo: 'local', billedToName: 'Your computer', estUsd: 0 } }; /* ffmpeg here: always free */
const loadDraft = (): StitchDraft => { try { const s = localStorage.getItem(DRAFT_KEY); return s ? parseDraft(JSON.parse(s)) : EMPTY_DRAFT; } catch { return EMPTY_DRAFT; } };
const saveDraft = (d: StitchDraft) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage off: the strip lives for this visit */ } };
const nameOf = (u: string) => decodeURIComponent(u.split('/').pop() ?? 'clip');
const ASPECT_LABEL: Record<StitchAspect, string> = { auto: 'Auto', '16:9': '16:9', '9:16': '9:16', '1:1': '1:1' };
const FIT_LABEL: Record<ReframeFit, string> = { fit: 'Fit', fill: 'Fill', blur: 'Blur fill' };
const TR_LABEL: Record<StitchTransition, string> = { cut: 'Cut', crossfade: 'Crossfade', dip: 'Dip to black' };
const TR_CHIP: Record<StitchTransition, string> = { cut: 'Cut', crossfade: 'Fade', dip: 'Dip' };
/** A labelled 0–200 % slider in a popover (the shared vbar-range look). */
function Level({ label, value, onChange, testId, disabled, max = 2, step = 0.05, text }: { label: string; value: number; onChange: (v: number) => void; testId: string; disabled?: boolean; max?: number; step?: number; text?: string }) {
  const t = text ?? pct(value);
  return <PopSection label={label} aside={<span className="bp-mono">{t}</span>} testId={`${testId}-row`} className={disabled ? 'st-off' : ''}>
    <input className="vbar-range" type="range" min={0} max={max} step={step} value={value} disabled={disabled} aria-label={label} aria-valuetext={t} data-testid={testId} onChange={e => onChange(Number(e.target.value))} /></PopSection>;
}
const noSelect = () => undefined;

/** Length and frame size of a clip from its file (no server work); null when it doesn't load (a missing file). */
function probeClip(url: string): Promise<{ dur: number; w: number; h: number } | null> {
  return new Promise(res => { const v = document.createElement('video'); let done = false; const end = (r: { dur: number; w: number; h: number } | null) => { if (done) return; done = true; v.removeAttribute('src'); v.load(); res(r); };
    v.preload = 'metadata'; v.muted = true; v.onloadedmetadata = () => end({ dur: Number.isFinite(v.duration) ? v.duration : 0, w: v.videoWidth, h: v.videoHeight }); v.onerror = () => end(null);
    setTimeout(() => end(null), 12_000); v.src = url; });
}
function probeSound(url: string): Promise<number> {
  return new Promise(res => { const a = document.createElement('audio'); let done = false; const end = (n: number) => { if (!done) { done = true; res(n); } };
    a.preload = 'metadata'; a.onloadedmetadata = () => end(Number.isFinite(a.duration) ? a.duration : 0); a.onerror = () => end(0); setTimeout(() => end(0), 8_000); a.src = url; });
}
/** A picked file → its /files/ URL: a library pick already has one; a file from the computer is uploaded once (POST /api/media). */
async function urlOfFile(f: File): Promise<string> { const u = libraryUrlOf(f); if (u) return u; const [it] = await uploadMedia([f]); return it.url; }
/** A job's first video (or sound) output. */
const outOf = (j: JobState, kind: 'video' | 'audio') => (j.outputs ?? []).map(o => o.url).find(u => !!u && (kind === 'video' ? /\.(mp4|mov|webm|m4v)(\?|$)/i : /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i).test(u)) ?? null;

export default function StitchPanel({ wf, tools }: { wf: VideoWorkflow; tools: ToolInfo[] }) {
  const toast = useToast();
  const [d, setD] = useState<StitchDraft>(loadDraft);
  const upd = useCallback((f: (x: StitchDraft) => StitchDraft) => setD(x => { const n = f(x); saveDraft(n); return n; }), []);
  const [jobs, setJobs] = useState<JobState[]>([]); const [busy, setBusy] = useState(false); const [adding, setAdding] = useState(0);
  const [pop, setPop] = useState(''); const [trimKey, setTrimKey] = useState<string | null>(null); const [live, setLive] = useState('');
  const dock = useRef<HTMLDivElement>(null); const genRef = useRef<HTMLButtonElement>(null); const aspectRef = useRef<HTMLButtonElement>(null); const musicRef = useRef<HTMLButtonElement>(null); const voiceRef = useRef<HTMLButtonElement>(null);
  const mixRef = useRef<HTMLButtonElement>(null); const trRef = useRef<HTMLButtonElement>(null); const titleRef = useRef<HTMLButtonElement>(null); const prevRef = useRef<HTMLButtonElement>(null);
  const [cardTab, setCardTab] = useState<'title' | 'end'>('title'); const [stage, setStage] = useState('');
  const cardEls = useRef(new Map<string, HTMLLIElement>()); const trimAnchor = useRef<HTMLElement | null>(null);
  useDockHeight(dock, '.vs');

  /* metadata for clips without it (a restored draft, a recreate, a fresh pick): length, size, and whether the file is still there */
  const probing = useRef(new Set<string>());
  useEffect(() => { for (const c of d.clips) { if ((c.dur > 0 && c.w > 0) || c.missing || probing.current.has(c.key)) continue; probing.current.add(c.key);
    void probeClip(c.url).then(m => { probing.current.delete(c.key); upd(x => ({ ...x, clips: x.clips.map(y => y.key !== c.key ? y : m ? { ...y, dur: m.dur, w: m.w, h: m.h, trim: clampTrim(y.trim, m.dur) } : { ...y, missing: true }) })); }); } }, [d.clips, upd]);

  const addUrls = useCallback(async (items: { url: string; name: string; jobId?: string | null }[]) => {
    if (!items.length) return; setAdding(n => n + items.length);
    try { const metas = await Promise.all(items.map(i => probeClip(i.url)));
      const clips: StitchClip[] = items.map((i, k) => ({ key: clipKey(), url: i.url, jobId: i.jobId ?? null, name: i.name, dur: metas[k]?.dur ?? 0, w: metas[k]?.w ?? 0, h: metas[k]?.h ?? 0, trim: null, missing: !metas[k] }));
      let dropped = 0; upd(x => { const r = addClips(x.clips, clips); dropped = r.dropped; return { ...x, clips: r.list }; });
      if (dropped) toast(`Stitch takes up to ${MAX_CLIPS} clips, so ${dropped} ${dropped === 1 ? 'was' : 'were'} left out.`, 'warn');
      setLive(`${clips.length} clip${clips.length === 1 ? '' : 's'} added.`);
    } finally { setAdding(n => Math.max(0, n - items.length)); }
  }, [upd, toast]);
  const addFiles = useCallback(async (fs: File[]) => {
    const vids = fs.filter(f => /^video\//.test(f.type) || /\.(mp4|mov|webm|m4v)$/i.test(f.name)); if (!vids.length) return;
    try { const urls = await Promise.all(vids.map(urlOfFile)); await addUrls(urls.map((url, k) => ({ url, name: vids[k].name || nameOf(url) }))); }
    catch (e) { toast((e as Error).message || 'Couldn’t add that clip.', 'error'); }
  }, [addUrls, toast]);
  const full = d.clips.length >= MAX_CLIPS;
  const pickClips = () => { if (full) { toast(`Stitch takes up to ${MAX_CLIPS} clips. Remove one to add another.`, 'warn'); return; }
    pickMedia({ accept: VIDEO_ACCEPT, multiple: true, max: MAX_CLIPS - d.clips.length, title: 'Choose clips', limits: `Up to ${MAX_CLIPS} clips · MP4, MOV or WEBM · ${MAX_CLIPS - d.clips.length} more fit`, onFiles: fs => void addFiles(fs) }); };
  const setSound = useCallback(async (which: 'music' | 'voice', f: File) => {
    try { const url = await urlOfFile(f); const dur = await probeSound(url); const s: StitchSound = { url, name: f.name || nameOf(url), dur: dur || undefined }; upd(x => ({ ...x, [which]: s })); }
    catch (e) { toast((e as Error).message || 'Couldn’t add that sound.', 'error'); }
  }, [upd, toast]);
  const pickSound = (which: 'music' | 'voice') => { setPop(''); pickMedia({ accept: AUDIO_ACCEPT, title: which === 'music' ? 'Choose music' : 'Choose a voice track', limits: which === 'music' ? 'Plays under the whole video, faded out at the end' : 'Narration or dialogue from the start, over the music', onFiles: fs => { if (fs[0]) void setSound(which, fs[0]); } }); };

  /* ?add=<job id> (Assets ⋯ Add to Stitch) and ?recreate=<compose job> (Recreate on a stitched video): read once, then dropped from the URL */
  useEffect(() => { const q = new URLSearchParams(location.search); const add = q.get('add'); const rec = q.get('recreate'); if (!add && !rec) return;
    const u = new URL(location.href); u.searchParams.delete('add'); u.searchParams.delete('recreate'); history.replaceState(history.state, '', `${u.pathname}${u.search}${u.hash}`);
    if (add) void getJob(add).then(j => { const v = outOf(j, 'video'); if (!v) { toast('That result has no video to add.', 'warn'); return; } void addUrls([{ url: v, name: (j.input as any)?.prompt?.slice(0, 60) || nameOf(v), jobId: j.id }]); })
      .catch(() => toast('Couldn’t find that video. It may have been deleted.', 'error'));
    if (rec) void getJob(rec).then(j => { const nd = draftFromJob(j.input as any); if (!nd) { toast('That video has no timeline to load.', 'warn'); return; } upd(() => nd); toast(`Loaded ${nd.clips.length} clip${nd.clips.length === 1 ? '' : 's'} from that video.`); })
      .catch(() => toast('Couldn’t find that video. It may have been deleted.', 'error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- strip: reorder (drag, Alt+←/→), remove (×, Delete), trim (click, Enter) ---- */
  const move = (from: number, to: number) => { if (to < 0 || to >= d.clips.length || from === to) return; upd(x => ({ ...x, clips: moveClip(x.clips, from, to) }));
    setLive(`Clip moved to position ${to + 1} of ${d.clips.length}.`); };
  const remove = (key: string) => { const i = d.clips.findIndex(c => c.key === key); if (i < 0) return; if (trimKey === key) setTrimKey(null);
    upd(x => ({ ...x, clips: x.clips.filter(c => c.key !== key) })); setLive(`Clip ${i + 1} removed.`);
    requestAnimationFrame(() => { const next = d.clips[i + 1] ?? d.clips[i - 1]; (next ? cardEls.current.get(next.key) : null)?.focus(); }); };
  const [drag, setDrag] = useState<{ key: string; to: number } | null>(null);
  const onCardKey = (e: React.KeyboardEvent, i: number, c: StitchClip) => {
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); move(i, i + (e.key === 'ArrowLeft' ? -1 : 1)); requestAnimationFrame(() => cardEls.current.get(c.key)?.focus()); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const n = d.clips[i + (e.key === 'ArrowLeft' ? -1 : 1)]; if (n) cardEls.current.get(n.key)?.focus(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(c.key); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTrim(c.key); }
  };
  const openTrim = (key: string) => { if (d.clips.find(c => c.key === key)?.missing) return; trimAnchor.current = cardEls.current.get(key) ?? null; setTrimKey(key); setPop('trim'); };
  /* pointer drag (mouse, pen or touch): past 6 px the card follows into a slot between the others; a click without a drag opens the trim */
  const press = useRef<{ key: string; x: number; y: number; id: number; moved: boolean } | null>(null); const justDragged = useRef(false);
  const slotAt = (x: number) => { let to = d.clips.length; for (const [k, c] of d.clips.entries()) { const r = cardEls.current.get(c.key)?.getBoundingClientRect(); if (r && x < r.left + r.width / 2) { to = k; break; } } return to; };
  const onDown = (e: React.PointerEvent, c: StitchClip, i: number) => { if (e.button !== 0 || (e.target as HTMLElement).closest('.st-x')) return; press.current = { key: c.key, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false }; void i; };
  const onMoveP = (e: React.PointerEvent) => { const p = press.current; if (!p || p.id !== e.pointerId) return;
    if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
    if (!p.moved) { p.moved = true; try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* */ } }
    const to = slotAt(e.clientX); setDrag(dg => (dg?.key === p.key && dg.to === to ? dg : { key: p.key, to })); };
  const onUp = (e: React.PointerEvent) => { const p = press.current; press.current = null; if (!p || p.id !== e.pointerId || !p.moved) return;
    justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 0);
    const from = d.clips.findIndex(x => x.key === p.key); const to = slotAt(e.clientX); setDrag(null); move(from, to > from ? to - 1 : to); };

  const first = d.clips.find(c => c.w > 0 && !c.missing); const size = filmSize(first, d.aspect); const plan = useMemo(() => planOf(d), [d]); const len = plan.total;
  const missing = missingStep(d); const mixed = d.clips.some(c => fitOf(c, size, d.fit) !== 'same');
  const trimClip = d.clips.find(c => c.key === trimKey) ?? null;

  const exportNow = async () => {
    if (busy) return; if (missing) { if (missing === 'Add clips') pickClips(); else toast('One clip’s file is missing. Remove it (×) to export.', 'warn'); return; }
    setBusy(true);
    try { const body: Record<string, unknown> = composeBody(d); const parts: [string, Blob][] = [];
      /* cards and captions are drawn here at the film's exact size (this ffmpeg has no text) and sent as PNG parts */
      if (size) {
        setStage('Drawing the cards');
        for (const [k, c] of [['titleCard', d.title], ['endCard', d.end]] as const) if (cardOn(c)) parts.push([k, await cardPng(c.text, c.style, size.w, size.h)]);
        if (d.captions.on && d.voice) { setStage('Writing the captions'); const cues = await voiceCues(d.voice); if (cues === 'setup') toast('Captions need a one-time setup, so this export has none. Open Captions on any result to set it up.', 'warn');
          else if (cues.length) { const st = await captionStyle(); const meta: { start: number; end: number; y: number }[] = [];
            for (const c of cues.filter(x => x.start < len).slice(0, 400)) { const { canvas, y } = drawCue(c.lines.join(' '), size.w, size.h, st, d.captions.look); parts.push([`cue${meta.length}`, await canvasBlob(canvas)]); meta.push({ start: c.start, end: Math.min(c.end, len), y }); }
            body.captions = meta; } }
      }
      setStage('Exporting');
      let init: RequestInit = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
      if (parts.length) { const f = new FormData(); f.set('body', JSON.stringify(body)); for (const [k, b] of parts) f.append(k, b, `${k}.png`); init = { method: 'POST', body: f }; }
      const r = await fetch('/api/compose', init); const b = await r.json().catch(() => ({}));
      if (!r.ok) { const f = b?.issues?.[0]?.field as string | undefined; const m = /^clips\[(\d+)\]$/.exec(f ?? ''); if (m && b.code === 'not_found') { const k = d.clips[Number(m[1])]?.key; if (k) upd(x => ({ ...x, clips: x.clips.map(c => c.key === k ? { ...c, missing: true } : c) })); }
        throw new Error(b?.error || 'Couldn’t export the video.'); }
      const j = await getJob(b.id).catch(() => null); if (j) setJobs(js => [j, ...js.filter(x => x.id !== j.id)]);
      for (const w of (b.warnings ?? []) as string[]) if (!(/None of the clips has sound/.test(w) && (d.music || d.voice)) && !/shorter than the video/.test(w)) toast(w, 'warn'); /* silent clips under music: nothing to say */
      toast(`Your video is ready: ${secText(Number(b.durationSec) || len)}, free.`, 'success', { sub: 'Saved to Assets.', action: { label: 'Open', to: `/jobs/${b.id}` } });
      setLive('Export finished. The video is at the top of the feed.');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); setStage(''); }
  };

  const hosted = useHostedVideoFeed({ jobs, onSelect: noSelect });
  const soundChip = (which: 'music' | 'voice') => { const s = d[which]; const ref = which === 'music' ? musicRef : voiceRef; const Icon = which === 'music' ? MusicIcon : MicIcon; const word = which === 'music' ? 'Music' : 'Voice';
    return <button ref={ref} type="button" className={`ic-chip wf-grp wf-fold st-snd${pop === which ? ' on' : ''}${s ? ' st-set' : ''}`} aria-haspopup="dialog" aria-expanded={pop === which} data-testid={`st-${which}`}
      aria-label={s ? `${word}: ${s.name}` : `Add ${word.toLowerCase()}`} {...tip(s ? `${word}: ${s.name}` : which === 'music' ? 'Add music under the whole video' : 'Add a voice track from the start')}
      onClick={() => (s ? setPop(pop === which ? '' : which) : pickSound(which))}><Icon size={14} /><b>{s ? s.name.replace(/\.\w+$/, '') : word}</b>{!s && <PlusIcon size={12} className="st-plus" />}</button>; };
  const soundPop = (which: 'music' | 'voice') => { const s = d[which]; if (!s) return null;
    return <BarPopover open={pop === which} anchor={which === 'music' ? musicRef : voiceRef} avoid={dock} watch={dock} placement="top" gap={8} onClose={() => setPop('')} label={which === 'music' ? 'Music' : 'Voice'} testId={`st-pop-${which}`} width={340}>
      <PopSection label={which === 'music' ? 'Music' : 'Voice'} aside={s.dur ? secText(s.dur) : undefined}>
        <AudioCard src={s.url} title={s.name} model={s.jobId ? 'Your result' : 'Your file'} duration={s.dur ?? null} cover={false} kind={which === 'music' ? 'music' : 'voice'} testId={`st-audio-${which}`} />
        {which === 'music' && !!len && !!s.dur && s.dur < len - 0.3 && <PopSwitch label="Loop to fill the video" hint={d.musicLoop ? `Plays again from the start until ${secText(len)}` : `Ends at ${secText(s.dur)}, then the rest is quiet`} on={d.musicLoop} testId="st-music-loop" onChange={v => upd(x => ({ ...x, musicLoop: v }))} />}
        {which === 'voice' && <><PopSwitch label="Captions" hint="The voice's words on screen, made on your computer" on={d.captions.on} testId="st-captions" onChange={v => upd(x => ({ ...x, captions: { ...x.captions, on: v } }))} />
          {d.captions.on && <Segmented label="Caption look" value={d.captions.look} testId="st-captions-look" onChange={v => upd(x => ({ ...x, captions: { ...x.captions, look: v } }))}
            options={[{ value: 'film', label: 'Film', hint: 'White, soft shadow', testId: 'st-captions-film' }, { value: 'box', label: 'Box', hint: 'In a dark box', testId: 'st-captions-box' }]} />}</>}
        <PopNote tone={which === 'voice' && !!s.dur && !!len && s.dur > len + 0.3 ? 'warn' : undefined}>{which === 'music' ? `Trimmed to the video${d.fade ? ' and faded out at the end' : ''}.` + (d.voice && d.mix.duck ? ' It dips under the voice.' : '')
          : s.dur && len && s.dur > len + 0.3 ? `The voice is ${secText(s.dur)} and the video ${secText(len)}, so its end is cut. Add a clip or a longer end card.` : 'Starts with the film and sits on top of the music.'}</PopNote>
        <div className="st-pop-acts"><button type="button" className="vbar-link" onClick={() => pickSound(which)} data-testid={`st-${which}-replace`}>Replace</button>
          <button type="button" className="vbar-link" onClick={() => { upd(x => ({ ...x, [which]: null })); setPop(''); }} data-testid={`st-${which}-remove`}>Remove</button></div>
      </PopSection></BarPopover>; };

  const cardTile = (k: 'title' | 'end') => { const c = d[k];
    return <li className="st-card-li" key={`card-${k}`}><button type="button" className="st-card" data-testid={`st-card-${k}`} data-tr={k === 'end' && d.clips.length ? d.transition : undefined} onClick={() => { setCardTab(k); setPop('titles'); }}
      aria-label={`${k === 'title' ? 'Title' : 'End card'}: ${c.text}, ${secText(c.sec)}. Edit`} {...tip(k === 'title' ? 'Title card' : 'End card')}>
      <span className="st-card-t" style={{ fontWeight: CARD_LOOKS[c.style].weight, textTransform: CARD_LOOKS[c.style].upper ? 'uppercase' : 'none' }}>{c.text}</span><span className="st-len">{secText(c.sec)}</span></button></li>; };
  const wh = aspectWH(d.aspect === 'auto' ? '' : d.aspect);
  return <div className={hosted ? 'vs-bar vbar st' : 'vs vs-dk vbar st'} data-testid={hosted ? 'vs-bar' : 'video-studio'} data-workflow={wf.id}>
    {!hosted && <section className="vs-main" aria-label={wf.name}><VideoFeed jobs={jobs} onSelect={noSelect} tools={tools} workflowId={wf.id} /></section>}
    <div className="ic ic2 vs-icd"><div className="ic-dock vs-dock st-dock" data-testid="vs-dock" ref={dock}
      onDragOver={e => { if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); }}
      onDrop={e => { const fs = [...e.dataTransfer.files]; if (!fs.length) return; e.preventDefault(); void addFiles(fs); const snd = fs.find(f => /^audio\//.test(f.type)); if (snd) void setSound(d.music ? 'voice' : 'music', snd); }}>
      <div className="ic-frame"><div className="ic-panel">
        <div className="ic-main">
          <p className="sr-only" aria-live="polite" data-testid="st-live">{live}</p>
          <p className="sr-only" id="st-keys">Arrow keys move between clips. Alt with an arrow moves the clip. Enter trims it. Delete removes it.</p>
          {d.clips.length === 0
            ? <button type="button" className="st-empty" onClick={pickClips} data-testid="st-empty">
                <span className="st-empty-art" aria-hidden><StitchIcon size={22} /></span>
                <span className="st-empty-t"><b>{adding ? 'Adding your clips…' : 'Add the clips you want to join'}</b>
                  <small>Pick 1 to {MAX_CLIPS} from your videos or uploads, then drag them into order. Trim any clip, add music or a voice, and Export one video. Free on your computer.</small></span>
                <span className="st-empty-cta" aria-hidden><PlusIcon size={14} />Add clips</span>
              </button>
            : <div className="st-strip-w"><ol className="st-strip" data-testid="st-strip" aria-label={`Timeline: ${d.clips.length} clip${d.clips.length === 1 ? '' : 's'}, ${secText(len)}`} aria-describedby="st-keys"
>
                {cardOn(d.title) && d.title.mode === 'black' && cardTile('title')}
                {d.clips.map((c, i) => { const t = clampTrim(c.trim, c.dur); const dragging = drag?.key === c.key; const fit = fitOf(c, size, d.fit);
                  return <li key={c.key} ref={el => { if (el) cardEls.current.set(c.key, el); else cardEls.current.delete(c.key); }} className={`st-clip${dragging ? ' st-dragging' : ''}${c.missing ? ' st-missing' : ''}${t ? ' st-trimmed' : ''}${trimKey === c.key && pop === 'trim' ? ' on' : ''}${drag && drag.to === i && !dragging ? ' st-drop-before' : ''}${drag && drag.to === i + 1 && i === d.clips.length - 1 && !dragging ? ' st-drop-after' : ''}`}
                    tabIndex={0} data-testid={`st-clip-${i}`} data-key={c.key} data-tr={i > 0 || (cardOn(d.title) && d.title.mode === 'black') ? d.transition : undefined}
                    aria-label={`Clip ${i + 1} of ${d.clips.length}: ${c.name}${c.missing ? ', file missing' : `, ${secText(playLen(c))}${t ? ` (trimmed from ${secText(c.dur)})` : ''}`}`}
                    onKeyDown={e => onCardKey(e, i, c)} onClick={() => { if (!justDragged.current) openTrim(c.key); }}
                    onPointerDown={e => onDown(e, c, i)} onPointerMove={onMoveP} onPointerUp={onUp} onPointerCancel={() => { press.current = null; setDrag(null); }}>
                    <span key={c.missing ? 'gone' : 'ok'} className="st-thumb">{c.missing ? <span className="st-gone" aria-hidden>File missing</span> : <VideoThumb src={t ? `${c.url}#t=${t.start}` : c.url} className="st-vid" />}</span>
                    <span className="st-n" aria-hidden>{i + 1}</span>
                    {!c.missing && <span className="st-len" aria-hidden>{t && <i className="st-cut" />}{secText(playLen(c))}</span>}
                    {!c.missing && fit !== 'same' && <span className="st-fit" aria-hidden>{fit === 'bars' ? 'bars' : fit === 'crop' ? 'crop' : 'blur'}</span>}
                    {((i === 0 && cardOn(d.title) && d.title.mode === 'over') || (i === d.clips.length - 1 && cardOn(d.end) && d.end.mode === 'over')) && <span className="st-over" aria-hidden>Aa</span>}
                    <button type="button" className="st-x" aria-label={`Remove clip ${i + 1}`} data-testid={`st-remove-${i}`} tabIndex={-1} onClick={e => { e.stopPropagation(); remove(c.key); }}><CloseIcon size={12} /></button>
                  </li>; })}
                {cardOn(d.end) && d.end.mode === 'black' && cardTile('end')}
                {!full && <li className="st-add-li"><button type="button" className="st-add" onClick={pickClips} data-testid="st-add" aria-label={`Add clips (${MAX_CLIPS - d.clips.length} more fit)`} {...tip(`Add clips · ${MAX_CLIPS - d.clips.length} more fit`)}>
                  {adding ? <i className="as-spin" aria-hidden /> : <PlusIcon size={16} />}</button></li>}
              </ol>
              <span className="st-total" data-testid="st-total" aria-label={`Total ${secText(len)}${size ? `, ${size.w} by ${size.h}` : ''}`}>
                <b>{clock(len)}</b><small>{d.clips.length}/{MAX_CLIPS} clips</small>{size && <small>{size.w}×{size.h}</small>}</span>
              <button ref={prevRef} type="button" className={`st-pv${pop === 'preview' ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={pop === 'preview'} aria-label="Preview the video" data-testid="st-preview-open" disabled={!size || !len}
                {...tip('Preview: plays here, nothing is exported')} onClick={() => setPop(pop === 'preview' ? '' : 'preview')}><PlayIcon size={16} /></button></div>}
          <div className="ic-chiprow"><div className="ic-chips">
            <span className="ic-fixed"><VideoWorkflowChip tools={tools} dock watch={dock} /></span>
            <span className="wf-strip wf-ctl" data-testid="st-controls">
              {soundChip('music')}{soundChip('voice')}
              <button ref={aspectRef} type="button" className={`ic-chip wf-grp wf-fold${pop === 'aspect' ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={pop === 'aspect'} aria-label={`Shape: ${ASPECT_LABEL[d.aspect]}, ${FIT_LABEL[d.fit]}`} data-testid="st-aspect" {...tip('Shape of the video and how clips fill it')}
                onClick={() => setPop(pop === 'aspect' ? '' : 'aspect')}>{wh ? <AspectShape w={wh[0]} h={wh[1]} /> : <AspectIcon size={14} />}<b>{ASPECT_LABEL[d.aspect]}{mixed && d.fit !== 'fill' ? ` · ${FIT_LABEL[d.fit]}` : ''}</b></button>
              <button ref={mixRef} type="button" className={`ic-chip wf-grp wf-fold${pop === 'mix' ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={pop === 'mix'} aria-label="Sound mix" data-testid="st-mix" {...tip('Sound: levels, the dip under the voice')}
                onClick={() => setPop(pop === 'mix' ? '' : 'mix')}>{d.keepAudio || d.music || d.voice ? <SoundIcon size={14} /> : <SoundOffIcon size={14} />}<b>Sound</b></button>
              <button ref={trRef} type="button" className={`ic-chip wf-grp wf-fold${pop === 'tr' ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={pop === 'tr'} aria-label={`Transitions: ${TR_LABEL[d.transition]}`} data-testid="st-transitions" {...tip('How clips change, and the fade at the end')}
                onClick={() => setPop(pop === 'tr' ? '' : 'tr')}><TransitionIcon size={14} /><b>{TR_CHIP[d.transition]}</b></button>
              <button ref={titleRef} type="button" className={`ic-chip wf-grp wf-fold${pop === 'titles' ? ' on' : ''}${cardOn(d.title) || cardOn(d.end) ? ' st-set' : ''}`} aria-haspopup="dialog" aria-expanded={pop === 'titles'} aria-label="Title and end card" data-testid="st-titles" {...tip('A title at the start and an end card')}
                onClick={() => setPop(pop === 'titles' ? '' : 'titles')}><i className="st-aa" aria-hidden>Aa</i><b>Titles</b></button>
            </span>
            {d.clips.length > 0 && <button type="button" className="ic-chip ic-sq st-clear" aria-label="Clear the timeline" data-testid="st-clear" {...tip('Clear the timeline')} onClick={() => { const prev = d; upd(x => ({ ...x, clips: [] })); setPop('');
              toast('Timeline cleared.', 'info', { action: { label: 'Undo', onClick: () => upd(() => prev) } }); }}><CloseIcon size={14} /></button>}
          </div></div>
        </div>
        <DockGenerate toolId="compose" engine="local-ffmpeg" quote={QUOTE} label={busy ? (stage === 'Exporting' || !stage ? 'Exporting' : stage) : 'Export'} busy={busy} problems={[]} missing={missing} pfOpen={false} genRef={genRef} onClick={() => void exportNow()} testId="st-export" priceTestId="st-price" workflowId={wf.id} />
      </div></div>
      {soundPop('music')}{soundPop('voice')}
      <BarPopover open={pop === 'aspect'} anchor={aspectRef} avoid={dock} watch={dock} placement="top" gap={8} onClose={() => setPop('')} label="Shape" testId="st-pop-aspect" width={300}>
        <PopSection label="Shape" aside={size ? `${size.w}×${size.h}` : undefined}>
          <Segmented label="Shape" value={d.aspect} options={STITCH_ASPECTS.map(a => { const s = aspectWH(a); return { value: a, label: ASPECT_LABEL[a], icon: s ? <AspectShape w={s[0]} h={s[1]} /> : undefined, testId: `st-aspect-${a.replace(':', 'x')}` }; })}
            onChange={a => upd(x => ({ ...x, aspect: a }))} onCommit={() => setPop('')} />
        </PopSection>
        <PopSection label="Fill the frame">
          <Segmented label="How clips fill the frame" value={d.fit} testId="st-fit" onChange={v => upd(x => ({ ...x, fit: v }))}
            options={[{ value: 'fill', label: 'Fill', hint: 'Crop to fill', testId: 'st-fit-fill' }, { value: 'fit', label: 'Fit', hint: 'Whole, with bars', testId: 'st-fit-fit' }, { value: 'blur', label: 'Blur fill', hint: 'Whole, soft edges', testId: 'st-fit-blur' }]} />
          {d.fit === 'fill' && first && size && Math.abs(first.w / first.h - size.w / size.h) > 0.02 && <CropPicker clip={first} frame={size} crop={d.crop} onChange={c => upd(x => ({ ...x, crop: c }))} />}
          <PopNote>{d.aspect === 'auto' ? 'The first clip’s shape. ' : ''}{mixed ? (d.fit === 'fill' ? 'Clips of another shape are cropped to fill the frame.' : d.fit === 'fit' ? 'Clips of another shape keep their whole picture, with bars.' : 'Clips of another shape keep their whole picture on a soft, blurred copy.') : 'Every clip already has this shape.'}</PopNote>
        </PopSection></BarPopover>
      <BarPopover open={pop === 'mix'} anchor={mixRef} avoid={dock} watch={dock} placement="top" gap={8} onClose={() => setPop('')} label="Sound" testId="st-pop-mix" width={320}>
        <PopSwitch label="Clip sound" hint={d.keepAudio ? 'Each clip keeps its own sound' : 'Only the music and voice'} on={d.keepAudio} testId="st-keep-audio" onChange={v => upd(x => ({ ...x, keepAudio: v }))} />
        {d.keepAudio && <Level label="Clip sound" value={d.mix.clip} testId="st-vol-clip" onChange={v => upd(x => ({ ...x, mix: { ...x.mix, clip: v } }))} />}
        {d.music && <Level label="Music" value={d.mix.music} testId="st-vol-music" onChange={v => upd(x => ({ ...x, mix: { ...x.mix, music: v } }))} />}
        {d.voice && <Level label="Voice" value={d.mix.voice} testId="st-vol-voice" onChange={v => upd(x => ({ ...x, mix: { ...x.mix, voice: v } }))} />}
        {d.voice && (d.music || d.keepAudio) && <PopSwitch label="Dip under the voice" hint={d.mix.duck ? `Music and clip sound drop about ${duckDb(d.mix.duckAmount)} dB while the voice talks` : 'The bed stays at its level'} on={d.mix.duck} testId="st-duck" onChange={v => upd(x => ({ ...x, mix: { ...x.mix, duck: v } }))} />}
        {d.voice && (d.music || d.keepAudio) && d.mix.duck && <details className="st-more"><summary data-testid="st-mix-more">More</summary>
          <Level label="How far it dips" value={d.mix.duckAmount} max={1} step={0.05} text={`${duckDb(d.mix.duckAmount)} dB`} testId="st-duck-amount" onChange={v => upd(x => ({ ...x, mix: { ...x.mix, duckAmount: v } }))} /></details>}
        <PopNote>Every track is evened out, then the whole film is set to streaming loudness (−14 LUFS). 100% is the balanced level.</PopNote>
      </BarPopover>
      <BarPopover open={pop === 'tr'} anchor={trRef} avoid={dock} watch={dock} placement="top" gap={8} onClose={() => setPop('')} label="Transitions" testId="st-pop-tr" width={320}>
        <PopSection label="Between clips">
          <Segmented label="Transition" value={d.transition} testId="st-tr" onChange={v => upd(x => ({ ...x, transition: v }))}
            options={(['cut', 'crossfade', 'dip'] as const).map(v => ({ value: v, label: TR_LABEL[v], testId: `st-tr-${v}` }))} /></PopSection>
        {d.transition !== 'cut' && <Level label="Length" value={d.transitionSec} max={TRANSITION_SEC.max} step={0.1} text={secText(plan.overlap || d.transitionSec)} testId="st-tr-len" onChange={v => upd(x => ({ ...x, transitionSec: Math.max(TRANSITION_SEC.min, v) }))} />}
        <PopSwitch label="Fade to black at the end" hint={d.fade ? 'Picture and sound fade out over the last second' : 'Ends on the last frame'} on={d.fade} testId="st-fade" onChange={v => upd(x => ({ ...x, fade: v }))} />
        <PopNote testId="st-tr-note">{d.transition === 'cut' || plan.segments.length < 2 ? 'Clips change on the frame.' : plan.overlap > 0 ? `Each change overlaps ${secText(plan.overlap)}, so the film is ${secText(Math.max(0, (plan.segments.length - 1) * plan.overlap))} shorter.` : 'A clip is too short for a transition, so the clips cut.'}{plan.overlap > 0 && plan.overlap < d.transitionSec - 0.05 ? ' Shortened to fit the shortest clip.' : ''}</PopNote>
      </BarPopover>
      <BarPopover open={pop === 'titles'} anchor={titleRef} avoid={dock} watch={dock} placement="top" gap={8} onClose={() => setPop('')} label="Titles" testId="st-pop-titles" width={340}>
        <Segmented label="Card" value={cardTab} testId="st-card-tab" onChange={setCardTab} options={[{ value: 'title', label: 'Title', testId: 'st-card-tab-title' }, { value: 'end', label: 'End card', testId: 'st-card-tab-end' }]} />
        <CardEditor key={cardTab} which={cardTab} card={d[cardTab]} onChange={c => upd(x => ({ ...x, [cardTab]: c }))} />
      </BarPopover>
      {size && <BarPopover open={pop === 'preview'} anchor={prevRef} avoid={dock} watch={dock} placement="top" gap={8} onClose={() => setPop('')} label="Preview" testId="st-pop-preview" width={420}>
        <StitchPreview d={d} plan={plan} frame={size} open={pop === 'preview'} />
        <PopNote>A quick look in the browser. The export evens out the sound and is exact to the frame.</PopNote>
      </BarPopover>}
      {trimClip && <TrimPop clip={trimClip} open={pop === 'trim'} anchor={trimAnchor} dock={dock} index={d.clips.indexOf(trimClip)} onClose={() => { setPop(''); const k = trimKey; requestAnimationFrame(() => k && cardEls.current.get(k)?.focus()); }}
        onTrim={t => upd(x => ({ ...x, clips: x.clips.map(c => c.key === trimClip.key ? { ...c, trim: clampTrim(t, c.dur) } : c) }))} />}
    </div></div>
  </div>;
}

/** One clip's in / out: a looping preview of the kept part and the shared TrimRange in tenths of a second. */
function TrimPop({ clip, open, anchor, dock, index, onClose, onTrim }: { clip: StitchClip; open: boolean; anchor: React.RefObject<HTMLElement | null>; dock: React.RefObject<HTMLElement | null>; index: number; onClose: () => void; onTrim: (t: { start: number; end: number } | null) => void }) {
  const t = clampTrim(clip.trim, clip.dur) ?? { start: 0, end: clip.dur }; const v = useRef<HTMLVideoElement>(null); const [playing, setPlaying] = useState(false);
  const reduce = useMemo(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  /* the trim preview stays inside the kept part: it starts at the in point and loops back from the out point */
  useEffect(() => { const el = v.current; if (!el || !open) return; try { el.currentTime = t.start; } catch { /* not seekable yet */ } }, [t.start, open]);
  useEffect(() => { const el = v.current; if (!el || !open) return; try { el.currentTime = Math.max(t.start, t.end - 0.05); } catch { /* */ } el.pause(); }, [t.end]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && !reduce) { const el = v.current; void el?.play().then(() => setPlaying(true), () => setPlaying(false)); } if (!open) { v.current?.pause(); setPlaying(false); } }, [open, reduce]);
  const toggle = () => { const el = v.current; if (!el) return; if (el.paused) { if (el.currentTime >= t.end - 0.05) el.currentTime = t.start; void el.play().then(() => setPlaying(true), () => undefined); } else { el.pause(); setPlaying(false); } };
  const short = clip.dur > 0 && clip.dur < MIN_TRIM * 2;
  return <BarPopover open={open} anchor={anchor} avoid={dock} watch={dock} placement="top" gap={8} onClose={onClose} label={`Trim clip ${index + 1}`} testId="st-pop-trim" width={360} className="st-trim-pop">
    <PopSection label={`Clip ${index + 1}`} aside={<span className="st-trim-name" title={clip.name}>{clip.name}</span>}>
      <div className="st-prev"><video ref={v} src={clip.url} muted playsInline preload="auto" loop={false} data-testid="st-trim-video"
        onTimeUpdate={e => { const el = e.currentTarget; if (el.currentTime >= t.end - 0.03) { el.currentTime = t.start; if (reduce) { el.pause(); setPlaying(false); } } }} />
        <button type="button" className="st-play" onClick={toggle} aria-label={playing ? 'Pause preview' : 'Play the kept part'} data-testid="st-trim-play">{playing ? <PauseGlyph s={14} /> : <PlayGlyph s={14} />}</button></div>
      {clip.dur > 0 && !short ? <TrimRange duration={clip.dur} value={t} max={clip.dur} min={MIN_TRIM} step={0.1} label="Keep" testId="st-trim" onChange={x => onTrim(x)} />
        : <PopNote>{clip.dur > 0 ? 'This clip is too short to trim.' : 'Reading the clip…'}</PopNote>}
      <div className="st-pop-acts"><button type="button" className="vbar-link" disabled={!clampTrim(clip.trim, clip.dur)} onClick={() => onTrim(null)} data-testid="st-trim-reset">Use the whole clip</button>
        <span className="st-trim-sum">{secText(playLen(clip))} of {secText(clip.dur)}</span></div>
    </PopSection></BarPopover>;
}

/** Where the frame sits on a clip of another shape (Fill): the clip's first frame with the kept window on it, dragged or moved with the arrows. */
function CropPicker({ clip, frame, crop, onChange }: { clip: StitchClip; frame: { w: number; h: number }; crop: { x: number; y: number }; onChange: (c: { x: number; y: number }) => void }) {
  const box = useRef<HTMLDivElement>(null); const grab = useRef<{ id: number; x: number; y: number; cx: number; cy: number } | null>(null);
  const rin = clip.w / clip.h, rout = frame.w / frame.h; const wide = rin > rout; /* the clip is wider than the frame: the window slides sideways */
  const ww = wide ? rout / rin : 1, wh = wide ? 1 : rin / rout;
  const bw = 268, bh = Math.round(Math.min(180, bw / rin)); const boxW = Math.round(bh * rin);
  const set = (x: number, y: number) => onChange({ x: Math.round(Math.min(1, Math.max(0, x)) * 100) / 100, y: Math.round(Math.min(1, Math.max(0, y)) * 100) / 100 });
  const onMove = (e: React.PointerEvent) => { const g = grab.current; if (!g || g.id !== e.pointerId) return; const fw = boxW * (1 - ww), fh = bh * (1 - wh);
    set(fw > 0 ? g.cx + (e.clientX - g.x) / fw : crop.x, fh > 0 ? g.cy + (e.clientY - g.y) / fh : crop.y); };
  const key = (e: React.KeyboardEvent) => { const st = e.shiftKey ? 0.1 : 0.02; const m: Record<string, [number, number]> = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] };
    const v = m[e.key]; if (e.key === 'Home') { e.preventDefault(); set(0.5, 0.5); return; } if (!v) return; e.preventDefault(); set(crop.x + v[0], crop.y + v[1]); };
  const where = wide ? (crop.x < 0.34 ? 'left' : crop.x > 0.66 ? 'right' : 'centre') : (crop.y < 0.34 ? 'top' : crop.y > 0.66 ? 'bottom' : 'centre');
  return <div className="st-crop" style={{ width: boxW, height: bh }} ref={box} data-testid="st-crop">
    <VideoThumb src={`${clip.url}#t=0.1`} className="st-crop-v" />
    <div className="st-crop-win" role="slider" tabIndex={0} aria-label="Crop position" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((wide ? crop.x : crop.y) * 100)} aria-valuetext={`Frame at the ${where}`}
      data-testid="st-crop-win" onKeyDown={key} style={{ width: `${ww * 100}%`, height: `${wh * 100}%`, left: `${(1 - ww) * crop.x * 100}%`, top: `${(1 - wh) * crop.y * 100}%` }}
      onPointerDown={e => { grab.current = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: crop.x, cy: crop.y }; try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* */ } }}
      onPointerMove={onMove} onPointerUp={() => { grab.current = null; }} onPointerCancel={() => { grab.current = null; }} onDoubleClick={() => set(0.5, 0.5)} />
    <span className="st-crop-tip" aria-hidden>Drag the frame</span>
  </div>;
}

/** One card (title or end card): on or off, its words, its look, where it sits and, under More, how long it shows. */
function CardEditor({ which, card, onChange }: { which: 'title' | 'end'; card: StitchCard; onChange: (c: StitchCard) => void }) {
  const set = (p: Partial<StitchCard>) => onChange({ ...card, ...p });
  return <>
    <PopSwitch label={which === 'title' ? 'Title' : 'End card'} hint={which === 'title' ? 'Words at the start' : 'Words at the end'} on={card.on} testId={`st-${which}-on`} onChange={v => set({ on: v, text: v && !card.text.trim() && which === 'end' ? END_CARD_TEXT : card.text })} />
    {card.on && <>
      <label className="bp-field st-card-field"><input type="text" value={card.text} maxLength={CARD_TEXT_MAX} placeholder={which === 'title' ? 'Your title' : END_CARD_TEXT} aria-label={which === 'title' ? 'Title text' : 'End card text'} data-testid={`st-${which}-text`}
        onChange={e => set({ text: e.target.value })} /><small>{card.text.trim() ? `${card.text.length}/${CARD_TEXT_MAX}` : 'Type the words to show'}</small></label>
      <PopSection label="Look"><Segmented label="Card look" value={card.style} cols={2} testId={`st-${which}-style`} onChange={v => set({ style: v })}
        options={CARD_STYLES.map(v => ({ value: v, label: <span className={`st-look st-look-${v}`}>{CARD_LOOKS[v].label}</span>, testId: `st-${which}-style-${v}` }))} /></PopSection>
      <PopSection label="Where"><Segmented label="Where the card shows" value={card.mode} testId={`st-${which}-mode`} onChange={v => set({ mode: v })}
        options={[{ value: 'black', label: 'On black', testId: `st-${which}-mode-black` }, { value: 'over', label: which === 'title' ? 'Over the first clip' : 'Over the last clip', testId: `st-${which}-mode-over` }]} /></PopSection>
      <details className="st-more"><summary data-testid={`st-${which}-more`}>More</summary>
        <Level label="Shows for" value={card.sec} max={CARD_SEC.max} step={0.5} text={secText(card.sec)} testId={`st-${which}-sec`} onChange={v => set({ sec: Math.max(CARD_SEC.min, v) })} /></details>
      <PopNote>{card.mode === 'black' ? `Adds ${secText(card.sec)} on black` : `Shows for ${secText(card.sec)} over the ${which === 'title' ? 'first' : 'last'} clip`}, fading in and out.</PopNote>
    </>}
  </>;
}

/** The voice's captions: Whisper on this computer (or a script voice's own words); 'setup' when Whisper isn't set up here. */
async function voiceCues(v: StitchSound): Promise<Cue[] | 'setup'> {
  const r = await fetch('/api/captions/file', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: v.url, jobId: v.jobId ?? undefined }) });
  const b = await r.json().catch(() => ({})); if (b?.state === 'setup') return 'setup'; if (!r.ok) throw new Error(b?.error || 'Couldn’t make the captions.'); return Array.isArray(b.cues) ? b.cues : [];
}
