/**
 * What the model cards say about a model: the menu's preview card (shared/ModelPreviewCard.tsx: cardFactsOf, cardDetailsOf, listRateOf) and
 * the Models page card's 2×2 spec grid (specOf: Price · Size · References · Shapes), an example image when the app has one, and the model page
 * link. Pure functions over the data the bar already uses, no network:
 *  - image: shared/imageCaps.ts (resolutions, max refs, aspects) · video: the tool's videoLimits (GET /api/tools app.videoLimits, else the
 *    catalogue's caps summary) · 3D: shared/threeD.ts · price: shared/hostedPrices.ts (the range across sizes / tiers), else the places' list prices.
 *  - example image: our own showcase (shared/showcase.ts, made in this app) for the engine that made it; 3D: the Scenario dataset previews
 *    (CC BY 4.0, credited on the card). null = no example: the card shows the maker tile instead.
 */
import { IMAGE_CAPS } from '../../../server/src/shared/imageCaps';
import { HOSTED_BY_ID, type HostedPrice } from '../../../server/src/shared/hostedPrices';
import { THREE_D_MODELS, THREE_D_SHOWCASE, SCENARIO_DATASET, usdByKey } from '../../../server/src/shared/threeD';
import { SHOWCASE } from '../../../server/src/shared/showcase';
import { promptTipOf } from '../../../server/src/shared/promptTips';
import type { ToolModel } from './models';

export interface SpecCell { label: string; value: string; title?: string }
export interface ModelExample { src: string; alt: string; credit?: string; creditUrl?: string }

const n2 = (v: number) => (v >= 1 ? v.toFixed(2) : v < 0.1 ? String(Number(v.toFixed(3))) : v.toFixed(2));
/** "$0.05–0.11", "$0.04", "Free". */
export const usdRange = (vals: number[]): string | null => {
  const v = vals.filter(x => typeof x === 'number' && Number.isFinite(x) && x >= 0); if (!v.length) return null;
  const lo = Math.min(...v), hi = Math.max(...v); if (hi === 0) return 'Free';
  return n2(lo) === n2(hi) ? `$${n2(lo)}` : `$${n2(lo)}–${n2(hi)}`; // equal once rounded: one figure, not "$0.10–0.10"
};
const UNIT_SHORT: Record<string, string> = { image: ' /img', second: ' /s', minute: ' /min', '1k_chars': ' /1k chars', '1k_bytes': ' /1k bytes', mp_second: ' /MP·s', megapixel: ' /MP' };
const hostedVals = (h: HostedPrice): number[] => [h.usd, ...Object.values(h.usdByResolution ?? {}), ...Object.values(h.usdByTier ?? {}), ...Object.values(h.usdByTierRes ?? {}),
  ...Object.values(h.usdByQuality ?? {}), ...Object.values(h.usdByMode ?? {})].filter((x): x is number => typeof x === 'number');
const live = (r: ToolModel['runsOn'][number]) => r.status !== 'coming-soon' && r.status !== 'unavailable';
/** The engines this page offers for a model, the given one first. */
const enginesOf = (m: ToolModel, engine?: string | null) => [...new Set([engine, m.primaryEngine, ...m.engines].filter((x): x is string => !!x))];

/** Price across sizes / tiers: the published rate table first, else the places' list prices (credits = cents); 'Free' when only Local runs it,
 *  "Free · $0.01 /img" when it also runs free on your own computer. */
export function priceOf(m: ToolModel, engine?: string | null): string | null {
  const p = paidPriceOf(m, engine); const local = m.runsOn.some(r => r.id === 'local' && live(r));
  return p && p !== 'Free' && local ? `Free · ${p}` : p ?? (local ? 'Free' : null);
}
function paidPriceOf(m: ToolModel, engine?: string | null): string | null {
  const t3 = THREE_D_MODELS.find(x => enginesOf(m, engine).includes(x.id));
  if (t3) { if (t3.place === 'local') return 'Free'; const r = usdRange(Object.values(usdByKey(t3.id))); if (r) return r; }
  for (const e of enginesOf(m, engine)) { const h = HOSTED_BY_ID[e]; if (!h) continue; const r = usdRange(hostedVals(h)); if (r) return r + (UNIT_SHORT[h.unit] ?? ''); }
  const paid = m.runsOn.filter(r => live(r) && r.id !== 'local' && typeof r.credits === 'number' && r.credits > 0).map(r => r.credits! / 100);
  if (paid.length) { const r = usdRange(paid); return r && m.medium === 'image' && r !== 'Free' ? `${r} /img` : r; } // a still is priced per image
  return null;
}

