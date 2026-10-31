// Relight looks (2026-10-23): every look × model family composes a prompt with the look's lighting words and the right keep-lock, with no
// "keep the lighting" next to "change the light"; Custom (and no look) is worded per family too, untouched = the default light; a look's tone drops
// when the colour is changed; picking a look is validated like any select; the recipe carries swatches / sets / credits to the bar.
// Run: npx tsx test/relight-looks.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'relight-looks-')); process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const { APP_GALLERY, RELIGHT_CHANGE, RELIGHT_KEEP, RELIGHT_LOOK_CHANGE, RELIGHT_SENTENCE_KEEP, relightPrompt, relightFamilyOf } = await import('../src/tools/apps.ts');
const { RELIGHT_LOOKS, RELIGHT_DIRECTIONS, RELIGHT_QUALITY, padPhrase, brightnessWord, colourName } = await import('../src/tools/appRows.ts');
const { EDIT_MODELS } = await import('../src/shared/imageFeatures.ts');
let n = 0; const ok = (m: string) => { n++; console.log(`ok ${n} - ${m}`); };
const a = APP_GALLERY.find((x) => x.id === 'relight')!; const has = () => true;
const FAMILY_PROVIDER = { qwen: 'comfy-qwen21-turbo', sentence: 'api-gpt-image', flux: 'comfy-klein4b' } as const;

// ---- families: every edit model lands in one, GPT Image + Nano Banana are 'sentence', the three Qwen edit routes are 'qwen' ----
{
  for (const p of EDIT_MODELS) assert.ok(['qwen', 'sentence', 'flux'].includes(relightFamilyOf(p)), p);
  for (const p of ['comfy-qwen21', 'comfy-qwen21-turbo', 'comfy-qwen-image']) assert.equal(relightFamilyOf(p), 'qwen', p);
  for (const p of ['api-gpt-image', 'api-gpt-image-25-flare', 'api-nano-banana', 'api-nano-banana-pro', 'api-nano-banana-21']) assert.equal(relightFamilyOf(p), 'sentence', p);
  for (const p of ['comfy-klein4b', 'comfy-flux3-klein', 'api-flux2', 'api-seedream', 'api-qwen-image']) assert.equal(relightFamilyOf(p), 'flux', p);
  assert.equal(relightFamilyOf(undefined), 'flux');
  assert.equal(relightFamilyOf('direct-gemini-nb2-lite'), 'sentence', 'Nano Banana 2 Lite is Nano Banana too');
  ok('model families: qwen / sentence (GPT Image, Nano Banana) / flux (the rest)');
}
// ---- keep sentence position (shared/promptPatterns.ts relight): Nano Banana first (Comfy's NB2 relight template), GPT Image last ----
{
  const { relightKeepFirst } = await import('../src/tools/apps.ts');
  const v = { look: 'golden-hour', direction: 'left', lightQuality: 'soft', brightness: '60', color: '#FFFFFF', lightX: '', lightY: '' };
  for (const p of ['api-nano-banana', 'api-nano-banana-pro', 'api-nano-banana-21', 'direct-gemini-nb2-lite']) { assert.ok(relightKeepFirst(p), p); const s = relightPrompt(v, '', p);
    assert.ok(s.startsWith(`${RELIGHT_SENTENCE_KEEP} Relight this photo with `), `${p}: ${s}`); assert.equal(s.split(RELIGHT_SENTENCE_KEEP).length, 2, 'once'); }
  for (const p of ['api-gpt-image', 'api-gpt-image-15']) { assert.ok(!relightKeepFirst(p), p); assert.ok(relightPrompt(v, '', p).endsWith(RELIGHT_SENTENCE_KEEP), p); }
  ok('keep sentence: first on Nano Banana, last on GPT Image');
}

