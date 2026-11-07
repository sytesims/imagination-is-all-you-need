/** A page whose plugin is off (Canvas, Film): say so, keep what was made, and point at Plugins. */
import type { ComponentType } from 'react';
import { Link } from '../../platform/router';
import { usePluginOn } from '../../shared/plugins';
import { PluginTile } from './PluginParts';
import './plugins-ui.css';

export function PluginOff({ id, name }: { id: string; name: string }) {
  return <div className="pgx-main"><div className="pgx-empty" data-testid={`plugin-off-${id}`}><PluginTile id={id} />
    <h3>{name} is off</h3><p>What you made with it is kept and comes back when you turn it on again.</p>
    <p className="pgx-note"><Link to="/plugins" className="btn btn-sm pgx-pri">Open Plugins</Link></p></div></div>;
}

/** The page, or PluginOff while its plugin is off. */
export function gated<P extends object>(id: string, name: string, C: ComponentType<P>): ComponentType<P> {
  const G = (props: P) => (usePluginOn(id) ? <C {...props} /> : <PluginOff id={id} name={name} />);
  G.displayName = `Gated(${id})`; return G;
}
