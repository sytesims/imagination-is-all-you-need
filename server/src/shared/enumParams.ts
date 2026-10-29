/**
 * Oct 19 #7 (BH P3) + Oct 19 batch 2 (DP #3/#9, BH P3 #5/#6): enum-like params are checked against the tool's allowlist on quote AND submit
 * (one rule), so a bad value never gets echoed back (e.g. a NUL character in resolution).
 * Fields: resolution, aspect (alias aspectRatio), quality, scale, types, mode; plus width/height (a size, not an enum).
 *  - allowlist = the tool's own input options (+ for resolution: every resolution its models list in videoCaps; for quality on tools with a
 *    resolution list: those values too, since quality=<resolution> is an accepted alias; for scale: the app's scales). An app (app-*) with no
 *    list of its own uses its base tool's list (the app forwards the field to the base tool's job).
 *  - resolution / aspect / quality / scale: a tool with NO list for a field doesn't use it → any sent value is rejected (allowed: []). An absent or
 *    empty value is "not sent" and always fine.
 *  - types / mode: the tool's types options (camera aliases included); mode = the tool's mode options, else the types list (mode is the quote's
 *    alias for types). A tool with no list but prompt presets (object-swap, restyle, …) accepts a plain id (letters, digits, - _ : .); a tool with
 *    neither (Director, Orbit Shot, Extend) takes no types: any value → 400 invalid_type, allowed []. Empty value or [] = not sent. Never echoed.
 *  - DP #20: apps validate the user's raw values before their locked params apply (UGC Ad aspect=zzq → 400); an app that locks a field's value
 *    (UGC Ad aspect 9:16) allows only that value (16:9 → 400 unsupported_aspect, not silently replaced); a malformed aspect (zzq) → 400 invalid_aspect; an app's resolution data
 *    (app.resolutions / resolutionsByProvider) is in its resolution list. allowedFor() = the effective lists, served as /api/tools tool.allowed.
 *  - width / height: whole numbers from 16 to 16384 → else 400 invalid_size.
 *  - matching ignores case.
 * Message: '<Field> <value> isn't supported here. <Field> must be one of …' (the value is named only when it matches the field's sane format;
 * types/mode never name it). Quality lists human labels for its own values only (Low, Medium, High); resolution aliases stay accepted, unlisted.
 * Failure → 400 {error, errorType:'validation', code:'invalid_<field>' | 'unsupported_aspect' (well-formed aspect not on the list) | 'invalid_type' | 'invalid_mode' | 'invalid_size', field, allowed, issues:[{code, field, message}]}.
 */
import type { ToolDef } from '../tools/types.js';
import { limitsFor } from '../tools/h3/videoCaps.js';
import { getTool } from '../tools/registry.js';
import { CAMERA_ALIASES } from '../tools/apps.js';

