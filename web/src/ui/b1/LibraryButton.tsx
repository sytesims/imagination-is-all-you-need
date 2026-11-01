import { AssetsIcon, LibraryIcon } from '../Icons';
import { pickMedia } from '../../shared/MediaPicker';
import { IMAGE_ACCEPT, VIDEO_ACCEPT } from '../../../../server/src/shared/mediaAccept';
/** "Choose from library" button: opens the one media picker (shared/MediaPicker.tsx) for this slot's kind and emits Files into an
 *  existing upload handler (a library pick is a File tagged with its URL, sent by reference at submit). */
export default function LibraryButton({ kind, onFiles, label = 'Choose from library', icon }: { kind: 'video' | 'image'; onFiles: (f: File[]) => void; label?: string; /** an UploadZone action: a square icon button with the label as its tooltip */ icon?: boolean }) {
  const open = () => pickMedia({ accept: kind === 'video' ? VIDEO_ACCEPT : IMAGE_ACCEPT, multiple: kind === 'image', title: kind === 'video' ? 'Choose a video' : 'Choose images', onFiles });
  return icon ? <button type="button" className="uz-act" aria-label={label} title={label} onClick={open}><LibraryIcon size={16} /></button>
    : <button type="button" className="btn btn-sm lib-btn" onClick={open}><AssetsIcon size={14} />{label}</button>;
}
