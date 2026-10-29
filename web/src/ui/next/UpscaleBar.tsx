/**
 * Upscale inside Create Image's bar (unified Create, 2026-10-22): the Scale popover and the upscale model menu. Same rules as the old
 * Upscale page (tools/imageApps/ImageUpscaleTool.tsx, removed): factors come from the server's table (tool.app.imageUpscale, server
 * shared/imageUpscale.ts); a factor the model can't do, or one that would pass the 8192 px cap (or the model's own lower cap), stays
 * visible but disabled with the reason and the exact output size. The model menu is the shared one (shared/ModelMenu.tsx); upTag gives its rows the factors.
 */
import type { ProviderInfo } from '../../api';

export type Size = { width: number; height: number };
interface UpModel { placeLabel: string; label: string; blurb: string; price: string; measuredSec?: Record<string, number> }
export interface UpInfo { maxSide: number; maxSideByProvider?: Record<string, number>; factors: number[]; factorsByProvider: Record<string, number[]>; workflows: Record<string, Record<string, string>>; modelFiles?: Record<string, string[]>; models?: Record<string, UpModel> }
export const UP_FALLBACK: UpInfo = { maxSide: 8192, factors: [2, 4, 8, 16], factorsByProvider: { 'comfy-realesrgan': [2, 4, 8], 'comfy-ultrasharp': [4] }, workflows: {} };
export const sizeText = (s?: Size | null) => (s && s.width ? `${s.width}×${s.height}` : '');
export const outOf = (s: Size | null, k: number): Size | null => (s ? { width: Math.round(s.width * k), height: Math.round(s.height * k) } : null);
export const upName = (p: any): string => String(p?.displayName ?? p?.name ?? '').replace(/\s*\(.*$/, '').replace(/ x2plus \/ x4plus$/, '') || 'Model';

/** Why factor k can't run for this model and image (null = it can): the model's own factors first, then the long-side cap. */
export function scaleWhy(info: UpInfo, models: ProviderInfo[], provider: string, k: number, src: Size | null): string | null {
  const prov = models.find(p => p.id === provider); const factors = info.factorsByProvider[provider] ?? [];
  if (!factors.includes(k)) { const who = models.filter(p => (info.factorsByProvider[p.id] ?? []).includes(k)).map(upName); return `${upName(prov)} upscales ${factors.map(x => `×${x}`).join(', ')} only.${who.length ? ` ×${k}: ${who.join(', ')}.` : ` No model here goes to ×${k} yet.`}`; }
  const cap = info.maxSideByProvider?.[provider] ?? info.maxSide; const o = outOf(src, k);
  if (o && Math.max(o.width, o.height) > cap) return `×${k} would make ${sizeText(o)}; ${cap < info.maxSide ? `${upName(prov)} goes up to` : 'the most is'} ${cap} px on the long side.`;
  return null;
}
/** The factor to keep when the model or the image changes: the current one if it still runs, else the largest that runs below it, else the smallest that runs. */
export function snapScale(info: UpInfo, models: ProviderInfo[], provider: string, k: number, src: Size | null): number {
  if (scaleWhy(info, models, provider, k, src) == null) return k; const fs = info.factorsByProvider[provider] ?? [];
  return [...fs].reverse().find(x => x <= k && scaleWhy(info, models, provider, x, src) == null) ?? fs.find(x => scaleWhy(info, models, provider, x, src) == null) ?? k;
}

/** The Scale chip's popover: ×2 ×4 ×8 ×16, the disabled ones with their reason, and the size readout. */
export function ScalePanel({ info, models, provider, src, value, onPick }: { info: UpInfo; models: ProviderInfo[]; provider: string; src: Size | null; value: number; onPick: (k: number) => void }) {
  const ok = scaleWhy(info, models, provider, value, src) == null; const o = outOf(src, value);
  return <div className="wf-scale" data-testid="wf-scale-panel">
    <div className="wf-pop-h"><span>Scale factor</span><small>{src ? sizeText(src) : 'Add an image to see the size'}</small></div>
    <div className="wf-scale-list" role="radiogroup" aria-label="Scale factor">
      {info.factors.map(k => { const w = scaleWhy(info, models, provider, k, src); const ko = outOf(src, k);
        return <button key={k} type="button" role="radio" aria-checked={value === k} className={`wf-scale-row${value === k ? ' on' : ''}`} disabled={!!w} onClick={() => onPick(k)} data-testid={`wf-x${k}`}>
          <b>×{k}</b><span>{w ?? (ko ? `${sizeText(ko)} · ${Math.round(ko.width * ko.height / 1e5) / 10} MP` : `${k}× your image`)}</span></button>; })}
    </div>
    {src && <p className="wf-scale-out" data-testid="wf-scale-readout">{sizeText(src)} → <b>{ok && o ? sizeText(o) : '—'}</b></p>}
  </div>;
}

/** An upscale model's line in the shared model menu (shared/ModelMenu.tsx): its label ("Best detail") and the factors it does ("×2 ×4"). */
export const upTag = (info: UpInfo, id: string): string | undefined => { const fs = info.factorsByProvider[id] ?? []; const l = info.models?.[id]?.label;
  return [l, fs.length ? fs.map(k => `×${k}`).join(' ') : null].filter(Boolean).join(' · ') || undefined; };
