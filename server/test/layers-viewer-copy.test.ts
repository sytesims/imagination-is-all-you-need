// Video to layers: the viewer's plain copy (layers/manifest.ts bgLine). The clean background's line in the layer list stays short: the model's
// name without its brackets, and "first N s" only when the background stops before the clip does.
// Run: npx tsx test/layers-viewer-copy.test.ts
import assert from 'node:assert/strict';
const { bgLine } = await import('../src/layers/manifest.ts');
const bg = (model: string | null, seconds: number) => ({ url: '/files/x.mp4', model, seconds, note: null });
assert.equal(bgLine({ seconds: 5, background: bg('VOID (official Comfy template, both passes)', 5) }), 'VOID');
assert.equal(bgLine({ seconds: 5, background: bg('LTX-2.5 Clean Plate', 4.7) }), 'LTX-2.5 Clean Plate');
assert.equal(bgLine({ seconds: 10, background: bg('LTX-2.5 Clean Plate', 4.7) }), 'LTX-2.5 Clean Plate · first 4.7 s');
assert.equal(bgLine({ seconds: 5, background: bg(null, 5) }), 'Clean background');
console.log('ok clean background line: short model name, coverage only when it stops early');
