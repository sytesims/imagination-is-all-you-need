import { useEffect, useRef, useState } from 'react';
/** Expressive TTS tag chips (e.g. comfy-drama3). Tags come from tool.app.metaTags [{tag,label,category}].
 *  Click inserts at the cursor; tags with "…" wrap the selection, or select the "…" so typing replaces it. Free-text [direction] tags too. */
export type MetaTag = { tag: string; label: string; category: string };
/** Per model (server tools/voiceTags.ts META_TAG_STYLES): custom null = only the listed tags (MiniMax), help = the model's own rule in one line. */
export type MetaTagStyle = { custom: 'square' | null; help: string };
/** The chips for a provider: per-provider lists first (prompt grammar step 2), else the older single list (Drama 3). */
export const metaTagsFor = (cfg: any, provider: string): { tags: MetaTag[]; style?: MetaTagStyle } => {
  const by = cfg?.metaTagsByProvider?.[provider]; if (Array.isArray(by)) return { tags: by, style: cfg?.metaTagStyles?.[provider] };
  return { tags: (cfg?.metaTagProviders ?? []).includes(provider) ? (cfg?.metaTags ?? []) : [] }; };
const ORDER = ['point', 'scoped', 'style', 'pause', 'direction', 'speaker', 'hint'];
const CAT: Record<string, string> = { point: 'Sounds', scoped: 'Wrap text', style: 'Style', pause: 'Pauses', direction: 'Direction', speaker: 'Speakers', hint: 'Hints' };
export function insertTag(el: HTMLTextAreaElement | null, value: string, tag: string, set: (v: string) => void) {
  const s = el?.selectionStart ?? value.length, e = el?.selectionEnd ?? value.length; const selText = value.slice(s, e);
  const i = tag.indexOf('…'); let ins = tag, selFrom = -1, selTo = -1;
  if (i >= 0 && selText) ins = tag.slice(0, i) + selText + tag.slice(i + 1);
  else if (i >= 0) { selFrom = s + i; selTo = selFrom + 1; }
  const v = value.slice(0, s) + ins + value.slice(e); set(v);
  requestAnimationFrame(() => { if (!el) return; el.focus(); if (selFrom >= 0) el.setSelectionRange(selFrom, selTo); else { const p = s + ins.length; el.setSelectionRange(p, p); } });
}
export default function MetaTagChips({ tags, target, value, onChange, provider, style }: { tags: MetaTag[]; target: () => HTMLTextAreaElement | null; value: string; onChange: (v: string) => void; provider?: string; style?: MetaTagStyle }) {
  const [custom, setCustom] = useState(''); const [open, setOpen] = useState(false); const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const d = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); }; const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false); addEventListener('mousedown', d); addEventListener('keydown', k); return () => { removeEventListener('mousedown', d); removeEventListener('keydown', k); }; }, [open]);
  const cats = ORDER.filter(c => tags.some(t => t.category === c)).concat([...new Set(tags.map(t => t.category))].filter(c => !ORDER.includes(c)));
  const addCustom = () => { const t = custom.trim().replace(/^\[|\]$/g, ''); if (!t) return; insertTag(target(), value, `[${t}] `, onChange); setCustom(''); };
  return <div className="meta-tags mt-pop-wrap" ref={box} data-provider={provider}>
    <div className="mt-bar"><button type="button" className={`mt-toggle ${open ? 'on' : ''}`} aria-expanded={open} aria-haspopup="true" onMouseDown={e => e.preventDefault()} onClick={() => setOpen(o => !o)}><span aria-hidden>[ ]</span> Tags <small>{tags.length}</small></button><span className="helper mt-hint">Add sounds, whispers and direction. Or type your own [tag].</span></div>
    {open && <div className="mt-pop" ref={el => { if (el && !el.dataset.shown) { el.dataset.shown = '1'; requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest' })); } }} role="dialog" aria-label="Voice tags">
    {cats.map(c => <div key={c} className={`mt-group mt-${c}`}><span className="mt-cat">{CAT[c] ?? c}</span>
      <div className="mt-chips">{tags.filter(t => t.category === c).map(t => <button key={t.tag} type="button" className="mt-chip" title={t.tag.trim()} onMouseDown={e => e.preventDefault()} onClick={() => insertTag(target(), value, t.tag, onChange)}>{t.label}</button>)}</div></div>)}
    {style?.custom !== null && <div className="mt-group mt-custom"><span className="mt-cat">Your own</span>
      <div className="mt-chips"><input className="mt-input" placeholder="e.g. tired, half-laughing" value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} aria-label="Custom direction tag" />
        <button type="button" className="mt-chip mt-add" onMouseDown={e => e.preventDefault()} onClick={addCustom} disabled={!custom.trim()}>Insert [ ]</button></div></div>
    }<p className="helper mt-help" data-testid="mt-help">{style?.help ?? 'Type any direction in [brackets] anywhere in the script.'}</p>
    </div>}
  </div>;
}
