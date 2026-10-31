// Light sphere (2026-10-24; fixed positions 2026-10-31): the rig → Relight wording (26 fixed positions, colour temperature names, softness, rim, ambient) on all
// three model families; the `light` field is validated (bad JSON / out of range = 400 format, on the quote too); sphere presets map onto the
// Relight looks; old drafts (direction / pad / quality / brightness / colour, no `light`) keep their old prompt and open the sphere in the right place.
// Run: npx tsx test/light-sphere.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'light-sphere-')); process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const R = await import('../src/shared/lightRig.ts');
const { APP_GALLERY, relightPrompt, appFieldQuoteError, RELIGHT_KEEP, RELIGHT_SENTENCE_KEEP } = await import('../src/tools/apps.ts');
const { RELIGHT_LOOKS } = await import('../src/tools/appRows.ts');
let n = 0; const ok = (m: string) => { n++; console.log(`ok ${n} - ${m}`); };
const K = (az: number, el: number, kelvin = 5600, intensity = 60, softness = 60, color?: string) => ({ az, el, kelvin, intensity, softness, ...(color ? { color } : {}) });

// ---- directions (seen from the camera) and heights ----
{
  // 26 fixed positions: every angle snaps to one, and each has one label and one prompt phrase with no clashing height or side words
  assert.equal(R.LIGHT_CELLS.length, 26); assert.equal(new Set(R.LIGHT_CELLS.map((c) => c.id)).size, 26, 'unique ids');
  assert.equal(new Set(R.LIGHT_CELLS.map((c) => c.phrase)).size, 26, 'one phrase per position'); assert.equal(new Set(R.LIGHT_CELLS.map((c) => c.label)).size, 26, 'one label per position');
  for (const c of R.LIGHT_CELLS) {
    assert.deepEqual(R.snapAngles(c.az, c.el), { az: c.az, el: c.el }, `${c.id} is a fixed position`);
    const heights = ['high above', 'at eye level', 'below eye level', 'overhead', 'directly below'].filter((w) => c.phrase.includes(w)); assert.equal(heights.length, 1, `${c.id}: one height in "${c.phrase}"`);
    const sides = ['left', 'right'].filter((w) => c.phrase.includes(w)); assert.ok(sides.length <= 1, `${c.id}: one side in "${c.phrase}"`);
    assert.ok(!/\d|°/.test(c.phrase + c.label), `${c.id}: no numbers`);
  }
  const c = (az: number, el = 0) => R.lightCell(az, el).phrase;
  assert.equal(c(0), 'from the front, at eye level'); assert.equal(c(-25), 'from the front-left of the frame, at eye level'); assert.equal(c(45, 30), 'from the front-right of the frame, high above eye level');
  assert.equal(c(-90), 'from the left side of the frame, at eye level'); assert.equal(c(135), 'from behind the subject on the right, at eye level'); assert.equal(c(-179), 'from directly behind the subject, at eye level');
  assert.equal(c(30, 80), 'from directly overhead'); assert.equal(c(0, -75), 'from directly below'); assert.equal(c(270), 'from the left side of the frame, at eye level', '270° wraps to −90°');
  assert.equal(c(-40, 12), 'from the front-left of the frame, at eye level', '12° up is eye level: no "12° up" next to "at eye level"');
  assert.deepEqual(R.snapAngles(-40, 12), { az: -45, el: 0 }); assert.deepEqual(R.snapAngles(170, -30), { az: 180, el: -45 }); assert.deepEqual(R.snapAngles(-120, 80), { az: 0, el: 90 }, 'straight above has no side');
  assert.equal(R.lightCell(-45, 45).label, 'From the front-left, high up'); assert.equal(R.lightCell(135, -45).label, 'From behind, on the right, low down');
  assert.equal(R.setupName(-45, 30), 'Rembrandt-style three-quarter lighting'); assert.equal(R.setupName(0, 40), 'butterfly lighting'); assert.equal(R.setupName(90, 0), 'split side lighting');
  assert.equal(R.setupName(170, 10), 'a backlight'); assert.equal(R.setupName(0, -60), 'under-lighting'); assert.equal(R.setupName(10, 5), '');
  ok('26 fixed positions: one label and one clash-free phrase each; classic setup names');
}
// ---- colour temperature names, creative colours, softness, ambient ----
{
  assert.equal(R.kelvinName(2000), 'very warm 2000K candle-flame'); assert.equal(R.kelvinName(2700), 'warm 2700K household tungsten'); assert.equal(R.kelvinName(3200), 'warm 3200K tungsten');
  assert.equal(R.kelvinName(4000), 'warm-white 4000K'); assert.equal(R.kelvinName(5600), 'neutral 5600K daylight'); assert.equal(R.kelvinName(6500), 'cool 6500K overcast daylight');
  assert.equal(R.kelvinName(8000), 'cool 8000K shade-blue'); assert.equal(R.kelvinName(10000), 'deep blue 10000K sky'); assert.equal(R.kelvinName(3249), 'warm 3200K tungsten', 'rounded to 100K');
  assert.equal(R.tintName({ kelvin: 5600, color: '#e05ad8' }), 'magenta (#E05AD8) coloured', 'a creative colour wins over the temperature');
  assert.match(R.softnessWords(10), /^hard crisp light with sharp-edged shadows \(softness 10%\)$/); assert.match(R.softnessWords(90), /^very soft wrap-around light/);
  assert.match(R.ambientWords(5), /deep black shadows, low-key \(ambient 5%\)/); assert.match(R.ambientWords(80), /high-key \(ambient 80%\)/);
  const [r, , b] = R.kelvinRgb(2000); const [r2, , b2] = R.kelvinRgb(10000); assert.ok(r > b && b2 > r2, 'warm is red-heavy, cool is blue-heavy');
  ok('kelvin names, creative colour, softness and ambient words');
}
// ---- the rig as text, readout and chip ----
const rig = { key: K(-45, 30, 3200, 75, 60), rim: K(150, 20, 7500, 60, 30), ambient: 25 };
{
  const t = R.rigToText(rig);
  assert.equal(t, 'key light from the front-left of the frame, high above eye level, Rembrandt-style three-quarter lighting, warm 3200K tungsten, bright; '
    + 'soft diffused light with gentle shadow edges (softness 60%); rim light from behind the subject on the right, at eye level, cool 7500K shade-blue, medium strength: a bright edge outlining the hair, shoulders and silhouette; '
    + 'low ambient fill: rich, dark shadows (ambient 25%)');
  assert.equal(R.lightReadout(rig.key), 'Key · 45° left · 30° up · 3200K · soft 60%');
  assert.equal(R.lightReadout(K(0, 0, 5600, 50, 20), 'Key'), 'Key · front · level · 5600K · hard 80%');
  assert.equal(R.rigChip(rig), '45°L 30°↑ · 3200K + rim');
  assert.match(R.rigToText({ key: K(-45, 10), rim: K(-60, 10), ambient: 50 }), /second accent light from/, 'a second light in front is not called a rim');
  ok('rigToText, readout, chip');
}
// ---- parse / validate ----
{
  const p = R.parseLightRig(JSON.stringify({ key: { az: -315, el: 10.4, kelvin: 3333, intensity: 50.6, softness: 40, color: '#ff00aa' }, ambient: 20, preset: 'candle' }));
  assert.ok(p && 'rig' in p); assert.deepEqual(p.rig, { key: { az: 45, el: 10, kelvin: 3350, color: '#FF00AA', intensity: 51, softness: 40 }, ambient: 20, preset: 'candle' });
  assert.equal(R.parseLightRig(''), null); assert.equal(R.parseLightRig(undefined), null);
  for (const [bad, why] of [['{', /valid JSON/], ['[]', /JSON object/], ['{"key":{"az":0}}', /el must be a number/], [JSON.stringify({ key: K(0, 95) }), /el must be -90–90/],
    [JSON.stringify({ key: K(0, 0, 1000) }), /kelvin must be 2000–10000/], [JSON.stringify({ key: K(0, 0, 5600, 50, 50, 'red') }), /hex colour/], [JSON.stringify({ key: K(0, 0), ambient: 101 }), /Ambient must be 0–100/],
    [JSON.stringify({ key: K(0, 0), preset: 'Bad Preset!' }), /preset id/], ['x'.repeat(900), /too long/]] as const) {
    const r = R.parseLightRig(bad); assert.ok(r && 'error' in r && why.test(r.error), `${bad.slice(0, 30)} → ${JSON.stringify(r)}`);
  }
  // the app field: canonical JSON stored, 400 format on the quote
  const a = APP_GALLERY.find((x) => x.id === 'relight')!; const f = a.fields!.find((x) => x.name === 'light')!;
  assert.equal(f.kind, 'json'); assert.equal(f.optional, true); assert.ok(a.exposed!.includes('light'));
  assert.deepEqual(f.parse!(JSON.stringify({ ambient: 25, rim: rig.rim, key: rig.key })), { value: R.rigJson(rig) }); assert.equal(R.rigJson(rig), JSON.stringify(rig), "stable key order");
  const tool = { app: { gallery: a } } as any;
  assert.equal(appFieldQuoteError(tool, { light: JSON.stringify(rig) }), null);
  const e = appFieldQuoteError(tool, { light: '{"key":1}' }) as any; assert.equal(e?.code, 'format'); assert.equal(e?.field, 'light');
  ok('parse: clamps and normalises; bad JSON / ranges / colour / preset are refused (400 format on the quote)');
}
// ---- Relight prompt with a rig, per family ----
{
  const v = { look: 'custom', direction: 'front', lightQuality: 'soft', brightness: '50', color: '#FFFFFF', lightX: '', lightY: '', light: R.rigJson(rig) };
  const flux = relightPrompt(v, 'calm mood', 'comfy-klein4b'); const qwen = relightPrompt(v, 'calm mood', 'comfy-qwen21-turbo'); const sen = relightPrompt(v, 'calm mood', 'api-nano-banana-21');
  for (const s of [flux, qwen, sen]) {
    assert.ok(s.includes('front-left of the frame, high above eye level') && s.includes('warm 3200K tungsten') && s.includes('softness 60%') && s.includes('behind the subject on the right, at eye level') && !/°/.test(s) && s.includes('ambient 25%') && /calm mood/i.test(s), s);
    assert.ok(!/light from the front, facing the subject|normal-strength neutral white light/.test(s), 'the old controls are ignored once a rig is sent');
  }
  assert.ok(flux.startsWith('relight the scene; key light from the front-left') && flux.endsWith('keep the subject, pose and composition unchanged'), flux);
  assert.ok(qwen.startsWith('Relight the scene: key light from the front-left') && qwen.endsWith(RELIGHT_KEEP), qwen);
  assert.ok(sen.startsWith(`${RELIGHT_SENTENCE_KEEP} Relight this photo. The key light comes from the front-left`) && sen.endsWith('follow the new light.'), sen); // Nano Banana: keep sentence first (shared/promptPatterns.ts relight)
  // a look names the setup and keeps its description, but not its fixed colour temperature (the rig says its own)
  const gh = RELIGHT_LOOKS.find((l) => l.value === 'golden-hour')!;
  const g = relightPrompt({ ...v, look: 'golden-hour' }, '', 'comfy-klein4b');
  assert.ok(g.startsWith(`relight the scene with ${gh.light}; key light`) && g.includes(gh.prompt.split(';')[0]) && !g.includes(gh.tone), g);
  // a sphere preset with no look (Moonlight) still names its setup
  const mo = R.spherePresetOf('moonlight')!; const m = relightPrompt({ ...v, light: R.rigJson({ ...mo.rig, preset: 'moonlight' }) }, '', 'api-gpt-image');
  assert.ok(m.startsWith('Relight this photo with cool moonlight at night.'), m);
  // a broken rig in an old saved job falls back to the old controls (never throws)
  assert.equal(relightPrompt({ ...v, light: '{' }, '', 'comfy-klein4b'), relightPrompt({ ...v, light: '' }, '', 'comfy-klein4b'));
  ok('Relight with a rig: precise wording on flux / qwen / sentence families, look setup kept, tone replaced, preset setup named');
}
// ---- presets and backward compatibility ----
{
  const looks = new Set(RELIGHT_LOOKS.map((l) => l.value));
  assert.deepEqual(['Golden hour', 'Studio softbox', 'Neon rim', 'Overhead noon', 'Candle', 'Moonlight', 'Window light'].filter((l) => !R.SPHERE_PRESETS.some((p) => p.label === l)), [], 'the seven asked-for presets');
  for (const L of RELIGHT_LOOKS.filter((l) => l.value !== 'custom')) assert.ok(R.SPHERE_PRESETS.some((p) => p.look === L.value), `old look ${L.value} has a preset`);
  for (const p of R.SPHERE_PRESETS) for (const l of [p.rig.key, p.rig.rim].filter(Boolean)) assert.deepEqual(R.snapAngles(l!.az, l!.el), { az: l!.az, el: l!.el }, `${p.id} sits on fixed positions`);
  for (const p of R.SPHERE_PRESETS) { assert.ok(looks.has(p.look), `${p.id} → a real look`); const r = R.parseLightRig(R.rigJson({ ...p.rig, preset: p.id })); assert.ok(r && 'rig' in r, `${p.id} rig is valid`); assert.ok(p.light, `${p.id} names its setup`); }
  assert.equal(new Set(R.SPHERE_PRESETS.map((p) => p.id)).size, R.SPHERE_PRESETS.length);
  // old fields → where the sphere opens
  assert.deepEqual(R.rigFromLegacy({ direction: 'left', lightQuality: 'hard', brightness: '80', color: '#FFC98A' }).key, { az: -90, el: 0, kelvin: 3200, intensity: 80, softness: 20 });
  assert.deepEqual(R.rigFromLegacy({ direction: 'back', color: '#5FD3C6' }).key, { az: 180, el: 0, kelvin: 5600, intensity: 50, softness: 70, color: '#5FD3C6' });
  assert.deepEqual(R.rigFromLegacy({ direction: 'front', lightX: '-1', lightY: '0.5' }).key.az, -90); assert.equal(R.rigFromLegacy({ lightX: '-1', lightY: '0.5' }).key.el, 45, 'snapped to a fixed position');
  // an old draft without `light` gives the old prompt (relight-looks.test.ts pins it byte for byte); this one too
  assert.equal(relightPrompt({ look: 'custom', direction: 'front', lightQuality: 'soft', brightness: '50', color: '#FFFFFF', lightX: '', lightY: '' }, '', 'comfy-klein4b'),
    'relight the scene; light from the front, facing the subject; soft diffused light, gentle shadows; normal-strength neutral white light; keep the subject, pose and composition unchanged');
  ok('presets: the seven new ones plus every old look, valid rigs; old drafts keep their prompt and open the sphere where their light was');
}
console.log(`\n${n} passed`);
