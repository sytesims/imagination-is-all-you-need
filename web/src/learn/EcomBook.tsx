/**
 * /learn/ai-ecommerce (2026-10-24): "AI for e-commerce", an interactive 3D pop-up book that teaches product pictures with this app's own tools.
 * Its own lazy chunk (platform/routeChunks.ts); three.js loads with it. Full screen over the app (a portal), one WebGL view (useLiveViewer).
 *  - Turn pages: the arrows, the chapter dots, ← / → keys, or a sideways drag on the book. Esc closes a note, stops the tour, then goes back to Explore.
 *  - Orange dots on each pop-up open a short note (and ease the camera in). Play tour: a captioned camera walk-through of the spread.
 *  - Try it: opens the matching tool with the chosen example prompt and a local model picked; nothing runs until Generate.
 *  - Reduced motion (system setting, or ?motion=reduce): no camera moves, no page bending, pieces simply appear. ?motion=slow plays every move 5x slower (screen recordings).
 *  - No WebGL (or another 3D view holds the slot): the same chapters as a flat, readable page.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, navigate } from '../platform/router';
import { useLiveViewer } from '../shared/model3d';
import { tip } from '../shared/Tooltip';
import { BOOK_SUBTITLE, BOOK_TITLE, CHAPTERS, tryHrefWith, tryToolName, type TourShot } from './ecomChapters';
import type { BookEngine } from './bookEngine';
import './ecomBook.css';

const wantsReduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).get('motion') === 'reduce'; } catch { return false; } };
const chapterParam = () => { const n = Number(new URLSearchParams(location.search).get('ch')); return Number.isInteger(n) && n >= 1 && n <= CHAPTERS.length ? n - 1 : null; };

export default function EcomBook() {
  const reduced = useMemo(wantsReduced, []);
  const granted = useLiveViewer('learn-ecom-book', true, 2);
  const canvas = useRef<HTMLCanvasElement>(null); const eng = useRef<BookEngine | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'flat'>('loading');
  const [spread, setSpread] = useState(-1); const [busy, setBusy] = useState(false);
  const [hs, setHs] = useState<string | null>(null); const [touring, setTouring] = useState(false); const [shot, setShot] = useState<{ i: number; s: TourShot } | null>(null);
  const [contents, setContents] = useState(false); const [pIdx, setPIdx] = useState(0); const [copied, setCopied] = useState(false); const [flatCh, setFlatCh] = useState(0);
  const hsEls = useRef(new Map<string, HTMLElement>());
  const ch = CHAPTERS[Math.max(0, spread)];

  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'; const t = document.title; document.title = `${BOOK_TITLE} · pop-up book`; return () => { document.body.style.overflow = prev; document.title = t; }; }, []);

  const go = useCallback(async (i: number) => {
    const e = eng.current; if (!e || e.busy || i === e.spread || i < -1 || i >= CHAPTERS.length) return;
    setHs(null); setTouring(false); setShot(null); setContents(false); setPIdx(0); setSpread(i); setBusy(true);
    try { await e.go(i); } finally { setBusy(false); setSpread(e.spread); }
    const q = new URLSearchParams(location.search); if (e.spread >= 0) q.set('ch', String(e.spread + 1)); else q.delete('ch'); history.replaceState(history.state, '', location.pathname + (q.toString() ? `?${q}` : ''));
  }, []);
  const turn = useCallback((d: 1 | -1) => { const e = eng.current; if (!e) return; const s = e.spread; if (s === -1 && d === 1) void go(chapterParam() ?? 0); else if (s === 0 && d === -1) void go(-1); else void go(s + d); }, [go]);

  // the 3D book (only while this page holds the one live WebGL slot)
  useEffect(() => {
    if (!granted || !canvas.current) return; let live = true; let made: BookEngine | null = null;
    (async () => {
      try {
        const { createBookEngine } = await import('./bookEngine');
        made = await createBookEngine(canvas.current!, { chapters: CHAPTERS, reduced, slow: new URLSearchParams(location.search).get('motion') === 'slow' ? 5 : 1, onSwipe: (d) => turn(d), onLost: (l) => { if (l) setState('flat'); } });
        if (!live) { made.dispose(); return; } eng.current = made; made.setHotspotEls(hsEls.current); setState('ready');
        const want = chapterParam(); if (want != null) void go(want);
      } catch { if (live) setState('flat'); }
    })();
    return () => { live = false; made?.dispose(); eng.current = null; };
  }, [granted]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!granted) { const t = setTimeout(() => setState((s) => (s === 'loading' ? 'flat' : s)), 1200); return () => clearTimeout(t); } }, [granted]);

  // hotspot notes ease the camera in; closing eases it back
  useEffect(() => { if (!touring) eng.current?.focus(hs); }, [hs]); // eslint-disable-line react-hooks/exhaustive-deps

  const playTour = () => { const e = eng.current; if (!e || busy || spread < 0) return; if (touring) { e.stopTour(); return; } setHs(null); setTouring(true);
    e.tour(ch.tour, (i, s) => setShot({ i, s }), () => { setTouring(false); setShot(null); }); };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey) return; const tag = (ev.target as HTMLElement)?.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (ev.key === 'Escape') { ev.preventDefault(); if (hs) setHs(null); else if (touring) eng.current?.stopTour(); else if (contents) setContents(false); else navigate('/'); return; }
      if (state !== 'ready') return;
      if (ev.key === 'ArrowRight' || ev.key === 'PageDown') { ev.preventDefault(); turn(1); }
      else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') { ev.preventDefault(); turn(-1); }
      else if (ev.key === 'Home') { ev.preventDefault(); void go(0); }
      else if (ev.key === 'End') { ev.preventDefault(); void go(CHAPTERS.length - 1); }
    };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [hs, touring, contents, state, turn, go]);

  const copy = async () => { try { await navigator.clipboard.writeText(ch.prompts[pIdx]); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* clipboard blocked */ } };
  const open = spread >= 0; const flat = state === 'flat';
  const fc = CHAPTERS[flatCh];

  return createPortal(<div className={`eb${reduced ? ' eb-reduced' : ''}${open ? ' eb-open' : ''}${flat ? ' eb-isflat' : ''}`} role="dialog" aria-modal="true" aria-label={`${BOOK_TITLE}: ${BOOK_SUBTITLE}`} data-testid="ecom-book" data-busy={busy || state === 'loading' ? '1' : '0'} data-spread={spread}>
    <header className="eb-top">
      <Link to="/" className="eb-back" {...tip('Back to Explore (Esc)')}><svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>Explore</Link>
      <div className="eb-title"><span className="eb-kick">Learn</span><b>{BOOK_TITLE}</b><span className="eb-sub">{open && !flat ? `Chapter ${ch.n} of ${CHAPTERS.length} · ${ch.title}` : BOOK_SUBTITLE}</span></div>
      <div className="eb-tools">
        {!flat && open && <button type="button" className={`eb-btn${touring ? ' on' : ''}`} onClick={playTour} disabled={busy} aria-pressed={touring} data-testid="eb-tour">
          {touring ? <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg> : <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>}
          {touring ? 'Stop tour' : 'Play tour'}</button>}
        {!flat && <button type="button" className={`eb-btn${contents ? ' on' : ''}`} onClick={() => setContents((c) => !c)} aria-expanded={contents} aria-controls="eb-contents" data-testid="eb-contents-btn">
          <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>Contents</button>}
      </div>
    </header>

    {!flat && <div className="eb-stage">
      <canvas ref={canvas} className="eb-canvas" aria-hidden />
      {state === 'loading' && <div className="eb-loading" role="status"><span className="eb-spin" aria-hidden />Opening the book…</div>}
      {open && <div className="eb-hss">{ch.hotspots.map((h, k) => <div key={`${ch.id}-${h.id}`} className={`eb-hs${hs === h.id ? ' open' : ''}${shot?.s.at === h.id ? ' lit' : ''}`} data-on="0"
        ref={(el) => { if (el) hsEls.current.set(h.id, el); else hsEls.current.delete(h.id); eng.current?.setHotspotEls(hsEls.current); }}>
        <button type="button" className="eb-dot" aria-expanded={hs === h.id} aria-label={`${h.label}: open the note`} onClick={() => setHs((c) => (c === h.id ? null : h.id))} data-testid={`eb-hs-${h.id}`}><span>{k + 1}</span></button>
        {hs === h.id && <div className="eb-note" role="note"><b>{h.label}</b><p>{h.text}</p><button type="button" className="eb-x" aria-label="Close the note" onClick={() => setHs(null)}>×</button></div>}
      </div>)}</div>}
      {shot && <div className="eb-caption" aria-live="polite"><span className="eb-cap-n">{shot.i + 1} / {ch.tour.length}</span>{shot.s.caption}</div>}
      {!open && state === 'ready' && !busy && <div className="eb-cta"><button type="button" className="btn btn-primary eb-openbtn" onClick={() => turn(1)} data-testid="eb-open" autoFocus>Open the book</button>
        <span>{CHAPTERS.length} chapters · about 15 minutes · example prompts that run free on local models</span></div>}
      <button type="button" className="eb-edge eb-edge-l" onClick={() => turn(-1)} disabled={!open || busy} aria-label="Previous page" {...tip('Previous page (←)')}><svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg></button>
      <button type="button" className="eb-edge eb-edge-r" onClick={() => turn(1)} disabled={busy || spread >= CHAPTERS.length - 1 || state !== 'ready'} aria-label={open ? 'Next page' : 'Open the book'} {...tip(open ? 'Next page (→)' : 'Open the book (→)')}><svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg></button>
    </div>}

    {!flat && open && <footer className="eb-bar" data-testid="eb-bar">
      <nav className="eb-dots" aria-label="Chapters">{CHAPTERS.map((c, i) => <button key={c.id} type="button" className={i === spread ? 'on' : ''} aria-current={i === spread ? 'page' : undefined} aria-label={`Chapter ${c.n}: ${c.title}`} onClick={() => void go(i)} {...tip(`${c.n}. ${c.title}`)}>{c.n}</button>)}</nav>
      <div className="eb-trywrap"><p className="eb-ptext" data-testid="eb-ptext">“{ch.prompts[pIdx]}”</p><div className="eb-try">
        <span className="eb-try-l">Try it</span>
        <div className="eb-seg" role="radiogroup" aria-label="Example prompt">{ch.prompts.map((p, i) => <button key={i} type="button" role="radio" aria-checked={i === pIdx} className={i === pIdx ? 'on' : ''} onClick={() => setPIdx(i)} aria-label={`Prompt ${i + 1}: ${p}`}>Prompt {i + 1}</button>)}</div>
        <button type="button" className="eb-btn eb-copy" onClick={copy} {...tip('Copy this prompt')}>{copied ? 'Copied' : 'Copy'}</button>
        <Link to={tryHrefWith(ch, pIdx)} className="btn btn-primary eb-go" data-testid="eb-try">{ch.tryIt.label}<span className="eb-go-in"> in {tryToolName(ch.tryIt.base)}</span><svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></Link>
      </div></div>
      <div className="eb-more">{ch.more?.map((m) => <Link key={m.to} to={m.to} className="eb-morelink">{m.label}</Link>)}<span className="eb-safe">Nothing runs until you press Generate.</span></div>
    </footer>}

    {contents && !flat && <aside id="eb-contents" className="eb-contents" aria-label="Contents">
      <h2>Contents</h2><ol>{CHAPTERS.map((c, i) => <li key={c.id}><button type="button" className={i === spread ? 'on' : ''} onClick={() => void go(i)}><span className="eb-cn">{c.n}</span><span><b>{c.title}</b><small>{c.kicker} · {c.cost.local}</small></span></button></li>)}</ol>
      <p className="eb-cnote">Pictures, prompts and costs are examples. Models on your computer are free. Cloud prices show before you generate.</p>
    </aside>}

    {/* the chapters as text: for screen readers, and the flat page when 3D can't run */}
    <article className={flat ? 'eb-flat' : 'sr-only-vis'} aria-live={flat ? undefined : 'polite'}>
      {flat ? <>
        <nav className="eb-flat-nav" aria-label="Chapters">{CHAPTERS.map((c, i) => <button key={c.id} type="button" className={i === flatCh ? 'on' : ''} onClick={() => setFlatCh(i)}>{c.n}. {c.title}</button>)}</nav>
        <FlatChapter c={fc} /><p className="eb-flat-why">{granted ? 'This browser could not start the 3D view, so the book is shown flat.' : 'Another 3D view is open, so the book is shown flat. Close it to see the pop-ups.'}</p>
      </> : open ? <FlatChapter c={ch} /> : <p>{BOOK_TITLE}: {BOOK_SUBTITLE}. Press Open the book.</p>}
    </article>
  </div>, document.body);
}

function FlatChapter({ c }: { c: (typeof CHAPTERS)[number] }) {
  return <section className="eb-fc"><span className="eb-fk">Chapter {c.n} · {c.kicker}</span><h2>{c.title}</h2>{c.lesson.map((p, i) => <p key={i}>{p}</p>)}
    <h3>Try these prompts</h3><ol>{c.prompts.map((p, i) => <li key={i}><span>{p}</span> <Link to={tryHrefWith(c, i)} className="eb-fl-try">Try it in {tryToolName(c.tryIt.base)}</Link></li>)}</ol>
    <h3>Why it works</h3><p className="eb-fwhy">{c.why}</p>
    <p className="eb-fcost">Your computer: {c.cost.local} · Cloud: {c.cost.cloud} · Time: {c.cost.time}</p>
    <h3>The parts</h3><dl>{c.hotspots.map((h) => <div key={h.id}><dt>{h.label}</dt><dd>{h.text}</dd></div>)}</dl></section>;
}
