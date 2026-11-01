import { IMAGE_PAGE, toolPage } from '../../../server/src/shared/pages';
import { IMAGE_ACCEPT } from '../../../server/src/shared/mediaAccept';
import { withSearch } from '../shared/workflowLinks';
import { isOpenWeights, OpenWeightsBadge } from '../shared/OpenWeights';
import { usePosterSlots, presetArt, PLACEHOLDER_TITLE } from '../shared/posterSlots';
import { ResumeStatus } from './edge/Edge';
import { CommunityGrid } from './pages/Live';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { HeroTitle, setHeroCanvasHidden, useHeroShown, useNarrow } from '../shared/HeroTitle';
import { JobState, listJobs, STATE_LABELS, ToolInfo } from '../api';
import { Link, navigate } from '../platform/router';
import { VideoWorkflowChip, VIDEO_PAGE } from './video/VideoWorkflows';
import MediaArt from './MediaArt';
import Recreate from '../platform/Recreate';
import { EXAMPLES, exampleAt, exampleFor } from './examples';
import { categoryOf, previewOf } from './registryFields';
import ModelButton from './b1/ModelButton';
import { SubTabs, Slideshow, ViewToggle, HistEmpty, HistSize, HIST_SIZES, HistFilterSelect, histMatch, type HistFilter } from './b1/CanvasBits';
import AppLibrary, { AppHeroMedia, isGalleryApp } from './AppLibrary';
/** B21 (Tier 2): tools whose Library is the app library (own hero + own examples, no shared stills). */
export const ownLib = (t: ToolInfo) => isGalleryApp(t) || t.id === 'photo-fx';
/** Per-tool extra content above the examples (locked style card, effects gallery, …), registered by the tool page. */
export const LIB_EXTRA: Record<string, (t: ToolInfo) => React.ReactNode> = {};

/**
 * Tool workspace: left settings panel (tool card, mode tabs, inputs, Generate) + big right canvas.
 * `stage` (failure / result / versions) sits on top of the canvas; canvas tabs below: History · Library · Styles · How it works.
 */
