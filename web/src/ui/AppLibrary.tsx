import { HeroTitle } from '../shared/HeroTitle';
import { useEffect, useState } from 'react';
import { Link } from '../platform/router';
import type { ToolInfo } from '../api';
import { StandInArt } from '../shared/StandInArt';
/**
 * B21 (Tier 2 S1): the Library canvas for gallery apps and Photo FX. Hero and examples come only from this app's own
 * /api/examples entries (plus base-tool examples made with the app's locked preset). No shared stills and no filler tiles.
 */
export type AppExample = { id: string; toolId: string; title: string; preset?: string | null; posterUrl?: string | null; previewUrl?: string | null; route: string; toolName?: string; prompt?: string; placeholder?: boolean; real?: boolean };
/** B21 S1: example media under /samples/examples/ is mock output (colour bars, gradients, noise), so it is never shown;
 *  the server marks each example real (a real render) or placeholder; only real ones show their media. */
export const realMedia = (x?: AppExample | null) => !!x && x.real !== false && (x.real === true || x.placeholder === false || (x.placeholder !== true && !/\/samples\/examples\//.test(String(x.posterUrl ?? '') + String(x.previewUrl ?? ''))));
let exCache: Promise<AppExample[]> | null = null;
export const allExamples = () => (exCache ??= fetch('/api/examples').then(r => r.ok ? r.json() : []).then((x: any) => Array.isArray(x) ? x : x?.items ?? []).catch(() => { exCache = null; return []; }));
export const isGalleryApp = (t: ToolInfo) => !!(t as any).app?.gallery;
export function ownExamples(tool: ToolInfo, xs: AppExample[]): AppExample[] {
  const gal = (tool as any).app?.gallery; const locked = gal?.locked?.preset as string | undefined;
  const own = xs.filter(x => x.toolId === tool.id);
  const viaBase = locked && gal?.base ? xs.filter(x => x.toolId === gal.base && x.preset === locked) : [];
  return [...own, ...viaBase];
}
export function useOwnExamples(tool: ToolInfo) {
  const [xs, setXs] = useState<AppExample[] | null>(null);
  useEffect(() => { let live = true; allExamples().then(all => { if (live) setXs(ownExamples(tool, all)); }); return () => { live = false; }; }, [tool.id]);
  return xs;
}
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const isVid = (u?: string | null) => !!u && /\.(mp4|webm|mov)(\?|$)/i.test(u);
const touch = () => typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches;

/** The app's own hero: its first real example clip if one exists, else the server's own title card for this app (never mock media). */
export function AppHeroMedia({ tool, ratio = '16/9', className = '' }: { tool: ToolInfo; ratio?: string; className?: string }) {
  const xs = useOwnExamples(tool); const x = xs?.find(realMedia);
  const poster = x?.posterUrl ?? (tool as any).posterUrl ?? undefined; const [bad, setBad] = useState<string | null>(null); /* a poster the server can't make (no art yet) → our branded stand-in, never a broken image */
  return <div className={`app-hero-media ${className}`} style={{ aspectRatio: ratio }} data-testid="app-hero-media">
    {xs && (x && isVid(x.previewUrl) ? <video key={x.id} src={x.previewUrl!} poster={poster} muted loop playsInline autoPlay={!reduced()} preload="metadata" aria-hidden />
      : poster && bad !== poster ? <img src={poster} alt="" onError={() => setBad(poster)} /> : poster || (tool as any).posterStandIn ? <StandInArt id={tool.id} toolId={tool.id} group={(tool as any).category} label={tool.name} className="app-hero-standin" /> : <span className="app-hero-card" aria-hidden><b>{tool.name}</b></span>)}
  </div>;
}

export default function AppLibrary({ tool, children, lede }: { tool: ToolInfo; children?: React.ReactNode; lede?: string }) {
  const xs = useOwnExamples(tool);
  const go = (x: AppExample) => location.assign(x.route);
  return <div className="app-lib" data-testid="app-library">
    <div className="app-hero" data-testid="app-hero">
      <div className="app-hero-txt"><HeroTitle className="app-hero-h" testId="app-hero-title">{tool.name}</HeroTitle><p className="helper">{lede ?? tool.description}</p></div>
      <AppHeroMedia tool={tool} />
    </div>
    {children}
    <div className="app-ex-head"><h3>Examples</h3>{xs && <span className="helper">{xs.length ? `${xs.length} from this app` : 'None yet'}</span>}</div>
    {!xs ? <div className="app-ex-grid">{[0, 1].map(i => <div key={i} className="app-ex shimmer" aria-hidden />)}</div>
      : xs.length ? <div className="app-ex-grid" data-testid="app-examples">{xs.map(x => <button key={x.id} type="button" className="app-ex" data-testid={`app-ex-${x.id}`} onClick={() => go(x)}
          onMouseEnter={e => { if (!touch() && !reduced()) e.currentTarget.querySelector('video')?.play().catch(() => 0); }} onMouseLeave={e => { const v = e.currentTarget.querySelector('video'); if (v) { v.pause(); v.currentTime = 0; } }}>
          {realMedia(x) && x.posterUrl ? <img src={x.posterUrl} alt="" loading="lazy" /> : <span className="app-ex-card" aria-hidden><small>{tool.name}</small><i>{x.prompt ? `“${x.prompt}”` : 'Open this example to see its settings'}</i></span>}
          {realMedia(x) && isVid(x.previewUrl) && <video src={x.previewUrl!} poster={x.posterUrl ?? undefined} muted loop playsInline preload="none" aria-hidden />}
          <span className="app-ex-foot"><b>{x.title}</b><span className="app-ex-go">Recreate</span></span></button>)}</div>
      : <p className="helper app-ex-none">Your results will show up here. Press Generate to make the first one.</p>}
    <MoreApps toolId={tool.id} />
  </div>;
}
/* BH12 T23: other apps from the catalogue, as plain text cards (no posters until real ones exist). */
type CatApp = { id: string; name: string; description?: string; category?: string; route: string; toolId?: string; runnable?: boolean };
let appsCache: Promise<CatApp[]> | null = null;
function MoreApps({ toolId }: { toolId: string }) {
  const [xs, setXs] = useState<CatApp[] | null>(null);
  useEffect(() => { let live = true; (appsCache ??= fetch('/api/apps').then(r => r.ok ? r.json() : null).then(j => (j?.items ?? j?.apps ?? []) as CatApp[]).catch(() => { appsCache = null; return []; })).then(a => { if (live) setXs(a); }); return () => { live = false; }; }, []);
  const list = (xs ?? []).filter(a => (a.toolId ?? a.id) !== toolId && a.runnable !== false).slice(0, 8);
  if (xs && !list.length) return null;
  return <section className="more-apps" data-testid="more-apps" aria-label="More workflows"><h3>More workflows</h3>
    <div className="more-apps-row">{!xs ? [0, 1, 2].map(i => <span key={i} className="more-app shimmer" aria-hidden />) : list.map(a => <Link key={a.id} to={a.route} className="more-app" data-testid={`more-app-${a.id}`}><small>{a.category ?? 'App'}</small><b>{a.name}</b>{a.description && <span>{a.description}</span>}</Link>)}</div></section>;
}
