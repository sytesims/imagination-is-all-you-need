/** Full prompt on every hosted place (2026-11-01): fal, BFL and Replicate image routes send the app's composed prompt (input.finalPrompt: the
 *  Camera & Lens sentence, the style, Enhance words, Brush Edit's instruction), the same text the Comfy Router route sends, never just the typed words.
 *  Bodies are built by the runner's own entry point (routing/routeRequest.ts). Run: npx tsx test/full-prompt-routes.test.ts (mock, no keys, no network). */
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'fullprompt-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const { listTools } = await import('../src/tools/registry.js');
const { toolModels, modelRoutes } = await import('../src/routing/modelRegistry.js');
const { routeRequest } = await import('../src/routing/routeRequest.js');
const { refInputFor } = await import('../src/routing/jobRefs.js');
const { greyPng } = await import('../src/routesPromptPeek.js');
const { STYLE_PRESETS } = await import('../src/tools/mediaPresets.js');

const put = (name: string, data: Buffer) => { fs.writeFileSync(path.join(D, name), data); return name; };
const PNG = put('photo.png', greyPng(1024, 1024)); const MASK = put('mask.png', greyPng(1024, 1024));
const TYPED = 'a red bicycle leaning on a sea wall';
const tools = listTools() as any[];
const createImage = tools.find((t) => t.id === 'create-image'); const brush = tools.find((t) => t.app?.id === 'inpaint' || t.id === 'app-inpaint');
assert.ok(createImage && brush, 'Create Image and Brush Edit tools exist');
const routesOf = (t: any) => new Map(toolModels(t).flatMap((m: any) => modelRoutes(t, m)).map((x: any) => [x.route.routeId, x]));

/** Every string value in a body (fal: body.prompt; BFL: the HttpRequest's body.prompt; Router: nested). */
const strings = (v: unknown, out: string[] = []): string[] => { if (typeof v === 'string') out.push(v); else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out); return out; };
const style = STYLE_PRESETS.find((s: any) => s.prompt)!;
const JOBS: { name: string; tool: any; fields: Record<string, string>; files: Record<string, string[]>; routes: string[]; extra: (i: any) => string }[] = [
  { name: 'Camera & Lens edit', tool: createImage, fields: { types: '["edit"]', cameraBody: 'digital-s35', focal: '85', aperture: '1.4' }, files: { image: [PNG] }, extra: (i) => i.camera.sentence,
    routes: ['fal:bytedance/seedream/v5/pro/edit', 'fal:fal-ai/nano-banana-pro/edit', 'direct:bfl/flux-2-flex#edit', 'direct:bfl/flux-2-klein-9b#edit', 'direct:bfl/flux-3-image-klein', 'direct:bfl/flux-3-image'] },
  { name: 'Camera & Lens generate', tool: createImage, fields: { types: '["generate"]', cameraBody: 'digital-s35', focal: '85', aperture: '1.4' }, files: {}, extra: (i) => i.camera.sentence,
    routes: ['direct:bfl/flux-3-image-klein', 'direct:bfl/flux-2-klein-4b', 'fal:blackforestlabs/flux-3/klein/text-to-image', 'replicate:google/nano-banana-pro'] },
  { name: 'Create Image edit, style + Enhance', tool: createImage, fields: { types: '["edit"]', style: style.id, enhance: '1' }, files: { image: [PNG] }, extra: () => style.prompt,
    routes: ['fal:bytedance/seedream/v5/pro/edit', 'fal:luma/agent/uni-1/v1/edit', 'direct:bfl/flux-2-flex#edit', 'direct:bfl/flux-2-klein-9b#edit', 'direct:bfl/flux-3-image'] },
  { name: 'Brush Edit', tool: brush, fields: {}, files: { image: [PNG], mask: [MASK] }, extra: () => '',
    routes: ['fal:ideogram/v4.5/edit', 'fal:fal-ai/bria/genfill'] },
];

let checked = 0; const fails: string[] = [];
for (const j of JOBS) {
  const all = routesOf(j.tool);
  for (const routeId of j.routes) {
    const hit: any = all.get(routeId); if (!hit) { fails.push(`${j.name}: route ${routeId} not offered on ${j.tool.id}`); continue; }
    const input: any = await j.tool.parseInput({ prompt: TYPED, provider: hit.engine, ...j.fields }, j.files);
    if (!input || typeof input.error === 'string') { fails.push(`${j.name} × ${routeId}: parse failed: ${input?.error}`); continue; }
    const job = { id: 'fp', toolId: j.tool.id, provider: hit.engine, status: 'queued', input, route: routeId } as any;
    const full = String(refInputFor(job, hit.route).finalPrompt ?? ''); // the composed prompt in this model's reference grammar
    assert.notEqual(full.trim(), TYPED, `${j.name}: the composed prompt adds words to the typed ones`); if (j.extra(input)) assert.ok(full.includes(j.extra(input).slice(0, 30)), `${j.name}: composed prompt has its extra`);
    // the Router control: the same model's Router place sends the full prompt
    const router = [...all.values()].find((x: any) => x.engine === hit.engine && x.route.kind === 'comfy-router' && (!x.route.modes || x.route.modes.includes(input.mode)) && !x.route.unavailableFor?.(input)) as any;
    if (router) { process.env.COMFY_API_KEY = 'test-not-a-real-key'; try { const rb = (await routeRequest({ ...job, route: router.route.routeId }, router.route)).body; const rf = String(refInputFor(job, router.route).finalPrompt);
      assert.ok(strings(rb).some((s) => s.includes(rf)), `${j.name}: Router control ${router.route.routeId} sends the full prompt`); } finally { delete process.env.COMFY_API_KEY; } }
    const { body } = await routeRequest(job, hit.route);
    const sent = strings(body).filter((s) => s.toLowerCase().includes(TYPED.slice(0, 20)));
    if (!sent.some((s) => s.includes(full))) fails.push(`${j.name} × ${routeId}: sent ${JSON.stringify(sent[0]?.slice(0, 160))}\n    want ${JSON.stringify(full.slice(0, 160))}`);
    checked++;
  }
}
if (fails.length) { console.error(`${fails.length} of ${checked} bodies miss the full prompt:\n  ${fails.join('\n  ')}`); process.exit(1); }
console.log(`ok: ${checked} fal / BFL / Replicate bodies send the full composed prompt (Router control matched)`);
fs.rmSync(D, { recursive: true, force: true });
