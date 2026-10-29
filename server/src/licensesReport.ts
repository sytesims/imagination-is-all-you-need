/** "Models & Licences": one row per tool × model from the live registry. Served at GET /api/licenses;
 *  scripts/gen-licenses.ts writes LICENSES.md from the same function. The only place licence links are exposed. */
import { listTools } from './tools/registry.js';
import { toolProviders, providerLicense, comfyCloudOpen, type ProviderDef } from './providers.js';
import { routesFor } from './routing/routes.js';
const CLOUD_ROUTE_LABEL: Record<string, string> = { fal: 'fal', replicate: 'Replicate', direct: 'provider API', 'comfy-cloud': 'Comfy Cloud', 'comfy-router': 'Comfy Router' };
/** Where a model runs (not its licence): local ComfyUI, Comfy Cloud (open workflow = no API nodes, or API nodes), Comfy partner API, or a provider's own API. */
export function runsOnOf(p: ProviderDef): string {
  if (p.kind === 'open-weights') { const extra = [...new Set(routesFor(p.id).filter((r) => r.kind !== 'local' && !r.comingSoon).map((r) => CLOUD_ROUTE_LABEL[r.kind] ?? r.kind))];
    return `Local ComfyUI${extra.length ? ` · or ${extra.join(', ')}` : ''}`; }
  if (p.id.startsWith('cloud-')) return comfyCloudOpen(p) ? 'Comfy Cloud · open workflow' : 'Comfy Cloud · API nodes';
  if (p.kind === 'hosted') return 'Comfy Router (hosted)';
  return 'Provider API (hosted)';
}
export type Commercial = 'yes' | 'no' | 'restricted' | 'provider-terms';
export interface LicenseRow { toolId: string; toolName: string; providerId: string; model: string; kind: string; /** Where it runs (not the licence), e.g. 'Local ComfyUI', 'Comfy Cloud · open workflow'. */ runsOn: string; license: string; licenseId: string; licenseUrl: string | null; sourceUrl: string | null; osi: boolean; commercial: Commercial; /** Required credit line to show in the app (null = none). */ attribution: string | null; attributionSources: { licenseId: string; url: string; clause: string; checkedAt: string; verified: boolean }[]; parts: { id: string; name: string; url: string | null }[] }
const commercialOf = (kind: string, name: string, osi: boolean): Commercial =>
  kind !== 'open-weights' ? 'provider-terms' : osi ? 'yes' : /non-commercial|research|NC\b|BY-NC/i.test(name) && !/commercial (use|outputs) only for|under US\$/i.test(name) ? 'no' : 'restricted';
