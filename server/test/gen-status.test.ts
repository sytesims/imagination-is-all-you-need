// Generate area option A (2026-11-02): ONE reason line above Generate, the same in every studio, and a Generate label that never carries a reason.
// 1 reasonOf(): every can't-run row (nothing connected, ComfyUI down, files missing, node missing, key missing, a refused model, memory short,
//   too big for shared memory, inputs only) gives a short reason and at most two actions, from the pre-flight list's own words
// 2 M1 (Mac/Linux audit): an Apple Silicon 16 GB computer and a 20 GB model = "too big", blocked, Use Comfy Cloud first, Run anyway behind a confirm
// 3 a raw out-of-memory error from ComfyUI becomes a plain failure with the same two ways out
// 4 source: every studio mounts the shared GenStatus (directly or through DockGenerate); the old crammed button variants are gone
// Run: npx tsx test/gen-status.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
import { reasonOf, COMFY_DOWN } from '../../web/src/shared/genReason.ts';
import { preflightProblems } from '../src/shared/preflight.ts';
import { memoryCheck, TOO_BIG_TEXT } from '../src/shared/thisComputer.ts';
import { reasonOf as failReasonOf, ACTION_LABEL } from '../../web/src/shared/failureReasons.ts';
const ok = (m: string) => console.log('ok ' + m); const WEB = path.resolve(import.meta.dirname, '../../web/src');
const read = (f: string) => fs.readFileSync(path.join(WEB, f), 'utf8');
const pf = (quote: any, extra: any = {}) => preflightProblems({ quote, modelName: 'FLUX.2 Klein', ...extra });
const place = (runOn: string, kind: string) => ({ runOn, action: { kind } });
const acts = (r: any) => [r?.primary, r?.alt].filter(Boolean).map((a: any) => `${a.kind}:${a.label}`);