// ---- Custom / no look: worded per family like the looks (2026-10-31); untouched fields = the panel's default light (DEFAULT_RIG) ----
{
  const { RELIGHT_SENTENCE_CHANGE, relightKeepFirst } = await import('../src/tools/apps.ts');
  const { DEFAULT_RIG, rigJson } = await import('../src/shared/lightRig.ts');
  const join = (...xs: (string | undefined)[]) => xs.filter((x) => x && x.trim()).map((x) => x!.trim().replace(/[.;,]+$/, '')).join('; ');
  const S = (x?: string) => (x && x.trim() ? `${x.trim()[0].toUpperCase()}${x.trim().slice(1).replace(/[.;,]+$/, '')}.` : '');
  const expected = (v: Record<string, string>, prompt: string, provider?: string) => {
    const pad = v.lightX !== '' && v.lightX != null && v.lightY !== '' && v.lightY != null ? padPhrase(Number(v.lightX), Number(v.lightY)) : RELIGHT_DIRECTIONS.find((o) => o.value === v.direction)?.prompt;
    const light = `${brightnessWord(Number(v.brightness))} ${colourName(v.color)} light`; const quality = RELIGHT_QUALITY.find((o) => o.value === v.lightQuality)?.prompt;
    const fam = relightFamilyOf(provider);
    if (fam === 'qwen') return join(`Relight the scene: ${light}, ${pad}`, quality, prompt, RELIGHT_CHANGE, RELIGHT_KEEP); // unchanged since 2026-10-22
    if (fam === 'sentence') { const parts = ['Relight this photo.', S(`The main light is ${light.replace(/ light$/, '')}, ${pad!.replace(/^light /, 'coming ')}`), S(quality), S(prompt), RELIGHT_SENTENCE_CHANGE].filter(Boolean);
      return (relightKeepFirst(provider) ? [RELIGHT_SENTENCE_KEEP, ...parts] : [...parts, RELIGHT_SENTENCE_KEEP]).join(' '); }
    return join('relight the scene', pad, quality, light, prompt, RELIGHT_LOOK_CHANGE, 'keep the subject, pose and composition unchanged');
  };
  const untouched = { direction: 'front', lightQuality: 'soft', brightness: '50', color: '#FFFFFF', lightX: '', lightY: '' };
  const cases: Record<string, string>[] = [
    { direction: 'left', lightQuality: 'hard', brightness: '80', color: '#FFB347', lightX: '', lightY: '' },
    { direction: 'right', lightQuality: 'soft', brightness: '10', color: '#5FD3C6', lightX: '-0.6', lightY: '0.7' },
    { ...untouched, brightness: '55' },
  ];
  for (const look of [undefined, '', 'custom']) for (const provider of [undefined, ...EDIT_MODELS]) for (const prompt of ['', 'deep orange sky']) {
    for (const base of cases) { const v = look === undefined ? base : { ...base, look }; assert.equal(a.compose!(v, { prompt, has, provider }), expected(base, prompt, provider), `${look}/${provider}`); }
    // untouched: the same prompt as the panel's default light sent as a rig (the panel opens on it)
    const v = look === undefined ? untouched : { ...untouched, look };
    assert.equal(a.compose!(v, { prompt, has, provider }), relightPrompt({ ...v, light: rigJson(DEFAULT_RIG) }, prompt, provider), `untouched ${look}/${provider}`);
  }
  // the exact strings: the hosted default (FLUX 3 Image) asks for a clearly visible change on the first, untouched run
  assert.equal(a.compose!({ ...untouched, look: 'custom' }, { prompt: '', has, provider: 'api-flux3-image' }),
    'relight the scene; key light from the front-left of the frame, high above eye level, Rembrandt-style three-quarter lighting, neutral 5600K daylight, bright; soft diffused light with gentle shadow edges; low ambient fill: rich, dark shadows; the new lighting is clearly visible across the whole image; keep the subject, pose and composition unchanged');
  assert.equal(a.compose!({ ...cases[0], look: 'custom' }, { prompt: '', has, provider: 'api-nano-banana' }),
    `${RELIGHT_SENTENCE_KEEP} Relight this photo. The main light is bright golden, coming from the left side of the frame. Hard direct light, crisp shadows. ${RELIGHT_SENTENCE_CHANGE}`);
  ok('Custom (and no look): per-family wording and keep placement; untouched = the default light on every edit model');
}

// ---- every look × family ----
const LOOKS = RELIGHT_LOOKS.filter((l) => l.value !== 'custom');
assert.ok(LOOKS.length >= 8 && LOOKS.length <= 9, 'about 8 looks');
const lockLight = /keep (the )?(same )?(light|lighting)|lighting (unchanged|the same)|same lighting|original lighting/i;
for (const L of LOOKS) for (const [fam, provider] of Object.entries(FAMILY_PROVIDER)) {
  const v = { ...L.sets, look: L.value, lightX: '', lightY: '' };
  const s = relightPrompt(v, 'a calm mood', provider); const sl = s.toLowerCase(); const In = (x: string) => sl.includes(x.toLowerCase());
  assert.ok(In(L.light), `${L.value}/${fam}: names the setup`);
  // the rich description is in (sentence family rewrites punctuation only at the ends)
  assert.ok(In(L.prompt.split(';')[0]) && In(L.prompt.split(';').at(-1)!.trim()), `${L.value}/${fam}: description`);
  assert.ok(In(L.tone), `${L.value}/${fam}: the look's colour temperature while its colour is kept`);
  assert.ok(In(RELIGHT_DIRECTIONS.find((d) => d.value === L.sets.direction)!.prompt!.replace(/^light /, '')), `${L.value}/${fam}: direction from the controls`);
  assert.ok(In(RELIGHT_QUALITY.find((q) => q.value === L.sets.lightQuality)!.prompt), `${L.value}/${fam}: quality`);
  assert.ok(In(`${brightnessWord(Number(L.sets.brightness))} ${colourName(L.sets.color)}`), `${L.value}/${fam}: brightness + colour`);
  assert.ok(In('a calm mood'), `${L.value}/${fam}: the user's extra text`);
  assert.ok(!lockLight.test(s), `${L.value}/${fam}: never locks the light: ${s}`);
  if (fam === 'qwen') { assert.ok(s.startsWith(`Relight the scene with ${L.light}: `), 'qwen: new light first'); assert.ok(s.endsWith(`${RELIGHT_CHANGE}; ${RELIGHT_KEEP}`), 'qwen: change then identity lock'); assert.ok(!/unchanged|exactly/.test(s), 'qwen: no "unchanged"'); }
  if (fam === 'sentence') { assert.ok(s.startsWith(`Relight this photo with ${L.light}.`), 'sentence: plain instruction first'); assert.ok(s.endsWith(RELIGHT_SENTENCE_KEEP), 'sentence: keep-lock last'); assert.ok(!/; /.test(s.replace(L.prompt, '')), 'sentence: sentences, not a tag list'); }
  if (fam === 'flux') { assert.ok(s.startsWith(`relight the scene with ${L.light}; `), 'flux: today\'s order'); assert.ok(s.endsWith(`${RELIGHT_LOOK_CHANGE}; keep the subject, pose and composition unchanged`), 'flux: visible change, then the lock'); }
  // the look's description never names a colour or a frame side (those come from the controls)
  assert.ok(!/\b(left|right) (side|of the frame)\b/.test(L.prompt), `${L.value}: no frame side in the description`);
  // nor a position: direction comes only from the controls / the light panel, so a moved light never meets "from above" or "behind" (2026-10-31)
  assert.ok(!/\b(above|below|behind|overhead|horizon|eye level|face height|degrees|low near|low down|high up)\b/i.test(`${L.light} ${L.prompt}`), `${L.value}: no position words: ${L.light} / ${L.prompt}`);
}
ok(`${LOOKS.length} looks × 3 families: setup, description, tone, controls, extra text, change + keep lock in the right order, no light lock`);

