// Easy light (2026-10-25): Relight's compact light panel works through shared/lightEasy.ts. Direction chips snap to fixed angles and any
// angle reads back as plain words; Strength / Soft-Hard map onto the rig's intensity, ambient and softness; the preview handle maps points
// ↔ angles; the approximate sketch follows the light; old saved settings open in the right place; the prompt for the same rig is unchanged.
// Run: npx tsx test/light-easy.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'light-easy-')); process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const E = await import('../src/shared/lightEasy.ts');
const R = await import('../src/shared/lightRig.ts');
const { relightPrompt } = await import('../src/tools/apps.ts');
let n = 0; const ok = (m: string) => { n++; console.log(`ok ${n} - ${m}`); };
const K = (az: number, el: number, intensity = 60, softness = 60) => ({ az, el, kelvin: 5600, intensity, softness });

// ---- direction chips → angles, and back ----
{
  const at = (id: any) => { const l = E.withDirection(K(33, -20), id); return [l.az, l.el]; };
  assert.deepEqual(at('front'), [0, 0]); assert.deepEqual(at('left'), [-90, 0]); assert.deepEqual(at('right'), [90, 0]); assert.deepEqual(at('top'), [0, 90]); assert.deepEqual(at('behind'), [180, 0]); assert.deepEqual(at('below'), [0, -90]);
  assert.equal(E.DIRECTIONS.length, 6, 'six quick picks');
  const l = E.withDirection({ ...K(10, 10), color: '#E05AD8' }, 'left'); assert.equal(l.color, '#E05AD8'); assert.equal(l.intensity, 60, 'only the angles move');
  for (const d of E.DIRECTIONS) assert.equal(E.directionOf(d.az, d.el), d.id, `${d.id} reads back as itself`);
  assert.equal(E.directionOf(-45, 30), null, 'another position: no chip'); assert.equal(E.directionOf(-80, 10), 'left'); assert.equal(E.directionOf(170, 0), 'behind'); assert.equal(E.directionOf(-175, 20), 'behind');
  assert.equal(E.directionOf(40, 82), 'top'); assert.equal(E.directionOf(0, -70), 'below'); assert.equal(E.directionOf(0, 45), null, 'front, high: no chip'); assert.equal(E.directionOf(270, 0), 'left', 'wraps');
  ok('six quick picks on fixed positions; any angle maps to its quick pick or none');
}
// ---- plain-words labels (degrees only in the tooltip) ----
{
  assert.equal(E.plainDir(-90, 10), 'From the left'); assert.equal(E.plainDir(-80, 30), 'From the left, high up'); assert.equal(E.plainDir(45, 50), 'From the front-right, high up');
  assert.equal(E.plainDir(0, 0), 'From the front'); assert.equal(E.plainDir(140, 10), 'From behind, on the right'); assert.equal(E.plainDir(180, 15), 'From behind');
  assert.equal(E.plainDir(0, 80), 'From straight above'); assert.equal(E.plainDir(20, -30), 'From the front, low down'); assert.equal(E.plainDir(-10, -80), 'From straight below');
  for (const c of R.LIGHT_CELLS) assert.equal(E.plainDir(c.az, c.el), c.label, `${c.id}: the panel says what the prompt says`);
  assert.equal(E.shortDir(-80, 10), 'from the left'); assert.equal(E.shortDir(150, 10), 'from behind'); assert.equal(E.shortDir(0, 75), 'from above'); assert.equal(E.shortDir(-45, 30), 'from the front-left'); assert.equal(E.shortDir(0, -90), 'from below');
  assert.equal(E.degTip(-80, 10), '80° left, 10° up'); assert.equal(E.degTip(0, 0), 'straight on, eye level'); assert.equal(E.degTip(180, -5), 'from behind, 5° down');
  for (const s of [E.plainDir(-33, 12), E.shortDir(77, -8)]) assert.ok(!/\d|°/.test(s), `no numbers in "${s}"`);
  ok('plain-words direction labels; degrees only in degTip');
}
// ---- strength / softness mapping ----
{
  const rig = { key: K(-45, 30, 50, 50), ambient: 40 };
  for (const s of E.STRENGTHS) { const r = E.withStrength(rig, s.id); assert.equal(r.key.intensity, s.intensity); assert.equal(r.ambient, s.ambient); assert.equal(E.strengthOf(r), s.id, `${s.id} reads back`); assert.equal(r.key.softness, 50, 'strength leaves softness'); }
  assert.ok(E.STRENGTHS[0].intensity < E.STRENGTHS[1].intensity && E.STRENGTHS[1].intensity < E.STRENGTHS[2].intensity, 'stronger key from Subtle to Dramatic');
  assert.ok(E.STRENGTHS[0].ambient > E.STRENGTHS[1].ambient && E.STRENGTHS[1].ambient > E.STRENGTHS[2].ambient, 'less fill from Subtle to Dramatic');
  assert.equal(E.withQuality(rig, 'soft').key.softness, 80); assert.equal(E.withQuality(rig, 'hard').key.softness, 20); assert.equal(E.qualityOf({ softness: 50 }), 'soft'); assert.equal(E.qualityOf({ softness: 49 }), 'hard');
  const by = Object.fromEntries(R.SPHERE_PRESETS.map((p) => [p.id, E.strengthOf(p.rig)])); assert.equal(by.overcast, 'subtle'); assert.equal(by['neon-rim'], 'dramatic'); assert.equal(by.window, 'balanced');
  assert.equal(E.ambientPlain(5), 'Dark mood'); assert.equal(E.ambientPlain(90), 'Bright and airy'); assert.equal(E.warmthPlain({ kelvin: 2700 }), 'Very warm'); assert.equal(E.warmthPlain({ kelvin: 3200, color: '#33D6FF' }), 'Colour', 'a colour overrides warm/cool');
  ok('Subtle / Balanced / Dramatic → intensity + ambient; Soft / Hard → softness extremes');
}
// ---- presets: "edited", and the bar chip ----
{
  const p = R.spherePresetOf('window')!; const rig = { ...structuredClone(p.rig), preset: 'window' };
  assert.equal(E.presetEdited(rig), false); assert.equal(E.rigChipPlain(rig), 'Window light · from the left');
  const moved = { ...rig, key: E.withDirection(rig.key, 'right') }; assert.equal(E.presetEdited(moved), true); assert.equal(E.rigChipPlain(moved), 'Window light · from the right');
  assert.equal(E.presetEdited(E.withStrength(rig, 'dramatic')), true); assert.equal(E.presetEdited({ key: K(0, 0), ambient: 30 }), false, 'no preset = never edited');
  assert.equal(E.rigChipPlain({ key: K(0, 0, 60, 80), ambient: 30 }), 'Soft light · from the front'); assert.equal(E.rigChipPlain({ ...structuredClone(R.spherePresetOf('neon-rim')!.rig), preset: 'neon-rim' }), 'Neon rim · from the right');
  ok('a tweaked preset reads "edited"; the chip is short and plain');
}
// ---- old saved settings ----
{
  const old = R.rigJson({ key: K(-45, 30, 70, 40), rim: { az: 150, el: 20, kelvin: 6500, intensity: 60, softness: 30 }, ambient: 25, preset: 'studio-softbox' });
  const r = E.rigOfFields({ light: old }); assert.equal(r.key.az, -45); assert.equal(r.rim?.az, 150); assert.equal(r.preset, 'studio-softbox'); assert.equal(R.rigJson(r), old, 'a saved rig round-trips byte for byte');
  const legacy = E.rigOfFields({ direction: 'left', lightQuality: 'hard', brightness: '80', color: '#FFC98A', look: 'window' }); assert.equal(legacy.key.az, -90); assert.equal(legacy.key.softness, 20); assert.equal(legacy.key.kelvin, 3200); assert.equal(legacy.preset, 'window');
  assert.equal(E.rigChipPlain(legacy), 'Window light · from the left');
  const pad = E.rigOfFields({ lightX: '0.5', lightY: '0.5', look: 'custom' }); assert.equal(pad.key.az, 45); assert.equal(pad.key.el, 45); assert.equal(pad.preset, undefined);
  assert.equal(E.rigOfFields({ light: '{bad' }).key.az, 0, 'unreadable rig: the legacy fields (front) instead'); assert.deepEqual(E.rigOfFields({}).key.az, 0);
  ok('saved rigs and pre-rig drafts open where their light was');
}
// ---- the prompt for a rig: the fixed position's words ----
{
  const light = JSON.stringify({ key: { az: -80, el: 10, kelvin: 5600, intensity: 60, softness: 75 }, ambient: 30, preset: 'window' });
  assert.equal(relightPrompt({ light, look: 'window' }, '', undefined), 'relight the scene with soft natural window light; key light from the left side of the frame, at eye level, split side lighting, neutral 5600K daylight, medium strength; soft diffused light with gentle shadow edges (softness 75%); low ambient fill: rich, dark shadows (ambient 30%); daylight from a large window just out of frame as the only source; the light wraps softly around the face and falls off quickly into a gentle shadow side that keeps its detail, a rectangular window catchlight in the eyes, soft highlights on the cheekbone and hair, the room behind dimmer and quietly shaded; the new lighting is clearly visible across the whole image; keep the subject, pose and composition unchanged');
  assert.equal(relightPrompt({ direction: 'left', lightQuality: 'soft', brightness: '50', color: '#FFFFFF', look: 'custom' }, '', undefined), 'relight the scene; light from the left side of the frame; soft diffused light, gentle shadows; normal-strength neutral white light; keep the subject, pose and composition unchanged', 'old fields keep their old prompt');
  // the panel's edits are plain rigs: the same rig sent through the field gives the same words as the rig itself
  const p = R.spherePresetOf('golden-hour')!; const r = E.withQuality(E.withStrength({ ...structuredClone(p.rig), key: E.withDirection(p.rig.key, 'left'), preset: p.id }, 'dramatic'), 'hard');
  const parsed = R.parseLightRig(R.rigJson(r)); assert.ok(parsed && 'rig' in parsed); assert.deepEqual(parsed.rig, r);
  assert.match(relightPrompt({ light: R.rigJson(r), look: p.look }, '', undefined), /key light from the left side of the frame, at eye level, split side lighting.*hard crisp light.*almost no ambient fill/);
  ok('a rig is worded by its fixed position; old fields keep their old prompt; panel edits round-trip through the light field');
}
// ---- the preview handle and the sketch ----
{
  for (const [az, el] of [[0, 0], [-90, 0], [45, -45], [135, 45], [-135, 0], [180, 45], [0, 90], [0, -90]]) {
    const h = E.handleOf(az, el); const a = E.anglesOfPoint(h.x, h.y, h.behind); assert.equal(a.az, R.wrapAz(az), `az ${az} round-trips`); assert.equal(a.el, el, `el ${el} round-trips`);
    assert.ok(h.x >= 0.08 && h.x <= 0.92 && h.y >= 0.08 && h.y <= 0.92, 'the handle stays inside the photo'); assert.equal(h.behind, Math.abs(az) > 90);
  }
  assert.ok(E.handleOf(-90, 0).x < 0.5 && E.handleOf(90, 0).x > 0.5 && E.handleOf(0, 60).y < 0.5, 'left is left, up is up');
  assert.deepEqual(E.anglesOfPoint(-1, 2), { az: 0, el: -90 }, 'off the photo: clamped (straight below)'); assert.equal(E.anglesOfPoint(0.25, 0.5, true).az, -135, 'behind stays behind while dragging');
  assert.deepEqual(E.anglesOfPoint(0.47, 0.45), { az: 0, el: 0 }, 'a drag snaps to the nearest position'); assert.deepEqual(E.anglesOfPoint(0.3, 0.3), { az: -45, el: 45 });
  assert.equal(E.gridPoints().length, 17); assert.equal(E.gridPoints(true).length, 11);
  for (const g of E.gridPoints()) { const a = E.anglesOfPoint(g.x, g.y); assert.equal(R.lightCell(a.az, a.el).id, g.id, `guide dot ${g.id} snaps to itself`); }
  const s = (rig: any) => E.sketchOf(rig); const base = { key: K(-90, 10, 65, 80), ambient: 30 };
  assert.match(s(base).layers[1].bg, /at 8(\.0)?% /, 'the glow sits on the left'); assert.match(s({ ...base, key: K(90, 10, 65, 80) }).layers[1].bg, /at 92% /, 'and moves right');
  const con = (x: any) => Number(/contrast\(([\d.]+)\)/.exec(s(x).filter)![1]);
  assert.ok(con(E.withStrength(base, 'dramatic')) > con(E.withStrength(base, 'subtle')), 'dramatic has more contrast than subtle');
  const edge = (x: any) => { const m = /\(([\d.]+)deg,rgba\(0,0,0,0\) ([\d.]+)%,rgba\(0,0,0,[\d.]+\) ([\d.]+)%/.exec(s(x).layers[0].bg)!; return Number(m[3]) - Number(m[2]); };
  assert.ok(edge(E.withQuality(base, 'hard')) < edge(E.withQuality(base, 'soft')), 'hard light: a crisper shadow edge');
  assert.equal(s(base).layers.length, 3); assert.equal(s({ ...base, rim: { az: 150, el: 20, kelvin: 6500, intensity: 60, softness: 30 } }).layers.length, 4, 'a rim adds an edge');
  assert.match(s({ key: { ...K(0, 15), color: '#E05AD8' }, ambient: 30 }).layers[2].bg, /rgba\(224,90,216,1\)/, 'the colour tints the photo');
  assert.equal(s({ key: K(180, 15), ambient: 20 }).layers[1].blend, 'screen'); assert.match(s({ key: K(180, 15), ambient: 20 }).layers[1].bg, /^radial-gradient\(ellipse/, 'a backlight is an edge glow');
  ok('the handle maps points ↔ angles; the sketch follows direction, strength, softness, colour and rim');
}
console.log(`1..${n}`);
