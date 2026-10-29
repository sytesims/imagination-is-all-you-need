import type { ToolInfo } from '../api';
import MediaArt from './MediaArt';
import Workspace from './Workspace';

/** Fallback for a registered tool whose web screen (toolScreens[ui]) isn't built yet. Renders straight from registry metadata. */
export default function ToolPending({ tool }: { tool: ToolInfo }) {
  const presets = tool.presets ?? [];
  return (
    <Workspace tool={tool} panel={<>
      <section className="card">
        <h2>Inputs <span className="helper">from the tool registry</span></h2>
        <div className="input-list">{tool.inputs.map(i => (
          <div key={i.name} className="input-item"><span className="input-name">{(i as any).label ?? i.name}</span><span className="chip">{i.kind}{i.required ? ' · required' : ''}</span>
            {i.options?.length ? <span className="helper">{i.options.join(' · ')}</span> : null}</div>))}</div>
      </section>
      {presets.length > 0 && <section className="card">
        <h2>Looks <span className="helper">{presets.length}</span></h2>
        <div className="mosaic mosaic-sm">{presets.map(p => <MediaArt key={p.id} seed={p.id} ratio="1/1" label={p.label} />)}</div>
      </section>}
      <section className="card pending-note"><h2>Screen in progress</h2><p className="helper">This tool is registered on the server (screen type “{tool.ui}”), and its interactive screen is still being built.</p></section>
    </>} />
  );
}
