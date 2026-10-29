// SoundToggle (2026-10-27): the shared sound button's states (off / on / waiting), its words for screen readers, tooltip and label.
// Pure: no server, no network. Run: npx tsx test/showcase-sound-toggle.test.ts
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soundToggleText } from '../../web/src/shared/soundToggleState.ts';
const ok = (m: string) => console.log('ok ' + m);

assert.deepEqual(soundToggleText(false), { state: 'off', pressed: false, aria: 'Sound off', tip: 'Sound off: click for sound', label: 'Sound off' });
assert.deepEqual(soundToggleText(true), { state: 'on', pressed: true, aria: 'Sound on', tip: 'Sound on: click to mute', label: 'Sound on' });
ok('off: dark, not pressed, "Sound off"; on: orange, pressed, "Sound on"');
/* the viewer wants sound but the browser refused it before a gesture: it plays muted, so the button must not claim sound is on */
for (const on of [true, false]) { const t = soundToggleText(on, true);
  assert.equal(t.state, 'waiting'); assert.equal(t.pressed, false, 'waiting is not "on"'); assert.equal(t.aria, 'Sound off');
  assert.equal(t.tip, 'Sound starts with your first click or key'); assert.equal(t.label, 'Click for sound'); }
ok('waiting (browser refused sound): shown as muted, with a hint');

/* Clickable (bug 2026-10-27): `.snd` is pointer-events:none so the media under it stays draggable, and its children opt back in. The button's
   `all:unset` resets pointer-events to `inherit` (= none), so the button rule itself must set pointer-events:auto AFTER all:unset, and no
   stylesheet may switch the button (or the wrapper's children) back to none. */
const webSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/src');
const cssFiles = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? cssFiles(path.join(d, e.name)) : e.name.endsWith('.css') ? [path.join(d, e.name)] : []);
const rules = (css: string) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2].replace(/\s+/g, '') }));
const own = rules(readFileSync(path.join(webSrc, 'shared/soundToggle.css'), 'utf8'));
const base = own.find((r) => r.sel === '.snd-toggle'); assert.ok(base, '.snd-toggle rule exists');
const unset = base.body.indexOf('all:unset'), pe = base.body.lastIndexOf('pointer-events:auto');
assert.ok(pe > -1 && (unset === -1 || pe > unset), '.snd-toggle sets pointer-events:auto after all:unset (else it inherits none from .snd)');
assert.ok(own.some((r) => r.sel === '.snd' && r.body.includes('pointer-events:none')), 'wrapper lets drags through');
assert.ok(own.some((r) => r.sel === '.snd>*' && r.body.includes('pointer-events:auto')), 'wrapper children opt back in');
for (const f of cssFiles(webSrc)) for (const r of rules(readFileSync(f, 'utf8')))
  if (/\.snd-toggle|\.snd\s*>\s*\*|\.snd\s+button/.test(r.sel)) assert.ok(!/pointer-events:none/.test(r.body), `${path.relative(webSrc, f)}: "${r.sel}" must not make the sound button unclickable`);
ok('the sound button takes clicks: pointer-events:auto after all:unset, never switched to none');
console.log('showcase-sound-toggle: all checks passed');
