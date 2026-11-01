// Capabilities (2026-10-26): GET /api/capabilities, the list the MCP server's search_capabilities / describe read (src/capabilities.ts).
//  - every Video workflow, flow shortcut, viral template and Explore card is listed (generated from their registries, nothing hand-copied);
//  - every item's run targets a real tool, uses only that tool's fields (plus loop), and its model is one the tool offers;
//  - the known gaps are covered with the right run (Loop on LTX-2.5 with loop=1, Morph = transition morph, Exploded view preset, lip sync mode,
//    Footage Effects, Extend, templates with the filled prompt);
//  - every KEYWORDS key still names a capability, a tool or a tool mode.
// Run: npx tsx test/capabilities.test.ts   (no server, no network)
import assert from 'node:assert/strict';
const ok = (m: string) => console.log('ok ' + m);
await (await import('../src/plugins.ts')).loadPlugins(); // plugin tools (Cutout…) as the server has them
const { capabilities, capabilitiesPayload, staleKeywordKeys, KEYWORDS } = await import('../src/capabilities.ts');
const { VIDEO_WORKFLOWS, VIDEO_FLOW_SHORTCUTS } = await import('../src/shared/videoWorkflows.ts');
const { VIRAL_TEMPLATES } = await import('../src/shared/viralTemplates.ts');
const { EXPLORE_CARDS } = await import('../src/shared/exploreFlows.ts');
const { getTool } = await import('../src/tools/registry.ts');

const items = capabilities(); const byId = new Map(items.map((c) => [c.id, c]));
assert.equal(byId.size, items.length, 'unique ids');
assert.deepEqual(items.filter(c => c.name === 'Image to 3D').map(c => c.id), ['3d/image-to-3d'], 'one canonical image-to-3d capability');
for (const mode of ['image-to-3d', 'text-to-3d', 'multiview-to-3d']) {
  const c = byId.get(`3d/${mode}`); assert.ok(c, `${mode} is discoverable through MCP capabilities`);
  assert.equal(c.area, '3d'); assert.equal(c.run?.tool_id, 'three-d'); assert.deepEqual(c.run?.fields.types, [mode]);
  assert.equal(c.page, `/3d?workflow=${mode}`); if (mode !== 'image-to-3d') assert.equal(c.run?.model, 'cloud-tripo-31');
}

for (const w of VIDEO_WORKFLOWS) assert.ok(byId.has(`video/${w.id}`), `workflow ${w.id} listed`);
for (const s of VIDEO_FLOW_SHORTCUTS) assert.ok(byId.has(`video/${s.id}`), `shortcut ${s.id} listed`);
for (const t of VIRAL_TEMPLATES) assert.ok(byId.has(`template/${t.id}`), `template ${t.id} listed`);
for (const c of EXPLORE_CARDS) if (!c.id.startsWith('vt-')) assert.ok(byId.has(`video/${c.id}`) || byId.has(`3d/${c.id}`) || byId.has(`explore/${c.id}`), `explore card ${c.id} listed`);
ok(`${items.length} capabilities: every video workflow, shortcut, template and Explore card`);

for (const c of items) {
  if (!c.run) { assert.ok(!c.toolId || c.note, `${c.id}: a tool item has run`); continue; }
  const t: any = getTool(c.run.tool_id); assert.ok(t, `${c.id}: ${c.run.tool_id} is a tool`);
  const names = new Set(t.inputs.map((i: any) => i.name)); names.add('loop');
  for (const k of Object.keys(c.run.fields)) assert.ok(names.has(k), `${c.id}: field ${k} is an input of ${t.id}`);
  for (const [k, v] of Object.entries(c.run.fields)) { const inp = t.inputs.find((i: any) => i.name === k); if (inp?.options && inp.kind !== 'text') for (const x of [v].flat()) assert.ok(inp.options.map(String).includes(String(x)), `${c.id}: ${k}=${x} is allowed`); }
  if (c.run.model) { const keys = (t.providers ?? []).map((p: any) => (typeof p === 'string' ? p : p.id)); assert.ok(keys.length > 0, `${c.id}: tool has models`); }
  assert.ok(c.keywords.length > 0 && c.name && c.page, `${c.id}: name, words, page`);
}
ok('every run targets a real tool with its own fields and allowed values');

const run = (id: string) => byId.get(id)!.run!;
assert.deepEqual(run('video/loop'), { tool_id: 'h3-video', model: 'ltx-2.5-22b', fields: { loop: 1 } });
assert.equal(run('video/morph').tool_id, 'app-transition'); assert.equal(run('video/morph').fields.transition, 'morph'); assert.equal(run('video/morph').model, 'ltx-2.5-22b');
assert.deepEqual(run('video/exploded-view').fields, { types: ['exploded-view'] });
assert.deepEqual(run('video/lip-sync'), { tool_id: 'voice', fields: { types: ['lipsync'] } });
assert.equal(run('video/footage-fx').tool_id, 'footage-fx'); assert.equal(run('video/extend').tool_id, 'h3-extend'); assert.equal(run('video/new-angle').model, 'minimax-h3-crossview');
const fd = run('template/fruit-drama'); assert.equal(fd.model, 'ltx-2.5-22b'); assert.match(String(fd.fields.prompt), /lemon/); assert.equal(fd.fields.aspect, '9:16'); assert.equal(fd.fields.audio, '1'); assert.deepEqual(fd.fields.types, ['t2v'], 'a template run names its mode (h3-video needs one)');
assert.equal(byId.get('explore/canvas')!.run, null); assert.match(byId.get('explore/canvas')!.note!, /canvas/);
assert.ok(byId.get('video/footage-fx')!.keywords.includes('vanish')); assert.ok(byId.get('video/lip-sync')!.keywords.includes('talking photo'));
ok('Loop, Morph, Exploded view, lip sync, Footage Effects, Extend, New angle, templates and the canvas run as their pages do');

assert.deepEqual(staleKeywordKeys(), [], 'every KEYWORDS key names a capability, tool or tool mode');
const p = capabilitiesPayload(); assert.ok(p.keywords['footage-fx/vanish']?.includes('remove people')); assert.ok(p.keywords['voice/voiceover']?.includes('text to speech'));
assert.ok(!('video/loop' in p.keywords), 'capability words ride on the item, not in the tool map'); assert.ok(Object.keys(KEYWORDS).length > 20);
ok('KEYWORDS: no stale keys; tool and mode words served');
process.exit(0);