export default function Workspace({ tool, modes, panel, stage, hero }: { tool: ToolInfo; modes?: React.ReactNode; panel: React.ReactNode; stage?: React.ReactNode; /** B29: a tool's own Library hero (e.g. Re-shoot's upload card) instead of the shared one */ hero?: React.ReactNode }) {
  // Narrow screens: one view at a time. "Create" shows the form; a canvas tab shows that tab's content. The tab strip sits on top.
  const [mv, setMv] = useState<'form' | 'canvas'>('form'); const heroShown = useHeroShown(); const narrow = useNarrow();
  useLayoutEffect(() => { setHeroCanvasHidden(narrow && mv === 'form'); return () => setHeroCanvasHidden(false); }, [narrow, mv]);
  return (
    <div className={`ws mv-${mv}`}>
      {/* BH12: the panel title block is hidden on tool pages, so the page h1 lives here (one per page) */}{(!heroShown || (narrow && mv === 'form')) && <h1 className="sr-only-vis" data-testid="ws-h1">{tool.name}</h1>}
      <aside className="ws-panel">
        {/* One Video page (2026-10-23): a video workflow's panel starts with the workflow chip instead of the Create / Edit / Motion Control tabs */}
        {mediaKey(tool) === 'video' || location.pathname === VIDEO_PAGE ? <VideoWorkflowChip /> : mediaKey(tool) === 'image' ? <nav className="ws-texttabs" aria-label="Sections">{SECTIONS.image.map(([to, l]) => { const on = sectionOn(to, SECTIONS.image); return <Link key={to} to={to} className={`wst ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined}>{l}</Link>; })}</nav> : null /* One Audio page (2026-10-23): no Create / Voice / Soundtrack tabs; the workflows are in the Audio bar */}
        <div className="ws-tool">
          {ownLib(tool) ? <AppHeroMedia tool={tool} ratio="16/7" className="ws-tool-media" /> : <MediaArt seed={tool.id} ex={exampleFor(tool.id, previewOf(tool))} ratio="16/7" />}
          <div className="ws-tool-copy"><span className="eyebrow">{categoryOf(tool)}</span><p className="ws-tool-name">{tool.name}</p></div>
        </div>
        {tool.providers.length < 2 && <ModelButton tool={tool} />}{/* tools with 2+ providers pick the model in GenerateBar's card row, so no duplicate MODEL row */}
        {modes}
        <div className="flow">{panel}</div>
        {/* Model vs Run-on: a one-engine tool's Run on field sits in its GenerateBar (shared/GenerateBar.tsx); the old folded route list is gone */}
      </aside>
      <section className="ws-canvas">
        {stage}
        <CanvasTabs tool={tool} hero={hero} mv={mv} setMv={v => { setMv(v); scrollTo({ top: 0 }); }} />
      </section>
    </div>
  );
}

const SECTIONS: Record<'image', [string, string][]> = {
  image: [[IMAGE_PAGE, 'Create'], [`${IMAGE_PAGE}?mode=edit`, 'Edit' /* Create Image's edit mode (QA #15), not Brush Edit */], [`${IMAGE_PAGE}?workflow=upscale`, 'Upscale']],
};
/** A section link with a query (?mode=edit, ?workflow=upscale) is current when its params match; a plain path when no sibling section with a query matches. */
const qMatch = (to: string) => { const [p, q] = to.split('?'); if (location.pathname !== p) return false; const cur = new URLSearchParams(location.search); return !q || [...new URLSearchParams(q)].every(([k, v]) => cur.get(k) === v); };
const sectionOn = (to: string, all: [string, string][]) => qMatch(to) && (to.includes('?') || !all.some(([o]) => o !== to && o.includes('?') && qMatch(o)));
const mediaKey = (t: ToolInfo): 'video' | 'image' | 'audio' => { const k = (t as any).app?.kind; if (k === 'image' || /image|cutout|product|character|inpaint|relight/.test(t.id)) return 'image'; if (k === 'audio' || k === 'soundtrack' || /audio|voice|music|soundtrack/.test(t.id)) return 'audio'; return 'video'; };
/** Library hero uses only bright, readable clips. */
const BRIGHT = ['burrow', 'dunes', 'giant', 'soar'];
const heroExample = (id: string) => EXAMPLES.find(e => e.id === BRIGHT[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % BRIGHT.length])!;
const TABS = ['Library', 'History', 'Styles', 'How it works'] as const;
/** Change / Pick a move in the camera panel asks for the move grid even when the Library tab mounts after the event. */
let camGridNext = false;
type Tab = typeof TABS[number];
/** Recreate = open the tool fresh with ?preset (read once on mount by the tool). */
export const recreate = (route: string, preset: string) => location.assign(withSearch(route, `preset=${encodeURIComponent(preset)}`));

function CanvasTabs({ tool, hero, mv = 'canvas', setMv }: { tool: ToolInfo; hero?: React.ReactNode; mv?: 'form' | 'canvas'; setMv?: (v: 'form' | 'canvas') => void }) {
  const [jobs, setJobs] = useState<JobState[]>([]); const [tab, setTab] = useState<Tab | null>(null); const [pill, setPill] = useState(0); const [lib, setLib] = useState<'ours' | 'trending' | 'new'>('ours'); const [view, setView] = useState<'grid' | 'list'>('grid');
  /* PB-19: `loaded` once the first list answer is in, so the empty state shows without a lingering "Checking for running jobs…" bar */
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { let live = true; setLoaded(false); const l = () => listJobs(tool.id).then(j => { if (live) { setJobs(j); setLoaded(true); } }).catch(() => undefined); l(); const t = setInterval(() => { if (!document.hidden) l(); } /* hidden tab: skip */, 3000); return () => { live = false; clearInterval(t); }; }, [tool.id]);
  /* PB-20: History toolbar: filter and thumbnail size (remembered) */
  const [hf, setHf] = useState<HistFilter>('all'); const [hsz, setHsz0] = useState(() => { try { const n = Number(localStorage.getItem('oj:hist-size')); return n >= 0 && n < HIST_SIZES.length && localStorage.getItem('oj:hist-size') != null ? n : 1; } catch { return 1; } });
  const setHsz = (n: number) => { setHsz0(n); try { localStorage.setItem('oj:hist-size', String(n)); } catch { /* storage off */ } };
  const histShown = jobs.filter(j => histMatch(hf, j.status)); const hCounts = { all: jobs.length, active: jobs.filter(j => histMatch('active', j.status)).length, done: jobs.filter(j => histMatch('done', j.status)).length, failed: jobs.filter(j => histMatch('failed', j.status)).length };
  // Gallery apps (Anime Restyle…) use their base tool's canvas: same tabs, same default tab, and they stay on their own route.
  const kind: string = (tool as any).app?.gallery?.base ?? tool.id;
  const own = ownLib(tool);
  /* B21: an app with its own library opens on Library; a locked style (Anime Restyle) has no Styles tab, and an app with no presets of its own has none either */
  const appTabs: Tab[] | null = own ? (['Library', 'History', 'How it works'] as Tab[]) /* an app's presets are its base tool's modes, not styles (§0.4) */ : null;
  const cur0: Tab = tab ?? (own ? 'Library' : kind === 'restyle' ? 'Styles' : 'Library');
  const cur: Tab = appTabs && !appTabs.includes(cur0) ? 'Library' : cur0;
  useEffect(() => { const f = () => { if (!document.querySelector('[data-testid=camera-library]')) camGridNext = true; setTab('Library'); setMv?.('canvas'); }; const back = () => { if (tool.id === 'camera') setMv?.('form'); }; addEventListener('oj:open-library', f); addEventListener('oj:pick-type', back); return () => { removeEventListener('oj:open-library', f); removeEventListener('oj:pick-type', back); }; }, [setMv, tool.id]);
  useEffect(() => { const f = () => { setTab(SWAP_LIB.includes(kind) ? 'Styles' : 'Library'); setTimeout(() => { const c = document.querySelector('.ws-canvas') as HTMLElement | null; const pills = document.querySelector('.sw-styles .st-src') as HTMLElement | null; if (c && pills) c.scrollTo({ top: c.scrollTop + pills.getBoundingClientRect().top - c.getBoundingClientRect().top - 60 }); }, 60); }; window.addEventListener('oj:styles', f); return () => window.removeEventListener('oj:styles', f); }, [tool.id]);
  const presets = tool.presets ?? [];
  const items = [...presets, ...EXAMPLES.slice(0, Math.max(0, 12 - presets.length)).map(e => ({ id: 'sample-' + e.id, label: e.title, prompt: '', group: '', sample: true }))];
  const ordered = pill === 1 ? [...items].reverse() : pill === 2 ? items.filter((_, i) => i % 2) : items;
  return (
    <div className="canvas">
      <div className="canvas-tabs" role="tablist">{setMv && <button type="button" role="tab" className={`m-only ctab-create ${mv === 'form' ? 'on m-on' : ''}`} aria-selected={mv === 'form'} data-testid="ctab-create" onClick={() => setMv('form')}>Create</button>}{(appTabs ?? (kind === 'restyle' ? (['History', 'Styles', 'How it works'] as Tab[]) : SWAP_LIB.includes(kind) ? (['History', 'Library', 'Styles', 'How it works'] as Tab[]) : TABS)).map(t => <button key={t} role="tab" data-testid={`ctab-${t.split(' ')[0].toLowerCase()}`} aria-selected={cur === t} className={cur === t ? `on ${mv === 'canvas' ? 'm-on' : ''}` : ''} onClick={() => { setTab(t); setMv?.('canvas'); }}>{!own && SWAP_LIB.includes(kind) && t === 'Library' ? 'Motion Library' : t === 'Styles' ? 'Looks' : t}{SWAP_LIB.includes(kind) && t === 'Styles' && <span className="sw-new">NEW</span>}{t === 'History' && jobs.length ? <span className="count">{jobs.length}</span> : null}</button>)}</div>

      {cur === 'History' && jobs.length > 0 && <div className="canvas-tools hist-tools"><HistFilterSelect value={hf} onChange={setHf} counts={hCounts} />{view === 'grid' && <HistSize value={hsz} onChange={setHsz} />}<ViewToggle value={view} onChange={setView} /></div>}
      {cur === 'History' && jobs.length > 0 && !histShown.length && <div className="hist-none helper" data-testid="hist-none">Nothing here with this filter. <button type="button" className="link-btn" onClick={() => setHf('all')}>Show all</button></div>}
      {cur === 'History' && (jobs.length ? <div className={`hist-grid ${view === 'list' ? 'as-list' : ''}`} style={view === 'grid' ? { gridTemplateColumns: `repeat(auto-fill,minmax(${HIST_SIZES[hsz] ?? 220}px,1fr))` } : undefined}>{histShown.map(j => (
        <Link key={j.id} to={`/jobs/${j.id}`} className={`hist-tile asset-${j.status}`}>
          {j.status === 'done' && j.resultUrl ? <video src={j.resultUrl} muted loop playsInline preload="metadata" onMouseEnter={e => { e.currentTarget.play().catch(() => {}); }} onMouseLeave={e => e.currentTarget.pause()} />
            : <MediaArt seed={j.id} ratio="16/9">{(j.status === 'running' || j.status === 'queued') && <div className="asset-progress"><div style={{ width: `${j.progress}%` }} /></div>}</MediaArt>}
          <span className={`status status-${j.status}`}>{STATE_LABELS[j.state ?? j.status] ?? j.status}</span>
          <span className="hist-meta">seed {j.input?.seed ?? '-'}{j.draft ? ' · draft' : ''}</span>
        </Link>))}</div>
        : !loaded ? <ResumeStatus toolId={tool.id} /> : <><ResumeStatus toolId={tool.id} checked /><HistEmpty media={mediaKey(tool)} needsInput={tool.inputs.some(i => i.required && /image|video|audio|file|photo|clip/i.test(`${i.kind} ${i.name}`))} onStart={setMv ? () => setMv('form') : undefined} /></>)}

      {cur === 'Library' && own && <AppLibrary tool={tool}>{LIB_EXTRA[tool.id]?.(tool)}</AppLibrary>}
      {cur === 'Library' && !own && SWAP_LIB.includes(kind) && kind !== 'restyle' && <SwapLibrary tool={tool} />}
      {cur === 'Styles' && !own && SWAP_LIB.includes(kind) && <StylesGrid tool={tool} />}
      {cur === 'Library' && tool.id === 'camera' && <CameraLibrary tool={tool} />}
      {cur === 'Library' && !own && !SWAP_LIB.includes(kind) && tool.id !== 'camera' && <>
        {hero !== undefined ? hero : <div className="canvas-hero compact">
          <div><HeroTitle>{tool.name}</HeroTitle><p className="helper">{tool.description}</p></div>
          <MediaArt seed={tool.id + 'hero'} ex={heroExample(tool.id)} ratio="16/9" />
        </div>}
        <SubTabs tabs={[['ours', 'Built-in examples'], ['trending', 'Community trending'], ['new', 'Community new']]} value={lib} onChange={setLib} />
        {lib === 'ours' ? <div className="lib-section"><Recreate toolId={tool.id} hard minTiles={8} /></div> : <div className="lib-section"><CommunityGrid sort={lib} /></div>}
        <span className="tag">Looks</span>
        <div className="pills" role="tablist">{['Featured', 'Trending', 'Newest'].map((p, i) => <button key={p} className={`pill ${pill === i ? 'on' : ''}`} onClick={() => setPill(i)}>{p}</button>)}</div>
        <div className="masonry">{ordered.map((p, i) => (
          <article key={p.id} className="masonry-item">
            {(() => { const ex = exampleAt(i, (p as any).posterUrl ?? (p as any).previewUrl, 3); return <MediaArt seed={p.id} webm={(p as any).previewWebm} ex={ex} ratio={ex.ratio ?? ['3/4', '1/1', '4/5', '9/16'][i % 4]} badge={(p as any).sample ? undefined : tool.name}>
              <div className="masonry-foot"><span className="art-label-inline">{p.label}</span>
                {!(p as any).sample && <button className="btn btn-sm btn-primary" onClick={() => recreate(tool.route, p.id)}>Recreate</button>}</div>
            </MediaArt>; })()}
          </article>))}</div>
      </>}

      {cur === 'Styles' && !SWAP_LIB.includes(kind) && (presets.length ? <div className="style-grid">{presets.map((p, i) => (
        <button key={p.id} className="style-tile" onClick={() => recreate(tool.route, p.id)} title={p.prompt}>
          <MediaArt seed={p.id} webm={(p as any).previewWebm} ex={own ? ((p as any).posterUrl ? { id: p.id, title: p.label, poster: (p as any).posterUrl, src: (p as any).previewWebm ?? '' } : undefined) : exampleAt(i, (p as any).posterUrl ?? p.previewUrl, 5)} ratio="1/1" /><span>{p.label}</span>{p.group && <em>{p.group}</em>}
        </button>))}</div> : <div className="canvas-empty"><h3>No looks for this workflow yet</h3></div>)}

      {cur === 'How it works' && <div className="how">
        <Slideshow slides={[
          { title: 'Add your media', body: <p className="helper">Upload a clip or image in the left panel, or pick one from your library. Limits are checked before upload.</p>, art: <MediaArt seed={tool.id + 's1'} ex={exampleAt(0, null, 1)} ratio="16/10" /> },
          { title: 'Pick a look', body: <p className="helper">Choose a preset or style, or describe the change. Type @ to point at a reference; it becomes a chip.</p>, art: <MediaArt seed={tool.id + 's2'} ex={exampleAt(1, null, 4)} ratio="16/10" /> },
          { title: 'Generate and compare', body: <p className="helper">The price shows on the button once everything is set. Drag the before/after handle, make more versions, download MP4 or GIF.</p>, art: <MediaArt seed={tool.id + 's3'} ex={heroExample(tool.id)} ratio="16/10" /> },
        ]} />
        <details className="tech"><summary>Advanced</summary>
          <dl className="canvas-meta">
            {tool.model && <><dt>Model</dt><dd>{tool.model}</dd></>}
            <dt>GPU s per s of video</dt><dd>{Object.entries(tool.gpuSecPerSec).map(([r, v]) => `${r} ${v}s`).join(' · ')}</dd>
            <dt>Backend</dt><dd>{tool.backend}</dd>
            {tool.workflows?.length ? <><dt>Workflows</dt><dd>{tool.workflows.join(', ')}</dd></> : null}
          </dl>
        </details>
      </div>}
    </div>
  );
}

/** Object Swap / Motion Control library: small preview card left, big image right with the title over it;
 *  then an even 4-column grid of tall preset cards from GET /api/presets?toolId= (posterUrl, our own label on top). */
const SWAP_LIB = ['object-swap', 'motion-transfer', 'restyle'];
/** Styles tab shared by Swap / Motion / Restyle: source | Custom switch + 3-column 16:9 grid.
 *  On Restyle a card picks the style in the panel; on Swap / Motion it opens Restyle with that style (the style backend lives there). */
function StylesGrid({ tool }: { tool: ToolInfo }) {
  const gal = (tool as any).app?.gallery as { base?: string; locked?: Record<string, string> } | undefined;
  const rs = (gal?.base ?? tool.id) === 'restyle'; const lockedStyle = gal?.locked?.preset ?? '';
  const slots = usePosterSlots(); const [items, setItems] = useState<{ id: string; label: string; group?: string; posterUrl?: string }[]>([]); const [src, setSrc] = useState<'ours' | 'custom'>('ours');
  const [st, setSt] = useState<{ preset: string; custom: boolean }>({ preset: lockedStyle, custom: false });
  useEffect(() => { fetch('/api/presets?toolId=restyle').then(r => r.ok ? r.json() : null).then(d => d?.items && setItems(d.items)).catch(() => {}); }, []);
  useEffect(() => { const f = (e: Event) => { const d = (e as CustomEvent<{ preset: string; custom: boolean }>).detail; setSt(d); if (d.custom) setSrc('custom'); }; window.addEventListener('oj:style-state', f); return () => window.removeEventListener('oj:style-state', f); }, []);
  /* Batch 25: the whole card (pointer or keyboard focus) plays its loop, not only the video layer; reduced motion keeps the poster */
  const stPlay = (e: React.SyntheticEvent<HTMLElement>) => { const v = e.currentTarget.querySelector('video'); if (!v || matchMedia('(prefers-reduced-motion: reduce)').matches) return; v.classList.add('on'); v.play().catch(() => 0); };
  const stStop = (e: React.SyntheticEvent<HTMLElement>) => { const v = e.currentTarget.querySelector('video'); if (!v) return; v.classList.remove('on'); v.pause(); v.currentTime = 0; };
  const pick = (id: string) => lockedStyle ? undefined : rs ? window.dispatchEvent(new CustomEvent('oj:preset', { detail: st.preset === id ? '' : id })) : navigate(`/tools/restyle?preset=${encodeURIComponent(id)}`);
  return <div className="sw-lib sw-styles" data-testid="styles-grid">
    <div className="sw-head"><HeroTitle>{lockedStyle ? tool.name : 'Redraw in any style'}</HeroTitle><p>{lockedStyle ? <>This workflow always uses the highlighted look. Want another? Open <Link to={`/tools/restyle?preset=${encodeURIComponent(lockedStyle)}`}>Restyle</Link>.</> : 'The whole shot is redrawn in the look you pick. Motion, timing and cuts stay as filmed.'}</p></div>
    <div className="sw-pills st-src" role="tablist"><button type="button" role="tab" aria-selected={src === 'ours'} className={src === 'ours' ? 'on' : ''} onClick={() => setSrc('ours')}>Imagination</button><button type="button" role="tab" data-testid="styles-custom" aria-selected={src === 'custom'} className={src === 'custom' ? 'on' : ''} onClick={() => setSrc('custom')}>Custom</button></div>
    {src === 'ours' ? <div className="st-grid chips-scroll">{items.map(p => <button key={p.id} type="button" className={`st-card chip ${st.preset === p.id ? 'on' : ''}`} aria-pressed={st.preset === p.id} data-testid={`style-${p.id}`} onClick={() => pick(p.id)} onMouseEnter={stPlay} onFocus={stPlay} onMouseLeave={stStop} onBlur={stStop}>
        <span className="sw-poster" style={p.posterUrl ? { backgroundImage: `url(${p.posterUrl})` } : undefined} />{(() => { const art = presetArt(p, slots[`restyle:style:${p.id}`]); const loop = art.loop; /* B28a: the preset's own loopUrl / standIn / needsRealLoop, the posters slot as the fallback; a stand-in loop still plays but the card says so */ return <>{loop && <video className="st-hover" src={loop} muted loop playsInline preload="none" aria-hidden />}{art.marked && <span className="ex-ph st-ph" data-testid={`style-ph-${p.id}`} title={PLACEHOLDER_TITLE}>Placeholder</span>}</>; })()}<span className="st-l">{p.label}</span></button>)}</div>
      : <div className="st-custom" data-testid="styles-custom-panel"><h3>Your own look</h3><p className="helper">Use the reference images in the panel (and an optional prompt) as the look instead of a ready-made one.</p>
        {rs ? <button type="button" className={`btn ${st.custom ? '' : 'btn-primary'}`} onClick={() => window.dispatchEvent(new CustomEvent('oj:custom-style', { detail: !st.custom }))}>{st.custom ? 'Use a ready-made look instead' : 'Use my references as the look'}</button>
          : <Link className="btn btn-primary" to="/tools/restyle">Open Restyle</Link>}</div>}
  </div>;
}
/** Camera moves (B4 layout): hero, group pills + search, 3-column 16:9 grid of every move. Picking selects it in the panel. */
const moveGlyph = (p: any) => ({ shake: '≋', roll: '⟲', left: '←', right: '→', up: '↑', down: '↓', orbit: '↻', orbitr: '↺', out: '⤡', in: '⤢', whip: '⇆', blur: '◌', time: '◷', float: '⇡' } as Record<string, string>)[moveKind(p)] ?? '◎';
/** Which way the frame should move to sketch this camera move (camera pans left, so the scene slides right). */
/** BH2 #3-4: classify a move into one hover motion (true to the camera: a left move slides the scene right, a rise slides it down). Order matters: specific first. */
const MOVE_KINDS: [RegExp, string][] = [
  [/whip/, 'whip'],
  [/shake|handheld|wiggle|earthquake|impact|body-?rig|\bbts\b|behind-the-scenes|ugc|phone/, 'shake'],
  [/roll|dutch|barrel|paper-fold/, 'roll'],
  [/orbit|\barc\b|arc-|360|bullet|spin|freeze|glam|robot|around|circle/, 'orbit'],
  [/focus|\brack|fisheye|frost|slow-shutter|long-exposure|blur|strobe/, 'blur'],
  [/timelapse|time-lapse|smooth60|old-film/, 'time'],
  [/vertigo-out|dolly-zoom out/, 'out'],
  [/vertigo|dolly-zoom|yo-?yo/, 'in'],
  [/shatter|ripple|pixel|storm|lightning|bloom|burst/, 'shake'],
  [/liquid|melt/, 'down'],
  [/clone|mirror/, 'orbit'],
  [/\bleft\b|-left|-l\b|-l-|left or right/, 'left'],
  [/\bright\b|-right|-r\b|-r-/, 'right'],
  [/float|levitat|ember|smoke|zero gravity/, 'float'],
  [/down|-d\b|tilt-d|\blower|descend|drop|top-down|overhead|high angle|high-down/, 'down'],
  [/\bup\b|-up|-u\b|rise|crane|jib|pedestal|boom|low-hero|low hero|giant/, 'up'],
  [/out\b|-out|pull|back\b|-back|reveal|aerial|zoom-space|earth zoom|\blead\b|dollhouse|mini|tiny/, 'out'],
  [/\bin\b|-in\b|push|zoom|crash|snap|dolly|fpv|fly|forward|pov|chase|rush|follow|pass|portal|close-in|beat|car|mount|track|truck|glide|ots|shoulder/, 'in'],
  [/\bpan\b|pan-|drift|aerial/, 'right'],
];
const moveKind = (p: any) => { const t = `${p.id} ${p.label ?? ''} ${p.camera?.verb ?? ''} ${p.camera?.direction ?? ''}`.toLowerCase(); const k = MOVE_KINDS.find(([re]) => re.test(t))?.[1] ?? 'static'; return k === 'orbit' && /right|-r\b/.test(t) ? 'orbitr' : k; };
function CameraLibrary({ tool }: { tool: ToolInfo }) {
  // The server lists each move once (old ids live in preset.aliases / app.moveAliases and still work on submit), so no client-side dedupe.
  const all = (tool.presets ?? []) as any[]; const [grp, setGrp] = useState('All'); const [q, setQ] = useState(''); const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => { const f = (e: Event) => setPicked((e as CustomEvent<string[]>).detail ?? []); addEventListener('oj:types-state', f); dispatchEvent(new Event('oj:types-ask')); return () => removeEventListener('oj:types-state', f); }, []);
  const groups = ['All', ...[...new Set(all.map(p => p.category || p.group).filter(Boolean))]] as string[];
  const shown = all.filter(p => (grp === 'All' || (p.category || p.group) === grp) && (!q.trim() || `${p.label} ${p.description ?? ''} ${(p.aliases ?? []).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())));
  const sel0 = all.find(p => p.id === picked[0]); const sel = sel0; const heroMove = sel0 ?? all.find(p => p.previewUrl);
  /* T5: the canvas opens on an upload card + move strip; the full grid is the picker ("See all moves", or Change / Pick a move in the panel) and closes on a pick. */
  const [grid, setGrid] = useState(() => { const v = camGridNext; camGridNext = false; return v; }); const [kf, setKf] = useState<string | null>(null); const [kfDrop, setKfDrop] = useState(false); const kfIn = useRef<HTMLInputElement>(null); const strip = useRef<HTMLDivElement>(null);
  useEffect(() => { const o = () => { camGridNext = false; setGrid(true); }; const k = (e: Event) => setKf((e as CustomEvent<string | null>).detail ?? null); addEventListener('oj:open-library', o); addEventListener('oj:keyframe-state', k); dispatchEvent(new Event('oj:keyframe-ask')); return () => { removeEventListener('oj:open-library', o); removeEventListener('oj:keyframe-state', k); }; }, []);
  const pick = (id: string) => { dispatchEvent(new CustomEvent('oj:pick-type', { detail: id })); setGrid(false); };
  const stripMoves = (() => { const withClip = all.filter(p => p.previewWebm || p.previewUrl); const base = (withClip.length >= 8 ? withClip : all).slice(0, 16); return sel && !base.some(p => p.id === sel.id) ? [sel, ...base.slice(0, 15)] : base; })();
  const tileArt = (p: any, autoPlay = false) => (p.previewWebm || p.previewUrl) ? <span className="sw-poster cam-still cam-has-clip" aria-hidden><video className="cam-frame cam-vid" src={p.previewWebm || p.previewUrl} muted loop playsInline autoPlay={autoPlay} preload="metadata" /><i className="cam-glyph">{moveGlyph(p)}</i></span>
    : <span className={`sw-poster cam-still mv-${moveKind(p)}`} aria-hidden><span className={`cam-frame ${p.posterUrl ? '' : 'cam-noart'}`} style={p.posterUrl ? { backgroundImage: `url(${p.posterUrl})` } : undefined} /><i className="cam-glyph">{moveGlyph(p)}</i></span>;
  if (!grid) return <div className="sw-lib cam-lib cam-start" data-testid="camera-library">
    <div className="cam-start-h"><h2>{sel ? sel.label : 'One frame, any move'}</h2><p>{sel ? (sel.description ?? sel.prompt) : `Add a start image, pick one of ${all.length} camera moves, get a 3 or 5 s shot.`}</p></div>
    <div className="cam-start-row">
      <div className="cam-start-col"><div className={`cam-up ${kfDrop ? 'drop' : ''} ${kf ? 'has' : ''}`} data-testid="camera-upload-hero" onDragOver={e => { e.preventDefault(); setKfDrop(true); }} onDragLeave={() => setKfDrop(false)} onDrop={e => { e.preventDefault(); setKfDrop(false); const f = [...e.dataTransfer.files]; if (f.length) dispatchEvent(new CustomEvent('oj:keyframe', { detail: f })); }}>
        {kf ? <><img src={kf} alt="Start image" /><span className="cam-up-cap">Start image · <button type="button" onClick={() => kfIn.current?.click()}>Replace</button></span></>
          : <button type="button" className="cam-up-hit" onClick={() => kfIn.current?.click()}><span className="cam-up-ic" aria-hidden>⇪</span><b>Upload Image</b><small>Click or drop a PNG or JPG · min 854×480</small></button>}
        <i className="vs-corner tl" aria-hidden /><i className="vs-corner tr" aria-hidden /><i className="vs-corner bl" aria-hidden /><i className="vs-corner br" aria-hidden />
        <input ref={kfIn} type="file" accept={IMAGE_ACCEPT} hidden data-picker-title="Choose a start image" data-picker-limits="One image · PNG or JPG · or a frame from one of your videos" data-picker-frames="" data-testid="camera-hero-input" onChange={e => { const f = [...(e.target.files ?? [])]; if (f.length) dispatchEvent(new CustomEvent('oj:keyframe', { detail: f })); e.currentTarget.value = ''; }} /></div>
        <b className="cam-start-l">Add image</b><span className="cam-start-s">One still: the first frame of your shot.</span></div>
      <div className="cam-start-col cam-start-strip"><div className="cam-strip-wrap"><div className="cam-strip" ref={strip} data-testid="camera-strip">{stripMoves.map(p => <button key={p.id} type="button" className={`cam-strip-t ${picked.includes(p.id) ? 'on' : ''}`} aria-pressed={picked.includes(p.id)} data-testid={`cam-strip-${p.id}`} title={p.description ?? p.label} onClick={() => pick(p.id)}
          onMouseEnter={e => e.currentTarget.querySelector('video')?.play().catch(() => 0)} onMouseLeave={e => { const v = e.currentTarget.querySelector('video'); if (v) v.pause(); }}>{tileArt(p)}<span className="cam-strip-l">{p.label}</span></button>)}</div>
          <button type="button" className="cam-strip-nav prev" aria-label="Scroll moves left" onClick={() => strip.current?.scrollBy({ left: -320, behavior: 'smooth' })}>‹</button><button type="button" className="cam-strip-nav next" aria-label="Scroll moves right" onClick={() => strip.current?.scrollBy({ left: 320, behavior: 'smooth' })}>›</button></div>
        <div className="cam-start-lrow"><div><b className="cam-start-l">Choose preset</b><span className="cam-start-s">{sel ? `Selected: ${sel.label}.` : 'Hover to preview, click to use it.'}</span></div><button type="button" className="btn btn-sm cam-see-all" data-testid="camera-see-all" onClick={() => setGrid(true)}>See all {all.length} moves</button></div></div>
    </div>
  </div>;
  return <div className="sw-lib cam-lib" data-testid="camera-library">
    <div className="sw-head sw-hero" data-testid="camera-hero"><div className="sw-hero-txt"><h2>{sel ? sel.label : 'One frame, any move'}</h2>
      <p>{sel ? (sel.description ?? sel.prompt) : 'Pick a camera move and turn one start image into a 3 or 5 s shot. Every move below runs on open weights.'}</p><button type="button" className="btn btn-sm cam-back" data-testid="camera-grid-back" onClick={() => setGrid(false)}>‹ Back</button></div>
      {heroMove && (heroMove.previewWebm || heroMove.previewUrl) ? <video key={heroMove.id} className="sw-hero-art" src={heroMove.previewWebm || heroMove.previewUrl} muted loop autoPlay playsInline aria-hidden /> : heroMove ? <span key={heroMove.id} className={`sw-hero-art cam-hero-still mv-${moveKind(heroMove)}`} data-testid="camera-hero-still" aria-hidden><span className="cam-frame" style={heroMove.posterUrl ? { backgroundImage: `url(${heroMove.posterUrl})` } : undefined} /><em className="cam-tag">Still frame · no preview clip yet</em></span> : <span className="sw-hero-art sw-noart" aria-hidden />}</div>
    <div className="sw-pillrow"><span aria-hidden /><div className="sw-pills cam-pills" role="tablist">{groups.map(g => <button key={g} type="button" role="tab" aria-selected={grp === g} className={grp === g ? 'on' : ''} data-testid={`cam-grp-${g}`} onClick={() => setGrp(g)}>{g}</button>)}</div>
      <input type="search" className="sw-search" placeholder="Search moves" aria-label="Search camera moves" value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="sw-grid chips-scroll" data-testid="camera-grid">{shown.map((p, i) => <button key={p.id} type="button" className={`sw-tile chip ${picked.includes(p.id) ? 'on' : ''}`} aria-pressed={picked.includes(p.id)} data-testid={`cam-move-${p.id}`} title={p.description ?? p.label}
      onClick={() => pick(p.id)} onMouseEnter={e => e.currentTarget.querySelector('video')?.play().catch(() => 0)} onMouseLeave={e => { const v = e.currentTarget.querySelector('video'); if (v) v.pause(); }}>
      {(p.previewWebm || p.previewUrl) ? <span className="sw-poster cam-still cam-has-clip" aria-hidden><video className="cam-frame cam-vid" src={p.previewWebm || p.previewUrl} muted loop playsInline preload="metadata" /><i className="cam-glyph">{moveGlyph(p)}</i><em className="cam-tag">Preview clip</em></span>
        : <span className={`sw-poster cam-still mv-${moveKind(p)}`} aria-hidden><span className={`cam-frame ${p.posterUrl ? '' : 'cam-noart'}`} style={p.posterUrl ? { backgroundImage: `url(${p.posterUrl})` } : undefined} /><i className="cam-glyph">{moveGlyph(p)}</i><em className="cam-tag">Still frame · motion sketch</em></span>}
      <span className="sw-tile-t"><b>{p.label}</b><small>{p.category || p.group}</small></span></button>)}
      {!shown.length && <p className="helper">No moves match.</p>}</div>
  </div>;
}
const LIB_TOOLS = ['motion-transfer', 'object-swap'];
function SwapLibrary({ tool }: { tool: ToolInfo }) {
  const slots = usePosterSlots();
  const [items, setItems] = useState<{ id: string; label: string; group?: string; posterUrl?: string; previewUrl?: string; previewWebm?: string; toolId?: string; toolName?: string }[]>([]);
  const [picked, setPicked] = useState(''); const [pill, setPill] = useState(0); const [picker, setPicker] = useState(false); const [prov, setProv] = useState('');
  const [q, setQ] = useState('');
  /* Motion library: one catalog for the swap family (Motion Transfer + Object Swap), real presets from /api/presets for both. */
  useEffect(() => { let live = true; const t = setTimeout(() => Promise.all(LIB_TOOLS.map(tid => { const u = new URLSearchParams({ toolId: tid, ...(pill === 1 ? { sort: 'trending' } : pill === 2 ? { sort: 'new' } : {}), ...(q.trim() ? { q: q.trim() } : {}) });
      return fetch(`/api/presets?${u}`).then(r => r.ok ? r.json() : null).then(d => (d?.items ?? []).map((x: any) => ({ ...x, toolId: x.toolId ?? tid }))).catch(() => []); }))
    .then(lists => { if (!live) return; const own = lists[LIB_TOOLS.indexOf(tool.id)] ?? []; const rest = lists.filter((_, k) => LIB_TOOLS[k] !== tool.id).flat(); setItems([...own, ...rest]); }), q ? 250 : 0); return () => { live = false; clearTimeout(t); }; }, [tool.id, pill, q]);
  /* T1: the panel's preset (Recreate, ?preset=, a pick) is the source of truth, so the library highlights what will be sent. */
  useEffect(() => { const f = (e: Event) => setPicked((e as CustomEvent<{ preset: string }>).detail?.preset ?? ''); window.addEventListener('oj:style-state', f); return () => window.removeEventListener('oj:style-state', f); }, []);
  useEffect(() => { const ch = () => setPicker(p => !p); const ps = (e: Event) => setProv((e as CustomEvent<string>).detail); window.addEventListener('oj:swap-change', ch); window.addEventListener('oj:provider-state', ps); return () => { window.removeEventListener('oj:swap-change', ch); window.removeEventListener('oj:provider-state', ps); }; }, []);
  const [meta, setMeta] = useState<Record<string, { family?: string; badges?: string[]; openWeights?: boolean }>>({});
  useEffect(() => { fetch(`/api/models?toolId=${encodeURIComponent(tool.id)}`).then(r => r.json()).then(d => setMeta(Object.fromEntries((d.groups?.[0]?.models ?? []).map((m: any) => [m.providerId ?? m.id, { family: m.family, badges: m.badges, openWeights: m.openWeights }])))).catch(() => {}); }, [tool.id]);
  const pickPreset = (pid: string, tid?: string) => { if (tid && tid !== tool.id) return navigate(`${toolPage(tid)}?preset=${encodeURIComponent(pid)}`); const v = picked === pid ? '' : pid; setPicked(v); window.dispatchEvent(new CustomEvent('oj:preset', { detail: v })); };
  if (picker) return <div className="sw-picker" data-testid="swap-picker">
    <div className="sw-ptabs" role="tablist">{tool.providers.map(p => <button key={p.id} type="button" role="tab" aria-selected={prov === p.id} className={prov === p.id ? 'on' : ''} onClick={() => { setProv(p.id); window.dispatchEvent(new CustomEvent('oj:provider', { detail: p.id })); }}><span className="sw-pico" aria-hidden>{(meta[p.id]?.family ?? p.name).slice(0, 1)}</span>{p.name}{meta[p.id]?.badges?.some(b => /^new$/i.test(b)) && <span className="sw-new">NEW</span>}<OpenWeightsBadge on={isOpenWeights(meta[p.id], p)} className="ow-sm" /></button>)}</div>
    <div className="sw-pcards">{[['/tools/object-swap', 'Object / Person Swap', 'object-swap'], ['/tools/motion-transfer', 'Motion Transfer', 'motion-transfer']].map(([to, n, k]) => { const ex = exampleFor(k); return <Link key={to} to={to} className={`sw-pcard ${tool.id === k ? 'on' : ''}`}><video src={ex.src} poster={ex.poster} muted loop autoPlay playsInline aria-hidden /><b>{n}</b></Link>; })}</div>
  </div>;
  const mt = tool.id === 'motion-transfer'; const rs = tool.id === 'restyle';
  return <div className="sw-lib" data-testid="swap-library">
    {(() => { const ex = exampleFor(tool.id); return <div className="sw-head sw-hero" data-testid="swap-hero"><div className="sw-hero-txt"><HeroTitle>{mt || rs ? 'Same moves, new world' : 'Recast any clip'}</HeroTitle>
      <p>{mt || rs ? 'Keep the camera, timing and motion of a driving video and rebuild the cast, location and look from your references.' : 'Replace a product, outfit, person or place in a 4–30 s clip. Camera, motion and cuts stay exactly as filmed.'}</p></div>
      {ex?.src && <video className="sw-hero-art" src={ex.src} poster={ex.poster} muted loop autoPlay playsInline aria-hidden />}</div>; })()}
    <div className="sw-pillrow"><span aria-hidden /><div className="sw-pills" role="tablist">{['Imagination', 'Community trending', 'Community new'].map((l, i) => <button key={l} type="button" role="tab" data-testid={`swap-sort-${i}`} aria-selected={pill === i} className={pill === i ? 'on' : ''} onClick={() => setPill(i)}>{l}</button>)}</div>
      <input type="search" className="sw-search" placeholder="Search presets" aria-label="Search presets" value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="sw-grid chips-scroll" data-testid="swap-grid">{items.map(p => { const other = p.toolId && p.toolId !== tool.id; const art = presetArt(p, slots[`${p.toolId ?? tool.id}:preset:${p.id}`]); const clip = art.loop /* B28a: the preset's loopUrl first */;
      return <button key={`${p.toolId}-${p.id}`} type="button" className={`sw-tile chip ${picked === p.id && !other ? 'on' : ''} ${/\/presets\/(object-swap|motion-transfer)-/.test(p.posterUrl ?? '') ? 'sw-baked' : ''}`} aria-pressed={!other ? picked === p.id : undefined} data-testid={`swap-preset-${p.id}`} data-tool={p.toolId}
        onClick={() => pickPreset(p.id, p.toolId)} onMouseEnter={e => { const v = e.currentTarget.querySelector('video'); v?.play().catch(() => 0); }} onMouseLeave={e => { const v = e.currentTarget.querySelector('video'); if (v) { v.pause(); v.currentTime = 0; } }} title={other ? `${p.label} · opens ${p.toolName ?? p.toolId}` : p.label}>
        {p.posterUrl ? <span className="sw-poster" style={{ backgroundImage: `url(${p.posterUrl})` }} /> : <span className="sw-poster sw-noart" aria-hidden />}{clip && <video className="sw-clip" src={clip} muted loop playsInline preload="none" aria-hidden />}{art.marked && <span className="ex-ph sw-ph" data-testid={`swap-ph-${p.id}`} title={PLACEHOLDER_TITLE}>Placeholder</span>}
        <span className="sw-tile-t"><b>{p.label.replace(/\s*\uFFFD.*$/, '')}</b><small>{other ? (p.toolName ?? p.toolId) : p.group ?? ''}</small></span>
      </button>; })}</div>
  </div>;
}
