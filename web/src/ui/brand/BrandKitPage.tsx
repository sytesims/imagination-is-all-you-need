/**
 * Assets › Brands (2026-10-27): your brand profiles. The page opens on a grid of brand cards (logo, swatches, name, mood, Active), each with a menu
 * (Use, Edit, Duplicate, Export, Delete) and a "+ New brand" card (from a logo, from words, or blank). A card opens that brand's editor
 * (?brand=<id>, with a link back to all brands): a logo (upload or pick one of your results; colours are read from it in the browser), colours with
 * names and roles, two fonts (names only), a mood line, do / don't lines and up to 3 example results. One brand is active: "Brand: <name>" in the
 * Image, Video and Audio bars uses it (and switches between them). Export: one menu grouped by app (BrandExportMenu): tokens for Figma, hex for
 * Canva, .ase / .swatches / .sketchpalette / .gpl swatch files, CSS variables, a Tailwind theme, a brand sheet PNG and a palette PNG. Our own brand (Imagination) is always first and read-only. Edits save on their own (PATCH /api/brand-kits/:id;
 * the API keeps its first name, brand kits).
 */
import { IMAGE_ACCEPT } from '../../../../server/src/shared/mediaAccept';
import { useEffect, useMemo, useRef, useState } from 'react';
import { UploadZone } from '../../shared/Dropzone';
import { pickMedia } from '../../shared/MediaPicker';
import { libraryUrlOf } from '../../shared/libraryFiles';
import { askConfirm } from '../../shared/Dialog';
import { useToast } from '../../shared/Toast';
import { tip } from '../../shared/Tooltip';
import { Popover } from '../../shared/Popover';
import { MoreIcon } from '../Icons';
import { loadBrandKits, putKit, setActiveKit, useBrand } from '../../shared/brandStore';
import * as BK from '../../../../server/src/shared/brandKit';
import type { BrandColor, BrandKit, BrandRole } from '../../../../server/src/shared/brandKit';
import { colorsOfImage, saveFile } from './brandCanvas';
import { BrandExportMenu, BrandWorksWith } from './BrandExportMenu';
import './brandKit.css';

