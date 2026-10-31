import { Notice } from '../../shared/Notice';
import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import PointPicker from '../../shared/PointPicker';
import type { VideoMeta } from '../../shared/UploadVideo';
import { WHO_HINT } from '../../../../server/src/shared/cloudSwap';
/** Object Swap · Person/Object toggle.
 *  Backend fields (swapType, maskMode, maskPrompt, maskGrow, firstFrameMode) are sent as-is; the server ignores unknown fields today, so
 *  every control has a fallback: object models without `swapTypes` → run on the current provider with the mask; no mask-preview route → "found when you press Generate". */
export type SwapType = 'person' | 'object';
export type MaskMode = 'text' | 'point' | 'upload' | 'none';
export type MaskGrow = 'tight' | 'normal' | 'loose' | 'box';
export type Pt = { x: number; y: number; t: number };
export const SWAP_HELP: Record<SwapType, string> = { person: 'People and characters: keeps their movement and expressions.', object: 'Products and props: swaps just that object; the rest of the shot stays.' };
/** Spec §5 model rows (older servers only). B27: when the tool carries swapTypes, the models per type, their order and the default come from there. */
export const SWAP_MODELS: Record<SwapType, { id: string; label: string; hint: string; speed: string }[]> = {
  person: [{ id: 'router-kling-edit', label: 'Kling 3.0 Omni Edit', hint: 'Swaps the person you describe; motion, light and sound kept', speed: 'Fast · best' }, { id: 'router-seedance-25-edit', label: 'Seedance 2.5 Edit', hint: 'Often refuses photos of real people', speed: 'Balanced · best' }, { id: 'comfy-open', label: 'Wan 2.2 Animate', hint: 'Swaps the person; motion, light and audio kept', speed: 'Slow · best' }, { id: 'comfy-h3-charswap', label: 'H3 Character Swap', hint: 'Quicker backup; the look comes from your reference', speed: 'Balanced · good' }],
  object: [
    { id: 'router-kling-edit', label: 'Kling 3.0 Omni Edit', hint: 'Swaps the object you name; motion, light and sound kept', speed: 'Fast · best' },
    { id: 'comfy-vace22-swap', label: 'Wan 2.2 VACE Fun', hint: 'Masks the object and paints in your photo', speed: 'Slow · best' },
    { id: 'comfy-vace21-swap', label: 'Wan 2.1 VACE', hint: 'Same idea, older model, very stable', speed: 'Balanced · good' },
    { id: 'comfy-ltx23-inpaint', label: 'LTX-2.3 Inpaint', hint: 'Fills the masked area, keeps the rest; uses your first frame', speed: 'Balanced · good' },
    { id: 'comfy-h3-ref2va-swap', label: 'H3 Ref2VA', hint: 'Best match from several product photos', speed: 'Balanced · good' },
    { id: 'comfy-lucy-edit', label: 'Lucy Edit Dev', hint: 'Type the change. No mask or photo', speed: 'Fast · good' },
  ],
};
/** B27 (A5): the server's models for a swap type (tool.swapTypes[type].models), merged onto the tool's providers so the type's own status wins. Null on older servers. */
export function swapTypeModels<P extends { id: string }>(tool: { providers: P[] } & Record<string, any>, type: SwapType): P[] | null {
  const st = tool?.swapTypes?.[type]; if (!st || !Array.isArray(st.models)) return null;
  return st.models.map((m: any) => { const p = tool.providers.find(x => x.id === m.id); return p ? ({ ...p, ...m, name: (p as any).name ?? m.name } as P) : null; }).filter(Boolean) as P[];
}
/** C2 (Platform Builder 10:47): these engines aren't wired into the swap submit yet. Hidden unless the server marks one available (available/runnable/wired). */
const SWAP_UNWIRED = /vace2[12]-swap|ltx23-inpaint|h3-ref2va|lucy-edit/i;
/** B27: a model the server offers as a sample preview (demoPreview) is listed, greyed with its reason, not hidden. */
export const swapUnwired = (p: { id: string } & Record<string, any>) => p.demoPreview !== true && p.wired !== true && p.available !== true && (p.available === false || p.runnable === false || SWAP_UNWIRED.test(p.id));
/** maskGrow is honoured on the Wan 2.2 Animate route (comfy-open) only; 'box' is approximated with 64 px blocks. */
export const growWired = (provider: string) => provider === 'comfy-open';
export const isLucy = (p: string) => /lucy/i.test(p); export const isLtx = (p: string) => /ltx/i.test(p); export const isH3Ref = (p: string) => /ref2va/i.test(p);
/** Default from URL ?swap=, else preset group (Product → object, Character/Wardrobe → person), else person. */
export function initialSwapType(presetGroup?: string | null): SwapType {
  const u = new URLSearchParams(location.search).get('swap'); if (u === 'object' || u === 'person') return u;
  return /^product/i.test(presetGroup ?? '') ? 'object' : 'person';
}
/** Same count as the server (routesMaskPreview maskPromptTokens): words and each punctuation mark. */
const tokens = (s: string) => (s.match(/[A-Za-z0-9]+|[^\sA-Za-z0-9]/g) ?? []).length;
export const maskPromptTooLong = (s: string) => tokens(s) > 32;

