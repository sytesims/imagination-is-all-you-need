/**
 * Writes <repo>/docs/WORKFLOWS.md: one entry per workflow the Workflows tab counts (shared/workflowCount.ts: the catalogue's workflows, the
 * bundled plugins with a tab, then the step-by-step chains), built only from the app's own data:
 *  - name, card line, link, what it takes, chains: shared/workflowCatalog.ts (WF_ENTRIES, WF_CHAINS) + shared/pluginPlacement.ts (plugins);
 *  - models, where each runs and its price basis: the tool's models and routes (routing/modelRegistry.ts, routing/routes.ts) and the price
 *    table (shared/hostedPrices.ts + routing/routePrices.ts); other providers hidden while Comfy or your computer covers them, like the menus
 *    (routing/hiddenPlaces.ts KEEP_PLACES / DIRECT_RUN_ONS, without anyone's saved settings);
 *  - inputs and settings: the tool definition (tools/*: inputs);
 *  - graphs, sources, credits and licences: providers.ts providerWorkflows, shared/appWorkflows.ts, shared/imageFeatures.ts workflowFor,
 *    shared/audioWorkflows.ts audioWorkflowCredit, the Footage Effects presets' own source, licenses.ts workflowLicense (workflows/LICENSES.md);
 *  - custom nodes and downloads for local runs: readiness/manifest (hardware/nodePacks.ts, modelWeights.ts);
 *  - example results: shared/featured.ts, shared/showcase.ts and the entry's own shipped example.
 * Nothing here depends on this computer (keys, settings, hardware), so every install writes the same file.
 * Run: npm run docs:workflows   (or: cd server && npx tsx scripts/gen-workflow-docs.ts [--check])
 * Test: server/test/workflow-docs.test.ts (the file is up to date, every workflow once, every link resolves).
 */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
process.env.OPENHIGGSFIELD_DATA_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), 'ohf-wfdocs-'));
process.env.OPENHIGGSFIELD_BACKEND ||= 'mock';
process.env.OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY = '0'; // every model the app offers, whatever this computer's setting

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = path.join(ROOT, 'docs/WORKFLOWS.md');

const { getTool, listTools } = await import('../src/tools/registry.js');
try { await (await import('../src/plugins.js')).loadPlugins(); } catch { /* no plugins: the catalogue alone */ }
const { WF_ENTRIES, WF_CHAINS, wfEntryById } = await import('../src/shared/workflowCatalog.js');
const { pluginWfEntries } = await import('../src/shared/pluginPlacement.js');
const { workflowCounts, countLine } = await import('../src/shared/workflowCount.js');
const { toolModels, modelRoutes } = await import('../src/routing/modelRegistry.js');
const { comfyVariantOf } = await import('../src/routing/modelRegistry.js');
const { getProvider, providerWorkflows } = await import('../src/providers.js');
const { placeOf, runOnOfRoute, LOCAL_LABEL } = await import('../src/shared/modelIds.js');
const { KEEP_PLACES, DIRECT_RUN_ONS } = await import('../src/routing/hiddenPlaces.js');
const { allRoutePrices } = await import('../src/routing/routePrices.js');
const { unitInfo } = await import('../src/shared/hostedPrices.js');
const { fmtUsd } = await import('../src/shared/runCost.js');
const { appWorkflowFor } = await import('../src/shared/appWorkflows.js');
const { workflowFor, featureById } = await import('../src/shared/imageFeatures.js');
const { audioWorkflowCredit } = await import('../src/shared/audioWorkflows.js');
const { workflowLicense } = await import('../src/licenses.js');
const { weightsForWorkflows } = await import('../src/modelWeights.js');
const { packOfClass } = await import('../src/hardware/nodePacks.js');
const { featuredByKey } = await import('../src/shared/featured.js');
const { showcaseById } = await import('../src/shared/showcase.js');

type Entry = (typeof WF_ENTRIES)[number];
type Credit = { source: string; name: string; url: string | null; author: string; licence?: string; file?: string };
/** What the generator could not find in the data (printed by the script, never written into the doc). */
export const gaps: string[] = [];

const TABS = [['image', 'Image'], ['video', 'Video'], ['audio', 'Audio'], ['3d', '3D']] as const;
const cell = (s: string) => s.replace(/\|/g, '/').replace(/\r?\n/g, ' ');
const rel = (repoPath: string) => `../${repoPath}`; // docs/WORKFLOWS.md → repo root
const exists = (repoPath: string) => fs.existsSync(path.join(ROOT, repoPath));
const gb = (bytes: number) => `${(bytes / 1e9).toFixed(bytes >= 1e10 ? 0 : 1)} GB`;
const list = (xs: string[], n = 6) => (xs.length > n ? `${xs.slice(0, n).join(', ')} +${xs.length - n} more` : xs.join(', '));