// ---- 1. the rows ----
{ const q = { runnable: false, setup: { action: 'download', runOn: 'local', missingBytes: 12e9, actionText: 'Download 12 GB' } };
  const r = reasonOf({ setupKind: 'none', problems: pf(q), places: [place('local', 'download')] });
  assert.equal(r?.code, 'no_connection'); assert.equal(r!.reason, COMFY_DOWN); assert.ok(r!.blocks); assert.deepEqual(acts(r), ['connect:Set up ComfyUI', 'cloud:Use Comfy Cloud']);
  assert.equal(reasonOf({ setupKind: 'none', problems: [], places: [], noConnection: true })?.code, 'no_connection', 'the quote said no_connection');
  assert.equal(reasonOf({ setupKind: 'none', problems: [], places: [] }), null, 'nothing connected but this run needs nothing (an ffmpeg export): no line');
  const d = reasonOf({ setupKind: 'local', problems: pf(q), places: [place('local', 'download'), place('comfy-cloud', 'add_key')] });
  assert.equal(d?.code, 'needs_download'); assert.match(d!.reason, /isn’t downloaded yet/); assert.match(d!.primary!.label, /^Download \d/); assert.deepEqual(acts(d).slice(1), ['cloud:Use Comfy Cloud']);
  ok('nothing connected → "ComfyUI isn’t open" · Set up ComfyUI · Use Comfy Cloud; files missing → Download N GB · Use Comfy Cloud'); }
{ const node = reasonOf({ setupKind: 'local', problems: pf({ runnable: false, setup: { action: 'install_node', runOn: 'local' } }), places: [place('local', 'install_node')] });
  assert.equal(node?.code, 'needs_node'); assert.deepEqual(acts(node), ['fix:How to install']);
  const key = reasonOf({ setupKind: 'local', problems: pf({ runnable: false, setup: { action: 'add_key', runOn: 'comfy-cloud', runOnLabel: 'Comfy Cloud' } }), places: [place('comfy-cloud', 'add_key')] });
  assert.equal(key?.code, 'needs_key'); assert.match(key!.reason, /Comfy Cloud key/); assert.deepEqual(acts(key), ['fix:Add key'], 'no "Use Comfy Cloud" next to the Comfy key step itself');
  const down = reasonOf({ setupKind: 'cloud', problems: pf({ runnable: false, reasonCode: 'local_only_unreachable', unavailableReason: 'Set up ComfyUI to run YuE free' }), places: [] });
  assert.equal(down?.code, 'needs_comfyui'); assert.deepEqual(acts(down), ['connect:Set up ComfyUI']);
  const more = reasonOf({ setupKind: 'local', problems: pf({ runnable: false, setupOptions: [{ action: 'download', runOn: 'local' }, { action: 'add_key', runOn: 'fal' }], runOn: 'local' }), places: [place('local', 'download'), place('fal', 'add_key')] });
  assert.deepEqual(acts(more).slice(1), ['more:More ways'], 'another place that isn’t Comfy Cloud: every place, in the setup popover');
  ok('node missing → How to install; key missing → Add key; ComfyUI down for a local-only model → Set up ComfyUI; several places → More ways'); }
{ const refused = pf({ valid: false, error: 'This model can’t take a 4K image.' });
  const r = reasonOf({ setupKind: 'both', problems: refused, places: [], canDetails: true });
  assert.equal(r?.code, 'model_cant_run'); assert.ok(r!.blocks); assert.deepEqual(acts(r), ['details:See what to fix']);
  assert.deepEqual(acts(reasonOf({ setupKind: 'both', problems: refused, places: [] })), [], 'no list to open: the reason alone');
  const inputs = pf(null, { prompt: { missing: 'Write a prompt' } }); assert.equal(inputs[0].stage, 'inputs');
  assert.equal(reasonOf({ setupKind: 'both', problems: inputs, places: [] }), null, 'inputs only: no line (Generate’s own click points at the field)');
  assert.equal(reasonOf({ setupKind: 'both', problems: [], places: [] }), null, 'ready: no line');
  assert.equal(reasonOf({ setupKind: 'both', problems: [], places: [], noPlace: true })?.code, 'no_place');
  ok('a refused model → its own words + See what to fix; inputs only and ready → no line'); }
{ const soft = reasonOf({ setupKind: 'both', problems: [], places: [], mem: { text: 'Close other apps first', block: false } });
  assert.equal(soft?.code, 'memory_short'); assert.equal(soft!.blocks, false, 'a graphics card short on memory: said, never blocked');
  for (const r of [soft]) { assert.ok(r!.reason.split(/\s+/).length < 30); assert.ok([r!.primary, r!.alt].filter(Boolean).length <= 2); }
  ok('memory short on a graphics card: a note with Use Comfy Cloud, Generate still runs'); }

// ---- 2. M1: too big for shared memory ----
{ const mac16 = { id: 'apple-silicon', label: 'Apple M2 · 16 GB', usableGB: 12, ramGB: 16, unifiedMemory: true };
  const m = memoryCheck(20, mac16, { ram: { totalBytes: 16 * 2 ** 30, freeBytes: 9 * 2 ** 30 }, vram: null });
  assert.ok(m?.short && m.block, 'shared memory and short: block'); assert.ok(m!.text.startsWith(TOO_BIG_TEXT)); assert.match(m!.text, /about 20 GB and 9 GB is free/); assert.match(m!.text, /freeze/);
  assert.doesNotMatch(m!.text, /slow|still runs/i, 'never "slow" or "still runs" for a model that doesn’t fit shared memory');
  const r = reasonOf({ setupKind: 'local', problems: [], places: [], mem: { text: m!.text, block: m!.block } });
  assert.equal(r?.code, 'too_big'); assert.ok(r!.blocks); assert.deepEqual(acts(r), ['cloud:Use Comfy Cloud', 'anyway:Run anyway…'], 'cloud first; Run anyway only behind its confirm');
  const yes = reasonOf({ setupKind: 'local', problems: [], places: [], mem: { text: m!.text, block: true, accepted: true } });
  assert.equal(yes?.blocks, false, 'after the confirm: Generate runs; the line stays as a note');
  const gs = read('shared/GenStatus.tsx'); assert.match(gs, /askConfirm\(\{[^}]*freeze/s, 'Run anyway asks first and says it can freeze');
  const req = fs.readFileSync(path.resolve(import.meta.dirname, '../src/hardware/requirements.ts'), 'utf8'); assert.match(req, /TOO_BIG_TEXT\}: it needs about/, 'the route fit says it plainly on shared memory');
  assert.doesNotMatch(fs.readFileSync(path.resolve(import.meta.dirname, '../src/shared/thisComputer.ts'), 'utf8'), /still runs, more slowly/);
  ok('M1: a 16 GB Mac and a 20 GB model → "Too big for this computer’s memory", blocked, Use Comfy Cloud · Run anyway… (confirm)'); }