/** Roving-tabindex radiogroup with ←/→ (spec §7). */
export function Seg<T extends string>({ value, options, onChange, label, testid, className = '', disabled }: { value: T; options: readonly (readonly [T, string, string?])[]; onChange: (v: T) => void; label: string; testid: string; className?: string; disabled?: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const key = (e: KeyboardEvent, i: number) => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; e.preventDefault(); const n = (i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length; onChange(options[n][0]); refs.current[n]?.focus(); };
  return <div className={`mode-tabs sw-seg ${className}`} role="radiogroup" aria-label={label} data-testid={testid}>{options.map(([v, l, ic], i) => <button key={v} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={value === v} tabIndex={value === v ? 0 : -1} className={value === v ? 'on' : ''} disabled={disabled} data-testid={`${testid}-${v}`} onKeyDown={e => key(e, i)} onClick={() => onChange(v)}>{ic && <span className="sw-seg-ic" aria-hidden>{ic}</span>}{l}</button>)}</div>;
}

export function SwapToggle({ value, onChange }: { value: SwapType; onChange: (v: SwapType) => void }) {
  return <div className="sw-type" data-testid="swap-type-wrap">
    <span className="sw-type-q" id="sw-type-q">What are you swapping?</span>
    <Seg value={value} onChange={onChange} label="What are you swapping?" testid="swap-type" options={[['person', 'Person', '👤'], ['object', 'Object', '📦']] as const} />
    <p className="helper sw-type-help" id="sw-type-help" data-testid="swap-type-help">{SWAP_HELP[value]}</p>
  </div>;
}

/** Control 7: GET /api/tools/object-swap/mask-preview → {available, engine, reason, credits:0, maskGrow, maskModes, maxPromptTokens}. Checked once per page load; hidden when unavailable. */
type PvInfo = { available: boolean; engine?: string; reason?: string | null; maskModes?: string[]; maxPromptTokens?: number };
let previewInfo: Promise<PvInfo> | null = null;
const getPreviewInfo = () => previewInfo ??= fetch('/api/tools/object-swap/mask-preview').then(r => r.ok ? r.json() : { available: false }).then((j: any) => ({ available: j?.available === true, engine: j?.engine, reason: j?.reason ?? null, maskModes: Array.isArray(j?.maskModes) ? j.maskModes : undefined, maxPromptTokens: typeof j?.maxPromptTokens === 'number' ? j.maxPromptTokens : undefined })).catch(() => ({ available: false }));
type Pv = { state: 'idle' | 'loading' | 'found' | 'none' | 'error'; url?: string; frameUrl?: string; count?: number; msg?: string; mock?: boolean };

export function ObjectMask({ video, provider, maskMode, setMaskMode, maskPrompt, setMaskPrompt, point, setPoint, matte, setMatte, grow, setGrow, ffMode, setFfMode, firstFrame, setFirstFrame, swapType = 'object' }: {
  video: VideoMeta | null; provider: string; maskMode: MaskMode; setMaskMode: (m: MaskMode) => void; maskPrompt: string; setMaskPrompt: (s: string) => void; point: Pt | null; setPoint: (p: Pt | null) => void;
  matte: File | null; setMatte: (f: File | null) => void; grow: MaskGrow; setGrow: (g: MaskGrow) => void; ffMode: 'auto' | 'upload'; setFfMode: (m: 'auto' | 'upload') => void; firstFrame: File | null; setFirstFrame: (f: File | null) => void; swapType?: SwapType;
}) {
  const lucy = isLucy(provider), ltx = isLtx(provider); const locked = !video;
  const [info, setInfo] = useState<PvInfo | null>(null); const [pv, setPv] = useState<Pv>({ state: 'idle' });
  useEffect(() => { let live = true; getPreviewInfo().then(i => { if (live) setInfo(i); }); return () => { live = false; }; }, []);
  useEffect(() => { setPv({ state: 'idle' }); }, [video?.file]); // a new clip: the old preview no longer applies
  const canPreview = !!info?.available && !lucy && maskMode !== 'none' && (maskMode !== 'upload' || !!matte);
  /** POST multipart: video, swapType, maskMode, maskPrompt, point "x,y,t", maskGrow, firstFrame (LTX upload), matte (upload mode). Free; no job. */
  const runPreview = async (o: { grow?: MaskGrow; point?: Pt | null; mode?: MaskMode } = {}) => {
    const mode = o.mode ?? maskMode; const pt = o.point === undefined ? point : o.point; const g = o.grow ?? grow;
    if (!video?.file || !info?.available || lucy || mode === 'none') return;
    if (mode === 'text' && !maskPrompt.trim()) { setPv({ state: 'error', msg: 'Name the object first, like "red mug".' }); return; }
    if (mode === 'point' && !pt) { setPv({ state: 'error', msg: 'Click the object on the frame first.' }); return; }
    if (mode === 'upload' && !matte) return;
    setPv(v => ({ ...v, state: 'loading' }));
    const fd = new FormData(); fd.append('video', video.file); fd.append('swapType', swapType); fd.append('maskMode', mode); fd.append('maskGrow', g); // the preview always honours grow; the job only on Wan Animate
    if (mode === 'text') fd.append('maskPrompt', maskPrompt.trim());
    if (mode === 'point' && pt) { fd.append('point', `${pt.x.toFixed(4)},${pt.y.toFixed(4)},${pt.t.toFixed(2)}`); fd.append('t', pt.t.toFixed(2)); }
    if (mode === 'upload' && matte) fd.append('matte', matte);
    let r: Response | null = null; try { r = await fetch('/api/tools/object-swap/mask-preview', { method: 'POST', body: fd }); } catch { r = null; }
    const j: any = r ? await r.json().catch(() => null) : null;
    if (!r) { setPv({ state: 'error', msg: "Couldn't reach the server. The mask is still found when you press Generate." }); return; }
    if (r.status === 429) { setPv({ state: 'error', msg: 'A few previews are already running. Wait a few seconds and try again.' }); return; }
    if (r.status === 503) { if (j?.code === 'mask_preview_unavailable') setInfo(i => i && { ...i, available: false, reason: j?.error ?? i.reason }); setPv({ state: 'error', msg: j?.error ?? "Mask preview isn't available right now. The mask is found when you press Generate." }); return; }
    if (!r.ok) { setPv({ state: 'error', msg: j?.issues?.[0]?.message ?? j?.error ?? "Couldn't preview that mask." }); return; }
    setPv(j?.maskUrl && Number(j.count) > 0 ? { state: 'found', url: j.maskUrl, frameUrl: j.frameUrl, count: Number(j.count), mock: !!j.mock } : { state: 'none', frameUrl: j?.frameUrl, msg: j?.message ?? (mode === 'text' ? `Couldn't find '${maskPrompt.trim()}'. Try another word or click it.` : "Couldn't find anything there. Try another spot.") });
  };
  /** Click on the previewed frame: switch to Click it at that spot and preview again. */
  const clickFrame = (e: React.MouseEvent<HTMLImageElement>) => { const b = e.currentTarget.getBoundingClientRect(); const p: Pt = { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)), t: point?.t ?? 0 }; setPoint(p); setMaskMode('point'); void runPreview({ mode: 'point', point: p }); };
  const long = maskPromptTooLong(maskPrompt);
  const methods = (lucy ? [['none', 'None']] : [['text', 'Describe it'], ['point', 'Click it'], ['upload', 'Upload mask']]) as readonly (readonly [MaskMode, string])[];
  return <div className={`sw-mask ${locked ? 'locked' : ''}`} data-testid="swap-mask">
    <div className="sw-blk-h"><b>What to replace</b>{locked && <span className="helper">Add a video first</span>}</div>
    <Seg value={lucy ? 'none' : maskMode} onChange={setMaskMode} label="How we find the object" testid="mask-mode" className="sw-seg-3" options={methods} disabled={locked || lucy} />
    {lucy && <p className="helper" data-testid="mask-none">This model doesn't need a mask.</p>}
    {!lucy && maskMode === 'text' && <div className="sw-field">
      <label className="field" htmlFor="mask-prompt">OBJECT NAME</label>
      <input id="mask-prompt" data-testid="mask-prompt" type="text" placeholder="e.g. red mug" value={maskPrompt} disabled={locked} aria-describedby={long ? 'mask-prompt-err' : undefined} onChange={e => setMaskPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void runPreview(); }} />
      {long && <Notice as="p" kind="error" tone="line" id="mask-prompt-err">Keep it short, like 'red mug'.</Notice>}
    </div>}
    {!lucy && maskMode === 'point' && <div className="sw-field"><details className="pop" open={!point && !!video || undefined}><summary data-testid="mask-pick">{point ? `Picked at ${Math.round(point.x * 100)}%, ${Math.round(point.y * 100)}% · ${point.t.toFixed(1)} s` : 'Pick on frame'}</summary><div className="pop-body pop-wide"><PointPicker video={video} point={point} setPoint={p => { setPoint(p); if (p && pv.state !== 'idle') void runPreview({ point: p }); }} /></div></details></div>}
    {!lucy && maskMode === 'upload' && <div className="sw-field" data-testid="matte-field">
      <label className="field" htmlFor="matte">MASK VIDEO <span className="helper">white = replace · same length and size as your clip</span></label>
      {matte ? <div className="sw-file" data-testid="matte-file"><span>{matte.name}</span><button type="button" className="link-btn" onClick={() => setMatte(null)}>Remove</button></div>
        : <input id="matte" data-testid="matte-input" type="file" accept="video/mp4,video/quicktime,video/webm" disabled={locked} onChange={e => setMatte(e.target.files?.[0] ?? null)} />}
    </div>}
    {canPreview && !locked && <div className="sw-preview" data-testid="mask-preview" aria-live="polite">
      <div className="sw-pv-row"><button type="button" className="btn btn-sm" data-testid="mask-preview-run" disabled={pv.state === 'loading'} onClick={() => void runPreview()}>{pv.state === 'loading' ? 'Finding…' : pv.state === 'found' || pv.state === 'none' ? 'Preview again' : 'Preview mask'}</button><span className="helper">Free · nothing is charged</span></div>
      {pv.state === 'loading' && <div className="shimmer sw-pv-shim" />}
      {pv.state === 'found' && <figure className="sw-pv-fig"><img src={pv.url} alt={`First frame with about ${pv.count} area${pv.count === 1 ? '' : 's'} tinted for replacement`} title="Click the object to pick it instead" onClick={clickFrame} data-testid="mask-preview-img" />
        <figcaption className="helper" data-testid="mask-preview-count">~{pv.count} area{pv.count === 1 ? '' : 's'} tinted{pv.count! > 1 ? '; we replace all of them' : ''}. Click the frame to pick a different spot.{pv.mock ? ' (Mock preview.)' : ''}</figcaption></figure>}
      {pv.state === 'none' && <>{pv.frameUrl && <figure className="sw-pv-fig"><img src={pv.frameUrl} alt="First frame; click the object to pick it" onClick={clickFrame} /></figure>}<p className="helper sw-pv-msg" role="status">{pv.msg}</p></>}
      {pv.state === 'error' && <p className="helper sw-pv-msg" role="status" data-testid="mask-preview-msg">{pv.msg}</p>}
    </div>}
    {!lucy && growWired(provider) && <div className="sw-field"><span className="field">GROW MASK <span className="helper">Wan 2.2 Animate only</span></span><Seg value={grow} onChange={g => { setGrow(g); if (pv.state === 'found') void runPreview({ grow: g }); }} label="Grow mask" testid="mask-grow" className="sw-seg-4" options={[['tight', 'Tight'], ['normal', 'Normal'], ['loose', 'Loose'], ['box', 'Box']] as const} disabled={locked} />
      {ltx && <p className="helper">Size the mask for the new object, not the old one.</p>}</div>}
    {/* C2: the first-frame control is hidden until firstFrame is wired into the swap submit */}
  </div>;
}

/** Cloud person swap (shared/cloudSwap.ts): "Who to replace", one person described so nobody else changes. Required: the hosted edit models pick the
 *  person from these words (no mask). */
export function WhoToReplace({ value, onChange, disabled, issue }: { value: string; onChange: (v: string) => void; disabled?: boolean; issue?: React.ReactNode }) {
  const need = !disabled && !value.trim();
  return <div className={`cs-who ${need ? 'need' : ''}`} data-testid="cs-who">
    <label className="field" htmlFor="cs-who-in">WHO TO REPLACE</label>
    <input id="cs-who-in" type="text" data-testid="cs-who-input" placeholder="e.g. the man on the left in the black hoodie" value={value} disabled={disabled} maxLength={300} aria-describedby="cs-who-hint" onChange={e => onChange(e.target.value)} />
    <p className="helper" id="cs-who-hint" data-testid="cs-who-hint">{WHO_HINT}</p>{issue}
  </div>;
}
