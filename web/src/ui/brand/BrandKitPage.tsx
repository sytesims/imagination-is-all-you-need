/**
 * Assets › Brands (2026-10-27; the brand board 2026-10-31): your brand profiles. The page opens on a list of brands, each shown the way it
 * looks (its logo on its own background, its icon, a palette strip, "Aa" in its heading font), with a menu (Use, Edit, Duplicate, Export,
 * Delete) and a "+ New brand" card (from a logo, from words, or blank). A card opens that brand's board (?brand=<id>): tiles for Logos (main,
 * light, dark, icon), Colours, Fonts (real font files, BrandPanels), Mood and rules, and Examples; click a tile to edit it in the side panel.
 * Voice, Products and Import are labelled "Coming next" and do nothing yet. One brand is active: "Brand: <name>" in the Image, Video and
 * Audio bars uses it. Export: one menu grouped by app (BrandExportMenu). Our own brand (Imagination) is always first and read-only.
 * Text edits save on their own (PATCH /api/brand-kits/:id, 600 ms after the last change; the API keeps its first name, brand kits).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { askConfirm } from '../../shared/Dialog';
import { useToast } from '../../shared/Toast';
import { tip } from '../../shared/Tooltip';
import { Popover } from '../../shared/Popover';
import { MoreIcon } from '../Icons';
import { loadBrandKits, putKit, setActiveKit, useBrand } from '../../shared/brandStore';
import { cssFamily } from '../../shared/brandFonts';
import * as BK from '../../../../server/src/shared/brandKit';
import type { BrandKit } from '../../../../server/src/shared/brandKit';
import { saveFile } from './brandCanvas';
import { BrandExportMenu } from './BrandExportMenu';
import { ColoursPanel, ExamplesPanel, FontsPanel, LogosPanel, MoodPanel, api, cap, fontSource, inkOn, roleHex, slotBg, type PanelProps } from './BrandPanels';
import './brandKit.css';

type Save = 'idle' | 'saving' | 'saved' | 'error';
/** ?brand=<id> (old links: ?kit=) is the open board; none = the list. ?new=1 opens the New brand menu (the bar chip's "+ New brand"). */
const brandOfUrl = () => { const q = new URLSearchParams(location.search); return q.get('brand') ?? q.get('kit') ?? ''; };
const setBrandUrl = (id: string) => { const q = new URLSearchParams(location.search); q.delete('kit'); q.delete('new'); if (id) q.set('brand', id); else q.delete('brand'); const u = `${location.pathname}${q.toString() ? `?${q}` : ''}`; if (u !== location.pathname + location.search) history.pushState({ ...(history.state ?? {}), inApp: true }, '', u); };
/** The tokens file of a brand (the card menu's Export). */
const exportTokens = (k: BrandKit) => saveFile(JSON.stringify(BK.tokensOf(k), null, 2) + '\n', `${BK.kitSlug(k.name)}.tokens.json`);