/** The published rate priceOf reads, with WHERE it applies ("Comfy Router", "the maker's API", "Comfy Cloud"), so the card never shows a
 *  second number without saying what it is. null = no published rate table for this model. */
export function listRateOf(m: ToolModel, engine?: string | null): { text: string; where: string } | null {
  for (const e of enginesOf(m, engine)) { const h = HOSTED_BY_ID[e]; if (!h) continue; const r = usdRange(hostedVals(h)); if (!r) continue;
    const where = /^Comfy Router/.test(h.note ?? '') || /\(Comfy Router\)/.test(h.model) || e.startsWith('router-') ? 'Comfy Router (partner node)' : e.startsWith('cloud-') ? 'Comfy Cloud' : e.startsWith('fal-') ? 'fal' : e.startsWith('replicate-') ? 'Replicate' : 'the maker’s own service';
    return { text: r + (UNIT_SHORT[h.unit] ?? ''), where }; }
  return null;
}

/** The 2×2 grid. Cells the data doesn't know say "—" (never a guess). */
export function specOf(m: ToolModel, o: { engine?: string | null; tool?: any } = {}): SpecCell[] {
  const pv = priceOf(m, o.engine); const both = pv?.startsWith('Free · ') ? pv.slice(7) : null; // free locally, paid in the cloud: "Free" over "cloud $0.13–0.19 /s"
  const price: SpecCell = both ? { label: 'Price', value: 'Free', title: `Free on your computer; ${both} in the cloud` } : { label: 'Price', value: pv ?? '—' };
  const es = enginesOf(m, o.engine); const caps: any = m.caps ?? {};
  const t3 = THREE_D_MODELS.find(x => es.includes(x.id));
  if (t3) return [price, { label: 'Size', value: t3.detail?.map(d => d.label).join(' ') || 'Standard' }, { label: 'References', value: '1 image' },
    { label: 'Format', value: t3.formats.map(f => f.toUpperCase()).join(' ') || '—' }];
  const ic = es.map(e => IMAGE_CAPS[e]).find(Boolean);
  if (ic) { const refs = ic.features?.modelMaxRefs ?? ic.supports.maxRefs; const shapes = ic.aspects.length;
    return [price, { label: 'Size', value: ic.resolutions.join(' ') },
      { label: 'References', value: refs > 0 ? String(refs) : 'None' },
      { label: 'Shapes', value: shapes ? `${shapes}${ic.allowAuto ? ' + Auto' : ''}` : 'Auto', title: [...ic.aspects, ...(ic.allowAuto ? ['Auto'] : [])].join(' · ') }]; }
  if (m.medium === 'image') { // an image model without an IMAGE_CAPS row: an upscaler (the tool's factor table), else the catalogue's caps
    const up: any = o.tool?.app?.imageUpscale; const fs: number[] | undefined = es.map(e => up?.factorsByProvider?.[e]).find(Array.isArray);
    if (fs?.length) { const cap = es.map(e => up.maxSideByProvider?.[e]).find((x: unknown) => typeof x === 'number') ?? up.maxSide;
      return [price, { label: 'Scale', value: fs.map(k => `×${k}`).join(' ') }, { label: 'References', value: '1 image' },
        { label: 'Up to', value: typeof cap === 'number' ? `${cap} px` : '—', title: 'Longest side of the result' }]; }
    const refs = typeof caps.maxRefs === 'number' ? (caps.maxRefs > 0 ? String(caps.maxRefs) : 'None') : '—';
    return [price, { label: 'Size', value: caps.maxResolution ? String(caps.maxResolution) : '—' }, { label: 'References', value: refs }, { label: 'Shapes', value: '—' }]; }
  if (m.medium === 'video') { const vl: any = es.map(e => o.tool?.app?.videoLimits?.[e]).find(Boolean);
    const res: string[] = Array.isArray(vl?.resolutions) ? vl.resolutions : caps.maxResolution ? [String(caps.maxResolution)] : [];
    const rk = vl?.refMax ?? (Array.isArray(vl?.refKinds) ? {} : vl?.refKinds) ?? {}; /* videoLimits: refKinds is the kind list, refMax the counts (videoCapsBlock; 2026-10-25) */ const refs = [rk.image ? `${rk.image} img` : '', rk.video ? `${rk.video} clip` : '', rk.audio ? `${rk.audio} audio` : ''].filter(Boolean).join(' · ');
    const asp: string[] = Array.isArray(vl?.aspects) ? vl.aspects.filter((a: string) => a !== 'auto') : [];
    const secs = typeof caps.minSeconds === 'number' && typeof caps.maxSeconds === 'number' ? (caps.minSeconds === caps.maxSeconds ? `${caps.maxSeconds} s` : `${caps.minSeconds}–${caps.maxSeconds} s`) : null;
    return [price, { label: 'Size', value: res.length ? [...res].sort(resOrder).join(' ') : '—', title: secs ? `Length ${secs}` : undefined },
      { label: 'References', value: refs || (vl ? 'None' : '—'), title: refs || undefined },
      { label: 'Shapes', value: asp.length ? `${asp.length}${vl.aspects.includes('auto') ? ' + Auto' : ''}` : secs ?? '—', title: asp.length ? vl.aspects.join(' · ') : secs ? 'Clip length' : undefined }]; }
  if (m.medium === 'audio') return [price, { label: 'Type', value: caps.summary ? String(caps.summary) : '—' }];
  return [price];
}
const resN = (r: string) => { const x = /^(\d+)(p|k)$/i.exec(r); return x ? (x[2].toLowerCase() === 'k' ? Number(x[1]) * 1000 : Number(x[1])) : 0; };
const resOrder = (a: string, b: string) => resN(a) - resN(b);

