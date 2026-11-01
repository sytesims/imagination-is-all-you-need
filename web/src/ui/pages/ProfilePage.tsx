/**
 * /profile: your creator page. Banner (a brand gradient or one of your own images), your picture (the bean mascot by default, or a photo),
 * name and local @name, numbers from GET /api/me/stats, and tabs: Your work (finished results, newest first, loaded 30 at a time as you
 * scroll), Favourites (your hearts), Looks (GET /api/user-looks) and Projects. Edit profile opens the picture picker. Everything stays on this machine.
 */
import { IMAGE_PAGE, VIDEO_PAGE } from '../../../../server/src/shared/pages';
import { IMAGE_ACCEPT } from '../../../../server/src/shared/mediaAccept';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { JobState, Project, ToolInfo } from '../../api';
import { Link } from '../../platform/router';
import { gridSrc } from '../../shared/thumbs';
import { fmtUsd } from '../../shared/billing';
import { useToast } from '../../shared/Toast';
import { Notice } from '../../shared/Notice';
import { useProfile, saveProfile, uploadAvatar, cropToCircle, PhotoError, nameOf, UserAvatar, Bean, type ProfileData } from '../../shared/profile';
import { AVATAR_MOODS, AVATAR_TINTS, COVER_GRADIENTS, HANDLE_RE, NAME_MAX, DEFAULT_AVATAR, type AvatarChoice, type CoverGradient } from '../../../../server/src/shared/avatar';
import { MOOD_NAMES, TINTS, avatarChoiceOf } from '../../../../server/src/shared/beanSvg';
import { useTabs } from './Page';
import { favOf, useFavourites } from '../../shared/favourites';
import './profile.css';

const PAGE = 30;
const COVER_NAMES: Record<CoverGradient, string> = { sunrise: 'Sunrise', ember: 'Ember', dusk: 'Dusk', night: 'Night' };
const isImg = (u?: string | null) => !!u && /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u);
const isAudio = (u?: string | null) => !!u && /\.(wav|mp3|ogg|flac|m4a)(\?|$)/i.test(u);
const thumbOf = (j: JobState) => !j.resultUrl ? '' : isImg(j.resultUrl) ? gridSrc(j.resultUrl, 300) : isAudio(j.resultUrl) ? '' : (j.outputs?.[0] as any)?.posterUrl ?? `/api/media/thumb?url=${encodeURIComponent(j.resultUrl)}`;
/** A finished result as a banner: the picture itself, or a clip's poster frame. */
const coverUrlOf = (j: JobState) => { const u = isImg(j.resultUrl) ? j.resultUrl : !isAudio(j.resultUrl) ? (j.outputs?.[0] as any)?.posterUrl as string | undefined : null; return u && /^\/(files|samples|api\/media\/poster)/.test(u) ? { id: j.id, url: u, at: j.createdAt ?? 0 } : null; };
const monthYear = (ms?: number | null) => ms ? new Date(ms).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '—';

interface Stats { generations: number; finished: number; savedUsd: number; savedRuns: number; favouriteModel: { name: string; runs: number } | null; memberSince: number }
interface Look { id: string; name: string; workflow: string; modelName: string | null; exampleUrl: string; createdAt: number }

/** One paged list of finished jobs (/api/jobs?cursor=…), loaded as you scroll. */
function useJobPages(extra: string) {
  const [items, setItems] = useState<JobState[]>([]); const [next, setNext] = useState<string | null>(''); const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(false); const live = useRef(0);
  const load = useCallback(async (cursor: string, reset = false) => {
    const k = ++live.current; setBusy(true); setErr(false);
    try { const r = await fetch(`/api/jobs?cursor=${encodeURIComponent(cursor)}&limit=${PAGE}&status=done&order=desc${extra}`); if (!r.ok) throw new Error(String(r.status)); const b = await r.json();
      if (k !== live.current) return; setItems(xs => { const base = reset ? [] : xs; const seen = new Set(base.map(x => x.id)); return [...base, ...(b.items ?? []).filter((x: JobState) => !seen.has(x.id))]; }); setNext(b.nextCursor ?? null); setTotal(b.total ?? null); }
    catch { if (k === live.current) setErr(true); } finally { if (k === live.current) setBusy(false); }
  }, [extra]);
  useEffect(() => { void load('', true); }, [load]);
  return { items, total, busy, err, more: next ? () => { if (!busy) void load(next); } : null, retry: () => load(items.length ? next ?? '' : '', !items.length) };
}

