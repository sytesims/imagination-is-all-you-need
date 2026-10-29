/**
 * MCP resources: the studio catalogue and price tables, read live from the app (same source as search_capabilities / describe).
 *   imagination://catalog/tools            every tool (id, name, media, what it does, models)
 *   imagination://catalog/tools/{id}       one tool: job field JSON Schema + model cards (limits, run_on places, prices)
 *   imagination://catalog/models           every model across tools (real name, maker, open weights, licence, tools, local, cheapest)
 *   imagination://catalog/workflows        image / audio / 3D workflows and video presets, with the tool that runs each
 *   imagination://prices/{id}              a tool's price table: model × run_on → status, credits, USD (1 credit = $0.01)
 *   imagination://run-on                   the places a job can run
 */
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadTools, loadWorkflows, fieldSchema, modelCard, runOnPlaces } from './catalog.js';

const json = (uri: URL | string, o: unknown) => ({ contents: [{ uri: String(uri), mimeType: 'application/json', text: JSON.stringify(o, null, 2) }] });
const toolList = async () => (await loadTools().catch(() => [])).map((t) => ({ uri: `imagination://catalog/tools/${t.id}`, name: `${t.name} (${t.id})`, mimeType: 'application/json', description: String(t.description ?? '').slice(0, 200) }));

export function registerResources(s: any) {
  s.registerResource('tools', 'imagination://catalog/tools', { title: 'Studio tools', description: 'Every tool in the studio, live from the app', mimeType: 'application/json' },
    async (uri: URL) => json(uri, (await loadTools()).map((t) => ({ id: t.id, name: t.name, media: t.media, category: t.category ?? null, description: t.description ?? null, models: (t.models ?? []).map((m: any) => m.key) }))));
  s.registerResource('tool', new ResourceTemplate('imagination://catalog/tools/{id}', { list: async () => ({ resources: await toolList() }) }), { title: 'Tool', description: 'One tool: job fields (JSON Schema) and model cards with limits and prices', mimeType: 'application/json' },
    async (uri: URL, v: Record<string, string | string[]>) => { const id = String(v.id); const t = (await loadTools()).find((x) => x.id === id); if (!t) throw new Error(`Unknown tool ${id}`);
      return json(uri, { id: t.id, name: t.name, media: t.media, description: t.description, fields: fieldSchema(t), presets: (t.presets ?? []).slice(0, 80).map((p: any) => p.id), models: (t.models ?? []).map((m: any) => modelCard(m)) }); });
  s.registerResource('models', 'imagination://catalog/models', { title: 'Models', description: 'Every model across tools: real name, maker, open weights, licence, tools, local, price', mimeType: 'application/json' },
    async (uri: URL) => { const by = new Map<string, any>(); for (const t of await loadTools()) for (const m of t.models ?? []) { const c = by.get(m.key) ?? { ...modelCard(m), tools: [] as string[] }; delete c.run_on; delete c.default; c.tools.push(t.id); by.set(m.key, c); } return json(uri, [...by.values()]); });
  s.registerResource('workflows', 'imagination://catalog/workflows', { title: 'Workflows', description: 'Image, audio and 3D workflows and Generate Video presets, with the tool that runs each', mimeType: 'application/json' },
    async (uri: URL) => json(uri, await loadWorkflows()));
  s.registerResource('prices', new ResourceTemplate('imagination://prices/{id}', { list: async () => ({ resources: (await toolList()).map((r) => ({ ...r, uri: r.uri.replace('catalog/tools', 'prices'), name: `Prices: ${r.name}` })) }) }), { title: 'Price table', description: 'A tool\'s prices: model × run_on → status, credits, USD', mimeType: 'application/json' },
    async (uri: URL, v: Record<string, string | string[]>) => { const id = String(v.id); const t = (await loadTools()).find((x) => x.id === id); if (!t) throw new Error(`Unknown tool ${id}`);
      return json(uri, { toolId: t.id, unit: '1 credit = $0.01; list prices for the default settings, quote for exact ones', rows: (t.models ?? []).flatMap((m: any) => (m.runsOn ?? []).map((r: any) => ({ model: m.key, name: m.displayName ?? m.name, runOn: r.id, place: r.detail ? `${r.label} · ${r.detail}` : r.label, status: r.status, credits: r.credits ?? null, usd: r.credits != null ? r.credits / 100 : null }))) }); });
  s.registerResource('run-on', 'imagination://run-on', { title: 'Run on places', description: 'Where a job can run (local, comfy-cloud, fal, …)', mimeType: 'application/json' },
    async (uri: URL) => json(uri, await runOnPlaces()));
}
