/**
 * Film (2026-10-27): a top-nav tab after Canvas. /film lists your films; /film/:id is one film as a row of shot cards (start still → clip →
 * takes), Continue / Bridge / Add between cards, a trim per card, audio lanes and a free Stitch at the end (FilmEditor). Data: /api/films
 * (server). The workflow is the film-making and video-pacing skills'. /film?sample=<name> opens that sample once
 * (once linked from Explore; the Editor tab is hidden since 2026-11-01, the page still opens by URL); a sample that isn't on this computer leaves the plain list. Its own lazy chunk (platform/routeChunks.ts).
 */
import { useEffect, useRef, useState } from 'react';
import type { ToolInfo } from '../../api';
import { Link, navigate, usePath } from '../../platform/router';
import { useToast } from '../../shared/Toast';
import { askConfirm } from '../../shared/Dialog';
import { PlusIcon, TrashIcon } from '../Icons';
import { tip } from '../../shared/Tooltip';
import { listFilms, createFilm, deleteFilm, listSamples, openSample, branded } from './filmApi';
import { STUDIO } from './filmLogic';
import type { FilmSummary, FilmSample } from './types';
import { FilmStart } from './FilmStart';
import FilmEditor from './FilmEditor';
import './film.css';

export const FILM_PATH = /^\/film(?:\/([^/]+))?\/?$/;
export default function FilmPage({ tools }: { tools: ToolInfo[] }) {
  const path = usePath(); const id = FILM_PATH.exec(path)?.[1];
  return id ? <FilmEditor key={id} id={decodeURIComponent(id)} tools={tools} /> : <FilmList />;
}

const ago = (t: number) => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' }); };

function FilmList() {
  const [films, setFilms] = useState<FilmSummary[] | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const toast = useToast();
  const load = () => listFilms().then(f => { setFilms(f); setErr(null); }).catch(e => setErr(String(e?.message ?? e)));
  const [samples, setSamples] = useState<FilmSample[]>([]);
  useEffect(() => { void load(); listSamples().then(setSamples).catch(() => undefined); }, []);
  const sample = async (x: FilmSample) => { setBusy(true); try { const f = await branded(await openSample(x.name)); navigate(`/film/${encodeURIComponent(f.id)}`); } catch (e: any) { toast(`Couldn’t open that sample. ${e?.message ?? ''}`.trim(), 'error'); } finally { setBusy(false); } };
  const ready = samples.filter(x => x.available);
  /* ?sample=<name>: open it once, then drop the query (Back returns to the plain list) */
  const asked = useRef(new URLSearchParams(location.search).get('sample'));
  useEffect(() => {
    const want = asked.current; if (!want || !samples.length) return; asked.current = null;
    const x = samples.find(s => s.name === want && s.available); navigate('/film', { replace: true }); if (x) void sample(x);
  }, [samples]); // eslint-disable-line react-hooks/exhaustive-deps
  const make = async () => { setBusy(true); try { const f = await branded(await createFilm('Untitled film')); navigate(`/film/${encodeURIComponent(f.id)}`); } catch (e: any) { toast(`Couldn’t start a film. ${e?.message ?? ''}`.trim(), 'error'); } finally { setBusy(false); } };
  const drop = async (f: FilmSummary) => { if (!await askConfirm({ title: `Delete “${f.title}”?`, body: 'The film and its card order go. Your clips stay in Assets.', confirm: 'Delete', danger: true })) return;
    try { await deleteFilm(f.id); setFilms(xs => xs?.filter(x => x.id !== f.id) ?? xs); } catch (e: any) { toast(`Couldn’t delete it. ${e?.message ?? ''}`.trim(), 'error'); } };
  return <div className="fm-page fm-list" data-testid="film-list">
    <header className="fm-list-h">
      <div><span className="fm-studio" data-testid="film-studio"><i aria-hidden />{STUDIO}</span><h1 className="fm-h1">Editor</h1><p className="fm-lead">Make a film, shot by shot. Every clip shows its price before it runs.</p></div>
      <div className="fm-list-acts">
        {!!films?.length && ready.map(x => <button key={x.name} type="button" className="btn btn-ghost" onClick={() => void sample(x)} disabled={busy} data-testid={`film-sample-${x.name}`} {...tip(x.note ?? 'A finished example to open, change and stitch')}>Open “{x.title}”</button>)}
        <button type="button" className="btn fm-new" onClick={() => void make()} disabled={busy} data-testid="film-new"><PlusIcon size={16} />New film</button>
      </div>
    </header>
    {err ? <p className="fm-empty" role="alert">Couldn’t load your films. <button type="button" className="fm-link" onClick={() => void load()}>Try again</button></p>
      : films == null ? <div className="fm-grid" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="fm-fcard fm-skel" />)}</div>
      : !films.length ? <div className="fm-empty-start" data-testid="film-empty"><p className="fm-start-lead"><b>Your films will show up here.</b> {ready.length ? 'Start from the sample to see how one comes together, or begin with a blank film.' : 'Start with a blank film and add your first shot.'}</p>
          <FilmStart samples={samples} busy={busy} onSample={x => void sample(x)} onBlank={() => void make()} /></div>
      : <ul className="fm-grid">{films.map(f => <li key={f.id} className="fm-fcard" data-testid={`film-card-${f.id}`}>
          <Link to={`/film/${encodeURIComponent(f.id)}`} className="fm-fcard-a">
            <span className="fm-poster">{f.posterUrl ? <img src={f.posterUrl} alt="" loading="lazy" /> : <span className="fm-poster-ph" aria-hidden>Film</span>}</span>
            <span className="fm-fcard-t">{f.title || 'Untitled film'}</span>
            <span className="fm-fcard-m">{f.shotCount} {f.shotCount === 1 ? 'card' : 'cards'} · {f.aspect} · {ago(f.updatedAt)}{f.sample ? ' · sample' : ''}</span>
          </Link>
          <button type="button" className="fm-icon-btn fm-fcard-del" aria-label={`Delete ${f.title}`} onClick={() => void drop(f)}><TrashIcon size={15} /></button>
        </li>)}</ul>}
  </div>;
}