const FIELDS = ['resolution', 'aspect', 'quality', 'scale'] as const; type F = typeof FIELDS[number];
const FORMAT: Record<F, RegExp> = { resolution: /^(\d{3,4}p|[1-8]k|source|standard|high)$/i, aspect: /^(auto|\d{1,4}(\.\d{1,2})?:\d{1,4}(\.\d{1,2})?)$/i /* 9:19.5 (Grok), 1920:1080 (Runway) */, quality: /^[a-z0-9]{1,16}$/i, scale: /^(x?\d(\.\d{1,2})?)$/i };
const LABEL: Record<F, string> = { resolution: 'Resolution', aspect: 'Aspect ratio', quality: 'Quality', scale: 'Scale' };
const SHORT: Record<F, string> = { resolution: 'Resolution', aspect: 'Aspect', quality: 'Quality', scale: 'Scale' };
/** Human labels for quality values (the machine value stays in `allowed`). */
export const QUALITY_LABEL: Record<string, string> = { low: 'Low', med: 'Medium', medium: 'Medium', high: 'High', fast: 'Fast', quality: 'Quality', standard: 'Standard', draft: 'Draft' };
const RES_LIKE = /^(\d{3,4}p|[1-8]k)$/i;
const ID = /^[a-z0-9][a-z0-9_:.-]{0,39}$/i;
const optsOf = (tool: ToolDef, name: string): string[] => {
  const all = [...((tool as any).inputs ?? []), ...((tool as any).fields ?? [])].filter((i: any) => i?.name === name);
  return [...new Set(all.flatMap((i: any) => [...(i.options ?? []), ...Object.values<any>(i.byProvider ?? {}).flat()].map((o: any) => String(o?.value ?? o))))]; // + per-model lists (Re-shoot H3 CrossView: 768p)
};
const baseOf = (tool: ToolDef): ToolDef | null => { const b = (tool as any).app?.gallery?.base; return b && b !== tool.id ? getTool(b) ?? null : null; };
function ownAllowlist(tool: ToolDef) {
  const prov: string[] = ((tool as any).providers ?? []) as string[];
  const caps = prov.flatMap((p) => limitsFor(p)?.resolutions ?? []);
  const ap: any = (tool as any).app; // DP #20.3: an app's own resolution data (app.resolutions / resolutionsByProvider) is part of its allowlist, so data and rule agree
  const appRes = [...((ap?.resolutions ?? []) as any[]), ...Object.values<any>(ap?.resolutionsByProvider ?? {}).flat()].map(String);
  const res = [...new Set([...optsOf(tool, 'resolution'), ...caps, ...appRes, ...(caps.includes('768p') || appRes.includes('768p') ? ['720p'] : [])])]; // 720p is mapped to 768p on H3 tiers (videoCaps resolutionMap)
  const lockedAspect = ap?.gallery?.locked?.aspect; // an app that locks its frame (UGC Ad: 9:16) takes only that value; another is a 400, never silently replaced
  // 2026-10-25: an app whose lock follows its fields (Character Sheet layouts, tools/apps.ts lockedFor) takes the shapes those locks can give
  const lockedAll: string[] | undefined = ap?.gallery?.lockedValues?.aspect;
  const aspect = lockedAll?.length ? [...lockedAll] : lockedAspect ? [String(lockedAspect)] : [...new Set([...optsOf(tool, 'aspect'), ...optsOf(tool, 'aspectRatio')])];
  const qualityOwn = optsOf(tool, 'quality'); const quality = qualityOwn.length || res.length ? [...new Set([...qualityOwn, ...res])] : [];
  const a: any = (tool as any).app; const scale = [...new Set([...optsOf(tool, 'scale'), ...((a?.scales ?? []) as any[]).map(String)])];
  const types = optsOf(tool, 'types'); const mode = optsOf(tool, 'mode');
  const presets = ((tool as any).presets ?? []).length > 0; // DP #20.2: tools whose types are free ids (object-swap 'swap', …) carry prompt presets
  return { resolution: res, aspect, quality, scale, types, mode, qualityOwn, presets };
}
/** Allowed values per field (an app with no list of its own inherits its base tool's). */
export function allowlist(tool: ToolDef): Record<F | 'types' | 'mode', string[]> & { qualityOwn: string[]; typesFree: boolean } {
  const own = ownAllowlist(tool); const b = baseOf(tool); const base = b ? ownAllowlist(b) : null;
  const pick = (k: 'resolution' | 'aspect' | 'quality' | 'scale' | 'types' | 'mode' | 'qualityOwn'): string[] => (own[k].length || !base ? own[k] : base[k]);
  const qualityOwn = own.qualityOwn.length || !base ? own.qualityOwn : base.qualityOwn; const res = pick('resolution');
  const quality = qualityOwn.length || res.length ? [...new Set([...qualityOwn, ...res])] : [];
  const types = pick('types'); const withAliases = types.length && types.some((t) => Object.values(CAMERA_ALIASES).includes(t)) ? [...types, ...Object.keys(CAMERA_ALIASES)] : types;
  const mode = pick('mode');
  const typesFree = !withAliases.length && (own.presets || !!base?.presets); // no list, but the tool takes plain type ids
  return { resolution: res, aspect: pick('aspect'), quality, scale: pick('scale'), types: withAliases, mode: mode.length ? mode : withAliases, qualityOwn, typesFree };
}
/** DP #20.3: the effective allowlists for /api/tools (tool.allowed), so clients never copy the rule. [] = the tool takes no value for that field
 *  (sending one is a 400); types/mode null = any plain id (letters, digits, - _ : .; tools without a list of their own). quality = the tool's own
 *  quality values (resolution aliases such as 720p are accepted too on tools with a resolution list); qualityLabels = their labels, same order. */
