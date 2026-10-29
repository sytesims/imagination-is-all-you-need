/**
 * Cinematic camera (2026-10-27), the player's parts, in one Camera popover with tabs: Shot Recipes (one-click camera moves that become normal
 * takes), Lens & size (focal length in mm and the shot sizes ECU … EWS for the chosen camera), Feel (a seeded shake over any camera) and Guides (thirds, centre, safe area, 2.39
 * letterbox: drawn over the view only, never into the canvas, so they can't reach a recording). The maths is in
 * server/src/shared/previzCamera.ts; this file only reads and writes the one PlanShot through onEditShot. The recipe cards are the shared
 * PresetTile with the Camera Moves previews (shared/presetMotion.ts), named with the same catalogue ids and labels as Video's Camera Moves.
 */
import { useState } from 'react';
import { PopNote, PopSection, PopSwitch, Segmented } from '../BarPop';
import { PresetTile } from '../PresetTile';
import { tip } from '../Tooltip';
import { chosenTake, previzTemplate, TAKE_MAX, type CameraTake, type PlanShot } from '../../../../server/src/shared/previzTemplates';
import { SHOT_RECIPES, LENSES, LENS_WORDS, SHOT_SIZES, SHAKES, SHAKE_DEFAULT_K, recipeOf, recipeSubject, recipeTake, rebakeTake, lensMmOf, type LensMm, type ShakeProfile, type ShotRecipe, type ShotSize } from '../../../../server/src/shared/previzCamera';
import type { EditShot } from './FlyUi';

const nextId = (takes: CameraTake[]) => { let n = takes.length + 1; while (takes.some((k) => k.id === `take-${n}`)) n++; return { id: `take-${n}`, index: n - 1 }; };
/** what a recipe films, in words */
const subjectWords = (shot: PlanShot, perf: CameraTake | null) => perf ? `${perf.name} (the person)` : shot.template === 'walk-by' ? 'the person walking' : shot.template === 'product-hero' ? 'the bottle' : shot.template === 'walkthrough' ? 'the sofa' : 'the middle of the set';

/** Apply a recipe: replace the chosen recipe take in place (quick switching never piles up takes), or add a new take. Returns what happened. */
export function applyRecipe(shot: PlanShot, r: ShotRecipe, replace: boolean): { shot: PlanShot; added: boolean } | null {
  const takes = shot.cameraPath?.takes ?? []; const cur = chosenTake(shot); const perf = recipeSubject(shot); const rec = { id: r.id, lens: r.lens, size: r.size };
  if (replace && cur?.recipe) {
    const next = recipeTake(shot, rec, { id: cur.id, index: 0, perf }); if (!next) return null;
    const keep = cur.shoot && next.shoot ? { ...next, shoot: cur.shoot } : next; /* an angle keeps its number */
    return { shot: { ...shot, cameraPath: { takes: takes.map((k) => (k.id === cur.id ? keep : k)), chosen: cur.id } }, added: false };
  }
  if (takes.length >= TAKE_MAX) return null; const { id, index } = nextId(takes); const take = recipeTake(shot, rec, { id, index, perf }); if (!take) return null;
  return { shot: { ...shot, cameraPath: { takes: [...takes, take], chosen: take.id } }, added: true };
}

