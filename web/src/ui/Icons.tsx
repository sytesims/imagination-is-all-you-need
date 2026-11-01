/**
 * Imagination Is All You Need icon set. Original drawings on a 24px grid, 1.5px stroke,
 * round caps/joins, currentColor. A few glyphs (search, trash, download, upload,
 * heart, more) follow common conventions as in Lucide (MIT); see ASSETS-CREDITS.md.
 */
import type { ReactNode } from 'react';

export interface IconProps { size?: number; className?: string; title?: string; strokeWidth?: number }

function svg(body: ReactNode, displayName: string) {
  const C = ({ size = 18, className, title, strokeWidth = 1.5 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}{body}
    </svg>
  );
  C.displayName = displayName;
  return C;
}

/* ---- Tools ---- */
export const ObjectSwapIcon = svg(<><rect x="3" y="3" width="8" height="8" rx="2" /><circle cx="17" cy="17" r="4" /><path d="M14 5.5h3.5a2 2 0 0 1 2 2V10" /><path d="m17.5 8.5 2 2 2-2" /><path d="M10 18.5H6.5a2 2 0 0 1-2-2V14" /><path d="m6.5 15.5-2-2-2 2" /></>, 'ObjectSwapIcon');
export const MotionTransferIcon = svg(<><circle cx="15.5" cy="4.5" r="1.75" /><path d="m11 21 2.5-5.5L11 13l2-5 3 2.5 3 .5" /><path d="m13 8-3.5 1-1.5 3" /><path d="M13.5 15.5 17 17l1 4" /><path d="M2.5 10h3M2 14h3.5M3 18h3.5" /></>, 'MotionTransferIcon');
export const RestyleIcon = svg(<><path d="M14.5 3.5 20.5 9.5 12 18l-6-6z" /><path d="m6 12-2.2 2.2a2 2 0 0 0 0 2.8l3.2 3.2a2 2 0 0 0 2.8 0L12 18" /><path d="M17.5 6.5 19 5" /><circle cx="20" cy="19" r="1" /><path d="M16.5 14.5 18 16" /></>, 'RestyleIcon');
export const ReshootIcon = svg(<><rect x="3" y="7" width="12" height="10" rx="2" /><path d="m15 10.5 5-2.5v8l-5-2.5" /><path d="M6 4.5a8 8 0 0 1 9.5-.5" /><path d="m14 2.5 1.6 1.5-1.6 1.6" /></>, 'ReshootIcon');
export const CameraMovesIcon = svg(<><rect x="7" y="7" width="10" height="8" rx="2" /><path d="M10 15v3l-2 3M14 15v3l2 3M12 18v3" /><path d="M3 9v4M21 9v4" /><path d="m4.5 7.5-1.5 1.5 1.5 1.5M19.5 7.5 21 9l-1.5 1.5" /></>, 'CameraMovesIcon');
export const CutoutIcon = svg(<><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" /><circle cx="12" cy="9.5" r="2.5" /><path d="M7.5 17a4.5 4.5 0 0 1 9 0" /></>, 'CutoutIcon');
export const PhotoFxIcon = svg(<><rect x="3" y="5" width="15" height="15" rx="2.5" /><path d="m3 16 4-4 4 4 2-2 5 5" /><path d="M19 2v4M17 4h4" /><circle cx="13.5" cy="9.5" r="1.25" /></>, 'PhotoFxIcon');
export const UpscaleIcon = svg(<><rect x="3" y="13" width="8" height="8" rx="2" /><path d="M3 9V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M14 10l4-4M14 6h4v4" /></>, 'UpscaleIcon');
/** Face Swap: two faces with a swap arc (our own drawing). */
export const FaceSwapIcon = svg(<><circle cx="7" cy="14" r="4" /><circle cx="17" cy="14" r="4" /><path d="M5.5 13.5h.01M8.5 13.5h.01M15.5 13.5h.01M18.5 13.5h.01" /><path d="M7 6.5a7 7 0 0 1 10 0" /><path d="m15.2 4.6 1.8 1.9-2.3.9" /></>, 'FaceSwapIcon');
/** Shots: a 3 × 3 contact sheet with the centre frame marked (our own drawing). */
export const ShotsIcon = svg(<><rect x="3" y="3" width="5" height="5" rx="1" /><rect x="9.5" y="3" width="5" height="5" rx="1" /><rect x="16" y="3" width="5" height="5" rx="1" /><rect x="3" y="9.5" width="5" height="5" rx="1" /><rect x="9.5" y="9.5" width="5" height="5" rx="1.5" strokeWidth="2" /><rect x="16" y="9.5" width="5" height="5" rx="1" /><rect x="3" y="16" width="5" height="5" rx="1" /><rect x="9.5" y="16" width="5" height="5" rx="1" /><rect x="16" y="16" width="5" height="5" rx="1" /></>, 'ShotsIcon');
export const ImageIcon = svg(<><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="1.75" /><path d="m21 15-4.5-4.5L6 21" /></>, 'ImageIcon');
/** 3D (2026-10-23): a cube in perspective. */
export const CubeIcon = svg(<><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /></>, 'CubeIcon');
export const AudioIcon = svg(<><path d="M3 10v4M7 7v10M11 4v16M15 8v8M19 6v12" /></>, 'AudioIcon');
export const VideoIcon = svg(<><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 9.5v5l4-2.5z" /></>, 'VideoIcon');
/** A film strip with its last frame picked, and an arrow on: "Continue from last frame" (2026-10-26). */
export const LastFrameIcon = svg(<><path d="M3 6.5h12M3 17.5h12" /><rect x="3" y="4" width="12" height="16" rx="2" /><rect x="10" y="8.5" width="5" height="7" rx="1" fill="currentColor" fillOpacity=".25" /><path d="M18 12h3.5M19.5 10l2 2-2 2" /></>, 'LastFrameIcon');
/** A film frame with a still lifted out of it: "Use this frame" / "Save frame as image" (2026-10-26). */
export const FrameGrabIcon = svg(<><rect x="3" y="5" width="13" height="10" rx="2" /><path d="M6 5v10M13 5v10" /><rect x="10" y="11" width="11" height="9" rx="2" /><path d="m11.5 18.5 2.5-2.5 2 2 1.5-1.5 2 2" /></>, 'FrameGrabIcon');
export const ExtendIcon = svg(<><rect x="3" y="6" width="11" height="12" rx="2.5" /><path d="M7.5 10v4l3-2z" /><path d="M17 12h4.5M19.5 10l2 2-2 2" /></>, 'ExtendIcon');
export const DirectorIcon = svg(<><rect x="3" y="10" width="18" height="10" rx="2" /><path d="M3 10V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3" /><path d="m7.5 5 3 5M13 5l3 5" /></>, 'DirectorIcon');
export const PortraitIcon = svg(<><rect x="3.5" y="3" width="17" height="18" rx="3" /><circle cx="12" cy="10" r="3" /><path d="M6.5 21a5.5 5.5 0 0 1 11 0" /></>, 'PortraitIcon');
export const ReframeIcon = svg(<><rect x="3" y="7" width="18" height="10" rx="2" /><rect x="8.5" y="3" width="7" height="18" rx="2" /></>, 'ReframeIcon');
export const HdrIcon = svg(<><circle cx="12" cy="12" r="4.5" /><path d="M12 7.5a4.5 4.5 0 0 1 0 9z" fill="currentColor" stroke="none" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>, 'HdrIcon');
export const FpsIcon = svg(<><path d="M4 16a8 8 0 1 1 16 0" /><path d="m12 16 4-5" /><circle cx="12" cy="16" r="1" /><path d="M8 20h8" /></>, 'FpsIcon');
export const DepthIcon = svg(<><path d="m12 3 9 4.5-9 4.5-9-4.5z" /><path d="m3 12 9 4.5 9-4.5" /><path d="m3 16.5 9 4.5 9-4.5" /></>, 'DepthIcon');
export const CharacterSheetIcon = svg(<><rect x="2.5" y="4.5" width="19" height="15" rx="2" /><path d="M8.83 4.5v15M15.17 4.5v15" /><circle cx="5.67" cy="10" r="1.5" /><circle cx="12" cy="10" r="1.5" /><circle cx="18.33" cy="10" r="1.5" /><path d="M4 15.5a1.7 1.7 0 0 1 3.33 0M10.33 15.5a1.7 1.7 0 0 1 3.33 0M16.67 15.5a1.7 1.7 0 0 1 3.33 0" /></>, 'CharacterSheetIcon');
export const ProductIcon = svg(<><path d="m12 3 7.5 4.25v8.5L12 20l-7.5-4.25v-8.5z" /><path d="m4.5 7.25 7.5 4.25 7.5-4.25M12 11.5V20" /></>, 'ProductIcon');
export const BrushIcon = svg(<><path d="M20 4 10.5 13.5" /><path d="M10.5 13.5c-2.2 0-3.7 1.5-3.7 3.6 0 1.4-1 2.4-2.8 2.9 3.8 1.3 8.3.3 8.3-3.7z" /><path d="m15 6.5 2.5 2.5" /></>, 'BrushIcon');
/* Brush Edit mask sheet (2026-10-23): our own drawings */
/** Image to layers: three stacked sheets. */
export const LayerSheetsIcon = svg(<><path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z" /><path d="m3.5 12 8.5 4.5 8.5-4.5" /><path d="m3.5 16 8.5 4.5 8.5-4.5" /></>, 'LayerSheetsIcon');
export const EraserIcon = svg(<><path d="m14.5 4.5 5 5-9 9H6l-2.5-2.5a1.5 1.5 0 0 1 0-2.1z" /><path d="M9.5 9.5l5 5M10.5 18.5H20" /></>, 'EraserIcon');
/* Photo tools (2026-10-23): our own drawings. Expand = a photo inside a larger frame with arrows out; Garment = a T-shirt. */
export const ExpandIcon = svg(<><rect x="8" y="8" width="8" height="8" rx="1.5" /><path d="M3 7V4.5A1.5 1.5 0 0 1 4.5 3H7M17 3h2.5A1.5 1.5 0 0 1 21 4.5V7M21 17v2.5a1.5 1.5 0 0 1-1.5 1.5H17M7 21H4.5A1.5 1.5 0 0 1 3 19.5V17" /></>, 'ExpandIcon');
/* Material Swap (2026-10-31): our own drawing. An object (circle) with a hatched material swatch laid over its corner. */
export const MaterialIcon = svg(<><circle cx="9" cy="9" r="5.5" /><rect x="11" y="11" width="9.5" height="9.5" rx="1.5" /><path d="M11 15.5 15.5 11M11.5 20 20 11.5M15.5 20.5l5-5" /></>, 'MaterialIcon');
export const GarmentIcon = svg(<><path d="M9 3.5 4 6l-1.5 4.5L6 12v8.5h12V12l3.5-1.5L20 6l-5-2.5c-.4 1.4-1.6 2.3-3 2.3S9.4 4.9 9 3.5z" /></>, 'GarmentIcon');
export const UndoIcon = svg(<><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>, 'UndoIcon');
export const RedoIcon = svg(<><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></>, 'RedoIcon');
export const InvertIcon = svg(<><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M12 4v16" /><path d="M12 4h5.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H12z" fill="currentColor" stroke="none" /></>, 'InvertIcon');
export const FitIcon = svg(<><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" /></>, 'FitIcon');
export const PaletteIcon = svg(<><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.9 1.4-1.9l-.4-1c-.5-1.2.4-2.4 1.6-2.4H17a3.5 3.5 0 0 0 3.5-3.5C20.5 7 16.7 3.5 12 3.5z" /><circle cx="7.8" cy="11" r="1" /><circle cx="10.5" cy="7.5" r="1" /><circle cx="14.8" cy="7.8" r="1" /></>, 'PaletteIcon');
export const LinkIcon = svg(<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>, 'LinkIcon');
/** Copy: two offset rounded sheets (our own drawing). */
export const CopyIcon = svg(<><rect x="8.5" y="8.5" width="12" height="12" rx="2.5" /><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" /></>, 'CopyIcon');
export const LightIcon = svg(<><path d="M9.5 18h5M10.5 21h3" /><path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z" /></>, 'LightIcon');
/** Stitch: three frames joined on one strip (the Video page's timeline workflow). */
export const StitchIcon = svg(<><rect x="2.5" y="6.5" width="5.5" height="11" rx="1.5" /><rect x="9.25" y="6.5" width="5.5" height="11" rx="1.5" /><rect x="16" y="6.5" width="5.5" height="11" rx="1.5" /><path d="M8 12h1.25M14.75 12H16" strokeDasharray="1.25 1" /></>, 'StitchIcon');
export const TransitionIcon = svg(<><rect x="3" y="3.5" width="10.5" height="10.5" rx="2" /><rect x="10.5" y="10" width="10.5" height="10.5" rx="2" /><path d="m6.5 17.5 2 2 2-2M8.5 19.5V16" /></>, 'TransitionIcon');
export const PhoneAdIcon = svg(<><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 9.5v5l4-2.5z" /><path d="M11 18.5h2" /></>, 'PhoneAdIcon');
/** Direct a Shot: a small camera on a dotted path (the camera move you plan). */
export const PrevizIcon = svg(<><rect x="3" y="4" width="10" height="7.5" rx="2" /><path d="m13 6.6 4-2v6.3l-4-2" /><path d="M5 20c3-.2 5-1.5 7-3.5s4-3.3 7.5-3.5" strokeDasharray="1.5 2.5" /><circle cx="19.5" cy="13" r="1.25" /></>, 'PrevizIcon');
/** Rig as a character: a figure with its joints */
export const RigIcon = svg(<><circle cx="12" cy="4.5" r="2" /><path d="M12 6.5v7.5M12 9.2 7 11.8M12 9.2l5 2.6M12 14l-3.4 6.5M12 14l3.4 6.5" /><circle cx="7" cy="11.8" r="1.1" fill="currentColor" /><circle cx="17" cy="11.8" r="1.1" fill="currentColor" /><circle cx="12" cy="14" r="1.1" fill="currentColor" /></>, 'RigIcon');
export const OrbitIcon = svg(<><ellipse cx="12" cy="12" rx="9.5" ry="4.5" /><circle cx="12" cy="12" r="2.5" /><path d="m17.5 6.3 2.2 1.6-2.4 1.2" /></>, 'OrbitIcon');
export const MicIcon = svg(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0" /><path d="M12 17.5V21M9 21h6" /></>, 'MicIcon');
export const ChangeVoiceIcon = svg(<><path d="M3.5 10v4M7 7v10M10.5 9v6" /><path d="M14.5 8.5h6l-2-2M20.5 15.5h-6l2 2" /></>, 'ChangeVoiceIcon');
export const TranslateIcon = svg(<><path d="M3 5.5h9M7.5 3v2.5" /><path d="M10 5.5c0 3.5-2.5 6.5-6 7.5M5.5 8.5c1 2 2.8 3.6 5 4.5" /><path d="m12.5 21 4-9.5 4 9.5M14 17.5h5" /></>, 'TranslateIcon');
export const MusicIcon = svg(<><path d="M9 18V5.5l11-2V16" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>, 'MusicIcon');
export const MusicBedIcon = svg(<><path d="M9 15V4.5l9-1.5v10" /><circle cx="6.5" cy="15" r="2.5" /><circle cx="15.5" cy="13" r="2.5" /><path d="M3 20.5h18" /></>, 'MusicBedIcon');

/* ---- Nav / UI ---- */
export const ExploreIcon = svg(<><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>, 'ExploreIcon');
export const AssetsIcon = svg(<><rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" /></>, 'AssetsIcon');
export const SearchIcon = svg(<><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>, 'SearchIcon');
export const ProjectsIcon = svg(<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 10h18" /></>, 'ProjectsIcon');
export const FavouritesIcon = svg(<><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></>, 'FavouritesIcon');
export const ElementsIcon = svg(<><circle cx="7.5" cy="7.5" r="4" /><path d="M16.5 3.5 20.5 11h-8z" /><rect x="3.5" y="14" width="7" height="7" rx="1.5" /><path d="M17.5 14v7M14 17.5h7" /></>, 'ElementsIcon');
export const TrashIcon = svg(<><path d="M4 7h16M9.5 7V4.5h5V7" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" /><path d="M10 11v6M14 11v6" /></>, 'TrashIcon');
/* ---- Share destinations (2026-10-24). Simple one-colour glyphs, only to say which site a button opens; the marks belong to their owners.
 *      X and TikTok are filled shapes (their marks are solid); Instagram is the camera outline. ---- */
export const XLogoIcon = svg(<path fill="currentColor" stroke="none" d="M3.2 3.5h5.1l4.1 5.6 4.9-5.6h2.3l-6.2 7.1 7.4 9.9h-5.1l-4.5-6.1-5.4 6.1H3.5l6.6-7.5L3.2 3.5Zm3.2 1.5 10.4 14h1.6L8 5H6.4Z" />, 'XLogoIcon');
export const InstagramIcon = svg(<><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="3.9" /><circle cx="17.2" cy="6.8" r="1.05" fill="currentColor" stroke="none" /></>, 'InstagramIcon');
export const TikTokIcon = svg(<path fill="currentColor" stroke="none" d="M13.4 3h3c.2 2.2 1.6 3.7 3.8 3.9v3a7 7 0 0 1-3.8-1.2v6.1a5.6 5.6 0 1 1-5.6-5.6c.3 0 .6 0 .9.1v3.1a2.6 2.6 0 1 0 1.7 2.4V3Z" />, 'TikTokIcon');
/* ---- Ad platforms (2026-11-01, Ad Pack's Platform picker). YouTube and Pinterest: Simple Icons 16.35.0 path data (CC0 1.0, simpleicons.org;
 *      the marks belong to their owners, see ASSETS-CREDITS.md). LinkedIn isn't in Simple Icons: our own simple "in" drawing. ---- */
export const YouTubeIcon = svg(<path fill="currentColor" stroke="none" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />, 'YouTubeIcon');
export const PinterestIcon = svg(<path fill="currentColor" stroke="none" d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z" />, 'PinterestIcon');
export const LinkedInIcon = svg(<><rect x="3.5" y="3.5" width="17" height="17" rx="3.5" /><circle cx="8.3" cy="8.2" r="1.25" fill="currentColor" stroke="none" /><path fill="currentColor" stroke="none" d="M7.3 10.5h2v6.5h-2zM11.2 10.5h1.9v.9c.4-.7 1.2-1.1 2.1-1.1 1.6 0 2.6 1 2.6 2.9V17h-2v-3.4c0-.9-.4-1.4-1.1-1.4-.8 0-1.5.5-1.5 1.5V17h-2z" /></>, 'LinkedInIcon');
/** The system share sheet (Share…): a tray with an arrow leaving it. */
export const SystemShareIcon = svg(<><path d="M12 3.5v11" /><path d="m8 7.3 4-3.8 4 3.8" /><path d="M8.5 10.5H7a2 2 0 0 0-2 2V18a2.5 2.5 0 0 0 2.5 2.5h9A2.5 2.5 0 0 0 19 18v-5.5a2 2 0 0 0-2-2h-1.5" /></>, 'SystemShareIcon');
/** Share sheet "AirDrop" (2026-10-25): our own drawing of nearby sharing (two open rings around a point), not Apple's glyph. */
export const AirDropIcon = svg(<><path d="M8.82 16.18A4.5 4.5 0 1 1 15.18 16.18" /><path d="M5.99 19.01A8.5 8.5 0 1 1 18.01 19.01" /><circle cx="12" cy="13" r="1.4" fill="currentColor" stroke="none" /></>, 'AirDropIcon');
export const DownloadIcon = svg(<><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>, 'DownloadIcon');
/** Brand Kit (2026-10-27): a palette with three paint wells. */
export const BrandIcon = svg(<><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.2-1.6-1.2-2.8 0-1 .8-1.6 1.9-1.6h2.1a3.9 3.9 0 0 0 3.9-3.9C20.5 6.8 16.7 3.5 12 3.5z" /><circle cx="7.6" cy="11.2" r="1.2" /><circle cx="10.4" cy="7.4" r="1.2" /><circle cx="15" cy="7.8" r="1.2" /></>, 'BrandIcon');
export const HeartIcon = svg(<><path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.2 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z" /></>, 'HeartIcon');
export const MoreIcon = svg(<><circle cx="5.5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="18.5" cy="12" r="1" /></>, 'MoreIcon');
export const UploadIcon = svg(<><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>, 'UploadIcon');
export const GenerateIcon = svg(<><path d="M10 3.5 11.8 8.2 16.5 10l-4.7 1.8L10 16.5l-1.8-4.7L3.5 10l4.7-1.8z" /><path d="M18 14v6M15 17h6" /></>, 'GenerateIcon');
export const HomeIcon = svg(<><path d="M4 10.5 12 4l8 6.5V19a2 2 0 0 1-2 2h-3.5v-6h-5v6H6a2 2 0 0 1-2-2z" /></>, 'HomeIcon');
export const MenuIcon = svg(<><path d="M4 7h16M4 12h16M4 17h16" /></>, 'MenuIcon');
export const ToolIcon = svg(<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 12h6M12 9v6" /></>, 'ToolIcon');

/* ---- Settings chips and controls (16px in chips; same 24 grid, 1.5 stroke) ---- */
export const ClockIcon = svg(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>, 'ClockIcon');
export const AspectIcon = svg(<><rect x="3.5" y="6" width="17" height="12" rx="2" /><path d="M7 9.5v-1h2M17 14.5v1h-2" /></>, 'AspectIcon');
export const ResolutionIcon = svg(<><rect x="3.5" y="5" width="17" height="12" rx="2" /><path d="M8.5 20.5h7M12 17v3.5" /><path d="M7.5 9.5h2v3M12 9.5h1.5a1.5 1.5 0 0 1 0 3H12v-3" /></>, 'ResolutionIcon');
export const QualityIcon = svg(<><path d="M12 3.5 13.9 9l5.6 1.1-4.3 3.6 1.1 5.8L12 16.6l-4.3 2.9 1.1-5.8L4.5 10.1 10.1 9z" /></>, 'QualityIcon');
export const BitrateIcon = svg(<><path d="M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0" /></>, 'BitrateIcon');
/** Loop (2026-10-26): two arrows chasing each other round (our own drawing). */
export const LoopIcon = svg(<><path d="M4 12a6 6 0 0 1 10.5-4H12" /><path d="M14.5 4.5V8" /><path d="M20 12a6 6 0 0 1-10.5 4H12" /><path d="M9.5 19.5V16" /></>, 'LoopIcon');
export const SoundIcon = svg(<><path d="M4 9.5h3l4.5-4v13L7 14.5H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>, 'SoundIcon');
export const PlayIcon = svg(<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />, 'PlayIcon');
export const PauseIcon = svg(<><rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" /></>, 'PauseIcon');
export const SoundOffIcon = svg(<><path d="M4 9.5h3l4.5-4v13L7 14.5H4z" /><path d="m16 9.5 5 5M21 9.5l-5 5" /></>, 'SoundOffIcon');
export const GridIcon = svg(<><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></>, 'GridIcon');
/** Images per run (2026-10-24): a photo in front of two more, stacked up and to the right (our own drawing). */
export const ImageStackIcon = svg(<><rect x="3" y="8" width="12.5" height="12.5" rx="2" /><path d="m3.5 18.5 3.5-3.5 2.5 2.5 1.5-1.5 4 4" /><circle cx="11.25" cy="12" r="1.1" /><path d="M7 5h9.5a2 2 0 0 1 2 2v9.5" /><path d="M10.5 2H19a2 2 0 0 1 2 2v8.5" /></>, 'ImageStackIcon');
export const LayersIcon = svg(<><rect x="7" y="3.5" width="13.5" height="13.5" rx="2" /><path d="M17 20.5H5.5a2 2 0 0 1-2-2V7" /></>, 'LayersIcon');
/** Make default (2026-10-27): a five-point star with soft corners (our own drawing); filled by CSS when on. */
export const StarIcon = svg(<path d="m12 3.8 2.45 5.02 5.5.78-3.98 3.88.94 5.48L12 16.37l-4.91 2.59.94-5.48-3.98-3.88 5.5-.78z" />, 'StarIcon');
export const InfoIcon = svg(<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><path d="M12 7.6v.01" strokeWidth="2.2" /></>, 'InfoIcon');
export const AlertIcon = svg(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V13" /><path d="M12 16.4v.01" strokeWidth="2.2" /></>, 'AlertIcon');
export const ChevronRightIcon = svg(<><path d="m9.5 6 6 6-6 6" /></>, 'ChevronRightIcon');
export const ChevronDownIcon = svg(<><path d="m6 9.5 6 6 6-6" /></>, 'ChevronDownIcon');
export const PencilIcon = svg(<><path d="M15.5 4.5 19.5 8.5 9 19H5v-4z" /><path d="m13.5 6.5 4 4" /></>, 'PencilIcon');
export const PlusIcon = svg(<><path d="M12 5v14M5 12h14" /></>, 'PlusIcon');
/** Ad editor rail (2026-10-31): a "T" for words, and a frame split into a picture and a text block for layouts (our own drawings). */
export const TextIcon = svg(<><path d="M5 6.5V5h14v1.5" /><path d="M12 5v14" /><path d="M9 19h6" /></>, 'TextIcon');
/** Text alignment (2026-10-31): four lines, lined up left, centre or right (our own drawings). */
export const AlignLeftIcon = svg(<><path d="M4 6h16M4 10h10M4 14h16M4 18h10" /></>, 'AlignLeftIcon');
export const AlignCenterIcon = svg(<><path d="M4 6h16M7 10h10M4 14h16M7 18h10" /></>, 'AlignCenterIcon');
export const AlignRightIcon = svg(<><path d="M4 6h16M10 10h10M4 14h16M10 18h10" /></>, 'AlignRightIcon');
export const LayoutIcon = svg(<><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" /><path d="M3.5 13.5h17" /><path d="M7 16.5h6" /></>, 'LayoutIcon');
export const MinusIcon = svg(<><path d="M5 12h14" /></>, 'MinusIcon');
export const CloseIcon = svg(<><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></>, 'CloseIcon');
export const LibraryIcon = svg(<><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>, 'LibraryIcon');
export const ReplaceIcon = svg(<><path d="M4.5 9a7.5 7.5 0 0 1 13.4-3.2L20 8" /><path d="M20 3.5V8h-4.5" /><path d="M19.5 15a7.5 7.5 0 0 1-13.4 3.2L4 16" /><path d="M4 20.5V16h4.5" /></>, 'ReplaceIcon');

/* ---- Places, sources and savings (Run on rows, result details, Spend) ---- */
/** Local: a chip with its pins. */
export const YourGpuIcon = svg(<><rect x="6" y="6" width="12" height="12" rx="2" /><rect x="9.5" y="9.5" width="5" height="5" rx="1" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /></>, 'YourGpuIcon');
/** Comfy (Comfy Cloud / Comfy Router): two connected nodes. */
export const ComfyPlaceIcon = svg(<><rect x="3" y="4" width="7" height="6" rx="2" /><rect x="14" y="14" width="7" height="6" rx="2" /><path d="M10 7h2.5A2.5 2.5 0 0 1 15 9.5V14" /></>, 'ComfyPlaceIcon');
/** Other API (fal, Replicate, BFL…): a plug. */
export const ApiPlugIcon = svg(<><path d="M9 2v5M15 2v5" /><path d="M6 7h12v3a6 6 0 0 1-12 0z" /><path d="M12 16v6" /></>, 'ApiPlugIcon');
/** Saved money: a price tag. */
export const SavedTagIcon = svg(<><path d="M12.6 3H5a2 2 0 0 0-2 2v7.6l8.7 8.7a1.5 1.5 0 0 0 2.1 0l6.5-6.5a1.5 1.5 0 0 0 0-2.1z" /><circle cx="7.5" cy="7.5" r="1.25" /></>, 'SavedTagIcon');
/** Official (Comfy template): a shield with a check. */
export const OfficialBadgeIcon = svg(<><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="m9 12 2 2 4-4" /></>, 'OfficialBadgeIcon');
/** Community workflow: two people. */
export const CommunityIcon = svg(<><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5a3 3 0 0 1 0 6M21 20a5 5 0 0 0-4-4.9" /></>, 'CommunityIcon');
export const StopwatchIcon = svg(<><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5" /><path d="M10 2h4M12 2v3" /></>, 'StopwatchIcon');
/** Ours (a graph in this repo): a big and a small sparkle. */
/** Finish: a film frame with a small sparkle on its corner (our own drawing). */
export const FinishIcon = svg(<><rect x="3" y="6" width="15" height="13" rx="2.5" /><path d="M7 6v13M14 6v13" /><path d="M19.5 2.5v4M17.5 4.5h4" /></>, 'FinishIcon');
/** Reset: one open loop with an arrow head at its start (our own drawing). */
export const ResetIcon = svg(<><path d="M5 12a7 7 0 1 0 2.1-5" /><path d="M5 4v4h4" /></>, 'ResetIcon');
/** Compare: a frame split by a divider with a round handle (our own drawing). */
export const CompareIcon = svg(<><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="M12 2.5v19" /><circle cx="12" cy="12" r="2.2" /></>, 'CompareIcon');
/** Filter: three lines getting shorter (our own drawing). */
export const FilterIcon = svg(<><path d="M4 7h16M7 12h10M10 17h4" /></>, 'FilterIcon');
/** Select: a rounded box with a tick (our own drawing). */
export const SelectIcon = svg(<><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8.5 12.2l2.4 2.4 4.6-5" /></>, 'SelectIcon');
export const SparkleIcon =svg(<><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" /><path d="M19 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></>, 'SparkleIcon');
/** Open model (2026-10-24): our own glyph for open research models with no official logo (maker tiles): code brackets around a weights node. */
export const OpenModelIcon = svg(<><path d="M8 5 3.5 12 8 19" /><path d="M16 5l4.5 7-4.5 7" /><circle cx="12" cy="12" r="2.25" /></>, 'OpenModelIcon');
/* ---- Account menu (our own drawings) ---- */
export const UserIcon = svg(<><circle cx="12" cy="8.5" r="3.75" /><path d="M5 20a7 7 0 0 1 14 0" /></>, 'UserIcon');
export const UsageIcon = svg(<><path d="M4 20h16" /><rect x="5.5" y="11" width="3" height="6" rx="1" /><rect x="10.5" y="6" width="3" height="11" rx="1" /><rect x="15.5" y="13" width="3" height="4" rx="1" /></>, 'UsageIcon');
export const SettingsIcon = svg(<><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>, 'SettingsIcon');
export const DocsIcon = svg(<><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18v15H6.5A1.5 1.5 0 0 0 5 19.5z" /><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H18v-3" /><path d="M9 7.5h5" /></>, 'DocsIcon');
export const PriceTagIcon = svg(<><path d="M20 12.5 12.5 20a1.5 1.5 0 0 1-2.1 0L4 13.6V4h9.6l6.4 6.4a1.5 1.5 0 0 1 0 2.1z" /><circle cx="8.5" cy="8.5" r="1.25" /></>, 'PriceTagIcon');
/** This computer: a laptop (first-run Local card). */
export const LaptopIcon = svg(<><rect x="4.5" y="5" width="15" height="10.5" rx="1.5" /><path d="M2.5 19h19" /></>, 'LaptopIcon');
/** A key (your own provider keys). */
export const KeyIcon = svg(<><circle cx="8" cy="12" r="3.5" /><path d="M11.5 12h9M17.5 12v3M20.5 12v2.5" /></>, 'KeyIcon');
/** The place icon for a run-on id: local → Local, comfy-cloud → Comfy, anything else → Other API. */
export const placeIconFor = (runOn: string | null | undefined) => runOn === 'local' || runOn === 'gpu' ? YourGpuIcon : runOn === 'comfy-cloud' || runOn === 'comfy' ? ComfyPlaceIcon : ApiPlugIcon;

/** Logo mark: Orbit (three arcs around a core). Defaults to the brand colours; pass `color` for a single-colour version. */
export function LogoMark({ size = 24, className, color }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden>
      <g fill="none" stroke={color ?? '#FF7A1A'} strokeWidth="2.3" strokeLinecap="round"><path d="M11.4 3.8A5.4 5.4 0 0 1 13.04 9.94" /><path d="M9.94 13.04A5.4 5.4 0 0 1 3.8 11.4" /><path d="M2.67 7.16A5.4 5.4 0 0 1 7.16 2.67" /></g>
      <circle cx="8" cy="8" r="2.3" fill={color ?? '#F7F7F8'} />
    </svg>
  );
}

export const ICONS = {
  // legacy names (kept working)
  home: HomeIcon, swap: ObjectSwapIcon, motion: MotionTransferIcon, style: RestyleIcon, camera: ReshootIcon,
  assets: AssetsIcon, spark: GenerateIcon, menu: MenuIcon, tool: ToolIcon,
  // full set
  objectSwap: ObjectSwapIcon, motionTransfer: MotionTransferIcon, restyle: RestyleIcon, reshoot: ReshootIcon,
  cameraMoves: CameraMovesIcon, cutout: CutoutIcon, photoFx: PhotoFxIcon, upscale: UpscaleIcon, image: ImageIcon,
  audio: AudioIcon, video: VideoIcon, explore: ExploreIcon, search: SearchIcon, projects: ProjectsIcon,
  favourites: FavouritesIcon, elements: ElementsIcon, trash: TrashIcon, download: DownloadIcon, heart: HeartIcon,
  more: MoreIcon, upload: UploadIcon, generate: GenerateIcon,
  extend: ExtendIcon, director: DirectorIcon, portrait: PortraitIcon, reframe: ReframeIcon, hdr: HdrIcon, fps: FpsIcon, depth: DepthIcon,
  characterSheet: CharacterSheetIcon, product: ProductIcon, brush: BrushIcon, light: LightIcon, transition: TransitionIcon, phoneAd: PhoneAdIcon,
  faceSwap: FaceSwapIcon, shots: ShotsIcon, expand: ExpandIcon, garment: GarmentIcon, material: MaterialIcon, eraser: EraserIcon, layerSheets: LayerSheetsIcon,
  yourGpu: YourGpuIcon, comfyPlace: ComfyPlaceIcon, apiPlug: ApiPlugIcon, savedTag: SavedTagIcon, officialBadge: OfficialBadgeIcon, community: CommunityIcon, stopwatch: StopwatchIcon, sparkle: SparkleIcon, finish: FinishIcon,
  cube: CubeIcon, rig: RigIcon, orbit: OrbitIcon, previz: PrevizIcon, loop: LoopIcon, mic: MicIcon, changeVoice: ChangeVoiceIcon, translate: TranslateIcon, music: MusicIcon, musicBed: MusicBedIcon, stitch: StitchIcon,
} as const;
export type IconName = keyof typeof ICONS;

export default function Icon({ name, ...p }: IconProps & { name: IconName }) {
  const C = ICONS[name] ?? ToolIcon;
  return <C {...p} />;
}

/** Registry tool id -> icon name. */
export const TOOL_ICONS: Record<string, IconName> = {
  'object-swap': 'objectSwap', 'motion-transfer': 'motionTransfer', restyle: 'restyle', reshoot: 'reshoot',
  camera: 'cameraMoves', cutout: 'cutout', 'photo-fx': 'photoFx', upscale: 'upscale', 'create-image': 'image', image: 'image', audio: 'audio', soundtrack: 'music', 'h3-video': 'video', video: 'video',
  'h3-extend': 'extend', cinema: 'director', voice: 'mic', 'image-upscale': 'upscale', soul: 'portrait', reframe: 'reframe', 'remove-bg': 'cutout',
  'footage-fx': 'sparkle', 'prompt-edit': 'brush' /* Edit Video: Prompt Edit (Bernini-R) */, 'two-person-swap': 'faceSwap' /* Swap Two People (H3 Character Swap ×2) */, finish: 'finish', 'sdr-hdr': 'hdr', 'fps-boost': 'fps', 'depth-map': 'depth', 'app-character-sheet': 'characterSheet', 'app-product-shot': 'product',
  'app-photos-to-reel': 'video', 'app-inpaint': 'brush', 'app-relight': 'light', 'app-transition': 'transition', 'app-ugc-ad': 'phoneAd', 'app-orbit-shot': 'orbit', 'app-face-swap': 'faceSwap', 'app-shots': 'shots',
  'app-remove-bg': 'cutout', 'app-expand': 'expand', 'app-erase': 'eraser', 'app-try-on': 'garment', 'app-material-swap': 'material', 'app-ad-pack': 'phoneAd', 'app-image-layers': 'layerSheets', 'edit-image': 'brush' /* header Image menu: Edit Image (Create Image in edit mode) */,
  'app-anime-restyle': 'restyle', 'app-video-upscale': 'upscale', 'app-change-voice': 'changeVoice', 'app-translate-video': 'translate', 'app-music-bed': 'musicBed',
  'three-d': 'cube', 'three-d-turntable': 'orbit', 'image-to-3d': 'cube', turntable: 'orbit', 'plan-a-shot': 'previz', '3d': 'cube', loop: 'loop' /* Video flow shortcut: Loop */, 'direct-a-shot': 'previz', 'make-it-real': 'previz', compose: 'stitch' /* Video: Stitch (POST /api/compose) */,
};

/** Icon name for a tool id. Second arg (ui) kept for backward compatibility. */
export const toolIcon = (id: string, ui?: string): IconName =>
  TOOL_ICONS[id] ?? (id.includes('swap') ? 'objectSwap' : id.includes('motion') ? 'motionTransfer' : id.includes('style') ? 'restyle'
    : ui === 'reshoot' ? 'reshoot' : id.includes('cam') ? 'cameraMoves' : id.includes('upscale') ? 'upscale' : id.includes('cut') ? 'cutout'
    : id.includes('audio') ? 'audio' : id.includes('image') ? 'image' : 'tool');

/** Component for a tool id. */
export function ToolIconFor({ id, ui, ...p }: IconProps & { id: string; ui?: string }) {
  return <Icon name={toolIcon(id, ui)} {...p} />;
}
