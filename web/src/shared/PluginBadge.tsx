/**
 * The one badge for workflows that come from a folder (2026-11-01): every row one adds (pickers, header menus, Workflows page, Your workflows)
 * says "Added by you" (you added it in the app) or "Add-on" (its folder ships with the app), with who made it, its licence and, when its folder
 * ships a handler, that it runs code. Data: server shared/pluginPlacement.ts PluginBadge.
 */
import type { PluginBadge as Badge } from '../../../server/src/shared/pluginPlacement';
import { tip } from './Tooltip';
import './pluginBadge.css';

/** What the pill says. */
export const badgeWord = (b?: Badge | null) => (b?.user ? 'Added by you' : 'Add-on');
/** The small "Added by you" / "Add-on" pill. */
export function PluginBadge({ b, className = '' }: { b?: Badge | null; className?: string }) {
  const word = badgeWord(b);
  return <span className={`plg-badge ${b?.user ? 'plg-yours ' : ''}${className}`} data-testid="plugin-badge" {...tip(b ? `${b.user ? 'You added this workflow' : 'Ships with the app as a folder'}${b.author ? ` · by ${b.author}` : ''} · ${b.licence}${b.runsCode ? ' · runs code in the app' : ''}` : word)}>{word}</span>;
}
/** "by <author> · <licence> · Runs code": the line under a plugin's name. */
export function PluginMeta({ b }: { b: Badge }) {
  return <span className="plg-meta">{b.author && <span>by {b.author}</span>}<span>{b.licence}</span>{b.runsCode && <span className="plg-code" {...tip('Its folder ships a handler: code that runs inside the app')}>Runs code</span>}</span>;
}