/** An example made with this model: our own showcase render for one of its engines (the grid thumb), or a 3D preview from the Scenario dataset. */
export function exampleOf(m: ToolModel, engine?: string | null): ModelExample | null {
  const es = enginesOf(m, engine);
  const s = SHOWCASE.find(x => es.includes(x.provider)) ?? SHOWCASE.find(x => x.model === (m.displayName || m.name));
  if (s) return { src: s.thumb, alt: `${s.name}, made with ${s.model}` };
  const t3 = THREE_D_MODELS.find(x => es.includes(x.id)); const names = [t3?.name, m.displayName, m.name].filter(Boolean) as string[];
  const d = THREE_D_SHOWCASE.find(x => names.some(n => n === x.model || n.startsWith(x.model + ' ')));
  if (d) return { src: d.preview, alt: `${d.title}, made with ${d.model}`, credit: `${SCENARIO_DATASET.credit} · ${SCENARIO_DATASET.licence}`, creditUrl: SCENARIO_DATASET.url };
  return null;
}

/** The model page: the engine's doc URL from the tool listing (providers[].docUrl), else the 3D model's licence page. */
export function modelPageOf(m: ToolModel, o: { engine?: string | null; tool?: any; provider?: any } = {}): string | null {
  const es = enginesOf(m, o.engine); const ps: any[] = Array.isArray(o.tool?.providers) ? o.tool.providers : [];
  const u = o.provider?.docUrl ?? es.map(e => ps.find(p => p?.id === e)?.docUrl).find(Boolean) ?? THREE_D_MODELS.find(x => es.includes(x.id))?.licence.url ?? null;
  return typeof u === 'string' && /^https:\/\//.test(u) ? u : null;
}

/* ---------- the model card's plain-words facts (2026-10-29) ----------
 * 2–3 facts a person reads in two seconds ("Up to 15 s · 480p or 768p · Makes its own sound"), then the "More details" rows for power users
 * (attachments, sizes, shapes, prompt length). Same data as specOf: the engine's videoLimits first, then IMAGE_CAPS, the audio tool's per-engine
 * modes and lengths, THREE_D_MODELS, then the catalogue's caps. A fact the data doesn't know is left out, never guessed. */
export type FactIcon = 'clock' | 'res' | 'sound' | 'refs' | 'edit' | 'mask' | 'music' | 'voice' | 'sfx' | 'cube' | 'text' | 'scale' | 'photo';
export interface CardFact { icon: FactIcon; text: string }
export interface CardDetail { label: string; value: string }