export function allowedFor(tool: ToolDef) {
  const a = allowlist(tool); const qOwn = a.qualityOwn.filter((x) => !RES_LIKE.test(x));
  return { resolution: a.resolution, aspect: a.aspect, quality: qOwn, qualityLabels: qOwn.map((x) => QUALITY_LABEL[x.toLowerCase()] ?? x), qualityAliases: qOwn.length || a.resolution.length ? a.resolution : [],
    scale: a.scale, types: a.types.length ? a.types : a.typesFree ? null : [], mode: a.mode.length ? a.mode : a.typesFree ? null : [] };
}
const same = (f: string, v: string, x: string) => (f === 'scale' ? Number(String(v).replace(/^x/i, '')) === Number(String(x).replace(/^x/i, '')) : v.toLowerCase() === x.toLowerCase());
const orList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}` : xs[0] ?? '');
const fail = (code: string, field: string, message: string, allowed: string[] | null, extra: Record<string, any> = {}) =>
  ({ error: message, errorType: 'validation' as const, code, field, allowed, ...extra, issues: [{ code, field, message }] });
const parseList = (v: unknown): string[] => { const s = String(v ?? '').trim(); if (!s) return []; try { const t = JSON.parse(s); return (Array.isArray(t) ? t : [t]).map((x) => String(x).trim()).filter(Boolean); } catch { return s.split(',').map((x) => x.trim()).filter(Boolean); } };
export const SIZE_MIN = 16; export const SIZE_MAX = 16384;
/** The allowed value a sent value stands for (case-insensitive; quality also takes its labels, e.g. Medium → med), or null. */
function canonical(f: string, v: string, list: string[]): string | null {
  const hit = list.find((x) => same(f, v, x)); if (hit != null) return hit;
  if (f === 'quality') { const lv = v.trim().toLowerCase(); return list.find((x) => (QUALITY_LABEL[x.toLowerCase()] ?? '').toLowerCase() === lv) ?? null; }
  return null;
}
/** Re-check 6 (BH P3): validates AND normalises in place (params[field] becomes the canonical allowed value, so types=GENERATE prices and
 *  submits as generate, mode=PRECISE as precise, quality=Medium as med). Callers pass the object they go on to use (quote query / submit fields). */
export function enumParamError(tool: ToolDef, params: Record<string, any>) {
  const allow = allowlist(tool);
  for (const f of FIELDS) {
    const key = f === 'aspect' ? (params.aspect != null && params.aspect !== '' ? 'aspect' : 'aspectRatio') : f;
    const raw = params[key]; if (raw == null || raw === '') continue;
    const v = String(raw).trim(); const list = allow[f];
    const notSetting = () => fail(`invalid_${f}`, f, `${LABEL[f]} isn't a setting for this tool. Leave it out.`, []);
    if (!list.length) return notSetting(); // DP #3: a field the tool ignores is rejected, never silently accepted
    const own = f === 'quality' ? allow.qualityOwn.filter((x) => !RES_LIKE.test(x)) : [];
    const c = canonical(f, v, list); if (c != null) { params[key] = c; continue; }
    const wellFormed = FORMAT[f].test(v);
    const named = wellFormed ? `${SHORT[f]} ${v} isn't supported here. ` : ''; // echo the value only when it's well-formed (never a NUL/odd string)
    if (f === 'quality') { // BH P3 #9 + re-check 6: labels for the tool's own quality values; a tool without any → not a setting (resolution aliases still accepted above)
      if (!own.length) return notSetting();
      const labels = own.map((x) => QUALITY_LABEL[x.toLowerCase()] ?? x);
      return fail('invalid_quality', f, `${named}Pick ${orList(labels)}.`, own, { allowedLabels: labels });
    }
    // BH8b / DP #27: well-formed aspect not on the list → unsupported_aspect {field, allowed, provider} (same as submit / per-engine); malformed → invalid_aspect
    const code = f === 'aspect' && wellFormed ? 'unsupported_aspect' : `invalid_${f}`;
    const prov = code === 'unsupported_aspect' ? (params.provider || params.model || (tool as any).providers?.[0] || null) : null;
    return fail(code, f, `${named}${LABEL[f]} must be ${list.length === 1 ? list[0] : `one of ${list.join(', ')}`}.`, list, code === 'unsupported_aspect' ? { provider: prov } : {});
  }
  for (const f of ['types', 'mode'] as const) { // BH P3 #6: allowlisted, never echoed; re-check 6: normalised to the listed id
    const raw = params[f]; if (raw == null || raw === '') continue;
    const vals = parseList(raw); const list = allow[f]; const code = f === 'types' ? 'invalid_type' : 'invalid_mode';
    if (!vals.length) { delete params[f]; continue; } // DP #20.2: an empty value or [] is "not sent" (quote and submit alike)
    const what = tool.id === 'camera' ? 'camera move' : tool.id === 'photo-fx' ? 'effect' : f === 'mode' ? 'mode' : 'type';
    if (!list.length && !allow.typesFree) return fail(code, f, `${f === 'mode' ? 'Mode' : 'Type'} isn't a setting for this tool. Leave it out.`, []); // DP #20.2 (Orbit Shot types=zz)
    const canon = vals.map((v) => (list.length ? canonical(f, v, list) : ID.test(v) ? v : null));
    if (canon.some((x) => x == null)) return fail(code, f, `That ${what} isn't on the list. Pick one from the list.`, list.length ? list : null);
    if (list.length) { const sraw = String(raw).trim(); params[f] = sraw.startsWith('[') ? JSON.stringify(canon) : sraw.startsWith('"') ? JSON.stringify(canon[0]) : canon.join(','); }
  }
  for (const f of ['width', 'height'] as const) { // BH P3 #5: a real clip size, or nothing
    const raw = params[f]; if (raw == null || raw === '') continue;
    const s = String(raw).trim(); const n = Number(s);
    if (!/^\d{1,5}$/.test(s) || n < SIZE_MIN || n > SIZE_MAX) return fail('invalid_size', f, `${f === 'width' ? 'Width' : 'Height'} must be a whole number of pixels from ${SIZE_MIN} to ${SIZE_MAX}.`, null, { min: SIZE_MIN, max: SIZE_MAX });
  }
  return null;
}

