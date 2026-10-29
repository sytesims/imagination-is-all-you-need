// Layout contract only; browser geometry and interactions are checked separately in the review sandbox.
// Run: npx tsx test/film-viewport.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = (name: string) => readFileSync(new URL(`../../web/src/ui/film/${name}`, import.meta.url), 'utf8');
const editor = source('FilmEditor.tsx');
const inspector = source('FilmInspector.tsx');
const css = source('film.css');

assert.match(editor, /ResizeObserver\(measure\)/, 'shell height follows announcement/offline/header changes');
assert.match(editor, /getBoundingClientRect\(\)\.top \+ window\.scrollY/);
assert.match(editor, /ro\.disconnect\(\)/, 'observer is cleaned up on route change');
const center = editor.indexOf('className="fm-center"');
assert.ok(center < editor.indexOf('<Preview shot=', center));
assert.ok(editor.indexOf('<Preview shot=', center) < editor.indexOf('<ShotRow defModel=', center), 'viewer precedes timeline');
assert.match(editor, /<details className="fm-sound-panel" name="film-workspace-settings">/);
assert.match(editor, /<details className="fm-finish-panel" name="film-workspace-settings">/);
assert.match(editor, /onRough=\{setRough\}/, 'rough cut does not scroll the whole document');
assert.match(inspector, /className="fm-insp-scroll" tabIndex=\{0\} role="region"/);
assert.ok(inspector.indexOf('className="fm-insp-h"') < inspector.indexOf('className="fm-insp-scroll"'));
assert.match(inspector, /<\/div><div className="fm-gen">/, 'Generate sits outside the controls scroller');
assert.match(css, /height:calc\(100dvh - var\(--fm-top,92px\)\)/);
assert.match(css, /\.fm-insp-scroll\{[^}]*min-height:0;overflow-y:auto/);
assert.match(css, /@media \(max-width:760px\)/, 'phone uses a normal stacked document, not a clipped desktop grid');
assert.match(css, /\.fm-editor \.fm-insp\{grid-row:3\}/, 'mobile settings come before optional sound/finishing');
assert.match(css, /\.fm-insp-scroll \.fm-grid2\{grid-template-columns:minmax\(0,1fr\)/, 'model and route get full-width labels');
assert.match(css, /\.fm-bottom \.fm-sound-body,\.fm-bottom \.fm-stitch-f\{position:absolute/, 'optional settings do not push the viewer out of the workspace');
assert.match(editor, /className="fm-card-top"><b>\{label\}<\/b>/, 'timeline label and status belong with the text, not over the thumbnail');
assert.match(css, /\.fm-model b\{white-space:normal/, 'long model names can wrap instead of being silently cut');
assert.match(css, /\.fm-gen \.gen-price::before\{content:none/, 'two-line Generate has no orphan inline price separator');
console.log('ok film viewport layout contract (not a browser geometry test)');