/** A graph path as the tools name it (`x-api.json`, `cloud/x.json`, a plugin's `plugins/<id>/workflow.json`) → repo path, or null when absent. */
function graphPath(file: string, tool: any): string | null {
  const cands = [`workflows/${file}`, file, ...(tool?.plugin ? [path.relative(ROOT, path.join(tool.plugin.dir, file))] : [])];
  return cands.find((c) => !c.startsWith('..') && exists(c)) ?? null;
}

/** "from $0.05 per second" from the price table; null when the table has no figure (the app prices it before you run). */
function priceText(priceRef: string | null): string | null {
  if (!priceRef) return null; const h: any = allRoutePrices().find((p) => p.providerId === priceRef); if (!h || h.priceUnmeasured) return null;
  const nums = [h.usd, ...[h.usdByQuality, h.usdByResolution, h.usdByTier, h.usdByTierRes, h.usdByMode].flatMap((o) => Object.values(o ?? {}))]
    .filter((x): x is number => typeof x === 'number' && x > 0);
  if (!nums.length) return h.estimateUsd ? `about ${fmtUsd(h.estimateUsd)} ${unitInfo(h.unit).unitLabel}, estimate` : null;
  const lo = Math.min(...nums), hi = Math.max(...nums);
  return `${lo === hi ? '' : 'from '}${fmtUsd(lo)} ${unitInfo(h.unit).unitLabel}${h.estimated ? ', estimate' : ''}`;
}

/** The models an entry offers, in the order the Workflows page uses (web/src/ui/pages/workflowRows.ts modelsOf): the tool's mode, the image
 *  feature's own engines, then its pins (only them when modelsOnly). Every model, not just what runs on this computer. */
function modelsOf(e: Entry, tool: any) {
  const all = toolModels(tool); const modes: Record<string, string[]> = tool.app?.providerModes ?? {}; const eng = (m: any): string[] => m.parts.map((p: any) => p.engine);
  let ms = all;
  if (e.mode && Object.keys(modes).length) ms = ms.filter((m) => eng(m).some((g) => (modes[g] ?? []).includes(e.mode!)));
  if (e.hubId) { const use = new Set(featureById(e.hubId)?.providers ?? []); const l = ms.filter((m) => eng(m).some((g) => use.has(g))); if (l.length) ms = l; }
  const pinned = e.models.map((k) => all.find((m) => m.key === k)).filter((m): m is (typeof all)[number] => !!m);
  ms = e.modelsOnly && pinned.length ? pinned : [...pinned, ...ms.filter((m) => !e.models.includes(m.key))];
  return ms;
}

/** Where a model runs on this tool, each place once with its price basis. Places that never run (coming soon) are left out; a model's fal /
 *  Replicate / lab-API place is left out while Comfy or your computer covers it, unless it does something they can't (KEEP_PLACES). */
function placesOf(tool: any, m: any, preset: any): { label: string; price: string }[] {
  let rs = modelRoutes(tool, m).map((x) => x.route).filter((r) => !r.comingSoon && !r.notAChoice);
  if (preset?.runOn) rs = rs.filter((r) => runOnOfRoute(r) === preset.runOn); // a preset that runs in one place (Footage Effects' cloud effects)
  const covered = rs.some((r) => r.kind === 'local' || runOnOfRoute(r) === 'comfy-cloud');
  if (covered) rs = rs.filter((r) => { const ro = runOnOfRoute(r); return !DIRECT_RUN_ONS.has(ro) || !!KEEP_PLACES[m.key]?.[ro]; });
  const out = new Map<string, { label: string; prices: string[]; free: boolean; gpu: boolean }>();
  for (const r of rs) {
    const pl = placeOf({ kind: r.kind, routeId: r.routeId, envKey: r.envKey, vendor: r.vendor, comfyVariant: comfyVariantOf(r) ?? null }); if (!pl) continue;
    const o = out.get(pl.label) ?? { label: pl.label, prices: [], free: false, gpu: false }; out.set(pl.label, o);
    if (pl.billing === 'free') o.free = true; else { const p = priceText(r.priceRef); if (p) o.prices.push(p); if (pl.billing === 'gpu-time') o.gpu = true; }
  }
  return [...out.values()].map((o) => ({ label: o.label, price: o.free ? 'free' : o.prices.length ? o.prices.sort((a, b) => a.length - b.length)[0] : o.gpu ? 'GPU time, priced before you run' : 'priced before you run' }));
}

