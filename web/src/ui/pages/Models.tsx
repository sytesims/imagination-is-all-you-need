import { useEffect, useState, type KeyboardEvent, type MouseEvent as RMouseEvent } from 'react';
import { useHoverIntent, touchUi } from '../../shared/hoverIntent';
import type { ToolInfo } from '../../api';
import { Link } from '../../platform/router';
import { fetchMenuModels, type ModelGroup } from '../../shared/batch1';
import { MakerTile } from '../../shared/MakerTile';
import { ModelInfoCard, ModelInfoSheet, type InfoTarget } from '../../shared/ModelInfoCard';
import { placeNeed } from '../../shared/ModelHoverCard';
import { useBilling, modeOf } from '../../shared/billing';
import { mediaOf } from './Live';
import { mediaModelEntries, modelKind, type ModelEntry } from '../Shell';
import type { Medium } from '../headerMenus';
import { useTabs } from './Page';
import { LOCAL_LABEL } from '../../../../server/src/shared/modelIds';
/**
 * Models (header menus' "See all models", 2026-10-23): every model this app can run for one medium, in the pickers' order and sections
 * (Featured, API models, Local). Each row opens the tool that runs it with that model picked. Licences stay on /licenses.
 * ?media=image|video|audio|3d picks the tab (kept in the URL).
 * 2026-10-25: a 3D tab (the 3D page's models and its in-browser tools); coming-soon models greyed with the reason; Local models that still
 * need a download say so; hovering or focusing a row (tapping, on phones) opens the model card (shared/ModelInfoCard.tsx).
 */
const MEDIA: [Medium, string][] = [['image', 'Image'], ['video', 'Video'], ['audio', 'Audio'], ['3d', '3D']];
const SECTION_LABEL = ['Featured', 'API models', LOCAL_LABEL];
const mediaFromUrl = (): number => Math.max(0, MEDIA.findIndex(([m]) => m === new URLSearchParams(location.search).get('media')));

/** The status a row shows: why a greyed model can't run yet, or the one-time download a Local model still needs. */
function rowStatus(e: ModelEntry): { text: string; kind: 'soon' | 'download' } | null {
  if (e.soon) return { text: e.model?.state === 'unavailable' ? 'Not available here' : 'Coming soon', kind: 'soon' };
  const local = e.model?.runsOn.find(r => r.id === 'local');
  if (e.sec === 2 && local?.action?.kind === 'download') return { text: placeNeed(local).text, kind: 'download' };
  return null;
}

