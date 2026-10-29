/** Director → ComfyUI plans: aspect → width/height, audio toggle, count → repeated runs with distinct seeds.
 *  Run: npx tsx test/cinema-plans.test.ts [outDir]  (writes graphs to outDir for scripts/validate-workflows.py). */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cinemaTool } from '../src/cinema/tool.js';
import { buildPlan } from '../src/comfy/plans.js';
const out = process.argv[2]; if (out) mkdirSync(out, { recursive: true });
const plan = async (f: Record<string, string>, provider = 'comfy-open', extra: Record<string, any> = {}) => {
  const input: any = await cinemaTool.parseInput({ prompt: 'a man walks #dolly-in 0-2s #orbit 2-5s', seed: '42', provider, ...f }, {});
  assert.ok(!input.error, input.error); return buildPlan({ id: 'tplan', toolId: 'cinema', provider, input: { ...input, ...extra } } as any);
};
const ltx = (p: any) => p.passes.map((x: any) => x.graph['102'].inputs);
let n = 0; const dump = (name: string, p: any) => { if (out) for (const x of p.passes) writeFileSync(`${out}/${name}-${n++}.json`, JSON.stringify(x.graph)); };

let p = await plan({}); dump('ltx-16x9', p);
assert.deepEqual([ltx(p)[0]['resize_type.width'], ltx(p)[0]['resize_type.height']], [1280, 736]);   // 720p 16:9, ×32
assert.ok(p.passes[0].graph['92:97'].inputs.audio); assert.equal((p.post as any).audio, true);
p = await plan({ aspect: '9:16' }); dump('ltx-9x16', p);
assert.deepEqual([ltx(p)[0]['resize_type.width'], ltx(p)[0]['resize_type.height']], [736, 1280]);
p = await plan({ aspect: '1:1', audio: '0' }); dump('ltx-1x1-mute', p);
assert.equal(ltx(p)[0]['resize_type.width'], ltx(p)[0]['resize_type.height']);
assert.equal(p.passes[0].graph['92:97'].inputs.audio, undefined); assert.equal(p.passes[0].graph['92:96'], undefined); assert.equal((p.post as any).audio, false);
p = await plan({ count: '3' }); dump('ltx-count3', p);
assert.deepEqual(p.labels, ['Take 1', 'Take 2', 'Take 3']); assert.equal((p.post as any).groups.length, 3);
const seeds = p.passes.map((x: any) => x.expect.seed); assert.equal(new Set(seeds).size, seeds.length, 'distinct seeds');
p = await plan({ aspect: '21:9', audio: '0' }, 'comfy-funcamera', { refPaths: ['/tmp/oj_ref.png'] }); dump('fun-21x9', p);
const e = p.passes[0].graph['108'].inputs; assert.ok(e.width > e.height * 2 && e.width % 16 === 0 && e.height % 16 === 0, `${e.width}x${e.height}`); assert.equal((p.post as any).audio, false);
console.log(`cinema plans ok (${n} graphs${out ? ` in ${out}` : ''})`);
