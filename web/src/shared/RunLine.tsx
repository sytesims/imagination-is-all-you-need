import { runLabel, runPlaces, type ModelLike, type RunIcon, type RunPlace } from '../../../server/src/shared/runLabel';
import { LaptopIcon, ComfyPlaceIcon, ApiPlugIcon, DownloadIcon, KeyIcon, SettingsIcon, CloseIcon } from '../ui/Icons';
import './runLine.css';
/**
 * RunLine (2026-10-27, shared): where a model runs and what it costs, in one line with one icon. The words come from server/src/shared/runLabel.ts
 * (the live route status of GET /api/tools), so a card and a sheet never disagree. `RunLine` = the model's best place (a card); `RunPlaces` =
 * every place with its own status (a sheet). Free reads green, a price neutral, anything that needs doing first muted with its icon.
 */
const ICON: Record<RunIcon, typeof LaptopIcon> = { local: LaptopIcon, comfy: ComfyPlaceIcon, api: ApiPlugIcon, download: DownloadIcon, key: KeyIcon, setup: SettingsIcon, none: CloseIcon };
/** The label words for this computer (never a brand: people run the app on any computer). */
export const device = () => 'your computer';
export function RunIconFor({ p, size = 13 }: { p: RunPlace; size?: number }) { const I = ICON[p.icon]; return <I size={size} aria-hidden />; }

export function RunLine({ m, p, className = '', testId }: { m?: ModelLike | null; p?: RunPlace; className?: string; testId?: string }) {
  const x = p ?? runLabel(m ?? {}, { device: device() });
  return <span className={`runl is-${x.kind} ${className}`} data-kind={x.kind} data-testid={testId}><RunIconFor p={x} /><span>{x.text}</span></span>;
}
/** Every place of one model, best first: icon, place, status / price. */
export function RunPlaces({ m, testId }: { m: ModelLike; testId?: string }) {
  const ps = runPlaces(m, { device: device() }); if (!ps.length) return <RunLine m={m} />;
  return <span className="runl-list" data-testid={testId}>{ps.map((p) => <span key={p.id} className={`runl-place is-${p.kind}`} data-kind={p.kind}><RunIconFor p={p} size={12} />
    <span className="runl-where">{p.id === 'local' ? `On ${p.place}` : p.place}</span><span className="runl-short">{p.short}</span></span>)}</span>;
}