/** The Shot Recipes popover: the cards, what they film, replace / keep, and the 12-take limit. */
export function ShotRecipes({ shot, onEditShot, disabled, onApplied }: { shot: PlanShot; onEditShot: EditShot; disabled: boolean; onApplied?: (label: string, added: boolean) => void }) {
  const takes = shot.cameraPath?.takes ?? []; const cur = chosenTake(shot); const perf = recipeSubject(shot); const full = takes.length >= TAKE_MAX;
  /* "Keep this one": the next card adds a new take instead of replacing the recipe take you are on */
  const [keptId, setKeptId] = useState<string | null>(null); const replace = !!cur?.recipe && keptId !== cur.id;
  const pick = (r: ShotRecipe) => { onEditShot((s) => applyRecipe(s, r, !!chosenTake(s)?.recipe && keptId !== chosenTake(s)?.id)?.shot ?? s); onApplied?.(r.label, !replace); };
  return <div className="pv-rcp" data-testid="pv-recipes">
    <p className="pv-rcp-sub">One click makes a camera take you can trim, compare and record. Same names as Video’s Camera Moves.</p>
    <PopSection>
      <div className="pv-rcp-grid" role="group" aria-label="Shot recipes">
        {SHOT_RECIPES.map((r) => { const on = cur?.recipe?.id === r.id; const blocked = disabled || (full && !replace);
          return <PresetTile key={r.id} size="compact" className={`pv-rcp-tile${blocked ? ' pv-rcp-off' : ''}`} label={r.label} selected={on} motion={{ id: r.id }} testId={`pv-recipe-${r.id}`}
            title={`${r.hint}${blocked && !disabled ? `. ${TAKE_MAX} takes is the most: delete one first.` : ''}`} onClick={() => { if (!blocked) pick(r); }} />; })}
      </div>
    </PopSection>
    {full && !replace ? <PopNote tone="warn" testId="pv-recipes-full">{TAKE_MAX} takes is the most. Delete one, or pick a recipe take to try other recipes on it.</PopNote>
      : <p className="pv-rcp-foot" data-testid="pv-recipes-foot"><span>Films {subjectWords(shot, perf)}.{replace ? <> Trying another recipe replaces <b>{cur!.name}</b>.</> : ' Each one starts a new take.'}</span>
        {replace && <button type="button" className="pv-btn pv-btn-sm" disabled={disabled || full} onClick={() => setKeptId(cur!.id)} data-testid="pv-recipes-keep" {...tip(full ? `${TAKE_MAX} takes is the most. Delete one first.` : `Keep ${cur!.name}; the next recipe makes a new take`)}>Keep this one</button>}</p>}
  </div>;
}

// ---------- Lens & size ----------
/** The lens and size of the chosen camera: a recipe take is baked again; the preset move keeps them on the shot (absent = its own); a flown
 *  take keeps the lens and distance you flew. */
export function LensKit({ shot, onEditShot, disabled }: { shot: PlanShot; onEditShot: EditShot; disabled: boolean }) {
  const take = chosenTake(shot); const rec = take?.recipe ?? null; const R = rec ? recipeOf(rec.id) : null; const tpl = previzTemplate(shot.template)!;
  if (take && !rec) return <PopNote testId="pv-lens-flown">{take.name} is flown by hand: it keeps the lens and the distance you flew. Pick a recipe take or the preset move to set them here.</PopNote>;
  const own = Math.round(lensMmOf(tpl.stage.fov)); const indoor = !!tpl.stage.interior;
  const edit = (patch: { lens?: LensMm | null; size?: ShotSize | null }) => onEditShot((s) => {
    const cur = chosenTake(s);
    if (cur?.recipe) { const next = rebakeTake(s, cur, { ...cur.recipe, ...(patch.lens ? { lens: patch.lens } : {}), ...(patch.size ? { size: patch.size } : {}) }); if (!next) return s;
      return { ...s, cameraPath: { ...s.cameraPath!, takes: s.cameraPath!.takes.map((k) => (k.id === cur.id ? { ...next, trimStart: Math.min(k.trimStart, next.trimEnd - 0.2), speed: k.speed } : k)) } }; }
    const n: PlanShot = { ...s }; if ('lens' in patch) { if (patch.lens) n.lens = patch.lens; else delete n.lens; } if ('size' in patch) { if (patch.size) n.size = patch.size; else delete n.size; } return n; });
  const lensV = rec ? String(rec.lens) : shot.lens ? String(shot.lens) : 'auto'; const sizeV = rec ? rec.size : shot.size ?? 'auto';
  const lensOff = disabled || !!R?.ownLens; const sizeOff = disabled || (!rec && indoor);
  return <div className="pv-lens" data-testid="pv-lens">
    <p className="pv-rcp-sub">For <b>{take ? take.name : 'the preset move'}</b>{rec ? '. Changing them bakes the recipe again.' : '. Auto keeps the preset’s own.'}</p>
    <PopSection label="Lens" aside={R?.ownLens ? 'Dolly-zoom sets its own lens' : lensV === 'auto' ? `${own} mm` : LENS_WORDS[Number(lensV) as LensMm]}>
      <Segmented label="Lens" value={lensV} testId="pv-lens-mm" onChange={(v) => { if (!lensOff) edit({ lens: v === 'auto' ? null : (Number(v) as LensMm) }); }}
        options={[...(rec ? [] : [{ value: 'auto', label: 'Auto', title: `The preset’s own lens (about ${own} mm)`, disabled: lensOff, testId: 'pv-lens-auto' }]), ...LENSES.map((mm) => ({ value: String(mm), label: `${mm}`, title: `${mm} mm: ${LENS_WORDS[mm]}`, disabled: lensOff, testId: `pv-lens-${mm}` }))]} /></PopSection>
    <PopSection label="Shot size" aside={indoor && !rec ? 'The glide is the shot indoors' : sizeV === 'auto' ? 'As the preset frames it' : SHOT_SIZES.find((x) => x.id === sizeV)?.name}>
      <Segmented label="Shot size" value={sizeV} testId="pv-size" onChange={(v) => { if (!sizeOff) edit({ size: v === 'auto' ? null : (v as ShotSize) }); }}
        options={[...(rec ? [] : [{ value: 'auto', label: 'Auto', title: 'As the preset frames it', disabled: sizeOff, testId: 'pv-size-auto' }]), ...SHOT_SIZES.map((x) => ({ value: x.id, label: x.label, title: x.name, disabled: sizeOff, testId: `pv-size-${x.id}` }))]} /></PopSection>
  </div>;
}