const secText = (s: number) => (s >= 60 ? `${Number((s / 60).toFixed(1))} min` : `${s} s`);
/** "a", "a or b", "a, b or c" (`and` for a list of things you can attach). */
const joinWords = (xs: string[], last = 'or') => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${last} ${xs[xs.length - 1]}`);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** The engine's video limits: the given engine's own row first (its sizes and lengths are what that place runs). */
const videoLimitsOf = (m: ToolModel, engine: string | null | undefined, tool: any): any => enginesOf(m, engine).map(e => tool?.app?.videoLimits?.[e]).find(Boolean) ?? null;
const attachWords = (rk: Record<string, number | undefined>): string | null => {
  const parts = [rk.image ? plural(rk.image, 'image') : '', rk.video ? plural(rk.video, 'clip') : '', rk.audio ? `${rk.audio} audio` : ''].filter(Boolean);
  return parts.length ? `Up to ${joinWords(parts, 'and')}` : null;
};
const AUDIO_WORD: Record<string, { icon: FactIcon; text: string }> = { music: { icon: 'music', text: 'Music' }, voice: { icon: 'voice', text: 'Speech from your script' }, voiceover: { icon: 'voice', text: 'Speech from your script' }, sfx: { icon: 'sfx', text: 'Sound effects' },
  cover: { icon: 'music', text: 'Covers' }, score: { icon: 'music', text: 'Sound for your clip' }, 'voice-change': { icon: 'voice', text: 'Changes the voice' } };

/** The card's 2–3 key facts, chosen per medium. */
export function cardFactsOf(m: ToolModel, o: { engine?: string | null; tool?: any } = {}): CardFact[] {
  const es = enginesOf(m, o.engine); const caps: any = m.caps ?? {}; const out: CardFact[] = [];
  const t3 = THREE_D_MODELS.find(x => es.includes(x.id));
  if (t3) { out.push({ icon: 'photo', text: 'From one photo' });
    if (t3.formats.length) out.push({ icon: 'cube', text: `${joinWords(t3.formats.map(f => f.toUpperCase()))} file` });
    if (t3.texture?.some(t => t.value !== 'off')) out.push({ icon: 'edit', text: t3.texture.some(t => t.value === 'pbr') ? 'Textures, PBR too' : 'With textures' });
    return out.slice(0, 3); }
  if (m.medium === 'video') { const vl = videoLimitsOf(m, o.engine, o.tool);
    const max = typeof vl?.maxSeconds === 'number' ? vl.maxSeconds : typeof caps.maxSeconds === 'number' ? caps.maxSeconds : null;
    const min = typeof vl?.minSeconds === 'number' ? vl.minSeconds : typeof caps.minSeconds === 'number' ? caps.minSeconds : null;
    if (max != null) out.push({ icon: 'clock', text: min === max ? `${max} s clips` : `Up to ${max} s` });
    const res: string[] = Array.isArray(vl?.resolutions) ? [...vl.resolutions].sort(resOrder) : [];
    if (res.length && res.length <= 2) out.push({ icon: 'res', text: joinWords(res) }); else if (res.length) out.push({ icon: 'res', text: `Up to ${res[res.length - 1]}` });
    else if (caps.maxResolution) out.push({ icon: 'res', text: `Up to ${caps.maxResolution}` });
    const sound = vl?.audio ? vl.audio.supported === true : caps.sound === true;
    if (sound) out.push({ icon: 'sound', text: 'Makes its own sound' });
    else { const rk = vl?.refMax ?? {}; if (rk.image === 1) out.push({ icon: 'photo', text: 'Starts from a photo' }); else if (rk.image > 1) out.push({ icon: 'refs', text: `Up to ${plural(rk.image, 'reference')}` }); }
    return out.slice(0, 3); }
  if (m.medium === 'image') { const ic = es.map(e => IMAGE_CAPS[e]).find(Boolean);
    const up: any = o.tool?.app?.imageUpscale; const fs: number[] | undefined = es.map(e => up?.factorsByProvider?.[e]).find(Array.isArray);
    if (!ic && fs?.length) { out.push({ icon: 'scale', text: `${joinWords(fs.map(k => `×${k}`))} larger` }); const cap = es.map(e => up.maxSideByProvider?.[e]).find((x: unknown) => typeof x === 'number') ?? up.maxSide;
      if (typeof cap === 'number') out.push({ icon: 'res', text: `Up to ${cap.toLocaleString('en-US')} px` }); return out; }
    const res = ic ? [...ic.resolutions].sort(resOrder) : caps.maxResolution ? [String(caps.maxResolution)] : [];
    if (res.length) out.push({ icon: 'res', text: `Up to ${res[res.length - 1]}` });
    const refs: number | null = ic ? (ic.features?.modelMaxRefs ?? ic.supports.maxRefs) : typeof caps.maxRefs === 'number' ? caps.maxRefs : null;
    const edit = caps.edit === true || ic?.features?.edit === true || (refs ?? 0) > 0;
    if (edit && refs && refs > 1) out.push({ icon: 'refs', text: `Edits from up to ${refs} images` }); else if (edit) out.push({ icon: 'edit', text: 'Edits your photo' }); else if (refs === 0) out.push({ icon: 'text', text: 'From text only' });
    if (caps.mask === true) out.push({ icon: 'mask', text: 'Paint over a spot to change it' }); else if (ic?.features?.textRendering) out.push({ icon: 'text', text: 'Clear text in images' });
    return out.slice(0, 3); }
  if (m.medium === 'audio') { const app = o.tool?.app ?? {}; const e = es.find(x => app.providerModes?.[x]) ?? null;
    const modes: string[] = e ? app.providerModes[e] : Array.isArray(caps.kinds) ? caps.kinds : caps.kind ? [String(caps.kind)] : [];
    const lyrics = modes.includes('music') && Array.isArray(app.lyricsModes) && app.lyricsModes.includes('music') && !modes.includes('voice') && !modes.includes('sfx');
    if (lyrics) out.push({ icon: 'music', text: modes.includes('cover') ? 'Songs with vocals, or covers' : 'Songs with vocals' });
    else { const w = modes.map(k => AUDIO_WORD[k]).filter(Boolean); if (w.length) out.push({ icon: w[0].icon, text: joinWords(w.map((x, i) => (i ? x.text.toLowerCase() : x.text)), 'and') }); }
    const speech = modes.some(k => k === 'voice' || k === 'voiceover');
    const ds: number[] = e && Array.isArray(app.durationsByProvider?.[e]) ? app.durationsByProvider[e] : [];
    if (ds.length && !speech) out.push({ icon: 'clock', text: `Up to ${secText(Math.max(...ds))}` });
    if (speech) { const vc = es.map(x => app.voiceCaps?.[x]).find(Boolean); const langs = es.map(x => app.languagesByProvider?.[x]).find(Array.isArray);
      if (typeof vc?.maxVoiceSamples === 'number' && vc.maxVoiceSamples > 0) out.push({ icon: 'voice', text: 'Clones a voice from a sample' });
      if (langs && langs.length > 1) out.push({ icon: 'text', text: `${langs.length} languages` });
      const tip = promptTipOf(m.key); if (tip?.limit) out.push({ icon: 'text', text: `Scripts ${tip.limit.replace(/^Up to/, 'up to')}` }); }
    return out.slice(0, 3); }
  return out;
}

/** "More details": everything else, in plain words, nothing cut (sizes, length, attachments, shapes, how the prompt names them, its limit). */
export function cardDetailsOf(m: ToolModel, o: { engine?: string | null; tool?: any } = {}): CardDetail[] {
  const es = enginesOf(m, o.engine); const caps: any = m.caps ?? {}; const out: CardDetail[] = [];
  const t3 = THREE_D_MODELS.find(x => es.includes(x.id));
  if (t3) { if (t3.detail?.length) out.push({ label: 'Detail', value: joinWords(t3.detail.map(d => d.label)) });
    if (t3.faces?.length) out.push({ label: 'Polygons', value: joinWords(t3.faces.map(d => d.label)) }); out.push({ label: 'Attach', value: '1 photo of the object' }); }
  else if (m.medium === 'video') { const vl = videoLimitsOf(m, o.engine, o.tool);
    const res: string[] = Array.isArray(vl?.resolutions) ? [...vl.resolutions].sort(resOrder) : []; if (res.length > 2) out.push({ label: 'Sizes', value: joinWords(res) });
    const min = vl?.minSeconds ?? caps.minSeconds, max = vl?.maxSeconds ?? caps.maxSeconds; if (typeof min === 'number' && typeof max === 'number' && min !== max) out.push({ label: 'Length', value: `${min} to ${max} seconds` });
    const a = attachWords(vl?.refMax ?? {}); if (a || vl) out.push({ label: 'Attach', value: a ?? 'Text only' });
    const asp: string[] = Array.isArray(vl?.aspects) ? vl.aspects.filter((x: string) => x !== 'auto') : []; if (asp.length) out.push({ label: 'Shapes', value: `${asp.join(', ')}${vl.aspects.includes('auto') ? ', or Auto' : ''}` }); }
  else if (m.medium === 'image') { const ic = es.map(e => IMAGE_CAPS[e]).find(Boolean);
    if (ic) { if (ic.resolutions.length > 1) out.push({ label: 'Sizes', value: joinWords([...ic.resolutions].sort(resOrder)) });
      const refs = ic.features?.modelMaxRefs ?? ic.supports.maxRefs; out.push({ label: 'Attach', value: refs > 0 ? `Up to ${plural(refs, 'image')}` : 'Text only' });
      if (ic.aspects.length) out.push({ label: 'Shapes', value: `${ic.aspects.join(', ')}${ic.allowAuto ? ', or Auto' : ''}` });
      if (ic.maxBatch > 1) out.push({ label: 'Per run', value: `Up to ${plural(ic.maxBatch, 'image')}` }); } }
  const tip = promptTipOf(m.key);
  if (tip && !tip.noPrompt) { out.push({ label: 'Prompt', value: tip.refs }); if (tip.limit) out.push({ label: 'Prompt length', value: tip.limit }); }
  return out.filter(d => !!d.value);
}
