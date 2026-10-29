import { makerTile } from './makers';
import { ImageIcon, VideoIcon, AudioIcon, CubeIcon, SparkleIcon, LogoMark } from '../ui/Icons';

const MEDIUM_ICON = { image: ImageIcon, video: VideoIcon, audio: AudioIcon, '3d': CubeIcon } as const;
/** The one maker tile (32px by default; set --mk-s to resize). The maker's logo in mono where we have a clean source; our Orbit mark for our
 *  own tools; else the maker's initial (2026-10-29: a generic play / image glyph read as "no provider"). The medium glyph (image / video /
 *  audio / 3D stroke icon from ui/Icons.tsx) is only for a row whose maker is unknown.
 *  Decorative (aria-hidden); the maker name is a native tooltip only. No "by <maker>" text anywhere in the UI (credits live in the docs). */
export function MakerTile({ maker, makerName, fallback, medium, className = '', title: ttl }: { maker?: string | null; makerName?: string | null; fallback?: string | null; /** image | video | audio | 3d: the glyph when there is no logo */ medium?: string | null; className?: string; title?: string | false }) {
  const t = makerTile(maker, fallback); const nm = makerName ?? t.name; const tip = ttl === false ? undefined : ttl ?? nm;
  const Glyph = MEDIUM_ICON[medium as keyof typeof MEDIUM_ICON] ?? SparkleIcon;
  return <span className={`mk-tile ${t.logo ? 'mk-logo' : 'mk-glyph'} ${t.neutral ? 'mk-neutral' : ''} ${className}`} data-maker={t.key ?? undefined} data-mark={t.mark} title={tip} aria-hidden style={t.key ? { ['--mk-c' as any]: `var(--mk-${t.key})` } : undefined}>
    {t.logo ? <span className="mk-svg" dangerouslySetInnerHTML={{ __html: t.logo }} />
      : t.mark === 'app' ? <span className="mk-svg mk-app"><LogoMark size={16} color="currentColor" /></span>
      : t.initial ? <span className="mk-svg mk-ini"><i>{t.initial}</i></span>
      : <span className="mk-svg mk-med"><Glyph size={16} /></span>}
  </span>;
}