export default function ProfilePage({ tools = [] }: { tools?: ToolInfo[] }) {
  const p = useProfile(); const toast = useToast();
  const [stats, setStats] = useState<Stats | null>(null); const [statsErr, setStatsErr] = useState(false); const [tick, setTick] = useState(0);
  const work = useJobPages(''); const liked = useJobPages('&liked=1');
  const [looks, setLooks] = useState<Look[] | null>(null); const [projects, setProjects] = useState<Project[] | null>(null);
  const [editing, setEditing] = useState(false); const [coverOpen, setCoverOpen] = useState(false); const coverBtn = useRef<HTMLButtonElement>(null);
  const [coverBroken, setCoverBroken] = useState('');
  useEffect(() => { setStatsErr(false); fetch('/api/me/stats').then(r => r.ok ? r.json() : Promise.reject()).then(setStats).catch(() => setStatsErr(true)); }, [tick]);
  useEffect(() => { fetch('/api/user-looks').then(r => r.ok ? r.json() : { items: [] }).then(b => setLooks(b.items ?? [])).catch(() => setLooks([]));
    fetch('/api/projects').then(r => r.ok ? r.json() : []).then(b => setProjects(Array.isArray(b) ? b : [])).catch(() => setProjects([])); }, []);
  const TABS = ['Your work', 'Favourites', 'Looks', 'Projects'];
  const [tab, setTab, onTabKey] = useTabs(TABS);
  const counts = [work.total, liked.total, looks?.length ?? null, projects?.length ?? null];
  const toolName = (id: string) => tools.find(t => t.id === id)?.name ?? 'Result';
  const cover = p?.cover; const coverImg = cover?.kind === 'image' && coverBroken !== cover.url ? cover.url : null;
  const coverGrad: CoverGradient = cover?.kind === 'gradient' ? cover.id : 'sunrise';
  const setCover = async (c: ProfileData['cover']) => { try { await saveProfile({ cover: c }); setCoverOpen(false); coverBtn.current?.focus(); } catch (e) { toast((e as Error).message, 'error'); } };
  const named = !!p?.displayName;

  return <div className="page profile-page pf2" data-testid="profile">
    <section className="pf2-banner" data-testid="pf-banner" data-cover={coverImg ? 'image' : coverGrad}>
      <div className={`pf2-banner-bg pf2-cover-${coverGrad}`} aria-hidden>{coverImg && <img className="pf2-cover-img" src={coverImg} alt="" onError={() => setCoverBroken(coverImg)} />}</div>
      <button ref={coverBtn} type="button" className="btn btn-sm pf2-cover-btn" data-testid="pf-cover-btn" aria-haspopup="dialog" aria-expanded={coverOpen} onClick={() => setCoverOpen(o => !o)}>Change cover</button>
      {coverOpen && <CoverPicker current={cover ?? null} images={work.items.map(coverUrlOf).filter(Boolean).slice(0, 12) as { id: string; url: string; at: number }[]} onPick={setCover} onClose={() => { setCoverOpen(false); coverBtn.current?.focus(); }} />}
    </section>

    <header className="pf2-head">
      <button type="button" className="pf2-av-btn" data-testid="pf-avatar-btn" aria-label="Change your profile picture" onClick={() => setEditing(true)}><UserAvatar profile={p} size={128} className="pf2-av" /><span className="pf2-av-edit" aria-hidden>Edit</span></button>
      <div className="pf2-id">
        <h1 className={named ? '' : 'pf2-unnamed'} data-testid="pf-name" title={p?.displayName ?? undefined}>{named ? p!.displayName : 'Your creator page'}</h1>
        <p className="pf2-handle">{p?.handle ? <span data-testid="pf-handle">@{p.handle}</span> : <button type="button" className="link-btn" onClick={() => setEditing(true)}>{named ? 'Pick an @name' : 'Add your name and an @name'}</button>}
          <span className="pf2-dot" aria-hidden>·</span><span className="helper">Stored on this computer</span></p>
      </div>
      <div className="pf2-acts"><button type="button" className="btn btn-primary" data-testid="pf-edit" onClick={() => setEditing(true)}>Edit profile</button><Link to="/settings" className="btn">Settings</Link></div>
    </header>

    <section className="pf2-stats" aria-label="Your numbers" data-testid="pf-stats">
      {statsErr ? <Notice kind="error" className="pf2-err" testId="profile-stats-error" title="Couldn’t load your numbers" action={{ label: 'Retry', onClick: () => setTick(t => t + 1) }}>The app didn’t answer. Check that it’s still running.</Notice> : <>
        <Stat k="Generations" v={stats ? stats.generations.toLocaleString() : null} />
        <Stat k="Finished" v={stats ? stats.finished.toLocaleString() : null} />
        <Stat k="Saved locally" v={stats ? fmtUsd(stats.savedUsd) : null} sub={stats ? stats.savedRuns ? `${stats.savedRuns.toLocaleString()} local run${stats.savedRuns === 1 ? '' : 's'} vs the cheapest hosted price` : 'Run open models locally to save' : ''} />
        <Stat k="Favourite model" v={stats ? stats.favouriteModel?.name ?? 'Not yet' : null} sub={stats?.favouriteModel ? `${stats.favouriteModel.runs.toLocaleString()} run${stats.favouriteModel.runs === 1 ? '' : 's'}` : stats ? 'Your most used model shows here' : ''} wide />
        <Stat k="Member since" v={stats ? monthYear(stats.memberSince) : null} />
      </>}
    </section>

    <div className="pf2-tabs" role="tablist" aria-label="Your profile" onKeyDown={onTabKey} data-testid="pf-tabs">
      {TABS.map((t, i) => <button key={t} type="button" role="tab" id={`pf-tab-${i}`} aria-controls={`pf-panel-${i}`} aria-selected={tab === i} tabIndex={tab === i ? 0 : -1} className={`pf2-tab${tab === i ? ' on' : ''}`} data-testid={`pf-tab-${i}`} onClick={() => setTab(i)}>
        {t}{counts[i] != null && <span className="pf2-count">{counts[i]!.toLocaleString()}</span>}</button>)}
    </div>
    <div role="tabpanel" id={`pf-panel-${tab}`} aria-labelledby={`pf-tab-${tab}`} className="pf2-panel" data-testid="pf-panel" tabIndex={0}>
      {tab === 0 && <JobGrid pages={work} toolName={toolName} empty={<Empty mood="happy" title="Your first creation lands here" line="Make a picture, a clip or a song. Every finished result shows up on this page, newest first."
        acts={<><Link to={IMAGE_PAGE} className="btn btn-primary">Make an image</Link><Link to={VIDEO_PAGE} className="btn">Make a video</Link></>} />} />}
      {tab === 1 && <JobGrid pages={liked} toolName={toolName} empty={<Empty mood="smile" title="Heart the ones you love" line="Tap the heart on any result and it’s kept here, one click away."
        acts={<Link to="/assets" className="btn btn-primary">Open Assets</Link>} />} />}
      {tab === 2 && (looks == null ? <Loading /> : looks.length ? <div className="pf2-grid" data-testid="pf-looks">{looks.map(l => <Link key={l.id} to={`/workflows/${encodeURIComponent(l.workflow)}/looks/${encodeURIComponent(l.id)}`} className="pf2-tile pf2-look" aria-label={`${l.name}${l.modelName ? `, made on ${l.modelName}` : ''}`}>
          <img src={gridSrc(l.exampleUrl, 300)} alt="" loading="lazy" /><span className="pf2-cap"><b>{l.name}</b>{l.modelName && <small>{l.modelName}</small>}</span></Link>)}</div>
        : <Empty mood="wink" title="Save a look you like" line="Found a style that works? Save it from any result and use it again in one click." acts={<Link to="/workflows" className="btn btn-primary">Browse workflows</Link>} />)}
      {tab === 3 && (projects == null ? <Loading /> : projects.length ? <div className="pf2-projects" data-testid="pf-projects">{projects.map(pr => <Link key={pr.id} to={`/assets?section=Projects&project=${encodeURIComponent(pr.id)}`} className="pf2-proj">
          <span className="pf2-proj-ic" aria-hidden><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg></span>
          <span className="pf2-proj-t"><b title={pr.name}>{pr.name}</b><small className="helper">{(pr.count ?? 0).toLocaleString()} item{pr.count === 1 ? '' : 's'}</small></span></Link>)}</div>
        : <Empty mood="calm" title="Start a project" line="Group results by idea, client or story, and keep each one tidy." acts={<Link to="/assets?section=Projects" className="btn btn-primary">Start a project</Link>} />)}
    </div>
    {editing && <EditProfile profile={p} onClose={() => setEditing(false)} />}
  </div>;
}

