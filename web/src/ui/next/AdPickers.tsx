/**
 * Ad Pack's compact pickers (2026-11-01, user: "more pretty, less text and icons"), used by the bar's plain group panel (WorkflowBar
 * GenericPanel) for the control kinds 'platforms' and 'corner':
 *  - PlatformPicker: one row per platform (its one-colour icon), its sizes as small tiles: a tiny shape outline + one word ("Feed",
 *    "Story", "Pin"). The full name and ratio are in each tile's tooltip and spoken name. Values are shared/adPack.ts AD_PLACEMENTS.
 *  - CornerPicker: one tiny ad-shaped frame (the picked size's own shape); click a corner. No words; each corner has its spoken name.
 * Test ids stay wf-opt-<field>-<value>, like the plain segmented options they replace.
 */
import type { ReactNode } from 'react';
import { AD_PLACEMENTS, AD_CORNERS, placementOf } from '../../../../server/src/shared/adPack';
import { AD_PLATFORMS, AD_PLATFORM_LIST, AD_SHAPES, type AdPlatform, type AdShape } from '../../../../server/src/shared/adPlatforms';
import { InstagramIcon, TikTokIcon, XLogoIcon, LinkedInIcon, YouTubeIcon, PinterestIcon } from '../Icons';
import { tip } from '../../shared/Tooltip';

const PLATFORM_ICON: Record<AdPlatform, ReactNode> = { meta: <InstagramIcon size={15} />, tiktok: <TikTokIcon size={15} />, x: <XLogoIcon size={14} />,
  linkedin: <LinkedInIcon size={15} />, youtube: <YouTubeIcon size={15} />, pinterest: <PinterestIcon size={14} /> };
/** width / height of a shape (1.91:1 drawn as it is, not as the 16:9 the model makes) */
const RATIO: Record<AdShape, number> = { '1x1': 1, '4x5': 0.8, '9x16': 9 / 16, '16x9': 16 / 9, '2x3': 2 / 3, '191x1': 1.91 };
/** A shape as a small outline that fits a `box` square. */
export function ShapeMark({ shape, box = 12 }: { shape: AdShape; box?: number }) {
  const r = RATIO[shape]; const w = r >= 1 ? box : Math.max(4, box * r); const h = r >= 1 ? Math.max(4, box / r) : box;
  return <i className="ad-shape" aria-hidden style={{ width: w, height: h }} />;
}

export function PlatformPicker({ value, set, label }: { value: string; set: (v: string) => void; label: string }) {
  const cur = placementOf(value).value;
  return <div className="ad-plat" role="radiogroup" aria-label={label} data-testid="wf-platforms">
    {AD_PLATFORM_LIST.map(p => { const sizes = AD_PLACEMENTS.filter(x => x.platform === p); if (!sizes.length) return null;
      return <div key={p} className="ad-plat-row" role="group" aria-label={AD_PLATFORMS[p].label}>
        <span className="ad-plat-i" {...tip(AD_PLATFORMS[p].label)}>{PLATFORM_ICON[p]}</span>
        {sizes.map(s => { const on = s.value === cur;
          return <button key={s.value} type="button" role="radio" aria-checked={on} aria-label={s.label} className={`ad-plat-t${on ? ' on' : ''}`} data-testid={`wf-opt-placement-${s.value}`}
            {...tip(s.label)} onClick={() => set(s.value)}><ShapeMark shape={s.shape} /><span>{s.short}</span></button>; })}
      </div>; })}
  </div>;
}

export function CornerPicker({ value, set, label, placement, help }: { value: string; set: (v: string) => void; label: string; /** the picked size: the frame takes its shape */ placement?: string; help?: string }) {
  const shape = placementOf(placement).shape; const r = RATIO[shape]; const H = 72; const w = Math.round(Math.min(100, Math.max(46, H * r))); const h = Math.round(Math.min(H, w / r));
  return <div className="ad-corner-w">
    <div className="ad-corner" role="radiogroup" aria-label={label} data-testid="wf-corner" data-shape={AD_SHAPES[shape].tag} style={{ width: w, height: h }}>
      {AD_CORNERS.map(c => { const on = (value || 'tl') === c.value;
        return <button key={c.value} type="button" role="radio" aria-checked={on} aria-label={c.label} className={`ad-corner-b ad-corner-${c.value}${on ? ' on' : ''}`} data-testid={`wf-opt-logoCorner-${c.value}`}
          {...tip(c.label)} onClick={() => set(c.value)}><i aria-hidden /></button>; })}
    </div>
    {help && <small className="ad-corner-note">{help}</small>}
  </div>;
}