/** The workflow credit the app shows for an entry's model engine. */
function creditOf(e: Entry, tool: any, engine: string, preset: any): Credit | null {
  if (preset?.source) return preset.source;
  if (e.source.startsWith('audio:')) return audioWorkflowCredit(e.source.slice(6) as any, engine) as Credit | null;
  if (e.hubId) { const w = workflowFor(e.hubId, engine); if (w) { const { recipe: _r, ...rest } = w as any; return rest; } }
  return (appWorkflowFor(tool.id, engine) as Credit | null);
}
const creditLine = (c: Credit) => {
  const name = c.name.replace(/\s*\([\w.-]+\)\s*$/, ''); const nm = c.url ? `[${cell(name)}](${c.url})` : cell(name);
  const kind = c.source === 'official' ? 'Official Comfy template' : c.source === 'community' ? 'Community workflow' : 'Our own';
  const by = c.author && c.source !== 'ours' ? ` by ${cell(c.author.replace(/^@/, ''))}` : '';
  return `${kind}: ${nm}${by}${c.licence ? ` (${cell(c.licence)})` : ''}`;
};

/** Node classes in a ComfyUI graph file (API format or UI format). */
function graphClasses(repoPath: string): string[] {
  try { const j = JSON.parse(fs.readFileSync(path.join(ROOT, repoPath), 'utf8'));
    const nodes: any[] = Array.isArray(j?.nodes) ? j.nodes : Object.values(j ?? {});
    return [...new Set(nodes.map((n) => n?.class_type ?? n?.type).filter((x): x is string => typeof x === 'string'))];
  } catch { return []; }
}

