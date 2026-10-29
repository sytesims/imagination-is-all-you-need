// J3: Object Swap description (API + MCP). Run: npx tsx test/j3-copy.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const { objectSwapTool } = await import('../src/tools/videoSwap.ts');
assert.equal(objectSwapTool.description, 'Replace a product, outfit, person or place in a 4–30 s clip. Camera, motion and cuts stay the same.');
assert.match(fs.readFileSync(path.resolve(import.meta.dirname, '../../mcp/src/server.ts'), 'utf8'), /Replace a product, outfit, person or place in a 4–30 s clip/);
console.log('ok object-swap description'); console.log('ALL OK j3-copy');