export default function Models({ tools }: { tools: ToolInfo[] }) {
  const [groups, setGroups] = useState<ModelGroup[]>([]);
  useEffect(() => { fetchMenuModels().then(d => setGroups(d.groups)).catch(() => undefined); }, []);
  const [ti, setTi, onKey] = useTabs(MEDIA.map(([, l]) => l), mediaFromUrl());
  const media = MEDIA[ti]?.[0] ?? 'image';
  useEffect(() => { const u = new URL(location.href); u.searchParams.set('media', media); if (u.href !== location.href) history.replaceState(history.state, '', u.pathname + u.search + u.hash); }, [media]);
  /* 3D: the 3D page's own tools (Turntable, Direct a Shot, Render) are not separate header entries (listed: false) but their models belong here */
  const of = (m: Medium) => mediaModelEntries(m, tools.filter(t => (mediaOf(t) as string) === m && (m === '3d' || (t as any).listed !== false)), groups, { withSoon: true });
  const list = of(media);
  const bill = useBilling(); const own = modeOf(bill) !== 'team';

  // ---- the card: hover (with a small delay, so moving across rows doesn't flicker), keyboard focus, tap on phones ----
  // (shared/hoverIntent.ts: the same hover-intent rule as the model menu's preview card; phones: a tap opens the sheet instead)
  const rows = () => [...document.querySelectorAll<HTMLElement>('[data-testid="mdp-row"]')];
  const hi = useHoverIntent<ModelEntry>({ same: (a, b) => a.key === b.key, next: el => { const all = rows(); return all[all.indexOf(el) + 1]; } });
  const hov = hi.cur ? { e: hi.cur.t, el: hi.cur.el } : null; const [sheet, setSheet] = useState<ModelEntry | null>(null);
  const show = (e: ModelEntry, el: HTMLElement, now = false) => hi.enter(e, el, now);
  useEffect(() => { hi.hide(); setSheet(null); }, [media]);
  useEffect(() => { const p = document.querySelector<HTMLElement>(`[data-testid="mdp-tab-${media}"]`); const row = p?.parentElement; if (p && row && row.scrollWidth > row.clientWidth) row.scrollTo({ left: p.offsetLeft - row.offsetLeft - 16 }); }, [media, tools.length]); // phones: the tab strip scrolls; keep the picked tab in view
  const cardId = 'mdp-card';
  const target = (e: ModelEntry): InfoTarget => ({ key: e.key, title: e.title, maker: e.maker, makerName: e.makerName, medium: media, to: e.to, m: e.model, tool: e.tool, soon: e.soon, open: e.open });
  /* Tab from a row with its card open goes into the card (links, Open); Tab past the card's last item goes on to the next row; Esc closes it */
  const rowKey = (ev: KeyboardEvent<HTMLAnchorElement>) => { if (ev.key === 'Escape') { hi.hide(); return; } hi.rowKeyDown(ev); };
  const tap = (e: ModelEntry) => (ev: RMouseEvent) => { if (!touchUi()) { if (e.soon) ev.preventDefault(); return; } ev.preventDefault(); setSheet(e); };

  return <div className="xpage mdp" data-testid="models-page">
    <header className="xpage-head"><span className="eyebrow">Models</span><h1>Models</h1>
      <p className="lede">Every model in the app. Cloud models bill your account; open models run free on your computer. Hover or tap one to learn more.</p></header>
    <div className="pills mdp-tabs" role="tablist" aria-label="Medium" onKeyDown={onKey}>
      {MEDIA.map(([m, l], n) => <button key={m} type="button" role="tab" aria-selected={media === m} tabIndex={media === m ? 0 : -1} className={`pill ${media === m ? 'on' : ''}`} data-testid={`mdp-tab-${m}`} onClick={() => setTi(n)}>
        {l}<span className="mdp-n">{tools.length ? of(m).length : ''}</span></button>)}
    </div>
    {!tools.length ? <div className="mdp-grid" aria-label="Loading models">{[0, 1, 2, 3].map(n => <div key={n} className="mdp-row shimmer" aria-hidden />)}</div>
      : !list.length ? <p className="helper">No {media === '3d' ? '3D' : media} models are listed yet.</p>
      : SECTION_LABEL.map((label, sec) => { const rs = list.filter(e => e.sec === sec); return rs.length ? <section key={label} className="mdp-sec" data-testid={`mdp-sec-${sec}`} role="tabpanel" aria-label={label}>
        <h2 className="mdp-h">{label}<span className="mdp-n">{rs.length}</span></h2>
        <div className="mdp-grid">{rs.map(e => { const k = modelKind(e); const st = rowStatus(e); const on = hov?.e.key === e.key;
          return <Link key={e.key} to={e.to} className={`mdp-row${e.soon ? ' off' : ''}${on ? ' hov' : ''}`} data-testid="mdp-row" data-model-key={e.key} data-maker={e.maker ?? undefined}
            aria-describedby={on ? cardId : undefined} aria-disabled={e.soon ? true : undefined} title={e.soon ? `${st?.text} · ${e.soon}` : undefined}
            onMouseEnter={ev => show(e, ev.currentTarget)} onMouseLeave={hi.leave} onFocus={ev => show(e, ev.currentTarget, true)} onBlur={() => hi.leave()} onKeyDown={rowKey} onClick={tap(e)}>
            <MakerTile maker={e.maker} makerName={e.makerName} fallback={e.title} medium={media} />
            <span className="mdp-txt"><b><span className="mdp-nm">{e.title}</span>{e.isNew && <span className="nb nb-new">New</span>}</b>
              <small>{k && <em className={`hm-kind k-${k.split(' ')[0].toLowerCase()}`}>{k}</em>}{e.desc}</small>
              {st && <span className={`mdp-st mdp-st-${st.kind}`} data-testid={`mdp-st-${st.kind}`}>{st.text}</span>}</span></Link>; })}</div>
      </section> : null; })}
    <p className="helper mdp-foot">Licences and credit lines for every model: <Link to="/licenses">Models &amp; licences</Link></p>
    {hov && <ModelInfoCard id={cardId} t={target(hov.e)} own={own} anchor={hov.el} hover={hi.cardProps} />}
    {sheet && <ModelInfoSheet t={target(sheet)} own={own} onClose={() => setSheet(null)} />}
  </div>;
}