// ---- adjusting after a look: the controls win, the look's tone drops when the colour changes, the pad still works ----
{
  const g = LOOKS.find((l) => l.value === 'golden-hour')!;
  const s = relightPrompt({ ...g.sets, look: 'golden-hour', color: '#5FD3C6', direction: 'left', lightX: '', lightY: '' }, '', 'comfy-klein4b');
  assert.ok(!s.includes(g.tone) && s.includes('teal light') && s.includes('light from the left side of the frame') && s.includes(g.light), s);
  const p = relightPrompt({ ...g.sets, look: 'golden-hour', lightX: '-0.8', lightY: '0.8' }, '', 'comfy-qwen21');
  assert.ok(p.includes('light from upper left') && p.includes(g.tone), p);
  const lower = relightPrompt({ ...g.sets, look: 'golden-hour', color: g.sets.color.toLowerCase(), lightX: '', lightY: '' }, '', 'api-nano-banana');
  assert.ok(lower.includes(g.tone), 'hex case does not matter');
  ok('after a look: changed colour drops its tone, direction and pad come from the controls');
}

// ---- data: values unique, sets valid for the fields, swatches + credits present; field + recipe wiring ----
{
  const f = (n: string) => a.fields!.find((x) => x.name === n)!;
  assert.equal(f('look').default, 'custom'); assert.equal(f('look').control, 'tiles'); assert.ok(a.exposed!.includes('look'));
  assert.equal(new Set(RELIGHT_LOOKS.map((l) => l.value)).size, RELIGHT_LOOKS.length);
  for (const L of RELIGHT_LOOKS) {
    assert.ok(f('direction').options!.some((o) => o.value === L.sets.direction), `${L.value} direction`);
    assert.ok(f('lightQuality').options!.some((o) => o.value === L.sets.lightQuality), `${L.value} quality`);
    const b = Number(L.sets.brightness); assert.ok(b >= 0 && b <= 100 && b % 5 === 0, `${L.value} brightness on the slider's steps`);
    assert.match(L.sets.color, /^#[0-9A-F]{6}$/, `${L.value} colour`);
    assert.ok(L.swatch && L.credit, `${L.value} swatch + credit`);
  }
  const { imageWorkflowsPayload } = await import('../src/shared/workflows.ts');
  const tool = { id: 'app-relight', inputs: [{ name: 'image', kind: 'file', required: true }, { name: 'prompt', kind: 'text' }, ...a.fields!.map((x) => ({ name: x.name, kind: x.kind === 'number' ? 'number' : 'select' }))], providers: a.providers!, app: { gallery: a } };
  const r = imageWorkflowsPayload((id) => (id === 'app-relight' ? tool : undefined) as any).workflows.find((w) => w.id === 'relight')!;
  const lc = r.controls.find((c) => c.field === 'look')!; assert.equal(lc.default, 'custom'); assert.equal(r.groups[0].summary[0], 'look');
  for (const L of RELIGHT_LOOKS) { const o = lc.options!.find((x) => x.value === L.value)!; assert.deepEqual(o.sets, L.sets); assert.equal(o.swatch, L.swatch); assert.equal(o.credit, L.credit); }
  ok('look data: unique ids, sets fit the controls, swatches and credits; field exposed with Custom default');
}
console.log(`\n${n} passed`);
