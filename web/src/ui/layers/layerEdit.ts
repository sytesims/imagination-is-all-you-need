/**
 * Video to layers: the viewer's changes (move, scale, recolour per layer; texts) and their Render. The numbers are the server's
 * (server/src/layers/edit.ts): the stage previews them with CSS (translate, scale, hue-rotate / saturate / brightness), the render applies the
 * same values with ffmpeg. A text is drawn here once, as a full-frame transparent picture in the app's own font: the stage shows that picture and
 * the render receives it, so what you see is what you get.
 */
import { useEffect, useMemo, useState } from 'react';
import { TEXT_FONTS, LIMITS, MAX_TEXTS, isChanged, type LayerEdit, type TextItem, type LayersEditSpec } from '../../../../server/src/layers/edit';

export { TEXT_FONTS, LIMITS, MAX_TEXTS };
export type { LayerEdit, TextItem };
export const NO_EDIT = (id: number): LayerEdit => ({ id, x: 0, y: 0, scale: 1, hue: 0, saturation: 1, brightness: 1 });
export const cssFilter = (e?: LayerEdit) => (!e ? undefined : [e.hue ? `hue-rotate(${e.hue}deg)` : '', (e.saturation ?? 1) !== 1 ? `saturate(${e.saturation})` : '', (e.brightness ?? 1) !== 1 ? `brightness(${e.brightness})` : ''].filter(Boolean).join(' ') || undefined);
/** The stage transform for a layer: moved by (x, y) frame pixels, scaled about the centre (CSS % of the element = of the frame). */
export const cssTransform = (e: LayerEdit | undefined, W: number, H: number) => (!e || (!e.x && !e.y && (e.scale ?? 1) === 1) ? undefined : `translate(${((e.x ?? 0) / W) * 100}%, ${((e.y ?? 0) / H) * 100}%) scale(${e.scale ?? 1})`);

const fontOf = (t: TextItem) => { const f = TEXT_FONTS.find((x) => x.id === t.font) ?? TEXT_FONTS[0]; return `${f.weight} ${t.size}px ${f.css}`; };
/** One text as a full-frame transparent PNG (data URL and blob), at the split's size. */
export async function drawText(t: TextItem, W: number, H: number): Promise<{ url: string; blob: Blob }> {
  try { await document.fonts.load(fontOf(t)); } catch { /* the default font then */ }
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  g.font = fontOf(t); g.fillStyle = t.colour; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t.text, t.x, t.y);
  const blob = await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('no picture'))), 'image/png'));
  return { url: c.toDataURL('image/png'), blob };
}
/** The picture of each text, redrawn when it changes. */
export function useTextPictures(texts: TextItem[], W: number, H: number): (string | null)[] {
  const key = JSON.stringify(texts); const [urls, setUrls] = useState<(string | null)[]>([]);
  useEffect(() => { let live = true; Promise.all(texts.map((t) => (t.text.trim() ? drawText(t, W, H).then((r) => r.url) : Promise.resolve(null)))).then((u) => { if (live) setUrls(u); }).catch(() => undefined);
    return () => { live = false; }; }, [key, W, H]); // eslint-disable-line react-hooks/exhaustive-deps
  return urls;
}

/** The viewer's changes for one split. */
export function useLayerEdits(jobId: string) {
  const [edits, setEdits] = useState<Record<number, LayerEdit>>({}); const [texts, setTexts] = useState<TextItem[]>([]);
  const [selected, setSelected] = useState<{ kind: 'layer'; id: number } | { kind: 'text'; index: number } | null>(null);
  useEffect(() => { setEdits({}); setTexts([]); setSelected(null); }, [jobId]);
  const api = useMemo(() => ({
    patch: (id: number, p: Partial<LayerEdit>) => setEdits((s) => ({ ...s, [id]: { ...(s[id] ?? NO_EDIT(id)), ...p } })),
    reset: (id: number) => setEdits((s) => { const n = { ...s }; delete n[id]; return n; }),
    addText: (t: TextItem) => setTexts((l) => (l.length >= MAX_TEXTS ? l : [...l, t])),
    patchText: (k: number, p: Partial<TextItem>) => setTexts((l) => l.map((t, i) => (i === k ? { ...t, ...p } : t))),
    removeText: (k: number) => { setTexts((l) => l.filter((_, i) => i !== k)); setSelected(null); },
    select: setSelected,
  }), []);
  return { edits, texts, selected, ...api };
}
export type LayerEdits = ReturnType<typeof useLayerEdits>;

/** The spec the render takes (hidden comes from the eye buttons). */
export function specOf(e: LayerEdits, hidden: ReadonlySet<number>, ids: number[]): LayersEditSpec {
  return { layers: ids.map((id) => ({ ...(e.edits[id] ?? NO_EDIT(id)), hidden: hidden.has(id) })).filter((x) => isChanged(x)), texts: e.texts.filter((t) => t.text.trim()) };
}
export const hasChanges = (s: LayersEditSpec) => s.layers.length > 0 || s.texts.length > 0;

/** Render: one free job on this computer; resolves with the new job's id once it is done. */
export async function renderChanges(jobId: string, spec: LayersEditSpec, W: number, H: number, onStage?: (s: string) => void): Promise<string> {
  const fd = new FormData(); fd.set('layersJob', jobId); fd.set('edit', JSON.stringify(spec)); fd.set('provider', 'local-layers-edit');
  for (const [k, t] of spec.texts.entries()) fd.append('texts', (await drawText(t, W, H)).blob, `text-${k + 1}.png`);
  const r = await fetch('/api/tools/layers-edit/jobs', { method: 'POST', body: fd }); const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.id) throw new Error(d.error || 'The render could not start.');
  for (;;) {
    await new Promise((ok) => setTimeout(ok, 1200)); const j = await (await fetch(`/api/jobs/${encodeURIComponent(d.id)}`)).json();
    if (j.status === 'done') return d.id as string;
    if (j.status === 'failed' || j.status === 'canceled') throw new Error(j.error || 'The render stopped.');
    onStage?.(String(j.stage ?? ''));
  }
}
