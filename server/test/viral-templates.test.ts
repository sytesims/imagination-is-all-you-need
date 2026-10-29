// Viral templates (server/src/shared/viralTemplates.ts, 2026-10-26): four prompt recipes for the Video tab.
// Covers: unique ids; every {slot} in a prompt has a field and every field is used; 1–3 slots; the filled prompt has no braces left and
// keeps the slot values; empty values fall back to the default; the first slot's range points at its text; replaceSlot swaps a value and
// says when the user rewrote it; the plan keeps the user's model unless it is silent (then suggests LTX-2.5 22B local), and a card opens
// on LTX; the model is real, local, makes sound and allows the settings; Explore's Viral templates row and the Video bar wire them in.
// Run: npx tsx test/viral-templates.test.ts   (in-process, no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const ok = (m: string) => console.log('ok ' + m);
const ROOT = path.resolve(import.meta.dirname, '../..');
const { VIRAL_TEMPLATES, VIRAL_ENGINE, VIRAL_MODEL_KEY, viralTemplate, fillTemplate, slotOrder, firstSlotRange, replaceSlot, templatePlan } = await import('../src/shared/viralTemplates.ts');
const { MODELS, ENGINE_MODEL } = await import('../src/shared/modelIds.ts');
const { EXPLORE_CARDS } = await import('../src/shared/exploreFlows.ts');

assert.equal(VIRAL_TEMPLATES.length, 4); assert.equal(new Set(VIRAL_TEMPLATES.map((t) => t.id)).size, 4, 'unique ids');
for (const t of VIRAL_TEMPLATES) {
  const keys = slotOrder(t); assert.ok(keys.length >= 1 && keys.length <= 3, `${t.id}: 1–3 slots`);
  assert.deepEqual([...keys].sort(), t.slots.map((s) => s.key).sort(), `${t.id}: every slot used, every {key} has a field`);
  const f = fillTemplate(t); assert.doesNotMatch(f, /[{}]/, `${t.id}: no braces left`); for (const s of t.slots) assert.ok(f.includes(s.value), `${t.id}: ${s.key} filled`);
  assert.ok(t.name && t.line && t.tip && t.tip.length < 140, `${t.id}: name, line, short tip`);
  assert.ok(['16:9', '9:16'].includes(t.settings.aspect) && t.settings.seconds >= 3 && t.settings.seconds <= 5 && t.settings.sound, `${t.id}: 16:9 or 9:16, 3–5 s, sound`);
  assert.match(f, /sound|"/i, `${t.id}: the prompt asks for sound or dialogue`);
  const r = firstSlotRange(t)!; assert.equal(f.slice(r[0], r[1]), t.slots.find((s) => s.key === keys[0])!.value, `${t.id}: first slot range`);
  const v = { [keys[0]]: 'zzz' }; const r2 = firstSlotRange(t, v)!; assert.equal(fillTemplate(t, v).slice(r2[0], r2[1]), 'zzz');
  assert.equal(fillTemplate(t, { [keys[0]]: '  ' }), f, `${t.id}: an empty value keeps the default`);
}
assert.ok(/Shot 1[\s\S]*Cut to shot 2/.test(viralTemplate('fruit-drama')!.prompt) && /"[^"]+"/.test(viralTemplate('fruit-drama')!.prompt), 'fruit drama: cuts and quoted dialogue');
assert.match(viralTemplate('glass-asmr')!.prompt, /Static camera/); assert.match(viralTemplate('miniature-world')!.prompt, /Macro photography/); assert.doesNotMatch(viralTemplate('miniature-world')!.prompt, /tilt-shift/i);
assert.doesNotMatch(viralTemplate('cctv-found-footage')!.prompt, /timestamp/i, 'CCTV: the overlay is not asked of the model');
assert.equal(viralTemplate('nope'), undefined);
ok('4 templates: slots, fill, ranges, settings, recipe rules');

assert.deepEqual(replaceSlot('a lemon and a lemon', 'lemon', 'lime'), { prompt: 'a lime and a lime', ok: true });
assert.deepEqual(replaceSlot('a pear', 'lemon', 'lime'), { prompt: 'a pear', ok: false }); assert.equal(replaceSlot('x', '', 'y').ok, false);
ok('replaceSlot swaps, and leaves a rewritten prompt alone');

const t = VIRAL_TEMPLATES[0]; const engines = ['comfy-wan22-5b', VIRAL_ENGINE];
assert.deepEqual(templatePlan(t, { soundOk: true, engines }), { switchTo: null, suggestEngine: null }, 'a sound model stays');
assert.deepEqual(templatePlan(t, { soundOk: false, engines }), { switchTo: null, suggestEngine: VIRAL_ENGINE }, 'a silent model: suggest LTX');
assert.deepEqual(templatePlan(t, { soundOk: false, engines: ['comfy-wan22-5b'] }), { switchTo: null, suggestEngine: null }, 'no LTX offered: nothing to suggest');
assert.deepEqual(templatePlan(t, { soundOk: true, fresh: true, engines }), { switchTo: VIRAL_ENGINE, suggestEngine: null }, 'a card opens on LTX');
ok('plan: keeps the user’s model, suggests LTX only for silent ones');

const m = MODELS[VIRAL_MODEL_KEY]; assert.ok(m && m.medium === 'video', 'LTX-2.5 22B is a real video model'); assert.equal(ENGINE_MODEL[VIRAL_ENGINE], VIRAL_MODEL_KEY, 'engine maps to it');
const capsSrc = fs.readFileSync(path.join(ROOT, 'server/src/tools/h3/videoCaps.ts'), 'utf8'); const line = capsSrc.split('\n').filter((l) => l.includes(`'${VIRAL_ENGINE}'`)).join(' ') + capsSrc.slice(capsSrc.indexOf(`'${VIRAL_ENGINE}': h3(`)).split('\n').slice(0, 3).join(' ');
assert.match(line, /durations: \[2, 3, 4, 5\]/); assert.match(line, /'16:9', '9:16'/); assert.match(line, /audio: \{ supported: true/);
ok('LTX-2.5 22B local: real, makes sound, allows 16:9 / 9:16 and 3–5 s');

for (const x of VIRAL_TEMPLATES) { const e = EXPLORE_CARDS.find((s) => s.id === `vt-${x.id}`)!; assert.ok(e, `${x.id}: an Explore card`); assert.equal(e.toolId, 'h3-video'); assert.equal(e.modelKey, VIRAL_MODEL_KEY);
  const u = new URL(e.href, 'http://x'); assert.equal(u.searchParams.get('template'), x.id); assert.equal(u.searchParams.get('model'), VIRAL_MODEL_KEY); assert.equal(u.searchParams.get('prompt'), fillTemplate(x)); }
const studio = fs.readFileSync(path.join(ROOT, 'web/src/ui/video/VideoStudio.tsx'), 'utf8');
assert.match(studio, /useViralTemplates\(/); assert.match(studio, /viral\.lookTab/); assert.match(studio, /\{viral\.strip\}/);
ok('Explore cards (?template=) and the Video bar (Look → Viral, fill-in row) are wired');