function Stat({ k, v, sub, wide }: { k: string; v: string | null; sub?: string; wide?: boolean }) {
  return <article className={`pf2-stat${wide ? ' wide' : ''}`} aria-busy={v == null}><small>{k}</small><b title={v ?? undefined}>{v ?? <span className="pf2-sk" />}</b>{sub ? <span className="helper">{sub}</span> : null}</article>;
}
const Loading = () => <div className="pf2-grid" aria-busy="true" aria-label="Loading">{Array.from({ length: 8 }, (_, i) => <span key={i} className="pf2-tile pf2-sk-tile" />)}</div>;
function Empty({ mood, title, line, acts }: { mood: AvatarChoice['mood']; title: string; line: string; acts: React.ReactNode }) {
  return <div className="pf2-empty" data-testid="pf-empty"><Bean mood={mood} tint="orange" size={72} /><h2>{title}</h2><p className="helper">{line}</p><div className="row">{acts}</div></div>;
}

function JobGrid({ pages, toolName, empty }: { pages: ReturnType<typeof useJobPages>; toolName: (id: string) => string; empty: React.ReactNode }) {
  useFavourites(); const end = useRef<HTMLDivElement>(null); const more = pages.more;
  useEffect(() => { const el = end.current; if (!el || !more) return; const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) more(); }, { rootMargin: '600px' }); io.observe(el); return () => io.disconnect(); }, [more]);
  if (!pages.items.length && pages.busy) return <Loading />;
  if (!pages.items.length && pages.err) return <Notice kind="error" className="pf2-err" title="Couldn’t load your work" action={{ label: 'Retry', onClick: () => void pages.retry() }}>The app didn’t answer. Check that it’s still running.</Notice>;
  if (!pages.items.length) return <>{empty}</>;
  return <><div className="pf2-grid" data-testid="pf-grid">{pages.items.map(j => { const th = thumbOf(j); const vid = !!j.resultUrl && !isImg(j.resultUrl) && !isAudio(j.resultUrl);
    return <Link key={j.id} to={`/jobs/${j.id}`} className="pf2-tile" data-testid={`pf-tile-${j.id}`} aria-label={`${toolName(j.toolId)}, ${new Date(j.createdAt ?? 0).toLocaleDateString()}`}>
      {th ? <img src={th} alt="" loading="lazy" decoding="async" /> : <span className="pf2-audio" aria-hidden>♪</span>}
      {vid && <span className="pf2-play" aria-hidden><svg width="12" height="12" viewBox="0 0 14 14"><path d="M4 2.2v9.6L11.6 7z" fill="currentColor" /></svg></span>}
      {favOf(j) && <span className="pf2-fav" aria-hidden>♥</span>}</Link>; })}</div>
    <div ref={end} className="pf2-more">{pages.err ? <button type="button" className="btn btn-sm" onClick={pages.retry}>Couldn’t load more. Retry</button> : more ? <button type="button" className="btn btn-sm" disabled={pages.busy} onClick={more}>{pages.busy ? 'Loading…' : 'Show more'}</button>
      : pages.items.length > PAGE ? <span className="helper">That’s everything ({pages.items.length.toLocaleString()})</span> : null}</div></>;
}

