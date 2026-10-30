// J3: Object Swap description (API + MCP). Run: npx tsx test/j3-copy.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const { objectSwapTool } = await import('../src/tools/videoSwap.ts');
assert.equal(objectSwapTool.description, 'Replace a product, outfit, person or place in a 4–30 s clip. Camera, motion and cuts stay the same.');
// MCP: the object_swap tool no longer repeats fixed limits (they differ per model); it points to describe object-swap for models, limits and routes
assert.match(fs.readFileSync(path.resolve(import.meta.dirname, '../../mcp/src/server.ts'), 'utf8'), /registerTool\('object_swap', \{ title: 'Object \/ Person Swap', description: 'Replace an object or person in a clip\. Available models, input limits and route status come from describe object-swap/);
console.log('ok object-swap description'); console.log('ALL OK j3-copy');
