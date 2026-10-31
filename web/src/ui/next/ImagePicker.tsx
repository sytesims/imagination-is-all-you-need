/**
 * Create Image's picker: the shared MediaPicker (shared/MediaPicker.tsx) placed in the bar's dock (imageCanvas.css .ic-dock .ic-ref).
 * Plain Create's "+" and its photo thumbnails open it for Create's own photos; a workflow slot (Face Swap's Face / Target, Relight's
 * Photo…) opens it for that slot. Every other upload slot in the app opens the same picker through MediaPickerHost.
 */
import { MediaPicker, withNativePicker, type PickTab } from '../../shared/MediaPicker';

/* Elements (saved @name characters/products/places) were removed from the app (user, 2026-10-23): uploads, past generations and looks cover reusing references */
export type { PickTab };

export function ImagePicker({ tab, setTab, onClose, target, onFile, onUpload, onFiles, limits }: {
  tab: PickTab; setTab: (t: PickTab) => void; onClose: () => void;
  /** a workflow slot's label ("Face") when the picker fills a slot; null = Create's own photos */ target: string | null;
  /** a library photo, already a File tagged with its URL (sent by reference at submit) */ onFile: (f: File) => void;
  /** Upload from your computer (opens Finder on the bar's input) */ onUpload: () => void;
  /** photos dropped or pasted on the panel */ onFiles: (f: File[]) => void; limits?: string;
}) {
  const title = !target ? 'Choose pictures' : /^(photo|image|picture)$/i.test(target.trim()) ? 'Choose a picture' : `Choose a picture for ${target}`;
  return <MediaPicker tab={tab} setTab={setTab} onClose={onClose} title={title} target={target} kinds={['image']} multiple={!target} accepts="PNG, JPG or WebP"
    limits={limits ?? (target ? 'One picture · PNG, JPG or WebP' : 'PNG, JPG or WebP')}
    onFile={f => onFile(f)} onFiles={onFiles} onUpload={() => withNativePicker(onUpload)} />;
}
