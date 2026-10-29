/**
 * Brands › Export (2026-10-28): one Export button that opens a menu grouped by where the brand is going (Design, Adobe, Drawing, Sketch, 3D and
 * open source, Code, Images). Each row names the app and says in one line what you get. Files are built in the browser: tokens and code from
 * shared/brandKit, swatch files from shared/brandPalettes (our own writers), PNGs from brandCanvas. Uses the shared Popover (a bottom sheet on phones).
 * Affinity has no row: its palette file isn't publicly described.
 */
import { useRef, useState } from 'react';
import { Popover } from '../../shared/Popover';
import { WorksWith } from '../../shared/WorksWith';
import { DownloadIcon } from '../Icons';
import * as BK from '../../../../server/src/shared/brandKit';
import type { BrandKit } from '../../../../server/src/shared/brandKit';
import { paletteFileOf, type PaletteKind } from '../../../../server/src/shared/brandPalettes';
import { drawBrandSheet, drawPalette, saveFile } from './brandCanvas';

export type BrandExport = 'tokens' | 'hex' | PaletteKind | 'css' | 'tailwind' | 'sheet' | 'palette';
type Row = { id: BrandExport; app: string; hint: string; tag: string; needsColours?: boolean };
export const EXPORT_GROUPS: { label: string; rows: Row[] }[] = [
  { label: 'Design', rows: [
    { id: 'tokens', app: 'Figma', hint: 'For our Brand Kit plugin or Tokens Studio', tag: '.json' },
    { id: 'hex', app: 'Canva', hint: 'Copies your hex colours for Brand Kit', tag: 'Copy', needsColours: true },
  ] },
  { label: 'Adobe', rows: [{ id: 'ase', app: 'Photoshop and Illustrator', hint: 'Swatches panel › Import Swatches', tag: '.ase', needsColours: true }] },
  { label: 'Drawing', rows: [{ id: 'procreate', app: 'Procreate', hint: 'Open it on your iPad', tag: '.swatches', needsColours: true }] },
  { label: 'Sketch', rows: [{ id: 'sketch', app: 'Sketch', hint: 'Needs the free Sketch Palettes plugin', tag: '.sketchpalette', needsColours: true }] },
  { label: '3D and open source', rows: [{ id: 'gpl', app: 'Blender and GIMP', hint: 'Import in GIMP, or Blender’s palette add-on', tag: '.gpl', needsColours: true }] },
  { label: 'Code', rows: [
    { id: 'css', app: 'CSS variables', hint: 'Copies a :root block', tag: 'Copy' },
    { id: 'tailwind', app: 'Tailwind theme', hint: 'Copies a theme.extend block', tag: 'Copy' },
  ] },
  { label: 'Images', rows: [
    { id: 'sheet', app: 'Brand sheet', hint: 'Logo, colours, fonts and rules', tag: '.png' },
    { id: 'palette', app: 'Palette', hint: 'One swatch per colour with its hex', tag: '.png', needsColours: true },
  ] },
];

/** Build and save (or copy) one export. Returns the toast text for copies, '' for downloads. */
export async function runBrandExport(k: BrandKit, what: BrandExport): Promise<string> {
  const slug = BK.kitSlug(k.name);
  if (what === 'tokens') { saveFile(JSON.stringify(BK.tokensOf(k), null, 2) + '\n', `${slug}.tokens.json`); return ''; }
  if (what === 'sheet') { saveFile(await drawBrandSheet(k), `${slug}-brand-sheet.png`); return ''; }
  if (what === 'palette') { saveFile(await drawPalette(k), `${slug}-palette.png`); return ''; }
  if (what === 'ase' || what === 'procreate' || what === 'gpl' || what === 'sketch') { const f = paletteFileOf(k, what); saveFile(typeof f.data === 'string' ? f.data : new Blob([f.data as BlobPart], { type: f.mime }), f.name, f.mime); return ''; }
  const txt = what === 'css' ? BK.cssVarsOf(k) : what === 'tailwind' ? BK.tailwindOf(k) : BK.hexListOf(k);
  await navigator.clipboard.writeText(txt);
  return what === 'css' ? 'CSS variables copied.' : what === 'tailwind' ? 'Tailwind theme copied.' : 'Hex colours copied. Paste them into Canva’s Brand Kit.';
}

/** The Export button and its grouped menu. `prepare` saves pending edits first and hands back the kit to export. */
export function BrandExportMenu({ kit, prepare, onDone, onError, testId = 'bk-export-btn' }: { kit: BrandKit; prepare: () => Promise<BrandKit>; onDone: (msg: string) => void; onError: (msg: string) => void; testId?: string }) {
  const [open, setOpen] = useState(false); const btn = useRef<HTMLButtonElement>(null); const noColours = !kit.colors.length;
  const pick = (id: BrandExport) => async () => { setOpen(false); try { const msg = await runBrandExport(await prepare(), id); onDone(msg); } catch (e: any) { onError(e?.message || 'Couldn’t export that.'); } };
  return <>
    <button ref={btn} type="button" className="btn btn-sm bk-exp-btn" aria-haspopup="menu" aria-expanded={open} data-testid={testId} onClick={() => setOpen(o => !o)}>
      <DownloadIcon size={15} />Export<i className="bk-exp-caret" aria-hidden>▾</i></button>
    <Popover open={open} anchor={btn} onClose={() => setOpen(false)} label={`Export ${kit.name}`} role="menu" placement="bottom" align="start" testId="bk-export-menu" className="bk-menu bk-exp-menu">
      <div className="bk-menu-in bk-exp-in">
        {EXPORT_GROUPS.map(g => <div key={g.label} role="group" aria-label={g.label} className="bk-exp-group">
          <span className="bk-exp-gl" aria-hidden>{g.label}</span>
          {g.rows.map(r => { const off = !!r.needsColours && noColours;
            return <button key={r.id} type="button" role="menuitem" className="bk-mi bk-exp-row" disabled={off} data-testid={`bk-exp-${r.id}`} onClick={pick(r.id)}>
              <span className="bk-exp-t"><b>{r.app}</b><small>{off ? 'Add a colour first' : r.hint}</small></span><em className="bk-exp-tag">{r.tag}</em></button>; })}
        </div>)}
      </div>
    </Popover>
  </>;
}

/** The quiet line under the Export button. */
export const BrandWorksWith = () => <WorksWith testId="bk-works-with">Opens in Figma, Canva, Photoshop, Illustrator, Procreate, Sketch, Blender and GIMP, or your code.</WorksWith>;