/** Banner choices: four brand gradients, or one of your own finished pictures. A small dialog anchored under the button. */
function CoverPicker({ current, images, onPick, onClose }: { current: ProfileData['cover']; images: { id: string; url: string; at: number }[]; onPick: (c: ProfileData['cover']) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.querySelector<HTMLElement>('[aria-checked=true],[role=radio]')?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }; const d = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('.pf2-cover-btn')) onClose(); };
    addEventListener('keydown', k); addEventListener('mousedown', d); return () => { removeEventListener('keydown', k); removeEventListener('mousedown', d); }; }, []);
  const on = (c: NonNullable<ProfileData['cover']>) => current?.kind === c.kind && (c.kind === 'gradient' ? (current as any).id === c.id : (current as any).url === c.url);
  const anyOn = !!current && (current.kind === 'gradient' || images.some(j => (current as any).url === j.url));
  return <div ref={box} className="pf2-cover-pop" role="dialog" aria-label="Choose a cover" data-testid="pf-cover-pop">
    <h3>Cover</h3>
    <div role="radiogroup" aria-label="Colour covers" className="pf2-cover-row">{COVER_GRADIENTS.map((g, i) => { const c = { kind: 'gradient' as const, id: g }; const sel = on(c) || (!anyOn && !current && i === 0);
      return <button key={g} type="button" role="radio" aria-checked={sel} tabIndex={sel ? 0 : -1} className={`pf2-cover-sw pf2-cover-${g}`} data-testid={`pf-cover-${g}`} onClick={() => onPick(c)}><span>{COVER_NAMES[g]}</span></button>; })}</div>
    <h3>From your work</h3>
    {images.length ? <div role="radiogroup" aria-label="Your pictures" className="pf2-cover-imgs">{images.map((j, i) => { const c = { kind: 'image' as const, url: j.url }; const sel = on(c);
      return <button key={j.id} type="button" role="radio" aria-checked={sel} tabIndex={sel || (!anyOn && i === 0) ? 0 : -1} className="pf2-cover-img-btn" aria-label={`Your result from ${new Date(j.at).toLocaleDateString()}`} onClick={() => onPick(c)}><img src={gridSrc(j.url, 120)} alt="" loading="lazy" /></button>; })}</div>
      : <p className="helper">Make something and you can use it here.</p>}
  </div>;
}

