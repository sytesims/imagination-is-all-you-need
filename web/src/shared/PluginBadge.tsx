/**
 * The one Plugin badge (2026-11-01): every row a plugin adds (Video picker, header menus, Workflows page, Plugins page) says it is a plugin,
 * who made it, its licence and, when its folder ships a handler, that it runs code. Data: server shared/pluginPlacement.ts PluginBadge.
 */
import type { PluginBadge as Badge } from '../../../server/src/shared/pluginPlacement';
import { tip } from './Tooltip';
import './pluginBadge.css';

/** The small "Plugin" pill. */
export function PluginBadge({ b, className = '' }: { b?: Badge | null; className?: string }) {
  return <span className={`plg-badge ${className}`} data-testid="plugin-badge" {...tip(b ? `Plugin${b.author ? ` by ${b.author}` : ''} · ${b.licence}${b.runsCode ? ' · runs code in the app' : ''}` : 'Plugin')}>Plugin</span>;
}
/** "by <author> · <licence> · Runs code": the line under a plugin's name. */
export function PluginMeta({ b }: { b: Badge }) {
  return <span className="plg-meta">{b.author && <span>by {b.author}</span>}<span>{b.licence}</span>{b.runsCode && <span className="plg-code" {...tip('Its folder ships a handler: code that runs inside the app')}>Runs code</span>}</span>;
}
