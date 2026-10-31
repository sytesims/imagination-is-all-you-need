/**
 * Brands › board, the side panel editors (2026-10-31): one per tile. Logos (main, light, dark, icon, each on the background it's made for),
 * Colours (hex, name, role), Fonts (a live specimen per role; upload a font file or download a Google Font once; where it came from and its
 * licence), Mood and rules (mood, do / don't, what Brand adds to a prompt) and Examples. Text edits go through `patch` (saved 600 ms later by
 * the board); uploads and downloads call the API at once and hand the saved kit to `apply`. The built-in brand shows the same panels read-only.
 */
import { useEffect, useRef, useState } from 'react';
import { IMAGE_ACCEPT } from '../../../../server/src/shared/mediaAccept';
import * as BK from '../../../../server/src/shared/brandKit';
import type { BrandColor, BrandKit, BrandRole, FontRole, LogoSlot } from '../../../../server/src/shared/brandKit';
import { pickMedia } from '../../shared/MediaPicker';
import { libraryUrlOf } from '../../shared/libraryFiles';
import { useToast } from '../../shared/Toast';
import { tip } from '../../shared/Tooltip';
import { cssFamily } from '../../shared/brandFonts';
import { colorsOfImage } from './brandCanvas';

export const api = async (method: string, url: string, body?: unknown) => {
  const r = await fetch(url, { method, ...(body instanceof FormData ? { body } : body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const b = await r.json().catch(() => null); if (!r.ok) throw new Error(b?.error ?? `Something went wrong (${r.status}).`); return b;
};
export const cap = (s: string) => s.replace(/\b\w/, (c) => c.toUpperCase());
/** Near black or near white, whichever reads on this colour. */
export const inkOn = (hex: string) => (BK.luminance(BK.normHex(hex) ?? '#000000') > 0.4 ? '#14151A' : '#F5F5F5');
export const roleHex = (k: BrandKit, r: BrandRole) => k.colors.find((c) => c.role === r)?.hex;
/** The brand's own light and dark colours (for showing the dark and light logos), else neutral ones. */
const lightBg = (k: BrandKit) => k.colors.map((c) => c.hex).find((h) => BK.luminance(h) > 0.6) ?? '#F3F1EC';
const darkBg = (k: BrandKit) => k.colors.map((c) => c.hex).find((h) => BK.luminance(h) < 0.08) ?? '#141416';
/** The background each logo slot is shown on. */
export const slotBg = (k: BrandKit, s: LogoSlot) => (s === 'light' ? darkBg(k) : s === 'dark' ? lightBg(k) : s === 'icon' ? 'var(--surface-3)' : roleHex(k, 'background') ?? k.colors[0]?.hex ?? 'var(--surface-3)');
export const SLOTS: { id: LogoSlot; title: string; hint: string; uses: string }[] = [
  { id: 'main', title: 'Main', hint: 'Your usual logo', uses: 'Brand sheet, exports, and anywhere a version below is missing' },
  { id: 'light', title: 'Light', hint: 'For dark backgrounds', uses: 'Ad card and logo stamp on dark pictures, end cards' },
  { id: 'dark', title: 'Dark', hint: 'For light backgrounds', uses: 'Ad card and logo stamp on bright pictures' },
  { id: 'icon', title: 'Icon', hint: 'A small square mark', uses: 'Your brands list' },
];
const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
const FONT_ACCEPT = '.ttf,.otf,.woff,.woff2';
type Fonts = { name: string; kind: string; inApp?: boolean }[];
/** Where a role's font comes from, in plain words (and whether it's only a name, not on this computer). */
export function fontSource(k: BrandKit, role: FontRole, fonts: Fonts): { label: string; nameOnly?: boolean } {
  const name = k.fonts[role]; if (!name) return { label: 'Uses the app font' };
  const f = k.fontFiles.find((x) => x.role === role);
  if (f) return { label: f.source === 'upload' ? `Your file · ${f.file}` : 'Google Fonts · on this computer' };
  if (fonts.find((x) => x.name === name)?.inApp) return { label: 'In this app' };
  return { label: 'Name only: not on this computer yet', nameOnly: true };
}

export interface PanelProps { d: BrandKit; ro: boolean; patch: (p: Partial<BrandKit>) => void; /** a kit the server just saved (after an upload) */ apply: (k: BrandKit) => void; /** send pending edits now */ flush: () => Promise<void> }

/* ---------------------------------------------------------------- logos */
export function LogosPanel({ d, ro, patch, apply, auto }: PanelProps & { /** "From a logo": open the main logo picker on arrival */ auto?: boolean }) {
  const toast = useToast(); const [busy, setBusy] = useState<LogoSlot | ''>(''); const [found, setFound] = useState<{ hex: string; share: number }[] | null>(null);
  const upload = async (slot: LogoSlot, f: File) => {
    setBusy(slot);
    try { const fd = new FormData(); fd.append('file', f, f.name || 'logo.png'); const k = await api('POST', `/api/brand-kits/${d.id}/logo?slot=${slot}`, fd); apply(k);
      if (slot === 'main') { const cs = await colorsOfImage(f).catch(() => []); setFound(cs);
        if (cs.length && !d.colors.length) { patch({ colors: BK.colorsFromExtract(cs) }); toast(`Found ${cs.length} colour${cs.length === 1 ? '' : 's'} in your logo. Rename them or change their roles in Colours.`); }
        else if (!cs.length) toast('No clear colours in that logo. Add them by hand in Colours.', 'warn'); }
    } catch (e: any) { toast(e.message, 'warn'); } finally { setBusy(''); }
  };
  const pick = (slot: LogoSlot) => pickMedia({ accept: LOGO_ACCEPT, title: `${d.logos[slot] ? 'Replace' : 'Add'} the ${slot} logo`, limits: 'PNG, JPG, WEBP, GIF or SVG · up to 20 MB', frames: false, onFiles: (fs) => { if (fs[0]) void upload(slot, fs[0]); } });
  const remove = async (slot: LogoSlot) => { setBusy(slot); try { apply(await api('DELETE', `/api/brand-kits/${d.id}/logo?slot=${slot}`)); } catch (e: any) { toast(e.message, 'warn'); } finally { setBusy(''); } };
  const reread = async () => { const u = d.logos.main?.url; if (!u) return; const cs = await colorsOfImage(u).catch(() => []); setFound(cs); if (!cs.length) toast('No clear colours in that logo.', 'warn'); };
  useEffect(() => { if (auto && !ro) pick('main'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="bb-logos" data-testid="bb-logos-panel">
    {SLOTS.map((s) => { const own = d.logos[s.id]; const fb = !own && s.id !== 'main' ? d.logos.main : null; const bg = slotBg(d, s.id);
      return <div key={s.id} className="bb-slot" data-testid={`bb-slot-${s.id}`}>
        <span className={`bb-slot-art${s.id === 'icon' ? ' icon' : ''}`} style={{ background: bg }}>
          {own ? <img src={own.url} alt={`${d.name} ${s.title.toLowerCase()} logo`} /> : fb ? <><img src={fb.url} alt="" className="bb-fb" /><i className="bb-note">Uses Main for now</i></> : <i className="bb-none" style={{ color: bg.startsWith('#') ? inkOn(bg) : undefined }}>{s.id === 'main' ? 'No logo yet' : 'Not set'}</i>}
        </span>
        <span className="bb-slot-t"><b>{s.title}</b><small>{s.hint}</small><small className="bb-uses">{s.uses}</small>
          {!ro && <span className="bb-acts">
            <button type="button" className="btn btn-sm btn-ghost" disabled={!!busy} data-testid={`bb-logo-add-${s.id}`} onClick={() => pick(s.id)}>{busy === s.id ? 'Saving…' : own ? 'Replace' : 'Add'}</button>
            {own && <button type="button" className="btn btn-sm btn-ghost" disabled={!!busy} data-testid={`bb-logo-remove-${s.id}`} onClick={() => void remove(s.id)}>Remove</button>}
            {own && s.id === 'main' && <button type="button" className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => void reread()}>Read colours</button>}
          </span>}</span>
      </div>; })}
    {found && found.length > 0 && !ro && <div className="bk-found" data-testid="bk-found"><small className="helper">From your logo:</small>
      {found.map((c) => <button key={c.hex} type="button" className="bk-found-sw" style={{ background: c.hex }} aria-label={`Add ${c.hex}`} {...tip(`Add ${c.hex} (${Math.round(c.share * 100)}%)`)} disabled={d.colors.some((x) => x.hex === c.hex) || d.colors.length >= BK.BRAND_LIMITS.colors}
        onClick={() => patch({ colors: [...d.colors, { hex: c.hex, name: cap(BK.colourWords(c.hex)), role: '' }] })} />)}
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => patch({ colors: BK.colorsFromExtract(found) })}>Use these</button></div>}
    <small className="helper">PNG, JPG, WEBP, GIF or SVG. Add a light and a dark version and the app picks the one that shows up on each picture.</small>
  </div>;
}

/* ---------------------------------------------------------------- colours */
const ROLE_LABEL: Record<string, string> = { '': 'No role', primary: 'Primary', secondary: 'Secondary', accent: 'Accent', background: 'Background', text: 'Text' };
export function ColoursPanel({ d, ro, patch }: PanelProps) {
  const [typed, setTyped] = useState<Record<number, string>>({}); /* a hex being typed, kept until it's a colour */
  const setColors = (cs: BrandColor[]) => patch({ colors: cs });
  const setColor = (i: number, p: Partial<BrandColor>) => { let cs = d.colors.map((c, j) => (j === i ? { ...c, ...p } : c)); if (p.role) cs = cs.map((c, j) => (j !== i && c.role === p.role ? { ...c, role: '' as BrandRole } : c)); setColors(cs); };
  const add = (hex = d.colors.length ? '#FFFFFF' : '#FF7A1A') => { if (d.colors.length < BK.BRAND_LIMITS.colors) setColors([...d.colors, { hex, name: cap(BK.colourWords(hex)), role: '' }]); };
  const taken = (r: string, i: number) => !!r && d.colors.some((c, j) => j !== i && c.role === r);
  return <div className="bb-colours" data-testid="bk-colours">
    {!d.colors.length && <p className="helper">No colours yet. Add your logo to find them, or add them by hand.</p>}
    <ul className="bk-colors">
      {d.colors.map((c, i) => <li key={i} className="bk-color" data-testid={`bk-color-${i}`}>
        <label className="bk-sw" style={{ background: c.hex }} {...tip(ro ? c.hex : 'Change colour')}><input type="color" value={c.hex.toLowerCase()} disabled={ro} aria-label={`Colour ${i + 1}`} onChange={(e) => setColor(i, { hex: e.target.value.toUpperCase() })} /></label>
        <input className="bk-input bk-hex" value={typed[i] ?? c.hex} readOnly={ro} aria-label={`Colour ${i + 1} hex`} maxLength={7}
          onChange={(e) => { const v = e.target.value; setTyped((t) => ({ ...t, [i]: v })); const h = BK.normHex(v); if (h && v.replace('#', '').length >= 6) setColor(i, { hex: h }); }}
          onBlur={(e) => { const h = BK.normHex(e.target.value); if (h) setColor(i, { hex: h }); setTyped((t) => { const n = { ...t }; delete n[i]; return n; }); }} />
        <input className="bk-input bk-cname" value={c.name} readOnly={ro} placeholder={cap(BK.colourWords(c.hex))} maxLength={BK.BRAND_LIMITS.colorName} aria-label={`Colour ${i + 1} name`} onChange={(e) => setColor(i, { name: e.target.value })} />
        <select className="bk-input bk-role" value={c.role} disabled={ro} aria-label={`Colour ${i + 1} role`} onChange={(e) => setColor(i, { role: e.target.value as BrandRole })}>
          {['', ...BK.BRAND_ROLES].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}{taken(r, i) ? ' (moves here)' : ''}</option>)}</select>
        {!ro && <button type="button" className="bk-x" aria-label={`Remove colour ${i + 1}`} onClick={() => setColors(d.colors.filter((_, j) => j !== i))}>×</button>}
      </li>)}
    </ul>
    {!ro && d.colors.length < BK.BRAND_LIMITS.colors && <button type="button" className="btn btn-sm btn-ghost" data-testid="bk-add-colour" onClick={() => add()}>+ Add colour</button>}
    <small className="helper">{d.colors.length}/{BK.BRAND_LIMITS.colors} colours. Roles tell the Ad card and the brand sheet which colour is the background, the text and the button.</small>
  </div>;
}

/* ---------------------------------------------------------------- fonts */
export function FontsPanel({ d, ro, apply, flush, fonts }: PanelProps & { fonts: Fonts }) {
  return <div className="bb-fonts" data-testid="bb-fonts-panel">
    {(['heading', 'body'] as const).map((role) => <FontSlot key={role} role={role} d={d} ro={ro} apply={apply} flush={flush} fonts={fonts} />)}
    {!ro && <small className="helper">Fonts are kept on this computer and used on Ad cards, the logo stamp and the brand sheet. Google Fonts are downloaded once, with their licence. For a font you upload, you’re responsible for its licence.</small>}
  </div>;
}
function FontSlot({ role, d, ro, apply, flush, fonts }: { role: FontRole; d: BrandKit; ro: boolean; apply: (k: BrandKit) => void; flush: () => Promise<void>; fonts: Fonts }) {
  const name = d.fonts[role]; const src = fontSource(d, role, fonts); const file = d.fontFiles.find((f) => f.role === role);
  const [q, setQ] = useState(''); const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const input = useRef<HTMLInputElement>(null);
  const run = async (label: string, f: () => Promise<BrandKit>) => { setBusy(label); setErr(''); try { await flush(); apply(await f()); setQ(''); } catch (e: any) { setErr(e.message); } finally { setBusy(''); } };
  const google = (family: string) => fonts.find((x) => x.name.toLowerCase() === family.trim().toLowerCase())?.inApp
    ? run('Saving…', () => api('PATCH', `/api/brand-kits/${d.id}`, { fonts: { ...d.fonts, [role]: fonts.find((x) => x.name.toLowerCase() === family.trim().toLowerCase())!.name } }))
    : run('Downloading…', () => api('POST', `/api/brand-kits/${d.id}/font/google`, { family: family.trim(), role }));
  const upload = (f: File) => run('Uploading…', () => { const fd = new FormData(); fd.append('file', f, f.name); return api('POST', `/api/brand-kits/${d.id}/font?role=${role}&family=${encodeURIComponent(BK.familyOfFileName(f.name))}`, fd); });
  const listId = `bb-gf-${role}`;
  return <div className="bb-font" data-testid={`bb-font-${role}`}>
    <span className="bb-font-top"><span className="bk-lbl">{role === 'heading' ? 'Headings' : 'Body text'}</span><span className="bb-src" title={src.label}>{src.label}</span></span>
    {name ? <span className="bb-spec" style={{ fontFamily: cssFamily(name) }} data-testid={`bb-spec-${role}`}>
      <span className="bb-spec-aa">Aa</span><span className="bb-spec-name">{name}</span>
      <span className={`bb-spec-line${role === 'heading' ? ' h' : ''}`}>{role === 'heading' ? `${d.name}: made with care` : 'The quick brown fox jumps over the lazy dog. 0123456789 £€$ &?!'}</span>
    </span> : <span className="bb-spec bb-spec-none">Uses the app font until you pick one.</span>}
    {file && <small className="bb-lic">{file.source === 'google' ? <>Licence: {file.licence} · <a href={file.sourceUrl} target="_blank" rel="noreferrer">Google Fonts page</a></> : 'Your own file: check its licence before you share what you make.'}</small>}
    {src.nameOnly && !ro && <small className="bb-lic">This brand names {name} but the font isn’t on this computer, so a stand-in shows. <button type="button" className="bb-link" disabled={!!busy} onClick={() => void google(name)}>Download it from Google Fonts</button> or upload the file.</small>}
    {!ro && <div className="bb-font-acts">
      <form className="bb-gf" onSubmit={(e) => { e.preventDefault(); if (q.trim()) void google(q); }}>
        <input className="bk-input" list={listId} value={q} placeholder="Google Font name, e.g. Fraunces" aria-label={`Google Font for ${role === 'heading' ? 'headings' : 'body text'}`} maxLength={BK.BRAND_LIMITS.font} data-testid={`bb-gf-${role}`} onChange={(e) => setQ(e.target.value)} />
        <datalist id={listId}>{fonts.map((f) => <option key={f.name} value={f.name} />)}</datalist>
        <button type="submit" className="btn btn-sm" disabled={!q.trim() || !!busy}>{fonts.find((x) => x.name.toLowerCase() === q.trim().toLowerCase())?.inApp ? 'Use' : 'Download'}</button>
      </form>
      <span className="bb-acts">
        <button type="button" className="btn btn-sm btn-ghost" disabled={!!busy} data-testid={`bb-font-upload-${role}`} onClick={() => input.current?.click()}>Upload font file</button>
        <input ref={input} type="file" accept={FONT_ACCEPT} hidden data-testid={`bb-font-in-${role}`} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
        {name && <button type="button" className="btn btn-sm btn-ghost" disabled={!!busy} data-testid={`bb-font-remove-${role}`} onClick={() => void run('Removing…', () => api('DELETE', `/api/brand-kits/${d.id}/font?role=${role}`))}>Remove</button>}
        {busy && <small className="helper" role="status">{busy}</small>}
      </span>
    </div>}
    {err && <p className="bk-err" role="alert">{err}</p>}
  </div>;
}

/* ---------------------------------------------------------------- mood and rules */
export function MoodPanel({ d, ro, patch }: PanelProps) {
  const [dd, setDd] = useState({ dos: d.dos.join('\n'), donts: d.donts.join('\n') }); /* the boxes as typed (blank lines kept while typing) */
  const phrase = BK.brandPhrase(d, 'image');
  return <div className="bb-mood">
    <label className="bb-field"><span className="bk-lbl">Mood <small>{d.mood.length}/{BK.BRAND_LIMITS.mood}</small></span>
      <textarea className="bk-input bk-mood" rows={3} value={d.mood} readOnly={ro} maxLength={BK.BRAND_LIMITS.mood} placeholder="e.g. warm, playful, premium" data-testid="bk-mood" onChange={(e) => patch({ mood: e.target.value.replace(/\n/g, ' ') })} /></label>
    {(['dos', 'donts'] as const).map((k) => <label key={k} className="bb-field"><span className="bk-lbl">{k === 'dos' ? 'Do' : 'Don’t'}</span>
      <textarea className="bk-input" rows={3} readOnly={ro} value={dd[k]} placeholder={k === 'dos' ? 'One per line, e.g. Soft daylight' : 'One per line, e.g. Neon colours'} data-testid={`bk-${k}`}
        onChange={(e) => { const v = e.target.value; setDd((x) => ({ ...x, [k]: v })); patch({ [k]: v.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, BK.BRAND_LIMITS.lines).map((x) => x.slice(0, BK.BRAND_LIMITS.line)) } as Partial<BrandKit>); }} /></label>)}
    <small className="helper">Do and don’t lines go on the brand sheet and into the tokens file; they aren’t added to prompts.</small>
    <div className="bb-field"><span className="bk-lbl">What Brand adds to your prompt</span>
      <p className="bk-phrase" data-testid="bk-preview">{phrase || 'Nothing yet: add colours or a mood.'}</p>
      <small className="helper">Turn on <b>Brand</b> in the Image, Video or Audio bar. Audio gets the mood only. Same model, same price.</small></div>
  </div>;
}

/* ---------------------------------------------------------------- examples */
export function ExamplesPanel({ d, ro, patch, apply, flush }: PanelProps) {
  const toast = useToast();
  const add = () => pickMedia({ accept: IMAGE_ACCEPT, title: 'Pick example results', limits: `Up to ${BK.BRAND_LIMITS.examples} images for the brand sheet`, multiple: true, max: BK.BRAND_LIMITS.examples - d.examples.length, frames: false, onFiles: async (fs) => {
    const room = BK.BRAND_LIMITS.examples - d.examples.length; if (room <= 0) { toast(`Up to ${BK.BRAND_LIMITS.examples} examples. Remove one first.`, 'warn'); return; }
    const lib = fs.slice(0, room).map((f) => libraryUrlOf(f)).filter((u): u is string => !!u && BK.isMediaUrl(u)); const up = fs.slice(0, room).filter((f) => !libraryUrlOf(f));
    try { await flush(); let k: BrandKit | null = null; if (lib.length) k = await api('PATCH', `/api/brand-kits/${d.id}`, { examples: [...d.examples, ...lib] });
      for (const f of up) { const fd = new FormData(); fd.append('file', f, f.name || 'example.png'); k = await api('POST', `/api/brand-kits/${d.id}/examples`, fd); }
      if (k) apply(k); } catch (e: any) { toast(e.message, 'warn'); } } });
  return <div className="bk-ex" data-testid="bk-examples">
    {d.examples.map((u) => <span key={u} className="bk-ex-tile"><img src={u} alt="" loading="lazy" />{!ro && <button type="button" className="bk-x bk-ex-x" aria-label="Remove example" onClick={() => patch({ examples: d.examples.filter((x) => x !== u) })}>×</button>}</span>)}
    {!ro && d.examples.length < BK.BRAND_LIMITS.examples && <button type="button" className="bk-ex-tile bk-ex-add" data-testid="bk-add-example" onClick={add}><span aria-hidden>+</span><small>Pick results</small></button>}
    <p className="helper">Up to {BK.BRAND_LIMITS.examples} of your results, shown on the brand sheet.</p>
  </div>;
}