// ---------- Feel (shake) ----------
const strengthWord = (k: number) => (k < 0.25 ? 'Faint' : k < 0.5 ? 'Light' : k < 0.75 ? 'Natural' : 'Strong');
/** Camera feel: a profile and a strength, over whichever camera drives the shot (preset, recipe or flown). Seeded by the shot: the same every play. */
export function FeelKit({ shot, onEditShot, disabled }: { shot: PlanShot; onEditShot: EditShot; disabled: boolean }) {
  const p: ShakeProfile = shot.shake?.p ?? 'tripod'; const k = shot.shake?.k ?? SHAKE_DEFAULT_K;
  const set = (np: ShakeProfile, nk = k) => onEditShot((s) => { const n: PlanShot = { ...s }; if (np === 'tripod' || nk <= 0) delete n.shake; else n.shake = { p: np, k: Math.round(nk * 100) / 100 }; return n; });
  return <div className="pv-feel" data-testid="pv-feel">
    <p className="pv-rcp-sub">An operated-camera feel over whichever camera drives the shot. It is the same on every play and in the mockup.</p>
    <PopSection label="Camera feel"><Segmented label="Camera feel" value={p} cols={3} testId="pv-shake" onChange={(v) => { if (!disabled) set(v, v !== 'tripod' && k <= 0 ? SHAKE_DEFAULT_K : k); }}
      options={SHAKES.map((x) => ({ value: x.id, label: x.label, hint: x.hint, disabled, testId: `pv-shake-${x.id}` }))} /></PopSection>
    <label className={`pv-clean-f pv-feel-k${p === 'tripod' ? ' off' : ''}`} {...tip(p === 'tripod' ? 'Pick a feel first' : 'How strong the feel is')}><span>Strength <b data-testid="pv-shake-k-v">{p === 'tripod' ? 'None' : strengthWord(k)}</b></span>
      <input type="range" min={0.05} max={1} step={0.05} value={k} disabled={disabled || p === 'tripod'} aria-label="Shake strength" data-testid="pv-shake-k" style={{ ['--pv-k' as any]: `${((k - 0.05) / 0.95) * 100}%` }} onChange={(e) => set(p, Number(e.target.value))} /></label>
  </div>;
}

// ---------- Guides (UI only) ----------
export type GuideId = 'thirds' | 'centre' | 'safe' | 'scope';
export type Guides = Record<GuideId, boolean>;
export const GUIDES: { id: GuideId; label: string; hint: string }[] = [
  { id: 'thirds', label: 'Rule of thirds', hint: 'Two lines each way: put eyes and horizons on them' },
  { id: 'centre', label: 'Centre mark', hint: 'A small cross in the middle of the frame' },
  { id: 'safe', label: 'Safe areas', hint: 'Keep action inside the outer box, titles inside the inner one' },
  { id: 'scope', label: '2.39 letterbox', hint: 'Cinema widescreen bars, to frame for a scope crop (16:9 only)' },
];
const GUIDES_KEY = 'ohf:pv-guides';
export const NO_GUIDES: Guides = { thirds: false, centre: false, safe: false, scope: false };
export function loadGuides(): Guides { try { const g = JSON.parse(localStorage.getItem(GUIDES_KEY) ?? 'null'); if (g && typeof g === 'object') return { ...NO_GUIDES, ...Object.fromEntries(Object.entries(g).filter(([k, v]) => k in NO_GUIDES && typeof v === 'boolean')) }; } catch { /* private window */ } return NO_GUIDES; }
export function saveGuides(g: Guides) { try { localStorage.setItem(GUIDES_KEY, JSON.stringify(g)); } catch { /* private window */ } }
export const anyGuide = (g: Guides) => Object.values(g).some(Boolean);