// ---- 3. out of memory, after the run ----
for (const error of ['ComfyUI execution error: MPS backend out of memory (MPS allocated: 17.1 GB, other allocations: 1.2 GB)', 'ComfyUI execution error: torch.OutOfMemoryError: CUDA out of memory. Tried to allocate 2.00 GiB']) {
  const f = failReasonOf({ status: 'failed', error, route: 'local:flux2-klein' });
  assert.equal(f.key, 'out_of_memory', error); assert.deepEqual(f.actions, ['useCloud', 'retry']); assert.match(f.line, /Too big for this computer’s memory/); assert.doesNotMatch(f.title + f.line, /MPS|CUDA|torch/);
}
assert.equal(ACTION_LABEL.useCloud, 'Use Comfy Cloud');
assert.match(read('shared/FailureState.tsx'), /case 'useCloud': return go\(recreate\)/, 'Use Comfy Cloud opens the tool (its reason line offers the cloud); never a paid run from the failure card');
ok('a raw out-of-memory error → "Ran out of memory" · Use Comfy Cloud · Try again');

// ---- 4. every studio uses the one shared line; the label never carries a reason ----
const direct = ['ui/next/ImageCanvas.tsx', 'ui/video/VideoStudio.tsx', 'ui/three/ThreeDStudio.tsx', 'ui/audio/AudioStudio.tsx', 'shared/GenerateBar.tsx', 'shared/DockGenerate.tsx'];
for (const f of direct) { const s = read(f); assert.match(s, /<GenStatus r=\{/, `${f} mounts the shared GenStatus`); assert.match(s, /useGenReason\(/, `${f} reads the shared reason`); }
for (const f of ['ui/audio/AudioPage.tsx', 'ui/video/VideoWorkflowBar.tsx', 'ui/film/FilmInspector.tsx', 'ui/video/StitchPanel.tsx', 'canvas/GenCardShape.tsx', 'canvas/CardPanel.tsx'])
  assert.ok(read(f).includes('<DockGenerate '), `${f} uses DockGenerate (which mounts GenStatus)`);
const files = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(d, e.name)) : /\.(tsx?|css)$/.test(e.name) ? [path.join(d, e.name)] : []);
const all = files(WEB).map(f => [path.relative(WEB, f), fs.readFileSync(f, 'utf8')] as const);
for (const [f, s] of all) {
  assert.ok(!/\b(SetupGenerate|NoPlaceGenerate|ConnectGenerate|SETUP_FIRST|CONNECT_HINT|CONNECT_LABEL|PF_SHORT)\b/.test(s), `${f}: the old crammed Generate variants are gone`);
  assert.ok(!/gen-setup-why|gen-setup-sub/.test(s), `${f}: no setup sentence styles left on Generate`);
}
const dg = read('shared/DockGenerate.tsx'); const btn = dg.slice(dg.indexOf('const btn = <button'), dg.indexOf('</button>;'));
assert.doesNotMatch(btn, /gen-missing|\{lead\}|mem\.text/, 'DockGenerate: the second line is the price token only');
for (const [f, s] of all.filter(([f]) => f.endsWith('.tsx'))) for (const m of s.matchAll(/<span className="gen-l">([^<{]*)</g))
  assert.ok(m[1].trim().split(/\s+/).filter(Boolean).length <= 3, `${f}: Generate's label is a few words, not a reason ("${m[1].trim()}")`);
assert.match(read('ui-states.css'), /\.gen-status \.gs-why\{[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/, 'desktop: one line, never spills');
assert.match(read('ui-states.css'), /@media \(max-width:700px\)\{\s*\.gen-status \.gs-why\{white-space:normal\}/, 'phone: the reason wraps');
ok('every studio mounts the one GenStatus; no crammed button variant, no reason in a Generate label');