/** BH11/12: display labels for a job's quality and aspect (the result overlay never shows a raw 'quality' / 'auto'). The tool's own option
 *  label first (base tool for apps), then the quality synonyms; 'auto' → 'Auto (matches your input)'; ratios and resolutions as they are. null when the job has none. */
const optionLabelOf = (tool: ToolDef | null | undefined, name: string, value: string): string | null => {
  for (const t of [tool, tool ? baseOf(tool) : null]) {
    if (!t) continue;
    for (const i of [...((t as any).inputs ?? []), ...((t as any).fields ?? [])]) if (i?.name === name) {
      const o = (i.options ?? []).find((x: any) => typeof x === 'object' && String(x?.value).toLowerCase() === value.toLowerCase());
      if (o?.label) return String(o.label);
      const c = (i.choices ?? []).find((x: any) => String(x?.value).toLowerCase() === value.toLowerCase()); if (c?.label) return String(c.label);
    }
  }
  return null;
};
export const AUTO_ASPECT_LABEL = 'Auto (matches your input)';
const nice = (v: string) => (/^auto$/i.test(v) ? 'Auto' : /^(\d+p|\d+k|\d+:\d+|x?\d+(\.\d+)?)$/i.test(v) ? v : v.charAt(0).toUpperCase() + v.slice(1));
export function displayLabels(tool: ToolDef | null | undefined, input: Record<string, any> | null | undefined) {
  const i = input ?? {}; const q = i.quality != null && i.quality !== '' ? String(i.quality) : null; const a = i.aspect ?? i.aspectRatio; const av = a != null && a !== '' ? String(a) : null;
  let ql = q ? optionLabelOf(tool, 'quality', q) ?? QUALITY_LABEL[q.toLowerCase()] ?? nice(q) : null;
  if (ql && q && ql.toLowerCase() === 'quality' && q.toLowerCase() === 'quality') ql = 'Best quality'; // Mode: Quality | Fast → "Best quality", never the raw word
  const al = av ? (/^auto$/i.test(av) ? AUTO_ASPECT_LABEL : optionLabelOf(tool, 'aspect', av) ?? nice(av)) : null; // COPY-FIXES-PART2 P2-5: auto reads 'Auto (matches your input)'
  return { qualityLabel: ql, aspectLabel: al && /^auto$/i.test(al) ? AUTO_ASPECT_LABEL : al };
}
