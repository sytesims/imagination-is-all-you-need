/** Canvas tool icons: original drawings in the app's icon style (24 grid, 1.5 stroke, round caps, currentColor; ui/Icons.tsx rules).
 *  Kept with the canvas so the main bundle doesn't carry them. */
import type { ReactNode } from 'react';
/* Each icon is a named component (CanvasIcon), so React Fast Refresh treats this module as components only and hot-reloads it in place. */
const I = (body: ReactNode) => { const CanvasIcon = ({ size = 18 }: { size?: number }) =>
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{body}</svg>; return CanvasIcon; };

export const SelectIcon = I(<path d="M5.5 4 18 10.5l-5.6 1.9L10 18z" />);
export const HandIcon = I(<><path d="M8 12.5V6.75a1.25 1.25 0 0 1 2.5 0V11" /><path d="M10.5 10.5V5.25a1.25 1.25 0 0 1 2.5 0v5.25" /><path d="M13 10.5V6.25a1.25 1.25 0 0 1 2.5 0V11" /><path d="M15.5 11V8.75a1.25 1.25 0 0 1 2.5 0V14a6.5 6.5 0 0 1-6.5 6.5h-.6a5.5 5.5 0 0 1-4.3-2.1L4.4 15.6a1.3 1.3 0 0 1 1.9-1.7L8 15.5" /></>);
export const PenIcon = I(<><path d="M4 20c3-1 4.5-3 6.5-5.5L18 7a2.1 2.1 0 0 0-3-3l-7.5 7.5C5 13.5 4.8 16.5 4 20z" /><path d="m13.5 5.5 3 3" /></>);
export const EraserIcon = I(<><path d="m14.5 4.5 5 5-9 9H6l-2.5-2.5a1.5 1.5 0 0 1 0-2.1z" /><path d="M9.5 9.5l5 5M11 20h9" /></>);
export const RectIcon = I(<rect x="4" y="5.5" width="16" height="13" rx="2" />);
export const EllipseIcon = I(<ellipse cx="12" cy="12" rx="8.5" ry="7" />);
export const ArrowIcon = I(<><path d="M5 19 19 5" /><path d="M10 5h9v9" /></>);
export const TextIcon = I(<><path d="M5 7V5h14v2" /><path d="M12 5v14M9.5 19h5" /></>);
export const NoteIcon = I(<><path d="M5 4h14v10l-5 6H5z" /><path d="M14 20v-6h5" /></>);
export const FrameIcon = I(<><path d="M8 3v18M16 3v18M3 8h18M3 16h18" /></>);
export const ImageAddIcon = I(<><rect x="3.5" y="4.5" width="13" height="13" rx="2.5" /><path d="m3.5 14 3.5-3.5 4 4 1.5-1.5 4 4" /><path d="M19.5 15v6M16.5 18h6" /></>);
export const ZoomInIcon = I(<path d="M12 6v12M6 12h12" />);
export const ZoomOutIcon = I(<path d="M6 12h12" />);
export const FitIcon = I(<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />);
export const BoardIcon = I(<><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M7.5 9h4M7.5 12.5h7" /></>);
export const ChevronIcon = I(<path d="m6.5 9.5 5.5 5.5 5.5-5.5" />);
export const PanelIcon = I(<><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><path d="M14.5 4v16" /></>);
/* step 2: generate cards */
export const PlusIcon = I(<path d="M12 5v14M5 12h14" />);
export const ChevronLeftIcon = I(<path d="m14.5 6-6 6 6 6" />);
export const ChevronRightIcon = I(<path d="m9.5 6 6 6-6 6" />);
export const PullOutIcon = I(<><rect x="3.5" y="6.5" width="10" height="11" rx="2" /><path d="M13.5 12H21M17.5 8.5 21 12l-3.5 3.5" /></>);
export const RetryIcon = I(<><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path d="M4.5 4.5v4h4" /></>);
export const WandIcon = I(<><path d="m4 20 10.5-10.5" /><path d="m13 8 3 3" /><path d="M17 3v3M15.5 4.5h3M20 8v2M19 9h2M9 3.5v2M8 4.5h2" /></>);
export const CopyIcon = I(<><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></>);
export const ExtendIcon = I(<><rect x="3.5" y="6.5" width="11" height="11" rx="2.5" /><path d="M17.5 9.5 20.5 12l-3 2.5M14.5 12h6" /></>);
export const CaretIcon = I(<path d="m7 10 5 5 5-5" />);
export const CoinIcon = I(<><circle cx="12" cy="12" r="8" /><path d="M14.5 9.5c-.4-.8-1.3-1.2-2.5-1.2-1.5 0-2.5.8-2.5 1.8 0 2.4 5 1.3 5 3.8 0 1-1.1 1.8-2.5 1.8-1.3 0-2.2-.5-2.6-1.3M12 7v1.3M12 15.7V17" /></>);
/* new node kinds */
export const PromptIcon = I(<><path d="M4.5 6.5h15M4.5 11h10M4.5 15.5h12M4.5 20h7" /><path d="M18 14.5v4M16 16.5h4" /></>);
export const UploadIcon = I(<><path d="M12 15V4M8 8l4-4 4 4" /><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" /></>);
export const CompareIcon = I(<><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><path d="M12 3.5v17" /><path d="m7 10 2-2 2 2M17 14l-2 2-2-2" /></>);
export const TidyIcon = I(<><rect x="3.5" y="5" width="6" height="5" rx="1.4" /><rect x="14.5" y="5" width="6" height="5" rx="1.4" /><rect x="3.5" y="14" width="6" height="5" rx="1.4" /><rect x="14.5" y="14" width="6" height="5" rx="1.4" /><path d="M9.5 7.5h5M9.5 16.5h5" /></>);
export const GroupIcon = I(<><path d="M8 3.5H5.5A2 2 0 0 0 3.5 5.5V8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16" /><rect x="8.5" y="8.5" width="7" height="7" rx="1.5" /></>);
export const CheckIcon = I(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const StopIcon = I(<rect x="7" y="7" width="10" height="10" rx="2" />);
export const SendIcon = I(<><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></>);
export const DockIcon = I(<><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><path d="M9.5 4v16" /></>);
/* tldraw's sticky note tool in the rail (2026-10-27) */
export const StickyIcon = I(<><path d="M5 5h14v9.5L14.5 19H5z" /><path d="M14.5 19v-4.5H19" /><path d="M8.5 9h7M8.5 12h4" /></>);
