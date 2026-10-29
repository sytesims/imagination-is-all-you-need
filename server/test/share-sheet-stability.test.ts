// Layout contract; actual geometry/handoffs are checked separately in Chromium.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../web/src/shared/ShareSheet.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../web/src/shared/sharecard.css', import.meta.url), 'utf8');
const controlsStart = source.indexOf('<fieldset className="ss2-controls"');
const controlsEnd = source.indexOf('</fieldset>', controlsStart);
const footer = source.indexOf('<div className="ss2-go"');
assert.ok(controlsStart > source.indexOf('className="ss2-head"'));
assert.ok(controlsEnd > controlsStart && footer > controlsEnd, 'header and primary action stay outside scrolling settings');
assert.match(source, /className="ss2-controls"[^>]*disabled=\{!!making\}/, 'hold the export choices while preparing');
assert.match(source, /className="ss2-cap"[^>]*rows=\{4\}/, 'caption edits do not resize settings');
assert.ok(source.indexOf('className="ss2-feedback"') > source.indexOf('className="ss2-acts"'), 'feedback cannot push the action');
assert.ok(source.indexOf('data-testid="ss-sys-share"') > source.indexOf('className="ss2-feedback"'), 'async system-share availability cannot shrink the primary action');
assert.match(source, /className="ss2-go" data-toast-avoid/, 'reuse the toast avoidance contract for the pinned actions');
assert.match(source, /branded = mode === 'branded' && canBrand && !!brandInfo/, 'missing brand metadata must not masquerade as branded');
assert.match(source, /disabled: !canBrand \|\| !brandInfo/);
assert.match(source, /className="ss2-toggle" disabled=\{disabled\}/, 'unavailable brand switches are genuinely disabled');
assert.match(source, /else setRetry\(n => n \+ 1\)/, 'image retry actually restarts preparation');
assert.match(source, /'Open X composer'/, 'the action does not imply automatic posting');
assert.match(css, /height:min\(760px,calc\(100dvh - 48px\)\)/);
assert.match(css, /grid-template-rows:72px minmax\(0,1fr\) 164px/);
assert.match(css, /\.ss2-controls\{[^}]*overflow:auto[^}]*overflow-anchor:none/);
assert.match(css, /\.ss2-feedback\{[^}]*overflow:auto/);
assert.match(css, /\.ss2-cap\{[^}]*resize:none[^}]*height:100px/);
assert.match(css, /\.ss2-right\{display:contents\}\.ss2-head\{grid-row:1\}/, 'phone title precedes the preview');
console.log('ok share-sheet-stability: bounded regions, fixed caption, honest handoff and unavailable/retry states');