export function GuidesKit({ guides, onGuides, aspect }: { guides: Guides; onGuides: (g: Guides) => void; aspect: PlanShot['aspect'] }) {
  return <div className="pv-guides-kit" data-testid="pv-guides-kit">
    <p className="pv-rcp-sub">Drawn over the view only: they never appear in a mockup or a render. G turns them on and off.</p>
    <div className="pv-guides-list">{GUIDES.map((g) => { const off = g.id === 'scope' && aspect !== '16:9';
      return <PopSwitch key={g.id} label={g.label} hint={off ? 'For 16:9 frames' : g.hint} on={guides[g.id] && !off} onChange={(v) => { if (!off) onGuides({ ...guides, [g.id]: v }); }} testId={`pv-guide-${g.id}`} rowTestId={`pv-guide-row-${g.id}`} />; })}</div>
  </div>;
}
/** The guides over the stage (pointer-events none). The 2.39 bars mask the frame top and bottom for a 16:9 shot. */
export function FrameGuides({ guides, aspect }: { guides: Guides; aspect: PlanShot['aspect'] }) {
  if (!anyGuide(guides)) return null; const [aw, ah] = aspect.split(':').map(Number); const bar = guides.scope && aspect === '16:9' ? Math.max(0, (1 - aw / ah / 2.39) / 2) * 100 : 0;
  return <div className="pv-guides" aria-hidden data-testid="pv-guides" data-nofly="">
    {bar > 0 && <><i className="pv-g-bar" style={{ top: 0, height: `${bar}%` }} /><i className="pv-g-bar" style={{ bottom: 0, height: `${bar}%` }} /></>}
    {guides.thirds && <><i className="pv-g-v" style={{ left: '33.333%' }} /><i className="pv-g-v" style={{ left: '66.667%' }} /><i className="pv-g-h" style={{ top: `${bar + (100 - 2 * bar) / 3}%` }} /><i className="pv-g-h" style={{ top: `${bar + (2 * (100 - 2 * bar)) / 3}%` }} /></>}
    {guides.centre && <i className="pv-g-c" />}
    {guides.safe && <><i className="pv-g-safe" style={{ inset: '3.5%' }} /><i className="pv-g-safe pv-g-title" style={{ inset: '5%' }} /></>}
  </div>;
}

// ---------- the Camera popover ----------
export type CameraTab = 'recipes' | 'lens' | 'feel' | 'guides';
export function CameraPanel({ shot, onEditShot, disabled, onApplied, guides, onGuides, tab, onTab }: { shot: PlanShot; onEditShot: EditShot; disabled: boolean; onApplied?: (label: string, added: boolean) => void;
  guides: Guides; onGuides: (g: Guides) => void; tab: CameraTab; onTab: (t: CameraTab) => void }) {
  return <div className="pv-campanel" data-testid="pv-camera">
    <Segmented label="Camera" value={tab} testId="pv-camera-tabs" onChange={onTab} options={[{ value: 'recipes', label: 'Recipes', testId: 'pv-camera-tab-recipes' }, { value: 'lens', label: 'Lens & size', testId: 'pv-camera-tab-lens' }, { value: 'feel', label: 'Feel', testId: 'pv-camera-tab-feel' }, { value: 'guides', label: 'Guides', testId: 'pv-camera-tab-guides' }]} />
    {tab === 'recipes' && <ShotRecipes shot={shot} onEditShot={onEditShot} disabled={disabled} onApplied={onApplied} />}
    {tab === 'lens' && <LensKit shot={shot} onEditShot={onEditShot} disabled={disabled} />}
    {tab === 'feel' && <FeelKit shot={shot} onEditShot={onEditShot} disabled={disabled} />}
    {tab === 'guides' && <GuidesKit guides={guides} onGuides={onGuides} aspect={shot.aspect} />}
  </div>;
}
