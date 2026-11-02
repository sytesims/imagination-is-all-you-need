// CSS chunks survive SPA navigation: Audio must never change the Canvas agent's flex/scroll layout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p: string) => fs.readFileSync(new URL(`../../web/src/${p}`, import.meta.url), 'utf8');
const audio = read('ui/audio/audioPage.css');
assert.doesNotMatch(audio, /html body \.ap\s*\{/, 'Audio root styles must be scoped to audio-page, not Canvas .ap');
assert.match(audio, /\.ap\[data-testid="audio-page"\]\{display:block;padding:0 16px/);
const panel = read('canvas/AgentPanel.tsx');
assert.match(panel, /role="log" tabIndex=\{0\}/, 'Transcript is keyboard focusable');
assert.match(panel, /observer\.observe\(transcript\)/, 'Typing and media growth follow only when near bottom');
assert.match(panel, /if \(stick\.current && !helloOnly\.current\) el\.scrollTop = el\.scrollHeight/, 'growth follows the newest line, but the empty board’s hello reads from the top (its intro was cut off)');
assert.match(panel, /const empty = shown\.length === 0; helloOnly\.current = empty;/);
assert.doesNotMatch(panel, /scrollIntoView/, 'A confirmation card must not pull a reader away from older messages');
assert.match(read('canvas/agentPanel.css'), /\.ap-body\{flex:1;min-height:0;display:flex;flex-direction:column\}/);
console.log('ok Canvas agent scroll: scoped Audio CSS, focusable transcript, growth following, no forced confirmation jump');