import { LICENSE_COMPONENTS as COMPONENTS, LICENSES } from './licenses.js';
export function buildLicenseReport() {
  const rows: LicenseRow[] = [];
  for (const t of listTools()) for (const p of toolProviders(t)) {
    const l: any = providerLicense(t, p);
    rows.push({ toolId: t.id, toolName: t.name, providerId: p.id, model: p.name, kind: p.kind, runsOn: runsOnOf(p), license: l.name, licenseId: l.id, licenseUrl: l.url ?? null,
      sourceUrl: (p as any).docUrl ?? (p as any).licenseUrl ?? null, osi: !!l.osi, commercial: commercialOf(comfyCloudOpen(p) ? 'open-weights' : p.kind, l.name, !!l.osi) /* open graph on Comfy Cloud: the weight licence governs, not provider terms */, attribution: [...new Set(((l.parts ?? [l]) as any[]).map((x) => x.attribution ?? LICENSES[x.id]?.attribution).filter(Boolean))].join(' · ') || null, attributionSources: ((l.parts ?? [l]) as any[]).map((x) => ({ licenseId: x.id, ...(x.attributionSource ?? LICENSES[x.id]?.attributionSource) })).filter((x) => x.url),
      parts: (l.parts ?? [l]).map((x: any) => ({ id: x.id, name: x.name, url: x.url ?? null })) });
  }
  const models = new Map<string, LicenseRow & { tools: string[] }>();
  for (const r of rows) { const key = `${r.providerId}|${r.licenseId}|${r.licenseUrl}`; const m = models.get(key); if (m) m.tools.push(r.toolId); else models.set(key, { ...r, tools: [r.toolId] }); }
  return { generatedAt: new Date().toISOString(), usageNote: USAGE_NOTE, note: 'Commercial: yes = OSI licence; no = non-commercial; restricted = custom terms (read the licence); provider-terms = hosted API, governed by the provider\'s terms.', models: [...models.values()].map(({ toolId, toolName, ...m }) => m), rows, components: COMPONENTS, attributions: [...new Set(rows.map((r) => r.attribution).filter(Boolean))] };
}
/** Licence-and-usage note for documentation and the Models & Licences page; not an enforcement layer. */
export const USAGE_NOTE = 'Licence and usage: Imagination Is All You Need does not filter, moderate, report or gate what you generate, and asks for no Terms or rights acceptance. You are responsible for following each model\'s licence (linked below, including any acceptable-use policy and territory limits it carries) and the terms of any cloud provider you use. When a cloud provider itself refuses a job, the app shows its reason, returns the credits to your balance once and ends the job as blocked or failed. Licence details are shown for information only and never change the default model (the optional open-weights-only setting just hides hosted APIs). Plain-language notes: docs/USAGE-NOTES.md.';
export function licensesMarkdown(r = buildLicenseReport()) {
  const esc = (s: string) => s.replace(/\|/g, '\\|');
  const link = (t: string, u: string | null) => (u ? `[${esc(t)}](${u})` : esc(t));
  return `# Models & Licences\n\nGenerated from the tool registry by \`npm run licenses -w server\` (do not edit by hand). Also served at \`GET /api/licenses\` and the web page \`/licenses\`.\n\n> **${r.usageNote}**\n\n${r.note}\n\n| Model | Runs on | Licence | Commercial | Credit line (in app) | Source / weights | Used by |\n|---|---|---|---|---|---|---|\n` +
    r.models.map((m) => `| ${esc(m.model)} | ${esc(m.runsOn)} | ${link(m.license, m.licenseUrl)} | ${m.commercial} | ${m.attribution ? `${esc(m.attribution)}${m.attributionSources[0] ? ` ([clause](${m.attributionSources.find((x) => x.verified)?.url ?? m.attributionSources[0].url}))` : ''}` : m.attributionSources.some((x) => !x.verified) ? 'not verified (gated licence)' : '—'} | ${m.sourceUrl ? `[link](${m.sourceUrl})` : '—'} | ${m.tools.join(', ')} |`).join('\n') + '\n\n' + RUNS_ON_NOTE + '\n' +
    Object.entries(r.components ?? {}).map(([tool, cs]) => `\n## Components: ${tool}\n\n| Component | Licence | Commercial | Source |\n|---|---|---|---|\n` + cs.map((c) => `| ${esc(c.model)} | ${esc(c.license)}${c.terms?.length ? ` (${esc(c.terms.join(' '))})` : ''} | ${c.commercial} | ${c.url ? `[link](${c.url})` : '—'} |`).join('\n') + '\n').join('') + noticesMarkdown() + PRICING_NOTES;
}
/** J2: creator credits and NOTICE texts (verbatim from upstream) for licences that carry them. Shared by LICENSES.md and docs/ATTRIBUTION.md. */
export function noticesMarkdown() {
  const ls = Object.values(LICENSES).filter((l: any) => l.credit || l.noticeFile) as any[]; if (!ls.length) return '';
  return '\n## Credits and NOTICE texts\n\nCopied verbatim from the upstream NOTICE files. They travel with the weights when weights are redistributed; the app shows the credit lines above.\n' +
    ls.map((l) => `\n### ${l.name}${l.credit ? ` (${l.credit.by})` : ''}\n\n${l.credit ? `- Credit: **${l.credit.line}** ([NOTICE](${l.credit.noticeUrl}))\n` : ''}- Licence: ${l.url ? `[${l.id}](${l.url})` : l.id}\n${l.noticeFile ? `\n${String(l.noticeFile).split('\n').map((x: string) => `> ${x}`.trimEnd()).join('\n')}\n` : ''}`).join('');
}
export const RUNS_ON_NOTE = '"Runs on" says where the model runs (your ComfyUI, Comfy Cloud, a partner or provider API), not its licence: "Comfy Cloud · open workflow" is an open-weights workflow (no API nodes) run on Comfy Cloud, and its terms are in the Licence column.';
/** Pricing notes shown under the licence tables (LICENSES.md + /licenses). Credits: 1 credit = $0.01, quote = charge, whole credits only. */
export const PRICING_NOTES = `\n## Pricing notes\n\n- 1 credit = US$0.01, no markup; local open-weights runs cost 0. The quote is an estimate of what the provider bills. By default you pay providers directly on your own accounts (Comfy Cloud, fal, Replicate, BFL…), each under its own terms, including whether failed runs are charged; see the Spend page. In team mode the app keeps a credit balance and a failed run's credits go back to it.\n- **Whole-credit rounding (FLUX 3 Image Klein):** credits are whole numbers, so per-image prices are rounded to the nearest credit (at least 1). Official prices (docs.bfl.ml/flux_3/flux3_image_klein, fal.ai Klein pages, checked 2026-10-17): 1K $0.009 → 1 credit, **2K $0.014 → 1 credit**, 4K $0.036 → 4 credits. The 2K rounding is deliberate (we under-charge by $0.004 per image) and is kept.\n- Full docs: [docs/ATTRIBUTION.md](docs/ATTRIBUTION.md) lists every required credit line (Powered by MiniMax H3, Powered by Stability AI, Built with Fish Audio).\n`;
/** Strip licence links (url / licenseUrl) from tool + model payloads: links live only in /api/licenses. */
export function stripLicenseLinks<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripLicenseLinks) as any;
  if (!v || typeof v !== 'object') return v;
  const o: any = {};
  for (const [k, x] of Object.entries(v as any)) {
    if (k === 'licenseUrl') continue;
    if ((k === 'license' || k === 'parts') && x && typeof x === 'object') { o[k] = Array.isArray(x) ? x.map(({ url, ...r }: any) => stripLicenseLinks(r)) : (({ url, ...r }: any) => stripLicenseLinks(r))(x); continue; }
    o[k] = stripLicenseLinks(x);
  }
  return o;
}