type Save = 'idle' | 'saving' | 'saved' | 'error';
const api = async (method: string, url: string, body?: unknown) => {
  const r = await fetch(url, { method, ...(body instanceof FormData ? { body } : body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const b = await r.json().catch(() => null); if (!r.ok) throw new Error(b?.error ?? `Something went wrong (${r.status}).`); return b;
};
const ROLE_LABEL: Record<string, string> = { '': 'No role', primary: 'Primary', secondary: 'Secondary', accent: 'Accent', background: 'Background', text: 'Text' };
const cap = (s: string) => s.replace(/\b\w/, (c) => c.toUpperCase());
/** ?brand=<id> (old links: ?kit=) is the open editor; none = the grid. ?new=1 opens the New brand menu (the bar chip's "+ New brand"). */
const brandOfUrl = () => { const q = new URLSearchParams(location.search); return q.get('brand') ?? q.get('kit') ?? ''; };
const setBrandUrl = (id: string) => { const q = new URLSearchParams(location.search); q.delete('kit'); q.delete('new'); if (id) q.set('brand', id); else q.delete('brand'); const u = `${location.pathname}${q.toString() ? `?${q}` : ''}`; if (u !== location.pathname + location.search) history.pushState({ ...(history.state ?? {}), inApp: true }, '', u); };
/** The tokens file of a brand (also the card menu's Export). */
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
    <KitEditor key={sel.id} kit={sel} active={sel.id === s.activeId} fonts={s.fonts} autoLogo={autoLogo === sel.id} onBack={() => open('')} onUse={() => use(sel)}
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

/** One brand on the grid: logo (or a monogram in its first colour), swatches, name, mood, Active; the card opens the editor, ⋯ has the rest. */
function BrandCard({ kit, active, onOpen, onUse, onDuplicate, onExport, onDelete }: { kit: BrandKit; active: boolean; onOpen: () => void; onUse: () => void; onDuplicate: () => void; onExport: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false); const btn = useRef<HTMLButtonElement>(null); const mood = BK.moodWords(kit.mood);
  const run = (f: () => void) => () => { setMenu(false); f(); };
  const bg = kit.colors.find(c => c.role === 'background')?.hex ?? kit.colors[0]?.hex ?? 'var(--surface-3)';
  return <div className={`bk-bcard${active ? ' on' : ''}`} data-testid={`bk-card-${kit.id}`}>
    <button type="button" className="bk-bcard-hit" aria-label={`Edit ${kit.name}`} onClick={onOpen}>
      <span className="bk-bcard-art" style={{ background: bg }}>
        {kit.logo ? <img src={kit.logo.url} alt="" loading="lazy" /> : <span className="bk-mono" style={{ color: BK.luminance(BK.normHex(bg) ?? '#111111') > 0.4 ? '#14151A' : '#F5F5F5' }}>{kit.name.trim().charAt(0).toUpperCase() || '?'}</span>}
      </span>
      <span className="bk-bcard-sw" aria-hidden>{kit.colors.length ? kit.colors.slice(0, 8).map((c, i) => <i key={i} style={{ background: c.hex }} />) : <i className="bk-sw-none" />}</span>
      <span className="bk-bcard-t"><b>{kit.name}</b><small>{mood || (kit.builtIn ? 'Our own brand' : 'No mood yet')}</small></span>
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

function KitEditor({ kit, active, fonts, autoLogo, onBack, onUse, onDuplicate, onDelete }: { kit: BrandKit; active: boolean; fonts: { name: string; kind: string; inApp?: boolean }[]; /** "From a logo": open the logo picker on arrival */ autoLogo?: boolean; onBack: () => void; onUse: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const toast = useToast(); const ro = !!kit.builtIn;
  const [d, setD] = useState<BrandKit>(kit); const [save, setSave] = useState<Save>('idle'); const [err, setErr] = useState('');
  const [dd, setDd] = useState({ dos: kit.dos.join('\n'), donts: kit.donts.join('\n') }); /* the do / don't boxes as typed (blank lines kept while typing) */
  const [logoBusy, setLogoBusy] = useState(''); const [found, setFound] = useState<{ hex: string; share: number }[] | null>(null);
  const timer = useRef<number>(); const pending = useRef<Record<string, unknown>>({});
  useEffect(() => () => { clearTimeout(timer.current); flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /** Edits save on their own, 600 ms after the last change. */
  const flush = async () => { const body = pending.current; if (!Object.keys(body).length) return; pending.current = {}; setSave('saving');
    try { const k = await api('PATCH', `/api/brand-kits/${kit.id}`, body); putKit(k); setSave('saved'); setErr(''); } catch (e: any) { setSave('error'); setErr(e.message); } };
  const patch = (p: Partial<BrandKit>) => { if (ro) return; setD(x => ({ ...x, ...p })); Object.assign(pending.current, p); setSave('saving'); clearTimeout(timer.current); timer.current = window.setTimeout(flush, 600); };
  const kitNow = d;
  const phrase = useMemo(() => BK.brandPhrase(kitNow, 'image'), [kitNow]);

  /* logo: upload (or a library pick, delivered as a file), then its colours are read in the browser */
  const onLogo = async (fs: File[]) => { const f = fs[0]; if (!f || ro) return; setLogoBusy('Uploading…'); setErr('');
    try { const fd = new FormData(); fd.append('file', f, f.name || 'logo.png'); const k = await api('POST', `/api/brand-kits/${kit.id}/logo`, fd); putKit(k); setD(x => ({ ...x, logo: k.logo }));
      setLogoBusy('Reading colours…'); const cs = await colorsOfImage(f).catch(() => []); setFound(cs);
      if (cs.length && !d.colors.length) { patch({ colors: BK.colorsFromExtract(cs) }); toast(`Found ${cs.length} colour${cs.length === 1 ? '' : 's'} in your logo. Rename them or change their roles below.`); }
      else if (!cs.length) toast('No clear colours in that logo. Add them by hand below.', 'warn');
    } catch (e: any) { setErr(e.message); } finally { setLogoBusy(''); } };
  const reread = async () => { if (!d.logo) return; setLogoBusy('Reading colours…'); const cs = await colorsOfImage(d.logo.url).catch(() => []); setFound(cs); setLogoBusy(''); if (!cs.length) toast('No clear colours in that logo.', 'warn'); };
  const setColors = (cs: BrandColor[]) => patch({ colors: cs });
  const setColor = (i: number, p: Partial<BrandColor>) => { let cs = d.colors.map((c, j) => (j === i ? { ...c, ...p } : c)); if (p.role) cs = cs.map((c, j) => (j !== i && c.role === p.role ? { ...c, role: '' as BrandRole } : c)); setColors(cs); };
  const addColor = (hex = '#FF7A1A') => { if (d.colors.length >= BK.BRAND_LIMITS.colors) return; setColors([...d.colors, { hex, name: cap(BK.colourWords(hex)), role: '' }]); };
  const addExamples = () => pickMedia({ accept: IMAGE_ACCEPT, title: 'Pick example results', limits: `Up to ${BK.BRAND_LIMITS.examples} images for the brand sheet`, multiple: true, frames: false, onFiles: async (fs) => {
    const room = BK.BRAND_LIMITS.examples - d.examples.length; if (room <= 0) { toast(`Up to ${BK.BRAND_LIMITS.examples} examples. Remove one first.`, 'warn'); return; }
    const lib = fs.slice(0, room).map(f => libraryUrlOf(f)).filter((u): u is string => !!u && BK.isMediaUrl(u)); const up = fs.slice(0, room).filter(f => !libraryUrlOf(f));
    try { let k: BrandKit | null = null; if (lib.length) { clearTimeout(timer.current); await flush(); k = await api('PATCH', `/api/brand-kits/${kit.id}`, { examples: [...d.examples, ...lib] }); }
      for (const f of up) { const fd = new FormData(); fd.append('file', f, f.name || 'example.png'); k = await api('POST', `/api/brand-kits/${kit.id}/examples`, fd); }
      if (k) { putKit(k); setD(x => ({ ...x, examples: k!.examples })); } } catch (e: any) { toast(e.message, 'warn'); } } });
  const remove = () => { clearTimeout(timer.current); pending.current = {}; onDelete(); };
  const pickLogo = () => pickMedia({ accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml', title: d.logo ? 'Replace logo' : 'Add your logo', limits: 'PNG, JPG, WEBP, GIF or SVG · up to 20 MB', frames: false, onFiles: onLogo });
  useEffect(() => { if (autoLogo && !ro) pickLogo(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /** Exports use the saved kit: pending edits are sent first. */
  const prepare = async () => { clearTimeout(timer.current); await flush(); return d; };

  const roleTaken = (r: string, i: number) => !!r && d.colors.some((c, j) => j !== i && c.role === r);
  return (
    <section className="bk-editor" aria-label={`Brand ${d.name}`} data-testid="bk-editor" data-kit={kit.id}>
      <button type="button" className="bk-back" data-testid="bk-back" onClick={onBack}><span aria-hidden>←</span> All brands</button>
      <header className="bk-ed-head">
        <div className="bk-ed-title">
          {ro ? <h2 className="bk-name-ro">{d.name}</h2> : <input className="bk-name" aria-label="Brand name" value={d.name} maxLength={BK.BRAND_LIMITS.name} data-testid="bk-name" onChange={e => setD(x => ({ ...x, name: e.target.value }))}
            onBlur={() => { const n = d.name.trim(); if (n && n !== kit.name) patch({ name: n }); else setD(x => ({ ...x, name: kit.name })); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />}
          <span className="bk-save" role="status" data-testid="bk-save">{ro ? 'Built in: duplicate it to make it yours' : save === 'saving' ? 'Saving…' : save === 'saved' ? 'Saved' : save === 'error' ? 'Not saved' : ''}</span>
        </div>
        <div className="bk-ed-acts">
          {active ? <span className="bk-badge bk-badge-lg">Active</span> : <button type="button" className="btn btn-sm" data-testid="bk-activate" onClick={onUse}>Use this brand</button>}
          <button type="button" className="btn btn-sm btn-ghost" data-testid="bk-duplicate" onClick={onDuplicate}>Duplicate</button>
          {!ro && <button type="button" className="btn btn-sm btn-ghost bk-danger" data-testid="bk-delete" onClick={remove}>Delete</button>}
        </div>
      </header>
      {err && <p className="bk-err" role="alert">{err}</p>}

      <div className="bk-grid">
        <div className="bk-col">
          <div className="bk-block" data-testid="bk-logo">
            <h3>Logo</h3>
            {d.logo ? <div className="bk-logo">
              <span className="bk-logo-img"><img src={d.logo.url} alt={`${d.name} logo`} /></span>
              {!ro && <div className="bk-logo-acts"><button type="button" className="btn btn-sm btn-ghost" onClick={pickLogo}>Replace</button>
                <button type="button" className="btn btn-sm btn-ghost" disabled={!!logoBusy} onClick={reread}>Read colours</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => patch({ logo: null })}>Remove</button></div>}
              {logoBusy && <small className="helper">{logoBusy}</small>}
            </div>
              : ro ? <p className="helper">No logo.</p>
              : <UploadZone accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" label="Add your logo" helper="PNG, JPG, WEBP, GIF or SVG · or pick one of your results" onFiles={onLogo} busy={logoBusy || undefined} testId="bk-logo-drop" />}
            {found && found.length > 0 && !ro && <div className="bk-found" data-testid="bk-found"><small className="helper">From your logo:</small>
              {found.map(c => <button key={c.hex} type="button" className="bk-found-sw" style={{ background: c.hex }} aria-label={`Add ${c.hex}`} {...tip(`Add ${c.hex} (${Math.round(c.share * 100)}%)`)} disabled={d.colors.some(x => x.hex === c.hex) || d.colors.length >= BK.BRAND_LIMITS.colors} onClick={() => addColor(c.hex)} />)}
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setColors(BK.colorsFromExtract(found))}>Use these</button></div>}
          </div>

          <div className="bk-block" data-testid="bk-colours">
            <h3>Colours <small className="helper">{d.colors.length}/{BK.BRAND_LIMITS.colors}</small></h3>
            {!d.colors.length && <p className="helper">No colours yet. Add your logo to find them, or add them by hand.</p>}
            <ul className="bk-colors">
              {d.colors.map((c, i) => <li key={i} className="bk-color" data-testid={`bk-color-${i}`}>
                <label className="bk-sw" style={{ background: c.hex }} {...tip(ro ? c.hex : 'Change colour')}><input type="color" value={c.hex.toLowerCase()} disabled={ro} aria-label={`Colour ${i + 1}`} onChange={e => setColor(i, { hex: e.target.value.toUpperCase() })} /></label>
                <input className="bk-input bk-hex" value={c.hex} readOnly={ro} aria-label={`Colour ${i + 1} hex`} maxLength={7} onChange={e => { const h = BK.normHex(e.target.value); setD(x => ({ ...x, colors: x.colors.map((y, j) => (j === i ? { ...y, hex: e.target.value } : y)) })); if (h && e.target.value.length >= 7) setColor(i, { hex: h }); }}
                  onBlur={e => { const h = BK.normHex(e.target.value); if (h) setColor(i, { hex: h }); else setD(x => ({ ...x, colors: kitColors(kit, x, i) })); }} />
                <input className="bk-input bk-cname" value={c.name} readOnly={ro} placeholder={cap(BK.colourWords(BK.normHex(c.hex) ?? '#000000'))} maxLength={BK.BRAND_LIMITS.colorName} aria-label={`Colour ${i + 1} name`} onChange={e => setColor(i, { name: e.target.value })} />
                <select className="bk-input bk-role" value={c.role} disabled={ro} aria-label={`Colour ${i + 1} role`} onChange={e => setColor(i, { role: e.target.value as BrandRole })}>
                  {['', ...BK.BRAND_ROLES].map(r => <option key={r} value={r}>{ROLE_LABEL[r]}{roleTaken(r, i) ? ' (moves here)' : ''}</option>)}</select>
                {!ro && <button type="button" className="bk-x" aria-label={`Remove colour ${i + 1}`} onClick={() => setColors(d.colors.filter((_, j) => j !== i))}>×</button>}
              </li>)}
            </ul>
            {!ro && d.colors.length < BK.BRAND_LIMITS.colors && <button type="button" className="btn btn-sm btn-ghost" data-testid="bk-add-colour" onClick={() => addColor(d.colors.length ? '#FFFFFF' : '#FF7A1A')}>+ Add colour</button>}
          </div>

          <div className="bk-block">
            <h3>Fonts</h3>
            <div className="bk-fonts">
              {(['heading', 'body'] as const).map(k => <label key={k} className="bk-font"><span className="bk-lbl">{k === 'heading' ? 'Headings' : 'Body text'}</span>
                <select className="bk-input" value={d.fonts[k]} disabled={ro} data-testid={`bk-font-${k}`} onChange={e => patch({ fonts: { ...d.fonts, [k]: e.target.value } })}>
                  <option value="">Not set</option>
                  <optgroup label="In this app">{fonts.filter(f => f.inApp).map(f => <option key={f.name} value={f.name}>{f.name}</option>)}</optgroup>
                  <optgroup label="Google Fonts (names only)">{fonts.filter(f => !f.inApp).map(f => <option key={f.name} value={f.name}>{f.name}</option>)}</optgroup>
                  {d.fonts[k] && !fonts.some(f => f.name === d.fonts[k]) && <option value={d.fonts[k]}>{d.fonts[k]}</option>}
                </select>
                <span className={`bk-font-sample bk-fs-${k}`} style={{ fontFamily: BK.fontStack(d.fonts[k] || 'Manrope').map(f => /^(sans-serif|serif|monospace)$/.test(f) ? f : `"${f}"`).join(', ') }}>{k === 'heading' ? 'Aa Bb Cc' : 'Imagination is all you need.'}</span>
              </label>)}
            </div>
            <small className="helper">Only the names are saved. Fonts the app doesn’t load show in a stand-in here; your design tool uses the real one.</small>
          </div>
        </div>

        <div className="bk-col">
          <div className="bk-block">
            <h3><label htmlFor={`bk-mood-${kit.id}`}>Mood</label> <small className="helper">{d.mood.length}/{BK.BRAND_LIMITS.mood}</small></h3>
            <textarea id={`bk-mood-${kit.id}`} className="bk-input bk-mood" rows={3} value={d.mood} readOnly={ro} maxLength={BK.BRAND_LIMITS.mood} placeholder="e.g. warm, playful, premium" data-testid="bk-mood" onChange={e => patch({ mood: e.target.value.replace(/\n/g, ' ') })} />
          </div>
          <div className="bk-block bk-dd">
            {(['dos', 'donts'] as const).map(k => <label key={k} className="bk-ddcol"><span className="bk-lbl">{k === 'dos' ? 'Do' : 'Don’t'}</span>
              <textarea className="bk-input" rows={4} readOnly={ro} value={dd[k]} placeholder={k === 'dos' ? 'One per line, e.g. Soft daylight' : 'One per line, e.g. Neon colours'} data-testid={`bk-${k}`}
                onChange={e => { const v = e.target.value; setDd(x => ({ ...x, [k]: v })); const lines = v.split('\n').map(x => x.trim()).filter(Boolean).slice(0, BK.BRAND_LIMITS.lines).map(x => x.slice(0, BK.BRAND_LIMITS.line)); patch({ [k]: lines } as any); }} /></label>)}
            <small className="helper bk-dd-note">Do and don’t lines go on the brand sheet and into the tokens file; they aren’t added to prompts.</small>
          </div>
          <div className="bk-block" data-testid="bk-examples">
            <h3>Examples <small className="helper">{d.examples.length}/{BK.BRAND_LIMITS.examples}</small></h3>
            <div className="bk-ex">
              {d.examples.map(u => <span key={u} className="bk-ex-tile"><img src={u} alt="" loading="lazy" />{!ro && <button type="button" className="bk-x bk-ex-x" aria-label="Remove example" onClick={() => patch({ examples: d.examples.filter(x => x !== u) })}>×</button>}</span>)}
              {!ro && d.examples.length < BK.BRAND_LIMITS.examples && <button type="button" className="bk-ex-tile bk-ex-add" data-testid="bk-add-example" onClick={addExamples}><span aria-hidden>+</span><small>Pick results</small></button>}
              {ro && !d.examples.length && <p className="helper">Pick up to 3 of your results to show on the brand sheet.</p>}
            </div>
          </div>
          <div className="bk-block bk-use">
            <h3>What Brand adds to your prompt</h3>
            <p className="bk-phrase" data-testid="bk-preview">{phrase || 'Nothing yet: add colours or a mood.'}</p>
            <small className="helper">Turn on <b>Brand</b> in the Image, Video or Audio bar. Audio gets the mood only. Same model, same price.</small>
          </div>
          <div className="bk-block bk-export" data-testid="bk-export">
            <h3>Export</h3>
            <p className="bk-exp-lead">Take your colours, fonts and logo into the apps you design in, or into your code.</p>
            <BrandExportMenu kit={d} prepare={prepare} onDone={(m) => { if (m) toast(m); }} onError={(m) => toast(m, 'warn')} />
            <BrandWorksWith />
          </div>
        </div>
      </div>
    </section>
  );
}
/** Put back the saved hex of colour i (a bad hex typed then left). */
const kitColors = (kit: BrandKit, x: BrandKit, i: number) => x.colors.map((c, j) => (j === i ? { ...c, hex: kit.colors[i]?.hex ?? '#000000' } : c));
