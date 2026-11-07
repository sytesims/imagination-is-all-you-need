/** "Add plugin ▾": the ways to add one. Browse works now (the ones ready to install); a link, a file and Claude making one come later. */
import type { RefObject } from 'react';
import { Popover } from '../../shared/Popover';
import { DownloadIcon, LinkIcon, DocsIcon, GenerateIcon } from '../Icons';

const LATER: { id: string; t: string; d: string; I: typeof LinkIcon }[] = [
  { id: 'link', t: 'From a link', d: 'Paste a link someone shared with you', I: LinkIcon },
  { id: 'file', t: 'From a file', d: 'A plugin or ComfyUI workflow on this computer', I: DocsIcon },
  { id: 'claude', t: 'Ask Claude to make one', d: 'Describe it, see a preview, then install', I: GenerateIcon },
];

export function AddPluginMenu({ open, anchor, onClose, onBrowse }: { open: boolean; anchor: RefObject<HTMLElement | null>; onClose: () => void; onBrowse: () => void }) {
  return <Popover open={open} anchor={anchor} onClose={onClose} label="Add plugin" role="menu" placement="bottom" align="end" width={340} className="pgx-pop pgx-add" testId="plugins-add-menu">
    <div className="pgx-add-list">
      <button type="button" role="menuitem" className="pgx-mi" onClick={onBrowse} data-testid="plugins-add-browse">
        <span className="pgx-tile pgx-tile-sm" aria-hidden><DownloadIcon size={15} /></span><span className="pgx-rt"><b>Browse plugins</b><small>Ready-made ones from us and others, with previews</small></span></button>
      {LATER.map(({ id, t, d, I }) => <button key={id} type="button" role="menuitem" className="pgx-mi" disabled aria-disabled="true" data-testid={`plugins-add-${id}`}>
        <span className="pgx-tile pgx-tile-sm" aria-hidden><I size={15} /></span><span className="pgx-rt"><b>{t}<span className="pgx-tag pgx-tag-soon">Coming later</span></b><small>{d}</small></span></button>)}
    </div>
  </Popover>;
}