export default function BrandKitPage() {
  const s = useBrand(); const toast = useToast();
  const [openId, setOpenId] = useState(brandOfUrl); const [autoLogo, setAutoLogo] = useState('');
  useEffect(() => { const f = () => setOpenId(brandOfUrl()); addEventListener('popstate', f); return () => removeEventListener('popstate', f); }, []);
  const open = (id: string) => { setBrandUrl(id); setOpenId(id); window.scrollTo(0, 0); };
  const sel = openId ? s.kits.find(k => k.id === openId) : undefined;
  useEffect(() => { if (s.loaded && openId && !sel) { setBrandUrl(''); setOpenId(''); } }, [s.loaded, openId, sel]);
  const [busy, setBusy] = useState('');

  const create = async (body: Record<string, unknown>) => {
    setBusy('new'); try { const k = await api('POST', '/api/brand-kits', body); putKit(k); open(k.id); return k as BrandKit; } catch (e: any) { toast(e.message, 'warn'); return null; } finally { setBusy(''); }
  };
  const uniqueName = (base: string) => { let n = base, i = 2; while (s.kits.some(k => k.name.toLowerCase() === n.toLowerCase())) n = `${base} ${i++}`; return n; };
  const duplicate = async (k: BrandKit) => { const c = await create({ from: k.id, name: uniqueName(`${k.name} copy`) }); if (c) toast(`Made “${c.name}”. It’s yours to edit.`); };
  const use = (k: BrandKit) => setActiveKit(k.id).then(() => toast(`Brand now uses “${k.name}”.`)).catch(e => toast(e.message, 'warn'));
  const remove = async (k: BrandKit) => {
    if (!(await askConfirm({ title: `Delete “${k.name}”?`, body: k.id === s.activeId ? 'It’s your active brand, so Brand switches to Imagination. Results you made with it stay as they are.' : 'Results you made with it stay as they are.', confirm: 'Delete brand', danger: true }))) return false;
    try { const r = await api('DELETE', `/api/brand-kits/${k.id}`); putKit(null, k.id, r.activeId); toast(`Deleted “${k.name}”.`); return true; } catch (e: any) { toast(e.message, 'warn'); return false; } };
  const newBrand = async (how: 'logo' | 'blank' | { words: string }) => {
    if (typeof how === 'object') { try { const r = await api('POST', '/api/brand-kits/from-words', { words: how.words }); const k = await create({ name: uniqueName(cap(how.words.split(/[,\s]+/).filter(Boolean).slice(0, 2).join(' ')) || 'My brand'), colors: r.colors, mood: r.mood }); if (k) toast(`Made “${k.name}” from your words. Edit anything you like.`); } catch (e: any) { toast(e.message, 'warn'); } return; }
    const k = await create({ name: uniqueName('My brand') }); if (k && how === 'logo') setAutoLogo(k.id);
  };

  if (!s.loaded) return <div className="bk-page" data-testid="bk-page"><p className="helper">Loading your brands…</p></div>;
  if (s.error && !s.kits.length) return <div className="bk-page" data-testid="bk-page"><p className="helper" role="alert">Couldn’t load your brands. <button type="button" className="btn btn-sm" onClick={() => loadBrandKits(true)}>Retry</button></p></div>;
  if (sel) return <div className="bk-page" data-testid="bk-page">
    <BrandBoard key={sel.id} kit={sel} active={sel.id === s.activeId} fonts={s.fonts} autoLogo={autoLogo === sel.id} onBack={() => open('')} onUse={() => use(sel)}
      onDuplicate={() => duplicate(sel)} onDelete={async () => { if (await remove(sel)) open(''); }} />
  </div>;
  return (
    <div className="bk-page" data-testid="bk-page">
      <ul className="bk-grid-cards" aria-label="Your brands" data-testid="bk-grid">
        {s.kits.map(k => <li key={k.id}><BrandCard kit={k} active={k.id === s.activeId} onOpen={() => open(k.id)} onUse={() => use(k)} onDuplicate={() => duplicate(k)} onExport={() => exportTokens(k)} onDelete={() => remove(k)} /></li>)}
        <li><NewBrandCard busy={busy === 'new'} startOpen={new URLSearchParams(location.search).has('new')} onPick={newBrand} /></li>
      </ul>
    </div>
  );
}

