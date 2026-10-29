import { LICENSES } from './licenses.js';
import { buildLicenseReport } from './licensesReport.js';
/** P0 attribution check (docs/ATTRIBUTION.md). Every licence used by a model → what its official text asks us to show in the app.
 *  status: 'required' (the licence requires something in the UI) | 'none' (the text requires no in-app line; notices only on redistribution) | 'unverified' (text not readable / not checked).
 *  line = the credit line we show; level = whether that exact line is 'required' or only 'encouraged'; requiredText = what the licence requires
 *  (MiniMax H3: §IV.2 requires the name "MiniMax H3" in the UI, §III.3(a) only encourages "Powered by MiniMax H3"; we show the line, which carries the name).
 *  Licences with their own attributionSource in licenses.ts use that; the rest are covered here, each with the clause we read. */
export interface AttributionCheck { status: 'required' | 'none' | 'unverified'; line: string | null; level?: 'required' | 'encouraged' | null; requiredText?: string | null; source: { url: string | null; clause: string; checkedAt: string } }
const D = '2026-10-17';
const PERMISSIVE = (url: string, what: string): AttributionCheck => ({ status: 'none', line: null, source: { url, clause: `${what}: keep the copyright and licence notice in copies of the software/weights; nothing is required in the app UI or on outputs.`, checkedAt: D } });
const CCBYNC = (url: string): AttributionCheck => ({ status: 'none', line: null, source: { url: 'https://creativecommons.org/licenses/by-nc/4.0/legalcode', clause: `CC BY-NC 4.0 §3(a): attribution applies when the licensed material (the weights, ${url}) is shared; running it and its outputs need no in-app credit.`, checkedAt: D } });
const EXTRA: Record<string, AttributionCheck> = {
  'apache-2.0': PERMISSIVE('https://www.apache.org/licenses/LICENSE-2.0', 'Apache-2.0 §4 (Redistribution)'),
  mit: PERMISSIVE('https://opensource.org/license/mit', 'MIT'),
  'bsd-3-clause': PERMISSIVE('https://opensource.org/license/bsd-3-clause', 'BSD-3-Clause clauses 1–2'),
  chatterbox: PERMISSIVE('https://huggingface.co/ResembleAI/chatterbox', 'MIT'),
  'faster-whisper': PERMISSIVE('https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE', 'MIT'),
  'birefnet-mit': PERMISSIVE('https://github.com/ZhengPeng7/BiRefNet/blob/main/LICENSE', 'MIT'),
  'rife-mit': PERMISSIVE('https://github.com/hzwer/Practical-RIFE/blob/main/LICENSE', 'MIT'),
  'depth-anything-v2-small-apache': PERMISSIVE('https://huggingface.co/depth-anything/Depth-Anything-V2-Small', 'Apache-2.0 §4'),
  'nllb-nc': CCBYNC('https://huggingface.co/facebook/nllb-200-distilled-600M'),
  'infiniteyou-nc': CCBYNC('https://huggingface.co/ByteDance/InfiniteYou'),
  'ultrasharp-nc': { status: 'none', line: null, source: { url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode', clause: 'CC BY-NC-SA 4.0 §3(a)/(b): attribution and share-alike apply when the weights (or adapted weights) are shared; upscaled outputs need no in-app credit.', checkedAt: D } },
  'flux1-dev-nc': { status: 'none', line: null, source: { url: 'https://raw.githubusercontent.com/black-forest-labs/flux/main/model_licenses/LICENSE-FLUX1-dev', clause: '3(b): the Attribution Notice goes alongside a Distribution of the model (e.g. a Notice file); 2(e)(ii): outputs disclose AI generation where the law requires. No in-app credit line.', checkedAt: D } },
  'aceplus-flux': { status: 'unverified', line: null, source: { url: 'https://huggingface.co/ali-vilab/ACE_Plus', clause: 'No licence file; the README defers to the FLUX.1 [dev] licence (no in-app line there), but the LoRAs themselves have no checkable text.', checkedAt: D } },
  'insightface-nc': { status: 'unverified', line: null, source: { url: 'https://github.com/deepinsight/insightface#license', clause: 'README states non-commercial research use for the models; no full licence text with attribution terms to check.', checkedAt: D } },
  'civitai-lora': { status: 'unverified', line: null, source: { url: 'https://civitai.com/content/licenses', clause: 'Per-model permissions set by each LoRA author; checked per component, not here.', checkedAt: D } },
  'no-license': { status: 'unverified', line: null, source: { url: 'https://github.com/filliptm/ComfyUI_Fill-ChatterBox', clause: 'No licence declared, so there is no text to check.', checkedAt: D } },
  'h3-camera-motion-civitai': { status: 'none', line: null, source: { url: 'https://civitai.com/models/2914784/cameramotionh3', clause: 'Civitai permissions for camera_motion_h3: no credit required. The downloaded weights fall under the MiniMax H3 Community Licence, whose “Powered by MiniMax H3” line comes from the minimax-community part.', checkedAt: D } },
  'alissonerdx-unspecified': { status: 'unverified', line: null, source: { url: 'https://huggingface.co/Alissonerdx/Minimax-H3-ComfyUI/raw/main/LICENSES.md', clause: 'LICENSES.md scopes its custom licence to the BFS Character Swap LoRAs only (credit required there for orgs over US$1M); no licence is stated for the Style Transfer / VFX Edit files we use. The base MiniMax H3 line still applies.', checkedAt: D } },
  proprietary: { status: 'unverified', line: null, source: { url: null, clause: 'Hosted API: no model licence; any credit rule is in the provider\'s API terms, which were not checked line by line.', checkedAt: D } },
};
export function licenseAttribution(id: string): AttributionCheck {
  const l = LICENSES[id] as any;
  if (l?.attributionSource) { const level = l.attribution ? (l.attributionLevel ?? 'required') : null;
    return { status: !l.attributionSource.verified ? 'unverified' : l.attribution ? 'required' : 'none', line: l.attribution ?? null, level, requiredText: l.attribution ? (l.requiredDisplay ?? (level === 'required' ? l.attribution : null)) : null, source: { url: l.attributionSource.url, clause: l.attributionSource.clause, checkedAt: l.attributionSource.checkedAt } }; }
  return EXTRA[id] ?? { status: 'unverified', line: null, source: { url: l?.url ?? null, clause: 'Not checked yet.', checkedAt: D } };
}
/** Per model (providerId): every licence part it uses → lines to show + overall status (required > unverified > none). */
export function modelAttribution(providerId: string, allRows?: any[]) {
  const rows = (allRows ?? buildLicenseReport().rows).filter((r: any) => r.providerId === providerId); if (!rows.length) return null;
  const ids = [...new Set(rows.flatMap((r: any) => [r.licenseId, ...((r.parts ?? []) as any[]).map((p: any) => p.id ?? p)]).filter(Boolean))] as string[];
  const parts = ids.map((id) => ({ licenseId: id, ...licenseAttribution(id) }));
  const lines = [...new Set(parts.filter((p) => p.status === 'required' && p.line).map((p) => p.line!))];
  const status = lines.length ? 'required' : parts.some((p) => p.status === 'unverified') ? 'unverified' : 'none';
  const shown = parts.filter((p) => p.status === 'required' && p.line);
  /** requiredText: what the licences require in the UI; encouragedLines: shown lines the licence only encourages (MiniMax H3 §III.3(a)). */
  const requiredText = [...new Set(shown.map((p) => p.requiredText).filter(Boolean) as string[])]; const encouragedLines = [...new Set(shown.filter((p) => p.level === 'encouraged').map((p) => p.line!))];
  return { status, lines, requiredText, encouragedLines, verified: status !== 'unverified' && parts.every((p) => p.status !== 'unverified'), parts };
}

/** creditLine = the line(s) to show (joined ' · '), null when none is required, 'unverified' when the licence is gated / not checked.
 *  creditSource = where the requirement was read ({url, clause, checkedAt}) or null. */
export function creditOf(providerId: string, allRows?: any[]): { creditLine: string | null; creditSource: { url: string | null; clause: string; checkedAt: string } | null } {
  const a = modelAttribution(providerId, allRows); if (!a) return { creditLine: null, creditSource: null };
  const req = a.parts.find((p) => p.status === 'required' && p.line); const unv = a.parts.find((p) => p.status === 'unverified');
  if (a.status === 'required') return { creditLine: a.lines.join(' · '), creditSource: req?.source ?? null };
  if (a.status === 'unverified') return { creditLine: 'unverified', creditSource: unv?.source ?? null };
  return { creditLine: null, creditSource: a.parts[0]?.source ?? null };
}
/** Same for one licence row (licenseId + parts). */
export function creditOfLicenseRow(r: any) {
  const ids = [...new Set([r.licenseId, ...((r.parts ?? []) as any[]).map((p: any) => p.id ?? p)].filter(Boolean))] as string[];
  const parts = ids.map((id) => licenseAttribution(id)); const req = parts.filter((p) => p.status === 'required' && p.line);
  if (req.length) return { creditLine: [...new Set(req.map((p) => p.line!))].join(' · '), creditSource: req[0].source };
  const unv = parts.find((p) => p.status === 'unverified'); if (unv) return { creditLine: 'unverified', creditSource: unv.source };
  return { creditLine: null, creditSource: parts[0]?.source ?? null };
}

/** Credit line for a finished result (every response that carries its output): from the job's model licence. MiniMax H3 → text 'Powered by MiniMax H3'
 *  with required:false + level 'encouraged' (§III.3(a)) and requiredText 'MiniMax H3' (§IV.2 requires the name, prominently: display 'prominent').
 *  The UI keeps showing text. null when the model's licence asks for nothing in the UI. Memoised per provider (the licence report is built once). */
const jobAttrMemo = new Map<string, any>();
export function jobAttribution(j: { provider?: string | null; toolId?: string }) {
  const pid = String(j.provider ?? ''); if (!pid) return null;
  if (!jobAttrMemo.has(pid)) { const a = modelAttribution(pid); const req = a?.parts.filter((p) => p.status === 'required' && p.line) ?? [];
    const lic = req[0] ? (LICENSES as any)[req[0].licenseId] : null;
    jobAttrMemo.set(pid, req.length ? { text: [...new Set(req.map((p) => p.line!))].join(' · '), lines: [...new Set(req.map((p) => p.line!))], required: req.some((p) => (p.level ?? 'required') === 'required'), level: req.some((p) => (p.level ?? 'required') === 'required') ? 'required' : 'encouraged', requiredText: [...new Set(req.map((p) => p.requiredText).filter(Boolean))].join(' · ') || null, display: 'prominent', licenseId: req[0].licenseId, licenseName: lic?.name ?? null, clause: req[0].source?.clause ?? null, sourceUrl: req[0].source?.url ?? null } : null); }
  return jobAttrMemo.get(pid);
}

/** Share sheet: the non-commercial licence(s) among the weights a model uses (null when none). Read from the licence ids and names
 *  (CC BY-NC, "Non-Commercial", research-only), so the sheet can show a small note; it never blocks sharing. */
const NC_RE = /(^|[-_ ])nc($|[-_ ])|non-?commercial|research|BY-NC/i;
export function nonCommercialOf(providerId: string | null | undefined): { names: string[]; url: string | null } | null {
  if (!providerId) return null; let a: ReturnType<typeof modelAttribution> = null; try { a = modelAttribution(providerId); } catch { return null; } if (!a) return null;
  const nc = a.parts.filter((p) => NC_RE.test(p.licenseId) || NC_RE.test(String((LICENSES as any)[p.licenseId]?.name ?? '')));
  if (!nc.length) return null; return { names: [...new Set(nc.map((p) => String((LICENSES as any)[p.licenseId]?.name ?? p.licenseId)))], url: (LICENSES as any)[nc[0].licenseId]?.url ?? nc[0].source?.url ?? null };
}