/** Edit profile: name, @name and picture (a bean in a mood and colour, or your own photo cropped to a circle). */
function EditProfile({ profile, onClose }: { profile: ProfileData | null; onClose: () => void }) {
  const toast = useToast(); const box = useRef<HTMLDivElement>(null); const back = useRef<HTMLElement | null>(document.activeElement as HTMLElement); const file = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile?.displayName ?? ''); const [handle, setHandle] = useState(profile?.handle ?? '');
  const [bean, setBean] = useState<AvatarChoice>(avatarChoiceOf(profile?.avatar ?? DEFAULT_AVATAR));
  const [mode, setMode] = useState<'bean' | 'photo'>(profile?.avatarUrl ? 'photo' : 'bean');
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null); const [photoErr, setPhotoErr] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  const close = () => { onClose(); requestAnimationFrame(() => back.current?.focus?.()); };
  useEffect(() => { box.current?.querySelector<HTMLElement>('#pf-name-in')?.focus(); }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return; const f = [...(box.current?.querySelectorAll<HTMLElement>('input:not([type=file]),button:not([disabled]),[tabindex="0"]') ?? [])].filter(x => x.offsetParent !== null);
    const i = f.indexOf(document.activeElement as HTMLElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1]?.focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0]?.focus(); } };
  const pick = async (f: File | undefined) => { if (!f) return; setPhotoErr('');
    try { const blob = await cropToCircle(f); if (photo) URL.revokeObjectURL(photo.url); setPhoto({ blob, url: URL.createObjectURL(blob) }); setMode('photo'); }
    catch (e) { setPhotoErr(e instanceof PhotoError ? e.message : 'Couldn’t read that picture.'); } finally { if (file.current) file.current.value = ''; } };
  const h = handle.trim().replace(/^@/, ''); const handleBad = !!h && !HANDLE_RE.test(h); const nameBad = name.trim().length > NAME_MAX;
  const hasPhoto = !!photo || !!profile?.avatarUrl;
  const preview: ProfileData = { ...(profile ?? { displayName: null, handle: null, cover: null, createdAt: null }), avatar: bean, avatarUrl: mode === 'photo' ? photo?.url ?? profile?.avatarUrl ?? null : null } as ProfileData;
  const save = async () => { if (handleBad || nameBad) return; setBusy(true); setErr(null);
    try { if (mode === 'photo' && photo) await uploadAvatar(photo.blob);
      await saveProfile({ displayName: name.trim() || null, handle: h || null, avatar: bean, ...(mode === 'bean' || !hasPhoto ? { avatarUrl: null } : {}) });
      toast('Profile saved'); close(); }
    catch (e: any) { setErr({ field: e.field, msg: e.message }); } finally { setBusy(false); } };
  return createPortal(<div className="dlg-scrim" onMouseDown={e => e.target === e.currentTarget && close()} onKeyDown={onKey}>
    <div ref={box} className="dlg pf2-dlg" role="dialog" aria-modal="true" aria-labelledby="pf-dlg-t" data-testid="pf-dialog">
      <h2 id="pf-dlg-t" className="dlg-t">Edit profile</h2>
      <div className="pf2-dlg-top">
        <UserAvatar profile={preview} size={96} label="Preview of your picture" />
        <div className="pf2-dlg-fields">
          <label className="dlg-l" htmlFor="pf-name-in">Display name</label>
          <input id="pf-name-in" data-testid="pf-name-in" value={name} maxLength={NAME_MAX} placeholder="Your name" onChange={e => setName(e.target.value)} aria-invalid={nameBad || err?.field === 'displayName'} />
          <label className="dlg-l" htmlFor="pf-handle-in">Your @name</label>
          <div className="pf2-at"><span aria-hidden>@</span><input id="pf-handle-in" data-testid="pf-handle-in" value={handle} maxLength={31} placeholder="your-name" autoCapitalize="off" spellCheck={false} onChange={e => setHandle(e.target.value)} aria-invalid={handleBad || err?.field === 'handle'} aria-describedby="pf-handle-help" /></div>
          <small id="pf-handle-help" className={`helper${handleBad ? ' warn' : ''}`}>{handleBad ? '2–30 letters, digits, dots, dashes or underscores.' : 'A short local name for your page. Letters, digits, . - _'}</small>
        </div>
      </div>
      <div className="seg pf2-mode" role="radiogroup" aria-label="Picture">{(['bean', 'photo'] as const).map(m => <button key={m} type="button" role="radio" aria-checked={mode === m} tabIndex={mode === m ? 0 : -1} className={mode === m ? 'on' : ''} data-testid={`pf-mode-${m}`} onClick={() => setMode(m)}>{m === 'bean' ? 'SyteSim' : 'Your photo'}</button>)}</div>
      {mode === 'bean' ? <div className="pf2-picker" data-testid="pf-picker">
        <p className="dlg-l" id="pf-mood-l">Mood</p>
        <div role="radiogroup" aria-labelledby="pf-mood-l" className="pf2-moods">{AVATAR_MOODS.map(m => <button key={m} type="button" role="radio" aria-checked={bean.mood === m} tabIndex={bean.mood === m ? 0 : -1} className={`pf2-pick${bean.mood === m ? ' on' : ''}`} data-testid={`pf-mood-${m}`} onClick={() => setBean(b => ({ ...b, mood: m }))}>
          <Bean mood={m} tint={bean.tint} size={48} /><span>{MOOD_NAMES[m]}</span></button>)}</div>
        <p className="dlg-l" id="pf-tint-l">Colour</p>
        <div role="radiogroup" aria-labelledby="pf-tint-l" className="pf2-tints">{AVATAR_TINTS.map(t => <button key={t} type="button" role="radio" aria-checked={bean.tint === t} aria-label={TINTS[t].name} title={TINTS[t].name} tabIndex={bean.tint === t ? 0 : -1} className={`pf2-tint${bean.tint === t ? ' on' : ''}`} data-testid={`pf-tint-${t}`} style={{ background: `radial-gradient(circle at 35% 30%, ${TINTS[t].hi}, ${TINTS[t].mid} 55%, ${TINTS[t].lo})` }} onClick={() => setBean(b => ({ ...b, tint: t }))} />)}</div>
      </div> : <div className="pf2-photo" data-testid="pf-photo">
        <input ref={file} type="file" accept={IMAGE_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden data-picker-title="Choose a profile picture" data-testid="pf-file" onChange={e => void pick(e.target.files?.[0])} />
        <button type="button" className="btn" data-testid="pf-upload" onClick={() => file.current?.click()}>{hasPhoto ? 'Choose another photo' : 'Upload a photo'}</button>
        {hasPhoto && <button type="button" className="btn btn-ghost" data-testid="pf-remove-photo" onClick={() => { if (photo) URL.revokeObjectURL(photo.url); setPhoto(null); setMode('bean'); }}>Use SyteSim instead</button>}
        <p className="helper">PNG, JPG or WEBP. We crop it to a circle and keep a small 256 px copy on this computer.</p>
        {photoErr && <Notice kind="error" tone="line" testId="pf-photo-err">{photoErr}</Notice>}
      </div>}
      {err && <Notice kind="error" tone="line" className="pf2-dlg-err" testId="pf-save-err">{err.msg}</Notice>}
      <div className="dlg-a"><button type="button" className="btn btn-sm btn-ghost" onClick={close}>Cancel</button><button type="button" className="btn btn-sm btn-primary" data-testid="pf-save" disabled={busy || handleBad || nameBad} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>
    </div></div>, document.body);
}