/** One brand in the list, the way it looks: main logo on its background (its icon in the corner), palette strip, "Aa" in its heading font. */
function BrandCard({ kit, active, onOpen, onUse, onDuplicate, onExport, onDelete }: { kit: BrandKit; active: boolean; onOpen: () => void; onUse: () => void; onDuplicate: () => void; onExport: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false); const btn = useRef<HTMLButtonElement>(null);
  const run = (f: () => void) => () => { setMenu(false); f(); };
  const bg = roleHex(kit, 'background') ?? kit.colors[0]?.hex ?? '#1A1A1C'; const main = BK.logoForBackground(kit, BK.luminance(BK.normHex(bg) ?? '#1A1A1C'));
  const fonts = [kit.fonts.heading, kit.fonts.body].filter(Boolean);
  return <div className={`bk-bcard${active ? ' on' : ''}`} data-testid={`bk-card-${kit.id}`}>
    <button type="button" className="bk-bcard-hit" aria-label={`Open ${kit.name}`} onClick={onOpen}>
      <span className="bk-bcard-art" style={{ background: bg }}>
        {main ? <img src={main.url} alt="" loading="lazy" /> : <span className="bk-mono" style={{ color: inkOn(bg), fontFamily: cssFamily(kit.fonts.heading, 'var(--font-display)') }}>{kit.name}</span>}
        {kit.logos.icon && <img className="bk-bcard-icon" src={kit.logos.icon.url} alt="" loading="lazy" />}
      </span>
      <span className="bk-bcard-sw" aria-hidden>{kit.colors.length ? kit.colors.slice(0, 8).map((c, i) => <i key={i} style={{ background: c.hex }} />) : <i className="bk-sw-none" />}</span>
      <span className="bk-bcard-t"><span className="bk-aa" aria-hidden style={{ fontFamily: cssFamily(kit.fonts.heading) }}>Aa</span>
        <span><b>{kit.name}</b><small>{fonts.length ? fonts.join(' + ') : 'No fonts yet'}</small></span></span>
    </button>
    <span className="bk-bcard-top">{active && <span className="bk-badge" {...tip('Used by Brand in the Image, Video and Audio bars')}>Active</span>}{kit.builtIn && <span className="bk-ro-tag">Built in</span>}</span>
    <button ref={btn} type="button" className="bk-bcard-more" aria-label={`More for ${kit.name}`} aria-haspopup="menu" aria-expanded={menu} data-testid={`bk-card-menu-${kit.id}`} onClick={() => setMenu(m => !m)}><MoreIcon size={16} /></button>
    <Popover open={menu} anchor={btn} onClose={() => setMenu(false)} label={`${kit.name} actions`} role="menu" placement="bottom" align="end" testId={`bk-card-pop-${kit.id}`} className="bk-menu">
      <div className="bk-menu-in">
        <button type="button" role="menuitem" className="bk-mi" disabled={active} onClick={run(onUse)}>{active ? 'In use' : 'Use this brand'}</button>
        <button type="button" role="menuitem" className="bk-mi" onClick={run(onOpen)}>{kit.builtIn ? 'View' : 'Edit'}</button>
        <button type="button" role="menuitem" className="bk-mi" onClick={run(onDuplicate)}>Duplicate</button>
        <button type="button" role="menuitem" className="bk-mi" onClick={run(onExport)}>Export tokens (.json)</button>
        {!kit.builtIn && <><hr className="bk-mdiv" /><button type="button" role="menuitem" className="bk-mi bk-danger" onClick={run(onDelete)}>Delete</button></>}
      </div>
    </Popover>
  </div>;
}

