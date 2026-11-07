/**
 * Video to layers: "Change the layers" in the viewer's panel (state and render: layerEdit.ts). Pick a layer in the list to move, scale or
 * recolour it (drag it on the picture, or type the numbers); add up to four texts, each in front of everything or behind a layer; Render makes a
 * new video on this computer (free) and opens it. The split itself never changes. Shared viewer classes (layerStack.css, resultViewer.css).
 */
import { useState } from 'react';
import { tip } from '../../shared/Tooltip';
import type { LayersManifest } from '../../../../server/src/layers/manifest';
import type { VideoLayerView } from './VideoLayers';
import { TEXT_FONTS, LIMITS, MAX_TEXTS, NO_EDIT, specOf, hasChanges, renderChanges, type TextItem } from './layerEdit';

const pct = (v: number) => Math.round(v * 100);
function Num({ label, value, onChange, min, max, suffix, testId }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; suffix?: string; testId: string }) {
  return <label className="vle-num"><span>{label}</span><input type="number" value={value} min={min} max={max} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v))); }} data-testid={testId} />{suffix && <small>{suffix}</small>}</label>;
}
function Slider({ label, value, min, max, step, shown, onChange, testId }: { label: string; value: number; min: number; max: number; step: number; shown: string; onChange: (v: number) => void; testId: string }) {
  return <label className="vle-slider"><span>{label}<b>{shown}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} data-testid={testId} /></label>;
}

