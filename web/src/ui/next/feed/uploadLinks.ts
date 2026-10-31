/** Where an upload can go ("Use in…", the Uploads chip's viewer in the Image and Video tabs, ui/next/feed/FeedScope): an image as a reference,
 *  the start image of a video or an upscale; a clip as Motion Control's motion clip, Extend's clip or a Video Upscale. Each is a hand-off link
 *  (shared/usePrefill ?refUrl=, as=start for a start image): the file lands in that slot, nothing runs. */
import { IMAGE_PAGE } from '../../../../../server/src/shared/pages';
import { withSearch } from '../../../shared/workflowLinks';
import { videoWorkflowHref } from '../../../../../server/src/shared/videoWorkflows';

export type UploadUse = { k: 'motion' | 'extend' | 'upscale' | 'ref' | 'start'; label: string; tip: string; href: string; onClick?: () => void };
export function uploadUses(it: { type: string; url: string }, onReference?: ((url: string) => void) | null): UploadUse[] {
  const u = `refUrl=${encodeURIComponent(it.url)}`;
  if (it.type === 'video') return [
    { k: 'motion', label: 'Motion clip', tip: 'Use as the motion clip (Motion Control)', href: withSearch(videoWorkflowHref('motion-control'), u) },
    { k: 'extend', label: 'Extend', tip: 'Keep the shot going (Extend)', href: withSearch(videoWorkflowHref('extend'), u) },
    { k: 'upscale', label: 'Upscale', tip: 'Sharper, larger clip (Video Upscale)', href: withSearch(videoWorkflowHref('upscale'), u) }];
  return [
    { k: 'ref', label: 'Reference', tip: 'Use as a reference image (Create Image)', href: `${IMAGE_PAGE}?${u}`, ...(onReference ? { onClick: () => onReference(it.url) } : {}) },
    { k: 'start', label: 'Start image', tip: 'Use as the start image of a video (Video → Create Video)', href: withSearch(videoWorkflowHref('create'), `${u}&as=start`) },
    { k: 'upscale', label: 'Upscale', tip: 'Sharper, larger image (Upscale)', href: `${IMAGE_PAGE}?workflow=upscale&${u}` }];
}
/** "Video frame" for a saved frame, else "Upload". */
export const uploadTag = (it: { label?: string | null }) => (it.label === 'Video frame' ? 'Video frame' : 'Upload');