/** "+ New brand": from a logo (a blank brand, then the logo picker; its colours fill in), from words (a free rules-based palette, no model) or blank. */
function NewBrandCard({ busy, startOpen, onPick }: { busy: boolean; startOpen: boolean; onPick: (how: 'logo' | 'blank' | { words: string }) => void }) {
  const [open, setOpen] = useState(startOpen); const [w, setW] = useState(''); const btn = useRef<HTMLButtonElement>(null);
  return <div className="bk-bcard bk-bnew">
    <button ref={btn} type="button" className="bk-bcard-hit bk-bnew-hit" data-testid="bk-new" disabled={busy} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(o => !o)}>
      <span className="bk-plus" aria-hidden>+</span><b>New brand</b><small>From a logo, from words, or blank</small></button>
    <Popover open={open} anchor={btn} onClose={() => setOpen(false)} label="New brand" placement="bottom" align="start" testId="bk-new-pop" className="bk-menu bk-newmenu">
      <div className="bk-menu-in">
        <button type="button" className="bk-mi bk-mi2" data-testid="bk-new-logo" onClick={() => { setOpen(false); onPick('logo'); }}><b>From a logo</b><small>Upload one or pick a result; its colours fill in</small></button>
        <form className="bk-mi2 bk-new-words" onSubmit={e => { e.preventDefault(); if (!w.trim()) return; setOpen(false); onPick({ words: w.trim() }); setW(''); }}>
          <label htmlFor="bk-new-words"><b>From words</b><small>Colours picked from your mood words by simple rules. Free, no AI model.</small></label>
          <span className="bk-words-row"><input id="bk-new-words" className="bk-input" value={w} maxLength={300} placeholder="e.g. calm, natural, premium" data-testid="bk-new-words" onChange={e => setW(e.target.value)} /><button type="submit" className="btn btn-sm" disabled={!w.trim()}>Make</button></span>
        </form>
        <button type="button" className="bk-mi bk-mi2" data-testid="bk-new-blank" onClick={() => { setOpen(false); onPick('blank'); }}><b>Blank</b><small>Start empty</small></button>
      </div>
    </Popover>
  </div>;
}

type Tile = 'logos' | 'colours' | 'fonts' | 'mood' | 'examples';
const TITLE: Record<Tile, string> = { logos: 'Logos', colours: 'Colours', fonts: 'Fonts', mood: 'Mood and rules', examples: 'Examples' };
const Soon = () => <span className="bb-soon">Coming next</span>;

/** A board tile: shows one part of the brand; a click (or Enter) opens it in the side panel. */
function BoardTile({ id, className, children, edit, ro, onOpen }: { id: Tile; className: string; children: ReactNode; edit: Tile | null; ro: boolean; onOpen: (t: Tile) => void }) {
  return <div role="button" tabIndex={0} className={`bb-tile ${className}${edit === id ? ' on' : ''}`} data-testid={`bb-tile-${id}`} aria-label={`${ro ? 'View' : 'Edit'} ${TITLE[id]}`} aria-pressed={edit === id}
    onClick={() => onOpen(id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(id); } }}>
    <span className="bb-tile-h"><span>{TITLE[id]}</span><span className="bb-tile-e">{ro ? 'View' : 'Edit'}</span></span>{children}</div>;
}