export function LayerEditPanel({ m, view, onError }: { m: LayersManifest; view: VideoLayerView; onError?: (msg: string) => void }) {
  const { edit } = view; const sel = edit.selected; const [busy, setBusy] = useState('');
  const spec = specOf(edit, view.hidden, m.layers.map((l) => l.id)); const ready = hasChanges(spec);
  const layer = sel?.kind === 'layer' ? m.layers.find((l) => l.id === sel.id) : undefined; const e = layer ? edit.edits[layer.id] ?? NO_EDIT(layer.id) : undefined;
  const text = sel?.kind === 'text' ? edit.texts[sel.index] : undefined;
  const front = [...m.layers].sort((a, b) => b.order - a.order)[0];
  const addText = () => { const t: TextItem = { text: 'Your words', font: TEXT_FONTS[0].id, colour: '#ffffff', size: Math.round(m.height / 6), x: Math.round(m.width / 2), y: Math.round(m.height / 3), slot: front ? front.id : 'front' };
    edit.addText(t); edit.select({ kind: 'text', index: edit.texts.length }); view.setMode('layers'); };
  const render = async () => { if (!ready || busy) return; setBusy('Rendering…');
    try { const id = await renderChanges(m.jobId, spec, m.width, m.height, (s) => setBusy(s === 'composite' ? 'Putting it together…' : 'Rendering…')); setBusy('Opening your new video…');
      const q = new URLSearchParams(location.search); q.set('view', id); location.assign(`${location.pathname}?${q}`); }
    catch (err) { setBusy(''); onError?.(err instanceof Error ? err.message : 'The render stopped.'); } };
  return <div className="vle" data-testid="vle-panel">
    <div className="rvx-sec-h"><span className="rvx-lbl">Change the layers</span></div>
    {!sel && <p className="rvx-hint" data-testid="vle-hint">Pick a layer above to move, scale or recolour it, then drag it on the picture. The eye hides it.</p>}
    {layer && e && <div className="vle-box" data-testid="vle-layer">
      <div className="vle-title"><b>{layer.name}</b><button type="button" className="rvx-copy" onClick={() => edit.reset(layer.id)} data-testid="vle-reset">Reset</button></div>
      <div className="vle-row"><Num label="X" value={e.x ?? 0} min={-m.width} max={m.width} suffix="px" onChange={(v) => edit.patch(layer.id, { x: v })} testId="vle-x" />
        <Num label="Y" value={e.y ?? 0} min={-m.height} max={m.height} suffix="px" onChange={(v) => edit.patch(layer.id, { y: v })} testId="vle-y" />
        <Num label="Scale" value={pct(e.scale ?? 1)} min={pct(LIMITS.scale[0])} max={pct(LIMITS.scale[1])} suffix="%" onChange={(v) => edit.patch(layer.id, { scale: v / 100 })} testId="vle-scale" /></div>
      <Slider label="Hue" value={e.hue ?? 0} min={LIMITS.hue[0]} max={LIMITS.hue[1]} step={1} shown={`${e.hue ?? 0}°`} onChange={(v) => edit.patch(layer.id, { hue: v })} testId="vle-hue" />
      <Slider label="Saturation" value={pct(e.saturation ?? 1)} min={0} max={pct(LIMITS.saturation[1])} step={5} shown={`${pct(e.saturation ?? 1)}%`} onChange={(v) => edit.patch(layer.id, { saturation: v / 100 })} testId="vle-saturation" />
      <Slider label="Brightness" value={pct(e.brightness ?? 1)} min={pct(LIMITS.brightness[0])} max={pct(LIMITS.brightness[1])} step={5} shown={`${pct(e.brightness ?? 1)}%`} onChange={(v) => edit.patch(layer.id, { brightness: v / 100 })} testId="vle-brightness" />
    </div>}
    {text && sel?.kind === 'text' && <div className="vle-box" data-testid="vle-text">
      <div className="vle-title"><b>Text</b><button type="button" className="rvx-copy" onClick={() => edit.removeText(sel.index)} data-testid="vle-text-remove">Remove</button></div>
      <input className="vle-input" type="text" maxLength={80} value={text.text} onChange={(ev) => edit.patchText(sel.index, { text: ev.target.value })} aria-label="Text" data-testid="vle-text-input" />
      <div className="vle-row">
        <label className="vle-num"><span>Font</span><select value={text.font} onChange={(ev) => edit.patchText(sel.index, { font: ev.target.value })} data-testid="vle-font">{TEXT_FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
        <label className="vle-num"><span>Colour</span><input type="color" value={text.colour} onChange={(ev) => edit.patchText(sel.index, { colour: ev.target.value })} data-testid="vle-colour" /></label>
      </div>
      <Slider label="Size" value={text.size} min={LIMITS.size[0]} max={LIMITS.size[1]} step={2} shown={`${text.size} px`} onChange={(v) => edit.patchText(sel.index, { size: v })} testId="vle-size" />
      <div className="vle-row"><Num label="X" value={text.x} min={0} max={m.width} suffix="px" onChange={(v) => edit.patchText(sel.index, { x: v })} testId="vle-text-x" />
        <Num label="Y" value={text.y} min={0} max={m.height} suffix="px" onChange={(v) => edit.patchText(sel.index, { y: v })} testId="vle-text-y" /></div>
      <label className="vle-num vle-wide"><span>Place</span><select value={String(text.slot)} onChange={(ev) => edit.patchText(sel.index, { slot: ev.target.value === 'front' ? 'front' : Number(ev.target.value) })} data-testid="vle-slot">
        <option value="front">In front of everything</option>{[...m.layers].sort((a, b) => b.order - a.order).map((l) => <option key={l.id} value={l.id}>Behind {l.name}</option>)}</select></label>
    </div>}
    {edit.texts.length > 0 && <div className="vle-texts" data-testid="vle-texts">{edit.texts.map((t, k) => <button key={k} type="button" className={`vbar-qchip${sel?.kind === 'text' && sel.index === k ? ' on' : ''}`} onClick={() => edit.select({ kind: 'text', index: k })} data-testid={`vle-text-chip-${k}`}>{t.text || 'Text'}</button>)}</div>}
    <div className="ly-alls vle-actions">
      <button type="button" className="ly-all" onClick={addText} disabled={edit.texts.length >= MAX_TEXTS} data-testid="vle-add-text" {...tip(edit.texts.length >= MAX_TEXTS ? `Up to ${MAX_TEXTS} texts` : 'Text in front of everything or behind a layer')}>Add text</button>
      <button type="button" className="ly-all vle-render" onClick={render} disabled={!ready || !!busy} aria-busy={!!busy} data-testid="vle-render" {...tip(ready ? 'A new video with your changes. Free, on this computer' : 'Change a layer or add text first')}>{busy || 'Render'}</button>
    </div>
    <p className="rvx-hint" data-testid="vle-render-note">{m.background.url ? 'Moved layers leave the clean background behind them.' : 'No clean background here: a moved layer still shows where it was.'} The split stays as it is.</p>
  </div>;
}