/** One example result that ships with the repo (web/public), as a link; null when none ships. */
function exampleOf(e: Entry): string | null {
  const urls: string[] = [];
  if (e.example) urls.push(e.example.after);
  if (e.featured) { const f: any = featuredByKey(e.featured); if (f) urls.push(f.out.url); }
  if (e.showcase) { const s: any = showcaseById(e.showcase); if (s) urls.push(s.image ?? s.thumb); }
  if (e.still) urls.push(e.still.url); if (e.listen) urls.push(e.listen.url);
  const u = urls.find((x) => /^\/(examples|showcase)\//.test(x) && exists(`web/public${x}`));
  if (!u && urls.length) gaps.push(`${e.id}: example ${urls[0]} is not a shipped file`);
  return u ? `[${path.basename(u)}](${rel(`web/public${u}`)})` : null;
}

function inputsOf(tool: any): { files: string; settings: string } {
  const kindOf = (accept?: string) => (/video/.test(accept ?? '') ? 'video' : /audio/.test(accept ?? '') ? 'audio' : /image/.test(accept ?? '') ? 'image' : 'file');
  const files = tool.inputs.filter((i: any) => i.kind === 'file' || i.kind === 'files')
    .map((i: any) => `${i.label ?? i.name} (${i.kind === 'files' ? 'several ' : ''}${kindOf(i.accept)}${i.required ? ', required' : ''}${i.maxBytes ? `, up to ${Math.round(i.maxBytes / 2 ** 20)} MB each` : ''})`);
  const settings = tool.inputs.filter((i: any) => i.kind !== 'file' && i.kind !== 'files' && i.name !== 'seed' && i.name !== 'types')
    .map((i: any) => i.kind === 'text' ? `${i.label ?? i.name} (text${i.required ? ', required' : ''})`
      : i.kind === 'number' ? `${i.label ?? i.name} (number${i.min != null && i.max != null ? ` ${i.min}–${i.max}` : ''})`
      : Array.isArray(i.options) && i.options.length ? `${i.label ?? i.name} (${list(i.options.map((o: unknown) => String(o) || 'none'), 5)})` : `${i.label ?? i.name}`);
  return { files: files.join(' · '), settings: settings.join(' · ') };
}

function entryMd(e: Entry): string {
  const tool: any = getTool(e.toolId); if (!tool) { gaps.push(`${e.id}: tool ${e.toolId} not registered`); return `<a id="${e.id}"></a>\n### ${e.name}\n\n${e.line}\n`; }
  const preset = e.preset ? (tool.presets ?? []).find((p: any) => p.id === e.preset) : null;
  const ms = modelsOf(e, tool);
  const rows: [string, string][] = [['Open', `\`${e.href}\``], ['Takes', cell(e.needs)]];
  const credits = new Map<string, Credit>(); const graphs = new Set<string>(); const localGraphs = new Set<string>();
  const modelLines: string[] = []; const placeSet = new Set<string>();
  for (const m of ms) {
    const places = placesOf(tool, m, preset); if (!places.length) continue; places.forEach((x) => placeSet.add(x.label));
    let dl = '';
    for (const part of m.parts) {
      const p = getProvider(part.engine); if (!p) continue;
      const c = creditOf(e, tool, part.engine, preset); if (c) credits.set(`${c.name}|${c.url}`, c);
      const cloudPreset = !!preset?.runOn && preset.runOn !== 'local'; // a preset that runs on Comfy Cloud only: its own graph, never the local one
      const pw = providerWorkflows(tool, p); const files = pw.length || p.kind === 'open-weights' ? pw : p.workflows ?? []; // a cloud / deployment graph the tool doesn't list itself
      const own = cloudPreset ? [] : files.map((f) => graphPath(f, tool)).filter((x): x is string => !!x);
      const cf = c?.file ? graphPath(c.file, tool) : null; if (c?.file && !cf) gaps.push(`${e.id}: credited graph ${c.file} not in the repo`);
      for (const g of [...own, ...(cf ? [cf] : [])]) graphs.add(g);
      if (p.kind === 'open-weights' && places.some((x) => x.price === 'free')) { own.forEach((g) => localGraphs.add(g));
        const w = weightsForWorkflows(providerWorkflows(tool, p)); const bytes = w.reduce((a, x) => a + (x.sizeBytes ?? 0), 0);
        if (bytes > 0 && !dl) dl = `, ${w.some((x) => x.sizeApprox || x.sizeBytes == null) ? 'about ' : ''}${gb(bytes)} of model files`; }
    }
    const name = preset?.modelName && preset.runOn ? preset.modelName : m.def.name;
    modelLines.push(`**${cell(name)}**: ${places.map((x) => `${x.label} (${x.price}${x.price === 'free' ? dl : ''})`).join(' · ')}`);
  }
  if (!ms.length && tool.plugin) for (const g of (tool.workflows ?? []).map((f: string) => graphPath(f, tool)).filter(Boolean)) { graphs.add(g); localGraphs.add(g); }
  if (modelLines.length) rows.push(['Models', modelLines.join('<br>')]);
  else rows.push(['Models', tool.plugin ? 'Your computer (free)' : 'Runs in the app on your computer (free); no AI model']);
  const io = inputsOf(tool); if (io.files) rows.push(['Files in', cell(io.files)]); if (io.settings) rows.push(['Settings', cell(io.settings)]);
  const graphLicence = (g: string) => (g.startsWith('plugins/') ? tool.plugin?.license?.name ?? '' : workflowLicense(g.replace(/^workflows\//, '')).parts.map((l: any) => String(l.name).replace(/\s*\(.*\)\s*$/, '')).join(' + '));
  if (graphs.size) rows.push(['ComfyUI graph', [...graphs].map((g) => `[${g.replace(/^workflows\//, '')}](${rel(g)}) (${cell(graphLicence(g))})`).join('<br>')]);
  else if (placeSet.size && [...placeSet].every((x) => x === LOCAL_LABEL)) rows.push(['ComfyUI graph', 'None: it runs in the app on your computer, without ComfyUI']);
  else if ([...credits.values()].some((c) => c.source === 'official') && placeSet.has('Comfy Cloud')) rows.push(['ComfyUI graph', 'Runs the official Comfy template under “Comes from” on Comfy Cloud (no file in this repo)']);
  else if (modelLines.length) rows.push(['ComfyUI graph', 'Runs through a partner model’s API (no ComfyUI file)']);
  if (tool.plugin) rows.push(['Credit', `Plugin by ${cell(tool.plugin.author ?? 'its author')} (${cell(tool.plugin.license?.name ?? 'licence in its folder')})`]);
  if (credits.size) rows.push(['Comes from', [...credits.values()].map(creditLine).join('<br>')]);
  const packs = [...new Set([...localGraphs].flatMap(graphClasses).map((c) => packOfClass(c)).filter((p) => p && p.name !== 'ComfyUI (core)').map((p) => p!.repo ? `[${p!.name}](${p!.repo})` : p!.name))];
  if (packs.length) rows.push(['Custom nodes (local)', packs.join(', ')]);
  const ex = exampleOf(e); if (ex) rows.push(['Example', ex]);
  const alias = e.tabName ? ` Its tab calls it “${e.tabName}”.` : '';
  return [`<a id="${e.id}"></a>`, `### ${e.name}`, '', `${e.line}${alias}`, '', '| | |', '|---|---|', ...rows.map(([k, v]) => `| ${k} | ${v} |`), ''].join('\n');
}

function chainMd(c: (typeof WF_CHAINS)[number]): string {
  const steps = c.steps.map((s, i) => {
    const en = wfEntryById(s.entry); const tool: any = en ? getTool(en.toolId) : null;
    const model = s.modelName ?? (s.model && tool ? toolModels(tool).find((m) => m.key === s.model)?.def.name ?? s.model : null);
    if (!en) gaps.push(`chain ${c.id}: step ${s.entry} is not a catalogue entry`);
    return `${i + 1}. ${cell(s.say)}: [${en?.name ?? s.entry}](#${s.entry})${model ? ` · ${cell(model)}` : ''}`;
  });
  const rows: [string, string][] = [['Steps', steps.join('<br>')], ['Hand-off', cell(c.handoff)]];
  if (c.source) rows.push(['Comes from', `[${cell(c.source.name)}](${c.source.url}) by ${cell(c.source.author)} (${cell(c.source.licence)})`]);
  if (c.skill && exists(`skills/${c.skill}/SKILL.md`)) rows.push(['Agent skill', `[${c.skill}](${rel(`skills/${c.skill}/SKILL.md`)})`]);
  const f: any = c.featured ? featuredByKey(c.featured) : null; const u = f?.out?.url;
  if (u && exists(`web/public${u}`)) rows.push(['Example', `[${path.basename(u)}](${rel(`web/public${u}`)})`]);
  return [`<a id="chain-${c.id}"></a>`, `### ${c.name}`, '', c.line, '', '| | |', '|---|---|', ...rows.map(([k, v]) => `| ${k} | ${v} |`), ''].join('\n');
}

/** The whole document. Deterministic: same code and data → same text. */
export function render(): string {
  gaps.length = 0;
  const plugins = pluginWfEntries(listTools().filter((t: any) => t.plugin && !t.plugin.user) as any) as Entry[];
  const all = [...WF_ENTRIES, ...plugins];
  const n = workflowCounts(plugins.map((p) => p.medium));
  const L = ['<!-- GENERATED by server/scripts/gen-workflow-docs.ts from the app\'s own catalogue. Do not edit: run `npm run docs:workflows`. -->', '',
    '# Every workflow', '',
    `${countLine(n.workflows, n.chains)} This page lists each one: what it does, where to open it, the models it offers and where they run, what it takes, the ComfyUI graph behind it and where that graph comes from.`, '',
    'Read it like this:', '',
    '- **Open** is the link inside the app (add it after your app’s address). Nothing runs until you press Generate.',
    '- **Models**: each model with the places it runs. **Your computer** is free (the size is the model files it downloads once). **Comfy Cloud** runs it through your Comfy key at the price shown; “priced before you run” means the app shows the exact price on the button first. Other providers (fal, Replicate, a lab’s own API) are listed only where they add something.',
    '- **Files in** and **Settings** are the fields of the tool that runs it (some tools serve several workflows, so not every field shows for every workflow).',
    '- **ComfyUI graph** links the graph file in [`workflows/`](../workflows/) with the licences of what it loads ([workflows/LICENSES.md](../workflows/LICENSES.md)). **Comes from** credits the official Comfy template or community workflow it follows.',
    '- **Custom nodes (local)** are the node packs a local run needs besides ComfyUI itself; the app installs them for you (see [Local models and hardware](LOCAL-MODELS-AND-HARDWARE.md)).', '',
    'Model licences and credit lines: [LICENSES.md](../LICENSES.md) and [Attribution](ATTRIBUTION.md).', '',
    '## Contents', '', ...TABS.map(([m, label]) => `- [${label}](#${m === '3d' ? '3d' : m}) (${all.filter((e) => e.medium === m).length})`), `- [Step by step](#step-by-step) (${WF_CHAINS.length})`, ''];
  for (const [m, label] of TABS) { L.push(`## ${label}`, ''); for (const e of all.filter((x) => x.medium === m)) L.push(entryMd(e)); }
  L.push('## Step by step', '', 'Chains of the workflows above, one step after another. Each step shows its price before you run it.', '');
  for (const c of WF_CHAINS) L.push(chainMd(c));
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const md = render();
  if (gaps.length) console.warn(`gaps (${gaps.length}):\n  ${gaps.join('\n  ')}`);
  if (process.argv.includes('--check')) { const same = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === md; console.log(same ? 'docs/WORKFLOWS.md is up to date' : 'docs/WORKFLOWS.md is out of date: run npm run docs:workflows'); process.exit(same ? 0 : 1); }
  fs.writeFileSync(OUT, md); console.log(`wrote ${path.relative(ROOT, OUT)}`);
  process.exit(0);
}