/** One brand as a board: tiles show it, a click opens that part in the side panel. */
function BrandBoard({ kit, active, fonts, autoLogo, onBack, onUse, onDuplicate, onDelete }: { kit: BrandKit; active: boolean; fonts: { name: string; kind: string; inApp?: boolean }[]; /** "From a logo": open Logos and its picker */ autoLogo?: boolean; onBack: () => void; onUse: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const toast = useToast(); const ro = !!kit.builtIn;
  const [d, setD] = useState<BrandKit>(kit); const [save, setSave] = useState<Save>('idle'); const [err, setErr] = useState('');
  const [edit, setEdit] = useState<Tile | null>(autoLogo ? 'logos' : null);
  const timer = useRef<number>(); const pending = useRef<Record<string, unknown>>({});
  useEffect(() => () => { clearTimeout(timer.current); void flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!edit) return; const f = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]')) setEdit(null); }; addEventListener('keydown', f); return () => removeEventListener('keydown', f); }, [edit]);
  /** Edits save on their own, 600 ms after the last change. */
  const flush = async () => { clearTimeout(timer.current); const body = pending.current; if (!Object.keys(body).length) return; pending.current = {}; setSave('saving');
    try { const k = await api('PATCH', `/api/brand-kits/${kit.id}`, body); putKit(k); setSave('saved'); setErr(''); } catch (e: any) { setSave('error'); setErr(e.message); } };
  const patch = (p: Partial<BrandKit>) => { if (ro) return; setD(x => ({ ...x, ...p })); Object.assign(pending.current, p); setSave('saving'); clearTimeout(timer.current); timer.current = window.setTimeout(flush, 600); };
  /** A kit the server saved (an upload, a download): shown at once, with any edits still waiting on top. */
  const apply = (k: BrandKit) => { putKit(k); setD({ ...BK.normalizeKit(k), ...(pending.current as Partial<BrandKit>) }); setSave('saved'); };
  const remove = () => { clearTimeout(timer.current); pending.current = {}; onDelete(); };
  /** Exports use the saved kit: pending edits are sent first. */
  const prepare = async () => { await flush(); return d; };
  const props: PanelProps = { d, ro, patch, apply, flush };

  const bg = roleHex(d, 'background') ?? '#161618'; const main = BK.logoFor(d, 'main');
  const tp = { edit, ro, onOpen: setEdit };
  const heading = fontSource(d, 'heading', fonts), body = fontSource(d, 'body', fonts);
  return (
    <section className={`bb${edit ? ' bb-open' : ''}`} aria-label={`Brand ${d.name}`} data-testid="bk-editor" data-kit={kit.id}>
      <button type="button" className="bk-back" data-testid="bk-back" onClick={onBack}><span aria-hidden>←</span> All brands</button>
      <header className="bk-ed-head">
        <div className="bk-ed-title">
          {ro ? <h2 className="bk-name-ro">{d.name}</h2> : <input className="bk-name" aria-label="Brand name" value={d.name} maxLength={BK.BRAND_LIMITS.name} data-testid="bk-name" onChange={e => setD(x => ({ ...x, name: e.target.value }))}
            onBlur={() => { const n = d.name.trim(); if (n && n !== kit.name) patch({ name: n }); else setD(x => ({ ...x, name: kit.name })); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />}
          <span className="bk-save" role="status" data-testid="bk-save">{ro ? 'Built in: duplicate it to make it yours' : save === 'saving' ? 'Saving…' : save === 'saved' ? 'Saved' : save === 'error' ? 'Not saved' : BK.moodWords(d.mood)}</span>
        </div>
        <div className="bk-ed-acts">
          {active ? <span className="bk-badge bk-badge-lg" {...tip('Used by Brand in the Image, Video and Audio bars')}>Active</span> : <button type="button" className="btn btn-sm" data-testid="bk-activate" onClick={onUse}>Use this brand</button>}
          <button type="button" className="btn btn-sm btn-ghost" data-testid="bk-duplicate" onClick={onDuplicate}>Duplicate</button>
          <BrandExportMenu kit={d} prepare={prepare} onDone={(m) => { if (m) toast(m); }} onError={(m) => toast(m, 'warn')} />
          {!ro && <button type="button" className="btn btn-sm btn-ghost bk-danger" data-testid="bk-delete" onClick={remove}>Delete</button>}
        </div>
      </header>
      {err && <p className="bk-err" role="alert">{err}</p>}

      <div className="bb-body">
        <div className="bb-board" data-testid="bb-board">
          <BoardTile {...tp} id="logos" className="bb-t-logos">
            <span className="bb-hero" style={{ background: bg }}>
              {main ? <img src={main.url} alt={`${d.name} logo`} /> : <span className="bb-hero-name" style={{ color: inkOn(bg), fontFamily: cssFamily(d.fonts.heading, 'var(--font-display)') }}>{d.name}<small>{ro ? 'No logo' : 'Add your logo'}</small></span>}
            </span>
            <span className="bb-mini">{(['light', 'dark', 'icon'] as const).map(s => { const own = d.logos[s]; const b = slotBg(d, s);
              return <span key={s} style={{ background: b }} data-testid={`bb-mini-${s}`}>{own ? <img src={own.url} alt={`${cap(s)} logo`} /> : main ? <><img src={main.url} alt="" className="bb-fb" /><i className="bb-note">{cap(s)}: uses Main</i></> : <i className="bb-note">{cap(s)}: not set</i>}</span>; })}</span>
          </BoardTile>
          <BoardTile {...tp} id="colours" className="bb-t-colours">{d.colors.length ? <span className="bb-bars">{d.colors.map((c, i) => <span key={i} style={{ background: c.hex, color: inkOn(c.hex) }}><b>{c.name || cap(BK.colourWords(c.hex))}</b><small>{c.role ? cap(c.role) : ''}</small><code>{c.hex}</code></span>)}</span> : <span className="bb-empty">No colours yet</span>}</BoardTile>
          <BoardTile {...tp} id="fonts" className="bb-t-fonts"><span className="bb-type">
            <span className="bb-type-aa" style={{ fontFamily: cssFamily(d.fonts.heading) }}>Aa</span>
            <span className="bb-type-r"><b style={{ fontFamily: cssFamily(d.fonts.heading) }}>{d.fonts.heading || 'App font'}</b><small>Headings · {heading.label}</small>
              <span style={{ fontFamily: cssFamily(d.fonts.body) }}>{d.fonts.body || 'App font'}</span><small>Body text · {body.label}</small></span></span></BoardTile>
          <BoardTile {...tp} id="mood" className="bb-t-mood"><span className="bb-moodv">
            <span className="bb-moodw" style={{ fontFamily: cssFamily(d.fonts.heading) }}>{BK.moodWords(d.mood) || <i className="bb-empty">No mood yet</i>}</span>
            <span className="bb-rules"><span><b>Do</b>{d.dos[0] ?? '—'}{d.dos.length > 1 && <small> +{d.dos.length - 1}</small>}</span><span><b>Don’t</b>{d.donts[0] ?? '—'}{d.donts.length > 1 && <small> +{d.donts.length - 1}</small>}</span></span></span></BoardTile>
          <BoardTile {...tp} id="examples" className="bb-t-examples">{d.examples.length ? <span className="bb-ex">{d.examples.map(u => <img key={u} src={u} alt="" loading="lazy" />)}</span> : <span className="bb-empty">{ro ? 'No examples' : 'Pick up to 3 of your results for the brand sheet'}</span>}</BoardTile>
          <div className="bb-tile bb-soon-tile bb-t-voice" data-testid="bb-voice"><span className="bb-tile-h"><span>Voice <Soon /></span></span><span className="bb-empty">How {d.name} talks: tone words, who it’s for and what makes it different, for headline and caption ideas.</span></div>
          <div className="bb-tile bb-soon-tile bb-t-products" data-testid="bb-products"><span className="bb-tile-h"><span>Products <Soon /></span></span><span className="bb-empty">A photo, name, price and link for each thing you sell, ready for the Ad card.</span></div>
          <div className="bb-tile bb-soon-tile bb-t-import" data-testid="bb-import"><span className="bb-tile-h"><span>Import <Soon /></span></span><span className="bb-empty">Fill this board from your shop’s website: logo, colours, fonts and products.</span></div>
        </div>
        {edit && <aside className="bb-panel" aria-label={TITLE[edit]} data-testid="bb-panel">
          <header><b>{TITLE[edit]}</b>{ro && <small>Read only</small>}<button type="button" className="bk-x" aria-label="Close" data-testid="bb-panel-close" onClick={() => setEdit(null)}>×</button></header>
          <div className="bb-panel-in">
            {edit === 'logos' && <LogosPanel {...props} auto={autoLogo} />}
            {edit === 'colours' && <ColoursPanel {...props} />}
            {edit === 'fonts' && <FontsPanel {...props} fonts={fonts} />}
            {edit === 'mood' && <MoodPanel {...props} />}
            {edit === 'examples' && <ExamplesPanel {...props} />}
          </div>
        </aside>}
      </div>
    </section>
  );
}
